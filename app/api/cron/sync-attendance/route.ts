import { timingSafeEqual } from 'crypto'
import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { organizations } from '@/lib/db/schema'
import { syncScheduledAttendance } from '@/lib/attendance/server'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

function safeCompare(provided: string | null | undefined, expected: string): boolean {
  if (!provided || typeof provided !== 'string') return false
  const bufA = Buffer.from(provided)
  const bufB = Buffer.from(expected)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * Cron trigger for the scheduled attendance pipeline.
 *
 * Responsibilities:
 *  - auto-close attendance sessions that exceeded the 3-minute window
 *  - send the 10-minute advance reminder to enrolled students
 *  - auto-start sessions whose section has `autoStart` enabled
 *
 * Protected by a shared secret (`CRON_SECRET`). When the secret is not
 * configured the endpoint is disabled entirely so it can never be triggered
 * by an anonymous caller in production.
 */
function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET
  if (!secret) return false

  const authHeader = request.headers.get('authorization')
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearer = authHeader.slice(7).trim()
    if (safeCompare(bearer, secret)) return true
  }

  const customHeader = request.headers.get('x-cron-secret')
  return safeCompare(customHeader, secret)
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json(
      { ok: false, message: 'Unauthorized cron request.' },
      { status: 401 },
    )
  }

  try {
    const orgRows = await db().select({ id: organizations.id }).from(organizations)
    const results: Array<{ organizationId: string; ok: boolean; message?: string }> = []

    for (const org of orgRows) {
      await syncScheduledAttendance(org.id)
      results.push({ organizationId: org.id, ok: true })
    }

    return NextResponse.json({ ok: true, organizations: results.length, results })
  } catch (error) {
    console.error('Scheduled attendance sync failed', error)
    return NextResponse.json(
      { ok: false, message: 'Unable to synchronize scheduled attendance right now.' },
      { status: 500 },
    )
  }
}

/**
 * Some schedulers only support POST. The handler is identical to GET.
 */
export async function POST(request: Request) {
  return GET(request)
}
