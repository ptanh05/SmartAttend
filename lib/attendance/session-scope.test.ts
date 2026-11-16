import { describe, expect, it, vi } from 'vitest'
import { classSessionScopeFor } from './server'

// classSessionScopeFor is pure; the DB module is stubbed so importing the
// service file never opens a connection.
vi.mock('@/lib/db', () => ({
  db: () => {
    throw new Error('DB must not be used in this unit test')
  },
}))

import type { AuthContext } from '@/lib/auth/session'

function auth(role: AuthContext['role'], userId = 'u1'): AuthContext {
  return {
    userId,
    membershipId: 'm',
    organizationId: 'org_1',
    role,
    email: 'x@example.com',
    name: 'X',
    initials: 'X',
    department: null,
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Org',
    organizationPlan: 'Plan',
  }
}

describe('classSessionScopeFor (who may see which sessions / codes)', () => {
  it('students are scoped to their enrollments and never see codes', () => {
    expect(classSessionScopeFor(auth('student', 'stu'))).toEqual(['org_1', 'stu', undefined, { revealChallenges: false }])
  })

  it('teachers are scoped to the courses they teach', () => {
    expect(classSessionScopeFor(auth('teacher', 'tch_A'))).toEqual(['org_1', undefined, 'tch_A', { revealChallenges: true }])
  })

  it('admins see their whole organization (and only it)', () => {
    expect(classSessionScopeFor(auth('admin', 'adm'))).toEqual(['org_1', undefined, undefined, { revealChallenges: true }])
  })
})
