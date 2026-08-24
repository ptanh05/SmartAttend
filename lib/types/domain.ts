export type Role = 'student' | 'teacher' | 'admin'
export type AttendanceStatus = 'present' | 'late' | 'absent' | 'excused' | 'pending' | 'flagged'
export type User = { id: string; organizationId: string; name: string; email: string; role: Role; initials: string; department: string }
export type Course = { id: string; organizationId: string; code: string; name: string; department: string; teacherId: string; enrolled: number; color: string }
export type SessionStatus = 'draft' | 'active' | 'paused' | 'closed' | 'expired' | 'scheduled' | 'live'
export type ClassSession = {
  id: string
  sectionId: string
  courseId: string
  courseCode?: string
  courseName?: string
  room: string
  startsAt: string
  endsAt: string
  dayOfWeek?: number
  autoStart?: boolean
  status: SessionStatus
  challenge: string
  enrolledCount?: number
}
export type AttendanceRecord = { id: string; sessionId: string; studentId: string; status: AttendanceStatus; confidence: number; verifiedAt?: string; device: string; flaggedReason?: string }
export type Notification = { id: string; title: string; body: string; read: boolean; createdAt: string }
export type AuditEvent = { id: string; actor: string; action: string; target: string; createdAt: string; severity: 'info' | 'warning' }
export type LeaveStatus = 'pending' | 'approved' | 'rejected'
export type LeaveRequest = {
  id: string
  studentId: string
  studentName: string
  studentCode?: string
  courseId: string
  courseName: string
  sessionId?: string
  date: string
  reason: string
  evidenceNote?: string
  status: LeaveStatus
  createdAt: string
  reviewedAt?: string
  reviewedBy?: string
}
export type DemoSession = { user: User; organization: { id: string; name: string; plan: string } }
export type DashboardMetric = { label: string; value: string; detail: string; trend?: string }
export const roles: Role[] = ['student', 'teacher', 'admin']
export function canAccess(role: Role, area: Role) { return role === area || role === 'admin' }
export function formatStatus(status: AttendanceStatus) { return status.charAt(0).toUpperCase() + status.slice(1) }
