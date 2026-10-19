# Hướng dẫn kiểm thử thủ công hệ thống SmartAttend

Tài liệu này dành cho tester kiểm thử SmartAttend trực tiếp trên môi trường Vercel theo góc nhìn người dùng thật. Phạm vi gồm giao diện, xác thực, phân quyền, quản lý lớp học, vòng đời điểm danh, đơn xin nghỉ, thiết bị, thông báo, báo cáo và nhật ký hệ thống.

Môi trường kiểm thử chính:

```text
https://smart-attend-snowy.vercel.app/
```

## 1. Mục tiêu kiểm thử

- Xác nhận ba vai trò Student, Teacher và Admin truy cập đúng chức năng.
- Xác nhận dữ liệu giữa các vai trò được đồng bộ đúng.
- Xác nhận toàn bộ vòng đời điểm danh hoạt động từ lúc tạo lớp đến khi đóng phiên.
- Xác nhận người dùng không thể truy cập chức năng ngoài quyền hạn.
- Xác nhận giao diện có phản hồi rõ ràng khi thành công hoặc thất bại.
- Ghi nhận lỗi với đủ bằng chứng để lập trình viên có thể tái hiện.

## 2. Chuẩn bị môi trường

### 2.1. Yêu cầu

- Chrome hoặc Edge phiên bản mới.
- Kết nối Internet ổn định.
- Tài khoản kiểm thử hợp lệ trên môi trường Vercel.
- Tester đã được phép tạo dữ liệu thử trên database của deployment.
- Độ phân giải nên kiểm tra: desktop 1440×900, tablet 768×1024 và mobile 390×844.

### 2.2. Truy cập ứng dụng

Mở trình duyệt và truy cập:

```text
https://smart-attend-snowy.vercel.app/
```

Kết quả mong đợi:

- Trang SmartAttend hiển thị mà không có lỗi trắng trang.
- Kết nối sử dụng HTTPS hợp lệ.
- Console trình duyệt không xuất hiện lỗi JavaScript nghiêm trọng.
- Network không có request `5xx` hoặc request lặp vô hạn.

> Không cần chạy `pnpm dev` khi test trên link Vercel. Chỉ chạy ứng dụng local nếu tester được giao kiểm tra riêng môi trường phát triển.

### 2.3. Tài khoản kiểm thử

Sử dụng các tài khoản seed dưới đây cho luồng liên kết Teacher–Student vì chúng thuộc cùng tổ chức UTC:

- Student
  - Mã sinh viên: `20260001`
  - Mật khẩu: `student123`
- Teacher
  - Email: `teacher@smartattend.edu.vn`
  - Mật khẩu: `12345678`
- Admin
  - Email: `admin@smartattend.edu.vn`
  - Mật khẩu: `12345678`

Tài khoản sau chỉ phù hợp để kiểm thử một Teacher độc lập, không dùng cho vòng điểm danh với sinh viên seed:

- Email: `tester.20261006@smartattend.edu.vn`
- Mật khẩu: `SmartAttend@Test2026`

> Cảnh báo: `pnpm db:seed` xóa dữ liệu hiện có trước khi tạo lại dữ liệu mẫu. Chỉ chạy trên database test và phải được người phụ trách môi trường đồng ý.

> Không chạy `pnpm db:seed` chỉ để chuẩn bị test cho link Vercel. Nếu các tài khoản seed không đăng nhập được trên production, liên hệ người quản trị deployment để cấp tài khoản thuộc cùng test tenant.

## 3. Quy ước ghi nhận kết quả

Với mỗi test case, tester ghi một trong các trạng thái:

- `[PASS]`: Kết quả thực tế đúng hoàn toàn với mong đợi.
- `[FAIL]`: Có sai khác chức năng hoặc giao diện.
- `[BLOCKED]`: Không thể test vì thiếu cấu hình, tài khoản, thiết bị hoặc dịch vụ ngoài.
- `[N/A]`: Không áp dụng cho môi trường hiện tại.

Khi phát hiện lỗi, cần ghi:

- Mã test case.
- Thời gian xảy ra lỗi.
- Vai trò và tài khoản đang sử dụng.
- URL hiện tại.
- Các bước tái hiện chính xác.
- Kết quả thực tế và kết quả mong đợi.
- Ảnh chụp màn hình hoặc video.
- Lỗi trong Console và request liên quan trong Network.
- Mức độ: Blocker, Critical, Major, Minor hoặc Cosmetic.

## 4. Kiểm thử giao diện công khai

### PUB-01 — Mở trang chủ

Các bước:

1. Mở cửa sổ ẩn danh.
2. Truy cập `https://smart-attend-snowy.vercel.app/`.

Kết quả mong đợi:

- Logo và tên SmartAttend hiển thị.
- Có lựa chọn vào cổng Sinh viên và cổng Cán bộ/Giảng viên.
- Không tự động hiển thị dữ liệu nội bộ khi chưa đăng nhập.

### PUB-02 — Chuyển đổi ngôn ngữ

Các bước:

1. Chọn tiếng Anh.
2. Kiểm tra tiêu đề, nút và nội dung chính.
3. Chuyển lại tiếng Việt.

Kết quả mong đợi:

- Nội dung thay đổi ngay, không cần tải lại trang.
- Không còn chuỗi khóa dịch như `nav.dashboard` hoặc `login.title`.
- Không có nội dung bị tràn hoặc mất nút.

### PUB-03 — Responsive

Các bước:

1. Kiểm tra ở desktop, tablet và mobile.
2. Mở menu, form đăng nhập và các hộp thoại.

Kết quả mong đợi:

- Không xuất hiện cuộn ngang ngoài ý muốn.
- Nút chính vẫn nhìn thấy và bấm được.
- Form không bị bàn phím ảo che hoàn toàn trên mobile.

### PUB-04 — Trang không tồn tại

Các bước:

1. Truy cập `/duong-dan-khong-ton-tai`.

Kết quả mong đợi:

- Hiển thị trang 404 thân thiện.
- Có cách quay lại trang chính.

## 5. Xác thực và phiên đăng nhập

### AUTH-01 — Đăng nhập Student bằng mã sinh viên

Các bước:

1. Chọn cổng Sinh viên.
2. Nhập `20260001` và `student123`.
3. Nhấn đăng nhập.

Kết quả mong đợi:

- Chuyển đến Student Dashboard.
- Hiển thị đúng tên, mã sinh viên và dữ liệu của tài khoản.
- Tải lại trang vẫn còn đăng nhập.

### AUTH-02 — Đăng nhập Teacher

Các bước:

1. Đăng xuất Student.
2. Chọn cổng Cán bộ/Giảng viên.
3. Nhập tài khoản Teacher.

Kết quả mong đợi:

- Chuyển đến Teacher Dashboard.
- Hiển thị các chức năng lớp học, phiên điểm danh và báo cáo.

### AUTH-03 — Đăng nhập Admin

Các bước:

1. Đăng xuất Teacher.
2. Đăng nhập bằng tài khoản Admin.

Kết quả mong đợi:

- Chuyển đến Admin Dashboard.
- Hiển thị quản lý người dùng, phân tích và nhật ký hệ thống.

### AUTH-04 — Sai mật khẩu

Các bước:

1. Nhập tài khoản hợp lệ nhưng mật khẩu sai.
2. Thử đăng nhập.

Kết quả mong đợi:

- Không đăng nhập được.
- Hiển thị thông báo chung, không tiết lộ tài khoản có tồn tại hay không.
- Không tạo session cookie hợp lệ.

### AUTH-05 — Dùng sai cổng đăng nhập

Các bước:

1. Dùng tài khoản Student tại cổng Cán bộ/Giảng viên.
2. Dùng tài khoản Teacher tại cổng Sinh viên.

Kết quả mong đợi:

- Cả hai trường hợp đều bị từ chối.
- Thông báo hướng dẫn người dùng chọn đúng cổng.

### AUTH-06 — Đăng xuất

Các bước:

1. Đăng nhập thành công.
2. Nhấn đăng xuất.
3. Dùng nút Back của trình duyệt hoặc mở lại URL dashboard.

Kết quả mong đợi:

- Quay về màn hình công khai hoặc đăng nhập.
- Không xem lại được dữ liệu bảo vệ.

### AUTH-07 — Đổi mật khẩu

Các bước:

1. Đăng nhập một tài khoản test được phép đổi mật khẩu.
2. Nhập sai mật khẩu hiện tại.
3. Nhập mật khẩu mới ngắn hơn 8 ký tự.
4. Nhập dữ liệu hợp lệ và đổi mật khẩu.
5. Đăng xuất rồi đăng nhập bằng mật khẩu cũ và mật khẩu mới.

Kết quả mong đợi:

- Hai trường hợp dữ liệu sai bị từ chối rõ ràng.
- Mật khẩu hợp lệ được cập nhật.
- Mật khẩu cũ không đăng nhập được; mật khẩu mới đăng nhập được.
- Các session cũ bị thu hồi theo chính sách hệ thống.

## 6. Luồng Teacher quản lý course và lịch học

Để tránh trùng dữ liệu, dùng mã có dạng `QA-YYYYMMDD-HHMM`, ví dụ `QA-20261007-0930`.

### COURSE-01 — Tạo course

Các bước:

1. Đăng nhập Teacher.
2. Mở màn hình quản lý course.
3. Tạo course với mã duy nhất, tên `Kiểm thử hệ thống` và khoa `Công nghệ thông tin`.

Kết quả mong đợi:

- Hiển thị thông báo thành công.
- Course mới xuất hiện trong danh sách.
- Tải lại trang vẫn còn dữ liệu.

### COURSE-02 — Kiểm tra dữ liệu bắt buộc

Các bước:

1. Mở form tạo course.
2. Lần lượt bỏ trống mã, tên và khoa.

Kết quả mong đợi:

- Không tạo bản ghi thiếu dữ liệu.
- Trường lỗi được chỉ rõ.

### SECTION-01 — Tạo lịch học

Các bước:

1. Chọn course vừa tạo.
2. Tạo section với phòng `QA Lab`, thời gian `00:00–23:59` và ngày hiện tại.
3. Bật hoặc tắt tự động bắt đầu theo kịch bản cần kiểm tra.

Kết quả mong đợi:

- Section hiển thị đúng course, phòng, ngày và giờ.
- Sinh viên đang hoạt động trong tổ chức được tự động ghi danh.

### SECTION-02 — Sửa lịch học

Các bước:

1. Sửa phòng hoặc thời gian của section.
2. Tải lại trang.

Kết quả mong đợi:

- Dữ liệu mới được lưu và hiển thị đúng sau khi tải lại.

## 7. Luồng điểm danh end-to-end

Luồng này cần hai cửa sổ trình duyệt độc lập để giữ hai session đăng nhập:

- Cửa sổ A: Teacher.
- Cửa sổ B hoặc cửa sổ ẩn danh: Student.

### ATT-01 — Teacher tạo và bắt đầu phiên

Các bước:

1. Ở cửa sổ A, đăng nhập Teacher.
2. Chọn section có Student `20260001`.
3. Tạo phiên điểm danh.
4. Xác nhận phiên ban đầu ở trạng thái `draft`.
5. Nhấn bắt đầu phiên.

Kết quả mong đợi:

- Phiên chuyển sang `active/live`.
- Hiển thị challenge code gồm 6 ký tự và QR tương ứng.
- Có thời gian đếm ngược tới khi challenge hết hạn.

### ATT-02 — Xoay challenge

Các bước:

1. Ghi lại challenge hiện tại.
2. Nhấn xoay mã hoặc chờ hệ thống xoay mã.
3. So sánh mã mới với mã cũ.

Kết quả mong đợi:

- Mã mới khác mã cũ.
- Mã cũ không còn được chấp nhận.
- Countdown được cập nhật đúng.

### ATT-03 — Student điểm danh thành công

Các bước:

1. Ở cửa sổ B, đăng nhập `20260001`.
2. Mở màn hình điểm danh.
3. Nhập challenge hiện tại từ cửa sổ A.
4. Gửi yêu cầu.

Kết quả mong đợi:

- Hiển thị thông báo điểm danh thành công.
- Bản ghi có trạng thái `present` hoặc `late` tùy thời gian.
- Teacher nhìn thấy Student trong danh sách phiên.
- Điểm xác minh nằm trong khoảng 0–100.
- Student nhận được thông báo xác nhận.

### ATT-04 — Challenge sai

Các bước:

1. Nhập một mã 6 ký tự không đúng.

Kết quả mong đợi:

- Yêu cầu bị từ chối.
- Không tạo attendance record thành công.
- Thông báo không tiết lộ challenge đúng.

### ATT-05 — Challenge hết hạn hoặc đã xoay

Các bước:

1. Lưu challenge cũ.
2. Teacher xoay challenge hoặc chờ hết TTL.
3. Student gửi challenge cũ.

Kết quả mong đợi:

- Yêu cầu bị từ chối với thông báo mã hết hạn hoặc không còn hợp lệ.

### ATT-06 — Student không thuộc lớp

Điều kiện: cần tài khoản Student thuộc cùng tổ chức nhưng không được ghi danh vào section.

Các bước:

1. Đăng nhập tài khoản Student không thuộc lớp.
2. Gửi challenge hợp lệ.

Kết quả mong đợi:

- Điểm danh bị từ chối.
- Không xuất hiện bản ghi của Student trong phiên.

### ATT-07 — Gửi điểm danh lặp lại

Các bước:

1. Student đã điểm danh thành công.
2. Gửi lại cùng challenge nhiều lần hoặc bấm nút liên tục.

Kết quả mong đợi:

- Hệ thống không tạo bản ghi trùng.
- Vẫn chỉ có một attendance record cho Student và session.
- Giao diện thông báo Student đã hoàn thành điểm danh.

### ATT-08 — Tạm dừng và tiếp tục

Các bước:

1. Teacher tạm dừng phiên.
2. Student thử điểm danh.
3. Teacher tiếp tục phiên và xoay challenge mới.
4. Student thử lại.

Kết quả mong đợi:

- Khi paused, yêu cầu điểm danh bị từ chối.
- Khi active trở lại, challenge mới hợp lệ và có thể điểm danh.

### ATT-09 — Đóng phiên

Các bước:

1. Teacher nhấn đóng phiên.
2. Student chưa điểm danh thử gửi challenge.
3. Kiểm tra danh sách sinh viên.

Kết quả mong đợi:

- Phiên chuyển sang `closed`.
- Không chấp nhận điểm danh mới.
- Sinh viên đã điểm danh giữ trạng thái `present/late`.
- Sinh viên còn lại được chốt `absent`.

### ATT-10 — Phân loại đi muộn

Các bước:

1. Teacher/Admin đặt `lateAfterMinutes` phù hợp để test.
2. Bắt đầu phiên và chờ qua ngưỡng.
3. Student điểm danh.

Kết quả mong đợi:

- Trạng thái do server tính là `late`.
- Thay đổi đồng hồ máy Student không làm thay đổi kết quả.

## 8. Thiết bị, WebAuthn và sóng siêu âm

### DEVICE-01 — Chính sách yêu cầu thiết bị tin cậy

Các bước:

1. Teacher/Admin bật `requireTrustedDevice`.
2. Student dùng trình duyệt hoặc thiết bị chưa từng xác minh để điểm danh.

Kết quả mong đợi:

- Điểm danh được ghi nhận theo chính sách hiện tại nhưng bị đánh dấu để duyệt.
- Điểm xác minh thấp hơn thiết bị tin cậy.
- Teacher/Admin thấy mục suspicious tương ứng.

### DEVICE-02 — Duyệt suspicious attempt

Các bước:

1. Teacher/Admin mở danh sách bất thường.
2. Phê duyệt một trường hợp.
3. Bác bỏ một trường hợp khác nếu có.

Kết quả mong đợi:

- Trạng thái xử lý được cập nhật.
- Attendance record thay đổi đúng theo hành động.
- Audit log ghi nhận người xử lý.

### WEBAUTHN-01 — Xác thực sinh trắc học

Điều kiện:

- Truy cập bằng HTTPS tại `https://smart-attend-snowy.vercel.app/`.
- Máy có Windows Hello, Touch ID hoặc platform authenticator.

Các bước:

1. Đăng ký passkey cho Student.
2. Thực hiện điểm danh yêu cầu xác thực sinh trắc học.
3. Thử hủy hộp thoại hoặc dùng thông tin không hợp lệ.

Kết quả mong đợi:

- Assertion hợp lệ được chấp nhận.
- Hủy hoặc chữ ký sai bị từ chối an toàn.
- Không chấp nhận cờ boolean giả từ client thay cho assertion mật mã.

### ULTRA-01 — Xác thực sóng siêu âm

Điều kiện:

- Teacher có loa, Student có micro.
- Trình duyệt đã cấp quyền audio.
- Thiết bị ở cùng không gian thử nghiệm.

Các bước:

1. Teacher phát beacon trong phiên active.
2. Student bật phát hiện beacon.
3. Thử lại khi không có beacon hoặc bằng proof cũ.

Kết quả mong đợi:

- Proof hợp lệ phải gắn với đúng session, challenge sequence và thời gian.
- Proof cũ, sai session hoặc giả mạo bị từ chối.
- Kết hợp WebAuthn và acoustic proof hợp lệ đạt điểm xác minh tối đa theo chính sách.

## 9. Đơn xin nghỉ

### LEAVE-01 — Student gửi đơn

Các bước:

1. Student chọn course, ngày nghỉ và nhập lý do.
2. Gửi đơn.

Kết quả mong đợi:

- Đơn có trạng thái `pending`.
- Student nhìn thấy đơn sau khi tải lại.
- Teacher phụ trách nhìn thấy đơn cần duyệt.

### LEAVE-02 — Teacher phê duyệt

Các bước:

1. Teacher mở đơn pending.
2. Chọn approve.

Kết quả mong đợi:

- Đơn chuyển sang `approved`.
- Attendance record liên quan được đồng bộ thành `excused` nếu có.
- Student nhận được thông báo.

### LEAVE-03 — Teacher từ chối

Các bước:

1. Tạo một đơn khác.
2. Teacher chọn reject.

Kết quả mong đợi:

- Đơn chuyển sang `rejected`.
- Không tự động chuyển attendance record thành `excused`.

## 10. Admin và quản lý người dùng

### ADMIN-01 — Danh sách người dùng

Các bước:

1. Đăng nhập Admin.
2. Mở danh sách người dùng.
3. Lọc theo Student, Teacher hoặc Admin nếu giao diện hỗ trợ.

Kết quả mong đợi:

- Chỉ hiển thị người dùng thuộc tổ chức hiện tại.
- Các trường email, vai trò, khoa và mã sinh viên đúng.

### ADMIN-02 — Import Student bằng CSV

Chuẩn bị file UTF-8 có mã sinh viên duy nhất, tên và khoa.

Các bước:

1. Import file hợp lệ.
2. Import lại cùng file.
3. Import file thiếu cột hoặc có dòng lỗi.

Kết quả mong đợi:

- Dòng hợp lệ tạo Student và mật khẩu mặc định.
- Dữ liệu trùng được bỏ qua hoặc báo rõ lý do.
- Dòng lỗi không làm hỏng toàn bộ dữ liệu đã hợp lệ.
- Student mới được ghi danh vào các section hiện có theo chính sách hiện tại.

### ADMIN-03 — Reset mật khẩu Student

Các bước:

1. Admin hoặc Teacher được phép chọn một Student test.
2. Reset mật khẩu.
3. Đăng nhập lại bằng mật khẩu mặc định được trả về.

Kết quả mong đợi:

- Mật khẩu cũ không còn hợp lệ.
- Mật khẩu mặc định mới đăng nhập được.
- Student được yêu cầu đổi mật khẩu nếu chính sách đặt `mustChangePassword`.

### ADMIN-04 — Audit log

Các bước:

1. Sau khi tạo course, mở phiên, điểm danh và duyệt đơn, mở Audit Log.

Kết quả mong đợi:

- Có sự kiện tương ứng với đúng actor và target.
- Student/Teacher không xem được trang chỉ dành cho Admin.
- Không hiển thị mật khẩu, session token hoặc challenge thô trong log.

## 11. Báo cáo

### REPORT-01 — Xuất attendance summary CSV

Các bước:

1. Đăng nhập Teacher/Admin.
2. Xuất báo cáo tổng hợp.
3. Mở file bằng Excel hoặc trình đọc CSV.

Kết quả mong đợi:

- Response tải về file `.csv`.
- File có header và mở được trực tiếp bằng Microsoft Excel trên Windows với đầy đủ dấu tiếng Việt không bị lỗi phông (nhờ tiền tố chuẩn UTF-8 BOM `\uFEFF`).
- Số present, late, absent và tỷ lệ đúng với dữ liệu trên giao diện.

### REPORT-02 — Xuất attendance detail CSV

Các bước:

1. Chọn báo cáo chi tiết và course cụ thể nếu có.
2. Tải file.

Kết quả mong đợi:

- Chỉ chứa dữ liệu đúng phạm vi tổ chức/course.
- Có Student, email, course, phòng, trạng thái, điểm, thời gian và thiết bị.
- Mở trên Microsoft Excel hiển thị chuẩn tiếng Việt (tên sinh viên, tên học phần, phòng học) không bị vỡ font/mojibake.

### REPORT-03 — Xuất audit CSV

Các bước:

1. Đăng nhập Admin.
2. Xuất audit report.

Kết quả mong đợi:

- File có actor, action, target, severity và thời gian với tiền tố UTF-8 BOM hiển thị chuẩn tiếng Việt trên Excel.
- Student và Teacher không tải được báo cáo Admin nếu không có quyền.

## 12. Microsoft SSO

Chỉ thực hiện khi deployment Vercel đã cấu hình `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID` và `MICROSOFT_REDIRECT_URI`.

Redirect URI mong đợi trên Microsoft Entra:

```text
https://smart-attend-snowy.vercel.app/api/auth/microsoft/callback
```

### SSO-01 — Tài khoản trường hợp lệ

Các bước:

1. Chọn đăng nhập Microsoft.
2. Đăng nhập tài khoản thuộc tenant trường.

Kết quả mong đợi:

- Callback thành công.
- Tài khoản được ánh xạ đúng membership và vai trò.
- Chuyển về đúng dashboard.

### SSO-02 — Sai tenant hoặc tài khoản cá nhân

Các bước:

1. Thử tài khoản Microsoft cá nhân hoặc tenant khác.

Kết quả mong đợi:

- Bị từ chối.
- Không tạo tài khoản hoặc membership ngoài ý muốn.
- Không để lộ secret hoặc chi tiết OAuth nhạy cảm.

### SSO-03 — State không hợp lệ

Các bước:

1. Hủy đăng nhập hoặc thử callback với state sai/hết hạn.

Kết quả mong đợi:

- Callback bị từ chối an toàn.
- Không tạo session.

## 13. Kiểm thử bảo mật và phân quyền

### SEC-01 — Truy cập API khi chưa đăng nhập

Trong cửa sổ ẩn danh, thử mở:

- `/api/courses`
- `/api/users`
- `/api/attendance/sessions`
- `/api/attendance/records`
- `/api/notifications`
- `/api/reports/attendance`

Kết quả mong đợi:

- Tất cả trả `401 Unauthorized`.

### SEC-02 — Student gọi API Staff/Admin

Sau khi đăng nhập Student, thử truy cập:

- `/api/courses`
- `/api/users`
- `/api/analytics/overview`
- `/api/audit-logs`
- `/api/reports/attendance`

Kết quả mong đợi:

- Tất cả trả `403 Forbidden`.

### SEC-03 — Tenant isolation

Điều kiện: có tài khoản thuộc hai tổ chức khác nhau.

Các bước:

1. Lấy ID course, section hoặc record của tổ chức A.
2. Đăng nhập tài khoản tổ chức B.
3. Thử xem hoặc sửa ID của tổ chức A qua UI hoặc request thủ công.

Kết quả mong đợi:

- Bị từ chối hoặc trả not found.
- Không tiết lộ dữ liệu của tổ chức A.

### SEC-04 — Rate limit

Các bước:

1. Gửi nhiều lần đăng nhập sai trong thời gian ngắn.
2. Gửi nhiều challenge sai liên tiếp.

Kết quả mong đợi:

- Sau ngưỡng cấu hình, server trả `429 Too Many Requests`.
- Có thời gian chờ hợp lý.
- Tài khoản khác hoặc key khác không bị ảnh hưởng sai phạm vi.

### SEC-05 — Không tin dữ liệu client

Các bước:

1. Dùng DevTools sửa payload, thử gửi `role`, `organizationId`, `status`, timestamp hoặc cờ xác minh giả.

Kết quả mong đợi:

- Server bỏ qua hoặc từ chối các giá trị không được phép.
- Role, tenant, trạng thái và thời gian do server quyết định.

## 14. Kiểm thử độ ổn định

### STAB-01 — Refresh và điều hướng trực tiếp

Các bước:

1. Đăng nhập từng vai trò.
2. Tải lại trang tại các URL dashboard con.
3. Dán URL trực tiếp vào tab mới.

Kết quả mong đợi:

- Không xuất hiện 404 sai.
- Session hợp lệ được khôi phục.
- Vai trò không được chuyển sang portal khác.

### STAB-02 — Hai tab đồng thời

Các bước:

1. Mở hai tab cùng tài khoản.
2. Thay đổi dữ liệu ở tab A.
3. Refresh hoặc chờ cập nhật ở tab B.

Kết quả mong đợi:

- Dữ liệu cuối cùng nhất quán.
- Không tạo bản ghi trùng do bấm đồng thời.

### STAB-03 — Mạng chậm hoặc mất mạng

Các bước:

1. Dùng DevTools chuyển sang Slow 3G hoặc Offline.
2. Thực hiện tải dashboard và gửi form.

Kết quả mong đợi:

- Có trạng thái loading hợp lý.
- Có thông báo lỗi, không treo vô hạn.
- Không gửi trùng mutation khi mạng trở lại.

## 15. Regression tự động trên link Vercel

Các lệnh dưới đây chạy từ máy có source code, Java 21 và `pnpm`, nhưng toàn bộ HTTP request sẽ được gửi tới deployment Vercel.

Thiết lập URL đích trong cửa sổ PowerShell hiện tại:

```powershell
$env:SMARTATTEND_BASE_URL = 'https://smart-attend-snowy.vercel.app'
```

Chạy JUnit chỉ đọc:

```powershell
pnpm test:junit
```

Kết quả mong đợi: 9 test thành công và một lifecycle test được bỏ qua có chủ đích.

Chạy toàn bộ, bao gồm luồng tạo dữ liệu điểm danh:

```powershell
pnpm test:junit:full
```

Kết quả mong đợi: 10 test thành công, 0 thất bại và 0 aborted.

> `test:junit:full` tạo course, section, session, attendance record, notification và audit event thật trên database của deployment. Chỉ chạy khi đã được phép ghi dữ liệu test.

### Kiểm tra source code trước khi bàn giao

Chạy kiểm tra tĩnh:

```powershell
pnpm typecheck
pnpm lint
```

Chạy Vitest:

```powershell
pnpm test
```

Tiêu chí bàn giao tối thiểu:

- TypeScript và ESLint không có lỗi.
- JUnit full: 10 test thành công, 0 test thất bại.
- Không còn lỗi Blocker hoặc Critical.
- Các lỗi Major còn lại đã có người phụ trách và kế hoạch xử lý.
- Luồng ATT-01 đến ATT-09 được xác nhận trên trình duyệt thật.
- Báo cáo CSV mở được và dữ liệu khớp giao diện.

## 16. Mẫu báo cáo kết quả

Sao chép mẫu sau cho mỗi lần test:

```text
Phiên bản/commit:
Ngày kiểm thử:
Người kiểm thử:
Môi trường:
URL: https://smart-attend-snowy.vercel.app/
Trình duyệt và phiên bản:
Database:

Tổng số test case:
PASS:
FAIL:
BLOCKED:
N/A:

Lỗi Blocker/Critical:
Lỗi Major:
Lỗi Minor/Cosmetic:

Kết luận: PASS / PASS CÓ ĐIỀU KIỆN / FAIL
Ghi chú:
```

