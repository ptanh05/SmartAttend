# SmartAttend — Production Readiness Baseline (Stage 1)

> Ngày: 2026-11-14 · Lập **trước** khi sửa thêm code ở đợt này · Trạng thái: PASS / FAIL / WARNING / NOT VERIFIED / BLOCKED.
> Nguồn: code thực tế + [AI_HANDOFF.md](AI_HANDOFF.md), [SECURITY_FIX_REPORT.md](SECURITY_FIX_REPORT.md), [VERCEL_DEPLOYMENT_AUDIT.md](VERCEL_DEPLOYMENT_AUDIT.md) (cả ba đều đã được đối chiếu lại với code).

## 1. Kiến trúc thực tế (tóm tắt)
- Next.js 16.3.0 App Router; middleware là `proxy.ts` (CSRF cho `/api/*`). Có khoảng 40 Route Handler trong `app/api/**`. UI là một client component lớn (`components/smart-attend.tsx`).
- Nghiệp vụ nằm trong `lib/attendance/server.ts`, `lib/attendance/leave.ts`, `lib/auth/users.ts`. Auth nằm trong `lib/auth/{session,context,csrf,webauthn,oauth}.ts`.
- DB: Neon Postgres qua `drizzle-orm/neon-http` (**không có transaction tương tác**). Multi-tenant theo `organization_id`, được lọc trong từng query.
- Chỉ có 3 vai trò: `student`, `teacher`, `admin`. `/staff` chỉ redirect.

## 2. Trạng thái Git
| Mục | Giá trị |
|---|---|
| Nhánh hiện tại | `huy`, HEAD `0a89980` |
| Production (Vercel) | `0234fef` (`main`); GitHub Deployments + đối chiếu bundle |
| Chỉ có Preview | `cc442a3`, `e9d06c6`, `0a89980` (nhánh `huy`) |
| Thay đổi chưa commit | 17 file đã sửa + 12 file mới (các đợt sửa bảo mật trước, docs, migration 0004/0005, test). Đã sao lưu ra scratchpad (`backup-stage1/tracked.patch`, `untracked.tar`) trước khi sửa thêm. |
| `bug-evidence/` | Chưa track, của chủ dự án; **không đụng tới** |

### Phân loại thay đổi
| Nhóm | Có trong production? | Ghi chú |
|---|---|---|
| Code ở `0234fef` | Có | Còn các lỗ hổng Critical/High |
| `e9d06c6`, `0a89980` (sửa import giảng viên) | Chỉ Preview | |
| Sửa bảo mật đợt 1 (local) | Không | Scope phiên theo vai trò, roster IDOR, import tenant-safe, OTP suy ra bằng HMAC, WebAuthn (origin/one-time/registration/CSRF), race tạo phiên, method do server quyết định |
| Đợt này (Stage 2–6) | Không | Sẽ liệt kê trong [SECURITY_FIX_REPORT.md](SECURITY_FIX_REPORT.md) và [INDEPENDENT_SECURITY_REVIEW.md](INDEPENDENT_SECURITY_REVIEW.md) |

## 3. Trạng thái CI
| Mục | Trạng thái | Bằng chứng |
|---|---|---|
| GitHub Actions trên `main` | **FAIL** | 3 lần chạy gần nhất fail ở bước "Setup pnpm": không có `packageManager`, workflow không có `version`. Typecheck, lint, test, build **chưa từng chạy trên CI**. |
| pnpm thực tế | PASS | `pnpm-lock.yaml` `lockfileVersion: '9.0'`. Cài thử bằng `pnpm@9.15.9 install --frozen-lockfile` thành công, lockfile không đổi. |
| Phân loại test | **FAIL** | Unit và integration trộn lẫn trong một lệnh `vitest run`. Phần lớn integration dùng `describe.skipIf(!DATABASE_URL)` (bị skip âm thầm). Hai file (`lib/rate-limit.test.ts`, `departments-management-suite.test.ts`) cần DB nhưng không có `skipIf` nên fail khi thiếu DB. Các test integration gọi `config({ path: '.env' })` nên **có thể chạy vào DB trong `.env` của máy dev**, kể cả khi đó là DB production. |

Phân loại thực tế theo việc có import module chạm DB và có mock hay không:
- **Unit (không cần DB):** `lib/attendance/{challenge,challenge-derivation,device-policy,session-scope,session-state,ultrasonic}.test.ts`, `lib/auth/{portals,routing,webauthn-registration}.test.ts`, `lib/permissions/index.test.ts`, `lib/reports/csv.test.ts`, `lib/validation/index.test.ts`, `tests/integration/{cookie-consent,cookie-storage,zod-validation,dashboard-route}.test.ts` (dashboard-route mock toàn bộ service).
- **Integration (cần DB):** `lib/rate-limit.test.ts`, `lib/attendance/leave.test.ts` và 19 file còn lại trong `tests/integration/`.

## 4. Lỗi bảo mật: trạng thái tại baseline
| # | Lỗi | Code local | Production |
|---|---|---|---|
| 1 | OTP lộ giữa giảng viên | Đã sửa (chưa có test DB nào chạy) | FAIL |
| 2 | Scope danh sách lớp/phiên | Đã sửa | FAIL |
| 3 | IDOR roster | Đã sửa | FAIL |
| 4 | Fail-open khi xử lý suspicious | Đã sửa | FAIL |
| 5 | Import vượt tenant | Đã sửa | FAIL |
| 6 | OTP plaintext | Đã sửa (cần migration 0004) | FAIL |
| 7 | WebAuthn | Sửa một phần: **chưa ràng buộc public key với khóa COSE trong authData**, attestation `'none'` | FAIL |
| 8 | Ultrasonic | NOT IMPLEMENTED phía server; đã ngừng lưu claim của client | FAIL |
| 9 | Race tạo phiên | Đã sửa (cần migration 0005) | FAIL |
| 10 | Đồng bộ phụ thuộc polling | **BLOCKED**: chờ quyết định nghiệp vụ và cấu hình cron | FAIL |
| mới | `scripts/seed.ts` **xóa toàn bộ dữ liệu** (mọi bảng) rồi tạo tài khoản demo `12345678`, `mustChangePassword: false`, không chặn production | Chưa sửa | NOT VERIFIED (không rõ production từng seed chưa) |
| mới | OAuth tự liên kết tài khoản theo email (`preferred_username`), không yêu cầu tenant cụ thể | Chưa sửa | FAIL (theo code) |
| mới | `/api/auth/microsoft` 500 khi thiếu cấu hình | Chưa sửa | FAIL |
| mới | Verify đồng thời tạo verification/notification/audit trùng | Chưa sửa | WARNING |
| mới | Một `SESSION_SECRET` dùng cho 3 mục đích HMAC khác nhau, không tách khóa theo mục đích; fallback sang `TEACHER_REGISTRATION_API_KEY` | Chưa sửa | WARNING |

## 5. Migration
| File | Trạng thái |
|---|---|
| `0000`–`0003` | Có trong repo; trạng thái áp dụng trên production: NOT VERIFIED (dự án dùng `drizzle-kit push`) |
| `0004_drop_challenge_plaintext.sql` | Local, chưa áp ở đâu cả |
| `0005_one_open_session_per_section.sql` | Local, chưa áp ở đâu cả |
| `drizzle/meta/_journal.json` | **Không tồn tại**, nên `drizzle-kit migrate` không dùng được. Migration phải chạy bằng `psql` theo runbook. |

## 6. Chưa xác minh / bị chặn
| Mục | Trạng thái | Cần gì |
|---|---|---|
| Env vars trên Vercel | NOT VERIFIED | Quyền dashboard |
| Production và Preview dùng chung DB? | NOT VERIFIED | Quyền dashboard / Neon |
| Tài khoản demo trên DB production | NOT VERIFIED | Chủ dự án tự kiểm tra (hướng dẫn trong DEMO_ACCOUNT_SECURITY) |
| Cron production | NOT VERIFIED | Quyền dashboard |
| Integration tests | **BLOCKED** | Cần DB test riêng (Neon branch) |
| Migration trên staging | **BLOCKED** | Cần DB staging |
| Thời lượng phiên / ngưỡng đi muộn | **BLOCKED** | Quyết định nghiệp vụ |

## 7. Phụ thuộc giữa các thay đổi
1. Sửa CI → mới có cổng chất lượng cho mọi thay đổi sau.
2. Migration 0005 phải áp **trước** khi deploy code race-safe (code vẫn chạy được nếu chưa có index, chỉ là chưa được bảo vệ). Migration 0004 áp **sau** khi deploy code không ghi plaintext.
3. Tách khóa HMAC theo mục đích làm vô hiệu các WebAuthn challenge đang dùng dở (TTL 5 phút) và mã OTP đang hiển thị (TTL 30 giây, tự xoay lại). Nên deploy ngoài giờ học.
4. Ràng buộc COSE khi đăng ký passkey: passkey đã đăng ký trước đó **không bị ảnh hưởng** (chỉ áp cho lần đăng ký mới).
5. Gỡ đồng bộ lịch khỏi đường đọc phụ thuộc vào (a) quyết định nghiệp vụ, (b) có cron production.

## 8. Kế hoạch đợt này
- **Stage 2:** `packageManager`, tách unit và integration (integration **fail rõ ràng** nếu thiếu DB test riêng, không dùng `.env` dev), workflow 2 job, chạy typecheck/lint/unit/build thật.
- **Stage 3:** ràng buộc COSE khi đăng ký WebAuthn (không thêm dependency); tách khóa HMAC theo mục đích; verify idempotent dưới tải đồng thời; OAuth chống chiếm tài khoản + lỗi cấu hình có kiểm soát; chặn seed phá dữ liệu production.
- **Stage 4–7:** runbook migration, môi trường, SSO, lifecycle, demo account, review độc lập, checklist.
