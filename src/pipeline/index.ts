// Orchestrator: long tieng + sub 1 video tu link Douyin, end-to-end.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG, DIRS, ensureDirs } from "../config.js";
import { log } from "../util/log.js";
import { downloadVideo } from "./download.js";
import { transcribe } from "./transcribe.js";
import { translateSegments } from "./translate.js";
import { buildSrt } from "./subtitle.js";
import { synthDubTrack } from "./tts.js";
import { mux } from "./mux.js";
import type { DubResult, Segment } from "./types.js";

function deriveId(url: string): string {
  const m = url.match(/(\d{8,})/);
  // Id on dinh theo url -> chay lai dung lai work dir & cache (resumable)
  return m ? m[1] : `vid_${crypto.createHash("md5").update(url).digest("hex").slice(0, 12)}`;
}

// Doc cache JSON neu co.
function readCache<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

export async function dubVideo(url: string): Promise<DubResult> {
  ensureDirs();
  const awemeId = deriveId(url);
  const workDir = path.join(DIRS.work, awemeId);
  fs.mkdirSync(workDir, { recursive: true });
  log.info(`=== Bat dau xu ly video ${awemeId} ===`);

  // 1. Tai
  const sourceVideo = await downloadVideo(url, workDir);

  // 2. Chep loi (ASR) - cache lai de chay lai khoi nghe lai
  const transcriptCache = path.join(workDir, "transcript.json");
  let rawSegments = readCache<Segment[]>(transcriptCache);
  if (rawSegments) {
    log.ok(`Dung lai transcript da cache (${rawSegments.length} doan)`);
  } else {
    rawSegments = await transcribe(sourceVideo);
    fs.writeFileSync(transcriptCache, JSON.stringify(rawSegments, null, 2));
  }
  if (rawSegments.length === 0) {
    log.warn("Khong nghe duoc loi noi nao (video co the khong co thoai).");
  }

  // 3. Dich - cache theo engine + model (doi engine/model khong dung lai cache cu)
  const cacheKey =
    CONFIG.TRANSLATE_ENGINE === "ollama"
      ? `ollama.${CONFIG.OLLAMA_MODEL.replace(/[^a-z0-9]+/gi, "_")}`
      : CONFIG.TRANSLATE_ENGINE;
  const translateCache = path.join(workDir, `translated.${cacheKey}.json`);
  let segments = readCache<Segment[]>(translateCache);
  if (segments) {
    log.ok(`Dung lai ban dich da cache (${segments.length} doan)`);
  } else {
    segments = await translateSegments(rawSegments);
    fs.writeFileSync(translateCache, JSON.stringify(segments, null, 2));
  }

  // 4. Phu de
  const srtPath = path.join(workDir, `${awemeId}.srt`);
  buildSrt(segments, srtPath);

  // 5. Long tieng
  const dubWav = await synthDubTrack(segments, workDir);

  // 6. Ghep -> output
  const outPath = path.join(DIRS.output, `${awemeId}.mp4`);
  await mux({ sourceVideo, dubWav, srtPath, workDir, outPath });

  log.ok(`=== Hoan tat: ${outPath} ===`);
  return { awemeId, videoPath: outPath, srtPath, segments };
}
