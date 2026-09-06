import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { and, eq } from 'drizzle-orm'
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

describe.skipIf(!hasDb)('Attendance Engine & Anti-Fraud Suite', () => {
  it('SEC-03: Triệt tiêu Race Condition khi 1 sinh viên gửi song song nhiều request điểm danh cùng mili-giây', async () => {
    const orgId = `org_rc_${nanoid(6)}`
    const teacherId = `usr_t_${nanoid(6)}`
    const studentId = `usr_s_${nanoid(6)}`
    const courseId = `crs_${nanoid(6)}`
    const sectionId = `sec_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Race Condition Org' })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@test.edu.vn`, passwordHash: 'hash', name: 'Giảng viên A', initials: 'GA' },
        { id: studentId, email: `s_${orgId}@test.edu.vn`, passwordHash: 'hash', name: 'Sinh viên B', initials: 'SB' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20269999' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'CS202',
        name: 'Distributed Systems',
        department: 'CNTT',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab 402',
        startsAt: '08:00',
        endsAt: '10:00',
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
      await transitionSessionState(teacherAuth, sessionId!, 'active')

      const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
      expect(rotated.ok).toBe(true)
      const challengeCode = (rotated as { challenge: string }).challenge

      // Bắn đồng thời nhiều request xác thực song song bằng Promise.all
      const [res1, res2, res3] = await Promise.all([
        verifyAttendance(studentAuth, challengeCode, 'Concurrent-Device-1'),
        verifyAttendance(studentAuth, challengeCode, 'Concurrent-Device-2'),
        verifyAttendance(studentAuth, challengeCode, 'Concurrent-Device-3'),
      ])

      expect(res1.ok).toBe(true)
      expect(res2.ok).toBe(true)
      expect(res3.ok).toBe(true)

      // Kiểm tra DB: Đảm bảo chỉ có DUY NHẤT 1 bản ghi attendance_records được tạo với status 'present'
      const records = await db()
        .select()
        .from(attendanceRecords)
        .where(
          and(
            eq(attendanceRecords.organizationId, orgId),
            eq(attendanceRecords.sessionId, sessionId!),
            eq(attendanceRecords.studentId, studentId),
          ),
        )

      expect(records).toHaveLength(1)
      expect(records[0].status).toBe('present')
    } finally {
      await cleanupOrg(orgId, [teacherId, studentId])
    }
  }, 30_000)

  it('SEC-05: Chặn bypass cờ boolean: Thiết bị chưa tin cậy gửi cờ ultrasonic/biometric vẫn bắt buộc bị gắn cờ suspicious', async () => {
    const orgId = `org_af_${nanoid(6)}`
    const teacherId = `usr_taf_${nanoid(6)}`
    const studentId = `usr_saf_${nanoid(6)}`
    const courseId = `crs_af_${nanoid(6)}`
    const sectionId = `sec_af_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Anti-Fraud Org' })
      // Bật chính sách yêu cầu thiết bị tin cậy
      await db().insert(attendancePolicies).values({
        id: nanoid(),
        organizationId: orgId,
        requireTrustedDevice: true,
        challengeTtlSeconds: 30,
      })
      await db().insert(users).values([
        { id: teacherId, email: `t_${orgId}@test.edu.vn`, passwordHash: 'hash', name: 'Giảng viên AF', initials: 'TA' },
        { id: studentId, email: `s_${orgId}@test.edu.vn`, passwordHash: 'hash', name: 'Sinh viên AF', initials: 'SA' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20268888' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'SEC301',
        name: 'Network Security',
        department: 'CNTT',
        teacherId,
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Lab 501',
        startsAt: '13:00',
        endsAt: '15:00',
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
      const rotated = await rotateChallengeForSession(teacherAuth, sessionId!)
      const challengeCode = (rotated as { challenge: string }).challenge

      // Giả lập hacker gửi payload với các cờ boolean { ultrasonicVerified: true, biometricVerified: true } từ trình duyệt lạ
      const result = await verifyAttendance(studentAuth, challengeCode, 'Hacker-Untrusted-Browser', {
        method: 'ultrasonic_faceid',
        ultrasonicVerified: true,
        biometricVerified: true,
      })

      expect(result.ok).toBe(true)

      // Server bắt buộc vẫn phải tạo bản ghi gắn cờ trong bảng suspicious_attempts
      const suspiciousRows = await db()
        .select()
        .from(suspiciousAttempts)
        .where(eq(suspiciousAttempts.organizationId, orgId))

      expect(suspiciousRows.length).toBeGreaterThanOrEqual(1)
      expect(suspiciousRows[0].reason).toContain('trusted-device policy')
      expect(suspiciousRows[0].status).toBe('open')
    } finally {
      await cleanupOrg(orgId, [teacherId, studentId])
    }
  }, 30_000)
})
