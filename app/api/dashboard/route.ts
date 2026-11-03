import { NextResponse } from 'next/server'
import {
  getAttendancePolicy,
  getLiveSessionDetails,
  getOrganizationMetrics,
  listAuditLogs,
  listClassSessions,
  listCourses,
  listDepartments,
  listDevices,
  listNotifications,
  listRecords,
  listSuspicious,
  listUsers,
} from '@/lib/attendance/server'
import { getLeaveRequests } from '@/lib/attendance/leave'
import { getCurrentAuth } from '@/lib/auth/context'
import type { Course } from '@/lib/types/domain'

export async function GET() {
  const auth = await getCurrentAuth()
  if (!auth) {
    return NextResponse.json({ ok: false, message: 'Unauthorized' }, { status: 401 })
  }

  try {
    if (auth.role === 'student') {
      const [sessions, records, notifications, devices, leaveRequests] = await Promise.all([
        listClassSessions(auth.organizationId, auth.userId),
        listRecords(auth, auth.userId),
        listNotifications(auth),
        listDevices(auth),
        getLeaveRequests(auth, auth.userId),
      ])

      const courses: Course[] = Array.from(
        new Map(
          (sessions || [])
            .filter((s) => s.courseId && (s.courseName || s.courseCode))
            .map((s) => [
              s.courseId,
              {
                id: s.courseId,
                organizationId: auth.organizationId,
                code: s.courseCode ?? s.courseId,
                name: s.courseName ?? s.courseCode ?? 'Course',
                department: '',
                teacherId: '',
                enrolled: s.enrolledCount ?? 0,
                color: 'blue',
                status: 'active',
              } as Course,
            ])
        ).values()
      )

      return NextResponse.json({
        ok: true,
        courses,
        sessions,
        records,
        notifications,
        metrics: { students: 0, teachers: 0, activeSessions: 0, attendanceRate: '0%', flagged: 0 },
        suspicious: [],
        auditEvents: [],
        live: null,
        devices,
        departments: [],
        users: [],
        leaveRequests,
        policy: undefined,
      })
    }

    if (auth.role === 'teacher') {
      const [
        courses,
        sessions,
        live,
        records,
        notifications,
        suspicious,
        users,
        leaveRequests,
        policy,
      ] = await Promise.all([
        listCourses(auth.organizationId),
        listClassSessions(auth.organizationId),
        getLiveSessionDetails(auth),
        listRecords(auth),
        listNotifications(auth),
        listSuspicious(auth),
        listUsers(auth),
        getLeaveRequests(auth),
        getAttendancePolicy(auth.organizationId),
      ])

      const metrics = await getOrganizationMetrics(auth, suspicious.length)

      return NextResponse.json({
        ok: true,
        courses,
        sessions,
        records,
        notifications,
        metrics,
        suspicious,
        auditEvents: [],
        live,
        devices: [],
        departments: [],
        users,
        leaveRequests,
        policy,
      })
    }

    // Role: admin
    const [
      courses,
      sessions,
      live,
      records,
      notifications,
      suspicious,
      auditEvents,
      departments,
      users,
      leaveRequests,
      policy,
    ] = await Promise.all([
      listCourses(auth.organizationId),
      listClassSessions(auth.organizationId),
      getLiveSessionDetails(auth),
      listRecords(auth),
      listNotifications(auth),
      listSuspicious(auth),
      listAuditLogs(auth),
      listDepartments(auth),
      listUsers(auth),
      getLeaveRequests(auth),
      getAttendancePolicy(auth.organizationId),
    ])

    const metrics = await getOrganizationMetrics(auth, suspicious.length)

    return NextResponse.json({
      ok: true,
      courses,
      sessions,
      records,
      notifications,
      metrics,
      suspicious,
      auditEvents,
      live,
      devices: [],
      departments,
      users,
      leaveRequests,
      policy,
    })
  } catch (error) {
    console.error('Failed to load dashboard aggregate data', error)
    return NextResponse.json({ ok: false, message: 'Internal Server Error' }, { status: 500 })
  }
}

