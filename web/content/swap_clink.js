// pt312u：按住人物敬酒 — 長按偵測 + 酒杯互碰小動畫（內嵌 SVG，不用 AI 圖）
const CSS = `.swp-clink{position:absolute;left:50%;top:34%;z-index:30;width:160px;height:120px;margin-left:-80px;pointer-events:none}
.swp-clink svg{position:absolute;top:10px;width:64px;height:96px;overflow:visible}
.swp-clink .gl{left:0;transform-origin:50% 90%;animation:swpclL 1.4s ease-in-out forwards}
.swp-clink .gr{right:0;transform-origin:50% 90%;animation:swpclR 1.4s ease-in-out forwards}
.swp-clink .sp{position:absolute;left:50%;top:6px;width:40px;height:40px;margin-left:-20px;opacity:0;animation:swpclS 1.4s ease-out forwards}
.swp-clink.no .gr{animation:swpclN 1.4s ease-in-out forwards}
.swp-clink.no .sp{display:none}
@keyframes swpclL{0%{opacity:0;transform:translateX(-30px) rotate(-10deg)}20%{opacity:1}45%{transform:translateX(26px) rotate(18deg)}55%{transform:translateX(20px) rotate(12deg)}80%{opacity:1;transform:translateX(14px) rotate(-30deg)}100%{opacity:0;transform:translateX(14px) rotate(-40deg)}}
@keyframes swpclR{0%{opacity:0;transform:translateX(30px) rotate(10deg)}20%{opacity:1}45%{transform:translateX(-26px) rotate(-18deg)}55%{transform:translateX(-20px) rotate(-12deg)}80%{opacity:1;transform:translateX(-14px) rotate(30deg)}100%{opacity:0;transform:translateX(-14px) rotate(40deg)}}
@keyframes swpclN{0%{opacity:0;transform:translateX(30px)}25%{opacity:1;transform:translateX(0)}45%{transform:translateX(8px) rotate(8deg)}60%{transform:translateX(-8px) rotate(-8deg)}100%{opacity:0;transform:translateX(30px)}}
@keyframes swpclS{0%,40%{opacity:0;transform:scale(.3)}48%{opacity:1;transform:scale(1.2)}70%{opacity:0;transform:scale(1.6)}100%{opacity:0}}
.swp-hold{position:absolute;z-index:29;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;pointer-events:none;background:conic-gradient(#ffd166 var(--p,0%),rgba(255,255,255,.15) 0);-webkit-mask:radial-gradient(circle,transparent 15px,#000 16px);mask:radial-gradient(circle,transparent 15px,#000 16px)}`;
const glass = (cls) => `<svg class="${cls}" viewBox="0 0 64 96"><path d="M14 8h36l-4 52c-1 8-6 12-14 12s-13-4-14-12z" fill="rgba(255,255,255,.18)" stroke="#fff" stroke-width="3"/><path d="M17 28h30l-2.5 31c-1 6-5 9-12.5 9s-11.5-3-12.5-9z" fill="#f4b23c"/><rect x="18" y="22" width="28" height="8" rx="4" fill="#fffbe9"/><path d="M50 22h6a8 8 0 0 1 0 22h-8" fill="none" stroke="#fff" stroke-width="3"/></svg>`;
function css() { if (document.getElementById("swp-clink-css")) return; const s = document.createElement("style"); s.id = "swp-clink-css"; s.textContent = CSS; document.head.append(s); }
/** 在 host 裡播一次碰杯；ok=false 播「搖杯拒絕」 */
export function clinkFx(host, ok = true) {
  css(); const d = document.createElement("div"); d.className = `swp-clink${ok ? "" : " no"}`;
  d.innerHTML = glass("gl") + glass("gr") + `<svg class="sp" viewBox="0 0 40 40"><g stroke="#ffe27a" stroke-width="3" stroke-linecap="round"><path d="M20 2v8M20 30v8M2 20h8M30 20h8M7 7l5 5M28 28l5 5M33 7l-5 5M12 28l-5 5"/></g></svg>`;
  host.append(d); setTimeout(() => d.remove(), 1500);
}
/** 長按 root 內符合 pick(target) 的元素 ms 毫秒 → fn(el)；短按不觸發。回傳 { fired() } 讓 click handler 判斷是否剛長按過 */
export function onLongPress(root, pick, fn, ms = 500) {
  css(); let t = 0, ring = null, raf = 0, x0 = 0, y0 = 0, last = 0;
  const stop = () => { clearTimeout(t); cancelAnimationFrame(raf); ring?.remove(); ring = null; };
  root.addEventListener("pointerdown", (e) => {
    const el = pick(e.target); if (!el) return; stop(); x0 = e.clientX; y0 = e.clientY;
    const r = root.getBoundingClientRect(); ring = document.createElement("div"); ring.className = "swp-hold";
    ring.style.left = `${e.clientX - r.left}px`; ring.style.top = `${e.clientY - r.top}px`; root.append(ring);
    const t0 = performance.now(); const tick = () => { if (!ring) return; ring.style.setProperty("--p", `${Math.min(100, (performance.now() - t0) / ms * 100)}%`); raf = requestAnimationFrame(tick); }; tick();
    t = setTimeout(() => { stop(); last = Date.now(); navigator.vibrate?.(30); fn(el); }, ms);
  });
  root.addEventListener("pointermove", (e) => { if (ring && Math.hypot(e.clientX - x0, e.clientY - y0) > 12) stop(); });
  for (const ev of ["pointerup", "pointercancel", "pointerleave"]) root.addEventListener(ev, stop);
  root.addEventListener("contextmenu", (e) => { if (pick(e.target)) e.preventDefault(); });
  return { fired: () => Date.now() - last < 600 };
}
