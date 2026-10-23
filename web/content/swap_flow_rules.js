/* 換妻約會流程規則（2026-10-23）——純規則，沒有 DOM／fetch，node 可以直接測。
 * 順序：公園 → 酒吧 → 配對 → KTV → 飯店（房間／浴室）。
 * 雙門檻（兩邊都要過）：對方妻子對你的接受度 sess.accept、你老婆對對方丈夫的接受度 sess.wifeAccept。
 *   酒吧結束／進 KTV：兩邊 ≥ 30
 *   KTV 結束／進飯店：兩邊 ≥ 50
 *   飯店做愛：兩邊 ≥ 70（進飯店本身＝H 的門在 50；真正開做是 70）
 * 公園永不失敗。酒吧回合＝玩家出牌或聊天一次；滿 50 回合對方丈夫提議換伴。
 * KTV：滿 30 回合可前往飯店（也可按「前往飯店」）；按離開＝提前結束。 */

export const FLOW = ["park", "bar", "ktv", "hotel_room"];
export const SCENE_NEXT = { park: "bar", bar: "ktv", ktv: "hotel_room", hotel_room: null, hotel_bath: null };
export const SCENE_ZH = {
  park: "夜晚公園", bar: "酒吧", ktv: "KTV 包廂",
  hotel_room: "飯店房間", hotel_bath: "飯店浴室", pairing: "配對",
};
/** 場景 → 背景鍵（swap_cafe_gen.SWAP_SCENES）／碰觸上限大類。 */
export const sceneBase = (scene) => {
  const s = String(scene || "");
  if (s === "park") return "park";
  if (s === "ktv") return "ktv";
  if (s.startsWith("hotel")) return "hotel";
  return "bar";
};
export const backdropOf = (scene) => (scene === "hotel_bath" ? "bath" : sceneBase(scene) === "hotel" ? "hotel" : sceneBase(scene));

/** 門檻：兩邊都要 ≥ threshold。 */
export const GATES = {
  bar: 30,          // 酒吧結束 → 配對／KTV
  ktv: 50,          // KTV 結束 → 飯店
  sex: 70,          // 飯店開做
};
export const ROUNDS = {
  park: 15,         // 公園：出牌／聊天滿這數（或按「前往酒吧」）→ 永遠進酒吧
  bar: 50,          // 酒吧：滿這數 → 對方丈夫提議
  ktv: 30,          // KTV：滿這數提示可去飯店
};

const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

/** 你老婆對對方丈夫的接受度 0–100。舊存檔沒有 → 從 open／nerves／aff.wife／progress 換算一次。 */
export function ensureWifeAccept(sess) {
  if (!sess || typeof sess !== "object") return 0;
  const n = Number(sess.wifeAccept);
  if (Number.isFinite(n)) { sess.wifeAccept = clamp(Math.round(n), 0, 100); return sess.wifeAccept; }
  const open = Number(sess.open) || 0;
  const nerves = Number(sess.nerves) || 0;
  const affW = Number(sess.aff?.wife) || 0;
  const prog = Number(sess.progress) || 0;
  sess.wifeAccept = clamp(Math.round(open * 45 + (1 - nerves) * 35 + clamp(affW, -5, 20) + prog * 0.15), 0, 100);
  return sess.wifeAccept;
}

/** 讀兩邊接受度（會 ensure）。回 { other, wife }。 */
export function bothAccept(sess) {
  const { ensureAccept } = needsAccept();
  return { other: ensureAccept(sess), wife: ensureWifeAccept(sess) };
}
// ensureAccept 在 tease_rules；這裡延遲載入避免循環。測試時可注入。
let _ensureAccept = null;
function needsAccept() {
  if (_ensureAccept) return { ensureAccept: _ensureAccept };
  // 同步 fallback：跟 tease_rules 同一公式
  const ensureAccept = (sess) => {
    if (!sess || typeof sess !== "object") return 0;
    const n = Number(sess.accept);
    if (Number.isFinite(n)) { sess.accept = clamp(Math.round(n), 0, 100); return sess.accept; }
    const aff = Number(sess.aff?.other) || 0, prog = Number(sess.progress) || 0;
    sess.accept = clamp(Math.round(aff * 5 + prog * 0.3), 0, 100);
    return sess.accept;
  };
  return { ensureAccept };
}
/** 測試／整合時注入 tease_rules.ensureAccept。 */
export function setEnsureAccept(fn) { _ensureAccept = fn; }

/**
 * 雙門檻檢查。gateKey = "bar"|"ktv"|"sex"。
 * 回 { ok, need, other, wife, fail: null|"other"|"wife"|"both", whoZh }。
 */
export function gateCheck(sess, gateKey, { otherName = "對方妻子", wifeName = "你老婆" } = {}) {
  const need = GATES[gateKey];
  if (need == null) return { ok: true, need: 0, other: 0, wife: 0, fail: null, whoZh: "" };
  const { other, wife } = bothAccept(sess);
  const oOk = other >= need, wOk = wife >= need;
  let fail = null;
  if (!oOk && !wOk) fail = "both";
  else if (!oOk) fail = "other";
  else if (!wOk) fail = "wife";
  const whoZh = fail === "both" ? `${otherName}和${wifeName}` : fail === "other" ? otherName : fail === "wife" ? wifeName : "";
  return { ok: !fail, need, other, wife, fail, whoZh };
}

/** 場景回合：換場景就歸零。回目前回合數。 */
export function ensureSceneRounds(sess, scene) {
  if (!sess || typeof sess !== "object") return 0;
  if (sess.phase !== scene) { sess.phase = scene; sess.rounds = 0; sess.proposed = false; }
  sess.rounds = Number(sess.rounds) || 0;
  return sess.rounds;
}
/** 玩家出牌或聊天一次 → +1。回新回合數。 */
export function bumpRound(sess, scene) {
  ensureSceneRounds(sess, scene);
  sess.rounds = (Number(sess.rounds) || 0) + 1;
  return sess.rounds;
}

/** 公園：永不失敗，該離開了嗎？ */
export function parkShouldAdvance(sess) {
  return (Number(sess?.rounds) || 0) >= ROUNDS.park;
}
/** 酒吧：該提議換伴了嗎？（只觸發一次） */
export function barShouldPropose(sess) {
  return !sess?.proposed && (Number(sess?.rounds) || 0) >= ROUNDS.bar;
}
/** KTV：滿回合可去飯店。 */
export function ktvCanHotel(sess) {
  return (Number(sess?.rounds) || 0) >= ROUNDS.ktv;
}

/** 雙人圖：依場景要預產哪些 slot（PAIR_ACTS 的 scene 欄）。 */
export function pairSlotsFor(scene, PAIR_ACTS, PAIR_FRAMES) {
  const base = sceneBase(scene);
  const want = base === "ktv" ? "ktv" : base === "hotel" ? "hotel" : "";
  if (!want || !PAIR_ACTS) return [];
  return PAIR_ACTS.filter((a) => a.scene === want).flatMap((a) => (PAIR_FRAMES?.[a.key] ? [`${a.key}~1`, `${a.key}~2`] : [a.key]));
}

export const END_FB = {
  other: ["（搖搖頭，退了一步）……這樣太超過了，我還是回去吧。", "（挽著自己老公的手臂）不好意思，我沒辦法再往下走了。"],
  wife: ["（緊緊抓住你的衣角，搖頭）……我不要跟他走，我們回家好不好？", "（眼睛紅紅的）對不起……我還是沒辦法接受。"],
  both: ["兩邊都搖了搖頭——今晚就到這裡吧。"],
  leave: ["今晚就到這裡，大家各自回家了。"],
  success: ["今晚的換妻約會結束了。"],
};
