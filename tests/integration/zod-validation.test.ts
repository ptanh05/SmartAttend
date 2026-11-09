import { describe, expect, it } from 'vitest'
import {
  validateRequestBody,
  loginSchema,
  registerAdminSchema,
  changePasswordSchema,
  resetPasswordSchema,
  verifyAttendanceSchema,
  sessionActionSchema,
  manualCheckInSchema,
  suspiciousActionSchema,
  attendancePolicySchema,
  createUserSchema,
  resetStudentPasswordSchema,
  importStudentsSchema,
  importTeachersSchema,
  createLeaveRequestSchema,
  reviewLeaveRequestSchema,
  createCourseSchema,
  createSectionSchema,
  updateEmailDomainSchema,
} from '@/lib/validation'

function makeMockRequest(body: unknown): Request {
  return new Request('https://smartattend.utc.edu.vn/api/test', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}

describe('Zod Input Validation Engine', () => {
  describe('Malformed and Non-Object JSON Handling', () => {
    it('rejects completely invalid JSON text with status 400 and structured error', async () => {
      const req = new Request('https://smartattend.utc.edu.vn/api/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{ malformed json: ',
      })
      const result = await validateRequestBody(req, loginSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(400)
        expect(result.errors.length).toBeGreaterThan(0)
        expect(result.errors[0].field).toBe('body')
      }
    })

    it('rejects primitive JSON values like numbers or strings', async () => {
      const req = makeMockRequest(12345)
      const result = await validateRequestBody(req, loginSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.response.status).toBe(400)
        expect(result.errors[0].field).toBe('body')
      }
    })
  })

  describe('Priority 1: Authentication Schemas', () => {
    it('accepts valid login payload with identifier', async () => {
      const req = makeMockRequest({
        identifier: 'gv.nguyenvana',
        password: 'Password123!',
        portal: 'teacher',
      })
      const result = await validateRequestBody(req, loginSchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.identifier).toBe('gv.nguyenvana')
        expect(result.data.portal).toBe('teacher')
      }
    })

    it('accepts valid login payload with email', async () => {
      const req = makeMockRequest({
        email: 'teacher@utc.edu.vn',
        password: 'Password123!',
        portal: 'teacher',
      })
      const result = await validateRequestBody(req, loginSchema)
      expect(result.success).toBe(true)
    })

    it('rejects login with missing password or invalid portal', async () => {
      const req = makeMockRequest({
        identifier: 'sv.20230001',
        password: '',
        portal: 'invalid_portal',
      })
      const result = await validateRequestBody(req, loginSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.some((e) => e.field === 'password' || e.field === 'portal')).toBe(true)
      }
    })

    it('rejects login when neither identifier nor email is provided', async () => {
      const req = makeMockRequest({
        password: 'Password123!',
        portal: 'student',
      })
      const result = await validateRequestBody(req, loginSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.some((e) => e.field === 'identifier')).toBe(true)
      }
    })

    it('validates admin registration password length and email format', async () => {
      const invalidEmailReq = makeMockRequest({
        name: 'Admin UTC',
        email: 'not-an-email',
        password: '123', // < 6 chars
        organizationName: 'UTC',
        apiKey: 'SECRET-KEY',
      })
      const result = await validateRequestBody(invalidEmailReq, registerAdminSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.some((e) => e.field === 'email')).toBe(true)
        expect(result.errors.some((e) => e.field === 'password')).toBe(true)
      }
    })

    it('validates change password schema', async () => {
      const shortPassReq = makeMockRequest({
        currentPassword: 'oldPassword',
        newPassword: 'short',
      })
      const result = await validateRequestBody(shortPassReq, changePasswordSchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.some((e) => e.field === 'newPassword')).toBe(true)
      }
    })

    it('validates reset password schema with allowed portals', async () => {
      const validReq = makeMockRequest({
        identifier: '20230001',
        portal: 'student',
      })
      const result = await validateRequestBody(validReq, resetPasswordSchema)
      expect(result.success).toBe(true)
    })
  })

  describe('Priority 2: Attendance Schemas', () => {
    it('validates 6-character uppercase alphanumeric challenge code in verify attendance', async () => {
      const validReq = makeMockRequest({
        code: 'A9X2K4',
        device: 'Chrome Windows',
        method: 'qr_scan',
      })
      const result = await validateRequestBody(validReq, verifyAttendanceSchema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.code).toBe('A9X2K4')
        expect(result.data.method).toBe('qr_scan')
      }

      const invalidCodeReq = makeMockRequest({
        code: 'lowercase-too-long-123',
      })
      const invalidResult = await validateRequestBody(invalidCodeReq, verifyAttendanceSchema)
      expect(invalidResult.success).toBe(false)
      if (!invalidResult.success) {
        expect(invalidResult.errors.some((e) => e.field === 'code')).toBe(true)
      }
    })

    it('validates acoustic and webauthn structured proof payloads', async () => {
      const req = makeMockRequest({
        code: 'BC1234',
        acousticProof: {
          sessionId: 'sess_1',
          sequence: 1,
          timestamp: Date.now(),
          signature: 'sig_abc',
        },
      })
      const result = await validateRequestBody(req, verifyAttendanceSchema)
      expect(result.success).toBe(true)
    })

    it('validates session action enum (start, pause, close, rotate)', async () => {
      const validReq = makeMockRequest({ action: 'rotate' })
      expect((await validateRequestBody(validReq, sessionActionSchema)).success).toBe(true)

      const invalidReq = makeMockRequest({ action: 'destroy_all' })
      const invalidResult = await validateRequestBody(invalidReq, sessionActionSchema)
      expect(invalidResult.success).toBe(false)
    })

    it('validates manual check-in status enum', async () => {
      const validReq = makeMockRequest({
        sessionId: 'sess_123',
        studentId: 'user_456',
        status: 'present',
        note: 'Có mặt đầy đủ',
      })
      expect((await validateRequestBody(validReq, manualCheckInSchema)).success).toBe(true)

      const invalidReq = makeMockRequest({
        sessionId: 'sess_123',
        studentId: 'user_456',
        status: 'unknown_status',
      })
      expect((await validateRequestBody(invalidReq, manualCheckInSchema)).success).toBe(false)
    })

    it('validates suspicious action enum (approved vs dismissed)', async () => {
      const validReq = makeMockRequest({
        attemptId: 'att_123',
        action: 'approved',
      })
      expect((await validateRequestBody(validReq, suspiciousActionSchema)).success).toBe(true)

      const invalidReq = makeMockRequest({
        attemptId: 'att_123',
        action: 'ignore',
      })
      expect((await validateRequestBody(invalidReq, suspiciousActionSchema)).success).toBe(false)
    })

    it('enforces attendance policy integer bounds (10 <= challengeTtlSeconds <= 300, 1 <= lateAfterMinutes <= 120)', async () => {
      const outOfBoundsReq = makeMockRequest({
        challengeTtlSeconds: 5, // < 10
        lateAfterMinutes: 200, // > 120
      })
      const result = await validateRequestBody(outOfBoundsReq, attendancePolicySchema)
      expect(result.success).toBe(false)
      if (!result.success) {
        expect(result.errors.some((e) => e.field === 'challengeTtlSeconds')).toBe(true)
        expect(result.errors.some((e) => e.field === 'lateAfterMinutes')).toBe(true)
      }

      const validReq = makeMockRequest({
        challengeTtlSeconds: 20,
        lateAfterMinutes: 15,
        requireTrustedDevice: true,
      })
      expect((await validateRequestBody(validReq, attendancePolicySchema)).success).toBe(true)
    })
  })

  describe('Priority 3: User Management and Import Schemas', () => {
    it('validates create user schema email, name, and role', async () => {
      const validReq = makeMockRequest({
        email: 'student@utc.edu.vn',
        name: 'Trần Văn B',
        role: 'student',
        studentCode: '20230002',
      })
      expect((await validateRequestBody(validReq, createUserSchema)).success).toBe(true)

      const invalidRoleReq = makeMockRequest({
        email: 'test@utc.edu.vn',
        name: 'Test',
        role: 'superadmin',
      })
      expect((await validateRequestBody(invalidRoleReq, createUserSchema)).success).toBe(false)
    })

    it('validates reset student password schema requires studentId', async () => {
      const emptyReq = makeMockRequest({ studentId: '' })
      expect((await validateRequestBody(emptyReq, resetStudentPasswordSchema)).success).toBe(false)

      const validReq = makeMockRequest({ studentId: 'student_123' })
      expect((await validateRequestBody(validReq, resetStudentPasswordSchema)).success).toBe(true)
    })

    it('validates import students schema requires either csv or rows', async () => {
      const emptyImportReq = makeMockRequest({})
      expect((await validateRequestBody(emptyImportReq, importStudentsSchema)).success).toBe(false)

      const csvReq = makeMockRequest({
        csv: 'MSSV,Họ và tên,Lớp\n20230001,Nguyễn Văn A,CNTT1',
      })
      expect((await validateRequestBody(csvReq, importStudentsSchema)).success).toBe(true)

      const rowsReq = makeMockRequest({
        rows: [{ studentCode: '20230001', name: 'Nguyễn Văn A' }],
      })
      expect((await validateRequestBody(rowsReq, importStudentsSchema)).success).toBe(true)

      // Test max rows limit (2000 max)
      const excessiveRows = Array.from({ length: 2001 }, (_, i) => ({
        studentCode: `2023${String(i).padStart(4, '0')}`,
        name: `Student ${i}`,
      }))
      const overLimitReq = makeMockRequest({ rows: excessiveRows })
      expect((await validateRequestBody(overLimitReq, importStudentsSchema)).success).toBe(false)
    })

    it('validates import teachers schema rows email validation', async () => {
      const invalidEmailRowReq = makeMockRequest({
        rows: [{ email: 'not-valid-email', name: 'Thầy X' }],
      })
      expect((await validateRequestBody(invalidEmailRowReq, importTeachersSchema)).success).toBe(false)
    })
  })

  describe('Priority 4: Leave, Course, Section, and Domain Schemas', () => {
    it('validates create leave request schema required fields and attachments', async () => {
      const missingReasonReq = makeMockRequest({
        courseId: 'crs_1',
        date: '2026-11-10',
        reason: '',
      })
      expect((await validateRequestBody(missingReasonReq, createLeaveRequestSchema)).success).toBe(false)

      const validReq = makeMockRequest({
        courseId: 'crs_1',
        date: '2026-11-10',
        reason: 'Sốt xuất huyết có giấy viện',
        evidenceNote: 'Đã đính kèm giấy xuất viện',
      })
      expect((await validateRequestBody(validReq, createLeaveRequestSchema)).success).toBe(true)

      // Valid base64 image
      const validImageReq = makeMockRequest({
        courseId: 'crs_1',
        date: '2026-11-10',
        reason: 'Nghỉ ốm',
        attachmentUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
      })
      expect((await validateRequestBody(validImageReq, createLeaveRequestSchema)).success).toBe(true)

      // Invalid non-image MIME type (PDF)
      const invalidMimeReq = makeMockRequest({
        courseId: 'crs_1',
        date: '2026-11-10',
        reason: 'Nghỉ ốm',
        attachmentUrl: 'data:application/pdf;base64,JVBERi0xLjQKJcOkw7zDtsOfCjIgMCBvYmoKPDwvTGVuZ3RoIDM',
      })
      expect((await validateRequestBody(invalidMimeReq, createLeaveRequestSchema)).success).toBe(false)
    })

    it('validates review leave request schema status enum (approved, rejected)', async () => {
      const validReq = makeMockRequest({
        requestId: 'req_1',
        status: 'approved',
      })
      expect((await validateRequestBody(validReq, reviewLeaveRequestSchema)).success).toBe(true)

      const invalidReq = makeMockRequest({
        requestId: 'req_1',
        status: 'maybe',
      })
      expect((await validateRequestBody(invalidReq, reviewLeaveRequestSchema)).success).toBe(false)
    })

    it('validates create course and course section schedule formats', async () => {
      const validCourse = makeMockRequest({
        code: 'IT001',
        name: 'An ninh mạng',
        department: 'Khoa CNTT',
      })
      expect((await validateRequestBody(validCourse, createCourseSchema)).success).toBe(true)

      const invalidTimeSection = makeMockRequest({
        courseId: 'crs_1',
        room: 'P.302',
        startsAt: '7:30 AM', // not HH:MM
        endsAt: '09:30',
        dayOfWeek: 2,
      })
      expect((await validateRequestBody(invalidTimeSection, createSectionSchema)).success).toBe(false)

      const validSection = makeMockRequest({
        courseId: 'crs_1',
        room: 'P.302',
        startsAt: '07:30',
        endsAt: '09:30',
        dayOfWeek: 2,
      })
      expect((await validateRequestBody(validSection, createSectionSchema)).success).toBe(true)
    })

    it('validates organization email domain update', async () => {
      const validReq = makeMockRequest({ emailDomain: 'utc.edu.vn' })
      expect((await validateRequestBody(validReq, updateEmailDomainSchema)).success).toBe(true)
    })
  })
})

