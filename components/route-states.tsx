'use client'

import Link from 'next/link'
import { ArrowLeft, CircleAlert, LockKeyhole, RefreshCw } from 'lucide-react'
import { useI18n } from '@/components/i18n-provider'
import { Button } from '@/components/ui/button'

export function RouteState({ kind }: { kind: 'unauthorized' | 'session-expired' | 'account-disabled' | '404' | 'error' }) {
  const { t } = useI18n()

  const content = {
    unauthorized: {
      title: t('routeStates.unauthorizedTitle'),
      detail: t('routeStates.unauthorizedDetail'),
      icon: LockKeyhole,
      action: t('routeStates.returnSignIn'),
    },
    'session-expired': {
      title: t('routeStates.sessionExpiredTitle'),
      detail: t('routeStates.sessionExpiredDetail'),
      icon: RefreshCw,
      action: t('routeStates.signInAgain'),
    },
    'account-disabled': {
      title: t('routeStates.accountDisabledTitle'),
      detail: t('routeStates.accountDisabledDetail'),
      icon: LockKeyhole,
      action: t('routeStates.returnSignIn'),
    },
    '404': {
      title: t('routeStates.notFoundTitle'),
      detail: t('routeStates.notFoundDetail'),
      icon: CircleAlert,
      action: t('routeStates.goHome'),
    },
    error: {
      title: t('routeStates.errorTitle'),
      detail: t('routeStates.errorDetail'),
      icon: CircleAlert,
      action: t('routeStates.tryAgain'),
    },
  }[kind]

  const Icon = content.icon

  return (
    <main className="grid min-h-screen place-items-center bg-muted/30 p-6">
      <section className="w-full max-w-md rounded-2xl border bg-card p-8 text-center shadow-sm">
        <div className="mx-auto grid size-14 place-items-center rounded-2xl bg-primary/10 text-primary">
          <Icon />
        </div>
        <h1 className="mt-6 text-2xl font-semibold tracking-tight">{content.title}</h1>
        <p className="mt-3 text-sm leading-6 text-muted-foreground">{content.detail}</p>
        <Button className="mt-7" onClick={() => { window.location.href = kind === '404' ? '/' : '/student/login' }}>
          {content.action}
        </Button>
        <Link className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground hover:text-foreground" href="/">
          <ArrowLeft />
          {t('routeStates.backHome')}
        </Link>
      </section>
    </main>
  )
}
