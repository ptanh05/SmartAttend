'use client'

import { useState, type FormEvent } from 'react'
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
    { key: 'overview', labelKey: 'nav.student.overview', icon: LayoutDashboard }, { key: 'join', labelKey: 'nav.student.join', icon: ScanLine },
    { key: 'history', labelKey: 'nav.student.history', icon: ClipboardCheck }, { key: 'courses', labelKey: 'nav.student.courses', icon: BookOpen },
    { key: 'notifications', labelKey: 'nav.student.notifications', icon: Bell }, { key: 'devices', labelKey: 'nav.student.devices', icon: Smartphone }, { key: 'profile', labelKey: 'nav.student.profile', icon: UserRound },
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

export function Logo({ compact = false, onClick }: { compact?: boolean; onClick?: () => void }) {
  const { t } = useI18n()
  const mark = (
    <>
      <div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><ClipboardCheck className="size-5" /></div>
      {!compact && <span className="text-lg font-semibold tracking-tight">Smart<span className="text-primary">Attend</span></span>}
    </>
  )
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
  const styles = { success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300', neutral: 'bg-muted text-muted-foreground' }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}><span className="size-1.5 rounded-full bg-current" />{children}</span>
}

export function Button({ children, variant = 'primary', onClick, type = 'button', disabled, className = '' }: { children: React.ReactNode; variant?: 'primary' | 'outline' | 'ghost' | 'danger'; onClick?: () => void; type?: 'button' | 'submit'; disabled?: boolean; className?: string }) {
  const styles = { primary: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border bg-card hover:bg-muted', ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground', danger: 'bg-destructive text-destructive-foreground hover:opacity-90' }
  return <button type={type} onClick={onClick} disabled={disabled} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${styles[variant]} ${className}`}>{children}</button>
}

export function Card({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}</div>{action}</div><div className="p-5">{children}</div></section>
}

export function Metric({ label, value, detail, icon: Icon, tone = 'primary' }: { label: string; value: string; detail: string; icon: IconType; tone?: 'primary' | 'success' | 'warning' }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className={`size-4 ${tone === 'success' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : 'text-primary'}`} /></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}

export function SectionHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-2 text-sm font-medium text-primary">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}</div>{action}</div>
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

export type { FormEvent }