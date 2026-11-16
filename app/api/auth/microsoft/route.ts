import { NextResponse } from 'next/server'
import { generateState, generateCodeVerifier } from 'arctic'
import { cookies } from 'next/headers'
import { getMicrosoftAuth, MicrosoftConfigError } from '@/lib/auth/oauth'
import { PORTAL_LOGIN } from '@/lib/auth/portals'
import { isLegacyStaffPortal, parsePortal } from '@/lib/auth/portals'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const portal = parsePortal(url.searchParams.get('portal'))
    const legacyStaff = isLegacyStaffPortal(url.searchParams.get('portal'))

    if (!portal && !legacyStaff) {
      return NextResponse.json(
        { ok: false, message: 'Unknown login portal.' },
        { status: 400 },
      )
    }

    const msAuth = getMicrosoftAuth()
    const state = generateState()
    const codeVerifier = generateCodeVerifier()
    const authUrl = await msAuth.createAuthorizationURL(state, codeVerifier, ['openid', 'profile', 'email'])

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
    cookieStore.set('microsoft_oauth_portal', portal ?? 'teacher', {
      path: '/',
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      maxAge: 60 * 10,
      sameSite: 'lax',
    })

    return NextResponse.redirect(authUrl)
  } catch (error) {
    const url = new URL(request.url)
    const portal = parsePortal(url.searchParams.get('portal')) ?? 'teacher'
    const back = (message: string) =>
      NextResponse.redirect(new URL(`${PORTAL_LOGIN[portal]}?error=${encodeURIComponent(message)}`, url.origin))

    if (error instanceof MicrosoftConfigError) {
      // Controlled configuration error: names of missing variables only, never values.
      console.error('Microsoft OAuth is not configured. Missing:', error.missing.join(', '))
      return back('Đăng nhập Microsoft 365 chưa được cấu hình. Vui lòng đăng nhập bằng tài khoản SmartAttend.')
    }
    console.error('Failed to initialize Microsoft OAuth:', error instanceof Error ? error.message : 'unknown error')
    return back('Không thể khởi tạo đăng nhập Microsoft lúc này. Vui lòng thử lại sau.')
  }
}
