import { NextResponse } from 'next/server'
import { getCurrentAuth } from '@/lib/auth/context'
import { getCourseAttendanceSummary, listReportRecords } from '@/lib/attendance/server'
import { attendanceRate, attendanceSummary, toCsv } from '@/lib/reports/csv'

export const dynamic = 'force-dynamic'

/**
 * GET /api/reports/attendance
 * Returns attendance as a CSV attachment, scoped to the authenticated user's
 * organization. Query params:
 *  - `courseId`  filter to a single course
 *  - `scope`     `summary` (default, per student) or `detail` (row per record)
 *  - `format`    `json` (returns structured JSON for printable PDF view)
 */
export async function GET(request: Request) {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false, message: 'Authentication required.' }, { status: 401 })
    if (!['teacher', 'staff', 'admin'].includes(auth.role)) {
      return NextResponse.json({ ok: false, message: 'Access denied.' }, { status: 403 })
    }

    const { searchParams } = new URL(request.url)
    const courseId = searchParams.get('courseId') ?? undefined
    const scope = searchParams.get('scope') === 'detail' ? 'detail' : 'summary'
    const format = searchParams.get('format')

    if (format === 'json') {
      if (courseId) {
        const summary = await getCourseAttendanceSummary(auth, courseId)
        return NextResponse.json({ ok: true, ...summary })
      }
      const records = await listReportRecords(auth)
      return NextResponse.json({ ok: true, records })
    }

    const records = await listReportRecords(auth, courseId)

    if (scope === 'detail') {
      const detailColumns = [
        { header: 'Student', key: 'student' },
        { header: 'Email', key: 'email' },
        { header: 'Course', key: 'course' },
        { header: 'Room', key: 'room' },
        { header: 'Status', key: 'status' },
        { header: 'Score', key: 'score' },
        { header: 'Verified', key: 'verified' },
        { header: 'Device', key: 'device' },
      ]
      const detailRows = records.map((r) => ({
        student: r.studentName,
        email: r.studentEmail,
        course: `${r.courseCode} · ${r.courseName}`,
        room: r.room,
        status: r.status,
        score: r.score,
        verified: r.verifiedAt ?? '',
        device: r.device,
      }))
      const csv = toCsv(detailColumns, detailRows)
      const ts = new Date().toISOString().slice(0, 10)
      const suffix = courseId ? `-course-${courseId}` : '-all'
      return new NextResponse(csv, {
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': `attachment; filename="attendance-detail${suffix}-${ts}.csv"`,
          'Cache-Control': 'no-store',
        },
      })
    }

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
      { header: 'Absent (Unexcused)', key: 'absent' },
      { header: 'Excused', key: 'excused' },
      { header: 'Attendance rate (%)', key: 'rate' },
      { header: 'Exam Eligibility', key: 'eligibility' },
    ]

    const rows = [...byStudent.values()].map((student) => {
      const summary = attendanceSummary(student.items)
      const unexcused = summary.absent ?? 0
      const total = student.items.length
      const rate = attendanceRate(student.items)
      const isDisqualified = unexcused >= 3 || (total >= 5 && unexcused / total > 0.2)
      const isWarning = !isDisqualified && (unexcused === 2 || (total >= 5 && unexcused / total >= 0.15))
      const eligibility = isDisqualified ? 'CẤM THI' : isWarning ? 'NGUY CƠ CẤM THI' : 'ĐỦ ĐIỀU KIỆN'

      return {
        name: student.name,
        email: student.email,
        present: summary.present ?? 0,
        late: summary.late ?? 0,
        absent: unexcused,
        excused: summary.excused ?? 0,
        rate,
        eligibility,
      }
    })

    const csv = toCsv(columns, rows)
    const timestamp = new Date().toISOString().slice(0, 10)
    const suffix = courseId ? `-course-${courseId}` : '-all'

    return new NextResponse(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="attendance-report${suffix}-${timestamp}.csv"`,
        'Cache-Control': 'no-store',
      },
    })
  } catch (error) {
    console.error('Report export failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to generate the report.' }, { status: 500 })
  }
}