// node tests/swap_date_flow.test.mjs — 換妻約會流程 2026-10-24：旗號共識／單邊換妻／只能看的旅館／外出服
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
const dir = pathToFileURL(new URL("../web/content/", import.meta.url).pathname).href;
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const F = await import(dir + "swap_flow_rules.js?v=3");
const O = await import(dir + "swap_outfit.js?v=1");
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log("ok -", n); };
const yes = () => 0, no = () => 0.999;

t("全員同意才走；缺一個不行", () => {
  const s = {}; F.ensureMove(s);
  s.move = { wife: true, husband: true, other: false };
  assert.equal(F.allAgree(s), false);
  assert.equal(F.canMove(s, "park", "bar").ok, false);
  s.move.other = true;
  assert.equal(F.allAgree(s), true);
  assert.equal(F.canMove(s, "park", "bar").ok, true);
  assert.equal(F.canMove(s, "park", "ktv").ok, true);
  F.resetMove(s); assert.equal(F.allAgree(s), false);
});
t("公園→酒吧／KTV；第 2 段→旅館要有人換過", () => {
  assert.deepEqual(F.nextOptions("park"), ["bar", "ktv"]);
  const s = { move: { wife: true, husband: true, other: true } };
  assert.equal(F.canMove(s, "bar", "hotel_room").ok, false);
  F.ensurePairs(s); s.pairs.other = "player";
  assert.equal(F.canMove(s, "bar", "hotel_room").ok, true);
});
t("慫恿：單人 +0.3、全體 +0.15、上限 0.6，馬上重擲", () => {
  const s = {}; F.ensureMove(s);
  F.urgeMove(s, "wife", "park", no); assert.ok(Math.abs(s.urge.wife - 0.3) < 1e-9);
  F.urgeMove(s, "wife", "park", no); F.urgeMove(s, "wife", "park", no); assert.ok(s.urge.wife <= 0.6 + 1e-9);
  F.urgeMove(s, "all", "park", yes); assert.ok(F.allAgree(s));
  assert.ok(F.moveP(s, "other", "park") > F.MOVE.base[1]);
});
t("第 3 段（旅館）不重擲旗號", () => { const s = {}; assert.equal(F.moveP(s, "wife", "hotel_room"), 0); });
t("換妻提議：意願上升；兩位妻子各自決定（單邊）", () => {
  const s = { wifeAccept: 0, accept: 0, drunk: {} };
  const w0 = F.ensurePairs(s) && { ...s.swapWill };
  let i = 0; const rng = () => (i++ === 0 ? 0 : 0.999);   // 第一位答應、第二位拒絕
  const r = F.proposeSwap(s, "husband", rng);
  assert.ok(s.swapWill.wife > w0.wife && s.swapWill.other > w0.other);
  assert.notEqual(r.wife, r.other);
  assert.equal(F.wifeSwapped(s) !== F.otherSwapped(s), true);
});
t("單邊：丈夫左擁右抱、你落單 → 分組與旅館只能看", () => {
  const s = {}; F.ensurePairs(s); s.pairs.wife = "husband";
  const g = F.pairGroups(s);
  assert.deepEqual(g[0], ["player"]);
  assert.ok(g[1][0] === "husband" && g[1].includes("wife") && g[1].includes("other"));
  assert.equal(F.hotelMode(s), "watch");
  s.pairs.other = "player"; assert.equal(F.hotelMode(s), "play");
  assert.deepEqual(F.pairGroups(s)[0].sort(), ["other", "player"]);
  const n = {}; F.ensurePairs(n); assert.equal(F.hotelMode(n), "none");
  assert.deepEqual(F.pairGroups(n)[0].sort(), ["player", "wife"]);
});
t("teaseWhere：看戲／公園不能出；酒吧座位要配對或醉；廁所可以", () => {
  assert.equal(F.teaseWhere({ act: "kiss" }, { where: "hotel_room", paired: true, mode: "watch" }), false);
  assert.equal(F.teaseWhere({ act: "kiss" }, { where: "park", paired: true }), false);
  assert.equal(F.teaseWhere({ act: "kiss" }, { where: "bar", paired: false, drunk: 10 }), false);
  assert.equal(F.teaseWhere({ act: "kiss" }, { where: "bar", paired: false, drunk: 70 }), true);
  assert.equal(F.teaseWhere({ act: "sex" }, { where: "bar", paired: true }), false);
  assert.equal(F.teaseWhere({ act: "oral" }, { where: "bar_toilet" }), true);
  assert.equal(F.teaseWhere({ act: "sex" }, { where: "ktv", paired: true }), true);
});
t("吐：對方妻子吐 → player 可以跟去", () => {
  const s = { drunk: { other: 80, wife: 80 } }; F.ensurePairs(s);
  assert.equal(F.vomitChance(s, "other", "bar", yes), "player");
});
t("外出服：老婆沒有像樣的衣服 → 預設，不寫進 owned", () => {
  const g = { id: "g1", look: { wardrobe: ["白色T恤配短褲", "黑色蕾絲內衣"], owned: { wardrobe: [0, 1], erotic: [], sleep: [] } } };
  const before = JSON.stringify(g.look.owned);
  const o = O.dateOutfitOf(g, "wife");
  assert.ok(O.DATE_DEFAULTS.includes(o));
  assert.equal(JSON.stringify(g.look.owned), before);
  assert.equal(O.withDateOutfit(g, "wife").outfitName, o);
  assert.equal(g.outfitName, undefined);
});
t("外出服：老婆有外出服 → 用她的；內衣排除", () => {
  const g = { id: "g2", look: { wardrobe: ["黑色蕾絲內衣", "碎花洋裝"], owned: { wardrobe: [0, 1] } } };
  assert.equal(O.dateOutfitOf(g, "wife"), "碎花洋裝");
  assert.equal(O.isOutingOutfit("粉紅睡衣"), false);
});
t("每個人都能提議換地方：自己想走才會開口；旅館不會", () => {
  const s = {}; F.ensureMove(s);
  assert.equal(F.npcProposeMove(s, "wife", "park", yes), false);
  s.move.wife = true;
  assert.equal(F.npcProposeMove(s, "wife", "park", yes), true);
  assert.equal(F.npcProposeMove(s, "wife", "park", no), false);
  assert.equal(F.npcProposeMove(s, "wife", "hotel_room", yes), false);
});
t("對方丈夫很主動：第 2 段還沒換完時提議換妻機率 ≥ 0.5", () => {
  assert.ok(F.SWAP.husbandSwapP >= 0.5);
  const s = {}; F.ensurePairs(s);
  assert.equal(F.husbandIntent(s, "bar", () => 0.4), "swap");
});
t("換妻＝同意色色：配對了才免門檻", () => {
  const s = {}; F.ensurePairs(s);
  assert.equal(F.consentFree(s, "other"), false); assert.equal(F.consentFree(s, "wife"), false);
  s.pairs.other = "player"; assert.equal(F.consentFree(s, "other"), true); assert.equal(F.consentFree(s, "wife"), false);
  s.pairs.wife = "husband"; assert.equal(F.consentFree(s, "wife"), true);
});
{
  const { readFileSync } = await import("node:fs");
  const sel = readFileSync(new URL("../web/content/swap_select.js", import.meta.url), "utf8");
  const bar = readFileSync(new URL("../web/content/swap_bar.js", import.meta.url), "utf8");
  t("立繪 bug：genPair 的回傳要取 .images，不能整包塞進 S.images", () => {
    assert.match(sel, /r\?\.images/);
    assert.doesNotMatch(sel, /const imgs = await pair\.genPair/);
  });
  t("互動模型：互動中不跑 CD、不能被打斷、NPC 互動 10 秒、跟玩家對話結束才放開", () => {
    assert.match(bar, /NPC_INTER_MS = 10000/);
    assert.match(bar, /if \(isAway\(k\) \|\| isBusy\(k\)\) continue/);
    assert.match(bar, /isBusy\(tgt\) && !force\) return/);
    assert.match(bar, /withPlayer\(\[k\]/);
    assert.match(bar, /finally \{ release\(set\)/);
  });
  t("性卡：換了就跳過接受度門檻（只看場景）", () => {
    assert.match(bar, /ok = free \|\|/);
    assert.match(bar, /consentFree\(sess, "wife"\)\) okP = 1/);
  });
}
console.log(`\n${pass} passed`);
