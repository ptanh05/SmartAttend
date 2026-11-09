import { NextResponse } from 'next/server'
import { rotateChallengeForSession, transitionSessionState } from '@/lib/attendance/server'
import { getCurrentAuth, requireAuth, passwordChangePendingResponse } from '@/lib/auth/context'
import { clientIp, sessionActionLimiter } from '@/lib/rate-limit'
import type { SessionStatus } from '@/lib/types/domain'
import { validateRequestBody, sessionActionSchema } from '@/lib/validation'

type RouteContext = { params: Promise<{ id: string }> }

export async function POST(_request: Request, context: RouteContext) {
  try {
    const auth = await requireAuth(['teacher', 'admin'])
    const rateKey = `${clientIp(_request)}:${auth.userId}`
    const rate = await sessionActionLimiter.consume(rateKey)
    if (!rate.ok) {
      return NextResponse.json(
        { ok: false, message: 'Too many session actions. Please slow down.' },
        { status: 429, headers: { 'Retry-After': String(rate.retryAfterSeconds) } },
      )
    }

    const { id } = await context.params
    const validation = await validateRequestBody(_request, sessionActionSchema, 'Hành động điều khiển phiên không hợp lệ')
    if (!validation.success) {
      return validation.response
    }

    const { action } = validation.data

    if (action === 'rotate') {
      const result = await rotateChallengeForSession(auth, id)
      const status = result.ok ? 200 : result.message?.includes('Forbidden') ? 403 : 400
      return NextResponse.json(result, { status })
    }

    const nextStatus: Record<string, SessionStatus> = {
      start: 'live',
      pause: 'paused',
      close: 'closed',
    }

    const status = nextStatus[action]
    if (!status) return NextResponse.json({ ok: false, message: 'Invalid action.' }, { status: 400 })

    const result = await transitionSessionState(auth, id, status)
    const statusCode = result.ok ? 200 : result.message?.includes('Forbidden') ? 403 : 400
    return NextResponse.json(result, { status: statusCode })
  } catch (error) {
    console.error('Session action failed', error)
    return NextResponse.json({ ok: false, message: 'Unable to update session.' }, { status: 500 })
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })
  if (auth.role === 'student') {
    return NextResponse.json({ ok: false, message: 'Role access denied' }, { status: 403 })
  }

  const pending = await passwordChangePendingResponse(auth)
  if (pending) return pending

  const { id } = await context.params
  const { getLiveSessionDetails } = await import('@/lib/attendance/server')
  const live = await getLiveSessionDetails(auth, id)
  if (!live) {
    return NextResponse.json({ ok: false, message: 'Session not found or access denied.' }, { status: 404 })
  }
  return NextResponse.json({ ok: true, live })
}
