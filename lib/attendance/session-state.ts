import type { SessionStatus } from '@/lib/types/domain'

const transitions: Record<SessionStatus, SessionStatus[]> = {
  draft: ['active'],
  scheduled: ['active'],
  active: ['paused', 'closed', 'expired'],
  live: ['paused', 'closed', 'expired'],
  paused: ['active', 'closed', 'expired'],
  closed: [],
  expired: [],
}

export function canTransition(from: SessionStatus, to: SessionStatus) {
  return transitions[from]?.includes(to) ?? false
}

export function transitionSession<T extends { status: SessionStatus }>(session: T, next: SessionStatus) {
  if (!canTransition(session.status, next)) return { ok: false as const, session, message: `Cannot move a ${session.status} session to ${next}.` }
  return { ok: true as const, session: { ...session, status: next }, message: `Session moved to ${next}.` }
}
