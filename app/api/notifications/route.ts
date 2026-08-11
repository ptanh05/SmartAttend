import { NextResponse } from 'next/server'
import { listNotifications, markNotificationsRead } from '@/lib/attendance/server'
import { getCurrentAuth } from '@/lib/auth/context'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
  const notifications = await listNotifications(auth)
  return NextResponse.json({ ok: true, notifications })
}

export async function POST(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
  const body = await request.json().catch(() => ({}))
  await markNotificationsRead(auth, Array.isArray(body.ids) ? body.ids : undefined)
  return NextResponse.json({ ok: true })
}
