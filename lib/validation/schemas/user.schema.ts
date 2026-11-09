import { z } from 'zod'

export const createUserSchema = z.object({
  email: z
    .string({ error: 'Email là bắt buộc' })
    .trim()
    .email('Email không đúng định dạng')
    .max(255, 'Email tối đa 255 ký tự'),
  name: z
    .string({ error: 'Họ và tên là bắt buộc' })
    .trim()
    .min(1, 'Họ và tên không được để trống')
    .max(100, 'Họ và tên tối đa 100 ký tự'),
  role: z.enum(['student', 'teacher', 'admin'], {
    error: 'Vai trò người dùng không hợp lệ',
  }),
  department: z
    .string()
    .trim()
    .max(100, 'Tên khoa tối đa 100 ký tự')
    .optional(),
  studentCode: z
    .string()
    .trim()
    .max(50, 'Mã sinh viên tối đa 50 ký tự')
    .optional(),
})

export type CreateUserInput = z.infer<typeof createUserSchema>

export const resetStudentPasswordSchema = z.object({
  studentId: z
    .string({ error: 'studentId là bắt buộc' })
    .trim()
    .min(1, 'Mã sinh viên không được để trống')
    .max(100, 'Mã định danh không hợp lệ'),
})

export type ResetStudentPasswordInput = z.infer<typeof resetStudentPasswordSchema>

export const updateEmailDomainSchema = z.object({
  emailDomain: z
    .string()
    .trim()
    .max(100, 'Tên miền tối đa 100 ký tự')
    .optional()
    .nullable(),
})

export type UpdateEmailDomainInput = z.infer<typeof updateEmailDomainSchema>
