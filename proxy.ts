import { NextResponse, type NextRequest } from 'next/server'
import { validateCsrfProtection } from '@/lib/auth/csrf'

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

  return NextResponse.next()
}

export const config = {
  matcher: ['/api/:path*'],
}

