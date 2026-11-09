import { cookies, headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { authCookieManager, SESSION_COOKIE } from '@/lib/auth/cookies'
import { getAuthContext, type AuthContext } from '@/lib/auth/session'
import { REQUEST_PATH_HEADER } from '@/lib/auth/request-path'
import type { Role } from '@/lib/types/domain'

/**
 * Endpoints that must stay reachable while the account still has to change
 * its password — otherwise the user would be locked out of the only flow that
 * can clear the `mustChangePassword` flag.
 */
const PASSWORD_CHANGE_EXEMPT_PATHS = new Set([
  '/api/auth/change-password',
  '/api/auth/logout',
  '/api/me',
])

export async function getCurrentAuth(): Promise<AuthContext | null> {
  const cookieStore = await cookies()
  const token = authCookieManager.getSessionToken(cookieStore) ?? cookieStore.get(SESSION_COOKIE)?.value
  return getAuthContext(token)
}

/**
 * Resolves the API path of the in-flight request, when available.
 *
 * The Proxy layer forwards the matched path through the
 * `x-smartattend-path` header. When the header is absent (e.g. direct
 * function calls in tests) the caller can pass an explicit exemption.
 */
async function currentRequestPath(): Promise<string | null> {
  const headerStore = await headers()
  return (
    headerStore.get(REQUEST_PATH_HEADER) ??
    headerStore.get('x-invoke-path') ??
    headerStore.get('x-matched-path')
  )
}

export async function requireAuth(
  allowed?: Role | Role[],
  options?: { allowPasswordChangePending?: boolean },
) {
  const auth = await getCurrentAuth()
  if (!auth) throw new AuthError('Authentication required', 401)

  if (allowed) {
    const roles = Array.isArray(allowed) ? allowed : [allowed]
    if (!roles.includes(auth.role) && auth.role !== 'admin') {
      throw new AuthError('Role access denied', 403)
    }
  }

  // SEC-01: `mustChangePassword` must be enforced server-side. The client UI
  // already forces the change dialog, but the API has to reject every other
  // call until the password has actually been rotated.
  if (auth.mustChangePassword && !options?.allowPasswordChangePending) {
    const path = await currentRequestPath()
    if (!path || !PASSWORD_CHANGE_EXEMPT_PATHS.has(path)) {
      throw new AuthError('Password change required', 428)
    }
  }

  return auth
}

export class AuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

/**
 * Guards routes that resolve the session with `getCurrentAuth()` instead of
 * `requireAuth()` (read-only endpoints such as `/api/dashboard`).
 *
 * SEC-01: while `mustChangePassword` is pending, every endpoint except the
 * password-change flow itself must answer with HTTP 428.
 */
export async function assertPasswordChangeCleared(auth: AuthContext) {
  if (!auth.mustChangePassword) return

  const path = await currentRequestPath()
  if (path && PASSWORD_CHANGE_EXEMPT_PATHS.has(path)) return

  throw new AuthError('Password change required', 428)
}

/**
 * Same guard as `assertPasswordChangeCleared`, but returns a ready-to-send
 * response instead of throwing. Returns `null` when the request may proceed.
 */
export async function passwordChangePendingResponse(auth: AuthContext): Promise<NextResponse | null> {
  try {
    await assertPasswordChangeCleared(auth)
    return null
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    }
    throw error
  }
}

/**
 * Converts an `AuthError` into its HTTP response, preserving the status code
 * (401 / 403 / 428). Returns `null` for any other error so the caller can
 * fall back to its own generic error handling.
 */
export function authErrorResponse(error: unknown): NextResponse | null {
  if (error instanceof AuthError) {
    return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
  }
  return null
}

export function organizationScope(auth: AuthContext) {
  return { organizationId: auth.organizationId }
}
