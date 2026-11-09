import { NextResponse } from 'next/server'
import { createCourse, listCourses } from '@/lib/attendance/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { validateRequestBody, createCourseSchema } from '@/lib/validation'

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
    const validation = await validateRequestBody(request, createCourseSchema, 'Dữ liệu khóa học không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { code, name, department, color } = validation.data
    const result = await createCourse(auth, {
      code,
      name,
      department,
      color,
    })
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to create course.' }, { status: 500 })
  }
}
