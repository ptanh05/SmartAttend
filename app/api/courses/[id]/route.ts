import { NextResponse } from 'next/server'
import { updateCourseTeacher } from '@/lib/attendance/server'
import { AuthError, requireAuth } from '@/lib/auth/context'

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAuth('admin')
    const { id } = await context.params
    const body = await request.json() as { teacherId?: string }
    if (!body.teacherId) return NextResponse.json({ ok: false, message: 'Giảng viên là bắt buộc.' }, { status: 400 })
    return NextResponse.json(await updateCourseTeacher(auth, id, body.teacherId))
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Không thể phân công môn học.' }, { status: 500 })
  }
}
