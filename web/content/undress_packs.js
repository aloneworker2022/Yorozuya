/** 房間脫衣用的全身圖。玩家不選景：幫她脫／叫她脫依階段用圖。自己脫上衣、幫忙脫上衣已取消。 */

const API = "/api/undress-packs";

/** 預設七景。前四場是虛脫坐姿；後三場是裸體站姿。不是做愛。召喚一併生的是下面六張，不含仍穿著的坐下。 */
export const SUMMON_UNDRESS_SHOTS = Object.freeze([
  "undress_loose",
  "undress_slip",
  "undress_nude",
  "undress_cover",
  "undress_low",
  "undress_stand",
]);
export const DROPPED_UNDRESS_SHOTS = new Set(["undress_self", "undress_help"]);
export const UNDRESS_PRESETS = [
  {
    id: "undress_sit",
    name: "虛脫坐下",
    shot: "undress_sit",
    caption: "她虛脫地坐在地上，使不上力。",
    prompt: [
      "full body",
      "sitting on the floor",
      "slumped",
      "exhausted",
      "knees bent loosely",
      "one palm braced on the floor",
      "limp shoulders",
      "vacant dazed eyes",
      "heavy blush",
      "slightly open mouth",
      "sweat",
      "still dressed",
    ].join(", "),
    negative: "standing, walking, running, extra arms, extra legs, text, watermark",
  },
  {
    id: "undress_loose",
    name: "只穿內衣",
    shot: "undress_loose",
    caption: "她坐在地上，外衣脫了，只剩胸罩和內褲。",
    prompt: [
      "full body",
      "sitting on the floor",
      "slumped",
      "exhausted",
      "knees bent loosely",
      "one palm braced on the floor",
      "limp shoulders",
      "vacant dazed eyes",
      "heavy blush",
      "slightly open mouth",
      "sweat",
      "bra",
      "panties",
      "underwear only",
      "breasts covered by bra",
      "no shirt",
      "no dress",
      "no skirt",
    ].join(", "),
    negative: "standing, walking, running, extra arms, extra legs, text, watermark, shirt, dress, skirt, jacket, coat, uniform, nude, completely naked, topless, bare breasts, nipples, bottomless",
  },
  {
    id: "undress_slip",
    name: "只穿內褲",
    shot: "undress_slip",
    caption: "她坐在地上，胸罩也脫了，只剩內褲。",
    prompt: [
      "full body",
      "sitting on the floor",
      "slumped",
      "exhausted",
      "knees bent loosely",
      "one palm braced on the floor",
      "limp shoulders",
      "vacant dazed eyes",
      "heavy blush",
      "slightly open mouth",
      "sweat",
      "panties only",
      "topless",
      "bare breasts",
      "nipples",
      "no bra",
      "no shirt",
      "no dress",
      "no skirt",
    ].join(", "),
    negative: "standing, walking, running, extra arms, extra legs, text, watermark, bra, shirt, dress, skirt, jacket, coat, uniform, completely naked, bottomless",
  },
  {
    id: "undress_nude",
    name: "脫掉內褲",
    shot: "undress_nude",
    caption: "她坐在地上，內褲也脫了，身上什麼都沒穿。",
    prompt: [
      "full body",
      "sitting on the floor",
      "slumped",
      "exhausted",
      "knees bent loosely",
      "one palm braced on the floor",
      "limp shoulders",
      "vacant dazed eyes",
      "heavy blush",
      "slightly open mouth",
      "sweat",
      "nude",
      "completely nude",
      "no clothes",
      "no panties",
      "no bra",
      "bare breasts",
      "nipples",
    ].join(", "),
    negative: "standing, walking, running, extra arms, extra legs, text, watermark, bra, panties, underwear, lingerie, bikini, shirt, dress, skirt, jacket, coat, uniform, covered breasts",
  },
  {
    id: "undress_cover",
    name: "遮住胸和下體",
    shot: "undress_cover",
    caption: "她全身站著，沒穿衣服，一手遮胸、一手遮下面。",
    prompt: [
      "full body",
      "standing",
      "looking at viewer",
      "arm across breasts",
      "hand covering breasts",
      "hand covering crotch",
      "shy",
      "nude",
      "completely nude",
      "no clothes",
      "no panties",
      "no bra",
      "bare breasts",
      "nipples",
    ].join(", "),
    negative: "sitting, slumped, bra, panties, underwear, lingerie, bikini, shirt, dress, skirt, jacket, coat, uniform",
  },
  {
    id: "undress_low",
    name: "遮住下面",
    shot: "undress_low",
    caption: "她全身站著，胸口露著，只拿手遮住下面。",
    prompt: [
      "full body",
      "standing",
      "looking at viewer",
      "hand covering crotch",
      "arm at side",
      "nude",
      "completely nude",
      "no clothes",
      "no panties",
      "no bra",
      "bare breasts",
      "nipples",
    ].join(", "),
    negative: "sitting, slumped, arm across breasts, covering breasts, bra, panties, underwear, lingerie, bikini, shirt, dress, skirt, jacket, coat, uniform, covered breasts",
  },
  {
    id: "undress_stand",
    name: "裸體立繪",
    shot: "undress_stand",
    caption: "她全身站著，什麼都沒穿，也沒有遮。",
    prompt: [
      "full body",
      "standing",
      "looking at viewer",
      "arms at sides",
      "nude",
      "completely nude",
      "no clothes",
      "no panties",
      "no bra",
      "bare breasts",
      "nipples",
    ].join(", "),
    negative: "sitting, sitting on the floor, slumped, covering breasts, covering crotch, arm across breasts, hand covering crotch, bra, panties, underwear, lingerie, bikini, shirt, dress, skirt, jacket, coat, uniform, covered breasts",
  },
];

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 場景檔名。必須是 undress_*，伺服器才會當全身去背立繪。 */
export function normalizeUndressShot(raw, fallback = "") {
  const ok = (s) => /^undress_[a-z0-9_]{1,32}$/.test(s);
  const clean = (s) => String(s || "").trim().toLowerCase().replace(/[^a-z0-9_]/g, "");
  const a = clean(raw);
  if (ok(a)) return a;
  const b = clean(fallback);
  if (ok(b)) return b;
  return "undress_scene";
}

export function presetByShot(shot) {
  const key = normalizeUndressShot(shot, "");
  return UNDRESS_PRESETS.find((p) => p.shot === key) || null;
}

export function defaultUndressPrompt(shot) {
  return (presetByShot(shot) || UNDRESS_PRESETS[0]).prompt;
}

export function defaultUndressNegative(shot) {
  return (presetByShot(shot) || UNDRESS_PRESETS[0]).negative;
}

export function emptyUndressPack(name = "脫衣場景") {
  const id = uid();
  const sit = UNDRESS_PRESETS[0];
  return {
    id,
    name: String(name || "脫衣場景").slice(0, 40),
    shot: normalizeUndressShot("undress_" + id, "undress_scene"),
    caption: sit.caption,
    poseDenoise: 0.55,
    prompt: sit.prompt,
    negative: sit.negative,
    ref: "",
    url: "",
    updated: Date.now(),
  };
}

export function normalizeUndressPack(raw) {
  const base = emptyUndressPack();
  const s = raw && typeof raw === "object" ? raw : {};
  const shot = normalizeUndressShot(s.shot, s.id || base.shot);
  return {
    id: String(s.id || base.id).slice(0, 40) || base.id,
    name: String(s.name || base.name).slice(0, 40) || base.name,
    shot,
    caption: String(s.caption ?? presetByShot(shot)?.caption ?? base.caption).slice(0, 80),
    poseDenoise: clampDenoise(s.poseDenoise ?? s.pose_denoise ?? base.poseDenoise),
    prompt: String(s.prompt ?? base.prompt),
    negative: String(s.negative ?? base.negative),
    ref: String(s.ref || "").trim(),
    url: String(s.url || "").trim(),
    updated: Number(s.updated) || 0,
  };
}

export function normalizeUndressDoc(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const packs = (Array.isArray(src.packs) ? src.packs : []).map(normalizeUndressPack).filter((p) => p.id);
  let activeId = String(src.activeId || "");
  if (packs.length && !packs.some((p) => p.id === activeId)) activeId = packs[0].id;
  if (!packs.length) activeId = "";
  return { packs, activeId };
}

export function builtinUndressDoc() {
  return normalizeUndressDoc({
    packs: UNDRESS_PRESETS.map((p) => ({ ...p, poseDenoise: 0.55, ref: "", url: "", updated: 0 })),
    activeId: UNDRESS_PRESETS[0].id,
  });
}

function girlOwnCkpt(girl) {
  return String(girl?.comfyCkpt || "").trim();
}

function shortCkptName(path) {
  const s = String(path || "").trim();
  if (!s) return "";
  const base = s.split(/[/\\]/).pop() || s;
  return base.replace(/\.(safetensors|ckpt|pt|pth)$/i, "");
}

function resolveComfyCkpt(girl, eng = {}) {
  const ck = girlOwnCkpt(girl) || String(eng.comfyCkpt || "").trim();
  if (!ck) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt）");
  return ck;
}

function wornOutfit(g) {
  const look = g?.look || {};
  const wardrobe = Array.isArray(look.wardrobe) ? look.wardrobe : [];
  const erotic = Array.isArray(look.eroticOutfits) ? look.eroticOutfits : [];
  const sleep = Array.isArray(look.sleepOutfits) ? look.sleepOutfits : [];
  const pick = g?.outfitPick;
  if (typeof pick === "string" && pick[0] === "e") {
    const index = Number(pick.slice(1));
    if (Number.isInteger(index) && erotic[index]) return String(erotic[index]);
  }
  if (typeof pick === "string" && pick[0] === "s") {
    const index = Number(pick.slice(1));
    if (Number.isInteger(index) && sleep[index]) return String(sleep[index]);
  }
  if (Number.isInteger(pick) && pick >= 0 && pick < wardrobe.length) return String(wardrobe[pick] || "");
  return String(look.career_outfit || look.style || "");
}

/** 陌生人 sfw、女友以上 nsfw。跟房間半身同一條，不強制裸。 */
function halfRating(g) {
  const stage = String(g?.stage || "stranger");
  if (stage.includes("wife") || stage === "girlfriend" || stage === "lover" || stage === "passionate") {
    return "nsfw";
  }
  return "sfw";
}

/**
 * 脫衣場景生圖。全身、去背、人設 seed。
 * prompt 留空，動作只走 extra。不設 lock_identity，避免被當成雙人場面。
 */
export function buildUndressImgBody(pack, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const p = normalizeUndressPack(pack);
  const worn = opts.worn != null ? opts.worn : wornOutfit(girl);
  const ref = String(p.ref || "").trim();
  const ckpt = comfy ? resolveComfyCkpt(girl, eng) : "";
  // 穿好坐下才沿用半身評級。其餘脫衣景走 nsfw，避免把上衣畫回去。
  const rating = p.shot === "undress_sit"
    ? (opts.rating || halfRating(girl))
    : "nsfw";
  return {
    key: `undress:${p.shot}:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: "full",
    rating,
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: worn,
    prompt: "",
    extra: String(p.prompt || "").trim(),
    negative: String(p.negative || "").trim(),
    visual_neg: String(p.negative || "").trim(),
    cutout: true,
    flat_bg: true,
    retry: true,
    scene_kind: "portrait",
    shot: p.shot,
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: clampDenoise(p.poseDenoise) } : {}),
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt } : {}),
  };
}

const LOAD_HINT = "讀不到脫衣場景（/api/undress-packs）。請 pull 最新 grok-telephon 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 3766）";
const SAVE_HINT = "伺服器未重啟，無法儲存脫衣場景（PUT /api/undress-packs）。請 pull 最新 grok-telephon 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 3766）";

export async function loadUndressDoc() {
  let r;
  try {
    r = await fetch(API + "?ts=" + Date.now(), { cache: "no-store" });
  } catch {
    return loadUndressDocStatic();
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return normalizeUndressDoc(j);
  if (r.status !== 404) {
    throw new Error(formatApiError("GET", API, j.detail || j.error || r.status));
  }
  return loadUndressDocStatic();
}

async function loadUndressDocStatic() {
  try {
    const r = await fetch("/content/undress_packs.json?ts=" + Date.now(), { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(formatApiError("GET", "/content/undress_packs.json", j.detail || j.error || r.status));
    return normalizeUndressDoc(j);
  } catch {
    throw new Error(LOAD_HINT);
  }
}

export async function saveUndressDoc(doc) {
  const body = normalizeUndressDoc(doc);
  const r = await fetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) throw new Error(SAVE_HINT);
    throw new Error(formatApiError("PUT", API, j.detail || j.error || r.status));
  }
  return body;
}

let _cache = null;
let _cacheAt = 0;

export function invalidateUndressCache() {
  _cache = null;
  _cacheAt = 0;
}

/** 房間脫衣要圖時用。讀取失敗才退回內建七景。 */
export async function listUndressScenes(force = false) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < 15000) return _cache.packs;
  try {
    _cache = await loadUndressDoc();
    _cacheAt = now;
    return _cache.packs;
  } catch {
    if (_cache) return _cache.packs;
    return builtinUndressDoc().packs;
  }
}

export async function generateUndressPackImage(pack, girl, eng, opts = {}) {
  const body = buildUndressImgBody(pack, girl, eng, opts);
  const r = await waitImg(body, opts.onTick);
  return { status: r.status, result: r.result, error: r.error, body, key: r.key };
}

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatApiError(method, url, detail) {
  return `${method || "GET"} ${url} → ${detail}`;
}

async function apiJson(url, method, body) {
  const verb = method || "GET";
  const r = await fetch(url, {
    method: verb,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(formatApiError(verb, url, j.detail || j.error || r.status));
  return j;
}

async function waitImg(body, onTick, ms = 360000) {
  let key = body.key;
  let r = await apiJson("/api/imggen", "POST", { ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done" || r.status === "error") return r;
    if (onTick) onTick(Math.round((Date.now() - t0) / 1000));
    await new Promise((x) => setTimeout(x, 1500));
    r = await apiJson("/api/imggen", "POST", { ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  return { status: "error", error: "逾時" };
}

/**
 * 掛載試煉房「脫衣圖」面板。
 * @param {{ getGirl: () => object|null, getEngine: () => Promise<object> }} hooks
 */
export function mountUndressPackEditor(hooks = {}) {
  const openBtn = $("btn-undress-packs");
  const panel = $("undress-pack-editor");
  if (!openBtn || !panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";

  let doc = { packs: [], activeId: "" };
  let activeId = "";
  let girls = [];
  let girlId = "";

  const setStatus = (msg, err = false) => {
    const el = $("ud-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!err);
  };

  const activePack = () => doc.packs.find((p) => p.id === activeId) || doc.packs[0] || null;

  const renderPacks = () => {
    const sel = $("ud-pack");
    if (!sel) return;
    if (!doc.packs.some((p) => p.id === activeId) && doc.packs[0]) activeId = doc.packs[0].id;
    sel.innerHTML = doc.packs.length
      ? doc.packs.map((p) =>
        `<option value="${esc(p.id)}"${p.id === activeId ? " selected" : ""}>${esc(p.name)}</option>`).join("")
      : `<option value="">（尚無場景）</option>`;
  };

  const renderGirls = () => {
    const sel = $("ud-girl");
    if (!sel) return;
    const live = hooks.getGirl?.();
    if (live?.id && !girls.some((g) => g.id === live.id)) girls = [live, ...girls];
    if (!girls.some((g) => g.id === girlId)) girlId = live?.id || girls[0]?.id || "";
    sel.innerHTML = girls.length
      ? girls.map((g) =>
        `<option value="${esc(g.id)}"${g.id === girlId ? " selected" : ""}>${esc(g.name || g.id)}</option>`).join("")
      : `<option value="">（無可用魅子）</option>`;
  };

  const currentGirl = () => {
    const live = hooks.getGirl?.();
    if (live?.id && live.id === girlId) return live;
    return girls.find((g) => g.id === girlId) || live || girls[0] || null;
  };

  const updateRefFlag = () => {
    const p = activePack();
    const ref = p?.ref || "";
    const flag = $("ud-mode-flag");
    const refFlag = $("ud-ref-flag");
    const thumb = $("ud-ref-thumb");
    if (flag) {
      flag.textContent = ref ? "圖生圖（pose_ref）" : "文生圖";
      flag.className = "ud-mode-flag " + (ref ? "img" : "txt");
    }
    if (refFlag) refFlag.textContent = ref ? ("已掛 " + ref) : "沒有參考圖 → 文生圖";
    if (thumb) {
      if (ref) {
        thumb.hidden = false;
        thumb.src = ref + (ref.includes("?") ? "&" : "?") + "t=" + Date.now();
      } else {
        thumb.hidden = true;
        thumb.removeAttribute("src");
      }
    }
  };

  const renderForm = () => {
    const p = activePack();
    if (!p) {
      if ($("ud-name")) $("ud-name").value = "";
      if ($("ud-caption")) $("ud-caption").value = "";
      if ($("ud-shot")) $("ud-shot").value = "";
      if ($("ud-pos")) $("ud-pos").value = "";
      if ($("ud-neg")) $("ud-neg").value = "";
      if ($("ud-denoise")) $("ud-denoise").value = "0.55";
      if ($("ud-art")) $("ud-art").innerHTML = `<span class="mini">尚無場景</span>`;
      updateRefFlag();
      return;
    }
    if ($("ud-name")) $("ud-name").value = p.name || "";
    if ($("ud-caption")) $("ud-caption").value = p.caption || "";
    if ($("ud-shot")) $("ud-shot").value = p.shot || "";
    if ($("ud-pos")) $("ud-pos").value = p.prompt || "";
    if ($("ud-neg")) $("ud-neg").value = p.negative || "";
    if ($("ud-denoise")) $("ud-denoise").value = String(p.poseDenoise ?? 0.55);
    if ($("ud-art")) {
      $("ud-art").innerHTML = p.url
        ? `<img src="${esc(p.url)}" alt="undress">`
        : `<span class="mini">尚未產生</span>`;
    }
    updateRefFlag();
  };

  const collectForm = () => {
    const p = activePack();
    if (!p) return;
    p.name = String($("ud-name")?.value || p.name || "脫衣場景").slice(0, 40);
    p.caption = String($("ud-caption")?.value || "").slice(0, 80);
    p.shot = normalizeUndressShot($("ud-shot")?.value, p.shot);
    if ($("ud-shot")) $("ud-shot").value = p.shot;
    p.prompt = $("ud-pos")?.value || "";
    p.negative = $("ud-neg")?.value || "";
    p.poseDenoise = clampDenoise($("ud-denoise")?.value);
    p.updated = Date.now();
    doc.activeId = p.id;
    activeId = p.id;
  };

  const load = async () => {
    setStatus("讀取中…");
    try {
      doc = await loadUndressDoc();
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(doc.packs.length ? `已載入 ${doc.packs.length} 個場景` : "尚無場景，按「新增」開始");
    } catch (e) {
      setStatus("讀取失敗：" + e.message, true);
    }
  };

  const loadGirls = async () => {
    try {
      const r = await fetch("/api/save", { cache: "no-store" });
      const j = await r.json();
      girls = (j?.data?.succubi || []).filter((g) => g && g.id && !g.taken);
      renderGirls();
    } catch {
      girls = [];
      renderGirls();
    }
  };

  const closeSibling = () => {
    const ids = [
      ["butt-pack-editor", "btn-butt-packs"],
      ["waist-pack-editor", "btn-waist-packs"],
      ["breast-pack-editor", "btn-breast-packs"],
      ["knead-pack-editor", "btn-knead-packs"],
      ["suck-pack-editor", "btn-suck-packs"],
      ["lick-pack-editor", "btn-lick-packs"],
      ["labia-pack-editor", "btn-labia-packs"],
      ["labia-rub-pack-editor", "btn-labia-rub-packs"],
      ["finger-pack-editor", "btn-finger-packs"],
      ["standee-pack-editor", "btn-standee-packs"],
    ];
    for (const [panelId, btnId] of ids) {
      const el = $(panelId);
      const btn = $(btnId);
      if (el && !el.hidden) el.hidden = true;
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  };

  const open = async () => {
    closeSibling();
    panel.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
    await Promise.all([load(), loadGirls()]);
  };

  const close = () => {
    collectForm();
    panel.hidden = true;
    openBtn.setAttribute("aria-expanded", "false");
  };

  openBtn.addEventListener("click", () => {
    if (panel.hidden) void open();
    else close();
  });

  $("ud-close")?.addEventListener("click", () => close());

  $("ud-pack")?.addEventListener("change", () => {
    collectForm();
    activeId = $("ud-pack").value;
    doc.activeId = activeId;
    renderForm();
  });

  $("ud-girl")?.addEventListener("change", () => {
    girlId = $("ud-girl").value;
  });

  $("ud-new")?.addEventListener("click", () => {
    collectForm();
    const p = emptyUndressPack("脫衣 " + (doc.packs.length + 1));
    doc.packs.push(p);
    activeId = p.id;
    doc.activeId = p.id;
    renderPacks();
    renderForm();
    setStatus("已新增（記得按儲存）。按下脫衣場面後會多這一景。");
  });

  $("ud-del")?.addEventListener("click", () => {
    if (!doc.packs.length) return;
    if (!confirm(doc.packs.length <= 1 ? "刪掉最後一景？玩家就沒有脫衣場景可選。" : "刪除這一景？")) return;
    collectForm();
    doc.packs = doc.packs.filter((p) => p.id !== activeId);
    activeId = doc.packs[0]?.id || "";
    doc.activeId = activeId;
    renderPacks();
    renderForm();
    setStatus("已刪除（記得按儲存）");
  });

  $("ud-save")?.addEventListener("click", async () => {
    collectForm();
    try {
      doc = await saveUndressDoc(doc);
      invalidateUndressCache();
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(`✓ 已寫入 undress_packs.json（${doc.packs.length} 個場景）`);
    } catch (e) {
      setStatus("儲存失敗：" + e.message, true);
    }
  });

  $("ud-inject")?.addEventListener("click", () => {
    const g = currentGirl();
    const p = activePack();
    if (!p) {
      setStatus("先新增一景", true);
      return;
    }
    const preset = presetByShot(p.shot);
    const posEl = $("ud-pos");
    const negEl = $("ud-neg");
    const capEl = $("ud-caption");
    if (posEl) posEl.value = defaultUndressPrompt(p.shot);
    if (negEl) negEl.value = defaultUndressNegative(p.shot);
    if (capEl && !String(capEl.value || "").trim() && preset) capEl.value = preset.caption;
    collectForm();
    const worn = g ? wornOutfit(g) : "";
    const ck = g ? girlOwnCkpt(g) : "";
    const bits = [
      g ? (g.name || g.id) : "尚未選魅子",
      ck ? `模型 ${shortCkptName(ck)}` : "模型（尚未綁定）",
      worn ? `服裝 ${String(worn).slice(0, 28)}` : "",
    ].filter(Boolean);
    setStatus((preset ? "✓ 已填這一景的預設。" : "✓ 這景沒有專用預設，已填虛脫坐下。") + "執行時會帶入：" + bits.join(" · "));
  });

  $("ud-ref-up")?.addEventListener("click", () => $("ud-ref-file")?.click());
  $("ud-ref-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const p = activePack();
    if (!file || !p) return;
    setStatus("上傳參考圖…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || j.error || r.status);
      p.ref = String(j.url || "").trim();
      updateRefFlag();
      setStatus("✓ 已掛參考圖");
    } catch (err) {
      setStatus("上傳失敗：" + err.message, true);
    }
  });

  $("ud-ref-clear")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    p.ref = "";
    updateRefFlag();
    setStatus("已拿掉參考圖");
  });

  $("ud-ref-apply")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    const url = String($("ud-ref-url")?.value || "").trim();
    if (!url) {
      setStatus("先貼 URL", true);
      return;
    }
    p.ref = url;
    updateRefFlag();
    setStatus("✓ 已套用 URL");
  });

  $("ud-gen")?.addEventListener("click", async () => {
    collectForm();
    const p = activePack();
    const g = currentGirl();
    if (!p) {
      setStatus("先新增一景", true);
      return;
    }
    if (!g) {
      setStatus("先選魅子或抽一隻進房", true);
      return;
    }
    const btn = $("ud-gen");
    if (btn) btn.disabled = true;
    if ($("ud-art")) $("ud-art").innerHTML = `<span class="mini">生成中…</span>`;
    setStatus("排隊中…");
    try {
      const eng = (await hooks.getEngine?.()) || { imgProvider: "comfy", imgStyle: "pixel" };
      const r = await generateUndressPackImage(p, g, eng, {
        onTick: (sec) => setStatus(`生成中… ${sec}s`),
      });
      if (r.status === "done" && r.result) {
        const url = String(r.result);
        p.url = url;
        if ($("ud-art")) {
          $("ud-art").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
        }
        setStatus("✓ 測試生圖完成（記得按儲存）");
      } else {
        throw new Error(r.error || "生圖失敗");
      }
    } catch (e) {
      if ($("ud-art")) $("ud-art").innerHTML = `<span class="mini">失敗</span>`;
      setStatus(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  panel.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
}
