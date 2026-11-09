import { describe, it, expect, vi, beforeEach } from 'vitest'
import { GET } from '@/app/api/dashboard/route'
import * as authModule from '@/lib/auth/context'
import type { AuthContext } from '@/lib/auth/session'

vi.mock('@/lib/auth/context', () => ({
  getCurrentAuth: vi.fn(),
  passwordChangePendingResponse: vi.fn().mockResolvedValue(null),
}))

vi.mock('@/lib/attendance/server', () => ({
  listCourses: vi.fn().mockResolvedValue([
    { id: 'c1', name: 'Lập trình Web', code: 'IT101', enrolled: 45 },
  ]),
  listClassSessions: vi.fn().mockResolvedValue([
    { id: 's1', sectionId: 'sec1', courseId: 'c1', courseName: 'Lập trình Web', status: 'live' },
  ]),
  getLiveSessionDetails: vi.fn().mockResolvedValue(null),
  listRecords: vi.fn().mockResolvedValue([]),
  listNotifications: vi.fn().mockResolvedValue([]),
  getOrganizationMetrics: vi.fn().mockResolvedValue({
    students: 100,
    teachers: 5,
    activeSessions: 1,
    attendanceRate: '95%',
    flagged: 0,
  }),
  listSuspicious: vi.fn().mockResolvedValue([]),
  listAuditLogs: vi.fn().mockResolvedValue([]),
  listDevices: vi.fn().mockResolvedValue([]),
  listDepartments: vi.fn().mockResolvedValue(['CNTT']),
  listUsers: vi.fn().mockResolvedValue([]),
  getAttendancePolicy: vi.fn().mockResolvedValue({ challengeTtlSeconds: 30, lateAfterMinutes: 10 }),
}))

vi.mock('@/lib/attendance/leave', () => ({
  getLeaveRequests: vi.fn().mockResolvedValue([]),
}))

describe('Consolidated Dashboard API (/api/dashboard)', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('rejects unauthenticated request with 401', async () => {
    vi.mocked(authModule.getCurrentAuth).mockResolvedValueOnce(null)
    const res = await GET()
    expect(res.status).toBe(401)
    const data = await res.json()
    expect(data.ok).toBe(false)
  })

  it('returns scoped aggregated data for student role in single response', async () => {
    const studentAuth: AuthContext = {
      userId: 'stu_123',
      membershipId: 'mem_123',
      organizationId: 'org_123',
      role: 'student',
      email: 'student@utc.edu.vn',
      name: 'Nguyen Van A',
      initials: 'NA',
      department: 'CNTT',
      studentCode: '2026001',
      mustChangePassword: false,
      organizationName: 'UTC',
      organizationPlan: 'Campus Plus',
    }
    vi.mocked(authModule.getCurrentAuth).mockResolvedValueOnce(studentAuth)

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(Array.isArray(data.courses)).toBe(true)
    expect(Array.isArray(data.sessions)).toBe(true)
    expect(Array.isArray(data.records)).toBe(true)
    expect(data.users).toEqual([])
    expect(data.auditEvents).toEqual([])
  })

  it('returns full staff metrics and sessions for teacher role', async () => {
    const teacherAuth: AuthContext = {
      userId: 'tch_123',
      membershipId: 'mem_tch_123',
      organizationId: 'org_123',
      role: 'teacher',
      email: 'teacher@utc.edu.vn',
      name: 'Tran Thi B',
      initials: 'TB',
      department: 'CNTT',
      studentCode: null,
      mustChangePassword: false,
      organizationName: 'UTC',
      organizationPlan: 'Campus Plus',
    }
    vi.mocked(authModule.getCurrentAuth).mockResolvedValueOnce(teacherAuth)

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.metrics.students).toBe(100)
    expect(data.policy).toBeDefined()
  })

  it('returns audit events and departments for admin role', async () => {
    const adminAuth: AuthContext = {
      userId: 'adm_123',
      membershipId: 'mem_adm_123',
      organizationId: 'org_123',
      role: 'admin',
      email: 'admin@utc.edu.vn',
      name: 'Admin UTC',
      initials: 'AU',
      department: 'Ban Dao Tao',
      studentCode: null,
      mustChangePassword: false,
      organizationName: 'UTC',
      organizationPlan: 'Campus Plus',
    }
    vi.mocked(authModule.getCurrentAuth).mockResolvedValueOnce(adminAuth)

    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.ok).toBe(true)
    expect(data.departments).toEqual(['CNTT'])
    expect(Array.isArray(data.auditEvents)).toBe(true)
  })
})

