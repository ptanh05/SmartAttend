# SmartAttend — API Documentation (bản thay đổi)

> Danh mục đầy đủ các endpoint: [AI_HANDOFF.md](AI_HANDOFF.md) Phần 7. File này ghi lại **hành vi đã thay đổi** trong đợt sửa ngày 2026-11-14 ([SECURITY_FIX_REPORT.md](SECURITY_FIX_REPORT.md)). Các endpoint không có ở đây giữ nguyên hành vi.

## Phạm vi dữ liệu phiên học
Áp dụng cho `GET /api/attendance/sessions`, `GET /api/courses/sections`, `GET /api/dashboard`. Phạm vi được quyết định bởi `classSessionScopeFor(auth)` trong `lib/attendance/server.ts`.

| Vai trò | `sessions[]` / `sections[]` | `challenge` |
|---|---|---|
| student | Chỉ các section đã ghi danh (active) | Luôn là `"------"` |
| teacher | **Chỉ section của course mình dạy** (trước đây: toàn tổ chức) | Mã thật của phiên live thuộc section đó; còn lại `"------"` |
| admin | Toàn bộ section trong tổ chức của mình | Mã thật của phiên live trong tổ chức |

## `GET /api/courses/sections/:id` và `GET /api/courses/sections/:id/students[?search=]`
- **Mới:** teacher phải là giảng viên của course chứa section đó.
- `403 { ok:false, message:"Forbidden: You can only access sections of courses you teach." }` khi không có quyền; `404 { ok:false, message:"Section not found." }` khi section không thuộc tổ chức.
- `PATCH`/`DELETE` trên cùng route giữ nguyên hành vi (vốn đã kiểm tra quyền sở hữu).

## `POST /api/users/import`
- **Mới:** `courseId` không thuộc tổ chức → `400 { ok:false, message:"Học phần không tồn tại hoặc không thuộc tổ chức của bạn." }` (trước đây import vẫn chạy).
- `skipped[].reason` có thêm các giá trị:
  - `"Mã sinh viên đã được đăng ký ở một tổ chức khác."`
  - `"Mã sinh viên đã tồn tại trong tổ chức."`
  - `"Email <email> đã được sử dụng bởi một tài khoản khác trong tổ chức."`
  - `"Email <email> đã thuộc về một tài khoản khác trong hệ thống."`
- Tài khoản đã tồn tại **không bao giờ** bị đổi mật khẩu hay tên.

## `POST /api/users/import-teachers`
- `created[].defaultPassword` của tài khoản đã tồn tại (ở tổ chức khác) giờ là `"(Tài khoản đã tồn tại - giữ mật khẩu hiện có)"`.

## `POST /api/auth/webauthn/register` (thay đổi hợp đồng)
- Yêu cầu: `requireAuth()` và header `x-csrf-token` (proxy CSRF, như mọi request thay đổi dữ liệu khác).
- Body (zod):
```json
{
  "credentialId": "base64url",
  "publicKey": "-----BEGIN PUBLIC KEY----- … (SPKI PEM, EC hoặc RSA)",
  "challenge": "chuỗi lấy từ GET /api/auth/webauthn/challenge (dùng 1 lần)",
  "clientDataJSON": "base64url — type phải là webauthn.create",
  "authenticatorData": "base64url — từ response.getAuthenticatorData()",
  "deviceLabel": "tùy chọn, ≤120 ký tự"
}
```
- `200 { ok:true, passkeyId }` · `400 { ok:false, message }` (lý do xác minh cụ thể) · `401/403/428` theo `AuthError`.

## `POST /api/attendance/verify`
- Hợp đồng request/response không đổi.
- `webauthnAssertion.origin` **bị bỏ qua**; origin mong đợi lấy từ `WEBAUTHN_ORIGIN` hoặc `NEXT_PUBLIC_APP_URL`. `clientDataJSON.origin` bắt buộc phải có.
- Mỗi WebAuthn challenge chỉ dùng được một lần. Dùng lại → `400 "WebAuthn challenge has already been used."`.
- `attendance_verifications.method` do server quyết định (`ultrasonic_faceid` chỉ khi cả WebAuthn và acousticProof đều đã được xác minh); `method` client gửi được lưu vào `metadata.clientClaimedMethod`.

## `PUT /api/attendance/sessions`
- Hợp đồng không đổi. Sau migration 0005, nhiều request đồng thời cho cùng một section trả về **cùng một** `sessionId`.
