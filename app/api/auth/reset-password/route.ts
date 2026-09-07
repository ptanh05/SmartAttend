import { NextResponse } from 'next/server'
import { selfServiceResetPassword } from '@/lib/auth/users'
import { clientIp, resetPasswordLimiter } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const body = await request.json().catch(() => ({}))
    const identifier = typeof body.identifier === 'string' ? body.identifier.trim() : ''
    const portal = body.portal === 'staff' ? 'staff' : 'student'
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : undefined

    if (!identifier) {
      return NextResponse.json(
        { ok: false, message: 'Vui lòng nhập Mã sinh viên hoặc Email đăng ký.' },
        { status: 400 },
      )
    }

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

    const result = await selfServiceResetPassword({ identifier, portal, newPassword })
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
