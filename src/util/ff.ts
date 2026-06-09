// Tien ich ffmpeg/ffprobe: lay duong dan binary (tu npm, cross-platform) va
// ham chay command tra ve Promise.
import { spawn } from "node:child_process";
import ffmpegStatic from "ffmpeg-static";
import ffprobeInstaller from "@ffprobe-installer/ffprobe";

export const FFMPEG = ffmpegStatic as unknown as string;
export const FFPROBE = ffprobeInstaller.path;

export function run(
  bin: string,
  args: string[],
  opts: { quiet?: boolean; cwd?: string } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn(bin, args, {
      cwd: opts.cwd,
      stdio: opts.quiet ? ["ignore", "ignore", "pipe"] : "inherit",
    });
    let err = "";
    if (opts.quiet && p.stderr) p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0
        ? resolve()
        : reject(new Error(`${bin} exit ${code}${err ? `: ${err.slice(-500)}` : ""}`))
    );
  });
}

// Lay thoi luong (giay) cua file media.
export async function probeDuration(file: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFPROBE, [
      "-v",
      "error",
      "-show_entries",
      "format=duration",
      "-of",
      "default=noprint_wrappers=1:nokey=1",
      file,
    ]);
    let out = "";
    p.stdout.on("data", (d) => (out += d));
    p.on("error", reject);
    p.on("close", () => resolve(parseFloat(out.trim()) || 0));
  });
}

// Trich audio sang WAV 16kHz mono (chuan cho Whisper).
export async function extractWav16k(input: string, output: string): Promise<void> {
  await run(
    FFMPEG,
    ["-y", "-i", input, "-ar", "16000", "-ac", "1", "-c:a", "pcm_s16le", output],
    { quiet: true }
  );
}
