// ===================== D1 — LỊCH SỬ CHAT =====================
// Toàn bộ hàm ở đây đều "an toàn" theo nghĩa: nếu D1 chưa cấu hình (env.MY_AI_DB
// không tồn tại), ném lỗi rõ ràng để nơi gọi có thể bỏ qua (không làm sập tính
// năng chat chính nếu người dùng chưa setup D1).

function randomId() {
  return crypto.randomUUID();
}

async function createConversation(env, { title = 'Cuộc trò chuyện mới', model } = {}) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình (thiếu binding MY_AI_DB)');
  const id = randomId();
  await db.prepare(
    `INSERT INTO conversations (id, title, model) VALUES (?, ?, ?)`
  ).bind(id, title, model || null).run();
  return { id, title, model };
}

async function listConversations(env, { limit = 50 } = {}) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  const { results } = await db.prepare(
    `SELECT id, title, model, created_at, updated_at FROM conversations WHERE deleted_at IS NULL ORDER BY updated_at DESC LIMIT ?`
  ).bind(limit).all();
  return results;
}

// Danh sách hội thoại đã xoá mềm, còn trong "thùng rác" (chưa quá 7 ngày).
// Trả kèm daysLeft để frontend hiển thị "còn X ngày sẽ bị xoá vĩnh viễn".
async function listDeletedConversations(env, { limit = 100 } = {}) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  const { results } = await db.prepare(
    `SELECT id, title, model, created_at, updated_at, deleted_at,
            CAST(7 - (julianday('now') - julianday(deleted_at)) AS INTEGER) AS days_left
     FROM conversations
     WHERE deleted_at IS NOT NULL
     ORDER BY deleted_at DESC
     LIMIT ?`
  ).bind(limit).all();
  return results;
}

async function getConversationMessages(env, conversationId) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  const { results } = await db.prepare(
    `SELECT id, role, content, model, created_at FROM messages WHERE conversation_id = ? ORDER BY created_at ASC`
  ).bind(conversationId).all();
  return results;
}

async function saveMessage(env, { conversationId, role, content, model }) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  const id = randomId();
  await db.batch([
    db.prepare(`INSERT INTO messages (id, conversation_id, role, content, model) VALUES (?, ?, ?, ?, ?)`)
      .bind(id, conversationId, role, content, model || null),
    db.prepare(`UPDATE conversations SET updated_at = datetime('now') WHERE id = ?`)
      .bind(conversationId),
  ]);
  return { id };
}

// Xoá MỀM: chỉ đánh dấu deleted_at, không mất dữ liệu. Hội thoại sẽ biến mất khỏi
// sidebar chính nhưng còn khôi phục được trong 7 ngày (xem panel "Đã xoá gần đây").
async function deleteConversation(env, conversationId) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  await db.prepare(`UPDATE conversations SET deleted_at = datetime('now') WHERE id = ?`).bind(conversationId).run();
}

// Khôi phục 1 hội thoại đã xoá mềm (trong hạn 7 ngày).
async function restoreConversation(env, conversationId) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  await db.prepare(`UPDATE conversations SET deleted_at = NULL WHERE id = ?`).bind(conversationId).run();
}

// Xoá VĨNH VIỄN 1 hội thoại (dùng khi người dùng bấm "Xoá hẳn ngay" trong thùng rác).
// messages tự xoá theo do ON DELETE CASCADE trong schema.sql
async function purgeConversation(env, conversationId) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  await db.prepare(`DELETE FROM conversations WHERE id = ?`).bind(conversationId).run();
}

// Dọn rác tự động: xoá vĩnh viễn mọi hội thoại đã nằm trong thùng rác quá 7 ngày.
// Gọi hàm này định kỳ (Cron Trigger) hoặc mỗi khi có người mở panel "Đã xoá gần đây".
async function purgeExpiredConversations(env) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  const { meta } = await db.prepare(
    `DELETE FROM conversations WHERE deleted_at IS NOT NULL AND julianday('now') - julianday(deleted_at) >= 7`
  ).run();
  return { purged: meta?.changes || 0 };
}

async function renameConversation(env, conversationId, title) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  await db.prepare(`UPDATE conversations SET title = ? WHERE id = ?`).bind(title, conversationId).run();
}

export {
  createConversation,
  listConversations,
  listDeletedConversations,
  getConversationMessages,
  saveMessage,
  deleteConversation,
  restoreConversation,
  purgeConversation,
  purgeExpiredConversations,
  renameConversation,
};
