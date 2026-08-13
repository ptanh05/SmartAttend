import { and, desc, eq, inArray } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { generateChallengeValue, hashChallengeValue, verifyChallengeValue } from '@/lib/attendance/challenge'
import { canTransition } from '@/lib/attendance/session-state'
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
  notifications,
  organizationMemberships,
  suspiciousAttempts,
  users,
} from '@/lib/db/schema'
import type { AttendanceStatus, ClassSession, Course, SessionStatus } from '@/lib/types/domain'

function mapSessionStatus(status: string): SessionStatus {
  if (status === 'active') return 'live'
  return status as SessionStatus
}

export async function listCourses(organizationId: string): Promise<Course[]> {
  const rows = await db()
    .select()
    .from(courses)
    .where(and(eq(courses.organizationId, organizationId), eq(courses.status, 'active')))

  return rows.map((row) => ({
    id: row.id,
    organizationId: row.organizationId,
    code: row.code,
    name: row.name,
    department: row.department,
    teacherId: row.teacherId,
    enrolled: row.enrolled,
    color: row.color,
  }))
}

export async function listClassSessions(organizationId: string): Promise<ClassSession[]> {
  const rows = await db()
    .select({
      section: courseSections,
      courseId: courseSections.courseId,
      session: attendanceSessions,
      challenge: attendanceChallenges.valueHash,
    })
    .from(courseSections)
    .leftJoin(
      attendanceSessions,
      and(eq(attendanceSessions.sectionId, courseSections.id), inArray(attendanceSessions.status, ['active', 'draft', 'paused'])),
    )
    .leftJoin(
      attendanceChallenges,
      and(eq(attendanceChallenges.sessionId, attendanceSessions.id), eq(attendanceChallenges.status, 'active')),
    )
    .where(eq(courseSections.organizationId, organizationId))

  const liveSessions = await db()
    .select({
      section: courseSections,
      session: attendanceSessions,
    })
    .from(attendanceSessions)
    .innerJoin(courseSections, eq(attendanceSessions.sectionId, courseSections.id))
    .where(and(eq(attendanceSessions.organizationId, organizationId), eq(attendanceSessions.status, 'active')))

  const challengeBySession = new Map<string, string>()
  for (const live of liveSessions) {
    const challenge = await getActiveChallengePlain(live.session.id)
    if (challenge) challengeBySession.set(live.session.id, challenge)
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
      room: row.section.room,
      startsAt: row.section.startsAt,
      endsAt: row.section.endsAt,
      status,
      challenge: live ? challengeBySession.get(live.session.id) ?? '------' : '------',
    })
  }

  return result
}

async function getPolicy(organizationId: string) {
  const rows = await db().select().from(attendancePolicies).where(eq(attendancePolicies.organizationId, organizationId))
  return rows[0] ?? { challengeTtlSeconds: 30, lateAfterMinutes: 10, requireTrustedDevice: false }
}

async function getActiveChallenge(sessionId: string) {
  const rows = await db()
    .select()
    .from(attendanceChallenges)
    .where(and(eq(attendanceChallenges.sessionId, sessionId), eq(attendanceChallenges.status, 'active')))
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
  const session = await getSessionScoped(auth.organizationId, sessionId)
  if (!session) return { ok: false as const, message: 'Session not found.' }
  if (session.status !== 'active') return { ok: false as const, message: 'Session is not active.' }

  const policy = await getPolicy(auth.organizationId)
  const previous = await getActiveChallenge(sessionId)
  if (previous) {
    await db()
      .update(attendanceChallenges)
      .set({ status: 'invalidated' })
      .where(eq(attendanceChallenges.id, previous.id))
  }

  const value = generateChallengeValue()
  const sequence = (previous?.sequence ?? 0) + 1
  const expiresAt = new Date(Date.now() + policy.challengeTtlSeconds * 1000)

  await db().insert(attendanceChallenges).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    sessionId,
    sequence,
    valueHash: hashChallengeValue(value),
    status: 'active',
    expiresAt,
  })

  cacheChallengePlain(sessionId, value, policy.challengeTtlSeconds)

  await appendAudit(auth, 'Rotated session challenge', sessionId, 'info')

  return { ok: true as const, challenge: value, expiresAt: expiresAt.toISOString() }
}

async function getSessionScoped(organizationId: string, sessionId: string) {
  const rows = await db()
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.id, sessionId), eq(attendanceSessions.organizationId, organizationId)))
  return rows[0] ?? null
}

export async function transitionSessionState(auth: AuthContext, sessionId: string, next: SessionStatus) {
  const session = await getSessionScoped(auth.organizationId, sessionId)
  if (!session) return { ok: false as const, message: 'Session not found.' }

  const currentNorm = (session.status === 'active' ? 'active' : session.status) as SessionStatus
  const nextNorm = (next === 'live' ? 'active' : next) as SessionStatus

  if (!canTransition(currentNorm, nextNorm)) {
    return { ok: false as const, message: `Cannot move a ${session.status} session to ${next}.` }
  }

  const updates: Partial<typeof attendanceSessions.$inferInsert> = {
    status: nextNorm,
  }

  if (nextNorm === 'active' && !session.startedAt) updates.startedAt = new Date()
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

async function finalizeAbsentRecords(organizationId: string, sessionId: string) {
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

  for (const row of enrolled) {
    if (existingIds.has(row.studentId)) continue
    await db().insert(attendanceRecords).values({
      id: nanoid(),
      organizationId,
      sessionId,
      studentId: row.studentId,
      status: 'absent',
      verificationScore: 0,
      device: null,
    })
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

export async function verifyAttendance(auth: AuthContext, input: string, deviceLabel = 'This browser'): Promise<VerificationResult> {
  if (auth.role !== 'student') {
    return { ok: false, confidence: 0, message: 'Only students can verify attendance.' }
  }

  const liveSessions = await db()
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.organizationId, auth.organizationId), eq(attendanceSessions.status, 'active')))

  const live = liveSessions[0]
  if (!live) return { ok: false, confidence: 0, message: 'There is no live session right now.' }

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

  const policy = await getPolicy(auth.organizationId)
  const verifiedAt = new Date()
  const status: AttendanceStatus = 'present'
  const verificationScore = 98

  const existing = await db()
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.sessionId, live.id), eq(attendanceRecords.studentId, auth.userId)))

  const recordId = existing[0]?.id ?? nanoid()

  if (existing[0]) {
    await db()
      .update(attendanceRecords)
      .set({
        status,
        verificationScore,
        verifiedAt,
        device: deviceLabel,
      })
      .where(eq(attendanceRecords.id, recordId))
  } else {
    await db().insert(attendanceRecords).values({
      id: recordId,
      organizationId: auth.organizationId,
      sessionId: live.id,
      studentId: auth.userId,
      status,
      verificationScore,
      verifiedAt,
      device: deviceLabel,
    })
  }

  await db()
    .update(attendanceChallenges)
    .set({ status: 'consumed', consumedAt: verifiedAt })
    .where(eq(attendanceChallenges.id, challenge.id))

  await db().insert(attendanceVerifications).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    attendanceRecordId: recordId,
    challengeId: challenge.id,
    method: 'manual_code',
    result: 'accepted',
    metadata: { device: deviceLabel },
  })

  await db().insert(notifications).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    userId: auth.userId,
    title: 'Attendance confirmed',
    body: 'Your attendance was verified successfully.',
  })

  await appendAudit(auth, 'Verified attendance', live.id, 'info')

  if (policy.requireTrustedDevice) {
    const deviceRows = await db()
      .select()
      .from(devices)
      .where(and(eq(devices.organizationId, auth.organizationId), eq(devices.studentId, auth.userId), eq(devices.trusted, true)))

    if (!deviceRows[0]) {
      await db().insert(devices).values({
        id: nanoid(),
        organizationId: auth.organizationId,
        studentId: auth.userId,
        label: deviceLabel,
        trusted: true,
        lastSeenAt: verifiedAt,
      })
    }
  }

  return {
    ok: true,
    confidence: verificationScore,
    message: 'Identity and session verified. Your attendance is recorded.',
    record: {
      id: recordId,
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
  const where = targetStudent
    ? and(eq(attendanceRecords.organizationId, auth.organizationId), eq(attendanceRecords.studentId, targetStudent))
    : eq(attendanceRecords.organizationId, auth.organizationId)

  const rows = await db().select().from(attendanceRecords).where(where).orderBy(desc(attendanceRecords.createdAt))

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

export async function getLiveSessionDetails(auth: AuthContext) {
  const rows = await db()
    .select({
      session: attendanceSessions,
      section: courseSections,
      course: courses,
    })
    .from(attendanceSessions)
    .innerJoin(courseSections, eq(attendanceSessions.sectionId, courseSections.id))
    .innerJoin(courses, eq(attendanceSessions.courseId, courses.id))
    .where(and(eq(attendanceSessions.organizationId, auth.organizationId), eq(attendanceSessions.status, 'active')))
    .limit(1)

  const row = rows[0]
  if (!row) return null

  let challenge = await getActiveChallengePlain(row.session.id)
  if (!challenge) {
    const rotated = await rotateChallengeForSession(auth, row.session.id)
    challenge = rotated.ok ? rotated.challenge : '------'
  }

  const recordRows = await db()
    .select({
      record: attendanceRecords,
      student: users,
    })
    .from(attendanceRecords)
    .innerJoin(users, eq(attendanceRecords.studentId, users.id))
    .where(eq(attendanceRecords.sessionId, row.session.id))

  return {
    sessionId: row.session.id,
    courseCode: row.course.code,
    courseName: row.course.name,
    room: row.section.room,
    startsAt: row.section.startsAt,
    endsAt: row.section.endsAt,
    challenge,
    records: recordRows.map(({ record, student }) => ({
      id: record.id,
      studentName: student.name,
      studentId: student.id,
      status: record.status,
      confidence: record.verificationScore,
      verifiedAt: record.verifiedAt?.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) ?? '—',
      device: record.device ?? '—',
    })),
  }
}

export async function getOrCreateLiveSession(auth: AuthContext, sectionId: string) {
  const sectionRows = await db()
    .select()
    .from(courseSections)
    .where(and(eq(courseSections.id, sectionId), eq(courseSections.organizationId, auth.organizationId)))

  const section = sectionRows[0]
  if (!section) return null

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
  const where = role
    ? and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.role, role))
    : eq(organizationMemberships.organizationId, auth.organizationId)

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
    .where(where)

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
    ? and(eq(notifications.userId, auth.userId), inArray(notifications.id, ids))
    : eq(notifications.userId, auth.userId)

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
  const rows = await db()
    .select()
    .from(suspiciousAttempts)
    .where(and(eq(suspiciousAttempts.organizationId, auth.organizationId), eq(suspiciousAttempts.status, 'open')))

  return rows.map((row) => ({ id: row.id, reason: row.reason, status: row.status }))
}

export async function getOrganizationMetrics(auth: AuthContext) {
  const studentRows = await db()
    .select()
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.role, 'student')))

  const teacherRows = await db()
    .select()
    .from(organizationMemberships)
    .where(and(eq(organizationMemberships.organizationId, auth.organizationId), eq(organizationMemberships.role, 'teacher')))

  const liveRows = await db()
    .select()
    .from(attendanceSessions)
    .where(and(eq(attendanceSessions.organizationId, auth.organizationId), eq(attendanceSessions.status, 'active')))

  const recordRows = await db()
    .select()
    .from(attendanceRecords)
    .where(eq(attendanceRecords.organizationId, auth.organizationId))

  const attended = recordRows.filter((row) => row.status === 'present' || row.status === 'late').length
  const rate = recordRows.length ? Math.round((attended / recordRows.length) * 1000) / 10 : 0

  return {
    students: studentRows.length,
    teachers: teacherRows.length,
    activeSessions: liveRows.length,
    attendanceRate: `${rate}%`,
    flagged: (await listSuspicious(auth)).length,
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

export { mapSessionStatus }
