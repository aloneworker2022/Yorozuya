// node tests/room_activity.test.mjs — 房間活動（web/content/room_activity.js＋room_doll.js 活動姿勢＋room_character.js 執行）
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const dir = fileURLToPath(new URL("../web/content/", import.meta.url));
const require = createRequire(import.meta.url);
const A = require(`${dir}room_activity.js`);
const D = require(`${dir}room_doll.js`);

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const seeded = (s = 1) => () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
const T0 = Date.UTC(2026, 9, 8, 4, 0, 0);
const MIN = 60e3;
/** 用固定種子抽 n 次，回傳每個活動的比例。 */
function freq(ctx, n = 3000, seed = 7) {
  const rng = seeded(seed), c = {};
  for (let i = 0; i < n; i++) { const id = A.pick(ctx, rng).act.id; c[id] = (c[id] || 0) + 1; }
  for (const k in c) c[k] /= n;
  return new Proxy(c, { get: (o, k) => o[k] || 0 });
}
const base = { stage: "friend", now: T0, seats: ["chair"] };
const LIE = ["lie_phone", "prone_kick", "sleep"];
const sum = (f, ids) => ids.reduce((s, id) => s + f[id], 0);

t("8～10 個地上活動＋2 個椅子活動；欄位齊全、時長 1～3 分鐘左右", () => {
  const floor = A.ACTIVITIES.filter(a => a.place === "floor"), seat = A.ACTIVITIES.filter(a => a.place === "seat");
  assert.ok(floor.length >= 8 && floor.length <= 11, String(floor.length));
  assert.equal(seat.length, 2);
  for (const a of A.ACTIVITIES) {
    assert.ok(D.POSES[a.pose], `${a.id} pose ${a.pose}`);
    assert.ok(a.doing && a.react && a.name, a.id);
    assert.ok(a.dur[0] >= 40 && a.dur[1] <= 300 && a.dur[0] < a.dur[1], a.id);
    if (a.place === "seat") assert.ok(a.seat.includes("chair"));
  }
  // 沒有椅子就不會選椅子活動（資料驅動：以後加床／沙發只要加一筆）
  const w = A.weights({ ...base, seats: [] });
  assert.equal(w.get("chair_sit"), 0); assert.equal(w.get("chair_phone"), 0);
});

t("同一個種子抽出來一模一樣（決定性）", () => {
  const seq = s => { const r = seeded(s); return Array.from({ length: 30 }, () => A.pick(base, r).act.id).join(); };
  assert.equal(seq(42), seq(42));
  assert.notEqual(seq(42), seq(43));
});

t("半夜 1 點：夜貓子很有活力、早起型睡死", () => {
  const owl = freq({ ...base, hour: 1, chrono: "夜貓子" }), lark = freq({ ...base, hour: 1, chrono: "早起型" });
  const lively = ["prone_kick", "hum", "stretch"];
  assert.ok(lark.sleep > .35, `lark sleep ${lark.sleep}`);
  assert.ok(owl.sleep < .06, `owl sleep ${owl.sleep}`);
  assert.ok(sum(owl, lively) > 2.5 * sum(lark, lively), `${sum(owl, lively)} vs ${sum(lark, lively)}`);
  // 早上 7 點反過來：早起型精神好、夜貓子想睡
  const owl7 = freq({ ...base, hour: 7, chrono: "夜貓子" }), lark7 = freq({ ...base, hour: 7, chrono: "早起型" });
  assert.ok(owl7.sleep > lark7.sleep * 3, `${owl7.sleep} vs ${lark7.sleep}`);
  // 愛睡午覺：下午 2 點午睡
  const nap = freq({ ...base, hour: 14, chrono: "愛睡午覺" }), noon = freq({ ...base, hour: 11, chrono: "愛睡午覺" });
  assert.ok(nap.sleep > .3 && noon.sleep < .05, `${nap.sleep} ${noon.sleep}`);
});

t("生氣 → 蹲牆角背對；沒情緒時不會蹲角落也不會坐立不安", () => {
  const calm = freq({ ...base, hour: 15 });
  assert.equal(calm.sulk, 0); assert.equal(calm.restless, 0);
  const mad = freq({ ...base, hour: 15, mood: { type: "angry", level: 40 } });
  assert.ok(mad.sulk > .35, `sulk ${mad.sulk}`);
  assert.ok(mad.sulk === Math.max(...Object.values({ ...mad })), "sulk 最多");
  // 害羞 → 捲頭髮；興奮 → 前面坐立不安
  const shy = freq({ ...base, hour: 15, mood: { type: "flustered", level: 40 } });
  assert.ok(shy.twirl > calm.twirl * 1.8, `${shy.twirl} vs ${calm.twirl}`);
  const hot = freq({ ...base, hour: 15, mood: { type: "aroused", level: 50 } });
  assert.ok(hot.restless > .2, `restless ${hot.restless}`);
  assert.ok(freq({ ...base, hour: 15, arousal: 70 }).restless > .08);
});

t("想念高 → 走到最前面盯著你；想念低幾乎不會", () => {
  const lo = freq({ ...base, hour: 15, miss: 0 }), hi = freq({ ...base, hour: 15, miss: 85 });
  assert.ok(lo.stare < .03, `lo ${lo.stare}`);
  assert.ok(hi.stare > .25, `hi ${hi.stare}`);
  assert.ok(sum(hi, LIE) < sum(lo, LIE), "想念時不太想躺遠遠的");
});

t("關係：陌生人拘謹（幾乎不躺地上、常端正坐），女友放鬆會躺", () => {
  const stranger = freq({ ...base, hour: 15, stage: "stranger" }), gf = freq({ ...base, hour: 15, stage: "girlfriend" });
  assert.ok(sum(stranger, LIE) < .06, `stranger lie ${sum(stranger, LIE)}`);
  assert.ok(sum(gf, LIE) > .22, `gf lie ${sum(gf, LIE)}`);
  assert.ok(stranger.chair_sit > gf.chair_sit * 1.5, `${stranger.chair_sit} vs ${gf.chair_sit}`);
  assert.ok(stranger.chair_sit + stranger.wall_lean + stranger.twirl > .5);
});

t("興趣：愛唱歌的人更常哼歌；追劇的更常滑手機", () => {
  const plain = freq({ ...base, hour: 15, stage: "girlfriend" });
  assert.ok(freq({ ...base, hour: 15, stage: "girlfriend", hobbies: ["唱歌"] }).hum > plain.hum * 1.8);
  const tv = freq({ ...base, hour: 15, stage: "girlfriend", hobbies: ["追劇"] });
  assert.ok(tv.lie_phone + tv.chair_phone > (plain.lie_phone + plain.chair_phone) * 1.25);
});

t("不連續重複：上一件權重 0，上上件打折；連抽 400 次沒有相鄰重複", () => {
  for (const a of A.ACTIVITIES) {
    const w = A.weights({ ...base, hour: 15, mood: { type: "angry", level: 40 }, history: [a.id] });
    assert.equal(w.get(a.id), 0, a.id);
  }
  const w0 = A.weights({ ...base, hour: 15 }), w1 = A.weights({ ...base, hour: 15, history: ["x", "twirl"] });
  assert.ok(Math.abs(w1.get("twirl") - w0.get("twirl") * .35) < 1e-9);
  const rng = seeded(3), mem = A.ensureMem(null);
  let prev = "", now = T0;
  for (let i = 0; i < 400; i++) {
    const id = A.pick({ ...base, hour: i % 24, history: A.historyIds(mem), now }, rng).act.id;
    assert.notEqual(id, prev, `#${i}`);
    A.noteStart(mem, { id, at: now }); prev = id; now += 2 * MIN;
  }
  assert.ok(mem.history.length <= A.HISTORY_MAX);
  // 睡醒先伸懶腰
  assert.ok(A.weights({ ...base, hour: 10, history: ["sleep"] }).get("stretch") > 4 * A.weights({ ...base, hour: 10 }).get("stretch"));
});

t("番茄鐘開著：安靜（活潑／盯著看的少很多）", () => {
  const on = freq({ ...base, hour: 21, chrono: "夜貓子", calm: true }), off = freq({ ...base, hour: 21, chrono: "夜貓子" });
  const loud = ["prone_kick", "hum", "stretch", "stare", "restless"];
  assert.ok(sum(on, loud) < sum(off, loud) * .5, `${sum(on, loud)} vs ${sum(off, loud)}`);
});

t("聊完的偏向：開心→哼歌／靠近，生氣→蹲角落，興奮→前面坐立不安；8 分鐘 e 倍衰減、淡到消失", () => {
  assert.equal(A.chatBias({ affDelta: 1 }), null);
  const happy = A.chatBias({ affDelta: 5, now: T0 });
  assert.equal(happy.kind, "happy"); assert.equal(happy.strength, .5);
  const angry = A.chatBias({ mood: { type: "angry", level: 30 }, affDelta: 5, now: T0 });
  assert.equal(angry.kind, "angry"); assert.equal(angry.strength, .5);
  assert.equal(A.chatBias({ mood: { type: "aroused", level: 20 } }).kind, "aroused");
  assert.equal(A.chatBias({ arousalDelta: 20 }).kind, "aroused");
  assert.equal(A.chatBias({ mood: { type: "flustered", level: 25 } }).kind, "flustered");

  const ctx = { ...base, hour: 15, now: T0 };
  const plain = freq(ctx);
  const h = freq({ ...ctx, bias: happy });
  assert.ok(h.hum + h.stare > (plain.hum + plain.stare) * 2, `${h.hum + h.stare} vs ${plain.hum + plain.stare}`);
  const strongAngry = A.chatBias({ mood: { type: "angry", level: 60 }, now: T0 });
  assert.ok(freq({ ...ctx, bias: strongAngry }).sulk > .3);
  const aroused = A.chatBias({ mood: { type: "aroused", level: 60 }, now: T0 });
  assert.ok(freq({ ...ctx, bias: aroused }).restless > .25);

  // 衰減
  assert.ok(Math.abs(A.biasStrength(happy, T0 + A.BIAS_TAU_MS) - .5 / Math.E) < 1e-9);
  assert.equal(A.biasStrength(happy, T0 + 15 * MIN), 0, "15 分鐘後 .5→.08 以下歸零");
  const later = freq({ ...ctx, now: T0 + 40 * MIN, bias: strongAngry });
  assert.equal(later.sulk, 0);
  const mid = freq({ ...ctx, now: T0 + 6 * MIN, bias: strongAngry }).sulk;
  assert.ok(mid > 0 && mid < freq({ ...ctx, bias: strongAngry }).sulk, `mid ${mid}`);
});

t("打斷：睡覺一定叫得醒、起床氣看作息（同一場只算一次）", () => {
  const sleepAt = (chrono, hour = 2) => {
    const m = A.noteStart(null, { id: "sleep", at: T0 });
    return [m, A.interrupt(m, { now: T0 + 5 * MIN, chrono, hour })];
  };
  const [m, r] = sleepAt("淺眠易怒");
  assert.equal(r.wake, true); assert.deepEqual(r.mood, { type: "angry", level: 30, cause: "睡覺被你吵醒" });
  const again = A.interrupt(m, { now: T0 + 7 * MIN, chrono: "淺眠易怒" });
  assert.equal(again.wake, true); assert.equal(again.mood, null);
  assert.equal(sleepAt("早起型")[1].mood.level, 12);
  assert.equal(sleepAt("夜貓子")[1].mood.level, 22);
  assert.equal(sleepAt("隨和好睡")[1].mood, null);
  assert.equal(sleepAt("愛睡午覺", 14)[1].mood.level, 28);
  assert.equal(sleepAt("愛睡午覺", 2)[1].mood.level, 18);
  // 剛聊完馬上又打開（60 秒內）也照樣醒
  const m2 = A.noteStart(null, { id: "sleep", at: T0 }); m2.closeAt = T0 + 5 * MIN - 1000;
  assert.equal(A.interrupt(m2, { now: T0 + 5 * MIN, chrono: "夜貓子" }).wake, true);
});

t("打斷專心／玩得正開心 → 小不爽（看作息），10 分鐘冷卻；無聊被理 → 感情 +1，20 分鐘冷卻", () => {
  let now = T0;
  const mem = A.noteStart(null, { id: "lie_phone", at: now });
  now += 2 * MIN;
  const r1 = A.interrupt(mem, { now, chrono: "淺眠易怒" });
  assert.equal(r1.mood.type, "angry"); assert.equal(r1.mood.level, Math.round((8 + 6 * .8) * 1.3));
  assert.match(r1.mood.cause, /滑手機被你打斷/);
  // 同一件事再開一次：不再算
  assert.equal(A.interrupt(mem, { now: now + 2 * MIN }).mood, null);
  // 換一件事，但還在 10 分鐘冷卻內
  A.noteStart(mem, { id: "hum", at: now + 3 * MIN });
  const r2 = A.interrupt(mem, { now: now + 5 * MIN });
  assert.equal(r2.mood, null); assert.equal(r2.reason, "冷卻中");
  A.noteStart(mem, { id: "prone_kick", at: now + 9 * MIN });
  const r3 = A.interrupt(mem, { now: now + 11 * MIN, chrono: "隨和好睡" });
  assert.equal(r3.mood.level, Math.round((8 + 6 * .4) * .7));

  // 無聊
  const idle = A.noteStart(null, { id: "twirl", at: T0 });
  assert.equal(A.interrupt(idle, { now: T0 + MIN }).affection, 1);
  A.noteStart(idle, { id: "wall_lean", at: T0 + 3 * MIN });
  assert.equal(A.interrupt(idle, { now: T0 + 5 * MIN }).affection, 0, "20 分鐘冷卻");
  A.noteStart(idle, { id: "hug_knees", at: T0 + 20 * MIN });
  assert.equal(A.interrupt(idle, { now: T0 + 22 * MIN }).affection, 1);

  // 才剛開始做（<20 秒）、剛聊完 60 秒內再開：都不算
  const fresh = A.noteStart(null, { id: "lie_phone", at: T0 });
  assert.equal(A.interrupt(fresh, { now: T0 + 10e3 }).mood, null);
  const reopen = A.noteStart(null, { id: "lie_phone", at: T0 }); reopen.closeAt = T0 + 2 * MIN;
  assert.equal(A.interrupt(reopen, { now: T0 + 2 * MIN + 30e3 }).reason, "剛聊完");
  assert.ok(A.interrupt(reopen, { now: T0 + 4 * MIN }).mood, "過了 60 秒照算");
  // 鬧情緒中（蹲角落）不加不減
  const sulk = A.noteStart(null, { id: "sulk", at: T0 });
  const rs = A.interrupt(sulk, { now: T0 + 2 * MIN });
  assert.equal(rs.mood, null); assert.equal(rs.affection, 0);
  // 刷不出來：一小時內一直開關對話，感情最多 +3、不爽最多 6 次
  const farm = A.ensureMem(null); let aff = 0, annoy = 0, tt = T0;
  const ids = ["twirl", "lie_phone", "wall_lean", "hum", "hug_knees", "prone_kick"];
  for (let i = 0; i < 120; i++) {
    if (i % 3 === 0) A.noteStart(farm, { id: ids[(i / 3) % ids.length], at: tt });
    tt += 30e3;
    const r = A.interrupt(farm, { now: tt }); aff += r.affection; if (r.mood) annoy++;
    farm.closeAt = tt + 5e3;
  }
  assert.ok(aff <= 3 && annoy <= 6, `aff ${aff} annoy ${annoy}`);
});

t("prompt：第一句接上正在做的事＋多久＋前一件；叫醒用起床反應；稍早的記憶帶時間", () => {
  const mem = A.ensureMem(null);
  A.noteStart(mem, { id: "twirl", at: T0 - 20 * MIN });
  A.noteStart(mem, { id: "wall_lean", at: T0 - 12 * MIN });
  A.noteStart(mem, { id: "lie_phone", at: T0 - 7 * MIN });
  const talk = { id: "lie_phone", since: T0 - 7 * MIN, at: T0 - 3 * MIN, prevId: "wall_lean", prevAt: T0 - 12 * MIN };
  const open = A.promptLines({ talk, mem, now: T0 - 3 * MIN, opening: true }).join("\n");
  console.log(open.replace(/^/gm, "    | "));
  assert.match(open, /【你剛才在房間裡】/);
  assert.match(open, /你正躺在地上滑手機（大概4 分鐘了）。在那之前你靠在牆邊抱著手臂發呆。/);
  assert.match(open, /第一句先自然接上你正在做的事（正在滑手機看東西/);
  assert.match(open, /稍早你在房間裡：.*分鐘前無聊地捲著頭髮/);
  assert.doesNotMatch(open, /稍早.*靠在牆邊/, "前一件已經在上面講過");
  const later = A.promptLines({ talk, mem, now: T0, opening: false }).join("\n");
  assert.match(later, /這只是剛才的狀態/); assert.doesNotMatch(later, /第一句/);

  const wake = A.promptLines({ talk: { id: "sleep", since: T0 - 30 * MIN, at: T0, wake: true }, mem, now: T0, opening: true, wakeReact: "很兇，會先罵人" }).join("\n");
  assert.match(wake, /你蜷在地上睡著了（大概30 分鐘了）/);
  assert.match(wake, /被他叫醒的。起床反應：很兇，會先罵人。/);
  assert.match(A.openerHint({ id: "sleep", wake: true }, "迷糊"), /被叫醒；起床反應：迷糊/);
  assert.match(A.openerHint({ id: "hum" }), /^她剛才正一邊哼歌/);
  assert.equal(A.openerHint(null), "");
  // 沒在做什麼、也沒記憶 → 不加任何東西
  assert.deepEqual(A.promptLines({ talk: null, mem: null }), []);
});

/* ── 活動姿勢：每個姿勢每一格、好幾種外型、該有的朝向都畫得出東西 ── */
const opaque = f => { let n = 0; for (let i = 3; i < f.pixels.length; i += 4) if (f.pixels[i]) n++; return n; };
const looks = [
  { height_cm: 161, build: "勻稱有致", cup: "D 罩杯、飽滿有份量", hair: "中分長髮" },
  { height_cm: 150, build: "嬌小玲瓏", cup: "A", hair: "雙馬尾" },
  { height_cm: 174, build: "肉感豐腴", cup: "H", hair: "及腰長直髮" },
  { height_cm: 166, build: "運動健美", cup: "C", hair: "高馬尾" },
];
t("每個活動姿勢：4 種外型 × 每一格 × 會用到的朝向都有像素，尺寸照 CANVAS；循環格彼此不同", () => {
  const yaws = { out: [45, 135], wall: [135], front: [0] };
  for (const a of A.ACTIVITIES) {
    const P = D.POSES[a.pose], C = D.CANVAS[P.canvas || "std"];
    assert.ok(P.frames >= 1 && C, a.pose);
    for (const look of looks) {
      const doll = D.lookToDoll(look);
      for (const yaw of a.place === "seat" ? [45, -45] : yaws[a.facing]) {
        const seen = new Set();
        for (let f = 0; f < P.frames; f++) {
          const fr = D.render(doll, a.pose, f, yaw);
          assert.equal(fr.width, C.w, a.pose); assert.equal(fr.height, C.h, a.pose);
          const n = opaque(fr);
          assert.ok(n > 500, `${a.pose} ${look.build} yaw${yaw} f${f}: ${n}`);
          seen.add(Buffer.from(fr.pixels.buffer).toString("base64"));
        }
        if (P.frames > 1) assert.ok(seen.size > 1, `${a.pose} 有在動`);
      }
    }
  }
});

t("躺姿用寬畫布、腳底錨點在畫布裡；外型不同畫出來不同", () => {
  for (const pose of ["lie_phone", "prone_kick", "sleep_curl"]) {
    assert.equal(D.POSES[pose].canvas, "wide");
    const a = D.render(D.lookToDoll(looks[0]), pose, 0, 45), b = D.render(D.lookToDoll(looks[2]), pose, 0, 45);
    assert.ok(a.anchor.x > 0 && a.anchor.x < a.width && a.anchor.y < a.height);
    assert.notEqual(Buffer.from(a.pixels.buffer).toString("base64"), Buffer.from(b.pixels.buffer).toString("base64"));
  }
});

/* ── 控制器：真的照活動走（沒有 DOM／Worker，用假 canvas） ── */
t("控制器：走過去→進入→維持→起身，一件接一件不重複，有 start／hold 事件；hold(true) 時不換", () => {
  globalThis.window = globalThis;
  const ctx2d = new Proxy({}, { get: (_, k) => k === "getImageData" ? (x, y, w, h) => ({ data: new Uint8ClampedArray(w * h * 4) }) : () => {}, set: () => true });
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ctx2d }) };
  globalThis.RoomDoll = D; globalThis.RoomActivity = A;
  require(`${dir}room_character.js`);
  const RC = globalThis.RoomCharacter;
  const chair = { id: 1, type: "chair", u: 1, v: 3, cols: 1, rows: 1, seats: [{ u: 1.5, v: 3.5, height: 35, facing: "left" }] };
  const events = [];
  const actor = RC.create({ cols: 4, rows: 6, blocked: (u, v) => u === 1 && v === 3, getSeats: () => [chair], random: seeded(11),
    getContext: () => ({ hour: 15, stage: "girlfriend", now: T0, seats: ["chair"] }), onActivity: e => events.push(e) });
  actor.setPresent(true);
  const phases = new Set();
  for (let i = 0; i < 20 * 60 * 20; i++) { actor.update(.05); const x = actor.activity(); if (x) phases.add(x.phase); }
  const starts = events.filter(e => e.type === "start").map(e => e.id);
  assert.ok(starts.length >= 5, starts.join());
  for (let i = 1; i < starts.length; i++) assert.notEqual(starts[i], starts[i - 1]);
  assert.ok(events.some(e => e.type === "hold"));
  for (const p of ["go", "enter", "hold"]) assert.ok(phases.has(p), p);
  // 聊天中（hold）不會換活動
  while (!actor.activity() || actor.activity().phase !== "hold") actor.update(.05);
  const id = actor.activity().id;
  actor.hold(true);
  for (let i = 0; i < 20 * 400; i++) actor.update(.05);
  assert.equal(actor.activity().id, id);
  actor.hold(false);
  console.log("    starts:", starts.join(" → "));
});

console.log(`room_activity: ${pass} passed`);
