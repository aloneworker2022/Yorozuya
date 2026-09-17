// Edit Pic — 生圖測試器（選／抽魅子＋正負向＋參考圖＋模型）
import { loadPools, generateGirl, RARITY_MARK } from "./girl_gen.js";

const $ = (id) => document.getElementById(id);
const ENG_KEY = "yorozuya_eng";

let girls = [];
let currentGirl = null;
let refUrl = "";

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

async function apiJson(url, method, body) {
  const r = await fetch(url, {
    method: method || "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || j.error || r.status);
  return j;
}

/** 同 t_d：POST /api/imggen 再輪詢至 done／error。 */
async function waitImg(body, ms = 360000) {
  let key = body.key;
  let r = await apiJson("/api/imggen", "POST", { ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done" || r.status === "error") return r;
    const sec = Math.round((Date.now() - t0) / 1000);
    setStatus("gen-status", `生成中… ${sec}s · comfy`);
    await new Promise((x) => setTimeout(x, 1500));
    r = await apiJson("/api/imggen", "POST", { ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  return { status: "error", error: "逾時" };
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

async function getImgEngDefaults() {
  let e = { comfyUrl: "", comfyCkpt: "" };
  try {
    e = { ...e, ...JSON.parse(localStorage.getItem(ENG_KEY) || "{}") };
  } catch {
    /* ignore */
  }
  try {
    const r = await fetch("/api/save", { cache: "no-store" });
    const j = await r.json();
    const s = j?.data?.settings || {};
    if (s.comfyUrl) e.comfyUrl = s.comfyUrl;
  } catch {
    /* 沒存檔就用 LS／預設 */
  }
  return e;
}

function girlMode() {
  const checked = document.querySelector('input[name="girl-mode"]:checked');
  return checked?.value || "saved";
}

function lookSummary(g) {
  const L = g?.look || {};
  const bits = [
    L.age != null ? `${L.age}歲` : "",
    L.hair_color,
    L.hair,
    L.eye_color,
    L.eyes,
    L.cup || L.bust,
    L.build,
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
    <div class="mini" style="margin:.25em 0 0">職業 ${esc(g.job || "—")} · ${esc(lookSummary(g))}</div>
    <div class="mini">comfyCkpt · ${ckpt ? esc(ckpt) : "（尚未綁定）"}</div>
  `;
  if (g.id) {
    port.style.display = "block";
    port.onerror = () => {
      port.style.display = "none";
    };
    port.src = `/assets/portraits/${encodeURIComponent(g.id)}_half.png?t=${Date.now()}`;
  } else {
    port.style.display = "none";
    port.removeAttribute("src");
  }
  // 切魅子時優先選她的 ckpt
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
  sel.innerHTML = girls
    .map((g) => {
      const mark = RARITY_MARK[g.rarity] || "";
      const label = `${g.name || g.id} ${mark}${g.rarity || ""} · ${g.id}`;
      return `<option value="${esc(g.id)}"${g.id === curId ? " selected" : ""}>${esc(label)}</option>`;
    })
    .join("");
}

async function loadGirls() {
  try {
    const r = await fetch("/api/save", { cache: "no-store" });
    const j = await r.json();
    const list = (j?.data?.succubi || []).filter((g) => g && g.id && !g.taken);
    girls = list;
    renderGirlSelect();
    if (girlMode() === "saved") {
      if (!currentGirl || !girls.some((g) => g.id === currentGirl.id)) {
        currentGirl = girls[0] || null;
      } else {
        currentGirl = girls.find((g) => g.id === currentGirl.id) || girls[0] || null;
      }
      if (currentGirl) $("girl-sel").value = currentGirl.id;
      renderGirlCard();
    }
    setStatus("ig-eng-status", girls.length ? `名冊 ${girls.length} 隻` : "存檔沒有可用魅子", !girls.length);
  } catch (e) {
    girls = [];
    renderGirlSelect();
    setStatus("ig-eng-status", "讀存檔失敗：" + e.message, true);
  }
}

function updateModeUi() {
  const mode = girlMode();
  $("saved-row").style.display = mode === "saved" ? "" : "none";
  $("draw-row").style.display = mode === "draw" ? "" : "none";
  if (mode === "saved") {
    const id = $("girl-sel")?.value;
    currentGirl = girls.find((g) => g.id === id) || girls[0] || null;
    renderGirlCard();
  }
}

function updateRefUi() {
  const has = !!String(refUrl || "").trim();
  const flag = $("mode-flag");
  const refFlag = $("ref-flag");
  const thumb = $("ref-thumb");
  if (flag) {
    flag.textContent = has ? "圖生圖（pose_ref）" : "文生圖";
    flag.className = "mode-flag " + (has ? "img" : "txt");
  }
  if (refFlag) {
    refFlag.textContent = has
      ? `參考圖：${refUrl}`
      : "沒有參考圖 → 文生圖";
  }
  if (thumb) {
    if (has) {
      thumb.style.display = "block";
      thumb.onerror = () => {
        thumb.style.display = "none";
      };
      thumb.src = refUrl + (refUrl.includes("?") ? "&" : "?") + "t=" + Date.now();
    } else {
      thumb.style.display = "none";
      thumb.removeAttribute("src");
    }
  }
  const urlInput = $("ref-url");
  if (urlInput && has && urlInput.value.trim() !== refUrl) urlInput.value = refUrl;
  // highlight recent
  document.querySelectorAll("#ref-recent button").forEach((btn) => {
    btn.classList.toggle("sel", btn.dataset.url === refUrl);
  });
}

async function loadRecentRefs() {
  const box = $("ref-recent");
  if (!box) return;
  try {
    const j = await apiJson("/api/pose-refs?limit=12");
    const items = j.items || [];
    if (!items.length) {
      box.innerHTML = `<span class="mini">尚無上傳過的參考圖</span>`;
      return;
    }
    box.innerHTML = "";
    for (const it of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.url = it.url;
      btn.title = it.name || it.url;
      btn.innerHTML = `<img src="${esc(it.url)}" alt="">`;
      btn.onclick = () => {
        refUrl = it.url;
        updateRefUi();
      };
      box.appendChild(btn);
    }
  } catch {
    box.innerHTML = `<span class="mini">讀取最近參考圖失敗</span>`;
  }
}

async function pingImgEngine() {
  setStatus("ig-eng-status", "測試 Comfy…");
  try {
    const url = $("ig-comfy").value.trim();
    const q = url ? `?url=${encodeURIComponent(url)}` : "";
    const st = await apiJson("/api/comfy/status" + q);
    const ckpts = st?.models?.checkpoints || st?.checkpoints || [];
    const names = (Array.isArray(ckpts) ? ckpts : []).map((x) =>
      typeof x === "string" ? x : x.name || x,
    );
    fillCkptSelect(names, $("ig-ckpt")?.value || currentGirl?.comfyCkpt || "");
    const ok = st?.ok !== false && st?.reachable !== false;
    setStatus(
      "ig-eng-status",
      ok
        ? `✓ Comfy 通 · checkpoint ${names.length} 個${st?.device ? " · " + st.device : ""}`
        : `Comfy 異常：${st?.error || st?.message || "連不上"}`,
      !ok,
    );
  } catch (e) {
    setStatus("ig-eng-status", e.message, true);
  }
}

function buildImgBody() {
  if (!currentGirl) throw new Error("先選或抽一隻魅子");
  const positive = $("prompt").value.trim();
  const negative = $("negative").value.trim();
  const selectedCkpt = $("ig-ckpt")?.value || "";
  const comfyUrl = $("ig-comfy")?.value.trim() || "";
  const denoise = Number($("ig-denoise")?.value || 0.55);
  const seed = Number($("ig-seed")?.value || 0);
  return {
    key: `editpic:${Date.now().toString(36)}`,
    provider: "comfy",
    character: currentGirl,
    name: currentGirl.name || "",
    rating: $("ig-rating").value,
    style: $("ig-style").value,
    framing: $("ig-framing").value,
    prompt: positive,
    extra: "",
    negative,
    pose_ref: refUrl || "",
    pose_denoise: denoise,
    seed,
    ckpt: selectedCkpt || currentGirl.comfyCkpt || "",
    comfy_url: comfyUrl,
    retry: true,
  };
}

async function previewBasePrompt() {
  if (!currentGirl) {
    setStatus("gen-status", "先選或抽一隻魅子", true);
    return;
  }
  setStatus("gen-status", "抓基礎 prompt…");
  $("prompt-sheet").textContent = "抓取中…";
  try {
    const body = {
      provider: "comfy",
      character: currentGirl,
      name: currentGirl.name || "",
      rating: $("ig-rating").value,
      style: $("ig-style").value,
      framing: $("ig-framing").value,
      extra: "",
      negative: "",
      prompt: "",
    };
    const j = await apiJson("/api/imggen/preview", "POST", body);
    const tr = j.trace || {};
    const basePos = String(tr.comfy_prompt || "").trim();
    const baseNeg = String(tr.comfy_negative || "").trim();
    const userPos = $("prompt").value.trim();
    const userNeg = $("negative").value.trim();

    if (!userPos && basePos) {
      $("prompt").value = basePos;
    }
    if (!userNeg && baseNeg) {
      $("negative").value = baseNeg;
    }

    $("prompt-sheet").textContent = [
      "【引擎】comfy",
      "",
      "【基礎正向】",
      basePos || "（空）",
      "",
      "【目前輸入正向】",
      ($("prompt").value.trim() || "（空白）"),
      "",
      "【基礎負向】",
      baseNeg || "（空）",
      "",
      "【目前輸入負向】",
      ($("negative").value.trim() || "（空白）"),
      "",
      "※ 送出時正向 → prompt",
    ].join("\n");
    setStatus("gen-status", "✓ 已預覽基礎 prompt");
  } catch (e) {
    $("prompt-sheet").textContent = "失敗：" + e.message;
    setStatus("gen-status", e.message, true);
  }
}

async function drawGirl() {
  setStatus("gen-status", "抽一隻…");
  try {
    await loadPools();
    const rating = $("ig-rating")?.value || "nsfw";
    const used = girls.map((g) => g.name).filter(Boolean);
    const g = generateGirl({ luck: 50, rating, usedNames: used });
    if (!g) throw new Error("抽卡失敗（人物池未載入？）");
    g.id = g.id || `editpic-${Date.now().toString(36)}`;
    currentGirl = g;
    // 切到「抽一隻」模式
    const radio = document.querySelector('input[name="girl-mode"][value="draw"]');
    if (radio) radio.checked = true;
    updateModeUi();
    renderGirlCard();
    setStatus("gen-status", `✓ 抽到 ${g.name} ${RARITY_MARK[g.rarity] || ""} ${g.rarity || ""}`);
  } catch (e) {
    setStatus("gen-status", e.message, true);
  }
}

async function runGen() {
  const btn = $("btn-gen");
  btn.disabled = true;
  $("gen-art").innerHTML = `<span class="mini">生成中…</span>`;
  setStatus("gen-status", "排隊中…");
  try {
    const body = buildImgBody();
    const t0 = Date.now();
    const r = await waitImg(body);
    if (r.status === "done" && r.result) {
      const url = String(r.result);
      $("gen-art").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
      setStatus(
        "gen-status",
        `✓ ${((Date.now() - t0) / 1000).toFixed(1)}s · ${body.provider}${refUrl ? " · 圖生圖" : " · 文生圖"} · ${url}`,
      );
    } else {
      $("gen-art").innerHTML = `<span class="mini">失敗</span>`;
      setStatus("gen-status", r.error || "生圖失敗", true);
    }
  } catch (e) {
    $("gen-art").innerHTML = `<span class="mini">失敗</span>`;
    setStatus("gen-status", e.message, true);
  }
  btn.disabled = false;
}

async function uploadRef(file) {
  if (!file) return;
  setStatus("gen-status", "上傳參考圖…");
  const fd = new FormData();
  fd.append("file", file, file.name || "pose.png");
  try {
    const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(data.detail || r.status);
    refUrl = data.url || "";
    updateRefUi();
    await loadRecentRefs();
    setStatus("gen-status", "✓ 參考圖已掛上");
  } catch (err) {
    setStatus("gen-status", "上傳失敗：" + err.message, true);
  }
}

function wire() {
  document.querySelectorAll('input[name="girl-mode"]').forEach((el) => {
    el.addEventListener("change", updateModeUi);
  });
  $("girl-sel")?.addEventListener("change", () => {
    const id = $("girl-sel").value;
    currentGirl = girls.find((g) => g.id === id) || null;
    renderGirlCard();
  });
  $("btn-reload-girls")?.addEventListener("click", () => loadGirls());
  $("btn-draw")?.addEventListener("click", () => drawGirl());
  $("btn-ig-ping")?.addEventListener("click", () => pingImgEngine());
  $("btn-preview-prompt")?.addEventListener("click", () => previewBasePrompt());
  $("btn-gen")?.addEventListener("click", () => runGen());

  $("btn-ref-up")?.addEventListener("click", () => $("ref-file").click());
  $("ref-file")?.addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    await uploadRef(file);
    e.target.value = "";
  });
  $("btn-ref-clear")?.addEventListener("click", () => {
    refUrl = "";
    if ($("ref-url")) $("ref-url").value = "";
    updateRefUi();
  });
  $("btn-ref-apply")?.addEventListener("click", () => {
    const u = ($("ref-url")?.value || "").trim();
    refUrl = u;
    updateRefUi();
  });
}

async function init() {
  wire();
  updateRefUi();
  const eng = await getImgEngDefaults();
  if ($("ig-comfy") && eng.comfyUrl) $("ig-comfy").value = eng.comfyUrl;
  await loadGirls();
  await loadRecentRefs();
  updateModeUi();
  // 靜默 ping 一次填模型／ckpt（失敗不擋）
  pingImgEngine().catch(() => {});
}

init();
