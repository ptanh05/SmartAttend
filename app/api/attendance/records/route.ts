import { NextResponse } from 'next/server'
import { listRecords } from '@/lib/attendance/server'
import { getCurrentAuth } from '@/lib/auth/context'

export async function GET(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const studentId = searchParams.get('studentId') ?? undefined
  const records = await listRecords(auth, studentId)
  return NextResponse.json({ ok: true, records })
}
