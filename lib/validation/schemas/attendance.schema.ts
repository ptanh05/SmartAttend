import { z } from 'zod'

export const webauthnAssertionSchema = z.object({
  credentialId: z.string().trim().min(1),
  clientDataJSON: z.string().trim().min(1),
  authenticatorData: z.string().trim().min(1),
  signature: z.string().trim().min(1),
  challenge: z.string().trim().min(1),
  origin: z.string().trim().optional(),
})

export const acousticProofSchema = z.object({
  sessionId: z.string().trim().min(1),
  sequence: z.number().int(),
  timestamp: z.number(),
  signature: z.string().trim().min(1),
})

export const verifyAttendanceSchema = z.object({
  code: z
    .string({ error: 'Mã điểm danh là bắt buộc' })
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6}$/, 'Mã điểm danh phải gồm đúng 6 ký tự chữ hoa hoặc số'),
  device: z
    .string()
    .trim()
    .max(100, 'Thông tin thiết bị tối đa 100 ký tự')
    .optional()
    .default('This browser'),
  method: z
    .string()
    .trim()
    .max(50)
    .optional()
    .default('manual_code'),
  sessionId: z
    .string()
    .trim()
    .max(100, 'Mã buổi học không hợp lệ')
    .optional(),
  ultrasonicVerified: z
    .boolean()
    .optional()
    .default(false),
  biometricVerified: z
    .boolean()
    .optional()
    .default(false),
  webauthnAssertion: webauthnAssertionSchema.optional(),
  acousticProof: acousticProofSchema.optional(),
})

export type VerifyAttendanceInput = z.infer<typeof verifyAttendanceSchema>

export const createLiveSessionSchema = z.object({
  sectionId: z
    .string({ error: 'sectionId là bắt buộc' })
    .trim()
    .min(1, 'Mã lớp học phần không được để trống')
    .max(100, 'Mã lớp học phần không hợp lệ'),
})

export type CreateLiveSessionInput = z.infer<typeof createLiveSessionSchema>

export const sessionActionSchema = z.object({
  action: z.enum(['start', 'pause', 'close', 'rotate'], {
    error: 'Hành động điều khiển phiên không hợp lệ',
  }),
})

export type SessionActionInput = z.infer<typeof sessionActionSchema>

export const manualCheckInSchema = z.object({
  sessionId: z
    .string({ error: 'sessionId là bắt buộc' })
    .trim()
    .min(1, 'sessionId không được để trống')
    .max(100, 'sessionId không hợp lệ'),
  studentId: z
    .string({ error: 'studentId là bắt buộc' })
    .trim()
    .min(1, 'studentId không được để trống')
    .max(100, 'studentId không hợp lệ'),
  status: z.enum(['present', 'late', 'absent', 'excused'], {
    error: 'Trạng thái điểm danh không hợp lệ',
  }),
  note: z
    .string()
    .trim()
    .max(500, 'Ghi chú tối đa 500 ký tự')
    .optional(),
})

export type ManualCheckInInput = z.infer<typeof manualCheckInSchema>

export const overrideRecordSchema = z.object({
  status: z.enum(['present', 'late', 'absent', 'excused'], {
    error: 'Trạng thái điểm danh không hợp lệ',
  }),
  recordId: z
    .string()
    .trim()
    .max(100, 'recordId không hợp lệ')
    .optional(),
  sessionId: z
    .string()
    .trim()
    .max(100, 'sessionId không hợp lệ')
    .optional(),
  studentId: z
    .string()
    .trim()
    .max(100, 'studentId không hợp lệ')
    .optional(),
  note: z
    .string()
    .trim()
    .max(500, 'Ghi chú tối đa 500 ký tự')
    .optional(),
})

export type OverrideRecordInput = z.infer<typeof overrideRecordSchema>

export const suspiciousActionSchema = z.object({
  attemptId: z
    .string({ error: 'attemptId là bắt buộc' })
    .trim()
    .min(1, 'attemptId không được để trống')
    .max(100, 'attemptId không hợp lệ'),
  action: z.enum(['approved', 'dismissed'], {
    error: 'Hành động không hợp lệ (approved hoặc dismissed)',
  }),
})

export type SuspiciousActionInput = z.infer<typeof suspiciousActionSchema>

export const attendancePolicySchema = z.object({
  challengeTtlSeconds: z
    .number({ error: 'challengeTtlSeconds phải là số' })
    .int('Thời gian xoay mã phải là số nguyên')
    .min(10, 'Thời gian xoay mã tối thiểu 10 giây')
    .max(300, 'Thời gian xoay mã tối đa 300 giây')
    .optional(),
  lateAfterMinutes: z
    .number({ error: 'lateAfterMinutes phải là số' })
    .int('Thời gian tính đi muộn phải là số nguyên')
    .min(1, 'Thời gian tính muộn tối thiểu 1 phút')
    .max(120, 'Thời gian tính muộn tối đa 120 phút')
    .optional(),
  requireTrustedDevice: z
    .boolean()
    .optional(),
})

export type AttendancePolicyInput = z.infer<typeof attendancePolicySchema>
