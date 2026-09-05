import { randomBytes } from 'crypto'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { userPasskeys } from '@/lib/db/schema'

// Memory store for active challenge tokens (keyed by userId)
const activeChallenges = new Map<string, { challenge: string; expiresAt: number }>()

export function generateWebAuthnChallenge(userId: string): string {
  const challenge = randomBytes(32).toString('base64url')
  activeChallenges.set(userId, {
    challenge,
    expiresAt: Date.now() + 5 * 60 * 1000, // 5 minutes TTL
  })
  return challenge
}

export function verifyWebAuthnChallenge(userId: string, incomingChallenge: string): boolean {
  const record = activeChallenges.get(userId)
  if (!record) return false
  if (record.expiresAt < Date.now()) {
    activeChallenges.delete(userId)
    return false
  }
  const match = record.challenge === incomingChallenge
  if (match) {
    activeChallenges.delete(userId)
  }
  return match
}

export async function saveUserPasskey(
  userId: string,
  credentialId: string,
  publicKey: string,
  deviceLabel = 'Platform Biometrics',
) {
  const existing = await db().select().from(userPasskeys).where(eq(userPasskeys.credentialId, credentialId))
  if (existing[0]) {
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
