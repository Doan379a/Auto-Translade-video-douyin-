// Nguon trend TOAN SAN qua TikHub (https://tikhub.io) — DICH VU TRA PHI.
// Can TIKHUB_API_KEY + TIKHUB_TREND_URL (URL endpoint tra ve danh sach video, tuy goi cua ban).
// Code chuan hoa phong thu nhieu dang response; neu khac -> bao de ban chinh TIKHUB_TREND_URL.
import { CONFIG } from "../config.js";
import { log } from "../util/log.js";
import { normalizeAweme } from "./douyinApi.js";
import type { TrendSource, TrendVideo } from "./types.js";

export class TikHubTrendSource implements TrendSource {
  name = "tikhub";

  async fetch(limit: number): Promise<TrendVideo[]> {
    if (!CONFIG.TIKHUB_API_KEY) {
      throw new Error("Thieu TIKHUB_API_KEY trong .env (trend toan san la dich vu tra phi cua TikHub).");
    }
    if (!CONFIG.TIKHUB_TREND_URL) {
      throw new Error("Thieu TIKHUB_TREND_URL trong .env (URL endpoint trend cua TikHub theo goi cua ban).");
    }

    const res = await fetch(CONFIG.TIKHUB_TREND_URL, {
      headers: { Authorization: `Bearer ${CONFIG.TIKHUB_API_KEY}`, accept: "application/json" },
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) {
      throw new Error(`TikHub HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
    }
    const json: any = await res.json();

    // Tim mang "aweme" trong response (phong thu nhieu dang khac nhau cua TikHub).
    const data = json?.data ?? json;
    const list: any[] =
      data?.aweme_list ??
      data?.data?.aweme_list ??
      data?.awemes ??
      data?.list ??
      (Array.isArray(data) ? data : []);

    const vids = list
      .map((a) => normalizeAweme(a, "tikhub"))
      .filter((v): v is TrendVideo => v !== null);

    if (vids.length === 0) {
      log.warn("TikHub tra ve 0 video — kiem tra lai TIKHUB_TREND_URL (dang response co the khac).");
    }
    return vids.slice(0, limit);
  }
}
