'use client'

import { useState, useEffect, useCallback, useRef, type FormEvent } from 'react'
import QRCode from 'qrcode'
import {
  Activity,
  BarChart3,
  Bell,
  BookOpen,
  ClipboardCheck,
  Eye,
  EyeOff,
  FileText,
  GraduationCap,
  LayoutDashboard,
  ScanLine,
  Settings2,
  Smartphone,
  UserRound,
  Users,
  Wifi,
} from 'lucide-react'
import { useI18n } from '@/components/i18n-provider'
import type { AttendanceRecord, Role } from '@/lib/types/domain'
import type { DashboardData } from '@/lib/api/client'

export type PageKey =
  | 'overview'
  | 'join'
  | 'history'
  | 'courses'
  | 'devices'
  | 'notifications'
  | 'profile'
  | 'sessions'
  | 'students'
  | 'analytics'
  | 'reports'
  | 'settings'
  | 'audit'
  | 'departments'
export type AuthUser = Role | null

export type AppUser = {
  id?: string
  name: string
  email: string
  initials: string
  department: string | null
  role: Role
  studentCode: string | null
  mustChangePassword: boolean
}

export type IconType = React.ComponentType<{ className?: string }>

export type ViewProps = {
  page: PageKey
  go: (p: PageKey) => void
  data: DashboardData
  user: AppUser
  organization: { name: string; plan: string }
  refresh: () => Promise<void>
  onPasswordChanged?: () => Promise<void>
}

export function calcAttendanceRate(records: AttendanceRecord[]) {
  if (!records.length) return 0
  return Math.round((records.filter((row) => row.status === 'present' || row.status === 'late').length / records.length) * 100)
}

export type AuthScreen = 'landing' | 'login' | 'register'

export function initialAuthScreen(path: string): AuthScreen {
  if (path === '/') return 'landing'
  if (path.endsWith('/register')) return 'register'
  if (path.endsWith('/login')) return 'login'
  return 'login'
}

export function pageFromPath(path: string, role: Role): PageKey {
  const segment = path.split('/').filter(Boolean).at(1)
  const aliases: Record<string, PageKey> = { dashboard: 'overview', attendance: role === 'teacher' ? 'sessions' : 'join', history: 'history', classes: 'courses', courses: 'courses', notifications: 'notifications', devices: 'devices', profile: 'profile', students: 'students', analytics: 'analytics', reports: 'reports', settings: 'settings', activity: 'audit', departments: 'departments' }
  return aliases[segment ?? 'dashboard'] ?? 'overview'
}

export const nav: Record<Role, { key: PageKey; labelKey: string; icon: IconType }[]> = {
  student: [
    { key: 'overview', labelKey: 'nav.student.overview', icon: LayoutDashboard },
    { key: 'notifications', labelKey: 'nav.student.notifications', icon: Bell },
    { key: 'courses', labelKey: 'nav.student.courses', icon: GraduationCap },
    { key: 'join', labelKey: 'nav.student.join', icon: ScanLine },
    { key: 'history', labelKey: 'nav.student.history', icon: ClipboardCheck },
    { key: 'devices', labelKey: 'nav.student.devices', icon: Smartphone },
    { key: 'profile', labelKey: 'nav.student.profile', icon: UserRound },
  ],
  teacher: [
    { key: 'overview', labelKey: 'nav.teacher.overview', icon: LayoutDashboard }, { key: 'sessions', labelKey: 'nav.teacher.sessions', icon: Wifi },
    { key: 'courses', labelKey: 'nav.teacher.courses', icon: BookOpen }, { key: 'students', labelKey: 'nav.teacher.students', icon: Users },
    { key: 'analytics', labelKey: 'nav.teacher.analytics', icon: BarChart3 }, { key: 'reports', labelKey: 'nav.teacher.reports', icon: FileText }, { key: 'settings', labelKey: 'nav.teacher.settings', icon: Settings2 },
  ],
  admin: [
    { key: 'overview', labelKey: 'nav.admin.overview', icon: LayoutDashboard }, { key: 'students', labelKey: 'nav.admin.students', icon: GraduationCap },
    { key: 'courses', labelKey: 'nav.admin.courses', icon: BookOpen }, { key: 'departments', labelKey: 'nav.admin.departments', icon: Activity },
    { key: 'analytics', labelKey: 'nav.admin.analytics', icon: BarChart3 }, { key: 'reports', labelKey: 'nav.admin.reports', icon: FileText }, { key: 'audit', labelKey: 'nav.admin.audit', icon: Activity }, { key: 'settings', labelKey: 'nav.admin.settings', icon: Settings2 },
  ],
}

export function statusText(t: (key: string) => string, status: string) {
  return t(`status.${status}`) || status
}

import { UtcLogo } from './utc-logo'

export function Logo({
  compact = false,
  onClick,
  textColor = 'text-foreground',
  logoOnly = false,
}: {
  compact?: boolean
  onClick?: () => void
  textColor?: string
  logoOnly?: boolean
}) {
  const { t } = useI18n()
  const mark = <UtcLogo compact={compact || logoOnly} textColor={textColor} />
  if (!onClick) return <div className="flex items-center gap-2.5">{mark}</div>
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2.5 rounded-lg text-left transition-opacity hover:opacity-90"
      aria-label={t('routeStates.backHome')}
    >
      {mark}
    </button>
  )
}

export function Status({ children, tone = 'success' }: { children: React.ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const styles = {
    success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/30',
    warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200/50 dark:border-amber-800/30',
    danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200/50 dark:border-rose-800/30',
    neutral: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200 dark:border-slate-700',
  }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium shadow-xs ${styles[tone]}`}><span className="size-1.5 rounded-full bg-current" />{children}</span>
}

export function Button({ children, variant = 'primary', onClick, type = 'button', disabled, className = '' }: { children: React.ReactNode; variant?: 'primary' | 'outline' | 'ghost' | 'danger' | 'microsoft'; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  const styles = {
    primary: 'bg-[#1e4da1] text-white hover:bg-[#163c80] active:scale-[0.99] shadow-sm',
    outline: 'border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 shadow-xs',
    ghost: 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800/60 dark:hover:text-slate-200',
    danger: 'bg-rose-600 text-white hover:bg-rose-700 active:scale-[0.99] shadow-sm',
    microsoft: 'bg-[#0078d4] text-white hover:bg-[#006cbd] active:scale-[0.99] shadow-sm',
  }
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-150 disabled:pointer-events-none disabled:opacity-50 cursor-pointer ${styles[variant]} ${className}`}>{children}</button>
}

export function PillButton({ children, onClick, active = false }: { children: React.ReactNode; onClick?: () => void; active?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-all ${
        active
          ? 'bg-blue-600 text-white shadow-xs'
          : 'bg-white text-blue-600 border border-blue-200 hover:bg-blue-50 dark:bg-slate-900 dark:border-blue-900/60 dark:text-blue-400 dark:hover:bg-slate-800'
      }`}
    >
      {children}
    </button>
  )
}

export function Card({
  title,
  description,
  children,
  action,
  accentBar = 'none',
  className = '',
}: {
  title?: string
  description?: string
  children: React.ReactNode
  action?: React.ReactNode
  accentBar?: 'blue' | 'amber' | 'emerald' | 'rose' | 'none'
  className?: string
}) {
  const accentClasses = {
    blue: 'border-l-4 border-l-blue-600',
    amber: 'border-l-4 border-l-amber-500',
    emerald: 'border-l-4 border-l-emerald-600',
    rose: 'border-l-4 border-l-rose-500',
    none: '',
  }

  return (
    <section className={`overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-xs dark:border-slate-800 dark:bg-[#121c2d] ${accentClasses[accentBar]} ${className}`}>
      {title && (
        <div className="flex items-center justify-between border-b border-slate-100 bg-white/50 px-5 py-3.5 dark:border-slate-800/80 dark:bg-transparent">
          <div>
            <h2 className="text-sm font-bold tracking-wide uppercase text-slate-800 dark:text-slate-100">{title}</h2>
            {description && <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{description}</p>}
          </div>
          {action}
        </div>
      )}
      <div className="p-5">{children}</div>
    </section>
  )
}

export function Metric({ label, value, detail, icon: Icon, tone = 'primary' }: { label: string; value: string; detail: string; icon: IconType; tone?: 'primary' | 'success' | 'warning' | 'danger' }) {
  const toneClasses = {
    primary: 'bg-blue-50 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400',
    success: 'bg-emerald-50 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-400',
    warning: 'bg-amber-50 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400',
    danger: 'bg-rose-50 text-rose-600 dark:bg-rose-950/50 dark:text-rose-400',
  }
  return (
    <div className="rounded-xl border border-slate-200/80 bg-white p-4.5 shadow-xs dark:border-slate-800 dark:bg-[#121c2d]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
        <div className={`grid size-8 place-items-center rounded-lg ${toneClasses[tone]}`}>
          <Icon className="size-4" />
        </div>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-white">{value}</p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>
    </div>
  )
}

export function SectionHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-end">
      <div>
        {eyebrow && <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-blue-600 dark:text-blue-400">{eyebrow}</p>}
        <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl dark:text-white">{title}</h1>
        {detail && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{detail}</p>}
      </div>
      {action}
    </div>
  )
}

export function PasswordInput({
  value,
  onChange,
  inputClassName = 'h-12',
  autoComplete,
  minLength,
  required = false,
  mono = false,
}: {
  value: string
  onChange: (value: string) => void
  inputClassName?: string
  autoComplete?: string
  minLength?: number
  required?: boolean
  mono?: boolean
}) {
  const { t } = useI18n()
  const [visible, setVisible] = useState(false)

  return (
    <div className="relative">
      <input
        type={visible ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-lg border bg-background px-3 pr-10 outline-none focus:ring-2 focus:ring-primary ${mono ? 'font-mono' : ''} ${inputClassName}`}
        autoComplete={autoComplete}
        minLength={minLength}
        required={required}
      />
      <button
        type="button"
        onClick={() => setVisible((current) => !current)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
        aria-label={visible ? t('common.hidePassword') : t('common.showPassword')}
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  )
}

export function formatDayOfWeek(t: (key: string) => string, dayOfWeek?: number) {
  if (!dayOfWeek) return '—'
  const text = t(`common.day${dayOfWeek}`)
  return text || `Thứ ${dayOfWeek === 7 ? 'CN' : dayOfWeek + 1}`
}


export function DynamicQRCode({
  value,
  size = 180,
  className = '',
}: {
  value: string
  size?: number
  className?: string
}) {
  const [svg, setSvg] = useState<string>('')

  useEffect(() => {
    let active = true
    if (!value || value === '------') {
      return
    }
    QRCode.toString(value, {
      type: 'svg',
      width: size,
      margin: 1,
      color: {
        dark: '#0f172a',
        light: '#ffffff',
      },
    })
      .then((data) => {
        if (active) setSvg(data)
      })
      .catch((err) => console.error('QR code error', err))
    return () => {
      active = false
    }
  }, [value, size])

  if (!svg || !value || value === '------') {
    return (
      <div
        className={`flex items-center justify-center rounded-xl border-2 border-dashed bg-muted/40 p-4 text-muted-foreground ${className}`}
        style={{ width: size, height: size }}
      >
        <span className="font-mono text-xl tracking-widest">{value || '------'}</span>
      </div>
    )
  }

  return (
    <div
      className={`inline-block overflow-hidden rounded-xl border bg-white p-2 shadow-sm ${className}`}
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  )
}

export function CountdownTimer({
  expiresAt,
  totalSeconds = 30,
  onExpire,
}: {
  expiresAt?: string
  totalSeconds?: number
  onExpire?: () => void
}) {
  const calculateRemaining = useCallback(() => {
    if (!expiresAt) return totalSeconds
    return Math.max(0, Math.ceil((new Date(expiresAt).getTime() - Date.now()) / 1000))
  }, [expiresAt, totalSeconds])

  const [secondsLeft, setSecondsLeft] = useState<number>(calculateRemaining)
  const onExpireRef = useRef(onExpire)
  onExpireRef.current = onExpire
  const hasExpiredRef = useRef(false)

  useEffect(() => {
    hasExpiredRef.current = false
    setSecondsLeft(calculateRemaining())
  }, [expiresAt, calculateRemaining])

  useEffect(() => {
    const update = () => {
      const remaining = calculateRemaining()
      setSecondsLeft(remaining)
      if (remaining <= 0 && !hasExpiredRef.current) {
        hasExpiredRef.current = true
        onExpireRef.current?.()
      }
    }

    update()
    const interval = setInterval(update, 1000)
    return () => clearInterval(interval)
  }, [calculateRemaining])

  const percentage = Math.min(100, Math.max(0, (secondsLeft / totalSeconds) * 100))
  const isLow = secondsLeft <= 5

  return (
    <div className="flex items-center gap-2">
      <div className="relative flex size-8 items-center justify-center">
        <svg className="size-8 -rotate-90">
          <circle
            cx="16"
            cy="16"
            r="12"
            stroke="currentColor"
            strokeWidth="3"
            className="text-muted/30"
            fill="none"
          />
          <circle
            cx="16"
            cy="16"
            r="12"
            stroke="currentColor"
            strokeWidth="3"
            className={`transition-all duration-300 ${isLow ? 'text-rose-500' : 'text-primary'}`}
            fill="none"
            strokeDasharray={75.398}
            strokeDashoffset={75.398 - (75.398 * percentage) / 100}
            strokeLinecap="round"
          />
        </svg>
        <span className={`absolute text-[10px] font-bold ${isLow ? 'text-rose-600' : 'text-primary'}`}>
          {secondsLeft}
        </span>
      </div>
      <span className="text-xs font-medium text-muted-foreground">{secondsLeft}s</span>
    </div>
  )
}

export function UltrasonicWaveVisualizer({
  active,
  frequency = 18750,
  className = '',
}: {
  active: boolean
  frequency?: number
  className?: string
}) {
  return (
    <div
      className={`flex items-center gap-3 rounded-xl border p-2.5 transition-all ${
        active
          ? 'border-indigo-500/40 bg-indigo-500/10 text-indigo-300 shadow-sm'
          : 'border-slate-700/60 bg-slate-800/40 text-slate-400'
      } ${className}`}
    >
      <div className="relative flex size-7 items-center justify-center">
        {active && (
          <>
            <span className="absolute size-7 animate-ping rounded-full bg-indigo-400/30" />
            <span className="absolute size-5 animate-pulse rounded-full bg-indigo-500/40" />
          </>
        )}
        <span className={`size-3 rounded-full ${active ? 'bg-indigo-400' : 'bg-slate-500'}`} />
      </div>
      <div className="flex flex-col text-left text-xs">
        <span className="font-semibold tracking-wide">
          {active ? `Sóng siêu âm: ${(frequency / 1000).toFixed(2)} kHz (Đang phát)` : 'Sóng siêu âm: Đang tắt'}
        </span>
        <span className="text-[10px] opacity-80">
          {active ? 'Xác thực hiện diện trong phòng kín' : 'Bật để chống chụp ảnh gửi về nhà'}
        </span>
      </div>
    </div>
  )
}

export type { FormEvent }