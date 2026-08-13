import { NextResponse } from 'next/server'
import { getCurrentAuth } from '@/lib/auth/context'
import { listReportRecords } from '@/lib/attendance/server'
import { attendanceRate, attendanceSummary, toCsv } from '@/lib/reports/csv'

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/attendance
 * Returns a per-student attendance summary as a CSV attachment, scoped to the
 * authenticated user's organization.
 */
export async function GET() {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false, message: 'Authentication required.' }, { status: 401 })

    const records = await listReportRecords(auth)

    const byStudent = new Map<string, { name: string; email: string; items: Array<{ status: string }> }>()
    for (const record of records) {
      const key = record.studentEmail || record.studentName
      const existing = byStudent.get(key)
      if (existing) {
        existing.items.push({ status: record.status })
      } else {
        byStudent.set(key, { name: record.studentName, email: record.studentEmail, items: [{ status: record.status }] })
      }
    }

    const columns = [
      { header: 'Student', key: 'name' },
      { header: 'Email', key: 'email' },
      { header: 'Present', key: 'present' },
      { header: 'Late', key: 'late' },
      { header: 'Absent', key: 'absent' },
      { header: 'Pending', key: 'pending' },
      { header: 'Flagged', key: 'flagged' },
      { header: 'Attendance rate (%)', key: 'rate' },
    ]

    const rows = [...byStudent.values()].map((student) => {
      const summary = attendanceSummary(student.items)
      return {
        name: student.name,
        email: student.email,
        present: summary.present ?? 0,
        late: summary.late ?? 0,
        absent: summary.absent ?? 0,
        pending: summary.pending ?? 0,
        flagged: summary.flagged ?? 0,
        rate: attendanceRate(student.items),
      }
    })

    const csv = toCsv(columns, rows)
    const timestamp = new Date().toISOString().slice(0, 10)

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance-report-${timestamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Report export failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to generate the report.' }, { status: 500 })
  }
}