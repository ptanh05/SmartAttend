import { NextResponse } from 'next/server'
import { getCurrentAuth } from '@/lib/auth/context'
import { addLeaveRequest, getLeaveRequests, updateLeaveRequestStatus } from '@/lib/attendance/leave'

export async function GET(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const studentId = auth.role === 'student' ? auth.userId : (searchParams.get('studentId') ?? undefined)
  const requests = await getLeaveRequests(auth, studentId)
  return NextResponse.json({ ok: true, requests })
}

export async function POST(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })

  const body = await request.json()
  const { courseId, sessionId, date, reason, evidenceNote } = body

  if (!courseId || !reason || !date) {
    return NextResponse.json({ ok: false, message: 'Missing required fields' }, { status: 400 })
  }

  const created = await addLeaveRequest(auth, {
    courseId,
    sessionId,
    date,
    reason,
    evidenceNote,
  })

  return NextResponse.json({ ok: true, request: created })
}

export async function PATCH(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth || (auth.role !== 'teacher' && auth.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })
  }

  const body = await request.json()
  const { requestId, status } = body

  if (!requestId || (status !== 'approved' && status !== 'rejected')) {
    return NextResponse.json({ ok: false, message: 'Invalid payload' }, { status: 400 })
  }

  const updated = await updateLeaveRequestStatus(auth, requestId, status)
  if (!updated) {
    return NextResponse.json({ ok: false, message: 'Leave request not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, request: updated })
}
