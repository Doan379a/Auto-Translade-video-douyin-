// Gop cac doan ngan/vun (Whisper hay cat nho) thanh cau hoan chinh hon
// -> dich co ngu canh hon (do "loan xa") va long tieng do bi chong.
import type { Segment } from "./types.js";

export function mergeSegments(
  segs: Segment[],
  opts: { maxDur?: number; maxGap?: number; maxChars?: number } = {}
): Segment[] {
  const maxDur = opts.maxDur ?? 5; // 1 cau gop toi da ~5s
  const maxGap = opts.maxGap ?? 0.6; // cach nhau < 0.6s thi coi la cung cau
  const maxChars = opts.maxChars ?? 40; // gioi han do dai chu

  const out: Segment[] = [];
  for (const s of segs) {
    const prev = out[out.length - 1];
    const gap = prev ? s.start - prev.end : Infinity;
    const merged = prev
      ? {
          dur: s.end - prev.start,
          chars: (prev.text + s.text).length,
        }
      : null;
    // Gop vao doan truoc neu sat nhau va chua qua dai
    if (prev && gap <= maxGap && merged!.dur <= maxDur && merged!.chars <= maxChars) {
      prev.text = (prev.text + " " + s.text).replace(/\s+/g, " ").trim();
      prev.end = s.end;
    } else {
      out.push({ ...s });
    }
  }
  return out;
}
