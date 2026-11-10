import { config } from 'dotenv'
import { describe, expect, it, vi } from 'vitest'
import { nanoid } from 'nanoid'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendanceRecords,
  attendanceSessions,
  classEnrollments,
  courseSections,
  courses,
  notifications,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import {
  getLiveSessionDetails,
  getOrCreateLiveSession,
  syncScheduledAttendance,
  transitionSessionState,
} from '@/lib/attendance/server'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function authCtx(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u',
    membershipId: 'm',
    organizationId: 'org',
    role: 'teacher',
    email: 'test@example.com',
    name: 'Test Teacher',
    initials: 'TT',
    department: null,
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Org',
    organizationPlan: 'Campus',
    ...overrides,
  }
}

describe.skipIf(!hasDb)('Scheduled Attendance & 3-Minute Window Lifecycle', () => {
  it('SCHEDULE-01: Auto-closes session when 3-minute window has expired and finalizes absent records', async () => {
    const orgId = `org_sched_${nanoid(6)}`
    const teacherId = `usr_t_${nanoid(6)}`
    const studentId = `usr_s_${nanoid(6)}`
    const courseId = `crs_${nanoid(6)}`
    const sectionId = `sec_${nanoid(6)}`
    const sessionId = `ses_${nanoid(6)}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Scheduled Test Org' })
      await db().insert(users).values([
        { id: teacherId, email: `teacher_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Teacher S', initials: 'TS' },
        { id: studentId, email: `student_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Student S', initials: 'SS' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', status: 'active', studentCode: '2026999' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT999',
        name: 'Kiem thu tu dong',
        department: 'CNTT',
        teacherId,
        status: 'active',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.101',
        startsAt: '07:30',
        endsAt: '09:30',
        dayOfWeek: 1,
        autoStart: true,
        status: 'scheduled',
      })
      await db().insert(classEnrollments).values({
        organizationId: orgId,
        sectionId,
        studentId,
        status: 'active',
      })

      // Insert an active session that started 4 minutes ago (> 3 minutes)
      const fourMinutesAgo = new Date(Date.now() - 4 * 60 * 1000)
      await db().insert(attendanceSessions).values({
        id: sessionId,
        organizationId: orgId,
        sectionId,
        courseId,
        teacherId,
        status: 'active',
        startedAt: fourMinutesAgo,
        createdAt: fourMinutesAgo,
      })

      const teacherAuth = authCtx({ userId: teacherId, organizationId: orgId, role: 'teacher' })

      // Teacher queries live session details -> should detect expiration (>3m), auto-close, and return null
      const live = await getLiveSessionDetails(teacherAuth)
      expect(live).toBeNull()

      // Verify in DB that session was closed
      const sessionRow = await db().select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionId))
      expect(sessionRow[0].status).toBe('closed')
      expect(sessionRow[0].closedAt).toBeDefined()

      // Verify student was finalized as absent
      const records = await db().select().from(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId))
      expect(records.length).toBe(1)
      expect(records[0].studentId).toBe(studentId)
      expect(records[0].status).toBe('absent')
    } finally {
      await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId)).catch(() => {})
      await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId)).catch(() => {})
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId)).catch(() => {})
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId)).catch(() => {})
      await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(inArray(users.id, [teacherId, studentId])).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  }, 30_000)

  it('SCHEDULE-02 & SCHEDULE-04: Manual trigger cancels scheduled auto-start and 10-minute advance notification', async () => {
    const orgId = `org_man_${nanoid(6)}`
    const teacherId = `usr_tm_${nanoid(6)}`
    const studentId = `usr_sm_${nanoid(6)}`
    const courseId = `crs_m_${nanoid(6)}`
    const sectionId = `sec_m_${nanoid(6)}`

    // Determine current day of week in Vietnam
    const now = new Date()
    const vnOffsetMs = 7 * 60 * 60 * 1000
    const vnTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + vnOffsetMs)
    const day = vnTime.getDay()
    const todayDayOfWeek = day === 0 ? 7 : day

    // Set startsAt to 5 minutes from now (so it's within the 10-minute notification window)
    const futureMinutes = vnTime.getHours() * 60 + vnTime.getMinutes() + 5
    const futureH = Math.floor(futureMinutes / 60) % 24
    const futureM = futureMinutes % 60
    const scheduledStartsAt = `${String(futureH).padStart(2, '0')}:${String(futureM).padStart(2, '0')}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Manual Override Org' })
      await db().insert(users).values([
        { id: teacherId, email: `teacher_m_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Teacher M', initials: 'TM' },
        { id: studentId, email: `student_m_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Student M', initials: 'SM' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', status: 'active', studentCode: '2026888' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT888',
        name: 'An ninh he thong',
        department: 'CNTT',
        teacherId,
        status: 'active',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.202',
        startsAt: scheduledStartsAt,
        endsAt: '12:00',
        dayOfWeek: todayDayOfWeek,
        autoStart: true,
        status: 'scheduled',
      })
      await db().insert(classEnrollments).values({
        organizationId: orgId,
        sectionId,
        studentId,
        status: 'active',
      })

      const teacherAuth = authCtx({ userId: teacherId, organizationId: orgId, role: 'teacher' })

      // 1. Teacher manually starts the session now (Early manual trigger)
      const manualSessionId = await getOrCreateLiveSession(teacherAuth, sectionId)
      expect(manualSessionId).toBeTruthy()
      const startResult = await transitionSessionState(teacherAuth, manualSessionId!, 'live')
      expect(startResult.ok).toBe(true)

      // 2. Run syncScheduledAttendance
      await syncScheduledAttendance(orgId)

      // 3. USER REQUIREMENT VERIFICATION:
      // "khi giảng viên bật rồi thì lịch đã set từ trước kia sẽ không phát được nữa"
      // Verify that NO duplicate session was created by the schedule
      const sessions = await db()
        .select()
        .from(attendanceSessions)
        .where(and(eq(attendanceSessions.organizationId, orgId), eq(attendanceSessions.sectionId, sectionId)))

      expect(sessions.length).toBe(1)
      expect(sessions[0].id).toBe(manualSessionId)

      // Verify that NO 10-minute scheduled notification was sent because teacher already manual-started
      const notifs = await db()
        .select()
        .from(notifications)
        .where(eq(notifications.organizationId, orgId))

      expect(notifs.length).toBe(0)
    } finally {
      vi.useRealTimers()
      await db().delete(notifications).where(eq(notifications.organizationId, orgId)).catch(() => {})
      await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId)).catch(() => {})
      await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId)).catch(() => {})
      await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId)).catch(() => {})
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId)).catch(() => {})
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId)).catch(() => {})
      await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(inArray(users.id, [teacherId, studentId])).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  }, 30_000)

  it('SCHEDULE-03: Sends notification to enrolled students 10 minutes before class with the 3-minute window', async () => {
    const orgId = `org_notif_${nanoid(6)}`
    const teacherId = `usr_tn_${nanoid(6)}`
    const studentId = `usr_sn_${nanoid(6)}`
    const courseId = `crs_n_${nanoid(6)}`
    const sectionId = `sec_n_${nanoid(6)}`

    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-11-09T08:00:00+07:00'))

    // Determine current day of week and time in Vietnam
    const now = new Date()
    const vnOffsetMs = 7 * 60 * 60 * 1000
    const vnTime = new Date(now.getTime() + (now.getTimezoneOffset() * 60 * 1000) + vnOffsetMs)
    const day = vnTime.getDay()
    const todayDayOfWeek = day === 0 ? 7 : day

    // Set startsAt to 5 minutes from now (falls in [now - 10m, now] range)
    const futureMinutes = vnTime.getHours() * 60 + vnTime.getMinutes() + 5
    const futureH = Math.floor(futureMinutes / 60) % 24
    const futureM = futureMinutes % 60
    const scheduledStartsAt = `${String(futureH).padStart(2, '0')}:${String(futureM).padStart(2, '0')}`

    try {
      await db().insert(organizations).values({ id: orgId, name: 'Notification Org' })
      await db().insert(users).values([
        { id: teacherId, email: `teacher_n_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Teacher N', initials: 'TN' },
        { id: studentId, email: `student_n_${orgId}@utc.edu.vn`, passwordHash: 'hash', name: 'Student N', initials: 'SN' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher', status: 'active' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', status: 'active', studentCode: '2026777' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT777',
        name: 'Lap trinh mang',
        department: 'CNTT',
        teacherId,
        status: 'active',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.303',
        startsAt: scheduledStartsAt,
        endsAt: '12:00',
        dayOfWeek: todayDayOfWeek,
        autoStart: true,
        status: 'scheduled',
      })
      await db().insert(classEnrollments).values({
        organizationId: orgId,
        sectionId,
        studentId,
        status: 'active',
      })

      // Run syncScheduledAttendance
      await syncScheduledAttendance(orgId)

      // Verify that notification was dispatched to the student
      const notifs = await db()
        .select()
        .from(notifications)
        .where(and(eq(notifications.organizationId, orgId), eq(notifications.userId, studentId)))

      expect(notifs.length).toBe(1)
      expect(notifs[0].title).toContain('IT777')
      expect(notifs[0].body).toContain('kéo dài 3 phút')
      expect(notifs[0].body).toContain(scheduledStartsAt)
    } finally {
      vi.useRealTimers()
      await db().delete(notifications).where(eq(notifications.organizationId, orgId)).catch(() => {})
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId)).catch(() => {})
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId)).catch(() => {})
      await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(inArray(users.id, [teacherId, studentId])).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  }, 30_000)
})
