// Dich cac doan loi sang ngon ngu dich. Ho tro 2 engine: ollama (free) | openai.
import { Ollama } from "ollama";
import { CONFIG } from "../config.js";
import { log } from "../util/log.js";
import type { Segment } from "./types.js";

const LANG_LABEL: Record<string, string> = {
  zh: "tiếng Trung",
  en: "tiếng Anh",
  ja: "tiếng Nhật",
  ko: "tiếng Hàn",
  vi: "tiếng Việt",
};

function langLabel(code: string): string {
  return LANG_LABEL[code] ?? code;
}

// Engine "free": Google dich cong khai, khong can key/cai dat. Dich 1 doan.
// Don gian, hop demo; do tin cay thap hon Ollama/OpenAI (co the bi rate-limit).
async function translateFree(text: string): Promise<string> {
  const url =
    `https://translate.googleapis.com/translate_a/single?client=gtx` +
    `&sl=${CONFIG.SOURCE_LANG}&tl=${CONFIG.TARGET_LANG}&dt=t&q=${encodeURIComponent(text)}`;
  const res = await fetch(url, {
    headers: { "user-agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error(`Google translate HTTP ${res.status}`);
  const data: any = await res.json();
  // data[0] = [[transChunk, origChunk, ...], ...] -> noi cac chunk dich lai
  return (data?.[0] ?? []).map((c: any) => c?.[0] ?? "").join("").trim();
}

// Goi 1 LLM (chat) tra ve text, theo engine cau hinh.
async function callLLM(system: string, user: string): Promise<string> {
  if (CONFIG.TRANSLATE_ENGINE === "ollama") {
    const ollama = new Ollama({ host: CONFIG.OLLAMA_HOST });
    const res = await ollama.chat({
      model: CONFIG.OLLAMA_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      stream: false,
      options: { temperature: 0.3 },
    });
    return res.message.content.trim();
  }

  // openai
  if (!CONFIG.OPENAI_API_KEY) {
    throw new Error("TRANSLATE_ENGINE=openai nhung thieu OPENAI_API_KEY trong .env");
  }
  const res = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${CONFIG.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: CONFIG.OPENAI_MODEL,
      temperature: 0.3,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`OpenAI HTTP ${res.status}: ${await res.text()}`);
  const json: any = await res.json();
  return String(json.choices?.[0]?.message?.content ?? "").trim();
}

async function translateOne(text: string): Promise<string> {
  const system = `Ban la dich gia chuyen nghiep. Dich tu ${langLabel(
    CONFIG.SOURCE_LANG
  )} sang ${langLabel(
    CONFIG.TARGET_LANG
  )}. Chi tra ve ban dich, khong giai thich, giu nguyen y va giong dieu noi.`;
  return callLLM(system, text);
}

// Dich tat ca cac doan. Batch theo dau [[n]] de it goi LLM; sai so thi fallback tung doan.
export async function translateSegments(segments: Segment[]): Promise<Segment[]> {
  if (segments.length === 0) return segments;
  log.step(
    `Dich ${segments.length} doan: ${langLabel(CONFIG.SOURCE_LANG)} → ${langLabel(
      CONFIG.TARGET_LANG
    )} (${CONFIG.TRANSLATE_ENGINE})...`
  );

  // Engine "free": dich tung doan qua Google (khong can cai dat).
  if (CONFIG.TRANSLATE_ENGINE === "free") {
    for (let i = 0; i < segments.length; i++) {
      try {
        segments[i].translated = await translateFree(segments[i].text);
      } catch (e) {
        log.warn(`Doan ${i + 1} dich loi (${(e as Error).message}), giu nguyen goc`);
        segments[i].translated = segments[i].text;
      }
    }
    log.ok("Dich xong (free)");
    return segments;
  }

  // Prompt tieng Anh (model bam sat hon), ep dau ra CHI tieng dich.
  const src = langLabel(CONFIG.SOURCE_LANG);
  const tgt = langLabel(CONFIG.TARGET_LANG);
  const system =
    `You are a professional short-video subtitle translator. ` +
    `Translate each numbered line from ${src} into natural, colloquial ${tgt} ` +
    `(use correct ${tgt} diacritics). Output exactly one line per input in the ` +
    `format [[n]] <translation>, keeping the [[n]] markers in order. ` +
    `Output ONLY ${tgt}. Never output ${src} characters or any other language. No notes.`;

  // Chia lo nho ~12 dong de model giu mach va khong lan ngon ngu.
  const CHUNK = 12;
  for (let start = 0; start < segments.length; start += CHUNK) {
    const chunk = segments.slice(start, start + CHUNK);
    const user = chunk.map((s, i) => `[[${i + 1}]] ${s.text}`).join("\n");
    try {
      const raw = await callLLM(system, user);
      const map = new Map<number, string>();
      for (const line of raw.split("\n")) {
        const m = line.match(/^\s*\[\[(\d+)\]\]\s*(.*)$/);
        if (m) map.set(Number(m[1]), m[2].trim());
      }
      for (let i = 0; i < chunk.length; i++) {
        chunk[i].translated = map.get(i + 1) || (await translateOne(chunk[i].text));
      }
    } catch (e) {
      log.warn(`Lo ${start}-${start + chunk.length} loi (${(e as Error).message}), dich tung doan...`);
      for (const s of chunk) s.translated = await translateOne(s.text);
    }
    log.step(`Dich ${Math.min(start + CHUNK, segments.length)}/${segments.length}`);
  }
  log.ok("Dich xong");
  return segments;
}
