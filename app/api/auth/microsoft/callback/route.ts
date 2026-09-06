import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getMicrosoftAuth } from '@/lib/auth/oauth'
import { decodeIdToken } from 'arctic'
import { db } from '@/lib/db'
import { auditLogs, externalAccounts, organizationMemberships, users } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'
import { createAuthSession } from '@/lib/auth/session'
import { nanoid } from 'nanoid'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const cookieStore = await cookies()
  const portal = cookieStore.get('microsoft_oauth_portal')?.value === 'staff' ? 'staff' : 'student'
  const loginUrl = (msg: string) =>
    new URL(`/${portal}/login?error=${encodeURIComponent(msg)}`, url.origin)

  if (error) {
    return NextResponse.redirect(loginUrl(`Đăng nhập Microsoft thất bại: ${error}`))
  }

  if (!code || !state) {
    return NextResponse.redirect(loginUrl('Phản hồi từ Microsoft không hợp lệ.'))
  }

  const storedState = cookieStore.get('microsoft_oauth_state')?.value
  const storedCodeVerifier = cookieStore.get('microsoft_oauth_code_verifier')?.value

  // Cleanup oauth transient cookies
  cookieStore.delete('microsoft_oauth_state')
  cookieStore.delete('microsoft_oauth_code_verifier')
  cookieStore.delete('microsoft_oauth_portal')

  if (!storedState || !storedCodeVerifier || state !== storedState) {
    return NextResponse.redirect(loginUrl('Lỗi bảo mật (OAuth state mismatch). Vui lòng thử lại.'))
  }

  try {
    const msAuth = getMicrosoftAuth()
    const tokens = await msAuth.validateAuthorizationCode(code, storedCodeVerifier)

    const idToken = tokens.idToken()
    const payload = decodeIdToken(idToken) as {
      oid: string
      tid?: string
      email?: string
      preferred_username?: string
      name?: string
    }

    const providerAccountId = payload.oid
    const email = (payload.email || payload.preferred_username || '').toLowerCase()
    const configuredTenant = process.env.MICROSOFT_TENANT_ID?.trim()

    // Tenant check if restricted to a specific institution
    if (
      configuredTenant &&
      configuredTenant !== 'common' &&
      configuredTenant !== 'organizations' &&
      payload.tid &&
      payload.tid !== configuredTenant
    ) {
      return NextResponse.redirect(
        loginUrl('Tài khoản Microsoft không thuộc tổ chức/trường đại học được cho phép.'),
      )
    }

    if (!providerAccountId || !email) {
      return NextResponse.redirect(
        loginUrl('Không thể lấy thông tin định danh hoặc email từ tài khoản Microsoft.'),
      )
    }

    // Check if external account already linked
    const existingLinks = await db()
      .select()
      .from(externalAccounts)
      .where(
        and(
          eq(externalAccounts.provider, 'microsoft'),
          eq(externalAccounts.providerAccountId, providerAccountId),
        ),
      )

    let userIdToLogin: string | null = null

    if (existingLinks.length > 0) {
      userIdToLogin = existingLinks[0].userId
    } else {
      // Look up user by email in our system
      const existingUsers = await db()
        .select()
        .from(users)
        .where(eq(users.email, email))

      if (existingUsers.length === 0) {
        return NextResponse.redirect(
          loginUrl(`Tài khoản chưa tồn tại trong hệ thống SmartAttend (${email}). Vui lòng liên hệ nhà trường để được cấp tài khoản.`),
        )
      }

      const user = existingUsers[0]
      userIdToLogin = user.id

      // Link external account
      await db().insert(externalAccounts).values({
        id: nanoid(),
        userId: user.id,
        provider: 'microsoft',
        providerAccountId,
        email,
      })
    }

    // Resolve membership by userId directly
    const memberships = await db()
      .select({
        userId: users.id,
        membershipId: organizationMemberships.id,
        organizationId: organizationMemberships.organizationId,
        role: organizationMemberships.role,
        disabledAt: users.disabledAt,
        membershipStatus: organizationMemberships.status,
        mustChangePassword: users.mustChangePassword,
      })
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .where(eq(users.id, userIdToLogin))

    const match = memberships.find((row) => !row.disabledAt && row.membershipStatus === 'active')

    if (!match) {
      return NextResponse.redirect(
        loginUrl('Tài khoản đã bị khóa hoặc chưa có tư cách thành viên hợp lệ.'),
      )
    }

    // Validate portal compatibility
    if (portal === 'student' && match.role !== 'student') {
      return NextResponse.redirect(
        new URL(`/staff/login?error=${encodeURIComponent('Tài khoản cán bộ/giảng viên, vui lòng đăng nhập tại Cổng Cán bộ.')}`, url.origin),
      )
    }
    if (portal === 'staff' && match.role === 'student') {
      return NextResponse.redirect(
        new URL(`/student/login?error=${encodeURIComponent('Tài khoản sinh viên, vui lòng đăng nhập tại Cổng Sinh viên.')}`, url.origin),
      )
    }

    const { token, expiresAt } = await createAuthSession(match.userId, match.membershipId)

    // Audit log successful SSO
    await db().insert(auditLogs).values({
      id: nanoid(),
      organizationId: match.organizationId,
      actorId: match.userId,
      actorName: email,
      action: 'Đăng nhập Microsoft 365 SSO',
      target: match.userId,
      severity: 'info',
    })

    const targetDashboard =
      match.role === 'student'
        ? '/student'
        : match.role === 'teacher'
          ? '/teacher/dashboard'
          : '/admin/dashboard'

    const response = NextResponse.redirect(new URL(targetDashboard, url.origin))

    const { sessionCookieOptions, SESSION_COOKIE } = await import('@/lib/auth/cookies')
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
    response.cookies.delete('microsoft_oauth_state')
    response.cookies.delete('microsoft_oauth_code_verifier')
    response.cookies.delete('microsoft_oauth_portal')

    return response
  } catch (err) {
    console.error('Microsoft OAuth callback error:', err)
    return NextResponse.redirect(loginUrl('Đã xảy ra lỗi trong quá trình xác thực với Microsoft. Vui lòng thử lại.'))
  }
}
