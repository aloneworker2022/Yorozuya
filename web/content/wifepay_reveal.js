/* 老婆還債偷看：共用「中央對話框 → 門縫切圖、對話框在圖下方」元件（遊戲與 /wifepay 編輯頁同一套）。
 * 對話：一開始就在中央打字（旁白→男→她，按「下一句」換人）。
 * 圖好了先把對話框在約 0.4 秒滑到下方，再把已切好的門縫圖（1/2 或 3/5，同一邊）從該側螢幕邊緣移入（約 0.7 秒 ease-out，略淡入）。
 * 若有第二張：不要在按「下一句」時換圖；改成點圖片，第二張從同一側移入並蓋在第一張上面（底下那張略暗、微偏移）。
 * prefers-reduced-motion 改短淡入。男子／她的對白可做「隔門聽不清」；旁白不變。 */
import { hearLine, normalizeMuffleLevel, parseMuffleEnabled } from "./wifepay_heard.js?v=1";

const CSS_ID = "wifepay-reveal-css-7";
const DIALOG_DOWN_MS = 400;
const SLIDE_MS = 700;
const REDUCE_MS = 180;
const CSS = `
.wp-reveal{position:absolute;inset:0;z-index:5;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;background:rgba(8,6,12,.92);overflow:hidden}
.wp-reveal.page{position:relative;inset:auto;width:100%;height:min(86dvh,44rem);min-height:28rem;background:#120e18;border-radius:12px;overflow:hidden;pointer-events:auto}
.wp-pics{display:none;flex:0 0 0;min-height:0;width:100%;max-height:0;opacity:1;background:#07050a;align-items:center;justify-content:center;padding:0;box-sizing:border-box;position:relative;overflow:hidden;transition:max-height .4s ease}
.wp-pics.ready{display:flex;pointer-events:auto}
.wp-pics.has-next{cursor:pointer}
.wp-reveal.has-pics .wp-pics{flex:1 1 auto;max-height:100%}
.wp-stage{position:relative;height:100%;width:100%;overflow:hidden;background:linear-gradient(90deg,#050308 0%,#0c0910 18%,#07050a 50%,#0c0910 82%,#050308 100%)}
.wp-slot{position:absolute;top:0;overflow:hidden;background:#000;border-left:6px solid rgba(40,28,24,.9);border-right:6px solid rgba(24,16,14,.9);box-sizing:content-box;box-shadow:0 0 18px rgba(0,0,0,.55);opacity:0;will-change:transform,opacity;z-index:1}
.wp-slot img{position:absolute;top:0;height:100%;width:auto;max-width:none;display:block}
.wp-slot.under{z-index:1;filter:brightness(.72)}
.wp-slot.front{z-index:2}
.wp-pic-hint{position:absolute;left:0;right:0;bottom:.55rem;z-index:4;margin:0;text-align:center;pointer-events:none;font:600 12px/1.3 system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;color:#ffd0e4;text-shadow:0 1px 6px #000;letter-spacing:.08em}
.wp-pics.full .wp-stage{background:#0c0912}
.wp-pics.full .wp-slot{border:none;box-shadow:none}
.wp-pics.full .wp-slot img{left:auto!important;width:auto;max-width:100%;height:100%;object-fit:contain;position:relative}
.wp-full-btn{position:absolute;right:.45rem;top:.45rem;z-index:3;pointer-events:auto;padding:.22rem .65rem;border:1px solid rgba(232,138,180,.4);border-radius:999px;background:rgba(20,14,24,.82);color:#ffd0e4;font:600 12px/1.3 system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;cursor:pointer}
.wp-dialog{position:relative;z-index:2;flex:0 0 auto;width:90%;max-width:24rem;max-height:42%;margin:0 auto;padding:.85rem .95rem .95rem;border-radius:14px;background:rgba(22,16,30,.96);border:1px solid rgba(232,138,180,.35);color:#f2e9ff;font:600 15px/1.55 system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;box-shadow:0 10px 28px rgba(0,0,0,.4);pointer-events:auto;cursor:pointer;overflow:auto;box-sizing:border-box;transition:margin .4s ease,max-height .4s ease}
@media (prefers-reduced-motion: reduce){
  .wp-pics,.wp-dialog{transition-duration:.18s !important}
}
.wp-reveal.has-pics{justify-content:flex-end;align-items:stretch}
.wp-reveal.has-pics .wp-dialog{margin:.4rem auto .55rem;max-height:36%}
.wp-wait{margin:0 0 .4rem;text-align:center;color:#e6be8c}
.wp-log{width:100%;max-height:14.5rem;overflow:auto;display:flex;flex-direction:column;justify-content:flex-end;gap:.55rem}
.wp-reveal.has-pics .wp-log{max-height:min(11rem,28dvh)}
.wp-line{margin:0;opacity:1}
.wp-line.hist{opacity:.7}
.wp-line.wp-nar{color:#d8d0c0;font-weight:500}
.wp-line.wp-man{color:#8fb2ff}
.wp-line.wp-wife{color:#ffb0cf}
.wp-k{display:block;margin-bottom:.12rem;opacity:.8;font-size:.85em;letter-spacing:.06em}
.wp-t{display:block;min-height:1.35em;white-space:pre-wrap;word-break:break-word}
.wp-orig{display:block;margin-top:.2rem;font-size:.78em;font-weight:500;opacity:.72;color:#cbbfd8}
.wp-t.waiting::after{content:"……";opacity:.55;animation:wpblink 1.1s steps(3,end) infinite}
@keyframes wpblink{50%{opacity:.15}}
.wp-next{display:block;margin:.7rem auto 0;padding:.32rem 1rem;border:1px solid rgba(232,138,180,.5);border-radius:999px;background:rgba(40,24,44,.92);color:#ffd0e4;font:600 13px/1.4 system-ui,"PingFang TC","Noto Sans CJK TC",sans-serif;cursor:pointer}
.wp-next[hidden]{display:none}
.wp-note{margin:.6rem 0 0;font-size:.82em;color:#a99bbd;text-align:center}
`;

function ensureCss() {
  if (document.getElementById(CSS_ID)) return;
  for (const id of ["wifepay-reveal-css-6", "wifepay-reveal-css-5"]) {
    const old = document.getElementById(id);
    if (old) old.remove();
  }
  const s = document.createElement("style");
  s.id = CSS_ID;
  s.textContent = CSS;
  document.head.append(s);
}

async function apiJson(url, method, body) {
  const r = await fetch(url, {
    method: method || "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || `HTTP ${r.status}`);
  return j;
}

/** 使用時一次隨機抽最多這麼多張；同一姿勢圖庫張數不限。 */
export const PICK_MAX = 2;

export async function fetchGalleryDoc() {
  const j = await apiJson("/api/wifepay/gallery");
  const items = Array.isArray(j?.items) ? j.items : (Array.isArray(j) ? j : []);
  return { items };
}

export async function fetchGallery() {
  return (await fetchGalleryDoc()).items;
}

export function itemsForPose(items, pose) {
  const p = String(pose || "").trim();
  const pool = (items || []).filter((x) => x && x.id && x.url);
  if (!p) return pool;
  return pool.filter((x) => (x.tags || []).includes(p));
}

/** 從該姿勢已選的底圖抽 1 或 2 張（各半）。只選 1 張就固定 1；沒選就空。不會從其他姿勢補張。池子可超過 2 張。 */
export function pickItems(items, pose, count, rnd) {
  const poseId = String(pose || "").trim();
  const pool = poseId
    ? itemsForPose(items, poseId)
    : (items || []).filter((x) => x && x.id && x.url);
  if (!pool.length) return [];
  const roll = typeof rnd === "function" ? rnd : (rnd && typeof rnd.random === "function" ? () => rnd.random() : Math.random);
  let n;
  if (pool.length === 1) n = 1;
  else if (count === 1 || count === 2) n = Math.min(count, PICK_MAX, pool.length);
  else n = Math.min(roll() < 0.5 ? 1 : 2, PICK_MAX, pool.length);
  if (pool.length <= n) return pool.slice();
  const copy = pool.slice();
  const out = [];
  for (let i = 0; i < n; i++) {
    const j = Math.floor(roll() * copy.length) % copy.length;
    out.push(copy.splice(j, 1)[0]);
  }
  return out;
}

export async function pickGallery(pose, count) {
  const body = { pose: pose || "" };
  if (count === 1 || count === 2) body.count = count;
  const j = await apiJson("/api/wifepay/pick", "POST", body);
  const items = Array.isArray(j.items) ? j.items.slice(0, PICK_MAX) : [];
  return { ...j, items };
}

export async function fetchDialog(info) {
  const j = await apiJson("/api/wifepay/dialog", "POST", info || {});
  return {
    narration: String(j.narration || ""),
    man: String(j.man || ""),
    wife: String(j.wife || ""),
    ai: !!j.ai,
    script_id: String(j.script_id || ""),
    script_name: String(j.script_name || ""),
    char_sec: j.char_sec,
  };
}

export async function fetchScripts() {
  const j = await apiJson("/api/wifepay/scripts");
  if (!Array.isArray(j.scripts)) {
    throw new Error("劇本接口回傳格式不對（沒有 scripts 陣列）。若剛更新程式，請先重啟 uvicorn。");
  }
  return j.scripts;
}

let _cfgP = null;
export function invalidateConfig() { _cfgP = null; }

export async function fetchConfig() {
  if (!_cfgP) {
    _cfgP = apiJson("/api/wifepay/config").catch(() => ({ char_sec: 0.9, poses: [], pose_catalog: [], door_muffle: true, door_muffle_level: "mid" }));
  }
  const j = await _cfgP;
  const char = Number(j.char_sec);
  return {
    char_sec: Number.isFinite(char) ? Math.max(0.05, Math.min(2, char)) : 0.9,
    poses: Array.isArray(j.poses) ? j.poses : [],
    pose_catalog: Array.isArray(j.pose_catalog) ? j.pose_catalog : [],
    door_muffle: parseMuffleEnabled(j.door_muffle, true),
    door_muffle_level: normalizeMuffleLevel(j.door_muffle_level),
    global_prompt: j.global_prompt,
    global_negative: j.global_negative,
    defaults: j.defaults,
  };
}

export async function saveConfig(fields) {
  invalidateConfig();
  const j = await apiJson("/api/wifepay/config", "PUT", fields || {});
  invalidateConfig();
  return j;
}

export function pickPeek(count, opt = {}) {
  const n = Math.max(1, Math.min(2, Number(count) || 1));
  const side = opt.side === "left" || opt.side === "right"
    ? opt.side
    : (Math.random() < 0.5 ? "left" : "right");
  const given = Array.isArray(opt.fracs) ? opt.fracs : [];
  const fracs = [];
  for (let i = 0; i < n; i++) {
    const hit = normalizeFrac(given[i]);
    fracs.push(hit || (Math.random() < 0.5 ? "1/2" : "3/5"));
  }
  return { side, fracs };
}

export function normalizePeek(raw, count) {
  const n = Math.max(1, Math.min(2, Number(count) || (raw && raw.fracs && raw.fracs.length) || 1));
  const side = raw && (raw.side === "left" || raw.side === "right") ? raw.side : "left";
  const fracs = [];
  const given = raw && Array.isArray(raw.fracs) ? raw.fracs : [];
  for (let i = 0; i < n; i++) fracs.push(normalizeFrac(given[i]) || "1/2");
  return { side, fracs };
}

function normalizeFrac(v) {
  const s = String(v ?? "").trim();
  if (v === 2 || v === 0.5 || s === "2" || s === "1/2" || s === "0.5") return "1/2";
  if (v === 0.6 || s === "3/5" || s === "0.6" || s === "0.60") return "3/5";
  const f = Number(v);
  if (Number.isFinite(f) && Math.abs(f - 0.5) <= 0.02) return "1/2";
  if (Number.isFinite(f) && Math.abs(f - 0.6) <= 0.02) return "3/5";
  return "";
}

export function fracValue(f) {
  return normalizeFrac(f) === "3/5" ? 3 / 5 : 0.5;
}

export function prefersReducedMotion() {
  return typeof matchMedia === "function" && matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** 門縫切圖的靜止位置，以及從該側螢幕邊緣移入的位移。
 * slide=1 在原位（置中的切圖），slide=0 整塊在畫面該側外側。切圖寬度固定為 1/2 或 3/5。 */
export function peekSlotLayout({ doorW, doorH, imgW, imgH, side, frac, slide } = {}) {
  const h = Math.max(1, Number(doorH) || 1);
  const nw = Math.max(1, Number(imgW) || 1);
  const nh = Math.max(1, Number(imgH) || 1);
  const fullW = h * (nw / nh);
  const fracN = typeof frac === "number" && Number.isFinite(frac) ? frac : fracValue(frac);
  const vis = Math.max(8, fullW * fracN);
  const boxW = Math.max(1, Number(doorW) || vis);
  const slotLeft = Math.max(0, (boxW - vis) / 2);
  const rawSlide = Number(slide);
  const t = Math.max(0, Math.min(1, Number.isFinite(rawSlide) ? rawSlide : 1));
  const startLeft = side === "right" ? boxW : -vis;
  const left = startLeft + (slotLeft - startLeft) * t;
  const imgLeft = side === "right" ? vis - fullW : 0;
  const shift = startLeft - slotLeft;
  return { fullW, vis, cur: vis, slotLeft, left, imgLeft, startLeft, shift };
}

/** 輪詢既有 /api/imggen；成功回圖 URL，失敗丟錯。 */
export async function waitImg(body, ms = 360000, onTick) {
  let key = body.key;
  let r = await apiJson("/api/imggen", "POST", { ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done") return r;
    if (r.status === "error") throw new Error(r.error || r.message || "生圖失敗");
    if (onTick) onTick(Math.round((Date.now() - t0) / 1000), r);
    await new Promise((x) => setTimeout(x, 1500));
    r = await apiJson("/api/imggen", "POST", { ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  throw new Error("生圖逾時");
}

export async function generateFromItem(item, opts = {}, onTick) {
  if (!item?.id) throw new Error("沒有底圖");
  const body = {
    item_id: item.id,
    character: opts.character || null,
    name: opts.name || opts.character?.name || "",
    pose: opts.pose || "",
    build: opts.build || opts.man || "average",
    family: opts.family || "",
    voice: opts.voice || "",
    stage: opts.stage || opts.character?.roomStage || opts.character?.stage || "",
    regular: !!opts.regular,
    guestName: opts.guestName || "",
    prompt: opts.prompt,
    negative: opts.negative,
    denoise: opts.denoise,
    seed: opts.seed || 0,
    ckpt: opts.ckpt || "",
    comfy_url: opts.comfy_url || "",
    key: opts.key || `wifepay:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    retry: true,
  };
  const r = await apiJson("/api/wifepay/gen", "POST", body);
  const key = r.key || body.key;
  const done = await waitImg({ ...body, key, provider: "comfy", retry: false }, opts.timeout || 360000, onTick);
  const url = String(done.result || done.url || "");
  if (!url) throw new Error("生圖沒有網址");
  return url;
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

export function typeDelay(mark, charSec = 0.9, prev = "") {
  const base = Math.max(50, Math.min(2000, Math.round((Number(charSec) || 0.9) * 1000)));
  // ……／… 比句號再多停一點；連續的 ... 後面幾點也略長
  if (/[…]/.test(mark)) return Math.round(base * (110 / 26));
  if (mark === "." && /[.…]/.test(prev)) return Math.round(base * (80 / 26));
  if (/[。！？!?]/.test(mark)) return Math.round(base * (90 / 26));
  if (/[、，,．.]/.test(mark)) return Math.round(base * (50 / 26));
  return base;
}

function speakerLabels(opts, row) {
  const wife = String(opts.wifeName || row?.wifeName || opts.name || "").trim() || "妻子";
  const guest = String(opts.guestName || row?.guestName || "").trim();
  return {
    nar: "旁白",
    man: guest ? `男子（${guest}）` : "男子",
    wife,
  };
}

/**
 * 在 host 裡掛上揭示畫面。
 * opts.dialog = 已有 {narration,man,wife} 或 ()=>Promise
 * opts.images = 已有 url[] 或 ()=>Promise<url[]>（空陣列＝只留對話）
 * opts.charSec 每字秒數（預設 0.9；也可等 fetchConfig）
 * opts.peek = {side, fracs}
 * opts.fullImage 編輯頁看全圖
 * opts.showFullToggle 顯示「看全圖」按鈕
 * opts.doorMuffle / opts.doorMuffleLevel / opts.muffleSeed / opts.showOriginal
 */
export function mountWifepayReveal(host, opts = {}) {
  ensureCss();
  if (!host) throw new Error("沒有容器");
  const prev = host.querySelector(":scope > .wp-reveal");
  if (prev) prev.remove();
  const el = document.createElement("div");
  el.className = "wp-reveal" + (opts.page ? " page" : "");
  el.innerHTML = `<div class="wp-pics" hidden>
      <div class="wp-stage"></div>
      <p class="wp-pic-hint" hidden>點圖看下一張</p>
      ${opts.showFullToggle !== false && opts.page ? `<button type="button" class="wp-full-btn">看全圖</button>` : ""}
    </div>
    <div class="wp-dialog">
      <p class="wp-wait">${opts.waitText || "門後傳來聲音……"}</p>
      <div class="wp-log"></div>
      <button type="button" class="wp-next" hidden>下一句</button>
      <p class="wp-note"></p>
    </div>`;
  host.append(el);
  const pics = el.querySelector(".wp-pics");
  const stage = el.querySelector(".wp-stage");
  const hint = el.querySelector(".wp-pic-hint");
  const fullBtn = el.querySelector(".wp-full-btn");
  const box = el.querySelector(".wp-dialog");
  const wait = el.querySelector(".wp-wait");
  const log = el.querySelector(".wp-log");
  const nextBtn = el.querySelector(".wp-next");
  const note = el.querySelector(".wp-note");
  const closed = { yes: false };
  const ctl = {
    phase: "idle",
    skipPause: null,
    skipType: null,
    goNext: null,
  };
  const state = {
    urls: [],
    peek: normalizePeek(opts.peek || {}, 1),
    idx: 0,
    shown: 0,
    starting: false,
    secondIn: false,
    sliding: false,
    full: !!opts.fullImage,
    charSec: opts.charSec != null ? Number(opts.charSec) : null,
    doorMuffle: opts.doorMuffle == null ? null : parseMuffleEnabled(opts.doorMuffle, true),
    doorMuffleLevel: opts.doorMuffleLevel == null ? null : normalizeMuffleLevel(opts.doorMuffleLevel),
    muffleSeed: opts.muffleSeed != null && Number.isFinite(Number(opts.muffleSeed)) ? Math.floor(Number(opts.muffleSeed)) : null,
    showOriginal: !!opts.showOriginal,
  };
  pics.classList.toggle("full", state.full);
  if (fullBtn) fullBtn.textContent = state.full ? "門縫切圖" : "看全圖";

  const hideWait = () => { wait.style.display = "none"; };
  const showNext = (on) => { nextBtn.hidden = !on; };
  const scrollLog = () => { log.scrollTop = log.scrollHeight; };

  function addLine(kind, label, waiting) {
    const node = document.createElement("p");
    node.className = `wp-line ${kind}`;
    node.innerHTML = `<span class="wp-k"></span><span class="wp-t"></span>`;
    node.querySelector(".wp-k").textContent = label;
    const body = node.querySelector(".wp-t");
    if (waiting) body.classList.add("waiting");
    log.append(node);
    scrollLog();
    return { node, body };
  }

  function markHist() {
    log.querySelectorAll(".wp-line:not(.hist)").forEach((n) => n.classList.add("hist"));
  }

  function stageSize() {
    return {
      w: stage.clientWidth || pics.clientWidth || 0,
      h: stage.clientHeight || pics.clientHeight || 0,
    };
  }

  function layoutOf(img, i) {
    const { w, h } = stageSize();
    if (!h || !img || !img.naturalWidth || !img.naturalHeight) return null;
    const frac = fracValue((state.peek.fracs || [])[i] || (state.peek.fracs || [])[0] || "1/2");
    return peekSlotLayout({
      doorW: w,
      doorH: h,
      imgW: img.naturalWidth,
      imgH: img.naturalHeight,
      side: state.peek.side,
      frac,
      slide: 1,
    });
  }

  function layoutSlot(slot, i, mode) {
    if (!slot || closed.yes) return;
    const img = slot.querySelector("img");
    const { h } = stageSize();
    if (!h) return;
    if (state.full) {
      slot.style.top = "0px";
      slot.style.left = "0px";
      slot.style.width = "100%";
      slot.style.height = h + "px";
      if (img) {
        img.style.width = "";
        img.style.height = "100%";
        img.style.left = "";
      }
      return;
    }
    const layout = layoutOf(img, i);
    if (!layout) return;
    slot.style.top = "0px";
    slot.style.left = layout.slotLeft + "px";
    slot.style.height = h + "px";
    slot.style.width = layout.vis + "px";
    if (img && img.naturalWidth) {
      img.style.height = h + "px";
      img.style.width = layout.fullW + "px";
      img.style.left = layout.imgLeft + "px";
    }
    if (slot.classList.contains("sliding")) return;
    const side = state.peek.side;
    const nudge = side === "right" ? 8 : -8;
    if (mode === "off") {
      slot.style.transform = `translateX(${layout.shift}px)`;
      slot.style.opacity = "0";
    } else if (mode === "under") {
      slot.style.transform = `translate(${nudge}px, 6px)`;
      slot.style.opacity = "0.55";
    } else {
      slot.style.transform = "translate(0, 0)";
      slot.style.opacity = "1";
    }
  }

  function layoutAll() {
    if (closed.yes) return;
    stage.querySelectorAll(".wp-slot").forEach((slot) => {
      const i = Number(slot.dataset.i) || 0;
      const mode = slot.classList.contains("under") ? "under"
        : (slot.classList.contains("in") ? "in" : "off");
      layoutSlot(slot, i, mode);
    });
  }

  function slotFor(i, url) {
    let slot = stage.querySelector(`.wp-slot[data-i="${i}"]`);
    if (!slot) {
      slot = document.createElement("div");
      slot.className = "wp-slot";
      slot.dataset.i = String(i);
      const img = document.createElement("img");
      img.alt = "";
      img.addEventListener("load", () => {
        const mode = slot.classList.contains("under") ? "under"
          : (slot.classList.contains("in") ? "in" : "off");
        layoutSlot(slot, i, mode);
      });
      slot.append(img);
      stage.append(slot);
    }
    const img = slot.querySelector("img");
    if (url && img.getAttribute("src") !== url) img.src = url;
    return slot;
  }

  function syncHint() {
    const more = state.urls.length > 1 && !state.secondIn && state.shown >= 1;
    pics.classList.toggle("has-next", more);
    if (hint) hint.hidden = !more;
  }

  function whenLoaded(img) {
    if (img && img.complete && img.naturalWidth) return Promise.resolve();
    return new Promise((resolve) => {
      if (!img) return resolve();
      const done = () => {
        img.removeEventListener("load", done);
        img.removeEventListener("error", done);
        resolve();
      };
      img.addEventListener("load", done);
      img.addEventListener("error", done);
    });
  }

  function sleep(ms) {
    return new Promise((resolve) => {
      if (closed.yes || !(ms > 0)) return resolve();
      setTimeout(resolve, ms);
    });
  }

  async function moveDialogDown(ms) {
    if (el.classList.contains("has-pics") && pics.classList.contains("ready")) return;
    pics.hidden = false;
    pics.classList.add("ready");
    const h = Math.max(120, el.clientHeight - 80);
    pics.style.maxHeight = "0px";
    el.classList.add("has-pics");
    void pics.offsetHeight;
    pics.style.maxHeight = h + "px";
    await sleep(ms);
    if (closed.yes) return;
    pics.style.maxHeight = "100%";
    layoutAll();
  }

  async function slideIn(i) {
    const url = state.urls[i];
    if (!url || closed.yes) return;
    const slot = slotFor(i, url);
    await whenLoaded(slot.querySelector("img"));
    if (closed.yes) return;
    const reduced = prefersReducedMotion();
    const ms = reduced ? REDUCE_MS : SLIDE_MS;
    if (i > 0) {
      const prev = stage.querySelector('.wp-slot[data-i="0"]');
      if (prev) {
        prev.classList.add("under");
        prev.classList.remove("front");
        prev.style.transition = reduced
          ? `opacity ${REDUCE_MS}ms ease, transform ${REDUCE_MS}ms ease`
          : `opacity ${ms}ms ease, transform ${ms}ms ease`;
        layoutSlot(prev, 0, "under");
      }
    }
    slot.classList.add("front");
    slot.classList.remove("under");
    layoutSlot(slot, i, "off");
    void slot.offsetWidth;
    state.sliding = true;
    if (reduced || state.full) {
      slot.style.transition = `opacity ${ms}ms ease`;
      slot.style.transform = "translate(0, 0)";
      slot.style.opacity = "1";
    } else {
      slot.style.transition = `transform ${ms}ms cubic-bezier(.16,.8,.28,1), opacity ${Math.round(ms * 0.85)}ms ease-out`;
      slot.style.transform = "translate(0, 0)";
      slot.style.opacity = "1";
    }
    slot.classList.add("in", "sliding");
    await sleep(ms);
    slot.classList.remove("sliding");
    state.sliding = false;
    if (i === 0) state.shown = Math.max(state.shown, 1);
    if (i >= 1) { state.shown = 2; state.secondIn = true; }
    state.idx = i;
    syncHint();
  }

  async function revealNextImage() {
    if (closed.yes || state.sliding || state.secondIn) return;
    if (state.urls.length < 2 || state.shown < 1) return;
    await slideIn(1);
  }

  async function applyImages(urls) {
    const list = (urls || []).map((u) => String(u || "")).filter(Boolean);
    if (!list.length || closed.yes) return;
    if (list.length > state.peek.fracs.length) {
      state.peek = pickPeek(list.length, { side: state.peek.side, fracs: state.peek.fracs });
    }
    const firstTime = !state.starting && !el.classList.contains("has-pics");
    state.urls = list;
    list.forEach((url, i) => slotFor(i, url));
    syncHint();
    if (!firstTime) {
      if (state.shown >= 1) layoutAll();
      return;
    }
    state.starting = true;
    const reduced = prefersReducedMotion();
    await moveDialogDown(reduced ? REDUCE_MS : DIALOG_DOWN_MS);
    if (closed.yes) return;
    await slideIn(0);
    syncHint();
  }

  function setFull(on) {
    state.full = !!on;
    pics.classList.toggle("full", state.full);
    if (fullBtn) fullBtn.textContent = state.full ? "門縫切圖" : "看全圖";
    layoutAll();
    syncHint();
  }

  fullBtn?.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    setFull(!state.full);
  });
  if (typeof ResizeObserver !== "undefined") {
    const ro = new ResizeObserver(() => layoutAll());
    ro.observe(pics);
  }
  window.addEventListener("resize", layoutAll);
  pics.addEventListener("click", (ev) => {
    if (ev.target.closest(".wp-full-btn")) return;
    ev.preventDefault();
    ev.stopPropagation();
    void revealNextImage();
  });

  function advanceFromClick() {
    if (closed.yes) return;
    if (ctl.phase === "pause" && ctl.skipPause) ctl.skipPause();
    else if (ctl.phase === "typing" && ctl.skipType) ctl.skipType();
    else if (ctl.phase === "await-next" && ctl.goNext) ctl.goNext();
  }

  box.addEventListener("click", (ev) => {
    if (ev.target.closest(".wp-next")) return;
    advanceFromClick();
  });
  nextBtn.addEventListener("click", (ev) => {
    ev.preventDefault();
    ev.stopPropagation();
    if (ctl.phase === "await-next" && ctl.goNext) ctl.goNext();
  });

  function waitPause(ms) {
    return new Promise((resolve) => {
      if (closed.yes) return resolve();
      ctl.phase = "pause";
      const t = setTimeout(done, ms);
      function done() {
        clearTimeout(t);
        ctl.skipPause = null;
        if (ctl.phase === "pause") ctl.phase = "idle";
        resolve();
      }
      ctl.skipPause = done;
    });
  }

  function typeText(body, text) {
    return new Promise((resolve) => {
      const full = String(text || "");
      const chars = Array.from(full);
      body.classList.remove("waiting");
      if (!chars.length) {
        body.textContent = "";
        return resolve();
      }
      if (closed.yes) {
        body.textContent = full;
        return resolve();
      }
      ctl.phase = "typing";
      let i = 0;
      let timer = 0;
      const finish = () => {
        clearTimeout(timer);
        ctl.skipType = null;
        body.textContent = full;
        if (ctl.phase === "typing") ctl.phase = "idle";
        scrollLog();
        resolve();
      };
      ctl.skipType = finish;
      const tick = () => {
        if (closed.yes) return finish();
        i += 1;
        body.textContent = chars.slice(0, i).join("");
        scrollLog();
        if (i >= chars.length) return finish();
        const sec = state.charSec != null ? state.charSec : 0.9;
        timer = setTimeout(tick, typeDelay(chars[i - 1], sec, chars[i - 2] || ""));
      };
      tick();
    });
  }

  function waitNext() {
    return new Promise((resolve) => {
      if (closed.yes) return resolve();
      ctl.phase = "await-next";
      showNext(true);
      ctl.goNext = () => {
        ctl.goNext = null;
        showNext(false);
        if (ctl.phase === "await-next") ctl.phase = "idle";
        resolve();
      };
    });
  }

  const api = {
    el,
    close() {
      if (closed.yes) return;
      closed.yes = true;
      window.removeEventListener("resize", layoutAll);
      try { ctl.skipPause?.(); } catch { /* */ }
      try { ctl.skipType?.(); } catch { /* */ }
      try { ctl.goNext?.(); } catch { /* */ }
      el.remove();
      try { opts.onClose?.(); } catch { /* */ }
    },
    setNote(text) { note.textContent = text || ""; },
    setCharSec(sec) {
      const n = Number(sec);
      if (Number.isFinite(n)) state.charSec = Math.max(0.05, Math.min(2, n));
    },
    setMuffle(opts = {}) {
      if (opts.doorMuffle != null) state.doorMuffle = parseMuffleEnabled(opts.doorMuffle, true);
      if (opts.doorMuffleLevel != null) state.doorMuffleLevel = normalizeMuffleLevel(opts.doorMuffleLevel);
      if (opts.muffleSeed != null && Number.isFinite(Number(opts.muffleSeed))) {
        state.muffleSeed = Math.floor(Number(opts.muffleSeed));
      }
      if (opts.showOriginal != null) state.showOriginal = !!opts.showOriginal;
    },
    setPeek(peek) {
      state.peek = normalizePeek(peek || state.peek, Math.max(state.urls.length, (peek && peek.fracs && peek.fracs.length) || 1));
      layoutAll();
    },
    setFull,
    async setDialog(row) {
      if (closed.yes) return;
      return playFrom(Promise.resolve(row));
    },
    setImages(urls, peek) {
      if (peek) api.setPeek(peek);
      return applyImages(urls);
    },
  };

  let playJob = 0;
  async function playFrom(dialogP) {
    const job = ++playJob;
    const first = addLine("wp-nar", "旁白", true);
    hideWait();
    let row = null;
    try {
      row = await Promise.resolve(dialogP);
    } catch {
      row = null;
    }
    if (closed.yes || job !== playJob) return;
    if (row && row.char_sec != null && state.charSec == null) api.setCharSec(row.char_sec);
    const labels = speakerLabels(opts, row);
    first.node.querySelector(".wp-k").textContent = labels.nar;
    if (!row || !(row.narration || row.man || row.wife)) {
      first.body.classList.remove("waiting");
      first.body.textContent = "聽不清楚裡面在說什麼。";
      api.setNote("對話沒有產出");
      return;
    }
    first.body.classList.remove("waiting");
    const instant = !!opts.instant;
    if (!instant) {
      await waitPause(800);
      if (closed.yes || job !== playJob) return;
    }
    if (row.narration) {
      if (instant) first.body.textContent = row.narration;
      else await typeText(first.body, row.narration);
    } else {
      first.node.remove();
    }
    if (closed.yes || job !== playJob) return;
    const rest = [];
    const muffleOn = state.doorMuffle !== false;
    const muffleLv = state.doorMuffleLevel || "mid";
    const muffleSeed = state.muffleSeed != null ? state.muffleSeed : (Math.floor(Math.random() * 0xfffffffe) + 1);
    if (state.muffleSeed == null) state.muffleSeed = muffleSeed;
    const pack = (kind, label, raw, side) => {
      const heard = hearLine(raw, { side, enabled: muffleOn, level: muffleLv, seed: muffleSeed });
      return [kind, label, heard.text, raw, heard.text !== raw];
    };
    if (row.man) rest.push(pack("wp-man", labels.man, row.man, "man"));
    if (row.wife) rest.push(pack("wp-wife", labels.wife, row.wife, "wife"));
    for (let i = 0; i < rest.length; i++) {
      if (!instant) {
        await waitNext();
        if (closed.yes || job !== playJob) return;
      }
      markHist();
      const [kind, label, text, raw] = rest[i];
      const line = addLine(kind, label, false);
      if (instant) {
        line.body.textContent = text;
      } else {
        await waitPause(800);
        if (closed.yes || job !== playJob) return;
        await typeText(line.body, text);
      }
      if (state.showOriginal && raw && raw !== text) {
        const orig = document.createElement("span");
        orig.className = "wp-orig";
        orig.textContent = "原句：" + raw;
        line.node.append(orig);
      }
    }
    ctl.phase = "done";
    showNext(false);
  }

  const run = async () => {
    try {
      if (state.charSec == null || state.doorMuffle == null || state.doorMuffleLevel == null) {
        try {
          const cfg = await fetchConfig();
          if (state.charSec == null) api.setCharSec(cfg.char_sec);
          if (state.doorMuffle == null) state.doorMuffle = parseMuffleEnabled(cfg.door_muffle, true);
          if (state.doorMuffleLevel == null) state.doorMuffleLevel = normalizeMuffleLevel(cfg.door_muffle_level);
        } catch { /* 用預設 */ }
      }
      if (state.muffleSeed == null) state.muffleSeed = Math.floor(Math.random() * 0xfffffffe) + 1;
      if (opts.emptyMessage) api.setNote(opts.emptyMessage);
      const dlgP = typeof opts.dialog === "function" ? opts.dialog() : Promise.resolve(opts.dialog);
      const imgP = typeof opts.images === "function" ? opts.images() : Promise.resolve(opts.images);
      Promise.resolve(imgP).then((urls) => {
        if (closed.yes) return;
        if (Array.isArray(urls) && urls.length) {
          api.setNote("");
          api.setImages(urls, opts.peek);
        }
      }).catch((err) => {
        if (!closed.yes) api.setNote(String(err?.message || err || "圖片沒有產出，只留對話"));
      });
      await playFrom(dlgP);
    } catch (err) {
      api.setNote(String(err?.message || err || "出錯了"));
    }
  };
  run();
  return api;
}

/** 遊戲／全部測試：從該姿勢已選底圖抽 1～2 張、生對話、生圖，掛到 host。空圖庫不清文生圖。 */
export function startWifepayPeek(host, opts = {}) {
  const info = {
    character: opts.character || null,
    name: opts.name || opts.character?.name || opts.who?.name || "",
    pose: opts.pose || "",
    build: opts.build || opts.man || "average",
    family: opts.family || "",
    voice: opts.voice || "",
    stage: opts.stage || opts.character?.roomStage || opts.who?.roomStage || opts.character?.stage || "",
    regular: !!opts.regular,
    guestName: opts.guestName || opts.guest?.name || "",
    script_id: opts.script_id || opts.script || "random",
  };
  const genOpts = {
    character: info.character,
    name: info.name,
    pose: info.pose,
    build: info.build,
    family: info.family,
    voice: info.voice,
    stage: info.stage,
    regular: info.regular,
    guestName: info.guestName,
    denoise: opts.denoise,
    seed: opts.seed,
    ckpt: opts.ckpt,
    comfy_url: opts.comfy_url,
    prompt: opts.prompt,
    negative: opts.negative,
  };
  let emptyMessage = "";
  let peek = opts.peek || null;
  const pickP = (async () => {
    try {
      if (Array.isArray(opts.items) && opts.items.length) {
        const given = opts.items.filter((x) => x && x.id && x.url).slice(0, PICK_MAX);
        return { items: given, peek: opts.peek || pickPeek(given.length || 1), empty: !given.length };
      }
      return await pickGallery(info.pose, opts.count);
    } catch (err) {
      return { items: [], empty: true, peek: null, error: err };
    }
  })();
  const images = async () => {
    const picked = await pickP;
    if (picked.char_sec != null) ui?.setCharSec(picked.char_sec);
    if (picked.peek) peek = picked.peek;
    if (picked.empty || !(picked.items || []).length) {
      emptyMessage = "圖庫是空的，只留對話。請先到 /wifepay 上傳底圖。";
      throw new Error(emptyMessage);
    }
    if (!peek) peek = pickPeek(picked.items.length);
    ui?.setPeek(peek);
    if (typeof opts.onStatus === "function") opts.onStatus(`正在生成 ${picked.items.length} 張圖…`);
    const urls = [];
    await Promise.all(picked.items.map(async (item, i) => {
      try {
        const url = await generateFromItem(item, { ...genOpts, key: `wifepay:${Date.now().toString(36)}:${i}` }, (sec) => {
          if (typeof opts.onStatus === "function") opts.onStatus(`生圖中… ${sec}s（${picked.items.length} 張）`);
        });
        if (url) {
          urls.push(url);
          try { ui.setImages(urls.slice(), peek); } catch { /* */ }
        }
      } catch (err) {
        console.warn("[wifepay]", err);
      }
    }));
    if (!urls.length) throw new Error("圖片沒有產出，只留對話");
    return urls;
  };
  const dialog = async () => {
    let tags = [info.pose, ...(opts.tags || [])].filter(Boolean);
    try {
      const picked = await pickP;
      for (const it of picked.items || []) {
        for (const tag of it.tags || []) if (tag) tags.push(tag);
      }
    } catch { /* 圖庫空也還是能生對話 */ }
    try { return await fetchDialog({ ...info, tags }); } catch { return null; }
  };
  let ui;
  ui = mountWifepayReveal(host, {
    page: !!opts.page,
    instant: !!opts.instant,
    waitText: opts.waitText || "門後傳來聲音……",
    wifeName: info.name,
    guestName: info.guestName,
    charSec: opts.charSec,
    peek,
    fullImage: !!opts.fullImage,
    showFullToggle: opts.showFullToggle !== false && !!opts.page,
    doorMuffle: opts.doorMuffle,
    doorMuffleLevel: opts.doorMuffleLevel,
    muffleSeed: opts.muffleSeed,
    showOriginal: !!opts.showOriginal,
    dialog,
    images: async () => {
      const urls = await images();
      if (emptyMessage) ui.setNote(emptyMessage);
      return urls;
    },
    onClose: opts.onClose,
  });
  return ui;
}

export { apiJson };
