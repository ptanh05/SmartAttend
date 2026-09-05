import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core'

export const organizations = pgTable('organizations', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  plan: text('plan').notNull().default('Campus Plus'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const users = pgTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  initials: text('initials').notNull(),
  mustChangePassword: boolean('must_change_password').notNull().default(false),
  disabledAt: timestamp('disabled_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const organizationMemberships = pgTable(
  'organization_memberships',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    role: text('role').notNull(),
    department: text('department'),
    studentCode: text('student_code'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('membership_org_user_idx').on(table.organizationId, table.userId),
    uniqueIndex('membership_org_student_code_idx').on(table.organizationId, table.studentCode),
    index('membership_org_role_idx').on(table.organizationId, table.role),
  ],
)

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    membershipId: text('membership_id')
      .notNull()
      .references(() => organizationMemberships.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('auth_sessions_user_idx').on(table.userId)],
)

export const departments = pgTable(
  'departments',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    name: text('name').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('departments_org_name_idx').on(table.organizationId, table.name)],
)

export const courses = pgTable(
  'courses',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    code: text('code').notNull(),
    name: text('name').notNull(),
    department: text('department').notNull(),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => users.id),
    enrolled: integer('enrolled').notNull().default(0),
    color: text('color').notNull().default('indigo'),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [uniqueIndex('courses_org_code_idx').on(table.organizationId, table.code)],
)

export const courseSections = pgTable(
  'course_sections',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    room: text('room').notNull(),
    startsAt: text('starts_at').notNull(),
    endsAt: text('ends_at').notNull(),
    dayOfWeek: integer('day_of_week').notNull().default(1),
    autoStart: boolean('auto_start').notNull().default(true),
    status: text('status').notNull().default('scheduled'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('sections_org_course_idx').on(table.organizationId, table.courseId),
    index('sections_org_day_idx').on(table.organizationId, table.dayOfWeek),
  ],
)

export const classEnrollments = pgTable(
  'class_enrollments',
  {
    sectionId: text('section_id')
      .notNull()
      .references(() => courseSections.id),
    studentId: text('student_id')
      .notNull()
      .references(() => users.id),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    status: text('status').notNull().default('active'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('enrollment_section_student_idx').on(table.sectionId, table.studentId),
    index('enrollment_org_student_idx').on(table.organizationId, table.studentId),
  ],
)

export const attendanceSessions = pgTable(
  'attendance_sessions',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    sectionId: text('section_id')
      .notNull()
      .references(() => courseSections.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    teacherId: text('teacher_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull().default('draft'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    closedAt: timestamp('closed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('attendance_sessions_org_status_idx').on(table.organizationId, table.status),
    index('attendance_sessions_section_idx').on(table.sectionId),
  ],
)

export const attendanceChallenges = pgTable(
  'attendance_challenges',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => attendanceSessions.id),
    sequence: integer('sequence').notNull(),
    valueHash: text('value_hash').notNull(),
    status: text('status').notNull().default('active'),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('challenges_session_sequence_idx').on(table.sessionId, table.sequence),
    index('challenges_session_status_idx').on(table.sessionId, table.status),
  ],
)

export const attendanceRecords = pgTable(
  'attendance_records',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    sessionId: text('session_id')
      .notNull()
      .references(() => attendanceSessions.id),
    studentId: text('student_id')
      .notNull()
      .references(() => users.id),
    status: text('status').notNull(),
    verificationScore: integer('verification_score').notNull().default(0),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    device: text('device'),
    flaggedReason: text('flagged_reason'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    uniqueIndex('records_session_student_idx').on(table.sessionId, table.studentId),
    index('records_org_student_idx').on(table.organizationId, table.studentId),
  ],
)

export const attendanceVerifications = pgTable('attendance_verifications', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),
  attendanceRecordId: text('attendance_record_id')
    .notNull()
    .references(() => attendanceRecords.id),
  challengeId: text('challenge_id').references(() => attendanceChallenges.id),
  method: text('method').notNull(),
  result: text('result').notNull(),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const devices = pgTable(
  'devices',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    studentId: text('student_id')
      .notNull()
      .references(() => users.id),
    label: text('label').notNull(),
    trusted: boolean('trusted').notNull().default(true),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('devices_org_student_idx').on(table.organizationId, table.studentId)],
)

export const suspiciousAttempts = pgTable('suspicious_attempts', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .references(() => organizations.id),
  attendanceRecordId: text('attendance_record_id').references(() => attendanceRecords.id),
  reason: text('reason').notNull(),
  status: text('status').notNull().default('open'),
  reviewedBy: text('reviewed_by').references(() => users.id),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
})

export const notifications = pgTable(
  'notifications',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    title: text('title').notNull(),
    body: text('body').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('notifications_user_idx').on(table.organizationId, table.userId)],
)

export const attendancePolicies = pgTable('attendance_policies', {
  id: text('id').primaryKey(),
  organizationId: text('organization_id')
    .notNull()
    .unique()
    .references(() => organizations.id),
  lateAfterMinutes: integer('late_after_minutes').notNull().default(10),
  challengeTtlSeconds: integer('challenge_ttl_seconds').notNull().default(30),
  requireTrustedDevice: boolean('require_trusted_device').notNull().default(false),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
})

export const auditLogs = pgTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    actorId: text('actor_id').references(() => users.id),
    actorName: text('actor_name').notNull(),
    action: text('action').notNull(),
    target: text('target').notNull(),
    severity: text('severity').notNull().default('info'),
    metadata: jsonb('metadata').notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('audit_logs_org_created_idx').on(table.organizationId, table.createdAt)],
)

export const leaveRequests = pgTable(
  'leave_requests',
  {
    id: text('id').primaryKey(),
    organizationId: text('organization_id')
      .notNull()
      .references(() => organizations.id),
    studentId: text('student_id')
      .notNull()
      .references(() => users.id),
    courseId: text('course_id')
      .notNull()
      .references(() => courses.id),
    sessionId: text('session_id').references(() => attendanceSessions.id),
    date: text('date').notNull(),
    reason: text('reason').notNull(),
    evidenceNote: text('evidence_note'),
    status: text('status').notNull().default('pending'),
    reviewedBy: text('reviewed_by').references(() => users.id),
    reviewedByName: text('reviewed_by_name'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [
    index('leave_requests_org_student_idx').on(table.organizationId, table.studentId),
    index('leave_requests_org_status_idx').on(table.organizationId, table.status),
  ],
)

export const userPasskeys = pgTable(
  'user_passkeys',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    credentialId: text('credential_id').notNull().unique(),
    publicKey: text('public_key').notNull(),
    counter: integer('counter').notNull().default(0),
    deviceLabel: text('device_label'),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (table) => [index('user_passkeys_user_idx').on(table.userId)],
)

