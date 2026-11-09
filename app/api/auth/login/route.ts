import { NextResponse } from 'next/server'
import { authCookieManager, sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/cookies'
import { CSRF_COOKIE_NAME, generateCsrfToken } from '@/lib/auth/csrf'
import { verifyPassword } from '@/lib/auth/password'
import { isLegacyStaffPortal, parsePortal, portalForRole } from '@/lib/auth/portals'
import { createAuthSession, resolveMembershipForLogin, resolveMembershipForStudentLogin } from '@/lib/auth/session'
import { clientIp, loginLimiter } from '@/lib/rate-limit'
import type { Role } from '@/lib/types/domain'
import { validateRequestBody, loginSchema } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const validation = await validateRequestBody(request, loginSchema, 'Thông tin đăng nhập không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { identifier, email, password, portal: portalRaw } = validation.data
    const loginId = (identifier || email || '').trim()
    const portal = parsePortal(portalRaw)

    // `staff` is the legacy combined portal (teacher + admin). It is still
    // accepted so existing integrations keep working; the UI now offers three
    // explicit portals.
    const legacyStaff = isLegacyStaffPortal(portalRaw)
    if (!portal && !legacyStaff) {
      return NextResponse.json({ ok: false, message: 'Unknown login portal.' }, { status: 400 })
    }

    const rateKey = `${clientIp(request)}:${loginId.toLowerCase()}`
    const rate = await loginLimiter.consume(rateKey)
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

    if (!match) {
      const disabledAccount = memberships.find((row) => row.disabledAt || row.membershipStatus !== 'active')
      if (disabledAccount && (await verifyPassword(password, disabledAccount.passwordHash))) {
        return NextResponse.json(
          {
            ok: false,
            code: 'account_disabled',
            message: 'Tài khoản của bạn đã bị khóa hoặc tạm ngưng hoạt động. Vui lòng liên hệ Quản trị viên UTC để được hỗ trợ.',
          },
          { status: 403 },
        )
      }

      return NextResponse.json(
        { ok: false, code: 'invalid_credentials', message: 'Incorrect login ID or password.' },
        { status: 401 },
      )
    }

    if (!(await verifyPassword(password, match.passwordHash))) {
      return NextResponse.json(
        { ok: false, code: 'invalid_credentials', message: 'Incorrect login ID or password.' },
        { status: 401 },
      )
    }

    const role = match.role as Role
    const expectedPortal = portalForRole(role)

    // The portal must match the account's actual role. The legacy `staff`
    // portal accepts both teacher and admin.
    if (portal && portal !== expectedPortal) {
      return NextResponse.json(
        {
          ok: false,
          code: 'wrong_portal',
          expectedPortal,
          message:
            role === 'student'
              ? 'Use the student portal for this account.'
              : role === 'teacher'
                ? 'Use the lecturer portal for this account.'
                : 'Use the admin portal for this account.',
        },
        { status: 403 },
      )
    }

    const { token, expiresAt } = await createAuthSession(match.userId, match.membershipId)
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

    await loginLimiter.reset(rateKey)

    const response = NextResponse.json({
      ok: true,
      role,
      portal: expectedPortal,
      mustChangePassword: match.mustChangePassword,
    })
    authCookieManager.saveSession(response, token, maxAge)
    response.cookies.set(CSRF_COOKIE_NAME, generateCsrfToken(), {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      httpOnly: false,
      maxAge,
    })
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
