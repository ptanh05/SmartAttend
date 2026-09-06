# SMARTATTEND — BÁO CÁO NGHIỆM THU KIỂM TOÁN PRODUCTION (FINAL VERIFICATION REPORT)

**Thời gian kiểm tra:** 05/09/2026  
**Đơn vị thẩm định:** Antigravity Engineering System  
**Mục tiêu:** Xác minh tính toàn vẹn, bảo mật, khả năng chịu tải và độ tin cậy của toàn bộ codebase SmartAttend trước khi triển khai Production.

---

## 1. PHÂN LOẠI TRẠNG THÁI KIỂM CHỨNG THEO TIÊU CHUẨN

Tất cả các thành phần được phân loại minh bạch theo 4 cấp độ kiểm chứng:
- **[A] VERIFIED BY AUTOMATED TEST:** Đã kiểm chứng tự động bằng mã kiểm thử (Vitest Integration / Unit Tests) chạy trực tiếp trên cơ sở dữ liệu thực.
- **[B] VERIFIED BY CODE REVIEW:** Đã phân tích dòng mã (static analysis, data flow, schema constraints, AST inspection).
- **[C] VERIFIED MANUALLY:** Đã kiểm tra tương tác giao diện hoặc cấu hình môi trường trực tiếp.
- **[D] NOT VERIFIED:** Chưa kiểm chứng thực tế tại môi trường này (yêu cầu kiểm thử thủ công sau khi có thông số cấu hình cụ thể).

---

## 2. BẢNG TỔNG HỢP KIỂM CHỨNG CHI TIẾT

### A. Authentication & Session Security
| Hạng mục kiểm tra | Cấp độ kiểm chứng | Kết quả & Ghi chú kỹ thuật |
| :--- | :---: | :--- |
| Login bằng mật khẩu (Student & Staff) | **[A]** | Scrypt hash verify, so sánh hằng số thời gian `timingSafeEqual`, cấp JWT session cookie HTTP-only. |
| Logout & Thu hồi phiên | **[A]** | API xóa sạch cookie `sa_session`, hết hạn ngay lập tức. |
| Session validation & Middleware | **[A]** | `requireAuth()` kiểm tra token hợp lệ, truy vấn trạng thái `organizationMemberships.status = active` và `disabledAt is null`. |
| Chặn người dùng chưa xác thực truy cập API kín | **[A]** | Trả về HTTP 401 với thông báo chuẩn hóa. |
| Chặn sinh viên gọi API của Giảng viên/Admin (RBAC) | **[A]** | `requireAuth(['teacher', 'admin'])` chặn sinh viên ngay tại tầng controller (HTTP 403). |
| Chặn Giảng viên truy cập dữ liệu trường khác (Multi-tenant) | **[A]** | Tất cả truy vấn đều ràng buộc `organizationId` lấy từ AuthContext của phiên (đã test tại `security-regressions.test.ts`). |

---

### B. Microsoft 365 OAuth / OIDC
| Hạng mục kiểm tra | Cấp độ kiểm chứng | Kết quả & Ghi chú kỹ thuật |
| :--- | :---: | :--- |
| Tenant validation & Chặn Tenant ngoài trường | **[B]** & **[A]** | Mã nguồn kiểm tra `payload.tid === process.env.MICROSOFT_TENANT_ID`. Nếu không khớp, redirect về login kèm lỗi. |
| Điều hướng lỗi SSO đúng Portal | **[B]** | Lưu cookie `microsoft_oauth_portal` (`student` hoặc `staff`). Lỗi sẽ chuyển về `/${portal}/login?error=...` (không còn 404). |
| Giảng viên đăng nhập không bị nhầm Dashboard | **[B]** | Phân luồng đích đến: `teacher` -> `/teacher/dashboard`, `admin` -> `/admin/dashboard`, `student` -> `/student`. |
| Bí mật Client Secret bảo mật tuyệt đối | **[B]** | `MICROSOFT_CLIENT_SECRET` chỉ được gọi tại `lib/auth/oauth.ts` trên server. Không có prefix `NEXT_PUBLIC_`, không bị bundle vào client. |
| Luồng đăng nhập Microsoft thực tế với Azure Tenant Live | **[D]** | **NOT VERIFIED** (Do môi trường local hiện tại chưa liên kết tài khoản Azure AD trực tiếp của trường UTC. Cần test thủ công sau khi cấp Client Secret). |

---

### C. Động Cơ Điểm Danh (Attendance Engine)
| Kịch bản kiểm tra | Cấp độ kiểm chứng | Kết quả & Ghi chú kỹ thuật |
| :--- | :---: | :--- |
| **A. Điểm danh bình thường** | **[A]** | Sinh viên trong lớp nhập OTP đúng hạn -> Ghi nhận `present`, cấp điểm tin cậy phù hợp. |
| **B. Điểm danh lần thứ hai (Duplicate Check-in)** | **[A]** | Hệ thống kiểm tra bản ghi hiện tại. Nếu đã `present` hoặc `excused`, trả về nguyên trạng bản ghi cũ, không tạo thêm bản ghi, không đổi `verifiedAt`. |
| **C. Mã Challenge hết hạn** | **[A]** | So sánh `expiresAt < now()` -> Trả về HTTP 400 kèm thông báo mã đã hết hạn. |
| **D. Mã Challenge bị Replay / Đã xoay mã mới** | **[A]** | Khi xoay mã QR mới, mã cũ chuyển `status = inactive`, sinh viên dùng mã cũ bị từ chối ngay. |
| **E. Brute-force mã OTP** | **[A]** & **[B]** | Áp dụng `verifyLimiter` qua PostgreSQL: Tối đa 5 lần thử / phút trên mỗi cặp `(IP + sinh viên)`. Quá giới hạn trả về HTTP 429 Retry-After. |
| **F. Sinh viên gọi điểm danh hộ người khác** | **[A]** & **[B]** | API `/api/attendance/verify` lấy danh tính trực tiếp từ phiên `auth.userId` của cookie HTTP-only; sinh viên không thể truyền `studentId` khác vào body. |
| **G. Sinh viên không thuộc học phần gọi điểm danh** | **[A]** | Kiểm tra bảng `class_enrollments`. Nếu không có bản ghi active -> Báo lỗi `You are not enrolled in this class session`. |
| **H. Phiên học đã đóng nhưng vẫn gửi request** | **[A]** | Hệ thống chỉ tìm phiên có `status = 'active'`. Nếu phiên đã đóng -> Báo `There is no live session right now`. |
| **I. Hai request điểm danh đồng thời (Concurrency / Race Condition)** | **[A]** & **[B]** | Bảng `attendance_records` có unique index `(session_id, student_id)`. Câu lệnh SQL sử dụng `onConflictDoUpdate` đảm bảo triệt tiêu hoàn toàn race condition. |

---

### D. Hệ Thống Chống Gian Lận (Anti-Fraud & Device Policy)
| Hạng mục kiểm tra | Cấp độ kiểm chứng | Kết quả & Ghi chú kỹ thuật |
| :--- | :---: | :--- |
| Cờ client `ultrasonicVerified=true` không được bypass cảnh báo | **[A]** | Khi chính sách bật `requireTrustedDevice`, thiết bị lạ gửi kèm cờ sóng siêu âm vẫn BẮT BUỘC bị lưu vào `suspicious_attempts` để giảng viên duyệt. |
| Cờ client `biometricVerified=true` không được bypass policy | **[A]** | Tương tự, booleans từ client chỉ đóng vai trò metadata tham khảo, không thể vô hiệu hóa cơ chế đánh giá thiết bị. |
| Tạo bản ghi cảnh báo gian lận (`suspiciousAttempts`) | **[A]** | Ghi nhận chính xác mã sinh viên, lý do vi phạm chính sách, thiết bị sử dụng và trạng thái `open`. |
| Phân quyền Giảng viên chỉ xem cảnh báo lớp mình (Chống IDOR) | **[A]** | `listSuspicious` và `resolveSuspiciousAttempt` inner join qua `courses` và lọc `courses.teacherId === auth.userId`. Giảng viên khác bị từ chối `Permission denied`. |
| Tuyên bố về khả năng chống gian lận | **[B]** | Đã sửa toàn bộ UI; không còn tuyên bố "100% phần cứng chống gian lận tuyệt đối", phản ánh trung thực bản chất tiêu chuẩn WebAuthn FIDO2. |

---

### E. Sinh Trắc Học & WebAuthn (Passkeys)
| Hạng mục kiểm tra | Cấp độ kiểm chứng | Kết quả & Ghi chú kỹ thuật |
| :--- | :---: | :--- |
| Challenge stateless & Chống giả mạo chữ ký (HMAC Token) | **[A]** | Token sinh dạng `${nonce}.${expiresAt}.${signature}` bằng khóa bí mật HMAC-SHA256. Bất kỳ sự sửa đổi nào đều bị từ chối. |
| Hạn sử dụng của Challenge Token | **[A]** | Token quá thời gian 5 phút bị từ chối tự động. |
| Ràng buộc Challenge với người dùng (User Binding) | **[A]** | Chữ ký tính toán dựa trên `userId`. Dùng token của User A để xác thực cho User B sẽ thất bại. |
| Tính duy nhất của Credential & Chống cướp quyền (Hijacking) | **[A]** | `saveUserPasskey` kiểm tra nếu `credentialId` đã tồn tại trên tài khoản khác thì lập tức ném lỗi ngoại lệ, không cho phép ghi đè. |
| Xác thực phần cứng trên thiết bị di động thực tế | **[D]** | **NOT VERIFIED** (Yêu cầu kiểm thử trên thiết bị có cảm biến Face ID / Vân tay thật qua HTTPS). |

---

### F. Cơ Chế Giới Hạn Tần Suất (Rate Limiting)
| Endpoint | Cấu hình giới hạn | Cấp độ kiểm chứng | Trạng thái |
| :--- | :--- | :---: | :--- |
| `POST /api/auth/login` | 10 lần / 15 phút (IP + Identifier) | **[A]** | Hoạt động qua PostgreSQL atomic upsert. |
| `POST /api/auth/register` | 5 lần / 15 phút (IP) | **[A]** | Hoạt động qua PostgreSQL atomic upsert. |
| `POST /api/auth/change-password` | 5 lần / 15 phút (User + IP) | **[A]** | Hoạt động qua PostgreSQL atomic upsert. |
| `POST /api/attendance/verify` | 5 lần / phút (IP + Student) | **[A]** | Hoạt động qua PostgreSQL atomic upsert. |
| `POST /api/attendance/sessions/[id]` | 30 lần / phút (User) | **[A]** | Chống spam xoay mã QR. |
| `POST /api/users/import` | 10 lần / 15 phút (User + IP) | **[A]** | Chống làm nghẽn server bằng file CSV lớn. |

---

### G. Đơn Xin Nghỉ Phép (Leave Request Workflow)
| Kịch bản kiểm tra | Cấp độ kiểm chứng | Kết quả & Ghi chú kỹ thuật |
| :--- | :---: | :--- |
| Sinh viên gửi đơn xin nghỉ | **[A]** | Lưu đơn trạng thái `pending` liên kết đúng `courseId`, `sessionId`, `date`, `reason`. |
| Giảng viên chỉ xem được đơn lớp mình dạy | **[A]** | `getLeaveRequests` lọc theo `courses.teacherId = auth.userId`. Giảng viên không thể thấy đơn của lớp khác. |
| Giảng viên B không thể duyệt đơn của Giảng viên A (IDOR) | **[A]** | `updateLeaveRequestStatus` kiểm tra quyền sở hữu lớp học. Nếu không dạy môn đó, ném lỗi `Forbidden`. |
| Tự động đồng bộ sang điểm danh "Có phép" (Excused) | **[A]** | Khi duyệt `approved`, hệ thống tự động tìm phiên học tương ứng và cập nhật trạng thái bản ghi điểm danh sang `excused` với điểm tin cậy 100%. |

---

### H. Cơ Sở Dữ Liệu & Ràng Buộc Schema (PostgreSQL / Neon)
| Tiêu chí | Cấp độ kiểm chứng | Đánh giá |
| :--- | :---: | :--- |
| Schema & Migration | **[B]** | Đồng bộ hoàn toàn với `lib/db/schema.ts`. Không có migration phá hủy dữ liệu. |
| Khóa ngoại (Foreign Keys) | **[A]** & **[B]** | Đầy đủ ràng buộc liên kết `users`, `organizations`, `courses`, `attendanceRecords`, `userPasskeys`. |
| Khóa duy nhất (Unique Indexes) | **[A]** & **[B]** | Có `records_session_student_idx` trên `(session_id, student_id)` và `challenges_session_sequence_idx`. |
| Driver Serverless | **[A]** & **[B]** | `@neondatabase/serverless` ở chế độ HTTP, tối ưu cho serverless edge / worker, không bị cạn kiệt connection pool. |

---

### I. Quét Bí Mật & An Toàn Mã Nguồn
| Mục quét | Kết quả quét |
| :--- | :--- |
| Hard-coded API Keys / Secrets trong mã nguồn | **KHÔNG CÓ**. Tất cả đều nạp từ `process.env`. |
| Lộ biến môi trường trong Frontend Bundle (`NEXT_PUBLIC_`) | **KHÔNG CÓ**. Toàn bộ repository không sử dụng biến nào có tiền tố `NEXT_PUBLIC_` chứa secret. |
| File cấu hình `.env` trên Git | **AN TOÀN**. File `.env` và `.env.local` đã nằm trong `.gitignore` và không bị track. |

---

## 3. KẾT QUẢ KIỂM THỬ HỆ THỐNG TOÀN DIỆN (TEST SUITE)

```text
======================================================================
1. TEST RUNNER (Vitest):
   - Tổng số file test: 13 / 13 PASS (100%)
   - Tổng số ca kiểm thử: 90 / 90 PASS (100%)
   - Thời gian thực thi: 8.62 giây

2. TYPECHECK (tsc --noEmit):
   - Trạng thái: PASS (0 lỗi)

3. LINT (eslint .):
   - Trạng thái: PASS (0 lỗi, 29 cảnh báo biến UI không dùng đến)

4. BUILD (next build - Turbopack):
   - Trạng thái: PASS (Biên dịch tối ưu trong 685ms, 29/29 routes sẵn sàng)
======================================================================
```

---

## 4. BẢNG ĐÁNH GIÁ SẴN SÀNG PRODUCTION (FINAL DETERMINATION)

```markdown
[x] READY FOR PRODUCTION (Có kèm danh mục thao tác thủ công)
```

### Các việc bạn CẦN thực hiện thủ công trước/ngay khi đưa lên Production:

1. **Rotate Secrets (BẮT BUỘC):**
   - Vào **Azure AD App Registrations**: Tạo mới một `Client Secret` (`MICROSOFT_CLIENT_SECRET`) và dán vào Dashboard của Vercel / Server. Xóa secret cũ từng xuất hiện trong commit lịch sử.
   - Vào **Neon Console**: Đổi mật khẩu database (`DATABASE_URL`) và cập nhật lại biến môi trường trên Vercel.
2. **Cấu hình Microsoft 365 Tenant:**
   - Điền đúng mã `MICROSOFT_TENANT_ID` (Tenant ID của trường UTC) vào biến môi trường để giới hạn chỉ sinh viên/giảng viên nhà trường mới đăng nhập được.
3. **Thực hiện Smoke Test theo hướng dẫn:**
   - Mở file [PRODUCTION_SMOKE_TEST.md](file:///c:/Workspace/Bai_tap_lon_cac_mon/SmartAttend/docs/PRODUCTION_SMOKE_TEST.md) và tích chọn kiểm tra các tính năng trên thiết bị thật (Camera quét QR, Microphone dò sóng siêu âm, Microsoft SSO).
