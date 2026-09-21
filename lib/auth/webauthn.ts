import { createHash, createHmac, randomBytes, timingSafeEqual, verify } from 'crypto'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { userPasskeys } from '@/lib/db/schema'

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET || process.env.TEACHER_REGISTRATION_API_KEY
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: SESSION_SECRET or TEACHER_REGISTRATION_API_KEY environment variable is required in production.')
  }
  return 'smartattend_webauthn_challenge_secret'
}

export function getWebAuthnRpId(): string {
  return process.env.WEBAUTHN_RP_ID || 'localhost'
}

export function getWebAuthnOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function signChallenge(userId: string, nonce: string, expiresAt: number): string {
  const data = `${userId}:${nonce}:${expiresAt}`
  return createHmac('sha256', getSessionSecret()).update(data).digest('base64url')
}

export function generateWebAuthnChallenge(userId: string): string {
  const nonce = randomBytes(16).toString('base64url')
  const expiresAt = Date.now() + 5 * 60 * 1000 // 5 minutes TTL
  const signature = signChallenge(userId, nonce, expiresAt)
  return `${nonce}.${expiresAt}.${signature}`
}

export function verifyWebAuthnChallenge(userId: string, incomingChallenge: string): boolean {
  if (!incomingChallenge || typeof incomingChallenge !== 'string') return false
  const parts = incomingChallenge.split('.')
  if (parts.length !== 3) return false

  const [nonce, expiresAtStr, providedSignature] = parts
  const expiresAt = Number(expiresAtStr)
  if (!expiresAt || expiresAt < Date.now()) return false

  const expectedSignature = signChallenge(userId, nonce, expiresAt)
  const expectedBuffer = Buffer.from(expectedSignature)
  const providedBuffer = Buffer.from(providedSignature)

  if (expectedBuffer.length !== providedBuffer.length) return false
  return timingSafeEqual(expectedBuffer, providedBuffer)
}

export async function saveUserPasskey(
  userId: string,
  credentialId: string,
  publicKey: string,
  deviceLabel = 'Platform Biometrics',
) {
  const existing = await db().select().from(userPasskeys).where(eq(userPasskeys.credentialId, credentialId))
  if (existing[0]) {
    if (existing[0].userId !== userId) {
      throw new Error('Credential ID is already registered to another user account.')
    }
    await db()
      .update(userPasskeys)
      .set({ publicKey, deviceLabel })
      .where(eq(userPasskeys.credentialId, credentialId))
    return existing[0].id
  }

  const id = `pk_${nanoid(12)}`
  await db().insert(userPasskeys).values({
    id,
    userId,
    credentialId,
    publicKey,
    deviceLabel,
    counter: 0,
  })
  return id
}

export async function getUserPasskeys(userId: string) {
  return db().select().from(userPasskeys).where(eq(userPasskeys.userId, userId))
}

export type WebAuthnAssertionInput = {
  credentialId: string
  clientDataJSON: string
  authenticatorData: string
  signature: string
  challenge: string
  origin?: string
}

export type WebAuthnVerificationResult = {
  ok: boolean
  reason?: string
  credentialId?: string
}

/**
 * Authoritatively verifies a WebAuthn assertion signature, challenge binding,
 * credential ownership, and authenticator data flags on the server.
 * Strictly FAIL-CLOSED: Every invalid condition returns ok: false.
 */
export async function verifyWebAuthnAssertion(
  userId: string,
  assertion: WebAuthnAssertionInput,
): Promise<WebAuthnVerificationResult> {
  // Case 1 & 4: Missing parameters or missing signature
  if (
    !assertion ||
    !assertion.credentialId ||
    !assertion.challenge ||
    !assertion.clientDataJSON ||
    !assertion.authenticatorData ||
    !assertion.signature
  ) {
    return { ok: false, reason: 'Missing required WebAuthn assertion parameters.' }
  }

  // Case 6: Verify challenge token was issued by this server for this user and is unexpired
  if (!verifyWebAuthnChallenge(userId, assertion.challenge)) {
    return { ok: false, reason: 'Invalid or expired WebAuthn challenge token.' }
  }

  // Case 7: Load passkey and verify user ownership
  const rows = await db()
    .select()
    .from(userPasskeys)
    .where(and(eq(userPasskeys.credentialId, assertion.credentialId), eq(userPasskeys.userId, userId)))

  const passkey = rows[0]
  if (!passkey) {
    return { ok: false, reason: 'Credential not found or belongs to another user account.' }
  }

  // Case 2: Public key exists in database
  if (!passkey.publicKey) {
    return { ok: false, reason: 'Passkey public key not found.' }
  }

  // Case 8 & 10: Parse and validate clientDataJSON
  let rawJson: string
  try {
    if (assertion.clientDataJSON.trim().startsWith('{')) {
      rawJson = assertion.clientDataJSON
    } else {
      rawJson = Buffer.from(assertion.clientDataJSON, 'base64url').toString('utf8')
    }
  } catch {
    return { ok: false, reason: 'Malformed clientDataJSON payload.' }
  }

  let clientData: { type?: string; challenge?: string; origin?: string }
  try {
    clientData = JSON.parse(rawJson)
  } catch {
    return { ok: false, reason: 'Malformed clientDataJSON payload.' }
  }

  if (clientData.type !== 'webauthn.get') {
    return { ok: false, reason: `Invalid clientData type "${clientData.type}", expected "webauthn.get".` }
  }

  if (!clientData.challenge || clientData.challenge !== assertion.challenge) {
    return { ok: false, reason: 'Challenge in clientDataJSON does not match the provided challenge.' }
  }

  // Case 10: Validate application origin
  const expectedOrigin = assertion.origin || getWebAuthnOrigin()
  if (clientData.origin && clientData.origin !== expectedOrigin) {
    return { ok: false, reason: `Origin mismatch: expected "${expectedOrigin}", got "${clientData.origin}".` }
  }

  // Case 8: Authenticator Data validation
  let authDataBuf: Buffer
  try {
    authDataBuf = Buffer.from(assertion.authenticatorData, 'base64url')
  } catch {
    return { ok: false, reason: 'Malformed authenticatorData payload.' }
  }

  if (authDataBuf.length < 37) {
    return { ok: false, reason: 'Malformed authenticatorData payload: length must be at least 37 bytes.' }
  }

  // Case 9: RP ID Hash Validation
  const expectedRpId = getWebAuthnRpId()
  const expectedRpIdHash = createHash('sha256').update(expectedRpId).digest()
  const providedRpIdHash = authDataBuf.subarray(0, 32)
  if (providedRpIdHash.length !== 32 || !timingSafeEqual(expectedRpIdHash, providedRpIdHash)) {
    return { ok: false, reason: 'RP ID hash does not match expected application RP ID.' }
  }

  // Case 8 & 11: UP (User Present) and UV (User Verified) flags
  const flags = authDataBuf[32]
  const userPresent = (flags & 0x01) !== 0
  if (!userPresent) {
    return { ok: false, reason: 'Authenticator Data indicates User Present (UP) flag was not set.' }
  }

  const userVerified = (flags & 0x04) !== 0
  if (!userVerified) {
    return { ok: false, reason: 'Authenticator Data indicates User Verification (UV) flag was not set.' }
  }

  // Case 12: Signature counter rollback detection (Authenticator clone prevention)
  const counter = authDataBuf.readUInt32BE(33)
  if (counter > 0 && passkey.counter > 0 && counter <= passkey.counter) {
    return { ok: false, reason: 'Potential authenticator clone detected: signature counter rollback.' }
  }

  // Case 3 & 5: Cryptographic signature verification with registered public key
  let clientDataBuf: Buffer
  if (assertion.clientDataJSON.trim().startsWith('{')) {
    clientDataBuf = Buffer.from(assertion.clientDataJSON, 'utf8')
  } else {
    clientDataBuf = Buffer.from(assertion.clientDataJSON, 'base64url')
  }
  const clientHash = createHash('sha256').update(clientDataBuf).digest()
  const signedData = Buffer.concat([authDataBuf, clientHash])

  let sigBuf: Buffer
  try {
    sigBuf = Buffer.from(assertion.signature, 'base64url')
    if (sigBuf.length === 0) {
      return { ok: false, reason: 'Assertion signature is empty.' }
    }
  } catch {
    return { ok: false, reason: 'Malformed assertion signature.' }
  }

  try {
    const isValidSig = verify('SHA256', signedData, passkey.publicKey, sigBuf)
    if (!isValidSig) {
      return { ok: false, reason: 'WebAuthn cryptographic signature check failed.' }
    }
  } catch (sigErr) {
    return {
      ok: false,
      reason: `WebAuthn signature verification failed: ${sigErr instanceof Error ? sigErr.message : 'unsupported key or signature format'}`,
    }
  }

  // Case 13: All checks passed! Update counter if incremented
  if (counter > passkey.counter) {
    await db().update(userPasskeys).set({ counter }).where(eq(userPasskeys.id, passkey.id))
  }

  return { ok: true, credentialId: passkey.credentialId }
}
