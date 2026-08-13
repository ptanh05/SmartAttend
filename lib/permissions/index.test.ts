import { describe, expect, it } from 'vitest'
import {
  requireOrganizationAccess,
  requireRole,
  requireStudentAccess,
  requireTeacherAccess,
} from './index'
import type { User } from '@/lib/types/domain'

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'u1',
    organizationId: 'org1',
    name: 'Test',
    email: 'test@example.com',
    role: 'student',
    initials: 'T',
    department: 'CS',
    ...overrides,
  }
}

describe('permissions', () => {
  describe('requireRole', () => {
    it('allows a matching role', () => {
      expect(() => requireRole(makeUser({ role: 'admin' }), 'admin')).not.toThrow()
    })

    it('allows any role in the allowed list', () => {
      expect(() => requireRole(makeUser({ role: 'teacher' }), ['teacher', 'admin'])).not.toThrow()
    })

    it('throws when the role is not allowed', () => {
      expect(() => requireRole(makeUser({ role: 'student' }), 'teacher')).toThrow(/denied/)
    })

    it('throws when the user is missing', () => {
      expect(() => requireRole(null, 'admin')).toThrow(/required/)
      expect(() => requireRole(undefined, 'admin')).toThrow(/required/)
    })
  })

  describe('requireOrganizationAccess', () => {
    it('allows within the same organization', () => {
      expect(() => requireOrganizationAccess(makeUser(), 'org1')).not.toThrow()
    })

    it('throws for a different organization', () => {
      expect(() => requireOrganizationAccess(makeUser(), 'org-other')).toThrow(/denied/)
    })

    it('throws when the user is missing', () => {
      expect(() => requireOrganizationAccess(null, 'org1')).toThrow(/required/)
    })
  })

  describe('requireTeacherAccess', () => {
    it('allows teachers and admins', () => {
      expect(() => requireTeacherAccess(makeUser({ role: 'teacher' }))).not.toThrow()
      expect(() => requireTeacherAccess(makeUser({ role: 'admin' }))).not.toThrow()
    })

    it('rejects students', () => {
      expect(() => requireTeacherAccess(makeUser({ role: 'student' }))).toThrow(/denied/)
    })
  })

  describe('requireStudentAccess', () => {
    it('allows students only', () => {
      expect(() => requireStudentAccess(makeUser({ role: 'student' }))).not.toThrow()
      expect(() => requireStudentAccess(makeUser({ role: 'teacher' }))).toThrow(/denied/)
      expect(() => requireStudentAccess(makeUser({ role: 'admin' }))).toThrow(/denied/)
    })
  })
})
