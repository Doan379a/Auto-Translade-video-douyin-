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
    `MarginV=${CONFIG.SUB_MARGIN_V}`, // nho -> sat day, de len phu de goc
  ].join(",");
  return `subtitles=${subsName}:force_style='${style}'`;
}

// Xay dung nhanh audio khi CO long tieng, theo che do nhac nen:
//   demucs - nhac nen sach (bgWav) + long tieng
//   duck   - nhac nen goc tu dong ha nho khi long tieng noi (sidechaincompress)
//   none   - bo nhac nen goc (giu rat nho o ORIG_VOLUME) + long tieng
// Tra ve { filter, hasBg } voi input: 0=video, 1=dub, 2=bgWav (neu demucs).
function buildAudioFilter(
  mode: "demucs" | "duck" | "none",
  hasSeparatedBg: boolean
): string {
  const v = CONFIG.BGM_VOLUME;
  // amix/sidechaincompress doi cac input cung sample-rate + channel layout -> chuan hoa truoc.
  const FMT = "aformat=sample_rates=44100:channel_layouts=stereo";
  if (mode === "demucs" && hasSeparatedBg) {
    // input 2 = nhac nen da tach (khong con giong noi) -> mix thang voi long tieng
    return (
      `[2:a]${FMT},volume=${v}[bg];[1:a]${FMT}[vo];` +
      `[bg][vo]amix=inputs=2:normalize=0:duration=longest[aout]`
    );
  }
  if (mode === "duck") {
    // Nhac nen = tieng goc; ha nho TU DONG khi long tieng phat (sidechain),
    // nho lai khi im -> nghe ro nhac nen ma khong dam long tieng.
    // QUAN TRONG: pad sidechain bang apad -> sidechaincompress chay HET do dai
    // nhac goc, khong bi cat ngan theo track long tieng (tranh cut cuoi video).
    return (
      `[1:a]${FMT},asplit=2[vo][sc];` +
      `[sc]apad[scp];` +
      `[0:a]${FMT}[m];` +
      `[m][scp]sidechaincompress=threshold=0.05:ratio=12:attack=15:release=300[duck];` +
      `[duck]volume=${v}[bg];` +
      `[bg][vo]amix=inputs=2:normalize=0:duration=longest[aout]`
    );
  }
  // none: bo nhac nen goc (giu rat nho theo ORIG_VOLUME) + long tieng
  return (
    `[0:a]${FMT},volume=${CONFIG.ORIG_VOLUME}[bg];[1:a]${FMT}[vo];` +
    `[bg][vo]amix=inputs=2:normalize=0:duration=longest[aout]`
  );
}

// Chay ffmpeg voi cwd = workDir de tham chieu file phu de bang ten tuong doi,
// tranh loi escape duong dan Windows trong filter "subtitles".
export async function mux(opts: {
  sourceVideo: string;
  dubWav: string | null;
  bgWav?: string | null; // nhac nen da tach (mode demucs); null neu khong dung
  bgMode?: "demucs" | "duck" | "none";
  srtPath: string;
  workDir: string;
  outPath: string;
}): Promise<string> {
  const { sourceVideo, dubWav, bgWav, srtPath, workDir, outPath } = opts;
  const bgMode = opts.bgMode ?? "duck";
  log.step("Ghep video + long tieng + phu de (ffmpeg)...");

  // Dat phu de trong workDir voi ten don gian
  const subsName = "subs.srt";
  fs.copyFileSync(srtPath, path.join(workDir, subsName));

  const args: string[] = ["-y", "-i", path.resolve(sourceVideo)];
  if (dubWav) args.push("-i", path.resolve(dubWav));
  const hasSeparatedBg = bgMode === "demucs" && !!bgWav;
  if (hasSeparatedBg) args.push("-i", path.resolve(bgWav!)); // input 2

  const vf = buildVideoFilter(subsName);

  if (dubWav) {
    const aFilter = buildAudioFilter(bgMode, hasSeparatedBg);
    const filter = `[0:v]${vf}[vout];${aFilter}`;
    args.push(
      "-filter_complex", filter,
      "-map", "[vout]",
      "-map", "[aout]",
      "-c:v", "libx264",
      "-preset", "veryfast", // tang toc encode
      "-crf", "23",
      "-c:a", "aac",
      "-shortest"
    );
  } else {
    // Khong co long tieng -> chi burn sub, giu tieng goc
    args.push("-vf", vf, "-c:v", "libx264", "-preset", "veryfast", "-crf", "23", "-c:a", "aac");
  }
  args.push(path.resolve(outPath));

  await run(FFMPEG, args, { quiet: true, cwd: workDir });
  log.ok(`Xuat video: ${outPath}`);
  return outPath;
}
