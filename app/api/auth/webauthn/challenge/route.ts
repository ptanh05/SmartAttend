import { NextResponse } from 'next/server'
import { requireAuth } from '@/lib/auth/context'
import { generateWebAuthnChallenge, getUserPasskeys } from '@/lib/auth/webauthn'

export async function GET() {
  try {
    const auth = await requireAuth()
    const challenge = generateWebAuthnChallenge(auth.userId)
    const passkeys = await getUserPasskeys(auth.userId)

    return NextResponse.json({
      ok: true,
      challenge,
      hasEnrolledPasskey: passkeys.length > 0,
      passkeys: passkeys.map((p) => ({
        id: p.id,
        credentialId: p.credentialId,
        deviceLabel: p.deviceLabel,
      })),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate WebAuthn challenge'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}
