import { NextResponse } from 'next/server'
import { verifyAttendance } from '@/lib/attendance/server'
import { requireAuth } from '@/lib/auth/context'
import { clientIp, verifyLimiter } from '@/lib/rate-limit'
import { challengeCode } from '@/lib/validation'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth('student')
    const rate = await verifyLimiter.consume(`${clientIp(request)}:${auth.userId}`)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, confidence: 0, message: 'Too many attempts. Please wait before trying again.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }
    const body = await request.json()
    const code = challengeCode(body.code)
    const device = typeof body.device === 'string' ? body.device : 'This browser'
    const method = typeof body.method === 'string' ? body.method : 'manual_code'
    const ultrasonicVerified = Boolean(body.ultrasonicVerified)
    const biometricVerified = Boolean(body.biometricVerified)

    const result = await verifyAttendance(auth, code, device, {
      method,
      ultrasonicVerified,
      biometricVerified,
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed.'
    return NextResponse.json({ ok: false, confidence: 0, message }, { status: 400 })
  }
}
