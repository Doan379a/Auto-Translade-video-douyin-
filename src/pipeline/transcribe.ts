// Nghe audio -> chep loi co moc thoi gian, bang Whisper chay tren transformers.js
// (thuan JS/ONNX, khong can GPU hay trinh bien dich).
import { spawn } from "node:child_process";
import { CONFIG, DIRS } from "../config.js";
import { FFMPEG } from "../util/ff.js";
import { log } from "../util/log.js";
import type { Segment } from "./types.js";

// Ma ngon ngu -> ten ngon ngu Whisper hieu.
const LANG_NAME: Record<string, string> = {
  zh: "chinese",
  en: "english",
  ja: "japanese",
  ko: "korean",
  vi: "vietnamese",
};

// Decode audio -> Float32Array PCM 16kHz mono qua ffmpeg.
function decodeAudioF32(input: string): Promise<Float32Array> {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, [
      "-i", input,
      "-ar", "16000",
      "-ac", "1",
      "-f", "f32le",
      "-acodec", "pcm_f32le",
      "pipe:1",
    ]);
    const chunks: Buffer[] = [];
    p.stdout.on("data", (d) => chunks.push(d));
    p.on("error", reject);
    p.on("close", (code) => {
      if (code !== 0) return reject(new Error(`ffmpeg decode exit ${code}`));
      const buf = Buffer.concat(chunks);
      resolve(new Float32Array(buf.buffer, buf.byteOffset, buf.length / 4));
    });
  });
}

let _transcriber: any = null;
async function getTranscriber() {
  if (!_transcriber) {
    // Lazy-import: chi nap transformers.js (onnxruntime) khi that su can ASR,
    // de cac lenh khac (trends/doctor) khong bi keo theo thu vien nang.
    const { pipeline, env } = await import("@xenova/transformers");
    env.cacheDir = DIRS.models; // luu model vao models/ (gitignored)
    env.allowLocalModels = false;
    log.step(`Tai model Whisper: ${CONFIG.WHISPER_MODEL} (lan dau se lau)...`);
    _transcriber = await pipeline(
      "automatic-speech-recognition",
      CONFIG.WHISPER_MODEL
    );
  }
  return _transcriber;
}

export async function transcribe(videoOrAudio: string): Promise<Segment[]> {
  log.step("Chep loi (Whisper)...");
  const audio = await decodeAudioF32(videoOrAudio);
  const transcriber = await getTranscriber();
  const language = LANG_NAME[CONFIG.SOURCE_LANG] ?? undefined;

  const out: any = await transcriber(audio, {
    return_timestamps: true,
    chunk_length_s: 30,
    stride_length_s: 5,
    language,
    task: "transcribe",
  });

  const chunks: any[] = out?.chunks ?? [];
  const segments: Segment[] = chunks
    .map((c) => ({
      start: c.timestamp?.[0] ?? 0,
      end: c.timestamp?.[1] ?? c.timestamp?.[0] ?? 0,
      text: String(c.text ?? "").trim(),
    }))
    .filter((s) => s.text.length > 0);

  // Neu khong co timestamp (model tra full text), gop lam 1 doan.
  if (segments.length === 0 && out?.text) {
    segments.push({ start: 0, end: 0, text: String(out.text).trim() });
  }
  log.ok(`Chep loi xong: ${segments.length} doan`);
  return segments;
}
