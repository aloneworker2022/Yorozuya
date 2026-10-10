/**
 * 性飢渴 hunger（2026-10-09 Al）：太久沒被碰，她會越來越想要。關係越深，表現得越明顯、越主動。
 * 這是「新系統」，跟退役的 CRAVE_ON／舊 `crave` 欄位無關（舊欄位照樣不讀）。
 *
 * 狀態存在 bodyState.hunger = { level 0–100, at, satedUntil, begAt, beg, temperAt, last }，
 * 跟著 bodyState 走房間存檔＋名冊回寫（手機為主）。
 *   - 上升：惰性計算（看 at 到現在過了多久）。每小時速率＝性慾等級基礎 × 關係階倍率。
 *     剛被弄到高潮後有一段「滿足期」（satedUntil），這段時間不漲。
 *   - 下降：她高潮（做愛或調戲）大降、內射中降、每次動手調戲小降。
 * 依關係階（累加）：
 *   - 陌生／認識（reserved）：只反映在房間活動（夾腿扭、坐立不安、偷看），嘴上什麼都不說。
 *   - 朋友／好友（friend）：＋漲得快；聊天心不在焉；被碰時性奮漲得快一點。
 *   - 女友／熱戀／愛人（dating）：＋欲求不滿的脾氣（開聊時容易不耐煩，有冷卻）。
 *   - 妻子以上（wife）：＋色色的暗示話；很高時主動走到你面前求你（有冷卻）。
 * 與 bodyState.libido（性慾 0–30，抽人時決定、平常幾乎不變）分開：libido 是「體質」，hunger 是「現在多久沒被滿足」。
 * 純函式模組：不碰 DOM，方便 node 測試（hungerOn() 只讀 <html data-hunger="1">）。
 */

export const HUNGER_MAX = 100;
/** 每小時上升（依性慾等級 N～SSR）。中間的 S 約 1 天到「飢渴」、陌生的 N 約 2 天半。 */
export const HUNGER_RATE = { N: 1.2, R: 1.8, S: 2.5, SS: 3.3, SSR: 4.2 };
/** 關係階倍率（朋友起漲得快）。 */
export const HUNGER_STAGE_MULT = { reserved: 1, friend: 1.35, dating: 1.5, wife: 1.6 };
/** 新妹子／舊存檔起始值 ≈ 這麼多小時的量。 */
export const HUNGER_SEED_HOURS = 6;
/** 下降量。 */
export const HUNGER_DROP = { orgasm: 40, creampie: 10, touch: 2 };
/** 高潮後滿足期（不漲）。內射也給一小段。 */
export const HUNGER_SATED_MS = { orgasm: 2 * 3600e3, creampie: 45 * 60e3 };
/** 分段：<mid 平靜；mid 有點想要；high 飢渴；peak 快受不了。 */
export const HUNGER_TIER = { mid: 35, high: 60, peak: 85 };
export const HUNGER_TIER_ZH = { low: "平靜", mid: "有點想要", high: "飢渴", peak: "快受不了" };
/** 女友起：欲求不滿脾氣。 */
export const TEMPER_AT = 65;
export const TEMPER_COOLDOWN_MS = 90 * 60e3;
/** 妻子起：主動來求。 */
export const BEG_AT = 85;
export const BEG_COOLDOWN_MS = 4 * 3600e3;
/** 走過來求之後多久內打開聊天，第一句還是在求。 */
export const BEG_WINDOW_MS = 15 * 60e3;
/**
 * 妻子起：飢渴到頂點（≥ PEAK_AT）時開始做愛（她來求、或自己按做愛都算）→「榨乾場」（2026-10-09 Al）：
 * 中途不能停，要做到她飢渴歸 0；玩家精液不看「<1 結束／≤0 不能開始」，可以一路射到負的；
 * 她滿足時精液 < −7（腎虧門檻）→ 射血、送醫（腎虧只結算一次）。
 */
export const PEAK_AT = 95;
/** 榨乾場裡她每高潮一次降這麼多（一般高潮 −40；這裡 −25 → 從 100 要高潮 4 次）。內射不降（她要的是高潮）。 */
export const MARATHON_ORGASM_DROP = 25;
/** 腦袋佔有度（朋友起）：≥ OCC_AT 才有，OCC_MIN～OCC_MAX。 */
export const OCC_AT = 70;
export const OCC_MIN = 6;
export const OCC_MAX = 14;

const STAGE_ORDER = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];
const BAND_LABEL = { reserved: "陌生／認識：只在房間活動", friend: "朋友：＋漲得快、心不在焉", dating: "女友：＋欲求不滿脾氣", wife: "妻子：＋色色暗示、會主動求" };

const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number(n) || 0));
const r1 = (n) => Math.round(n * 10) / 10;

/** <html data-hunger="1">（或 globalThis.YORO_HUNGER）。 */
export function hungerOn() {
  try {
    if (typeof globalThis.YORO_HUNGER === "boolean") return globalThis.YORO_HUNGER;
    return globalThis.document?.documentElement?.dataset?.hunger === "1";
  } catch {
    return false;
  }
}

export function stageBand(stageKey) {
  const i = STAGE_ORDER.indexOf(String(stageKey || "stranger"));
  const s = i < 0 ? 0 : i;
  return s >= 7 ? "wife" : s >= 4 ? "dating" : s >= 2 ? "friend" : "reserved";
}
const BAND_RANK = { reserved: 0, friend: 1, dating: 2, wife: 3 };
export const atLeast = (stageKey, band) => BAND_RANK[stageBand(stageKey)] >= BAND_RANK[band];
export const bandLabel = (stageKey) => BAND_LABEL[stageBand(stageKey)];

export function libidoGrade(who) {
  const g = String(who?.libido?.grade || who?.grades?.libido || "R").toUpperCase();
  return HUNGER_RATE[g] != null ? g : "R";
}
/** 每小時漲多少。 */
export function hungerRate(who, stageKey = who?.stage) {
  return HUNGER_RATE[libidoGrade(who)] * HUNGER_STAGE_MULT[stageBand(stageKey)];
}

export function hungerTier(level) {
  const h = Number(level) || 0;
  return h >= HUNGER_TIER.peak ? "peak" : h >= HUNGER_TIER.high ? "high" : h >= HUNGER_TIER.mid ? "mid" : "low";
}

function body(who) {
  return who && typeof who === "object" && who.bodyState && typeof who.bodyState === "object" ? who.bodyState : null;
}

export function ensureHunger(who, now = Date.now()) {
  const b = body(who);
  if (!b) return null;
  const h = b.hunger && typeof b.hunger === "object" ? b.hunger : null;
  if (!h) {
    b.hunger = { level: r1(Math.min(30, HUNGER_RATE[libidoGrade(who)] * HUNGER_SEED_HOURS)), at: now, satedUntil: 0, begAt: 0, beg: null, temperAt: 0, last: null };
    return b.hunger;
  }
  h.level = r1(clamp(h.level, 0, HUNGER_MAX));
  h.at = Number(h.at) > 0 ? Number(h.at) : now;
  if (h.at > now + 60e3) h.at = now;   // 時鐘在未來（裝置時差）→ 從現在起算
  h.satedUntil = Number(h.satedUntil) || 0;
  h.begAt = Number(h.begAt) || 0;
  h.temperAt = Number(h.temperAt) || 0;
  h.beg = h.beg && typeof h.beg === "object" && Number(h.beg.at) > 0 ? { at: Number(h.beg.at), seen: !!h.beg.seen } : null;
  if (h.last && typeof h.last !== "object") h.last = null;
  return h;
}

/** 從 from 到 to 這段，扣掉滿足期後有幾小時在漲。 */
function risingHours(from, to, satedUntil) {
  const start = Math.max(from, satedUntil || 0);
  return to > start ? (to - start) / 3600e3 : 0;
}

/** 現在的值（不寫入）。 */
export function peekHunger(who, now = Date.now(), stageKey = who?.stage) {
  const b = body(who);
  const h = b?.hunger;
  if (!h || typeof h !== "object") return b ? r1(Math.min(30, HUNGER_RATE[libidoGrade(who)] * HUNGER_SEED_HOURS)) : 0;
  const lv = clamp(h.level, 0, HUNGER_MAX);
  const at = Math.min(Number(h.at) || now, now);
  return r1(clamp(lv + hungerRate(who, stageKey) * risingHours(at, now, Number(h.satedUntil) || 0), 0, HUNGER_MAX));
}

/** 把時間經過算進去（寫入）。回傳 level。 */
export function tickHunger(who, now = Date.now(), stageKey = who?.stage) {
  const h = ensureHunger(who, now);
  if (!h) return 0;
  h.level = peekHunger(who, now, stageKey);
  h.at = now;
  return h.level;
}

/** 被滿足：kind = orgasm | creampie | touch。回傳 {before, after, drop}。 */
export function relieveHunger(who, kind, now = Date.now(), stageKey = who?.stage) {
  const h = ensureHunger(who, now);
  if (!h || !HUNGER_DROP[kind]) return null;
  const before = tickHunger(who, now, stageKey);
  h.level = r1(Math.max(0, before - HUNGER_DROP[kind]));
  if (HUNGER_SATED_MS[kind]) h.satedUntil = Math.max(h.satedUntil || 0, now + HUNGER_SATED_MS[kind]);
  if (kind === "orgasm") h.beg = null;   // 求的被滿足了
  h.last = { kind, at: now, drop: r1(before - h.level) };
  return { before, after: h.level, drop: r1(before - h.level) };
}

/** 除錯：直接設定值。 */
export function setHunger(who, level, now = Date.now()) {
  const h = ensureHunger(who, now);
  if (!h) return 0;
  h.level = r1(clamp(level, 0, HUNGER_MAX));
  h.at = now;
  h.satedUntil = 0;
  return h.level;
}

// ------------------------------------------------------------ 妻子：主動來求
/** 現在可以走過來求嗎（不寫入）。calm＝番茄鐘開著。 */
export function canBeg(who, { stageKey = who?.stage, now = Date.now(), calm = false } = {}) {
  if (!atLeast(stageKey, "wife")) return false;
  // 頂點（≥ PEAK_AT，2026-10-10 Al）：不看冷卻／滿足期／番茄鐘，她一直求
  if (peakBegging(who, { stageKey, now })) return true;
  if (calm) return false;
  const h = body(who)?.hunger;
  if (h && now < (Number(h.satedUntil) || 0)) return false;
  if (peekHunger(who, now, stageKey) < BEG_AT) return false;
  return !h || now - (Number(h.begAt) || 0) >= BEG_COOLDOWN_MS;
}
/**
 * 頂點求歡（2026-10-10 Al）：妻子以上＋飢渴 ≥ PEAK_AT → 不能拒絕；玩家做什麼都變成她問要不要做，直到開始做愛。
 * 只看值（不看冷卻、滿足期）。
 */
export function peakBegging(who, { stageKey = who?.stage, now = Date.now() } = {}) {
  if (!who || !atLeast(stageKey, "wife")) return false;
  return peekHunger(who, now, stageKey) >= PEAK_AT;
}
/** 求的對話框能不能拒絕／關掉（頂點不行）。 */
export function begRefusable(who, opts = {}) {
  return !peakBegging(who, opts);
}
/** 她走過來了：記冷卻＋開一個「求」的窗口。 */
export function noteBeg(who, now = Date.now()) {
  const h = ensureHunger(who, now);
  if (!h) return null;
  h.begAt = now;
  h.beg = { at: now, seen: false };
  return h.beg;
}
/** 還在求的窗口裡嗎。 */
export function begActive(who, now = Date.now()) {
  const g = body(who)?.hunger?.beg;
  return !!g && now - (Number(g.at) || 0) < BEG_WINDOW_MS;
}
/** 聊完：求的窗口結束（不管有沒有答應；有沒有被滿足看 relieveHunger）。 */
export function closeBeg(who) {
  const h = body(who)?.hunger;
  if (h) h.beg = null;
}

// ------------------------------------------------------------ 妻子：飢渴頂點的榨乾場
/** 到頂點了嗎（只看值）。 */
export const isPeak = (level) => (Number(level) || 0) >= PEAK_AT;
/** 這次開始做愛會不會是榨乾場：妻子以上＋飢渴 ≥ PEAK_AT（不看滿足期：值本身就說明她沒被滿足）。 */
export function marathonEligible(who, { stageKey = who?.stage, now = Date.now() } = {}) {
  if (!who || !atLeast(stageKey, "wife")) return false;
  return isPeak(peekHunger(who, now, stageKey));
}
/** 開始榨乾場：回傳場次物件（放在做愛 session 上，不進存檔；重新整理＝這場結束）。 */
export function startMarathon(who, { stageKey = who?.stage, now = Date.now() } = {}) {
  const level = tickHunger(who, now, stageKey);
  return { active: true, done: false, startLevel: level, level, orgasms: 0, at: now, finale: null };
}
/** 還鎖著嗎（不能停／不能離開）。 */
export function marathonLocked(m) {
  return !!m && !!m.active && !m.done;
}
/** 照現在的值還要她高潮幾次。 */
export function marathonOrgasmsLeft(level) {
  return Math.max(0, Math.ceil((Number(level) || 0) / MARATHON_ORGASM_DROP));
}
/** 榨乾場裡她高潮一次：飢渴 −MARATHON_ORGASM_DROP（進滿足期、清掉「求」）；歸 0 → done（解鎖）。 */
export function marathonOrgasm(who, m, { stageKey = who?.stage, now = Date.now() } = {}) {
  if (!marathonLocked(m)) return null;
  const h = ensureHunger(who, now);
  if (!h) return null;
  const before = tickHunger(who, now, stageKey);
  h.level = r1(Math.max(0, before - MARATHON_ORGASM_DROP));
  h.satedUntil = Math.max(h.satedUntil || 0, now + HUNGER_SATED_MS.orgasm);
  h.beg = null;
  h.last = { kind: "orgasm", at: now, drop: r1(before - h.level) };
  m.orgasms += 1;
  m.level = h.level;
  if (h.level <= 0) {
    m.done = true;
    m.active = false;
  }
  return { before, after: h.level, drop: r1(before - h.level), done: m.done, left: marathonOrgasmsLeft(h.level) };
}

// ------------------------------------------------------------ 女友起：欲求不滿脾氣
/** 打開聊天時：要不要帶一點不耐煩（有冷卻；會寫 temperAt）。回傳 noteMood 用的 {type,level,cause} 或 null。 */
export function temperOnOpen(who, { stageKey = who?.stage, now = Date.now() } = {}) {
  if (!atLeast(stageKey, "dating")) return null;
  const lv = tickHunger(who, now, stageKey);
  if (lv < TEMPER_AT) return null;
  const h = ensureHunger(who, now);
  if (now - (h.temperAt || 0) < TEMPER_COOLDOWN_MS) return null;
  if (atLeast(stageKey, "wife") && begActive(who, now)) return null;   // 特地來求的，不擺臉色
  h.temperAt = now;
  const level = Math.round(10 + (lv - TEMPER_AT) / (HUNGER_MAX - TEMPER_AT) * 18);
  return { type: "angry", level, cause: "欲求不滿，被小事惹得心煩" };
}

// ------------------------------------------------------------ 其他系統的小接口
/** 腦袋佔有度來源（朋友起、很高才有）。 */
export function hungerOccupancyPts(who, now = Date.now(), stageKey = who?.stage) {
  if (!atLeast(stageKey, "friend")) return 0;
  const lv = peekHunger(who, now, stageKey);
  if (lv < OCC_AT) return 0;
  return Math.round(OCC_MIN + (lv - OCC_AT) / (HUNGER_MAX - OCC_AT) * (OCC_MAX - OCC_MIN));
}
/** 朋友起：飢渴時被碰，性奮多漲一點（每下 +1／+2）。 */
export function hungerArousalBonus(who, now = Date.now(), stageKey = who?.stage) {
  if (!atLeast(stageKey, "friend")) return 0;
  const t = hungerTier(peekHunger(who, now, stageKey));
  return t === "peak" || t === "high" ? 2 : t === "mid" ? 1 : 0;
}
/** 房間活動用：{hunger, hungerBeg}。 */
export function activityHunger(who, { stageKey = who?.stage, now = Date.now(), calm = false } = {}) {
  return { hunger: peekHunger(who, now, stageKey), hungerBeg: canBeg(who, { stageKey, now, calm }) };
}

// ------------------------------------------------------------ prompt（絕不寫數字）
/**
 * 聊天 system prompt 的幾行。opening：第一句。
 */
export function hungerPromptLines(who, { stageKey = who?.stage, now = Date.now(), opening = false } = {}) {
  const lv = peekHunger(who, now, stageKey);
  const tier = hungerTier(lv);
  const band = stageBand(stageKey);
  const out = [];
  if (tier === "low") return out;
  const begging = band === "wife" && begActive(who, now);
  out.push("【身體的渴望】（不要說出任何數字或「飢渴值」這種字眼）");
  if (band === "reserved") {
    if (tier === "mid") return [];
    out.push("你已經好一陣子沒被碰，身體有點燥熱、坐不太住。但你們還不熟：你絕對不說出口、不提性、不暗示，照平常的樣子講話，頂多有點心不在焉。");
    return out;
  }
  // 朋友起：心不在焉
  if (tier === "mid") out.push("你有點想要，身體微微發熱，偶爾走神、恍神半拍；嘴上不說。");
  else out.push(`你${tier === "peak" ? "已經快受不了了" : "很久沒被滿足了"}，腦袋常常飄走：回話慢半拍、偶爾答非所問、視線會飄到他身上，身體發熱、會不自覺夾腿。`);
  if (band === "friend") {
    out.push("你們只是朋友：不主動說想要、不提性，被問到就裝沒事、搪塞過去。");
    return out;
  }
  // 女友起：欲求不滿脾氣
  if (begging) {
    // 特地來求的：不擺臉色（脾氣那段跳過）
  } else if (tier !== "mid") {
    out.push(tier === "peak"
      ? "你欲求不滿到快爆了：很容易被小事惹毛，口氣沖、帶著怨氣，會抱怨他都不碰你、是不是對你沒興趣了。"
      : "你有點欲求不滿：比平常容易不耐煩、會為小事鬧彆扭，話裡帶點怨氣，暗示他好久沒碰你了。");
  } else out.push("偶爾會撒嬌地貼過來，暗示想被抱。");
  if (band === "dating") {
    out.push(tier === "peak" ? "可以暗示、可以抱怨，但還不會直接開口求他做愛。" : "用撒嬌或鬧彆扭表現，不要直接講要做愛。");
    return out;
  }
  // 妻子起：色色的話；很高時主動求
  if (tier === "mid") out.push("身為他的妻子，你會說些色色的暗示話（例如身體好熱、晚上要他負責、想被他抱著睡），點到為止。");
  else if (tier === "high") out.push("你會說露骨一點的色色話，明講想要他、想被他碰，撒嬌地勾他。");
  else out.push("你滿腦子都是他，話很露骨：會直接說想做愛、想被他填滿，一邊說一邊黏過去。");
  if (begging) {
    out.push(opening
      ? "你剛才是自己走到他面前來的——就是來求他跟你做愛的。第一句就直接、撒嬌又難耐地求他（像「老公…我忍不住了，抱我好不好」那樣），不要先聊別的。"
      : "你是特地過來求他做愛的；他如果拒絕或岔開話題，你會失落、賭氣，但還是黏著他。");
  }
  return out;
}

/** 開場旁白補充（enterOpener 用）。 */
export function hungerOpenerHint(who, { stageKey = who?.stage, now = Date.now() } = {}) {
  const band = stageBand(stageKey);
  const tier = hungerTier(peekHunger(who, now, stageKey));
  if (band === "wife" && begActive(who, now)) return "她是自己走到他面前來求歡的，第一句就撒嬌地求他抱她、跟她做";
  if (tier === "low" || tier === "mid") return "";
  if (band === "dating") return "她欲求不滿，開口就帶點不耐煩和怨氣";
  if (band === "wife") return "她很想要他，開口就帶著色色的暗示";
  if (band === "friend") return "她有點心不在焉、身體發熱，但嘴上不說";
  return "";
}

/** test_room 除錯一行。 */
export function hungerLabel(who, now = Date.now(), stageKey = who?.stage) {
  const h = body(who)?.hunger;
  const lv = peekHunger(who, now, stageKey);
  const tier = hungerTier(lv);
  const rate = hungerRate(who, stageKey);
  const sated = h && now < (Number(h.satedUntil) || 0) ? `・滿足中 ${Math.ceil((h.satedUntil - now) / 60e3)} 分` : "";
  const beg = begActive(who, now) ? "・正在求" : h?.begAt ? `・上次求 ${Math.round((now - h.begAt) / 60e3)} 分前` : "";
  const last = h?.last ? `・上次 −${h.last.drop}（${{ orgasm: "高潮", creampie: "內射", touch: "碰" }[h.last.kind] || h.last.kind}）` : "";
  return `${Math.round(lv)}/100 ${HUNGER_TIER_ZH[tier]}・+${r1(rate)}/時（${libidoGrade(who)}）${sated}${beg}${last}｜${bandLabel(stageKey)}`;
}
