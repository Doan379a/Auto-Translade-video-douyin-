// Orchestrator: tach 2 pha de web co the chen buoc DUYET/SUA phu de o giua.
//   prepareVideo: tai -> chep loi -> dich   (ra segments de duyet)
//   renderVideo : phu de -> long tieng -> ghep (sau khi user da sua)
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { CONFIG, DIRS, ensureDirs } from "../config.js";
import { log } from "../util/log.js";
import { downloadVideo } from "./download.js";
import { transcribe } from "./transcribe.js";
import { mergeSegments } from "./merge.js";
import { translateSegments } from "./translate.js";

// Doi khi sua logic (gop doan...) -> tang de bo cache cu khong con dung.
const PIPE_VERSION = "v2";
import { buildSrt } from "./subtitle.js";
import { synthDubTrack } from "./tts.js";
import { separateBgm } from "./bgm.js";
import { generateMetadata } from "./metadata.js";
import { generateThumbnail } from "./thumbnail.js";
import { mux } from "./mux.js";
import type { DubResult, Segment } from "./types.js";

// Callback bao tien do cho web (SSE).
export interface Progress {
  stage: string; // download | transcribe | translate | subtitle | bgm | tts | mux | metadata
  done?: number; // so muc da xong (vd cau da dich)
  total?: number; // tong so muc
}
export type OnProgress = (p: Progress) => void;
const noop: OnProgress = () => {};

export function deriveId(url: string): string {
  const m = url.match(/(\d{8,})/);
  return m ? m[1] : `vid_${crypto.createHash("md5").update(url).digest("hex").slice(0, 12)}`;
}

function readCache<T>(file: string): T | null {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function translateCacheKey(targetLang: string): string {
  const eng =
    CONFIG.TRANSLATE_ENGINE === "ollama"
      ? `ollama.${CONFIG.OLLAMA_MODEL.replace(/[^a-z0-9]+/gi, "_")}`
      : CONFIG.TRANSLATE_ENGINE;
  return `${eng}.${targetLang}`; // tach cache theo ngon ngu dich
}

export interface PreparedVideo {
  awemeId: string;
  workDir: string;
  sourceVideo: string;
  segments: Segment[];
}

export interface PrepareOptions {
  targetLang?: string; // ngon ngu dich (mac dinh CONFIG.TARGET_LANG)
}

// PHA 1: tai + chep loi + dich. Tat ca deu cache de chay lai nhanh.
export async function prepareVideo(
  url: string,
  onProgress: OnProgress = noop,
  opts: PrepareOptions = {}
): Promise<PreparedVideo> {
  ensureDirs();
  const targetLang = opts.targetLang || CONFIG.TARGET_LANG;
  const awemeId = deriveId(url);
  const workDir = path.join(DIRS.work, awemeId);
  fs.mkdirSync(workDir, { recursive: true });
  log.info(`=== Chuan bi video ${awemeId} ===`);

  onProgress({ stage: "download" });
  const sourceVideo = await downloadVideo(url, workDir);

  onProgress({ stage: "transcribe" });
  const transcriptCache = path.join(workDir, "transcript.json");
  let rawSegments = readCache<Segment[]>(transcriptCache);
  if (rawSegments) {
    log.ok(`Dung lai transcript da cache (${rawSegments.length} doan)`);
  } else {
    rawSegments = await transcribe(sourceVideo);
    fs.writeFileSync(transcriptCache, JSON.stringify(rawSegments, null, 2));
  }

  // Gop cac doan vun -> dich co ngu canh hon, long tieng do bi chong
  const mergedSegments = mergeSegments(rawSegments);
  log.ok(`Gop doan: ${rawSegments.length} -> ${mergedSegments.length}`);

  onProgress({ stage: "translate" });
  const translateCache = path.join(
    workDir,
    `translated.${PIPE_VERSION}.${translateCacheKey(targetLang)}.json`
  );
  let segments = readCache<Segment[]>(translateCache);
  if (segments) {
    log.ok(`Dung lai ban dich da cache (${segments.length} doan)`);
  } else {
    segments = await translateSegments(
      mergedSegments,
      (done, total) => onProgress({ stage: "translate", done, total }),
      targetLang
    );
    fs.writeFileSync(translateCache, JSON.stringify(segments, null, 2));
  }

  return { awemeId, workDir, sourceVideo, segments };
}

// PHA 2: phu de + long tieng + ghep. Nhan segments (co the da duoc user sua).
// opts: chon giong doc + toc do (doi tung video tren web).
export interface RenderOptions {
  voice?: string;
  speed?: number;
  targetLang?: string; // de sinh metadata dung ngon ngu dau ra
}
export async function renderVideo(
  awemeId: string,
  segments: Segment[],
  onProgress: OnProgress = noop,
  opts: RenderOptions = {}
): Promise<DubResult> {
  ensureDirs();
  const voice = opts.voice || CONFIG.PIPER_VOICE;
  const speed = opts.speed && opts.speed > 0 ? opts.speed : CONFIG.DUB_SPEED;
  const targetLang = opts.targetLang || CONFIG.TARGET_LANG;
  const workDir = path.join(DIRS.work, awemeId);
  const sourceVideo = path.join(workDir, "source.mp4");
  if (!fs.existsSync(sourceVideo)) {
    throw new Error(`Chua co video nguon cho ${awemeId} (can chuan bi truoc).`);
  }

  onProgress({ stage: "subtitle" });
  const srtPath = path.join(workDir, `${awemeId}.srt`);
  buildSrt(segments, srtPath);

  // Nhac nen: che do demucs thi tach giong/nhac truoc (cache trong workDir).
  // Tach loi/chua cai demucs -> bgWav=null, mux tu fallback sang 'duck'.
  let bgWav: string | null = null;
  let bgMode = CONFIG.BGM_MODE;
  if (bgMode === "demucs") {
    onProgress({ stage: "bgm" });
    bgWav = await separateBgm(sourceVideo, workDir);
    if (!bgWav) bgMode = "duck";
  }

  // Long tieng: cache theo HASH noi dung ban dich + thuat toan -> sua phu de thi tu doc lai giong.
  onProgress({ stage: "tts" });
  const hash = crypto
    .createHash("md5")
    .update(
      `dubv3|tempo=${CONFIG.DUB_MAX_TEMPO}|voice=${voice}|speed=${speed}|` +
        segments.map((s) => s.translated ?? "").join("\n")
    )
    .digest("hex")
    .slice(0, 10);
  const dubCache = path.join(workDir, `dub.${hash}.wav`);
  let dubWav: string | null;
  if (fs.existsSync(dubCache)) {
    log.ok("Dung lai track long tieng da cache");
    dubWav = dubCache;
  } else {
    const w = await synthDubTrack(
      segments,
      workDir,
      (done, total) => onProgress({ stage: "tts", done, total }),
      { voice, speed }
    );
    if (w) {
      fs.renameSync(w, dubCache);
      dubWav = dubCache;
    } else {
      dubWav = null;
    }
  }

  onProgress({ stage: "mux" });
  const outPath = path.join(DIRS.output, `${awemeId}.mp4`);
  await mux({ sourceVideo, dubWav, bgWav, bgMode, srtPath, workDir, outPath });

  // Luu phu de ra output/ de tai ve (work/ co the bi don sau).
  const outSrt = path.join(DIRS.output, `${awemeId}.srt`);
  try {
    fs.copyFileSync(srtPath, outSrt);
  } catch {
    /* khong sao */
  }

  // Metadata dang video (tieu de/mo ta/hashtag) -> output/<id>.meta.json
  let metaPath: string | undefined;
  let metaTitle = "";
  if (CONFIG.GEN_METADATA === "true") {
    onProgress({ stage: "metadata" });
    try {
      const meta = await generateMetadata(segments, targetLang);
      metaTitle = meta.title;
      metaPath = path.join(DIRS.output, `${awemeId}.meta.json`);
      fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2));
      log.ok(`Metadata: ${meta.title}`);
    } catch (e) {
      log.warn(`Bo qua metadata (${(e as Error).message})`);
    }
  }

  // Anh bia (thumbnail) -> output/<id>.jpg (khung hinh + tieu de neu co)
  onProgress({ stage: "thumbnail" });
  const thumbTitle = metaTitle || segments.find((s) => (s.translated ?? "").trim())?.translated || "";
  try {
    await generateThumbnail(sourceVideo, thumbTitle, path.join(DIRS.output, `${awemeId}.jpg`), workDir);
  } catch (e) {
    log.warn(`Bo qua anh bia (${(e as Error).message})`);
  }

  log.ok(`=== Hoan tat: ${outPath} ===`);
  return { awemeId, videoPath: outPath, srtPath, segments, metaPath };
}

// Tien ich CLI: chay ca 2 pha (khong duyet giua chung).
export async function dubVideo(url: string, onProgress: OnProgress = noop): Promise<DubResult> {
  const prepared = await prepareVideo(url, onProgress);
  return renderVideo(prepared.awemeId, prepared.segments, onProgress);
}
