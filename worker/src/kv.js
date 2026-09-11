// ===================== WORKERS KV — CẤU HÌNH & CACHE =====================
// Dùng cho 2 việc:
//  1) Lưu cấu hình app (system prompt mặc định, danh sách model bật/tắt...)
//     -> đọc nhanh, ít thay đổi.
//  2) Cache/rate-limit đơn giản (ví dụ: giới hạn N request/phút cho 1 IP)
//     -> KV có TTL (hết hạn tự xoá) nên hợp cho việc này.

const CONFIG_KEY = 'app-config';

async function getAppConfig(env) {
  const kv = env.MY_AI_KV;
  if (!kv) throw new Error('KV chưa được cấu hình (thiếu binding MY_AI_KV)');
  const raw = await kv.get(CONFIG_KEY);
  return raw ? JSON.parse(raw) : {};
}

async function setAppConfig(env, config) {
  const kv = env.MY_AI_KV;
  if (!kv) throw new Error('KV chưa được cấu hình');
  await kv.put(CONFIG_KEY, JSON.stringify(config));
  return config;
}

// Rate limit rất đơn giản: đếm số request trong cửa sổ `windowSeconds`.
// Trả về true nếu request được PHÉP đi tiếp, false nếu đã vượt giới hạn.
async function checkRateLimit(env, key, { limit = 30, windowSeconds = 60 } = {}) {
  const kv = env.MY_AI_KV;
  if (!kv) return true; // KV chưa cấu hình -> không chặn ai cả, coi như tính năng tắt
  const rlKey = `ratelimit:${key}`;
  const current = await kv.get(rlKey);
  const count = current ? parseInt(current, 10) : 0;
  if (count >= limit) return false;
  await kv.put(rlKey, String(count + 1), { expirationTtl: windowSeconds });
  return true;
}

export { getAppConfig, setAppConfig, checkRateLimit };
