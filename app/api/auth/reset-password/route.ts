import { NextResponse } from 'next/server'
import { isLegacyStaffPortal, parsePortal } from '@/lib/auth/portals'
import { selfServiceResetPassword } from '@/lib/auth/users'
import { clientIp, resetPasswordLimiter } from '@/lib/rate-limit'
import { validateRequestBody, resetPasswordSchema } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const validation = await validateRequestBody(request, resetPasswordSchema, 'Dữ liệu đặt lại mật khẩu không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { identifier, portal: portalRaw, newPassword } = validation.data
    const portal = parsePortal(portalRaw)
    const legacyStaff = isLegacyStaffPortal(portalRaw)

    const rateKey = `${clientIp(request)}:${identifier.toLowerCase()}`
    const rate = await resetPasswordLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        {
          ok: false,
          message: 'Bạn đã yêu cầu đặt lại mật khẩu quá nhiều lần. Vui lòng thử lại sau ít phút.',
        },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    const result = await selfServiceResetPassword({
      identifier,
      portal: portal ?? 'teacher',
      legacyStaff,
      newPassword,
    })
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    console.error('Password reset failed', error)
    return NextResponse.json(
      { ok: false, message: 'Không thể xử lý yêu cầu đặt lại mật khẩu lúc này.' },
      { status: 500 },
    )
  }
}
