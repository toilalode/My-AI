const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');
const router = express.Router();

const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => cb(null, `${Date.now()}_${file.originalname.replace(/[^\w.\-]/g, '_')}`),
});
const upload = multer({ storage, limits: { fileSize: 25 * 1024 * 1024 } }); // 25MB

// POST /api/upload  (multipart/form-data, field "file")
// Trả về base64 để gắn thẳng vào tin nhắn chat (inlineData) — phù hợp ảnh/pdf/audio nhỏ-vừa.
router.post('/', upload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'Không có file được gửi lên' });
  try {
    const base64 = fs.readFileSync(req.file.path).toString('base64');
    res.json({
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      size: req.file.size,
      base64,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
