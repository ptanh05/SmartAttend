import { NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { adminResetStudentPassword } from '@/lib/auth/users'
import { changePasswordLimiter, clientIp } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const rateKey = `${clientIp(request)}:${auth.userId}`
    const rate = await changePasswordLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau ít phút.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    const body = await request.json().catch(() => ({}))
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : ''

    if (!studentId) {
      return NextResponse.json({ ok: false, message: 'Thiếu studentId.' }, { status: 400 })
    }

    const result = await adminResetStudentPassword(auth, studentId)
    if (!result.ok) {
      return NextResponse.json(result, { status: 400 })
    }

    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    }
    console.error('Admin reset student password failed', error)
    return NextResponse.json(
      { ok: false, message: 'Không thể đặt lại mật khẩu sinh viên lúc này.' },
      { status: 500 },
    )
  }
}
