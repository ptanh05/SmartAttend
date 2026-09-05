import { NextResponse } from 'next/server'
import { cookies } from 'next/headers'
import { getMicrosoftAuth } from '@/lib/auth/oauth'
import { decodeIdToken } from 'arctic'
import { db } from '@/lib/db'
import { externalAccounts, users } from '@/lib/db/schema'
import { eq } from 'drizzle-orm'
import { createAuthSession, resolveMembershipForLogin } from '@/lib/auth/session'

export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  if (error) {
    return NextResponse.redirect(new URL(`/auth/login?error=Microsoft login failed: ${error}`, url.origin))
  }

  if (!code || !state) {
    return NextResponse.redirect(new URL('/auth/login?error=Invalid OAuth callback', url.origin))
  }

  const cookieStore = await cookies()
  const storedState = cookieStore.get('microsoft_oauth_state')?.value
  const storedCodeVerifier = cookieStore.get('microsoft_oauth_code_verifier')?.value

  if (!storedState || !storedCodeVerifier || state !== storedState) {
    return NextResponse.redirect(new URL('/auth/login?error=OAuth state mismatch. Please try again.', url.origin))
  }

  try {
    const msAuth = getMicrosoftAuth()
    const tokens = await msAuth.validateAuthorizationCode(code, storedCodeVerifier)
    
    // Extract info from ID Token
    const idToken = tokens.idToken()
    const payload = decodeIdToken(idToken) as {
      oid: string
      email?: string
      preferred_username?: string
      name?: string
    }

    const providerAccountId = payload.oid
    const email = (payload.email || payload.preferred_username || '').toLowerCase()

    if (!providerAccountId || !email) {
      return NextResponse.redirect(new URL('/auth/login?error=Could not retrieve email or ID from Microsoft account.', url.origin))
    }

    // Check if external account exists
    const existingLinks = await db().select().from(externalAccounts).where(eq(externalAccounts.providerAccountId, providerAccountId))
    
    let userIdToLogin: string | null = null

    if (existingLinks.length > 0) {
      userIdToLogin = existingLinks[0].userId
    } else {
      // Find user by email
      const existingUsers = await db().select().from(users).where(eq(users.email, email))
      if (existingUsers.length === 0) {
        return NextResponse.redirect(new URL(`/auth/login?error=Account not found. Please contact administration to register this email: ${email}`, url.origin))
      }
      
      const user = existingUsers[0]
      userIdToLogin = user.id

      // Link account
      await db().insert(externalAccounts).values({
        id: crypto.randomUUID(),
        userId: user.id,
        provider: 'microsoft',
        providerAccountId: providerAccountId,
        email: email,
      })
    }

    // Now resolve memberships to create session
    // For simplicity, we just use resolveMembershipForLogin which checks organization_memberships
    const memberships = await resolveMembershipForLogin(email)
    const match = memberships.find((row) => !row.disabledAt && row.membershipStatus === 'active')

    if (!match) {
      return NextResponse.redirect(new URL('/auth/login?error=Your account is disabled or lacks an active membership.', url.origin))
    }

    const { token, expiresAt } = await createAuthSession(match.userId, match.membershipId)

    // Clear oauth cookies
    cookieStore.delete('microsoft_oauth_state')
    cookieStore.delete('microsoft_oauth_code_verifier')

    // Redirect to dashboard based on role (staff or student)
    const dashboardUrl = match.role === 'student' ? '/student' : '/dashboard'
    const response = NextResponse.redirect(new URL(dashboardUrl, url.origin))
    
    const { sessionCookieOptions, SESSION_COOKIE } = await import('@/lib/auth/cookies')
    const maxAge = Math.floor((expiresAt.getTime() - Date.now()) / 1000)
    response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions(maxAge))
    
    return response

  } catch (err) {
    console.error('Microsoft OAuth error:', err)
    return NextResponse.redirect(new URL('/auth/login?error=An error occurred during Microsoft authentication.', url.origin))
  }
}
