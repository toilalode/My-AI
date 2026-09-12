// ===================== QUEUE — VIDEO GENERATE CHẠY NỀN =====================
// Vấn đề: tạo video bằng Gemini có thể mất hơn 30s, trong khi 1 request HTTP
// bình thường tới Worker có giới hạn thời gian chờ. Giải pháp:
//   1) Client gọi /api/video/generate-async -> Worker tạo 1 "job" (lưu trạng thái
//      "pending" vào KV), đẩy job đó vào Queue, trả ngay về { jobId } cho client.
//   2) Cloudflare tự động chạy hàm consumer (export "queue" trong index.js) ở
//      NỀN, không liên quan gì tới request HTTP ban đầu -> gọi Gemini thoải mái,
//      không sợ timeout.
//   3) Consumer xong việc thì lưu kết quả (video base64 + đã lưu R2) vào KV với
//      cùng jobId, trạng thái đổi thành "done" (hoặc "error" nếu thất bại).
//   4) Client cứ vài giây gọi /api/video/status/<jobId> để hỏi xong chưa
//      (gọi là "polling") — thấy trạng thái "done" thì lấy video ra dùng.

import { MODELS } from './models.js';
import { saveBase64ToR2 } from './storage.js';
import { geminiFetch } from './gemini-proxy.js';

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';
const JOB_PREFIX = 'video-job:';
const JOB_TTL_SECONDS = 60 * 60 * 6; // giữ kết quả 6 tiếng rồi KV tự xoá

function jobKey(jobId) {
  return `${JOB_PREFIX}${jobId}`;
}

// Gọi từ route HTTP: tạo job mới, đẩy vào queue, trả jobId ngay
async function enqueueVideoJob(env, { prompt, durationSeconds = 5, sourceImage }) {
  if (!env.MY_AI_KV) throw new Error('KV chưa được cấu hình (cần để lưu trạng thái job)');
  if (!env.VIDEO_QUEUE) throw new Error('Queue chưa được cấu hình (thiếu binding VIDEO_QUEUE)');

  const jobId = crypto.randomUUID();
  await env.MY_AI_KV.put(
    jobKey(jobId),
    JSON.stringify({ status: 'pending', createdAt: new Date().toISOString() }),
    { expirationTtl: JOB_TTL_SECONDS }
  );

  await env.VIDEO_QUEUE.send({ jobId, prompt, durationSeconds, sourceImage });
  return { jobId, status: 'pending' };
}

// Gọi từ route HTTP: client hỏi job xong chưa
async function getVideoJobStatus(env, jobId) {
  if (!env.MY_AI_KV) throw new Error('KV chưa được cấu hình');
  const raw = await env.MY_AI_KV.get(jobKey(jobId));
  if (!raw) return { status: 'not_found' };
  return JSON.parse(raw);
}

// Gọi từ consumer (export "queue" trong index.js): thực sự xử lý 1 job video
async function processVideoJob(env, job) {
  const { jobId, prompt, durationSeconds, sourceImage } = job;
  const API_KEY = env.GEMINI_API_KEY;

  try {
    const parts = [{ text: prompt }];
    if (sourceImage) parts.push({ inlineData: { mimeType: sourceImage.mimeType, data: sourceImage.base64 } });

    const r = await geminiFetch(env, `${GEMINI_BASE}/${MODELS.videoGen}:generateContent?key=${API_KEY}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ contents: [{ role: 'user', parts }], generationConfig: { responseModalities: ['VIDEO'], videoConfig: { durationSeconds } } }),
    });
    const data = await r.json();
    if (!r.ok) throw new Error(JSON.stringify(data).slice(0, 800));

    const allParts = data.candidates?.[0]?.content?.parts || [];
    const videos = allParts.filter(p => p.inlineData).map(p => ({ mimeType: p.inlineData.mimeType, base64: p.inlineData.data }));

    for (const v of videos) {
      try {
        const saved = await saveBase64ToR2(env, { base64: v.base64, mimeType: v.mimeType, folder: 'videos' });
        v.savedUrl = saved.url;
        v.key = saved.key;
        delete v.base64; // đã lưu R2 rồi, không cần giữ base64 nặng trong KV nữa -> dùng savedUrl để tải lại
      } catch (e) { /* vẫn giữ base64 nếu lưu R2 lỗi, để client còn dùng được */ }
    }

    await env.MY_AI_KV.put(
      jobKey(jobId),
      JSON.stringify({ status: 'done', videos, model: MODELS.videoGen, finishedAt: new Date().toISOString() }),
      { expirationTtl: JOB_TTL_SECONDS }
    );
  } catch (err) {
    await env.MY_AI_KV.put(
      jobKey(jobId),
      JSON.stringify({ status: 'error', error: String(err.message || err), finishedAt: new Date().toISOString() }),
      { expirationTtl: JOB_TTL_SECONDS }
    );
    throw err; // ném lại để Cloudflare Queue tự retry theo cấu hình max_retries trong wrangler.toml
  }
}

export { enqueueVideoJob, getVideoJobStatus, processVideoJob };
