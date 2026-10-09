// node tests/life_friends.test.mjs — 交友線手機端：收差額（飢渴降、忠誠掉）、痕跡、名單、透露規則
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const F = await import(`${dir}life_friends.js`);
const S = await import(`${dir}life_schedule.js?v=8`);
const M = await import(`${dir}life_memory.js?v=5`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const NOW = 1791100000000;

function girl(extra = {}) {
  return {
    id: "a", stage: "girlfriend", libido: { grade: "R" }, stats: { loyalty: 70 },
    bodyState: { hunger: { level: 80, at: NOW, satedUntil: 0 }, organs: {} },
    world: {},
    ...extra,
  };
}

t("外面做愛：飢渴只扣差額，扣兩次不會重複", () => {
  const g = girl();
  g.world.lifeHungerRelief = 30;
  assert.equal(S.applyLifeHunger(g, NOW), -30);
  assert.equal(g.bodyState.hunger.level, 50);
  assert.equal(S.applyLifeHunger(g, NOW), 0);
  assert.equal(g.bodyState.hunger.level, 50);
  g.world.lifeHungerGiven = 14;
  g.world.lifeHungerRelief = 130;
  S.applyLifeHunger(g, NOW);
  assert.equal(g.bodyState.hunger.level, 0); // 不會到負的
});

t("忠誠慢慢掉，只扣差額", () => {
  const g = girl();
  g.world.lifeLoyaltyLoss = 3;
  S.applyLifeHunger(g, NOW);
  assert.equal(g.stats.loyalty, 67);
  S.applyLifeLoyalty(g);
  assert.equal(g.stats.loyalty, 67);
  g.world.lifeLoyaltyLoss = 5;
  S.applyLifeLoyalty(g);
  assert.equal(g.stats.loyalty, 65);
});

t("paintLifeRow 帶交友線的累計欄位", () => {
  const w = {};
  S.paintLifeRow(w, { hungerRelief: 58, loyaltyLoss: 2, traces: [{ seq: 1, at: NOW, rounds: 4 }], lastAffair: { seq: 1, at: NOW, kind: "naked", rounds: 4 }, anonSex: 1, met: [{ id: "p", stage: "fwb" }] });
  assert.equal(w.lifeHungerRelief, 58);
  assert.equal(w.lifeLoyaltyLoss, 2);
  assert.equal(w.lifeTraces.length, 1);
  assert.equal(w.lastAffair.kind, "naked");
  assert.equal(w.anonSex, 1);
  assert.equal(w.met[0].stage, "fwb");
});

t("進房間收痕跡：新鮮的有精液、陰唇濕；舊的只算開發；不重收", () => {
  const g = girl();
  g.world.lifeTraces = [
    { seq: 1, at: NOW - 48 * 3600e3, rounds: 1 },
    { seq: 2, at: NOW - 3600e3, rounds: 2 },
  ];
  const r = F.applyLifeTraces(g, NOW);
  assert.equal(r.taken, 2);
  assert.equal(r.fresh.seq, 2);
  assert.equal(g.bodyState.organs.uterus.semen, 2);
  assert.equal(g.bodyState.organs.labia.wet, true);
  assert.equal(g.bodyState.lifeTraceSeq, 2);
  assert.equal(F.applyLifeTraces(g, NOW).taken, 0);
});

t("只有舊痕跡：沒有精液", () => {
  const g = girl();
  g.world.lifeTraces = [{ seq: 1, at: NOW - 48 * 3600e3, rounds: 9 }];
  const r = F.applyLifeTraces(g, NOW);
  assert.equal(r.taken, 1);
  assert.equal(r.fresh, null);
  assert.ok(!(g.bodyState.organs.uterus?.semen > 0));
});

t("recentAffair：新鮮期內才算剛發生；次數決定強度", () => {
  const g = girl();
  g.world.lastAffair = { at: NOW - 3600e3, kind: "naked", rounds: 9, name: "" };
  const a = F.recentAffair(g, NOW);
  assert.equal(a.naked, true);
  assert.equal(a.intensity, "marathon");
  assert.equal(a.name, "陌生人");
  g.world.lastAffair.at = NOW - 13 * 3600e3;
  assert.equal(F.recentAffair(g, NOW), null);
});

t("名單：照階排，舊列沒有 stage 時看 named", () => {
  const g = girl();
  g.world.met = [
    { id: "1", name: "甲", role: "路人", named: false, count: 1 },
    { id: "2", name: "乙", role: "同事", named: true, count: 2 },
    { id: "3", name: "丙", role: "同事", stage: "fwb", intent: "lust", sexCount: 9, count: 5 },
  ];
  const rows = F.friendRows(g);
  assert.deepEqual(rows.map((r) => r.stage), ["fwb", "known", "seen"]);
  assert.equal(rows[0].intentZh, "只想上床");
  assert.equal(rows[2].name, "（路人）");
});

t("透露規則：陌生不主動但不藏、朋友會提、女友起是秘密", () => {
  assert.match(M.affairDisclosure("stranger"), /不要主動提/);
  assert.match(M.affairDisclosure("stranger"), /老實/);
  assert.match(M.affairDisclosure("friend"), /自然帶到/);
  assert.match(M.affairDisclosure("girlfriend"), /秘密/);
  assert.match(M.affairDisclosure("wife"), /絕對不提/);
});

t("記憶行：affair 帶關係階規則", () => {
  const g = girl({ stage: "girlfriend" });
  g.world.mind = { immediate: [{ id: "x", at: NOW, kind: "stroll", text: "我跟他回去了。", keys: ["遊盪"], private: "affair" }], mid: [], long: [], seeded: true };
  const lines = M.lifeMemoryPromptLines(g, "你今天去哪", { here: "room" });
  assert.ok(lines.some((l) => l.includes("秘密")), lines.join("\n"));
});

console.log(`${pass} passed`);
