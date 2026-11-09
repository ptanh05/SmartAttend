import { NextResponse } from 'next/server'
import { listRecords, manualCheckInStudent, overrideRecordStatus } from '@/lib/attendance/server'
import { getCurrentAuth, passwordChangePendingResponse } from '@/lib/auth/context'
import type { AttendanceStatus } from '@/lib/types/domain'
import { validateRequestBody, manualCheckInSchema, overrideRecordSchema } from '@/lib/validation'

export async function GET(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  const pending = await passwordChangePendingResponse(auth)
  if (pending) return pending

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

  const pending = await passwordChangePendingResponse(auth)
  if (pending) return pending

  const validation = await validateRequestBody(request, manualCheckInSchema, 'Dữ liệu điểm danh thủ công không hợp lệ')
  if (!validation.success) {
    return validation.response
  }

  const { sessionId, studentId, status, note } = validation.data

  const result = await manualCheckInStudent(auth, sessionId, studentId, status as AttendanceStatus, note)
  return NextResponse.json(result)
}

export async function PATCH(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth || (auth.role !== 'teacher' && auth.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })
  }

  const pending = await passwordChangePendingResponse(auth)
  if (pending) return pending

  const validation = await validateRequestBody(request, overrideRecordSchema, 'Dữ liệu cập nhật điểm danh không hợp lệ')
  if (!validation.success) {
    return validation.response
  }

  const { recordId, status, sessionId, studentId, note } = validation.data

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
