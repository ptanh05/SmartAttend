# SmartAttend Architecture Specification

**Status:** v6 architecture and backend contract review only  
**Scope:** documentation and hydration fix; no database, integration, API, migration, or real-auth implementation in this iteration.

> **Implementation status (updated):** this document's "no database / no real-auth" scope line is now **out of date**.
> As of the current codebase, the backend has been migrated from demo data to a real, database-backed
> implementation: Drizzle + Neon schema (`lib/db/schema.ts`), token-based sessions (`lib/auth/session.ts`),
> teacher registration behind an API key, student CSV import, DB-backed attendance services
> (`lib/attendance/server.ts`) and route handlers (`app/api/**`). The document below remains a useful
> reference for the production target model and future phases; treat its "no implementation yet" wording as
> describing the earlier baseline, not the current tree.

## 1. System overview

SmartAttend is a multi-tenant university attendance SaaS. The current frontend is a demo implementation with Student, Teacher, and Admin portals, centralized demo data, a session/challenge lifecycle, and repository/permission seams. The production system should preserve those seams and replace demo repositories with server-side repositories backed by a tenant-scoped relational database.

The security boundary is the server: the browser may display state and collect input, but it must never decide organization membership, role authorization, challenge validity, attendance state, risk, or final reporting values.

## 2. Database review

The existing `lib/db/schema.sql` is a useful draft, not an implementation-ready schema.

### Covered well

- Organization-scoped rows exist for most operational tables.
- Users, departments, courses, classes, enrollments, sessions, challenges, records, verifications, devices, suspicious attempts, notifications, policies, and audit logs are represented.
- Basic status checks, timestamps, and several uniqueness constraints exist.
- The schema has the right broad separation between a session, rotating challenge, verification attempt, and attendance record.

### Required changes before implementation

1. **Identity separation:** the `users` table currently combines identity, organization membership, and role. A production model should use `users` for global identity and `organization_memberships` for organization, role, status, and department. This supports one person belonging to multiple organizations without cross-tenant leakage.
2. **Tenant-safe foreign keys:** organization IDs are present, but PostgreSQL cannot infer that `course.organization_id` matches `department.organization_id` or that a session's teacher belongs to the same organization. Add composite foreign keys or enforce equivalent checks in transactional repository commands.
3. **User foreign keys:** `teacher_id`, `student_id`, `actor_id`, and `reviewed_by` reference users but do not prove that the referenced user has the expected role or organization membership. Enforce role and tenant checks in service transactions.
4. **Class model:** `classes` is currently a scheduled occurrence. Rename conceptually to `course_sections` or split recurring class/section from meeting occurrence. Attendance sessions should reference a concrete section and optionally a meeting occurrence.
5. **Course teaching:** a single `courses.teacher_id` cannot model co-teachers, substitutes, or assistants. Add `course_staff` or `class_staff` membership.
6. **Enrollment:** `class_enrollments` needs enrollment status, effective dates, and optional withdrawal date. Use a composite primary key plus a status/history strategy.
7. **Attendance states:** `flagged` is too vague. Use `present`, `late`, `absent`, `excused`, `pending`, `rejected`, and `suspicious` only where the workflow requires them. Keep review status separate from attendance status.
8. **Confidence column:** `confidence integer` is unsafe without a defined scale. Prefer `verification_score` with a documented bounded range and separate `risk_score`; do not label either as probability.
9. **Challenge replay protection:** add rotation sequence, consumed/invalidated state, and a uniqueness constraint on `(session_id, sequence)`. Store only a hash of the challenge value.
10. **Verification metadata:** metadata needs a documented allowlist and retention policy. Do not persist raw IP, exact location, or device fingerprints unless a policy explicitly requires them.
11. **Device uniqueness:** add a uniqueness rule for active device binding per student and organization, plus replacement/revocation fields.
12. **Missing reporting/subscription model:** reports can be generated on demand initially. Add `subscriptions`, `plans`, and optionally `report_exports` only when SaaS/billing work begins.
13. **Missing indexes:** add composite indexes described below, not indexes on every column.

### Existing tables to retain conceptually

Organizations, users/identity, departments, courses, classes/sections, enrollments, attendance sessions, challenges, attendance records, verification attempts, devices, suspicious attempts, notifications, attendance policies, and audit logs all map to real product concepts. No table is inherently unnecessary, but `suspicious_attendance` should become a review entity and `classes` should be clarified as a section/occurrence model.

## 3. Core domain model and relationships

- **Organization:** tenant boundary, plan, lifecycle, timezone, retention policy.
- **User:** global login identity and account status.
- **OrganizationMembership:** user-to-organization role, department, status, and permissions.
- **StudentProfile:** student-specific identifier and academic metadata.
- **TeacherProfile:** staff-specific profile.
- **Admin:** represented by an organization membership with `ADMIN`; no separate admin table is needed.
- **Department:** organization-scoped academic grouping.
- **Course:** organization-scoped catalog entity.
- **CourseSection/Class:** a teaching offering of a course, with staff and enrolled students.
- **Enrollment:** student membership in a section over time.
- **AttendanceSession:** one attendance event for a section or class meeting.
- **AttendanceChallenge:** short-lived challenge rotation belonging to a session.
- **AttendanceRecord:** one final/current attendance state per student/session.
- **VerificationAttempt:** immutable attempt and result history.
- **SuspiciousAttempt/Review:** review workflow attached to a record or attempt.
- **Device:** student device binding and trust status.
- **Notification:** user inbox item.
- **AuditLog:** append-only organization activity record.
- **Report/Export:** generated artifact metadata; not required for the first persistence phase.
- **Plan/Subscription:** SaaS entitlement and billing state; defer implementation.

Relationship summary:

`Organization → Memberships, Departments, Courses, Sections, Students, Teachers, Sessions, Policies, AuditLogs, Subscription`.

`Course → Sections → Enrollments → Students`.

`Section → AttendanceSessions → Challenges, Records → VerificationAttempts and Reviews`.

`Student/User → Devices and Notifications`.

`AuditLog → Organization, Actor User, optional target entity`.

## 4. Multi-tenancy

The canonical tenant identifier is `organization_id`. Every organization-owned row must carry it, and every repository method must receive an authenticated `OrganizationScope` derived from the server session, never from request body input.

Rules:

- Resolve the active membership server-side from the authenticated user and organization context.
- Scope every SELECT, UPDATE, DELETE, and INSERT by `organization_id`.
- Scope child lookups through both parent ID and organization ID.
- Never accept a client-supplied organization ID as authority.
- Enforce membership and role before calling repositories.
- Use transactions for cross-entity writes and verify parent/child tenant consistency.
- Avoid global caches keyed only by entity ID.
- Prefer opaque IDs, but treat IDs as untrusted regardless.

A user in Organization A must receive an authorization failure or not-found result when requesting Organization B data. Do not reveal whether the foreign tenant record exists.

## 5. Roles and permissions

### STUDENT

Read: own profile, enrolled sections, own sessions, own attendance, own devices, own notifications.  
Create: verification attempts, device verification requests.  
Update: limited profile fields, device label, notification read state.  
Delete/archive: revoke own device; no attendance deletion.

### TEACHER

Read: assigned sections, enrolled rosters, sessions, attendance records, verification attempts, review queue, permitted analytics.  
Create: sessions, challenge rotations through a session service, notes/reviews, reports for assigned scope.  
Update: session configuration, session state, review decisions within assigned sections.  
Delete/archive: archive own drafts/reports; never hard-delete attendance history.

### ADMIN

Read/write: organization users, departments, courses, sections, policies, reports, audit logs, and all attendance within the organization.  
Create/update/archive: organization configuration and academic entities.  
Delete: soft-disable/archive only; preserve auditability.

No `SUPER_ADMIN` is necessary for the first product. A future platform operator should be a separate control plane, never an organization role.

## 6. Attendance lifecycle

Allowed session states:

- `DRAFT`: configurable; no student verification.
- `ACTIVE`: accepts attempts; challenge rotation is valid.
- `PAUSED`: temporarily rejects attempts or returns a retryable state; preserves session.
- `CLOSED`: finalizes records and summary; immutable except controlled admin correction.
- `EXPIRED`: automatically closed after policy/session deadline; no new attempts.

Flow: teacher creates draft → configures policy → starts session transactionally → server issues challenge → student attempts verification → server validates and upserts one record → session remains active and rotates challenge → teacher closes → server finalizes absent/late rules and emits summary/audit events.

State transitions must be enforced by a server-side state machine. Client buttons are only commands; they are not authority.

## 7. Attendance record states

Use `PENDING` for an attempt awaiting asynchronous review, `PRESENT` for an accepted on-time result, `LATE` for an accepted result after the late threshold, `EXCUSED` for an authorized override, `REJECTED` for a failed or denied result, and `SUSPICIOUS` for an accepted-looking result requiring review. `ABSENT` is a derived/finalized state assigned to enrolled students without an accepted record when a session closes; it need not be created during an active session.

Final state determination is server-side from session time, enrollment, policy, verification result, review decision, and any approved excuse. A risk flag must not silently convert a record to rejected; it should route to review or produce a transparent policy-defined state.

## 8. Challenge contract

`AttendanceChallenge` should contain: `id`, `organization_id`, `session_id`, `sequence`, `value_hash`, `created_at`, `expires_at`, `status`, `issued_by`, and optional `consumed_at`/`invalidated_at`.

The server generates a cryptographically random value, stores only a hash, returns the short-lived value over an authenticated session, and rotates it according to policy. A challenge is valid only when session is active, tenant/session match, current time is within its window, sequence/status is valid, and replay policy permits it. QR and manual code are two encodings of the same server challenge, not separate trust systems.

## 9. Verification pipeline

Client: capture code/QR, request verification, show progress and result, optionally provide device consent.  
Server: authenticate user, resolve tenant and role, validate session state, validate challenge hash/expiry/sequence, validate enrollment, calculate lateness, validate device policy, evaluate risk signals, write immutable attempt, upsert record idempotently, emit audit/notification.  
Database: enforce unique `(session_id, student_id)`, tenant-scoped constraints, timestamps, and transactional consistency.

Never trust client timestamps, role, organization, attendance status, challenge expiry, device trust, score, or GPS/network claims.

## 10. Anti-cheating strategy

| Mechanism | Recommendation | Benefit | Weakness/privacy/complexity |
|---|---|---|---|
| Rotating challenge | MVP | Limits screenshot reuse and sharing window | Does not prove physical presence; requires clock/expiry handling |
| QR encoding | MVP | Fast classroom check-in | Screenshots can be shared within TTL |
| Time window | MVP | Makes stale attempts invalid | Clock skew and late students require clear policy |
| Device binding | MVP optional policy | Adds account/device continuity | Device replacement and shared devices create support cost |
| Risk scoring | MVP as review aid | Combines weak signals transparently | Must not become opaque automatic punishment |
| IP/network signals | Optional | Detects coarse anomalies | VPN/mobile networks; sensitive and weak evidence |
| GPS | Future/optional | Adds location context | Spoofing, battery, consent, privacy and accuracy concerns |
| BLE proximity | Future | Stronger room proximity signal | Hardware, permissions, support and privacy complexity |
| Wi-Fi proximity | Future/optional | Useful on managed campuses | Network topology and privacy limitations |

## 11. Scores and terminology

Use `Verification Score` for the deterministic quality of the checks completed and `Integrity Score` or `Risk Score` for anomaly indicators. These are bounded product scores, not scientifically validated probabilities. Do not display “97% confidence” unless calibration, ground truth, and statistical validation actually support that interpretation. Student-facing UI should prefer plain results such as “Verified,” “Needs review,” or “Not verified.”

## 12. Device binding

A student may have multiple registered devices, but only policy-defined active devices should be trusted. Store a server-generated device ID, label, trust/revocation state, last seen time, created/replaced timestamps, and a protected hash of a device token if required. Do not use raw fingerprinting as identity.

Replacement requires explicit student/admin flow, revocation of the old device, audit event, and optional cooldown. Lost devices are revoked. Suspicious devices remain visible to review but are not automatically proof of cheating.

## 13. Audit log

Audit logs are append-only, organization-scoped, and record actor, action, target type/ID, timestamp, request correlation ID, and sanitized metadata. Log login/security events, session create/start/pause/close, challenge rotation failures, verification accepted/rejected, record corrections, suspicious review decisions, device bind/replace/revoke, course/section changes, account disablement, policy changes, report exports, and admin announcements. Never log secrets, raw challenge values, passwords, or unnecessary precise location.

## 14. Notifications

A notification has `id`, `organization_id`, `recipient_user_id`, `type`, `title`, `message`, `read_at`, `created_at`, optional `entity_type/entity_id`, and delivery metadata if channels are added later. Types include attendance confirmed, attendance rejected, class reminder, attendance issue, device verification, and admin announcement. Notifications are tenant-scoped and user-scoped; read state is mutable, content is auditable.

## 15. Future API boundaries

These are contracts only; no APIs are implemented in v6:

- `POST /api/auth/login` and `POST /api/auth/logout`
- `GET /api/me`
- `GET /api/organizations/:organizationId/context`
- `POST /api/attendance/sessions`
- `POST /api/attendance/sessions/:id/start`
- `POST /api/attendance/sessions/:id/pause`
- `POST /api/attendance/sessions/:id/close`
- `GET /api/attendance/sessions/:id`
- `POST /api/attendance/sessions/:id/challenges/rotate`
- `POST /api/attendance/verify`
- `GET /api/students/:id/attendance`
- `GET /api/teacher/sessions/:id/monitor`
- `GET /api/analytics/attendance`
- `GET /api/notifications`
- `POST /api/devices`
- `POST /api/devices/:id/revoke`
- `GET /api/audit-logs`

Every endpoint derives tenant and actor from the server session, validates input, returns stable error codes, and uses idempotency keys for attendance verification and state-changing commands.

## 16. Repository architecture

Current contracts cover only `CourseRepository`, `AttendanceRepository`, and `UserRepository`. They correctly accept `OrganizationScope`, but they are too narrow for the complete domain.

Recommended contracts:

- `UserRepository`: get identity, list memberships, disable/restore, update profile.
- `StudentRepository`: get profile, list enrolled sections, attendance history.
- `TeacherRepository`: assigned sections, roster, teaching memberships.
- `CourseRepository`: list/get/create/update/archive scoped by organization.
- `ClassRepository`: sections, staff, enrollments, schedule, archive.
- `AttendanceRepository`: create/start/pause/close session, active challenge, verify attempt transaction, records, reviews, summaries.
- `DeviceRepository`: list/register/verify/revoke/replace scoped by user and organization.
- `NotificationRepository`: list unread, mark read, create organization notification.
- `AuditLogRepository`: append and query organization audit events.
- `AnalyticsRepository`: aggregate only from authorized organization/section scopes.

Repositories must accept explicit scope objects, never trust IDs alone, return domain types rather than database rows, and keep transactions at the service boundary when multiple repositories participate.

## 17. Authentication architecture

Recommend server-managed, secure, HTTP-only session cookies with email/password as the baseline. Keep Student and Staff login experiences separate in the UI, but use one identity system with organization memberships and role-aware post-login routing. OAuth can be added later for institution SSO; magic links are optional, not required for the MVP. JWT-only browser auth is not recommended because revocation, rotation, and tenant/session control are harder. Password hashes, session records, CSRF/origin protection, rate limits, and disabled-account checks belong server-side.

## 18. Security review

- Cross-tenant access: derive tenant from membership; scope every query and composite relationship.
- Broken authorization: central policy checks plus server-side repository scope; never rely on hidden UI.
- Replay: short TTL, hash-only challenges, sequence/status, idempotency and attempt uniqueness.
- QR/screenshot sharing: rotation and review signals reduce but do not eliminate sharing.
- Client manipulation: recompute status, times, enrollment and scores server-side.
- Record tampering: append-only attempts/audits, controlled correction workflow, no hard delete.
- Brute force: rate limit by account/session/device/network and return generic errors.
- Session theft: secure HTTP-only cookies, SameSite policy, rotation, logout/revocation.
- Sensitive logs: sanitize metadata and restrict audit access to authorized admins.

## 19. Privacy review

SmartAttend processes identity, academic enrollment, attendance history, device binding information, and possibly network/location signals later. Store only the minimum necessary identifiers, hashes, timestamps, decisions, and policy evidence. Do not retain raw device fingerprints, exact GPS trails, raw IP history, or QR values without a documented purpose and retention period.

Provide students with a clear explanation of what is checked, why a result is pending/suspicious, how long attendance data is retained, and how to appeal. Define organization-configurable retention and deletion/archive policies; preserve legally required audit records while minimizing operational data.

## 20. SaaS model

`Organization → Plan → Subscription → Usage`. Plans can be Free, Pro, and Institution. A subscription should contain organization, plan, status, billing-provider reference, period dates, seats/limits, and cancellation state. Usage should track active students, staff, sessions, verification volume, storage/report exports, and feature entitlements. Billing and provider integration are explicitly deferred.

## 21. Indexing

Important indexes:

- Memberships: `(organization_id, user_id)`, `(organization_id, role, status)`.
- Academic entities: `(organization_id, code)`, `(organization_id, status)`, department/course foreign-key pairs.
- Sections/enrollments: `(organization_id, course_id)`, `(organization_id, student_id)`, `(class_id, student_id)`.
- Sessions: `(organization_id, class_id, starts_at desc)`, `(organization_id, status)`.
- Challenges: `(session_id, sequence)`, `(session_id, status, expires_at)`.
- Records: unique `(session_id, student_id)`, `(organization_id, student_id, created_at desc)`, `(session_id, status)`.
- Attempts/reviews: `(organization_id, created_at desc)`, `(attendance_record_id, created_at desc)`, `(organization_id, status)`.
- Devices: `(organization_id, student_id, status)`, unique active binding as policy requires.
- Notifications: `(organization_id, user_id, read_at, created_at desc)`.
- Audit: `(organization_id, created_at desc)`, optional `(organization_id, actor_id, created_at desc)`.

Do not index low-cardinality fields alone or duplicate indexes already covered by composite prefixes.

## 22. Recommended implementation order

### Phase 1 — Database + Neon

Finalize identity/membership and section modeling, tenant-safe relationships, constraints, indexes, and migrations in a controlled environment.

### Phase 2 — Real authentication

Implement secure session authentication, password lifecycle, disabled accounts, organization membership selection, and role-aware routing.

### Phase 3 — Real repositories

Implement scoped repositories behind the current contracts, transaction helpers, domain mapping, and test fixtures.

### Phase 4 — Attendance API

Implement session state commands, challenge issuance/rotation, idempotent verification, record finalization, notifications, and audit events.

### Phase 5 — Real-time attendance monitoring

Add server events or polling for active sessions, challenge updates, roster changes, and close-session summaries.

### Phase 6 — Verification and anti-cheating

Add device policy, integrity/risk scoring, review workflows, and only then evaluate optional network/location/proximity signals.

### Phase 7 — Analytics

Add authorized aggregate queries, materialized summaries if needed, report exports, and retention-aware analytics.

### Phase 8 — Multi-tenant SaaS

Add organization provisioning, membership administration, plan entitlements, usage limits, retention controls, and support tooling.

### Phase 9 — Billing

Add subscription provider integration, checkout/portal, invoices, plan changes, webhooks, and entitlement reconciliation.

## 23. Hydration issue review

The reported error is caused by browser-only values such as `window.location` and `sessionStorage` being consulted during the first render, producing different server and client trees. The safe fix is to render a deterministic initial shell and run session/path restoration only inside a mount effect; the component must not branch on `window` during server render. This documentation phase records that fix without changing the product UI or backend scope.
