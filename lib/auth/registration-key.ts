import { timingSafeEqual } from 'crypto'

export function verifyTeacherRegistrationApiKey(provided: string) {
  const expected = process.env.TEACHER_REGISTRATION_API_KEY?.trim()
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
