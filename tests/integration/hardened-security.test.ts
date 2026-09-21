import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { createHash, generateKeyPairSync, sign } from 'crypto'
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
  notifications,
  organizationMemberships,
  organizations,
  suspiciousAttempts,
  userPasskeys,
  users,
} from '@/lib/db/schema'
import {
  getOrCreateLiveSession,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import {
  generateWebAuthnChallenge,
  saveUserPasskey,
  type WebAuthnAssertionInput,
} from '@/lib/auth/webauthn'
import {
  generateAcousticProofToken,
} from '@/lib/attendance/ultrasonic'
import {
  changeUserPassword,
  importStudents,
  selfServiceResetPassword,
} from '@/lib/auth/users'
import { createAuthSession, getAuthContext, type AuthContext } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

async function cleanupHardenOrg(orgId: string, userIds: string[] = []) {
  try {
    await db().delete(notifications).where(eq(notifications.organizationId, orgId))
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
    await db().delete(suspiciousAttempts).where(eq(suspiciousAttempts.organizationId, orgId))
    await db().delete(devices).where(eq(devices.organizationId, orgId))
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
    // ignore
  }
}

describe.skipIf(!hasDb)('Hardened Security & Verification Suite', () => {
  it('HARDEN-01: Neutralizes naked boolean biometricVerified & ultrasonicVerified flags without cryptographic proofs', async () => {
    const orgId = `org_h1_${nanoid(6)}`
    const teacherId = `tch_h1_${nanoid(6)}`
    const studentId = `stu_h1_${nanoid(6)}`
    const courseId = `crs_h1_${nanoid(6)}`
    const sectionId = `sec_h1_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Harden Org 1', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@t.com`, name: 'Teacher H1', passwordHash: 'hash', initials: 'TH' },
        { id: studentId, email: `s_${orgId}@s.com`, name: 'Student H1', passwordHash: 'hash', initials: 'SH' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', status: 'active', studentCode: '2026001' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'SEC101',
        name: 'Security 101',
        department: 'CNTT',
        teacherId,
        status: 'active',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.404',
        startsAt: '08:00',
        endsAt: '10:00',
        dayOfWeek: 1,
        status: 'scheduled',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId,
        organizationId: orgId,
        status: 'active',
      })

      const teacherAuth: AuthContext = {
        userId: teacherId,
        membershipId: 'm_t',
        organizationId: orgId,
        role: 'teacher',
        email: 't@t.com',
        name: 'Teacher',
        initials: 'T',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'Harden Org 1',
        organizationPlan: 'Campus Plus',
      }

      const studentAuth: AuthContext = {
        userId: studentId,
        membershipId: 'm_s',
        organizationId: orgId,
        role: 'student',
        email: 's@s.com',
        name: 'Student',
        initials: 'S',
        department: null,
        studentCode: '2026001',
        mustChangePassword: false,
        organizationName: 'Harden Org 1',
        organizationPlan: 'Campus Plus',
      }

      // Teacher opens and starts the session
      const sessId = await getOrCreateLiveSession(teacherAuth, sectionId)
      expect(sessId).toBeTruthy()
      await transitionSessionState(teacherAuth, sessId!, 'active')

      const activeChallengeRow = await db()
        .select()
        .from(attendanceChallenges)
        .where(eq(attendanceChallenges.sessionId, sessId!))
      expect(activeChallengeRow.length).toBeGreaterThan(0)
      const challengeCode = activeChallengeRow[0].code!

      // Attacker attempts to spoof attendance with naked booleans (biometricVerified: true, ultrasonicVerified: true)
      // but WITHOUT sending cryptographic webauthnAssertion or acousticProof
      const result = await verifyAttendance(studentAuth, challengeCode, 'Spoofed-Client-Device', {
        method: 'ultrasonic_faceid',
        ultrasonicVerified: true, // Naked boolean
        biometricVerified: true,  // Naked boolean
      })

      expect(result.ok).toBe(true)
      // Must NOT be awarded 100 confidence because client booleans are neutralized!
      expect(result.confidence).not.toBe(100)
      expect(result.confidence).toBeLessThanOrEqual(85) // Falls back to device policy score

      // Verify the metadata in DB has ultrasonic = false and biometric = false
      const verifications = await db()
        .select()
        .from(attendanceVerifications)
        .where(eq(attendanceVerifications.organizationId, orgId))
      expect(verifications[0].metadata).toMatchObject({
        ultrasonic: false,
        biometric: false,
        proofVerified: false,
      })
    } finally {
      await cleanupHardenOrg(orgId, [teacherId, studentId])
    }
  })

  it('HARDEN-02: Accepts verified WebAuthn assertion and session-bound acoustic proof to award 100 score', async () => {
    const orgId = `org_h2_${nanoid(6)}`
    const teacherId = `tch_h2_${nanoid(6)}`
    const studentId = `stu_h2_${nanoid(6)}`
    const courseId = `crs_h2_${nanoid(6)}`
    const sectionId = `sec_h2_${nanoid(6)}`
    const credId = `cred_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Harden Org 2', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@t.com`, name: 'Teacher H2', passwordHash: 'hash', initials: 'TH' },
        { id: studentId, email: `s_${orgId}@s.com`, name: 'Student H2', passwordHash: 'hash', initials: 'SH' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', status: 'active', studentCode: '2026002' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'SEC102',
        name: 'Security 102',
        department: 'CNTT',
        teacherId,
        status: 'active',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.405',
        startsAt: '08:00',
        endsAt: '10:00',
        dayOfWeek: 1,
        status: 'scheduled',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId,
        organizationId: orgId,
        status: 'active',
      })

      // Register student's passkey with real RSA keypair
      const { publicKey, privateKey } = generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding: { type: 'spki', format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
      })
      await saveUserPasskey(studentId, credId, publicKey, 'iPhone Face ID')

      const teacherAuth: AuthContext = {
        userId: teacherId,
        membershipId: 'm_t',
        organizationId: orgId,
        role: 'teacher',
        email: 't@t.com',
        name: 'Teacher',
        initials: 'T',
        department: null,
        studentCode: null,
        mustChangePassword: false,
        organizationName: 'Harden Org 2',
        organizationPlan: 'Campus Plus',
      }

      const studentAuth: AuthContext = {
        userId: studentId,
        membershipId: 'm_s',
        organizationId: orgId,
        role: 'student',
        email: 's@s.com',
        name: 'Student',
        initials: 'S',
        department: null,
        studentCode: '2026002',
        mustChangePassword: false,
        organizationName: 'Harden Org 2',
        organizationPlan: 'Campus Plus',
      }

      const sessId = await getOrCreateLiveSession(teacherAuth, sectionId)
      await transitionSessionState(teacherAuth, sessId!, 'active')

      const activeChallengeRow = await db()
        .select()
        .from(attendanceChallenges)
        .where(eq(attendanceChallenges.sessionId, sessId!))
      const challengeCode = activeChallengeRow[0].code!
      const challengeSeq = activeChallengeRow[0].sequence

      // 1. Generate valid WebAuthn challenge and construct assertion
      const webauthnChallenge = generateWebAuthnChallenge(studentId)
      const configuredOrigin = process.env.WEBAUTHN_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
      const clientDataJSONBuf = Buffer.from(JSON.stringify({
        type: 'webauthn.get',
        challenge: webauthnChallenge,
        origin: configuredOrigin,
      }))
      const clientDataJSON = clientDataJSONBuf.toString('base64url')

      const configuredRpId = process.env.WEBAUTHN_RP_ID || 'localhost'
      const rpIdHash = createHash('sha256').update(configuredRpId).digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0, 0, 32)
      authDataBuf[32] = 0x01 | 0x04 // UP & UV
      authDataBuf.writeUInt32BE(1, 33) // Counter = 1
      const authenticatorData = authDataBuf.toString('base64url')

      const clientDataHash = createHash('sha256').update(clientDataJSONBuf).digest()
      const signedData = Buffer.concat([authDataBuf, clientDataHash])
      const signature = sign('SHA256', signedData, privateKey).toString('base64url')

      const validWebAuthnAssertion: WebAuthnAssertionInput = {
        credentialId: credId,
        challenge: webauthnChallenge,
        clientDataJSON,
        authenticatorData,
        signature,
      }

      // 2. Generate valid Acoustic Proof bound to session and sequence
      const acousticProof = generateAcousticProofToken(sessId!, challengeSeq)

      // Submit verification with both proofs
      const result = await verifyAttendance(studentAuth, challengeCode, 'iPhone 15 Pro (Verified FaceID)', {
        method: 'ultrasonic_faceid',
        webauthnAssertion: validWebAuthnAssertion,
        acousticProof,
      })

      expect(result.ok).toBe(true)
      expect(result.confidence).toBe(100) // 100% confidence achieved!
      expect(result.message).toContain('Xác thực sinh trắc học và sóng siêu âm thành công')

      // Case: Falsified acoustic proof (wrong sequence or wrong session) must be rejected
      const authDataBuf2 = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf2, 0, 0, 32)
      authDataBuf2[32] = 0x01 | 0x04 // UP & UV
      authDataBuf2.writeUInt32BE(2, 33) // Counter = 2 (incremented to prevent rollback detection)
      const challenge2 = generateWebAuthnChallenge(studentId)
      const clientDataJSONBuf2 = Buffer.from(JSON.stringify({
        type: 'webauthn.get',
        challenge: challenge2,
        origin: configuredOrigin,
      }))
      const clientDataJSON2 = clientDataJSONBuf2.toString('base64url')

      const clientDataHash2 = createHash('sha256').update(clientDataJSONBuf2).digest()
      const signedData2 = Buffer.concat([authDataBuf2, clientDataHash2])
      const signature2 = sign('SHA256', signedData2, privateKey).toString('base64url')

      const validAssertion2: WebAuthnAssertionInput = {
        credentialId: credId,
        challenge: challenge2,
        clientDataJSON: clientDataJSON2,
        authenticatorData: authDataBuf2.toString('base64url'),
        signature: signature2,
      }

      const fakeAcousticProof = generateAcousticProofToken('fake_session_id', 999)
      const fakeResult = await verifyAttendance(studentAuth, challengeCode, 'Hacker-Device', {
        method: 'ultrasonic_faceid',
        webauthnAssertion: validAssertion2,
        acousticProof: fakeAcousticProof,
      })
      expect(fakeResult.ok).toBe(false)
      expect(fakeResult.message).toContain('Acoustic proof')
    } finally {
      await cleanupHardenOrg(orgId, [teacherId, studentId])
    }
  })

  it('HARDEN-03: Revokes all active session tokens when user changes password or recovers account', async () => {
    const orgId = `org_h3_${nanoid(6)}`
    const userId = `u_h3_${nanoid(6)}`
    const membershipId = `m_h3_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Harden Org 3', plan: 'Campus Plus' })
      await db().insert(users).values({
        id: userId,
        email: `u_${orgId}@utc.edu.vn`,
        name: 'Session User',
        passwordHash: await hashPassword('InitialSecret123!'),
        initials: 'SU',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: membershipId,
        organizationId: orgId,
        userId,
        role: 'student',
        studentCode: '2026003',
        status: 'active',
      })

      // Create 2 active sessions for this user (e.g. laptop & phone)
      const session1 = await createAuthSession(userId, membershipId)
      const session2 = await createAuthSession(userId, membershipId)

      // Both sessions must be valid
      const auth1 = await getAuthContext(session1.token)
      const auth2 = await getAuthContext(session2.token)
      expect(auth1).not.toBeNull()
      expect(auth2).not.toBeNull()

      // User changes password via changeUserPassword
      const changeRes = await changeUserPassword(auth1!, 'InitialSecret123!', 'BrandNewPassword456!')
      expect(changeRes.ok).toBe(true)

      // Both old sessions MUST NOW BE REVOKED in auth_sessions!
      const auth1After = await getAuthContext(session1.token)
      const auth2After = await getAuthContext(session2.token)
      expect(auth1After).toBeNull()
      expect(auth2After).toBeNull()

      // Now create another active session and test self-service reset
      const session3 = await createAuthSession(userId, membershipId)
      expect(await getAuthContext(session3.token)).not.toBeNull()

      // Self-service reset password kicks out all sessions
      await selfServiceResetPassword({
        identifier: '2026003',
        portal: 'student',
      })

      expect(await getAuthContext(session3.token)).toBeNull()
    } finally {
      await db().delete(authSessions).where(eq(authSessions.userId, userId))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.userId, userId))
      await db().delete(users).where(eq(users.id, userId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })

  it('HARDEN-04: Auto-enrolls newly imported CSV students into existing course sections', async () => {
    const orgId = `org_h4_${nanoid(6)}`
    const teacherId = `tch_h4_${nanoid(6)}`
    const courseId = `crs_h4_${nanoid(6)}`
    const sectionId = `sec_h4_${nanoid(6)}`

    const teacherAuth: AuthContext = {
      userId: teacherId,
      membershipId: 'm_t4',
      organizationId: orgId,
      role: 'teacher',
      email: 'teacher4@utc.edu.vn',
      name: 'Teacher 4',
      initials: 'T4',
      department: 'CNTT',
      studentCode: null,
      mustChangePassword: false,
      organizationName: 'Harden Org 4',
      organizationPlan: 'Campus Plus',
    }

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Harden Org 4', plan: 'Campus Plus' })
      await db().insert(users).values({
        id: teacherId,
        email: `t4_${orgId}@utc.edu.vn`,
        name: 'Teacher 4',
        passwordHash: 'hash',
        initials: 'T4',
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: teacherId,
        role: 'teacher',
        status: 'active',
      })
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT303',
        name: 'Lập trình Web',
        department: 'CNTT',
        teacherId,
        status: 'active',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.201 - A1',
        startsAt: '07:00',
        endsAt: '09:00',
        dayOfWeek: 2,
        status: 'scheduled',
      })

      // Import new students via CSV
      const newStudentCode = `2026${Math.floor(1000 + Math.random() * 9000)}`
      const importResult = await importStudents(teacherAuth, [
        { studentCode: newStudentCode, name: 'Trần Văn AutoEnroll', department: 'CNTT' },
      ])

      expect(importResult.created.length).toBe(1)
      expect(importResult.created[0].studentCode).toBe(newStudentCode)

      // Query membership to get student userId
      const membership = await db()
        .select()
        .from(organizationMemberships)
        .where(eq(organizationMemberships.studentCode, newStudentCode))
      expect(membership[0]).toBeTruthy()
      const importedStudentUserId = membership[0].userId

      // Verify that this imported student was automatically enrolled into sectionId!
      const enrollments = await db()
        .select()
        .from(classEnrollments)
        .where(
          eq(classEnrollments.studentId, importedStudentUserId),
        )
      expect(enrollments.length).toBe(1)
      expect(enrollments[0].sectionId).toBe(sectionId)
      expect(enrollments[0].status).toBe('active')

      // Clean up imported student
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, importedStudentUserId))
    } finally {
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
      await db().delete(courses).where(eq(courses.organizationId, orgId))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, teacherId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })
})
