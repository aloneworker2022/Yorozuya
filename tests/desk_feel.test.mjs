// node tests/desk_feel.test.mjs — 她桌上工作的身心狀態（web/content/desk_feel.js）
import assert from "node:assert/strict";
import { ensureFeel, tickFeel, noteWork, tiredPerMin, feelPromptLines, tiredLabel } from "../web/content/desk_feel.js";

let n = 0;
const t = (name, fn) => { fn(); n++; };
const MIN = 60000;

t("關係越好越不容易累", () => {
  assert.equal(tiredPerMin("stranger"), 1.5);
  assert.ok(tiredPerMin("pathological_wife") < tiredPerMin("girlfriend") && tiredPerMin("girlfriend") < tiredPerMin("stranger"));
  assert.ok(tiredPerMin("pathological_wife") > 0);
});
t("工作會累，到 100 累壞了、休息到 30 才好", () => {
  const who = {}, f = ensureFeel(who, 0);
  assert.equal(tickFeel(f, { working: true, now: 30 * MIN }), null);
  assert.equal(f.tired, 45);
  assert.equal(tickFeel(f, { working: true, now: 70 * MIN }), "exhausted");
  assert.ok(f.resting && f.tired === 100 && tiredLabel(f).includes("休息"));
  assert.equal(tickFeel(f, { sleeping: true, now: 80 * MIN }), null);   // 100 − 50
  assert.equal(tickFeel(f, { sleeping: true, now: 85 * MIN }), "rested");
  assert.ok(!f.resting && f.tired <= 30);
});
t("妻子做同樣久比陌生人不累", () => {
  const a = ensureFeel({}, 0), b = ensureFeel({}, 0);
  tickFeel(a, { working: true, stageKey: "stranger", now: 40 * MIN });
  tickFeel(b, { working: true, stageKey: "wife", now: 40 * MIN });
  assert.ok(b.tired < a.tired);
});
t("沒在工作慢慢恢復；不在的時間一次算", () => {
  const f = ensureFeel({}, 0); f.tired = 60;
  tickFeel(f, { now: 10 * MIN });
  assert.equal(f.tired, 40);
  tickFeel(f, { now: 999 * MIN });
  assert.equal(f.tired, 0);
});
t("收下開心、退回沮喪（關係好比較不在意）、心情會退", () => {
  const f = ensureFeel({}, 0); f.tired = 50;
  noteWork(f, "accept", { title: "查 iPad", now: 0 });
  assert.equal(f.mood.type, "proud"); assert.equal(f.tired, 40);
  assert.ok(feelPromptLines(f).some(l => l.includes("收下") && l.includes("查 iPad")));
  const a = ensureFeel({}, 0), b = ensureFeel({}, 0);
  noteWork(a, "redo", { stageKey: "stranger", now: 0 }); noteWork(b, "redo", { stageKey: "wife", now: 0 });
  assert.equal(a.mood.type, "down"); assert.ok(b.mood.level < a.mood.level);
  tickFeel(a, { now: 60 * MIN });
  assert.equal(a.mood, null);
  assert.deepEqual(feelPromptLines(ensureFeel({}, 0)), []);
});
console.log(`desk_feel: ${n} passed`);
