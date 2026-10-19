import { NextResponse } from 'next/server'
import { listRecords, manualCheckInStudent, overrideRecordStatus } from '@/lib/attendance/server'
import { getCurrentAuth } from '@/lib/auth/context'
import type { AttendanceStatus } from '@/lib/types/domain'

export async function GET(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('studentId') ?? undefined
  const records = await listRecords(auth, studentId)
  return NextResponse.json({ ok: true, records })
}

export async function POST(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth || (auth.role !== 'teacher' && auth.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { sessionId, studentId, status, note } = body

  if (!sessionId || !studentId || !status) {
    return NextResponse.json({ ok: false, message: 'Missing sessionId, studentId or status' }, { status: 400 })
  }

  const result = await manualCheckInStudent(auth, sessionId, studentId, status as AttendanceStatus, note)
  return NextResponse.json(result)
}

export async function PATCH(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth || (auth.role !== 'teacher' && auth.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { recordId, status, sessionId, studentId, note } = body

  if (!status) {
    return NextResponse.json({ ok: false, message: 'Missing status' }, { status: 400 })
  }

  if (sessionId && studentId) {
    const result = await manualCheckInStudent(auth, sessionId, studentId, status as AttendanceStatus, note)
    return NextResponse.json(result)
  }

  if (typeof recordId === 'string' && recordId.startsWith('unmarked_')) {
    const sId = recordId.replace('unmarked_', '')
    if (sessionId) {
      const result = await manualCheckInStudent(auth, sessionId, sId, status as AttendanceStatus, note)
      return NextResponse.json(result)
    }
  }

  if (!recordId) {
    return NextResponse.json({ ok: false, message: 'Missing recordId or status' }, { status: 400 })
  }

  const result = await overrideRecordStatus(auth, recordId, status as AttendanceStatus, note)
  return NextResponse.json(result)
}
