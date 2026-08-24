import { describe, expect, it } from 'vitest'
import { addLeaveRequest, getLeaveRequests, updateLeaveRequestStatus } from './leave'

describe('Leave Requests Workflow', () => {
  it('should list existing initial leave requests', () => {
    const requests = getLeaveRequests()
    expect(requests.length).toBeGreaterThan(0)
  })

  it('should filter requests by studentId', () => {
    const student1Requests = getLeaveRequests('usr-student-1')
    expect(student1Requests.every((r) => r.studentId === 'usr-student-1' || r.studentCode === 'usr-student-1')).toBe(true)
  })

  it('should allow student to submit a new leave request', () => {
    const newReq = addLeaveRequest({
      studentId: 'test-student-99',
      studentName: 'Test Sinh Vien',
      studentCode: '20269999',
      courseId: 'course-1',
      courseName: 'Lập trình Web nâng cao',
      date: '25/08/2026',
      reason: 'Tham gia đại hội thể thao sinh viên',
      evidenceNote: 'Giấy triệu tập số 05/ĐHTDTT',
    })

    expect(newReq.id).toBeDefined()
    expect(newReq.status).toBe('pending')

    const studentList = getLeaveRequests('test-student-99')
    expect(studentList.some((r) => r.id === newReq.id)).toBe(true)
  })

  it('should allow teacher to approve or reject a leave request', () => {
    const req = addLeaveRequest({
      studentId: 'test-student-review',
      studentName: 'Sinh Vien Review',
      courseId: 'course-2',
      courseName: 'Cơ sở dữ liệu',
      date: '26/08/2026',
      reason: 'Khám sức khỏe định kỳ',
    })

    const approved = updateLeaveRequestStatus(req.id, 'approved', 'Giảng viên A')
    expect(approved?.status).toBe('approved')
    expect(approved?.reviewedBy).toBe('Giảng viên A')
    expect(approved?.reviewedAt).toBeDefined()

    const rejected = updateLeaveRequestStatus(req.id, 'rejected', 'Giảng viên B')
    expect(rejected?.status).toBe('rejected')
    expect(rejected?.reviewedBy).toBe('Giảng viên B')
  })
})
