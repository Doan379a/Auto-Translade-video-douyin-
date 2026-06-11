// Sinh metadata dang video (tieu de / mo ta / hashtag) tu ban dich.
// Tai dung LLM dich (ollama/openai) neu co; engine "free" thi dung heuristic don gian.
import { CONFIG } from "../config.js";
import { log } from "../util/log.js";
import { callLLM } from "./translate.js";
import type { Segment } from "./types.js";

export interface VideoMeta {
  title: string;
  description: string;
  tags: string[];
}

const LANG_LABEL: Record<string, string> = {
  vi: "tiếng Việt",
  en: "tiếng Anh",
  ja: "tiếng Nhật",
  ko: "tiếng Hàn",
  zh: "tiếng Trung",
};

function fullText(segments: Segment[]): string {
  return segments
    .map((s) => (s.translated ?? s.text ?? "").trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// Khong co LLM (engine free) -> tao metadata tho tu ban dich.
function heuristicMeta(segments: Segment[]): VideoMeta {
  const text = fullText(segments);
  const firstLine = (segments.find((s) => (s.translated ?? "").trim())?.translated ?? text).trim();
  const title = firstLine.slice(0, 80) || "Video";
  const description = text.slice(0, 400);
  return { title, description, tags: [] };
}

// Tach JSON tu cau tra loi LLM (co the bi boc ```json ... ```).
function parseJsonLoose(raw: string): any | null {
  const m = raw.match(/\{[\s\S]*\}/);
  if (!m) return null;
  try {
    return JSON.parse(m[0]);
  } catch {
    return null;
  }
}

export async function generateMetadata(segments: Segment[]): Promise<VideoMeta> {
  const text = fullText(segments);
  if (!text) return { title: "Video", description: "", tags: [] };

  // Engine free khong co LLM -> heuristic.
  if (CONFIG.TRANSLATE_ENGINE === "free") {
    return heuristicMeta(segments);
  }

  const lang = LANG_LABEL[CONFIG.TARGET_LANG] ?? CONFIG.TARGET_LANG;
  const system =
    `Ban la chuyen gia content social/YouTube. Dua tren noi dung video (da dich), ` +
    `tao metadata HAP DAN bang ${lang}. Tra ve DUY NHAT JSON dang ` +
    `{"title": string, "description": string, "tags": string[]}. ` +
    `title <= 80 ky tu, giat tit tu nhien. description 2-3 cau + vai hashtag. ` +
    `tags: 8-12 tu khoa khong dau '#'. Khong giai thich gi them.`;

  try {
    const raw = await callLLM(system, text.slice(0, 2000));
    const obj = parseJsonLoose(raw);
    if (obj && typeof obj.title === "string") {
      return {
        title: String(obj.title).slice(0, 100).trim(),
        description: String(obj.description ?? "").trim(),
        tags: Array.isArray(obj.tags) ? obj.tags.map((t: any) => String(t).replace(/^#/, "").trim()).filter(Boolean) : [],
      };
    }
    log.warn("LLM tra metadata khong dung dinh dang JSON, dung heuristic.");
  } catch (e) {
    log.warn(`Sinh metadata loi (${(e as Error).message}), dung heuristic.`);
  }
  return heuristicMeta(segments);
}
