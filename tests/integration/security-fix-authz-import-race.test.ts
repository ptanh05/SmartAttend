/**
 * Regression suite for docs/SECURITY_FIX_REPORT.md (2026-11).
 *
 * Requires a DISPOSABLE database in DATABASE_URL (never production): it creates
 * two throw-away organizations and removes them afterwards. Skipped when
 * DATABASE_URL is not set, like the rest of tests/integration.
 */
import { config } from 'dotenv'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { nanoid } from 'nanoid'
import { and, eq, inArray } from 'drizzle-orm'
import { db } from '@/lib/db'
import {
  attendanceChallenges,
  attendanceRecords,
  attendanceSessions,
  auditLogs,
  classEnrollments,
  courseSections,
  courses,
  notifications,
  organizationMemberships,
  organizations,
  users,
} from '@/lib/db/schema'
import {
  SectionAccessError,
  classSessionScopeFor,
  getLiveSessionDetails,
  getOrCreateLiveSession,
  listClassSessions,
  listSectionStudents,
  rotateChallengeForSession,
  searchAvailableStudentsForSection,
  transitionSessionState,
  verifyAttendance,
} from '@/lib/attendance/server'
import { challengePlaintextFor } from '@/lib/attendance/challenge'
import { attendanceVerifications, devices, leaveRequests } from '@/lib/db/schema'
import { getLeaveRequests } from '@/lib/attendance/leave'
import { importStudents } from '@/lib/auth/users'
import type { AuthContext } from '@/lib/auth/session'

config({ path: '.env' })
const hasDb = Boolean(process.env.DATABASE_URL)

const run = nanoid(6).toLowerCase()
const orgA = `org_sfa_${run}`
const orgB = `org_sfb_${run}`
const teacherA = `tch_sfa_${run}`
const teacherB = `tch_sfb_${run}`
const adminA = `adm_sfa_${run}`
const adminB = `adm_sfb_${run}`
const studentA = `stu_sfa_${run}`
const sharedCode = `SF${run.toUpperCase()}01`
const userIds = [teacherA, teacherB, adminA, adminB, studentA]
const createdByImport: string[] = []

function ctx(userId: string, organizationId: string, role: AuthContext['role']): AuthContext {
  return {
    userId,
    membershipId: `m_${userId}`,
    organizationId,
    role,
    email: `${userId}@example.test`,
    name: userId,
    initials: 'X',
    department: null,
    studentCode: null,
    mustChangePassword: false,
    organizationName: organizationId,
    organizationPlan: 'Campus Plus',
  }
}

const authTeacherA = ctx(teacherA, orgA, 'teacher')
const authTeacherB = ctx(teacherB, orgA, 'teacher')
const authAdminA = ctx(adminA, orgA, 'admin')
const authAdminB = ctx(adminB, orgB, 'admin')

let sectionA = ''
let sectionB = ''
let courseB = ''

async function cleanup() {
  const orgs = [orgA, orgB]
  try {
    const sessions = await db().select({ id: attendanceSessions.id }).from(attendanceSessions).where(inArray(attendanceSessions.organizationId, orgs))
    const sessionIds = sessions.map((s) => s.id)
    if (sessionIds.length) {
      await db().delete(attendanceVerifications).where(inArray(attendanceVerifications.organizationId, orgs))
      await db().delete(attendanceRecords).where(inArray(attendanceRecords.sessionId, sessionIds))
      await db().delete(attendanceChallenges).where(inArray(attendanceChallenges.sessionId, sessionIds))
    }
    await db().delete(attendanceSessions).where(inArray(attendanceSessions.organizationId, orgs))
    await db().delete(notifications).where(inArray(notifications.organizationId, orgs))
    await db().delete(devices).where(inArray(devices.organizationId, orgs))
    await db().delete(leaveRequests).where(inArray(leaveRequests.organizationId, orgs))
    await db().delete(auditLogs).where(inArray(auditLogs.organizationId, orgs))
    await db().delete(classEnrollments).where(inArray(classEnrollments.organizationId, orgs))
    await db().delete(courseSections).where(inArray(courseSections.organizationId, orgs))
    await db().delete(courses).where(inArray(courses.organizationId, orgs))
    await db().delete(organizationMemberships).where(inArray(organizationMemberships.organizationId, orgs))
    for (const id of [...userIds, ...createdByImport]) await db().delete(users).where(eq(users.id, id))
    await db().delete(organizations).where(inArray(organizations.id, orgs))
  } catch {
    /* best effort */
  }
}

describe.skipIf(!hasDb)('Security fixes: authorization, tenant-safe import, race-safe sessions', () => {
  beforeAll(async () => {
    await db().insert(organizations).values([{ id: orgA, name: 'SF Org A' }, { id: orgB, name: 'SF Org B' }])
    await db().insert(users).values(
      userIds.map((id) => ({ id, email: `${id}@example.test`, passwordHash: 'x', name: id, initials: 'X' })),
    )
    await db().insert(organizationMemberships).values([
      { id: nanoid(), organizationId: orgA, userId: teacherA, role: 'teacher' },
      { id: nanoid(), organizationId: orgA, userId: teacherB, role: 'teacher' },
      { id: nanoid(), organizationId: orgA, userId: adminA, role: 'admin' },
      { id: nanoid(), organizationId: orgB, userId: adminB, role: 'admin' },
      // Student of org A holding a student code that org B will try to import.
      { id: nanoid(), organizationId: orgA, userId: studentA, role: 'student', studentCode: sharedCode },
    ])
    const courseA = `crs_sfa_${run}`
    courseB = `crs_sfb_${run}`
    await db().insert(courses).values([
      { id: courseA, organizationId: orgA, code: `SFA${run}`, name: 'A', department: 'D', teacherId: teacherA },
      { id: `crs_sfx_${run}`, organizationId: orgA, code: `SFX${run}`, name: 'B', department: 'D', teacherId: teacherB },
      { id: courseB, organizationId: orgB, code: `SFB${run}`, name: 'Org B', department: 'D', teacherId: adminB },
    ])
    sectionA = `sec_sfa_${run}`
    sectionB = `sec_sfb_${run}`
    await db().insert(courseSections).values([
      { id: sectionA, organizationId: orgA, courseId: courseA, room: 'R1', startsAt: '00:00', endsAt: '00:01', autoStart: false, dayOfWeek: 1 },
      { id: sectionB, organizationId: orgA, courseId: `crs_sfx_${run}`, room: 'R2', startsAt: '00:00', endsAt: '00:01', autoStart: false, dayOfWeek: 1 },
      { id: `sec_sfob_${run}`, organizationId: orgB, courseId: courseB, room: 'R3', startsAt: '00:00', endsAt: '00:01', autoStart: false, dayOfWeek: 1 },
    ])
    await db().insert(classEnrollments).values({ sectionId: sectionA, studentId: studentA, organizationId: orgA })
  })

  afterAll(cleanup)

  describe('Group A: teacher isolation (IDOR)', () => {
    let sessionB = ''

    beforeAll(async () => {
      sessionB = (await getOrCreateLiveSession(authTeacherB, sectionB))!
      const started = await transitionSessionState(authTeacherB, sessionB, 'live')
      expect(started.ok).toBe(true)
    })

    it("Teacher A's session listing contains neither Teacher B's section nor its OTP", async () => {
      const list = await listClassSessions(...classSessionScopeFor(authTeacherA))
      expect(list.some((s) => s.sectionId === sectionB)).toBe(false)
      expect(list.every((s) => s.challenge === '------' || s.sectionId === sectionA)).toBe(true)
    })

    it("Teacher A cannot read Teacher B's live session details (OTP/QR) by id", async () => {
      expect(await getLiveSessionDetails(authTeacherA, sessionB)).toBeNull()
    })

    it("Teacher A cannot rotate (obtain a fresh OTP for) Teacher B's session", async () => {
      const res = await rotateChallengeForSession(authTeacherA, sessionB)
      expect(res.ok).toBe(false)
    })

    it("Teacher A cannot pause or close Teacher B's session", async () => {
      expect((await transitionSessionState(authTeacherA, sessionB, 'paused')).ok).toBe(false)
      expect((await transitionSessionState(authTeacherA, sessionB, 'closed')).ok).toBe(false)
      const [row] = await db().select().from(attendanceSessions).where(eq(attendanceSessions.id, sessionB))
      expect(row.status).toBe('active')
    })

    it("Teacher A cannot read Teacher B's roster or search for its section", async () => {
      await expect(listSectionStudents(authTeacherA, sectionB)).rejects.toBeInstanceOf(SectionAccessError)
      await expect(searchAvailableStudentsForSection(authTeacherA, sectionB, 'a')).rejects.toBeInstanceOf(SectionAccessError)
    })

    it('Teacher B still manages their own session and sees its OTP', async () => {
      const list = await listClassSessions(...classSessionScopeFor(authTeacherB))
      const own = list.find((s) => s.sectionId === sectionB)
      expect(own?.status).toBe('live')
      expect(own?.challenge).toMatch(/^[A-Z2-9]{6}$/)
      expect((await transitionSessionState(authTeacherB, sessionB, 'paused')).ok).toBe(true)
      expect((await transitionSessionState(authTeacherB, sessionB, 'live')).ok).toBe(true)
    })

    it('Admin of org A can access every section of org A, admin of org B cannot', async () => {
      const list = await listClassSessions(...classSessionScopeFor(authAdminA))
      expect(list.some((s) => s.sectionId === sectionB)).toBe(true)
      await expect(listSectionStudents(authAdminA, sectionA)).resolves.toBeInstanceOf(Array)
      await expect(listSectionStudents(authAdminB, sectionA)).rejects.toBeInstanceOf(SectionAccessError)
      expect(await getLiveSessionDetails(authAdminB, sessionB)).toBeNull()
    })

    it("Teacher A cannot read a student's leave requests for Teacher B's course via ?studentId=", async () => {
      const leaveId = `lr_sf_${run}`
      await db().insert(leaveRequests).values({
        id: leaveId,
        organizationId: orgA,
        studentId: studentA,
        courseId: `crs_sfx_${run}`, // taught by Teacher B
        date: '2026-11-14',
        reason: 'Medical',
        attachmentUrl: 'data:image/png;base64,AAAA',
      })
      const seenByA = await getLeaveRequests(authTeacherA, studentA)
      expect(seenByA.some((l) => l.id === leaveId)).toBe(false)
      const seenByB = await getLeaveRequests(authTeacherB, studentA)
      expect(seenByB.some((l) => l.id === leaveId)).toBe(true)
    })

    it('stored challenges never contain plaintext', async () => {
      const rows = await db().select().from(attendanceChallenges).where(eq(attendanceChallenges.sessionId, sessionB))
      expect(rows.length).toBeGreaterThan(0)
      expect(rows.every((r) => r.code === null)).toBe(true)
    })
  })

  describe('Group C: tenant-safe student import', () => {
    it('does not link or enroll a student of another organization that shares the student code', async () => {
      const res = await importStudents(authAdminB, [{ studentCode: sharedCode, name: 'Clash' }], { courseId: courseB })
      expect(res.created).toHaveLength(0)
      expect(res.skipped[0].reason).toMatch(/tổ chức khác/)
      const leaked = await db().select().from(classEnrollments).where(and(eq(classEnrollments.organizationId, orgB), eq(classEnrollments.studentId, studentA)))
      expect(leaked).toHaveLength(0)
    })

    it('never overwrites the password of an existing account with the same email', async () => {
      // Pre-create the identity the importer would generate for this row.
      const code = `SF${run.toUpperCase()}02`
      const victimId = `usr_victim_${run}`
      createdByImport.push(victimId)
      const { studentEmailFromName } = await import('@/lib/auth/users')
      await db().insert(users).values({ id: victimId, email: studentEmailFromName('Victim Person', code), passwordHash: 'ORIGINAL', name: 'Victim', initials: 'V' })

      const res = await importStudents(authAdminB, [{ studentCode: code, name: 'Victim Person' }])
      expect(res.created).toHaveLength(0)
      expect(res.skipped[0].reason).toMatch(/Email/)
      const [victim] = await db().select().from(users).where(eq(users.id, victimId))
      expect(victim.passwordHash).toBe('ORIGINAL')
      expect(victim.mustChangePassword).toBe(false)
    })

    it('skips an existing member of the same org without changing it, and reports duplicates / invalid rows per line', async () => {
      const res = await importStudents(authAdminA, [
        { studentCode: sharedCode, name: 'Same Org' },
        { studentCode: '', name: 'No code' },
        { studentCode: `SF${run.toUpperCase()}03`, name: 'New One' },
        { studentCode: `SF${run.toUpperCase()}03`, name: 'Dup In File' },
      ], { autoEnrollSections: false })
      for (const c of res.created) {
        const [m] = await db().select({ userId: organizationMemberships.userId }).from(organizationMemberships).where(eq(organizationMemberships.studentCode, c.studentCode))
        if (m) createdByImport.push(m.userId)
      }
      expect(res.created.map((c) => c.studentCode)).toEqual([`SF${run.toUpperCase()}03`])
      expect(res.skipped).toHaveLength(3)
    })

    it('rejects an import target course that belongs to another organization', async () => {
      await expect(importStudents(authAdminA, [{ studentCode: 'X1', name: 'X' }], { courseId: courseB })).rejects.toThrow(/không thuộc tổ chức/)
    })
  })

  describe('Group E: concurrent attendance verification', () => {
    it('20 concurrent verifications by the same student produce exactly one record and one verification row', async () => {
      const sessionId = (await getOrCreateLiveSession(authTeacherA, sectionA))!
      const started = await transitionSessionState(authTeacherA, sessionId, 'live')
      expect(started.ok).toBe(true)
      const [challenge] = await db()
        .select()
        .from(attendanceChallenges)
        .where(and(eq(attendanceChallenges.sessionId, sessionId), eq(attendanceChallenges.status, 'active')))
      const code = challengePlaintextFor(challenge)!
      const studentAuth = ctx(studentA, orgA, 'student')

      const results = await Promise.all(
        Array.from({ length: 20 }, () => verifyAttendance(studentAuth, code, 'Concurrency Device', { sessionId })),
      )
      expect(results.every((r) => r.ok)).toBe(true)

      const records = await db().select().from(attendanceRecords).where(and(eq(attendanceRecords.sessionId, sessionId), eq(attendanceRecords.studentId, studentA)))
      expect(records).toHaveLength(1)
      const verifications = await db().select().from(attendanceVerifications).where(eq(attendanceVerifications.attendanceRecordId, records[0].id))
      expect(verifications).toHaveLength(1)

      await transitionSessionState(authTeacherA, sessionId, 'closed')
    })
  })

  describe('Group E: concurrent session creation', () => {
    it('20 concurrent "open session" requests produce exactly one open session (requires migration 0005)', async () => {
      const ids = await Promise.all(Array.from({ length: 20 }, () => getOrCreateLiveSession(authTeacherA, sectionA)))
      const open = await db()
        .select({ id: attendanceSessions.id })
        .from(attendanceSessions)
        .where(and(eq(attendanceSessions.sectionId, sectionA), inArray(attendanceSessions.status, ['draft', 'active', 'paused'])))
      expect(open).toHaveLength(1)
      expect(new Set(ids)).toEqual(new Set([open[0].id]))
    })
  })
})
