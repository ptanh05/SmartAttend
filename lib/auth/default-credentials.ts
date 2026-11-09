import type { Role } from '@/lib/types/domain'

/**
 * Default credentials issued when an account is created by an administrator.
 *
 * - Students log in with their student code as both identifier and password.
 * - Lecturers log in with their institutional email and a shared default
 *   password. Both are forced to change the password on first sign-in.
 */
export const DEFAULT_TEACHER_PASSWORD = 'Gv@123456'

/**
 * Student default password: the student code itself, i.e. the same value the
 * student types in the identifier field.
 */
export function defaultStudentPassword(studentCode: string) {
  return studentCode.trim()
}

/** Lecturer default password: shared across all imported lecturers. */
export function defaultTeacherPassword() {
  return DEFAULT_TEACHER_PASSWORD
}

/** Fallback email domain when the organization has not configured one. */
export const FALLBACK_EMAIL_DOMAIN = 'utc.edu.vn'

/**
 * Normalizes an email domain into the bare host part, e.g.
 * `@UTC.edu.vn` → `utc.edu.vn`.
 */
export function normalizeEmailDomain(value: string | null | undefined): string | null {
  if (!value) return null
  const trimmed = value.trim().toLowerCase().replace(/^@+/, '')
  if (!trimmed) return null
  // Strip anything that is not part of a host name.
  const cleaned = trimmed.replace(/[^a-z0-9.\-]/g, '')
  return cleaned || null
}

/**
 * Builds the email address of a lecturer: local part + institution domain.
 * Returns `null` when the local part is empty.
 */
export function buildLecturerEmail(localPart: string, domain: string | null | undefined): string | null {
  const local = localPart.trim().toLowerCase()
  if (!local) return null
  const host = normalizeEmailDomain(domain) ?? FALLBACK_EMAIL_DOMAIN
  return `${local}@${host}`
}

/** Roles that an administrator may import from a roster. */
export type ImportableRole = Extract<Role, 'student' | 'teacher'>
