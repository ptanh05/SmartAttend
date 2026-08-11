import type { Role, User } from '@/lib/types/domain'

export function requireRole(user: User | null | undefined, allowed: Role | Role[]) {
  if (!user) throw new Error('Authentication required')
  const roles = Array.isArray(allowed) ? allowed : [allowed]
  if (!roles.includes(user.role)) throw new Error('Role access denied')
  return user
}

export function requireOrganizationAccess(user: User | null | undefined, organizationId: string) {
  if (!user) throw new Error('Authentication required')
  if (user.organizationId !== organizationId) throw new Error('Organization access denied')
  return user
}

export function requireTeacherAccess(user: User | null | undefined) {
  return requireRole(user, ['teacher', 'admin'])
}

export function requireStudentAccess(user: User | null | undefined) {
  return requireRole(user, 'student')
}
