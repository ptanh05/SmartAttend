import type { AttendanceRecord, AuditEvent, ClassSession, Course, Notification, User } from '@/lib/types/domain'

export const organization = { id: 'org_northstar', name: 'Northstar University', plan: 'Campus Plus' }
export const users: User[] = [
  { id: 'stu_maya', organizationId: organization.id, name: 'Maya Johnson', email: 'maya.johnson@northstar.edu', role: 'student', initials: 'MJ', department: 'Computer Science' },
  { id: 'tch_amir', organizationId: organization.id, name: 'Dr. Amir Patel', email: 'amir.patel@northstar.edu', role: 'teacher', initials: 'AP', department: 'Computer Science' },
  { id: 'adm_elena', organizationId: organization.id, name: 'Elena Rodriguez', email: 'elena.rodriguez@northstar.edu', role: 'admin', initials: 'ER', department: 'Academic Affairs' },
]
export const courses: Course[] = [
  { id: 'crs_hci', organizationId: organization.id, code: 'CS-304', name: 'Human Computer Interaction', department: 'Computer Science', teacherId: 'tch_amir', enrolled: 28, color: 'indigo' },
  { id: 'crs_db', organizationId: organization.id, code: 'CS-310', name: 'Database Systems', department: 'Computer Science', teacherId: 'tch_amir', enrolled: 31, color: 'emerald' },
  { id: 'crs_se', organizationId: organization.id, code: 'CS-320', name: 'Software Engineering', department: 'Computer Science', teacherId: 'tch_amir', enrolled: 27, color: 'amber' },
]
export const sessions: ClassSession[] = [
  { id: 'ses_hci', courseId: 'crs_hci', room: 'Room 204', startsAt: '09:00', endsAt: '10:30', status: 'live', challenge: 'A7K2P9' },
  { id: 'ses_db', courseId: 'crs_db', room: 'Lab 3', startsAt: '11:00', endsAt: '12:30', status: 'scheduled', challenge: 'B4Q8M1' },
  { id: 'ses_se', courseId: 'crs_se', room: 'Room 118', startsAt: '14:00', endsAt: '15:30', status: 'scheduled', challenge: 'D9L3R6' },
]
export const records: AttendanceRecord[] = [
  { id: 'att_1', sessionId: 'ses_hci', studentId: 'stu_maya', status: 'present', confidence: 98, verifiedAt: '09:12', device: 'iPhone 15' },
  { id: 'att_2', sessionId: 'ses_db', studentId: 'stu_maya', status: 'late', confidence: 91, verifiedAt: '11:18', device: 'iPhone 15' },
  { id: 'att_3', sessionId: 'ses_se', studentId: 'stu_maya', status: 'absent', confidence: 0, device: 'iPhone 15' },
]
export const notifications: Notification[] = [
  { id: 'n1', title: 'Attendance confirmed', body: 'You were marked present for Human Computer Interaction.', read: false, createdAt: '12 min ago' },
  { id: 'n2', title: 'New class reminder', body: 'Database Systems begins in 45 minutes in Lab 3.', read: false, createdAt: '28 min ago' },
  { id: 'n3', title: 'Report ready', body: 'Your September attendance report is ready to download.', read: true, createdAt: 'Yesterday' },
]
export const auditEvents: AuditEvent[] = [
  { id: 'a1', actor: 'Elena Rodriguez', action: 'Updated attendance policy', target: 'Organization settings', createdAt: 'Today, 10:42 AM', severity: 'info' },
  { id: 'a2', actor: 'Dr. Amir Patel', action: 'Flagged verification attempt', target: 'Maya Johnson · CS-304', createdAt: 'Today, 09:18 AM', severity: 'warning' },
  { id: 'a3', actor: 'Elena Rodriguez', action: 'Invited new teacher', target: 'Prof. Lena Ortiz', createdAt: 'Yesterday, 04:21 PM', severity: 'info' },
]
export function userForRole(role: User['role']) { return users.find((user) => user.role === role) ?? users[0] }
