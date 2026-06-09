// `npm run setup`: tai Piper (TTS binary) + giong tieng Viet, theo dung OS.
// Whisper (ASR) tu tai khi chay lan dau, nen khong can o day.
// Chay duoc lai nhieu lan (skip cai gi da co).
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawnSync } from "node:child_process";
import { pipeline as streamPipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { CONFIG, DIRS, ensureDirs } from "../src/config.js";

const PIPER_VERSION = "2023.11.14-2";

function piperAsset(): string {
  const p = os.platform();
  const a = os.arch();
  if (p === "win32") return "piper_windows_amd64.zip";
  if (p === "darwin") return a === "arm64" ? "piper_macos_aarch64.tar.gz" : "piper_macos_x64.tar.gz";
  // linux
  return a === "arm64" ? "piper_linux_aarch64.tar.gz" : "piper_linux_x86_64.tar.gz";
}

async function download(url: string, dest: string): Promise<void> {
  process.stdout.write(`  ↓ ${path.basename(dest)} ... `);
  const res = await fetch(url, { redirect: "follow" });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status} @ ${url}`);
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  await streamPipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(dest));
  console.log(`xong (${(fs.statSync(dest).size / 1e6).toFixed(1)}MB)`);
}

function extract(archive: string, destDir: string): void {
  fs.mkdirSync(destDir, { recursive: true });
  if (archive.endsWith(".zip")) {
    // Windows: dung PowerShell Expand-Archive
    const r = spawnSync(
      "powershell",
      ["-NoProfile", "-Command", `Expand-Archive -Path '${archive}' -DestinationPath '${destDir}' -Force`],
      { stdio: "inherit" }
    );
    if (r.status !== 0) throw new Error("Expand-Archive that bai");
  } else {
    const r = spawnSync("tar", ["-xzf", archive, "-C", destDir], { stdio: "inherit" });
    if (r.status !== 0) throw new Error("tar -xzf that bai");
  }
}

async function setupPiper(): Promise<void> {
  const exe = os.platform() === "win32" ? "piper.exe" : "piper";
  const piperExe = path.join(DIRS.bin, "piper", exe);
  if (fs.existsSync(piperExe)) {
    console.log("✓ Piper binary da co, bo qua.");
    return;
  }
  const asset = piperAsset();
  const url = `https://github.com/rhasspy/piper/releases/download/${PIPER_VERSION}/${asset}`;
  const archive = path.join(DIRS.vendor, asset);
  console.log(`• Tai Piper (${asset})`);
  await download(url, archive);
  console.log("  giai nen...");
  extract(archive, DIRS.bin); // tao bin/piper/...
  if (!fs.existsSync(piperExe)) throw new Error(`Khong thay ${piperExe} sau khi giai nen`);
  console.log("✓ Piper san sang.");
}

async function setupVoice(): Promise<void> {
  const voice = CONFIG.PIPER_VOICE; // vd vi_VN-vais1000-medium
  const onnx = path.join(DIRS.voices, `${voice}.onnx`);
  const json = path.join(DIRS.voices, `${voice}.onnx.json`);
  if (fs.existsSync(onnx) && fs.existsSync(json)) {
    console.log(`✓ Giong ${voice} da co, bo qua.`);
    return;
  }
  // Phan tich ten: vi_VN-vais1000-medium -> lang=vi_VN, name=vais1000, quality=medium
  const m = voice.match(/^([a-z]{2})_([A-Z]{2})-(.+)-(low|medium|high|x_low)$/);
  if (!m) {
    console.log(`! Khong tu suy ra duoc URL cho giong "${voice}". Tai thu cong vao thu muc voices/.`);
    return;
  }
  const [, lang, region, name, quality] = m;
  const base = `https://huggingface.co/rhasspy/piper-voices/resolve/main/${lang}/${lang}_${region}/${name}/${quality}/${voice}`;
  console.log(`• Tai giong ${voice}`);
  await download(`${base}.onnx`, onnx);
  await download(`${base}.onnx.json`, json);
  console.log("✓ Giong san sang.");
}

async function main(): Promise<void> {
  ensureDirs();
  console.log("=== SETUP: tai binary + giong (clone-and-run) ===\n");
  await setupPiper();
  await setupVoice();

  console.log("\n--- Buoc cai tay con lai (1 lan) ---");
  if (CONFIG.TRANSLATE_ENGINE === "ollama") {
    console.log(`• Dich dung Ollama: cai app o https://ollama.com roi chay:`);
    console.log(`    ollama pull ${CONFIG.OLLAMA_MODEL}`);
  } else {
    console.log("• Dich dung OpenAI: dien OPENAI_API_KEY vao .env");
  }
  console.log("\nXong. Kiem tra bang: npm run doctor");
}

main().catch((e) => {
  console.error("\n✗ Setup loi:", (e as Error).message);
  process.exit(1);
});
