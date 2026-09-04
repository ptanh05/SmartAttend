import { NextResponse } from 'next/server'
import { sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/cookies'
import { createAuthSession, resolveMembershipForLogin, resolveMembershipForStudentLogin } from '@/lib/auth/session'
import { clientIp, loginLimiter } from '@/lib/rate-limit'
import type { Role } from '@/lib/types/domain'

/**
 * Microsoft 365 SSO demo endpoint.
 *
 * In a real deployment this would redirect to the Azure AD /authorize endpoint,
 * exchange the code for tokens, and resolve the university email from the
 * id_token claims.  For this demo version we simulate SSO by accepting an
 * email address (which would normally come from the Microsoft id_token) and
 * logging the user in directly — skipping password verification — because the
 * identity has already been verified by Microsoft.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const portal: 'student' | 'staff' = body.portal === 'staff' ? 'staff' : 'student'

    if (!email) {
      return NextResponse.json(
        { ok: false, message: 'Microsoft account email is required.' },
        { status: 400 },
      )
    }

    // Rate-limit by IP + email
    const rateKey = `sso:${clientIp(request)}:${email}`
    const rate = loginLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    // For student portal, try student code lookup first (email may contain student code)
    // For staff portal, use email lookup
    let memberships
    if (portal === 'student') {
      // Try resolving by email first, then by student code extracted from email
      memberships = await resolveMembershipForLogin(email)
      if (memberships.length === 0) {
        // Try extracting student code from email like "20260001@student.utc.edu.vn"
        const studentCode = email.split('@')[0]
        if (studentCode) {
          memberships = await resolveMembershipForStudentLogin(studentCode)
        }
      }
    } else {
      memberships = await resolveMembershipForLogin(email)
    }

    const match = memberships.find((row) => !row.disabledAt && row.membershipStatus === 'active')

    if (!match) {
      return NextResponse.json(
        {
          ok: false,
          code: 'account_not_found',
          message: portal === 'student'
            ? 'Không tìm thấy tài khoản sinh viên liên kết với email Microsoft này. Vui lòng sử dụng mã sinh viên để đăng nhập.'
            : 'Không tìm thấy tài khoản giảng viên liên kết với email Microsoft này. Vui lòng liên hệ quản trị viên.',
        },
        { status: 401 },
      )
    }

    const role = match.role as Role
    if (portal === 'student' && role !== 'student') {
      return NextResponse.json(
        { ok: false, message: 'Tài khoản này thuộc cổng giảng viên. Vui lòng chọn đúng cổng đăng nhập.' },
        { status: 403 },
      )
    }
    if (portal === 'staff' && role === 'student') {
      return NextResponse.json(
        { ok: false, message: 'Tài khoản này thuộc cổng sinh viên. Vui lòng chọn đúng cổng đăng nhập.' },
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
    console.error('Microsoft SSO login failed', error)
    return NextResponse.json(
      { ok: false, message: 'Không thể đăng nhập bằng Microsoft lúc này. Vui lòng thử lại.' },
      { status: 500 },
    )
  }
}
