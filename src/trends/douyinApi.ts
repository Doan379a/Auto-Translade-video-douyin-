// Client cap thap goi Evil0ctal Douyin API (douyin.wtf hoac self-host).
// Chuan hoa response ve kieu noi bo, phong thu voi nhieu dang JSON khac nhau.
import { DOUYIN_API_BASES } from "../config.js";
import { getJson } from "../util/http.js";
import { log } from "../util/log.js";
import type { TrendVideo } from "./types.js";

// Thu lan luot cac API base, tra ve ket qua dau tien thanh cong (fallback).
async function tryBases<T = any>(
  pathname: string,
  params: Record<string, string | number | boolean> = {},
  timeoutMs = 30000
): Promise<T> {
  let lastErr: Error | null = null;
  for (const base of DOUYIN_API_BASES) {
    try {
      return await getJson<T>(base, pathname, params, timeoutMs);
    } catch (e) {
      lastErr = e as Error;
      if (DOUYIN_API_BASES.length > 1) log.warn(`API ${base} loi: ${lastErr.message}`);
    }
  }
  throw lastErr ?? new Error("Khong co API base nao kha dung");
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function pickCover(aweme: any): string | undefined {
  return (
    aweme?.video?.cover?.url_list?.[0] ??
    aweme?.video?.origin_cover?.url_list?.[0] ??
    aweme?.cover ??
    undefined
  );
}

// Chuan hoa 1 object "aweme" tho cua Douyin -> TrendVideo
export function normalizeAweme(aweme: any, source: string): TrendVideo | null {
  const awemeId = String(aweme?.aweme_id ?? aweme?.aweme_id ?? aweme?.id ?? "");
  if (!awemeId) return null;
  const st = aweme?.statistics ?? {};
  return {
    awemeId,
    desc: String(aweme?.desc ?? "").trim(),
    author: String(aweme?.author?.nickname ?? aweme?.author?.unique_id ?? "?"),
    shareUrl:
      aweme?.share_url ??
      aweme?.share_info?.share_url ??
      `https://www.douyin.com/video/${awemeId}`,
    cover: pickCover(aweme),
    stats: {
      play: num(st.play_count),
      like: num(st.digg_count),
      comment: num(st.comment_count),
      share: num(st.share_count),
    },
    durationMs: num(aweme?.video?.duration) || undefined,
    source,
  };
}

// Lay sec_user_id tu link trang ca nhan Douyin (vd https://www.douyin.com/user/MS4w...)
export async function getSecUserId(profileUrl: string): Promise<string> {
  const res = await tryBases<any>("/api/douyin/web/get_sec_user_id", {
    url: profileUrl,
  });
  const data = res?.data ?? res;
  const sec = typeof data === "string" ? data : data?.sec_user_id ?? data?.sec_uid;
  if (!sec) throw new Error(`Khong lay duoc sec_user_id tu: ${profileUrl}`);
  return String(sec);
}

// Lay video moi nhat cua 1 user theo sec_user_id
export async function fetchUserPostVideos(
  secUserId: string,
  count = 20,
  source = "account"
): Promise<TrendVideo[]> {
  const res = await tryBases<any>(
    "/api/douyin/web/fetch_user_post_videos",
    { sec_user_id: secUserId, max_cursor: 0, count },
    45000
  );
  const data = res?.data ?? res;
  const list: any[] =
    data?.aweme_list ?? data?.data?.aweme_list ?? data?.videos ?? [];
  return list
    .map((a) => normalizeAweme(a, source))
    .filter((v): v is TrendVideo => v !== null);
}

// Parse 1 video bat ky (lay metadata + link). Dung cho buoc tai.
export async function getVideoData(url: string): Promise<any> {
  const res = await tryBases<any>(
    "/api/hybrid/video_data",
    { url, minimal: false },
    45000
  );
  return res?.data ?? res;
}

// Trich xuat URL video khong watermark tu ket qua getVideoData (best-effort).
export function extractDownloadUrl(data: any): string | undefined {
  const candidates = [
    data?.video?.play_addr?.url_list,
    data?.video?.download_addr?.url_list,
    data?.video_data?.nwm_video_url_HQ,
    data?.video_data?.nwm_video_url,
  ];
  for (const c of candidates) {
    if (typeof c === "string" && c.startsWith("http")) return c;
    if (Array.isArray(c)) {
      const hit = c.find((u) => typeof u === "string" && u.startsWith("http"));
      if (hit) return hit;
    }
  }
  return undefined;
}
