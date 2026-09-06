# BÁO CÁO TOÀN DIỆN VỀ DỰ ÁN SMARTATTEND (FINAL AUDIT)

**Ngày thực hiện:** 05/09/2026  
**Người thực hiện:** Senior Full-Stack & Security Engineer  
**Trạng thái kiểm tra:** Hoàn thành rà soát toàn bộ source code, API routes, database schema, authentication, attendance engine, client-side biometrics & ultrasonic, rate limiting, permissions và testing.

---

## I. KIẾN TRÚC TỔNG THỂ & 18 ĐẶC TẢ KỸ THUẬT CỐT LÕI

### 1. Framework & Version
- **Framework:** Next.js `16.3.0` (Turbopack, App Router, React Server & Client Components).
- **Core UI Library:** React `19.x`, React DOM `19.x`.
- **Styling:** Tailwind CSS `4.3.3` (`@tailwindcss/postcss`), Lucide React `1.16.0`.
- **Runtime Target:** Node.js `v24.x` / Vercel Serverless Functions.

### 2. Database & ORM
- **Database Engine:** Neon Serverless PostgreSQL (`@neondatabase/serverless` `^1.1.0`) hosted on AWS `ap-southeast-1`.
- **ORM:** Drizzle ORM (`drizzle-orm` `^0.45.2`, `drizzle-kit` `^0.31.10`) với driver HTTP connection pooler (`drizzle-orm/neon-http`).
- **Cold Start Resilience:** Tích hợp auto-retry fetch wrapper (thử lại tối đa 3 lần với backoff 500ms, 1000ms) khi compute instance của Neon khởi động lại.
- **Data Schema:** Gồm 21 bảng quan hệ định nghĩa trong [lib/db/schema.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/db/schema.ts):
  `organizations`, `users`, `organization_memberships`, `auth_sessions`, `departments`, `courses`, `course_sections`, `class_enrollments`, `attendance_sessions`, `attendance_challenges`, `attendance_records`, `attendance_verifications`, `devices`, `suspicious_attempts`, `notifications`, `attendance_policies`, `audit_logs`, `leave_requests`, `user_passkeys`, `rate_limits`, `external_accounts`.

### 3. Authentication Architecture
- **Mật khẩu chuẩn (Username/Password):** 
  - Đăng nhập bằng Email (giảng viên/quản trị/sinh viên) hoặc Mã sinh viên (`studentCode`).
  - Mật khẩu lưu trữ băm một chiều qua `bcryptjs` (salt rounds = 10).
- **Microsoft 365 / Microsoft Entra ID (SSO OAuth/OIDC):**
  - Sử dụng thư viện chuẩn `arctic` (`MicrosoftEntraId`).
  - Hỗ trợ luồng Authorization Code Flow với PKCE (`code_verifier`, `state` lưu cookie HttpOnly).
  - Liên kết tài khoản Microsoft thông qua bảng `external_accounts` (`provider = 'microsoft'`, `provider_account_id = oid`).
- **Phân tách cổng:** Cổng sinh viên (`/student/login`) và cổng cán bộ (`/staff/login`).

### 4. Session Mechanism
- **Cơ chế:** Stateful Sessions lưu trong bảng `auth_sessions`.
- **Token sinh:** Chuỗi ngẫu nhiên 32 bytes (`randomBytes(32).toString('hex')`).
- **Lưu trữ database:** Lưu hash SHA-256 (`token_hash`) của token, không lưu plain token.
- **Cookie truyền tải:** Cookie `smartattend_session`, cấu hình:
  - `httpOnly: true` (chống trộm token qua XSS).
  - `secure: true` khi ở `NODE_ENV === 'production'`.
  - `sameSite: 'lax'` (hạn chế CSRF).
  - `path: '/'`.
  - Thời hạn: 7 ngày (`maxAge = 7 * 24 * 3600`).
- **Thu hồi phiên (Revocation):** Xóa dòng trong `auth_sessions` khi logout hoặc khi tài khoản bị khóa (`users.disabled_at`).

### 5. Role-Based Access Control (RBAC)
- 3 vai trò chính: `'student'`, `'teacher'`, `'admin'`.
- Kiểm tra quyền tập trung trên backend qua `requireAuth(['teacher', 'admin'])` trong [lib/auth/context.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/auth/context.ts).
- Admin có quyền tối cao (bypass vai trò trong `requireAuth`).
- Client-side navigation tuân theo `canAccessRole` trong [lib/auth/routing.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/auth/routing.ts).

### 6. Multi-Tenancy
- Mô hình Shared Database, Tenant Isolation dựa trên `organization_id`.
- Hầu hết các bảng dữ liệu nghiệp vụ đều có cột `organization_id` tham chiếu `organizations.id`.
- Các query select/update/delete đều gán điều kiện `eq(table.organizationId, auth.organizationId)`.
- Ràng buộc unique index theo tổ chức: `(organization_id, user_id)`, `(organization_id, student_code)`, `(organization_id, code)`.

### 7. Attendance State Machine
- Trạng thái phiên: `draft` | `scheduled` | `active` (live) | `paused` | `closed` | `expired`.
- Quy tắc chuyển đổi định nghĩa tại [lib/attendance/session-state.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/attendance/session-state.ts):
  - `draft` / `scheduled` → `active`.
  - `active` / `live` → `paused`, `closed`, `expired`.
  - `paused` → `active`, `closed`, `expired`.
  - `closed` / `expired`: Trạng thái kết thúc, không thể kích hoạt lại.
- Khi đóng phiên (`closed`): Server tự động chạy `finalizeAbsentRecords` chốt vắng cho sinh viên trong danh sách lớp mà không điểm danh.

### 8. Attendance Verification Flow
- Giảng viên khởi tạo phiên điểm danh → Server sinh mã Challenge 6 ký tự (`attendance_challenges`).
- Mã Challenge được lưu cả `code` (plain text) và `valueHash` (SHA-256) với `sequence` tăng dần và thời gian hết hạn `expiresAt = now + challengeTtlSeconds`.
- Sinh viên gửi yêu cầu xác thực điểm danh qua `POST /api/attendance/verify` gồm: `code`, `device`, `method`, `ultrasonicVerified`, `biometricVerified`.
- Server kiểm tra:
  1. Phiên học đang ở trạng thái `active`.
  2. Sinh viên đã đăng ký (`class_enrollments`) vào lớp học phần tương ứng.
  3. Mã Challenge còn hiệu lực (`expiresAt > now`).
  4. Mã khớp với `valueHash` (chống brute-force, timing-safe).
  5. Tính toán đi học muộn (`late`) dựa trên `session.startedAt + lateAfterMinutes`.
  6. Ghi nhận `attendance_records` và `attendance_verifications`.

### 9. Microsoft SSO Flow
- Endpoint khởi tạo: `GET /api/auth/microsoft` sinh `state` + `code_verifier` (PKCE) gửi sang Microsoft Entra ID.
- Callback: `GET /api/auth/microsoft/callback`:
  - Kiểm tra `state` khớp cookie.
  - Gọi Microsoft token endpoint đổi `code` lấy tokens.
  - Lấy `oid` và `email` từ ID token.
  - Tìm trong `external_accounts` hoặc bảng `users`.
  - Nếu user tồn tại: tạo session và set cookie.

### 10. WebAuthn Flow
- Hỗ trợ xác thực sinh trắc học thiết bị native (Face ID / Touch ID / Windows Hello) thông qua API `PublicKeyCredential`.
- Backend endpoints:
  - `GET /api/auth/webauthn/challenge`: Sinh challenge ngẫu nhiên 32 bytes base64url.
  - `POST /api/auth/webauthn/register`: Lưu trữ thông tin passkey vào `user_passkeys`.

### 11. Ultrasonic Flow
- **Giảng viên (Phát tín hiệu):** Sử dụng Web Audio API `OscillatorNode` (sóng sine, tần số mặc định 18.75 kHz) phát ra loa phòng học với bộ đệm mềm (smooth ramp) tránh tiếng click.
- **Sinh viên (Thu nhận):** Thu âm qua microphone bằng `getUserMedia` (tắt lọc ồn `noiseSuppression: false`, tắt khử vang `echoCancellation: false`), phân tích FFT qua `AnalyserNode` (fftSize = 4096).
- Đo tỉ số năng lượng giữa tần số 18.75 kHz so với tạp âm nền xung quanh (tỉ số > 1.8 và peak > 35 trên 25% số frame thì xác nhận có mặt trong phòng).

### 12. Device Trust Policy
- Lưu danh sách thiết bị từng dùng của sinh viên trong bảng `devices`.
- [lib/attendance/device-policy.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/attendance/device-policy.ts) chấm điểm tin cậy `verificationScore` (0-100) và đánh dấu `suspicious` nếu tổ chức yêu cầu thiết bị tin cậy (`requireTrustedDevice = true`) nhưng sinh viên dùng thiết bị chưa xác thực.

### 13. Rate Limiting
- Class `RateLimiter` trong [lib/rate-limit.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/rate-limit.ts) sử dụng bảng `rate_limits` của PostgreSQL (`insert ... on conflict do update`).
- **Ưu điểm:** Bền vững trên môi trường Serverless (Vercel), không bị mất trạng thái khi lambda khởi động lại.
- Áp dụng:
  - `loginLimiter`: Tối đa 10 lần sai trong 15 phút theo IP + Login ID.
  - `verifyLimiter`: Tối đa 5 lần thử điểm danh trong 1 phút theo IP + User ID.

### 14. Suspicious Attempt Handling
- Các lần điểm danh vi phạm chính sách thiết bị được ghi nhận vào bảng `suspicious_attempts`.
- Giảng viên/Quản trị viên có thể duyệt (`approved` → tăng score lên 90) hoặc bác bỏ (`dismissed` → đổi trạng thái điểm danh sang `absent`, score 0).

### 15. Leave Approval Flow
- Sinh viên gửi đơn nghỉ phép: `POST /api/attendance/leave`.
- Giảng viên/Quản trị viên duyệt đơn: `PATCH /api/attendance/leave`.
- Khi đơn được chấp thuận (`approved`): Server tự động cập nhật bản ghi điểm danh tương ứng sang trạng thái `excused` (Có phép) với điểm xác minh 100%.

### 16. Notification Flow
- Bảng `notifications` lưu trữ thông báo cho người dùng (kết quả điểm danh, thông báo duyệt đơn nghỉ phép).
- Người dùng nhận danh sách thông báo và đánh dấu đã đọc qua `POST /api/notifications`.

### 17. Phân quyền Giảng viên / Quản trị viên / Sinh viên
- Sinh viên: Chỉ xem lịch học của bản thân, điểm danh cho chính mình, gửi đơn nghỉ phép của mình, xem lịch sử điểm danh và thiết bị của mình.
- Giảng viên: Tạo môn học, mở/đóng phiên điểm danh, xoay mã QR/OTP, duyệt đơn nghỉ phép, xem báo cáo điểm danh, cấu hình chính sách điểm danh.
- Quản trị viên: Quản lý toàn bộ danh sách khoa, tài khoản người dùng, xem audit log hệ thống.

### 18. Production Deployment Architecture
- Deploy trên nền tảng Vercel Serverless.
- Database: Neon PostgreSQL Serverless tại Region Singapore (`ap-southeast-1`).
- Turbopack tối ưu hóa tốc độ build và kích thước bundle.

---

## II. DANH SÁCH CHỨC NĂNG ĐÃ HOÀN THÀNH & HOẠT ĐỘNG TỐT

1. **Authentication:** Đăng nhập mật khẩu chuẩn với email và mã sinh viên, hashing mật khẩu `bcryptjs`, cookie an toàn `HttpOnly` + `SameSite: Lax`.
2. **Attendance Core Lifecycle:** Khởi tạo lớp học phần, tạo phiên, bắt đầu phiên, xoay mã challenge, tạm dừng, đóng phiên, chốt vắng tự động.
3. **Mã QR & OTP:** Sinh mã ngẫu nhiên an toàn, lưu database tập trung, cơ chế đếm lùi và xoay mã đồng bộ, không bị nhảy giật liên tục trên Vercel.
4. **Đi học muộn (Late Attendance):** Đã tính toán và đối chiếu chuẩn xác với `attendance_policies.late_after_minutes`.
5. **Đơn xin nghỉ phép & Tự động Excused:** Sinh viên gửi đơn, giảng viên duyệt, tự động đồng bộ sang bản ghi điểm danh `excused`.
6. **Báo cáo & Xuất dữ liệu:** Xuất báo cáo điểm danh và audit log ra định dạng CSV chuẩn RFC 4180.
7. **Đa ngôn ngữ (i18n):** Hỗ trợ chuyển đổi mượt mà Tiếng Việt và Tiếng Anh (`vi` / `en`).
8. **Chế độ máy chiếu (Projector Mode):** Trình chiếu mã QR full-screen kích thước lớn cho giảng đường.

---

## III. CÁC LỖ HỔNG BẢO MẬT & VẤN ĐỀ NGUY HIỂM (SECURITY AUDIT)

### 🔴 P0 — BẢO MẬT CỰC KỲ NGUY HIỂM (CRITICAL)

1. **Rò rỉ Secret & Database Credentials trong Git History:**
   - Trong các commit cũ (`275c5c9`, `9be64d5`), connection string Neon Database (`postgresql://neondb_owner:...`) và API key đăng ký giảng viên đã từng bị commit vào git repository.
   - **Hành động bắt buộc:** Cần thông báo cho người dùng xoay/thay đổi mật khẩu Neon DB user `neondb_owner` và thay đổi `TEACHER_REGISTRATION_API_KEY` mới ngay lập tức trên Vercel.

2. **Xác thực Client-Side Biometrics & Ultrasonic không có chữ ký Server (Spoofing 100% Score):**
   - Trong [lib/attendance/server.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/attendance/server.ts#L404), server kiểm tra:
     ```ts
     const isUltrasonicBiometric = Boolean(options?.ultrasonicVerified && options?.biometricVerified)
     const verificationScore = isUltrasonicBiometric ? 100 : normalizeScore(deviceDecision.score)
     ```
   - Bất kỳ ai gửi trực tiếp HTTP request JSON `{ "ultrasonicVerified": true, "biometricVerified": true }` đều được server tin tưởng và cho điểm xác thực tuyệt đối 100%!
   - **Bản chất:** Hệ thống không hề kiểm tra chữ ký số mật mã học của WebAuthn Assertion hay token siêu âm động.
   - **Nguy cơ:** Sinh viên ngồi ở nhà chỉ cần dùng curl hoặc script gửi kèm 2 flag này là qua mặt hoàn toàn hệ thống.

3. **WebAuthn Challenge lưu trong bộ nhớ RAM tạm thời (In-Memory Map):**
   - Trong [lib/auth/webauthn.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/auth/webauthn.ts#L8):
     `const activeChallenges = new Map<string, { challenge: string; expiresAt: number }>()`
   - Trên Vercel Serverless, khi gọi API lấy challenge ở lambda 1 và gửi đăng ký passkey ở lambda 2, challenge trong RAM bị mất dẫn đến lỗi hoặc bypass.
   - Hơn nữa, API `/api/auth/webauthn/register` **hoàn toàn không kiểm tra challenge** trước khi lưu passkey vào database!

4. **Credential Hijacking trong WebAuthn Registration:**
   - Trong [lib/auth/webauthn.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/lib/auth/webauthn.ts#L39), khi lưu passkey:
     Nếu `credentialId` đã tồn tại, code cập nhật bản ghi đó mà **không kiểm tra `userId` có khớp hay không**. User B có thể ghi đè public key của User A.

---

### 🟠 P1 — LỖ HỔNG PHÂN QUYỀN (AUTHORIZATION & ACCESS CONTROL)

5. **Thiếu Horizontal Scoping cho Giảng viên (IDOR):**
   - Giảng viên A có thể duyệt/từ chối đơn xin nghỉ phép (`/api/attendance/leave`) của môn học do Giảng viên B phụ trách.
   - Giảng viên A có thể xem và xử lý các cảnh báo gian lận (`/api/attendance/suspicious`) của môn học Giảng viên B.
   - Giảng viên A có thể xem danh sách lớp học phần (`/api/courses/sections`) và xoá/sửa ca học của Giảng viên B.

6. **Lỗi chuyển hướng và xử lý tài khoản trong Microsoft OAuth Callback:**
   - Trong [app/api/auth/microsoft/callback/route.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/app/api/auth/microsoft/callback/route.ts):
     - Khi có lỗi, route redirect về `/auth/login?error=...` — trang này không tồn tại trong hệ thống (dẫn đến 404 Not Found).
     - Khi đăng nhập thành công vai trò cán bộ, route redirect về `/dashboard` (không tồn tại, phải là `/teacher/dashboard` hoặc `/admin/dashboard`).
     - Khi tìm thấy liên kết trong `external_accounts`, code lại tìm membership bằng `email` thay vì `userIdToLogin` lấy từ liên kết.
     - Chưa kiểm tra ràng buộc Tenant ID khi tài khoản đăng nhập từ tenant Microsoft khác.

7. **Rò rỉ thông tin lỗi máy chủ (Error Leakage):**
   - Trong [app/api/auth/register/route.ts](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/app/api/auth/register/route.ts#L35):
     `return NextResponse.json({ ok: false, message: 'Unable to register right now.', detail }, { status: 500 })`
     Biến `detail` chứa toàn bộ stack trace hoặc thông tin database error trả về client.

8. **Thiếu Transaction trong các thao tác dữ liệu phụ thuộc:**
   - Phê duyệt đơn nghỉ phép: Update bảng `leave_requests` và insert/update bảng `attendance_records` diễn ra độc lập. Nếu bước 2 lỗi, dữ liệu bị bất đồng bộ nghiêm trọng.

---

### 🟡 P2 — VẤN ĐỀ CHỨC NĂNG & RATE LIMITING

9. **Device Trust giả định (Không có Hardware Fingerprint thực sự):**
   - Thiết bị chỉ được định danh bằng chuỗi `deviceLabel` (User-Agent lấy từ trình duyệt).
   - Bất kỳ thiết bị mới nào gửi yêu cầu điểm danh đều lập tức được lưu vào database với `trusted: true`. Vì vậy, cơ chế "chặn thiết bị lạ" bị vô hiệu hóa trên thực tế.
   - Giao diện tuyên bố "Chuẩn FIDO2 & Hardware Fingerprint 100%" là không đúng với thực tế mã nguồn.

10. **Thiếu Rate Limiting ở các API nhạy cảm:**
    - `/api/auth/register` (đăng ký giảng viên): Không có rate limit, có thể bị spam vét cạn API key.
    - `/api/auth/change-password`: Không có rate limit chống brute-force mật khẩu cũ.
    - `/api/users/import`: Không có rate limit chống spam chèn sinh viên ồ ạt.
    - `/api/attendance/sessions/[id]` (rotate mã): Không có rate limit chống spam đổi mã liên tục làm nghẽn hệ thống.

---

### 🟢 P3 — VẤN ĐỀ TRẢI NGHIỆM NGƯỜI DÙNG & TỐI ƯU (UX & CLEANUP)

11. **Client Polling tải nặng:**
    - Client gọi `loadDashboard` mỗi 3 giây thực hiện 10 request API đồng thời (`Promise.all`). Cần xem xét gom nhóm hoặc chỉ poll endpoint cần thiết (như `/api/attendance/sessions` khi có phiên live).
12. **Mô tả tính năng trên giao diện gây hiểu lầm:**
    - Tuyên bố "Sóng siêu âm phòng học và Face ID chống gian lận 100%" cần được giải thích chính xác theo bản chất: Đây là các yếu tố tăng cường bằng chứng hiện diện (presence indicators), không thể tuyên bố chống gian lận tuyệt đối nếu client có thể can thiệp.

---

## IV. ĐÁNH GIÁ MỨC ĐỘ SẴN SÀNG PRODUCTION (PRODUCTION STATUS)

```
[X] NOT READY (CHƯA SẴN SÀNG TRIỂN KHAI PRODUCTION)
[ ] READY WITH WARNINGS
[ ] PRODUCTION READY
```

### Lý do chưa thể Production-Ready ngay:
1. Còn tồn tại lỗ hổng P0 về việc client có thể tự gửi flag `ultrasonicVerified: true` và `biometricVerified: true` để lấy điểm 100% mà không qua kiểm tra thực tế trên server.
2. Endpoint Microsoft OAuth Callback redirect vào đường dẫn 404 và chưa xác thực tenant chặt chẽ.
3. WebAuthn challenge đang lưu trong bộ nhớ RAM, không hoạt động ổn định trên môi trường Serverless đa container.
4. Thiếu kiểm tra phân quyền ngang (Horizontal Scoping) giữa các giảng viên trong cùng tổ chức.
5. Lộ thông tin lỗi hệ thống (`detail`) trong response API đăng ký.
6. Cần thực hiện các bài kiểm tra toàn diện API backend (Security Tests) trước khi bàn giao.

---

## V. KẾ HOẠCH HÀNH ĐỘNG KHẮC PHỤC (ACTION PLAN THEO THỨ TỰ ƯU TIÊN)

### Giai đoạn 1: Khắc phục triệt để các lỗi P0 (Bảo mật & Tính toàn vẹn)
1. Cập nhật logic `verifyAttendance` trên server:
   - Xóa bỏ việc client tự truyền flag boolean `ultrasonicVerified` và `biometricVerified` để lấy 100% điểm.
   - Điểm xác minh phải dựa trên các yếu tố có thể kiểm chứng khách quan (thời gian hợp lệ, challenge sequence, device history).
   - Làm rõ bản chất của WebAuthn và Ultrasonic là kiểm tra hỗ trợ trên thiết bị của sinh viên.
2. Chuyển đổi lưu trữ WebAuthn Challenge sang database hoặc HMAC signed state có TTL để tương thích hoàn toàn với kiến trúc Serverless Vercel.
3. Bắt buộc kiểm tra `userId` khi lưu passkey để ngăn chặn việc ghi đè hoặc đánh cắp credential.
4. Báo cáo danh sách credentials cần rotate trên Neon DB và Vercel.

### Giai đoạn 2: Khắc phục các lỗi P1 (Phân quyền & Luồng nghiệp vụ)
1. Sửa lỗi đường dẫn redirect trong `app/api/auth/microsoft/callback/route.ts` về đúng `/student/login` hoặc `/staff/login`, redirect thành công về `/teacher/dashboard` hoặc `/admin/dashboard`.
2. Kiểm tra chặt chẽ Microsoft Tenant ID nếu cấu hình yêu cầu giới hạn tenant trường học.
3. Thêm phân quyền ngang (Horizontal Scoping): Giảng viên chỉ được xem và duyệt đơn nghỉ phép, danh sách cảnh báo gian lận của các môn học do chính mình giảng dạy (trừ Admin).
4. Loại bỏ trường `detail` trong catch block của `app/api/auth/register/route.ts`.
5. Đóng gói các thao tác duyệt đơn nghỉ phép vào database transaction.

### Giai đoạn 3: Khắc phục các lỗi P2 (Device Trust, Rate Limit)
1. Bổ sung rate limit cho `/api/auth/register`, `/api/auth/change-password`, `/api/attendance/sessions/[id]`.
2. Chuẩn hóa logic Device Trust: Không tự động đánh dấu `trusted: true` cho mọi User-Agent mới; lưu device token an toàn trong cookie/storage.
3. Điều chỉnh text mô tả trên giao diện (xóa bỏ từ ngữ "chống gian lận 100%" gây hiểu lầm).

### Giai đoạn 4: Viết bộ test bảo mật chuyên sâu (Security Test Suite)
- Bổ sung các bài test tự động cho:
  - Unauthorized role access.
  - Teacher A accessing Teacher B's leave requests & suspicious attempts.
  - Microsoft OAuth callback handling.
  - WebAuthn registration verification.
  - Spoofed biometric/ultrasonic flags.
  - Brute-force & replay challenge attacks.
  - Race condition check-in.

---

Báo cáo này là cơ sở vững chắc để bước vào các Phase tiếp theo nhằm đưa SmartAttend đạt chuẩn **Production-Ready** thực sự.
