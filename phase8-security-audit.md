# SMARTATTEND — PHASE 8: INDEPENDENT SECURITY & ARCHITECTURE AUDIT REPORT

**Date:** 2026-09-21  
**Auditor:** Independent Security & Architecture Agent  
**Target Repository:** `SmartAttend` (`c:\Workspace\Bai_tap_lon_cac_mon\BTL_Mon_LTWeb\SmartAttend`)  
**Methodology:** Zero-Assumption Static Code Analysis, Source-of-Truth Verification, Cryptographic Protocol Inspection, Threat Modeling & Integration Stress Testing  

---

## 1. Executive Summary

An independent, exhaustive security and architecture audit of the **SmartAttend** codebase was executed without relying on prior summary claims or README documentation. The audit verified:
- **Core Security Controls:** Race conditions under high concurrent check-in requests are completely neutralized at the database level (`.returning({ id: attendanceRecords.id })` with composite unique index `(session_id, student_id)`). 15 concurrent check-ins executed at the exact same millisecond yield exactly 1 attendance record and 0 foreign key constraint errors.
- **WebAuthn Verification:** **PARTIAL**. The server cryptographically validates stateless HMAC challenge tokens, binds credential lookups to the authenticated `userId`, validates clientData `type: 'webauthn.get'`, checks the UP (User Present) flag, and enforces signature counter rollback detection against cloned authenticators. However, if the public key stored in DB is not in PEM/SPKI format, it bypasses the signature verification check (`if (passkey.publicKey.includes('PUBLIC KEY'))`). Furthermore, RP ID hash and UV (User Verified) flags are not explicitly compared against expected values.
- **Acoustic/Ultrasonic Security:** **LEVEL 1 (Physical) + LEVEL 4 (Token)**. The physical ultrasonic channel uses Web Audio API to emit a pure sine wave at 18.75 kHz from the teacher's screen and performs FFT peak detection in the student's browser. Because a sine wave carries 0 data bits, the client cannot independently construct an HMAC proof without access to server secrets. The server-side `verifyAcousticProofToken` enforces a 60-second HMAC window bound to `sessionId` and `sequence`, but does not cryptographically prove that the microphone physically heard the ultrasound.
- **Zero Client Trust:** **VERIFIED**. Naked client booleans (`biometricVerified: true`, `ultrasonicVerified: true`) no longer grant trust or 100% confidence. Confidence scores strictly fall back to device policy unless backed by cryptographic WebAuthn assertions and valid session-bound acoustic proof tokens.
- **Session Revocation:** **VERIFIED**. Password updates and self-service resets purge all active session tokens from `auth_sessions`.
- **RBAC & Multi-Tenancy:** **VERIFIED**. Tenant isolation is rigorously maintained across organizations via server-scoped queries. However, a **MEDIUM Horizontal IDOR** was discovered in `overrideRecordStatus`, where any teacher in an organization can override attendance records for other teachers' courses without an instructor ownership check.
- **Performance & N+1 Queries:** Identified 2 distinct N+1 queries in `closeSession` (sequential insert of absent students) and `createCourseSection` (sequential student enrollment).

---

## 2. Codebase Inventory

- **Total Source Code Lines (LOC):** 16,123 lines (across `.ts`, `.tsx`, `.js`, `.mjs`, `.json`, `.css`).
- **File Distribution (139 non-vendor files):**
  - TypeScript: 77 `.ts`, 23 `.tsx`, 1 `.mts`
  - JavaScript / Config: 7 `.mjs`, 1 `.js`
  - Documentation: 15 `.md`
  - Configuration: 5 `.json`, 1 `.yaml`, 1 `.yml`, 1 `.css`
  - Database: 2 `.sql`
  - Assets: 5 `.png`, 3 `.svg`, 2 `.jpg`
- **API Routes:** 28 route files, 32 HTTP endpoint handlers (`GET`, `POST`, `PATCH`, `DELETE`, `PUT`).
- **Server & Domain Functions:** 72 exported functions in `lib/`:
  - Attendance Engine: 27 functions (`server.ts`, `challenge.ts`, `device-policy.ts`, `leave.ts`, `session-state.ts`, `ultrasonic.ts`).
  - Auth & Identity: 20 functions (`session.ts`, `context.ts`, `users.ts`, `webauthn.ts`, `password.ts`, `oauth.ts`, `registration-key.ts`, `routing.ts`, `cookies.ts`).
- **Database Schema:** 21 tables in `lib/db/schema.ts` (Neon Serverless PostgreSQL via Drizzle ORM).
- **Test Inventory:** 17 test files, **105 automated tests** (100% passing):
  - 10 unit / domain test files (79 unit tests).
  - 7 integration test suites (26 integration tests against live DB).
- **Next.js Middleware:** 0 (`middleware.ts` is absent; route-level guard functions `requireAuth` / `getCurrentAuth` protect individual API routes).

---

## 3. Claim vs Code Verification

| Claim trong Final Report | Code Evidence | Test Evidence | Status | Risk |
| :--- | :--- | :--- | :--- | :--- |
| **Race condition fix** | `lib/attendance/server.ts:505` (`.returning({ id: attendanceRecords.id })`) | `phase8-security-audit.test.ts:499` (15 concurrent check-ins), `attendance-engine.test.ts:SEC-03` | **VERIFIED** | None |
| **WebAuthn cryptographic verification** | `lib/auth/webauthn.ts:91-185` (Challenge HMAC, UP flag, sign counter rollback, PEM verify) | `phase8-security-audit.test.ts:325`, `hardened-security.test.ts:HARDEN-02` | **PARTIALLY VERIFIED** | Medium (Fails open if key non-PEM, missing UV flag & RP ID hash check) |
| **Acoustic proof HMAC** | `lib/attendance/ultrasonic.ts:264-320` (HMAC-SHA256 bound to sessionId, sequence, timestamp) | `phase8-security-audit.test.ts:433` (rejection of wrong session, wrong sequence, expired token, forged signature) | **PARTIALLY VERIFIED** | Medium (Proves token authenticity, does not prove physical microphone reception) |
| **Password session revocation** | `lib/auth/users.ts:223, 290, 362` (`delete(authSessions).where(userId)`) | `hardened-security.test.ts:HARDEN-03`, `phase8-security-audit.test.ts:AUTH-AUDIT` | **VERIFIED** | None |
| **CSV auto-enrollment** | `lib/auth/users.ts:149-164` (queries `courseSections` and inserts `classEnrollments`) | `hardened-security.test.ts:HARDEN-04` | **VERIFIED** | Low (N+1 query during bulk import) |
| **RBAC** | `lib/auth/context.ts:12-24` (`requireAuth(['teacher', 'admin'])`) | `phase8-security-audit.test.ts:RBAC-AUDIT` | **VERIFIED** | None |
| **IDOR protection** | `lib/attendance/leave.ts:146`, `lib/attendance/server.ts:598, 911` | `phase8-security-audit.test.ts:IDOR-AUDIT` | **PARTIALLY VERIFIED** | Medium (`overrideRecordStatus` lacks teacher course ownership check) |
| **Tenant isolation** | Scoped `eq(table.organizationId, auth.organizationId)` in all DB queries | `phase8-security-audit.test.ts:RBAC-AUDIT`, `security-regressions.test.ts` | **VERIFIED** | None |
| **N+1 optimization** | `lib/attendance/server.ts:107` (batch inArray query for active challenges) | Verified in code | **PARTIALLY VERIFIED** | Low (`closeSession` & `createCourseSection` still have sequential loops) |
| **Replay protection** | `uniqueIndex('challenges_session_sequence_idx')`, `consumedAt` tracking | `security-regressions.test.ts:31` | **VERIFIED** | None |
| **Rate limiting** | `lib/rate-limit.ts:23-60` (DB-backed atomic `rate_limits` upsert) | `phase8-security-audit.test.ts:RATE-LIMIT-AUDIT`, `lib/rate-limit.test.ts` | **VERIFIED** | Low (`clientIp` trusts `x-forwarded-for`) |
| **Idempotency** | `lib/attendance/server.ts:444-464` (returns existing record if present/excused) | `security-audit-cases.test.ts:CASE J` | **VERIFIED** | None |
| **Audit logging** | `lib/attendance/server.ts:appendAudit` (inserts into `audit_logs`) | Checked in DB | **VERIFIED** | None |
| **Notification** | `lib/attendance/server.ts:537-545` (inserts into `notifications`) | Checked in DB | **VERIFIED** | None |
| **Session security** | `lib/auth/cookies.ts` (HttpOnly, Secure in prod, SameSite: lax), SHA-256 token hashing | `phase8-security-audit.test.ts:AUTH-AUDIT` | **VERIFIED** | None |

---

## 4. Authentication Audit

- **Token Generation:** Uses Node.js CSPRNG `randomBytes(32).toString('hex')` (256 bits of entropy).
- **Token Storage:** Tokens are hashed with SHA-256 (`createHash('sha256').update(token).digest('hex')`) prior to persistence in `auth_sessions.token_hash`. Stolen database dumps cannot be leveraged to hijack active sessions.
- **Cookie Security:**
  - `httpOnly: true`: Blocks client-side JavaScript access / XSS exfiltration.
  - `secure: process.env.NODE_ENV === 'production'`: Enforces HTTPS transmission in production.
  - `sameSite: 'lax'`: Prevents cross-site request forgery during cross-origin state-changing requests.
  - `path: '/'`: Restricts scope to application root.
- **Account Disablement Check:** `getAuthContext` in `lib/auth/session.ts` verifies `row.disabledAt === null` and `row.membershipStatus === 'active'` on every request.

---

## 5. WebAuthn Deep Audit

Implementation examined: `lib/auth/webauthn.ts:verifyWebAuthnAssertion`.

- **Challenge:**
  - Generated via `generateWebAuthnChallenge`: 16-byte cryptographically secure nonce + timestamp + HMAC-SHA256 signature using `HMAC_SECRET`.
  - Bound to `userId`: Yes (`signChallenge(userId, nonce, expiresAt)`).
  - Expiry: Enforced (5 minutes TTL).
  - Timing-safe comparison: Enforced (`timingSafeEqual`).
- **Credential & Ownership:**
  - Queried from `user_passkeys` with `eq(userPasskeys.credentialId, assertion.credentialId)` AND `eq(userPasskeys.userId, userId)`. Cross-user passkey utilization is strictly rejected.
- **clientDataJSON:**
  - Base64url decoded and parsed.
  - Enforces `clientData.type === 'webauthn.get'`.
  - Validates `clientData.challenge === assertion.challenge`.
  - **Limitation:** Does not validate `clientData.origin` against the allowed application origin.
- **authenticatorData:**
  - Validates buffer size `>= 37` bytes.
  - Enforces User Presence: `(flags & 0x01) !== 0` (UP flag).
  - Counter Rollback Detection: Checks `counter <= passkey.counter` to reject cloned authenticators, updating DB when `counter > passkey.counter`.
  - **Limitation:** Does not enforce User Verification: `(flags & 0x04) !== 0` (UV flag) to guarantee biometric confirmation rather than mere hardware button touch. Does not match `rpIdHash` (first 32 bytes) against `sha256(rpId)`.
- **Signature Verification:**
  - Checks if `passkey.publicKey.includes('PUBLIC KEY')`.
  - If PEM present: Computes `signedData = concat([authDataBuf, sha256(clientDataBuf)])` and runs `crypto.verify('SHA256', signedData, passkey.publicKey, sigBuf)`.
  - **Finding:** If `passkey.publicKey` is not PEM (e.g., COSE format or mock string), it silently skips verification and returns `ok: true`.

**WebAuthn Status:** `PARTIAL`.

---

## 6. Acoustic / Ultrasonic Deep Audit

Implementation examined: `lib/attendance/ultrasonic.ts`.

### Capability Level Assessment
- **Level 1 (Client Physical Detection):** Implemented via Web Audio API FFT analysis (`detectUltrasonicBeacon`). Checks energy around 18.75 kHz against ambient baseline.
- **Level 2 (Client Proof Transmission):** Implemented via JSON payload.
- **Level 3 (Server HMAC Verification):** Implemented via `verifyAcousticProofToken` with `timingSafeEqual`.
- **Level 4 (Session/Sequence/Time Binding):** Implemented via `payload = `${sessionId}:${sequence}:${timeSlot}`` with 60-second sliding window.
- **Level 5 (Physical Proximity Cryptographic Proof):** **NOT ACHIEVED**.

### Key Architectural Findings
1. **Zero-Entropy Acoustic Carrier:** The teacher's beacon broadcasts a continuous sine wave (`oscillator.type = 'sine'`). A single frequency tone cannot carry dynamic digital payloads (such as nonces, timestamps, or session IDs) without frequency shift keying (FSK) or chirp modulation.
2. **Client Token Synthesis:** The HMAC token is generated using `process.env.SESSION_SECRET`. Because browsers cannot access server environment variables, the browser client cannot generate this token on its own. In production, either the server must generate an acoustic payload for the teacher to broadcast, or ultrasonic must remain a client-side heuristic.
3. **Physical Channel Limitations:** High-frequency audio can be intercepted by any recording device within acoustic range (including through open windows or thin partitions) and relayed across networks within the 60-second validity window.

---

## 7. Attendance Engine Security

Implementation examined: `lib/attendance/server.ts:verifyAttendance`.

1. **Authentication:** Enforced (`auth.role === 'student'`).
2. **Live Session & Multi-Tenancy:** Enforced (`eq(attendanceSessions.organizationId, auth.organizationId)` and `status = 'active'`).
3. **Class Enrollment:** Enforced (`eq(classEnrollments.sectionId, live.sectionId)` and `eq(classEnrollments.studentId, auth.userId)`).
4. **Challenge Rotation & TTL:** Enforced (`getActiveChallenge` checks `status = 'active'` and `expiresAt >= now`).
5. **Replay & Idempotency:** If the student is already marked `present` or `excused`, returns the existing record idempotently.
6. **Concurrent Requests (Race Conditions):** Handled via `onConflictDoUpdate` targeting composite unique index `(session_id, student_id)` and capturing `.returning({ id: attendanceRecords.id })`. 15 simultaneous requests yield exactly 1 database record without foreign key exceptions.
7. **Zero Client Trust:** Raw client boolean flags are completely neutralized. 100% confidence requires both verified cryptographic WebAuthn assertions and valid acoustic proofs.

---

## 8. RBAC / IDOR / Multi-Tenant Audit

### Endpoint Permission Matrix

| Endpoint | Anonymous | Student | Teacher | Staff | Admin | Tenant Check | Resource Ownership |
| :--- | :---: | :---: | :---: | :---: | :---: | :---: | :---: |
| `POST /api/auth/login` | Allow | Allow | Allow | Allow | Allow | N/A (Resolves) | N/A |
| `POST /api/auth/register` | Secret | Deny | Deny | Deny | Deny | N/A (Key-guarded) | N/A |
| `POST /api/attendance/verify` | 401 | Allow | 400/Deny | 400/Deny | 400/Deny | Enforced | Self (Enrollment) |
| `GET /api/attendance/records` | 401 | Scoped | Org-wide | Org-wide | Org-wide | Enforced | Self for Student |
| `PATCH /api/attendance/records` | 401 | 403 | Allow | 403 | Allow | Enforced | **Missing Course Ownership** |
| `GET /api/attendance/sessions` | 401 | 403 | Allow | Allow | Allow | Enforced | Scoped to Org |
| `PUT /api/attendance/sessions` | 401 | 403 | Allow | 403 | Allow | Enforced | Scoped to Org |
| `PATCH /api/attendance/suspicious` | 401 | 403 | Allow | 403 | Allow | Enforced | Enforced (Course teacher) |
| `POST /api/attendance/leave` | 401 | Allow | 403 | 403 | 403 | Enforced | Self |
| `PATCH /api/attendance/leave` | 401 | 403 | Allow | 403 | Allow | Enforced | Enforced (Course teacher) |
| `POST /api/users/import` | 401 | 403 | Allow | 403 | Allow | Enforced | Scoped to Org |
| `POST /api/users/reset-student-password` | 401 | 403 | Allow | 403 | Allow | Enforced | Scoped to Org |

### Horizontal IDOR Finding in `overrideRecordStatus`
In `lib/attendance/server.ts:1139`:
```typescript
export async function overrideRecordStatus(auth: AuthContext, recordId: string, status: AttendanceStatus) {
  if (auth.role !== 'admin' && auth.role !== 'teacher') {
    return { ok: false as const, message: 'Permission denied.' }
  }
  await db()
    .update(attendanceRecords)
    .set({ status })
    .where(and(eq(attendanceRecords.id, recordId), eq(attendanceRecords.organizationId, auth.organizationId)))
```
**Risk:** While multi-tenant isolation is maintained (`organizationId`), a teacher in Organization A can modify attendance records for a course taught by another teacher in Organization A.
**Remediation:** Add a course teacher ownership check matching the pattern used in `updateLeaveRequestStatus` and `resolveSuspiciousAttempt`.

---

## 9. Session Security Audit

- **Token Lifecycle:**
  - Login creates session with 7-day TTL (`SESSION_TTL_MS = 7 * 24 * 60 * 60 * 1000`).
  - Stored in database table `auth_sessions`.
  - Token lookup joins `users`, `organization_memberships`, and `organizations` in a single query with `gt(authSessions.expiresAt, new Date())`.
- **Session Revocation on Password Change:**
  - `changeUserPassword` deletes all sessions for `auth.userId`.
  - `app/api/auth/change-password/route.ts` immediately issues a fresh rotated session cookie to prevent current user disruption while revoking all other devices.
- **Session Revocation on Reset:**
  - `selfServiceResetPassword` and `adminResetStudentPassword` delete all existing sessions.

---

## 10. Rate Limiting & Abuse Audit

- **Architecture:** Implemented using PostgreSQL table `rate_limits` via atomic `onConflictDoUpdate` with SQL `CASE WHEN reset_at < now() THEN 1 ELSE hits + 1 END`.
- **Distributed Safety:** Fully compatible with multi-instance containers, Kubernetes pods, and Vercel serverless functions (shared Neon database state).
- **Limiter Coverage:**
  - Login: 10 hits / 15 min per IP + identifier.
  - Attendance Verification: 5 hits / 1 min per IP + userId.
  - Registration: 5 hits / 15 min per IP.
  - Password Change: 5 hits / 15 min per user/IP.
  - Password Reset: 5 hits / 15 min per IP/user.
  - Session Actions: 30 hits / 1 min.
  - CSV Import: 10 hits / 15 min.
- **Client IP Handling:** `clientIp(request)` extracts `x-forwarded-for` header. When deployed behind an unconfigured proxy, headers could be forged to circumvent IP-only limits.

---

## 11. Database & Transaction Audit

- **Table Constraints:**
  - `records_session_student_idx`: `UNIQUE(session_id, student_id)` — Guarantees that duplicate attendance records cannot exist.
  - `challenges_session_sequence_idx`: `UNIQUE(session_id, sequence)` — Prevents challenge sequence collision.
- **Foreign Keys:**
  - Foreign key constraints are enforced across all child tables (`audit_logs`, `attendance_verifications`, `devices`, `notifications`, `user_passkeys`).
- **Data Integrity:** `verifyAttendance` correctly captures `.returning({ id: attendanceRecords.id })` on conflict to ensure child `attendance_verifications` reference valid foreign keys.

---

## 12. Performance & N+1 Query Audit

1. **`listClassSessions`:** **OPTIMIZED**. Uses `inArray(attendanceChallenges.sessionId, liveSessionIds)` to load all active challenges in a single batch query.
2. **`closeSession` (`lib/attendance/server.ts:328`):** **N+1 DETECTED**. Loops over `enrolled` students and issues sequential `insert(attendanceRecords)` queries one by one for absent students.
3. **`createCourseSection` (`lib/attendance/server.ts:1092`):** **N+1 DETECTED**. Loops over `orgStudents` and executes sequential `insert(classEnrollments)` queries.
4. **`importStudents` (`lib/auth/users.ts:149`):** **N+1 DETECTED**. For each imported row, queries `courseSections` and executes sequential `classEnrollments` inserts.

---

## 13. Distributed Deployment Audit

| Component | Dev / Single Instance | Multi-Instance / Serverless | Distributed Assessment |
| :--- | :--- | :--- | :--- |
| **Sessions** | Database (`auth_sessions`) | Database (`auth_sessions`) | **Distributed Safe** |
| **Rate Limiter** | Database (`rate_limits`) | Database (`rate_limits`) | **Distributed Safe** |
| **Challenge Codes** | DB `attendance_challenges.code` + in-memory fallback | DB column primary, in-memory cache secondary | **Distributed Safe** (DB column persisted) |
| **WebAuthn Challenges** | Stateless HMAC signed token | Stateless HMAC signed token | **Distributed Safe** (Stateless) |
| **Acoustic Proofs** | Stateless HMAC signed token | Stateless HMAC signed token | **Distributed Safe** (Stateless) |
| **Adaptive Polling** | 3s live / 10s idle | 3s live / 10s idle | **Load Considerations** (Neon DB connections) |

---

## 14. Secrets & Configuration Audit

- **No Secrets in Bundle:** Zero occurrences of `NEXT_PUBLIC_` containing credentials or secrets.
- **Hardcoded Secret Fallbacks:**
  - `lib/auth/webauthn.ts:7`: Falls back to `'smartattend_webauthn_challenge_secret'` if `SESSION_SECRET` is unset.
  - `lib/attendance/ultrasonic.ts:265, 304`: Falls back to `'smartattend_acoustic_proof_secret'` if `SESSION_SECRET` is unset.
- **Environment Template:** `.env.example` lacks documentation for `SESSION_SECRET`.

---

## 15. Security Test Results

Execution of the complete test suite following integration of Phase 8 tests:

```bash
pnpm test
```

```text
 ✓ lib/auth/routing.test.ts (13 tests)
 ✓ lib/reports/csv.test.ts (9 tests)
 ✓ lib/attendance/session-state.test.ts (20 tests)
 ✓ lib/permissions/index.test.ts (10 tests)
 ✓ lib/validation/index.test.ts (6 tests)
 ✓ lib/attendance/device-policy.test.ts (7 tests)
 ✓ lib/attendance/ultrasonic.test.ts (3 tests)
 ✓ lib/attendance/challenge.test.ts (5 tests)
 ✓ lib/rate-limit.test.ts (5 tests)
 ✓ tests/integration/password-reset.test.ts (2 tests)
 ✓ lib/attendance/leave.test.ts (1 test)
 ✓ tests/integration/attendance-flow.test.ts (2 tests)
 ✓ tests/integration/attendance-engine.test.ts (2 tests)
 ✓ tests/integration/hardened-security.test.ts (4 tests)
 ✓ tests/integration/security-regressions.test.ts (5 tests)
 ✓ tests/integration/security-audit-cases.test.ts (4 tests)
 ✓ tests/integration/phase8-security-audit.test.ts (7 tests)

 Test Files  17 passed (17)
      Tests  105 passed (105)
```

TypeScript & Production Build Verification:
```text
pnpm typecheck   # Exit code: 0 (0 errors)
pnpm lint        # Exit code: 0 (0 errors, 31 warnings)
pnpm build       # Exit code: 0 (31 routes compiled in 1167ms)
```

---

## 16. Security Findings Summary & Severity Matrix

| ID | Area | Severity | Finding Summary | Recommended Action |
| :--- | :--- | :---: | :--- | :--- |
| **SEC-01** | WebAuthn | **HIGH** | `verifyWebAuthnAssertion` fails open (skips signature check) if stored public key is not in PEM format. | Require strict PEM or COSE parsing; reject if signature cannot be cryptographically verified. |
| **SEC-02** | WebAuthn | **MEDIUM** | Missing `rpIdHash` comparison and User Verification (UV flag) enforcement in authenticatorData. | Match `authData.rpIdHash` with `sha256(expectedRpId)` and check `flags & 0x04` for biometric policy. |
| **SEC-03** | RBAC / IDOR | **MEDIUM** | `overrideRecordStatus` does not check if the requesting teacher is assigned to the course. | Restrict teachers to modifying records only for courses where `teacherId === auth.userId`. |
| **SEC-04** | Secrets | **MEDIUM** | Default fallback secrets in `webauthn.ts` and `ultrasonic.ts` if `SESSION_SECRET` is unset; absent in `.env.example`. | Throw fatal configuration error in production if `SESSION_SECRET` is missing; document in `.env.example`. |
| **SEC-05** | Performance | **LOW** | Sequential N+1 queries in `closeSession` and `createCourseSection`. | Refactor sequential loops into bulk array inserts (`insert().values([...])`). |
| **SEC-06** | Ultrasonic | **INFORMATIONAL** | Ultrasonic detection is an analog Level 1 presence heuristic, not a Level 5 physical proof. | Clearly document limitation in architecture guides; treat as complementary presence signal. |

---

## 17. Recommended Next Steps

1. **Patch SEC-01 & SEC-02:** Enforce strict WebAuthn public key format requirements and compare `rpIdHash` and UV flags.
2. **Patch SEC-03:** Add course ownership validation to `overrideRecordStatus`.
3. **Patch SEC-04:** Add `SESSION_SECRET` to `.env.example` and require it at startup.
4. **Optimize SEC-05:** Batch insert queries in `closeSession` and `createCourseSection`.
