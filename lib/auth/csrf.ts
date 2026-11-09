import { randomBytes, timingSafeEqual } from 'crypto'

export const CSRF_COOKIE_NAME = 'smartattend_csrf'
export const CSRF_HEADER_NAME = 'x-csrf-token'

export type CsrfValidationResult = {
  ok: boolean
  reason?: string
  status?: number
}

/**
 * Checks whether an origin is trusted by comparing it against:
 * 1. The target request URL origin.
 * 2. Configured environment origins (WEBAUTHN_ORIGIN, APP_URL, NEXT_PUBLIC_APP_URL).
 * 3. Localhost / loopback in non-production environments.
 *
 * NOTE: External third-party origins (such as Microsoft) are NOT trusted
 * globally for arbitrary API mutations. They are only permitted on dedicated
 * OAuth callback endpoints.
 */
export function isTrustedOrigin(origin: string, requestUrl: string, hostHeader?: string | null): boolean {
  if (!origin || typeof origin !== 'string') return false

  try {
    const originUrl = new URL(origin)
    const targetUrl = new URL(requestUrl)

    // 1. Direct match with target URL's origin
    if (originUrl.origin === targetUrl.origin) {
      return true
    }

    // 2. Verified match with Host header only if host matches target or clean port
    if (hostHeader) {
      const cleanHost = hostHeader.split(',')[0].trim().toLowerCase()
      // Prevent Host header injection by ensuring cleanHost matches targetUrl.host or has matching hostname
      if (originUrl.host.toLowerCase() === cleanHost && (cleanHost === targetUrl.host.toLowerCase() || process.env.NODE_ENV !== 'production')) {
        return true
      }
    }

    // 3. Match against explicitly configured application origins
    const configuredOrigins = [
      process.env.WEBAUTHN_ORIGIN,
      process.env.APP_URL,
      process.env.NEXT_PUBLIC_APP_URL,
    ].filter(Boolean) as string[]

    for (const conf of configuredOrigins) {
      try {
        if (new URL(conf).origin.toLowerCase() === originUrl.origin.toLowerCase()) {
          return true
        }
      } catch {
        // ignore malformed env URL
      }
    }

    // 4. In development / test environment, allow localhost / 127.0.0.1 / [::1]
    if (process.env.NODE_ENV !== 'production') {
      const hostname = originUrl.hostname.toLowerCase()
      if (hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1') {
        return true
      }
    }

    return false
  } catch {
    return false
  }
}

/**
 * Validates request Origin, Referer, Sec-Fetch-Site, and Double-Submit CSRF Token
 * to protect all state-changing methods (POST, PUT, PATCH, DELETE) against CSRF.
 */
export function validateCsrfProtection(request: Request): CsrfValidationResult {
  const method = request.method.toUpperCase()

  // Safe HTTP methods do not mutate state
  if (method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
    return { ok: true }
  }

  let requestPath = ''
  try {
    const url = new URL(request.url)
    requestPath = url.pathname
  } catch {
    // proceed
  }

  // Exempt ONLY Microsoft OAuth callback endpoints (not all API mutations)
  if (requestPath === '/api/auth/microsoft/callback' || requestPath === '/api/auth/microsoft') {
    const origin = request.headers.get('origin')
    if (!origin || origin === 'https://login.microsoftonline.com' || isTrustedOrigin(origin, request.url)) {
      return { ok: true }
    }
  }

  const origin = request.headers.get('origin')
  const referer = request.headers.get('referer')
  const secFetchSite = request.headers.get('sec-fetch-site')
  const host = request.headers.get('host') ?? request.headers.get('x-forwarded-host')

  // 1. If Sec-Fetch-Site is explicitly cross-site, reject immediately
  if (secFetchSite === 'cross-site') {
    return {
      ok: false,
      reason: 'Cross-site request blocked by Sec-Fetch-Site policy',
      status: 403,
    }
  }

  // 2. If Origin header is present, it must be trusted
  if (origin) {
    if (!isTrustedOrigin(origin, request.url, host)) {
      return {
        ok: false,
        reason: `Untrusted request origin: ${origin}`,
        status: 403,
      }
    }
  } else if (referer) {
    // 3. If Origin is missing, inspect Referer header
    try {
      const refererOrigin = new URL(referer).origin
      if (!isTrustedOrigin(refererOrigin, request.url, host)) {
        return {
          ok: false,
          reason: `Untrusted request referer: ${refererOrigin}`,
          status: 403,
        }
      }
    } catch {
      return {
        ok: false,
        reason: 'Malformed referer header',
        status: 403,
      }
    }
  }

  // 4. Double Submit Cookie Token Verification:
  // If the client has a CSRF cookie (smartattend_csrf), verify that the request
  // header (x-csrf-token) matches the cookie value in constant time.
  const cookieHeader = request.headers.get('cookie') || ''
  const csrfCookieMatch = cookieHeader
    .split('; ')
    .find((row) => row.startsWith(`${CSRF_COOKIE_NAME}=`))
  const cookieToken = csrfCookieMatch ? csrfCookieMatch.split('=')[1] : null

  if (cookieToken) {
    const headerToken = request.headers.get(CSRF_HEADER_NAME) || request.headers.get('x-xsrf-token')
    if (!headerToken) {
      return {
        ok: false,
        reason: 'Missing CSRF token in request header',
        status: 403,
      }
    }
    if (!verifyCsrfToken(decodeURIComponent(cookieToken), headerToken)) {
      return {
        ok: false,
        reason: 'CSRF token mismatch or invalid',
        status: 403,
      }
    }
  }

  return { ok: true }
}

/**
 * Generates a high-entropy random CSRF token (32 bytes / 64 hex characters).
 */
export function generateCsrfToken(): string {
  return randomBytes(32).toString('hex')
}

/**
 * Validates a CSRF token using constant-time comparison to prevent timing attacks.
 */
export function verifyCsrfToken(cookieToken?: string | null, headerToken?: string | null): boolean {
  if (!cookieToken || !headerToken) return false
  if (cookieToken.length !== headerToken.length) return false

  try {
    const a = Buffer.from(cookieToken)
    const b = Buffer.from(headerToken)
    return timingSafeEqual(a, b)
  } catch {
    return false
  }
}
