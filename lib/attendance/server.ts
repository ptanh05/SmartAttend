import { and, asc, count, desc, eq, gte, inArray, ne, or, sql } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { generateChallengeValue, hashChallengeValue, verifyChallengeValue } from '@/lib/attendance/challenge'
import { canTransition } from '@/lib/attendance/session-state'
import { evaluateDevicePolicy, normalizeScore } from '@/lib/attendance/device-policy'
import { generateAcousticProofToken, verifyAcousticProofToken, type AcousticProofInput } from '@/lib/attendance/ultrasonic'
import { verifyWebAuthnAssertion, type WebAuthnAssertionInput } from '@/lib/auth/webauthn'
import type { AuthContext } from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendancePolicies,
  attendanceRecords,
  attendanceSessions,
  attendanceVerifications,
  auditLogs,
  classEnrollments,
  courseSections,
  courses,
  departments,
  devices,
  leaveRequests,
  notifications,
  organizationMemberships,
  suspiciousAttempts,
  users,
} from '@/lib/db/schema'
import type { AttendanceStatus, AttendanceWarningStatus, ClassSession, Course, DepartmentItem, SessionStatus } from '@/lib/types/domain'

function mapSessionStatus(status: string): SessionStatus {
  if (status === 'active') return 'live'
  return status as SessionStatus
}

export async function listCourses(organizationId: string, teacherId?: string): Promise<Course[]> {
  const courseConditions = [eq(courses.organizationId, organizationId), eq(courses.status, 'active')]
  if (teacherId) courseConditions.push(eq(courses.teacherId, teacherId))
  const rows = await db()
    .select()
    .from(courses)
    .where(and(...courseConditions))

  // Calculate live enrolled counts by counting distinct students across all sections of each course
  const enrollments = await db()
    .select({
      courseId: courseSections.courseId,
      studentId: classEnrollments.studentId,
    })
    .from(courseSections)
    .innerJoin(
      classEnrollments,
      and(
        eq(classEnrollments.sectionId, courseSections.id),
        eq(classEnrollments.status, 'active'),
      ),
    )
    .where(eq(courseSections.organizationId, organizationId))

  const countByCourse = new Map<string, Set<string>>()
  for (const en of enrollments) {
    if (!countByCourse.has(en.courseId)) {
      countByCourse.set(en.courseId, new Set())
    }
    countByCourse.get(en.courseId)!.add(en.studentId)
  }

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    department: row.department,
    teacherId: row.teacherId,
    enrolled: countByCourse.get(row.id)?.size ?? row.enrolled,
    color: row.color,
  }))
}

/**
 * Synchronizes scheduled attendance sessions for the given organization:
 * 1. Closes any active sessions that have exceeded the 3-minute attendance window
 *    or were left active from a previous day.
 * 2. 10 minutes before class: Dispatches reminder notification to all enrolled students
 *    informing them that attendance will automatically open from startsAt to startsAt+3m.
 * 3. At class start time (startsAt <= now < startsAt + 3m): Automatically activates
 *    the attendance session if section.autoStart is true and the session was not already started today.
 * 4. USER REQUIREMENT: When a teacher manually starts a session for today,
 *    any scheduled auto-start and 10-minute notification for today are cancelled / will not trigger.
 */
export async function syncScheduledAttendance(organizationId: string) {
  try {
    const ATTENDANCE_WINDOW_MS = 3 * 60 * 1000 // 3 minutes

    // Determine current time in Vietnam Time (UTC+7)
    const now = new Date()
    const vnOffsetMs = 7 * 60 * 60 * 1000
    const vnTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + vnOffsetMs)
    const day = vnTime.getDay()
    const currentDayOfWeek = day === 0 ? 7 : day // 1 = Monday, ..., 7 = Sunday
    const currentMinutes = vnTime.getHours() * 60 + vnTime.getMinutes()
    const todayStartUtc = new Date(Date.UTC(vnTime.getFullYear(), vnTime.getMonth(), vnTime.getDate()) - vnOffsetMs)
    const todayDateStr = `${vnTime.getFullYear()}-${String(vnTime.getMonth() + 1).padStart(2, '0')}-${String(vnTime.getDate()).padStart(2, '0')}`

    // 1. Auto-close any active sessions older than 3 minutes or from previous days
    const activeSessions = await db()
      .select({
        id: attendanceSessions.id,
        startedAt: attendanceSessions.startedAt,
        createdAt: attendanceSessions.createdAt,
        teacherId: attendanceSessions.teacherId,
        sectionId: attendanceSessions.sectionId,
      })
      .from(attendanceSessions)
      .where(
        and(
          eq(attendanceSessions.organizationId, organizationId),
          eq(attendanceSessions.status, 'active'),
        ),
      )

    for (const session of activeSessions) {
      const startTime = session.startedAt ? new Date(session.startedAt).getTime() : new Date(session.createdAt).getTime()
      if (Date.now() - startTime >= ATTENDANCE_WINDOW_MS || startTime < todayStartUtc.getTime()) {
        await db()
          .update(attendanceSessions)
          .set({ status: 'closed', closedAt: new Date() })
          .where(eq(attendanceSessions.id, session.id))

        await finalizeAbsentRecords(organizationId, session.id)

        await db().insert(auditLogs).values({
          id: nanoid(),
          organizationId,
          actorId: session.teacherId,
          actorName: 'Hệ thống tự động',
          action: 'Tự động đóng điểm danh sau 3 phút',
          target: session.id,
          severity: 'info',
          metadata: { reason: '3_minute_window_expired', autoClosed: true },
        }).catch(() => {})
      }
    }

    // 2. Query today's scheduled sections
    const todaySections = await db()
      .select({
        section: courseSections,
        course: courses,
      })
      .from(courseSections)
      .innerJoin(courses, eq(courseSections.courseId, courses.id))
      .where(
        and(
          eq(courseSections.organizationId, organizationId),
          eq(courseSections.dayOfWeek, currentDayOfWeek),
          eq(courseSections.status, 'scheduled'),
        ),
      )

    for (const { section, course } of todaySections) {
      // Semester date boundary check: ensure today is within [startDate, endDate]
      const sStart = section.startDate?.trim()
      const sEnd = section.endDate?.trim()
      if (sStart && todayDateStr < sStart) continue
      if (sEnd && todayDateStr > sEnd) continue

      if (!section.startsAt || typeof section.startsAt !== 'string') continue
      const [startH, startM] = section.startsAt.split(':').map(Number)
      if (isNaN(startH) || isNaN(startM)) continue

      const startsAtMinutes = startH * 60 + startM
      const notifyBeforeMinutes = startsAtMinutes - 10
      const autoCloseMinutes = startsAtMinutes + 3

      const endWindowH = Math.floor(autoCloseMinutes / 60)
      const endWindowM = autoCloseMinutes % 60
      const endWindowTimeStr = `${String(endWindowH).padStart(2, '0')}:${String(endWindowM).padStart(2, '0')}`

      // Check if ANY attendance session was already started or completed today for this section
      const sessionsToday = await db()
        .select({ id: attendanceSessions.id, status: attendanceSessions.status })
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.organizationId, organizationId),
            eq(attendanceSessions.sectionId, section.id),
            gte(attendanceSessions.createdAt, todayStartUtc),
          ),
        )

      // USER REQUIREMENT:
      // "khi giảng viên bật rồi thì lịch đã set từ trước kia sẽ không phát được nữa"
      // If a session has already been started today (either active or closed),
      // SKIP the scheduled 10-minute notification and scheduled auto-start!
      if (sessionsToday.length > 0) {
        continue
      }

      // 3. Within 10 minutes before class starts: Send advance notification to enrolled students
      if (currentMinutes >= notifyBeforeMinutes && currentMinutes < startsAtMinutes) {
        const notifTitle = `Thông báo mở điểm danh tự động: ${course.code} - ${course.name}`
        const existingNotif = await db()
          .select({ id: notifications.id })
          .from(notifications)
          .where(
            and(
              eq(notifications.organizationId, organizationId),
              gte(notifications.createdAt, todayStartUtc),
              eq(notifications.title, notifTitle),
            ),
          )
          .limit(1)

        if (existingNotif.length === 0) {
          const enrolled = await db()
            .select({ studentId: classEnrollments.studentId })
            .from(classEnrollments)
            .where(
              and(
                eq(classEnrollments.sectionId, section.id),
                eq(classEnrollments.status, 'active'),
              ),
            )

          const notifRecords = enrolled.map((e) => ({
            id: nanoid(),
            organizationId,
            userId: e.studentId,
            title: notifTitle,
            body: `Buổi học tại phòng ${section.room} bắt đầu lúc ${section.startsAt}. Mã điểm danh sẽ tự động mở từ ${section.startsAt} đến ${endWindowTimeStr} (kéo dài 3 phút). Sinh viên vui lòng chuẩn bị có mặt để điểm danh.`,
            createdAt: new Date(),
          }))

          if (notifRecords.length > 0) {
            await db().insert(notifications).values(notifRecords).catch(() => {})
          }
        }
      }

      // 4. Exactly at class start time (within 3 minutes): Auto-start session if autoStart is true
      if (section.autoStart && currentMinutes >= startsAtMinutes && currentMinutes < autoCloseMinutes) {
        const sessionId = nanoid()
        await db().insert(attendanceSessions).values({
          id: sessionId,
          organizationId,
          sectionId: section.id,
          courseId: section.courseId,
          teacherId: course.teacherId,
          status: 'active',
          startedAt: new Date(),
        })

        const autoAuth: AuthContext = {
          userId: course.teacherId,
          membershipId: '',
          organizationId,
          role: 'teacher',
          email: '',
          name: 'Hệ thống tự động',
          initials: 'HT',
          department: '',
          studentCode: null,
          mustChangePassword: false,
          organizationName: '',
          organizationPlan: '',
        }
        await rotateChallengeForSession(autoAuth, sessionId).catch(() => {})

        await db().insert(auditLogs).values({
          id: nanoid(),
          organizationId,
          actorId: course.teacherId,
          actorName: 'Hệ thống tự động',
          action: `Tự động mở điểm danh theo lịch (3 phút: ${section.startsAt} - ${endWindowTimeStr})`,
          target: sessionId,
          severity: 'info',
          metadata: { sectionId: section.id, autoStart: true, windowMinutes: 3 },
        }).catch(() => {})
      }
    }
  } catch (err) {
    console.error('Error in syncScheduledAttendance:', err)
  }
}

export async function listClassSessions(organizationId: string, studentId?: string, teacherId?: string): Promise<ClassSession[]> {
  await syncScheduledAttendance(organizationId)
  let enrolledSectionIds: Set<string> | null = null
  if (studentId) {
    const studentEnrollments = await db()
      .select({ sectionId: classEnrollments.sectionId })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.organizationId, organizationId),
          eq(classEnrollments.studentId, studentId),
          eq(classEnrollments.status, 'active'),
        ),
      )
    enrolledSectionIds = new Set(studentEnrollments.map((e) => e.sectionId))
    if (enrolledSectionIds.size === 0) return []
  }

  const conditions = [eq(courseSections.organizationId, organizationId)]
  if (enrolledSectionIds !== null) {
    conditions.push(inArray(courseSections.id, Array.from(enrolledSectionIds)))
  }
  if (teacherId) conditions.push(eq(courses.teacherId, teacherId))

  const rows = await db()
    .select({
      section: courseSections,
      courseId: courseSections.courseId,
      courseCode: courses.code,
      courseName: courses.name,
      session: attendanceSessions,
      challenge: attendanceChallenges.valueHash,
    })
    .from(courseSections)
    .leftJoin(courses, eq(courseSections.courseId, courses.id))
    .leftJoin(
      attendanceSessions,
      and(eq(attendanceSessions.sectionId, courseSections.id), inArray(attendanceSessions.status, ['active', 'draft', 'paused'])),
    )
    .leftJoin(
      attendanceChallenges,
      and(eq(attendanceChallenges.sessionId, attendanceSessions.id), eq(attendanceChallenges.status, 'active')),
    )
    .where(and(...conditions))

  const enrollments = await db()
    .select({
      sectionId: classEnrollments.sectionId,
      courseId: courseSections.courseId,
      studentId: classEnrollments.studentId,
    })
    .from(classEnrollments)
    .innerJoin(courseSections, eq(classEnrollments.sectionId, courseSections.id))
    .where(and(eq(classEnrollments.organizationId, organizationId), eq(classEnrollments.status, 'active')))

  const studentsByCourse = new Map<string, Set<string>>()
  for (const en of enrollments) {
    if (!studentsByCourse.has(en.courseId)) studentsByCourse.set(en.courseId, new Set())
    studentsByCourse.get(en.courseId)!.add(en.studentId)
  }

  const liveSessions = await db()
    .select({
      section: courseSections,
      session: attendanceSessions,
    })
    .from(attendanceSessions)
    .innerJoin(courseSections, eq(attendanceSessions.sectionId, courseSections.id))
    .where(and(eq(attendanceSessions.organizationId, organizationId), eq(attendanceSessions.status, 'active')))

  const liveSessionIds = liveSessions.map((item) => item.session.id)
  const isStudent = Boolean(studentId)
  const challengeBySession = new Map<string, string>()

  // Zero Client Trust (SEC-01): Do not load or leak active challenge codes or acoustic proof to students.
  if (!isStudent && liveSessionIds.length > 0) {
    const activeChallenges = await db()
      .select()
      .from(attendanceChallenges)
      .where(
        and(
          inArray(attendanceChallenges.sessionId, liveSessionIds),
          eq(attendanceChallenges.status, 'active'),
        ),
      )
      .orderBy(desc(attendanceChallenges.sequence))

    for (const ch of activeChallenges) {
      if (!challengeBySession.has(ch.sessionId)) {
        const plain = ch.code ?? (await getActiveChallengePlain(ch.sessionId))
        if (plain) challengeBySession.set(ch.sessionId, plain)
      }
    }
  }

  const seen = new Set<string>()
  const result: ClassSession[] = []

  for (const row of rows) {
    if (seen.has(row.section.id)) continue
    seen.add(row.section.id)

    const live = liveSessions.find((item) => item.section.id === row.section.id)
    const status = live ? 'live' : (row.section.status as SessionStatus)
    result.push({
      id: live?.session.id ?? row.section.id,
      sectionId: row.section.id,
      courseId: row.section.courseId,
      courseCode: row.courseCode ?? undefined,
      courseName: row.courseName ?? undefined,
      room: row.section.room,
      startsAt: row.section.startsAt,
      endsAt: row.section.endsAt,
      startDate: row.section.startDate,
      endDate: row.section.endDate,
      dayOfWeek: row.section.dayOfWeek,
      autoStart: row.section.autoStart,
      enrolledCount: studentsByCourse.get(row.section.courseId)?.size ?? 0,
      status,
      // For students, challenge is strictly masked to '------' and acousticProof is undefined
      challenge: isStudent ? '------' : (live ? challengeBySession.get(live.session.id) ?? '------' : '------'),
      acousticProof: undefined,
    })
  }

  return result
}

async function getPolicy(organizationId: string) {
  const rows = await db().select().from(attendancePolicies).where(eq(attendancePolicies.organizationId, organizationId))
  return rows[0] ?? { challengeTtlSeconds: 30, lateAfterMinutes: 10, requireTrustedDevice: false }
}

export async function getAttendancePolicy(organizationId: string) {
  return getPolicy(organizationId)
}

export async function updateAttendancePolicy(
  auth: AuthContext,
  data: {
    challengeTtlSeconds?: number
    lateAfterMinutes?: number
    requireTrustedDevice?: boolean
  },
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  const existing = await db()
    .select()
    .from(attendancePolicies)
    .where(eq(attendancePolicies.organizationId, auth.organizationId))

  if (existing[0]) {
    await db()
      .update(attendancePolicies)
      .set({
        challengeTtlSeconds: data.challengeTtlSeconds ?? existing[0].challengeTtlSeconds,
        lateAfterMinutes: data.lateAfterMinutes ?? existing[0].lateAfterMinutes,
        requireTrustedDevice: data.requireTrustedDevice ?? existing[0].requireTrustedDevice,
      })
      .where(eq(attendancePolicies.id, existing[0].id))
  } else {
    await db().insert(attendancePolicies).values({
      id: nanoid(),
      organizationId: auth.organizationId,
      challengeTtlSeconds: data.challengeTtlSeconds ?? 30,
      lateAfterMinutes: data.lateAfterMinutes ?? 10,
      requireTrustedDevice: data.requireTrustedDevice ?? false,
    })
  }

  await appendAudit(auth, 'Updated attendance policy', auth.organizationId, 'info')
  const updated = await getPolicy(auth.organizationId)
  return { ok: true as const, policy: updated }
}

export async function getActiveChallenge(sessionId: string) {
  const rows = await db()
    .select()
    .from(attendanceChallenges)
    .where(and(eq(attendanceChallenges.sessionId, sessionId), eq(attendanceChallenges.status, 'active')))
    .orderBy(desc(attendanceChallenges.sequence))
    .limit(1)
  return rows[0] ?? null
}

/**
 * The most recently issued challenge for a session, regardless of status.
 * Used to compute the next sequence so the replay-protection unique index
 * `(session_id, sequence)` is never violated after a challenge is consumed.
 */
async function getLatestChallenge(sessionId: string) {
  const rows = await db()
    .select()
    .from(attendanceChallenges)
    .where(eq(attendanceChallenges.sessionId, sessionId))
    .orderBy(desc(attendanceChallenges.sequence))
    .limit(1)
  return rows[0] ?? null
}

const challengePlainCache = new Map<string, { value: string; expiresAt: number }>()

export function cacheChallengePlain(sessionId: string, value: string, ttlSeconds: number) {
  challengePlainCache.set(sessionId, { value, expiresAt: Date.now() + ttlSeconds * 1000 })
}

async function getActiveChallengePlain(sessionId: string) {
  const cached = challengePlainCache.get(sessionId)
  if (cached && cached.expiresAt > Date.now()) return cached.value
  return null
}

export async function rotateChallengeForSession(auth: AuthContext, sessionId: string) {
  const sessionWithCourse = await db()
    .select({
      session: attendanceSessions,
      courseTeacherId: courses.teacherId,
    })
    .from(attendanceSessions)
    .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .where(
      and(
        eq(attendanceSessions.id, sessionId),
        eq(attendanceSessions.organizationId, auth.organizationId),
      ),
    )
    .limit(1)

  const sessionRow = sessionWithCourse[0]
  if (!sessionRow) return { ok: false as const, message: 'Session not found.' }

  if (auth.role === 'teacher') {
    const isOwner = sessionRow.session.teacherId === auth.userId || sessionRow.courseTeacherId === auth.userId
    if (!isOwner) {
      return { ok: false as const, message: 'Forbidden: You can only rotate challenges for sessions you teach.' }
    }
  }

  const session = sessionRow.session
  if (session.status !== 'active') return { ok: false as const, message: 'Session is not active.' }

  const policy = await getPolicy(auth.organizationId)
  const latest = await getLatestChallenge(sessionId)
  const active = await getActiveChallenge(sessionId)
  if (active) {
    await db()
      .update(attendanceChallenges)
      .set({ status: 'invalidated' })
      .where(eq(attendanceChallenges.id, active.id))
  }

  const value = generateChallengeValue()
  const sequence = (latest?.sequence ?? 0) + 1
  const expiresAt = new Date(Date.now() + policy.challengeTtlSeconds * 1000)

  await db().insert(attendanceChallenges).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    sessionId,
    sequence,
    code: value,
    valueHash: hashChallengeValue(value),
    status: 'active',
    expiresAt,
  })

  cacheChallengePlain(sessionId, value, policy.challengeTtlSeconds)

  await appendAudit(auth, 'Rotated session challenge', sessionId, 'info')

  const acousticProof = generateAcousticProofToken(sessionId, sequence)
  return { ok: true as const, challenge: value, acousticProof, expiresAt: expiresAt.toISOString() }
}

async function getSessionScoped(organizationId: string, sessionId: string) {
  const rows = await db()
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.organizationId, organizationId)))
  return rows[0] ?? null
}

export async function transitionSessionState(auth: AuthContext, sessionId: string, next: SessionStatus) {
  const sessionWithCourse = await db()
    .select({
      session: attendanceSessions,
      courseTeacherId: courses.teacherId,
    })
    .from(attendanceSessions)
    .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .where(
      and(
        eq(attendanceSessions.id, sessionId),
        eq(attendanceSessions.organizationId, auth.organizationId),
      ),
    )
    .limit(1)

  const sessionRow = sessionWithCourse[0]
  if (!sessionRow) return { ok: false as const, message: 'Session not found.' }

  if (auth.role === 'teacher') {
    const isOwner = sessionRow.session.teacherId === auth.userId || sessionRow.courseTeacherId === auth.userId
    if (!isOwner) {
      return { ok: false as const, message: 'Forbidden: You can only control sessions for courses or classes you teach.' }
    }
  }

  const session = sessionRow.session
  const currentNorm = (session.status === 'active' ? 'active' : session.status) as SessionStatus
  const nextNorm = (next === 'live' ? 'active' : next) as SessionStatus

  if (!canTransition(currentNorm, nextNorm)) {
    return { ok: false as const, message: `Cannot move a ${session.status} session to ${next}.` }
  }

  const updates: Partial<typeof attendanceSessions.$inferInsert> = {
    status: nextNorm,
  }

  if (nextNorm === 'active') updates.startedAt = new Date()
  if (nextNorm === 'closed' || nextNorm === 'expired') updates.closedAt = new Date()

  await db().update(attendanceSessions).set(updates).where(eq(attendanceSessions.id, sessionId))

  if (nextNorm === 'active') {
    await rotateChallengeForSession(auth, sessionId)
  }

  if (nextNorm === 'closed') {
    await finalizeAbsentRecords(auth.organizationId, sessionId)
  }

  await appendAudit(auth, `Session moved to ${next}`, sessionId, 'info')

  return { ok: true as const, status: next, message: `Session moved to ${next}.` }
}

export async function finalizeAbsentRecords(organizationId: string, sessionId: string) {
  const session = await getSessionScoped(organizationId, sessionId)
  if (!session) return

  const enrolled = await db()
    .select({ studentId: classEnrollments.studentId })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.sectionId, session.sectionId), eq(classEnrollments.status, 'active')))

  const existing = await db()
    .select({ studentId: attendanceRecords.studentId })
    .from(attendanceRecords)
    .where(eq(attendanceRecords.sessionId, sessionId))

  const existingIds = new Set(existing.map((row) => row.studentId))

  const approvedLeaves = await db()
    .select()
    .from(leaveRequests)
    .where(
      and(
        eq(leaveRequests.organizationId, organizationId),
        eq(leaveRequests.courseId, session.courseId),
        eq(leaveRequests.status, 'approved'),
      ),
    )

  const sessionDateStr = session.startedAt
    ? session.startedAt.toISOString().split('T')[0]
    : session.createdAt.toISOString().split('T')[0]

  const excusedStudentIds = new Set(
    approvedLeaves
      .filter((lr) => lr.sessionId === sessionId || lr.date.includes(sessionDateStr) || sessionDateStr.includes(lr.date))
      .map((lr) => lr.studentId),
  )

  const missingStudents = enrolled.filter((row) => !existingIds.has(row.studentId))

  const newRecords = missingStudents.map((row) => {
    const isExcused = excusedStudentIds.has(row.studentId)
    return {
      id: nanoid(),
      organizationId,
      sessionId,
      studentId: row.studentId,
      status: isExcused ? ('excused' as const) : ('absent' as const),
      verificationScore: isExcused ? 100 : 0,
      device: isExcused ? 'Đơn nghỉ phép duyệt' : null,
      flaggedReason: isExcused ? 'Đã được duyệt đơn nghỉ phép' : null,
      verifiedAt: isExcused ? new Date() : null,
    }
  })

  const absentRecords = newRecords.filter((r) => r.status === 'absent')

  if (newRecords.length > 0) {
    await db().insert(attendanceRecords).values(newRecords).onConflictDoNothing()

    // Dispatch Academic Warning notifications if student hits warning threshold (2 absences) or disqualified (3+ absences)
    for (const item of absentRecords) {
      try {
        const studentCourseRecords = await db()
          .select({ status: attendanceRecords.status })
          .from(attendanceRecords)
          .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
          .where(
            and(
              eq(attendanceRecords.organizationId, organizationId),
              eq(attendanceSessions.courseId, session.courseId),
              eq(attendanceRecords.studentId, item.studentId),
            ),
          )
        const unexcusedCount = studentCourseRecords.filter((r) => r.status === 'absent').length
        if (unexcusedCount === 2) {
          await db().insert(notifications).values({
            id: nanoid(),
            organizationId,
            userId: item.studentId,
            title: 'Cảnh báo chuyên cần: Nguy cơ cấm thi',
            body: 'Bạn đã vắng 2 buổi học. Theo quy chế đào tạo (nghỉ quá 20%), nếu vắng thêm bạn sẽ bị cấm thi kết thúc học phần.',
          })
        } else if (unexcusedCount >= 3) {
          await db().insert(notifications).values({
            id: nanoid(),
            organizationId,
            userId: item.studentId,
            title: 'Thông báo: Bị cấm thi học phần',
            body: `Bạn đã vắng ${unexcusedCount} buổi học (vượt quá 20% số tiết). Bạn không đủ điều kiện dự thi kết thúc học phần.`,
          })
        }
      } catch {
        /* ignore notification dispatch error */
      }
    }
  }
}

export type VerificationResult = {
  ok: boolean
  confidence: number
  message: string
  record?: {
    id: string
    sessionId: string
    studentId: string
    status: AttendanceStatus
    confidence: number
    verifiedAt?: string
    device: string
  }
}

export type VerificationOptions = {
  sessionId?: string
  method?: 'ultrasonic_faceid' | 'qr_scan' | 'manual_code' | string
  ultrasonicVerified?: boolean
  biometricVerified?: boolean
  webauthnAssertion?: WebAuthnAssertionInput
  acousticProof?: AcousticProofInput
}

export async function verifyAttendance(
  auth: AuthContext,
  input: string,
  deviceLabel = 'This browser',
  options?: VerificationOptions,
): Promise<VerificationResult> {
  if (auth.role !== 'student') {
    return { ok: false, confidence: 0, message: 'Only students can verify attendance.' }
  }

  if (!input || typeof input !== 'string' || !input.trim()) {
    return { ok: false, confidence: 0, message: 'Invalid challenge code.' }
  }

  const liveSessions = await db()
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.organizationId, auth.organizationId), eq(attendanceSessions.status, 'active')))

  if (liveSessions.length === 0) return { ok: false, confidence: 0, message: 'There is no live session right now.' }

  // If multiple sessions are active concurrently, resolve to the one specified by sessionId, acousticProof, or matching challenge
  const enrolledSectionIds = (
    await db()
      .select({ sectionId: classEnrollments.sectionId })
      .from(classEnrollments)
      .where(
        and(
          eq(classEnrollments.studentId, auth.userId),
          eq(classEnrollments.status, 'active'),
        ),
      )
  ).map((e) => e.sectionId)

  let live = options?.sessionId
    ? liveSessions.find((s) => s.id === options.sessionId)
    : options?.acousticProof?.sessionId
      ? liveSessions.find((s) => s.id === options.acousticProof!.sessionId)
      : undefined

  if (!live) {
    const candidateSessions = liveSessions.filter((s) => enrolledSectionIds.includes(s.sectionId))
    if (candidateSessions.length > 1) {
      for (const cand of candidateSessions) {
        const ch = await getActiveChallenge(cand.id)
        if (ch && ch.expiresAt >= new Date() && verifyChallengeValue(input, ch.valueHash)) {
          live = cand
          break
        }
      }
    }
    if (!live) {
      live = candidateSessions[0]
    }
  }

  if (!live) {
    live = liveSessions[0]
  }

  const enrolled = await db()
    .select()
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.sectionId, live.sectionId),
        eq(classEnrollments.studentId, auth.userId),
        eq(classEnrollments.status, 'active'),
      ),
    )

  if (!enrolled[0]) {
    return { ok: false, confidence: 0, message: 'You are not enrolled in this class session.' }
  }

  const challenge = await getActiveChallenge(live.id)
  if (!challenge || challenge.expiresAt < new Date()) {
    return { ok: false, confidence: 0, message: 'The current challenge has expired. Ask your teacher to rotate it.' }
  }

  if (!verifyChallengeValue(input, challenge.valueHash)) {
    return { ok: false, confidence: 22, message: 'That challenge is incorrect. Ask your teacher for the current code.' }
  }

  // 1. WebAuthn Cryptographic Assertion Verification
  let verifiedBiometric = false
  if (options?.webauthnAssertion) {
    const webauthnRes = await verifyWebAuthnAssertion(auth.userId, options.webauthnAssertion)
    if (!webauthnRes.ok) {
      return { ok: false, confidence: 0, message: webauthnRes.reason || 'Xác thực sinh trắc học WebAuthn thất bại.' }
    }
    verifiedBiometric = true
  }

  // 2. Ultrasonic Acoustic Proof Verification (Bound to session & challenge sequence)
  let verifiedUltrasonic = false
  if (options?.acousticProof) {
    const acousticRes = verifyAcousticProofToken(options.acousticProof, live.id, challenge.sequence)
    if (!acousticRes.ok) {
      return { ok: false, confidence: 0, message: acousticRes.reason || 'Xác thực sóng siêu âm phòng học không hợp lệ hoặc đã hết hạn.' }
    }
    verifiedUltrasonic = true
  }

  const policy = await getPolicy(auth.organizationId)
  const verifiedAt = new Date()
  const lateThresholdMs = (policy.lateAfterMinutes ?? 10) * 60 * 1000
  const isLate = Boolean(live.startedAt && verifiedAt.getTime() > live.startedAt.getTime() + lateThresholdMs)
  const status: AttendanceStatus = isLate ? 'late' : 'present'

  const deviceRows = await db()
    .select()
    .from(devices)
    .where(and(eq(devices.organizationId, auth.organizationId), eq(devices.studentId, auth.userId)))
  const currentDevice = deviceRows.find((d) => d.label === deviceLabel)
  const deviceDecision = evaluateDevicePolicy({
    hasTrustedDevice: Boolean(currentDevice?.trusted),
    hasSeenDevice: Boolean(currentDevice),
    requireTrustedDevice: policy.requireTrustedDevice,
  })

  if (!deviceDecision.allowed) {
    return {
      ok: false,
      confidence: deviceDecision.score,
      message: currentDevice
        ? 'Thiết bị này chưa được tin cậy. Vui lòng dùng thiết bị đã liên kết hoặc liên hệ quản trị viên để xác nhận thiết bị.'
        : 'Thiết bị này chưa được liên kết với tài khoản sinh viên. Vui lòng liên kết thiết bị trước khi điểm danh.',
    }
  }

  // Duplicate check-in idempotency: If student is already marked present or excused, return existing record
  const existing = await db()
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.sessionId, live.id), eq(attendanceRecords.studentId, auth.userId)))

  if (existing[0] && (existing[0].status === 'present' || existing[0].status === 'late' || existing[0].status === 'excused')) {
    return {
      ok: true,
      confidence: existing[0].verificationScore,
      message: 'Bạn đã hoàn tất điểm danh cho buổi học này rồi.',
      record: {
        id: existing[0].id,
        sessionId: live.id,
        studentId: auth.userId,
        status: existing[0].status as AttendanceStatus,
        confidence: existing[0].verificationScore,
        verifiedAt: existing[0].verifiedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        device: existing[0].device ?? deviceLabel,
      },
    }
  }

  // Award 100% verification score ONLY when verified with both in-room acoustic proof & cryptographic biometric assertion.
  // Naked client booleans without cryptographic proof are strictly neutralized under Zero Client Trust.
  const isUltrasonicBiometric = Boolean(verifiedUltrasonic && verifiedBiometric)
  const verificationScore = isUltrasonicBiometric ? 100 : normalizeScore(deviceDecision.score)

  let finalRecordId = existing[0]?.id ?? nanoid()

  if (existing[0]) {
    await db()
      .update(attendanceRecords)
      .set({
        status,
        verificationScore,
        verifiedAt,
        device: deviceLabel,
      })
      .where(eq(attendanceRecords.id, finalRecordId))
  } else {
    const upsertRows = await db()
      .insert(attendanceRecords)
      .values({
        id: finalRecordId,
        organizationId: auth.organizationId,
        sessionId: live.id,
        studentId: auth.userId,
        status,
        verificationScore,
        verifiedAt,
        device: deviceLabel,
      })
      .onConflictDoUpdate({
        target: [attendanceRecords.sessionId, attendanceRecords.studentId],
        set: {
          status,
          verificationScore,
          verifiedAt,
          device: deviceLabel,
        },
      })
      .returning({ id: attendanceRecords.id })

    if (upsertRows[0]?.id) {
      finalRecordId = upsertRows[0].id
    }
  }

  // Update consumedAt timestamp on the challenge while keeping it active for other students in the room
  await db()
    .update(attendanceChallenges)
    .set({ consumedAt: verifiedAt })
    .where(eq(attendanceChallenges.id, challenge.id))

  const verificationMethod = options?.method ?? (isUltrasonicBiometric ? 'ultrasonic_faceid' : 'manual_code')

  await db().insert(attendanceVerifications).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    attendanceRecordId: finalRecordId,
    challengeId: challenge.id,
    method: verificationMethod,
    result: 'accepted',
    metadata: {
      device: deviceLabel,
      score: verificationScore,
      reason: deviceDecision.reason,
      ultrasonic: verifiedUltrasonic,
      biometric: verifiedBiometric,
      proofVerified: isUltrasonicBiometric,
    },
  })

  await db().insert(notifications).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    userId: auth.userId,
    title: isUltrasonicBiometric ? 'Xác thực Siêu âm & Sinh trắc học thành công' : 'Attendance confirmed',
    body: isUltrasonicBiometric
      ? 'Điểm danh hoàn tất: Vị trí phòng học và định danh sinh viên đã được ghi nhận.'
      : 'Your attendance was verified successfully.',
  })

  await appendAudit(auth, `Verified attendance (${verificationMethod})`, live.id, 'info')

  // Track/update the device used for this verification.
  // SEC: only the device that actually matches the reported label may be
  // promoted to "trusted". Falling back to an unrelated row would let a
  // student check in from a second device and silently trust the first one.
  const knownDevice = deviceRows.find((device) => device.label === deviceLabel)
  if (knownDevice) {
    await db().update(devices).set({ trusted: true, lastSeenAt: verifiedAt }).where(eq(devices.id, knownDevice.id))
  } else {
    await db().insert(devices).values({
      id: nanoid(),
      organizationId: auth.organizationId,
      studentId: auth.userId,
      label: deviceLabel,
      trusted: true,
      lastSeenAt: verifiedAt,
    })
  }

  // Always surface risky verifications to reviewers when device is suspicious
  if (deviceDecision.suspicious) {
    await db().insert(suspiciousAttempts).values({
      id: nanoid(),
      organizationId: auth.organizationId,
      attendanceRecordId: finalRecordId,
      reason: `Verification from a non-trusted device under the trusted-device policy (${deviceDecision.reason}).`,
      status: 'open',
    })
  }

  const message = isUltrasonicBiometric
    ? 'Xác thực sinh trắc học và sóng siêu âm thành công! Điểm danh đã được ghi nhận.'
    : deviceDecision.suspicious
      ? 'Your attendance is recorded but it is flagged for review because the device is not trusted.'
      : 'Identity and session verified. Your attendance is recorded.'

  return {
    ok: true,
    confidence: verificationScore,
    message,
    record: {
      id: finalRecordId,
      sessionId: live.id,
      studentId: auth.userId,
      status,
      confidence: verificationScore,
      verifiedAt: verifiedAt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      device: deviceLabel,
    },
  }
}

export async function listRecords(auth: AuthContext, studentId?: string) {
  const targetStudent = auth.role === 'student' ? auth.userId : studentId
  const conditions = [eq(attendanceRecords.organizationId, auth.organizationId)]
  if (targetStudent) {
    conditions.push(eq(attendanceRecords.studentId, targetStudent))
  }

  // SEC-12: Teachers must only see attendance records of students enrolled in
  // the classes they teach — never the whole organization roster.
  if (auth.role === 'teacher') {
    const ownedSectionIds = await listOwnedSectionIds(auth)
    if (ownedSectionIds.size === 0) return []

    const ownedSessionIds = (
      await db()
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(
          and(
            eq(attendanceSessions.organizationId, auth.organizationId),
            inArray(attendanceSessions.sectionId, Array.from(ownedSectionIds)),
          ),
        )
    ).map((r) => r.id)

    if (ownedSessionIds.length === 0) return []
    conditions.push(inArray(attendanceRecords.sessionId, ownedSessionIds))
  }

  const rows = await db()
    .select()
    .from(attendanceRecords)
    .where(and(...conditions))
    .orderBy(desc(attendanceRecords.createdAt))

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.sessionId,
    studentId: row.studentId,
    status: row.status as AttendanceStatus,
    confidence: row.verificationScore,
    verifiedAt: row.verifiedAt?.toISOString(),
    device: row.device ?? '',
    flaggedReason: row.flaggedReason ?? undefined,
  }))
}

export type ReportRecordRow = {
  studentName: string
  studentEmail: string
  courseCode: string
  courseName: string
  room: string
  status: string
  score: number
  verifiedAt: string | null
  device: string
}

/**
 * Attendance rows enriched with student, course and section details, used to
 * build CSV exports. Scoped to the authenticated organization.
 */
export async function listReportRecords(auth: AuthContext, courseId?: string): Promise<ReportRecordRow[]> {
  const conditions = [eq(attendanceRecords.organizationId, auth.organizationId)]
  // Enforce teacher authorization boundary: teachers can only view reports for courses they teach
  if (auth.role === 'teacher') {
    conditions.push(eq(courses.teacherId, auth.userId))
  }
  if (courseId) conditions.push(eq(courses.id, courseId))

  const rows = await db()
    .select({
      record: attendanceRecords,
      student: users,
      section: courseSections,
      course: courses,
    })
    .from(attendanceRecords)
    .innerJoin(users, eq(attendanceRecords.studentId, users.id))
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .innerJoin(courseSections, eq(attendanceSessions.sectionId, courseSections.id))
    .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .where(and(...conditions))
    .orderBy(desc(attendanceRecords.createdAt))

  return rows.map(({ record, student, section, course }) => ({
    studentName: student.name,
    studentEmail: student.email,
    courseCode: course.code,
    courseName: course.name,
    room: section.room,
    status: record.status,
    score: record.verificationScore,
    verifiedAt: record.verifiedAt ? record.verifiedAt.toISOString() : null,
    device: record.device ?? '',
  }))
}

export async function getLiveSessionDetails(auth: AuthContext, specificSessionId?: string) {
  // Live session management details are restricted to teachers and administrators; students cannot inspect live session controls
  if (auth.role === 'student') return null

  await syncScheduledAttendance(auth.organizationId)

  let whereClause = specificSessionId
    ? and(eq(attendanceSessions.organizationId, auth.organizationId), eq(attendanceSessions.id, specificSessionId))
    : and(eq(attendanceSessions.organizationId, auth.organizationId), eq(attendanceSessions.status, 'active'))

  // SEC-07: Scope live session retrieval by teacherId to prevent cross-teacher collision
  if (auth.role === 'teacher') {
    whereClause = and(
      whereClause,
      or(
        eq(attendanceSessions.teacherId, auth.userId),
        eq(courses.teacherId, auth.userId),
      ),
    )
  }

  const rows = await db()
    .select({
      session: attendanceSessions,
      section: courseSections,
      course: courses,
    })
    .from(attendanceSessions)
    .innerJoin(courseSections, eq(attendanceSessions.sectionId, courseSections.id))
    .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .where(whereClause)
    .limit(1)

  const row = rows[0]
  if (!row) return null

  // 3-minute attendance window enforcement
  const ATTENDANCE_WINDOW_MS = 3 * 60 * 1000
  const sessionStartTime = row.session.startedAt ? new Date(row.session.startedAt).getTime() : new Date(row.session.createdAt).getTime()
  const elapsedMs = Date.now() - sessionStartTime

  if (row.session.status === 'active' && elapsedMs >= ATTENDANCE_WINDOW_MS) {
    try {
      await db()
        .update(attendanceSessions)
        .set({ status: 'closed', closedAt: new Date() })
        .where(eq(attendanceSessions.id, row.session.id))
      await finalizeAbsentRecords(auth.organizationId, row.session.id)
    } catch (err) {
      console.error('Failed to auto-close expired session in getLiveSessionDetails', err)
    }
    return null
  }

  const remainingSeconds = Math.max(0, Math.floor((ATTENDANCE_WINDOW_MS - elapsedMs) / 1000))

  const activeChallengeRow = await getActiveChallenge(row.session.id)
  let challenge = activeChallengeRow?.code ?? (await getActiveChallengePlain(row.session.id))
  let challengeExpiresAt: string | undefined

  const isExpired = activeChallengeRow && new Date(activeChallengeRow.expiresAt).getTime() <= Date.now()

  if (activeChallengeRow && !isExpired && challenge) {
    challengeExpiresAt = activeChallengeRow.expiresAt.toISOString()
  } else {
    try {
      const rotated = await rotateChallengeForSession(auth, row.session.id)
      challenge = rotated.ok ? rotated.challenge : '------'
      if (rotated.ok && rotated.expiresAt) {
        challengeExpiresAt = rotated.expiresAt
      }
    } catch {
      challenge = '------'
    }
  }

  const recordRows = await db()
    .select({
      record: attendanceRecords,
      student: users,
    })
    .from(attendanceRecords)
    .innerJoin(users, eq(attendanceRecords.studentId, users.id))
    .where(eq(attendanceRecords.sessionId, row.session.id))

  // Also query all enrolled students in this section for quick roll call
  const enrolledStudents = await db()
    .select({
      student: users,
      membership: organizationMemberships,
    })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.studentId, users.id))
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, classEnrollments.studentId),
        eq(organizationMemberships.organizationId, auth.organizationId),
      ),
    )
    .where(
      and(
        eq(classEnrollments.sectionId, row.section.id),
        eq(classEnrollments.status, 'active'),
      ),
    )

  const recordMap = new Map(recordRows.map((r) => [r.record.studentId, r]))
  const mergedRecords = enrolledStudents.map(({ student, membership }) => {
    const existing = recordMap.get(student.id)
    if (existing) {
      return {
        id: existing.record.id,
        studentName: student.name,
        studentCode: membership?.studentCode ?? '',
        studentId: student.id,
        status: existing.record.status,
        confidence: existing.record.verificationScore,
        verifiedAt: existing.record.verifiedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—',
        device: existing.record.device ?? '—',
      }
    }
    return {
      id: `unmarked_${student.id}`,
      studentName: student.name,
      studentCode: membership?.studentCode ?? '',
      studentId: student.id,
      status: 'unmarked',
      confidence: 0,
      verifiedAt: 'Chưa điểm danh',
      device: 'Chưa có thiết bị',
    }
  })

  const finalRecords = mergedRecords.length > 0
    ? mergedRecords
    : recordRows.map(({ record, student }) => ({
        id: record.id,
        studentName: student.name,
        studentCode: '',
        studentId: student.id,
        status: record.status,
        confidence: record.verificationScore,
        verifiedAt: record.verifiedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—',
        device: record.device ?? '—',
      }))

  return {
    sessionId: row.session.id,
    courseCode: row.course.code,
    courseName: row.course.name,
    room: row.section.room,
    startsAt: row.section.startsAt,
    endsAt: row.section.endsAt,
    dayOfWeek: row.section.dayOfWeek,
    challenge,
    challengeExpiresAt,
    startedAt: row.session.startedAt ? row.session.startedAt.toISOString() : row.session.createdAt.toISOString(),
    remainingSeconds,
    durationSeconds: 180,
    records: finalRecords,
  }
}

/**
 * Resolves the class sections a teacher is allowed to administer.
 *
 * A teacher owns a section when they are the assigned lecturer of the parent
 * course (`courses.teacherId`). Administrators are not restricted and receive
 * every section of their organization.
 */
async function listOwnedSectionIds(auth: AuthContext): Promise<Set<string>> {
  if (auth.role === 'admin') {
    const rows = await db()
      .select({ id: courseSections.id })
      .from(courseSections)
      .where(eq(courseSections.organizationId, auth.organizationId))
    return new Set(rows.map((r) => r.id))
  }

  const rows = await db()
    .select({ id: courseSections.id })
    .from(courseSections)
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(
      and(
        eq(courseSections.organizationId, auth.organizationId),
        eq(courses.teacherId, auth.userId),
      ),
    )
  return new Set(rows.map((r) => r.id))
}

export async function getOrCreateLiveSession(auth: AuthContext, sectionId: string) {
  const sectionRows = await db()
    .select({
      section: courseSections,
      teacherId: courses.teacherId,
    })
    .from(courseSections)
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.organizationId, auth.organizationId)))
    .limit(1)

  const sectionRow = sectionRows[0]
  if (!sectionRow) return null

  // Ensure teacher can only create/retrieve live sessions for their own assigned courses
  if (auth.role === 'teacher' && sectionRow.teacherId !== auth.userId) {
    return null
  }

  const section = sectionRow.section

  const existing = await db()
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.sectionId, sectionId),
        eq(attendanceSessions.organizationId, auth.organizationId),
        inArray(attendanceSessions.status, ['active', 'draft', 'paused']),
      ),
    )

  if (existing[0]) return existing[0].id

  const id = nanoid()
  await db().insert(attendanceSessions).values({
    id,
    organizationId: auth.organizationId,
    sectionId,
    courseId: section.courseId,
    teacherId: auth.userId,
    status: 'draft',
  })

  return id
}

export async function listUsers(auth: AuthContext, role?: string) {
  const conditions = [eq(organizationMemberships.organizationId, auth.organizationId)]
  if (role) {
    conditions.push(eq(organizationMemberships.role, role))
  }

  // SEC-15: Teachers must not receive the full organization directory. They only
  // see the students enrolled in the classes they teach (plus themselves).
  if (auth.role === 'teacher') {
    const ownedSectionIds = await listOwnedSectionIds(auth)
    const ownedStudentIds = new Set<string>()

    if (ownedSectionIds.size > 0) {
      const enrolled = await db()
        .select({ studentId: classEnrollments.studentId })
        .from(classEnrollments)
        .where(
          and(
            eq(classEnrollments.organizationId, auth.organizationId),
            eq(classEnrollments.status, 'active'),
            inArray(classEnrollments.sectionId, Array.from(ownedSectionIds)),
          ),
        )
      for (const row of enrolled) ownedStudentIds.add(row.studentId)
    }

    const allowedUserIds = new Set<string>([auth.userId, ...ownedStudentIds])
    if (allowedUserIds.size === 0) return []

    conditions.push(inArray(organizationMemberships.userId, Array.from(allowedUserIds)))
  }

  const rows = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      role: organizationMemberships.role,
      initials: users.initials,
      department: organizationMemberships.department,
      studentCode: organizationMemberships.studentCode,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(organizationMemberships.userId, users.id))
    .where(and(...conditions))
    .orderBy(desc(organizationMemberships.createdAt), desc(users.createdAt))

  return rows.map((row) => ({
    id: row.id,
    organizationId: auth.organizationId,
    name: row.name,
    email: row.email,
    role: row.role,
    initials: row.initials,
    department: row.department ?? '',
    studentCode: row.studentCode ?? '',
  }))
}

export async function listSectionStudents(auth: AuthContext, sectionId: string) {
  const rows = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      studentCode: organizationMemberships.studentCode,
      department: organizationMemberships.department,
      status: classEnrollments.status,
    })
    .from(classEnrollments)
    .innerJoin(users, eq(classEnrollments.studentId, users.id))
    .innerJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, users.id),
        eq(organizationMemberships.organizationId, auth.organizationId),
      ),
    )
    .where(
      and(
        eq(classEnrollments.sectionId, sectionId),
        eq(classEnrollments.organizationId, auth.organizationId),
      ),
    )
    .orderBy(asc(organizationMemberships.studentCode), asc(users.name))

  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    studentCode: r.studentCode ?? '',
    department: r.department ?? '',
    status: r.status,
  }))
}

export async function enrollStudentsToSection(
  auth: AuthContext,
  sectionId: string,
  identifiers: string[],
): Promise<{ ok: boolean; enrolledCount: number; message?: string }> {
  if (!['teacher', 'admin', 'staff'].includes(auth.role)) {
    return { ok: false, enrolledCount: 0, message: 'Permission denied.' }
  }

  const sec = await db()
    .select({ id: courseSections.id, courseId: courseSections.courseId, teacherId: courses.teacherId })
    .from(courseSections)
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.organizationId, auth.organizationId)))
    .limit(1)

  if (!sec[0]) {
    return { ok: false, enrolledCount: 0, message: 'Course section not found.' }
  }

  if (auth.role === 'teacher' && sec[0].teacherId !== auth.userId) {
    return { ok: false, enrolledCount: 0, message: 'Forbidden: You can only manage enrollment for courses you teach.' }
  }

  const cleanIdentifiers = identifiers.map((id) => id.trim()).filter(Boolean)
  if (cleanIdentifiers.length === 0) {
    return { ok: false, enrolledCount: 0, message: 'No student identifiers provided.' }
  }

  const orgStudents = await db()
    .select({
      userId: organizationMemberships.userId,
      studentCode: organizationMemberships.studentCode,
    })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, auth.organizationId),
        eq(organizationMemberships.role, 'student'),
      ),
    )

  const identifierSet = new Set(cleanIdentifiers.map((i) => i.toLowerCase()))
  const matchedUserIds = new Set<string>()

  for (const st of orgStudents) {
    if (identifierSet.has(st.userId.toLowerCase()) || (st.studentCode && identifierSet.has(st.studentCode.toLowerCase()))) {
      matchedUserIds.add(st.userId)
    }
  }

  if (matchedUserIds.size === 0) {
    return { ok: false, enrolledCount: 0, message: 'No matching students found in this organization.' }
  }

  let enrolledCount = 0
  for (const studentId of matchedUserIds) {
    await db()
      .insert(classEnrollments)
      .values({
        sectionId,
        studentId,
        organizationId: auth.organizationId,
        status: 'active',
      })
      .onConflictDoUpdate({
        target: [classEnrollments.sectionId, classEnrollments.studentId],
        set: { status: 'active' },
      })
    enrolledCount++
  }

  try {
    const countRes = await db()
      .select({ studentId: classEnrollments.studentId })
      .from(classEnrollments)
      .innerJoin(courseSections, eq(classEnrollments.sectionId, courseSections.id))
      .where(and(eq(courseSections.courseId, sec[0].courseId), eq(classEnrollments.status, 'active')))
    const distinctCount = new Set(countRes.map((r) => r.studentId)).size
    await db().update(courses).set({ enrolled: distinctCount }).where(eq(courses.id, sec[0].courseId))
  } catch {
    /* ignore sync error */
  }

  await appendAudit(auth, `Ghi danh ${enrolledCount} sinh viên vào lớp học phần`, sectionId, 'info')
  return { ok: true, enrolledCount }
}

export async function removeStudentFromSection(
  auth: AuthContext,
  sectionId: string,
  studentId: string,
): Promise<{ ok: boolean; message?: string }> {
  if (!['teacher', 'admin', 'staff'].includes(auth.role)) {
    return { ok: false, message: 'Permission denied.' }
  }

  const sec = await db()
    .select({ id: courseSections.id, courseId: courseSections.courseId, teacherId: courses.teacherId })
    .from(courseSections)
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.organizationId, auth.organizationId)))
    .limit(1)

  if (!sec[0]) {
    return { ok: false, message: 'Course section not found.' }
  }

  if (auth.role === 'teacher' && sec[0].teacherId !== auth.userId) {
    return { ok: false, message: 'Forbidden: You can only manage enrollment for courses you teach.' }
  }

  const courseSectionIds = await db()
    .select({ id: courseSections.id })
    .from(courseSections)
    .where(and(eq(courseSections.courseId, sec[0].courseId), eq(courseSections.organizationId, auth.organizationId)))

  // A roster belongs to the course, so removing a student from one section
  // removes that student from every scheduled section of the same course.
  await db()
    .delete(classEnrollments)
    .where(
      and(
        inArray(classEnrollments.sectionId, courseSectionIds.map((section) => section.id)),
        eq(classEnrollments.studentId, studentId),
        eq(classEnrollments.organizationId, auth.organizationId),
      ),
    )

  try {
    const countRes = await db()
      .select({ studentId: classEnrollments.studentId })
      .from(classEnrollments)
      .innerJoin(courseSections, eq(classEnrollments.sectionId, courseSections.id))
      .where(and(eq(courseSections.courseId, sec[0].courseId), eq(classEnrollments.status, 'active')))
    const distinctCount = new Set(countRes.map((r) => r.studentId)).size
    await db().update(courses).set({ enrolled: distinctCount }).where(eq(courses.id, sec[0].courseId))
  } catch {
    /* ignore sync error */
  }

  await appendAudit(auth, `Xóa sinh viên ${studentId} khỏi lớp học phần`, sectionId, 'info')
  return { ok: true }
}

export async function searchAvailableStudentsForSection(
  auth: AuthContext,
  sectionId: string,
  query: string,
) {
  const q = query.trim().toLowerCase()
  if (!q) return []

  const enrolled = await db()
    .select({ studentId: classEnrollments.studentId })
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.sectionId, sectionId),
        eq(classEnrollments.organizationId, auth.organizationId),
        eq(classEnrollments.status, 'active'),
      ),
    )
  const enrolledSet = new Set(enrolled.map((e) => e.studentId))

  const allStudents = await db()
    .select({
      id: users.id,
      name: users.name,
      email: users.email,
      studentCode: organizationMemberships.studentCode,
      department: organizationMemberships.department,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(organizationMemberships.userId, users.id))
    .where(
      and(
        eq(organizationMemberships.organizationId, auth.organizationId),
        eq(organizationMemberships.role, 'student'),
      ),
    )

  return allStudents
    .filter(
      (s) =>
        !enrolledSet.has(s.id) &&
        ((s.studentCode && s.studentCode.toLowerCase().includes(q)) ||
          s.name.toLowerCase().includes(q) ||
          s.email.toLowerCase().includes(q) ||
          (s.department && s.department.toLowerCase().includes(q))),
    )
    .slice(0, 20)
}

export async function listNotifications(auth: AuthContext) {
  const rows = await db()
    .select()
    .from(notifications)
    .where(and(eq(notifications.organizationId, auth.organizationId), eq(notifications.userId, auth.userId)))
    .orderBy(desc(notifications.createdAt))

  return rows.map((row) => ({
    id: row.id,
    title: row.title,
    body: row.body,
    read: Boolean(row.readAt),
    createdAt: formatRelativeTime(row.createdAt),
  }))
}

export async function markNotificationsRead(auth: AuthContext, ids?: string[]) {
  const where = ids?.length
    ? and(
        eq(notifications.organizationId, auth.organizationId),
        eq(notifications.userId, auth.userId),
        inArray(notifications.id, ids),
      )
    : and(
        eq(notifications.organizationId, auth.organizationId),
        eq(notifications.userId, auth.userId),
      )

  await db().update(notifications).set({ readAt: new Date() }).where(where)
}

export async function listAuditLogs(auth: AuthContext) {
  const rows = await db()
    .select()
    .from(auditLogs)
    .where(eq(auditLogs.organizationId, auth.organizationId))
    .orderBy(desc(auditLogs.createdAt))
    .limit(50)

  return rows.map((row) => ({
    id: row.id,
    actor: row.actorName,
    action: row.action,
    target: row.target,
    createdAt: formatRelativeTime(row.createdAt),
    severity: row.severity as 'info' | 'warning',
  }))
}

export async function listSuspicious(auth: AuthContext) {
  const conditions = [
    eq(suspiciousAttempts.organizationId, auth.organizationId),
    eq(suspiciousAttempts.status, 'open'),
  ]

  if (auth.role === 'teacher') {
    conditions.push(eq(courses.teacherId, auth.userId))
  }

  const rows = await db()
    .select({
      suspicious: suspiciousAttempts,
      record: attendanceRecords,
      student: users,
      membership: organizationMemberships,
    })
    .from(suspiciousAttempts)
    .innerJoin(attendanceRecords, eq(suspiciousAttempts.attendanceRecordId, attendanceRecords.id))
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .innerJoin(users, eq(attendanceRecords.studentId, users.id))
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, users.id),
        eq(organizationMemberships.organizationId, auth.organizationId),
      ),
    )
    .where(and(...conditions))
    .orderBy(desc(suspiciousAttempts.createdAt))

  return rows.map(({ suspicious, record, student, membership }) => ({
    id: suspicious.id,
    attendanceRecordId: suspicious.attendanceRecordId,
    studentName: student?.name ?? 'Sinh viên',
    studentCode: membership?.studentCode ?? '',
    reason: suspicious.reason,
    status: suspicious.status,
    device: record?.device ?? 'Thiết bị chưa xác thực',
    createdAt: formatRelativeTime(suspicious.createdAt),
  }))
}

export async function resolveSuspiciousAttempt(
  auth: AuthContext,
  attemptId: string,
  action: 'approved' | 'dismissed',
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  const rows = await db()
    .select({
      suspicious: suspiciousAttempts,
      record: attendanceRecords,
      course: courses,
    })
    .from(suspiciousAttempts)
    .leftJoin(attendanceRecords, eq(suspiciousAttempts.attendanceRecordId, attendanceRecords.id))
    .leftJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .leftJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .where(and(eq(suspiciousAttempts.id, attemptId), eq(suspiciousAttempts.organizationId, auth.organizationId)))

  const target = rows[0]
  if (!target) return { ok: false as const, message: 'Suspicious attempt not found.' }

  if (auth.role === 'teacher' && target.course && target.course.teacherId !== auth.userId) {
    return { ok: false as const, message: 'Permission denied: You can only review attempts for courses you teach.' }
  }

  const now = new Date()

  await db()
    .update(suspiciousAttempts)
    .set({
      status: 'resolved',
      reviewedBy: auth.userId,
      reviewedAt: now,
    })
    .where(eq(suspiciousAttempts.id, attemptId))

  if (action === 'dismissed' && target.suspicious.attendanceRecordId) {
    await db()
      .update(attendanceRecords)
      .set({
        status: 'absent',
        verificationScore: 0,
        flaggedReason: `Bác bỏ bởi ${auth.name}: ${target.suspicious.reason}`,
      })
      .where(eq(attendanceRecords.id, target.suspicious.attendanceRecordId))
  } else if (action === 'approved' && target.suspicious.attendanceRecordId) {
    await db()
      .update(attendanceRecords)
      .set({
        verificationScore: 90,
        flaggedReason: `Được phê duyệt bởi ${auth.name}`,
      })
      .where(eq(attendanceRecords.id, target.suspicious.attendanceRecordId))
  }

  await db().insert(auditLogs).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    actorId: auth.userId,
    actorName: auth.name,
    action: `Resolved suspicious attempt ${attemptId} (${action})`,
    target: attemptId,
    severity: action === 'dismissed' ? 'warning' : 'info',
  })

  return { ok: true as const }
}

export async function getOrganizationMetrics(auth: AuthContext, cachedSuspiciousCount?: number) {
  const [studentRows, teacherRows, liveRows, recordRows, suspiciousCount] = await Promise.all([
    db()
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.role, 'student'))),
    db()
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.role, 'teacher'))),
    db()
      .select({ id: attendanceSessions.id })
      .from(attendanceSessions)
      .where(and(eq(attendanceSessions.organizationId, auth.organizationId), eq(attendanceSessions.status, 'active'))),
    db()
      .select({ status: attendanceRecords.status })
      .from(attendanceRecords)
      .where(eq(attendanceRecords.organizationId, auth.organizationId)),
    cachedSuspiciousCount !== undefined ? Promise.resolve(cachedSuspiciousCount) : listSuspicious(auth).then((r) => r.length),
  ])

  const attended = recordRows.filter((row) => row.status === 'present' || row.status === 'late').length
  const rate = recordRows.length ? Math.round((attended / recordRows.length) * 1000) / 10 : 0

  return {
    students: studentRows.length,
    teachers: teacherRows.length,
    activeSessions: liveRows.length,
    attendanceRate: `${rate}%`,
    flagged: typeof suspiciousCount === 'number' ? suspiciousCount : 0,
  }
}

export async function listDevices(auth: AuthContext) {
  const rows = await db()
    .select()
    .from(devices)
    .where(and(eq(devices.organizationId, auth.organizationId), eq(devices.studentId, auth.userId)))

  return rows.map((row) => ({
    id: row.id,
    label: row.label,
    trusted: row.trusted,
    lastSeenAt: row.lastSeenAt ? formatRelativeTime(row.lastSeenAt) : 'Never',
  }))
}

export async function listDepartments(auth: AuthContext) {
  const rows = await db()
    .select()
    .from(departments)
    .where(eq(departments.organizationId, auth.organizationId))

  return rows.map((row) => row.name)
}

export async function listDepartmentsWithDetails(auth: AuthContext): Promise<DepartmentItem[]> {
  const depRows = await db()
    .select({
      id: departments.id,
      name: departments.name,
      createdAt: departments.createdAt,
    })
    .from(departments)
    .where(eq(departments.organizationId, auth.organizationId))
    .orderBy(asc(departments.name))

  const courseCounts = await db()
    .select({
      department: courses.department,
      count: count(),
    })
    .from(courses)
    .where(eq(courses.organizationId, auth.organizationId))
    .groupBy(courses.department)

  const countMap = new Map<string, number>()
  for (const row of courseCounts) {
    if (row.department) {
      countMap.set(row.department.toLowerCase(), Number(row.count))
    }
  }

  const result: DepartmentItem[] = depRows.map((dep) => ({
    id: dep.id,
    name: dep.name,
    courseCount: countMap.get(dep.name.toLowerCase()) ?? 0,
    createdAt: dep.createdAt.toISOString(),
  }))

  // Auto-populate any courses that have a department name not yet in departments table
  for (const row of courseCounts) {
    const dName = row.department?.trim()
    if (dName && !result.some((d) => d.name.toLowerCase() === dName.toLowerCase())) {
      const newId = `dep_${nanoid(8)}`
      try {
        await db().insert(departments).values({
          id: newId,
          organizationId: auth.organizationId,
          name: dName,
        })
        result.push({
          id: newId,
          name: dName,
          courseCount: Number(row.count),
          createdAt: new Date().toISOString(),
        })
      } catch {
        // Ignore duplicate in race condition
      }
    }
  }

  result.sort((a, b) => a.name.localeCompare(b.name))

  // If teacher, only return departments associated with courses taught by this teacher
  if (auth.role === 'teacher') {
    const teacherCourses = await db()
      .select({ department: courses.department })
      .from(courses)
      .where(and(eq(courses.organizationId, auth.organizationId), eq(courses.teacherId, auth.userId)))

    const teacherDeptSet = new Set(teacherCourses.map((c) => c.department.toLowerCase()))
    return result.filter((d) => teacherDeptSet.has(d.name.toLowerCase()))
  }

  return result
}

export async function createDepartment(auth: AuthContext, name: string) {
  if (auth.role !== 'admin') {
    return { ok: false as const, message: 'Chỉ quản trị viên mới có quyền tạo khoa/bộ môn.' }
  }

  const trimmed = name.trim()
  if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
    return { ok: false as const, message: 'Tên khoa/bộ môn phải từ 2 đến 100 ký tự.' }
  }

  const existing = await db()
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.organizationId, auth.organizationId), sql`lower(${departments.name}) = lower(${trimmed})`))
    .limit(1)

  if (existing[0]) {
    return { ok: false as const, message: 'Khoa/Bộ môn này đã tồn tại trong hệ thống.' }
  }

  const id = `dep_${nanoid(8)}`
  await db().insert(departments).values({
    id,
    organizationId: auth.organizationId,
    name: trimmed,
  })

  await appendAudit(auth, 'department.create', trimmed, 'info')
  return { ok: true as const, department: { id, name: trimmed } }
}

export async function updateDepartment(auth: AuthContext, id: string, newName: string) {
  if (auth.role !== 'admin') {
    return { ok: false as const, message: 'Chỉ quản trị viên mới có quyền cập nhật khoa/bộ môn.' }
  }

  const trimmed = newName.trim()
  if (!trimmed || trimmed.length < 2 || trimmed.length > 100) {
    return { ok: false as const, message: 'Tên khoa/bộ môn phải từ 2 đến 100 ký tự.' }
  }

  const current = await db()
    .select()
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.organizationId, auth.organizationId)))
    .limit(1)

  if (!current[0]) {
    return { ok: false as const, message: 'Không tìm thấy khoa/bộ môn.' }
  }

  const oldName = current[0].name
  if (oldName === trimmed) {
    return { ok: true as const }
  }

  const duplicate = await db()
    .select({ id: departments.id })
    .from(departments)
    .where(and(eq(departments.organizationId, auth.organizationId), sql`lower(${departments.name}) = lower(${trimmed})`, ne(departments.id, id)))
    .limit(1)

  if (duplicate[0]) {
    return { ok: false as const, message: 'Tên khoa/bộ môn này đã được sử dụng.' }
  }

  await db()
    .update(departments)
    .set({ name: trimmed })
    .where(and(eq(departments.id, id), eq(departments.organizationId, auth.organizationId)))

  await db()
    .update(courses)
    .set({ department: trimmed })
    .where(and(eq(courses.organizationId, auth.organizationId), eq(courses.department, oldName)))

  await db()
    .update(organizationMemberships)
    .set({ department: trimmed })
    .where(and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.department, oldName)))

  await appendAudit(auth, 'department.update', `${oldName} -> ${trimmed}`, 'info')
  return { ok: true as const }
}

export async function deleteDepartment(auth: AuthContext, id: string) {
  if (auth.role !== 'admin') {
    return { ok: false as const, message: 'Chỉ quản trị viên mới có quyền xóa khoa/bộ môn.' }
  }

  const current = await db()
    .select()
    .from(departments)
    .where(and(eq(departments.id, id), eq(departments.organizationId, auth.organizationId)))
    .limit(1)

  if (!current[0]) {
    return { ok: false as const, message: 'Không tìm thấy khoa/bộ môn.' }
  }

  const linkedCourses = await db()
    .select({ count: count() })
    .from(courses)
    .where(and(eq(courses.organizationId, auth.organizationId), eq(courses.department, current[0].name)))

  const activeCourseCount = Number(linkedCourses[0]?.count ?? 0)
  if (activeCourseCount > 0) {
    return {
      ok: false as const,
      message: `Không thể xóa: Khoa/bộ môn "${current[0].name}" hiện đang có ${activeCourseCount} môn học trực thuộc. Vui lòng chuyển môn học sang khoa khác trước khi xóa.`,
    }
  }

  await db()
    .delete(departments)
    .where(and(eq(departments.id, id), eq(departments.organizationId, auth.organizationId)))

  await appendAudit(auth, 'department.delete', current[0].name, 'warning')
  return { ok: true as const }
}

async function appendAudit(auth: AuthContext, action: string, target: string, severity: 'info' | 'warning') {
  await db().insert(auditLogs).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    actorId: auth.userId,
    actorName: auth.name,
    action,
    target,
    severity,
  })
}

function formatRelativeTime(date: Date) {
  const diffMs = Date.now() - date.getTime()
  const minutes = Math.floor(diffMs / 60000)
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes} min ago`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `${hours} hour${hours > 1 ? 's' : ''} ago`
  const days = Math.floor(hours / 24)
  return days === 1 ? 'Yesterday' : `${days} days ago`
}

export async function createCourse(
  auth: AuthContext,
  data: { code: string; name: string; department: string; teacherId?: string; color?: string }
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }
  const assignedTeacherId = data.teacherId || auth.userId
  const teacher = await db()
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, auth.organizationId),
        eq(organizationMemberships.userId, assignedTeacherId),
        eq(organizationMemberships.role, 'teacher'),
        eq(organizationMemberships.status, 'active'),
      ),
    )
    .limit(1)
  if (!teacher[0]) return { ok: false as const, message: 'Giảng viên phụ trách không hợp lệ.' }
  const courseId = `crs_${nanoid(10)}`
  await db().insert(courses).values({
    id: courseId,
    organizationId: auth.organizationId,
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    department: data.department.trim(),
    teacherId: assignedTeacherId,
    color: data.color || 'indigo',
    status: 'active',
  })
  await appendAudit(auth, `Created course ${data.code} (${data.name})`, courseId, 'info')
  return { ok: true as const, courseId }
}

export async function updateCourseTeacher(auth: AuthContext, courseId: string, teacherId: string) {
  if (auth.role !== 'admin') return { ok: false as const, message: 'Permission denied.' }
  const teacher = await db().select({ userId: organizationMemberships.userId }).from(organizationMemberships).where(and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.userId, teacherId), eq(organizationMemberships.role, 'teacher'), eq(organizationMemberships.status, 'active'))).limit(1)
  if (!teacher[0]) return { ok: false as const, message: 'Giảng viên không hợp lệ.' }
  const result = await db().update(courses).set({ teacherId }).where(and(eq(courses.id, courseId), eq(courses.organizationId, auth.organizationId)))
  if (!result.rowCount) return { ok: false as const, message: 'Không tìm thấy môn học.' }
  return { ok: true as const }
}

export async function createCourseSection(
  auth: AuthContext,
  data: {
    courseId: string
    room: string
    startsAt: string
    endsAt: string
    startDate?: string
    endDate?: string
    dayOfWeek?: number
    autoStart?: boolean
    enrollAll?: boolean
    initialStudentIds?: string[]
  }
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  // Teacher ownership check: Teacher can only create sections for their own course
  if (auth.role === 'teacher') {
    const course = await db()
      .select({ teacherId: courses.teacherId })
      .from(courses)
      .where(and(eq(courses.id, data.courseId), eq(courses.organizationId, auth.organizationId)))
      .limit(1)
    if (!course[0] || course[0].teacherId !== auth.userId) {
      return { ok: false as const, message: 'Forbidden: You can only create sections for courses you teach.' }
    }
  }

  const sectionId = `sec_${nanoid(10)}`
  await db().insert(courseSections).values({
    id: sectionId,
    organizationId: auth.organizationId,
    courseId: data.courseId,
    room: data.room.trim(),
    startsAt: data.startsAt.trim(),
    endsAt: data.endsAt.trim(),
    startDate: data.startDate?.trim() || '2026-01-01',
    endDate: data.endDate?.trim() || '2026-12-31',
    dayOfWeek: data.dayOfWeek ?? 1,
    autoStart: data.autoStart ?? true,
    status: 'scheduled',
  })

  // Optional enrollment: only if initialStudentIds or enrollAll is explicitly requested
  if (data.initialStudentIds && data.initialStudentIds.length > 0) {
    await db()
      .insert(classEnrollments)
      .values(
        data.initialStudentIds.map((studentId) => ({
          sectionId,
          studentId,
          organizationId: auth.organizationId,
          status: 'active' as const,
        })),
      )
      .onConflictDoNothing()
  } else if (data.enrollAll) {
    const orgStudents = await db()
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.role, 'student')))

    if (orgStudents.length > 0) {
      await db()
        .insert(classEnrollments)
        .values(
          orgStudents.map((st) => ({
            sectionId,
            studentId: st.userId,
            organizationId: auth.organizationId,
            status: 'active' as const,
          })),
        )
        .onConflictDoNothing()
    }
  }

    try {
      const enrollRes = await db()
        .select({ studentId: classEnrollments.studentId })
        .from(classEnrollments)
        .innerJoin(courseSections, eq(classEnrollments.sectionId, courseSections.id))
        .where(and(eq(courseSections.courseId, data.courseId), eq(classEnrollments.status, 'active')))
      const distinctCount = new Set(enrollRes.map((r) => r.studentId)).size
      await db().update(courses).set({ enrolled: distinctCount }).where(eq(courses.id, data.courseId))
    } catch {
      /* ignore sync error */
    }

  await appendAudit(auth, `Created recurring section schedule in room ${data.room}`, sectionId, 'info')
  return { ok: true as const, sectionId }
}

export async function updateCourseSection(
  auth: AuthContext,
  sectionId: string,
  data: {
    room?: string
    startsAt?: string
    endsAt?: string
    startDate?: string
    endDate?: string
    dayOfWeek?: number
    autoStart?: boolean
    status?: string
  }
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  // Teacher ownership check (SEC-04): Teacher can only update their own sections
  const existingSection = await db()
    .select({
      id: courseSections.id,
      courseId: courseSections.courseId,
      teacherId: courses.teacherId,
    })
    .from(courseSections)
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(
      and(
        eq(courseSections.id, sectionId),
        eq(courseSections.organizationId, auth.organizationId),
      ),
    )
    .limit(1)

  if (!existingSection[0]) {
    return { ok: false as const, message: 'Section not found.' }
  }

  if (auth.role === 'teacher' && existingSection[0].teacherId !== auth.userId) {
    return { ok: false as const, message: 'Forbidden: You can only update sections for courses you teach.' }
  }

  await db()
    .update(courseSections)
    .set(data)
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.organizationId, auth.organizationId)))

  await appendAudit(auth, `Updated section schedule`, sectionId, 'info')
  return { ok: true as const }
}

export async function deleteCourseSection(auth: AuthContext, sectionId: string) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  // Teacher ownership check (SEC-03): Teacher can only delete their own sections
  const existingSection = await db()
    .select({
      id: courseSections.id,
      courseId: courseSections.courseId,
      teacherId: courses.teacherId,
    })
    .from(courseSections)
    .innerJoin(courses, eq(courseSections.courseId, courses.id))
    .where(
      and(
        eq(courseSections.id, sectionId),
        eq(courseSections.organizationId, auth.organizationId),
      ),
    )
    .limit(1)

  if (!existingSection[0]) {
    return { ok: false as const, message: 'Section not found.' }
  }

  if (auth.role === 'teacher' && existingSection[0].teacherId !== auth.userId) {
    return { ok: false as const, message: 'Forbidden: You can only delete sections for courses you teach.' }
  }

  // Cascade cleanup all attendance sessions, challenges and records belonging to this section
  const sessions = await db()
    .select({ id: attendanceSessions.id })
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.sectionId, sectionId), eq(attendanceSessions.organizationId, auth.organizationId)))

  if (sessions.length > 0) {
    const sessionIds = sessions.map((s) => s.id)
    const records = await db()
      .select({ id: attendanceRecords.id })
      .from(attendanceRecords)
      .where(inArray(attendanceRecords.sessionId, sessionIds))

    if (records.length > 0) {
      const recordIds = records.map((r) => r.id)
      await db().delete(attendanceVerifications).where(inArray(attendanceVerifications.attendanceRecordId, recordIds))
    }
    await db().delete(attendanceRecords).where(inArray(attendanceRecords.sessionId, sessionIds))
    await db().delete(attendanceChallenges).where(inArray(attendanceChallenges.sessionId, sessionIds))
    await db().delete(attendanceSessions).where(inArray(attendanceSessions.id, sessionIds))
  }

  await db().delete(classEnrollments).where(and(eq(classEnrollments.sectionId, sectionId), eq(classEnrollments.organizationId, auth.organizationId)))
  await db().delete(courseSections).where(and(eq(courseSections.id, sectionId), eq(courseSections.organizationId, auth.organizationId)))
  await appendAudit(auth, `Deleted section`, sectionId, 'warning')
  return { ok: true as const }
}

export async function overrideRecordStatus(auth: AuthContext, recordId: string, status: AttendanceStatus, note?: string) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  const rows = await db()
    .select({
      record: attendanceRecords,
      session: attendanceSessions,
      course: courses,
    })
    .from(attendanceRecords)
    .innerJoin(attendanceSessions, eq(attendanceRecords.sessionId, attendanceSessions.id))
    .leftJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .where(and(eq(attendanceRecords.id, recordId), eq(attendanceRecords.organizationId, auth.organizationId)))

  const target = rows[0]
  if (!target) {
    return { ok: false as const, message: 'Attendance record not found.' }
  }

  // Horizontal privilege check: Teachers can only override records for courses or sessions they teach
  if (auth.role === 'teacher') {
    const isAssignedTeacher =
      target.session.teacherId === auth.userId ||
      (target.course && target.course.teacherId === auth.userId)
    if (!isAssignedTeacher) {
      return { ok: false as const, message: 'Forbidden: You can only override attendance records for courses you teach.' }
    }
  }

  await db()
    .update(attendanceRecords)
    .set({ status })
    .where(eq(attendanceRecords.id, recordId))

  await appendAudit(auth, `Overrode attendance record ${recordId} to ${status}${note ? ` (${note})` : ''}`, recordId, 'warning')
  return { ok: true as const }
}

export async function manualCheckInStudent(
  auth: AuthContext,
  sessionId: string,
  studentId: string,
  status: AttendanceStatus,
  note = 'Điểm danh thủ công bởi GV (quên điện thoại)',
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  const session = await getSessionScoped(auth.organizationId, sessionId)
  if (!session) {
    return { ok: false as const, message: 'Session not found.' }
  }

  if (auth.role === 'teacher') {
    const courseRows = await db().select().from(courses).where(eq(courses.id, session.courseId))
    const isAssigned = session.teacherId === auth.userId || (courseRows[0] && courseRows[0].teacherId === auth.userId)
    if (!isAssigned) {
      return { ok: false as const, message: 'Forbidden: You can only take attendance for courses you teach.' }
    }
  }

  const enrollment = await db()
    .select()
    .from(classEnrollments)
    .where(
      and(
        eq(classEnrollments.sectionId, session.sectionId),
        eq(classEnrollments.studentId, studentId),
        eq(classEnrollments.status, 'active'),
      ),
    )
  if (!enrollment[0]) {
    return { ok: false as const, message: 'Student is not enrolled in this section.' }
  }

  const verifiedAt = new Date()
  const score = status === 'present' ? 100 : status === 'late' ? 80 : status === 'excused' ? 100 : 0
  const recordId = `rec_${nanoid(12)}`

  await db()
    .insert(attendanceRecords)
    .values({
      id: recordId,
      organizationId: auth.organizationId,
      sessionId,
      studentId,
      status,
      verificationScore: score,
      verifiedAt: status === 'absent' ? null : verifiedAt,
      device: note,
    })
    .onConflictDoUpdate({
      target: [attendanceRecords.sessionId, attendanceRecords.studentId],
      set: {
        status,
        verificationScore: score,
        verifiedAt: status === 'absent' ? null : verifiedAt,
        device: note,
      },
    })

  await appendAudit(auth, `Manual attendance for student ${studentId}: ${status} (${note})`, sessionId, 'info')
  return { ok: true as const, status, message: 'Đã cập nhật điểm danh thành công.' }
}

export type CourseAttendanceStudentSummary = {
  studentId: string
  studentName: string
  studentCode: string
  studentEmail: string
  department: string
  presentCount: number
  lateCount: number
  excusedCount: number
  unexcusedCount: number
  totalConducted: number
  attendanceRate: number
  warningStatus: AttendanceWarningStatus
  examEligibility: string
}

export async function getCourseAttendanceSummary(
  auth: AuthContext,
  courseId: string,
): Promise<{
  course: { id: string; code: string; name: string; department: string }
  totalSessions: number
  students: CourseAttendanceStudentSummary[]
}> {
  const courseRows = await db()
    .select()
    .from(courses)
    .where(and(eq(courses.id, courseId), eq(courses.organizationId, auth.organizationId)))
  const course = courseRows[0]
  if (!course) {
    throw new Error('Course not found.')
  }

  // Teacher authorization check: teacher can only view summary for courses they teach
  if (auth.role === 'teacher' && course.teacherId !== auth.userId) {
    throw new Error('Forbidden: You can only view attendance summary for courses you teach.')
  }

  const conductedSessions = await db()
    .select()
    .from(attendanceSessions)
    .where(
      and(
        eq(attendanceSessions.organizationId, auth.organizationId),
        eq(attendanceSessions.courseId, courseId),
      ),
    )
  const totalConducted = conductedSessions.length

  const enrollments = await db()
    .select({
      student: users,
      membership: organizationMemberships,
    })
    .from(classEnrollments)
    .innerJoin(courseSections, eq(classEnrollments.sectionId, courseSections.id))
    .innerJoin(users, eq(classEnrollments.studentId, users.id))
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, classEnrollments.studentId),
        eq(organizationMemberships.organizationId, auth.organizationId),
      ),
    )
    .where(
      and(
        eq(courseSections.courseId, courseId),
        eq(classEnrollments.status, 'active'),
      ),
    )

  const uniqueStudents = new Map<string, { student: typeof users.$inferSelect; membership: typeof organizationMemberships.$inferSelect | null }>()
  for (const en of enrollments) {
    if (!uniqueStudents.has(en.student.id)) {
      uniqueStudents.set(en.student.id, en)
    }
  }

  const sessionIds = conductedSessions.map((s) => s.id)
  // Aggregate in SQL/DB scope instead of scanning every record of the org:
  // only rows belonging to the sessions of this course are fetched, and they
  // are indexed by student id so the per-student loop is O(1).
  const recordsByStudent = new Map<string, { present: number; late: number; excused: number; absent: number }>()
  if (sessionIds.length > 0) {
    const rawRecords = await db()
      .select({
        studentId: attendanceRecords.studentId,
        status: attendanceRecords.status,
      })
      .from(attendanceRecords)
      .where(
        and(
          eq(attendanceRecords.organizationId, auth.organizationId),
          inArray(attendanceRecords.sessionId, sessionIds),
        ),
      )

    for (const record of rawRecords) {
      let bucket = recordsByStudent.get(record.studentId)
      if (!bucket) {
        bucket = { present: 0, late: 0, excused: 0, absent: 0 }
        recordsByStudent.set(record.studentId, bucket)
      }
      if (record.status === 'present') bucket.present += 1
      else if (record.status === 'late') bucket.late += 1
      else if (record.status === 'excused') bucket.excused += 1
      else if (record.status === 'absent') bucket.absent += 1
    }
  }

  const studentSummaryList: CourseAttendanceStudentSummary[] = []
  for (const { student, membership } of uniqueStudents.values()) {
    const bucket = recordsByStudent.get(student.id) ?? { present: 0, late: 0, excused: 0, absent: 0 }
    const presentCount = bucket.present
    const lateCount = bucket.late
    const excusedCount = bucket.excused
    const unexcusedCount = bucket.absent

    const attendedCount = presentCount + lateCount + excusedCount
    const studentRecordCount = presentCount + lateCount + excusedCount + unexcusedCount
    const totalCount = Math.max(totalConducted, studentRecordCount)
    const rate = totalCount > 0 ? Math.round((attendedCount / totalCount) * 1000) / 10 : 100

    let warningStatus: AttendanceWarningStatus = 'good'
    let examEligibility = 'ĐỦ ĐIỀU KIỆN'

    const absentPercent = totalCount > 0 ? (unexcusedCount / totalCount) * 100 : 0

    // Quy chế đào tạo tín chỉ UTC:
    // - Đối với học phần tiêu chuẩn (<= 15 buổi hoặc đang diễn ra trong kỳ): vắng 2 buổi là NGUY CƠ CẤM THI, >= 3 buổi là CẤM THI
    // - Đối với học phần dài (> 15 buổi): vắng > 20% là CẤM THI, từ 15% - 20% là NGUY CƠ CẤM THI
    if (totalCount <= 15) {
      if (unexcusedCount >= 3) {
        warningStatus = 'disqualified'
        examEligibility = 'CẤM THI'
      } else if (unexcusedCount === 2) {
        warningStatus = 'warning'
        examEligibility = 'NGUY CƠ CẤM THI'
      }
    } else {
      if (absentPercent > 20) {
        warningStatus = 'disqualified'
        examEligibility = 'CẤM THI'
      } else if (absentPercent >= 15) {
        warningStatus = 'warning'
        examEligibility = 'NGUY CƠ CẤM THI'
      }
    }

    studentSummaryList.push({
      studentId: student.id,
      studentName: student.name,
      studentCode: membership?.studentCode ?? '',
      studentEmail: student.email,
      department: membership?.department ?? '',
      presentCount,
      lateCount,
      excusedCount,
      unexcusedCount,
      totalConducted,
      attendanceRate: rate,
      warningStatus,
      examEligibility,
    })
  }

  studentSummaryList.sort((a, b) => a.studentCode.localeCompare(b.studentCode) || a.studentName.localeCompare(b.studentName))

  return {
    course: { id: course.id, code: course.code, name: course.name, department: course.department },
    totalSessions: totalConducted,
    students: studentSummaryList,
  }
}

export { mapSessionStatus }
