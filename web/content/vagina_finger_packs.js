/** 房間「扣陰道」生圖預設組（x-ray 子宮剖面圖）：多組命名存檔，執行時隨機抽一組。
 *  剖面圖穿不穿衣服都同一張 → 沒有裸體版（穿衣／裸體共用一張 url）。
 *  無組或生圖失敗時，房間才退回借用「扣陰道」的快取圖（見 test_room_summon.js maybeGenOwnActionShot）。 */

import { composeTeaseExtra, teaseFraming } from "./tease_shots.js?v=8";

export const VAGINA_VAGINA_FINGER_SHOT = "tease_vagina_finger";
/** x-ray 剖面＝穿衣／裸體同一張；房間 ACTION_PACK_JOBS 以 noNude 跳過裸體預產。 */
export const SHARED_NUDE = true;
/**
 * 總開關（2026-10-03 使用者：x-ray 剖面太難，模型會畫成陰莖插進子宮）→ 關。
 * 關著時：扣陰道／揉子宮口執行時借「插入手指」的圖（全裸借裸體版），不產這兩組（執行時、召喚預產都不產），
 * test_room 編輯器按鈕藏起來；主遊戲 crop 也不產。程式、伺服器 shot／CRUD、json 都保留，改 true 就恢復。
 * 揉子宮口那組沿用這一個開關（cervix_rub_packs.js 轉出）。
 */
export const XRAY_ACTION_PACKS_ON = false;

const SHOT = "tease_vagina_finger";
const API = "/api/vagina-finger-packs";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 動作／裁切 tags only（無頭／表情／人設；人設於生圖時由 character 合併）。 */
export function defaultVaginaFingerPrompt(stage = "stranger") {
  return composeTeaseExtra(SHOT, stage, "") || [
    "simple background, white background",
    "x-ray, cross-section, internal view, cutaway, lower body, pussy focus",
    "vagina, uterus, cervix",
    "1 finger inserted, one male finger inside vagina, fingering",
    "finger curled against vaginal wall, rubbing vaginal wall, g-spot",
    "pussy juice, nsfw",
    "NO face of girl, NO head of girl",
  ].join(", ");
}

/** 局部繪圖負向：排除頭／臉／表情與常見瑕疵。 */
/** 剖面負向：排除頭／臉、陽具、多指／拳頭、內褲衣物（剖面不畫衣服）。 */
export function defaultVaginaFingerNegative() {
  return [
    "head, face, hair, eyes, smile, looking at viewer, portrait",
    "penis, multiple fingers, fist, extra fingers",
    "panties, clothes, clothes covering crotch",
    "text, watermark, ugly",
  ].join(", ");
}

export function emptyVaginaFingerPack(name = "扣陰道圖組") {
  return {
    id: uid(),
    name: String(name || "扣陰道圖組").slice(0, 40),
    poseDenoise: 0.55,
    prompt: defaultVaginaFingerPrompt(),
    negative: defaultVaginaFingerNegative(),
    ref: "",
    url: "",
    updated: Date.now(),
  };
}

export function normalizeVaginaFingerPack(raw) {
  const base = emptyVaginaFingerPack();
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

export function normalizeVaginaFingerDoc(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const packs = (Array.isArray(src.packs) ? src.packs : []).map(normalizeVaginaFingerPack).filter((p) => p.id);
  let activeId = String(src.activeId || "");
  if (packs.length && !packs.some((p) => p.id === activeId)) activeId = packs[0].id;
  if (!packs.length) activeId = "";
  return { packs, activeId };
}

export function pickRandomVaginaFingerPack(packs) {
  const list = (Array.isArray(packs) ? packs : []).map(normalizeVaginaFingerPack).filter((p) => p.id);
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

export async function fetchVaginaFingerBasePrompt(girl, eng = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const body = {
    key: `vagina-finger-base:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: comfy ? (eng.imgModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
    framing: teaseFraming(SHOT),
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: "",
    extra: "",
    negative: "",
    prompt: "",
    cutout: false,
    lock_identity: true,
    scene_kind: "tease",
    shot: SHOT,
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
 * 組扣陰道生圖下單。有 pack → 用組內「動作」prompt／ref／denoise；
 * pack 為 null 時呼叫端應略過生圖（無硬編碼退回）。
 * 契約：pack.prompt = 動作／裁切 only；執行時 character+outfit+extra(action)+girl ckpt。
 */
export function buildVaginaFingerImgBody(pack, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const stage = String(opts.stage || girl.stage || "stranger");
  const worn = opts.worn != null ? opts.worn : wornOutfit(girl);
  const p = pack ? normalizeVaginaFingerPack(pack) : null;
  // x-ray 剖面：穿衣／裸體同一張 → 忽略 opts.nude；不送 outfit（伺服器 framing=xray 也不寫服裝）
  void worn;
  const action = p ? String(p.prompt || "").trim() : composeTeaseExtra(SHOT, stage, "");
  const userNeg = p ? String(p.negative || "").trim() : defaultVaginaFingerNegative();
  const ref = p ? String(p.ref || "").trim() : "";
  const denoise = p ? clampDenoise(p.poseDenoise) : 0.55;
  const ckpt = comfy ? resolveComfyCkpt(girl, eng) : "";
  return {
    key: `room-vagina-finger:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: teaseFraming(SHOT),
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: "",
    // prompt 留空 → 伺服器以 xray 取景（下半身人設、無服裝）+ extra(動作) 合併
    prompt: "",
    extra: action,
    negative: userNeg,
    visual_neg: userNeg,
    cutout: false,
    flat_bg: true,
    lock_identity: true,
    retry: true,
    scene_kind: "tease",
    shot: SHOT,
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: denoise } : {}),
    ...(comfy ? {
      comfy_url: eng.comfyUrl || "",
      ckpt,
    } : {}),
  };
}

const VAGINA_FINGER_LOAD_HINT = "讀不到扣陰道圖組（/api/vagina-finger-packs）。請 pull 最新 grok-2026.10 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）";
const VAGINA_FINGER_SAVE_HINT = "伺服器未重啟，無法儲存扣陰道圖組（PUT /api/vagina-finger-packs）。請 pull 最新 grok-2026.10 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）";

export async function loadVaginaFingerDoc() {
  let r;
  try {
    r = await fetch(API + "?ts=" + Date.now(), { cache: "no-store" });
  } catch {
    return loadVaginaFingerDocStatic();
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return normalizeVaginaFingerDoc(j);
  if (r.status !== 404) {
    throw new Error(formatApiError("GET", API, j.detail || j.error || r.status));
  }
  return loadVaginaFingerDocStatic();
}

async function loadVaginaFingerDocStatic() {
  try {
    const r = await fetch("/content/vagina_vagina_finger_packs.json?ts=" + Date.now(), { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(formatApiError("GET", "/content/vagina_vagina_finger_packs.json", j.detail || j.error || r.status));
    return normalizeVaginaFingerDoc(j);
  } catch {
    throw new Error(VAGINA_FINGER_LOAD_HINT);
  }
}

export async function saveVaginaFingerDoc(doc) {
  const body = normalizeVaginaFingerDoc(doc);
  const r = await fetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) throw new Error(VAGINA_FINGER_SAVE_HINT);
    throw new Error(formatApiError("PUT", API, j.detail || j.error || r.status));
  }
  return body;
}

/** 執行時快取（房間／主遊戲共用）。 */
let _cache = null;
let _cacheAt = 0;

export async function getVaginaFingerPacksCached(force = false) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < 15000) return _cache;
  try {
    _cache = await loadVaginaFingerDoc();
    _cacheAt = now;
  } catch {
    if (!_cache) _cache = { packs: [], activeId: "" };
  }
  return _cache;
}

export function invalidateVaginaFingerCache() {
  _cache = null;
  _cacheAt = 0;
}

/** 隨機一組；無組回 null（呼叫端走硬編碼）。 */
export async function pickRuntimeVaginaFingerPack() {
  const doc = await getVaginaFingerPacksCached();
  return pickRandomVaginaFingerPack(doc.packs);
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
 * 扣陰道生圖（編輯器／預產／執行時共用）。
 * comfy 時 buildVaginaFingerImgBody → resolveComfyCkpt 會丟「尚未綁定」；
 * 不寫入 pack.url（呼叫端決定）。回傳 { status, result, error, body, … }。
 */
export async function generateVaginaFingerPackImage(pack, girl, eng, opts = {}) {
  const body = buildVaginaFingerImgBody(pack, girl, eng, opts);
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
 * 掛載房間編輯器內的「扣陰道圖」面板。
 * @param {{ getGirl: () => object|null, getEngine: () => Promise<object> }} hooks
 */
export function mountVaginaFingerPackEditor(hooks = {}) {
  const openBtn = $("btn-vagina-finger-packs");
  const panel = $("vagina-finger-pack-editor");
  if (!openBtn || !panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";

  let doc = { packs: [], activeId: "" };
  let activeId = "";
  let girls = [];
  let girlId = "";
  // x-ray 剖面沒有裸體版（穿衣／裸體共用一張），不掛穿衣版｜裸體版切換
  const isNudeTab = () => false;
  const nudeTab = { variant: "clothed", decorate() {} };

  const setStatus = (msg, err = false) => {
    const el = $("vf-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!err);
  };

  const activePack = () => doc.packs.find((p) => p.id === activeId) || doc.packs[0] || null;

  const renderPacks = () => {
    const sel = $("vf-pack");
    if (!sel) return;
    if (!doc.packs.some((p) => p.id === activeId) && doc.packs[0]) activeId = doc.packs[0].id;
    sel.innerHTML = doc.packs.length
      ? doc.packs.map((p) =>
        `<option value="${esc(p.id)}"${p.id === activeId ? " selected" : ""}>${esc(p.name)}</option>`).join("")
      : `<option value="">（尚無圖組）</option>`;
  };

  const renderGirls = () => {
    const sel = $("vf-girl");
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
      if ($("vf-name")) $("vf-name").value = "";
      if ($("vf-pos")) $("vf-pos").value = "";
      if ($("vf-neg")) $("vf-neg").value = "";
      if ($("vf-denoise")) $("vf-denoise").value = "0.55";
      if ($("vf-ref-flag")) $("vf-ref-flag").textContent = "沒有參考圖 → 文生圖";
      if ($("vf-art")) $("vf-art").innerHTML = `<span class="mini">尚無圖組</span>`;
      updateRefFlag();
      return;
    }
    if ($("vf-name")) $("vf-name").value = p.name || "";
    if ($("vf-pos")) $("vf-pos").value = isNudeTab() ? (p.nudePrompt || "") : (p.prompt || "");
    if ($("vf-neg")) $("vf-neg").value = isNudeTab() ? (p.nudeNegative || "") : (p.negative || "");
    nudeTab.decorate(p);
    if ($("vf-denoise")) $("vf-denoise").value = String(p.poseDenoise ?? 0.55);
    if ($("vf-art")) {
      const artUrl = isNudeTab() ? p.nudeUrl : p.url;
      $("vf-art").innerHTML = artUrl
        ? `<img src="${esc(artUrl)}" alt="vagina-finger">`
        : `<span class="mini">尚未產生</span>`;
    }
    updateRefFlag();
  };

  const updateRefFlag = () => {
    const p = activePack();
    const ref = isNudeTab() ? (p?.nudeRef || p?.ref || "") : (p?.ref || "");
    const flag = $("vf-mode-flag");
    const refFlag = $("vf-ref-flag");
    const thumb = $("vf-ref-thumb");
    if (flag) {
      flag.textContent = ref ? "圖生圖（pose_ref）" : "文生圖";
      flag.className = "fg-mode-flag " + (ref ? "img" : "txt");
    }
    if (refFlag) refFlag.textContent = ref ? ((isNudeTab() && !p?.nudeRef ? "沿用穿衣版 " : "已掛 ") + ref) : "沒有參考圖 → 文生圖";
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
    p.name = String($("vf-name")?.value || p.name || "扣陰道圖組").slice(0, 40);
    if (isNudeTab()) {
      p.nudePrompt = $("vf-pos")?.value || "";
      p.nudeNegative = $("vf-neg")?.value || "";
    } else {
      p.prompt = $("vf-pos")?.value || "";
      p.negative = $("vf-neg")?.value || "";
    }
    p.poseDenoise = clampDenoise($("vf-denoise")?.value);
    p.updated = Date.now();
    doc.activeId = p.id;
    activeId = p.id;
  };

  const load = async () => {
    setStatus("讀取中…");
    try {
      doc = await loadVaginaFingerDoc();
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

  // 關掉其他所有圖組面板（含日後新增的），不用硬寫清單
  const closeSibling = () => {
    document.querySelectorAll(".tease-pack-panel").forEach((el) => {
      if (el !== panel && !el.hidden) el.hidden = true;
    });
    document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => {
      if (b !== openBtn) b.setAttribute("aria-expanded", "false");
    });
  };
  // 其他舊面板的 closeSibling 不認得本面板 → 點別的圖組按鈕時自己收起
  document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => {
    if (b === openBtn || b.id === "edit-room") return;
    b.addEventListener("click", () => {
      if (!panel.hidden) {
        panel.hidden = true;
        openBtn.setAttribute("aria-expanded", "false");
      }
    });
  });

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

  $("vf-close")?.addEventListener("click", () => close());

  $("vf-pack")?.addEventListener("change", () => {
    collectForm();
    activeId = $("vf-pack").value;
    doc.activeId = activeId;
    renderForm();
  });

  $("vf-girl")?.addEventListener("change", () => {
    girlId = $("vf-girl").value;
  });

  $("vf-new")?.addEventListener("click", () => {
    collectForm();
    const p = emptyVaginaFingerPack("扣陰道 " + (doc.packs.length + 1));
    doc.packs.push(p);
    activeId = p.id;
    doc.activeId = p.id;
    renderPacks();
    renderForm();
    setStatus("已新增（記得按儲存）");
  });

  $("vf-del")?.addEventListener("click", () => {
    if (!doc.packs.length) return;
    if (doc.packs.length <= 1) {
      if (!confirm("刪掉最後一組？刪掉後扣陰道會借用扣陰道的圖。")) return;
    } else if (!confirm("刪除這一組？")) return;
    collectForm();
    doc.packs = doc.packs.filter((p) => p.id !== activeId);
    activeId = doc.packs[0]?.id || "";
    doc.activeId = activeId;
    renderPacks();
    renderForm();
    setStatus("已刪除（記得按儲存）");
  });

  $("vf-save")?.addEventListener("click", async () => {
    collectForm();
    try {
      doc = await saveVaginaFingerDoc(doc);
      invalidateVaginaFingerCache();
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(`✓ 已寫入 vagina_finger_packs.json（${doc.packs.length} 組）`);
    } catch (e) {
      setStatus("儲存失敗：" + e.message, true);
    }
  });

  $("vf-inject")?.addEventListener("click", async () => {
    const g = currentGirl();
    if (!g) {
      setStatus("先選魅子或抽一隻進房", true);
      return;
    }
    try {
      const stage = g.stage || "stranger";
      const action = defaultVaginaFingerPrompt(stage);
      const posEl = $("vf-pos");
      const negEl = $("vf-neg");
      // 只填動作／裁切預設；人設與模型於生圖時由 live girl 帶入，不烤進組
      if (posEl) posEl.value = action;
      if (negEl && !String(negEl.value || "").trim()) {
        negEl.value = defaultVaginaFingerNegative();
      }
      collectForm();
      const worn = "";
      const ck = girlOwnCkpt(g);
      const bits = [
        g.name || g.id || "魅子",
        ck ? `模型 ${shortCkptName(ck)}` : "模型（尚未綁定）",
        worn ? `服裝 ${String(worn).slice(0, 28)}` : "x-ray 剖面（不寫服裝，穿衣／裸體共用）",
      ].filter(Boolean);
      setStatus(`✓ 已填動作預設（無頭）。執行時會帶入：${bits.join(" · ")}`);
    } catch (e) {
      setStatus("套入失敗：" + e.message, true);
    }
  });

  $("vf-ref-up")?.addEventListener("click", () => $("vf-ref-file")?.click());
  $("vf-ref-file")?.addEventListener("change", async (e) => {
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
      p[isNudeTab() ? "nudeRef" : "ref"] = String(j.url || "").trim();
      updateRefFlag();
      setStatus("✓ 已掛參考圖");
    } catch (err) {
      setStatus("上傳失敗：" + err.message, true);
    }
  });

  $("vf-ref-clear")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    p[isNudeTab() ? "nudeRef" : "ref"] = "";
    updateRefFlag();
    setStatus("已拿掉參考圖");
  });

  $("vf-ref-apply")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    const url = String($("vf-ref-url")?.value || "").trim();
    if (!url) {
      setStatus("先貼 URL", true);
      return;
    }
    p[isNudeTab() ? "nudeRef" : "ref"] = url;
    updateRefFlag();
    setStatus("✓ 已套用 URL");
  });

  $("vf-gen")?.addEventListener("click", async () => {
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
    const btn = $("vf-gen");
    if (btn) btn.disabled = true;
    if ($("vf-art")) $("vf-art").innerHTML = `<span class="mini">生成中…</span>`;
    setStatus("排隊中…");
    try {
      const eng = (await hooks.getEngine?.()) || { imgProvider: "comfy", imgStyle: "pixel" };
      const r = await generateVaginaFingerPackImage(p, g, eng, {
        nude: isNudeTab(),
        stage: g.stage || "stranger",
        onTick: (sec) => setStatus(`生成中… ${sec}s`),
      });
      if (r.status === "done" && r.result) {
        const url = String(r.result);
        if (isNudeTab()) p.nudeUrl = url;
        else p.url = url;
        if ($("vf-art")) {
          $("vf-art").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
        }
        setStatus("✓ 測試生圖完成（記得按儲存）");
      } else {
        throw new Error(r.error || "生圖失敗");
      }
    } catch (e) {
      if ($("vf-art")) $("vf-art").innerHTML = `<span class="mini">失敗</span>`;
      setStatus(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // 初始關閉
  panel.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
}
