import { NextResponse } from 'next/server'
import {
  enrollStudentsToSection,
  listSectionStudents,
  removeStudentFromSection,
  searchAvailableStudentsForSection,
} from '@/lib/attendance/server'
import { AuthError, requireAuth } from '@/lib/auth/context'

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const { id } = await params
    const { searchParams } = new URL(request.url)
    const search = searchParams.get('search')

    if (search !== null) {
      const availableStudents = await searchAvailableStudentsForSection(auth, id, search)
      return NextResponse.json({ ok: true, availableStudents })
    }

    const students = await listSectionStudents(auth, id)
    return NextResponse.json({ ok: true, students })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to load section students.' }, { status: 500 })
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const { id } = await params
    const body = await request.json()

    const rawIdentifiers: unknown[] = Array.isArray(body.studentIds)
      ? body.studentIds
      : Array.isArray(body.studentCodes)
        ? body.studentCodes
        : typeof body.studentId === 'string'
          ? [body.studentId]
          : typeof body.studentCode === 'string'
            ? [body.studentCode]
            : []

    const identifiers = rawIdentifiers.filter((i): i is string => typeof i === 'string' && Boolean(i.trim()))
    if (identifiers.length === 0) {
      return NextResponse.json({ ok: false, message: 'Vui lòng cung cấp mã sinh viên hoặc ID sinh viên.' }, { status: 400 })
    }

    const result = await enrollStudentsToSection(auth, id, identifiers)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to enroll students to section.' }, { status: 500 })
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const { id } = await params
    const body = await request.json()
    const studentId = typeof body.studentId === 'string' ? body.studentId.trim() : ''

    if (!studentId) {
      return NextResponse.json({ ok: false, message: 'studentId is required.' }, { status: 400 })
    }

    const result = await removeStudentFromSection(auth, id, studentId)
    return NextResponse.json(result)
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    return NextResponse.json({ ok: false, message: 'Unable to remove student from section.' }, { status: 500 })
  }
}
