/**
 * 她桌上工作的身心狀態（2026-11-02 Al）：工作會累、被退回會沮喪、被收下會開心；關係越好越不容易累。
 *
 * 狀態存在 bodyState.deskFeel = { tired(0–100), at, resting, mood:{type:'proud'|'down', level, at, title} }，
 * 隨 bodyState 存檔。純函式模組：不碰 DOM，方便 node 測試。
 *
 *   累：在書桌前做工作時每分鐘 +tiredPerMin(關係)（陌生 1.5 … 病態妻子 0.6；陌生約 70 分鐘累壞、病態妻子約 3 小時）。
 *       沒在工作每分鐘 −2，睡覺 −5。到 100 → 累壞了（resting）：去床上躺、不回書桌；降到 30 以下才好。
 *   心情：收下 → proud（開心、有點得意，順便消一點累）；延伸 → proud（小一點）；退回 → down（關係越好越不在意）。
 *         每分鐘 −1.5，低於 5 就沒了。
 */

export const STAGES = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];
export const TIRED_MAX = 100;
export const REST_UNTIL = 30;
export const RECOVER_AWAKE = 2;
export const RECOVER_SLEEP = 5;
export const MOOD_DECAY = 1.5;
const MAX_GAP_MIN = 24 * 60;

const stageIdx = (k) => Math.max(0, STAGES.indexOf(String(k || "stranger")));
const clamp = (n, lo = 0, hi = TIRED_MAX) => Math.max(lo, Math.min(hi, Number(n) || 0));

/** 在書桌前工作每分鐘累多少：關係越好越少。 */
export function tiredPerMin(stageKey) {
  return Math.round((1.5 - stageIdx(stageKey) * 0.09) * 100) / 100;
}

export function ensureFeel(who, now = Date.now()) {
  if (!who) return null;
  const b = (who.bodyState ||= {});
  const f = b.deskFeel && typeof b.deskFeel === "object" ? b.deskFeel : (b.deskFeel = {});
  f.tired = clamp(f.tired);
  f.at = Number(f.at) > 0 ? Number(f.at) : now;
  f.resting = !!f.resting;
  if (f.mood && !(f.mood.type === "proud" || f.mood.type === "down")) f.mood = null;
  return f;
}

/**
 * 從上次到現在：working 在書桌前做工作｜sleeping 在睡覺｜其他＝醒著沒在做。
 * → 'exhausted'（剛累壞）｜'rested'（剛休息夠）｜null
 */
export function tickFeel(f, { working = false, sleeping = false, stageKey = "stranger", now = Date.now() } = {}) {
  if (!f) return null;
  let mins = (now - f.at) / 60000;
  if (!(mins > 0)) { if (mins < 0) f.at = now; return null; }
  mins = Math.min(mins, MAX_GAP_MIN);
  f.at = now;
  f.tired = clamp(f.tired + (working ? tiredPerMin(stageKey) : -(sleeping ? RECOVER_SLEEP : RECOVER_AWAKE)) * mins);
  if (f.mood) {
    f.mood.level = Math.max(0, f.mood.level - MOOD_DECAY * mins);
    if (f.mood.level < 5) f.mood = null;
  }
  if (!f.resting && f.tired >= TIRED_MAX) { f.resting = true; return "exhausted"; }
  if (f.resting && f.tired <= REST_UNTIL) { f.resting = false; return "rested"; }
  return null;
}

/** 你對她的工作做了什麼：accept 收下｜extend 收下並延伸｜redo 退回。 */
export function noteWork(f, kind, { stageKey = "stranger", title = "", now = Date.now() } = {}) {
  if (!f) return null;
  const i = stageIdx(stageKey);
  if (kind === "accept") {
    f.mood = { type: "proud", level: 60, at: now, title: String(title).slice(0, 60) };
    f.tired = clamp(f.tired - 10);
  } else if (kind === "extend") {
    f.mood = { type: "proud", level: 45, at: now, title: String(title).slice(0, 60) };
  } else if (kind === "redo") {
    f.mood = { type: "down", level: Math.max(15, 45 - i * 3), at: now, title: String(title).slice(0, 60) };
  } else return null;
  return f.mood;
}

/** 累的程度（給畫面）：'' ｜'有點累'｜'很累'｜'累壞了，在休息' */
export function tiredLabel(f) {
  if (!f) return "";
  if (f.resting) return "累壞了，在休息";
  if (f.tired >= 80) return "很累";
  if (f.tired >= 50) return "有點累";
  return "";
}

/** 對話 prompt：她累不累、剛被收下／退回的心情。 */
export function feelPromptLines(f) {
  if (!f) return [];
  const out = [];
  if (f.resting) out.push("【工作累壞了】你剛才工作做到累壞了，現在在休息、工作先停著；講話懶懶的、想睡，被叫去工作會撒嬌或抱怨說要先休息。");
  else if (f.tired >= 80) out.push("【工作很累】你在書桌前做了很久，很累了，講話有氣無力、會想休息。");
  else if (f.tired >= 50) out.push("【工作有點累】你工作了一陣子，有點累，偶爾會伸懶腰或抱怨一下。");
  const m = f.mood;
  if (m && m.level >= 5) {
    const t = m.title ? `「${m.title}」` : "你的工作";
    if (m.type === "proud") out.push(`【工作被收下】他剛收下你做的${t}，你很開心、有點得意，想被誇（依你的個性表現，不要每句都提）。`);
    else out.push(`【工作被退回】他剛把你做的${t}退回來要你改，你有點沮喪（依你的個性：可能嘴硬、撒嬌、或默默想改好，不要每句都提）。`);
  }
  return out;
}
