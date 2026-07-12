// 網路優先、離線退回快取;/api/ 不快取(存檔永遠即時)
const CACHE = "yorozuya-v2";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  // 清掉舊版快取,並立刻接管所有分頁
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await clients.claim();
})()));

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  e.respondWith(
    fetch(e.request)
      .then(r => {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy));
        return r;
      })
      .catch(() => caches.match(e.request))
  );
});
