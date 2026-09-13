// Danh sách model Gemini — cập nhật 11/09/2026, tra cứu trực tiếp từ
// https://ai.google.dev/gemini-api/docs/models và
// https://ai.google.dev/gemini-api/docs/pricing (nguồn chính thức Google).
// Nếu gặp lỗi 404 model not found, kiểm tra tên mới nhất tại 2 link trên rồi sửa lại ở đây.
//
// ⚠️ QUAN TRỌNG — model nào FREE, model nào KHÔNG:
//  - Toàn bộ dòng Flash / Flash-Lite (chat) + TTS: FREE, không cần thẻ/billing.
//  - gemini-3.1-pro-preview (Pro): Google xác nhận KHÔNG có free tier từ 04/2026,
//    trả phí ngay từ request đầu tiên -> đã đổi model mặc định cho "chatSmart"
//    sang gemini-3.8-flash (free) để tránh lỗi/billing ngoài ý muốn.
//    Muốn dùng Pro thật, tự đổi lại giá trị "chatSmart" bên dưới và bật billing
//    cho project trong Google Cloud/AI Studio trước.
//  - Toàn bộ model ẢNH (Nano Banana / Nano Banana Pro) và VIDEO (Veo, Omni Flash):
//    KHÔNG có free tier -> phải bật billing (thẻ) trên Google AI Studio /
//    Google Cloud thì mới gọi được, nếu không sẽ báo lỗi 400/403.
export const MODELS = {
  chatLite:    'gemini-3.1-flash-lite',   // free — trả lời ngắn, nhanh
  chatFast:    'gemini-3-flash-preview',  // free — SỬA: model này đã xác nhận chạy được qua lựa chọn thủ công;
                                            // trước đó Auto dùng "gemini-3.8-flash" (tên chưa test, không có trong
                                            // danh sách chọn tay) khiến chỉ riêng chế độ Auto bị lỗi không trả lời.
  chatCoding:  'gemini-3.5-flash',        // free — tốt cho code
  chatSmart:   'gemini-3-flash-preview',  // free — SỬA cùng lý do như chatFast ở trên
  imageGen:    'gemini-3.1-flash-image',      // ⚠️ KHÔNG free — cần bật billing (Nano Banana 2)
  imageGenPro: 'gemini-3-pro-image',          // ⚠️ KHÔNG free — cần bật billing (Nano Banana Pro)
  videoGen:    'gemini-omni-flash-preview',   // ⚠️ KHÔNG free — cần bật billing
  tts:         'gemini-3.1-flash-tts-preview', // free — sửa từ tên sai "gemini-2.5-flash-tts-preview"
};

export function pickAutoModel(promptText = '', { webSearch = false } = {}) {
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
