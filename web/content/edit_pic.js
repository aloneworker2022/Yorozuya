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
async function waitImg(body, ms = 360000, statusId = "gen-status") {
  let key = body.key;
  let r = await apiJson("/api/imggen", "POST", { ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done" || r.status === "error") return r;
    const sec = Math.round((Date.now() - t0) / 1000);
    setStatus(statusId, `生成中… ${sec}s · comfy`);
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

// ---------------------------------------------------------------- 6. 臉模型（實驗，2026-11-23 使用者）
// 使用者：做一個「肉臉」（沒有頭髮的光頭，整顆頭都是肉），讓 AI 在上面畫臉，再蓋上頭髮、蓋上脖子。
//   同一個姿勢算兩張黑影：有頭髮（原本的）＋光頭（noHair，身體位置完全一樣）。
//   光頭那張 → 肉臉＝頭頂到下巴整顆頭；模板＝光頭放大（頭、脖子膚色，衣服淺灰，糊一點）→ pose_ref 圖生圖。
//   合成：黑影 → AI 的臉（照模板比例縮回、裁成肉臉的形狀）→ 頭髮（兩張不一樣的像素）→ 脖子。
const FACE = { frame: null, bare: null, crop: null, head: null, hair: null, neck: null, img: null, imgUrl: "" };
const SKIN = [51, 45, 64], HAIR_MAX = 40;   // 黑影的身體色；頭髮比較暗（R < 40）

function faceSpec(noHair) {
  const g = currentGirl;
  if (!g) throw new Error("先選或抽一隻魅子");
  return { look: g.look || null, outfit: g.outfitName || "", undressStage: Number($("face-stage").value) || 0, tier: "stranger", noHair: !!noHair };
}

/** 光頭那張 → 肉臉：{mask: Set(index)（頭頂到下巴整顆頭，含輪廓線）, neck: Set, chin, x0,x1,y0,y1, top}。 */
function findHead(fr) {
  const { width: W, height: H, data: d } = fr;
  const A = (x, y) => x >= 0 && y >= 0 && x < W && y < H && d[(y * W + x) * 4 + 3];
  const isSkin = (x, y) => { const i = (y * W + x) * 4; return d[i + 3] && Math.abs(d[i] - SKIN[0]) <= 4 && Math.abs(d[i + 1] - SKIN[1]) <= 4 && Math.abs(d[i + 2] - SKIN[2]) <= 4; };
  const isLine = (x, y) => { if (x < 0 || x >= W) return false; const i = (y * W + x) * 4; return d[i + 3] && Math.abs(d[i] - 78) <= 5 && Math.abs(d[i + 1] - 66) <= 5 && Math.abs(d[i + 2] - 98) <= 5; };
  let top = -1;
  for (let y = 0; y < H && top < 0; y++) for (let x = 0; x < W; x++) if (A(x, y)) { top = y; break; }
  if (top < 0) throw new Error("黑影是空的");
  let sx = 0, n = 0;
  for (let y = top; y < top + 4; y++) for (let x = 0; x < W; x++) if (A(x, y)) { sx += x; n++; }
  const cx = Math.round(sx / n);
  let y0 = -1;
  for (let y = top; y < top + 8; y++) if (isSkin(cx, y)) { y0 = y; break; }
  if (y0 < 0) throw new Error("找不到光頭（頭頂不是身體色）");
  // 頭＋脖子的身體色（往下填到脖子）；下巴＝往下收到跟脖子一樣寬那一列（脖子寬＝最寬那列往下 4～14 列最窄的，再往下是衣領）
  const seen = new Set(), q = [[cx, y0 + 1]], yMax = y0 + 70;
  while (q.length) {
    const [x, y] = q.pop(), k = y * W + x;
    if (x < 0 || y < y0 || x >= W || y > yMax || seen.has(k) || !isSkin(x, y)) continue;
    seen.add(k); q.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const rowL = {}, rowR = {}, rows = {};
  for (const k of seen) { const x = k % W, y = Math.floor(k / W); rows[y] = (rows[y] || 0) + 1; rowL[y] = Math.min(rowL[y] ?? W, x); rowR[y] = Math.max(rowR[y] ?? 0, x); }
  let maxW = 0, maxY = y0;
  for (let y = y0; y <= y0 + 25; y++) if ((rows[y] || 0) > maxW) { maxW = rows[y]; maxY = y; }   // 頭最寬只在頭頂往下 25 列找（露肩時肩膀跟脖子連成一片，不能算到肩膀）
  // 脖子＝往下收到不再變窄（接下來 3 列最窄的＋1 以內）、而且比頭最寬窄三成以上的那段；下顎一列一列收窄、臉頰幾乎一樣寬都不會誤判
  let chin = yMax + 1;
  for (let y = maxY + 1; y <= yMax; y++) {
    const w = rows[y] || 0;
    if (!w) { chin = y; break; }
    const nx = Math.min(rows[y + 1] || 0, rows[y + 2] || 0, rows[y + 3] || 0);
    if (w <= maxW * .7 && w <= nx + 1) { chin = y; break; }
  }
  if (rows[chin] && isLine(rowL[chin] - 1, chin) && isLine(rowR[chin] + 1, chin)) chin++;   // 下顎線兩邊收到這列才接脖子＝還是下巴
  // 肉臉＝下巴以上、跟頭連在一起的所有像素（含頭頂、兩側的輪廓線）
  const mask = new Set(), q2 = [[cx, y0 + 2]];
  while (q2.length) {
    const [x, y] = q2.pop(), k = y * W + x;
    if (y < 0 || y >= chin || !A(x, y) || mask.has(k)) continue;
    mask.add(k); q2.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
  }
  const neck = new Set([...seen].filter(k => Math.floor(k / W) >= chin));
  let x0 = W, x1 = 0, yy0 = H, yy1 = 0;
  for (const k of mask) { const x = k % W, y = Math.floor(k / W); x0 = Math.min(x0, x); x1 = Math.max(x1, x); yy0 = Math.min(yy0, y); yy1 = Math.max(yy1, y); }
  return { mask, neck, chin, x0, x1, y0: yy0, y1: yy1, top, cx };
}

/** 頭髮＝有頭髮那張跟光頭那張不一樣的像素（頭髮、頭髮的輪廓線）。 */
function hairPixels(fr, bare) {
  const out = new Set(), a = fr.data, b = bare.data;
  for (let i = 0, n = a.length / 4; i < n; i++) { const j = i * 4; if (a[j] !== b[j] || a[j + 1] !== b[j + 1] || a[j + 2] !== b[j + 2] || a[j + 3] !== b[j + 3]) if (a[j + 3]) out.add(i); }
  return out;
}

/** 模板的正方形（黑影座標）：以肉臉中心、邊長＝肉臉高 × 1.7（頭頂上面、脖子都留一點）。 */
function tplSquare(hd) {
  const hh = hd.y1 - hd.y0 + 1, S = Math.round(hh * 1.7);
  return { x: (hd.x0 + hd.x1 + 1) / 2 - S / 2, y: (hd.y0 + hd.y1 + 1) / 2 - S / 2 + hh * .08, S };
}

/** 肉臉模板（size×size PNG）：光頭那張——頭、脖子膚色，身體衣服淺灰，背景淺；糊一點讓模型只當構圖參考。 */
function makeTemplate(bare, hd, size = 1024) {
  const { width: W, data: d } = bare, sq = tplSquare(hd), k = size / sq.S;
  const raw = document.createElement("canvas"); raw.width = raw.height = size;
  const g = raw.getContext("2d");
  g.fillStyle = "#f3efe9"; g.fillRect(0, 0, size, size);
  for (let y = Math.floor(sq.y); y < sq.y + sq.S; y++) for (let x = Math.floor(sq.x); x < sq.x + sq.S; x++) {
    if (x < 0 || y < 0 || x >= W || y >= bare.height) continue;
    const i = (y * W + x) * 4; if (!d[i + 3]) continue;
    const skinLike = Math.abs(d[i] - SKIN[0]) <= 4 && Math.abs(d[i + 1] - SKIN[1]) <= 4 && Math.abs(d[i + 2] - SKIN[2]) <= 4;
    g.fillStyle = hd.mask.has(y * W + x) || skinLike ? "#f2d3c0" : "#cfc8d6";
    g.fillRect((x - sq.x) * k, (y - sq.y) * k, k + 1, k + 1);
  }
  const out = document.createElement("canvas"); out.width = out.height = size;
  const o = out.getContext("2d"); o.filter = `blur(${Math.round(size / 90)}px)`; o.drawImage(raw, 0, 0);
  return out;
}

const BUST_Z = 4;
function drawBust() {
  const cv = $("face-bust"), fr = FACE.frame, hd = FACE.head;
  if (!fr) return;
  const top = hd ? hd.top : 0, c = { x: 0, y: Math.max(0, top - 4), w: fr.width, h: Math.min(fr.height - Math.max(0, top - 4), 112) };
  FACE.crop = c;
  const Z = BUST_Z, W = fr.width;
  cv.width = c.w * Z; cv.height = c.h * Z;
  const g = cv.getContext("2d"); g.imageSmoothingEnabled = false;
  const src = document.createElement("canvas"); src.width = fr.width; src.height = fr.height; src.getContext("2d").putImageData(fr, 0, 0);
  g.fillStyle = "#efe8dc"; g.fillRect(0, 0, cv.width, cv.height);
  g.drawImage(src, c.x, c.y, c.w, c.h, 0, 0, cv.width, cv.height);   // ① 黑影
  if (!hd) return;
  const blocks = (set, gg) => { for (const k of set) { const x = k % W, y = Math.floor(k / W); gg.fillRect((x - c.x) * Z, (y - c.y) * Z, Z, Z); } };
  const copy = (set) => { for (const k of set) { const x = k % W, y = Math.floor(k / W); g.drawImage(src, x, y, 1, 1, (x - c.x) * Z, (y - c.y) * Z, Z, Z); } };
  // 2026-11-23 使用者：下巴不要照黑影的形狀裁——AI 的臉往下延伸到脖子一段（ext 格）再直直切，下面才是黑影的脖子
  const ext = Number($("face-neck").value) || 0, cut = hd.chin + ext;
  const faceMask = new Set(hd.mask), neckLow = new Set();
  for (const k of hd.neck) (Math.floor(k / W) < cut ? faceMask : neckLow).add(k);
  if (FACE.img) {   // ② AI 的臉：照模板比例縮回，裁成肉臉（＋上段脖子）的形狀
    const sq = tplSquare(hd), kk = Number($("face-k").value) / 100, dx = Number($("face-dx").value), dy = Number($("face-dy").value);
    const S = sq.S * kk, X = (sq.x + sq.S / 2 - S / 2 + dx - c.x) * Z, Y = (sq.y + sq.S / 2 - S / 2 + dy - c.y) * Z;
    const lay = document.createElement("canvas"); lay.width = cv.width; lay.height = cv.height;
    const lg = lay.getContext("2d");
    if ($("face-dark").checked) lg.filter = "grayscale(1) sepia(.35) hue-rotate(220deg) brightness(.62) contrast(1.15)";
    lg.drawImage(FACE.img, X, Y, S * Z, S * Z);
    lg.filter = "none";
    if (!$("face-nomask").checked) {
      const m = document.createElement("canvas"); m.width = cv.width; m.height = cv.height;
      const mg = m.getContext("2d"); mg.fillStyle = "#000"; blocks(faceMask, mg);
      lg.globalCompositeOperation = "destination-in"; lg.drawImage(m, 0, 0);
    }
    g.drawImage(lay, 0, 0);
    copy(FACE.hair);   // ③ 蓋上頭髮
    copy(neckLow);     // ④ 蓋上脖子（切口以下）
  }
  if ($("face-frame").checked) {   // 肉臉的邊（桃紅）
    g.strokeStyle = "rgba(255,79,216,.9)"; g.lineWidth = 1;
    for (const k of faceMask) {
      const x = k % W, y = Math.floor(k / W), X = (x - c.x) * Z, Y = (y - c.y) * Z;
      if (!faceMask.has(k - 1)) { g.beginPath(); g.moveTo(X + .5, Y); g.lineTo(X + .5, Y + Z); g.stroke(); }
      if (!faceMask.has(k + 1)) { g.beginPath(); g.moveTo(X + Z - .5, Y); g.lineTo(X + Z - .5, Y + Z); g.stroke(); }
      if (!faceMask.has(k - W)) { g.beginPath(); g.moveTo(X, Y + .5); g.lineTo(X + Z, Y + .5); g.stroke(); }
      if (!faceMask.has(k + W)) { g.beginPath(); g.moveTo(X, Y + Z - .5); g.lineTo(X + Z, Y + Z - .5); g.stroke(); }
    }
  }
}

async function renderBust() {
  const CS = window.ChatShadow;
  if (!CS || !CS.test) throw new Error("chat_shadow.js 沒載到");
  setStatus("face-status", "算黑影半身（有頭髮＋光頭兩張）…第一次要幾秒");
  const a = await CS.test.render(faceSpec(false), "breathe"), b = await CS.test.render(faceSpec(true), "breathe");
  const fr = a.frames && a.frames[0], bare = b.frames && b.frames[0];
  if (!fr || !bare) throw new Error("黑影沒算出來");
  FACE.frame = fr; FACE.bare = bare;
  FACE.head = findHead(bare);
  FACE.hair = hairPixels(fr, bare);
  const hd = FACE.head, tc = $("face-tpl-cv");
  tc.getContext("2d").drawImage(makeTemplate(bare, hd, 256), 0, 0, tc.width, tc.height);
  drawBust();
  setStatus("face-status", `✓ 肉臉 ${hd.x1 - hd.x0 + 1}×${hd.y1 - hd.y0 + 1} 格（頭頂到下巴，黑影座標 x ${hd.x0}～${hd.x1}、y ${hd.y0}～${hd.y1}）`);
}

async function faceBasePrompt() {
  if (!currentGirl) throw new Error("先選或抽一隻魅子");
  setStatus("face-status", "抓臉部 prompt…");
  const j = await apiJson("/api/imggen/preview", "POST", {
    provider: "comfy", character: currentGirl, name: currentGirl.name || "",
    rating: "sfw", style: $("ig-style").value, framing: "head", extra: "", negative: "", prompt: "",
  });
  const tr = j.trace || {};
  // 2026-11-23 使用者：告訴 AI 不要頭髮、光頭（頭髮之後由黑影蓋上去）→ 人設裡跟頭髮有關的 tag 拿掉，正向加光頭、負向加頭髮
  const HAIR_TAG = /hair|bangs|curl|wavy|ponytail|twintail|braid|bun\b|buns|bob cut|ahoge|sidelocks|hime cut|drill|ringlets|updo/i;
  // 只生臉：身材、衣服的 tag 也用不到（還會跟負向的 breasts 打架）→ 一起拿掉；膚色留著
  const BODY_TAG = /breast|chest|cleavage|thigh|waist|hips?\b|butt|ass\b|legs?\b|skinny|slender|plump|chubby|curvy|petite|muscular|toned|abs\b|navel|belly|clothed|clothes|t-shirt|shirt|bra\b|thong|panties|underwear|lingerie|bikini|dress|skirt|nude|naked|nipples?|areola|pussy/i;
  const keep = (t) => t && !(HAIR_TAG.test(t) && !/^\(?(bald|hairless|no hair)/i.test(t)) && !BODY_TAG.test(t);
  const base = String(tr.comfy_prompt || "").split(",").map((t) => t.trim()).filter(keep).join(", ");
  $("face-prompt").value = [base, "bald, no hair, hairless, bald head, close-up, head only, front view, facing viewer, straight-on, centered face, symmetrical face, neutral expression, simple background, white background"].filter(Boolean).join(", ");
  $("face-negative").value = [String(tr.comfy_negative || "").trim(), "hair, long hair, short hair, bangs, ponytail, twintails, braid, hair bun, hair ornament, hairband, hat, headwear, body, shoulders, breasts, cleavage, hands, from side, profile, looking away, tilted head, multiple views, text, watermark"].filter(Boolean).join(", ");
  setStatus("face-status", "✓ 已帶入臉部 prompt（可改）");
}

async function uploadPng(canvas, name) {
  const blob = await new Promise((ok) => canvas.toBlob(ok, "image/png"));
  const fd = new FormData(); fd.append("file", blob, name);
  const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
  const data = await r.json().catch(() => ({}));
  if (!r.ok || !data.url) throw new Error("模板上傳失敗：" + (data.detail || r.status));
  return data.url;
}

async function genFace() {
  const btn = $("btn-face-gen"); btn.disabled = true;
  try {
    if (!currentGirl) throw new Error("先選或抽一隻魅子");
    if (!FACE.head) await renderBust();
    if (!$("face-prompt").value.trim()) await faceBasePrompt();
    let pose = "";
    if ($("face-tpl").checked) { setStatus("face-status", "上傳臉框模板…"); pose = await uploadPng(makeTemplate(FACE.bare, FACE.head, 1024), "face_tpl.png"); }
    const body = {
      key: `editpic-face:${Date.now().toString(36)}`, provider: "comfy", character: currentGirl, name: currentGirl.name || "",
      rating: "sfw", style: $("ig-style").value, framing: "head",
      prompt: $("face-prompt").value.trim(), negative: $("face-negative").value.trim(), extra: "",
      pose_ref: pose, pose_denoise: pose ? Number($("face-denoise").value || .75) : 0,
      width: 1024, height: 1024, seed: Number($("ig-seed")?.value || 0),
      ckpt: $("ig-ckpt")?.value || currentGirl.comfyCkpt || "", comfy_url: $("ig-comfy")?.value.trim() || "", retry: true,
    };
    const t0 = Date.now();
    const r = await waitImg(body, 360000, "face-status");
    if (r.status !== "done" || !r.result) throw new Error(r.error || "生圖失敗");
    const url = String(r.result) + "?t=" + Date.now();
    const img = new Image(); img.crossOrigin = "anonymous";
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error("圖讀不到")); img.src = url; });
    FACE.img = img; FACE.imgUrl = url; $("face-img").src = url;
    drawBust();
    setStatus("face-status", `✓ ${((Date.now() - t0) / 1000).toFixed(1)}s · ${pose ? "肉臉模板圖生圖" : "文生圖頭像"} · ${r.result}`);
  } catch (e) { setStatus("face-status", e.message, true); }
  btn.disabled = false;
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
  $("btn-face-bust")?.addEventListener("click", () => renderBust().catch((e) => setStatus("face-status", e.message, true)));
  $("face-stage")?.addEventListener("change", () => { if (FACE.frame) renderBust().catch((e) => setStatus("face-status", e.message, true)); });
  $("btn-face-prompt")?.addEventListener("click", () => faceBasePrompt().catch((e) => setStatus("face-status", e.message, true)));
  $("btn-face-gen")?.addEventListener("click", () => genFace());
  for (const id of ["face-k", "face-dx", "face-dy", "face-neck"]) $(id)?.addEventListener("input", () => { $(id + "-v").textContent = id === "face-k" ? $(id).value + "%" : $(id).value; drawBust(); });
  for (const id of ["face-frame", "face-dark", "face-nomask"]) $(id)?.addEventListener("change", drawBust);

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
