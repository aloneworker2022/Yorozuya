/* 這一趟人在房間時，把她的圖放進手機。離開就清掉。 */

export const VISIT_CACHE = "yoro-visit-pics";

function addUrl(urls, seen, value) {
  const url = String(value || "").trim();
  if (!url || url.startsWith("data:") || url.startsWith("blob:")) return;
  if (seen.has(url)) return;
  seen.add(url);
  urls.push(url);
}

function walk(value, urls, seen, key) {
  if (key === "actionPromptRev") return;
  if (typeof value === "string") {
    addUrl(urls, seen, value);
    return;
  }
  if (Array.isArray(value)) {
    for (const item of value) walk(item, urls, seen, "");
    return;
  }
  if (!value || typeof value !== "object") return;
  for (const [childKey, child] of Object.entries(value)) walk(child, urls, seen, childKey);
}

/** 她身上已經有網址的圖：半身、立繪、動作、脫衣、做愛、局部動圖。 */
export function collectGirlPicUrls(who) {
  const urls = [];
  const seen = new Set();
  walk(who?.portrait, urls, seen, "");
  walk(who?.portraits, urls, seen, "");
  walk(who?.sexAnim, urls, seen, "");
  return urls;
}

/** 抓進手機。單張失敗會再試一次，不會無限等。 */
export async function downloadVisitPics(who, onProgress) {
  const urls = collectGirlPicUrls(who);
  const total = urls.length;
  if (!total || typeof globalThis.caches === "undefined") {
    if (onProgress) onProgress(total, total);
    return { total, ok: 0 };
  }
  const cache = await caches.open(VISIT_CACHE);
  let cursor = 0;
  let ok = 0;
  const pull = async (url) => {
    const hit = await cache.match(url, { ignoreVary: true });
    if (hit) return true;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        const res = await fetch(url, { cache: "no-store", credentials: "same-origin" });
        if (res && res.ok) {
          await cache.put(url, res);
          return true;
        }
      } catch { /* 再試一次 */ }
    }
    return false;
  };
  const worker = async () => {
    while (cursor < urls.length) {
      const url = urls[cursor];
      cursor += 1;
      if (await pull(url)) ok += 1;
      if (onProgress) onProgress(ok + (cursor - ok), total);
    }
  };
  const n = Math.min(4, urls.length);
  await Promise.all(Array.from({ length: n }, () => worker()));
  return { total, ok };
}

export async function clearVisitPics() {
  try {
    if (typeof globalThis.caches !== "undefined") await caches.delete(VISIT_CACHE);
  } catch { /* 清不掉就留到下次離開 */ }
}
