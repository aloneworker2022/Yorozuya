// Card Edit — 詞墜繼承卡牌編輯器（全方位後台）
import {
  indexById,
  resolveTokenChain,
  formatTokenChain,
  resolveMergedEffect,
  resolveEmotionTable,
  simulateEmotion,
  buildCardForest,
  wouldCycle,
  suggestTokenFromName,
  tokenEffectBrief,
  tokenOf,
  STAGE_ORDER,
  stageLabel,
  extractLineageClone,
  findLineageRoot,
  collectSubtreeIds,
} from "./token_chain.js";
import { buildCardPlayPrompt } from "./persona_builder.js";

// ── 狀態 ──────────────────────────────────────────────────
let DOC = null;           // 完整 cards.json
let cards = [];           // DOC.cards（全部卡組）
let activeSetId = "main"; // 目前編輯的卡組
let selectedId = null;
let dirty = false;
let draftChildren = [];   // AI 衍伸暫存
let girlCache = null;

const MAIN_SET_ID = "main";

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

async function api(path, method = "GET", body = null) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { detail: text };
  }
  if (!r.ok) {
    const d = data?.detail;
    const msg =
      typeof d === "string"
        ? d
        : d?.message || (Array.isArray(d) ? d.map((x) => x.msg || x).join("; ") : null) || r.statusText;
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return data;
}

function setStatus(id, msg, err = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!err);
}

function markDirty(v = true) {
  dirty = v;
  const d = $("ed-dirty");
  if (d) d.style.display = v ? "" : "none";
  if (v) setStatus("save-status", "有未儲存變更", false);
}

function byId() {
  return indexById(cards);
}

/** 目前卡組內的卡（編輯樹只顯示這批） */
function viewCards() {
  return cards.filter((c) => (c.setId || MAIN_SET_ID) === activeSetId);
}

function viewById() {
  return indexById(viewCards());
}

function selected() {
  return cards.find((c) => c.id === selectedId) || null;
}

function ensureSets() {
  if (!Array.isArray(DOC.card_sets) || !DOC.card_sets.length) {
    DOC.card_sets = [
      {
        id: MAIN_SET_ID,
        name: "正式牌庫",
        live: true,
        note: "遊戲實際載入的卡",
      },
    ];
  }
  // 舊卡無 setId → main
  for (const c of cards) {
    if (!c.setId) c.setId = MAIN_SET_ID;
  }
  if (!DOC.card_sets.some((s) => s.id === activeSetId)) {
    activeSetId = DOC.card_sets.find((s) => s.live)?.id || DOC.card_sets[0].id;
  }
}

function getSet(id = activeSetId) {
  return (DOC.card_sets || []).find((s) => s.id === id) || null;
}

function allocSetId(base = "draft") {
  const used = new Set((DOC.card_sets || []).map((s) => s.id));
  let id = base;
  let n = 1;
  while (used.has(id)) id = `${base}_${n++}`;
  return id;
}

// ── 載入 / 儲存 ───────────────────────────────────────────
async function loadCards() {
  setStatus("save-status", "載入中…");
  DOC = await api("/api/cards");
  cards = Array.isArray(DOC.cards) ? DOC.cards : [];
  // 確保新欄位存在（不強迫寫 token）
  for (const c of cards) {
    if (!("parentId" in c)) c.parentId = null;
    if (!("token" in c)) c.token = "";
    if (!("tokenDesc" in c)) c.tokenDesc = "";
    if (!c.setId) c.setId = MAIN_SET_ID;
  }
  ensureSets();
  dirty = false;
  renderSetSelect();
  renderTree();
  fillParentSelect();
  if (selectedId && viewCards().some((c) => c.id === selectedId)) {
    selectCard(selectedId);
  } else {
    selectedId = null;
    showEditor(false);
  }
  setStatus("save-status", `已載入 ${cards.length} 張 · ${DOC.card_sets.length} 組`);
  $("tree-stats").textContent = statsLine();
}

function statsLine() {
  const vc = viewCards();
  const vmap = viewById();
  const roots = vc.filter((c) => !c.parentId || !vmap[c.parentId]).length;
  const withTok = vc.filter((c) => (c.token || "").trim()).length;
  const set = getSet();
  const liveTag = set?.live ? "·正式" : "·實驗";
  return `本組 ${vc.length} 張${liveTag} · 基礎 ${roots} · 詞墜 ${withTok} · 全庫 ${cards.length}`;
}

async function saveCards() {
  // 從表單回收目前編輯
  if (selectedId) commitFormToCard();
  ensureSets();
  // 驗證
  const ids = new Set();
  for (const c of cards) {
    if (!c.id || !String(c.id).trim()) throw new Error("有卡缺 id");
    if (ids.has(c.id)) throw new Error(`重複 id: ${c.id}`);
    ids.add(c.id);
    if (!c.setId) c.setId = MAIN_SET_ID;
  }
  // parent 必須同組
  const map = byId();
  for (const c of cards) {
    if (!c.parentId) continue;
    const p = map[c.parentId];
    if (!p) throw new Error(`卡 ${c.id} 的 parentId=${c.parentId} 不存在`);
    if ((p.setId || MAIN_SET_ID) !== (c.setId || MAIN_SET_ID)) {
      throw new Error(`卡 ${c.id} 的父卡跨組（不允許）`);
    }
    if (wouldCycle(c.id, c.parentId, map)) {
      throw new Error(`繼承成環: ${c.id} → ${c.parentId}`);
    }
  }
  // starter_pool 只收 live 組的 starter
  const liveIds = new Set(
    (DOC.card_sets || []).filter((s) => s.live).map((s) => s.id),
  );
  if (!liveIds.size) liveIds.add(MAIN_SET_ID);
  const starters = cards
    .filter((c) => c.starter && liveIds.has(c.setId || MAIN_SET_ID))
    .map((c) => c.id);
  DOC.cards = cards;
  DOC.card_sets = DOC.card_sets || [];
  if (Array.isArray(DOC.starter_pool)) {
    const keep = DOC.starter_pool.filter((id) => starters.includes(id));
    for (const id of starters) if (!keep.includes(id)) keep.push(id);
    DOC.starter_pool = keep;
  }
  setStatus("save-status", "儲存中…");
  const r = await api("/api/cards", "PUT", DOC);
  dirty = false;
  markDirty(false);
  setStatus(
    "save-status",
    `✓ 已寫入 ${r.count} 張 · ${DOC.card_sets.length} 組（schema v${r.schema_version}）`,
  );
  renderSetSelect();
  renderTree();
}

// ── 卡組 UI ───────────────────────────────────────────────
function renderSetSelect() {
  ensureSets();
  const sel = $("set-select");
  if (!sel) return;
  const cur = activeSetId;
  sel.innerHTML = "";
  for (const s of DOC.card_sets) {
    const n = cards.filter((c) => (c.setId || MAIN_SET_ID) === s.id).length;
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = `${s.live ? "★ " : ""}${s.name || s.id} (${n})`;
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else {
    activeSetId = sel.value;
  }
  const set = getSet();
  const liveEl = $("set-live-toggle");
  if (liveEl) {
    liveEl.checked = !!set?.live;
    liveEl.disabled = set?.id === MAIN_SET_ID && !!set?.live && DOC.card_sets.filter((s) => s.live).length <= 1;
  }
  const meta = $("set-meta");
  if (meta && set) {
    const bits = [
      `id: ${set.id}`,
      set.live ? "正式 live" : "實驗（遊戲不載入）",
      set.sourceSetId ? `來自 ${set.sourceSetId}` : "",
      set.extractedFrom ? `抽出 ${set.extractedFrom}` : "",
      set.note || "",
    ].filter(Boolean);
    meta.textContent = bits.join(" · ");
  }
}

function switchSet(id) {
  if (selectedId) {
    try {
      commitFormToCard();
    } catch (e) {
      setStatus("save-status", "表單有誤: " + e.message, true);
      renderSetSelect();
      return;
    }
  }
  activeSetId = id;
  selectedId = null;
  showEditor(false);
  renderSetSelect();
  renderTree();
  fillParentSelect();
  setStatus("save-status", `切換到卡組：${getSet()?.name || id}`);
}

function newEmptySet() {
  const name = prompt("新卡組名稱？", "實驗組");
  if (name == null) return;
  const id = allocSetId("draft");
  DOC.card_sets.push({
    id,
    name: name.trim() || id,
    live: false,
    note: "空組 · 從頭建",
    createdAt: Date.now(),
  });
  markDirty();
  switchSet(id);
  setStatus("save-status", `已新開空組「${name}」— 尚未寫入磁碟`);
}

function renameActiveSet() {
  const set = getSet();
  if (!set) return;
  const name = prompt("卡組名稱", set.name || set.id);
  if (name == null) return;
  set.name = name.trim() || set.id;
  markDirty();
  renderSetSelect();
}

function deleteActiveSet() {
  const set = getSet();
  if (!set) return;
  if (set.id === MAIN_SET_ID) {
    setStatus("save-status", "正式牌庫 main 不可刪組（可清空卡，但不刪組）", true);
    return;
  }
  const n = viewCards().length;
  if (!confirm(`刪除卡組「${set.name}」及其 ${n} 張卡？原庫不受影響。`)) return;
  if (selectedId) {
    try {
      commitFormToCard();
    } catch { /* discard form on delete set */ }
  }
  cards = cards.filter((c) => (c.setId || MAIN_SET_ID) !== set.id);
  DOC.cards = cards;
  DOC.card_sets = DOC.card_sets.filter((s) => s.id !== set.id);
  activeSetId = DOC.card_sets.find((s) => s.live)?.id || MAIN_SET_ID;
  selectedId = null;
  markDirty();
  showEditor(false);
  renderSetSelect();
  renderTree();
  setStatus("save-status", `已刪組（記得儲存）`);
}

function toggleSetLive() {
  const set = getSet();
  if (!set) return;
  const on = $("set-live-toggle").checked;
  if (!on) {
    const liveCount = DOC.card_sets.filter((s) => s.live && s.id !== set.id).length;
    if (liveCount < 1) {
      setStatus("save-status", "至少要有一組正式 live", true);
      $("set-live-toggle").checked = true;
      return;
    }
  }
  set.live = on;
  markDirty();
  renderSetSelect();
  renderTree();
}

/**
 * 整組輩分取出 → 新卡組（深拷，不動原卡）
 * @param {"full"|"subtree"} mode
 */
function extractLineageToNewSet(mode) {
  const src = selected();
  if (!src) {
    setStatus("save-status", "請先在樹裡選一張卡（輩分起點）", true);
    return;
  }
  try {
    commitFormToCard();
  } catch (e) {
    setStatus("save-status", e.message, true);
    return;
  }
  const srcCard = selected();
  const srcSet = getSet(srcCard.setId || MAIN_SET_ID);
  const defaultName =
    mode === "full"
      ? `${srcCard.name || srcCard.id}·整棵輩分`
      : `${srcCard.name || srcCard.id}·子樹`;
  const name = prompt(
    mode === "full"
      ? "新卡組名稱？（從根整棵輩分複製）"
      : "新卡組名稱？（以本卡為新根 + 子孫）",
    defaultName,
  );
  if (name == null) return;

  const setId = allocSetId("line");
  const prefix = setId.replace(/[^\w]/g, "").slice(0, 12) || "x";
  let result;
  try {
    result = extractLineageClone(srcCard, cards, {
      mode,
      newSetId: setId,
      idPrefix: prefix,
      stripStarter: true,
    });
  } catch (e) {
    setStatus("save-status", e.message, true);
    return;
  }

  DOC.card_sets.push({
    id: setId,
    name: name.trim() || setId,
    live: false,
    sourceSetId: srcCard.setId || MAIN_SET_ID,
    extractedFrom: srcCard.id,
    extractMode: mode,
    rootOldId: result.rootOldId,
    rootNewId: result.rootNewId,
    note: `自「${srcSet?.name || srcCard.setId}」${mode === "full" ? "整棵" : "子樹"}抽出`,
    createdAt: Date.now(),
  });
  cards.push(...result.clones);
  DOC.cards = cards;
  markDirty();
  switchSet(setId);
  selectCard(result.rootNewId);
  setStatus(
    "save-status",
    `✓ 已取出 ${result.count} 張到新組「${name}」（原卡不動 · 記得儲存）`,
  );
}

// ── 樹 ────────────────────────────────────────────────────
function renderTree() {
  const q = ($("filter").value || "").trim().toLowerCase();
  const vc = viewCards();
  const forest = buildCardForest(vc);
  const box = $("tree");
  box.innerHTML = "";

  function match(c) {
    if (!q) return true;
    const blob = `${c.id} ${c.name} ${c.token || ""} ${c.kind}`.toLowerCase();
    return blob.includes(q);
  }

  function nodeVisible(node) {
    if (match(node.card)) return true;
    return node.children.some(nodeVisible);
  }

  function walk(nodes, container) {
    for (const node of nodes) {
      if (q && !nodeVisible(node)) continue;
      const c = node.card;
      const div = document.createElement("div");
      div.className = "tree-item" + (c.id === selectedId ? " on" : "");
      div.dataset.id = c.id;
      const tok = (c.token || "").trim() || "·";
      div.innerHTML = `
        <span class="tok" title="${esc(tokenOf(c))}">${esc(tok)}</span>
        <span>${esc(c.name || c.id)}</span>
        <span class="meta">${esc((c.kind || "").replace("shop_premium", "prem").replace("venue_event", "venue").replace("girl_trait", "trait"))}</span>
      `;
      div.addEventListener("click", (e) => {
        e.stopPropagation();
        selectCard(c.id);
      });
      container.appendChild(div);
      if (node.children.length) {
        const kids = document.createElement("div");
        kids.className = "tree-kids";
        container.appendChild(kids);
        walk(node.children, kids);
      }
    }
  }

  walk(forest, box);

  if (q && !box.children.length) {
    for (const c of vc) {
      if (!match(c)) continue;
      const div = document.createElement("div");
      div.className = "tree-item" + (c.id === selectedId ? " on" : "");
      div.innerHTML = `<span class="tok">${esc(tokenOf(c))}</span><span>${esc(c.name || c.id)}</span>`;
      div.addEventListener("click", () => selectCard(c.id));
      box.appendChild(div);
    }
  }

  $("tree-stats").textContent = statsLine();
}

function fillParentSelect(exceptId = null) {
  const sel = $("f-parent");
  const cur = sel.value;
  sel.innerHTML = `<option value="">（無 — 基礎卡）</option>`;
  // 父卡只能是同組
  const sorted = viewCards()
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh"));
  for (const c of sorted) {
    if (exceptId && c.id === exceptId) continue;
    const opt = document.createElement("option");
    opt.value = c.id;
    opt.textContent = `${c.name || c.id}  [${tokenOf(c)}]`;
    sel.appendChild(opt);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
}

// ── 選卡 / 表單 ───────────────────────────────────────────
function showEditor(on) {
  $("empty-hint").style.display = on ? "none" : "";
  $("editor").style.display = on ? "" : "none";
}

function selectCard(id) {
  if (selectedId && selectedId !== id) {
    try {
      commitFormToCard();
    } catch (e) {
      setStatus("save-status", "表單有誤: " + e.message, true);
      return;
    }
  }
  selectedId = id;
  const c = selected();
  if (!c) {
    showEditor(false);
    renderTree();
    return;
  }
  showEditor(true);
  fillParentSelect(c.id);
  fillForm(c);
  updateResolvedPreview();
  updateEffectPanel();
  renderTree();
  // 預填生圖 prompt
  if (!$("ig-prompt").value.trim()) fillImgPrompt();
}

function fillForm(c) {
  $("f-id").value = c.id || "";
  $("f-name").value = c.name || "";
  $("f-token").value = c.token || "";
  $("f-tokenDesc").value = c.tokenDesc || "";
  $("f-parent").value = c.parentId || "";
  $("f-kind").value = c.kind || "speech";
  $("f-rarity").value = c.rarity || "N";
  $("f-minStage").value = c.minStage || "";
  $("f-price").value = c.price ?? "";
  $("f-shopWeight").value = c.shopWeight ?? "";
  $("f-tags").value = (c.tags || []).join(", ");
  $("f-shatter").checked = !!c.shatterOnUse;
  $("f-starter").checked = !!c.starter;
  $("f-forceable").checked = !!c.forceable;
  $("f-nsfwOnly").checked = !!c.nsfwOnly;
  $("f-sceneStart").value = c.sceneStart || "";
  $("f-promptHint").value = c.promptHint || "";
  $("f-effect").value = c.effect ? JSON.stringify(c.effect, null, 2) : "";
  $("f-openChain").value = c.openChain ? JSON.stringify(c.openChain, null, 2) : "";
  $("f-fail-min").value = c.emotionOnFail?.min ?? "";
  $("f-fail-max").value = c.emotionOnFail?.max ?? "";

  // emotion table
  const tb = $("emo-table").querySelector("tbody");
  tb.innerHTML = "";
  const map = byId();
  for (const st of STAGE_ORDER) {
    const row = document.createElement("tr");
    const em = c.emotion?.[st];
    const resolved = resolveEmotionTable(c, map, st);
    row.innerHTML = `
      <td>${stageLabel(st)}</td>
      <td><input data-st="${st}" data-k="min" type="number" value="${em && em.min != null ? em.min : ""}" placeholder="—"></td>
      <td><input data-st="${st}" data-k="max" type="number" value="${em && em.max != null ? em.max : ""}" placeholder="—"></td>
      <td class="mini" data-src="${st}">${esc(resolved.source)} ${resolved.min}~${resolved.max}</td>
    `;
    tb.appendChild(row);
  }
  tb.querySelectorAll("input").forEach((inp) => {
    inp.addEventListener("input", () => {
      markDirty();
      // live resolve preview after slight commit of emotion only
      try {
        const draft = peekEmotionFromForm();
        const tmp = { ...selected(), emotion: draft };
        const st = inp.dataset.st;
        const r = resolveEmotionTable(tmp, byId(), st);
        const cell = tb.querySelector(`td[data-src="${st}"]`);
        if (cell) cell.textContent = `${r.source} ${r.min}~${r.max}`;
      } catch { /* */ }
      updateEffectPanel();
    });
  });

  // extra fields
  const known = new Set([
    "id", "setId", "name", "token", "tokenDesc", "parentId", "kind", "rarity", "minStage",
    "price", "shopWeight", "tags", "shatterOnUse", "starter", "forceable", "nsfwOnly",
    "sceneStart", "promptHint", "effect", "openChain", "emotion", "emotionOnFail",
    "_extract",
  ]);
  const extra = {};
  for (const [k, v] of Object.entries(c)) {
    if (!known.has(k) && v !== undefined) extra[k] = v;
  }
  $("f-extra").value = Object.keys(extra).length ? JSON.stringify(extra, null, 2) : "";
}

function peekEmotionFromForm() {
  const emotion = {};
  for (const inp of $("emo-table").querySelectorAll("input")) {
    const st = inp.dataset.st;
    const k = inp.dataset.k;
    const raw = inp.value.trim();
    if (raw === "") continue;
    emotion[st] ??= {};
    emotion[st][k] = Number(raw);
  }
  // 只保留 min+max 都有的 stage
  for (const st of Object.keys(emotion)) {
    if (emotion[st].min == null || emotion[st].max == null || Number.isNaN(emotion[st].min) || Number.isNaN(emotion[st].max)) {
      delete emotion[st];
    }
  }
  return Object.keys(emotion).length ? emotion : undefined;
}

function parseJsonField(el, label) {
  const raw = el.value.trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    throw new Error(`${label} JSON 無效: ${e.message}`);
  }
}

function commitFormToCard() {
  const c = selected();
  if (!c) return;
  const oldId = c.id;
  const newId = $("f-id").value.trim();
  if (!newId) throw new Error("id 不可空");
  if (newId !== oldId && cards.some((x) => x.id === newId)) {
    throw new Error(`id 已存在: ${newId}`);
  }
  const parentId = $("f-parent").value.trim() || null;
  if (parentId && wouldCycle(newId, parentId, { ...byId(), [oldId]: { ...c, id: newId } })) {
    throw new Error("父卡會造成繼承環");
  }

  c.id = newId;
  c.setId = activeSetId; // 卡永遠屬於目前編輯組
  c.name = $("f-name").value.trim();
  c.token = $("f-token").value.trim();
  c.tokenDesc = $("f-tokenDesc").value.trim();
  c.parentId = parentId;
  c.kind = $("f-kind").value;
  c.rarity = $("f-rarity").value;
  c.minStage = $("f-minStage").value || null;
  c.price = $("f-price").value === "" ? undefined : Number($("f-price").value);
  c.shopWeight = $("f-shopWeight").value === "" ? undefined : Number($("f-shopWeight").value);
  c.tags = $("f-tags").value
    .split(/[,，\s]+/)
    .map((x) => x.trim())
    .filter(Boolean);
  c.shatterOnUse = $("f-shatter").checked;
  c.starter = $("f-starter").checked;
  c.forceable = $("f-forceable").checked;
  c.nsfwOnly = $("f-nsfwOnly").checked;
  c.sceneStart = $("f-sceneStart").value.trim();
  c.promptHint = $("f-promptHint").value.trim();

  const eff = parseJsonField($("f-effect"), "effect");
  if (eff) c.effect = eff;
  else delete c.effect;

  const oc = parseJsonField($("f-openChain"), "openChain");
  if (oc) c.openChain = oc;
  else delete c.openChain;

  const emotion = peekEmotionFromForm();
  if (emotion) c.emotion = emotion;
  else delete c.emotion;

  const fmin = $("f-fail-min").value.trim();
  const fmax = $("f-fail-max").value.trim();
  if (fmin !== "" && fmax !== "") {
    c.emotionOnFail = { min: Number(fmin), max: Number(fmax) };
  } else {
    delete c.emotionOnFail;
  }

  // wipe known then merge extra
  const extra = parseJsonField($("f-extra"), "extra") || {};
  const known = new Set([
    "id", "setId", "name", "token", "tokenDesc", "parentId", "kind", "rarity", "minStage",
    "price", "shopWeight", "tags", "shatterOnUse", "starter", "forceable", "nsfwOnly",
    "sceneStart", "promptHint", "effect", "openChain", "emotion", "emotionOnFail",
    "_extract",
  ]);
  for (const k of Object.keys(c)) {
    if (!known.has(k) && !(k in extra)) delete c[k];
  }
  Object.assign(c, extra);
  // setId 不被 extra 蓋掉
  c.setId = activeSetId;

  // clean undefined
  for (const k of Object.keys(c)) {
    if (c[k] === undefined) delete c[k];
  }

  if (newId !== oldId) {
    // 更新所有子卡 parent 指向
    for (const x of cards) {
      if (x.parentId === oldId) x.parentId = newId;
    }
    // starter_pool
    if (Array.isArray(DOC.starter_pool)) {
      DOC.starter_pool = DOC.starter_pool.map((id) => (id === oldId ? newId : id));
    }
    selectedId = newId;
  }
  markDirty();
  updateResolvedPreview();
  updateEffectPanel();
}

function updateResolvedPreview() {
  const c = selected();
  if (!c) return;
  // soft read form token/parent for live preview
  const live = {
    ...c,
    token: $("f-token").value.trim() || c.token,
    parentId: $("f-parent").value || null,
    name: $("f-name").value.trim() || c.name,
    tokenDesc: $("f-tokenDesc").value.trim() || c.tokenDesc,
  };
  const map = { ...byId(), [live.id]: live };
  const chain = resolveTokenChain(live, map);
  const bar = $("resolved-tokens");
  const fmt = formatTokenChain(chain);
  bar.textContent = fmt || "（尚無詞墜）";
  bar.classList.toggle("empty", !fmt);
  $("inherit-path").innerHTML = chain
    .map(
      (n, i) =>
        `${i ? " → " : ""}<b>${esc(n.name)}</b> <span class="tok-inline">[${esc(n.token)}]</span>` +
        (n.card.tokenDesc ? ` <span class="mini">(${esc(n.card.tokenDesc)})</span>` : ""),
    )
    .join("");
}

function updateEffectPanel() {
  const c = selected();
  if (!c) return;
  try {
    const live = formSnapshot();
    const map = { ...byId(), [live.id]: live };
    const chain = resolveTokenChain(live, map);
    $("fx-tokens").textContent = formatTokenChain(chain) || "—";
    const merged = resolveMergedEffect(live, map, { mode: "sum" });
    const brief = tokenEffectBrief(live, map);
    $("fx-effect").textContent = JSON.stringify(
      {
        tokens: brief.tokens,
        tokenPath: brief.descs,
        mergedEffect: merged,
        openChain: live.openChain || null,
        tags: live.tags || [],
        kind: live.kind,
        shatterOnUse: !!live.shatterOnUse,
      },
      null,
      2,
    );
  } catch (e) {
    $("fx-effect").textContent = "解析失敗: " + e.message;
  }
}

function formSnapshot() {
  const c = selected() || {};
  return {
    ...c,
    id: $("f-id").value.trim() || c.id,
    name: $("f-name").value.trim() || c.name,
    token: $("f-token").value.trim(),
    tokenDesc: $("f-tokenDesc").value.trim(),
    parentId: $("f-parent").value || null,
    kind: $("f-kind").value,
    tags: $("f-tags").value.split(/[,，\s]+/).map((x) => x.trim()).filter(Boolean),
    sceneStart: $("f-sceneStart").value,
    promptHint: $("f-promptHint").value,
    emotion: peekEmotionFromForm() || c.emotion,
    openChain: (() => {
      try {
        return parseJsonField($("f-openChain"), "oc");
      } catch {
        return c.openChain;
      }
    })(),
    effect: (() => {
      try {
        return parseJsonField($("f-effect"), "ef");
      } catch {
        return c.effect;
      }
    })(),
    shatterOnUse: $("f-shatter").checked,
  };
}

// ── 新建 / 刪除 ───────────────────────────────────────────
function newId(base = "card") {
  let n = 1;
  const ids = new Set(cards.map((c) => c.id));
  while (ids.has(`${base}_${n}`)) n++;
  return `${base}_${n}`;
}

function newBaseCard() {
  if (selectedId) {
    try {
      commitFormToCard();
    } catch (e) {
      setStatus("save-status", e.message, true);
      return;
    }
  }
  const id = newId(activeSetId === MAIN_SET_ID ? "base" : `${activeSetId}_base`);
  const c = {
    id,
    setId: activeSetId,
    name: "新基礎卡",
    token: "新詞墜",
    tokenDesc: "",
    parentId: null,
    kind: "speech",
    shatterOnUse: false,
    starter: false,
    tags: ["talk"],
    price: 40,
    shopWeight: 1,
    rarity: "N",
    minStage: null,
    emotion: {
      stranger: { min: -1, max: 1 },
      friend: { min: 0, max: 2 },
      girlfriend: { min: 0, max: 2 },
      wife: { min: 0, max: 1 },
    },
    sceneStart: "",
    promptHint: "",
  };
  cards.push(c);
  markDirty();
  selectCard(id);
}

function newChildCard() {
  const parent = selected();
  if (!parent) {
    setStatus("save-status", "請先選父卡再加子卡", true);
    return;
  }
  try {
    commitFormToCard();
  } catch (e) {
    setStatus("save-status", e.message, true);
    return;
  }
  const p = selected();
  const id = newId(p.id + "_x");
  const c = {
    id,
    setId: p.setId || activeSetId,
    name: p.name + "·衍伸",
    token: "新詞墜",
    tokenDesc: "",
    parentId: p.id,
    kind: p.kind || "speech",
    shatterOnUse: !!p.shatterOnUse,
    starter: false,
    tags: [...(p.tags || [])],
    price: p.price ?? 40,
    shopWeight: p.shopWeight ?? 1,
    rarity: p.rarity || "N",
    minStage: p.minStage || null,
    sceneStart: "",
    promptHint: "",
  };
  cards.push(c);
  markDirty();
  selectCard(id);
}

function deleteSelected() {
  const c = selected();
  if (!c) return;
  const kids = cards.filter((x) => x.parentId === c.id);
  if (kids.length) {
    if (!confirm(`「${c.name}」有 ${kids.length} 張子卡。刪除後子卡會變成基礎卡（parent 清空）。繼續？`)) return;
    for (const k of kids) k.parentId = null;
  } else if (!confirm(`刪除「${c.name}」(${c.id})？`)) return;
  cards = cards.filter((x) => x.id !== c.id);
  DOC.cards = cards;
  if (Array.isArray(DOC.starter_pool)) {
    DOC.starter_pool = DOC.starter_pool.filter((id) => id !== c.id);
  }
  selectedId = null;
  markDirty();
  showEditor(false);
  renderTree();
  renderSetSelect();
}

function suggestAllTokens() {
  let n = 0;
  // 只推斷目前卡組
  for (const c of viewCards()) {
    if (!(c.token || "").trim()) {
      c.token = suggestTokenFromName(c.name);
      n++;
    }
  }
  markDirty();
  renderTree();
  if (selectedId) {
    const c = selected();
    if (c) $("f-token").value = c.token || "";
    updateResolvedPreview();
  }
  setStatus("save-status", `已為本組 ${n} 張卡推斷詞墜（請檢查後儲存）`);
}

// ── 效果試算 ──────────────────────────────────────────────
function runSim() {
  const live = formSnapshot();
  if (!live?.id) return;
  const map = { ...byId(), [live.id]: live };
  const stage = $("fx-stage").value;
  const fail = $("fx-fail").checked;
  const sim = simulateEmotion(live, map, stage, { fail, trials: 200 });
  $("fx-sim-meta").textContent =
    `${stageLabel(stage)}${fail ? "·失敗" : ""} · 表 ${sim.range[0]}~${sim.range[1]}（來源 ${sim.table.source}）· 均值 ${sim.mean.toFixed(2)}`;
  const histEl = $("fx-hist");
  histEl.innerHTML = "";
  const keys = Object.keys(sim.hist)
    .map(Number)
    .sort((a, b) => a - b);
  const max = Math.max(1, ...keys.map((k) => sim.hist[k]));
  for (const k of keys) {
    const col = document.createElement("div");
    col.style.flex = "1";
    col.style.textAlign = "center";
    const bar = document.createElement("div");
    bar.className = "bar";
    bar.style.height = `${(sim.hist[k] / max) * 48}px`;
    const lab = document.createElement("div");
    lab.className = "lab";
    lab.textContent = `${k > 0 ? "+" : ""}${k}`;
    col.appendChild(bar);
    col.appendChild(lab);
    histEl.appendChild(col);
  }
}

// ── AI 共用 ───────────────────────────────────────────────
function aiCfg() {
  return {
    provider: $("t-provider").value,
    model: $("t-model").value.trim() || "grok-4.5",
    endpoint: $("t-endpoint").value.trim() || "http://localhost:11434",
  };
}

async function genWait(messages, { keyPrefix = "cardedit", temperature = 0.85 } = {}) {
  const { provider, model, endpoint } = aiCfg();
  const key = `${keyPrefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 7)}`;
  const t0 = Date.now();
  while (true) {
    const r = await api("/api/gen", "POST", {
      key,
      retry: true,
      provider,
      endpoint,
      model,
      messages,
      options: { temperature },
      prio: 1,
    });
    if (r.status === "done") return { text: r.result || "", sec: (Date.now() - t0) / 1000, key };
    if (r.status === "error") throw new Error(r.error || "生成失敗");
    await new Promise((res) => setTimeout(res, 1200));
  }
}

async function pingEngine() {
  setStatus("t-engine", "檢查中…");
  try {
    const h = await api("/api/health");
    const { provider } = aiCfg();
    if (provider === "grok-build") {
      setStatus("t-engine", h.grok_build ? "✓ Grok Build 可用" : "Grok Build 不可用（PATH/login）", !h.grok_build);
    } else {
      const tags = await api(`/api/llm/tags?provider=ollama&endpoint=${encodeURIComponent(aiCfg().endpoint)}`);
      const models = tags?.models || tags || [];
      const list = Array.isArray(models) ? models : [];
      const names = list.map((m) => m.name || m.model || m).filter(Boolean);
      const dl = $("t-model-list");
      dl.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
      setStatus("t-engine", names.length ? `✓ Ollama ${names.length} 模型` : "Ollama 無模型?", !names.length);
    }
  } catch (e) {
    setStatus("t-engine", e.message, true);
  }
}

// ── AI 衍伸 ───────────────────────────────────────────────
async function runDerive() {
  const live = formSnapshot();
  if (!live?.id) {
    setStatus("dr-status", "請先選一張父卡", true);
    return;
  }
  const n = Math.max(1, Math.min(8, Number($("dr-n").value) || 3));
  const hint = $("dr-hint").value.trim();
  const map = { ...byId(), [live.id]: live };
  const brief = tokenEffectBrief(live, map);
  const sys = `你是「魅魔萬事屋」互動牌設計師。
卡牌新概念：每張卡是一個「詞墜」；子卡繼承父卡整條詞墜鏈，再加自己的一顆新詞墜。
例：父 [問候] → 子「打趣」效果字串變成 [問候] [說笑話]。

規則：
1. 只輸出 JSON 陣列，不要 markdown 圍欄、不要解說。
2. 每張子卡欄位：id, name, token, tokenDesc, tags, rarity, sceneStart, promptHint, emotion
3. id 用英文蛇形，以父 id 為前綴，例 ${live.id}_tease
4. token 必須是新的短中文詞墜（2～6 字），不可與父鏈重複：${brief.tokens}
5. sceneStart = 玩家動作旁白（中文，80～140 字），要能同時體現整條詞墜鏈
6. promptHint = 給 AI 的牌意（一句，寫「他…」，不寫死她的台詞）
7. emotion 含 stranger/friend/girlfriend/wife 各 {min,max} 整數
8. 不要複製父卡文案；要「在父動作之上再推一步」`;

  const user = `父卡：
- id: ${live.id}
- name: ${live.name}
- kind: ${live.kind}
- 詞墜鏈: ${brief.tokens}
- 路徑: ${brief.descs}
- sceneStart: ${(live.sceneStart || "").slice(0, 200)}
- promptHint: ${live.promptHint || ""}
- tags: ${(live.tags || []).join(",")}

請衍伸 ${n} 張子卡。${hint ? "方向：" + hint : "方向自訂，但要玩法上可區分。"}`;

  $("btn-derive").disabled = true;
  $("btn-derive-add").disabled = true;
  setStatus("dr-status", "衍伸中…");
  $("dr-out").textContent = "";
  draftChildren = [];
  try {
    const { text, sec } = await genWait(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { keyPrefix: "derive" },
    );
    const parsed = extractJsonArray(text);
    if (!parsed.length) throw new Error("模型沒回出 JSON 陣列");
    draftChildren = parsed.map((raw, i) => normalizeDerived(raw, live, i));
    $("dr-out").textContent = draftChildren
      .map(
        (c, i) =>
          `── ${i + 1}. ${c.name} (${c.id})\n詞墜: ${formatTokenChain(resolveTokenChain(c, { ...map, [c.id]: c }))}\n` +
          `token: ${c.token}\nscene: ${(c.sceneStart || "").slice(0, 80)}…\npromptHint: ${c.promptHint || ""}`,
      )
      .join("\n\n");
    $("btn-derive-add").disabled = false;
    setStatus("dr-status", `✓ ${draftChildren.length} 張草案（${sec.toFixed(1)}s）· 可加入編輯器`);
  } catch (e) {
    setStatus("dr-status", e.message, true);
    $("dr-out").textContent = String(e);
  }
  $("btn-derive").disabled = false;
}

function extractJsonArray(text) {
  let t = (text || "").trim();
  t = t.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
  const start = t.indexOf("[");
  const end = t.lastIndexOf("]");
  if (start >= 0 && end > start) t = t.slice(start, end + 1);
  const arr = JSON.parse(t);
  return Array.isArray(arr) ? arr : [];
}

function normalizeDerived(raw, parent, i) {
  const id =
    (raw.id && String(raw.id).replace(/[^\w\-]/g, "_")) ||
    `${parent.id}_ai${i + 1}`;
  let uniq = id;
  let n = 2;
  const ids = new Set(cards.map((c) => c.id));
  while (ids.has(uniq) || draftChildren.some((c) => c.id === uniq)) {
    uniq = `${id}_${n++}`;
  }
  return {
    id: uniq,
    name: raw.name || `衍伸${i + 1}`,
    token: raw.token || suggestTokenFromName(raw.name) || `詞${i + 1}`,
    tokenDesc: raw.tokenDesc || "",
    parentId: parent.id,
    kind: parent.kind || "speech",
    shatterOnUse: !!parent.shatterOnUse,
    starter: false,
    tags: Array.isArray(raw.tags) ? raw.tags : [...(parent.tags || [])],
    price: parent.price ?? 45,
    shopWeight: parent.shopWeight ?? 1,
    rarity: raw.rarity || parent.rarity || "N",
    minStage: parent.minStage || null,
    emotion: raw.emotion || parent.emotion,
    sceneStart: raw.sceneStart || "",
    promptHint: raw.promptHint || "",
  };
}

function addDerivedToEditor() {
  if (!draftChildren.length) return;
  for (const c of draftChildren) {
    if (cards.some((x) => x.id === c.id)) continue;
    cards.push(c);
  }
  const first = draftChildren[0]?.id;
  draftChildren = [];
  $("btn-derive-add").disabled = true;
  markDirty();
  renderTree();
  if (first) selectCard(first);
  setStatus("dr-status", "已加入 · 記得按頂部儲存");
}

// ── 生文 ──────────────────────────────────────────────────
async function runTextGen() {
  const live = formSnapshot();
  if (!live?.id) {
    setStatus("tx-status", "請先選卡", true);
    return;
  }
  const wantScene = $("tx-scene").checked;
  const wantHint = $("tx-hint").checked;
  if (!wantScene && !wantHint) {
    setStatus("tx-status", "至少勾一項", true);
    return;
  }
  const map = { ...byId(), [live.id]: live };
  const brief = tokenEffectBrief(live, map);
  const sys = `你是卡牌文案寫手。根據詞墜鏈寫「玩家動作」文案。
只輸出 JSON 物件，不要 markdown。
欄位：${[wantScene && "sceneStart", wantHint && "promptHint"].filter(Boolean).join(", ")}
- sceneStart：第二人稱「你…」旁白，100～160 字，必須讓人讀得出整條詞墜 ${brief.tokens} 的疊加效果（父動作 + 本卡新意）。
- promptHint：給角色 AI 的牌意一句話，寫「他…你…」，不寫死她的台詞，可提依關係差異。
禁止寫她的對白。禁止角／翅膀等魔物外觀。`;

  const user = `卡：${live.name} (${live.id})
詞墜鏈：${brief.tokens}
路徑：${brief.descs}
kind：${live.kind}
tags：${(live.tags || []).join(",")}
現有 sceneStart：${(live.sceneStart || "（空）").slice(0, 120)}
現有 promptHint：${live.promptHint || "（空）"}
請重寫勾選的欄位。`;

  $("btn-textgen").disabled = true;
  setStatus("tx-status", "生文中…");
  try {
    const { text, sec } = await genWait(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { keyPrefix: "cardtxt" },
    );
    let obj = {};
    try {
      let t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "");
      const a = t.indexOf("{");
      const b = t.lastIndexOf("}");
      if (a >= 0 && b > a) t = t.slice(a, b + 1);
      obj = JSON.parse(t);
    } catch {
      obj = { sceneStart: text };
    }
    $("tx-out").textContent = JSON.stringify(obj, null, 2);
    if ($("tx-apply").checked) {
      if (wantScene && obj.sceneStart) $("f-sceneStart").value = obj.sceneStart;
      if (wantHint && obj.promptHint) $("f-promptHint").value = obj.promptHint;
      markDirty();
      updateResolvedPreview();
    }
    setStatus("tx-status", `✓ 完成 ${sec.toFixed(1)}s`);
  } catch (e) {
    setStatus("tx-status", e.message, true);
  }
  $("btn-textgen").disabled = false;
}

// ── 人物回應 ──────────────────────────────────────────────
async function rollGirl() {
  try {
    const pools = await (await fetch("/content/persona_pools.json?ts=" + Date.now())).text().then(JSON.parse);
    const g = pools?.female;
    if (!g) throw new Error("無 female 池");
    const pick = (arr) => (Array.isArray(arr) && arr.length ? arr[Math.floor(Math.random() * arr.length)] : null);
    const name = pick(g.names) || "小夜";
    const arch = pick(g.archetypes);
    const per = arch?.traits || arch?.personality || [];
    const personality = Array.isArray(per)
      ? per.map((x) => (typeof x === "string" ? x : x.name || x.text)).filter(Boolean).slice(0, 4)
      : ["倔強"];
    $("re-name").value = typeof name === "string" ? name : name?.text || "小夜";
    $("re-per").value = personality.join("、");
    girlCache = {
      name: $("re-name").value,
      personality,
      job: pick(g.occupations)?.name || pick(g.occupations) || "店員",
      age: 24,
      speech_style: arch?.speech_style || arch?.tone || "",
      tone: arch?.tone || "",
    };
    setStatus("re-status", `抽到 ${girlCache.name} · ${personality.join("、")}`);
  } catch (e) {
    // 輕量 fallback
    girlCache = {
      name: $("re-name").value || "小夜",
      personality: ($("re-per").value || "毒舌").split(/[、,]/).map((x) => x.trim()).filter(Boolean),
      job: "插畫家",
      age: 25,
    };
    setStatus("re-status", "池子讀取失敗，用表單人設", true);
  }
}

async function runReact() {
  const live = formSnapshot();
  if (!live?.id) {
    setStatus("re-status", "請先選卡", true);
    return;
  }
  if (!girlCache) {
    girlCache = {
      name: $("re-name").value || "小夜",
      personality: ($("re-per").value || "").split(/[、,]/).map((x) => x.trim()).filter(Boolean),
      job: "店員",
      age: 24,
    };
  }
  girlCache.name = $("re-name").value || girlCache.name;
  girlCache.personality = ($("re-per").value || "")
    .split(/[、,]/)
    .map((x) => x.trim())
    .filter(Boolean);

  const map = { ...byId(), [live.id]: live };
  const brief = tokenEffectBrief(live, map);
  const stage = $("re-stage").value;
  const mode = $("re-mode").value;
  const openFail = $("re-open-fail").checked;
  const player = $("re-player").value.trim() || "你";

  // 把詞墜鏈注入 scene，對齊新概念
  const scene =
    (live.sceneStart || "").trim() ||
    `你對她做了這件事，詞墜效果：${brief.tokens}。`;
  const sceneWithTokens = live.sceneStart
    ? `${live.sceneStart}\n（詞墜：${brief.tokens}）`
    : scene;

  const sim = simulateEmotion(live, map, stage, { fail: openFail, trials: 1 });
  const delta = sim.range[0]; // 取區間顯示用；真正 dice 再滾一次
  const lo = sim.range[0];
  const hi = sim.range[1];
  const emotionDelta = lo + Math.floor(Math.random() * (hi - lo + 1));
  const feelLabel =
    emotionDelta >= 2 ? "明顯加分" : emotionDelta >= 1 ? "微加" : emotionDelta <= -2 ? "明顯扣" : emotionDelta <= -1 ? "微扣" : "持平";

  const ctx = {
    character: {
      name: girlCache.name,
      personality: girlCache.personality,
      job: girlCache.job,
      occupation: girlCache.job,
      age: girlCache.age || 24,
      speech_style: girlCache.speech_style,
      tone: girlCache.tone,
    },
    player: { name: player },
    relationship: { stage },
    card_play: {
      mode,
      venue_name: mode === "date" ? "咖啡店窗邊" : null,
      kind: live.kind || "speech",
      card_name: live.name,
      scene_start: sceneWithTokens,
      prompt_hint: `${live.promptHint || ""}\n詞墜鏈（必須接住）：${brief.tokens}`,
      open_fail: openFail,
      open_ok: !openFail && !!live.openChain,
      feel_label: feelLabel,
      chain_attr: live.openChain?.attr || (live.tags || [])[0] || "talk",
      emotion_delta: emotionDelta,
    },
  };

  const sys = buildCardPlayPrompt(ctx);
  const act = sceneWithTokens.replace(/\s+/g, " ").slice(0, 180);
  const user = openFail
    ? `（旁白：他做了「${act}」，你沒接住、退開了。詞墜 ${brief.tokens}。用 3～5 句回話。只有台詞。）`
    : `（旁白：他剛做的是「${act}」。詞墜 ${brief.tokens}。用 3～5 句回話，第一句就要碰到他的動作。只有台詞。）`;

  $("re-prompt").textContent = sys + "\n\n[user] " + user;
  $("btn-react").disabled = true;
  setStatus("re-status", "回應生成中…");
  $("re-out").textContent = "";
  try {
    const { text, sec } = await genWait(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { keyPrefix: "cardreact", temperature: 0.9 },
    );
    $("re-out").textContent =
      `【${stageLabel(stage)} · Δ情感 ${emotionDelta >= 0 ? "+" : ""}${emotionDelta} · ${feelLabel}】\n` +
      `【詞墜 ${brief.tokens}】\n\n` +
      (text || "").trim();
    setStatus("re-status", `✓ ${sec.toFixed(1)}s`);
  } catch (e) {
    setStatus("re-status", e.message, true);
  }
  $("btn-react").disabled = false;
}

// ── 生圖 ──────────────────────────────────────────────────
function fillImgPrompt() {
  const live = formSnapshot();
  if (!live?.id) return;
  const map = { ...byId(), [live.id]: live };
  const brief = tokenEffectBrief(live, map);
  const scene = (live.sceneStart || "").replace(/\s+/g, " ").slice(0, 200);
  const girl = $("re-name").value || "young woman";
  const prompt = [
    "anime illustration, cinematic couple moment, indoor",
    `woman named mood of ${girl}, adult female`,
    `player action tokens: ${brief.tokens}`,
    scene ? `action: ${scene}` : "",
    "half body, expressive, detailed face, soft lighting",
    "no horns, no wings, no tail, no text, no watermark",
  ]
    .filter(Boolean)
    .join(", ");
  $("ig-prompt").value = prompt;
}

async function runImgGen() {
  let prompt = $("ig-prompt").value.trim();
  if (!prompt) {
    fillImgPrompt();
    prompt = $("ig-prompt").value.trim();
  }
  const provider = $("ig-provider").value;
  const rating = $("ig-rating").value;
  const model = $("t-model").value.trim() || "grok-4.5";
  const key = `cardimg:${Date.now().toString(36)}`;
  $("btn-imggen").disabled = true;
  setStatus("ig-status", "生圖排隊中…");
  $("ig-preview").innerHTML = `<span class="mini">生成中…</span>`;
  try {
    const body = {
      key,
      provider,
      model,
      prompt,
      rating,
      framing: "half",
      name: $("re-name").value || "",
      personality: $("re-per").value || "",
      retry: true,
    };
    if (provider === "comfy") {
      body.comfy_url = $("ig-comfy").value.trim();
    }
    const t0 = Date.now();
    while (true) {
      const r = await api("/api/imggen", "POST", body);
      if (r.status === "done") {
        const url = r.result;
        $("ig-preview").innerHTML = url
          ? `<a href="${esc(url)}" target="_blank"><img src="${esc(url)}?t=${Date.now()}" alt="card scene"></a>`
          : `<span class="mini">完成但無 URL</span>`;
        setStatus("ig-status", `✓ ${((Date.now() - t0) / 1000).toFixed(1)}s · ${url || ""}`);
        break;
      }
      if (r.status === "error") throw new Error(r.error || "生圖失敗");
      setStatus("ig-status", `生成中… ${Math.round((Date.now() - t0) / 1000)}s`);
      await new Promise((res) => setTimeout(res, 1500));
    }
  } catch (e) {
    setStatus("ig-status", e.message, true);
    $("ig-preview").innerHTML = `<span class="mini" style="color:var(--err)">${esc(e.message)}</span>`;
  }
  $("btn-imggen").disabled = false;
}

// ── Tabs ──────────────────────────────────────────────────
function setupTabs() {
  const tabs = $("test-tabs");
  tabs.querySelectorAll("button").forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.querySelectorAll("button").forEach((b) => b.classList.remove("on"));
      btn.classList.add("on");
      const id = btn.dataset.tab;
      for (const pane of ["effect", "derive", "text", "react", "img"]) {
        $(`tab-${pane}`).style.display = pane === id ? "" : "none";
      }
      if (id === "effect") updateEffectPanel();
    });
  });
}

// ── 綁定 ──────────────────────────────────────────────────
function bind() {
  $("btn-reload").onclick = () => {
    if (dirty && !confirm("有未儲存變更，確定重新載入？")) return;
    loadCards().catch((e) => setStatus("save-status", e.message, true));
  };
  $("btn-save").onclick = () => {
    saveCards().catch((e) => setStatus("save-status", e.message, true));
  };
  $("btn-new-base").onclick = newBaseCard;
  $("btn-new-child").onclick = newChildCard;
  $("btn-del").onclick = deleteSelected;
  $("btn-suggest-tokens").onclick = suggestAllTokens;
  $("btn-expand-all").onclick = () => {
    $("filter").value = "";
    renderTree();
  };
  $("filter").oninput = () => renderTree();

  $("set-select").onchange = () => switchSet($("set-select").value);
  $("btn-set-new").onclick = newEmptySet;
  $("btn-set-rename").onclick = renameActiveSet;
  $("btn-set-del").onclick = deleteActiveSet;
  $("set-live-toggle").onchange = toggleSetLive;
  $("btn-extract-full").onclick = () => extractLineageToNewSet("full");
  $("btn-extract-sub").onclick = () => extractLineageToNewSet("subtree");

  const liveFields = [
    "f-token", "f-tokenDesc", "f-parent", "f-name", "f-id", "f-kind", "f-tags",
    "f-sceneStart", "f-promptHint", "f-effect", "f-openChain",
  ];
  for (const id of liveFields) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("input", () => {
      markDirty();
      updateResolvedPreview();
      updateEffectPanel();
    });
    el.addEventListener("change", () => {
      markDirty();
      updateResolvedPreview();
      updateEffectPanel();
    });
  }
  // 其他欄位只 mark dirty
  for (const id of [
    "f-rarity", "f-minStage", "f-price", "f-shopWeight", "f-shatter", "f-starter",
    "f-forceable", "f-nsfwOnly", "f-fail-min", "f-fail-max", "f-extra",
  ]) {
    $(id)?.addEventListener("input", () => markDirty());
    $(id)?.addEventListener("change", () => markDirty());
  }

  $("btn-sim").onclick = runSim;
  $("fx-stage").onchange = () => updateEffectPanel();
  $("btn-ping").onclick = pingEngine;
  $("btn-derive").onclick = () => runDerive();
  $("btn-derive-add").onclick = addDerivedToEditor;
  $("btn-textgen").onclick = () => runTextGen();
  $("btn-react").onclick = () => runReact();
  $("btn-roll-girl").onclick = () => rollGirl();
  $("btn-ig-fill").onclick = fillImgPrompt;
  $("btn-imggen").onclick = () => runImgGen();

  setupTabs();

  window.addEventListener("beforeunload", (e) => {
    if (dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
}

// ── boot ──────────────────────────────────────────────────
bind();
loadCards()
  .then(() => pingEngine())
  .catch((e) => setStatus("save-status", e.message, true));
