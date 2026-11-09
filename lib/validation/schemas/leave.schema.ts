import { z } from 'zod'

/**
 * Evidence attachments are stored inline as base64 data URLs. Only small
 * images are accepted so the request body stays bounded.
 */
export const MAX_LEAVE_ATTACHMENT_BYTES = 200 * 1024

const attachmentSchema = z
  .string()
  .trim()
  .max(MAX_LEAVE_ATTACHMENT_BYTES * 2, 'Tệp minh chứng đính kèm vượt quá giới hạn 200KB')
  .refine(
    (value) => {
      const match = /^data:(image\/(png|jpe?g|webp|gif));base64,([A-Za-z0-9+/=]+)$/.exec(value)
      if (!match) return false
      // base64 payload length -> decoded byte size (approx. 3/4 of the payload)
      return Math.ceil((match[3].length * 3) / 4) <= MAX_LEAVE_ATTACHMENT_BYTES
    },
    { message: 'Tệp minh chứng phải là ảnh (png/jpg/webp/gif) dạng base64 và không vượt quá 200KB' },
  )

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
  attachmentUrl: attachmentSchema.optional(),
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
