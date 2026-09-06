import { NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { changeUserPassword } from '@/lib/auth/users'
import { changePasswordLimiter, clientIp } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth()
    const rateKey = `${clientIp(request)}:${auth.userId}`
    const rate = await changePasswordLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    const body = await request.json()
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : ''
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : ''

    const result = await changeUserPassword(auth, currentPassword, newPassword)
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    console.error('Change password failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to change password right now.' }, { status: 500 })
  }
}
