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

// Duong dan file giong .onnx (mac dinh PIPER_VOICE, hoac giong chi dinh).
export function voicePath(voice?: string): string {
  return path.join(DIRS.voices, `${voice || CONFIG.PIPER_VOICE}.onnx`);
}

// Liet ke cac giong da cai (file .onnx trong voices/).
export function listVoices(): string[] {
  try {
    return fs
      .readdirSync(DIRS.voices)
      .filter((f) => f.endsWith(".onnx"))
      .map((f) => f.replace(/\.onnx$/, ""));
  } catch {
    return [];
  }
}

export function piperReady(): boolean {
  return fs.existsSync(piperBin()) && fs.existsSync(voicePath());
}

// Tong hop 1 doan text -> file wav. opts: chon giong + length_scale (lon hon = doc cham hon).
export function synth(
  text: string,
  outWav: string,
  opts: { voice?: string; lengthScale?: number } = {}
): Promise<void> {
  return new Promise((resolve, reject) => {
    const model = voicePath(opts.voice);
    if (!fs.existsSync(piperBin()) || !fs.existsSync(model)) {
      return reject(
        new Error(`Piper/giong chua san sang (${opts.voice ?? CONFIG.PIPER_VOICE}). Chay \`npm run setup\`.`)
      );
    }
    const args = ["--model", model, "--output_file", outWav];
    if (opts.lengthScale && opts.lengthScale > 0) {
      args.push("--length_scale", String(opts.lengthScale));
    }
    const p = spawn(piperBin(), args, { stdio: ["pipe", "ignore", "pipe"] });
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
