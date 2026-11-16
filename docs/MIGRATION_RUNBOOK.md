# SmartAttend — Migration Runbook

> **Không có migration nào đã được chạy ở bất kỳ môi trường nào trong quá trình chuẩn bị tài liệu này.** Mọi lệnh bên dưới dành cho người vận hành có quyền, chạy lần lượt trên **staging** rồi mới tới production.

## 1. Hiện trạng
- Schema nguồn: `lib/db/schema.ts`. Thư mục `drizzle/` có `0000`–`0005` dạng SQL, **không có `meta/_journal.json`**, nên `drizzle-kit migrate` không dùng được. Dự án vẫn dùng `drizzle-kit push`.
- **Không** dùng `drizzle-kit push` trên production để thay migration: push có thể đề xuất xóa hoặc đổi cột khi schema lệch. Với production, chạy các file SQL đã review bằng `psql`.
- Trạng thái `0000`–`0003` trên production: NOT VERIFIED. Kiểm tra ở bước pre-check.

## 2. Migration mới
| File | Thay đổi | Ảnh hưởng dữ liệu | Rollback |
|---|---|---|---|
| `0005_one_open_session_per_section.sql` | Partial unique index `attendance_sessions_one_open_per_section_idx (section_id) WHERE status IN ('draft','active','paused')`, kèm khối `DO` **raise lỗi nếu có trùng** | Không sửa dữ liệu | `DROP INDEX IF EXISTS attendance_sessions_one_open_per_section_idx;` |
| `0004_drop_challenge_plaintext.sql` | `UPDATE attendance_challenges SET code = NULL WHERE code IS NOT NULL` | Xóa plaintext cũ; `value_hash` giữ nguyên | **Không hoàn tác được** (plaintext mất vĩnh viễn, đây là mục đích). Code cũ vẫn chạy (cột vẫn còn); mã chưa xoay chỉ hiển thị `------` cho tới lần xoay kế tiếp. |

## 3. Thứ tự bắt buộc
1. Pre-check và backup.
2. **0005** (trước khi deploy code; code mới vẫn chạy được nếu chưa có index, nhưng chưa được bảo vệ khỏi race).
3. **Deploy code** của bản phát hành này.
4. **0004** (sau deploy: code cũ còn ghi plaintext, nên phải chạy sau khi không còn instance code cũ nào).
5. Post-check.

Nên làm ngoài giờ học. Bản phát hành cũng tách khóa HMAC theo mục đích, nên mã OTP đang hiển thị và WebAuthn challenge đang dùng dở sẽ vô hiệu tại thời điểm deploy.

## 4. Pre-check (chỉ đọc)
```sql
-- 4.1 Bảng và index hiện có
SELECT indexname FROM pg_indexes WHERE tablename IN ('attendance_sessions','attendance_challenges','organization_memberships');
-- Kỳ vọng có: membership_student_code_idx (0002); course_sections có cột start_date/end_date (0003)
SELECT column_name FROM information_schema.columns WHERE table_name='course_sections' AND column_name IN ('start_date','end_date');
SELECT column_name FROM information_schema.columns WHERE table_name='organizations' AND column_name='email_domain';

-- 4.2 Phiên mở trùng (phải RỖNG trước khi chạy 0005)
SELECT section_id, array_agg(id ORDER BY created_at) AS session_ids, count(*)
FROM attendance_sessions
WHERE status IN ('draft','active','paused')
GROUP BY section_id HAVING count(*) > 1;

-- 4.3 Số challenge còn plaintext (để đối chiếu sau 0004)
SELECT count(*) FROM attendance_challenges WHERE code IS NOT NULL;
```
Nếu 4.2 có kết quả: **dừng lại**. Chủ dự án quyết định giữ phiên nào. Gợi ý: đóng các phiên `draft` không có record bằng cách cập nhật `status='closed', closed_at=now()` theo từng id cụ thể. Không xóa phiên có `attendance_records`.

## 5. Backup
- Neon: tạo branch từ thời điểm hiện tại (Neon Console → Branches → Create branch, đặt tên `pre-release-YYYYMMDD`). Đây là điểm khôi phục nhanh nhất.
- Bổ sung (tùy chọn): `pg_dump --format=custom --no-owner "$DATABASE_URL" > smartattend-YYYYMMDD.dump` lưu nơi an toàn, không commit vào repo.

## 6. Chạy trên staging
```bash
# staging = Neon branch tách từ production (hoặc DB staging riêng)
export DATABASE_URL='<staging connection string>'      # KHÔNG phải production
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0005_one_open_session_per_section.sql
# deploy bản Preview của commit phát hành, trỏ tới staging, rồi:
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f drizzle/0004_drop_challenge_plaintext.sql
TEST_DATABASE_URL="$DATABASE_URL" pnpm test:integration   # chỉ khi staging là DB dùng một lần
```

## 7. Post-check
```sql
SELECT indexdef FROM pg_indexes WHERE indexname='attendance_sessions_one_open_per_section_idx';
SELECT count(*) FROM attendance_challenges WHERE code IS NOT NULL;   -- kỳ vọng 0
```
Thao tác thủ công: GV mở phiên, mã và QR hiển thị rồi xoay; SV điểm danh thành công; mở phiên lần hai cho cùng lớp trả về **cùng** session id.

## 8. Điều kiện được chạy production
- [ ] Đã chạy thành công trên staging, kèm post-check và smoke test.
- [ ] `test:integration` xanh trên DB test.
- [ ] Đã có Neon branch backup ngay trước khi chạy.
- [ ] Pre-check 4.2 trên production rỗng.
- [ ] Có người phê duyệt (chủ dự án) và đang ngoài giờ học.

## 9. Recovery
- Lỗi khi chạy 0005: không có gì thay đổi (khối `DO` raise trước `CREATE INDEX`). Xử lý dữ liệu trùng rồi chạy lại.
- Ứng dụng lỗi sau deploy: rollback deployment trên Vercel (Instant Rollback). Index 0005 có thể giữ nguyên (code cũ tương thích). 0004 không cần hoàn tác.
- Hỏng dữ liệu: khôi phục từ Neon branch backup (Neon → Restore, hoặc trỏ `DATABASE_URL` sang branch backup).
