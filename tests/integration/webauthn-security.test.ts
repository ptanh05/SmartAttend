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
  generateWebAuthnChallenge,
  saveUserPasskey,
  verifyWebAuthnAssertion,
  type WebAuthnAssertionInput,
} from '@/lib/auth/webauthn'
import {
  getOrCreateLiveSession,
  rotateChallengeForSession,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import { generateAcousticProofToken } from '@/lib/attendance/ultrasonic'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

async function cleanupWebAuthnOrg(orgId: string, userIds: string[] = []) {
  try {
    await db().delete(notifications).where(eq(notifications.organizationId, orgId))
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
    await db().delete(suspiciousAttempts).where(eq(suspiciousAttempts.organizationId, orgId))
    await db().delete(devices).where(eq(devices.organizationId, orgId))
    for (const uid of userIds) {
      await db().delete(userPasskeys).where(eq(userPasskeys.userId, uid))
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

describe.skipIf(!hasDb)('Phase 9 WebAuthn Fail-Closed & Cryptographic Verification Suite', () => {
  // Generate real cryptographic RSA key pair for testing
  const { publicKey: pemPublicKey, privateKey: pemPrivateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  })

  it('WEBAUTHN-01: Valid cryptographic assertion with genuine signature -> PASS', async () => {
    const orgId = `org_w1_${nanoid(6)}`
    const userId = `usr_w1_${nanoid(6)}`
    const credId = `cred_w1_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 1' })
      await db().insert(users).values({
        id: userId,
        email: `w1_${orgId}@utc.edu.vn`,
        name: 'Passkey User 1',
        passwordHash: 'hash',
        initials: 'P1',
      })
      await saveUserPasskey(userId, credId, pemPublicKey)

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: 'webauthn.get',
          challenge,
          origin: 'http://localhost:3000',
        }),
      ).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05 // UP (0x01) | UV (0x04)
      authDataBuf.writeUInt32BE(1, 33) // Counter = 1

      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signedData = Buffer.concat([authDataBuf, clientDataHash])
      const signature = sign('SHA256', signedData, pemPrivateKey).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature,
      })

      expect(result.ok).toBe(true)
      expect(result.credentialId).toBe(credId)
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-02: Invalid cryptographic signature -> REJECT', async () => {
    const orgId = `org_w2_${nanoid(6)}`
    const userId = `usr_w2_${nanoid(6)}`
    const credId = `cred_w2_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 2' })
      await db().insert(users).values({
        id: userId,
        email: `w2_${orgId}@utc.edu.vn`,
        name: 'Passkey User 2',
        passwordHash: 'hash',
        initials: 'P2',
      })
      await saveUserPasskey(userId, credId, pemPublicKey)

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(
        JSON.stringify({
          type: 'webauthn.get',
          challenge,
          origin: 'http://localhost:3000',
        }),
      ).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05
      authDataBuf.writeUInt32BE(1, 33)

      // Sign with a DIFFERENT private key
      const { privateKey: wrongKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signedData = Buffer.concat([authDataBuf, clientDataHash])
      const wrongSignature = sign('SHA256', signedData, wrongKey).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature: wrongSignature,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('signature check failed')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-03: Missing signature in assertion -> REJECT', async () => {
    const result = await verifyWebAuthnAssertion('usr_any', {
      credentialId: 'c1',
      challenge: 'ch1',
      clientDataJSON: 'cd1',
      authenticatorData: 'ad1',
      signature: '',
    })
    expect(result.ok).toBe(false)
    expect(result.reason).toContain('Missing required')
  })

  it('WEBAUTHN-04: Wrong credential (not registered or belonging to another user) -> REJECT', async () => {
    const orgId = `org_w4_${nanoid(6)}`
    const userA = `usr_w4a_${nanoid(6)}`
    const userB = `usr_w4b_${nanoid(6)}`
    const credId = `cred_w4_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 4' })
      await db().insert(users).values([
        { id: userA, email: `a_${orgId}@utc.edu.vn`, name: 'User A', passwordHash: 'h', initials: 'A' },
        { id: userB, email: `b_${orgId}@utc.edu.vn`, name: 'User B', passwordHash: 'h', initials: 'B' },
      ])
      // Register credential to User B
      await saveUserPasskey(userB, credId, pemPublicKey)

      // User A tries to verify with User B's credential
      const challengeA = generateWebAuthnChallenge(userA)
      const result = await verifyWebAuthnAssertion(userA, {
        credentialId: credId,
        challenge: challengeA,
        clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: challengeA })).toString('base64url'),
        authenticatorData: 'ad',
        signature: 'sig',
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('Credential not found or belongs to another user account')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userA, userB])
    }
  })

  it('WEBAUTHN-05: Wrong challenge token or challenge mismatch -> REJECT', async () => {
    const orgId = `org_w5_${nanoid(6)}`
    const userId = `usr_w5_${nanoid(6)}`
    const credId = `cred_w5_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 5' })
      await db().insert(users).values({ id: userId, email: `w5_${orgId}@utc.edu.vn`, name: 'User 5', passwordHash: 'h', initials: 'U5' })
      await saveUserPasskey(userId, credId, pemPublicKey)

      // Forged challenge
      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge: 'forged_challenge_token.12345.signature',
        clientDataJSON: Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge: 'forged_challenge_token.12345.signature' })).toString('base64url'),
        authenticatorData: 'ad',
        signature: 'sig',
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('Invalid or expired WebAuthn challenge token')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-06: Wrong RP ID hash in authenticatorData -> REJECT', async () => {
    const orgId = `org_w6_${nanoid(6)}`
    const userId = `usr_w6_${nanoid(6)}`
    const credId = `cred_w6_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 6' })
      await db().insert(users).values({ id: userId, email: `w6_${orgId}@utc.edu.vn`, name: 'User 6', passwordHash: 'h', initials: 'U6' })
      await saveUserPasskey(userId, credId, pemPublicKey)

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url')

      // Wrong RP ID (e.g. 'phishing-attacker.com' instead of 'localhost')
      const wrongRpIdHash = createHash('sha256').update('phishing-attacker.com').digest()
      const authDataBuf = Buffer.alloc(37)
      wrongRpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05 // UP & UV
      authDataBuf.writeUInt32BE(1, 33)

      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signature = sign('SHA256', Buffer.concat([authDataBuf, clientDataHash]), pemPrivateKey).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('RP ID hash does not match')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-07: Wrong origin in clientDataJSON -> REJECT', async () => {
    const orgId = `org_w7_${nanoid(6)}`
    const userId = `usr_w7_${nanoid(6)}`
    const credId = `cred_w7_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 7' })
      await db().insert(users).values({ id: userId, email: `w7_${orgId}@utc.edu.vn`, name: 'User 7', passwordHash: 'h', initials: 'U7' })
      await saveUserPasskey(userId, credId, pemPublicKey)

      const challenge = generateWebAuthnChallenge(userId)
      // Client data signed on malicious phishing origin
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'https://evil-phishing.com' })).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05
      authDataBuf.writeUInt32BE(1, 33)

      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signature = sign('SHA256', Buffer.concat([authDataBuf, clientDataHash]), pemPrivateKey).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('Origin mismatch')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-08: UP (User Present) flag missing -> REJECT', async () => {
    const orgId = `org_w8_${nanoid(6)}`
    const userId = `usr_w8_${nanoid(6)}`
    const credId = `cred_w8_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 8' })
      await db().insert(users).values({ id: userId, email: `w8_${orgId}@utc.edu.vn`, name: 'User 8', passwordHash: 'h', initials: 'U8' })
      await saveUserPasskey(userId, credId, pemPublicKey)

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x00 // UP not set!
      authDataBuf.writeUInt32BE(1, 33)

      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signature = sign('SHA256', Buffer.concat([authDataBuf, clientDataHash]), pemPrivateKey).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('User Present (UP) flag was not set')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-09: UV (User Verified) biometric flag missing -> REJECT', async () => {
    const orgId = `org_w9_${nanoid(6)}`
    const userId = `usr_w9_${nanoid(6)}`
    const credId = `cred_w9_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 9' })
      await db().insert(users).values({ id: userId, email: `w9_${orgId}@utc.edu.vn`, name: 'User 9', passwordHash: 'h', initials: 'U9' })
      await saveUserPasskey(userId, credId, pemPublicKey)

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x01 // UP is set, but UV (0x04) is NOT set!
      authDataBuf.writeUInt32BE(1, 33)

      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signature = sign('SHA256', Buffer.concat([authDataBuf, clientDataHash]), pemPrivateKey).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('User Verification (UV) flag was not set')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-10: Invalid or truncated authenticatorData (< 37 bytes) -> REJECT', async () => {
    const orgId = `org_w10_${nanoid(6)}`
    const userId = `usr_w10_${nanoid(6)}`
    const credId = `cred_w10_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 10' })
      await db().insert(users).values({ id: userId, email: `w10_${orgId}@utc.edu.vn`, name: 'User 10', passwordHash: 'h', initials: 'U10' })
      await saveUserPasskey(userId, credId, pemPublicKey)

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: Buffer.alloc(20).toString('base64url'), // Only 20 bytes
        signature: 'sig',
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('length must be at least 37 bytes')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-11: Signature counter rollback (clone detection) -> REJECT', async () => {
    const orgId = `org_w11_${nanoid(6)}`
    const userId = `usr_w11_${nanoid(6)}`
    const credId = `cred_w11_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 11' })
      await db().insert(users).values({ id: userId, email: `w11_${orgId}@utc.edu.vn`, name: 'User 11', passwordHash: 'h', initials: 'U11' })
      const passkeyId = await saveUserPasskey(userId, credId, pemPublicKey)
      // Set existing counter in DB to 50
      await db().update(userPasskeys).set({ counter: 50 }).where(eq(userPasskeys.id, passkeyId))

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05 // UP & UV
      authDataBuf.writeUInt32BE(20, 33) // Counter = 20 <= 50 (Rollback!)

      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signature = sign('SHA256', Buffer.concat([authDataBuf, clientDataHash]), pemPrivateKey).toString('base64url')

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature,
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('counter rollback')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-12: Malformed public key in DB -> REJECT', async () => {
    const orgId = `org_w12_${nanoid(6)}`
    const userId = `usr_w12_${nanoid(6)}`
    const credId = `cred_w12_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 12' })
      await db().insert(users).values({ id: userId, email: `w12_${orgId}@utc.edu.vn`, name: 'User 12', passwordHash: 'h', initials: 'U12' })
      await saveUserPasskey(userId, credId, '-----BEGIN PUBLIC KEY-----\ncorrupted_base64_content\n-----END PUBLIC KEY-----')

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05
      authDataBuf.writeUInt32BE(1, 33)

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature: 'valid_looking_sig',
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('signature verification failed')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-13: Unsupported public key format (fails closed) -> REJECT', async () => {
    const orgId = `org_w13_${nanoid(6)}`
    const userId = `usr_w13_${nanoid(6)}`
    const credId = `cred_w13_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 13' })
      await db().insert(users).values({ id: userId, email: `w13_${orgId}@utc.edu.vn`, name: 'User 13', passwordHash: 'h', initials: 'U13' })
      // Storing mock or non-PEM string previously passed under fail-open; now must strictly fail-closed
      await saveUserPasskey(userId, credId, 'raw_cose_key_buffer_or_mock_key')

      const challenge = generateWebAuthnChallenge(userId)
      const clientDataJSON = Buffer.from(JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' })).toString('base64url')

      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05
      authDataBuf.writeUInt32BE(1, 33)

      const result = await verifyWebAuthnAssertion(userId, {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature: 'sig',
      })

      expect(result.ok).toBe(false)
      expect(result.reason).toContain('signature verification failed')
    } finally {
      await cleanupWebAuthnOrg(orgId, [userId])
    }
  })

  it('WEBAUTHN-14: End-to-End verifyAttendance with cryptographic assertion + acoustic proof awards 100%, forged assertion rejects', async () => {
    const orgId = `org_w14_${nanoid(6)}`
    const teacherId = `tch_w14_${nanoid(6)}`
    const studentId = `stu_w14_${nanoid(6)}`
    const courseId = `crs_w14_${nanoid(6)}`
    const sectionId = `sec_w14_${nanoid(6)}`
    const credId = `cred_w14_${nanoid(10)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'WebAuthn Org 14' })
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
        code: 'W14',
        name: 'WebAuthn Course',
        department: 'IT',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab 14',
        startsAt: '08:00',
        endsAt: '10:00',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId,
        organizationId: orgId,
      })
      await saveUserPasskey(studentId, credId, pemPublicKey)

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
        organizationName: 'WebAuthn Org 14',
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
        studentCode: '20261414',
        mustChangePassword: false,
        organizationName: 'WebAuthn Org 14',
        organizationPlan: 'Campus',
      }

      const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
      await transitionSessionState(teacherAuth, sessionId!, 'active')
      const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
      const challengeCode = (rotated as { challenge: string }).challenge

      // Build real valid WebAuthn assertion
      const challenge = generateWebAuthnChallenge(studentId)
      const clientDataJSON = Buffer.from(
        JSON.stringify({ type: 'webauthn.get', challenge, origin: 'http://localhost:3000' }),
      ).toString('base64url')
      const rpIdHash = createHash('sha256').update('localhost').digest()
      const authDataBuf = Buffer.alloc(37)
      rpIdHash.copy(authDataBuf, 0)
      authDataBuf[32] = 0x05 // UP & UV
      authDataBuf.writeUInt32BE(1, 33)
      const clientDataHash = createHash('sha256').update(Buffer.from(clientDataJSON, 'base64url')).digest()
      const signature = sign('SHA256', Buffer.concat([authDataBuf, clientDataHash]), pemPrivateKey).toString('base64url')

      const validAssertion: WebAuthnAssertionInput = {
        credentialId: credId,
        challenge,
        clientDataJSON,
        authenticatorData: authDataBuf.toString('base64url'),
        signature,
      }

      const acousticProof = generateAcousticProofToken(sessionId!, 2) // Sequence = 2 after rotation

      // 1. Submit with valid cryptographic assertion + valid acoustic proof -> 100% confidence!
      const validResult = await verifyAttendance(studentAuth, challengeCode, 'Trusted Biometric Device', {
        method: 'ultrasonic_faceid',
        webauthnAssertion: validAssertion,
        acousticProof,
      })

      expect(validResult.ok).toBe(true)
      expect(validResult.confidence).toBe(100)

      // 2. Submit with forged WebAuthn assertion (wrong signature) -> REJECT
      const forgedAssertion: WebAuthnAssertionInput = {
        ...validAssertion,
        challenge: generateWebAuthnChallenge(studentId),
        signature: 'forged_fake_signature',
      }
      const forgedResult = await verifyAttendance(studentAuth, challengeCode, 'Hacker Device', {
        method: 'ultrasonic_faceid',
        webauthnAssertion: forgedAssertion,
        acousticProof,
      })

      expect(forgedResult.ok).toBe(false)
      expect(forgedResult.confidence).toBe(0)
    } finally {
      await cleanupWebAuthnOrg(orgId, [teacherId, studentId])
    }
  }, 30000)
})
