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
    `SELECT id, title, model, created_at, updated_at FROM conversations ORDER BY updated_at DESC LIMIT ?`
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

async function deleteConversation(env, conversationId) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  // messages tự xoá theo do ON DELETE CASCADE trong schema.sql
  await db.prepare(`DELETE FROM conversations WHERE id = ?`).bind(conversationId).run();
}

async function renameConversation(env, conversationId, title) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  await db.prepare(`UPDATE conversations SET title = ? WHERE id = ?`).bind(title, conversationId).run();
}

export { createConversation, listConversations, getConversationMessages, saveMessage, deleteConversation, renameConversation };
