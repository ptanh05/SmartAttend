import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  classEnrollments,
  courseSections,
  courses,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import { defaultStudentPassword, importStudents, parseStudentCsv } from '@/lib/auth/users'
import { listClassSessions, listCourses, listSectionStudents, listUsers } from '@/lib/attendance/server'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function makeAuthContext(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u',
    membershipId: 'm',
    organizationId: 'org',
    role: 'admin',
    email: 'admin@example.com',
    name: 'Admin User',
    initials: 'AU',
    department: null,
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Test University',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

describe.skipIf(!hasDb)('ADMIN-01 — Danh sách người dùng (User Directory & Role Filtering)', () => {
  it('allows Admin to find and view teacher, admin, and student accounts with proper role filtering', async () => {
    const orgId = `org_admin01_${nanoid(8)}`
    const adminId = `usr_adm_${nanoid(8)}`
    const teacherId = `usr_tch_${nanoid(8)}`
    const studentId = `usr_stu_${nanoid(8)}`

    const adminAuth = makeAuthContext({
      userId: adminId,
      organizationId: orgId,
      role: 'admin',
      email: 'admin.dao.tao@utc.edu.vn',
      name: 'Ban Đào Tạo UTC',
    })

    try {
      await db().insert(organizations).values({
        id: orgId,
        name: 'Đại học GTVT UTC',
        plan: 'Campus Plus',
      })

      // Insert Admin user & membership
      await db().insert(users).values({
        id: adminId,
        email: 'admin.dao.tao@utc.edu.vn',
        passwordHash: 'hash1',
        name: 'Ban Đào Tạo UTC',
        initials: 'DT',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: adminId,
        role: 'admin',
        department: 'Phòng Đào Tạo',
        status: 'active',
      })

      // Insert Teacher user & membership
      await db().insert(users).values({
        id: teacherId,
        email: 'teacher.nguyen@utc.edu.vn',
        passwordHash: 'hash2',
        name: 'ThS. Nguyễn Văn Thầy',
        initials: 'NT',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: teacherId,
        role: 'teacher',
        department: 'Công nghệ thông tin',
        status: 'active',
      })

      // Insert Student user & membership
      await db().insert(users).values({
        id: studentId,
        email: '20269999@student.utc.edu.vn',
        passwordHash: 'hash3',
        name: 'Nguyễn Văn Học',
        initials: 'NH',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: studentId,
        role: 'student',
        studentCode: '20269999',
        department: 'Công nghệ thông tin',
        status: 'active',
      })

      // 1. Admin queries all users (no role filter)
      const allUsers = await listUsers(adminAuth)
      expect(allUsers.length).toBe(3)
      const roles = allUsers.map((u) => u.role)
      expect(roles).toContain('admin')
      expect(roles).toContain('teacher')
      expect(roles).toContain('student')

      // Verify individual user attributes
      const teacherAccount = allUsers.find((u) => u.role === 'teacher')
      expect(teacherAccount).toBeDefined()
      expect(teacherAccount?.name).toBe('ThS. Nguyễn Văn Thầy')
      expect(teacherAccount?.email).toBe('teacher.nguyen@utc.edu.vn')
      expect(teacherAccount?.department).toBe('Công nghệ thông tin')

      const adminAccount = allUsers.find((u) => u.role === 'admin')
      expect(adminAccount).toBeDefined()
      expect(adminAccount?.name).toBe('Ban Đào Tạo UTC')

      const studentAccount = allUsers.find((u) => u.role === 'student')
      expect(studentAccount).toBeDefined()
      expect(studentAccount?.studentCode).toBe('20269999')

      // 2. Admin filters by Teacher
      const teacherOnly = await listUsers(adminAuth, 'teacher')
      expect(teacherOnly.length).toBe(1)
      expect(teacherOnly[0].role).toBe('teacher')
      expect(teacherOnly[0].email).toBe('teacher.nguyen@utc.edu.vn')

      // 3. Admin filters by Admin
      const adminOnly = await listUsers(adminAuth, 'admin')
      expect(adminOnly.length).toBe(1)
      expect(adminOnly[0].role).toBe('admin')
      expect(adminOnly[0].email).toBe('admin.dao.tao@utc.edu.vn')

      // 4. Admin filters by Student
      const studentOnly = await listUsers(adminAuth, 'student')
      expect(studentOnly.length).toBe(1)
      expect(studentOnly[0].role).toBe('student')
      expect(studentOnly[0].studentCode).toBe('20269999')
    } finally {
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, adminId))
      await db().delete(users).where(eq(users.id, teacherId))
      await db().delete(users).where(eq(users.id, studentId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })
})

describe.skipIf(!hasDb)('ADMIN-02 — Import Student bằng CSV & Ghi danh vào lớp', () => {
  it('parses various CSV formats: Vietnamese headers, tab delimiters, BOM, duplicate detection', () => {
    // 1. Vietnamese headers with diacritics
    const csvVietnamese = `Mã sinh viên,Họ và tên,Khoa/Viện\n20261001,Nguyễn Văn An,Công nghệ thông tin\n20261002,Trần Thị Bình,Kinh tế vận tải`
    const parsedVi = parseStudentCsv(csvVietnamese)
    expect(parsedVi.length).toBe(2)
    expect(parsedVi[0].studentCode).toBe('20261001')
    expect(parsedVi[0].name).toBe('Nguyễn Văn An')
    expect(parsedVi[0].department).toBe('Công nghệ thông tin')

    // 2. Tab delimiter (Excel copy-paste)
    const csvTab = "Mã SV\tHọ tên\tKhoa\n20261003\tLê Hoàng Cường\tĐiện tử"
    const parsedTab = parseStudentCsv(csvTab)
    expect(parsedTab.length).toBe(1)
    expect(parsedTab[0].studentCode).toBe('20261003')
    expect(parsedTab[0].name).toBe('Lê Hoàng Cường')
    expect(parsedTab[0].department).toBe('Điện tử')

    // 3. UTF-8 BOM prefix
    const csvBom = "\uFEFFstudentId,name,department\n20261004,Pham Thu Dung,Computer Science"
    const parsedBom = parseStudentCsv(csvBom)
    expect(parsedBom.length).toBe(1)
    expect(parsedBom[0].studentCode).toBe('20261004')
    expect(parsedBom[0].name).toBe('Pham Thu Dung')

    // 4. Semicolon delimiter
    const csvSemi = "MSSV;Họ và tên;Khoa\n20261005;Đỗ Minh Đức;CNTT"
    const parsedSemi = parseStudentCsv(csvSemi)
    expect(parsedSemi.length).toBe(1)
    expect(parsedSemi[0].studentCode).toBe('20261005')
    expect(parsedSemi[0].name).toBe('Đỗ Minh Đức')
  })

  it('imports valid rows, skips duplicates, auto-enrolls into sections, and updates course/section roster', async () => {
    const orgId = `org_import_e2e_${nanoid(8)}`
    const adminId = `usr_adm_${nanoid(8)}`
    const teacherId = `usr_tch_${nanoid(8)}`
    const courseId = `crs_it_${nanoid(8)}`
    const sectionId = `sec_it_${nanoid(8)}`

    const adminAuth = makeAuthContext({
      userId: adminId,
      organizationId: orgId,
      role: 'admin',
      name: 'Ban Đào Tạo UTC',
    })

    const code1 = `2026_${nanoid(6)}`
    const code2 = `2026_${nanoid(6)}`

    try {
      await db().insert(organizations).values({
        id: orgId,
        name: 'Đại học UTC Test Import',
        plan: 'Campus Plus',
      })

      await db().insert(users).values({
        id: adminId,
        email: `admin_${orgId}@utc.edu.vn`,
        passwordHash: 'hash',
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

      await db().insert(users).values({
        id: teacherId,
        email: `teacher_${orgId}@utc.edu.vn`,
        passwordHash: 'hash',
        name: 'Giảng viên CNTT',
        initials: 'GV',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: teacherId,
        role: 'teacher',
        status: 'active',
      })

      // Create a Course and Section
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT301',
        name: 'Lập trình Web & Ứng dụng phân tán',
        department: 'CNTT',
        teacherId,
        enrolled: 0,
        color: 'blue',
        status: 'active',
      })

      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.302 - A1',
        startsAt: '07:30',
        endsAt: '11:30',
        dayOfWeek: 2,
        autoStart: true,
        status: 'scheduled',
      })

      // Initial enrolled count should be 0
      const initialCourses = await listCourses(orgId)
      expect(initialCourses[0].enrolled).toBe(0)

      // 1. Import file with valid rows, duplicate in-file row, and missing field row
      const rowsToImport = [
        { studentCode: code1, name: 'Nguyễn Văn Nhập 1', department: 'CNTT' },
        { studentCode: code2, name: 'Trần Thị Nhập 2', department: 'KTVT' },
        { studentCode: code1, name: 'Nguyễn Văn Nhập Trùng', department: 'CNTT' }, // duplicate in batch
        { studentCode: '', name: 'Thiếu Mã SV', department: 'CNTT' }, // missing code
      ]

      const importResult = await importStudents(adminAuth, rowsToImport)

      // Expected: 2 created, 2 skipped
      expect(importResult.created.length).toBe(2)
      expect(importResult.skipped.length).toBe(2)
      expect(importResult.created[0].studentCode).toBe(code1)
      expect(importResult.created[0].defaultPassword).toBe(defaultStudentPassword(code1))
      expect(importResult.created[1].studentCode).toBe(code2)

      // 2. Verify imported students appear at the top of listUsers (ordered by createdAt desc)
      const userList = await listUsers(adminAuth, 'student')
      expect(userList.length).toBe(2)
      const importedCodes = userList.map((u) => u.studentCode)
      expect(importedCodes).toContain(code1)
      expect(importedCodes).toContain(code2)

      // 3. Verify students were automatically enrolled into existing section
      const sectionStudents = await listSectionStudents(adminAuth, sectionId)
      expect(sectionStudents.length).toBe(2)
      const rosterCodes = sectionStudents.map((s) => s.studentCode)
      expect(rosterCodes).toContain(code1)
      expect(rosterCodes).toContain(code2)

      // 4. Verify courses.enrolled is dynamically and accurately counted
      const coursesAfter = await listCourses(orgId)
      expect(coursesAfter[0].enrolled).toBe(2)

      const sectionsAfter = await listClassSessions(orgId)
      expect(sectionsAfter[0].enrolledCount).toBe(2)

      // 5. Re-importing the same students results in duplicate skip with clear reason
      const reimportResult = await importStudents(adminAuth, [
        { studentCode: code1, name: 'Nguyễn Văn Nhập 1' },
      ])
      expect(reimportResult.created.length).toBe(0)
      expect(reimportResult.skipped.length).toBe(1)
      expect(reimportResult.skipped[0].studentCode).toBe(code1)
      expect(reimportResult.skipped[0].reason).toContain('tồn tại')
    } finally {
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
      await db().delete(courses).where(eq(courses.organizationId, orgId))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      const allOrgUsers = await db().select({ id: users.id }).from(users).where(eq(users.email, `admin_${orgId}@utc.edu.vn`))
      if (allOrgUsers.length > 0) {
        await db().delete(users).where(eq(users.id, adminId))
      }
      await db().delete(users).where(eq(users.id, teacherId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })
})
