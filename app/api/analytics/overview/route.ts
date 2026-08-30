import { NextResponse } from 'next/server'
import { getOrganizationMetrics, listSuspicious } from '@/lib/attendance/server'
import { getCurrentAuth } from '@/lib/auth/context'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })

  if (auth.role !== 'teacher' && auth.role !== 'admin') {
    return NextResponse.json({ ok: false, message: 'Role access denied' }, { status: 403 })
  }

  const metrics = await getOrganizationMetrics(auth)
  const suspicious = await listSuspicious(auth)
  return NextResponse.json({ ok: true, metrics, suspicious })
}
