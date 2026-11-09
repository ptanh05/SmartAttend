import { z } from 'zod'

export const loginSchema = z.object({
  identifier: z.string().trim().max(255).optional(),
  email: z.string().trim().max(255).optional(),
  password: z
    .string({ error: 'Mật khẩu là bắt buộc' })
    .min(1, 'Mật khẩu không được để trống')
    .max(255, 'Mật khẩu quá dài'),
  portal: z.enum(['student', 'teacher', 'admin', 'staff'], {
    error: 'Cổng đăng nhập không hợp lệ',
  }),
}).refine((data) => Boolean((data.identifier && data.identifier.length > 0) || (data.email && data.email.length > 0)), {
  message: 'Tên đăng nhập hoặc Email là bắt buộc',
  path: ['identifier'],
})

export type LoginInput = z.infer<typeof loginSchema>

export const registerAdminSchema = z.object({
  name: z
    .string({ error: 'Họ và tên là bắt buộc' })
    .trim()
    .min(1, 'Họ và tên không được để trống')
    .max(100, 'Họ và tên tối đa 100 ký tự'),
  email: z
    .string({ error: 'Email là bắt buộc' })
    .trim()
    .email('Email không đúng định dạng')
    .max(255, 'Email tối đa 255 ký tự'),
  password: z
    .string({ error: 'Mật khẩu là bắt buộc' })
    .min(6, 'Mật khẩu phải có ít nhất 6 ký tự')
    .max(100, 'Mật khẩu tối đa 100 ký tự'),
  organizationName: z
    .string({ error: 'Tên trường/tổ chức là bắt buộc' })
    .trim()
    .min(1, 'Tên trường không được để trống')
    .max(150, 'Tên trường tối đa 150 ký tự'),
  apiKey: z
    .string({ error: 'Khóa API đăng ký là bắt buộc' })
    .trim()
    .min(1, 'Khóa API không được để trống')
    .max(255, 'Khóa API không hợp lệ'),
  emailDomain: z
    .string()
    .trim()
    .max(100, 'Tên miền email tối đa 100 ký tự')
    .optional(),
})

export type RegisterAdminInput = z.infer<typeof registerAdminSchema>

export const changePasswordSchema = z.object({
  currentPassword: z
    .string({ error: 'Mật khẩu hiện tại là bắt buộc' })
    .min(1, 'Mật khẩu hiện tại không được để trống')
    .max(255, 'Mật khẩu quá dài'),
  newPassword: z
    .string({ error: 'Mật khẩu mới là bắt buộc' })
    .min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự'),
})

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>

export const resetPasswordSchema = z.object({
  identifier: z
    .string({ error: 'Mã sinh viên hoặc Email là bắt buộc' })
    .trim()
    .min(1, 'Vui lòng nhập thông tin tài khoản')
    .max(255, 'Thông tin tài khoản quá dài'),
  portal: z.enum(['student', 'teacher', 'admin', 'staff'], {
    error: 'Cổng đăng nhập không hợp lệ',
  }),
  newPassword: z
    .string()
    .min(6, 'Mật khẩu mới phải có ít nhất 6 ký tự')
    .max(100, 'Mật khẩu mới tối đa 100 ký tự')
    .optional(),
})

export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>
