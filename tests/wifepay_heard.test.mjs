// node tests/wifepay_heard.test.mjs — 隔門聽不清（web/content/wifepay_heard.js）
import assert from "node:assert/strict";
import {
  hearLine, hearThroughDoor, hearDialog, tokenizeHeard,
} from "../web/content/wifepay_heard.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };

const SRC = "你怎麼可以射進去";
const NAR = "暖黃燈下，她仰躺在凌亂的床單上，眉心微蹙、唇瓣微張，眼尾含著水光卻還是看著壓上來的男人。";

t("旁白不變、對白非空", () => {
  const row = hearDialog({ narration: NAR, man: "夾這麼緊……錢花得真值。", wife: SRC }, { enabled: true, level: "mid", seed: 7 });
  assert.equal(row.narration, NAR);
  assert.ok(row.man && row.wife);
  assert.equal(row.wife_orig, SRC);
});

t("關掉或旁白 side 都原樣", () => {
  assert.equal(hearThroughDoor(SRC, { side: "wife", enabled: false, seed: 3, level: "heavy" }), SRC);
  assert.equal(hearThroughDoor(NAR, { side: "narration", seed: 3, level: "heavy" }), NAR);
});

t("同一顆種子同一句結果固定，換種子會變", () => {
  const a = hearThroughDoor(SRC, { side: "wife", level: "mid", seed: 42, mode: "a" });
  const b = hearThroughDoor(SRC, { side: "wife", level: "mid", seed: 42, mode: "a" });
  assert.equal(a, b);
  assert.ok(a);
  const variants = new Set();
  for (let s = 1; s < 40; s++) variants.add(hearThroughDoor(SRC, { side: "wife", level: "mid", seed: s, mode: "a" }));
  assert.ok(variants.size >= 2);
});

t("斷續至少兩段且非空、保住大意", () => {
  for (let seed = 1; seed < 30; seed++) {
    const hit = hearLine(SRC, { side: "wife", level: "mid", seed, mode: "a" });
    assert.ok(hit.text);
    assert.ok(hit.fragments.length >= 2, `seed ${seed} frags=${hit.fragments}`);
    const kept = hit.fragments.join("");
    assert.ok(kept.includes("你") || hit.text.includes("你"));
    assert.ok(/[可射進]/.test(kept));
    assert.ok(!hit.text.includes("幼"));
  }
});

t("吟叫模式非空，妻子會穿插吟叫", () => {
  let moaned = false;
  for (let seed = 1; seed < 40; seed++) {
    const hit = hearLine(SRC, { side: "wife", level: "heavy", seed, mode: "b" });
    assert.ok(hit.text);
    if (/啊|嗯|哈啊|痾|好爽/.test(hit.text)) moaned = true;
  }
  assert.ok(moaned);
});

t("分詞能切出關鍵詞", () => {
  const tok = tokenizeHeard(SRC);
  assert.ok(tok.includes("你"));
  assert.ok(tok.includes("怎麼"));
  assert.ok(tok.includes("可以"));
  assert.ok(tok.includes("射進去") || (tok.includes("射進") && tok.includes("去")));
});

console.log(`wifepay_heard.test: ${n} ok`);
