import { NextResponse } from 'next/server'
import { getCurrentAuth } from '@/lib/auth/context'
import { addLeaveRequest, getLeaveRequests, updateLeaveRequestStatus } from '@/lib/attendance/leave'
import { validateRequestBody, createLeaveRequestSchema, reviewLeaveRequestSchema } from '@/lib/validation'

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

  const validation = await validateRequestBody(request, createLeaveRequestSchema, 'Dữ liệu xin nghỉ phép không hợp lệ')
  if (!validation.success) {
    return validation.response
  }

  const { courseId, sessionId, date, reason, evidenceNote, attachmentUrl } = validation.data

  try {
    const created = await addLeaveRequest(auth, {
      courseId,
      sessionId,
      date,
      reason,
      evidenceNote,
      attachmentUrl: attachmentUrl || undefined,
    })

    return NextResponse.json({ ok: true, request: created })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể gửi đơn xin nghỉ lúc này.'
    return NextResponse.json({ ok: false, message }, { status: 400 })
  }
}

export async function PATCH(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth || (auth.role !== 'teacher' && auth.role !== 'admin')) {
    return NextResponse.json({ ok: false, message: 'Forbidden' }, { status: 403 })
  }

  const validation = await validateRequestBody(request, reviewLeaveRequestSchema, 'Dữ liệu phê duyệt không hợp lệ')
  if (!validation.success) {
    return validation.response
  }

  const { requestId, status } = validation.data

  const updated = await updateLeaveRequestStatus(auth, requestId, status)
  if (!updated) {
    return NextResponse.json({ ok: false, message: 'Leave request not found' }, { status: 404 })
  }

  return NextResponse.json({ ok: true, request: updated })
}
