import { z } from 'zod'

export const studentRowSchema = z.object({
  studentCode: z.string().trim().min(1, 'Mã sinh viên không được để trống').max(50),
  name: z.string().trim().min(1, 'Họ tên không được để trống').max(100),
  department: z.string().trim().max(100).optional(),
  classCode: z.string().trim().max(50).optional(),
})

export const importStudentsSchema = z.object({
  csv: z.string().max(10000000, 'Tệp CSV vượt quá dung lượng tối đa 10MB').optional(),
  rows: z.array(studentRowSchema).max(1000, 'Mỗi lần nhập tối đa 1000 bản ghi').optional(),
  sectionId: z.string().trim().max(100).optional(),
}).refine((data) => Boolean(data.csv?.trim() || (data.rows && data.rows.length > 0)), {
  message: 'Cần cung cấp nội dung CSV hoặc danh sách hàng sinh viên',
})

export type ImportStudentsInput = z.infer<typeof importStudentsSchema>

export const teacherRowSchema = z.object({
  email: z.string().trim().email('Email giảng viên không đúng định dạng').max(255),
  name: z.string().trim().min(1, 'Họ tên giảng viên không được để trống').max(100),
  department: z.string().trim().max(100).optional(),
})

export const importTeachersSchema = z.object({
  csv: z.string().max(10000000, 'Tệp CSV vượt quá dung lượng tối đa 10MB').optional(),
  rows: z.array(teacherRowSchema).max(500, 'Mỗi lần nhập tối đa 500 bản ghi').optional(),
}).refine((data) => Boolean(data.csv?.trim() || (data.rows && data.rows.length > 0)), {
  message: 'Cần cung cấp nội dung CSV hoặc danh sách hàng giảng viên',
})

export type ImportTeachersInput = z.infer<typeof importTeachersSchema>

