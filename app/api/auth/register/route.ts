import { NextResponse } from 'next/server'
import { sessionCookieOptions, SESSION_COOKIE } from '@/lib/auth/cookies'
import { verifyTeacherRegistrationApiKey } from '@/lib/auth/registration-key'
import { registerTeacher } from '@/lib/auth/users'
import { createAuthSession } from '@/lib/auth/session'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name = typeof body.name === 'string' ? body.name : ''
    const email = typeof body.email === 'string' ? body.email : ''
    const password = typeof body.password === 'string' ? body.password : ''
    const organizationName = typeof body.organizationName === 'string' ? body.organizationName : ''
    const apiKey = typeof body.apiKey === 'string' ? body.apiKey : ''

    const keyCheck = verifyTeacherRegistrationApiKey(apiKey)
    if (!keyCheck.ok) {
      return NextResponse.json({ ok: false, message: keyCheck.message }, { status: 403 })
    }

    const result = await registerTeacher({ name, email, password, organizationName })
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    const { token, expiresAt } = await createAuthSession(result.userId, result.membershipId)
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

    const response = NextResponse.json({ ok: true, role: 'teacher' })
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
    return response
  } catch (error) {
    console.error('Registration failed', error)
    const detail = error instanceof Error ? error.message : String(error)
    return NextResponse.json({ ok: false, message: 'Unable to register right now.', detail }, { status: 500 })
  }
}
