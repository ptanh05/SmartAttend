import { cookies } from 'next/headers'
import { SESSION_COOKIE } from '@/lib/auth/cookies'
import { getAuthContext, type AuthContext } from '@/lib/auth/session'
import type { Role } from '@/lib/types/domain'

export async function getCurrentAuth(): Promise<AuthContext | null> {
  const cookieStore = await cookies()
  const token = cookieStore.get(SESSION_COOKIE)?.value
  return getAuthContext(token)
}

export async function requireAuth(allowed?: Role | Role[]) {
  const auth = await getCurrentAuth()
  if (!auth) throw new AuthError('Authentication required', 401)

  if (allowed) {
    const roles = Array.isArray(allowed) ? allowed : [allowed]
    if (!roles.includes(auth.role) && auth.role !== 'admin') {
      throw new AuthError('Role access denied', 403)
    }
  }

  return auth
}

export class AuthError extends Error {
  status: number

  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function organizationScope(auth: AuthContext) {
  return { organizationId: auth.organizationId }
}
