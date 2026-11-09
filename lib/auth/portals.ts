import type { Portal, Role } from '@/lib/types/domain'

/**
 * Portal ⇄ Role mapping.
 *
 * Each login portal maps 1:1 to exactly one role. A teacher account signing
 * into the admin portal (or vice-versa) is rejected server-side instead of
 * being silently redirected, so a user always lands in the workspace that
 * matches their credentials.
 */
export const PORTAL_ROLE: Record<Portal, Role> = {
  student: 'student',
  teacher: 'teacher',
  admin: 'admin',
}

/** Path prefix of each portal's workspace. */
export const PORTAL_HOME: Record<Portal, string> = {
  student: '/student/dashboard',
  teacher: '/teacher/dashboard',
  admin: '/admin/dashboard',
}

/** Path prefix of each portal's login screen. */
export const PORTAL_LOGIN: Record<Portal, string> = {
  student: '/student/login',
  teacher: '/teacher/login',
  admin: '/admin/login',
}

/** Normalizes an untrusted string coming from the request body / query string. */
export function parsePortal(value: unknown): Portal | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().toLowerCase()
  if (normalized === 'student' || normalized === 'teacher' || normalized === 'admin') {
    return normalized
  }
  return null
}

/**
 * Legacy alias support: the old UI had a single "staff" portal covering both
 * lecturers and admins. Requests still sending `staff` are resolved to the
 * role that actually owns the account, so existing clients keep working while
 * the UI moves to three explicit portals.
 */
export function isLegacyStaffPortal(value: unknown) {
  return typeof value === 'string' && value.trim().toLowerCase() === 'staff'
}

/** The role a portal expects. */
export function roleForPortal(portal: Portal): Role {
  return PORTAL_ROLE[portal]
}

/** The portal a role belongs to. */
export function portalForRole(role: Role): Portal {
  return role === 'student' ? 'student' : role === 'teacher' ? 'teacher' : 'admin'
}

/** i18n key describing the portal in the login switcher. */
export function portalLabelKey(portal: Portal) {
  return `landing.tab${portal.charAt(0).toUpperCase()}${portal.slice(1)}` as const
}
