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
 * 約會場景制（2026-10-14，使用者定）：每個地點 4 個場景、每個場景 6 個動作；一站走 3 個場景、每個場景試 2 個動作（由低到高，她閃開就停）。
 * lv：0 聊天（照樣發生、不在 LINE 報告）／1 牽手類／2 摟腰餵食／3 曖昧（偷看、摸腿、貼身）／4 抱、親臉、親脖子／5 接吻／6 摸胸、她摸他下面（上限）。
 * 動作只寫一句第三人稱（他＝客人、她＝妻子），客人說法（c）、她的說法（w）、真相（t）由程式轉出來。
 * 居酒屋「門口」、夜景「停車場」有「提議去休息」：成功就直接去旅館、剩下的行程取消（確）。
 */
const INVITE = "INVITE";
const SC = (zh, ...acts) => ({ zh, acts: acts.map((a) => (a === INVITE ? { invite: true, lv: 9, p: "提議去休息" } : { lv: a[0], p: a[1] })) });
export const SCENES = {
  cafe: [
    SC("點餐櫃台", [0, "跟她聊天"], [1, "幫她決定點什麼"], [1, "排隊時牽她的手"], [2, "從後面摟著她的腰看菜單"], [3, "貼在她背後"], [3, "偷看她的領口"]),
    SC("座位", [0, "跟她聊天"], [1, "跟她用兩根吸管喝同一杯"], [2, "餵她吃蛋糕"], [3, "在桌下用腳碰她的腳"], [3, "在桌下摸她的大腿"], [4, "坐到她旁邊親她的臉"]),
    SC("窗邊沙發", [0, "並肩坐著跟她聊天"], [1, "牽她的手"], [2, "讓她靠在肩上"], [2, "摟她的腰"], [3, "把手放在她大腿內側"], [5, "跟她接吻"]),
    SC("廁所走廊", [1, "在走廊等她出來"], [3, "擋住她的去路"], [4, "把她抱進懷裡"], [5, "跟她接吻"], [6, "摸她的胸"], [6, "拉她的手摸他下面"]),
  ],
  aquarium: [
    SC("入口售票處", [0, "跟她聊天"], [1, "幫她買票"], [1, "牽她的手進場"], [1, "跟她拍入場照"], [2, "摟她的腰"], [3, "偷看她的胸口"]),
    SC("大魚缸前", [0, "跟她聊魚"], [1, "跟她靠著玻璃拍照"], [2, "從後面摟她的腰"], [3, "跟她臉貼臉自拍"], [4, "親她的臉"], [5, "跟她接吻"]),
    SC("暗道", [1, "在暗處牽她的手"], [4, "從後面抱住她"], [4, "親她的脖子"], [5, "跟她接吻"], [6, "隔著衣服摸她的胸"], [6, "她隔著褲子摸他下面"]),
    SC("廁所附近", [1, "在廁所外等她"], [1, "牽她的手"], [4, "把她壓在牆邊抱住"], [5, "跟她接吻"], [6, "摸她的胸"], [6, "她隔著褲子摸他下面"]),
  ],
  amusement: [
    SC("雲霄飛車", [0, "排隊時跟她聊天"], [1, "排隊時牽她的手"], [2, "她嚇得抓緊他"], [2, "摟她的腰"], [4, "下來後抱住她安慰"], [4, "親她的臉"]),
    SC("鬼屋", [1, "牽她的手"], [2, "她躲進他懷裡"], [3, "趁黑摸她的大腿"], [4, "從後面抱緊她"], [5, "跟她接吻"], [6, "摸她的胸"]),
    SC("旋轉木馬", [0, "跟她聊天"], [2, "從後面摟她的腰"], [3, "跟她同騎一匹馬"], [3, "緊貼在她背後"], [3, "偷看她的裙底"], [4, "親她的臉"]),
    SC("摩天輪", [1, "跟她並肩坐"], [1, "牽她的手"], [4, "抱住她"], [5, "在頂端跟她接吻"], [6, "摸她的胸"], [6, "她隔著褲子摸他下面"]),
  ],
  shopping: [
    SC("服飾店", [0, "跟她聊天"], [1, "她挽著他的手被當成情侶"], [1, "幫她挑衣服"], [2, "摟她的腰"], [3, "偷看她試穿"], [4, "親她的臉"]),
    SC("試衣間", [1, "在試衣間外等她"], [3, "幫她拉背後的拉鍊"], [3, "偷看她換衣服"], [4, "擠進試衣間抱住她"], [5, "在試衣間跟她接吻"], [6, "在試衣間摸她的胸"]),
    SC("飾品店", [0, "跟她聊天"], [1, "送她一條項鍊"], [2, "親手幫她戴項鍊"], [2, "從後面摟著她照鏡子"], [4, "親她的臉"], [4, "親她的脖子"]),
    SC("樓梯間", [1, "牽她的手"], [3, "站在她後面貼著她"], [3, "偷看她的裙底"], [4, "在樓梯間抱住她"], [5, "在樓梯間跟她接吻"], [6, "在樓梯間摸她的胸"]),
  ],
  cinema: [
    SC("販賣部", [0, "跟她聊要看什麼"], [1, "幫她買爆米花"], [1, "排隊時牽她的手"], [1, "跟她拍電影海報照"], [2, "摟她的腰"], [3, "偷看她的胸口"]),
    SC("座位（開演前）", [0, "跟她聊天"], [1, "跟她共用爆米花碰到手"], [2, "餵她吃爆米花"], [2, "讓她靠在肩上"], [3, "把手放在她大腿上"], [4, "親她的臉"]),
    SC("座位（黑暗中）", [1, "牽她的手"], [2, "看到可怕的地方她抱住他"], [3, "摸她的大腿內側"], [5, "跟她接吻"], [6, "隔著衣服揉她的胸"], [6, "拉她的手摸他下面"]),
    SC("散場走廊", [0, "跟她聊電影"], [1, "牽她的手"], [2, "摟她的腰"], [4, "在角落抱住她"], [5, "跟她接吻"], [6, "摸她的胸"]),
  ],
  dinner: [
    SC("入座", [0, "跟她聊天"], [1, "幫她拉椅子"], [1, "幫她點菜"], [2, "摟著她的腰帶位"], [3, "坐到她旁邊"], [3, "偷看她的胸口"]),
    SC("用餐", [0, "跟她聊天"], [2, "跟她互相餵食"], [2, "幫她擦嘴角"], [3, "跟她喝交杯酒"], [3, "在桌下摸她的腿"], [4, "親她的臉"]),
    SC("甜點時間", [1, "牽她的手"], [2, "餵她吃甜點"], [2, "親她的手背"], [3, "把手放在她大腿內側"], [5, "跟她接吻"], [6, "在桌下拉她的手摸他下面"]),
    SC("廁所／出口", [1, "在廁所外等她"], [1, "牽她的手"], [4, "把她壓在牆邊抱住"], [5, "跟她接吻"], [6, "摸她的胸"], [6, "她隔著褲子摸他下面"]),
  ],
  karaoke: [
    SC("櫃台", [0, "跟她聊天"], [1, "跟她選包廂"], [1, "牽她的手"], [2, "摟著她的腰走進去"], [3, "偷看她的胸口"], [4, "在電梯裡抱住她"]),
    SC("包廂沙發", [0, "跟她點歌"], [2, "摟她的腰"], [2, "餵她吃零食"], [2, "讓她靠在肩上"], [3, "貼著她坐"], [3, "摸她的大腿"]),
    SC("唱歌時", [1, "跟她情侶對唱"], [4, "從後面抱住她一起唱"], [4, "唱到一半親她的臉"], [5, "跟她擁吻"], [6, "摸她的胸"], [6, "她隔著褲子摸他下面"]),
    SC("廁所／走廊", [1, "在走廊等她"], [1, "牽她的手"], [4, "抱住她"], [5, "跟她接吻"], [6, "摸她的胸"], [6, "她隔著褲子摸他下面"]),
  ],
  izakaya: [
    SC("吧台", [0, "跟她聊天"], [1, "跟她乾杯"], [1, "一直勸她喝"], [2, "摟她的腰"], [3, "坐得離她很近"], [3, "把手放在她大腿上"]),
    SC("榻榻米包廂", [1, "跟她並肩坐"], [2, "她喝醉了靠在他身上"], [3, "跟她喝交杯"], [3, "摸她的大腿"], [5, "跟她接吻"], [6, "摸她的胸"]),
    SC("角落座位", [0, "跟她聊天"], [1, "牽她的手"], [2, "餵她吃串燒"], [4, "親她的臉"], [5, "跟她擁吻"], [6, "她隔著褲子摸他下面"]),
    SC("門口", [2, "扶著她走"], [2, "摟她的腰"], [4, "抱住她"], [4, "親她的脖子"], [5, "跟她接吻"], [6, "摸她的胸"], INVITE),
  ],
  nightview: [
    SC("展望台入口", [0, "跟她聊天"], [1, "牽她的手"], [1, "幫她買飲料"], [2, "摟她的腰"], [3, "偷看她的胸口"], [4, "親她的臉"]),
    SC("欄杆邊", [0, "跟她看夜景聊天"], [1, "牽她的手"], [4, "從後面抱住她"], [4, "親她的脖子"], [5, "跟她接吻"], [6, "抱著她摸她的胸"]),
    SC("長椅", [1, "跟她並肩坐"], [2, "讓她靠在肩上"], [3, "把手放在她大腿上"], [5, "跟她擁吻"], [6, "摸她的胸"], [6, "她隔著褲子摸他下面"]),
    SC("停車場", [1, "牽她的手"], [2, "摟她的腰"], [4, "靠著車抱住她"], [4, "親她的脖子"], [5, "跟她接吻"], [6, "摸她的胸"], INVITE),
  ],
};
/** 一句第三人稱 → 客人說法（我…）、她的說法（他…我…）、真相（他…她…）。 */
export function voices(p) {
  const s = String(p), herFirst = s.startsWith("她");
  return {
    c: s.replace(/他/g, "我"),
    w: herFirst ? s.replace(/她/g, "我") : `他${s.replace(/她/g, "我")}`,
    t: herFirst ? s : `他${s}`,
  };
}
/** 舊名字留著（測試、存檔）：每個地點所有非聊天的動作。 */
export const BEATS = Object.fromEntries(Object.entries(SCENES).map(([k, list]) => [k, list.flatMap((sc) => sc.acts.filter((a) => a.lv >= 1 && a.lv <= 6).map((a) => ({ lv: a.lv, ...voices(a.p) })))]));
/** 客人敢試到幾級：升溫越高越敢；強勢／炫耀快、紳士慢；她喝醉 +1。 */
export const PUSH = { gentleman: -1, clingy: 0, showoff: 1, dominant: 1, otaku: 0 };
export function beatCap(heat, persona, drunk = false) { return clamp(2 + Math.floor(heat / 20) + (PUSH[persona] || 0) + (drunk ? 1 : 0), 1, 6); }
/** 她接受的機率：級數越高越難；A（她）、B（客人手腕）、升溫、喝醉加成。聊天一定接受。 */
export function acceptChance(lv, { her = 0, client = null, heat = 0, drunk = false, boost = 0 } = {}) {
  if (lv <= 0) return 1;
  return clamp(0.85 - 0.12 * (lv - 1) + her + clientFactor(client) + Math.min(0.2, heat / 500) + (drunk ? 0.15 : 0) + boost, 0.05, 0.95);
}
/** 一站要走的 3 個場景（照順序；有「提議去休息」的出口場景一定走）。 */
export function pickScenes(key, r0) {
  const r = rnd(r0), list = SCENES[key] || [];
  if (list.length <= 3) return list.map((_, i) => i);
  const must = list.map((sc, i) => (sc.acts.some((a) => a.invite) ? i : -1)).filter((i) => i >= 0);
  const free = list.map((_, i) => i).filter((i) => !must.includes(i));
  while (free.length + must.length > 3) free.splice(Math.floor(r() * free.length), 1);
  return [...free, ...must].sort((a, b) => a - b);
}
/** 一個場景：試 2 個動作（先挑一個較輕的，再挑這個場景敢試的最大膽的；她閃開就停）。回 { beats, heat, wall }。 */
export function rollScene(key, si, { her = 0, client = null, heat = 0, drunk = false, wall = 7, boost = 0 } = {}, r0) {
  const r = rnd(r0), sc = SCENES[key][si], out = [];
  let h = heat, w = wall;
  const pool = sc.acts.filter((a) => !a.invite);
  const cap = Math.min(beatCap(h, client?.persona, drunk), w - 1);
  let can = pool.filter((a) => a.lv <= cap);
  if (!can.length) { const m = Math.min(...pool.map((a) => a.lv)); can = pool.filter((a) => a.lv === m); }
  const sorted = can.slice().sort((a, b) => a.lv - b.lv);
  const first = sorted[Math.floor(r() * Math.max(1, sorted.length - 1))];
  const rest = sorted.filter((a) => a !== first);
  const hiLv = rest.length ? Math.max(...rest.map((a) => a.lv)) : -1;
  const tops = rest.filter((a) => a.lv === hiLv);
  const tries = [first, tops.length ? tops[Math.floor(r() * tops.length)] : null].filter(Boolean).sort((a, b) => a.lv - b.lv);
  for (const a of tries) {
    const ok = r() < acceptChance(a.lv, { her, client, heat: h, drunk, boost });
    h += a.lv <= 0 ? 1 : ok ? a.lv * 2 + 1 : 1;   // 一天 9 個場景：升溫比舊的一站 2～3 件慢（×3＋2 → ×2＋1）
    if (a.lv >= 1) out.push({ scene: sc.zh, lv: a.lv, ...voices(a.p), ok });
    if (!ok) { if (a.lv >= 4) w = Math.min(w, a.lv); break; }   // 她閃開：這個場景就不再試；4 級以上被拒，這天不再試這級以上
  }
  return { beats: out, heat: h, wall: w };
}
/**
 * 一站的互動（測試／模擬用，一次擲完）：3 個場景、每個場景試 2 個動作。
 * 回 { scenes:[{zh, invite}], beats:[{scene, lv, c, w, t, ok}]（不含聊天）, heat, inviteScene, wall }。
 */
export function rollScenes(key, { her = 0, client = null, heat = 0, drunk = false, wall = 7 } = {}, r0) {
  const r = rnd(r0), out = [], scenes = [];
  let h = heat, w = wall, inviteScene = false;
  for (const si of pickScenes(key, r)) {
    const sc = SCENES[key][si];
    scenes.push({ zh: sc.zh, invite: sc.acts.some((a) => a.invite) });
    if (sc.acts.some((a) => a.invite)) inviteScene = true;
    const x = rollScene(key, si, { her, client, heat: h, drunk, wall: w }, r);
    out.push(...x.beats); h = x.heat; w = x.wall;
  }
  return { scenes, beats: out, heat: h, inviteScene, wall: w };
}
/** 舊介面（測試用）：一站的互動。 */
export function rollBeats(key, opts = {}, r0) { const x = rollScenes(key, opts, r0); return { beats: x.beats, heat: x.heat }; }

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
  const date = planDate(ctx, r0);
  advance(date, Infinity, r0);   // 測試／模擬：一次擲完。真正約會用 planDate＋每秒 advance（LINE 鼓勵才影響得到後面）
  return date;
}
/**
 * 約會骨架（2026-10-15）：行程、每站要走的 3 個場景、她點什麼、要不要延長先排好；
 * 場景裡的互動、去休息的邀請「到了才擲」（advance），擲的時候把玩家在 LINE 的鼓勵／勸阻算進去。擲完就存起來，大家讀同一份。
 */
export function planDate(ctx = {}, r0) {
  const r = rnd(r0), who = ctx.who || {}, client = ctx.client || {};
  const family = familyOf(who), loyalty = who?.stats?.loyalty ?? 60;
  const her = herFactor({ loyalty, hunger: ctx.hunger || 0, kinks: who.kinks || [], family, mood: ctx.mood || null });
  const per = PERSONAS[client.persona] || PERSONAS.gentleman;
  const plan = planSpots(who, client, r);
  const spots = plan.map((s, i) => {
    const sp = SPOTS[s.key];
    return { key: s.key, by: s.by, h: sp.h, item: pick(sp.items, r), drunk: s.key === "izakaya" && r() < 0.5,
      scenes: pickScenes(s.key, r).map((si) => ({ si, zh: SCENES[s.key][si].zh, invite: SCENES[s.key][si].acts.some((a) => a.invite), done: false })),
      beats: [], act: "", actW: "", gift: false, extAsk: i < plan.length - 1 && r() < per.ext };
  });
  const total = spots.reduce((t, x) => t + x.h, 0);
  return { v: 4, client: { ...client }, spots, heat: 0, wall: 7, her, family,
    influence: { wife: 0, client: 0 }, cheered: false,
    invite: { p: 0, yes: false, i: null, mid: false, resolved: false, stay: "rest", style: client.persona === "gentleman" ? "ask" : client.persona === "otaku" ? "assume" : "normal" },
    startedAt: Number(ctx.now) || Date.now(), startHour: clamp(21 - total, 10, 15),
    ext: 0, extRefused: 0, pausedMs: 0, pauseAt: 0, phase: "date", hotel: null };
}
/** 玩家在 LINE 的影響（一點點）：鼓勵她 每次 +0.04 接受度（最多 ±0.12）；鼓勵客人 每次 +0.03（最多 ±0.09）。 */
export function influenceOf(date) {
  const inf = date?.influence || {};
  return { her: clamp(0.04 * (Number(inf.wife) || 0), -0.12, 0.12), boost: clamp(0.03 * (Number(inf.client) || 0), -0.09, 0.09) };
}
/**
 * 往前推到遊戲時間 e（小時）：到了的站加曖昧、到了的場景擲互動、到了出口場景或最後一站結束擲邀請。
 * 回 true＝有新東西（要存檔）。
 */
export function advance(date, e = Infinity, r0) {
  const r = rnd(r0);
  if (!date || date.v < 4) return false;
  let changed = false;
  for (let guard = 0; guard < 40; guard++) {
    let moved = false;
    for (const seg of schedule(date).segs) {
      if (seg.kind !== "spot") continue;
      const sp = date.spots[seg.i], len = seg.to - seg.from;
      if (!sp.started && e >= seg.from) { sp.started = true; date.heat += SPOTS[sp.key].heat; moved = true; }
      if (!sp.started) continue;
      sp.scenes.forEach((sc, k) => {
        if (sc.done || e < seg.from + (k / sp.scenes.length) * len) return;
        const inf = influenceOf(date);
        const x = rollScene(sp.key, sc.si, { her: date.her + inf.her, client: date.client, heat: date.heat, drunk: sp.drunk, wall: date.wall, boost: inf.boost }, r);
        sc.done = true; sp.beats.push(...x.beats); date.heat = x.heat; date.wall = x.wall;
        const top = sp.beats.filter((b) => b.ok).at(-1) || null;
        sp.act = top?.c || ""; sp.actW = top?.w || "";
        sp.gift = sp.key === "shopping" && sp.beats.some((b) => b.ok && /項鍊/.test(b.t));
        moved = true;
      });
      // 邀請：走到出口場景那一站結束前，或最後一站結束前（還沒擲過才擲）
      const lastLive = schedule(date).segs.filter((g) => g.kind === "spot").at(-1);
      const exit = sp.scenes.some((x) => x.invite) && sp.scenes.every((x) => x.done);
      if (!date.invite.resolved && sp.scenes.every((x) => x.done) && (exit || seg.i === lastLive?.i) && e >= seg.to - 0.05) {
        const inf = influenceOf(date);
        const p = inviteChance({ heat: date.heat, her: date.her + inf.her, client: date.client });
        const yes = !!date.forceInvite || r() < Math.min(0.9, p + inf.boost);   // forceInvite：test_room 除錯「邀請成功」
        Object.assign(date.invite, { p, yes, i: seg.i, resolved: true, stay: yes && r() < (date.client.regular ? 0.5 : 0.3) ? "stay" : "rest" });
        if (yes) {
          sp.extAsk = false;
          date.spots.forEach((x, k) => { if (k > seg.i) x.cancelled = true; });
          date.invite.mid = date.spots.some((x) => x.cancelled);
        }
        moved = true;
        break;
      }
    }
    if (!moved) break;
    changed = true;
  }
  return changed;
}
/** 玩家在 LINE 說的話：鼓勵（+1）／勸阻（−1）／普通（0）。鼓勵客人第一次評價 +0.5（他覺得經紀人很上道）。 */
export function applyIntent(date, side, intent) {
  const d = intent === "encourage" ? 1 : intent === "restrain" ? -1 : 0;
  if (!date || !d) return false;
  date.influence = date.influence || { wife: 0, client: 0 };
  const k = side === "wife" ? "wife" : "client";
  date.influence[k] = clamp((Number(date.influence[k]) || 0) + d, -3, 3);
  if (k === "client") date.heat = Math.max(0, (Number(date.heat) || 0) + 3 * d);
  if (k === "client" && d > 0) date.cheered = true;
  return true;
}
/** 沒有 AI 時的判斷：鼓勵／勸阻／普通（「不要怕」「別害羞」算鼓勵）。 */
const ENCOURAGE_RE = /不要怕|別怕|不用怕|別害羞|不要害羞|放開|放輕鬆|大膽|沒關係|盡量|主動|加油|放心|享受|多.{0,3}一點|可以的|去吧|衝|上啊|隨便他|讓他/;
const RESTRAIN_RE = /不要|別|不准|不可以|小心|保守|拒絕|太過|注意|收斂|規矩|夠了|停/;
export function intentByWords(text) {
  const t = String(text || "");
  if (ENCOURAGE_RE.test(t)) return "encourage";
  if (RESTRAIN_RE.test(t)) return "restrain";
  return "none";
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
  if (date?.cheered) s += 0.5;   // 經紀人在 LINE 鼓勵過他：覺得很上道
  if (date?.hotel?.result) s += 1;
  s -= 0.5 * (Number(date?.extRefused) || 0);
  return clamp(Math.round(s), 1, 5);
}
/**
 * 女友感（2026-10-15，0～5）：她接受的「像女友」的互動（牽手、摟腰、餵食 1 分；曖昧、抱、親臉 1.5 分；接吻 2 分；摸胸那級只算 0.5）、
 * 熱絡個性 +2、每答應延長一次 +1；每 5 分算 1 顆。每顆 +1 金，算在 2～10 之外，熟客一樣 ×2。
 */
export const GFE_PTS = { 1: 1, 2: 1, 3: 1.5, 4: 1.5, 5: 2, 6: 0.5 };
export function gfeScore(who, date) {
  let pts = 0;
  for (const sp of date?.spots || []) for (const b of sp.beats || []) if (b.ok) pts += GFE_PTS[b.lv] || 0;
  if (familyOf(who) === "熱絡") pts += 2;
  pts += Number(date?.ext) || 0;
  return clamp(Math.round(pts / 5), 0, 5);
}
/** 結算：收入（基本＋延長＋小費＋司機，夾 2～10）＋女友感，熟客 ×2 − 房錢。r 決定會不會變熟客。 */
export function settle(who, date, mood = null, r0) {
  const r = rnd(r0), st = stars(who, date, mood);
  const base = (date?.spots || []).filter((x) => !x.cancelled).reduce((s, x) => s + SPOTS[x.key].pay, 0);
  const ext = (Number(date?.ext) || 0) * EXT_PAY;
  const tip = (st >= 5 ? 2 : st >= 4 ? 1 : 0) + (st >= 4 ? PERSONAS[date?.client?.persona]?.tip || 0 : 0);
  const driver = date?.hotel?.drive ? DRIVER_TIP : 0;
  const gfe = gfeScore(who, date);
  const raw = clamp(base + ext + tip + driver, INCOME_MIN, INCOME_MAX) + gfe;
  const income = date?.client?.regular ? raw * 2 : raw;
  const roomFee = date?.hotel?.paidRoom ? ROOM_FEE[date.hotel.stay] || 0 : 0;
  const regular = !date?.client?.regular && (st >= 5 ? r() < 0.7 : st >= 4 ? r() < 0.4 : false);
  return { stars: st, base, ext, tip, driver, gfe, income, roomFee, net: income - roomFee, becomeRegular: regular || !!date?.client?.regular };
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
    if (s.cancelled) return;   // 提議去休息成功、取消的行程
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
  let gripes = 0;   // 客人抱怨一場最多 3 則（被拒還是照樣扣評價）
  for (const s of spots) {
    const len = s.to - s.from, sp = date.spots[s.i];
    // 互動一件一件發生；她閃開的那件，客人馬上傳訊息抱怨（句庫）。整站的報告（AI）在快離開時傳。
    const bs = sp.beats || [];
    bs.forEach((b, j) => { if (!b.ok && gripes < 3) { gripes++; out.push({ id: `cr:${s.i}:${j}`, kind: "cr", i: s.i, j, at: s.from + ((j + 1) / (bs.length + 1)) * 0.85 * len }); } });
    out.push({ id: `ws:${s.i}`, kind: "ws", i: s.i, at: s.from + 0.55 * len });
    out.push({ id: `cs:${s.i}`, kind: "cs", i: s.i, at: s.from + 0.8 * len });
    if (sp.extAsk) out.push({ id: `ext:${s.i}`, kind: "ext", i: s.i, at: s.from + sp.h - 0.2, decide: true });
    // 中途提議被拒（居酒屋門口／夜景停車場）：客人抱怨一句，約會照走
    if (!date.invite?.yes && Number.isInteger(date.invite?.i) && date.invite.i === s.i && s.i < spots.at(-1)?.i) out.push({ id: `ino:${s.i}`, kind: "ino", i: s.i, at: s.to - 0.04 });
  }
  const T = spots.length ? spots[spots.length - 1].to : 0;
  if (date.invite && date.invite.resolved === false) return out;   // 邀請還沒擲（到了才擲）
  if (!date.invite?.yes) { out.push({ id: "bye", kind: "bye", at: T }, { id: "end", kind: "end", at: T + 0.01 }); return out; }
  const iv = spots.find((s) => s.i === date.invite.i) || spots[spots.length - 1];
  out.push({ id: "invite", kind: "invite", at: iv ? iv.to : T, decide: true });
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
  const spots = (last.spots || []).filter((s) => !s.cancelled).map((s) => {
    const bs = (s.beats || []).map((b) => `${b.scene ? b.scene + "：" : ""}${b.t}${b.ok ? "" : "（你閃開了）"}`);
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
    plan: date.spots.filter((x) => !x.cancelled).map((x) => SPOTS[x.key].zh),
    spot: s ? { place: SPOTS[s.key].zh, item: s.item, gift: !!s.gift, drunk: !!s.drunk,
      beats: (s.beats || []).map((b) => ({ t: `${b.scene ? b.scene + "：" : ""}${b.t}`, ok: !!b.ok, lv: b.lv })) } : null,
    hotel: date.hotel?.result ? `${date.hotel.stay === "stay" ? "住宿一晚" : "休息"}；${hotelText(date.hotel.result)}` : "",
    recent,
  };
}

// ------------------------------------------------------------ 旅館玄關（2026-10-15）
/** 開車送到旅館後，玩家直接站在玄關，自己決定進不進去。三種玄關：日式拉門（溫泉旅館）、旅館房門、汽車旅館（車庫＋樓梯）。 */
export const VENUES = {
  ryokan: { zh: "溫泉旅館", enter: "拉開拉門進去", wait: "在拉門外等" },
  hotel: { zh: "旅館", enter: "刷卡推門進去", wait: "在門外等" },
  motel: { zh: "汽車旅館", enter: "走上樓梯進去", wait: "在樓下車庫等" },
};
/** 權重：休息多是旅館／汽車旅館，住宿一晚溫泉旅館比較多。 */
const VENUE_W = { rest: { hotel: 45, motel: 45, ryokan: 10 }, stay: { ryokan: 40, hotel: 35, motel: 25 } };
/** 這次約會去哪一種（同一場約會固定；照開始時間＋客人決定，不另存）。回傳 { key, room }（room＝房號）。 */
export function venueOf(date) {
  const h = fnv(`${date?.startedAt || 0}|${date?.client?.id || date?.client?.name || ""}|venue`);
  const w = VENUE_W[date?.hotel?.stay || date?.invite?.stay] || VENUE_W.rest, tot = Object.values(w).reduce((a, b) => a + b, 0);
  let x = h % tot, key = "hotel";
  for (const [k, v] of Object.entries(w)) { if (x < v) { key = k; break; } x -= v; }
  const room = key === "ryokan" ? ["松", "竹", "梅", "桜", "楓"][(h >>> 8) % 5] + "の間" : String(201 + ((h >>> 8) % 4) * 100 + ((h >>> 12) % 9));
  return { key, room };
}
