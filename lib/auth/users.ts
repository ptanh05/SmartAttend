import { and, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { organizationMemberships, organizations, users } from '@/lib/db/schema'
import type { AuthContext } from '@/lib/auth/session'
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

export async function importStudents(auth: AuthContext, rows: ImportStudentRow[]): Promise<ImportStudentsResult> {
  const created: ImportStudentsResult['created'] = []
  const skipped: ImportStudentsResult['skipped'] = []

  for (const row of rows) {
    const studentCode = row.studentCode.trim()
    const name = row.name.trim()
    const department = row.department?.trim() || null

    if (!studentCode || !name) {
      skipped.push({ studentCode: studentCode || '(empty)', reason: 'Missing student ID or name.' })
      continue
    }

    const existing = await db()
      .select({ id: organizationMemberships.id })
      .from(organizationMemberships)
      .where(
        and(
          eq(organizationMemberships.organizationId, auth.organizationId),
          eq(organizationMemberships.studentCode, studentCode),
        ),
      )

    if (existing.length > 0) {
      skipped.push({ studentCode, reason: 'Student ID already exists in this organization.' })
      continue
    }

    const userId = `stu_${nanoid(10)}`
    const email = studentEmail(auth.organizationId, studentCode)
    const defaultPassword = defaultStudentPassword(studentCode)
    const passwordHash = await hashPassword(defaultPassword)

    await db().insert(users).values({
      id: userId,
      email,
      passwordHash,
      name,
      initials: makeInitials(name),
      mustChangePassword: true,
    })

    await db().insert(organizationMemberships).values({
      id: nanoid(),
      organizationId: auth.organizationId,
      userId,
      role: 'student',
      department,
      studentCode,
      status: 'active',
    })

    created.push({ studentCode, name, defaultPassword })
  }

  return { created, skipped }
}

export function parseStudentCsv(text: string): ImportStudentRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)

  if (lines.length === 0) return []

  const delimiter = lines[0].includes(';') ? ';' : ','
  const firstCells = lines[0].split(delimiter).map((cell) => cell.trim().toLowerCase())

  const studentCodeKeys = ['studentid', 'student_id', 'student code', 'studentcode', 'ma_sinh_vien', 'masinhvien', 'mssv']
  const nameKeys = ['name', 'full name', 'fullname', 'ho_ten', 'hoten', 'ten']
  const departmentKeys = ['department', 'dept', 'khoa', 'bo_mon', 'bomon']

  let startIndex = 0
  let codeIndex = 0
  let nameIndex = 1
  let departmentIndex = 2

  if (studentCodeKeys.some((key) => firstCells.includes(key)) || nameKeys.some((key) => firstCells.includes(key))) {
    codeIndex = firstCells.findIndex((cell) => studentCodeKeys.includes(cell))
    nameIndex = firstCells.findIndex((cell) => nameKeys.includes(cell))
    departmentIndex = firstCells.findIndex((cell) => departmentKeys.includes(cell))
    startIndex = 1
    if (codeIndex < 0) codeIndex = 0
    if (nameIndex < 0) nameIndex = 1
  }

  const rows: ImportStudentRow[] = []
  for (const line of lines.slice(startIndex)) {
    const cells = line.split(delimiter).map((cell) => cell.trim().replace(/^"|"$/g, ''))
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

  return { ok: true as const }
}
