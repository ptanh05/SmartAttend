import { NextResponse } from 'next/server'
import { getOrganizationMetrics, listSuspicious } from '@/lib/attendance/server'
import { getCurrentAuth } from '@/lib/auth/context'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  const metrics = await getOrganizationMetrics(auth)
  const suspicious = await listSuspicious(auth)
  return NextResponse.json({ ok: true, metrics, suspicious })
}
