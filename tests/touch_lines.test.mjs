// node tests/touch_lines.test.mjs — 摸她的回應台詞庫（web/content/touch_lines.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const M = await import(`${dir}touch_lines.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const strip = (s) => s.replace(/[嗯啊哈唔]+(…♡|——|♡|…|～)/g, "");

t("關係帶：陌生／朋友／女友／妻子", () => {
  assert.equal(M.touchTierOf("stranger"), "stranger");
  assert.equal(M.touchTierOf("acquaintance"), "stranger");
  assert.equal(M.touchTierOf("friend"), "friend");
  assert.equal(M.touchTierOf("close_friend"), "friend");
  assert.equal(M.touchTierOf("girlfriend"), "girlfriend");
  assert.equal(M.touchTierOf("lover"), "girlfriend");
  assert.equal(M.touchTierOf("wife"), "wife");
  assert.equal(M.touchTierOf("pathological_wife"), "wife");
  assert.equal(M.touchTierOf(""), "stranger");
});

t("解析模型回的格式（編號、引號、括號旁白去掉）", () => {
  const b = M.parseTouchBank("[胸]\n1. 你幹嘛！\n「手拿開」\n（她瞪你）不要碰\n[下體]\n住手\n- 不要\n【腰臀】\n放開\n走開啦");
  assert.deepEqual(b.breast, ["你幹嘛！", "手拿開", "不要碰"]);
  assert.deepEqual(b.groin, ["住手", "不要"]);
  assert.deepEqual(b.waist, ["放開", "走開啦"]);
  assert.equal(M.parseTouchBank("[胸]\n只有一句"), null);
});

t("挑句子：台詞庫優先、沒有就用內建；最近用過的先不挑", () => {
  const bank = { tiers: { wife: { breast: ["a", "b", "c"] } } };
  const recent = [];
  const got = new Set([M.pickTouchLine(bank, "wife", "breast", recent), M.pickTouchLine(bank, "wife", "breast", recent), M.pickTouchLine(bank, "wife", "breast", recent)]);
  assert.deepEqual([...got].sort(), ["a", "b", "c"]);
  assert.ok(M.TOUCH_FALLBACK.friend.groin.includes(M.pickTouchLine(bank, "friend", "groin", [])));
  assert.ok(M.TOUCH_FALLBACK.stranger.waist.includes(M.pickTouchLine(null, "stranger", "waist", [])));
});

t("內建台詞：老公只出現在妻子帶", () => {
  for (const tier of ["stranger", "friend", "girlfriend"]) for (const z of M.TOUCH_BANK_ZONES) for (const l of M.TOUCH_FALLBACK[tier][z]) assert.ok(!l.includes("老公"), l);
});

t("呻吟：程度 0 原樣；程度越高插越多；拿掉呻吟還是原句", () => {
  const line = "你幹嘛！手拿開，我會生氣喔。";
  assert.equal(M.moanify(line, 0), line);
  const count = (lvl) => { let n = 0; for (let i = 0; i < 300; i++) n += (M.moanify(line, lvl).match(/[嗯啊哈唔]+(…♡|——|♡|…|～)/g) || []).length; return n / 300; };
  const c1 = count(1), c2 = count(2), c4 = count(4);
  assert.ok(c1 >= 1 && c1 < c2 && c2 < c4, `${c1} ${c2} ${c4}`);
  for (let i = 0; i < 50; i++) assert.equal(strip(M.moanify(line, 2)), line);
  assert.equal(M.moanLevelOf("none"), 0);
  assert.equal(M.moanLevelOf("aroused"), 2);
  assert.equal(M.moanLevelOf("slight", { climaxNow: true }), 4);
});

t("prompt：妻子帶可以叫老公，其他帶禁止", () => {
  const w = M.touchBankMessages("wife", { name: "莉莉", base: "傲嬌" })[0].content;
  const s = M.touchBankMessages("stranger", { name: "莉莉", base: "傲嬌" })[0].content;
  assert.ok(w.includes("老公") && !w.includes("禁止叫老公"));
  assert.ok(s.includes("禁止叫老公") && s.includes("生氣"));
});

console.log(`\n${pass} passed`);
