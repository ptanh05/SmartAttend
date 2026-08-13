import { describe, expect, it } from 'vitest'
import { clientIp, SlidingWindowRateLimiter } from './rate-limit'

describe('SlidingWindowRateLimiter', () => {
  it('allows up to the configured number of hits within the window', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 3)
    expect(limiter.consume('a', 0).ok).toBe(true)
    expect(limiter.consume('a', 1).ok).toBe(true)
    expect(limiter.consume('a', 2).ok).toBe(true)
    const blocked = limiter.consume('a', 3)
    expect(blocked.ok).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('tracks keys independently', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 1)
    expect(limiter.consume('a', 0).ok).toBe(true)
    expect(limiter.consume('a', 1).ok).toBe(false)
    expect(limiter.consume('b', 1).ok).toBe(true)
  })

  it('reports remaining capacity', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 3)
    expect(limiter.consume('a', 0).remaining).toBe(2)
    expect(limiter.consume('a', 1).remaining).toBe(1)
    expect(limiter.consume('a', 2).remaining).toBe(0)
  })

  it('expires hits once the window has passed', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 1)
    expect(limiter.consume('a', 0).ok).toBe(true)
    // Same key after the window elapses is allowed again.
    expect(limiter.consume('a', 61_000).ok).toBe(true)
  })

  it('computes retryAfterSeconds from the oldest hit', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 1)
    limiter.consume('a', 0)
    const blocked = limiter.consume('a', 30_000)
    expect(blocked.ok).toBe(false)
    expect(blocked.retryAfterSeconds).toBe(30)
  })

  it('reset clears the counter for a key', () => {
    const limiter = new SlidingWindowRateLimiter(60_000, 1)
    expect(limiter.consume('a', 0).ok).toBe(true)
    expect(limiter.consume('a', 1).ok).toBe(false)
    limiter.reset('a')
    expect(limiter.consume('a', 2).ok).toBe(true)
  })
})

describe('clientIp', () => {
  it('prefers the first x-forwarded-for entry', () => {
    const request = new Request('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    expect(clientIp(request)).toBe('1.2.3.4')
  })

  it('falls back to x-real-ip then unknown', () => {
    expect(clientIp(new Request('http://localhost/x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9')
    expect(clientIp(new Request('http://localhost/x'))).toBe('unknown')
  })
})
