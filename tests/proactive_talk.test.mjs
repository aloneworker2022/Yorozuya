// node tests/proactive_talk.test.mjs — 女友以上主動找你聊天（web/content/proactive_talk.js＋room_activity approach_talk）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const P = await import(`${dir}proactive_talk.js`);
const A = createRequire(import.meta.url)(`${dir}room_activity.js`);
let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const MIN = 60e3, T0 = Date.UTC(2026, 9, 10, 4);
const half = () => .5;

t("只有女友以上", () => {
  for (const s of ["stranger", "acquaintance", "friend", "close_friend"]) assert.equal(P.talkEligible(s), false);
  for (const s of ["girlfriend", "passionate", "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife"]) assert.equal(P.talkEligible(s), true);
  assert.equal(P.talkGate({ stage: "close_friend" }).ok, false);
});
t("間隔：女友最慢、病態最快；主動度高更快", () => {
  const gf = P.talkIntervalMs("girlfriend", 50, half), wife = P.talkIntervalMs("wife", 50, half), pw = P.talkIntervalMs("pathological_wife", 50, half);
  assert.ok(gf >= 60 * MIN && gf <= 90 * MIN, gf);
  assert.ok(wife >= 30 * MIN && wife <= 45 * MIN, wife);
  assert.ok(Math.abs(pw - 20 * MIN) < 2 * MIN, pw);
  assert.ok(P.talkIntervalMs("wife", 90, half) < P.talkIntervalMs("wife", 20, half));
  assert.equal(P.talkIntervalMs("friend", 50, half), Infinity);
});
t("閘門：忙碌狀態全擋", () => {
  const st = { leftMs: 0, closedAt: 0 };
  assert.equal(P.talkGate({ stage: "wife", state: st, now: T0 }).ok, true);
  for (const k of ["notInRoom", "hidden", "roomHidden", "sheetOpen", "talkBusy", "pomodoro", "scene", "sex", "undress", "editor", "summoning", "errand"])
    assert.equal(P.talkGate({ stage: "wife", state: st, busy: { [k]: true }, now: T0 }).ok, false, k);
});
t("閘門：求歡優先", () => {
  const st = { leftMs: 0, closedAt: 0 };
  for (const k of ["pending", "peak", "canBeg"]) assert.equal(P.talkGate({ stage: "wife", state: st, beg: { [k]: true }, now: T0 }).why, "求歡優先");
});
t("閘門：聊完 20 分鐘冷卻、倒數沒到、已經在等", () => {
  assert.equal(P.talkGate({ stage: "wife", state: { leftMs: 0, closedAt: T0 - 19 * MIN }, now: T0 }).ok, false);
  assert.equal(P.talkGate({ stage: "wife", state: { leftMs: 0, closedAt: T0 - 21 * MIN }, now: T0 }).ok, true);
  assert.equal(P.talkGate({ stage: "wife", state: { leftMs: 5 * MIN, closedAt: 0 }, now: T0 }).ok, false);
  assert.equal(P.talkGate({ stage: "wife", state: { leftMs: 0, closedAt: 0, pending: { trigger: "bored" } }, now: T0 }).ok, false);
});
t("tick 只扣房間時間、單次最多 5 分", () => {
  const st = { leftMs: 30 * MIN };
  P.tickTalk(st, 60 * MIN);
  assert.equal(st.leftMs, 25 * MIN);
});
t("觸發權重：想念、心情、記憶、LINE、睡醒", () => {
  const base = P.triggerWeights({ stage: "wife" });
  assert.equal(base.bored, 1); assert.equal(base.miss, 0);
  assert.ok(P.triggerWeights({ stage: "wife", miss: 80 }).miss > 4);
  assert.ok(P.triggerWeights({ stage: "pathological_wife", miss: 80 }).miss > P.triggerWeights({ stage: "wife", miss: 80 }).miss);
  assert.ok(P.triggerWeights({ stage: "wife", outside: { name: "愉快", level: 50 } }).share > 2);
  assert.ok(P.triggerWeights({ stage: "wife", outside: { name: "低落", level: 50 } }).vent > 2);
  assert.ok(P.triggerWeights({ stage: "wife", mood: { type: "hurt", level: 40 } }).vent > 2);
  assert.equal(P.triggerWeights({ stage: "wife", memory: { id: "m1" }, usedMemoryId: "m1" }).memory, 0);
  assert.ok(P.triggerWeights({ stage: "wife", lineEvent: { kind: "warmOther", t: 1 } }).line >= 2.5);
  assert.equal(P.triggerWeights({ stage: "wife", wokeAgoMs: 3 * MIN }).woke, 3);
  assert.equal(P.triggerWeights({ stage: "wife", wokeAgoMs: 30 * MIN }).woke, 0);
  assert.equal(P.pickTrigger({ stage: "wife" }, () => .3), "bored");
  // 抽樣比例：睡醒權重 3 vs 無聊 1 → 約 75%
  let n = 0; const r = (() => { let x = 1; return () => ((x = (x * 16807) % 2147483647) / 2147483647); })();
  for (let i = 0; i < 4000; i++) if (P.pickTrigger({ stage: "wife", wokeAgoMs: 0 }, r) === "woke") n += 1;
  assert.ok(n > 2800 && n < 3200, n);
});
t("記憶：秘密（外遇）不拿來主動講；色情奇遇只有妻子", () => {
  const mk = (stage, priv) => ({ stage, world: { mind: { immediate: [{ id: "a", at: T0 - MIN, kind: "stroll", text: "X", ...(priv ? { private: priv } : {}) }] } } });
  assert.equal(P.freshMemory(mk("wife", "affair"), T0), null);
  assert.equal(P.freshMemory(mk("girlfriend", "ero"), T0), null);
  assert.ok(P.freshMemory(mk("wife", "ero"), T0));
  assert.ok(P.freshMemory(mk("girlfriend", ""), T0));
  assert.equal(P.freshMemory(mk("girlfriend", ""), T0 + 7 * 3600e3), null);
});
t("LINE 事件：吃醋類優先、6 小時內", () => {
  const who = { lineEvents: [{ t: T0 - MIN, kind: "warmOther", text: "他回了美咲" }] };
  assert.equal(P.freshLineEvent(who, T0).kind, "warmOther");
  assert.equal(P.freshLineEvent(who, T0 + 7 * 3600e3), null);
});
t("開場 prompt：觸發內容＋稱呼規則＋秘密＋不求歡", () => {
  const gf = P.openerAsk("line", { stage: "girlfriend", detail: { lineText: "他在群裡特地回了美咲", lineKind: "warmOther", withName: "美咲" } });
  assert.match(gf, /美咲/); assert.match(gf, /吃醋/); assert.match(gf, /禁止叫老公/); assert.match(gf, /秘密/); assert.match(gf, /不要求他做愛/);
  const w = P.openerAsk("memory", { stage: "wife", detail: { memoryText: "在居酒屋被客人誇" } });
  assert.match(w, /居酒屋/); assert.match(w, /老公/);
  assert.match(P.openerAsk("miss", { stage: "pathological_wife" }), /佔有/);
  for (const k of P.TRIGGERS) assert.ok(P.openerAsk(k, { stage: "lover" }).length > 30);
  for (const k of P.TRIGGERS) assert.doesNotMatch(P.fallbackOpener(k, "girlfriend", () => .1), /老公/);
});
t("被晾：連續 2 次才委屈、有冷卻、病態比較重；有回話就歸零", () => {
  const st = { leftMs: 0, closedAt: 0, ignored: 0, ignoreMoodAt: 0, pending: { trigger: "bored", at: T0 } };
  P.noteOpened(st, T0);
  assert.equal(P.noteClosed(st, "wife", 50, T0 + MIN, half), null);
  st.pending = { trigger: "bored", at: T0 }; P.noteOpened(st, T0 + 30 * MIN);
  const m = P.noteClosed(st, "wife", 50, T0 + 31 * MIN, half);
  assert.equal(m.type, "hurt"); assert.equal(m.level, 10);
  assert.equal(P.noteIgnored(st, "wife", T0 + 40 * MIN), null);   // 冷卻
  assert.equal(P.noteIgnored({ ignored: 5, ignoreMoodAt: 0 }, "pathological_wife", T0).level, 18);
  st.pending = { trigger: "bored", at: T0 }; P.noteOpened(st, T0 + 50 * MIN); P.noteReplied(st);
  P.noteClosed(st, "wife", 50, T0 + 51 * MIN, half);
  assert.equal(st.ignored, 0);
  assert.ok(st.leftMs > 20 * MIN);
});
t("等 10 分鐘", () => {
  assert.equal(P.waitExpired({ pending: { at: T0 } }, T0 + 9 * MIN), false);
  assert.equal(P.waitExpired({ pending: { at: T0 } }, T0 + 11 * MIN), true);
});
t("活動 approach_talk：前面、正面、權重 0（不會自己亂抽）、打斷沒有數值", () => {
  const a = A.BY_ID.approach_talk;
  assert.equal(a.spot, "front"); assert.equal(a.facing, "front"); assert.equal(a.icon, "talk");
  assert.equal(A.weights({ stage: "pathological_wife", miss: 100, hungerBeg: false }).get("approach_talk"), 0);
  const mem = A.noteStart(A.ensureMem({}), { id: "approach_talk", at: T0 });
  const hit = A.interrupt(mem, { now: T0 + 60e3 });
  assert.equal(hit.affection, 0); assert.equal(hit.mood, null);
});
console.log(`\n${pass} passed`);
