# SmartAttend — Nợ kỹ thuật & vấn đề còn mở

> Cập nhật: 2026-11-14, sau đợt sửa trong [SECURITY_FIX_REPORT.md](SECURITY_FIX_REPORT.md). Số mục tham chiếu theo [AI_HANDOFF.md](AI_HANDOFF.md) Phần 9.
> Ký hiệu: ⏸ chờ quyết định nghiệp vụ · 🔧 có thể làm ngay · 🧪 thiếu test.

## Chờ quyết định
| Mục | Vấn đề | Vị trí | Ghi chú |
|---|---|---|---|
| ⏸ #2 | Cửa sổ 3 phút hard-code áp cho **mọi** phiên; `lateAfterMinutes` (10) không bao giờ đạt được | `lib/attendance/server.ts` › `syncScheduledAttendance` (`ATTENDANCE_WINDOW_MS`, `autoCloseMinutes = startsAt + 3`), `getLiveSessionDetails` (`ATTENDANCE_WINDOW_MS`, `durationSeconds: 180`); `components/smart-attend.tsx` (~4196–4207, 4613, 4859: `180` và `+3`) | Có dấu hiệu là quy tắc cố ý (nội dung thông báo "kéo dài 3 phút", comment trích yêu cầu người dùng). Kế hoạch khi có quyết định: thêm `attendance_policies.session_open_minutes` (migration), tách "thời gian mở OTP" với "thời điểm late", truyền `durationSeconds` từ server cho UI, `syncScheduledAttendance` chỉ đóng phiên đúng quy tắc, và chỉ đổi `status='active'` (điều kiện `WHERE status='active'` để không ghi đè phiên đã đóng). |
| ⏸ #7 | `syncScheduledAttendance` chạy trong mọi lần đọc (`listClassSessions`, `getLiveSessionDetails`), nhiều query tuần tự cho mỗi section | như trên | Kế hoạch: (1) xác nhận cron production; (2) gỡ khỏi đường đọc; (3) thêm khóa chống chạy chồng (`pg_try_advisory_lock` không dùng được với neon-http stateless → dùng bảng `job_runs` với `INSERT … ON CONFLICT` theo `(job, minute)`); (4) ghi kết quả vào `audit_logs` hoặc bảng job. Không gỡ khi chưa có cron, vì sẽ mất tính năng tự mở/đóng. |
| ⏸ | Teacher sửa được policy toàn tổ chức | `updateAttendancePolicy`, `PATCH /api/attendance/policy` | Đổi sang `requireAuth('admin')` nếu được xác nhận. |
| ⏸ | Import GV gắn tài khoản đã tồn tại ở tổ chức khác | `lib/auth/users.ts` › `importTeachers` | Báo cáo đã sửa đúng; chính sách liên kết chưa quyết định. |
| ⏸ | WebAuthn attestation `'none'`, chưa đối chiếu SPKI với khóa COSE | `lib/auth/webauthn.ts` › `verifyPasskeyRegistration` | Cần thư viện CBOR hoặc `@simplewebauthn/server`. |
| ⏸ | Ultrasonic chỉ kiểm tra ở client | `lib/attendance/ultrasonic.ts`, `StudentView` | Đề xuất thiết kế: SECURITY_FIX_REPORT §8. |

## Có thể làm ngay
| Mục | Vấn đề | Vị trí |
|---|---|---|
| 🔧🧪 | `lib/rate-limit.test.ts` và `tests/integration/departments-management-suite.test.ts` thiếu `describe.skipIf(!DATABASE_URL)` nên luôn fail khi không có DB | 2 file test |
| 🔧 | Verify đồng thời tạo trùng `attendance_verifications`/`notifications`/`audit_logs` (record vẫn duy nhất) | `verifyAttendance` |
| 🔧 | Đóng phiên bằng `expired` không gọi `finalizeAbsentRecords` | `transitionSessionState` |
| 🔧 | `suspicious_attempts` gần như không bao giờ được tạo (nhánh đã bị `allowed:false` chặn) | `verifyAttendance` + `evaluateDevicePolicy` |
| 🔧 | Múi giờ: sync dùng UTC+7 thủ công, finalize và leave dùng ngày UTC; so khớp ngày bằng `includes` | `finalizeAbsentRecords`, `updateLeaveRequestStatus` |
| 🔧 | Cảnh báo cấm thi gửi lặp mỗi lần vắng thêm (≥3 buổi) | `finalizeAbsentRecords` |
| 🔧 | Thiếu index: `attendance_verifications(attendance_record_id)`, `suspicious_attempts(organization_id,status)`, `leave_requests(course_id)` | `lib/db/schema.ts` |
| 🔧 | Thiếu zod: `PATCH /api/courses/:id`, `POST /api/notifications` | route tương ứng |
| 🔧 | Bảng `rate_limits` (nay chứa thêm nonce WebAuthn) và `auth_sessions` không được dọn khi hết hạn | thêm job dọn dẹp |
| 🔧 | `registerAdministrator`, `importStudents`: ghi nhiều bước, không có transaction | cân nhắc `neon-serverless` Pool (WebSocket) cho các luồng này |
| 🔧 | Code chết cho vai trò `'staff'` | `enrollStudentsToSection`, `removeStudentFromSection`, `app/api/reports/*` |
| 🔧 | File UI ~7.500 dòng | `components/smart-attend.tsx`; kế hoạch tách: AI_HANDOFF §6.1 |
| 🔧 | `clientIp` tin `x-vercel-forwarded-for` / `cf-connecting-ip` ngay cả khi không chạy sau nền tảng đó | `lib/rate-limit.ts` |
| 🔧 | OAuth tự liên kết theo email khi tenant là `common` | `app/api/auth/microsoft/callback/route.ts` |
| 🔧 | Xóa cột `attendance_challenges.code` (sau khi bản phát hành mới ổn định) | migration tương lai |
