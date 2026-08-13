import { describe, expect, it } from 'vitest'
import { generateChallengeValue, hashChallengeValue, verifyChallengeValue } from './challenge'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

describe('challenge', () => {
  it('generates a value with the requested length using only the safe alphabet', () => {
    for (let i = 0; i < 100; i++) {
      const value = generateChallengeValue(6)
      expect(value).toHaveLength(6)
      for (const char of value) {
        expect(ALPHABET).toContain(char)
      }
    }
  })

  it('generates random (non-colliding) values', () => {
    const seen = new Set<string>()
    for (let i = 0; i < 1000; i++) {
      seen.add(generateChallengeValue(6))
    }
    expect(seen.size).toBeGreaterThan(900)
  })

  it('hashes deterministically as lowercase hex sha256', () => {
    const hash = hashChallengeValue('ABC123')
    expect(hash).toBe(hashChallengeValue('abc123'))
    expect(hash).toMatch(/^[0-9a-f]{64}$/)
  })

  it('verifies the correct value case-insensitively', () => {
    const hash = hashChallengeValue('ABC123')
    expect(verifyChallengeValue('ABC123', hash)).toBe(true)
    expect(verifyChallengeValue('abc123', hash)).toBe(true)
  })

  it('rejects a wrong value', () => {
    const hash = hashChallengeValue('ABC123')
    expect(verifyChallengeValue('XYZ999', hash)).toBe(false)
  })
})
