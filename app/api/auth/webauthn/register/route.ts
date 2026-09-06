import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/context'
import { saveUserPasskey, verifyWebAuthnChallenge } from '@/lib/auth/webauthn'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth()
    const body = await request.json()
    const { credentialId, publicKey, deviceLabel, challenge } = body

    if (!credentialId || !publicKey) {
      return NextResponse.json({ ok: false, message: 'Missing credential information.' }, { status: 400 })
    }

    if (!challenge || !verifyWebAuthnChallenge(auth.userId, challenge)) {
      return NextResponse.json({ ok: false, message: 'Invalid or expired WebAuthn challenge.' }, { status: 400 })
    }

    const passkeyId = await saveUserPasskey(
      auth.userId,
      credentialId,
      publicKey,
      deviceLabel || 'Biometric Device',
    )

    return NextResponse.json({ ok: true, passkeyId })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
