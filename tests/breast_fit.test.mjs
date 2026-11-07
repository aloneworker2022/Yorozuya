// node tests/breast_fit.test.mjs — 罩杯 × 乳型配對（2026-11-07）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

const dir = pathToFileURL(new URL("../web/content/", import.meta.url).pathname).href;
const pools = JSON.parse(readFileSync(new URL("../web/content/persona_pools.json", import.meta.url)));
const G = await import(dir + "girl_gen.js?v=6");
G.setPools(pools);

const A = pools.female.appearance;
const sdtags = readFileSync(new URL("../server/sdtags.py", import.meta.url), "utf8");

// 池子：A～I 都有、罩杯字串不帶乳型字、每個乳型都在配對表、sdtags 都查得到
const letters = new Set(A.cup.map((c) => c.cup));
assert.deepEqual([...letters].sort(), G.CUP_LETTERS);
for (const c of A.cup) {
  assert.ok(!/挺俏|圓潤|乳溝|下垂|水滴|半球|饅頭|木瓜|外擴/.test(c.text), "罩杯不寫形狀：" + c.text);
  assert.ok(sdtags.includes(`"${c.text}"`), "sdtags 缺罩杯：" + c.text);
}
for (const s of A.breast_shape) {
  assert.ok(G.BREAST_FIT[s.text], "配對表缺乳型：" + s.text);
  assert.ok(sdtags.includes(`"${s.text}"`), "sdtags 缺乳型：" + s.text);
}
// 每個罩杯至少有 3 種乳型可抽
for (const L of G.CUP_LETTERS) {
  const ok = A.breast_shape.filter((s) => G.breastFit(L + " 罩杯", s.text) > 0);
  assert.ok(ok.length >= 3, L + " 可抽乳型太少");
}
// 指定的不可能
assert.equal(G.breastFit("A 罩杯、小巧清秀", "母乳型沉重下垂"), 0);
assert.equal(G.breastFit("A 罩杯", "極密著深溝"), 0);
assert.equal(G.breastFit("I 罩杯", "挺俏上挺"), 0);
assert.equal(G.breastFit("D 罩杯", "母乳型沉重下垂"), 0);
assert.equal(G.breastFit("舊字串沒罩杯", "母乳型沉重下垂"), 1);

// 抽 3000 次（含高 luck）：從不抽出不可能的組合
for (let i = 0; i < 3000; i++) {
  const g = G.generateGirl({ luck: i % 2 ? 100 : 0 });
  assert.ok(g, "生成失敗");
  assert.ok(G.breastFit(g.look.cup, g.look.breast_shape) > 0, `不合：${g.look.cup}／${g.look.breast_shape}`);
  assert.equal(g.look.bust, `${g.look.cup}、${g.look.breast_shape}`);
}
console.log("ok - breast_fit");
