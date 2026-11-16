# SmartAttend — Database Design (thay đổi)

> Mô tả đầy đủ schema và ERD: [AI_HANDOFF.md](AI_HANDOFF.md) Phần 5. Nguồn sự thật: [lib/db/schema.ts](../lib/db/schema.ts). File này ghi các thay đổi của đợt sửa ngày 2026-11-14.

## `attendance_sessions`
- **Index mới:** `attendance_sessions_one_open_per_section_idx`, dạng UNIQUE `(section_id)` `WHERE status IN ('draft','active','paused')`.
- **Bất biến:** mỗi lớp học phần có tối đa một phiên đang mở. Mọi chỗ INSERT phiên phải dùng `ON CONFLICT DO NOTHING` rồi đọc lại phiên thắng (xem `getOrCreateLiveSession` và nhánh auto-start trong `syncScheduledAttendance`).
- Migration: `drizzle/0005_one_open_session_per_section.sql`. Migration này dừng với lỗi nếu đang có dữ liệu trùng, không tự sửa dữ liệu.

## `attendance_challenges`
- `code` (text, nullable): **không còn được ghi**. Bản ghi mới luôn có `NULL`. Cột được giữ để rollback được; sẽ xóa ở một migration sau.
- `value_hash` = `sha256(upper(trim(code)))`: nguồn xác minh duy nhất.
- Mã rõ được **suy ra** khi cần hiển thị cho giảng viên: `HMAC-SHA256(SESSION_SECRET, "attendance-challenge:v1:<session_id>:<sequence>")` ánh xạ vào bảng `ABCDEFGHJKLMNPQRSTUVWXYZ23456789` (`lib/attendance/challenge.ts`).
- Migration: `drizzle/0004_drop_challenge_plaintext.sql` (đặt `code = NULL` cho dữ liệu cũ).
- Phụ thuộc vận hành: thay đổi `SESSION_SECRET` làm mã của các challenge đang active không suy ra được nữa. Hệ thống tự xoay mã ở lần poll kế tiếp của giảng viên.

## `rate_limits` (thêm cách dùng, không đổi schema)
- Khóa `webauthn-nonce:<nonce>` dùng để đánh dấu WebAuthn challenge đã được sử dụng (`consumeWebAuthnChallenge`), `reset_at` = thời điểm challenge hết hạn. Hiện chưa có job dọn dẹp (xem [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md)).

## Quy tắc tenant (nhắc lại, đã áp dụng trong đợt sửa)
- `organization_memberships.student_code` là unique **toàn cục**. Import chỉ được thao tác trên membership thuộc `auth.organizationId`; mã đã thuộc tổ chức khác sẽ bị bỏ qua.
- `users` là identity toàn cục. Import **không bao giờ** sửa một `users` đã tồn tại.
