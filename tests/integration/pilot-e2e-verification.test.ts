import { config } from 'dotenv'
import { describe, expect, it } from 'vitest'
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
  leaveRequests,
  notifications,
  organizationMemberships,
  organizations,
  suspiciousAttempts,
  users,
} from '@/lib/db/schema'
import {
  changeUserPassword,
} from '@/lib/auth/users'
import { hashPassword } from '@/lib/auth/password'
import {
  createCourse,
  createCourseSection,
  enrollStudentsToSection,
  getCourseAttendanceSummary,
  getOrCreateLiveSession,
  listClassSessions,
  listReportRecords,
  manualCheckInStudent,
  rotateChallengeForSession,
  syncScheduledAttendance,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import {
  addLeaveRequest,
  updateLeaveRequestStatus,
} from '@/lib/attendance/leave'
import { escapeCsvCell, toCsv } from '@/lib/reports/csv'
import { clientIp } from '@/lib/rate-limit'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

describe.skipIf(!hasDb)('SMARTATTEND — Final End-to-End Pilot Test Suite', () => {
  const orgId = `org_pilot_${nanoid(8)}`
  const adminId = `usr_adm_${nanoid(8)}`
  const teacherAId = `usr_tcha_${nanoid(8)}`
  const teacherBId = `usr_tchb_${nanoid(8)}`
  const student1Id = `usr_stu1_${nanoid(8)}`
  const student2Id = `usr_stu2_${nanoid(8)}`
  const student1Mssv = `2026${Math.floor(1000 + Math.random() * 9000)}`
  const student2Mssv = `2026${Math.floor(1000 + Math.random() * 9000)}`

  let courseAId = ''
  let sectionAId = ''
  let liveSessionAId = ''
  const initialPass = 'TemporaryInitialPass123!'

  const adminEmail = `admin.pilot.${nanoid(6)}@utc.edu.vn`
  const teacherAEmail = `giangvien.a.${nanoid(6)}@utc.edu.vn`
  const teacherBEmail = `giangvien.b.${nanoid(6)}@utc.edu.vn`
  const student1Email = `${student1Mssv}.${nanoid(6)}@student.utc.edu.vn`
  const student2Email = `${student2Mssv}.${nanoid(6)}@student.utc.edu.vn`

  const adminAuth: AuthContext = {
    userId: adminId,
    membershipId: `m_${adminId}`,
    organizationId: orgId,
    role: 'admin',
    email: adminEmail,
    name: 'Quản trị viên Pilot',
    initials: 'QP',
    department: 'Phòng Đào tạo',
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Trường ĐH Giao thông Vận tải',
    organizationPlan: 'Campus Plus',
  }

  const teacherAAuth: AuthContext = {
    userId: teacherAId,
    membershipId: `m_${teacherAId}`,
    organizationId: orgId,
    role: 'teacher',
    email: teacherAEmail,
    name: 'TS. Nguyễn Văn A',
    initials: 'NA',
    department: 'Khoa CNTT',
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Trường ĐH Giao thông Vận tải',
    organizationPlan: 'Campus Plus',
  }

  const teacherBAuth: AuthContext = {
    userId: teacherBId,
    membershipId: `m_${teacherBId}`,
    organizationId: orgId,
    role: 'teacher',
    email: teacherBEmail,
    name: 'ThS. Trần Thị B',
    initials: 'TB',
    department: 'Khoa Điện tử',
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Trường ĐH Giao thông Vận tải',
    organizationPlan: 'Campus Plus',
  }

  const student1Auth: AuthContext = {
    userId: student1Id,
    membershipId: `m_${student1Id}`,
    organizationId: orgId,
    role: 'student',
    email: student1Email,
    name: 'Sinh viên Một',
    initials: 'S1',
    department: 'Khoa CNTT',
    studentCode: student1Mssv,
    mustChangePassword: false,
    organizationName: 'Trường ĐH Giao thông Vận tải',
    organizationPlan: 'Campus Plus',
  }

  const student2Auth: AuthContext = {
    userId: student2Id,
    membershipId: `m_${student2Id}`,
    organizationId: orgId,
    role: 'student',
    email: student2Email,
    name: 'Sinh viên Hai',
    initials: 'S2',
    department: 'Khoa CNTT',
    studentCode: student2Mssv,
    mustChangePassword: false,
    organizationName: 'Trường ĐH Giao thông Vận tải',
    organizationPlan: 'Campus Plus',
  }

  // Teardown helper
  async function cleanupAll() {
    await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId)).catch(() => {})
    await db().delete(notifications).where(eq(notifications.organizationId, orgId)).catch(() => {})
    await db().delete(leaveRequests).where(eq(leaveRequests.organizationId, orgId)).catch(() => {})
    await db().delete(attendanceVerifications).where(eq(attendanceVerifications.organizationId, orgId)).catch(() => {})
    await db().delete(suspiciousAttempts).where(eq(suspiciousAttempts.organizationId, orgId)).catch(() => {})
    await db().delete(attendanceRecords).where(eq(attendanceRecords.organizationId, orgId)).catch(() => {})
    await db().delete(attendanceChallenges).where(eq(attendanceChallenges.organizationId, orgId)).catch(() => {})
    await db().delete(attendanceSessions).where(eq(attendanceSessions.organizationId, orgId)).catch(() => {})
    await db().delete(classEnrollments).where(eq(classEnrollments.organizationId, orgId)).catch(() => {})
    await db().delete(courseSections).where(eq(courseSections.organizationId, orgId)).catch(() => {})
    await db().delete(courses).where(eq(courses.organizationId, orgId)).catch(() => {})
    await db().delete(devices).where(eq(devices.organizationId, orgId)).catch(() => {})
    await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
    for (const uid of [adminId, teacherAId, teacherBId, student1Id, student2Id]) {
      await db().delete(auditLogs).where(eq(auditLogs.actorId, uid)).catch(() => {})
      await db().delete(users).where(eq(users.id, uid)).catch(() => {})
    }
    await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
  }

  it('SECTION 1: Setup Synthetic Pilot Organization and User Identities', async () => {
    await cleanupAll()

    // 1. Create Organization
    await db().insert(organizations).values({
      id: orgId,
      name: 'Trường ĐH Giao thông Vận tải (Pilot Org)',
      plan: 'Campus Plus',
    })

    // 2. Insert Users with temporary default passwords
    const initialHash = await hashPassword(initialPass)
    await db().insert(users).values([
      { id: adminId, email: adminAuth.email, passwordHash: initialHash, name: adminAuth.name, initials: 'QP', mustChangePassword: true },
      { id: teacherAId, email: teacherAAuth.email, passwordHash: initialHash, name: teacherAAuth.name, initials: 'NA', mustChangePassword: true },
      { id: teacherBId, email: teacherBAuth.email, passwordHash: initialHash, name: teacherBAuth.name, initials: 'TB', mustChangePassword: true },
      { id: student1Id, email: student1Auth.email, passwordHash: initialHash, name: student1Auth.name, initials: 'S1', mustChangePassword: true },
      { id: student2Id, email: student2Auth.email, passwordHash: initialHash, name: student2Auth.name, initials: 'S2', mustChangePassword: true },
    ])

    // 3. Organization Memberships
    await db().insert(organizationMemberships).values([
      { id: nanoid(), organizationId: orgId, userId: adminId, role: 'admin', status: 'active' },
      { id: nanoid(), organizationId: orgId, userId: teacherAId, role: 'teacher', status: 'active' },
      { id: nanoid(), organizationId: orgId, userId: teacherBId, role: 'teacher', status: 'active' },
      { id: nanoid(), organizationId: orgId, userId: student1Id, role: 'student', studentCode: student1Mssv, status: 'active' },
      { id: nanoid(), organizationId: orgId, userId: student2Id, role: 'student', studentCode: student2Mssv, status: 'active' },
    ])

    const orgRow = await db().select().from(organizations).where(eq(organizations.id, orgId))
    expect(orgRow.length).toBe(1)
  })

  it('SECTION 2: Enforce Mandatory Password Change & Clearance Workflow', async () => {
    // 1. User must change password: verify initial state has mustChangePassword=true
    const userRow = await db().select().from(users).where(eq(users.id, teacherAId))
    expect(userRow[0].mustChangePassword).toBe(true)

    // 2. Change password
    const changeRes = await changeUserPassword(teacherAAuth, initialPass, 'TeacherNewSecurePassword@2026')
    expect(changeRes.ok).toBe(true)

    // 3. Verify flag is now false in DB
    const updatedRow = await db().select().from(users).where(eq(users.id, teacherAId))
    expect(updatedRow[0].mustChangePassword).toBe(false)
  })

  it('SECTION 3: Course Creation, Section Scheduling, and Student Enrollment', async () => {
    // Teacher A creates Course
    const courseRes = await createCourse(teacherAAuth, {
      code: 'IT401',
      name: 'Kiến trúc An ninh Hệ thống',
      department: 'Khoa Công nghệ thông tin',
      color: '#2563eb',
    })
    expect(courseRes.ok).toBe(true)
    courseAId = courseRes.courseId!

    // Teacher A creates Course Section (Room P.302, 07:30 - 09:30, Monday = 2)
    const sectionRes = await createCourseSection(teacherAAuth, {
      courseId: courseAId,
      room: 'P.302 - Nhà A1',
      startsAt: '07:30',
      endsAt: '09:30',
      dayOfWeek: 2,
      autoStart: false,
    })
    expect(sectionRes.ok).toBe(true)
    sectionAId = sectionRes.sectionId!

    // Enroll Student 1 and Student 2 into Section
    const enrollRes = await enrollStudentsToSection(teacherAAuth, sectionAId, [student1Id, student2Id])
    expect(enrollRes.ok).toBe(true)
    expect(enrollRes.enrolledCount).toBe(2)
  })

  it('SECTION 4: Live Session Management & Anti-Proxy Masking (SEC-01)', async () => {
    // Teacher A creates/activates live session
    const sessionId = await getOrCreateLiveSession(teacherAAuth, sectionAId)
    expect(sessionId).toBeTruthy()
    liveSessionAId = sessionId!

    // Transition state to active
    const startRes = await transitionSessionState(teacherAAuth, liveSessionAId, 'active')
    expect(startRes.ok).toBe(true)

    // Teacher rotates challenge
    const rotRes = await rotateChallengeForSession(teacherAAuth, liveSessionAId)
    expect(rotRes.ok).toBe(true)
    expect(rotRes.challenge).toBeDefined()
    expect(rotRes.challenge!.length).toBe(6)

    // VERIFY SEC-01: When Student calls listClassSessions, challenge is masked and acousticProof is undefined
    const studentSessions = await listClassSessions(orgId, student1Id)
    const targetSession = studentSessions.find((s) => s.sectionId === sectionAId || s.id === liveSessionAId)
    expect(targetSession).toBeDefined()
    expect(targetSession!.challenge).toBe('------')
    expect(targetSession!.acousticProof).toBeUndefined()
  })

  it('SECTION 5: Attendance Check-In Verification (QR & Dual Mode)', async () => {
    // Get active challenge plain from DB (as shown on teacher screen/projector)
    const challenges = await db()
      .select()
      .from(attendanceChallenges)
      .where(and(eq(attendanceChallenges.sessionId, liveSessionAId), eq(attendanceChallenges.status, 'active')))
    expect(challenges.length).toBeGreaterThan(0)
    const activeChallengeCode = challenges[0].code!

    // Student 1 performs QR check-in using the code displayed on projector
    const checkIn1 = await verifyAttendance(student1Auth, activeChallengeCode, 'iPhone 15 Pro', {
      sessionId: liveSessionAId,
      method: 'qr',
    })
    expect(checkIn1.ok).toBe(true)
    expect(checkIn1.record?.status).toBe('present')

    // Idempotency: Student 1 attempts duplicate check-in -> Should return previous record smoothly
    const dupCheckIn = await verifyAttendance(student1Auth, activeChallengeCode, 'iPhone 15 Pro', {
      sessionId: liveSessionAId,
    })
    expect(dupCheckIn.ok).toBe(true)
    expect(dupCheckIn.message).toContain('Bạn đã hoàn tất điểm danh')

    // Replay attack with invalid code -> Rejected
    const fakeCheckIn = await verifyAttendance(student2Auth, 'WRONG6', 'Samsung Galaxy', {
      sessionId: liveSessionAId,
    })
    expect(fakeCheckIn.ok).toBe(false)
  })

  it('SECTION 6: Quick Manual Roll Call for Student with Dead Battery (FEATURE 3)', async () => {
    // Teacher manually marks Student 2 present (e.g. phone died, verified in person)
    const manualRes = await manualCheckInStudent(teacherAAuth, liveSessionAId, student2Id, 'present', 'Sinh viên quên điện thoại, giáo viên kiểm tra trực tiếp')
    expect(manualRes.ok).toBe(true)

    const rec2 = await db()
      .select()
      .from(attendanceRecords)
      .where(and(eq(attendanceRecords.sessionId, liveSessionAId), eq(attendanceRecords.studentId, student2Id)))
    expect(rec2.length).toBe(1)
    expect(rec2[0].status).toBe('present')
    expect(rec2[0].verificationScore).toBe(100)
  })

  it('SECTION 7: Leave Request Submission, Approval, and Auto-Sync (FEATURE 1 & 2)', async () => {
    // Student 2 submits leave request for next session with valid Base64 image
    const validBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
    const leaveRes = await addLeaveRequest(student2Auth, {
      courseId: courseAId,
      date: '2026-11-16',
      reason: 'Sốt xuất huyết điều trị tại Bệnh viện Giao thông Vận tải',
      evidenceNote: 'Đã đính kèm giấy nhập viện',
      attachmentUrl: validBase64,
    })
    expect(leaveRes).toBeDefined()
    expect(leaveRes.id).toBeDefined()
    const requestId = leaveRes.id

    // Teacher reviews and approves leave request
    const reviewRes = await updateLeaveRequestStatus(teacherAAuth, requestId, 'approved')
    expect(reviewRes).not.toBeNull()
    expect(reviewRes!.status).toBe('approved')

    // Verify leave status in DB
    const leaveRow = await db().select().from(leaveRequests).where(eq(leaveRequests.id, requestId))
    expect(leaveRow[0].status).toBe('approved')
  })

  it('SECTION 8: Multi-Tenant & Horizontal Cross-Teacher IDOR Prevention (SEC-03, SEC-04, SEC-05, SEC-07)', async () => {
    // 1. Teacher B attempts to rotate Teacher A session challenge -> 403 Forbidden
    const hackRotate = await rotateChallengeForSession(teacherBAuth, liveSessionAId)
    expect(hackRotate.ok).toBe(false)
    expect(hackRotate.message).toContain('Forbidden')

    // 2. Teacher B attempts to close Teacher A session -> 403 Forbidden
    const hackClose = await transitionSessionState(teacherBAuth, liveSessionAId, 'closed')
    expect(hackClose.ok).toBe(false)
    expect(hackClose.message).toContain('Forbidden')

    // 3. Teacher B attempts to access Teacher A report summary -> 403 Forbidden
    await expect(getCourseAttendanceSummary(teacherBAuth, courseAId)).rejects.toThrow('Forbidden')

    // 4. Student attempts to see unmasked challenge in class session list
    const studentSessions = await listClassSessions(orgId, student1Id)
    expect(studentSessions.length).toBeGreaterThan(0)
    expect(studentSessions[0].challenge).toBe('------')
    expect(studentSessions[0].acousticProof).toBeUndefined()
  })

  it('SECTION 9: CSV Export, Vietnamese Encoding & Formula Injection Defense', async () => {
    // Teacher A exports course attendance records
    const records = await listReportRecords(teacherAAuth, courseAId)
    expect(records.length).toBeGreaterThan(0)

    // Formula injection cell defense
    expect(escapeCsvCell('=1+1')).toBe("'=1+1")
    expect(escapeCsvCell('   =cmd|/C calc')).toBe("'   =cmd|/C calc")
    expect(escapeCsvCell(' \t-SUM(1,2)')).toBe('"\' \t-SUM(1,2)"')

    // Export CSV with UTF-8 BOM
    const csvContent = toCsv(
      [
        { header: 'Mã sinh viên', key: 'studentCode' },
        { header: 'Họ và tên', key: 'studentName' },
        { header: 'Trạng thái', key: 'status' },
      ],
      records,
    )
    expect(csvContent.charCodeAt(0)).toBe(0xfeff) // UTF-8 BOM
    expect(csvContent).toContain('Sinh viên Một')
  })

  it('SECTION 10: Scheduled Attendance Synchronization & Cron Guard', async () => {
    // Execute scheduled attendance sync
    await expect(syncScheduledAttendance(orgId)).resolves.not.toThrow()

    // Rate limiter under spoofed IP
    const ipReq1 = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '1.2.3.4, 5.6.7.8' },
    })
    const ip1 = clientIp(ipReq1)
    expect(ip1).toBe('5.6.7.8') // Rightmost proxy hop trusted

    const ipReqSpoofed = new Request('http://localhost', {
      headers: { 'x-forwarded-for': '10.0.0.1, 10.0.0.2, 5.6.7.8' },
    })
    const ipSpoofed = clientIp(ipReqSpoofed)
    expect(ipSpoofed).toBe('5.6.7.8') // Spoofed prefix ignored
  })

  it('SECTION 11: Cleanup Synthetic Pilot Data', async () => {
    await cleanupAll()
    const check = await db().select().from(organizations).where(eq(organizations.id, orgId))
    expect(check.length).toBe(0)
  })
})
