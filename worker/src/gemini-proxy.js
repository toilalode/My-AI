// ---------- Durable Object: ép mọi request gọi Gemini API luôn xuất phát từ 1 vùng cố định ----------
// Lý do: Cloudflare Worker "thường" chạy phân tán khắp nơi trên thế giới, có lúc bị định tuyến
// qua 1 vùng mà Google chưa hỗ trợ Gemini API (=> lỗi "User location is not supported for the
// API use", dù bạn đang ngồi ở vùng được hỗ trợ). Durable Object thì được ghim cố định vào 1
// vùng (locationHint) ngay từ lần đầu tạo, nên mọi lần gọi Gemini sau đó luôn xuất phát từ đúng
// vùng đó, ổn định hơn nhiều so với Worker thường.
export class GeminiProxyDO {
  constructor(state, env) { this.state = state; this.env = env; }
  async fetch(request) {
    // Chỉ đơn thuần chuyển tiếp y nguyên request (kể cả streaming) tới Gemini.
    return fetch(request);
  }
}

const GEMINI_LOCATION_HINT = 'apac'; // Châu Á - Thái Bình Dương, nơi Gemini API hoạt động ổn định

export async function geminiFetch(env, url, options = {}) {
  if (!env.GEMINI_PROXY) return fetch(url, options); // fallback nếu chưa deploy DO binding
  const id = env.GEMINI_PROXY.idFromName('gemini-proxy-' + GEMINI_LOCATION_HINT);
  const stub = env.GEMINI_PROXY.get(id, { locationHint: GEMINI_LOCATION_HINT });
  return stub.fetch(new Request(url, options));
}
