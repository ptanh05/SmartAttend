import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organizationMemberships, organizations, users } from '@/lib/db/schema'
import {
  defaultStudentPassword,
  defaultTeacherPassword,
  importTeachers,
  parseTeacherCsv,
} from '@/lib/auth/users'
import {
  buildLecturerEmail,
  normalizeEmailDomain,
} from '@/lib/auth/default-credentials'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function makeAuthContext(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u',
    membershipId: 'm',
    organizationId: 'org',
    role: 'admin',
    email: 'admin@utc.edu.vn',
    name: 'Admin',
    initials: 'AD',
    department: null,
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Test University',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

describe('Default credentials policy', () => {
  it('uses the student code as the default student password', () => {
    expect(defaultStudentPassword('20260001')).toBe('20260001')
    expect(defaultStudentPassword(' 20260001 ')).toBe('20260001')
  })

  it('shares a single default password across imported lecturers', () => {
    expect(defaultTeacherPassword()).toBe('Gv@123456')
  })

  it('normalizes the institution email domain', () => {
    expect(normalizeEmailDomain('@UTC.edu.vn')).toBe('utc.edu.vn')
    expect(normalizeEmailDomain('  utc.edu.vn ')).toBe('utc.edu.vn')
    expect(normalizeEmailDomain('')).toBeNull()
    expect(normalizeEmailDomain(null)).toBeNull()
  })

  it('builds lecturer addresses from the local part and the domain', () => {
    expect(buildLecturerEmail('GV001', 'utc.edu.vn')).toBe('gv001@utc.edu.vn')
    expect(buildLecturerEmail('GV001', null)).toBe('gv001@utc.edu.vn')
    expect(buildLecturerEmail('  ', 'utc.edu.vn')).toBeNull()
  })
})

describe('parseTeacherCsv', () => {
  it('reads email, name and department columns', () => {
    const csv = 'email,name,department\ngv001@utc.edu.vn,Nguyen Van A,CNTT\ngv002@utc.edu.vn,Tran Thi B,KTVT'
    const rows = parseTeacherCsv(csv, 'utc.edu.vn')
    expect(rows).toHaveLength(2)
    expect(rows[0].email).toBe('gv001@utc.edu.vn')
    expect(rows[0].name).toBe('Nguyen Van A')
    expect(rows[0].department).toBe('CNTT')
  })

  it('completes a bare local part with the institution domain', () => {
    const csv = 'gv003,Nguyen Van C,CNTT'
    const rows = parseTeacherCsv(csv, 'utc.edu.vn')
    expect(rows[0].email).toBe('gv003@utc.edu.vn')
  })

  it('supports Vietnamese headers and semicolon delimiters', () => {
    const csv = 'Email;Họ và tên;Khoa\ngv004@utc.edu.vn;Nguyễn Văn D;Công nghệ thông tin'
    const rows = parseTeacherCsv(csv, 'utc.edu.vn')
    expect(rows).toHaveLength(1)
    expect(rows[0].email).toBe('gv004@utc.edu.vn')
    expect(rows[0].name).toBe('Nguyễn Văn D')
  })
})

describe.skipIf(!hasDb)('Admin imports lecturers', () => {
  it('creates lecturer accounts with the shared default password and rejects foreign domains', async () => {
    const orgId = `org_tch_import_${nanoid(8)}`
    const adminId = `usr_adm_${nanoid(8)}`
    const domain = 'utc.edu.vn'
    const goodEmail = `gv.${nanoid(6).toLowerCase()}@${domain}`
    const badEmail = `gv.${nanoid(6).toLowerCase()}@gmail.com`

    const adminAuth = makeAuthContext({ userId: adminId, organizationId: orgId, role: 'admin' })

    try {
      await db().insert(organizations).values({
        id: orgId,
        name: 'Đại học UTC Test Import GV',
        plan: 'Campus Plus',
        emailDomain: domain,
      })
      await db().insert(users).values({
        id: adminId,
        email: `admin_${orgId}@${domain}`,
        passwordHash: await hashPassword('AdminPassword123'),
        name: 'Admin UTC',
        initials: 'AD',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: adminId,
        role: 'admin',
        status: 'active',
      })

      const result = await importTeachers(adminAuth, [
        { email: goodEmail, name: 'ThS. Nguyễn Văn Thầy', department: 'CNTT' },
        { email: badEmail, name: 'Gmail Teacher', department: 'CNTT' },
      ])

      expect(result.created).toHaveLength(1)
      expect(result.created[0].email).toBe(goodEmail)
      expect(result.created[0].defaultPassword).toBe('Gv@123456')
      expect(result.skipped).toHaveLength(1)
      expect(result.skipped[0].email).toBe(badEmail)
      expect(result.skipped[0].reason).toContain(`@${domain}`)

      const created = await db().select().from(users).where(eq(users.email, goodEmail))
      expect(created).toHaveLength(1)
      expect(created[0].mustChangePassword).toBe(true)
      expect(await verifyPassword('Gv@123456', created[0].passwordHash)).toBe(true)

      const membership = await db()
        .select()
        .from(organizationMemberships)
        .where(eq(organizationMemberships.userId, created[0].id))
      expect(membership).toHaveLength(1)
      expect(membership[0].role).toBe('teacher')
      expect(membership[0].organizationId).toBe(orgId)
    } finally {
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, adminId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })

  it('skips lecturers that already belong to the organization', async () => {
    const orgId = `org_tch_dupe_${nanoid(8)}`
    const adminId = `usr_adm_${nanoid(8)}`
    const email = `gv.${nanoid(6).toLowerCase()}@utc.edu.vn`

    const adminAuth = makeAuthContext({ userId: adminId, organizationId: orgId, role: 'admin' })

    try {
      await db().insert(organizations).values({
        id: orgId,
        name: 'Đại học UTC Test Import GV 2',
        plan: 'Campus Plus',
        emailDomain: 'utc.edu.vn',
      })
      await db().insert(users).values({
        id: adminId,
        email: `admin_${orgId}@utc.edu.vn`,
        passwordHash: await hashPassword('AdminPassword123'),
        name: 'Admin UTC',
        initials: 'AD',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: adminId,
        role: 'admin',
        status: 'active',
      })

      const first = await importTeachers(adminAuth, [{ email, name: 'Giang Vien A' }])
      expect(first.created).toHaveLength(1)

      const second = await importTeachers(adminAuth, [{ email, name: 'Giang Vien A' }])
      expect(second.created).toHaveLength(0)
      expect(second.skipped).toHaveLength(1)
      expect(second.skipped[0].reason).toContain('đã tồn tại')
    } finally {
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, adminId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })
})
