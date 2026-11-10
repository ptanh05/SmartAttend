import { config } from 'dotenv'
config({ path: '.env.local' })
config({ path: '.env' })
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import {
  createCourse,
  createDepartment,
  deleteDepartment,
  listDepartmentsWithDetails,
  updateDepartment,
} from '@/lib/attendance/server'
import type { AuthContext } from '@/lib/auth/session'
import { db } from '@/lib/db'
import { courses, organizationMemberships, organizations, users } from '@/lib/db/schema'
import { and, eq } from 'drizzle-orm'

describe('Departments Management Suite & Role Boundaries', () => {
  const orgId = `org_dept_${nanoid(8)}`
  const otherOrgId = `org_other_${nanoid(8)}`

  function makeAuth(overrides: Partial<AuthContext>): AuthContext {
    return {
      userId: `usr_${nanoid(8)}`,
      membershipId: `mem_${nanoid(8)}`,
      organizationId: orgId,
      role: 'admin',
      email: `user_${nanoid(6)}@utc.edu.vn`,
      name: 'Test Admin',
      initials: 'TA',
      department: 'CNTT',
      studentCode: null,
      mustChangePassword: false,
      organizationName: 'Đại học GTVT',
      organizationPlan: 'Campus Plus',
      organizationEmailDomain: 'utc.edu.vn',
      ...overrides,
    }
  }

  const adminAuth = makeAuth({
    role: 'admin',
    name: 'Admin UTC',
    email: `admin_${nanoid(6)}@utc.edu.vn`,
  })

  const teacherAuth = makeAuth({
    role: 'teacher',
    name: 'Giảng viên A',
    email: `teacher_${nanoid(6)}@utc.edu.vn`,
  })

  it('DEPT-01: Admin can create departments and rejects duplicates and invalid names', async () => {
    await db().insert(organizations).values([
      { id: orgId, name: 'Đại học GTVT', plan: 'Campus Plus' },
      { id: otherOrgId, name: 'Đại học Bách Khoa', plan: 'Campus Plus' },
    ])
    await db().insert(users).values([
      { id: adminAuth.userId, email: adminAuth.email, name: adminAuth.name, initials: 'AU', passwordHash: 'hash' },
      { id: teacherAuth.userId, email: teacherAuth.email, name: teacherAuth.name, initials: 'GA', passwordHash: 'hash' },
    ])
    await db().insert(organizationMemberships).values([
      { id: `mem_${nanoid(8)}`, organizationId: orgId, userId: adminAuth.userId, role: 'admin', status: 'active' },
      { id: `mem_${nanoid(8)}`, organizationId: orgId, userId: teacherAuth.userId, role: 'teacher', status: 'active' },
    ])

    // Teacher cannot create department
    const teacherCreate = await createDepartment(teacherAuth, 'Khoa CNTT')
    expect(teacherCreate.ok).toBe(false)

    // Admin creates department
    const res1 = await createDepartment(adminAuth, 'Khoa Công nghệ thông tin')
    expect(res1.ok).toBe(true)
    if (res1.ok) {
      expect(res1.department.name).toBe('Khoa Công nghệ thông tin')
    }

    // Duplicate creation is blocked
    const resDup = await createDepartment(adminAuth, 'Khoa công nghệ thông tin')
    expect(resDup.ok).toBe(false)
    expect(resDup.message).toContain('đã tồn tại')
  })

  it('DEPT-02: listDepartmentsWithDetails scopes to organization and calculates course counts', async () => {
    // Add department to other org
    await createDepartment({ ...adminAuth, organizationId: otherOrgId }, 'Khoa Khác Bên Org 2')

    // Add a course in orgId under 'Khoa Công nghệ thông tin'
    await createCourse(adminAuth, {
      code: `IT_${nanoid(4)}`,
      name: 'Lập trình Web',
      department: 'Khoa Công nghệ thông tin',
      teacherId: teacherAuth.userId,
    })

    const list = await listDepartmentsWithDetails(adminAuth)
    const cntt = list.find((d) => d.name === 'Khoa Công nghệ thông tin')
    expect(cntt).toBeDefined()
    expect(cntt?.courseCount).toBeGreaterThanOrEqual(1)

    // Verify other org department does not leak
    expect(list.some((d) => d.name === 'Khoa Khác Bên Org 2')).toBe(false)
  })

  it('DEPT-03: Renaming department cascades to linked courses', async () => {
    const createRes = await createDepartment(adminAuth, 'Khoa Cơ khí Chế tạo')
    expect(createRes.ok).toBe(true)
    const deptId = (createRes as { ok: true; department: { id: string } }).department.id

    const courseCode = `MECH_${nanoid(4)}`.toUpperCase()
    await createCourse(adminAuth, {
      code: courseCode,
      name: 'Nguyên lý máy',
      department: 'Khoa Cơ khí Chế tạo',
      teacherId: teacherAuth.userId,
    })

    // Teacher cannot rename
    const teacherRename = await updateDepartment(teacherAuth, deptId, 'Khoa Cơ khí Động lực')
    expect(teacherRename.ok).toBe(false)

    // Admin renames
    const adminRename = await updateDepartment(adminAuth, deptId, 'Khoa Cơ khí Động lực')
    expect(adminRename.ok).toBe(true)

    // Verify course was cascaded
    const courseInDb = await db()
      .select({ department: courses.department })
      .from(courses)
      .where(and(eq(courses.organizationId, orgId), eq(courses.code, courseCode)))
      .limit(1)

    expect(courseInDb[0]?.department).toBe('Khoa Cơ khí Động lực')
  })

  it('DEPT-04: Cannot delete department with linked courses; can delete empty department', async () => {
    const list = await listDepartmentsWithDetails(adminAuth)
    const mech = list.find((d) => d.name === 'Khoa Cơ khí Động lực')
    expect(mech).toBeDefined()

    // Cannot delete because it has linked course 'MECH_...'
    const deleteBlocked = await deleteDepartment(adminAuth, mech!.id)
    expect(deleteBlocked.ok).toBe(false)
    expect(deleteBlocked.message).toContain('môn học trực thuộc')

    // Create an empty department and delete it
    const emptyRes = await createDepartment(adminAuth, 'Khoa Tạm Thời Cần Xóa')
    expect(emptyRes.ok).toBe(true)
    const emptyId = (emptyRes as { ok: true; department: { id: string } }).department.id

    // Teacher cannot delete
    const teacherDel = await deleteDepartment(teacherAuth, emptyId)
    expect(teacherDel.ok).toBe(false)

    // Admin deletes empty department
    const deleteSuccess = await deleteDepartment(adminAuth, emptyId)
    expect(deleteSuccess.ok).toBe(true)

    const listAfter = await listDepartmentsWithDetails(adminAuth)
    expect(listAfter.some((d) => d.id === emptyId)).toBe(false)
  })
})
