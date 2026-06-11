// Diem vao lay trend. Thiet ke dang plugin: hien co nguon "account" (free).
// Sau co the them nguon "tikhub" (tra phi, trend toan san) ma khong sua cho goi.
import { AccountTrendSource } from "./accountSource.js";
import { TikHubTrendSource } from "./tikhubSource.js";
import { CONFIG } from "../config.js";
import type { TrendSource, TrendVideo } from "./types.js";

const SOURCES: Record<string, () => TrendSource> = {
  account: () => new AccountTrendSource(), // free, theo kenh trong accounts.json
  tikhub: () => new TikHubTrendSource(), // toan san, tra phi
};

export async function getTrends(
  limit = 20,
  sourceName: string = CONFIG.TREND_SOURCE
): Promise<TrendVideo[]> {
  const factory = SOURCES[sourceName];
  if (!factory) {
    throw new Error(
      `Nguon trend khong hop le: ${sourceName}. Co: ${Object.keys(SOURCES).join(", ")}`
    );
  }
  return factory().fetch(limit);
}

export type { TrendVideo } from "./types.js";
