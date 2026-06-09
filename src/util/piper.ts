// Tien ich Piper TTS (free, tu host, chay CPU). Binary + giong do `npm run setup` tai ve.
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn } from "node:child_process";
import { CONFIG, DIRS } from "../config.js";

// Duong dan binary piper (theo OS).
export function piperBin(): string {
  const exe = os.platform() === "win32" ? "piper.exe" : "piper";
  return path.join(DIRS.bin, "piper", exe);
}

// Duong dan file giong .onnx
export function voicePath(): string {
  return path.join(DIRS.voices, `${CONFIG.PIPER_VOICE}.onnx`);
}

export function piperReady(): boolean {
  return fs.existsSync(piperBin()) && fs.existsSync(voicePath());
}

// Tong hop 1 doan text -> file wav.
export function synth(text: string, outWav: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (!piperReady()) {
      return reject(
        new Error("Piper chua san sang. Chay `npm run setup` de tai binary + giong.")
      );
    }
    const p = spawn(
      piperBin(),
      ["--model", voicePath(), "--output_file", outWav],
      { stdio: ["pipe", "ignore", "pipe"] }
    );
    let err = "";
    p.stderr.on("data", (d) => (err += d));
    p.on("error", reject);
    p.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`piper exit ${code}: ${err.slice(-300)}`))
    );
    p.stdin.write(text);
    p.stdin.end();
  });
}
