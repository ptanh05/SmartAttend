import { NextResponse } from 'next/server'
import { verifyAttendance } from '@/lib/attendance/server'
import { requireAuth } from '@/lib/auth/context'
import { clientIp, verifyLimiter } from '@/lib/rate-limit'
import { validateRequestBody, verifyAttendanceSchema } from '@/lib/validation'

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

    const validation = await validateRequestBody(request, verifyAttendanceSchema, 'Dữ liệu điểm danh không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const {
      code,
      device,
      method,
      sessionId,
      ultrasonicVerified,
      biometricVerified,
      webauthnAssertion,
      acousticProof,
    } = validation.data

    const result = await verifyAttendance(auth, code, device, {
      sessionId,
      method,
      ultrasonicVerified: Boolean(ultrasonicVerified),
      biometricVerified: Boolean(biometricVerified),
      webauthnAssertion,
      acousticProof,
    })
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Verification failed.'
    return NextResponse.json({ ok: false, confidence: 0, message }, { status: 400 })
  }
}
