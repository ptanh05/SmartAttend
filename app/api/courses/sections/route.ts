import { NextResponse } from 'next/server'
import { createCourseSection, listClassSessions } from '@/lib/attendance/server'
import { AuthError, getCurrentAuth, requireAuth } from '@/lib/auth/context'

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
    const body = await request.json()
    if (!body.courseId || !body.room || !body.startsAt || !body.endsAt) {
      return NextResponse.json({ ok: false, message: 'Course ID, room, start time, and end time are required.' }, { status: 400 })
    }
    const result = await createCourseSection(auth, {
      courseId: body.courseId,
      room: body.room,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      dayOfWeek: typeof body.dayOfWeek === 'number' ? body.dayOfWeek : Number(body.dayOfWeek) || 1,
      autoStart: body.autoStart !== undefined ? Boolean(body.autoStart) : true,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to create section schedule.' }, { status: 500 })
  }
}
