import { NextResponse } from 'next/server'
import { createCourseSection, listClassSessions } from '@/lib/attendance/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { validateRequestBody, createSectionSchema } from '@/lib/validation'

export async function GET() {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const sections = await listClassSessions(auth.organizationId)
    return NextResponse.json({ ok: true, sections })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to load sections.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const validation = await validateRequestBody(request, createSectionSchema, 'Dữ liệu lớp học phần không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { courseId, room, startsAt, endsAt, dayOfWeek, autoStart } = validation.data
    const result = await createCourseSection(auth, {
      courseId,
      room,
      startsAt,
      endsAt,
      dayOfWeek,
      autoStart,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to create section schedule.' }, { status: 500 })
  }
}
