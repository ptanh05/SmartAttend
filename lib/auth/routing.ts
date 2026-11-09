import type { Portal, Role } from '@/lib/types/domain'

/**
 * Path prefixes reserved for role-scoped workspaces.
 * `staff` is kept for backwards compatibility with the legacy combined portal
 * and is treated exactly like `teacher` for access control.
 */
const PROTECTED_AREAS: Record<string, Portal> = {
  student: 'student',
  teacher: 'teacher',
  admin: 'admin',
  staff: 'teacher',
}

/**
 * Decides whether the authenticated role may render the given pathname.
 *
 * Public areas are open to everyone. Role-scoped areas are exclusive: each
 * portal renders only for the role it belongs to, so a teacher never lands in
 * the student or admin workspace.
 */
export function canAccessRole(role: Role, pathname: string) {
  const area = pathname.split('/')[1]
  const required = PROTECTED_AREAS[area]
  if (!required) return true
  return required === role
}

/**
 * The portal whose login screen should be shown for a given path.
 * Used to preselect the correct portal tab on the login form.
 */
export function portalForPath(pathname: string): Portal | null {
  const area = pathname.split('/')[1]
  const portal = PROTECTED_AREAS[area]
  if (!portal) return null
  return portal
}
