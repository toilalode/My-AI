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

// Thử lần lượt các vùng này cho tới khi gọi Gemini thành công (né lỗi "User location
// is not supported"). Random hoá thứ tự nhẹ để không dồn hết traffic vào 1 vùng.
const GEMINI_LOCATION_HINTS = ['apac', 'wnam', 'enam', 'weur', 'eeur', 'oc', 'sam'];

async function isLocationBlockedResponse(res) {
  if (res.status !== 400) return false;
  try {
    const clone = res.clone();
    const data = await clone.json();
    return data?.error?.status === 'FAILED_PRECONDITION'
      && /user location is not supported/i.test(data?.error?.message || '');
  } catch { return false; }
}

export async function geminiFetch(env, url, options = {}) {
  if (!env.GEMINI_PROXY) return fetch(url, options); // fallback nếu chưa deploy DO binding

  let lastRes = null;
  for (const hint of GEMINI_LOCATION_HINTS) {
    const id = env.GEMINI_PROXY.idFromName('gemini-proxy-' + hint);
    const stub = env.GEMINI_PROXY.get(id, { locationHint: hint });
    const res = await stub.fetch(new Request(url, options));
    if (!(await isLocationBlockedResponse(res))) return res; // thành công hoặc lỗi khác -> trả về luôn
    lastRes = res; // lỗi vị trí -> thử vùng tiếp theo
  }
  return lastRes; // hết vùng để thử, trả về lỗi cuối cùng
}
