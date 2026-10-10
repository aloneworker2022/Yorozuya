// node tests/hunger.test.mjs — 性飢渴（web/content/hunger.js＋room_activity.js 權重＋stun_speech 佔有度來源）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const require = createRequire(import.meta.url);
const H = await import(`${dir}hunger.js`);
const S = await import(`${dir}stun_speech.js`);
const A = require(`${dir}room_activity.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const HR = 3600e3, MIN = 60e3;
const T0 = Date.UTC(2026, 9, 9, 4, 0, 0);
const girl = (stage = "stranger", grade = "S", level = 0) =>
  ({ stage, libido: { name: "普通", grade }, bodyState: { arousal: 0, organs: {}, hunger: { level, at: T0 } } });

t("新妹子起始值依性慾等級（約 6 小時的量，封頂 30）", () => {
  const g = { stage: "stranger", libido: { grade: "N" }, bodyState: {} };
  assert.equal(H.ensureHunger(g, T0).level, 7.2);
  const ssr = { stage: "stranger", libido: { grade: "SSR" }, bodyState: {} };
  assert.equal(H.ensureHunger(ssr, T0).level, 25.2);
  assert.equal(H.ensureHunger({ bodyState: {} }, T0).level, 10.8);   // 沒等級 → 當 R
  assert.equal(H.ensureHunger({}, T0), null);
});

t("隨時間上升：等級×關係階；陌生 S 約一天到飢渴、朋友更快", () => {
  const g = girl("stranger", "S", 0);
  assert.equal(H.peekHunger(g, T0 + 24 * HR), 60);
  const f = girl("friend", "S", 0);
  assert.ok(H.peekHunger(f, T0 + 24 * HR) > 80);
  const n = girl("stranger", "N", 0);
  assert.ok(H.peekHunger(n, T0 + 48 * HR) < 60 && H.peekHunger(n, T0 + 60 * HR) >= 70);
  assert.equal(H.peekHunger(girl("wife", "SSR", 0), T0 + 30 * HR), 100);   // 封頂
  assert.ok(H.hungerRate(girl("friend", "S")) > H.hungerRate(girl("acquaintance", "S")));
  assert.ok(H.hungerRate(girl("wife", "S")) > H.hungerRate(girl("girlfriend", "S")));
  // peek 不寫入、tick 寫入
  assert.equal(g.bodyState.hunger.level, 0);
  H.tickHunger(g, T0 + 10 * HR);
  assert.equal(g.bodyState.hunger.level, 25);
  assert.equal(g.bodyState.hunger.at, T0 + 10 * HR);
});

t("下降：高潮大降＋2 小時不漲、內射中降、碰一下小降；不會低於 0", () => {
  const g = girl("girlfriend", "S", 80);
  let r = H.relieveHunger(g, "orgasm", T0);
  assert.equal(r.after, 40);
  assert.equal(H.peekHunger(g, T0 + 2 * HR), 40);           // 滿足期不漲
  assert.ok(H.peekHunger(g, T0 + 3 * HR) > 43);              // 之後照漲
  r = H.relieveHunger(g, "creampie", T0);
  assert.equal(r.after, 30);
  r = H.relieveHunger(g, "touch", T0);
  assert.equal(r.after, 28);
  H.setHunger(g, 1, T0);
  assert.equal(H.relieveHunger(g, "orgasm", T0).after, 0);
  assert.equal(H.relieveHunger(g, "nope", T0), null);
});

t("時鐘在未來／壞資料 → 從現在起算、不爆", () => {
  const g = girl("friend", "S", 50);
  g.bodyState.hunger.at = T0 + 5 * HR;
  assert.equal(H.peekHunger(g, T0), 50);
  g.bodyState.hunger = { level: "x", at: -1 };
  assert.equal(H.ensureHunger(g, T0).level, 0);
});

t("分段", () => {
  assert.equal(H.hungerTier(10), "low");
  assert.equal(H.hungerTier(40), "mid");
  assert.equal(H.hungerTier(70), "high");
  assert.equal(H.hungerTier(90), "peak");
});

t("關係階門檻：陌生只有活動、朋友心不在焉、女友脾氣、妻子色色話", () => {
  const lines = (stage, lv) => H.hungerPromptLines(girl(stage, "S", lv), { now: T0 }).join("\n");
  for (const st of ["stranger", "friend", "girlfriend", "wife"]) assert.equal(lines(st, 10), "");
  assert.equal(lines("stranger", 45), "");                                 // 陌生 mid：一句都沒有
  assert.match(lines("stranger", 75), /絕對不說出口/);
  assert.doesNotMatch(lines("stranger", 75), /色色|做愛|欲求不滿/);
  assert.match(lines("friend", 45), /走神/);
  assert.match(lines("friend", 75), /不主動說想要/);
  assert.doesNotMatch(lines("friend", 75), /欲求不滿|色色/);
  assert.match(lines("girlfriend", 75), /欲求不滿/);
  assert.doesNotMatch(lines("girlfriend", 95), /色色|求他跟你做愛/);
  assert.match(lines("wife", 45), /色色的暗示/);
  assert.match(lines("lover", 75), /欲求不滿/);                             // 愛人＝女友帶
  assert.match(lines("devoted_wife", 95), /想做愛/);
  // 永遠不寫數字
  for (const st of A.STAGES) for (const lv of [40, 70, 95]) assert.doesNotMatch(lines(st, lv), /\d/, `${st} ${lv}`);
});

t("女友起：開聊有欲求不滿脾氣，90 分鐘冷卻；陌生／朋友沒有", () => {
  assert.equal(H.temperOnOpen(girl("friend", "S", 90), { now: T0 }), null);
  const g = girl("girlfriend", "S", 90);
  const m = H.temperOnOpen(g, { now: T0 });
  assert.equal(m.type, "angry");
  assert.ok(m.level >= 20 && m.level <= 28, String(m.level));
  assert.equal(H.temperOnOpen(g, { now: T0 + 30 * MIN }), null);
  assert.ok(H.temperOnOpen(g, { now: T0 + 91 * MIN }));
  assert.equal(H.temperOnOpen(girl("girlfriend", "S", 50), { now: T0 }), null);
});

t("妻子：很高才走過來求，冷卻 4 小時、高潮後不求、番茄鐘不求", () => {
  assert.equal(H.canBeg(girl("lover", "S", 95), { now: T0 }), false);
  assert.equal(H.canBeg(girl("wife", "S", 80), { now: T0 }), false);
  const w = girl("wife", "S", 90);
  assert.equal(H.canBeg(w, { now: T0 }), true);
  assert.equal(H.canBeg(w, { now: T0, calm: true }), false);
  H.noteBeg(w, T0);
  assert.equal(H.begActive(w, T0 + 10 * MIN), true);
  assert.equal(H.begActive(w, T0 + 16 * MIN), false);
  // 冷卻看的是頂點以下（≥95 不看冷卻，見下一條）
  H.setHunger(w, 88, T0 + 3 * HR);
  assert.equal(H.canBeg(w, { now: T0 + 3 * HR }), false);
  H.setHunger(w, 88, T0 + 4 * HR);
  assert.equal(H.canBeg(w, { now: T0 + 4 * HR }), true);
  // 求的時候不擺臉色；第一句就求
  assert.equal(H.temperOnOpen(w, { now: T0 + MIN }), null);
  assert.match(H.hungerPromptLines(w, { now: T0 + MIN, opening: true }).join(""), /第一句就直接/);
  assert.doesNotMatch(H.hungerPromptLines(w, { now: T0 + MIN, opening: true }).join(""), /惹毛|不耐煩/);
  assert.match(H.hungerOpenerHint(w, { now: T0 + MIN }), /求歡/);
  H.relieveHunger(w, "orgasm", T0 + 2 * MIN);
  assert.equal(H.begActive(w, T0 + 3 * MIN), false);
  H.setHunger(w, 86, T0 + 5 * HR);
  w.bodyState.hunger.satedUntil = T0 + 6 * HR;
  assert.equal(H.canBeg(w, { now: T0 + 5.5 * HR }), false);
});

t("妻子頂點（≥95）：不能拒絕、不看冷卻／滿足期／番茄鐘，一直求；妻子以下不算", () => {
  assert.equal(H.peakBegging(girl("lover", "S", 100), { now: T0 }), false);
  assert.equal(H.peakBegging(girl("wife", "S", 94), { now: T0 }), false);
  const w = girl("wife", "S", 96);
  assert.equal(H.peakBegging(w, { now: T0 }), true);
  assert.equal(H.begRefusable(w, { now: T0 }), false);
  assert.equal(H.begRefusable(girl("wife", "S", 90), { now: T0 }), true);
  // 剛求過（4 小時冷卻內）照樣求；番茄鐘開著也求
  H.noteBeg(w, T0);
  assert.equal(H.canBeg(w, { now: T0 + MIN }), true);
  assert.equal(H.canBeg(w, { now: T0 + MIN, calm: true }), true);
  // 滿足期內但值還在頂點（沒被滿足）→ 還是求
  w.bodyState.hunger.satedUntil = T0 + 3 * HR;
  assert.equal(H.canBeg(w, { now: T0 + 2 * MIN }), true);
  // 活動權重：頂點就算番茄鐘的 calm 也照 hungerBeg（room_activity 自己擋 calm → 交給頁面的 peakBegTick）
  assert.equal(H.activityHunger(w, { now: T0 + 2 * MIN, calm: true }).hungerBeg, true);
  // 榨乾場做完歸 0 → 不再頂點
  const m = H.startMarathon(w, { now: T0 + 3 * MIN });
  for (let i = 0; i < 4; i++) H.marathonOrgasm(w, m, { now: T0 + (4 + i) * MIN });
  assert.equal(H.peakBegging(w, { now: T0 + 10 * MIN }), false);
  assert.equal(H.canBeg(w, { now: T0 + 10 * MIN }), false);
});

t("佔有度：朋友起、≥70 才有 6～14；陌生沒有；接進 stun_speech 來源", () => {
  assert.equal(H.hungerOccupancyPts(girl("stranger", "S", 100), T0), 0);
  assert.equal(H.hungerOccupancyPts(girl("friend", "S", 60), T0), 0);
  assert.equal(H.hungerOccupancyPts(girl("friend", "S", 70), T0), 6);
  assert.equal(H.hungerOccupancyPts(girl("wife", "S", 100), T0), 14);
  const g = girl("friend", "S", 100);
  const occ = S.peekOccupancy(g, "", { hunger: 14 });
  assert.ok(occ.sources.some((s) => s.id === "hunger" && s.pts === 14));
  assert.match(S.occupancyLabel(occ), /飢渴 14/);
  // 閘門沒開（node 沒有 data-hunger）→ 不加
  assert.ok(!S.peekOccupancy(g, "").sources.some((s) => s.id === "hunger"));
});

t("朋友起：飢渴時被碰性奮多漲", () => {
  assert.equal(H.hungerArousalBonus(girl("stranger", "S", 90), T0), 0);
  assert.equal(H.hungerArousalBonus(girl("friend", "S", 20), T0), 0);
  assert.equal(H.hungerArousalBonus(girl("friend", "S", 40), T0), 1);
  assert.equal(H.hungerArousalBonus(girl("friend", "S", 70), T0), 2);
});

/* ── 房間活動 ── */
const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
function freq(ctx, n = 3000, seed = 7) {
  const rng = seeded(seed), c = {};
  for (let i = 0; i < n; i++) { const id = A.pick(ctx, rng).act.id; c[id] = (c[id] || 0) + 1; }
  for (const k in c) c[k] /= n;
  return new Proxy(c, { get: (o, k) => o[k] || 0 });
}
const base = { hour: 15, chrono: "", stage: "friend", seats: ["chair"], now: T0 };

t("活動：飢渴高 → 夾腿扭／坐立不安／偷看變多、睡覺變少；低時都沒有", () => {
  const lo = freq({ ...base, hunger: 20 }), hi = freq({ ...base, hunger: 90 }), mid = freq({ ...base, hunger: 55 });
  assert.equal(lo.squirm, 0); assert.equal(lo.restless, 0); assert.equal(lo.hunger_beg, 0);
  assert.ok(mid.squirm > .03, `mid ${mid.squirm}`);
  assert.ok(hi.squirm + hi.restless > .25, `hi ${hi.squirm + hi.restless}`);
  assert.ok(hi.stare > lo.stare);
  const night = { ...base, hour: 2 };
  assert.ok(freq({ ...night, hunger: 95 }).sleep < freq({ ...night, hunger: 0 }).sleep);
  // 陌生也會（只有活動）
  assert.ok(freq({ ...base, stage: "stranger", hunger: 90 }).squirm > .1);
  // 番茄鐘開著：安靜一點
  assert.ok(freq({ ...base, hunger: 90, calm: true }).squirm < hi.squirm);
});

t("活動：妻子可以求 → 幾乎一定走過來求（愛心泡泡一直浮著）；番茄鐘不會", () => {
  const f = freq({ ...base, stage: "wife", hunger: 95, hungerBeg: true });
  assert.ok(f.hunger_beg > .7, String(f.hunger_beg));
  assert.equal(freq({ ...base, stage: "wife", hunger: 95, hungerBeg: true, calm: true }).hunger_beg, 0);
  const beg = A.BY_ID.hunger_beg;
  assert.equal(beg.spot, "front"); assert.equal(beg.icon, "heart"); assert.equal(beg.sticky, true);
  // 打開對話時她在求 → 不算打斷（mood 類）
  const mem = A.noteStart(null, { id: "hunger_beg", at: T0 });
  assert.equal(A.interrupt(mem, { now: T0 + 60e3 }).mood, null);
});

t("妻子頂點（PEAK_AT 95）＝榨乾場資格；女友以下、或 <95 都不是；求（BEG_AT 85）≠頂點", () => {
  assert.equal(H.PEAK_AT, 95);
  assert.ok(H.PEAK_AT > H.BEG_AT);
  assert.equal(H.marathonEligible(girl("wife", "S", 95), { now: T0 }), true);
  assert.equal(H.marathonEligible(girl("pathological_wife", "S", 100), { now: T0 }), true);
  assert.equal(H.marathonEligible(girl("wife", "S", 90), { now: T0 }), false, "85～94 來求 → 一般做愛（可以停）");
  assert.equal(H.marathonEligible(girl("lover", "S", 100), { now: T0 }), false);
  assert.equal(H.marathonEligible(null), false);
  assert.equal(H.isPeak(95), true); assert.equal(H.isPeak(94.9), false);
});

t("榨乾場：每次她高潮 −25，歸 0 才解鎖；從 100 要 4 次；解鎖後再呼叫沒有作用", () => {
  const g = girl("wife", "SSR", 100);
  const m = H.startMarathon(g, { now: T0 });
  assert.equal(m.startLevel, 100);
  assert.equal(H.marathonLocked(m), true);
  assert.equal(H.marathonOrgasmsLeft(100), 4);
  const seen = [];
  for (let i = 1; i <= 4; i++) {
    const r = H.marathonOrgasm(g, m, { now: T0 + i * MIN });
    seen.push(r.after);
    if (i < 4) assert.equal(H.marathonLocked(m), true, `第 ${i} 次還鎖著`);
  }
  assert.deepEqual(seen, [75, 50, 25, 0]);
  assert.equal(m.done, true); assert.equal(H.marathonLocked(m), false); assert.equal(m.orgasms, 4);
  assert.equal(H.marathonOrgasm(g, m, { now: T0 + 9 * MIN }), null);
  // 進滿足期、求的窗口清掉、不會馬上又求
  assert.ok(g.bodyState.hunger.satedUntil > T0 + 60 * MIN);
  assert.equal(g.bodyState.hunger.beg, null);
  assert.equal(H.canBeg(g, { now: T0 + 30 * MIN }), false);
  // 96 → 4 次（96/25 無條件進位）
  assert.equal(H.marathonOrgasmsLeft(96), 4);
  assert.equal(H.marathonOrgasmsLeft(0), 0);
});

console.log(`\n${pass} passed`);
