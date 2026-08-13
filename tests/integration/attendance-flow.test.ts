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
  getOrCreateLiveSession,
  rotateChallengeForSession,
  transitionSessionState,
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

      const passwordHash = await hashPassword('integration-password')

      try {
        // --- Fixtures ---
        await db().insert(organizations).values({ id: orgId, name: 'Integration Org' })
        await db().insert(users).values([
          { id: teacherId, email: `teacher-${orgId}@example.com`, passwordHash, name: 'Teacher', initials: 'T' },
          { id: studentId, email: `student-${orgId}@example.com`, passwordHash, name: 'Student', initials: 'S' },
        ])
        await db().insert(organizationMemberships).values([
          { id: teacherMembershipId, organizationId: orgId, userId: teacherId, role: 'teacher' },
          { id: studentMembershipId, organizationId: orgId, userId: studentId, role: 'student', studentCode: `SV-${orgId}` },
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
        })
        await db().insert(classEnrollments).values({
          sectionId,
          studentId,
          organizationId: orgId,
        })

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
          studentCode: `SV-${orgId}`,
        })


        // --- Start the live session ---
        const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
        expect(sessionId).toBeTruthy()

        const started = await transitionSessionState(teacherAuth, sessionId!, 'active')
        expect(started.ok).toBe(true)

        const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
        expect(rotated.ok).toBe(true)

        // --- Verify with the issued challenge ---
        const result = await verifyAttendance(studentAuth, (rotated as { challenge: string }).challenge, 'integration-test-device')
        expect(result.ok).toBe(true)
        expect(result.record?.status).toBe('present')

        // Device policy default (`requireTrustedDevice` false + unseen device) -> score 78.
        expect(result.record?.confidence).toBe(78)

        // --- Confirm the record and device were persisted ---
        const recordRows = await db()
          .select()
          .from(attendanceRecords)
          .where(eq(attendanceRecords.sessionId, sessionId!))
        const record = recordRows.find((row) => row.studentId === studentId)
        expect(record).toBeTruthy()
        expect(record?.status).toBe('present')

        const deviceRows = await db()
          .select()
          .from(devices)
          .where(eq(devices.studentId, studentId))
        expect(deviceRows).toHaveLength(1)
        expect(deviceRows[0]?.trusted).toBe(true)

        // A second verify from the now-trusted device should score 98 and not flag.
        const rotatedAgain = await rotateChallengeForSession(teacherAuth, sessionId!)
        expect(rotatedAgain.ok).toBe(true)
        const secondResult = await verifyAttendance(studentAuth, (rotatedAgain as { challenge: string }).challenge, 'integration-test-device')
        expect(secondResult.ok).toBe(true)
        expect(secondResult.record?.confidence).toBe(98)
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
        await db().delete(authSessions).where(inArray(authSessions.userId, [teacherId, studentId]))
        await db().delete(organizationMemberships).where(inArray(organizationMemberships.userId, [teacherId, studentId]))
        await db().delete(users).where(inArray(users.id, [teacherId, studentId]))
        await db().delete(organizations).where(eq(organizations.id, orgId))
      }
    },
    30_000,
  )
})
