/** 房間半身立繪表情組：9 固定槽（性奮 4 + 失神路徑 5），單一 JSON／單一「立繪」編輯面板。 */

const API = "/api/standee-packs";

/** 9 槽（排除無性奮＝預設半身）。 */
export const STANDEE_SLOTS = [
  { id: "slight", label: "微微性奮", group: "arousal" },
  { id: "aroused", label: "性奮", group: "arousal" },
  { id: "wantFill", label: "想被填滿", group: "arousal" },
  { id: "climax", label: "高潮接受中", group: "arousal" },
  { id: "interfere", label: "干擾", group: "stun" },
  { id: "blank", label: "空白", group: "stun" },
  { id: "beg", label: "求饒", group: "stun" },
  { id: "stun", label: "失神", group: "stun" },
  { id: "spasm", label: "痙攣", group: "stun" },
];

const SLOT_IDS = new Set(STANDEE_SLOTS.map((s) => s.id));

export function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 半身立繪表情 tags（含臉／頭；非動作裁切無頭）。 */
export function defaultStandeePrompt(slotId) {
  const base = [
    "half-body portrait, looking at viewer",
    "plain solid color background, simple background",
  ];
  const expr = {
    slight: "light blush, slightly aroused expression, soft eyes, subtle parted lips",
    aroused: "flushed cheeks, aroused expression, heavy eyelids, breathing open mouth",
    wantFill: "needy expression, pleading eyes, parted lips, flushed face, yearning look",
    climax: "climax face, rolling eyes, open mouth, intense blush, ecstasy expression",
    interfere: "distracted expression, flustered, interrupted mid-speech, uneasy eyes",
    blank: "vacant eyes, blank expression, dazed, empty stare, soft open mouth",
    beg: "pleading expression, teary eyes, begging look, desperate face",
    stun: "ahegao, fucked-silly expression, lost eyes, tongue out slightly, mind blank face",
    spasm: "orgasm spasm face, trembling, teary eyes, gasping, convulsing expression",
  };
  const bit = expr[slotId] || "expressive face";
  return [...base, bit].join(", ");
}

export function defaultStandeeNegative() {
  return [
    "text, watermark, logo, signature",
    "ugly, deformed, extra limbs, extra fingers, bad anatomy",
    "lowres, blurry, cropped head badly",
  ].join(", ");
}

export function emptyStandeeSlot(slotId) {
  const meta = STANDEE_SLOTS.find((s) => s.id === slotId) || { id: slotId, label: slotId };
  return {
    id: meta.id,
    label: meta.label,
    poseDenoise: 0.55,
    prompt: "",
    negative: "",
    ref: "",
    url: "",
    updated: 0,
  };
}

export function normalizeStandeeSlot(raw, slotId) {
  const base = emptyStandeeSlot(slotId);
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    id: base.id,
    label: base.label,
    poseDenoise: clampDenoise(s.poseDenoise ?? s.pose_denoise ?? base.poseDenoise),
    prompt: String(s.prompt ?? ""),
    negative: String(s.negative ?? ""),
    ref: String(s.ref ?? "").trim(),
    url: String(s.url ?? "").trim(),
    updated: Number(s.updated) || 0,
  };
}

export function normalizeStandeeDoc(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const incoming = src.slots && typeof src.slots === "object" ? src.slots : {};
  const slots = {};
  for (const meta of STANDEE_SLOTS) {
    slots[meta.id] = normalizeStandeeSlot(incoming[meta.id], meta.id);
  }
  return { slots };
}

/** 有填正向 tags 才算「存在」、進預產。 */
export function listFilledStandeeSlots(doc) {
  const d = normalizeStandeeDoc(doc);
  return STANDEE_SLOTS
    .map((m) => d.slots[m.id])
    .filter((s) => s && String(s.prompt || "").trim());
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

function halfRating(g) {
  const stage = String(g?.stage || "stranger");
  if (stage.includes("wife") || stage === "girlfriend" || stage === "lover" || stage === "passionate") {
    return "nsfw";
  }
  return "sfw";
}

/**
 * 半身表情立繪下單。pack.prompt = 表情／構圖 tags；執行時 character+outfit+girl ckpt。
 * framing half、cutout，保留臉／頭。
 */
export function buildStandeeImgBody(slot, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const worn = opts.worn != null ? opts.worn : wornOutfit(girl);
  const p = normalizeStandeeSlot(slot, slot?.id || opts.slotId || "slight");
  const action = String(p.prompt || "").trim() || defaultStandeePrompt(p.id);
  const userNeg = String(p.negative || "").trim() || defaultStandeeNegative();
  const ref = String(p.ref || "").trim();
  const denoise = clampDenoise(p.poseDenoise);
  const ckpt = comfy ? resolveComfyCkpt(girl, eng) : "";
  return {
    key: `room-standee:${p.id}:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: "half",
    rating: halfRating(girl),
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: worn,
    prompt: "",
    extra: action,
    negative: userNeg,
    visual_neg: userNeg,
    cutout: true,
    flat_bg: true,
    lock_identity: true,
    retry: true,
    scene_kind: "portrait",
    shot: `standee_${p.id}`,
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: denoise } : {}),
    ...(comfy ? {
      comfy_url: eng.comfyUrl || "",
      ckpt,
    } : {}),
  };
}

const LOAD_HINT = "讀不到立繪圖組（/api/standee-packs）。請 pull 最新 grok-telephon 並重啟 uvicorn";
const SAVE_HINT = "伺服器未重啟，無法儲存立繪圖組（PUT /api/standee-packs）。請 pull 最新並重啟 uvicorn";

export async function loadStandeeDoc() {
  let r;
  try {
    r = await fetch(API + "?ts=" + Date.now(), { cache: "no-store" });
  } catch {
    return loadStandeeDocStatic();
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return normalizeStandeeDoc(j);
  if (r.status !== 404) {
    throw new Error(formatApiError("GET", API, j.detail || j.error || r.status));
  }
  return loadStandeeDocStatic();
}

async function loadStandeeDocStatic() {
  try {
    const r = await fetch("/content/standee_packs.json?ts=" + Date.now(), { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(formatApiError("GET", "/content/standee_packs.json", j.detail || j.error || r.status));
    return normalizeStandeeDoc(j);
  } catch {
    throw new Error(LOAD_HINT);
  }
}

export async function saveStandeeDoc(doc) {
  const body = normalizeStandeeDoc(doc);
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

export async function getStandeePacksCached(force = false) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < 15000) return _cache;
  try {
    _cache = await loadStandeeDoc();
    _cacheAt = now;
  } catch {
    if (!_cache) _cache = normalizeStandeeDoc({});
  }
  return _cache;
}

export function invalidateStandeeCache() {
  _cache = null;
  _cacheAt = 0;
}

export async function generateStandeePackImage(slot, girl, eng, opts = {}) {
  const body = buildStandeeImgBody(slot, girl, eng, opts);
  const r = await waitImg(body, opts.onTick);
  return {
    status: r.status,
    result: r.result,
    error: r.error,
    body,
    key: r.key,
  };
}

/** 依 slot id 取 per-girl 預產立繪 URL。 */
export function standeeUrlFor(who, slotId) {
  if (!who || !slotId || !SLOT_IDS.has(slotId)) return "";
  return String(who?.portraits?.standee?.[slotId] || "").trim();
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

function slotEl(id, part) {
  return $(`sd-${id}-${part}`);
}

/**
 * 掛載「立繪」面板：一顆按鈕 → 9 槽垂直堆疊。
 * @param {{ getGirl: () => object|null, getEngine: () => Promise<object> }} hooks
 */
export function mountStandeePackEditor(hooks = {}) {
  const openBtn = $("btn-standee-packs");
  const panel = $("standee-pack-editor");
  if (!openBtn || !panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";

  let doc = normalizeStandeeDoc({});
  let girls = [];
  let girlId = "";

  const setStatus = (msg, err = false) => {
    const el = $("sd-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!err);
  };

  const currentGirl = () => {
    const live = hooks.getGirl?.();
    if (live?.id && live.id === girlId) return live;
    return girls.find((g) => g.id === girlId) || live || girls[0] || null;
  };

  const renderGirls = () => {
    const sel = $("sd-girl");
    if (!sel) return;
    const live = hooks.getGirl?.();
    if (live?.id && !girls.some((g) => g.id === live.id)) {
      girls = [live, ...girls];
    }
    if (!girls.some((g) => g.id === girlId)) girlId = live?.id || girls[0]?.id || "";
    sel.innerHTML = girls.length
      ? girls.map((g) =>
        `<option value="${esc(g.id)}"${g.id === girlId ? " selected" : ""}>${esc(g.name || g.id)}</option>`).join("")
      : `<option value="">（無可用魅子）</option>`;
  };

  const updateRefFlag = (slotId) => {
    const p = doc.slots[slotId];
    const ref = p?.ref || "";
    const flag = slotEl(slotId, "mode");
    const refFlag = slotEl(slotId, "ref-flag");
    const thumb = slotEl(slotId, "ref-thumb");
    if (flag) {
      flag.textContent = ref ? "圖生圖（pose_ref）" : "文生圖";
      flag.className = "sd-mode-flag " + (ref ? "img" : "txt");
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

  const renderSlot = (slotId) => {
    const p = doc.slots[slotId];
    if (!p) return;
    const pos = slotEl(slotId, "pos");
    const neg = slotEl(slotId, "neg");
    const den = slotEl(slotId, "denoise");
    const art = slotEl(slotId, "art");
    if (pos) pos.value = p.prompt || "";
    if (neg) neg.value = p.negative || "";
    if (den) den.value = String(p.poseDenoise ?? 0.55);
    if (art) {
      art.innerHTML = p.url
        ? `<img src="${esc(p.url)}" alt="${esc(p.label)}">`
        : `<span class="mini">尚未產生</span>`;
    }
    updateRefFlag(slotId);
  };

  const collectSlot = (slotId) => {
    const p = doc.slots[slotId];
    if (!p) return;
    p.prompt = slotEl(slotId, "pos")?.value || "";
    p.negative = slotEl(slotId, "neg")?.value || "";
    p.poseDenoise = clampDenoise(slotEl(slotId, "denoise")?.value);
    p.updated = Date.now();
  };

  const collectAll = () => {
    for (const m of STANDEE_SLOTS) collectSlot(m.id);
  };

  const buildSlotsDom = () => {
    const host = $("sd-slots");
    if (!host || host.dataset.built) return;
    host.dataset.built = "1";
    host.innerHTML = STANDEE_SLOTS.map((m) => `
      <section class="sd-block" data-slot="${esc(m.id)}" aria-label="${esc(m.label)}">
        <div class="sd-block-head">
          <strong>${esc(m.label)}</strong>
          <span class="mini">${m.group === "arousal" ? "性奮階段立繪" : "失神路徑立繪"} · ${esc(m.id)}</span>
        </div>
        <div class="sd-row">
          <button type="button" class="sd-cy" data-act="inject" data-slot="${esc(m.id)}">填入表情預設</button>
          <span class="sd-form0"><label>pose_denoise</label>
            <input id="sd-${esc(m.id)}-denoise" type="number" min="0.35" max="0.9" step="0.05" value="0.55"></span>
        </div>
        <label>正向（英文 tags・半身含臉）</label>
        <textarea id="sd-${esc(m.id)}-pos" rows="3" placeholder="half-body portrait, expression…"></textarea>
        <label>負向 negative</label>
        <textarea id="sd-${esc(m.id)}-neg" rows="2" placeholder="text, watermark, ugly…"></textarea>
        <div class="sd-ref-head">參考圖（圖生圖）
          <span class="sd-mode-flag txt" id="sd-${esc(m.id)}-mode">文生圖</span>
        </div>
        <div class="sd-row">
          <input id="sd-${esc(m.id)}-ref-file" type="file" accept="image/*" hidden>
          <button type="button" data-act="ref-up" data-slot="${esc(m.id)}">上傳參考圖</button>
          <button type="button" class="sd-del" data-act="ref-clear" data-slot="${esc(m.id)}">拿掉</button>
        </div>
        <div class="sd-row">
          <span class="sd-grow"><input id="sd-${esc(m.id)}-ref-url" type="text" placeholder="/assets/pose_refs/…"></span>
          <button type="button" data-act="ref-apply" data-slot="${esc(m.id)}">套用 URL</button>
        </div>
        <div class="mini" id="sd-${esc(m.id)}-ref-flag">沒有參考圖 → 文生圖</div>
        <img class="sd-thumb" id="sd-${esc(m.id)}-ref-thumb" alt="" hidden>
        <div class="sd-row" style="margin-top:.5em">
          <button type="button" class="sd-cy sd-big" data-act="gen" data-slot="${esc(m.id)}">✦ 測試生圖</button>
        </div>
        <div class="sd-art" id="sd-${esc(m.id)}-art"><span class="mini">尚未產生</span></div>
      </section>
    `).join("");
  };

  const load = async () => {
    setStatus("讀取中…");
    try {
      doc = await loadStandeeDoc();
      for (const m of STANDEE_SLOTS) renderSlot(m.id);
      const filled = listFilledStandeeSlots(doc).length;
      setStatus(filled ? `已載入 ${filled}/9 槽有內容` : "9 槽皆空，按各槽「填入表情預設」後儲存");
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
    for (const id of [
      "butt-pack-editor", "waist-pack-editor", "breast-pack-editor", "knead-pack-editor",
      "suck-pack-editor", "lick-pack-editor", "labia-pack-editor", "labia-rub-pack-editor",
      "finger-pack-editor", "undress-pack-editor",
    ]) {
      const el = $(id);
      if (el && !el.hidden) el.hidden = true;
    }
    for (const id of [
      "btn-butt-packs", "btn-waist-packs", "btn-breast-packs", "btn-knead-packs",
      "btn-suck-packs", "btn-lick-packs", "btn-labia-packs", "btn-labia-rub-packs",
      "btn-finger-packs", "btn-undress-packs",
    ]) {
      const btn = $(id);
      if (btn) btn.setAttribute("aria-expanded", "false");
    }
  };

  const open = async () => {
    closeSibling();
    buildSlotsDom();
    panel.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
    await Promise.all([load(), loadGirls()]);
  };

  const close = () => {
    collectAll();
    panel.hidden = true;
    openBtn.setAttribute("aria-expanded", "false");
  };

  openBtn.addEventListener("click", () => {
    if (panel.hidden) void open();
    else close();
  });

  $("sd-close")?.addEventListener("click", () => close());

  $("sd-girl")?.addEventListener("change", () => {
    girlId = $("sd-girl").value;
  });

  $("sd-save")?.addEventListener("click", async () => {
    collectAll();
    try {
      doc = await saveStandeeDoc(doc);
      invalidateStandeeCache();
      for (const m of STANDEE_SLOTS) renderSlot(m.id);
      const filled = listFilledStandeeSlots(doc).length;
      setStatus(`✓ 已寫入 standee_packs.json（${filled}/9 槽有內容）`);
    } catch (e) {
      setStatus("儲存失敗：" + e.message, true);
    }
  });

  panel.addEventListener("click", async (ev) => {
    const btn = ev.target?.closest?.("[data-act][data-slot]");
    if (!btn || !panel.contains(btn)) return;
    const act = btn.getAttribute("data-act");
    const slotId = btn.getAttribute("data-slot");
    if (!SLOT_IDS.has(slotId)) return;

    if (act === "inject") {
      const g = currentGirl();
      const posEl = slotEl(slotId, "pos");
      const negEl = slotEl(slotId, "neg");
      if (posEl) posEl.value = defaultStandeePrompt(slotId);
      if (negEl && !String(negEl.value || "").trim()) negEl.value = defaultStandeeNegative();
      collectSlot(slotId);
      const ck = g ? girlOwnCkpt(g) : "";
      const bits = [
        g ? (g.name || g.id) : "（未選魅子）",
        ck ? `模型 ${shortCkptName(ck)}` : "模型（尚未綁定）",
      ];
      setStatus(`✓ 已填「${doc.slots[slotId].label}」表情預設（含臉）。執行時帶入：${bits.join(" · ")}`);
      return;
    }

    if (act === "ref-up") {
      slotEl(slotId, "ref-file")?.click();
      return;
    }

    if (act === "ref-clear") {
      const p = doc.slots[slotId];
      if (!p) return;
      p.ref = "";
      updateRefFlag(slotId);
      setStatus(`已拿掉「${p.label}」參考圖`);
      return;
    }

    if (act === "ref-apply") {
      const p = doc.slots[slotId];
      if (!p) return;
      const url = String(slotEl(slotId, "ref-url")?.value || "").trim();
      if (!url) {
        setStatus("先貼 URL", true);
        return;
      }
      p.ref = url;
      updateRefFlag(slotId);
      setStatus(`✓ 已套用「${p.label}」參考圖 URL`);
      return;
    }

    if (act === "gen") {
      collectSlot(slotId);
      const p = doc.slots[slotId];
      const g = currentGirl();
      if (!p) return;
      if (!String(p.prompt || "").trim()) {
        setStatus(`「${p.label}」先填入表情預設或自行寫正向 tags`, true);
        return;
      }
      if (!g) {
        setStatus("先選魅子或抽一隻進房", true);
        return;
      }
      btn.disabled = true;
      const art = slotEl(slotId, "art");
      if (art) art.innerHTML = `<span class="mini">生成中…</span>`;
      setStatus(`「${p.label}」排隊中…`);
      try {
        const eng = (await hooks.getEngine?.()) || { imgProvider: "comfy", imgStyle: "pixel" };
        const r = await generateStandeePackImage(p, g, eng, {
          onTick: (sec) => setStatus(`「${p.label}」生成中… ${sec}s`),
        });
        if (r.status === "done" && r.result) {
          const url = String(r.result);
          p.url = url;
          if (art) {
            art.innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
          }
          setStatus(`✓ 「${p.label}」測試生圖完成（記得按儲存全部）`);
        } else {
          throw new Error(r.error || "生圖失敗");
        }
      } catch (e) {
        if (art) art.innerHTML = `<span class="mini">失敗</span>`;
        setStatus(e.message, true);
      } finally {
        btn.disabled = false;
      }
    }
  });

  panel.addEventListener("change", async (ev) => {
    const input = ev.target;
    if (!input || input.type !== "file") return;
    const m = String(input.id || "").match(/^sd-(.+)-ref-file$/);
    if (!m) return;
    const slotId = m[1];
    if (!SLOT_IDS.has(slotId)) return;
    const file = input.files?.[0];
    input.value = "";
    const p = doc.slots[slotId];
    if (!file || !p) return;
    setStatus(`「${p.label}」上傳參考圖…`);
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || j.error || r.status);
      p.ref = String(j.url || "").trim();
      updateRefFlag(slotId);
      setStatus(`✓ 「${p.label}」已掛參考圖`);
    } catch (err) {
      setStatus("上傳失敗：" + err.message, true);
    }
  });

  panel.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
}
