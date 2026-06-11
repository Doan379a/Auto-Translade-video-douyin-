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

### #2 — Báo rõ "cookie hết hạn" khi job tải lỗi  `[ ]`
- [ ] download.ts/jobs.ts nhận diện lỗi 400/expired khi tải
- [ ] Job báo lỗi rõ "Cookie Douyin có thể hết hạn — cập nhật ở Cài đặt"
- [ ] (tùy chọn) tự gợi ý mở mục Cài đặt trên UI
- [ ] Test + commit

### #3 — Chọn giọng nam/nữ + tốc độ đọc (mỗi video)  `[ ]`
- [ ] Tải thêm giọng (nam/nữ) trong `npm run setup`
- [ ] Cho chọn giọng + tốc độ (length_scale) ở editor/khi render
- [ ] Truyền vào synth Piper; cache dub theo giọng
- [ ] Test + commit

---

## 🟡 Nên có

### #4 — Sửa timing + gộp/tách câu trong editor  `[ ]`
- [ ] Sửa start/end mỗi câu
- [ ] Gộp 2 câu / tách 1 câu
- [ ] Test + commit

### #5 — Bảo mật cookie + (tùy chọn) mật khẩu web  `[ ]`
- [ ] Không trả full cookie khi request không phải localhost
- [ ] (tùy chọn) mật khẩu đơn giản bảo vệ web khi mở ra LAN
- [ ] Test + commit

### #6 — Quản lý dung lượng từ web  `[ ]`
- [ ] Hiện dung lượng work/ + output/
- [ ] Nút dọn work/ (và tùy chọn output/) từ UI
- [ ] Test + commit

---

## 🟢 Mở rộng (khi cần)

### #7 — Đa ngôn ngữ đầu ra (EN/JP…)  `[ ]`
### #8 — Tạo thumbnail / ảnh bìa  `[ ]`
### #9 — Nguồn trend toàn sàn (TikHub trả phí)  `[ ]`
### #10 — Nút tải .srt và .meta từ UI  `[ ]`

---

## Nhật ký
- 2026-06-11 — #1 Preview video + nghe thử trong editor — (commit kế tiếp) — test API OK
