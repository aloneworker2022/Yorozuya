// node tests/shenkui.test.mjs — 腎虧：精液量 < −7 自動看醫生（web/content/player_state.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const P = await import(`${dir}player_state.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const now = Date.now();
const at = (cc) => P.ensurePlayer({ semenCc: cc, lastSemenAt: now });

t("−7 還不算腎虧（嚴格 < −7）", () => {
  const r = P.kidneyCheck(at(-7));
  assert.equal(r.triggered, false);
  assert.equal(r.player.semenCc, -7);
  assert.equal(r.fee, 0);
});

t("−7 再射一次（−6cc）→ −13 → 腎虧，回到 −1", () => {
  const spent = P.spendSemen(at(-7), 6).player;
  assert.equal(spent.semenCc, -13, "下限 −60，不會卡在 −7");
  const r = P.kidneyCheck(spent, () => 0.5);
  assert.equal(r.triggered, true);
  assert.equal(r.before, -13);
  assert.equal(r.player.semenCc, P.KIDNEY_RESET_CC);
  assert.equal(r.player.semenCc, -1);
  assert.ok(r.fee >= 60 && r.fee <= 140);
  // 再檢查一次不會再收
  assert.equal(P.kidneyCheck(r.player).triggered, false);
});

t("醫藥費 60～140 含兩端", () => {
  assert.equal(P.rollDoctorFee(() => 0), 60);
  assert.equal(P.rollDoctorFee(() => 0.9999999), 140);
  for (let i = 0; i < 2000; i++) {
    const f = P.rollDoctorFee();
    assert.ok(Number.isInteger(f) && f >= 60 && f <= 140, String(f));
  }
});

t("−8（整數下第一個 < −7）就觸發；正常範圍不觸發", () => {
  assert.equal(P.kidneyCheck(at(-8)).triggered, true);
  for (const cc of [20, 6, 0, -1, -6]) assert.equal(P.kidneyCheck(at(cc)).triggered, false, String(cc));
});

console.log(`\n${pass} passed`);
