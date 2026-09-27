/** 侵犯值 0–100：依關係階段倍率與失神抑制累加；滿值則逃離房間。 */

import { ensureBody } from "./body_state.js?v=8";

export const INVASION_MAX = 100;

/** 與 test_room_summon STAGE_LADDER key 對齊。 */
export const STAGE_INVASION_MULT = {
  stranger: 1.0,
  acquaintance: 0.85,
  friend: 0.7,
  close_friend: 0.55,
  girlfriend: 0.4,
  passionate: 0.28,
  lover: 0.18,
  wife: 0.12,
  devoted_wife: 0.06,
  obedient_wife: 0,
  pathological_wife: 0,
};

/** 陌生階段基礎亂數區間（含端點）。 */
export const INVASION_RANGES = {
  waist:         [15, 20],
  breast:        [22, 28],
  butt:          [22, 28],
  breast_knead:  [28, 35],
  breast_suck:   [30, 38],
  nipple_lick:   [30, 38],
  labia:         [35, 45],
  labia_rub:     [42, 52],
  finger_in:     [50, 65],
  vagina_finger: [55, 70],
  cervix_rub:    [60, 80],
  // 抽出不另加侵犯（或極低）；未列則 0
  pull_out:      [0, 0],
};

function clampInv(n) {
  return Math.max(0, Math.min(INVASION_MAX, Math.round(Number(n) || 0)));
}

function randInclusive(lo, hi) {
  const a = Math.round(Number(lo) || 0);
  const b = Math.round(Number(hi) || 0);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function ensureInvasion(who) {
  const b = ensureBody(who);
  if (!b) return null;
  b.invasion = clampInv(b.invasion);
  return b;
}

export function getInvasion(who) {
  return ensureInvasion(who)?.invasion || 0;
}

export function stageInvasionMult(stageKey) {
  const key = String(stageKey || "stranger");
  if (key in STAGE_INVASION_MULT) return STAGE_INVASION_MULT[key];
  return STAGE_INVASION_MULT.stranger;
}

/**
 * round(rand(lo,hi) * stageMult * (1 - stun/150))
 * mult 0 → add 0
 * @returns {{ added: number, invasion: number, fled: boolean }}
 */
export function applyInvasionRoll(who, actId, { stage = "stranger", stun = 0 } = {}) {
  const b = ensureInvasion(who);
  if (!b) return { added: 0, invasion: 0, fled: false };
  const range = INVASION_RANGES[actId];
  if (!range) return { added: 0, invasion: b.invasion || 0, fled: false };
  const mult = stageInvasionMult(stage);
  if (mult <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX };
  }
  const [lo, hi] = range;
  if (hi <= 0 && lo <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX };
  }
  const base = randInclusive(lo, hi);
  const stunDamp = Math.max(0, 1 - (Math.max(0, Number(stun) || 0) / 150));
  const added = Math.round(base * mult * stunDamp);
  b.invasion = clampInv((b.invasion || 0) + added);
  return {
    added,
    invasion: b.invasion,
    fled: b.invasion >= INVASION_MAX,
  };
}

/** 閒聊／閒置輕微衰減：預設 −1..2。 */
export function decayInvasion(who, amount = null) {
  const b = ensureInvasion(who);
  if (!b) return 0;
  const drop = amount == null
    ? (1 + Math.floor(Math.random() * 2)) // 1 or 2
    : Math.max(0, Math.round(Number(amount) || 0));
  const before = b.invasion || 0;
  b.invasion = clampInv(before - drop);
  return before - b.invasion;
}

export function clearInvasion(who) {
  const b = ensureInvasion(who);
  if (!b) return;
  b.invasion = 0;
}

export function invasionHint(who) {
  const inv = getInvasion(who);
  return `侵犯 ${inv}/${INVASION_MAX}`;
}
