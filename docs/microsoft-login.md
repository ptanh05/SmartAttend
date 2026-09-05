# Hướng Dẫn Cấu Hình Đăng Nhập Bằng Microsoft 365 (SSO)

Hệ thống đã được tích hợp chuẩn xác luồng xác thực OpenID Connect (OIDC) thông qua thư viện `arctic`. Để chức năng này hoạt động trên môi trường thật, bạn cần tạo một ứng dụng trên Microsoft Entra ID (tên cũ là Azure Active Directory).

Dưới đây là các bước cụ thể:

## 1. Tạo Ứng Dụng Trên Microsoft Entra admin center

1. Đăng nhập vào [Microsoft Entra admin center](https://entra.microsoft.com/) bằng tài khoản quản trị viên của trường.
2. Tìm và chọn **Applications > App registrations** ở thanh menu bên trái.
3. Bấm **New registration**.
4. Điền các thông tin:
   - **Name:** VD: *UTC SmartAttend SSO*
   - **Supported account types:** Bắt buộc chọn **Accounts in this organizational directory only (Single tenant)** để không cho phép người ngoài hoặc tài khoản cá nhân đăng nhập.
   - **Redirect URI:**
     - Chọn loại **Web**.
     - Ở môi trường **Development** (test máy tính cá nhân), nhập: `http://localhost:3000/api/auth/microsoft/callback`
     - Ở môi trường **Production** (khi đưa lên domain thật), nhập ví dụ: `https://ten-mien-cua-ban.com/api/auth/microsoft/callback`
5. Bấm **Register**.

## 2. Lấy Thông Tin Cấu Hình (Keys & IDs)

Sau khi tạo xong, bạn sẽ ở trang **Overview** của ứng dụng vừa tạo. Tại đây, hãy lưu lại hai thông số:
- **Application (client) ID**: Đây là `MICROSOFT_CLIENT_ID`.
- **Directory (tenant) ID**: Đây là `MICROSOFT_TENANT_ID`.

Tiếp theo, tạo mật khẩu (Client Secret):
1. Chuyển sang mục **Certificates & secrets** ở thanh menu trái.
2. Bấm **New client secret**.
3. Đặt mô tả (VD: *SmartAttend Auth*) và chọn thời gian hết hạn (khuyên dùng 12 hoặc 24 tháng).
4. Bấm **Add**.
5. **CỰC KỲ QUAN TRỌNG:** Copy giá trị ở cột **Value** ngay lập tức (không phải cột Secret ID). Dãy mã này sẽ bị ẩn đi nếu bạn load lại trang. Đây chính là `MICROSOFT_CLIENT_SECRET`.

## 3. Phân Quyền API (API Permissions)

Hệ thống hiện tại chỉ cần lấy Email và Object ID của sinh viên, do đó không cần cấu hình thêm Microsoft Graph phức tạp.
1. Chuyển sang mục **API permissions**.
2. Đảm bảo rằng quyền mặc định `User.Read` (hoặc `profile`, `email`, `openid`) đã được chọn. (Luồng OpenID mặc định của Microsoft đã cho phép các thông tin này).
3. Nếu hệ thống yêu cầu, hãy bấm **Grant admin consent for [Tên trường]** để sinh viên không bị hỏi xác nhận phiền phức mỗi khi đăng nhập.

## 4. Cấu Hình Environment Variables

Cập nhật lại file `.env` hoặc cấu hình Vercel/VPS của bạn với những thông số vừa lấy được:

```env
MICROSOFT_CLIENT_ID="Application_client_ID_của_bạn"
MICROSOFT_CLIENT_SECRET="Giá_trị_Client_Secret_vừa_tạo"
MICROSOFT_TENANT_ID="Directory_tenant_ID_của_bạn"

# Đổi thành URL production nếu đưa lên môi trường thật
MICROSOFT_REDIRECT_URI="http://localhost:3000/api/auth/microsoft/callback"
```

## 5. Lưu Ý Về Luồng Xử Lý (Logic)
- Hệ thống sẽ tìm trong database bảng `users` bằng thuộc tính `email` nhận được từ Microsoft.
- Nếu sinh viên chưa có tài khoản trong hệ thống trường, họ sẽ **bị từ chối đăng nhập**. Đảm bảo danh sách sinh viên đã được import hoặc họ đã dùng hệ thống trước đó.
- Sau lần đăng nhập thành công đầu tiên, một record sẽ được tạo trong bảng `external_accounts`, liên kết `userId` với `provider_account_id` (OID) của Microsoft một cách bảo mật, chống giả mạo email ở các lần đăng nhập sau.
