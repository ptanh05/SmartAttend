import type { LeaveRequest, LeaveStatus } from '@/lib/types/domain'

let leaveRequestsStore: LeaveRequest[] = [
  {
    id: 'lr-1',
    studentId: 'usr-student-1',
    studentName: 'Nguyễn Văn An',
    studentCode: '20260001',
    courseId: 'course-1',
    courseName: 'Lập trình Web nâng cao (IT301)',
    date: '24/08/2026',
    reason: 'Sốt xuất huyết điều trị tại Bệnh viện GTVT',
    evidenceNote: 'Giấy khám bệnh & chỉ định nghỉ số 482/BV-GTVT ngày 24/08/2026',
    status: 'pending',
    createdAt: '24/08/2026 08:30',
  },
  {
    id: 'lr-2',
    studentId: 'usr-student-2',
    studentName: 'Trần Thị Mai',
    studentCode: '20260002',
    courseId: 'course-2',
    courseName: 'Cơ sở dữ liệu phân tán (IT302)',
    date: '22/08/2026',
    reason: 'Tham gia đội tuyển Olympic Tin học sinh viên toàn quốc',
    evidenceNote: 'Quyết định cử đoàn thi đấu số 118/QĐ-ĐHGTVT',
    status: 'approved',
    createdAt: '22/08/2026 09:15',
    reviewedAt: '22/08/2026 10:00',
    reviewedBy: 'ThS. Nguyễn Văn Thầy',
  },
]

export function getLeaveRequests(studentId?: string): LeaveRequest[] {
  if (studentId) {
    return leaveRequestsStore.filter((r) => r.studentId === studentId || r.studentCode === studentId)
  }
  return [...leaveRequestsStore]
}

export function addLeaveRequest(req: Omit<LeaveRequest, 'id' | 'createdAt' | 'status'>): LeaveRequest {
  const newReq: LeaveRequest = {
    ...req,
    id: `lr-${Date.now()}`,
    status: 'pending',
    createdAt: new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' }),
  }
  leaveRequestsStore = [newReq, ...leaveRequestsStore]
  return newReq
}

export function updateLeaveRequestStatus(requestId: string, status: LeaveStatus, reviewerName = 'Giảng viên phụ trách'): LeaveRequest | null {
  const req = leaveRequestsStore.find((r) => r.id === requestId)
  if (!req) return null
  req.status = status
  req.reviewedAt = new Date().toLocaleDateString('vi-VN') + ' ' + new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
  req.reviewedBy = reviewerName
  return req
}
