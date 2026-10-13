/* 日租女友（2026-10-13）：純規則，手機與 node 測試共用。設計見 docs/PLAN-2026-10.md「日租女友」、數字見 docs/RENTAL-GF-DRAFT.md。
 * 玩家拜託妻子以上的她去當一日女友 → 玩家挑客人 → 客人和她決定 3 個約會點 → 約會（壓縮時間：真實 2 分＝遊戲 1 小時）
 * → 客人可能邀她去休息（A 她 × B 客人，熟客 ×2）→ 玩家只能選開車送／付房錢／在場或門外 → 回家一般聊天 → 評價＋結算。
 * 開始時就把整場「真相」擲好存起來（LINE 兩邊、回家她怎麼講都讀同一份）。沒有偷看。 */
import { familyOf, stageIndexOf, isWifeStage } from "./girl_voice.js?v=1";

export const GAME_HOUR_MS = 2 * 60e3;        // 真實 2 分鐘＝遊戲 1 小時
export const DAY_MS = 24 * 3600e3;
export const PER_DAY = 1;                    // 真實一天最多一場
export const ASK_COOL_MS = 6 * 3600e3;       // 拜託被拒，6 小時後才能再請
export const INCOME_MIN = 2, INCOME_MAX = 10;   // 一般一場 2～10 金，熟客 ×2
export const ROOM_FEE = { rest: 2, stay: 5 };    // 玩家付房錢
export const HOTEL_HOURS = { rest: 3, stay: 10 };
export const DRIVER_TIP = 1;
export const EXT_PAY = 1;                    // 延長每小時 +1 金
export const HUNGER_PER_CUM = 15;

/** 客人個性：紳士（客氣邀請）、黏人（愛延長）、炫耀（愛跟經紀人炫耀）、強勢（推得動）、害羞宅男（自顧自當作她答應了）。 */
export const PERSONAS = {
  gentleman: { zh: "紳士", spots: ["aquarium", "dinner"], invite: -0.05, ext: 0.12, tip: 1 },
  clingy: { zh: "黏人", spots: ["amusement", "karaoke"], invite: 0, ext: 0.45, tip: 0 },
  showoff: { zh: "炫耀", spots: ["shopping", "dinner"], invite: 0, ext: 0.15, tip: 0 },
  dominant: { zh: "強勢", spots: ["izakaya", "nightview"], invite: 0.10, ext: 0.2, tip: 0 },
  otaku: { zh: "害羞宅男", spots: ["cinema", "cafe"], invite: 0, ext: 0.25, tip: 0 },
};
export const PERSONA_KEYS = Object.keys(PERSONAS);
export const CLIENT_BUILDS = ["average", "slim", "muscular", "fat", "tall", "short", "old"];
const SURNAMES = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡邊", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐佐木", "山口", "松本",
  "井上", "木村", "林", "清水", "山崎", "森", "池田", "橋本", "阿部", "石川", "前田", "藤田", "岡田", "後藤", "長谷川"];
const GIVEN_M = ["翔太", "大輔", "健太", "拓也", "直樹", "亮", "達也", "悠斗", "和也", "誠", "隆", "修", "慎吾", "陽介", "蓮"];

/** 約會點：時數（遊戲小時）、基本價、曖昧值、白天→晚上的順序、她挑這裡的興趣關鍵字、她會點的東西。 */
export const SPOTS = {
  cafe: { zh: "咖啡店", h: 1, pay: 1, heat: 5, order: 1, kw: /咖啡|甜點|抹茶|可可|茶|書|手帳/, items: ["拿鐵", "抹茶拿鐵", "熱可可", "草莓鬆餅", "冰美式", "起司蛋糕"] },
  aquarium: { zh: "水族館", h: 2, pay: 2, heat: 8, order: 2, kw: /海|魚|潛水|衝浪|水/, items: ["水母區", "企鵝餵食秀", "海豚表演", "大水槽"] },
  amusement: { zh: "遊樂園", h: 3, pay: 3, heat: 10, order: 2, kw: /煙火|露營|登山|騎|街舞|羽球/, items: ["雲霄飛車", "摩天輪", "鬼屋", "旋轉木馬"] },
  shopping: { zh: "逛街", h: 2, pay: 1, heat: 5, order: 3, kw: /二手|明信片|拍立得|逛|衣|飾/, items: ["一條項鍊", "一件連身裙", "一頂帽子", "一個包包"] },
  cinema: { zh: "電影院", h: 2, pay: 2, heat: 15, order: 3, kw: /電影|小說|推理/, items: ["愛情片", "恐怖片", "動畫電影", "懸疑片"] },
  dinner: { zh: "晚餐", h: 2, pay: 2, heat: 10, order: 4, kw: /草莓|料理|吃|美食|甜/, items: ["義大利麵", "牛排", "壽司", "法式套餐"] },
  karaoke: { zh: "卡拉 OK 包廂", h: 2, pay: 2, heat: 15, order: 5, kw: /唱歌|音樂|爵士|吉他|黑膠/, items: ["情歌對唱", "偶像歌", "老歌"] },
  izakaya: { zh: "居酒屋", h: 2, pay: 2, heat: 20, order: 5, kw: /酒|夜/, items: ["梅酒", "生啤酒", "檸檬沙瓦", "清酒"] },
  nightview: { zh: "夜景", h: 1, pay: 1, heat: 25, order: 6, kw: /星空|夜|看海|煙火/, items: ["展望台", "河堤", "山上的觀景台"] },
};
export const SPOT_KEYS = Object.keys(SPOTS);
/** 每個點擲一件「真相」：平常，或親近的小動作（約會本來就會有的）。 */
export const CLOSE_ACTS = ["牽手", "挽著他的手", "餵他吃一口", "被他摟著腰", "靠在他肩上"];

const pick = (arr, r) => arr[Math.floor(r() * arr.length) % arr.length];
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (r) => (typeof r === "function" ? r : Math.random);

export function stageKeyOf(who) { return who?.roomStage || who?.stage || "stranger"; }
/** 妻子以上、沒被搶走。懷孕中可以去。 */
export function canRental(who) { return !!who && !who.ntr && isWifeStage(stageKeyOf(who)); }
export function startsIn(log, now, span = DAY_MS) { return (log?.starts || []).filter((t) => now - Number(t) < span).length; }
/** 今天還能不能去、拜託冷卻。 */
export function limitOk(log, now) {
  if (log?.active) return { ok: false, why: "active" };
  if (startsIn(log, now) >= PER_DAY) return { ok: false, why: "today" };
  if (now < (Number(log?.askCoolUntil) || 0)) return { ok: false, why: "cool", wait: Number(log.askCoolUntil) - now };
  return { ok: true };
}

/** 拜託她：答應機率（妻子 0.5／貼心 0.7／順從 0.85／病態 0.6；家族、忠誠、心情）。 */
export const ASK_STAGE = { wife: 0.5, devoted_wife: 0.7, obedient_wife: 0.85, pathological_wife: 0.6 };
export const ASK_FAMILY = { 冷淡: -0.1, 溫柔: -0.05, 熱絡: 0.05, 佔有: -0.05, 反差: 0.1 };
export function askChance({ stage, family, loyalty = 60, mood = null } = {}) {
  let p = ASK_STAGE[stage] ?? 0;
  if (!p) return 0;
  p += ASK_FAMILY[family] ?? 0;
  p += ((Number(loyalty) || 60) - 60) / 200;
  if (mood?.type === "angry" || mood?.type === "hurt") p -= Math.min(0.35, (Number(mood.level) || 0) / 150);
  return clamp(Math.round(p * 100) / 100, 0.1, 0.95);
}
export function askChanceFor(who, mood = null) {
  return askChance({ stage: stageKeyOf(who), family: familyOf(who), loyalty: who?.stats?.loyalty ?? 60, mood });
}

/** FNV-1a（跟 escort.js 同一套）：客人 id → 體型固定。 */
export function fnv(text) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(String(text ?? ""))) { h ^= byte; h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}
export function clientBuild(id) { return CLIENT_BUILDS[fnv(id) % CLIENT_BUILDS.length]; }

/** 給玩家挑的 3 位客人。regulars：之前評價好、變成熟客的（who.rentalMine.regulars）；有的話其中一位 50% 是熟客。 */
export function rollClients(regulars = [], now = Date.now(), r0) {
  const r = rnd(r0), out = [], used = new Set();
  const regs = (regulars || []).filter((c) => c && c.id);
  if (regs.length && r() < 0.5) { const c = pick(regs, r); out.push({ ...c, regular: true }); used.add(c.id); }
  while (out.length < 3) {
    const id = `r${now % 1e9}${out.length}${Math.floor(r() * 1e4)}`;
    if (used.has(id)) continue;
    used.add(id);
    const persona = pick(PERSONA_KEYS, r);
    out.push({ id, name: pick(SURNAMES, r) + pick(GIVEN_M, r), age: 24 + Math.floor(r() * 30), persona,
      skill: 1 + Math.floor(r() * 5), build: clientBuild(id), regular: false });
  }
  return out;
}

/** 她挑的那一個點：喜好／興趣有對到的關鍵字優先，沒有就隨便一個她沒去過的。 */
export function herSpot(who, taken = [], r0) {
  const r = rnd(r0), text = [...(who?.likes || []), ...(who?.hobbies || [])].join("、");
  const hit = SPOT_KEYS.filter((k) => !taken.includes(k) && SPOTS[k].kw.test(text));
  const pool = hit.length ? hit : SPOT_KEYS.filter((k) => !taken.includes(k));
  return pick(pool, r);
}
/** 行程：客人依個性挑 2 個、她挑 1 個，照白天→晚上排。回傳 [{key, by}]。 */
export function planSpots(who, client, r0) {
  const r = rnd(r0), pref = PERSONAS[client?.persona]?.spots || ["cafe", "dinner"];
  const mine = pref.slice();
  const hers = herSpot(who, mine, r);
  const list = [...mine.map((k) => ({ key: k, by: "client" })), { key: hers, by: "her" }];
  return list.sort((a, b) => SPOTS[a.key].order - SPOTS[b.key].order);
}

/** A：她這邊（忠誠、飢渴、性癖、家族、心情）。 */
export const KINK_BONUS = { "NTR 癖好": 0.1, "淫蕩放蕩": 0.1, "癡女主動": 0.1, "人妻風味": 0.05 };
export const FAMILY_INVITE = { 反差: 0.1, 冷淡: -0.1, 溫柔: -0.05 };
export function herFactor({ loyalty = 60, hunger = 0, kinks = [], family = "", mood = null } = {}) {
  let a = (60 - (Number(loyalty) || 60)) / 200;
  if (hunger >= 85) a += 0.2; else if (hunger >= 60) a += 0.1;
  for (const k of kinks || []) a += KINK_BONUS[String(k).trim()] || 0;
  a += FAMILY_INVITE[family] || 0;
  if (mood && ["angry", "hurt", "sad"].includes(mood.type)) a -= 0.1;
  return a;
}
/** B：客人這邊（手腕、個性）。 */
export function clientFactor(client) { return ((Number(client?.skill) || 3) - 3) * 0.08 + (PERSONAS[client?.persona]?.invite || 0); }
/** 邀請去休息成功的機率：0.20＋曖昧/200＋A＋B（她不太願意但手腕 ≥4 再 +0.10），熟客 ×2，夾 0.05～0.90。 */
export function inviteChance({ heat = 0, her = 0, client = null } = {}) {
  let p = 0.2 + heat / 200 + her + clientFactor(client);
  if (her < 0 && (Number(client?.skill) || 0) >= 4) p += 0.1;
  if (client?.regular) p *= 2;
  return clamp(Math.round(p * 100) / 100, 0.05, 0.9);
}

/**
 * 整場的真相（開始時擲好）。ctx：{ who, client, hunger, mood, now }。
 * 回傳 date：{ v, client, spots:[{key, by, h, item, act, ext}], heat, invite:{p, yes, stay}, startedAt, startHour, ... }。
 * 延長要求擲在每個點（最後一點除外），玩家同意才真的加時數。
 */
export function rollDate(ctx = {}, r0) {
  const r = rnd(r0), who = ctx.who || {}, client = ctx.client || {};
  const family = familyOf(who), loyalty = who?.stats?.loyalty ?? 60;
  const her = herFactor({ loyalty, hunger: ctx.hunger || 0, kinks: who.kinks || [], family, mood: ctx.mood || null });
  const warm = clamp(0.35 + her + clientFactor(client) + (family === "熱絡" ? 0.15 : 0), 0.1, 0.85);   // 親近小動作的機率
  const per = PERSONAS[client.persona] || PERSONAS.gentleman;
  let heat = 0;
  const spots = planSpots(who, client, r).map((s, i, arr) => {
    const sp = SPOTS[s.key], act = r() < warm ? pick(CLOSE_ACTS, r) : "";
    heat += sp.heat + (act ? 5 : 0);
    return { key: s.key, by: s.by, h: sp.h, item: pick(sp.items, r), act, gift: s.key === "shopping" && r() < 0.6,
      drunk: s.key === "izakaya" && r() < 0.5, extAsk: i < arr.length - 1 && r() < per.ext };
  });
  const p = inviteChance({ heat, her, client });
  const yes = r() < p;
  const stay = yes && r() < (client.regular ? 0.5 : 0.3) ? "stay" : "rest";
  const total = spots.reduce((s, x) => s + x.h, 0);
  return { v: 1, client: { ...client }, spots, heat, her, warm,
    invite: { p, yes, stay, style: client.persona === "gentleman" ? "ask" : client.persona === "otaku" ? "assume" : "normal" },
    startedAt: Number(ctx.now) || Date.now(), startHour: clamp(21 - total, 10, 15),
    ext: 0, extRefused: 0, pausedMs: 0, pauseAt: 0, phase: "date", hotel: null };
}

/**
 * 旅館裡做到哪（玩家選完開車送／在場與否才擲）。opts：{ stay:'rest'|'stay', presence:'in'|'door'|'away' }。
 * 回傳 { level:'kiss'|'oral'|'sex', cums, creampies, condom }。
 */
export function rollHotel({ who, client, hunger = 0, stay = "rest", presence = "away" } = {}, r0) {
  const r = rnd(r0), family = familyOf(who), kinks = (who?.kinks || []).map((k) => String(k).trim());
  const lv = r();
  const level = lv < 0.03 ? "kiss" : lv < 0.08 ? "oral" : "sex";
  let pIn = 0.3 + hunger / 200 + (kinks.includes("妊娠渴望") ? 0.15 : 0) + (kinks.includes("精液中毒") ? 0.15 : 0)
    + (Number(client?.skill) || 3) * 0.05 + (stay === "stay" ? 0.1 : 0);
  let lo = stay === "stay" ? 2 : 1, hi = stay === "stay" ? 5 : 3, bonus = 0;
  if (client?.build === "muscular") bonus += 1;
  if (client?.build === "old") bonus -= 1;
  if (presence === "in") {
    const likesShy = client?.persona === "dominant" || client?.persona === "showoff";
    if (likesShy) { bonus += 1; pIn += 0.15; }           // 她越害羞他越起勁（他不知道你們的關係）
    else if (family === "溫柔" || family === "冷淡") { bonus -= 1; pIn -= 0.1; }
    if (family === "反差") { bonus += 1; pIn += 0.15; }
  }
  pIn = clamp(pIn, 0.1, 0.9);
  if (level === "kiss") return { level, cums: 0, creampies: 0, condom: false };
  if (level === "oral") return { level, cums: 1, creampies: 0, condom: false };
  const cums = clamp(lo + Math.floor(r() * (hi - lo + 1)) + bonus, 1, 6);
  let creampies = 0;
  for (let i = 0; i < cums; i++) if (r() < pIn) creampies++;
  return { level, cums, creampies, condom: creampies === 0 };
}

/** 誠實度：忠誠、家族、階段，做得越多越不想講。 */
export const HONEST_FAMILY = { 溫柔: 0.15, 熱絡: 0.1, 冷淡: 0, 佔有: -0.05, 反差: -0.1 };
export const HONEST_STAGE = { devoted_wife: 0.1, obedient_wife: 0.15, pathological_wife: -0.1 };
export function honesty(who, hotel = null) {
  let h = (Number(who?.stats?.loyalty ?? 60) / 100) * 0.6 + (HONEST_FAMILY[familyOf(who)] || 0) + (HONEST_STAGE[stageKeyOf(who)] || 0);
  if (hotel?.creampies) h -= 0.15;
  if (hotel?.cums > 1) h -= (hotel.cums - 1) * 0.05;
  const level = h >= 0.6 ? "honest" : h >= 0.35 ? "downplay" : "lie";
  return { h: Math.round(h * 100) / 100, level };
}
/** 她會怎麼講旅館裡的事（給回家聊天的 prompt）：誠實照講、輕描淡寫講低一級、說謊只說休息。 */
export function toldVersion(hotel, level) {
  if (!hotel) return "";
  const real = hotelText(hotel);
  if (level === "honest") return real;
  if (level === "lie") return "只是去休息，什麼都沒做";
  if (hotel.level === "sex" && hotel.creampies) return `有做，但他有戴套${hotel.cums > 1 ? "，只做了一次" : ""}`;
  if (hotel.level === "sex") return "只有用嘴幫他";
  if (hotel.level === "oral") return "只是親了一下";
  return "只是休息";
}
export function hotelText(h) {
  if (!h) return "";
  if (h.level === "kiss") return "只有接吻、愛撫";
  if (h.level === "oral") return "用嘴幫他弄出來一次";
  return `做愛，他射了 ${h.cums} 次${h.creampies ? `，其中 ${h.creampies} 次射在裡面` : "，都有戴套"}`;
}

/** 對玩家的影響：忠誠、感情、羞恥情緒（presence：in 在場／door 門外／away 沒開車）。 */
export const PRESENT_AFF = { 溫柔: -5, 佔有: -5, 冷淡: -2, 熱絡: 0, 反差: 3 };
export const DOOR_AFF = { 溫柔: -3, 佔有: -3, 冷淡: -1, 熱絡: 0, 反差: 2 };
export function effectsOf(who, date, r0) {
  const r = rnd(r0), fam = familyOf(who), out = { loyalty: 0, affection: 0, mood: null, hunger: 0, creampies: 0 };
  const h = date?.hotel;
  if (!h?.result) return out;
  out.loyalty -= 1;
  out.hunger = -HUNGER_PER_CUM * (h.result.cums || 0);
  out.creampies = h.result.creampies || 0;
  if (h.presence === "in") {
    out.loyalty -= 1; out.affection += PRESENT_AFF[fam] ?? -3;
    out.mood = fam === "反差" ? { type: "aroused", level: 40 + Math.floor(r() * 31), cause: "被你看著跟客人做" }
      : { type: "ashamed", level: 40 + Math.floor(r() * 31), cause: "在你面前被客人碰" };
  } else if (h.presence === "door") {
    out.affection += DOOR_AFF[fam] ?? -2;
    out.mood = fam === "反差" ? { type: "aroused", level: 20 + Math.floor(r() * 21), cause: "知道你在門外聽" }
      : { type: "ashamed", level: 20 + Math.floor(r() * 21), cause: "知道你在門外" };
  }
  return out;
}

/** 評價（1～5 星）：她熱情、親近事件、有去休息加分；心情不好、拒絕延長扣分。 */
export function stars(who, date, mood = null) {
  let s = 3 + (familyOf(who) === "熱絡" ? 1 : 0) - (mood && ["angry", "hurt", "sad"].includes(mood.type) ? 1 : 0);
  if ((date?.spots || []).some((x) => x.act)) s += 0.5;
  if (date?.hotel?.result) s += 1;
  s -= 0.5 * (Number(date?.extRefused) || 0);
  return clamp(Math.round(s), 1, 5);
}
/** 結算：收入（基本＋延長＋小費＋司機，夾 2～10，熟客 ×2）− 房錢。r 決定會不會變熟客。 */
export function settle(who, date, mood = null, r0) {
  const r = rnd(r0), st = stars(who, date, mood);
  const base = (date?.spots || []).reduce((s, x) => s + SPOTS[x.key].pay, 0);
  const ext = (Number(date?.ext) || 0) * EXT_PAY;
  const tip = (st >= 5 ? 2 : st >= 4 ? 1 : 0) + (st >= 4 ? PERSONAS[date?.client?.persona]?.tip || 0 : 0);
  const driver = date?.hotel?.drive ? DRIVER_TIP : 0;
  const raw = clamp(base + ext + tip + driver, INCOME_MIN, INCOME_MAX);
  const income = date?.client?.regular ? raw * 2 : raw;
  const roomFee = date?.hotel?.paidRoom ? ROOM_FEE[date.hotel.stay] || 0 : 0;
  const regular = !date?.client?.regular && (st >= 5 ? r() < 0.7 : st >= 4 ? r() < 0.4 : false);
  return { stars: st, base, ext, tip, driver, income, roomFee, net: income - roomFee, becomeRegular: regular || !!date?.client?.regular };
}

/** 約會時鐘：扣掉暫停（客人要求跳選擇時）。回傳經過的遊戲小時。 */
export function elapsedHours(date, now = Date.now()) {
  if (!date) return 0;
  const paused = (Number(date.pausedMs) || 0) + (date.pauseAt ? Math.max(0, now - date.pauseAt) : 0);
  return Math.max(0, now - Number(date.startedAt) - paused) / GAME_HOUR_MS;
}
/** 行程表：每段的起訖（遊戲小時，從 0 起算）。延長加在那一點後面。旅館接在最後。 */
export function schedule(date) {
  const segs = [];
  let t = 0;
  (date?.spots || []).forEach((s, i) => {
    const h = s.h + (s.extOk ? 1 : 0);
    segs.push({ kind: "spot", i, key: s.key, from: t, to: t + h });
    t += h;
  });
  if (date?.hotel?.result || date?.hotel?.stay) {
    const h = HOTEL_HOURS[date.hotel.stay] || HOTEL_HOURS.rest;
    segs.push({ kind: "hotel", from: t, to: t + h });
    t += h;
  }
  return { segs, total: t };
}
/** 現在在哪一段：{ seg, hour（顯示用 0～24）, done }。 */
export function where(date, now = Date.now()) {
  const { segs, total } = schedule(date), e = elapsedHours(date, now);
  const seg = segs.find((s) => e >= s.from && e < s.to) || null;
  return { seg, e, total, done: e >= total, hour: (Number(date?.startHour) || 13) + e };
}
export function clockText(hour) {
  const h = Math.floor(hour) % 24, m = Math.floor((hour % 1) * 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
