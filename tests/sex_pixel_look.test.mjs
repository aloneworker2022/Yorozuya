// node tests/sex_pixel_look.test.mjs
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { PIXEL_BUILD, pixelBuildFor, pixelLabiaFor, pixelLabiaColorFor, pixelClitFor, pixelVaginaLenFor, rollVaginaLen, pixelLookFor, VAGINA_LENS } from "../web/content/sex_pixel_look.js";

const pools = JSON.parse(readFileSync(new URL("../web/content/persona_pools.json", import.meta.url), "utf8")).female.appearance;
const txt = (x) => (typeof x === "string" ? x : x.text);
// 池子裡每一種體型都有對到（不是掉到預設）
for (const b of pools.build.map(txt)) assert.ok(PIXEL_BUILD[b], `體型沒對到：${b}`);
assert.deepEqual(new Set(Object.values(PIXEL_BUILD)), new Set(["slim", "std", "plump", "firm", "wide"]));
assert.equal(pixelBuildFor("沒看過的體型"), "std");
// 性器三軸：池子的三級各對到一種
assert.deepEqual(pools.labia_size.map(txt).map(pixelLabiaFor), ["small", "mid", "large"]);
assert.deepEqual(pools.labia_color.map(txt).map(pixelLabiaColorFor), ["pink", "brown", "dark"]);
assert.deepEqual(pools.clitoris_size.map(txt).map(pixelClitFor), ["small", "mid", "large"]);
assert.equal(pixelLabiaColorFor("咖啡色的陰唇"), "brown");
assert.equal(pixelLabiaColorFor(""), "pink");
// 陰道長度：有存就用存的；沒有就固定（同一個人每次一樣）、三級都抽得到
assert.equal(pixelVaginaLenFor({ vagina_len: 1.5 }, "x"), 1.5);
assert.equal(pixelVaginaLenFor({ vagina_len: 9 }, "abc"), pixelVaginaLenFor({}, "abc"));
const seen = new Set();
for (let i = 0; i < 200; i++) seen.add(pixelVaginaLenFor({}, `girl-${i}`));
assert.deepEqual([...seen].sort(), VAGINA_LENS);
assert.deepEqual([0, .4, .99].map((r) => rollVaginaLen(() => r)), [0.5, 1, 1.5]);
// 整包
assert.deepEqual(pixelLookFor({ id: "a", look: { build: "微肉圓潤", labia_size: "外翻飽滿的陰唇", labia_color: "深褐近黑的陰唇", clitoris_size: "腫大突出的陰蒂", vagina_len: 0.5 } }),
  { build: "plump", labia: "large", labcol: "dark", clit: "large", vlen: 0.5 });
// 每一種樣子的圖都在
const V = { 0.5: "05", 1: "10", 1.5: "15" };
for (const b of ["slim", "std", "plump", "firm", "wide"]) for (const n of [`body_${b}`, `legs_${b}`]) assert.ok(existsSync(new URL(`../web/sexpix/${n}.png`, import.meta.url)), n);
for (const c of ["small", "mid", "large"]) {
  assert.ok(existsSync(new URL(`../web/sexpix/clit_${c}.png`, import.meta.url)));
  for (const n of ["closed", "a35", "a70", "open"]) assert.ok(existsSync(new URL(`../web/sexpix/g_${c}_${n}.png`, import.meta.url)));
  for (const v of VAGINA_LENS) for (const n of ["insert", "g1", "g1p", "g2", "g2p", "g2s", "g3", "g3p", "g3s", "g3u", "g3c"]) assert.ok(existsSync(new URL(`../web/sexpix/g_${c}_v${V[v]}_${n}.png`, import.meta.url)), `${c} ${v} ${n}`);
}
for (const v of VAGINA_LENS) assert.ok(existsSync(new URL(`../web/sexpix/lumen_v${V[v]}.png`, import.meta.url)));
console.log("sex_pixel_look ok");
