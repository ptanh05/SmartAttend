import { config } from 'dotenv'
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
  console.log('Resetting SmartAttend database...')

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

  console.log('Database cleared.')
  console.log('Register a teacher account at /staff/login to get started.')
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
