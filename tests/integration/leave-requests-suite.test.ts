import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceRecords,
  attendanceSessions,
  auditLogs,
  courseSections,
  courses,
  leaveRequests,
  notifications,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import { addLeaveRequest, getLeaveRequests, updateLeaveRequestStatus } from '@/lib/attendance/leave'
import { listClassSessions } from '@/lib/attendance/server'
import type { AuthContext } from '@/lib/auth/session'
import type { Course } from '@/lib/types/domain'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function makeAuthContext(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u',
    membershipId: 'm',
    organizationId: 'org',
    role: 'student',
    email: 'u@example.com',
    name: 'User',
    initials: 'U',
    department: null,
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Test Org',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

describe.skipIf(!hasDb)('LEAVE-01, LEAVE-02, LEAVE-03 — End-to-End Leave Request & Course Selection', () => {
  it('verifies student can select courses, submit leave requests (LEAVE-01), teacher can approve (LEAVE-02), and teacher can reject (LEAVE-03)', async () => {
    const orgId = `org_leave_e2e_${nanoid(8)}`
    const teacherId = `usr_t_${nanoid(8)}`
    const studentId = `usr_s_${nanoid(8)}`
    const courseId = `crs_it301_${nanoid(8)}`
    const sectionId = `sec_it301_${nanoid(8)}`
    const sessionId = `ses_it301_${nanoid(8)}`

    const teacherAuth = makeAuthContext({
      userId: teacherId,
      organizationId: orgId,
      role: 'teacher',
      name: 'ThS. Giang Vien UTC',
    })

    const studentAuth = makeAuthContext({
      userId: studentId,
      organizationId: orgId,
      role: 'student',
      name: 'Nguyen Van Sinh Vien UTC',
      studentCode: '20261111',
    })

    try {
      // 1. Setup Organization, Users, and Course with Section
      await db().insert(organizations).values({ id: orgId, name: 'UTC Leave Test Org' })
      await db().insert(users).values([
        { id: teacherId, email: `teacher_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'ThS. Giang Vien UTC', initials: 'GV' },
        { id: studentId, email: `student_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Nguyen Van Sinh Vien UTC', initials: 'SV' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20261111' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT301',
        name: 'Lap trinh Web & Ung dung phan tan',
        department: 'CNTT',
        teacherId,
        enrolled: 1,
        color: 'blue',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.302 - A1',
        dayOfWeek: 2,
        startsAt: '07:30',
        endsAt: '11:30',
      })
      await db().insert(attendanceSessions).values({
        id: sessionId,
        organizationId: orgId,
        sectionId,
        courseId,
        teacherId,
        status: 'active',
      })
      await db().insert(attendanceRecords).values({
        id: `rec_${nanoid(8)}`,
        organizationId: orgId,
        sessionId,
        studentId,
        status: 'absent',
      })

      // 2. Test COURSE-01: Verify student can resolve courses from sessions
      const sessions = await listClassSessions(orgId)
      expect(sessions.length).toBeGreaterThan(0)
      const matchingSection = sessions.find((s) => s.courseId === courseId)
      expect(matchingSection).toBeDefined()
      expect(matchingSection?.courseCode).toBe('IT301')
      expect(matchingSection?.courseName).toBe('Lap trinh Web & Ung dung phan tan')

      // Emulate client-side course derivation from sessions (used when GET /api/courses is 403 for student)
      const derivedCourses: Course[] = Array.from(
        new Map(
          sessions
            .filter((s) => s.courseId && (s.courseName || s.courseCode))
            .map((s) => [
              s.courseId,
              {
                id: s.courseId,
                organizationId: orgId,
                code: s.courseCode ?? s.courseId,
                name: s.courseName ?? s.courseCode ?? 'Course',
                department: '',
                teacherId: '',
                enrolled: s.enrolledCount ?? 0,
                color: 'blue',
              } as Course,
            ])
        ).values()
      )

      expect(derivedCourses.length).toBeGreaterThan(0)
      const selectedCourse = derivedCourses.find((c) => c.id === courseId)
      expect(selectedCourse).toBeDefined()
      expect(selectedCourse?.id).toBe(courseId)
      expect(selectedCourse?.code).toBe('IT301')

      // 3. Test LEAVE-01: Student submits leave request with selected course
      const leave1 = await addLeaveRequest(studentAuth, {
        courseId: selectedCourse!.id,
        sessionId,
        date: '20/10/2026',
        reason: 'Sot sieu vi co giay xac nhan y te',
        evidenceNote: 'Giay kham benh vien GTVT',
      })

      expect(leave1.id).toBeDefined()
      expect(leave1.status).toBe('pending')
      expect(leave1.courseId).toBe(courseId)
      expect(leave1.studentId).toBe(studentId)

      // Student sees their pending leave request
      const studentRequests = await getLeaveRequests(studentAuth)
      expect(studentRequests.some((r) => r.id === leave1.id && r.status === 'pending')).toBe(true)

      // Teacher sees the pending leave request in their review queue
      const teacherRequests = await getLeaveRequests(teacherAuth)
      expect(teacherRequests.some((r) => r.id === leave1.id && r.status === 'pending')).toBe(true)

      // 4. Test LEAVE-02: Teacher approves leave request
      const approved = await updateLeaveRequestStatus(teacherAuth, leave1.id, 'approved')
      expect(approved).not.toBeNull()
      expect(approved?.status).toBe('approved')

      // Verify attendance record was automatically synchronized to 'excused'
      const updatedRecords = await db()
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, sessionId))
      const studentRecord = updatedRecords.find((r) => r.studentId === studentId)
      expect(studentRecord?.status).toBe('excused')

      // Verify student received approval notification
      const studentNotifs = await db()
        .select()
        .from(notifications)
        .where(eq(notifications.userId, studentId))
      expect(studentNotifs.some((n) => n.title.includes('chấp thuận') || n.title.includes('duyệt'))).toBe(true)

      // 5. Test LEAVE-03: Create a second leave request and teacher rejects it
      const leave2 = await addLeaveRequest(studentAuth, {
        courseId: selectedCourse!.id,
        date: '21/10/2026',
        reason: 'Viec gia dinh khong co minh chung',
      })
      expect(leave2.status).toBe('pending')

      const rejected = await updateLeaveRequestStatus(teacherAuth, leave2.id, 'rejected')
      expect(rejected).not.toBeNull()
      expect(rejected?.status).toBe('rejected')

      // Verify rejected status is persisted
      const studentRequestsAfter = await getLeaveRequests(studentAuth)
      const req2 = studentRequestsAfter.find((r) => r.id === leave2.id)
      expect(req2?.status).toBe('rejected')

      // Verify student received rejection notification
      const studentNotifsAfter = await db()
        .select()
        .from(notifications)
        .where(eq(notifications.userId, studentId))
      expect(studentNotifsAfter.some((n) => n.title.includes('từ chối'))).toBe(true)
    } finally {
      // Cleanup
      await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
      await db().delete(notifications).where(eq(notifications.organizationId, orgId))
      await db().delete(leaveRequests).where(eq(leaveRequests.organizationId, orgId))
      await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId))
      await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId))
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
      await db().delete(courses).where(eq(courses.organizationId, orgId))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, studentId))
      await db().delete(users).where(eq(users.id, teacherId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  })
})
