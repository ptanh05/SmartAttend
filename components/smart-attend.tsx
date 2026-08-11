'use client'

import { useEffect, useState } from 'react'
import {
  Activity, ArrowLeft, ArrowRight, BarChart3, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronRight, CircleAlert,
  ClipboardCheck, Download, FileText, GraduationCap, LayoutDashboard, LogOut, Menu, Moon, Play, Plus,
  QrCode, RotateCw, ScanLine, Search, Settings2, ShieldCheck, Smartphone, UserRound, Users, Wifi, X, LockKeyhole
} from 'lucide-react'
import { api, loadDashboard, type DashboardData } from '@/lib/api/client'
import { canAccessRole } from '@/lib/auth/demo'
import type { AttendanceRecord, Role } from '@/lib/types/domain'

type PageKey = 'overview' | 'join' | 'history' | 'courses' | 'devices' | 'notifications' | 'profile' | 'sessions' | 'students' | 'analytics' | 'reports' | 'settings' | 'audit' | 'departments'
type AuthUser = Role | null

type AppUser = { name: string; email: string; initials: string; department: string | null; label: string }
type ViewProps = {
  page: PageKey
  go: (p: PageKey) => void
  data: DashboardData
  user: AppUser
  organization: { name: string; plan: string }
  refresh: () => Promise<void>
}

function calcAttendanceRate(records: AttendanceRecord[]) {
  if (!records.length) return 0
  return Math.round((records.filter((row) => row.status === 'present' || row.status === 'late').length / records.length) * 100)
}

function pageFromPath(path: string, role: Role): PageKey {
  const segment = path.split('/').filter(Boolean).at(1)
  const aliases: Record<string, PageKey> = { dashboard: 'overview', attendance: role === 'teacher' ? 'sessions' : 'join', history: 'history', classes: 'courses', courses: 'courses', notifications: 'notifications', devices: 'devices', profile: 'profile', students: 'students', analytics: 'analytics', reports: 'reports', settings: 'settings', activity: 'audit', departments: 'departments' }
  return aliases[segment ?? 'dashboard'] ?? 'overview'
}

const roleLabels: Record<Role, string> = { student: 'Student', teacher: 'Teacher', admin: 'Organization admin' }
const nav: Record<Role, { key: PageKey; label: string; icon: typeof LayoutDashboard }[]> = {
  student: [
    { key: 'overview', label: 'Home', icon: LayoutDashboard }, { key: 'join', label: 'Join attendance', icon: ScanLine },
    { key: 'history', label: 'History', icon: ClipboardCheck }, { key: 'courses', label: 'Classes', icon: BookOpen },
    { key: 'notifications', label: 'Notifications', icon: Bell }, { key: 'devices', label: 'Device & security', icon: Smartphone }, { key: 'profile', label: 'Profile', icon: UserRound },
  ],
  teacher: [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard }, { key: 'sessions', label: 'Live attendance', icon: Wifi },
    { key: 'courses', label: 'Courses & classes', icon: BookOpen }, { key: 'students', label: 'Students', icon: Users },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 }, { key: 'reports', label: 'Reports', icon: FileText }, { key: 'settings', label: 'Settings', icon: Settings2 },
  ],
  admin: [
    { key: 'overview', label: 'Overview', icon: LayoutDashboard }, { key: 'students', label: 'Students', icon: GraduationCap },
    { key: 'courses', label: 'Courses & classes', icon: BookOpen }, { key: 'departments', label: 'Departments', icon: Activity },
    { key: 'analytics', label: 'Analytics', icon: BarChart3 }, { key: 'reports', label: 'Reports', icon: FileText }, { key: 'audit', label: 'Activity log', icon: Activity }, { key: 'settings', label: 'Settings', icon: Settings2 },
  ],
}

function Logo({ compact = false }: { compact?: boolean }) {
  return <div className="flex items-center gap-2.5"><div className="grid size-9 place-items-center rounded-xl bg-primary text-primary-foreground"><ClipboardCheck className="size-5" /></div>{!compact && <span className="text-lg font-semibold tracking-tight">Smart<span className="text-primary">Attend</span></span>}</div>
}
function Status({ children, tone = 'success' }: { children: React.ReactNode; tone?: 'success' | 'warning' | 'danger' | 'neutral' }) {
  const styles = { success: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300', warning: 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300', danger: 'bg-rose-50 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300', neutral: 'bg-muted text-muted-foreground' }
  return <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${styles[tone]}`}><span className="size-1.5 rounded-full bg-current" />{children}</span>
}
function Button({ children, variant = 'primary', onClick, type = 'button', className = '' }: { children: React.ReactNode; variant?: 'primary' | 'outline' | 'ghost' | 'danger'; onClick?: () => void; type?: 'button' | 'submit'; className?: string }) {
  const styles = { primary: 'bg-primary text-primary-foreground hover:opacity-90', outline: 'border bg-card hover:bg-muted', ghost: 'text-muted-foreground hover:bg-muted hover:text-foreground', danger: 'bg-destructive text-destructive-foreground hover:opacity-90' }
  return <button type={type} onClick={onClick} className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-medium transition-colors ${styles[variant]} ${className}`}>{children}</button>
}
function Card({ title, description, children, action }: { title: string; description?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return <section className="rounded-xl border bg-card"><div className="flex items-center justify-between border-b px-5 py-4"><div><h2 className="font-semibold">{title}</h2>{description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}</div>{action}</div><div className="p-5">{children}</div></section>
}
function Metric({ label, value, detail, icon: Icon, tone = 'primary' }: { label: string; value: string; detail: string; icon: typeof ClipboardCheck; tone?: 'primary' | 'success' | 'warning' }) {
  return <div className="rounded-xl border bg-card p-4"><div className="flex items-center justify-between"><p className="text-sm text-muted-foreground">{label}</p><Icon className={`size-4 ${tone === 'success' ? 'text-emerald-600' : tone === 'warning' ? 'text-amber-600' : 'text-primary'}`} /></div><p className="mt-3 text-2xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>
}
function SectionHeader({ eyebrow, title, detail, action }: { eyebrow?: string; title: string; detail?: string; action?: React.ReactNode }) {
  return <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end"><div>{eyebrow && <p className="mb-2 text-sm font-medium text-primary">{eyebrow}</p>}<h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{title}</h1>{detail && <p className="mt-1 text-sm text-muted-foreground">{detail}</p>}</div>{action}</div>
}

function PublicLanding({ onSelect }: { onSelect: (portal: 'student' | 'staff') => void }) {
  return <main className="min-h-screen bg-background"><header className="flex items-center justify-between border-b px-5 py-4 sm:px-8"><Logo /><div className="flex items-center gap-2"><Button variant="ghost" onClick={() => onSelect('student')}>Student Portal</Button><Button variant="outline" onClick={() => onSelect('staff')}>Staff Portal</Button></div></header><section className="mx-auto grid max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.05fr_0.95fr] lg:items-center lg:py-28"><div><Status>Trusted by Northstar University</Status><h1 className="mt-6 max-w-3xl text-balance text-5xl font-semibold tracking-tight sm:text-6xl">Verify presence. Simplify attendance.</h1><p className="mt-6 max-w-xl text-lg leading-8 text-muted-foreground">SmartAttend gives students a simple check-in and gives academic teams a clearer, more trustworthy view of attendance.</p><div className="mt-8 flex flex-wrap gap-3"><Button onClick={() => onSelect('student')}><GraduationCap />Student Portal</Button><Button variant="outline" onClick={() => onSelect('staff')}><Users />Staff Portal</Button></div><div className="mt-8 flex flex-wrap gap-5 text-sm text-muted-foreground"><span><ShieldCheck className="mr-2 inline size-4 text-primary" />Session verified</span><span><Smartphone className="mr-2 inline size-4 text-primary" />Device aware</span><span><Activity className="mr-2 inline size-4 text-primary" />Live insights</span></div></div><div className="rounded-3xl border bg-muted/40 p-5 shadow-sm sm:p-8"><div className="rounded-2xl border bg-card p-5"><div className="flex items-center justify-between"><div><p className="text-sm text-muted-foreground">Today’s attendance</p><p className="mt-2 text-4xl font-semibold">94.8%</p></div><div className="grid size-12 place-items-center rounded-xl bg-primary/10 text-primary"><BarChart3 /></div></div><div className="mt-8 flex h-36 items-end gap-2">{[38, 56, 48, 72, 67, 82, 78, 94, 86, 91].map((height, index) => <div key={index} className="flex-1 rounded-t bg-primary/80" style={{ height: `${height}%` }} />)}</div><div className="mt-6 flex items-center justify-between border-t pt-4 text-sm"><span className="text-muted-foreground">Active session</span><Status>Live now</Status></div></div></div></section></main>
}

function DemoLogin({ portal, onLogin, onSwitch, organizationName }: { portal: 'student' | 'staff'; onLogin: (role: Role) => void; onSwitch: () => void; organizationName: string }) {
  const [email, setEmail] = useState(portal === 'student' ? 'student@demo.com' : 'teacher@demo.com')
  const [password, setPassword] = useState('demo1234'); const [error, setError] = useState(''); const [loading, setLoading] = useState(false)
  const submit = async (event: React.FormEvent) => {
    event.preventDefault(); setLoading(true); setError('')
    try {
      const result = await api.login(email, password, portal)
      if (!result.ok || !result.role) { setError(result.message ?? 'Unable to sign in.'); return }
      onLogin(result.role)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to sign in.')
    } finally {
      setLoading(false)
    }
  }
  return <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]"><div className="hidden bg-primary p-12 text-primary-foreground lg:flex lg:flex-col lg:justify-between"><Logo /><div className="max-w-md"><p className="mb-5 text-sm font-medium uppercase tracking-[0.18em] text-primary-foreground/70">{portal === 'student' ? 'Student portal' : 'Staff portal'}</p><h1 className="text-5xl font-semibold leading-tight tracking-tight">Attendance you can trust, from the first check-in.</h1><p className="mt-6 text-lg leading-8 text-primary-foreground/75">SmartAttend helps {organizationName} verify presence, reduce proxy attendance, and keep every class moving.</p></div><p className="text-sm text-primary-foreground/60">{organizationName} · Campus Plus</p></div><div className="flex items-center justify-center bg-background p-6 sm:p-12"><div className="w-full max-w-md"><div className="mb-10 lg:hidden"><Logo /></div><p className="text-sm font-medium text-primary">SmartAttend {portal === 'student' ? 'Student' : 'Staff'}</p><h1 className="mt-2 text-3xl font-semibold tracking-tight">Welcome back</h1><p className="mt-2 text-sm text-muted-foreground">{portal === 'student' ? 'Check attendance, view classes, and manage your student account.' : 'Manage classes, attendance, students, and academic operations.'}</p><form onSubmit={submit} className="mt-8 flex flex-col gap-5"><label className="flex flex-col gap-2 text-sm font-medium">{portal === 'student' ? 'Email / Student ID' : 'Work email'}<input className="h-12 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" value={email} onChange={(e) => setEmail(e.target.value)} type="email" autoComplete="email" /></label><label className="flex flex-col gap-2 text-sm font-medium">Password<input className="h-12 rounded-lg border bg-background px-3 outline-none focus:ring-2 focus:ring-primary" value={password} onChange={(e) => setPassword(e.target.value)} type="password" autoComplete="current-password" /></label><div className="flex items-center justify-between text-sm"><label className="flex items-center gap-2 text-muted-foreground"><input type="checkbox" defaultChecked /> Remember me</label><button type="button" className="text-primary hover:underline">Forgot password?</button></div>{error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200"><CircleAlert className="mr-2 inline size-4" />{error}</div>}<Button type="submit" className="h-12">{loading ? 'Signing in…' : portal === 'student' ? 'Sign in as Student' : 'Sign in to Staff Portal'}</Button></form><div className="mt-8 rounded-lg border bg-muted/40 p-4 text-sm"><p className="font-medium">Demo credentials</p><p className="mt-1 text-muted-foreground">{portal === 'student' ? 'student@demo.com' : 'teacher@demo.com or admin@demo.com'} · demo1234</p></div><div className="mt-6 flex flex-col gap-3 text-center text-sm"><button onClick={onSwitch} className="text-primary hover:underline">{portal === 'student' ? 'Staff member? Sign in to Staff Portal' : 'Student? Sign in to Student Portal'}</button>{portal === 'student' && <button className="text-muted-foreground hover:text-foreground">Create student account</button>}</div></div></div></main>
}

function StudentView({ page, go, data, user, refresh }: ViewProps) {
  const { courses, records, sessions, notifications, devices } = data
  const [code, setCode] = useState('')
  const [result, setResult] = useState<{ ok: boolean; confidence: number; message: string } | null>(null)
  const [filter, setFilter] = useState('all')
  const [read, setRead] = useState<string[]>(notifications.filter((n) => n.read).map((n) => n.id))
  const liveSession = sessions.find((session) => session.status === 'live')
  const liveCourse = liveSession ? courses.find((course) => course.id === liveSession.courseId) : null
  const rate = calcAttendanceRate(records)
  const presentCount = records.filter((row) => row.status === 'present' || row.status === 'late').length

  const verify = async () => {
    try {
      const response = await api.verify(code)
      setResult(response)
      if (response.ok) await refresh()
    } catch (err) {
      setResult({ ok: false, confidence: 0, message: err instanceof Error ? err.message : 'Verification failed.' })
    }
  }

  if (page === 'join') return <div className="mx-auto max-w-2xl"><SectionHeader eyebrow="Student verification" title="Join attendance" detail="Use the live challenge shared by your teacher. Your device and session are checked before recording attendance." action={<Button variant="ghost" onClick={() => go('overview')}><ArrowLeft />Back</Button>} /><Card title={liveCourse?.name ?? 'No live class'} description={liveSession ? `${liveCourse?.code ?? ''} · ${liveSession.room} · Live now` : 'Waiting for teacher to start session'}><div className="flex flex-col gap-5"><div className="rounded-xl bg-primary/5 p-5 text-center"><QrCode className="mx-auto size-16 text-primary" /><p className="mt-3 text-sm font-medium">Enter the 6-character challenge</p><p className="mt-1 text-xs text-muted-foreground">Ask your teacher if you cannot see the current code.</p></div><label className="flex flex-col gap-2 text-sm font-medium" htmlFor="challenge">Session challenge<input id="challenge" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="e.g. A7K2P9" className="h-12 rounded-lg border bg-background px-4 text-center font-mono text-xl tracking-[0.35em] outline-none focus:ring-2 focus:ring-primary" /></label>{result && <div className={`rounded-lg border p-4 ${result.ok ? 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-200' : 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200'}`}><div className="flex items-center gap-2 font-medium">{result.ok ? <CheckCircle2 /> : <CircleAlert />}{result.ok ? 'Attendance confirmed' : 'Verification needs attention'}</div><p className="mt-1 text-sm">{result.message}</p>{result.ok && <div className="mt-4 grid gap-2 border-t pt-3 text-xs sm:grid-cols-2"><span>Course: {liveCourse?.name ?? '—'}</span><span>Room: {liveSession?.room ?? '—'}</span><span>Confidence: {result.confidence}%</span></div>}</div>}<Button onClick={verify}>{result?.ok ? <><Check />Done</> : <><ShieldCheck />Verify and record attendance</>}</Button></div></Card></div>
  if (page === 'history') { const shown = records.filter((r) => filter === 'all' || r.status === filter); return <div className="flex flex-col gap-6"><SectionHeader eyebrow="Student workspace" title="Attendance history" detail="Review every session and verification result." action={<Button variant="outline"><Download />Export CSV</Button>} /><Card title="Your attendance" description={`${records.length} total records`}><div className="mb-5 grid gap-4 sm:grid-cols-3"><Metric label="Attendance rate" value={`${rate}%`} detail="From verified records" icon={ClipboardCheck} /><Metric label="Present" value={String(presentCount)} detail="Sessions attended" icon={CheckCircle2} tone="success" /><Metric label="Needs review" value={String(records.filter((r) => r.status === 'flagged' || r.status === 'pending').length)} detail="Teacher follow-up" icon={CircleAlert} tone="warning" /></div><div className="mb-5 flex flex-wrap gap-2">{['all', 'present', 'late', 'absent'].map((item) => <Button key={item} variant={filter === item ? 'primary' : 'outline'} onClick={() => setFilter(item)}>{item[0].toUpperCase() + item.slice(1)}</Button>)}</div><div className="overflow-x-auto"><table className="w-full min-w-[560px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-3">Class</th><th className="pb-3">Status</th><th className="pb-3">Confidence</th><th className="pb-3">Device</th></tr></thead><tbody className="divide-y">{shown.map((r) => <tr key={r.id}><td className="py-3 font-medium">{courses.find((c) => c.id === sessions.find((s) => s.id === r.sessionId)?.courseId)?.name ?? r.sessionId}</td><td className="py-3"><Status tone={r.status === 'late' ? 'warning' : r.status === 'absent' ? 'danger' : 'success'}>{r.status}</Status></td><td className="py-3 text-muted-foreground">{r.confidence ? `${r.confidence}%` : '—'}</td><td className="py-3 text-muted-foreground">{r.device || '—'}</td></tr>)}</tbody></table></div></Card></div> }
  if (page === 'courses') return <div className="flex flex-col gap-6"><SectionHeader eyebrow="Student workspace" title="My classes" detail="Your enrolled classes, schedules, and attendance percentages." /><div className="grid gap-4 md:grid-cols-2">{courses.map((course) => { const section = sessions.find((s) => s.courseId === course.id); return <Card key={course.id} title={`${course.code} · ${course.name}`} description={`${course.department}`}><div className="flex flex-col gap-4"><div className="flex items-center justify-between text-sm"><span className="text-muted-foreground">Attendance</span><strong>{rate}%</strong></div><div className="h-2 rounded-full bg-muted"><div className="h-2 rounded-full bg-primary" style={{ width: `${rate}%` }} /></div><div className="flex items-center justify-between text-sm text-muted-foreground"><span><CalendarDays className="mr-1 inline size-4" />Today · {section?.startsAt ?? '—'}</span><span>{section?.room ?? '—'}</span></div></div></Card>})}</div></div>
  if (page === 'devices') return <div className="flex flex-col gap-6"><SectionHeader eyebrow="Security" title="Device & security" detail="Manage the devices allowed to verify your attendance." /><Card title="Trusted devices" description={`${devices.length} device(s) bound to your account.`}>{devices.length ? devices.map((device) => <div key={device.id} className="flex flex-wrap items-center justify-between gap-4"><div className="flex items-center gap-3"><div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary"><Smartphone /></div><div><p className="font-medium">{device.label}</p><p className="text-sm text-muted-foreground">Last seen {device.lastSeenAt}</p></div></div><div className="flex gap-2"><Status>{device.trusted ? 'Trusted' : 'Pending'}</Status></div></div>) : <p className="text-sm text-muted-foreground">No devices registered yet.</p>}</Card><Card title="Privacy by design"><p className="text-sm leading-6 text-muted-foreground">SmartAttend uses device verification to help protect attendance integrity. It does not continuously track your location.</p></Card></div>
  if (page === 'notifications') return <div className="flex flex-col gap-6"><SectionHeader eyebrow="Student workspace" title="Notifications" detail="Stay up to date with your classes and attendance." action={<Button variant="outline" onClick={async () => { await api.markNotificationsRead(); setRead(notifications.map((n) => n.id)); await refresh() }}>Mark all as read</Button>} /><Card title="Inbox" description={`${notifications.filter((n) => !read.includes(n.id)).length} unread notifications`}><div className="divide-y">{notifications.map((n) => <button key={n.id} onClick={() => setRead([...read, n.id])} className={`flex w-full gap-3 py-4 text-left ${!read.includes(n.id) ? 'bg-primary/5' : ''}`}><Bell className="mt-1 size-4 text-primary" /><span className="flex-1"><strong className="text-sm">{n.title}</strong><span className="block text-sm text-muted-foreground">{n.body}</span><small className="text-muted-foreground">{n.createdAt}</small></span>{!read.includes(n.id) && <span className="mt-2 size-2 rounded-full bg-primary" />}</button>)}</div></Card></div>
  if (page === 'profile') return <div className="flex flex-col gap-6"><SectionHeader eyebrow="Account" title="Profile" detail="Manage your student identity and account preferences." /><Card title="Student identity"><div className="flex flex-col gap-5 sm:flex-row sm:items-center"><div className="grid size-16 place-items-center rounded-full bg-primary text-lg font-semibold text-primary-foreground">{user.initials}</div><div><h2 className="text-lg font-semibold">{user.name}</h2><p className="text-sm text-muted-foreground">{user.department ?? 'Student'} · SmartAttend</p><p className="text-sm text-muted-foreground">{user.email}</p></div><Button variant="outline" className="sm:ml-auto">Edit profile</Button></div></Card><Card title="Account security"><div className="flex flex-wrap gap-2"><Button variant="outline"><LockKeyhole />Change password</Button><Button variant="outline">Account settings</Button></div></Card></div>
  const nextSession = sessions.find((session) => session.status !== 'live') ?? sessions[0]
  const nextCourse = nextSession ? courses.find((course) => course.id === nextSession.courseId) : null
  return <div className="flex flex-col gap-6"><SectionHeader eyebrow="Today" title={`Good morning, ${user.name.split(' ')[0]}`} detail="Here is your attendance overview for today." action={<Button onClick={() => go('join')}><ScanLine />Join attendance</Button>} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Attendance rate" value={`${rate}%`} detail="From your records" icon={ClipboardCheck} /><Metric label="Present" value={String(presentCount)} detail={`of ${records.length} sessions`} icon={CheckCircle2} tone="success" /><Metric label="Absent" value={String(records.filter((r) => r.status === 'absent').length)} detail="No action required" icon={CircleAlert} tone="warning" /></div><div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]"><Card title="Today's classes" description="Your scheduled sessions" action={<Button variant="ghost" onClick={() => go('courses')}>View classes <ChevronRight /></Button>}><div className="divide-y">{sessions.map((session) => <div key={session.id} className="flex items-center gap-4 py-4 first:pt-0 last:pb-0"><div className={`size-2.5 rounded-full ${session.status === 'live' ? 'bg-primary' : 'bg-muted-foreground'}`} /><div className="min-w-0 flex-1"><p className="truncate text-sm font-medium">{courses.find((c) => c.id === session.courseId)?.name}</p><p className="mt-1 text-xs text-muted-foreground">{session.startsAt} – {session.endsAt} · {session.room}</p></div><Status tone={session.status === 'live' ? 'success' : 'neutral'}>{session.status === 'live' ? 'Live' : 'Upcoming'}</Status></div>)}</div></Card>{nextCourse && <section className="rounded-xl bg-primary p-5 text-primary-foreground"><p className="text-sm text-primary-foreground/70">Next class</p><h2 className="mt-2 text-xl font-semibold">{nextCourse.name}</h2><p className="mt-1 text-sm text-primary-foreground/70">Starts at {nextSession.startsAt} in {nextSession.room}</p><Button variant="outline" className="mt-5" onClick={() => go('join')}>Join attendance <ArrowRight /></Button></section>}</div></div>
}

function StaffView({ role, page, go, data, user, organization, refresh }: ViewProps & { role: 'teacher' | 'admin' }) {
  const { courses, live, metrics, suspicious, auditEvents, users, departments } = data
  const [search, setSearch] = useState('')
  const [reviewed, setReviewed] = useState<string[]>([])
  const [notice, setNotice] = useState('')
  const [saved, setSaved] = useState(false)
  const isAdmin = role === 'admin'
  const liveActive = Boolean(live)
  const students = users.filter((item) => item.role === 'student')
  const firstSection = data.sessions[0]

  const toggleSession = async () => {
    try {
      let sessionId = live?.sessionId
      if (!sessionId && firstSection) {
        const created = await api.createSession(firstSection.sectionId)
        sessionId = created.sessionId
      }
      if (!sessionId) { setNotice('No class section available.'); return }
      const result = await api.sessionAction(sessionId, liveActive ? 'close' : 'start')
      if (!result.ok) { setNotice(result.message ?? 'Unable to update session.'); return }
      setNotice(result.message ?? 'Session updated.')
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to update session.')
    }
  }

  const rotateChallenge = async () => {
    if (!live?.sessionId) return
    try {
      const result = await api.sessionAction(live.sessionId, 'rotate')
      if (!result.ok) { setNotice(result.message ?? 'Unable to rotate challenge.'); return }
      await refresh()
    } catch (err) {
      setNotice(err instanceof Error ? err.message : 'Unable to rotate challenge.')
    }
  }

  const presentCount = live?.records.filter((row) => row.status === 'present').length ?? 0
  const lateCount = live?.records.filter((row) => row.status === 'late').length ?? 0

  if (page === 'sessions') return <div className="flex flex-col gap-6">{notice && <div className="rounded-lg border border-primary/20 bg-primary/5 px-4 py-3 text-sm text-primary" role="status">{notice}</div>}<SectionHeader eyebrow="Teacher workspace" title="Live attendance" detail="Monitor a session and review verification events in real time." action={<Button variant={liveActive ? 'danger' : 'primary'} onClick={toggleSession}>{liveActive ? <><X />End session</> : <><Play />Start session</>}</Button>} />{liveActive && live ? <><div className="grid gap-5 xl:grid-cols-[0.9fr_1.3fr_0.9fr]"><Card title="Session details"><div className="flex flex-col gap-3 text-sm"><p><strong>Course</strong><span className="block text-muted-foreground">{live.courseCode} · {live.courseName}</span></p><p><strong>Class</strong><span className="block text-muted-foreground">{live.room}</span></p><p><strong>Time</strong><span className="block text-muted-foreground">{live.startsAt} – {live.endsAt}</span></p><Status>Live now</Status></div></Card><Card title="Session challenge" description="Rotating server code"><div className="flex flex-col items-center justify-center gap-4 py-3"><QrCode className="size-28 text-primary" /><span className="rounded-lg bg-primary/10 px-5 py-3 font-mono text-3xl font-semibold tracking-[0.25em] text-primary">{live.challenge}</span><p className="text-sm text-muted-foreground">Share this code with students</p><Button variant="outline" onClick={rotateChallenge}><RotateCw />Rotate challenge</Button></div></Card><Card title="Live statistics"><div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1"><Metric label="Present" value={String(presentCount)} detail="Verified students" icon={CheckCircle2} tone="success" /><Metric label="Late" value={String(lateCount)} detail="Needs review" icon={CalendarDays} tone="warning" /><Metric label="Suspicious" value={String(metrics.flagged)} detail="Review required" icon={CircleAlert} tone="warning" /></div></Card></div><Card title="Live attendance table" description="Verification events for this session"><div className="mb-4 flex items-center gap-2 rounded-lg border px-3"><Search className="size-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 flex-1 bg-transparent text-sm outline-none" placeholder="Search students..." /></div><div className="overflow-x-auto"><table className="w-full min-w-[700px] text-left text-sm"><thead className="text-xs text-muted-foreground"><tr><th className="pb-3">Student</th><th className="pb-3">Check-in</th><th className="pb-3">Status</th><th className="pb-3">Verification</th><th className="pb-3">Device</th></tr></thead><tbody className="divide-y">{live.records.filter((row) => row.studentName.toLowerCase().includes(search.toLowerCase())).map((row) => <tr key={row.id}><td className="py-3 font-medium">{row.studentName}</td><td className="py-3">{row.verifiedAt}</td><td className="py-3"><Status tone={row.status === 'late' ? 'warning' : 'success'}>{row.status}</Status></td><td className="py-3">{row.confidence}%</td><td className="py-3 text-muted-foreground">{row.device}</td></tr>)}</tbody></table></div></Card></> : <Card title="No active session" description="Start attendance when your class is ready."><div className="flex flex-col items-center gap-3 py-12 text-center"><Wifi className="size-10 text-muted-foreground" /><p className="font-medium">The session is closed</p><p className="max-w-sm text-sm text-muted-foreground">Start a new session to generate a rotating challenge for students.</p><Button onClick={toggleSession}><Play />Start attendance</Button></div></Card>}</div>
  if (page === 'students' || (isAdmin && ['courses', 'departments'].includes(page))) return <div className="flex flex-col gap-6"><SectionHeader eyebrow={isAdmin ? 'Administration' : 'Teacher workspace'} title={page === 'students' ? 'Students' : page === 'departments' ? 'Departments' : 'Courses & classes'} detail={isAdmin ? 'Manage your organization directory and academic structure.' : 'Search, filter, and manage your class roster.'} action={<Button><Plus />{page === 'students' ? 'Invite student' : 'Create new'}</Button>} /><Card title={page === 'students' ? 'Student directory' : 'Records'} description={organization.name}><div className="mb-4 flex items-center gap-2 rounded-lg border px-3"><Search className="size-4 text-muted-foreground" /><input value={search} onChange={(e) => setSearch(e.target.value)} className="h-10 flex-1 bg-transparent text-sm outline-none" placeholder="Search..." /></div><div className="divide-y">{(page === 'students' ? students.map((s) => s.name) : page === 'departments' ? departments : courses.map((c) => `${c.code} · ${c.name}`)).filter((x) => x.toLowerCase().includes(search.toLowerCase())).map((item) => <div key={item} className="flex items-center gap-3 py-4"><div className="grid size-9 place-items-center rounded-full bg-primary/10 text-xs font-semibold text-primary">{item.slice(0, 2).toUpperCase()}</div><div className="flex-1"><p className="text-sm font-medium">{item}</p><p className="text-xs text-muted-foreground">{page === 'students' ? 'Active student' : 'Active · Updated today'}</p></div><Button variant="ghost">View <ChevronRight /></Button></div>)}</div></Card></div>
  if (page === 'analytics' || page === 'reports') return <div className="flex flex-col gap-6"><SectionHeader eyebrow={isAdmin ? 'Administration' : 'Teacher workspace'} title={page === 'reports' ? 'Reports' : 'Analytics'} detail="Understand attendance patterns across your organization." action={<Button variant="outline"><Download />Export {page === 'reports' ? 'report' : 'data'}</Button>} /><div className="grid gap-4 sm:grid-cols-3"><Metric label="Average attendance" value={metrics.attendanceRate} detail="Organization average" icon={BarChart3} /><Metric label="Students" value={String(metrics.students)} detail="Enrolled" icon={Users} /><Metric label="Suspicious attempts" value={String(metrics.flagged)} detail="Needs review" icon={CircleAlert} tone="warning" /></div><Card title="Attendance by course"><div className="flex flex-col gap-5">{courses.map((course) => <div key={course.id}><div className="mb-2 flex justify-between text-sm"><span className="font-medium">{course.code} · {course.name}</span><span className="text-muted-foreground">{course.enrolled} enrolled</span></div><div className="h-2 rounded-full bg-muted"><div className="h-2 w-3/4 rounded-full bg-primary" /></div></div>)}</div></Card></div>
  if (page === 'audit') return <div className="flex flex-col gap-6"><SectionHeader eyebrow="Administration" title="Activity log" detail="A complete history of important organization actions." action={<Button variant="outline"><Download />Export log</Button>} /><Card title="Recent activity" description={organization.name}><div className="divide-y">{auditEvents.map((event) => <div key={event.id} className="flex gap-4 py-4"><div className={`mt-1 size-2 rounded-full ${event.severity === 'warning' ? 'bg-amber-500' : 'bg-primary'}`} /><div className="flex-1"><p className="text-sm"><span className="font-medium">{event.actor}</span> {event.action}</p><p className="mt-1 text-xs text-muted-foreground">{event.target} · {event.createdAt}</p></div><Status tone={event.severity === 'warning' ? 'warning' : 'neutral'}>{event.severity}</Status></div>)}</div></Card></div>
  if (page === 'settings') return <div className="flex flex-col gap-6"><SectionHeader eyebrow={isAdmin ? 'Administration' : 'Teacher workspace'} title="Settings" detail="Configure your SmartAttend workspace." /><Card title="Organization profile"><div className="grid gap-4 sm:grid-cols-2"><label className="flex flex-col gap-2 text-sm font-medium">Organization name<input className="h-11 rounded-lg border bg-background px-3" defaultValue={organization.name} /></label><label className="flex flex-col gap-2 text-sm font-medium">Attendance policy<input className="h-11 rounded-lg border bg-background px-3" defaultValue="Challenge rotates every 120 seconds" /></label></div><Button className="mt-5" onClick={() => { setSaved(true); setNotice('Settings saved.') }}>{saved ? <><Check />Saved</> : 'Save changes'}</Button></Card></div>
  return <div className="flex flex-col gap-6"><SectionHeader eyebrow={isAdmin ? 'Administration' : 'Teacher workspace'} title={`Good morning, ${user.name.split(' ').slice(-1)[0] === 'Patel' ? 'Dr. Patel' : user.name.split(' ')[0]}`} detail="Here is what is happening across your classes today." action={<Button onClick={() => go(isAdmin ? 'analytics' : 'sessions')}><Wifi />{isAdmin ? 'View analytics' : 'Open live session'}</Button>} /><div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"><Metric label={isAdmin ? 'Total students' : "Today's attendance"} value={isAdmin ? metrics.students.toLocaleString() : metrics.attendanceRate} detail={isAdmin ? 'Organization total' : 'Across classes'} icon={ClipboardCheck} /><Metric label={isAdmin ? 'Total teachers' : 'Active students'} value={isAdmin ? String(metrics.teachers) : String(students.length)} detail="Updated today" icon={Users} /><Metric label={isAdmin ? 'Active sessions' : 'Live sessions'} value={String(metrics.activeSessions)} detail="Running now" icon={Wifi} /><Metric label="Needs review" value={String(metrics.flagged)} detail="Suspicious attempts" icon={CircleAlert} tone="warning" /></div><Card title="Suspicious attendance" description="Review before finalizing records" action={<Button variant="ghost" onClick={() => go('students')}>View all <ChevronRight /></Button>}><div className="divide-y">{suspicious.map((item) => <div className="flex items-center gap-3 py-3" key={item.id}><CircleAlert className="text-amber-600" /><p className="flex-1 text-sm">{item.reason}</p>{reviewed.includes(item.id) ? <Status>Reviewed</Status> : <Button variant="outline" onClick={() => setReviewed([...reviewed, item.id])}>Review</Button>}</div>)}</div></Card></div>
}

const emptyDashboard: DashboardData = {
  courses: [], sessions: [], records: [], notifications: [], metrics: { students: 0, teachers: 0, activeSessions: 0, attendanceRate: '0%', flagged: 0 },
  suspicious: [], auditEvents: [], live: null, devices: [], departments: [], users: [],
}

export default function SmartAttendApp() {
  const [role, setRole] = useState<AuthUser>(null)
  const [portal, setPortal] = useState<'student' | 'staff'>('student')
  const [page, setPage] = useState<PageKey>('overview')
  const [mobileOpen, setMobileOpen] = useState(false)
  const [dark, setDark] = useState(false)
  const [hydrated, setHydrated] = useState(false)
  const [data, setData] = useState<DashboardData>(emptyDashboard)
  const [appUser, setAppUser] = useState<AppUser | null>(null)
  const [organization, setOrganization] = useState<{ name: string; plan: string }>({ name: 'SmartAttend', plan: 'Campus Plus' })

  const refresh = async () => {
    try {
      const next = await loadDashboard()
      setData(next)
    } catch {
      /* keep previous data */
    }
  }

  useEffect(() => {
    const id = window.setTimeout(async () => {
      const path = window.location.pathname
      if (path.startsWith('/student')) setPortal('student')
      else if (path.startsWith('/staff') || path.startsWith('/teacher') || path.startsWith('/admin')) setPortal('staff')

      try {
        const me = await api.me()
        if (me.ok && me.user && me.organization) {
          const nextRole = me.user.role
          if (canAccessRole(nextRole, path)) {
            setRole(nextRole)
            setPage(pageFromPath(path, nextRole))
            setAppUser({
              name: me.user.name,
              email: me.user.email,
              initials: me.user.initials,
              department: me.user.department,
              label: roleLabels[nextRole],
            })
            setOrganization({ name: me.organization.name, plan: me.organization.plan })
            await refresh()
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

  const go = (next: PageKey) => {
    setPage(next)
    setMobileOpen(false)
    if (!role) return
    window.history.replaceState({}, '', role === 'student' ? `/student/${next === 'overview' ? 'dashboard' : next}` : role === 'teacher' ? `/teacher/${next === 'overview' ? 'dashboard' : next}` : `/admin/${next === 'overview' ? 'dashboard' : next}`)
  }

  const login = async (next: Role) => {
    setRole(next)
    setPage('overview')
    const me = await api.me()
    if (me.ok && me.user && me.organization) {
      setAppUser({
        name: me.user.name,
        email: me.user.email,
        initials: me.user.initials,
        department: me.user.department,
        label: roleLabels[next],
      })
      setOrganization({ name: me.organization.name, plan: me.organization.plan })
    }
    await refresh()
    window.history.replaceState({}, '', `/${next === 'student' ? 'student' : next === 'teacher' ? 'teacher' : 'admin'}/dashboard`)
  }

  const logout = async () => {
    await api.logout()
    setRole(null)
    setAppUser(null)
    setData(emptyDashboard)
    setPortal('student')
    window.history.replaceState({}, '', '/student/login')
  }

  if (!hydrated) return <div className="min-h-screen bg-background" aria-hidden="true" />
  if (!role || !appUser) {
    if (typeof window !== 'undefined' && window.location.pathname === '/') {
      return <PublicLanding onSelect={(next) => { setPortal(next); window.history.replaceState({}, '', next === 'student' ? '/student/login' : '/staff/login') }} />
    }
    return <DemoLogin portal={portal} onLogin={login} onSwitch={() => setPortal(portal === 'student' ? 'staff' : 'student')} organizationName={organization.name} />
  }

  const items = nav[role]
  const viewProps: ViewProps = { page, go, data, user: appUser, organization, refresh }

  return <div className="min-h-screen bg-muted/30"><header className="sticky top-0 z-20 flex h-16 items-center justify-between border-b bg-background/95 px-4 backdrop-blur sm:px-6"><div className="flex items-center gap-3"><button onClick={() => setMobileOpen(!mobileOpen)} className="rounded-lg p-2 hover:bg-muted lg:hidden" aria-label="Open navigation"><Menu /></button><Logo /></div><div className="flex items-center gap-2"><button onClick={() => setDark(!dark)} className="rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Toggle dark mode"><Moon className="size-4" /></button><button className="relative rounded-lg p-2 text-muted-foreground hover:bg-muted" aria-label="Notifications"><Bell className="size-4" /><span className="absolute right-1 top-1 size-2 rounded-full bg-primary" /></button><div className="hidden items-center gap-2 border-l pl-3 sm:flex"><div className="grid size-8 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">{appUser.initials}</div><div className="text-right"><p className="text-sm font-medium">{appUser.name}</p><p className="text-xs text-muted-foreground">{appUser.label}</p></div></div></div></header><div className="flex"><aside className={mobileOpen ? 'block fixed inset-x-0 top-16 z-10 border-b bg-background p-3 lg:static lg:block lg:min-h-[calc(100vh-4rem)] lg:w-64 lg:border-b-0 lg:border-r lg:p-4' : 'hidden fixed inset-x-0 top-16 z-10 border-b bg-background p-3 lg:static lg:block lg:min-h-[calc(100vh-4rem)] lg:w-64 lg:border-b-0 lg:border-r lg:p-4'}><nav className="flex flex-col gap-1">{items.map(({ key, label, icon: Icon }) => <button key={key} onClick={() => go(key)} className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${page === key ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-muted hover:text-foreground'}`}><Icon className="size-4" />{label}</button>)}<div className="my-3 border-t" /><button onClick={logout} className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"><LogOut className="size-4" />Log out</button></nav><div className="mt-8 rounded-xl bg-primary/5 p-4"><ShieldCheck className="size-5 text-primary" /><p className="mt-3 text-sm font-medium">Verification protected</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Every check-in is verified against your session and trusted device.</p></div></aside><main className="min-w-0 flex-1 p-4 sm:p-6 lg:p-8"><div className="mx-auto max-w-7xl">{role === 'student' ? <StudentView {...viewProps} /> : <StaffView {...viewProps} role={role} />}</div></main></div><nav className="fixed inset-x-0 bottom-0 z-20 grid grid-cols-4 border-t bg-background p-2 lg:hidden">{items.slice(0, 4).map(({ key, label, icon: Icon }) => <button key={key} onClick={() => go(key)} className="flex flex-col items-center gap-1 rounded-lg p-2 text-[10px] text-muted-foreground"><Icon className="size-4" />{label}</button>)}</nav></div>
}
