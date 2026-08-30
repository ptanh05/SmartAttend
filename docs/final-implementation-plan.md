# SmartAttend — Final Implementation & Production Hardening Plan

**Status:** Approved & Executing  
**Target:** Production-Grade, Multi-Tenant SaaS MVP  

---

## 1. Plan Overview & Execution Phases

### Phase 1: Critical Security Remediations
- [x] Remove hardcoded `DEFAULT_DATABASE_URL` in `lib/db/index.ts`. Throw a runtime configuration error when `process.env.DATABASE_URL` is missing.
- [x] Remove hardcoded `DEFAULT_TEACHER_KEY` in `lib/auth/registration-key.ts`. Enforce `process.env.TEACHER_REGISTRATION_API_KEY`.
- [x] Update `.env.example` with strict variable specifications (names and descriptions only, no secrets).

### Phase 2: Authentication & Session Security
- [x] Ensure cookie attributes (`HttpOnly`, `SameSite: Lax`, `Secure` in production) are strictly applied across all auth handlers.
- [x] Implement periodic garbage collection in `lib/rate-limit.ts` to prevent unbounded memory growth.
- [x] Ensure disabled account checks (`disabledAt`) and membership status (`active`) are verified on every request.

### Phase 3: Centralized Server-Side Authorization
- [x] Audit all 20 route handlers in `app/api/**`.
- [x] Enforce role-based access control (RBAC):
  - `/api/users`: Restrict full directory listing to `teacher` and `admin`.
  - `/api/analytics/overview`: Restrict institutional analytics to `teacher`, `staff`, and `admin`.
  - `/api/courses` & `/api/courses/sections`: Filter for student enrollments when accessed by students; return full catalog for teachers/admins.
  - `/api/attendance/sessions/[id]`: Ensure student is enrolled in the session's section before granting live details.

### Phase 4: Multi-Tenant Database Isolation
- [x] Fix `markNotificationsRead` in `lib/attendance/server.ts` to enforce `eq(notifications.organizationId, auth.organizationId)` when `ids` array is provided.
- [x] Verify all data mutation and query methods use compound keys `(id, organization_id)`.

### Phase 5 & 10: PostgreSQL Schema & Database-Backed Leave Requests
- [x] Add `leave_requests` table to `lib/db/schema.ts` with columns: `id`, `organization_id`, `student_id`, `course_id`, `session_id`, `date`, `reason`, `evidence_note`, `status`, `reviewed_by`, `reviewed_at`, `created_at`.
- [x] Migrate `lib/attendance/leave.ts` from in-memory arrays to Drizzle ORM PostgreSQL queries with tenant and student ownership scoping.
- [x] Update leave request API handler (`app/api/attendance/leave/route.ts`).

### Phase 6, 7, 8 & 9: Attendance Engine & Late Attendance Timing
- [x] Implement Late Attendance detection in `lib/attendance/server.ts:verifyAttendance`:
  - Fetch `attendanceSessions.startedAt` and `attendancePolicies.lateAfterMinutes`.
  - Calculate `isLate = verifiedAt.getTime() > startedAt.getTime() + lateAfterMinutes * 60 * 1000`.
  - Set status to `'late'` if threshold exceeded, otherwise `'present'`.
- [x] Ensure `finalizeAbsentRecords` accurately marks unverified enrolled students as `'absent'` upon session close.

### Phase 11 & 12: Anti-Cheating & Device Trust
- [x] Maintain lightweight, privacy-preserving device scoring (0–100) and suspicious attempt logging without external intrusive dependencies.

### Phase 13, 14 & 15: Notifications, Reports & Analytics
- [x] Ensure notifications, RFC 4180 CSV exports, and analytics metrics are 100% database-backed and tenant-isolated.

### Phase 16, 17 & 18: Real-Time Polling & API Quality
- [x] Consolidate polling routines and ensure consistent JSON response schemas (`{ ok: boolean, message?: string, ... }`) and HTTP status codes (401, 403, 400, 404, 500).

### Phase 19 & 20: Frontend Architecture & Component Decomposition
- [x] Decompose `components/smart-attend.tsx` (2250 lines) into modular subcomponents:
  - `components/auth/login-screen.tsx`
  - `components/auth/register-screen.tsx`
  - `components/auth/change-password-form.tsx`
  - `components/portals/student-portal.tsx`
  - `components/portals/teacher-portal.tsx`
  - `components/portals/admin-portal.tsx`
  - `components/landing/utc-landing.tsx`
- [x] Preserve bilingual support (EN/VI), dark mode, responsive layout, and full hydration safety.

### Phase 21 & 22: Comprehensive Test Suites & Security Regressions
- [x] Unit test suites for late calculation, leave request workflows, rate limiter cleanup.
- [x] Integration & Security Regression tests for cross-tenant isolation and role privilege escalation rejection.

### Phase 23–30: Validation, Documentation & Final Report
- [x] Run `pnpm lint`, `pnpm build`, and complete test suite.
- [x] Update `README.md`, `docs/architecture.md`, and generate `docs/final-project-status.md`.
