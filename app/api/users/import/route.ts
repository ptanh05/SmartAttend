import { NextResponse } from 'next/server'
import { AuthError, requireAuth } from '@/lib/auth/context'
import { importStudents, parseStudentCsv } from '@/lib/auth/users'
import { clientIp, importLimiter } from '@/lib/rate-limit'

export async function POST(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const rateKey = `${clientIp(request)}:${auth.userId}`
    const rate = await importLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many import requests. Please wait a few minutes.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

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
