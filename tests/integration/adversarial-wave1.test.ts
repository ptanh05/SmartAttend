import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendanceRecords,
  attendanceSessions,
  auditLogs,
  classEnrollments,
  courseSections,
  courses,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import {
  createCourse,
  createCourseSection,
  deleteCourseSection,
  getCourseAttendanceSummary,
  getLiveSessionDetails,
  getOrCreateLiveSession,
  listClassSessions,
  listReportRecords,
  rotateChallengeForSession,
  transitionSessionState,
  updateCourseSection,
} from '@/lib/attendance/server'
import { selfServiceResetPassword } from '@/lib/auth/users'
import { escapeCsvCell } from '@/lib/reports/csv'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function makeAuth(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: `usr_${nanoid(8)}`,
    membershipId: `mem_${nanoid(8)}`,
    organizationId: `org_${nanoid(8)}`,
    role: 'teacher',
    email: 'test@utc.edu.vn',
    name: 'Test User',
    initials: 'TU',
    department: 'CNTT',
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'UTC Test',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

async function cleanOrg(orgId: string, userIds: string[] = []) {
  try {
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId)).catch(() => {})
    await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId)).catch(() => {})
    await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId)).catch(() => {})
    await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId)).catch(() => {})
    await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId)).catch(() => {})
    await db().delete(courseSections).where(eq(courseSections.organizationId, orgId)).catch(() => {})
    await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
    await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
    for (const uid of userIds) {
      await db().delete(auditLogs).where(eq(auditLogs.actorId, uid)).catch(() => {})
      await db().delete(users).where(eq(users.id, uid)).catch(() => {})
    }
    await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
  } catch {
    /* ignore cleanup errors */
  }
}

describe.skipIf(!hasDb)('SMARTATTEND Security Wave 1 — Adversarial & Authorization Tests', () => {
  it('Scenario 1 & 2: Student calling sessions or dashboard does NOT receive active challenge or acousticProof (SEC-01)', async () => {
    const orgId = `org_sec1_${nanoid(6)}`
    const teacherId = `tch_${nanoid(6)}`
    const studentId = `stu_${nanoid(6)}`

    const teacherAuth = makeAuth({ userId: teacherId, organizationId: orgId, role: 'teacher' })
    const studentAuth = makeAuth({ userId: studentId, organizationId: orgId, role: 'student' })

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Security Wave 1 Org', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherId, email: `teacher_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Thầy A', initials: 'TA' },
        { id: studentId, email: `student_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Trò B', initials: 'TB' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: 'SV202601' },
      ])

      const crs = await createCourse(teacherAuth, { code: 'IT101', name: 'Nhập môn Tin học', department: 'CNTT' })
      const sec = await createCourseSection(teacherAuth, {
        courseId: crs.courseId!,
        room: 'P.301',
        startsAt: '08:00',
        endsAt: '10:00',
        initialStudentIds: [studentId],
      })

      // Teacher starts session live and rotates challenge
      const sessId = await getOrCreateLiveSession(teacherAuth, sec.sectionId!)
      await transitionSessionState(teacherAuth, sessId!, 'active')
      const rotated = await rotateChallengeForSession(teacherAuth, sessId!)
      expect(rotated.ok).toBe(true)
      expect(rotated.challenge).toBeTruthy()

      // Teacher calling listClassSessions can see plain challenge
      const teacherSessions = await listClassSessions(orgId)
      const teacherClass = teacherSessions.find((s) => s.id === sessId)
      expect(teacherClass?.challenge).toBe(rotated.challenge)
      // acousticProof is NOT leaked in class sessions list
      expect(teacherClass?.acousticProof).toBeUndefined()

      // Scenario 1: Student calling listClassSessions MUST receive challenge '------' and NO acousticProof
      const studentSessions = await listClassSessions(orgId, studentId)
      const studentClass = studentSessions.find((s) => s.id === sessId)
      expect(studentClass).toBeTruthy()
      expect(studentClass?.challenge).toBe('------')
      expect(studentClass?.acousticProof).toBeUndefined()

      // Scenario 2: Student calling getLiveSessionDetails must return null (students cannot inspect teacher live dashboard)
      const studentLive = await getLiveSessionDetails(studentAuth)
      expect(studentLive).toBeNull()
    } finally {
      await cleanOrg(orgId, [studentId, teacherId])
    }
  })

  it('Scenario 3, 5, 6, 7 & 12: Teacher A cannot inspect, close, or rotate challenge of Teacher B session; concurrent sessions isolated (SEC-05, SEC-07)', async () => {
    const orgId = `org_sec_iso_${nanoid(6)}`
    const teacherAId = `tch_a_${nanoid(6)}`
    const teacherBId = `tch_b_${nanoid(6)}`

    const teacherAuthA = makeAuth({ userId: teacherAId, organizationId: orgId, role: 'teacher' })
    const teacherAuthB = makeAuth({ userId: teacherBId, organizationId: orgId, role: 'teacher' })

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Security Isolation Org', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherAId, email: `teacherA_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Giảng viên A', initials: 'GA' },
        { id: teacherBId, email: `teacherB_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Giảng viên B', initials: 'GB' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherAId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: teacherBId, role: 'teacher' },
      ])

      // Teacher A creates Course A & Section A
      const crsA = await createCourse(teacherAuthA, { code: 'CS101', name: 'Toán rời rạc', department: 'CNTT' })
      const secA = await createCourseSection(teacherAuthA, {
        courseId: crsA.courseId!,
        room: 'P.101',
        startsAt: '07:30',
        endsAt: '09:30',
      })

      // Teacher B creates Course B & Section B
      const crsB = await createCourse(teacherAuthB, { code: 'CS202', name: 'Cấu trúc dữ liệu', department: 'CNTT' })
      const secB = await createCourseSection(teacherAuthB, {
        courseId: crsB.courseId!,
        room: 'P.202',
        startsAt: '07:30',
        endsAt: '09:30',
      })

      // Both teachers start live sessions concurrently
      const sessAId = await getOrCreateLiveSession(teacherAuthA, secA.sectionId!)
      await transitionSessionState(teacherAuthA, sessAId!, 'active')

      const sessBId = await getOrCreateLiveSession(teacherAuthB, secB.sectionId!)
      await transitionSessionState(teacherAuthB, sessBId!, 'active')

      // Scenario 12: Both active concurrently -> each teacher retrieves their own live session
      const liveA = await getLiveSessionDetails(teacherAuthA)
      const liveB = await getLiveSessionDetails(teacherAuthB)
      expect(liveA?.sessionId).toBe(sessAId)
      expect(liveB?.sessionId).toBe(sessBId)

      // Scenario 3: Teacher A querying specificSessionId of Teacher B returns null
      const crossInspect = await getLiveSessionDetails(teacherAuthA, sessBId!)
      expect(crossInspect).toBeNull()

      // Scenario 6: Teacher A attempting to close session of Teacher B is rejected
      const closeAttempt = await transitionSessionState(teacherAuthA, sessBId!, 'closed')
      expect(closeAttempt.ok).toBe(false)
      expect(closeAttempt.message).toContain('Forbidden')

      // Scenario 7: Teacher A attempting to rotate challenge of Teacher B is rejected
      const rotateAttempt = await rotateChallengeForSession(teacherAuthA, sessBId!)
      expect(rotateAttempt.ok).toBe(false)
      expect(rotateAttempt.message).toContain('Forbidden')

      // Verify Session B is still active and untouched
      const sessBCheck = await db().select().from(attendanceSessions).where(eq(attendanceSessions.id, sessBId!))
      expect(sessBCheck[0]?.status).toBe('active')
    } finally {
      await cleanOrg(orgId, [teacherAId, teacherBId])
    }
  })

  it('Scenario 4 & 5: Teacher A cannot update or delete section belonging to Teacher B (SEC-03, SEC-04)', async () => {
    const orgId = `org_sec_sec_${nanoid(6)}`
    const teacherAId = `tch_a_${nanoid(6)}`
    const teacherBId = `tch_b_${nanoid(6)}`

    const teacherAuthA = makeAuth({ userId: teacherAId, organizationId: orgId, role: 'teacher' })
    const teacherAuthB = makeAuth({ userId: teacherBId, organizationId: orgId, role: 'teacher' })

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Section Isolation Org', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherAId, email: `teacherA_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Giảng viên A', initials: 'GA' },
        { id: teacherBId, email: `teacherB_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Giảng viên B', initials: 'GB' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherAId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: teacherBId, role: 'teacher' },
      ])

      const crsB = await createCourse(teacherAuthB, { code: 'PHY101', name: 'Vật lý đại cương', department: 'KHCB' })
      const secB = await createCourseSection(teacherAuthB, {
        courseId: crsB.courseId!,
        room: 'P.402',
        startsAt: '13:00',
        endsAt: '15:00',
      })

      // Scenario 4: Teacher A attempts to update Teacher B's section -> Rejected
      const updateAttempt = await updateCourseSection(teacherAuthA, secB.sectionId!, {
        room: 'Hacked-Room',
        startsAt: '00:00',
      })
      expect(updateAttempt.ok).toBe(false)
      expect(updateAttempt.message).toContain('Forbidden')

      // Verify room was not modified
      const secCheck = await db().select().from(courseSections).where(eq(courseSections.id, secB.sectionId!))
      expect(secCheck[0]?.room).toBe('P.402')

      // Scenario 5: Teacher A attempts to delete Teacher B's section -> Rejected
      const deleteAttempt = await deleteCourseSection(teacherAuthA, secB.sectionId!)
      expect(deleteAttempt.ok).toBe(false)
      expect(deleteAttempt.message).toContain('Forbidden')

      // Verify section still exists
      const secStillExists = await db().select().from(courseSections).where(eq(courseSections.id, secB.sectionId!))
      expect(secStillExists.length).toBe(1)
    } finally {
      await cleanOrg(orgId, [teacherAId, teacherBId])
    }
  })

  it('Scenario 8: Stranger / attacker resetting password using student MSSV is rejected without changing DB (SEC-02)', async () => {
    const orgId = `org_sec_reset_${nanoid(6)}`
    const studentId = `stu_target_${nanoid(6)}`
    const studentMssv = `2112${Math.floor(1000 + Math.random() * 9000)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Reset Guard Org', plan: 'Campus Plus' })
      await db().insert(users).values({
        id: studentId,
        email: `${studentMssv}@student.utc.edu.vn`,
        passwordHash: 'original_secret_hash',
        name: 'Sinh viên Mục tiêu',
        initials: 'SM',
        mustChangePassword: false,
      })
      await db().insert(organizationMemberships).values({
        id: nanoid(),
        organizationId: orgId,
        userId: studentId,
        role: 'student',
        studentCode: studentMssv,
      })

      // Attacker invokes selfServiceResetPassword with the student's MSSV
      const attackRes = await selfServiceResetPassword({
        identifier: studentMssv,
        portal: 'student',
      })

      expect(attackRes.ok).toBe(false)
      expect(attackRes.message).toContain('bảo mật')
      // No temporary password returned
      expect((attackRes as Record<string, unknown>).temporaryPassword).toBeUndefined()

      // Verify DB hash was NOT touched
      const userAfter = await db().select().from(users).where(eq(users.id, studentId))
      expect(userAfter[0]?.passwordHash).toBe('original_secret_hash')
    } finally {
      await cleanOrg(orgId, [studentId])
    }
  })

  it('Scenario 9, 10 & 11: Report access scoping & Admin operational oversight', async () => {
    const orgId = `org_sec_rep_${nanoid(6)}`
    const adminId = `adm_${nanoid(6)}`
    const teacherAId = `tch_a_${nanoid(6)}`
    const teacherBId = `tch_b_${nanoid(6)}`
    const studentId = `stu_${nanoid(6)}`

    const adminAuth = makeAuth({ userId: adminId, organizationId: orgId, role: 'admin' })
    const teacherAuthA = makeAuth({ userId: teacherAId, organizationId: orgId, role: 'teacher' })
    const teacherAuthB = makeAuth({ userId: teacherBId, organizationId: orgId, role: 'teacher' })

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Report Scoping Org', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: adminId, email: `admin_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Quản trị viên', initials: 'QT' },
        { id: teacherAId, email: `teacherA_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Giảng viên A', initials: 'GA' },
        { id: teacherBId, email: `teacherB_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Giảng viên B', initials: 'GB' },
        { id: studentId, email: `student_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Sinh viên Test', initials: 'ST' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: adminId, role: 'admin' },
        { id: nanoid(), organizationId: orgId, userId: teacherAId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: teacherBId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '202611' },
      ])

      const crsA = await createCourse(teacherAuthA, { code: 'A101', name: 'Môn học A', department: 'CNTT' })
      const secA = await createCourseSection(teacherAuthA, { courseId: crsA.courseId!, room: 'P.1', startsAt: '08:00', endsAt: '10:00', initialStudentIds: [studentId] })

      const crsB = await createCourse(teacherAuthB, { code: 'B202', name: 'Môn học B', department: 'CNTT' })
      const secB = await createCourseSection(teacherAuthB, { courseId: crsB.courseId!, room: 'P.2', startsAt: '10:00', endsAt: '12:00', initialStudentIds: [studentId] })

      // Create attendance sessions & records for both
      const sessA = await getOrCreateLiveSession(teacherAuthA, secA.sectionId!)
      const sessB = await getOrCreateLiveSession(teacherAuthB, secB.sectionId!)

      await db().insert(attendanceRecords).values([
        { id: nanoid(), organizationId: orgId, sessionId: sessA!, studentId, status: 'present', verificationScore: 100 },
        { id: nanoid(), organizationId: orgId, sessionId: sessB!, studentId, status: 'late', verificationScore: 80 },
      ])

      // Scenario 9: Teacher A viewing own course report records -> Sees only Course A records
      const recordsA = await listReportRecords(teacherAuthA)
      expect(recordsA.length).toBe(1)
      expect(recordsA[0].courseCode).toBe('A101')

      // Scenario 10: Teacher A requesting summary for Course B -> Rejected with Forbidden
      await expect(getCourseAttendanceSummary(teacherAuthA, crsB.courseId!)).rejects.toThrow('Forbidden')

      // Scenario 11: Admin can access reports across entire organization
      const adminRecords = await listReportRecords(adminAuth)
      expect(adminRecords.length).toBe(2)

      const adminSummaryB = await getCourseAttendanceSummary(adminAuth, crsB.courseId!)
      expect(adminSummaryB.course.code).toBe('B202')

      // Admin can also manage/delete section across organization
      const adminUpdate = await updateCourseSection(adminAuth, secB.sectionId!, { room: 'P.Admin' })
      expect(adminUpdate.ok).toBe(true)

      const adminDelete = await deleteCourseSection(adminAuth, secA.sectionId!)
      expect(adminDelete.ok).toBe(true)
    } finally {
      await cleanOrg(orgId, [studentId, teacherAId, teacherBId, adminId])
    }
  })

  it('CSV Formula Injection Mitigation: Prepend single quote for cells starting with formula triggers', () => {
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('+cmd|/C calc')).toBe("'+cmd|/C calc")
    expect(escapeCsvCell('-SUM(A1:A10)')).toBe("'-SUM(A1:A10)")
    expect(escapeCsvCell('@HYPERLINK("http://attacker.com")')).toBe('"\'@HYPERLINK(""http://attacker.com"")"')
    expect(escapeCsvCell('\tmalicious_tab')).toBe("'\tmalicious_tab")
    expect(escapeCsvCell('\rmalicious_cr')).toBe('"\'\rmalicious_cr"')
    expect(escapeCsvCell('   =cmd|/C calc')).toBe("'   =cmd|/C calc")
    expect(escapeCsvCell(' \t-SUM(1,2)')).toBe('"\' \t-SUM(1,2)"')
    // Safe text remains unchanged
    expect(escapeCsvCell('Nguyễn Văn An')).toBe('Nguyễn Văn An')
    expect(escapeCsvCell('IT001')).toBe('IT001')
  })
})
