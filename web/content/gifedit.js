/** gifedit：接客偷看 30 幀 → 每張可圖生圖（Comfy），底下可播。不寫進遊戲。 */
import { peekStills, MAN_BUILDS } from "./escort_peek.js?v=6";
import { POSE_ZH } from "./escort.js?v=5";

const $ = (id) => document.getElementById(id);
const POSES = ["missionary", "cowgirl", "doggy", "kiss", "reverse"];
const POSE_TAGS = {
  missionary: "missionary position, lying on back, legs spread, man kneeling between legs",
  cowgirl: "cowgirl position, girl on top, straddling, man lying on back",
  doggy: "doggystyle, on all fours, from behind, hanging breasts, man kneeling behind",
  kiss: "face-to-face sitting, straddling his lap, deep kiss, hugging, arms around neck",
  reverse: "reverse cowgirl sitting on lap, man behind her, grabbing breasts, groping from behind",
};
const MAN_ZH = {
  average: "普通", slim: "瘦", muscular: "壯", fat: "胖", tall: "高", short: "矮", old: "老",
};
const TEST_BUILDS = {
  A_bony_150: { height_cm: 150, build: "骨感清瘦", cup: "A 罩杯、平坦俐落", hair: "短髮鮑伯" },
  D_balanced_162: { height_cm: 162, build: "勻稱有致", cup: "D 罩杯、飽滿有份量", hair: "中分長髮" },
  F_chubby_156: { height_cm: 156, build: "微肉圓潤", cup: "F 罩杯", hair: "雙馬尾" },
  I_hourglass_172: { height_cm: 172, build: "凹凸有致的沙漏身材", cup: "I 罩杯、不科學爆乳", hair: "大波浪長髮" },
};

const frames = [];
let busy = false;
let token = 0;
let lastAuto = "";
let playing = false;
let playTimer = 0;
let playIdx = 0;
let pass = 1;

function status(msg, err) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (err ? " err" : "");
}
function roster() {
  try {
    const bag = JSON.parse(localStorage.getItem("yorozuya_cache") || "null");
    return (bag?.data?.succubi || []).filter((s) => s && s.look);
  } catch { return []; }
}
function selectedGirl() {
  const v = $("who").value;
  if (v.startsWith("test:")) {
    const k = v.slice(5);
    const look = TEST_BUILDS[k];
    return look ? { id: `giftest_${k}`, name: k, look } : null;
  }
  if (v.startsWith("roster:")) return roster().find((s) => String(s.id) === v.slice(7)) || null;
  return null;
}
function fillWho() {
  const sel = $("who");
  const keep = sel.value;
  sel.replaceChildren();
  const add = (v, t) => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = t;
    sel.appendChild(o);
  };
  for (const k of Object.keys(TEST_BUILDS)) add(`test:${k}`, `測試身材 ${k}`);
  for (const s of roster()) add(`roster:${s.id}`, `名冊 ${s.name || s.id}`);
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep;
  else if (sel.options.length) sel.value = "test:D_balanced_162";
}
function autoPositive() {
  const pose = $("pose").value;
  const man = $("man").value;
  return `1girl, 1boy, sex, nude, ${POSE_TAGS[pose] || pose}, faceless male, ${man} build man, bedroom, warm lamp light, side view`;
}
function syncPositive() {
  const next = autoPositive();
  const cur = $("pos").value;
  if (!cur.trim() || cur === lastAuto) $("pos").value = next;
  lastAuto = next;
}
function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.3;
  return Math.min(0.9, Math.max(0.25, Math.round(n * 100) / 100));
}
function sharedDenoise() {
  const n = clampDenoise($("denoise").value);
  $("denoise").value = String(n);
  return n;
}
function applySharedDenoise() {
  const n = sharedDenoise();
  for (const f of frames) f.denoise = n;
  for (const input of document.querySelectorAll(".frame .denoise")) input.value = String(n);
}
function ensureSeed() {
  let n = Number($("seed").value);
  if (!Number.isInteger(n) || n <= 0) {
    n = Math.floor(Math.random() * 2 ** 31) || 1;
    $("seed").value = String(n);
  }
  return n;
}
function characterOf(g) {
  return {
    id: g.id,
    name: g.name || "",
    look: g.look,
    personality: g.personality,
    stage: g.roomStage || g.stage || "",
    outfitName: g.outfitName || "",
  };
}
function selectedCkpt() {
  return ($("ckpt").value || "").trim();
}
async function loadModels() {
  const sel = $("ckpt");
  const keep = sel.value;
  sel.replaceChildren();
  const wait = document.createElement("option");
  wait.value = "";
  wait.textContent = "載入模型清單…";
  sel.appendChild(wait);
  sel.value = "";
  try {
    const r = await fetch("/api/comfy/status", { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    const names = Array.isArray(j.checkpoints) ? j.checkpoints : [];
    const bad = new Set(j.bad_checkpoints || []);
    sel.replaceChildren();
    const pick = document.createElement("option");
    pick.value = "";
    pick.textContent = names.length ? "請選模型" : "沒有模型";
    sel.appendChild(pick);
    for (const name of names) {
      const o = document.createElement("option");
      o.value = name;
      o.textContent = bad.has(name) ? `${name} · 壞檔` : name;
      sel.appendChild(o);
    }
    sel.value = names.includes(keep) ? keep : "";
    if (!j.ok) status("Comfy 連不上，選不到模型。", true);
    else if (!names.length) status("Comfy 沒有 checkpoint。", true);
  } catch (err) {
    sel.replaceChildren();
    const o = document.createElement("option");
    o.value = "";
    o.textContent = "模型清單失敗";
    sel.appendChild(o);
    status(String(err?.message || err), true);
  }
}
function stopPlay() {
  playing = false;
  clearTimeout(playTimer);
  $("player").classList.remove("playing");
  document.body.classList.remove("playing");
  $("btn-play").textContent = "測試動畫";
  $("stage").hidden = true;
  $("stage-img").hidden = true;
}
function showPlayFrame(i) {
  const f = frames[i];
  if (!f) return;
  const stage = $("stage");
  const img = $("stage-img");
  const shown = f.url || f.baseUrl || "";
  if (shown) {
    stage.hidden = true;
    img.hidden = false;
    if (img.src !== new URL(shown, location.origin).href) img.src = shown;
  } else {
    img.hidden = true;
    stage.hidden = false;
    if (stage.width !== f.canvas.width || stage.height !== f.canvas.height) {
      stage.width = f.canvas.width;
      stage.height = f.canvas.height;
    }
    const g = stage.getContext("2d");
    g.imageSmoothingEnabled = false;
    g.drawImage(f.canvas, 0, 0);
  }
  const kind = f.url ? `第 ${pass} 輪` : (f.baseUrl ? "上一輪" : "來源");
  $("play-label").textContent = `${i + 1} / ${frames.length}　${kind}　${f.ms}ms`;
}
function playTick() {
  if (!playing || !frames.length) return;
  showPlayFrame(playIdx);
  const ms = Math.max(40, frames[playIdx].ms || 80);
  playTimer = setTimeout(() => {
    playIdx = (playIdx + 1) % frames.length;
    playTick();
  }, ms);
}
function togglePlay() {
  if (playing) { stopPlay(); return; }
  if (!frames.length) { status("先載入圖片。", true); return; }
  playing = true;
  playIdx = 0;
  $("player").classList.add("playing");
  document.body.classList.add("playing");
  $("btn-play").textContent = "停止";
  playTick();
}
function setBusy(on) {
  busy = on;
  $("btn-load").disabled = on;
  $("btn-all").disabled = on;
  $("btn-restart").disabled = on;
  for (const b of document.querySelectorAll(".frame .gen")) b.disabled = on;
}
function paint() {
  const box = $("frames");
  box.replaceChildren();
  frames.forEach((f, i) => {
    const card = document.createElement("article");
    card.className = "frame";
    card.dataset.i = String(i);
    const top = document.createElement("div");
    top.className = "frame-top";
    const title = document.createElement("b");
    title.textContent = `#${i + 1}`;
    const meta = document.createElement("span");
    meta.className = "dim";
    meta.textContent = `幀 ${f.frame}・${f.ms}ms`;
    const msg = document.createElement("span");
    msg.className = "msg dim";
    msg.textContent = f.msg || "";
    top.append(title, meta, msg);
    const pics = document.createElement("div");
    pics.className = "pics";
    syncPics(pics, f, i);
    const row = document.createElement("div");
    row.className = "row";
    const lab = document.createElement("label");
    lab.append("noisdens");
    const input = document.createElement("input");
    input.type = "number";
    input.min = "0.25";
    input.max = "0.9";
    input.step = "0.05";
    input.className = "denoise";
    input.value = String(f.denoise);
    input.addEventListener("change", () => { f.denoise = clampDenoise(input.value); input.value = String(f.denoise); });
    lab.appendChild(input);
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "gen";
    btn.textContent = "產生";
    btn.disabled = busy;
    btn.addEventListener("click", () => { void runOne(i); });
    row.append(lab, btn);
    card.append(top, pics, row);
    box.appendChild(card);
  });
}
function paintRow(i) {
  const card = document.querySelector(`.frame[data-i="${i}"]`);
  const f = frames[i];
  if (!card || !f) return;
  card.querySelector(".msg").textContent = f.msg || "";
  syncPics(card.querySelector(".pics"), f, i);
}
function syncPics(pics, f, i) {
  let canvas = pics.querySelector("canvas");
  let base = pics.querySelector("img.base");
  let out = pics.querySelector("img.out");
  if (f.baseUrl) {
    if (canvas) canvas.remove();
    if (!base) {
      base = document.createElement("img");
      base.className = "base";
      base.alt = `第 ${i + 1} 張基底`;
      pics.prepend(base);
    }
    if (base.getAttribute("src") !== f.baseUrl) base.src = f.baseUrl;
  } else {
    if (base) base.remove();
    if (!canvas) pics.prepend(f.canvas);
  }
  if (f.url && f.url !== f.baseUrl) {
    if (!out) {
      out = document.createElement("img");
      out.className = "out";
      out.alt = `第 ${i + 1} 張這一輪`;
      pics.appendChild(out);
    }
    if (out.getAttribute("src") !== f.url) out.src = f.url;
  } else if (out) out.remove();
}
async function loadFrames() {
  if (busy) return;
  const g = selectedGirl();
  if (!g?.look) { status("先選一位女子。", true); return; }
  if (!window.RoomDoll) { status("人偶沒載入。", true); return; }
  const my = ++token;
  stopPlay();
  const pose = $("pose").value;
  const man = $("man").value;
  status("畫來源幀…");
  $("btn-load").disabled = true;
  try {
    const stills = await peekStills({ look: g.look, pose, man, scale: 4 });
    if (my !== token) return;
    frames.length = 0;
    const denoise = sharedDenoise();
    pass = 1;
    for (const s of stills) frames.push({ canvas: s.canvas, frame: s.frame, ms: s.ms, denoise, baseUrl: "", url: "", msg: "" });
    paint();
    status(`已載入 ${frames.length} 張（${POSE_ZH[pose] || pose}・${MAN_ZH[man] || man}）。`);
  } catch (err) {
    if (my === token) status(String(err?.message || err), true);
  } finally {
    if (my === token) $("btn-load").disabled = false;
  }
}
async function upload(canvas, name) {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  if (!blob) throw new Error("來源圖沒轉成 PNG");
  const fd = new FormData();
  fd.append("file", blob, name);
  const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(typeof j.detail === "string" ? j.detail : "參考圖沒上去");
  return j.url;
}
async function imggen(body) {
  const post = async (b) => {
    const r = await fetch("/api/imggen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "HTTP " + r.status);
    return j;
  };
  let cur = await post(body);
  const key = cur.key || body.key;
  const end = Date.now() + 360000;
  while (Date.now() < end) {
    if (cur.status === "done" || cur.status === "error") return cur;
    await new Promise((r) => setTimeout(r, 1500));
    cur = await post({ ...body, key, retry: false });
  }
  return { status: "error", error: "逾時" };
}
async function runOne(i, myToken = 0) {
  const nested = myToken > 0;
  if (!nested) {
    if (busy) return false;
    myToken = ++token;
  }
  const f = frames[i];
  const g = selectedGirl();
  const ckpt = selectedCkpt();
  if (!ckpt) { status("先選產生模型。", true); return false; }
  if (!f || !g?.look) { status("先載入，並選一位女子。", true); return false; }
  const seed = ensureSeed();
  setBusy(true);
  f.msg = f.baseUrl ? "以上一輪為底…" : "上傳來源…";
  f.url = "";
  paintRow(i);
  try {
    status(`第 ${pass} 輪・第 ${i + 1}/${frames.length} 張：${f.baseUrl ? "以上一輪為底" : "上傳來源"}…`);
    const ref = f.baseUrl || await upload(f.canvas, `gifedit_${myToken}_${i}.png`);
    if (myToken !== token) return false;
    f.msg = "產生中…";
    paintRow(i);
    status(`第 ${i + 1}/${frames.length} 張：圖生圖（noisdens ${f.denoise}、seed ${seed}）…`);
    const r = await imggen({
      key: `gifedit:${g.id || "g"}:${myToken}:${i}`,
      provider: "comfy",
      model: "grok-4.5",
      framing: "full",
      rating: "nsfw",
      style: "anime",
      character: characterOf(g),
      extra: $("pos").value.trim(),
      negative: $("neg").value.trim(),
      prompt: "",
      cutout: false,
      flat_bg: false,
      retry: true,
      seed,
      ckpt,
      pose_ref: ref,
      pose_denoise: f.denoise,
    });
    if (myToken !== token) return false;
    if (r.status === "done" && r.result) {
      f.url = r.result;
      f.msg = "完成";
      paintRow(i);
      return true;
    }
    f.msg = r.error || "失敗";
    paintRow(i);
    status(`第 ${i + 1} 張失敗：${f.msg}`, true);
    return false;
  } catch (err) {
    if (myToken !== token) return false;
    f.msg = String(err?.message || err);
    paintRow(i);
    status(f.msg, true);
    return false;
  } finally {
    if (!nested && myToken === token) setBusy(false);
  }
}
function promoteRound() {
  if (!frames.length || !frames.every((f) => f.url)) return false;
  for (const f of frames) {
    f.baseUrl = f.url;
    f.url = "";
    f.msg = "上一輪當底";
  }
  pass += 1;
  for (let i = 0; i < frames.length; i++) paintRow(i);
  return true;
}
function restartRound() {
  if (busy || !frames.length) return;
  stopPlay();
  pass = 1;
  for (const f of frames) {
    f.baseUrl = "";
    f.url = "";
    f.msg = "";
  }
  paint();
  status("已回到來源圖。");
}
async function runAll() {
  if (busy) return;
  if (!frames.length) { status("先載入圖片。", true); return; }
  if (!selectedCkpt()) { status("先選產生模型。", true); return; }
  const next = promoteRound();
  if (next) status(`第 ${pass} 輪：以上一輪的圖為底。`);
  setBusy(true);
  const my = ++token;
  try {
    for (let i = 0; i < frames.length; i++) {
      if (my !== token) return;
      if (frames[i].url) continue;
      const ok = await runOne(i, my);
      if (!ok) return;
    }
    if (my === token) status(`第 ${pass} 輪畫完了。再按一次全部產生會用這一輪當底。`);
  } finally {
    if (my === token) setBusy(false);
  }
}

function boot() {
  $("pose").innerHTML = POSES.map((p) => `<option value="${p}">${POSE_ZH[p] || p}</option>`).join("");
  $("man").innerHTML = Object.keys(MAN_BUILDS).map((m) => `<option value="${m}">${MAN_ZH[m] || m} ${m}</option>`).join("");
  fillWho();
  syncPositive();
  void loadModels();
  $("pose").addEventListener("change", syncPositive);
  $("man").addEventListener("change", syncPositive);
  $("who").addEventListener("focus", fillWho);
  $("btn-load").addEventListener("click", () => { void loadFrames(); });
  $("denoise").addEventListener("change", applySharedDenoise);
  $("btn-all").addEventListener("click", () => { void runAll(); });
  $("btn-restart").addEventListener("click", restartRound);
  $("btn-play").addEventListener("click", togglePlay);
  $("btn-exit").addEventListener("click", stopPlay);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playing) stopPlay();
  });
}
boot();
