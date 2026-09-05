import { NextResponse } from 'next/server'
import { resolveSuspiciousAttempt } from '@/lib/attendance/server'
import { requireAuth } from '@/lib/auth/context'

export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const body = await request.json()
    const { attemptId, action } = body

    if (!attemptId || (action !== 'approved' && action !== 'dismissed')) {
      return NextResponse.json({ ok: false, message: 'Invalid attemptId or action' }, { status: 400 })
    }

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
