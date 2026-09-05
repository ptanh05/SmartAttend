import { NextResponse } from 'next/server'
import { createCourse, listCourses } from '@/lib/attendance/server'
import { AuthError, getCurrentAuth, requireAuth } from '@/lib/auth/context'

export async function GET() {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const courses = await listCourses(auth.organizationId)
    return NextResponse.json({ ok: true, courses })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to load courses.' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const body = await request.json()
    if (!body.code || !body.name || !body.department) {
      return NextResponse.json({ ok: false, message: 'Code, name, and department are required.' }, { status: 400 })
    }
    const result = await createCourse(auth, {
      code: body.code,
      name: body.name,
      department: body.department,
      color: body.color,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to create course.' }, { status: 500 })
  }
}
