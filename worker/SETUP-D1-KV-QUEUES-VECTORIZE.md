# Setup D1, KV, Queues, Vectorize cho Worker

Chạy các lệnh này 1 lần trong thư mục `worker/` (cần đã `wrangler login` trước).

## 1. D1 (lịch sử chat)
```bash
wrangler d1 create my-ai-db
```
Copy `database_id` in ra, dán vào `wrangler.toml` chỗ `database_id = "DAN_DATABASE_ID_VAO_DAY"`.

Tạo bảng:
```bash
wrangler d1 execute my-ai-db --file=./schema.sql --remote
```

## 2. Workers KV (cấu hình + trạng thái job video)
```bash
wrangler kv namespace create MY_AI_KV
```
Copy `id` in ra, dán vào `wrangler.toml` chỗ `id = "DAN_KV_NAMESPACE_ID_VAO_DAY"`.

## 3. Queues (video generate chạy nền)
```bash
wrangler queues create my-ai-video-queue
wrangler queues create my-ai-video-queue-dlq
```

## 4. Vectorize (tìm kiếm ngữ nghĩa trong chat)
```bash
wrangler vectorize create my-ai-chat-index --dimensions=768 --metric=cosine
```

## 5. Deploy
```bash
wrangler deploy
```

## Kiểm tra hoạt động

```bash
# Tạo hội thoại mới
curl -X POST https://<worker-url>/api/conversations -d '{"title":"Test"}'

# Lưu 1 tin nhắn (thay <id> bằng id trả về ở trên)
curl -X POST https://<worker-url>/api/conversations/<id>/messages \
  -d '{"role":"user","content":"Xin chào"}'

# Tìm kiếm ngữ nghĩa
curl "https://<worker-url>/api/search/semantic?q=lời chào"

# Tạo video chạy nền
curl -X POST https://<worker-url>/api/video/generate-async -d '{"prompt":"mèo con chạy trên bãi cỏ"}'
# -> trả về { "jobId": "..." }

# Hỏi trạng thái job (gọi lại vài giây/lần cho tới khi status = "done")
curl https://<worker-url>/api/video/status/<jobId>
```

## Lưu ý free tier (không cần bật billing)
- D1: 5GB, 5 triệu dòng đọc/ngày, 100.000 dòng ghi/ngày
- KV: 1GB, 100.000 đọc/ngày, 1.000 ghi/ngày
- Queues: 10.000 operations/ngày
- Vectorize: 30 triệu queried dimensions/tháng, 5 triệu stored dimensions
- R2: 10GB

App cá nhân dùng bình thường không chạm các giới hạn này.
