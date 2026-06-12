// Suy ra id on dinh tu url video: uu tien chuoi so dai (awemeId) trong link;
// neu khong co thi bam md5 url. Tach rieng (chi dung crypto) de test duoc nhanh.
import crypto from "node:crypto";

export function deriveId(url: string): string {
  const m = url.match(/(\d{8,})/);
  return m ? m[1] : `vid_${crypto.createHash("md5").update(url).digest("hex").slice(0, 12)}`;
}
