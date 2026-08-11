import { createHash, randomBytes } from 'crypto'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

export function generateChallengeValue(length = 6) {
  const bytes = randomBytes(length)
  return Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length]).join('')
}

export function hashChallengeValue(value: string) {
  return createHash('sha256').update(value.trim().toUpperCase()).digest('hex')
}

export function verifyChallengeValue(input: string, valueHash: string) {
  return hashChallengeValue(input) === valueHash
}
