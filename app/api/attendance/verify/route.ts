import { NextResponse } from 'next/server'
import { verifyAttendance } from '@/lib/attendance/server'
import { requireAuth } from '@/lib/auth/context'
import { challengeCode } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth('student')
    const body = await request.json()
    const code = challengeCode(body.code)
    const device = typeof body.device === 'string' ? body.device : 'This browser'
    const result = await verifyAttendance(auth, code, device)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed.'
    return NextResponse.json({ ok: false, confidence: 0, message }, { status: 400 })
  }
}
