import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import dotenv from "dotenv";
import { z } from "zod";

// --- Project root (resolved relative to this file, KHONG hardcode duong dan may) ---
const __filename = fileURLToPath(import.meta.url);
export const ROOT = path.resolve(path.dirname(__filename), "..");

// Load .env tu goc du an
dotenv.config({ path: path.join(ROOT, ".env") });

// --- Cac thu muc lam viec (deu tuong doi voi ROOT, gitignored) ---
export const DIRS = {
  bin: path.join(ROOT, "bin"),
  vendor: path.join(ROOT, "vendor"),
  models: path.join(ROOT, "models"),
  voices: path.join(ROOT, "voices"),
  work: path.join(ROOT, "work"),
  output: path.join(ROOT, "output"),
};

export function ensureDirs(): void {
  for (const dir of Object.values(DIRS)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

// --- Validate + parse bien moi truong ---
const EnvSchema = z.object({
  DOUYIN_API_BASE: z.string().url().default("https://douyin.wtf"),
  TRANSLATE_ENGINE: z.enum(["free", "ollama", "openai"]).default("ollama"),
  OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("qwen2.5:7b"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  SOURCE_LANG: z.string().default("zh"),
  TARGET_LANG: z.string().default("vi"),
  WHISPER_MODEL: z.string().default("Xenova/whisper-small"),
  PIPER_VOICE: z.string().default("vi_VN-vais1000-medium"),
});

export const CONFIG = EnvSchema.parse(process.env);

export type AppConfig = typeof CONFIG;
