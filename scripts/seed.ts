import { config } from 'dotenv'
import { nanoid } from 'nanoid'
import { hashPassword } from '../lib/auth/password'
import { db } from '../lib/db'
import {
  attendancePolicies,
  attendanceRecords,
  attendanceSessions,
  attendanceChallenges,
  attendanceVerifications,
  auditLogs,
  authSessions,
  classEnrollments,
  courseSections,
  courses,
  departments,
  devices,
  notifications,
  organizationMemberships,
  organizations,
  suspiciousAttempts,
  users,
} from '../lib/db/schema'

config({ path: '.env' })

async function seed() {
  console.log('Seeding SmartAttend database...')

  const passwordHash = await hashPassword('demo1234')
  const orgId = 'org_northstar'

  await db().delete(auditLogs)
  await db().delete(notifications)
  await db().delete(suspiciousAttempts)
  await db().delete(devices)
  await db().delete(attendanceVerifications)
  await db().delete(attendanceChallenges)
  await db().delete(attendanceRecords)
  await db().delete(attendanceSessions)
  await db().delete(classEnrollments)
  await db().delete(courseSections)
  await db().delete(courses)
  await db().delete(departments)
  await db().delete(attendancePolicies)
  await db().delete(authSessions)
  await db().delete(organizationMemberships)
  await db().delete(users)
  await db().delete(organizations)

  await db().insert(organizations).values({
    id: orgId,
    name: 'Northstar University',
    plan: 'Campus Plus',
  })

  const demoUsers = [
    { id: 'stu_maya', email: 'student@demo.com', name: 'Maya Johnson', initials: 'MJ', role: 'student', department: 'Computer Science' },
    { id: 'tch_amir', email: 'teacher@demo.com', name: 'Dr. Amir Patel', initials: 'AP', role: 'teacher', department: 'Computer Science' },
    { id: 'adm_elena', email: 'admin@demo.com', name: 'Elena Rodriguez', initials: 'ER', role: 'admin', department: 'Academic Affairs' },
    { id: 'stu_noah', email: 'noah.williams@northstar.edu', name: 'Noah Williams', initials: 'NW', role: 'student', department: 'Computer Science' },
    { id: 'stu_ava', email: 'ava.thompson@northstar.edu', name: 'Ava Thompson', initials: 'AT', role: 'student', department: 'Computer Science' },
  ]

  for (const user of demoUsers) {
    await db().insert(users).values({
      id: user.id,
      email: user.email,
      passwordHash,
      name: user.name,
      initials: user.initials,
    })

    await db().insert(organizationMemberships).values({
      id: nanoid(),
      organizationId: orgId,
      userId: user.id,
      role: user.role,
      department: user.department,
      status: 'active',
    })
  }

  const deptIds = {
    cs: 'dept_cs',
    business: 'dept_business',
    math: 'dept_math',
    affairs: 'dept_affairs',
  }

  await db().insert(departments).values([
    { id: deptIds.cs, organizationId: orgId, name: 'Computer Science' },
    { id: deptIds.business, organizationId: orgId, name: 'Business Administration' },
    { id: deptIds.math, organizationId: orgId, name: 'Mathematics' },
    { id: deptIds.affairs, organizationId: orgId, name: 'Academic Affairs' },
  ])

  const courseRows = [
    { id: 'crs_hci', code: 'CS-304', name: 'Human Computer Interaction', enrolled: 28, color: 'indigo' },
    { id: 'crs_db', code: 'CS-310', name: 'Database Systems', enrolled: 31, color: 'emerald' },
    { id: 'crs_se', code: 'CS-320', name: 'Software Engineering', enrolled: 27, color: 'amber' },
  ]

  for (const course of courseRows) {
    await db().insert(courses).values({
      id: course.id,
      organizationId: orgId,
      code: course.code,
      name: course.name,
      department: 'Computer Science',
      teacherId: 'tch_amir',
      enrolled: course.enrolled,
      color: course.color,
    })
  }

  const sections = [
    { id: 'sec_hci', courseId: 'crs_hci', room: 'Room 204', startsAt: '09:00', endsAt: '10:30', status: 'scheduled' },
    { id: 'sec_db', courseId: 'crs_db', room: 'Lab 3', startsAt: '11:00', endsAt: '12:30', status: 'scheduled' },
    { id: 'sec_se', courseId: 'crs_se', room: 'Room 118', startsAt: '14:00', endsAt: '15:30', status: 'scheduled' },
  ]

  for (const section of sections) {
    await db().insert(courseSections).values({
      id: section.id,
      organizationId: orgId,
      courseId: section.courseId,
      room: section.room,
      startsAt: section.startsAt,
      endsAt: section.endsAt,
      status: section.status,
    })
  }

  for (const studentId of ['stu_maya', 'stu_noah', 'stu_ava']) {
    for (const section of sections) {
      await db().insert(classEnrollments).values({
        sectionId: section.id,
        studentId,
        organizationId: orgId,
        status: 'active',
      })
    }
  }

  await db().insert(attendancePolicies).values({
    id: nanoid(),
    organizationId: orgId,
    lateAfterMinutes: 10,
    challengeTtlSeconds: 120,
    requireTrustedDevice: false,
  })

  const sessionId = 'ses_hci_live'
  await db().insert(attendanceSessions).values({
    id: sessionId,
    organizationId: orgId,
    sectionId: 'sec_hci',
    courseId: 'crs_hci',
    teacherId: 'tch_amir',
    status: 'draft',
  })

  await db().insert(attendanceRecords).values([
    {
      id: 'att_1',
      organizationId: orgId,
      sessionId: 'ses_hci_live',
      studentId: 'stu_maya',
      status: 'present',
      verificationScore: 98,
      verifiedAt: new Date(),
      device: 'iPhone 15',
    },
    {
      id: 'att_2',
      organizationId: orgId,
      sessionId: 'ses_hci_live',
      studentId: 'stu_noah',
      status: 'late',
      verificationScore: 91,
      verifiedAt: new Date(),
      device: 'Pixel 8',
    },
  ])

  await db().insert(devices).values({
    id: nanoid(),
    organizationId: orgId,
    studentId: 'stu_maya',
    label: 'iPhone 15',
    trusted: true,
    lastSeenAt: new Date(),
  })

  await db().insert(notifications).values([
    {
      id: 'n1',
      organizationId: orgId,
      userId: 'stu_maya',
      title: 'Attendance confirmed',
      body: 'You were marked present for Human Computer Interaction.',
    },
    {
      id: 'n2',
      organizationId: orgId,
      userId: 'stu_maya',
      title: 'New class reminder',
      body: 'Database Systems begins in 45 minutes in Lab 3.',
    },
    {
      id: 'n3',
      organizationId: orgId,
      userId: 'stu_maya',
      title: 'Report ready',
      body: 'Your September attendance report is ready to download.',
      readAt: new Date(),
    },
  ])

  await db().insert(suspiciousAttempts).values([
    {
      id: nanoid(),
      organizationId: orgId,
      reason: 'Ava Thompson · Similar device fingerprint',
      status: 'open',
    },
    {
      id: nanoid(),
      organizationId: orgId,
      reason: 'Ethan Brooks · Outside expected time window',
      status: 'open',
    },
    {
      id: nanoid(),
      organizationId: orgId,
      reason: 'Olivia Kim · Repeated failed challenges',
      status: 'open',
    },
  ])

  await db().insert(auditLogs).values([
    {
      id: 'a1',
      organizationId: orgId,
      actorId: 'adm_elena',
      actorName: 'Elena Rodriguez',
      action: 'Updated attendance policy',
      target: 'Organization settings',
      severity: 'info',
    },
    {
      id: 'a2',
      organizationId: orgId,
      actorId: 'tch_amir',
      actorName: 'Dr. Amir Patel',
      action: 'Flagged verification attempt',
      target: 'Maya Johnson · CS-304',
      severity: 'warning',
    },
    {
      id: 'a3',
      organizationId: orgId,
      actorId: 'adm_elena',
      actorName: 'Elena Rodriguez',
      action: 'Invited new teacher',
      target: 'Prof. Lena Ortiz',
      severity: 'info',
    },
  ])

  console.log('Seed complete.')
  console.log('Demo accounts: student@demo.com, teacher@demo.com, admin@demo.com / demo1234')
}

seed().catch((error) => {
  console.error(error)
  process.exit(1)
})
