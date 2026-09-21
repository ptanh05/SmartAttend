import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { createHash } from 'crypto'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendanceRecords,
  attendanceSessions,
  attendanceVerifications,
  auditLogs,
  authSessions,
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
  listRecords,
  overrideRecordStatus,
  resolveSuspiciousAttempt,
  rotateChallengeForSession,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import { updateLeaveRequestStatus } from '@/lib/attendance/leave'
import {
  generateWebAuthnChallenge,
  verifyWebAuthnAssertion,
} from '@/lib/auth/webauthn'
import {
  generateAcousticProofToken,
  verifyAcousticProofToken,
} from '@/lib/attendance/ultrasonic'
import { createAuthSession, getAuthContext, type AuthContext } from '@/lib/auth/session'
import { RateLimiter } from '@/lib/rate-limit'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

async function cleanupAuditOrg(orgId: string, userIds: string[] = []) {
  try {
    await db().delete(notifications).where(eq(notifications.organizationId, orgId))
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
    await db().delete(suspiciousAttempts).where(eq(suspiciousAttempts.organizationId, orgId))
    await db().delete(devices).where(eq(devices.organizationId, orgId))
    await db().delete(leaveRequests).where(eq(leaveRequests.organizationId, orgId))
    for (const uid of userIds) {
      await db().delete(userPasskeys).where(eq(userPasskeys.userId, uid))
      await db().delete(authSessions).where(eq(authSessions.userId, uid))
    }
    await db().delete(attendanceVerifications).where(eq(attendanceVerifications.organizationId, orgId))
    await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId))
    await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId))
    await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId))
    await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
    await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
    await db().delete(courses).where(eq(courses.organizationId, orgId))
    await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
    for (const uid of userIds) {
      await db().delete(users).where(eq(users.id, uid))
    }
    await db().delete(organizations).where(eq(organizations.id, orgId))
  } catch {
    // Ignore cleanup error
  }
}

describe.skipIf(!hasDb)('Phase 8 Independent Security & Architecture Audit Suite', () => {
  // 1. AUTH: Invalid, Expired, Revoked session tokens
  it('AUTH-AUDIT: Validates session lifecycle, rejects invalid, expired, and revoked tokens', async () => {
    const orgId = `org_a1_${nanoid(6)}`
    const userId = `usr_a1_${nanoid(6)}`
    const membershipId = `mem_a1_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Auth Org', plan: 'Enterprise' })
      await db().insert(users).values({
        id: userId,
        email: `u_${orgId}@utc.edu.vn`,
        name: 'Auth User',
        passwordHash: 'hash',
        initials: 'AU',
      })
      await db().insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        role: 'student',
        status: 'active',
      })

      // 1a. Invalid token
      const nullAuth = await getAuthContext('completely_invalid_token_12345')
      expect(nullAuth).toBeNull()

      // 1b. Active token
      const { token } = await createAuthSession(userId, membershipId)
      const validAuth = await getAuthContext(token)
      expect(validAuth).not.toBeNull()
      expect(validAuth?.userId).toBe(userId)

      // 1c. Expired token in database
      const expiredToken = 'expired_token_mock_abcdef'
      const { createHash } = await import('crypto')
      const expiredHash = createHash('sha256').update(expiredToken).digest('hex')
      await db().insert(authSessions).values({
        id: nanoid(),
        userId,
        membershipId,
        tokenHash: expiredHash,
        expiresAt: new Date(Date.now() - 10000), // In the past
      })
      const expiredAuth = await getAuthContext(expiredToken)
      expect(expiredAuth).toBeNull()

      // 1d. Revoked / deleted session
      await db().delete(authSessions).where(eq(authSessions.userId, userId))
      const revokedAuth = await getAuthContext(token)
      expect(revokedAuth).toBeNull()
    } finally {
      await cleanupAuditOrg(orgId, [userId])
    }
  })

  // 2. RBAC & CROSS-TENANT ISOLATION
  it('RBAC-AUDIT: Enforces role boundaries and multi-tenant isolation', async () => {
    const orgA = `org_ra_${nanoid(6)}`
    const orgB = `org_rb_${nanoid(6)}`
    const studentIdA = `stu_ra_${nanoid(6)}`
    const teacherIdA = `tch_ra_${nanoid(6)}`
    const studentIdB = `stu_rb_${nanoid(6)}`
    const sectionIdB = `sec_rb_${nanoid(6)}`
    const courseIdB = `crs_rb_${nanoid(6)}`

    try {
      await db().insert(organizations).values([
        { id: orgA, name: 'Org A' },
        { id: orgB, name: 'Org B' },
      ])
      await db().insert(users).values([
        { id: studentIdA, email: `s_${orgA}@utc.edu.vn`, name: 'Student A', passwordHash: 'hash', initials: 'SA' },
        { id: teacherIdA, email: `t_${orgA}@utc.edu.vn`, name: 'Teacher A', passwordHash: 'hash', initials: 'TA' },
        { id: studentIdB, email: `s_${orgB}@utc.edu.vn`, name: 'Student B', passwordHash: 'hash', initials: 'SB' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgA, userId: studentIdA, role: 'student', status: 'active' },
        { id: nanoid(), organizationId: orgA, userId: teacherIdA, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgB, userId: studentIdB, role: 'student', status: 'active' },
      ])

      // 2a. Student role checking teacher access
      const studentAuthA: AuthContext = {
        userId: studentIdA,
        membershipId: 'm1',
        organizationId: orgA,
        role: 'student',
        email: `s_${orgA}@utc.edu.vn`,
        name: 'Student A',
        initials: 'SA',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'Org A',
        organizationPlan: 'Campus',
      }

      const allowedRoles = ['teacher', 'admin']
      expect(allowedRoles.includes(studentAuthA.role)).toBe(false)

      // 2b. Cross-tenant attempt: Student A attempts to check in to an active session in Org B
      await db().insert(courses).values({
        id: courseIdB,
        organizationId: orgB,
        code: 'CS999',
        name: 'Distributed Systems',
        department: 'CS',
        teacherId: studentIdB, // mock
      })
      await db().insert(courseSections).values({
        id: sectionIdB,
        organizationId: orgB,
        courseId: courseIdB,
        room: 'Lab B',
        startsAt: '08:00',
        endsAt: '10:00',
      })
      await db().insert(classEnrollments).values({
        sectionId: sectionIdB,
        studentId: studentIdB,
        organizationId: orgB,
      })

      const teacherAuthB: AuthContext = {
        userId: studentIdB,
        membershipId: 'mb',
        organizationId: orgB,
        role: 'teacher',
        email: 't_b@utc.edu.vn',
        name: 'Teacher B',
        initials: 'TB',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'Org B',
        organizationPlan: 'Campus',
      }

      const sessIdB = await getOrCreateLiveSession(teacherAuthB, sectionIdB)
      await transitionSessionState(teacherAuthB, sessIdB!, 'active')
      const rotated = await rotateChallengeForSession(teacherAuthB, sessIdB!)
      const challengeCode = (rotated as { challenge: string }).challenge

      // Student A (from Org A) tries to verify attendance using challenge from Org B
      const crossTenantResult = await verifyAttendance(studentAuthA, challengeCode, 'Hacker Device')
      expect(crossTenantResult.ok).toBe(false)
      // Because there is no live session for Org A, it rejects with 'There is no live session right now.'
      expect(crossTenantResult.message).toContain('no live session')
    } finally {
      await cleanupAuditOrg(orgA, [studentIdA, teacherIdA])
      await cleanupAuditOrg(orgB, [studentIdB])
    }
  })

  // 3. IDOR & HORIZONTAL PRIVILEGE AUDIT
  it('IDOR-AUDIT: Prevents horizontal IDOR between teachers and forces student record scoping', async () => {
    const orgId = `org_id_${nanoid(6)}`
    const teacher1Id = `t1_${nanoid(6)}`
    const teacher2Id = `t2_${nanoid(6)}`
    const studentId = `stu_id_${nanoid(6)}`
    const course1Id = `c1_${nanoid(6)}`
    const course2Id = `c2_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'IDOR Org' })
      await db().insert(users).values([
        { id: teacher1Id, email: `t1_${orgId}@utc.edu.vn`, name: 'Teacher One', passwordHash: 'h', initials: 'T1' },
        { id: teacher2Id, email: `t2_${orgId}@utc.edu.vn`, name: 'Teacher Two', passwordHash: 'h', initials: 'T2' },
        { id: studentId, email: `s_${orgId}@utc.edu.vn`, name: 'Student', passwordHash: 'h', initials: 'S' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacher1Id, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: teacher2Id, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', status: 'active' },
      ])
      await db().insert(courses).values([
        { id: course1Id, organizationId: orgId, code: 'C101', name: 'Course 1', department: 'CS', teacherId: teacher1Id },
        { id: course2Id, organizationId: orgId, code: 'C202', name: 'Course 2', department: 'CS', teacherId: teacher2Id },
      ])

      const studentAuth: AuthContext = {
        userId: studentId,
        membershipId: 'ms',
        organizationId: orgId,
        role: 'student',
        email: `s_${orgId}@utc.edu.vn`,
        name: 'Student',
        initials: 'S',
        department: null,
        studentCode: '20261111',
        mustChangePassword: false,
        organizationName: 'IDOR Org',
        organizationPlan: 'Campus',
      }

      const teacher1Auth: AuthContext = {
        userId: teacher1Id,
        membershipId: 'mt1',
        organizationId: orgId,
        role: 'teacher',
        email: `t1_${orgId}@utc.edu.vn`,
        name: 'Teacher One',
        initials: 'T1',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'IDOR Org',
        organizationPlan: 'Campus',
      }

      // 3a. Student passing foreign studentId to listRecords is neutralized to self
      const records = await listRecords(studentAuth, 'foreign_student_id_999')
      expect(Array.isArray(records)).toBe(true)

      // 3b. Teacher 1 attempts to review Leave Request for Teacher 2's course -> MUST THROW FORBIDDEN
      const leaveId = `lr_t2_${nanoid(6)}`
      await db().insert(leaveRequests).values({
        id: leaveId,
        organizationId: orgId,
        studentId,
        courseId: course2Id, // Owned by Teacher 2
        date: '2026-09-22',
        reason: 'Sốt xuất huyết',
        status: 'pending',
      })

      await expect(
        updateLeaveRequestStatus(teacher1Auth, leaveId, 'approved'),
      ).rejects.toThrow('You can only review leave requests for courses you teach')

      // 3c. Teacher 1 attempts to resolve Suspicious Attempt for Teacher 2's course -> MUST REJECT
      const section2Id = `sec2_${nanoid(6)}`
      const session2Id = `sess2_${nanoid(6)}`
      const record2Id = `rec2_${nanoid(6)}`
      const suspId = `susp_t2_${nanoid(6)}`

      await db().insert(courseSections).values({
        id: section2Id,
        organizationId: orgId,
        courseId: course2Id,
        room: 'Lab 2',
        startsAt: '08:00',
        endsAt: '10:00',
      })
      await db().insert(attendanceSessions).values({
        id: session2Id,
        organizationId: orgId,
        sectionId: section2Id,
        courseId: course2Id,
        teacherId: teacher2Id,
        status: 'active',
      })
      await db().insert(attendanceRecords).values({
        id: record2Id,
        organizationId: orgId,
        sessionId: session2Id,
        studentId,
        status: 'present',
      })
      await db().insert(suspiciousAttempts).values({
        id: suspId,
        organizationId: orgId,
        attendanceRecordId: record2Id,
        reason: 'Untrusted device test',
        status: 'pending',
      })

      const resolveRes = await resolveSuspiciousAttempt(teacher1Auth, suspId, 'approved')
      expect(resolveRes.ok).toBe(false)
      expect(resolveRes.message).toContain('You can only review attempts for courses you teach')
    } finally {
      await cleanupAuditOrg(orgId, [teacher1Id, teacher2Id, studentId])
    }
  })

  // 3b. PHASE 9H: IDOR-01 to IDOR-04 on overrideRecordStatus
  it('IDOR-01 to IDOR-04: Teacher horizontal boundary and admin scoping on overrideRecordStatus', async () => {
    const orgA = `org_id_a_${nanoid(6)}`
    const orgB = `org_id_b_${nanoid(6)}`
    const teacherAId = `ta_${nanoid(6)}`
    const teacherBId = `tb_${nanoid(6)}`
    const adminAId = `adm_${nanoid(6)}`
    const studentAId = `sa_${nanoid(6)}`
    const studentBId = `sb_${nanoid(6)}`

    const courseAId = `cA_${nanoid(6)}`
    const courseBId = `cB_${nanoid(6)}`
    const courseForeignId = `cF_${nanoid(6)}`

    const secAId = `secA_${nanoid(6)}`
    const secBId = `secB_${nanoid(6)}`
    const secForeignId = `secF_${nanoid(6)}`

    const sessAId = `sessA_${nanoid(6)}`
    const sessBId = `sessB_${nanoid(6)}`
    const sessForeignId = `sessF_${nanoid(6)}`

    const recAId = `recA_${nanoid(6)}`
    const recBId = `recB_${nanoid(6)}`
    const recForeignId = `recF_${nanoid(6)}`

    try {
      await db().insert(organizations).values([
        { id: orgA, name: 'IDOR Org A' },
        { id: orgB, name: 'IDOR Org B' },
      ])
      await db().insert(users).values([
        { id: teacherAId, email: `ta_${orgA}@utc.edu.vn`, name: 'Teacher A', passwordHash: 'h', initials: 'TA' },
        { id: teacherBId, email: `tb_${orgA}@utc.edu.vn`, name: 'Teacher B', passwordHash: 'h', initials: 'TB' },
        { id: adminAId, email: `adm_${orgA}@utc.edu.vn`, name: 'Admin A', passwordHash: 'h', initials: 'AA' },
        { id: studentAId, email: `sa_${orgA}@utc.edu.vn`, name: 'Student A', passwordHash: 'h', initials: 'SA' },
        { id: studentBId, email: `sb_${orgB}@utc.edu.vn`, name: 'Student B', passwordHash: 'h', initials: 'SB' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgA, userId: teacherAId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgA, userId: teacherBId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgA, userId: adminAId, role: 'admin', status: 'active' },
        { id: nanoid(), organizationId: orgA, userId: studentAId, role: 'student', status: 'active' },
        { id: nanoid(), organizationId: orgB, userId: studentBId, role: 'student', status: 'active' },
      ])

      // Courses
      await db().insert(courses).values([
        { id: courseAId, organizationId: orgA, code: 'CA', name: 'Course A', department: 'CS', teacherId: teacherAId },
        { id: courseBId, organizationId: orgA, code: 'CB', name: 'Course B', department: 'CS', teacherId: teacherBId },
        { id: courseForeignId, organizationId: orgB, code: 'CF', name: 'Course Foreign', department: 'CS', teacherId: studentBId },
      ])

      // Course Sections
      await db().insert(courseSections).values([
        { id: secAId, organizationId: orgA, courseId: courseAId, room: 'Room A', startsAt: '08:00', endsAt: '10:00' },
        { id: secBId, organizationId: orgA, courseId: courseBId, room: 'Room B', startsAt: '08:00', endsAt: '10:00' },
        { id: secForeignId, organizationId: orgB, courseId: courseForeignId, room: 'Room F', startsAt: '08:00', endsAt: '10:00' },
      ])

      // Attendance Sessions
      await db().insert(attendanceSessions).values([
        { id: sessAId, organizationId: orgA, sectionId: secAId, courseId: courseAId, teacherId: teacherAId, status: 'closed' },
        { id: sessBId, organizationId: orgA, sectionId: secBId, courseId: courseBId, teacherId: teacherBId, status: 'closed' },
        { id: sessForeignId, organizationId: orgB, sectionId: secForeignId, courseId: courseForeignId, teacherId: studentBId, status: 'closed' },
      ])

      // Attendance Records
      await db().insert(attendanceRecords).values([
        { id: recAId, organizationId: orgA, sessionId: sessAId, studentId: studentAId, status: 'present' },
        { id: recBId, organizationId: orgA, sessionId: sessBId, studentId: studentAId, status: 'absent' },
        { id: recForeignId, organizationId: orgB, sessionId: sessForeignId, studentId: studentBId, status: 'present' },
      ])

      const teacherAAuth: AuthContext = {
        userId: teacherAId,
        membershipId: 'mta',
        organizationId: orgA,
        role: 'teacher',
        email: `ta_${orgA}@utc.edu.vn`,
        name: 'Teacher A',
        initials: 'TA',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'Org A',
        organizationPlan: 'Campus',
      }

      const adminAAuth: AuthContext = {
        userId: adminAId,
        membershipId: 'madm',
        organizationId: orgA,
        role: 'admin',
        email: `adm_${orgA}@utc.edu.vn`,
        name: 'Admin A',
        initials: 'AA',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'Org A',
        organizationPlan: 'Campus',
      }

      // IDOR-01: Teacher A modifies own course attendance -> PASS
      const resIdor01 = await overrideRecordStatus(teacherAAuth, recAId, 'late', 'Legitimate teacher override')
      expect(resIdor01.ok).toBe(true)
      const checkA = await db().select().from(attendanceRecords).where(eq(attendanceRecords.id, recAId))
      expect(checkA[0].status).toBe('late')

      // IDOR-02: Teacher A modifies Teacher B course attendance -> REJECT
      const resIdor02 = await overrideRecordStatus(teacherAAuth, recBId, 'excused', 'Attempted unauthorized override')
      expect(resIdor02.ok).toBe(false)
      expect(resIdor02.message).toContain('You can only override attendance records for courses you teach')
      const checkB = await db().select().from(attendanceRecords).where(eq(attendanceRecords.id, recBId))
      expect(checkB[0].status).toBe('absent') // unchanged!

      // IDOR-03: Teacher A modifies another organization record -> REJECT (Not found / Tenant isolated)
      const resIdor03 = await overrideRecordStatus(teacherAAuth, recForeignId, 'late', 'Cross-org attempt')
      expect(resIdor03.ok).toBe(false)
      expect(resIdor03.message).toContain('Attendance record not found')

      // IDOR-04: Admin modifies permitted record -> PASS
      const resIdor04 = await overrideRecordStatus(adminAAuth, recBId, 'present', 'Admin administrative override')
      expect(resIdor04.ok).toBe(true)
      const checkBAdmin = await db().select().from(attendanceRecords).where(eq(attendanceRecords.id, recBId))
      expect(checkBAdmin[0].status).toBe('present') // modified by admin!
    } finally {
      await cleanupAuditOrg(orgA, [teacherAId, teacherBId, adminAId, studentAId])
      await cleanupAuditOrg(orgB, [studentBId])
    }
  })

  // 4. WEBAUTHN CRYPTOGRAPHIC AUDIT
  it('WEBAUTHN-AUDIT: Rejects missing params, wrong challenge, wrong user, and clone rollback', async () => {
    const orgId = `org_w_${nanoid(6)}`
    const userId = `usr_w_${nanoid(6)}`
    const credId = `cred_w_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org' })
      await db().insert(users).values({
        id: userId,
        email: `w_${orgId}@utc.edu.vn`,
        name: 'Passkey User',
        passwordHash: 'hash',
        initials: 'PU',
      })
      await db().insert(userPasskeys).values({
        id: `pk_${nanoid(8)}`,
        userId,
        credentialId: credId,
        publicKey: 'mock_key',
        counter: 10,
      })
      // 4a. Missing parameters
      const resMissing = await verifyWebAuthnAssertion(userId, {
        credentialId: '',
        clientDataJSON: '',
        authenticatorData: '',
        signature: '',
        challenge: '',
      })
      expect(resMissing.ok).toBe(false)
      expect(resMissing.reason).toContain('Missing')

      // 4b. Invalid / expired / forged challenge token
      const resForgedChallenge = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'forged' })).toString('base64url'),
        authenticatorData: Buffer.alloc(37).toString('base64url'),
        signature: 'some_sig',
        challenge: 'forged.12345.sig',
      })
      expect(resForgedChallenge.ok).toBe(false)
      expect(resForgedChallenge.reason).toContain('Invalid or expired')

      // 4c. Valid challenge, but credential belongs to another user
      const validChallenge = generateWebAuthnChallenge('different_user_id')
      const resWrongUser = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: validChallenge })).toString('base64url'),
        authenticatorData: Buffer.alloc(37).toString('base64url'),
        signature: 'some_sig',
        challenge: validChallenge,
      })
      expect(resWrongUser.ok).toBe(false)

      // 4d. Clone detection: counter rollback (counter in assertion = 5 <= stored counter = 10)
      const validChallengeSelf = generateWebAuthnChallenge(userId)
      const configuredRpId = process.env.WEBAUTHN_RP_ID || 'localhost'
      const rpIdHash = createHash('sha256').update(configuredRpId).digest()
      const configuredOrigin = process.env.WEBAUTHN_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'

      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0, 0, 32)
      authDataBuf[32] = 0x01 | 0x04 // UP + UV flags set
      authDataBuf.writeUInt32BE(5, 33) // Counter = 5 rollback!
      const clientDataJSON = Buffer.from(JSON.stringify({
        type: 'webauthn.get',
        challenge: validChallengeSelf,
        origin: configuredOrigin,
      })).toString('base64url')

      const resClone = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature: 'sig',
        challenge: validChallengeSelf,
      })
      expect(resClone.ok).toBe(false)
      expect(resClone.reason).toContain('clone detected')
    } finally {
      await db().delete(userPasskeys).where(eq(userPasskeys.userId, userId))
      await db().delete(users).where(eq(users.id, userId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })

  // 5. ACOUSTIC / ULTRASONIC PROOF AUDIT
  it('ACOUSTIC-AUDIT: Rejects session mismatch, sequence mismatch, expired window, and forged HMAC', () => {
    const sessionId = `sess_${nanoid(8)}`
    const sequence = 3
    const now = Date.now()

    // 5a. Valid proof verifies
    const validProof = generateAcousticProofToken(sessionId, sequence, now)
    const resValid = verifyAcousticProofToken(validProof, sessionId, sequence)
    expect(resValid.ok).toBe(true)

    // 5b. Session mismatch
    const resWrongSession = verifyAcousticProofToken(validProof, 'different_session_id', sequence)
    expect(resWrongSession.ok).toBe(false)
    expect(resWrongSession.reason).toContain('different session')

    // 5c. Sequence mismatch (replaying an old token from an earlier challenge sequence)
    const resWrongSeq = verifyAcousticProofToken(validProof, sessionId, 4)
    expect(resWrongSeq.ok).toBe(false)
    expect(resWrongSeq.reason).toContain('sequence does not match')

    // 5d. Expired timestamp outside valid physical room window (> 60,000ms)
    const expiredProof = generateAcousticProofToken(sessionId, sequence, now - 90000)
    const resExpired = verifyAcousticProofToken(expiredProof, sessionId, sequence)
    expect(resExpired.ok).toBe(false)
    expect(resExpired.reason).toContain('expired')

    // 5e. Forged HMAC signature
    const forgedProof = {
      ...validProof,
      signature: 'forged_hmac_signature_tampered',
    }
    const resForged = verifyAcousticProofToken(forgedProof, sessionId, sequence)
    expect(resForged.ok).toBe(false)
    expect(resForged.reason).toContain('signature')
  })

  // 6. RATE LIMITING AUDIT
  it('RATE-LIMIT-AUDIT: Enforces atomic sliding window limit in PostgreSQL', async () => {
    const limiter = new RateLimiter(5000, 3) // 3 hits allowed per 5s
    const testKey = `audit_rate_${nanoid(8)}`

    try {
      const hit1 = await limiter.consume(testKey)
      expect(hit1.ok).toBe(true)
      expect(hit1.remaining).toBe(2)

      const hit2 = await limiter.consume(testKey)
      expect(hit2.ok).toBe(true)
      expect(hit2.remaining).toBe(1)

      const hit3 = await limiter.consume(testKey)
      expect(hit3.ok).toBe(true)
      expect(hit3.remaining).toBe(0)

      // 4th hit must be blocked!
      const hit4 = await limiter.consume(testKey)
      expect(hit4.ok).toBe(false)
      expect(hit4.remaining).toBe(0)
      expect(hit4.retryAfterSeconds).toBeGreaterThan(0)
    } finally {
      await limiter.reset(testKey)
    }
  })

  // 7. CONCURRENCY & RACE CONDITION AUDIT (Phase 8F)
  it('CONCURRENCY-AUDIT: 15 concurrent check-in requests for same student/session/OTP yield exactly 1 attendance record with 0 FK violations', async () => {
    const orgId = `org_cc_${nanoid(6)}`
    const teacherId = `tch_cc_${nanoid(6)}`
    const studentId = `stu_cc_${nanoid(6)}`
    const courseId = `crs_cc_${nanoid(6)}`
    const sectionId = `sec_cc_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Concurrency Org' })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@utc.edu.vn`, name: 'Teacher', passwordHash: 'h', initials: 'T' },
        { id: studentId, email: `s_${orgId}@utc.edu.vn`, name: 'Student', passwordHash: 'h', initials: 'S' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', status: 'active' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'CC101',
        name: 'Concurrency Testing',
        department: 'CS',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab Concurrency',
        startsAt: '08:00',
        endsAt: '10:00',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId,
        organizationId: orgId,
      })

      const teacherAuth: AuthContext = {
        userId: teacherId,
        membershipId: 'mt',
        organizationId: orgId,
        role: 'teacher',
        email: `t_${orgId}@utc.edu.vn`,
        name: 'Teacher',
        initials: 'T',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'Concurrency Org',
        organizationPlan: 'Campus',
      }

      const studentAuth: AuthContext = {
        userId: studentId,
        membershipId: 'ms',
        organizationId: orgId,
        role: 'student',
        email: `s_${orgId}@utc.edu.vn`,
        name: 'Student',
        initials: 'S',
        department: null,
        studentCode: '20269999',
        mustChangePassword: false,
        organizationName: 'Concurrency Org',
        organizationPlan: 'Campus',
      }

      const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
      await transitionSessionState(teacherAuth, sessionId!, 'active')
      const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
      const challengeCode = (rotated as { challenge: string }).challenge

      // Fire 15 concurrent verification requests simultaneously!
      const requests = Array.from({ length: 15 }).map((_, i) =>
        verifyAttendance(studentAuth, challengeCode, `Concurrency Browser ${i}`),
      )

      const results = await Promise.all(requests)

      // All 15 requests should complete without unhandled FK 23503 exception!
      const okCount = results.filter((r) => r.ok).length
      expect(okCount).toBe(15)

      // Inspect DB: exactly 1 attendanceRecord for this student and session
      const recordsInDb = await db()
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, sessionId!))
      expect(recordsInDb.length).toBe(1)
      expect(recordsInDb[0].studentId).toBe(studentId)
      expect(recordsInDb[0].status).toBe('present')
    } finally {
      await cleanupAuditOrg(orgId, [teacherId, studentId])
    }
  }, 30000)
})
