import { NextResponse } from 'next/server'
import { authCookieManager, SESSION_COOKIE } from '@/lib/auth/cookies'
import { CSRF_COOKIE_NAME } from '@/lib/auth/csrf'
import { deleteAuthSession } from '@/lib/auth/session'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()
  const token = authCookieManager.getSessionToken(cookieStore) ?? cookieStore.get(SESSION_COOKIE)?.value
  if (token) await deleteAuthSession(token)

  const response = NextResponse.json({ ok: true })
  authCookieManager.clearSession(response)
  response.cookies.set(CSRF_COOKIE_NAME, '', { path: '/', maxAge: 0 })
  return response
}
