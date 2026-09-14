-- ===================== D1 SCHEMA =====================
-- Chạy 1 lần sau khi tạo database:
--   wrangler d1 execute my-ai-db --file=./schema.sql --remote
-- (bỏ --remote nếu muốn test trên DB local trước)
--
-- ⚠️ File này XÓA SẠCH dữ liệu chat cũ (không gắn user nào) để chuyển sang mô hình
-- có đăng nhập Google — mỗi hội thoại giờ thuộc về 1 user_id cụ thể.
DROP TABLE IF EXISTS messages;
DROP TABLE IF EXISTS conversations;
DROP TABLE IF EXISTS users;

-- Người dùng đăng nhập bằng Google. id = "sub" (Google user id, cố định, không đổi theo email).
CREATE TABLE IF NOT EXISTS users (
  id          TEXT PRIMARY KEY,        -- Google "sub" claim
  email       TEXT NOT NULL,
  name        TEXT,
  picture     TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Mỗi cuộc hội thoại (1 "phiên chat" trong sidebar bên trái)
CREATE TABLE IF NOT EXISTS conversations (
  id          TEXT PRIMARY KEY,        -- uuid tạo ở phía client hoặc Worker
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title       TEXT NOT NULL DEFAULT 'Cuộc trò chuyện mới',
  model       TEXT,                    -- model dùng chủ yếu trong hội thoại này
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
  deleted_at  TEXT                     -- NULL = chưa xoá. Có giá trị = đã xoá mềm, tự dọn sau 7 ngày.
);

CREATE INDEX IF NOT EXISTS idx_conversations_deleted ON conversations(deleted_at);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations(user_id, updated_at DESC);

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
