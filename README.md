# trend-dub — Quét trend Douyin + tự động lồng tiếng / phụ đề

Công cụ nội bộ: quét video hot trên Douyin, tự động **chép lời → dịch → lồng tiếng + phụ đề** sang tiếng Việt.
Chạy trên **CPU**, mặc định miễn phí (không cần API key). Thiết kế **clone-and-run**.

Hai cách dùng:
- **Web UI** (khuyên dùng): xem trend, tạo job, **duyệt & sửa phụ đề** rồi render, tải video + tiêu đề/mô tả.
- **CLI**: lồng tiếng nhanh 1 video.

## Pipeline

```
Quét trend (Douyin API) → tải video → chép lời (Whisper) → dịch (free/Ollama/OpenAI)
   → [duyệt & sửa phụ đề] → tách/né nhạc nền → lồng tiếng (Piper) + burn sub (ffmpeg)
   → output/<id>.mp4  +  output/<id>.meta.json (tiêu đề/mô tả/hashtag)
```

---

## Yêu cầu (cài 1 lần trên máy)

- **Node.js >= 20** — https://nodejs.org
- **Python 3.10+** — https://python.org (để `npm run setup` tự dựng API tải video Douyin ổn định; thiếu vẫn chạy được qua API công khai)
- **git**

> Tùy chọn nâng cao (không bắt buộc): [Ollama](https://ollama.com) để dịch bằng LLM local; `pip install demucs` nếu muốn tách nhạc nền chất lượng cao (`BGM_MODE=demucs`).

---

## Clone là chạy được

```bash
# 1. Lấy mã nguồn
git clone https://github.com/Doan379a/Auto-Translade-video-douyin-.git
cd Auto-Translade-video-douyin-

# 2. Cài thư viện Node (tự tải ffmpeg, yt-dlp...)
npm install

# 3. Tải binary + giọng đọc + API Douyin (chạy 1 lần, vài phút)
npm run setup

# 4. (Tùy chọn) tạo .env từ mẫu — mặc định đã chạy được, không bắt buộc
copy .env.example .env        # Mac/Linux: cp .env.example .env

# 5. Kiểm tra mọi thứ sẵn sàng
npm run doctor

# 6. Chạy web
npm run web                   # -> http://localhost:5173
```

Model Whisper (chép lời) **tự tải lần đầu** khi dub video đầu tiên (lưu vào `models/`).

---

## CLI

```bash
npm run trends            # liệt kê video hot (kênh trong data/accounts.json)
npm run dub -- 1          # lồng tiếng video #1 trong danh sách trend vừa quét
npm run dub -- <url>      # hoặc dán thẳng link Douyin
npm run clean             # dọn work/  (thêm -- --all để xóa cả output/)
```

Kết quả: `output/<id>.mp4` và `output/<id>.meta.json`.

---

## Cấu hình (`.env`) — tùy chọn chính

| Biến | Mặc định | Ý nghĩa |
|------|----------|---------|
| `TRANSLATE_ENGINE` | `free` | `free` (Google, không cài gì) · `ollama` (LLM local) · `openai` (trả phí) |
| `OLLAMA_MODEL` | `aya-expanse:8b` | Khi dùng Ollama — cần `ollama pull` trước |
| `SOURCE_LANG` / `TARGET_LANG` | `zh` / `vi` | Ngôn ngữ nguồn → đích |
| `WHISPER_MODEL` | `Xenova/whisper-small` | Model chép lời (CPU yếu → `Xenova/whisper-base`) |
| `BGM_MODE` | `duck` | `duck` (tự hạ nhạc nền khi lồng tiếng) · `demucs` (tách nền sạch, cần `pip install demucs`) · `none` |
| `DUB_MAX_TEMPO` | `1.5` | Tăng tốc giọng tối đa để khớp timeline (chống lệch tiếng) |
| `GEN_METADATA` | `true` | Sinh tiêu đề/mô tả/hashtag |
| `SUB_BG` / `SUB_FONT_SIZE` / `SUB_MARGIN_V` | `true` / `18` / `14` | Hộp nền + cỡ chữ + vị trí phụ đề |
| `DOUYIN_COOKIE` | *(trống)* | Dán cookie Douyin nếu tải hay bị chặn (xem `.env.example`) |

Xem `.env.example` để biết đầy đủ chú thích.

---

## Vì sao "clone-and-run"
- Binary nặng (ffmpeg, yt-dlp, piper) và model AI (whisper, giọng, vendor Douyin API) **không commit** lên Git → `npm run setup` tải lại.
- Không hardcode đường dẫn máy; mọi path tương đối + cấu hình qua `.env`.
- Đổi máy: chỉ cần `git clone` → `npm install` → `npm run setup` → `npm run web`.

## Lưu ý
Công cụ nội bộ phục vụ học tập/thử nghiệm. Tôn trọng bản quyền nội dung gốc khi sử dụng.
