/** test_bodyM：抽妹子 → 選喜怒哀樂 → 由上往下加幀。每一幀可先生圖查看；播放才把已畫好的幀放大到畫面中央。 */
import { setPools, generateGirl } from "./girl_gen.js";

// 與 testword 立繪 PO_DEFS 的半身喜怒哀樂同一句（不含害羞）。
const EMOTIONS = [
  { id: "xi", shot: "half_xi", label: "喜", extra: "half-body portrait, looking at viewer, happy expression, soft smile, cheerful, gentle smile" },
  { id: "nu", shot: "half_nu", label: "怒", extra: "half-body portrait, looking at viewer, angry expression, furrowed brows, frown, upset, glaring" },
  { id: "ai", shot: "half_ai", label: "哀", extra: "half-body portrait, looking at viewer, sad expression, teary eyes, sorrowful, downcast eyes, melancholy" },
  { id: "le", shot: "half_le", label: "樂", extra: "half-body portrait, looking at viewer, joyful expression, bright smile, laughing, delighted, sparkling eyes" },
];

const LOOK_LINES = [
  ["年齡", (g) => g.look?.age != null ? `${g.look.age} 歲` : ""],
  ["身高", (g) => g.look?.height_cm ? `${g.look.height_cm} cm` : ""],
  ["體型", (g) => g.look?.build || ""],
  ["罩杯", (g) => g.look?.cup || ""],
  ["胸型", (g) => g.look?.breast_shape || ""],
  ["眼睛", (g) => [g.look?.eyes, g.look?.eye_color].filter(Boolean).join(" · ")],
  ["臉", (g) => g.look?.face || ""],
  ["嘴", (g) => g.look?.mouth || ""],
  ["頭髮", (g) => [g.look?.hair, g.look?.hair_color].filter(Boolean).join(" · ")],
  ["衣服", (g) => g.look?.style || g.look?.wardrobe?.[0] || ""],
  ["特徵", (g) => g.look?.feature || ""],
  ["性慾", (g) => g.libido?.name || ""],
  ["個性", (g) => g.archetype || (g.personality || []).join("、")],
  ["模型", (g) => g.comfyCkpt || "（還沒綁）"],
];

const $ = (id) => document.getElementById(id);

const state = {
  girl: null,
  emotion: "xi",
  frames: [],
  timer: 0,
  playAt: 0,
  playing: false,
  busy: false,
  fillGen: 0,
};

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(msg, err) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (err ? " err" : "");
}

function gameSettings() {
  try {
    const bag = JSON.parse(localStorage.getItem("yorozuya_cache") || "null");
    return bag?.data?.settings || {};
  } catch {
    return {};
  }
}

function emotionOf(id) {
  return EMOTIONS.find((e) => e.id === id) || EMOTIONS[0];
}

function wornOutfit(g) {
  const L = g?.look || {};
  const ward = Array.isArray(L.wardrobe) ? L.wardrobe : [];
  const ero = Array.isArray(L.eroticOutfits) ? L.eroticOutfits : [];
  const slp = Array.isArray(L.sleepOutfits) ? L.sleepOutfits : [];
  const pick = g?.outfitPick;
  if (typeof pick === "string" && pick[0] === "e") {
    const i = Number(pick.slice(1));
    if (Number.isInteger(i) && ero[i]) return String(ero[i]);
  }
  if (typeof pick === "string" && pick[0] === "s") {
    const i = Number(pick.slice(1));
    if (Number.isInteger(i) && slp[i]) return String(slp[i]);
  }
  if (Number.isInteger(pick) && pick >= 0 && pick < ward.length) return String(ward[pick] || "");
  return String(L.career_outfit || L.style || "");
}

function imageRating(g) {
  const st = g?.stage || "stranger";
  return st === "wife" || st === "girlfriend" ? "nsfw" : "sfw";
}

function composeExtra(g, emo) {
  const bits = [emo.extra];
  const worn = wornOutfit(g);
  if (worn) bits.push(`wearing: ${worn}`);
  return bits.filter(Boolean).join(", ");
}

function promptTouched(f) {
  const pos = (f.pos || "").trim();
  const neg = (f.neg || "").trim();
  if (!pos && !neg) return false;
  return pos !== (f.autoPos || "").trim() || neg !== (f.autoNeg || "").trim();
}

function negativeDelta(frame) {
  const neg = (frame.neg || "").trim();
  const auto = (frame.autoNeg || "").trim();
  if (!neg || neg === auto) return "";
  if (auto && neg.startsWith(auto)) return neg.slice(auto.length).replace(/^[\s,]+/, "");
  return neg;
}

// 與 server/sdtags.py 的 FLAT_BG_NEGATIVE 同一句。預覽負向有這句；
// 這頁不帶立繪 shot、不去背，伺服器不會自己加，補在負向才跟框裡同一段。
const FLAT_BG_NEGATIVE = "scenery, detailed background, indoors, outdoors, gradient background";

function paintEmotions() {
  const box = $("emotions");
  box.replaceChildren();
  for (const e of EMOTIONS) {
    const lab = document.createElement("label");
    lab.className = "emo" + (state.emotion === e.id ? " on" : "");
    const input = document.createElement("input");
    input.type = "radio";
    input.name = "emotion";
    input.value = e.id;
    input.checked = state.emotion === e.id;
    input.addEventListener("change", () => {
      readFrameInputs();
      state.emotion = e.id;
      paintEmotions();
      void fillPrompts();
    });
    lab.append(input, document.createTextNode(" " + e.label));
    box.append(lab);
  }
}

function paintGirl() {
  const box = $("girl");
  const g = state.girl;
  if (!g) {
    box.className = "card dim";
    box.textContent = "還沒抽。";
    return;
  }
  box.className = "card";
  const bits = LOOK_LINES
    .map(([name, pick]) => {
      const v = pick(g);
      return v ? `<b>${esc(name)}</b><span>${esc(v)}</span>` : "";
    })
    .filter(Boolean)
    .join("");
  box.innerHTML = `<p><b>${esc(g.name)}</b> <span class="dim">${esc(g.rarity || "")}</span></p><div class="params">${bits}</div>`;
}

function frameById(id) {
  return state.frames.find((f) => f.id === id) || null;
}

function readFrameInputs() {
  for (const f of state.frames) {
    const root = document.querySelector(`.frame[data-id="${f.id}"]`);
    if (!root) continue;
    f.pos = root.querySelector(".pos")?.value || "";
    f.neg = root.querySelector(".neg")?.value || "";
    const n = Number(root.querySelector(".denoise")?.value);
    f.denoise = Number.isFinite(n) ? n : 0.55;
  }
}

function paintFrames(opts) {
  if (!opts || opts.read !== false) readFrameInputs();
  const box = $("frames");
  box.replaceChildren();
  state.frames.forEach((f, i) => {
    const root = document.createElement("article");
    root.className = "frame";
    root.dataset.id = f.id;
    const result = f.url
      ? `<img class="shot" alt="第 ${i + 1} 幀" src="${esc(f.url)}">`
      : `<div class="shot empty">還沒生圖</div>`;
    const ref = f.ref
      ? `<img class="shot sm" alt="參考" src="${esc(f.ref)}">`
      : "";
    root.innerHTML = `
      <div class="frame-top">
        <b>第 ${i + 1} 幀</b>
        <span class="dim">${esc(f.msg || "還沒生圖")}</span>
      </div>
      <div class="row frame-actions">
        <button type="button" class="gen">生圖</button>
        <label class="filebtn">參考圖<input class="ref" type="file" accept="image/*" hidden></label>
        ${ref}
        <button type="button" class="del">刪除</button>
      </div>
      ${result}
      <label>nosidens <span class="dim">圖生圖 denoise，0.25～0.9</span>
        <input class="denoise" type="number" min="0.25" max="0.9" step="0.05" value="${esc(f.denoise)}">
      </label>
      <label>正向 prompt<textarea class="pos">${esc(f.pos)}</textarea></label>
      <label>負向 prompt<textarea class="neg">${esc(f.neg)}</textarea></label>`;
    root.querySelector(".ref").addEventListener("change", (ev) => { void onPickRef(f.id, ev.target); });
    root.querySelector(".gen").addEventListener("click", () => { void generateFrame(f.id); });
    root.querySelector(".del").addEventListener("click", () => removeFrame(f.id));
    box.append(root);
  });
}

function blankFrame() {
  return {
    id: "f" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    pos: "",
    neg: "",
    autoPos: "",
    autoNeg: "",
    denoise: 0.55,
    ref: "",
    url: "",
    msg: "",
  };
}

async function addFrame() {
  readFrameInputs();
  state.frames.push(blankFrame());
  paintFrames({ read: false });
  await fillPrompts();
}

function removeFrame(id) {
  readFrameInputs();
  state.frames = state.frames.filter((f) => f.id !== id);
  paintFrames();
  if (!state.frames.some((f) => f.url)) stopPlay();
}

async function onPickRef(id, input) {
  const file = input.files?.[0];
  input.value = "";
  const f = frameById(id);
  if (!file || !f) return;
  setStatus("參考圖上傳中…");
  try {
    const body = new FormData();
    body.append("file", file, file.name || "ref.png");
    const r = await fetch("/api/pose-refs", { method: "POST", body });
    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.url) throw new Error(j.detail || ("HTTP " + r.status));
    f.ref = j.url;
    paintFrames();
    setStatus("參考圖已加上。產生時走圖生圖。");
  } catch (err) {
    setStatus("參考圖沒上去：" + (err?.message || err), true);
  }
}

async function bindModel(girl) {
  const url = $("comfy-url").value.trim();
  try {
    const r = await fetch("/api/comfy/status?url=" + encodeURIComponent(url), { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    const bad = new Set(j.bad_checkpoints || []);
    const list = (j.checkpoints || []).filter((n) => n && !bad.has(n));
    if (!list.length) return;
    girl.comfyCkpt = list[Math.floor(Math.random() * list.length)];
  } catch {
    /* 沒有模型清單就讓伺服器自己挑 */
  }
}

async function drawGirl() {
  setStatus("抽妹子…");
  try {
    const r = await fetch("/content/persona_pools.json?ts=" + Date.now(), { cache: "no-store" });
    if (!r.ok) throw new Error("HTTP " + r.status);
    setPools(await r.json());
  } catch (err) {
    setStatus("人設池沒載到：" + (err?.message || err), true);
    return;
  }
  const gen = generateGirl({
    luck: 10 + Math.floor(Math.random() * 46),
    rating: "nsfw",
    usedNames: state.girl?.name ? [state.girl.name] : [],
  });
  if (!gen?.name) {
    setStatus("人設池沒載到，抽不起來。", true);
    return;
  }
  const girl = {
    ...gen,
    id: "bm_" + Date.now().toString(36),
    affection: 0,
    stage: "stranger",
    portraits: {},
  };
  await bindModel(girl);
  state.girl = girl;
  paintGirl();
  await fillPrompts();
  if (!$("status").classList.contains("err")) {
    const model = girl.comfyCkpt
      ? `模型 ${girl.comfyCkpt}。`
      : "模型清單是空的，生圖時由伺服器挑。";
    const filled = state.frames.some((f) => f.autoPos);
    const emo = emotionOf(state.emotion).label;
    setStatus(`抽到 ${girl.name}。${model}${filled ? `正向、負向已照「${emo}」填好。` : "加幀之後會自己填正向、負向。"}`);
  }
}

function portraitBody(g, emo) {
  const comfy = $("provider").value === "comfy";
  return {
    provider: comfy ? "comfy" : "grok-img",
    model: "grok-4.5",
    framing: "half",
    rating: imageRating(g),
    style: "anime",
    character: g,
    outfit: wornOutfit(g),
    extra: composeExtra(g, emo),
    prompt: "",
    cutout: true,
    flat_bg: true,
    shot: emo.shot,
    char_id: g.id,
    ckpt: g.comfyCkpt || "",
    comfy_url: $("comfy-url").value.trim(),
  };
}

async function previewPortrait() {
  const g = state.girl;
  const emo = emotionOf(state.emotion);
  const r = await fetch("/api/imggen/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(portraitBody(g, emo)),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = typeof j.detail === "string" ? j.detail : ("HTTP " + r.status);
    throw new Error(detail);
  }
  const tr = j.trace || {};
  const comfy = $("provider").value === "comfy";
  const pos = String((comfy ? tr.comfy_prompt : tr.grok_prompt) || "").trim();
  const neg = String(tr.comfy_negative || "").trim();
  if (!pos) throw new Error("預覽沒有正向");
  return { pos, neg };
}

async function fillPrompts() {
  if (!state.girl || !state.frames.length) return;
  readFrameInputs();
  if (!state.frames.some((f) => !promptTouched(f))) return;
  const gen = ++state.fillGen;
  const emo = emotionOf(state.emotion);
  if (!state.busy) setStatus(`正在照立繪「${emo.label}」組正向、負向…`);
  let pair;
  try {
    pair = await previewPortrait();
  } catch (err) {
    if (gen !== state.fillGen) return;
    const fallback = composeExtra(state.girl, emo);
    readFrameInputs();
    for (const f of state.frames) {
      if (promptTouched(f)) continue;
      f.pos = fallback;
      f.neg = "";
      f.autoPos = fallback;
      f.autoNeg = "";
    }
    paintFrames({ read: false });
    if (!state.busy) setStatus("正向、負向預覽失敗，先填表情那句：" + (err?.message || err), true);
    return;
  }
  if (gen !== state.fillGen) return;
  readFrameInputs();
  let wrote = false;
  for (const f of state.frames) {
    if (promptTouched(f)) continue;
    f.pos = pair.pos;
    f.neg = pair.neg;
    f.autoPos = pair.pos;
    f.autoNeg = pair.neg;
    wrote = true;
  }
  if (!wrote) return;
  paintFrames({ read: false });
  if (!state.busy) setStatus(`正向、負向已照「${emo.label}」填好。`);
}

function engineBody(frame) {
  const g = state.girl;
  const emo = emotionOf(state.emotion);
  const comfy = $("provider").value === "comfy";
  const pos = (frame.pos || "").trim();
  const posEdited = Boolean(pos) && pos !== (frame.autoPos || "").trim();
  // 沒改過：prompt 留空，讓伺服器用跟立繪相同的 extra 自己組。
  // 不要把預覽出來的整段負向塞回去，否則會再包一層。也不要帶 shot，否則圖生圖參考會被拿掉。
  const body = {
    key: `bodym:${g.id}:${frame.id}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: "grok-4.5",
    framing: "half",
    rating: imageRating(g),
    style: "anime",
    character: g,
    outfit: wornOutfit(g),
    extra: composeExtra(g, emo),
    negative: [comfy ? FLAT_BG_NEGATIVE : "", negativeDelta(frame)].filter(Boolean).join(", "),
    prompt: "",
    cutout: false,
    flat_bg: true,
    retry: true,
    ckpt: g.comfyCkpt || "",
    comfy_url: $("comfy-url").value.trim(),
  };
  if (comfy && posEdited) {
    body.prompt = pos;
    body.extra = "";
  }
  if (frame.ref) {
    body.pose_ref = frame.ref;
    body.pose_denoise = Math.min(0.9, Math.max(0.25, Number(frame.denoise) || 0.55));
  }
  return body;
}

async function postImg(body) {
  const r = await fetch("/api/imggen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const detail = typeof j.detail === "string" ? j.detail : ("HTTP " + r.status);
    throw new Error(detail);
  }
  return j;
}

async function waitImg(body) {
  let key = body.key;
  let cur = await postImg(body);
  if (cur.key) key = cur.key;
  const deadline = Date.now() + 360000;
  while (Date.now() < deadline) {
    if (cur.status === "done" || cur.status === "error") return cur;
    await new Promise((res) => setTimeout(res, 1500));
    cur = await postImg({ ...body, key, retry: false });
    if (cur.key) key = cur.key;
  }
  return { status: "error", error: "逾時" };
}

async function generateFrame(id, opts) {
  const fromAuto = !!opts?.fromAuto;
  if (state.busy && !fromAuto) {
    setStatus("上一張還在畫。", true);
    return;
  }
  readFrameInputs();
  const f = frameById(id);
  if (!state.girl) {
    setStatus("先抽妹子。", true);
    return;
  }
  if (!f) return;
  if (!fromAuto) {
    stopPlay();
    state.busy = true;
  }
  try {
    if (!(f.pos || "").trim() && !(f.neg || "").trim()) await fillPrompts();
    if (!frameById(id)) return;
    f.msg = "生成中…";
    paintFrames();
    setStatus(`正在產第 ${state.frames.indexOf(f) + 1} 幀…`);
    const r = await waitImg(engineBody(f));
    if (!frameById(id)) return;
    if (r.status === "done" && r.result) {
      f.url = r.result;
      f.msg = f.ref ? "完成（圖生圖）" : "完成";
      if (!fromAuto) setStatus(`第 ${state.frames.indexOf(f) + 1} 幀好了。看這張像不像。`);
    } else {
      f.msg = r.error || "失敗";
      setStatus(f.msg, true);
    }
  } catch (err) {
    f.msg = err?.message || String(err);
    setStatus(f.msg, true);
  } finally {
    if (!fromAuto) state.busy = false;
    paintFrames();
    if (!fromAuto && f.url) {
      document.querySelector(`.frame[data-id="${id}"] .shot:not(.sm)`)
        ?.scrollIntoView({ block: "center", behavior: "smooth" });
    }
  }
}

function readyFrames() {
  return state.frames.filter((f) => f.url);
}

function setPlaying(on) {
  state.playing = !!on;
  document.body.classList.toggle("playing", state.playing);
  $("player").classList.toggle("playing", state.playing);
  $("btn-play").setAttribute("aria-pressed", state.playing ? "true" : "false");
  if (!state.playing) {
    const img = $("stage");
    img.hidden = true;
    img.removeAttribute("src");
    $("play-label").hidden = true;
  }
}

function showFrame(index) {
  const list = readyFrames();
  const img = $("stage");
  const label = $("play-label");
  if (!list.length || !state.playing) {
    setPlaying(false);
    return;
  }
  const i = ((index % list.length) + list.length) % list.length;
  const f = list[i];
  const n = state.frames.indexOf(f) + 1;
  img.hidden = false;
  label.hidden = false;
  if (img.getAttribute("src") !== f.url) img.src = f.url;
  img.alt = `第 ${n} 幀`;
  label.textContent = `第 ${n} 幀 · ${i + 1}/${list.length}`;
  state.playAt = i;
}

function seconds() {
  const n = Number($("seconds").value);
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function stopPlay() {
  if (state.timer) clearTimeout(state.timer);
  state.timer = 0;
  setPlaying(false);
}

function stepPlay() {
  if (!state.playing) return;
  const list = readyFrames();
  if (!list.length) {
    stopPlay();
    setStatus("還沒有畫好的幀。", true);
    return;
  }
  showFrame(state.playAt);
  state.playAt += 1;
  state.timer = setTimeout(stepPlay, seconds() * 1000);
}

function play() {
  if (state.timer) clearTimeout(state.timer);
  state.timer = 0;
  if (state.busy) {
    setStatus("還在畫，等這一張結束再播放。", true);
    return;
  }
  readFrameInputs();
  if (!readyFrames().length) {
    setPlaying(false);
    setStatus("還沒有畫好的幀。先按各幀的生圖，或按自動產生。", true);
    return;
  }
  state.playAt = 0;
  setPlaying(true);
  stepPlay();
}

async function autoAll() {
  if (state.busy) {
    setStatus("還在畫，等這一張結束。", true);
    return;
  }
  readFrameInputs();
  stopPlay();
  if (!state.girl) {
    setStatus("先抽妹子。", true);
    return;
  }
  if (!state.frames.length) {
    setStatus("先新增圖片幀。", true);
    return;
  }
  const pending = state.frames.filter((f) => !f.url);
  if (!pending.length) {
    setStatus("每一幀都有圖了。按播放看動圖。");
    return;
  }
  state.busy = true;
  try {
    for (const f of [...state.frames]) {
      if (f.url || !state.frames.includes(f)) continue;
      await generateFrame(f.id, { fromAuto: true });
      if (!f.url) return;
    }
    setStatus(`自動產生完成：${readyFrames().length} 幀。按播放看動圖。`);
  } finally {
    state.busy = false;
    paintFrames();
  }
}

function boot() {
  const settings = gameSettings();
  if (settings.imgProvider === "comfy" || settings.imgProvider === "grok-img") {
    $("provider").value = settings.imgProvider;
  }
  if (settings.comfyUrl) $("comfy-url").value = settings.comfyUrl;
  paintEmotions();
  paintGirl();
  paintFrames();
  $("btn-draw").addEventListener("click", () => { void drawGirl(); });
  $("btn-add").addEventListener("click", () => { void addFrame(); });
  $("provider").addEventListener("change", () => { void fillPrompts(); });
  $("btn-play").addEventListener("click", play);
  $("btn-stop").addEventListener("click", stopPlay);
  $("btn-auto").addEventListener("click", () => { void autoAll(); });
}

boot();
