import { NextResponse } from 'next/server'
import { listDepartments, listDevices, listUsers } from '@/lib/attendance/server'
import { getCurrentAuth } from '@/lib/auth/context'

export async function GET(request: Request) {
  const auth = await getCurrentAuth()
  if (!auth) return NextResponse.json({ ok: false }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const kind = searchParams.get('kind')

  if (kind === 'devices') {
    const devices = await listDevices(auth)
    return NextResponse.json({ ok: true, devices })
  }

  if (kind === 'departments') {
    if (auth.role !== 'admin') {
      return NextResponse.json({ ok: false, message: 'Role access denied' }, { status: 403 })
    }
    const departments = await listDepartments(auth)
    return NextResponse.json({ ok: true, departments })
  }

  const role = searchParams.get('role') ?? undefined
  const users = await listUsers(auth, role ?? undefined)
  return NextResponse.json({ ok: true, users })
}
