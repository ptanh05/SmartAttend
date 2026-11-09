import 'dotenv/config'
import { describe, expect, it } from 'vitest'
import { clientIp, RateLimiter } from './rate-limit'

describe('RateLimiter', () => {
  it('allows up to the configured number of hits within the window', async () => {
    const limiter = new RateLimiter(60_000, 3)
    await limiter.reset('a')
    expect((await limiter.consume('a', Date.now())).ok).toBe(true)
    expect((await limiter.consume('a', Date.now())).ok).toBe(true)
    expect((await limiter.consume('a', Date.now())).ok).toBe(true)
    const blocked = await limiter.consume('a', Date.now())
    expect(blocked.ok).toBe(false)
    expect(blocked.remaining).toBe(0)
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0)
  })

  it('tracks keys independently', async () => {
    const limiter = new RateLimiter(60_000, 1)
    await limiter.reset('a')
    await limiter.reset('b')
    expect((await limiter.consume('a', Date.now())).ok).toBe(true)
    expect((await limiter.consume('a', Date.now())).ok).toBe(false)
    expect((await limiter.consume('b', Date.now())).ok).toBe(true)
  })

  it('reset clears the counter for a key', async () => {
    const limiter = new RateLimiter(60_000, 1)
    await limiter.reset('c')
    expect((await limiter.consume('c', Date.now())).ok).toBe(true)
    expect((await limiter.consume('c', Date.now())).ok).toBe(false)
    await limiter.reset('c')
    expect((await limiter.consume('c', Date.now())).ok).toBe(true)
  })
})

describe('clientIp', () => {
  it('ignores attacker-supplied x-forwarded-for prefixes and trusts the rightmost proxy-appended entry', () => {
    const request = new Request('http://localhost/api/auth/login', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    process.env.TRUSTED_PROXY_HOPS = '1'
    try {
      // With a single trusted proxy hop the rightmost entry is the one appended
      // by our own proxy; the left-most entry is fully client-controlled.
      expect(clientIp(request)).toBe('5.6.7.8')
    } finally {
      delete process.env.TRUSTED_PROXY_HOPS
    }
  })

  it('prefers platform-stamped forwarding headers that cannot be forged', () => {
    const request = new Request('http://localhost/api/auth/login', {
      headers: { 'x-vercel-forwarded-for': '203.0.113.7', 'x-forwarded-for': '1.2.3.4' },
    })
    expect(clientIp(request)).toBe('203.0.113.7')
  })

  it('falls back to x-real-ip then unknown', () => {
    expect(clientIp(new Request('http://localhost/x', { headers: { 'x-real-ip': '9.9.9.9' } }))).toBe('9.9.9.9')
    expect(clientIp(new Request('http://localhost/x'))).toBe('unknown')
  })
})
