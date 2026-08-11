import { NextResponse } from 'next/server'
import { getCurrentAuth } from '@/lib/auth/context'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  return NextResponse.json({
    ok: true,
    user: {
      id: auth.userId,
      name: auth.name,
      email: auth.email,
      role: auth.role,
      initials: auth.initials,
      department: auth.department,
      organizationId: auth.organizationId,
    },
    organization: {
      id: auth.organizationId,
      name: auth.organizationName,
      plan: auth.organizationPlan,
    },
  })
}
