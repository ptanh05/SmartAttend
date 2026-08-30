'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, Calendar, CalendarDays, Camera, CameraOff, Check, CheckCircle2, ChevronDown, ChevronRight, CircleAlert,
  ClipboardCheck, Clock, Download, Edit3, FileCheck, FileText, GraduationCap, LockKeyhole, LogOut, Maximize2, Menu, Minimize2, Moon, Play, Plus,
  RotateCw, ScanLine, Search, Send, ShieldCheck, Smartphone, Trash2, Upload, Users, Wifi, X
} from 'lucide-react'
import {
  AppUser, AuthScreen, AuthUser, Button, Card, calcAttendanceRate, CountdownTimer, DynamicQRCode,
  formatDayOfWeek, initialAuthScreen, Logo, Metric, nav, PageKey, pageFromPath, PasswordInput,
  SectionHeader, Status, statusText, ViewProps,
} from './smart-attend-ui'
import { api, loadDashboard, type DashboardData } from '@/lib/api/client'
import { canAccessRole } from '@/lib/auth/routing'
import { useI18n } from '@/components/i18n-provider'
import { LanguageSwitcher } from '@/components/language-switcher'
import { UtcLogo } from './utc-logo'
import { UtcLoginLanding } from './utc-login-landing'
import { UtcStudentDashboard } from './utc-student-dashboard'
import type { AttendanceStatus, ClassSession, Course, Role } from '@/lib/types/domain'


function PublicLanding({ onSelect }: { onSelect: (portal: 'student' | 'staff') => void }) {
  const { t } = useI18n()
  return <main className="min-h-screen bg-background"><header className="flex items-center justify-between border-b px-5 py-4 sm:px-8"><Logo /><div className="flex items-center gap-2"><LanguageSwitcher /><Button variant="ghost" onClick={() => onSelect('student')}>{t('landing.studentPortal')}</Button><Button variant="outline" onClick={() => onSelect('staff')}>{t('landing.staffPortal')}</Button></div></header><section className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28"><div><Status>{t('landing.trustedBy')}</Status><h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">{t('landing.heroTitle')}</h1><p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">{t('landing.heroDetail')}</p><div className="mt-8 flex flex-wrap gap-3"><Button onClick={() => onSelect('student')}><GraduationCap />{t('landing.studentPortal')}</Button><Button variant="outline" onClick={() => onSelect('staff')}><Users />{t('landing.staffPortal')}</Button></div><div className="mt-8 flex flex-wrap gap-5 text-sm text-muted-foreground"><span><ShieldCheck className="mr-2 inline size-4 text-primary" />{t('landing.sessionVerified')}</span><span><Smartphone className="mr-2 inline size-4 text-primary" />{t('landing.deviceAware')}</span><span><Activity className="mr-2 inline size-4 text-primary" />{t('landing.liveInsights')}</span></div></div><div className="rounded-3xl border bg-muted/40 p-5 shadow-sm sm:p-8"><div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">{t('landing.todaysAttendance')}</p><p className="mt-2 text-4xl font-semibold">—</p></div><div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><BarChart3 /></div></div><div className="mt-8 flex h-36 items-end gap-2">{[38, 56, 48, 72, 67, 82, 78, 94, 86, 91].map((height, index) => <div key={index} className="flex-1 rounded-t bg-primary/80" style={{ height: `${height}%` }} />)}</div><div className="mt-6 flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">{t('common.activeSession')}</span><Status>{t('common.liveNow')}</Status></div></div></div></section></main>
}

function ChangePasswordForm({
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

function LoginScreen({
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

function RegisterScreen({ onRegistered, onBack, onHome }: { onRegistered: (role: Role) => void; onBack: () => void; onHome: () => void }) {
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

function StudentView({ page, go, data, user, refresh, onPasswordChanged }: ViewProps) {
  const { t } = useI18n()
  const { courses, records, sessions, notifications, devices, leaveRequests = [] } = data
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; confidence: number; message: string } | null>(null)
  const [filter, setFilter] = useState('all')
  const [read, setRead] = useState<string[]>(notifications.filter((n) => n.read).map((n) => n.id))
  const [showChangePassword, setShowChangePassword] = useState(false)
  const [cameraActive, setCameraActive] = useState(false)
  const [cameraError, setCameraError] = useState('')
  const videoRef = useRef<HTMLVideoElement>(null)
  const streamRef = useRef<MediaStream | null>(null)

  // Leave Request State
  const [leaveModalOpen, setLeaveModalOpen] = useState(false)
  const [leaveCourseId, setLeaveCourseId] = useState('')
  const [leaveDate, setLeaveDate] = useState(new Date().toLocaleDateString('vi-VN'))
  const [leaveReason, setLeaveReason] = useState('')
  const [leaveEvidence, setLeaveEvidence] = useState('')
  const [submittingLeave, setSubmittingLeave] = useState(false)
  const [leaveNotice, setLeaveNotice] = useState('')

  const handleLeaveSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!leaveCourseId || !leaveReason.trim()) return
    setSubmittingLeave(true)
    try {
      const selectedCourse = courses.find((c) => c.id === leaveCourseId)
      await api.submitLeaveRequest({
        courseId: leaveCourseId,
        courseName: selectedCourse ? `${selectedCourse.code} - ${selectedCourse.name}` : undefined,
        date: leaveDate,
        reason: leaveReason.trim(),
        evidenceNote: leaveEvidence.trim(),
      })
      setLeaveNotice(t('student.leaveSubmitted'))
      setLeaveReason('')
      setLeaveEvidence('')
      setLeaveModalOpen(false)
      await refresh()
    } catch {
      setLeaveNotice('Không thể gửi đơn xin phép vắng. Vui lòng thử lại.')
    } finally {
      setSubmittingLeave(false)
    }
  }

  const liveSession = sessions.find((session) => session.status === 'live')
  const liveCourse = liveSession ? courses.find((course) => course.id === liveSession.courseId) : null
  const rate = calcAttendanceRate(records)
  const presentCount = records.filter((row) => row.status === 'present' || row.status === 'late').length

  const todayDay = new Date().getDay()
  const todayDayOfWeek = todayDay === 0 ? 7 : todayDay
  const todaySessions = sessions.filter((s) => s.dayOfWeek === todayDayOfWeek)

  const verify = async (overrideCode?: string) => {
    const codeToVerify = overrideCode || code
    if (!codeToVerify.trim()) return
    try {
      const response = await api.verify(codeToVerify.trim())
      setResult(response)
      if (response.ok) {
        stopCamera()
        await refresh()
      }
    } catch (err) {
      setResult({ ok: false, confidence: 0, message: err instanceof Error ? err.message : t('common.verificationFailed') })
    }
  }

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop())
      streamRef.current = null
    }
    setCameraActive(false)
  }

  const startCamera = async () => {
    setCameraError('')
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      })
      streamRef.current = stream
      if (videoRef.current) {
        videoRef.current.srcObject = stream
      }
      setCameraActive(true)

      // BarcodeDetector API detection loop if supported
      const win = typeof window !== 'undefined' ? (window as unknown as Record<string, unknown>) : null
      if (win && 'BarcodeDetector' in win) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detector = new (win.BarcodeDetector as any)({ formats: ['qr_code'] })
        const scan = async () => {
          if (!videoRef.current || !streamRef.current) return
          try {
            const barcodes = await detector.detect(videoRef.current)
            if (barcodes.length > 0) {
              const raw = barcodes[0].rawValue.trim().toUpperCase()
              setCode(raw)
              await verify(raw)
              return
            }
          } catch {
            /* keep scanning */
          }
          if (streamRef.current) {
            requestAnimationFrame(scan)
          }
        }
        requestAnimationFrame(scan)
      }
    } catch {
      setCameraError(t('common.cameraError'))
      setCameraActive(false)
    }
  }

  if (page === 'join') {
    return (
      <div className="mx-auto max-w-2xl">
        <SectionHeader
          eyebrow={t('student.verification')}
          title={t('student.joinTitle')}
          detail={t('student.joinDetail')}
          action={<Button variant="ghost" onClick={() => { stopCamera(); go('overview') }}><ArrowLeft />{t('common.back')}</Button>}
        />
        <Card
          title={liveCourse?.name ?? t('student.noLiveClass')}
          description={liveSession ? `${liveCourse?.code ?? ''} · ${liveSession.room} · ${t('common.liveNow')}` : t('student.waitingSession')}
        >
          <div className="flex flex-col gap-5">
            {liveSession && (
              <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-center">
                <p className="text-xs font-semibold uppercase tracking-wider text-primary">{t('common.todayClass')}</p>
                <h3 className="mt-1 text-lg font-semibold">{liveCourse?.name} ({liveCourse?.code})</h3>
                <p className="mt-0.5 text-xs text-muted-foreground">{liveSession.room} · {liveSession.startsAt} – {liveSession.endsAt}</p>
              </div>
            )}

            {cameraActive ? (
              <div className="flex flex-col items-center gap-3">
                <div className="relative aspect-video w-full max-w-sm overflow-hidden rounded-2xl border-2 border-primary bg-black">
                  <video ref={videoRef} autoPlay playsInline muted className="size-full object-cover" />
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="size-48 rounded-xl border-2 border-dashed border-white/80" />
                  </div>
                </div>
                <Button variant="outline" onClick={stopCamera}>
                  <CameraOff />{t('common.cameraStop')}
                </Button>
              </div>
            ) : (
              <div className="flex flex-wrap justify-center gap-2">
                <Button variant="outline" onClick={startCamera}>
                  <Camera />{t('common.cameraScan')}
                </Button>
              </div>
            )}

            {cameraError && (
              <div className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
                {cameraError}
              </div>
            )}

            <label className="flex flex-col gap-2 text-sm font-medium" htmlFor="challenge">
              {t('student.sessionChallenge')}
              <input
                id="challenge"
                value={code}
                onChange={(e) => setCode(e.target.value.toUpperCase())}
                placeholder={t('student.challengePlaceholder')}
                className="h-12 rounded-lg border bg-background px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary"
              />
            </label>

            {result && (
              <div
                className={`rounded-lg border p-4 ${
                  result.ok
                    ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200'
                    : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 font-medium">
                  {result.ok ? <CheckCircle2 /> : <CircleAlert />}
                  {result.ok ? t('student.attendanceConfirmed') : t('student.verificationAttention')}
                </div>
                <p className="mt-1 text-sm">{result.message}</p>
                {result.ok && (
                  <div className="mt-4 grid gap-2 border-t pt-3 text-xs sm:grid-cols-2">
                    <span>{t('common.course')}: {liveCourse?.name ?? '—'}</span>
                    <span>{t('common.room')}: {liveSession?.room ?? '—'}</span>
                    <span>{t('common.confidence')}: {result.confidence}%</span>
                  </div>
                )}
              </div>
            )}

            <Button onClick={() => verify()}>
              {result?.ok ? <><Check />{t('common.done')}</> : <><ShieldCheck />{t('student.verifyRecord')}</>}
            </Button>
          </div>
        </Card>
      </div>
    )
  }

  if (page === 'history') {
    const shown = records.filter((r) => filter === 'all' || r.status === filter)
    const myLeaveList = leaveRequests.filter((r) => (user.studentCode && r.studentCode === user.studentCode) || (user.id && r.studentId === user.id) || !r.studentCode)
    return (
      <div className="flex flex-col gap-6">
        {leaveNotice && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center justify-between">
            <span>{leaveNotice}</span>
            <button onClick={() => setLeaveNotice('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer"><X className="size-4" /></button>
          </div>
        )}
        <SectionHeader
          eyebrow={t('student.workspace')}
          title={t('student.historyTitle')}
          detail={t('student.historyDetail')}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setLeaveModalOpen(true)}>
                <FileCheck />{t('student.submitLeave')}
              </Button>
              <Button variant="outline">
                <Download />{t('common.exportCsv')}
              </Button>
            </div>
          }
        />
        <Card title={t('student.yourAttendance')} description={t('student.totalRecords', { count: records.length })}>
          <div className="mb-5 grid gap-4 sm:grid-cols-3">
            <Metric label={t('student.attendanceRate')} value={`${rate}%`} detail={t('student.fromRecords')} icon={ClipboardCheck} />
            <Metric label={t('common.present')} value={String(presentCount)} detail={t('student.sessionsAttended')} icon={CheckCircle2} tone="success" />
            <Metric label={t('common.needsReview')} value={String(records.filter((r) => r.status === 'flagged' || r.status === 'pending' || r.status === 'absent').length)} detail={t('student.teacherFollowUp')} icon={CircleAlert} tone="warning" />
          </div>
          <div className="mb-5 flex flex-wrap gap-2">
            {['all', 'present', 'late', 'absent', 'excused'].map((item) => (
              <Button key={item} variant={filter === item ? 'primary' : 'outline'} onClick={() => setFilter(item)}>
                {item === 'excused' ? t('student.excused') : t(`common.${item}`)}
              </Button>
            ))}
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead className="text-xs text-muted-foreground">
                <tr>
                  <th className="pb-3">{t('common.class')}</th>
                  <th className="pb-3">{t('common.status')}</th>
                  <th className="pb-3">{t('common.confidence')}</th>
                  <th className="pb-3">{t('common.device')}</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {shown.map((r) => (
                  <tr key={r.id}>
                    <td className="py-3 font-medium">{courses.find((c) => c.id === sessions.find((s) => s.id === r.sessionId)?.courseId)?.name ?? r.sessionId}</td>
                    <td className="py-3">
                      <Status tone={r.status === 'late' ? 'warning' : r.status === 'absent' ? 'danger' : r.status === 'excused' ? 'neutral' : 'success'}>
                        {statusText(t, r.status)}
                      </Status>
                    </td>
                    <td className="py-3 text-muted-foreground">{r.confidence ? `${r.confidence}%` : '—'}</td>
                    <td className="py-3 text-muted-foreground">{r.device || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        {/* My Leave Requests Section */}
        <Card title={t('student.myLeaveRequests')} description={t('student.leaveModalDetail')}>
          {myLeaveList.length === 0 ? (
            <p className="text-xs text-muted-foreground py-4 text-center">{t('student.noLeaveRequests')}</p>
          ) : (
            <div className="divide-y">
              {myLeaveList.map((req) => (
                <div key={req.id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-foreground">{req.courseName}</span>
                      <span className="text-muted-foreground">({req.date})</span>
                    </div>
                    <p className="text-muted-foreground"><strong>Lý do:</strong> {req.reason}</p>
                    {req.evidenceNote && <p className="text-muted-foreground text-[11px]"><strong>Minh chứng:</strong> {req.evidenceNote}</p>}
                  </div>
                  <div className="flex items-center gap-3">
                    <Status tone={req.status === 'approved' ? 'success' : req.status === 'rejected' ? 'danger' : 'warning'}>
                      {req.status === 'approved' ? 'Đã duyệt' : req.status === 'rejected' ? 'Từ chối' : 'Chờ duyệt'}
                    </Status>
                  </div>
                </div>
              ))}
            </div>
          )}
        </Card>

        {/* Leave Request Submission Modal */}
        {leaveModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
            <div className="relative w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl text-slate-800 border border-slate-200">
              <button
                onClick={() => setLeaveModalOpen(false)}
                className="absolute right-4 top-4 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 transition-colors cursor-pointer"
              >
                <X className="size-5" />
              </button>
              <div className="flex items-center gap-3">
                <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
                  <FileCheck className="size-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">{t('student.leaveModalTitle')}</h3>
                  <p className="text-xs text-slate-500">{t('student.leaveModalDetail')}</p>
                </div>
              </div>

              <form onSubmit={handleLeaveSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.selectCourse')} *</label>
                  <select
                    value={leaveCourseId}
                    onChange={(e) => setLeaveCourseId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white cursor-pointer"
                  >
                    <option value="">-- {t('student.selectCourse')} --</option>
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.code} - {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.selectSession')} *</label>
                  <input
                    type="text"
                    value={leaveDate}
                    onChange={(e) => setLeaveDate(e.target.value)}
                    placeholder="24/08/2026"
                    required
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.absenceReason')} *</label>
                  <textarea
                    value={leaveReason}
                    onChange={(e) => setLeaveReason(e.target.value)}
                    placeholder={t('student.leaveReasonPlaceholder')}
                    required
                    rows={3}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white resize-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">{t('student.evidenceNote')}</label>
                  <input
                    type="text"
                    value={leaveEvidence}
                    onChange={(e) => setLeaveEvidence(e.target.value)}
                    placeholder={t('student.evidencePlaceholder')}
                    className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs text-slate-900 outline-none focus:border-blue-500 focus:bg-white"
                  />
                </div>

                <div className="mt-6 flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <Button variant="outline" onClick={() => setLeaveModalOpen(false)}>
                    {t('common.back')}
                  </Button>
                  <Button type="submit" disabled={submittingLeave}>
                    <Send className="size-4" />
                    {submittingLeave ? 'Đang gửi…' : t('student.sendLeaveRequest')}
                  </Button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    )
  }

  if (page === 'courses') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader eyebrow={t('student.workspace')} title={t('student.myClasses')} detail={t('student.myClassesDetail')} />
        <div className="grid gap-4 md:grid-cols-2">
          {courses.map((course) => {
            const courseSectionsList = sessions.filter((s) => s.courseId === course.id)
            return (
              <Card key={course.id} title={`${course.code} · ${course.name}`} description={`${course.department}`}>
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">{t('common.attendance')}</span>
                    <strong>{rate}%</strong>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div className="h-2 rounded-full bg-primary" style={{ width: `${rate}%` }} />
                  </div>
                  <div className="divide-y text-xs text-muted-foreground">
                    {courseSectionsList.map((sec) => (
                      <div key={sec.sectionId} className="flex items-center justify-between py-2">
                        <span><Calendar className="mr-1 inline size-3.5" />{formatDayOfWeek(t, sec.dayOfWeek)} · {sec.startsAt} – {sec.endsAt}</span>
                        <span className="font-medium text-foreground">{sec.room}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  if (page === 'devices') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader eyebrow={t('student.security')} title={t('student.devicesTitle')} detail={t('student.devicesDetail')} />
        <Card title={t('student.trustedDevices')} description={t('student.devicesBound', { count: devices.length })}>
          {devices.length ? (
            devices.map((device) => (
              <div key={device.id} className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                    <Smartphone />
                  </div>
                  <div>
                    <p className="font-medium">{device.label}</p>
                    <p className="text-sm text-muted-foreground">{t('student.lastSeen', { time: device.lastSeenAt })}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Status>{device.trusted ? t('common.trusted') : t('common.pending')}</Status>
                </div>
              </div>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">{t('student.noDevices')}</p>
          )}
        </Card>
        <Card title={t('student.privacyTitle')}>
          <p className="text-sm leading-6 text-muted-foreground">{t('student.privacyDetail')}</p>
        </Card>
      </div>
    )
  }

  if (page === 'notifications') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader
          eyebrow={t('student.workspace')}
          title={t('student.notificationsTitle')}
          detail={t('student.notificationsDetail')}
          action={<Button variant="outline" onClick={async () => { await api.markNotificationsRead(); setRead(notifications.map((n) => n.id)); await refresh() }}>{t('student.markAllRead')}</Button>}
        />
        <Card title={t('student.inbox')} description={t('student.unreadCount', { count: notifications.filter((n) => !read.includes(n.id)).length })}>
          <div className="divide-y">
            {notifications.map((n) => (
              <button key={n.id} onClick={() => setRead([...read, n.id])} className={`flex w-full gap-3 py-4 text-left ${!read.includes(n.id) ? 'bg-primary/5' : ''}`}>
                <Bell className="mt-1 size-4 text-primary" />
                <span className="flex-1">
                  <strong className="text-sm">{n.title}</strong>
                  <span className="block text-sm text-muted-foreground">{n.body}</span>
                  <small className="text-muted-foreground">{n.createdAt}</small>
                </span>
                {!read.includes(n.id) && <span className="mt-2 size-2 rounded-full bg-primary" />}
              </button>
            ))}
          </div>
        </Card>
      </div>
    )
  }

  if (page === 'profile') {
    return (
      <div className="flex flex-col gap-6">
        <SectionHeader eyebrow={t('student.account')} title={t('student.profileTitle')} detail={t('student.profileDetail')} />
        <Card title={t('student.studentIdentity')}>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
            <div className="grid size-16 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">
              {user.initials}
            </div>
            <div>
              <h2 className="text-lg font-semibold">{user.name}</h2>
              <p className="text-sm text-muted-foreground">{user.department ?? t('roles.student')} · SmartAttend</p>
              {user.studentCode && <p className="text-sm text-muted-foreground">{t('login.studentId')}: {user.studentCode}</p>}
            </div>
          </div>
        </Card>
        <Card title={t('student.accountSecurity')}>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setShowChangePassword(true)}><LockKeyhole />{t('student.changePassword')}</Button>
          </div>
          {showChangePassword && (
            <div className="mt-5 border-t pt-5">
              <ChangePasswordForm onSuccess={async () => { setShowChangePassword(false); await onPasswordChanged?.(); await refresh() }} onCancel={() => setShowChangePassword(false)} />
            </div>
          )}
        </Card>
      </div>
    )
  }

  return <UtcStudentDashboard user={user} go={go} data={data} />
}

function StudentImportPanel({
  csvText,
  setCsvText,
  importing,
  importResult,
  onImport,
  onClose,
  t,
}: {
  csvText: string
  setCsvText: (value: string) => void
  importing: boolean
  importResult: {
    created: { studentCode: string; name: string; defaultPassword: string }[]
    skipped: { studentCode: string; reason: string }[]
  } | null
  onImport: () => void
  onClose: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const fileRef = useRef<HTMLInputElement>(null)

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) return
    setCsvText(await file.text())
  }

  const downloadTemplate = () => {
    const template = 'studentId,name,department\n20210001,Nguyen Van A,Computer Science\n20210002,Tran Thi B,Computer Science'
    const blob = new Blob([template], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = 'students-template.csv'
    link.click()
    URL.revokeObjectURL(url)
  }

  return (
    <Card title={t('teacher.importStudents')} description={t('teacher.importStudentsDetail')}>
      <p className="mb-3 text-sm text-muted-foreground">{t('teacher.importFormat')}</p>
      <p className="mb-3 rounded-lg bg-muted/50 p-3 font-mono text-xs">
        studentId,name,department{'\n'}20210001,Nguyen Van A,Computer Science
      </p>
      <p className="mb-3 text-sm text-muted-foreground">{t('teacher.defaultPasswordFormat')}</p>
      <div className="mb-3 flex flex-wrap gap-2">
        <input ref={fileRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFileChange} />
        <Button type="button" variant="outline" onClick={() => fileRef.current?.click()}>
          <Upload />{t('teacher.uploadCsv')}
        </Button>
        <Button type="button" variant="outline" onClick={downloadTemplate}>
          <Download />{t('teacher.downloadTemplate')}
        </Button>
      </div>
      <textarea
        value={csvText}
        onChange={(e) => setCsvText(e.target.value)}
        rows={8}
        className="w-full rounded-lg border bg-background p-3 font-mono text-sm outline-none focus:ring-2 focus:ring-primary"
        placeholder={t('teacher.importPlaceholder')}
      />
      <div className="mt-4 flex gap-2">
        <Button type="button" onClick={onImport} disabled={!csvText.trim() || importing}>
          {importing ? t('teacher.importing') : t('teacher.runImport')}
        </Button>
        <Button type="button" variant="outline" onClick={onClose}>{t('common.back')}</Button>
      </div>
      {importResult && (
        <div className="mt-5 space-y-4 border-t pt-5 text-sm">
          <div>
            <p className="font-medium">{t('teacher.importCreated', { count: importResult.created.length })}</p>
            {importResult.created.length > 0 && (
              <div className="mt-2 max-h-48 overflow-y-auto rounded-lg border">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="p-2">{t('login.studentId')}</th>
                      <th className="p-2">{t('auth.fullName')}</th>
                      <th className="p-2">{t('teacher.defaultPassword')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {importResult.created.map((row) => (
                      <tr key={row.studentCode} className="border-t">
                        <td className="p-2">{row.studentCode}</td>
                        <td className="p-2">{row.name}</td>
                        <td className="p-2 font-mono">{row.defaultPassword}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
          {importResult.skipped.length > 0 && (
            <div>
              <p className="font-medium text-amber-700">{t('teacher.importSkipped', { count: importResult.skipped.length })}</p>
              <ul className="mt-2 list-disc pl-5 text-muted-foreground">
                {importResult.skipped.map((row) => (
                  <li key={`${row.studentCode}-${row.reason}`}>{row.studentCode}: {row.reason}</li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </Card>
  )
}

function CourseModal({
  departments,
  onClose,
  onCreated,
  t,
}: {
  departments: string[]
  onClose: () => void
  onCreated: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [department, setDepartment] = useState(departments[0] || 'Công nghệ thông tin')
  const [color] = useState('indigo')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      const res = await api.createCourse({ code, name, department, color })
      if (!res.ok) throw new Error(res.message || 'Failed to create course')
      onCreated()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating course')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-md rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <h3 className="text-lg font-semibold">{t('common.createNewCourse')}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.courseCode')}
            <input className="h-11 rounded-lg border bg-background px-3 uppercase font-mono outline-none focus:ring-2 focus:ring-primary" placeholder="IT301" value={code} onChange={(e) => setCode(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.courseName')}
            <input className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" placeholder="Lập trình Web nâng cao" value={name} onChange={(e) => setName(e.target.value)} required />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.department')}
            <input className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" value={department} onChange={(e) => setDepartment(e.target.value)} required />
          </label>
          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}
          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.back')}</Button>
            <Button type="submit" disabled={loading}>{loading ? '...' : t('common.createNew')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function ScheduleModal({
  courses,
  initialCourseId,
  initialSection,
  onClose,
  onSaved,
  t,
}: {
  courses: Course[]
  initialCourseId?: string
  initialSection?: ClassSession
  onClose: () => void
  onSaved: () => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [courseId, setCourseId] = useState(initialSection?.courseId || initialCourseId || courses[0]?.id || '')
  const [dayOfWeek, setDayOfWeek] = useState<number>(initialSection?.dayOfWeek ?? 1)
  const [startsAt, setStartsAt] = useState(initialSection?.startsAt || '07:30')
  const [endsAt, setEndsAt] = useState(initialSection?.endsAt || '09:30')
  const [room, setRoom] = useState(initialSection?.room || 'P.302 - Nhà A1')
  const [autoStart, setAutoStart] = useState(initialSection?.autoStart ?? true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError('')
    try {
      if (initialSection) {
        const res = await api.updateSection(initialSection.sectionId, {
          room,
          startsAt,
          endsAt,
          dayOfWeek,
          autoStart,
        })
        if (!res.ok) throw new Error(res.message || 'Failed')
      } else {
        const res = await api.createSection({
          courseId,
          room,
          startsAt,
          endsAt,
          dayOfWeek,
          autoStart,
        })
        if (!res.ok) throw new Error(res.message || 'Failed')
      }
      onSaved()
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error')
    } finally {
      setLoading(false)
    }
  }

  const days = [
    { value: 1, label: t('common.day1') },
    { value: 2, label: t('common.day2') },
    { value: 3, label: t('common.day3') },
    { value: 4, label: t('common.day4') },
    { value: 5, label: t('common.day5') },
    { value: 6, label: t('common.day6') },
    { value: 7, label: t('common.day7') },
  ]

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="w-full max-w-lg rounded-2xl border bg-card p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <h3 className="text-lg font-semibold">{initialSection ? t('common.editSchedule') : t('common.addSchedule')}</h3>
            <p className="text-xs text-muted-foreground">{t('common.scheduleDetail')}</p>
          </div>
          <button onClick={onClose} className="rounded-lg p-1 text-muted-foreground hover:bg-muted"><X className="size-5" /></button>
        </div>
        <form onSubmit={submit} className="mt-4 flex flex-col gap-4">
          {!initialSection && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('common.course')}
              <select
                className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary"
                value={courseId}
                onChange={(e) => setCourseId(e.target.value)}
                required
              >
                {courses.map((c) => (
                  <option key={c.id} value={c.id}>{c.code} · {c.name}</option>
                ))}
              </select>
            </label>
          )}

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.dayOfWeek')}
            <select
              className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary"
              value={dayOfWeek}
              onChange={(e) => setDayOfWeek(Number(e.target.value))}
            >
              {days.map((d) => (
                <option key={d.value} value={d.value}>{d.label}</option>
              ))}
            </select>
          </label>

          <div className="grid grid-cols-2 gap-3">
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('common.startTime')}
              <input
                type="time"
                className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary"
                value={startsAt}
                onChange={(e) => setStartsAt(e.target.value)}
                required
              />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-medium">
              {t('common.endTime')}
              <input
                type="time"
                className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary"
                value={endsAt}
                onChange={(e) => setEndsAt(e.target.value)}
                required
              />
            </label>
          </div>

          <label className="flex flex-col gap-1.5 text-sm font-medium">
            {t('common.room')}
            <input
              className="h-11 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary"
              placeholder="P.302 - Nhà A1"
              value={room}
              onChange={(e) => setRoom(e.target.value)}
              required
            />
          </label>

          <label className="flex items-center gap-3 rounded-lg border bg-muted/20 p-3 text-sm font-medium cursor-pointer">
            <input
              type="checkbox"
              checked={autoStart}
              onChange={(e) => setAutoStart(e.target.checked)}
              className="size-4 rounded border-gray-300 text-primary focus:ring-primary"
            />
            <div>
              <p>{t('common.autoOpen')}</p>
              <p className="text-xs font-normal text-muted-foreground">{t('common.autoStartTooltip')}</p>
            </div>
          </label>

          {error && <div className="rounded-lg bg-rose-50 p-3 text-sm text-rose-700 dark:bg-rose-950/40 dark:text-rose-200">{error}</div>}

          <div className="mt-2 flex justify-end gap-2">
            <Button variant="outline" onClick={onClose}>{t('common.back')}</Button>
            <Button type="submit" disabled={loading}>{loading ? '...' : t('common.saveChanges')}</Button>
          </div>
        </form>
      </div>
    </div>
  )
}

function StaffView({ role, page, go, data, user, organization, refresh }: ViewProps & { role: 'teacher' | 'admin' }) {
  const { t } = useI18n()
  const { courses, sessions, live, metrics, suspicious, auditEvents, users, departments, leaveRequests = [] } = data
  const [search, setSearch] = useState('')
  const [reviewed, setReviewed] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [csvText, setCsvText] = useState('')
  const [importing, setImporting] = useState(false)
  const [importResult, setImportResult] = useState<{
    created: { studentCode: string; name: string; defaultPassword: string }[]
    skipped: { studentCode: string; reason: string }[]
  } | null>(null)

  const [courseModalOpen, setCourseModalOpen] = useState(false)
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false)
  const [selectedCourseId, setSelectedCourseId] = useState<string | undefined>()
  const [selectedSection, setSelectedSection] = useState<ClassSession | undefined>()
  const [projectorMode, setProjectorMode] = useState(false)

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setProjectorMode(false)
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const handleReviewLeave = async (requestId: string, status: 'approved' | 'rejected') => {
    try {
      await api.reviewLeaveRequest(requestId, status)
      setNotice(status === 'approved' ? t('teacher.leaveApproved') : t('teacher.leaveRejected'))
      await refresh()
    } catch {
      setNotice('Lỗi khi xử lý đơn nghỉ phép.')
    }
  }

  const isAdmin = role === 'admin'
  const liveActive = Boolean(live)
  const students = users.filter((item) => item.role === 'student')

  const todayDay = new Date().getDay()
  const todayDayOfWeek = todayDay === 0 ? 7 : todayDay
  const todaySections = sessions.filter((s) => s.dayOfWeek === todayDayOfWeek)

  const startSpecificSession = async (sectionId: string) => {
    try {
      const created = await api.createSession(sectionId)
      if (!created.ok || !created.sessionId) {
        setNotice(created.message ?? t('teacher.updateSessionFailed'))
        return
      }
      const result = await api.sessionAction(created.sessionId, 'start')
      if (!result.ok) { setNotice(result.message ?? t('teacher.updateSessionFailed')); return }
      setNotice(t('teacher.sessionUpdated'))
      await refresh()
      go('sessions')
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.updateSessionFailed'))
    }
  }

  const toggleSession = async () => {
    try {
      let sessionId = live?.sessionId
      if (!sessionId && todaySections[0]) {
        const created = await api.createSession(todaySections[0].sectionId)
        sessionId = created.sessionId
      } else if (!sessionId && sessions[0]) {
        const created = await api.createSession(sessions[0].sectionId)
        sessionId = created.sessionId
      }
      if (!sessionId) { setNotice(t('teacher.noSection')); return }
      const result = await api.sessionAction(sessionId, liveActive ? 'close' : 'start')
      if (!result.ok) { setNotice(result.message ?? t('teacher.updateSessionFailed')); return }
      setNotice(result.message ?? t('teacher.sessionUpdated'))
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.updateSessionFailed'))
    }
  }

  const rotateChallenge = async () => {
    if (!live?.sessionId) return
    try {
      const result = await api.sessionAction(live.sessionId, 'rotate')
      if (!result.ok) { setNotice(result.message ?? t('teacher.rotateFailed')); return }
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.rotateFailed'))
    }
  }

  const deleteSection = async (sectionId: string) => {
    if (!confirm(t('common.confirmDeleteSchedule'))) return
    try {
      const res = await api.deleteSection(sectionId)
      if (res.ok) {
        setNotice(t('common.scheduleDeleted'))
        await refresh()
      }
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Error deleting schedule')
    }
  }

  const presentCount = live?.records.filter((row) => row.status === 'present').length ?? 0
  const lateCount = live?.records.filter((row) => row.status === 'late').length ?? 0

  const runImport = async () => {
    setImporting(true)
    setNotice('')
    try {
      const result = await api.importStudents(csvText)
      setImportResult(result)
      setNotice(t('teacher.importDone', { count: result.created.length }))
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : t('teacher.importFailed'))
    } finally {
      setImporting(false)
    }
  }

  const adminEyebrow = t('admin.administration')
  const staffEyebrow = isAdmin ? adminEyebrow : t('teacher.workspace')

  if (page === 'sessions') {
    return (
      <div className="flex flex-col gap-6">
        {notice && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{notice}</div>}
        <SectionHeader
          eyebrow={t('teacher.workspace')}
          title={t('teacher.liveTitle')}
          detail={t('teacher.liveDetail')}
          action={
            <div className="flex flex-wrap gap-2">
              {liveActive && (
                <Button variant="outline" onClick={() => setProjectorMode(true)}>
                  <Maximize2 />{t('teacher.projectorMode')}
                </Button>
              )}
              <Button variant={liveActive ? 'danger' : 'primary'} onClick={toggleSession}>
                {liveActive ? <><X />{t('teacher.endSession')}</> : <><Play />{t('teacher.startSession')}</>}
              </Button>
            </div>
          }
        />
        {liveActive && live ? (
          <>
            <div className="grid gap-5 xl:grid-cols-[0.9fr_1.3fr_0.9fr]">
              <Card title={t('teacher.sessionDetails')}>
                <div className="flex flex-col gap-3 text-sm">
                  <p><strong>{t('common.course')}</strong><span className="block text-muted-foreground">{live.courseCode} · {live.courseName}</span></p>
                  <p><strong>{t('common.class')}</strong><span className="block text-muted-foreground">{live.room}</span></p>
                  <p><strong>{t('common.time')}</strong><span className="block text-muted-foreground">{formatDayOfWeek(t, live.dayOfWeek)} · {live.startsAt} – {live.endsAt}</span></p>
                  <Status>{t('common.liveNow')}</Status>
                </div>
              </Card>
              <Card title={t('teacher.sessionChallenge')} description={t('teacher.rotatingCode')}>
                <div className="flex flex-col items-center justify-center gap-4 py-3">
                  <DynamicQRCode value={live.challenge} size={200} />
                  <div className="flex items-center gap-3">
                    <span className="rounded-xl bg-primary/10 px-6 py-2.5 font-mono text-3xl font-bold tracking-[0.25em] text-primary">
                      {live.challenge}
                    </span>
                    <CountdownTimer expiresAt={live.challengeExpiresAt} onExpire={rotateChallenge} />
                  </div>
                  <p className="text-xs text-muted-foreground">{t('teacher.shareCode')}</p>
                  <div className="flex flex-wrap gap-2">
                    <Button variant="outline" onClick={rotateChallenge}>
                      <RotateCw />{t('teacher.rotateChallenge')}
                    </Button>
                    <Button variant="outline" onClick={() => setProjectorMode(true)}>
                      <Maximize2 />{t('teacher.projectorMode')}
                    </Button>
                  </div>
                </div>
              </Card>
              <Card title={t('teacher.liveStatistics')}>
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
                  <Metric label={t('common.present')} value={String(presentCount)} detail={t('teacher.verifiedStudents')} icon={CheckCircle2} tone="success" />
                  <Metric label={t('common.late')} value={String(lateCount)} detail={t('common.needsReview')} icon={CalendarDays} tone="warning" />
                  <Metric label={t('teacher.suspiciousAttempts')} value={String(metrics.flagged)} detail={t('common.reviewRequired')} icon={CircleAlert} tone="warning" />
                </div>
              </Card>
            </div>
            <Card title={t('teacher.liveTable')} description={t('teacher.liveTableDetail')}>
              <div className="mb-4 flex items-center gap-2 rounded-lg border px-3">
                <Search className="size-4 text-muted-foreground" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 flex-1 bg-transparent text-sm outline-none" placeholder={t('teacher.searchStudents')} />
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[700px] text-left text-sm">
                  <thead className="text-xs text-muted-foreground">
                    <tr>
                      <th className="pb-3">{t('roles.student')}</th>
                      <th className="pb-3">{t('teacher.checkIn')}</th>
                      <th className="pb-3">{t('common.status')}</th>
                      <th className="pb-3">{t('teacher.manualAttendance')}</th>
                      <th className="pb-3">{t('teacher.verification')}</th>
                      <th className="pb-3">{t('common.device')}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {live.records.filter((row) => row.studentName.toLowerCase().includes(search.toLowerCase())).map((row) => (
                      <tr key={row.id}>
                        <td className="py-3 font-medium">{row.studentName}</td>
                        <td className="py-3">{row.verifiedAt}</td>
                        <td className="py-3">
                          <Status tone={row.status === 'late' ? 'warning' : row.status === 'absent' ? 'danger' : row.status === 'excused' ? 'neutral' : 'success'}>
                            {statusText(t, row.status)}
                          </Status>
                        </td>
                        <td className="py-3">
                          <select
                            value={row.status}
                            onChange={async (e) => {
                              const newStatus = e.target.value as AttendanceStatus
                              await api.overrideAttendance(row.id, newStatus)
                              setNotice(t('teacher.statusOverridden'))
                              await refresh()
                            }}
                            className="rounded-lg border border-slate-200 bg-background px-2.5 py-1 text-xs font-medium cursor-pointer"
                          >
                            <option value="present">{t('status.present')}</option>
                            <option value="late">{t('status.late')}</option>
                            <option value="absent">{t('status.absent')}</option>
                            <option value="excused">{t('status.excused')}</option>
                          </select>
                        </td>
                        <td className="py-3">{row.confidence}%</td>
                        <td className="py-3 text-muted-foreground">{row.device}</td>
                      </tr>
                    ))}
                    {live.records.length === 0 && (
                      <tr>
                        <td colSpan={6} className="py-8 text-center text-sm text-muted-foreground">
                          {t('teacher.waitingSession')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </Card>

            {/* Projector Mode Fullscreen Overlay */}
            {projectorMode && (
              <div className="fixed inset-0 z-50 flex flex-col justify-between bg-[#06152d] text-white p-6 sm:p-10 select-none">
                {/* Top Header */}
                <div className="flex items-center justify-between border-b border-white/10 pb-4">
                  <div className="flex items-center gap-3">
                    <UtcLogo compact={false} textColor="text-white" />
                    <div className="hidden sm:block border-l border-white/20 pl-3">
                      <h2 className="text-base font-bold tracking-tight text-white">{live.courseCode} · {live.courseName}</h2>
                      <p className="text-xs text-blue-300">Phòng {live.room} · {formatDayOfWeek(t, live.dayOfWeek)} ({live.startsAt} – {live.endsAt})</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="rounded-xl bg-emerald-500/20 px-3.5 py-1.5 text-xs font-semibold text-emerald-300 border border-emerald-400/30 flex items-center gap-2">
                      <span className="size-2 rounded-full bg-emerald-400 animate-ping" />
                      {t('common.liveNow')} · {live.records.length} đã điểm danh
                    </div>
                    <button
                      type="button"
                      onClick={() => setProjectorMode(false)}
                      className="flex items-center gap-2 rounded-xl bg-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/20 transition-colors cursor-pointer border border-white/20"
                    >
                      <Minimize2 className="size-4" /> {t('teacher.exitProjector')} (Esc)
                    </button>
                  </div>
                </div>

                {/* Centered Large QR and Code */}
                <div className="flex flex-1 flex-col items-center justify-center py-6 text-center">
                  <div className="rounded-3xl border-4 border-blue-400/30 bg-white p-6 shadow-2xl shadow-blue-500/20">
                    <DynamicQRCode value={live.challenge} size={320} />
                  </div>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-4">
                    <span className="rounded-2xl border border-blue-400/40 bg-blue-900/60 px-8 py-3 font-mono text-5xl sm:text-6xl font-extrabold tracking-[0.35em] text-white shadow-lg">
                      {live.challenge}
                    </span>
                    <div className="scale-125">
                      <CountdownTimer expiresAt={live.challengeExpiresAt} onExpire={rotateChallenge} />
                    </div>
                  </div>
                  <p className="mt-4 text-sm font-medium text-blue-200 max-w-md">
                    {t('teacher.projectorHint')}
                  </p>
                </div>

                {/* Bottom Footer Info */}
                <div className="flex items-center justify-between border-t border-white/10 pt-4 text-xs text-slate-400">
                  <span>Hệ thống Điểm danh Thông minh UTC · Chống gian lận thời gian thực</span>
                  <button
                    type="button"
                    onClick={rotateChallenge}
                    className="flex items-center gap-1.5 text-blue-300 hover:text-white transition-colors cursor-pointer font-medium"
                  >
                    <RotateCw className="size-4" /> {t('teacher.rotateChallenge')}
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="flex flex-col gap-6">
            <Card title={t('common.todayClass')} description={t('common.scheduleDetail')}>
              {todaySections.length > 0 ? (
                <div className="divide-y">
                  {todaySections.map((sec) => (
                    <div key={sec.sectionId} className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-foreground">{sec.courseCode} · {sec.courseName}</span>
                          {sec.autoStart && <span className="rounded bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">{t('common.autoOpen')}</span>}
                        </div>
                        <p className="mt-1 text-xs text-muted-foreground">
                          <Calendar className="mr-1 inline size-3.5" />{formatDayOfWeek(t, sec.dayOfWeek)} · <Clock className="mr-1 inline size-3.5" />{sec.startsAt} – {sec.endsAt} · {sec.room} · {t('teacher.enrolledCount', { count: sec.enrolledCount ?? 0 })}
                        </p>
                      </div>
                      <Button onClick={() => startSpecificSession(sec.sectionId)}>
                        <Play className="size-4" />{t('common.startScheduledSession')}
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  <p>{t('common.noClassToday')}</p>
                </div>
              )}
            </Card>

            <Card title={t('common.allClassSessions')} description={organization.name}>
              <div className="divide-y">
                {sessions.map((sec) => (
                  <div key={sec.sectionId} className="flex flex-wrap items-center justify-between gap-4 py-3">
                    <div>
                      <p className="font-medium text-sm">{sec.courseCode} · {sec.courseName}</p>
                      <p className="text-xs text-muted-foreground">
                        {formatDayOfWeek(t, sec.dayOfWeek)} · {sec.startsAt} – {sec.endsAt} · {sec.room}
                      </p>
                    </div>
                    <Button variant="outline" onClick={() => startSpecificSession(sec.sectionId)}>
                      <Play className="size-3.5" />{t('teacher.startAttendance')}
                    </Button>
                  </div>
                ))}
              </div>
            </Card>
          </div>
        )}
      </div>
    )
  }

  if (page === 'courses' || (isAdmin && page === 'departments')) {
    return (
      <div className="flex flex-col gap-6">
        {notice && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{notice}</div>}
        <SectionHeader
          eyebrow={staffEyebrow}
          title={page === 'departments' ? t('teacher.departmentsTitle') : t('common.recurringSchedule')}
          detail={t('common.scheduleDetail')}
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setCourseModalOpen(true)}>
                <Plus />{t('common.createNewCourse')}
              </Button>
              <Button onClick={() => { setSelectedSection(undefined); setSelectedCourseId(undefined); setScheduleModalOpen(true) }}>
                <CalendarDays />{t('common.addSchedule')}
              </Button>
            </div>
          }
        />

        {courseModalOpen && (
          <CourseModal
            departments={departments}
            onClose={() => setCourseModalOpen(false)}
            onCreated={async () => {
              setNotice(t('common.courseCreated'))
              await refresh()
            }}
            t={t}
          />
        )}

        {scheduleModalOpen && (
          <ScheduleModal
            courses={courses}
            initialCourseId={selectedCourseId}
            initialSection={selectedSection}
            onClose={() => setScheduleModalOpen(false)}
            onSaved={async () => {
              setNotice(t('common.scheduleSaved'))
              await refresh()
            }}
            t={t}
          />
        )}

        <div className="flex flex-col gap-6">
          {courses.map((course) => {
            const courseSections = sessions.filter((s) => s.courseId === course.id)
            return (
              <Card
                key={course.id}
                title={`${course.code} — ${course.name}`}
                description={`${course.department} · ${t('teacher.enrolledCount', { count: course.enrolled })}`}
                action={
                  <Button
                    variant="outline"
                    className="text-xs"
                    onClick={() => {
                      setSelectedSection(undefined)
                      setSelectedCourseId(course.id)
                      setScheduleModalOpen(true)
                    }}
                  >
                    <Plus />{t('common.addSchedule')}
                  </Button>
                }
              >
                {courseSections.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[650px] text-left text-sm">
                      <thead className="text-xs text-muted-foreground">
                        <tr>
                          <th className="pb-2.5">{t('common.dayOfWeek')}</th>
                          <th className="pb-2.5">{t('common.time')}</th>
                          <th className="pb-2.5">{t('common.room')}</th>
                          <th className="pb-2.5">{t('common.autoOpen')}</th>
                          <th className="pb-2.5">{t('common.students')}</th>
                          <th className="pb-2.5 text-right">{t('common.action')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {courseSections.map((sec) => (
                          <tr key={sec.sectionId} className="hover:bg-muted/40 transition-colors">
                            <td className="py-3 font-medium text-foreground">
                              <span className="inline-flex items-center gap-1.5">
                                <Calendar className="size-3.5 text-primary" />
                                {formatDayOfWeek(t, sec.dayOfWeek)}
                              </span>
                            </td>
                            <td className="py-3 font-mono text-xs">
                              {sec.startsAt} – {sec.endsAt}
                            </td>
                            <td className="py-3 font-medium">{sec.room}</td>
                            <td className="py-3">
                              {sec.autoStart ? (
                                <Status tone="success">{t('common.active')}</Status>
                              ) : (
                                <Status tone="neutral">{t('common.off')}</Status>
                              )}
                            </td>
                            <td className="py-3 text-muted-foreground">{sec.enrolledCount ?? 0}</td>
                            <td className="py-3 text-right">
                              <div className="flex items-center justify-end gap-1.5">
                                <Button
                                  variant="primary"
                                  className="h-8 px-2.5 text-xs"
                                  onClick={() => startSpecificSession(sec.sectionId)}
                                >
                                  <Play className="size-3" />{t('teacher.startAttendance')}
                                </Button>
                                <Button
                                  variant="outline"
                                  className="h-8 px-2.5 text-xs"
                                  onClick={() => {
                                    setSelectedSection(sec)
                                    setSelectedCourseId(sec.courseId)
                                    setScheduleModalOpen(true)
                                  }}
                                >
                                  <Edit3 className="size-3" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  className="h-8 px-2 text-xs text-destructive hover:bg-destructive/10"
                                  onClick={() => deleteSection(sec.sectionId)}
                                >
                                  <Trash2 className="size-3.5" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="py-6 text-center text-sm text-muted-foreground">
                    <p>{t('common.noScheduleYet')}</p>
                    <Button
                      variant="outline"
                      className="mt-3 text-xs"
                      onClick={() => {
                        setSelectedSection(undefined)
                        setSelectedCourseId(course.id)
                        setScheduleModalOpen(true)
                      }}
                    >
                      <Plus className="size-3.5" />{t('common.addSchedule')}
                    </Button>
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      </div>
    )
  }

  if (page === 'students') return (
    <div className="flex flex-col gap-6">
      {notice && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{notice}</div>}
      <SectionHeader
        eyebrow={staffEyebrow}
        title={t('teacher.studentsTitle')}
        detail={t('teacher.rosterDetail')}
        action={<Button onClick={() => setImportOpen(!importOpen)}><FileText />{t('teacher.importStudents')}</Button>}
      />
      {importOpen && (
        <StudentImportPanel
          csvText={csvText}
          setCsvText={setCsvText}
          importing={importing}
          importResult={importResult}
          onImport={runImport}
          onClose={() => setImportOpen(false)}
          t={t}
        />
      )}
      <Card title={t('teacher.studentDirectory')} description={organization.name}>
        <div className="mb-4 flex items-center gap-2 rounded-lg border px-3">
          <Search className="size-4 text-muted-foreground" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 flex-1 bg-transparent text-sm outline-none" placeholder={t('common.search')} />
        </div>
        <div className="divide-y">
          {students.filter((s) => `${s.name} ${s.studentCode}`.toLowerCase().includes(search.toLowerCase())).map((student) => (
            <div key={student.id} className="flex items-center gap-3 py-4">
              <div className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">
                {student.initials?.slice(0, 2) ?? student.name.slice(0, 2).toUpperCase()}
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium">{student.name}</p>
                <p className="text-xs text-muted-foreground">{student.studentCode || student.email}</p>
              </div>
            </div>
          ))}
          {students.length === 0 && <p className="py-8 text-center text-sm text-muted-foreground">{t('teacher.noStudentsYet')}</p>}
        </div>
      </Card>
    </div>
  )

  if (page === 'analytics' || page === 'reports') return <div className="flex flex-col gap-6"><SectionHeader eyebrow={staffEyebrow} title={page === 'reports' ? t('teacher.reportsTitle') : t('teacher.analyticsTitle')} detail={t('teacher.analyticsDetail')} action={<Button variant="outline" onClick={() => api.downloadAttendanceReport()}><Download />{page === 'reports' ? t('common.exportReport') : t('common.exportData')}</Button>} /><div className="grid gap-4 sm:grid-cols-3"><Metric label={t('teacher.averageAttendance')} value={metrics.attendanceRate} detail={t('common.organizationAverage')} icon={BarChart3} /><Metric label={t('teacher.students')} value={String(metrics.students)} detail={t('common.enrolled')} icon={Users} /><Metric label={t('teacher.suspiciousAttempts')} value={String(metrics.flagged)} detail={t('common.needsReview')} icon={CircleAlert} tone="warning" /></div><Card title={t('teacher.attendanceByCourse')}><div className="flex flex-col gap-5">{courses.map((course) => <div key={course.id}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{course.code} · {course.name}</span><span className="text-muted-foreground">{t('teacher.enrolledCount', { count: course.enrolled })}</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 w-3/4 rounded-full bg-primary" /></div><div className="mt-3 flex items-center gap-2"><Button variant="outline" className="text-xs" onClick={() => api.downloadAttendanceReport({ courseId: course.id })}><Download />{t('common.export')}</Button><Button variant="outline" className="text-xs" onClick={() => api.downloadAttendanceReport({ courseId: course.id, scope: 'detail' })}><Download />{t('teacher.detailedCsv')}</Button></div></div>)}</div></Card></div>
  if (page === 'audit') return <div className="flex flex-col gap-6"><SectionHeader eyebrow={adminEyebrow} title={t('teacher.activityLog')} detail={t('teacher.activityDetail')} action={<Button variant="outline" onClick={() => api.downloadAuditReport()}><Download />{t('common.exportLog')}</Button>} /><Card title={t('teacher.recentActivity')} description={organization.name}><div className="divide-y">{auditEvents.map((event) => <div key={event.id} className="flex gap-4 py-4"><div className={`mt-1 size-2 rounded-full ${event.severity === 'warning' ? 'bg-amber-500' : 'bg-primary'}`} /><div className="flex-1"><p className="text-sm"><span className="font-medium">{event.actor}</span> {event.action}</p><p className="mt-1 text-xs text-muted-foreground">{event.target} · {event.createdAt}</p></div><Status tone={event.severity === 'warning' ? 'warning' : 'neutral'}>{statusText(t, event.severity)}</Status></div>)}</div></Card></div>
  if (page === 'settings') return <div className="flex flex-col gap-6"><SectionHeader eyebrow={staffEyebrow} title={t('teacher.settingsTitle')} detail={t('teacher.settingsDetail')} /><Card title={t('teacher.orgProfile')}><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium">{t('teacher.orgName')}<input className="h-11 rounded-lg border bg-background px-3" defaultValue={organization.name} /></label><label className="flex flex-col gap-2 text-sm font-medium">{t('teacher.attendancePolicy')}<input className="h-11 rounded-lg border bg-background px-3" defaultValue={t('teacher.policyDefault')} /></label></div><Button className="mt-5" onClick={() => { setSaved(true); setNotice(t('teacher.settingsSaved')) }}>{saved ? <><Check />{t('common.saved')}</> : t('common.saveChanges')}</Button></Card></div>
  return (
    <div className="flex flex-col gap-6">
      {notice && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800 flex items-center justify-between">
          <span>{notice}</span>
          <button onClick={() => setNotice('')} className="text-emerald-600 hover:text-emerald-900 cursor-pointer">
            <X className="size-4" />
          </button>
        </div>
      )}
      <SectionHeader
        eyebrow={staffEyebrow}
        title={t('teacher.goodMorning', { name: user.name.split(' ').slice(-1)[0] === 'Patel' ? 'Dr. Patel' : user.name.split(' ')[0] })}
        detail={t('teacher.overviewDetail')}
        action={
          <Button onClick={() => go(isAdmin ? 'analytics' : 'sessions')}>
            <Wifi />{isAdmin ? t('teacher.viewAnalytics') : t('teacher.openLiveSession')}
          </Button>
        }
      />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label={isAdmin ? t('teacher.totalStudents') : t('teacher.todaysAttendance')} value={isAdmin ? metrics.students.toLocaleString() : metrics.attendanceRate} detail={isAdmin ? t('teacher.orgTotal') : t('teacher.acrossClasses')} icon={ClipboardCheck} />
        <Metric label={isAdmin ? t('teacher.totalTeachers') : t('teacher.activeStudents')} value={isAdmin ? String(metrics.teachers) : String(students.length)} detail={t('common.updatedToday')} icon={Users} />
        <Metric label={isAdmin ? t('teacher.activeSessions') : t('teacher.liveSessions')} value={String(metrics.activeSessions)} detail={t('common.runningNow')} icon={Wifi} />
        <Metric label={t('common.needsReview')} value={String(metrics.flagged)} detail={t('teacher.suspiciousAttempts')} icon={CircleAlert} tone="warning" />
      </div>

      {/* Leave Requests Review Panel */}
      <Card title={t('teacher.leaveClaims')} description={t('teacher.leaveClaimsDetail')}>
        {leaveRequests.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">{t('teacher.noLeaveClaims')}</p>
        ) : (
          <div className="divide-y">
            {leaveRequests.map((req) => (
              <div key={req.id} className="py-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-sm text-foreground">{req.studentName}</span>
                    {req.studentCode && <span className="rounded bg-slate-100 px-2 py-0.5 font-mono text-[11px] text-slate-700">{req.studentCode}</span>}
                    <span className="text-muted-foreground">· {req.courseName} ({req.date})</span>
                  </div>
                  <p className="text-muted-foreground"><strong>{t('student.absenceReason')}:</strong> {req.reason}</p>
                  {req.evidenceNote && <p className="text-muted-foreground text-[11px]"><strong>{t('student.evidenceNote')}:</strong> {req.evidenceNote}</p>}
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {req.status === 'pending' ? (
                    <>
                      <button
                        type="button"
                        onClick={() => handleReviewLeave(req.id, 'approved')}
                        className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white shadow-xs hover:bg-emerald-700 transition-colors cursor-pointer"
                      >
                        {t('teacher.approveLeave')}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleReviewLeave(req.id, 'rejected')}
                        className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-1.5 font-medium text-rose-700 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        {t('teacher.rejectLeave')}
                      </button>
                    </>
                  ) : (
                    <Status tone={req.status === 'approved' ? 'success' : 'danger'}>
                      {req.status === 'approved' ? 'Đã duyệt có phép' : 'Đã từ chối'}
                    </Status>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card title={t('teacher.suspiciousAttendance')} description={t('teacher.suspiciousDetail')} action={<Button variant="ghost" onClick={() => go('students')}>{t('common.viewAll')} <ChevronRight /></Button>}>
        <div className="divide-y">
          {suspicious.map((item) => (
            <div className="flex items-center gap-3 py-3" key={item.id}>
              <CircleAlert className="text-amber-600" />
              <p className="flex-1 text-sm">{item.reason}</p>
              {reviewed.includes(item.id) ? (
                <Status>{t('common.reviewed')}</Status>
              ) : (
                <Button variant="outline" onClick={() => setReviewed([...reviewed, item.id])}>
                  {t('common.review')}
                </Button>
              )}
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

const emptyDashboard: DashboardData = {
  courses: [], sessions: [], records: [], notifications: [], metrics: { students: 0, teachers: 0, activeSessions: 0, attendanceRate: '0%', flagged: 0 },
  suspicious: [], auditEvents: [], live: null, devices: [], departments: [], users: [], leaveRequests: [],
}

function NotificationBell({
  notifications,
  role,
  go,
  t,
}: {
  notifications: DashboardData['notifications']
  role: Role
  go: (page: PageKey) => void
  t: (key: string, params?: Record<string, string | number>) => string
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)
  const unreadCount = notifications.filter((item) => !item.read).length

  useEffect(() => {
    if (!open) return
    const close = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  const handleClick = () => {
    if (role === 'student') {
      go('notifications')
      return
    }
    setOpen((value) => !value)
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={handleClick}
        className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted"
        aria-label={t('header.notifications')}
        aria-expanded={open}
      >
        <Bell className="size-4" />
        {unreadCount > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-primary" />}
      </button>
      {open && role !== 'student' && (
        <div className="absolute right-0 top-full z-30 mt-2 w-80 overflow-hidden rounded-xl border bg-card shadow-lg">
          <div className="border-b px-4 py-3">
            <p className="text-sm font-semibold">{t('header.notifications')}</p>
            {unreadCount > 0 && (
              <p className="text-xs text-muted-foreground">{t('student.unreadCount', { count: unreadCount })}</p>
            )}
          </div>
          <div className="max-h-80 overflow-y-auto">
            {notifications.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">{t('header.noNotifications')}</p>
            ) : (
              notifications.slice(0, 8).map((item) => (
                <div
                  key={item.id}
                  className={`border-b px-4 py-3 last:border-b-0 ${!item.read ? 'bg-primary/5' : ''}`}
                >
                  <p className="text-sm font-medium">{item.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.body}</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">{item.createdAt}</p>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  )
}

export default function SmartAttendApp() {
  const router = useRouter()
  const { t } = useI18n()
  const [role, setRole] = useState<AuthUser>(null)
  const [portal, setPortal] = useState<'student' | 'staff'>('student')
  const [authScreen, setAuthScreen] = useState<AuthScreen>('landing')
  const [page, setPage] = useState<PageKey>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [data, setData] = useState<DashboardData>(emptyDashboard)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [organization, setOrganization] = useState<{ name: string; plan: string }>({ name: 'SmartAttend', plan: 'Campus Plus' })
  const [mustChangePassword, setMustChangePassword] = useState(false)

  const hydrateUser = (user: NonNullable<Awaited<ReturnType<typeof api.me>>['user']>, nextRole: Role) => {
    setAppUser({
      name: user.name,
      email: user.email,
      initials: user.initials,
      department: user.department,
      role: nextRole,
      studentCode: user.studentCode,
      mustChangePassword: user.mustChangePassword,
    })
    setMustChangePassword(user.mustChangePassword)
  }

  const refresh = async () => {
    try {
      const next = await loadDashboard(role ?? undefined)
      setData(next)
    } catch {
      /* keep previous data */
    }
  }

  const openPortal = (next: 'student' | 'staff') => {
    setPortal(next)
    setAuthScreen('login')
    router.push(next === 'student' ? '/student/login' : '/staff/login')
  }

  const openRegister = () => {
    setAuthScreen('register')
    router.push('/staff/register')
  }

  const goHome = async () => {
    setAuthScreen('landing')
    setMobileOpen(false)
    if (role) {
      await api.logout()
      setRole(null)
      setAppUser(null)
      setData(emptyDashboard)
      setMustChangePassword(false)
    }
    router.push('/')
  }

  useEffect(() => {
    const id = window.setTimeout(async () => {
      const path = window.location.pathname
      setAuthScreen(initialAuthScreen(path))
      if (path.startsWith('/student')) setPortal('student')
      else if (path.startsWith('/staff') || path.startsWith('/teacher') || path.startsWith('/admin')) setPortal('staff')

      try {
        const me = await api.me()
        if (me.ok && me.user && me.organization) {
          const nextRole = me.user.role
          if (canAccessRole(nextRole, path)) {
            setRole(nextRole)
            setPage(pageFromPath(path, nextRole))
            hydrateUser(me.user, nextRole)
            setOrganization({ name: me.organization.name, plan: me.organization.plan })
            const next = await loadDashboard(nextRole)
            setData(next)
          } else {
            window.history.replaceState({}, '', '/unauthorized')
          }
        }
      } catch {
        /* not signed in */
      }

      setHydrated(true)
    }, 0)
    return () => window.clearTimeout(id)
  }, [])

  useEffect(() => { document.documentElement.classList.toggle('dark', dark) }, [dark])

  useEffect(() => {
    if (!role || !hydrated) return
    const interval = setInterval(async () => {
      try {
        const next = await loadDashboard(role)
        setData(next)
      } catch {
        /* ignore polling errors */
      }
    }, data.live ? 3000 : 10000)
    return () => clearInterval(interval)
  }, [role, hydrated, data.live])

  const go = (next: PageKey) => {
    setPage(next)
    setMobileOpen(false)
    if (!role) return
    window.history.replaceState({}, '', role === 'student' ? `/student/${next === 'overview' ? 'dashboard' : next}` : role === 'teacher' ? `/teacher/${next === 'overview' ? 'dashboard' : next}` : `/admin/${next === 'overview' ? 'dashboard' : next}`)
  }

  const login = async (next: Role, forcePasswordChange = false) => {
    setRole(next)
    setPage('overview')
    const me = await api.me()
    if (me.ok && me.user && me.organization) {
      hydrateUser(me.user, next)
      setOrganization({ name: me.organization.name, plan: me.organization.plan })
      setMustChangePassword(forcePasswordChange || me.user.mustChangePassword)
    }
    await refresh()
    setAuthScreen('login')
    router.push(`/${next === 'student' ? 'student' : next === 'teacher' ? 'teacher' : 'admin'}/dashboard`)
  }

  const logout = async () => {
    await api.logout()
    setRole(null)
    setAppUser(null)
    setMustChangePassword(false)
    setData(emptyDashboard)
    setPortal('student')
    setAuthScreen('login')
    router.push('/student/login')
  }

  if (!hydrated) return <div className="min-h-screen bg-[#071935]" aria-hidden="true" />
  if (!role || !appUser) {
    if (authScreen === 'register') {
      return (
        <RegisterScreen
          onRegistered={(next) => login(next)}
          onBack={() => {
            setAuthScreen('login')
            router.push('/staff/login')
          }}
          onHome={goHome}
        />
      )
    }
    return (
      <UtcLoginLanding
        onLogin={login}
        onRegister={openRegister}
        organizationName={organization.name}
      />
    )
  }

  const items = nav[role]
  const viewProps: ViewProps = {
    page,
    go,
    data,
    user: appUser,
    organization,
    refresh,
    onPasswordChanged: async () => {
      const me = await api.me()
      if (me.ok && me.user && role) {
        hydrateUser(me.user, role)
        setMustChangePassword(me.user.mustChangePassword)
      }
    },
  }

  return (
    <div className="min-h-screen utc-portal-bg flex flex-col selection:bg-blue-600 selection:text-white">
      {mustChangePassword && role === 'student' && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-xl border bg-card p-6 shadow-xl">
            <h2 className="text-lg font-semibold">{t('auth.mustChangePasswordTitle')}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{t('auth.mustChangePasswordDetail')}</p>
            <div className="mt-5">
              <ChangePasswordForm
                forced
                onSuccess={async () => {
                  setMustChangePassword(false)
                  const me = await api.me()
                  if (me.ok && me.user) hydrateUser(me.user, role)
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* Top Header Bar */}
      <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200/80 bg-white/90 px-4 backdrop-blur-md dark:border-slate-800 dark:bg-[#111d33]/90 sm:px-6 shadow-xs">
        <div className="flex items-center gap-3">
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 lg:hidden dark:text-slate-300 dark:hover:bg-slate-800 cursor-pointer"
            aria-label={t('header.openNav')}
          >
            <Menu className="size-5" />
          </button>
          <div className="lg:hidden">
            <UtcLogo compact size={36} textColor="text-slate-800 dark:text-white" />
          </div>
        </div>

        {/* Central Search Capsule Bar */}
        <div className="flex-1 max-w-md mx-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
            <input
              type="text"
              placeholder={t('student.searchPlaceholder')}
              className="h-9 w-full rounded-full border border-slate-200 bg-slate-100/80 pl-9 pr-4 text-xs text-slate-800 placeholder:text-slate-400 outline-none transition-all focus:border-blue-600 focus:bg-white focus:ring-2 focus:ring-blue-600/20 dark:border-slate-700 dark:bg-slate-800/80 dark:text-slate-100 dark:focus:bg-slate-800"
            />
          </div>
        </div>

        {/* Right Tools & User Profile Chip */}
        <div className="flex items-center gap-2.5">
          <LanguageSwitcher compact />
          <button
            onClick={() => setDark(!dark)}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800 cursor-pointer transition-colors"
            aria-label={t('header.toggleDark')}
          >
            <Moon className="size-4" />
          </button>
          <NotificationBell notifications={data.notifications} role={role} go={go} t={t} />

          {/* User Profile Chip */}
          <div className="flex items-center gap-2 rounded-full border border-slate-200/80 bg-slate-50 py-1 pl-1 pr-3 shadow-2xs dark:border-slate-700 dark:bg-slate-800">
            <div className="grid size-7 place-items-center rounded-full bg-blue-600 text-xs font-bold text-white shadow-2xs">
              {appUser.initials}
            </div>
            <span className="hidden text-xs font-bold text-slate-800 dark:text-slate-100 sm:inline-block">
              {appUser.name}
            </span>
            <ChevronDown className="size-3.5 text-slate-400" />
          </div>
        </div>
      </header>

      <div className="flex flex-1">
        {/* Sidebar Navigation */}
        <aside
          className={
            mobileOpen
              ? 'fixed inset-x-0 top-16 z-20 border-b utc-sidebar-bg p-4 text-white shadow-xl lg:static lg:block lg:min-h-[calc(100vh-4rem)] lg:w-64 lg:border-b-0 lg:border-r lg:border-slate-800'
              : 'hidden fixed inset-x-0 top-16 z-20 border-b utc-sidebar-bg p-4 text-white shadow-xl lg:static lg:block lg:min-h-[calc(100vh-4rem)] lg:w-64 lg:border-b-0 lg:border-r lg:border-slate-800'
          }
        >
          {/* Top Logo inside Sidebar */}
          <div className="mb-6 pb-4 border-b border-white/10 hidden lg:block">
            <UtcLogo size={38} textColor="text-white" />
          </div>

          <nav className="flex flex-col gap-1.5">
            {items.map(({ key, labelKey, icon: Icon }) => (
              <button
                key={key}
                onClick={() => go(key)}
                className={`flex items-center justify-between rounded-xl px-3.5 py-2.5 text-xs font-bold transition-all cursor-pointer ${
                  page === key
                    ? 'bg-blue-600 text-white shadow-sm'
                    : 'text-slate-300 hover:bg-white/10 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Icon className="size-4 shrink-0" />
                  <span>{t(labelKey)}</span>
                </div>
                {key !== 'overview' && key !== 'profile' && key !== 'settings' && (
                  <ChevronRight className="size-3.5 opacity-50" />
                )}
              </button>
            ))}

            <div className="my-3 border-t border-white/10" />

            <button
              onClick={logout}
              className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-300 hover:bg-rose-500/20 hover:text-rose-300 transition-colors cursor-pointer"
            >
              <LogOut className="size-4" />
              {t('common.logout')}
            </button>
          </nav>
        </aside>

        {/* Main Content Area */}
        <main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8">
          <div className="mx-auto max-w-7xl">
            {role === 'student' ? <StudentView {...viewProps} /> : <StaffView {...viewProps} role={role} />}
          </div>
        </main>
      </div>

      {/* Mobile Bottom Navigation */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-slate-200 bg-white p-2 dark:border-slate-800 dark:bg-[#111d33] lg:hidden shadow-lg">
        {items.slice(0, 4).map(({ key, labelKey, icon: Icon }) => (
          <button
            key={key}
            onClick={() => go(key)}
            className={`flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] font-medium transition-colors ${
              page === key ? 'text-blue-600 font-bold' : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            <Icon className="size-4" />
            <span className="truncate max-w-[70px]">{t(labelKey)}</span>
          </button>
        ))}
      </nav>
    </div>
  )
}
