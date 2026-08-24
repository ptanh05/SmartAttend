import { NextResponse } from 'next/server'
import { listRecords, overrideRecordStatus } from '@/lib/attendance/server'
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

export async function PATCH(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth || (auth.role !== 'teacher' && auth.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { recordId, status } = body

  if (!recordId || !status) {
    return NextResponse.json({ ok: false, message: 'Missing recordId or status' }, { status: 400 })
  }

  const result = await overrideRecordStatus(auth, recordId, status as AttendanceStatus)
  return NextResponse.json(result)
}
