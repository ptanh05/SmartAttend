import { NextResponse } from 'next/server'
import { generateState, generateCodeVerifier } from 'arctic'
import { cookies } from 'next/headers'
import { getMicrosoftAuth } from '@/lib/auth/oauth'

export async function GET() {
  try {
    const msAuth = getMicrosoftAuth()
    const state = generateState()
    const codeVerifier = generateCodeVerifier()
    const url = await msAuth.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email'])

    const cookieStore = await cookies()
    cookieStore.set('microsoft_oauth_state', state, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 10,
      sameSite: 'lax',
    })
    cookieStore.set('microsoft_oauth_code_verifier', codeVerifier, {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 10,
      sameSite: 'lax',
    })

    return NextResponse.redirect(url)
  } catch (error) {
    console.error('Failed to initialize Microsoft OAuth:', error)
    return NextResponse.json(
      { ok: false, message: 'Server is not configured for Microsoft login.' },
      { status: 500 },
    )
  }
}
