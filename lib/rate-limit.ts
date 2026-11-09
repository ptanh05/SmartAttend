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

/** Teacher registration: up to 5 attempts per 15 minutes per IP. */
export const registerLimiter = new RateLimiter(15 * 60 * 1000, 5)

/** Password change: up to 5 attempts per 15 minutes per user/IP. */
export const changePasswordLimiter = new RateLimiter(15 * 60 * 1000, 5)

/** Password reset requests: up to 5 attempts per 15 minutes per IP/user. */
export const resetPasswordLimiter = new RateLimiter(15 * 60 * 1000, 5)

/** Session lifecycle & rotate actions: up to 30 actions per minute. */
export const sessionActionLimiter = new RateLimiter(60 * 1000, 30)

/** CSV student roster import: up to 10 imports per 15 minutes. */
export const importLimiter = new RateLimiter(15 * 60 * 1000, 10)

/**
 * Best-effort client IP extraction from common proxy headers.
 *
 * Security note (SEC-08): `x-forwarded-for` is fully attacker-controlled when
 * the application is reached directly (without a trusted reverse proxy). A
 * client could therefore spoof the header and evade the per-IP rate limit.
 *
 * The resolution order below only trusts proxy headers when the request
 * actually came through a trusted proxy hop, detected via `x-vercel-forwarded-for`
 * / `x-real-ip` presence or the standard `x-forwarded-for` chain length
 * configured through `TRUSTED_PROXY_HOPS`. Otherwise the request falls back to
 * a constant bucket so that a spoofed header cannot be used to bypass limits.
 */
const IPV4_PATTERN = /^(?:\d{1,3}\.){3}\d{1,3}$/

function isIpLike(value: string): boolean {
  if (!value) return false
  if (value.includes(':')) return value.length <= 45 // IPv6 (upper bound)
  return IPV4_PATTERN.test(value)
}

function normalizeIp(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim()
  if (!isIpLike(trimmed)) return null
  return trimmed
}

/**
 * Number of trusted proxy hops in front of the application.
 *
 * Each trusted proxy appends the address it observed to `x-forwarded-for`, so
 * the rightmost entry is the address our own (trusted) proxy recorded. With
 * `hops = N` the entry at `length - N` is the last one we can attribute to a
 * trusted hop; everything to its left is attacker-controlled.
 *
 * Defaults to 1 (the platform/ingress proxy in front of the app).
 */
function trustedProxyHops(): number {
  const raw = process.env.TRUSTED_PROXY_HOPS
  if (raw === undefined || raw.trim() === '') return 1
  const parsed = Number.parseInt(raw, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

export function clientIp(request: Request): string {
  // Platform-managed headers cannot be forged by the client: the edge
  // overwrites them before the request reaches the application.
  const platformForwarded = normalizeIp(request.headers.get('x-vercel-forwarded-for'))
  if (platformForwarded) return platformForwarded

  const cloudflareIp = normalizeIp(request.headers.get('cf-connecting-ip'))
  if (cloudflareIp) return cloudflareIp

  const forwarded = request.headers.get('x-forwarded-for')
  if (forwarded) {
    const hops = forwarded.split(',').map((part) => part.trim()).filter(Boolean)
    const hopsToSkip = trustedProxyHops()

    if (hopsToSkip > 0) {
      // Take the entry appended by the closest trusted proxy (rightmost),
      // never a client-supplied prefix entry.
      const candidate = hops[hops.length - hopsToSkip]
      const normalized = normalizeIp(candidate)
      if (normalized) return normalized
    }

    return 'untrusted'
  }

  const realIp = normalizeIp(request.headers.get('x-real-ip'))
  if (realIp) return realIp

  return 'unknown'
}
