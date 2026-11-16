# SmartAttend — Vercel Deployment Audit

> Ngày kiểm tra: 2026-11-14 · URL: https://smart-attend-snowy.vercel.app/
> **Phạm vi và giới hạn:** không có quyền vào Vercel dashboard hay CLI (repo không có `.vercel/`, máy không có `vercel` CLI) và không có quyền vào Neon. Bằng chứng gồm: (1) cấu hình trong repo; (2) request **chỉ đọc, không đăng nhập** tới site (GET/HEAD, cùng 2 POST bị proxy CSRF chặn trước khi chạm DB); (3) JS bundle công khai; (4) GitHub API công khai (deployments, Actions).
> Không chạy migration, không ghi DB, không đăng nhập, không đổi env, không deploy lại. Không có secret nào được đọc hoặc in ra.
> Phân loại: **PASS** · **WARNING** · **FAIL** · **NOT VERIFIED**.

## Tổng quan

| Hạng mục | Kết quả |
|---|---|
| Phiên bản đang chạy | `0234fef` (main), **không chứa** các bản sửa Critical/High |
| CI/CD quality gate | **FAIL**: CI chưa từng chạy được tới bước test |
| Microsoft SSO | **FAIL**: `/api/auth/microsoft` trả 500 |
| Cron đồng bộ lịch | **FAIL/WARNING**: không có cấu hình cron trong repo |
| HTTPS, security headers, CSRF | **PASS** |
| Env vars, Neon, logs | **NOT VERIFIED** (không có quyền) |

---

## 1. Cấu hình Vercel trong repository
| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| `vercel.json` | **WARNING** | Không tồn tại → không có `crons`, không cố định `regions`, không có `functions.maxDuration`. Mọi cấu hình đang nằm trên dashboard (không kiểm tra được). |
| `.vercel/project.json` | NOT VERIFIED | Không có trong repo (bình thường). Không xác định được project hay team. |
| Framework, build | PASS | `next build` mặc định, `next.config.mjs` hợp lệ. Header `Server: Vercel`, `X-Nextjs-Prerender: 1`. |
| Region function | WARNING | `X-Vercel-Id: hkg1::…` (Hong Kong). Region của Neon chưa xác định; nếu DB ở us-east thì mỗi truy vấn tốn thêm khoảng 200 ms, và `syncScheduledAttendance` chạy hàng chục truy vấn tuần tự. |
| Git integration | PASS | GitHub Deployments ghi nhận `Production` và `Preview` tự động (Vercel ↔ `ptanh05/SmartAttend`). |

## 2. Commit đang được deploy
| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Production commit | **PASS (đã xác định)** | GitHub Deployments API: `Production` → **`0234fef`** (2026-11-14T07:41Z, "feat: add script to fix organization email domain in database"). Trước đó là `44ae7e6`. |
| Đối chiếu bundle | PASS | Marker class trong JS bundle khớp `origin/main` (`0234fef`) và không khớp các commit `e9d06c6`/`0a89980` (marker A = 2, B = 0). |
| Commit trên nhánh `huy` | WARNING | `cc442a3`, `e9d06c6`, `0a89980` chỉ có bản **Preview**, chưa vào main hay Production (gồm các sửa lỗi import giảng viên). |
| Các bản sửa bảo mật (SECURITY_FIX_REPORT) | **FAIL** | Chưa commit, chỉ nằm trong working tree local. Bundle production vẫn chứa fallback `attestationObject`, không có `getAuthenticatorData`. |

## 3. Next.js 16 / App Router / API routes
| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Next 16.3.0, App Router, `proxy.ts` | PASS | Đúng quy ước Next 16 (`proxy` thay cho `middleware`). Proxy hoạt động trên production (xem mục 7). |
| Route API trả JSON đúng mã | PASS | `/api/me` → 200 `{"ok":false}` · `/api/attendance/sessions` → 401 · `/api/cron/sync-attendance` → 401. |
| 404 cho API không tồn tại | WARNING | `/api/does-not-exist` trả **trang HTML 404** thay vì JSON (ảnh hưởng nhỏ cho client API). |
| Trang được prerender và cache ở edge | PASS | `X-Vercel-Cache: HIT`, `Cache-Control: public, max-age=0, must-revalidate`. Trang chỉ là vỏ client (`SmartAttendApp`); dữ liệu đi qua API nên không có rò rỉ cache dữ liệu người dùng. |
| `maxDuration` của cron | WARNING | Route khai báo `maxDuration = 60`. Giới hạn thực tế phụ thuộc gói Vercel (NOT VERIFIED). |

## 4. Environment variables (chỉ tên; không đọc giá trị)
Không có quyền đọc env trên Vercel. Trạng thái bên dưới **suy ra từ hành vi quan sát được**; mục nào không suy ra được ghi NOT VERIFIED.

| Biến | Bắt buộc | Trạng thái | Căn cứ |
|---|---|---|---|
| `DATABASE_URL` | Có | NOT VERIFIED | Mọi endpoint không xác thực đều trả trước khi truy vấn DB. Mình không gửi request có cookie giả (sẽ chạy SELECT trên DB) để tôn trọng ràng buộc không truy cập dữ liệu. |
| `SESSION_SECRET` | Có (production throw nếu thiếu cả biến này lẫn `TEACHER_REGISTRATION_API_KEY`) | NOT VERIFIED | Chỉ được dùng khi xoay mã hoặc dùng WebAuthn (cần đăng nhập). |
| `TEACHER_REGISTRATION_API_KEY` | Có (để đăng ký admin) | NOT VERIFIED | |
| `CRON_SECRET` | Có (để cron chạy) | NOT VERIFIED | Endpoint trả 401 cả khi thiếu secret lẫn khi sai secret, nên không phân biệt được. |
| `MICROSOFT_CLIENT_ID` / `_SECRET` / `_TENANT_ID` / `_REDIRECT_URI` | Có nếu dùng SSO | **FAIL (rất có thể thiếu ≥1 biến)** | `GET /api/auth/microsoft?portal=student` → **500**. Theo code, `getMicrosoftAuth()` ném lỗi khi thiếu bất kỳ biến nào trong 4 biến này. Nguyên nhân khác (lỗi arctic) ít khả năng hơn, cần xem log để khẳng định. |
| `WEBAUTHN_RP_ID`, `WEBAUTHN_ORIGIN` | Có nếu dùng passkey | NOT VERIFIED, **rủi ro cao** | Giá trị mặc định là `localhost` / `http://localhost:3000`. Nếu chưa đặt thành `smart-attend-snowy.vercel.app` / `https://smart-attend-snowy.vercel.app`, mọi passkey sẽ bị từ chối. |
| `APP_URL` / `NEXT_PUBLIC_APP_URL` | Khuyến nghị | NOT VERIFIED | Dùng trong CSRF (trusted origin) và fallback WebAuthn origin. |
| `TRUSTED_PROXY_HOPS` | Tùy chọn | PASS (không cần) | Trên Vercel, `clientIp` dùng `x-vercel-forwarded-for`. |
| `NODE_ENV` | Tự động | PASS | HSTS có mặt và CSP không có `unsafe-eval` nên build đang ở chế độ production. |

## 5. Neon PostgreSQL
| Kiểm tra | Kết quả | Ghi chú |
|---|---|---|
| Driver | PASS | `@neondatabase/serverless` + `drizzle-orm/neon-http`, có retry khi cold start (`lib/db/index.ts`). |
| Production có dùng DB production riêng không | **NOT VERIFIED** | Không có quyền xem env hay Neon. Không xác định được Production và Preview có **dùng chung một DB** không. Nếu dùng chung, mọi bản Preview (kể cả nhánh `huy`) đều ghi vào dữ liệu thật. |
| Schema production đã có migration nào | NOT VERIFIED | Dự án dùng `drizzle-kit push`; chưa rõ trạng thái. Các migration `0004`/`0005` mới **chưa được áp** (theo yêu cầu). |
| Tài khoản demo | **WARNING (rủi ro cao, chưa kiểm chứng)** | README công bố `admin@smartattend.edu.vn` / `12345678` (và teacher, student). Nếu DB production đã chạy `scripts/seed.ts`, bất kỳ ai cũng đăng nhập được với quyền admin. Mình **không thử đăng nhập** vì việc đó ghi `auth_sessions`/`rate_limits`. |

## 6. Cron `/api/cron/sync-attendance`
| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| Bảo vệ endpoint | PASS | Không có secret hoặc secret sai → 401 `Unauthorized cron request.`; so sánh constant-time; endpoint bị vô hiệu hóa nếu thiếu `CRON_SECRET`. |
| Lịch chạy | **FAIL** | Không có `vercel.json > crons` và không có workflow GitHub nào gọi endpoint. Nếu dashboard cũng không cấu hình gì thì cron **không chạy**. Tính năng tự mở phiên và tự đóng sau 3 phút hiện chỉ hoạt động vì `syncScheduledAttendance` chạy kèm mỗi lần ai đó mở app (polling). Không có người dùng mở app thì phiên không tự mở. |
| Tương thích Vercel Cron | WARNING | Vercel Cron gửi `Authorization: Bearer <CRON_SECRET>`, khớp với code. Gói Hobby chỉ cho cron chạy **1 lần/ngày**, không đủ cho lịch theo phút; cần gói Pro hoặc scheduler ngoài. |

## 7. Domain, HTTPS, cookie, CSRF, OAuth, WebAuthn
| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| HTTPS + chuyển hướng | PASS | `http://` → **308** sang `https://`. |
| HSTS | PASS | `max-age=63072000; includeSubDomains; preload`. Lưu ý: `preload` trên subdomain `*.vercel.app` không có tác dụng; chỉ có ý nghĩa khi dùng domain riêng. |
| CSP, X-Frame-Options, nosniff, Referrer-Policy, Permissions-Policy | PASS (có WARNING) | Đủ header. CSP còn `script-src 'unsafe-inline'`. |
| Cookie phiên | PASS (theo code) | `smartattend_session`: HttpOnly, SameSite=Lax, Secure khi production. Chưa quan sát trực tiếp vì cần đăng nhập. |
| CSRF | **PASS (đã kiểm chứng trên production)** | `POST /api/auth/logout` với `Origin: https://evil.example` → 403 "Untrusted request origin"; `POST /api/auth/login` với `Sec-Fetch-Site: cross-site` → 403. |
| OAuth redirect URI | **FAIL** | Luồng SSO lỗi 500 ở bước khởi tạo (mục 4), nên không kiểm tra được `MICROSOFT_REDIRECT_URI`. Giá trị đúng phải là `https://smart-attend-snowy.vercel.app/api/auth/microsoft/callback` và phải được đăng ký trong Entra ID. |
| WebAuthn origin, RP ID | NOT VERIFIED (rủi ro cao) | Xem mục 4. Ngoài ra bản đang chạy còn lỗi CSRF khi đăng ký passkey (bản sửa chưa deploy). |
| Domain riêng | WARNING | Đang dùng `*.vercel.app`. Domain chính thức của trường (nếu có) sẽ kéo theo việc cập nhật `WEBAUTHN_*`, `MICROSOFT_REDIRECT_URI` và `APP_URL`. Passkey gắn với RP ID, nên đổi domain sau này làm mất toàn bộ passkey đã đăng ký. |

## 8. Deployment logs
| Kiểm tra | Kết quả |
|---|---|
| Vercel build/runtime logs | **NOT VERIFIED**: không có quyền. Cần xem log của request `/api/auth/microsoft` (500) để xác nhận nguyên nhân. |
| GitHub Actions | Xem mục 9. |

## 9. Lỗi build, runtime, cấu hình
| Kiểm tra | Kết quả | Bằng chứng |
|---|---|---|
| CI quality gate (`.github/workflows/ci.yml`) | **FAIL** | 3 lần chạy gần nhất trên `main` (`0234fef`, `44ae7e6`, `92c8afa`) đều **failure tại bước "Setup pnpm"**. `pnpm/action-setup@v4` cần `version` hoặc trường `packageManager` trong `package.json`, nhưng repo không có cả hai. Hệ quả: typecheck, lint, test và build **không bao giờ chạy trên CI**, và Vercel vẫn deploy dù CI đỏ. |
| Build trên Vercel | PASS | Deploy thành công (site phục vụ `0234fef`). |
| Runtime `/api/auth/microsoft` | **FAIL** | HTTP 500. |
| Test suite (local, không có DB) | WARNING | 2 file test thiếu `skipIf` luôn fail khi không có `DATABASE_URL`, sẽ làm CI đỏ nếu CI chạy mà thiếu secret (chi tiết: SECURITY_FIX_REPORT §6). |

## 10. Trạng thái các bản sửa Critical/High trên production
| Lỗi | Trên production (`0234fef`) |
|---|---|
| #1 Lộ OTP giữa giảng viên | **FAIL: chưa deploy**, lỗ hổng còn tồn tại |
| #3 Import vượt tenant, ghi đè mật khẩu | **FAIL: chưa deploy** |
| #4 OTP plaintext | **FAIL: chưa deploy**; migration 0004 chưa áp |
| #5 WebAuthn origin, replay, đăng ký, CSRF | **FAIL: chưa deploy** (bundle còn fallback `attestationObject`) |
| #6 Race tạo phiên | **FAIL: chưa deploy**; migration 0005 chưa áp |
| Roster IDOR, fail-open ở cảnh báo nghi vấn | **FAIL: chưa deploy** |
| #2 Thời lượng 3 phút, #7 đồng bộ trên đường đọc | Chưa sửa (chờ quyết định) |

---

## Việc phải hoàn thành trước khi triển khai chính thức

**Chặn phát hành (bắt buộc):**
1. **Sửa CI:** thêm `"packageManager": "pnpm@9.15.9"` vào `package.json` (hoặc `with: version: 9` cho `pnpm/action-setup`), thêm `skipIf` cho 2 test thiếu, và bật **branch protection** cho `main` để bắt buộc CI xanh trước khi merge hay deploy.
2. **Commit và review các bản sửa bảo mật** (SECURITY_FIX_REPORT), chạy test integration trên **Neon branch riêng**, rồi merge vào `main`.
3. **Tách database:** Production dùng DB riêng; Preview và Development dùng Neon branch khác. Kiểm tra lại env `DATABASE_URL` theo từng environment trên Vercel.
4. **Kiểm tra tài khoản demo trên DB production:** nếu tồn tại `admin@smartattend.edu.vn`, `teacher@…` hoặc `20260001@…` với mật khẩu công khai trong README thì vô hiệu hóa hoặc đổi mật khẩu ngay (thao tác do người có quyền thực hiện).
5. **Đặt đủ env cho Production:** `SESSION_SECRET` (riêng, không dùng lại API key), `CRON_SECRET`, `TEACHER_REGISTRATION_API_KEY`, `WEBAUTHN_RP_ID=smart-attend-snowy.vercel.app` (hoặc domain chính thức), `WEBAUTHN_ORIGIN=https://…`, `NEXT_PUBLIC_APP_URL`/`APP_URL`; đặt đủ 4 biến `MICROSOFT_*`, hoặc ẩn nút SSO nếu chưa dùng.
6. **Sửa Microsoft SSO (500):** xem Vercel runtime log, đặt đủ 4 biến, đăng ký redirect URI `https://<domain>/api/auth/microsoft/callback` trong Entra ID, đặt `MICROSOFT_TENANT_ID` là tenant của trường (không dùng `common`, tránh chiếm tài khoản qua email).
7. **Cấu hình cron:** Vercel Cron (cần gói Pro để chạy mỗi phút) hoặc scheduler ngoài gọi `GET /api/cron/sync-attendance` kèm `Authorization: Bearer <CRON_SECRET>`. Chốt quy tắc thời lượng phiên (câu hỏi #1–#3 trong SECURITY_FIX_REPORT) trước khi gỡ đồng bộ khỏi API đọc.
8. **Áp migration theo thứ tự trên staging rồi production:** tìm phiên mở trùng → `0005` → deploy → `0004` (SECURITY_FIX_REPORT §10).

**Nên làm trước khi go-live:**
9. Chốt **domain chính thức** trước khi người dùng đăng ký passkey (đổi RP ID về sau làm mất passkey).
10. Đặt region function gần region Neon (`vercel.json > regions` hoặc qua dashboard), và đo độ trễ của `/api/dashboard`.
11. Bật log và cảnh báo lỗi (Vercel Log Drains hoặc Sentry) cho 5xx, đặc biệt ở `/api/attendance/verify` và cron.
12. Trả JSON 404 cho `/api/*` không tồn tại; cân nhắc bỏ `'unsafe-inline'` khỏi CSP (dùng nonce).
13. Smoke test sau deploy (chỉ đọc hoặc trên tài khoản test): đăng nhập 3 cổng; giảng viên mở phiên, mã và QR xoay; sinh viên điểm danh; giảng viên B không thấy phiên của A; đăng ký passkey trên Chrome, Safari và Edge; import CSV với các ca trùng.

## Thông tin cần chủ dự án cung cấp để hoàn tất audit
- Quyền xem Vercel project (hoặc ảnh chụp: danh sách tên env theo environment, Production Branch, gói Vercel, Cron Jobs, Function Region, log của request lỗi 500).
- Production và Preview có dùng chung `DATABASE_URL` không; Neon project ở region nào.
- Domain chính thức dự kiến.
- DB production đã từng chạy `pnpm db:seed` chưa.
