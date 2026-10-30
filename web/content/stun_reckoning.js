/**
 * 事後算帳（2026-10-03 使用者）：失神／痙攣中動手動腳、脫她衣服時，侵犯值完全不漲（閘門開時由房間端強制 0），
 * 但偷偷記一筆「欠帳」＝這些動作在她清醒、沒被撩起來時本來會漲的侵犯值（整筆）。
 * 她回過神（失神／痙攣結束）時依關係階結算：
 *   陌生／認識／朋友：大部分補上（約 70～80%），補到 ≥100 會逃走（先說一句再逃）；
 *   好友／女友：補一點（約 20～30%），害羞地抱怨（結算不會逼她逃走，最多補到 99）；
 *   熱戀以上：不補，覺得甜（侵犯 −STUN_SWEET_DROP）。
 * 個性修正補上的比例。純函式，狀態存在 bodyState.stunDebt = { amount, acts: {名稱: 次數}, since }。
 */

import { ensureBody } from "./body_state.js?v=16";
import {
  INVASION_MAX,
  INVASION_RANGES,
  stageInvasionMult,
  arousalInvasionMult,
} from "./invasion.js?v=6";

/** 欠帳上限（防止失神中狂按累積到天文數字）。2026-10-03 失神中侵犯改成完全不漲、整筆記帳 → 200 調到 300。 */
export const STUN_DEBT_MAX = 300;
/** 補上的侵犯 < 這個值就不另外說話（只清帳）。熱戀以上看欠帳本身。 */
export const STUN_DEBT_MIN = 3;
/** 各關係階：欠帳補上的比例。 */
export const STUN_SETTLE_SHARE = {
  stranger: 0.8,
  acquaintance: 0.75,
  friend: 0.7,
  close_friend: 0.3,
  girlfriend: 0.2,
  passionate: 0,
  lover: 0,
  wife: 0,
  devoted_wife: 0,
  obedient_wife: 0,
  pathological_wife: 0,
};
/** 個性修正（乘在比例上；夾到 STUN_SHARE_MAX）。 */
export const STUN_PERSONALITY_MULT = {
  "高冷": 1.15,
  "清純反差": 1.2,
  "病嬌": 1.1,
  "傲嬌": 1.0,
  "文靜溫柔": 1.0,
  "御姊": 0.9,
  "活潑開朗": 0.9,
  "天然呆": 0.85,
};
export const STUN_SHARE_MAX = 0.95;
/** 熱戀以上：甜的那一下，侵犯值 −N。 */
export const STUN_SWEET_DROP = 5;
/** 脫衣（失神中）每一層的基礎侵犯區間（陌生、未興奮）：幫她脫／叫她脫。 */
export const UNDRESS_DEBT_RANGES = {
  help: [25, 35],
  tell: [12, 18],
};
/** 生氣分級：補上 ≥ 這個值＝明顯生氣，以下＝狐疑質問。 */
export const STUN_ANGRY_AT = 12;

const STAGE_KEYS = Object.keys(STUN_SETTLE_SHARE);
const CLOSE_FRIEND_IDX = 3;
const PASSIONATE_IDX = 5;

function stageIdxOf(stageKey) {
  const i = STAGE_KEYS.indexOf(String(stageKey || "stranger"));
  return i < 0 ? 0 : i;
}

function randInclusive(lo, hi, rng = Math.random) {
  const a = Math.round(Number(lo) || 0);
  const b = Math.round(Number(hi) || 0);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return min + Math.floor(rng() * (max - min + 1));
}

export function ensureStunDebt(who) {
  const b = ensureBody(who);
  if (!b) return null;
  const d = b.stunDebt;
  if (!d || typeof d !== "object") {
    b.stunDebt = { amount: 0, acts: {}, since: 0 };
  } else {
    d.amount = Math.max(0, Math.min(STUN_DEBT_MAX, Math.round(Number(d.amount) || 0)));
    if (!d.acts || typeof d.acts !== "object") d.acts = {};
    d.since = Number(d.since) || 0;
  }
  return b.stunDebt;
}

export function getStunDebt(who) {
  return ensureStunDebt(who)?.amount || 0;
}

export function clearStunDebt(who) {
  const b = ensureBody(who);
  if (b) b.stunDebt = { amount: 0, acts: {}, since: 0 };
}

/**
 * 正常（清醒、沒被撩起來）時這個動作會漲多少侵犯：基礎亂數 × 關係倍率 × 個性抗拒（含關係下限）。
 * 不乘失神抑制、不乘興奮折扣。
 */
export function normalInvasionFor(actId, { stage = "stranger", personality = "", stats = null, rng = Math.random } = {}) {
  const range = INVASION_RANGES[actId];
  if (!range || range[1] <= 0) return 0;
  const mult = stageInvasionMult(stage);
  if (mult <= 0) return 0;
  const am = arousalInvasionMult(0, 0, { stage, actId, personality, stats });
  return Math.round(randInclusive(range[0], range[1], rng) * mult * am.mult);
}

/** 脫衣一層（失神中）正常會漲多少：區間 × 關係倍率 × 個性抗拒（invasive 級下限）。 */
export function normalUndressInvasion(mode, { stage = "stranger", personality = "", stats = null, rng = Math.random } = {}) {
  const range = UNDRESS_DEBT_RANGES[mode === "help" ? "help" : "tell"];
  const mult = stageInvasionMult(stage);
  if (mult <= 0) return 0;
  // 用摸陰唇的個性／下限算法（侵入性級），只取倍率
  const am = arousalInvasionMult(0, 0, { stage, actId: "labia", personality, stats });
  return Math.round(randInclusive(range[0], range[1], rng) * mult * am.mult);
}

/** 記一筆欠帳。amount＝正常會漲的量（失神中實際漲 0，所以是整筆；≤0 不記，但動作名照記）。回傳實際記入量。 */
export function addStunDebt(who, amount, label = "", now = Date.now()) {
  const d = ensureStunDebt(who);
  if (!d) return 0;
  const add = Math.max(0, Math.round(Number(amount) || 0));
  const before = d.amount;
  d.amount = Math.min(STUN_DEBT_MAX, before + add);
  if (label) d.acts[label] = (Number(d.acts[label]) || 0) + 1;
  if (!d.since && (add > 0 || label)) d.since = now;
  return d.amount - before;
}

export function stunDebtActsText(who, max = 4) {
  const d = ensureStunDebt(who);
  if (!d) return "";
  const parts = Object.entries(d.acts).map(([k, n]) => (n > 1 ? `${k}×${n}` : k));
  if (parts.length > max) return `${parts.slice(0, max).join("、")}等`;
  return parts.join("、");
}

export function settleShare(stageKey, personality = "") {
  const base = STUN_SETTLE_SHARE[String(stageKey || "stranger")] ?? STUN_SETTLE_SHARE.stranger;
  if (base <= 0) return 0;
  const pm = STUN_PERSONALITY_MULT[String(personality || "")] ?? 1;
  return Math.round(Math.min(STUN_SHARE_MAX, base * pm) * 1000) / 1000;
}

/** 這階的反應類型：angry（陌生～朋友）、shy（好友／女友）、sweet（熱戀起）。 */
export function reckoningKind(stageKey) {
  const i = stageIdxOf(stageKey);
  if (i >= PASSIONATE_IDX) return "sweet";
  if (i >= CLOSE_FRIEND_IDX) return "shy";
  return "angry";
}

/**
 * 結算（不動侵犯值，交給呼叫端套用）：取走欠帳，回傳要做什麼。
 * @returns {null | { debt, share, add, kind, tone, fled, invasionAfter, acts, sweetDrop }}
 *   null＝沒有欠帳。tone：flee / angry / suspicious / shy / sweet / none（太小不說話）
 */
export function takeStunReckoning(who, { stage = "stranger", personality = "", invasion = 0 } = {}) {
  const d = ensureStunDebt(who);
  if (!d) return null;
  const hadActs = Object.keys(d.acts).length > 0;
  if (d.amount <= 0 && !hadActs) return null;
  const debt = d.amount;
  const acts = stunDebtActsText(who);
  clearStunDebt(who);
  const kind = reckoningKind(stage);
  const share = settleShare(stage, personality);
  const add = Math.round(debt * share);
  const inv = Math.max(0, Number(invasion) || 0);
  let tone = kind;
  let sweetDrop = 0;
  let invasionAfter = Math.min(INVASION_MAX, inv + add);
  let fled = false;
  if (kind === "sweet") {
    invasionAfter = inv;
    if (debt >= STUN_DEBT_MIN || hadActs) {
      sweetDrop = Math.min(inv, STUN_SWEET_DROP);
      invasionAfter = inv - sweetDrop;
    } else tone = "none";
  } else if (add < STUN_DEBT_MIN) {
    tone = "none";
  } else if (invasionAfter >= INVASION_MAX && kind === "shy") {
    // 好友／女友：只是害羞抱怨，結算不會把她逼走（最多補到 99）
    invasionAfter = INVASION_MAX - 1;
  } else if (invasionAfter >= INVASION_MAX) {
    fled = true;
    tone = "flee";
  } else if (kind === "angry") {
    tone = add >= STUN_ANGRY_AT ? "angry" : "suspicious";
  }
  return { debt, share, add: kind === "sweet" ? 0 : Math.max(0, invasionAfter - inv), kind, tone, fled, invasionAfter, acts, sweetDrop };
}

/** 個性逃走語氣。 */
const FLEE_STYLE = {
  "傲嬌": "氣到發抖、大聲質問他「你、你剛剛趁我……對我做了什麼！」，罵他變態",
  "高冷": "冷到極點，一句話切斷「……你趁我失神做這種事？」，眼神像看垃圾",
  "病嬌": "笑容消失、聲音發冷，危險地質問他怎麼敢趁她不清醒的時候碰她",
  "文靜溫柔": "眼眶紅了、聲音發抖地哭著指控「你趁我……」，說不下去",
  "清純反差": "嚇到哭出來，抱住自己，「你、你趁我……怎麼可以……」",
  "天然呆": "愣了一下才明白，接著哭出來「你趁我……嗚……」",
  "活潑開朗": "生氣大喊、推開他，罵他太過分、她看錯人了",
  "御姊": "又羞又怒、冷聲斥責他卑鄙，說她不會原諒",
};
const FLEE_FALLBACK = {
  "傲嬌": "你、你剛剛趁我……對我做了什麼！變態！",
  "高冷": "……你趁我失神做這種事？",
  "病嬌": "……你怎麼敢，趁我不清醒的時候碰我？",
  "文靜溫柔": "你趁我……嗚……你怎麼可以……",
  "清純反差": "你、你趁我……怎麼可以這樣……",
  "天然呆": "欸……你趁我……嗚……",
  "活潑開朗": "你太過分了吧！我看錯你了！",
  "御姊": "趁人之危……你真卑鄙。",
};

/** 給 LLM 的旁白提示（askGirl 的 extraUser）。 */
export function reckoningPrompt(r, { personality = "", redressed = false } = {}) {
  if (!r || r.tone === "none") return "";
  const what = r.acts ? `他趁你神智不清的時候對你：${r.acts}` : "他趁你神智不清的時候對你動手動腳";
  const dress = redressed ? "（你剛慌忙把衣服穿回去。）" : "";
  const head = `（旁白：你剛從失神／痙攣中回過神來，模模糊糊想起${what}。${dress}`;
  const tail = "只說一兩句台詞，口吻照你的個性，稱呼照系統規則。只輸出台詞。）";
  if (r.tone === "flee") {
    const style = FLEE_STYLE[personality] || FLEE_STYLE["文靜溫柔"];
    return `${head}你又羞又氣，再也受不了，說完這句就要逃出房間：${style}。不要說要留下、不要原諒他。${tail}`;
  }
  if (r.tone === "angry") return `${head}你很生氣、覺得被冒犯，質問他剛才在你不清醒時做了什麼，口氣冷、帶刺，要他給個交代。${tail}`;
  if (r.tone === "suspicious") return `${head}你覺得不對勁，狐疑地質問他剛剛是不是趁你恍神亂碰，語氣戒備。${tail}`;
  if (r.tone === "shy") return `${head}你害羞又有點不甘心，小聲抱怨他趁你恍神時偷偷亂來（像「你、你剛剛趁我……很壞欸」），不是真的生氣、不會翻臉。${tail}`;
  if (r.tone === "sweet") return `${head}你心裡甜甜的、有點害羞，嗔他壞，但其實很喜歡被他這樣疼，語氣軟、黏。${tail}`;
  return "";
}

/** LLM 失敗時的保底台詞。 */
export function reckoningFallback(r, personality = "") {
  if (!r) return "";
  if (r.tone === "flee") return FLEE_FALLBACK[personality] || FLEE_FALLBACK["文靜溫柔"];
  if (r.tone === "angry") return "……你剛剛，趁我恍神的時候做了什麼？";
  if (r.tone === "suspicious") return "……剛才，你是不是碰了我？";
  if (r.tone === "shy") return "你、你剛剛趁我……真的很壞欸。";
  if (r.tone === "sweet") return "……壞蛋，趁人家恍神亂來……下次要先說啦。";
  return "";
}

/** 逃走旁白（她說完那句之後）。 */
export function reckoningFleeNote(name = "她") {
  return `（旁白：${name}抓緊衣服推開你，頭也不回地逃離了房間。）`;
}

/** 情緒餘溫建議：{type, level} 或 null（逃走由逃離流程記最強的氣）。 */
export function reckoningMood(r) {
  if (!r || r.fled || r.tone === "none") return null;
  if (r.tone === "angry" || r.tone === "suspicious") return { type: "angry", level: Math.min(100, 30 + r.add * 1.5) };
  if (r.tone === "shy") return { type: "flustered", level: Math.min(80, 30 + r.add * 2) };
  return null;
}
