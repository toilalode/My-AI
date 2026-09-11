// ===================== ANALYTICS ENGINE — THEO DÕI USAGE =====================
// Ghi 1 "data point" mỗi khi có request tới 1 endpoint chính (chat/image/video/tts).
// Không chặn response nếu Analytics Engine chưa cấu hình hoặc ghi lỗi — chỉ để
// theo dõi (xem số request/model/lỗi theo thời gian trên dashboard Cloudflare),
// không phải logic bắt buộc của app.
//
// blobs: dữ liệu dạng text (index theo thứ tự, không tính toán được)
// doubles: dữ liệu dạng số (có thể SUM/AVG...)
// indexes: 1 giá trị dùng để nhóm/lọc nhanh (ở đây dùng "endpoint")

function logMetric(env, { endpoint, model, ok = true, errorMessage }) {
  const ds = env.MY_AI_ANALYTICS;
  if (!ds) return; // chưa cấu hình -> bỏ qua, không ảnh hưởng tính năng chính
  try {
    ds.writeDataPoint({
      blobs: [endpoint, model || '', ok ? 'ok' : 'error', (errorMessage || '').slice(0, 200)],
      doubles: [ok ? 1 : 0],
      indexes: [endpoint],
    });
  } catch (e) { /* không để lỗi ghi metric làm hỏng request chính */ }
}

export { logMetric };
