import { NextResponse } from 'next/server'
import { sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/cookies'
import { verifyPassword } from '@/lib/auth/password'
import { createAuthSession, resolveMembershipForLogin } from '@/lib/auth/session'
import type { Role } from '@/lib/types/domain'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const portal = body.portal === 'staff' ? 'staff' : 'student'

    if (!email || !password) {
      return NextResponse.json({ ok: false, message: 'Email and password are required.' }, { status: 400 })
    }

    const memberships = await resolveMembershipForLogin(email)
    const match = memberships.find((row) => !row.disabledAt && row.membershipStatus === 'active')

    if (!match || !(await verifyPassword(password, match.passwordHash))) {
      return NextResponse.json(
        { ok: false, code: 'invalid_credentials', message: 'Incorrect email or password.' },
        { status: 401 },
      )
    }

    const role = match.role as Role
    if (portal === 'student' && role !== 'student') {
      return NextResponse.json(
        { ok: false, message: 'Use the staff portal for this account.' },
        { status: 403 },
      )
    }
    if (portal === 'staff' && role === 'student') {
      return NextResponse.json(
        { ok: false, message: 'Use the student portal for this account.' },
        { status: 403 },
      )
    }

    const { token, expiresAt } = await createAuthSession(match.userId, match.membershipId)
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

    const response = NextResponse.json({ ok: true, role })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
    return response
  } catch (error) {
    console.error('Login failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to sign in right now.' }, { status: 500 })
  }
}
