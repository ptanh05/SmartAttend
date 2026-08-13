import { describe, expect, it } from 'vitest'
import { canTransition, transitionSession } from './session-state'
import type { SessionStatus } from '@/lib/types/domain'

describe('session-state', () => {
  it.each<[SessionStatus, SessionStatus, boolean]>([
    ['draft', 'active', true],
    ['scheduled', 'active', true],
    ['active', 'paused', true],
    ['active', 'closed', true],
    ['active', 'expired', true],
    ['live', 'paused', true],
    ['live', 'closed', true],
    ['live', 'expired', true],
    ['paused', 'active', true],
    ['paused', 'closed', true],
    ['paused', 'expired', true],
    ['closed', 'active', false],
    ['closed', 'expired', false],
    ['expired', 'active', false],
    ['expired', 'closed', false],
    ['draft', 'closed', false],
    ['active', 'draft', false],
    ['active', 'scheduled', false],
  ])('canTransition(%s -> %s) is %s', (from, to, expected) => {
    expect(canTransition(from, to)).toBe(expected)
  })

  it('returns ok with the new status for a valid transition', () => {
    const result = transitionSession({ id: 's1', status: 'draft' }, 'active')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.session.status).toBe('active')
      expect(result.message).toContain('active')
    }
  })

  it('rejects an invalid transition without mutating the session', () => {
    const session = { id: 's1', status: 'closed' as SessionStatus }
    const result = transitionSession(session, 'active')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.session.status).toBe('closed')
      expect(result.message).toContain('closed')
    }
  })
})
