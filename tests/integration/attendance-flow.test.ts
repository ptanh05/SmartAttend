import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendancePolicies,
  attendanceRecords,
  attendanceSessions,
  attendanceVerifications,
  auditLogs,
  authSessions,
  classEnrollments,
  courseSections,
  courses,
  devices,
  notifications,
  organizationMemberships,
  organizations,
  suspiciousAttempts,
  users,
} from '@/lib/db/schema'
import {
  createCourse,
  createCourseSection,
  deleteCourseSection,
  getOrCreateLiveSession,
  listClassSessions,
  rotateChallengeForSession,
  transitionSessionState,
  updateCourseSection,
  verifyAttendance,
} from '@/lib/attendance/server'
import type { AuthContext } from '@/lib/auth/session'
import { hashPassword } from '@/lib/auth/password'

// Load real credentials from .env (safe no-op when absent).
config({ path: '.env' })

const hasDb = Boolean(process.env.DATABASE_URL)

function authContext(overrides: Partial<AuthContext>): AuthContext {
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

describe.skipIf(!hasDb)('attendance flow (integration, real DB)', () => {
  it(
    'creates a session, rotates a challenge and verifies a student against real tables',
    async () => {
      const orgId = nanoid()
      const teacherId = nanoid()
      const studentId = nanoid()
      const teacherMembershipId = nanoid()
      const studentMembershipId = nanoid()
      const courseId = nanoid()
      const sectionId = nanoid()

      const student2Id = nanoid()
      const student2MembershipId = nanoid()

      const passwordHash = await hashPassword('integration-password')

      try {
        // --- Fixtures ---
        await db().insert(organizations).values({ id: orgId, name: 'Integration Org' })
        await db().insert(users).values([
          { id: teacherId, email: `teacher-${orgId}@example.com`, passwordHash, name: 'Teacher', initials: 'T' },
          { id: studentId, email: `student-${orgId}@example.com`, passwordHash, name: 'Student', initials: 'S' },
          { id: student2Id, email: `student2-${orgId}@example.com`, passwordHash, name: 'Student Two', initials: 'S2' },
        ])
        await db().insert(organizationMemberships).values([
          { id: teacherMembershipId, organizationId: orgId, userId: teacherId, role: 'teacher' },
          { id: studentMembershipId, organizationId: orgId, userId: studentId, role: 'student', studentCode: `SV1-${orgId}` },
          { id: student2MembershipId, organizationId: orgId, userId: student2Id, role: 'student', studentCode: `SV2-${orgId}` },
        ])
        await db().insert(courses).values({
          id: courseId,
          organizationId: orgId,
          code: 'CS101',
          name: 'Intro',
          department: 'CS',
          teacherId,
        })
        await db().insert(courseSections).values({
          id: sectionId,
          organizationId: orgId,
          courseId,
          room: 'A101',
          startsAt: '08:00',
          endsAt: '09:30',
          dayOfWeek: 1,
          autoStart: true,
        })
        await db().insert(classEnrollments).values([
          { sectionId, studentId, organizationId: orgId },
          { sectionId, studentId: student2Id, organizationId: orgId },
        ])

        const teacherAuth = authContext({
          userId: teacherId,
          membershipId: teacherMembershipId,
          organizationId: orgId,
          role: 'teacher',
          name: 'Teacher',
        })
        const studentAuth = authContext({
          userId: studentId,
          membershipId: studentMembershipId,
          organizationId: orgId,
          role: 'student',
          name: 'Student',
          studentCode: `SV1-${orgId}`,
        })
        const student2Auth = authContext({
          userId: student2Id,
          membershipId: student2MembershipId,
          organizationId: orgId,
          role: 'student',
          name: 'Student Two',
          studentCode: `SV2-${orgId}`,
        })

        // --- Start the live session ---
        const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
        expect(sessionId).toBeTruthy()

        const started = await transitionSessionState(teacherAuth, sessionId!, 'active')
        expect(started.ok).toBe(true)

        const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
        expect(rotated.ok).toBe(true)

        // --- Student 1 verifies with the issued challenge via standard method ---
        const challengeCode = (rotated as { challenge: string }).challenge
        const result = await verifyAttendance(studentAuth, challengeCode, 'integration-test-device-1')
        expect(result.ok).toBe(true)
        expect(result.record?.status).toBe('present')
        expect(result.record?.confidence).toBe(78)

        // --- Student 2 verifies with Dual-Factor Ultrasonic + Face ID (100% confidence) ---
        const result2 = await verifyAttendance(student2Auth, challengeCode, 'integration-test-device-2', {
          method: 'ultrasonic_faceid',
          ultrasonicVerified: true,
          biometricVerified: true,
        })
        expect(result2.ok).toBe(true)
        expect(result2.record?.status).toBe('present')
        expect(result2.record?.confidence).toBe(100)

        // --- Confirm the records and devices were persisted ---
        const recordRows = await db()
          .select()
          .from(attendanceRecords)
          .where(eq(attendanceRecords.sessionId, sessionId!))
        expect(recordRows).toHaveLength(2)

        const record1 = recordRows.find((row) => row.studentId === studentId)
        expect(record1).toBeTruthy()
        expect(record1?.status).toBe('present')

        const record2 = recordRows.find((row) => row.studentId === student2Id)
        expect(record2).toBeTruthy()
        expect(record2?.status).toBe('present')
      } finally {
        // --- Cleanup (FK-safe reverse order), scoped to this org/users ---
        await db().delete(attendanceVerifications).where(eq(attendanceVerifications.organizationId, orgId))
        await db().delete(notifications).where(eq(notifications.organizationId, orgId))
        await db().delete(suspiciousAttempts).where(eq(suspiciousAttempts.organizationId, orgId))
        await db().delete(devices).where(eq(devices.organizationId, orgId))
        await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
        await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId))
        await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId))
        await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId))
        await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
        await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
        await db().delete(courses).where(eq(courses.organizationId, orgId))
        await db().delete(attendancePolicies).where(eq(attendancePolicies.organizationId, orgId))
        await db().delete(authSessions).where(inArray(authSessions.userId, [teacherId, studentId, student2Id]))
        await db().delete(organizationMemberships).where(inArray(organizationMemberships.userId, [teacherId, studentId, student2Id]))
        await db().delete(users).where(inArray(users.id, [teacherId, studentId, student2Id]))
        await db().delete(organizations).where(eq(organizations.id, orgId))
      }
    },
    30_000,
  )

  it(
    'supports creating, updating, listing, and deleting recurring weekly course sections',
    async () => {
      const orgId = nanoid()
      const teacherId = nanoid()
      const teacherMembershipId = nanoid()
      const passwordHash = await hashPassword('password123')

      try {
        await db().insert(organizations).values({ id: orgId, name: 'Schedule Org' })
        await db().insert(users).values({
          id: teacherId,
          email: `teacher-${orgId}@example.com`,
          passwordHash,
          name: 'Teacher Sched',
          initials: 'TS',
        })
        await db().insert(organizationMemberships).values({
          id: teacherMembershipId,
          organizationId: orgId,
          userId: teacherId,
          role: 'teacher',
        })

        const teacherAuth = authContext({
          userId: teacherId,
          membershipId: teacherMembershipId,
          organizationId: orgId,
          role: 'teacher',
        })

        // 1. Create course
        const newCourse = await createCourse(teacherAuth, {
          code: 'SE401',
          name: 'Software Architecture',
          department: 'Software Engineering',
          color: 'purple',
        })
        expect(newCourse.ok).toBe(true)
        expect(newCourse.courseId).toBeTruthy()

        // 2. Create recurring schedule for Thursday (day 4)
        const newSection = await createCourseSection(teacherAuth, {
          courseId: newCourse.courseId!,
          room: 'P.404',
          startsAt: '13:00',
          endsAt: '15:30',
          dayOfWeek: 4,
          autoStart: true,
        })
        expect(newSection.ok).toBe(true)
        expect(newSection.sectionId).toBeTruthy()

        // 3. List sections and verify enriched fields
        const sessions = await listClassSessions(teacherAuth.organizationId)
        const created = sessions.find((s) => s.sectionId === newSection.sectionId)
        expect(created).toBeTruthy()
        expect(created?.courseCode).toBe('SE401')
        expect(created?.courseName).toBe('Software Architecture')
        expect(created?.dayOfWeek).toBe(4)
        expect(created?.autoStart).toBe(true)
        expect(created?.room).toBe('P.404')
        expect(created?.startsAt).toBe('13:00')
        expect(created?.endsAt).toBe('15:30')

        // 4. Update recurring schedule (e.g. shift to Friday day 5 and room P.505)
        const updated = await updateCourseSection(teacherAuth, newSection.sectionId!, {
          room: 'P.505',
          startsAt: '14:00',
          endsAt: '16:30',
          dayOfWeek: 5,
          autoStart: false,
        })
        expect(updated.ok).toBe(true)

        const sessionsAfterUpdate = await listClassSessions(teacherAuth.organizationId)
        const updatedSec = sessionsAfterUpdate.find((s) => s.sectionId === newSection.sectionId)
        expect(updatedSec?.dayOfWeek).toBe(5)
        expect(updatedSec?.room).toBe('P.505')
        expect(updatedSec?.startsAt).toBe('14:00')
        expect(updatedSec?.endsAt).toBe('16:30')
        expect(updatedSec?.autoStart).toBe(false)

        // 5. Delete schedule
        const deleted = await deleteCourseSection(teacherAuth, newSection.sectionId!)
        expect(deleted.ok).toBe(true)

        const sessionsAfterDelete = await listClassSessions(teacherAuth.organizationId)
        expect(sessionsAfterDelete.some((s) => s.sectionId === newSection.sectionId)).toBe(false)
      } finally {
        await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
        await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
        await db().delete(courses).where(eq(courses.organizationId, orgId))
        await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
        await db().delete(users).where(eq(users.id, teacherId))
        await db().delete(organizations).where(eq(organizations.id, orgId))
      }
    },
    30_000,
  )
})
