import { NextResponse } from 'next/server'
import { rotateChallengeForSession, transitionSessionState } from '@/lib/attendance/server'
import { getCurrentAuth, requireAuth } from '@/lib/auth/context'
import type { SessionStatus } from '@/lib/types/domain'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const { id } = await context.params
    const body = await _request.json().catch(() => ({}))
    const action = body.action as 'start' | 'pause' | 'close' | 'rotate'

    if (action === 'rotate') {
      const result = await rotateChallengeForSession(auth, id)
      return NextResponse.json(result, { status: result.ok ? 200 : 400 })
    }

    const nextStatus: Record<string, SessionStatus> = {
      start: 'live',
      pause: 'paused',
      close: 'closed',
    }

    const status = nextStatus[action]
    if (!status) return NextResponse.json({ ok: false, message: 'Invalid action.' }, { status: 400 })

    const result = await transitionSessionState(auth, id, status)
    return NextResponse.json(result, { status: result.ok ? 200 : 400 })
  } catch (error) {
    console.error('Session action failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to update session.' }, { status: 500 })
  }
}

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
  if (auth.role === 'student') {
    return NextResponse.json({ ok: false, message: 'Role access denied' }, { status: 403 })
  }

  const { getLiveSessionDetails } = await import('@/lib/attendance/server')
  const live = await getLiveSessionDetails(auth)
  return NextResponse.json({ ok: true, live })
}
