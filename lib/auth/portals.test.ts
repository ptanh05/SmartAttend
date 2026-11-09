import { describe, expect, it } from 'vitest'
import {
  isLegacyStaffPortal,
  parsePortal,
  portalForRole,
  PORTAL_HOME,
  PORTAL_LOGIN,
  PORTAL_ROLE,
} from './portals'
import type { Portal, Role } from '@/lib/types/domain'

describe('parsePortal', () => {
  it.each<[unknown, Portal | null]>([
    ['student', 'student'],
    ['teacher', 'teacher'],
    ['admin', 'admin'],
    ['  Teacher  ', 'teacher'],
    ['ADMIN', 'admin'],
    ['staff', null],
    ['', null],
    ['unknown', null],
    [undefined, null],
    [null, null],
    [42, null],
  ])('parsePortal(%j) is %j', (input, expected) => {
    expect(parsePortal(input)).toBe(expected)
  })
})

describe('isLegacyStaffPortal', () => {
  it('accepts the legacy combined staff portal', () => {
    expect(isLegacyStaffPortal('staff')).toBe(true)
    expect(isLegacyStaffPortal(' STAFF ')).toBe(true)
  })

  it('rejects anything else', () => {
    expect(isLegacyStaffPortal('teacher')).toBe(false)
    expect(isLegacyStaffPortal(undefined)).toBe(false)
  })
})

describe('portal ⇄ role mapping', () => {
  it('maps every portal to exactly one role', () => {
    expect(PORTAL_ROLE).toEqual({ student: 'student', teacher: 'teacher', admin: 'admin' })
  })

  it('maps every role back to its portal', () => {
    const roles: Role[] = ['student', 'teacher', 'admin']
    for (const role of roles) {
      expect(portalForRole(role)).toBe(role)
    }
  })
})

describe('portal routes', () => {
  it('points each portal to its own login screen', () => {
    expect(PORTAL_LOGIN).toEqual({
      student: '/student/login',
      teacher: '/teacher/login',
      admin: '/admin/login',
    })
  })

  it('points each portal to its own workspace', () => {
    expect(PORTAL_HOME).toEqual({
      student: '/student/dashboard',
      teacher: '/teacher/dashboard',
      admin: '/admin/dashboard',
    })
  })
})
