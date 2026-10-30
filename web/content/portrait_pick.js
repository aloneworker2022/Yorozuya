// 立繪挑選：缺的那張退下一張；白底沒去背的不要蓋過已經透明的立繪。

export const SHOT_FALLBACK = {
  head: ["head", "half", "half_xi", "full"],
  half: ["half", "half_xi", "full", "head"],
  half_xi: ["half_xi", "half", "half_le", "full"],
  half_nu: ["half_nu", "half", "half_xi", "full"],
  half_ai: ["half_ai", "half", "half_xi", "full"],
  half_le: ["half_le", "half", "half_xi", "full"],
  half_xiu: ["half_xiu", "half", "half_xi", "full"],
  full: ["full", "half", "half_xi", "head"],
};

const judged = new Set();
const inflight = new Set();
const waiters = new Map();

export function portraitPathKey(url) {
  const raw = String(url || "").trim();
  if (!raw) return "";
  try {
    return new URL(raw, "http://local").pathname;
  } catch {
    return raw.split("?")[0];
  }
}

export function uncutPortraitSet() {
  const host = globalThis;
  if (!host.YoroUncutPortraits) host.YoroUncutPortraits = new Set();
  return host.YoroUncutPortraits;
}

/**
 * 有圖總比沒圖好。uncut 裡的路徑是白底沒去背（或載入失敗），有下一張就跳過。
 * 全部都有問題時仍回第一張，避免空白。
 */
export function pickPortraitUrl(portraits, kind = "half", opts = {}) {
  const keys = SHOT_FALLBACK[kind] || SHOT_FALLBACK.half;
  const p = portraits && typeof portraits === "object" ? portraits : {};
  const urls = [];
  const seen = new Set();
  for (const key of keys) {
    const url = String(p[key] || "");
    const path = portraitPathKey(url);
    if (!url || !path || seen.has(path)) continue;
    seen.add(path);
    urls.push(url);
  }
  const portrait = String(opts.portrait || "");
  const portraitPath = portraitPathKey(portrait);
  if (portrait && portraitPath && !seen.has(portraitPath)) urls.push(portrait);
  if (!urls.length) return "";
  const uncut = opts.uncut;
  if (uncut && typeof uncut.has === "function") {
    const good = urls.find((url) => !uncut.has(portraitPathKey(url)));
    if (good) return good;
  }
  return urls[0];
}

/** 四角至少三角是不透明近白：去背沒成功，畫出來是白框。 */
export function portraitLooksUncut(img) {
  const w = img?.naturalWidth || img?.width || 0;
  const h = img?.naturalHeight || img?.height || 0;
  if (!w || !h || typeof document === "undefined") return false;
  const canvas = document.createElement("canvas");
  canvas.width = 1;
  canvas.height = 1;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return false;
  ctx.imageSmoothingEnabled = false;
  const spots = [[0, 0], [w - 1, 0], [0, h - 1], [w - 1, h - 1]];
  let white = 0;
  for (const [sx, sy] of spots) {
    ctx.clearRect(0, 0, 1, 1);
    ctx.drawImage(img, sx, sy, 1, 1, 0, 0, 1, 1);
    const px = ctx.getImageData(0, 0, 1, 1).data;
    if (px[3] > 240 && px[0] > 245 && px[1] > 245 && px[2] > 245) white += 1;
  }
  return white >= 3;
}

export function portraitCutJudged(url) {
  return judged.has(portraitPathKey(url));
}

/** 這張半身該換掉：載入失敗、已經記成沒去背、或四角是白底。還沒載完不算。 */
export function judgePortraitCut(img, url) {
  const path = portraitPathKey(url);
  if (!path) return false;
  if (uncutPortraitSet().has(path)) return true;
  if (!img?.complete) return false;
  if (!img.naturalWidth) return true;
  try { return portraitLooksUncut(img); } catch { return false; }
}

export function markPortraitUncut(url) {
  const path = portraitPathKey(url);
  if (!path) return;
  judged.add(path);
  uncutPortraitSet().add(path);
}

/** 量過這張之後呼叫 onDone(bad)。還沒量完的同一個路徑共用一次載入。 */
export function whenPortraitCutKnown(url, onDone) {
  const path = portraitPathKey(url);
  if (!path || typeof onDone !== "function") return;
  if (judged.has(path)) {
    onDone(uncutPortraitSet().has(path));
    return;
  }
  const list = waiters.get(path) || [];
  list.push(onDone);
  waiters.set(path, list);
  if (inflight.has(path) || typeof Image === "undefined") return;
  inflight.add(path);
  const img = new Image();
  const finish = (bad) => {
    inflight.delete(path);
    judged.add(path);
    if (bad) uncutPortraitSet().add(path);
    const fns = waiters.get(path) || [];
    waiters.delete(path);
    for (const fn of fns) {
      try { fn(bad); } catch { /* ignore */ }
    }
  };
  img.onload = () => {
    let bad = false;
    try { bad = portraitLooksUncut(img); } catch { bad = false; }
    finish(bad);
  };
  img.onerror = () => finish(true);
  img.src = url;
}

export function schedulePortraitCutProbe(url, onBad) {
  whenPortraitCutKnown(url, (bad) => { if (bad) onBad?.(url); });
}
