// node tests/swap_dirty_talk.test.mjs — pt284u：旅館做愛她主動＝色話（不摸）；內射立繪點擊＝變態色情句庫
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const X = await import(`${dir}swap_chat_sex.js`);
let pass = 0;
const t = (n, f) => { f(); pass++; console.log("ok -", n); };
t("主動規則：要講色話（大小／老公／喜歡嗎），禁止摸奶摸陰唇", () => {
  for (const w of ["陰莖", "老公", "喜不喜歡", "禁止"]) assert.ok(X.DIRTY_TALK_RULE.includes(w), w);
  assert.ok(/禁止[^。]*摸胸[^。]*摸陰唇/.test(X.DIRTY_TALK_RULE));
});
t("主動句庫：沒有愛撫動作、有比大小／比老公／問喜歡", () => {
  for (const l of X.DIRTY_TALK) for (const g of X.GROPE_WORDS) assert.ok(!l.includes(g), `${l} 有 ${g}`);
  assert.ok(X.DIRTY_TALK.some((l) => l.includes("好大")) && X.DIRTY_TALK.some((l) => l.includes("小")));
  assert.ok(X.DIRTY_TALK.some((l) => l.includes("老公")) && X.DIRTY_TALK.some((l) => l.includes("喜歡")));
  assert.ok(X.DIRTY_TALK.every((l) => !l.includes("妻子")));
  assert.ok(Object.values(X.SWAP_SEX_FB).flat().every((l) => !/你的手|被你碰到/.test(l)), "fallback 不再寫愛撫");
});
t("主動只在做愛中觸發", () => {
  assert.equal(X.isInitiative("thrust", () => 0), true);
  assert.equal(X.isInitiative("thrust", () => 0.99), false);
  assert.equal(X.isInitiative("ejac", () => 0), false);
});
t("內射立繪點擊：從句庫取、不連續重複；有懷孕／安全日／老公以外", () => {
  const l = X.portraitTapLine("creampie", () => 0);
  assert.ok(X.CREAMPIE_TAP.includes(l));
  for (let i = 0; i < 30; i++) { const n = X.portraitTapLine("creampie", Math.random, l); assert.ok(X.CREAMPIE_TAP.includes(n)); assert.notEqual(n, l); }
  const all = X.CREAMPIE_TAP.join("");
  for (const w of ["老公以外", "懷孕", "安全日", "不小心", "變態"]) assert.ok(all.includes(w), w);
  assert.ok(X.CLIMAX_TAP.includes(X.portraitTapLine("climax", () => 0)));
  assert.equal(X.portraitTapLine("nude"), "");
});
t("swap_bar 接上：做愛台詞用 DIRTY_TALK_RULE、立繪點擊用 portraitTapLine", () => {
  const s = readFileSync(`${dir}swap_bar.js`, "utf8");
  assert.ok(s.includes("DIRTY_TALK_RULE") && s.includes("isInitiative(x.event)") && s.includes("portraitTapLine(look"));
});
console.log(`${pass} passed`);
