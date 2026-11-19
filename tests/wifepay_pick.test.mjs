// node tests/wifepay_pick.test.mjs — 同姿勢可多張，使用時隨機抽 1～2 張
import assert from "node:assert/strict";
import { pickItems, itemsForPose, PICK_MAX } from "../web/content/wifepay_reveal.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

const items = [
  { id: "a", url: "/assets/wifepay/gallery/a.png", tags: ["cowgirl"] },
  { id: "b", url: "/assets/wifepay/gallery/b.png", tags: ["doggy"] },
  { id: "c", url: "/assets/wifepay/gallery/c.png", tags: ["cowgirl"] },
];

t("一次最多抽 2 張（不是圖庫上限）", () => {
  assert.equal(PICK_MAX, 2);
});

t("只從該姿勢已選的抽，不從別的姿勢補", () => {
  const two = pickItems(items, "cowgirl", 2, () => 0);
  assert.deepEqual(new Set(two.map((x) => x.id)), new Set(["a", "c"]));
  const one = pickItems(items, "doggy", 2, () => 0);
  assert.deepEqual(one.map((x) => x.id), ["b"]);
  assert.deepEqual(pickItems(items, "missionary", 2), []);
});

t("已選 2 張時隨機 1 或 2", () => {
  let i = 0;
  const rolls = [0.7, 0.1, 0.9, 0.05];
  const counts = new Set();
  for (let k = 0; k < 8; k++) {
    counts.add(pickItems(items, "cowgirl", undefined, () => rolls[i++ % rolls.length]).length);
  }
  assert.deepEqual(counts, new Set([1, 2]));
});

t("超過 2 張時仍從全部已選的抽，一次最多 2 張", () => {
  const extra = items.concat([{ id: "d", url: "/assets/wifepay/gallery/d.png", tags: ["cowgirl"] }]);
  const got = pickItems(extra, "cowgirl", 2, () => 0);
  assert.equal(got.length, 2);
  assert.ok(got.every((x) => ["a", "c", "d"].includes(x.id)));
  assert.deepEqual(itemsForPose(extra, "cowgirl").map((x) => x.id), ["a", "c", "d"]);
  const seen = new Set();
  let i = 0;
  const rolls = [0.1, 0.2, 0.3, 0.8, 0.05, 0.95, 0.4, 0.6, 0.15, 0.7];
  const roll = () => rolls[i++ % rolls.length];
  for (let k = 0; k < 30; k++) {
    for (const x of pickItems(extra, "cowgirl", 2, roll)) seen.add(x.id);
  }
  assert.deepEqual(seen, new Set(["a", "c", "d"]));
});

t("空圖庫", () => {
  assert.deepEqual(pickItems([], "cowgirl", 2), []);
  assert.deepEqual(pickItems(null, "cowgirl"), []);
});

console.log(`wifepay_pick.test: ${n} ok`);
