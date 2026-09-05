import { NextResponse } from 'next/server'
import { getAttendancePolicy, updateAttendancePolicy } from '@/lib/attendance/server'
import { getCurrentAuth, requireAuth } from '@/lib/auth/context'

export async function GET() {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })

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
    const body = await request.json()

    const result = await updateAttendancePolicy(auth, {
      challengeTtlSeconds: typeof body.challengeTtlSeconds === 'number' ? body.challengeTtlSeconds : undefined,
      lateAfterMinutes: typeof body.lateAfterMinutes === 'number' ? body.lateAfterMinutes : undefined,
      requireTrustedDevice: typeof body.requireTrustedDevice === 'boolean' ? body.requireTrustedDevice : undefined,
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
