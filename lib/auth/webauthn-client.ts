/**
 * Client-side WebAuthn (Passkeys / Face ID / Touch ID / Windows Hello) Helpers
 */

export async function isPlatformBiometricsAvailable(): Promise<boolean> {
  if (typeof window === 'undefined' || !window.PublicKeyCredential) {
    return false
  }
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
  } catch {
    return false
  }
}

export function bufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

export function base64UrlToUint8Array(base64url: string): Uint8Array {
  const padding = '='.repeat((4 - (base64url.length % 4)) % 4)
  const base64 = (base64url + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const outputArray = new Uint8Array(rawData.length)
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i)
  }
  return outputArray
}

export function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

export function spkiDerToPem(spkiDer: ArrayBuffer): string {
  const b64 = bufferToBase64(spkiDer)
  const lines = b64.match(/.{1,64}/g) || [b64]
  return `-----BEGIN PUBLIC KEY-----\n${lines.join('\n')}\n-----END PUBLIC KEY-----\n`
}

/** Double-submit CSRF header required by proxy.ts for every API mutation. */
function csrfHeaders(): Record<string, string> {
  if (typeof document === 'undefined') return {}
  const match = document.cookie.split('; ').find((row) => row.startsWith('smartattend_csrf='))
  const token = match?.split('=')[1]
  return token ? { 'x-csrf-token': decodeURIComponent(token) } : {}
}

export type BiometricAuthResult = {
  ok: boolean
  credentialId?: string
  assertion?: {
    credentialId: string
    clientDataJSON: string
    authenticatorData: string
    signature: string
    challenge: string
  }
  error?: string
}

/**
 * Triggers Face ID / Touch ID / Windows Hello prompt to authenticate the user for attendance.
 */
export async function authenticateWithBiometrics(
  userId: string,
  userEmail: string,
  challengeString: string,
): Promise<BiometricAuthResult> {
  if (typeof window === 'undefined' || !navigator.credentials?.get) {
    return { ok: false, error: 'WebAuthn not supported on this browser' }
  }

  try {
    const challengeBytes = base64UrlToUint8Array(challengeString)
    const credential = (await navigator.credentials.get({
      publicKey: {
        challenge: challengeBytes,
        rpId: window.location.hostname,
        userVerification: 'required',
        timeout: 45000,
      },
    })) as (PublicKeyCredential & { response: AuthenticatorAssertionResponse }) | null

    if (!credential) {
      return { ok: false, error: 'No credential returned' }
    }

    const assertion = {
      credentialId: credential.id,
      clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
      authenticatorData: bufferToBase64Url(credential.response.authenticatorData),
      signature: bufferToBase64Url(credential.response.signature),
      challenge: challengeString,
    }

    return {
      ok: true,
      credentialId: credential.id,
      assertion,
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

/**
 * Enrolls the device's native Face ID / Touch ID for the current student.
 */
export async function registerDeviceBiometrics(
  userId: string,
  userName: string,
  userEmail: string,
  challengeString: string,
): Promise<BiometricAuthResult> {
  if (typeof window === 'undefined' || !navigator.credentials?.create) {
    return { ok: false, error: 'WebAuthn not supported on this browser' }
  }

  try {
    const challengeBytes = base64UrlToUint8Array(challengeString)
    const userBytes = new TextEncoder().encode(userId)

    const credential = (await navigator.credentials.create({
      publicKey: {
        challenge: challengeBytes,
        rp: {
          name: 'SmartAttend - Đại học GTVT',
          id: window.location.hostname,
        },
        user: {
          id: userBytes,
          name: userEmail,
          displayName: userName,
        },
        pubKeyCredParams: [
          { alg: -7, type: 'public-key' }, // ES256
          { alg: -257, type: 'public-key' }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // Native Face ID, Touch ID, Windows Hello
          userVerification: 'required',
          residentKey: 'preferred',
        },
        timeout: 60000,
        attestation: 'none',
      },
    })) as (PublicKeyCredential & {
      response: AuthenticatorAttestationResponse & { getPublicKey?: () => ArrayBuffer | null }
    }) | null

    if (!credential) {
      return { ok: false, error: 'Failed to create biometric credential' }
    }

    let publicKeyPem = ''
    if (typeof credential.response.getPublicKey === 'function') {
      const spkiDer = credential.response.getPublicKey()
      if (spkiDer) {
        publicKeyPem = spkiDerToPem(spkiDer)
      }
    }

    // Fail closed: without the SPKI public key and authenticator data the
    // server cannot verify this credential, so it must not be registered.
    const response = credential.response as AuthenticatorAttestationResponse & {
      getAuthenticatorData?: () => ArrayBuffer
    }
    const authenticatorData =
      typeof response.getAuthenticatorData === 'function' ? response.getAuthenticatorData() : null
    if (!publicKeyPem || !authenticatorData) {
      return { ok: false, error: 'Trình duyệt này không hỗ trợ đăng ký passkey an toàn. Vui lòng cập nhật trình duyệt.' }
    }

    // Register credential on server
    const res = await fetch('/api/auth/webauthn/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...csrfHeaders() },
      body: JSON.stringify({
        credentialId: credential.id,
        publicKey: publicKeyPem,
        challenge: challengeString,
        clientDataJSON: bufferToBase64Url(credential.response.clientDataJSON),
        authenticatorData: bufferToBase64Url(authenticatorData),
        deviceLabel: navigator.userAgent.includes('iPhone')
          ? 'Apple iPhone (Face ID)'
          : navigator.userAgent.includes('Macintosh')
            ? 'Apple Mac (Touch ID)'
            : navigator.userAgent.includes('Android')
              ? 'Android Phone (Biometrics)'
              : 'Windows / PC (Windows Hello)',
      }),
    })

    if (!res.ok) {
      const data = await res.json()
      return { ok: false, error: data.message || 'Server registration failed' }
    }

    return { ok: true, credentialId: credential.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
