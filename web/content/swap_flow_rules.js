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
export function swapAgreeP(sess, k) {
  ensurePairs(sess);
  const acc = k === "wife" ? Number(sess.wifeAccept) || 0 : otherAccept(sess);
  const drunk = Number(sess.drunk?.[k]) || 0;
  let p = (Number(sess.swapWill[k]) || 0) + (acc - 30) * SWAP.perAccept + drunk * SWAP.perDrunk;
  if (k === "wife") p += (Number(sess.nerves) || 0) * SWAP.wifeNerves;
  return clamp(p, 0.03, 0.95);
}
/** 有人提議換妻（by＝"husband"|"player"）：兩位妻子意願上升，然後各自決定（已換的不再問）。
 *  回 { wife: true|false|null, other: true|false|null }（null＝之前就換了）。 */
export function proposeSwap(sess, by = "husband", rng = Math.random) {
  ensurePairs(sess);
  for (const k of ["wife", "other"]) sess.swapWill[k] = Math.min(SWAP.willCap, (Number(sess.swapWill[k]) || 0) + SWAP.proposeWill);
  const res = { by, wife: null, other: null };
  if (!wifeSwapped(sess)) { res.wife = rng() < swapAgreeP(sess, "wife"); if (res.wife) sess.pairs.wife = "husband"; }
  if (!otherSwapped(sess)) { res.other = rng() < swapAgreeP(sess, "other"); if (res.other) sess.pairs.other = "player"; }
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
  if (stageOf(scene) !== 2) return null;
  ensurePairs(sess);
  if (!(wifeSwapped(sess) && otherSwapped(sess)) && rng() < SWAP.husbandSwapP) return "swap";
  if (anySwapped(sess) && rng() < SWAP.husbandHotelP) return "hotel";
  return null;
}

// ---------------------------------------------------------------- 換地方判定
/** 現在能不能換到 next：全員同意；去旅館還要至少有人換了。回 { ok, why }。 */
export function canMove(sess, scene, next) {
  if (!nextOptions(scene).includes(next)) return { ok: false, why: "沒有這條路" };
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
export const TOILET_ACTS = new Set(["kiss", "breast", "breast_knead", "oral", "labia", "finger_in", "sex"]);
export function teaseWhere(card, { where = "bar", paired = false, drunk = 0, mode = "play" } = {}) {
  if (mode === "watch") return false;
  if (where === "park") return false;
  if (where === "bar") return SEAT_ACTS.has(card.act) && (paired || drunk >= 60);   // 座位：配對了或她喝醉才能親／摟
  if (where === "bar_toilet") return TOILET_ACTS.has(card.act);                     // 廁所：趁機
  if (where === "ktv") return paired && card.act !== "cervix_rub";                  // 包廂：配對後可以直接做
  if (String(where).startsWith("hotel")) return paired;
  return false;
}

/** 雙人圖：依場景要預產哪些 slot（PAIR_ACTS 的 scene 欄）。第 2 段＝KTV 那組＋廁所／包廂的交配。 */
export function pairSlotsFor(scene, PAIR_ACTS, PAIR_FRAMES) {
  const base = sceneBase(scene);
  if (!PAIR_ACTS || base === "park") return [];
  const keys = base === "hotel" ? ["normal", "behind"] : [...PAIR_ACTS.filter((a) => a.scene === "ktv").map((a) => a.key), base === "ktv" ? "normal" : "behind"];
  return PAIR_ACTS.filter((a) => keys.includes(a.key)).flatMap((a) => (PAIR_FRAMES?.[a.key] ? [`${a.key}~1`, `${a.key}~2`] : [a.key]));
}

export const END_FB = {
  other: ["（搖搖頭，退了一步）……這樣太超過了，我還是回去吧。"],
  wife: ["（緊緊抓住你的衣角，搖頭）……我不要跟他走，我們回家好不好？"],
  both: ["兩邊都搖了搖頭——今晚就到這裡吧。"],
  leave: ["今晚就到這裡，大家各自回家了。"],
  success: ["今晚的換妻約會結束了。"],
};
