# trend-dub

Công cụ nội bộ: **quét video hot trên Douyin → tự động lồng tiếng + sub** sang ngôn ngữ đích.
Chạy được trên CPU, các công cụ AI free/tự host. Thiết kế **clone-and-run**.

## Pipeline

```
Quét trend (Douyin API) → chọn video → tải (yt-dlp) → nghe & chép lời (Whisper)
   → dịch (Ollama/Qwen) → đọc giọng (Piper TTS) → ghép + burn sub (ffmpeg) → output/*.mp4
```

## Cài đặt (máy mới — vd PC ở nhà)

```bash
git clone <repo-url> trend-dub
cd trend-dub

# 1. Cài dependency Node (tu tai ffmpeg, yt-dlp...)
npm install

# 2. Tao file cau hinh
cp .env.example .env        # windows: copy .env.example .env

# 3. Tai binary + model (piper, whisper, giong tieng Viet)
npm run setup

# 4. Kiem tra moi thu san sang
npm run doctor
```

### Yêu cầu cài tay (1 lần, không qua npm được)
- **Ollama** (để dịch free tự host): tải ở https://ollama.com → rồi `ollama pull qwen2.5:7b`
  - Hoặc đổi `TRANSLATE_ENGINE=openai` trong `.env` nếu muốn dùng GPT.

## Dùng

```bash
# Liet ke video dang hot tren Douyin
npm run trends

# Long tieng + sub 1 video (tu link hoac id lay tu lenh tren)
npm run dub -- <douyin-url-hoac-id>
```

Kết quả nằm trong `output/`.

## Vì sao "clone-and-run"
- Binary nặng (ffmpeg, yt-dlp, whisper, piper) và model **không commit** lên Git → `npm run setup` tải lại.
- Không hardcode đường dẫn máy; mọi path tương đối + cấu hình qua `.env`.
- Đổi máy: chỉ cần `git clone` → `npm install` → `npm run setup`.

## Trạng thái
Đang ở **Pha 0** — chứng minh pipeline chạy thật bằng CLI. Web UI (grid trend + chọn nhiều + hàng đợi) làm sau ở Pha 4.
