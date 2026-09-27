/** 房間聊天：程式化「失神」亂語（非只靠 prompt）。 */

import { ensureBody, talkActById } from "./body_state.js?v=8";
import { insertUnlocked } from "./tease.js?v=4";

const SHOCK_MAX = 45;

/** 痙攣持續 10 分鐘。 */
export const SPASM_MS = 10 * 60 * 1000;
export const SPASM_ENTER_STUN = 70;

/** 動作／命中部位 → 短暫衝擊 */
const SHOCK_BY_ID = {
  waist: 2,
  butt: 4,
  thigh: 5,
  breast: 5,
  breast_knead: 8,
  breast_suck: 10,
  nipple: 8,
  nipple_lick: 10,
  labia: 10,
  labia_rub: 14,
  clit: 14,
  vagina: 12,
  vagina_finger: 18,
  finger_in: 28,
  fingers_out: 12,
  pull_out: 12,
  uterus: 22,
  cervix_rub: 24,
  creampie: 24,
  penis_in: 26,
  vibe_in: 18,
  dildo_in: 20,
  cucumber_in: 18,
  anus: 14,
  lips: 4,
};

/** 動作地板：深部較高。 */
const FLOOR_ACT = {
  waist: 0,
  butt: 0,
  breast: 4,
  breast_knead: 8,
  breast_suck: 10,
  nipple_lick: 10,
  labia: 12,
  labia_rub: 16,
  finger_in: 42,
  vagina_finger: 48,
  cervix_rub: 55,
  pull_out: 16,
};

const MOANS = ["嗯…", "啊…", "哈啊…", "唔…", "嗯啊…", "咿…", "……"];
const STUN_BITS = [
  "啊…！",
  "嗯啊…",
  "哈…啊…",
  "不要…嗯…",
  "還要…啊…",
  "頭、腦袋…",
  "說、說不了…",
  "咿嗯…！",
  "……哈啊",
  "等、等一下…啊",
];

/** 50–64：空白語氣——短、稀疏、…… */
const BLANK_BITS = [
  "……",
  "……嗯",
  "……啊",
  "……。",
  "嗯……",
  "……哈",
  "……唔",
  "…………",
];

/** 65–74：求饒語氣——求停／求慢／軟，可混空白 */
const BEG_BITS = [
  "求、求你…停…",
  "慢、慢一點…",
  "不要…再…",
  "等一下…求你…",
  "輕、輕一點…嗯…",
  "受、受不了…停…",
  "拜託…慢…",
  "求饒…啊…",
  "不要那麼…深…",
  "讓我…緩一下…",
];

const SPASM_BITS = [
  "噫…！身、身體…抽…",
  "哈啊…哈啊…停、停不下來…",
  "腳…軟…嗯嗯…！",
  "去、去了…啊啊…",
  "顫、顫抖…說不了…",
  "嗯咿…！頭…空白…",
];
const PAIN_BITS = [
  "痛…！不要碰…！",
  "過、過敏…好痛…",
  "啊痛…求你停…",
  "碰不得…太、太過了…",
  "不要…痛死了…嗯…！",
  "禁、禁臠…碰一下就…痛…",
];

const ACT_BITS = {
  waist: ["腰…嗯…", "好癢…"],
  butt: ["臀…嗯…", "不要摸…"],
  thigh: ["大腿…熱…", "再往上…嗯"],
  clit: ["陰蒂…！", "那裡…不行…", "嗯咿…！", "碰、碰到…"],
  labia: ["陰唇…熱…", "滑…嗯…", "不要摸…啊"],
  labia_rub: ["陰唇…揉…！", "滑膩…嗯啊…", "不要一直揉…"],
  vagina: ["裡面…", "穴口…嗯…", "進、進來…"],
  vagina_finger: ["扣…！", "裡面…攪…", "指尖…啊嗯…"],
  finger_in: ["手指…！", "裡面滿…", "攪…啊嗯…", "拔、不要拔…"],
  pull_out: ["空了…！", "嗯啊…抽出…", "還、還要…"],
  breast: ["胸…嗯…", "摸…哈…"],
  breast_knead: ["奶…揉…嗯…", "用力…哈啊…"],
  breast_suck: ["吸…！", "乳…含著…嗯"],
  nipple: ["乳頭…！", "乳尖…麻…"],
  nipple_lick: ["舔…奶頭…！", "舌尖…麻…"],
  cervix_rub: ["宮口…！", "最裡面…啊…", "揉、揉到…！"],
  uterus: ["子宮…！", "宮口…麻…"],
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

function pick(arr) {
  return arr[Math.floor(Math.random() * arr.length)] || "";
}

function decayShock(b) {
  if (!b) return;
  const now = Date.now();
  const at = Number(b.shockAt) || 0;
  if (!at || !(b.shock > 0)) return;
  const elapsed = now - at;
  if (elapsed < 3500) return;
  const steps = Math.floor(elapsed / 3500);
  b.shock = clamp((b.shock || 0) - steps * 12, 0, SHOCK_MAX);
  b.shockAt = now;
}

/** 確保冲击欄位存在（寫在 bodyState 上，隨 persistRoom 保存）。 */
export function ensureStunFields(who) {
  const b = ensureBody(who);
  if (!b) return null;
  b.shock = clamp(b.shock, 0, SHOCK_MAX);
  b.shockAt = Number(b.shockAt) || 0;
  b.shockRepliesLeft = Math.max(0, Number(b.shockRepliesLeft) || 0);
  b.talkExchangeCount = Math.max(0, Math.round(Number(b.talkExchangeCount) || 0));
  b.spasmUntil = Math.max(0, Number(b.spasmUntil) || 0);
  b.overstim = !!b.overstim;
  if (b.spasmUntil && Date.now() >= b.spasmUntil) {
    b.spasmUntil = 0;
    b.overstim = false;
  }
  return b;
}

export function noteActShock(who, actOrHitId) {
  const b = ensureStunFields(who);
  if (!b) return 0;
  const id = String(actOrHitId || "");
  let add = SHOCK_BY_ID[id] || (id ? 8 : 0);
  if ((id === "finger_in" || id === "vagina_finger" || id === "cervix_rub") && !insertUnlocked(who)) {
    add = Math.min(add, 5);
  }
  const peripheral = ["waist", "butt", "thigh", "breast", "breast_knead"].includes(id);
  if (peripheral) add = Math.min(add, id === "breast_knead" ? 8 : 6);
  if (!add) return b.shock;
  if (peripheral) {
    b.shock = clamp(Math.max(b.shock || 0, add) + Math.floor(add / 2), 0, 16);
  } else if (id === "labia" || id === "labia_rub" || id === "clit" || id === "nipple_lick" || id === "breast_suck") {
    b.shock = clamp((b.shock || 0) + add, 0, 32);
  } else {
    b.shock = clamp((b.shock || 0) + add, 0, SHOCK_MAX);
  }
  b.shockAt = Date.now();
  const deep = id === "finger_in" || id === "vagina_finger" || id === "cervix_rub";
  b.shockRepliesLeft = Math.max(b.shockRepliesLeft || 0, deep ? 2 : 1);
  return b.shock;
}

export function tickStunAfterReply(who) {
  const b = ensureStunFields(who);
  if (!b) return;
  if (b.shockRepliesLeft > 0) {
    b.shockRepliesLeft -= 1;
    b.shock = clamp((b.shock || 0) - 16, 0, SHOCK_MAX);
  } else {
    b.shock = clamp((b.shock || 0) - 10, 0, SHOCK_MAX);
  }
  b.shockAt = Date.now();
}

/**
 * 失神分數 0–100。
 * arousal→最多約40；libido 加成／倍率；器官濕腫塞；shock 暫衝。
 * 軟頂改依開放度（取代 teaseStage）。
 */
export function calcStun(who) {
  const b = ensureStunFields(who);
  if (!b) return 0;
  decayShock(b);
  const o = b.organs || {};
  const arousalPts = (clamp(b.arousal, 0, 30) / 30) * 34;
  const libidoBoost = (clamp(b.libido, 0, 30) / 30) * 12;
  const open = Math.max(0, Math.min(100, Number(b.openness) || 0));
  // 開放度壓低週邊失神：0→0.35，55→約0.7，100→1.0
  const openScale = 0.35 + (open / 100) * 0.65;
  let organ = 0;
  organ += (o.clit?.swell || 0) * 3;
  if (o.clit?.wet) organ += 4;
  organ += (o.labia?.swell || 0) * 2;
  if (o.labia?.wet) organ += 3;
  organ += (o.vagina?.wet || 0) * 3;
  if (o.vagina?.stuffed) organ += insertUnlocked(who) ? 10 : 4;
  if (o.anus?.stuffed) organ += 5;
  organ += (o.uterus?.semen || 0) * 2;
  if ((o.nipples?.swell || 0) >= 2) organ += 2;
  if ((o.breasts?.swell || 0) >= 2) organ += 2;
  organ *= openScale;

  const libMult = 0.85 + (clamp(b.libido, 0, 30) / 30) * 0.25;
  const shock = clamp(b.shock || 0, 0, SHOCK_MAX);
  let score = (arousalPts + organ) * libMult + libidoBoost + shock;
  // 未插入前軟頂：低開放度壓失神跳過 LLM
  if (!o.vagina?.stuffed) {
    const softCap = open < 32 ? 38 : open < 55 ? 50 : open < 78 ? 64 : 80;
    score = Math.min(score, softCap);
  }
  return clamp(score, 0, 100);
}

export function stunFloorForAct(actId, who = null) {
  if (!actId) return 0;
  if (actId === "finger_in" || actId === "vagina_finger" || actId === "cervix_rub") {
    if (who && insertUnlocked(who)) return FLOOR_ACT[actId] ?? 42;
    return 8;
  }
  return FLOOR_ACT[actId] ?? 0;
}

/** 含動作地板的有效失神值。 */
export function effectiveStun(who, actId = "") {
  return Math.max(calcStun(who), stunFloorForAct(actId, who));
}

/**
 * calm <25 | interfere 25–49 | blank 50–64 | beg 65–74 | stun ≥75
 * （舊 broken 拆成 blank／beg）
 */
export function stunTier(stun) {
  const s = clamp(stun, 0, 100);
  if (s >= 75) return "stun";
  if (s >= 65) return "beg";
  if (s >= 50) return "blank";
  if (s >= 25) return "interfere";
  return "calm";
}

export function inSpasm(who) {
  const b = ensureStunFields(who);
  if (!b) return false;
  return !!(b.spasmUntil && Date.now() < b.spasmUntil);
}

export function inOverstim(who) {
  const b = ensureStunFields(who);
  return !!(b && b.overstim && inSpasm(who));
}

/**
 * 高失神後繼續挑逗 → 痙攣；痙攣中再挑逗 → 過感痛苦。
 */
export function applyTeaseSpasm(who, actId = "", stunBefore = null) {
  const b = ensureStunFields(who);
  if (!b) return { enteredSpasm: false, enteredPain: false, mode: "normal" };
  let enteredSpasm = false;
  let enteredPain = false;
  if (inSpasm(who)) {
    if (actId) {
      b.overstim = true;
      enteredPain = true;
      b.spasmUntil = Math.max(b.spasmUntil, Date.now() + Math.floor(SPASM_MS / 2));
    }
  } else if (actId && stunBefore != null && stunBefore >= SPASM_ENTER_STUN) {
    b.spasmUntil = Date.now() + SPASM_MS;
    b.overstim = false;
    enteredSpasm = true;
  }
  const mode = inOverstim(who) ? "pain" : inSpasm(who) ? "spasm" : "normal";
  return { enteredSpasm, enteredPain, mode };
}

export function spasmTemplate(who, actId = "") {
  ensureStunFields(who);
  const pool = inOverstim(who)
    ? [...PAIN_BITS, ...STUN_BITS.slice(0, 3)]
    : [...SPASM_BITS, ...(ACT_BITS[actId] || []), ...MOANS];
  const n = 2 + Math.floor(Math.random() * 2);
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(pool));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 28);
}

/** 每完成一輪對話 +1；每 2–3 輪降性奮／衝擊。 */
export function noteTalkExchange(who) {
  const b = ensureStunFields(who);
  if (!b) return b;
  b.talkExchangeCount = (b.talkExchangeCount || 0) + 1;
  if (b.talkExchangeCount % 3 === 0 && !inSpasm(who)) {
    b.arousal = clamp((b.arousal || 0) - 2, 0, 30);
    b.shock = clamp((b.shock || 0) - 8, 0, SHOCK_MAX);
  }
  return b;
}

export function shouldSkipLlm(stun, who = null) {
  if (who && inSpasm(who)) return true;
  return clamp(stun, 0, 100) >= 75;
}

function stripCausal(text) {
  return String(text || "")
    .replace(/(?:因為|所以|畢竟|也就是說|總之|簡單說|換句話說)[^。！？…\n]*/g, "")
    .replace(/(?:我覺得|其實|不過|但是|雖然|如果|而且)[^，。！？…\n]*/g, "")
    .replace(/[，,]{2,}/g, "，")
    .replace(/\s+/g, " ")
    .trim();
}

function splitClauses(text) {
  return String(text || "")
    .split(/(?<=[。！？…!?]|\n)|[，,、]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function keepScrap(clause) {
  const s = String(clause || "").trim();
  if (!s) return "";
  if (/^(嗯|啊|唔|哈|咿|呀|喔|哦|……|…)+[!！?？]*$/.test(s)) return s;
  if (/不要|還要|不行|等一下|那裡|裡面|陰蒂|陰唇|乳頭|好爽|不行了|求|停|慢/.test(s)) {
    return s.length > 10 ? s.slice(0, 10) : s;
  }
  if (s.length <= 6) return s;
  if (s.length <= 12 && /[嗯啊唔哈咿呀]/.test(s)) return s.slice(0, 8);
  return "";
}

function insertBreaths(text) {
  const parts = splitClauses(text);
  if (!parts.length) return pick(MOANS);
  const out = [];
  for (let i = 0; i < parts.length; i++) {
    let p = parts[i];
    if (p.length > 18) {
      const cut = Math.max(6, Math.floor(p.length / 2));
      out.push(`${p.slice(0, cut)}…`);
      out.push(pick(MOANS));
      out.push(p.slice(cut));
    } else {
      out.push(p);
    }
    if (i < parts.length - 1 && Math.random() < 0.55) out.push(pick(MOANS));
  }
  return out.join("").replace(/(…)+/g, "…").trim();
}

function scrambleBroken(text, actId = "") {
  const stripped = stripCausal(text);
  const scraps = splitClauses(stripped).map(keepScrap).filter(Boolean);
  const bits = scraps.slice(0, 3);
  if (bits.join("").replace(/[。．…！!？?\s]/g, "").length < 4) {
    return blankTemplate(actId);
  }
  if (Math.random() < 0.75) bits.splice(Math.min(1, bits.length), 0, pick(MOANS));
  while (bits.length < 2) bits.push(pick(MOANS));
  let out = bits.join("");
  if (out.length > 28) out = out.slice(0, 28) + "…";
  out = stripCausal(out).replace(/^[。．…！!？?\s]+/, "").trim();
  if (!out || out.length < 2) return blankTemplate(actId);
  return out;
}

function blankTemplate(actId = "") {
  const actBits = ACT_BITS[actId] || [];
  const pool = [...BLANK_BITS, ...MOANS.slice(0, 3)];
  // 極稀疏：1–2 片，常只有 ……
  if (Math.random() < 0.45) return pick(BLANK_BITS);
  const parts = [pick(pool)];
  if (Math.random() < 0.35 && actBits.length) parts.push(pick(actBits).slice(0, 4));
  else if (Math.random() < 0.4) parts.push(pick(BLANK_BITS));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 16);
}

function begTemplate(actId = "") {
  const actBits = ACT_BITS[actId] || [];
  const pool = [...BEG_BITS, ...BLANK_BITS.slice(0, 3), ...actBits.slice(0, 2)];
  const parts = [];
  // 求饒為主，偶爾夾空白
  parts.push(pick(BEG_BITS));
  if (Math.random() < 0.55) {
    parts.push(Math.random() < 0.4 ? pick(BLANK_BITS) : pick(pool));
  }
  return parts.join("").replace(/(…)+/g, "…").slice(0, 24);
}

export function stunTemplate(stun, actId = "") {
  const tier = stunTier(stun);
  if (tier === "blank") return blankTemplate(actId);
  if (tier === "beg") return begTemplate(actId);
  const actBits = ACT_BITS[actId] || ACT_BITS[talkActById(actId)?.hitId] || [];
  const pool = tier === "stun"
    ? [...STUN_BITS, ...actBits, ...MOANS]
    : [...MOANS, ...actBits, "等、等一下…", "嗯…哈…"];
  const n = tier === "stun" ? 2 + Math.floor(Math.random() * 2) : 2;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(pool));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 24);
}

/**
 * 依失神階改寫回覆。≥75 應走模板；若仍傳入則整段替換。
 * 50–64 空白；65–74 求饒混空白；痙攣／過感覆寫。
 */
export function scrambleReply(text, stun, actId = "", who = null) {
  if (who && inSpasm(who)) {
    return spasmTemplate(who, actId);
  }
  const s = clamp(stun, 0, 100);
  const tier = stunTier(s);
  const raw = String(text || "").trim();
  if (tier === "calm") {
    if (raw.length > 80) return raw.slice(0, 72) + "…";
    return raw || "……";
  }
  if (tier === "stun" || !raw) return stunTemplate(s, actId);
  if (tier === "blank") {
    // LLM 回覆壓成空白碎片，或整段換成空白模板
    if (Math.random() < 0.6) return blankTemplate(actId);
    const scraps = splitClauses(stripCausal(raw)).map(keepScrap).filter(Boolean).slice(0, 2);
    if (!scraps.length) return blankTemplate(actId);
    return (scraps.join("") + (Math.random() < 0.5 ? "……" : "")).slice(0, 18);
  }
  if (tier === "beg") {
    // 求饒模板為主，偶留一點原文碎片
    if (Math.random() < 0.7 || !raw) return begTemplate(actId);
    const scraps = splitClauses(stripCausal(raw)).map(keepScrap).filter(Boolean).slice(0, 1);
    const beg = pick(BEG_BITS);
    return (beg + (scraps[0] || pick(BLANK_BITS))).replace(/(…)+/g, "…").slice(0, 24);
  }
  if (tier === "interfere") {
    let out = insertBreaths(raw);
    if (out.length > 56) out = out.slice(0, 52) + "…";
    return out || pick(MOANS);
  }
  return scrambleBroken(raw, actId);
}

/** 給 UI／除錯：當前分數與階。 */
export function stunSnapshot(who, actId = "") {
  const score = effectiveStun(who, actId);
  const mode = inOverstim(who) ? "pain" : inSpasm(who) ? "spasm" : "normal";
  return {
    stun: score,
    base: calcStun(who),
    tier: stunTier(score),
    skipLlm: shouldSkipLlm(score, who),
    shock: ensureStunFields(who)?.shock || 0,
    mode,
    spasmUntil: ensureStunFields(who)?.spasmUntil || 0,
  };
}
