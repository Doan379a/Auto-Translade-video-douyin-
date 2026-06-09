// Nguon trend "theo kenh hot": keo video moi nhat tu danh sach kenh trong
// data/accounts.json, gop lai va xep theo do hot. Free, chay tren API public.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.js";
import { log } from "../util/log.js";
import { fetchUserPostVideos, getSecUserId } from "./douyinApi.js";
import type { TrendSource, TrendVideo } from "./types.js";

interface AccountEntry {
  name: string;
  url?: string;
  secUserId?: string;
}

const ACCOUNTS_FILE = path.join(ROOT, "data", "accounts.json");
const CACHE_FILE = path.join(ROOT, "data", "sec_user_id.cache.json");

function readAccounts(): AccountEntry[] {
  if (!fs.existsSync(ACCOUNTS_FILE)) return [];
  const json = JSON.parse(fs.readFileSync(ACCOUNTS_FILE, "utf8"));
  return (json.accounts ?? []).filter(
    (a: AccountEntry) => a.url && !a.url.includes("EXAMPLE-REPLACE-ME")
  ).concat((json.accounts ?? []).filter((a: AccountEntry) => a.secUserId));
}

function readCache(): Record<string, string> {
  try {
    return JSON.parse(fs.readFileSync(CACHE_FILE, "utf8"));
  } catch {
    return {};
  }
}

function writeCache(c: Record<string, string>): void {
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2));
}

// Diem "do hot" de xep hang video.
export function hotScore(v: TrendVideo): number {
  const s = v.stats;
  return s.like + s.comment * 2 + s.share * 3 + s.play * 0.01;
}

export class AccountTrendSource implements TrendSource {
  name = "account";

  async fetch(limit: number): Promise<TrendVideo[]> {
    const accounts = readAccounts();
    if (accounts.length === 0) {
      log.warn(
        "data/accounts.json chua co kenh that. Hay them link trang ca nhan Douyin vao roi chay lai."
      );
      return [];
    }

    const cache = readCache();
    const all: TrendVideo[] = [];

    for (const acc of accounts) {
      try {
        let sec = acc.secUserId;
        if (!sec && acc.url) {
          sec = cache[acc.url];
          if (!sec) {
            sec = await getSecUserId(acc.url);
            cache[acc.url] = sec;
            writeCache(cache);
          }
        }
        if (!sec) continue;

        log.step(`Keo video tu kenh: ${acc.name}`);
        const vids = await fetchUserPostVideos(sec, 20, `account:${acc.name}`);
        all.push(...vids);
      } catch (e) {
        log.warn(`Bo qua kenh ${acc.name}: ${(e as Error).message}`);
      }
    }

    // Dedupe theo awemeId, xep theo do hot, lay top N
    const seen = new Set<string>();
    const unique = all.filter((v) => {
      if (seen.has(v.awemeId)) return false;
      seen.add(v.awemeId);
      return true;
    });
    unique.sort((a, b) => hotScore(b) - hotScore(a));
    return unique.slice(0, limit);
  }
}
