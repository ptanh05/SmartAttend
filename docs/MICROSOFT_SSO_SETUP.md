# SmartAttend — Microsoft 365 SSO Setup

## 1. Nguyên nhân HTTP 500 trên production
`GET /api/auth/microsoft?portal=student` → 500. Trong `app/api/auth/microsoft/route.ts`, `getMicrosoftAuth()` (`lib/auth/oauth.ts`) ném lỗi khi **thiếu bất kỳ biến nào** trong 4 biến `MICROSOFT_CLIENT_ID`, `MICROSOFT_CLIENT_SECRET`, `MICROSOFT_TENANT_ID`, `MICROSOFT_REDIRECT_URI`, và route trả 500. Đây là nguyên nhân rất có thể (NOT VERIFIED: cần xem Vercel runtime log của request đó, log sẽ ghi tên biến thiếu sau bản sửa).

**Bản sửa (local):** thiếu cấu hình → `MicrosoftConfigError` → redirect về trang login của cổng tương ứng với thông báo "Đăng nhập Microsoft 365 chưa được cấu hình"; log chỉ ghi **tên** biến thiếu, không ghi giá trị hay stack.

## 2. Luồng và các kiểm tra phía server
| Bước | Vị trí | Kiểm tra |
|---|---|---|
| Khởi tạo | `app/api/auth/microsoft/route.ts` | `portal` hợp lệ; `state` + PKCE `code_verifier` lưu trong cookie HttpOnly, Secure, SameSite=Lax, 10 phút |
| Callback | `app/api/auth/microsoft/callback/route.ts` | `state` khớp cookie; đổi `code` + verifier lấy token (TLS tới token endpoint) |
| Claims | `evaluateMicrosoftIdentity` (`lib/auth/oauth.ts`) | `aud` = `MICROSOFT_CLIENT_ID`; nếu cấu hình single-tenant thì `tid` phải bằng `MICROSOFT_TENANT_ID`; cần `oid` và email (`email` hoặc `preferred_username`) |
| Liên kết | callback | Đã liên kết (`external_accounts` theo `oid`) → đăng nhập. Chưa liên kết → **chỉ tự liên kết theo email khi single-tenant**; email so khớp không phân biệt hoa thường. Multi-tenant → từ chối và hướng dẫn đăng nhập bằng mật khẩu. |
| Phân quyền | callback | Membership phải active; cổng phải khớp vai trò; tạo session + ghi audit |

Chữ ký ID token không được kiểm tra lại, vì token nhận trực tiếp từ token endpoint qua TLS bằng code flow (OIDC Core §3.1.3.7). `iss` không được kiểm tra riêng; `tid` + `aud` là đủ khi ở chế độ single-tenant.

## 3. Cấu hình Entra ID (chủ dự án)
1. Entra admin center → App registrations → New registration.
   - Supported account types: **Accounts in this organizational directory only (single tenant)**.
   - Redirect URI (Web): `https://smart-attend-snowy.vercel.app/api/auth/microsoft/callback` (hoặc domain chính thức). Thêm `http://localhost:3000/api/auth/microsoft/callback` cho dev nếu cần.
2. Certificates & secrets → New client secret; ghi lại ngày hết hạn.
3. API permissions: `openid`, `profile`, `email` (Microsoft Graph, delegated) → Grant admin consent.
4. Token configuration (khuyến nghị): thêm optional claim `email` cho ID token.
5. Vercel → Production env: đặt 4 biến (xem VERCEL_ENVIRONMENT_SETUP). `MICROSOFT_TENANT_ID` = **Directory (tenant) ID dạng GUID**.
6. Redeploy (env chỉ áp dụng cho deployment mới).

## 4. Preview deployments
URL Preview thay đổi theo từng commit, mà Entra cần redirect URI chính xác. Có hai cách: dùng một alias Preview cố định (ví dụ `staging-smartattend.vercel.app`) và đăng ký URI đó, hoặc không bật SSO ở Preview.

## 5. Kiểm thử sau cấu hình (trên staging trước)
- [ ] `/api/auth/microsoft?portal=teacher` → 302 tới `login.microsoftonline.com/<tenant-guid>/…`.
- [ ] Tài khoản trong tenant, email trùng một GV → đăng nhập vào cổng giảng viên; `external_accounts` có 1 dòng.
- [ ] Tài khoản ngoài tenant → bị từ chối ("không thuộc tổ chức").
- [ ] Tài khoản trong tenant nhưng chưa có trong SmartAttend → thông báo "chưa tồn tại".
- [ ] Tài khoản SV đăng nhập ở cổng GV → chuyển hướng về đúng cổng.
- [ ] Huỷ đăng nhập ở Microsoft → quay về login kèm lỗi, không 500.
- [ ] Unit test chính sách: `pnpm vitest run lib/auth/oauth.test.ts` (đã chạy local: PASS).
