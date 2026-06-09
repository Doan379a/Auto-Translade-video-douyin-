// CLI Pha 0: quet trend, long tieng 1 video, kiem tra he thong.
//   npm run trends            -> liet ke video hot
//   npm run dub -- <url|#>    -> long tieng + sub (url hoac so thu tu tu lenh trends)
//   npm run doctor            -> kiem tra moi thu san sang
import fs from "node:fs";
import path from "node:path";
import { CONFIG, DIRS, ROOT, ensureDirs } from "./config.js";
import { log } from "./util/log.js";
import { getTrends } from "./trends/index.js";
import { dubVideo } from "./pipeline/index.js";

const LAST_TRENDS = path.join(ROOT, "data", "last-trends.json");

function fmt(n: number): string {
  if (n >= 1e6) return (n / 1e6).toFixed(1) + "M";
  if (n >= 1e3) return (n / 1e3).toFixed(1) + "K";
  return String(n);
}

async function cmdTrends(): Promise<void> {
  ensureDirs();
  const limit = Number(process.argv[3]) || 20;
  log.info(`Dang quet trend (nguon: account, top ${limit})...`);
  const vids = await getTrends(limit);
  if (vids.length === 0) {
    log.warn("Khong co video. Hay them kenh that vao data/accounts.json roi chay lai.");
    return;
  }
  fs.writeFileSync(LAST_TRENDS, JSON.stringify(vids, null, 2));
  console.log("");
  vids.forEach((v, i) => {
    const desc = v.desc.replace(/\s+/g, " ").slice(0, 50) || "(khong mo ta)";
    console.log(
      `#${String(i + 1).padStart(2)}  ♥${fmt(v.stats.like).padStart(6)} ` +
        `💬${fmt(v.stats.comment).padStart(5)}  ${v.author.slice(0, 14).padEnd(14)} ${desc}`
    );
  });
  console.log(`\n→ Long tieng: npm run dub -- 1   (hoac dan link truc tiep)\n`);
}

async function cmdDub(): Promise<void> {
  const arg = process.argv[3];
  if (!arg) {
    log.err("Thieu tham so. Dung: npm run dub -- <url-douyin | so-thu-tu>");
    process.exit(1);
  }
  let url = arg;
  // Neu la so -> tra ve tu danh sach trend gan nhat
  if (/^\d{1,3}$/.test(arg) && fs.existsSync(LAST_TRENDS)) {
    const list = JSON.parse(fs.readFileSync(LAST_TRENDS, "utf8"));
    const item = list[Number(arg) - 1];
    if (!item) {
      log.err(`Khong co video #${arg} trong danh sach trend gan nhat.`);
      process.exit(1);
    }
    url = item.shareUrl;
    log.info(`Chon #${arg}: ${item.desc.slice(0, 40)}`);
  }
  const res = await dubVideo(url);
  console.log(`\n✓ Video:  ${res.videoPath}\n✓ Phu de: ${res.srtPath}\n`);
}

async function cmdDoctor(): Promise<void> {
  ensureDirs();
  const { FFMPEG, FFPROBE } = await import("./util/ff.js");
  const { piperReady, piperBin, voicePath } = await import("./util/piper.js");
  const checks: [string, boolean, string][] = [];

  checks.push(["ffmpeg", fs.existsSync(FFMPEG), FFMPEG]);
  checks.push(["ffprobe", fs.existsSync(FFPROBE), FFPROBE]);
  checks.push([
    `piper + giong ${CONFIG.PIPER_VOICE}`,
    piperReady(),
    piperReady() ? voicePath() : `thieu: ${piperBin()} / ${voicePath()}`,
  ]);
  checks.push([
    "thu muc models/",
    fs.existsSync(DIRS.models),
    DIRS.models + " (whisper se tai vao day)",
  ]);

  // Ollama (chi khi dung engine ollama)
  if (CONFIG.TRANSLATE_ENGINE === "ollama") {
    let ok = false;
    let detail = CONFIG.OLLAMA_HOST;
    try {
      const r = await fetch(`${CONFIG.OLLAMA_HOST}/api/tags`);
      ok = r.ok;
      if (ok) {
        const j: any = await r.json();
        const models = (j.models ?? []).map((m: any) => m.name);
        const has = models.includes(CONFIG.OLLAMA_MODEL);
        detail = has
          ? `co model ${CONFIG.OLLAMA_MODEL}`
          : `THIEU model ${CONFIG.OLLAMA_MODEL} (chay: ollama pull ${CONFIG.OLLAMA_MODEL})`;
        ok = has;
      }
    } catch {
      detail = `khong ket noi duoc Ollama tai ${CONFIG.OLLAMA_HOST} (da cai & chay chua?)`;
    }
    checks.push(["ollama (dich)", ok, detail]);
  } else {
    checks.push([
      "openai (dich)",
      !!CONFIG.OPENAI_API_KEY,
      CONFIG.OPENAI_API_KEY ? "co API key" : "thieu OPENAI_API_KEY",
    ]);
  }

  console.log("\n=== KIEM TRA HE THONG ===");
  for (const [name, ok, detail] of checks) {
    console.log(`${ok ? "✓" : "✗"} ${name.padEnd(28)} ${detail}`);
  }
  const allOk = checks.every((c) => c[1]);
  console.log(
    `\n${allOk ? "✓ San sang chay pipeline." : "! Con thieu, xem `npm run setup` va README."}\n`
  );
}

const cmd = process.argv[2];
const run = { trends: cmdTrends, dub: cmdDub, doctor: cmdDoctor }[cmd ?? ""];
if (!run) {
  console.log("Lenh: trends | dub <url|#> | doctor");
  process.exit(1);
}
run().catch((e) => {
  log.err((e as Error).stack ?? String(e));
  process.exit(1);
});
