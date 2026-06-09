// Orchestrator: long tieng + sub 1 video tu link Douyin, end-to-end.
import fs from "node:fs";
import path from "node:path";
import { DIRS, ensureDirs } from "../config.js";
import { log } from "../util/log.js";
import { downloadVideo } from "./download.js";
import { transcribe } from "./transcribe.js";
import { translateSegments } from "./translate.js";
import { buildSrt } from "./subtitle.js";
import { synthDubTrack } from "./tts.js";
import { mux } from "./mux.js";
import type { DubResult } from "./types.js";

function deriveId(url: string): string {
  const m = url.match(/(\d{8,})/);
  return m ? m[1] : `vid_${Date.now()}`;
}

export async function dubVideo(url: string): Promise<DubResult> {
  ensureDirs();
  const awemeId = deriveId(url);
  const workDir = path.join(DIRS.work, awemeId);
  fs.mkdirSync(workDir, { recursive: true });
  log.info(`=== Bat dau xu ly video ${awemeId} ===`);

  // 1. Tai
  const sourceVideo = await downloadVideo(url, workDir);

  // 2. Chep loi (ASR)
  const rawSegments = await transcribe(sourceVideo);
  if (rawSegments.length === 0) {
    log.warn("Khong nghe duoc loi noi nao (video co the khong co thoai).");
  }

  // 3. Dich
  const segments = await translateSegments(rawSegments);

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
