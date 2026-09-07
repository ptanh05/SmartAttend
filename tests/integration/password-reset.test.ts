import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organizationMemberships, organizations, users } from '@/lib/db/schema'
import {
  adminResetStudentPassword,
  defaultStudentPassword,
  selfServiceResetPassword,
} from '@/lib/auth/users'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('Password Reset & Recovery Integration Tests', () => {
  it('allows a student to self-reset password to default Sv@{studentCode} with mustChangePassword=true', async () => {
    const orgId = `org_test_${nanoid(6)}`
    const studentUserId = `stu_test_${nanoid(6)}`
    const studentCode = `2026${Math.floor(1000 + Math.random() * 9000)}`
    const initialPasswordHash = await hashPassword('CustomSecretPassword123!')

    try {
      await db().insert(organizations).values({
        id: orgId,
        name: 'Reset Test University',
        plan: 'Campus Plus',
      })

      await db().insert(users).values({
        id: studentUserId,
        email: `${orgId}_${studentCode}@student.local`,
        passwordHash: initialPasswordHash,
        name: 'Nguyễn Văn Test',
        initials: 'NV',
        mustChangePassword: false,
      })

      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: studentUserId,
        role: 'student',
        studentCode,
        status: 'active',
      })

      // 1. Perform self-service password reset using studentCode
      const result = await selfServiceResetPassword({
        identifier: studentCode,
        portal: 'student',
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return

      expect(result.studentCode).toBe(studentCode)
      expect(result.temporaryPassword).toBe(`Sv@${studentCode}`)

      // 2. Verify in DB that password hash is now matching defaultStudentPassword
      const updatedUser = await db()
        .select({ passwordHash: users.passwordHash, mustChangePassword: users.mustChangePassword })
        .from(users)
        .where(eq(users.id, studentUserId))

      expect(updatedUser[0].mustChangePassword).toBe(true)
      const valid = await verifyPassword(defaultStudentPassword(studentCode), updatedUser[0].passwordHash)
      expect(valid).toBe(true)

      // Old password must no longer work
      const oldValid = await verifyPassword('CustomSecretPassword123!', updatedUser[0].passwordHash)
      expect(oldValid).toBe(false)
    } finally {
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, studentUserId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })

  it('enforces tenant isolation: teacher in Org A cannot reset student in Org B', async () => {
    const orgA = `org_a_${nanoid(6)}`
    const orgB = `org_b_${nanoid(6)}`
    const studentUserB = `stu_b_${nanoid(6)}`
    const studentCodeB = `2026${Math.floor(1000 + Math.random() * 9000)}`

    const teacherAuthA: AuthContext = {
      userId: `tch_a_${nanoid(6)}`,
      membershipId: 'm_a',
      organizationId: orgA,
      role: 'teacher',
      email: 'teacher@orga.edu.vn',
      name: 'Giảng viên Org A',
      initials: 'GV',
      department: null,
      studentCode: null,
      mustChangePassword: false,
      organizationName: 'Org A',
      organizationPlan: 'Campus Plus',
    }

    try {
      await db().insert(organizations).values([
        { id: orgA, name: 'Org A', plan: 'Campus Plus' },
        { id: orgB, name: 'Org B', plan: 'Campus Plus' },
      ])

      await db().insert(users).values({
        id: studentUserB,
        email: `${orgB}_${studentCodeB}@student.local`,
        passwordHash: await hashPassword('OriginalPassword!'),
        name: 'Sinh viên Org B',
        initials: 'SB',
        mustChangePassword: false,
      })

      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgB,
        userId: studentUserB,
        role: 'student',
        studentCode: studentCodeB,
        status: 'active',
      })

      // Teacher from Org A attempts to reset Student in Org B
      const result = await adminResetStudentPassword(teacherAuthA, studentUserB)
      expect(result.ok).toBe(false)
      expect(result.message).toContain('Không tìm thấy sinh viên')

      // Ensure password was NOT modified
      const current = await db()
        .select({ passwordHash: users.passwordHash })
        .from(users)
        .where(eq(users.id, studentUserB))

      const unchanged = await verifyPassword('OriginalPassword!', current[0].passwordHash)
      expect(unchanged).toBe(true)
    } finally {
      await db().delete(organizationMemberships).where(eq(organizationMemberships.userId, studentUserB))
      await db().delete(users).where(eq(users.id, studentUserB))
      await db().delete(organizations).where(eq(organizations.id, orgA))
      await db().delete(organizations).where(eq(organizations.id, orgB))
    }
  })
})
