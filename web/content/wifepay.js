/* Wife Pay 編輯頁 v10：每姿勢最多兩張、隨機 1～2 張；隔門聽不清；步驟精靈。 */
import { loadPools, generateGirl, RARITY_MARK, PERSONALITY_NAMES } from "./girl_gen.js";
import { familyOf } from "./girl_voice.js?v=1";
import {
  apiJson, fetchGalleryDoc, fetchDialog, fetchScripts, generateFromItem, mountWifepayReveal, startWifepayPeek,
  fetchConfig, saveConfig, pickPeek, POSE_SELECT_MAX, itemsForPose,
} from "./wifepay_reveal.js?v=8";

const $ = (id) => document.getElementById(id);
const ENG_KEY = "yorozuya_eng";
const STEPS = [
  { n: 1, label: "姿勢" },
  { n: 2, label: "圖形" },
  { n: 3, label: "劇本" },
  { n: 4, label: "Prompt" },
  { n: 5, label: "Denoise" },
  { n: 6, label: "測試" },
];

let girls = [];
let currentGirl = null;
let items = [];
let selectedId = "";
let scripts = [];
let selectedScriptId = "";
let poseCatalog = [];
let selectedPose = "";
let extraPoses = [];
let currentStep = 1;
let charSec = 0.9;
let doorMuffle = true;
let doorMuffleLevel = "mid";
const MUFFLE_LEVEL_ZH = { light: "輕", mid: "中", heavy: "重" };
const DEFAULT_GLOBAL_POS = "wide angle, wide shot, full body, two people, 1girl, 1boy, both visible, third-person view";
const DEFAULT_GLOBAL_NEG = "pov, first-person view, male pov, close-up, cropped, out of frame, solo";
let promptDefaults = { global_prompt: DEFAULT_GLOBAL_POS, global_negative: DEFAULT_GLOBAL_NEG };


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
  if ($("saved-row")) $("saved-row").style.display = draw ? "none" : "";
  if ($("draw-row")) $("draw-row").style.display = draw ? "" : "none";
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

function itemHasPose(it, pose) {
  if (!pose) return true;
  const tags = (it?.tags || []).map((t) => String(t).toLowerCase());
  return tags.includes(String(pose).toLowerCase());
}

function poseIdSet() {
  return new Set((poseCatalog || []).map((p) => String(p.id)));
}

function selectedForPose(pose) {
  return itemsForPose(items, pose || selectedPose);
}

function canAssignPose(itemId, pose) {
  const p = String(pose || "");
  if (!p) return true;
  const cur = selectedForPose(p);
  if (cur.some((x) => x.id === itemId)) return true;
  return cur.length < POSE_SELECT_MAX;
}

function formatTrimWarn(trimmed) {
  if (!trimmed || !trimmed.length) return "";
  return trimmed.map((w) => {
    const name = poseLabel(w.pose) || w.pose;
    const n = (w.dropped || []).length;
    return `姿勢「${name}」原本選了超過 ${POSE_SELECT_MAX} 張，已自動只留 ${POSE_SELECT_MAX} 張（多的 ${n} 張還在圖庫，只是拿掉這個姿勢）。`;
  }).join(" ");
}

function syncPoseCount() {
  const el = $("gal-pose-count");
  if (!el) return;
  if (!selectedPose) {
    el.textContent = "先在第 1 步選一個姿勢。";
    return;
  }
  const n = selectedForPose(selectedPose).length;
  const name = poseLabel(selectedPose);
  el.textContent = `「${name}」已選 ${n}／${POSE_SELECT_MAX} 張。開門時會從裡面隨機抽 1 或 2 張` + (n <= 1 ? "（目前只會出 1 張）。" : "，不是必定兩張。");
}

function scriptHasPose(s, pose) {
  if (!pose) return true;
  const tags = (s?.tags || []).map((t) => String(t).toLowerCase());
  if (!tags.length) return true;
  return tags.includes(String(pose).toLowerCase());
}

function visibleItems() {
  if ($("gal-all")?.checked || !selectedPose) return items;
  const hit = items.filter((it) => itemHasPose(it, selectedPose));
  return hit;
}

function visibleScripts() {
  if ($("script-all")?.checked || !selectedPose) return scripts;
  const hit = scripts.filter((s) => scriptHasPose(s, selectedPose));
  return hit.length ? hit : scripts;
}

function stepDone(n) {
  if (n === 1) return !!selectedPose;
  if (n === 2) return !!selectedItem();
  if (n === 3) return !!currentScript();
  if (n === 4) return !!(selectedItem() && String($("item-prompt")?.value || selectedItem()?.prompt || "").trim());
  if (n === 5) return !!selectedItem();
  if (n === 6) return true;
  return false;
}

function canGoTo(n) {
  if (n < 1 || n > 6) return false;
  if (n <= currentStep) return true;
  for (let i = 1; i < n; i++) if (!stepDone(i)) return false;
  return true;
}

function stepHint() {
  if (currentStep === 1 && !selectedPose) return "先選一個姿勢，才能下一步。";
  if (currentStep === 2 && !selectedItem()) return "請上傳或選一張底圖。";
  if (currentStep === 3 && !currentScript()) return "請選一本劇本，或新增一本。";
  if (currentStep === 4 && !stepDone(4)) return "請為這張圖填 prompt 並儲存。";
  if (currentStep === 5 && !selectedItem()) return "先回到第 2 步選一張圖。";
  return `第 ${currentStep}／6 步`;
}

function renderSteps() {
  const nav = $("step-nav");
  if (nav) {
    nav.innerHTML = STEPS.map((s) => {
      const on = s.n === currentStep ? " on" : "";
      const done = stepDone(s.n) ? " done" : "";
      return `<button type="button" data-step="${s.n}" class="${on}${done}"><span class="n">${s.n}</span>${esc(s.label)}</button>`;
    }).join("");
    nav.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => goStep(Number(btn.dataset.step)));
    });
  }
  document.querySelectorAll(".step").forEach((sec) => {
    sec.classList.toggle("on", Number(sec.dataset.step) === currentStep);
  });
  if ($("btn-prev")) $("btn-prev").disabled = currentStep <= 1;
  if ($("btn-next")) {
    $("btn-next").disabled = currentStep >= 6 || !stepDone(currentStep);
    $("btn-next").textContent = currentStep >= 6 ? "完成" : "下一步";
  }
  if ($("step-hint")) $("step-hint").textContent = stepHint();
}

function goStep(n) {
  const t = Number(n);
  if (!canGoTo(t)) {
    setStatus("step-hint", stepHint());
    renderSteps();
    return;
  }
  currentStep = t;
  renderSteps();
  if (t === 2) renderThumbs();
  if (t === 3) { renderScriptSelects(); fillScriptForm(currentScript()); }
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function poseLabel(id) {
  const hit = poseCatalog.find((p) => p.id === id);
  return hit?.name || id;
}

function renderPoseGrid() {
  const box = $("pose-grid");
  if (!box) return;
  if (!poseCatalog.length) {
    box.innerHTML = `<span class="mini">（沒有姿勢）</span>`;
    return;
  }
  box.innerHTML = poseCatalog.map((p) => {
    const sel = p.id === selectedPose ? " sel" : "";
    return `<button type="button" class="${sel}" data-pose="${esc(p.id)}">${esc(p.name || p.id)}<span class="id">${esc(p.id)}</span></button>`;
  }).join("");
  box.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => selectPose(btn.dataset.pose));
  });
}

function selectPose(id) {
  selectedPose = String(id || "");
  if ($("ig-pose")) $("ig-pose").value = selectedPose;
  renderPoseGrid();
  setStatus("pose-status", selectedPose ? `已選「${poseLabel(selectedPose)}」` : "");
  syncPoseCount();
  renderThumbs();
  renderScriptSelects();
  renderSteps();
}

async function addPose() {
  const raw = ($("pose-new")?.value || "").trim().toLowerCase().replace(/\s+/g, "_");
  const id = raw.replace(/[^a-z0-9_-]/g, "");
  if (!id) { setStatus("pose-status", "請輸入姿勢 id（英文）", true); return; }
  if (poseCatalog.some((p) => p.id === id)) {
    selectPose(id);
    setStatus("pose-status", "這個姿勢已經有了");
    return;
  }
  extraPoses = Array.from(new Set([...extraPoses, id]));
  try {
    const j = await saveConfig({ poses: extraPoses, char_sec: charSec });
    extraPoses = Array.isArray(j.poses) ? j.poses : extraPoses;
    if (Array.isArray(j.pose_catalog) && j.pose_catalog.length) poseCatalog = j.pose_catalog;
    else if (!poseCatalog.some((p) => p.id === id)) poseCatalog.push({ id, name: id, builtin: false });
    if ($("pose-new")) $("pose-new").value = "";
    selectPose(id);
    setStatus("pose-status", `✓ 已加入姿勢「${id}」`);
  } catch (e) {
    setStatus("pose-status", e.message, true);
  }
}

function syncGlobalPromptUi(cfg) {
  const pos = String(cfg?.global_prompt || promptDefaults.global_prompt || DEFAULT_GLOBAL_POS);
  const neg = String(cfg?.global_negative || promptDefaults.global_negative || DEFAULT_GLOBAL_NEG);
  if ($("global-prompt")) $("global-prompt").value = pos;
  if ($("global-neg")) $("global-neg").value = neg;
}

async function loadWpConfig() {
  try {
    const cfg = await fetchConfig();
    charSec = cfg.char_sec;
    extraPoses = cfg.poses || [];
    poseCatalog = cfg.pose_catalog || [];
    doorMuffle = cfg.door_muffle !== false;
    doorMuffleLevel = cfg.door_muffle_level || "mid";
    if (cfg.defaults) {
      promptDefaults = {
        global_prompt: cfg.defaults.global_prompt || DEFAULT_GLOBAL_POS,
        global_negative: cfg.defaults.global_negative || DEFAULT_GLOBAL_NEG,
      };
    }
    syncCharSecUi(charSec);
    syncMuffleUi(cfg);
    syncGlobalPromptUi(cfg);
    if (!selectedPose && poseCatalog[0]) selectPose(poseCatalog[0].id);
    else renderPoseGrid();
  } catch (e) {
    setStatus("pose-status", e.message, true);
    if (!poseCatalog.length) {
      poseCatalog = [
        { id: "missionary", name: "傳教士", builtin: true },
        { id: "cowgirl", name: "騎乘", builtin: true },
        { id: "doggy", name: "老漢推車", builtin: true },
        { id: "kiss", name: "擁吻", builtin: true },
        { id: "reverse", name: "背向", builtin: true },
      ];
    }
    if (!selectedPose) selectPose("cowgirl");
  }
}

function syncCharSecUi(sec) {
  const n = Math.max(0.05, Math.min(2, Number(sec) || 0.9));
  charSec = Math.round(n * 100) / 100;
  if ($("ig-char-sec")) $("ig-char-sec").value = String(charSec);
  if ($("ig-char-sec-num")) $("ig-char-sec-num").value = String(charSec);
  if ($("char-sec-label")) $("char-sec-label").textContent = `目前每個字 ${charSec} 秒（遊戲裡也用這個設定）`;
}

function levelFromSlider(v) {
  const n = Number(v);
  if (n <= 1) return "light";
  if (n >= 3) return "heavy";
  return "mid";
}

function sliderFromLevel(lv) {
  return lv === "light" ? 1 : lv === "heavy" ? 3 : 2;
}

function syncMuffleUi(cfg) {
  if (cfg) {
    if (cfg.door_muffle != null) doorMuffle = cfg.door_muffle !== false;
    if (cfg.door_muffle_level) doorMuffleLevel = cfg.door_muffle_level;
  }
  if ($("ig-muffle")) $("ig-muffle").checked = !!doorMuffle;
  if ($("ig-muffle-level")) $("ig-muffle-level").value = String(sliderFromLevel(doorMuffleLevel));
  if ($("muffle-level-label")) $("muffle-level-label").textContent = MUFFLE_LEVEL_ZH[doorMuffleLevel] || "中";
}

function readMuffleFromUi() {
  doorMuffle = !!$("ig-muffle")?.checked;
  doorMuffleLevel = levelFromSlider($("ig-muffle-level")?.value || 2);
  if ($("muffle-level-label")) $("muffle-level-label").textContent = MUFFLE_LEVEL_ZH[doorMuffleLevel] || "中";
}

function muffleSeedFromUi() {
  const n = Number($("ig-muffle-seed")?.value || 0);
  if (Number.isFinite(n) && n > 0) return Math.floor(n);
  return Math.floor(Math.random() * 0xfffffffe) + 1;
}

async function persistMuffle() {
  readMuffleFromUi();
  try {
    const j = await saveConfig({ door_muffle: doorMuffle, door_muffle_level: doorMuffleLevel });
    syncMuffleUi(j);
    const zh = MUFFLE_LEVEL_ZH[doorMuffleLevel] || "中";
    const msg = doorMuffle ? `✓ 已儲存隔門聽不清（程度：${zh}）` : "✓ 已儲存：關閉隔門聽不清";
    setStatus("muffle-status", msg);
    setStatus("gen-status", msg);
  } catch (e) {
    setStatus("muffle-status", e.message, true);
    setStatus("gen-status", e.message, true);
  }
}

async function persistCharSec() {
  const n = Number($("ig-char-sec-num")?.value || $("ig-char-sec")?.value || charSec);
  syncCharSecUi(n);
  try {
    const j = await saveConfig({ char_sec: charSec, poses: extraPoses });
    syncCharSecUi(j.char_sec ?? charSec);
    setStatus("gen-status", `✓ 已儲存打字速度：每字 ${charSec} 秒`);
  } catch (e) {
    setStatus("gen-status", e.message, true);
  }
}

async function persistGlobalPrompts(reset = false) {
  const pos = reset ? (promptDefaults.global_prompt || DEFAULT_GLOBAL_POS) : ($("global-prompt")?.value || "");
  const neg = reset ? (promptDefaults.global_negative || DEFAULT_GLOBAL_NEG) : ($("global-neg")?.value || "");
  try {
    const j = await saveConfig({ global_prompt: pos, global_negative: neg });
    syncGlobalPromptUi(j);
    setStatus("prompt-global-status", reset ? "✓ 已恢復並儲存程式預設提示詞" : "✓ 已儲存預設正面／負面提示詞");
    setStatus("gen-status", reset ? "✓ 已恢復並儲存程式預設提示詞" : "✓ 已儲存預設提示詞");
  } catch (e) {
    setStatus("prompt-global-status", e.message, true);
    setStatus("gen-status", e.message, true);
  }
}

function revealOpts() {
  readMuffleFromUi();
  return {
    page: true,
    charSec,
    fullImage: !!$("ig-full")?.checked,
    showFullToggle: true,
    doorMuffle,
    doorMuffleLevel,
    muffleSeed: muffleSeedFromUi(),
    showOriginal: !!$("ig-show-orig")?.checked,
  };
}

function selectedItem() {
  return items.find((x) => x.id === selectedId) || null;
}

function fillItemForm(it) {
  if ($("item-prompt")) $("item-prompt").value = it?.prompt || "";
  if ($("item-neg")) $("item-neg").value = it?.negative || "";
  if ($("item-denoise")) $("item-denoise").value = it?.denoise ?? 0.55;
  if ($("denoise-val")) $("denoise-val").textContent = String(it?.denoise ?? 0.55);
  if ($("item-tags")) $("item-tags").value = (it?.tags || []).join(", ");
}

function renderThumbs() {
  const box = $("gal-thumbs");
  if (!box) return;
  const vis = visibleItems();
  if (!vis.length) {
    const more = items.length && selectedPose && !$("gal-all")?.checked;
    box.innerHTML = `<span class="mini">${more ? "這個姿勢還沒有底圖，可上傳或勾「顯示全部圖」。" : "（尚無圖，請先上傳底圖）"}</span>`;
    return;
  }
  box.innerHTML = "";
  for (const it of vis) {
    const btn = document.createElement("button");
    btn.type = "button";
    const inPose = !!(selectedPose && itemHasPose(it, selectedPose));
    btn.className = (it.id === selectedId ? "sel" : "") + (inPose ? " in-pose" : "");
    btn.title = it.id + (inPose ? "（已選進目前姿勢）" : "");
    const tag = (it.tags || [])[0] || "";
    btn.innerHTML = `<img src="${esc(it.url)}" alt="">${tag ? `<span class="tag">${esc(tag)}</span>` : ""}`;
    btn.onclick = () => {
      selectedId = it.id;
      fillItemForm(it);
      renderThumbs();
      renderSteps();
    };
    box.appendChild(btn);
  }
  syncPoseCount();
}

async function reloadGallery(preferId) {
  const doc = await fetchGalleryDoc();
  items = doc.items || [];
  const vis = visibleItems();
  if (preferId && items.some((x) => x.id === preferId)) selectedId = preferId;
  else if (!items.some((x) => x.id === selectedId)) selectedId = (vis[0] || items[0])?.id || "";
  fillItemForm(selectedItem());
  renderThumbs();
  renderSteps();
  const warn = formatTrimWarn(doc.trimmed);
  if (warn) {
    setStatus("gal-status", warn, true);
    setStatus("gen-status", warn, true);
  }
  return doc;
}

async function uploadGallery() {
  const file = $("gal-file")?.files?.[0];
  if (!file) { setStatus("gal-status", "先選一張圖", true); setStatus("gen-status", "先選一張圖", true); return; }
  setStatus("gal-status", "上傳中…");
  setStatus("gen-status", "上傳中…");
  const fd = new FormData();
  fd.append("file", file);
  const r = await fetch("/api/wifepay/gallery", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || "上傳失敗");
  $("gal-file").value = "";
  const item = j.item;
  if (item?.id && selectedPose) {
    if (!canAssignPose(item.id, selectedPose)) {
      await reloadGallery(item.id);
      const msg = `這個姿勢最多只能選 ${POSE_SELECT_MAX} 張底圖。圖已上傳，但沒有套上「${poseLabel(selectedPose)}」。請先拿掉其中一張的姿勢 tag，再指定。`;
      setStatus("gal-status", msg, true);
      setStatus("gen-status", msg, true);
      return;
    }
    const tags = Array.from(new Set([...(item.tags || []), selectedPose]));
    try {
      const patched = await apiJson(`/api/wifepay/gallery/${encodeURIComponent(item.id)}`, "PATCH", { tags });
      if (patched?.rejected_poses?.length) {
        await reloadGallery(item.id);
        const msg = `這個姿勢最多只能選 ${POSE_SELECT_MAX} 張底圖，沒有套上「${poseLabel(selectedPose)}」。`;
        setStatus("gal-status", msg, true);
        setStatus("gen-status", msg, true);
        return;
      }
    } catch { /* 圖已上傳，tag 失敗也不擋 */ }
  }
  await reloadGallery(item?.id);
  setStatus("gal-status", "✓ 已上傳");
  setStatus("gen-status", "✓ 已上傳");
}

async function saveItem() {
  const it = selectedItem();
  if (!it) throw new Error("先選一張圖");
  let tags = $("item-tags").value.split(/[,，]/).map((t) => t.trim()).filter(Boolean);
  const blocked = tags.filter((tag) => poseIdSet().has(tag) && !canAssignPose(it.id, tag));
  if (blocked.length) {
    tags = tags.filter((tag) => !blocked.includes(tag));
    const names = blocked.map((t) => `「${poseLabel(t)}」`).join("、");
    const msg = `${names}最多只能選 ${POSE_SELECT_MAX} 張底圖，沒有套上這個姿勢。請先拿掉其中一張的姿勢 tag。`;
    setStatus("gal-status", msg, true);
    setStatus("gen-status", msg, true);
    $("item-tags").value = tags.join(", ");
  }
  const j = await apiJson(`/api/wifepay/gallery/${encodeURIComponent(it.id)}`, "PATCH", {
    prompt: $("item-prompt").value,
    negative: $("item-neg").value,
    denoise: Number($("item-denoise").value || 0.55),
    tags,
  });
  if (j?.rejected_poses?.length && !blocked.length) {
    const names = j.rejected_poses.map((t) => `「${poseLabel(t)}」`).join("、");
    setStatus("gal-status", `${names}最多只能選 ${POSE_SELECT_MAX} 張底圖，沒有套上這個姿勢。`, true);
    setStatus("gen-status", `${names}最多只能選 ${POSE_SELECT_MAX} 張底圖，沒有套上這個姿勢。`, true);
  }
  await reloadGallery(j.item?.id || it.id);
  if (!blocked.length && !(j?.rejected_poses || []).length) {
    setStatus("gal-status", "✓ 已儲存這張");
    setStatus("denoise-status", "✓ 已儲存這張");
    setStatus("gen-status", "✓ 已儲存這張");
  }
}

async function deleteItem() {
  const it = selectedItem();
  if (!it) throw new Error("先選一張圖");
  if (!confirm("刪除這張底圖？")) return;
  await apiJson(`/api/wifepay/gallery/${encodeURIComponent(it.id)}`, "DELETE");
  selectedId = "";
  await reloadGallery();
  setStatus("gal-status", "✓ 已刪除");
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
    pose: selectedPose || $("ig-pose")?.value || "",
    build: $("ig-build")?.value || "average",
    stage: currentGirl?.roomStage || currentGirl?.stage || "wife",
    family: currentGirl?.family || (currentGirl ? familyOf(currentGirl) : ""),
    ckpt: $("ig-ckpt")?.value || currentGirl?.comfyCkpt || "",
    comfy_url: $("ig-comfy")?.value.trim() || "",
    seed: Number($("ig-seed")?.value || 0),
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
    ...info,
    item_id: it.id,
    character: currentGirl,
    name: currentGirl.name || "",
    prompt: $("item-prompt").value,
    negative: $("item-neg").value,
    global_prompt: $("global-prompt")?.value || "",
    global_negative: $("global-neg")?.value || "",
  };
  try {
    const j = await apiJson("/api/wifepay/preview-prompt", "POST", body);
    const pos = String(j.trace?.comfy_prompt || j.positive || "").trim();
    const neg = String(j.trace?.comfy_negative || j.negative || "").trim();
    $("prompt-sheet").textContent = [
      "【底圖】" + it.url,
      "【預設正面】" + (j.global_prompt || $("global-prompt")?.value || "（空）"),
      "【這張 prompt】" + (j.item_prompt || $("item-prompt").value.trim() || "（空）"),
      "",
      "【合併後正向（預設在前 + 人設 + 這張；會送進 Comfy）】",
      pos || "（空，變數會在伺服器展開）",
      "",
      "【預設負面】" + (j.global_negative || $("global-neg")?.value || "（空）"),
      "【這張 negative】" + ($("item-neg").value.trim() || "（空）"),
      "",
      "【合併後負向（會送進 Comfy，含 18+ 安全詞）】",
      neg || j.negative || "（空）",
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
  const vis = visibleScripts();
  return vis.find((s) => s.id === selectedScriptId) || vis[0] || scripts[0] || null;
}

function renderScriptSelects() {
  const edit = $("script-sel");
  const test = $("ig-script");
  const vis = visibleScripts();
  const editVal = selectedScriptId || currentScript()?.id || "";
  const testVal = test?.value || "random";
  if (edit) {
    edit.innerHTML = vis.map((s) => {
      const off = s.enabled === false ? "（停用）" : "";
      return `<option value="${esc(s.id)}"${s.id === editVal ? " selected" : ""}>${esc(s.name || s.id)}${off}</option>`;
    }).join("") || '<option value="">（尚無劇本）</option>';
  }
  if (test) {
    const src = vis.length ? vis : scripts;
    const opts = ['<option value="random">隨機</option>'].concat(src.map((s) => {
      const off = s.enabled === false ? "（停用）" : "";
      return `<option value="${esc(s.id)}">${esc(s.name || s.id)}${off}</option>`;
    }));
    test.innerHTML = opts.join("");
    test.value = src.some((s) => s.id === testVal) ? testVal : "random";
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
  if ($("script-man-tone")) $("script-man-tone").value = s.man_tone || "";
  if ($("script-wife-tone")) $("script-wife-tone").value = s.wife_tone || "";
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
  const tags = $("script-tags")?.value || "";
  return {
    name: $("script-name")?.value.trim() || "未命名劇本",
    enabled: !!$("script-enabled")?.checked,
    tags,
    scenario: $("script-scenario")?.value || "",
    man_tone: $("script-man-tone")?.value || "",
    wife_tone: $("script-wife-tone")?.value || "",
    system: $("dlg-sys")?.value || "",
    user: $("dlg-user")?.value || "",
    fallback: (fbNar || fbMan || fbWife) ? { narration: fbNar, man: fbMan, wife: fbWife } : null,
  };
}

async function loadScriptsList() {
  try {
    const rows = await fetchScripts();
    if (!Array.isArray(rows) || !rows.length) {
      throw new Error("伺服器沒有回傳劇本。若剛更新程式，請先重啟 uvicorn，再重新整理這個頁面。");
    }
    scripts = rows;
    if (!scripts.some((s) => s.id === selectedScriptId)) selectedScriptId = (visibleScripts()[0] || scripts[0])?.id || "";
    renderScriptSelects();
    fillScriptForm(currentScript());
    setStatus("script-status", `已載入 ${scripts.length} 本劇本`);
    renderSteps();
  } catch (e) {
    scripts = [];
    selectedScriptId = "";
    renderScriptSelects();
    fillScriptForm({});
    const msg = `載入劇本失敗：${e.message || e}。若剛更新程式，請先重啟 uvicorn，再強制重新整理這個頁面。`;
    setStatus("script-status", msg, true);
    setStatus("gen-status", msg, true);
    throw e;
  }
}

async function saveCurrentScript() {
  const cur = currentScript();
  if (!cur) throw new Error("沒有劇本可儲存");
  const j = await apiJson(`/api/wifepay/scripts/${encodeURIComponent(cur.id)}`, "PATCH", gatherScriptFields());
  scripts = j.scripts || scripts;
  selectedScriptId = (j.script || cur).id;
  renderScriptSelects();
  fillScriptForm(j.script || currentScript());
  setStatus("script-status", "✓ 已儲存劇本");
  setStatus("gen-status", "✓ 已儲存劇本");
}

async function addNewScript() {
  const body = { name: "新劇本", scenario: "", enabled: true };
  if (selectedPose) body.tags = [selectedPose];
  const j = await apiJson("/api/wifepay/scripts", "POST", body);
  scripts = j.scripts || scripts;
  selectedScriptId = (j.script || scripts[scripts.length - 1]).id;
  renderScriptSelects();
  fillScriptForm(j.script || currentScript());
  setStatus("script-status", "✓ 已新增劇本，編輯後請再按儲存");
  setStatus("gen-status", "✓ 已新增劇本，編輯後請再按儲存");
  renderSteps();
}

async function deleteCurrentScript() {
  const cur = currentScript();
  if (!cur) throw new Error("沒有劇本可刪");
  if (!confirm(`刪除劇本「${cur.name}」？`)) return;
  const j = await apiJson(`/api/wifepay/scripts/${encodeURIComponent(cur.id)}`, "DELETE");
  scripts = j.scripts || [];
  selectedScriptId = (visibleScripts()[0] || scripts[0])?.id || "";
  renderScriptSelects();
  fillScriptForm(currentScript());
  setStatus("script-status", "✓ 已刪除劇本");
  setStatus("gen-status", "✓ 已刪除劇本");
  renderSteps();
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
  goStep(6);
  mountWifepayReveal(revealHost(), {
    ...revealOpts(),
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
  goStep(6);
  const host = revealHost();
  try {
    const url = await generateFromItem(it, { ...genInfo(), prompt: $("item-prompt").value, negative: $("item-neg").value }, (sec) => {
      setStatus("gen-status", `生圖中… ${sec}s`);
    });
    const info = genInfo();
    mountWifepayReveal(host, {
      ...revealOpts(),
      waitText: "圖好了",
      wifeName: info.name,
      guestName: info.guestName,
      peek: pickPeek(1),
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
  goStep(6);
  if (!items.length) {
    setStatus("gen-status", "圖庫是空的。請先上傳底圖（不會改走文生圖）。", true);
    startWifepayPeek(revealHost(), { ...genInfo(), ...revealOpts(), onStatus: (m) => setStatus("gen-status", m) });
    return;
  }
  setStatus("gen-status", "全部一起測試…");
  startWifepayPeek(revealHost(), {
    ...genInfo(),
    ...revealOpts(),
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
  if (e.comfyUrl && $("ig-comfy")) $("ig-comfy").value = e.comfyUrl;
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
  $("btn-pose-add")?.addEventListener("click", () => addPose());
  $("pose-new")?.addEventListener("keydown", (ev) => { if (ev.key === "Enter") { ev.preventDefault(); addPose(); } });
  $("gal-all")?.addEventListener("change", () => renderThumbs());
  $("script-all")?.addEventListener("change", () => { renderScriptSelects(); fillScriptForm(currentScript()); });
  $("btn-gal-up")?.addEventListener("click", () => uploadGallery().catch((e) => { setStatus("gal-status", e.message, true); setStatus("gen-status", e.message, true); }));
  $("btn-gal-del")?.addEventListener("click", () => deleteItem().catch((e) => { setStatus("gal-status", e.message, true); setStatus("gen-status", e.message, true); }));
  $("btn-item-save")?.addEventListener("click", () => saveItem().catch((e) => setStatus("gal-status", e.message, true)));
  $("btn-item-save-2")?.addEventListener("click", () => saveItem().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-denoise-save")?.addEventListener("click", () => saveItem().catch((e) => setStatus("denoise-status", e.message, true)));
  $("item-denoise")?.addEventListener("input", () => {
    if ($("denoise-val")) $("denoise-val").textContent = $("item-denoise").value;
  });
  $("btn-ig-ping")?.addEventListener("click", () => pingEngine());
  $("btn-preview-prompt")?.addEventListener("click", () => previewPrompt());
  $("btn-global-save")?.addEventListener("click", () => persistGlobalPrompts(false));
  $("btn-global-reset")?.addEventListener("click", () => persistGlobalPrompts(true));
  $("btn-script-save")?.addEventListener("click", () => saveCurrentScript().catch((e) => setStatus("script-status", e.message, true)));
  $("btn-script-add")?.addEventListener("click", () => addNewScript().catch((e) => setStatus("script-status", e.message, true)));
  $("btn-script-del")?.addEventListener("click", () => deleteCurrentScript().catch((e) => setStatus("script-status", e.message, true)));
  $("script-sel")?.addEventListener("change", () => {
    selectedScriptId = $("script-sel").value;
    fillScriptForm(currentScript());
  });
  $("btn-dlg-test")?.addEventListener("click", () => testDialog());
  $("btn-test-img")?.addEventListener("click", () => testOneImage());
  $("btn-test-img-5")?.addEventListener("click", () => testOneImage());
  $("btn-test-all")?.addEventListener("click", () => testAll());
  $("btn-prev")?.addEventListener("click", () => goStep(currentStep - 1));
  $("btn-next")?.addEventListener("click", () => { if (currentStep < 6) goStep(currentStep + 1); });
  const syncChar = (from) => {
    const v = from === "num" ? $("ig-char-sec-num").value : $("ig-char-sec").value;
    syncCharSecUi(v);
  };
  $("ig-char-sec")?.addEventListener("input", () => syncChar("range"));
  $("ig-char-sec-num")?.addEventListener("input", () => syncChar("num"));
  $("btn-char-save")?.addEventListener("click", () => persistCharSec());
  $("ig-muffle")?.addEventListener("change", () => readMuffleFromUi());
  $("ig-muffle-level")?.addEventListener("input", () => readMuffleFromUi());
  $("btn-muffle-save")?.addEventListener("click", () => persistMuffle());
}

bind();
updateModeUi();
renderSteps();
Promise.all([
  loadWpConfig(),
  loadGirls(),
  reloadGallery().catch((e) => setStatus("gen-status", e.message, true)),
  loadScriptsList().catch((e) => setStatus("gen-status", e.message, true)),
  loadEngDefaults(),
]).then(() => {
  renderSteps();
  setStatus("gen-status", items.length ? `圖庫 ${items.length} 張` : "圖庫是空的，請先上傳底圖");
});
