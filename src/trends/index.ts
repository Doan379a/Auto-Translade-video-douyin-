// Diem vao lay trend. Thiet ke dang plugin: hien co nguon "account" (free).
// Sau co the them nguon "tikhub" (tra phi, trend toan san) ma khong sua cho goi.
import { AccountTrendSource } from "./accountSource.js";
import type { TrendSource, TrendVideo } from "./types.js";

const SOURCES: Record<string, () => TrendSource> = {
  account: () => new AccountTrendSource(),
  // tikhub: () => new TikHubTrendSource(),  // TODO: cam sau khi can trend toan san
};

export async function getTrends(
  limit = 20,
  sourceName = "account"
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
