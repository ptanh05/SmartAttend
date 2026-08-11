import { NextResponse } from 'next/server'
import { getLiveSessionDetails, getOrCreateLiveSession, listClassSessions } from '@/lib/attendance/server'
import { getCurrentAuth, requireAuth } from '@/lib/auth/context'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  const sessions = await listClassSessions(auth.organizationId)
  const live = auth.role !== 'student' ? await getLiveSessionDetails(auth) : null

  return NextResponse.json({ ok: true, sessions, live })
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const body = await request.json()
    const sectionId = typeof body.sectionId === 'string' ? body.sectionId : ''
    if (!sectionId) return NextResponse.json({ ok: false, message: 'sectionId is required.' }, { status: 400 })

    const sessionId = await getOrCreateLiveSession(auth, sectionId)
    if (!sessionId) return NextResponse.json({ ok: false, message: 'Section not found.' }, { status: 404 })

    return NextResponse.json({ ok: true, sessionId })
  } catch (error) {
    console.error('Create session failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to create session.' }, { status: 500 })
  }
}
