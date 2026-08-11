import { createHash, randomBytes } from 'crypto'
import { and, eq, gt } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { authSessions, organizationMemberships, organizations, users } from '@/lib/db/schema'
import type { Role } from '@/lib/types/domain'

const SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000

function hashToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export type AuthContext = {
  userId: string
  membershipId: string
  organizationId: string
  role: Role
  email: string
  name: string
  initials: string
  department: string | null
  organizationName: string
  organizationPlan: string
}

export async function createAuthSession(userId: string, membershipId: string) {
  const token = randomBytes(32).toString('hex')
  const tokenHash = hashToken(token)
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)

  await db().insert(authSessions).values({
    id: nanoid(),
    userId,
    membershipId,
    tokenHash,
    expiresAt,
  })

  return { token, expiresAt }
}

export async function deleteAuthSession(token: string) {
  await db().delete(authSessions).where(eq(authSessions.tokenHash, hashToken(token)))
}

export async function getAuthContext(token: string | undefined | null): Promise<AuthContext | null> {
  if (!token) return null

  const rows = await db()
    .select({
      userId: users.id,
      membershipId: organizationMemberships.id,
      organizationId: organizations.id,
      role: organizationMemberships.role,
      email: users.email,
      name: users.name,
      initials: users.initials,
      department: organizationMemberships.department,
      organizationName: organizations.name,
      organizationPlan: organizations.plan,
      disabledAt: users.disabledAt,
      membershipStatus: organizationMemberships.status,
      expiresAt: authSessions.expiresAt,
    })
    .from(authSessions)
    .innerJoin(users, eq(authSessions.userId, users.id))
    .innerJoin(organizationMemberships, eq(authSessions.membershipId, organizationMemberships.id))
    .innerJoin(organizations, eq(organizationMemberships.organizationId, organizations.id))
    .where(and(eq(authSessions.tokenHash, hashToken(token)), gt(authSessions.expiresAt, new Date())))

  const row = rows[0]
  if (!row || row.disabledAt || row.membershipStatus !== 'active') return null

  return {
    userId: row.userId,
    membershipId: row.membershipId,
    organizationId: row.organizationId,
    role: row.role as Role,
    email: row.email,
    name: row.name,
    initials: row.initials,
    department: row.department,
    organizationName: row.organizationName,
    organizationPlan: row.organizationPlan,
  }
}

export async function resolveMembershipForLogin(email: string) {
  const rows = await db()
    .select({
      userId: users.id,
      membershipId: organizationMemberships.id,
      role: organizationMemberships.role,
      passwordHash: users.passwordHash,
      disabledAt: users.disabledAt,
      membershipStatus: organizationMemberships.status,
    })
    .from(users)
    .innerJoin(organizationMemberships, eq(users.id, organizationMemberships.userId))
    .where(eq(users.email, email.trim().toLowerCase()))

  return rows
}
