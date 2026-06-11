// Cau hinh chinh duoc tu web (luu data/settings.json) — de nguoi dung khong can
// sua .env tay. Hien dung cho cookie Douyin. .env van la phuong an du phong.
// LUU Y: settings.json co the chua cookie nhay cam -> da gitignore, KHONG commit.
import fs from "node:fs";
import path from "node:path";
import { ROOT, CONFIG } from "../config.js";

const FILE = path.join(ROOT, "data", "settings.json");

export interface Settings {
  douyinCookie?: string;
}

function read(): Settings {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return typeof j === "object" && j ? j : {};
  } catch {
    return {};
  }
}

function write(s: Settings): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(s, null, 2));
}

// Cookie hieu luc: uu tien settings (dat tu web) -> fallback .env (DOUYIN_COOKIE).
export function getDouyinCookie(): string {
  const fromSettings = (read().douyinCookie ?? "").trim();
  return fromSettings || CONFIG.DOUYIN_COOKIE.trim();
}

export function setDouyinCookie(value: string): void {
  const s = read();
  s.douyinCookie = (value ?? "").trim();
  write(s);
}

// Nguon cookie hien tai (de hien thi tren UI).
export function cookieSource(): "settings" | "env" | "none" {
  if ((read().douyinCookie ?? "").trim()) return "settings";
  if (CONFIG.DOUYIN_COOKIE.trim()) return "env";
  return "none";
}

// Che bot gia tri cookie de hien thi an toan (chi do dai + duoi).
export function cookiePreview(): string {
  const c = getDouyinCookie();
  if (!c) return "";
  return `${c.length} ky tu (…${c.slice(-6)})`;
}
