import { createHmac } from 'crypto'

/**
 * Purpose-separated server keys.
 *
 * One root secret (`SESSION_SECRET`) is expanded into an independent HMAC key
 * per purpose, so a MAC produced for one protocol (e.g. an acoustic proof) can
 * never be replayed as a MAC of another (e.g. a WebAuthn challenge), even if
 * their payload formats happened to collide.
 *
 *   key(purpose) = HMAC-SHA256(rootSecret, "smartattend:key:v1:" + purpose)
 *
 * Root secret resolution (unchanged for backward compatibility):
 *   SESSION_SECRET → TEACHER_REGISTRATION_API_KEY (legacy fallback, discouraged)
 *   → development-only constant. Production without either variable throws.
 */
export type SecretPurpose = 'attendance-challenge' | 'webauthn-challenge' | 'acoustic-proof'

const DEV_ROOT_SECRET = 'smartattend-development-only-root-secret'

export function getRootSecret(): string {
  const secret = process.env.SESSION_SECRET?.trim() || process.env.TEACHER_REGISTRATION_API_KEY?.trim()
  if (secret) return secret
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FATAL: SESSION_SECRET environment variable is required in production.')
  }
  return DEV_ROOT_SECRET
}

/** Whether the legacy fallback (registration API key reused as root secret) is in effect. */
export function isUsingLegacySecretFallback(): boolean {
  return !process.env.SESSION_SECRET?.trim() && Boolean(process.env.TEACHER_REGISTRATION_API_KEY?.trim())
}

export function purposeKey(purpose: SecretPurpose): Buffer {
  return createHmac('sha256', getRootSecret()).update(`smartattend:key:v1:${purpose}`).digest()
}

export function hmacFor(purpose: SecretPurpose, data: string): Buffer {
  return createHmac('sha256', purposeKey(purpose)).update(data).digest()
}
