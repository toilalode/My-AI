// Danh sách model Gemini — cập nhật 11/09/2026, tra cứu trực tiếp từ
// https://ai.google.dev/gemini-api/docs/models và
// https://ai.google.dev/gemini-api/docs/pricing (nguồn chính thức Google).
// Google đổi tên/khai tử model khá thường xuyên, nếu gặp lỗi 404 model not found
// hãy vào 2 link trên kiểm tra tên mới nhất rồi sửa lại các giá trị bên dưới
// (chỉ cần sửa ở 1 chỗ này).
//
// ⚠️ QUAN TRỌNG — model nào FREE, model nào KHÔNG:
//  - Toàn bộ dòng Flash / Flash-Lite (chat) + TTS: FREE, không cần thẻ/billing.
//  - gemini-3.1-pro-preview (Pro): Google xác nhận KHÔNG có free tier từ 04/2026,
//    trả phí ngay từ request đầu tiên -> đã đổi "chatSmart" mặc định sang
//    gemini-3.8-flash (free) để tránh lỗi/billing ngoài ý muốn.
//    Muốn dùng Pro thật, tự đổi lại giá trị "chatSmart" bên dưới và bật billing
//    cho project trong Google Cloud/AI Studio trước.
//  - Toàn bộ model ẢNH (Nano Banana / Nano Banana Pro) và VIDEO (Veo, Omni Flash):
//    KHÔNG có free tier -> phải bật billing (thẻ) trên Google AI Studio /
//    Google Cloud thì mới gọi được, nếu không sẽ báo lỗi 400/403.
const MODELS = {
  chatLite:    'gemini-3.1-flash-lite',        // free — nhanh nhất, câu hỏi ngắn/đơn giản
  chatFast:    'gemini-3.6-flash',             // free — mặc định cho chat thường (thay cho gemini-3-flash-preview cũ)
  chatCoding:  'gemini-3.5-flash',             // free — mạnh cho code / agentic
  chatSmart:   'gemini-3.8-flash',             // free — ĐỔI từ gemini-3.1-pro-preview (không free) sang Flash mới nhất
  imageGen:    'gemini-3.1-flash-image',       // ⚠️ KHÔNG free — Nano Banana 2, cần bật billing
  imageGenPro: 'gemini-3-pro-image',           // ⚠️ KHÔNG free — Nano Banana Pro, cần bật billing
  videoGen:    'gemini-omni-flash-preview',    // ⚠️ KHÔNG free — tạo video ngắn, cần bật billing
  tts:         'gemini-3.1-flash-tts-preview', // free — sửa từ tên sai "gemini-2.5-flash-tts-preview"
};

// Bộ chọn model "Auto": đọc nội dung tin nhắn mới nhất của user để đoán
// nên dùng model nào cho hợp lý (nhanh mà vẫn đủ "thông minh").
function pickAutoModel(promptText = '', { webSearch = false, forceSmart = false } = {}) {
  if (forceSmart) return MODELS.chatSmart;
  const t = (promptText || '').toLowerCase();

  const codingHints = ['code', 'lập trình', 'sửa lỗi', 'debug', 'hàm ', 'function',
    'html', 'css', 'javascript', 'python', 'script', 'api', 'json', 'sql'];
  const deepHints = ['phân tích', 'so sánh', 'giải thích chi tiết', 'lý luận',
    'chứng minh', 'nghiên cứu', 'chiến lược', 'đánh giá'];

  if (codingHints.some(k => t.includes(k))) return MODELS.chatCoding;
  if (webSearch || deepHints.some(k => t.includes(k)) || promptText.length > 600) return MODELS.chatSmart;
  if (promptText.length > 0 && promptText.length < 40) return MODELS.chatLite;
  return MODELS.chatFast;
}

module.exports = { MODELS, pickAutoModel };
