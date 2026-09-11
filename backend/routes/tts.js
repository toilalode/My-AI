const express = require('express');
const router = express.Router();
const { MODELS } = require('../config/models');
const { saveBase64ToDisk } = require('../utils/storage');

const API_KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

// POST /api/tts/speak  body: { text, voice? }
// Giọng có sẵn phổ biến: Kore, Puck, Charon, Fenrir, Aoede...
router.post('/speak', async (req, res) => {
  try {
    if (!API_KEY) return res.status(400).json({ error: 'Thiếu GEMINI_API_KEY trong file .env' });
    const { text, voice = 'Kore' } = req.body;
    if (!text) return res.status(400).json({ error: 'Thiếu text' });

    const body = {
      contents: [{ role: 'user', parts: [{ text }] }],
      generationConfig: {
        responseModalities: ['AUDIO'],
        speechConfig: { voiceConfig: { prebuiltVoiceConfig: { voiceName: voice } } },
      },
    };

    const r = await fetch(`${BASE}/${MODELS.tts}:generateContent?key=${API_KEY}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data });

    const audioPart = (data.candidates?.[0]?.content?.parts || []).find(p => p.inlineData);
    if (!audioPart) return res.status(500).json({ error: 'Model không trả về audio', raw: data });

    const result = { mimeType: audioPart.inlineData.mimeType, base64: audioPart.inlineData.data };
    try {
      const saved = saveBase64ToDisk({ base64: result.base64, mimeType: result.mimeType, folder: 'audio' });
      result.savedUrl = saved.url;
      result.key = saved.key;
    } catch (e) { /* bỏ qua nếu lưu đĩa lỗi */ }

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
