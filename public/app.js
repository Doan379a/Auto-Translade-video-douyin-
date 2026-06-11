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
  else if (j.status === "error") right = `<button data-act="retry">Thử lại</button>`;

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

function openEditor(id) {
  const job = jobs.get(id);
  if (!job || !job.segments) return;
  editorJobId = id;
  $("#editorTitle").textContent = job.title.slice(0, 60);
  const box = $("#segEditor");
  box.innerHTML = "";
  job.segments.forEach((s, i) => {
    const row = document.createElement("div");
    row.className = "seg";
    row.innerHTML = `
      <div class="t">${s.start.toFixed(1)}s</div>
      <div class="orig">${esc(s.text)}</div>
      <textarea data-i="${i}">${esc(s.translated || "")}</textarea>`;
    box.appendChild(row);
  });
  $("#editorModal").classList.remove("hidden");
}
function closeEditor() {
  $("#editorModal").classList.add("hidden");
  editorJobId = null;
}
function collectSegments() {
  const job = jobs.get(editorJobId);
  const segs = job.segments.map((s) => ({ ...s }));
  $("#segEditor").querySelectorAll("textarea").forEach((ta) => {
    segs[Number(ta.dataset.i)].translated = ta.value;
  });
  return segs;
}
async function saveSegments(thenRender) {
  const id = editorJobId;
  const segments = collectSegments();
  if (thenRender) {
    await fetch(`/api/jobs/${id}/render`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ segments }),
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
connectSSE();
