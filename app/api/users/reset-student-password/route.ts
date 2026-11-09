import { NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { adminResetStudentPassword } from '@/lib/auth/users'
import { changePasswordLimiter, clientIp } from '@/lib/rate-limit'
import { validateRequestBody, resetStudentPasswordSchema } from '@/lib/validation'

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

    const validation = await validateRequestBody(request, resetStudentPasswordSchema, 'Dữ liệu đặt lại mật khẩu sinh viên không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { studentId } = validation.data

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
