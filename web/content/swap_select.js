/* 2026-10-21 換妻 step：「開始換妻」→ 選一對夫妻（樣式跟日租選客人一樣）→ 確認 → 存成目前的換妻場次，顯示「下一步：問妻子」。
 * 名冊＝伺服器存的對方夫妻（/api/swap/cafe 的 couples，當熟客一直留著），不足 4 對就新抽（各自不同的 Comfy 模型）。
 * 還沒做：問妻子、扣錢、場景。場次先存在 localStorage（SESSION_KEY），不用重啟伺服器。 */
import { api, BZH, rollCouple, rollCkpts, usableCkpts, ensureSwapMeta } from "./swap_cafe_gen.js?v=8";

export const SESSION_KEY = "yorozuya.swap.session";
const ROSTER_MIN = 4;
export function swapSession() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "null"); } catch { return null; } }
const CSS = `
.swp-ov{position:fixed;inset:0;z-index:8600;background:#e9edf2;display:flex;flex-direction:column;font:15px/1.45 system-ui,-apple-system,"Noto Sans TC",sans-serif;color:#1d2330}
.swp-ov button{font:inherit;box-shadow:none;text-shadow:none;image-rendering:auto;min-height:0;letter-spacing:0;transform:none;cursor:pointer}
.swp-ov button::before,.swp-ov button::after{content:none}
.swp-hd{background:#06c755;color:#fff;padding:10px 14px 8px;display:flex;align-items:center;gap:10px}
.swp-hd b{font-size:16px;flex:1}.swp-hd button{background:none!important;border:0!important;color:#fff;font-size:24px;line-height:1;padding:2px 6px;width:auto}
.swp-pick{flex:1;overflow-y:auto;padding:14px;display:flex;flex-direction:column;gap:12px}
.swp-card{background:#fff!important;border-radius:14px!important;padding:12px 14px;border:2px solid transparent!important;width:100%;text-align:left;color:inherit;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.swp-card{height:auto!important;max-height:none!important;overflow:visible!important;padding-bottom:14px!important}
.swp-hd button{outline:0!important;box-shadow:none!important}
.swp-card:active{border-color:#06c755}
.swp-top{display:flex;align-items:center;gap:8px}.swp-top .pr{margin-left:auto;font-weight:700;color:#c07a00;white-space:nowrap}
.swp-faces{display:flex;gap:4px;flex:none}.swp-faces img{width:44px;height:56px;object-fit:cover;object-position:top;border-radius:8px;background:#dfe5ec}
.swp-faces:empty{display:none}
.swp-nm{font-weight:700;font-size:15px}
.swp-p{margin-top:6px;font-size:13px}.swp-p b{font-weight:600}
.tg{display:inline-block;font-size:12px;background:#eef2f6;border-radius:8px;padding:1px 7px;margin:4px 4px 0 0}.tg.h{background:#e3efff;color:#1d4f9a}.tg.w{background:#f6e6ff;color:#7a2a9a}
.swp-p q{display:block;color:#5b6475;font-size:13px;quotes:none}
.swp-big{display:flex;gap:10px;justify-content:center}.swp-big figure{margin:0;text-align:center;flex:1}.swp-big img{width:100%;max-width:170px;aspect-ratio:3/4;object-fit:cover;object-position:top;border-radius:12px;background:#dfe5ec}
.swp-act{display:flex;gap:8px;padding:10px 14px calc(10px + env(safe-area-inset-bottom));background:#fff;border-top:1px solid #e3e7ec}
.swp-act button{flex:1;border-radius:12px!important;padding:12px;font-size:15px;border:1px solid #c9d0da!important;background:#fff!important;color:#1d2330}
.swp-act button.pri{background:#06c755!important;border-color:#06c755!important;color:#fff}
.swp-next{margin:auto;text-align:center;color:#4b5363;padding:24px}.swp-next b{display:block;font-size:20px;color:#1d2330;margin-bottom:8px}`;

const faceUrl = (S, c, who) => (S.images?.[c.id] || {})[`${who}~normal`]?.cut || "";
/** 有立繪就放圖；沒有就什麼都不放（版面收起來）。 */
const face = (S, c, who) => { const u = faceUrl(S, c, who); return u ? `<img alt="" src="${esc(u)}">` : ""; };
const hLooks = (h) => `體型${BZH[h.build] || h.build || "普通"}`;
const wLooks = (w) => [w.look?.hair, w.look?.build, w.look?.cup && `${w.look.cup}罩杯`, w.look?.height_cm && `${w.look.height_cm}cm`, w.look?.style].filter(Boolean).join("・");
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));

/** 讀名冊；舊夫妻補類型／價錢／模型，不足 ROSTER_MIN 對就新抽並存（不動面板原本選的那對）。 */
export async function loadRoster() {
  let S = await api.state();
  const keep = S.current, ck = await usableCkpts();
  const save = async (c) => { S = await api.put("couple", { couple: c }); };
  for (const c of Object.values(S.couples)) {
    const a = ensureSwapMeta(c), b = ck.length && (!c.husband?.ckpt || !c.wife?.ckpt) ? (rollCkpts(c, ck), true) : false;
    if (a || b) await save(c);
  }
  while (Object.keys(S.couples).length < ROSTER_MIN) { const c = rollCouple(); rollCkpts(c, ck); await save(c); await new Promise((r) => setTimeout(r, 3)); }
  if (keep && S.current !== keep && S.couples[keep]) await save(S.couples[keep]);
  return S;
}

export function openSwapSelect(ctx = {}) {
  if (!document.getElementById("swp-css")) { const s = document.createElement("style"); s.id = "swp-css"; s.textContent = CSS; document.head.append(s); }
  document.getElementById("swp-ov")?.remove();
  const ov = document.createElement("div"); ov.className = "swp-ov"; ov.id = "swp-ov";
  ov.innerHTML = `<div class="swp-hd"><b></b><button type="button" aria-label="關閉">×</button></div><div class="swp-body" style="flex:1;display:flex;flex-direction:column;min-height:0"></div>`;
  ov.querySelector(".swp-hd button").addEventListener("click", () => ov.remove());
  document.body.append(ov);
  const title = (t) => { ov.querySelector(".swp-hd b").textContent = t; }, body = ov.querySelector(".swp-body");
  let S = null;
  const roster = () => {
    title("換妻・今天的夫妻（選一對）");
    const list = document.createElement("div"); list.className = "swp-pick";
    const cs = Object.values(S.couples).sort((a, b) => (b.at || 0) - (a.at || 0));
    for (const c of cs) {
      const h = c.husband, w = c.wife, b = document.createElement("button");
      b.type = "button"; b.className = "swp-card"; b.dataset.couple = c.id;
      b.innerHTML = `<div class="swp-top"><span class="swp-faces">${face(S, c, "husband")}${face(S, c, "other")}</span>
        <span class="swp-nm">${esc(h.name)} ＆ ${esc(w.name)}</span><span class="pr">${h.swapPrice} 金</span></div>
        <div class="swp-p"><b>丈夫</b> ${esc(h.age)} 歲 <span class="tg h">${esc(h.swapType)}</span><q>${esc(hLooks(h))}</q></div>
        <div class="swp-p"><b>妻子</b> ${esc(w.age)} 歲 <span class="tg w">${esc(w.swapType)}</span><q>${esc(wLooks(w))}・${esc(w.personality)}</q></div>`;
      b.addEventListener("click", () => confirm(c));
      list.append(b);
    }
    body.replaceChildren(list);
  };
  const big = (S, c) => {
    const f = [["husband", c.husband.name], ["other", c.wife.name]].filter(([k]) => faceUrl(S, c, k)).map(([k, n]) => `<figure>${face(S, c, k)}<figcaption>${esc(n)}</figcaption></figure>`).join("");
    return f ? `<div class="swp-big">${f}</div>` : "";
  };
  const confirm = (c) => {
    const h = c.husband, w = c.wife;
    title(`${h.name} ＆ ${w.name}`);
    body.innerHTML = `<div class="swp-pick">${big(S, c)}
      <div class="swp-card" style="cursor:default"><div class="swp-p"><b>丈夫・${esc(h.name)}</b> ${esc(h.age)} 歲 <span class="tg h">${esc(h.swapType)}</span><q>${esc(hLooks(h))}${h.ckpt ? `・模型 ${esc(h.ckpt)}` : ""}</q></div>
      <div class="swp-p"><b>妻子・${esc(w.name)}</b> ${esc(w.age)} 歲 <span class="tg w">${esc(w.swapType)}</span><q>${esc(wLooks(w))}・${esc(w.personality)}${w.ckpt ? `・模型 ${esc(w.ckpt)}` : ""}</q></div>
      <div class="swp-p"><b>費用</b> ${h.swapPrice} 金（還不會扣）</div></div></div>
      <div class="swp-act"><button type="button" class="back">返回</button><button type="button" class="pri go">選這對</button></div>`;
    body.querySelector(".back").addEventListener("click", roster);
    body.querySelector(".go").addEventListener("click", () => {
      const sess = { coupleId: c.id, price: h.swapPrice, at: Date.now(), phase: "ask_wife", wifeId: ctx.girl?.()?.id || "" };
      localStorage.setItem(SESSION_KEY, JSON.stringify(sess));
      ctx.debug?.(`換妻：選了 ${h.name} ＆ ${w.name}（${h.swapPrice} 金）→ 下一步問妻子`);
      title("換妻");
      body.innerHTML = `<div class="swp-next"><b>下一步：問妻子</b>已選 ${esc(h.name)} ＆ ${esc(w.name)}・${h.swapPrice} 金<br><small>（問妻子／扣錢／場景還沒做）</small></div><div class="swp-act"><button type="button" class="back">回名冊</button></div>`;
      body.querySelector(".back").addEventListener("click", roster);
    });
  };
  body.innerHTML = `<div class="swp-next">讀取名冊中…</div>`;
  loadRoster().then((s) => { S = s; roster(); }).catch((e) => { body.innerHTML = `<div class="swp-next">${esc(e?.message || e)}</div>`; });
  return ov;
}
