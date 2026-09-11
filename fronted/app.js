// ===================== CẤU HÌNH BACKEND =====================
// Nếu chạy frontend + backend cùng 1 nơi (vd. npm start ở bản Node),
// để trống là được (dùng đường dẫn tương đối).
// Nếu deploy frontend lên GitHub Pages và backend là Cloudflare Worker,
// XOÁ dòng "const API_BASE = '';" bên dưới và dùng dòng đã điền URL thật:
const API_BASE = '';
// const API_BASE = 'https://my-ai-worker.YOUR-SUBDOMAIN.workers.dev';

// ===================== STATE =====================
const state = {
  mode: 'chat',
  history: JSON.parse(localStorage.getItem('myai_history') || '[]'),
  pendingAttachments: [],
  temp: false,
  conversationId: localStorage.getItem('myai_last_conv') || null,
};

const els = {
  sidebar: document.getElementById('sidebar'),
  hamburger: document.getElementById('hamburger'),
  modeTitle: document.getElementById('modeTitle'),
  modelSelect: document.getElementById('modelSelect'),
  thinkingToggle: document.getElementById('thinkingToggle'),
  webSearchToggle: document.getElementById('webSearchToggle'),
  tempChatToggle: document.getElementById('tempChatToggle'),
  tempBanner: document.getElementById('tempBanner'),
  newChatBtn: document.getElementById('newChatBtn'),
  chatMessages: document.getElementById('chatMessages'),
  chatInput: document.getElementById('chatInput'),
  sendBtn: document.getElementById('sendBtn'),
  attachPreview: document.getElementById('attachPreview'),
  convList: document.getElementById('convList'),
  convSearchInput: document.getElementById('convSearchInput'),
  semSearchInput: document.getElementById('semSearchInput'),
  semSearchBtn: document.getElementById('semSearchBtn'),
  semSearchCloseBtn: document.getElementById('semSearchCloseBtn'),
  semSearchResults: document.getElementById('semSearchResults'),
};

const modeTitles = {
  chat: 'Chat', homework: 'Giải bài tập', image: 'Tạo ảnh', video: 'Tạo video',
  canvas: 'Canvas', code: 'Code Editor', voice: 'Voice', agent: 'Agent Mode',
  research: 'Deep Research', library: '🗂️ Thư viện', settings: 'Cài đặt',
};

// ===================== NAV / MODE SWITCH =====================
document.querySelectorAll('.nav-btn[data-mode]').forEach(btn => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});
function switchMode(mode) {
  state.mode = mode;
  document.querySelectorAll('.nav-btn[data-mode]').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  document.querySelectorAll('.panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-' + mode)?.classList.add('active');
  els.modeTitle.textContent = modeTitles[mode] || mode;
  els.sidebar.classList.remove('open');
}
els.hamburger.addEventListener('click', () => els.sidebar.classList.toggle('open'));

// ===================== SSE HELPER =====================
async function streamPost(url, payload, handlers) {
  const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.body) { handlers.error?.('Không kết nối được server'); return; }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const events = buffer.split('\n\n');
    buffer = events.pop();
    for (const evt of events) {
      let eventName = 'message', data = '';
      for (const line of evt.split('\n')) {
        if (line.startsWith('event:')) eventName = line.slice(6).trim();
        else if (line.startsWith('data:')) data += line.slice(5).trim();
      }
      if (!data) continue;
      let parsed; try { parsed = JSON.parse(data); } catch { parsed = data; }
      handlers[eventName]?.(parsed);
    }
  }
}

// ===================== CHAT =====================
function saveHistory() {
  if (!state.temp) localStorage.setItem('myai_history', JSON.stringify(state.history));
}
function renderHistory() {
  els.chatMessages.innerHTML = '';
  state.history.forEach(m => appendMsgToDOM(m.role, m.text, m.grounding));
}
function appendMsgToDOM(role, text, grounding) {
  const div = document.createElement('div');
  div.className = 'msg ' + role;
  div.textContent = text;
  if (grounding?.groundingChunks?.length) {
    const g = document.createElement('div');
    g.className = 'grounding';
    g.innerHTML = '🔗 Nguồn: ' + grounding.groundingChunks.slice(0, 5)
      .map(c => c.web ? `<a href="${c.web.uri}" target="_blank">${c.web.title || c.web.uri}</a>` : '')
      .filter(Boolean).join(' · ');
    div.appendChild(g);
  }
  els.chatMessages.appendChild(div);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return div;
}
renderHistory();

els.newChatBtn.addEventListener('click', () => {
  state.history = [];
  state.conversationId = null;
  localStorage.removeItem('myai_last_conv');
  saveHistory();
  renderHistory();
  loadConversations();
});
els.tempChatToggle.addEventListener('change', e => {
  state.temp = e.target.checked;
  els.tempBanner.classList.toggle('hidden', !state.temp);
});
els.chatInput.addEventListener('input', () => {
  els.chatInput.style.height = 'auto';
  els.chatInput.style.height = Math.min(140, els.chatInput.scrollHeight) + 'px';
});
els.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
els.sendBtn.addEventListener('click', sendChat);

async function sendChat(overrideSystemInstruction) {
  const text = els.chatInput.value.trim();
  if (!text && state.pendingAttachments.length === 0) return;
  els.chatInput.value = ''; els.chatInput.style.height = 'auto';

  appendMsgToDOM('user', text || '[đính kèm]');
  state.history.push({ role: 'user', text });

  // Lưu vào D1 (trừ khi đang ở chế độ tạm thời) — tự tạo hội thoại mới nếu chưa có
  if (!state.temp) {
    await ensureConversation(text);
    if (state.conversationId) saveMessageToServer('user', text);
  }

  const attachments = state.pendingAttachments.map(a => ({ mimeType: a.mimeType, base64: a.base64 }));
  clearAttachments();

  const assistantDiv = appendMsgToDOM('assistant', '');
  let fullText = '';
  let lastGrounding = null;

  const isHomework = state.mode === 'homework';
  const systemInstruction = overrideSystemInstruction || (isHomework
    ? 'Bạn là gia sư. Khi được hỏi bài tập, đừng chỉ đưa đáp án — hãy giải thích từng bước, chỉ ra cách tư duy, rồi mới chốt đáp án cuối cùng. Trả lời bằng tiếng Việt, rõ ràng, dễ hiểu.'
    : 'Bạn là My-AI, một trợ lý AI hữu ích, trả lời bằng tiếng Việt trừ khi người dùng dùng ngôn ngữ khác.');

  await streamPost(API_BASE + '/api/chat/stream', {
    messages: [...state.history.map(m => ({ role: m.role, parts: [{ text: m.text }] }))],
    model: els.modelSelect.value,
    thinking: els.thinkingToggle.checked,
    webSearch: els.webSearchToggle.checked,
    systemInstruction,
    attachments,
  }, {
    chunk: (t) => { fullText += t; assistantDiv.textContent = fullText; els.chatMessages.scrollTop = els.chatMessages.scrollHeight; },
    thought: () => {},
    grounding: (g) => { lastGrounding = g; },
    error: (e) => { assistantDiv.textContent = '⚠️ Lỗi: ' + (typeof e === 'string' ? e : JSON.stringify(e)); },
    done: () => {
      state.history.push({ role: 'assistant', text: fullText, grounding: lastGrounding });
      saveHistory();
      if (lastGrounding) renderHistory();
      if (!state.temp && state.conversationId) saveMessageToServer('assistant', fullText, els.modelSelect.value);
    },
  });
}

// ===================== LỊCH SỬ CHAT (D1) =====================
// Hội thoại hiện tại được lưu ở state.conversationId. Khi gửi tin nhắn đầu tiên
// (không ở chế độ tạm thời) mà chưa có hội thoại, tự tạo 1 hội thoại mới trong D1.
async function ensureConversation(firstText) {
  if (state.conversationId) return;
  try {
    const title = (firstText || 'Cuộc trò chuyện mới').slice(0, 60);
    const r = await fetch(API_BASE + '/api/conversations', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }),
    });
    const data = await r.json();
    if (data.id) {
      state.conversationId = data.id;
      localStorage.setItem('myai_last_conv', data.id);
      loadConversations();
    }
  } catch (e) { /* D1 chưa cấu hình hoặc lỗi mạng -> chat vẫn hoạt động, chỉ không lưu server */ }
}
async function saveMessageToServer(role, content, model) {
  try {
    await fetch(API_BASE + `/api/conversations/${state.conversationId}/messages`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role, content, model }),
    });
  } catch (e) { /* bỏ qua nếu lỗi mạng/D1 */ }
}

function convItemEl(conv) {
  const div = document.createElement('div');
  div.className = 'conv-item' + (conv.id === state.conversationId ? ' active' : '');
  div.innerHTML = `<span class="conv-title">${conv.title || 'Cuộc trò chuyện'}</span>
    <span class="conv-actions">
      <button class="conv-rename" title="Đổi tên">✏️</button>
      <button class="conv-delete" title="Xoá">🗑️</button>
    </span>`;
  div.addEventListener('click', (e) => { if (!e.target.closest('.conv-actions')) selectConversation(conv.id); });
  div.querySelector('.conv-rename').addEventListener('click', async (e) => {
    e.stopPropagation();
    const title = prompt('Tên mới cho hội thoại:', conv.title || '');
    if (!title) return;
    await fetch(API_BASE + `/api/conversations/${conv.id}/rename`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title }) });
    loadConversations();
  });
  div.querySelector('.conv-delete').addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm('Xoá hội thoại này (và toàn bộ tin nhắn)?')) return;
    await fetch(API_BASE + `/api/conversations/${conv.id}`, { method: 'DELETE' });
    if (state.conversationId === conv.id) { state.conversationId = null; localStorage.removeItem('myai_last_conv'); state.history = []; saveHistory(); renderHistory(); }
    loadConversations();
  });
  return div;
}
async function loadConversations() {
  try {
    const r = await fetch(API_BASE + '/api/conversations');
    const list = await r.json();
    if (!Array.isArray(list)) { els.convList.innerHTML = ''; return; }
    allConvs = list;
    renderConvList(allConvs);
  } catch (e) { /* D1 chưa cấu hình -> bỏ qua, sidebar lịch sử để trống */ }
}
let allConvs = [];
function renderConvList(list) {
  els.convList.innerHTML = '';
  if (!list.length) { els.convList.innerHTML = '<p class="hint" style="padding:6px 10px">Không tìm thấy hội thoại nào.</p>'; return; }
  list.forEach(c => els.convList.appendChild(convItemEl(c)));
}
els.convSearchInput.addEventListener('input', () => {
  const q = els.convSearchInput.value.trim().toLowerCase();
  const filtered = q ? allConvs.filter(c => (c.title || '').toLowerCase().includes(q)) : allConvs;
  renderConvList(filtered);
});
async function selectConversation(id) {
  try {
    const r = await fetch(API_BASE + `/api/conversations/${id}/messages`);
    const msgs = await r.json();
    if (!Array.isArray(msgs)) return;
    state.conversationId = id;
    localStorage.setItem('myai_last_conv', id);
    state.history = msgs.map(m => ({ role: m.role, text: m.content }));
    saveHistory();
    renderHistory();
    switchMode('chat');
    renderConvList(els.convSearchInput.value.trim() ? allConvs.filter(c => (c.title || '').toLowerCase().includes(els.convSearchInput.value.trim().toLowerCase())) : allConvs);
  } catch (e) { alert('Không tải được hội thoại này.'); }
}
loadConversations();

// ===================== TÌM KIẾM NGỮ NGHĨA (Vectorize) =====================
function semResultEl(r) {
  const div = document.createElement('div');
  div.className = 'sem-result';
  div.innerHTML = `<div class="sem-meta">${r.role === 'user' ? '🧑 Bạn' : '🤖 AI'} · điểm khớp ${(r.score ?? 0).toFixed(2)}</div>
    <div class="sem-text">${(r.content || r.text || '').slice(0, 300)}</div>`;
  div.addEventListener('click', () => {
    if (r.conversationId) selectConversation(r.conversationId);
    els.semSearchResults.classList.add('hidden');
    els.semSearchCloseBtn.classList.add('hidden');
  });
  return div;
}
async function runSemSearch() {
  const q = els.semSearchInput.value.trim();
  if (!q) return;
  els.semSearchResults.classList.remove('hidden');
  els.semSearchCloseBtn.classList.remove('hidden');
  els.semSearchResults.innerHTML = '<p class="hint">Đang tìm...</p>';
  try {
    const r = await fetch(API_BASE + '/api/search/semantic?q=' + encodeURIComponent(q));
    const data = await r.json();
    const results = Array.isArray(data) ? data : (data.results || data.matches || []);
    els.semSearchResults.innerHTML = '';
    if (!results.length) { els.semSearchResults.innerHTML = '<p class="hint">Không tìm thấy kết quả nào (cần Vectorize đã được cấu hình và có tin nhắn đã lưu).</p>'; return; }
    results.forEach(r2 => els.semSearchResults.appendChild(semResultEl(r2)));
  } catch (e) {
    els.semSearchResults.innerHTML = '<p class="hint">⚠️ Lỗi tìm kiếm: ' + e.message + '</p>';
  }
}
els.semSearchBtn.addEventListener('click', runSemSearch);
els.semSearchInput.addEventListener('keydown', e => { if (e.key === 'Enter') runSemSearch(); });
els.semSearchCloseBtn.addEventListener('click', () => {
  els.semSearchResults.classList.add('hidden');
  els.semSearchCloseBtn.classList.add('hidden');
  els.semSearchInput.value = '';
});

// ===================== ATTACHMENTS =====================
function clearAttachments() { state.pendingAttachments = []; renderAttachPreview(); }
function renderAttachPreview() {
  els.attachPreview.innerHTML = '';
  state.pendingAttachments.forEach((a, i) => {
    const chip = document.createElement('div');
    chip.className = 'attach-chip';
    chip.innerHTML = `<span>${a.mimeType.startsWith('image') ? '🖼️' : a.mimeType.startsWith('video') ? '🎥' : '📎'} ${a.filename}</span>`;
    const btn = document.createElement('button');
    btn.textContent = '✕';
    btn.onclick = () => { state.pendingAttachments.splice(i, 1); renderAttachPreview(); };
    chip.appendChild(btn);
    els.attachPreview.appendChild(chip);
  });
}
// Đọc file thẳng thành base64 trên trình duyệt (không cần server lưu file —
// phù hợp cả khi backend là Cloudflare Worker, vốn không có ổ đĩa).
// Lưu ý: file quá lớn (>~15-20MB) có thể vượt giới hạn request của Gemini API/Worker.
function uploadFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1];
      const data = { filename: file.name, mimeType: file.type || 'application/octet-stream', base64, size: file.size };
      state.pendingAttachments.push(data);
      renderAttachPreview();
      resolve(data);
    };
    reader.onerror = () => { alert('Không đọc được file: ' + file.name); reject(reader.error); };
    reader.readAsDataURL(file);
  });
}
function wireFileInput(btnId, inputId, multiple) {
  const btn = document.getElementById(btnId), input = document.getElementById(inputId);
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    for (const f of input.files) await uploadFile(f);
    input.value = '';
  });
}
wireFileInput('btnFile', 'fileInput');
wireFileInput('btnMedia', 'mediaInput');
wireFileInput('btnFolder', 'folderInput', true);
wireFileInput('btnCamera', 'cameraInput');
wireFileInput('btnRecordVideo', 'videoCaptureInput');

// mic quick-attach (record short clip, attach as audio to chat)
document.getElementById('btnMic').addEventListener('click', async () => {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.start();
    document.getElementById('btnMic').textContent = '⏺️';
    setTimeout(() => recorder.stop(), 5000); // ghi 5s, bấm lại chưa hỗ trợ dừng sớm ở bản này
    recorder.onstop = async () => {
      document.getElementById('btnMic').textContent = '🎤';
      stream.getTracks().forEach(t => t.stop());
      const blob = new Blob(chunks, { type: 'audio/webm' });
      const file = new File([blob], `voice_${Date.now()}.webm`, { type: 'audio/webm' });
      await uploadFile(file);
    };
  } catch (e) { alert('Không truy cập được micro: ' + e.message); }
});

// ===================== HOMEWORK MODE (reuses chat panel) =====================
document.querySelector('.nav-btn[data-mode="homework"]').addEventListener('click', () => {
  // đã switchMode ở listener chung phía trên; panel-chat dùng chung UI, chỉ đổi system prompt lúc gửi
  document.getElementById('panel-chat').classList.add('active');
  document.getElementById('panel-homework')?.classList.remove('active');
});

// ===================== IMAGE GEN =====================
document.getElementById('imgGenBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('imgPrompt').value.trim();
  if (!prompt) return;
  const pro = document.getElementById('imgProToggle').checked;
  const box = document.getElementById('imgResults');
  box.innerHTML = '<p class="hint">Đang tạo ảnh...</p>';
  try {
    const r = await fetch(API_BASE + '/api/image/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, pro }) });
    const data = await r.json();
    box.innerHTML = '';
    if (data.error) { box.innerHTML = `<p class="hint">⚠️ ${JSON.stringify(data.error)}</p>`; return; }
    if (!data.images?.length) { box.innerHTML = '<p class="hint">Không nhận được ảnh nào.</p>'; return; }
    data.images.forEach(img => {
      const el = document.createElement('img');
      el.src = `data:${img.mimeType};base64,${img.base64}`;
      box.appendChild(el);
    });
    if (data.images.some(img => img.savedUrl)) {
      box.insertAdjacentHTML('beforeend', '<p class="hint">✅ Đã lưu vào 🗂️ Thư viện.</p>');
    }
  } catch (e) { box.innerHTML = '<p class="hint">Lỗi: ' + e.message + '</p>'; }
});

// ===================== VIDEO GEN (chạy nền qua Queue, có polling) =====================
const vidJobsEl = document.getElementById('vidJobs');
const VID_POLL_MS = 4000;

function renderVideoResult(box, v) {
  const src = v.savedUrl ? (API_BASE + v.savedUrl) : `data:${v.mimeType};base64,${v.base64}`;
  const el = document.createElement('video');
  el.src = src;
  el.controls = true;
  box.appendChild(el);
}

function pollVideoJob(jobId, cardEl) {
  const statusEl = cardEl.querySelector('.vid-job-status');
  const timer = setInterval(async () => {
    try {
      const r = await fetch(API_BASE + '/api/video/status/' + jobId);
      const data = await r.json();
      if (data.status === 'pending') {
        statusEl.textContent = '⏳ Đang xử lý ở nền... (job vẫn còn trong hàng đợi)';
      } else if (data.status === 'done') {
        clearInterval(timer);
        cardEl.classList.add('status-done');
        statusEl.textContent = '✅ Xong!';
        const box = document.getElementById('vidResults');
        (data.videos || []).forEach(v => renderVideoResult(box, v));
        if ((data.videos || []).some(v => v.savedUrl)) {
          statusEl.insertAdjacentHTML('afterend', '<p class="hint">✅ Đã lưu vào 🗂️ Thư viện.</p>');
        }
      } else if (data.status === 'error') {
        clearInterval(timer);
        cardEl.classList.add('status-error');
        statusEl.textContent = '⚠️ Lỗi: ' + (data.error || 'không rõ nguyên nhân') + ' (video thường cần tài khoản Google AI có billing/quyền tính năng video)';
      } else if (data.status === 'not_found') {
        clearInterval(timer);
        statusEl.textContent = '⚠️ Không tìm thấy job (có thể KV chưa cấu hình hoặc job đã hết hạn).';
      }
    } catch (e) {
      statusEl.textContent = '⚠️ Lỗi khi kiểm tra tiến trình: ' + e.message;
    }
  }, VID_POLL_MS);
}

document.getElementById('vidGenBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('vidPrompt').value.trim();
  if (!prompt) return;
  const durationSeconds = Number(document.getElementById('vidDuration').value) || 5;

  const card = document.createElement('div');
  card.className = 'vid-job';
  card.innerHTML = `<div><b>${prompt.slice(0, 80)}</b></div><div class="vid-job-status hint">Đang gửi job vào hàng đợi...</div>`;
  vidJobsEl.prepend(card);

  try {
    const r = await fetch(API_BASE + '/api/video/generate-async', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, durationSeconds }) });
    const data = await r.json();
    if (data.error || !data.jobId) {
      card.classList.add('status-error');
      card.querySelector('.vid-job-status').textContent = '⚠️ ' + (data.error || 'Không tạo được job (kiểm tra Queue/KV đã cấu hình chưa)');
      return;
    }
    card.querySelector('.vid-job-status').textContent = '⏳ Đã vào hàng đợi, đang chờ xử lý...';
    pollVideoJob(data.jobId, card);
  } catch (e) {
    card.classList.add('status-error');
    card.querySelector('.vid-job-status').textContent = '⚠️ Lỗi: ' + e.message;
  }
});

// ===================== THƯ VIỆN (R2) =====================
const libEls = {
  folderFilter: document.getElementById('libFolderFilter'),
  refreshBtn: document.getElementById('libRefreshBtn'),
  results: document.getElementById('libResults'),
  loadMoreBtn: document.getElementById('libLoadMoreBtn'),
};
let libCursor = null;

function libFileCard(f) {
  const wrap = document.createElement('div');
  wrap.className = 'lib-card';
  let preview = '';
  if (f.mimeType.startsWith('image/')) preview = `<img src="${API_BASE}${f.url}" loading="lazy" />`;
  else if (f.mimeType.startsWith('video/')) preview = `<video src="${API_BASE}${f.url}" controls></video>`;
  else if (f.mimeType.startsWith('audio/')) preview = `<audio src="${API_BASE}${f.url}" controls></audio>`;
  else preview = `<div class="lib-file-icon">📄</div>`;

  wrap.innerHTML = `
    ${preview}
    <div class="lib-meta">
      <span class="lib-name" title="${f.filename}">${f.filename}</span>
      <div class="lib-actions">
        <a href="${API_BASE}${f.url}" target="_blank" download="${f.filename}">⬇️ Tải</a>
        <button class="lib-del" data-key="${f.key}">🗑️ Xoá</button>
      </div>
    </div>`;
  wrap.querySelector('.lib-del').addEventListener('click', async (e) => {
    const key = e.target.dataset.key;
    if (!confirm('Xoá file này khỏi thư viện?')) return;
    await fetch(API_BASE + '/api/files/' + encodeURIComponent(key), { method: 'DELETE' });
    wrap.remove();
  });
  return wrap;
}

async function loadLibrary(reset = true) {
  if (reset) { libEls.results.innerHTML = '<p class="hint">Đang tải...</p>'; libCursor = null; }
  const folder = libEls.folderFilter.value;
  const params = new URLSearchParams();
  if (folder) params.set('folder', folder);
  if (!reset && libCursor) params.set('cursor', libCursor);
  try {
    const r = await fetch(API_BASE + '/api/files?' + params.toString());
    const data = await r.json();
    if (data.error) { libEls.results.innerHTML = `<p class="hint">⚠️ ${data.error}</p>`; return; }
    if (reset) libEls.results.innerHTML = '';
    if (!data.files.length && reset) { libEls.results.innerHTML = '<p class="hint">Chưa có file nào được lưu.</p>'; }
    data.files.forEach(f => libEls.results.appendChild(libFileCard(f)));
    libCursor = data.cursor;
    libEls.loadMoreBtn.style.display = libCursor ? 'block' : 'none';
  } catch (e) {
    libEls.results.innerHTML = '<p class="hint">Lỗi tải thư viện: ' + e.message + '</p>';
  }
}
libEls.refreshBtn.addEventListener('click', () => loadLibrary(true));
libEls.folderFilter.addEventListener('change', () => loadLibrary(true));
libEls.loadMoreBtn.addEventListener('click', () => loadLibrary(false));

const origSwitchMode = switchMode;
switchMode = function (mode) {
  origSwitchMode(mode);
  if (mode === 'library' && !libEls.results.dataset.loaded) {
    libEls.results.dataset.loaded = '1';
    loadLibrary(true);
  }
};
document.querySelectorAll('.nav-btn[data-mode="library"]').forEach(btn => {
  btn.addEventListener('click', () => switchMode('library'));
});

// ===================== CANVAS =====================
function runCanvas() {
  const code = document.getElementById('canvasCode').value;
  const frame = document.getElementById('canvasFrame');
  frame.srcdoc = code || '<p style="font-family:sans-serif;padding:20px;color:#888">Canvas trống — hãy nhập code hoặc nhờ AI tạo.</p>';
}
document.getElementById('canvasRunBtn').addEventListener('click', runCanvas);
document.getElementById('canvasGenBtn').addEventListener('click', async () => {
  const prompt = document.getElementById('canvasPrompt').value.trim();
  if (!prompt) return;
  const codeArea = document.getElementById('canvasCode');
  codeArea.value = 'Đang tạo...';
  let full = '';
  await streamPost(API_BASE + '/api/chat/stream', {
    messages: [{ role: 'user', parts: [{ text: prompt }] }],
    model: 'auto',
    thinking: false,
    webSearch: false,
    systemInstruction: 'Trả lời DUY NHẤT một khối code HTML độc lập (đầy đủ CSS+JS trong 1 file, không cần thư viện ngoài trừ khi thật cần), bên trong ```html ... ```. Không giải thích thêm gì khác.',
  }, {
    chunk: t => { full += t; },
    done: () => {
      const match = full.match(/```html([\s\S]*?)```/i) || full.match(/```([\s\S]*?)```/);
      codeArea.value = (match ? match[1] : full).trim();
      runCanvas();
    },
    error: e => { codeArea.value = '⚠️ Lỗi: ' + e; },
  });
});

// ===================== CODE EDITOR =====================
document.getElementById('codeAskBtn').addEventListener('click', async () => {
  const instruction = document.getElementById('codeInstruction').value.trim();
  const current = document.getElementById('codeEditor').value;
  if (!instruction) return;
  const editor = document.getElementById('codeEditor');
  const prompt = current
    ? `Code hiện tại:\n\`\`\`\n${current}\n\`\`\`\n\nYêu cầu: ${instruction}\n\nTrả lời DUY NHẤT bằng code đã sửa, đặt trong một khối \`\`\`, không giải thích thêm.`
    : `Viết code cho yêu cầu sau: ${instruction}\n\nTrả lời DUY NHẤT bằng code, đặt trong một khối \`\`\`, không giải thích thêm.`;
  let full = '';
  editor.value = 'Đang xử lý...';
  await streamPost(API_BASE + '/api/chat/stream', {
    messages: [{ role: 'user', parts: [{ text: prompt }] }],
    model: 'gemini-3.5-flash',
    thinking: true,
    webSearch: false,
    systemInstruction: 'Bạn là trợ lý lập trình. Chỉ trả về code, không thêm lời giải thích ngoài khối code.',
  }, {
    chunk: t => { full += t; },
    done: () => {
      const match = full.match(/```[\w]*\n?([\s\S]*?)```/);
      editor.value = (match ? match[1] : full).trim();
    },
    error: e => { editor.value = '⚠️ Lỗi: ' + e; },
  });
});
document.getElementById('codeCopyBtn').addEventListener('click', () => {
  navigator.clipboard.writeText(document.getElementById('codeEditor').value);
});
document.getElementById('codeDownloadBtn').addEventListener('click', () => {
  const blob = new Blob([document.getElementById('codeEditor').value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'code.txt';
  a.click();
});

// ===================== VOICE (turn-based) =====================
let voiceRecorder, voiceChunks = [];
const voiceBtn = document.getElementById('voiceBigBtn');
const voiceStatus = document.getElementById('voiceStatus');
const voiceTranscript = document.getElementById('voiceTranscript');
const voiceAudio = document.getElementById('voiceAudioPlayer');

voiceBtn.addEventListener('click', async () => {
  if (voiceBtn.classList.contains('recording')) {
    voiceRecorder.stop();
    voiceBtn.classList.remove('recording');
    voiceStatus.textContent = 'Đang xử lý...';
    return;
  }
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  voiceChunks = [];
  voiceRecorder = new MediaRecorder(stream);
  voiceRecorder.ondataavailable = e => voiceChunks.push(e.data);
  voiceRecorder.onstop = async () => {
    stream.getTracks().forEach(t => t.stop());
    const blob = new Blob(voiceChunks, { type: 'audio/webm' });
    const base64 = await blobToBase64(blob);

    const line = document.createElement('div');
    line.className = 'log-line';
    line.textContent = '🎤 Bạn: (đoạn ghi âm)';
    voiceTranscript.appendChild(line);

    let full = '';
    await streamPost(API_BASE + '/api/chat/stream', {
      messages: [{ role: 'user', parts: [{ text: 'Hãy nghe và trả lời đoạn ghi âm sau.' }] }],
      model: 'auto', thinking: false, webSearch: false,
      systemInstruction: 'Trả lời ngắn gọn, tự nhiên như đang trò chuyện bằng giọng nói. Tiếng Việt.',
      attachments: [{ mimeType: 'audio/webm', base64 }],
    }, {
      chunk: t => { full += t; },
      done: async () => {
        const reply = document.createElement('div');
        reply.className = 'log-line';
        reply.textContent = '🤖 AI: ' + full;
        voiceTranscript.appendChild(reply);
        voiceStatus.textContent = 'Đang tạo giọng nói...';
        const ttsRes = await fetch(API_BASE + '/api/tts/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text: full }) });
        const ttsData = await ttsRes.json();
        if (ttsData.base64) {
          voiceAudio.src = `data:${ttsData.mimeType};base64,${ttsData.base64}`;
          voiceAudio.classList.remove('hidden');
          voiceAudio.play();
        }
        voiceStatus.textContent = 'Nhấn để nói tiếp';
      },
      error: e => { voiceStatus.textContent = '⚠️ Lỗi: ' + e; },
    });
  };
  voiceRecorder.start();
  voiceBtn.classList.add('recording');
  voiceStatus.textContent = 'Đang nghe... nhấn lại để dừng';
});
function blobToBase64(blob) {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result.split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

// ===================== AGENT MODE =====================
document.getElementById('agentRunBtn').addEventListener('click', async () => {
  const task = document.getElementById('agentTask').value.trim();
  if (!task) return;
  const log = document.getElementById('agentLog');
  log.innerHTML = '';
  addLog(log, '🧭 Bắt đầu Agent với nhiệm vụ: ' + task);
  await runDeepResearch(task, log, true);
});

// ===================== DEEP RESEARCH =====================
document.getElementById('researchBtn').addEventListener('click', async () => {
  const q = document.getElementById('researchQuery').value.trim();
  if (!q) return;
  const log = document.getElementById('researchLog');
  log.innerHTML = '';
  await runDeepResearch(q, log, false);
});
async function runDeepResearch(query, log, isAgent) {
  await streamPost(API_BASE + '/api/search/deep-research', { query }, {
    progress: (t) => addLog(log, '⏳ ' + t),
    plan: (arr) => addLog(log, '📋 Kế hoạch: ' + arr.join(' | ')),
    finding: (f) => addLog(log, `🔍 ${f.question}\n${f.answer}`),
    report: (r) => addLog(log, (isAgent ? '✅ Kết quả Agent:\n' : '📄 Báo cáo:\n') + r, true),
    error: (e) => addLog(log, '⚠️ Lỗi: ' + e),
    done: () => {},
  });
}
function addLog(container, text, isReport) {
  const div = document.createElement('div');
  div.className = 'log-line' + (isReport ? ' report' : '');
  div.textContent = text;
  container.appendChild(div);
  container.scrollTop = container.scrollHeight;
}

// browse URL + ask
document.getElementById('browseBtn').addEventListener('click', async () => {
  const url = document.getElementById('browseUrl').value.trim();
  const question = document.getElementById('browseQuestion').value.trim();
  if (!url) return;
  const log = document.getElementById('researchLog');
  addLog(log, '🌍 Đang mở: ' + url);
  try {
    const r = await fetch(API_BASE + '/api/search/browse', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url, question }) });
    const data = await r.json();
    if (data.error) { addLog(log, '⚠️ ' + data.error); return; }
    addLog(log, '📄 Kết quả:\n' + data.answer, true);
  } catch (e) { addLog(log, '⚠️ Lỗi: ' + e.message); }
});

// init
if (state.conversationId) selectConversation(state.conversationId);
switchMode('chat');
