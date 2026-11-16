# SmartAttend — CI/CD Configuration

## 1. Nguyên nhân CI fail trước đây
`.github/workflows/ci.yml` dùng `pnpm/action-setup@v4` nhưng không có `version`, trong khi `package.json` cũng không có `packageManager`. Bước "Setup pnpm" fail ở **mọi** lần chạy, nên typecheck, lint, test và build chưa bao giờ được chạy (lần chạy gần nhất trên `main`: `0234fef`, `44ae7e6`, `92c8afa`).

## 2. Đã thay đổi (local, chưa commit)
| File | Thay đổi |
|---|---|
| `package.json` | `"packageManager": "pnpm@9.15.9"`, khớp `pnpm-lock.yaml` `lockfileVersion: '9.0'` (đã cài thử `--frozen-lockfile` thành công, lockfile không đổi). Script: `test`/`test:unit` (unit), `test:integration`, `test:engine` (integration). |
| `vitest.config.mts` | Chỉ chạy **unit**; ép `DATABASE_URL=''` để mọi truy cập DB vô tình fail ngay thay vì chạm DB trong `.env`. |
| `vitest.integration.config.mts` | Chạy **integration**; DB lấy **chỉ từ `TEST_DATABASE_URL`** (bỏ qua `DATABASE_URL` và `.env`); chạy tuần tự từng file. |
| `tests/setup/require-test-database.ts` | Global setup: **fail** nếu thiếu `TEST_DATABASE_URL`, hoặc nếu nó trùng `PRODUCTION_DATABASE_URL`. |
| `.github/workflows/ci.yml` | 2 job: `quality` (typecheck → lint → unit → build) và `integration` (cần `quality`; fail rõ ràng nếu thiếu secret; `drizzle-kit push --force` vào DB test; `test:integration`). Có `permissions: contents: read`, `concurrency`, và không chạy secret cho PR từ fork. |

### Phân loại test
- **Unit (17 file):** `lib/**/*.test.ts` trừ `lib/rate-limit.test.ts` và `lib/attendance/leave.test.ts`; cộng `tests/integration/{cookie-consent,cookie-storage,zod-validation,dashboard-route}.test.ts` (thuần, có mock).
- **Integration (21 file):** `lib/rate-limit.test.ts`, `lib/attendance/leave.test.ts`, và các file còn lại trong `tests/integration/`.
- **End-to-end:** `tests/junit` (Java, gọi HTTP) và `tests/load` (k6). Không chạy trong CI; cần một môi trường staging riêng.
- Các `describe.skipIf(!DATABASE_URL)` cũ vẫn còn trong file test, nhưng **không bao giờ kích hoạt** trong `test:integration` vì global setup fail trước khi tới đó. Chúng không còn che lỗi nữa.

## 3. Kết quả chạy thực tế (local, Node 24, pnpm 9.15.9, không có DB)
| Lệnh | Kết quả |
|---|---|
| `pnpm typecheck` | PASS (exit 0) |
| `pnpm lint` | PASS (exit 0) |
| `pnpm test:unit` | PASS: 17 file, **174/174** test, 0 skip |
| `pnpm test:integration` (không có `TEST_DATABASE_URL`) | **Fail có chủ đích** (exit 1) với thông báo yêu cầu DB test riêng |
| `pnpm build` (không có DB, không có secret) | PASS (exit 0) |
| `pnpm test:integration` với DB test | **BLOCKED**: chưa có DB test |
| GitHub Actions với workflow mới | **NOT VERIFIED**: chưa push |

## 4. Việc chủ dự án cần làm
1. Tạo một **Neon branch riêng cho CI** (ví dụ `ci-tests`, tách từ một branch rỗng hoặc chỉ có schema; **không** tách từ production nếu production có dữ liệu cá nhân).
2. GitHub → Settings → Secrets and variables → Actions → New repository secret: `TEST_DATABASE_URL` = connection string của branch đó. Không dùng chuỗi kết nối production.
3. (Tùy chọn) Thêm secret `PRODUCTION_DATABASE_URL` **chỉ để so sánh**: global setup sẽ từ chối chạy nếu hai giá trị trùng nhau. Nếu bạn không muốn lưu chuỗi production vào GitHub, bỏ qua bước này.

## 5. Branch protection (GitHub, cần quyền admin repo)
Settings → Branches (hoặc Rules → Rulesets) → Add rule cho `main`:
- ☑ Require a pull request before merging (≥1 approval).
- ☑ Require status checks to pass: chọn `Typecheck, Lint, Unit Tests & Build` và `Integration Tests (dedicated test database)`.
- ☑ Require branches to be up to date before merging.
- ☑ Block force pushes.
- ☑ Restrict deletions.
- ☑ (Khuyến nghị) Do not allow bypassing the above settings.

### Branch protection khác Vercel Deployment Checks
- **Branch protection** (GitHub) ngăn code chưa qua CI được *merge* vào `main`.
- **Vercel Deployment Checks** (Vercel → Project → Settings → Deployment Checks) ngăn một deployment đã build được *promote* lên Production cho tới khi các GitHub check chỉ định pass.
- Hiện Vercel vẫn deploy Production khi CI đỏ. Cần bật **cả hai**: branch protection để chặn merge, Deployment Checks để chặn promote.

## 6. Chạy ở local
```bash
corepack pnpm@9.15.9 install --frozen-lockfile   # hoặc: pnpm install --frozen-lockfile
pnpm typecheck && pnpm lint && pnpm test:unit && pnpm build
# Integration: CHỈ với DB test riêng
TEST_DATABASE_URL='<neon test branch>' pnpm test:integration
```
