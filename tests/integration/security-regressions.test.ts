import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendancePolicies,
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
  suspiciousAttempts,
  users,
} from '@/lib/db/schema'
import {
  createCourse,
  createCourseSection,
  getOrCreateLiveSession,
  markNotificationsRead,
  rotateChallengeForSession,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function authCtx(overrides: Partial<AuthContext>): AuthContext {
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

async function cleanupOrg(orgId: string, userIds: string[] = []) {
  try {
    await db().delete(attendanceVerifications).where(eq(attendanceVerifications.organizationId, orgId))
    await db().delete(suspiciousAttempts).where(eq(suspiciousAttempts.organizationId, orgId))
    await db().delete(devices).where(eq(devices.organizationId, orgId))
    await db().delete(notifications).where(eq(notifications.organizationId, orgId))
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId))
    await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId))
    await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId))
    await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId))
    await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId))
    await db().delete(courseSections).where(eq(courseSections.organizationId, orgId))
    await db().delete(courses).where(eq(courses.organizationId, orgId))
    await db().delete(attendancePolicies).where(eq(attendancePolicies.organizationId, orgId))
    await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId))
    for (const uid of userIds) {
      await db().delete(users).where(eq(users.id, uid))
    }
    await db().delete(organizations).where(eq(organizations.id, orgId))
  } catch {
    // ignore cleanup errors
  }
}

describe.skipIf(!hasDb)('Security Regression & Multi-Tenant Isolation Tests', () => {
  it('enforces multi-tenant isolation: Org A user cannot access or mutate Org B data', async () => {
    const orgA = `org_A_${nanoid(6)}`
    const orgB = `org_B_${nanoid(6)}`
    const userA = `usr_A_${nanoid(6)}`
    const userB = `usr_B_${nanoid(6)}`

    try {
      await db().insert(organizations).values([
        { id: orgA, name: 'University A' },
        { id: orgB, name: 'University B' },
      ])
      await db().insert(users).values([
        { id: userA, email: `a@${orgA}.edu`, passwordHash: 'hash', name: 'Teacher A', initials: 'TA' },
        { id: userB, email: `b@${orgB}.edu`, passwordHash: 'hash', name: 'Teacher B', initials: 'TB' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgA, userId: userA, role: 'teacher' },
        { id: nanoid(), organizationId: orgB, userId: userB, role: 'teacher' },
      ])

      const authA = authCtx({ userId: userA, organizationId: orgA, role: 'teacher' })
      const authB = authCtx({ userId: userB, organizationId: orgB, role: 'teacher' })

      // Create course in Org A
      const courseA = await createCourse(authA, {
        code: 'CS101',
        name: 'Algorithms',
        department: 'CS',
      })
      expect(courseA.ok).toBe(true)

      // Section in Org A
      const secA = await createCourseSection(authA, {
        courseId: courseA.courseId!,
        room: '101',
        startsAt: '08:00',
        endsAt: '10:00',
      })
      expect(secA.ok).toBe(true)

      // User B attempts to transition/close Org A's session -> must fail
      const liveSessionIdA = await getOrCreateLiveSession(authA, secA.sectionId!)
      expect(liveSessionIdA).toBeTruthy()

      const unauthorizedAction = await transitionSessionState(authB, liveSessionIdA!, 'active')
      expect(unauthorizedAction.ok).toBe(false)
      expect(unauthorizedAction.message).toContain('not found')
    } finally {
      await cleanupOrg(orgA, [userA])
      await cleanupOrg(orgB, [userB])
    }
  })

  it('rejects student role from performing teacher operations (RBAC check)', async () => {
    const studentAuth = authCtx({
      userId: 'student-rbac',
      organizationId: 'org-rbac',
      role: 'student',
    })

    const result = await createCourse(studentAuth, {
      code: 'HACK101',
      name: 'Illegal Course',
      department: 'IT',
    })

    expect(result.ok).toBe(false)
    expect(result.message).toContain('Permission denied')
  })

  it('correctly calculates late status when verification occurs after lateAfterMinutes threshold', async () => {
    const orgId = `org_late_${nanoid(6)}`
    const teacherId = `usr_tl_${nanoid(6)}`
    const studentId = `usr_sl_${nanoid(6)}`
    const courseId = `crs_l_${nanoid(6)}`
    const sectionId = `sec_l_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Late Test Org' })
      await db().insert(attendancePolicies).values({
        id: nanoid(),
        organizationId: orgId,
        lateAfterMinutes: 5, // 5 minutes threshold
        challengeTtlSeconds: 60,
      })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@edu.vn`, passwordHash: 'hash', name: 'Teacher L', initials: 'TL' },
        { id: studentId, email: `s_${orgId}@edu.vn`, passwordHash: 'hash', name: 'Student L', initials: 'SL' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20268888' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'PHY101',
        name: 'Physics',
        department: 'Science',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab 2',
        startsAt: '07:00',
        endsAt: '09:00',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId,
        organizationId: orgId,
      })

      const teacherAuth = authCtx({ userId: teacherId, organizationId: orgId, role: 'teacher' })
      const studentAuth = authCtx({ userId: studentId, organizationId: orgId, role: 'student' })

      const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
      expect(sessionId).toBeTruthy()

      // Start session with a past startedAt timestamp (10 minutes ago -> exceeds 5 min threshold)
      const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000)
      await db()
        .update(attendanceSessions)
        .set({ status: 'active', startedAt: tenMinutesAgo })
        .where(eq(attendanceSessions.id, sessionId!))

      const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
      expect(rotated.ok).toBe(true)

      const challengeCode = (rotated as { challenge: string }).challenge

      // Student verifies
      const result = await verifyAttendance(studentAuth, challengeCode, 'late-test-device')
      expect(result.ok).toBe(true)
      expect(result.record?.status).toBe('late')

      // Check in DB
      const record = await db()
        .select()
        .from(attendanceRecords)
        .where(eq(attendanceRecords.sessionId, sessionId!))
      expect(record[0].status).toBe('late')
    } finally {
      await cleanupOrg(orgId, [teacherId, studentId])
    }
  }, 30_000)

  it('rejects expired or invalidated challenges', async () => {
    const orgId = `org_exp_${nanoid(6)}`
    const teacherId = `usr_te_${nanoid(6)}`
    const studentId = `usr_se_${nanoid(6)}`
    const courseId = `crs_e_${nanoid(6)}`
    const sectionId = `sec_e_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Expired Challenge Org' })
      await db().insert(users).values([
        { id: teacherId, email: `te_${orgId}@edu.vn`, passwordHash: 'hash', name: 'Teacher E', initials: 'TE' },
        { id: studentId, email: `se_${orgId}@edu.vn`, passwordHash: 'hash', name: 'Student E', initials: 'SE' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20267777' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'MATH101',
        name: 'Calculus',
        department: 'Math',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab 3',
        startsAt: '07:00',
        endsAt: '09:00',
      })
      await db().insert(classEnrollments).values({
        sectionId,
        studentId,
        organizationId: orgId,
      })

      const teacherAuth = authCtx({ userId: teacherId, organizationId: orgId, role: 'teacher' })
      const studentAuth = authCtx({ userId: studentId, organizationId: orgId, role: 'student' })

      const sessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
      await transitionSessionState(teacherAuth, sessionId!, 'active')

      const challenge1 = await rotateChallengeForSession(teacherAuth, sessionId!)
      const oldCode = (challenge1 as { challenge: string }).challenge

      // Rotate again so challenge 1 becomes invalidated
      const challenge2 = await rotateChallengeForSession(teacherAuth, sessionId!)
      const newCode = (challenge2 as { challenge: string }).challenge

      // Attempting with old challenge must fail
      const oldAttempt = await verifyAttendance(studentAuth, oldCode)
      expect(oldAttempt.ok).toBe(false)
      expect(oldAttempt.message).toContain('incorrect')

      // Attempting with current challenge must succeed
      const validAttempt = await verifyAttendance(studentAuth, newCode)
      expect(validAttempt.ok).toBe(true)
    } finally {
      await cleanupOrg(orgId, [teacherId, studentId])
    }
  }, 30_000)

  it('proves notification tenant isolation: markNotificationsRead cannot affect other organizations', async () => {
    const org1 = `org_notif1_${nanoid(6)}`
    const org2 = `org_notif2_${nanoid(6)}`
    const commonUser = `usr_common_${nanoid(6)}`
    const notifOrg2Id = `notif_org2_${nanoid(6)}`

    try {
      await db().insert(organizations).values([
        { id: org1, name: 'Org 1' },
        { id: org2, name: 'Org 2' },
      ])
      await db().insert(users).values({
        id: commonUser,
        email: `common_${commonUser}@test.edu`,
        passwordHash: 'hash',
        name: 'Multi Org User',
        initials: 'MU',
      })
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: org1, userId: commonUser, role: 'student' },
        { id: nanoid(), organizationId: org2, userId: commonUser, role: 'student' },
      ])

      // Insert notification in Org 2
      await db().insert(notifications).values({
        id: notifOrg2Id,
        organizationId: org2,
        userId: commonUser,
        title: 'Org 2 Notification',
        body: 'Secret alert',
        readAt: null,
      })

      // User context while logged into Org 1
      const authOrg1 = authCtx({
        userId: commonUser,
        organizationId: org1,
        role: 'student',
      })

      // Try to mark Org 2 notification as read while authenticated in Org 1
      await markNotificationsRead(authOrg1, [notifOrg2Id])

      // Verify that the notification in Org 2 remains unread because Org 1 cannot touch Org 2
      const org2Notif = await db()
        .select()
        .from(notifications)
        .where(eq(notifications.id, notifOrg2Id))

      expect(org2Notif[0].readAt).toBeNull()
    } finally {
      await db().delete(notifications).where(eq(notifications.userId, commonUser))
      await db().delete(organizationMemberships).where(eq(organizationMemberships.userId, commonUser))
      await db().delete(users).where(eq(users.id, commonUser))
      await db().delete(organizations).where(eq(organizations.id, org1))
      await db().delete(organizations).where(eq(organizations.id, org2))
    }
  }, 30_000)
})
