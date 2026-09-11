const express = require('express');
const router = express.Router();
const { MODELS } = require('../config/models');
const { saveBase64ToDisk } = require('../utils/storage');

const API_KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// Tạo video ngắn dùng Gemini Omni Flash. Tính năng này còn khá mới (giữa 2026)
// và thường cần tài khoản Google AI có bật billing / được cấp quyền — free tier
// có thể trả lỗi 400/403. Nếu vậy, kiểm tra quyền trong Google AI Studio.
router.post('/generate', async (req, res) => {
  try {
    if (!API_KEY) return res.status(400).json({ error: 'Thiếu GEMINI_API_KEY trong file .env' });
    const { prompt, durationSeconds = 5, sourceImage } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Thiếu prompt' });

    const parts = [{ text: prompt }];
    if (sourceImage) parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });

    const body = {
      contents: [{ role: 'user', parts }],
      generationConfig: {
        responseModalities: ['VIDEO'],
        videoConfig: { durationSeconds },
      },
    };

    const r = await fetch(`${BASE}/${MODELS.videoGen}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();

    if (!r.ok) {
      return res.status(r.status).json({
        error: data,
        note: 'Tạo video thường cần tài khoản có billing / quyền tính năng video. Tài khoản free có thể chưa hỗ trợ — kiểm tra lại trong Google AI Studio.',
      });
    }

    const allParts = data.candidates?.[0]?.content?.parts || [];
    const videos = allParts.filter(p => p.inlineData).map(p => ({ mimeType: p.inlineData.mimeType, base64: p.inlineData.data }));

    for (const v of videos) {
      try {
        const saved = saveBase64ToDisk({ base64: v.base64, mimeType: v.mimeType, folder: 'videos' });
        v.savedUrl = saved.url;
        v.key = saved.key;
      } catch (e) { /* bỏ qua nếu lưu đĩa lỗi */ }
    }

    res.json({ videos, model: MODELS.videoGen });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
