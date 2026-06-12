import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildSrt } from "../src/pipeline/subtitle.js";
import type { Segment } from "../src/pipeline/types.js";

function render(segments: Segment[]): string {
  const out = path.join(os.tmpdir(), `srt-test-${process.pid}-${segments.length}.srt`);
  buildSrt(segments, out);
  const txt = fs.readFileSync(out, "utf8");
  fs.rmSync(out, { force: true });
  return txt;
}

test("dinh dang SRT chuan: so thu tu, moc gio, noi dung", () => {
  const txt = render([{ start: 0, end: 1.5, text: "ni hao", translated: "xin chao" }]);
  assert.match(txt, /^1\r?\n/);
  assert.match(txt, /00:00:00,000 --> 00:00:01,500/);
  assert.match(txt, /xin chao/);
});

test("thieu ban dich (undefined) -> fallback ve text goc", () => {
  const txt = render([{ start: 0, end: 1, text: "goc" }]); // khong co translated
  assert.match(txt, /\ngoc\b/);
});

test("moc gio gio:phut:giay,mili dung voi gia tri lon", () => {
  const txt = render([{ start: 3661.25, end: 3661.5, text: "x", translated: "y" }]);
  // 3661.25s = 1h 01m 01s 250ms
  assert.match(txt, /01:01:01,250 --> 01:01:01,500/);
});

test("end <= start -> tu keo dai toi thieu 2s", () => {
  const txt = render([{ start: 10, end: 10, text: "x", translated: "y" }]);
  assert.match(txt, /00:00:10,000 --> 00:00:12,000/);
});

test("nhieu cau -> danh so tang dan", () => {
  const txt = render([
    { start: 0, end: 1, text: "a", translated: "A" },
    { start: 1, end: 2, text: "b", translated: "B" },
  ]);
  assert.match(txt, /(^|\n)1\r?\n/);
  assert.match(txt, /(^|\n)2\r?\n/);
});
