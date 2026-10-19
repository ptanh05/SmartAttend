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
import { resolveMembershipForLogin, resolveMembershipForStudentLogin, type AuthContext } from '@/lib/auth/session'
import type { Role } from '@/lib/types/domain'
import { hashPassword, verifyPassword } from '@/lib/auth/password'

export function defaultStudentPassword(studentCode: string) {
  return `Sv@${studentCode.trim()}`
}

function makeInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return 'SV'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return `${parts[0][0] ?? ''}${parts[parts.length - 1][0] ?? ''}`.toUpperCase()
}

function studentEmail(organizationId: string, studentCode: string) {
  return `${organizationId}_${studentCode.trim().toLowerCase()}@student.local`
}

export async function registerTeacher(input: {
  name: string
  email: string
  password: string
  organizationName: string
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
  const userId = `tch_${nanoid(10)}`
  const passwordHash = await hashPassword(password)

  await db().insert(organizations).values({
    id: organizationId,
    name: organizationName,
    plan: 'Campus Plus',
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
    role: 'teacher',
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
  sectionId?: string
  autoEnrollSections?: boolean
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
            eq(organizationMemberships.organizationId, auth.organizationId),
            eq(organizationMemberships.studentCode, studentCode),
          ),
        )

      if (existing.length > 0) {
        if (options?.sectionId) {
          await db()
            .insert(classEnrollments)
            .values({
              sectionId: options.sectionId,
              studentId: existing[0].userId,
              organizationId: auth.organizationId,
              status: 'active',
            })
            .onConflictDoNothing()
          created.push({ studentCode, name, defaultPassword: '(Tài khoản đã tồn tại - đã ghi danh)' })
          continue
        } else {
          skipped.push({ studentCode, reason: 'Mã sinh viên đã tồn tại trong tổ chức.' })
          continue
        }
      }

      const email = studentEmail(auth.organizationId, studentCode)
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

      if (options?.sectionId) {
        await db()
          .insert(classEnrollments)
          .values({
            sectionId: options.sectionId,
            studentId: userId,
            organizationId: auth.organizationId,
            status: 'active',
          })
          .onConflictDoNothing()
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
  portal: 'student' | 'staff'
  newPassword?: string
}) {
  const identifier = input.identifier.trim()
  if (!identifier) {
    return { ok: false as const, message: 'Vui lòng nhập Mã sinh viên hoặc Email đăng ký.' }
  }

  if (input.portal === 'student') {
    const isEmail = identifier.includes('@')
    const memberships = isEmail
      ? await resolveMembershipForLogin(identifier)
      : await resolveMembershipForStudentLogin(identifier)

    const match = memberships.find((m) => m.role === 'student' && !m.disabledAt && m.membershipStatus === 'active')
    if (!match) {
      return { ok: false as const, message: 'Không tìm thấy thông tin sinh viên tương ứng với mã/email đã nhập.' }
    }

    const studentInfo = await db()
      .select({ studentCode: organizationMemberships.studentCode, name: users.name })
      .from(organizationMemberships)
      .innerJoin(users, eq(organizationMemberships.userId, users.id))
      .where(eq(organizationMemberships.id, match.membershipId))

    const studentCode = studentInfo[0]?.studentCode || identifier
    const defaultPassword = defaultStudentPassword(studentCode)
    const passwordHash = await hashPassword(defaultPassword)

    await db()
      .update(users)
      .set({ passwordHash, mustChangePassword: true })
      .where(eq(users.id, match.userId))

    // Invalidate all active sessions on password recovery to kick out unauthorized sessions
    await db().delete(authSessions).where(eq(authSessions.userId, match.userId))

    return {
      ok: true as const,
      role: 'student' as const,
      studentCode,
      name: studentInfo[0]?.name ?? '',
      temporaryPassword: defaultPassword,
      message: `Mật khẩu đã được khôi phục về mặc định: ${defaultPassword}. Vui lòng đăng nhập và đổi mật khẩu mới.`,
    }
  }

  // Staff portal
  const memberships = await resolveMembershipForLogin(identifier.toLowerCase())
  const match = memberships.find((m) => (m.role === 'teacher' || m.role === 'admin') && !m.disabledAt && m.membershipStatus === 'active')

  if (!match) {
    return { ok: false as const, message: 'Không tìm thấy tài khoản Cán bộ / Giảng viên tương ứng với email đã nhập.' }
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

  let newPass = input.newPassword?.trim()
  if (!newPass) {
    newPass = `Utc@${Math.floor(100000 + Math.random() * 900000)}`
  } else if (newPass.length < 8) {
    return { ok: false as const, message: 'Mật khẩu mới phải có ít nhất 8 ký tự.' }
  }

  const passwordHash = await hashPassword(newPass)
  await db()
    .update(users)
    .set({ passwordHash, mustChangePassword: true })
    .where(eq(users.id, match.userId))

  // Invalidate all active sessions on staff password recovery
  await db().delete(authSessions).where(eq(authSessions.userId, match.userId))

  return {
    ok: true as const,
    role: match.role as Role,
    temporaryPassword: newPass,
    message: `Đã khôi phục mật khẩu thành công! Mật khẩu tạm thời: ${newPass}. Vui lòng đăng nhập và đổi mật khẩu.`,
  }
}

export async function adminResetStudentPassword(auth: AuthContext, studentId: string) {
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
