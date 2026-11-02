// node tests/swap_wife_pair_talk.test.mjs — pt287u：點老婆×對方丈夫 → 老婆對你說話（右側立繪；害羞／失神／高潮）
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const X = await import(`${dir}swap_chat_sex.js`);
const bar = readFileSync(`${dir}swap_bar.js`, "utf8");
let pass = 0; const t = (n, f) => { f(); pass++; console.log("ok -", n); };
t("句庫涵蓋 害羞／懊悔／讚美對方丈夫", () => {
  assert.deepEqual(Object.keys(X.WIFE_PAIR_LINES).sort(), ["praise", "regret", "shy"]);
  for (const b of Object.values(X.WIFE_PAIR_LINES)) assert.ok(b.length >= 3);
  assert.ok(X.WIFE_PAIR_LINES.praise.every((l) => l.includes("{h}") || /他/.test(l)));
  assert.ok(X.WIFE_PAIR_LINES.regret.some((l) => l.includes("老公")));
});
t("表情只從 shy／vacant／climax 抽；{h} 換成名字；不連續重複", () => {
  let last = ""; for (let i = 0; i < 300; i++) { const r = X.wifePairLine("阿明", Math.random, last); assert.ok(X.WIFE_PAIR_EXPR.includes(r.expr)); assert.ok(!r.text.includes("{h}")); assert.notEqual(r.text, last); last = r.text; }
  for (const e of X.WIFE_PAIR_EXPR) assert.ok(X.WIFE_PAIR_LOOK[e] && X.WIFE_PAIR_FILTER[e] && X.WIFE_PAIR_EXPR_ZH[e]);
});
t("點雙人圖：先喘息，再老婆右側立繪＋對你說", () => {
  assert.ok(/\.pz \.pzw\{position:absolute;right:0/.test(bar), "右側");
  assert.ok(!/\.pzw\{[^}]*left:/.test(bar), "不放左邊");
  assert.ok(/zoomSay\("wife", sexSfx\(curPair, "wife", 0\)\)[^\n]*\n[^\n]*\n\s*clearTimeout\(wpT\); wpT = setTimeout\(wifeToPlayer/.test(bar));
  assert.ok(bar.includes("`${wn} → 你`"));
});
t("對方妻子內射立繪點擊不受影響", () => {
  assert.ok(bar.includes('["creampie", "climax"].includes(sess.look?.other') && bar.includes("portraitTapLine(look"));
});
console.log(`${pass} passed`);
