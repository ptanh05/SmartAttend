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
import { addLeaveRequest, getLeaveRequests, updateLeaveRequestStatus } from './leave'
import type { AuthContext } from '@/lib/auth/session'

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
    organizationPlan: 'Free',
    ...overrides,
  }
}

describe.skipIf(!hasDb)('Leave Requests Workflow (PostgreSQL DB)', () => {
  it('allows a student to submit a request, teachers to review, and auto-syncs to excused attendance records', async () => {
    const orgId = `org_leave_${nanoid(8)}`
    const teacherId = `usr_t_${nanoid(8)}`
    const studentId = `usr_s_${nanoid(8)}`
    const courseId = `crs_${nanoid(8)}`
    const sectionId = `sec_${nanoid(8)}`
    const sessionId = `ses_${nanoid(8)}`

    const teacherAuth = makeAuthContext({
      userId: teacherId,
      organizationId: orgId,
      role: 'teacher',
      name: 'ThS. Giang Vien',
    })

    const studentAuth = makeAuthContext({
      userId: studentId,
      organizationId: orgId,
      role: 'student',
      name: 'Nguyen Van Sinh Vien',
      studentCode: '20269999',
    })

    try {
      // 1. Fixtures
      await db().insert(organizations).values({ id: orgId, name: 'Leave Test Org' })
      await db().insert(users).values([
        { id: teacherId, email: `teacher_${orgId}@example.com`, passwordHash: 'hash', name: 'ThS. Giang Vien', initials: 'GV' },
        { id: studentId, email: `student_${orgId}@example.com`, passwordHash: 'hash', name: 'Nguyen Van Sinh Vien', initials: 'SV' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20269999' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT999',
        name: 'Distributed Systems',
        department: 'IT',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.301',
        dayOfWeek: 2,
        startsAt: '08:00',
        endsAt: '10:00',
      })
      await db().insert(attendanceSessions).values({
        id: sessionId,
        organizationId: orgId,
        sectionId,
        courseId,
        teacherId,
        status: 'active',
      })

      // 2. Student submits leave request
      const newReq = await addLeaveRequest(studentAuth, {
        courseId,
        date: '25/08/2026',
        reason: 'Tham gia hoi thao khoa hoc',
        evidenceNote: 'Giay moi so 123/DHGTVT',
      })

      expect(newReq.id).toBeDefined()
      expect(newReq.status).toBe('pending')
      expect(newReq.studentId).toBe(studentId)
      expect(newReq.courseName).toContain('IT999')

      // 3. Student views own list
      const studentList = await getLeaveRequests(studentAuth)
      expect(studentList.length).toBe(1)
      expect(studentList[0].id).toBe(newReq.id)

      // 4. Teacher views all organization requests
      const teacherList = await getLeaveRequests(teacherAuth)
      expect(teacherList.length).toBe(1)
      expect(teacherList[0].id).toBe(newReq.id)

      // 5. Teacher approves leave request -> must auto-sync to excused attendance record
      const approved = await updateLeaveRequestStatus(teacherAuth, newReq.id, 'approved')
      expect(approved?.status).toBe('approved')
      expect(approved?.reviewedBy).toBe(teacherAuth.name)
      expect(approved?.reviewedAt).toBeDefined()

      // 6. Verify attendance record auto-synchronized with 'excused' status and 100 verification score
      const records = await db()
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.studentId, studentId))
      expect(records.length).toBe(1)
      expect(records[0].status).toBe('excused')
      expect(records[0].verificationScore).toBe(100)
      expect(records[0].sessionId).toBe(sessionId)

      // 7. Verify student received notification
      const notifs = await db()
        .select()
        .from(notifications)
        .where(eq(notifications.userId, studentId))
      expect(notifs.length).toBeGreaterThan(0)
      expect(notifs[0].title).toContain('duyệt')

      // 8. Teacher rejects another request
      const rejected = await updateLeaveRequestStatus(teacherAuth, newReq.id, 'rejected')
      expect(rejected?.status).toBe('rejected')
    } finally {
      await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId))
      await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId))
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
      await db().delete(notifications).where(eq(notifications.organizationId, orgId))
      await db().delete(leaveRequests).where(eq(leaveRequests.organizationId, orgId))
      await db().delete(courses).where(eq(courses.organizationId, orgId))
      await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
      await db().delete(users).where(eq(users.id, teacherId))
      await db().delete(users).where(eq(users.id, studentId))
      await db().delete(organizations).where(eq(organizations.id, orgId))
    }
  }, 30_000)
})

