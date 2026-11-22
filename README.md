# Threads → X Hot News

Tự động lấy các bài viết nổi bật theo từ khóa trên Meta Threads, tóm tắt bằng LLM và đăng bản tin ngắn lên X (Twitter).

## Ý tưởng

- **Đầu vào (miễn phí):** Threads API `GET /keyword_search` với `search_type=TOP` (giới hạn ~2.200 lượt tìm kiếm / 24 giờ).
- **Xử lý:** lọc trùng theo `id` (KV/JSON), gom nhóm và tóm tắt thành bản tin ngắn bằng LLM.
- **Đầu ra:** X API v2 `POST /2/tweets` (trả phí theo lượt gọi; tránh chèn URL để giảm chi phí), hoặc Telegram/Discord webhook nếu muốn miễn phí hoàn toàn.
- **Hạ tầng dự kiến:** Cloudflare Workers + Cron Triggers + KV.

## Trạng thái

Đang ở giai đoạn khởi tạo. Các bước tiếp theo: đăng ký Meta App (Threads token), X Developer Portal, và dựng Worker.
