// Tao track long tieng: doc tung doan da dich bang Piper, dat dung moc thoi gian
// tren mot duong tieng dai bang video (giu tam dong bo voi hinh).
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { FFMPEG, run, probeDuration } from "../util/ff.js";
import { synth } from "../util/piper.js";
import { log } from "../util/log.js";
import type { Segment } from "./types.js";

const MIN_GAP = 0.08; // giay nghi toi thieu giua 2 cau

// Co gian toc do 1 file wav bang atempo (giu cao do). tempo 1.0..2.0.
async function applyTempo(inWav: string, outWav: string, tempo: number): Promise<void> {
  await run(
    FFMPEG,
    ["-y", "-i", inWav, "-filter:a", `atempo=${tempo.toFixed(3)}`, outWav],
    { quiet: true }
  );
}

// Tra ve duong dan file wav long tieng, hoac null neu khong co gi de doc.
export async function synthDubTrack(
  segments: Segment[],
  workDir: string,
  onProgress?: (done: number, total: number) => void
): Promise<string | null> {
  const withText = segments.filter((s) => (s.translated ?? "").trim().length > 0);
  if (withText.length === 0) return null;

  const ttsDir = path.join(workDir, "tts");
  fs.mkdirSync(ttsDir, { recursive: true });

  log.step(`Tong hop giong ${withText.length} doan (Piper)...`);
  // NEO tung cau vao DUNG moc thoi gian goc (s.start) -> khong bi troi cong don.
  // Neu giong doc dai hon o trong (toi cau sau), TANG TOC bang atempo (cap DUB_MAX_TEMPO)
  // de khop timeline thay vi day lui (kieu cu lam tieng lech dan khoi hinh).
  const ordered = [...withText].sort((a, b) => a.start - b.start);
  const maxTempo = Math.max(1, CONFIG.DUB_MAX_TEMPO);
  const parts: { wav: string; startMs: number }[] = [];
  for (let i = 0; i < ordered.length; i++) {
    const s = ordered[i];
    const raw = path.join(ttsDir, `seg_${i}_raw.wav`);
    await synth(s.translated!, raw);
    let dur = await probeDuration(raw);

    // O trong cho cau nay: tu s.start den khi cau sau bat dau (tru khoang nghi).
    const nextStart = i + 1 < ordered.length ? ordered[i + 1].start : Infinity;
    const avail = nextStart - s.start - MIN_GAP;

    let placeWav = raw;
    if (Number.isFinite(avail) && avail > 0.25 && dur > avail) {
      const tempo = Math.min(dur / avail, maxTempo);
      if (tempo > 1.01) {
        const sped = path.join(ttsDir, `seg_${i}.wav`);
        await applyTempo(raw, sped, tempo);
        placeWav = sped;
      }
    }
    parts.push({ wav: placeWav, startMs: Math.round(s.start * 1000) });
    onProgress?.(i + 1, ordered.length);
  }

  // Ghep cac doan vao 1 track theo moc thoi gian: adelay roi amix.
  const dubWav = path.join(workDir, "dub.wav");
  const inputs = parts.flatMap((p) => ["-i", p.wav]);
  const delays = parts
    .map((p, i) => `[${i}:a]adelay=${p.startMs}|${p.startMs}[a${i}]`)
    .join(";");
  const mixIn = parts.map((_, i) => `[a${i}]`).join("");
  const filter = `${delays};${mixIn}amix=inputs=${parts.length}:normalize=0[out]`;

  await run(
    FFMPEG,
    [
      "-y",
      ...inputs,
      "-filter_complex",
      filter,
      "-map",
      "[out]",
      "-ac",
      "2",
      dubWav,
    ],
    { quiet: true }
  );
  log.ok("Tao track long tieng xong");
  return dubWav;
}
