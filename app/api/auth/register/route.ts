import { NextResponse } from 'next/server'
import { authCookieManager } from '@/lib/auth/cookies'
import { verifyTeacherRegistrationApiKey } from '@/lib/auth/registration-key'
import { registerAdministrator } from '@/lib/auth/users'
import { createAuthSession } from '@/lib/auth/session'
import { clientIp, registerLimiter } from '@/lib/rate-limit'
import { validateRequestBody, registerAdminSchema } from '@/lib/validation'

/**
 * Registers the first administrator of an organization.
 *
 * Lecturers and students are no longer self-service: they are created by an
 * administrator through the roster import (see `/api/users/import`).
 */
export async function POST(request: Request) {
  try {
    const rate = await registerLimiter.consume(clientIp(request))
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many registration attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    const validation = await validateRequestBody(request, registerAdminSchema, 'Thông tin đăng ký không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { name, email, password, organizationName, emailDomain, apiKey } = validation.data

    const keyCheck = verifyTeacherRegistrationApiKey(apiKey)
    if (!keyCheck.ok) {
      return NextResponse.json({ ok: false, message: keyCheck.message }, { status: 403 })
    }

    const result = await registerAdministrator({ name, email, password, organizationName, emailDomain: emailDomain || '' })
    if (!result.ok) {
      return NextResponse.json({ ok: false, message: result.message }, { status: 400 })
    }

    const { token, expiresAt } = await createAuthSession(result.userId, result.membershipId)
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)

    const response = NextResponse.json({ ok: true, role: 'admin' })
    authCookieManager.saveSession(response, token, maxAge)
    return response
  } catch (error) {
    console.error('Registration failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to register right now.' }, { status: 500 })
  }
}
