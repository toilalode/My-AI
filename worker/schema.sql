-- ===================== D1 SCHEMA =====================
-- Chạy 1 lần sau khi tạo database:
--   wrangler d1 execute my-ai-db --file=./schema.sql --remote
-- (bỏ --remote nếu muốn test trên DB local trước)

-- Mỗi cuộc hội thoại (1 "phiên chat" trong sidebar bên trái)
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,        -- uuid tạo ở phía client hoặc Worker
  title       TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  model       TEXT,                    -- model dùng chủ yếu trong hội thoại này
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT                     -- NULL = chưa xoá. Có giá trị = đã xoá mềm, tự dọn sau 7 ngày.
);

-- Nếu bảng đã tồn tại từ trước (đã chạy schema.sql bản cũ), chạy thêm dòng dưới 1 lần:
-- ALTER TABLE conversations ADD COLUMN deleted_at TEXT;

CREATE INDEX IF NOT EXISTS idx_conversations_deleted ON conversations(deleted_at);

-- Từng tin nhắn trong 1 hội thoại
CREATE TABLE IF NOT EXISTS messages (
  id              TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
  role            TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content         TEXT NOT NULL,
  model           TEXT,                -- model đã trả lời (nếu role = assistant)
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id, created_at);
CREATE INDEX IF NOT EXISTS idx_conversations_updated ON conversations(updated_at DESC);
