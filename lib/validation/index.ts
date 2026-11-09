import { z, ZodError, type ZodSchema } from 'zod'
import { NextResponse } from 'next/server'

// Legacy validation helpers (kept for 100% backward compatibility)
export function requiredText(value: unknown, field: string) {
  if (typeof value !== 'string' || value.trim().length === 0) throw new Error(`${field} is required`)
  return value.trim()
}

export function challengeCode(value: unknown) {
  const code = requiredText(value, 'Challenge code').toUpperCase()
  if (!/^[A-Z0-9]{6}$/.test(code)) throw new Error('Challenge code must contain 6 letters or numbers')
  return code
}

export function positiveInteger(value: unknown, field: string) {
  const number = Number(value)
  if (!Number.isInteger(number) || number <= 0) throw new Error(`${field} must be a positive integer`)
  return number
}

// Zod-based standardized validation engine
export type ValidationErrorItem = {
  field: string
  message: string
}

export type ValidationSuccess<T> = {
  success: true
  data: T
}

export type ValidationFailure = {
  success: false
  response: NextResponse
  errors: ValidationErrorItem[]
  message: string
}

export type ValidationResult<T> = ValidationSuccess<T> | ValidationFailure

/**
 * Converts Zod issues into a standardized field-message list.
 */
export function formatZodErrors(error: ZodError): ValidationErrorItem[] {
  return error.issues.map((issue) => ({
    field: issue.path.join('.') || 'root',
    message: issue.message,
  }))
}

/**
 * Parses and validates request body with a Zod schema.
 * Returns either validated data or a ready-to-return 400 NextResponse.
 */
export async function validateRequestBody<T>(
  request: Request,
  schema: ZodSchema<T>,
  customDefaultMessage = 'Dữ liệu đầu vào không hợp lệ',
): Promise<ValidationResult<T>> {
  try {
    const json = await request.json().catch(() => null)
    if (json === null || typeof json !== 'object') {
      const errors: ValidationErrorItem[] = [{ field: 'body', message: 'Nội dung yêu cầu phải là JSON hợp lệ' }]
      return {
        success: false,
        message: customDefaultMessage,
        errors,
        response: NextResponse.json(
          { ok: false, message: customDefaultMessage, errors },
          { status: 400 },
        ),
      }
    }

    const parsed = schema.safeParse(json)
    if (!parsed.success) {
      const errors = formatZodErrors(parsed.error)
      const message = errors[0]?.message ?? customDefaultMessage
      return {
        success: false,
        message,
        errors,
        response: NextResponse.json(
          { ok: false, message, errors },
          { status: 400 },
        ),
      }
    }

    return { success: true, data: parsed.data }
  } catch {
    const errors: ValidationErrorItem[] = [{ field: 'body', message: 'Không thể phân tích dữ liệu JSON' }]
    return {
      success: false,
      message: customDefaultMessage,
      errors,
      response: NextResponse.json(
        { ok: false, message: customDefaultMessage, errors },
        { status: 400 },
      ),
    }
  }
}

// Re-export all schemas and types
export * from './schemas/auth.schema'
export * from './schemas/attendance.schema'
export * from './schemas/user.schema'
export * from './schemas/import.schema'
export * from './schemas/leave.schema'
export * from './schemas/class.schema'
