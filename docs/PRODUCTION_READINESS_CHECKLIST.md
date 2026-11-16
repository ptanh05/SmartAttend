# SmartAttend — Production Readiness Checklist

> Cập nhật: 2026-11-14 · **Kết luận: NOT READY FOR PRODUCTION — BLOCKED BY: chưa chạy integration test trên DB riêng; chưa kiểm chứng tách DB, env vars, tài khoản demo trên production; chưa có quyết định về thời lượng phiên và cron; các bản sửa chưa được commit, review và deploy.**

| # | Tiêu chí | Trạng thái | Bằng chứng / việc còn lại |
|---|---|---|---|
| 1 | CI chạy thành công | **NOT VERIFIED** | Workflow đã sửa (local); chưa push. Nguyên nhân fail cũ đã xác định và khắc phục. |
| 2 | Typecheck | **PASS** (local) | `pnpm typecheck` exit 0 |
| 3 | Lint | **PASS** (local) | `pnpm lint` exit 0 |
| 4 | Unit tests | **PASS** (local) | 17 file, 174/174 |
| 5 | Integration tests trên DB riêng | **BLOCKED** | Cần secret `TEST_DATABASE_URL` (Neon branch). Lệnh hiện fail có chủ đích khi thiếu DB. |
| 6 | Production build | **PASS** (local) | `pnpm build` exit 0, không cần DB hay secret |
| 7 | Không còn Critical | **PASS (code, local)** / **FAIL (production)** | Đã sửa C-1 (seed) và lộ OTP; production vẫn chạy `0234fef` |
| 8 | High đã xử lý hoặc được phê duyệt | **WARNING** | Đã sửa ở code: roster/leave IDOR, import, OTP, WebAuthn COSE, OAuth takeover. Còn: ultrasonic (NOT IMPLEMENTED, cần chủ dự án chấp nhận), attestation `'none'` (chờ quyết định) |
| 9 | Tenant isolation kiểm chứng | **NOT VERIFIED** | Code đã sửa; test integration đã viết, chưa chạy |
| 10 | Authorization kiểm chứng | **NOT VERIFIED** | Như trên (unit test phạm vi: PASS) |
| 11 | OTP không lưu plaintext | **PASS (code)** | Cần migration 0004 cho dữ liệu cũ |
| 12 | WebAuthn xác minh đúng ở server | **PASS (code, unit)** | Assertion: chữ ký, rpId, UP/UV, counter, origin, one-time. Registration: COSE binding. Chưa thử trên trình duyệt thật. |
| 13 | Không còn race tạo phiên | **PASS (code)** / **NOT VERIFIED (DB)** | Cần migration 0005 + test đồng thời |
| 14 | Tách DB Production / Preview | **NOT VERIFIED** | VERCEL_ENVIRONMENT_SETUP §3 |
| 15 | Migration kiểm thử trên staging | **BLOCKED** | Chưa có staging |
| 16 | OAuth kiểm tra | **FAIL (production)** / **PASS (code, unit)** | Production 500; cần cấu hình Entra + env (MICROSOFT_SSO_SETUP) |
| 17 | Env vars xác minh | **NOT VERIFIED** | Không có quyền dashboard |
| 18 | Cron có giải pháp vận hành | **BLOCKED** | Chưa có lịch; chờ quyết định gói Vercel hoặc scheduler và quy tắc nghiệp vụ |
| 19 | Tài khoản demo xử lý | **WARNING** | Seed đã có chốt chặn; production NOT VERIFIED (DEMO_ACCOUNT_SECURITY §3) |
| 20 | Quyết định nghiệp vụ | **BLOCKED** | ATTENDANCE_LIFECYCLE_DESIGN §3; chính sách teacher sửa policy; liên kết GV liên tổ chức; attestation |
| 21 | Runbook + rollback | **PASS** | PRODUCTION_DEPLOYMENT_RUNBOOK, MIGRATION_RUNBOOK |

## Việc của chủ dự án (theo thứ tự)
1. Review working tree (danh sách file trong báo cáo cuối), commit lên nhánh release, mở PR.
2. Tạo Neon branch cho CI → secret `TEST_DATABASE_URL` → để CI chạy integration. Sửa mọi test đỏ (không sửa test cho khớp với code sai).
3. Bật branch protection và Vercel Deployment Checks (CI_CD_CONFIGURATION §5).
4. Kiểm tra và tách `DATABASE_URL` theo environment; đặt đủ env (VERCEL_ENVIRONMENT_SETUP).
5. Kiểm tra tài khoản demo trên production (DEMO_ACCOUNT_SECURITY §3).
6. Trả lời 6 câu hỏi lifecycle và chọn giải pháp cron.
7. Cấu hình Entra ID hoặc tạm ẩn SSO.
8. Staging: migration + smoke test → Production theo runbook.
