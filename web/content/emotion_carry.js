/**
 * 情緒餘溫（2026-10-03 使用者）：被侵犯／挑逗／冒犯後的情緒不會因為下一句普通招呼就瞬間歸零。
 *
 * 狀態存在 bodyState.moodCarry = { type, level(0–100), at, cause, since }，
 * 隨 bodyState 存檔（房間存檔＋名冊回寫），重新整理／重開不會重置。
 *
 * 類型：angry 生氣、hurt 委屈受傷、flustered 害羞慌亂、aroused 被撩起來的羞燥。
 * 衰減：
 *   - 每句閒聊（非挑逗動作）：step = 12 + 關係階段序（陌生 12 … 病嬌妻 22）
 *       接住（judge）×1.5；道歉 ×2 再 +10；目前侵犯 ≥60 ×0.5、≥30 ×0.75；害羞／羞燥類 ×1.25；冒犯本句不衰減。
 *   - 時間：每真實分鐘 −1（以 at 惰性計算；時鐘在未來則從現在起算）。
 *   - level < 8 視為消退（清除）。
 * 純函式模組：不碰 DOM，方便 node 測試。
 */

import { ensureBody } from "./body_state.js?v=9";

export const MOOD_MAX = 100;
export const MOOD_CLEAR_BELOW = 8;
export const MOOD_TIME_PER_MIN = 1;
export const MOOD_LINE_BASE = 12;
export const MOOD_TYPES = {
  angry: "生氣",
  hurt: "委屈受傷",
  flustered: "害羞慌亂",
  aroused: "被撩起來的羞燥",
};

/** 與 test_room_summon STAGE_LADDER 對齊。 */
const STAGE_ORDER = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];
const GIRLFRIEND_IDX = 4;

export const APOLOGY_RE = /對不起|对不起|抱歉|sorry|我錯了|我错了|不好意思|原諒我|原谅我|別生氣|别生气|不生氣|消消氣|是我不好/i;

function stageIndexOf(stageKey) {
  const i = STAGE_ORDER.indexOf(String(stageKey || "stranger"));
  return i < 0 ? 0 : i;
}

function clampLevel(n) {
  return Math.max(0, Math.min(MOOD_MAX, Math.round(Number(n) || 0)));
}

export function ensureMoodCarry(who) {
  const b = ensureBody(who);
  if (!b) return null;
  const m = b.moodCarry;
  if (!m || typeof m !== "object" || !(m.type in MOOD_TYPES)) {
    b.moodCarry = null;
    return null;
  }
  m.level = clampLevel(m.level);
  m.at = Number(m.at) > 0 ? Number(m.at) : Date.now();
  m.cause = String(m.cause || "").slice(0, 40);
  if (m.level < MOOD_CLEAR_BELOW) {
    b.moodCarry = null;
    return null;
  }
  return m;
}

/** 時間衰減（惰性）：每滿 1 分鐘 −1。@returns 實際扣掉的量 */
export function decayMoodByTime(who, now = Date.now()) {
  const m = ensureMoodCarry(who);
  if (!m) return 0;
  const t = Number(now) || Date.now();
  if (m.at > t + 60 * 1000) { m.at = t; return 0; }
  const mins = Math.floor((t - m.at) / 60000);
  if (mins <= 0) return 0;
  m.at += mins * 60000;
  const before = m.level;
  m.level = clampLevel(before - mins * MOOD_TIME_PER_MIN);
  const drop = before - m.level;
  ensureMoodCarry(who);
  return drop;
}

export function getMoodCarry(who, now = Date.now()) {
  decayMoodByTime(who, now);
  return ensureMoodCarry(who);
}

/**
 * 記錄一次情緒。合併規則：同類型 → max + 0.5×min；不同類型 → 強者為準（平手取新的）、level = max + 0.3×min。上限 100。
 */
export function noteMood(who, { type, level, cause = "", now = Date.now() } = {}) {
  if (!(type in MOOD_TYPES)) return null;
  const add = clampLevel(level);
  if (add < MOOD_CLEAR_BELOW) return getMoodCarry(who, now);
  const b = ensureBody(who);
  if (!b) return null;
  const cur = getMoodCarry(who, now);
  if (!cur) {
    b.moodCarry = { type, level: add, at: now, cause: String(cause).slice(0, 40), since: now };
    return b.moodCarry;
  }
  const hi = Math.max(cur.level, add);
  const lo = Math.min(cur.level, add);
  if (cur.type === type) {
    cur.level = clampLevel(hi + lo * 0.5);
  } else {
    if (add >= cur.level) cur.type = type;
    cur.level = clampLevel(hi + lo * 0.3);
  }
  if (add >= lo || cause) cur.cause = String(cause || cur.cause).slice(0, 40);
  cur.at = now;
  cur.since = now;
  return cur;
}

/**
 * 依本回合挑逗結果推出情緒（純計算，不寫入）。
 * - added ≥13（斥責／暴怒）→ angry：30 + added×2
 * - added 6–12（明顯抗議）→ angry：20 + added×2.5；半推半就 → aroused ×0.8
 * - added 2–5（輕推）→ flustered：15 + added×3；半推半就 → aroused
 * - added ≤1 但她已被撩起（興奮 ≥8）→ aroused：10 + arousal
 */
export function moodFromActResult({ added = 0, arousal = 0, willing = false } = {}) {
  const a = Math.max(0, Math.round(Number(added) || 0));
  const ar = Math.max(0, Number(arousal) || 0);
  if (a >= 13) return { type: "angry", level: clampLevel(30 + a * 2) };
  if (a >= 6) {
    const lv = 20 + a * 2.5;
    return willing ? { type: "aroused", level: clampLevel(lv * 0.8) } : { type: "angry", level: clampLevel(lv) };
  }
  if (a >= 2) return { type: willing ? "aroused" : "flustered", level: clampLevel(15 + a * 3) };
  if (ar >= 8) return { type: "aroused", level: clampLevel(10 + ar) };
  return null;
}

export function noteMoodFromAct(who, opts = {}) {
  const m = moodFromActResult(opts);
  if (!m) return getMoodCarry(who, opts.now);
  return noteMood(who, { ...m, cause: opts.cause || "剛才對你動手動腳", now: opts.now ?? Date.now() });
}

/** judge 冒犯：女友以上 → hurt 40；以下 → angry 35。 */
export function noteMoodFromMark(who, mark, stageKey, { cause = "說了讓你不舒服的話", now = Date.now() } = {}) {
  if (mark !== "冒犯") return getMoodCarry(who, now);
  const close = stageIndexOf(stageKey) >= GIRLFRIEND_IDX;
  return noteMood(who, { type: close ? "hurt" : "angry", level: close ? 40 : 35, cause, now });
}

/** 每句閒聊的衰減量（純計算）。 */
export function moodLineStep({ stageKey = "stranger", mark = "平常", text = "", invasion = 0, type = "angry" } = {}) {
  if (mark === "冒犯") return 0;
  let step = MOOD_LINE_BASE + stageIndexOf(stageKey);
  let bonus = 0;
  if (APOLOGY_RE.test(String(text || ""))) { step *= 2; bonus = 10; }
  else if (mark === "接住") step *= 1.5;
  const inv = Number(invasion) || 0;
  if (inv >= 60) step *= 0.5;
  else if (inv >= 30) step *= 0.75;
  if (type === "flustered" || type === "aroused") step *= 1.25;
  return Math.round(step + bonus);
}

/** 每句閒聊（非挑逗動作）呼叫一次。@returns 扣掉的量 */
export function decayMoodPerLine(who, opts = {}) {
  const m = getMoodCarry(who, opts.now);
  if (!m) return 0;
  const step = moodLineStep({ ...opts, type: m.type });
  const before = m.level;
  m.level = clampLevel(before - step);
  ensureMoodCarry(who);
  return before - m.level;
}

/** 文件／測試用：在固定條件下要幾句才消退（level < 8）。 */
export function moodLinesToFade(level, opts = {}) {
  const step = moodLineStep(opts);
  if (step <= 0) return Infinity;
  let lv = clampLevel(level);
  let n = 0;
  while (lv >= MOOD_CLEAR_BELOW && n < 999) { lv -= step; n += 1; }
  return n;
}

export function moodBand(level) {
  const lv = Number(level) || 0;
  if (lv >= 70) return "strong";
  if (lv >= 40) return "mid";
  if (lv >= 15) return "light";
  if (lv >= MOOD_CLEAR_BELOW) return "faint";
  return "none";
}

const BAND_NAME = { strong: "強", mid: "中", light: "淡", faint: "殘留" };

function behaviorLine(type, band, close) {
  if (type === "angry") {
    if (band === "strong") {
      return close
        ? "你還在生他的氣。是戀人在鬧脾氣：嘟嘴、冷淡、賭氣，故意只回一兩句，可以直接抱怨剛才的事（像「你剛剛那樣是怎樣」），要他道歉或好好哄你幾句才肯軟下來；但不要變成陌生人、不要說分手。"
        : "你氣還沒消。回話短、冷、帶刺，不給好臉色、不主動找話題，可以直接質問剛才的事（像「你剛剛那樣是什麼意思」）；要他道歉或明顯收斂好幾句之後才慢慢緩和。";
    }
    if (band === "mid") {
      return close
        ? "你還有點不高興：語氣比平常淡、帶點賭氣或酸一句，偶爾提起剛才的事；他好好說話你會慢慢回暖，但這一句還不會完全恢復。"
        : "你還有點不爽、對他有戒心：語氣比平常冷淡，回得簡短，可能順口刺一句剛才的事；他正常說話會慢慢緩和，但這句不會立刻熱絡。";
    }
    if (band === "light") return "剩一點不爽：大致正常回應，但留一點彆扭或小小的冷淡，或嘀咕一下剛才的事。";
    return "氣幾乎消了，只是心裡還記得；正常說話即可，不必再提。";
  }
  if (type === "hurt") {
    if (band === "strong") return "他剛才的話讓你很受傷，心裡還委屈難過：回話低落、短、不太想多說，可能悶悶地說出你很在意剛才那句；他安慰或道歉才會慢慢好起來，不會因為一句招呼就沒事。";
    if (band === "mid") return "你還有點委屈：語氣悶悶的、比較安靜，偶爾提一下剛才讓你難過的事；他溫柔一點你會慢慢放軟。";
    if (band === "light") return "還有一點點委屈：大致正常，只是語氣稍微收著，或小小撒氣一下。";
    return "那點委屈快散了；正常說話即可。";
  }
  if (type === "flustered") {
    if (band === "strong") return "他剛才突然對你動手，你還沒從害羞慌亂裡平復：臉還熱、眼神躲開、說話急或彆扭，會警告他不准再那樣，或假裝生氣掩飾害羞；不會若無其事。";
    if (band === "mid") return "剛才的事讓你還有點害羞不自在：說話有點彆扭、會刻意保持一點距離，可能嗔他一句。";
    if (band === "light") return "還留一點不好意思：大致正常，偶爾閃一下視線或小聲抱怨剛才。";
    return "害羞幾乎退了；正常說話即可。";
  }
  // aroused
  if (band === "strong") return "剛才被他撩起來的感覺還沒退：身體還熱、心裡又羞又亂，說話會分心、語氣不自覺變軟或有點黏；嘴上可以嗔他壞、叫他別再鬧，但不是真的討厭他。";
  if (band === "mid") return "剛才被撩起的燥熱還沒完全退：有點不自在、會害羞地避開那個話題，或小聲怪他剛才太壞。";
  if (band === "light") return "還殘留一點羞燥：大致正常，偶爾想起剛才會臉紅一下。";
  return "那股燥熱快散了；正常說話即可。";
}

/**
 * 每回合注入 system prompt 的情緒餘溫＋戒心行（無則空陣列）。
 * @param {object} who
 * @param {{ stageKey?: string, invasion?: number, now?: number }} opts
 */
export function moodCarryPromptLines(who, { stageKey = "stranger", invasion = 0, now = Date.now() } = {}) {
  const out = [];
  const m = getMoodCarry(who, now);
  const close = stageIndexOf(stageKey) >= GIRLFRIEND_IDX;
  if (m) {
    const band = moodBand(m.level);
    const cause = m.cause ? `（起因：他${m.cause}）` : "";
    const head = band === "faint"
      ? ""
      : "這股情緒還沒過去。就算他現在像沒事一樣打招呼、換話題，你也不會瞬間恢復成平常的樣子——一句招呼不會讓情緒歸零。";
    out.push(`【情緒餘溫・${MOOD_TYPES[m.type]}・${BAND_NAME[band] || "淡"}】${cause}${head}${behaviorLine(m.type, band, close)}`);
  }
  const inv = Number(invasion) || 0;
  if (inv >= 60) {
    out.push("【戒心・強】他今天已經對你動手動腳很多次：你非常戒備，保持距離、提防他的手，可以明說再亂碰你就要走。");
  } else if (inv >= 30) {
    out.push("【戒心】他今天碰過你好幾次：你還記得、仍有些戒心，會留意他的動作，不會毫無防備地親近。");
  }
  if (out.length) {
    out.push("（以上是情緒，不是身體反應：除非系統另外標示正在被刺激／痙攣／高潮餘韻／失神，否則照樣說完整清楚的句子，不准嗯啊呻吟、喘、斷字。不要提到任何數字、分數或「情緒值」「侵犯」等字眼。）");
  }
  return out;
}

/** 開場（重新進房／召喚）提示：level ≥15 才附加。 */
export function moodOpenerHint(who, now = Date.now()) {
  const m = getMoodCarry(who, now);
  if (!m || m.level < 15) return "";
  return `你還帶著先前的情緒（${MOOD_TYPES[m.type]}），重新見面也不要裝沒事——照系統說明的「情緒餘溫」開口。`;
}

/** LLM 空回覆時的保底台詞（level ≥40 才用）；否則回傳 fallback。 */
export function moodFallbackLine(who, fallback = "……", now = Date.now()) {
  const m = getMoodCarry(who, now);
  if (!m || m.level < 40) return fallback;
  if (m.type === "angry") return "……哼。";
  if (m.type === "hurt") return "……沒事。";
  if (m.type === "flustered") return "……你、你還敢跟我說話喔。";
  return "……討厭。";
}

export function clearMoodCarry(who) {
  const b = ensureBody(who);
  if (b) b.moodCarry = null;
}
