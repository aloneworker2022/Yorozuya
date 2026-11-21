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
  assert.equal(g.look.bust, [g.look.cup, g.look.breast_shape, g.look.breast_splay].filter(Boolean).join("、"));
  if (g.look.breast_splay) assert.ok(G.splayAllowed(g.look.cup, g.look.breast_shape), `不該外擴：${g.look.bust}`);
}
// 2026-11-21 使用者：外擴可以、八字不行；外擴不是乳型，是另一個維度（look.breast_splay）
assert.ok(!A.breast_shape.some((s) => /八字|外擴/.test(s.text)), "乳型池子不要外擴／八字");
{
  const old1 = { cup: "E 罩杯", breast_shape: "外擴／八字", bust: "E 罩杯、外擴／八字" };
  assert.equal(G.fixBreastShapeText(old1), true);
  assert.deepEqual(old1, { cup: "E 罩杯", breast_shape: "自然圓潤", breast_splay: "外擴", bust: "E 罩杯、自然圓潤、外擴" });
  assert.equal(G.fixBreastShapeText(old1), false);
  const old2 = { cup: "F 罩杯", breast_shape: "外擴型", bust: "F 罩杯、外擴型" };
  assert.equal(G.fixBreastShapeText(old2), true);
  assert.equal(old2.bust, "F 罩杯、自然圓潤、外擴");
  assert.equal(G.fixBreastShapeText({ cup: "E 罩杯", breast_shape: "木瓜型", breast_splay: "外擴", bust: "E 罩杯、木瓜型、外擴" }), false);
  assert.equal(G.splayAllowed("B 罩杯", "木瓜型"), false);
  assert.equal(G.splayAllowed("E 罩杯", "半球型"), false);
  assert.equal(G.splayAllowed("E 罩杯", "極密著深溝"), false);
  assert.equal(G.splayAllowed("C 罩杯", "平坦／微隆"), false);
  assert.equal(G.splayAllowed("F 罩杯", "母乳型沉重下垂"), true);
  // 能外擴的組合，大約 40% 外擴
  let n = 0, k = 0;
  for (let i = 0; i < 4000; i++) { const g = G.generateGirl({ luck: i % 100 }); if (G.splayAllowed(g.look.cup, g.look.breast_shape)) { n++; if (g.look.breast_splay) k++; } }
  assert.ok(n > 500 && Math.abs(k / n - .4) < .05, `外擴比例 ${k}/${n}`);
}
console.log("ok - breast_fit");
