const express = require('express');
const router = express.Router();
const { MODELS } = require('../config/models');
const { saveBase64ToDisk } = require('../utils/storage');

const API_KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// POST /api/image/generate
// body: { prompt, pro?: boolean, referenceImage?: {mimeType, base64} }
router.post('/generate', async (req, res) => {
  try {
    if (!API_KEY) return res.status(400).json({ error: 'Thiếu GEMINI_API_KEY trong file .env' });
    const { prompt, pro = false, referenceImage } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Thiếu prompt' });

    const model = pro ? MODELS.imageGenPro : MODELS.imageGen;
    const parts = [{ text: prompt }];
    if (referenceImage) parts.push({ inlineData: { mimeType: referenceImage.mimeType, data: referenceImage.base64 } });

    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: { responseModalities: ['IMAGE', 'TEXT'] },
    };

    const r = await fetch(`${BASE}/${model}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });

    const allParts = data.candidates?.[0]?.content?.parts || [];
    const images = allParts.filter(p => p.inlineData).map(p => ({ mimeType: p.inlineData.mimeType, base64: p.inlineData.data }));
    const text = allParts.filter(p => p.text).map(p => p.text).join('\n');

    for (const img of images) {
      try {
        const saved = saveBase64ToDisk({ base64: img.base64, mimeType: img.mimeType, folder: 'images' });
        img.savedUrl = saved.url;
        img.key = saved.key;
      } catch (e) { /* bỏ qua nếu lưu đĩa lỗi */ }
    }

    res.json({ images, text, model });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
