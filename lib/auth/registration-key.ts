import { timingSafeEqual } from 'crypto'

/**
 * Verifies the registration API key required to create an administrator
 * account. The environment variable keeps its historical name for backward
 * compatibility with existing deployments.
 */
export function verifyTeacherRegistrationApiKey(provided: string) {
  const expected = process.env.TEACHER_REGISTRATION_API_KEY?.trim()
  if (!expected) {
    return { ok: false as const, message: 'Administrator registration is not configured on this server.' }
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
