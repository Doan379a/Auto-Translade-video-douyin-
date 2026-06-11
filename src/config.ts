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
  TRANSLATE_ENGINE: z.enum(["free", "ollama", "openai"]).default("free"),
  OLLAMA_HOST: z.string().url().default("http://127.0.0.1:11434"),
  OLLAMA_MODEL: z.string().default("aya-expanse:8b"),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_MODEL: z.string().default("gpt-4o-mini"),
  SOURCE_LANG: z.string().default("zh"),
  TARGET_LANG: z.string().default("vi"),
  WHISPER_MODEL: z.string().default("Xenova/whisper-small"),
  PIPER_VOICE: z.string().default("vi_VN-vais1000-medium"),

  // --- Phu de ---
  // Co nen den om sat chu phu de dich (BorderStyle=3): "true" | "false"
  SUB_BG: z.string().default("true"),
  SUB_FONT_SIZE: z.coerce.number().default(18),
  // Khoang cach tu day man hinh (px). Nho -> sat day, de len phu de goc cua video.
  SUB_MARGIN_V: z.coerce.number().default(14),

  // --- Am thanh / nhac nen ---
  // Cach xu ly nhac nen goc khi long tieng:
  //   "duck"   - giu nhac nen goc, tu dong HA NHO khi co long tieng (sidechain). Mac dinh.
  //   "demucs" - tach han giong noi khoi nhac (Python demucs), giu nhac nen sach. Chat luong cao nhat, can cai demucs.
  //   "none"   - bo nhac nen goc, chi giu long tieng (de o ORIG_VOLUME).
  BGM_MODE: z.enum(["duck", "demucs", "none"]).default("duck"),
  // Am luong nhac nen (mode duck/demucs): 0..1. Mac dinh 0.85.
  BGM_VOLUME: z.coerce.number().default(0.85),
  // Am luong tieng goc khi mode=none (0 = tat han, 0.06 = rat nho, 1 = nguyen ban)
  ORIG_VOLUME: z.coerce.number().default(0.06),
  // Toc do toi da khi co gian giong long tieng cho khop timeline (1.0 = khong tang).
  // Cau dich dai hon o trong -> tang toc den muc nay de khong troi/chong cau sau.
  DUB_MAX_TEMPO: z.coerce.number().default(1.5),
  // Lenh python co demucs (mode=demucs). Vd "python", "python3", hoac duong dan .venv.
  DEMUCS_PYTHON: z.string().default("python"),
  DEMUCS_MODEL: z.string().default("htdemucs"),

  // --- Metadata dang video ---
  // Sinh tieu de / mo ta / hashtag tu ban dich (ghi output/<id>.meta.json): "true" | "false"
  GEN_METADATA: z.string().default("true"),

  // --- Tai video ---
  // Lay cookies tu trinh duyet de qua duoc chan cua Douyin: "" | "chrome" | "edge" | "firefox"
  YTDLP_COOKIES_FROM_BROWSER: z.string().default(""),
  // Cookie Douyin that (set 1 lan) -> nhet vao API self-host cho tai on dinh, het 400.
  // Lay tu trinh duyet da mo douyin.com: F12 > Application > Cookies, hoac extension cookie.
  DOUYIN_COOKIE: z.string().default(""),
});

// Danh sach API base (ho tro nhieu instance, phan tach bang dau phay) de fallback.
// Mac dinh: API self-host local truoc (on dinh, khong can cookies), public sau.
export const DOUYIN_API_BASES = (process.env.DOUYIN_API_BASE ??
  "http://127.0.0.1:8642,https://douyin.wtf")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

export const CONFIG = EnvSchema.parse(process.env);

export type AppConfig = typeof CONFIG;
