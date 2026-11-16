import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  challengePlaintextFor,
  deriveChallengeValue,
  generateChallengeValue,
  hashChallengeValue,
  verifyChallengeValue,
} from './challenge'

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'

describe('challenge derivation (no plaintext at rest)', () => {
  const originalSecret = process.env.SESSION_SECRET

  beforeEach(() => {
    process.env.SESSION_SECRET = 'unit-test-secret-A'
  })
  afterEach(() => {
    process.env.SESSION_SECRET = originalSecret
  })

  it('derives a 6-char code from the safe alphabet, deterministically', () => {
    const a = deriveChallengeValue('sess_1', 1)
    expect(a).toHaveLength(6)
    for (const ch of a) expect(ALPHABET).toContain(ch)
    expect(deriveChallengeValue('sess_1', 1)).toBe(a)
  })

  it('changes with the sequence, the session and the secret', () => {
    const base = deriveChallengeValue('sess_1', 1)
    const codes = new Set<string>()
    for (let seq = 1; seq <= 200; seq++) codes.add(deriveChallengeValue('sess_1', seq))
    expect(codes.size).toBeGreaterThan(190)
    expect(deriveChallengeValue('sess_2', 1)).not.toBe(base)
    process.env.SESSION_SECRET = 'unit-test-secret-B'
    expect(deriveChallengeValue('sess_1', 1)).not.toBe(base)
  })

  it('challengePlaintextFor re-derives the code of a row stored without plaintext', () => {
    const code = deriveChallengeValue('sess_9', 4)
    const row = { sessionId: 'sess_9', sequence: 4, code: null, valueHash: hashChallengeValue(code) }
    expect(challengePlaintextFor(row)).toBe(code)
    expect(verifyChallengeValue(challengePlaintextFor(row)!, row.valueHash)).toBe(true)
  })

  it('challengePlaintextFor returns null when the derived code would not verify (e.g. legacy random row after migration, or rotated secret)', () => {
    const legacyRandom = generateChallengeValue()
    const row = { sessionId: 'sess_9', sequence: 4, code: null, valueHash: hashChallengeValue(legacyRandom) }
    // Derived value almost surely differs from the random legacy one.
    if (deriveChallengeValue('sess_9', 4) !== legacyRandom) {
      expect(challengePlaintextFor(row)).toBeNull()
    }
  })

  it('challengePlaintextFor still serves a legacy row that kept its plaintext (pre-migration rows)', () => {
    const legacy = 'ABC234'
    const row = { sessionId: 'sess_x', sequence: 1, code: legacy, valueHash: hashChallengeValue(legacy) }
    expect(challengePlaintextFor(row)).toBe(legacy)
  })
})
