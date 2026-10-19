import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { and, eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendanceRecords,
  attendanceSessions,
  attendanceVerifications,
  auditLogs,
  classEnrollments,
  courseSections,
  courses,
  devices,
  notifications,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import {
  createCourseSection,
  enrollStudentsToSection,
  getOrCreateLiveSession,
  listClassSessions,
  listSectionStudents,
  removeStudentFromSection,
  rotateChallengeForSession,
  searchAvailableStudentsForSection,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import { importStudents, parseStudentCsv } from '@/lib/auth/users'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function makeAuthContext(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u',
    membershipId: 'm',
    organizationId: 'org',
    role: 'teacher',
    email: 'teacher@example.com',
    name: 'Teacher Example',
    initials: 'TE',
    department: 'CNTT',
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Test University',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

describe.skipIf(!hasDb)('ROSTER-01 to ROSTER-06: Section Roster Management & Multi-Class Student Isolation', () => {
  const orgId = `org_roster_${nanoid(8)}`
  const teacherId = `usr_t_${nanoid(8)}`
  const studentAId = `usr_sa_${nanoid(8)}`
  const studentBId = `usr_sb_${nanoid(8)}`
  const course1Id = `crs_c1_${nanoid(8)}`
  const course2Id = `crs_c2_${nanoid(8)}`

  let section1Id: string
  let section2Id: string

  const teacherAuth = makeAuthContext({
    userId: teacherId,
    organizationId: orgId,
    role: 'teacher',
    name: 'GV Nguyen Van Thang',
    email: `teacher_${nanoid(6)}@smartattend.test`,
  })

  const studentAAuth = makeAuthContext({
    userId: studentAId,
    organizationId: orgId,
    role: 'student',
    name: 'Sinh vien A',
    email: `studentA_${nanoid(6)}@smartattend.test`,
    studentCode: '20210001',
  })

  const studentBAuth = makeAuthContext({
    userId: studentBId,
    organizationId: orgId,
    role: 'student',
    name: 'Sinh vien B',
    email: `studentB_${nanoid(6)}@smartattend.test`,
    studentCode: '20210002',
  })

  beforeAll(async () => {
    // 1. Seed organization
    await db().insert(organizations).values({
      id: orgId,
      name: 'Dai hoc Cong Nghe UTC',
      plan: 'Campus Plus',
    })

    // 2. Seed teacher & students
    await db().insert(users).values([
      { id: teacherId, email: teacherAuth.email, name: teacherAuth.name, initials: 'GV', passwordHash: 'hash' },
      { id: studentAId, email: studentAAuth.email, name: studentAAuth.name, initials: 'SA', passwordHash: 'hash' },
      { id: studentBId, email: studentBAuth.email, name: studentBAuth.name, initials: 'SB', passwordHash: 'hash' },
    ])

    await db().insert(organizationMemberships).values([
      { id: `mem_${nanoid(8)}`, organizationId: orgId, userId: teacherId, role: 'teacher' },
      { id: `mem_${nanoid(8)}`, organizationId: orgId, userId: studentAId, role: 'student', studentCode: '20210001' },
      { id: `mem_${nanoid(8)}`, organizationId: orgId, userId: studentBId, role: 'student', studentCode: '20210002' },
    ])

    // 3. Seed 2 courses
    await db().insert(courses).values([
      { id: course1Id, organizationId: orgId, code: 'IT301', name: 'Lap Trinh Web', department: 'CNTT', teacherId, enrolled: 0 },
      { id: course2Id, organizationId: orgId, code: 'IT302', name: 'Co So Du Lieu', department: 'CNTT', teacherId, enrolled: 0 },
    ])
  })

  afterAll(async () => {
    // Cleanup DB records
    await db().delete(attendanceVerifications).where(eq(attendanceVerifications.organizationId, orgId))
    await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId))
    await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId))
    await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId))
    await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
    await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
    await db().delete(courses).where(eq(courses.organizationId, orgId))
    await db().delete(devices).where(eq(devices.organizationId, orgId))
    await db().delete(notifications).where(eq(notifications.organizationId, orgId))
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
    await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
    await db().delete(users).where(eq(users.id, teacherId))
    await db().delete(users).where(eq(users.id, studentAId))
    await db().delete(users).where(eq(users.id, studentBId))
    await db().delete(organizations).where(eq(organizations.id, orgId))
  })

  it('ROSTER-01: Course section creation defaults to 0 enrolled students', async () => {
    const sec1Res = await createCourseSection(teacherAuth, {
      courseId: course1Id,
      room: 'Phong 401-A2',
      startsAt: '07:00',
      endsAt: '09:15',
      dayOfWeek: 2,
    })
    expect(sec1Res.ok).toBe(true)
    section1Id = sec1Res.sectionId!

    const sec2Res = await createCourseSection(teacherAuth, {
      courseId: course2Id,
      room: 'Phong 502-A3',
      startsAt: '09:30',
      endsAt: '11:45',
      dayOfWeek: 3,
    })
    expect(sec2Res.ok).toBe(true)
    section2Id = sec2Res.sectionId!

    // Both sections must start with 0 students
    const roster1 = await listSectionStudents(teacherAuth, section1Id)
    const roster2 = await listSectionStudents(teacherAuth, section2Id)
    expect(roster1).toHaveLength(0)
    expect(roster2).toHaveLength(0)
  })

  it('ROSTER-02: Direct section enrollment by studentCode and studentId isolates rosters', async () => {
    // Enroll Student A into Section 1 using studentCode '20210001'
    const enroll1 = await enrollStudentsToSection(teacherAuth, section1Id, ['20210001'])
    expect(enroll1.ok).toBe(true)
    expect(enroll1.enrolledCount).toBe(1)

    // Enroll Student B into Section 2 using studentId
    const enroll2 = await enrollStudentsToSection(teacherAuth, section2Id, [studentBId])
    expect(enroll2.ok).toBe(true)
    expect(enroll2.enrolledCount).toBe(1)

    // Section 1 roster only contains Student A
    const roster1 = await listSectionStudents(teacherAuth, section1Id)
    expect(roster1).toHaveLength(1)
    expect(roster1[0].studentCode).toBe('20210001')
    expect(roster1[0].id).toBe(studentAId)

    // Section 2 roster only contains Student B
    const roster2 = await listSectionStudents(teacherAuth, section2Id)
    expect(roster2).toHaveLength(1)
    expect(roster2[0].studentCode).toBe('20210002')
    expect(roster2[0].id).toBe(studentBId)

    // Search available students in section 1: Student B is available, Student A is not
    const availableForSec1 = await searchAvailableStudentsForSection(teacherAuth, section1Id, '2021')
    const ids = availableForSec1.map((s) => s.id)
    expect(ids).toContain(studentBId)
    expect(ids).not.toContain(studentAId)
  })

  it('ROSTER-03: Timetable sessions are scoped to enrolled sections for each student', async () => {
    // Student A's timetable should only list Section 1
    const sessionsA = await listClassSessions(orgId, studentAId)
    expect(sessionsA.map((s) => s.sectionId)).toContain(section1Id)
    expect(sessionsA.map((s) => s.sectionId)).not.toContain(section2Id)

    // Student B's timetable should only list Section 2
    const sessionsB = await listClassSessions(orgId, studentBId)
    expect(sessionsB.map((s) => s.sectionId)).toContain(section2Id)
    expect(sessionsB.map((s) => s.sectionId)).not.toContain(section1Id)

    // Teacher/Admin with no studentId sees all sections
    const allSessions = await listClassSessions(orgId)
    const allSecIds = allSessions.map((s) => s.sectionId)
    expect(allSecIds).toContain(section1Id)
    expect(allSecIds).toContain(section2Id)
  })

  it('ROSTER-04: Attendance verification check-in strictly enforces enrollment per section', async () => {
    // Teacher opens attendance session for Section 2
    const sessionId = (await getOrCreateLiveSession(teacherAuth, section2Id))!
    expect(sessionId).toBeTruthy()
    await transitionSessionState(teacherAuth, sessionId, 'live')

    const rotated = await rotateChallengeForSession(teacherAuth, sessionId)
    expect(rotated.ok).toBe(true)
    const challengeCode = rotated.challenge!

    // 1. Student A (enrolled in Section 1 ONLY) attempts to check into Section 2
    const studentARes = await verifyAttendance(studentAAuth, challengeCode, 'Student A Phone')
    expect(studentARes.ok).toBe(false)
    expect(studentARes.message).toBe('You are not enrolled in this class session.')

    // 2. Student B (enrolled in Section 2) checks into Section 2 successfully
    const studentBRes = await verifyAttendance(studentBAuth, challengeCode, 'Student B Laptop')
    expect(studentBRes.ok).toBe(true)
    expect(studentBRes.record?.status).toBe('present')

    // Close session
    await transitionSessionState(teacherAuth, sessionId, 'closed')
  })

  it('ROSTER-05: Removing a student unenrolls them from that section only', async () => {
    // Teacher removes Student A from Section 1
    const removeRes = await removeStudentFromSection(teacherAuth, section1Id, studentAId)
    expect(removeRes.ok).toBe(true)

    // Section 1 now has 0 students
    const roster1 = await listSectionStudents(teacherAuth, section1Id)
    expect(roster1).toHaveLength(0)

    // Student A no longer sees Section 1
    const sessionsA = await listClassSessions(orgId, studentAId)
    expect(sessionsA.map((s) => s.sectionId)).not.toContain(section1Id)

    // Section 2 still has Student B
    const roster2 = await listSectionStudents(teacherAuth, section2Id)
    expect(roster2).toHaveLength(1)
  })

  it('ROSTER-06: Section-scoped CSV import imports and enrolls into specified section only', async () => {
    const csvContent = [
      'studentId,name,department',
      '20210003,Le Van C,CNTT',
      '20210002,Sinh vien B,CNTT', // Already existing student in org
    ].join('\n')

    const rows = parseStudentCsv(csvContent)
    const importRes = await importStudents(teacherAuth, rows, {
      sectionId: section1Id,
    })

    expect(importRes.created).toHaveLength(2)
    const createdCodes = importRes.created.map((c) => c.studentCode)
    expect(createdCodes).toContain('20210003')
    expect(createdCodes).toContain('20210002')

    // Both student 20210003 (new) and 20210002 (existing) should now be enrolled in Section 1
    const roster1 = await listSectionStudents(teacherAuth, section1Id)
    const rosterCodes = roster1.map((s) => s.studentCode)
    expect(rosterCodes).toContain('20210003')
    expect(rosterCodes).toContain('20210002')

    // Section 2 should still ONLY have student 20210002, NOT 20210003
    const roster2 = await listSectionStudents(teacherAuth, section2Id)
    const roster2Codes = roster2.map((s) => s.studentCode)
    expect(roster2Codes).toContain('20210002')
    expect(roster2Codes).not.toContain('20210003')

    // Cleanup student 20210003 user
    const [memC] = await db()
      .select({ userId: organizationMemberships.userId })
      .from(organizationMemberships)
      .where(and(eq(organizationMemberships.organizationId, orgId), eq(organizationMemberships.studentCode, '20210003')))
    if (memC) {
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, memC.userId))
    }
  })
})
