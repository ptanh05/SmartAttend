# SmartAttend — Vercel & Environment Setup

> Tài liệu này **không** chứa giá trị secret nào. Mình không có quyền vào Vercel hay Neon, nên trạng thái từng biến trên production là NOT VERIFIED (xem VERCEL_DEPLOYMENT_AUDIT §4). Mọi thao tác dashboard do chủ dự án thực hiện.

## 1. Mô hình 3 môi trường
| Môi trường | Vercel environment | Database | Ghi chú |
|---|---|---|---|
| Development | (máy dev, `.env`) | Neon branch `dev` hoặc Postgres local | Không bao giờ dùng chuỗi kết nối production trong `.env` |
| Preview / Staging | **Preview** | Neon branch `staging` (hoặc dùng Neon Vercel Integration để tạo branch riêng cho mỗi Preview) | Preview **không được** ghi vào DB production |
| Production | **Production** | Neon branch `main` (production) | Chỉ Production environment có `DATABASE_URL` này |

Mỗi môi trường có **secret riêng**; không tái sử dụng `SESSION_SECRET` hay `CRON_SECRET` giữa các môi trường.

## 2. Danh sách biến
Tạo giá trị ngẫu nhiên: `openssl rand -base64 48` (hoặc `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"`).

| Biến | Mục đích | Prod | Preview | Dev | Cách tạo | Cách kiểm tra (không lộ giá trị) | Lưu ý bảo mật |
|---|---|---|---|---|---|---|---|
| `DATABASE_URL` | Kết nối Neon | ✅ riêng | ✅ branch staging | ✅ branch dev | Neon Console → Connection string (pooled) | Vercel → Settings → Environment Variables: kiểm tra biến chỉ gán cho đúng environment; so **tên host/branch** trong Neon Console | Không gán chung "All Environments" |
| `SESSION_SECRET` | Root key cho HMAC (OTP suy ra, WebAuthn challenge, acoustic proof), tách theo mục đích trong `lib/auth/secrets.ts` | ✅ | ✅ (khác prod) | tùy chọn | random ≥48 byte | Sau deploy: GV mở phiên thấy mã OTP | Đổi giá trị làm vô hiệu mã đang hiển thị (tự xoay lại) và challenge đang dùng dở. Thiếu biến này thì code fallback sang `TEACHER_REGISTRATION_API_KEY` (không khuyến khích) |
| `CRON_SECRET` | Bảo vệ `/api/cron/sync-attendance` | ✅ | ✅ (khác) | tùy chọn | random | `curl -H "Authorization: Bearer $CRON_SECRET" …/api/cron/sync-attendance` trả 200 `{ok:true}` (chỉ chạy trên staging; trên prod lệnh này **kích hoạt** đồng bộ thật) | Vercel Cron tự gửi đúng header này |
| `TEACHER_REGISTRATION_API_KEY` | Khóa cho `POST /api/auth/register` (tạo tổ chức + admin) | ✅ hoặc **để trống khi không cần đăng ký mới** | tùy chọn | tùy chọn | random | Gọi register không có key → 403 | Để trống thì tắt hẳn tính năng đăng ký admin (an toàn nhất) |
| `MICROSOFT_CLIENT_ID` | App registration (Entra ID) | ✅ nếu dùng SSO | ✅ nếu test SSO | tùy chọn | Entra → App registrations → Application (client) ID | `/api/auth/microsoft?portal=student` → 302 tới `login.microsoftonline.com` | |
| `MICROSOFT_CLIENT_SECRET` | Client secret | ✅ | ✅ | | Entra → Certificates & secrets | (như trên) | Theo dõi ngày hết hạn của secret |
| `MICROSOFT_TENANT_ID` | Giới hạn tenant | ✅ **GUID tenant của trường** | ✅ | | Entra → Overview → Directory (tenant) ID | Đăng nhập bằng tài khoản ngoài tenant → bị từ chối | Không dùng `common`/`organizations`: khi đó hệ thống **không tự liên kết** tài khoản theo email. Phải là GUID, không dùng tên miền, vì claim `tid` luôn là GUID. |
| `MICROSOFT_REDIRECT_URI` | Callback | `https://<domain>/api/auth/microsoft/callback` | URL Preview cố định (xem MICROSOFT_SSO_SETUP) | `http://localhost:3000/api/auth/microsoft/callback` | | Phải trùng **chính xác** URI đã đăng ký trong Entra | |
| `WEBAUTHN_RP_ID` | RP ID cho passkey | `smart-attend-snowy.vercel.app` hoặc domain chính thức | hostname Preview | `localhost` | hostname, không có scheme hay port | Đăng ký passkey trên trình duyệt thật không bị lỗi "RP ID hash does not match" | Đổi RP ID sau khi người dùng đã đăng ký thì **mất toàn bộ passkey cũ** |
| `WEBAUTHN_ORIGIN` | Origin mong đợi trong clientDataJSON | `https://<domain>` | `https://<preview-host>` | `http://localhost:3000` | | Như trên | Bắt buộc khớp chính xác (scheme + host + port) |
| `APP_URL` | Origin tin cậy cho CSRF (bổ sung) | `https://<domain>` | URL preview | `http://localhost:3000` | | POST từ chính site không bị 403 | |
| `NEXT_PUBLIC_APP_URL` | Như trên, đồng thời là fallback cho WebAuthn origin | `https://<domain>` | | | | | Biến `NEXT_PUBLIC_*` được nhúng vào bundle client (không phải secret) |
| `TRUSTED_PROXY_HOPS` | Số proxy tin cậy | Không cần trên Vercel | | | | | |
| `PRODUCTION_DATABASE_URL` | **Chỉ** dùng cho chốt chặn của seed và integration test (so sánh) | ❌ | ❌ | tùy chọn ở máy vận hành | | | Không đặt trên Vercel |
| `SEED_CONFIRM_WIPE_ALL_DATA` | Cho phép `scripts/seed.ts` chạy (seed xóa toàn bộ dữ liệu) | ❌ **không bao giờ** | ❌ | chỉ khi seed DB dùng một lần | `yes-wipe-this-database` | | |

## 3. Kiểm tra tách database (chủ dự án)
1. Vercel → Project → Settings → Environment Variables → lọc theo `DATABASE_URL`: phải có **các dòng riêng** cho Production và Preview (không có dòng "All Environments").
2. Neon Console → Branches: xác nhận Production trỏ tới branch production, Preview trỏ tới branch staging hoặc branch theo preview.
3. Nếu đang dùng chung: tạo branch staging, cập nhật `DATABASE_URL` cho Preview, **redeploy** các Preview (biến môi trường chỉ áp dụng cho deployment mới).

## 4. Region và độ trễ
- Function đang chạy ở `hkg1` (header `X-Vercel-Id`). Region của Neon: **chưa xác minh**; không suy đoán từ header.
- Cách đo: Neon Console → Project settings → Region. Sau đó đặt Vercel → Settings → Functions → Function Region gần region đó (ví dụ Neon `aws-ap-southeast-1` Singapore → Vercel `sin1`).
- Đo thực tế trên staging: ghi thời gian xử lý của `/api/dashboard` trong Vercel Observability trước và sau khi đổi region.
