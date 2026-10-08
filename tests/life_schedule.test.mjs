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

t("打工結束才溜達或上網，做完再打工", () => {
  assert.equal(S.nextAgendaKind("work", () => 0.1), "stroll");
  assert.equal(S.nextAgendaKind("work", () => 0.9), "browse");
  assert.equal(S.nextAgendaKind("stroll", () => 0.9), "work");
  assert.equal(S.nextAgendaKind("browse", () => 0.1), "work");
  assert.equal(S.nextAgendaKind("", () => 0.9), "work");
});

t("停留到期看完整時間戳，砍成 32 位元的負數不算到期", () => {
  const now = 1791086400000;
  assert.equal(S.visitDue(now - 1000, now), true);
  assert.equal(S.visitDue(now + S.HOUR_MS, now), false);
  assert.equal(S.visitDue(now | 0, now), false);
  assert.equal(S.visitDue(0, now), false);
});

console.log(`${pass} passed`);
