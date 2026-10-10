// node tests/escort.test.mjs — 接客還債（web/content/escort.js）＋偷看字幕句庫＋人偶側面體位
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import * as E from "../web/content/escort.js";
import { CLIENT_LINES, WIFE_LINES, poolFor, peekLine, nextGapMs } from "../web/content/escort_voices.js";

const D = createRequire(import.meta.url)(fileURLToPath(new URL("../web/content/room_doll.js", import.meta.url)));
let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
const wife = (stage = "wife", archetype = "文靜溫柔", extra = {}) => ({ id: "a", name: "悠梨", roomStage: stage, archetype, stats: { loyalty: 70 }, world: {}, ...extra });

t("負債門檻：>50 自己去、1～50 可以拜託", () => {
  assert.equal(E.autoDue(-50), false); assert.equal(E.autoDue(-51), true);
  assert.equal(E.askable(-50), true); assert.equal(E.askable(-1), true); assert.equal(E.askable(0), false); assert.equal(E.askable(-51), false);
  assert.equal(E.debtOf(12), 0); assert.equal(E.debtOf(-12.4), 12);
});
t("只有妻子以上會去；被奪走的不去", () => {
  for (const st of ["wife", "devoted_wife", "obedient_wife", "pathological_wife"]) assert.ok(E.canEscort(wife(st)), st);
  for (const st of ["lover", "passionate", "girlfriend", "stranger"]) assert.ok(!E.canEscort(wife(st)), st);
  assert.ok(!E.canEscort(wife("wife", "文靜溫柔", { ntr: true })));
  const pick = E.pickWife([wife("wife", "高冷", { id: "x" }), wife("obedient_wife", "高冷", { id: "y" }), wife("lover", "高冷", { id: "z" })]);
  assert.equal(pick.id, "y");
  assert.equal(E.pickWife([wife("wife", "高冷", { id: "x" }), wife("obedient_wife", "高冷", { id: "y" })], "x").id, "x");
});
t("一天最多兩班、兩班之間休息 4 小時", () => {
  const now = 1_800_000_000_000, H = 3600e3;
  assert.ok(E.limitOk({ starts: [now - 10 * H], lastEnd: now - 6 * H }, now).ok);
  assert.equal(E.limitOk({ starts: [now - 10 * H], lastEnd: now - 3 * H }, now).why, "rest");
  assert.equal(E.limitOk({ starts: [now - 10 * H, now - 5 * H], lastEnd: now - 5 * H }, now).why, "today");
  assert.ok(E.limitOk({ starts: [now - 30 * H, now - 25 * H], lastEnd: now - 24 * H }, now).ok);
});
t("每位客人 15～40 金", () => {
  for (const g of ["N", "R", "S", "SS", "SSR"]) for (const r of [0, .5, .999]) for (const f of [0, 30, 999]) {
    const p = E.clientPay(g, f, r); assert.ok(p >= 15 && p <= 40, `${g} ${r} ${f} ${p}`);
  }
});
t("拜託：階段越高越願意、生氣時比較不願意、不是老婆＝0", () => {
  assert.equal(E.askChance({ stage: "lover", family: "溫柔" }), 0);
  const a = E.askChance({ stage: "wife", family: "溫柔" }), b = E.askChance({ stage: "obedient_wife", family: "溫柔" });
  assert.ok(b > a);
  assert.ok(E.askChance({ stage: "wife", family: "溫柔", mood: { type: "angry", level: 60 } }) < a);
  assert.ok(E.askChance({ stage: "wife", family: "冷淡" }) < a);
});
t("收錢只收差額（RP5 escortPaid 只會變大、state.escortTaken 記收過多少）", () => {
  const state = { gold: -120 }, s = wife();
  s.world.escort = { paid: 50 };
  assert.equal(E.collectPaid(state, s), 50); assert.equal(state.gold, -70);
  assert.equal(E.collectPaid(state, s), 0); assert.equal(state.gold, -70);
  s.world.escort.paid = 80;
  assert.equal(E.collectPaid(state, s), 30); assert.equal(state.gold, -40);
  assert.equal(E.repayToast("悠梨", 30, -40), "悠梨還了 30 金，剩餘負債 40 金");
  assert.equal(E.repayToast("悠梨", 30, 5), "悠梨還了 30 金，債還清了");
});
t("收工回房：同一班只回一次、還在接客不回、太久不回", () => {
  const now = 1_800_000_000_000;
  const s = wife(); s.world.escort = { lastSeq: 2, lastEnd: now - 3600e3, lastClients: 3, lastPaid: 70 };
  assert.deepEqual(E.returnDue(s, now), { seq: 2, end: now - 3600e3, clients: 3, paid: 70 });
  s.escortBackSeq = 2; assert.equal(E.returnDue(s, now), null);
  s.escortBackSeq = 1; s.world.agenda = { kind: "escort", until: now + 3600e3 }; assert.equal(E.returnDue(s, now), null);
  s.world.agenda = null; s.world.escort.lastEnd = now - 13 * 3600e3; assert.equal(E.returnDue(s, now), null);
});
t("名冊：接客中・第 N 位客人", () => {
  const now = 1_800_000_000_000;
  const s = wife(); s.world.agenda = { kind: "escort", until: now + 3 * 3600e3 };
  s.world.escort = { active: { clients: 4, startedAt: now - 3600e3, until: now + 3 * 3600e3 } };
  assert.equal(E.currentClient(s, now), 2);
  assert.ok(E.workingNow(s, now));
});
t("回來的心情看個性；被發現偷看：害羞或生氣", () => {
  assert.equal(E.returnMood(wife("wife", "文靜溫柔"), 2).type, "hurt");
  assert.equal(E.returnMood(wife("wife", "清純反差"), 2).type, "aroused");
  assert.equal(E.returnMood(wife("wife", "活潑開朗"), 2), null);
  assert.equal(E.noticedMood(wife("wife", "高冷")).type, "angry");
  assert.equal(E.noticedMood(wife("wife", "清純反差")).type, "flustered");
});
t("偷看價錢 10～25、被發現約 8%、四種體位", () => {
  assert.equal(E.peekCost(0), 10); assert.equal(E.peekCost(0.9999), 25);
  assert.ok(E.peekNoticed(0.05)); assert.ok(!E.peekNoticed(0.09));
  assert.deepEqual(new Set([0, .21, .41, .61, .81].map(E.pickPose)), new Set(E.POSES));
});
t("字幕句庫：每個體位兩邊都 20 句以上、不重複、沒有強迫字眼", () => {
  for (const pose of E.POSES) for (const side of ["client", "wife"]) {
    const pool = poolFor(side, pose);
    assert.ok(pool.length >= 20, `${side} ${pose} ${pool.length}`);
    assert.equal(new Set(pool).size, pool.length, `${side} ${pose} dup`);
    for (const l of pool) assert.ok(!/強暴|強姦|救命|放開我|報警|強迫/.test(l), l);
  }
  assert.ok(CLIENT_LINES.common.includes("夾得好緊") && WIFE_LINES.common.includes("慢一點…"));
  const recent = poolFor("client", "doggy").slice(0, 21);
  assert.equal(peekLine("client", "doggy", { recent, rnd: () => 0 }).text, poolFor("client", "doggy")[21]);
  const w = peekLine("wife", "missionary", { voice: "scream", family: "熱絡", rnd: () => 0 });
  assert.ok(w.text.includes("啊啊啊") || w.text.endsWith("♡") || w.text.endsWith("～"), w.text);
  for (let i = 0; i < 50; i++) { const g = nextGapMs(); assert.ok(g >= 2000 && g < 4000); }
});
t("人偶：四種側面體位都畫得出來、她身材照自己的 look、抽送會晃", () => {
  const look = { height_cm: 158, build: "豐滿火辣", cup: "F 罩杯、渾圓", hair: "雙馬尾" };
  const d = D.lookToDoll(look), slim = D.lookToDoll({ ...look, build: "纖細骨感", cup: "A 罩杯" });
  for (const pose of D.SEX_POSES) {
    const a = D.render(d, pose, 0, 0), b = D.render(d, pose, 7, 0);
    assert.equal(a.width, D.CANVAS.peek.w); assert.equal(a.height, D.CANVAS.peek.h);
    const n = (f) => { let c = 0; for (let i = 3; i < f.pixels.length; i += 4) if (f.pixels[i]) c++; return c; };
    assert.ok(n(a) > 1500, `${pose} ${n(a)}`);
    assert.notDeepEqual(Buffer.from(a.pixels), Buffer.from(b.pixels), `${pose} 沒動`);
    assert.notDeepEqual(Buffer.from(a.pixels), Buffer.from(D.render(slim, pose, 0, 0).pixels), `${pose} 身材沒差`);
    assert.equal(D.POSES[pose].frames, D.SEX_THRUST.length);
  }
  // 抽送：頂到底（p=1）她被撞得比退出時更往枕頭那邊
  assert.ok(D.sexAnchor(d, "sex_missionary", 0).hip[1] < D.sexAnchor(d, "sex_missionary", 7).hip[1]);
  assert.ok(D.sexAnchor(d, "sex_cowgirl", 0).hip[2] < D.sexAnchor(d, "sex_cowgirl", 7).hip[2]);
});
console.log(`\n${pass} passed`);
