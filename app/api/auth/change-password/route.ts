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

    // Issue freshly rotated session token for this client while all prior sessions are revoked
    const { createAuthSession } = await import('@/lib/auth/session')
    const { sessionCookieOptions, SESSION_COOKIE } = await import('@/lib/auth/cookies')
    const { token, expiresAt } = await createAuthSession(auth.userId, auth.membershipId)
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

    const response = NextResponse.json({ ok: true })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
    return response
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    console.error('Change password failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to change password right now.' }, { status: 500 })
  }
}
