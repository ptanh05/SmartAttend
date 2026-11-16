import { NextResponse } from 'next/server'
import { z } from 'zod'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { saveUserPasskey, verifyPasskeyRegistration } from '@/lib/auth/webauthn'
import { validateRequestBody } from '@/lib/validation'

const registerPasskeySchema = z.object({
  credentialId: z.string().trim().min(1).max(1024),
  publicKey: z.string().trim().min(1).max(4096),
  challenge: z.string().trim().min(1).max(512),
  clientDataJSON: z.string().trim().min(1).max(8192),
  authenticatorData: z.string().trim().min(1).max(8192),
  deviceLabel: z.string().trim().max(120).optional(),
})

export async function POST(request: Request) {
  try {
    const auth = await requireAuth()
    const validation = await validateRequestBody(request, registerPasskeySchema, 'Dữ liệu đăng ký passkey không hợp lệ')
    if (!validation.success) return validation.response

    const { credentialId, publicKey, challenge, clientDataJSON, authenticatorData, deviceLabel } = validation.data

    const verified = await verifyPasskeyRegistration(auth.userId, {
      credentialId,
      publicKey,
      challenge,
      clientDataJSON,
      authenticatorData,
    })
    if (!verified.ok) {
      return NextResponse.json({ ok: false, message: verified.reason }, { status: 400 })
    }

    // Store the key derived from the authenticator data, never the raw client value.
    const passkeyId = await saveUserPasskey(auth.userId, credentialId, verified.publicKeyPem, deviceLabel || 'Biometric Device')
    return NextResponse.json({ ok: true, passkeyId })
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    }
    const message = error instanceof Error ? error.message : ''
    // Known business conflict from saveUserPasskey; everything else stays generic.
    if (message === 'Credential ID is already registered to another user account.') {
      return NextResponse.json({ ok: false, message }, { status: 409 })
    }
    console.error('Passkey registration failed', message || 'unknown error')
    return NextResponse.json({ ok: false, message: 'Không thể đăng ký passkey lúc này.' }, { status: 500 })
  }
}
