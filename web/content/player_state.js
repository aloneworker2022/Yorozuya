/** 房間玩家：興奮累積與精液存量（與妹子分開，寫進 room session）。 */

export const SEMEN_MAX_CC = 20;
export const SEMEN_MIN_TEASE_CC = 6;
export const CLIMAX_MAX = 20;
/** 精液回復：每小時 +1 cc（真實時間）。 */
export const SEMEN_REGEN_CC_PER_HOUR = 1;

/** 各動作對玩家興奮的貢獻（max=20，約 4–10 次可射） */
export const CLIMAX_BY_ACT = {
  waist: 1,
  butt: 1,
  thigh: 2,
  breast: 2,
  nipple: 2,
  labia: 3,
  clit: 4,
  finger_in: 5,
  pull_out: 2,
  vagina: 3,
};

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Math.round(Number(n) || 0)));
}

export function emptyPlayer() {
  return {
    climax: 0,
    semenCc: SEMEN_MAX_CC,
    lastTeaseAt: 0,
    lastSemenAt: Date.now(),
  };
}

function normalizePlayer(player) {
  const base = emptyPlayer();
  const p = player && typeof player === "object" ? { ...base, ...player } : base;
  p.climax = clamp(p.climax, 0, CLIMAX_MAX);
  p.semenCc = clamp(p.semenCc, 0, SEMEN_MAX_CC);
  p.lastTeaseAt = Number(p.lastTeaseAt) || 0;
  p.lastSemenAt = Number(p.lastSemenAt) || Date.now();
  return p;
}

/** 依真實時間補精液（1 cc / hour）。不呼叫 ensurePlayer，避免循環。 */
export function regenSemen(player, now = Date.now()) {
  const p = normalizePlayer(player);
  const last = Number(p.lastSemenAt) || now;
  const elapsed = Math.max(0, now - last);
  const hours = elapsed / 3600000;
  const gain = Math.floor(hours * SEMEN_REGEN_CC_PER_HOUR);
  if (gain > 0) {
    p.semenCc = clamp(p.semenCc + gain, 0, SEMEN_MAX_CC);
    p.lastSemenAt = last + gain * 3600000;
  }
  return p;
}

export function ensurePlayer(player) {
  return regenSemen(normalizePlayer(player));
}

export function canTease(player) {
  const p = ensurePlayer(player);
  return p.semenCc >= SEMEN_MIN_TEASE_CC;
}

export function teaseBlockReason(player) {
  const p = ensurePlayer(player);
  if (p.semenCc >= SEMEN_MIN_TEASE_CC) return "";
  return `精液不足（${p.semenCc}cc，需≥${SEMEN_MIN_TEASE_CC}cc）`;
}

/**
 * 挑逗後累積興奮；達標則射精。
 * @returns {{ player, climaxed: boolean, spentCc: number, line: string }}
 */
export function applyTeaseClimax(player, actId) {
  const p = ensurePlayer(player);
  const add = CLIMAX_BY_ACT[actId] || 2;
  p.climax = clamp(p.climax + add, 0, CLIMAX_MAX);
  p.lastTeaseAt = Date.now();
  if (p.climax < CLIMAX_MAX) {
    return { player: p, climaxed: false, spentCc: 0, line: "" };
  }
  const spent = 13 + Math.floor(Math.random() * 4); // 13–16
  const before = p.semenCc;
  p.semenCc = clamp(p.semenCc - spent, 0, SEMEN_MAX_CC);
  const actual = before - p.semenCc;
  p.climax = 0;
  const line = actual > 0
    ? `（你射了——約 ${actual} cc。精液剩餘 ${p.semenCc} cc。）`
    : `（你想射，但幾乎沒有精液了。剩餘 ${p.semenCc} cc。）`;
  return { player: p, climaxed: true, spentCc: actual, line };
}

/** 編輯「恢復精液」：補滿並可選清興奮。 */
export function refillSemen(player, { resetClimax = true } = {}) {
  const p = ensurePlayer(player);
  p.semenCc = SEMEN_MAX_CC;
  p.lastSemenAt = Date.now();
  if (resetClimax) p.climax = 0;
  return p;
}

/** 閒置時玩家興奮略降（精液靠 regenSemen）。 */
export function decayPlayerIdle(player) {
  const p = ensurePlayer(player);
  if (p.climax > 0) p.climax = clamp(p.climax - 1, 0, CLIMAX_MAX);
  return p;
}

export function playerHint(player) {
  const p = ensurePlayer(player);
  return `興奮 ${p.climax}/${CLIMAX_MAX}・精液 ${p.semenCc}cc`;
}
