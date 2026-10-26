/* 換妻約會流程規則（2026-10-24 重做）——純規則，沒有 DOM／fetch，node 可以直接測。
 * 三段：1) 公園：認識（散步、坐著聊、介紹、偶爾言語調戲；不喝酒；不會失敗）
 *       2) 酒吧 或 KTV（玩家選）：喝酒、遊戲、氣氛熱
 *       3) 旅館：做愛（房間＝正常位、浴室＝背後，可自由切換）
 * 換地方：每個 NPC（你老婆／對方丈夫／對方妻子）身上一個「想換地方」旗號，隨時間隨機重擲（受心情／接受度／醉度影響）；
 *   全員都同意才換。玩家可以慫恿大家，或單獨慫恿一個人（提高那個人同意的機率）。
 * 換妻：第 2 段起，對方丈夫會自己提議換妻或去旅館；玩家也可以向他提。提議換妻＝兩位妻子被換出去的意願上升。
 *   每位妻子各自決定（可以單邊成立）：你老婆同意 → 她跟對方丈夫；對方妻子不同意 → 你沒有伴，對方丈夫一個人兩個。
 * 旅館：第 2 段兩位妻子都同意換地方（＝全員旗號都是同意）而且至少有人換了 → 去旅館。
 *   你老婆已換出去但你沒有配到對方妻子 → 只能旁觀（watch）。
 * 舊的 30／50／70 門檻與酒吧 50 回合規則已拿掉；接受度／醉度只擋個別動作卡。 */

export const STAGE_OF = { park: 1, bar: 2, ktv: 2, hotel_room: 3, hotel_bath: 3 };
export const SCENE_ZH = {
  park: "夜晚公園", bar: "酒吧", ktv: "KTV 包廂",
  hotel_room: "旅館房間", hotel_bath: "旅館浴室", bar_toilet: "酒吧廁所",
};
export const NPCS = ["wife", "husband", "other"];
export const stageOf = (scene) => STAGE_OF[scene] || 1;
/** 場景 → 背景鍵（swap_cafe_gen.SWAP_SCENES）／碰觸上限大類。 */
export const sceneBase = (scene) => {
  const s = String(scene || "");
  if (s === "park") return "park";
  if (s === "ktv") return "ktv";
  if (s.startsWith("hotel")) return "hotel";
  return "bar";
};
export const backdropOf = (scene) => (scene === "hotel_bath" ? "bath" : sceneBase(scene) === "hotel" ? "hotel" : sceneBase(scene));

/** 下一個地方的選項：公園 → 酒吧／KTV；第 2 段 → 旅館；旅館沒有下一站（房間↔浴室另外切）。 */
export function nextOptions(scene) {
  const st = stageOf(scene);
  if (st === 1) return ["bar", "ktv"];
  if (st === 2) return ["hotel_room"];
  return [];
}

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

// ---------------------------------------------------------------- 接受度
/** 你老婆對對方丈夫的接受度 0–100。舊存檔沒有 → 從 open／nerves／aff.wife／progress 換算一次。 */
export function ensureWifeAccept(sess) {
  if (!sess || typeof sess !== "object") return 0;
  const n = Number(sess.wifeAccept);
  if (Number.isFinite(n)) { sess.wifeAccept = clamp(Math.round(n), 0, 100); return sess.wifeAccept; }
  const open = Number(sess.open) || 0, nerves = Number(sess.nerves) || 0;
  const affW = Number(sess.aff?.wife) || 0, prog = Number(sess.progress) || 0;
  sess.wifeAccept = clamp(Math.round(open * 45 + (1 - nerves) * 35 + clamp(affW, -5, 20) + prog * 0.15), 0, 100);
  return sess.wifeAccept;
}
function otherAccept(sess) {
  const n = Number(sess?.accept);
  return Number.isFinite(n) ? clamp(n, 0, 100) : 0;
}

// ---------------------------------------------------------------- 回合（只記數，不再當門檻）
export function ensureSceneRounds(sess, scene) {
  if (!sess || typeof sess !== "object") return 0;
  if (sess.phase !== scene) { sess.phase = scene; sess.rounds = 0; }
  sess.rounds = Number(sess.rounds) || 0;
  return sess.rounds;
}
export function bumpRound(sess, scene) {
  ensureSceneRounds(sess, scene);
  sess.rounds = (Number(sess.rounds) || 0) + 1;
  return sess.rounds;
}

// ---------------------------------------------------------------- 換地方旗號
export const MOVE = {
  base: { 1: 0.12, 2: 0.08, 3: 0 },   // 每次重擲的基本同意機率（依段）
  perRound: 0.012, roundCap: 0.3,     // 在這裡待越久越想換
  perAccept: 0.003,                   // 接受度每點（對方妻子／你老婆）
  perDrunk: 0.003,                    // 醉度每點（第 2 段才算）
  husband: { 1: 0.15, 2: 0.3 },       // 對方丈夫本來就想往下走
  urgeOne: 0.3, urgeAll: 0.15, urgeCap: 0.4, urgeDecay: 0.12,   // 慫恿加成；每次重擲衰退
  rerollSec: [8, 16],                 // 每個人多久重擲一次
  proposeP: 0.35,
  pMin: 0.05, pMax: 0.75,             // 2026-10-24：上限 0.75＝就算再想走，每次重擲也至少 25% 會變回「還想待」（以前上限 0.95＋慫恿疊到 0.6，旗號幾乎黏住）                     // 自己想走時，CD 輪到他有這個機率開口提議大家換地方
};
/** 舊 session 補欄位。 */
export function ensureMove(sess) {
  if (!sess || typeof sess !== "object") return null;
  // 原地補欄位（不要換掉物件：呼叫端常在 sess.move[k] = … 的右邊又呼叫到這裡）
  if (!sess.move || typeof sess.move !== "object") sess.move = {};
  if (!sess.urge || typeof sess.urge !== "object") sess.urge = {};
  for (const k of NPCS) { sess.move[k] = !!sess.move[k]; sess.urge[k] = Number(sess.urge[k]) || 0; }
  return sess.move;
}
/** k 這次重擲「想換地方」的機率。 */
export function moveP(sess, k, scene) {
  ensureMove(sess);
  const st = stageOf(scene);
  if (st >= 3) return 0;
  const rounds = Number(sess.rounds) || 0, drunk = Number(sess.drunk?.[k]) || 0;
  let p = MOVE.base[st] + Math.min(MOVE.roundCap, rounds * MOVE.perRound) + (Number(sess.urge[k]) || 0);
  if (k === "husband") p += MOVE.husband[st] || 0;
  if (k === "other") p += otherAccept(sess) * MOVE.perAccept;
  if (k === "wife") p += (Number(sess.wifeAccept) || 0) * MOVE.perAccept - (Number(sess.nerves) || 0) * 0.1;
  if (st === 2) p += drunk * MOVE.perDrunk;
  return clamp(p, MOVE.pMin, MOVE.pMax);
}
/** 重擲一個人的旗號（慫恿會衰退一點）。回新的旗號。 */
export function rollMove(sess, k, scene, rng = Math.random) {
  ensureMove(sess);
  sess.move[k] = rng() < moveP(sess, k, scene);
  sess.urge[k] = Math.max(0, (Number(sess.urge[k]) || 0) - MOVE.urgeDecay);
  return sess.move[k];
}
/** 玩家慫恿：who＝"all" 或某個人。慫恿完當下就幫被慫恿的人重擲一次。回 { k: 旗號 }。 */
export function urgeMove(sess, who, scene, rng = Math.random) {
  ensureMove(sess);
  const ks = who === "all" ? NPCS : [who];
  const add = who === "all" ? MOVE.urgeAll : MOVE.urgeOne, out = {};
  for (const k of ks) {
    sess.urge[k] = Math.min(MOVE.urgeCap, (Number(sess.urge[k]) || 0) + add);
    sess.move[k] = rng() < moveP(sess, k, scene);
    out[k] = sess.move[k];
  }
  return out;
}
/** NPC 自己提議換地方：要自己旗號是「想走」、不在旅館。成立就幫其他兩位慫恿（＝全體 +0.15 重擲）。 */
export function npcProposeMove(sess, k, scene, rng = Math.random) {
  ensureMove(sess);
  if (stageOf(scene) >= 3 || !sess.move[k] || allAgree(sess)) return false;
  return rng() < MOVE.proposeP;
}
/** 換妻＝同意色色：對方妻子跟你、或你老婆跟對方丈夫，配成對後就不再用接受度／醉度擋性卡（場景仍決定能做到哪）。 */
export const consentFree = (sess, k) => (k === "other" ? otherSwapped(sess) : k === "wife" ? wifeSwapped(sess) : false);
/** 全員都同意換地方。 */
export function allAgree(sess) {
  ensureMove(sess);
  return NPCS.every((k) => !!sess.move[k]);
}
/** 換地方之後：旗號、慫恿、回合歸零。 */
export function resetMove(sess) {
  sess.move = { wife: false, husband: false, other: false };
  sess.urge = { wife: 0, husband: 0, other: 0 };
  sess.rounds = 0;
}

// ---------------------------------------------------------------- 換妻（可以單邊）
export const SWAP = {
  proposeWill: 0.15,      // 每次有人提議換妻：兩位妻子的「願意被換出去」+
  willCap: 0.7,
  perAccept: 0.005,       // 接受度每點
  perDrunk: 0.004,        // 醉度每點
  wifeNerves: -0.25,      // 你老婆的緊張
  husbandSwapP: 0.6,      // 第 2 段，對方丈夫每次行動提議換妻的機率（還有人沒換時）——他很主動（2026-10-24 0.25→0.6）
  husbandHotelP: 0.2,     // 第 2 段，有人換了之後他提議去旅館的機率
};
/** sess.pairs：wife＝"player"|"husband"（你老婆跟誰）；other＝"husband"|"player"（對方妻子跟誰）。 */
export function ensurePairs(sess) {
  if (!sess || typeof sess !== "object") return null;
  if (!sess.pairs || typeof sess.pairs !== "object") sess.pairs = {};
  if (!sess.swapWill || typeof sess.swapWill !== "object") sess.swapWill = {};
  if (sess.pairs.wife !== "husband") sess.pairs.wife = "player";
  if (sess.pairs.other !== "player") sess.pairs.other = "husband";
  for (const k of ["wife", "other"]) sess.swapWill[k] = Number(sess.swapWill[k]) || 0;
  return sess.pairs;
}
export const wifeSwapped = (sess) => ensurePairs(sess).wife === "husband";
export const otherSwapped = (sess) => ensurePairs(sess).other === "player";
export const anySwapped = (sess) => wifeSwapped(sess) || otherSwapped(sess);
/** 這位妻子同意被換出去的機率。k＝"wife"|"other"。 */
export function swapAgreeP(sess, k, scene) {
  ensurePairs(sess);
  const acc = k === "wife" ? Number(sess.wifeAccept) || 0 : otherAccept(sess);
  const drunk = stageOf(scene) === 1 ? 0 : Number(sess.drunk?.[k]) || 0;   // 公園沒有醉度，只看接受度
  let p = (Number(sess.swapWill[k]) || 0) + (acc - 30) * SWAP.perAccept + drunk * SWAP.perDrunk;
  if (k === "wife") p += (Number(sess.nerves) || 0) * SWAP.wifeNerves;
  return clamp(p, 0.03, 0.95);
}
/** 有人提議換妻（by＝"husband"|"player"）：兩位妻子意願上升，然後各自決定（已換的不再問）。
 *  回 { wife: true|false|null, other: true|false|null }（null＝之前就換了）。 */
export function proposeSwap(sess, by = "husband", rng = Math.random, scene) {
  ensurePairs(sess);
  for (const k of ["wife", "other"]) sess.swapWill[k] = Math.min(SWAP.willCap, (Number(sess.swapWill[k]) || 0) + SWAP.proposeWill);
  const res = { by, wife: null, other: null };
  if (!wifeSwapped(sess)) { res.wife = rng() < swapAgreeP(sess, "wife", scene); if (res.wife) sess.pairs.wife = "husband"; }
  if (!otherSwapped(sess)) { res.other = rng() < swapAgreeP(sess, "other", scene); if (res.other) sess.pairs.other = "player"; }
  return res;
}
/** 狀態列分組：同一組排在一起。color：green＝你們夫妻、blue＝對方夫妻（依「人」本來屬於哪對）。
 *  回 [[k,...], ...]，k 可為 player／wife／husband／other。 */
export const HOME = { player: "green", wife: "green", husband: "blue", other: "blue" };
export function pairGroups(sess) {
  ensurePairs(sess);
  const h = ["husband"], p = ["player"];
  (sess.pairs.wife === "husband" ? h : p).push("wife");
  (sess.pairs.other === "player" ? p : h).push("other");
  return [p, h];
}
/** 對方丈夫自己（第 2 段）要不要提議什麼：回 "swap"|"hotel"|null。 */
export function husbandIntent(sess, scene, rng = Math.random) {
  const st = stageOf(scene);
  if (st !== 1 && st !== 2) return null;
  ensurePairs(sess);
  if (st === 1) {   // 公園：兩位妻子都換了 → 對方丈夫提議移動（地點他決定）；不然偶爾提議換妻
    if (parkReady(sess)) return "move";
    return rng() < SWAP.husbandSwapP ? "swap" : null;
  }
  if (!(wifeSwapped(sess) && otherSwapped(sess)) && rng() < SWAP.husbandSwapP) return "swap";
  if (anySwapped(sess) && rng() < SWAP.husbandHotelP) return "hotel";
  return null;
}

/** 公園過關：兩位妻子都答應互換。 */
export const parkReady = (sess) => wifeSwapped(sess) && otherSwapped(sess);
/** 公園之後去哪：對方丈夫決定（"bar"|"ktv"）。接受度高的話比較想去 KTV 包廂。 */
export function husbandPickNext(sess, rng = Math.random) {
  const acc = ((Number(sess?.wifeAccept) || 0) + otherAccept(sess || {})) / 2;
  return rng() < clamp(0.35 + (acc - 30) * 0.004, 0.2, 0.8) ? "ktv" : "bar";
}

// ---------------------------------------------------------------- 換地方判定
/** 現在能不能換到 next：全員同意；去旅館還要至少有人換了。回 { ok, why }。 */
export function canMove(sess, scene, next) {
  if (!nextOptions(scene).includes(next)) return { ok: false, why: "沒有這條路" };
  // 2026-10-25：公園＝決定互換成不成功。兩位妻子都換了就能走（不看換地方旗號），地點由對方丈夫決定
  if (stageOf(scene) === 1) return parkReady(sess) ? { ok: true, why: "" } : { ok: false, why: "兩位妻子都答應互換才能換地方" };
  if (!allAgree(sess)) {
    const no = NPCS.filter((k) => !sess.move[k]);
    return { ok: false, why: "還有人不想走", no };
  }
  if (next === "hotel_room" && !anySwapped(sess)) return { ok: false, why: "還沒有人換伴，去旅館也只是各自回房" };
  return { ok: true, why: "" };
}
/** 旅館模式：你配到對方妻子＝play；你老婆換出去而你沒伴＝watch（只能看）；都沒換＝none。 */
export function hotelMode(sess) {
  if (otherSwapped(sess)) return "play";
  if (wifeSwapped(sess)) return "watch";
  return "none";
}

// ---------------------------------------------------------------- 酒吧廁所趁機／KTV 包廂
/** 醉到去吐：酒吧裡，k 去吐時誰會跟過去趁機。回 "husband"|"player"|null。
 *  你老婆去吐 → 對方丈夫可能跟去；對方妻子去吐 → 玩家可以選擇跟去（回 player＝給玩家一個按鈕）。 */
export function vomitChance(sess, k, scene, rng = Math.random) {
  if (scene !== "bar") return null;
  if (k === "wife") {
    const p = 0.35 + (Number(sess.wifeAccept) || 0) * 0.004 + (wifeSwapped(sess) ? 0.3 : 0);
    return rng() < clamp(p, 0, 0.9) ? "husband" : null;
  }
  if (k === "other") return "player";
  return null;
}
/** 玩家的動作卡在這裡能不能出（場景＋配對＋她在不在廁所）。
 *  where：bar（座位）／bar_toilet／ktv／hotel_room／hotel_bath；paired＝對方妻子是不是你的伴；
 *  drunk＝她醉度。回 true／false。 */
export const SEAT_ACTS = new Set(["kiss", "waist"]);
// 2026-10-25 Al：酒吧＝醉度階梯（越醉能做越多；不能脫衣）。座位：摟腰 ≥30、親 ≥50（配對了也一樣要醉）；帶去廁所（做愛）≥75。
export const BAR_LADDER = { waist: 30, kiss: 50, toilet: 75 };
export const barSeatOk = (act, drunk = 0) => act === "waist" ? drunk >= BAR_LADDER.waist : act === "kiss" ? drunk >= BAR_LADDER.kiss : false;
export const barToiletOk = (drunk = 0) => drunk >= BAR_LADDER.toilet;
/** 酒吧雙人圖（你老婆×對方丈夫）：看她的醉度。沒換又沒醉＝沒有；換了＝聊天；≥50＝座位親；廁所＝背後（廁所本身要 ≥75 才去得了）。 */
export function barPairAct({ drunk = 0, swapped = false, toilet = false } = {}) {
  if (toilet) return "behind";
  if (!swapped && drunk < BAR_LADDER.kiss) return "";
  return drunk >= BAR_LADDER.kiss ? "kiss" : "chat";
}
// 2026-10-25 Al：KTV 換妻後＝接受度階梯（她對他的 ktvAcc，靠兩人互動慢慢升），最高只到口交、不交配。
export const KTV_LADDER = [["chat", 0], ["kiss", 25], ["grope", 45], ["fellatio", 70]];
export const KTV_STRIP_AT = 45;   // 到這裡他叫她脫到剩內衣（KTV 只有兩段：穿著／內衣）
export const KTV_ACC = { chat: 3, touch: 5, lewd: 6, max: 100, afterClimax: 35 };   // 射了＝這段結束，接受度掉回去重新慢慢來
export const KTV_ACTS = new Set(["kiss", "waist", "butt", "breast", "breast_knead", "breast_suck", "nipple_lick", "oral", "strip1"]);
export function ktvPairAct({ acc = 0, swapped = false } = {}) {
  if (!swapped) return "";
  let a = ""; for (const [k, v] of KTV_LADDER) if (acc >= v) a = k; return a;
}
export const ktvAccGain = (type) => KTV_ACC[type] || 0;
export const TOILET_ACTS = new Set(["kiss", "breast", "breast_knead", "oral", "labia", "finger_in", "sex"]);
export function teaseWhere(card, { where = "bar", paired = false, drunk = 0, mode = "play" } = {}) {
  if (mode === "watch") return false;
  if (where === "park") return false;
  if (where === "bar") return SEAT_ACTS.has(card.act) && barSeatOk(card.act, drunk) && (paired || drunk >= BAR_LADDER.kiss);   // 座位：照醉度階梯
  if (where === "bar_toilet") return TOILET_ACTS.has(card.act) && barToiletOk(drunk);                                        // 廁所：她要夠醉
  if (where === "ktv") return paired && KTV_ACTS.has(card.act);                     // 包廂：最多到口交，不交配
  if (String(where).startsWith("hotel")) return paired;
  return false;
}

/** 雙人圖：依場景要預產哪些 slot（PAIR_ACTS 的 scene 欄）。第 2 段＝KTV 那組＋廁所／包廂的交配。 */
/** 2026-10-26 Al（pt281u）：旅館雙人圖＝交配兩組＋三組新圖，交互輪播；依地點偏好、但也會跨組。 */
export const HOTEL_PAIR_KEYS = ["normal", "behind", "room_kiss", "bath_kiss", "afterglow"];
export const HOTEL_PAIR_ROT = {
  hotel_room: ["room_kiss", "normal", "afterglow", "room_kiss", "behind", "bath_kiss"],
  hotel_bath: ["bath_kiss", "behind", "bath_kiss", "normal", "afterglow", "room_kiss"],
};
export const HOTEL_PAIR_MS = 25000;
/** 第 i 段（時間切段）該放哪組；has(key) 可篩掉還沒生好的。 */
export function hotelPairAct(loc, i = 0, has = null) {
  const l = HOTEL_PAIR_ROT[loc === "hotel_bath" ? "hotel_bath" : "hotel_room"], n = l.length;
  for (let k = 0; k < n; k++) { const a = l[(((i + k) % n) + n) % n]; if (!has || has(a)) return a; }
  return l[((i % n) + n) % n];
}
export function pairSlotsFor(scene, PAIR_ACTS, PAIR_FRAMES, PAIR_EJAC = null) {
  const base = sceneBase(scene);
  if (!PAIR_ACTS || base === "park") return [];
  const keys = base === "hotel" ? HOTEL_PAIR_KEYS : [...PAIR_ACTS.filter((a) => a.scene === "ktv").map((a) => a.key), ...(base === "ktv" ? [] : ["behind"])]   // 2026-10-25：KTV 不交配;
  // pt263u：他會射的動作再加一張射精圖 ~3（KTV 只有口交會射）
  return PAIR_ACTS.filter((a) => keys.includes(a.key)).flatMap((a) => [...(PAIR_FRAMES?.[a.key] ? [`${a.key}~1`, `${a.key}~2`] : [a.key]), ...(PAIR_EJAC?.[a.key] && ejacActOk(a.key, base) ? [`${a.key}~3`] : [])]);
}

export const END_FB = {
  other: ["（搖搖頭，退了一步）……這樣太超過了，我還是回去吧。"],
  wife: ["（緊緊抓住你的衣角，搖頭）……我不要跟他走，我們回家好不好？"],
  both: ["兩邊都搖了搖頭——今晚就到這裡吧。"],
  leave: ["今晚就到這裡，大家各自回家了。"],
  success: ["今晚的換妻約會結束了。"],
};

// ---------------------------------------------------------------- 測試捷徑的起始狀態（2026-10-24）
/** test_room「從酒吧／KTV／旅館開始」：選完夫妻後合併進 session 的欄位。
 *  酒吧／KTV＝第 2 段剛開始（已聊過幾輪、微醺、旗號全 false 等重擲／提議）；
 *  旅館＝第 3 段：hotel="play"→兩邊都換了（你跟對方妻子）；"watch"→只有你老婆跟對方丈夫，你只能看。 */
export function testStartState(scene, { hotel = "play" } = {}) {
  const base = String(scene || "").startsWith("hotel") ? "hotel" : scene;
  if (base === "bar" || base === "ktv") return {
    rounds: 4, accept: 35, wifeAccept: 30, progress: 10, open: 0.2,
    drunk: { player: 15, wife: 25, husband: 30, other: 30 },
    move: { wife: false, husband: false, other: false }, urge: { wife: 0, husband: 0, other: 0 },
    pairs: { wife: "player", other: "husband" },
  };
  if (base === "hotel") {
    const watch = hotel === "watch";
    return {
      rounds: 0, accept: watch ? 40 : 70, wifeAccept: 70, progress: 30, open: 0.6,
      drunk: { player: 30, wife: 45, husband: 40, other: 45 },
      move: { wife: false, husband: false, other: false }, urge: { wife: 0, husband: 0, other: 0 },
      pairs: { wife: "husband", other: watch ? "husband" : "player" },
    };
  }
  return {};
}

// ---------------------------------------------------------------- 另一對（你老婆×對方丈夫）在親熱／射精（2026-10-24）
/** 雙人動作：chat 以外都算「親熱中」＝玩家不能跟他們兩個對話／互動、他們不跑 CD。 */
export const PAIR_INTIMATE = new Set(["kiss", "grope", "fellatio", "cunni", "normal", "behind", "seated", "room_kiss", "bath_kiss", "afterglow"]);
/** 對方丈夫會射的動作（口交、交配）。 */
export const PAIR_EJAC_ACTS = new Set(["fellatio", "normal", "behind", "seated"]);
/** KTV 只有口交會射（不交配）。 */
export const ejacActOk = (act, base) => (base === "ktv" ? act === "fellatio" : PAIR_EJAC_ACTS.has(String(act || "")));
export const EJAC = { everySec: 5, p: 0.2, restSec: 60 };
export const pairIntimate = (a) => PAIR_INTIMATE.has(String(a || ""));
/** 每 5 秒判一次；回 true＝射了。 */
export function rollEjac(act, rng = Math.random) { return PAIR_EJAC_ACTS.has(String(act || "")) && rng() < EJAC.p; }
/** 玩家動作卡要按幾次「下一句」才完成：口交三句，其他一句。 */
export const teaseSteps = (act) => (act === "oral" ? 3 : 1);

/** 2026-10-24：點雙人圖放大＝看他們親熱，對話框每幾秒換一句（AI，失敗用這些）。輪流：丈夫、妻子。 */
export const ZOOM = { everyMs: 3500 };
/** 2026-10-26 Al（pt281u）：點妻子雙人＝主要是做愛的聲音，少說話、無旁白、不叫 AI。 */
export const PAIR_SFX_MS = 4500;
export const SEX_SFX = {
  husband: {
    soft: ["嗯……", "（呼吸變重）", "……啾。", "哈……"],
    hard: ["哈……哈……", "嗯……！", "呼……呼……", "哈啊……", "嗯……嗯……"],
  },
  wife: {
    soft: ["嗯……♡", "啾……嗯……", "……哈……♡", "嗯嗯……"],
    hard: ["啊……啊……♡", "嗯啊……♡", "哈啊……哈……", "啊、啊……！", "嗯……嗯……♡", "……♡♡"],
  },
};
export const SEX_SFX_SOFT = new Set(["chat", "kiss", "room_kiss", "bath_kiss", "afterglow"]);
export const sexSfx = (act, who, i = 0) => { const l = SEX_SFX[who === "wife" ? "wife" : "husband"][SEX_SFX_SOFT.has(String(act || "")) ? "soft" : "hard"]; return l[((i % l.length) + l.length) % l.length]; };
export const ZOOM_FB = {
  husband: {
    soft: ["（貼著她耳邊）妳好香……", "（摟緊她的腰）別躲嘛，讓我好好親親妳。", "（指尖撫過她的臉）妳老公真捨得……"],
    hard: ["（喘著粗氣）哈……好緊……", "（扣住她的腰往裡頂）叫出來，沒關係……", "（低吼）妳裡面……好舒服……", "（揉著她的頭髮）對……就是這樣……"],
  },
  wife: {
    soft: ["（臉紅到耳根）……嗯……不要在這裡啦……", "（輕輕回吻）……你好壞……", "（小聲喘著）……會被看到的……"],
    hard: ["（咬著唇）嗯……啊……♡", "（抓緊他的手臂）哈……哈……太、太深了……", "（斷斷續續地）不行了……嗯啊……♡", "（喘息）……再、再慢一點……"],
  },
};
export const zoomFallback = (act, who, i = 0) => { const l = ZOOM_FB[who === "wife" ? "wife" : "husband"][PAIR_EJAC_ACTS.has(String(act || "")) ? "hard" : "soft"]; return l[((i % l.length) + l.length) % l.length]; };
