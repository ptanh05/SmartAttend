import { NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { importTeachers, parseTeacherCsv } from '@/lib/auth/users'
import { clientIp, importLimiter } from '@/lib/rate-limit'
import { validateRequestBody, importTeachersSchema, MAX_IMPORT_TEACHER_ROWS } from '@/lib/validation'

/**
 * Imports a lecturer roster.
 *
 * Only administrators may import lecturers — lecturers themselves can no
 * longer create accounts. Every imported lecturer receives the shared default
 * password and must change it on first sign-in.
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

    const validation = await validateRequestBody(request, importTeachersSchema, 'Dữ liệu nhập danh sách giảng viên không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { csv, rows: rawRows } = validation.data
    const rows = Array.isArray(rawRows) && rawRows.length > 0
      ? rawRows
      : parseTeacherCsv(csv ?? '', auth.organizationEmailDomain ?? null)

    if (rows.length === 0) {
      return NextResponse.json({ ok: false, message: 'No lecturer rows found in import.' }, { status: 400 })
    }

    if (rows.length > MAX_IMPORT_TEACHER_ROWS) {
      return NextResponse.json(
        { ok: false, message: `Số lượng bản ghi (${rows.length}) vượt quá giới hạn tối đa ${MAX_IMPORT_TEACHER_ROWS} giảng viên mỗi lần nhập.` },
        { status: 400 },
      )
    }

    const result = await importTeachers(auth, rows)
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    if (error instanceof AuthError) return NextResponse.json({ ok: false, message: error.message }, { status: error.status })
    console.error('Teacher import failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to import lecturers right now.' }, { status: 500 })
  }
}
