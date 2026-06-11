// Quan ly job (in-memory) + hang doi xu ly tuan tu (1 viec/lan tranh qua tai CPU).
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { prepareVideo, renderVideo, deriveId } from "../pipeline/index.js";
import { DIRS, ROOT } from "../config.js";
import { log } from "../util/log.js";
import { checkDouyinCookieAlive } from "./douyinSidecar.js";
import type { Segment } from "../pipeline/types.js";

export type JobStatus =
  | "queued"
  | "preparing"
  | "review" // da co phu de, cho user duyet/sua
  | "rendering"
  | "done"
  | "error";

export interface Job {
  id: string; // = awemeId
  url: string;
  title: string;
  status: JobStatus;
  stage?: string; // buoc hien tai trong pipeline
  done?: number; // tien do trong buoc (vd cau da dich)
  total?: number;
  segments?: Segment[];
  videoUrl?: string;
  metaUrl?: string; // /output/<id>.meta.json neu co
  srtUrl?: string; // /output/<id>.srt neu co
  thumbUrl?: string; // /output/<id>.jpg (anh bia) neu co
  error?: string;
  cookieHint?: boolean; // loi co kha nang do cookie Douyin het han
  voice?: string; // giong doc da chon
  speed?: number; // toc do doc da chon
  targetLang?: string; // ngon ngu dau ra da chon
  createdAt: number;
}

export const jobEvents = new EventEmitter();
const jobs = new Map<string, Job>();

// --- Luu job ra dia de KHONG mat danh sach khi restart server ---
const JOBS_FILE = path.join(ROOT, "data", "jobs.json");
let persistTimer: ReturnType<typeof setTimeout> | null = null;
function persist(): void {
  if (persistTimer) return; // gom nhieu thay doi gan nhau thanh 1 lan ghi
  persistTimer = setTimeout(() => {
    persistTimer = null;
    try {
      fs.mkdirSync(path.dirname(JOBS_FILE), { recursive: true });
      fs.writeFileSync(JOBS_FILE, JSON.stringify([...jobs.values()], null, 2));
    } catch (e) {
      log.warn(`Khong luu duoc jobs.json: ${(e as Error).message}`);
    }
  }, 500);
}

function emit(job: Job): void {
  jobEvents.emit("update", job);
  persist();
}

// Nap lai job da luu + quet output/ khi khoi dong (chay 1 lan luc import module).
function loadPersisted(): void {
  // 1. Tu data/jobs.json
  try {
    if (fs.existsSync(JOBS_FILE)) {
      const arr: Job[] = JSON.parse(fs.readFileSync(JOBS_FILE, "utf8"));
      for (const j of arr) {
        // Job dang chay luc tat server -> da bi gian doan
        if (j.status === "queued" || j.status === "preparing" || j.status === "rendering") {
          if (j.segments && j.segments.length) {
            j.status = "review"; // da co phu de -> cho duyet/render lai
          } else {
            j.status = "error";
            j.error = "Bi gian doan khi khoi dong lai server — bam Thu lai";
          }
          j.stage = undefined;
          j.done = undefined;
          j.total = undefined;
        }
        // Job done nhung file video khong con
        if (j.status === "done" && !fs.existsSync(path.join(DIRS.output, `${j.id}.mp4`))) {
          j.status = "error";
          j.error = "File video khong con trong output/";
          j.videoUrl = undefined;
        }
        jobs.set(j.id, j);
      }
    }
  } catch (e) {
    log.warn(`Khong doc duoc jobs.json: ${(e as Error).message}`);
  }

  // 2. Quet output/ -> them video cu chua co trong danh sach
  try {
    if (fs.existsSync(DIRS.output)) {
      for (const f of fs.readdirSync(DIRS.output)) {
        if (!f.endsWith(".mp4")) continue;
        const id = f.replace(/\.mp4$/, "");
        if (jobs.has(id)) continue;
        const metaExists = fs.existsSync(path.join(DIRS.output, `${id}.meta.json`));
        const srtExists = fs.existsSync(path.join(DIRS.output, `${id}.srt`));
        const thumbExists = fs.existsSync(path.join(DIRS.output, `${id}.jpg`));
        const stat = fs.statSync(path.join(DIRS.output, f));
        jobs.set(id, {
          id,
          url: "",
          title: id,
          status: "done",
          videoUrl: `/output/${id}.mp4`,
          metaUrl: metaExists ? `/output/${id}.meta.json` : undefined,
          srtUrl: srtExists ? `/output/${id}.srt` : undefined,
          thumbUrl: thumbExists ? `/output/${id}.jpg` : undefined,
          createdAt: stat.mtimeMs,
        });
      }
    }
  } catch (e) {
    log.warn(`Khong quet duoc output/: ${(e as Error).message}`);
  }
}
loadPersisted();

export function listJobs(): Job[] {
  return [...jobs.values()].sort((a, b) => b.createdAt - a.createdAt);
}
export function getJob(id: string): Job | undefined {
  return jobs.get(id);
}

// --- Hang doi tuan tu ---
type Task = () => Promise<void>;
const queue: Task[] = [];
let running = false;
async function pump(): Promise<void> {
  if (running) return;
  running = true;
  while (queue.length) {
    const task = queue.shift()!;
    try {
      await task();
    } catch (e) {
      log.err(`Job task loi: ${(e as Error).message}`);
    }
  }
  running = false;
}
function enqueue(task: Task): void {
  queue.push(task);
  void pump();
}

// Tao job tu 1 video -> chay pha CHUAN BI (tai/chep/dich) roi cho duyet.
export function createJob(url: string, title = "", opts: { targetLang?: string } = {}): Job {
  const id = deriveId(url);
  let job = jobs.get(id);
  if (job && (job.status === "preparing" || job.status === "rendering")) {
    return job; // dang chay roi
  }
  job = {
    id,
    url,
    title: title || url,
    status: "queued",
    targetLang: opts.targetLang,
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  emit(job);

  enqueue(async () => {
    const j = jobs.get(id)!;
    j.status = "preparing";
    emit(j);
    try {
      const prepared = await prepareVideo(
        url,
        (p) => {
          j.stage = p.stage;
          j.done = p.done;
          j.total = p.total;
          emit(j);
        },
        { targetLang: j.targetLang }
      );
      j.segments = prepared.segments;
      j.status = "review";
      j.stage = undefined;
      j.done = undefined;
      j.total = undefined;
      emit(j);
    } catch (e) {
      j.status = "error";
      j.error = (e as Error).message;
      // Neu loi o buoc tai -> kiem tra cookie that de bao chinh xac (het han hay khong).
      const isDownloadErr =
        j.stage === "download" || /tai duoc video|bi chan|HTTP 4\d\d|qua nho|sec_user_id/i.test(j.error);
      if (isDownloadErr) {
        try {
          const { tested, alive } = await checkDouyinCookieAlive();
          if (tested && !alive) {
            j.cookieHint = true;
            j.error = "Cookie Douyin hết hạn / không dùng được — cập nhật ở mục Cài đặt rồi bấm Thử lại.";
          }
        } catch {
          /* khong kiem tra duoc -> giu loi goc */
        }
      }
      j.stage = undefined;
      emit(j);
    }
  });
  return job;
}

// Render job (sau khi duyet). segments co the la ban da sua.
export function renderJob(
  id: string,
  segments?: Segment[],
  opts?: { voice?: string; speed?: number }
): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Khong co job ${id}`);
  if (segments) job.segments = segments;
  if (!job.segments) throw new Error(`Job ${id} chua co phu de de render`);
  if (opts?.voice) job.voice = opts.voice;
  if (opts?.speed) job.speed = opts.speed;
  job.status = "queued";
  emit(job);

  enqueue(async () => {
    const j = jobs.get(id)!;
    j.status = "rendering";
    emit(j);
    try {
      const result = await renderVideo(
        id,
        j.segments!,
        (p) => {
          j.stage = p.stage;
          j.done = p.done;
          j.total = p.total;
          emit(j);
        },
        { voice: j.voice, speed: j.speed, targetLang: j.targetLang }
      );
      j.status = "done";
      j.stage = undefined;
      j.done = undefined;
      j.total = undefined;
      j.videoUrl = `/output/${id}.mp4`;
      if (result.metaPath) j.metaUrl = `/output/${id}.meta.json`;
      if (fs.existsSync(path.join(DIRS.output, `${id}.srt`))) j.srtUrl = `/output/${id}.srt`;
      if (fs.existsSync(path.join(DIRS.output, `${id}.jpg`))) j.thumbUrl = `/output/${id}.jpg`;
      emit(j);
    } catch (e) {
      j.status = "error";
      j.error = (e as Error).message;
      emit(j);
    }
  });
  return job;
}

// Xoa job + toan bo file cua no (work/<id> + output/<id>.mp4).
export function deleteJob(id: string): void {
  jobs.delete(id);
  fs.rmSync(path.join(DIRS.work, id), { recursive: true, force: true });
  fs.rmSync(path.join(DIRS.output, `${id}.mp4`), { force: true });
  fs.rmSync(path.join(DIRS.output, `${id}.meta.json`), { force: true });
  fs.rmSync(path.join(DIRS.output, `${id}.srt`), { force: true });
  fs.rmSync(path.join(DIRS.output, `${id}.jpg`), { force: true });
  jobEvents.emit("delete", id);
  persist();
  log.ok(`Da xoa job + file: ${id}`);
}

// --- Dung luong ---
function dirSize(dir: string): number {
  let total = 0;
  if (!fs.existsSync(dir)) return 0;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    try {
      total += e.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    } catch {
      /* bo qua file loi */
    }
  }
  return total;
}

export function storageInfo(): { work: number; output: number } {
  return { work: dirSize(DIRS.work), output: dirSize(DIRS.output) };
}

// Don work/ (file tam) + tuy chon output/ (video da xuat). Tra ve so byte da giai phong.
export function cleanStorage(opts: { output?: boolean } = {}): { workFreed: number; outputFreed: number } {
  if ([...jobs.values()].some((j) => j.status === "preparing" || j.status === "rendering")) {
    throw new Error("Đang có job chạy — đợi xong rồi dọn.");
  }
  const workFreed = dirSize(DIRS.work);
  if (fs.existsSync(DIRS.work)) {
    for (const d of fs.readdirSync(DIRS.work)) {
      fs.rmSync(path.join(DIRS.work, d), { recursive: true, force: true });
    }
  }
  let outputFreed = 0;
  if (opts.output) {
    outputFreed = dirSize(DIRS.output);
    if (fs.existsSync(DIRS.output)) {
      for (const f of fs.readdirSync(DIRS.output)) {
        fs.rmSync(path.join(DIRS.output, f), { force: true });
      }
    }
    // Video da xoa -> bo cac job "done" khoi danh sach
    for (const j of [...jobs.values()]) {
      if (j.status === "done") {
        jobs.delete(j.id);
        jobEvents.emit("delete", j.id);
      }
    }
    persist();
  }
  return { workFreed, outputFreed };
}

// Luu phu de da sua (khong render).
export function updateSegments(id: string, segments: Segment[]): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Khong co job ${id}`);
  job.segments = segments;
  emit(job);
  return job;
}
