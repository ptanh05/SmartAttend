import type { AttendanceRecord, AuditEvent, ClassSession, Course, Role } from '@/lib/types/domain'

type AuditLogsResponse = { ok: boolean; events?: AuditEvent[] }
type DepartmentsResponse = { ok: boolean; departments?: string[] }

type MeResponse = {
  ok: boolean
  user?: {
    id: string
    name: string
    email: string
    role: Role
    initials: string
    department: string | null
    studentCode: string | null
    mustChangePassword: boolean
    organizationId: string
  }
  organization?: { id: string; name: string; plan: string }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers ?? {}),
    },
    credentials: 'include',
  })

  const data = (await response.json()) as T & { message?: string }
  if (!response.ok) throw new Error((data as { message?: string }).message ?? 'Request failed')
  return data
}

export const api = {
  login(identifier: string, password: string, portal: 'student' | 'staff') {
    return request<{ ok: boolean; role?: Role; mustChangePassword?: boolean; message?: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ identifier, password, portal }),
    })
  },
  registerTeacher(input: { name: string; email: string; password: string; organizationName: string; apiKey: string }) {
    return request<{ ok: boolean; role?: Role; message?: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify(input),
    })
  },
  changePassword(currentPassword: string, newPassword: string) {
    return request<{ ok: boolean; message?: string }>('/api/auth/change-password', {
      method: 'POST',
      body: JSON.stringify({ currentPassword, newPassword }),
    })
  },
  importStudents(csv: string) {
    return request<{
      ok: boolean
      created: { studentCode: string; name: string; defaultPassword: string }[]
      skipped: { studentCode: string; reason: string }[]
      message?: string
    }>('/api/users/import', {
      method: 'POST',
      body: JSON.stringify({ csv }),
    })
  },
  logout() {
    return request<{ ok: boolean }>('/api/auth/logout', { method: 'POST' })
  },
  me() {
    return request<MeResponse>('/api/me')
  },
  courses() {
    return request<{ ok: boolean; courses: Course[] }>('/api/courses')
  },
  sessions() {
    return request<{
      ok: boolean
      sessions: ClassSession[]
      live: LiveSession | null
    }>('/api/attendance/sessions')
  },
  records(studentId?: string) {
    const query = studentId ? `?studentId=${studentId}` : ''
    return request<{ ok: boolean; records: AttendanceRecord[] }>(`/api/attendance/records${query}`)
  },
  verify(code: string) {
    return request<{ ok: boolean; confidence: number; message: string }>('/api/attendance/verify', {
      method: 'POST',
      body: JSON.stringify({ code }),
    })
  },
  sessionAction(sessionId: string, action: 'start' | 'pause' | 'close' | 'rotate') {
    return request<{ ok: boolean; message?: string; challenge?: string; status?: string }>(
      `/api/attendance/sessions/${sessionId}`,
      { method: 'POST', body: JSON.stringify({ action }) },
    )
  },
  createSession(sectionId: string) {
    return request<{ ok: boolean; sessionId?: string }>('/api/attendance/sessions', {
      method: 'PUT',
      body: JSON.stringify({ sectionId }),
    })
  },
  notifications() {
    return request<{ ok: boolean; notifications: { id: string; title: string; body: string; read: boolean; createdAt: string }[] }>(
      '/api/notifications',
    )
  },
  markNotificationsRead(ids?: string[]) {
    return request<{ ok: boolean }>('/api/notifications', {
      method: 'POST',
      body: JSON.stringify({ ids }),
    })
  },
  analytics() {
    return request<{
      ok: boolean
      metrics: { students: number; teachers: number; activeSessions: number; attendanceRate: string; flagged: number }
      suspicious: { id: string; reason: string; status: string }[]
    }>('/api/analytics/overview')
  },
  auditLogs() {
    return request<{ ok: boolean; events: AuditEvent[] }>('/api/audit-logs')
  },
  users(role?: string) {
    const query = role ? `?role=${role}` : ''
    return request<{ ok: boolean; users: { id: string; name: string; email: string; role: string; department: string; studentCode: string; initials: string }[] }>(
      `/api/users${query}`,
    )
  },
  devices() {
    return request<{ ok: boolean; devices: { id: string; label: string; trusted: boolean; lastSeenAt: string }[] }>(
      '/api/users?kind=devices',
    )
  },
  departments() {
    return request<{ ok: boolean; departments: string[] }>('/api/users?kind=departments')
  },
  /** Triggers the attendance CSV export endpoint as an attachment download. */
  downloadAttendanceReport() {
    const link = document.createElement('a')
    link.href = '/api/reports/attendance'
    link.download = ''
    document.body.appendChild(link)
    link.click()
    link.remove()
  },
}

export type LiveSession = {
  sessionId: string
  courseCode: string
  courseName: string
  room: string
  startsAt: string
  endsAt: string
  challenge: string
  records: {
    id: string
    studentName: string
    studentId: string
    status: string
    confidence: number
    verifiedAt: string
    device: string
  }[]
}

export type DashboardData = {
  courses: Course[]
  sessions: ClassSession[]
  records: AttendanceRecord[]
  notifications: { id: string; title: string; body: string; read: boolean; createdAt: string }[]
  metrics: { students: number; teachers: number; activeSessions: number; attendanceRate: string; flagged: number }
  suspicious: { id: string; reason: string; status: string }[]
  auditEvents: AuditEvent[]
  live: LiveSession | null
  devices: { id: string; label: string; trusted: boolean; lastSeenAt: string }[]
  departments: string[]
  users: { id: string; name: string; email: string; role: string; department: string; studentCode: string; initials: string }[]
}

export async function loadDashboard(role?: Role): Promise<DashboardData> {
  const isAdmin = role === 'admin'
  const emptyAudit: AuditLogsResponse = { ok: true, events: [] }
  const emptyDepartments: DepartmentsResponse = { ok: true, departments: [] }

  const [coursesRes, sessionsRes, recordsRes, notificationsRes, analyticsRes, auditRes, usersRes, devicesRes, departmentsRes] =
    await Promise.all([
      api.courses().catch(() => ({ courses: [] as Course[] })),
      api.sessions().catch(() => ({ sessions: [] as ClassSession[], live: null })),
      api.records().catch(() => ({ records: [] as AttendanceRecord[] })),
      api.notifications().catch(() => ({ notifications: [] })),
      api.analytics().catch(() => ({
        metrics: { students: 0, teachers: 0, activeSessions: 0, attendanceRate: '0%', flagged: 0 },
        suspicious: [],
      })),
      isAdmin ? api.auditLogs().catch(() => emptyAudit) : Promise.resolve(emptyAudit),
      api.users().catch(() => ({ users: [] })),
      role === 'student' ? api.devices().catch(() => ({ devices: [] })) : Promise.resolve({ devices: [] }),
      isAdmin ? api.departments().catch(() => emptyDepartments) : Promise.resolve(emptyDepartments),
    ])

  return {
    courses: coursesRes.courses,
    sessions: sessionsRes.sessions,
    records: recordsRes.records,
    notifications: notificationsRes.notifications,
    metrics: analyticsRes.metrics,
    suspicious: analyticsRes.suspicious,
    auditEvents: auditRes.events ?? [],
    live: sessionsRes.live,
    devices: devicesRes.devices,
    departments: departmentsRes.departments ?? [],
    users: usersRes.users,
  }
}
