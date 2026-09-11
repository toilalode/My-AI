const express = require('express');
const router = express.Router();
const { saveBase64ToDisk, listFiles, getFilePath, deleteFile } = require('../utils/storage');

// GET /api/files?folder=images&cursor=0
router.get('/', (req, res) => {
  try {
    const { folder = '', cursor } = req.query;
    const result = listFiles({ folder, cursor });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/files/upload  body: { base64, mimeType, filename, folder }
router.post('/upload', (req, res) => {
  try {
    const { base64, mimeType, filename, folder = 'uploads' } = req.body;
    if (!base64 || !mimeType) return res.status(400).json({ error: 'Thiếu base64 hoặc mimeType' });
    const saved = saveBase64ToDisk({ base64, mimeType, filename, folder });
    res.json(saved);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/files/<key...>  (khớp cả path có "/", vd images/12345-abcd.png)
router.get('/*', (req, res) => {
  try {
    const key = decodeURIComponent(req.params[0]);
    const filePath = getFilePath(key);
    if (!filePath) return res.status(404).json({ error: 'Không tìm thấy file' });
    res.sendFile(filePath);
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

// DELETE /api/files/<key...>
router.delete('/*', (req, res) => {
  try {
    const key = decodeURIComponent(req.params[0]);
    deleteFile(key);
    res.json({ ok: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

module.exports = router;
