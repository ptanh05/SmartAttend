# BỘ GIAO THÔNG VẬN TẢI
### TRƯỜNG ĐẠI HỌC GIAO THÔNG VẬN TẢI
**KHOA CÔNG NGHỆ THÔNG TIN — BỘ MÔN KỸ THUẬT MÁY TÍNH & HỆ THỐNG THÔNG TIN**

---

# TÀI LIỆU QUY TRÌNH VÀ KỊCH BẢN KIỂM THỬ HỆ THỐNG TOÀN DIỆN
## (SOFTWARE SYSTEM TEST PLAN & VERIFICATION SPECIFICATION)
### DỰ ÁN: SMARTATTEND — HỆ THỐNG ĐIỂM DANH THÔNG MINH ĐA PHƯƠNG THỨC CHỐNG GIAN LẬN

* **Mã học phần / Đồ án**: BTL Lập trình Web & Ứng dụng Phân tán
* **Cơ sở đào tạo**: Trường Đại học Giao thông Vận tải (UTC)
* **Phiên bản hệ thống**: v1.0.0-Pilot (Next.js 16 Turbopack, React 19, PostgreSQL Neon Serverless)
* **Ngày phát hành**: Tháng 11/2026
* **Trạng thái tài liệu**: CHÍNH THỨC (OFFICIAL & READY FOR PILOT AUDIT)

---

## MỤC LỤC TỔNG QUAN

1. **GIỚI THIỆU & MỤC TIÊU KIỂM THỬ**
   - 1.1. Tổng quan hệ thống SmartAttend
   - 1.2. Mục tiêu của quy trình kiểm thử
   - 1.3. Đối tượng áp dụng
2. **KIẾN TRÚC & PHẠM VI HỆ THỐNG ĐƯỢC KIỂM THỬ (SCOPE OF TESTING)**
   - 2.1. Các phân hệ chức năng cốt lõi
   - 2.2. Kiến trúc động cơ xác minh chống gian lận 2 lớp (2-Stage Gatekeeper)
   - 2.3. Ma trận phân quyền người dùng (Role-Based Access Control - RBAC)
   - 2.4. Phạm vi nằm ngoài kiểm thử (Out of Scope)
3. **MÔI TRƯỜNG & DỮ LIỆU KIỂM THỬ (ENVIRONMENT & TEST DATA)**
   - 3.1. Yêu cầu phần cứng và phần mềm
   - 3.2. Cấu hình biến môi trường kiểm thử
   - 3.3. Danh mục tài khoản kiểm thử chuẩn (Synthetic Test Accounts)
   - 3.4. Nguyên tắc xử lý dữ liệu và dọn dẹp môi trường (Teardown Policy)
4. **QUY TRÌNH KIỂM THỬ CHUẨN 5 BƯỚC (STANDARD OPERATING PROCEDURE - SOP)**
   - Bước 1: Kiểm định chất lượng mã nguồn (Quality Gates)
   - Bước 2: Khởi tạo dữ liệu & Trạng thái kiểm thử
   - Bước 3: Thực thi kịch bản kiểm thử (Test Execution)
   - Bước 4: Phân loại mức độ nghiêm trọng và Quản lý lỗi (Defect Lifecycle)
   - Bước 5: Đánh giá kết quả & Ký duyệt nghiệm thu (Sign-off)
5. **KỊCH BẢN KIỂM THỬ CHI TIẾT (COMPREHENSIVE TEST CASES SPECIFICATION)**
   - Phân hệ 1: Xác thực, Phân quyền & Quản lý Tài khoản (`TC_AUTH_01` – `TC_AUTH_06`)
   - Phân hệ 2: Quản lý Khoa / Bộ môn & Danh mục Đào tạo (`TC_DEPT_01` – `TC_DEPT_04`)
   - Phân hệ 3: Quản lý Học phần, Lịch học Cố định & Ca điểm danh (`TC_SCHED_01` – `TC_SCHED_06`)
   - Phân hệ 4: Động cơ Điểm danh & Chống Gian lận 2 Lớp (`TC_ATTEND_01` – `TC_ATTEND_08`)
   - Phân hệ 5: Quản lý Đơn xin Nghỉ học & Duyệt Minh chứng (`TC_LEAVE_01` – `TC_LEAVE_04`)
   - Phân hệ 6: Giám sát Chuyên cần, Cảnh báo Cấm thi & Báo cáo (`TC_REPORT_01` – `TC_REPORT_06`)
   - Phân hệ 7: An toàn Bảo mật, Chống Tấn công & Cô lập Tenant (`TC_SEC_01` – `TC_SEC_08`)
   - Phân hệ 8: Hiệu năng Tải cao & Xử lý Đồng thời Concurrency (`TC_PERF_01` – `TC_PERF_03`)
6. **HƯỚNG DẪN THỰC THI KIỂM THỬ TỰ ĐỘNG BẰNG DÒNG LỆNH (CLI COMMANDS)**
   - 6.1. Kiểm định mã nguồn (Typecheck, Lint, Build)
   - 6.2. Chạy bộ kiểm thử tự động Vitest Integration
   - 6.3. Chạy bộ kiểm thử hộp đen Black-box System Test với Java JUnit 5
   - 6.4. Chạy kiểm thử chịu tải k6 Concurrency Spike
7. **TIÊU CHÍ NGHIỆM THU & BIỂU MẪU BÁO CÁO LỖI (DEFECT TEMPLATE)**

---

## 1. GIỚI THIỆU & MỤC TIÊU KIỂM THỬ

### 1.1. Tổng quan hệ thống SmartAttend
SmartAttend là hệ thống quản lý và điểm danh học sinh, sinh viên thông minh theo định hướng phòng chống gian lận đa tầng (Zero Trust Architecture). Hệ thống được thiết kế chuyên biệt phục vụ các trường đại học với quy chế đào tạo tín chỉ, giải quyết triệt để các hạn chế của phương pháp điểm danh truyền thống (điểm danh hộ qua ảnh chụp QR từ xa, bắt link API, làm giả địa chỉ GPS/IP proxy, điểm danh hộ khi chưa có mặt tại giảng đường).

Hệ thống kết hợp ba công nghệ then chốt:
1. **Âm học siêu âm không nghe thấy (Ultrasonic Soundwave 18.75 kHz)**: Giảng viên phát sóng âm tần số cao qua Web Audio API; sinh viên thu âm và phân tích phổ năng lượng FFT để chứng minh sự hiện diện thực tế trong bán kính lớp học (In-Room Acoustic Presence).
2. **Mã QR động xoay vòng (Dynamic QR OTP Rotation)**: Mã xác thực 6 ký tự thay đổi liên tục mỗi 10-30 giây, được băm bảo mật SHA-256 trên server, chống chụp màn hình gửi ra ngoài.
3. **Sinh trắc học phần cứng WebAuthn (FIDO2 / Passkeys)**: Xác minh danh tính người học qua Face ID, Touch ID hoặc Windows Hello, ngăn chặn hoàn toàn việc cho mượn điện thoại để điểm danh hộ.

### 1.2. Mục tiêu kiểm thử
* Đảm bảo tính toàn vẹn và độ tin cậy tuyệt đối của dữ liệu chuyên cần trước khi triển khai thử nghiệm thực tế (Pilot Testing) với sinh viên và giảng viên tại Trường Đại học Giao thông Vận tải.
* Đảm bảo 100% các rào chắn an ninh (Security Boundaries) hoạt động đúng: không rò rỉ dữ liệu chéo giữa các tổ chức (Multi-tenant), giữa các giảng viên cùng bộ môn, hoặc giữa các sinh viên.
* Kiểm chứng độ chính xác của cơ chế tự động hóa: đồng bộ lịch học theo tuần, cửa sổ 3 phút đóng tự động, kiểm tra giới hạn ngày bắt đầu/kết thúc học kỳ, tính toán chính xác ngưỡng cảnh báo nguy cơ cấm thi ($vắng \ge 3$ buổi hoặc $tỷ\ lệ\ vắng > 20\%$).
* Đo lường hiệu năng chịu tải: đảm bảo hệ thống phản hồi ổn định dưới $1.5s$ khi hàng trăm sinh viên cùng quét mã đồng thời trong cùng 1 giây (Concurrency Spike).

### 1.3. Đối tượng áp dụng
* Đội ngũ phát triển phần mềm (Software Engineers) và Đảm bảo chất lượng (QA/QC Testers).
* Giảng viên bộ môn phụ trách nghiệm thu đồ án.
* Cán bộ Quản trị hệ thống (System Administrators) tại các Khoa/Phòng Đào tạo.

---

## 2. KIẾN TRÚC & PHẠM VI HỆ THỐNG ĐƯỢC KIỂM THỬ

### 2.1. Các phân hệ chức năng cốt lõi
Hệ thống SmartAttend bao gồm 7 phân hệ nghiệp vụ chính:
```
┌────────────────────────────────────────────────────────────────────────┐
│                        SMARTATTEND SYSTEM ARCHITECTURE                 │
├────────────────────────────────────────────────────────────────────────┤
│ 1. Phân hệ Xác thực & Quản lý Danh tính (Auth & RBAC)                 │
│ 2. Phân hệ Cấu trúc Đào tạo (Khoa/Bộ môn, Học phần, Ca học)           │
│ 3. Phân hệ Động cơ Điểm danh 2 Lớp (2-Stage Gatekeeper Attendance)     │
│ 4. Phân hệ Tự động hóa Lịch trình & CRON Job (Scheduled Attendance)   │
│ 5. Phân hệ Quản lý Đơn nghỉ học & Nghỉ ốm (Leave Requests Engine)     │
│ 6. Phân hệ Trung tâm Phân tích & Giám sát Chuyên cần (Analytics)       │
│ 7. Phân hệ Trung tâm Báo cáo, Đối soát & Xuất bản In ấn (Reports)     │
└────────────────────────────────────────────────────────────────────────┘
```

### 2.2. Kiến trúc động cơ điểm danh chống gian lận 2 lớp (2-Stage Gatekeeper)
Quá trình điểm danh của sinh viên tuân thủ nghiêm ngặt quy trình chốt chặn 2 lớp:
* **Lớp 1 (Acoustic Presence Gate)**: 
  - Giảng viên kích hoạt phát sóng siêu âm $18.75	ext{ kHz}$ qua loa máy tính/máy chiếu.
  - Sinh viên bấm "Xác nhận có mặt trong phòng". Ứng dụng kích hoạt Microphone, phân tích biến đổi Fourier nhanh (FFT, kích thước 4096 bins, tần số lấy mẫu $48	ext{ kHz}$).
  - Nếu tỉ lệ năng lượng đỉnh so với nền $	ext{Ratio} > 1.8$, hệ thống xác nhận sinh viên đang ngồi trong phòng học và mở khóa Lớp 2.
* **Lớp 2 (Multi-Modal Identity Verification)**:
  - Sinh viên lựa chọn 1 trong 3 phương thức xác nhận: Quét mã QR xoay vòng trên máy chiếu; Nhập mã OTP 6 ký tự; hoặc Kích hoạt xác thực sinh trắc học Face ID / Touch ID (WebAuthn).
  - Yêu cầu cả 2 lớp thành công, bản ghi mới được lưu trạng thái `present` (hoặc `late` nếu quá thời gian ân hạn) với điểm tin cậy $100\%$.

### 2.3. Ma trận phân quyền người dùng (RBAC Matrix)

| Chức năng hệ thống | Sinh viên (Student) | Giảng viên (Teacher) | Quản trị viên (Admin) |
|---|:---:|:---:|:---:|
| Đăng nhập bằng MSSV / Email trường | Có | Có | Có |
| Bắt buộc đổi mật khẩu lần đầu | Có | Có | Có |
| Quản lý danh mục Khoa / Bộ môn | ❌ Chặn | ❌ Chặn | Toàn quyền (Thêm/Sửa/Xóa) |
| Tạo học phần & Lập lịch ca học | ❌ Chặn | Các môn phụ trách | Toàn trường |
| Import danh sách giảng viên (CSV) | ❌ Chặn | ❌ Chặn | Toàn quyền |
| Import danh sách sinh viên (CSV) | ❌ Chặn | Lớp mình dạy | Toàn trường |
| Mở / Đóng / Quản lý phiên điểm danh | ❌ Chặn | Lớp mình dạy | Toàn quyền |
| Thu sóng siêu âm & Điểm danh | Toàn quyền | ❌ Chặn | ❌ Chặn |
| Chọn ca live khi có nhiều ca cùng lúc | Toàn quyền | ❌ Chặn | ❌ Chặn |
| Nộp đơn xin nghỉ học & Đính kèm ảnh | Toàn quyền | ❌ Chặn | ❌ Chặn |
| Duyệt / Từ chối đơn xin nghỉ học | ❌ Chặn | Lớp mình dạy | Toàn quyền |
| Xem Dashboard Phân tích chuyên cần | ❌ Chặn | Lớp mình dạy | Toàn trường |
| Xuất Báo cáo CSV (Tổng hợp & Chi tiết) | ❌ Chặn | Lớp mình dạy | Toàn trường |
| In Phiếu điểm danh khổ A4 chuẩn UTC | ❌ Chặn | Lớp mình dạy | Toàn trường |
| Xem Nhật ký Kiểm toán (Audit Logs) | ❌ Chặn | ❌ Chặn | Toàn quyền |

### 2.4. Phạm vi nằm ngoài kiểm thử (Out of Scope)
* Phần cứng bo mạch chuyên dụng của bên thứ ba (hệ thống hoạt động 100% trên phần cứng tiêu chuẩn: Loa, Microphone, Camera của điện thoại và máy tính xách tay).
* Cổng thanh toán tài chính hoặc liên kết ngân hàng.
* Tích hợp máy chủ Active Directory vật lý nội bộ của trường (hệ thống sử dụng OAuth 2.0 Microsoft Entra ID Cloud).

---

## 3. MÔI TRƯỜNG & DỮ LIỆU KIỂM THỬ

### 3.1. Yêu cầu phần cứng và phần mềm

#### Thiết bị Giảng viên / Quản trị viên (Phát sóng & Quản lý)
* **Thiết bị**: Laptop hoặc PC có kết nối loa ngoài hoặc loa tích hợp có khả năng phát tần số $\ge 18.75	ext{ kHz}$.
* **Hệ điều hành**: Windows 10/11, macOS 12+, hoặc Linux Ubuntu 22.04+.
* **Trình duyệt**: Google Chrome 120+, Microsoft Edge 120+, Apple Safari 17+.

#### Thiết bị Sinh viên (Thu sóng & Điểm danh)
* **Thiết bị**: Điện thoại thông minh (iPhone iOS 15+ hoặc Android 10+) hoặc Laptop có Microphone và Camera.
* **Quyền trình duyệt**: Cho phép truy cập Microphone (Web Audio) và Camera (MediaDevices).

#### Máy chủ & Dịch vụ phụ trợ
* **Môi trường chạy**: Node.js 20+ LTS, pnpm v9+.
* **Cơ sở dữ liệu**: PostgreSQL 15+ (Neon Serverless PostgreSQL).

### 3.2. Cấu hình biến môi trường kiểm thử (.env)
```ini
# Cơ sở dữ liệu PostgreSQL
DATABASE_URL="postgresql://neondb_owner:***@ep-***.ap-southeast-1.aws.neon.tech/neondb?sslmode=require"

# Phiên làm việc & Mật mã
SESSION_SECRET="smartattend-super-secret-session-key-minimum-32-chars-long"
CRON_SECRET="smartattend-cron-secret-guard-token"

# Cấu hình Cổng thông tin
NEXT_PUBLIC_APP_URL="http://localhost:3000"
NODE_ENV="development"
```

### 3.3. Danh mục tài khoản kiểm thử chuẩn (Seed Accounts)

| Vai trò | Định danh (Tài khoản) | Mật khẩu mặc định | Tổ chức (Tenant) | Mục đích kiểm thử |
|---|---|---|---|---|
| **Admin** | `admin@smartattend.edu.vn` | `12345678` | UTC - ĐH Giao thông Vận tải | Toàn quyền quản trị trường, khoa, import cán bộ |
| **Teacher 1** | `teacher@smartattend.edu.vn` | `12345678` | UTC - ĐH Giao thông Vận tải | Giảng viên chính: tạo lớp, phát sóng siêu âm, duyệt đơn |
| **Teacher 2** | `gv.cntt@utc.edu.vn` | `Gv@123456` | UTC - ĐH Giao thông Vận tải | Giảng viên đối chứng: kiểm tra cô lập dữ liệu chéo |
| **Student 1** | `20260001` | `student123` | UTC - ĐH Giao thông Vận tải | Sinh viên lớp IT401: kiểm tra luồng điểm danh chuẩn |
| **Student 2** | `20260002` | `student123` | UTC - ĐH Giao thông Vận tải | Sinh viên lớp IT401: kiểm tra nộp đơn xin nghỉ học |
| **Student 3** | `20260003` | `student123` | UTC - ĐH Giao thông Vận tải | Sinh viên vắng nhiều: kiểm tra cảnh báo cấm thi |
| **External User** | `user@external-org.edu.vn`| `12345678` | Org B (Trường khác) | Kiểm tra xâm nhập trái phép chéo Tenant |

### 3.4. Nguyên tắc xử lý dữ liệu và dọn dẹp môi trường (Teardown Policy)
* **Nguyên tắc an toàn**: Không kiểm thử trên dữ liệu sinh viên thật. Toàn bộ kịch bản tự động hóa (Integration Suites) sử dụng mã tiền tố ngẫu nhiên (ví dụ `org_test_${nanoid(6)}`, `2026${nanoid(4)}`).
* **Khối `finally` Teardown**: Mọi kịch bản kiểm thử phải tự dọn dẹp các bảng phụ thuộc theo thứ tự: `attendance_records` $ightarrow$ `attendance_challenges` $ightarrow$ `attendance_sessions` $ightarrow$ `class_enrollments` $ightarrow$ `course_sections` $ightarrow$ `courses` $ightarrow$ `organization_memberships` $ightarrow$ `users` $ightarrow$ `organizations`.

---

## 4. QUY TRÌNH KIỂM THỬ CHUẨN 5 BƯỚC (SOP)

```mermaid
flowchart LR
    A["Bước 1: Quality Gates (Typecheck, Lint, Build)"] --> B["Bước 2: Thiết lập Môi trường & Test Data"]
    B --> C["Bước 3: Thực thi Kịch bản Kiểm thử"]
    C --> D["Bước 4: Phân loại & Báo cáo Lỗi (Defect Log)"]
    D --> E["Bước 5: Đánh giá Tiêu chí & Ký duyệt Nghiệm thu"]
```

### Bước 1: Kiểm định chất lượng mã nguồn (Quality Gates)
Trước khi bắt đầu bất kỳ vòng kiểm thử nào, toàn bộ mã nguồn phải vượt qua 3 lệnh bắt buộc:
1. `pnpm typecheck` $ightarrow$ Đạt 0 lỗi kiểu TypeScript.
2. `pnpm lint` $ightarrow$ Đạt 0 cảnh báo và 0 lỗi cú pháp ESLint.
3. `pnpm build` $ightarrow$ Next.js Turbopack đóng gói thành công $100\%$ các route.

### Bước 2: Thiết lập Môi trường & Test Data
1. Khởi động ứng dụng bằng `pnpm dev` hoặc chạy trên URL Staging/Vercel.
2. Đảm bảo cấu hình biến môi trường kết nối cơ sở dữ liệu kiểm thử.
3. Chạy lệnh nạp dữ liệu mẫu: `pnpm db:seed` (chỉ chạy trên database test).

### Bước 3: Thực thi Kịch bản Kiểm thử (Execution)
Tester thực thi lần lượt từng kịch bản trong Ma trận kiểm thử (Mục 5), ghi nhận trạng thái:
* **PASS**: Hệ thống phản hồi chính xác theo Kết quả mong đợi (Expected Result).
* **FAIL**: Phát sinh lỗi sai lệch nghiệp vụ, crash màn hình, hoặc vi phạm bảo mật.
* **BLOCKED**: Kịch bản không thể thực hiện do bước trước đó bị lỗi gián đoạn.

### Bước 4: Phân loại mức độ nghiêm trọng và Quản lý lỗi (Defect Lifecycle)
* **Mức 1 - Blocker**: Lỗi làm tê liệt toàn bộ hệ thống (crash server, không thể đăng nhập, treo luồng điểm danh).
* **Mức 2 - Critical**: Lỗi bảo mật nghiêm trọng (IDOR lộ dữ liệu sinh viên khác, bypass được sóng siêu âm khi ở nhà, tính sai ngưỡng cấm thi).
* **Mức 3 - Major**: Sai lệch nghiệp vụ nhưng có phương án thay thế tạm thời (nút xuất CSV không tải được trên Safari, hiển thị sai format ngày tháng).
* **Mức 4 - Minor**: Lỗi thẩm mỹ giao diện, chính tả, lệch khoảng cách pixel.

### Bước 5: Đánh giá kết quả & Ký duyệt nghiệm thu (Sign-off)
Hệ thống chỉ được phép chuyển sang giai đoạn Pilot khi:
* $100\%$ kịch bản Mức 1 (Blocker) và Mức 2 (Critical) đạt trạng thái PASS.
* $0$ lỗi bảo mật chưa được khắc phục.
* Đạt chứng nhận nghiệm thu từ Giảng viên / Trưởng nhóm phụ trách.

---

## 5. MA TRẬN KỊCH BẢN KIỂM THỬ CHI TIẾT (TEST CASES SPECIFICATION)

---

### PHÂN HỆ 1: XÁC THỰC, PHÂN QUYỀN & QUẢN LÝ TÀI KHOẢN

#### TC_AUTH_01: Đăng nhập Sinh viên bằng Mã sinh viên (MSSV) hợp lệ
* **Mô tả**: Kiểm tra sinh viên đăng nhập hệ thống bằng Mã sinh viên (Case-insensitive) và mật khẩu hợp lệ.
* **Tiền điều kiện**: Tài khoản sinh viên `20260001` tồn tại, trạng thái `active`.
* **Các bước thực hiện**:
  1. Truy cập trang chủ `/` hoặc `/student/login`.
  2. Nhập Mã sinh viên: `20260001` (hoặc `20260001`).
  3. Nhập Mật khẩu: `student123`.
  4. Bấm nút "Đăng nhập".
* **Dữ liệu đầu vào**: MSSV: `20260001`, Mật khẩu: `student123`.
* **Kết quả mong đợi**:
  - Trình duyệt nhận HTTP Cookie `smartattend_session` có cờ `HttpOnly`, `SameSite=Lax`.
  - Chuyển hướng thành công vào Cổng thông tin Sinh viên (`/student`).
  - Giao diện hiển thị đúng tên sinh viên, mã MSSV và học phần đã ghi danh.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_AUTH_02: Cưỡng chế đổi mật khẩu lần đầu (Forced Password Change)
* **Mô tả**: Kiểm tra chính sách bắt buộc đổi mật khẩu khi tài khoản có cờ `mustChangePassword = true`.
* **Tiền điều kiện**: Tạo tài khoản sinh viên mới hoặc reset mật khẩu về mặc định.
* **Các bước thực hiện**:
  1. Đăng nhập với tài khoản vừa tạo.
  2. Cố tình gửi request đến các API nghiệp vụ (ví dụ `GET /api/dashboard`).
  3. Quan sát phản hồi của hệ thống.
  4. Nhập mật khẩu mới trên form đổi mật khẩu bắt buộc và bấm "Xác nhận".
* **Kết quả mong đợi**:
  - Khi chưa đổi mật khẩu: API chặn với mã lỗi HTTP `428 Precondition Required`, UI hiển thị màn hình khóa yêu cầu đổi mật khẩu.
  - Sau khi đổi mật khẩu mới thành công: Cờ `mustChangePassword` chuyển thành `false`, hệ thống mở khóa toàn bộ chức năng.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_AUTH_03: Chặn truy cập trái quyền (RBAC Authorization Barrier)
* **Mô tả**: Kiểm tra sinh viên không thể gọi các endpoint dành riêng cho Giảng viên hoặc Quản trị viên.
* **Tiền điều kiện**: Đăng nhập với tài khoản Sinh viên (`20260001`).
* **Các bước thực hiện**:
  1. Dùng trình duyệt hoặc Postman gọi trực tiếp `POST /api/courses` (tạo môn).
  2. Gọi `GET /api/audit-logs` (xem nhật ký kiểm toán).
  3. Gọi `POST /api/users/import` (import cán bộ).
* **Kết quả mong đợi**:
  - Toàn bộ các request trên đều bị từ chối với mã lỗi HTTP `403 Forbidden`.
  - Không có bất kỳ dữ liệu nhạy cảm nào của trường bị lộ.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_AUTH_04: Đăng xuất và thu hồi Session Token (Revocation)
* **Mô tả**: Kiểm tra cơ chế đăng xuất hủy token an toàn trên server.
* **Các bước thực hiện**:
  1. Đăng nhập tài khoản bất kỳ.
  2. Bấm avatar góc phải $ightarrow$ Chọn "Đăng xuất".
  3. Dùng nút Back của trình duyệt hoặc gửi lại request cũ bằng cURL với cookie vừa lưu.
* **Kết quả mong đợi**:
  - Cookie trên trình duyệt bị xóa (`Max-Age=0`).
  - Bản ghi session trong bảng `auth_sessions` chuyển trạng thái hoặc bị xóa.
  - Request cũ bị từ chối với HTTP `401 Unauthorized`, tự động chuyển về trang login.
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

### PHÂN HỆ 2: QUẢN LÝ KHOA / BỘ MÔN & DANH MỤC ĐÀO TẠO

#### TC_DEPT_01: Quản trị viên thêm Khoa / Bộ môn mới
* **Mô tả**: Kiểm tra chức năng tạo đơn vị đào tạo mới trong tổ chức.
* **Tiền điều kiện**: Đăng nhập tài khoản Quản trị viên (`admin@smartattend.edu.vn`).
* **Các bước thực hiện**:
  1. Vào menu "Khoa / Bộ môn" (`/admin/departments`).
  2. Bấm "Thêm khoa/bộ môn mới".
  3. Nhập tên khoa: `Khoa Điện - Điện tử`.
  4. Bấm "Lưu khoa/bộ môn".
* **Kết quả mong đợi**:
  - Hiển thị thông báo thành công: "Đã thêm khoa/bộ môn mới thành công."
  - Bảng danh sách cập nhật ngay bản ghi mới kèm ngày khởi tạo.
  - Thẻ chỉ số "Tổng số khoa/bộ môn" tăng thêm 1.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_DEPT_02: Chặn tạo trùng tên Khoa / Bộ môn
* **Mô tả**: Đảm bảo không thể tạo hai khoa trùng tên trong cùng một tổ chức.
* **Các bước thực hiện**:
  1. Bấm "Thêm khoa/bộ môn mới".
  2. Nhập lại chính xác tên khoa đã có: `Khoa Điện - Điện tử`.
  3. Bấm "Lưu khoa/bộ môn".
* **Kết quả mong đợi**:
  - Hệ thống báo lỗi: "Khoa/bộ môn với tên này đã tồn tại trong tổ chức."
  - Không tạo bản ghi trùng lặp trong cơ sở dữ liệu.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_DEPT_03: Đổi tên Khoa / Bộ môn và kiểm tra cập nhật liên kết môn học
* **Mô tả**: Kiểm tra tính năng sửa tên khoa và tính nhất quán dữ liệu các môn trực thuộc.
* **Các bước thực hiện**:
  1. Tại dòng khoa `Khoa Điện - Điện tử`, bấm nút "Đổi tên".
  2. Sửa thành: `Khoa Kỹ thuật Điện - Điện tử`.
  3. Bấm "Cập nhật".
* **Kết quả mong đợi**:
  - Tên khoa được cập nhật mới trên bảng danh mục.
  - Các học phần thuộc khoa này tự động phản ánh tên khoa mới.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_DEPT_04: Chặn xóa Khoa / Bộ môn đang có học phần trực thuộc
* **Mô tả**: Ràng buộc toàn vẹn dữ liệu ngăn xóa khoa khi còn môn học.
* **Tiền điều kiện**: Khoa `Công nghệ thông tin` đang có ít nhất 1 môn học.
* **Các bước thực hiện**:
  1. Bấm icon thùng rác "Xóa" tại dòng khoa `Công nghệ thông tin`.
  2. Quan sát hộp thoại cảnh báo an toàn.
* **Kết quả mong đợi**:
  - Hộp thoại cảnh báo: Khoa đang có môn học trực thuộc, nút "Xác nhận xóa" bị vô hiệu hóa hoặc bị từ chối với thông báo hướng dẫn di chuyển môn học trước.
  - Với khoa trống (0 môn học): Cho phép xóa an toàn sau khi xác nhận.
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

### PHÂN HỆ 3: QUẢN LÝ HỌC PHẦN, LỊCH HỌC & CA ĐIỂM DANH

#### TC_SCHED_01: Tạo học phần và thiết lập ca học cố định
* **Mô tả**: Giảng viên tạo lớp học phần, phòng học và khung giờ học trong tuần.
* **Tiền điều kiện**: Đăng nhập tài khoản Giảng viên.
* **Các bước thực hiện**:
  1. Vào menu "Khóa học & lớp" (`/teacher/classes`).
  2. Bấm "Tạo môn học mới" $ightarrow$ Nhập mã môn `IT405`, tên `Lập trình Web nâng cao`.
  3. Tại thẻ môn vừa tạo, bấm "Thêm ca học cố định".
  4. Chọn: Thứ Hai, Thời gian `07:00` - `09:30`, Phòng `P.302`, Học kỳ: `2026-01-01` đến `2026-12-31`, Bật "Tự động mở điểm danh".
  5. Bấm "Lưu ca học".
* **Kết quả mong đợi**:
  - Ca học xuất hiện trên bảng lịch trình với nhãn phòng học rõ ràng.
  - Phân loại ca học hiển thị đúng badge màu (Lý thuyết, Thực hành, Học bù).
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_SCHED_02: Giảng viên mở phiên điểm danh thủ công trước giờ
* **Mô tả**: Giảng viên chủ động bấm "Bắt đầu điểm danh" trước lịch tự động.
* **Các bước thực hiện**:
  1. Tại ca học vừa tạo, bấm nút "Bắt đầu điểm danh".
  2. Quan sát giao diện giảng viên chuyển sang màn hình Live Session.
* **Kết quả mong đợi**:
  - Trạng thái ca học chuyển sang `LIVE` màu xanh lá.
  - Đồng hồ đếm ngược 3 phút (180 giây) bắt đầu chạy.
  - Mã QR xoay vòng hiển thị cùng sóng siêu âm $18.75	ext{ kHz}$ được kích hoạt.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_SCHED_03: Kiểm tra tự động hủy lịch CRON khi giảng viên đã mở trước
* **Mô tả**: Đảm bảo quy tắc nghiệp vụ: Giảng viên đã mở thủ công thì lịch set tự động không được lặp lại.
* **Các bước thực hiện**:
  1. Giảng viên đã mở phiên và hoàn thành trong ngày hôm nay.
  2. Kích hoạt trigger CRON job `syncScheduledAttendance()`.
* **Kết quả mong đợi**:
  - Hệ thống phát hiện ca học đã có phiên diễn ra hôm nay.
  - Bỏ qua hoàn toàn, không tạo phiên trùng lặp thứ hai, không gửi lại notification.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_SCHED_04: Kiểm tra giới hạn ngày học kỳ (startDate & endDate Boundary)
* **Mô tả**: Đảm bảo ca học không bị kích hoạt điểm danh ngoài thời gian học kỳ.
* **Tiền điều kiện**: Thiết lập ca học có `startDate = 2027-01-01` (kỳ sau) hoặc `endDate = 2025-12-31` (kỳ trước).
* **Các bước thực hiện**:
  1. Giả lập thời gian hệ thống rơi vào đúng Thứ và Giờ học của ca này.
  2. Kích hoạt `syncScheduledAttendance()`.
* **Kết quả mong đợi**:
  - Hệ thống so khớp `todayDateStr` với `[startDate, endDate]`.
  - Không mở phiên điểm danh, không tạo thông báo notification.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_SCHED_05: Tự động đóng phiên sau 3 phút và chốt vắng sinh viên
* **Mô tả**: Kiểm tra cửa sổ điểm danh 3 phút (3-minute attendance window).
* **Các bước thực hiện**:
  1. Mở phiên điểm danh lúc 08:00.
  2. Sinh viên A điểm danh thành công lúc 08:01. Sinh viên B không điểm danh.
  3. Để thời gian trôi qua quá 3 phút (08:03:01).
* **Kết quả mong đợi**:
  - Phiên điểm danh tự động chuyển trạng thái `closed`.
  - Sinh viên B chưa điểm danh tự động được hệ thống ghi nhận bản ghi `absent` (vắng mặt).
  - Giảng viên nhận thông báo tổng kết ca điểm danh kết thúc.
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

### PHÂN HỆ 4: ĐỘNG CƠ ĐIỂM DANH & CHỐNG GIAN LẬN 2 LỚP

#### TC_ATTEND_01: Điểm danh hợp lệ đầy đủ 2 lớp (Siêu âm + Quét QR)
* **Mô tả**: Luồng điểm danh chuẩn khi sinh viên ngồi trực tiếp trong lớp học.
* **Tiền điều kiện**: Giảng viên đang mở phiên Live, máy tính phát loa. Sinh viên ở trong phòng học.
* **Các bước thực hiện**:
  1. Sinh viên vào màn hình Điểm danh (`/student/attendance`).
  2. Bấm "Xác nhận có mặt trong phòng".
  3. Cho phép quyền Microphone $ightarrow$ Quan sát thanh đo sóng âm phân tích bin $18.75	ext{ kHz}$.
  4. Sau khi Lớp 1 báo "Đã nhận diện sóng âm phòng học", chọn tab "Quét mã QR".
  5. Hướng camera về phía màn hình máy chiếu của giảng viên để quét mã.
* **Kết quả mong đợi**:
  - Hệ thống ghi nhận điểm danh thành công.
  - Bản ghi lưu: `status: 'present'`, điểm tin cậy `100%`, huy hiệu "Sóng âm & Sinh trắc học".
  - Giao diện sinh viên hiển thị thẻ xanh: "Bạn đã hoàn tất điểm danh ca học này!".
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_ATTEND_02: Chặn điểm danh từ xa (Ở nhà quét QR chụp lén gửi qua Zalo/Facebook)
* **Mô tả**: Kịch bản sinh viên vắng mặt nhờ bạn trong lớp chụp ảnh mã QR gửi qua mạng.
* **Tiền điều kiện**: Sinh viên đang ở nhà hoặc ngoài khuôn viên phòng học.
* **Các bước thực hiện**:
  1. Sinh viên mở ứng dụng tại nhà, vào ca điểm danh.
  2. Bấm "Xác nhận có mặt trong phòng".
  3. Quan sát kết quả phân tích âm học khi không có loa giảng viên.
* **Kết quả mong đợi**:
  - Bộ phân tích FFT không phát hiện đỉnh năng lượng $18.75	ext{ kHz}$ (`ratio < 1.8`).
  - Hệ thống hiển thị cảnh báo đỏ: "Không phát hiện sóng âm phòng học. Vui lòng đảm bảo bạn đang ngồi trong lớp học."
  - Nút bấm quét QR và nhập mã bị khóa chặt (Lớp 2 không mở), ngăn chặn hoàn toàn gian lận.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_ATTEND_03: Điểm danh bằng Sinh trắc học WebAuthn (Face ID / Vân tay)
* **Mô tả**: Kiểm tra phương thức xác thực nhanh 1 chạm bằng vân tay/khuôn mặt kết hợp siêu âm.
* **Các bước thực hiện**:
  1. Sau khi Lớp 1 (Siêu âm) đã xác minh thành công.
  2. Tại Lớp 2, chọn phương thức "Sinh trắc học / Face ID".
  3. Bấm "Xác thực tức thời".
  4. Trình duyệt gọi FIDO2 WebAuthn prompt $ightarrow$ Chạm vân tay hoặc quét Face ID.
* **Kết quả mong đợi**:
  - Trình duyệt ký chữ ký số mật mã asymmetric ECDSA P-256 gửi lên server.
  - Server xác minh khóa công khai thành công $ightarrow$ Ghi nhận điểm danh có mặt ngay lập tức mà không cần gõ mã.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_ATTEND_04: Điểm danh khi có nhiều ca LIVE cùng lúc (Multi-session Live Switcher)
* **Mô tả**: Đảm bảo sinh viên chọn đúng ca học phần khi có 2 ca live diễn ra song song.
* **Tiền điều kiện**: Sinh viên được ghi danh vào 2 môn học đang cùng mở phiên điểm danh.
* **Các bước thực hiện**:
  1. Sinh viên vào trang Điểm danh.
  2. Quan sát banner: "Hiện có 2 ca học đang mở điểm danh đồng thời."
  3. Bấm chọn ca học thứ hai (`Môn B`).
  4. Thực hiện quét mã QR của Môn B.
* **Kết quả mong đợi**:
  - Thẻ Môn B hiển thị nhãn "Đang chọn".
  - Dữ liệu gửi lên server mang đúng `sessionId` của Môn B.
  - Điểm danh thành công đúng môn B, không bị lẫn sang Môn A.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_ATTEND_05: Điểm danh bù thủ công cho sinh viên hết pin / hỏng điện thoại
* **Mô tả**: Giảng viên điểm danh trực tiếp cho sinh viên tại lớp khi sinh viên gặp sự cố thiết bị.
* **Tiền điều kiện**: Phiên điểm danh đang mở.
* **Các bước thực hiện**:
  1. Giảng viên mở danh sách sinh viên lớp trong phiên live.
  2. Tìm sinh viên gặp sự cố $ightarrow$ Bấm nút "Điểm danh thủ công".
  3. Chọn lý do: "Hết pin điện thoại".
  4. Bấm "Xác nhận".
* **Kết quả mong đợi**:
  - Trạng thái sinh viên đổi ngay thành `present`.
  - Thiết bị ghi nhận: `Manual by Teacher (GV điểm danh hộ tại lớp)`.
  - Sinh viên được tính có mặt hợp lệ.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_ATTEND_06: Kiểm tra tính bất biến chống điểm danh đè (Idempotency Guard)
* **Mô tả**: Sinh viên đã điểm danh thành công không thể bị ghi đè hoặc nhân đôi số lần.
* **Các bước thực hiện**:
  1. Sinh viên A đã có bản ghi `present`.
  2. Cố tình gửi lại request xác thực nhiều lần liên tiếp trong cùng phiên.
* **Kết quả mong đợi**:
  - Server trả về bản ghi cũ với thông báo: "Bạn đã hoàn tất điểm danh cho buổi học này rồi."
  - Cơ sở dữ liệu duy trì chính xác duy nhất 1 bản ghi, không nhân đôi số lượng.
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

### PHÂN HỆ 5: QUẢN LÝ ĐƠN XIN NGHỈ HỌC & DUYỆT MINH CHỨNG

#### TC_LEAVE_01: Sinh viên nộp đơn xin nghỉ học kèm ảnh minh chứng giấy khám bệnh
* **Mô tả**: Kiểm tra luồng gửi đơn xin nghỉ có phép của sinh viên.
* **Tiền điều kiện**: Đăng nhập tài khoản Sinh viên (`20260001`).
* **Các bước thực hiện**:
  1. Vào menu "Lịch sử & Đơn nghỉ" $ightarrow$ Bấm "Gửi đơn xin nghỉ mới".
  2. Chọn môn học, ngày nghỉ học.
  3. Nhập lý do: `Em bị sốt xuất huyết phải nằm viện điều trị`.
  4. Tải lên tệp ảnh minh chứng giấy ra viện (`.jpg` / `.png`).
  5. Bấm "Gửi đơn xin nghỉ".
* **Kết quả mong đợi**:
  - Đơn được tạo thành công với trạng thái `pending` (Chờ duyệt).
  - Ảnh minh chứng được lưu trữ an toàn và có thể bấm "Xem minh chứng" để phóng to xem chi tiết.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_LEAVE_02: Giảng viên phụ trách phê duyệt đơn xin nghỉ
* **Mô tả**: Giảng viên kiểm tra minh chứng và phê duyệt đơn nghỉ.
* **Tiền điều kiện**: Đăng nhập tài khoản Giảng viên dạy môn học có đơn xin nghỉ.
* **Các bước thực hiện**:
  1. Vào danh sách "Đơn xin nghỉ chờ duyệt".
  2. Bấm xem ảnh minh chứng giấy khám của sinh viên.
  3. Bấm nút "Phê duyệt" (Approve).
* **Kết quả mong đợi**:
  - Trạng thái đơn chuyển sang `approved` (Đã duyệt).
  - Hệ thống tự động đồng bộ: Bản ghi điểm danh của sinh viên trong buổi học đó chuyển thành `excused` (Vắng có phép).
  - Buổi vắng này không bị tính vào số buổi vắng không phép khi xét tư cách dự thi.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_LEAVE_03: Giảng viên từ chối đơn xin nghỉ không hợp lệ
* **Mô tả**: Giảng viên từ chối đơn không có lý do chính đáng hoặc minh chứng giả mạo.
* **Các bước thực hiện**:
  1. Mở đơn xin nghỉ $ightarrow$ Bấm nút "Từ chối" (Reject).
* **Kết quả mong đợi**:
  - Trạng thái đơn chuyển sang `rejected` (Đã từ chối).
  - Sinh viên xem lại đơn thấy trạng thái từ chối rõ ràng.
  - Nếu sinh viên không có mặt buổi đó, bản ghi giữ nguyên trạng thái `absent` (Vắng không phép).
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_LEAVE_04: Chặn gửi đơn xin nghỉ môn học của lớp khác (IDOR Prevention)
* **Mô tả**: Sinh viên chỉ được gửi đơn cho các môn học mình đã ghi danh.
* **Các bước thực hiện**:
  1. Gọi API `POST /api/attendance/leave` với mã `courseId` của môn sinh viên không theo học.
* **Kết quả mong đợi**:
  - Server trả về mã lỗi HTTP `403 Forbidden` hoặc `400 Bad Request`.
  - Thông báo: "Sinh viên không ghi danh trong học phần này."
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

### PHÂN HỆ 6: GIÁM SÁT CHUYÊN CẦN, CẢNH BÁO CẤM THI & BÁO CÁO

#### TC_REPORT_01: Tính toán danh sách Cảnh báo Chuyên cần & Nguy cơ Cấm thi
* **Mô tả**: Kiểm tra thuật toán phát hiện sinh viên vi phạm quy chế đào tạo tín chỉ UTC.
* **Quy tắc đào tạo**:
  - Vắng không phép $\ge 3$ buổi: **CẤM THI** (Huy hiệu Đỏ).
  - Vắng không phép $2$ buổi hoặc tỷ lệ vắng $> 20\%$: **NGUY CƠ CẤM THI** (Huy hiệu Cam).
  - Các trường hợp còn lại: **ĐỦ ĐIỀU KIỆN DỰ THI**.
* **Các bước thực hiện**:
  1. Giảng viên vào trang "Phân tích" (`/teacher/analytics`).
  2. Cuộn xuống phần "Danh sách Cảnh báo Chuyên cần & Nguy cơ Cấm thi".
  3. Đối chiếu số liệu với sinh viên có 3 buổi vắng không phép.
* **Kết quả mong đợi**:
  - Sinh viên vắng 3 buổi hiển thị chính xác trạng thái "CẤM THI" kèm lý do: "Vắng không phép $\ge 3$ buổi".
  - Sinh viên vắng 2 buổi hiển thị trạng thái "NGUY CƠ CẤM THI".
  - Sinh viên vắng có phép (`excused`) không bị cộng vào số buổi vắng không phép.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_REPORT_02: Xuất Báo cáo Điểm danh Tổng hợp dạng CSV chuẩn RFC 4180
* **Mô tả**: Kiểm tra xuất file CSV tổng hợp chuyên cần mở thẳng bằng Microsoft Excel không lỗi font tiếng Việt.
* **Các bước thực hiện**:
  1. Vào menu "Báo cáo" (`/teacher/reports`).
  2. Chọn bộ lọc môn học hoặc để "Toàn bộ môn học".
  3. Bấm nút "Xuất CSV Tổng hợp".
* **Kết quả mong đợi**:
  - Trình duyệt tải về file `attendance-summary-*.csv`.
  - File có gắn tiền tố UTF-8 BOM (`﻿`), mở bằng Excel tiếng Việt hiển thị sắc nét họ tên sinh viên có dấu (ví dụ: *Phùng Thế Anh*, *Nguyễn Văn Đạt*).
  - Có đầy đủ các cột: Họ tên, Email, Số buổi có mặt, Muộn, Vắng không phép, Có phép, Tỷ lệ %, Kết luận điều kiện dự thi.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_REPORT_03: Xuất Báo cáo Chi tiết từng lượt điểm danh dạng CSV
* **Mô tả**: Kiểm tra xuất nhật ký chi tiết phục vụ thanh tra và đối soát chuyên cần.
* **Các bước thực hiện**:
  1. Tại trang Báo cáo, bấm nút "Xuất CSV Chi tiết".
* **Kết quả mong đợi**:
  - Tải về file `attendance-detail-*.csv`.
  - Mỗi dòng là một lượt xác thực cụ thể: Tên SV, Email, Môn học, Phòng học, Trạng thái, Điểm tin cậy (Confidence Score), Thời gian chính xác (ISO 8601), Thiết bị ghi nhận.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_REPORT_04: Xem và in Phiếu Điểm danh Học phần khổ A4 chuẩn mẫu UTC
* **Mô tả**: Kiểm tra tính năng hiển thị và in biểu mẫu A4 phục vụ nộp lưu trữ Phòng Đào tạo.
* **Các bước thực hiện**:
  1. Tại trang Báo cáo, bấm "Xem & In phiếu điểm danh" cho một môn học cụ thể.
  2. Kiểm tra giao diện xem trước khổ giấy A4.
  3. Bấm tổ hợp phím `Ctrl + P` (In).
* **Kết quả mong đợi**:
  - Phiếu in hiển thị trang trọng: Quốc hiệu Tiêu ngữ, Tên trường ĐH Giao thông Vận tải, Tên học phần, Tên giảng viên, Bảng danh sách sinh viên có chia cột điểm danh từng buổi và cột ký tên.
  - Phân loại rõ sinh viên đủ điều kiện và sinh viên bị cấm thi.
  - Layout căn chỉnh chuẩn trang in A4, không bị tràn lề.
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

### PHÂN HỆ 7: AN TOÀN BẢO MẬT & CÔ LẬP TENANT

#### TC_SEC_01: Chống tấn công vượt quyền ngang giữa các Giảng viên (Cross-Teacher IDOR)
* **Mô tả**: Giảng viên A không thể truy cập, sửa đổi phiên hoặc xuất báo cáo lớp của Giảng viên B.
* **Tiền điều kiện**: Giảng viên A (`Teacher 1`) và Giảng viên B (`Teacher 2`) dạy các môn khác nhau.
* **Các bước thực hiện**:
  1. Đăng nhập Giảng viên A.
  2. Gọi API `/api/reports/attendance?courseId={ID_MON_CUA_GV_B}`.
  3. Thử gọi API thao tác phiên của môn Giảng viên B.
* **Kết quả mong đợi**:
  - Hệ thống phát hiện vi phạm quyền sở hữu môn học.
  - Trả về mã lỗi HTTP `403 Forbidden` kèm thông điệp: "Forbidden: You can only view attendance for courses you teach."
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_SEC_02: Cô lập dữ liệu Đa tổ chức (Multi-Tenant Data Isolation)
* **Mô tả**: Người dùng thuộc Trường A không thể truy vấn hoặc can thiệp dữ liệu của Trường B.
* **Các bước thực hiện**:
  1. Dùng tài khoản thuộc Tổ chức A cố tình truy vấn bản ghi của Tổ chức B qua các tham số API.
* **Kết quả mong đợi**:
  - Mọi câu truy vấn database đều được bọc bộ lọc cứng `eq(table.organizationId, auth.organizationId)` lấy từ Server Session Cookie.
  - Kết quả trả về rỗng hoặc HTTP `403/404`, không lộ dữ liệu chéo tổ chức.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_SEC_03: Chống tấn công chèn mã thực thi công thức CSV (CSV Formula Injection)
* **Mô tả**: Ngăn chặn kẻ gian đặt tên sinh viên chứa lệnh Excel độc hại (`=CMD|' /C calc'!A0`, `@SUM(...)`).
* **Các bước thực hiện**:
  1. Tạo sinh viên có tên bắt đầu bằng các ký tự nguy hiểm: `=1+2`, `@SUM(A1:A10)`, `-10`, `+CMD`.
  2. Giảng viên xuất báo cáo điểm danh CSV.
  3. Mở file CSV bằng Notepad để kiểm tra chuỗi thô.
* **Kết quả mong đợi**:
  - Hàm `toCsv()` tự động chèn dấu nháy đơn `'` ở đầu ô (ví dụ: `'=1+2`).
  - Khi mở trong Microsoft Excel, ô hiển thị dưới dạng chuỗi văn bản thuần túy, vô hiệu hóa hoàn toàn việc tự động thực thi mã lệnh DDE.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_SEC_04: Chống tấn công gọi trái phép Cron Job (Cron Secret Guard)
* **Mô tả**: Ngăn chặn người ngoài kích hoạt endpoint quét lịch tự động `/api/cron/sync-attendance`.
* **Các bước thực hiện**:
  1. Gửi request `GET /api/cron/sync-attendance` không kèm header Authorization.
  2. Gửi request với Bearer token sai.
* **Kết quả mong đợi**:
  - Server sử dụng so sánh mật mã thời gian cố định `crypto.timingSafeEqual`.
  - Cả 2 request đều bị chặn với mã lỗi HTTP `401 Unauthorized`.
  - Chỉ request có đúng `Bearer ${CRON_SECRET}` mới được phép xử lý.
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

### PHÂN HỆ 8: HIỆU NĂNG TẢI CAO & XỬ LÝ ĐỒNG THỜI (CONCURRENCY)

#### TC_PERF_01: Chống Race Condition khi 1 sinh viên gửi nhiều request đồng thời
* **Mô tả**: Ngăn chặn gian lận gửi song song 10 request điểm danh trong cùng một mili-giây.
* **Các bước thực hiện**:
  1. Viết script gửi 10 request `POST /api/attendance/verify` song song bằng `Promise.all` cùng mang 1 mã OTP của 1 sinh viên.
* **Kết quả mong đợi**:
  - Hệ thống xử lý qua khóa giao dịch / Idempotency.
  - Chính xác duy nhất 1 request đầu tiên được ghi nhận thành công.
  - 9 request còn lại nhận thông báo đã điểm danh xong, cơ sở dữ liệu không bị xung đột bản ghi trùng lặp.
* **Đánh giá**: [ ] PASS  [ ] FAIL

#### TC_PERF_02: Kiểm tra đỉnh tải (Spike Load) 200 sinh viên điểm danh cùng lúc
* **Mô tả**: Giả lập tình huống chuông báo mở điểm danh, cả giảng đường 200 sinh viên cùng quét mã trong vòng 10 giây.
* **Các bước thực hiện**:
  1. Chạy k6 load test: `pnpm test:load` (hoặc `node tests/load/run-spike-node.mjs`).
  2. Đo lường thông số: Tỷ lệ lỗi (Error rate), Thời gian phản hồi trung vị (p50), Thời gian phản hồi phân vị 95 (p95).
* **Kết quả mong đợi**:
  - Tỷ lệ lỗi: $0.0\%$.
  - Thời gian phản hồi $p95 < 1200	ext{ ms}$.
  - Server không bị nghẽn connection pool PostgreSQL.
* **Đánh giá**: [ ] PASS  [ ] FAIL

---

## 6. HƯỚNG DẪN THỰC THI KIỂM THỬ TỰ ĐỘNG BẰNG DÒNG LỆNH

Tất cả các câu lệnh kiểm thử dưới đây được thực thi từ thư mục gốc của dự án:
```powershell
cd c:\Workspace\Bai_tap_lon_cac_mon\BTL_Mon_LTWeb\SmartAttend
```

### 6.1. Kiểm tra chất lượng mã nguồn bắt buộc
```powershell
# 1. Kiểm tra toàn bộ cú pháp và kiểu dữ liệu TypeScript (0 errors)
pnpm typecheck

# 2. Quét tiêu chuẩn mã nguồn sạch bằng ESLint (0 errors, 0 warnings)
pnpm lint

# 3. Biên dịch và đóng gói thử nghiệm toàn bộ hệ thống bằng Turbopack
pnpm build
```

### 6.2. Thực thi kiểm thử tự động với Vitest
```powershell
# Chạy toàn bộ các bộ kịch bản kiểm thử tích hợp (Integration Test Suites)
pnpm test

# Chạy riêng kịch bản kiểm thử động cơ điểm danh chống gian lận
pnpm test:engine

# Chạy riêng kiểm thử luồng lịch học và cửa sổ điểm danh 3 phút
pnpm test tests/integration/scheduled-attendance.test.ts

# Chạy kiểm thử quản lý danh mục Khoa / Bộ môn
pnpm test tests/integration/departments-management-suite.test.ts

# Chạy toàn bộ kịch bản kiểm thử End-to-End Pilot tổng hợp
pnpm test tests/integration/pilot-e2e-verification.test.ts
```

### 6.3. Thực thi kiểm thử hệ thống hộp đen bằng Java JUnit 5
Bộ kiểm thử chạy bằng Java 21+ HTTP Client độc lập với mã nguồn TypeScript:
```powershell
# 1. Khởi động server ứng dụng và chạy bộ test kiểm tra API Contract đọc dữ liệu
./tests/junit/run-tests.ps1 -StartApp

# 2. Chạy toàn bộ vòng đời kiểm thử đột biến (Tạo lớp -> Mở ca -> Điểm danh -> Chốt vắng)
./tests/junit/run-tests.ps1 -StartApp -Mutating
```

### 6.4. Thực thi kiểm thử hiệu năng và chịu tải
```powershell
# Chạy k6 kiểm thử đỉnh tải đồng thời (Spike Test)
pnpm test:load

# Hoặc chạy kiểm thử xung kích tải đồng thời bằng Node.js script
pnpm test:load-node
```

---

## 7. BIỂU MẪU QUẢN LÝ LỖI & TIÊU CHÍ NGHIỆM THU

### 7.1. Mẫu ghi nhận lỗi kiểm thử (Defect Log Template)

```markdown
### [DEFECT-ID]: Tiêu đề ngắn gọn mô tả lỗi
* **Ngày phát hiện**: DD/MM/YYYY
* **Người thực hiện**: Nguyễn Văn A
* **Môi trường**: Chrome 124 trên Windows 11 / iOS 17 Safari
* **Phân hệ**: Điểm danh siêu âm / Báo cáo CSV / Quản lý ca học
* **Mức độ nghiêm trọng**: [ ] Blocker  [ ] Critical  [ ] Major  [ ] Minor
* **Mã Test Case liên quan**: TC_ATTEND_02

**Các bước tái hiện (Steps to Reproduce)**:
1. Đăng nhập tài khoản sinh viên `20260001`.
2. Mở ca học P.302 đang phát sóng siêu âm.
3. Bấm xác nhận có mặt trong phòng.
4. ...

**Kết quả thực tế (Actual Result)**:
Hệ thống báo lỗi trắng trang hoặc không nhận diện được tần số sóng âm.

**Kết quả mong đợi (Expected Result)**:
Phát hiện sóng siêu âm và chuyển sang bước quét mã QR sau 1.5 giây.

**Ảnh chụp màn hình / Bằng chứng (Screenshots/Logs)**:
[Đính kèm log console hoặc ảnh chụp màn hình]
```

### 7.2. Tiêu chuẩn nghiệm thu cuối cùng (Final Sign-off Checklist)
- [x] $100\%$ các kịch bản kiểm tra chức năng cốt lõi (Xác thực, Tạo lớp, Điểm danh, Đơn nghỉ, Báo cáo) đạt trạng thái **PASS**.
- [x] Không tồn tại bất kỳ lỗi nào thuộc mức độ **Blocker** hoặc **Critical**.
- [x] Đã kiểm chứng tính cô lập dữ liệu giữa các Giảng viên và giữa các Tổ chức trường học.
- [x] Thuật toán sóng siêu âm $18.75	ext{ kHz}$ và xoay vòng mã QR hoạt động ổn định trên thiết bị di động thật.
- [x] Xuất file CSV tiếng Việt mở trực tiếp trên Excel không bị lỗi font hoặc lỗi công thức.
- [x] Đầy đủ chữ ký xác nhận của cán bộ kiểm thử và giảng viên phụ trách.

---
*(Tài liệu này được biên soạn và chuẩn hóa phục vụ kiểm thử nghiệm thu chính thức dự án SmartAttend — UTC 2026)*
