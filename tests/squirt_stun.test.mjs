// node tests/squirt_stun.test.mjs — 噴水 3 次才失神（2026-11-25 使用者；web/content/stun_speech.js）
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const S = await import(`${dir}stun_speech.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const girl = (extra = {}) => {
  const g = { id: "g", stage: "girlfriend", bodyState: { arousal: 30, libido: 8, openness: 100, organs: {}, climaxTease: 6 } };
  S.ensureStunFields(g);
  Object.assign(g.bodyState, extra);
  g.bodyState.organs.vagina.stuffed = "fingers";
  return g;
};

t("還沒噴夠：再怎麼弄失神都壓在 69（不痙攣、不失神）", () => {
  const g = girl();
  assert.ok(S.effectiveStun(g, "vagina_finger") <= S.SQUIRT_STUN_CAP);
  assert.notEqual(S.stunTier(S.effectiveStun(g, "vagina_finger")), "stun");
  S.noteSquirt(g); S.noteSquirt(g);
  assert.equal(S.squirtCount(g), 2);
  assert.ok(S.effectiveStun(g, "vagina_finger") <= S.SQUIRT_STUN_CAP);
});

t("第 3 次噴：馬上失神；殘量慢慢退", () => {
  const g = girl();
  S.noteSquirt(g); S.noteSquirt(g);
  const r = S.noteSquirt(g);
  assert.deepEqual([r.n, r.stunNow], [3, true]);
  assert.equal(S.stunTier(S.effectiveStun(g, "")), "stun");
  g.bodyState.stunCarryAt = Date.now() - 120000;   // 兩分鐘沒弄：殘量退了
  g.bodyState.arousal = 0; g.bodyState.climaxTease = 0; g.bodyState.organs.vagina.stuffed = "";
  assert.notEqual(S.stunTier(S.effectiveStun(g, "")), "stun");
});

t("什麼時候噴：下面被弄到剛進高潮＝噴；在高潮裡再弄 3 下＝再噴；摸胸不噴", () => {
  const g = girl();
  assert.equal(S.squirtFromAct(g, "breast", { enteredClimax: true }), false);
  assert.equal(S.squirtFromAct(g, "labia", { enteredClimax: true }), true);
  assert.equal(S.squirtFromAct(g, "labia_rub", { stayedClimax: true }), false);
  assert.equal(S.squirtFromAct(g, "vagina_finger", { stayedClimax: true }), false);
  assert.equal(S.squirtFromAct(g, "labia", { stayedClimax: true }), true);
  assert.equal(S.squirtFromAct(g, "labia", { stayedClimax: false }), false, "離開高潮就重算");
  assert.equal(g.bodyState.squirtTease, 0);
});

t("20 分鐘沒噴＝新的一場，從 0 算；seq 一直加", () => {
  const g = girl();
  const a = S.noteSquirt(g, 1_000_000);
  const b = S.noteSquirt(g, 1_000_000 + S.SQUIRT_GAP_MS + 1);
  assert.equal(b.n, 1);
  assert.equal(b.seq, a.seq + 1);
});

t("癱軟＋噴夠失神才准唉唉叫；癱軟沒失神照常說話", () => {
  const g = girl();
  S.setCollapsed(g, true);
  assert.equal(S.moanAllowed(g, ""), false);
  S.noteSquirt(g); S.noteSquirt(g); S.noteSquirt(g);
  assert.equal(S.moanAllowed(g, ""), true);
});

console.log(`\n${pass} passed`);
