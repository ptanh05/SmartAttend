import { createHmac, randomBytes, timingSafeEqual } from 'crypto'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { userPasskeys } from '@/lib/db/schema'

const HMAC_SECRET = process.env.SESSION_SECRET || process.env.TEACHER_REGISTRATION_API_KEY || 'smartattend_webauthn_challenge_secret'

function signChallenge(userId: string, nonce: string, expiresAt: number): string {
  const data = `${userId}:${nonce}:${expiresAt}`
  return createHmac('sha256', HMAC_SECRET).update(data).digest('base64url')
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
