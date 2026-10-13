// node tests/rental.test.mjs — 日租女友規則（web/content/rental.js）
import assert from "node:assert/strict";
import * as R from "../web/content/rental.js";

let pass = 0;
const t = (name, fn) => { fn(); pass += 1; console.log("ok -", name); };
const seq = (...v) => { let i = 0; return () => v[Math.min(i++, v.length - 1)]; };
/** 固定種子的亂數（測分布用）。 */
const lcg = (seed = 1) => { let s = Math.imul(seed + 1, 2654435761) >>> 0; for (let k = 0; k < 4; k++) s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 2 ** 32); };
const wife = (stage = "wife", archetype = "文靜溫柔", extra = {}) => ({ id: "a", name: "悠梨", roomStage: stage, archetype, stats: { loyalty: 60 },
  likes: ["手沖咖啡", "看海"], hobbies: ["唱歌"], kinks: [], ...extra });
const client = (persona = "gentleman", skill = 3, extra = {}) => ({ id: "c1", name: "佐藤健太", age: 32, persona, skill, build: "average", regular: false, ...extra });

t("只有妻子以上能去；懷孕中可以；一天一場、被拒冷卻 6 小時", () => {
  assert.equal(R.canRental(wife("lover")), false);
  assert.equal(R.canRental(wife("wife")), true);
  assert.equal(R.canRental(wife("pathological_wife", "病嬌", { bodyState: { pregnancy: { day: 3 } } })), true);
  assert.equal(R.canRental({ ...wife(), ntr: true }), false);
  const now = 1e12;
  assert.equal(R.limitOk({ starts: [] }, now).ok, true);
  assert.equal(R.limitOk({ starts: [now - 3600e3] }, now).why, "today");
  assert.equal(R.limitOk({ starts: [now - 25 * 3600e3] }, now).ok, true);
  assert.equal(R.limitOk({ askCoolUntil: now + 1000 }, now).why, "cool");
  assert.equal(R.limitOk({ active: true }, now).why, "active");
});

t("拜託她：階段／家族／忠誠／心情，夾 0.1～0.95；不是妻子 0", () => {
  assert.equal(R.askChance({ stage: "wife", family: "溫柔", loyalty: 60 }), 0.45);
  assert.equal(R.askChance({ stage: "obedient_wife", family: "反差", loyalty: 100 }), 0.95);
  assert.equal(R.askChance({ stage: "lover", family: "熱絡" }), 0);
  assert.ok(R.askChance({ stage: "wife", family: "冷淡", loyalty: 20, mood: { type: "angry", level: 80 } }) === 0.1);
  assert.equal(R.askChanceFor(wife("devoted_wife", "活潑開朗")), 0.75);
});

t("客人：3 位、5 種個性、手腕 1～5、體型照 id 固定；有熟客時一半機率排進來", () => {
  const cs = R.rollClients([], 123456, lcg(3));
  assert.equal(cs.length, 3);
  for (const c of cs) {
    assert.ok(R.PERSONA_KEYS.includes(c.persona)); assert.ok(c.skill >= 1 && c.skill <= 5);
    assert.equal(c.build, R.clientBuild(c.id)); assert.ok(c.name.length >= 2); assert.equal(c.regular, false);
  }
  assert.equal(new Set(cs.map((c) => c.id)).size, 3);
  const reg = { id: "old1", name: "田中誠", age: 41, persona: "otaku", skill: 2, build: "fat" };
  let hits = 0;
  for (let i = 0; i < 200; i++) if (R.rollClients([reg], i, lcg(i + 1)).some((c) => c.regular && c.id === "old1")) hits++;
  assert.ok(hits > 70 && hits < 130, `熟客出現 ${hits}/200`);
});

t("行程：客人依個性挑 2、她依喜好挑 1，白天→晚上排；她喜歡海就挑水族館", () => {
  const sp = R.planSpots(wife(), client("dominant"), lcg(1));
  assert.equal(sp.length, 3);
  assert.deepEqual(sp.filter((s) => s.by === "client").map((s) => s.key).sort(), ["izakaya", "nightview"]);
  const hers = sp.find((s) => s.by === "her").key;
  assert.ok(["cafe", "aquarium", "karaoke"].includes(hers), hers);   // 手沖咖啡／看海／唱歌
  const order = sp.map((s) => R.SPOTS[s.key].order);
  assert.deepEqual(order, [...order].sort((a, b) => a - b));
  assert.equal(R.herSpot({ likes: ["老電影"] }, [], () => 0), "cinema");
  assert.ok(R.SPOT_KEYS.includes(R.herSpot({}, ["cafe"], () => .99)));
});

t("邀請機率：A×B、手腕俐落補一點、熟客 ×2、夾 0.05～0.90", () => {
  const her = R.herFactor({ loyalty: 60, hunger: 0, kinks: [], family: "溫柔" });
  assert.equal(her, -0.05);
  assert.equal(R.inviteChance({ heat: 40, her, client: client("gentleman", 3) }), 0.3);
  assert.equal(R.inviteChance({ heat: 40, her, client: client("gentleman", 5) }), 0.56);          // −0.05 但手腕 5：+0.16 +0.10
  assert.equal(R.inviteChance({ heat: 40, her, client: client("gentleman", 3, { regular: true }) }), 0.6);
  assert.equal(R.inviteChance({ heat: 200, her: .5, client: client("dominant", 5, { regular: true }) }), 0.9);
  assert.equal(R.inviteChance({ heat: 0, her: -.6, client: client("gentleman", 1) }), 0.05);
  const hot = R.herFactor({ loyalty: 20, hunger: 90, kinks: ["NTR 癖好", "人妻風味"], family: "反差" });
  assert.equal(Math.round(hot * 100) / 100, 0.65);
});

t("整場真相：3 個點都有點的東西、時數加總、最後一點不會要求延長、邀請結果與休息／住宿", () => {
  const d = R.rollDate({ who: wife(), client: client("clingy", 4), now: 5e11 }, lcg(7));
  assert.equal(d.spots.length, 3);
  for (const s of d.spots) { assert.ok(R.SPOTS[s.key].items.includes(s.item)); assert.equal(s.h, R.SPOTS[s.key].h); }
  assert.equal(d.spots[2].extAsk, false);
  assert.ok(d.invite.p >= 0.05 && d.invite.p <= 0.9);
  assert.ok(["rest", "stay"].includes(d.invite.stay));
  assert.ok(d.startHour >= 10 && d.startHour <= 15);
  assert.equal(d.phase, "date"); assert.equal(d.startedAt, 5e11);
  assert.equal(R.rollDate({ who: wife(), client: client("gentleman") }, lcg(2)).invite.style, "ask");
  assert.equal(R.rollDate({ who: wife(), client: client("otaku") }, lcg(2)).invite.style, "assume");
});

t("邀請成功率分布：熱絡＋強勢手腕 5 明顯比 冷淡忠誠高＋紳士 1 高", () => {
  const rate = (w, c) => { let y = 0; for (let i = 0; i < 400; i++) if (R.rollDate({ who: w, client: c }, lcg(i + 9)).invite.yes) y++; return y / 400; };
  const hi = rate(wife("wife", "清純反差", { stats: { loyalty: 30 } }), client("dominant", 5));
  const lo = rate(wife("wife", "高冷", { stats: { loyalty: 95 } }), client("gentleman", 1));
  assert.ok(hi > 0.6 && lo < 0.3 && hi - lo > 0.4, `hi ${hi} lo ${lo}`);
});

t("旅館：去了幾乎都會做（做愛 92%），休息 1～3 次、住宿 2～5 次；在場時溫柔放不開、強勢客人反而更起勁", () => {
  let sex = 0;
  for (let i = 0; i < 500; i++) if (R.rollHotel({ who: wife(), client: client() }, lcg(i + 1)).level === "sex") sex++;
  assert.ok(sex > 430, `sex ${sex}/500`);
  assert.deepEqual(R.rollHotel({ who: wife(), client: client() }, seq(.01)), { level: "kiss", cums: 0, creampies: 0, condom: false });
  assert.equal(R.rollHotel({ who: wife(), client: client() }, seq(.05)).level, "oral");
  const avg = (o) => { let s = 0, c = 0; for (let i = 0; i < 400; i++) { const h = R.rollHotel(o, lcg(i + 3)); s += h.cums; c += h.creampies; } return [s / 400, c / 400]; };
  const [restC] = avg({ who: wife(), client: client(), stay: "rest" }), [stayC] = avg({ who: wife(), client: client(), stay: "stay" });
  assert.ok(stayC > restC + 1, `rest ${restC} stay ${stayC}`);
  const [, shyIn] = avg({ who: wife(), client: client("gentleman"), presence: "in" });
  const [, shyAway] = avg({ who: wife(), client: client("gentleman"), presence: "away" });
  const [, domIn] = avg({ who: wife(), client: client("dominant"), presence: "in" });
  assert.ok(shyIn < shyAway && domIn > shyAway, `in ${shyIn} away ${shyAway} dom ${domIn}`);
  const h = R.rollHotel({ who: wife(), client: client("gentleman", 3, { build: "muscular" }), stay: "stay" }, seq(.5, .99, .99, .99, .99, .99, .99, .99));
  assert.ok(h.cums <= 6 && h.creampies === 0 && h.condom === true);
});

t("誠實度：溫柔忠誠高＝誠實；反差忠誠低又內射＝說謊；輕描淡寫講低一級", () => {
  assert.equal(R.honesty(wife("obedient_wife", "文靜溫柔", { stats: { loyalty: 90 } })).level, "honest");
  assert.equal(R.honesty(wife("wife", "清純反差", { stats: { loyalty: 30 } }), { level: "sex", cums: 3, creampies: 2 }).level, "lie");
  assert.equal(R.honesty(wife("wife", "高冷", { stats: { loyalty: 70 } })).level, "downplay");
  const h = { level: "sex", cums: 2, creampies: 1 };
  assert.match(R.toldVersion(h, "honest"), /射在裡面/);
  assert.match(R.toldVersion(h, "downplay"), /戴套/);
  assert.match(R.toldVersion(h, "lie"), /休息/);
  assert.match(R.toldVersion({ level: "sex", cums: 1, creampies: 0 }, "downplay"), /嘴/);
});

t("影響：去休息忠誠 −1；在場再 −1、溫柔感情 −5、反差 +3 且是興奮不是羞恥；門外較輕；沒開車只有忠誠", () => {
  const date = (presence) => ({ hotel: { presence, result: { level: "sex", cums: 2, creampies: 1 } } });
  const a = R.effectsOf(wife(), date("in"), () => 0);
  assert.equal(a.loyalty, -2); assert.equal(a.affection, -5); assert.equal(a.mood.type, "ashamed"); assert.equal(a.hunger, -30);
  const b = R.effectsOf(wife("wife", "清純反差"), date("in"), () => 0);
  assert.equal(b.affection, 3); assert.equal(b.mood.type, "aroused");
  const c = R.effectsOf(wife(), date("door"), () => 0);
  assert.equal(c.loyalty, -1); assert.equal(c.affection, -3); assert.ok(c.mood.level < 41);
  const d = R.effectsOf(wife(), date("away"), () => 0);
  assert.equal(d.loyalty, -1); assert.equal(d.affection, 0); assert.equal(d.mood, null);
  assert.deepEqual(R.effectsOf(wife(), { hotel: null }), { loyalty: 0, affection: 0, mood: null, hunger: 0, creampies: 0 });
});

t("結算：一般 2～10 金、熟客 ×2；房錢休息 2／住宿 5 從收入扣；4 星以上可能變熟客", () => {
  const spots = [{ key: "cafe", act: "" }, { key: "dinner", act: "" }, { key: "nightview", act: "" }];
  const s0 = R.settle(wife(), { client: client(), spots, ext: 0 }, null, () => .99);
  assert.deepEqual([s0.stars, s0.base, s0.income, s0.net, s0.becomeRegular], [3, 4, 4, 4, false]);
  const hot = { client: client("gentleman"), spots: spots.map((s) => ({ ...s, act: "牽手" })), ext: 2,
    hotel: { drive: true, paidRoom: true, stay: "stay", result: { level: "sex", cums: 2, creampies: 0 } } };
  const s1 = R.settle(wife("wife", "活潑開朗"), hot, null, () => 0);
  assert.equal(s1.stars, 5); assert.equal(s1.income, 10); assert.equal(s1.roomFee, 5); assert.equal(s1.net, 5); assert.equal(s1.becomeRegular, true);
  const s2 = R.settle(wife("wife", "活潑開朗"), { ...hot, client: client("gentleman", 3, { regular: true }) }, null, () => .99);
  assert.equal(s2.income, 20);
  const s3 = R.settle(wife(), { client: client(), spots: [{ key: "cafe" }], ext: 0, extRefused: 3 }, { type: "angry", level: 50 });
  assert.equal(s3.stars, 1); assert.equal(s3.income, 2);
});

t("時鐘：真實 2 分＝1 小時；暫停不算；行程表含延長與旅館；結束判定", () => {
  const d = { startedAt: 0, startHour: 13, pausedMs: 0, pauseAt: 0, spots: [{ key: "cafe", h: 1 }, { key: "cinema", h: 2, extOk: true }, { key: "dinner", h: 2 }] };
  assert.equal(R.elapsedHours(d, 4 * 60e3), 2);
  assert.equal(R.elapsedHours({ ...d, pausedMs: 2 * 60e3 }, 4 * 60e3), 1);
  assert.equal(R.elapsedHours({ ...d, pauseAt: 2 * 60e3 }, 10 * 60e3), 1);
  const sc = R.schedule(d);
  assert.deepEqual(sc.segs.map((s) => [s.key, s.from, s.to]), [["cafe", 0, 1], ["cinema", 1, 4], ["dinner", 4, 6]]);
  assert.equal(R.schedule({ ...d, hotel: { stay: "stay" } }).total, 16);
  const w = R.where(d, 3 * R.GAME_HOUR_MS);
  assert.equal(w.seg.key, "cinema"); assert.equal(R.clockText(w.hour), "16:00"); assert.equal(w.done, false);
  assert.equal(R.where(d, 6 * R.GAME_HOUR_MS).done, true);
  assert.equal(R.clockText(13.5), "13:30");
});

console.log(`rental: ${pass} passed`);
