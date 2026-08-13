import { NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { importStudents, parseStudentCsv } from '@/lib/auth/users'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const body = await request.json()
    const csv = typeof body.csv === 'string' ? body.csv : ''
    const rows = Array.isArray(body.rows) ? body.rows : parseStudentCsv(csv)

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: 'No student rows found in import.' }, { status: 400 })
    }

    const result = await importStudents(auth, rows)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    console.error('Student import failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to import students right now.' }, { status: 500 })
  }
}
