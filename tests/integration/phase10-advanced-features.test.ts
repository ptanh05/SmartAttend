import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceRecords,
  attendanceSessions,
  classEnrollments,
  courseSections,
  courses,
  leaveRequests,
  notifications,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import { addLeaveRequest, getLeaveRequests, updateLeaveRequestStatus } from '@/lib/attendance/leave'
import {
  finalizeAbsentRecords,
  getCourseAttendanceSummary,
  getLiveSessionDetails,
  manualCheckInStudent,
} from '@/lib/attendance/server'
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
    department: 'CNTT',
    studentCode: '20260001',
    mustChangePassword: false,
    organizationName: 'Test Org',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

describe.skipIf(!hasDb)('Phase 10 — Advanced Academic Features Integration Suite', () => {
  it('FEATURE 1 & 2: Leave Request with proof file attachment (medical cert/parent note)', async () => {
    const orgId = `org_p10_${nanoid(8)}`
    const teacherId = `usr_t_${nanoid(8)}`
    const studentId = `usr_s_${nanoid(8)}`
    const courseId = `crs_${nanoid(8)}`
    const dummyImageBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='

    const teacherAuth = makeAuthContext({
      userId: teacherId,
      organizationId: orgId,
      role: 'teacher',
      name: 'TS. Giang Vien UTC',
    })

    const studentAuth = makeAuthContext({
      userId: studentId,
      organizationId: orgId,
      role: 'student',
      name: 'Nguyen Van A',
      studentCode: '20260001',
    })

    try {
      // 1. Seed org, users, memberships, course
      await db().insert(organizations).values({ id: orgId, name: 'UTC Ha Noi', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherId, name: teacherAuth.name, email: `teacher_${nanoid(6)}@utc.edu.vn`, initials: 'GV', passwordHash: 'hash' },
        { id: studentId, name: studentAuth.name, email: `student_${nanoid(6)}@utc.edu.vn`, initials: 'NA', passwordHash: 'hash' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentId, role: 'student', studentCode: '20260001' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        teacherId,
        code: 'IT302',
        name: 'Lap Trinh Web Nang Cao',
        department: 'CNTT',
      })

      // 2. Student submits leave request with attached medical certificate image
      const createdRequest = await addLeaveRequest(studentAuth, {
        courseId,
        date: '24/08/2026',
        reason: 'Sot cao, nam vien dieu tri tai Benh vien GTVT',
        evidenceNote: 'Giay xac nhan ra vien so 142/BV-GTVT',
        attachmentUrl: dummyImageBase64,
      })

      expect(createdRequest.id).toBeTruthy()
      expect(createdRequest.status).toBe('pending')
      expect(createdRequest.attachmentUrl).toBe(dummyImageBase64)

      // 3. Teacher views pending requests and sees attachment
      const teacherRequests = await getLeaveRequests(teacherAuth)
      const targetReq = teacherRequests.find((r) => r.id === createdRequest.id)
      expect(targetReq).toBeDefined()
      expect(targetReq?.attachmentUrl).toBe(dummyImageBase64)
      expect(targetReq?.reason).toBe('Sot cao, nam vien dieu tri tai Benh vien GTVT')

      // 4. Teacher reviews and approves request
      const updatedReq = await updateLeaveRequestStatus(teacherAuth, createdRequest.id, 'approved')
      expect(updatedReq?.status).toBe('approved')
      expect(updatedReq?.attachmentUrl).toBe(dummyImageBase64)
    } finally {
      // Cleanup
      await db().delete(leaveRequests).where(eq(leaveRequests.organizationId, orgId)).catch(() => {})
      await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(eq(users.id, teacherId)).catch(() => {})
      await db().delete(users).where(eq(users.id, studentId)).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  })

  it('FEATURE 3: Quick Manual Roll Call for enrolled students with no phone or dead battery', async () => {
    const orgId = `org_rollcall_${nanoid(8)}`
    const teacherId = `usr_t_${nanoid(8)}`
    const student1Id = `usr_s1_${nanoid(8)}`
    const student2Id = `usr_s2_${nanoid(8)}`
    const courseId = `crs_${nanoid(8)}`
    const sectionId = `sec_${nanoid(8)}`
    const sessionId = `ses_${nanoid(8)}`

    const teacherAuth = makeAuthContext({
      userId: teacherId,
      organizationId: orgId,
      role: 'teacher',
      name: 'GV Roll Call',
    })

    try {
      // 1. Seed org, users, memberships, course, section, session
      await db().insert(organizations).values({ id: orgId, name: 'UTC RollCall Org', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherId, name: teacherAuth.name, email: `teacher_${nanoid(6)}@utc.edu.vn`, initials: 'GV', passwordHash: 'hash' },
        { id: student1Id, name: 'Tran Van B (Co mang DT)', email: `s1_${nanoid(6)}@utc.edu.vn`, initials: 'TB', passwordHash: 'hash' },
        { id: student2Id, name: 'Le Thi C (Quen dien thoai)', email: `s2_${nanoid(6)}@utc.edu.vn`, initials: 'LC', passwordHash: 'hash' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: student1Id, role: 'student', studentCode: '20260002' },
        { id: nanoid(), organizationId: orgId, userId: student2Id, role: 'student', studentCode: '20260003' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        teacherId,
        code: 'IT303',
        name: 'He Thong Thong Tin',
        department: 'CNTT',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.402-A1',
        startsAt: '07:00',
        endsAt: '09:15',
        dayOfWeek: 2,
      })
      // Enroll both students in section
      await db().insert(classEnrollments).values([
        { sectionId, studentId: student1Id, organizationId: orgId },
        { sectionId, studentId: student2Id, organizationId: orgId },
      ])

      // Open live session
      await db().insert(attendanceSessions).values({
        id: sessionId,
        organizationId: orgId,
        sectionId,
        courseId,
        teacherId,
        status: 'live',
      })

      // Student 1 checked in normally
      await db().insert(attendanceRecords).values({
        id: nanoid(),
        organizationId: orgId,
        sessionId,
        studentId: student1Id,
        status: 'present',
        verificationScore: 95,
        device: 'iPhone 15',
        verifiedAt: new Date(),
      })

      // 2. Teacher retrieves live session details: both students appear (student 2 is unmarked)
      const liveDetails = await getLiveSessionDetails(teacherAuth, sessionId)
      expect(liveDetails).toBeDefined()
      expect(liveDetails?.records).toHaveLength(2)

      const s2Row = liveDetails?.records.find((r) => r.studentId === student2Id)
      expect(s2Row).toBeDefined()
      expect(s2Row?.status).toBe('unmarked')
      expect(s2Row?.id).toBe(`unmarked_${student2Id}`)

      // 3. Teacher performs Quick Manual Roll Call for student 2 (forgot phone)
      const manualRecord = await manualCheckInStudent(
        teacherAuth,
        sessionId,
        student2Id,
        'present',
        'Quen mang dien thoai, giao vien xac nhan co mat tren lop',
      )

      expect(manualRecord.ok).toBe(true)
      expect(manualRecord.status).toBe('present')

      // 4. Verify live session now shows both students as present
      const updatedLive = await getLiveSessionDetails(teacherAuth, sessionId)
      const s2UpdatedRow = updatedLive?.records.find((r) => r.studentId === student2Id)
      expect(s2UpdatedRow?.status).toBe('present')
      expect(s2UpdatedRow?.confidence).toBe(100)
      expect(s2UpdatedRow?.device).toContain('Quen mang dien thoai')
    } finally {
      // Cleanup
      await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId)).catch(() => {})
      await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId)).catch(() => {})
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId)).catch(() => {})
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId)).catch(() => {})
      await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(eq(users.id, teacherId)).catch(() => {})
      await db().delete(users).where(eq(users.id, student1Id)).catch(() => {})
      await db().delete(users).where(eq(users.id, student2Id)).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  })

  it('FEATURE 1 & 4: Academic Attendance Warning calculation (20% rule) & Printable Attendance Summary', async () => {
    const orgId = `org_acad_${nanoid(8)}`
    const teacherId = `usr_t_${nanoid(8)}`
    const studentGoodId = `usr_good_${nanoid(8)}`
    const studentWarningId = `usr_warn_${nanoid(8)}`
    const studentDisqualifiedId = `usr_disq_${nanoid(8)}`
    const studentTriggerWarnId = `usr_twarn_${nanoid(8)}`
    const courseId = `crs_${nanoid(8)}`
    const sectionId = `sec_${nanoid(8)}`

    const teacherAuth = makeAuthContext({
      userId: teacherId,
      organizationId: orgId,
      role: 'teacher',
      name: 'TS. Vu Van UTC',
    })

    try {
      // 1. Seed org, users, memberships, course, section
      await db().insert(organizations).values({ id: orgId, name: 'UTC Academic Warning Org', plan: 'Campus Plus' })
      await db().insert(users).values([
        { id: teacherId, name: teacherAuth.name, email: `teacher_${nanoid(6)}@utc.edu.vn`, initials: 'VV', passwordHash: 'hash' },
        { id: studentGoodId, name: 'SV Chuyen Can (0 vang)', email: `good_${nanoid(6)}@utc.edu.vn`, initials: 'CC', passwordHash: 'hash' },
        { id: studentWarningId, name: 'SV Nguy Co (2 vang)', email: `warn_${nanoid(6)}@utc.edu.vn`, initials: 'NC', passwordHash: 'hash' },
        { id: studentDisqualifiedId, name: 'SV Bi Cam Thi (3 vang)', email: `disq_${nanoid(6)}@utc.edu.vn`, initials: 'CT', passwordHash: 'hash' },
        { id: studentTriggerWarnId, name: 'SV 1 Vang Cho Canh Bao', email: `twarn_${nanoid(6)}@utc.edu.vn`, initials: 'TW', passwordHash: 'hash' },
      ])
      await db().insert(organizationMemberships).values([
        { id: nanoid(), organizationId: orgId, userId: teacherId, role: 'teacher' },
        { id: nanoid(), organizationId: orgId, userId: studentGoodId, role: 'student', studentCode: '20261001' },
        { id: nanoid(), organizationId: orgId, userId: studentWarningId, role: 'student', studentCode: '20261002' },
        { id: nanoid(), organizationId: orgId, userId: studentDisqualifiedId, role: 'student', studentCode: '20261003' },
        { id: nanoid(), organizationId: orgId, userId: studentTriggerWarnId, role: 'student', studentCode: '20261004' },
      ])
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        teacherId,
        code: 'IT305',
        name: 'Kien Truc He Thong',
        department: 'CNTT',
      })
      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'P.301-A1',
        startsAt: '07:00',
        endsAt: '09:15',
        dayOfWeek: 3,
      })
      await db().insert(classEnrollments).values([
        { sectionId, studentId: studentGoodId, organizationId: orgId },
        { sectionId, studentId: studentWarningId, organizationId: orgId },
        { sectionId, studentId: studentDisqualifiedId, organizationId: orgId },
        { sectionId, studentId: studentTriggerWarnId, organizationId: orgId },
      ])

      // 2. Create 3 closed attendance sessions
      const sessionIds = [nanoid(), nanoid(), nanoid()]
      for (const sId of sessionIds) {
        await db().insert(attendanceSessions).values({
          id: sId,
          organizationId: orgId,
          sectionId,
          courseId,
          teacherId,
          status: 'closed',
        })
      }

      // Session 1: All present
      for (const sId of [studentGoodId, studentWarningId, studentDisqualifiedId, studentTriggerWarnId]) {
        await db().insert(attendanceRecords).values({
          id: nanoid(),
          organizationId: orgId,
          sessionId: sessionIds[0],
          studentId: sId,
          status: 'present',
          verificationScore: 90,
          device: 'Device',
        })
      }

      // Session 2:
      // studentGood: present
      // studentTriggerWarn: absent (1st absence)
      // studentWarning: absent (1st absence)
      // studentDisqualified: absent (1st absence)
      await db().insert(attendanceRecords).values([
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[1], studentId: studentGoodId, status: 'present', verificationScore: 90, device: 'D' },
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[1], studentId: studentTriggerWarnId, status: 'absent', verificationScore: 0, device: 'None' },
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[1], studentId: studentWarningId, status: 'absent', verificationScore: 0, device: 'None' },
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[1], studentId: studentDisqualifiedId, status: 'absent', verificationScore: 0, device: 'None' },
      ])

      // Session 3:
      // studentGood: present
      // studentTriggerWarn: present (remains 1 absent)
      // studentWarning: absent (2nd absence -> WARNING)
      // studentDisqualified: absent (2nd absence)
      await db().insert(attendanceRecords).values([
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[2], studentId: studentGoodId, status: 'present', verificationScore: 90, device: 'D' },
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[2], studentId: studentTriggerWarnId, status: 'present', verificationScore: 90, device: 'D' },
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[2], studentId: studentWarningId, status: 'absent', verificationScore: 0, device: 'None' },
        { id: nanoid(), organizationId: orgId, sessionId: sessionIds[2], studentId: studentDisqualifiedId, status: 'absent', verificationScore: 0, device: 'None' },
      ])

      // Add a 4th session:
      // studentGood: present
      // studentTriggerWarn: present (remains 1 absent)
      // studentWarning: present (remains 2 absent)
      // studentDisqualified: absent (3rd absence -> DISQUALIFIED)
      const session4Id = nanoid()
      await db().insert(attendanceSessions).values({
        id: session4Id,
        organizationId: orgId,
        sectionId,
        courseId,
        teacherId,
        status: 'closed',
      })
      await db().insert(attendanceRecords).values([
        { id: nanoid(), organizationId: orgId, sessionId: session4Id, studentId: studentGoodId, status: 'present', verificationScore: 90, device: 'D' },
        { id: nanoid(), organizationId: orgId, sessionId: session4Id, studentId: studentTriggerWarnId, status: 'present', verificationScore: 90, device: 'D' },
        { id: nanoid(), organizationId: orgId, sessionId: session4Id, studentId: studentWarningId, status: 'present', verificationScore: 90, device: 'D' },
        { id: nanoid(), organizationId: orgId, sessionId: session4Id, studentId: studentDisqualifiedId, status: 'absent', verificationScore: 0, device: 'None' },
      ])

      // 3. Test course attendance summary calculation (for printable PDF sheet)
      const summary = await getCourseAttendanceSummary(teacherAuth, courseId)

      expect(summary.course.code).toBe('IT305')
      expect(summary.totalSessions).toBe(4)
      expect(summary.students).toHaveLength(4)

      const goodStat = summary.students.find((s) => s.studentId === studentGoodId)
      expect(goodStat).toBeDefined()
      expect(goodStat?.presentCount).toBe(4)
      expect(goodStat?.unexcusedCount).toBe(0)
      expect(goodStat?.warningStatus).toBe('good')
      expect(goodStat?.examEligibility).toBe('ĐỦ ĐIỀU KIỆN')

      const warnStat = summary.students.find((s) => s.studentId === studentWarningId)
      expect(warnStat).toBeDefined()
      expect(warnStat?.unexcusedCount).toBe(2)
      expect(warnStat?.warningStatus).toBe('warning')
      expect(warnStat?.examEligibility).toBe('NGUY CƠ CẤM THI')

      const disqStat = summary.students.find((s) => s.studentId === studentDisqualifiedId)
      expect(disqStat).toBeDefined()
      expect(disqStat?.unexcusedCount).toBe(3)
      expect(disqStat?.warningStatus).toBe('disqualified')
      expect(disqStat?.examEligibility).toBe('CẤM THI')

      // 4. Test notification dispatch on finalizing absent records:
      // Open and finalize session 5: studentTriggerWarn hits 2nd absence (warning), studentWarning hits 3rd absence (disqualified)
      const liveSessId = nanoid()
      await db().insert(attendanceSessions).values({
        id: liveSessId,
        organizationId: orgId,
        sectionId,
        courseId,
        teacherId,
        status: 'live',
      })
      // finalize absent records for unmarked students in this section
      await finalizeAbsentRecords(orgId, liveSessId)

      // Verify that notification was dispatched for warning and disqualified students
      const notifs = await db().select().from(notifications).where(eq(notifications.organizationId, orgId))
      const warnNotif = notifs.find((n) => n.userId === studentTriggerWarnId)
      const disqNotif = notifs.find((n) => n.userId === studentWarningId)

      expect(warnNotif).toBeDefined()
      expect(warnNotif?.title).toContain('Nguy cơ cấm thi')

      expect(disqNotif).toBeDefined()
      expect(disqNotif?.title).toContain('Bị cấm thi')
    } finally {
      // Cleanup
      await db().delete(notifications).where(eq(notifications.organizationId, orgId)).catch(() => {})
      await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId)).catch(() => {})
      await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId)).catch(() => {})
      await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId)).catch(() => {})
      await db().delete(courseSections).where(eq(courseSections.organizationId, orgId)).catch(() => {})
      await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(eq(users.id, teacherId)).catch(() => {})
      await db().delete(users).where(eq(users.id, studentGoodId)).catch(() => {})
      await db().delete(users).where(eq(users.id, studentWarningId)).catch(() => {})
      await db().delete(users).where(eq(users.id, studentDisqualifiedId)).catch(() => {})
      await db().delete(users).where(eq(users.id, studentTriggerWarnId)).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  })
})
