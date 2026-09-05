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

import { db } from '@/lib/db'
import { rateLimits } from '@/lib/db/schema'
import { eq, sql } from 'drizzle-orm'

export class RateLimiter {
  constructor(
    private readonly windowMs: number,
    private readonly maxHits: number,
  ) {}

  async consume(key: string, now = Date.now()): Promise<RateLimitResult> {
    const resetDate = new Date(now + this.windowMs)
    const result = await db()
      .insert(rateLimits)
      .values({ key, hits: 1, resetAt: resetDate })
      .onConflictDoUpdate({
        target: rateLimits.key,
        set: {
          hits: sql`CASE WHEN ${rateLimits.resetAt} < now() THEN 1 ELSE ${rateLimits.hits} + 1 END`,
          resetAt: sql`CASE WHEN ${rateLimits.resetAt} < now() THEN ${resetDate}::timestamp with time zone ELSE ${rateLimits.resetAt} END`,
        },
      })
      .returning()

    const record = result[0]
    if (record.hits > this.maxHits) {
      return {
        ok: false,
        retryAfterSeconds: Math.max(1, Math.ceil((record.resetAt.getTime() - now) / 1000)),
        remaining: 0,
      }
    }
    return {
      ok: true,
      retryAfterSeconds: 0,
      remaining: this.maxHits - record.hits,
    }
  }

  async reset(key: string) {
    await db().delete(rateLimits).where(eq(rateLimits.key, key))
  }
}

/** Login: up to 10 attempts per 15 minutes per (IP + identifier). */
export const loginLimiter = new RateLimiter(15 * 60 * 1000, 10)

/** Attendance verification: up to 5 checks per minute per (IP + account). */
export const verifyLimiter = new RateLimiter(60 * 1000, 5)

/** Best-effort client IP extraction from common proxy headers. */
export function clientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return request.headers.get('x-real-ip') ?? 'unknown'
}
