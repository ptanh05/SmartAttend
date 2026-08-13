# SmartAttend

SmartAttend is a **multi-tenant university attendance SaaS**. It helps institutions run fast, tamper-resistant attendance: a teacher starts a live session, a rotating challenge code is issued, and students verify their presence within a short time window.

This is a **real, database-backed implementation** (Next.js + Drizzle + Neon PostgreSQL). It is not a UI-only demo — authentication, attendance records, audit logs, and analytics are all persisted server-side.

## Key features

- **Role-based portals** — Student, Teacher, Staff, and Admin portals with role-aware routing and organization scoping.
- **Tamper-resistant attendance** — rotating challenge codes (short TTL, stored hashed) with a strict session state machine.
- **Brute-force protection** — sliding-window rate limiting on login and attendance verification endpoints.
- **CSV report export** — `GET /api/reports/attendance` returns a per-student attendance summary as a downloadable CSV, wired to the Reports/Analytics export button.
- **Trusted-device scoring** — per-organization `requireTrustedDevice` policy drives a bounded `verificationScore` and surfaces untrusted-device verifications as suspicious attempts for review.
- **Real authentication** — password hashing (bcrypt), login by email or student code, session cookies with hashed, expiring tokens, password change, account disabling, and teacher self-registration behind an API key.
- **Student import** — bulk-create students from CSV with generated default passwords.
- **Analytics & auditing** — per-organization metrics, attendance rate, suspicious-attempt tracking, and audit logs.
- **i18n** — English and Vietnamese built in, with a runtime language switcher.

## Tech stack

| Layer        | Tooling                                                          |
| ------------ | ---------------------------------------------------------------- |
| Framework    | Next.js 16 (App Router) + React 19                               |
| Language     | TypeScript (strict)                                              |
| Styling      | Tailwind CSS 4 + shadcn/ui components                            |
| ORM / DB     | Drizzle ORM on Neon PostgreSQL                                   |
| Auth         | bcryptjs, signed session cookies, SHA-256 token hashing          |
| Testing      | Vitest                                                           |
| Validation   | Client/server validation helpers + role/permission guards        |
| i18n         | Lightweight runtime `en`/`vi` dictionary                         |

## Getting started

### Prerequisites

- Node.js 20+ and `pnpm`
- A Neon (PostgreSQL) database — set its connection string as `DATABASE_URL`

### 1. Configure environment

```bash
cp .env.example .env
```

Required variables in `.env`:

- `DATABASE_URL` — PostgreSQL connection string (Neon recommended).
- `TEACHER_REGISTRATION_API_KEY` — secret shared key that authorizes teacher self-registration.

### 2. Install and set up the database

```bash
pnpm install
pnpm db:push        # apply the Drizzle schema to your database
pnpm db:seed        # reset the database (clears all rows)
```

> For production, prefer tracked migrations. Generate and apply them with:
>
> ```bash
> pnpm dlx drizzle-kit generate
> pnpm dlx drizzle-kit migrate
> ```

### 3. Run the app

```bash
pnpm dev            # http://localhost:3000
```

To get started after a fresh seed, register a teacher account at
`/staff/register` using your `TEACHER_REGISTRATION_API_KEY`.

## Scripts

| Command            | Description                                        |
| ------------------ | -------------------------------------------------- |
| `pnpm dev`         | Start the development server                       |
| `pnpm build`       | Production build (type-checks the app)             |
| `pnpm start`       | Start the production server                        |
| `pnpm lint`        | Run ESLint                                        |
| `pnpm typecheck`   | Type-check the whole project (`tsc --noEmit`)     |
| `pnpm test`        | Run the Vitest test suite                          |
| `pnpm db:push`     | Push the Drizzle schema to the database            |
| `pnpm db:seed`     | Reset all database rows (development only)         |

## Project structure

```
app/
  api/                # Route handlers (auth, attendance, users, analytics, ...)
  student|teacher|staff|admin/   # Portal entry pages ([[...slug]] dynamic routes)
components/
  smart-attend.tsx    # Main client app shell (per-portal dashboards)
lib/
  attendance/         # Challenge, session state machine, DB-backed services
  auth/               # Session, cookies, password, registration-key, routing
  db/                 # Drizzle schema, connection
  i18n/               # en/vi string dictionaries
  permissions/        # Role & organization access guards
  repositories/       # Repository interfaces (contracts/seams)
  validation/         # Input validators
  api/client.ts       # Typed browser API client
docs/                 # Architecture & stability notes
scripts/seed.ts       # Database reset script
```

## How attendance works

1. A teacher creates a **course section** and starts a **live session**.
2. The server generates a short **challenge code** (6 chars, TTL-bounded) and stores only its hash.
3. Students submit the code (`/api/attendance/verify`); the server validates the code, session state, and classroom policy.
4. A successful match creates an **attendance record** (`present`/`late`/`pending`), protects against replay, and can flag **suspicious attempts**.
5. Teachers rotate the code and close the session; everything is persisted and audited.

## Testing

Run the suite with `pnpm test`. Tests cover the core, framework-free logic:

- `lib/attendance/session-state` — session transition rules
- `lib/attendance/challenge` — code generation, hashing, verification
- `lib/permissions` — role & organization guards
- `lib/validation` — input validators
- `lib/auth/routing` — portal access rules
- `lib/rate-limit` — sliding-window limiter
- `lib/reports/csv` — RFC 4180 CSV escaping, summary/rate helpers

There is also an **integration test** (`tests/integration/attendance-flow.test.ts`) that exercises the full
attendance flow against the real database (create section → start session → rotate challenge → verify →
check record/device). It runs only when `DATABASE_URL` is set and cleans up its fixtures afterwards.

## Roadmap (next milestones)

- Split the monolithic `components/smart-attend.tsx` into focused per-portal components.
- Extend reports to export per-course/section breakdowns.
- Add real-time session updates (polling today; SSE/WebSocket later).

See `docs/architecture.md` for the detailed system architecture and future phases.
