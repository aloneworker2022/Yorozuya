/* 試煉房抽妹子：人設與半身立繪都跟 /testword 同一套。不寫遊戲名冊。 */
import { loadPools, generateGirl, RARITY_MARK } from "./girl_gen.js";

const $ = (id) => document.getElementById(id);
const ENG_KEY = "yoro_testword_engines";

let girl = null;
let portraitUrl = "";
let pending = false;
let error = "";
let lines = [];
let talkFor = "";
let talkBusy = false;
let typeJob = 0;

function engDefault() {
  return {
    llmProvider: "grok-build",
    llmModel: "grok-4.5",
    ollamaUrl: "http://localhost:11434",
    imgProvider: "grok-img",
    imgModel: "grok-4.5",
    comfyUrl: "",
    comfyCkpt: "",
  };
}

function engRead() {
  try {
    const raw = localStorage.getItem(ENG_KEY);
    if (raw) return { ...engDefault(), ...JSON.parse(raw) };
  } catch {
    /* 壞掉的設定就當沒有 */
  }
  return null;
}

async function engGet() {
  const saved = engRead();
  if (saved) return saved;
  const engine = engDefault();
  try {
    const response = await fetch("/api/save", { cache: "no-store" });
    const data = await response.json();
    const settings = data?.data?.settings || {};
    const llm = String(settings.llmProvider || "").toLowerCase();
    engine.llmProvider = llm === "ollama" ? "ollama" : "grok-build";
    engine.llmModel = settings.model || engine.llmModel;
    engine.ollamaUrl = settings.ollamaUrl || engine.ollamaUrl;
    engine.imgProvider = settings.imgProvider === "comfy" ? "comfy" : "grok-img";
    engine.imgModel = settings.model || engine.imgModel;
    engine.comfyUrl = settings.comfyUrl || "";
    localStorage.setItem(ENG_KEY, JSON.stringify(engine));
  } catch {
    /* 沒存檔就用 testword 預設 */
  }
  return engine;
}

function wornOutfit(g) {
  const look = g?.look || {};
  const wardrobe = Array.isArray(look.wardrobe) ? look.wardrobe : [];
  const erotic = Array.isArray(look.eroticOutfits) ? look.eroticOutfits : [];
  const sleep = Array.isArray(look.sleepOutfits) ? look.sleepOutfits : [];
  const pick = g?.outfitPick;
  if (typeof pick === "string" && pick[0] === "e") {
    const index = Number(pick.slice(1));
    if (Number.isInteger(index) && erotic[index]) return String(erotic[index]);
  }
  if (typeof pick === "string" && pick[0] === "s") {
    const index = Number(pick.slice(1));
    if (Number.isInteger(index) && sleep[index]) return String(sleep[index]);
  }
  if (Number.isInteger(pick) && pick >= 0 && pick < wardrobe.length) return String(wardrobe[pick] || "");
  return String(look.career_outfit || look.style || "");
}

function halfExtra(g) {
  const bits = ["half-body portrait, looking at viewer, simple background"];
  const worn = wornOutfit(g);
  if (worn) bits.push(`wearing: ${worn}`);
  return bits.join(", ");
}

function portraitBody(g, engine) {
  const comfy = engine.imgProvider === "comfy";
  const stage = g.stage || "stranger";
  return {
    key: `poportrait:${g.id}:half:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: comfy
      ? (engine.imgModel || engine.llmModel || "grok-4.5")
      : (engine.imgModel || "grok-4.5"),
    framing: "half",
    rating: (stage === "wife" || stage === "girlfriend") ? "nsfw" : "sfw",
    style: "anime",
    character: g,
    outfit: wornOutfit(g),
    extra: halfExtra(g),
    prompt: "",
    cutout: true,
    flat_bg: true,
    retry: true,
    ...(comfy ? {
      shot: "half",
      char_id: g.id,
      comfy_url: engine.comfyUrl || "",
      ckpt: engine.comfyCkpt || "",
    } : {}),
  };
}

function lookLine(g) {
  const look = g.look || {};
  return [
    look.age != null ? `${look.age}歲` : "",
    look.hair_color,
    look.hair,
    look.eye_color,
    g.job,
    wornOutfit(g),
  ].filter(Boolean).join(" · ");
}

function titleOf(g) {
  return `${g.name} ${RARITY_MARK[g.rarity] || ""} ${g.rarity || ""}`.trim();
}

function renderCard() {
  const card = $("summon-card");
  if (!girl) {
    card.hidden = true;
    return;
  }
  card.hidden = false;
  $("summon-name").textContent = titleOf(girl);
  $("summon-meta").textContent = pending && !portraitUrl
    ? "半身立繪繪製中。"
    : (portraitUrl ? lookLine(girl) : (error || lookLine(girl)));
  const img = $("summon-portrait");
  const open = $("summon-open");
  const label = $("summon-thumb-label");
  if (portraitUrl) {
    img.hidden = false;
    img.alt = `${girl.name}的半身立繪`;
    img.src = portraitUrl;
    label.hidden = true;
    open.disabled = false;
    open.setAttribute("aria-label", `看${girl.name}的立繪`);
  } else {
    img.hidden = true;
    img.removeAttribute("src");
    label.hidden = false;
    label.textContent = pending ? "繪製中" : "無圖";
    open.disabled = true;
    open.setAttribute("aria-label", pending ? "立繪繪製中" : "還沒有立繪");
  }
}

function sheetOpen() {
  return !$("portrait-sheet").hidden;
}

function paintFigure() {
  const img = $("portrait-img");
  if (portraitUrl && girl) {
    img.hidden = false;
    img.alt = `${girl.name}的半身立繪`;
    if (img.getAttribute("src") !== portraitUrl) img.src = portraitUrl;
  } else {
    img.hidden = true;
    img.removeAttribute("src");
  }
}

function setTyping(on) {
  $("talk-typing").hidden = !on;
}

function setTalkEnabled(on) {
  $("talk-input").disabled = !on;
  $("talk-send").disabled = !on || talkBusy;
}

function cleanLine(raw) {
  return String(raw || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "")
    .replace(/^["「『]+|["」』]+$/g, "")
    .trim();
}

async function typeLine(name, text) {
  const job = ++typeJob;
  const full = cleanLine(text) || "……";
  const box = $("portrait-meta");
  $("portrait-name").textContent = name;
  setTyping(false);
  box.textContent = "";
  const chars = Array.from(full);
  for (let i = 1; i <= chars.length; i++) {
    if (job !== typeJob) return;
    box.textContent = chars.slice(0, i).join("");
    const mark = chars[i - 1];
    const wait = /[。！？!?…]/.test(mark) ? 90 : (/[、，,．.]/.test(mark) ? 50 : 26);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function talkSystem() {
  const look = girl.look || {};
  const bits = [
    `你是${girl.name}。你正站在他眼前，人就在面前。`,
    `個性：${(girl.personality || []).join("、") || "普通"}。`,
    girl.tone ? `語氣：${girl.tone}` : "",
    girl.job ? `原本的職業：${girl.job}。` : "",
    girl.quirk ? `但${girl.quirk}` : "",
    `外表：${look.age != null ? `${look.age}歲，` : ""}${look.hair_color || ""}${look.hair || ""}，${look.eye_color || ""}眼。穿著${wornOutfit(girl) || "自己的衣服"}。`,
    "關係還是陌生。",
    "【店頭聊天】",
    "只寫你說出口的話，1 到 3 句。",
    "不要旁白、不要動作、不要表情描寫、不要引號標題。",
    "依個性回話，不要無故結束對話。",
  ];
  return bits.filter(Boolean).join("\n");
}

async function postGen(body) {
  const response = await fetch("/api/gen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(payload, response.status));
  return payload;
}

async function askGirl(extraUser) {
  const engine = await engGet();
  const grok = engine.llmProvider !== "ollama";
  const key = `roomtalk:${girl.id}:${Date.now().toString(36)}`;
  const messages = [{ role: "system", content: talkSystem() }, ...lines.slice(-16)];
  if (extraUser) messages.push({ role: "user", content: extraUser });
  const body = {
    key,
    retry: true,
    prio: 10,
    provider: grok ? "grok-build" : "ollama",
    endpoint: grok ? "grok-build" : (engine.ollamaUrl || "http://localhost:11434"),
    model: engine.llmModel || "grok-4.5",
    messages,
    options: { temperature: 0.9 },
  };
  const started = Date.now();
  let result = await postGen(body);
  while (Date.now() - started < 120000) {
    if (result?.status === "done") return cleanLine(result.result);
    if (result?.status === "error") throw new Error(result.error || "回話失敗");
    await new Promise((resolve) => setTimeout(resolve, 800));
    result = await postGen({ ...body, key: result?.key || key, retry: false });
  }
  throw new Error("等太久了");
}

async function openTalk() {
  if (!girl) return;
  setTalkEnabled(true);
  if (talkFor === girl.id && (lines.length || talkBusy)) {
    $("talk-input").focus();
    return;
  }
  talkFor = girl.id;
  lines = [];
  talkBusy = true;
  setTalkEnabled(true);
  $("portrait-name").textContent = girl.name;
  $("portrait-meta").textContent = "";
  setTyping(true);
  try {
    const reply = await askGirl("（旁白：他走到你面前。用一兩句話開場，依你的個性。只輸出台詞。）");
    const line = reply || "……嗯？";
    lines.push({ role: "assistant", content: line });
    await typeLine(girl.name, line);
  } catch {
    await typeLine(girl.name, "……嗯？");
  }
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) {
    setTalkEnabled(true);
    $("talk-input").focus();
  }
}

async function sendTalk(event) {
  event.preventDefault();
  if (!girl || talkBusy || talkFor !== girl.id) return;
  const input = $("talk-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  lines.push({ role: "user", content: text });
  talkBusy = true;
  setTalkEnabled(true);
  await typeLine("你", text);
  if (!sheetOpen() || talkFor !== girl.id) {
    talkBusy = false;
    return;
  }
  setTyping(true);
  $("portrait-name").textContent = girl.name;
  try {
    const reply = await askGirl(null);
    const line = reply || "……";
    lines.push({ role: "assistant", content: line });
    await typeLine(girl.name, line);
  } catch {
    await typeLine(girl.name, "……話到嘴邊又咽回去了。");
  }
  talkBusy = false;
  if (sheetOpen()) {
    setTalkEnabled(true);
    $("talk-input").focus();
  }
}

function showSheet() {
  $("portrait-sheet").hidden = false;
  paintFigure();
  if (!girl) {
    typeJob += 1;
    setTyping(false);
    $("portrait-name").textContent = "還沒有人";
    $("portrait-meta").textContent = "先按「抽妹子」。";
    setTalkEnabled(false);
    return;
  }
  openTalk();
}

function hideSheet() {
  typeJob += 1;
  setTyping(false);
  $("portrait-sheet").hidden = true;
}

function errorText(payload, status) {
  const detail = payload?.detail ?? payload?.error;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || String(item || "")).filter(Boolean).join("；");
  }
  if (detail && typeof detail === "object") return detail.message || "生圖失敗";
  return status ? `生圖失敗（${status}）` : "生圖失敗";
}

function isNetErr(err) {
  const message = String(err?.message || err || "");
  return /failed to fetch|load failed|networkerror|network error|offline|abort|internet connection|timed out|timeout|lost connection|connection reset|network changed/i.test(message);
}

async function postImage(body) {
  try {
    const response = await fetch("/api/imggen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorText(payload, response.status));
    return payload;
  } catch (err) {
    if (isNetErr(err)) return null;
    throw err;
  }
}

function whenVisible() {
  if (document.visibilityState === "visible") return Promise.resolve();
  return new Promise((resolve) => {
    const go = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", go);
      window.removeEventListener("pageshow", go);
      resolve();
    };
    document.addEventListener("visibilitychange", go);
    window.addEventListener("pageshow", go);
  });
}

async function waitImage(body) {
  let key = body.key;
  let visibleWait = 0;
  let result = await postImage({ ...body, retry: body.retry !== false });
  if (result?.key) key = result.key;
  while (visibleWait < 360000) {
    if (document.visibilityState !== "visible") {
      $("summon-status").textContent = "畫面在背景，伺服器還在畫。回來會繼續等。";
      await whenVisible();
    }
    if (result?.status === "done" || result?.status === "error") return result;
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, result ? 1500 : 2500));
    if (document.visibilityState === "visible") {
      visibleWait += Math.min(5000, Date.now() - started);
      const seconds = Math.round(visibleWait / 1000);
      $("summon-status").textContent = `正在畫${girl?.name || "她"}的半身立繪… ${seconds} 秒`;
    }
    result = await postImage({ ...body, key: key || body.key, retry: false });
    if (result?.key) key = result.key;
  }
  return { status: "error", error: "逾時" };
}

async function makeGirl() {
  await loadPools();
  const rolled = generateGirl({
    luck: 10 + Math.floor(Math.random() * 46),
    rating: "nsfw",
    usedNames: girl?.name ? [girl.name] : [],
  });
  if (!rolled?.name) throw new Error("generateGirl 回傳空");
  return {
    ...rolled,
    id: `cd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    affection: 0,
    stage: "stranger",
    ntr: null,
    summoner: null,
    portraits: null,
    portrait: null,
    crave: { v: 10 + Math.floor(Math.random() * 20), at: Date.now() },
  };
}

async function drawGirl() {
  if (pending) return;
  pending = true;
  error = "";
  portraitUrl = "";
  $("draw-girl").disabled = true;
  $("summon-status").textContent = "抽人設…";
  try {
    const rolled = await makeGirl();
    const engine = await engGet();
    girl = rolled;
    lines = [];
    talkFor = "";
    typeJob += 1;
    renderCard();
    const provider = engine.imgProvider === "comfy" ? "comfy" : "grok-img";
    $("summon-status").textContent = `正在畫${rolled.name}的半身立繪…（testword · ${provider} · 動漫）`;
    const result = await waitImage(portraitBody(rolled, engine));
    if (result?.status === "done" && result.result) {
      portraitUrl = String(result.result);
      error = "";
      $("summon-status").textContent = `${rolled.name}的半身立繪好了。長按房間裡的她，再選擇聊天。`;
    } else {
      error = result?.error || "生圖失敗";
      $("summon-status").textContent = `人抽到了，立繪沒畫出來：${error}`;
    }
  } catch (err) {
    error = err?.message || String(err);
    $("summon-status").textContent = error;
  }
  pending = false;
  $("draw-girl").disabled = false;
  renderCard();
  if (sheetOpen()) showSheet();
}

$("draw-girl").addEventListener("click", () => { drawGirl(); });
$("summon-open").addEventListener("click", () => { if (portraitUrl) showSheet(); });
$("talk-input-row").addEventListener("submit", (event) => { sendTalk(event); });
$("portrait-backdrop").addEventListener("click", hideSheet);
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheetOpen()) hideSheet();
});

window.RoomPortrait = { open: showSheet };
