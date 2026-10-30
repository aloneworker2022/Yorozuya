// node tests/verbal_tease.test.mjs — 言語調戲（web/content/verbal_tease.js）＋閒聊字眼不誤觸（body_state BODY_HITS）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const V = await import(`${dir}verbal_tease.js`);
const Tz = await import(`${dir}tease.js`);
const S = await import(`${dir}body_state.js`);
let pass = 0;
const t = async (n, f) => { await f(); pass++; console.log("ok -", n); };
const girl = (aff = 0, extra = {}) => ({ id: "g", affection: aff, stage: "stranger", bodyState: { arousal: 0, libido: 8, openness: 0, invasion: 0, ...extra } });

await t("分類：只提部位＝言語調戲；動手對得上鈕＝touch＋鈕；閒聊字眼不命中", () => {
  const k = (s) => V.classifyUserText(s);
  for (const s of ["妳下面濕了嗎", "好想跟妳做愛", "妳的胸部好大", "妳的小穴好美", "要不要試試跳蛋", "看妳下面"]) assert.equal(k(s).kind, "verbal", s);
  for (const s of ["你下面要做什麼", "裡面有位子嗎", "親愛的晚安", "我腰好痛", "抽出時間陪你", "母親節快樂", "我親自去", "彎腰撿東西"]) assert.equal(k(s).kind, "none", s);
  assert.deepEqual([k("摸妳下面").kind, k("摸妳下面").actId], ["touch", "labia"]);
  assert.equal(k("揉妳的陰唇").actId, "labia_rub");
  assert.equal(k("把手指插進妳裡面").actId, "finger_in");
  assert.equal(k("用手指扣妳的陰道").actId, "vagina_finger");
  assert.equal(k("揉妳的胸部").actId, "breast_knead");
  assert.equal(k("摸妳的胸部").actId, "breast");
  assert.equal(k("舔妳的乳頭").actId, "nipple_lick");
  assert.equal(k("吸妳的乳頭").actId, "breast_suck");
  assert.equal(k("摟住妳的腰").actId, "waist");
  assert.equal(k("揉妳的子宮口").actId, "cervix_rub");
  assert.equal(k("親一下").kind, "touch");
  assert.equal(k("親一下").actId, "", "親嘴沒有鈕 → 照舊");
});

await t("言語調戲上限＝摸陰唇的性奮門檻（含感情折扣、最低 5）：剛好解鎖摸陰唇，揉陰唇不會因此解鎖", () => {
  assert.equal(V.verbalArousalCap(0), 12);
  assert.equal(V.verbalArousalCap(50), 7);
  assert.equal(V.verbalArousalCap(400), 5);
  for (const aff of [0, 20, 50, 70]) {
    const g = girl(aff);
    for (let i = 0; i < 40; i++) V.applyVerbalTease(g, { id: "vagina" }, { affection: aff, stage: "lover", rng: () => 0 });
    assert.equal(g.bodyState.arousal, V.verbalArousalCap(aff), `aff ${aff}`);
    assert.ok(Tz.isActUnlocked(g, "labia"), `labia aff ${aff}`);
    assert.ok(!Tz.isActUnlocked(g, "labia_rub"), `labia_rub aff ${aff}`);
    assert.ok(!Tz.isActUnlocked(g, "finger_in"));
    assert.notEqual(S.arousalStage(g.bodyState.arousal), "climax");
  }
});

await t("每句加量：輕 +1／中 +2／重 +3；已高於上限不動也不降；不碰器官、不算刺激", () => {
  const g = girl(0);
  assert.equal(V.applyVerbalTease(g, { id: "breast" }, { stage: "lover" }).gain, 1);
  assert.equal(V.applyVerbalTease(g, { id: "labia" }, { stage: "lover" }).gain, 2);
  assert.equal(V.applyVerbalTease(g, { id: "penis_in" }, { stage: "lover" }).gain, 3);
  const before = JSON.stringify(S.ensureBody(g).organs);
  V.applyVerbalTease(g, { id: "vibe_in" }, { stage: "lover" });
  assert.equal(JSON.stringify(g.bodyState.organs), before, "跳蛋只是說說，不會塞進去");
  assert.equal(S.stimulationState(g).level, 0);
  const hot = girl(0, { arousal: 20 });
  const r = V.applyVerbalTease(hot, { id: "clit" }, { stage: "lover" });
  assert.equal(r.gain, 0);
  assert.equal(hot.bodyState.arousal, 20);
});

await t("侵犯微漲：1～2 × 關係階倍率（陌生 1～2、朋友 1、女友 0～1、妻子 0）；失神中 0；滿 100 逃走", () => {
  const inv = (stage, r) => V.applyVerbalTease(girl(0), { id: "labia" }, { stage, rng: () => r }).invAdded;
  assert.deepEqual([inv("stranger", 0), inv("stranger", 0.99)], [1, 2]);
  assert.deepEqual([inv("friend", 0), inv("friend", 0.99)], [1, 1]);
  assert.deepEqual([inv("girlfriend", 0), inv("girlfriend", 0.99)], [0, 1]);
  assert.equal(inv("wife", 0.99), 0);
  assert.equal(V.applyVerbalTease(girl(0), { id: "labia" }, { stage: "stranger", dazed: true }).invAdded, 0);
  const g = girl(0, { invasion: 99 });
  assert.ok(V.applyVerbalTease(g, { id: "labia" }, { stage: "stranger", rng: () => 0 }).fled);
});

await t("prompt：說明他只是用話挑逗、沒碰到；blocked 版說想動手但還沒碰", () => {
  assert.ok(V.verbalTeasePrompt({ id: "labia" }).includes("沒有碰你"));
  assert.ok(V.verbalTeasePrompt({ id: "labia" }, { blocked: true }).includes("還沒碰到你"));
});
console.log(`${pass} passed`);
