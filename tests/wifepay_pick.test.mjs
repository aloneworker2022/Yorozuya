// node tests/wifepay_pick.test.mjs — 每姿勢最多兩張、隨機 1～2 張（web/content/wifepay_reveal.js）
import assert from "node:assert/strict";
import { pickItems, itemsForPose, POSE_SELECT_MAX } from "../web/content/wifepay_reveal.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

const items = [
  { id: "a", url: "/assets/wifepay/gallery/a.png", tags: ["cowgirl"] },
  { id: "b", url: "/assets/wifepay/gallery/b.png", tags: ["doggy"] },
  { id: "c", url: "/assets/wifepay/gallery/c.png", tags: ["cowgirl"] },
];

t("上限是 2", () => {
  assert.equal(POSE_SELECT_MAX, 2);
});

t("只從該姿勢已選的抽，不從別的姿勢補", () => {
  const two = pickItems(items, "cowgirl", 2, () => 0);
  assert.deepEqual(new Set(two.map((x) => x.id)), new Set(["a", "c"]));
  const one = pickItems(items, "doggy", 2, () => 0);
  assert.deepEqual(one.map((x) => x.id), ["b"]);
  assert.deepEqual(pickItems(items, "missionary", 2), []);
});

t("已選 2 張時隨機 1 或 2", () => {
  // 抽 2 張且池子剛好 2 張時不會再消耗亂數；先給 >=0.5 才能測到 2
  let i = 0;
  const rolls = [0.7, 0.1, 0.9, 0.05];
  const counts = new Set();
  for (let k = 0; k < 8; k++) {
    counts.add(pickItems(items, "cowgirl", undefined, () => rolls[i++ % rolls.length]).length);
  }
  assert.deepEqual(counts, new Set([1, 2]));
});

t("超過 2 張只抽前 2 張", () => {
  const extra = items.concat([{ id: "d", url: "/assets/wifepay/gallery/d.png", tags: ["cowgirl"] }]);
  const got = pickItems(extra, "cowgirl", 2, () => 0);
  assert.equal(got.length, 2);
  assert.ok(got.every((x) => x.id === "a" || x.id === "c"));
  assert.deepEqual(itemsForPose(extra, "cowgirl").map((x) => x.id), ["a", "c", "d"]);
});

t("空圖庫", () => {
  assert.deepEqual(pickItems([], "cowgirl", 2), []);
  assert.deepEqual(pickItems(null, "cowgirl"), []);
});

console.log(`wifepay_pick.test: ${n} ok`);
