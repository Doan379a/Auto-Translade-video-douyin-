// Ghep cuoi: thay/long tieng + burn phu de vao video -> output mp4.
import fs from "node:fs";
import path from "node:path";
import { CONFIG } from "../config.js";
import { FFMPEG, run } from "../util/ff.js";
import { log } from "../util/log.js";

// Xay dung chuoi filter video: burn phu de dich, nen den CHI OM SAT chu
// (BorderStyle=3) - khong phu den ca dai duoi de tranh che noi dung video.
// Mau ASS dang &HAABBGGRR (AA=00 = dam dac).
function buildVideoFilter(subsName: string): string {
  const size = CONFIG.SUB_FONT_SIZE;
  const bg = CONFIG.SUB_BG === "true";
  const style = [
    `Fontsize=${size}`,
    `PrimaryColour=&H00FFFFFF`, // chu trang
    `OutlineColour=&H00000000`, // mau hop nen: den
    `BackColour=&H00000000`,
    `BorderStyle=${bg ? 3 : 1}`, // 3 = hop nen den om sat chu; 1 = chi vien
    `Outline=${bg ? 6 : 1}`, // padding cua hop quanh chu
    `Shadow=0`,
    `Alignment=2`, // giua, sat day
    `MarginV=35`,
  ].join(",");
  return `subtitles=${subsName}:force_style='${style}'`;
}

// Chay ffmpeg voi cwd = workDir de tham chieu file phu de bang ten tuong doi,
// tranh loi escape duong dan Windows trong filter "subtitles".
export async function mux(opts: {
  sourceVideo: string;
  dubWav: string | null;
  srtPath: string;
  workDir: string;
  outPath: string;
}): Promise<string> {
  const { sourceVideo, dubWav, srtPath, workDir, outPath } = opts;
  log.step("Ghep video + long tieng + phu de (ffmpeg)...");

  // Dat phu de trong workDir voi ten don gian
  const subsName = "subs.srt";
  fs.copyFileSync(srtPath, path.join(workDir, subsName));

  const args: string[] = ["-y", "-i", path.resolve(sourceVideo)];
  if (dubWav) args.push("-i", path.resolve(dubWav));

  const vf = buildVideoFilter(subsName);

  if (dubWav) {
    // Giu nhac nen goc nho (0.12) + long tieng (1.0)
    const filter =
      `[0:v]${vf}[vout];` +
      `[0:a]volume=0.12[bg];[1:a]volume=1.0[vo];` +
      `[bg][vo]amix=inputs=2:normalize=0[aout]`;
    args.push(
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-c:a", "aac",
      "-shortest"
    );
  } else {
    // Khong co long tieng -> chi burn sub, giu tieng goc
    args.push("-vf", vf, "-c:v", "libx264", "-c:a", "aac");
  }
  args.push(path.resolve(outPath));

  await run(FFMPEG, args, { quiet: true, cwd: workDir });
  log.ok(`Xuat video: ${outPath}`);
  return outPath;
}
