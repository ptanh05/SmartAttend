import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
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
  devices,
  leaveRequests,
  notifications,
  organizationMemberships,
  organizations,
  suspiciousAttempts,
  userPasskeys,
  users,
} from '@/lib/db/schema'
import {
  getOrCreateLiveSession,
  listSuspicious,
  resolveSuspiciousAttempt,
  rotateChallengeForSession,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import { addLeaveRequest, updateLeaveRequestStatus, getLeaveRequests } from '@/lib/attendance/leave'
import { generateWebAuthnChallenge, verifyWebAuthnChallenge, saveUserPasskey } from '@/lib/auth/webauthn'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function authCtx(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u',
    membershipId: 'm',
    organizationId: 'org',
    role: 'student',
    email: 'u@example.com',
    name: 'User',
    initials: 'U',
    department: null,
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Test Org',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

async function cleanupOrg(orgId: string, userIds: string[] = []) {
  try {
    await db().delete(leaveRequests).where(eq(leaveRequests.organizationId, orgId))
    await db().delete(attendanceVerifications).where(eq(attendanceVerifications.organizationId, orgId))
    await db().delete(suspiciousAttempts).where(eq(suspiciousAttempts.organizationId, orgId))
    await db().delete(devices).where(eq(devices.organizationId, orgId))
    await db().delete(notifications).where(eq(notifications.organizationId, orgId))
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
    await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId))
    await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId))
    await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId))
    await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
    await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
    await db().delete(courses).where(eq(courses.organizationId, orgId))
    await db().delete(attendancePolicies).where(eq(attendancePolicies.organizationId, orgId))
    await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
    for (const uid of userIds) {
      await db().delete(users).where(eq(users.id, uid))
    }
    await db().delete(organizations).where(eq(organizations.id, orgId))
  } catch {
    // ignore cleanup errors
  }
}

describe.skipIf(!hasDb)('Production Security & Integrity Audit Test Suite', () => {
  it('CASE A & B & C & D: Enforces session status, enrollment, and expired challenge checks', async () => {
    const orgId = `org_sec_${nanoid(6)}`
    const teacherId = `usr_t_${nanoid(6)}`
    const enrolledStudentId = `usr_senrolled_${nanoid(6)}`
    const unenrolledStudentId = `usr_sunenrolled_${nanoid(6)}`
    const courseId = `crs_${nanoid(6)}`
    const sectionId = `sec_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Security Audit Org' })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@test.edu`, passwordHash: 'hash', name: 'Teacher', initials: 'T' },
        { id: enrolledStudentId, email: `se_${orgId}@test.edu`, passwordHash: 'hash', name: 'Student Enrolled', initials: 'SE' },
        { id: unenrolledStudentId, email: `su_${orgId}@test.edu`, passwordHash: 'hash', name: 'Student Unenrolled', initials: 'SU' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: enrolledStudentId, role: 'student', studentCode: '20261111' },
        { id: nanoid(), organizationId: orgId, userId: unenrolledStudentId, role: 'student', studentCode: '20262222' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'SEC101',
        name: 'Cybersecurity',
        department: 'IT',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab 5',
        startsAt: '08:00',
        endsAt: '10:00',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId: enrolledStudentId,
        organizationId: orgId,
      })

      const teacherAuth = authCtx({ userId: teacherId, organizationId: orgId, role: 'teacher' })
      const enrolledAuth = authCtx({ userId: enrolledStudentId, organizationId: orgId, role: 'student' })
      const unenrolledAuth = authCtx({ userId: unenrolledStudentId, organizationId: orgId, role: 'student' })

      const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
      expect(sessionId).toBeTruthy()

      // CASE C: Verify against draft / non-active session should fail (no live session)
      const nonActiveAttempt = await verifyAttendance(enrolledAuth, '123456')
      expect(nonActiveAttempt.ok).toBe(false)
      expect(nonActiveAttempt.message).toContain('no live session')

      // Activate session & generate challenge
      await transitionSessionState(teacherAuth, sessionId!, 'active')
      const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
      const challengeCode = (rotated as { challenge: string }).challenge

      // CASE D: Unenrolled student cannot verify
      const unenrolledAttempt = await verifyAttendance(unenrolledAuth, challengeCode)
      expect(unenrolledAttempt.ok).toBe(false)
      expect(unenrolledAttempt.message).toContain('not enrolled')

      // CASE A: Expired challenge
      await db()
        .update(attendanceChallenges)
        .set({ expiresAt: new Date(Date.now() - 60 * 1000) })
        .where(eq(attendanceChallenges.sessionId, sessionId!))

      const expiredAttempt = await verifyAttendance(enrolledAuth, challengeCode)
      expect(expiredAttempt.ok).toBe(false)
      expect(expiredAttempt.message).toContain('expired')
    } finally {
      await cleanupOrg(orgId, [teacherId, enrolledStudentId, unenrolledStudentId])
    }
  }, 30_000)

  it('CASE F & G: Horizontal IDOR prevention - Teacher A cannot review/resolve leave or suspicious for Teacher B', async () => {
    const orgId = `org_idor_${nanoid(6)}`
    const teacherAId = `usr_ta_${nanoid(6)}`
    const teacherBId = `usr_tb_${nanoid(6)}`
    const studentId = `usr_st_${nanoid(6)}`
    const courseAId = `crs_a_${nanoid(6)}`
    const courseBId = `crs_b_${nanoid(6)}`
    const secBId = `sec_b_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'IDOR Audit Org' })
      await db().insert(users).values([
        { id: teacherAId, email: `ta_${orgId}@test.edu`, passwordHash: 'hash', name: 'Teacher A', initials: 'TA' },
        { id: teacherBId, email: `tb_${orgId}@test.edu`, passwordHash: 'hash', name: 'Teacher B', initials: 'TB' },
        { id: studentId, email: `st_${orgId}@test.edu`, passwordHash: 'hash', name: 'Student', initials: 'S' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherAId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: teacherBId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20263333' },
      ])
      await db().insert(courses).values([
        { id: courseAId, organizationId: orgId, code: 'CRS-A', name: 'Math A', department: 'Math', teacherId: teacherAId },
        { id: courseBId, organizationId: orgId, code: 'CRS-B', name: 'Math B', department: 'Math', teacherId: teacherBId },
      ])
      await db().insert(courseSections).values({
        id: secBId,
        organizationId: orgId,
        courseId: courseBId,
        room: 'Lab B',
        startsAt: '09:00',
        endsAt: '11:00',
      })

      const teacherA = authCtx({ userId: teacherAId, organizationId: orgId, role: 'teacher', name: 'Teacher A' })
      const teacherB = authCtx({ userId: teacherBId, organizationId: orgId, role: 'teacher', name: 'Teacher B' })
      const student = authCtx({ userId: studentId, organizationId: orgId, role: 'student', name: 'Student' })

      // Student creates leave request for Teacher B's course
      const leaveReq = await addLeaveRequest(student, {
        courseId: courseBId,
        date: '2026-09-10',
        reason: 'Medical appointment',
      })

      // Teacher A attempts to list leave requests -> Teacher B's course request must NOT be shown to Teacher A
      const teacherALeaves = await getLeaveRequests(teacherA)
      expect(teacherALeaves.some((l) => l.id === leaveReq.id)).toBe(false)

      // Teacher B lists leave requests -> must see it
      const teacherBLeaves = await getLeaveRequests(teacherB)
      expect(teacherBLeaves.some((l) => l.id === leaveReq.id)).toBe(true)

      // Teacher A attempts to approve Teacher B's leave request -> MUST fail with Forbidden error
      await expect(updateLeaveRequestStatus(teacherA, leaveReq.id, 'approved')).rejects.toThrow(/Forbidden/)

      // Teacher B approves -> must succeed
      const approved = await updateLeaveRequestStatus(teacherB, leaveReq.id, 'approved')
      expect(approved?.status).toBe('approved')

      // CASE G: Suspicious attempts IDOR check
      const sessBId = await getOrCreateLiveSession(teacherB, secBId)
      await transitionSessionState(teacherB, sessBId!, 'active')
      const recId = nanoid()
      await db().insert(attendanceRecords).values({
        id: recId,
        organizationId: orgId,
        sessionId: sessBId!,
        studentId,
        status: 'present',
        verificationScore: 50,
      })
      const suspId = nanoid()
      await db().insert(suspiciousAttempts).values({
        id: suspId,
        organizationId: orgId,
        attendanceRecordId: recId,
        reason: 'Untrusted device under policy',
        status: 'open',
      })

      // Teacher A lists suspicious attempts -> Teacher B's course attempt must NOT be visible
      const teacherASuspicious = await listSuspicious(teacherA)
      expect(teacherASuspicious.some((s) => s.id === suspId)).toBe(false)

      // Teacher A attempts to resolve Teacher B's suspicious attempt -> MUST be denied
      const teacherAResolve = await resolveSuspiciousAttempt(teacherA, suspId, 'approved')
      expect(teacherAResolve.ok).toBe(false)
      expect(teacherAResolve.message).toContain('Permission denied')

      // Teacher B resolves -> succeeds
      const teacherBResolve = await resolveSuspiciousAttempt(teacherB, suspId, 'approved')
      expect(teacherBResolve.ok).toBe(true)
    } finally {
      await cleanupOrg(orgId, [teacherAId, teacherBId, studentId])
    }
  }, 30_000)

  it('CASE H & I: WebAuthn challenge stateless HMAC token verification and passkey ownership checks', async () => {
    const testUserId = 'usr_test_webauthn'

    // Generate valid signed challenge for user
    const token = generateWebAuthnChallenge(testUserId)
    expect(token).toBeTruthy()

    // Valid token for this user should verify true
    expect(verifyWebAuthnChallenge(testUserId, token)).toBe(true)

    // Token should verify false for a different user (user-bound token)
    expect(verifyWebAuthnChallenge('different-user-id', token)).toBe(false)

    // Tampered token should verify false
    const parts = token.split('.')
    const tampered = `${parts[0]}.${parts[1]}.invalidsignature`
    expect(verifyWebAuthnChallenge(testUserId, tampered)).toBe(false)

    // Expired token should verify false
    const pastExpiresAt = Date.now() - 1000
    const crypto = await import('crypto')
    const secret = process.env.SESSION_SECRET || process.env.TEACHER_REGISTRATION_API_KEY || 'smartattend_webauthn_challenge_secret'
    const nonce = 'expiredNonce'
    const expiredSig = crypto.createHmac('sha256', secret).update(`${testUserId}:${nonce}:${pastExpiresAt}`).digest('base64url')
    const expiredToken = `${nonce}.${pastExpiresAt}.${expiredSig}`
    expect(verifyWebAuthnChallenge(testUserId, expiredToken)).toBe(false)

    // CASE I: Ownership check - credential already registered to another user cannot be overwritten
    const firstUserId = `usr_owner1_${nanoid(6)}`
    const secondUserId = `usr_owner2_${nanoid(6)}`
    const sharedCredId = `cred_${nanoid(10)}`

    try {
      await db().insert(users).values([
        { id: firstUserId, email: `${firstUserId}@test.edu`, passwordHash: 'hash', name: 'Owner 1', initials: 'O1' },
        { id: secondUserId, email: `${secondUserId}@test.edu`, passwordHash: 'hash', name: 'Owner 2', initials: 'O2' },
      ])

      await saveUserPasskey(firstUserId, sharedCredId, 'pubkey-1', 'Device 1')
      await expect(
        saveUserPasskey(secondUserId, sharedCredId, 'pubkey-2', 'Device 2'),
      ).rejects.toThrow(/already registered to another user/)
    } finally {
      await db().delete(userPasskeys).where(eq(userPasskeys.credentialId, sharedCredId))
      await db().delete(users).where(eq(users.id, firstUserId))
      await db().delete(users).where(eq(users.id, secondUserId))
    }
  })

  it('CASE J & K: Duplicate check-in idempotency and non-bypassable suspicious device detection', async () => {
    const orgId = `org_dup_${nanoid(6)}`
    const teacherId = `usr_tdup_${nanoid(6)}`
    const studentId = `usr_sdup_${nanoid(6)}`
    const courseId = `crs_dup_${nanoid(6)}`
    const sectionId = `sec_dup_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Duplicate Audit Org' })
      // Require trusted device in attendance policy
      await db().insert(attendancePolicies).values({
        id: nanoid(),
        organizationId: orgId,
        requireTrustedDevice: true,
        challengeTtlSeconds: 60,
      })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@test.edu`, passwordHash: 'hash', name: 'Teacher Dup', initials: 'TD' },
        { id: studentId, email: `s_${orgId}@test.edu`, passwordHash: 'hash', name: 'Student Dup', initials: 'SD' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20265555' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'NET101',
        name: 'Computer Networks',
        department: 'IT',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab 9',
        startsAt: '08:00',
        endsAt: '10:00',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId,
        organizationId: orgId,
      })

      const teacherAuth = authCtx({ userId: teacherId, organizationId: orgId, role: 'teacher' })
      const studentAuth = authCtx({ userId: studentId, organizationId: orgId, role: 'student' })

      const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
      await transitionSessionState(teacherAuth, sessionId!, 'active')
      const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
      const challengeCode = (rotated as { challenge: string }).challenge

      // CASE K: Client sends untrusted device check-in pretending ultrasonicVerified & biometricVerified are true
      // Under trusted device policy with unseen device, suspicious attempt MUST be logged even if ultrasonic/biometric were provided!
      const firstAttempt = await verifyAttendance(studentAuth, challengeCode, 'Untrusted Browser', {
        ultrasonicVerified: true,
        biometricVerified: true,
      })

      expect(firstAttempt.ok).toBe(true)
      expect(firstAttempt.confidence).toBe(100)

      // Verify suspicious attempt was recorded and not bypassed
      const suspRows = await db()
        .select()
        .from(suspiciousAttempts)
        .where(eq(suspiciousAttempts.organizationId, orgId))
      expect(suspRows.length).toBeGreaterThan(0)
      expect(suspRows[0].reason).toContain('trusted-device policy')

      // CASE J: Duplicate check-in with same student -> must return existing record idempotently
      const secondAttempt = await verifyAttendance(studentAuth, challengeCode, 'Untrusted Browser')
      expect(secondAttempt.ok).toBe(true)
      expect(secondAttempt.message).toContain('Bạn đã hoàn tất điểm danh')
      expect(secondAttempt.record?.id).toBe(firstAttempt.record?.id)
    } finally {
      await cleanupOrg(orgId, [teacherId, studentId])
    }
  }, 30_000)
})
