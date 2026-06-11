// Tach nhac nen (accompaniment) ra khoi giong noi goc bang demucs (Python).
// Cho phep giu nhac/hieu ung nen SACH khi long tieng, thay vi chi ha nho tieng goc.
// Demucs nang (torch) -> la tuy chon: chua cai thi pipeline tu fallback sang "duck".
import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { CONFIG } from "../config.js";
import { FFMPEG, run } from "../util/ff.js";
import { log } from "../util/log.js";

// Chay `<python> -m demucs <args>`.
function runDemucs(args: string[], opts: { quiet?: boolean } = {}): Promise<void> {
  return run(CONFIG.DEMUCS_PYTHON, ["-m", "demucs", ...args], opts);
}

// Demucs co san trong python da cau hinh khong?
export function checkDemucs(): Promise<boolean> {
  return new Promise((resolve) => {
    const p = spawn(CONFIG.DEMUCS_PYTHON, ["-m", "demucs", "-h"], { stdio: "ignore" });
    p.on("error", () => resolve(false));
    p.on("close", (code) => resolve(code === 0));
  });
}

// Tach giong khoi nhac -> tra ve duong dan wav NHAC NEN (khong giong noi),
// hoac null neu demucs chua cai / loi (de pipeline fallback sang "duck").
export async function separateBgm(
  sourceVideo: string,
  workDir: string
): Promise<string | null> {
  const out = path.join(workDir, "bgm.wav");
  if (fs.existsSync(out)) {
    log.ok("Dung lai nhac nen da tach (cache)");
    return out;
  }
  if (!(await checkDemucs())) {
    log.warn(
      `Chua cai demucs cho '${CONFIG.DEMUCS_PYTHON}' (pip install demucs). Tam fallback sang che do 'duck'.`
    );
    return null;
  }

  log.step("Tach nhac nen khoi giong noi (demucs - co the lau tren CPU)...");
  // 1. Trich audio stereo 44.1kHz cho demucs.
  const audio = path.join(workDir, "audio44k.wav");
  await run(FFMPEG, ["-y", "-i", sourceVideo, "-vn", "-ar", "44100", "-ac", "2", audio], {
    quiet: true,
  });

  // 2. Tach 2 stem (vocals / no_vocals).
  const sepDir = path.join(workDir, "demucs");
  try {
    await runDemucs(["--two-stems=vocals", "-n", CONFIG.DEMUCS_MODEL, "-o", sepDir, audio]);
  } catch (e) {
    log.warn(`Demucs loi (${(e as Error).message}). Fallback sang 'duck'.`);
    fs.rmSync(audio, { force: true });
    return null;
  }

  // 3. Lay file no_vocals.wav (nhac nen). Cau truc: <sepDir>/<model>/<base>/no_vocals.wav
  const base = path.basename(audio, path.extname(audio));
  const noVocals = path.join(sepDir, CONFIG.DEMUCS_MODEL, base, "no_vocals.wav");
  if (!fs.existsSync(noVocals)) {
    log.warn("Khong tim thay output demucs (no_vocals.wav). Fallback sang 'duck'.");
    return null;
  }
  fs.copyFileSync(noVocals, out);
  // Don dep file trung gian (giu lai bgm.wav lam cache).
  fs.rmSync(sepDir, { recursive: true, force: true });
  fs.rmSync(audio, { force: true });
  log.ok("Tach nhac nen xong");
  return out;
}
