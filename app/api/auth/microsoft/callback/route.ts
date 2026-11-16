import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { evaluateMicrosoftIdentity, getMicrosoftAuth, MicrosoftConfigError, type MicrosoftIdTokenClaims } from '@/lib/auth/oauth'
import { decodeIdToken } from 'arctic'
import { db } from '@/lib/db'
import { auditLogs, externalAccounts, organizationMemberships, users } from '@/lib/db/schema'
import { and, eq, sql } from 'drizzle-orm'
import { createAuthSession } from '@/lib/auth/session'
import { nanoid } from 'nanoid'
import { parsePortal, portalForRole, PORTAL_HOME, PORTAL_LOGIN } from '@/lib/auth/portals'
import type { Role } from '@/lib/types/domain'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  const cookieStore = await cookies()
  const portal = parsePortal(cookieStore.get('microsoft_oauth_portal')?.value) ?? 'student'
  const loginUrl = (msg: string) =>
    new URL(`${PORTAL_LOGIN[portal]}?error=${encodeURIComponent(msg)}`, url.origin)

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
    const claims = decodeIdToken(idToken) as MicrosoftIdTokenClaims

    // The ID token comes straight from the token endpoint over TLS (code flow
    // with PKCE + state), so its signature need not be re-validated (OIDC Core
    // §3.1.3.7). Audience, tenant and identity claims are still enforced.
    const decision = evaluateMicrosoftIdentity(claims, {
      clientId: process.env.MICROSOFT_CLIENT_ID?.trim() ?? '',
      tenantId: process.env.MICROSOFT_TENANT_ID?.trim() ?? '',
    })
    if (!decision.ok) {
      return NextResponse.redirect(
        loginUrl(
          decision.reason === 'tenant'
            ? 'Tài khoản Microsoft không thuộc tổ chức/trường đại học được cho phép.'
            : decision.reason === 'audience'
              ? 'Phản hồi đăng nhập Microsoft không dành cho ứng dụng này.'
              : 'Không thể lấy thông tin định danh hoặc email từ tài khoản Microsoft.',
        ),
      )
    }
    const { providerAccountId, email } = decision

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
      // First Microsoft login: linking to an existing account by email is only
      // safe inside one specific institutional tenant (see evaluateMicrosoftIdentity).
      if (!decision.mayLinkByEmail) {
        return NextResponse.redirect(
          loginUrl('Tài khoản Microsoft này chưa được liên kết với SmartAttend. Vui lòng đăng nhập bằng mật khẩu hoặc liên hệ quản trị viên.'),
        )
      }

      // Look up user by email in our system
      const existingUsers = await db()
        .select()
        .from(users)
        .where(sql`lower(${users.email}) = ${email}`)

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

    // Validate portal compatibility: the portal must match the account's role.
    const expectedPortal = portalForRole(match.role as Role)
    if (portal !== expectedPortal) {
      return NextResponse.redirect(
        new URL(
          `${PORTAL_LOGIN[expectedPortal]}?error=${encodeURIComponent(
            expectedPortal === 'student'
              ? 'Tài khoản sinh viên, vui lòng đăng nhập tại Cổng Sinh viên.'
              : expectedPortal === 'teacher'
                ? 'Tài khoản giảng viên, vui lòng đăng nhập tại Cổng Giảng viên.'
                : 'Tài khoản quản trị, vui lòng đăng nhập tại Cổng Quản trị.',
          )}`,
          url.origin,
        ),
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

    const targetDashboard = PORTAL_HOME[portalForRole(match.role as Role)]

    const response = NextResponse.redirect(new URL(targetDashboard, url.origin))

    const { authCookieManager } = await import('@/lib/auth/cookies')
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    authCookieManager.saveSession(response, token, maxAge)
    response.cookies.delete('microsoft_oauth_state')
    response.cookies.delete('microsoft_oauth_code_verifier')
    response.cookies.delete('microsoft_oauth_portal')

    return response
  } catch (err) {
    if (err instanceof MicrosoftConfigError) {
      // Names only; values are never logged.
      console.error('Microsoft OAuth is not configured. Missing:', err.missing.join(', '))
      return NextResponse.redirect(loginUrl('Đăng nhập Microsoft chưa được cấu hình trên máy chủ.'))
    }
    console.error('Microsoft OAuth callback error:', err instanceof Error ? err.message : 'unknown error')
    return NextResponse.redirect(loginUrl('Đã xảy ra lỗi trong quá trình xác thực với Microsoft. Vui lòng thử lại.'))
  }
}
