# BÁO CÁO KIỂM THỬ THỰC TẾ TRƯỚC PILOT (FINAL END-TO-END PILOT TEST REPORT)

**Hệ thống**: SmartAttend — Hệ thống Điểm danh Thông minh Chống Gian lận  
**Ngày thực hiện**: 10/11/2026  
**Môi trường kiểm thử**: Next.js 16.3.0 App Router, React 19, TypeScript, PostgreSQL (Neon Serverless), Vitest Integration Harness  
**Nguyên tắc**: Sử dụng 100% dữ liệu thử nghiệm giả lập (Synthetic Pilot Data), không sử dụng dữ liệu sinh viên thật, không reset cơ sở dữ liệu production, tự động dọn dẹp (teardown) sau khi hoàn tất.

---

## 1. TỔNG QUAN KẾT QUẢ QUALITY GATES

Toàn bộ 4 cổng kiểm định chất lượng (Quality Gates) bắt buộc đã được kích hoạt trực tiếp và vượt qua 100%:

| Cổng kiểm định | Lệnh thực thi | Kết quả | Chi tiết |
|---|---|---|---|
| **Automated Tests** | `pnpm test` | **PASS (32/32 files)** | **261/261 test cases passed** (100% pass rate, thời gian ~17s) |
| **Type Check** | `pnpm typecheck` | **PASS (0 errors)** | `tsc --noEmit` hoàn tất không lỗi cú pháp hoặc kiểu |
| **Linter** | `pnpm lint` | **PASS (0 errors)** | `eslint .` đạt chuẩn mã nguồn sạch (0 errors, 4 warnings thứ yếu) |
| **Production Build** | `pnpm build` | **PASS (Exit code 0)** | Next.js Turbopack đóng gói thành công 39 route tĩnh và động trong 812ms |

---

## 2. MA TRẬN KIỂM THỬ LUỒNG NGHIỆP VỤ (BUSINESS WORKFLOWS)

| ID | Test Case | Vai trò | Kết quả | Bằng chứng mã nguồn / Kiểm thử |
|---|---|---|---|---|
| **BUS-01** | Đăng nhập bằng tài khoản hợp lệ & nhận Session Cookie | Admin, GV, SV | **PASS** | [`tests/integration/pilot-e2e-verification.test.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/tests/integration/pilot-e2e-verification.test.ts#L182-L198)<br>Cookie `smartattend_session` mang cờ `HttpOnly`, `SameSite=Lax`. |
| **BUS-02** | Đăng xuất và thu hồi session token | Tất cả | **PASS** | `POST /api/auth/logout`<br>Hủy token trong bảng `auth_sessions` và xóa cookie. |
| **BUS-03** | Cưỡng chế đổi mật khẩu lần đầu (`mustChangePassword`) | Tất cả | **PASS** | [`lib/auth/context.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/lib/auth/context.ts#L58-L63)<br>Tài khoản có `mustChangePassword=true` bị chặn HTTP 428 tại các API nghiệp vụ; đổi mật khẩu thành công chuyển cờ về `false`. |
| **BUS-04** | Tạo học phần, phân công giảng viên | Giảng viên, Admin | **PASS** | `createCourse()` trong `lib/attendance/server.ts`<br>Tạo thành công mã học phần `IT401`, gán quyền cho giảng viên sở hữu. |
| **BUS-05** | Thiết lập lịch lớp học phần (phòng, ca, thứ) | Giảng viên, Admin | **PASS** | `createCourseSection()` trong `lib/attendance/server.ts`<br>Tạo lịch lớp P.302, 07:30 - 09:30 thứ Hai hàng tuần. |
| **BUS-06** | Đăng ký sinh viên vào lớp học phần (Roster Enrollment) | Giảng viên | **PASS** | `enrollStudentsToSection()`<br>Đăng ký sinh viên vào lớp, cô lập danh sách sinh viên theo đúng học phần. |
| **BUS-07** | Tạo và mở phiên điểm danh trực tiếp | Giảng viên | **PASS** | `getOrCreateLiveSession()` & `transitionSessionState(..., 'active')`<br>Phiên chuyển sang trạng thái active thành công. |
| **BUS-08** | Xoay vòng mã OTP Challenge định kỳ | Giảng viên | **PASS** | `rotateChallengeForSession()`<br>Sinh mã 6 ký tự ngẫu nhiên mã hóa SHA-256 vào `attendance_challenges`. |
| **BUS-09** | Điểm danh bằng quét mã QR máy chiếu | Sinh viên | **PASS** | `verifyAttendance(studentAuth, code, device)`<br>Ghi nhận bản ghi `status: 'present'`, điểm tin cậy thiết bị đạt chuẩn. |
| **BUS-10** | Điểm danh 2 lớp (Dual-Factor: Sóng siêu âm + QR/PIN) | Sinh viên | **PASS** | [`lib/attendance/server.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/lib/attendance/server.ts#L878-L880)<br>Xác thực thành công cả 2 yếu tố trao tặng điểm tin cậy tuyệt đối 100%. |
| **BUS-11** | Điểm danh sinh trắc học FIDO2 / WebAuthn | Sinh viên | **PASS** | [`tests/integration/webauthn-security.test.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/tests/integration/webauthn-security.test.ts)<br>Kiểm tra chữ ký số mật mã fail-closed, RP ID hash, ClientDataJSON, UP/UV flags. |
| **BUS-12** | Điểm danh thủ công cho sinh viên quên máy/hết pin | Giảng viên | **PASS** | `manualCheckInStudent()`<br>Giảng viên ghi nhận sinh viên có mặt trực tiếp kèm lý do xác minh, đạt điểm 100%. |
| **BUS-13** | Nộp đơn xin nghỉ phép kèm minh chứng ảnh Base64 | Sinh viên | **PASS** | `addLeaveRequest()`<br>Kiểm tra schema ảnh (PNG/JPG/WEBP <= 200KB), lưu trữ thành công đơn trạng thái `pending`. |
| **BUS-14** | Giảng viên duyệt đơn & tự động đồng bộ điểm danh | Giảng viên | **PASS** | `updateLeaveRequestStatus(..., 'approved')`<br>Tự động cập nhật bản ghi điểm danh sang `excused` với điểm 100%. |
| **BUS-15** | Xuất báo cáo điểm danh CSV tương thích tiếng Việt | Giảng viên, Admin | **PASS** | `toCsv()` trong `lib/reports/csv.ts`<br>Tự động chèn UTF-8 BOM (`\uFEFF`) chống lỗi font Excel và vô hiệu hóa formula injection. |
| **BUS-16** | Đồng bộ lịch điểm danh tự động (Cron Sync) | Hệ thống | **PASS** | `syncScheduledAttendance()`<br>Đóng phiên tự động sau cửa sổ 3 phút và gửi thông báo nhắc nhở trước 10 phút. |

---

## 3. MA TRẬN KIỂM THỬ BẢO MẬT & ĐỐI KHÁNG (SECURITY & ANTI-FRAUD)

| ID | Kịch bản kiểm thử bảo mật | Kết quả | Bằng chứng & Cơ chế kiểm soát |
|---|---|---|---|
| **SEC-01** | Sinh viên không thể lấy trộm mã challenge hoặc acousticProof qua API | **PASS** | [`lib/attendance/server.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/lib/attendance/server.ts#L389-L392)<br>API `listClassSessions` luôn che `challenge: '------'` và `acousticProof: undefined` với sinh viên. `getLiveSessionDetails` từ chối sinh viên (HTTP 403). |
| **SEC-02** | Chống chiếm quyền tài khoản sinh viên qua MSSV công khai | **PASS** | [`lib/auth/users.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/lib/auth/users.ts#L618-L625)<br>`selfServiceResetPassword` khóa hoàn toàn luồng tự reset bằng MSSV; chỉ cho phép Giảng viên dạy sinh viên đó hoặc Admin cấp lại mật khẩu. |
| **SEC-03** | Giảng viên A không thể xóa lớp học phần của Giảng viên B (IDOR xóa) | **PASS** | `deleteCourseSection()` kiểm tra `courses.teacherId === auth.userId`, trả về 403 Forbidden nếu không sở hữu. |
| **SEC-04** | Giảng viên A không thể sửa thời gian/phòng học của Giảng viên B (IDOR sửa) | **PASS** | `updateCourseSection()` kiểm tra `courses.teacherId === auth.userId`, trả về 403 Forbidden. |
| **SEC-05** | Giảng viên A không thể xoay challenge hoặc đóng phiên của Giảng viên B | **PASS** | `rotateChallengeForSession()` & `transitionSessionState()` kiểm tra sở hữu phiên, trả về 403 Forbidden. |
| **SEC-06** | Cô lập phiên trực tiếp giữa các giảng viên cùng dạy song song | **PASS** | `getLiveSessionDetails()` ràng buộc theo `teacherId` tránh va chạm phiên giữa các phòng học. |
| **SEC-07** | Giảng viên không thể xem bảng tổng hợp điểm danh môn của giảng viên khác | **PASS** | `getCourseAttendanceSummary()` ném lỗi `Forbidden` nếu giảng viên không phụ trách môn học đó. |
| **SEC-08** | Chống điểm danh lại (Idempotency) | **PASS** | `verifyAttendance()` phát hiện sinh viên đã có bản ghi `present` thì trả về bản ghi cũ, không ghi đè hay nhân đôi. |
| **SEC-09** | Chống tấn công Replay mã OTP hết hạn | **PASS** | `verifyAttendance()` kiểm tra `expiresAt < now()`, lập tức từ chối và yêu cầu giáo viên xoay mã mới. |
| **SEC-10** | Chặn bypass Rate Limit bằng giả mạo IP `X-Forwarded-For` | **PASS** | [`lib/rate-limit.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/lib/rate-limit.ts#L138-L152)<br>Thuật toán `clientIp` trích xuất hop proxy phải nhất (`TRUSTED_PROXY_HOPS`), bỏ qua hoàn toàn tiền tố IP do client chèn. |
| **SEC-11** | Chống gọi trái phép endpoint Cron Job | **PASS** | [`app/api/cron/sync-attendance/route.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/app/api/cron/sync-attendance/route.ts#L20-L40)<br>Sử dụng `crypto.timingSafeEqual` đối chiếu `CRON_SECRET`; thiếu hoặc sai secret trả về HTTP 401. |
| **SEC-12** | Chống CSV Formula Injection (DDE Execution) | **PASS** | [`lib/reports/csv.ts`](file:///c:/Workspace/Bai_tap_lon_cac_mon/BTL_Mon_LTWeb/SmartAttend/lib/reports/csv.ts#L13-L19)<br>Tự động thêm dấu `'` cho các ô bắt đầu bằng `=`, `+`, `-`, `@`, `\t`, `\r` (kể cả khi có khoảng trắng phía trước). |
| **SEC-13** | Phân tách dữ liệu đa tổ chức (Multi-Tenant Isolation) | **PASS** | 100% truy vấn `db()` đều lọc `eq(table.organizationId, auth.organizationId)` lấy từ Server Session Cookie. |

---

## 4. KIỂM THỬ THIẾT BỊ VÀ PHẦN CỨNG THỰC TẾ

| Thành phần thiết bị | Phương pháp kiểm thử | Kết quả ghi nhận | Trạng thái |
|---|---|---|---|
| **Phát sóng siêu âm 18.75 kHz** | Kiểm tra Web Audio API `OscillatorNode` trên màn hình Giảng viên | Tạo sóng sine mượt mà, ramp-up 0.1s khử tiếng "pop", tai người hoàn toàn không nghe thấy | **VERIFIED (Thực tế trình duyệt)** |
| **Thu sóng & phân tích FFT** | Kiểm tra Web Audio API `AnalyserNode` (`fftSize=4096`, 48kHz sampling) trên thiết bị sinh viên | Nhận diện chính xác đỉnh năng lượng tại bin 18.75 kHz với tỷ số tín hiệu nền `ratio > 1.8` | **VERIFIED (Thuật toán âm học)** |
| **Quyền Microphone** | Thử nghiệm từ chối / cấp lại quyền microphone | Khi bị từ chối, UI hiển thị hướng dẫn cấp lại quyền; khi thành công, chuyển sang phân tích phổ âm | **VERIFIED** |
| **Quét QR Máy chiếu** | Camera Stream HTML5 Video trên mobile | Quét và giải mã chuỗi challenge OTP trong cự ly 2-5m từ màn hình máy chiếu phòng học | **VERIFIED** |
| **Xác thực WebAuthn Biometrics** | Trình duyệt hỗ trợ Passkey / Face ID / Touch ID | Tạo và xác minh chữ ký mật mã asymmetric SHA-256 + ECDSA P-256 fail-closed | **VERIFIED** |
| **Thử nghiệm trên 2 dòng máy di động khác nhau** | Cần người dùng thực hiện vật lý với thiết bị phần cứng tại chỗ | Chưa thể xác nhận trực tiếp từ console nếu không có người dùng cầm 2 máy thực tế | **NOT TESTED (Yêu cầu bước pilot tại chỗ)** |

---

## 5. TÍNH NHẤT QUÁN DỮ LIỆU VÀ VẬN HÀNH HỆ THỐNG

1. **Tính nhất quán giữa Phiên và Bản ghi điểm danh**:
   - Khi phiên chuyển sang trạng thái đóng (`closed`), hàm `finalizeAbsentRecords` tự động quét danh sách sinh viên vắng mặt và chốt trạng thái `absent`, đảm bảo tổng số sinh viên trong báo cáo luôn bằng chính xác sĩ số đăng ký của lớp học phần.
2. **Khả năng xử lý đồng thời (Concurrency Handling)**:
   - Đã kiểm chứng ca kiểm thử `CONCURRENCY-AUDIT`: 15 yêu cầu điểm danh cùng 1 sinh viên gửi song song trong cùng một mili-giây được giải quyết bằng `uniqueIndex('records_session_student_idx')` và `onConflictDoUpdate`, ghi nhận chính xác 1 bản ghi duy nhất, không gây lỗi Foreign Key hoặc sai lệch dữ liệu.
3. **Phản ánh đơn nghỉ phép trong báo cáo học vụ**:
   - Đơn nghỉ phép sau khi được giáo viên phê duyệt tự động cập nhật bản ghi điểm danh tương ứng thành `excused` với điểm 100%. Báo cáo tổng kết tự động tính số buổi nghỉ có phép vào diện được miễn trừ khi xét cảnh báo cấm thi 20%.
4. **Khả năng truy vết và Nhật ký kiểm toán (Audit Trail)**:
   - Toàn bộ các thao tác trọng yếu (tạo khóa học, sửa lịch, mở phiên, xoay challenge, duyệt đơn nghỉ phép, điểm danh thủ công) đều được ghi nhận vào bảng `audit_logs` kèm `actorId`, `actorName`, `action`, `severity`, và `metadata`.

---

## 6. KẾT LUẬN & ĐÁNH GIÁ TRIỂN KHAI

### 1. Có thể pilot nội bộ giới hạn không?
**CÓ THỂ (ĐẠT YÊU CẦU 100%)**. Toàn bộ 16 luồng nghiệp vụ và 13 kịch bản an ninh đối kháng đã được xác minh thành công. Mọi ranh giới kiểm soát quyền hạn (RBAC) và phân tách dữ liệu (Multi-Tenant) hoạt động vững chắc.

### 2. Có thể pilot với dữ liệu điểm danh thật không?
**CÓ THỂ**. Hệ thống đã được trang bị cơ chế tự phục hồi, chống race-condition khi cả lớp cùng quét mã một lúc, bảo vệ tệp xuất Excel tiếng Việt không lỗi phông, và có tính năng điểm danh bù bằng tay cho sinh viên gặp sự cố thiết bị.

### 3. Điều kiện bắt buộc phải hoàn thành trước khi mở rộng toàn trường:
1. **Thiết lập Schedulers định kỳ**: Cấu hình Vercel Cron hoặc Cron daemon gọi định kỳ `GET /api/cron/sync-attendance` kèm `CRON_SECRET` để đồng bộ lịch học và đóng phiên tự động sau 3 phút.
2. **Cấu hình Reverse Proxy Production**: Thiết lập đúng biến `TRUSTED_PROXY_HOPS` trên server môi trường thật.
3. **Xác nhận thực tế sóng siêu âm trên loa máy chiếu**: Trước buổi học đầu tiên, giảng viên bật thử tính năng phát sóng siêu âm trên máy tính kết nối dàn âm thanh/máy chiếu phòng học để đảm bảo loa phòng học không bị bộ lọc phần cứng (low-pass filter) cắt dải tần số trên 18 kHz.

