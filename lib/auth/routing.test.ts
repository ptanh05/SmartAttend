import { describe, expect, it } from 'vitest'
import { canAccessRole } from './routing'
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
  ])('canAccessRole(%s, %s) is %s', (role, path, expected) => {
    expect(canAccessRole(role, path)).toBe(expected)
  })
})
