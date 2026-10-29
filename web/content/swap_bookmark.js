/* 換妻書籤：產圖時掛在房間左邊。產完才赴約。進度在伺服器，關掉頁面再打開還在。 */
import { api } from "./swap_cafe_gen.js?v=37";
import { pregenState, pregenRetry, pregenCancel, pregenEnter } from "./swap_pregen.js?v=2";
import { openSwapDate } from "./swap_date.js?v=1";
import { freshMeet, testMeet, SLOT_ZH } from "./swap_meet_rules.js?v=1";

const SCENE_KEY = "yorozuya.swap.bmScene";
export function rememberScene(coupleId, scene) {
  try { localStorage.setItem(SCENE_KEY, JSON.stringify({ coupleId, scene: scene || "bar" })); } catch { /* */ }
}
function sceneOf(coupleId) {
  try {
    const j = JSON.parse(localStorage.getItem(SCENE_KEY) || "null");
    if (j && j.coupleId === coupleId) return j.scene || "bar";
  } catch { /* */ }
  return "bar";
}

export function bindSwapBookmark(ctx = {}) {
  if (document.getElementById("sbm")) return;
  const css = document.createElement("style");
  css.textContent = `
    #sbm{position:fixed;left:0;top:22%;z-index:8300;display:flex;flex-direction:column;gap:4px;font:14px/1.3 system-ui,"Noto Sans TC",sans-serif}
    #sbm button{box-shadow:none;text-shadow:none;letter-spacing:0;cursor:pointer}
    #sbm .tab{writing-mode:vertical-rl;background:#6b3a2a;color:#fff;border:0;border-radius:0 10px 10px 0;padding:12px 8px;min-height:88px}
    #sbm .x{background:#2a2118;color:#fff;border:0;border-radius:0 8px 8px 0;padding:4px 6px;font-size:12px}
    #sbm-card{position:fixed;left:46px;top:18%;z-index:8301;width:min(280px,78vw);background:#fff8ee;color:#2a2118;border-radius:12px;padding:12px;box-shadow:0 8px 28px #0006;font:14px/1.4 system-ui,"Noto Sans TC",sans-serif}
    #sbm-card button{font:inherit;border:0;border-radius:8px;padding:8px 10px;background:#6b3a2a;color:#fff;cursor:pointer}
    #sbm-card .row{display:flex;gap:6px;margin-top:8px}
    #sbm-card ul{margin:8px 0 0;padding-left:1.1em;max-height:40vh;overflow:auto;font-size:12px}
  `;
  document.head.append(css);
  const root = document.createElement("div");
  root.id = "sbm"; root.hidden = true;
  root.innerHTML = `<button type="button" class="tab"></button><button type="button" class="x">拿掉</button>`;
  document.body.append(root);
  const card = document.createElement("div");
  card.id = "sbm-card"; card.hidden = true;
  document.body.append(card);
  let view = null, msg = "";

  const paint = () => {
    const dateOpen = !!document.getElementById("sd-ov");
    const show = !!(view && view.active && !dateOpen);
    root.hidden = !show;
    if (!show) { card.hidden = true; return; }
    const names = view.names || {};
    const who = `${names.husband || "他"}＆${names.other || "她"}`;
    const tab = root.querySelector(".tab");
    if (view.status === "ready") tab.textContent = `赴約　${who}`;
    else if (view.status === "error") tab.textContent = `有圖失敗　${view.done}/${view.total}`;
    else tab.textContent = `準備中　${view.done}/${view.total}　${who}`;
  };
  const openCard = () => {
    if (!view) return;
    const lines = (view.jobs || []).filter((j) => j.status !== "done").map((j) => `<li>${SLOT_ZH[j.key] || j.key}　${j.status === "error" ? (j.error || "失敗") : "還在生"}</li>`).join("");
    card.innerHTML = `<b>${view.status === "ready" ? "可以赴約了" : "立繪還沒齊"}</b><div>${view.done}/${view.total}　${view.price || 0} 金</div>
      ${msg ? `<div>${msg}</div>` : ""}<ul>${lines}</ul>
      <div class="row">${view.status === "ready" ? `<button type="button" class="go">赴約</button>` : ""}${view.status === "error" ? `<button type="button" class="re">重試失敗的</button>` : ""}<button type="button" class="cl">關閉</button></div>`;
    card.hidden = false;
    card.querySelector(".cl")?.addEventListener("click", () => { card.hidden = true; });
    card.querySelector(".re")?.addEventListener("click", () => { msg = ""; pregenRetry("date").then(pull).catch((e) => { msg = e.message; openCard(); }); });
    card.querySelector(".go")?.addEventListener("click", () => { void depart(); });
  };
  async function depart() {
    msg = "";
    if (!view || view.status !== "ready") return;
    if (ctx.wifeOk && !ctx.wifeOk()) { msg = "現在這位還不是妻子，不能赴約。"; openCard(); return; }
    let couple = null;
    try {
      const S = await api.state();
      couple = (S.couples || {})[view.coupleId];
    } catch (e) { msg = e.message || "讀不到夫妻資料"; openCard(); return; }
    if (!couple) { msg = "這對夫妻的資料不在了。"; openCard(); return; }
    const price = Number(view.price) || 0;
    if (price > 0 && ctx.spend && !ctx.spend(price, "換妻赴約")) { msg = `金幣不夠（要 ${price}）。`; openCard(); return; }
    const scene = sceneOf(view.coupleId);
    const meet = !scene || scene === "bar" ? freshMeet() : testMeet(scene);
    try { await pregenEnter(); } catch { /* 書籤收不起來也不擋進場 */ }
    card.hidden = true; root.hidden = true; view = { ...view, active: false };
    ctx.debug?.(`換妻赴約：${couple.husband?.name}＆${couple.wife?.name} → ${meet.phase}`);
    openSwapDate(ctx.makeCtx ? ctx.makeCtx() : ctx, couple, meet);
  }
  async function pull() {
    try {
      const j = await pregenState();
      view = j.date;
      if (view && view.status === "ready" && !view.active) view = null;
    } catch { /* 伺服器還沒重啟：書籤先不顯示 */ }
    paint();
  }
  root.querySelector(".tab").addEventListener("click", () => {
    if (!view) return;
    if (view.status === "ready") { card.hidden = true; void depart(); return; }
    openCard();
  });
  root.querySelector(".x").addEventListener("click", () => {
    pregenCancel().then(() => { view = null; card.hidden = true; paint(); }).catch((e) => ctx.debug?.(`換妻書籤：${e.message || e}`));
  });
  void pull();
  setInterval(() => { void pull(); }, 2000);
}
