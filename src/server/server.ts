// Web server: phuc vu frontend, API trends/jobs, SSE tien do, va file video output.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { ROOT, DIRS, ensureDirs } from "../config.js";
import { log } from "../util/log.js";
import { synth, piperReady } from "../util/piper.js";
import { getTrends } from "../trends/index.js";
import { listAccounts, addAccount, removeAccount } from "./accounts.js";
import { setDouyinCookie, getDouyinCookie, cookieSource } from "./settings.js";
import {
  ensureDouyinApi,
  stopDouyinApi,
  restartDouyinApi,
  douyinApiInstalled,
  checkDouyinCookieAlive,
} from "./douyinSidecar.js";
import {
  createJob,
  renderJob,
  updateSegments,
  deleteJob,
  listJobs,
  getJob,
  jobEvents,
  type Job,
} from "./jobs.js";

const PORT = Number(process.env.PORT) || 5173;

export function startServer(): void {
  ensureDirs();
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // --- Trends ---
  app.get("/api/trends", async (req, res) => {
    try {
      const limit = Number(req.query.limit) || 20;
      const vids = await getTrends(limit);
      res.json(vids);
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // --- Cai dat (cookie Douyin) — de khong phai sua .env tay ---
  // Tra ve token DAY DU de UI dien san (cong cu noi bo, localhost).
  app.get("/api/settings", (_req, res) => {
    const cookie = getDouyinCookie();
    res.json({
      source: cookieSource(), // settings | env | none
      hasCookie: cookie.length > 0,
      cookie, // gia tri day du de dien vao o (khoa lai khi con song)
      apiInstalled: douyinApiInstalled(),
    });
  });

  // Kiem tra token con song hay het han (test that vao Douyin API).
  app.get("/api/settings/check", async (_req, res) => {
    const hasCookie = getDouyinCookie().length > 0;
    if (!hasCookie) return res.json({ hasCookie: false, tested: true, alive: false });
    const { tested, alive } = await checkDouyinCookieAlive();
    res.json({ hasCookie: true, tested, alive });
  });

  app.post("/api/settings", async (req, res) => {
    try {
      setDouyinCookie(String(req.body?.douyinCookie ?? ""));
      const apiUp = await restartDouyinApi(); // nap cookie moi vao API self-host
      res.json({
        ok: true,
        source: cookieSource(),
        hasCookie: getDouyinCookie().length > 0,
        apiInstalled: douyinApiInstalled(),
        apiUp,
      });
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // --- Quan ly kenh theo doi (ghi data/accounts.json) ---
  app.get("/api/accounts", (_req, res) => res.json(listAccounts()));
  app.post("/api/accounts", (req, res) => {
    try {
      const acc = addAccount(String(req.body?.value ?? ""), String(req.body?.name ?? ""));
      res.json(acc);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });
  app.post("/api/accounts/delete", (req, res) => {
    removeAccount(String(req.body?.key ?? ""));
    res.json({ ok: true });
  });

  // --- Tao job (1 hoac nhieu) -> chay pha chuan bi ---
  app.post("/api/jobs", (req, res) => {
    const items: { url: string; title?: string }[] = Array.isArray(req.body?.items)
      ? req.body.items
      : req.body?.url
        ? [{ url: req.body.url, title: req.body.title }]
        : [];
    if (items.length === 0) return res.status(400).json({ error: "Thieu url" });
    const created = items.map((it) => createJob(it.url, it.title ?? ""));
    res.json(created);
  });

  // --- Danh sach / chi tiet job ---
  app.get("/api/jobs", (_req, res) => res.json(listJobs()));
  app.get("/api/jobs/:id", (req, res) => {
    const job = getJob(req.params.id);
    if (!job) return res.status(404).json({ error: "Khong co job" });
    res.json(job);
  });

  // --- Luu phu de da sua (khong render) ---
  app.put("/api/jobs/:id/segments", (req, res) => {
    try {
      const job = updateSegments(req.params.id, req.body?.segments ?? []);
      res.json(job);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // --- Xoa nhieu job (kem file) --- (dat truoc :id de khong bi nuot)
  app.post("/api/jobs/delete", (req, res) => {
    const ids: string[] = Array.isArray(req.body?.ids) ? req.body.ids : [];
    for (const id of ids) deleteJob(id);
    res.json({ deleted: ids.length });
  });

  // --- Xoa 1 job (kem file) ---
  app.delete("/api/jobs/:id", (req, res) => {
    deleteJob(req.params.id);
    res.json({ ok: true });
  });

  // --- Render job (kem phu de da sua neu co) ---
  app.post("/api/jobs/:id/render", (req, res) => {
    try {
      const job = renderJob(req.params.id, req.body?.segments);
      res.json(job);
    } catch (e) {
      res.status(400).json({ error: (e as Error).message });
    }
  });

  // --- SSE: stream moi cap nhat job ---
  app.get("/api/events", (req, res) => {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });
    res.write(`data: ${JSON.stringify({ type: "hello" })}\n\n`);
    const onUpdate = (job: Job) => {
      res.write(`data: ${JSON.stringify({ type: "job", job })}\n\n`);
    };
    const onDelete = (id: string) => {
      res.write(`data: ${JSON.stringify({ type: "delete", id })}\n\n`);
    };
    jobEvents.on("update", onUpdate);
    jobEvents.on("delete", onDelete);
    const ping = setInterval(() => res.write(": ping\n\n"), 20000);
    req.on("close", () => {
      clearInterval(ping);
      jobEvents.off("update", onUpdate);
      jobEvents.off("delete", onDelete);
    });
  });

  // --- Nghe thu 1 cau (synth Piper) — dung trong man duyet phu de ---
  app.post("/api/tts-preview", async (req, res) => {
    try {
      const text = String(req.body?.text ?? "").trim();
      if (!text) return res.status(400).json({ error: "Thieu text" });
      if (!piperReady()) return res.status(400).json({ error: "Piper chua san sang (chay npm run setup)" });
      const dir = path.join(DIRS.work, "_preview");
      fs.mkdirSync(dir, { recursive: true });
      const hash = crypto.createHash("md5").update(text).digest("hex").slice(0, 12);
      const wav = path.join(dir, `${hash}.wav`);
      if (!fs.existsSync(wav)) await synth(text, wav);
      res.json({ url: `/work/_preview/${hash}.wav` });
    } catch (e) {
      res.status(500).json({ error: (e as Error).message });
    }
  });

  // --- File tinh: video output + nguon (de xem truoc trong editor) + frontend ---
  app.use("/output", express.static(DIRS.output));
  app.use("/work", express.static(DIRS.work)); // phuc vu work/<id>/source.mp4 + _preview
  app.use(express.static(path.join(ROOT, "public")));

  app.listen(PORT, async () => {
    log.ok(`Web chay tai: http://localhost:${PORT}`);
    // Tu bat API Douyin self-host (tai video on dinh, khong can cookies)
    await ensureDouyinApi();
  });

  // Dung API Douyin khi tat server
  const cleanup = () => { stopDouyinApi(); process.exit(0); };
  process.on("SIGINT", cleanup);
  process.on("SIGTERM", cleanup);
}

startServer();
