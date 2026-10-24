/* 換妻・酒吧（2026-10-22 v2 重做）
 * 版面：對話框在畫面最上面；立繪底邊貼齊螢幕底；最下面一排名字列（狀態＋酒杯＝醉度）。
 * 上台：只有自我介紹／正在跟玩家說話／玩家點名字的人才出現（從左邊滑進來）；點的人正在跟別的 NPC 互動 → 兩個一起上、顯示那段互動。
 * CD：每個 NPC 各自一條，每輪隨機 3–8 秒；有人在跟你說話或你在打字 → 半速。滿了就做一次互動（對象：你或另一個 NPC；
 *     沉默／聊天／碰觸／調情），機率隨場景進度＋醉度上升，色的程度依場景上限（酒吧只到輕碰）。NPC↔NPC 只寫在名字列，點名字看。
 *     NPC 碰你／調情你 → 停下來讓你選 迎合／推開／裝沒事。
 * 卡牌：手牌 3 張（canvas 像素畫），用掉補一張；大膽度 ≥4 要進度夠。成功與否＝擲（對象數值＋醉度＋你的姿態）。
 * 醉度：每個人（含你）0–100；喝酒 +10–20（烈酒更多），看體型／個性的酒量；每分鐘慢慢退。
 * 數字都在下面的表裡。 */
import { actLine, SESSION_KEY } from "./swap_select.js?v=44";
import { createStage } from "./swap_stage.js?v=5";
import { pickBackdrop } from "./swap_cafe_gen.js?v=29";
import { pairOwner, startPairLoop, applyPairFrame, pairCut } from "./swap_pair_gen.js?v=18";
import { TEASE_CARDS, TEASE_FX, WIFE_SEE, WIFE_SEE_FB, TEASE_REFUSE_FB, TEASE_OK_FB, SCENE_ZH, sceneBase, ensureAccept, teaseGate, unlockedTease, teaseChance, teaseResult, wifeSees } from "./swap_tease_rules.js?v=5";
import { DECK_PARK, DECK_BAR, DECK_KTV, DECK_HOTEL_ROOM, DECK_HOTEL_BATH, deckFor, handCardOk, isAlcoholCard } from "./swap_deck_rules.js?v=2";
import { cachedUrl, genTeaseImage, jobsForAct } from "./swap_tease.js?v=5";
import { ensureWifeAccept, ensureSceneRounds, bumpRound, END_FB, backdropOf, stageOf, nextOptions, MOVE, ensureMove, rollMove, urgeMove, allAgree, resetMove, ensurePairs, wifeSwapped, otherSwapped, anySwapped, proposeSwap, pairGroups, HOME, husbandIntent, canMove, hotelMode, vomitChance, teaseWhere, npcProposeMove, consentFree, pairIntimate, rollEjac, EJAC, teaseSteps, ZOOM, zoomFallback } from "./swap_flow_rules.js?v=7";

// ============================================================ 調整用的表
export const CD = { min: 10, max: 25, slow: 0.5, fastAt: [[85, 0.6], [60, 0.75]] };   // 秒（2026-10-22 改 10–25）；半速；醉了 CD 變短（×），但不會短於 min
/** 2026-10-22 對方丈夫（他的目標就是換妻）：主動帶氣氛、最常找玩家的老婆。只改他，其他人照 TYPE_W／TARGET。 */
export const HUSBAND = {
  cd: [10, 20],                                       // 他的 CD（秒）比別人短一點（仍在 10–25 內）
  // 對象／種類權重 2026-10-22 v3 移到 ROLES.husband（依階段）
  aim: "你是今晚主動的東道主，目標是跟對方的妻子拉近距離、促成換妻：會帶氣氛、開話題、敬酒勸酒、找機會稱讚和親近她；進度低時調皮但有分寸，不要下流。",
};
/** 2026-10-22 v3：有目的的 NPC 行為。階段（依進度）→ 每個人的主要行為；對象照角色目的加權；同一種類不連續兩次。 */
export const PHASES = [{ key: "icebreak", zh: "破冰", from: 0 }, { key: "warm", zh: "熱絡", from: 30 }, { key: "flirt", zh: "曖昧", from: 60 }];
export const phaseOf = (progress) => [...PHASES].reverse().find((p) => progress >= p.from) || PHASES[0];
/** 誰 → 誰 可以做哪些種類（換妻是男→女；兩個老婆之間只聊天，絕不碰觸／色）。all＝對方丈夫帶氣氛。 */
export const PAIR_ALLOW = {
  husband: { wife: ["chat", "touch", "lewd", "silence"], player: ["chat", "silence"], other: ["chat"], all: ["chat"] },
  other: { player: ["chat", "touch", "lewd", "silence"], wife: ["chat"], husband: ["chat"] },
  wife: { husband: ["chat", "touch", "lewd", "silence"], other: ["chat"], player: ["chat", "touch"] },
};
export const FEMALE = new Set(["wife", "other"]);
/** 每個角色每個階段：target（對象權重）、type（種類權重；碰觸／色另外 ×(1＋醉度/100)）。 */
export const ROLES = {
  husband: {   // 主線：追玩家的老婆；帶氣氛；偶爾推自己老婆去陪玩家
    icebreak: { target: { wife: 0.55, all: 0.3, player: 0.1, other: 0.05 }, type: { chat: 6, silence: 0.5, touch: 0.6 } },
    warm: { target: { wife: 0.65, all: 0.15, player: 0.1, other: 0.1 }, type: { chat: 4, touch: 4, lewd: 0.5, silence: 0.3 } },
    flirt: { target: { wife: 0.7, all: 0.1, player: 0.1, other: 0.1 }, type: { chat: 2, touch: 4, lewd: 3, silence: 0.2 } },
  },
  other: {     // 另一條主線：勾引玩家；安撫玩家的老婆（只聊天）
    icebreak: { target: { player: 0.55, wife: 0.4, husband: 0.05 }, type: { chat: 6, silence: 1, touch: 0.6 } },
    warm: { target: { player: 0.65, wife: 0.3, husband: 0.05 }, type: { chat: 3, touch: 4, lewd: 0.5, silence: 0.3 } },
    flirt: { target: { player: 0.7, wife: 0.25, husband: 0.05 }, type: { chat: 2, touch: 3, lewd: 3, silence: 0.2 } },
  },
  wife: {      // 玩家的老婆：多半被動；醉了／進度高才會回應對方丈夫
    icebreak: { init: 0.25, target: { other: 0.6, player: 0.3, husband: 0.1 }, type: { chat: 5, silence: 2, touch: 0.3 } },
    warm: { init: 0.4, target: { other: 0.4, husband: 0.35, player: 0.25 }, type: { chat: 5, touch: 1, silence: 1 } },
    flirt: { init: 0.55, target: { husband: 0.5, other: 0.3, player: 0.2 }, type: { chat: 4, touch: 2, lewd: 0.5, silence: 0.5 } },
  },
};
export const BAR_VOMIT_DRUNK = 0.06;    // 酒吧：醉了（≥60 未爛醉）每次行動去吐的機率
export const HUSBAND_TOILET_P = 0.12;   // 酒吧：換了伴的對方丈夫每次行動帶你老婆去廁所的機率
export const PROPOSE_GAP_MS = 18000;    // 對方丈夫兩次提議之間至少隔多久（2026-10-24：他很主動，40→18 秒）
export const NPC_INTER_MS = 10000;      // NPC 發起／NPC↔NPC 的互動長度（互動中不跑 CD、不能被別人打斷）
export const WIFE_LEWD_DRUNK = 60;   // 老婆自己主動的色：醉度 ≥60 才可能
export const WIFE_INIT_DRUNK = 200;  // 老婆主動機率＋醉度/200
const wpick = (opts) => { const tot = opts.reduce((s, [, v]) => s + v, 0); if (tot <= 0) return ""; let r = Math.random() * tot; for (const [k, v] of opts) { if ((r -= v) < 0) return k; } return opts[opts.length - 1][0]; };
/** 純函式（模擬也用這個）：回 { target, type } 或 null（老婆這輪不主動）。st：{ progress, drunk:{}, last:{}, away(k), seated(a,b) }。 */
export function chooseAction(k, st) {
  const ph = phaseOf(st.progress || 0).key, role = ROLES[k]?.[ph]; if (!role) return null;
  const dr = st.drunk?.[k] || 0;
  if (role.init != null && Math.random() >= role.init + dr / WIFE_INIT_DRUNK) return null;
  const tOpts = Object.entries(role.target).filter(([x]) => x === "player" || x === "all" || !st.away?.(x)).map(([x, v]) => [x, v * (x !== "all" && st.seated?.(k, x) ? TARGET.seatBoost : 1)]);
  const target = wpick(tOpts); if (!target) return null;
  const allow = PAIR_ALLOW[k]?.[target] || ["chat"];
  const types = Object.entries(role.type).filter(([t]) => allow.includes(t))
    .filter(([t]) => !(FEMALE.has(k) && FEMALE.has(target) && t !== "chat"))   // 兩個老婆：只聊天
    .filter(([t]) => !(k === "wife" && t === "lewd" && dr < WIFE_LEWD_DRUNK))
    .filter(([t]) => !(k === "wife" && target === "husband" && ph === "icebreak" && (t === "touch" || t === "lewd")))   // 破冰時老婆不會主動碰對方丈夫
    .map(([t, v]) => [t, (t === "touch" || t === "lewd" ? v * (1 + dr / 100) : v) * (st.last?.[k] === t ? 0 : 1)]);
  const type = wpick(types) || (allow.includes("chat") ? "chat" : allow[0]);
  return { target, type };
}
export const SCENE_CAP = { park: 1, bar: 1, ktv: 2, hotel: 3 };   // 碰觸／調情的最高等級（公園＝酒吧輕碰）
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
/** 牌組本體在 swap_deck_rules.js；這裡再 export 給舊呼叫。 */
export { DECK_PARK, DECK_BAR, DECK_KTV, DECK_HOTEL_ROOM, DECK_HOTEL_BATH, deckFor, handCardOk, isAlcoholCard };
const RECKLESS = {
  o_toast: "硬要她一口乾掉", o_praise: "說她身材比你老婆好", o_sit: "直接擠到她身邊", o_hand: "抓住她的手不放",
  h_cheers: "跟他拚酒", h_work: "吹噓自己的工作", w_hand: "當眾親老婆一口", a_round: "點一整瓶烈酒",
  p_o_praise: "說她身材比你老婆好", p_o_sit: "直接擠到她身邊", p_o_hand: "抓住她的手不放",
  k_o_hand: "抓住她的手不放", k_o_thigh: "直接摸上她大腿", hr_o_hold: "把她整個人抱上床", hb_o_press: "把她用力壓在牆上",
};

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
#swp-bar .nb .p.g-green{border-color:#4fd37a;box-shadow:inset 0 2px 0 #4fd37a}#swp-bar .nb .p.g-blue{border-color:#5aa0ff;box-shadow:inset 0 2px 0 #5aa0ff}#swp-bar .nb .p.gap{margin-left:10px}#swp-bar .nb .f{font-size:10px;font-weight:700}#swp-bar .nb .f.y{color:#7dffa0}#swp-bar .nb .f.n{color:#a99}
#swp-bar .nb .p.busy{background:rgba(255,190,80,.22)}#swp-bar .nb .p.busy .cd i{background:#888}
#swp-bar .nb .s{font-size:10px;color:#d8c8d8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-height:13px}
#swp-bar .pv,#swp-bar .pr{position:absolute;z-index:2;top:40%;bottom:74px;border-radius:12px;overflow:hidden;background:rgba(0,0,0,.35);border:1px solid rgba(255,255,255,.18)}
/* 2026-10-24 玩家動作圖：跟房間調戲一樣——左側滑入、停在中央、按「下一句」完成後右側滑出 */
#swp-bar .pv{z-index:3;left:50%;top:14%;bottom:auto;width:min(78%,460px);aspect-ratio:1/1;max-height:58%;background:none;border:0;border-radius:0;overflow:visible;filter:drop-shadow(0 14px 24px rgba(0,0,0,.5));transform:translateX(-50%) translateX(-60vw);opacity:0;transition:transform .5s cubic-bezier(.2,.85,.2,1),opacity .4s ease-out}
#swp-bar .pv.in{transform:translateX(-50%);opacity:1}#swp-bar .pv.out{transform:translateX(-50%) translateX(60vw);opacity:0}
@media(prefers-reduced-motion:reduce){#swp-bar .pv{transition:none}}
/* 2026-10-24 對方丈夫×你老婆：中間偏左、約中段高度、大一點，無框不模糊（只留柔影） */
#swp-bar .pr{z-index:0;left:13%;top:34%;bottom:auto;width:46%;max-width:420px;max-height:54%;aspect-ratio:3/4;background:none;border:0;border-radius:0;overflow:visible;pointer-events:none;filter:drop-shadow(0 6px 10px rgba(0,0,0,.45))}
#swp-bar .pr .prl{bottom:-18px;font-size:10px;padding:1px 4px;background:none;color:rgba(242,214,230,.8);text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
#swp-bar .pv img,#swp-bar .pr img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
#swp-bar .pv .pvl,#swp-bar .pr .prl{position:absolute;left:0;right:0;bottom:0;font-size:11px;padding:3px 6px;background:rgba(0,0,0,.55);color:#f2d6e6;text-align:center}
#swp-bar .pv .pvw{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:13px;color:#ccc}
#swp-bar .pz{position:absolute;inset:0;z-index:6;background:rgba(0,0,0,.72);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:56px 10px 90px}
#swp-bar .pz[hidden]{display:none}
#swp-bar .pz .cell{position:relative;width:min(94%,620px);aspect-ratio:3/4;max-height:64vh;filter:drop-shadow(0 10px 22px rgba(0,0,0,.6))}
#swp-bar .pz .cell img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
#swp-bar .pz .pzx{position:absolute;right:12px;top:calc(60px + env(safe-area-inset-top));width:36px;height:36px;border-radius:50%;border:1px solid rgba(255,255,255,.4);background:rgba(20,16,24,.85);color:#fff;font-size:18px}
#swp-bar .pz .pzt{width:min(94%,620px);min-height:64px;background:rgba(18,14,22,.92);border:1px solid rgba(255,255,255,.18);border-radius:12px;padding:8px 12px;font-size:15px;line-height:1.5}
#swp-bar .pz .pzt b{display:block;font-size:12px;color:#f2a6c8;margin-bottom:2px}
#swp-bar .dbgp{position:absolute;z-index:4;right:6px;bottom:78px;background:rgba(10,10,14,.88);border:1px solid #555;border-radius:10px;padding:6px 8px;font-size:11px;display:flex;flex-direction:column;gap:3px}
#swp-bar .dbgp input[type=range]{width:120px}
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
  const scene = ctx.scene || "bar", base = sceneBase(scene), SZ = SCENE_ZH[scene] || "酒吧", STG = stageOf(scene);
  // 公園／酒吧四人一起；KTV 同包廂；飯店預設各開一間（ctx.together 可覆寫）
  const together = ctx.together ?? (scene === "park" || scene === "bar" || scene === "ktv");
  const h = c.husband, w = c.wife, wife = ctx.girl?.() || null, wn = wife?.name || "老婆";
  const name = { wife: wn, husband: h.name, other: w.name, player: "你" };
  const hType = h.swapType || "紳士型", wType = w.swapType || "害羞人妻";
  const NPCS = ["husband", "other", "wife"];
  const ov = document.createElement("div"); ov.id = "swp-bar";
  ov.innerHTML = `<div class="st" style="position:absolute;inset:0"></div>
    <div class="top"><div class="hd"><span class="nm">${esc(SZ)}</span><button type="button" class="x">離開</button></div>
      <div class="tx"></div><div class="nx"></div>
      <div class="row rx" hidden></div>
      <div class="row chips" hidden></div>
      <div class="hand" hidden></div>
      <form hidden><input maxlength="120" placeholder="說點什麼…"><button type="submit">說</button></form></div>
    <div class="pr" hidden><div class="cell" style="position:absolute;inset:0"><img class="pf1" alt=""><img class="pf2" alt=""></div><div class="prl"></div></div>
    <div class="pz" hidden><button type="button" class="pzx" aria-label="關閉">✕</button><div class="cell"><img class="pf1" alt=""><img class="pf2" alt=""></div><div class="pzt"><b></b><span></span></div></div>
    <div class="pv" hidden><img alt=""><div class="pvw"></div><div class="pvl"></div></div>
    <div class="nb"></div>`;
  document.body.append(ov);
  const $ = (s) => ov.querySelector(s);
  const nm = $(".nm"), tx = $(".tx"), nx = $(".nx"), rx = $(".rx"), chips = $(".chips"), hand = $(".hand"), form = $("form"), inp = $("form input"), nb = $(".nb");
  $(".st").prepend($(".pr"));   // 雙人圖放進舞台、排在立繪前面：背景之上、半身立繪之下（同一個疊層，靠 DOM 順序）
  const stage = createStage($(".st"), { backdrop: pickBackdrop(backdropOf(scene)), height: 66, bottom: 0 });
  let closed = false, timer = 0;
  let stopPair = null, pvT = 0, finished = false;
  const close = () => finish({ kind: "leave" });
  const finish = (result) => {
    if (finished || closed) return; finished = true; closed = true;
    clearInterval(timer); clearTimeout(pvT); stopPair?.(); try { clearInterval(zoomT); } catch { /* */ }
    save();
    ov.remove();
    try { ctx.onEnd?.({ ...result, sess, S, scene }); } catch (e) { dbg(`onEnd：${e?.message || e}`); }
  };
  $(".x").addEventListener("click", () => { showEnding({ kind: "leave", title: "今晚到此為止", line: pick(END_FB.leave) }); });

  // ---- 狀態（存在 session）
  let sess = {}; try { sess = JSON.parse(localStorage.getItem(SESSION_KEY) || "{}") || {}; } catch { /* */ }
  sess.aff = { wife: 0, husband: 0, other: 0, ...(sess.aff || {}) };
  sess.progress = Number(sess.progress) || 0;
  sess.drunk = { player: 0, wife: 0, husband: 0, other: 0, ...(sess.drunk || {}) };
  sess.nerves = sess.nerves ?? wifeNerves(wife, Number(ctx.hunger?.(wife)) || 0, ctx.mood?.(wife) || null);
  sess.open = Number(sess.open) || 0; sess.seat = sess.seat || "";
  ensureAccept(sess);   // 對方妻子對你的接受度 0–100（舊存檔從 aff.other／progress 換算）
  ensureWifeAccept(sess);   // 你老婆對對方丈夫的接受度 0–100（從 open／nerves／aff.wife／progress 換算）
  ensureSceneRounds(sess, scene);
  ensureMove(sess); ensurePairs(sess);
  // 2026-10-24：旅館模式——你配到對方妻子＝play；你老婆被換走、你沒伴＝watch（只能看）。測試直接跳旅館又沒配對＝當作 play。
  const mode = base === "hotel" ? (hotelMode(sess) === "watch" ? "watch" : "play") : "play";
  const watch = mode === "watch";
  const teaseOn = !watch && (base === "ktv" || base === "hotel" || base === "bar");
  let toiletOn = false;   // 你跟對方妻子在酒吧廁所
  const where = () => (scene === "bar" && toiletOn ? "bar_toilet" : scene);
  const paired = () => otherSwapped(sess) || (base === "hotel" && hotelMode(sess) === "none");
  const huToilet = () => scene === "bar" && isAway("husband") && absent.husband.why === "跟去廁所";
  const save = () => { sess.log = log.slice(-20); try { localStorage.setItem(SESSION_KEY, JSON.stringify(sess)); } catch { /* */ } };
  const bumpWifeAcc = (d, why) => { if (!d) return; sess.wifeAccept = clamp((Number(sess.wifeAccept) || 0) + d, 0, 100); dbg(`${wn}對${h.name}接受度 ${d > 0 ? "+" : ""}${d}（${why}）→ ${sess.wifeAccept}`); };
  const log = Array.isArray(sess.log) ? sess.log.slice() : [];
  const dbg = (m) => ctx.debug?.(`換妻・${SZ}：${m}`);
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
  // ---- 2026-10-24 互動中：CD 滿 → 找人互動；互動期間兩邊都不跑 CD、不能被別人打斷；結束才重新開始 CD。
  // busy[k] = { with, until }；跟玩家的互動 until=Infinity，對話結束才 release。
  const busy = {};
  const isBusy = (k) => !!busy[k] && busy[k].until > Date.now();
  const engage = (ks, until = Infinity) => { const set = ks.filter((x) => x && x !== "all"); for (const x of set) if (x !== "player") busy[x] = { with: set.filter((y) => y !== x), until }; };
  const release = (ks) => { for (const x of ks) if (busy[x]) { delete busy[x]; if (cd[x]) { cd[x].t = 0; cd[x].len = rnd(...cdRange(x)); } } };
  /** 玩家跟 ks 互動：全程鎖住、結束才放開（對方才開始 CD）。 */
  const withPlayer = async (ks, fn) => { const set = ks.filter((x) => x && x !== "all" && x !== "player"); engage([...set, "player"]); try { return await fn(); } finally { release(set); renderNb(); } };

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
    if (click) { nx.textContent = "▼ 下一句"; await new Promise((r) => tx.addEventListener("click", r, { once: true })); }
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
  const persona = (k) => {
    if (k === "husband") {
      const likes = (h.likes || []).slice(0, 3).join("、") || "喝酒聊天";
      const hobbies = (h.hobbies || []).slice(0, 2).join("、");
      const pers = h.personality || H_FLAVOR[hType] || "";
      const buildZh = h.look?.build_zh || "";
      const ht = h.height_cm || h.look?.height_cm;
      return `你是${h.name}（男，${h.age}歲${buildZh ? `，${buildZh}` : ""}${ht ? `、身高${ht}cm` : ""}），你的妻子是${w.name}。個性：${pers}（換妻類型：${hType}）。喜好：${likes}${hobbies ? `；興趣：${hobbies}` : ""}。${HUSBAND.aim}`;
    }
    const pers = Array.isArray(w.personality) ? w.personality.join("、") : (w.personality || W_FLAVOR[wType] || "");
    const cup = w.look?.cup || "";
    const cupS = cup ? (/罩杯/.test(cup) ? cup : `${cup}罩杯`) : "";
    return `你是${w.name}（女，${w.age || w.look?.age || "?"}歲），你的丈夫是${h.name}。${w.look?.build || ""}${cupS ? `、${cupS}` : ""}，個性：${pers || W_FLAVOR[wType]}（換妻類型：${wType}）。`;
  };
  const RULE = () => `場合：${SZ}裡的換妻約會。另一對夫妻：玩家（矮胖的宅男，另一位丈夫）和他的妻子${wn}。對話紀錄裡「玩家」就是那位宅男丈夫，不是你。`
    + `你只能以自己的身分說話：只寫你自己的一句，「（動作）台詞」格式，繁體中文口語，60 字內；不要寫名字前綴、不要旁白、不要替任何其他人說話或寫別人的台詞。`;
  const say1 = async (k, task, fb) => {
    const hist = histFor(), dz = `你現在${DRUNK_ZH[dlv(k)]}（醉度 ${Math.round(sess.drunk[k])}）。`;
    let t = "";
    if (k === "wife") { if (wife && ctx.say) try { t = await ctx.say(wife, `（換妻約會在${SZ}。${dz}最近的對話：\n${hist}\n${task}用「（動作）台詞」格式只寫一句。）`, ""); } catch { /* */ } }
    else if (ctx.chat) try { t = await ctx.chat(persona(k) + dz + RULE(), `最近的對話：\n${hist}\n\n${task}`); } catch { /* */ }
    return actLine(oneSpeaker(t, k), fb.match(/^（[^）]*）/)?.[0] || "（笑了笑）") || fb;
  };

  // ---- 佇列：跟你有關的一次只做一件（說話／卡牌／NPC 找你）
  let q = Promise.resolve(), qn = 0;
  const queue = (fn) => { qn++; q = q.then(fn).catch((e) => { if (!closed) dbg(`錯誤 ${e?.message || e}`); }).finally(() => { qn--; if (!qn) { hideSoon(); idleUI(); } }); return q; };

  // ---- 名字列
  const status = { wife: "", husband: "", other: "", player: "" }, inter = {};   // inter[k] = { a, b, lines:[...], at }
  let tapSel = "";
  const nbHtml = ["player", ...NPCS].map((k) => `<button type="button" class="p g-${HOME[k]}" data-k="${k}"><span class="l1"><canvas></canvas><span>${esc(k === "player" ? "你" : name[k])}</span>${k === "player" ? "" : `<span class="f"></span>`}</span>${k === "player" ? "" : `<span class="cd"><i></i></span>`}<span class="s"></span></button>`).join("");
  nb.innerHTML = nbHtml;
  const cdRange = (k) => (k === "husband" ? HUSBAND.cd : [CD.min, CD.max]);
  const cd = {}; for (const k of NPCS) cd[k] = { t: 0, len: rnd(...cdRange(k)) };
  const renderNb = () => {
    // 2026-10-24：依配對分組排在一起（綠＝你們夫妻、藍＝對方夫妻＝邊框色看「本來是誰家的」）；每個 NPC 顯示想不想換地方
    const order = pairGroups(sess).flat(), first2 = pairGroups(sess)[1][0];
    for (const el of nb.querySelectorAll(".p")) {
      const kk = el.dataset.k; el.style.order = String(order.indexOf(kk)); el.classList.toggle("gap", kk === first2);
      const f = el.querySelector(".f");
      if (f) { const y = !!sess.move[kk]; f.className = `f ${y ? "y" : "n"}`; f.textContent = STG >= 3 ? "" : y ? "想走✓" : "還想待"; }
    }
    for (const el of nb.querySelectorAll(".p")) {
      const k = el.dataset.k; cupIcon(el.querySelector("canvas"), sess.drunk[k]);
      const i = el.querySelector(".cd i"); if (i) i.style.width = `${Math.round(clamp(cd[k].t / cd[k].len, 0, 1) * 100)}%`;
      const dz = { sober: "", tipsy: "微醺", drunk: "醉了", wasted: "爛醉" }[dlv(k)];
      el.classList.toggle("busy", isBusy(k));
      const bz = isBusy(k) ? `互動中・${busy[k].with.map((y) => (y === "player" ? "你" : name[y])).join("、") || "…"}` : "";
      el.querySelector(".s").textContent = (isAway(k) ? absent[k].why : bz || status[k]) || dz || (k === "player" ? (watch ? "只能看" : `她 ${sess.accept}／妻 ${sess.wifeAccept}・${pairZh()}`) : "");
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
  const pairZh = () => (otherSwapped(sess) && wifeSwapped(sess) ? "已互換" : otherSwapped(sess) ? `你陪${name.other}` : wifeSwapped(sess) ? `${wn}陪${h.name}` : "未換");
  const zhOf = (k) => (k === "player" ? "你" : k === "wife" ? `老婆（${wn}）` : `${WHO_ZH[k]}（${name[k]}）`);

  // ---- 對象 chips＋自由輸入
  let target = "all";
  chips.innerHTML = ["wife", "husband", "other", "all"].map((k) => `<button type="button" class="chip" data-t="${k}">${WHO_ZH[k]}</button>`).join("");
  const markChips = () => { chips.querySelectorAll(".chip").forEach((b) => b.classList.toggle("on", b.dataset.t === target)); inp.placeholder = `跟${target === "all" ? "大家" : name[target]}說點什麼…`; };
  chips.addEventListener("click", (e) => { const b = e.target.closest(".chip"); if (!b) return; target = b.dataset.t; tapSel = target === "all" ? "" : target; markChips(); renderNb(); });
  let chatting = false;
  const idleUI = () => { if (closed || !chatting) return; rx.hidden = true; chips.hidden = false; hand.hidden = watch; form.hidden = false; if (!speaking) { nm.textContent = tapSel ? name[tapSel] : SZ; } markChips(); renderHand(); };
  const busyUI = () => { rx.hidden = true; chips.hidden = true; hand.hidden = true; form.hidden = true; };
  const typing = () => document.activeElement === inp || !!inp.value.trim();
  form.addEventListener("submit", (e) => {
    e.preventDefault(); if (!chatting) return;
    const v = inp.value.trim(); if (!v) return; inp.value = ""; inp.blur();
    const tgt = target === "all" ? inferTarget(v, name) : target;
    if (isAway(tgt)) { tx.textContent = `${name[tgt]}${absent[tgt].why}`; return; }
    if (pairLocked(tgt)) { tx.textContent = pairLockMsg(); return; }
    if (isBusy(tgt) && !busy[tgt].with.includes("player")) { tx.textContent = `（${name[tgt]}正在跟${busy[tgt].with.map((y) => name[y] || "你").join("、")}互動，等一下）`; return; }
    void queue(() => withPlayer([tgt], async () => {
      busyUI();
      log.push(`你（對${target === "all" ? "大家" : name[tgt]}）：${v}`);
      bumpAff(tgt, RUDE_RE.test(v) ? CHAT.affRude : NICE_RE.test(v) ? CHAT.affNice : CHAT.affChat, "聊天"); prog(CHAT.progChat, "聊天");
      const second = Math.random() < CHAT.secondP ? ({ wife: "husband", other: "husband", husband: "other" }[tgt]) : "";
      await show(second && !isAway(second) ? [second, tgt] : [tgt]);
      await say("你", v);
      dbg(`訊息 target=${tgt}（chip=${target}${target === "all" ? "，從字面猜" : ""}） speaker=player label=你`);
      await line(tgt, await say1(tgt, `玩家${target === "all" ? "對大家說" : `對你（${name[tgt]}）說`}：「${v}」。以${name[tgt]}的身分回玩家一句。`, pick(FB.chat[tgt])), { to: "player" });
      if (second && !isAway(second)) await line(second, await say1(second, `接著${name[tgt]}剛才那句，以${name[second]}的身分插一句話。`, pick(FB.chat[second])), { to: "player" });
      afterPlayerTurn("聊天");
    }));
  });

  // ---- 卡牌
  // ---- 回合／門檻／結束畫面
  let advancing = false;
  const showEnding = ({ kind, title, line, who }) => {
    chatting = false; busyUI();
    ov.querySelector(".end")?.remove();
    const end = document.createElement("div"); end.className = "end";
    end.innerHTML = `<div style="max-width:86%;text-align:center;line-height:1.55"><b style="display:block;margin-bottom:8px">${esc(title || "約會結束")}</b>${esc(line || "")}</div><button type="button" style="border:0;border-radius:12px;background:#c0508a;color:#fff;padding:10px 22px;font:inherit">回到遊戲</button>`;
    end.querySelector("button").addEventListener("click", () => finish({ kind: kind || "end", who, line, title }));
    ov.append(end); dbg(`結束畫面：${title}／${line}`); save();
  };
  const goNext = async (next, note) => {
    if (advancing || finished) return; advancing = true; chatting = false; busyUI();
    dbg(note || `前往 ${SCENE_ZH[next] || next}`);
    const tip = document.createElement("div"); tip.className = "end";
    tip.innerHTML = `<div>${esc(note || `接下來：${SCENE_ZH[next] || next}`)}</div>`;
    ov.append(tip); await sleep(1400);
    finish({ kind: "advance", next });
  };
  // ---- 2026-10-24 換地方：全員旗號都「想走」才走；玩家可慫恿；第 2 段起換妻（可單邊）
  const WHO_K = { wife: "老婆", husband: "對方丈夫", other: "對方妻子" };
  const moveT = {}; for (const k of NPCS) moveT[k] = rnd(...MOVE.rerollSec);
  let readySince = 0, lastProp = Date.now();
  const flagLine = () => NPCS.map((k) => `${name[k]}${sess.move[k] ? "✓" : "✗"}`).join("　");
  const go = async (next) => {
    const g = canMove(sess, scene, next);
    if (!g.ok) { if (!speaking) tx.textContent = `（${g.why}：${flagLine()}）`; return false; }
    resetMove(sess); save();
    const note = next === "hotel_room" ? (hotelMode(sess) === "watch" ? `大家都同意了——前往旅館（你沒有伴，只能在旁邊看）` : "大家都同意了——前往旅館") : `大家都同意了——前往${SCENE_ZH[next]}`;
    await goNext(next, note); return true;
  };
  /** 換妻提議（by＝husband｜player）：兩位妻子各自決定；可能只成一邊。 */
  const runSwap = async (by) => {
    if (finished || advancing) return;
    lastProp = Date.now();
    if (by === "husband") {
      await show(["husband"]);
      await line("husband", await say1("husband", `你提議交換伴侶：你陪玩家的妻子${wn}，玩家陪你的妻子${w.name}。語氣照你的個性。`, `（舉杯）氣氛正好——不如我們交換一下？我陪${wn}，你陪${w.name}。`), { click: true });
    } else {
      await show(["husband"]);
      await say("你", `（對${h.name}說）要不要……交換一下？`);
      await line("husband", await say1("husband", "玩家（另一位丈夫）向你提議交換伴侶，你很高興，回他一句。", "（眼睛一亮）我等這句話很久了。"), { to: "player" });
    }
    const r = proposeSwap(sess, by);
    dbg(`換妻提議（${by}）→ 老婆 ${r.wife}／對方妻子 ${r.other}（意願 ${sess.swapWill.wife.toFixed(2)}／${sess.swapWill.other.toFixed(2)}）`);
    if (r.wife !== null) {
      await show(["wife"]);
      await line("wife", await say1("wife", r.wife ? `大家在提議交換伴侶，你（${wn}）答應去陪${h.name}了。對你老公說一句。` : `大家在提議交換伴侶，你（${wn}）還不願意。說一句。`, r.wife ? "（低著頭，小聲）……那、我就陪他一下喔。" : "（抓緊你的衣角）……我、我還不要。"), { click: true });
      if (r.wife) bumpWifeAcc(5, "答應換妻");
    }
    if (r.other !== null) {
      await show(["other"]);
      await line("other", await say1("other", r.other ? `大家在提議交換伴侶，你（${name.other}）答應去陪玩家了。對玩家說一句。` : `大家在提議交換伴侶，你（${name.other}）還不想。說一句。`, r.other ? "（坐到你身邊）……那今晚就請多指教囉。" : "（笑著搖頭）再等等嘛。"), { click: true });
    }
    const ln = otherSwapped(sess) && wifeSwapped(sess) ? `（配對成立：你跟${name.other}、${h.name}跟${wn}。）`
      : wifeSwapped(sess) && !otherSwapped(sess) ? `（${wn}去陪${h.name}了——但${name.other}還沒點頭：${h.name}一個人左擁右抱，你落單了。）`
      : otherSwapped(sess) ? `（${name.other}坐到你身邊了；${wn}還在你這邊。）` : "（兩位妻子都還沒點頭。）";
    await say("", ln, { click: true });
    handCards = []; renderNb(); save();
  };
  /** 玩家慫恿：「去下一個地方吧」。 */
  const runUrge = async () => {
    const who = target === "all" ? "all" : target;
    await say("你", who === "all" ? "（對大家）去下一個地方吧？" : `（對${name[who]}）去下一個地方吧？`);
    const r = urgeMove(sess, who, scene);
    const k = who === "all" ? pick(NPCS.filter((x) => !isAway(x))) : who;
    if (k) {
      await show([k]);
      await line(k, await say1(k, r[k] ?? sess.move[k] ? "玩家提議換個地方，你同意了，回一句。" : "玩家提議換個地方，你還想在這裡多待一下，回一句。", sess.move[k] ? "（點點頭）好啊，走吧。" : "（搖搖頭）再待一下嘛。"), { to: "player" });
    }
    dbg(`慫恿 ${who} → ${flagLine()}`); renderNb(); save(); checkReady();
  };
  /** 全員同意時：第 1 段給玩家選酒吧／KTV（沒選 20 秒後大家決定）；第 2 段有人換了 → 旅館；沒人換 → 對方丈夫提議換妻。 */
  const checkReady = () => {
    renderAdvanceBtn();
    if (STG >= 3 || advancing || finished) return;
    if (!allAgree(sess)) { readySince = 0; return; }
    if (!readySince) { readySince = Date.now(); if (!speaking) tx.textContent = STG === 1 ? "（大家都想換地方了——選要去酒吧還是 KTV）" : anySwapped(sess) ? "（大家都同意了，準備去旅館）" : "（大家都想走了，但還沒有人換伴）"; }
    if (STG === 2 && !anySwapped(sess) && !qn && Date.now() - lastProp > 15000) void queue(() => runSwap("husband"));
  };
  const autoGo = () => {
    if (!readySince || qn || advancing || finished || Date.now() - readySince < 20000) return;
    readySince = Date.now();
    if (STG === 1) void queue(async () => { busyUI(); await go(Math.random() < 0.5 ? "bar" : "ktv"); });
    else if (STG === 2 && anySwapped(sess)) void queue(async () => { busyUI(); await go("hotel_room"); });
  };
  const afterPlayerTurn = (why) => {
    const n = bumpRound(sess, scene); save(); dbg(`回合 +1（${why}）→ ${n}`);
    if (chatting) ejacTick(dt);
    renderNb();
  };

  const deck = deckFor(scene);
  let handCards = [];
  const HAND_N = teaseOn ? 4 : 3;
  const gateSt = () => ({ accept: sess.accept, drunk: sess.drunk.other, scene: where(), wifeAccept: sess.wifeAccept });
  const teasePool = () => (consentFree(sess, "other") ? TEASE_CARDS.slice() : unlockedTease(gateSt()));   // 換了＝全部解鎖（場景再篩）
  const otherHere = () => toiletOn || !isAway("other");   // 廁所裡她「不在座位」但在你身邊
  const whereOk = (cd_) => teaseWhere(cd_, { where: where(), paired: paired(), drunk: sess.drunk.other, mode });
  const allowed = (cd_) => (toiletOn ? !!cd_.tease : handCardOk(cd_, scene)) && (cd_.tease ? (consentFree(sess, "other") || teaseGate(cd_, gateSt()).ok) && whereOk(cd_) && otherHere() : !BOLD_GATE[cd_.bold] || sess.progress >= BOLD_GATE[cd_.bold]);
  const draw = () => {
    const ids = new Set(handCards.filter(Boolean).map((x) => x.id));
    if (teaseOn && Math.random() < TEASE_FX.handTease) {   // 動作卡：只從已解鎖的抽
      const tp = teasePool().filter((x) => !ids.has(x.id) && handCardOk(x, scene) && whereOk(x));
      if (tp.length && otherHere()) return { ...pick(tp) };
    }
    if (toiletOn) { const tp = teasePool().filter((x) => whereOk(x)); if (tp.length) return { ...pick(tp) }; }
    const pool = deck.filter((x) => allowed(x) && !ids.has(x.id));
    const fallback = deck.filter((x) => handCardOk(x, scene));
    let card = { ...pick(pool.length ? pool : (fallback.length ? fallback : deck)) };
    if (sess.drunk.player >= DRUNK.lv.drunk && RECKLESS[card.id] && Math.random() < DRUNK.reckless) card = { ...card, zh: RECKLESS[card.id], bold: Math.min(5, card.bold + 1), reckless: true };
    return card;
  };
  const renderHand = () => {
    handCards = handCards.map((x) => (x?.tease && !allowed(x) ? draw() : x));   // 接受度掉了／她醉醒了：鎖回去的動作卡換掉
    while (handCards.length < HAND_N) handCards.push(draw());
    hand.replaceChildren(...handCards.map((cardX, i) => {
      const cv = document.createElement("canvas"); drawCard(cv, cardX); cv.title = `${cardX.zh}（${WHO_ZH[cardX.who]}・大膽 ${cardX.bold}）`;
      if (cardX.who !== "all" && isAway(cardX.who)) cv.classList.add("off");
      cv.addEventListener("click", () => { if (!chatting || qn) return; handCards[i] = draw(); const tk = cardX.tease ? "other" : cardX.who === "all" ? "" : cardX.who;
        if (!cardX.tease && pairLocked(cardX.who)) { handCards[i] = cardX; tx.textContent = pairLockMsg(); return; }
        if (tk && isBusy(tk) && !busy[tk].with.includes("player")) { tx.textContent = `（${name[tk]}正在跟別人互動，等一下）`; return; }
        void queue(() => withPlayer(tk ? [tk] : [], () => playCard(cardX))); });
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
    if (cardX.tease) return playTease(cardX);
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
    afterPlayerTurn(cardX.zh);
  };

  // ---- 動作卡（KTV／飯店）：右側就地顯示 POV 圖（不另開視窗）
  const pv = $(".pv"), pvImg = $(".pv img"), pvW = $(".pv .pvw"), pvL = $(".pv .pvl");
  let pvTok = 0;
  /** 滑入（左→中）／滑出（中→右），跟房間調戲的 action-flash 一樣。 */
  const pvIn = () => { if (!pv.hidden && pv.classList.contains("in")) return; pv.classList.remove("in", "out"); pv.hidden = false; void pv.offsetWidth; pv.classList.add("in"); };
  const pvOut = async () => { pvTok++; clearTimeout(pvT); if (pv.hidden) return; pv.classList.remove("in"); pv.classList.add("out"); await sleep(520); if (!pv.classList.contains("in")) { pv.hidden = true; pv.classList.remove("out"); } };
  const setImages = (imgs) => { if (imgs) S = { ...S, images: imgs }; ctx.onImages?.(imgs); };
  /** 一張圖：有快取直接放；沒有就現產（這段時間顯示生圖中），回來時還是同一次才放上去。 */
  const pvShow = async (job, label, tok) => {
    let u = cachedUrl(S, c, job.key);
    pvIn(); pvL.textContent = label;
    if (!u) {
      pvImg.removeAttribute("src"); pvW.textContent = "生圖中…";
      try { setImages(await genTeaseImage(c, job, { debug: dbg })); u = cachedUrl(S, c, job.key); }
      catch (e) { dbg(`動作圖 ${job.key} 失敗：${e?.message || e}`); }
    }
    if (tok !== pvTok || closed) return false;
    pvW.textContent = u ? "" : "（沒有圖）"; if (u) pvImg.src = u; else pvImg.removeAttribute("src");
    return !!u;
  };
  const showPov = async (cardX) => {
    const tok = ++pvTok; clearTimeout(pvT);
    const jobs = jobsForAct(cardX.act, where());
    if (!jobs.length) return;   // 純文字卡（接吻）：只靠她那句，不開 POV
    if (cardX.act !== "sex") { await pvShow(jobs[0], cardX.zh, tok); return; }
    const ZH = { open: "張開腿", join: "插入", thrust: "抽插" };
    await pvShow(jobs[0], `${cardX.zh}・${ZH[jobs[0].step]}`, tok);   // 第一張到位就回（台詞可以開始），後面在背景接
    void (async () => {
      for (const j of jobs.slice(1)) { await sleep(2000); if (tok !== pvTok || closed) return; await pvShow(j, `${cardX.zh}・${ZH[j.step]}`, tok); }
      // 抽插：插入／抽插兩格輪流（同雙人圖輪播節奏）
      const a = cachedUrl(S, c, jobs[1]?.key), b = cachedUrl(S, c, jobs[2]?.key);
      if (a && b) { let f = false; const loop = () => { if (tok !== pvTok || closed) return; f = !f; pvImg.src = f ? b : a; pvT = setTimeout(loop, f ? 600 : 1400); }; loop(); }
    })();
  };
  const playTease = async (cardX) => {
    busyUI();
    const free = consentFree(sess, "other");   // 換了＝同意色色：不看接受度／醉度，只看場景
    if ((!free && !teaseGate(cardX, gateSt()).ok) || !whereOk(cardX)) { renderHand(); return; }
    const st = gateSt(), p = free ? 1 : teaseChance(acceptP("other", cardX.bold), st), wasted = st.drunk >= TEASE_FX.wasted, ok = free || wasted || Math.random() < p;
    dbg(`動作「${cardX.zh}」→ ${name.other}（接受 ${st.accept}、醉度 ${Math.round(st.drunk)}${wasted ? "、爛醉＝必成功" : ""}；成功率 ${Math.round(p * 100)}%）→ ${ok ? "成功" : "被拒"}`);
    log.push(`（你對${name.other}：${cardX.zh}）`);
    await show(["other"]);
    await say("你", `（${cardX.zh}）`);
    const fx = teaseResult(cardX, ok);
    sess.accept = clamp(sess.accept + fx.dAcc, 0, 100); dbg(`${name.other} 接受度 ${fx.dAcc > 0 ? "+" : ""}${fx.dAcc} → ${sess.accept}`);
    if (ok) {
      prog(fx.dProg, cardX.zh); bumpAff("other", CARD_FX.okAff, cardX.zh);
      // 2026-10-24：跟房間調戲一樣——圖左側滑入停中央，按「下一句」走完（口交三句），再右側滑出
      const pov = showPov(cardX), n = teaseSteps(cardX.act);
      for (let i = 0; i < n; i++) {
        const stepTask = n > 1 ? `（第 ${i + 1}／${n} 句：${i === 0 ? "剛開始" : i === n - 1 ? "快結束、他快要射了" : "正在進行"}）` : "";
        const txt = await say1("other", `玩家（另一位丈夫）對你做了「${cardX.zh}」，你${wasted ? "醉得迷迷糊糊、任他擺布" : "接受了"}。${stepTask}以${name.other}的身分一邊被他這樣做一邊說一句反應。`, pick(TEASE_OK_FB));
        if (i === 0) await pov;
        await line("other", txt, { to: "player", click: true });
      }
      await pvOut();
      if (together && !toiletOn && wife && !isAway("wife") && Math.random() < WIFE_SEE.p) {   // 你老婆看見了
        const r = wifeSees(wife, { nerves: sess.nerves, open: sess.open, drunk: sess.drunk.wife });
        dbg(`${wn}看見了 → ${r.kind === "jealous" ? "吃醋" : "變得更開放"}（吃醋機率 ${Math.round(r.pJ * 100)}%）緊張 ${sess.nerves.toFixed(2)}→${r.nerves.toFixed(2)}、放開 ${sess.open.toFixed(2)}→${r.open.toFixed(2)}`);
        sess.nerves = r.nerves; sess.open = r.open;
        await show(["wife"]);
        const task = r.kind === "jealous" ? `你看見你老公（玩家）對${name.other}「${cardX.zh}」，你吃醋了。對你老公說一句短短的吃醋的話。` : `你看見你老公（玩家）對${name.other}「${cardX.zh}」，你心跳加速、覺得自己也變得更放得開了。說一句短短的話。`;
        await line("wife", await say1("wife", task, pick(WIFE_SEE_FB[r.kind])), { to: "player" });
        status.wife = r.kind === "jealous" ? "吃醋了" : "變得放開了";
      }
    } else {
      bumpAff("other", CARD_FX.noAff, `${cardX.zh}被拒`);
      await line("other", await say1("other", `玩家（另一位丈夫）想對你「${cardX.zh}」，你拒絕了。以${name.other}的身分拒絕他一句。`, pick(TEASE_REFUSE_FB)), { to: "player" });
    }
    status.other = `${ok ? "接受" : "拒絕"}：${cardX.zh}`; renderNb();
    afterPlayerTurn(cardX.zh);
  };

  // ---- 左上中央：你老婆×對方丈夫的雙人互動圖（他們剛好在場才有）
  const pr = $(".pr"), prL = $(".pr .prl"), pf1 = $(".pr .pf1"), pf2 = $(".pr .pf2");
  const PAIR_ZH = { chat: "聊天", kiss: "接吻", grope: "摸胸部", fellatio: "口交", cunni: "舔陰唇", normal: "正常體位", behind: "背後", seated: "面對面坐著" };
  // 2026-10-24：依配對／場景決定他們在做什麼。酒吧：換了或她醉了＝座位接吻；跟去廁所＝背後。KTV：換了才會往下。旅館：房間正常位、浴室背後。
  let pairRestUntil = 0, curPair = "";   // 射了之後休息：這段時間不親熱
  const pairAct = () => {
    if (Date.now() < pairRestUntil) return "";
    if (huToilet()) return "behind";
    if (base === "hotel") return wifeSwapped(sess) || watch ? (scene === "hotel_bath" ? "behind" : "normal") : "";
    const sw = wifeSwapped(sess), pg = sess.progress + sess.drunk.wife * 0.3 + sess.open * 30;
    if (base === "bar") return sw || sess.drunk.wife >= DRUNK.lv.drunk ? (pg >= 40 || sw ? "kiss" : "chat") : "";
    if (base === "ktv") return !sw ? (pg >= 30 ? "chat" : "") : pg >= 50 ? "normal" : pg >= 35 ? "fellatio" : pg >= 20 ? "grope" : "kiss";   // 換了＝同意：包廂直接往下
    return "";
  };
  let prKey = "";
  const renderPair = () => {
    const a = wife ? pairAct() : "";
    const here = huToilet() || watch || (base !== "hotel" && together && !isAway("wife") && !isAway("husband")) || (base === "hotel" && wifeSwapped(sess));
    curPair = a && here ? a : "";
    pr.style.pointerEvents = a && here && pairIntimate(a) ? "auto" : "none"; pr.style.cursor = pr.style.pointerEvents === "auto" ? "zoom-in" : "";
    if (zoomOn && !(a && here && pairIntimate(a)) && !zoomHold) zoomClose();
    if (!a || !here) { pr.hidden = true; prKey = ""; return; }
    const have = S.images?.[pairOwner(wife, c)] || {};
    const u1 = pairCut(have, `${a}~1`) || pairCut(have, a), u2 = pairCut(have, `${a}~2`);
    if (!u1 && !u2) { pr.hidden = true; prKey = ""; return; }
    if (prKey === a + u1 + u2) return;
    prKey = a + u1 + u2; pr.hidden = false; prL.textContent = `${wn} × ${h.name}：${huToilet() ? "在廁所・" : ""}${PAIR_ZH[a] || a}`;
    pf1.src = u1 || u2; if (u1 && u2) pf2.src = u2; else pf2.removeAttribute("src");   // 只有一張：只放第 1 格（不切、不晃）
  };
  /** 你老婆×對方丈夫正在親熱（畫面上那組不是聊天）＝不能跟他們兩個講話／互動。 */
  const pairLocked = (k) => (k === "wife" || k === "husband" || k === "all") && pairIntimate(curPair);
  const pairLockMsg = () => `（${wn}跟${h.name}正在${PAIR_ZH[curPair] || "親熱"}，現在不方便打擾他們）`;
  // 對方丈夫：口交／交配中每 5 秒判一次射（1/5）；射了就結束這段、休息一陣，兩人 CD 從 0 開始
  let ejacAcc = 0, ejacBusy = false;
  const ejacTick = (dt) => {
    if (ejacBusy || !curPair || !pairIntimate(curPair)) { ejacAcc = 0; return; }
    ejacAcc += dt; if (ejacAcc < EJAC.everySec) return; ejacAcc = 0;
    const act = curPair;
    if (!rollEjac(act)) return;
    ejacBusy = true; pairRestUntil = Date.now() + EJAC.restSec * 1000; dbg(`${h.name} 射了（${PAIR_ZH[act] || act}）→ 結束，休息 ${EJAC.restSec} 秒`);
    if (zoomOn) { zoomHold = true; clearInterval(zoomT); zoomSay("husband", `（${h.name}低吼一聲，在${wn}${act === "fellatio" ? "嘴裡" : "體內"}射了出來……）`); setTimeout(() => { if (zoomHold) zoomClose(); }, 2600); }
    renderPair(); status.husband = "射了"; status.wife = act === "fellatio" ? "被射在嘴裡" : "被內射了";
    log.push(`（${h.name}在${wn}${act === "fellatio" ? "嘴裡" : "裡面"}射了）`);
    void queue(async () => {
      busyUI(); await show(["husband", "wife"]);
      await say("", `（${h.name}低吼一聲，在${wn}${act === "fellatio" ? "嘴裡" : "體內"}射了出來……）`);
      await line("husband", await say1("husband", `你剛剛跟${wn}（玩家的妻子）${PAIR_ZH[act] || act}，射了。喘著氣說一句事後的話。`, "（喘著氣）哈……哈……太舒服了……"), { to: "wife" });
    }).finally(() => { ejacBusy = false; release(["husband", "wife"]); for (const k of ["husband", "wife"]) if (cd[k]) cd[k].t = 0; renderNb(); });
  };
  // ---- 點雙人圖放大：看他們親熱＋他們的對話／喘息（AI，每 3.5 秒一句；失敗用固定句）。你插不進去。
  const pz = $(".pz"), pzN = $(".pz .pzt b"), pzT = $(".pz .pzt span"), zf1 = $(".pz .pf1"), zf2 = $(".pz .pf2");
  let zoomOn = false, zoomHold = false, zoomT = 0, zoomI = 0, zoomBusy = false;
  const zoomSay = (k, t) => { pzN.textContent = k === "wife" ? wn : h.name; pzT.textContent = t; };
  const zoomLine = async () => {
    if (closed || !zoomOn || zoomHold || zoomBusy || !pairIntimate(curPair)) return;
    zoomBusy = true; const act = curPair, k = zoomI % 2 ? "wife" : "husband", i = zoomI++;
    const task = k === "wife"
      ? `你正在跟${h.name}（別人的丈夫）${PAIR_ZH[act] || act}，老公在旁邊看。寫一句你此刻的反應：甜蜜、害羞或忍不住的喘息呻吟都可以。`
      : `你正在跟${wn}（玩家的妻子）${PAIR_ZH[act] || act}。對她說一句親密的話，或是你的喘息。`;
    let t = ""; try { t = await say1(k, task, zoomFallback(act, k, i)); } catch { t = zoomFallback(act, k, i); }
    zoomBusy = false; if (zoomOn && !zoomHold) zoomSay(k, t || zoomFallback(act, k, i));
  };
  const zoomOpen = () => {
    if (zoomOn || !pairIntimate(curPair)) return;
    zoomOn = true; zoomI = 0; pz.hidden = false; zoomSay("husband", zoomFallback(curPair, "husband", 0)); zoomI = 1;
    void zoomLine(); zoomT = setInterval(() => void zoomLine(), ZOOM.everyMs);
  };
  const zoomClose = () => { zoomOn = false; zoomHold = false; clearInterval(zoomT); pz.hidden = true; };
  pr.addEventListener("click", (e) => { e.stopPropagation(); zoomOpen(); });
  pz.addEventListener("click", (e) => { e.stopPropagation(); if (!zoomHold) zoomClose(); });
  if (base !== "park") stopPair = startPairLoop((f2) => {
    renderPair(); if (!pr.hidden) applyPairFrame(pr, f2);
    if (zoomOn && !pr.hidden) { if (zf1.getAttribute("src") !== pf1.getAttribute("src")) zf1.src = pf1.getAttribute("src") || ""; const b = pf2.getAttribute("src"); if (b) { if (zf2.getAttribute("src") !== b) zf2.src = b; } else zf2.removeAttribute("src"); applyPairFrame(pz, f2); }
  });

  // ---- 測試：接受度／醉度滑桿
  if (ctx.test && teaseOn && ctx.debugSliders) {   // 2026-10-24：測試時也不顯示（要看再傳 debugSliders）
    const dp = document.createElement("div"); dp.className = "dbgp";
    dp.innerHTML = `<b>測試</b><label>接受度 <input type="range" min="0" max="100" data-k="accept"> <span></span></label><label>她醉度 <input type="range" min="0" max="100" data-k="drunk"> <span></span></label><label>老婆醉度 <input type="range" min="0" max="100" data-k="wdrunk"> <span></span></label><button type="button" style="font-size:11px">重抽手牌</button>`;
    const sync = () => { for (const r of dp.querySelectorAll("input")) { const v = r.dataset.k === "accept" ? sess.accept : r.dataset.k === "drunk" ? sess.drunk.other : sess.drunk.wife; r.value = Math.round(v); r.nextElementSibling.textContent = Math.round(v); } };
    dp.addEventListener("input", (e) => { const r = e.target; const v = Number(r.value); if (r.dataset.k === "accept") sess.accept = v; else if (r.dataset.k === "drunk") sess.drunk.other = v; else sess.drunk.wife = v; sync(); renderNb(); if (!qn) renderHand(); save(); });
    dp.querySelector("button").addEventListener("click", () => { handCards = []; if (!qn) renderHand(); });
    ov.append(dp); sync(); setInterval(() => { if (!closed && document.activeElement?.closest?.(".dbgp") == null) sync(); }, 2000);
  }

  // ---- NPC 自己的互動（CD 滿）
  const seated = (a, b) => { const pair = [a, b].sort().join("-"); return sess.seat === "cross" ? ["husband-wife", "other-player"].includes(pair) : sess.seat && [sess.seat.split("-").sort().join("-")].includes(pair); };
  /** 碰觸／調情的動作：場景上限內；兩個女的之間永遠沒有（回 null＝改聊天）。 */
  const actOf = (type, k, tgt) => { if (FEMALE.has(k) && FEMALE.has(tgt)) return null; const a = ACTS[type].filter((x) => x.lv <= SCENE_CAP[base]); return a.length ? pick(a) : null; };
  const lastType = {};
  /** NPC↔NPC 聊天的題目（依誰對誰；兩個老婆只聊天：老手安撫新手）。 */
  const chatTask = (k, tgt) => {
    const nv = sess.nerves >= 0.6 ? "很緊張" : sess.nerves >= 0.3 ? "有點緊張" : "還算放得開", wd = DRUNK_ZH[dlv("wife")];
    if (k === "husband" && tgt === "wife") return `你湊過去跟${wn}（玩家的妻子）搭話：稱讚她、逗她笑或勸她喝一口，調皮但有分寸。`;
    if (k === "husband" && tgt === "other") return `你小聲推你老婆${w.name}去陪那位宅男丈夫（玩家），例如「老婆，去陪陪他啊」。`;
    if (k === "other" && tgt === "wife") return `你是有經驗的人妻，小聲安撫第一次來、${nv}的${wn}（玩家的妻子）：問她是不是第一次、緊不緊張、結婚多久，聊聊彼此的老公，暗示「放輕鬆，很好玩的」。只聊天，不要碰她。`;
    if (k === "other" && tgt === "husband") return `你小聲跟你老公${h.name}說一句（例如偷偷評論那位宅男丈夫）。`;
    if (k === "wife" && tgt === "other") return `你小聲跟${w.name}（對方的妻子，看起來很有經驗）聊一句：害羞緊張地回答她或問她（例如你們常這樣嗎）。你現在${nv}、${wd}，越醉越放得開。只聊天。`;
    if (k === "wife" && tgt === "husband") return `你回應${h.name}（對方的丈夫）的搭話，${nv}，${wd}；醉度越高越願意跟他多聊。`;
    return `你小聲跟${name[tgt]}聊一句。`;
  };
  /** 醉了去廁所吐：你老婆去 → 對方丈夫可能跟去；對方妻子去 → 你可以按「跟去廁所」。 */
  const goVomit = (k) => {
    const until = Date.now() + DRUNK.vomitSec * 1000;
    absent[k] = { why: "去廁所吐了", until }; dbg(`${name[k]} 去廁所吐了`);
    const who = vomitChance(sess, k, scene);
    if (who === "husband" && !isAway("husband")) {
      absent.husband = { why: "跟去廁所", until: until + DRUNK.vomitSec * 500 };
      absent.wife = { why: "在廁所……", until: until + DRUNK.vomitSec * 500 };
      log.push(`（${h.name}說要去看看${wn}，也跟進了廁所……）`); bumpWifeAcc(4, "廁所趁機");
      if (!speaking) tx.textContent = `（${h.name}說要去看看${wn}，也跟進了廁所……）`;
    }
    if (who === "player" && !speaking) tx.textContent = `（${name.other}搖搖晃晃地去廁所了——要跟去嗎？）`;
    renderNb(); renderAdvanceBtn();
  };
  const npcAct = async (k, force) => {
    if (closed || isAway(k)) return;
    if (dlv(k) === "wasted" && !force) {   // 爛醉：睡著／去吐
      const r = Math.random();
      if (r < DRUNK.wastedSleep) { absent[k] = { why: "睡著了", until: Infinity }; dbg(`${name[k]} 醉倒睡著了`); status[k] = ""; checkEnd(); return; }
      if (r < DRUNK.wastedSleep + DRUNK.wastedVomit) { goVomit(k); return; }
    }
    if (scene === "bar" && dlv(k) === "drunk" && !force && Math.random() < BAR_VOMIT_DRUNK) { goVomit(k); return; }
    // 第 2 段：對方丈夫會自己提議換妻／去旅館
    if (k === "husband" && !force && STG === 2 && !qn && Date.now() - lastProp > PROPOSE_GAP_MS) {
      const it = husbandIntent(sess, scene);
      if (it === "swap") { void queue(() => runSwap("husband")); return; }
      if (it === "hotel") {
        lastProp = Date.now();
        void queue(async () => {
          busyUI(); await show(["husband"]);
          await line("husband", await say1("husband", "你提議大家一起換到旅館去。語氣照你的個性。", "（看了看錶，壞笑）時間不早了……我們換個地方，去旅館吧？"), { to: "all" });
          sess.move.husband = true; urgeMove(sess, "wife", scene); urgeMove(sess, "other", scene); renderNb(); save(); checkReady();
        });
        return;
      }
    }
    // 酒吧：換了伴的對方丈夫，偶爾把你老婆帶去廁所
    if (k === "husband" && !force && scene === "bar" && wifeSwapped(sess) && !isAway("wife") && Math.random() < HUSBAND_TOILET_P) {
      const until = Date.now() + DRUNK.vomitSec * 1500;
      absent.wife = { why: `被${h.name}帶去廁所`, until }; absent.husband = { why: "跟去廁所", until };
      log.push(`（${h.name}牽著${wn}往廁所走去……）`); status.wife = ""; bumpWifeAcc(3, "廁所");
      if (!speaking) tx.textContent = `（${h.name}牽著${wn}往廁所走去……）`;
      dbg(`${h.name} 帶 ${wn} 去廁所`); renderNb(); return;
    }
    // 2026-10-24：每個人都能提議換地方（自己想走時）
    if (!force && !qn && npcProposeMove(sess, k, scene)) {
      void queue(async () => {
        busyUI(); await show([k]);
        await line(k, await say1(k, "你想換個地方了，向大家提議離開這裡去下一個地方。一句。", k === "husband" ? "（伸個懶腰）這裡差不多了吧？我們換個地方！" : "（拉拉衣角，小聲）……要不要換個地方？"), { to: "all" });
        urgeMove(sess, "all", scene); sess.move[k] = true; renderNb(); save(); checkReady();
      });
      return;
    }
    let ch = force?.type ? { target: force.target, type: force.type } : chooseAction(k, { progress: sess.progress, drunk: sess.drunk, last: lastType, away: (x) => isAway(x) || isBusy(x), seated });
    if (!ch) return;   // 老婆這輪不主動
    let { type } = ch, tgt = ch.target;
    if (FEMALE.has(k) && FEMALE.has(tgt) && type !== "chat") type = "chat";   // 保險：兩個老婆之間只聊天
    lastType[k] = type;
    dbg(`${name[k]}（${phaseOf(sess.progress).zh}）→ ${tgt === "all" ? "大家" : name[tgt]}：${type}`);
    if (tgt === "all") {   // 對方丈夫帶氣氛：對大家開話題／敬酒，大家各喝一杯
      if (qn && !force) tgt = "wife";
      else {
        await queue(async () => {
          busyUI(); await show([k]);
          const ln = await say1(k, "你帶氣氛：對大家（玩家、他的妻子、你的妻子）開一個輕鬆的話題，或舉杯敬大家、勸大家多喝一點。", pick(["（舉起酒杯）來來來，為今晚認識大家乾一杯！", "（拍拍手）光喝酒太無聊了，我們來聊聊各自是怎麼追到老婆的？", "（替大家倒滿）別客氣，今晚我請，喝！"]));
          status[k] = "帶氣氛：敬大家"; renderNb();
          await line(k, ln, { to: "all" });
          for (const x of ["player", ...NPCS]) if (!isAway(x)) drink(x);
          prog(NPC_PROG.chat, "對方丈夫帶氣氛"); save();
        });
        return;
      }
    }
    if (tgt === "player" && qn && !force) return;   // 你那邊正忙：這輪先不找你（不要亂改對象）
    if (!tgt) return;
    if (tgt !== "player" && isBusy(tgt) && !force) return;   // 對方正在互動：不能打斷
    if ((type === "touch" || type === "lewd") && !(PAIR_ALLOW[k]?.[tgt] || []).includes(type)) type = "chat";
    const act = type === "touch" || type === "lewd" ? (force?.act ? { zh: force.act } : actOf(type, k, tgt)) : null;
    if ((type === "touch" || type === "lewd") && !act) type = "chat";
    if (tgt === "player") {
      await queue(() => withPlayer([k], async () => {
        busyUI();
        await show([k]);
        if (type === "silence") { const t = pick(SILENCE).replace("{a}", name[k]).replace("{b}", "你"); log.push(t); await say("", t); return; }
        const task = type === "chat" ? "你主動找玩家聊一句（問他問題或開玩笑）。" : `你對玩家做了「${act.zh}」，一邊做一邊說一句。`;
        const ln = await say1(k, task, pick(FB[type][k]));
        status[k] = type === "chat" ? "跟你聊天" : `→ 你：${act.zh}`; renderNb();
        await line(k, ln, { to: "player" });
        if (type === "touch" || type === "lewd") await respond(k, act);
      }));
      return;
    }
    // NPC ↔ NPC：只寫在名字列，點名字看。兩人鎖 10 秒（含等 AI 的時間），結束才開始 CD
    const t0 = Date.now();
    engage([k, tgt], t0 + NPC_INTER_MS + 30000);   // 保險：AI 卡住也會自己放開
    let lines = [];
    if (type === "silence") lines = [pick(SILENCE).replace("{a}", name[k]).replace("{b}", name[tgt])];
    else {
      const l1 = await say1(k, type === "chat" ? chatTask(k, tgt) : `你對${name[tgt]}做了「${act.zh}」，小聲說一句。`, pick(FB[type === "chat" ? "chat" : type][k]));
      lines = [`${name[k]}：${l1}`]; dbg(`訊息 target=${tgt} speaker=${k} label=${name[k]}（NPC↔NPC，名字列）`);
      let okP = 0.7;
      if (tgt === "wife" && k === "husband" && consentFree(sess, "wife")) okP = 1;   // 換了＝同意
      else if (tgt === "wife" && k === "husband") okP = WIFE_ACCEPT.base + sess.open * WIFE_ACCEPT.open + sess.nerves * WIFE_ACCEPT.nerves + (seated("husband", "wife") ? WIFE_ACCEPT.seat : 0);
      okP = 1 - (1 - clamp(okP, 0.05, 0.95)) * (DRUNK.pushCut[dlv(tgt)] || 1);
      const ok = type === "chat" || Math.random() < okP;
      if (act) lines.push(ok ? `（${name[tgt]}沒有推開）` : `（${name[tgt]}推開了${k === "husband" ? "他" : "她"}的手）`);
      if (ok) {
        prog(NPC_PROG[type], `${name[k]}→${name[tgt]}`);
        if (k === "husband" && tgt === "wife" && type !== "chat") bumpWifeAcc(type === "lewd" ? 4 : 2, `${h.name}→${wn}：${act?.zh || type}`);
      }
    }
    if (act && /^（/.test(lines[0]) === false && Math.random() < 0.5) lines.unshift(`（你看見${name[k]}${act.zh === "搭肩" ? "的手搭上了" + name[tgt] + "的肩" : `對${name[tgt]}${act.zh}`}）`);
    const label = type === "silence" ? "沉默" : type === "chat" ? "聊天" : act.zh;
    status[k] = `→ ${tgt === "wife" ? "老婆" : WHO_ZH[tgt]}：${label}`; status[tgt] = `← ${k === "wife" ? "老婆" : WHO_ZH[k]}：${label}`;
    inter[k] = inter[tgt] = { a: k, b: tgt, lines, at: Date.now() };
    { const until = Math.max(Date.now() + 1500, t0 + NPC_INTER_MS); for (const x of [k, tgt]) if (busy[x]) busy[x].until = until; }
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
      const why = absent.player ? "你醉倒了" : absent.wife?.until === Infinity ? `${wn}醉得睡著了` : "大家都醉倒了";
      showEnding({ kind: "end", title: "提早結束", line: `${why}，今晚提早結束了。` }); dbg(`提早結束：${why}`);
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
    if (chatting && STG < 3) {   // 換地方旗號：每人各自隨機時間重擲
      let ch = false;
      for (const k of NPCS) { moveT[k] -= dt; if (moveT[k] <= 0) { moveT[k] = rnd(...MOVE.rerollSec); const o = sess.move[k]; if (rollMove(sess, k, scene) !== o) ch = true; } }
      if (ch) { save(); checkReady(); }
      autoGo();
    }
    if (toiletOn && absent.other) absent.other.until = Date.now() + 5000;   // 你們在廁所：她不會自己回座
    if (chatting) {
      const slow = speaking || typing() ? CD.slow : 1;
      for (const k of NPCS) {
        if (busy[k] && !isBusy(k)) release([k]);   // NPC↔NPC 10 秒到了：放開，CD 從 0 開始
        if (isAway(k) || isBusy(k) || (k !== "other" && pairIntimate(curPair))) continue;      // 互動中（含你老婆×對方丈夫親熱中）不跑 CD
        const fast = (CD.fastAt.find(([lv]) => sess.drunk[k] >= lv) || [0, 1])[1];
        cd[k].t += dt * slow;
        if (cd[k].t >= Math.max(CD.min, cd[k].len * fast)) { cd[k].t = 0; cd[k].len = rnd(...cdRange(k)); engage([k], Date.now() + 2000); void npcAct(k).finally(() => { if (busy[k] && busy[k].until !== Infinity && !busy[k].with.length) release([k]); }); }
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
    let wl = ""; if (wife && ctx.say) { try { wl = await ctx.say(wife, `（你們夫妻正在${SZ}跟另一對夫妻${h.name}和${w.name}換妻約會的開場。剛才：\n${log.slice(-4).join("\n")}\n輪到你向他們自我介紹。你現在${nv >= 0.6 ? "非常緊張" : nv >= 0.3 ? "有點緊張" : "還算放得開"}。用「（動作）台詞」格式只寫一句。）`, wfb); } catch { /* */ } }
    await line("wife", actLine(wl, wfb.match(/^（[^）]*）/)[0]) || wfb, { click: true });
    await show(["husband"]);
    await line("husband", await say1("husband", "大家都介紹完了。你幫大家點酒，然後丟出第一個輕鬆的話題（問問題），讓氣氛熱起來。", hf2), { click: true });
    for (const k of ["player", ...NPCS]) drink(k);
  };
  // 場景前進按鈕（公園／KTV／飯店浴室切換）
  const adv = document.createElement("div");
  adv.style.cssText = "position:absolute;z-index:4;left:6px;bottom:78px;display:flex;flex-direction:column;gap:4px";
  ov.append(adv);
  const mkBtn = (label, fn) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; b.style.cssText = "border:0;border-radius:10px;background:#c0508a;color:#fff;padding:6px 10px;font:600 12px system-ui,sans-serif"; b.addEventListener("click", () => { if (!qn && !advancing) void queue(fn); }); return b; };
  const renderAdvanceBtn = () => {
    adv.innerHTML = "";
    if (finished || advancing) return;
    if (STG < 3) {
      const tn = target === "all" ? "大家" : name[target];
      adv.append(mkBtn(`去下一個地方吧（${tn}）`, runUrge));
      if (allAgree(sess)) for (const nx of nextOptions(scene)) if (canMove(sess, scene, nx).ok) adv.append(mkBtn(`前往${SCENE_ZH[nx]}`, async () => { busyUI(); await go(nx); }));
    }
    if (STG === 2 && !(wifeSwapped(sess) && otherSwapped(sess))) adv.append(mkBtn("提議換妻", () => runSwap("player")));
    if (scene === "bar" && !toiletOn && (otherSwapped(sess) || (absent.other?.why === "去廁所吐了" && isAway("other")))) adv.append(mkBtn(otherSwapped(sess) && !isAway("other") ? "帶她去廁所" : "跟去廁所", async () => {
      toiletOn = true; absent.other = { why: "在廁所", until: Date.now() + 5000 };
      await say("", `（你跟著${name.other}進了廁所，把門鎖上……）`); handCards = []; renderAdvanceBtn(); renderNb();
    }));
    if (toiletOn) adv.append(mkBtn("回座位", async () => {
      toiletOn = false; absent.other = null; await say("", "（你們若無其事地回到座位）"); handCards = []; renderAdvanceBtn(); renderNb();
    }));
    if (scene === "hotel_room") adv.append(mkBtn("去浴室", async () => { busyUI(); await goNext("hotel_bath", "走進浴室"); }));
    if (scene === "hotel_bath") adv.append(mkBtn("回房間", async () => { busyUI(); await goNext("hotel_room", "回到房間"); }));
  };
  renderAdvanceBtn();
  nb.addEventListener("click", () => setTimeout(renderAdvanceBtn, 0));

  timer = setInterval(tick, 100);
  if (base === "hotel" && !watch) {
    absent.husband = { why: "在另一個房間", until: 8.64e15 };
    if (wifeSwapped(sess)) absent.wife = { why: "在另一個房間", until: 8.64e15 };
  }
  renderNb();
  // 自我介紹只在公園；酒吧／KTV／飯店跳過（測試跳場 ctx.noIntro 也跳過）
  const doIntro = scene === "park" && !ctx.noIntro;
  (doIntro ? intro() : Promise.resolve()).then(() => {
    if (closed) return;
    chatting = true; focus = []; stage.show([]); nm.textContent = SZ;
    tx.textContent = scene === "park" ? "（公園：互相認識、聊天、輕鬆逗一逗。每個人頭上會顯示想不想換地方，大家都想走就能選酒吧或 KTV）"
      : scene === "bar" ? "（酒吧：喝醉了座位上可以親；有人醉到去廁所時會有事發生。可以提議換妻，大家都想走且有人換了就去旅館）"
      : scene === "ktv" ? "（KTV 包廂：配了對就可以直接來。可以提議換妻，大家都想走且有人換了就去旅館）"
      : watch ? `（旅館：${wn}跟${name.other}都陪著${h.name}——你只能在旁邊看）`
      : "（旅館：右側顯示動作圖；房間↔浴室可以自由切換）";
    idleUI(); save();
  }).catch(() => {});
  const api = { el: ov, stage, sess, close, finish, force: (k, o) => npcAct(k, o || {}), drink, render: renderNb, scene, together, play: (id) => { const cx = [...TEASE_CARDS, ...DECK_PARK, ...DECK_BAR, ...DECK_KTV, ...DECK_HOTEL_ROOM, ...DECK_HOTEL_BATH].find((x) => x.id === id); return cx ? queue(() => playCard({ ...cx })) : null; }, get hand() { return handCards; }, get busy() { return qn; } };
  if (ctx.expose) window.__swapBar = api;
  return api;
}
