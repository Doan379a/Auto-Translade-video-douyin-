import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveId } from "../src/util/id.js";

test("deriveId lay chuoi so dai (awemeId) trong link", () => {
  assert.equal(deriveId("https://www.douyin.com/video/7412345678901234567"), "7412345678901234567");
  assert.equal(deriveId("https://v.douyin.com/abc/?id=1234567890"), "1234567890");
});

test("deriveId on dinh: cung url -> cung id", () => {
  const u = "https://v.douyin.com/iLkAbCd/"; // khong co chuoi so >=8
  assert.equal(deriveId(u), deriveId(u));
  assert.match(deriveId(u), /^vid_[0-9a-f]{12}$/);
});

test("deriveId: url khac nhau -> id khac nhau", () => {
  assert.notEqual(deriveId("https://v.douyin.com/aaaa/"), deriveId("https://v.douyin.com/bbbb/"));
});

test("deriveId: bo qua so ngan (<8 chu so)", () => {
  // '1234567' chi 7 chu so -> khong tinh la awemeId -> bam hash
  assert.match(deriveId("https://x/clip-1234567"), /^vid_/);
});
