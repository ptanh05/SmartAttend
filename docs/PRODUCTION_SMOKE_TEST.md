# SMARTATTEND — PRODUCTION SMOKE TEST CHECKLIST

Tài liệu này cung cấp danh sách kiểm tra (Checklist) dành cho Quản trị viên/Kỹ sư vận hành tự kiểm thử nghiệm thu (Smoke Test) trực tiếp trên domain Production sau khi deploy.

---

## BẢNG CHECKLIST NGHIỆM THU PRODUCTION

| Mục Kiểm Thử | Trạng Thái Kiểm Thử Trong Code | Phương Pháp Kiểm Tra Trên Production | Kết Quả Nghiệm Thu |
| :--- | :--- | :--- | :---: |
| **1. Student login** (Mật khẩu / Mã SV) | **AUTOMATED** (Vitest integration test) | Đăng nhập tài khoản sinh viên tại `/student/login` | [ ] ĐẠT |
| **2. Student logout** | **AUTOMATED** (Session clear & cookie delete) | Bấm "Đăng xuất" góc phải, kiểm tra cookie `sa_session` bị xoá | [ ] ĐẠT |
| **3. Teacher login** (Email / Mật khẩu) | **AUTOMATED** (Vitest integration test) | Đăng nhập tài khoản giảng viên tại `/staff/login` | [ ] ĐẠT |
| **4. Admin login** | **AUTOMATED** (Role-based auth test) | Đăng nhập tài khoản quản trị viên tại `/staff/login` | [ ] ĐẠT |
| **5. Microsoft 365 login** | **MANUAL REQUIRED** *(Cần Azure App credentials)* | Bấm nút "Đăng nhập với Microsoft 365" tại Cổng Sinh viên/Cán bộ | [ ] ĐẠT |
| **6. Wrong Microsoft tenant** | **MANUAL REQUIRED** *(Cần tài khoản ngoài trường)* | Thử đăng nhập bằng tài khoản `@outlook.com` cá nhân -> Phải bị từ chối | [ ] ĐẠT |
| **7. Student dashboard** | **AUTOMATED** (Next.js route + Client UI) | Kiểm tra hiển thị danh sách lớp học phần, lịch học hôm nay | [ ] ĐẠT |
| **8. Teacher dashboard** | **AUTOMATED** (Dashboard query tests) | Kiểm tra hiển thị lớp phụ trách, số sinh viên, tỉ lệ chuyên cần | [ ] ĐẠT |
| **9. Create attendance session** | **AUTOMATED** (Vitest `attendance-flow.test.ts`) | Giảng viên bấm bắt đầu buổi học (Start Session) | [ ] ĐẠT |
| **10. QR / OTP dynamic code** | **AUTOMATED** (Vitest challenge tests) | Giảng viên bật chiếu mã QR, kiểm tra mã tự động nhảy mỗi 15-30 giây | [ ] ĐẠT |
| **11. Student attendance** | **AUTOMATED** (Vitest verify tests) | Sinh viên quét mã / nhập OTP để điểm danh | [ ] ĐẠT |
| **12. Duplicate attendance** | **AUTOMATED** (Vitest `security-audit-cases.test.ts`) | Sinh viên điểm danh lại lần 2 -> Hệ thống giữ nguyên bản ghi hiện tại, thông báo đã điểm danh | [ ] ĐẠT |
| **13. Expired challenge** | **AUTOMATED** (Vitest `security-audit-cases.test.ts`) | Nhập mã OTP đã hết hạn sau chu kỳ đếm lùi -> Phải báo mã hết hạn | [ ] ĐẠT |
| **14. Suspicious attempt** | **AUTOMATED** (Vitest `security-audit-cases.test.ts`) | Điểm danh từ thiết bị lạ khi bật "Yêu cầu thiết bị tin cậy" -> Cảnh báo hiển thị ở mục Bất thường | [ ] ĐẠT |
| **15. Leave request** | **AUTOMATED** (Vitest `leave.test.ts`) | Sinh viên gửi đơn xin nghỉ phép có lý do | [ ] ĐẠT |
| **16. Teacher approval** | **AUTOMATED** (Vitest `leave.test.ts`) | Giảng viên vào duyệt đơn (chỉ duyệt được lớp của mình) | [ ] ĐẠT |
| **17. Attendance → excused** | **AUTOMATED** (Vitest `leave.test.ts`) | Sau khi giảng viên duyệt đơn, trạng thái điểm danh buổi đó tự động chuyển sang "Có phép" | [ ] ĐẠT |
| **18. Notification** | **AUTOMATED** (Vitest notification tests) | Sinh viên nhận được thông báo chuông về kết quả điểm danh / duyệt phép | [ ] ĐẠT |
| **19. WebAuthn (Passkey)** | **MANUAL REQUIRED** *(Phụ thuộc phần cứng thiết bị)* | Sinh viên đăng ký Face ID / Touch ID / Windows Hello trên thiết bị | [ ] ĐẠT |
| **20. Mobile Chrome** | **MANUAL REQUIRED** *(Phụ thuộc thiết bị Android/iOS)* | Mở website trên Google Chrome điện thoại, kiểm tra giao diện responsive | [ ] ĐẠT |
| **21. Mobile Safari** | **MANUAL REQUIRED** *(Phụ thuộc iPhone/iPad)* | Mở website trên Safari iOS, kiểm tra Touch ID / Face ID WebAuthn | [ ] ĐẠT |
| **22. Camera permission** | **MANUAL REQUIRED** *(Yêu cầu HTTPS & phần cứng)* | Bật camera quét mã QR, trình duyệt hỏi quyền truy cập Camera | [ ] ĐẠT |
| **23. Microphone permission** | **MANUAL REQUIRED** *(Yêu cầu HTTPS & phần cứng)* | Bật tính năng dò sóng siêu âm (Ultrasonic), trình duyệt hỏi quyền Microphone | [ ] ĐẠT |

---

## HƯỚNG DẪN CHI TIẾT TỪNG BƯỚC THỰC HIỆN THỦ CÔNG

### Bước 1: Kiểm Tra HTTPS và Camera / Microphone (Yêu cầu 22 & 23)
1. Truy cập trang web qua giao thức HTTPS (ví dụ: `https://smart-attend-snowy.vercel.app`). *Lưu ý: Camera và Web Audio API dò sóng siêu âm bắt buộc chạy trên HTTPS*.
2. Tại màn hình sinh viên điểm danh, bấm "Quét mã QR" -> Chọn **Cho phép (Allow)** khi trình duyệt hỏi quyền Camera.
3. Bấm "Xác thực Sóng siêu âm & Face ID" -> Chọn **Cho phép (Allow)** khi trình duyệt hỏi quyền Microphone.

### Bước 2: Kiểm Tra Microsoft 365 OAuth (Yêu cầu 5 & 6)
1. Đảm bảo đã cập nhật 3 biến môi trường trên Vercel:
   - `MICROSOFT_CLIENT_ID`
   - `MICROSOFT_CLIENT_SECRET`
   - `MICROSOFT_TENANT_ID`
2. Vào `/student/login`, bấm "Đăng nhập với Microsoft 365".
3. Thử đăng nhập tài khoản cá nhân (ví dụ: `@gmail.com` hoặc `@outlook.com` cá nhân không thuộc trường).
   - **Kỳ vọng:** Bị chặn với thông báo lỗi: *"Tài khoản Microsoft không thuộc tổ chức/trường đại học được cho phép."*
4. Đăng nhập bằng tài khoản email trường (ví dụ: `sv@utc.edu.vn`).
   - **Kỳ vọng:** Đăng nhập thành công và tự động chuyển về `/student`.

### Bước 3: Kiểm Tra Duyệt Đơn Nghỉ Phép & Đồng Bộ Điểm Danh (Yêu cầu 15, 16, 17)
1. Đăng nhập tài khoản Sinh viên: Vào mục "Xin nghỉ phép", chọn môn học và gửi đơn kèm lý do.
2. Đăng nhập tài khoản Giảng viên dạy môn học đó: Vào mục "Nghỉ phép", bấm **Chấp thuận**.
3. Quay lại tài khoản Sinh viên: Kiểm tra bảng điểm danh buổi học tương ứng đã tự động cập nhật sang trạng thái **Có phép (excused)**.
