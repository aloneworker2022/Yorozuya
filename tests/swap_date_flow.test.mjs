// node tests/swap_date_flow.test.mjs — 換妻約會流程 2026-10-24：旗號共識／單邊換妻／只能看的旅館／外出服
import assert from "node:assert/strict";
import { pathToFileURL } from "node:url";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { execFileSync } from "node:child_process";
const dir = pathToFileURL(new URL("../web/content/", import.meta.url).pathname).href;
globalThis.localStorage ??= { getItem: () => null, setItem: () => {} };
const F = await import(dir + "swap_flow_rules.js?v=8");
const O = await import(dir + "swap_outfit.js?v=1");
let pass = 0; const t = (n, fn) => { fn(); pass++; console.log("ok -", n); };
const yes = () => 0, no = () => 0.999;

t("全員同意才走（第 2 段）；缺一個不行", () => {
  const s = {}; F.ensureMove(s); F.ensurePairs(s); s.pairs.wife = "husband";
  s.move = { wife: true, husband: true, other: false };
  assert.equal(F.allAgree(s), false);
  assert.equal(F.canMove(s, "bar", "hotel_room").ok, false);
  s.move.other = true;
  assert.equal(F.allAgree(s), true);
  assert.equal(F.canMove(s, "bar", "hotel_room").ok, true);
  F.resetMove(s); assert.equal(F.allAgree(s), false);
});
t("公園：兩位妻子都換了才能走（不看旗號）；丈夫提議移動、決定地點", () => {
  const s = {}; F.ensureMove(s); F.ensurePairs(s);
  s.move = { wife: true, husband: true, other: true };
  assert.equal(F.canMove(s, "park", "bar").ok, false);
  s.pairs.wife = "husband"; assert.equal(F.canMove(s, "park", "ktv").ok, false);
  s.pairs.other = "player"; s.move = { wife: false, husband: false, other: false };
  assert.equal(F.parkReady(s), true);
  assert.equal(F.canMove(s, "park", "bar").ok, true); assert.equal(F.canMove(s, "park", "ktv").ok, true);
  assert.equal(F.husbandIntent(s, "park", yes), "move");
  assert.equal(F.husbandPickNext(s, yes), "ktv"); assert.equal(F.husbandPickNext(s, no), "bar");
  const s2 = {}; F.ensurePairs(s2); assert.equal(F.husbandIntent(s2, "park", () => 0.4), "swap");
});
t("公園沒有醉度：換妻機率只看接受度", () => {
  const s = { wifeAccept: 40, accept: 40, drunk: { wife: 90, other: 90 } }; F.ensurePairs(s);
  const s0 = { ...s, drunk: { wife: 0, other: 0 } }; F.ensurePairs(s0);
  assert.equal(F.swapAgreeP(s, "wife", "park"), F.swapAgreeP(s0, "wife", "park"));
  assert.ok(F.swapAgreeP(s, "other", "bar") >= F.swapAgreeP(s0, "other", "bar"));
  const bar = readFileSync(new URL("../web/content/swap_bar.js", import.meta.url), "utf8");
  assert.match(bar, /if \(STG === 1\) return;   \/\/ 公園沒有酒醉值/); assert.match(bar, /husbandPickNext\(sess\)/);
});
t("版面：對話框收起／卡牌在中央／點人物切換", () => {
  const bar = readFileSync(new URL("../web/content/swap_bar.js", import.meta.url), "utf8");
  assert.match(bar, /\.top\.on\{transform:none/); assert.match(bar, /\.hand\{position:absolute;left:50%;top:46%/);
  assert.match(bar, /tapSel = tapSel === k \? "" : k/); assert.match(bar, /click = true/);
  assert.match(bar, /const PARK_TALK = "[^"]*絕對不要提到喝酒/); assert.match(bar, /FB = PARK \? FB_PARK : FB_BAR/);
  assert.match(bar, /const boxOn = \(\) => \{ form\.hidden = true;/); assert.match(bar, /fusion-pixel-12px-zh-hant\.woff2/);
  assert.match(bar, /form\{position:absolute;left:10px;right:10px;top:calc\(40px/); assert.match(bar, /if \(ks\.length\) \$\("\.hand"\)\?\.classList\.add\("out"\)/);
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
t("旗號會雙向變：想走✓ 之後重擲也會變回還想待（就算一直被慫恿、喝醉、待很久）", () => {
  const s = { rounds: 50, drunk: { wife: 90, husband: 90, other: 90 }, wifeAccept: 100, accept: 100 }; F.ensureMove(s);
  for (let i = 0; i < 10; i++) F.urgeMove(s, "all", "bar", yes);
  assert.ok(F.allAgree(s));
  for (const k of F.NPCS) assert.ok(F.moveP(s, k, "bar") <= F.MOVE.pMax && F.MOVE.pMax < 0.9);
  assert.equal(F.rollMove(s, "wife", "bar", () => 0.8), false);   // true → false
  assert.equal(F.rollMove(s, "wife", "bar", () => 0.01), true);   // false → true
  // 隨機長跑：同一個人兩個方向都會發生
  let flipsDown = 0, flipsUp = 0, r = 7; const rng = () => ((r = (r * 16807) % 2147483647) / 2147483647);
  for (let i = 0; i < 200; i++) { const o = s.move.other, n = F.rollMove(s, "other", "bar", rng); if (o && !n) flipsDown++; if (!o && n) flipsUp++; }
  assert.ok(flipsDown > 5 && flipsUp > 5, `down ${flipsDown} up ${flipsUp}`);
});
t("測試捷徑起始狀態：酒吧／KTV＝第 2 段沒換伴；旅館 play＝兩邊換、watch＝只有老婆換", () => {
  for (const sc of ["bar", "ktv"]) {
    const s = { ...F.testStartState(sc) }; F.ensureMove(s); F.ensurePairs(s);
    assert.equal(F.stageOf(sc), 2); assert.ok(!F.anySwapped(s)); assert.ok(!F.allAgree(s)); assert.ok(s.drunk.wife > 0);
  }
  const p = { ...F.testStartState("hotel_room", { hotel: "play" }) }; F.ensurePairs(p);
  assert.equal(F.stageOf("hotel_room"), 3); assert.equal(F.hotelMode(p), "play");
  const w = { ...F.testStartState("hotel_bath", { hotel: "watch" }) }; F.ensurePairs(w);
  assert.equal(F.hotelMode(w), "watch");
  assert.deepEqual(F.testStartState("park"), {});
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
    assert.match(bar, /if \(isAway\(k\) \|\| isBusy\(k\)/);
    assert.match(bar, /isBusy\(tgt\) && !force\) return/);
    assert.match(bar, /withPlayer\(\[k\]/);
    assert.match(bar, /finally \{ release\(set\)/);
  });
  t("性卡：換了就跳過接受度門檻（只看場景）", () => {
    assert.match(bar, /ok = free \|\|/);
    assert.match(bar, /consentFree\(sess, "wife"\)\) okP = 1/);
  });
}
{
  const { readFileSync } = await import("node:fs");
  const bar = readFileSync(new URL("../web/content/swap_bar.js", import.meta.url), "utf8");
  const P = await import(dir + "swap_pair_gen.js?v=19");
  t("pt238u: 親熱中鎖互動、射精判定、口交三句、全身雙人圖", () => {
    for (const a of ["kiss", "grope", "fellatio", "normal", "behind", "seated"]) assert.ok(F.pairIntimate(a), a);
    assert.ok(!F.pairIntimate("chat") && !F.pairIntimate(""));
    assert.equal(F.EJAC.everySec, 5); assert.equal(F.EJAC.p, 0.2);
    assert.ok(F.rollEjac("fellatio", () => 0.1)); assert.ok(!F.rollEjac("fellatio", () => 0.3));
    assert.ok(!F.rollEjac("kiss", () => 0) && !F.rollEjac("chat", () => 0));
    assert.equal(F.teaseSteps("oral"), 3); assert.equal(F.teaseSteps("grope"), 1);
    assert.equal(P.pairCut({ "pair~chat~1": { cut: "u", at: 1 } }, "chat~1"), "");
    assert.equal(P.pairCut({ "pair~chat~1": { cut: "u", at: P.PAIR_SINCE + 5 } }, "chat~1"), "u");
    const T = P.PAIR_SINCE + 5, h = { "pair~normal~1": { cut: "a", at: T, seed: 7 }, "pair~normal~2": { cut: "b", at: T, seed: 9 } };
    assert.equal(P.pairCut(h, "normal~2"), "");               // 不同 seed 的第 2 格不算
    h["pair~normal~2"].seed = 7; assert.equal(P.pairCut(h, "normal~2"), "b");
    assert.equal(P.seedFor("normal~2", h, {}), 7); assert.equal(P.seedFor("normal~2", h, { normal: 3 }), 3); assert.equal(P.seedFor("normal~1", h, {}), 0);
    assert.equal(F.zoomFallback("normal", "wife", 0), F.ZOOM_FB.wife.hard[0]); assert.equal(F.zoomFallback("kiss", "husband", 1), F.ZOOM_FB.husband.soft[1]);
    assert.ok(F.ZOOM.everyMs >= 2000 && F.ZOOM.everyMs <= 6000);
    assert.match(bar, /pr\.addEventListener\("click"[^\n]*zoomOpen/); assert.match(bar, /if \(zoomOn\) \{ zoomHold = true/);
    assert.ok(P.SLAM_PX >= 5 && P.SLAM_PX <= 8); assert.ok(P.SLAM_SCALE > 1 && P.SLAM_SCALE <= 1.025); assert.ok(P.SLAM_MS <= 250);
    const pg = readFileSync(new URL("../web/content/swap_pair_gen.js", import.meta.url), "utf8");
    assert.ok(!/@keyframes swpSlam[^\n]*translateX\(-50%\)/.test(pg) && !/T = \(x, y, sc\) => `transform:translateX/.test(pg));   // 不覆蓋元素原本的 transform
    assert.match(bar, /pairLocked\(tgt\)/); assert.match(bar, /ejacTick\(dt\)/); assert.match(bar, /ctx\.debugSliders/);
    assert.match(bar, /\$\("\.st"\)\.prepend\(\$\("\.pr"\)\)/); assert.match(bar, /\.pr\{z-index:0;left:12%;top:40%;bottom:auto;width:39%;max-width:340px/);
  });
}
t("swap_bar／swap_select／test_room_summon 以 ES module 解析沒有語法錯誤", () => {
  for (const m of ["swap_bar", "swap_select", "swap_flow_rules", "test_room_summon"]) {
    const src = readFileSync(new URL(`../web/content/${m}.js`, import.meta.url), "utf8"), tmp = `${tmpdir()}/chk_${m}.mjs`;
    writeFileSync(tmp, src); execFileSync(process.execPath, ["--check", tmp]);
  }
});
console.log(`\n${pass} passed`);
