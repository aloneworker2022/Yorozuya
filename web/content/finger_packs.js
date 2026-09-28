/** 房間「手指插入」生圖預設組：多組命名存檔，執行時隨機抽一組；無組時不生圖（僅對話／身體）。 */

import { composeTeaseExtra, teaseFraming } from "./tease_shots.js?v=5";

const API = "/api/finger-packs";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 動作／裁切 tags only（無頭／表情／人設；人設於生圖時由 character 合併）。 */
export function defaultFingerPrompt(stage = "stranger") {
  return composeTeaseExtra("tease_finger_in", stage, "") || [
    "simple background, white background",
    "lower body, vaginal insertion focus, head out of frame",
    "first-person POV, finger(s) inside vagina, fingering",
    "NO face of girl, NO head of girl"
  ].join(", ");
}

/** 局部繪圖負向：排除頭／臉／表情與常見瑕疵。 */
export function defaultFingerNegative() {
  return [
    "head, face, hair, eyes, smile, looking at viewer, portrait",
    "text, watermark, ugly, extra fingers",
  ].join(", ");
}

export function emptyFingerPack(name = "手指插入圖組") {
  return {
    id: uid(),
    name: String(name || "手指插入圖組").slice(0, 40),
    poseDenoise: 0.55,
    prompt: defaultFingerPrompt(),
    negative: defaultFingerNegative(),
    ref: "",
    url: "",
    updated: Date.now(),
  };
}

export function normalizeFingerPack(raw) {
  const base = emptyFingerPack();
  const s = raw && typeof raw === "object" ? raw : {};
  const slot = s.slot && typeof s.slot === "object" ? s.slot : null;
  return {
    id: String(s.id || base.id).slice(0, 24) || base.id,
    name: String(s.name || base.name).slice(0, 40) || base.name,
    poseDenoise: clampDenoise(s.poseDenoise ?? s.pose_denoise ?? base.poseDenoise),
    prompt: String(s.prompt ?? slot?.prompt ?? base.prompt),
    negative: String(s.negative ?? slot?.negative ?? base.negative),
    ref: String(s.ref ?? slot?.ref ?? "").trim(),
    url: String(s.url ?? slot?.url ?? "").trim(),
    updated: Number(s.updated) || Date.now(),
  };
}

export function normalizeFingerDoc(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const packs = (Array.isArray(src.packs) ? src.packs : []).map(normalizeFingerPack).filter((p) => p.id);
  let activeId = String(src.activeId || "");
  if (packs.length && !packs.some((p) => p.id === activeId)) activeId = packs[0].id;
  if (!packs.length) activeId = "";
  return { packs, activeId };
}

export function pickRandomFingerPack(packs) {
  const list = (Array.isArray(packs) ? packs : []).map(normalizeFingerPack).filter((p) => p.id);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

export function joinPromptParts(...parts) {
  const seen = new Set();
  const out = [];
  for (const part of parts) {
    for (const bit of String(part || "").split(",")) {
      const s = bit.trim();
      if (!s) continue;
      const key = s.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(s);
    }
  }
  return out.join(", ");
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

/** Comfy：優先妹子自帶模型，沒有才退全局；皆無則丟錯。 */
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

export async function fetchFingerBasePrompt(girl, eng = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const body = {
    key: `finger-base:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: comfy ? (eng.imgModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
    framing: teaseFraming("tease_finger_in"),
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: wornOutfit(girl),
    extra: "",
    negative: "",
    prompt: "",
    cutout: false,
    lock_identity: true,
    scene_kind: "tease",
    shot: "tease_finger_in",
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: resolveComfyCkpt(girl, eng) } : {}),
  };
  const r = await fetch("/api/imggen/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || r.status);
  const tr = j.trace || {};
  return {
    positive: String(tr.comfy_prompt || "").trim(),
    negative: String(tr.comfy_negative || "").trim(),
    grokPrompt: String(tr.grok_prompt || "").trim(),
    provider: tr.provider || body.provider,
  };
}

/**
 * 組手指插入生圖下單。有 pack → 用組內「動作」prompt／ref／denoise；
 * pack 為 null 時呼叫端應略過生圖（無硬編碼退回）。
 * 契約：pack.prompt = 動作／裁切 only；執行時 character+outfit+extra(action)+girl ckpt。
 */
export function buildFingerImgBody(pack, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const stage = String(opts.stage || girl.stage || "stranger");
  const worn = opts.worn != null ? opts.worn : wornOutfit(girl);
  const p = pack ? normalizeFingerPack(pack) : null;
  const action = p
    ? String(p.prompt || "").trim()
    : composeTeaseExtra("tease_finger_in", stage, worn);
  const userNeg = p ? String(p.negative || "").trim() : defaultFingerNegative();
  const ref = p ? String(p.ref || "").trim() : "";
  const denoise = p ? clampDenoise(p.poseDenoise) : 0.55;
  const ckpt = comfy ? resolveComfyCkpt(girl, eng) : "";
  return {
    key: `room-finger:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: teaseFraming("tease_finger_in"),
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: worn,
    // prompt 留空 → 伺服器以 lower-crop 人設 sheet + extra(動作) 合併
    prompt: "",
    extra: action,
    negative: userNeg,
    visual_neg: userNeg,
    cutout: false,
    flat_bg: true,
    lock_identity: true,
    retry: true,
    scene_kind: "tease",
    shot: "tease_finger_in",
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: denoise } : {}),
    ...(comfy ? {
      comfy_url: eng.comfyUrl || "",
      ckpt,
    } : {}),
  };
}

const FINGER_LOAD_HINT = "讀不到手指插入圖組（/api/finger-packs）。請 pull 最新 grok-telephon 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）";
const FINGER_SAVE_HINT = "伺服器未重啟，無法儲存手指插入圖組（PUT /api/finger-packs）。請 pull 最新 grok-telephon 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）";

export async function loadFingerDoc() {
  let r;
  try {
    r = await fetch(API + "?ts=" + Date.now(), { cache: "no-store" });
  } catch {
    return loadFingerDocStatic();
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return normalizeFingerDoc(j);
  if (r.status !== 404) {
    throw new Error(formatApiError("GET", API, j.detail || j.error || r.status));
  }
  return loadFingerDocStatic();
}

async function loadFingerDocStatic() {
  try {
    const r = await fetch("/content/finger_packs.json?ts=" + Date.now(), { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(formatApiError("GET", "/content/finger_packs.json", j.detail || j.error || r.status));
    return normalizeFingerDoc(j);
  } catch {
    throw new Error(FINGER_LOAD_HINT);
  }
}

export async function saveFingerDoc(doc) {
  const body = normalizeFingerDoc(doc);
  const r = await fetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) throw new Error(FINGER_SAVE_HINT);
    throw new Error(formatApiError("PUT", API, j.detail || j.error || r.status));
  }
  return body;
}

/** 執行時快取（房間／主遊戲共用）。 */
let _cache = null;
let _cacheAt = 0;

export async function getFingerPacksCached(force = false) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < 15000) return _cache;
  try {
    _cache = await loadFingerDoc();
    _cacheAt = now;
  } catch {
    if (!_cache) _cache = { packs: [], activeId: "" };
  }
  return _cache;
}

export function invalidateFingerCache() {
  _cache = null;
  _cacheAt = 0;
}

/** 隨機一組；無組回 null（呼叫端走硬編碼）。 */
export async function pickRuntimeFingerPack() {
  const doc = await getFingerPacksCached();
  return pickRandomFingerPack(doc.packs);
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
 * 手指插入生圖（編輯器／預產／執行時共用）。
 * comfy 時 buildFingerImgBody → resolveComfyCkpt 會丟「尚未綁定」；
 * 不寫入 pack.url（呼叫端決定）。回傳 { status, result, error, body, … }。
 */
export async function generateFingerPackImage(pack, girl, eng, opts = {}) {
  const body = buildFingerImgBody(pack, girl, eng, opts);
  const r = await waitImg(body, opts.onTick);
  return {
    status: r.status,
    result: r.result,
    error: r.error,
    body,
    key: r.key,
  };
}

/**
 * 掛載房間編輯器內的「手指插入圖」面板。
 * @param {{ getGirl: () => object|null, getEngine: () => Promise<object> }} hooks
 */
export function mountFingerPackEditor(hooks = {}) {
  const openBtn = $("btn-finger-packs");
  const panel = $("finger-pack-editor");
  if (!openBtn || !panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";

  let doc = { packs: [], activeId: "" };
  let activeId = "";
  let girls = [];
  let girlId = "";

  const setStatus = (msg, err = false) => {
    const el = $("fg-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!err);
  };

  const activePack = () => doc.packs.find((p) => p.id === activeId) || doc.packs[0] || null;

  const renderPacks = () => {
    const sel = $("fg-pack");
    if (!sel) return;
    if (!doc.packs.some((p) => p.id === activeId) && doc.packs[0]) activeId = doc.packs[0].id;
    sel.innerHTML = doc.packs.length
      ? doc.packs.map((p) =>
        `<option value="${esc(p.id)}"${p.id === activeId ? " selected" : ""}>${esc(p.name)}</option>`).join("")
      : `<option value="">（尚無圖組）</option>`;
  };

  const renderGirls = () => {
    const sel = $("fg-girl");
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

  const currentGirl = () => {
    const live = hooks.getGirl?.();
    if (live?.id && live.id === girlId) return live;
    return girls.find((g) => g.id === girlId) || live || girls[0] || null;
  };

  const renderForm = () => {
    const p = activePack();
    if (!p) {
      if ($("fg-name")) $("fg-name").value = "";
      if ($("fg-pos")) $("fg-pos").value = "";
      if ($("fg-neg")) $("fg-neg").value = "";
      if ($("fg-denoise")) $("fg-denoise").value = "0.55";
      if ($("fg-ref-flag")) $("fg-ref-flag").textContent = "沒有參考圖 → 文生圖";
      if ($("fg-art")) $("fg-art").innerHTML = `<span class="mini">尚無圖組</span>`;
      updateRefFlag();
      return;
    }
    if ($("fg-name")) $("fg-name").value = p.name || "";
    if ($("fg-pos")) $("fg-pos").value = p.prompt || "";
    if ($("fg-neg")) $("fg-neg").value = p.negative || "";
    if ($("fg-denoise")) $("fg-denoise").value = String(p.poseDenoise ?? 0.55);
    if ($("fg-art")) {
      $("fg-art").innerHTML = p.url
        ? `<img src="${esc(p.url)}" alt="finger">`
        : `<span class="mini">尚未產生</span>`;
    }
    updateRefFlag();
  };

  const updateRefFlag = () => {
    const p = activePack();
    const ref = p?.ref || "";
    const flag = $("fg-mode-flag");
    const refFlag = $("fg-ref-flag");
    const thumb = $("fg-ref-thumb");
    if (flag) {
      flag.textContent = ref ? "圖生圖（pose_ref）" : "文生圖";
      flag.className = "fg-mode-flag " + (ref ? "img" : "txt");
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

  const collectForm = () => {
    const p = activePack();
    if (!p) return;
    p.name = String($("fg-name")?.value || p.name || "手指插入圖組").slice(0, 40);
    p.prompt = $("fg-pos")?.value || "";
    p.negative = $("fg-neg")?.value || "";
    p.poseDenoise = clampDenoise($("fg-denoise")?.value);
    p.updated = Date.now();
    doc.activeId = p.id;
    activeId = p.id;
  };

  const load = async () => {
    setStatus("讀取中…");
    try {
      doc = await loadFingerDoc();
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(doc.packs.length ? `已載入 ${doc.packs.length} 組` : "尚無圖組，按「新增」開始");
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
    const el0 = $("butt-pack-editor");
    const btn0 = $("btn-butt-packs");
    if (el0 && !el0.hidden) el0.hidden = true;
    if (btn0) btn0.setAttribute("aria-expanded", "false");
    const el1 = $("waist-pack-editor");
    const btn1 = $("btn-waist-packs");
    if (el1 && !el1.hidden) el1.hidden = true;
    if (btn1) btn1.setAttribute("aria-expanded", "false");
    const el2 = $("breast-pack-editor");
    const btn2 = $("btn-breast-packs");
    if (el2 && !el2.hidden) el2.hidden = true;
    if (btn2) btn2.setAttribute("aria-expanded", "false");
    const el3 = $("knead-pack-editor");
    const btn3 = $("btn-knead-packs");
    if (el3 && !el3.hidden) el3.hidden = true;
    if (btn3) btn3.setAttribute("aria-expanded", "false");
    const el4 = $("suck-pack-editor");
    const btn4 = $("btn-suck-packs");
    if (el4 && !el4.hidden) el4.hidden = true;
    if (btn4) btn4.setAttribute("aria-expanded", "false");
    const el5 = $("lick-pack-editor");
    const btn5 = $("btn-lick-packs");
    if (el5 && !el5.hidden) el5.hidden = true;
    if (btn5) btn5.setAttribute("aria-expanded", "false");
    const el6 = $("labia-pack-editor");
    const btn6 = $("btn-labia-packs");
    if (el6 && !el6.hidden) el6.hidden = true;
    if (btn6) btn6.setAttribute("aria-expanded", "false");
    const el7 = $("labia-rub-pack-editor");
    const btn7 = $("btn-labia-rub-packs");
    if (el7 && !el7.hidden) el7.hidden = true;
    if (btn7) btn7.setAttribute("aria-expanded", "false");
    const el8 = $("standee-pack-editor");
    const btn8 = $("btn-standee-packs");
    if (el8 && !el8.hidden) el8.hidden = true;
    if (btn8) btn8.setAttribute("aria-expanded", "false");
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

  $("fg-close")?.addEventListener("click", () => close());

  $("fg-pack")?.addEventListener("change", () => {
    collectForm();
    activeId = $("fg-pack").value;
    doc.activeId = activeId;
    renderForm();
  });

  $("fg-girl")?.addEventListener("change", () => {
    girlId = $("fg-girl").value;
  });

  $("fg-new")?.addEventListener("click", () => {
    collectForm();
    const p = emptyFingerPack("手指插入 " + (doc.packs.length + 1));
    doc.packs.push(p);
    activeId = p.id;
    doc.activeId = p.id;
    renderPacks();
    renderForm();
    setStatus("已新增（記得按儲存）");
  });

  $("fg-del")?.addEventListener("click", () => {
    if (!doc.packs.length) return;
    if (doc.packs.length <= 1) {
      if (!confirm("刪掉最後一組？刪掉後執行手指插入不會生圖。")) return;
    } else if (!confirm("刪除這一組？")) return;
    collectForm();
    doc.packs = doc.packs.filter((p) => p.id !== activeId);
    activeId = doc.packs[0]?.id || "";
    doc.activeId = activeId;
    renderPacks();
    renderForm();
    setStatus("已刪除（記得按儲存）");
  });

  $("fg-save")?.addEventListener("click", async () => {
    collectForm();
    try {
      doc = await saveFingerDoc(doc);
      invalidateFingerCache();
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(`✓ 已寫入 finger_packs.json（${doc.packs.length} 組）`);
    } catch (e) {
      setStatus("儲存失敗：" + e.message, true);
    }
  });

  $("fg-inject")?.addEventListener("click", async () => {
    const g = currentGirl();
    if (!g) {
      setStatus("先選魅子或抽一隻進房", true);
      return;
    }
    try {
      const stage = g.stage || "stranger";
      const action = defaultFingerPrompt(stage);
      const posEl = $("fg-pos");
      const negEl = $("fg-neg");
      // 只填動作／裁切預設；人設與模型於生圖時由 live girl 帶入，不烤進組
      if (posEl) posEl.value = action;
      if (negEl && !String(negEl.value || "").trim()) negEl.value = defaultFingerNegative();
      collectForm();
      const worn = wornOutfit(g);
      const ck = girlOwnCkpt(g);
      const bits = [
        g.name || g.id || "魅子",
        ck ? `模型 ${shortCkptName(ck)}` : "模型（尚未綁定）",
        worn ? `服裝 ${String(worn).slice(0, 28)}` : "",
      ].filter(Boolean);
      setStatus(`✓ 已填動作預設（無頭）。執行時會帶入：${bits.join(" · ")}`);
    } catch (e) {
      setStatus("套入失敗：" + e.message, true);
    }
  });

  $("fg-ref-up")?.addEventListener("click", () => $("fg-ref-file")?.click());
  $("fg-ref-file")?.addEventListener("change", async (e) => {
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

  $("fg-ref-clear")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    p.ref = "";
    updateRefFlag();
    setStatus("已拿掉參考圖");
  });

  $("fg-ref-apply")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    const url = String($("fg-ref-url")?.value || "").trim();
    if (!url) {
      setStatus("先貼 URL", true);
      return;
    }
    p.ref = url;
    updateRefFlag();
    setStatus("✓ 已套用 URL");
  });

  $("fg-gen")?.addEventListener("click", async () => {
    collectForm();
    const p = activePack();
    const g = currentGirl();
    if (!p) {
      setStatus("先新增一組", true);
      return;
    }
    if (!g) {
      setStatus("先選魅子或抽一隻進房", true);
      return;
    }
    const btn = $("fg-gen");
    if (btn) btn.disabled = true;
    if ($("fg-art")) $("fg-art").innerHTML = `<span class="mini">生成中…</span>`;
    setStatus("排隊中…");
    try {
      const eng = (await hooks.getEngine?.()) || { imgProvider: "comfy", imgStyle: "pixel" };
      const r = await generateFingerPackImage(p, g, eng, {
        stage: g.stage || "stranger",
        onTick: (sec) => setStatus(`生成中… ${sec}s`),
      });
      if (r.status === "done" && r.result) {
        const url = String(r.result);
        p.url = url;
        if ($("fg-art")) {
          $("fg-art").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
        }
        setStatus("✓ 測試生圖完成（記得按儲存）");
      } else {
        throw new Error(r.error || "生圖失敗");
      }
    } catch (e) {
      if ($("fg-art")) $("fg-art").innerHTML = `<span class="mini">失敗</span>`;
      setStatus(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // 初始關閉
  panel.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
}
