/* 換妻・酒吧（2026-10-22 v2 重做）
 * 版面：對話框在畫面最上面；立繪底邊貼齊螢幕底；最下面一排名字列（狀態＋酒杯＝醉度）。
 * 上台：只有自我介紹／正在跟玩家說話／玩家點名字的人才出現（從左邊滑進來）；點的人正在跟別的 NPC 互動 → 兩個一起上、顯示那段互動。
 * CD：每個 NPC 各自一條，每輪隨機 3–8 秒；有人在跟你說話或你在打字 → 半速。滿了就做一次互動（對象：你或另一個 NPC；
 *     沉默／聊天／碰觸／調情），機率隨場景進度＋醉度上升，色的程度依場景上限（酒吧只到輕碰）。NPC↔NPC 只寫在名字列，點名字看。
 *     NPC 碰你／調情你 → 停下來讓你選 迎合／推開／裝沒事。
 * 卡牌：手牌 3 張（canvas 像素畫），用掉補一張；大膽度 ≥4 要進度夠。成功與否＝擲（對象數值＋醉度＋你的姿態）。
 * 醉度：每個人（含你）0–100；喝酒 +10–20（烈酒更多），看體型／個性的酒量；每分鐘慢慢退。
 * 數字都在下面的表裡。 */
import { actLine, SESSION_KEY } from "./swap_select.js?v=11";
import { createStage } from "./swap_stage.js?v=5";
import { pickBackdrop } from "./swap_cafe_gen.js?v=11";

// ============================================================ 調整用的表
export const CD = { min: 10, max: 25, slow: 0.5, fastAt: [[85, 0.6], [60, 0.75]] };   // 秒（2026-10-22 改 10–25）；半速；醉了 CD 變短（×），但不會短於 min
export const SCENE_CAP = { bar: 1, ktv: 2, hotel: 3 };   // 碰觸／調情的最高等級
export const ACTS = {
  touch: [{ zh: "碰手", lv: 1 }, { zh: "搭肩", lv: 1 }, { zh: "摟腰", lv: 1 }, { zh: "摸大腿", lv: 1 }, { zh: "揉胸", lv: 2 }, { zh: "手伸進裙底", lv: 3 }],
  lewd: [{ zh: "在耳邊說黃色笑話", lv: 1 }, { zh: "朝耳朵吹氣", lv: 1 }, { zh: "隔著衣服摸胸", lv: 2 }, { zh: "手伸進衣服裡", lv: 3 }],
};
/** 互動種類權重＝base＋進度×p＋醉度×d（不會小於 0）。 */
export const TYPE_W = { silence: { base: 3, p: -0.02, d: -0.01 }, chat: { base: 5, p: 0, d: 0 }, touch: { base: 0.5, p: 0.05, d: 0.03 }, lewd: { base: 0, p: 0.025, d: 0.025 } };
export const TARGET = { player: 0.45, seatBoost: 2 };   // 對象是你的機率；坐在一起的那對 NPC 權重 ×2
export const DRUNK = {
  normal: [10, 20], strong: [25, 35], decayPerMin: 2,
  lv: { tipsy: 30, drunk: 60, wasted: 85 },
  tolBuild: { fat: 0.8, muscular: 0.85, tall: 0.9, average: 1, short: 1.1, slim: 1.2, old: 1.15 },   // ×喝下去的量（越小越能喝）
  tolPersona: { 老手型: 0.85, 炫耀型: 0.95, 紳士型: 1, 老手: 0.85, 害羞人妻: 1.15, 不太情願: 1.05, player: 1, wife: 1.1 },
  accept: { tipsy: 0.1, drunk: 0.3, wasted: 0.4 },        // 答應機率加成
  pushCut: { tipsy: 0.5, drunk: 0.25, wasted: 0.1 },      // NPC 推開別人的機率 ×
  wastedSleep: 0.3, wastedVomit: 0.15, vomitSec: 20,      // 爛醉每輪：睡著／去吐
  playerPushFail: 0.4,                                    // 你喝醉（≥60）時 推開 失敗的機率
  reckless: 0.3,                                          // 你喝醉（≥60）時 抽到的卡變成魯莽版的機率
  playerPassOutPerMin: 0.25,                              // 你爛醉時每分鐘倒下（今晚結束）
};
export const REACT = { 迎合: { progress: 4, actor: 2, wife: -1 }, 推開: { progress: -2, actor: -3, wife: 1 }, 裝沒事: { progress: 1, actor: 0, wife: 0 } };
export const CHAT = { affChat: 1, affNice: 2, affRude: -2, progChat: 1, secondP: 0.35, progMax: 100 };
export const NPC_PROG = { silence: 0, chat: 0.5, touch: 2, lewd: 3 };   // NPC↔NPC 互動成立時的進度
export const WIFE_ACCEPT = { base: 0.3, open: 1, nerves: -0.4, seat: 0.15 };   // 老婆被對方丈夫碰時不推開的機率
export const ACCEPT = { bold: [0, 0.95, 0.8, 0.6, 0.4, 0.25], perAff: 0.02, perProg: 0.004, playerDrunk: 0.1, wifeNerves: -0.3, wifeOpen: 0.5, min: 0.05, max: 0.97 };
export const BOLD_GATE = { 4: 35, 5: 60 };   // 大膽度 → 需要的進度
export const CARD_FX = { okProg: 2, okAff: 1, noAff: -1, noProg: -1 };   // 成功：進度＋大膽度×okProg
/** 酒吧牌組。who：other／husband／wife／all。fx：drink（誰喝、strong）、aff、nerves、open、seat、cross、random。 */
export const DECK_BAR = [
  { id: "o_toast", who: "other", zh: "敬她一杯", bold: 1, icon: "cup", fx: { drink: ["player", "other"] } },
  { id: "o_praise", who: "other", zh: "稱讚她今天很漂亮", bold: 1, icon: "heart" },
  { id: "o_strong", who: "other", zh: "幫她點一杯烈酒", bold: 2, icon: "bottle", fx: { drink: ["other"], strong: true } },
  { id: "o_sit", who: "other", zh: "坐到她旁邊", bold: 2, icon: "seat", fx: { seat: "player-other" } },
  { id: "o_hand", who: "other", zh: "偷偷碰她的手", bold: 3, icon: "hand" },
  { id: "o_whisper", who: "other", zh: "說悄悄話", bold: 3, icon: "lips" },
  { id: "o_thigh", who: "other", zh: "手放在她大腿上", bold: 4, icon: "hand" },
  { id: "h_cheers", who: "husband", zh: "乾一杯", bold: 1, icon: "cup", fx: { drink: ["player", "husband"] } },
  { id: "h_work", who: "husband", zh: "聊工作", bold: 1, icon: "chat" },
  { id: "h_praise", who: "husband", zh: "稱讚他老婆", bold: 2, icon: "heart", fx: { aff: { husband: 2 } } },
  { id: "h_cross", who: "husband", zh: "提議男女交叉坐", bold: 3, icon: "seat", fx: { seat: "cross" } },
  { id: "w_hand", who: "wife", zh: "牽她的手安撫她", bold: 1, icon: "hand", fx: { nerves: -0.15 } },
  { id: "w_open", who: "wife", zh: "鼓勵她放開一點", bold: 2, icon: "star", fx: { open: 0.15 } },
  { id: "w_seat", who: "wife", zh: "讓她坐到對方丈夫旁邊", bold: 4, icon: "seat", fx: { seat: "wife-husband" } },
  { id: "a_round", who: "all", zh: "再點一輪酒", bold: 1, icon: "bottle", fx: { drink: ["player", "wife", "husband", "other"] } },
  { id: "a_truth", who: "all", zh: "玩真心話大冒險", bold: 3, icon: "star", fx: { random: true } },
  { id: "a_cross", who: "all", zh: "喝交杯酒", bold: 4, icon: "cup", fx: { drink: ["player", "wife", "husband", "other"], cross: true } },
];
const RECKLESS = { o_toast: "硬要她一口乾掉", o_praise: "說她身材比你老婆好", o_sit: "直接擠到她身邊", o_hand: "抓住她的手不放", h_cheers: "跟他拚酒", h_work: "吹噓自己的工作", w_hand: "當眾親老婆一口", a_round: "點一整瓶烈酒" };

// ============================================================ 句庫（AI 失敗時）
export const H_FLAVOR = { 紳士型: "彬彬有禮、體貼、說話客氣溫和，會照顧大家的感受", 老手型: "經驗豐富、從容自在、帶點曖昧的玩笑，很會帶氣氛", 炫耀型: "愛炫耀自己的工作、收入、老婆的身材，有點自來熟" };
export const W_FLAVOR = { 害羞人妻: "很害羞、話很少、一句短短的就好，不太敢看人", 老手: "很放得開、話多、會主動聊、眼神大膽", 不太情願: "其實不太想來，是被老公拉來的，回答勉強、有點冷淡" };
const H_FB = {
  紳士型: (h, w) => [`（起身微微點頭）兩位好，我是${h.name}，這是我太太${w.name}。今天謝謝你們願意來。`, `（舉手招來酒保）先來四杯招牌調酒吧，別緊張。對了，你們兩位是怎麼認識的？`],
  老手型: (h, w) => [`（靠在吧台上笑著舉杯）嗨～我是${h.name}，旁邊這位是我老婆${w.name}，今晚放輕鬆玩。`, `（招手叫酒保）來四杯調酒！對了，你們平常週末都做什麼？`],
  炫耀型: (h, w) => [`（整了整名錶，大聲笑）你們好！我${h.name}，開公司的。這是我老婆${w.name}，身材不錯吧？`, `（豪氣地拍桌）今天我請！來最貴的威士忌。話說你們住哪一區？`],
};
const W_FB = {
  害羞人妻: (w) => `（低著頭小聲）……我是${w.name}，請多指教。`,
  老手: (w) => `（撩了撩頭髮，笑著看你）我是${w.name}～老公說今天的對象很可愛，果然沒騙我呢。`,
  不太情願: (w) => `（別開視線，抱著手臂）……${w.name}。是他硬要來的。`,
};
const FB = {
  chat: { husband: ["（笑著舉杯）來，再喝一點嘛！", "（往前傾了傾身）你平常都玩什麼遊戲？"], other: ["（抿著嘴笑）你這個人真有趣。", "（玩著杯緣，偷偷看你）……你常來這種地方嗎？"], wife: ["（偷偷拉了拉你的衣角）……老公，你少喝一點。", "（小聲）我、我沒事啦。"] },
  touch: { husband: ["（大力拍了拍你的肩）兄弟，放輕鬆！"], other: ["（指尖輕輕碰了一下你的手背）……啊，不好意思。", "（膝蓋若有似無地靠過來）"], wife: ["（悄悄握住你的手）"] },
  lewd: { husband: ["（湊過來小聲）你老婆今天穿得真好看。"], other: ["（湊到你耳邊輕輕吹了口氣）……臉紅了？"], wife: ["（靠在你肩上，手指在你腿上畫圈）"] },
  accept: { husband: "（豪爽地笑）好啊！", other: "（臉紅了一下，沒有躲開）……嗯。", wife: "（點點頭）……好。" },
  refuse: { husband: "（擺擺手）這個就算了吧。", other: "（往後縮了縮）……不、不要啦。", wife: "（搖搖頭）……我不要。" },
};
const SILENCE = ["（一陣尷尬的沉默，只聽得到冰塊碰杯的聲音）", "（{a}偷偷瞄了{b}一眼，又趕緊移開視線）", "（{a}低頭玩著杯墊，沒說話）"];

// ============================================================ 小工具
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const rnd = (a, b) => a + Math.random() * (b - a);
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
export function drunkLv(x) { return x >= DRUNK.lv.wasted ? "wasted" : x >= DRUNK.lv.drunk ? "drunk" : x >= DRUNK.lv.tipsy ? "tipsy" : "sober"; }
export const DRUNK_ZH = { sober: "清醒", tipsy: "微醺，比較大膽", drunk: "喝醉了，黏人、說話放得開、很難拒絕", wasted: "爛醉，口齒不清、快睡著" };
/** 老婆緊張程度 0–1：忠誠／感情高＝越緊張，飢渴高＝放得開，心情不好再緊一點。 */
export function wifeNerves(who, hunger = 0, mood = null) {
  const loy = Number(who?.stats?.loyalty ?? 60), aff = Number(who?.stats?.affection ?? 60);
  let n = 0.35 + (loy - 60) / 120 + (aff - 60) / 240 - (Number(hunger) || 0) / 200;
  if (mood && ["angry", "hurt", "sad"].includes(mood.type)) n += 0.1;
  return clamp(n, 0, 1);
}
/** 大家 → 從字面猜對象；猜不到＝對方丈夫先回。「你老婆／你太太」前面不是「我」才算對方妻子（2026-10-22 修）。 */
export function inferTarget(text, names = {}) {
  const t = String(text || ""), has = (n) => n && t.includes(n);
  if (has(names.other) || /嫂子|大嫂|美女|夫人/.test(t) || /(^|[^我])(你老婆|你太太)/.test(t)) return "other";
  if (has(names.wife) || /老婆|寶貝|親愛的/.test(t)) return "wife";
  if (has(names.husband) || /大哥|老兄|先生|兄弟|老闆/.test(t)) return "husband";
  return "husband";
}
const NICE_RE = /漂亮|可愛|帥|美|謝謝|喜歡|厲害|好看|性感|迷人/, RUDE_RE = /醜|滾|閉嘴|討厭|煩|白痴|笨/;

// ============================================================ 像素卡牌
const ICONS = {   // 8×8
  cup: ["..####..", "..#..#..", "..#..#..", "..####..", "...##...", "...##...", "..####..", "........"],
  heart: [".##..##.", "########", "########", "########", ".######.", "..####..", "...##...", "........"],
  bottle: ["...##...", "...##...", "..####..", ".######.", ".######.", ".######.", ".######.", "........"],
  hand: ["..#.#.#.", "..#.#.#.", ".##.#.#.", ".######.", ".######.", ".#####..", "..####..", "........"],
  lips: ["........", ".##..##.", "########", "#......#", "########", ".######.", "........", "........"],
  chat: [".######.", "#......#", "#.#.#..#", "#......#", ".#####..", "..#.....", ".#......", "........"],
  seat: ["##......", "##......", "##......", "######..", "######..", "#....#..", "#....#..", "........"],
  star: ["...#....", "...#....", "#######.", ".#####..", "..###...", ".##.##..", ".#...#..", "........"],
};
const WHO_COL = { other: "#a77bd6", husband: "#6c8fd6", wife: "#e58fb5", all: "#d8b45a" };
const WHO_ZH = { other: "對方妻子", husband: "對方丈夫", wife: "老婆", all: "大家" };
/** 畫一張卡（邏輯 48×64 像素，×2 顯示）。 */
export function drawCard(cv, card) {
  const W = 48, H = 64, S = 2; cv.width = W * S; cv.height = H * S;
  const g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
  const R = (c, x, y, w, h) => { g.fillStyle = c; g.fillRect(x * S, y * S, w * S, h * S); };
  const col = WHO_COL[card.who] || "#999";
  R("#1a1420", 0, 0, W, H); R(col, 1, 1, W - 2, H - 2); R("#2a2030", 3, 3, W - 6, H - 6);
  R(col, 3, 3, W - 6, 1); R(card.reckless ? "#ff5a5a" : col, 3, H - 4, W - 6, 1);
  const ic = ICONS[card.icon] || ICONS.star;   // 大圖示（×2）
  ic.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") R(card.reckless ? "#ffb0b0" : "#fff2c8", 16 + x * 2, 7 + y * 2, 2, 2); }));
  const ti = ICONS[{ other: "heart", husband: "cup", wife: "hand", all: "star" }[card.who]];   // 左上小圖示＝對象
  ti.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === "#") R(col, 5 + x, 5 + y, 1, 1); }));
  for (let i = 0; i < 5; i++) R(i < card.bold ? "#ff7ab6" : "#4a3a50", 8 + i * 7, 54, 5, 4);   // 大膽度
  g.fillStyle = "#fff"; g.textAlign = "center"; g.textBaseline = "top";
  g.font = `bold ${10 * S / 2 * 1}px "Fusion Pixel",system-ui,sans-serif`;
  const t = card.zh, lines = t.length > 5 ? [t.slice(0, 5), t.slice(5, 10)] : [t];
  lines.forEach((l, i) => g.fillText(l, W * S / 2, (26 + i * 11) * S));
  g.font = `${8 * S / 2}px system-ui,sans-serif`; g.fillStyle = col; g.fillText(WHO_ZH[card.who], W * S / 2, 47 * S);
}

// ============================================================ 酒吧
const CSS = `
#swp-bar{position:fixed;inset:0;z-index:8700;background:#000;font-family:system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#f3eef5;overflow:hidden}
#swp-bar [hidden]{display:none!important}
#swp-bar button{font:inherit;box-shadow:none;text-shadow:none;min-height:0;letter-spacing:0;transform:none;cursor:pointer}
#swp-bar button::before,#swp-bar button::after{content:none}
#swp-bar .top{position:absolute;left:6px;right:6px;top:calc(6px + env(safe-area-inset-top));z-index:3;background:rgba(18,14,22,.88);border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:8px 12px 10px}
#swp-bar .hd{display:flex;align-items:center;gap:8px}
#swp-bar .hd .x{border:0;border-radius:12px;background:rgba(255,255,255,.12);color:#fff;font-size:12px;padding:3px 9px}
#swp-bar .nm{font-weight:700;color:#f2b8d2;font-size:14px;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#swp-bar .tx{font-size:15px;line-height:1.5;white-space:pre-wrap;min-height:2.9em;margin-top:2px}
#swp-bar .nx{text-align:right;font-size:11px;color:#bbb;height:14px}
#swp-bar .row{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
#swp-bar .chip{border:1px solid #6a4a5c;border-radius:14px;padding:3px 10px;font-size:13px;background:#2a2030;color:#e8dce6}
#swp-bar .chip.on{background:#c0508a;color:#fff;border-color:#c0508a}
#swp-bar .rx button{flex:1;border:1px solid #c0508a;border-radius:12px;padding:7px;font-size:14px;background:#3a1f33;color:#ffd6ea}
#swp-bar .hand{display:flex;gap:6px;justify-content:center;margin-top:6px}
#swp-bar .hand canvas{width:96px;height:128px;image-rendering:pixelated;border-radius:6px;cursor:pointer}
#swp-bar .hand canvas.off{opacity:.35;pointer-events:none}
#swp-bar form{display:flex;gap:8px;margin-top:6px}
#swp-bar form input{flex:1;min-width:0;border:1px solid #555;background:#221c27;color:#fff;border-radius:18px;padding:7px 12px;font-size:15px}
#swp-bar form button{border:0;background:#c0508a;color:#fff;border-radius:18px;padding:0 14px;font-size:14px}
#swp-bar .nb{position:absolute;left:0;right:0;bottom:0;z-index:3;display:flex;gap:4px;padding:6px 6px calc(6px + env(safe-area-inset-bottom));background:linear-gradient(transparent,rgba(0,0,0,.75) 35%)}
#swp-bar .nb .p{flex:1;min-width:0;border:1px solid rgba(255,255,255,.2);border-radius:10px;background:rgba(20,14,24,.78);color:#fff;padding:4px 5px;text-align:left;display:flex;flex-direction:column;gap:2px}
#swp-bar .nb .p.sel{border-color:#ff7ab6;box-shadow:0 0 0 1px #ff7ab6}
#swp-bar .nb .l1{display:flex;align-items:center;gap:4px;font-size:12px;font-weight:700;white-space:nowrap;overflow:hidden}
#swp-bar .nb .l1 canvas{width:12px;height:14px;image-rendering:pixelated;flex:none}
#swp-bar .nb .cd{height:3px;background:#3a2a40;border-radius:2px;overflow:hidden}#swp-bar .nb .cd i{display:block;height:100%;width:0;background:#ff9ac8}
#swp-bar .nb .s{font-size:10px;color:#d8c8d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:13px}
#swp-bar .end{position:absolute;inset:0;z-index:9;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;flex-direction:column;gap:12px;font-size:18px}`;

function cupIcon(cv, drunk) {   // 6×7 像素小酒杯；越醉越深、液面越高
  cv.width = 6; cv.height = 7; const g = cv.getContext("2d");
  g.clearRect(0, 0, 6, 7);
  g.fillStyle = "#ddd"; g.fillRect(0, 0, 1, 5); g.fillRect(5, 0, 1, 5); g.fillRect(0, 4, 6, 1); g.fillRect(2, 5, 2, 1); g.fillRect(1, 6, 4, 1);
  const lv = Math.round(clamp(drunk / 100, 0, 1) * 4), c = drunk >= 85 ? "#5a0f25" : drunk >= 60 ? "#9a1f45" : drunk >= 30 ? "#d45a7a" : "#f2c0a0";
  g.fillStyle = c; g.fillRect(1, 4 - lv, 4, lv);
}

/** 進酒吧。ctx：{ girl(), say(who, ask, fb), chat(system, user), mood(who), hunger(who), debug(msg), noIntro?, expose? }。 */
export function openBar(ctx = {}, c, S = {}) {
  if (!document.getElementById("swp-bar-css")) { const st = document.createElement("style"); st.id = "swp-bar-css"; st.textContent = CSS; document.head.append(st); }
  document.getElementById("swp-bar")?.remove();
  const scene = "bar";
  const h = c.husband, w = c.wife, wife = ctx.girl?.() || null, wn = wife?.name || "老婆";
  const name = { wife: wn, husband: h.name, other: w.name, player: "你" };
  const hType = h.swapType || "紳士型", wType = w.swapType || "害羞人妻";
  const NPCS = ["husband", "other", "wife"];
  const ov = document.createElement("div"); ov.id = "swp-bar";
  ov.innerHTML = `<div class="st" style="position:absolute;inset:0"></div>
    <div class="top"><div class="hd"><span class="nm">酒吧</span><button type="button" class="x">離開</button></div>
      <div class="tx"></div><div class="nx"></div>
      <div class="row rx" hidden></div>
      <div class="row chips" hidden></div>
      <div class="hand" hidden></div>
      <form hidden><input maxlength="120" placeholder="說點什麼…"><button type="submit">說</button></form></div>
    <div class="nb"></div>`;
  document.body.append(ov);
  const $ = (s) => ov.querySelector(s);
  const nm = $(".nm"), tx = $(".tx"), nx = $(".nx"), rx = $(".rx"), chips = $(".chips"), hand = $(".hand"), form = $("form"), inp = $("form input"), nb = $(".nb");
  const stage = createStage($(".st"), { backdrop: pickBackdrop("bar"), height: 66, bottom: 0 });
  let closed = false, timer = 0;
  const close = () => { closed = true; clearInterval(timer); ov.remove(); };
  $(".x").addEventListener("click", close);

  // ---- 狀態（存在 session）
  let sess = {}; try { sess = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}") || {}; } catch { /* */ }
  sess.aff = { wife: 0, husband: 0, other: 0, ...(sess.aff || {}) };
  sess.progress = Number(sess.progress) || 0;
  sess.drunk = { player: 0, wife: 0, husband: 0, other: 0, ...(sess.drunk || {}) };
  sess.nerves = sess.nerves ?? wifeNerves(wife, Number(ctx.hunger?.(wife)) || 0, ctx.mood?.(wife) || null);
  sess.open = Number(sess.open) || 0; sess.seat = sess.seat || "";
  const save = () => { sess.log = log.slice(-20); try { localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); } catch { /* */ } };
  const log = Array.isArray(sess.log) ? sess.log.slice() : [];
  const dbg = (m) => ctx.debug?.(`換妻・酒吧：${m}`);
  const bumpAff = (k, d, why) => { if (!d || !(k in sess.aff)) return; sess.aff[k] += d; dbg(`${name[k]} 好感 ${d > 0 ? "+" : ""}${d}（${why}）→ ${sess.aff[k]}`); };
  const prog = (d, why) => { if (!d) return; sess.progress = clamp(Math.round((sess.progress + d) * 10) / 10, 0, CHAT.progMax); dbg(`進度 ${d > 0 ? "+" : ""}${d}（${why}）→ ${sess.progress}`); };
  const tol = (k) => k === "player" ? DRUNK.tolPersona.player : k === "wife" ? DRUNK.tolPersona.wife * (DRUNK.tolBuild[wife?.look?.buildKey] || 1)
    : k === "husband" ? (DRUNK.tolPersona[hType] || 1) * (DRUNK.tolBuild[h.build] || 1) : (DRUNK.tolPersona[wType] || 1) * (/纖細|嬌小/.test(w.look?.build || "") ? 1.2 : /豐滿|肉感/.test(w.look?.build || "") ? 0.9 : 1);
  const drink = (k, strong = false) => {
    const [a, b] = strong ? DRUNK.strong : DRUNK.normal, add = Math.round(rnd(a, b) * tol(k));
    sess.drunk[k] = clamp(sess.drunk[k] + add, 0, 100); dbg(`${name[k]} 喝了${strong ? "烈酒" : "一杯"} +${add} → 醉度 ${sess.drunk[k]}`);
  };
  const dlv = (k) => drunkLv(sess.drunk[k]);
  const absent = {};   // id → { why, until }
  const isAway = (k) => absent[k] && (absent[k].until > Date.now());

  // ---- 立繪
  const img = (owner, key, ex) => (S.images?.[owner] || {})[`${key}~${ex}`]?.cut || (S.images?.[owner] || {})[`${key}~normal`]?.cut || "";
  const P = (k, ex) => {
    const tipsy = sess.drunk[k] >= DRUNK.lv.tipsy, e = ex || (tipsy || (k === "wife" && sess.nerves >= 0.3) || (k === "other" && wType === "害羞人妻") ? "shy" : "normal");
    return { id: k, url: k === "wife" ? (wife ? img(wife.id, "wife", e) : "") : img(c.id, k, e), label: name[k], tint: tipsy };
  };
  let focus = [];   // 目前台上的人
  const show = (ks) => { focus = ks.slice(); return stage.show(ks.map((k) => P(k))); };
  let hideT = 0;
  const hideSoon = (ms = 3500) => { clearTimeout(hideT); hideT = setTimeout(() => { if (!speaking && !closed) { focus = []; stage.show([]); } }, ms); };

  // ---- 對話框
  let speaking = false;
  const say = async (who, text, { click = false } = {}) => {
    if (closed) throw new Error("closed");
    speaking = true; nm.textContent = who; tx.textContent = ""; nx.textContent = "";
    let skip = false; const top = $(".top"), sk = () => { skip = true; }; tx.addEventListener("click", sk);
    for (const ch of String(text)) { if (closed) throw new Error("closed"); if (!skip) await sleep(36); tx.textContent += ch; }
    tx.removeEventListener("click", sk);
    if (click) { nx.textContent = "▼ 點一下繼續"; await new Promise((r) => tx.addEventListener("click", r, { once: true })); }
    else { nx.textContent = "▼"; await Promise.race([sleep(clamp(String(text).length * 55, 1600, 4200)), new Promise((r) => tx.addEventListener("click", r, { once: true }))]); }
    nx.textContent = ""; speaking = false;
    void top;
  };
  const line = async (k, text, opt = {}) => {
    dbg(`訊息 target=${opt.to || "-"} speaker=${k} label=${name[k]}`);
    log.push(`${name[k]}：${text}`); await say(name[k], text, opt);
  };
  const ask = (ph) => new Promise((res) => { nm.textContent = "你"; tx.textContent = ""; form.hidden = false; inp.placeholder = ph; inp.value = ""; inp.focus(); form.onsubmit = (e) => { e.preventDefault(); form.hidden = true; const v = inp.value; inp.value = ""; inp.blur(); form.onsubmit = null; res(v); }; });

  // ---- AI
  // 給 AI 的紀錄：log 裡的「你」＝玩家；換成「玩家」免得 AI 以為那是它自己說的話（2026-10-22 修）
  const histFor = () => log.slice(-10).map((l) => l.replace(/^你(?=[（：])/, "玩家").replace(/^（你/, "（玩家")).join("\n");
  const OTHER_NAMES = () => ["玩家", "你", "宅男", ...Object.values(name)];
  /** 模型有時一次寫好幾個人的台詞：只留這個人自己的第一句（拿掉自己的名字前綴；遇到別人的「名字：」就切掉）。 */
  const oneSpeaker = (t, k) => {
    let x = String(t || "").replace(/\r/g, "");
    const me = name[k], others = OTHER_NAMES().filter((n) => n && n !== me);
    x = x.split("\n").map((l) => l.trim()).filter(Boolean).find((l) => !others.some((n) => new RegExp(`^[「『]?${n}[（(]?[^：:]{0,12}[：:]`).test(l))) || "";
    x = x.replace(new RegExp(`^[「『]?${me}[（(]?[^：:]{0,12}[：:]\\s*`), "");
    for (const n of others) { const m = x.search(new RegExp(`[。！？…）」\\s]${n}[：:]`)); if (m > 0) x = x.slice(0, m + 1); }
    return x.trim();
  };
  // 2026-10-22 修：AI 身分講清楚（你是誰、你丈夫／妻子是誰、玩家是誰），只准替自己說一句
  const persona = (k) => k === "husband"
    ? `你是${h.name}（男，${h.age}歲），你的妻子是${w.name}。個性：${H_FLAVOR[hType]}。`
    : `你是${w.name}（女，${w.age}歲），你的丈夫是${h.name}。${w.look?.build || ""}${w.look?.cup ? `、${w.look.cup}罩杯` : ""}，個性：${W_FLAVOR[wType]}。`;
  const RULE = () => `場合：酒吧裡的換妻約會。另一對夫妻：玩家（矮胖的宅男，另一位丈夫）和他的妻子${wn}。對話紀錄裡「玩家」就是那位宅男丈夫，不是你。`
    + `你只能以自己的身分說話：只寫你自己的一句，「（動作）台詞」格式，繁體中文口語，60 字內；不要寫名字前綴、不要旁白、不要替任何其他人說話或寫別人的台詞。`;
  const say1 = async (k, task, fb) => {
    const hist = histFor(), dz = `你現在${DRUNK_ZH[dlv(k)]}（醉度 ${Math.round(sess.drunk[k])}）。`;
    let t = "";
    if (k === "wife") { if (wife && ctx.say) try { t = await ctx.say(wife, `（換妻約會在酒吧。${dz}最近的對話：\n${hist}\n${task}用「（動作）台詞」格式只寫一句。）`, ""); } catch { /* */ } }
    else if (ctx.chat) try { t = await ctx.chat(persona(k) + dz + RULE(), `最近的對話：\n${hist}\n\n${task}`); } catch { /* */ }
    return actLine(oneSpeaker(t, k), fb.match(/^（[^）]*）/)?.[0] || "（笑了笑）") || fb;
  };

  // ---- 佇列：跟你有關的一次只做一件（說話／卡牌／NPC 找你）
  let q = Promise.resolve(), qn = 0;
  const queue = (fn) => { qn++; q = q.then(fn).catch((e) => { if (!closed) dbg(`錯誤 ${e?.message || e}`); }).finally(() => { qn--; if (!qn) { hideSoon(); idleUI(); } }); return q; };

  // ---- 名字列
  const status = { wife: "", husband: "", other: "", player: "" }, inter = {};   // inter[k] = { a, b, lines:[...], at }
  let tapSel = "";
  const nbHtml = ["player", ...NPCS].map((k) => `<button type="button" class="p" data-k="${k}"><span class="l1"><canvas></canvas><span>${esc(k === "player" ? "你" : name[k])}</span></span>${k === "player" ? "" : `<span class="cd"><i></i></span>`}<span class="s"></span></button>`).join("");
  nb.innerHTML = nbHtml;
  const cd = {}; for (const k of NPCS) cd[k] = { t: 0, len: rnd(CD.min, CD.max) };
  const renderNb = () => {
    for (const el of nb.querySelectorAll(".p")) {
      const k = el.dataset.k; cupIcon(el.querySelector("canvas"), sess.drunk[k]);
      const i = el.querySelector(".cd i"); if (i) i.style.width = `${Math.round(clamp(cd[k].t / cd[k].len, 0, 1) * 100)}%`;
      const dz = { sober: "", tipsy: "微醺", drunk: "醉了", wasted: "爛醉" }[dlv(k)];
      el.querySelector(".s").textContent = (isAway(k) ? absent[k].why : status[k]) || dz || (k === "player" ? `進度 ${Math.round(sess.progress)}` : "");
      el.classList.toggle("sel", tapSel === k);
    }
  };
  nb.addEventListener("click", (e) => {
    const b = e.target.closest(".p"); if (!b || b.dataset.k === "player") return;
    const k = b.dataset.k; tapSel = tapSel === k ? "" : k; target = tapSel || "all"; markChips();
    if (!tapSel) { if (!qn) { focus = []; stage.show([]); } renderNb(); return; }
    const it = inter[k] && Date.now() - inter[k].at < 25000 ? inter[k] : null;
    if (it) { const other = it.a === k ? it.b : it.a; if (other !== "player") void show([other, k]); else void show([k]); if (!speaking) { nm.textContent = `${zhOf(it.a)} → ${zhOf(it.b)}`; tx.textContent = it.lines.join("\n"); nx.textContent = ""; } }
    else void show([k]);
    clearTimeout(hideT); renderNb();
  });
  const zhOf = (k) => (k === "player" ? "你" : k === "wife" ? `老婆（${wn}）` : `${WHO_ZH[k]}（${name[k]}）`);

  // ---- 對象 chips＋自由輸入
  let target = "all";
  chips.innerHTML = ["wife", "husband", "other", "all"].map((k) => `<button type="button" class="chip" data-t="${k}">${WHO_ZH[k]}</button>`).join("");
  const markChips = () => { chips.querySelectorAll(".chip").forEach((b) => b.classList.toggle("on", b.dataset.t === target)); inp.placeholder = `跟${target === "all" ? "大家" : name[target]}說點什麼…`; };
  chips.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; target = b.dataset.t; tapSel = target === "all" ? "" : target; markChips(); renderNb(); });
  let chatting = false;
  const idleUI = () => { if (closed || !chatting) return; rx.hidden = true; chips.hidden = false; hand.hidden = false; form.hidden = false; if (!speaking) { nm.textContent = tapSel ? name[tapSel] : "酒吧"; } markChips(); renderHand(); };
  const busyUI = () => { rx.hidden = true; chips.hidden = true; hand.hidden = true; form.hidden = true; };
  const typing = () => document.activeElement === inp || !!inp.value.trim();
  form.addEventListener("submit", (e) => {
    e.preventDefault(); if (!chatting) return;
    const v = inp.value.trim(); if (!v) return; inp.value = ""; inp.blur();
    const tgt = target === "all" ? inferTarget(v, name) : target;
    if (isAway(tgt)) { tx.textContent = `${name[tgt]}${absent[tgt].why}`; return; }
    void queue(async () => {
      busyUI();
      log.push(`你（對${target === "all" ? "大家" : name[tgt]}）：${v}`);
      bumpAff(tgt, RUDE_RE.test(v) ? CHAT.affRude : NICE_RE.test(v) ? CHAT.affNice : CHAT.affChat, "聊天"); prog(CHAT.progChat, "聊天");
      const second = Math.random() < CHAT.secondP ? ({ wife: "husband", other: "husband", husband: "other" }[tgt]) : "";
      await show(second && !isAway(second) ? [second, tgt] : [tgt]);
      await say("你", v);
      dbg(`訊息 target=${tgt}（chip=${target}${target === "all" ? "，從字面猜" : ""}） speaker=player label=你`);
      await line(tgt, await say1(tgt, `玩家${target === "all" ? "對大家說" : `對你（${name[tgt]}）說`}：「${v}」。以${name[tgt]}的身分回玩家一句。`, pick(FB.chat[tgt])), { to: "player" });
      if (second && !isAway(second)) await line(second, await say1(second, `接著${name[tgt]}剛才那句，以${name[second]}的身分插一句話。`, pick(FB.chat[second])), { to: "player" });
      save();
    });
  });

  // ---- 卡牌
  const deck = DECK_BAR;
  let handCards = [];
  const allowed = (cd_) => !BOLD_GATE[cd_.bold] || sess.progress >= BOLD_GATE[cd_.bold];
  const draw = () => {
    const ids = new Set(handCards.filter(Boolean).map((x) => x.id));
    const pool = deck.filter((x) => allowed(x) && !ids.has(x.id));
    let card = { ...pick(pool.length ? pool : deck) };
    if (sess.drunk.player >= DRUNK.lv.drunk && RECKLESS[card.id] && Math.random() < DRUNK.reckless) card = { ...card, zh: RECKLESS[card.id], bold: Math.min(5, card.bold + 1), reckless: true };
    return card;
  };
  const renderHand = () => {
    while (handCards.length < 3) handCards.push(draw());
    hand.replaceChildren(...handCards.map((cardX, i) => {
      const cv = document.createElement("canvas"); drawCard(cv, cardX); cv.title = `${cardX.zh}（${WHO_ZH[cardX.who]}・大膽 ${cardX.bold}）`;
      if (cardX.who !== "all" && isAway(cardX.who)) cv.classList.add("off");
      cv.addEventListener("click", () => { if (!chatting || qn) return; handCards[i] = draw(); void queue(() => playCard(cardX)); });
      return cv;
    }));
  };
  const acceptP = (t, bold) => {
    let p = ACCEPT.bold[clamp(bold, 1, 5)] + (sess.aff[t] || 0) * ACCEPT.perAff + (DRUNK.accept[dlv(t)] || 0) + sess.progress * ACCEPT.perProg;
    if (sess.drunk.player >= DRUNK.lv.drunk) p += ACCEPT.playerDrunk;
    if (t === "wife") p += sess.nerves * ACCEPT.wifeNerves + sess.open * ACCEPT.wifeOpen;
    return clamp(p, ACCEPT.min, ACCEPT.max);
  };
  const playCard = async (cardX) => {
    busyUI();
    let t = cardX.who;
    if (cardX.fx?.random) t = pick(NPCS.filter((k) => !isAway(k)));
    const tgts = t === "all" ? NPCS.filter((k) => !isAway(k)) : [t];
    const p = t === "all" ? acceptP("husband", cardX.bold) : acceptP(t, cardX.bold), ok = Math.random() < p;
    dbg(`出牌「${cardX.zh}」→ ${t === "all" ? "大家" : name[t]}（成功率 ${Math.round(p * 100)}%）→ ${ok ? "成功" : "失敗"}`);
    log.push(`（你${cardX.zh}${t === "all" ? "" : `（對${name[t]}）`}）`);
    await show(tgts.slice(0, 3));
    await say("你", `（${cardX.zh}）`);
    if (ok) {
      for (const k of cardX.fx?.drink || []) drink(k, !!cardX.fx?.strong);
      for (const [k, d] of Object.entries(cardX.fx?.aff || {})) bumpAff(k, d, cardX.zh);
      if (cardX.fx?.nerves) { sess.nerves = clamp(sess.nerves + cardX.fx.nerves, 0, 1); dbg(`老婆緊張 ${cardX.fx.nerves} → ${sess.nerves.toFixed(2)}`); }
      if (cardX.fx?.open) { sess.open = clamp(sess.open + cardX.fx.open, 0, 1); dbg(`老婆放開 +${cardX.fx.open} → ${sess.open.toFixed(2)}`); }
      if (cardX.fx?.seat || cardX.fx?.cross) { sess.seat = cardX.fx.cross ? "cross" : cardX.fx.seat; dbg(`座位：${sess.seat}`); }
      for (const k of tgts) bumpAff(k, CARD_FX.okAff, cardX.zh);
      prog(cardX.bold * CARD_FX.okProg, cardX.zh);
    } else { for (const k of tgts) bumpAff(k, CARD_FX.noAff, `${cardX.zh}被拒`); prog(CARD_FX.noProg, `${cardX.zh}被拒`); }
    const speaker = t === "all" ? "husband" : t;
    await line(speaker, await say1(speaker, `玩家剛才「${cardX.zh}」${t === "all" ? "（對大家）" : `（對你，${name[speaker]}）`}。你${ok ? "接受了" : "拒絕了"}，以${name[speaker]}的身分回一句。`, ok ? FB.accept[speaker] : FB.refuse[speaker]), { to: "player" });
    renderNb(); save();
  };

  // ---- NPC 自己的互動（CD 滿）
  const typeOf = (k) => {
    const pr = sess.progress, dr = sess.drunk[k], ws = Object.entries(TYPE_W).map(([t, x]) => [t, Math.max(0, x.base + pr * x.p + dr * x.d)]);
    let r = Math.random() * ws.reduce((s, [, v]) => s + v, 0);
    for (const [t, v] of ws) { if ((r -= v) < 0) return t; } return "chat";
  };
  const actOf = (type) => pick(ACTS[type].filter((a) => a.lv <= SCENE_CAP[scene]));
  const seated = (a, b) => { const pair = [a, b].sort().join("-"); return sess.seat === "cross" ? ["husband-wife", "other-player"].includes(pair) : sess.seat && [sess.seat.split("-").sort().join("-")].includes(pair); };
  const targetOf = (k) => {
    const opts = [["player", TARGET.player * (seated(k, "player") ? TARGET.seatBoost : 1)]];
    const others = NPCS.filter((x) => x !== k && !isAway(x));
    for (const x of others) opts.push([x, ((1 - TARGET.player) / Math.max(1, others.length)) * (seated(k, x) ? TARGET.seatBoost : 1)]);
    let r = Math.random() * opts.reduce((s, [, v]) => s + v, 0);
    for (const [x, v] of opts) { if ((r -= v) < 0) return x; } return "player";
  };
  const npcAct = async (k, force) => {
    if (closed || isAway(k)) return;
    if (dlv(k) === "wasted" && !force) {   // 爛醉：睡著／去吐
      const r = Math.random();
      if (r < DRUNK.wastedSleep) { absent[k] = { why: "睡著了", until: Infinity }; dbg(`${name[k]} 醉倒睡著了`); status[k] = ""; checkEnd(); return; }
      if (r < DRUNK.wastedSleep + DRUNK.wastedVomit) { absent[k] = { why: "去廁所吐了", until: Date.now() + DRUNK.vomitSec * 1000 }; dbg(`${name[k]} 去廁所吐了`); return; }
    }
    const type = force?.type || typeOf(k);
    let tgt = force?.target || targetOf(k);
    if (tgt === "player" && qn && !force) tgt = NPCS.find((x) => x !== k && !isAway(x)) || "";
    if (!tgt) return;
    const act = type === "touch" || type === "lewd" ? (force?.act ? { zh: force.act } : actOf(type)) : null;
    if (tgt === "player") {
      await queue(async () => {
        busyUI();
        await show([k]);
        if (type === "silence") { const t = pick(SILENCE).replace("{a}", name[k]).replace("{b}", "你"); log.push(t); await say("", t); return; }
        const task = type === "chat" ? "你主動找玩家聊一句（問他問題或開玩笑）。" : `你對玩家做了「${act.zh}」，一邊做一邊說一句。`;
        const ln = await say1(k, task, pick(FB[type][k]));
        status[k] = type === "chat" ? "跟你聊天" : `→ 你：${act.zh}`; renderNb();
        await line(k, ln, { to: "player" });
        if (type === "touch" || type === "lewd") await respond(k, act);
      });
      return;
    }
    // NPC ↔ NPC：只寫在名字列，點名字看
    let lines = [];
    if (type === "silence") lines = [pick(SILENCE).replace("{a}", name[k]).replace("{b}", name[tgt])];
    else {
      const l1 = await say1(k, type === "chat" ? `你小聲跟${name[tgt]}聊一句。` : `你對${name[tgt]}做了「${act.zh}」，小聲說一句。`, pick(FB[type === "chat" ? "chat" : type][k]));
      lines = [`${name[k]}：${l1}`]; dbg(`訊息 target=${tgt} speaker=${k} label=${name[k]}（NPC↔NPC，名字列）`);
      let okP = 0.7;
      if (tgt === "wife" && k === "husband") okP = WIFE_ACCEPT.base + sess.open * WIFE_ACCEPT.open + sess.nerves * WIFE_ACCEPT.nerves + (seated("husband", "wife") ? WIFE_ACCEPT.seat : 0);
      okP = 1 - (1 - clamp(okP, 0.05, 0.95)) * (DRUNK.pushCut[dlv(tgt)] || 1);
      const ok = type === "chat" || Math.random() < okP;
      if (act) lines.push(ok ? `（${name[tgt]}沒有推開）` : `（${name[tgt]}推開了${k === "husband" ? "他" : "她"}的手）`);
      if (ok) prog(NPC_PROG[type], `${name[k]}→${name[tgt]}`);
    }
    if (act && /^（/.test(lines[0]) === false && Math.random() < 0.5) lines.unshift(`（你看見${name[k]}${act.zh === "搭肩" ? "的手搭上了" + name[tgt] + "的肩" : `對${name[tgt]}${act.zh}`}）`);
    const label = type === "silence" ? "沉默" : type === "chat" ? "聊天" : act.zh;
    status[k] = `→ ${tgt === "wife" ? "老婆" : WHO_ZH[tgt]}：${label}`; status[tgt] = `← ${k === "wife" ? "老婆" : WHO_ZH[k]}：${label}`;
    inter[k] = inter[tgt] = { a: k, b: tgt, lines, at: Date.now() };
    for (const l of lines) log.push(l);
    dbg(`${name[k]} → ${name[tgt]}：${label}`);
    renderNb(); save();
  };
  const respond = (k, act) => new Promise((res) => {
    rx.hidden = false;
    rx.innerHTML = Object.keys(REACT).map((r) => `<button type="button" data-r="${r}">${r}</button>`).join("");
    nm.textContent = `${name[k]}：${act.zh}——你要怎麼做？`;
    rx.onclick = async (e) => {
      const b = e.target.closest("button"); if (!b) return;
      let r = b.dataset.r; rx.hidden = true; rx.onclick = null;
      if (r === "推開" && sess.drunk.player >= DRUNK.lv.drunk && Math.random() < DRUNK.playerPushFail) { dbg("你醉得推不開"); log.push("（你想推開，但醉得使不上力）"); await say("", "（你想推開，但醉得使不上力……）"); r = "裝沒事"; }
      const fx = REACT[r];
      prog(fx.progress, r); bumpAff(k, fx.actor, r); if (k !== "wife") bumpAff("wife", fx.wife, `看你${r}`);
      log.push(`（你${r}）`);
      const fb = { 迎合: "（眼睛一亮，靠得更近了）……你也不討厭嘛。", 推開: "（愣了一下，尷尬地縮回手）……抱歉。", 裝沒事: "（看你沒反應，笑了笑）" }[r];
      await line(k, await say1(k, `玩家對你剛才的「${act.zh}」的反應是：${r}。回一句。`, fb), { to: "player" });
      save(); res();
    };
  });

  // ---- 時間：CD、醉度衰退、結束檢查
  let last = performance.now(), minuteAcc = 0;
  const checkEnd = () => {
    const asleep = NPCS.filter((k) => absent[k]?.until === Infinity);
    if (absent.wife?.until === Infinity || asleep.length >= 2 || absent.player) {
      chatting = false; clearInterval(timer); busyUI();
      const why = absent.player ? "你醉倒了" : absent.wife?.until === Infinity ? `${wn}醉得睡著了` : "大家都醉倒了";
      const end = document.createElement("div"); end.className = "end"; end.innerHTML = `<div>${esc(why)}，今晚提早結束了。</div><button type="button" style="border:0;border-radius:12px;background:#c0508a;color:#fff;padding:8px 18px">離開</button>`;
      end.querySelector("button").addEventListener("click", close); ov.append(end); dbg(`提早結束：${why}`); save();
    }
  };
  const tick = () => {
    if (closed) return;
    const now = performance.now(), dt = Math.min(0.5, (now - last) / 1000) * (ctx.timeScale || 1); last = now;
    minuteAcc += dt;
    if (minuteAcc >= 60) {
      minuteAcc -= 60; for (const k of Object.keys(sess.drunk)) sess.drunk[k] = Math.max(0, sess.drunk[k] - DRUNK.decayPerMin);
      if (sess.drunk.player >= DRUNK.lv.wasted && Math.random() < DRUNK.playerPassOutPerMin) { absent.player = { why: "醉倒了", until: Infinity }; checkEnd(); return; }
    }
    if (chatting) {
      const slow = speaking || typing() ? CD.slow : 1;
      for (const k of NPCS) {
        if (isAway(k)) continue;
        const fast = (CD.fastAt.find(([lv]) => sess.drunk[k] >= lv) || [0, 1])[1];
        cd[k].t += dt * slow;
        if (cd[k].t >= Math.max(CD.min, cd[k].len * fast)) { cd[k].t = 0; cd[k].len = rnd(CD.min, CD.max); void npcAct(k); }
      }
    }
    renderNb();
  };

  // ---- 開場自我介紹
  const intro = async () => {
    const [hf1, hf2] = H_FB[hType](h, w);
    await show(["husband", "other"]);
    await line("husband", await say1("husband", `你先開口打招呼，介紹你自己和你身邊的妻子${w.name}。`, hf1), { click: true });
    await show(["other"]);
    await line("other", await say1("other", `輪到你自我介紹（對著那位宅男丈夫）。${wType === "害羞人妻" ? "很短的一句。" : wType === "老手" ? "可以多說兩三句，主動一點。" : "勉強、冷淡一點。"}`, W_FB[wType](w)), { click: true });
    focus = []; await stage.show([]);
    const mine = (await ask("輪到你自我介紹…")).trim() || "大家好，我是……請多指教。";
    log.push(`你：${mine}`); await say("你", mine, { click: true });
    const nv = sess.nerves; dbg(`${wn}緊張度 ${Math.round(nv * 100)}%`);
    await show(["wife"]);
    const wfb = nv >= 0.6 ? `（緊緊抓著你的袖子，小小聲）我、我是${wn}……請多指教……` : nv >= 0.3 ? `（拉了拉裙襬，勉強笑了笑）我是${wn}，你們好。` : `（大方地點頭微笑）我是${wn}，今天請多關照囉。`;
    let wl = ""; if (wife && ctx.say) { try { wl = await ctx.say(wife, `（你們夫妻正在酒吧跟另一對夫妻${h.name}和${w.name}換妻約會的開場。剛才：\n${log.slice(-4).join("\n")}\n輪到你向他們自我介紹。你現在${nv >= 0.6 ? "非常緊張" : nv >= 0.3 ? "有點緊張" : "還算放得開"}。用「（動作）台詞」格式只寫一句。）`, wfb); } catch { /* */ } }
    await line("wife", actLine(wl, wfb.match(/^（[^）]*）/)[0]) || wfb, { click: true });
    await show(["husband"]);
    await line("husband", await say1("husband", "大家都介紹完了。你幫大家點酒，然後丟出第一個輕鬆的話題（問問題），讓氣氛熱起來。", hf2), { click: true });
    for (const k of ["player", ...NPCS]) drink(k);
  };
  timer = setInterval(tick, 100);
  renderNb();
  (ctx.noIntro ? Promise.resolve() : intro()).then(() => {
    if (closed) return;
    chatting = true; focus = []; stage.show([]); nm.textContent = "酒吧"; tx.textContent = "（自由聊天：選對象說話、出牌，或點下面的名字看看大家在做什麼）"; idleUI(); save();
  }).catch(() => {});
  const api = { el: ov, stage, sess, close, force: (k, o) => npcAct(k, o || {}), drink, render: renderNb, get busy() { return qn; } };
  if (ctx.expose) window.__swapBar = api;
  return api;
}
