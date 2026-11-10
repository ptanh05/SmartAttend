import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import {
  authSessions,
  classEnrollments,
  courses,
  courseSections,
  externalAccounts,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import { resolveMembershipForLogin, type AuthContext } from '@/lib/auth/session'
import type { Portal } from '@/lib/types/domain'
import { hashPassword, verifyPassword } from '@/lib/auth/password'
import {
  buildLecturerEmail,
  defaultStudentPassword,
  defaultTeacherPassword,
  normalizeEmailDomain,
} from '@/lib/auth/default-credentials'

export { defaultStudentPassword, defaultTeacherPassword } from '@/lib/auth/default-credentials'

function makeInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SV'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

export function studentEmailFromName(name: string, studentCode: string) {
  const givenName = name.trim().split(/\s+/).pop() ?? ''
  const initial = givenName
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/gi, 'd')
    .charAt(0)
    .toLowerCase()
  return `${initial}${studentCode.trim().toLowerCase()}@utc.edu.vn`
}

export async function registerAdministrator(input: {
  name: string
  email: string
  password: string
  organizationName: string
  emailDomain?: string
}) {
  const name = input.name.trim()
  const email = input.email.trim().toLowerCase()
  const organizationName = input.organizationName.trim()
  const password = input.password

  if (!name || !email || !password || !organizationName) {
    return { ok: false as const, message: 'All fields are required.' }
  }
  if (password.length < 8) {
    return { ok: false as const, message: 'Password must be at least 8 characters.' }
  }

  const existing = await db().select({ id: users.id }).from(users).where(eq(users.email, email))
  if (existing.length > 0) {
    return { ok: false as const, message: 'Email is already registered.' }
  }

  const organizationId = `org_${nanoid(10)}`
  const userId = `adm_${nanoid(10)}`
  const passwordHash = await hashPassword(password)

  await db().insert(organizations).values({
    id: organizationId,
    name: organizationName,
    plan: 'Campus Plus',
    emailDomain: normalizeEmailDomain(input.emailDomain),
  })

  await db().insert(users).values({
    id: userId,
    email,
    passwordHash,
    name,
    initials: makeInitials(name),
    mustChangePassword: false,
  })

  const membershipId = nanoid()
  await db().insert(organizationMemberships).values({
    id: membershipId,
    organizationId,
    userId,
    role: 'admin',
    department: null,
    studentCode: null,
    status: 'active',
  })

  return { ok: true as const, userId, membershipId, organizationId }
}

export type ImportStudentRow = { studentCode: string; name: string; department?: string }

export type ImportStudentsResult = {
  created: { studentCode: string; name: string; defaultPassword: string }[]
  skipped: { studentCode: string; reason: string }[]
}

export type ImportStudentsOptions = {
  courseId?: string
  /** Backward-compatible direct section import for existing integrations. */
  sectionId?: string
  autoEnrollSections?: boolean
}

/** A lecturer row as read from an import file. */
export type ImportTeacherRow = { email: string; name: string; department?: string }

export type ImportTeachersResult = {
  created: { email: string; name: string; defaultPassword: string }[]
  skipped: { email: string; reason: string }[]
}

/**
 * Imports lecturers into the organization.
 *
 * Lecturer addresses must end with the institution's email domain (e.g.
 * `@utc.edu.vn`); a row whose address does not match is rejected. Every
 * imported lecturer receives the shared default password and must change it
 * on first sign-in.
 */
export async function importTeachers(
  auth: AuthContext,
  rows: ImportTeacherRow[],
): Promise<ImportTeachersResult> {
  const created: ImportTeachersResult['created'] = []
  const skipped: ImportTeachersResult['skipped'] = []
  const seenEmails = new Set<string>()

  const orgRows = await db()
    .select({ emailDomain: organizations.emailDomain })
    .from(organizations)
    .where(eq(organizations.id, auth.organizationId))

  const domain = normalizeEmailDomain(orgRows[0]?.emailDomain)
  const defaultPassword = defaultTeacherPassword()
  const passwordHash = await hashPassword(defaultPassword)

  // Teacher members already present in the organization, so a re-import skips
  // them instead of creating a duplicate membership.
  const existingTeachers = await db()
    .select({ userId: organizationMemberships.userId })
    .from(organizationMemberships)
    .where(
      and(
        eq(organizationMemberships.organizationId, auth.organizationId),
        eq(organizationMemberships.role, 'teacher'),
      ),
    )
  const teacherMemberIds = new Set(existingTeachers.map((row) => row.userId))

  for (const row of rows) {
    const email = row.email.trim().toLowerCase()
    const name = row.name.trim()
    const department = row.department?.trim() || null

    if (!email || !name) {
      skipped.push({ email: email || '(empty)', reason: 'Thiếu email giảng viên hoặc họ tên.' })
      continue
    }

    if (seenEmails.has(email)) {
      skipped.push({ email, reason: 'Email bị trùng trong danh sách import.' })
      continue
    }
    seenEmails.add(email)

    if (!email.includes('@')) {
      skipped.push({ email, reason: 'Email giảng viên không hợp lệ.' })
      continue
    }

    const localPart = email.split('@')[0]
    const expectedEmail = buildLecturerEmail(localPart, domain)
    if (!expectedEmail || expectedEmail !== email) {
      skipped.push({
        email,
        reason: domain
          ? `Email phải có đuôi @${domain}.`
          : 'Email giảng viên không đúng định dạng.',
      })
      continue
    }

    try {
      const existingUser = await db()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))

      const userId = existingUser[0]?.id

      if (userId && teacherMemberIds.has(userId)) {
        skipped.push({ email, reason: 'Tài khoản giảng viên đã tồn tại trong tổ chức.' })
        continue
      }

      let targetUserId = userId
      if (!targetUserId) {
        targetUserId = `tch_${nanoid(10)}`
        await db().insert(users).values({
          id: targetUserId,
          email,
          passwordHash,
          name,
          initials: makeInitials(name),
          mustChangePassword: true,
        })
      } else {
        await db()
          .update(users)
          .set({ passwordHash, name, mustChangePassword: true })
          .where(eq(users.id, targetUserId))
      }

      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: auth.organizationId,
        userId: targetUserId,
        role: 'teacher',
        department,
        studentCode: null,
        status: 'active',
      })
      teacherMemberIds.add(targetUserId)

      created.push({ email, name, defaultPassword })
    } catch (err) {
      console.error(`Failed to import teacher ${email}`, err)
      skipped.push({ email, reason: err instanceof Error ? err.message : 'Lỗi hệ thống khi tạo tài khoản.' })
    }
  }

  return { created, skipped }
}

/**
 * Parses a lecturer roster file.
 *
 * Expected columns: `email`, `name`, `department`. The email column accepts
 * both the full address and just the local part — a bare local part is
 * completed with the organization's email domain.
 */
export function parseTeacherCsv(
  text: string,
  emailDomain?: string | null,
): ImportTeacherRow[] {
  const cleanText = text.replace(/^\uFEFF/, '').trim()
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  let delimiter = ','
  if (lines[0].includes('\t')) delimiter = '\t'
  else if (lines[0].includes(';')) delimiter = ';'

  const firstCells = splitCsvLine(lines[0], delimiter).map(normalizeHeader)
  const emailKeys = new Set(['email', 'emailgiaovien', 'emailgv', 'mail', 'username', 'ten_dang_nhap', 'tendangnhap', 'user', 'account'])
  const nameKeys = new Set(['name', 'hoten', 'hovaten', 'ten', 'fullname', 'giangvien', 'ten_giang_vien'])
  const departmentKeys = new Set(['department', 'dept', 'khoa', 'bomon', 'khoavien', 'chuyennganh', 'nganh', 'donvi'])

  let startIndex = 0
  let emailIndex = 0
  let nameIndex = 1
  let departmentIndex = 2

  const hasHeader = firstCells.some((cell) => emailKeys.has(cell) || nameKeys.has(cell))
  if (hasHeader) {
    emailIndex = firstCells.findIndex((cell) => emailKeys.has(cell))
    nameIndex = firstCells.findIndex((cell) => nameKeys.has(cell))
    departmentIndex = firstCells.findIndex((cell) => departmentKeys.has(cell))
    startIndex = 1
    if (emailIndex < 0) emailIndex = 0
    if (nameIndex < 0) nameIndex = 1
  }

  const rows: ImportTeacherRow[] = []
  for (const line of lines.slice(startIndex)) {
    const cells = splitCsvLine(line, delimiter)
    const rawEmail = cells[emailIndex] ?? ''
    const name = cells[nameIndex] ?? ''
    const department = departmentIndex >= 0 ? cells[departmentIndex] : undefined
    if (!rawEmail && !name) continue

    const email = rawEmail.includes('@')
      ? rawEmail.trim().toLowerCase()
      : (buildLecturerEmail(rawEmail, emailDomain) ?? rawEmail.trim().toLowerCase())

    rows.push({ email, name, department })
  }

  return rows
}

export async function importStudents(
  auth: AuthContext,
  rows: ImportStudentRow[],
  options?: ImportStudentsOptions,
): Promise<ImportStudentsResult> {
  const created: ImportStudentsResult['created'] = []
  const skipped: ImportStudentsResult['skipped'] = []
  const seenCodes = new Set<string>()

  for (const row of rows) {
    const studentCode = row.studentCode.trim()
    const name = row.name.trim()
    const department = row.department?.trim() || null

    if (!studentCode || !name) {
      skipped.push({ studentCode: studentCode || '(empty)', reason: 'Thiếu mã sinh viên hoặc họ tên.' })
      continue
    }

    if (seenCodes.has(studentCode.toLowerCase())) {
      skipped.push({ studentCode, reason: 'Mã sinh viên bị trùng trong danh sách import.' })
      continue
    }
    seenCodes.add(studentCode.toLowerCase())

    try {
      const existing = await db()
        .select({ id: organizationMemberships.id, userId: organizationMemberships.userId })
        .from(organizationMemberships)
        .where(
          and(
            eq(organizationMemberships.studentCode, studentCode),
          ),
        )

      if (existing.length > 0) {
        if (options?.courseId || options?.sectionId) {
          const sections = options.sectionId
            ? [{ id: options.sectionId }]
            : await db().select({ id: courseSections.id }).from(courseSections).where(and(eq(courseSections.courseId, options.courseId!), eq(courseSections.organizationId, auth.organizationId)))
          for (const section of sections) await db().insert(classEnrollments).values({ sectionId: section.id, studentId: existing[0].userId, organizationId: auth.organizationId, status: 'active' }).onConflictDoNothing()
          created.push({ studentCode, name, defaultPassword: '(Tài khoản đã tồn tại - đã ghi danh)' })
          continue
        } else {
          skipped.push({ studentCode, reason: 'Mã sinh viên đã tồn tại trong hệ thống.' })
          continue
        }
      }

      const email = studentEmailFromName(name, studentCode)
      const defaultPassword = defaultStudentPassword(studentCode)
      const passwordHash = await hashPassword(defaultPassword)

      // Reuse existing user if identical email exists, otherwise insert new user
      const existingUser = await db()
        .select({ id: users.id })
        .from(users)
        .where(eq(users.email, email))

      let userId = existingUser[0]?.id
      if (!userId) {
        userId = `stu_${nanoid(10)}`
        await db().insert(users).values({
          id: userId,
          email,
          passwordHash,
          name,
          initials: makeInitials(name),
          mustChangePassword: true,
        })
      } else {
        await db().update(users).set({
          passwordHash,
          name,
          mustChangePassword: true,
        }).where(eq(users.id, userId))
      }

      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: auth.organizationId,
        userId,
        role: 'student',
        department,
        studentCode,
        status: 'active',
      })

      if (options?.courseId || options?.sectionId) {
        const sections = options.sectionId
          ? [{ id: options.sectionId }]
          : await db().select({ id: courseSections.id }).from(courseSections).where(and(eq(courseSections.courseId, options.courseId!), eq(courseSections.organizationId, auth.organizationId)))
        for (const section of sections) await db().insert(classEnrollments).values({ sectionId: section.id, studentId: userId, organizationId: auth.organizationId, status: 'active' }).onConflictDoNothing()
      } else if (options?.autoEnrollSections !== false) {
        const existingSections = await db()
          .select({ id: courseSections.id })
          .from(courseSections)
          .where(eq(courseSections.organizationId, auth.organizationId))

        for (const sec of existingSections) {
          await db()
            .insert(classEnrollments)
            .values({
              sectionId: sec.id,
              studentId: userId,
              organizationId: auth.organizationId,
              status: 'active',
            })
            .onConflictDoNothing()
        }
      }

      created.push({ studentCode, name, defaultPassword })
    } catch (err) {
      console.error(`Failed to import student ${studentCode}`, err)
      skipped.push({ studentCode, reason: err instanceof Error ? err.message : 'Lỗi hệ thống khi tạo tài khoản.' })
    }
  }

  // Update enrolled count in courses table for all course sections in this organization
  try {
    const orgSections = await db()
      .select({ courseId: courseSections.courseId })
      .from(courseSections)
      .where(eq(courseSections.organizationId, auth.organizationId))

    const courseIds = Array.from(new Set(orgSections.map((s) => s.courseId)))
    for (const cId of courseIds) {
      const countRes = await db()
        .select({ studentId: classEnrollments.studentId })
        .from(classEnrollments)
        .innerJoin(courseSections, eq(classEnrollments.sectionId, courseSections.id))
        .where(and(eq(courseSections.courseId, cId), eq(classEnrollments.status, 'active')))

      const distinctCount = new Set(countRes.map((r) => r.studentId)).size
      await db().update(courses).set({ enrolled: distinctCount }).where(eq(courses.id, cId))
    }
  } catch (err) {
    console.error('Failed to sync course enrolled counts after student import', err)
  }

  return { created, skipped }
}

function normalizeHeader(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
}

function splitCsvLine(line: string, delimiter: string): string[] {
  if (delimiter === '\t') {
    return line.split('\t').map((c) => c.trim().replace(/^"|"$/g, ''))
  }
  const result: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') {
      if (inQuote && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (char === delimiter && !inQuote) {
      result.push(cur.trim().replace(/^"|"$/g, ''))
      cur = ''
    } else {
      cur += char
    }
  }
  result.push(cur.trim().replace(/^"|"$/g, ''))
  return result
}

export function parseStudentCsv(text: string): ImportStudentRow[] {
  const cleanText = text.replace(/^\uFEFF/, '').trim()
  const lines = cleanText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  // Detect delimiter: check \t first (from Excel copy-paste), then ;, fallback to ,
  let delimiter = ','
  if (lines[0].includes('\t')) {
    delimiter = '\t'
  } else if (lines[0].includes(';')) {
    delimiter = ';'
  }

  const rawFirstCells = splitCsvLine(lines[0], delimiter)
  const firstCells = rawFirstCells.map(normalizeHeader)

  const studentCodeKeys = new Set([
    'masinhvien',
    'masv',
    'mssv',
    'masosinhvien',
    'mahocvien',
    'msv',
    'studentid',
    'student_id',
    'studentcode',
    'student',
    'code',
    'id',
  ])
  const nameKeys = new Set([
    'hovaten',
    'hoten',
    'hovatensinhvien',
    'tensinhvien',
    'hotensinhvien',
    'fullname',
    'name',
    'ten',
    'ho',
  ])
  const departmentKeys = new Set([
    'khoavien',
    'khoa',
    'bomon',
    'nganh',
    'chuyennganh',
    'department',
    'dept',
    'lop',
    'malop',
  ])

  let startIndex = 0
  let codeIndex = 0
  let nameIndex = 1
  let departmentIndex = 2

  const hasCodeHeader = firstCells.some((cell) => studentCodeKeys.has(cell))
  const hasNameHeader = firstCells.some((cell) => nameKeys.has(cell))

  if (hasCodeHeader || hasNameHeader) {
    codeIndex = firstCells.findIndex((cell) => studentCodeKeys.has(cell))
    nameIndex = firstCells.findIndex((cell) => nameKeys.has(cell))
    departmentIndex = firstCells.findIndex((cell) => departmentKeys.has(cell))
    startIndex = 1
    if (codeIndex < 0) codeIndex = 0
    if (nameIndex < 0) nameIndex = 1
  }

  const rows: ImportStudentRow[] = []
  for (const line of lines.slice(startIndex)) {
    const cells = splitCsvLine(line, delimiter)
    const studentCode = cells[codeIndex] ?? ''
    const name = cells[nameIndex] ?? ''
    const department = departmentIndex >= 0 ? cells[departmentIndex] : undefined
    if (!studentCode && !name) continue
    rows.push({ studentCode, name, department })
  }

  return rows
}

export async function changeUserPassword(auth: AuthContext, currentPassword: string, newPassword: string) {
  if (!currentPassword || !newPassword) {
    return { ok: false as const, message: 'Current and new password are required.' }
  }
  if (newPassword.length < 8) {
    return { ok: false as const, message: 'New password must be at least 8 characters.' }
  }

  const rows = await db()
    .select({ passwordHash: users.passwordHash })
    .from(users)
    .where(eq(users.id, auth.userId))

  const user = rows[0]
  if (!user || !(await verifyPassword(currentPassword, user.passwordHash))) {
    return { ok: false as const, message: 'Current password is incorrect.' }
  }

  const passwordHash = await hashPassword(newPassword)
  await db()
    .update(users)
    .set({ passwordHash, mustChangePassword: false })
    .where(eq(users.id, auth.userId))

  // Invalidate all active sessions for this user upon password change (forcing re-auth or rotated token)
  await db().delete(authSessions).where(eq(authSessions.userId, auth.userId))

  return { ok: true as const }
}

export async function selfServiceResetPassword(input: {
  identifier: string
  portal: Portal
  /** Legacy combined staff portal (teacher + admin) still accepted for compatibility. */
  legacyStaff?: boolean
  newPassword?: string
}) {
  const identifier = input.identifier.trim()
  if (!identifier) {
    return { ok: false as const, message: 'Vui lòng nhập Mã sinh viên hoặc Email đăng ký.' }
  }

  if (input.portal === 'student') {
    // SEC-02: Chặn hoàn toàn unauthenticated account takeover đối với sinh viên qua MSSV công khai.
    return {
      ok: false as const,
      message:
        'Vì lý do an toàn bảo mật, tính năng tự đặt lại mật khẩu bằng Mã sinh viên công khai đã tạm khóa để ngăn chặn chiếm quyền tài khoản. Vui lòng liên hệ Giảng viên phụ trách hoặc Quản trị viên nhà trường để được hỗ trợ cấp lại mật khẩu.',
    }
  }

  // Lecturer / Admin portals (and the legacy combined staff portal).
  const expectedRole = input.portal === 'admin' ? 'admin' : 'teacher'
  const memberships = await resolveMembershipForLogin(identifier.toLowerCase())
  const match = input.legacyStaff
    ? memberships.find((m) => (m.role === 'teacher' || m.role === 'admin') && !m.disabledAt && m.membershipStatus === 'active')
    : memberships.find((m) => m.role === expectedRole && !m.disabledAt && m.membershipStatus === 'active')

  if (!match) {
    return {
      ok: false as const,
      message:
        expectedRole === 'admin'
          ? 'Không tìm thấy tài khoản Quản trị tương ứng với email đã nhập.'
          : 'Không tìm thấy tài khoản Giảng viên tương ứng với email đã nhập.',
    }
  }

  const external = await db()
    .select({ provider: externalAccounts.provider })
    .from(externalAccounts)
    .where(eq(externalAccounts.userId, match.userId))

  if (external.length > 0) {
    return {
      ok: false as const,
      isOAuth: true,
      message: 'Tài khoản của bạn được liên kết qua Microsoft 365 UTC SSO. Vui lòng bấm "Đăng nhập với Microsoft 365" để truy cập.',
    }
  }

  // Security Hardening: Chặn unauthenticated account takeover cho Lecturer/Admin qua self-service.
  // Tài khoản Giảng viên / Quản trị phải đăng nhập qua Microsoft 365 SSO hoặc liên hệ Quản trị viên hệ thống để cấp lại mật khẩu.
  return {
    ok: false as const,
    message:
      'Vì lý do an toàn bảo mật, tài khoản Giảng viên / Quản trị không thể tự khôi phục công khai. Vui lòng liên hệ Quản trị viên Trường Đại học GTVT (admin@utc.edu.vn) hoặc Trung tâm CNTT để được hỗ trợ cấp lại mật khẩu.',
  }
}

export async function adminResetStudentPassword(auth: AuthContext, studentId: string) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }

  const rows = await db()
    .select({
      membershipId: organizationMemberships.id,
      userId: users.id,
      studentCode: organizationMemberships.studentCode,
      name: users.name,
    })
    .from(organizationMemberships)
    .innerJoin(users, eq(organizationMemberships.userId, users.id))
    .where(
      and(
        eq(organizationMemberships.organizationId, auth.organizationId),
        eq(organizationMemberships.role, 'student'),
        eq(users.id, studentId),
      ),
    )

  const student = rows[0]
  if (!student || !student.studentCode) {
    return { ok: false as const, message: 'Không tìm thấy sinh viên trong tổ chức của bạn.' }
  }

  // SEC-14: Teachers may only reset the password of students enrolled in one of
  // the classes they teach. Administrators may reset any student of the org.
  if (auth.role === 'teacher') {
    const allowed = await db()
      .select({ studentId: classEnrollments.studentId })
      .from(classEnrollments)
      .innerJoin(courseSections, eq(classEnrollments.sectionId, courseSections.id))
      .innerJoin(courses, eq(courseSections.courseId, courses.id))
      .where(
        and(
          eq(classEnrollments.organizationId, auth.organizationId),
          eq(classEnrollments.studentId, student.userId),
          eq(courses.teacherId, auth.userId),
        ),
      )
      .limit(1)

    if (!allowed[0]) {
      return {
        ok: false as const,
        message: 'Bạn chỉ có thể đặt lại mật khẩu cho sinh viên thuộc các lớp mình phụ trách.',
      }
    }
  }

  const defaultPassword = defaultStudentPassword(student.studentCode)
  const passwordHash = await hashPassword(defaultPassword)

  await db()
    .update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, student.userId))

  // Invalidate all active sessions for the student when administrator resets their password
  await db().delete(authSessions).where(eq(authSessions.userId, student.userId))

  return {
    ok: true as const,
    studentCode: student.studentCode,
    name: student.name,
    defaultPassword,
    message: `Đã đặt lại mật khẩu cho sinh viên ${student.name} về mặc định (${defaultPassword}).`,
  }
}
