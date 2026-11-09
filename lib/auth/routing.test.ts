import { describe, expect, it } from 'vitest'
import { canAccessRole, portalForPath } from './routing'
import type { Role } from '@/lib/types/domain'

describe('canAccessRole', () => {
  it.each<[Role, string, boolean]>([
    // Public / unknown areas are open to everyone.
    ['student', '/', true],
    ['teacher', '/', true],
    ['admin', '/', true],
    ['student', '/somewhere', true],
    // Role-scoped areas require a matching role.
    ['student', '/student', true],
    ['student', '/teacher', false],
    ['student', '/admin', false],
    ['teacher', '/student', false],
    ['teacher', '/teacher', true],
    ['teacher', '/admin', false],
    ['admin', '/admin', true],
    // A portal is exclusive: even an admin stays inside the admin portal
    // rather than impersonating the student/teacher portals.
    ['admin', '/student', false],
    ['admin', '/teacher', false],
    // The legacy `staff` area is protected as the lecturer area.
    ['teacher', '/staff', true],
    ['admin', '/staff', false],
    ['student', '/staff', false],
  ])('canAccessRole(%s, %s) is %s', (role, path, expected) => {
    expect(canAccessRole(role, path)).toBe(expected)
  })
})

describe('portalForPath', () => {
  it.each<[string, string | null]>([
    ['/student/login', 'student'],
    ['/student/dashboard', 'student'],
    ['/teacher/login', 'teacher'],
    ['/teacher/dashboard', 'teacher'],
    ['/admin/login', 'admin'],
    ['/admin/dashboard', 'admin'],
    ['/staff/login', 'teacher'],
    ['/', null],
    ['/unauthorized', null],
  ])('portalForPath(%s) is %j', (path, expected) => {
    expect(portalForPath(path)).toBe(expected)
  })
})
