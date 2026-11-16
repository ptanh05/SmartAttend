# SmartAttend — Independent Security Review

> Ngày: 2026-11-14 · Phạm vi: **toàn bộ** `app/api/**`, `lib/auth/**`, `lib/attendance/**`, `proxy.ts`, `scripts/seed.ts`, kể cả các route không có trong danh sách lỗi ban đầu. Code được đọc lại như một auditor không tin vào các bản sửa trước.
> Trạng thái: **FIXED (local, chưa deploy)** · **OPEN** · **ACCEPTED-RISK (chờ chủ dự án)** · **PASS**.
> Test "đã chạy" là test unit (không cần DB). Test integration đã viết nhưng **chưa chạy** (BLOCKED: chưa có DB test riêng).

## A. Kiểm tra lại các bản sửa trước (không tin báo cáo cũ)
| Bản sửa | Kiểm tra lại | Kết luận |
|---|---|---|
| Lộ OTP giữa GV | Mọi chỗ gọi `listClassSessions`: 3 route (`sessions`, `courses/sections`, `dashboard`) đều dùng `classSessionScopeFor`; mặc định `revealChallenges: false`; mã chỉ nạp cho phiên live thuộc các section đã lọc phạm vi. `getLiveSessionDetails`, `rotateChallengeForSession`, `transitionSessionState` đều kiểm tra tổ chức và quyền sở hữu. | PASS (code). Test integration: viết xong, chưa chạy. |
| Roster IDOR | `assertCanManageSection` có trong `listSectionStudents` và `searchAvailableStudentsForSection`; `PATCH`/`DELETE` section và enroll/remove vốn đã kiểm tra quyền. | PASS (code) |
| Fail-open ở suspicious | `!target.course` → teacher bị từ chối | PASS |
| Import tenant | Tra cứu theo mã SV không phân biệt hoa thường, chỉ thao tác trên membership cùng tổ chức; không sửa `users` đã tồn tại; course/section đích kiểm tra theo tổ chức (`ImportScopeError` → 400) | PASS (code). **Phát hiện bổ sung:** không có transaction, nên lỗi giữa chừng có thể để lại `users` không có membership (xem C-6). |
| OTP plaintext | Không còn đường ghi `code` nào; đọc qua `challengePlaintextFor` (đối chiếu với hash). **Bổ sung đợt này:** khóa HMAC được tách theo mục đích (C-4). | PASS |
| WebAuthn | Origin chỉ lấy từ server; challenge một lần dùng; **đợt trước còn thiếu: chưa ràng buộc public key với khóa COSE** → đợt này đã sửa (C-2). | PASS sau đợt này |
| Race tạo phiên | `ON CONFLICT DO NOTHING` + partial unique index, ở cả `getOrCreateLiveSession` lẫn nhánh auto-start | PASS (code); cần migration 0005 |

## B. Phát hiện mới và trạng thái
| ID | Mức | Vị trí | Điều kiện khai thác | Tác động | Trạng thái và cách sửa | Test |
|---|---|---|---|---|---|---|
| C-1 | **Critical** (vận hành) | `scripts/seed.ts` › `seed()` | Chạy `pnpm db:seed` khi `DATABASE_URL` (hoặc `.env`) trỏ tới production | **Xóa toàn bộ dữ liệu mọi tổ chức**, rồi tạo admin `admin@smartattend.edu.vn` / `12345678` (`mustChangePassword: false`) | **FIXED:** thêm `assertSeedAllowed()`: từ chối khi `NODE_ENV`/`VERCEL_ENV` = production, bắt buộc `SEED_CONFIRM_WIPE_ALL_DATA=yes-wipe-this-database`, từ chối khi `DATABASE_URL` trùng `PRODUCTION_DATABASE_URL` | Không có test tự động (script); kiểm tra bằng review |
| C-2 | **High** | `lib/auth/webauthn.ts` › `verifyPasskeyRegistration` | Client gửi `publicKey` SPKI của một khóa phần mềm khác với khóa trong authenticatorData | Passkey lưu một khóa không phải của authenticator; điểm "sinh trắc học" giả | **FIXED:** `lib/auth/cose.ts` (bộ giải mã CBOR tối thiểu, không thêm dependency) suy ra khóa từ COSE_Key (chỉ ES256/P-256 và RS256 ≥2048 bit); khóa client phải trùng khớp; **lưu khóa suy ra** | `lib/auth/webauthn-registration.test.ts`: thay khóa, sai thuật toán, COSE hỏng (**đã chạy, pass**) |
| C-3 | **High** | `lib/attendance/leave.ts` › `getLeaveRequests`; `GET /api/attendance/leave?studentId=` | Teacher gửi `?studentId=<bất kỳ SV nào trong trường>` | Đọc toàn bộ đơn nghỉ, **kèm ảnh minh chứng y tế**, của SV đó ở mọi môn (nhánh `else if teacher` bị bỏ qua) | **FIXED:** luôn áp điều kiện `courses.teacher_id = auth.userId` cho teacher | Integration "Teacher A cannot read … leave requests" (chưa chạy) |
| C-4 | Medium | `lib/attendance/challenge.ts`, `lib/auth/webauthn.ts`, `lib/attendance/ultrasonic.ts` | Một root secret dùng trực tiếp cho 3 giao thức HMAC | Rủi ro dùng chéo MAC giữa các giao thức (thấp) | **FIXED:** `lib/auth/secrets.ts` › `purposeKey(purpose)`. **Lưu ý triển khai:** mọi WebAuthn challenge đang dùng dở (≤5 phút), acoustic proof (≤60 giây) và mã OTP đang hiển thị đều vô hiệu khi deploy; mã OTP tự xoay lại | Unit test challenge/webauthn (đã chạy) |
| C-5 | **High** | `app/api/auth/microsoft/callback/route.ts` | `MICROSOFT_TENANT_ID` = `common`/`organizations`/trống; kẻ tấn công có tài khoản Microsoft ở tenant khác với `preferred_username` trùng email một user SmartAttend | **Chiếm tài khoản** khi đăng nhập lần đầu (tự liên kết theo email) | **FIXED:** `evaluateMicrosoftIdentity`: kiểm tra `aud`; nếu cấu hình một tenant cụ thể thì `tid` phải khớp; **chỉ tự liên kết theo email khi ở chế độ single-tenant**; email so khớp không phân biệt hoa thường | `lib/auth/oauth.test.ts` (đã chạy, pass) |
| C-6 | Medium | `lib/auth/users.ts` › `importStudents`, `registerAdministrator` | Lỗi mạng hoặc DB giữa các lệnh ghi | Bản ghi mồ côi (`users` không có membership, org không có admin) | **OPEN:** driver `neon-http` không có transaction tương tác. Đề xuất: dùng `neon-serverless` Pool cho riêng hai luồng này | — |
| C-7 | Medium | `lib/attendance/server.ts` › `verifyAttendance` | Nhiều request verify đồng thời của cùng SV | Verification, notification, audit bị trùng; `verifiedAt` bị ghi đè | **FIXED:** một lệnh `INSERT … ON CONFLICT DO UPDATE … WHERE status NOT IN (present,late,excused) RETURNING`; bên thua trả "đã hoàn tất" mà không có hiệu ứng phụ | Integration 20 request đồng thời (chưa chạy) |
| C-8 | Medium | `app/api/auth/microsoft/route.ts` | Thiếu biến `MICROSOFT_*` | HTTP 500 (đang xảy ra trên production) | **FIXED:** `MicrosoftConfigError` → redirect về trang login kèm thông báo; log chỉ ghi **tên** biến thiếu | `oauth.test.ts` (đã chạy) |
| C-9 | Low | `app/api/attendance/verify/route.ts`, `app/api/auth/webauthn/register/route.ts` | Lỗi DB không lường trước | Lộ thông báo lỗi nội bộ (tên constraint, SQL) | **FIXED** ở 2 route này. **OPEN** ở `attendance/policy`, `attendance/suspicious`, `attendance/leave` (POST), `auth/webauthn/challenge`, nơi vẫn trả `error.message` | — |
| C-10 | Medium | `lib/auth/session.ts` › `resolveMembershipForLogin` + login | User có membership ở nhiều tổ chức | Đăng nhập vào tổ chức "đầu tiên" theo thứ tự DB (không xác định) | **OPEN** (cần thiết kế UI chọn tổ chức) | — |
| C-11 | Medium | `updateAttendancePolicy` | Teacher gọi `PATCH /api/attendance/policy` | Đổi TTL OTP hoặc tắt trusted-device cho **cả trường** | **ACCEPTED-RISK, chờ quyết định** | — |
| C-12 | Low | `createCourse` | Teacher tạo môn và gán `teacherId` cho GV khác | Gán việc cho người khác | OPEN (chờ quyết định nghiệp vụ) | — |
| C-13 | Medium | `lib/auth/webauthn.ts` | Attestation `'none'` | Authenticator phần mềm vẫn đăng ký được | **ACCEPTED-RISK, chờ quyết định**. Nếu cần bằng chứng phần cứng: `attestation: 'direct'` + danh sách AAGUID tin cậy (nên dùng `@simplewebauthn/server` + MDS) | — |
| C-14 | **High** (giới hạn thiết kế) | Ultrasonic | — | Không có xác minh phía server | **NOT IMPLEMENTED.** Không được quảng bá là cơ chế đã được bảo mật. Server chỉ ghi `ultrasonic_faceid` khi có cả bằng chứng HMAC lẫn WebAuthn, mà UI không bao giờ gửi bằng chứng HMAC. Đề xuất thiết kế: SECURITY_FIX_REPORT §8 | — |
| C-15 | Low | Login rate limit theo `IP:identifier` | Thử 1 mật khẩu phổ biến cho nhiều tài khoản (password spraying) | Không có giới hạn toàn cục | OPEN. Kết hợp với mật khẩu mặc định đoán được (SV = mã SV, GV = `Gv@123456`) trước khi người dùng đổi → **Medium**. Đề xuất: giới hạn theo IP độc lập với identifier | — |
| C-16 | Low | `next.config.mjs` CSP | — | `script-src 'unsafe-inline'` | OPEN (dùng nonce qua `proxy.ts`) | — |
| C-17 | Low | `auth_sessions`, `rate_limits` | — | Bảng phình to (không dọn bản ghi hết hạn) | OPEN | — |

## C. Hạng mục đã rà và đạt (PASS)
- **CSRF:** `proxy.ts` chặn cross-site và Origin lạ (đã kiểm chứng trên production); client gửi `x-csrf-token`; passkey register đã có header.
- **Cookie:** `smartattend_session` HttpOnly, SameSite=Lax, Secure khi production.
- **Session:** token 32 byte, lưu SHA-256; đổi mật khẩu thu hồi mọi phiên (`changeUserPassword`); admin reset thu hồi phiên của SV.
- **XSS:** chỉ có một `dangerouslySetInnerHTML` (SVG QR từ thư viện `qrcode` với giá trị do server sinh, qua `sanitizeSvg`).
- **CSV/Excel injection:** `escapeCsvCell` chặn tiền tố `= + - @`.
- **Open redirect:** mọi redirect dùng path cố định (`PORTAL_LOGIN`/`PORTAL_HOME`) + `url.origin`.
- **Mass assignment:** các route ghi đều whitelist field qua zod. Ngoại lệ không gây hại: `PATCH /api/courses/:id` chỉ đọc `teacherId`, chỉ admin.
- **Notifications:** đọc và đánh dấu đã đọc đều lọc `organizationId` + `userId`.
- **Records:** teacher bị giới hạn theo section mình sở hữu, kể cả khi truyền `studentId`.
- **Cron:** so sánh secret constant-time; tắt hẳn khi thiếu `CRON_SECRET`.
- **OTP brute-force:** 32⁶ ≈ 1,07 tỷ tổ hợp, TTL 30 giây, giới hạn 5 lần/phút cho mỗi IP+user.

## D. Kết luận review
Không còn lỗi Critical/High **ở mức code** mà chưa có bản sửa, ngoại trừ: C-14 (ultrasonic: giới hạn thiết kế, chưa triển khai) và hai mục chờ chính sách (C-11, C-13). **Chưa có bản sửa nào được kiểm chứng bằng test integration trên DB thật**, và chưa có bản sửa nào trên production.
