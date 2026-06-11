// Tu khoi dong API Douyin self-host (Evil0ctal) o vendor/douyin-api.
// Giup tai video on dinh ma KHONG can cookies. Neu chua cai -> bao dung public.
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { ROOT } from "../config.js";
import { log } from "../util/log.js";
import { getDouyinCookie } from "./settings.js";

export const DOUYIN_API_PORT = 8642;
const API_DIR = path.join(ROOT, "vendor", "douyin-api");
let child: ChildProcess | null = null;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Nhet cookie Douyin (dat tu web settings, fallback .env) vao config crawler -> tai on dinh, het 400.
export function applyDouyinCookie(): void {
  const cookie = getDouyinCookie();
  if (!cookie) return;
  const cfg = path.join(API_DIR, "crawlers", "douyin", "web", "config.yaml");
  if (!fs.existsSync(cfg)) return;
  const text = fs.readFileSync(cfg, "utf8");
  // Thay nguyen dong "      Cookie: ..." bang cookie moi (giu thut dau dong).
  const replaced = text.replace(/^(\s*)Cookie:.*$/m, `$1Cookie: ${cookie}`);
  if (replaced !== text) {
    fs.writeFileSync(cfg, replaced);
    log.ok("Da gan cookie Douyin moi vao API self-host.");
  }
}

export function pythonBin(): string {
  return os.platform() === "win32"
    ? path.join(API_DIR, ".venv", "Scripts", "python.exe")
    : path.join(API_DIR, ".venv", "bin", "python");
}

export function douyinApiInstalled(): boolean {
  return fs.existsSync(pythonBin()) && fs.existsSync(path.join(API_DIR, "app", "main.py"));
}

export const DOUYIN_API_LOCAL_BASE = `http://127.0.0.1:${DOUYIN_API_PORT}`;

async function isUp(): Promise<boolean> {
  try {
    const r = await fetch(`${DOUYIN_API_LOCAL_BASE}/docs`, {
      signal: AbortSignal.timeout(2000),
    });
    return r.ok;
  } catch {
    return false;
  }
}

// Public: API Douyin self-host co dang chay khong (de quyet dinh kiem tra cookie o dau).
export function isDouyinApiUp(): Promise<boolean> {
  return isUp();
}

// Bao dam API dang chay; tra ve true neu san sang.
export async function ensureDouyinApi(): Promise<boolean> {
  if (await isUp()) {
    log.ok(`API Douyin da chay (cong ${DOUYIN_API_PORT})`);
    return true;
  }
  if (!douyinApiInstalled()) {
    log.warn("Chua cai API Douyin self-host. Chay `npm run setup` de tai. Tam dung API public (kem on dinh).");
    return false;
  }
  applyDouyinCookie(); // nhet cookie that (neu co) truoc khi chay
  log.step("Khoi dong API Douyin noi bo...");
  child = spawn(
    pythonBin(),
    ["-m", "uvicorn", "app.main:app", "--host", "127.0.0.1", "--port", String(DOUYIN_API_PORT)],
    { cwd: API_DIR, stdio: "ignore" }
  );
  child.on("exit", (code) => {
    if (code) log.warn(`API Douyin thoat (code ${code})`);
    child = null;
  });
  for (let i = 0; i < 45; i++) {
    if (await isUp()) {
      log.ok(`API Douyin san sang: http://127.0.0.1:${DOUYIN_API_PORT}`);
      return true;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  log.warn("API Douyin khong len kip — dung fallback public.");
  return false;
}

export function stopDouyinApi(): void {
  if (child) {
    child.kill();
    child = null;
  }
}

// Khoi dong lai API Douyin de nap cookie/config moi (goi sau khi luu cookie tu web).
// Tra ve true neu API self-host len lai duoc (khong thi dung public fallback).
export async function restartDouyinApi(): Promise<boolean> {
  if (!douyinApiInstalled()) {
    // Khong co self-host -> chi co the dung API public; cookie chua dung den.
    return false;
  }
  log.step("Khoi dong lai API Douyin de nap cookie moi...");
  stopDouyinApi();
  // Cho cong tat han truoc khi bat lai.
  for (let i = 0; i < 20; i++) {
    if (!(await isUp())) break;
    await sleep(500);
  }
  return ensureDouyinApi();
}
