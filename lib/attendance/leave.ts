import { and, desc, eq } from 'drizzle-orm'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import {
  courses,
  leaveRequests,
  notifications,
  organizationMemberships,
  users,
} from '@/lib/db/schema'
import type { AuthContext } from '@/lib/auth/session'
import type { LeaveRequest, LeaveStatus } from '@/lib/types/domain'

export async function getLeaveRequests(auth: AuthContext, studentId?: string): Promise<LeaveRequest[]> {
  const targetStudent = auth.role === 'student' ? auth.userId : studentId

  const conditions = [eq(leaveRequests.organizationId, auth.organizationId)]
  if (targetStudent) {
    conditions.push(eq(leaveRequests.studentId, targetStudent))
  }

  const rows = await db()
    .select({
      req: leaveRequests,
      student: users,
      membership: organizationMemberships,
      course: courses,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.studentId, users.id))
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, leaveRequests.studentId),
        eq(organizationMemberships.organizationId, leaveRequests.organizationId),
      ),
    )
    .innerJoin(courses, eq(leaveRequests.courseId, courses.id))
    .where(and(...conditions))
    .orderBy(desc(leaveRequests.createdAt))

  return rows.map(({ req, student, membership, course }) => ({
    id: req.id,
    studentId: req.studentId,
    studentName: student.name,
    studentCode: membership?.studentCode ?? undefined,
    courseId: req.courseId,
    courseName: `${course.code} · ${course.name}`,
    sessionId: req.sessionId ?? undefined,
    date: req.date,
    reason: req.reason,
    evidenceNote: req.evidenceNote ?? undefined,
    status: req.status as LeaveStatus,
    createdAt: req.createdAt.toISOString(),
    reviewedAt: req.reviewedAt?.toISOString(),
    reviewedBy: req.reviewedByName ?? undefined,
  }))
}

export async function addLeaveRequest(
  auth: AuthContext,
  data: {
    courseId: string
    sessionId?: string
    date: string
    reason: string
    evidenceNote?: string
  },
): Promise<LeaveRequest> {
  const id = `lr_${nanoid(12)}`
  const now = new Date()

  await db().insert(leaveRequests).values({
    id,
    organizationId: auth.organizationId,
    studentId: auth.userId,
    courseId: data.courseId,
    sessionId: data.sessionId ?? null,
    date: data.date.trim(),
    reason: data.reason.trim(),
    evidenceNote: data.evidenceNote?.trim() || null,
    status: 'pending',
    createdAt: now,
  })

  // Fetch course name
  const courseRows = await db()
    .select()
    .from(courses)
    .where(and(eq(courses.id, data.courseId), eq(courses.organizationId, auth.organizationId)))
  const courseName = courseRows[0] ? `${courseRows[0].code} · ${courseRows[0].name}` : 'Course'

  return {
    id,
    studentId: auth.userId,
    studentName: auth.name,
    studentCode: auth.studentCode ?? undefined,
    courseId: data.courseId,
    courseName,
    sessionId: data.sessionId,
    date: data.date,
    reason: data.reason,
    evidenceNote: data.evidenceNote,
    status: 'pending',
    createdAt: now.toISOString(),
  }
}

export async function updateLeaveRequestStatus(
  auth: AuthContext,
  requestId: string,
  status: LeaveStatus,
): Promise<LeaveRequest | null> {
  if (auth.role !== 'teacher' && auth.role !== 'admin') {
    throw new Error('Forbidden')
  }

  const now = new Date()
  await db()
    .update(leaveRequests)
    .set({
      status,
      reviewedBy: auth.userId,
      reviewedByName: auth.name,
      reviewedAt: now,
    })
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.organizationId, auth.organizationId)))

  // Notify student
  const updatedRows = await db()
    .select({
      req: leaveRequests,
      student: users,
      membership: organizationMemberships,
      course: courses,
    })
    .from(leaveRequests)
    .innerJoin(users, eq(leaveRequests.studentId, users.id))
    .leftJoin(
      organizationMemberships,
      and(
        eq(organizationMemberships.userId, leaveRequests.studentId),
        eq(organizationMemberships.organizationId, leaveRequests.organizationId),
      ),
    )
    .innerJoin(courses, eq(leaveRequests.courseId, courses.id))
    .where(and(eq(leaveRequests.id, requestId), eq(leaveRequests.organizationId, auth.organizationId)))

  const row = updatedRows[0]
  if (!row) return null

  await db().insert(notifications).values({
    id: nanoid(),
    organizationId: auth.organizationId,
    userId: row.req.studentId,
    title: status === 'approved' ? 'Leave Request Approved' : 'Leave Request Rejected',
    body: `Your leave request for ${row.course.code} on ${row.req.date} was ${status} by ${auth.name}.`,
    createdAt: now,
  })

  return {
    id: row.req.id,
    studentId: row.req.studentId,
    studentName: row.student.name,
    studentCode: row.membership?.studentCode ?? undefined,
    courseId: row.req.courseId,
    courseName: `${row.course.code} · ${row.course.name}`,
    sessionId: row.req.sessionId ?? undefined,
    date: row.req.date,
    reason: row.req.reason,
    evidenceNote: row.req.evidenceNote ?? undefined,
    status: row.req.status as LeaveStatus,
    createdAt: row.req.createdAt.toISOString(),
    reviewedAt: row.req.reviewedAt?.toISOString(),
    reviewedBy: row.req.reviewedByName ?? undefined,
  }
}
