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
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import { listAuditLogs, listReportRecords } from '@/lib/attendance/server'
import { attendanceRate, attendanceSummary, toCsv, UTF8_BOM } from '@/lib/reports/csv'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

function makeAuthContext(overrides: Partial<AuthContext>): AuthContext {
  return {
    userId: 'u',
    membershipId: 'm',
    organizationId: 'org',
    role: 'teacher',
    email: 'teacher@utc.edu.vn',
    name: 'TS. Nguyễn Văn Thầy',
    initials: 'NVT',
    department: 'Khoa Công nghệ thông tin',
    studentCode: null,
    mustChangePassword: false,
    organizationName: 'Đại học Giao thông Vận tải',
    organizationPlan: 'Campus Plus',
    ...overrides,
  }
}

describe.skipIf(!hasDb)('REPORT-01, REPORT-02, REPORT-03 — Vietnamese Encoding & UTF-8 BOM Excel Compatibility', () => {
  it('REPORT-01 & REPORT-02: exports attendance summary and detail CSV with UTF-8 BOM and preserves Vietnamese characters without font mojibake', async () => {
    const orgId = `org_report_${nanoid(8)}`
    const teacherId = `usr_t_${nanoid(8)}`
    const student1Id = `usr_s1_${nanoid(8)}`
    const student2Id = `usr_s2_${nanoid(8)}`
    const courseId = `crs_web_${nanoid(8)}`
    const sectionId = `sec_web_${nanoid(8)}`
    const sessionId = `ses_web_${nanoid(8)}`

    const teacherAuth = makeAuthContext({
      userId: teacherId,
      organizationId: orgId,
      role: 'teacher',
      name: 'TS. Trần Đình Trọng',
    })

    try {
      // 1. Setup Org
      await db().insert(organizations).values({
        id: orgId,
        name: 'Trường Đại học Giao thông Vận tải UTC',
        plan: 'Campus Plus',
      })

      // 2. Setup Users with full Vietnamese names and accents
      await db().insert(users).values([
        {
          id: teacherId,
          email: `trong.${nanoid(5)}@utc.edu.vn`,
          passwordHash: 'hash',
          name: 'TS. Trần Đình Trọng',
          initials: 'TDT',
        },
        {
          id: student1Id,
          email: `sv1.${nanoid(5)}@sinhvien.utc.edu.vn`,
          passwordHash: 'hash',
          name: 'Nguyễn Văn Đạt',
          initials: 'NVD',
        },
        {
          id: student2Id,
          email: `sv2.${nanoid(5)}@sinhvien.utc.edu.vn`,
          passwordHash: 'hash',
          name: 'Trần Thị Ánh Tuyết',
          initials: 'TTA',
        },
      ])

      await db().insert(organizationMemberships).values([
        {
          id: `mem_t_${nanoid(8)}`,
          organizationId: orgId,
          userId: teacherId,
          role: 'teacher',
          department: 'Khoa CNTT',
        },
        {
          id: `mem_s1_${nanoid(8)}`,
          organizationId: orgId,
          userId: student1Id,
          role: 'student',
          studentCode: '211200001',
          department: 'Khoa CNTT',
        },
        {
          id: `mem_s2_${nanoid(8)}`,
          organizationId: orgId,
          userId: student2Id,
          role: 'student',
          studentCode: '211200002',
          department: 'Khoa CNTT',
        },
      ])

      // 3. Setup Course & Section with Vietnamese names
      await db().insert(courses).values({
        id: courseId,
        organizationId: orgId,
        code: 'IT3020',
        name: 'Lập trình Web nâng cao & Đám mây',
        department: 'Khoa Công nghệ thông tin',
        teacherId: teacherId,
        enrolled: 2,
      })

      await db().insert(courseSections).values({
        id: sectionId,
        organizationId: orgId,
        courseId,
        room: 'Phòng 402-A9 Giảng đường',
        dayOfWeek: 2,
        startsAt: '07:00',
        endsAt: '09:30',
      })

      // 4. Setup Session & Attendance Records
      await db().insert(attendanceSessions).values({
        id: sessionId,
        organizationId: orgId,
        courseId,
        sectionId,
        teacherId,
        status: 'closed',
      })

      await db().insert(attendanceRecords).values([
        {
          id: `rec_1_${nanoid(8)}`,
          organizationId: orgId,
          sessionId,
          studentId: student1Id,
          status: 'present',
          verifiedAt: new Date(),
          verificationScore: 100,
          device: 'iPhone 15 Pro Max',
        },
        {
          id: `rec_2_${nanoid(8)}`,
          organizationId: orgId,
          sessionId,
          studentId: student2Id,
          status: 'late',
          verifiedAt: new Date(),
          verificationScore: 80,
          device: 'Samsung Galaxy S24 Ultra',
        },
      ])

      // 5. Verify records retrieved from server
      const records = await listReportRecords(teacherAuth, courseId)
      expect(records.length).toBe(2)

      // REPORT-01: Attendance Summary Scope
      const byStudent = new Map<string, { name: string; email: string; items: Array<{ status: string }> }>()
      for (const record of records) {
        const key = record.studentEmail || record.studentName
        const existing = byStudent.get(key)
        if (existing) {
          existing.items.push({ status: record.status })
        } else {
          byStudent.set(key, { name: record.studentName, email: record.studentEmail, items: [{ status: record.status }] })
        }
      }

      const summaryColumns = [
        { header: 'Sinh viên', key: 'name' },
        { header: 'Email', key: 'email' },
        { header: 'Có mặt', key: 'present' },
        { header: 'Đi muộn', key: 'late' },
        { header: 'Vắng', key: 'absent' },
        { header: 'Chờ duyệt', key: 'pending' },
        { header: 'Gắn cờ nghi vấn', key: 'flagged' },
        { header: 'Tỷ lệ điểm danh (%)', key: 'rate' },
      ]

      const summaryRows = [...byStudent.values()].map((student) => {
        const summary = attendanceSummary(student.items)
        return {
          name: student.name,
          email: student.email,
          present: summary.present ?? 0,
          late: summary.late ?? 0,
          absent: summary.absent ?? 0,
          pending: summary.pending ?? 0,
          flagged: summary.flagged ?? 0,
          rate: attendanceRate(student.items),
        }
      })

      const summaryCsv = toCsv(summaryColumns, summaryRows)

      // Verify UTF-8 BOM exists at position 0 so Excel opens without mojibake
      expect(summaryCsv.startsWith(UTF8_BOM)).toBe(true)
      expect(summaryCsv.charCodeAt(0)).toBe(0xfeff)
      // Verify exact Vietnamese characters are intact
      expect(summaryCsv).toContain('Nguyễn Văn Đạt')
      expect(summaryCsv).toContain('Trần Thị Ánh Tuyết')
      expect(summaryCsv).toContain('Sinh viên,Email,Có mặt,Đi muộn,Vắng')
      expect(summaryCsv).toContain('Tỷ lệ điểm danh (%)')

      // REPORT-02: Attendance Detail Scope
      const detailColumns = [
        { header: 'Sinh viên', key: 'student' },
        { header: 'Email', key: 'email' },
        { header: 'Môn học', key: 'course' },
        { header: 'Phòng học', key: 'room' },
        { header: 'Trạng thái', key: 'status' },
        { header: 'Điểm', key: 'score' },
        { header: 'Thời gian xác thực', key: 'verified' },
        { header: 'Thiết bị', key: 'device' },
      ]

      const detailRows = records.map((r) => ({
        student: r.studentName,
        email: r.studentEmail,
        course: `${r.courseCode} · ${r.courseName}`,
        room: r.room,
        status: r.status,
        score: r.score,
        verified: r.verifiedAt ?? '',
        device: r.device,
      }))

      const detailCsv = toCsv(detailColumns, detailRows)

      expect(detailCsv.startsWith(UTF8_BOM)).toBe(true)
      expect(detailCsv.charCodeAt(0)).toBe(0xfeff)
      expect(detailCsv).toContain('Nguyễn Văn Đạt')
      expect(detailCsv).toContain('Trần Thị Ánh Tuyết')
      expect(detailCsv).toContain('IT3020 · Lập trình Web nâng cao & Đám mây')
      expect(detailCsv).toContain('Phòng 402-A9 Giảng đường')
    } finally {
      // Cleanup
      await db().delete(attendanceRecords).where(eq(attendanceRecords.sessionId, sessionId)).catch(() => {})
      await db().delete(attendanceSessions).where(eq(attendanceSessions.id, sessionId)).catch(() => {})
      await db().delete(courseSections).where(eq(courseSections.id, sectionId)).catch(() => {})
      await db().delete(courses).where(eq(courses.id, courseId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(eq(users.id, teacherId)).catch(() => {})
      await db().delete(users).where(eq(users.id, student1Id)).catch(() => {})
      await db().delete(users).where(eq(users.id, student2Id)).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  })

  it('REPORT-03: exports audit log CSV with UTF-8 BOM and preserves Vietnamese actions and actors', async () => {
    const orgId = `org_audit_${nanoid(8)}`
    const adminId = `usr_adm_${nanoid(8)}`

    const adminAuth = makeAuthContext({
      userId: adminId,
      organizationId: orgId,
      role: 'admin',
      name: 'Quản trị viên Ban Đào Tạo',
    })

    try {
      await db().insert(organizations).values({
        id: orgId,
        name: 'Trường Đại học GTVT Cơ sở Hà Nội',
        plan: 'Campus Plus',
      })

      await db().insert(users).values({
        id: adminId,
        email: `admin.${nanoid(5)}@utc.edu.vn`,
        passwordHash: 'hash',
        name: 'Quản trị viên Ban Đào Tạo',
        initials: 'QTV',
      })

      await db().insert(organizationMemberships).values({
        id: `mem_adm_${nanoid(8)}`,
        organizationId: orgId,
        userId: adminId,
        role: 'admin',
      })

      // Insert audit logs with Vietnamese description/action/target
      await db().insert(auditLogs).values([
        {
          id: `audit_1_${nanoid(8)}`,
          organizationId: orgId,
          actorId: adminId,
          actorName: 'TS. Nguyễn Văn Thầy (Giảng viên)',
          action: 'Duyệt đơn xin nghỉ phép có lý do chính đáng',
          target: 'Sinh viên Nguyễn Văn Đạt - Lớp IT3020',
          severity: 'info',
        },
        {
          id: `audit_2_${nanoid(8)}`,
          organizationId: orgId,
          actorId: adminId,
          actorName: 'Hệ thống SmartAttend UTC',
          action: 'Phát hiện thiết bị điểm danh đáng ngờ (Chưa đăng ký)',
          target: 'Phòng 402-A9 Giảng đường',
          severity: 'warning',
        },
      ])

      const events = await listAuditLogs(adminAuth)
      expect(events.length).toBeGreaterThanOrEqual(2)

      const columns = [
        { header: 'Người thực hiện', key: 'actor' },
        { header: 'Hành động', key: 'action' },
        { header: 'Đối tượng', key: 'target' },
        { header: 'Mức độ', key: 'severity' },
        { header: 'Thời gian', key: 'createdAt' },
      ]

      const rows = events.map((e) => ({
        actor: e.actor,
        action: e.action,
        target: e.target,
        severity: e.severity,
        createdAt: e.createdAt,
      }))

      const auditCsv = toCsv(columns, rows)

      expect(auditCsv.startsWith(UTF8_BOM)).toBe(true)
      expect(auditCsv.charCodeAt(0)).toBe(0xfeff)
      expect(auditCsv).toContain('TS. Nguyễn Văn Thầy (Giảng viên)')
      expect(auditCsv).toContain('Duyệt đơn xin nghỉ phép có lý do chính đáng')
      expect(auditCsv).toContain('Phát hiện thiết bị điểm danh đáng ngờ (Chưa đăng ký)')
      expect(auditCsv).toContain('Người thực hiện,Hành động,Đối tượng,Mức độ,Thời gian')
    } finally {
      await db().delete(auditLogs).where(eq(auditLogs.organizationId, orgId)).catch(() => {})
      await db().delete(organizationMemberships).where(eq(organizationMemberships.organizationId, orgId)).catch(() => {})
      await db().delete(users).where(eq(users.id, adminId)).catch(() => {})
      await db().delete(organizations).where(eq(organizations.id, orgId)).catch(() => {})
    }
  })
})
