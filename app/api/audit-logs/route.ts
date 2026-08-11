import { NextResponse } from 'next/server'
import { listAuditLogs } from '@/lib/attendance/server'
import { requireAuth } from '@/lib/auth/context'

export async function GET() {
  try {
    const auth = await requireAuth('admin')
    const events = await listAuditLogs(auth)
    return NextResponse.json({ ok: true, events })
  } catch {
    return NextResponse.json({ ok: false }, { status: 403 })
  }
}
