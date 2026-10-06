# SmartAttend JUnit system tests

This directory contains black-box JUnit 5 tests for the running SmartAttend application. The tests use Java's built-in HTTP client, retain the `smartattend_session` cookie, and exercise the same Next.js Route Handlers used by the browser.

## Coverage

- Public pages and 404 handling.
- Invalid login, Student/Teacher/Admin login, `/api/me`, and logout revocation.
- Anonymous access and role-based access control.
- Student, teacher, admin, reporting, analytics, and CSV API contracts.
- Optional database-mutating lifecycle: create course and section, open a session, rotate its challenge, check in as a student, verify the record, and close the session.

The suite is an HTTP system test. It does not inspect React components or replace the existing Vitest unit/integration tests.

## Requirements

- Java 21+
- PowerShell
- `pnpm` when using `-StartApp`
- A configured and reachable SmartAttend database

The runner downloads the pinned JUnit Platform Console standalone JAR into the ignored `tests/junit/.cache` directory on first use. Maven is not required.

## Run

Start the application yourself and run the read-only suite:

```powershell
pnpm dev
./tests/junit/run-tests.ps1
```

Or let the runner start and stop the development server:

```powershell
./tests/junit/run-tests.ps1 -StartApp
```

Run the complete lifecycle test as well:

```powershell
./tests/junit/run-tests.ps1 -StartApp -Mutating
```

The mutating test creates a uniquely named course, section, attendance session, audit events, and attendance records. The application currently has no complete cleanup API, so these rows are intentionally retained for inspection.

## Configuration

The defaults match `scripts/seed.ts`. Override any value through environment variables:

```powershell
$env:SMARTATTEND_BASE_URL = 'http://localhost:3000'
$env:SMARTATTEND_STUDENT_ID = '20260001'
$env:SMARTATTEND_STUDENT_PASSWORD = 'student123'
$env:SMARTATTEND_TEACHER_EMAIL = 'teacher@smartattend.edu.vn'
$env:SMARTATTEND_TEACHER_PASSWORD = '12345678'
$env:SMARTATTEND_ADMIN_EMAIL = 'admin@smartattend.edu.vn'
$env:SMARTATTEND_ADMIN_PASSWORD = '12345678'
./tests/junit/run-tests.ps1 -StartApp
```

For the lifecycle test, the teacher and student must belong to the same organization. The seed accounts satisfy this requirement.
