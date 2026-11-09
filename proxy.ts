import { NextResponse, type NextRequest } from 'next/server'
import { validateCsrfProtection } from '@/lib/auth/csrf'
import { REQUEST_PATH_HEADER } from '@/lib/auth/request-path'

export function proxy(request: NextRequest) {
  // Enforce CSRF protection on all API mutation requests
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const csrf = validateCsrfProtection(request)
    if (!csrf.ok) {
      return NextResponse.json(
        { ok: false, message: `CSRF validation failed: ${csrf.reason}` },
        { status: csrf.status ?? 403 },
      )
    }
  }

  // Propagate the matched path so that server-side guards (e.g. the forced
  // password-change gate) can exempt the few endpoints that must stay
  // reachable while the account still has to rotate its password.
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(REQUEST_PATH_HEADER, request.nextUrl.pathname)

  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/api/:path*'],
}
