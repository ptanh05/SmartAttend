import { NextResponse } from 'next/server'
import { resolveSuspiciousAttempt } from '@/lib/attendance/server'
import { requireAuth } from '@/lib/auth/context'
import { validateRequestBody, suspiciousActionSchema } from '@/lib/validation'

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const validation = await validateRequestBody(request, suspiciousActionSchema, 'Dữ liệu xử lý cảnh báo không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { attemptId, action } = validation.data

    const result = await resolveSuspiciousAttempt(auth, attemptId, action)
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to resolve suspicious attempt'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
