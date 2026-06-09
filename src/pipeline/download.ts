// Tai video Douyin ve. Uu tien link khong watermark tu API; neu fail thi dung yt-dlp.
import fs from "node:fs";
import path from "node:path";
import { pipeline as streamPipeline } from "node:stream/promises";
import { Readable } from "node:stream";
import { youtubeDl as ytdl } from "youtube-dl-exec";
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

  // Cach 2: fallback yt-dlp
  log.step("Tai bang yt-dlp...");
  await ytdl(url, {
    output: dest,
    format: "mp4",
    noWarnings: true,
    noCheckCertificates: true,
  } as any);
  if (!fs.existsSync(dest)) throw new Error("yt-dlp khong tao ra file output");
  log.ok(`Tai xong (yt-dlp): ${dest}`);
  return dest;
}
