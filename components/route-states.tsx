'use client'

import Link from 'next/link'
import { ArrowLeft, CircleAlert, LockKeyhole, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'

export function RouteState({ kind }: { kind: 'unauthorized' | 'session-expired' | 'account-disabled' | '404' | 'error' }) {
  const content = {
    unauthorized: { title: 'You do not have access', detail: 'This demo area is restricted to the role that owns it.', icon: LockKeyhole, action: 'Return to sign in' },
    'session-expired': { title: 'Your session expired', detail: 'Sign in again to continue this demo session.', icon: RefreshCw, action: 'Sign in again' },
    'account-disabled': { title: 'Account disabled', detail: 'This demo account is disabled. Contact your organization administrator.', icon: LockKeyhole, action: 'Return to sign in' },
    '404': { title: 'Page not found', detail: 'The SmartAttend page you requested does not exist.', icon: CircleAlert, action: 'Go home' },
    error: { title: 'Something went wrong', detail: 'This demo view could not be loaded. Try the action below.', icon: CircleAlert, action: 'Try again' },
  }[kind]
  const Icon = content.icon
  return <main className="grid min-h-screen place-items-center bg-muted/30 p-6"><section className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm"><div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary"><Icon /></div><h1 className="mt-6 text-2xl font-semibold tracking-tight">{content.title}</h1><p className="mt-3 text-sm leading-6 text-muted-foreground">{content.detail}</p><Button className="mt-7" onClick={() => { window.location.href = kind === '404' ? '/' : '/student/login' }}>{content.action}</Button><Link className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/"><ArrowLeft />Back to SmartAttend</Link></section></main>
}
