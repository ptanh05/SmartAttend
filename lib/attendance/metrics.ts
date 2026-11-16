export type AttendanceMetricSession = {
  id: string
  sectionId: string
}

export type AttendanceMetricEnrollment = {
  sectionId: string
  studentId: string
}

export type AttendanceMetricRecord = {
  sessionId: string
  studentId: string
  status: string
}

export function calculateAttendanceRate(
  sessions: AttendanceMetricSession[],
  enrollments: AttendanceMetricEnrollment[],
  records: AttendanceMetricRecord[],
) {
  const studentsBySection = new Map<string, Set<string>>()
  for (const enrollment of enrollments) {
    const students = studentsBySection.get(enrollment.sectionId) ?? new Set<string>()
    students.add(enrollment.studentId)
    studentsBySection.set(enrollment.sectionId, students)
  }

  const sessionById = new Map(sessions.map((session) => [session.id, session]))
  const expectedAttendanceCount = sessions.reduce(
    (total, session) => total + (studentsBySection.get(session.sectionId)?.size ?? 0),
    0,
  )

  if (expectedAttendanceCount === 0) return 0

  const attended = new Set<string>()
  for (const record of records) {
    if (record.status !== 'present' && record.status !== 'late') continue
    const session = sessionById.get(record.sessionId)
    if (!session) continue
    if (!studentsBySection.get(session.sectionId)?.has(record.studentId)) continue
    attended.add(`${record.sessionId}:${record.studentId}`)
  }

  return Math.round((attended.size / expectedAttendanceCount) * 1000) / 10
}
