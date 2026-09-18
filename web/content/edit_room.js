/** 房事劇本編輯器 /edit_room — 只編 kind:"sex"，存檔合併回 script_packs.json。 */

import * as SM from "./script_mode.js";
import * as FramePack from "./frame_pack.js";

const $ = (id) => document.getElementById(id);

const state = {
  sexPacks: [],
  activeSexId: "",
  packId: "",
  scene: 1,
  framePacks: [],
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg, err = false) {
  const el = $("er-status");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!err);
}

async function apiJson(url, method, body) {
  const r = await fetch(url, {
    method: method || "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const d = j && j.detail;
    const msg = typeof d === "string"
      ? d
      : (Array.isArray(d) ? d.map((x) => x.msg || JSON.stringify(x)).join("；") : (d ? JSON.stringify(d) : j.error || ("HTTP " + r.status)));
    throw new Error(msg);
  }
  return j;
}

function sexList() {
  return state.sexPacks.filter((p) => p.kind === "sex");
}

function curPack() {
  return sexList().find((p) => p.id === state.packId) || null;
}

function curSpec() {
  return curPack()?.scenes?.[String(state.scene)] || null;
}

function ensurePack() {
  let p = curPack();
  if (p) return p;
  const list = sexList();
  p = list.find((x) => x.id === state.activeSexId) || list[0] || null;
  if (!p) {
    p = SM.emptyPack("sex");
    state.sexPacks.push(p);
  }
  state.packId = p.id;
  if (!state.activeSexId) state.activeSexId = p.id;
  if (!SM.kindScenes("sex").includes(state.scene)) state.scene = 1;
  return p;
}

function collect() {
  const p = ensurePack();
  p.name = $("er-name")?.value.trim() || p.name;
  p.kind = "sex";
  p.keywords = SM.parseKeywords($("er-keywords")?.value);
  p.pose = $("er-pose")?.value || "";
  p.framePackId = $("er-frame-pack")?.value || "";
  p.updated = Date.now();
  const spec = p.scenes[String(state.scene)];
  if (!spec) return p;
  spec.attitude = $("er-attitude")?.value || "";
  spec.imgMode = $("er-img-mode")?.value === "ref" ? "ref" : "prompt";
  const narr = [...document.querySelectorAll("[data-er-narr]")].map((el) => el.value);
  spec.narr = narr.length ? narr : [""];
  (spec.slots || []).forEach((slot, i) => {
    slot.prompt = $("er-prompt-" + i)?.value || "";
    slot.negative = $("er-neg-" + i)?.value || "";
    const urlEl = $("er-url-" + i);
    if (urlEl) slot.url = urlEl.value.trim();
  });
  return p;
}

function renderActiveLine() {
  const el = $("er-active-line");
  if (!el) return;
  const hit = sexList().find((p) => p.id === state.activeSexId);
  el.innerHTML = hit
    ? `目前啟用：<b>${esc(hit.name)}</b> <span class="active-badge">activeByKind.sex</span>`
    : "尚未設定啟用包（儲存時會自動指到第一份）。";
}

function renderPackSelect() {
  const sel = $("er-pack");
  if (!sel) return;
  const list = sexList();
  sel.innerHTML = list.map((p) => {
    const mark = p.id === state.activeSexId ? " ★" : "";
    return `<option value="${esc(p.id)}"${p.id === state.packId ? " selected" : ""}>${esc(p.name)}${mark}</option>`;
  }).join("") || `<option value="">（尚無）</option>`;
  const p = curPack();
  if ($("er-name")) $("er-name").value = p?.name || "";
  if ($("er-keywords")) $("er-keywords").value = (p?.keywords || []).join("、");
  renderBind();
  renderActiveLine();
}

function renderBind() {
  const p = curPack();
  const poseSel = $("er-pose");
  if (poseSel) {
    poseSel.innerHTML = `<option value="">（不指定）</option>` + (SM.SEX_POSES || []).map((x) =>
      `<option value="${esc(x.id)}"${p?.pose === x.id ? " selected" : ""}>${esc(x.label)}</option>`
    ).join("");
    if (p?.pose) poseSel.value = p.pose;
  }
  const fpSel = $("er-frame-pack");
  const pose = p?.pose || "";
  let list = state.framePacks || [];
  if (pose) list = list.filter((x) => !x.pose || x.pose === pose);
  const cur = p?.framePackId || "";
  if (cur && !list.some((x) => x.id === cur)) {
    const hit = (state.framePacks || []).find((x) => x.id === cur);
    if (hit) list = [hit, ...list];
  }
  if (fpSel) {
    fpSel.innerHTML = `<option value="">（不掛）</option>` + list.map((x) => {
      const lab = (SM.sexPose(x.pose)?.label || x.pose || "") + (x.pose ? " · " : "") + (x.name || x.id);
      return `<option value="${esc(x.id)}"${x.id === cur ? " selected" : ""}>${esc(lab)}</option>`;
    }).join("");
    fpSel.value = cur;
  }
  const pack = (state.framePacks || []).find((x) => x.id === cur) || null;
  const preview = $("er-frame-pack-preview");
  if (!preview) return;
  if (!pack) {
    preview.innerHTML = "";
    return;
  }
  const urls = FramePack.packFrameUrls(pack);
  const thumbs = urls.map((u, i) => u
    ? `<img src="${esc(u)}" alt="${i + 1}">`
    : `<span>${i + 1}</span>`
  ).join("");
  preview.innerHTML = `<div class="thumbs">${thumbs}</div>
    <div class="mini" style="margin-top:.35em">${esc(pack.name || pack.id)} · 已掛，圖生圖／按肏動畫用這組</div>`;
}

function boundFramePack() {
  const id = SM.boundFramePackId(curPack(), curSpec());
  return (state.framePacks || []).find((x) => x.id === id) || null;
}

function refFlag(slot, i) {
  if (slot?.ref) return "已掛 " + slot.ref;
  const pack = boundFramePack();
  if (pack) {
    const url = FramePack.packFrameUrl(pack, i + 1);
    return url
      ? `圖生圖會掛圖組「${pack.name || pack.id}」第 ${i + 1} 張`
      : "沒有參考圖（圖組缺這一幀）";
  }
  return "沒有參考圖";
}

function slotHtml(slot, i, n) {
  const art = slot.url
    ? `<img src="${esc(slot.url)}" alt="圖${i + 1}">`
    : `<span class="mini">尚未產生／未填 URL</span>`;
  return `<div class="sm-slot">
    <h3>圖 ${i + 1}${n === 1 ? "（本景一張）" : "（本景最多兩張）"}</h3>
    <div class="art" id="er-art-${i}">${art}</div>
    <label>正向 prompt（手寫，會進這張生圖）</label>
    <textarea id="er-prompt-${i}" placeholder="英文 tags">${esc(slot.prompt)}</textarea>
    <label>負向 prompt</label>
    <textarea id="er-neg-${i}" style="min-height:3em" placeholder="ugly, extra fingers…">${esc(slot.negative)}</textarea>
    <label>已產生圖 URL（可手貼 /assets/…）</label>
    <input id="er-url-${i}" value="${esc(slot.url || "")}" placeholder="/assets/…">
    <div class="mini" style="margin:.35em 0">參考圖（圖生圖用；JPG／PNG）。已掛圖組時，沒上傳就用圖組第 ${i + 1} 張。</div>
    <div class="row">
      <input id="er-ref-file-${i}" type="file" accept="image/*" style="flex:1 1 12em">
      <button type="button" data-er-ref-pick="${i}">上傳參考圖</button>
      <button class="del" type="button" data-er-ref-clear="${i}">拿掉</button>
    </div>
    <div class="mini" id="er-ref-flag-${i}">${esc(refFlag(slot, i))}</div>
  </div>`;
}

function renderTabs() {
  const box = $("er-scene-tabs");
  if (!box) return;
  const nums = SM.kindScenes("sex");
  box.innerHTML = nums.map((n) =>
    `<button type="button" class="${n === state.scene ? "on" : ""}" data-er-scene="${n}">${esc(SM.SCENE_ZH[n] || ("場景" + n))}</button>`
  ).join("");
  const blurb = $("er-scene-blurb");
  if (blurb) blurb.textContent = SM.SCENE_BLURB[state.scene] || "";
}

function renderScene() {
  const box = $("er-scene");
  const spec = curSpec();
  if (!box || !spec) return;
  const n = state.scene;
  const narrHtml = (spec.narr || [""]).map((line, i) => `
    <div class="sm-narr">
      <label>旁白 ${i + 1}（可寫 [name]）</label>
      <textarea data-er-narr placeholder="例：你抓住 [name] 的腰，往裡頂。">${esc(line)}</textarea>
      <button class="del" type="button" data-er-del-narr="${i}">刪這句</button>
    </div>`).join("");
  box.innerHTML = `
    <div class="mini">旁白／態度可用 ${esc(SM.bindHint())}。上線時換成當下妹子。</div>
    <label>這一景 AI 女子態度</label>
    <textarea id="er-attitude" style="min-height:4.5em">${esc(spec.attitude)}</textarea>
    <div class="row" style="margin-top:.45em">
      <span class="fix0"><label>生圖方式</label>
        <select id="er-img-mode">
          <option value="prompt"${spec.imgMode !== "ref" ? " selected" : ""}>直接 prompt</option>
          <option value="ref"${spec.imgMode === "ref" ? " selected" : ""}>圖生圖（參考圖）</option>
        </select></span>
      <button type="button" id="er-add-narr">＋旁白</button>
    </div>
    ${narrHtml}
    ${(spec.slots || []).map((slot, i) => slotHtml(slot, i, n)).join("")}
  `;
  (spec.slots || []).forEach((_, i) => {
    $("er-ref-file-" + i)?.addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) void refUpload(i, f);
    });
  });
}

function renderAll() {
  ensurePack();
  renderPackSelect();
  renderTabs();
  renderScene();
}

async function refUpload(i, file) {
  setStatus("上傳參考圖…");
  const fd = new FormData();
  fd.append("file", file, file.name || "pose.png");
  try {
    const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) {
      const d = data && data.detail;
      throw new Error(typeof d === "string" ? d : (data.error || ("HTTP " + r.status)));
    }
    collect();
    const spec = curSpec();
    if (spec?.slots[i]) spec.slots[i].ref = data.url || "";
    spec.imgMode = "ref";
    renderScene();
    setStatus("✓ 參考圖已掛上");
  } catch (err) {
    setStatus("上傳失敗：" + err.message, true);
  }
}

/** 合併存檔：重讀遠端完整 document，只替換 sex packs 與 activeByKind.sex。 */
async function saveMerged() {
  collect();
  const sexPacks = sexList().map((p) => SM.normalizePack({ ...p, kind: "sex" }));
  if (!sexPacks.length) {
    setStatus("至少需要一份做愛劇本才能儲存", true);
    return;
  }
  let activeSex = state.activeSexId;
  if (!sexPacks.some((p) => p.id === activeSex)) activeSex = sexPacks[0].id;
  state.activeSexId = activeSex;

  setStatus("儲存中…");
  try {
    const remote = await apiJson("/api/script-packs");
    const base = SM.normalizeData(remote);
    const others = base.packs.filter((p) => p.kind !== "sex");
    const merged = SM.normalizeData({
      packs: [...others, ...sexPacks],
      activeByKind: {
        ...base.activeByKind,
        sex: activeSex,
      },
    });
    await apiJson("/api/script-packs", "PUT", merged);
    state.sexPacks = merged.packs.filter((p) => p.kind === "sex");
    state.activeSexId = merged.activeByKind.sex || activeSex;
    if (!state.sexPacks.some((p) => p.id === state.packId)) {
      state.packId = state.activeSexId || state.sexPacks[0]?.id || "";
    }
    renderAll();
    setStatus(`✓ 已存 ${state.sexPacks.length} 份做愛劇本（合併保留 ${others.length} 份調戲／口交）`);
  } catch (err) {
    setStatus("儲存失敗：" + err.message, true);
  }
}

async function loadAll() {
  setStatus("載入中…");
  try {
    const j = await apiJson("/api/script-packs");
    const data = SM.normalizeData(j);
    state.sexPacks = data.packs.filter((p) => p.kind === "sex");
    state.activeSexId = data.activeByKind.sex || state.sexPacks[0]?.id || "";
    state.packId = state.activeSexId || state.sexPacks[0]?.id || "";
    state.scene = 1;
    if (!state.sexPacks.length) {
      const p = SM.emptyPack("sex");
      state.sexPacks.push(p);
      state.packId = p.id;
      state.activeSexId = p.id;
    }
  } catch (err) {
    state.sexPacks = [SM.emptyPack("sex")];
    state.packId = state.sexPacks[0].id;
    state.activeSexId = state.packId;
    setStatus("載入失敗，已開空白包：" + err.message, true);
    try { state.framePacks = await FramePack.listPacks(); } catch { state.framePacks = []; }
    renderAll();
    return;
  }
  try {
    state.framePacks = await FramePack.listPacks();
  } catch {
    state.framePacks = [];
  }
  renderAll();
  setStatus(`已載入 ${state.sexPacks.length} 份做愛劇本`);
}

function newPack() {
  collect();
  const p = SM.emptyPack("sex", "做愛劇本");
  state.sexPacks.push(p);
  state.packId = p.id;
  state.scene = 1;
  renderAll();
  setStatus("已新增空白做愛劇本，記得儲存");
}

function delPack() {
  const p = curPack();
  if (!p) return;
  if (!confirm(`刪除做愛劇本「${p.name}」？`)) return;
  state.sexPacks = state.sexPacks.filter((x) => x.id !== p.id);
  if (state.activeSexId === p.id) state.activeSexId = state.sexPacks[0]?.id || "";
  state.packId = "";
  ensurePack();
  renderAll();
  setStatus("已從列表拿掉（按儲存才寫盤）");
}

function setActive() {
  collect();
  const p = curPack();
  if (!p) return;
  state.activeSexId = p.id;
  renderPackSelect();
  setStatus(`已標記「${p.name}」為啟用（按儲存寫盤）`);
}

function goPack() {
  collect();
  state.packId = $("er-pack")?.value || "";
  state.scene = 1;
  renderAll();
}

function goScene(n) {
  collect();
  state.scene = Number(n) || 1;
  renderAll();
}

function addNarr() {
  collect();
  curSpec()?.narr.push("");
  renderScene();
}

function delNarr(i) {
  collect();
  const spec = curSpec();
  if (!spec) return;
  spec.narr.splice(i, 1);
  if (!spec.narr.length) spec.narr.push("");
  renderScene();
}

function wire() {
  const hint = $("bind-hint");
  if (hint) hint.textContent = "可用標註：" + SM.bindHint();
  $("er-pack")?.addEventListener("change", goPack);
  $("er-pose")?.addEventListener("change", () => { collect(); renderBind(); });
  $("er-frame-pack")?.addEventListener("change", () => { collect(); renderBind(); });
  $("er-save")?.addEventListener("click", () => void saveMerged());
  $("er-reload")?.addEventListener("click", () => void loadAll());
  $("er-new")?.addEventListener("click", newPack);
  $("er-del")?.addEventListener("click", delPack);
  $("er-set-active")?.addEventListener("click", setActive);

  document.addEventListener("click", (e) => {
    const t = e.target;
    if (!(t instanceof HTMLElement)) return;
    const scene = t.getAttribute("data-er-scene");
    if (scene) { goScene(scene); return; }
    if (t.id === "er-add-narr") { addNarr(); return; }
    const delN = t.getAttribute("data-er-del-narr");
    if (delN != null) { delNarr(Number(delN)); return; }
    const pick = t.getAttribute("data-er-ref-pick");
    if (pick != null) { $("er-ref-file-" + pick)?.click(); return; }
    const clear = t.getAttribute("data-er-ref-clear");
    if (clear != null) {
      collect();
      const spec = curSpec();
      const i = Number(clear);
      if (spec?.slots[i]) spec.slots[i].ref = "";
      renderScene();
    }
  });
}

wire();
void loadAll();
