// ===================== VECTORIZE — TÌM KIẾM NGỮ NGHĨA TRONG CHAT =====================
// Luồng hoạt động:
//  1) Mỗi khi lưu 1 tin nhắn (D1), gọi thêm indexMessage() để:
//     a. Gửi nội dung tin nhắn sang Gemini model "gemini-embedding-001" lấy vector 768 chiều
//     b. Lưu vector đó vào Vectorize kèm metadata (conversationId, role, đoạn text gốc)
//  2) Khi người dùng tìm kiếm ("tìm lại đoạn chat nói về...") gọi searchMessages():
//     a. Biến câu tìm kiếm thành vector (cùng model embedding)
//     b. Vectorize trả về các tin nhắn có vector "gần" nhất về mặt ngữ nghĩa
//        (khác tìm theo từ khoá — tìm được cả khi không trùng chữ, chỉ cần ý gần nhau)

import { geminiFetch } from './gemini-proxy.js';

// ⚠️ LƯU Ý: đây PHẢI là model embedding chuyên dụng (gọi endpoint :embedContent),
// KHÔNG được đổi thành model chat (gemini-3.1-flash-lite, gemini-3-flash-preview...) —
// các model chat không hỗ trợ embedContent, đổi sang sẽ làm Vectorize lỗi 400/404 ngay.
const EMBED_MODEL = 'gemini-embedding-001'; // model embedding mới nhất của Gemini (thay cho text-embedding-004 cũ)

async function embedText(env, apiKey, text) {
  const r = await geminiFetch(
    env,
    `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // outputDimensionality: 768 để khớp đúng số chiều của Vectorize index đã tạo (my-ai-chat-index)
      body: JSON.stringify({ content: { parts: [{ text }] }, outputDimensionality: 768 }),
    }
  );
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data).slice(0, 500));
  return data.embedding.values; // mảng 768 số thực
}

// Đánh chỉ mục 1 tin nhắn vào Vectorize (gọi sau khi đã saveMessage vào D1)
async function indexMessage(env, { messageId, conversationId, userId, role, content }) {
  const vectorize = env.MY_AI_VECTORIZE;
  const apiKey = env.GEMINI_API_KEY;
  if (!vectorize) throw new Error('Vectorize chưa được cấu hình (thiếu binding MY_AI_VECTORIZE)');
  if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY để tạo embedding');

  // Chỉ lấy 2000 ký tự đầu để tránh vượt giới hạn input của model embedding
  const trimmed = content.slice(0, 2000);
  const vector = await embedText(env, apiKey, trimmed);

  await vectorize.upsert([{
    id: messageId,
    values: vector,
    metadata: { conversationId, userId: userId || '', role, preview: trimmed.slice(0, 300) },
  }]);
}

// Tìm các tin nhắn gần nghĩa nhất với câu truy vấn — LUÔN lọc theo userId để người dùng
// chỉ tìm thấy tin nhắn trong chính lịch sử chat của mình, không thấy của người khác.
async function searchMessages(env, query, { topK = 8, conversationId, userId } = {}) {
  const vectorize = env.MY_AI_VECTORIZE;
  const apiKey = env.GEMINI_API_KEY;
  if (!vectorize) throw new Error('Vectorize chưa được cấu hình');
  if (!apiKey) throw new Error('Thiếu GEMINI_API_KEY');
  if (!userId) throw new Error('Thiếu userId (chưa đăng nhập)');

  const vector = await embedText(env, apiKey, query);
  const filter = conversationId ? { conversationId, userId } : { userId };
  const result = await vectorize.query(vector, { topK, returnMetadata: true, filter });

  return result.matches.map(m => ({
    messageId: m.id,
    score: m.score, // độ tương đồng, càng gần 1 càng liên quan
    conversationId: m.metadata?.conversationId,
    role: m.metadata?.role,
    // ⚠️ FIX lỗi "tìm kiếm ngữ nghĩa không hoạt động dù deploy được": Vectorize CÓ trả kết
    // quả thật (không lỗi mạng/lỗi server), nhưng field tên là "preview" trong khi frontend
    // (app.js -> semResultEl) lại đọc "content"/"text" -> mọi kết quả hiện ra RỖNG, trông như
    // "không hoạt động". Trả thêm cả "content" (alias của preview) để khớp đúng với FE.
    preview: m.metadata?.preview,
    content: m.metadata?.preview,
  }));
}

export { indexMessage, searchMessages };
