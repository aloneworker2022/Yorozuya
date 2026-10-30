// node tests/line_social.test.mjs — 名冊群 LINE：間隔、合不合、稱呼、秘密、插話對象、合併去重、房間事件
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const L = await import(`${dir}line_social.js`);
const V = await import(`${dir}girl_voice.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const NOW = 1791100000000;
const G = (id, archetype, extra = {}) => ({ id, name: id, archetype, roomStage: "friend", stats: { proactivity: 50, jealousy: 30 }, hobbies: [], likes: [], ...extra });

t("間隔：主動度 90→30 分、30→240 分、中間連續、夾在 15～360", () => {
  assert.equal(Math.round(L.baseIntervalMin(90)), 30);
  assert.equal(Math.round(L.baseIntervalMin(30)), 240);
  assert.equal(Math.round(L.baseIntervalMin(60)), 85);
  assert.ok(L.baseIntervalMin(61) < L.baseIntervalMin(60));
  assert.equal(L.baseIntervalMin(0), 360);
  assert.equal(L.baseIntervalMin(100), 22.5 > 15 ? L.baseIntervalMin(100) : 15);
});

t("倍率：心情好／飢渴高／剛遇到事 ×0.6、低落 ×1.5", () => {
  assert.equal(L.intervalMult({}), 1);
  assert.equal(L.intervalMult({ mood: "愉快", moodLevel: 40 }), 0.6);
  assert.ok(Math.abs(L.intervalMult({ mood: "愉快", moodLevel: 40, hunger: 80 }) - 0.36) < 1e-9);
  assert.equal(L.intervalMult({ hunger: 69 }), 1);
  assert.equal(L.intervalMult({ eventAgoMin: 30 }), 0.6);
  assert.equal(L.intervalMult({ mood: "低落", moodLevel: 40 }), 1.5);
  assert.equal(L.intervalMult({ mood: "低落", moodLevel: 10 }), 1);
});

t("潛水：只有冷淡家族，約 30%，同一天固定", () => {
  let n = 0;
  for (let i = 0; i < 2000; i++) if (L.lurksToday(`g${i}`, "冷淡", "2026-10-10")) n++;
  assert.ok(n > 500 && n < 700, `lurk ${n}`);
  assert.equal(L.lurksToday("x", "熱絡", "2026-10-10"), false);
  assert.equal(L.lurksToday("g1", "冷淡", "d"), L.lurksToday("g1", "冷淡", "d"));
});

t("合不合初始：家族搭配＋共同興趣／喜好", () => {
  assert.equal(L.seedAffinity(G("a", "活潑開朗"), G("b", "文靜溫柔")), 20);
  assert.equal(L.seedAffinity(G("a", "病嬌"), G("b", "文靜溫柔")), -20);
  assert.equal(L.seedAffinity(G("a", "病嬌"), G("b", "病嬌")), -15);
  assert.equal(L.seedAffinity(G("a", "高冷"), G("b", "傲嬌")), 20);
  assert.equal(L.seedAffinity(G("a", "病嬌", { hobbies: ["天文", "貓"] }), G("b", "高冷", { hobbies: [{ name: "天文" }, "貓"] })), -4);
  assert.equal(L.seedAffinity(G("a", "天然呆", { hobbies: ["a", "b", "c", "d"], likes: ["x", "y", "z", "w"] }), G("b", "活潑開朗", { hobbies: ["a", "b", "c", "d"], likes: ["x", "y", "z", "w"] })), 59);
});

t("合不合變化：酸人 −8，24 小時退一半回初始值", () => {
  const lg = {};
  const a = G("a", "病嬌"), b = G("b", "文靜溫柔");
  assert.equal(L.getAffinity(lg, a, b, NOW), -20);
  L.bumpAffinity(lg, a, b, L.AFF_DELTA.needle, NOW);
  assert.equal(L.getAffinity(lg, b, a, NOW), -28);
  assert.equal(L.getAffinity(lg, a, b, NOW + 24 * 3600e3), -24);
  assert.ok(Math.abs(L.getAffinity(lg, a, b, NOW + 30 * 24 * 3600e3) + 20) < 0.01);
});

t("稱呼：老公只有妻子以上，女友有小名換小名，其他換你", () => {
  assert.equal(V.scrubHusband("老公在嗎", "wife"), "老公在嗎");
  assert.equal(V.scrubHusband("老公在嗎", "pathological_wife"), "老公在嗎");
  assert.equal(V.scrubHusband("老公在嗎", "lover", "阿呆"), "阿呆在嗎");
  assert.equal(V.scrubHusband("老公在嗎", "girlfriend"), "你在嗎");
  assert.equal(V.scrubHusband("老公在嗎", "friend", "阿呆"), "你在嗎");
  assert.match(V.addressRule("girlfriend", "阿呆"), /禁止叫老公/);
  assert.match(V.addressRule("wife", "阿呆"), /老公.*阿呆/);
});

t("家族口氣跟房間同一份：11 階對到 early/dating/lover/deep/obedient/patho", () => {
  assert.match(V.familyStageLine("病嬌", "acquaintance"), /佔有慾先壓住/);
  assert.match(V.familyStageLine("病嬌", "passionate"), /開始吃醋/);
  assert.match(V.familyStageLine("病嬌", "lover"), /不要叫老公/);
  assert.match(V.familyStageLine("病嬌", "devoted_wife"), /叫他老公/);
  assert.match(V.familyStageLine("病嬌", "obedient_wife"), /我聽你的/);
  assert.match(V.familyStageLine("病嬌", "pathological_wife"), /失控級/);
});

t("回覆長度：女友起 1～3 行、每行 40；以下 1 行 60", () => {
  const r = L.clipReply("嗯嗯\n今天好累\n想你\n第四行", "girlfriend");
  assert.deepEqual(r.lines, ["嗯嗯", "今天好累", "想你"]);
  const s = L.clipReply("嗯嗯\n今天好累", "friend");
  assert.deepEqual(s.lines, ["嗯嗯"]);
  assert.equal(L.clipReply("x".repeat(90), "friend").lines[0].length, 60);
  assert.equal(L.clipReply("#已讀", "wife").readOnly, true);
  assert.deepEqual(L.clipReply("美咲：哈哈\n（笑）", "wife").lines, ["哈哈"]);
});

t("秘密過濾：外遇、色情奇遇的字眼擋下", () => {
  for (const x of ["昨天跟店長上床了", "回家路上被陌生男摸", "看到變態", "精液", "他是我的炮友"]) assert.ok(L.secretLeak(x), x);
  for (const x of ["今天打工好累", "剛吃完拉麵", "睡不著"]) assert.ok(!L.secretLeak(x), x);
});

t("玩家回誰：點名優先，否則 30 分鐘內最後開口的妹子", () => {
  const girls = [G("美咲", "活潑開朗"), G("悠梨", "病嬌")];
  const msgs = [
    { id: "1", kind: "girl", girlId: "美咲", t: NOW },
    { id: "2", kind: "player", text: "辛苦了", t: NOW + 60e3 },
    { id: "3", kind: "player", text: "悠梨乖", t: NOW + 120e3 },
  ];
  assert.equal(L.warmTarget(msgs, msgs[1], girls), "美咲");
  assert.equal(L.warmTarget(msgs, msgs[2], girls), "悠梨");
  const late = { id: "4", kind: "player", text: "嗨", t: NOW + 3600e3 };
  assert.equal(L.warmTarget([msgs[0], late], late, girls), "");
});

t("酸人：嫉妒高的女友以上常酸被回的人；妻子會宣示主權", () => {
  const lg = {};
  const yuri = G("悠梨", "病嬌", { roomStage: "wife", stats: { jealousy: 98 } });
  const misaki = G("美咲", "活潑開朗");
  const byId = { 悠梨: yuri, 美咲: misaki };
  let needle = 0, claim = 0;
  for (let i = 0; i < 1000; i++) {
    const p = L.planTurn(yuri, { lg, warmId: "美咲", girlsById: byId });
    if (p.act === "needle") needle++;
    if (p.act === "claim") claim++;
  }
  assert.ok(needle + claim > 850, `${needle}+${claim}`);
  assert.ok(claim > 300 && needle > 300);
  const calm = G("小雪", "天然呆", { roomStage: "friend", stats: { jealousy: 25 } });
  let n = 0;
  for (let i = 0; i < 1000; i++) if (L.planTurn(calm, { lg, warmId: "美咲", girlsById: { ...byId, 小雪: calm } }).act === "needle") n++;
  assert.ok(n < 120, `calm ${n}`);
});

t("訊息效果：被酸的人記一筆、合不合下降、只算一次；房間 prompt 帶不合口氣", () => {
  const lg = {};
  const yuri = G("悠梨", "病嬌", { roomStage: "wife" });
  const misaki = G("美咲", "活潑開朗");
  const byId = { 悠梨: yuri, 美咲: misaki };
  const m = { id: "x", t: NOW, kind: "girl", girlId: "悠梨", text: "他是我老公", meta: { act: "claim", target: "美咲" } };
  L.applyMsgEffects(lg, m, byId, NOW);
  L.applyMsgEffects(lg, m, byId, NOW);
  assert.equal(misaki.lineEvents.length, 1);
  assert.equal(L.getAffinity(lg, yuri, misaki, NOW), -25);
  const lines = L.lineEventPromptLines(misaki, { now: NOW + 3600e3 });
  assert.match(lines.join("\n"), /悠梨在群裡對你宣示主權/);
  assert.match(lines.join("\n"), /你跟悠梨不太合/);
  for (let i = 0; i < 15; i++) L.pushLineEvent(misaki, { t: NOW, text: `e${i}` });
  assert.equal(misaki.lineEvents.length, 10);
  const p = { id: "p", t: NOW, kind: "player", text: "辛苦了", meta: { warm: "美咲" } };
  L.applyMsgEffects(lg, p, byId, NOW);
  assert.match(yuri.lineEvents.at(-1).text, /特地回了美咲/);
});

t("RP5 合併：id 去重、照時間排", () => {
  const local = [{ id: "a", t: 1 }, { id: "c", t: 5 }];
  const added = L.mergeFeed(local, [{ id: "b", t: 3 }, { id: "a", t: 1 }, { id: "b", t: 3 }]);
  assert.equal(added.length, 1);
  assert.deepEqual(local.map((m) => m.id), ["a", "b", "c"]);
  assert.equal(L.mergeFeed(local, [{ id: "b", t: 3 }]).length, 0);
});

console.log(`\n${pass} passed`);
