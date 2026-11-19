/* Wife Pay 編輯頁 v4：劇本可存多種隨機抽；抽妹子只擲參數。 */
import { loadPools, generateGirl, RARITY_MARK, PERSONALITY_NAMES } from "./girl_gen.js";
import { familyOf } from "./girl_voice.js?v=1";
import {
  apiJson, fetchGallery, fetchDialog, fetchScripts, generateFromItem, mountWifepayReveal, startWifepayPeek,
} from "./wifepay_reveal.js?v=3";

const $ = (id) => document.getElementById(id);
const ENG_KEY = "yorozuya_eng";

let girls = [];
let currentGirl = null;
let items = [];
let selectedId = "";
let scripts = [];
let selectedScriptId = "";

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function shortCkpt(n) {
  const s = String(n || "").trim();
  if (!s) return "";
  const base = s.split(/[\\/]/).pop() || s;
  return base.replace(/\.(safetensors|ckpt|pt)$/i, "");
}

function setStatus(id, msg, err = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!err);
}

function girlMode() {
  return document.querySelector('input[name="girl-mode"]:checked')?.value || "saved";
}

function lookSummary(g) {
  const L = g?.look || {};
  const bits = [
    L.age != null ? `${L.age}歲` : "",
    L.hair_color || L.hairColor,
    L.hair,
    L.cup || L.bust,
    L.build || L.body,
  ].filter(Boolean);
  return bits.join(" · ") || "（無外觀摘要）";
}

function isRolledGirl(g) {
  return !!(g && (g.rolled || String(g.id || "").startsWith("wifepay-")));
}

function clampAge(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 18;
  return Math.max(18, Math.min(45, Math.round(n)));
}

function fillArchSelect() {
  const sel = $("p-arch");
  if (!sel || sel.options.length) return;
  for (const name of PERSONALITY_NAMES) {
    const opt = document.createElement("option");
    opt.value = name;
    opt.textContent = name;
    sel.appendChild(opt);
  }
}

function fillParams(g) {
  fillArchSelect();
  const L = g?.look || {};
  if ($("p-name")) $("p-name").value = g?.name || "";
  if ($("p-arch")) $("p-arch").value = g?.archetype || (g?.personality && g.personality[0]) || "文靜溫柔";
  if ($("p-stage")) $("p-stage").value = g?.roomStage || g?.stage || "wife";
  if ($("p-age")) $("p-age").value = clampAge(L.age);
  if ($("p-hair")) $("p-hair").value = L.hair || "";
  if ($("p-hair-color")) $("p-hair-color").value = L.hair_color || L.hairColor || "";
  if ($("p-build")) $("p-build").value = L.build || L.body || "";
  if ($("p-cup")) $("p-cup").value = L.cup || "";
  if ($("p-breast-shape")) $("p-breast-shape").value = L.breast_shape || "";
  if ($("p-face")) $("p-face").value = L.face || "";
  if ($("p-eyes")) $("p-eyes").value = L.eyes || "";
  if ($("p-eye-color")) $("p-eye-color").value = L.eye_color || "";
  if ($("p-mouth")) $("p-mouth").value = L.mouth || "";
  if ($("p-feature")) $("p-feature").value = L.feature || "";
  $("girl-params")?.classList.toggle("on", !!g);
}

function applyParams() {
  if (!currentGirl) return;
  const g = currentGirl;
  g.look = g.look && typeof g.look === "object" ? g.look : {};
  const L = g.look;
  g.name = ($("p-name")?.value || "").trim() || g.name || "她";
  g.archetype = $("p-arch")?.value || g.archetype || "文靜溫柔";
  g.personality = [g.archetype];
  g.family = familyOf(g);
  const stage = $("p-stage")?.value || "wife";
  g.roomStage = stage;
  g.stage = stage;
  L.age = clampAge($("p-age")?.value);
  L.hair = ($("p-hair")?.value || "").trim();
  L.hair_color = ($("p-hair-color")?.value || "").trim();
  L.build = ($("p-build")?.value || "").trim();
  L.body = L.build;
  L.cup = ($("p-cup")?.value || "").trim();
  L.breast_shape = ($("p-breast-shape")?.value || "").trim();
  L.bust = [L.cup, L.breast_shape].filter(Boolean).join("、");
  L.face = ($("p-face")?.value || "").trim();
  L.eyes = ($("p-eyes")?.value || "").trim();
  L.eye_color = ($("p-eye-color")?.value || "").trim();
  L.mouth = ($("p-mouth")?.value || "").trim();
  L.feature = ($("p-feature")?.value || "").trim();
}

function renderGirlCard() {
  const meta = $("girl-meta");
  const port = $("girl-port");
  if (!currentGirl) {
    meta.innerHTML = `<span class="mini">尚未選擇魅子</span>`;
    port.style.display = "none";
    port.removeAttribute("src");
    fillParams(null);
    return;
  }
  const g = currentGirl;
  const mark = RARITY_MARK[g.rarity] || "";
  const ckpt = shortCkpt(g.comfyCkpt);
  const rolled = isRolledGirl(g);
  meta.innerHTML = rolled
    ? `<div><b>${esc(g.name || "？")}</b> ${esc(mark)} ${esc(g.rarity || "")}
        <span class="mini">· 只擲參數，不產立繪</span></div>
      <div class="mini" style="margin:.25em 0 0">${esc(lookSummary(g))} · 個性家族 ${esc(g.family || familyOf(g))}</div>`
    : `<div><b>${esc(g.name || "？")}</b> ${esc(mark)} ${esc(g.rarity || "")}
        <span class="mini">· ${esc(g.id || "（暫無 id）")}</span></div>
      <div class="mini" style="margin:.25em 0 0">${esc(lookSummary(g))}</div>
      <div class="mini">comfyCkpt · ${ckpt ? esc(ckpt) : "（尚未綁定）"}</div>`;
  // 暫抽的妹子沒有立繪，不要去打 /assets/portraits（也不觸發任何生圖）
  if (!rolled && g.id) {
    port.style.display = "block";
    port.onerror = () => { port.style.display = "none"; };
    port.src = `/assets/portraits/${encodeURIComponent(g.id)}_half.png?t=${Date.now()}`;
  } else {
    port.style.display = "none";
    port.removeAttribute("src");
  }
  fillParams(g);
  const prefer = String(g.comfyCkpt || "").trim();
  const sel = $("ig-ckpt");
  if (sel && prefer) {
    if (![...sel.options].some((o) => o.value === prefer)) {
      const opt = document.createElement("option");
      opt.value = prefer;
      opt.textContent = shortCkpt(prefer) || prefer;
      sel.appendChild(opt);
    }
    sel.value = prefer;
  }
}

function renderGirlSelect() {
  const sel = $("girl-sel");
  if (!sel) return;
  if (!girls.length) {
    sel.innerHTML = `<option value="">（存檔沒有魅子）</option>`;
    return;
  }
  const curId = currentGirl?.id || "";
  sel.innerHTML = girls.map((g) => {
    const mark = RARITY_MARK[g.rarity] || "";
    const label = `${g.name || g.id} ${mark}${g.rarity || ""}`;
    return `<option value="${esc(g.id)}"${g.id === curId ? " selected" : ""}>${esc(label)}</option>`;
  }).join("");
}

function updateModeUi() {
  const draw = girlMode() === "draw";
  $("saved-row").style.display = draw ? "none" : "";
  $("draw-row").style.display = draw ? "" : "none";
}

async function loadGirls() {
  try {
    const r = await fetch("/api/save", { cache: "no-store" });
    const j = await r.json();
    girls = (j?.data?.succubi || []).filter((g) => g && g.id && !g.taken);
    renderGirlSelect();
    if (girlMode() === "saved") {
      const id = $("girl-sel")?.value;
      currentGirl = girls.find((g) => g.id === id) || girls[0] || null;
      renderGirlCard();
    }
  } catch (e) {
    $("girl-sel").innerHTML = `<option value="">讀名冊失敗</option>`;
    setStatus("gen-status", e.message, true);
  }
}

function selectedItem() {
  return items.find((x) => x.id === selectedId) || null;
}

function fillItemForm(it) {
  $("item-prompt").value = it?.prompt || "";
  $("item-neg").value = it?.negative || "";
  $("item-denoise").value = it?.denoise ?? 0.55;
  $("item-tags").value = (it?.tags || []).join(", ");
}

function renderThumbs() {
  const box = $("gal-thumbs");
  if (!items.length) {
    box.innerHTML = `<span class="mini">（尚無圖，請先上傳底圖）</span>`;
    return;
  }
  box.innerHTML = "";
  for (const it of items) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = it.id === selectedId ? "sel" : "";
    btn.title = it.id;
    btn.innerHTML = `<img src="${esc(it.url)}" alt="">`;
    btn.onclick = () => {
      selectedId = it.id;
      fillItemForm(it);
      renderThumbs();
    };
    box.appendChild(btn);
  }
}

async function reloadGallery(preferId) {
  items = await fetchGallery();
  if (preferId && items.some((x) => x.id === preferId)) selectedId = preferId;
  else if (!items.some((x) => x.id === selectedId)) selectedId = items[0]?.id || "";
  fillItemForm(selectedItem());
  renderThumbs();
}

async function uploadGallery() {
  const file = $("gal-file")?.files?.[0];
  if (!file) { setStatus("gen-status", "先選一張圖", true); return; }
  setStatus("gen-status", "上傳中…");
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/wifepay/gallery", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || "上傳失敗");
  $("gal-file").value = "";
  await reloadGallery(j.item?.id);
  setStatus("gen-status", "✓ 已上傳");
}

async function saveItem() {
  const it = selectedItem();
  if (!it) throw new Error("先選一張圖");
  const tags = $("item-tags").value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  const j = await apiJson(`/api/wifepay/gallery/${encodeURIComponent(it.id)}`, "PATCH", {
    prompt: $("item-prompt").value,
    negative: $("item-neg").value,
    denoise: Number($("item-denoise").value || 0.55),
    tags,
  });
  await reloadGallery(j.item?.id || it.id);
  setStatus("gen-status", "✓ 已儲存這張");
}

async function deleteItem() {
  const it = selectedItem();
  if (!it) throw new Error("先選一張圖");
  if (!confirm("刪除這張底圖？")) return;
  await apiJson(`/api/wifepay/gallery/${encodeURIComponent(it.id)}`, "DELETE");
  selectedId = "";
  await reloadGallery();
  setStatus("gen-status", "✓ 已刪除");
}

function fillCkptSelect(names, preferred) {
  const sel = $("ig-ckpt");
  if (!sel) return;
  const cur = preferred || sel.value;
  sel.innerHTML = `<option value="">（自動／魅子綁定／第一個）</option>`;
  for (const n of names) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = shortCkpt(n) || n;
    sel.appendChild(opt);
  }
  const prefer = cur || String(currentGirl?.comfyCkpt || "").trim();
  if (prefer && names.includes(prefer)) sel.value = prefer;
}

async function pingEngine() {
  setStatus("ig-eng-status", "測試 Comfy…");
  try {
    const url = $("ig-comfy").value.trim();
    const q = url ? `?url=${encodeURIComponent(url)}` : "";
    const st = await apiJson("/api/comfy/status" + q);
    const ckpts = st?.models?.checkpoints || st?.checkpoints || [];
    const names = (Array.isArray(ckpts) ? ckpts : []).map((x) => typeof x === "string" ? x : x.name || x);
    fillCkptSelect(names, $("ig-ckpt")?.value || currentGirl?.comfyCkpt || "");
    const ok = st?.ok !== false && st?.reachable !== false;
    setStatus("ig-eng-status", ok
      ? `✓ Comfy 通 · checkpoint ${names.length} 個${st?.device ? " · " + st.device : ""}`
      : `Comfy 異常：${st?.error || st?.message || "連不上"}`, !ok);
  } catch (e) {
    setStatus("ig-eng-status", e.message, true);
  }
}

function genInfo() {
  applyParams();
  const over = $("ig-denoise").value;
  return {
    character: currentGirl,
    name: currentGirl?.name || "",
    pose: $("ig-pose").value,
    build: $("ig-build").value,
    stage: currentGirl?.roomStage || currentGirl?.stage || "wife",
    family: currentGirl?.family || (currentGirl ? familyOf(currentGirl) : ""),
    ckpt: $("ig-ckpt").value || currentGirl?.comfyCkpt || "",
    comfy_url: $("ig-comfy").value.trim(),
    seed: Number($("ig-seed").value || 0),
    denoise: over === "" ? undefined : Number(over),
    script_id: $("ig-script")?.value || "random",
  };
}

async function previewPrompt() {
  const it = selectedItem();
  if (!currentGirl) { setStatus("gen-status", "先選或抽一隻魅子", true); return; }
  if (!it) { setStatus("gen-status", "先選一張底圖", true); return; }
  const info = genInfo();
  const body = {
    provider: "comfy",
    character: currentGirl,
    name: currentGirl.name || "",
    rating: "nsfw",
    style: "anime",
    framing: "full",
    extra: $("item-prompt").value.trim(),
    negative: $("item-neg").value.trim(),
    prompt: "",
    scene_kind: "wifepay",
    lock_identity: true,
  };
  try {
    const j = await apiJson("/api/imggen/preview", "POST", body);
    const pos = String(j.trace?.comfy_prompt || j.prompt || "").trim();
    const neg = String(j.trace?.comfy_negative || j.negative || "").trim();
    $("prompt-sheet").textContent = [
      "【底圖】" + it.url,
      "【模板】" + ($("item-prompt").value.trim() || "（空）"),
      "",
      "【合併後正向（人設 + 模板；送生圖時 extra）】",
      pos || "（空，變數會在伺服器展開）",
      "",
      "【負向】",
      neg || $("item-neg").value.trim() || "（空）",
      "",
      `體位 ${info.pose} · 客人 ${info.build} · denoise ${overDenoise(it)}`,
    ].join("\n");
    setStatus("gen-status", "✓ 已預覽");
  } catch (e) {
    $("prompt-sheet").textContent = "失敗：" + e.message;
    setStatus("gen-status", e.message, true);
  }
}

function overDenoise(it) {
  const over = $("ig-denoise").value;
  return over === "" ? (it?.denoise ?? 0.55) : Number(over);
}

function currentScript() {
  return scripts.find((s) => s.id === selectedScriptId) || scripts[0] || null;
}

function renderScriptSelects() {
  const edit = $("script-sel");
  const test = $("ig-script");
  const editVal = selectedScriptId || currentScript()?.id || "";
  const testVal = test?.value || "random";
  if (edit) {
    edit.innerHTML = scripts.map((s) => {
      const off = s.enabled === false ? "（停用）" : "";
      return `<option value="${esc(s.id)}"${s.id === editVal ? " selected" : ""}>${esc(s.name || s.id)}${off}</option>`;
    }).join("") || '<option value="">（尚無劇本）</option>';
  }
  if (test) {
    const opts = ['<option value="random">隨機</option>'].concat(scripts.map((s) => {
      const off = s.enabled === false ? "（停用）" : "";
      return `<option value="${esc(s.id)}">${esc(s.name || s.id)}${off}</option>`;
    }));
    test.innerHTML = opts.join("");
    test.value = scripts.some((s) => s.id === testVal) ? testVal : "random";
  }
}

function fillScriptForm(row) {
  const s = row || currentScript() || {};
  selectedScriptId = s.id || "";
  if ($("script-sel") && s.id) $("script-sel").value = s.id;
  if ($("script-enabled")) $("script-enabled").checked = s.enabled !== false;
  if ($("script-name")) $("script-name").value = s.name || "";
  if ($("script-tags")) $("script-tags").value = Array.isArray(s.tags) ? s.tags.join(", ") : (s.tags || "");
  if ($("script-scenario")) $("script-scenario").value = s.scenario || "";
  const fb = s.fallback || {};
  if ($("script-fb-nar")) $("script-fb-nar").value = fb.narration || "";
  if ($("script-fb-man")) $("script-fb-man").value = fb.man || "";
  if ($("script-fb-wife")) $("script-fb-wife").value = fb.wife || "";
  if ($("dlg-sys")) $("dlg-sys").value = s.system || "";
  if ($("dlg-user")) $("dlg-user").value = s.user || "";
}

function gatherScriptFields() {
  const fbNar = $("script-fb-nar")?.value.trim() || "";
  const fbMan = $("script-fb-man")?.value.trim() || "";
  const fbWife = $("script-fb-wife")?.value.trim() || "";
  return {
    name: $("script-name")?.value.trim() || "未命名劇本",
    enabled: !!$("script-enabled")?.checked,
    tags: $("script-tags")?.value || "",
    scenario: $("script-scenario")?.value || "",
    system: $("dlg-sys")?.value || "",
    user: $("dlg-user")?.value || "",
    fallback: (fbNar || fbMan || fbWife) ? { narration: fbNar, man: fbMan, wife: fbWife } : null,
  };
}

async function loadScriptsList() {
  scripts = await fetchScripts();
  if (!scripts.some((s) => s.id === selectedScriptId)) selectedScriptId = scripts[0]?.id || "";
  renderScriptSelects();
  fillScriptForm(currentScript());
}

async function saveCurrentScript() {
  const cur = currentScript();
  if (!cur) throw new Error("沒有劇本可儲存");
  const j = await apiJson(`/api/wifepay/scripts/${encodeURIComponent(cur.id)}`, "PATCH", gatherScriptFields());
  scripts = j.scripts || scripts;
  selectedScriptId = (j.script || cur).id;
  renderScriptSelects();
  fillScriptForm(j.script || currentScript());
  setStatus("gen-status", "✓ 已儲存劇本");
}

async function addNewScript() {
  const j = await apiJson("/api/wifepay/scripts", "POST", { name: "新劇本", scenario: "", enabled: true });
  scripts = j.scripts || scripts;
  selectedScriptId = (j.script || scripts[scripts.length - 1]).id;
  renderScriptSelects();
  fillScriptForm(j.script || currentScript());
  setStatus("gen-status", "✓ 已新增劇本，編輯後請再按儲存");
}

async function deleteCurrentScript() {
  const cur = currentScript();
  if (!cur) throw new Error("沒有劇本可刪");
  if (!confirm(`刪除劇本「${cur.name}」？`)) return;
  const j = await apiJson(`/api/wifepay/scripts/${encodeURIComponent(cur.id)}`, "DELETE");
  scripts = j.scripts || [];
  selectedScriptId = scripts[0]?.id || "";
  renderScriptSelects();
  fillScriptForm(currentScript());
  setStatus("gen-status", "✓ 已刪除劇本");
}

function revealHost() {
  const host = $("reveal-host");
  host.innerHTML = "";
  return host;
}

async function testDialog() {
  if (!currentGirl) { setStatus("gen-status", "先選或抽一隻魅子", true); return; }
  const info = genInfo();
  info.script_id = selectedScriptId || info.script_id || "random";
  setStatus("gen-status", "產生對話…");
  mountWifepayReveal(revealHost(), {
    page: true,
    wifeName: info.name,
    guestName: info.guestName,
    dialog: async () => {
      const row = await fetchDialog(info);
      const who = row.script_name ? `／劇本「${row.script_name}」` : "";
      setStatus("gen-status", (row.ai ? "✓ 模型寫的對話" : "✓ 用本地後備（模型沒寫好）") + who);
      return row;
    },
    images: [],
  });
}

async function testOneImage() {
  if (!currentGirl) { setStatus("gen-status", "先選或抽一隻魅子", true); return; }
  const it = selectedItem();
  if (!it) { setStatus("gen-status", "先選一張底圖。圖庫是空的就請先上傳，不會改走文生圖。", true); return; }
  setStatus("gen-status", "生圖中…");
  const host = revealHost();
  try {
    const url = await generateFromItem(it, { ...genInfo(), prompt: $("item-prompt").value, negative: $("item-neg").value }, (sec) => {
      setStatus("gen-status", `生圖中… ${sec}s`);
    });
    const info = genInfo();
    mountWifepayReveal(host, {
      page: true,
      waitText: "圖好了",
      wifeName: info.name,
      guestName: info.guestName,
      dialog: { narration: "（單張測試，沒有對話）", man: "—", wife: "—" },
      images: [url],
    });
    setStatus("gen-status", "✓ 單張測試完成");
  } catch (e) {
    setStatus("gen-status", e.message || "生圖失敗（只留對話）", true);
  }
}

async function testAll() {
  if (!currentGirl) { setStatus("gen-status", "先選或抽一隻魅子", true); return; }
  if (!items.length) {
    setStatus("gen-status", "圖庫是空的。請先上傳底圖（不會改走文生圖）。", true);
    startWifepayPeek(revealHost(), { ...genInfo(), page: true, onStatus: (m) => setStatus("gen-status", m) });
    return;
  }
  setStatus("gen-status", "全部一起測試…");
  startWifepayPeek(revealHost(), {
    ...genInfo(),
    page: true,
    onStatus: (m) => setStatus("gen-status", m),
  });
}

async function drawGirl() {
  setStatus("gen-status", "擲參數…");
  try {
    await loadPools();
    const used = girls.map((g) => g.name).filter(Boolean);
    if (currentGirl?.name) used.push(currentGirl.name);
    const g = generateGirl({ luck: 50, rating: "nsfw", usedNames: used });
    if (!g) throw new Error("擲參數失敗（人物池未載入？）");
    // 只留測試用的人設參數：不產立繪、不寫存檔、不叫 Comfy／模型
    g.id = `wifepay-${Date.now().toString(36)}`;
    g.rolled = true;
    g.roomStage = "wife";
    g.stage = "wife";
    g.family = familyOf(g);
    delete g.comfyCkpt;
    currentGirl = g;
    const radio = document.querySelector('input[name="girl-mode"][value="draw"]');
    if (radio) radio.checked = true;
    updateModeUi();
    renderGirlCard();
    setStatus("gen-status", `✓ 已擲參數：${g.name} ${RARITY_MARK[g.rarity] || ""}（可直接改，或再抽一次）`);
  } catch (e) {
    setStatus("gen-status", e.message, true);
  }
}

async function loadEngDefaults() {
  let e = { comfyUrl: "" };
  try { e = { ...e, ...JSON.parse(localStorage.getItem(ENG_KEY) || "{}") }; } catch { /* */ }
  try {
    const r = await fetch("/api/save", { cache: "no-store" });
    const j = await r.json();
    if (j?.data?.settings?.comfyUrl) e.comfyUrl = j.data.settings.comfyUrl;
  } catch { /* */ }
  if (e.comfyUrl) $("ig-comfy").value = e.comfyUrl;
}

function bind() {
  document.querySelectorAll('input[name="girl-mode"]').forEach((el) => {
    el.addEventListener("change", () => {
      updateModeUi();
      if (girlMode() === "saved") {
        const id = $("girl-sel")?.value;
        currentGirl = girls.find((g) => g.id === id) || girls[0] || null;
        renderGirlCard();
      }
    });
  });
  $("girl-sel")?.addEventListener("change", () => {
    currentGirl = girls.find((g) => g.id === $("girl-sel").value) || null;
    renderGirlCard();
  });
  $("btn-reload-girls")?.addEventListener("click", () => loadGirls());
  $("btn-draw")?.addEventListener("click", () => drawGirl());
  $("btn-reroll")?.addEventListener("click", () => drawGirl());
  $("girl-params")?.querySelectorAll("input,select").forEach((el) => {
    el.addEventListener("change", () => {
      applyParams();
      // 只更新摘要，不要 fillParams 以免把游標打回去
      const g = currentGirl;
      if (!g) return;
      const meta = $("girl-meta");
      if (!meta) return;
      const mark = RARITY_MARK[g.rarity] || "";
      if (isRolledGirl(g)) {
        meta.innerHTML = `<div><b>${esc(g.name || "？")}</b> ${esc(mark)} ${esc(g.rarity || "")}
          <span class="mini">· 只擲參數，不產立繪</span></div>
        <div class="mini" style="margin:.25em 0 0">${esc(lookSummary(g))} · 個性家族 ${esc(g.family || "")}</div>`;
      }
    });
  });
  $("btn-gal-up")?.addEventListener("click", () => uploadGallery().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-gal-del")?.addEventListener("click", () => deleteItem().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-item-save")?.addEventListener("click", () => saveItem().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-ig-ping")?.addEventListener("click", () => pingEngine());
  $("btn-preview-prompt")?.addEventListener("click", () => previewPrompt());
  $("btn-script-save")?.addEventListener("click", () => saveCurrentScript().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-script-add")?.addEventListener("click", () => addNewScript().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-script-del")?.addEventListener("click", () => deleteCurrentScript().catch((e) => setStatus("gen-status", e.message, true)));
  $("script-sel")?.addEventListener("change", () => {
    selectedScriptId = $("script-sel").value;
    fillScriptForm(currentScript());
  });
  $("btn-dlg-test")?.addEventListener("click", () => testDialog());
  $("btn-test-img")?.addEventListener("click", () => testOneImage());
  $("btn-test-all")?.addEventListener("click", () => testAll());
}

bind();
updateModeUi();
Promise.all([loadGirls(), reloadGallery().catch((e) => setStatus("gen-status", e.message, true)), loadScriptsList().catch((e) => setStatus("gen-status", e.message, true)), loadEngDefaults()]).then(() => {
  setStatus("gen-status", items.length ? `圖庫 ${items.length} 張` : "圖庫是空的，請先上傳底圖");
});
