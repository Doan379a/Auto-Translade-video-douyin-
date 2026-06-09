// Kieu du lieu chung cho 1 video trend (da chuan hoa, doc lap nguon).
export interface TrendVideo {
  awemeId: string;
  desc: string;
  author: string;
  shareUrl: string; // link douyin de tai/parse
  cover?: string; // thumbnail
  stats: {
    play: number;
    like: number;
    comment: number;
    share: number;
  };
  durationMs?: number;
  source: string; // nguon lay (vd: "account:xxx")
}

// Mot nguon trend bat ky chi can implement ham nay.
export interface TrendSource {
  name: string;
  fetch(limit: number): Promise<TrendVideo[]>;
}
