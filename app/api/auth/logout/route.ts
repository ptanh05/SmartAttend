import { NextResponse } from 'next/server'
import { SESSION_COOKIE } from '@/lib/auth/cookies'
import { deleteAuthSession } from '@/lib/auth/session'
import { cookies } from 'next/headers'

export async function POST() {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  if (token) await deleteAuthSession(token)

  const response = NextResponse.json({ ok: true })
  response.cookies.set(SESSION_COOKIE, '', { httpOnly: true, path: '/', maxAge: 0 })
  return response
}
