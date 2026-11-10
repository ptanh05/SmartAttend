'use client'

import React, { useState } from 'react'
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Building2,
  CheckCircle2,
  CircleAlert,
  Globe,
  GraduationCap,
  KeyRound,
  Lock,
  Mail,
  ShieldCheck,
  Smartphone,
  Sparkles,
  User,
  Users,
} from 'lucide-react'
import { useI18n } from '@/components/i18n-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { UtcLogo } from '@/components/utc-logo'
import {
  Button,
  Logo,
  PasswordInput,
  Status,
} from '@/components/smart-attend-ui'
import { api } from '@/lib/api/client'
import type { Portal, Role } from '@/lib/types/domain'

export function PublicLanding({ onSelect }: { onSelect: (portal: Portal) => void }) {
  const { t } = useI18n()
  return (
    <main className="min-h-screen bg-background">
      <header className="flex items-center justify-between border-b px-5 py-4 sm:px-8">
        <Logo />
        <div className="flex items-center gap-2">
          <LanguageSwitcher />
          <Button variant="ghost" onClick={() => onSelect('student')}>{t('landing.studentPortal')}</Button>
          <Button variant="outline" onClick={() => onSelect('teacher')}>{t('landing.teacherPortal')}</Button>
          <Button variant="outline" onClick={() => onSelect('admin')}>{t('landing.adminPortal')}</Button>
        </div>
      </header>
      <section className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28">
        <div>
          <Status>{t('landing.trustedBy')}</Status>
          <h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">{t('landing.heroTitle')}</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{t('landing.heroDetail')}</p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button onClick={() => onSelect('student')}><GraduationCap />{t('landing.studentPortal')}</Button>
            <Button variant="outline" onClick={() => onSelect('teacher')}><Users />{t('landing.teacherPortal')}</Button>
            <Button variant="outline" onClick={() => onSelect('admin')}><ShieldCheck />{t('landing.adminPortal')}</Button>
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
  portal: Portal
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
            {t(`landing.${portal}Portal`)}
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
            SmartAttend {t(`roles.${portal}`)}
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">{t('login.welcomeBack')}</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {t(`login.${portal}Detail`)}
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
              {loading ? t('login.signingIn') : t(`landing.portalTitle.${portal}`)}
            </Button>
          </form>
          <div className="mt-6 flex flex-col gap-3 text-center text-sm">
            <button onClick={onSwitch} className="text-primary hover:underline">
              {t(`login.switchTo${portal.charAt(0).toUpperCase()}${portal.slice(1)}`)}
            </button>
            {portal === 'admin' && (
              <button onClick={onRegister} className="text-muted-foreground hover:text-foreground">
                {t('auth.registerAdmin')}
              </button>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}

export function RegisterScreen({
  onRegistered,
  onBack,
  onHome,
}: {
  onRegistered: (role: Role) => void
  onBack: () => void
  onHome: () => void
}) {
  const { t, locale } = useI18n()
  const isEn = locale === 'en'

  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [organizationName, setOrganizationName] = useState('Trường Đại học Giao thông Vận tải')
  const [emailDomain, setEmailDomain] = useState('utc.edu.vn')
  const [apiKey, setApiKey] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    setLoading(true)
    setError('')
    try {
      const result = await api.registerAdministrator({
        name,
        email,
        password,
        organizationName,
        emailDomain,
        apiKey,
      })
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
    <main className="relative min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col lg:flex-row">
      {/* LEFT BRANDING HERO PANEL */}
      <section className="relative w-full lg:w-[45%] xl:w-[42%] bg-gradient-to-br from-[#071935] via-[#0c2854] to-[#15438c] text-white p-6 sm:p-10 lg:p-12 flex flex-col justify-between overflow-hidden shadow-2xl">
        {/* Ambient decorative glowing circles */}
        <div className="pointer-events-none absolute -top-24 -left-24 size-80 rounded-full bg-blue-500/20 blur-3xl" />
        <div className="pointer-events-none absolute bottom-0 -right-20 size-96 rounded-full bg-cyan-500/15 blur-3xl" />
        <div className="pointer-events-none absolute top-1/2 left-1/3 size-64 rounded-full bg-indigo-500/15 blur-3xl" />

        {/* Top bar: Brand logo */}
        <div className="relative z-10">
          <button
            type="button"
            onClick={onHome}
            className="group inline-flex items-center text-left transition hover:opacity-95 cursor-pointer"
          >
            <UtcLogo
              size={50}
              textColor="text-white"
              titleClassName="text-sm sm:text-base font-black tracking-wide"
              subtitleClassName="text-[10px] text-blue-200 tracking-wider"
            />
          </button>
        </div>

        {/* Center content */}
        <div className="relative z-10 my-8 sm:my-12">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-300/30 bg-blue-500/15 px-3.5 py-1 text-xs font-semibold text-blue-100 shadow-sm backdrop-blur-md">
            <Sparkles className="size-3.5 text-amber-300" />
            <span>SmartAttend • System Admin Portal</span>
          </div>

          <h1 className="mt-4 text-2xl sm:text-3xl lg:text-4xl font-extrabold tracking-tight leading-tight text-white text-balance">
            {isEn
              ? 'Establish Trusted Attendance Infrastructure for Your University.'
              : 'Xây dựng nền tảng điểm danh tin cậy & chống gian lận cho nhà trường.'}
          </h1>

          <p className="mt-3.5 text-sm sm:text-base leading-relaxed text-blue-100/90 text-pretty">
            {isEn
              ? 'Centralized control for institutional data, semester schedules, faculty roster provisioning, and high-assurance verification.'
              : 'Quản lý toàn bộ tổ chức, thời khóa biểu học kỳ, phân quyền giảng viên và cấu hình điểm danh chống proxy trong một không gian an toàn, tập trung.'}
          </p>

          {/* Value cards */}
          <div className="mt-8 space-y-3.5">
            <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4 backdrop-blur-md transition hover:bg-white/[0.1]">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-blue-400/20 text-cyan-200">
                <Building2 className="size-5" />
              </div>
              <div className="text-xs sm:text-sm">
                <h2 className="font-semibold text-white">
                  {isEn ? 'Institution & Domain Binding' : 'Thiết lập Tổ chức & Tên miền Trường'}
                </h2>
                <p className="mt-0.5 text-blue-200/80 leading-relaxed text-xs">
                  {isEn
                    ? 'Bind system access strictly to @utc.edu.vn and enforce organization-level isolation.'
                    : 'Ràng buộc danh sách giảng viên & sinh viên theo tên miền chính thức của trường.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4 backdrop-blur-md transition hover:bg-white/[0.1]">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-emerald-400/20 text-emerald-300">
                <Users className="size-5" />
              </div>
              <div className="text-xs sm:text-sm">
                <h2 className="font-semibold text-white">
                  {isEn ? 'Batch Roster Provisioning' : 'Độc quyền Phân quyền & Import'}
                </h2>
                <p className="mt-0.5 text-blue-200/80 leading-relaxed text-xs">
                  {isEn
                    ? 'Authorized bulk CSV import for courses, instructors, and student cohorts with automated credentials.'
                    : 'Chỉ Quản trị viên mới có quyền import danh sách giảng viên, sinh viên và phân lớp môn học.'}
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/[0.07] p-3.5 sm:p-4 backdrop-blur-md transition hover:bg-white/[0.1]">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-amber-400/20 text-amber-200">
                <ShieldCheck className="size-5" />
              </div>
              <div className="text-xs sm:text-sm">
                <h2 className="font-semibold text-white">
                  {isEn ? 'Multi-Factor Anti-Proxy Verification' : 'Bảo mật Điểm danh Đa tầng Anti-Proxy'}
                </h2>
                <p className="mt-0.5 text-blue-200/80 leading-relaxed text-xs">
                  {isEn
                    ? 'Dynamic QR rotating challenge, acoustic ultrasonic proof, and WebAuthn biometrics.'
                    : 'Mã QR động nano-hash, sóng âm siêu âm tần số cao và WebAuthn vân tay/FaceID phòng chống điểm danh hộ.'}
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom indicator */}
        <div className="relative z-10 pt-4 border-t border-white/10 flex items-center justify-between text-[11px] text-blue-200/70">
          <span>{isEn ? 'Architecture: Zero-Trust Isolation' : 'Bảo vệ bởi kiến trúc Zero-Trust & SHA-256'}</span>
          <span>v2.0 UTC</span>
        </div>
      </section>

      {/* RIGHT REGISTRATION FORM CONTAINER */}
      <section className="relative flex-1 flex flex-col justify-center px-4 py-8 sm:px-8 lg:px-12 xl:px-16 overflow-y-auto">
        <div className="mx-auto w-full max-w-xl">
          {/* Top navigation bar */}
          <div className="mb-6 flex items-center justify-between">
            <button
              type="button"
              onClick={onBack}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 shadow-sm hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              <ArrowLeft className="size-3.5" />
              <span>{t('auth.backToLogin')}</span>
            </button>
            <LanguageSwitcher compact />
          </div>

          {/* Form Card */}
          <div className="rounded-3xl border border-slate-200/90 dark:border-slate-800/90 bg-white dark:bg-slate-900 p-6 sm:p-9 shadow-xl shadow-slate-200/50 dark:shadow-none">
            {/* Form Header */}
            <div className="mb-6">
              <div className="inline-flex size-11 items-center justify-center rounded-2xl bg-blue-50 dark:bg-blue-950/60 text-blue-600 dark:text-blue-400 ring-4 ring-blue-500/10 mb-3">
                <KeyRound className="size-5" />
              </div>
              <p className="text-xs font-bold uppercase tracking-wider text-blue-600 dark:text-blue-400">
                {t('auth.registerAdmin')}
              </p>
              <h1 className="mt-1 text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900 dark:text-white">
                {t('auth.createAdminAccount')}
              </h1>
              <p className="mt-2 text-xs sm:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                {t('auth.registerAdminDetail')}
              </p>
            </div>

            {/* Form Fields */}
            <form onSubmit={submit} className="space-y-4 sm:space-y-5">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Full name */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <User className="size-3.5 text-slate-400" />
                    <span>{t('auth.fullName')}</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder={isEn ? 'Dr. John Doe' : 'TS. Nguyễn Văn A'}
                    className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-600/10"
                  />
                </div>

                {/* Email */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Mail className="size-3.5 text-slate-400" />
                    <span>{t('login.emailStaff')}</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="admin@utc.edu.vn"
                    className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-600/10"
                  />
                </div>
              </div>

              {/* Organization name */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Building2 className="size-3.5 text-slate-400" />
                  <span>{t('auth.organizationName')}</span>
                  <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={organizationName}
                  onChange={(e) => setOrganizationName(e.target.value)}
                  placeholder="Trường Đại học Giao thông Vận tải"
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-600/10"
                />
              </div>

              {/* Email domain */}
              <div>
                <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                  <Globe className="size-3.5 text-slate-400" />
                  <span>{t('auth.emailDomain')}</span>
                </label>
                <input
                  type="text"
                  value={emailDomain}
                  onChange={(e) => setEmailDomain(e.target.value)}
                  placeholder="utc.edu.vn"
                  autoComplete="off"
                  className="h-11 w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 px-3.5 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 outline-none transition focus:border-blue-600 focus:bg-white dark:focus:bg-slate-800 focus:ring-4 focus:ring-blue-600/10"
                />
                <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                  {t('auth.emailDomainHint')}
                </span>
              </div>

              {/* API Key and Password in 2-column on sm screens */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* API Key */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <KeyRound className="size-3.5 text-slate-400" />
                    <span>{t('auth.registrationApiKey')}</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <PasswordInput
                    value={apiKey}
                    onChange={setApiKey}
                    autoComplete="off"
                    mono
                    required
                    placeholder="sec_..."
                    inputClassName="h-11 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 focus:border-blue-600 focus:ring-blue-600/10 text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    {t('auth.registrationApiKeyHint')}
                  </span>
                </div>

                {/* Password */}
                <div>
                  <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300">
                    <Lock className="size-3.5 text-slate-400" />
                    <span>{t('login.password')}</span>
                    <span className="text-rose-500">*</span>
                  </label>
                  <PasswordInput
                    value={password}
                    onChange={setPassword}
                    autoComplete="new-password"
                    minLength={8}
                    required
                    placeholder="••••••••"
                    inputClassName="h-11 rounded-xl border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-800/50 focus:border-blue-600 focus:ring-blue-600/10 text-sm"
                  />
                  <span className="mt-1 block text-[11px] text-slate-500 dark:text-slate-400">
                    {isEn ? 'At least 8 characters' : 'Tối thiểu 8 ký tự'}
                  </span>
                </div>
              </div>

              {/* Error message */}
              {error && (
                <div
                  role="alert"
                  className="flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50/90 dark:border-rose-900/60 dark:bg-rose-950/40 p-3 text-xs text-rose-700 dark:text-rose-200"
                >
                  <CircleAlert className="size-4 shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Submit button */}
              <button
                type="submit"
                disabled={loading}
                className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white font-semibold h-12 shadow-lg shadow-blue-600/25 transition-all active:scale-[0.99] disabled:opacity-60 cursor-pointer text-sm"
              >
                {loading ? (
                  <>
                    <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>{t('auth.registering')}</span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 className="size-4" />
                    <span>{t('auth.registerSubmit')}</span>
                  </>
                )}
              </button>
            </form>

            {/* Card Footer link */}
            <div className="mt-6 pt-5 border-t border-slate-100 dark:border-slate-800/80 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {isEn ? 'Already have an administrator account?' : 'Đã có tài khoản Quản trị viên?'}{' '}
                <button
                  type="button"
                  onClick={onBack}
                  className="font-semibold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline cursor-pointer"
                >
                  {isEn ? 'Sign in here' : 'Đăng nhập ngay'}
                </button>
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  )
}
