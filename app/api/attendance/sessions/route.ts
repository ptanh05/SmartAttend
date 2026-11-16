import { NextResponse } from 'next/server'
import { classSessionScopeFor, getLiveSessionDetails, getOrCreateLiveSession, listClassSessions } from '@/lib/attendance/server'
import { getCurrentAuth, requireAuth, passwordChangePendingResponse } from '@/lib/auth/context'
import { validateRequestBody, createLiveSessionSchema } from '@/lib/validation'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  const pending = await passwordChangePendingResponse(auth)
  if (pending) return pending

  const sessions = await listClassSessions(...classSessionScopeFor(auth))
  const live = auth.role !== 'student' ? await getLiveSessionDetails(auth) : null

  return NextResponse.json({ ok: true, sessions, live })
}

export async function PUT(request: Request) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const validation = await validateRequestBody(request, createLiveSessionSchema, 'Dữ liệu tạo phiên không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { sectionId } = validation.data

    const sessionId = await getOrCreateLiveSession(auth, sectionId)
    if (!sessionId) return NextResponse.json({ ok: false, message: 'Section not found.' }, { status: 404 })

    return NextResponse.json({ ok: true, sessionId })
  } catch (error) {
    console.error('Create session failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to create session.' }, { status: 500 })
  }
}
