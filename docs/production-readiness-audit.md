# SmartAttend — PRODUCTION READINESS AUDIT

**Date:** 2026-08-30  
**Scope:** Comprehensive code and configuration audit of the entire SmartAttend codebase.  
**Methodology:** Direct inspection of database connection logic, schema, Drizzle ORM queries, authentication context, cookie handling, session management, rate limiters, attendance lifecycle state machine, challenge crypto, device policies, all 20 API route handlers, UI monolithic architecture, test suites, and documentation.

---

## 1. Executive Summary

A previous project milestone labeled SmartAttend as "demo-only" (as documented in `docs/stability-audit.md`). However, an audit of the current codebase reveals that **SmartAttend has transitioned significantly into a real, database-backed application**. 

A complete audit of every source file reveals:
1. **Neon PostgreSQL & Drizzle ORM are integrated and operational.** Schema defines 15 relational tables with composite indexes, foreign keys, and organization scoping. CRUD operations across courses, sections, sessions, attendance records, audit logs, and devices are fully wired to PostgreSQL.
2. **Authentication is real and cryptographically grounded.** Passwords are encrypted using `bcryptjs` (cost factor 10), session tokens are 32-byte cryptographically random hex strings stored as SHA-256 hashes, and authentication state is maintained via `httpOnly`, `SameSite: Lax` cookies.
3. **The Core Attendance Engine is fully implemented on the server.** State machine transitions (`draft` → `active` → `paused` → `closed`), dynamic 6-character rotating challenges (safe alphabet, SHA-256 hashed, sequence tracked, TTL expired), class enrollment checks, and attendance verification are strictly enforced on the server.
4. **Anti-Cheating heuristics are active, but incomplete.** Device policies score devices (0–100) and flag untrusted hardware into `suspicious_attempts`. However, **late attendance detection is completely non-functional** (the policy field exists in DB, but the server verification logic hardcodes status to `'present'`).
5. **Significant Security & Authorization Gaps Exist:**
   - **Critical Hardcoded Credentials (P0):** `lib/db/index.ts` contains a hardcoded fallback database connection string with plaintext credentials (`neondb_owner`). `lib/auth/registration-key.ts` contains a hardcoded fallback API key.
   - **Authorization Gaps (P1):** Multiple GET endpoints (`/api/courses`, `/api/courses/sections`, `/api/users`, `/api/analytics/overview`) authenticate the caller via cookies but **do not check user roles**, allowing students to view system-wide user rosters and analytical metrics.
   - **Mock Subsystem (P1):** The Leave Request system (`lib/attendance/leave.ts`) is **100% in-memory mock data** and does not persist to PostgreSQL.
   - **Tenant Scoping Gap (P1):** `markNotificationsRead` fails to filter by `organizationId` when an array of IDs is supplied.
   - **Rate Limiting is Single-Instance (P2):** Sliding-window rate limiting is stored in an in-memory JavaScript `Map` that resets on cold restart and is not shared across serverless instances.

**Honest Overall Readiness Assessment:** **~55% Production-Ready MVP**. The core attendance lifecycle and data models are solid, but critical security vulnerabilities (hardcoded secrets, missing role guards) must be resolved prior to any production deployment.

---

## 2. Actual Architecture

The application is structured as a full-stack Next.js application leveraging Server Route Handlers and client-rendered views:

```
┌─────────────────────────────────────────────────────────────────────────┐
│                      Client Layer (Browser)                             │
│  - Monolithic UI Container: components/smart-attend.tsx (2250 lines)   │
│  - API Client: lib/api/client.ts (Fetch with credentials: 'include')    │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ HTTP Cookie Auth
┌────────────────────────────────────▼────────────────────────────────────┐
│                  Next.js App Router (app/api/**)                        │
│  - 20 Route Handlers across 9 functional groups                         │
│  - Auth Guard: lib/auth/context.ts (requireAuth / getCurrentAuth)       │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Context Resolution
┌────────────────────────────────────▼────────────────────────────────────┐
│                    Business & Domain Logic Layer                        │
│  - lib/auth/session.ts (Token hashing, session validation)              │
│  - lib/attendance/server.ts (Session lifecycle, challenges, verify)    │
│  - lib/attendance/session-state.ts (Transition rules)                  │
│  - lib/attendance/device-policy.ts (Trust scoring 0-100)               │
│  - lib/rate-limit.ts (In-memory sliding window limiter)                 │
│  - lib/reports/csv.ts (RFC 4180 streaming formatting)                   │
└────────────────────────────────────┬────────────────────────────────────┘
                                     │ Drizzle ORM Queries
┌────────────────────────────────────▼────────────────────────────────────┐
│                      Data Persistence Layer                             │
│  - Driver: @neondatabase/serverless (HTTP connection pooler)            │
│  - Schema: lib/db/schema.ts (15 tables, tenant-scoped)                  │
│  - Database: Neon Serverless PostgreSQL (AWS ap-southeast-1)            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Database Verification

### Connection & Driver
- **Integrated:** `@neondatabase/serverless` connected via `drizzle-orm/neon-http`.
- **Location:** `lib/db/index.ts`.
- **Pattern:** Lazy singleton instantiation (`cachedDb`).
- 🔴 **Vulnerability:** `lib/db/index.ts` lines 6–9 define `DEFAULT_DATABASE_URL` with active connection credentials. If `process.env.DATABASE_URL` is omitted, it falls back to this hardcoded string instead of throwing an explicit error.

### Schema & Tables (15 Tables Verified)
`lib/db/schema.ts` defines 15 distinct relational tables:
1. `organizations`: Tenant root entity (`id`, `name`, `plan`, `created_at`).
2. `attendance_policies`: Tenant policy settings (`challenge_ttl_seconds`, `late_after_minutes`, `require_trusted_device`).
3. `departments`: Academic units within an organization.
4. `users`: User identity (`email`, `password_hash`, `name`, `initials`, `must_change_password`, `disabled_at`).
5. `organization_memberships`: Role mappings (`role`: `student` | `teacher` | `admin` | `staff`, `student_code`, `department`, `status`).
6. `auth_sessions`: Active login sessions (`token_hash`, `user_id`, `membership_id`, `expires_at`).
7. `courses`: Academic courses (`code`, `name`, `department`, `teacher_id`, `color`).
8. `course_sections`: Class schedules (`room`, `starts_at`, `ends_at`, `day_of_week`, `auto_start`).
9. `class_enrollments`: Student registrations per section (`section_id`, `student_id`, `status`).
10. `attendance_sessions`: Live attendance occurrences (`section_id`, `course_id`, `teacher_id`, `status`, `started_at`, `closed_at`).
11. `attendance_challenges`: Dynamic OTP challenge codes (`session_id`, `sequence`, `value_hash`, `expires_at`, `consumed_at`).
12. `attendance_records`: Individual student attendance records (`session_id`, `student_id`, `status`, `verification_score`, `verified_at`, `device`).
13. `attendance_verifications`: Audit log of verification attempts (`attendance_record_id`, `challenge_id`, `method`, `result`, `metadata`).
14. `devices`: Student hardware registry (`student_id`, `label`, `trusted`, `last_seen_at`).
15. `suspicious_attempts`: Flagged security anomalies (`attendance_record_id`, `reason`, `status`).
*Additional utility tables: `audit_logs`, `notifications`.*

### Indexes & Integrity
- Composite Unique Indexes: `(session_id, student_id)` on `attendance_records`, `(section_id, student_id)` on `class_enrollments`, `(session_id, sequence)` on `attendance_challenges`, `(organization_id, user_id)` on `organization_memberships`.
- 12 composite performance indexes on `(organization_id, ...)` foreign key relationships.

### Verification of Real CRUD
- **CREATE:** Insert session, challenge, record, device in `lib/attendance/server.ts:362`.
- **READ:** Select queries joined across 4 tables in `lib/attendance/server.ts:484-498`.
- **UPDATE:** Update session status and record status in `lib/attendance/server.ts:232, 855`.
- **DELETE:** Cascade delete sections and enrollments in `lib/attendance/server.ts:866-867`.
- **Seed Script:** `scripts/seed.ts` truncates all 15 tables and seeds 20 students, 3 courses, 3 sections, teacher, admin, and enrollments using bcrypt hashing.

---

## 4. Authentication Verification

### End-to-End Authentication Flow
```
Browser Login Form
   │ POST /api/auth/login { identifier, password, portal }
   ▼
app/api/auth/login/route.ts
   ├── 1. Rate limiter check (10 attempts / 15m per IP:identifier)
   ├── 2. Resolve user by Email or Student Code (org-scoped)
   ├── 3. Validate user status (disabled_at is null, membership active)
   ├── 4. bcrypt.compare(password, passwordHash)
   ├── 5. Portal role boundary check (e.g., student cannot login to staff portal)
   ├── 6. crypto.randomBytes(32).toString('hex') -> generate rawToken
   ├── 7. Insert into auth_sessions (tokenHash = sha256(rawToken), expiresAt = now + 7d)
   └── 8. Set HTTP Cookie: `smartattend_session=rawToken; HttpOnly; SameSite=Lax; Path=/`
```

### Context Resolution (`getCurrentAuth` / `requireAuth`)
On every incoming API request:
1. `lib/auth/cookies.ts` reads `smartattend_session` cookie.
2. `lib/auth/session.ts:getAuthContext` computes SHA-256 hash of token.
3. Performs inner join: `auth_sessions` ↔ `users` ↔ `organization_memberships` ↔ `organizations`.
4. Enforces: `expires_at > now()`, `users.disabled_at IS NULL`, `organization_memberships.status == 'active'`.
5. Returns typed `AuthContext` containing `userId`, `organizationId`, `role`, `studentCode`, and permissions.

### Authentication Features Status
- **Student Login (Code & Email):** ✅ VERIFIED
- **Teacher Login:** ✅ VERIFIED
- **Admin Login:** ✅ VERIFIED
- **Session Persistence (7 days):** ✅ VERIFIED
- **Logout (DB row deleted & cookie cleared):** ✅ VERIFIED
- **Account Disablement Check:** ✅ VERIFIED
- **Password Change (`/api/auth/change-password`):** ✅ VERIFIED
- **Teacher Registration with Secret Key (`/api/auth/register`):** ✅ VERIFIED (uses `timingSafeEqual`)

---

## 5. Attendance State Machine

### Allowed Transitions
The session state machine is defined in `lib/attendance/session-state.ts` and strictly enforced server-side in `lib/attendance/server.ts:transitionSessionState`:

| From State | Allowed Target States | Disallowed Target States |
|------------|-----------------------|--------------------------|
| `draft`    | `active`              | `paused`, `closed`, `expired` |
| `scheduled`| `active`              | `paused`, `closed`, `expired` |
| `active`   | `paused`, `closed`, `expired` | `draft`, `scheduled` |
| `paused`   | `active`, `closed`, `expired` | `draft`, `scheduled` |
| `closed`   | *(None - Terminal)*   | `active`, `paused`, `draft`, `expired` |
| `expired`  | *(None - Terminal)*   | `active`, `paused`, `draft`, `closed` |

### Server-side Enforcement
- Any attempt to call `transitionSessionState` with `CLOSED → ACTIVE` or `EXPIRED → ACTIVE` throws an explicit validation error: `Cannot move a closed session to active.`
- Automatic side effects on state change:
  - Transition to `active`: automatically rotates and issues an active challenge OTP.
  - Transition to `closed`: executes `finalizeAbsentRecords()`, identifying all enrolled students who failed to check in and persisting status `'absent'`.

---

## 6. Anti-Cheating Verification

| Anti-Cheating Mechanism | Status | Detailed Finding |
|-------------------------|--------|------------------|
| **Rotating Challenge**  | 🟢 IMPLEMENTED | Generated via safe alphabet (no look-alike characters like 0/O/1/I). Stored exclusively as SHA-256 hash in DB. Sequence tracked to prevent collisions. |
| **Challenge Expiration** | 🟢 IMPLEMENTED | Verified against `attendanceChallenges.expiresAt < new Date()`. Previous challenge marked `'invalidated'` upon rotation. |
| **Replay Protection**   | 🟢 IMPLEMENTED | DB unique constraint on `(sessionId, studentId)` prevents multiple attendance records for the same session. Upsert updates timestamp if already present. |
| **Enrollment Check**    | 🟢 IMPLEMENTED | `classEnrollments` table queried; non-enrolled students are rejected with `"You are not enrolled in this class session"`. |
| **Device Trust Scoring**| 🟢 IMPLEMENTED | `evaluateDevicePolicy()` scores check-in from 0 to 100 based on hardware fingerprint match and organizational policy. |
| **Suspicious Tracking** | 🟢 IMPLEMENTED | If policy requires trusted device and student uses untrusted/unseen device, score drops to 55–60 and an entry is created in `suspicious_attempts`. |
| **QR Code Display**     | 🟡 PARTIAL     | `qrcode` dependency generates SVG client-side in UI from the live challenge string; no separate cryptographic QR token backend. |
| **Late Time Validation**| 🔴 NOT IMPLEMENTED | **Defect:** `attendancePolicies.lateAfterMinutes` exists, but `verifyAttendance` hardcodes `status = 'present'` without comparing against `session.startedAt`. |
| **IP / Geofencing**     | ⚪ NOT IMPLEMENTED | `clientIp` is extracted for rate limiting only, not compared against classroom geofence or campus subnet. |

---

## 7. API Audit

All 20 API endpoints audited for authentication, authorization, organization scoping, and database access:

| Endpoint | Method | Purpose | Auth | Role Enforcement | DB Backed | Input Validation | Audit Verdict |
|----------|--------|---------|------|------------------|-----------|------------------|---------------|
| `/api/auth/login` | POST | Authenticate user | Public | Checked via portal param | ✅ Neon DB | Type checks | 🟢 VERIFIED |
| `/api/auth/logout` | POST | Terminate session | Cookie | Any authenticated | ✅ Neon DB | None needed | 🟢 VERIFIED |
| `/api/auth/register` | POST | Register teacher | Secret Key | Admin API Key verified | ✅ Neon DB | Full schema | 🟢 VERIFIED |
| `/api/auth/change-password` | POST | Change password | Cookie | Any authenticated | ✅ Neon DB | Min length (8) | 🟢 VERIFIED |
| `/api/me` | GET | Current session profile | Cookie | Any authenticated | ✅ Neon DB | None needed | 🟢 VERIFIED |
| `/api/courses` | GET | List courses | Cookie | ⚠️ **None** (Student can view all) | ✅ Org-scoped | None | 🟡 ROLE GAP |
| `/api/courses` | POST | Create course | Cookie | Checked in service (Teacher/Admin) | ✅ Org-scoped | Required fields | 🟢 VERIFIED |
| `/api/courses/sections` | GET | List class schedules | Cookie | ⚠️ **None** (Student can view all) | ✅ Org-scoped | None | 🟡 ROLE GAP |
| `/api/courses/sections` | POST | Create section schedule | Cookie | Checked in service (Teacher/Admin) | ✅ Org-scoped | Required fields | 🟢 VERIFIED |
| `/api/courses/sections/[id]` | PATCH | Edit section schedule | Cookie | Checked in service (Teacher/Admin) | ✅ Org-scoped | Partial fields | 🟢 VERIFIED |
| `/api/courses/sections/[id]` | DELETE | Delete section schedule | Cookie | Checked in service (Teacher/Admin) | ✅ Org-scoped | ID param | 🟢 VERIFIED |
| `/api/attendance/sessions` | GET | List session states | Cookie | ⚠️ **None** (Live info filtered in service) | ✅ Org-scoped | None | 🟡 ROLE GAP |
| `/api/attendance/sessions` | PUT | Create attendance session | Cookie | ✅ `teacher`, `admin` | ✅ Org-scoped | `sectionId` check | 🟢 VERIFIED |
| `/api/attendance/sessions/[id]` | POST | Session state transition | Cookie | ✅ `teacher`, `admin` | ✅ Org-scoped | Action enum check | 🟢 VERIFIED |
| `/api/attendance/sessions/[id]` | GET | Get live session details | Cookie | ⚠️ **None** | ✅ Org-scoped | ID param | 🟡 ROLE GAP |
| `/api/attendance/verify` | POST | Student submit challenge | Cookie | ✅ `student` only | ✅ Org-scoped | 6-char regex | 🟢 VERIFIED |
| `/api/attendance/records` | GET | Query attendance records | Cookie | ⚠️ Student scoped; teacher/admin all | ✅ Org-scoped | Query param | 🟢 VERIFIED |
| `/api/attendance/records` | PATCH | Manual attendance override | Cookie | ✅ `teacher`, `admin` | ✅ Org-scoped | Required fields | 🟢 VERIFIED |
| `/api/attendance/leave` | GET/POST/PATCH | Leave request workflows | Cookie | Partial role checks | 🔴 **MOCK** (In-memory array) | Field checks | 🟠 DEMO ONLY |
| `/api/users` | GET | Query users/devices/depts | Cookie | ⚠️ **None** for users; Admin for depts | ✅ Org-scoped | Query param | 🟡 ROLE GAP |
| `/api/users/import` | POST | Bulk student CSV import | Cookie | ✅ `teacher`, `admin` | ✅ Org-scoped | CSV parse check | 🟢 VERIFIED |
| `/api/analytics/overview` | GET | Organization metrics | Cookie | ⚠️ **None** (Student can view metrics) | ✅ Org-scoped | None | 🟡 ROLE GAP |
| `/api/notifications` | GET | List user notifications | Cookie | Scoped to `userId` | ✅ Org-scoped | None | 🟢 VERIFIED |
| `/api/notifications` | POST | Mark notifications read | Cookie | Scoped to `userId` | ⚠️ **Tenant bug** | ID array | 🟡 TENANT GAP |
| `/api/audit-logs` | GET | Security audit log | Cookie | ✅ `admin` only | ✅ Org-scoped | None | 🟢 VERIFIED |
| `/api/reports/attendance` | GET | Export attendance CSV | Cookie | ✅ `teacher`, `staff`, `admin` | ✅ Org-scoped | Query params | 🟢 VERIFIED |
| `/api/reports/audit` | GET | Export audit log CSV | Cookie | ✅ `staff`, `admin` | ✅ Org-scoped | None | 🟢 VERIFIED |

---

## 8. Multi-Tenant Security & Database Isolation

### Organization Scoping Architecture
All tenant-owned tables (`courses`, `course_sections`, `attendance_sessions`, `attendance_records`, `devices`, `audit_logs`) maintain an `organization_id` foreign key.
- **Tenant Context Guarantee:** The `organizationId` is **never taken from user request parameters or JSON bodies**. It is resolved exclusively from the server-validated session cookie (`auth.organizationId`).
- **Compound Scoping Pattern:** Queries addressing individual resources by ID enforce multi-tenancy using composite WHERE clauses:
  ```typescript
  where(and(eq(table.id, resourceId), eq(table.organizationId, auth.organizationId)))
  ```

### Identified Multi-Tenant Gaps
1. **`markNotificationsRead` Bug (`lib/attendance/server.ts:656`):**
   ```typescript
   export async function markNotificationsRead(auth: AuthContext, ids?: string[]) {
     const where = ids?.length
       ? and(eq(notifications.userId, auth.userId), inArray(notifications.id, ids))
       : eq(notifications.userId, auth.userId)
     await db().update(notifications).set({ readAt: new Date() }).where(where)
   }
   ```
   *Issue:* Omits `eq(notifications.organizationId, auth.organizationId)` when `ids` is provided. While `userId` protects cross-user updates, a multi-tenant user account could modify notifications across tenant boundaries.
2. **Leave Request Module:** `lib/attendance/leave.ts` uses an in-memory array with no organizational partition whatsoever.

---

## 9. Authorization & Access Control

### Role-Based Access Control (RBAC)
Role assignments (`student`, `teacher`, `admin`, `staff`) reside in `organization_memberships`.
- **Write Protections:** Write operations (`POST /api/attendance/sessions/[id]`, `POST /api/users/import`, `PATCH /api/attendance/records`) strictly verify `auth.role === 'teacher' || auth.role === 'admin'`.
- **Student Portal Protections:** `POST /api/attendance/verify` strictly enforces `auth.role === 'student'`.
- **Administrative Endpoints:** `GET /api/audit-logs` enforces `requireAuth('admin')`.

### Discovered Authorization Deficiencies
Several read endpoints lack role verification guards:
- `GET /api/users`: A logged-in student can request `/api/users` and retrieve the full name, email, and student codes of all students and teachers in the institution.
- `GET /api/analytics/overview`: A logged-in student can request `/api/analytics/overview` and view institutional attendance metrics, active session counts, and flagged attempt totals.

---

## 10. Rate Limiting

### Implementation Details (`lib/rate-limit.ts`)
- **Mechanism:** In-memory `SlidingWindowRateLimiter` storing timestamp arrays in a `Map<string, number[]>`.
- **Protected Endpoints:**
  - Login (`/api/auth/login`): 10 requests per 15 minutes per `IP:identifier`.
  - Verify (`/api/attendance/verify`): 5 requests per 1 minute per `IP:userId`.
- **IP Extraction:** Reads `x-forwarded-for` header, falling back to `x-real-ip`.

### Limitations & Production Safety
- ⚠️ **Process Local:** Stored in Node.js heap memory. If deployed to serverless environments (Vercel, AWS Lambda) or multi-pod Kubernetes clusters, rate limits are not shared across instances.
- ⚠️ **Memory Leak Potential:** `clearExpired()` method is implemented but never called by a background timer or cleanup routine.
- **Classification:** **MVP Only — Needs replacement with Redis / Upstash for multi-instance production.**

---

## 11. Session Security

| Session Attribute | Configured State | Security Assessment |
|-------------------|------------------|---------------------|
| Cookie Name | `smartattend_session` | Standard opaque identifier. |
| `HttpOnly` | `true` | ✅ Prevents JavaScript access (XSS mitigation). |
| `SameSite` | `Lax` | ✅ Protects against basic CSRF cross-site postback. |
| `Secure` | `process.env.NODE_ENV === 'production'` | ✅ Transmitted only over HTTPS in production. |
| Storage | SHA-256 hash in `auth_sessions` | ✅ Database leak does not expose raw session cookies. |
| Expiration | 7 days fixed | ✅ Stored in DB `expires_at` column. |
| Rotation on Login | ❌ Not Implemented | Existing sessions for the user are not invalidated upon re-login. |
| Explicit CSRF Token | ❌ Not Implemented | Relies entirely on `SameSite: Lax`. |

---

## 12. Reporting & Exports

- **Attendance CSV Export (`/api/reports/attendance`):**
  - Fully database-backed. Queries `attendance_records` joined with `users`, `courses`, and `course_sections`.
  - Supports `scope=summary` (student aggregated attendance rates) and `scope=detail` (raw record log).
  - Complies with RFC 4180 CSV escaping (handles quotes, commas, CRLF).
  - Restricted to `teacher`, `staff`, and `admin`.
- **Audit CSV Export (`/api/reports/audit`):**
  - Fully database-backed. Exports system-wide administrative audit trail.
  - Restricted to `staff` and `admin`.
- **Analytics Overview (`/api/analytics/overview`):**
  - Queries real aggregations (`COUNT` of students, teachers, active sessions, and percentage attendance rates).

---

## 13. Real-Time & Live Updates

- **Current Implementation:** HTTP Long-Polling inside `components/smart-attend.tsx` lines 2019–2030.
  - Interval: **3 seconds** when a live session is detected; **10 seconds** during idle dashboard views.
  - Polling Payload: Dispatches `loadDashboard()` which executes up to **10 parallel API requests** (`/api/courses`, `/api/sessions`, `/api/records`, `/api/notifications`, `/api/analytics/overview`, `/api/users`, etc.).
- **Scalability Assessment:** Sufficient for classroom demo (<50 students). For a university campus with 1,000 active students, 3-second polling of 10 endpoints will generate >3,000 requests/sec, necessitating Server-Sent Events (SSE) or WebSocket push architecture in future milestones.

---

## 14. Testing Suite Audit

### Unit Tests (9 test suites)
- `lib/attendance/session-state.test.ts` (18 state transition rules tested)
- `lib/attendance/challenge.test.ts` (alphabet safety, collision resistance, hashing)
- `lib/attendance/device-policy.test.ts` (6 scoring conditions and edge cases)
- `lib/attendance/leave.test.ts` (tests in-memory mock leave workflows)
- `lib/rate-limit.test.ts` (sliding window expiration, limits, resets)
- `lib/auth/routing.test.ts` (URL role boundary rules)
- `lib/reports/csv.test.ts` (RFC 4180 escaping and rate calculation)
- `lib/validation/index.test.ts` (input validator assertions)
- `lib/permissions/index.test.ts` (RBAC helper assertions)

### Integration Tests against Real Neon Database
- `tests/integration/attendance-flow.test.ts`:
  - Connects to live database when `DATABASE_URL` is set (`describe.skipIf(!hasDb)`).
  - Executes full transactional flow: Organization creation → User seeding → Section creation → Session activation → Challenge generation → Multi-student verification → Attendance record verification.
  - Executes complete CRUD suite on course recurring schedules.
  - Safely cleans up all fixtures in reverse foreign-key order inside `finally` blocks.

### Gaps in Testing
- ❌ Zero HTTP API Route integration tests (no Supertest or Next.js route testing).
- ❌ No automated multi-tenant leak tests (User A requesting User B's resource).
- ❌ No End-to-End browser tests (Playwright / Cypress).

---

## 15. Large Component Audit (`components/smart-attend.tsx`)

`components/smart-attend.tsx` is a monolithic file: **108 KB, 2,250 lines of code**.

### Component Responsibilities:
1. **Authentication UI:** `LoginScreen`, `RegisterScreen`, `ChangePasswordForm` (lines 25–316).
2. **Student Portal:** QR camera streaming, OTP entry, leave claim modal, notification feed, device list (lines 318–900).
3. **Teacher Portal:** Live attendance console, projector mode, challenge code display, student roster, analytics cards (lines 900–1500).
4. **Admin Portal:** User management, department configuration, course CRUD, recurring timetable schedule management, audit logs (lines 1500–1920).
5. **App Shell & Router:** Navigation state, theme switching, dashboard polling loop, deep-link URL synchronization (lines 1925–2250).

### Refactoring Recommendations:
- Extract sub-components into modular files (`components/auth/*`, `components/portals/student/*`, `components/portals/teacher/*`, `components/portals/admin/*`).
- Extract polling logic into a custom hook `useAttendancePolling()`.
- *Refactoring is not recommended during this audit phase to maintain stability.*

---

## 16. Documentation Inconsistencies

1. **`docs/stability-audit.md` is fully obsolete:**
   - Claims: *"No Neon integration was added"*, *"No PostgreSQL connection, DATABASE_URL, migration, backend API, provider, or real authentication system was added"*.
   - Reality: Neon PostgreSQL is integrated, schema has 15 tables, 20 API endpoints exist, and authentication is live.
2. **`docs/architecture.md`:**
   - Correctly identifies that future phases were needed, though its header notes the codebase has evolved. Needs updating to reflect current table structures and API route specifications.

---

## 17. Environment Configuration Audit

| Environment Variable | Required | Default / Fallback in Code | Risk Assessment |
|----------------------|----------|----------------------------|-----------------|
| `DATABASE_URL` | **Yes** | 🔴 `DEFAULT_DATABASE_URL` in `lib/db/index.ts:6` | **CRITICAL (P0):** Hardcoded database credentials with write access present in repository source. |
| `TEACHER_REGISTRATION_API_KEY` | **Yes** | 🔴 `DEFAULT_TEACHER_KEY` in `lib/auth/registration-key.ts:3` | **CRITICAL (P0):** Hardcoded registration secret present in repository source. |
| `NODE_ENV` | Optional | Auto-set by Next.js (`development` / `production`) | Controls `Secure` flag on session cookies. |

---

## 18. Final Subsystem Classification

| Subsystem | Status | Concrete Evidence | Problem / Gap Identified |
|---|---|---|---|
| **Database** | 🟢 REAL / VERIFIED | 15 tables in `lib/db/schema.ts`, `@neondatabase/serverless`, real CRUD verified in integration tests. | Hardcoded database URL fallback in `lib/db/index.ts`. |
| **Authentication** | 🟢 REAL / VERIFIED | `bcryptjs`, 32-byte SHA-256 session tokens, HTTP-only cookies, password change, teacher registration. | No session rotation on login; no CSRF token. |
| **Authorization** | 🟡 PARTIAL | `requireAuth(['teacher', 'admin'])` used on mutation routes. | 6 GET read routes lack role guards (students can read user/metric rosters). |
| **Attendance Engine** | 🟢 REAL / VERIFIED | State machine, challenge rotation, enrollment verification, record upsert, auto-absent on close. | Late detection calculation is bypassed in `verifyAttendance`. |
| **Challenge System** | 🟢 REAL / VERIFIED | Safe alphabet, SHA-256 hashing, sequence incrementation, TTL expiration check. | None. |
| **QR Code** | 🟡 PARTIAL | Client-side QR generation using `qrcode` library matching challenge code. | No separate signed dynamic QR token backend. |
| **Anti-Cheating** | 🟡 PARTIAL | Device scoring (0-100), suspicious attempts logging, enrollment checks. | Late policy ignored; no IP subnet verification. |
| **API Layer** | 🟡 PARTIAL | 20 Next.js route handlers with DB integration and error handling. | Read route authorization gaps; leave routes not DB-backed. |
| **Multi-Tenancy** | 🟡 PARTIAL | `organization_id` strictly scoped from server session on all DB tables. | `markNotificationsRead` bug; leave requests unscoped. |
| **Reports** | 🟢 REAL / VERIFIED | RFC 4180 CSV export for attendance and audit logs from real DB tables. | None. |
| **Analytics** | 🟢 REAL / VERIFIED | Real-time aggregate queries on users, sessions, and attendance records. | Endpoint accessible by student role. |
| **Leave Requests** | 🟠 DEMO / MOCK | `lib/attendance/leave.ts` uses in-memory JavaScript array with mock data. | Not persisted to database; lost on server restart. |
| **Real-Time** | 🟡 PARTIAL | 3-second HTTP polling loop in client component. | Inefficient at scale (10 parallel requests per cycle). |
| **Rate Limiting** | 🟡 MVP | Sliding window limiter on login and verify endpoints. | In-memory `Map`; not distributed across serverless instances. |
| **Testing** | 🟡 PARTIAL | 9 unit test suites + 1 live DB integration test. | No HTTP API route tests, no multi-tenant isolation tests. |

---

## 19. Prioritized Action Plan (For Future Development)

### P0 — Critical Security Remediations (Must Fix Immediately)
1. Remove `DEFAULT_DATABASE_URL` from `lib/db/index.ts`. Throw a hard startup error if `process.env.DATABASE_URL` is undefined.
2. Remove `DEFAULT_TEACHER_KEY` from `lib/auth/registration-key.ts`. Require `process.env.TEACHER_REGISTRATION_API_KEY`.
3. Rotate the exposed Neon database password in the Neon management console.

### P1 — Functional & Authorization Fixes
1. Add role check guards to `/api/users`, `/api/analytics/overview`, `/api/courses`, and `/api/courses/sections`.
2. Fix `markNotificationsRead` in `lib/attendance/server.ts` to include `eq(notifications.organizationId, auth.organizationId)`.
3. Implement late attendance calculation in `lib/attendance/server.ts:verifyAttendance` using `session.startedAt + policy.lateAfterMinutes`.
4. Create a `leave_requests` table in `lib/db/schema.ts` and migrate `lib/attendance/leave.ts` from in-memory arrays to PostgreSQL.

### P2 — Performance & Scalability Enhancements
1. Replace in-memory rate limiting with Redis / Upstash for serverless compatibility.
2. Consolidate client dashboard polling from 10 parallel endpoints into a single aggregated `/api/dashboard` endpoint or migrate to Server-Sent Events (SSE).
3. Split `components/smart-attend.tsx` into modular portal views.
4. Add automated API route and multi-tenant isolation test suites.
