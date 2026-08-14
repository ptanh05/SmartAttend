import { NextResponse } from 'next/server'
import { getCurrentAuth } from '@/lib/auth/context'
import { listAuditLogs } from '@/lib/attendance/server'
import { toCsv } from '@/lib/reports/csv'

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/audit
 * Returns organization audit log events as a CSV attachment.
 * Restricted to staff and admin roles.
 */
export async function GET() {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false, message: 'Authentication required.' }, { status: 401 })
    if (!['staff', 'admin'].includes(auth.role)) {
      return NextResponse.json({ ok: false, message: 'Access denied.' }, { status: 403 })
    }

    const events = await listAuditLogs(auth)

    const columns = [
      { header: 'Actor', key: 'actor' },
      { header: 'Action', key: 'action' },
      { header: 'Target', key: 'target' },
      { header: 'Severity', key: 'severity' },
      { header: 'Created At', key: 'createdAt' },
    ]

    const rows = events.map((e) => ({
      actor: e.actor,
      action: e.action,
      target: e.target,
      severity: e.severity,
      createdAt: e.createdAt,
    }))

    const csv = toCsv(columns, rows)
    const timestamp = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="audit-log-${timestamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Audit report export failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to generate audit log report.' }, { status: 500 })
  }
}
