import { describe, expect, it } from 'vitest'
import { calculateAttendanceRate } from './metrics'

const sessions = [{ id: 'session-1', sectionId: 'section-1' }]
const enrollments = Array.from({ length: 10 }, (_, index) => ({
  sectionId: 'section-1',
  studentId: `student-${index + 1}`,
}))

describe('calculateAttendanceRate', () => {
  it('returns 0% when a session has enrolled students but nobody has checked in', () => {
    expect(calculateAttendanceRate(sessions, enrollments, [])).toBe(0)
  })

  it('uses enrolled students as the denominator', () => {
    expect(
      calculateAttendanceRate(sessions, enrollments, [
        { sessionId: 'session-1', studentId: 'student-1', status: 'present' },
      ]),
    ).toBe(10)
  })

  it('does not count records for students outside the section roster', () => {
    expect(
      calculateAttendanceRate(sessions, enrollments, [
        { sessionId: 'session-1', studentId: 'other-student', status: 'present' },
      ]),
    ).toBe(0)
  })
})
