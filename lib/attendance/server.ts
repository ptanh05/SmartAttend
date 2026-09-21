import { and, desc, eq, inArray } from 'drizzle-orm'
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
    .where(eq(courseSections.organizationId, organizationId))

  const enrollments = await db()
    .select({
      sectionId: classEnrollments.sectionId,
    })
    .from(classEnrollments)
    .where(and(eq(classEnrollments.organizationId, organizationId), eq(classEnrollments.status, 'active')))

  const enrollmentCountBySection = new Map<string, number>()
  for (const en of enrollments) {
    enrollmentCountBySection.set(en.sectionId, (enrollmentCountBySection.get(en.sectionId) ?? 0) + 1)
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
  const challengeBySession = new Map<string, string>()
  const proofBySession = new Map<string, AcousticProofInput>()

  if (liveSessionIds.length > 0) {
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
        proofBySession.set(ch.sessionId, generateAcousticProofToken(ch.sessionId, ch.sequence))
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
      dayOfWeek: row.section.dayOfWeek,
      autoStart: row.section.autoStart,
      enrolledCount: enrollmentCountBySection.get(row.section.id) ?? 0,
      status,
      challenge: live ? challengeBySession.get(live.session.id) ?? '------' : '------',
      acousticProof: live ? proofBySession.get(live.session.id) : undefined,
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
  const session = await getSessionScoped(auth.organizationId, sessionId)
  if (!session) return { ok: false as const, message: 'Session not found.' }
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

  const absentRecords = enrolled
    .filter((row) => !existingIds.has(row.studentId))
    .map((row) => ({
      id: nanoid(),
      organizationId,
      sessionId,
      studentId: row.studentId,
      status: 'absent' as const,
      verificationScore: 0,
      device: null,
    }))

  if (absentRecords.length > 0) {
    await db().insert(attendanceRecords).values(absentRecords).onConflictDoNothing()
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
  const deviceDecision = evaluateDevicePolicy({
    hasTrustedDevice: deviceRows.some((device) => device.trusted),
    hasSeenDevice: deviceRows.length > 0,
    requireTrustedDevice: policy.requireTrustedDevice,
  })

  // Duplicate check-in idempotency: If student is already marked present or excused, return existing record
  const existing = await db()
    .select()
    .from(attendanceRecords)
    .where(and(eq(attendanceRecords.sessionId, live.id), eq(attendanceRecords.studentId, auth.userId)))

  if (existing[0] && (existing[0].status === 'present' || existing[0].status === 'excused')) {
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
  const knownDevice = deviceRows.find((device) => device.label === deviceLabel) ?? deviceRows[0]
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

  const activeChallengeRow = await getActiveChallenge(row.session.id)
  let challenge = activeChallengeRow?.code ?? (await getActiveChallengePlain(row.session.id))
  let challengeExpiresAt: string | undefined

  const isExpired = activeChallengeRow && new Date(activeChallengeRow.expiresAt).getTime() <= Date.now()

  if (activeChallengeRow && !isExpired && challenge) {
    challengeExpiresAt = activeChallengeRow.expiresAt.toISOString()
  } else {
    const rotated = await rotateChallengeForSession(auth, row.session.id)
    challenge = rotated.ok ? rotated.challenge : '------'
    if (rotated.ok && rotated.expiresAt) {
      challengeExpiresAt = rotated.expiresAt
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

export async function createCourse(
  auth: AuthContext,
  data: { code: string; name: string; department: string; teacherId?: string; color?: string }
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }
  const courseId = `crs_${nanoid(10)}`
  await db().insert(courses).values({
    id: courseId,
    organizationId: auth.organizationId,
    code: data.code.trim().toUpperCase(),
    name: data.name.trim(),
    department: data.department.trim(),
    teacherId: data.teacherId || auth.userId,
    color: data.color || 'indigo',
    status: 'active',
  })
  await appendAudit(auth, `Created course ${data.code} (${data.name})`, courseId, 'info')
  return { ok: true as const, courseId }
}

export async function createCourseSection(
  auth: AuthContext,
  data: {
    courseId: string
    room: string
    startsAt: string
    endsAt: string
    dayOfWeek?: number
    autoStart?: boolean
  }
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }
  const sectionId = `sec_${nanoid(10)}`
  await db().insert(courseSections).values({
    id: sectionId,
    organizationId: auth.organizationId,
    courseId: data.courseId,
    room: data.room.trim(),
    startsAt: data.startsAt.trim(),
    endsAt: data.endsAt.trim(),
    dayOfWeek: data.dayOfWeek ?? 1,
    autoStart: data.autoStart ?? true,
    status: 'scheduled',
  })

  // Auto-enroll active students of the organization into this new section so attendance is seamless
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
    dayOfWeek?: number
    autoStart?: boolean
    status?: string
  }
) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
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

export { mapSessionStatus }
