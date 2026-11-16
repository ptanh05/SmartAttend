import { createHash, createPublicKey, randomBytes, timingSafeEqual, verify } from 'crypto'
import { hmacFor } from '@/lib/auth/secrets'
import { parseCoseKey, samePublicKey } from '@/lib/auth/cose'
import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { rateLimits, userPasskeys } from '@/lib/db/schema'

export function getWebAuthnRpId(): string {
  return process.env.WEBAUTHN_RP_ID || 'localhost'
}

export function getWebAuthnOrigin(): string {
  return process.env.WEBAUTHN_ORIGIN || process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'
}

function signChallenge(userId: string, nonce: string, expiresAt: number): string {
  const data = `${userId}:${nonce}:${expiresAt}`
  return hmacFor('webauthn-challenge', data).toString('base64url')
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

/**
 * Marks a (valid, unexpired) challenge as used. Returns false when the same
 * challenge was already consumed, which blocks replay of registration or
 * assertion payloads inside the 5-minute window. Stored in the existing
 * `rate_limits` key/value table (key prefix `webauthn-nonce:`) so no schema
 * change is required.
 */
export async function consumeWebAuthnChallenge(challenge: string): Promise<boolean> {
  const [nonce, expiresAtStr] = challenge.split('.')
  const expiresAt = Number(expiresAtStr)
  if (!nonce || !expiresAt) return false
  const inserted = await db()
    .insert(rateLimits)
    .values({ key: `webauthn-nonce:${nonce}`, hits: 1, resetAt: new Date(expiresAt) })
    .onConflictDoNothing()
    .returning({ key: rateLimits.key })
  return inserted.length === 1
}

type ClientData = { type?: string; challenge?: string; origin?: string }

function decodeClientData(clientDataJSON: string): { raw: Buffer; data: ClientData } | null {
  try {
    const raw = clientDataJSON.trim().startsWith('{')
      ? Buffer.from(clientDataJSON, 'utf8')
      : Buffer.from(clientDataJSON, 'base64url')
    return { raw, data: JSON.parse(raw.toString('utf8')) as ClientData }
  } catch {
    return null
  }
}

/**
 * Checks the RP ID hash and the User Present / User Verified flags of
 * authenticator data (first 37 bytes). Shared by registration and assertion.
 */
export function checkAuthenticatorData(authDataBuf: Buffer): string | null {
  if (authDataBuf.length < 37) return 'Malformed authenticatorData payload: length must be at least 37 bytes.'
  const expectedRpIdHash = createHash('sha256').update(getWebAuthnRpId()).digest()
  if (!timingSafeEqual(expectedRpIdHash, authDataBuf.subarray(0, 32))) {
    return 'RP ID hash does not match expected application RP ID.'
  }
  const flags = authDataBuf[32]
  if ((flags & 0x01) === 0) return 'Authenticator Data indicates User Present (UP) flag was not set.'
  if ((flags & 0x04) === 0) return 'Authenticator Data indicates User Verification (UV) flag was not set.'
  return null
}

export type PasskeyRegistrationInput = {
  credentialId: string
  publicKey: string
  challenge: string
  clientDataJSON: string
  authenticatorData: string
}

/**
 * Server-side verification of a passkey registration (attestation "none").
 *
 * Verified: challenge issued by this server for this user, unexpired and
 * single-use; clientData type/challenge/origin; RP ID hash; UP + UV flags;
 * attested credential data present and bound to `credentialId`; the stored
 * public key is DERIVED from the COSE_Key inside the authenticator data
 * (ES256/P-256 or RS256 ≥2048-bit) — the client-supplied SPKI is only accepted
 * if it is the very same key.
 *
 * NOT verified (policy decision pending): the attestation statement / device
 * vendor. With attestation "none" a determined user can still register a
 * software authenticator; see docs/INDEPENDENT_SECURITY_REVIEW.md.
 */
export async function verifyPasskeyRegistration(
  userId: string,
  input: PasskeyRegistrationInput,
): Promise<{ ok: true; publicKeyPem: string } | { ok: false; reason: string }> {
  if (!input.credentialId || !input.publicKey || !input.challenge || !input.clientDataJSON || !input.authenticatorData) {
    return { ok: false, reason: 'Missing required WebAuthn registration parameters.' }
  }
  if (!verifyWebAuthnChallenge(userId, input.challenge)) {
    return { ok: false, reason: 'Invalid or expired WebAuthn challenge.' }
  }

  const clientData = decodeClientData(input.clientDataJSON)
  if (!clientData) return { ok: false, reason: 'Malformed clientDataJSON payload.' }
  if (clientData.data.type !== 'webauthn.create') {
    return { ok: false, reason: `Invalid clientData type "${clientData.data.type}", expected "webauthn.create".` }
  }
  if (clientData.data.challenge !== input.challenge) {
    return { ok: false, reason: 'Challenge in clientDataJSON does not match the issued challenge.' }
  }
  if (clientData.data.origin !== getWebAuthnOrigin()) {
    return { ok: false, reason: 'Origin mismatch in clientDataJSON.' }
  }

  const authDataBuf = Buffer.from(input.authenticatorData, 'base64url')
  const authDataError = checkAuthenticatorData(authDataBuf)
  if (authDataError) return { ok: false, reason: authDataError }

  // Attested credential data (AT flag 0x40): aaguid(16) | credIdLen(2) | credId
  if ((authDataBuf[32] & 0x40) === 0 || authDataBuf.length < 55) {
    return { ok: false, reason: 'Authenticator data does not contain attested credential data.' }
  }
  const credIdLen = authDataBuf.readUInt16BE(53)
  const embeddedCredId = authDataBuf.subarray(55, 55 + credIdLen)
  const providedCredId = Buffer.from(input.credentialId, 'base64url')
  if (embeddedCredId.length !== credIdLen || !embeddedCredId.equals(providedCredId)) {
    return { ok: false, reason: 'credentialId does not match the attested credential data.' }
  }

  // credentialPublicKey (COSE_Key) follows the credential id.
  let coseKey: ReturnType<typeof parseCoseKey>
  try {
    coseKey = parseCoseKey(authDataBuf.subarray(55 + credIdLen))
  } catch (err) {
    return { ok: false, reason: `Invalid credential public key: ${err instanceof Error ? err.message : 'unparseable'}` }
  }

  let clientKey
  try {
    clientKey = createPublicKey(input.publicKey)
  } catch {
    return { ok: false, reason: 'Passkey public key is not a valid SPKI key.' }
  }
  if (!samePublicKey(clientKey, coseKey.key)) {
    return { ok: false, reason: 'Submitted public key does not match the authenticator credential public key.' }
  }

  if (!(await consumeWebAuthnChallenge(input.challenge))) {
    return { ok: false, reason: 'WebAuthn challenge has already been used.' }
  }
  return { ok: true, publicKeyPem: coseKey.key.export({ format: 'pem', type: 'spki' }).toString() }
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
  /**
   * Ignored. Kept only for backward compatibility of the request schema: the
   * expected origin is server configuration and is never taken from the client.
   */
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
  const decodedClientData = decodeClientData(assertion.clientDataJSON)
  if (!decodedClientData) {
    return { ok: false, reason: 'Malformed clientDataJSON payload.' }
  }
  const clientData = decodedClientData.data

  if (clientData.type !== 'webauthn.get') {
    return { ok: false, reason: `Invalid clientData type "${clientData.type}", expected "webauthn.get".` }
  }

  if (!clientData.challenge || clientData.challenge !== assertion.challenge) {
    return { ok: false, reason: 'Challenge in clientDataJSON does not match the provided challenge.' }
  }

  // Case 10: Validate application origin. The expected origin comes from
  // server configuration only, and a missing origin is rejected.
  const expectedOrigin = getWebAuthnOrigin()
  if (clientData.origin !== expectedOrigin) {
    return { ok: false, reason: `Origin mismatch: expected "${expectedOrigin}", got "${clientData.origin ?? '(missing)'}".` }
  }

  // Case 8: Authenticator Data validation
  let authDataBuf: Buffer
  try {
    authDataBuf = Buffer.from(assertion.authenticatorData, 'base64url')
  } catch {
    return { ok: false, reason: 'Malformed authenticatorData payload.' }
  }

  // Case 8, 9 & 11: RP ID hash, User Present and User Verified flags
  const authDataError = checkAuthenticatorData(authDataBuf)
  if (authDataError) {
    return { ok: false, reason: authDataError }
  }

  // Case 12: Signature counter rollback detection (Authenticator clone prevention)
  const counter = authDataBuf.readUInt32BE(33)
  if (counter > 0 && passkey.counter > 0 && counter <= passkey.counter) {
    return { ok: false, reason: 'Potential authenticator clone detected: signature counter rollback.' }
  }

  // Case 3 & 5: Cryptographic signature verification with registered public key
  const clientDataBuf = decodedClientData.raw
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

  // Single-use challenge: a captured assertion cannot be replayed.
  if (!(await consumeWebAuthnChallenge(assertion.challenge))) {
    return { ok: false, reason: 'WebAuthn challenge has already been used.' }
  }

  // Case 13: All checks passed! Update counter if incremented
  if (counter > passkey.counter) {
    await db().update(userPasskeys).set({ counter }).where(eq(userPasskeys.id, passkey.id))
  }

  return { ok: true, credentialId: passkey.credentialId }
}
