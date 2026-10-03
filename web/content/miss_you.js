/**
 * 想念值 missYou（2026-10-03，參考 hermes-companion 的 social_need）：她多久沒見到你，就多想你。
 *
 * 狀態存在 bodyState.missYou = { level 0–100, lastSeen, reunion }，跟著 bodyState 走房間存檔＋名冊回寫（伺服器存檔）。
 *   - lastSeen：你最後一次在房間跟她互動（開場、每句來回、關掉對話）的時間。
 *   - 回來時（開對話）依真實經過時間累加：level += 每小時速率(關係階) × 個性倍率 × 小時數，封頂在該階上限。
 *     間隔不到 MISS_MIN_GAP_MS 不加（短暫離開不算想念）。
 *   - level ≥ MISS_NOTICE 才算「重逢」：記 reunion = { level, at, lines: 0 }，開場與前幾句 prompt 帶入想念。
 *   - 跟她聊天會把想念消掉：每句玩家台詞 −max(MISS_DRAIN_MIN, ceil(重逢時 level / MISS_DRAIN_LINES))，約 3 句歸零。
 * 小效果（常數可調）：
 *   - 重逢 level ≥ MISS_BONUS_AT，且重逢後第一句被判「接住」→ 額外感情 +MISS_BONUS_AFF（一次）。
 *   - 重逢 level ≥ MISS_HAPPY_AT，重逢後第一句（沒冒犯）算「開心」→ 侵犯值走 −8～10。
 * 純函式模組：不碰 DOM，方便 node 測試。
 */

import { ensureBody } from "./body_state.js?v=16";

export const MISS_MAX = 100;
/** 間隔不到 30 分鐘不算想念。 */
export const MISS_MIN_GAP_MS = 30 * 60 * 1000;
/** level 到這裡才在開場／prompt 表現出來。 */
export const MISS_NOTICE = 15;
export const MISS_DRAIN_LINES = 3;
export const MISS_DRAIN_MIN = 8;
export const MISS_BONUS_AT = 60;
export const MISS_BONUS_AFF = 1;
export const MISS_HAPPY_AT = 40;

/** 每小時速率／上限（依關係階）。陌生幾乎不想；交往起明顯；病態妻子最快。 */
export const MISS_STAGE = {
  stranger:          { rate: 0.5, cap: 15 },
  acquaintance:      { rate: 1,   cap: 25 },
  friend:            { rate: 2,   cap: 45 },
  close_friend:      { rate: 3,   cap: 60 },
  girlfriend:        { rate: 5,   cap: 80 },
  passionate:        { rate: 6,   cap: 90 },
  lover:             { rate: 7,   cap: 100 },
  wife:              { rate: 6,   cap: 90 },
  devoted_wife:      { rate: 7,   cap: 100 },
  obedient_wife:     { rate: 8,   cap: 100 },
  pathological_wife: { rate: 12,  cap: 100 },
};

/** 個性速率倍率（沒列＝1）。 */
export const MISS_PERSONALITY_MULT = {
  "病嬌": 1.5,
  "活潑開朗": 1.2,
  "天然呆": 1.2,
  "高冷": 0.8,
};

const STAGE_ORDER = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];

function stageIdx(stageKey) {
  const i = STAGE_ORDER.indexOf(String(stageKey || "stranger"));
  return i < 0 ? 0 : i;
}

function clamp(n, lo = 0, hi = MISS_MAX) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

export function missStageSpec(stageKey) {
  return MISS_STAGE[stageKey] || MISS_STAGE.stranger;
}

export function ensureMiss(who) {
  const b = ensureBody(who);
  if (!b) return null;
  const m = b.missYou && typeof b.missYou === "object" ? b.missYou : {};
  m.level = clamp(m.level);
  m.lastSeen = Number(m.lastSeen) > 0 ? Number(m.lastSeen) : 0;
  if (m.reunion && typeof m.reunion === "object") {
    m.reunion = {
      level: clamp(m.reunion.level),
      at: Number(m.reunion.at) || 0,
      lines: Math.max(0, Number(m.reunion.lines) | 0),
      bonusDone: !!m.reunion.bonusDone,
      gapMs: Math.max(0, Number(m.reunion.gapMs) || 0),
    };
  } else m.reunion = null;
  b.missYou = m;
  return m;
}

export function getMiss(who) {
  return ensureMiss(who)?.level || 0;
}

/** 互動過：把 lastSeen 推到現在。 */
export function noteMissSeen(who, now = Date.now()) {
  const m = ensureMiss(who);
  if (!m) return;
  m.lastSeen = Number(now) || Date.now();
}

/**
 * 開對話時：依離開多久累加想念，夠高就記重逢。
 * 沒有 lastSeen（第一次見／舊存檔）→ 只起算不加。時鐘在未來（裝置時差）→ 從現在起算。
 * @returns {{ added: number, level: number, gapMs: number, reunion: boolean }}
 */
export function refreshMissOnEnter(who, { stageKey = "stranger", personality = "", now = Date.now() } = {}) {
  const m = ensureMiss(who);
  if (!m) return { added: 0, level: 0, gapMs: 0, reunion: false };
  const t = Number(now) || Date.now();
  const last = m.lastSeen;
  m.lastSeen = t;
  if (!last || last > t + 60 * 1000) return { added: 0, level: m.level, gapMs: 0, reunion: !!m.reunion };
  const gapMs = t - last;
  if (gapMs < MISS_MIN_GAP_MS) return { added: 0, level: m.level, gapMs, reunion: !!m.reunion };
  const spec = missStageSpec(stageKey);
  const mult = MISS_PERSONALITY_MULT[personality] ?? 1;
  const hours = gapMs / 3600000;
  const before = m.level;
  const target = Math.min(spec.cap, before + spec.rate * mult * hours);
  m.level = clamp(Math.max(before, target));
  const added = m.level - before;
  if (m.level >= MISS_NOTICE) {
    m.reunion = { level: m.level, at: t, lines: 0, bonusDone: false, gapMs };
  }
  return { added, level: m.level, gapMs, reunion: m.level >= MISS_NOTICE };
}

/** 每句玩家台詞：想念消掉一截；歸零（或低於 MISS_NOTICE 且已聊過幾句）時結束重逢。回傳消掉的量。 */
export function drainMissPerLine(who) {
  const m = ensureMiss(who);
  if (!m || m.level <= 0) {
    if (m) m.reunion = null;
    return 0;
  }
  const base = m.reunion?.level || m.level;
  const step = Math.max(MISS_DRAIN_MIN, Math.ceil(base / MISS_DRAIN_LINES));
  const before = m.level;
  m.level = clamp(before - step);
  if (m.reunion) m.reunion.lines += 1;
  if (m.level <= 0) m.reunion = null;
  return before - m.level;
}

/** 重逢後的第一句玩家台詞？（drain 之前呼叫） */
export function isFirstReunionLine(who) {
  const m = ensureMiss(who);
  return !!(m?.reunion && m.reunion.lines === 0);
}

/** 重逢第一句算不算「開心」（侵犯值 −8～10 用）。 */
export function missReunionHappy(who, mark = "平常") {
  const m = ensureMiss(who);
  if (!m?.reunion || m.reunion.lines !== 0) return false;
  if (mark === "冒犯") return false;
  return m.reunion.level >= MISS_HAPPY_AT;
}

/** 重逢第一句被「接住」→ 額外感情（一次）。回傳要加的感情。 */
export function takeMissBonus(who, mark = "平常") {
  const m = ensureMiss(who);
  if (!m?.reunion || m.reunion.bonusDone || m.reunion.lines !== 0) return 0;
  if (mark !== "接住" || m.reunion.level < MISS_BONUS_AT) return 0;
  m.reunion.bonusDone = true;
  return MISS_BONUS_AFF;
}

export function missBand(level) {
  const n = Number(level) || 0;
  if (n >= 70) return "strong";
  if (n >= 40) return "clear";
  if (n >= MISS_NOTICE) return "slight";
  return "none";
}

export function formatGap(ms) {
  const min = Math.round((Number(ms) || 0) / 60000);
  if (min < 60) return `${min} 分鐘`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} 小時`;
  const d = Math.round(h / 24);
  return `${d} 天`;
}

/** 依關係階＋個性＋強度，回一句「她怎麼表現想念」。不寫稱呼（老公等照原本稱呼規則）。 */
export function missStyleLine({ stageKey = "stranger", personality = "", level = 0 } = {}) {
  const band = missBand(level);
  if (band === "none") return "";
  const idx = stageIdx(stageKey);
  const strong = band === "strong";
  // 陌生／普通：只是注意到，不表現想念（個性也不改）
  if (idx <= 1) return "你只是淡淡注意到他隔了一陣子又出現（像「喔，是你啊」），不要表現想念、不要熱絡。";
  // 朋友／親密好友
  if (idx <= 3) {
    if (personality === "傲嬌") return "你有點在意他這麼久沒來，但嘴硬（「我才沒在等你」），一句帶過再正常聊。";
    if (personality === "高冷") return "你注意到他好一陣子沒來，淡淡問一句（「最近很忙？」），不要表現想念。";
    return band !== "slight"
      ? "你有點在意他這麼久沒來，可以順口問「你怎麼這麼久沒來」，一兩句就好，不要撒嬌。"
      : "你注意到他有陣子沒來，可以順口提一句，不要撒嬌。";
  }
  // 交往起（女友～病態妻子）
  const patho = stageKey === "pathological_wife";
  if (personality === "病嬌" || patho) {
    return strong
      ? "你非常想他：短促地追問他去了哪、怎麼這麼久不來、說好想好想他，黏住不放；禁止長篇監視獨白或連續逼問。"
      : "你很想他，帶一點佔有地問他去哪了、說想他；短促，不要長篇。";
  }
  if (personality === "傲嬌") {
    return strong
      ? "你很想他但先鬧彆扭（「哼，還知道回來？」「誰、誰在等你啊」），一兩句之後才軟下來承認想他。"
      : "你有點想他，先小小鬧彆扭一句，再軟下來。";
  }
  if (personality === "高冷") {
    return strong
      ? "你嘴上淡淡的，但藏不住在意：停頓、多問一句他去哪了，最後小聲承認有點想他。"
      : "你嘴上淡淡的，只露出一點在意（多問一句）。";
  }
  if (personality === "活潑開朗" || personality === "天然呆") {
    return strong
      ? "你直接說好想他、好無聊、等好久了，撒嬌黏上去；熱但不要每句尖叫。"
      : "你開心他來了，說一句有點想他。";
  }
  if (personality === "文靜溫柔" || personality === "御姊") {
    return strong
      ? "你溫柔地說等他好久了、好想他，問他最近好不好；可以撒嬌一點。"
      : "你溫柔地說有點想他，問他最近好不好。";
  }
  return strong
    ? "你很想他：一見面就撒嬌、黏一點、抱怨他這麼久不來，甜但收得住。"
    : "你有點想他，可以撒嬌一句。";
}

/** 開場旁白補充（只在重逢且還沒聊過時）。 */
export function missOpenerHint(who, { stageKey = "stranger", personality = "" } = {}) {
  const m = ensureMiss(who);
  if (!m?.reunion || m.reunion.lines > 0 || m.level < MISS_NOTICE) return "";
  const style = missStyleLine({ stageKey, personality, level: m.level });
  if (!style) return "";
  const gap = m.reunion.gapMs ? `他大約 ${formatGap(m.reunion.gapMs)}沒來找你了。` : "他有一陣子沒來找你了。";
  return `${gap}${style}`;
}

/** talkSystem 用：重逢的前幾句帶入想念（越聊越淡）。 */
export function missPromptLines(who, { stageKey = "stranger", personality = "" } = {}) {
  const m = ensureMiss(who);
  if (!m?.reunion || m.level < MISS_NOTICE) return [];
  const style = missStyleLine({ stageKey, personality, level: m.level });
  if (!style) return [];
  const fading = m.reunion.lines > 0 ? "已經聊了幾句，想念慢慢被接住——淡一點，別每句都提。" : "";
  return [`【想念】${style}${fading}`];
}
