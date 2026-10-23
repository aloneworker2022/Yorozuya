/* 換妻・今日候選夫妻（2026-10-23）。
 * 進「選對方夫妻」時用 generateGirl＋husband_gen 現場抽；只存 localStorage，不碰咖啡廳測試名冊 /api/swap/cafe。
 * 同一台北曆日內返回＝同一批；換一批／隔日＝重抽。選中後才由 drive 生立繪。純規則，node 可測。 */

export const CANDIDATES_KEY = "yorozuya.swap.candidates";
export const CANDIDATES_MIN = 4;

/** Asia/Taipei 的 YYYY-MM-DD。 */
export function todayKey(now = Date.now(), timeZone = "Asia/Taipei") {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(now));
}

export function readCandidates(store) {
  if (!store?.getItem) return null;
  try {
    const raw = store.getItem(CANDIDATES_KEY);
    if (!raw) return null;
    const p = JSON.parse(raw);
    if (!p || !Array.isArray(p.candidates)) return null;
    return p;
  } catch { return null; }
}

export function writeCandidates(store, pack) {
  if (!store?.setItem) return;
  store.setItem(CANDIDATES_KEY, JSON.stringify(pack));
}

export function clearCandidates(store) {
  if (!store?.removeItem) return;
  store.removeItem(CANDIDATES_KEY);
}

/**
 * 載入今日候選。opts：
 *  force — 強制重抽
 *  min — 幾對（預設 4）
 *  store — localStorage 相容（getItem/setItem/removeItem）
 *  rollCouple / rollCkpts / usableCkpts — 注入（瀏覽器用 cafe_gen；測試可假造）
 *  now — 可測的時間戳
 */
export async function loadCandidates(opts = {}) {
  const min = Math.max(1, Number(opts.min) || CANDIDATES_MIN);
  const store = opts.store;
  if (!store?.getItem || !store?.setItem) throw new Error("loadCandidates：需要 store");
  const rollCouple = opts.rollCouple;
  if (typeof rollCouple !== "function") throw new Error("loadCandidates：需要 rollCouple");
  const now = opts.now != null ? Number(opts.now) : Date.now();
  const day = todayKey(now);
  const prev = readCandidates(store);
  if (!opts.force && prev?.day === day && prev.candidates.length >= min) {
    return { day, candidates: prev.candidates, reused: true };
  }
  let ck = [];
  if (typeof opts.usableCkpts === "function") {
    try { ck = await opts.usableCkpts() || []; } catch { ck = []; }
  }
  const usedNames = [];
  const candidates = [];
  for (let i = 0; i < min; i++) {
    const c = await rollCouple({ usedNames: usedNames.slice() });
    if (!c?.id) throw new Error("rollCouple 沒回夫妻");
    if (typeof opts.rollCkpts === "function" && ck.length) opts.rollCkpts(c, ck);
    usedNames.push(c.husband?.name, c.wife?.name);
    candidates.push(c);
    if (i + 1 < min) await new Promise((r) => setTimeout(r, 2));
  }
  writeCandidates(store, { day, candidates, at: now });
  return { day, candidates, reused: false };
}

/** 記憶體假 store（node 測用）。 */
export function memoryStore(seed = {}) {
  const m = new Map(Object.entries(seed));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => { m.set(k, String(v)); },
    removeItem: (k) => { m.delete(k); },
  };
}
