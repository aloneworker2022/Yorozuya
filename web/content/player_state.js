/** 房間玩家：興奮累積與精液存量（與妹子分開，寫進 room session）。 */

export const SEMEN_MAX_CC = 20;
/** 精液可以被肏（每射 −6cc）射到負數（2026-10-04 使用者：肏的精液池＝玩家真正剩下的精液）。下限只防壞值。 */
export const SEMEN_FLOOR_CC = -60;
export const SEMEN_MIN_TEASE_CC = 6;
export const CLIMAX_MAX = 20;

/**
 * 主遊戲獻祭擴充（app.js 掛在 globalThis.YorozuyaGrowth）。
 * 沙盒／測試沒掛就當 0。精液上限與興奮上限各 +1／級。
 */
export function expansionLevel(key) {
  try {
    const fn = globalThis.YorozuyaGrowth?.level;
    if (typeof fn !== "function") return 0;
    const n = Number(fn(key));
    if (!Number.isFinite(n) || n <= 0) return 0;
    return Math.min(99, Math.round(n));
  } catch {
    return 0;
  }
}

/** 精液上限 = 20 + 「精液量」等級。 */
export function semenMaxCc() {
  return SEMEN_MAX_CC + expansionLevel("semen");
}

/** 調戲時玩家興奮上限 = 20 + 「興奮上限」等級。滿了就射。 */
export function climaxMax() {
  return CLIMAX_MAX + expansionLevel("excite");
}
/**
 * 腎虧（2026-10-08 使用者）：精液量掉到 −7 以下（嚴格 < −7；精液量是整數，所以是 −8 起）
 * → 自動花 60～140 金看醫生，精液量回到 −1。金幣不夠就變負的（負債）。
 */
export const KIDNEY_BELOW_CC = -7;
export const KIDNEY_RESET_CC = -1;
export const DOCTOR_FEE_MIN = 60;
export const DOCTOR_FEE_MAX = 140;

/** 看醫生的錢：60～140 金（含兩端）。 */
export function rollDoctorFee(rng = Math.random) {
  const r = Math.min(0.999999, Math.max(0, Number(rng()) || 0));
  return DOCTOR_FEE_MIN + Math.floor(r * (DOCTOR_FEE_MAX - DOCTOR_FEE_MIN + 1));
}

/**
 * 精液量往下掉之後檢查腎虧。沒腎虧原樣回；腎虧就把精液量拉回 −1，回傳要付的醫藥費。
 * 只動精液量，不碰金幣（金幣是主遊戲的 state.gold，由呼叫端扣）。
 * @returns {{ player, triggered: boolean, fee: number, before: number }}
 */
export function kidneyCheck(player, rng = Math.random) {
  const p = ensurePlayer(player);
  const before = p.semenCc;
  if (!(before < KIDNEY_BELOW_CC)) return { player: p, triggered: false, fee: 0, before };
  p.semenCc = KIDNEY_RESET_CC;
  return { player: p, triggered: true, fee: rollDoctorFee(rng), before };
}

/** 精液回復：每小時 +1 cc（真實時間）。 */
export const SEMEN_REGEN_CC_PER_HOUR = 1;
/** 精液是負的（肏到透支）：每 5 小時才 +1 cc，回到 ≥0 後恢復每小時 +1（2026-10-04 使用者）。 */
export const SEMEN_NEG_REGEN_HOURS = 5;

/** 各動作對玩家興奮的貢獻（max=20，約 4–10 次可射） */
export const CLIMAX_BY_ACT = {
  waist: 1,
  butt: 1,
  breast: 2,
  breast_knead: 3,
  breast_suck: 3,
  nipple_lick: 3,
  nipple: 2,
  labia: 3,
  labia_rub: 4,
  clit: 4,
  finger_in: 5,
  vagina_finger: 5,
  cervix_rub: 6,
  pull_out: 2,
  vagina: 3,
  undress_help: 3,
  undress_tell: 3,
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
    inventory: { bouquet: 0, ring: 0, abortPill: 0 },
    gold: 200,
  };
}

function normalizePlayer(player) {
  const base = emptyPlayer();
  const p = player && typeof player === "object" ? { ...base, ...player } : base;
  p.climax = clamp(p.climax, 0, climaxMax());
  p.semenCc = clamp(p.semenCc, SEMEN_FLOOR_CC, semenMaxCc());
  p.lastTeaseAt = Number(p.lastTeaseAt) || 0;
  p.lastSemenAt = Number(p.lastSemenAt) || Date.now();
  const inv = p.inventory && typeof p.inventory === "object" ? p.inventory : {};
  p.inventory = {
    bouquet: Math.max(0, inv.bouquet | 0),
    ring: Math.max(0, inv.ring | 0),
    abortPill: Math.max(0, inv.abortPill | 0),
  };
  p.gold = Math.max(0, Number(p.gold) || 0);
  return p;
}

/**
 * 依真實時間補精液：負的時候每 5 小時 +1 cc，補到 0 之後每小時 +1 cc（上限 20＋精液量等級）。不呼叫 ensurePlayer，避免循環。
 * lastSemenAt 只往前推「用掉的整格時間」，零頭留到下次。
 */
export function regenSemen(player, now = Date.now()) {
  const p = normalizePlayer(player);
  let t = Number(p.lastSemenAt) || now;
  let cc = p.semenCc;
  if (now <= t) return p;
  const negMs = SEMEN_NEG_REGEN_HOURS * 3600000;
  const posMs = 3600000 / SEMEN_REGEN_CC_PER_HOUR;
  if (cc < 0) {
    const n = Math.min(-cc, Math.floor((now - t) / negMs));
    cc += n;
    t += n * negMs;
  }
  if (cc >= 0) {
    const n = Math.floor((now - t) / posMs);
    if (n > 0) {
      cc = Math.min(semenMaxCc(), cc + n);
      t += n * posMs;
    }
  }
  if (cc !== p.semenCc || t !== p.lastSemenAt) {
    p.semenCc = clamp(cc, SEMEN_FLOOR_CC, semenMaxCc());
    p.lastSemenAt = t;
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
  p.climax = clamp(p.climax + add, 0, climaxMax());
  p.lastTeaseAt = Date.now();
  if (p.climax < climaxMax()) {
    return { player: p, climaxed: false, spentCc: 0, line: "" };
  }
  const spent = 13 + Math.floor(Math.random() * 4); // 13–16
  const before = p.semenCc;
  p.semenCc = clamp(p.semenCc - spent, Math.min(0, p.semenCc), semenMaxCc());
  const actual = before - p.semenCc;
  p.climax = 0;
  const line = actual > 0
    ? `（你射了——約 ${actual} cc。精液剩餘 ${p.semenCc} cc。）`
    : `（你想射，但幾乎沒有精液了。剩餘 ${p.semenCc} cc。）`;
  return { player: p, climaxed: true, spentCc: actual, line };
}

/** 立刻補精液，不超過上限。不改每小時自然回復的時鐘。 */
export function grantSemen(player, cc) {
  const p = ensurePlayer(player);
  const before = p.semenCc;
  const add = Math.max(0, Math.round(Number(cc) || 0));
  p.semenCc = clamp(before + add, SEMEN_FLOOR_CC, semenMaxCc());
  return { player: p, before, after: p.semenCc, gained: p.semenCc - before };
}

/** 肏射精：扣玩家真正的精液（可到負，不低於 SEMEN_FLOOR_CC）。 */
export function spendSemen(player, cc) {
  const p = ensurePlayer(player);
  const before = p.semenCc;
  p.semenCc = clamp(before - Math.max(0, Math.round(Number(cc) || 0)), SEMEN_FLOOR_CC, semenMaxCc());
  p.lastTeaseAt = Date.now();
  return { player: p, before, after: p.semenCc };
}

/** 編輯「恢復精液」：補滿並可選清興奮。 */
export function refillSemen(player, { resetClimax = true } = {}) {
  const p = ensurePlayer(player);
  p.semenCc = semenMaxCc();
  p.lastSemenAt = Date.now();
  if (resetClimax) p.climax = 0;
  return p;
}

/** 閒置時玩家興奮略降（精液靠 regenSemen）。 */
export function decayPlayerIdle(player) {
  const p = ensurePlayer(player);
  if (p.climax > 0) p.climax = clamp(p.climax - 1, 0, climaxMax());
  return p;
}

export function playerHint(player) {
  const p = ensurePlayer(player);
  return `興奮 ${p.climax}/${climaxMax()}・精液 ${p.semenCc}/${semenMaxCc()}cc`;
}
