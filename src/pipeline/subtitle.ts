// Tao file phu de .srt tu cac doan da dich.
import fs from "node:fs";
import type { Segment } from "./types.js";

function srtTime(sec: number): string {
  const ms = Math.max(0, Math.round(sec * 1000));
  const h = Math.floor(ms / 3600000);
  const m = Math.floor((ms % 3600000) / 60000);
  const s = Math.floor((ms % 60000) / 1000);
  const milli = ms % 1000;
  const pad = (n: number, w = 2) => String(n).padStart(w, "0");
  return `${pad(h)}:${pad(m)}:${pad(s)},${pad(milli, 3)}`;
}

export function buildSrt(segments: Segment[], outPath: string): string {
  const lines: string[] = [];
  segments.forEach((s, i) => {
    const end = s.end > s.start ? s.end : s.start + 2; // toi thieu 2s neu thieu moc
    lines.push(String(i + 1));
    lines.push(`${srtTime(s.start)} --> ${srtTime(end)}`);
    lines.push(s.translated ?? s.text);
    lines.push("");
  });
  fs.writeFileSync(outPath, lines.join("\n"), "utf8");
  return outPath;
}
