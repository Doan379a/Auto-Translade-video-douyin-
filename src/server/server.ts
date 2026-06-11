// Web server: phuc vu frontend, API trends/jobs, SSE tien do, va file video output.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import express from "express";
import { ROOT, DIRS, ensureDirs } from "../config.js";
import { log } from "../util/log.js";
import { synth, piperReady, listVoices } from "../util/piper.js";
import { CONFIG } from "../config.js";
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

// Request co phai tu chinh may chu (localhost) khong.
function isLocalReq(req: express.Request): boolean {
  const ip = req.socket.remoteAddress || "";
  return ip === "127.0.0.1" || ip === "::1" || ip === "::ffff:127.0.0.1";
}

export function startServer(): void {
  ensureDirs();
  const app = express();
  app.use(express.json({ limit: "5mb" }));

  // --- Bao ve bang mat khau khi mo ra LAN (localhost luon duoc mien) ---
  if (CONFIG.WEB_PASSWORD) {
    log.info("Web duoc bao ve bang mat khau (WEB_PASSWORD) cho truy cap tu xa.");
    app.use((req, res, next) => {
      if (isLocalReq(req)) return next();
      const m = (req.headers.authorization || "").match(/^Basic (.+)$/);
      if (m) {
        const pass = Buffer.from(m[1], "base64").toString().split(":").slice(1).join(":");
        if (pass === CONFIG.WEB_PASSWORD) return next();
      }
      res.set("WWW-Authenticate", 'Basic realm="trend-dub"').status(401).send("Can mat khau");
    });
  }

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
  // Chi tra cookie DAY DU khi truy cap tu localhost (may chu). Tu xa -> an de khong lo.
  app.get("/api/settings", (req, res) => {
    const cookie = getDouyinCookie();
    const local = isLocalReq(req);
    res.json({
      source: cookieSource(), // settings | env | none
      hasCookie: cookie.length > 0,
      cookie: local ? cookie : "", // chi dien san khi o may chu
      cookieHidden: !local && cookie.length > 0, // tu xa: co cookie nhung an
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
      const voice = req.body?.voice ? String(req.body.voice) : undefined;
      const speed = Number(req.body?.speed) > 0 ? Number(req.body.speed) : undefined;
      const job = renderJob(req.params.id, req.body?.segments, { voice, speed });
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

  // --- Danh sach giong doc da cai + giong mac dinh ---
  app.get("/api/voices", (_req, res) => {
    res.json({ voices: listVoices(), default: CONFIG.PIPER_VOICE, defaultSpeed: CONFIG.DUB_SPEED });
  });

  // --- Nghe thu 1 cau (synth Piper) — dung trong man duyet phu de ---
  app.post("/api/tts-preview", async (req, res) => {
    try {
      const text = String(req.body?.text ?? "").trim();
      if (!text) return res.status(400).json({ error: "Thieu text" });
      if (!piperReady()) return res.status(400).json({ error: "Piper chua san sang (chay npm run setup)" });
      const voice = req.body?.voice ? String(req.body.voice) : undefined;
      const speed = Number(req.body?.speed) > 0 ? Number(req.body.speed) : 1.0;
      const dir = path.join(DIRS.work, "_preview");
      fs.mkdirSync(dir, { recursive: true });
      const key = `${voice ?? "def"}|${speed}|${text}`;
      const hash = crypto.createHash("md5").update(key).digest("hex").slice(0, 12);
      const wav = path.join(dir, `${hash}.wav`);
      if (!fs.existsSync(wav)) await synth(text, wav, { voice, lengthScale: 1 / speed });
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
