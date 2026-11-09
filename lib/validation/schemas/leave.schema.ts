import { z } from 'zod'

export const createLeaveRequestSchema = z.object({
  courseId: z
    .string({ error: 'Môn học là bắt buộc' })
    .trim()
    .min(1, 'Mã môn học không được để trống')
    .max(100, 'Mã môn học không hợp lệ'),
  sessionId: z
    .string()
    .trim()
    .max(100, 'Mã buổi học không hợp lệ')
    .optional(),
  date: z
    .string({ error: 'Ngày xin nghỉ là bắt buộc' })
    .trim()
    .min(1, 'Ngày xin nghỉ không được để trống')
    .max(50, 'Định dạng ngày không hợp lệ'),
  reason: z
    .string({ error: 'Lý do xin nghỉ là bắt buộc' })
    .trim()
    .min(1, 'Lý do xin nghỉ không được để trống')
    .max(1000, 'Lý do xin nghỉ tối đa 1000 ký tự'),
  evidenceNote: z
    .string()
    .trim()
    .max(500, 'Ghi chú minh chứng tối đa 500 ký tự')
    .optional(),
  attachmentUrl: z
    .string()
    .trim()
    .max(5000000, 'Tệp minh chứng đính kèm vượt quá giới hạn cho phép')
    .optional(),
})

export type CreateLeaveRequestInput = z.infer<typeof createLeaveRequestSchema>

export const reviewLeaveRequestSchema = z.object({
  requestId: z
    .string({ error: 'requestId là bắt buộc' })
    .trim()
    .min(1, 'Mã đơn nghỉ phép không được để trống')
    .max(100, 'Mã đơn không hợp lệ'),
  status: z.enum(['approved', 'rejected'], {
    error: 'Trạng thái phê duyệt phải là approved hoặc rejected',
  }),
})

export type ReviewLeaveRequestInput = z.infer<typeof reviewLeaveRequestSchema>
