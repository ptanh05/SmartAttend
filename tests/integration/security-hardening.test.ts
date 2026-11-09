import { describe, expect, it } from 'vitest'
import { config } from 'dotenv'
config({ path: '.env' })
import {
  validateCsrfProtection,
  isTrustedOrigin,
  generateCsrfToken,
  verifyCsrfToken,
  CSRF_COOKIE_NAME,
  CSRF_HEADER_NAME,
} from '@/lib/auth/csrf'
import { sanitizeSvg } from '@/components/smart-attend-ui'
import {
  createAuthSession,
  getAuthContext,
  deleteAuthSession,
} from '@/lib/auth/session'
import { db } from '@/lib/db'
import {
  authSessions,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import nextConfig from '@/next.config.mjs'

const hasDb = Boolean(process.env.DATABASE_URL)

describe('Security Hardening Test Suite', () => {
  describe('A. CSRF Protection Engine', () => {
    const targetUrl = 'http://localhost:3000/api/attendance/verify'

    it('allows safe HTTP read methods (GET, HEAD, OPTIONS) without origin check', () => {
      const getReq = new Request(targetUrl, { method: 'GET' })
      expect(validateCsrfProtection(getReq).ok).toBe(true)

      const headReq = new Request(targetUrl, { method: 'HEAD' })
      expect(validateCsrfProtection(headReq).ok).toBe(true)

      const optReq = new Request(targetUrl, { method: 'OPTIONS' })
      expect(validateCsrfProtection(optReq).ok).toBe(true)
    })

    it('exempts Microsoft OAuth flows from CSRF origin blocking', () => {
      const msReq = new Request('http://localhost:3000/api/auth/microsoft/callback', {
        method: 'POST',
        headers: {
          origin: 'https://login.microsoftonline.com',
        },
      })
      const result = validateCsrfProtection(msReq)
      expect(result.ok).toBe(true)
    })

    it('does NOT trust Microsoft origin for arbitrary non-OAuth mutation endpoints', () => {
      const nonOAuthReq = new Request('http://localhost:3000/api/attendance/verify', {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'https://login.microsoftonline.com',
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(nonOAuthReq)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.reason).toContain('Untrusted request origin')
    })

    it('enforces Double Submit Cookie: rejects when CSRF cookie is present but header is missing', () => {
      const token = generateCsrfToken()
      const req = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: `${CSRF_COOKIE_NAME}=${token}`,
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(req)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.reason).toContain('Missing CSRF token in request header')
    })

    it('enforces Double Submit Cookie: rejects when CSRF token in header mismatches cookie', () => {
      const cookieToken = generateCsrfToken()
      const wrongHeaderToken = generateCsrfToken()
      const req = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: `${CSRF_COOKIE_NAME}=${cookieToken}`,
          [CSRF_HEADER_NAME]: wrongHeaderToken,
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(req)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.reason).toContain('CSRF token mismatch')
    })

    it('enforces Double Submit Cookie: accepts when CSRF cookie and header match correctly', () => {
      const token = generateCsrfToken()
      const req = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          cookie: `${CSRF_COOKIE_NAME}=${token}`,
          [CSRF_HEADER_NAME]: token,
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(req)
      expect(result.ok).toBe(true)
    })

    it('accepts valid request with trusted Origin matching target host', () => {
      const validReq = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'http://localhost:3000',
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(validReq)
      expect(result.ok).toBe(true)
    })

    it('accepts request missing Origin when Referer is trusted same-origin', () => {
      const req = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          referer: 'http://localhost:3000/student/dashboard',
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(req)
      expect(result.ok).toBe(true)
    })

    it('rejects cross-origin request with untrusted Origin (403 Forbidden)', () => {
      const untrustedReq = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          origin: 'https://evil-attacker.com',
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(untrustedReq)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.reason).toContain('Untrusted request origin')
    })

    it('rejects forged request with untrusted Referer header', () => {
      const forgedRefererReq = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          referer: 'https://malicious-phishing.org/steal',
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(forgedRefererReq)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.reason).toContain('Untrusted request referer')
    })

    it('rejects request flagged as cross-site by browser Sec-Fetch-Site', () => {
      const crossSiteReq = new Request(targetUrl, {
        method: 'POST',
        headers: {
          host: 'localhost:3000',
          'sec-fetch-site': 'cross-site',
          'content-type': 'application/json',
        },
      })
      const result = validateCsrfProtection(crossSiteReq)
      expect(result.ok).toBe(false)
      expect(result.status).toBe(403)
      expect(result.reason).toContain('Sec-Fetch-Site policy')
    })

    it('verifies anti-CSRF token generation and constant-time validation', () => {
      const token1 = generateCsrfToken()
      const token2 = generateCsrfToken()

      expect(token1).toHaveLength(64)
      expect(token1).not.toBe(token2)

      // Matching tokens
      expect(verifyCsrfToken(token1, token1)).toBe(true)

      // Mismatched tokens
      expect(verifyCsrfToken(token1, token2)).toBe(false)
      expect(verifyCsrfToken(token1, 'tampered_token')).toBe(false)
      expect(verifyCsrfToken(null, token1)).toBe(false)
      expect(verifyCsrfToken(token1, undefined)).toBe(false)
    })
  })

  describe('B. Security Headers & CSP Configuration', () => {
    it('defines security headers in next.config.mjs with strict policies', async () => {
      expect(nextConfig.headers).toBeTypeOf('function')
      const headerRules = await nextConfig.headers()
      expect(Array.isArray(headerRules)).toBe(true)

      const rootRule = headerRules?.find((r: { source: string }) => r.source === '/:path*')
      expect(rootRule).toBeDefined()
      if (!rootRule) return

      const headersMap = new Map<string, string>()
      for (const h of rootRule.headers) {
        headersMap.set(h.key.toLowerCase(), h.value)
      }

      // X-Content-Type-Options
      expect(headersMap.get('x-content-type-options')).toBe('nosniff')

      // X-Frame-Options
      expect(headersMap.get('x-frame-options')).toBe('DENY')

      // Referrer-Policy
      expect(headersMap.get('referrer-policy')).toBe('strict-origin-when-cross-origin')

      // Permissions-Policy: must allow camera & microphone for attendance, and publickey-credentials-get for WebAuthn
      const permissions = headersMap.get('permissions-policy') ?? ''
      expect(permissions).toContain('camera=(self)')
      expect(permissions).toContain('microphone=(self)')
      expect(permissions).toContain('publickey-credentials-get=(self)')
      expect(permissions).toContain('geolocation=()')

      // Content-Security-Policy
      const csp = headersMap.get('content-security-policy') ?? ''
      expect(csp).toContain("default-src 'self'")
      expect(csp).toContain("frame-ancestors 'none'")
      expect(csp).toContain("object-src 'none'")
      expect(csp).toContain("base-uri 'self'")
      expect(csp).toContain('https://login.microsoftonline.com')

      // HSTS must NOT be set in development environment
      if (process.env.NODE_ENV !== 'production') {
        expect(headersMap.has('strict-transport-security')).toBe(false)
      }
    })
  })

  describe('C. XSS Prevention & SVG Sanitization', () => {
    it('allows valid QR SVG strings', () => {
      const cleanSvg = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="M0,0 h10 v10 z" /></svg>'
      const sanitized = sanitizeSvg(cleanSvg)
      expect(sanitized).toBe(cleanSvg)
    })

    it('neutralizes SVG containing embedded <script> tags', () => {
      const dirtySvg = '<svg><script>alert("XSS")</script><path d="M0 0" /></svg>'
      expect(sanitizeSvg(dirtySvg)).toBe('')
    })

    it('neutralizes SVG with inline event handlers (onload, onerror, onclick)', () => {
      const dirtyOnload = '<svg onload="alert(1)"><rect /></svg>'
      expect(sanitizeSvg(dirtyOnload)).toBe('')

      const dirtyOnerror = '<svg><image href="x" onerror="alert(2)" /></svg>'
      expect(sanitizeSvg(dirtyOnerror)).toBe('')
    })

    it('neutralizes SVG with javascript: pseudoprotocol links', () => {
      const dirtyLink = '<svg><a href="javascript:alert(3)"><text>Click</text></a></svg>'
      expect(sanitizeSvg(dirtyLink)).toBe('')
    })

    it('rejects foreignObject and iframe embeds in SVG', () => {
      const dirtyForeign = '<svg><foreignObject><iframe src="evil.com"></iframe></foreignObject></svg>'
      expect(sanitizeSvg(dirtyForeign)).toBe('')
    })

    it('neutralizes SVG with animation elements triggering script onbegin or xlink:href', () => {
      const dirtyAnimate = '<svg><animate onbegin="alert(1)" attributeName="x" dur="1s"/></svg>'
      expect(sanitizeSvg(dirtyAnimate)).toBe('')

      const dirtyUse = '<svg><use href="javascript:alert(2)"/></svg>'
      expect(sanitizeSvg(dirtyUse)).toBe('')
    })

    it('neutralizes HTML entity obfuscated javascript: URLs in SVG', () => {
      // &#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58; = javascript:
      const entityObfuscated = '<svg><a href="&#106;&#97;&#118;&#97;&#115;&#99;&#114;&#105;&#112;&#116;&#58;alert(1)"><rect/></a></svg>'
      expect(sanitizeSvg(entityObfuscated)).toBe('')
    })
  })

  describe.skipIf(!hasDb)('D. Cookie & Session Security Audit', () => {
    it('creates session with 32-byte cryptographically secure random token and stores SHA-256 hash', async () => {
      const orgId = `org_sec_${nanoid(6)}`
      const userId = `usr_sec_${nanoid(6)}`
      const membershipId = `mem_sec_${nanoid(6)}`

      try {
        await db().insert(organizations).values({ id: orgId, name: 'Security Audit Org' })
        await db().insert(users).values({
          id: userId,
          email: `${userId}@utc.edu.vn`,
          name: 'Security Test User',
          initials: 'ST',
          passwordHash: 'dummy_hash',
        })
        await db().insert(organizationMemberships).values({
          id: membershipId,
          organizationId: orgId,
          userId,
          role: 'student',
          status: 'active',
        })

        const { token, expiresAt } = await createAuthSession(userId, membershipId)

        // 1. Token must be 64-hex string (32 bytes entropy)
        expect(token).toMatch(/^[0-9a-f]{64}$/)
        expect(expiresAt.getTime()).toBeGreaterThan(Date.now())

        // 2. Database MUST NOT contain the plaintext token
        const sessionRows = await db()
          .select()
          .from(authSessions)
          .where(eq(authSessions.userId, userId))

        expect(sessionRows).toHaveLength(1)
        expect(sessionRows[0].tokenHash).not.toBe(token)
        expect(sessionRows[0].tokenHash).toMatch(/^[0-9a-f]{64}$/)

        // 3. getAuthContext resolves correctly with plaintext token
        const authContext = await getAuthContext(token)
        expect(authContext).not.toBeNull()
        expect(authContext?.userId).toBe(userId)
        expect(authContext?.organizationId).toBe(orgId)

        // 4. Session Hijacking / Forged Token Simulation: Invalid token yields null
        const forgedToken = token.slice(0, -6) + 'abcdef'
        const invalidContext = await getAuthContext(forgedToken)
        expect(invalidContext).toBeNull()

        // 5. Session Revocation: Deleting session invalidates token immediately
        await deleteAuthSession(token)
        const revokedContext = await getAuthContext(token)
        expect(revokedContext).toBeNull()
      } finally {
        await db().delete(authSessions).where(eq(authSessions.userId, userId)).catch(() => {})
        await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
        await db().delete(users).where(eq(users.id, userId)).catch(() => {})
        await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
      }
    })

    it('rejects expired sessions automatically', async () => {
      const orgId = `org_exp_${nanoid(6)}`
      const userId = `usr_exp_${nanoid(6)}`
      const membershipId = `mem_exp_${nanoid(6)}`

      try {
        await db().insert(organizations).values({ id: orgId, name: 'Expired Session Org' })
        await db().insert(users).values({
          id: userId,
          email: `${userId}@utc.edu.vn`,
          name: 'Expired Test User',
          initials: 'ET',
          passwordHash: 'dummy_hash',
        })
        await db().insert(organizationMemberships).values({
          id: membershipId,
          organizationId: orgId,
          userId,
          role: 'student',
          status: 'active',
        })

        // Insert session that expired 1 hour ago
        const pastDate = new Date(Date.now() - 3600 * 1000)
        const expiredToken = nanoid(32)
        const crypto = await import('crypto')
        const tokenHash = crypto.createHash('sha256').update(expiredToken).digest('hex')

        await db().insert(authSessions).values({
          id: nanoid(),
          userId,
          membershipId,
          tokenHash,
          expiresAt: pastDate,
        })

        const context = await getAuthContext(expiredToken)
        expect(context).toBeNull()
      } finally {
        await db().delete(authSessions).where(eq(authSessions.userId, userId)).catch(() => {})
        await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
        await db().delete(users).where(eq(users.id, userId)).catch(() => {})
        await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
      }
    })

    it('immediately denies access if account is disabled (disabledAt is set)', async () => {
      const orgId = `org_dis_${nanoid(6)}`
      const userId = `usr_dis_${nanoid(6)}`
      const membershipId = `mem_dis_${nanoid(6)}`

      try {
        await db().insert(organizations).values({ id: orgId, name: 'Disabled Account Org' })
        await db().insert(users).values({
          id: userId,
          email: `${userId}@utc.edu.vn`,
          name: 'Disabled Test User',
          initials: 'DT',
          passwordHash: 'dummy_hash',
          disabledAt: new Date(), // Account is disabled by administrator
        })
        await db().insert(organizationMemberships).values({
          id: membershipId,
          organizationId: orgId,
          userId,
          role: 'student',
          status: 'active',
        })

        const { token } = await createAuthSession(userId, membershipId)

        // Even with a freshly minted session token, disabled user MUST NOT authenticate
        const context = await getAuthContext(token)
        expect(context).toBeNull()
      } finally {
        await db().delete(authSessions).where(eq(authSessions.userId, userId)).catch(() => {})
        await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
        await db().delete(users).where(eq(users.id, userId)).catch(() => {})
        await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
      }
    })
  })
})
