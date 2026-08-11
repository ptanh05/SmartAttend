import { courses, records, sessions, users } from '@/lib/demo/data'

export function courseForSession(sessionId: string) {
  const session = sessions.find((item) => item.id === sessionId)
  return courses.find((course) => course.id === session?.courseId)
}

export function studentRecords(studentId = 'stu_maya') {
  return records.filter((record) => record.studentId === studentId)
}

export function attendanceRate(studentId = 'stu_maya') {
  const rows = studentRecords(studentId)
  if (!rows.length) return 0
  return Math.round((rows.filter((row) => row.status === 'present' || row.status === 'late').length / rows.length) * 100)
}

export function liveSession() {
  return sessions.find((session) => session.status === 'live') ?? sessions[0]
}

export function usersByRole(role: 'student' | 'teacher' | 'admin') {
  return users.filter((user) => user.role === role)
}

export function organizationMetrics() {
  return { attendanceRate: '94.8%', activeSessions: sessions.filter((session) => session.status === 'live').length, students: 1248, flagged: 6 }
}
