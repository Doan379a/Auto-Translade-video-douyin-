// ====== State ======
const trends = [];
const selected = new Map(); // key(shareUrl) -> {url, title}
const jobs = new Map(); // id -> job
const selectedJobs = new Set(); // id cac job duoc tick de go
let editorJobId = null;

const $ = (s) => document.querySelector(s);
const fmt = (n) => (n >= 1e6 ? (n / 1e6).toFixed(1) + "M" : n >= 1e3 ? (n / 1e3).toFixed(1) + "K" : "" + n);
const esc = (s) => (s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

const STAGE_VI = {
  download: "Đang tải video…", transcribe: "Đang nghe & chép lời…",
  translate: "Đang dịch…", subtitle: "Đang tạo phụ đề…",
  bgm: "Đang tách nhạc nền…", tts: "Đang lồng tiếng…",
  mux: "Đang ghép video…", metadata: "Đang tạo tiêu đề/mô tả…",
};
const STATUS_VI = {
  queued: "Trong hàng đợi", preparing: "Đang chuẩn bị", review: "Chờ duyệt phụ đề",
  rendering: "Đang render", done: "Hoàn tất", error: "Lỗi",
};

// ====== Tabs ======
document.querySelectorAll(".tab").forEach((t) =>
  t.addEventListener("click", () => switchTab(t.dataset.tab))
);
function switchTab(name) {
  document.querySelectorAll(".tab").forEach((t) => t.classList.toggle("active", t.dataset.tab === name));
  document.querySelectorAll(".tab-panel").forEach((p) => p.classList.toggle("active", p.id === "tab-" + name));
}

// ====== Trends ======
$("#scanBtn").addEventListener("click", scanTrends);
$("#addLinkBtn").addEventListener("click", addLink);
$("#linkInput").addEventListener("keydown", (e) => { if (e.key === "Enter") addLink(); });
$("#processBtn").addEventListener("click", processSelected);

// ====== Cai dat: cookie Douyin (kiem tra song/chet, khoa khi con hieu luc) ======
$("#cookieSaveBtn").addEventListener("click", saveCookie);
$("#cookieEditBtn").addEventListener("click", unlockCookie);

// Dat trang thai o token: locked = co tich + khoa; mo = cho sua.
function setCookieLocked(locked) {
  $("#cookieValue").readOnly = locked;
  $("#cookieSaveBtn").style.display = locked ? "none" : "";
  $("#cookieEditBtn").style.display = locked ? "" : "none";
}
function setBadge(text, color) {
  const b = $("#cookieState");
  b.textContent = text;
  b.style.color = color || "";
}

async function loadSettings() {
  try {
    const s = await fetch("/api/settings").then((r) => r.json());
    $("#cookieValue").value = s.cookie || "";
    if (!s.hasCookie) {
      setBadge("Chưa có", "var(--amber)");
      setCookieLocked(false);
      $("#cookieStatus").textContent = "Chưa có token — dán cookie Douyin vào rồi bấm Lưu.";
      return;
    }
    // Co token -> kiem tra con song khong
    setBadge("⏳ kiểm tra…");
    $("#cookieStatus").textContent = "Đang kiểm tra token…";
    await checkCookie(s.apiInstalled);
  } catch {
    setBadge("?");
    setCookieLocked(false);
  }
}

async function checkCookie(apiInstalled) {
  try {
    const c = await fetch("/api/settings/check").then((r) => r.json());
    if (!c.hasCookie) {
      setBadge("Chưa có", "var(--amber)"); setCookieLocked(false);
      $("#cookieStatus").textContent = "Chưa có token — dán vào rồi Lưu.";
    } else if (!c.tested) {
      setBadge("? chưa rõ", "var(--amber)"); setCookieLocked(false);
      $("#cookieStatus").textContent = "Chưa kiểm tra được (API Douyin chưa chạy). Bạn vẫn có thể cập nhật token.";
    } else if (c.alive) {
      setBadge("Đang hoạt động ✓", "var(--green)"); setCookieLocked(true);
      $("#cookieStatus").textContent = "Token còn hiệu lực — đã khóa. Bấm \"Đổi token khác\" nếu muốn thay.";
    } else {
      setBadge("Hết hạn ⚠", "var(--red)"); setCookieLocked(false);
      $("#cookieStatus").textContent = "⚠ Token đã hết hạn / không dùng được — dán token mới rồi bấm Lưu.";
      $("#settingsPanel").open = true; // tu mo panel cho de thay
    }
  } catch {
    setBadge("?"); setCookieLocked(false);
  }
}

function unlockCookie() {
  setCookieLocked(false);
  const ta = $("#cookieValue");
  ta.focus();
  $("#cookieStatus").textContent = "Đang sửa token — dán token mới rồi bấm Lưu (để trống = xóa token).";
}

async function saveCookie() {
  const douyinCookie = $("#cookieValue").value.trim();
  const btn = $("#cookieSaveBtn");
  btn.disabled = true; btn.textContent = "Đang áp dụng…";
  $("#cookieStatus").textContent = "Đang lưu & khởi động lại API Douyin…";
  try {
    const res = await fetch("/api/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ douyinCookie }),
    });
    const s = await res.json();
    if (!res.ok) throw new Error(s.error || "Lỗi lưu cookie");
    await loadSettings(); // dien lai + kiem tra lai trang thai
  } catch (e) {
    $("#cookieStatus").textContent = "Lỗi: " + e.message;
  } finally {
    btn.disabled = false; btn.textContent = "Lưu & áp dụng";
  }
}

// ====== Quan ly kenh theo doi ======
$("#chAddBtn").addEventListener("click", addChannel);
$("#chValue").addEventListener("keydown", (e) => { if (e.key === "Enter") addChannel(); });

async function loadAccounts() {
  try {
    const list = await fetch("/api/accounts").then((r) => r.json());
    $("#chCount").textContent = list.length;
    const box = $("#chList");
    box.innerHTML = "";
    if (list.length === 0) {
      box.innerHTML = `<div class="hint" style="margin:0">Chưa có kênh nào. Dán link kênh ở trên để thêm.</div>`;
      return;
    }
    list.forEach((a) => {
      const chip = document.createElement("div");
      chip.className = "ch-item";
      const ref = a.secUserId ? "ID: " + a.secUserId.slice(0, 16) + "…" : esc(a.url || "");
      chip.innerHTML = `<span class="ch-info"><b>${esc(a.name)}</b><small>${ref}</small></span>
        <button class="iconbtn" title="Xóa kênh">🗑</button>`;
      chip.querySelector("button").addEventListener("click", () => removeChannel(a.key, a.name));
      box.appendChild(chip);
    });
  } catch {
    $("#chList").innerHTML = `<div class="hint" style="margin:0">Không tải được danh sách kênh.</div>`;
  }
}

async function addChannel() {
  const value = $("#chValue").value.trim();
  const name = $("#chName").value.trim();
  if (!value) return;
  const res = await fetch("/api/accounts", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ value, name }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error || "Không thêm được kênh"); return; }
  $("#chValue").value = "";
  $("#chName").value = "";
  $("#channelPanel").open = true;
  loadAccounts();
}

async function removeChannel(key, name) {
  if (!confirm(`Xóa kênh "${name}" khỏi danh sách theo dõi?`)) return;
  await fetch("/api/accounts/delete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key }),
  });
  loadAccounts();
}

async function scanTrends() {
  const status = $("#trendStatus");
  status.textContent = "Đang quét trend từ Douyin…";
  $("#trendGrid").innerHTML = "";
  try {
    const res = await fetch("/api/trends?limit=24");
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || "Lỗi quét trend");
    trends.length = 0;
    trends.push(...data);
    if (trends.length === 0) {
      status.innerHTML = "Không có video. Thêm kênh thật vào <code>data/accounts.json</code> rồi quét lại — hoặc dán link trực tiếp ở trên.";
    } else {
      status.textContent = `Tìm thấy ${trends.length} video đang hot. Tick chọn rồi bấm "Xử lý đã chọn".`;
    }
    renderGrid();
  } catch (e) {
    status.textContent = "Lỗi: " + e.message;
  }
}

function renderGrid() {
  const grid = $("#trendGrid");
  grid.innerHTML = "";
  trends.forEach((v) => {
    const key = v.shareUrl;
    const card = document.createElement("div");
    card.className = "card" + (selected.has(key) ? " sel" : "");
    card.innerHTML = `
      <div class="check">${selected.has(key) ? "✓" : ""}</div>
      <div class="thumb ${v.cover ? "" : "ph"}">${v.cover ? "" : "▶"}</div>
      <div class="meta">
        <div class="desc">${esc(v.desc) || "(không mô tả)"}</div>
        <div class="stats"><span>♥ ${fmt(v.stats.like)}</span><span>💬 ${fmt(v.stats.comment)}</span></div>
      </div>`;
    if (v.cover) {
      const t = card.querySelector(".thumb");
      t.style.backgroundImage = `url("${v.cover}")`;
    }
    card.addEventListener("click", () => toggleSelect(v));
    grid.appendChild(card);
  });
}

function toggleSelect(v) {
  const key = v.shareUrl;
  if (selected.has(key)) selected.delete(key);
  else selected.set(key, { url: v.shareUrl, title: v.desc });
  $("#selCount").textContent = selected.size;
  $("#processBtn").disabled = selected.size === 0;
  renderGrid();
}

async function addLink() {
  const url = $("#linkInput").value.trim();
  if (!url) return;
  await createJobs([{ url, title: "" }]);
  $("#linkInput").value = "";
  switchTab("jobs");
}

async function processSelected() {
  const items = [...selected.values()];
  if (items.length === 0) return;
  await createJobs(items);
  selected.clear();
  $("#selCount").textContent = "0";
  $("#processBtn").disabled = true;
  renderGrid();
  switchTab("jobs");
}

async function createJobs(items) {
  const res = await fetch("/api/jobs", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  const data = await res.json();
  if (!res.ok) { alert(data.error || "Lỗi tạo job"); return; }
  data.forEach((j) => jobs.set(j.id, j));
  renderJobs();
}

// ====== Jobs ======
async function loadJobs() {
  const res = await fetch("/api/jobs");
  const data = await res.json();
  data.forEach((j) => jobs.set(j.id, j));
  renderJobs();
}

function renderJobs() {
  const list = $("#jobList");
  const arr = [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
  $("#jobCount").textContent = arr.length;
  $("#jobEmpty").style.display = arr.length ? "none" : "block";
  list.innerHTML = "";
  arr.forEach((j) => list.appendChild(jobCard(j)));
  // Cap nhat nut "Go da chon"
  $("#jobSelCount").textContent = selectedJobs.size;
  $("#delSelBtn").disabled = selectedJobs.size === 0;
}

function jobCard(j) {
  const el = document.createElement("div");
  el.className = "job";
  let detail = STATUS_VI[j.status] || j.status;
  if ((j.status === "preparing" || j.status === "rendering") && j.stage) detail = STAGE_VI[j.stage] || j.stage;
  if (j.status === "error") detail = "Lỗi: " + (j.error || "");
  // Thanh tien trinh khi co dem (dich/long tieng)
  let bar = "";
  if (j.total) {
    const pct = Math.round((j.done / j.total) * 100);
    detail += ` (${j.done}/${j.total})`;
    bar = `<div class="bar"><div class="bar-fill" style="width:${pct}%"></div></div>`;
  } else if (j.status === "preparing" || j.status === "rendering") {
    bar = `<div class="bar"><div class="bar-fill indet"></div></div>`;
  }

  let right = "";
  if (j.status === "review") right = `<button class="primary" data-act="edit">Duyệt & sửa phụ đề</button>`;
  else if (j.status === "done") right = `<video src="${j.videoUrl}" controls></video>
     <a href="${j.videoUrl}" download><button class="secondary">⬇ Tải</button></a>` +
     (j.metaUrl ? `<button class="secondary" data-act="meta">📋 Tiêu đề/mô tả</button>` : "");
  else if (j.status === "error") right = `<button data-act="retry">Thử lại</button>` +
     (j.cookieHint ? `<button class="secondary" data-act="fixcookie">⚙️ Cập nhật cookie</button>` : "");

  el.innerHTML = `
    <input type="checkbox" class="jobchk" ${selectedJobs.has(j.id) ? "checked" : ""} title="Chọn để gỡ" />
    <div class="info">
      <div class="title">${esc(j.title)}</div>
      <div class="sub">${esc(detail)}${j.segments ? " · " + j.segments.length + " câu" : ""}</div>
      ${bar}
    </div>
    <span class="status ${j.status}">${STATUS_VI[j.status] || j.status}</span>
    <div class="actions">${right}<button class="iconbtn" data-act="del" title="Gỡ & xóa file">🗑</button></div>`;

  el.querySelector(".jobchk").addEventListener("change", (e) => {
    if (e.target.checked) selectedJobs.add(j.id);
    else selectedJobs.delete(j.id);
    $("#jobSelCount").textContent = selectedJobs.size;
    $("#delSelBtn").disabled = selectedJobs.size === 0;
  });
  const editBtn = el.querySelector('[data-act="edit"]');
  if (editBtn) editBtn.addEventListener("click", () => openEditor(j.id));
  const retryBtn = el.querySelector('[data-act="retry"]');
  if (retryBtn) retryBtn.addEventListener("click", () => createJobs([{ url: j.url, title: j.title }]));
  const metaBtn = el.querySelector('[data-act="meta"]');
  if (metaBtn) metaBtn.addEventListener("click", () => showMeta(j.metaUrl));
  const fixBtn = el.querySelector('[data-act="fixcookie"]');
  if (fixBtn) fixBtn.addEventListener("click", () => {
    switchTab("trends");
    const p = $("#settingsPanel");
    if (p) { p.open = true; p.scrollIntoView({ behavior: "smooth" }); }
    loadSettings();
  });
  el.querySelector('[data-act="del"]').addEventListener("click", () => deleteJobs([j.id], j.title));
  return el;
}

// Hien metadata (tieu de/mo ta/hashtag) + copy nhanh.
async function showMeta(url) {
  try {
    const m = await fetch(url).then((r) => r.json());
    const tags = (m.tags || []).map((t) => "#" + String(t).replace(/\s+/g, "")).join(" ");
    const text = `${m.title || ""}\n\n${m.description || ""}${tags ? "\n\n" + tags : ""}`.trim();
    try {
      await navigator.clipboard.writeText(text);
      alert("Đã copy tiêu đề + mô tả + hashtag vào clipboard:\n\n" + text);
    } catch {
      prompt("Tiêu đề / mô tả / hashtag (Ctrl+C để copy):", text);
    }
  } catch {
    alert("Không đọc được metadata.");
  }
}

// Go (xoa) job + file. Hoi xac nhan truoc.
async function deleteJobs(ids, label) {
  if (ids.length === 0) return;
  const msg = ids.length === 1
    ? `Gỡ "${label || ids[0]}" và xóa file của nó?`
    : `Gỡ ${ids.length} video đã chọn và xóa file của chúng?`;
  if (!confirm(msg)) return;
  await fetch("/api/jobs/delete", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ids }),
  });
  ids.forEach((id) => { jobs.delete(id); selectedJobs.delete(id); });
  renderJobs();
}

// ====== Editor ======
$("#editorClose").addEventListener("click", closeEditor);
$("#saveSegBtn").addEventListener("click", () => saveSegments(false));
$("#renderBtn").addEventListener("click", () => saveSegments(true));
$("#speedRange").addEventListener("input", (e) => {
  $("#speedVal").textContent = Number(e.target.value).toFixed(2) + "×";
});

// Nap danh sach giong doc vao dropdown.
async function loadVoices() {
  try {
    const d = await fetch("/api/voices").then((r) => r.json());
    const sel = $("#voiceSel");
    sel.innerHTML = "";
    (d.voices || []).forEach((v) => {
      const o = document.createElement("option");
      o.value = v;
      o.textContent = v.replace(/^vi_VN-/, "").replace(/^[a-z]{2}_[A-Z]{2}-/, ""); // gon ten
      if (v === d.default) o.selected = true;
      sel.appendChild(o);
    });
    if (d.defaultSpeed) {
      $("#speedRange").value = d.defaultSpeed;
      $("#speedVal").textContent = Number(d.defaultSpeed).toFixed(2) + "×";
    }
  } catch { /* bo qua */ }
}

let editSegs = []; // ban lam viec cua phu de (sua chu, timing, gop/tach)

function openEditor(id) {
  const job = jobs.get(id);
  if (!job || !job.segments) return;
  editorJobId = id;
  editSegs = job.segments.map((s) => ({ ...s })); // ban sao de sua thoai mai
  $("#editorTitle").textContent = job.title.slice(0, 60);
  renderSegRows();

  // Nap video nguon + dong bo phu de
  const v = $("#previewVideo");
  v.src = `/work/${id}/source.mp4`;
  $("#previewSub").textContent = "";
  v.ontimeupdate = syncSub; // gan = -> khong bi trung listener
  $("#editorModal").classList.remove("hidden");
}

// Ve lai toan bo hang tu editSegs (goi sau khi gop/tach).
function renderSegRows() {
  const box = $("#segEditor");
  box.innerHTML = "";
  editSegs.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "seg";
    row.dataset.row = i;
    row.innerHTML = `
      <div class="t">
        <input class="tnum" type="number" step="0.1" min="0" data-i="${i}" data-f="start" value="${(+s.start).toFixed(1)}" title="Bắt đầu (giây)" />
        <input class="tnum" type="number" step="0.1" min="0" data-i="${i}" data-f="end" value="${(+s.end).toFixed(1)}" title="Kết thúc (giây)" />
        <div class="rowbtns">
          <button class="seekbtn" data-i="${i}" title="Phát từ đây">▶</button>
          <button class="ttsbtn" data-i="${i}" title="Nghe thử">🔊</button>
          <button class="splitbtn" data-i="${i}" title="Tách làm 2 câu">✂</button>
          <button class="mergebtn" data-i="${i}" title="Gộp lên câu trên" ${i === 0 ? "disabled" : ""}>⬆</button>
        </div>
      </div>
      <div class="orig">${esc(s.text)}</div>
      <textarea data-i="${i}">${esc(s.translated || "")}</textarea>`;
    box.appendChild(row);
  });
  // Wiring (luu thay doi vao editSegs ngay)
  box.querySelectorAll("textarea").forEach((ta) =>
    ta.addEventListener("input", () => { editSegs[+ta.dataset.i].translated = ta.value; })
  );
  box.querySelectorAll(".tnum").forEach((inp) =>
    inp.addEventListener("change", () => {
      const v = parseFloat(inp.value);
      if (!Number.isNaN(v)) editSegs[+inp.dataset.i][inp.dataset.f] = v;
    })
  );
  box.querySelectorAll(".seekbtn").forEach((b) =>
    b.addEventListener("click", () => seekTo(editSegs[+b.dataset.i].start))
  );
  box.querySelectorAll(".ttsbtn").forEach((b) =>
    b.addEventListener("click", () => previewLine(+b.dataset.i, b))
  );
  box.querySelectorAll(".splitbtn").forEach((b) =>
    b.addEventListener("click", () => splitSeg(+b.dataset.i))
  );
  box.querySelectorAll(".mergebtn").forEach((b) =>
    b.addEventListener("click", () => mergeSeg(+b.dataset.i))
  );
}

// Tach 1 chuoi lam doi tai khoang trang gan giua nhat.
function splitText(t) {
  t = (t || "").trim();
  if (!t) return ["", ""];
  const mid = Math.floor(t.length / 2);
  let sp = t.lastIndexOf(" ", mid);
  if (sp <= 0) sp = t.indexOf(" ", mid);
  if (sp <= 0) sp = mid;
  return [t.slice(0, sp).trim(), t.slice(sp).trim()];
}

function splitSeg(i) {
  const s = editSegs[i];
  const mid = +(((+s.start) + (+s.end)) / 2).toFixed(2);
  const [t1, t2] = splitText(s.text);
  const [r1, r2] = splitText(s.translated);
  editSegs.splice(i, 1,
    { start: +s.start, end: mid, text: t1, translated: r1 },
    { start: mid, end: +s.end, text: t2, translated: r2 }
  );
  renderSegRows();
}

function mergeSeg(i) {
  if (i <= 0) return;
  const prev = editSegs[i - 1], cur = editSegs[i];
  prev.end = +cur.end;
  prev.text = (prev.text + " " + cur.text).replace(/\s+/g, " ").trim();
  prev.translated = ((prev.translated || "") + " " + (cur.translated || "")).replace(/\s+/g, " ").trim();
  editSegs.splice(i, 1);
  renderSegRows();
}

function seekTo(t) {
  const v = $("#previewVideo");
  v.currentTime = Math.max(0, t);
  v.play().catch(() => {});
}

function syncSub() {
  const t = $("#previewVideo").currentTime;
  let idx = -1;
  for (let i = 0; i < editSegs.length; i++) {
    const s = editSegs[i];
    if (t >= s.start && t <= (s.end > s.start ? s.end : s.start + 3)) { idx = i; break; }
  }
  $("#previewSub").textContent = idx >= 0 ? (editSegs[idx].translated || "") : "";
  $("#segEditor").querySelectorAll(".seg").forEach((r) =>
    r.classList.toggle("playing", Number(r.dataset.row) === idx)
  );
}

async function previewLine(i, btn) {
  const text = (editSegs[i].translated || "").trim();
  if (!text) return;
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = "⏳";
  try {
    const res = await fetch("/api/tts-preview", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text, voice: $("#voiceSel").value, speed: Number($("#speedRange").value) }),
    });
    const d = await res.json();
    if (!res.ok) throw new Error(d.error || "Lỗi");
    await new Audio(d.url).play();
  } catch (e) {
    alert("Nghe thử lỗi: " + e.message);
  } finally {
    btn.disabled = false; btn.textContent = old;
  }
}

function closeEditor() {
  const v = $("#previewVideo");
  v.pause();
  v.ontimeupdate = null;
  v.removeAttribute("src");
  v.load();
  $("#previewSub").textContent = "";
  $("#editorModal").classList.add("hidden");
  editorJobId = null;
}

// Tra ve ban phu de hien tai (sap xep theo thoi gian de an toan).
function collectSegments() {
  return editSegs
    .map((s) => ({ start: +s.start, end: +s.end, text: s.text, translated: s.translated }))
    .sort((a, b) => a.start - b.start);
}
async function saveSegments(thenRender) {
  const id = editorJobId;
  const segments = collectSegments();
  if (thenRender) {
    await fetch(`/api/jobs/${id}/render`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments, voice: $("#voiceSel").value, speed: Number($("#speedRange").value) }),
    });
    closeEditor();
    switchTab("jobs");
  } else {
    await fetch(`/api/jobs/${id}/segments`, {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments }),
    });
    const btn = $("#saveSegBtn");
    btn.textContent = "Đã lưu ✓";
    setTimeout(() => (btn.textContent = "Lưu nháp"), 1200);
  }
}

// ====== SSE live updates ======
function connectSSE() {
  const es = new EventSource("/api/events");
  es.onmessage = (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.type === "job") {
      jobs.set(msg.job.id, msg.job);
      renderJobs();
    } else if (msg.type === "delete") {
      jobs.delete(msg.id);
      selectedJobs.delete(msg.id);
      renderJobs();
    }
  };
  es.onerror = () => { /* tu dong reconnect */ };
}

// ====== Nut "Go da chon" ======
$("#delSelBtn").addEventListener("click", () => deleteJobs([...selectedJobs]));

// ====== Init ======
loadJobs();
loadAccounts();
loadSettings();
loadVoices();
connectSSE();
