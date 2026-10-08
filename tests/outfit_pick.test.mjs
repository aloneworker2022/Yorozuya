// node tests/outfit_pick.test.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const O = await import(`${dir}outfit_pick.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };

const look = {
  wardrobe: ["簡約日系", "甜美洋裝風"],
  eroticOutfits: ["黑色蕾絲胸罩配吊襪帶", "深紅情趣連身衣"],
  sleepOutfits: ["條紋棉質睡衣套裝"],
};

t("晚上 6 點前從白 T 和日常衣櫃抽，不穿情趣裝", () => {
  assert.deepEqual(O.pickSummonOutfit(look, { hour: 17, rng: () => 0 }), {
    name: O.BASE_OUTFIT, pick: "base",
  });
  assert.deepEqual(O.pickSummonOutfit(look, { hour: 17, rng: () => 0.34 }), {
    name: "簡約日系", pick: 0,
  });
  assert.deepEqual(O.pickSummonOutfit(look, { hour: 17, rng: () => 0.9 }), {
    name: "甜美洋裝風", pick: 1,
  });
});

t("晚上 6 點起有情趣裝就只從情趣裝抽", () => {
  assert.deepEqual(O.pickSummonOutfit(look, { hour: 18, rng: () => 0 }), {
    name: "黑色蕾絲胸罩配吊襪帶", pick: "e0",
  });
  assert.deepEqual(O.pickSummonOutfit(look, { hour: 23, rng: () => 0.9 }), {
    name: "深紅情趣連身衣", pick: "e1",
  });
});

t("晚上 6 點但沒有情趣裝，仍從白 T 和日常抽", () => {
  const plain = { wardrobe: ["簡約日系"], eroticOutfits: [] };
  assert.equal(O.pickSummonOutfit(plain, { hour: 21, rng: () => 0 }).name, O.BASE_OUTFIT);
  assert.equal(O.pickSummonOutfit(plain, { hour: 21, rng: () => 0.9 }).name, "簡約日系");
});

t("沒有別套就不換", () => {
  assert.equal(O.pickChangeOutfit({ wardrobe: [] }, O.BASE_OUTFIT, () => 0), null);
});

t("換衣避開現在這套，白 T、日常、情趣、睡衣都在池裡", () => {
  const next = O.pickChangeOutfit(look, O.BASE_OUTFIT, () => 0);
  assert.equal(next.name, "簡約日系");
  assert.notEqual(next.name, O.BASE_OUTFIT);
  const last = O.pickChangeOutfit(look, "條紋棉質睡衣套裝", () => 0.999);
  assert.equal(last.name, "深紅情趣連身衣");
  assert.notEqual(last.name, "條紋棉質睡衣套裝");
});

console.log(`${pass} passed`);
