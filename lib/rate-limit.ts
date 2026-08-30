/**
 * In-memory sliding-window rate limiter.
 *
 * Keeps per-key timestamps and rejects a key once it exceeds `maxHits` within
 * `windowMs`. This is a single-instance limiter: it is correct for local dev
 * and for a single deployed instance, but for horizontally scaled serverless
 * deployments the same accounting should be stored in a shared store (e.g. the
 * Neon database, Redis, or a Durable Object). Swap the backing store while
 * keeping the `consume`/`reset` contract.
 */
export type RateLimitResult = {
  ok: boolean
  /** Whole seconds until the key may retry (0 when allowed). */
  retryAfterSeconds: number
  /** Number of requests still allowed in the current window. */
  remaining: number
}

export class SlidingWindowRateLimiter {
  private readonly hits = new Map<string, number[]>()

  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number,
  ) {}

  private usages(key: string, now: number): number[] {
    const cutoff = now - this.windowMs
    const arr = (this.hits.get(key) ?? []).filter((t) => t > cutoff)
    this.hits.set(key, arr)
    return arr
  }

  private lastSweep = 0

  /**
   * Records a request for `key` and returns whether it is still allowed.
   * The hit is counted even when the request is rejected.
   */
  consume(key: string, now = Date.now()): RateLimitResult {
    if (now - this.lastSweep > this.windowMs || this.hits.size > 500) {
      this.clearExpired(now)
      this.lastSweep = now
    }
    const arr = this.usages(key, now)
    if (arr.length >= this.maxHits) {
      const oldest = arr[0]
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((oldest + this.windowMs - now) / 1000)),
        remaining: 0,
      }
    }
    arr.push(now)
    this.hits.set(key, arr)
    return { ok: true, retryAfterSeconds: 0, remaining: this.maxHits - arr.length }
  }

  /** Clears all recorded hits for `key` (e.g. after a successful login). */
  reset(key: string) {
    this.hits.delete(key)
  }

  /** Removes counters that have not been touched recently. */
  clearExpired(now = Date.now()) {
    const cutoff = now - this.windowMs
    for (const [key, arr] of this.hits) {
      if (arr.length === 0 || arr[arr.length - 1] <= cutoff) this.hits.delete(key)
    }
  }
}

/** Login: up to 10 attempts per 15 minutes per (IP + identifier). */
export const loginLimiter = new SlidingWindowRateLimiter(15 * 60 * 1000, 10)

/** Attendance verification: up to 5 checks per minute per (IP + account). */
export const verifyLimiter = new SlidingWindowRateLimiter(60 * 1000, 5)

/** Best-effort client IP extraction from common proxy headers. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
