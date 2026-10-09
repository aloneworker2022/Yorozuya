// node tests/life_schedule.test.mjs
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const S = await import(`${dir}life_schedule.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };

t("非妻子停留是 2、3 或 4 小時", () => {
  assert.equal(S.rollStayHours(false, () => 0), 2);
  assert.equal(S.rollStayHours(false, () => 0.99), 4);
  assert.equal(S.rollStayHours(false, () => 0.34), 3);
});

t("妻子停留是 8～16 小時", () => {
  assert.equal(S.rollStayHours(true, () => 0), 8);
  assert.equal(S.rollStayHours(true, () => 0.999), 16);
});

t("召喚價是 3～5", () => {
  assert.equal(S.rollSummonCost(() => 0), 3);
  assert.equal(S.rollSummonCost(() => 0.34), 4);
  assert.equal(S.rollSummonCost(() => 0.999), 5);
});

t("打工 4 小時、上網 30 分鐘、溜達 30 或 60 分鐘", () => {
  assert.equal(S.agendaDurationMs("work", () => 0.9), 4 * S.HOUR_MS);
  assert.equal(S.agendaDurationMs("browse", () => 0.9), 30 * 60 * 1000);
  assert.equal(S.agendaDurationMs("stroll", () => 0.1), 30 * 60 * 1000);
  assert.equal(S.agendaDurationMs("stroll", () => 0.6), S.HOUR_MS);
});

t("下一件交給 RP5 擲（手機不再有 nextAgendaKind）", () => {
  assert.equal(S.nextAgendaKind, undefined);
});

t("心情隨時間淡回平靜，跟 server mood_now 同一套數字", () => {
  const at = 1791086400000;
  const w = { mood: "低落", moodLevel: 50, moodAt: at, moodWhy: "被責怪" };
  assert.deepEqual(S.outsideMoodNow(w, at), { name: "低落", level: 50, why: "被責怪" });
  assert.equal(S.outsideMoodNow(w, at + 2 * S.HOUR_MS).level, 42);
  assert.equal(S.outsideMoodNow(w, at + 10 * S.HOUR_MS).name, "平靜");
  assert.equal(S.outsideMoodNow({ mood: "虛脫", moodLevel: 40, moodAt: at }, at + S.HOUR_MS).level, 25);
  assert.equal(S.outsideMoodNow({ mood: "不安" }, at).level, 40);  // 舊存檔只有字
  assert.equal(S.outsideMoodNow({}, at).name, "平靜");
  assert.equal(S.outsideMoodNow({ mood: "亂寫" }, at).name, "平靜");
  assert.equal(S.moodStrengthWord(70), "很");
  assert.equal(S.moodStrengthWord(15), "有一點");
});

t("paintLifeRow：心情只在日本時蓋、記憶去重、碰過的人和上一件帶回來", () => {
  const world = { mood: "愉快", moodLevel: 30, mind: { immediate: [{ id: "x", text: "舊" }], mid: [], long: [], seeded: true } };
  const row = {
    phase: "room", mood: "不安", moodLevel: 60, moodAt: 5, agenda: null, activity: null,
    memories: [{ id: "x", text: "舊" }, { id: "y", text: "新的事" }],
    met: [{ id: "p1", name: "佐藤翔太", named: true }],
    last: { kind: "work", text: "新的事", moodAfter: "不安" },
  };
  S.paintLifeRow(world, row);
  assert.equal(world.mood, "愉快");
  assert.equal(world.mind.immediate.length, 2);
  assert.equal(world.met[0].name, "佐藤翔太");
  assert.equal(world.lastOutside.moodAfter, "不安");
  S.paintLifeRow(world, { ...row, phase: "japan", activity: "sleep", sleep: { pending: true, until: 9 } });
  assert.equal(world.mood, "不安");
  assert.equal(world.moodLevel, 60);
  assert.equal(world.activity, "sleep");
  assert.equal(world.mind.immediate.length, 2);
});

t("停留到期看完整時間戳，砍成 32 位元的負數不算到期", () => {
  const now = 1791086400000;
  assert.equal(S.visitDue(now - 1000, now), true);
  assert.equal(S.visitDue(now + S.HOUR_MS, now), false);
  assert.equal(S.visitDue(now | 0, now), false);
  assert.equal(S.visitDue(0, now), false);
});

console.log(`${pass} passed`);
