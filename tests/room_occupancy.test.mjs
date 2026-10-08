// node tests/room_occupancy.test.mjs — 一間房一次一位（web/content/room_occupancy.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const R = await import(`${dir}room_occupancy.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };

const amy = { id: "g1", gameGirlId: "g1", name: "艾咪", world: { home: { id: "h1" } } };

t("空房：沒人、或她回住處過日子都不算有人", () => {
  assert.equal(R.occupantOf(null), null);
  assert.equal(R.occupantOf(amy, { present: false }), null);
  assert.equal(R.blocksSummon(null, "g2"), false);
});

t("她在房裡：擋別人，不擋她自己（續這趟）", () => {
  const occ = R.occupantOf(amy, { present: true });
  assert.deepEqual(occ, { id: "g1", name: "艾咪", arriving: false });
  assert.equal(R.blocksSummon(occ, "g2"), true);
  assert.equal(R.blocksSummon(occ, "g1"), false);
  assert.match(R.roomFullText(occ), /房裡已經有艾咪了/);
});

t("正在降臨（儀式在跑／繪圖清單還沒完）也算有人，連她自己都先別再召", () => {
  const busy = R.occupantOf(amy, { present: false, busy: true });
  assert.equal(busy.arriving, true);
  assert.equal(R.blocksSummon(busy, "g1"), true);
  assert.equal(R.blocksSummon(busy, "g2"), true);
  const queued = R.occupantOf({ ...amy, summonArrivalPending: true, summonQueueId: "q1" });
  assert.equal(queued.arriving, true);
  assert.match(R.roomFullText(queued), /艾咪正在降臨/);
  // 清單已經沒了（missing）就不再卡房間
  assert.equal(R.occupantOf({ ...amy, summonArrivalPending: true }), null);
});

t("房間存檔：present 優先；舊檔沒寫 present → 沒住所＝在房裡", () => {
  assert.equal(R.savedOccupant(null), null);
  assert.equal(R.savedOccupant({ girl: amy, present: false }), null);
  assert.equal(R.savedOccupant({ girl: amy, present: true }).id, "g1");
  assert.equal(R.savedOccupant({ girl: { id: "g3", name: "小雪" } }).id, "g3");
  assert.equal(R.savedOccupant({ girl: amy }), null);
});

console.log(`\n${pass} passed`);
