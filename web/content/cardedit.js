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
import {
  buildCardPlayPrompt,
  buildCardVisualPosePrompt,
  parseCardVisualPose,
  formatCardReactDisplay,
} from "./persona_builder.js";
import {
  BIND_PLACEHOLDERS,
  bindContextFromGirl,
  resolveCardBinds,
  identityLockBlock,
} from "./card_bind.js";

// ── 狀態 ──────────────────────────────────────────────────
// 多檔牌組：每份 DOC 對應一個 json（cards.json / card_x.json…）
// registry.active = 遊戲上線用哪份；editingPackId = 編輯器開哪份
let REGISTRY = null;      // { active, packs: [...] }
let editingPackId = "main";
let packInfo = null;      // 目前編輯牌組的 summary
let DOC = null;           // 目前編輯的那份牌組文件
let cards = [];           // DOC.cards
let selectedId = null;
let dirty = false;
let draftChildren = [];   // AI 衍伸暫存
let girlCache = null;

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

/** 目前牌組檔內全部卡（一份檔 = 一個版本） */
function viewCards() {
  return cards;
}

function viewById() {
  return indexById(viewCards());
}

function selected() {
  return cards.find((c) => c.id === selectedId) || null;
}

function isEditingLive() {
  return REGISTRY && REGISTRY.active === editingPackId;
}

// ── 載入 / 儲存（多檔牌組）────────────────────────────────
async function refreshRegistry() {
  REGISTRY = await api("/api/card-packs");
  return REGISTRY;
}

async function loadPack(packId, { force = false } = {}) {
  if (dirty && !force) {
    if (!confirm("有未儲存變更，確定換牌組？未存內容會丟。")) {
      renderPackSelect();
      return;
    }
  }
  setStatus("save-status", `載入 ${packId}…`);
  const r = await api(`/api/card-packs/${encodeURIComponent(packId)}`);
  editingPackId = packId;
  packInfo = r.pack;
  DOC = r.doc;
  cards = Array.isArray(DOC.cards) ? DOC.cards : [];
  for (const c of cards) {
    if (!("parentId" in c)) c.parentId = null;
    if (!("token" in c)) c.token = "";
    if (!("tokenDesc" in c)) c.tokenDesc = "";
  }
  dirty = false;
  markDirty(false);
  selectedId = null;
  showEditor(false);
  await refreshRegistry();
  packInfo = (REGISTRY.packs || []).find((p) => p.id === packId) || packInfo;
  renderPackSelect();
  renderTree();
  fillParentSelect();
  const live = isEditingLive() ? "★上線中" : "草稿";
  setStatus(
    "save-status",
    `已載入 ${packInfo?.file || packId} · ${cards.length} 張 · ${live}`,
  );
}

async function loadCards() {
  // 開編輯器：預設編輯目前上線那份（也可用下拉換）
  await refreshRegistry();
  const start = REGISTRY.active || "main";
  await loadPack(start, { force: true });
}

function statsLine() {
  const vc = viewCards();
  const vmap = viewById();
  const roots = vc.filter((c) => !c.parentId || !vmap[c.parentId]).length;
  const withTok = vc.filter((c) => (c.token || "").trim()).length;
  const live = isEditingLive() ? "★上線" : "草稿";
  return `${live} · ${vc.length} 張 · 基礎 ${roots} · 詞墜 ${withTok} · 檔 ${packInfo?.file || "?"}`;
}

async function saveCards() {
  if (selectedId) commitFormToCard();
  const ids = new Set();
  for (const c of cards) {
    if (!c.id || !String(c.id).trim()) throw new Error("有卡缺 id");
    if (ids.has(c.id)) throw new Error(`重複 id: ${c.id}`);
    ids.add(c.id);
  }
  const map = byId();
  for (const c of cards) {
    if (c.parentId && wouldCycle(c.id, c.parentId, map)) {
      throw new Error(`繼承成環: ${c.id} → ${c.parentId}`);
    }
  }
  // 一律用 starter:true 重建 starter_pool（創角只認這份）
  const starters = cards.filter((c) => c.starter).map((c) => c.id);
  DOC.cards = cards;
  // 若完全沒勾 starter，把「不碎話術」自動當基礎池，避免上線後創角抽不到卡
  if (starters.length) {
    DOC.starter_pool = starters;
  } else {
    const speech = cards
      .filter((c) => c.kind === "speech" && !c.shatterOnUse)
      .map((c) => c.id);
    DOC.starter_pool = speech;
    if (speech.length) {
      // 順手勾上，下次編輯看得到
      for (const c of cards) {
        if (speech.includes(c.id)) c.starter = true;
      }
    }
  }
  // 商店池與 cards 對齊：去掉幽靈 id；空池則依 kind 補（避免空牌組加卡後貨架永遠空）
  DOC.shop_weights = DOC.shop_weights && typeof DOC.shop_weights === "object" ? DOC.shop_weights : {};
  const idOk = (id) => ids.has(id);
  let speechPool = (DOC.shop_weights.speech_pool || []).filter(idOk);
  let premPool = (DOC.shop_weights.premium_pool || []).filter(idOk);
  if (!speechPool.length) {
    speechPool = cards.filter((c) => c.kind === "speech").map((c) => c.id);
  }
  if (!premPool.length) {
    premPool = cards
      .filter((c) => c.kind === "shop_premium" || c.kind === "erotic")
      .map((c) => c.id);
  }
  // erotic_pool：只列色情卡（與 premium 並存；引擎會合併）
  let eroticPool = (DOC.shop_weights.erotic_pool || []).filter(idOk);
  if (!eroticPool.length) {
    eroticPool = cards.filter((c) => c.kind === "erotic").map((c) => c.id);
  }
  DOC.shop_weights.speech_pool = speechPool;
  DOC.shop_weights.premium_pool = premPool;
  if (eroticPool.length) DOC.shop_weights.erotic_pool = eroticPool;
  else delete DOC.shop_weights.erotic_pool;
  // sex_pool：前戲+正戲（不上架）
  let sexPool = (DOC.shop_weights.sex_pool || []).filter(idOk);
  if (!sexPool.length) {
    sexPool = cards
      .filter((c) => c.kind === "sex" || c.kind === "foreplay" || c.kind === "intercourse")
      .map((c) => c.id);
  }
  if (sexPool.length) {
    DOC.shop_weights.sex_pool = sexPool;
    DOC.defaults = DOC.defaults && typeof DOC.defaults === "object" ? DOC.defaults : {};
    DOC.defaults.sex_base_pool = sexPool;
  } else {
    delete DOC.shop_weights.sex_pool;
  }
  setStatus("save-status", `儲存 ${packInfo?.file || editingPackId}…`);
  const r = await api(`/api/card-packs/${encodeURIComponent(editingPackId)}`, "PUT", {
    doc: DOC,
  });
  dirty = false;
  markDirty(false);
  packInfo = r.pack || packInfo;
  await refreshRegistry();
  renderPackSelect();
  renderTree();
  setStatus(
    "save-status",
    `✓ 已寫入 ${r.pack?.file || editingPackId} · ${r.count} 張` +
      (isEditingLive() ? "（此檔正是上線版）" : "（草稿，尚未上線）"),
  );
}

async function activateCurrentPack() {
  if (dirty) {
    if (!confirm("有未儲存變更。先儲存再上線？按取消中止。")) return;
    await saveCards();
  }
  const n = cards.length;
  if (n < 1) {
    setStatus("save-status", "這組是空的，無法上線（遊戲會沒有卡）", true);
    return;
  }
  // 創角依賴 starter_pool／starter 旗標
  let starters = cards.filter((c) => c.starter).map((c) => c.id);
  if (!starters.length) {
    const speech = cards.filter((c) => c.kind === "speech" && !c.shatterOnUse);
    if (speech.length) {
      if (
        !confirm(
          `這組沒有勾「starter 創角池」的卡。\n` +
            `要先把 ${speech.length} 張話術自動標成基礎卡再上線嗎？\n` +
            `（取消＝仍上線，但創角可能抽不到卡）`,
        )
      ) {
        /* 使用者堅持上線 */
      } else {
        for (const c of speech) c.starter = true;
        DOC.starter_pool = speech.map((c) => c.id);
        markDirty();
        await saveCards();
        starters = DOC.starter_pool;
      }
    } else {
      alert(
        "警告：這組沒有 starter 基礎卡，也沒有不碎話術。\n" +
          "上線後「重新開始」創角會抽不到基礎卡。\n" +
          "請在編輯器勾 starter，或先加基礎話術。",
      );
    }
  }
  const livePack = (REGISTRY?.packs || []).find((p) => p.id === REGISTRY.active);
  const liveN = livePack?.cardCount;
  if (
    liveN != null &&
    n < liveN * 0.5 &&
    !confirm(
      `此牌組只有 ${n} 張，目前上線有 ${liveN} 張。上線會讓遊戲改用較少的牌庫。確定？`,
    )
  ) {
    return;
  }
  if (
    !confirm(
      `將「${packInfo?.name || editingPackId}」(${packInfo?.file}) 掛上遊戲上線槽？\n\n` +
        `這會：\n` +
        `· 換成此牌組（目前：${REGISTRY?.active || "?"}）\n` +
        `· 清空玩家牌庫／出戰牌組／卡牌貨架／進行中牌局／創角話術\n` +
        `· 金幣、委託、魅魔等其他進度保留\n\n` +
        `草稿檔不會刪，仍可再切回（切回也會再清牌進度）。\n` +
        `創角基礎卡：${starters.length || DOC.starter_pool?.length || 0} 張`,
    )
  ) {
    return;
  }
  setStatus("save-status", "上線中…");
  const r = await api(
    `/api/card-packs/${encodeURIComponent(editingPackId)}/activate`,
    "POST",
    {},
  );
  await refreshRegistry();
  renderPackSelect();
  const wipeNote = r.playerCardsWiped
    ? "· 已清空玩家牌進度"
    : "· 尚無存檔可清";
  setStatus(
    "save-status",
    `🚀 ${r.message || "已上線"} ${wipeNote} · epoch ${r.liveEpoch ?? "?"} · 重開遊戲頁生效`,
  );
}

// ── 牌組版本 UI ───────────────────────────────────────────
function renderPackSelect() {
  const sel = $("pack-select");
  if (!sel || !REGISTRY) return;
  const cur = editingPackId;
  sel.innerHTML = "";
  for (const p of REGISTRY.packs || []) {
    const opt = document.createElement("option");
    opt.value = p.id;
    const star = p.active ? "★ " : "";
    const cnt = p.cardCount != null ? p.cardCount : "?";
    opt.textContent = `${star}${p.name || p.id} · ${p.file} (${cnt})`;
    sel.appendChild(opt);
  }
  if ([...sel.options].some((o) => o.value === cur)) sel.value = cur;
  const meta = $("pack-meta");
  const p = (REGISTRY.packs || []).find((x) => x.id === editingPackId) || packInfo;
  if (meta && p) {
    meta.innerHTML =
      `檔案 <code>${esc(p.file)}</code> · ` +
      (p.active
        ? `<span style="color:var(--ok)">★ 遊戲上線中</span>`
        : `<span class="badge-warn">草稿（遊戲用 ${esc(REGISTRY.active)}）</span>`) +
      (p.note ? ` · ${esc(p.note)}` : "") +
      (p.clonedFrom ? ` · 克隆自 ${esc(p.clonedFrom)}` : "");
  }
  const fl = $("pack-file-label");
  if (fl) fl.textContent = p?.file ? `· ${p.file}` : "";
  const act = $("btn-activate");
  if (act) {
    act.disabled = !!p?.active;
    act.textContent = p?.active ? "★ 已是上線版" : "🚀 上線此牌組";
  }
}

async function switchPack(id) {
  if (id === editingPackId) return;
  await loadPack(id);
}

function suggestPackId(base) {
  const used = new Set((REGISTRY?.packs || []).map((p) => p.id));
  let id = base.replace(/[^\w\-]/g, "_").replace(/^(\d)/, "p$1") || "card_x";
  if (!/^[a-zA-Z]/.test(id)) id = "p_" + id;
  let n = 1;
  let cand = id;
  while (used.has(cand)) cand = `${id}_${n++}`;
  return cand;
}

async function createPack({ mode, lineageMode } = {}) {
  if (dirty && !confirm("有未存變更，仍要開新牌組檔？（不會自動存現檔）")) return;
  let id;
  let name;
  let fromCard = "";
  if (mode === "empty") {
    id = prompt("新牌組 id（英文，會變成檔名 card_xxx.json）", suggestPackId("card_x"));
    if (id == null) return;
    name = prompt("顯示名稱", id) || id;
  } else if (mode === "clone") {
    id = prompt(
      "新牌組 id（完整克隆目前編輯這份）",
      suggestPackId(`${editingPackId}_v2`),
    );
    if (id == null) return;
    name = prompt("顯示名稱", `${packInfo?.name || editingPackId} 副本`) || id;
  } else if (mode === "lineage") {
    const src = selected();
    if (!src) {
      setStatus("save-status", "請先選一張卡當輩分起點", true);
      return;
    }
    if (selectedId) {
      try {
        commitFormToCard();
      } catch (e) {
        setStatus("save-status", e.message, true);
        return;
      }
    }
    fromCard = selected().id;
    id = prompt(
      `新牌組 id（只含「${selected().name}」${lineageMode === "full" ? "整棵輩分" : "子樹"}）`,
      suggestPackId(`line_${fromCard}`),
    );
    if (id == null) return;
    name =
      prompt(
        "顯示名稱",
        `${selected().name}·${lineageMode === "full" ? "輩分" : "子樹"}`,
      ) || id;
  } else {
    return;
  }
  id = String(id).trim();
  setStatus("save-status", "建立牌組檔…");
  try {
    const body = {
      id,
      name: String(name).trim() || id,
      mode: mode === "lineage" ? "lineage" : mode,
      from_pack: editingPackId,
      from_card_id: fromCard,
      lineage_mode: lineageMode || "full",
      note:
        mode === "empty"
          ? "空牌組"
          : mode === "clone"
            ? `克隆自 ${editingPackId}`
            : `輩分自 ${editingPackId}/${fromCard}`,
    };
    const r = await api("/api/card-packs", "POST", body);
    await refreshRegistry();
    await loadPack(r.pack.id, { force: true });
    setStatus(
      "save-status",
      `✓ 已建立 ${r.pack.file} · ${r.count} 張（尚未上線，可安心改）`,
    );
  } catch (e) {
    setStatus("save-status", e.message, true);
  }
}

async function renamePack() {
  const p = (REGISTRY?.packs || []).find((x) => x.id === editingPackId);
  if (!p) return;
  const name = prompt("牌組顯示名稱", p.name || p.id);
  if (name == null) return;
  const note = prompt("備註（可空）", p.note || "");
  if (note == null) return;
  await api(`/api/card-packs/${encodeURIComponent(editingPackId)}`, "PATCH", {
    name,
    note,
  });
  await refreshRegistry();
  renderPackSelect();
  setStatus("save-status", "已更新名稱");
}

async function deletePack() {
  if (editingPackId === REGISTRY?.active) {
    setStatus("save-status", "不能刪正在上線的牌組；請先上線其他版本", true);
    return;
  }
  if (editingPackId === "main") {
    setStatus("save-status", "main / cards.json 不建議刪", true);
    return;
  }
  const p = (REGISTRY?.packs || []).find((x) => x.id === editingPackId);
  if (!confirm(`刪除牌組版本「${p?.name}」？\n可選是否連檔案 ${p?.file} 一起刪。`)) return;
  const delFile = confirm("連 JSON 檔一起刪除？\n確定=刪檔　取消=只從列表移除");
  await api(
    `/api/card-packs/${encodeURIComponent(editingPackId)}?delete_file=${delFile ? "true" : "false"}`,
    "DELETE",
  );
  dirty = false;
  await refreshRegistry();
  await loadPack(REGISTRY.active || "main", { force: true });
  setStatus("save-status", "已刪版本");
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
        <span class="meta">${esc((c.kind || "").replace("shop_premium", "prem").replace("erotic", "色").replace("foreplay", "前").replace("intercourse", "正").replace("sex", "做").replace("venue_event", "venue").replace("girl_trait", "trait"))}</span>
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
  updateBindPreview();
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
  $("f-visualEn").value = c.visualEn || c.imgPrompt || "";
  $("f-visualZh").value = c.visualZh || "";
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
    "sceneStart", "promptHint", "visualEn", "visualZh", "imgPrompt",
    "effect", "openChain", "emotion", "emotionOnFail",
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
  // 色情卡規格：一律消耗；打出必延輪（引擎也會強制，資料層對齊）
  if (c.kind === "erotic") {
    c.shatterOnUse = true;
    $("f-shatter").checked = true;
    c.effect = c.effect && typeof c.effect === "object" ? c.effect : {};
    c.effect.forceAnotherRound = true;
  }
  // 做愛：前戲／正戲／舊 sex — 不上架、不碎庫
  if (c.kind === "sex" || c.kind === "foreplay" || c.kind === "intercourse") {
    c.shatterOnUse = false;
    $("f-shatter").checked = false;
    c.price = c.price || 0;
    c.shopWeight = 0;
    if (c.kind === "foreplay" && c.sexBase == null && !c.parentId) c.sexBase = true;
    if (c.kind === "intercourse" && c.sexBase) c.sexBase = false;
    c.effect = c.effect && typeof c.effect === "object" ? c.effect : {};
    c.effect.sexScene = true;
    if (!Array.isArray(c.tags) || !c.tags.includes("sex")) {
      c.tags = [...(c.tags || []), "sex"];
    }
  }
  c.starter = $("f-starter").checked;
  c.forceable = $("f-forceable").checked;
  c.nsfwOnly = $("f-nsfwOnly").checked;
  c.sceneStart = $("f-sceneStart").value.trim();
  c.promptHint = $("f-promptHint").value.trim();
  c.visualEn = $("f-visualEn").value.trim();
  c.visualZh = $("f-visualZh").value.trim();
  if (!c.visualEn) delete c.visualEn;
  if (!c.visualZh) delete c.visualZh;
  // 舊別名：有 visualEn 就清掉 imgPrompt 避免雙寫
  if (c.visualEn && c.imgPrompt) delete c.imgPrompt;

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
    "sceneStart", "promptHint", "visualEn", "visualZh", "imgPrompt",
    "effect", "openChain", "emotion", "emotionOnFail",
    "_extract",
  ]);
  for (const k of Object.keys(c)) {
    if (!known.has(k) && !(k in extra)) delete c[k];
  }
  Object.assign(c, extra);

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
    visualEn: $("f-visualEn")?.value || "",
    visualZh: $("f-visualZh")?.value || "",
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
  const id = newId(editingPackId === "main" ? "base" : `${editingPackId}_base`);
  // 新組若還沒有任何 starter，預設勾創角池，避免上線後抽不到基礎卡
  const hasStarter = cards.some((x) => x.starter || (DOC.starter_pool || []).includes(x.id));
  const c = {
    id,
    name: "新基礎卡",
    token: "新詞墜",
    tokenDesc: "",
    parentId: null,
    kind: "speech",
    shatterOnUse: false,
    starter: !hasStarter,
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
  renderPackSelect();
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
function fillModelSelect(selId, names, preferred) {
  const sel = $(selId);
  if (!sel) return;
  const cur = preferred || sel.value;
  sel.innerHTML = "";
  const list = names?.length ? names : ["grok-4.5"];
  for (const n of list) {
    const opt = document.createElement("option");
    opt.value = n;
    opt.textContent = n;
    sel.appendChild(opt);
  }
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else if (list[0]) sel.value = list[0];
}

function aiCfg() {
  const custom = $("t-model-custom")?.value.trim();
  const fromSel = $("t-model")?.value?.trim();
  return {
    provider: $("t-provider").value,
    model: custom || fromSel || "grok-4.5",
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
    const { provider, endpoint } = aiCfg();
    if (provider === "grok-build") {
      const tags = await api("/api/llm/tags?provider=grok-build");
      const names = (tags?.models || []).map((m) => m.name || m).filter(Boolean);
      fillModelSelect("t-model", names, aiCfg().model);
      fillModelSelect("ig-model", names, $("ig-model")?.value);
      const dl = $("t-model-list");
      if (dl) dl.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
      setStatus(
        "t-engine",
        h.grok_build
          ? `✓ Grok Build · ${names.length} 模型`
          : "Grok Build 不可用（PATH/login）",
        !h.grok_build,
      );
    } else {
      const tags = await api(
        `/api/llm/tags?provider=ollama&endpoint=${encodeURIComponent(endpoint)}`,
      );
      const models = tags?.models || tags || [];
      const list = Array.isArray(models) ? models : [];
      const names = list.map((m) => m.name || m.model || m).filter(Boolean);
      fillModelSelect("t-model", names, aiCfg().model);
      const dl = $("t-model-list");
      if (dl) dl.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
      setStatus(
        "t-engine",
        names.length ? `✓ Ollama ${names.length} 模型` : "Ollama 無模型？",
        !names.length,
      );
    }
  } catch (e) {
    setStatus("t-engine", e.message, true);
  }
}

/** 真的送一句話，確認模型會回 */
async function pingChat() {
  setStatus("t-engine", "試聊中…");
  $("t-chat-out").textContent = "";
  try {
    const { text, sec } = await genWait(
      [
        {
          role: "system",
          content: "你是通路測試。只回一個短句繁中，證明你活著。",
        },
        { role: "user", content: "ping：請回「引擎正常」四個字即可。" },
      ],
      { keyPrefix: "pingchat", temperature: 0.2 },
    );
    $("t-chat-out").textContent = `← ${(text || "").trim()}  (${sec.toFixed(1)}s · ${aiCfg().provider}/${aiCfg().model})`;
    setStatus("t-engine", "✓ 試聊成功", false);
  } catch (e) {
    $("t-chat-out").textContent = "失敗: " + e.message;
    setStatus("t-engine", e.message, true);
  }
}

// ── 女子綁定 chips + 預覽 ─────────────────────────────────
function setupBindChips() {
  const box = $("bind-chips");
  if (!box) return;
  box.innerHTML = "";
  for (const p of BIND_PLACEHOLDERS) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "cy";
    b.style.fontSize = ".72em";
    b.style.padding = ".2em .45em";
    b.textContent = `[${p.key}]`;
    b.title = `${p.desc}（例：${p.sample}）· 點一下插入 sceneStart`;
    b.onclick = () => {
      const ta = $("f-sceneStart");
      const ins = `[${p.key}]`;
      const start = ta.selectionStart ?? ta.value.length;
      const end = ta.selectionEnd ?? start;
      ta.value = ta.value.slice(0, start) + ins + ta.value.slice(end);
      ta.focus();
      ta.selectionStart = ta.selectionEnd = start + ins.length;
      markDirty();
      updateBindPreview();
    };
    box.appendChild(b);
  }
}

function editorGirlForBind() {
  const name = $("re-name")?.value.trim() || girlCache?.name || "小夜";
  const player = $("re-player")?.value.trim() || "你";
  const look = girlCache?.look || {
    eyes: girlCache?.eyes || "明亮的眼睛",
    bust: girlCache?.bust || "勻稱的胸部",
    hair: girlCache?.hair || "長髮",
    hair_color: girlCache?.hair_color || "",
    build: girlCache?.build || "苗條",
    face: girlCache?.face || "",
    mouth: girlCache?.mouth || "",
    career_outfit: girlCache?.job ? `${girlCache.job}制服` : "便服",
    age: girlCache?.age || 24,
  };
  return {
    girl: {
      name,
      job: girlCache?.job || "店員",
      age: girlCache?.age || look.age || 24,
      look,
      personality: ($("re-per")?.value || "").split(/[、,]/).map((x) => x.trim()).filter(Boolean),
    },
    player,
  };
}

function updateBindPreview() {
  const el = $("bind-preview");
  if (!el) return;
  const { girl, player } = editorGirlForBind();
  const ctx = bindContextFromGirl(girl, player);
  const scene = resolveCardBinds($("f-sceneStart")?.value || "", ctx);
  const hint = resolveCardBinds($("f-promptHint")?.value || "", ctx);
  el.textContent =
    (scene || "（scene 空）") +
    (hint ? `\n—— hint：${hint}` : "") +
    `\n〔${ctx.who_line}〕`;
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
2. 每張子卡欄位：id, name, token, tokenDesc, tags, rarity, sceneStart, promptHint, visualEn, emotion
3. id 用英文蛇形，以父 id 為前綴，例 ${live.id}_tease
4. token 必須是新的短中文詞墜（2～6 字），不可與父鏈重複：${brief.tokens}
5. sceneStart = 玩家動作旁白（中文，80～140 字），要能同時體現整條詞墜鏈
6. promptHint = 給 AI 的牌意（一句，寫「他…」，不寫死她的台詞）
7. visualEn = 英文畫圖描述：鏡頭距離、相對位置、身體朝向（side/three-quarter/over-shoulder/facing him 可選）；
   禁止預設 looking at viewer 證件照；正對僅在場面需要時寫
8. emotion 含 stranger/friend/girlfriend/wife 各 {min,max} 整數
9. 不要複製父卡文案；要「在父動作之上再推一步」`;

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
    visualEn: raw.visualEn || "",
    visualZh: raw.visualZh || "",
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
function pickPoolItem(arr) {
  if (!Array.isArray(arr) || !arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)];
}
function poolText(x) {
  if (x == null) return "";
  if (typeof x === "string") return x;
  return x.text || x.name || x.label || "";
}

async function rollGirl() {
  try {
    const pools = await (await fetch("/content/persona_pools.json?ts=" + Date.now())).text().then(JSON.parse);
    const g = pools?.female;
    if (!g) throw new Error("無 female 池");
    const name = pickPoolItem(g.names) || "小夜";
    const arch = pickPoolItem(g.archetypes);
    const per = arch?.traits || arch?.personality || [];
    const personality = Array.isArray(per)
      ? per.map((x) => (typeof x === "string" ? x : x.name || x.text)).filter(Boolean).slice(0, 4)
      : ["倔強"];
    const A = g.appearance || {};
    const occ = pickPoolItem(g.occupations);
    $("re-name").value = typeof name === "string" ? name : name?.text || "小夜";
    $("re-per").value = personality.join("、");
    girlCache = {
      name: $("re-name").value,
      personality,
      job: poolText(occ) || occ?.name || "店員",
      age: 20 + Math.floor(Math.random() * 12),
      speech_style: arch?.speech_style || arch?.tone || "",
      tone: arch?.tone || "",
      look: {
        eyes: poolText(pickPoolItem(A.eyes)) || "明亮的眼睛",
        bust: poolText(pickPoolItem(A.bust)) || "勻稱的胸部",
        hair: poolText(pickPoolItem(A.hair)) || "長髮",
        hair_color: poolText(pickPoolItem(A.hair_color)) || "",
        build: poolText(pickPoolItem(A.build)) || "苗條",
        face: poolText(pickPoolItem(A.face)) || "",
        mouth: poolText(pickPoolItem(A.mouth)) || "",
        career_outfit: occ?.outfit || "",
        age: 24,
      },
    };
    setStatus(
      "re-status",
      `抽到 ${girlCache.name} · ${girlCache.look.eyes} · ${girlCache.look.bust}`,
    );
    updateBindPreview();
  } catch (e) {
    girlCache = {
      name: $("re-name").value || "小夜",
      personality: ($("re-per").value || "毒舌").split(/[、,]/).map((x) => x.trim()).filter(Boolean),
      job: "插畫家",
      age: 25,
      look: {
        eyes: "深色瞳孔",
        bust: "豐滿的胸部",
        hair: "黑色長直髮",
        build: "纖細",
      },
    };
    setStatus("re-status", "池子讀取失敗，用表單人設", true);
    updateBindPreview();
  }
}

/** 測試管線快取：①回話 → ②imgEn → ③生圖 */
let pipelineCache = {
  girlLine: "",
  imgEn: "",
  sceneBound: "",
  meta: "",
};

function scrubEditImgLabels(s) {
  return String(s || "")
    .replace(/\b(CARD VISUAL|authoritative action|stage direction|card tokens?|player action tokens?|ACTION \(authoritative\)|PRIMARY:|AUTHORITATIVE)\b/gi, " ")
    .replace(/\b(prompt|visualEn|visualZh|kind|speech|shop_premium)\s*[:=]/gi, " ")
    .replace(/[\u4e00-\u9fff]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/^[,;\s]+|[,;\s]+$/g, "")
    .trim();
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

  // 詞墜 + 女子綁定 [name]/[eye]/[breast]…
  const { girl: gObj } = editorGirlForBind();
  Object.assign(girlCache, gObj);
  girlCache.name = gObj.name;
  const bctx = bindContextFromGirl(girlCache, player);
  const sceneRaw =
    (live.sceneStart || "").trim() ||
    `你對 [name] 做了這件事。`;
  const scene = resolveCardBinds(sceneRaw, bctx);
  const hint = resolveCardBinds(live.promptHint || "", bctx);
  // 回話用：旁白即可；詞墜只作方向，不要求模型念出 [問候] 字樣
  const sceneForAi = scene;

  const sim = simulateEmotion(live, map, stage, { fail: openFail, trials: 1 });
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
      look: girlCache.look || null,
    },
    player: { name: player },
    relationship: { stage },
    card_play: {
      mode,
      venue_name: mode === "date" ? "咖啡店窗邊" : null,
      kind: live.kind || "speech",
      card_name: live.name,
      scene_start: sceneForAi,
      prompt_hint: hint || "",
      open_fail: openFail,
      open_ok: !openFail && !!live.openChain,
      feel_label: feelLabel,
      chain_attr: live.openChain?.attr || (live.tags || [])[0] || "talk",
      emotion_delta: emotionDelta,
    },
  };

  const sys = buildCardPlayPrompt(ctx);
  const act = sceneForAi.replace(/\s+/g, " ").slice(0, 180);
  const who = `你是「${girlCache.name}」，對方是「${player}」。`;
  const user = openFail
    ? `（${who}旁白：他做了「${act}」，你沒接住。用 1～3 句回話。只有台詞，不要寫表情：動作：。）`
    : `（${who}旁白：他剛做的是「${act}」。用 1～3 句回話（例如打招呼就回打招呼）。只有台詞。）`;

  $("re-prompt").textContent = sys + "\n\n[user] " + user;
  $("btn-react").disabled = true;
  setStatus("re-status", "① 產玩家對話…");
  $("re-out").textContent = "";
  try {
    const { text, sec } = await genWait(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { keyPrefix: "cardreact", temperature: 0.9 },
    );
    let line = (text || "").trim().replace(/^["「『]+|["」』]+$/g, "");
    // 誤輸出畫圖格式時丟掉
    if (/^\s*表情\s*[：:]/m.test(line) && /^\s*動作\s*[：:]/m.test(line)) {
      line = line.split("\n").filter((l) => !/^\s*(表情|態度|動作)\s*[：:]/.test(l)).join("\n").trim() || "……嗯。";
    }
    pipelineCache.girlLine = line;
    pipelineCache.visualPose = null;
    pipelineCache.sceneBound = scene;
    pipelineCache.meta = `${stageLabel(stage)} · Δ${emotionDelta >= 0 ? "+" : ""}${emotionDelta} · ${feelLabel}`;
    pipelineCache.imgEn = "";
    $("re-line").value = line;
    $("re-pose").value = "";
    $("re-imgen").value = "";
    $("re-out").textContent =
      `【① 玩家對話 · ${pipelineCache.meta} · ${sec.toFixed(1)}s】\n\n` +
      line +
      `\n\n→ 下一步「② 對話→表情動作→英文畫圖」`;
    setStatus("re-status", `✓ ① 對話 ${sec.toFixed(1)}s · 可跑 ②`);
  } catch (e) {
    setStatus("re-status", e.message, true);
  }
  $("btn-react").disabled = false;
}

/**
 * ② 與遊戲 ensureCardImgEnAfterText 同精神（層 ③）：
 * 回話 → 表情／動作 → 英文 reaction tags（不含運鏡；運鏡是 visualEn 層 ②）
 */
async function runReactToImgEn() {
  const live = formSnapshot();
  if (!live?.id) {
    setStatus("re-status", "請先選卡", true);
    return;
  }
  let line = ($("re-line").value || "").trim() || pipelineCache.girlLine;
  if (!line) {
    setStatus("re-status", "請先跑 ① 產玩家對話", true);
    return;
  }
  pipelineCache.girlLine = line;

  const { girl, player } = editorGirlForBind();
  Object.assign(girlCache || {}, girl);
  const bctx = bindContextFromGirl(girl, player);
  const scene =
    pipelineCache.sceneBound ||
    resolveCardBinds(live.sceneStart || "", bctx);
  const seed = scrubEditImgLabels(live.visualEn || "");

  $("btn-react-imgen").disabled = true;
  setStatus("re-status", "②a 依對話產表情／動作…");
  try {
    // ②a 中文表情／動作（給畫圖，不是主台詞）
    const poseSys = buildCardVisualPosePrompt({
      character: {
        name: girl.name,
        look: girl.look || girlCache?.look,
        personality: girl.personality,
      },
      card_play: {
        scene_start: scene,
        girl_line: line,
        dialogue: line,
        open_fail: $("re-open-fail")?.checked,
        card_name: live.name,
      },
    });
    const { text: poseRaw, sec: secA } = await genWait(
      [
        { role: "system", content: poseSys },
        { role: "user", content: `她說了：「${line.slice(0, 180)}」。只輸出 表情：… 與 動作：… 兩行。` },
      ],
      { keyPrefix: "cardpose", temperature: 0.7 },
    );
    const pose = parseCardVisualPose(poseRaw);
    pipelineCache.visualPose = pose;
    $("re-pose").value = pose?.text || (poseRaw || "").trim();

    // ②b 層 ③ 英文反應 tag（不重寫運鏡）
    setStatus("re-status", "②b 產反應英文 tag…");
    const sys = [
      "You convert her reaction into English IMAGE TAGS (layer 3 only).",
      "Output ONLY comma-separated English phrases: facial expression + body pose/gesture.",
      "Examples: angry face, hands on hips | crouching down | distracted, looking aside | shy blush, fidgeting",
      "FORBIDDEN: camera framing, POV, distance, shot type (layer 2 visualEn).",
      "FORBIDDEN: hair/outfit/identity. No Chinese, no dialogue, no meta labels.",
    ].join("\n");
    const user = [
      pose?.face ? `Expression (ZH): ${pose.face}` : "",
      pose?.body ? `Body (ZH): ${pose.body}` : "",
      `She said (context only): ${line.slice(0, 160)}`,
      "English reaction tags only.",
    ]
      .filter(Boolean)
      .join("\n");
    const { text, sec: secB } = await genWait(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { keyPrefix: "cardimgen", temperature: 0.7 },
    );
    let en = scrubEditImgLabels(text);
    if (en.length < 8) en = "responsive expression, natural pose, reacting to him";
    pipelineCache.imgEn = en;
    pipelineCache.cameraEn = seed || "";
    $("re-imgen").value = en;
    // 反應 tag 不回寫 visualEn（visualEn 只存運鏡）
    if ($("re-apply-visual")?.checked) {
      // 勾了也只更新反應預覽，不覆蓋 f-visualEn 運鏡
    }
    $("re-out").textContent =
      `【① 對話】\n${line}\n\n` +
      `【②a 表情／動作 · ${secA.toFixed(1)}s】\n${pose?.text || $("re-pose").value}\n\n` +
      `【②b 層③ 反應 tag · ${secB.toFixed(1)}s】\n${en}\n\n` +
      (seed ? `【層② 運鏡 visualEn】\n${seed}\n\n` : "") +
      `→ 可③填入生圖框（②+③ 疊加）或全流程生圖`;
    setStatus("re-status", `✓ ② 完成（pose+反應 tag）`);
  } catch (e) {
    setStatus("re-status", e.message, true);
  }
  $("btn-react-imgen").disabled = false;
}

/** ③ 把 層②運鏡 + 層③反應 填進生圖 tab（身份仍由 /api/imggen character 鎖） */
function fillImgFromPipeline() {
  const layer3 = scrubEditImgLabels($("re-imgen").value || pipelineCache.imgEn || "");
  const layer2 = scrubEditImgLabels(
    pipelineCache.cameraEn || $("f-visualEn")?.value || "",
  );
  if (!layer3 && !layer2) {
    setStatus("re-status", "還沒有運鏡／反應 tag，請先跑 ② 或填 visualEn", true);
    return;
  }
  const { girl } = editorGirlForBind();
  const name = girl.name || $("re-name").value || "woman";
  const action = [layer2, layer3, "mid-action, detailed face"]
    .filter(Boolean)
    .join(", ");
  $("ig-prompt").value = [
    "anime illustration, cinematic interaction scene",
    `adult woman ${name}`,
    action,
    "no horns, no wings, no tail, no text, no watermark",
  ].join(", ");
  pipelineCache.imgEn = layer3;
  setStatus("re-status", "✓ 已填入生圖框（層②運鏡+層③反應）· 可開「生圖」分頁");
  const tabBtn = document.querySelector('#test-tabs button[data-tab="img"]');
  if (tabBtn) tabBtn.click();
}

/** 全流程：① 回應 → ② 英文 → ③ 填 prompt → 生圖 */
async function runReactFullPipeline() {
  $("btn-react-full").disabled = true;
  try {
    await runReact();
    if (!($("re-line").value || "").trim()) throw new Error("① 沒有回話");
    await runReactToImgEn();
    if (!($("re-imgen").value || "").trim()) throw new Error("② 沒有 imgEn");
    fillImgFromPipeline();
    setStatus("re-status", "全流程 ①②③ 完成 · 正在生圖…");
    await runImgGen();
    setStatus("re-status", "✓ 全流程完成（回應→英文→生圖）");
  } catch (e) {
    setStatus("re-status", e.message, true);
  }
  $("btn-react-full").disabled = false;
}

// ── 生圖 ──────────────────────────────────────────────────
function fillImgPrompt() {
  // 優先用管線 ② 的 imgEn（回话後英文），否則 visualEn，再否則保底
  const fromPipe = scrubEditImgLabels($("re-imgen")?.value || pipelineCache.imgEn || "");
  const live = formSnapshot();
  const { girl } = editorGirlForBind();
  const vEn = scrubEditImgLabels(fromPipe || live.visualEn || "");
  const prompt = [
    "anime illustration, cinematic interaction scene",
    `adult woman ${girl.name || "woman"}`,
    vEn || "he interacts with her, she faces him, eye contact, responsive expression, not looking away",
    "half body, detailed face, soft lighting, mid-action",
    "no horns, no wings, no tail, no text, no watermark",
  ]
    .filter(Boolean)
    .join(", ");
  $("ig-prompt").value = prompt;
}

/** AI 專生 visualEn（英文畫圖描述） */
async function runGenVisual() {
  const live = formSnapshot();
  if (!live?.id) {
    setStatus("vis-status", "請先選卡", true);
    return;
  }
  const map = { ...byId(), [live.id]: live };
  const brief = tokenEffectBrief(live, map);
  const sys = `You write English IMAGE tags for card visualEn = LAYER 2 CAMERA only.
Output ONLY English comma-separated tags. No Chinese. No markdown. No quotes.
Write from the male player's POV: framing, distance, what enters the frame (e.g. his hand if waving), looking toward her.
Examples: greeting → close-up head and shoulders; wave → his hand in foreground; step back → wider shot, more distance.
FORBIDDEN: her emotion/expression (angry, shy, smile) — that is layer 3 after dialogue.
FORBIDDEN: hair color, outfit identity, quality boilerplate.
Do not invent a second woman's identity.`;
  const user = `Card name: ${live.name}
kind: ${live.kind}
tags: ${(live.tags || []).join(", ")}
token chain: ${brief.tokens}
Chinese stage direction (meaning only; do not output Chinese):
${(live.sceneStart || "").slice(0, 280)}
promptHint: ${(live.promptHint || "").slice(0, 160)}
Write visualEn = camera/framing tags only (from his POV).`;

  $("btn-gen-visual").disabled = true;
  setStatus("vis-status", "生畫圖描述中…");
  try {
    const { text, sec } = await genWait(
      [
        { role: "system", content: sys },
        { role: "user", content: user },
      ],
      { keyPrefix: "visen", temperature: 0.7 },
    );
    let en = (text || "").trim().replace(/^```[\s\S]*?```/g, "").replace(/^["']|["']$/g, "");
    // 去掉誤出的中文行
    en = en
      .split("\n")
      .filter((l) => !/[\u4e00-\u9fff]/.test(l) || l.length < 4)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (!en || en.length < 12) throw new Error("模型沒產出可用英文描述");
    $("f-visualEn").value = en;
    if (!$("f-visualZh").value.trim()) {
      $("f-visualZh").value = `（AI）${live.name}：${(live.sceneStart || "").slice(0, 80)}`;
    }
    markDirty();
    setStatus("vis-status", `✓ visualEn 已填入（${sec.toFixed(1)}s）`);
  } catch (e) {
    setStatus("vis-status", e.message, true);
  }
  $("btn-gen-visual").disabled = false;
}

async function pingImgEngine() {
  setStatus("ig-status", "測試生圖引擎…");
  const provider = $("ig-provider").value;
  try {
    if (provider === "grok-img") {
      const h = await api("/api/health");
      const tags = await api("/api/llm/tags?provider=grok-build");
      const names = (tags?.models || []).map((m) => m.name || m).filter(Boolean);
      fillModelSelect("ig-model", names, $("ig-model")?.value);
      setStatus(
        "ig-status",
        h.grok_build
          ? `✓ grok-img 通路 OK · 模型 ${names.length} 個`
          : "Grok Build 不可用",
        !h.grok_build,
      );
    } else {
      const url = $("ig-comfy").value.trim();
      const q = url ? `?url=${encodeURIComponent(url)}` : "";
      const st = await api("/api/comfy/status" + q);
      const ckpts = st?.models?.checkpoints || st?.checkpoints || [];
      const names = (Array.isArray(ckpts) ? ckpts : []).map((x) =>
        typeof x === "string" ? x : x.name || x,
      );
      const sel = $("ig-ckpt");
      if (sel) {
        const cur = sel.value;
        sel.innerHTML = `<option value="">（自動／第一個）</option>`;
        for (const n of names) {
          const opt = document.createElement("option");
          opt.value = n;
          opt.textContent = n;
          sel.appendChild(opt);
        }
        if (cur && names.includes(cur)) sel.value = cur;
      }
      const ok = st?.ok !== false && (st?.reachable !== false);
      setStatus(
        "ig-status",
        ok
          ? `✓ Comfy 通 · checkpoint ${names.length} 個${st?.device ? " · " + st.device : ""}`
          : `Comfy 異常：${st?.error || st?.message || "連不上"}`,
        !ok,
      );
    }
  } catch (e) {
    setStatus("ig-status", e.message, true);
  }
}

async function runImgGen() {
  let prompt = $("ig-prompt").value.trim();
  if (!prompt) {
    fillImgPrompt();
    prompt = $("ig-prompt").value.trim();
  }
  const provider = $("ig-provider").value;
  const rating = $("ig-rating").value;
  const model =
    $("ig-model")?.value?.trim() ||
    aiCfg().model ||
    "grok-4.5";
  const key = `cardimg:${Date.now().toString(36)}`;
  $("btn-imggen").disabled = true;
  setStatus("ig-status", "生圖排隊中…");
  $("ig-preview").innerHTML = `<span class="mini">生成中…</span>`;
  try {
    const { girl } = editorGirlForBind();
    const body = {
      key,
      provider,
      model,
      prompt,
      rating,
      framing: "half",
      name: girl.name || "",
      personality: (girl.personality || []).join("、"),
      retry: true,
    };
    if (provider === "comfy") {
      body.comfy_url = $("ig-comfy").value.trim();
      body.ckpt = $("ig-ckpt")?.value || "";
    }
    const t0 = Date.now();
    while (true) {
      const r = await api("/api/imggen", "POST", body);
      if (r.status === "done") {
        const url = r.result;
        $("ig-preview").innerHTML = url
          ? `<a href="${esc(url)}" target="_blank"><img src="${esc(url)}?t=${Date.now()}" alt="card scene"></a>`
          : `<span class="mini">完成但無 URL</span>`;
        setStatus(
          "ig-status",
          `✓ ${((Date.now() - t0) / 1000).toFixed(1)}s · ${provider}/${model}${url ? " · " + url : ""}`,
        );
        break;
      }
      if (r.status === "error") throw new Error(r.error || "生圖失敗");
      setStatus("ig-status", `生成中… ${Math.round((Date.now() - t0) / 1000)}s · ${provider}`);
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

  $("pack-select").onchange = () => {
    switchPack($("pack-select").value).catch((e) =>
      setStatus("save-status", e.message, true),
    );
  };
  $("btn-pack-clone").onclick = () =>
    createPack({ mode: "clone" }).catch((e) => setStatus("save-status", e.message, true));
  $("btn-pack-empty").onclick = () =>
    createPack({ mode: "empty" }).catch((e) => setStatus("save-status", e.message, true));
  $("btn-pack-lineage-full").onclick = () =>
    createPack({ mode: "lineage", lineageMode: "full" }).catch((e) =>
      setStatus("save-status", e.message, true),
    );
  $("btn-pack-lineage-sub").onclick = () =>
    createPack({ mode: "lineage", lineageMode: "subtree" }).catch((e) =>
      setStatus("save-status", e.message, true),
    );
  $("btn-pack-rename").onclick = () =>
    renamePack().catch((e) => setStatus("save-status", e.message, true));
  $("btn-pack-del").onclick = () =>
    deletePack().catch((e) => setStatus("save-status", e.message, true));
  $("btn-activate").onclick = () =>
    activateCurrentPack().catch((e) => setStatus("save-status", e.message, true));

  const liveFields = [
    "f-token", "f-tokenDesc", "f-parent", "f-name", "f-id", "f-kind", "f-tags",
    "f-sceneStart", "f-promptHint", "f-visualEn", "f-visualZh", "f-effect", "f-openChain",
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
  $("btn-ping-chat").onclick = () => pingChat();
  $("t-provider").onchange = () => pingEngine();
  $("btn-derive").onclick = () => runDerive();
  $("btn-derive-add").onclick = addDerivedToEditor;
  $("btn-textgen").onclick = () => runTextGen();
  $("btn-react").onclick = () => runReact();
  $("btn-react-imgen").onclick = () => runReactToImgEn();
  $("btn-react-to-img").onclick = () => fillImgFromPipeline();
  $("btn-react-full").onclick = () => runReactFullPipeline();
  $("btn-roll-girl").onclick = () => rollGirl();
  $("btn-ig-fill").onclick = fillImgPrompt;
  $("btn-ig-ping").onclick = () => pingImgEngine();
  $("btn-imggen").onclick = () => runImgGen();
  $("ig-provider").onchange = () => pingImgEngine();
  $("btn-gen-visual").onclick = () => runGenVisual();
  $("btn-visual-to-img").onclick = () => {
    fillImgPrompt();
    setStatus("vis-status", "已把 visualEn／旁白組進生圖 prompt");
  };

  setupBindChips();
  for (const id of ["f-sceneStart", "f-promptHint", "re-name", "re-player", "re-per"]) {
    $(id)?.addEventListener("input", updateBindPreview);
  }
  // 表單 live 欄位也刷新綁定預覽
  $("f-sceneStart")?.addEventListener("change", updateBindPreview);

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
  .then(() => {
    updateBindPreview();
    // 生圖分頁若是 comfy 不強制 ping；grok 模型列表已在 pingEngine 填
  })
  .catch((e) => setStatus("save-status", e.message, true));
