// ===================== R2 STORAGE HELPERS =====================
// Tất cả file (ảnh/video AI tạo ra, file người dùng upload) được lưu
// trong 1 bucket R2 duy nhất (env.MY_AI_BUCKET), mỗi file có 1 "key"
// dạng:  <folder>/<timestamp>-<random>.<ext>
// Metadata (loại file, tên gốc, thời gian tạo...) lưu kèm qua customMetadata của R2.

function randomId(len = 8) {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  for (let i = 0; i < len; i++) s += chars[Math.floor(Math.random() * chars.length)];
  return s;
}

function extFromMime(mime = '') {
  const map = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'audio/wav': 'wav', 'audio/mpeg': 'mp3', 'audio/mp3': 'mp3',
    'application/pdf': 'pdf',
  };
  return map[mime] || (mime.split('/')[1] || 'bin').replace(/[^a-z0-9]/gi, '');
}

// Lưu 1 file base64 vào R2. folder ví dụ: "images", "videos", "uploads", "audio"
async function saveBase64ToR2(env, { base64, mimeType, folder = 'files', filename }) {
  const bucket = env.MY_AI_BUCKET;
  if (!bucket) throw new Error('R2 chưa được cấu hình (thiếu binding MY_AI_BUCKET trong wrangler.toml)');

  const bytes = Uint8Array.from(atob(base64), c => c.charCodeAt(0));
  const ext = extFromMime(mimeType);
  const key = `${folder}/${Date.now()}-${randomId()}.${ext}`;

  await bucket.put(key, bytes, {
    httpMetadata: { contentType: mimeType },
    customMetadata: {
      filename: filename || key.split('/').pop(),
      createdAt: new Date().toISOString(),
      folder,
    },
  });

  return { key, mimeType, url: `/api/files/${key}` };
}

// Liệt kê file trong bucket (có thể lọc theo folder qua prefix)
async function listR2Files(env, { prefix = '', cursor, limit = 50 } = {}) {
  const bucket = env.MY_AI_BUCKET;
  if (!bucket) throw new Error('R2 chưa được cấu hình');

  const listing = await bucket.list({ prefix, cursor, limit, include: ['customMetadata', 'httpMetadata'] });
  const files = listing.objects.map(obj => ({
    key: obj.key,
    size: obj.size,
    uploaded: obj.uploaded,
    mimeType: obj.httpMetadata?.contentType || '',
    filename: obj.customMetadata?.filename || obj.key.split('/').pop(),
    folder: obj.customMetadata?.folder || obj.key.split('/')[0],
    url: `/api/files/${obj.key}`,
  }));
  // Mới nhất lên trước
  files.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

  return { files, cursor: listing.truncated ? listing.cursor : null };
}

// Lấy 1 file từ R2 (trả về Response stream trực tiếp, không cần base64)
async function getR2File(env, key) {
  const bucket = env.MY_AI_BUCKET;
  if (!bucket) throw new Error('R2 chưa được cấu hình');
  return bucket.get(key);
}

// Xoá 1 file khỏi R2
async function deleteR2File(env, key) {
  const bucket = env.MY_AI_BUCKET;
  if (!bucket) throw new Error('R2 chưa được cấu hình');
  await bucket.delete(key);
}

export { saveBase64ToR2, listR2Files, getR2File, deleteR2File };
