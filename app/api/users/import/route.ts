import { NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { importStudents, parseStudentCsv } from '@/lib/auth/users'
import { clientIp, importLimiter } from '@/lib/rate-limit'
import { validateRequestBody, importStudentsSchema } from '@/lib/validation'

/**
 * Imports a student roster.
 *
 * Only administrators may import students — lecturers receive their students
 * from the organization's roster, they do not create accounts themselves.
 */
export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['admin'])
    const rateKey = `${clientIp(request)}:${auth.userId}`
    const rate = await importLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many import requests. Please wait a few minutes.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    const validation = await validateRequestBody(request, importStudentsSchema, 'Dữ liệu nhập danh sách sinh viên không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { csv, rows: rawRows, sectionId } = validation.data
    const rows = rawRows && rawRows.length > 0 ? rawRows : parseStudentCsv(csv ?? '')

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: 'No student rows found in import.' }, { status: 400 })
    }

    const result = await importStudents(auth, rows, { sectionId: sectionId || undefined })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    console.error('Student import failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to import students right now.' }, { status: 500 })
  }
}
