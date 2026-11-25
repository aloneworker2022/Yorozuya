// node tests/touch_lines.test.mjs — 摸她的回應台詞庫（web/content/touch_lines.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const M = await import(`${dir}touch_lines.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };

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

t("解析新格式：態度 × 部位；要的態度每格不夠 2 句回 null", () => {
  const txt = "[拒絕・胸]\n你幹嘛！\n手拿開\n[拒絕・下體]\n住手\n不要\n[拒絕・腰臀]\n放開\n走開啦\n[無奈拒絕・胸]\n不是說了不要嗎……\n只能一下喔\n[無奈拒絕・下體]\n那裡不行……\n才沒有感覺\n[無奈拒絕・腰臀]\n你很黏欸\n放手啦……";
  const b = M.parseTouchBank(txt, ["refuse", "reluctant_refuse"]);
  assert.deepEqual(b.refuse.breast, ["你幹嘛！", "手拿開"]);
  assert.deepEqual(b.reluctant_refuse.groin, ["那裡不行……", "才沒有感覺"]);
  assert.equal(M.parseTouchBank(txt, ["refuse", "reluctant_refuse", "reluctant_yield"]), null);
  assert.deepEqual(M.tierAttitudes("stranger"), ["refuse", "reluctant_refuse"]);
  assert.deepEqual(M.tierAttitudes("wife"), ["reluctant_yield", "welcome"]);
});

t("挑句子：照態度挑；台詞庫優先、沒有那一格就最接近的、再沒有用內建；最近用過的先不挑", () => {
  const bank = { tiers: { wife: { welcome: { breast: ["a", "b", "c"] }, reluctant_yield: { breast: ["y"] } } } };
  const recent = [];
  const got = new Set([0, 1, 2].map(() => M.pickTouchLine(bank, "wife", "breast", recent, "welcome")));
  assert.deepEqual([...got].sort(), ["a", "b", "c"]);
  assert.equal(M.pickTouchLine(bank, "wife", "breast", [], "reluctant_refuse"), "y");   // 妻子沒有無奈拒絕 → 最接近的無奈順從
  assert.ok(M.TOUCH_FALLBACK.friend.reluctant_yield.groin.includes(M.pickTouchLine(bank, "friend", "groin", [], "reluctant_yield")));
  assert.ok(M.TOUCH_FALLBACK.stranger.refuse.waist.includes(M.pickTouchLine(null, "stranger", "waist", [])));
  assert.ok(M.TOUCH_FALLBACK.stranger.reluctant_refuse.breast.includes(M.pickTouchLine(null, "stranger", "breast", [], "welcome")));   // 陌生最多無奈拒絕
  const old = { tiers: { girlfriend: { breast: ["舊的"] } } };   // 舊格式（rev 1）不拿來用
  assert.ok(M.TOUCH_FALLBACK.girlfriend.welcome.breast.includes(M.pickTouchLine(old, "girlfriend", "breast", [], "welcome")));
});

t("內建台詞：每帶都有該帶會用到的態度、每格至少 4 句；老公只出現在妻子帶", () => {
  for (const tier of M.TOUCH_TIERS) for (const a of M.tierAttitudes(tier)) for (const z of M.TOUCH_BANK_ZONES) assert.ok(M.TOUCH_FALLBACK[tier][a][z].length >= 4, `${tier}/${a}/${z}`);
  for (const tier of ["stranger", "friend", "girlfriend"]) for (const a of Object.keys(M.TOUCH_FALLBACK[tier])) for (const z of M.TOUCH_BANK_ZONES) for (const l of M.TOUCH_FALLBACK[tier][a][z]) assert.ok(!l.includes("老公"), l);
});

t("回應：胸部、下體一聲嬌喘再接台詞（只有一聲）；腰臀只在興奮時輕輕一聲", () => {
  const line = "你幹嘛！手拿開，我會生氣喔。";
  const G = /^(?:呀|啊|咿|嗯|哈)[呀啊咿嗯哈]*(?:…|！)*♡?/;
  for (let lvl = 0; lvl <= 4; lvl++) for (const z of ["breast", "groin"]) for (let i = 0; i < 30; i++) {
    const r = M.touchReply(line, z, lvl), g = r.match(G);
    assert.ok(g && r.slice(g[0].length) === line, r);   // 開頭一聲，後面就是原句（中間、句尾都不插）
    assert.ok(g[0].length <= 6, r);
  }
  assert.ok(!/♡/.test(M.touchReply(line, "breast", 0)));   // 沒興奮：嚇一跳的短叫
  assert.equal(M.touchReply(line, "waist", 0), line);
  assert.equal(M.touchReply(line, "waist", 1), line);
  assert.equal(M.touchReply(line, "waist", 2), "嗯…" + line);
  assert.equal(M.moanLevelOf("none"), 0);
  assert.equal(M.moanLevelOf("aroused"), 2);
  assert.equal(M.moanLevelOf("slight", { climaxNow: true }), 4);
});

t("prompt：妻子帶可以叫老公，其他帶禁止", () => {
  const w = M.touchBankMessages("wife", { name: "莉莉", base: "傲嬌" })[0].content;
  const s = M.touchBankMessages("stranger", { name: "莉莉", base: "傲嬌" })[0].content;
  assert.ok(w.includes("老公") && !w.includes("禁止叫老公"));
  assert.ok(s.includes("禁止叫老公") && s.includes("生氣"));
  const u = M.touchBankMessages("friend", { name: "莉莉", base: "傲嬌" })[1].content;
  assert.ok(u.includes("[拒絕・胸]") && u.includes("[無奈順從・腰臀]") && !u.includes("[迎合"));
});

console.log(`\n${pass} passed`);
