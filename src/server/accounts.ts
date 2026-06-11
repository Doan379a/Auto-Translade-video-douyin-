// Quan ly danh sach kenh theo doi (data/accounts.json) cho web UI:
// them/xoa kenh ma KHONG can sua file tay. Giu nguyen "_comment" khi ghi lai.
import fs from "node:fs";
import path from "node:path";
import { ROOT } from "../config.js";

const FILE = path.join(ROOT, "data", "accounts.json");

export interface Account {
  name: string;
  url?: string; // link trang ca nhan Douyin
  secUserId?: string; // hoac sec_user_id (MS4w...)
}

interface AccountsFile {
  _comment?: string;
  accounts: Account[];
}

function readRaw(): AccountsFile {
  try {
    const j = JSON.parse(fs.readFileSync(FILE, "utf8"));
    return { _comment: j._comment, accounts: Array.isArray(j.accounts) ? j.accounts : [] };
  } catch {
    return { accounts: [] };
  }
}

function write(data: AccountsFile): void {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, JSON.stringify(data, null, 2));
}

// Khoa dinh danh on dinh cho 1 kenh (de xoa): secUserId > url > name.
export function accountKey(a: Account): string {
  return (a.secUserId || a.url || a.name || "").trim();
}

export function listAccounts(): (Account & { key: string })[] {
  return readRaw().accounts.map((a) => ({ ...a, key: accountKey(a) }));
}

// Them kenh tu 1 gia tri nguoi dung dan (co the la link sach, secUserId,
// HOAC ca doan caption chia se co link lan ben trong). Tu trich ra phan hop le:
//   1. Uu tien sec_user_id (MS4w...) tim thay bat ky dau (ke ca trong link /user/...)
//   2. Neu khong co -> trich URL dau tien trong chuoi
//   3. Khong co gi -> bao loi ro rang
export function addAccount(value: string, name = ""): Account & { key: string } {
  const raw = (value || "").trim();
  if (!raw) throw new Error("Thieu link hoac ID kenh");

  const sec = raw.match(/MS4w[A-Za-z0-9_-]{20,}/);
  const url = raw.match(/https?:\/\/[^\s]+/);

  const acc: Account = { name: name.trim() };
  if (sec) {
    acc.secUserId = sec[0];
  } else if (url) {
    acc.url = url[0].replace(/[)\].,!?；。]+$/, ""); // bo dau cau dinh cuoi link
  } else {
    throw new Error(
      "Khong tim thay link kenh (https://...) hoac secUserId (MS4w...) trong noi dung da dan. " +
        "Hay dan link TRANG CA NHAN cua kenh, vd: https://www.douyin.com/user/MS4w..."
    );
  }
  if (!acc.name) acc.name = acc.secUserId ? acc.secUserId.slice(0, 14) + "…" : acc.url!;

  const data = readRaw();
  const key = accountKey(acc);
  if (data.accounts.some((a) => accountKey(a) === key)) {
    throw new Error("Kenh nay da co trong danh sach");
  }
  data.accounts.push(acc);
  write(data);
  return { ...acc, key };
}

export function removeAccount(key: string): void {
  const k = (key || "").trim();
  const data = readRaw();
  const before = data.accounts.length;
  data.accounts = data.accounts.filter((a) => accountKey(a) !== k);
  if (data.accounts.length !== before) write(data);
}
