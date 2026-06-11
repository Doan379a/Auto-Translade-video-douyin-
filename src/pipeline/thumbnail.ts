// Tao anh bia (thumbnail) offline bang ffmpeg: trich 1 khung hinh dai dien
// + phu tieu de len (neu tim duoc font he thong). Khong can API tra phi.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { FFMPEG, run, probeDuration } from "../util/ff.js";
import { log } from "../util/log.js";

// Tim 1 font he thong de ve chu (best-effort, theo OS).
function findFont(): string | null {
  const cands =
    os.platform() === "win32"
      ? ["C:/Windows/Fonts/arial.ttf", "C:/Windows/Fonts/segoeui.ttf", "C:/Windows/Fonts/tahoma.ttf"]
      : os.platform() === "darwin"
        ? ["/System/Library/Fonts/Supplemental/Arial.ttf", "/Library/Fonts/Arial.ttf", "/System/Library/Fonts/Helvetica.ttc"]
        : [
            "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
            "/usr/share/fonts/truetype/liberation/LiberationSans-Regular.ttf",
            "/usr/share/fonts/truetype/noto/NotoSans-Regular.ttf",
          ];
  return cands.find((f) => fs.existsSync(f)) ?? null;
}

// Xuong dong tieu de theo ~max ky tu/dong, toi da 3 dong.
function wrapTitle(text: string, max = 22): string {
  const words = (text || "").trim().split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max) {
      if (cur) lines.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) lines.push(cur);
  return lines.slice(0, 3).join("\n");
}

// Escape duong dan cho filter ffmpeg (Windows: escape dau ':' cua o dia).
function escFilterPath(p: string): string {
  return p.replace(/\\/g, "/").replace(/:/g, "\\:");
}

// Tao thumbnail -> outPath (jpg). Tra ve outPath hoac null neu loi.
export async function generateThumbnail(
  sourceVideo: string,
  title: string,
  outPath: string,
  workDir: string
): Promise<string | null> {
  const dur = await probeDuration(sourceVideo).catch(() => 0);
  const t = dur > 0 ? Math.min(dur * 0.3, Math.max(0, dur - 0.1)) : 0; // tranh frame den dau video
  const baseVf = "scale='min(720,iw)':-2";

  // Co font + co tieu de -> phu chu (dung textfile= de khoi escape noi dung).
  const font = findFont();
  if (font && title.trim()) {
    const tf = path.join(workDir, "thumb_title.txt");
    try {
      fs.writeFileSync(tf, wrapTitle(title), "utf8");
      const draw =
        `drawtext=fontfile='${escFilterPath(font)}':textfile='${escFilterPath(tf)}':` +
        `fontcolor=white:fontsize=40:line_spacing=8:box=1:boxcolor=black@0.55:boxborderw=14:` +
        `x=(w-text_w)/2:y=h-text_h-40`;
      await run(
        FFMPEG,
        ["-y", "-ss", String(t), "-i", path.resolve(sourceVideo), "-frames:v", "1", "-vf", `${baseVf},${draw}`, "-q:v", "3", path.resolve(outPath)],
        { quiet: true }
      );
      log.ok("Tao anh bia (co tieu de) xong");
      return outPath;
    } catch (e) {
      log.warn(`Phu chu len anh bia loi (${(e as Error).message}), dung khung hinh tron.`);
    }
  }

  // Fallback: chi lay khung hinh, khong chu.
  try {
    await run(
      FFMPEG,
      ["-y", "-ss", String(t), "-i", path.resolve(sourceVideo), "-frames:v", "1", "-vf", baseVf, "-q:v", "3", path.resolve(outPath)],
      { quiet: true }
    );
    log.ok("Tao anh bia xong");
    return outPath;
  } catch {
    return null;
  }
}
