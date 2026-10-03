/** 做愛開場圖組（2026-10-03，肏系統第一步）：她脫光後按「做愛」先顯示一張開場圖，依「最後一層（內褲）怎麼脫掉」：
 *   - 她自己脫（叫她脫）→ 傳教士：躺平、腿張開、自己用手指撥開陰唇（POV 從上往下）  shot sex_missionary_open
 *   - 你幫她脫（幫她脫）→ 後背：趴著／四肢著地、屁股翹高、回頭（POV 從後面）       shot sex_doggy_open
 * 兩組各自多組命名存檔（/api/sex-missionary-packs、/api/sex-doggy-packs），執行時隨機抽一組；
 * 伺服器檔名 {id}_sex_missionary_open.png／{id}_sex_doggy_open.png，garment=nude（不套服裝）。
 * 圖組 prompt 只寫姿勢／取景；人設（臉、髮、膚色、身材、性器）於生圖時由 character 合併。 */

export const SEX_POSES = {
  missionary: {
    key: "missionary",
    shot: "sex_missionary_open",
    api: "/api/sex-missionary-packs",
    json: "sex_missionary_packs.json",
    prefix: "sxm",
    label: "傳教士開場",
    packName: "傳教士開場圖組",
    hint: "她自己脫掉內褲（叫她脫）",
  },
  doggy: {
    key: "doggy",
    shot: "sex_doggy_open",
    api: "/api/sex-doggy-packs",
    json: "sex_doggy_packs.json",
    prefix: "sxd",
    label: "後背開場",
    packName: "後背開場圖組",
    hint: "你幫她脫掉內褲（幫她脫）",
  },
};

/** 影子男（同吸／舔奶頭）：只露出手時用。 */
export const SEX_SHADOW_HANDS = "1man, pov, faceless shadow man, black semi-transparent silhouette, translucent dark silhouette, shadow male hands";

/** 最後一層怎麼脫的 → 開場姿勢。pantiesBy：self → 傳教士；help → 後背；舊存檔沒記 → 傳教士。 */
export function sexPoseFor(who) {
  const by = String(who?.undress?.pantiesBy || "");
  if (by === "help") return "doggy";
  return "missionary";
}

export function sexPosePacksKey(pose) {
  return `${(SEX_POSES[pose] || SEX_POSES.missionary).shot}_packs`;
}

function cfg(pose) {
  const c = SEX_POSES[pose];
  if (!c) throw new Error(`未知的做愛姿勢：${pose}`);
  return c;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 姿勢／取景 tags only（人設於生圖時合併）。 */
export function defaultSexPosePrompt(pose) {
  if (pose === "doggy") {
    return [
      "pov, from behind, doggystyle, doggy position",
      "girl on all fours, on bed, white bed sheets",
      "ass up, butt raised high, top-down bottom-up, arched back",
      "looking back, looking at viewer over shoulder, blush",
      "pussy, labia, pussy visible from behind, anus, presenting, wet pussy",
      SEX_SHADOW_HANDS,
      "shadow male hands on her hips",
      "full body, nsfw, explicit",
      "NO penis, NO detailed male face",
    ].join(", ");
  }
  return [
    "pov, from above, missionary position",
    "girl lying on back, on bed, white bed sheets",
    "legs spread, spread legs, knees up, m legs",
    "spreading own pussy, spread pussy with fingers, fingers spreading labia, presenting pussy",
    "pussy, labia, clitoris, pussy juice",
    "blush, embarrassed, looking at viewer",
    "full body, nsfw, explicit",
    "NO penis, NO male body",
  ].join(", ");
}

/** 負向：擋衣物／陽具／寫實男人與常見瑕疵；不擋 nude／pussy／looking at viewer（伺服器另外剔 nude 類）。 */
export function defaultSexPoseNegative(pose) {
  if (pose === "doggy") {
    return [
      "penis, testicles, detailed male face, realistic man, realistic male skin, male eyes",
      "panties, bra, clothes, dressed",
      "text, watermark, ugly, extra fingers, bad hands, extra legs",
    ].join(", ");
  }
  return [
    "penis, testicles, male body, realistic man",
    "panties, bra, clothes, dressed",
    "text, watermark, ugly, extra fingers, bad hands, extra legs",
  ].join(", ");
}

export function emptySexPosePack(pose, name = "") {
  const c = cfg(pose);
  return {
    id: uid(),
    name: String(name || c.packName).slice(0, 40),
    poseDenoise: 0.55,
    prompt: defaultSexPosePrompt(pose),
    negative: defaultSexPoseNegative(pose),
    ref: "",
    url: "",
    updated: Date.now(),
  };
}

export function normalizeSexPosePack(pose, raw) {
  const base = emptySexPosePack(pose);
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(s.id || base.id).slice(0, 24) || base.id,
    name: String(s.name || base.name).slice(0, 40) || base.name,
    poseDenoise: clampDenoise(s.poseDenoise ?? s.pose_denoise ?? base.poseDenoise),
    prompt: String(s.prompt ?? base.prompt),
    negative: String(s.negative ?? base.negative),
    ref: String(s.ref ?? "").trim(),
    url: String(s.url ?? "").trim(),
    updated: Number(s.updated) || Date.now(),
  };
}

export function normalizeSexPoseDoc(pose, raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const packs = (Array.isArray(src.packs) ? src.packs : []).map((p) => normalizeSexPosePack(pose, p)).filter((p) => p.id);
  let activeId = String(src.activeId || "");
  if (packs.length && !packs.some((p) => p.id === activeId)) activeId = packs[0].id;
  if (!packs.length) activeId = "";
  return { packs, activeId };
}

export function pickRandomSexPosePack(pose, packs) {
  const list = (Array.isArray(packs) ? packs : []).map((p) => normalizeSexPosePack(pose, p)).filter((p) => p.id);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
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

/**
 * 組生圖下單。framing=full、shot=sex_*_open（伺服器 garment=nude：寫 nude／bare breasts、不套服裝、負向剔 nude 類）；
 * prompt 留空 → 伺服器以人設＋extra(姿勢) 合併。
 */
export function buildSexPoseImgBody(pose, pack, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const c = cfg(pose);
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const p = pack ? normalizeSexPosePack(pose, pack) : null;
  const action = p ? String(p.prompt || "").trim() : defaultSexPosePrompt(pose);
  const userNeg = p ? String(p.negative || "").trim() : defaultSexPoseNegative(pose);
  const ref = p ? String(p.ref || "").trim() : "";
  const denoise = p ? clampDenoise(p.poseDenoise) : 0.55;
  void opts;
  return {
    key: `room-${c.shot}:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: "full",
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: "",
    prompt: "",
    extra: action,
    negative: userNeg,
    visual_neg: userNeg,
    cutout: false,
    flat_bg: false,
    lock_identity: true,
    retry: true,
    scene_kind: "tease",
    shot: c.shot,
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: denoise } : {}),
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: resolveComfyCkpt(girl, eng) } : {}),
  };
}

function formatApiError(method, url, detail) {
  return `${method || "GET"} ${url} → ${detail}`;
}

function restartHint(c, verb) {
  return `${verb === "PUT" ? "伺服器未重啟，無法儲存" : "讀不到"}${c.label}圖組（${verb} ${c.api}）。請 pull 最新 grok-2026.10 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）`;
}

export async function loadSexPoseDoc(pose) {
  const c = cfg(pose);
  let r;
  try {
    r = await fetch(c.api + "?ts=" + Date.now(), { cache: "no-store" });
  } catch {
    return loadStatic(pose);
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return normalizeSexPoseDoc(pose, j);
  if (r.status !== 404) throw new Error(formatApiError("GET", c.api, j.detail || j.error || r.status));
  return loadStatic(pose);
}

async function loadStatic(pose) {
  const c = cfg(pose);
  try {
    const r = await fetch(`/content/${c.json}?ts=${Date.now()}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(r.status));
    return normalizeSexPoseDoc(pose, j);
  } catch {
    throw new Error(restartHint(c, "GET"));
  }
}

export async function saveSexPoseDoc(pose, doc) {
  const c = cfg(pose);
  const body = normalizeSexPoseDoc(pose, doc);
  const r = await fetch(c.api, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404 || r.status === 405) throw new Error(restartHint(c, "PUT"));
    throw new Error(formatApiError("PUT", c.api, j.detail || j.error || r.status));
  }
  return body;
}

const _cache = {};
export async function getSexPosePacksCached(pose, force = false) {
  const now = Date.now();
  const hit = _cache[pose];
  if (!force && hit && now - hit.at < 15000) return hit.doc;
  try {
    _cache[pose] = { doc: await loadSexPoseDoc(pose), at: now };
  } catch {
    if (!hit) _cache[pose] = { doc: { packs: [], activeId: "" }, at: now };
  }
  return _cache[pose].doc;
}

export function invalidateSexPoseCache(pose) {
  if (pose) delete _cache[pose];
  else for (const k of Object.keys(_cache)) delete _cache[k];
}

export async function pickRuntimeSexPosePack(pose) {
  const doc = await getSexPosePacksCached(pose);
  return pickRandomSexPosePack(pose, doc.packs);
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

/** 生圖（編輯器／背景預產／執行時共用）；不寫入 pack.url。 */
export async function generateSexPosePackImage(pose, pack, girl, eng, opts = {}) {
  const body = buildSexPoseImgBody(pose, pack, girl, eng, opts);
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

/**
 * 掛載 test_room 上排「傳教士圖」「後背圖」編輯器（id 前綴 sxm-／sxd-，版面同其他圖組）。
 * @param {"missionary"|"doggy"} pose
 * @param {{ getGirl: () => object|null, getEngine: () => Promise<object> }} hooks
 */
export function mountSexPosePackEditor(pose, hooks = {}) {
  const c = cfg(pose);
  const P = (s) => $(`${c.prefix}-${s}`);
  const openBtn = $(`btn-sex-${pose}-packs`);
  const panel = $(`sex-${pose}-pack-editor`);
  if (!openBtn || !panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";

  let doc = { packs: [], activeId: "" };
  let activeId = "";
  let girls = [];
  let girlId = "";

  const setStatus = (msg, err = false) => {
    const el = P("status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!err);
  };
  const activePack = () => doc.packs.find((p) => p.id === activeId) || doc.packs[0] || null;

  const renderPacks = () => {
    const sel = P("pack");
    if (!sel) return;
    if (!doc.packs.some((p) => p.id === activeId) && doc.packs[0]) activeId = doc.packs[0].id;
    sel.innerHTML = doc.packs.length
      ? doc.packs.map((p) => `<option value="${esc(p.id)}"${p.id === activeId ? " selected" : ""}>${esc(p.name)}</option>`).join("")
      : `<option value="">（尚無圖組）</option>`;
  };
  const renderGirls = () => {
    const sel = P("girl");
    if (!sel) return;
    const live = hooks.getGirl?.();
    if (live?.id && !girls.some((g) => g.id === live.id)) girls = [live, ...girls];
    if (!girls.some((g) => g.id === girlId)) girlId = live?.id || girls[0]?.id || "";
    sel.innerHTML = girls.length
      ? girls.map((g) => `<option value="${esc(g.id)}"${g.id === girlId ? " selected" : ""}>${esc(g.name || g.id)}</option>`).join("")
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
    const flag = P("mode-flag");
    if (flag) {
      flag.textContent = ref ? "圖生圖（pose_ref）" : "文生圖";
      flag.className = "fg-mode-flag " + (ref ? "img" : "txt");
    }
    if (P("ref-flag")) P("ref-flag").textContent = ref ? "已掛 " + ref : "沒有參考圖 → 文生圖";
    const thumb = P("ref-thumb");
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
    if (P("name")) P("name").value = p?.name || "";
    if (P("pos")) P("pos").value = p?.prompt || "";
    if (P("neg")) P("neg").value = p?.negative || "";
    if (P("denoise")) P("denoise").value = String(p?.poseDenoise ?? 0.55);
    if (P("art")) {
      P("art").innerHTML = !p ? `<span class="mini">尚無圖組</span>`
        : p.url ? `<img src="${esc(p.url)}" alt="${esc(c.label)}">` : `<span class="mini">尚未產生</span>`;
    }
    updateRefFlag();
  };
  const collectForm = () => {
    const p = activePack();
    if (!p) return;
    p.name = String(P("name")?.value || p.name || c.packName).slice(0, 40);
    p.prompt = P("pos")?.value || "";
    p.negative = P("neg")?.value || "";
    p.poseDenoise = clampDenoise(P("denoise")?.value);
    p.updated = Date.now();
    doc.activeId = p.id;
    activeId = p.id;
  };
  const load = async () => {
    setStatus("讀取中…");
    try {
      doc = await loadSexPoseDoc(pose);
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
    } catch {
      girls = [];
    }
    renderGirls();
  };
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
  P("close")?.addEventListener("click", () => close());
  P("pack")?.addEventListener("change", () => {
    collectForm();
    activeId = P("pack").value;
    doc.activeId = activeId;
    renderForm();
  });
  P("girl")?.addEventListener("change", () => { girlId = P("girl").value; });
  P("new")?.addEventListener("click", () => {
    collectForm();
    const p = emptySexPosePack(pose, `${c.label} ${doc.packs.length + 1}`);
    doc.packs.push(p);
    activeId = p.id;
    doc.activeId = p.id;
    renderPacks();
    renderForm();
    setStatus("已新增（記得按儲存）");
  });
  P("del")?.addEventListener("click", () => {
    if (!doc.packs.length) return;
    if (doc.packs.length <= 1) {
      if (!confirm(`刪掉最後一組？刪掉後${c.label}就沒有圖。`)) return;
    } else if (!confirm("刪除這一組？")) return;
    collectForm();
    doc.packs = doc.packs.filter((p) => p.id !== activeId);
    activeId = doc.packs[0]?.id || "";
    doc.activeId = activeId;
    renderPacks();
    renderForm();
    setStatus("已刪除（記得按儲存）");
  });
  P("save")?.addEventListener("click", async () => {
    collectForm();
    try {
      doc = await saveSexPoseDoc(pose, doc);
      invalidateSexPoseCache(pose);
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(`✓ 已寫入 ${c.json}（${doc.packs.length} 組）`);
    } catch (e) {
      setStatus("儲存失敗：" + e.message, true);
    }
  });
  P("inject")?.addEventListener("click", () => {
    const g = currentGirl();
    if (P("pos")) P("pos").value = defaultSexPosePrompt(pose);
    if (P("neg") && !String(P("neg").value || "").trim()) P("neg").value = defaultSexPoseNegative(pose);
    collectForm();
    const ck = girlOwnCkpt(g);
    const bits = [
      g ? (g.name || g.id) : "（還沒選魅子）",
      ck ? `模型 ${shortCkptName(ck)}` : "模型（尚未綁定）",
      "全裸（garment=nude，不寫服裝）",
    ];
    setStatus(`✓ 已填姿勢預設。執行時會帶入：${bits.join(" · ")}`);
  });
  P("ref-up")?.addEventListener("click", () => P("ref-file")?.click());
  P("ref-file")?.addEventListener("change", async (e) => {
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
  P("ref-clear")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    p.ref = "";
    updateRefFlag();
    setStatus("已拿掉參考圖");
  });
  P("ref-apply")?.addEventListener("click", () => {
    const p = activePack();
    if (!p) return;
    const url = String(P("ref-url")?.value || "").trim();
    if (!url) {
      setStatus("先貼 URL", true);
      return;
    }
    p.ref = url;
    updateRefFlag();
    setStatus("✓ 已套用 URL");
  });
  P("gen")?.addEventListener("click", async () => {
    collectForm();
    const p = activePack();
    const g = currentGirl();
    if (!p) { setStatus("先新增一組", true); return; }
    if (!g) { setStatus("先選魅子或抽一隻進房", true); return; }
    const btn = P("gen");
    if (btn) btn.disabled = true;
    if (P("art")) P("art").innerHTML = `<span class="mini">生成中…</span>`;
    setStatus("排隊中…");
    try {
      const eng = (await hooks.getEngine?.()) || { imgProvider: "comfy", imgStyle: "pixel" };
      const r = await generateSexPosePackImage(pose, p, g, eng, { onTick: (sec) => setStatus(`生成中… ${sec}s`) });
      if (r.status === "done" && r.result) {
        const url = String(r.result);
        p.url = url;
        if (P("art")) P("art").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
        setStatus("✓ 測試生圖完成（記得按儲存）");
      } else {
        throw new Error(r.error || "生圖失敗");
      }
    } catch (e) {
      if (P("art")) P("art").innerHTML = `<span class="mini">失敗</span>`;
      setStatus(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  panel.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
}
