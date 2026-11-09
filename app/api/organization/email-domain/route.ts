import { NextResponse } from 'next/server'
import { eq } from 'drizzle-orm'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { normalizeEmailDomain } from '@/lib/auth/default-credentials'
import { validateRequestBody, updateEmailDomainSchema } from '@/lib/validation'

/**
 * Updates the institution's email domain.
 *
 * The domain is used to validate lecturer addresses when an administrator
 * imports a lecturer roster.
 */
export async function PATCH(request: Request) {
  try {
    const auth = await requireAuth(['admin'])

    const validation = await validateRequestBody(request, updateEmailDomainSchema, 'Dữ liệu tên miền không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const raw = validation.data.emailDomain ?? ''
    const domain = raw.trim() ? normalizeEmailDomain(raw) : null

    if (raw.trim() && !domain) {
      return NextResponse.json({ ok: false, message: 'Email domain is not valid.' }, { status: 400 })
    }

    await db()
      .update(organizations)
      .set({ emailDomain: domain })
      .where(eq(organizations.id, auth.organizationId))

    return NextResponse.json({ ok: true, emailDomain: domain })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    console.error('Failed to update organization email domain', error)
    return NextResponse.json({ ok: false, message: 'Unable to update the email domain right now.' }, { status: 500 })
  }
}
