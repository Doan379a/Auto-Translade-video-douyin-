// Tai video Douyin ve. Uu tien link khong watermark tu API; neu fail thi dung yt-dlp.
import fs from "node:fs";
import path from "node:path";
import { pipeline as streamPipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { youtubeDl as ytdl } from "youtube-dl-exec";
import { CONFIG } from "../config.js";
import { log } from "../util/log.js";
import { getVideoData, extractDownloadUrl } from "../trends/douyinApi.js";

async function downloadUrlToFile(url: string, dest: string): Promise<void> {
  const res = await fetch(url, {
    headers: {
      // Douyin CDN doi khi can referer/UA
      referer: "https://www.douyin.com/",
      "user-agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
  });
  if (!res.ok || !res.body) throw new Error(`Tai that bai: HTTP ${res.status}`);
  await streamPipeline(Readable.fromWeb(res.body as any), fs.createWriteStream(dest));
  const size = fs.statSync(dest).size;
  if (size < 10_000) throw new Error(`File qua nho (${size} bytes), co the bi chan`);
}

// Tra ve duong dan file video da tai (work/<id>/source.mp4)
export async function downloadVideo(url: string, workDir: string): Promise<string> {
  fs.mkdirSync(workDir, { recursive: true });
  const dest = path.join(workDir, "source.mp4");

  // Da tai roi -> dung lai (resumable)
  if (fs.existsSync(dest) && fs.statSync(dest).size > 10_000) {
    log.ok(`Dung lai video da tai: ${dest}`);
    return dest;
  }

  // Cach 1: lay link no-watermark qua API roi tai truc tiep
  try {
    log.step("Lay link tai qua API...");
    const data = await getVideoData(url);
    const dl = extractDownloadUrl(data);
    if (dl) {
      await downloadUrlToFile(dl, dest);
      log.ok(`Tai xong (API): ${dest}`);
      return dest;
    }
    log.warn("API khong tra link tai, thu yt-dlp...");
  } catch (e) {
    log.warn(`Cach API loi (${(e as Error).message}), thu yt-dlp...`);
  }

  // Cach 2: fallback yt-dlp (co the lay cookies tu trinh duyet de qua chan Douyin)
  log.step("Tai bang yt-dlp...");
  const opts: Record<string, unknown> = {
    output: dest,
    format: "mp4",
    noWarnings: true,
    noCheckCertificates: true,
  };
  if (CONFIG.YTDLP_COOKIES_FROM_BROWSER) {
    opts.cookiesFromBrowser = CONFIG.YTDLP_COOKIES_FROM_BROWSER;
    log.info(`yt-dlp dung cookies tu: ${CONFIG.YTDLP_COOKIES_FROM_BROWSER}`);
  }
  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 2; attempt++) {
    try {
      await ytdl(url, opts as any);
      if (fs.existsSync(dest)) {
        log.ok(`Tai xong (yt-dlp): ${dest}`);
        return dest;
      }
    } catch (e) {
      lastErr = e as Error;
      log.warn(`yt-dlp lan ${attempt} loi: ${lastErr.message.split("\n")[0]}`);
    }
  }
  throw new Error(
    `Khong tai duoc video. ${lastErr?.message.split("\n")[0] ?? ""}\n` +
      `Goi y: dat YTDLP_COOKIES_FROM_BROWSER=chrome (hoac edge) trong .env, ` +
      `hoac self-host API Douyin va dien DOUYIN_API_BASE.`
  );
}
