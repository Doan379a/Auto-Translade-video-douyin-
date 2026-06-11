// Quan ly job (in-memory) + hang doi xu ly tuan tu (1 viec/lan tranh qua tai CPU).
import { EventEmitter } from "node:events";
import fs from "node:fs";
import path from "node:path";
import { prepareVideo, renderVideo, deriveId } from "../pipeline/index.js";
import { DIRS } from "../config.js";
import { log } from "../util/log.js";
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
  error?: string;
  createdAt: number;
}

export const jobEvents = new EventEmitter();
const jobs = new Map<string, Job>();

function emit(job: Job): void {
  jobEvents.emit("update", job);
}

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
export function createJob(url: string, title = ""): Job {
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
    createdAt: Date.now(),
  };
  jobs.set(id, job);
  emit(job);

  enqueue(async () => {
    const j = jobs.get(id)!;
    j.status = "preparing";
    emit(j);
    try {
      const prepared = await prepareVideo(url, (p) => {
        j.stage = p.stage;
        j.done = p.done;
        j.total = p.total;
        emit(j);
      });
      j.segments = prepared.segments;
      j.status = "review";
      j.stage = undefined;
      j.done = undefined;
      j.total = undefined;
      emit(j);
    } catch (e) {
      j.status = "error";
      j.error = (e as Error).message;
      emit(j);
    }
  });
  return job;
}

// Render job (sau khi duyet). segments co the la ban da sua.
export function renderJob(id: string, segments?: Segment[]): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Khong co job ${id}`);
  if (segments) job.segments = segments;
  if (!job.segments) throw new Error(`Job ${id} chua co phu de de render`);
  job.status = "queued";
  emit(job);

  enqueue(async () => {
    const j = jobs.get(id)!;
    j.status = "rendering";
    emit(j);
    try {
      const result = await renderVideo(id, j.segments!, (p) => {
        j.stage = p.stage;
        j.done = p.done;
        j.total = p.total;
        emit(j);
      });
      j.status = "done";
      j.stage = undefined;
      j.done = undefined;
      j.total = undefined;
      j.videoUrl = `/output/${id}.mp4`;
      if (result.metaPath) j.metaUrl = `/output/${id}.meta.json`;
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
  jobEvents.emit("delete", id);
  log.ok(`Da xoa job + file: ${id}`);
}

// Luu phu de da sua (khong render).
export function updateSegments(id: string, segments: Segment[]): Job {
  const job = jobs.get(id);
  if (!job) throw new Error(`Khong co job ${id}`);
  job.segments = segments;
  emit(job);
  return job;
}
