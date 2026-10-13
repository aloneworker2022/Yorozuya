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
/**
 * 約會互動（2026-10-13）：每一站 2～3 件，客人照升溫慢慢往上試，她接受或閃開。玩家只能從 LINE 知道。
 * lv：1 牽手類／2 摟腰餵食／3 曖昧（偷看、摸腿、貼坐）／4 抱、親臉／5 接吻／6 摸胸、她摸他下面（使用者定的上限）。
 * c＝客人講（我…）、w＝她講（被他…／我…）、t＝真相（給 AI 和回家聊天）。
 */
const B = (lv, c, w, t) => ({ lv, c, w, t });
export const BEATS = {
  cafe: [B(1, "跟她用兩根吸管喝同一杯", "跟他用兩根吸管喝同一杯", "兩人用兩根吸管喝同一杯"), B(2, "餵她吃了一口蛋糕", "被他餵了一口蛋糕", "他餵她吃蛋糕"),
    B(3, "桌子底下用腳碰她的腳", "桌子底下被他用腳碰", "他在桌下用腳碰她的腳"), B(3, "一直偷看她的胸口", "被他一直盯著胸口看", "他一直偷看她的胸口")],
  aquarium: [B(1, "在暗暗的地方牽了她的手", "在暗的地方被他牽手", "在暗處牽手"), B(2, "在水母區從後面摟住她的腰", "在水母區被他從後面摟腰", "他在水母區從後面摟她的腰"),
    B(3, "跟她臉貼臉拍了情侶照", "跟他臉貼臉拍了照", "臉貼臉拍情侶照"), B(4, "在海底隧道親了她的臉", "在隧道被他親了臉", "他在海底隧道親她的臉"),
    B(5, "在海底隧道跟她接吻", "在隧道跟他接吻", "在海底隧道接吻")],
  amusement: [B(1, "坐雲霄飛車她一直抓著我的手", "坐雲霄飛車一直抓著他的手", "雲霄飛車上她抓著他的手"), B(3, "跟她同騎一匹旋轉木馬，貼得很緊", "跟他同騎一匹木馬", "同騎一匹旋轉木馬、身體貼著"),
    B(4, "在鬼屋裡趁機把她抱緊", "在鬼屋被他抱緊", "鬼屋裡他趁機抱緊她"), B(5, "在摩天輪最高的地方跟她接吻", "在摩天輪上跟他接吻", "摩天輪頂端接吻"),
    B(6, "在摩天輪裡摸了她的胸", "在摩天輪裡被他摸胸", "摩天輪車廂裡他隔著衣服摸她的胸")],
  shopping: [B(1, "她挽著我的手，店員都當我們是情侶", "挽著他的手逛街", "她挽著他的手被當成情侶"), B(2, "買項鍊送她，親手幫她戴上", "他送我項鍊、幫我戴上", "他送她項鍊、親手幫她戴上碰到脖子"),
    B(3, "在試衣間外偷看她換衣服", "換衣服時被他偷看", "他在試衣間外偷看她換衣服"), B(4, "在試衣間裡抱住她", "在試衣間被他抱住", "他擠進試衣間抱住她"),
    B(6, "在試衣間裡摸了她的胸", "在試衣間被他摸胸", "試衣間裡他摸她的胸")],
  cinema: [B(1, "跟她一起吃爆米花，一直碰到手", "跟他一起吃爆米花", "共用爆米花、碰到手"), B(2, "看到可怕的地方她抱住我", "看到可怕的地方抱住他", "她嚇到抱住他"),
    B(3, "手一直放在她大腿上", "手被他放在大腿上", "他把手放在她大腿上"), B(5, "趁黑跟她接吻", "在黑暗裡跟他接吻", "電影院黑暗中接吻"),
    B(6, "隔著衣服揉了她的胸", "被他隔著衣服揉胸", "電影院裡他隔著衣服揉她的胸"), B(6, "拉她的手來摸我下面", "被他拉手去摸他下面", "她的手被拉去隔著褲子摸他下面")],
  dinner: [B(2, "跟她互相餵東西吃", "跟他互相餵東西", "互相餵食"), B(3, "跟她喝了交杯酒", "跟他喝了交杯酒", "喝交杯酒"),
    B(3, "桌子底下摸了她的腿", "桌下被他摸腿", "他在桌下摸她的腿"), B(3, "一直盯著她的胸口", "被他一直盯著胸口", "他一直盯她胸口")],
  karaoke: [B(1, "跟她情侶對唱", "跟他對唱情歌", "情侶對唱"), B(2, "在包廂裡貼著她坐、摟著她", "在包廂被他摟著", "包廂裡貼著坐、他摟她"),
    B(4, "唱到一半親了她的臉", "唱到一半被他親臉", "他唱到一半親她的臉"), B(5, "在包廂裡跟她擁吻", "在包廂跟他擁吻", "包廂裡擁吻"),
    B(6, "在包廂裡摸了她的胸", "在包廂被他摸胸", "包廂裡他摸她的胸"), B(6, "她在包廂裡摸了我下面", "在包廂摸了他下面", "她在包廂裡隔著褲子摸他下面")],
  izakaya: [B(1, "一直幫她倒酒", "被他一直勸酒", "他一直勸她喝"), B(2, "她喝醉了靠在我身上", "喝醉靠在他身上", "她喝醉靠在他身上"),
    B(3, "跟她喝交杯，順便摸她大腿", "跟他喝交杯、被摸大腿", "交杯時他摸她大腿"), B(5, "在角落的座位跟她接吻", "在角落跟他接吻", "居酒屋角落接吻")],
  nightview: [B(1, "牽著她的手看夜景", "牽手看夜景", "牽手看夜景"), B(4, "從後面抱住她", "被他從後面抱住", "他從後面抱住她"),
    B(5, "跟她接吻", "跟他接吻", "看夜景時接吻"), B(6, "抱著她的時候摸了她的胸", "抱著時被他摸胸", "他從後面抱著摸她的胸"),
    B(6, "她偷偷摸了我下面", "偷偷摸了他下面", "她隔著褲子摸他下面")],
};
/** 客人敢試到幾級：升溫越高越敢；強勢／炫耀快、紳士慢；她喝醉 +1。 */
export const PUSH = { gentleman: -1, clingy: 0, showoff: 1, dominant: 1, otaku: 0 };
export function beatCap(heat, persona, drunk = false) { return clamp(2 + Math.floor(heat / 20) + (PUSH[persona] || 0) + (drunk ? 1 : 0), 1, 6); }
/** 她接受的機率：級數越高越難；A（她）、B（客人手腕）、升溫、喝醉加成。 */
export function acceptChance(lv, { her = 0, client = null, heat = 0, drunk = false } = {}) {
  return clamp(0.85 - 0.12 * (lv - 1) + her + clientFactor(client) + heat / 300 + (drunk ? 0.15 : 0), 0.05, 0.95);
}
/** 一站的互動：2～3 件、級數由低到高（客人一步步試）。回 [{...beat, ok}]，同時回升溫。 */
export function rollBeats(key, { her = 0, client = null, heat = 0, drunk = false } = {}, r0) {
  const r = rnd(r0), pool = (BEATS[key] || []).slice(), out = [];
  let h = heat;
  const n = 2 + (r() < 0.5 ? 1 : 0);
  for (let k = 0; k < n && pool.length; k++) {
    const cap = beatCap(h, client?.persona, drunk);
    let can = pool.filter((b) => b.lv <= cap);
    if (!can.length && k === 0) { const m = Math.min(...pool.map((b) => b.lv)); can = pool.filter((b) => b.lv === m); }   // 每站至少試一件最輕的
    if (!can.length) break;
    const lo = Math.min(...can.map((b) => b.lv)), hi = Math.max(...can.map((b) => b.lv));
    const want = k === n - 1 ? hi : lo + Math.floor(r() * (hi - lo + 1));   // 最後一件試最大膽的
    const choices = can.filter((b) => b.lv === want);
    const b = pick(choices.length ? choices : can, r);
    pool.splice(pool.indexOf(b), 1);
    const ok = r() < acceptChance(b.lv, { her, client, heat: h, drunk });
    h += ok ? b.lv * 3 + 2 : 1;
    out.push({ ...b, ok });
    if (!ok && b.lv >= 4) break;   // 被拒絕一次大的，這站就不再試了
  }
  out.sort((a, b) => a.lv - b.lv);
  return { beats: out, heat: h };
}

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
/**
 * 行程（2026-10-13 改）：客人依個性挑 1 個、她依喜好挑 1 個、再隨機 1 個，照白天→晚上排。回傳 [{key, by}]（by：client／her／random）。
 * 玩家事先不知道行程：到了那一站，客人在 LINE 傳訊息才知道。
 */
export function planSpots(who, client, r0) {
  const r = rnd(r0), pref = PERSONAS[client?.persona]?.spots || ["cafe", "dinner"];
  const his = pick(pref, r);
  const hers = herSpot(who, [his], r);
  const rest = SPOT_KEYS.filter((k) => k !== his && k !== hers);
  const extra = pick(rest, r);
  const list = [{ key: his, by: "client" }, { key: hers, by: "her" }, { key: extra, by: "random" }];
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
/** 邀請去休息成功的機率：0.20＋曖昧/300＋A＋B（她不太願意但手腕 ≥4 再 +0.10），熟客 ×2，夾 0.05～0.90。 */
export function inviteChance({ heat = 0, her = 0, client = null } = {}) {
  let p = 0.2 + heat / 300 + her + clientFactor(client);   // 2026-10-13：每站有好幾件互動、曖昧值變大，÷200 → ÷300
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
  const per = PERSONAS[client.persona] || PERSONAS.gentleman;
  let heat = 0;
  const spots = planSpots(who, client, r).map((s, i, arr) => {
    const sp = SPOTS[s.key], drunk = s.key === "izakaya" && r() < 0.5;
    heat += sp.heat;
    const rb = rollBeats(s.key, { her, client, heat, drunk }, r);
    heat = rb.heat;
    const top = rb.beats.filter((b) => b.ok).at(-1) || null;   // 這站最親密、她接受的那件（句庫用）
    return { key: s.key, by: s.by, h: sp.h, item: pick(sp.items, r), beats: rb.beats, act: top?.c || "", actW: top?.w || "",
      gift: s.key === "shopping" && rb.beats.some((b) => b.ok && /項鍊/.test(b.t)), drunk, extAsk: i < arr.length - 1 && r() < per.ext };
  });
  const p = inviteChance({ heat, her, client });
  const yes = r() < p;
  const stay = yes && r() < (client.regular ? 0.5 : 0.3) ? "stay" : "rest";
  const total = spots.reduce((s, x) => s + x.h, 0);
  return { v: 2, client: { ...client }, spots, heat, her,
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
      : { type: "flustered", level: 40 + Math.floor(r() * 31), cause: "在你面前被客人碰" };
  } else if (h.presence === "door") {
    out.affection += DOOR_AFF[fam] ?? -2;
    out.mood = fam === "反差" ? { type: "aroused", level: 20 + Math.floor(r() * 21), cause: "知道你在門外聽" }
      : { type: "flustered", level: 20 + Math.floor(r() * 21), cause: "知道你在門外" };
  }
  return out;
}

/** 評價（1～5 星）：她熱情、親近事件、有去休息加分；心情不好、拒絕延長扣分。 */
export function stars(who, date, mood = null) {
  let s = 3 + (familyOf(who) === "熱絡" ? 1 : 0) - (mood && ["angry", "hurt", "sad"].includes(mood.type) ? 1 : 0);
  const beats = (date?.spots || []).flatMap((x) => x.beats || []);
  if ((date?.spots || []).some((x) => x.act)) s += 0.5;
  if (beats.some((b) => b.ok && b.lv >= 5)) s += 0.5;
  s -= Math.min(1.5, 0.5 * beats.filter((b) => !b.ok).length);   // 她閃開，客人不高興
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

/**
 * 時間軸（遊戲小時）：什麼時候客人／她傳訊、哪裡要停下來讓玩家決定。跟著 schedule 走（延長、旅館會把後面往後推）。
 * kind：cs（客人在第 i 點；玩家這時才知道去了哪）／ws（她在第 i 點）／ext（延長要求，決定）／invite（去休息通知，決定）／
 *       bye（沒去休息，結束）／wh（她在旅館傳訊）／hd（客人說結束）／end（整場結束）。
 */
export function timeline(date) {
  const { segs } = schedule(date), out = [];
  const spots = segs.filter((s) => s.kind === "spot");
  for (const s of spots) {
    const len = s.to - s.from, sp = date.spots[s.i];
    // 互動一件一件發生；她閃開的那件，客人馬上傳訊息抱怨（句庫）。整站的報告（AI）在快離開時傳。
    const bs = sp.beats || [];
    bs.forEach((b, j) => { if (!b.ok) out.push({ id: `cr:${s.i}:${j}`, kind: "cr", i: s.i, j, at: s.from + ((j + 1) / (bs.length + 1)) * 0.85 * len }); });
    out.push({ id: `ws:${s.i}`, kind: "ws", i: s.i, at: s.from + 0.55 * len });
    out.push({ id: `cs:${s.i}`, kind: "cs", i: s.i, at: s.from + 0.8 * len });
    if (sp.extAsk) out.push({ id: `ext:${s.i}`, kind: "ext", i: s.i, at: s.from + sp.h - 0.2, decide: true });
  }
  const T = spots.length ? spots[spots.length - 1].to : 0;
  if (!date.invite?.yes) { out.push({ id: "bye", kind: "bye", at: T }, { id: "end", kind: "end", at: T + 0.01 }); return out; }
  out.push({ id: "invite", kind: "invite", at: T, decide: true });
  const hotel = segs.find((s) => s.kind === "hotel");
  if (hotel) {
    if (date.hotel?.presence !== "in") out.push({ id: "wh", kind: "wh", at: hotel.from + 0.3 * (hotel.to - hotel.from) });
    out.push({ id: "hd", kind: "hd", at: hotel.to - 0.05 }, { id: "end", kind: "end", at: hotel.to });
  }
  return out;
}
/** 已經到時間、還沒決定的那個決定點（ext／invite）。 */
export function dueDecision(date, now = Date.now()) {
  const e = elapsedHours(date, now), d = date?.decide || {};
  return timeline(date).find((ev) => ev.decide && ev.at <= e + 1e-9 && d[ev.id] === undefined) || null;
}
/** 停在決定點：從應該停下來的那一刻開始算暫停（關掉 App 再打開也不會跑過頭）。 */
export function pauseAtDecision(date, ev) {
  if (!date || !ev || date.pauseAt) return;
  date.pauseAt = Number(date.startedAt) + (Number(date.pausedMs) || 0) + ev.at * GAME_HOUR_MS;
}
export function resume(date, now = Date.now()) {
  if (!date?.pauseAt) return;
  date.pausedMs = (Number(date.pausedMs) || 0) + Math.max(0, now - date.pauseAt);
  date.pauseAt = 0;
}
/** 玩家做決定。ext：true／false；invite：{ drive, paidRoom, presence }（沒開車 presence 一定是 away）。 */
export function decide(date, id, value, now = Date.now()) {
  date.decide = date.decide || {};
  date.decide[id] = value;
  if (id.startsWith("ext:")) {
    const i = Number(id.slice(4));
    if (value) { date.spots[i].extOk = true; date.ext = (Number(date.ext) || 0) + 1; } else date.extRefused = (Number(date.extRefused) || 0) + 1;
  }
  if (id === "invite") {
    const drive = !!value?.drive;
    date.hotel = { stay: date.invite.stay, drive, paidRoom: drive && !!value?.paidRoom, presence: drive ? (value?.presence === "in" ? "in" : "door") : "away", result: null };
  }
  resume(date, now);
}
/** 快轉（只有沒開車、在家等住宿一晚時）：直接跳到旅館結束前一點點。中途的訊息照樣會出現，但你沒有即時看到。 */
export function fastForward(date, now = Date.now()) {
  const hotel = schedule(date).segs.find((s) => s.kind === "hotel");
  if (!hotel || date.hotel?.presence !== "away") return false;
  const e = elapsedHours(date, now), target = hotel.to - 0.1;
  if (e >= target) return false;
  date.startedAt = Number(date.startedAt) - (target - e) * GAME_HOUR_MS;
  date.skipped = true;
  return true;
}

/** 回家聊天的 prompt（她知道的真相＋玩家可能知道什麼＋該怎麼講）。48 小時內才帶。 */
export function promptLines(who, now = Date.now()) {
  const last = who?.rentalMine?.last;
  if (!last || now - Number(last.endAt || 0) > 48 * 3600e3) return [];
  const out = [];
  const spots = (last.spots || []).map((s) => {
    const bs = (s.beats || []).map((b) => `${b.t}${b.ok ? "" : "（你閃開了）"}`);
    return `${SPOTS[s.key]?.zh || s.key}（${[s.item, ...bs].join("、")}）`;
  }).join(" → ");
  out.push(`你${now - last.endAt < 3 * 3600e3 ? "剛剛" : "前不久"}去當日租女友，客人是${last.clientName}（${PERSONAS[last.persona]?.zh || ""}）。客人不知道他是你老公，以為他只是經紀人。行程：${spots}。`);
  if (last.hotel) {
    const where = last.hotel.stay === "stay" ? "住了一晚" : "休息";
    out.push(`之後跟客人去旅館${where}。實際上：${hotelText(last.hotel)}。`);
    if (last.presence === "in") out.push("他（你老公）全程在房間裡看著，他都知道，不用說謊；談的是你的感受。");
    else if (last.presence === "door") out.push(`他開車送你們去、在門外等，聽得到聲音但看不到。${tellRule(last)}`);
    else out.push(`他沒有跟去，只從客人的 LINE 知道你們去休息。${tellRule(last)}`);
    if (last.bragged) out.push(`客人在 LINE 跟他炫耀過：「${last.bragged}」。他可能拿這個問你。`);
  } else out.push("約會結束就回來了，沒有去別的地方。");
  out.push("不要主動講露骨細節；可以自己透露一點，他問了再看情況說。");
  return out;
}
function tellRule(last) {
  if (last.honesty === "honest") return "他問起就照實說，可以帶情緒。";
  if (last.honesty === "downplay") return `他問起就講得比實際輕：說「${toldVersion(last.hotel, "downplay")}」；被追問細節會心虛，可能露餡。`;
  return `他問起就說「${toldVersion(last.hotel, "lie")}」；他拿出證據逼問才慢慢承認。`;
}

/** 給伺服器 /api/rental/line 的資料（真相＋最近的訊息）。side：client／wife；kind：spot／reply；ctx：{ i, level, text, phase }。 */
export function aiPayload(who, date, side, kind, ctx = {}) {
  const s = Number.isInteger(ctx.i) ? date.spots[ctx.i] : null;
  const recent = (date.chat?.[side] || []).slice(-6).map((m) => `${m.from === "me" ? (side === "client" ? "經紀人" : "老公") : side === "client" ? "客人" : "她"}：${m.text}`);
  return {
    side, kind, phase: ctx.phase || "date", text: String(ctx.text || "").slice(0, 120), honesty: ctx.level || date.honesty || "honest",
    girl: { name: who?.name || "", stage: stageKeyOf(who), family: familyOf(who), archetype: who?.archetype || "" },
    client: { name: date.client.name, age: date.client.age, persona: PERSONAS[date.client.persona]?.zh || "", regular: !!date.client.regular },
    plan: date.spots.map((x) => SPOTS[x.key].zh),
    spot: s ? { place: SPOTS[s.key].zh, item: s.item, gift: !!s.gift, drunk: !!s.drunk,
      beats: (s.beats || []).map((b) => ({ t: b.t, ok: !!b.ok, lv: b.lv })) } : null,
    hotel: date.hotel?.result ? `${date.hotel.stay === "stay" ? "住宿一晚" : "休息"}；${hotelText(date.hotel.result)}` : "",
    recent,
  };
}
