// ===================== AUTH — Đăng nhập bằng Google =====================
// Luồng:
//   1) Frontend dùng Google Identity Services lấy "credential" (1 JWT do Google ký, RS256).
//   2) POST /api/auth/google { credential } -> Worker xác minh JWT bằng public key JWKS của Google,
//      lấy ra { sub, email, name, picture }, lưu/update vào bảng users, rồi phát 1 SESSION TOKEN
//      riêng của app (HMAC-signed, không phải JWT Google) để FE lưu lại và gửi kèm mọi request sau.
//   3) Mọi route cần đăng nhập gọi requireUser(request, env) để lấy userId từ session token
//      trong header "Authorization: Bearer <token>".
//
// Vì sao không dùng thẳng Google JWT cho mọi request: JWT Google hết hạn sau ~1h và việc verify
// JWKS mỗi request tốn 1 lần fetch mạng (có cache). Session token tự ký (HMAC) bằng SESSION_SECRET
// (đặt qua `wrangler secret put SESSION_SECRET`) thì verify tại chỗ, không cần gọi mạng, và ta có
// thể set hạn dài hơn (ví dụ 30 ngày) cho trải nghiệm không phải đăng nhập lại liên tục.

const GOOGLE_JWKS_URL = 'https://www.googleapis.com/oauth2/v3/certs';
const SESSION_TTL_SECONDS = 60 * 60 * 24 * 30; // 30 ngày

function base64UrlToUint8Array(b64url) {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/').padEnd(b64url.length + (4 - (b64url.length % 4)) % 4, '=');
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return arr;
}
function uint8ArrayToBase64Url(bytes) {
  let bin = '';
  bytes.forEach(b => bin += String.fromCharCode(b));
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
function base64UrlDecodeJson(b64url) {
  return JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(b64url)));
}

// Cache JWKS trong bộ nhớ của instance Worker (sống vài phút tới vài giờ tuỳ Cloudflare) để không
// phải fetch lại ở mọi request đăng nhập.
let jwksCache = null;
let jwksCacheAt = 0;
async function getGoogleJwks() {
  if (jwksCache && Date.now() - jwksCacheAt < 60 * 60 * 1000) return jwksCache;
  const r = await fetch(GOOGLE_JWKS_URL);
  if (!r.ok) throw new Error('Không tải được JWKS của Google');
  const data = await r.json();
  jwksCache = data.keys;
  jwksCacheAt = Date.now();
  return jwksCache;
}

// Xác minh chữ ký RS256 của Google ID token (KHÔNG dùng thư viện ngoài — chỉ Web Crypto API có sẵn
// trong Cloudflare Workers) và trả về payload nếu hợp lệ.
async function verifyGoogleIdToken(idToken, googleClientId) {
  const parts = idToken.split('.');
  if (parts.length !== 3) throw new Error('ID token không đúng định dạng JWT');
  const [headerB64, payloadB64, sigB64] = parts;
  const header = base64UrlDecodeJson(headerB64);
  const payload = base64UrlDecodeJson(payloadB64);

  if (payload.iss !== 'https://accounts.google.com' && payload.iss !== 'accounts.google.com') {
    throw new Error('Sai issuer (không phải Google)');
  }
  if (payload.aud !== googleClientId) throw new Error('Sai audience (Client ID không khớp)');
  if (payload.exp && Date.now() / 1000 > payload.exp) throw new Error('ID token đã hết hạn');

  const jwks = await getGoogleJwks();
  const jwk = jwks.find(k => k.kid === header.kid);
  if (!jwk) throw new Error('Không tìm thấy public key phù hợp (kid) từ Google');

  const cryptoKey = await crypto.subtle.importKey(
    'jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']
  );
  const signature = base64UrlToUint8Array(sigB64);
  const signedData = new TextEncoder().encode(`${headerB64}.${payloadB64}`);
  const ok = await crypto.subtle.verify('RSASSA-PKCS1-v1_5', cryptoKey, signature, signedData);
  if (!ok) throw new Error('Chữ ký JWT không hợp lệ');

  return payload; // { sub, email, name, picture, ... }
}

// ---------- Session token của riêng app (HMAC-SHA256, tự ký, không cần gọi mạng để verify) ----------
async function getHmacKey(env) {
  if (!env.SESSION_SECRET) throw new Error('Thiếu SESSION_SECRET (chạy: wrangler secret put SESSION_SECRET)');
  const raw = new TextEncoder().encode(env.SESSION_SECRET);
  return crypto.subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify']);
}

async function createSessionToken(env, userId) {
  const key = await getHmacKey(env);
  const payload = { userId, exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS };
  const payloadB64 = uint8ArrayToBase64Url(new TextEncoder().encode(JSON.stringify(payload)));
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(payloadB64));
  const sigB64 = uint8ArrayToBase64Url(new Uint8Array(sig));
  return `${payloadB64}.${sigB64}`;
}

async function verifySessionToken(env, token) {
  const [payloadB64, sigB64] = token.split('.');
  if (!payloadB64 || !sigB64) return null;
  const key = await getHmacKey(env);
  const sig = base64UrlToUint8Array(sigB64);
  const ok = await crypto.subtle.verify('HMAC', key, sig, new TextEncoder().encode(payloadB64));
  if (!ok) return null;
  const payload = JSON.parse(new TextDecoder().decode(base64UrlToUint8Array(payloadB64)));
  if (payload.exp && Date.now() / 1000 > payload.exp) return null;
  return payload.userId;
}

// Đọc userId từ header "Authorization: Bearer <session-token>". Trả về null nếu không có/không hợp lệ
// (route gọi hàm này tự quyết định có bắt buộc đăng nhập hay không).
async function getUserIdFromRequest(request, env) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;
  try { return await verifySessionToken(env, token); } catch (e) { return null; }
}

// Lưu/update user vào D1 (upsert theo id = Google "sub")
async function upsertUser(env, { id, email, name, picture }) {
  const db = env.MY_AI_DB;
  if (!db) throw new Error('D1 chưa được cấu hình');
  await db.prepare(
    `INSERT INTO users (id, email, name, picture) VALUES (?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET email = excluded.email, name = excluded.name, picture = excluded.picture`
  ).bind(id, email, name || null, picture || null).run();
}

export { verifyGoogleIdToken, createSessionToken, verifySessionToken, getUserIdFromRequest, upsertUser };
