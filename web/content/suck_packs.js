/** 房間「吸奶頭」生圖預設組：多組命名存檔，執行時隨機抽一組；無組時不生圖（僅對話／身體）。 */

import { composeTeaseExtra, teaseFraming } from "./tease_shots.js?v=4";

const API = "/api/suck-packs";

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 動作／裁切 tags only（無頭／表情／人設；人設於生圖時由 character 合併）。 */
export function defaultSuckPrompt(stage = "stranger") {
  return composeTeaseExtra("tease_breast_suck", stage, "") || [
    "simple background, white background",
    "breasts focus, nipple focus, close-up, head out of frame",
    "first-person POV, mouth sucking nipple, lips on nipple, tongue on nipple",
    "NO face of girl, NO head of girl",
  ].join(", ");
}

/** 局部繪圖負向：排除頭／臉／表情與常見瑕疵。 */
export function defaultSuckNegative() {
  return [
    "head, face, hair, eyes, smile, looking at viewer, portrait",
    "text, watermark, ugly, extra fingers",
  ].join(", ");
}

export function emptySuckPack(name = "吸奶頭圖組") {
  return {
    id: uid(),
    name: String(name || "吸奶頭圖組").slice(0, 40),
    poseDenoise: 0.55,
    prompt: defaultSuckPrompt(),
    negative: defaultSuckNegative(),
    ref: "",
    url: "",
    updated: Date.now(),
  };
}

export function normalizeSuckPack(raw) {
  const base = emptySuckPack();
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

export function normalizeSuckDoc(raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const packs = (Array.isArray(src.packs) ? src.packs : []).map(normalizeSuckPack).filter((p) => p.id);
  let activeId = String(src.activeId || "");
  if (packs.length && !packs.some((p) => p.id === activeId)) activeId = packs[0].id;
  if (!packs.length) activeId = "";
  return { packs, activeId };
}

export function pickRandomSuckPack(packs) {
  const list = (Array.isArray(packs) ? packs : []).map(normalizeSuckPack).filter((p) => p.id);
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

export async function fetchSuckBasePrompt(girl, eng = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const body = {
    key: `suck-base:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: comfy ? (eng.imgModel || "grok-4.5") : (eng.imgModel || "grok-4.5"),
    framing: teaseFraming("tease_breast_suck"),
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
    shot: "tease_breast_suck",
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
 * 組吸奶頭生圖下單。有 pack → 用組內「動作」prompt／ref／denoise；
 * pack 為 null 時呼叫端應略過生圖（無硬編碼退回）。
 * 契約：pack.prompt = 動作／裁切 only；執行時 character+outfit+extra(action)+girl ckpt。
 */
export function buildSuckImgBody(pack, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const stage = String(opts.stage || girl.stage || "stranger");
  const worn = opts.worn != null ? opts.worn : wornOutfit(girl);
  const p = pack ? normalizeSuckPack(pack) : null;
  const action = p
    ? String(p.prompt || "").trim()
    : composeTeaseExtra("tease_breast_suck", stage, worn);
  const userNeg = p ? String(p.negative || "").trim() : defaultSuckNegative();
  const ref = p ? String(p.ref || "").trim() : "";
  const denoise = p ? clampDenoise(p.poseDenoise) : 0.55;
  const ckpt = comfy ? resolveComfyCkpt(girl, eng) : "";
  return {
    key: `room-suck:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: teaseFraming("tease_breast_suck"),
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
    shot: "tease_breast_suck",
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: denoise } : {}),
    ...(comfy ? {
      comfy_url: eng.comfyUrl || "",
      ckpt,
    } : {}),
  };
}

const SUCK_LOAD_HINT = "讀不到吸奶頭圖組（/api/suck-packs）。請 pull 最新 grok-telephon 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）";
const SUCK_SAVE_HINT = "伺服器未重啟，無法儲存吸奶頭圖組（PUT /api/suck-packs）。請 pull 最新 grok-telephon 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）";

export async function loadSuckDoc() {
  let r;
  try {
    r = await fetch(API + "?ts=" + Date.now(), { cache: "no-store" });
  } catch {
    return loadSuckDocStatic();
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return normalizeSuckDoc(j);
  if (r.status !== 404) {
    throw new Error(formatApiError("GET", API, j.detail || j.error || r.status));
  }
  return loadSuckDocStatic();
}

async function loadSuckDocStatic() {
  try {
    const r = await fetch("/content/suck_packs.json?ts=" + Date.now(), { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(formatApiError("GET", "/content/suck_packs.json", j.detail || j.error || r.status));
    return normalizeSuckDoc(j);
  } catch {
    throw new Error(SUCK_LOAD_HINT);
  }
}

export async function saveSuckDoc(doc) {
  const body = normalizeSuckDoc(doc);
  const r = await fetch(API, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404) throw new Error(SUCK_SAVE_HINT);
    throw new Error(formatApiError("PUT", API, j.detail || j.error || r.status));
  }
  return body;
}

/** 執行時快取（房間／主遊戲共用）。 */
let _cache = null;
let _cacheAt = 0;

export async function getSuckPacksCached(force = false) {
  const now = Date.now();
  if (!force && _cache && now - _cacheAt < 15000) return _cache;
  try {
    _cache = await loadSuckDoc();
    _cacheAt = now;
  } catch {
    if (!_cache) _cache = { packs: [], activeId: "" };
  }
  return _cache;
}

export function invalidateSuckCache() {
  _cache = null;
  _cacheAt = 0;
}

/** 隨機一組；無組回 null（呼叫端走硬編碼）。 */
export async function pickRuntimeSuckPack() {
  const doc = await getSuckPacksCached();
  return pickRandomSuckPack(doc.packs);
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
 * 吸奶頭生圖（編輯器／預產／執行時共用）。
 * comfy 時 buildSuckImgBody → resolveComfyCkpt 會丟「尚未綁定」；
 * 不寫入 pack.url（呼叫端決定）。回傳 { status, result, error, body, … }。
 */
export async function generateSuckPackImage(pack, girl, eng, opts = {}) {
  const body = buildSuckImgBody(pack, girl, eng, opts);
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
 * 掛載房間編輯器內的「吸奶頭圖」面板。
 * @param {{ getGirl: () => object|null, getEngine: () => Promise<object> }} hooks
 */
export function mountSuckPackEditor(hooks = {}) {
  const openBtn = $("btn-suck-packs");
  const panel = $("suck-pack-editor");
  if (!openBtn || !panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";

  let doc = { packs: [], activeId: "" };
  let activeId = "";
  let girls = [];
  let girlId = "";

  const setStatus = (msg, err = false) => {
    const el = $("su-status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!err);
  };

  const activePack = () => doc.packs.find((p) => p.id === activeId) || doc.packs[0] || null;

  const renderPacks = () => {
    const sel = $("su-pack");
    if (!sel) return;
    if (!doc.packs.some((p) => p.id === activeId) && doc.packs[0]) activeId = doc.packs[0].id;
    sel.innerHTML = doc.packs.length
      ? doc.packs.map((p) =>
        `<option value="${esc(p.id)}"${p.id === activeId ? " selected" : ""}>${esc(p.name)}</option>`).join("")
      : `<option value="">（尚無圖組）</option>`;
  };

  const renderGirls = () => {
    const sel = $("su-girl");
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
      if ($("su-name")) $("su-name").value = "";
      if ($("su-pos")) $("su-pos").value = "";
      if ($("su-neg")) $("su-neg").value = "";
      if ($("su-denoise")) $("su-denoise").value = "0.55";
      if ($("su-ref-flag")) $("su-ref-flag").textContent = "沒有參考圖 → 文生圖";
      if ($("su-art")) $("su-art").innerHTML = `<span class="mini">尚無圖組</span>`;
      updateRefFlag();
      return;
    }
    if ($("su-name")) $("su-name").value = p.name || "";
    if ($("su-pos")) $("su-pos").value = p.prompt || "";
    if ($("su-neg")) $("su-neg").value = p.negative || "";
    if ($("su-denoise")) $("su-denoise").value = String(p.poseDenoise ?? 0.55);
    if ($("su-art")) {
      $("su-art").innerHTML = p.url
        ? `<img src="${esc(p.url)}" alt="suck">`
        : `<span class="mini">尚未產生</span>`;
    }
    updateRefFlag();
  };

  const updateRefFlag = () => {
    const p = activePack();
    const ref = p?.ref || "";
    const flag = $("su-mode-flag");
    const refFlag = $("su-ref-flag");
    const thumb = $("su-ref-thumb");
    if (flag) {
      flag.textContent = ref ? "圖生圖（pose_ref）" : "文生圖";
      flag.className = "su-mode-flag " + (ref ? "img" : "txt");
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
    p.name = String($("su-name")?.value || p.name || "吸奶頭圖組").slice(0, 40);
    p.prompt = $("su-pos")?.value || "";
    p.negative = $("su-neg")?.value || "";
    p.poseDenoise = clampDenoise($("su-denoise")?.value);
    p.updated = Date.now();
    doc.activeId = p.id;
    activeId = p.id;
  };

  const load = async () => {
    setStatus("讀取中…");
    try {
      doc = await loadSuckDoc();
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

  $("su-close")?.addEventListener("click", () => close());

  $("su-pack")?.addEventListener("change", () => {
    collectForm();
    activeId = $("su-pack").value;
    doc.activeId = activeId;
    renderForm();
  });

  $("su-girl")?.addEventListener("change", () => {
    girlId = $("su-girl").value;
  });

  $("su-new")?.addEventListener("click", () => {
    collectForm();
    const p = emptySuckPack("吸奶頭 " + (doc.packs.length + 1));
    doc.packs.push(p);
    activeId = p.id;
    doc.activeId = p.id;
    renderPacks();
    renderForm();
    setStatus("已新增（記得按儲存）");
  });

  $("su-del")?.addEventListener("click", () => {
    if (!doc.packs.length) return;
    if (doc.packs.length <= 1) {
      if (!confirm("刪掉最後一組？刪掉後執行吸奶頭不會生圖。")) return;
    } else if (!confirm("刪除這一組？")) return;
    collectForm();
    doc.packs = doc.packs.filter((p) => p.id !== activeId);
    activeId = doc.packs[0]?.id || "";
    doc.activeId = activeId;
    renderPacks();
    renderForm();
    setStatus("已刪除（記得按儲存）");
  });

  $("su-save")?.addEventListener("click", async () => {
    collectForm();
    try {
      doc = await saveSuckDoc(doc);
      invalidateSuckCache();
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(`✓ 已寫入 suck_packs.json（${doc.packs.length} 組）`);
    } catch (e) {
      setStatus("儲存失敗：" + e.message, true);
    }
  });

  $("su-inject")?.addEventListener("click", async () => {
    const g = currentGirl();
    if (!g) {
      setStatus("先選魅子或抽一隻進房", true);
      return;
    }
    try {
      const stage = g.stage || "stranger";
      const action = defaultSuckPrompt(stage);
      const posEl = $("su-pos");
      const negEl = $("su-neg");
      // 只填動作／裁切預設；人設與模型於生圖時由 live girl 帶入，不烤進組
      if (posEl) posEl.value = action;
      if (negEl && !String(negEl.value || "").trim()) negEl.value = defaultSuckNegative();
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

  $("su-ref-up")?.addEventListener("click", () => $("su-ref-file")?.click());
  $("su-ref-file")?.addEventListener("change", async (e) => {
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

  $("su-ref-clear")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    p.ref = "";
    updateRefFlag();
    setStatus("已拿掉參考圖");
  });

  $("su-ref-apply")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    const url = String($("su-ref-url")?.value || "").trim();
    if (!url) {
      setStatus("先貼 URL", true);
      return;
    }
    p.ref = url;
    updateRefFlag();
    setStatus("✓ 已套用 URL");
  });

  $("su-gen")?.addEventListener("click", async () => {
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
    const btn = $("su-gen");
    if (btn) btn.disabled = true;
    if ($("su-art")) $("su-art").innerHTML = `<span class="mini">生成中…</span>`;
    setStatus("排隊中…");
    try {
      const eng = (await hooks.getEngine?.()) || { imgProvider: "comfy", imgStyle: "pixel" };
      const r = await generateSuckPackImage(p, g, eng, {
        stage: g.stage || "stranger",
        onTick: (sec) => setStatus(`生成中… ${sec}s`),
      });
      if (r.status === "done" && r.result) {
        const url = String(r.result);
        p.url = url;
        if ($("su-art")) {
          $("su-art").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
        }
        setStatus("✓ 測試生圖完成（記得按儲存）");
      } else {
        throw new Error(r.error || "生圖失敗");
      }
    } catch (e) {
      if ($("su-art")) $("su-art").innerHTML = `<span class="mini">失敗</span>`;
      setStatus(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });

  // 初始關閉
  panel.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
}
