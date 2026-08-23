import { config } from 'dotenv'
import bcrypt from 'bcryptjs'
import { nanoid } from 'nanoid'
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

const sampleStudents = [
  { code: '20260001', name: 'Nguyễn Văn An', email: '20260001@student.utc.edu.vn' },
  { code: '20260002', name: 'Trần Thị Bình', email: '20260002@student.utc.edu.vn' },
  { code: '20260003', name: 'Lê Hoàng Cường', email: '20260003@student.utc.edu.vn' },
  { code: '20260004', name: 'Phạm Thu Dung', email: '20260004@student.utc.edu.vn' },
  { code: '20260005', name: 'Đỗ Minh Đức', email: '20260005@student.utc.edu.vn' },
  { code: '20260006', name: 'Vũ Hải Đăng', email: '20260006@student.utc.edu.vn' },
  { code: '20260007', name: 'Hoàng Ngọc Hà', email: '20260007@student.utc.edu.vn' },
  { code: '20260008', name: 'Bùi Quang Hưng', email: '20260008@student.utc.edu.vn' },
  { code: '20260009', name: 'Đinh Thị Mai', email: '20260009@student.utc.edu.vn' },
  { code: '20260010', name: 'Ngô Đức Nam', email: '20260010@student.utc.edu.vn' },
  { code: '20260011', name: 'Trịnh Phương Linh', email: '20260011@student.utc.edu.vn' },
  { code: '20260012', name: 'Phan Văn Phong', email: '20260012@student.utc.edu.vn' },
  { code: '20260013', name: 'Đoàn Quỳnh Nga', email: '20260013@student.utc.edu.vn' },
  { code: '20260014', name: 'Lý Quốc Thắng', email: '20260014@student.utc.edu.vn' },
  { code: '20260015', name: 'Tạ Minh Tuấn', email: '20260015@student.utc.edu.vn' },
  { code: '20260016', name: 'Cao Thanh Uyên', email: '20260016@student.utc.edu.vn' },
  { code: '20260017', name: 'Dương Văn Vinh', email: '20260017@student.utc.edu.vn' },
  { code: '20260018', name: 'Lâm Bích Xuân', email: '20260018@student.utc.edu.vn' },
  { code: '20260019', name: 'Hà Hải Yến', email: '20260019@student.utc.edu.vn' },
  { code: '20260020', name: 'Nguyễn Tiến Đạt', email: '20260020@student.utc.edu.vn' },
]

async function seed() {
  console.log('--- Cleaning SmartAttend database... ---')

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

  console.log('--- Creating Sample University & Departments... ---')
  const orgId = 'org_utc'
  await db().insert(organizations).values({
    id: orgId,
    name: 'Đại học Giao Thông Vận Tải (UTC)',
    plan: 'Campus Plus',
  })

  await db().insert(attendancePolicies).values({
    id: nanoid(),
    organizationId: orgId,
    challengeTtlSeconds: 30,
    lateAfterMinutes: 15,
    requireTrustedDevice: false,
  })

  const depts = ['Công nghệ thông tin', 'Điện tử viễn thông', 'Kinh tế vận tải']
  for (const name of depts) {
    await db().insert(departments).values({
      id: nanoid(),
      organizationId: orgId,
      name,
    })
  }

  console.log('--- Creating Teachers & Admins... ---')
  const passwordHash = await bcrypt.hash('12345678', 10)
  const studentPasswordHash = await bcrypt.hash('student123', 10)

  const teacherId = 'usr_teacher_1'
  await db().insert(users).values({
    id: teacherId,
    email: 'teacher@smartattend.edu.vn',
    passwordHash,
    name: 'ThS. Nguyễn Văn Thầy',
    initials: 'NT',
    mustChangePassword: false,
  })

  await db().insert(organizationMemberships).values({
    id: nanoid(),
    organizationId: orgId,
    userId: teacherId,
    role: 'teacher',
    department: 'Công nghệ thông tin',
    status: 'active',
  })

  const adminId = 'usr_admin_1'
  await db().insert(users).values({
    id: adminId,
    email: 'admin@smartattend.edu.vn',
    passwordHash,
    name: 'Ban Đào Tạo UTC',
    initials: 'DT',
    mustChangePassword: false,
  })

  await db().insert(organizationMemberships).values({
    id: nanoid(),
    organizationId: orgId,
    userId: adminId,
    role: 'admin',
    department: 'Công nghệ thông tin',
    status: 'active',
  })

  console.log('--- Creating Courses & Recurring Weekly Schedules... ---')
  const course1 = 'crs_it301'
  const course2 = 'crs_it302'
  const course3 = 'crs_it303'

  await db().insert(courses).values([
    {
      id: course1,
      organizationId: orgId,
      code: 'IT301',
      name: 'Lập trình Web & Ứng dụng phân tán',
      department: 'Công nghệ thông tin',
      teacherId,
      enrolled: 20,
      color: 'blue',
      status: 'active',
    },
    {
      id: course2,
      organizationId: orgId,
      code: 'IT302',
      name: 'Cơ sở dữ liệu & Hệ thống thông tin',
      department: 'Công nghệ thông tin',
      teacherId,
      enrolled: 20,
      color: 'emerald',
      status: 'active',
    },
    {
      id: course3,
      organizationId: orgId,
      code: 'IT303',
      name: 'Trí tuệ nhân tạo & Máy học',
      department: 'Công nghệ thông tin',
      teacherId,
      enrolled: 20,
      color: 'purple',
      status: 'active',
    },
  ])

  // Get current day of week (1=Mon, 2=Tue, ..., 7=Sun)
  const currentDay = new Date().getDay()
  const todayDayOfWeek = currentDay === 0 ? 7 : currentDay

  const section1 = 'sec_it301_today'
  const section2 = 'sec_it302_t3'
  const section3 = 'sec_it303_t5'

  await db().insert(courseSections).values([
    {
      id: section1,
      organizationId: orgId,
      courseId: course1,
      room: 'P.302 - Nhà A1',
      startsAt: '07:30',
      endsAt: '11:30',
      dayOfWeek: todayDayOfWeek, // Always match today so it is instantly live/testable
      autoStart: true,
      status: 'scheduled',
    },
    {
      id: section2,
      organizationId: orgId,
      courseId: course2,
      room: 'Lab CNTT 1',
      startsAt: '13:30',
      endsAt: '15:30',
      dayOfWeek: todayDayOfWeek === 2 ? 3 : 2,
      autoStart: true,
      status: 'scheduled',
    },
    {
      id: section3,
      organizationId: orgId,
      courseId: course3,
      room: 'P.501 - Nhà A2',
      startsAt: '09:45',
      endsAt: '11:45',
      dayOfWeek: todayDayOfWeek === 4 ? 5 : 4,
      autoStart: true,
      status: 'scheduled',
    },
  ])

  console.log('--- Creating Students & Class Enrollments... ---')
  for (const st of sampleStudents) {
    const studentUserId = `usr_${st.code}`
    await db().insert(users).values({
      id: studentUserId,
      email: st.email,
      passwordHash: studentPasswordHash,
      name: st.name,
      initials: st.name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase(),
      mustChangePassword: false,
    })

    await db().insert(organizationMemberships).values({
      id: nanoid(),
      organizationId: orgId,
      userId: studentUserId,
      role: 'student',
      department: 'Công nghệ thông tin',
      studentCode: st.code,
      status: 'active',
    })

    // Enroll into all sections
    await db().insert(classEnrollments).values([
      { sectionId: section1, studentId: studentUserId, organizationId: orgId, status: 'active' },
      { sectionId: section2, studentId: studentUserId, organizationId: orgId, status: 'active' },
      { sectionId: section3, studentId: studentUserId, organizationId: orgId, status: 'active' },
    ])
  }

  console.log('✅ Seed completed successfully!')
  console.log('--------------------------------------------------')
  console.log('📌 TEACHER LOGIN:  teacher@smartattend.edu.vn / 12345678')
  console.log('📌 ADMIN LOGIN:    admin@smartattend.edu.vn   / 12345678')
  console.log('📌 STUDENT LOGIN:  20260001 (hoặc 20260001@student.utc.edu.vn) / student123')
  console.log('--------------------------------------------------')
}

seed()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })

