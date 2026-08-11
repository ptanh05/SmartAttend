import { userForRole } from '@/lib/demo/data'
import type { DemoSession, Role } from '@/lib/types/domain'

export type DemoAuthResult = { ok: true; role: Role } | { ok: false; code: 'invalid_credentials' | 'account_disabled' | 'session_expired'; message: string }

const credentials: Record<string, { password: string; role: Role; disabled?: boolean }> = {
  'student@demo.com': { password: 'demo1234', role: 'student' },
  'teacher@demo.com': { password: 'demo1234', role: 'teacher' },
  'admin@demo.com': { password: 'demo1234', role: 'admin' },
  'disabled@demo.com': { password: 'demo1234', role: 'student', disabled: true },
}

export function demoSession(role: Role): DemoSession { return { user: userForRole(role), organization: { id: 'org_northstar', name: 'Northstar University', plan: 'Campus Plus' } } }
export function roleFromPath(pathname: string): Role { if (pathname.startsWith('/teacher')) return 'teacher'; if (pathname.startsWith('/admin')) return 'admin'; return 'student' }
export function authenticateDemo(email: string, password: string): DemoAuthResult {
  const record = credentials[email.trim().toLowerCase()]
  if (!record || record.password !== password) return { ok: false, code: 'invalid_credentials', message: 'Incorrect demo credentials. Please check your email and password.' }
  if (record.disabled) return { ok: false, code: 'account_disabled', message: 'This demo account is disabled. Contact your organization administrator.' }
  return { ok: true, role: record.role }
}
export function canAccessRole(role: Role, pathname: string) { const area = pathname.split('/')[1]; return !['student', 'teacher', 'admin'].includes(area) || area === role }
