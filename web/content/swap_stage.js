/* 2026-10-21 換妻 VN 立繪舞台（可重用）：場景背景上只畫「這一段互動有參與的人」；玩家第一人稱，永遠不畫。
 * 一個人＝置中；兩個人＝左右兩格；三個人＝左中右。新上場的人從畫面左邊外面滑進自己的格子（ease-out、兩人以上錯開一點），
 * 已在場的人留下並移到新格子，不再參與的人往右滑一點並淡出。
 * 用法：const st = createStage(el, { backdrop }); st.setBackdrop(url); st.show([{ id, url, label }]); */
const SLOTS = { 1: [50], 2: [28, 72], 3: [18, 50, 82] };
const IN_MS = 620, OUT_MS = 380, STAGGER = 140;
/** 沒有立繪時的黑影（半身，女／男）。 */
export function silhouetteUrl(kind = "female") {
  const f = kind !== "male";
  const body = f
    ? `<ellipse cx="100" cy="62" rx="34" ry="40"/><path d="M58 70 Q50 120 62 150 L138 150 Q150 120 142 70 Z"/><rect x="88" y="96" width="24" height="26"/>
       <path d="M40 300 Q36 190 62 150 Q100 132 138 150 Q164 190 160 300 Z"/><ellipse cx="82" cy="188" rx="20" ry="16"/><ellipse cx="118" cy="188" rx="20" ry="16"/>`
    : `<ellipse cx="100" cy="64" rx="32" ry="38"/><rect x="86" y="96" width="28" height="28"/><path d="M26 300 Q24 168 60 146 Q100 132 140 146 Q176 168 174 300 Z"/>`;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 300"><g fill="#16161c" stroke="#55556a" stroke-width="2">${body}</g></svg>`;
  return "data:image/svg+xml;utf8," + encodeURIComponent(svg);
}
export function createStage(el, opts = {}) {
  el.style.position = el.style.position || "relative";
  el.style.overflow = "hidden";
  el.style.backgroundSize = "cover"; el.style.backgroundPosition = "center";
  const on = new Map();   // id → { node, slot }
  const setBackdrop = (url) => { el.style.backgroundImage = url ? `url(${url})` : ""; };
  setBackdrop(opts.backdrop);
  const place = (node, x, ms, delay, ease) => { node.style.transition = `left ${ms}ms ${ease} ${delay}ms, opacity ${ms}ms ease ${delay}ms, transform ${ms}ms ${ease} ${delay}ms`; node.style.left = `${x}%`; };
  function make(c) {
    const node = document.createElement("div");
    node.className = "swap-stage-char"; node.dataset.id = c.id;
    node.style.cssText = `position:absolute;bottom:0;left:-40%;height:${opts.height || 82}%;transform:translateX(-50%);opacity:1;pointer-events:none;display:flex;flex-direction:column;align-items:center;justify-content:flex-end`;
    node.innerHTML = `<img alt="" style="height:100%;width:auto;object-fit:contain;filter:drop-shadow(0 4px 8px rgba(0,0,0,.45))">${c.label ? `<span style="position:absolute;bottom:6px;background:rgba(0,0,0,.55);color:#fff;font-size:12px;padding:1px 8px;border-radius:9px">${c.label}</span>` : ""}`;
    el.append(node); return node;
  }
  /** 換成這一段的參與者（左→右的順序）。回傳動畫結束的 Promise。 */
  function show(list = []) {
    list = list.filter(Boolean).slice(0, 3);
    const xs = SLOTS[list.length] || [], keep = new Set(list.map((c) => c.id));
    for (const [id, o] of on) if (!keep.has(id)) {   // 退場：往右滑一點＋淡出
      o.node.style.transition = `opacity ${OUT_MS}ms ease, transform ${OUT_MS}ms ease`; o.node.style.opacity = "0"; o.node.style.transform = "translateX(-30%)";
      const n = o.node; setTimeout(() => n.remove(), OUT_MS + 30); on.delete(id);
    }
    let k = 0;
    list.forEach((c, i) => {
      let o = on.get(c.id);
      const img = () => o.node.querySelector("img");
      if (o) { if (c.url && img().getAttribute("src") !== c.url) img().src = c.url; place(o.node, xs[i], IN_MS, 0, "cubic-bezier(.22,.8,.3,1)"); return; }
      const node = make(c); o = { node }; on.set(c.id, o); img().src = c.url || silhouetteUrl(c.kind);
      node.style.left = "-40%"; void node.offsetWidth;   // 從左邊外面進來
      place(node, xs[i], IN_MS, (k++) * STAGGER, "cubic-bezier(.22,.8,.3,1)");
    });
    return new Promise((r) => setTimeout(r, IN_MS + k * STAGGER + 40));
  }
  function clear() { return show([]); }
  return { el, setBackdrop, show, clear };
}
/** 換妻的互動 → 要上場的人（左→右）。玩家不畫。 */
export const SWAP_INTERACTIONS = {
  "player-wife": { zh: "玩家↔妻子", who: ["wife"] },
  "wife-husband": { zh: "妻子↔對方丈夫", who: ["wife", "husband"] },
  "player-other": { zh: "玩家↔對方妻子", who: ["other"] },
  "husband-other": { zh: "對方丈夫↔對方妻子", who: ["husband", "other"] },
  all: { zh: "四人", who: ["husband", "other", "wife"] },
};
