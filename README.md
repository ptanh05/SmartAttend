# SmartAttend — Multi-Tenant University Attendance SaaS

SmartAttend is a **production-ready, multi-tenant university attendance SaaS platform**. It enables institutions to conduct fast, tamper-resistant attendance: teachers launch live class sessions, dynamic 6-character rotating challenge codes/QRs are issued with strict TTLs, and students verify presence within authorized time windows.

The application is a **full-stack database-backed implementation** running on Next.js 16 (App Router), Drizzle ORM, and Neon PostgreSQL.

---

## 🌟 Key Features

- **Multi-Tenant SaaS Architecture:** Complete organizational data isolation based on server-verified session context (`organizationId`).
- **Role-Based Portals:** Specialized interfaces for Students, Teachers, Staff, and Admins with strict server-side RBAC.
- **Tamper-Resistant Attendance Engine:** Server-side state machine (`draft` → `active` → `paused` → `closed`), dynamic OTP challenge codes (safe alphabet, SHA-256 hashed), and automatic absent finalization on close.
- **Late Attendance Calculation:** Automatic server calculation of `late` vs `present` based on session `startedAt` and organizational policy (`lateAfterMinutes`).
- **Database-Backed Leave Requests:** Full lifecycle (submission, review, approve/reject, notification) persisted to PostgreSQL.
- **Anti-Cheating & Device Trust:** Hardware trust scoring (0–100), device fingerprint registry, replay protection, and `suspicious_attempts` tracking.
- **Real Authentication & Session Security:** `bcryptjs` password encryption, cryptographically secure 32-byte session tokens stored as SHA-256 hashes, `HttpOnly` / `SameSite=Lax` cookies, and brute-force sliding-window rate limiting.
- **CSV Reports & Analytics:** RFC 4180 streaming CSV export for attendance and audit trails, with real-time institutional metrics.
- **Bilingual i18n & Dark Mode:** Full English and Vietnamese support with runtime switcher and responsive mobile/tablet layout.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 4 + Lucide Icons + shadcn/ui |
| ORM & Database | Drizzle ORM on Neon Serverless PostgreSQL |
| Auth & Security | bcryptjs, SHA-256 hashed session tokens, HttpOnly cookies, timingSafeEqual |
| Rate Limiting | In-memory sliding window rate limiter |
| Testing | Vitest (11 suites, 86 unit & integration tests) |

---

## 🚀 Getting Started

### Prerequisites
- Node.js 20+ and `pnpm`
- Neon Serverless PostgreSQL instance

### 1. Configure Environment
```bash
cp .env.example .env
```
Populate `.env` with your credentials:
- `DATABASE_URL`: PostgreSQL connection string.
- `TEACHER_REGISTRATION_API_KEY`: Secret key authorizing teacher account creation.

### 2. Install Dependencies & Push Schema
```bash
pnpm install
pnpm db:push    # push Drizzle schema to Neon PostgreSQL
pnpm db:seed    # seed UTC demo data (courses, students, schedules)
```

### 3. Start Development Server
```bash
pnpm dev        # http://localhost:3000
```

---

## 📦 Scripts

| Command | Description |
|---|---|
| `pnpm dev` | Start development server |
| `pnpm build` | Production build & static page generation |
| `pnpm start` | Start production server |
| `pnpm test` | Run complete Vitest suite (unit, integration & security tests) |
| `pnpm typecheck` | Run TypeScript verification (`tsc --noEmit`) |
| `pnpm lint` | Run ESLint check |
| `pnpm db:push` | Push schema changes directly to Neon DB |
| `pnpm db:seed` | Seed default university organization, users, and courses |

---

## 🧪 Testing & Verification

Run the test suite:
```bash
pnpm test
```
The test suite covers:
- `lib/attendance/session-state.test.ts`: Session lifecycle transition rules.
- `lib/attendance/challenge.test.ts`: Code generation, safe alphabet, SHA-256 verification.
- `lib/attendance/device-policy.test.ts`: Trust scoring (0–100) and suspicious flagging.
- `lib/attendance/leave.test.ts`: Database-backed leave request workflow.
- `lib/rate-limit.test.ts`: Sliding window consumption, expirations, resets.
- `lib/permissions/index.test.ts`: Role-based access control helpers.
- `lib/reports/csv.test.ts`: RFC 4180 CSV cell escaping and rate calculation.
- `tests/integration/attendance-flow.test.ts`: Live end-to-end attendance flow on Neon DB.
- `tests/integration/security-regressions.test.ts`: Multi-tenant isolation, role boundary enforcement, expired challenge rejection, and late attendance timing.

---

## 🔒 Security Summary
- **No Hardcoded Secrets:** All secrets and connection strings are strictly read from environment variables.
- **Tenant Context Security:** `organization_id` is derived from the server-validated session cookie and cannot be overridden by client request bodies.
- **Zero Client Trust:** Status calculations, role authorizations, and timestamps are determined authoritatively on the server.
