import { z } from 'zod'

export const createCourseSchema = z.object({
  code: z
    .string({ error: 'Mã môn học là bắt buộc' })
    .trim()
    .min(1, 'Mã môn học không được để trống')
    .max(50, 'Mã môn học tối đa 50 ký tự'),
  name: z
    .string({ error: 'Tên môn học là bắt buộc' })
    .trim()
    .min(1, 'Tên môn học không được để trống')
    .max(150, 'Tên môn học tối đa 150 ký tự'),
  department: z
    .string({ error: 'Khoa phụ trách là bắt buộc' })
    .trim()
    .min(1, 'Khoa không được để trống')
    .max(100, 'Tên khoa tối đa 100 ký tự'),
  teacherId: z.string().trim().optional(),
  color: z
    .string()
    .trim()
    .max(30, 'Mã màu tối đa 30 ký tự')
    .optional(),
})

export type CreateCourseInput = z.infer<typeof createCourseSchema>

export const createDepartmentSchema = z.object({
  name: z
    .string({ error: 'Tên khoa/bộ môn là bắt buộc' })
    .trim()
    .min(2, 'Tên khoa/bộ môn tối thiểu 2 ký tự')
    .max(100, 'Tên khoa/bộ môn tối đa 100 ký tự'),
})

export type CreateDepartmentInput = z.infer<typeof createDepartmentSchema>

export const updateDepartmentSchema = z.object({
  id: z
    .string({ error: 'Mã khoa/bộ môn là bắt buộc' })
    .trim()
    .min(1, 'Mã khoa/bộ môn không được để trống'),
  name: z
    .string({ error: 'Tên khoa/bộ môn là bắt buộc' })
    .trim()
    .min(2, 'Tên khoa/bộ môn tối thiểu 2 ký tự')
    .max(100, 'Tên khoa/bộ môn tối đa 100 ký tự'),
})

export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>

export const createSectionSchema = z.object({
  courseId: z
    .string({ error: 'Mã môn học là bắt buộc' })
    .trim()
    .min(1, 'Mã môn học không được để trống')
    .max(100),
  room: z
    .string({ error: 'Phòng học là bắt buộc' })
    .trim()
    .min(1, 'Phòng học không được để trống')
    .max(50, 'Tên phòng tối đa 50 ký tự'),
  startsAt: z
    .string({ error: 'Giờ bắt đầu là bắt buộc' })
    .trim()
    .regex(/^\d{1,2}:\d{2}$/, 'Giờ bắt đầu phải có định dạng HH:MM'),
  endsAt: z
    .string({ error: 'Giờ kết thúc là bắt buộc' })
    .trim()
    .regex(/^\d{1,2}:\d{2}$/, 'Giờ kết thúc phải có định dạng HH:MM'),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày bắt đầu phải có định dạng YYYY-MM-DD').optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Ngày kết thúc phải có định dạng YYYY-MM-DD').optional(),
  dayOfWeek: z
    .coerce
    .number({ error: 'Thứ trong tuần là bắt buộc' })
    .int('Thứ phải là số nguyên')
    .min(1, 'Thứ phải từ 1 (Thứ Hai) đến 7 (Chủ Nhật)')
    .max(7, 'Thứ phải từ 1 (Thứ Hai) đến 7 (Chủ Nhật)'),
  autoStart: z
    .boolean()
    .optional()
    .default(true),
})

export type CreateSectionInput = z.infer<typeof createSectionSchema>

export const updateSectionSchema = z.object({
  room: z.string().trim().max(50).optional(),
  startsAt: z.string().trim().regex(/^\d{1,2}:\d{2}$/).optional(),
  endsAt: z.string().trim().regex(/^\d{1,2}:\d{2}$/).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  endDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  dayOfWeek: z.coerce.number().int().min(1).max(7).optional(),
  autoStart: z.boolean().optional(),
})

export type UpdateSectionInput = z.infer<typeof updateSectionSchema>

export const enrollStudentSchema = z.object({
  studentId: z.string().trim().max(100).optional(),
  studentCode: z.string().trim().max(50).optional(),
}).refine((data) => Boolean(data.studentId || data.studentCode), {
  message: 'Cần cung cấp studentId hoặc studentCode để ghi danh',
})

export type EnrollStudentInput = z.infer<typeof enrollStudentSchema>

export const markNotificationsSchema = z.object({
  notificationIds: z
    .array(z.string().trim().min(1).max(100))
    .max(500, 'Tối đa 500 thông báo mỗi lần cập nhật'),
})

export type MarkNotificationsInput = z.infer<typeof markNotificationsSchema>
