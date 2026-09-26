/** 房間聊天：程式化「失神」亂語（非只靠 prompt）。 */

import { ensureBody, talkActById } from "./body_state.js?v=5";

const SHOCK_MAX = 45;

/** 動作／命中部位 → 短暫衝擊（回覆 1–2 次或數秒後衰減） */
const SHOCK_BY_ID = {
  clit: 36,
  labia: 28,
  vagina: 32,
  finger_in: 40,
  fingers_out: 22,
  pull_out: 22,
  uterus: 30,
  creampie: 38,
  penis_in: 40,
  vibe_in: 34,
  dildo_in: 36,
  cucumber_in: 34,
  nipple: 18,
  breast: 14,
  anus: 26,
  lips: 8,
  butt: 12,
};

const FLOOR_ACT = {
  clit: 55,
  labia: 50,
  vagina: 52,
  finger_in: 60,
  pull_out: 35,
  breast: 30,
  nipple: 32,
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
const ACT_BITS = {
  clit: ["陰蒂…！", "那裡…不行…", "嗯咿…！", "碰、碰到…"],
  labia: ["陰唇…熱…", "滑…嗯…", "不要揉…啊"],
  vagina: ["裡面…", "穴口…嗯…", "進、進來…"],
  finger_in: ["手指…！", "裡面滿…", "攪…啊嗯…", "拔、不要拔…"],
  pull_out: ["空了…！", "嗯啊…抽出…", "還、還要…"],
  breast: ["胸…嗯…", "揉…哈…"],
  nipple: ["乳頭…！", "乳尖…麻…"],
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
  return b;
}

export function noteActShock(who, actOrHitId) {
  const b = ensureStunFields(who);
  if (!b) return 0;
  const id = String(actOrHitId || "");
  const add = SHOCK_BY_ID[id] || (id ? 16 : 0);
  if (!add) return b.shock;
  b.shock = clamp((b.shock || 0) + add, 0, SHOCK_MAX);
  b.shockAt = Date.now();
  b.shockRepliesLeft = Math.max(b.shockRepliesLeft || 0, 2);
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
 */
export function calcStun(who) {
  const b = ensureStunFields(who);
  if (!b) return 0;
  decayShock(b);
  const o = b.organs || {};
  const arousalPts = (clamp(b.arousal, 0, 30) / 30) * 40;
  const libidoBoost = (clamp(b.libido, 0, 30) / 30) * 16;
  let organ = 0;
  organ += (o.clit?.swell || 0) * 4;
  if (o.clit?.wet) organ += 6;
  organ += (o.labia?.swell || 0) * 3;
  if (o.labia?.wet) organ += 5;
  organ += (o.vagina?.wet || 0) * 5;
  if (o.vagina?.stuffed) organ += 12;
  if (o.anus?.stuffed) organ += 8;
  organ += (o.uterus?.semen || 0) * 3;
  if ((o.nipples?.swell || 0) >= 2) organ += 2;

  const libMult = 0.88 + (clamp(b.libido, 0, 30) / 30) * 0.3;
  let score = (arousalPts + organ) * libMult + libidoBoost + clamp(b.shock || 0, 0, SHOCK_MAX);
  return clamp(score, 0, 100);
}

export function stunFloorForAct(actId) {
  if (!actId) return 0;
  return FLOOR_ACT[actId] || 30;
}

/** 含動作地板的有效失神值。 */
export function effectiveStun(who, actId = "") {
  return Math.max(calcStun(who), stunFloorForAct(actId));
}

export function stunTier(stun) {
  const s = clamp(stun, 0, 100);
  if (s >= 75) return "stun";
  if (s >= 50) return "broken";
  if (s >= 25) return "interfere";
  return "calm";
}

export function shouldSkipLlm(stun) {
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
  if (/不要|還要|不行|等一下|那裡|裡面|陰蒂|陰唇|乳頭|好爽|不行了/.test(s)) {
    return s.length > 10 ? s.slice(0, 10) : s;
  }
  // 短碎片才留
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
  // 說明句被剝光時，改塞反應碎片，避免只剩標點
  if (bits.join("").replace(/[。．…！!？?\s]/g, "").length < 4) {
    return stunTemplate(62, actId);
  }
  if (Math.random() < 0.75) bits.splice(Math.min(1, bits.length), 0, pick(MOANS));
  while (bits.length < 2) bits.push(pick(MOANS));
  let out = bits.join("");
  if (out.length > 28) out = out.slice(0, 28) + "…";
  out = stripCausal(out).replace(/^[。．…！!？?\s]+/, "").trim();
  if (!out || out.length < 2) return stunTemplate(62, actId);
  return out;
}

export function stunTemplate(stun, actId = "") {
  const tier = stunTier(stun);
  const actBits = ACT_BITS[actId] || ACT_BITS[talkActById(actId)?.hitId] || [];
  const pool = tier === "stun"
    ? [...STUN_BITS, ...actBits, ...MOANS]
    : tier === "broken"
      ? [...STUN_BITS.slice(0, 6), ...actBits, ...MOANS]
      : [...MOANS, ...actBits, "等、等一下…", "嗯…哈…"];
  const n = tier === "stun" ? 2 + Math.floor(Math.random() * 2) : 2;
  const parts = [];
  for (let i = 0; i < n; i++) parts.push(pick(pool));
  return parts.join("").replace(/(…)+/g, "…").slice(0, 24);
}

/**
 * 依失神階改寫回覆。≥75 應走模板；若仍傳入則整段替換。
 */
export function scrambleReply(text, stun, actId = "") {
  const s = clamp(stun, 0, 100);
  const tier = stunTier(s);
  const raw = String(text || "").trim();
  if (tier === "calm") {
    // 仍截斷超長說明
    if (raw.length > 80) return raw.slice(0, 72) + "…";
    return raw || "……";
  }
  if (tier === "stun" || !raw) return stunTemplate(s, actId);
  if (tier === "interfere") {
    let out = insertBreaths(raw);
    if (out.length > 56) out = out.slice(0, 52) + "…";
    return out || pick(MOANS);
  }
  // broken 50–74
  return scrambleBroken(raw, actId);
}

/** 給 UI／除錯：當前分數與階。 */
export function stunSnapshot(who, actId = "") {
  const score = effectiveStun(who, actId);
  return {
    stun: score,
    base: calcStun(who),
    tier: stunTier(score),
    skipLlm: shouldSkipLlm(score),
    shock: ensureStunFields(who)?.shock || 0,
  };
}
