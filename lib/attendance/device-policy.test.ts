import { describe, expect, it } from 'vitest'
import { evaluateDevicePolicy, normalizeScore } from './device-policy'

describe('evaluateDevicePolicy', () => {
  it('scores a trusted device highest when no policy is enforced', () => {
    const decision = evaluateDevicePolicy({ hasTrustedDevice: true, hasSeenDevice: true, requireTrustedDevice: false })
    expect(decision.score).toBe(98)
    expect(decision.suspicious).toBe(false)
    expect(decision.allowed).toBe(true)
  })

  it('scores a seen-but-untrusted device lower when no policy is enforced', () => {
    const decision = evaluateDevicePolicy({ hasTrustedDevice: false, hasSeenDevice: true, requireTrustedDevice: false })
    expect(decision.score).toBe(85)
    expect(decision.suspicious).toBe(false)
  })

  it('scores an unseen device lowest when no policy is enforced, without flagging', () => {
    const decision = evaluateDevicePolicy({ hasTrustedDevice: false, hasSeenDevice: false, requireTrustedDevice: false })
    expect(decision.score).toBe(78)
    expect(decision.suspicious).toBe(false)
  })

  it('accepts and never flags a trusted device under an enforced policy', () => {
    const decision = evaluateDevicePolicy({ hasTrustedDevice: true, hasSeenDevice: true, requireTrustedDevice: true })
    expect(decision.score).toBe(98)
    expect(decision.suspicious).toBe(false)
    expect(decision.enforceTrustedDevice).toBe(true)
  })

  it('flags an untrusted device under an enforced policy with a low score', () => {
    const decision = evaluateDevicePolicy({ hasTrustedDevice: false, hasSeenDevice: true, requireTrustedDevice: true })
    expect(decision.suspicious).toBe(true)
    expect(decision.score).toBe(60)
    expect(decision.enforceTrustedDevice).toBe(true)
    expect(decision.allowed).toBe(true)
  })

  it('flags an unseen device under an enforced policy with the lowest score', () => {
    const decision = evaluateDevicePolicy({ hasTrustedDevice: false, hasSeenDevice: false, requireTrustedDevice: true })
    expect(decision.suspicious).toBe(true)
    expect(decision.score).toBe(55)
    expect(decision.reason).toBe('unseen_under_policy')
  })
})

describe('normalizeScore', () => {
  it('bounds scores into 0..100', () => {
    expect(normalizeScore(-10)).toBe(0)
    expect(normalizeScore(0)).toBe(0)
    expect(normalizeScore(50)).toBe(50)
    expect(normalizeScore(101)).toBe(100)
    expect(normalizeScore(75.4)).toBe(75)
  })
})
