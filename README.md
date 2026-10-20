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
- **Academic Attendance Warning (Cảnh báo cấm thi tự động):** University regulation compliance (absence > 20% or $\ge 3$ sessions $\rightarrow$ disqualified from exam; 2 absences $\rightarrow$ academic warning with reminder). Banner alert on student dashboard, exam eligibility badges on course cards, and auto-dispatched notifications.
- **File Attachment in Leave Requests (Ảnh minh chứng):** Students upload medical certs or parental consent images with thumbnail previews; teachers inspect attachments in a dedicated full-screen preview modal (`ProofPreviewModal`) before approving.
- **Quick Manual Roll Call (Điểm danh thủ công nhanh):** Teachers can view all enrolled students in the live section (including unmarked students) and 1-click mark them `present`, `late`, or `excused` if their phone died or was forgotten.
- **Printable Attendance Sheet (Phiếu điểm danh PDF A4):** Standard official MOET/UTC university attendance sheet with per-student breakdown (present, late, excused, unexcused, absent rate, exam eligibility), dean & lecturer signature blocks, eligibility filters, and `@media print` A4 landscape styling.
- **Ultrasonic Acoustic Token & WebAuthn Biometrics:** Dual-channel anti-proxy attendance verification combining acoustic ultrasound soundwaves (18.5kHz - 20kHz) and FIDO2 passkeys for 100% presence proof.
- **CSV & Excel Reports with UTF-8 BOM:** RFC 4180 streaming CSV export for attendance and audit trails with UTF-8 BOM encoding, eliminating font mojibake in Microsoft Excel.

---

## 🛠 Tech Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript (strict mode) |
| Styling | Tailwind CSS 4 + Lucide Icons + Print CSS |
| ORM & Database | Drizzle ORM on Neon Serverless PostgreSQL |
| Auth & Security | bcryptjs, SHA-256 hashed session tokens, HttpOnly cookies, timingSafeEqual |
| Anti-Cheat Engine | Acoustic ultrasound generator/detector + WebAuthn FIDO2 passkeys |
| Testing | Vitest (23 suites, 136 unit & integration tests) |

---

## 🔑 Demo Accounts

| Role | Email | Password | Description |
|---|---|---|---|
| **Admin** | `admin@smartattend.edu.vn` | `12345678` | Ban Đào Tạo UTC, quản lý khoa, người dùng, báo cáo |
| **Teacher** | `teacher@smartattend.edu.vn` | `12345678` | Giảng viên, mở ca học, điểm danh thủ công, duyệt đơn |
| **Student** | `20260001@student.utc.edu.vn` | `student123` | Sinh viên UTC, nộp đơn đính kèm ảnh, xem cảnh báo |

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
| `pnpm test` | Run complete Vitest suite (23 suites, 136 tests) |
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
The test suite covers 23 suites and 136 tests:
- `phase10-advanced-features.test.ts`: Medical file attachment, Quick manual roll call, Academic attendance warnings (20% rule), and printable PDF sheet calculation.
- `attendance-engine.test.ts`: High-concurrency race condition prevention & hardware verification.
- `webauthn-security.test.ts`: FIDO2 cryptographic assertion, public key verification, and acoustic proof validation.
- `section-roster-management-suite.test.ts`: Section-level roster isolation, attendance scoping, and student management.
- `reports-vietnamese-encoding-suite.test.ts`: UTF-8 BOM encoding and font preservation.
- `security-regressions.test.ts` & `security-audit-cases.test.ts`: Multi-tenant isolation and IDOR prevention.

---

## 🔒 Security Summary
- **No Hardcoded Secrets:** All secrets and connection strings are strictly read from environment variables.
- **Tenant Context Security:** `organization_id` is derived from the server-validated session cookie and cannot be overridden by client request bodies.
- **Zero Client Trust:** Status calculations, role authorizations, and timestamps are determined authoritatively on the server.
