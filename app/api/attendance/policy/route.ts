import { NextResponse } from 'next/server'
import { getAttendancePolicy, updateAttendancePolicy } from '@/lib/attendance/server'
import { getCurrentAuth, requireAuth, passwordChangePendingResponse } from '@/lib/auth/context'
import { validateRequestBody, attendancePolicySchema } from '@/lib/validation'

export async function GET() {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })

    const pending = await passwordChangePendingResponse(auth)
    if (pending) return pending

    const policy = await getAttendancePolicy(auth.organizationId)
    return NextResponse.json({ ok: true, policy })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to fetch policy'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const validation = await validateRequestBody(request, attendancePolicySchema, 'Cấu hình điểm danh không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { challengeTtlSeconds, lateAfterMinutes, requireTrustedDevice } = validation.data

    const result = await updateAttendancePolicy(auth, {
      challengeTtlSeconds,
      lateAfterMinutes,
      requireTrustedDevice,
    })

    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true, policy: result.policy })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update policy'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
