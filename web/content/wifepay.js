/* Wife Pay 編輯頁 v1：圖庫 CRUD、選／抽妹子、prompt／denoise、對話測試、全部一起測試。 */
import { loadPools, generateGirl, RARITY_MARK } from "./girl_gen.js";
import {
  apiJson, fetchGallery, fetchDialog, generateFromItem, mountWifepayReveal, startWifepayPeek,
} from "./wifepay_reveal.js?v=1";

const $ = (id) => document.getElementById(id);
const ENG_KEY = "yorozuya_eng";

let girls = [];
let currentGirl = null;
let items = [];
let selectedId = "";

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

function renderGirlCard() {
  const meta = $("girl-meta");
  const port = $("girl-port");
  if (!currentGirl) {
    meta.innerHTML = `<span class="mini">尚未選擇魅子</span>`;
    port.style.display = "none";
    port.removeAttribute("src");
    return;
  }
  const g = currentGirl;
  const mark = RARITY_MARK[g.rarity] || "";
  const ckpt = shortCkpt(g.comfyCkpt);
  meta.innerHTML = `
    <div><b>${esc(g.name || "？")}</b> ${esc(mark)} ${esc(g.rarity || "")}
      <span class="mini">· ${esc(g.id || "（暫無 id）")}</span></div>
    <div class="mini" style="margin:.25em 0 0">${esc(lookSummary(g))}</div>
    <div class="mini">comfyCkpt · ${ckpt ? esc(ckpt) : "（尚未綁定）"}</div>
  `;
  if (g.id) {
    port.style.display = "block";
    port.onerror = () => { port.style.display = "none"; };
    port.src = `/assets/portraits/${encodeURIComponent(g.id)}_half.png?t=${Date.now()}`;
  } else {
    port.style.display = "none";
    port.removeAttribute("src");
  }
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
  const over = $("ig-denoise").value;
  return {
    character: currentGirl,
    name: currentGirl?.name || "",
    pose: $("ig-pose").value,
    build: $("ig-build").value,
    stage: currentGirl?.roomStage || currentGirl?.stage || "wife",
    family: currentGirl?.family || "",
    ckpt: $("ig-ckpt").value || currentGirl?.comfyCkpt || "",
    comfy_url: $("ig-comfy").value.trim(),
    seed: Number($("ig-seed").value || 0),
    denoise: over === "" ? undefined : Number(over),
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

async function loadDialogTpl() {
  const j = await apiJson("/api/wifepay/dialog-prompt");
  $("dlg-sys").value = j.system || "";
  $("dlg-user").value = j.user || "";
}

async function saveDialogTpl() {
  await apiJson("/api/wifepay/dialog-prompt", "PUT", {
    system: $("dlg-sys").value,
    user: $("dlg-user").value,
  });
  setStatus("gen-status", "✓ 已儲存對話模板");
}

function revealHost() {
  const host = $("reveal-host");
  host.innerHTML = "";
  return host;
}

async function testDialog() {
  if (!currentGirl) { setStatus("gen-status", "先選或抽一隻魅子", true); return; }
  setStatus("gen-status", "產生對話…");
  try {
    const row = await fetchDialog(genInfo());
    mountWifepayReveal(revealHost(), { page: true, dialog: row, images: [] });
    setStatus("gen-status", row.ai ? "✓ 模型寫的對話" : "✓ 用本地後備（模型沒寫好）");
  } catch (e) {
    setStatus("gen-status", e.message, true);
  }
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
    mountWifepayReveal(host, {
      page: true,
      waitText: "圖好了",
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
  setStatus("gen-status", "抽一隻…");
  try {
    await loadPools();
    const used = girls.map((g) => g.name).filter(Boolean);
    const g = generateGirl({ luck: 50, rating: "nsfw", usedNames: used });
    if (!g) throw new Error("抽卡失敗（人物池未載入？）");
    g.id = g.id || `wifepay-${Date.now().toString(36)}`;
    currentGirl = g;
    const radio = document.querySelector('input[name="girl-mode"][value="draw"]');
    if (radio) radio.checked = true;
    updateModeUi();
    renderGirlCard();
    setStatus("gen-status", `✓ 抽到 ${g.name} ${RARITY_MARK[g.rarity] || ""}`);
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
  $("btn-gal-up")?.addEventListener("click", () => uploadGallery().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-gal-del")?.addEventListener("click", () => deleteItem().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-item-save")?.addEventListener("click", () => saveItem().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-ig-ping")?.addEventListener("click", () => pingEngine());
  $("btn-preview-prompt")?.addEventListener("click", () => previewPrompt());
  $("btn-dlg-save")?.addEventListener("click", () => saveDialogTpl().catch((e) => setStatus("gen-status", e.message, true)));
  $("btn-dlg-test")?.addEventListener("click", () => testDialog());
  $("btn-test-img")?.addEventListener("click", () => testOneImage());
  $("btn-test-all")?.addEventListener("click", () => testAll());
}

bind();
updateModeUi();
Promise.all([loadGirls(), reloadGallery().catch((e) => setStatus("gen-status", e.message, true)), loadDialogTpl().catch(() => {}), loadEngDefaults()]).then(() => {
  setStatus("gen-status", items.length ? `圖庫 ${items.length} 張` : "圖庫是空的，請先上傳底圖");
});
