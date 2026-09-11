// ===================== LOCAL DISK STORAGE HELPERS =====================
// Tương đương worker/src/storage.js nhưng lưu vào ổ đĩa cục bộ thay vì R2.
// Cấu trúc:  backend/uploads/<folder>/<timestamp>-<random>.<ext>
// Metadata từng file lưu trong 1 file JSON cạnh nó: <ten-file>.meta.json

const fs = require('fs');
const path = require('path');

const UPLOAD_ROOT = path.join(__dirname, '..', 'uploads');

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

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

// key nội bộ dùng "/" làm dấu phân cách (giống R2), quy đổi sang path hệ điều hành khi đụng ổ đĩa
function keyToPath(key) {
  return path.join(UPLOAD_ROOT, ...key.split('/'));
}

function saveBase64ToDisk({ base64, mimeType, folder = 'files', filename }) {
  const ext = extFromMime(mimeType);
  const key = `${folder}/${Date.now()}-${randomId()}.${ext}`;
  const filePath = keyToPath(key);
  ensureDir(path.dirname(filePath));

  fs.writeFileSync(filePath, Buffer.from(base64, 'base64'));
  const meta = {
    filename: filename || key.split('/').pop(),
    mimeType,
    createdAt: new Date().toISOString(),
    folder,
  };
  fs.writeFileSync(filePath + '.meta.json', JSON.stringify(meta));

  return { key, mimeType, url: `/api/files/${key}` };
}

function listFiles({ folder = '', cursor, limit = 50 } = {}) {
  const dir = folder ? path.join(UPLOAD_ROOT, folder) : UPLOAD_ROOT;
  if (!fs.existsSync(dir)) return { files: [], cursor: null };

  function walk(d, prefix) {
    let out = [];
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.endsWith('.meta.json') || entry.name === '.gitkeep') continue;
      const full = path.join(d, entry.name);
      const key = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) out = out.concat(walk(full, key));
      else out.push({ full, key });
    }
    return out;
  }

  const all = walk(dir, folder).map(({ full, key }) => {
    let meta = {};
    try { meta = JSON.parse(fs.readFileSync(full + '.meta.json', 'utf8')); } catch (e) {}
    const stat = fs.statSync(full);
    return {
      key,
      size: stat.size,
      uploaded: meta.createdAt || stat.mtime.toISOString(),
      mimeType: meta.mimeType || '',
      filename: meta.filename || key.split('/').pop(),
      folder: meta.folder || key.split('/')[0],
      url: `/api/files/${key}`,
    };
  });

  all.sort((a, b) => new Date(b.uploaded) - new Date(a.uploaded));

  // Phân trang đơn giản bằng offset số (cursor = index bắt đầu)
  const start = cursor ? parseInt(cursor, 10) || 0 : 0;
  const page = all.slice(start, start + limit);
  const nextCursor = start + limit < all.length ? String(start + limit) : null;

  return { files: page, cursor: nextCursor };
}

function getFilePath(key) {
  const filePath = keyToPath(key);
  if (!filePath.startsWith(UPLOAD_ROOT)) throw new Error('Key không hợp lệ'); // chặn path traversal
  return fs.existsSync(filePath) ? filePath : null;
}

function deleteFile(key) {
  const filePath = keyToPath(key);
  if (!filePath.startsWith(UPLOAD_ROOT)) throw new Error('Key không hợp lệ');
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  if (fs.existsSync(filePath + '.meta.json')) fs.unlinkSync(filePath + '.meta.json');
}

module.exports = { saveBase64ToDisk, listFiles, getFilePath, deleteFile };
