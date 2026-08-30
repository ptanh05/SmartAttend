'use client'

import React, { useState } from 'react'
import {
  Activity,
  BarChart3,
  CircleAlert,
  GraduationCap,
  ShieldCheck,
  Smartphone,
  Users,
} from 'lucide-react'
import { useI18n } from '@/components/i18n-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import {
  Button,
  Logo,
  PasswordInput,
  Status,
} from '@/components/smart-attend-ui'
import { api } from '@/lib/api/client'
import type { Role } from '@/lib/types/domain'

export function PublicLanding({ onSelect }: { onSelect: (portal: 'student' | 'staff') => void }) {
  const { t } = useI18n()
  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-5 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" onClick={() => onSelect('student')}>{t('landing.studentPortal')}</Button>
          <Button variant="outline" onClick={() => onSelect('staff')}>{t('landing.staffPortal')}</Button>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
        <div>
          <Status>{t('landing.trustedBy')}</Status>
          <h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">{t('landing.heroTitle')}</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{t('landing.heroDetail')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => onSelect('student')}><GraduationCap />{t('landing.studentPortal')}</Button>
            <Button variant="outline" onClick={() => onSelect('staff')}><Users />{t('landing.staffPortal')}</Button>
          </div>
          <div className="mt-8 flex flex-wrap gap-5 text-sm text-muted-foreground">
            <span><ShieldCheck className="mr-2 inline size-4 text-primary" />{t('landing.sessionVerified')}</span>
            <span><Smartphone className="mr-2 inline size-4 text-primary" />{t('landing.deviceAware')}</span>
            <span><Activity className="mr-2 inline size-4 text-primary" />{t('landing.liveInsights')}</span>
          </div>
        </div>
        <div className="rounded-3xl border bg-muted/40 p-5 shadow-sm sm:p-8">
          <div className="rounded-2xl border bg-card p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground">{t('landing.todaysAttendance')}</p>
                <p className="mt-2 text-4xl font-semibold">—</p>
              </div>
              <div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary">
                <BarChart3 />
              </div>
            </div>
            <div className="mt-8 flex h-36 items-end gap-2">
              {[38, 56, 48, 72, 67, 82, 78, 94, 86, 91].map((height, index) => (
                <div key={index} className="flex-1 rounded-t bg-primary/80" style={{ height: `${height}%` }} />
              ))}
            </div>
            <div className="mt-6 flex items-center justify-between border-t pt-4 text-sm">
              <span className="text-muted-foreground">{t('common.activeSession')}</span>
              <Status>{t('common.liveNow')}</Status>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}

export function ChangePasswordForm({
  forced = false,
  onSuccess,
  onCancel,
}: {
  forced?: boolean
  onSuccess: () => void
  onCancel?: () => void
}) {
  const { t } = useI18n()
  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setError('')
    if (newPassword !== confirmPassword) {
      setError(t('auth.passwordMismatch'))
      return
    }
    setLoading(true)
    try {
      await api.changePassword(currentPassword, newPassword)
      onSuccess()
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.changePasswordFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      {forced && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          {t('auth.mustChangePasswordDetail')}
        </div>
      )}
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('auth.currentPassword')}
        <PasswordInput
          value={currentPassword}
          onChange={setCurrentPassword}
          inputClassName="h-11"
          autoComplete="current-password"
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('auth.newPassword')}
        <PasswordInput
          value={newPassword}
          onChange={setNewPassword}
          inputClassName="h-11"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      <label className="flex flex-col gap-2 text-sm font-medium">
        {t('auth.confirmPassword')}
        <PasswordInput
          value={confirmPassword}
          onChange={setConfirmPassword}
          inputClassName="h-11"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </label>
      {error && (
        <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
          {error}
        </div>
      )}
      <div className="flex gap-2">
        <Button type="submit" className="flex-1">{loading ? t('auth.savingPassword') : t('auth.savePassword')}</Button>
        {!forced && onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>{t('common.back')}</Button>
        )}
      </div>
    </form>
  )
}

export function LoginScreen({
  portal,
  onLogin,
  onSwitch,
  onRegister,
  onHome,
  organizationName,
}: {
  portal: 'student' | 'staff'
  onLogin: (role: Role, mustChangePassword?: boolean) => void
  onSwitch: () => void
  onRegister: () => void
  onHome: () => void
  organizationName: string
}) {
  const { t } = useI18n()
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api.login(identifier, password, portal)
      if (!result.ok || !result.role) {
        setError(result.message ?? t('common.signInFailed'))
        return
      }
      onLogin(result.role, result.mustChangePassword)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.signInFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <div className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between">
        <Logo onClick={onHome} />
        <div className="max-w-md">
          <p className="mb-5 text-sm font-medium uppercase tracking-[0.18em] text-primary-foreground/70">
            {portal === 'student' ? t('login.studentPortal') : t('login.staffPortal')}
          </p>
          <h1 className="text-5xl font-semibold leading-tight tracking-tight">{t('login.heroTitle')}</h1>
          <p className="mt-6 text-lg leading-8 text-primary-foreground/75">{t('login.heroDetail', { organization: organizationName })}</p>
        </div>
        <p className="text-sm text-primary-foreground/60">SmartAttend</p>
      </div>
      <div className="flex items-center justify-center bg-background p-6 sm:p-12">
        <div className="w-full max-w-md">
          <div className="mb-10 flex items-center justify-between lg:hidden">
            <Logo onClick={onHome} />
            <LanguageSwitcher compact />
          </div>
          <p className="text-sm font-medium text-primary">
            SmartAttend {portal === 'student' ? t('roles.student') : t('roles.teacher')}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('login.welcomeBack')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {portal === 'student' ? t('login.studentDetail') : t('login.staffDetail')}
          </p>
          <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
            <label className="flex flex-col gap-2 text-sm font-medium">
              {portal === 'student' ? t('login.studentId') : t('login.emailStaff')}
              <input
                className="h-12 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                type={portal === 'student' ? 'text' : 'email'}
                autoComplete={portal === 'student' ? 'username' : 'email'}
                required
              />
            </label>
            <label className="flex flex-col gap-2 text-sm font-medium">
              {t('login.password')}
              <PasswordInput
                value={password}
                onChange={setPassword}
                autoComplete="current-password"
                required
              />
            </label>
            {portal === 'student' && (
              <p className="text-xs text-muted-foreground">{t('login.studentPasswordHint')}</p>
            )}
            {error && (
              <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
                <CircleAlert className="mr-2 inline size-4" />
                {error}
              </div>
            )}
            <Button type="submit" className="h-12">
              {loading ? t('login.signingIn') : portal === 'student' ? t('login.signInStudent') : t('login.signInStaff')}
            </Button>
          </form>
          <div className="mt-6 flex flex-col gap-3 text-center text-sm">
            <button onClick={onSwitch} className="text-primary hover:underline">
              {portal === 'student' ? t('login.switchToStaff') : t('login.switchToStudent')}
            </button>
            {portal === 'staff' && (
              <button onClick={onRegister} className="text-muted-foreground hover:text-foreground">
                {t('auth.registerTeacher')}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export function RegisterScreen({ onRegistered, onBack, onHome }: { onRegistered: (role: Role) => void; onBack: () => void; onHome: () => void }) {
  const { t } = useI18n()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api.registerTeacher({ name, email, password, organizationName, apiKey })
      if (!result.ok || !result.role) {
        setError(result.message ?? t('auth.registerFailed'))
        return
      }
      onRegistered(result.role)
    } catch (err) {
      setError(err instanceof Error ? err.message : t('auth.registerFailed'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6 sm:p-12">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-between">
          <Logo onClick={onHome} />
          <LanguageSwitcher compact />
        </div>
        <p className="text-sm font-medium text-primary">{t('auth.registerTeacher')}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('auth.createTeacherAccount')}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t('auth.registerTeacherDetail')}</p>
        <form onSubmit={submit} className="mt-8 flex flex-col gap-5">
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t('auth.fullName')}
            <input className="h-12 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t('login.emailStaff')}
            <input className="h-12 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" required />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t('auth.organizationName')}
            <input className="h-12 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" value={organizationName} onChange={(e) => setOrganizationName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t('auth.registrationApiKey')}
            <PasswordInput
              value={apiKey}
              onChange={setApiKey}
              autoComplete="off"
              mono
              required
            />
            <span className="text-xs font-normal text-muted-foreground">{t('auth.registrationApiKeyHint')}</span>
          </label>
          <label className="flex flex-col gap-2 text-sm font-medium">
            {t('login.password')}
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </label>
          {error && (
            <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200">
              {error}
            </div>
          )}
          <Button type="submit" className="h-12">{loading ? t('auth.registering') : t('auth.registerSubmit')}</Button>
        </form>
        <button onClick={onBack} className="mt-6 text-sm text-primary hover:underline">{t('auth.backToLogin')}</button>
      </div>
    </main>
  )
}
