/** sgirledit：選模型 → 抽一位 → 改樣貌／衣服 → 裸體半身 → 裸體全身。 */
import { setPools, generateGirl } from "./girl_gen.js?v=5";

const $ = (id) => document.getElementById(id);
const KEEP = "sgirledit-girl";
let girl = null;
let busy = false;

const NUDE = "nude, completely nude, bare breasts, nipples, no clothes, upper body, standing, plain solid color background, simple background";
const SERIES = [
  { id: "blink", label: "站著渣眼", frames: [
    `${NUDE}, eyes open, looking at viewer`,
    `${NUDE}, mid-blink, eyelids halfway down, eyes not fully closed, looking at viewer`,
    `${NUDE}, eyes fully closed`,
  ]},
  { id: "talk", label: "說話", frames: [
    `${NUDE}, mouth closed, looking at viewer`,
    `${NUDE}, mouth slightly open, talking, looking at viewer`,
    `${NUDE}, mouth open, talking, looking at viewer`,
  ]},
  { id: "hips", label: "手插腰", frames: [
    `${NUDE}, arms at sides, looking at viewer`,
    `${NUDE}, arms lifting slightly away from the body`,
    `${NUDE}, elbows bending outward`,
    `${NUDE}, hands moving onto the waist`,
    `${NUDE}, both hands on hips, elbows out, looking at viewer`,
  ]},
  { id: "arms", label: "手抱胸", frames: [
    `${NUDE}, arms at sides, looking at viewer`,
    `${NUDE}, arms rising in front of the body`,
    `${NUDE}, forearms crossing in front of the chest`,
    `${NUDE}, arms crossed under the breasts`,
    `${NUDE}, arms crossed over the chest, looking at viewer`,
  ]},
  { id: "laugh", label: "大笑", frames: [
    `${NUDE}, small smile, looking at viewer`,
    `${NUDE}, smiling, mouth a little open`,
    `${NUDE}, laughing, mouth open`,
    `${NUDE}, laughing, eyes narrowing`,
    `${NUDE}, big laugh, eyes closed, mouth wide open`,
  ]},
];
let playId = null;
let playTimer = 0;

const SHOTS = {
  half: {
    shot: "half",
    framing: "half",
    extra: "nude, completely nude, nipples, bare breasts, no clothes, upper body, looking at viewer, plain solid color background, simple background",
  },
  full: {
    shot: "full",
    framing: "full",
    extra: "nude, completely nude, nipples, bare breasts, no clothes, no panties, full body, looking at viewer, standing, plain solid color background, simple background",
  },
};

function status(msg, err) {
  const el = $("status");
  el.textContent = msg || "";
  el.className = "status" + (err ? " err" : "");
}
function wornOutfit(g) {
  const look = g?.look || {};
  const wardrobe = Array.isArray(look.wardrobe) ? look.wardrobe : [];
  const pick = g?.outfitPick;
  if (Number.isInteger(pick) && pick >= 0 && pick < wardrobe.length) return String(wardrobe[pick] || "");
  return String(look.career_outfit || look.style || "");
}
function setWorn(g, text) {
  const look = g.look || (g.look = {});
  const pick = g.outfitPick;
  if (Number.isInteger(pick) && pick >= 0) {
    if (!Array.isArray(look.wardrobe)) look.wardrobe = [];
    look.wardrobe[pick] = text;
    if (pick === 0) look.style = text;
    return;
  }
  look.style = text;
}
function selectedCkpt() {
  return ($("ckpt").value || "").trim();
}
function setBusy(on) {
  busy = on;
  $("btn-draw").disabled = on;
  $("btn-half").disabled = on;
  $("btn-full").disabled = on;
  for (const b of document.querySelectorAll("#series button")) b.disabled = on;
}
function readForm() {
  if (!girl) return;
  const look = girl.look || (girl.look = {});
  look.hair = $("hair").value.trim();
  look.hair_color = $("hair-color").value.trim();
  look.eyes = $("eyes").value.trim();
  look.eye_color = $("eye-color").value.trim();
  const h = Number($("height").value);
  if (Number.isFinite(h) && h > 0) look.height_cm = Math.round(h);
  look.build = $("build").value.trim();
  look.cup = $("cup").value.trim();
  if (look.cup) look.bust = [look.cup, look.breast_shape].filter(Boolean).join("、");
  look.feature = $("feature").value.trim();
  setWorn(girl, $("outfit").value.trim());
}
function writeForm() {
  const look = girl?.look || {};
  $("hair").value = look.hair || "";
  $("hair-color").value = look.hair_color || "";
  $("eyes").value = look.eyes || "";
  $("eye-color").value = look.eye_color || "";
  $("height").value = look.height_cm || "";
  $("build").value = look.build || "";
  $("cup").value = look.cup || "";
  $("feature").value = look.feature || "";
  $("outfit").value = girl ? wornOutfit(girl) : "";
  $("who-name").textContent = girl ? `${girl.name}・${girl.rarity || ""}` : "還沒抽";
  showPic("half");
  showPic("full");
  paintSeries();
}
function showPic(kind) {
  const img = $(kind === "half" ? "pic-half" : "pic-full");
  const url = girl?.portraits?.[kind] || "";
  if (!url) { img.hidden = true; img.removeAttribute("src"); return; }
  img.hidden = false;
  img.src = url;
}
function remember() {
  try {
    if (girl) sessionStorage.setItem(KEEP, JSON.stringify(girl));
  } catch { /* ignore */ }
}
async function loadModels() {
  const sel = $("ckpt");
  const keep = sel.value;
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
  } catch (err) {
    status(String(err?.message || err), true);
  }
}
async function drawGirl() {
  if (busy) return;
  setBusy(true);
  status("抽人設…");
  try {
    const pools = await fetch("/content/persona_pools.json", { cache: "no-store" }).then((r) => r.ok ? r.json() : null);
    if (pools) setPools(pools);
    const rolled = generateGirl({ rating: "nsfw" });
    if (!rolled) throw new Error("人設池沒載入，抽不出人。");
    girl = rolled;
    girl.id = `sg${Date.now().toString(36)}`;
    girl.stage = "stranger";
    girl.portraits = {};
    if (!girl.outfitPick && Array.isArray(girl.look?.wardrobe) && girl.look.wardrobe.length) girl.outfitPick = 0;
    writeForm();
    remember();
    status(`抽到 ${girl.name}。改完樣貌再畫裸體半身。`);
  } catch (err) {
    status(String(err?.message || err), true);
  } finally {
    setBusy(false);
  }
}
function ensureSeed() {
  let n = Number($("seed").value);
  if (!Number.isInteger(n) || n <= 0) {
    n = Math.floor(Math.random() * 2 ** 31) || 1;
    $("seed").value = String(n);
  }
  return n;
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
    await new Promise((res) => setTimeout(res, 1500));
    cur = await post({ ...body, key, retry: false });
  }
  return { status: "error", error: "逾時" };
}
async function generate(kind) {
  if (busy) return;
  const spec = SHOTS[kind];
  const ckpt = selectedCkpt();
  if (!girl) { status("先抽妹子。", true); return; }
  if (!ckpt) { status("先選產生模型。", true); return; }
  readForm();
  const seed = ensureSeed();
  setBusy(true);
  try {
    status(kind === "half" ? "畫裸體半身…" : "畫裸體全身…");
    const halfUrl = String(girl.portraits?.half || "").split("?")[0];
    const r = await imggen({
      key: `sgirl:${girl.id}:${kind}:${Date.now().toString(36)}`,
      provider: "comfy",
      model: "grok-4.5",
      framing: spec.framing,
      rating: "nsfw",
      style: "anime",
      character: { ...girl, look: girl.look, _force_exposed: true },
      outfit: "",
      extra: spec.extra,
      negative: "",
      prompt: "",
      cutout: true,
      flat_bg: true,
      retry: true,
      shot: spec.shot,
      char_id: girl.id,
      seed,
      ckpt,
      ...(kind === "full" && halfUrl.startsWith("/assets/") ? { ref: halfUrl, lock_identity: true } : {}),
    });
    if (r.status !== "done" || !r.result) throw new Error(r.error || "沒有圖");
    girl.portraits = girl.portraits || {};
    girl.portraits[kind] = r.result;
    remember();
    showPic(kind);
    status(kind === "half" ? "裸體半身好了。可以接著畫全身。" : "裸體全身好了。");
  } catch (err) {
    status(String(err?.message || err), true);
  } finally {
    setBusy(false);
  }
}
function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.4;
  return Math.min(0.9, Math.max(0.25, Math.round(n * 100) / 100));
}
function halfRef() {
  return String(girl?.portraits?.half || "").split("?")[0];
}
function paintSeries() {
  const box = $("series");
  if (!box) return;
  box.replaceChildren();
  for (const s of SERIES) {
    const urls = girl?.series?.[s.id] || [];
    const card = document.createElement("section");
    card.className = "series";
    const title = document.createElement("b");
    title.textContent = `${s.label}　${s.frames.length} 張`;
    const row = document.createElement("div");
    row.className = "frames";
    urls.forEach((url, i) => {
      const img = document.createElement("img");
      img.src = url;
      img.alt = `${s.label} ${i + 1}`;
      row.appendChild(img);
    });
    const actions = document.createElement("div");
    actions.className = "row";
    const gen = document.createElement("button");
    gen.type = "button";
    gen.textContent = "產生這組";
    gen.disabled = busy;
    gen.addEventListener("click", () => { void generateSeries(s.id); });
    const play = document.createElement("button");
    play.type = "button";
    play.textContent = playId === s.id ? "停止" : "播放";
    play.addEventListener("click", () => togglePlay(s.id));
    actions.append(gen, play);
    card.append(title, row, actions);
    box.appendChild(card);
  }
}
function stopPlay() {
  clearInterval(playTimer);
  playTimer = 0;
  playId = null;
  const box = $("player");
  if (box) box.hidden = true;
}
function togglePlay(id) {
  if (playId === id) {
    stopPlay();
    paintSeries();
    return;
  }
  const urls = girl?.series?.[id] || [];
  const spec = SERIES.find((s) => s.id === id);
  if (urls.length < 2) { status("這組還沒有夠播的圖。", true); return; }
  stopPlay();
  playId = id;
  const img = $("player-img");
  const label = $("player-label");
  let i = 0;
  img.src = urls[0];
  img.alt = spec?.label || "";
  if (label) label.textContent = spec?.label || "";
  $("player").hidden = false;
  playTimer = setInterval(() => {
    i = (i + 1) % urls.length;
    img.src = urls[i];
  }, 500);
  paintSeries();
}
async function generateSeries(id) {
  if (busy) return;
  const spec = SERIES.find((s) => s.id === id);
  const ckpt = selectedCkpt();
  const ref = halfRef();
  if (!girl) { status("先抽妹子。", true); return; }
  if (!ckpt) { status("先選產生模型。", true); return; }
  if (!ref.startsWith("/assets/")) { status("先產生裸體半身。", true); return; }
  readForm();
  const seed = ensureSeed();
  const denoise = clampDenoise($("denoise").value);
  $("denoise").value = String(denoise);
  setBusy(true);
  girl.series = girl.series || {};
  girl.series[id] = [];
  try {
    for (let i = 0; i < spec.frames.length; i++) {
      status(`${spec.label}　${i + 1}/${spec.frames.length}`);
      const r = await imggen({
        key: `sgirl:${girl.id}:${id}:${i}:${Date.now().toString(36)}`,
        provider: "comfy",
        model: "grok-4.5",
        framing: "half",
        rating: "nsfw",
        style: "anime",
        character: { ...girl, look: girl.look, _force_exposed: true },
        outfit: "",
        extra: spec.frames[i],
        negative: "",
        prompt: "",
        cutout: true,
        flat_bg: true,
        retry: true,
        seed,
        ckpt,
        pose_ref: ref,
        pose_denoise: denoise,
      });
      if (r.status !== "done" || !r.result) throw new Error(r.error || `${spec.label} 第 ${i + 1} 張沒有圖`);
      girl.series[id].push(r.result);
      remember();
      paintSeries();
    }
    status(`${spec.label} 好了。`);
  } catch (err) {
    remember();
    paintSeries();
    status(String(err?.message || err), true);
  } finally {
    setBusy(false);
    paintSeries();
  }
}
function boot() {
  try {
    const raw = sessionStorage.getItem(KEEP);
    if (raw) {
      girl = JSON.parse(raw);
      writeForm();
    }
  } catch { girl = null; }
  $("btn-draw").addEventListener("click", () => { void drawGirl(); });
  $("btn-half").addEventListener("click", () => { void generate("half"); });
  $("btn-full").addEventListener("click", () => { void generate("full"); });
  paintSeries();
  $("player-exit").addEventListener("click", () => { stopPlay(); paintSeries(); });
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && playId) { stopPlay(); paintSeries(); }
  });
  void loadModels();
}
boot();
