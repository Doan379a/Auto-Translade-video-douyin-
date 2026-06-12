import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeSegments } from "../src/pipeline/merge.js";
import type { Segment } from "../src/pipeline/types.js";

const seg = (start: number, end: number, text: string): Segment => ({ start, end, text });

test("gop 2 doan sat nhau, ngan -> 1 doan", () => {
  const out = mergeSegments([seg(0, 1, "xin"), seg(1.2, 2, "chao")]);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, "xin chao");
  assert.equal(out[0].start, 0);
  assert.equal(out[0].end, 2);
});

test("KHONG gop khi khoang cach > maxGap", () => {
  const out = mergeSegments([seg(0, 1, "a"), seg(3, 4, "b")]); // gap 2s > 0.6
  assert.equal(out.length, 2);
});

test("KHONG gop khi tong thoi luong > maxDur", () => {
  const out = mergeSegments([seg(0, 4, "a"), seg(4.1, 9, "b")]); // dur 9 > 5
  assert.equal(out.length, 2);
});

test("KHONG gop khi tong so ky tu > maxChars", () => {
  const long = "x".repeat(30);
  const out = mergeSegments([seg(0, 1, long), seg(1.1, 2, long)]); // 60 > 40
  assert.equal(out.length, 2);
});

test("ton trong options tuy chinh", () => {
  const out = mergeSegments([seg(0, 1, "a"), seg(1.5, 2, "b")], { maxGap: 1 });
  assert.equal(out.length, 1); // gap 0.5 <= 1
});

test("khong sua mang dau vao (tra ban sao)", () => {
  const input = [seg(0, 1, "a"), seg(1.1, 2, "b")];
  const copy = JSON.parse(JSON.stringify(input));
  mergeSegments(input);
  assert.deepEqual(input, copy);
});

test("mang rong -> mang rong", () => {
  assert.deepEqual(mergeSegments([]), []);
});
