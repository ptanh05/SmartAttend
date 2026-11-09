import { z } from 'zod'

export const studentRowSchema = z.object({
  studentCode: z.string().trim().min(1, 'Mã sinh viên không được để trống').max(50),
  name: z.string().trim().min(1, 'Họ tên không được để trống').max(100),
  department: z.string().trim().max(100).optional(),
  classCode: z.string().trim().max(50).optional(),
})

/** Maximum raw CSV payload accepted by the import endpoints (2 MB). */
export const MAX_IMPORT_CSV_BYTES = 2 * 1024 * 1024
/** Maximum number of data rows processed by a single import request. */
export const MAX_IMPORT_STUDENT_ROWS = 2000
export const MAX_IMPORT_TEACHER_ROWS = 500

const csvText = (label: string) =>
  z
    .string()
    .max(MAX_IMPORT_CSV_BYTES, `Tệp CSV vượt quá dung lượng tối đa ${Math.floor(MAX_IMPORT_CSV_BYTES / 1024 / 1024)}MB`)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= MAX_IMPORT_CSV_BYTES, {
      message: `Tệp CSV vượt quá dung lượng tối đa ${Math.floor(MAX_IMPORT_CSV_BYTES / 1024 / 1024)}MB (${label})`,
    })

export const importStudentsSchema = z.object({
  csv: csvText('student').optional(),
  rows: z.array(studentRowSchema).max(MAX_IMPORT_STUDENT_ROWS, `Mỗi lần nhập tối đa ${MAX_IMPORT_STUDENT_ROWS} bản ghi`).optional(),
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
  csv: csvText('teacher').optional(),
  rows: z.array(teacherRowSchema).max(MAX_IMPORT_TEACHER_ROWS, `Mỗi lần nhập tối đa ${MAX_IMPORT_TEACHER_ROWS} bản ghi`).optional(),
}).refine((data) => Boolean(data.csv?.trim() || (data.rows && data.rows.length > 0)), {
  message: 'Cần cung cấp nội dung CSV hoặc danh sách hàng giảng viên',
})

export type ImportTeachersInput = z.infer<typeof importTeachersSchema>

