// Tao track long tieng: doc tung doan da dich bang Piper, dat dung moc thoi gian
// tren mot duong tieng dai bang video (giu tam dong bo voi hinh).
import fs from "node:fs";
import path from "node:path";
import { FFMPEG, run } from "../util/ff.js";
import { synth } from "../util/piper.js";
import { log } from "../util/log.js";
import type { Segment } from "./types.js";

// Tra ve duong dan file wav long tieng, hoac null neu khong co gi de doc.
export async function synthDubTrack(
  segments: Segment[],
  workDir: string
): Promise<string | null> {
  const withText = segments.filter((s) => (s.translated ?? "").trim().length > 0);
  if (withText.length === 0) return null;

  const ttsDir = path.join(workDir, "tts");
  fs.mkdirSync(ttsDir, { recursive: true });

  log.step(`Tong hop giong ${withText.length} doan (Piper)...`);
  const parts: { wav: string; startMs: number }[] = [];
  for (let i = 0; i < withText.length; i++) {
    const s = withText[i];
    const wav = path.join(ttsDir, `seg_${i}.wav`);
    await synth(s.translated!, wav);
    parts.push({ wav, startMs: Math.round(s.start * 1000) });
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
