import { createHash, randomBytes } from 'crypto'
import { hmacFor } from '@/lib/auth/secrets'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
export const CHALLENGE_LENGTH = 6

function toAlphabet(bytes: Uint8Array, length: number) {
  // 256 is a multiple of 32, so `byte % 32` has no modulo bias.
  return Array.from(bytes.subarray(0, length), (byte) => ALPHABET[byte % ALPHABET.length]).join('')
}

export function generateChallengeValue(length = CHALLENGE_LENGTH) {
  return toAlphabet(randomBytes(length), length)
}

/**
 * Derives the challenge code of `(sessionId, sequence)` from the server's
 * purpose-separated `attendance-challenge` key (lib/auth/secrets.ts).
 *
 * The plaintext code is never persisted: the database only stores
 * `hashChallengeValue(code)`. The teacher screen re-derives the code on demand,
 * which works across serverless instances without any shared in-memory cache.
 * Without the server secret the code is unpredictable.
 */
export function deriveChallengeValue(sessionId: string, sequence: number, length = CHALLENGE_LENGTH) {
  const digest = hmacFor('attendance-challenge', `attendance-challenge:v1:${sessionId}:${sequence}`)
  return toAlphabet(digest, length)
}

export function hashChallengeValue(value: string) {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex')
}

export function verifyChallengeValue(input: string, valueHash: string) {
  return hashChallengeValue(input) === valueHash
}

/**
 * Plaintext of a stored challenge row. Rows created before the
 * "no plaintext" migration may still carry a legacy `code`; newer rows are
 * derived. The result is checked against the stored hash so a secret rotation
 * can never surface a code that would not verify.
 */
export function challengePlaintextFor(row: { sessionId: string; sequence: number; code: string | null; valueHash: string }) {
  const candidate = row.code ?? deriveChallengeValue(row.sessionId, row.sequence)
  return verifyChallengeValue(candidate, row.valueHash) ? candidate : null
}
