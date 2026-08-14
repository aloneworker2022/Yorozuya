// 網路優先、離線才退回快取;/api/ 不攔(存檔永遠即時)。
// 重點:向伺服器要「完整回應」(no-store 的新 Request,不帶條件標頭),
// 避免拿到空的 304 就丟給頁面 → 造成 app.js/模組載入到空內容而整個炸掉。
const CACHE = "yorozuya-v55";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", e => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k !== CACHE) await caches.delete(k);
  await clients.claim();
})()));

self.addEventListener("fetch", e => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.pathname.startsWith("/api/")) return;
  e.respondWith((async () => {
    try {
      // 用不帶條件標頭的全新請求(cache:no-store)→ 伺服器一定回完整 200,不會是空的 304
      const r = await fetch(new Request(e.request.url, { cache: "no-store", credentials: "same-origin" }));
      if (r && r.ok) {
        const copy = r.clone();
        caches.open(CACHE).then(c => c.put(e.request, copy)).catch(() => {});
        return r;
      }
      // 非 2xx(含 304/5xx)→ 用快取墊底,絕不把空/壞回應交給頁面
      return (await caches.match(e.request)) || r;
    } catch {
      // 離線/連不上 → 回快取;真的沒有就丟錯給頁面的自癒機制處理
      return (await caches.match(e.request)) || Response.error();
    }
  })());
});
