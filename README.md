# Velocitix-AI
- Mở web tại :
- https://toilalode.github.io/Velocitix-AI/
## Cài đặt

```bash
cd Velocitix-AI
npm install
cp .env.example .env
```

Mở file `.env`, dán API key free của bạn (lấy tại https://aistudio.google.com/apikey):

```
GEMINI_API_KEY=AIza...
```

Chạy:

```bash
npm start
```

Mở trình duyệt: `http://localhost:8080`

## Cấu trúc

```
Velocitix-AI/
├── backend/
│   ├── server.js         # Express server, gộp toàn bộ route
│   ├── config/models.js  # Tên model Gemini + logic Auto model
│   ├── routes/
│   │   ├── chat.js       # Chat streaming (SSE), thinking toggle, web search
│   │   ├── image.js      # Tạo ảnh (Nano Banana 2 / Pro)
│   │   ├── video.js      # Tạo video ngắn (Gemini Omni Flash)
│   │   ├── tts.js        # Text -> giọng nói
│   │   ├── search.js     # Mở URL & hỏi + Deep Research nhiều bước
│   │   └── upload.js     # Upload file/ảnh/video
│   └── uploads/          # File tạm khi upload
├── frontend/
│   ├── index.html        # Toàn bộ giao diện (sidebar + các panel)
│   ├── style.css
│   └── app.js
├── .env.example
├── package.json
└── README.md
```

## Các nút / tính năng trong giao diện

| Nút | Hoạt động |
|---|---|
| 💬 Chat | Chat streaming thật, chọn model tay hoặc **Auto** |
| 📘 Giải bài tập | Dùng chung khung chat, nhưng ép AI giải thích từng bước thay vì chỉ đưa đáp án |
| 🖼️ Tạo ảnh | Gọi model ảnh Gemini, có tuỳ chọn "Pro" cho chất lượng cao hơn |
| 🎬 Tạo video | Gọi Gemini Omni Flash — **cần tài khoản có billing/quyền**, free tier có thể báo lỗi |
| 🧩 Canvas | AI viết 1 trang HTML/CSS/JS độc lập, preview trực tiếp trong iframe, sửa tay được |
| 💻 Code Editor | Ô code + ô yêu cầu, nhờ AI viết/sửa code, copy/tải về |
| 🎙️ Voice | Ghi âm → gửi cho AI → nhận trả lời bằng giọng nói (theo lượt, chưa phải streaming thời gian thực) |
| 🚀 Agent Mode | Lấy cảm hứng từ Antigravity/Gemini Spark: AI tự lên kế hoạch + tự tra cứu web nhiều bước |
| 🔎 Deep Research | Tương tự Agent nhưng tập trung ra báo cáo; có thêm nút "mở 1 URL và hỏi AI về trang đó" |
| 🧠 Thinking | Bật/tắt chế độ suy luận sâu (thinkingConfig) |
| 🌐 Web Search | Bật để AI tìm kiếm Google thật trong lúc trả lời (grounding), có trích nguồn |
| 🕶️ Tạm thời | Không lưu cuộc trò chuyện vào máy |
| 📎🖼️📁📷🎥🎤 | Đính kèm file / ảnh-video / cả thư mục / chụp ảnh / quay video / ghi âm hỏi nhanh |
| ⚙️ Connectors | Khung để sau này nối Gmail/Drive/Notion/Slack — hiện là placeholder |

## Vài điều cần biết trước khi dùng thật

- **Antigravity và Gemini Spark là sản phẩm riêng của Google** (chạy trên hạ tầng cloud/VM riêng, tích hợp sâu Gmail/Workspace) — không có API public để nhúng y hệt. "Agent Mode" trong app này là bản tự làm, lấy cảm hứng tương tự (tự lên kế hoạch + tự tìm kiếm), chạy hoàn toàn qua Gemini API công khai.
- **Tạo video** cần tài khoản Google AI có billing/quyền tính năng video — nếu API trả lỗi 400/403, đó là giới hạn phía tài khoản Google, không phải lỗi trong code.
- **Voice** hiện là "theo lượt": ghi âm xong mới gửi, không phải nói chuyện ngắt lời thời gian thực như Gemini Live thật (cái đó cần WebSocket streaming audio hai chiều — có thể nâng cấp sau).
- **Tên model Gemini đổi khá thường xuyên.** Nếu gặp lỗi "model not found", sửa lại tên model trong `backend/config/models.js` theo danh sách mới nhất tại https://ai.google.dev/gemini-api/docs/models

## Deploy bằng Cloudflare Workers + GitHub Pages

Đây là cách deploy **miễn phí, không cần server riêng**. Kiến trúc:

- **Cloudflare Worker** = backend (thay cho `backend/` chạy Node) — nằm ở thư mục `worker/`
- **GitHub Pages** = host tĩnh cho `frontend/`

### Bước 1 — Deploy Worker (backend)

```bash
cd worker
npm install -g wrangler   # nếu chưa có
wrangler login
wrangler secret put GEMINI_API_KEY   # dán API key free vào khi được hỏi
wrangler deploy
```

Sau khi deploy xong, Wrangler in ra 1 URL dạng:
`https://my-ai-worker.<ten-subdomain-cua-ban>.workers.dev`
→ copy URL này lại, dùng ở bước 2.

### Bước 2 — Deploy frontend (GitHub Pages)

1. Mở `frontend/app.js`, sửa dòng:
   ```js
   const API_BASE = '';
   ```
   thành:
   ```js
   const API_BASE = 'https://my-ai-worker.<ten-subdomain-cua-ban>.workers.dev';
   ```
2. Đẩy toàn bộ nội dung thư mục `frontend/` lên 1 repo GitHub (có thể để ở nhánh `main`, thư mục gốc hoặc `/docs`).
3. Vào **Settings → Pages** của repo, chọn nhánh/thư mục chứa `index.html`, bấm Save.
4. Sau vài phút, trang chạy tại `https://<username>.github.io/<ten-repo>/`.

### Các dịch vụ Cloudflare đang dùng (và có thể dùng thêm)

| Loại | Dịch vụ | Dùng để làm gì | Trạng thái trong project |
|---|---|---|---|
| Key-value storage | **Workers KV** | Cấu hình app, metadata định tuyến, A/B testing | ✅ Đã dùng — `worker/src/kv.js` (`/api/config`, rate-limit) |
| Object / blob storage | **R2** | File ảnh/video AI tạo ra, file người dùng upload, dataset | ⛔ Không dùng — Cloudflare bắt buộc khai thẻ/billing để bật R2 kể cả free tier. Đã thay bằng lưu file trong **Workers KV** (không cần thẻ) — xem `worker/src/storage.js` |
| Lightweight SQL database | **D1** | Lịch sử hội thoại, tin nhắn, hồ sơ người dùng | ✅ Đã dùng — `worker/src/db.js` + `worker/schema.sql` |
| Task processing / messaging | **Queues** | Xử lý video generate chạy nền, tránh timeout 30s | ✅ Đã dùng — `worker/src/queue-video.js` (`/api/video/generate-async`) |
| Vector search & embeddings | **Vectorize** | Embedding tin nhắn qua Gemini, tìm kiếm ngữ nghĩa trong lịch sử chat | ✅ Đã dùng — `worker/src/vectorize.js` (`/api/search/semantic`) |
| Accelerate Postgres/MySQL | **Hyperdrive** | Kết nối tới database Postgres/MySQL có sẵn (cloud/on-prem) qua driver/ORM quen thuộc | ⛔ Chưa dùng — project hiện chỉ cần D1, không có DB ngoài để tăng tốc |
| Global coordination / stateful serverless | **Durable Objects** | App cộng tác, đồng bộ nhiều client, WebSocket real-time, lưu trữ transactional nhất quán mạnh | ⛔ Chưa dùng — chỉ cần nếu sau này làm chat đa người dùng real-time (voice streaming 2 chiều kiểu Gemini Live cũng có thể cần cái này) |
| Streaming ingestion | **Pipelines** | Ingest dữ liệu dạng stream: clickstream, telemetry/log, dữ liệu có cấu trúc để query | ⛔ Chưa dùng — chưa có nhu cầu thu log/clickstream ở quy mô lớn |
| Time-series metrics | **Analytics Engine** | Ghi/truy vấn metric high-cardinality, số liệu sử dụng, service-level telemetry | ✅ Đã dùng — `worker/src/analytics.js`, ghi số request/model/lỗi ở các endpoint chat/image/video/tts, xem tại dashboard Cloudflare (Workers & Pages → Analytics Engine) |

Ghi chú: **Hyperdrive**, **Durable Objects**, **Pipelines** chưa cần thiết cho quy mô app cá nhân hiện tại (D1 + KV + R2 + Queues + Vectorize đã đủ). Có thể bổ sung sau nếu: mở rộng ra nhiều người dùng cộng tác real-time (→ Durable Objects), cần dashboard theo dõi usage/lỗi theo thời gian (→ Analytics Engine), hoặc phải nối vào một Postgres/MySQL có sẵn ở nơi khác (→ Hyperdrive).

### Khác biệt so với bản Node ở trên

- Worker **không có ổ đĩa**, nên nút đính kèm file giờ đọc file thành base64 **ngay trên trình duyệt** rồi gửi thẳng — route `backend/routes/upload.js` của bản Node giờ không còn được frontend gọi tới nữa (vẫn để đó nếu bạn muốn dùng riêng bản Node).
- File quá lớn (khoảng >15–20MB) có thể vượt giới hạn request — nếu cần upload file lớn thật (video dài), nên dùng Gemini File API riêng thay vì gửi base64 trực tiếp.
- CORS trong `worker/src/index.js` đang để `Access-Control-Allow-Origin: '*'` cho dễ test. Muốn an toàn hơn, sửa lại thành đúng domain GitHub Pages của bạn.
- Muốn xem log lỗi khi Worker chạy: `wrangler tail`.

## Phát triển tiếp

Vì bạn quen sửa file trực tiếp và test bằng Node.js: mọi endpoint backend đều tách file riêng trong `backend/routes/`, sửa xong chạy `node --check backend/routes/<file>.js` để kiểm tra cú pháp trước khi chạy lại `npm start`.
