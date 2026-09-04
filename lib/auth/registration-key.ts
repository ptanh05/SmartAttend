import { timingSafeEqual } from 'crypto'

const FALLBACK_TEACHER_KEY = 'fgBuIL8#GQU%Ql.#;_r^svvdB[hzCjMPNzK@2b4cV%{nvbfd3%'

export function verifyTeacherRegistrationApiKey(provided: string) {
  const expected = process.env.TEACHER_REGISTRATION_API_KEY?.trim() || FALLBACK_TEACHER_KEY
  if (!expected) {
    return { ok: false as const, message: 'Teacher registration is not configured on this server.' }
  }

  const normalized = provided.trim()
  if (!normalized) {
    return { ok: false as const, message: 'Registration API key is required.' }
  }

  const expectedBuffer = Buffer.from(expected)
  const providedBuffer = Buffer.from(normalized)
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    return { ok: false as const, message: 'Invalid registration API key.' }
  }

  return { ok: true as const }
}
