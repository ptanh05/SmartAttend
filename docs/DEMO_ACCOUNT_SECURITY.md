# SmartAttend — Demo Account Security

## 1. Hiện trạng (đã xác minh trong code)
| Nguồn | Nội dung | Rủi ro |
|---|---|---|
| `README.md` | Công bố `admin@smartattend.edu.vn` / `12345678`, `teacher@smartattend.edu.vn` / `12345678`, `20260001@student.utc.edu.vn` / `student123` | Nếu các tài khoản này tồn tại trên production, ai cũng đăng nhập được |
| `scripts/seed.ts` | **Xóa toàn bộ dữ liệu mọi bảng**, tạo org `org_utc`, admin và teacher với mật khẩu `12345678`, SV với mật khẩu = mã SV; tất cả `mustChangePassword: false` | Chạy nhầm với DB production là mất hết dữ liệu và mở cửa cho tài khoản demo |
| Seed tự động | Không có hook nào chạy seed khi build hay deploy (đã kiểm tra `package.json`, CI, `next.config.mjs`) | PASS |
| Tài khoản tạo qua import | SV: mật khẩu = mã SV; GV: `Gv@123456` dùng chung; cả hai `mustChangePassword: true`, được ép ở server (HTTP 428) | Medium: trước khi đổi mật khẩu, ai biết mã SV là đăng nhập được |
| Admin đầu tiên | `POST /api/auth/register` + `TEACHER_REGISTRATION_API_KEY` | Để trống biến này sau khi đã bootstrap thì tắt hẳn đăng ký |
| Tài khoản demo trên production | **NOT VERIFIED.** Mình không kết nối DB production và không thử đăng nhập. | |

## 2. Đã sửa (local)
`scripts/seed.ts` › `assertSeedAllowed()` từ chối chạy khi:
- `NODE_ENV` hoặc `VERCEL_ENV` = `production`;
- thiếu `SEED_CONFIRM_WIPE_ALL_DATA=yes-wipe-this-database`;
- `DATABASE_URL` trùng `PRODUCTION_DATABASE_URL` (nếu có đặt).

## 3. Chủ dự án tự kiểm tra trên production (chỉ đọc)
Chạy bằng tài khoản DB có quyền, trong Neon SQL Editor của **branch production**:
```sql
SELECT u.email, u.must_change_password, u.disabled_at, m.role, m.status, m.organization_id
FROM users u JOIN organization_memberships m ON m.user_id = u.id
WHERE lower(u.email) IN ('admin@smartattend.edu.vn','teacher@smartattend.edu.vn')
   OR m.student_code IN ('20260001','20260002','20260003','20260004','20260005','20260006','20260007','20260008')
   OR m.organization_id = 'org_utc';
```
Nếu có kết quả:
1. Vô hiệu ngay: `UPDATE users SET disabled_at = now() WHERE id IN (...)`, hoặc đổi mật khẩu qua UI. Thao tác này ghi vào production, nên chủ dự án tự quyết định.
2. Thu hồi phiên: `DELETE FROM auth_sessions WHERE user_id IN (...)`.
3. Xem `audit_logs` của các tài khoản đó để phát hiện truy cập bất thường.

## 4. Đề xuất
- Production **không** seed. Admin đầu tiên tạo qua `/api/auth/register` với API key dùng một lần, sau đó **xóa** `TEACHER_REGISTRATION_API_KEY` khỏi Production env.
- Xóa mật khẩu demo khỏi `README.md` (chuyển vào tài liệu nội bộ, chỉ áp dụng cho môi trường demo). Chưa sửa README vì chờ chủ dự án đồng ý: đội QA có thể đang dùng.
- Cân nhắc đặt `mustChangePassword: true` cho tài khoản seed nếu vẫn dùng demo trên staging.
- Mật khẩu tối thiểu hiện là 8 ký tự; khuyến nghị kiểm tra mật khẩu phổ biến hoặc đã lộ khi đổi mật khẩu.
- Rate limit đăng nhập theo IP độc lập với identifier để chống password spraying (INDEPENDENT_SECURITY_REVIEW C-15).
