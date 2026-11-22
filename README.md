# Threads Hot News

Site tĩnh tổng hợp các bài viết nổi bật trên Threads theo nhiều chủ đề (thời sự, kinh tế, thể thao, giải trí, công nghệ, sức khỏe, đời sống...), tự động cập nhật bằng GitHub Actions và deploy lên GitHub Pages.

## Cách hoạt động

1. **Thu thập** — `scripts/collect.mjs` gọi Threads API `GET /v1.0/keyword_search` với `search_type=TOP` cho từng từ khóa của 16 chủ đề, bỏ bài trùng (lưu 7 ngày trong `data/seen.json`), rồi chọn tối đa 30 bài theo kiểu xoay vòng chủ đề để bản tin không bị một chủ đề chiếm hết, và ghi `data/news.json`.
2. **Hiển thị** — `index.html` + `assets/app.js` đọc `data/news.json` và render bản tin, lọc theo chủ đề.
3. **Deploy** — GitHub Pages publish trực tiếp từ nhánh `main`; mỗi lần `data/` được commit, site tự build lại.

## Cấu trúc

```
index.html              # trang bản tin
assets/app.js           # render + lọc theo chủ đề
assets/styles.css       # giao diện dark theme
data/news.json          # dữ liệu bản tin (được commit)
data/seen.json          # id bài đã gặp, dùng để chống trùng (tự tạo khi chạy)
scripts/collect.mjs     # collector, không cần dependency
.github/workflows/      # pages.yml (deploy) + collect.yml (cron 3 lần/ngày)
```

## Chạy local

Không cần build. Chỉ cần một static server, vì `app.js` dùng `fetch`:

```bash
python3 -m http.server 8080   # hoặc: npx serve .
# mở http://localhost:8080
```

Chạy collector thật (cần token Threads):

```bash
THREADS_TOKEN=... node scripts/collect.mjs
```

Biến môi trường hỗ trợ:

- `THREADS_TOKEN` — long-lived access token.
- `MAX_PER_TOPIC` (mặc định 2) — số bài tối đa mỗi chủ đề.
- `MAX_ITEMS` (mặc định 30) — tổng số bài tối đa trong bản tin.
- `THREADS_KEYWORDS` (tuỳ chọn) — danh sách từ khóa tự do, cách nhau bằng dấu phẩy. Nếu đặt, mỗi từ khóa thành một chủ đề riêng và bỏ qua danh sách chủ đề mặc định.
- `THREADS_GRAPH_URL` — dùng để test với mock server.

Danh sách chủ đề mặc định nằm trong `DEFAULT_TOPICS` của `scripts/collect.mjs`; sửa ở đó nếu muốn thêm/bớt chủ đề.

## Thiết lập tự động cập nhật

1. Tạo Meta App (Use Case: **Access Threads API**), cấp quyền `threads_basic` + `threads_keyword_search`, đổi sang long-lived token (60 ngày).
2. Thêm secret `THREADS_TOKEN` trong **Settings → Secrets and variables → Actions**.
3. (Tuỳ chọn) thêm variables `THREADS_KEYWORDS`, `MAX_PER_TOPIC`, `MAX_ITEMS` trong tab **Variables**.
Không có secret thì `collect.yml` chỉ ghi notice và bỏ qua, site vẫn build bình thường.

### Về deploy

Pages đang dùng **Deploy from a branch → `main` / `/`** (kèm `.nojekyll`), không tốn Actions minutes.

> Lưu ý: tài khoản hiện đang bị khoá Actions vì lỗi billing ("The job was not started because your account is locked due to a billing issue"), nên `collect.yml` sẽ không chạy cho tới khi thanh toán được xử lý. Sau khi xử lý, bạn có thể chuyển Pages sang **Source: GitHub Actions** và chạy `pages.yml` bằng tay nếu muốn.

## Ghi chú

- **Chưa đăng lên X.** Phần xuất bản sang X API v2 (trả phí theo lượt gọi) là bước tiếp theo, nên giữ link nguồn ngoài nội dung tweet để tránh mức phí cao hơn.
- Threads API không có endpoint "trending toàn cầu"; "tin nóng" ở đây là các bài nổi bật trả về từ danh sách từ khóa của từng chủ đề.
- `data/news.json` đi kèm repo là **dữ liệu mẫu** 28 bài thuộc 16 chủ đề để xem trước giao diện; collector sẽ ghi đè bằng dữ liệu thật khi có `THREADS_TOKEN`.
- Token Threads hết hạn sau 60 ngày và cần được gia hạn thủ công hoặc bằng một cron riêng gọi `/refresh_access_token`.
