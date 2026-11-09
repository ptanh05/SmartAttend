import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getCurrentAuth } from '@/lib/auth/context'
import { CSRF_COOKIE_NAME, generateCsrfToken } from '@/lib/auth/csrf'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false })

  const response = NextResponse.json({
    ok: true,
    user: {
      id: auth.userId,
      name: auth.name,
      email: auth.email,
      role: auth.role,
      initials: auth.initials,
      department: auth.department,
      studentCode: auth.studentCode,
      mustChangePassword: auth.mustChangePassword,
      organizationId: auth.organizationId,
    },
    organization: {
      id: auth.organizationId,
      name: auth.organizationName,
      plan: auth.organizationPlan,
      emailDomain: auth.organizationEmailDomain,
    },
  })

  // Ensure CSRF token cookie is available for client-side API requests
  const cookieStore = await cookies()
  if (!cookieStore.get(CSRF_COOKIE_NAME)?.value) {
    response.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: false,
      maxAge: 7 * 24 * 60 * 60,
    })
  }

  return response
}
