const express = require('express');
const router = express.Router();
const { MODELS } = require('../config/models');

const API_KEY = process.env.GEMINI_API_KEY;
const BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

function stripHtml(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 15000);
}

async function askGemini(model, prompt, { webSearch = false } = {}) {
  const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }] };
  if (webSearch) body.tools = [{ google_search: {} }];
  const r = await fetch(`${BASE}/${model}:generateContent?key=${API_KEY}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(JSON.stringify(data).slice(0, 1000));
  const text = (data.candidates?.[0]?.content?.parts || []).filter(p => p.text).map(p => p.text).join('\n');
  return { text, grounding: data.candidates?.[0]?.groundingMetadata };
}

// POST /api/search/browse  body: { url, question? }
// Mở 1 trang web, đọc nội dung, cho AI trả lời câu hỏi về trang đó.
router.post('/browse', async (req, res) => {
  try {
    if (!API_KEY) return res.status(400).json({ error: 'Thiếu GEMINI_API_KEY' });
    const { url, question } = req.body;
    if (!url) return res.status(400).json({ error: 'Thiếu url' });

    const pageRes = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (My-AI Bot)' } });
    if (!pageRes.ok) return res.status(400).json({ error: `Không tải được trang (status ${pageRes.status})` });
    const html = await pageRes.text();
    const text = stripHtml(html);

    const prompt = `Đây là nội dung văn bản trích từ trang web ${url}:\n\n"""${text}"""\n\n---\nYêu cầu của người dùng: ${question || 'Tóm tắt nội dung chính của trang này bằng tiếng Việt.'}`;
    const result = await askGemini(MODELS.chatSmart, prompt);
    res.json({ answer: result.text, sourceUrl: url });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/search/deep-research  body: { query }  -> SSE (progress/plan/finding/report/done)
router.post('/deep-research', async (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
  res.setHeader('Cache-Control', 'no-cache');
  res.flushHeaders?.();
  const send = (event, data) => res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);

  try {
    if (!API_KEY) { send('error', 'Thiếu GEMINI_API_KEY'); return res.end(); }
    const { query } = req.body;
    if (!query) { send('error', 'Thiếu query'); return res.end(); }

    send('progress', 'Đang lên kế hoạch nghiên cứu...');
    const planPrompt = `Chia câu hỏi sau thành 3-4 câu hỏi phụ cần tra cứu để trả lời đầy đủ và chính xác. Chỉ liệt kê mỗi dòng một câu hỏi, không đánh số, không giải thích thêm:\n"${query}"`;
    const plan = await askGemini(MODELS.chatFast, planPrompt);
    const subQuestions = plan.text.split('\n').map(s => s.replace(/^[-*\d.]+\s*/, '').trim()).filter(Boolean).slice(0, 4);
    send('plan', subQuestions);

    const findings = [];
    for (const q of subQuestions) {
      send('progress', `Đang tra cứu: ${q}`);
      const r = await askGemini(MODELS.chatSmart, q, { webSearch: true });
      findings.push({ question: q, answer: r.text });
      send('finding', { question: q, answer: r.text });
    }

    send('progress', 'Đang tổng hợp báo cáo cuối cùng...');
    const synthPrompt = `Câu hỏi gốc: "${query}"\n\nCác phát hiện từ tra cứu:\n${findings.map((f, i) => `${i + 1}. ${f.question}\n${f.answer}`).join('\n\n')}\n\nHãy tổng hợp thành một báo cáo mạch lạc, có cấu trúc rõ ràng (dùng heading, gạch đầu dòng), trả lời trực tiếp câu hỏi gốc, bằng tiếng Việt.`;
    const final = await askGemini(MODELS.chatSmart, synthPrompt);
    send('report', final.text);
    send('done', {});
    res.end();
  } catch (err) {
    send('error', err.message);
    res.end();
  }
});

module.exports = router;
