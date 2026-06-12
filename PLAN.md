# Kế hoạch phát triển trend-dub

> File theo dõi tiến độ. Làm tới đâu tích tới đó để hôm sau tiếp tục không bị lẫn.
> Mỗi mục xong: tick `[x]`, ghi commit hash + ghi chú ngắn, rồi commit.

**Cách tiếp tục (hôm sau):** mở file này → tìm mục `🔄 ĐANG LÀM` hoặc mục `[ ]` đầu tiên trong phần "Ưu tiên" → làm tiếp.

Trạng thái: `[ ]` chưa làm · `🔄` đang làm · `[x]` xong (đã test + commit).

---

## ✅ Đã hoàn thành (các phiên trước)

- [x] Pipeline lồng tiếng + sub + metadata, web UI, hàng đợi, duyệt phụ đề
- [x] Sửa desync bằng atempo; nhạc nền duck/demucs/none (commit da720e5)
- [x] Quản lý kênh trên web + vá lỗi mux duck cắt cuối video (commit 2fee5c5)
- [x] Cookie Douyin trên web: kiểm tra sống/hết hạn, khóa khi còn hiệu lực (commit 5aab6ce)
- [x] Giữ job/video sau khi restart server (commit 5aab6ce)

---

## 🎯 Ưu tiên — làm lần lượt

### #1 — Xem/nghe thử trong màn duyệt phụ đề  [x] XONG
Mục tiêu: sửa phụ đề không còn "mù", giảm số lần render lại.
- [x] Phát video gốc ngay trong editor (route /work phục vụ work/<id>/source.mp4)
- [x] Phụ đề chạy đồng bộ theo video (overlay theo currentTime) + click mốc giờ để tới câu
- [x] Nút 🔊 "nghe thử" từng câu (POST /api/tts-preview synth Piper rồi phát)
- [x] Test + commit (đã test API: tts-preview + serve wav 200 OK)

### #2 — Báo rõ "cookie hết hạn" khi job tải lỗi  [x] XONG
- [x] jobs.ts: khi lỗi ở bước tải -> kiểm tra cookie thật (checkDouyinCookieAlive)
- [x] Cookie chết -> báo rõ "Cookie Douyin hết hạn — cập nhật ở Cài đặt rồi Thử lại" + cờ cookieHint
- [x] UI: nút "⚙️ Cập nhật cookie" mở thẳng mục Cài đặt + kiểm tra lại
- [x] Test + commit (verify hàm phát hiện: thật→alive, giả→dead, khôi phục→alive)

### #3 — Chọn giọng + tốc độ đọc (mỗi video)  [x] XONG
- [x] setup tải thêm giọng phụ (vi_VN-25hours_single-low) — best-effort
- [x] Editor: dropdown chọn giọng + thanh tốc độ; nghe thử + render dùng giọng/tốc độ đã chọn
- [x] synth Piper nhận voice + length_scale; cache dub theo voice+speed; GET /api/voices
- [x] Test + commit (2 giọng cho âm khác nhau; tốc độ 1.3× ngắn hơn 1.0×)

---

## 🟡 Nên có

### #4 — Sửa timing + gộp/tách câu trong editor  [x] XONG
- [x] Sửa start/end mỗi câu (ô số trong editor, lưu vào editSegs)
- [x] Gộp lên câu trên (⬆) / Tách 1 câu làm 2 (✂, chia text + thời gian)
- [x] collectSegments dùng editSegs (sort theo thời gian); nghe thử/sub dùng editSegs
- [x] Test + commit (node --check OK; logic mảng thuần)

### #5 — Bảo mật cookie + (tùy chọn) mật khẩu web  [x] XONG
- [x] GET /api/settings chỉ trả cookie đầy đủ khi localhost; từ xa -> ẩn (cookieHidden)
- [x] WEB_PASSWORD (Basic Auth) bảo vệ web khi truy cập từ xa; localhost được miễn
- [x] Test + commit (localhost 200+cookie; LAN ko pass→401; LAN có pass→200 cookie ẩn)

### #6 — Quản lý dung lượng từ web  [x] XONG
- [x] Hiện dung lượng work/ + output/ (tab Hàng đợi)
- [x] Nút 🧹 dọn work/ (tùy chọn xóa cả output/ qua xác nhận thứ 2); chặn khi đang có job chạy
- [x] Test + commit (dọn work 1GB, video thật giữ nguyên)

---

## 🟢 Mở rộng (khi cần)

### #7 — Đa ngôn ngữ đầu ra (EN/JP…)  [x] XONG
- [x] Chọn ngôn ngữ đích theo job (dropdown tab Trend) -> dịch + phụ đề + metadata theo lang đó
- [x] targetLang xuyên suốt prepare→translate(cache riêng theo lang)→render→metadata
- [x] Test + commit (zh→en/ja/ko đúng). Lưu ý: lồng tiếng non-vi cần cài giọng Piper tương ứng; không thì dùng như phụ đề.
### #8 — Tạo thumbnail / ảnh bìa  [x] XONG
- [x] thumbnail.ts: trích khung hình (offline) + phủ tiêu đề nếu có font (best-effort, fallback khung hình trơn)
- [x] render sinh output/<id>.jpg; Job.thumbUrl; dùng làm poster video + nút "⬇ Ảnh bìa"
- [x] Test + commit (JPG có tiêu đề tiếng Việt, 720px)
### #9 — Nguồn trend toàn sàn (TikHub trả phí)  [x] XONG (hạ tầng)
- [x] TREND_SOURCE config (account|tikhub); getTrends + /api/trends?source chọn nguồn
- [x] TikHubTrendSource: gate bằng TIKHUB_API_KEY, URL cấu hình qua TIKHUB_TREND_URL, chuẩn hóa phòng thủ
- [x] Test nhánh: thiếu key/nguồn sai báo lỗi rõ; account vẫn chạy
- [!] LƯU Ý: lời gọi TikHub THẬT chưa verify được (cần key trả phí). Self-host API không có endpoint trend toàn sàn nên đây là đường duy nhất. Khi có key: đặt TIKHUB_API_KEY + TIKHUB_TREND_URL, chỉnh URL cho đúng gói; nếu response khác dạng, sửa normalize trong tikhubSource.ts.
### #10 — Nút tải .srt và .meta từ UI  [x] XONG
- [x] render lưu .srt ra output/ (tải được kể cả sau khi dọn work/)
- [x] Job có srtUrl; nút "⬇ SRT" + "⬇ Mô tả" cho video done; xóa kèm khi gỡ job
- [x] Test + commit (scan srtUrl + serve 200)

---

## Nhật ký
- 2026-06-11 — #1 Preview video + nghe thử trong editor — fbf4941 — test API OK
- 2026-06-11 — #2 Báo cookie hết hạn khi job tải lỗi — 8a19a37 — verify hàm check OK
- 2026-06-11 — #3 Chọn giọng + tốc độ đọc — 39ff93f — test 2 giọng + tốc độ OK
- 2026-06-11 — #4 Sửa timing + gộp/tách câu — 01bb768 — node --check OK
- 2026-06-11 — #5 Bảo mật cookie + mật khẩu web — 259f535 — test localhost/LAN OK
- 2026-06-11 — #6 Quản lý dung lượng từ web — 56724c4 — dọn work 1GB OK
- 2026-06-11 — #10 Nút tải .srt + .meta — 5e631a4 — scan srtUrl + serve OK
- 2026-06-11 — #7 Đa ngôn ngữ đầu ra — 77b7323 — zh→en/ja/ko OK
- 2026-06-11 — #8 Tạo thumbnail / ảnh bìa — baec18a — JPG có tiêu đề OK
- 2026-06-11 — #9 Nguồn trend toàn sàn (TikHub) — (commit kế tiếp) — hạ tầng OK, call thật cần key
- 2026-06-12 — Siết chất lượng: sửa rò rỉ listener SSE (setMaxListeners 0); thêm test tự động (node:test cho mergeSegments/buildSrt/deriveId, tách util/id.ts, `npm test` 16/16); UI Hàng đợi: chọn tất cả + sắp xếp theo ngày + lọc theo độ dài + hiện độ dài/ngày tạo

## Hoàn tất: toàn bộ #1–#10 đã xong (xem các mục trên).
