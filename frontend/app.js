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
  model: localStorage.getItem('myai_model') || 'auto',
  thinking: localStorage.getItem('myai_thinking') === '1',
};

const MODEL_OPTIONS = [
  { value: 'auto', label: '⚡ Auto', desc: 'Tự chọn model phù hợp nhất cho từng câu hỏi' },
  { value: 'gemini-3.1-flash-lite', label: '3.1 Flash-Lite', desc: 'Nhanh nhất, phù hợp câu hỏi đơn giản' },
  { value: 'gemini-3-flash-preview', label: '3 Flash', desc: 'Cân bằng giữa tốc độ và chất lượng' },
  { value: 'gemini-3.5-flash', label: '3.5 Flash', desc: 'Tối ưu cho việc viết/sửa code' },
  { value: 'gemini-3.1-pro-preview', label: '3.1 Pro', desc: 'Thông minh nhất, cho tác vụ phức tạp' },
];

const els = {
  sidebar: document.getElementById('sidebar'),
  hamburger: document.getElementById('hamburger'),
  modeTitle: document.getElementById('modeTitle'),
  modelPillBtn: document.getElementById('modelPillBtn'),
  modelPillLabel: document.getElementById('modelPillLabel'),
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
  thinkingToggle: document.getElementById('thinkingToggle'),
  webSearchToggle: document.getElementById('webSearchToggle'),
  tempChatToggle: document.getElementById('tempChatToggle'),
};

const modeTitles = {
  chat: 'Chat', homework: 'Giải bài tập', image: 'Tạo ảnh', video: 'Tạo video',
  artifacts: '🧩 Artifacts', code: 'Code Editor', voice: 'Voice', agent: 'Agent Mode',
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

// ===================== BOTTOM SHEETS (Attach / Model) — kiểu Claude =====================
function openSheet(sheetEl, backdropEl) { sheetEl.classList.add('open'); backdropEl.classList.remove('hidden'); backdropEl.classList.add('open'); }
function closeSheet(sheetEl, backdropEl) { sheetEl.classList.remove('open'); backdropEl.classList.remove('open'); setTimeout(() => backdropEl.classList.add('hidden'), 200); }

const attachSheet = document.getElementById('attachSheet');
const attachBackdrop = document.getElementById('attachBackdrop');
document.getElementById('btnPlus').addEventListener('click', () => openSheet(attachSheet, attachBackdrop));
document.getElementById('attachCloseBtn').addEventListener('click', () => closeSheet(attachSheet, attachBackdrop));
attachBackdrop.addEventListener('click', () => closeSheet(attachSheet, attachBackdrop));

function wireSheetFile(btnId, inputId) {
  const btn = document.getElementById(btnId), input = document.getElementById(inputId);
  btn.addEventListener('click', () => { closeSheet(attachSheet, attachBackdrop); input.click(); });
  input.addEventListener('change', async () => {
    for (const f of input.files) await uploadFile(f);
    input.value = '';
  });
}
wireSheetFile('sheetFiles', 'fileInput');
wireSheetFile('sheetPhotos', 'mediaInput');
wireSheetFile('sheetFolder', 'folderInput');
wireSheetFile('sheetCamera', 'cameraInput');
wireSheetFile('sheetVideoCap', 'videoCaptureInput');
document.getElementById('sheetDeepResearch').addEventListener('click', () => {
  closeSheet(attachSheet, attachBackdrop);
  switchMode('research');
});

const modelSheet = document.getElementById('modelSheet');
const modelBackdrop = document.getElementById('modelBackdrop');
const modelListEl = document.getElementById('modelList');
function renderModelSheet() {
  modelListEl.innerHTML = '';
  MODEL_OPTIONS.forEach(m => {
    const div = document.createElement('button');
    div.className = 'model-item' + (m.value === state.model ? ' selected' : '');
    div.innerHTML = `<span class="model-item-text"><span class="model-name">${m.label}</span><span class="model-desc">${m.desc}</span></span>
      <span class="model-check">${m.value === state.model ? '✓' : ''}</span>`;
    div.addEventListener('click', () => {
      state.model = m.value;
      localStorage.setItem('myai_model', m.value);
      updateModelPillLabel();
      closeSheet(modelSheet, modelBackdrop);
    });
    modelListEl.appendChild(div);
  });
}
els.modelPillBtn.addEventListener('click', () => { renderModelSheet(); openSheet(modelSheet, modelBackdrop); });
document.getElementById('modelCloseBtn').addEventListener('click', () => closeSheet(modelSheet, modelBackdrop));
modelBackdrop.addEventListener('click', () => closeSheet(modelSheet, modelBackdrop));

function updateModelPillLabel() {
  const m = MODEL_OPTIONS.find(m => m.value === state.model) || MODEL_OPTIONS[0];
  els.modelPillLabel.textContent = (state.thinking ? '🧠 ' : '') + m.label;
}
// Thinking giờ nằm trong Model sheet (không còn toggle riêng ở Attach sheet)
els.thinkingToggle.checked = state.thinking;
els.thinkingToggle.addEventListener('change', e => {
  state.thinking = e.target.checked;
  localStorage.setItem('myai_thinking', state.thinking ? '1' : '0');
  updateModelPillLabel();
});
// hiện đúng model đã lưu từ lần trước ngay khi tải trang
updateModelPillLabel();

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

// ===================== ĐỌC TO (Text-to-Speech) =====================
// Ưu tiên gọi Gemini TTS thật qua backend (/api/tts/speak, giọng chọn ở Settings).
// Nếu lỗi (thiếu API key, hết quota, mất mạng...) tự động chuyển sang Web Speech
// API có sẵn trong trình duyệt để không bị "câm" hoàn toàn.
let currentAudioEl = null;
function stopSpeaking() {
  if (currentAudioEl) { currentAudioEl.pause(); currentAudioEl = null; }
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
  document.querySelectorAll('.msg-action-btn.speaking').forEach(b => { b.classList.remove('speaking'); b.textContent = '🔊 Đọc to'; });
}
function speakWithBrowser(text, btnEl, onEnd) {
  if (!('speechSynthesis' in window)) { alert('Trình duyệt này không hỗ trợ đọc to.'); onEnd?.(); return; }
  const utter = new SpeechSynthesisUtterance(text || '');
  utter.lang = localStorage.getItem('myai_tts_lang') || 'vi-VN';
  utter.rate = Number(localStorage.getItem('myai_tts_rate') || '1');
  if (btnEl) { btnEl.classList.add('speaking'); btnEl.textContent = '⏹️ Dừng đọc'; }
  utter.onend = () => { if (btnEl) { btnEl.classList.remove('speaking'); btnEl.textContent = '🔊 Đọc to'; } onEnd?.(); };
  utter.onerror = () => { if (btnEl) { btnEl.classList.remove('speaking'); btnEl.textContent = '🔊 Đọc to'; } onEnd?.(); };
  window.speechSynthesis.speak(utter);
}
// speakText() là nơi DUY NHẤT nói chuyện với TTS — dùng chung cho nút "🔊 Đọc to" ở mỗi
// tin nhắn LẪN cho Voice panel, để cả 2 nơi luôn tôn trọng engine/giọng/tốc độ đã chọn ở Settings.
// opts.onEnd: callback khi đọc xong (dùng cho Voice panel cập nhật trạng thái).
// opts.audioEl: nếu truyền vào 1 thẻ <audio> có sẵn (vd voiceAudioPlayer), sẽ phát qua thẻ đó
// để hiện player trực quan, thay vì tạo Audio() ẩn.
async function speakText(text, btnEl, opts = {}) {
  const { onEnd, audioEl } = opts;
  // Đang đọc (dù bằng cách nào) -> bấm lại để dừng
  if (currentAudioEl || window.speechSynthesis?.speaking) {
    const wasThisBtn = btnEl?.classList.contains('speaking');
    stopSpeaking();
    if (wasThisBtn) return;
  }
  const voice = localStorage.getItem('myai_gemini_voice') || 'Kore';
  const useGemini = localStorage.getItem('myai_tts_engine') !== 'browser'; // mặc định ưu tiên Gemini
  if (!useGemini) { speakWithBrowser(text, btnEl, onEnd); return; }

  if (btnEl) { btnEl.classList.add('speaking'); btnEl.textContent = '⏳ Đang tạo giọng...'; }
  try {
    const r = await fetch(API_BASE + '/api/tts/speak', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, voice }),
    });
    const data = await r.json();
    if (!r.ok || !data.base64) throw new Error(data.error?.message || data.error || 'TTS lỗi');

    // Gemini TTS trả PCM thô (16-bit, 24kHz, mono) — cần bọc header WAV mới phát được bằng <audio>/Web Audio.
    const wavBlob = pcmBase64ToWavBlob(data.base64, 24000);
    const url = URL.createObjectURL(wavBlob);
    const audio = audioEl || new Audio();
    audio.src = url;
    if (audioEl) audioEl.classList.remove('hidden');
    currentAudioEl = audio;
    if (btnEl) btnEl.textContent = '⏹️ Dừng đọc';
    audio.onended = () => { if (btnEl) { btnEl.classList.remove('speaking'); btnEl.textContent = '🔊 Đọc to'; } currentAudioEl = null; URL.revokeObjectURL(url); onEnd?.(); };
    audio.onerror = () => { if (btnEl) { btnEl.classList.remove('speaking'); btnEl.textContent = '🔊 Đọc to'; } currentAudioEl = null; onEnd?.(); };
    await audio.play();
  } catch (e) {
    // Fallback: giọng trình duyệt
    if (btnEl) { btnEl.classList.remove('speaking'); btnEl.textContent = '🔊 Đọc to'; }
    speakWithBrowser(text, btnEl, onEnd);
  }
}
// Gemini TTS trả PCM 16-bit little-endian không header — tự bọc thành file WAV hợp lệ.
function pcmBase64ToWavBlob(base64, sampleRate) {
  const binary = atob(base64);
  const pcmLen = binary.length;
  const buffer = new ArrayBuffer(44 + pcmLen);
  const view = new DataView(buffer);
  const writeStr = (offset, str) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, 'RIFF'); view.setUint32(4, 36 + pcmLen, true); writeStr(8, 'WAVE');
  writeStr(12, 'fmt '); view.setUint32(16, 16, true); view.setUint16(20, 1, true);
  view.setUint16(22, 1, true); view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true); view.setUint16(32, 2, true); view.setUint16(34, 16, true);
  writeStr(36, 'data'); view.setUint32(40, pcmLen, true);
  for (let i = 0; i < pcmLen; i++) view.setUint8(44 + i, binary.charCodeAt(i));
  return new Blob([buffer], { type: 'audio/wav' });
}

// ===================== CHAT =====================
function saveHistory() {
  if (!state.temp) localStorage.setItem('myai_history', JSON.stringify(state.history));
}
function renderHistory() {
  els.chatMessages.innerHTML = '';
  state.history.forEach((m, i) => appendMsgToDOM(m.role, m.text, m.grounding, i));
}
function appendMsgToDOM(role, text, grounding, index) {
  const wrap = document.createElement('div');
  wrap.className = 'msg-wrap ' + role;
  if (typeof index === 'number') wrap.dataset.index = index;

  const div = document.createElement('div');
  div.className = 'msg ' + role;

  // Tin nhắn AI: nếu chứa 1 khối code đáng kể (HTML trang riêng, hoặc >=6 dòng code),
  // tách ra thành Artifact card thay vì in thô cả khối ``` trong bong bóng chat.
  let artifactInfo = null;
  if (role === 'assistant') {
    artifactInfo = extractArtifactFromText(text);
  }
  if (artifactInfo) {
    const before = text.slice(0, text.indexOf('```')).trim();
    div.textContent = before;
  } else {
    div.textContent = text;
  }

  if (grounding?.groundingChunks?.length) {
    const g = document.createElement('div');
    g.className = 'grounding';
    g.innerHTML = '🔗 Nguồn: ' + grounding.groundingChunks.slice(0, 5)
      .map(c => c.web ? `<a href="${c.web.uri}" target="_blank">${c.web.title || c.web.uri}</a>` : '')
      .filter(Boolean).join(' · ');
    div.appendChild(g);
  }
  wrap.appendChild(div);

  // Nếu tách được artifact, tạo (hoặc tái sử dụng) và chèn card bên dưới nội dung
  if (artifactInfo) {
    const title = (before || text).replace(/\s+/g, ' ').slice(0, 60) || 'Artifact từ Chat';
    const artifact = ArtifactStore.add({ title, code: artifactInfo.code, source: 'chat' });
    wrap.appendChild(artifactCardEl(artifact));
  }

  // Hàng nút: sao chép + đọc to (mọi tin nhắn) + sửa (chỉ tin nhắn của bạn)
  const actions = document.createElement('div');
  actions.className = 'msg-actions';
  const copyBtn = document.createElement('button');
  copyBtn.className = 'msg-action-btn'; copyBtn.textContent = '📋 Sao chép';
  copyBtn.addEventListener('click', () => {
    navigator.clipboard?.writeText(text || '');
    copyBtn.textContent = '✅ Đã chép';
    setTimeout(() => copyBtn.textContent = '📋 Sao chép', 1500);
  });
  actions.appendChild(copyBtn);

  const speakBtn = document.createElement('button');
  speakBtn.className = 'msg-action-btn'; speakBtn.textContent = '🔊 Đọc to';
  speakBtn.addEventListener('click', () => speakText(text, speakBtn));
  actions.appendChild(speakBtn);

  if (role === 'user' && typeof index === 'number') {
    const editBtn = document.createElement('button');
    editBtn.className = 'msg-action-btn'; editBtn.textContent = '✏️ Sửa';
    editBtn.addEventListener('click', () => startEditMessage(wrap, index, text));
    actions.appendChild(editBtn);
  }
  wrap.appendChild(actions);

  els.chatMessages.appendChild(wrap);
  els.chatMessages.scrollTop = els.chatMessages.scrollHeight;
  return div;
}
renderHistory();

// ---- Sửa tin nhắn: bấm "✏️ Sửa" -> hiện textarea inline -> Lưu sẽ xoá các tin
// nhắn sau đó và gửi lại như 1 tin nhắn mới (giống cách Claude/ChatGPT xử lý edit) ----
function startEditMessage(wrap, index, currentText) {
  if (wrap.classList.contains('editing')) return;
  wrap.classList.add('editing');
  const msgDiv = wrap.querySelector('.msg');
  const original = msgDiv.style.display;
  msgDiv.style.display = 'none';

  const box = document.createElement('div');
  box.className = 'msg-edit-box';
  box.innerHTML = `<textarea>${currentText.replace(/</g, '&lt;')}</textarea>
    <div class="msg-edit-actions">
      <button class="msg-edit-cancel">Huỷ</button>
      <button class="msg-edit-save">Lưu &amp; gửi lại</button>
    </div>`;
  wrap.insertBefore(box, msgDiv);
  const ta = box.querySelector('textarea');
  ta.style.height = Math.min(220, ta.scrollHeight) + 'px';
  ta.focus();

  box.querySelector('.msg-edit-cancel').addEventListener('click', () => {
    box.remove(); msgDiv.style.display = original; wrap.classList.remove('editing');
  });
  box.querySelector('.msg-edit-save').addEventListener('click', () => {
    const newText = ta.value.trim();
    if (!newText) return;
    box.remove(); wrap.classList.remove('editing');
    editMessage(index, newText);
  });
}
function editMessage(index, newText) {
  // Xoá tin nhắn này và mọi tin nhắn sau nó, rồi gửi lại như tin nhắn mới
  state.history = state.history.slice(0, index);
  saveHistory();
  renderHistory();
  submitUserMessage(newText, []);
}

els.newChatBtn.addEventListener('click', () => {
  state.history = [];
  state.conversationId = null;
  localStorage.removeItem('myai_last_conv');
  saveHistory();
  renderHistory();
  loadConversations();
  switchMode('chat');
});

// Nút "🕶️ Tạm thời" ở góc trái sidebar — đồng bộ 2 chiều với toggle trong Attach sheet
const tempChatBtnTop = document.getElementById('tempChatBtnTop');
function setTempMode(on) {
  state.temp = on;
  els.tempChatToggle.checked = on;
  tempChatBtnTop.classList.toggle('active', on);
  els.tempBanner.classList.toggle('hidden', !on);
}
tempChatBtnTop.addEventListener('click', () => setTempMode(!state.temp));
els.tempChatToggle.addEventListener('change', e => setTempMode(e.target.checked));
els.chatInput.addEventListener('input', () => {
  els.chatInput.style.height = 'auto';
  els.chatInput.style.height = Math.min(220, els.chatInput.scrollHeight) + 'px';
});
els.chatInput.addEventListener('keydown', e => {
  if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendChat(); }
});
els.sendBtn.addEventListener('click', sendChat);

function sendChat() {
  const text = els.chatInput.value.trim();
  if (!text && state.pendingAttachments.length === 0) return;
  els.chatInput.value = ''; els.chatInput.style.height = 'auto';
  const attachments = state.pendingAttachments.map(a => ({ mimeType: a.mimeType, base64: a.base64 }));
  clearAttachments();
  submitUserMessage(text, attachments);
}

async function submitUserMessage(text, attachments) {
  const index = state.history.length;
  appendMsgToDOM('user', text || '[đính kèm]', null, index);
  state.history.push({ role: 'user', text });

  // Lưu vào D1 (trừ khi đang ở chế độ tạm thời) — tự tạo hội thoại mới nếu chưa có
  if (!state.temp) {
    await ensureConversation(text);
    if (state.conversationId) saveMessageToServer('user', text);
  }

  const assistantDiv = appendMsgToDOM('assistant', '', null, index + 1);
  let fullText = '';
  let lastGrounding = null;

  const isHomework = state.mode === 'homework';
  const systemInstruction = isHomework
    ? 'Bạn là gia sư. Khi được hỏi bài tập, đừng chỉ đưa đáp án — hãy giải thích từng bước, chỉ ra cách tư duy, rồi mới chốt đáp án cuối cùng. Trả lời bằng tiếng Việt, rõ ràng, dễ hiểu.'
    : 'Bạn là My-AI, một trợ lý AI hữu ích, trả lời bằng tiếng Việt trừ khi người dùng dùng ngôn ngữ khác.';

  await streamPost(API_BASE + '/api/chat/stream', {
    messages: [...state.history.map(m => ({ role: m.role, parts: [{ text: m.text }] }))],
    model: state.model,
    thinking: state.thinking,
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
      if (!state.temp && state.conversationId) saveMessageToServer('assistant', fullText, state.model);
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
      <button class="conv-share" title="Chia sẻ">🔗</button>
      <button class="conv-rename" title="Đổi tên">✏️</button>
      <button class="conv-delete" title="Xoá">🗑️</button>
    </span>`;
  div.addEventListener('click', (e) => { if (!e.target.closest('.conv-actions')) selectConversation(conv.id); });
  div.querySelector('.conv-share').addEventListener('click', async (e) => {
    e.stopPropagation();
    try {
      const r = await fetch(API_BASE + `/api/conversations/${conv.id}/messages`);
      const msgs = await r.json();
      const text = Array.isArray(msgs) ? msgs.map(m => `${m.role === 'user' ? '🧑 Bạn' : '🤖 AI'}: ${m.content}`).join('\n\n') : '';
      openShareSheet(`💬 ${conv.title || 'Cuộc trò chuyện'}\n\n${text}`);
    } catch { alert('Không tải được nội dung để chia sẻ.'); }
  });
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
  if (!btn || !input) return;
  btn.addEventListener('click', () => input.click());
  input.addEventListener('change', async () => {
    for (const f of input.files) await uploadFile(f);
    input.value = '';
  });
}
// (nút đính kèm giờ nằm trong sheet "＋", xem phần BOTTOM SHEETS phía trên)

// mic quick-attach (record short clip, attach as audio to chat)
document.getElementById('btnMic').addEventListener('click', async () => {
  const micBtn = document.getElementById('btnMic');
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const recorder = new MediaRecorder(stream);
    const chunks = [];
    recorder.ondataavailable = e => chunks.push(e.data);
    recorder.start();
    micBtn.classList.add('recording'); micBtn.textContent = '⏺️';
    setTimeout(() => recorder.stop(), 5000); // ghi 5s, bấm lại chưa hỗ trợ dừng sớm ở bản này
    recorder.onstop = async () => {
      micBtn.classList.remove('recording'); micBtn.textContent = '🎤';
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
  if (mode === 'artifacts') {
    renderArtifactsGrid();
  }
};
document.querySelectorAll('.nav-btn[data-mode="library"]').forEach(btn => {
  btn.addEventListener('click', () => switchMode('library'));
});

// ===================== CANVAS =====================
// ===================== ARTIFACTS (hợp nhất, dùng chung Chat / Code Editor / Agent Mode) =====================
// Một "artifact" = 1 khối code/HTML độc lập mà AI tạo ra, có thể preview trực tiếp.
// Lưu trong localStorage để còn xem lại sau khi tải lại trang.
const artifactEls = {
  listView: document.getElementById('artifactsListView'),
  grid: document.getElementById('artifactsGrid'),
  detail: document.getElementById('artifactDetail'),
  detailTitle: document.getElementById('artifactDetailTitle'),
  backBtn: document.getElementById('artifactBackBtn'),
  copyBtn: document.getElementById('artifactCopyBtn'),
  shareBtn: document.getElementById('artifactShareBtn'),
  downloadBtn: document.getElementById('artifactDownloadBtn'),
  codeArea: document.getElementById('artifactCode'),
  frame: document.getElementById('artifactFrame'),
  runBtn: document.getElementById('artifactRunBtn'),
  genBtn: document.getElementById('artifactGenBtn'),
  prompt: document.getElementById('artifactPrompt'),
};

const ArtifactStore = {
  KEY: 'myai_artifacts',
  all() { return JSON.parse(localStorage.getItem(this.KEY) || '[]'); },
  save(list) { localStorage.setItem(this.KEY, JSON.stringify(list)); },
  add({ title, code, source }) {
    const list = this.all();
    const artifact = { id: 'art_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7), title: title || 'Artifact không tên', code, source: source || 'chat', createdAt: new Date().toISOString() };
    list.unshift(artifact);
    this.save(list);
    return artifact;
  },
  get(id) { return this.all().find(a => a.id === id); },
  remove(id) { this.save(this.all().filter(a => a.id !== id)); },
};

// Nhận diện block code trong 1 câu trả lời của AI và tách ra thành artifact nếu đáng (HTML đầy đủ trang, hoặc code >6 dòng).
function extractArtifactFromText(text) {
  const htmlMatch = text.match(/```html([\s\S]*?)```/i);
  if (htmlMatch) return { code: htmlMatch[1].trim(), lang: 'html' };
  const anyMatch = text.match(/```(\w*)\n?([\s\S]*?)```/);
  if (anyMatch && anyMatch[2].trim().split('\n').length >= 6) {
    return { code: anyMatch[2].trim(), lang: anyMatch[1] || 'code' };
  }
  return null;
}

function openArtifact(id) {
  const artifact = ArtifactStore.get(id);
  if (!artifact) return;
  switchMode('artifacts');
  artifactEls.listView.classList.add('hidden');
  artifactEls.detail.classList.remove('hidden');
  artifactEls.detailTitle.textContent = artifact.title;
  artifactEls.codeArea.value = artifact.code;
  artifactEls.detail.dataset.artifactId = id;
  runArtifactPreview();
  setArtifactTab('preview');
}
function closeArtifactDetail() {
  artifactEls.detail.classList.add('hidden');
  artifactEls.listView.classList.remove('hidden');
  renderArtifactsGrid();
}
artifactEls.backBtn.addEventListener('click', closeArtifactDetail);

function setArtifactTab(tab) {
  document.querySelectorAll('.artifact-tab').forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
  document.getElementById('artifactPreviewView').classList.toggle('active', tab === 'preview');
  document.getElementById('artifactCodeView').classList.toggle('active', tab === 'code');
}
document.querySelectorAll('.artifact-tab').forEach(btn => {
  btn.addEventListener('click', () => setArtifactTab(btn.dataset.tab));
});

function runArtifactPreview() {
  const code = artifactEls.codeArea.value;
  artifactEls.frame.srcdoc = code || '<p style="font-family:sans-serif;padding:20px;color:#888">Artifact trống.</p>';
}
artifactEls.runBtn.addEventListener('click', () => {
  runArtifactPreview();
  const id = artifactEls.detail.dataset.artifactId;
  if (id) { const list = ArtifactStore.all(); const a = list.find(x => x.id === id); if (a) { a.code = artifactEls.codeArea.value; ArtifactStore.save(list); } }
});

artifactEls.copyBtn.addEventListener('click', () => {
  navigator.clipboard?.writeText(artifactEls.codeArea.value || '');
  artifactEls.copyBtn.textContent = '✅ Đã chép';
  setTimeout(() => artifactEls.copyBtn.textContent = '📋 Copy', 1500);
});
artifactEls.downloadBtn.addEventListener('click', () => {
  const blob = new Blob([artifactEls.codeArea.value], { type: 'text/plain' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = (artifactEls.detailTitle.textContent || 'artifact').replace(/[^\w\-]+/g, '_') + '.html';
  a.click();
});
artifactEls.shareBtn.addEventListener('click', () => {
  const id = artifactEls.detail.dataset.artifactId;
  const artifact = id ? ArtifactStore.get(id) : null;
  openShareSheet(`🧩 ${artifact?.title || 'Artifact'}\n\n${artifactEls.codeArea.value}`);
});

function artifactCardEl(artifact) {
  const card = document.createElement('div');
  card.className = 'artifact-card';
  const sourceLabel = { chat: '💬 Chat', code: '💻 Code Editor', agent: '🚀 Agent', artifacts: '🧩 Artifacts' }[artifact.source] || artifact.source;
  card.innerHTML = `
    <div class="artifact-card-icon">🧩</div>
    <div class="artifact-card-body">
      <div class="artifact-card-title">${artifact.title}</div>
      <div class="artifact-card-meta">${sourceLabel} · ${new Date(artifact.createdAt).toLocaleString('vi-VN')}</div>
    </div>
    <div class="artifact-card-actions">
      <button class="ac-preview" title="Preview">👁️</button>
      <button class="ac-code" title="Xem code">💻</button>
      <button class="ac-copy" title="Copy">📋</button>
      <button class="ac-share" title="Share">🔗</button>
    </div>`;
  card.querySelector('.ac-preview').addEventListener('click', (e) => { e.stopPropagation(); openArtifact(artifact.id); setArtifactTab('preview'); });
  card.querySelector('.ac-code').addEventListener('click', (e) => { e.stopPropagation(); openArtifact(artifact.id); setArtifactTab('code'); });
  card.querySelector('.ac-copy').addEventListener('click', (e) => {
    e.stopPropagation();
    navigator.clipboard?.writeText(artifact.code || '');
    e.target.textContent = '✅';
    setTimeout(() => e.target.textContent = '📋', 1200);
  });
  card.querySelector('.ac-share').addEventListener('click', (e) => { e.stopPropagation(); openShareSheet(`🧩 ${artifact.title}\n\n${artifact.code}`); });
  card.addEventListener('click', () => openArtifact(artifact.id));
  return card;
}
function renderArtifactsGrid() {
  const list = ArtifactStore.all();
  artifactEls.grid.innerHTML = '';
  if (!list.length) { artifactEls.grid.innerHTML = '<p class="hint">Chưa có artifact nào. Tạo mới ở trên, hoặc nhờ AI viết code/HTML trong Chat, Code Editor hay Agent Mode — artifact sẽ tự xuất hiện ở đây.</p>'; return; }
  list.forEach(a => artifactEls.grid.appendChild(artifactCardEl(a)));
}
document.querySelector('.nav-btn[data-mode="artifacts"]').addEventListener('click', () => {
  closeArtifactDetail();
});

// Tạo artifact mới trực tiếp từ panel Artifacts (giống Canvas cũ)
artifactEls.genBtn.addEventListener('click', async () => {
  const prompt = artifactEls.prompt.value.trim();
  if (!prompt) return;
  artifactEls.genBtn.disabled = true;
  artifactEls.genBtn.textContent = '⏳ Đang tạo...';
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
      const code = (match ? match[1] : full).trim();
      const artifact = ArtifactStore.add({ title: prompt.slice(0, 60), code, source: 'artifacts' });
      artifactEls.genBtn.disabled = false;
      artifactEls.genBtn.textContent = '⚡ Tạo Artifact mới';
      artifactEls.prompt.value = '';
      openArtifact(artifact.id);
    },
    error: e => {
      artifactEls.genBtn.disabled = false;
      artifactEls.genBtn.textContent = '⚡ Tạo Artifact mới';
      alert('⚠️ Lỗi: ' + e);
    },
  });
});

// ===================== SHARE SHEET (dùng chung: đoạn chat + artifact) =====================
const shareSheetEl = document.getElementById('shareSheet');
const shareBackdropEl = document.getElementById('shareBackdrop');
function openShareSheet(text) {
  document.getElementById('shareTextArea').value = text;
  openSheet(shareSheetEl, shareBackdropEl);
}
document.getElementById('shareCloseBtn').addEventListener('click', () => closeSheet(shareSheetEl, shareBackdropEl));
shareBackdropEl.addEventListener('click', () => closeSheet(shareSheetEl, shareBackdropEl));
document.getElementById('shareCopyBtn').addEventListener('click', () => {
  navigator.clipboard?.writeText(document.getElementById('shareTextArea').value || '');
  const btn = document.getElementById('shareCopyBtn');
  btn.textContent = '✅ Đã chép';
  setTimeout(() => btn.textContent = '📋 Sao chép nội dung chia sẻ', 1500);
});
function shareConversation() {
  const text = state.history.map(m => `${m.role === 'user' ? '🧑 Bạn' : '🤖 AI'}: ${m.text}`).join('\n\n');
  openShareSheet(text || 'Chưa có nội dung để chia sẻ.');
}
document.getElementById('shareChatBtn').addEventListener('click', shareConversation);

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
      const code = (match ? match[1] : full).trim();
      editor.value = code;
      // Code >= 6 dòng cũng tự lưu thành artifact để xem lại trong panel Artifacts
      if (code.split('\n').length >= 6) ArtifactStore.add({ title: instruction.slice(0, 60), code, source: 'code' });
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
        // Dùng chung speakText() để tôn trọng đúng engine (Gemini/trình duyệt), giọng và tốc độ
        // đã chọn ở Settings, kèm tự fallback sang giọng trình duyệt nếu Gemini lỗi/hết quota.
        speakText(full, null, {
          audioEl: voiceAudio,
          onEnd: () => { voiceStatus.textContent = 'Nhấn để nói tiếp'; },
        });
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

  // Nếu đây là báo cáo cuối cùng và chứa 1 khối code đáng kể, tự tạo Artifact để xem/preview lại
  if (isReport) {
    const info = extractArtifactFromText(text);
    if (info) {
      const artifact = ArtifactStore.add({ title: text.slice(0, 60).replace(/\s+/g, ' '), code: info.code, source: 'agent' });
      container.appendChild(artifactCardEl(artifact));
    }
  }
}

// browse URL + ask
// ===================== ĐÃ XOÁ GẦN ĐÂY (soft-delete, 7 ngày) =====================
const trashEls = {
  list: document.getElementById('trashList'),
  refreshBtn: document.getElementById('trashRefreshBtn'),
};

function trashItemEl(conv) {
  const div = document.createElement('div');
  div.className = 'trash-item';
  const daysLeft = Number.isFinite(conv.days_left) ? conv.days_left : '?';
  div.innerHTML = `
    <div class="trash-item-info">
      <span class="conv-title">${conv.title || 'Cuộc trò chuyện'}</span>
      <span class="trash-days-left">Còn ${daysLeft} ngày trước khi xoá vĩnh viễn</span>
    </div>
    <span class="conv-actions">
      <button class="trash-restore" title="Khôi phục">↩️ Khôi phục</button>
      <button class="trash-purge" title="Xoá vĩnh viễn ngay">🗑️ Xoá hẳn</button>
    </span>`;
  div.querySelector('.trash-restore').addEventListener('click', async () => {
    await fetch(API_BASE + `/api/conversations/${conv.id}/restore`, { method: 'POST' });
    loadTrash();
    loadConversations();
  });
  div.querySelector('.trash-purge').addEventListener('click', async () => {
    if (!confirm('Xoá VĨNH VIỄN hội thoại này? Không thể hoàn tác.')) return;
    await fetch(API_BASE + `/api/conversations/${conv.id}/purge`, { method: 'DELETE' });
    loadTrash();
  });
  return div;
}

async function loadTrash() {
  if (!trashEls.list) return;
  trashEls.list.innerHTML = '<p class="hint">Đang tải...</p>';
  try {
    const r = await fetch(API_BASE + '/api/conversations/trash');
    const list = await r.json();
    if (!Array.isArray(list)) { trashEls.list.innerHTML = '<p class="hint">D1 chưa được cấu hình.</p>'; return; }
    trashEls.list.innerHTML = '';
    if (!list.length) { trashEls.list.innerHTML = '<p class="hint">Thùng rác trống.</p>'; return; }
    list.forEach(c => trashEls.list.appendChild(trashItemEl(c)));
  } catch (e) {
    trashEls.list.innerHTML = '<p class="hint">Không tải được — kiểm tra kết nối backend.</p>';
  }
}
trashEls.refreshBtn?.addEventListener('click', loadTrash);
// Tự tải khi mở panel Cài đặt
document.querySelector('.nav-btn[data-mode="settings"]')?.addEventListener('click', loadTrash);

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

// ===================== SETTINGS: TUỲ CHỈNH GIỌNG NÓI AI (TTS) =====================
// 8 giọng prebuilt cố định của Gemini TTS (gemini-3.1-flash-tts-preview) — đây là toàn bộ
// danh sách Google công bố, API không có endpoint liệt kê động nên phải khai cứng ở đây.
// Nguồn: https://ai.google.dev/gemini-api/docs/speech-generation
const GEMINI_VOICES = [
  { name: 'Kore', desc: 'Nữ, chắc chắn, rõ ràng' },
  { name: 'Puck', desc: 'Nam, tươi vui, năng động' },
  { name: 'Charon', desc: 'Nam, trầm, thông tin' },
  { name: 'Fenrir', desc: 'Nam, mạnh mẽ, dứt khoát' },
  { name: 'Aoede', desc: 'Nữ, nhẹ nhàng, du dương' },
  { name: 'Leda', desc: 'Nữ, trẻ trung' },
  { name: 'Orus', desc: 'Nam, vững chãi' },
  { name: 'Zephyr', desc: 'Nữ, sáng, thân thiện' },
];

const ttsEls = {
  engineToggle: document.getElementById('ttsEngineToggle'),
  geminiSection: document.getElementById('geminiVoiceSection'),
  geminiGrid: document.getElementById('geminiVoiceGrid'),
  browserSection: document.getElementById('browserVoiceSection'),
  voiceSelect: document.getElementById('ttsVoiceSelect'),
  rateRange: document.getElementById('ttsRateRange'),
  rateLabel: document.getElementById('ttsRateLabel'),
};

function renderGeminiVoiceGrid() {
  if (!ttsEls.geminiGrid) return;
  const selected = localStorage.getItem('myai_gemini_voice') || 'Kore';
  ttsEls.geminiGrid.innerHTML = '';
  GEMINI_VOICES.forEach(v => {
    const card = document.createElement('div');
    card.className = 'tts-voice-card' + (v.name === selected ? ' selected' : '');
    card.innerHTML = `
      <div class="tts-voice-info">
        <span class="tts-voice-name">${v.name}</span>
        <span class="tts-voice-desc">${v.desc}</span>
      </div>
      <button class="tts-voice-play" title="Nghe thử giọng ${v.name}">▶</button>`;
    card.addEventListener('click', (e) => {
      if (e.target.closest('.tts-voice-play')) return;
      localStorage.setItem('myai_gemini_voice', v.name);
      renderGeminiVoiceGrid();
    });
    card.querySelector('.tts-voice-play').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn = e.currentTarget;
      const original = btn.textContent;
      btn.textContent = '⏳';
      btn.disabled = true;
      try {
        const r = await fetch(API_BASE + '/api/tts/speak', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: `Xin chào, đây là giọng ${v.name} của Gemini.`, voice: v.name }),
        });
        const data = await r.json();
        if (!r.ok || !data.base64) throw new Error(data.error?.message || data.error || 'Lỗi TTS');
        const blob = pcmBase64ToWavBlob(data.base64, 24000);
        const audio = new Audio(URL.createObjectURL(blob));
        await audio.play();
      } catch (err) {
        alert('⚠️ Không nghe thử được: ' + err.message + '\n(Kiểm tra GEMINI_API_KEY trong .env)');
      } finally {
        btn.textContent = original;
        btn.disabled = false;
      }
    });
    ttsEls.geminiGrid.appendChild(card);
  });
}
renderGeminiVoiceGrid();

function updateTtsEngineUI() {
  const useGemini = ttsEls.engineToggle?.checked;
  ttsEls.geminiSection?.classList.toggle('hidden', !useGemini);
  ttsEls.browserSection?.classList.toggle('hidden', useGemini);
}
if (ttsEls.engineToggle) {
  ttsEls.engineToggle.checked = localStorage.getItem('myai_tts_engine') !== 'browser';
  updateTtsEngineUI();
  ttsEls.engineToggle.addEventListener('change', () => {
    localStorage.setItem('myai_tts_engine', ttsEls.engineToggle.checked ? 'gemini' : 'browser');
    updateTtsEngineUI();
  });
}

function populateVoiceList() {
  if (!('speechSynthesis' in window) || !ttsEls.voiceSelect) return;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return; // sẽ được gọi lại qua onvoiceschanged
  const savedVoice = localStorage.getItem('myai_browser_voice');
  ttsEls.voiceSelect.innerHTML = '<option value="">Mặc định trình duyệt</option>' +
    voices.map(v => `<option value="${v.name}" ${v.name === savedVoice ? 'selected' : ''}>${v.name} (${v.lang})</option>`).join('');
}
if ('speechSynthesis' in window) {
  populateVoiceList();
  window.speechSynthesis.onvoiceschanged = populateVoiceList;
}
ttsEls.voiceSelect?.addEventListener('change', () => {
  const v = ttsEls.voiceSelect.value;
  if (v) {
    localStorage.setItem('myai_browser_voice', v);
    const voice = window.speechSynthesis.getVoices().find(x => x.name === v);
    if (voice) localStorage.setItem('myai_tts_lang', voice.lang);
  } else {
    localStorage.removeItem('myai_browser_voice');
  }
});
const savedRate = localStorage.getItem('myai_tts_rate') || '1';
if (ttsEls.rateRange) { ttsEls.rateRange.value = savedRate; ttsEls.rateLabel.textContent = Number(savedRate).toFixed(1) + 'x'; }
ttsEls.rateRange?.addEventListener('input', () => {
  ttsEls.rateLabel.textContent = Number(ttsEls.rateRange.value).toFixed(1) + 'x';
  localStorage.setItem('myai_tts_rate', ttsEls.rateRange.value);
});

// init
if (state.conversationId) selectConversation(state.conversationId);
switchMode('chat');
