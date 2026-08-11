import { NextResponse } from 'next/server'
import { listCourses } from '@/lib/attendance/server'
import { AuthError, getCurrentAuth } from '@/lib/auth/context'

export async function GET() {
  try {
    const auth = await getCurrentAuth()
    if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
    const courses = await listCourses(auth.organizationId)
    return NextResponse.json({ ok: true, courses })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to load courses.' }, { status: 500 })
  }
}
