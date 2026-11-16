# SmartAttend — Báo cáo sửa lỗi bảo mật & lỗi nghiêm trọng

> Ngày: 2026-11-14 · Nhánh: `huy` (dựa trên commit `0a89980`) · Trạng thái: **chưa commit, chưa migrate DB nào**
> Tài liệu nền: [AI_HANDOFF.md](AI_HANDOFF.md). Nợ kỹ thuật còn lại: [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).

## Tóm tắt

| # | Lỗi | Mức | Trạng thái |
|---|---|---|---|
| 1 | Giảng viên xem được mã OTP và phiên của giảng viên khác | Critical | ✅ Đã sửa |
| 2 | Phiên tự đóng sau 3 phút, mâu thuẫn với ngưỡng đi muộn 10 phút | Critical | ⏸ **Dừng ở bước lập kế hoạch, chờ chủ dự án quyết định** |
| 3 | Import sinh viên vượt tenant, ghi đè mật khẩu | High | ✅ Đã sửa |
| 4 | OTP lưu plaintext | High | ✅ Đã sửa (cần chạy migration 0004) |
| 5a | WebAuthn: origin do client quyết định, challenge dùng lại được, đăng ký không xác minh | High | ✅ Đã sửa phần không phụ thuộc chính sách; ⏸ chính sách attestation chờ quyết định |
| 5b | WebAuthn: thiếu CSRF header khi đăng ký passkey | High | ✅ Đã sửa |
| 5c | Ultrasonic chỉ kiểm tra ở client, nhưng server lại lưu method do client khai | High | 🟡 Đã ngừng ghi nhận claim sai; xác minh server-side chưa khả thi (xem mục 8) |
| 6 | Race condition khi tạo phiên | Medium/High | ✅ Đã sửa (cần chạy migration 0005) |
| 7 | Đồng bộ lịch chạy trên mỗi lần polling | Medium | ⏸ Chưa thay đổi, phụ thuộc cấu hình cron production |
| + | Teacher xem roster lớp không phải của mình | High | ✅ Đã sửa |
| + | Teacher xử lý được cảnh báo không gắn với khóa học nào (fail-open) | Medium | ✅ Đã sửa |
| + | Import giảng viên báo sai "mật khẩu mặc định" cho tài khoản đã tồn tại | Medium | ✅ Đã sửa phần báo cáo; ⏸ chính sách liên kết tài khoản liên tổ chức chờ quyết định |

---

## 1. Lỗi đã sửa và nguyên nhân gốc

### 1.1 [Critical] Lộ OTP và phiên giữa các giảng viên (IDOR)
- **Nguyên nhân gốc:** `listClassSessions(org, studentId?, teacherId?)` tự suy ra quyền xem mã từ `isStudent = Boolean(studentId)`. Caller nào không truyền `studentId` (route `GET /api/attendance/sessions` khi người gọi là teacher, `GET /api/courses/sections`) thì nhận **mã rõ của mọi phiên live trong tổ chức**, kèm toàn bộ section của tổ chức.
- **Cách sửa:**
  - Thêm `ClassSessionListOptions.revealChallenges`, **mặc định `false`**.
  - Mã chỉ được nạp cho các phiên live thuộc những section đã có trong danh sách đã lọc phạm vi.
  - Thêm `classSessionScopeFor(auth)`: student được lọc theo enrollment và không thấy mã; teacher được lọc theo course mình dạy; admin thấy toàn tổ chức của mình.
  - Mọi route liệt kê phiên đều chuyển sang dùng hàm này: `app/api/attendance/sessions`, `app/api/courses/sections`, `app/api/dashboard` (cả 3 nhánh vai trò).
- **Các endpoint đã rà lại (vốn đã kiểm tra quyền sở hữu, giữ nguyên):** `GET /api/attendance/sessions/:id` (`getLiveSessionDetails` lọc theo `teacherId`/`courses.teacherId`), `POST /api/attendance/sessions/:id` (`transitionSessionState`, `rotateChallengeForSession`), `POST/PATCH /api/attendance/records` (`manualCheckInStudent`, `overrideRecordStatus`), `GET /api/reports/attendance`, `PATCH /api/attendance/leave`.
- **Lỗi cùng loại phát hiện thêm và đã sửa:**
  - `listSectionStudents` và `searchAvailableStudentsForSection` không kiểm tra quyền sở hữu. Đã thêm `assertCanManageSection(auth, sectionId)`, ném `SectionAccessError` (403, hoặc 404 khi section không thuộc tổ chức).
  - `resolveSuspiciousAttempt` để teacher đi qua khi `target.course` null. Đã đổi sang fail-closed.

### 1.2 [High] Import sinh viên vượt tenant (`lib/auth/users.ts` › `importStudents`)
- **Nguyên nhân gốc (3 điểm):**
  1. Tìm membership theo `student_code` **không lọc tổ chức**, rồi ghi danh user tìm được vào lớp của tổ chức đang import.
  2. Khi email sinh ra trùng một user đã có, hàm **`UPDATE users SET password_hash…`** cho user đó, bất kể tổ chức hay vai trò.
  3. `options.sectionId` được dùng trực tiếp, không kiểm tra section thuộc tổ chức.
- **Cách sửa:**
  - Mã SV đã tồn tại ở **tổ chức khác** → bỏ qua dòng đó với lý do "đã được đăng ký ở một tổ chức khác". Không liên kết, không ghi danh, không sửa gì. Lưu ý: `membership_student_code_idx` là unique toàn cục, nên không thể tạo membership trùng mã.
  - Mã SV đã tồn tại trong cùng tổ chức → ghi danh vào lớp đích nếu có (giữ hành vi cũ), nếu không có lớp đích thì bỏ qua.
  - **Email đã tồn tại → luôn bỏ qua**, không tái sử dụng và không sửa tài khoản. Lý do bỏ qua phân biệt "trong tổ chức" và "trong hệ thống".
  - So khớp mã SV và email không phân biệt hoa thường (`lower(...)`), nhất quán với logic đăng nhập.
  - `courseId`/`sectionId` được kiểm tra thuộc tổ chức **trước** khi import. Nếu sai → `ImportScopeError`, route trả HTTP 400.
  - Báo cáo từng dòng vẫn là `created[]` và `skipped[]{studentCode, reason}`.
- **Import giảng viên (`importTeachers`):** không ghi đè mật khẩu. Nhưng khi email đã tồn tại ở tổ chức khác, hàm vẫn thêm membership cho tài khoản đó và báo `defaultPassword` sai. Đã sửa phần báo cáo thành "Tài khoản đã tồn tại – giữ mật khẩu hiện có". Có nên chặn liên kết liên tổ chức hay không: **chờ xác nhận** (mục 9).

### 1.3 [High] OTP plaintext (`lib/attendance/challenge.ts`, `lib/attendance/server.ts`)
- **Nguyên nhân gốc:** UI giảng viên cần hiển thị lại mã sau mỗi lần poll. Vì vậy code cũ lưu mã rõ vào cột `attendance_challenges.code`, kèm một `Map` cache trong RAM (không dùng chung được giữa các instance serverless).
- **Cách sửa:**
  - Mã được **suy ra** bằng `deriveChallengeValue(sessionId, sequence) = HMAC-SHA256(SESSION_SECRET, "attendance-challenge:v1:<sessionId>:<sequence>")`, ánh xạ vào bảng 32 ký tự (không có modulo bias).
  - DB chỉ lưu `value_hash`; bản ghi mới có `code = NULL`. Giảng viên xem mã nhờ server tính lại qua `challengePlaintextFor(row)`, và kết quả được đối chiếu với hash trước khi trả về.
  - Đã xóa `challengePlainCache`, `cacheChallengePlain`, `getActiveChallengePlain`.
  - Cơ chế chống replay không đổi: TTL, `invalidated` khi xoay mã, unique `(session_id, sequence)`, unique record theo `(session_id, student_id)`.
  - Mã không xuất hiện trong log hay thông báo lỗi; student vẫn chỉ nhận `------`.
- **Đánh đổi:** lộ `SESSION_SECRET` thì suy ra được mã. Trước đây, lộ DB là đọc được mã trực tiếp.

### 1.4 [High] WebAuthn (`lib/auth/webauthn.ts`, `lib/auth/webauthn-client.ts`, `app/api/auth/webauthn/register/route.ts`)
- **Nguyên nhân gốc:**
  - (a) `verifyWebAuthnAssertion` dùng `assertion.origin || env`, tức là client tự chọn origin mong đợi. Thiếu `clientData.origin` thì bỏ qua kiểm tra.
  - (b) Challenge không trạng thái (HMAC) nên dùng lại được trong 5 phút.
  - (c) Endpoint đăng ký chỉ kiểm tra challenge rồi lưu nguyên `publicKey` do client gửi. Client còn có fallback lưu `attestationObject` thay cho khóa.
  - (d) `fetch` khi đăng ký không gửi `x-csrf-token` → `proxy.ts` trả 403 khi đã có cookie CSRF.
- **Cách sửa:**
  - Origin mong đợi **chỉ lấy từ cấu hình server**, bắt buộc có `clientData.origin`.
  - Thêm `consumeWebAuthnChallenge`: mỗi challenge **dùng một lần**, cho cả assertion lẫn registration. Nonce được ghi vào bảng có sẵn `rate_limits` (khóa `webauthn-nonce:<nonce>`), nên không cần migration.
  - Thêm `verifyPasskeyRegistration`, kiểm tra:
    - challenge đúng user, còn hạn, chưa dùng;
    - `clientDataJSON` có type `webauthn.create`, đúng challenge, đúng origin;
    - `authenticatorData` có rpIdHash đúng, bật cờ UP và UV, có attested credential data, và credentialId nhúng bên trong khớp với `credentialId` gửi lên;
    - public key là SPKI hợp lệ (EC hoặc RSA).
  - Body của endpoint đăng ký được validate bằng zod.
  - Client: thêm `x-csrf-token`; gửi `clientDataJSON` và `authenticatorData` (`getAuthenticatorData()`); **bỏ fallback attestationObject** (fail-closed với trình duyệt không hỗ trợ).
  - UI sinh viên: lấy **challenge mới** cho bước assertion ngay sau khi đăng ký, vì challenge giờ chỉ dùng được một lần.
  - Không tắt hay nới lỏng bất kỳ kiểm tra nào (CSRF, chữ ký, UV, RP ID).
- **Chưa làm, cần quyết định chính sách:** xác minh attestation statement (`attestation: 'direct'` + danh sách AAGUID/vendor tin cậy), và đối chiếu SPKI với khóa COSE trong authData (cần thêm bộ giải mã CBOR hoặc thư viện như `@simplewebauthn/server`; theo quy tắc, mình không tự thêm dependency). Khi attestation là `'none'`, người dùng có chủ đích vẫn đăng ký được authenticator phần mềm.

### 1.5 [High → một phần] Ultrasonic
- **Hiện trạng đã xác minh:**
  - Giáo viên phát âm 18,75 kHz (`startUltrasonicBeacon`); sinh viên dò bằng FFT (`detectUltrasonicBeacon`), **chỉ ở client**.
  - UI chỉ dùng kết quả để chặn nút bấm (`ultrasonicStatus !== 'detected'`), sau đó gửi `ultrasonicVerified: true` (server bỏ qua) và **không bao giờ gửi `acousticProof`**, vì server không cấp token này cho sinh viên.
  - Server có sẵn cơ chế HMAC `acousticProof`, nhưng token đó chỉ chứng minh tính toàn vẹn, không chứng minh có mặt trong phòng.
- **Đã sửa:** `verifyAttendance` trước đây lưu `method` **do client khai** (UI gửi `'ultrasonic_faceid'`). Giờ server tự xác định: `ultrasonic_faceid` chỉ khi **cả hai** bằng chứng mật mã đã được xác minh; ngược lại là `qr_scan` hoặc `manual_code`. Giá trị client khai chỉ được lưu vào `metadata.clientClaimedMethod`.
- **Chưa làm (cần thiết kế, xem mục 8):** xác minh siêu âm phía server.

### 1.6 Race condition khi tạo phiên
- **Nguyên nhân gốc:** `getOrCreateLiveSession` và nhánh auto-start trong `syncScheduledAttendance` đều làm theo kiểu SELECT-rồi-INSERT, không có ràng buộc DB. Driver `neon-http` cũng không có transaction tương tác.
- **Cách sửa:** thêm partial unique index `attendance_sessions_one_open_per_section_idx ON (section_id) WHERE status IN ('draft','active','paused')`, kết hợp `INSERT … ON CONFLICT DO NOTHING RETURNING`. Bên thua cuộc đọc lại phiên của bên thắng. Scheduler bỏ qua (không xoay mã, không ghi audit) nếu không chèn được.
- **Hiệu lực:** chỉ có tác dụng **sau khi chạy migration 0005**. Trước đó code vẫn chạy như cũ (`ON CONFLICT` không có index thì không bao giờ kích hoạt).

---

## 2. File đã thay đổi

| File | Thay đổi |
|---|---|
| `lib/attendance/server.ts` | `ClassSessionListOptions`, `classSessionScopeFor`, `SectionAccessError`, `assertCanManageSection`; lọc mã theo phạm vi; suy ra OTP, bỏ cache plaintext; method do server quyết định; tạo phiên race-safe (thủ công và auto); fail-closed trong `resolveSuspiciousAttempt` |
| `lib/attendance/challenge.ts` | `deriveChallengeValue`, `challengePlaintextFor`, `CHALLENGE_LENGTH` |
| `lib/auth/users.ts` | `importStudents` viết lại phần tra cứu và liên kết; `ImportScopeError`; báo cáo đúng trong `importTeachers` |
| `lib/auth/webauthn.ts` | `consumeWebAuthnChallenge`, `checkAuthenticatorData`, `verifyPasskeyRegistration`; origin chỉ từ server; challenge một lần dùng |
| `lib/auth/webauthn-client.ts` | Header CSRF; gửi `clientDataJSON`/`authenticatorData`; bỏ fallback không an toàn |
| `lib/db/schema.ts` | Partial unique index trên `attendance_sessions` |
| `app/api/attendance/sessions/route.ts`, `app/api/courses/sections/route.ts`, `app/api/dashboard/route.ts` | Dùng `classSessionScopeFor` |
| `app/api/courses/sections/[id]/route.ts`, `.../[id]/students/route.ts` | Map `SectionAccessError` → 403/404 |
| `app/api/users/import/route.ts` | Map `ImportScopeError` → 400 |
| `app/api/auth/webauthn/register/route.ts` | zod + `verifyPasskeyRegistration` |
| `components/smart-attend.tsx` | Lấy challenge mới cho assertion sau khi đăng ký passkey (không đổi giao diện) |
| `drizzle/0004_drop_challenge_plaintext.sql`, `drizzle/0005_one_open_session_per_section.sql` | Migration mới |
| Test: `lib/attendance/challenge-derivation.test.ts`, `lib/attendance/session-scope.test.ts`, `lib/auth/webauthn-registration.test.ts`, `tests/integration/security-fix-authz-import-race.test.ts` (mới); `tests/integration/dashboard-route.test.ts`, `hardened-security.test.ts`, `pilot-e2e-verification.test.ts` (cập nhật) | |

## 3. Thay đổi database
- **Schema:** thêm partial unique index `attendance_sessions_one_open_per_section_idx`. Cột `attendance_challenges.code` **được giữ lại** (nullable) để rollback được; bản ghi mới luôn có giá trị NULL.
- **Dữ liệu:** migration 0004 xóa plaintext cũ (`code = NULL`). `value_hash` giữ nguyên.

## 4. Migration
| File | Nội dung | An toàn |
|---|---|---|
| `drizzle/0004_drop_challenge_plaintext.sql` | `UPDATE attendance_challenges SET code = NULL WHERE code IS NOT NULL` | Không xóa cột, không đổi hash. Mã sinh viên đang cầm vẫn xác minh được đến khi hết hạn. Challenge active cũ sẽ được xoay mới ở lần poll kế tiếp của giảng viên (`challengePlaintextFor` trả null nên `getLiveSessionDetails` xoay mã). |
| `drizzle/0005_one_open_session_per_section.sql` | Kiểm tra trùng lặp (khối `DO`, **raise lỗi nếu có trùng**, không sửa dữ liệu) rồi `CREATE UNIQUE INDEX IF NOT EXISTS … WHERE status IN (…)` | Không tự sửa dữ liệu. Nếu có phiên mở trùng, người vận hành phải xử lý trước (truy vấn tìm trùng có trong file). |

Thư mục `drizzle/` không có `meta/_journal.json`; dự án đang dùng `drizzle-kit push`. Các file SQL trên dùng để review hoặc chạy tay. **Không có migration nào được chạy trong phiên làm việc này.**

## 5. Test đã viết
- **Unit, không cần DB (đã chạy):**
  - `challenge-derivation.test.ts` (5): suy ra mã tất định, mã thay đổi theo session/sequence/secret, mã luôn khớp hash, hàng legacy.
  - `session-scope.test.ts` (3): phạm vi student, teacher, admin.
  - `webauthn-registration.test.ts` (10, DB được mock): ca hợp lệ, replay, challenge của user khác, sai type, origin lạ hoặc thiếu, RP ID sai, thiếu UP/UV, credentialId không khớp, khóa không phải SPKI, không tiêu thụ challenge khi xác minh thất bại sớm.
  - `dashboard-route.test.ts`: thêm kiểm tra phạm vi truyền vào `listClassSessions` cho cả 3 vai trò.
- **Integration, cần DB riêng (đã viết, CHƯA chạy):** `security-fix-authz-import-race.test.ts`
  - Teacher A không thấy section hay OTP của B; không đọc được chi tiết phiên B; không xoay, tạm dừng hay đóng phiên B; không đọc roster B. Teacher B vẫn quản lý phiên của mình. Admin A truy cập được toàn tổ chức A, admin B bị chặn. Challenge được lưu với `code` NULL.
  - Import: hai trường trùng mã SV; email đã tồn tại (không ghi đè mật khẩu); thành viên cùng tổ chức; dòng trùng hoặc không hợp lệ; course của tổ chức khác.
  - 20 request tạo phiên đồng thời cho ra đúng 1 phiên mở (cần migration 0005).

## 6. Test đã chạy và kết quả (thực tế)
Môi trường chạy: máy local, **không có `DATABASE_URL`** (đã kiểm tra: biến môi trường rỗng, không có file `.env`). Dependency được cài bằng `pnpm@9.15.9 install --frozen-lockfile`, lockfile không đổi.

| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | ✅ Không có lỗi |
| `pnpm lint` | ✅ exit 0 |
| `pnpm test` | **195 passed, 101 skipped, 7 failed** |

- **7 test fail đều do thiếu `DATABASE_URL`**, nằm ở `lib/rate-limit.test.ts` (3) và `tests/integration/departments-management-suite.test.ts` (4). Hai file này **không có `describe.skipIf(!DATABASE_URL)`** từ trước nên luôn fail khi không có DB; không liên quan đến thay đổi lần này. Thông báo lỗi duy nhất: `DATABASE_URL environment variable is not configured`.
- `dashboard-route.test.ts` từng fail do mock thiếu `classSessionScopeFor` (hồi quy của chính mình); đã sửa và test pass.
- 101 test bị skip là các suite cần DB, **gồm cả suite integration mới**. Chúng **chưa được chạy**, vì vậy chưa thể khẳng định chúng pass.

## 7. Lỗi chưa xử lý
- **#2 Thời lượng phiên 3 phút và ngưỡng đi muộn:** chờ quyết định (mục 9).
- **#7 Đồng bộ lịch trên đường đọc:** `syncScheduledAttendance` vẫn được gọi trong `listClassSessions` và `getLiveSessionDetails`. Gỡ ra khi production chưa có cron sẽ **làm mất** tính năng tự mở phiên và tự đóng phiên. Đề xuất ở [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).
- **Teacher sửa được policy toàn tổ chức** (`updateAttendancePolicy`): chờ xác nhận.
- **WebAuthn attestation** và **ultrasonic phía server:** chờ chọn chính sách hoặc thiết kế.
- Hai file test thiếu `skipIf` (đã nêu ở mục 6).
- Các vấn đề Medium/Low khác ghi trong [TECHNICAL_DEBT.md](TECHNICAL_DEBT.md).

## 8. Đề xuất thiết kế ultrasonic phía server (chưa triển khai)
Để server xác minh được, tín hiệu âm thanh phải **mang theo một bí mật thay đổi theo thời gian** mà chỉ người có mặt trong phòng nghe được. Ví dụ: mã hóa token HMAC ngắn (theo session, sequence và khung thời gian 5–10 giây) bằng FSK trên dải 18–20 kHz. Máy sinh viên giải mã rồi gửi token lên; server kiểm tra HMAC và khung thời gian, và đánh dấu token đã dùng theo từng sinh viên. Ngay cả như vậy, việc chuyển tiếp (relay) âm thanh qua cuộc gọi vẫn khả thi, nên cơ chế này chỉ nâng chi phí gian lận chứ không phải bằng chứng tuyệt đối. Cần chủ dự án quyết định có đầu tư hay không. Trước mắt, **không nên quảng bá "xác thực siêu âm"** là cơ chế đã được server kiểm chứng.

## 9. Cần chủ dự án xác nhận
1. **Thời lượng phiên:** 3 phút là quy tắc cố ý cho mọi phiên, chỉ cho phiên tự động theo lịch, hay cần cấu hình được? Phiên giảng viên mở tay có bị tự đóng không?
2. **Đi muộn:** sinh viên điểm danh sau bao nhiêu phút thì là `late`, và sau bao lâu thì không được điểm danh nữa (bị `absent`)? Hai mốc này nên đặt theo tổ chức, theo lớp, hay theo phiên?
3. **Cron production:** có Vercel Cron hoặc scheduler nào đang gọi `/api/cron/sync-attendance` không, với tần suất bao nhiêu? (Điều kiện tiên quyết để làm #7.)
4. Teacher có được sửa `attendance_policies` của **cả tổ chức** không?
5. Import giảng viên: có cho phép gắn một tài khoản đã tồn tại ở tổ chức khác vào tổ chức mình không?
6. WebAuthn: chấp nhận attestation `'none'` (mọi passkey), hay yêu cầu thiết bị có chứng thực? Có được thêm `@simplewebauthn/server` không?
7. Có đầu tư cho ultrasonic phía server (mục 8) không, hay coi đây là tính năng hỗ trợ trải nghiệm?

## 10. Hướng dẫn triển khai an toàn
1. Review diff, commit trên nhánh riêng, mở PR vào `main`.
2. Chuẩn bị **DB test riêng** (Neon branch), đặt `DATABASE_URL` trỏ tới đó rồi chạy `pnpm test`, đặc biệt là `tests/integration/security-fix-authz-import-race.test.ts`. Tuyệt đối không dùng DB production.
3. Trên **staging** (Neon branch tách từ production):
   - a. Chạy truy vấn tìm phiên mở trùng (trong 0005). Nếu có, quyết định đóng phiên nào **trước**.
   - b. Áp `0005_one_open_session_per_section.sql`.
   - c. Deploy code mới.
   - d. Áp `0004_drop_challenge_plaintext.sql` (sau khi deploy, để bản code cũ không còn ghi plaintext).
4. Kiểm thử thủ công trên staging:
   - Giảng viên mở phiên, xem mã/QR, mã xoay; sinh viên điểm danh.
   - Giảng viên B không thấy phiên của A.
   - Đăng ký passkey trên trình duyệt thật (Chrome, Safari, Edge) không bị 403.
   - Import CSV với các ca trùng.
5. Production: lặp lại bước 3 trong khung giờ không có lớp học. `SESSION_SECRET` **không được thay đổi** trong lúc có phiên đang mở, vì mã sẽ không còn suy ra được; nếu xảy ra, giảng viên chỉ cần xoay mã.
6. Rollback: code cũ vẫn chạy với schema mới (cột `code` vẫn còn; index chỉ chặn trường hợp trùng). Sau khi rollback, các challenge tạo bằng code mới sẽ không hiển thị được mã ở code cũ cho tới lần xoay kế tiếp.

---

# Đợt 2 (2026-11-14): Production readiness

> Baseline: [PRODUCTION_READINESS_BASELINE.md](PRODUCTION_READINESS_BASELINE.md) · Review độc lập: [INDEPENDENT_SECURITY_REVIEW.md](INDEPENDENT_SECURITY_REVIEW.md) · Checklist: [PRODUCTION_READINESS_CHECKLIST.md](PRODUCTION_READINESS_CHECKLIST.md)

## Sửa thêm trong đợt này
| ID review | Nội dung | File |
|---|---|---|
| C-1 | Chốt chặn `scripts/seed.ts` (script xóa toàn bộ dữ liệu) | `scripts/seed.ts` |
| C-2 | Đăng ký passkey: suy ra khóa từ COSE_Key trong authenticatorData; khóa client phải trùng; lưu khóa suy ra | `lib/auth/cose.ts` (mới), `lib/auth/webauthn.ts`, `app/api/auth/webauthn/register/route.ts` |
| C-3 | IDOR đơn nghỉ qua `?studentId=` | `lib/attendance/leave.ts` |
| C-4 | Tách khóa HMAC theo mục đích | `lib/auth/secrets.ts` (mới), `lib/attendance/challenge.ts`, `lib/auth/webauthn.ts`, `lib/attendance/ultrasonic.ts` |
| C-5 | OAuth: kiểm tra `aud`/`tid`; chỉ tự liên kết theo email khi single-tenant | `lib/auth/oauth.ts`, `app/api/auth/microsoft/callback/route.ts` |
| C-7 | Verify nguyên tử và idempotent khi request đồng thời | `lib/attendance/server.ts` › `verifyAttendance` |
| C-8 | OAuth thiếu cấu hình: redirect có kiểm soát thay cho 500 | `app/api/auth/microsoft/route.ts`, `lib/auth/oauth.ts` |
| C-9 | Không trả lỗi nội bộ ở verify và passkey register | 2 route tương ứng |
| CI | `packageManager`; tách unit/integration; integration chỉ dùng `TEST_DATABASE_URL` và fail khi thiếu; workflow 2 job | `package.json`, `vitest.config.mts`, `vitest.integration.config.mts` (mới), `tests/setup/require-test-database.ts` (mới), `.github/workflows/ci.yml` |

## Test đợt này
- Mới: `lib/auth/oauth.test.ts` (7). `lib/auth/webauthn-registration.test.ts` viết lại (12, có COSE thật).
- Bổ sung integration (chưa chạy): verify đồng thời ×20, IDOR đơn nghỉ.
- Cập nhật: `tests/integration/security-audit-cases.test.ts` (giả lập challenge hết hạn bằng đúng khóa theo mục đích).

## Kết quả chạy thực tế (local, không có DB)
`typecheck` PASS · `lint` PASS · `test:unit` 17 file, 174/174 PASS · `build` PASS · `test:integration` fail có chủ đích khi không có `TEST_DATABASE_URL` (exit 1). Integration với DB: **BLOCKED**.
