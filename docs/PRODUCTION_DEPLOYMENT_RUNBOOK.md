# SmartAttend — Production Deployment Runbook

> Thực hiện bởi chủ dự án hoặc người vận hành có quyền. Mình **không** commit, push, deploy hay đụng vào production.

## 0. Điều kiện trước
Tất cả mục "Bắt buộc" trong [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md) phải đạt, đặc biệt: CI xanh (gồm integration), quyết định nghiệp vụ đã có hoặc chấp nhận giữ hành vi hiện tại, DB đã tách, env đã đặt.

## 1. Chuẩn bị mã nguồn
```bash
git switch -c release/security-hardening      # từ nhánh huy (chứa working tree đã review)
git add -A ':!bug-evidence'                   # review kỹ danh sách file trước khi add
git commit                                    # chia nhỏ commit theo nhóm nếu muốn (CI, auth, attendance, docs)
git push -u origin release/security-hardening
```
Mở PR vào `main`, đợi 2 job CI xanh, review diff (danh sách file trong SECURITY_FIX_REPORT §2 và báo cáo cuối).

## 2. Staging (Preview + Neon branch staging)
1. Pre-check và backup DB staging (MIGRATION_RUNBOOK §4–5).
2. `psql … -f drizzle/0005_one_open_session_per_section.sql`.
3. Preview deployment của PR (tự động), trỏ tới DB staging.
4. `psql … -f drizzle/0004_drop_challenge_plaintext.sql`.
5. Smoke test (mục 5) trên URL Preview.

## 3. Production
Ngoài giờ học:
1. Thông báo bảo trì ngắn (mã OTP đang hiển thị và passkey challenge đang dùng dở sẽ vô hiệu; GV mở lại phiên nếu cần).
2. Neon: tạo branch backup `pre-release-YYYYMMDD` từ production.
3. Pre-check 4.2 (phiên mở trùng) trên production; phải rỗng.
4. Chạy `0005` trên production.
5. Merge PR vào `main`. Vercel build Production; bật Deployment Checks để Vercel chờ CI.
6. Khi deployment Ready: chạy `0004` trên production.
7. Post-check SQL (MIGRATION_RUNBOOK §7) và smoke test.

## 4. Rollback / recovery
| Tình huống | Hành động |
|---|---|
| Lỗi ứng dụng sau deploy | Vercel → Deployments → bản trước → **Instant Rollback**. Index 0005 giữ nguyên (tương thích). Sau 0004, code cũ hiển thị `------` cho tới lần xoay kế tiếp; GV bấm xoay mã. |
| 0005 fail | Không có gì thay đổi; xử lý phiên trùng rồi chạy lại |
| Dữ liệu hỏng | Khôi phục từ Neon branch backup |
| Passkey không đăng ký được | Kiểm tra `WEBAUTHN_RP_ID`/`WEBAUTHN_ORIGIN` khớp domain; xem log `Passkey registration failed` |
| SSO lỗi | Log ghi tên biến thiếu; xem MICROSOFT_SSO_SETUP |

## 5. Smoke test sau deploy (dùng tài khoản test, không dùng dữ liệu thật)
- [ ] Đăng nhập 3 cổng; sai cổng → thông báo đúng.
- [ ] GV A mở phiên; mã và QR hiển thị rồi xoay sau khoảng 30 giây.
- [ ] GV B (cùng trường) **không** thấy lớp hay mã của GV A trong danh sách; gọi `/api/attendance/sessions/<id của A>` trả `live: null`.
- [ ] SV điểm danh bằng mã → `present`; gửi lại → "đã hoàn tất".
- [ ] Đóng phiên → SV chưa điểm danh thành `absent`.
- [ ] Đăng ký passkey trên Chrome, Safari, Edge → thành công (không 403).
- [ ] Import CSV có dòng trùng, email trùng → báo cáo từng dòng; không có tài khoản cũ nào bị đổi mật khẩu.
- [ ] `/api/auth/microsoft?portal=teacher` → 302 (nếu đã cấu hình), hoặc redirect về login với thông báo (nếu chưa).
- [ ] `/api/cron/sync-attendance` không có secret → 401.

## 6. Giám sát 48 giờ đầu
Vercel Observability: tỷ lệ 5xx của `/api/attendance/verify`, `/api/dashboard`, `/api/cron/sync-attendance`; log `Attendance verification failed`, `Microsoft OAuth is not configured`, `Passkey registration failed`.
