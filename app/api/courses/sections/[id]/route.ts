import { NextResponse } from 'next/server'
import { deleteCourseSection, updateCourseSection } from '@/lib/attendance/server'
import { AuthError, getCurrentAuth } from '@/lib/auth/context'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
    const { id } = await params
    const body = await request.json()
    const result = await updateCourseSection(auth, id, {
      room: body.room,
      startsAt: body.startsAt,
      endsAt: body.endsAt,
      dayOfWeek: body.dayOfWeek !== undefined ? Number(body.dayOfWeek) : undefined,
      autoStart: body.autoStart !== undefined ? Boolean(body.autoStart) : undefined,
      status: body.status,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to update section schedule.' }, { status: 500 })
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
    const { id } = await params
    const result = await deleteCourseSection(auth, id)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to delete section schedule.' }, { status: 500 })
  }
}
