// node tests/hunger_marathon.test.mjs — 妻子飢渴頂點的榨乾場（hunger.js marathon* ＋ sex_thrust.js applyThrust/marathonFinale ＋ player_state 腎虧）
// 照 test_room_summon.js 的順序模擬：每下 applyThrust → 射精扣玩家精液（榨乾場不當場結算腎虧）→ checkOrgasm → marathonOrgasm。
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const H = await import(`${dir}hunger.js`);
const T = await import(`${dir}sex_thrust.js`);
const P = await import(`${dir}player_state.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const T0 = Date.UTC(2026, 9, 9, 8, 0, 0);
const seeded = (seed = 1) => () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
const wife = (level = 100) => ({ stage: "wife", libido: { grade: "S" }, bodyState: { arousal: 60, organs: {}, hunger: { level, at: T0 } } });

/** 跑一場：回傳每一下的紀錄。 */
function run({ semen = 20, level = 100, rng = seeded(7), max = 400 } = {}) {
  const g = wife(level);
  let player = P.ensurePlayer({ semenCc: semen, lastSemenAt: T0 });
  const m = H.startMarathon(g, { now: T0 });
  const s = T.newThrustSession({ semenCc: player.semenCc, marathon: true, now: T0 });
  const log = [];
  let endedEarly = false;
  for (let i = 0; i < max && !s.ended; i++) {
    const now = T0 + i * 3000;
    const r = T.applyThrust(s, { arousal: 60, stage: "wife", rng });
    if (r.ejac) {
      player = P.spendSemen(player, T.THRUST.SEMEN_PER_EJAC_CC).player;   // 不呼叫 kidneyCheck
      s.semen = player.semenCc;
    }
    if (s.ended && H.marathonLocked(m)) endedEarly = true;
    const o = T.checkOrgasm(s);
    if (o) {
      const mr = H.marathonOrgasm(g, m, { now });
      if (mr.done) s.ended = true;
    }
    log.push({ semen: s.semen, locked: H.marathonLocked(m) });
  }
  return { g, m, s, player, log, endedEarly };
}

t("精液見底也不結束（s.marathon）；一般 session 照舊 <1 結束", () => {
  const s = T.newThrustSession({ semenCc: 2, marathon: true });
  const rng = () => 0.99;
  for (let i = 0; i < 12; i++) T.applyThrust(s, { rng });
  assert.ok(s.semen < 0, String(s.semen));
  assert.equal(s.ended, false);
  const n = T.newThrustSession({ semenCc: 2 });
  for (let i = 0; i < 12 && !n.ended; i++) T.applyThrust(n, { rng });
  assert.equal(n.ended, true);
});

t("開始：一般精液 ≤0 不能做；頂點（peak）不看精液", () => {
  assert.equal(T.canStartSexAt(0), false);
  assert.equal(T.canStartSexAt(-3), false);
  assert.equal(T.canStartSexAt(5), true);
  assert.equal(T.canStartSexAt(-3, { peak: true }), true);
  assert.equal(T.canStartSexAt(0, { peak: true }), true);
});

t("整場：她飢渴歸 0 之前一直鎖著、不會先結束；精液一路掉到 −7 以下", () => {
  for (const seed of [1, 7, 42, 99, 1234]) {
    const r = run({ semen: 20, rng: seeded(seed) });
    assert.equal(r.endedEarly, false, `seed ${seed}`);
    assert.equal(r.s.ended, true, `seed ${seed} 有結束`);
    assert.equal(r.m.done, true);
    assert.equal(H.peekHunger(r.g, T0 + 3600e3), 0, "滿足期內不漲");
    assert.equal(r.m.orgasms, 4, "從 100 高潮 4 次");
    // 最後一下之前每一下都還鎖著
    assert.ok(r.log.slice(0, -1).every((x) => x.locked), `seed ${seed}`);
    assert.ok(r.s.semen < P.KIDNEY_BELOW_CC, `seed ${seed} 精液 ${r.s.semen}`);
  }
});

t("收尾：精液 < −7 → 射血＋腎虧，只結算一次（不會收兩次錢）", () => {
  const r = run({ semen: 20, rng: seeded(7) });
  const before = r.player.semenCc;
  const fin = T.marathonFinale(r.m, before, T0);
  assert.equal(fin.first, true); assert.equal(fin.blood, true); assert.equal(fin.kidney, true);
  const k = P.kidneyCheck(r.player, () => 0.5);
  assert.equal(k.triggered, true);
  assert.ok(k.fee >= 60 && k.fee <= 140);
  assert.equal(k.player.semenCc, -1);
  // 再收一次：finale 不是 first；kidneyCheck 看到 −1 也不會再觸發
  const again = T.marathonFinale(r.m, k.player.semenCc, T0 + 1);
  assert.equal(again.first, false); assert.equal(again.blood, true, "同一場的結果不變");
  assert.equal(P.kidneyCheck(k.player).triggered, false);
});

t("收尾：精液還 ≥ −7 → 沒有射血、不送醫", () => {
  // 飢渴 30（一次高潮就滿足）＋精液滿，射不了幾次
  const r = run({ semen: 20, level: 25, rng: seeded(3) });
  assert.equal(r.m.done, true);
  assert.ok(r.player.semenCc >= P.KIDNEY_BELOW_CC, String(r.player.semenCc));
  const fin = T.marathonFinale(r.m, r.player.semenCc);
  assert.equal(fin.blood, false); assert.equal(fin.kidney, false);
  assert.equal(P.kidneyCheck(r.player).triggered, false);
});

t("沒有場次物件 → null（一般做愛不走收尾）", () => {
  assert.equal(T.marathonFinale(null, -20), null);
  assert.equal(H.marathonLocked(null), false);
});

console.log(`\n${pass} passed`);
