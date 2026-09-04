import { NextResponse } from 'next/server'
import { sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/cookies'
import { verifyPassword } from '@/lib/auth/password'
import { createAuthSession, resolveMembershipForLogin, resolveMembershipForStudentLogin } from '@/lib/auth/session'
import { clientIp, loginLimiter } from '@/lib/rate-limit'
import type { Role } from '@/lib/types/domain'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : ''
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const loginId = identifier || email
    const password = typeof body.password === 'string' ? body.password : ''
    const portal = body.portal === 'staff' ? 'staff' : 'student'

    if (!loginId || !password) {
      return NextResponse.json({ ok: false, message: 'Login ID and password are required.' }, { status: 400 })
    }

    const rateKey = `${clientIp(request)}:${loginId.toLowerCase()}`
    const rate = loginLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    const memberships =
      portal === 'student' && !loginId.includes('@')
        ? await resolveMembershipForStudentLogin(loginId)
        : await resolveMembershipForLogin(loginId.includes('@') ? loginId.toLowerCase() : loginId)

    const match = memberships.find((row) => !row.disabledAt && row.membershipStatus === 'active')

    if (!match || !(await verifyPassword(password, match.passwordHash))) {
      return NextResponse.json(
        { ok: false, code: 'invalid_credentials', message: 'Incorrect login ID or password.' },
        { status: 401 },
      )
    }

    const role = match.role as Role
    if (portal === 'student' && role !== 'student') {
      return NextResponse.json(
        { ok: false, message: 'Use the staff portal for this account.' },
        { status: 403 },
      )
    }
    if (portal === 'staff' && role === 'student') {
      return NextResponse.json(
        { ok: false, message: 'Use the student portal for this account.' },
        { status: 403 },
      )
    }

    const { token, expiresAt } = await createAuthSession(match.userId, match.membershipId)
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

    loginLimiter.reset(rateKey)

    const response = NextResponse.json({
      ok: true,
      role,
      mustChangePassword: match.mustChangePassword,
    })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
    return response
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Login failed:', message, error)

    // Provide more specific error messages based on the error type
    if (message.includes('fetch') || message.includes('connect') || message.includes('ECONNREFUSED') || message.includes('timeout')) {
      return NextResponse.json(
        { ok: false, message: 'Không thể kết nối cơ sở dữ liệu. Vui lòng thử lại sau vài giây.' },
        { status: 503 },
      )
    }

    return NextResponse.json({ ok: false, message: 'Không thể đăng nhập lúc này. Vui lòng thử lại.' }, { status: 500 })
  }
}
