/* 試煉房抽妹子：人設跟 /testword 同一套。抽到後背景補半身立繪。不寫遊戲名冊。 */
import { loadPools, generateGirl, RARITY_MARK, PERSONALITY_NAMES, KINK_NAMES } from "./girl_gen.js?v=2";
import {
  ensureBody,
  clampBody,
  bodyPromptLines,
  applyBodyFromUserText,
  applyAct,
  TALK_ACTS,
  snapshotBodyForUi,
  applyUiSnapshot,
  SEMEN_ZH,
  STUFFED_OPTIONS,
  AROUSAL_STAGE,
  LIBIDO_STAGE,
  arousalStage,
  libidoStage,
} from "./body_state.js?v=10";
import {
  effectiveStun,
  calcStun,
  shouldSkipLlm,
  scrambleReply,
  stunTemplate,
  spasmTemplate,
  afterglowTemplate,
  noteActShock,
  tickStunAfterReply,
  ensureStunFields,
  applyTeaseSpasm,
  noteTalkExchange,
  inSpasm,
  inAfterglow,
  noteAfterglow,
  consumeAfterglowReply,
  afterglowPromptLines,
  stunTier,
  moanVoicePromptLines,
  SPASM_MS,
  SHOCK_MAX,
  AFTERGLOW_FRIEND_MS,
  AFTERGLOW_FRIEND_REPLIES,
  AFTERGLOW_FRIEND_CONT_MS,
  AFTERGLOW_FRIEND_CONT_REPLIES,
  AFTERGLOW_FRIEND_MARATHON_MS,
  AFTERGLOW_FRIEND_MARATHON_REPLIES,
} from "./stun_speech.js?v=11";
import {
  ensureTeaseFields,
  actLockState,
  isActUnlocked,
  recordTeasePress,
  orderedTalkActs,
  availableActs,
  decayBodyIdle,
  insertUnlocked,
} from "./tease.js?v=4";
import {
  ensurePlayer,
  emptyPlayer,
  canTease,
  teaseBlockReason,
  applyTeaseClimax,
  decayPlayerIdle,
  playerHint,
  refillSemen,
} from "./player_state.js?v=6";
import { ensureOpenness, getOpenness } from "./openness.js?v=1";
import {
  ensureInvasion,
  applyInvasionRoll,
  decayInvasion,
  clearInvasion,
  getInvasion,
  INVASION_MAX,
  protestTone,
  protestPromptBlock,
  blendProtestReply,
} from "./invasion.js?v=2";
import {
  mountButtPackEditor,
  pickRuntimeButtPack,
  loadButtDoc,
  generateButtPackImage,
} from "./butt_packs.js?v=5";
import {
  mountWaistPackEditor,
  pickRuntimeWaistPack,
  loadWaistDoc,
  generateWaistPackImage,
} from "./waist_packs.js?v=4";
import {
  mountBreastPackEditor,
  pickRuntimeBreastPack,
  loadBreastDoc,
  generateBreastPackImage,
} from "./breast_packs.js?v=1";
import {
  mountKneadPackEditor,
  pickRuntimeKneadPack,
  loadKneadDoc,
  generateKneadPackImage,
} from "./knead_packs.js?v=1";
import {
  mountSuckPackEditor,
  pickRuntimeSuckPack,
  loadSuckDoc,
  generateSuckPackImage,
} from "./suck_packs.js?v=1";
import {
  mountLickPackEditor,
  pickRuntimeLickPack,
  loadLickDoc,
  generateLickPackImage,
} from "./lick_packs.js?v=1";
import {
  mountLabiaPackEditor,
  pickRuntimeLabiaPack,
  loadLabiaDoc,
  generateLabiaPackImage,
} from "./labia_packs.js?v=1";
import {
  mountLabiaRubPackEditor,
  pickRuntimeLabiaRubPack,
  loadLabiaRubDoc,
  generateLabiaRubPackImage,
} from "./labia_rub_packs.js?v=1";
import {
  mountFingerPackEditor,
  pickRuntimeFingerPack,
  loadFingerDoc,
  generateFingerPackImage,
} from "./finger_packs.js?v=1";
import { SUMMON_RITUAL_LINES, startSummonRitualStatus } from "./summon_ritual.js?v=1";
import { regionById, rollJapanRegion } from "./japan_regions.js";
import { climateNote, rollGround } from "./japan_grounds.js";
import { japanNow } from "./japan_clock.js";
import { HOMES, sampleHomes } from "./japan_homes.js";
import { JOBS, sampleJobs } from "./japan_jobs.js";
import { rollShift } from "./japan_shift.js";
import { rollStroll } from "./japan_stroll.js";
import { rollPlaceScp, rollWorkScp, scpBrief, scpLabel } from "./japan_scp.js";

const $ = (id) => document.getElementById(id);

let girl = null;
let player = emptyPlayer();
let pending = false;
let idleDecayTimer = 0;
let lastIdleDecayAt = 0;
let activityOpen = false;
let workToken = 0;
/** 有住處後多久自動打工／亂逛一次（毫秒）。找住處改等「發呆產圖全部完成」。 */
const WORLD_AUTO_MS = 60 * 60 * 1000;
let lifeLoopTimer = 0;
let autoLifeBusy = false;

/** 房內停留時長（對齊看板 kanbanHours*HOUR）；無 app 掛載時退回 1 小時。絕對 until，不因聊天重設。 */
function roomVisitMs() {
  return (typeof window.yoroRoomVisitMs === "function" ? window.yoroRoomVisitMs() : 60 * 60 * 1000);
}

/** 僅在「已有 world／住處」的進房路徑上啟動停留計時；首次現身等發呆產圖離房找房時不啟動。 */
function armRoomVisit(who = girl) {
  if (!who) return;
  if (!who.world) {
    who.roomVisitUntil = 0;
    return;
  }
  who.roomVisitUntil = Date.now() + roomVisitMs();
}

function clearRoomVisit(who = girl) {
  if (who) who.roomVisitUntil = 0;
}
let lines = [];
let talkFor = "";
let talkBusy = false;
let typeJob = 0;
/** 高失神解鎖的專屬場面 stub：undress | sex | "" */
let activeRoomScene = "";

const ROOM_SCENE_STUBS = {
  undress: {
    title: "脫衣場面",
    body: "場面建置中\n（之後會做成逐步脫衣；規則待補。）",
  },
  sex: {
    title: "做愛場面",
    body: "場面建置中\n（做愛規則待定；此為空白佔位。）",
  },
};

const SCENE_UNLOCK_STUN = 50;

function sceneOpen() {
  return !!activeRoomScene && !$("room-scene-overlay")?.hidden;
}

/** 有效失神 ≥50 或痙攣中 → 可開脫衣／做愛 stub。 */
function highStunSceneUnlocked(who = girl) {
  if (!who) return false;
  ensureStunFields(who);
  if (inSpasm(who)) return true;
  return effectiveStun(who, "") >= SCENE_UNLOCK_STUN;
}

function openRoomScene(kind) {
  const stub = ROOM_SCENE_STUBS[kind];
  const overlay = $("room-scene-overlay");
  if (!stub || !overlay || !girl) return;
  if (!highStunSceneUnlocked(girl)) return;
  activeRoomScene = kind;
  const title = $("room-scene-title");
  const body = $("room-scene-body");
  if (title) title.textContent = stub.title;
  if (body) body.textContent = stub.body;
  overlay.hidden = false;
  // 蓋住互動列，但不關 portrait-sheet，以免 wipe chat／affection／body
  const acts = $("talk-acts");
  if (acts) acts.hidden = true;
}

function closeRoomScene() {
  const overlay = $("room-scene-overlay");
  if (overlay) overlay.hidden = true;
  activeRoomScene = "";
  // 回到房間對話：不呼叫 hideSheet，保留 affection／body／本輪對話
  if (sheetOpen() && girl) {
    refreshTalkActs();
    setTalkEnabled(!talkBusy);
  }
}

function bindRoomSceneOverlay() {
  const back = $("room-scene-back");
  if (back && !back.dataset.bound) {
    back.dataset.bound = "1";
    back.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeRoomScene();
    });
  }
  const overlay = $("room-scene-overlay");
  if (overlay && !overlay.dataset.bound) {
    overlay.dataset.bound = "1";
    overlay.addEventListener("click", (event) => {
      // 點空白處也回房間對話；點卡片本身不關
      if (event.target === overlay) closeRoomScene();
    });
  }
}

function llmProviderOf(settings) {
  const provider = String(settings?.llmProvider || "ollama").toLowerCase();
  if (["grok-build", "build", "grok", "xai", "spacexai", "api"].includes(provider)) return "grok-build";
  return "ollama";
}

async function gameChatRoute() {
  const response = await fetch("/api/save", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(data, response.status));
  const settings = data?.data?.settings || {};
  const provider = llmProviderOf(settings);
  const model = String(settings.model || "").trim();
  if (!model) throw new Error("正式版還沒設定聊天模型");
  return {
    provider,
    model,
    endpoint: provider === "grok-build" ? "grok-build" : (settings.ollamaUrl || "http://localhost:11434"),
  };
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

const halfGenning = new Set();

// 每位妹子自帶 comfyCkpt（與 app.js 同邏輯，房間模組自備，不 import app）
let roomImgProvider = "";
let roomComfyUrl = "";
let comfyCkpts = [];
let comfyBadCkpts = [];
let comfyCkptRefreshAt = 0;

async function gameImgRoute() {
  const response = await fetch("/api/save", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(data, response.status));
  const settings = data?.data?.settings || {};
  const comfy = String(settings.imgProvider || "").toLowerCase() === "comfy";
  roomImgProvider = comfy ? "comfy" : "grok-img";
  roomComfyUrl = String(settings.comfyUrl || "").trim();
  return {
    imgProvider: roomImgProvider,
    imgModel: String(settings.model || "grok-4.5").trim() || "grok-4.5",
    imgStyle: String(settings.imgStyle || "pixel").trim() || "pixel",
    comfyUrl: roomComfyUrl,
    comfyCkpt: String(settings.comfyCkpt || "").trim(),
  };
}

function usableComfyCkpts() {
  const bad = new Set(comfyBadCkpts);
  const u = comfyCkpts.filter((c) => c && !bad.has(c));
  return u.length ? u : comfyCkpts.slice();
}

function pickRandomComfyCkpt(exclude = "") {
  let pool = usableComfyCkpts();
  if (exclude && pool.length > 1) pool = pool.filter((c) => c !== exclude);
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 檔名太長時只顯示尾段 */
function shortCkptName(name) {
  if (!name) return "";
  const base = String(name).split(/[/\\]/).pop() || name;
  return base.length > 42 ? "…" + base.slice(-40) : base;
}

async function refreshComfyCkpts({ force = false } = {}) {
  if (!force && comfyCkpts.length && Date.now() - comfyCkptRefreshAt < 60000) {
    return true;
  }
  let u = roomComfyUrl;
  if (!roomImgProvider) {
    try {
      await gameImgRoute();
      u = roomComfyUrl;
    } catch { /* ignore */ }
  }
  try {
    const res = await fetch("/api/comfy/status" + (u ? "?url=" + encodeURIComponent(u) : ""));
    const j = await res.json();
    if (!j?.ok) return false;
    comfyCkpts = j.checkpoints || [];
    comfyBadCkpts = j.bad_checkpoints || [];
    comfyCkptRefreshAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * 確保這位妹子有固定 Comfy checkpoint。
 * - 非 comfy → 回 ""（不改 g.comfyCkpt）
 * - 已有且非壞檔 → 沿用
 * - 沒有／壞檔 → 從可用清單隨機綁定；若是當前房間妹子則 persistRoom
 */
async function ensureGirlComfyCkpt(g) {
  if (!g) return "";
  if (!roomImgProvider) {
    try { await gameImgRoute(); } catch { return ""; }
  }
  if (roomImgProvider !== "comfy") return "";
  await refreshComfyCkpts();
  const cur = (g.comfyCkpt || "").trim();
  const bad = cur && comfyBadCkpts.includes(cur);
  if (cur && !bad) return cur;
  const picked = pickRandomComfyCkpt(cur);
  if (picked) {
    g.comfyCkpt = picked;
    if (girl && girl.id === g.id) {
      try { persistRoom(); } catch { /* */ }
    }
  }
  return g.comfyCkpt || "";
}

function halfExtra(g) {
  const bits = [
    "half-body portrait, looking at viewer, plain solid color background, simple background",
  ];
  const worn = wornOutfit(g);
  if (worn) bits.push(`wearing: ${worn}`);
  return bits.join(", ");
}

function halfRating(g) {
  const stage = String(g?.stage || "stranger");
  if (stage.includes("wife") || stage === "girlfriend" || stage === "lover" || stage === "passionate") {
    return "nsfw";
  }
  return "sfw";
}

function portraitBody(g, engine) {
  const comfy = engine.imgProvider === "comfy";
  return {
    key: `poportrait:${g.id}:half:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: engine.imgModel || "grok-4.5",
    framing: "half",
    rating: halfRating(g),
    style: engine.imgStyle || "pixel",
    character: g,
    outfit: wornOutfit(g),
    extra: halfExtra(g),
    prompt: "",
    cutout: true,
    flat_bg: true,
    retry: true,
    shot: "half",
    char_id: g.id,
    ...(comfy ? {
      comfy_url: engine.comfyUrl || "",
      // 優先妹子自帶模型；全局 settings.comfyCkpt 已廢棄，僅作後備
      ckpt: String(g.comfyCkpt || "").trim() || engine.comfyCkpt || "",
    } : {}),
  };
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
    if (document.visibilityState !== "visible") await whenVisible();
    if (result?.status === "done" || result?.status === "error") return result;
    const started = Date.now();
    await new Promise((resolve) => setTimeout(resolve, result ? 1500 : 2500));
    if (document.visibilityState === "visible") {
      visibleWait += Math.min(5000, Date.now() - started);
    }
    result = await postImage({ ...body, key: key || body.key, retry: false });
    if (result?.key) key = result.key;
  }
  return { status: "error", error: "逾時" };
}

/** 與 pack waitImg／apiJson 相同：HTTP／網路錯誤直接 throw，不吞成 null。 */
async function postImageStrict(body) {
  const response = await fetch("/api/imggen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(payload, response.status));
  return payload;
}

/** 半身／預產用：網路錯誤會 throw（不像 waitImage 把失敗吞成逾時）。 */
async function waitImageStrict(body, onTick, ms = 360000) {
  let key = body.key;
  let r = await postImageStrict({ ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done" || r.status === "error") return r;
    if (onTick) onTick(Math.round((Date.now() - t0) / 1000));
    await new Promise((x) => setTimeout(x, 1500));
    r = await postImageStrict({ ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  return { status: "error", error: "逾時" };
}

function resetPortraitEntrance(img = $("portrait-img")) {
  if (!img) return;
  img.classList.remove("portrait-in");
  img.hidden = true;
}

function startPortraitEntrance(img) {
  if (!img || !sheetOpen()) return;
  // Already settled in this open session — do not replay.
  if (!img.hidden && img.classList.contains("portrait-in")) return;
  img.hidden = false;
  img.classList.remove("portrait-in");
  // Force starting pose (off-screen) before adding .portrait-in.
  void img.offsetWidth;
  requestAnimationFrame(() => {
    if (!sheetOpen() || img.hidden) return;
    img.classList.add("portrait-in");
  });
}


const buttGenning = new Set();
const waistGenning = new Set();
const breastGenning = new Set();
const kneadGenning = new Set();
const suckGenning = new Set();
const lickGenning = new Set();
const labiaGenning = new Set();
const labiaRubGenning = new Set();
const fingerGenning = new Set();
let pregenning = false;
let summoning = false;

function stampPortraitUrl(url) {
  const s = String(url || "");
  if (!s) return "";
  return s.includes("?") ? s : `${s}?v=${Date.now()}`;
}

/** 動作閃現層：左滑入 → 停 1s → 右滑出；不永久蓋掉立繪。 */
let actionFlashToken = 0;
let actionFlashTimer = 0;
let actionFlashLoadCancel = null;
let actionFlashTransitionCancel = null;
const ACTION_FLASH_ENTER_MS = 500;
const ACTION_FLASH_HOLD_MS = 1000;
const ACTION_FLASH_EXIT_MS = 550;

function cancelActionFlashLoad() {
  if (actionFlashLoadCancel) {
    actionFlashLoadCancel();
    actionFlashLoadCancel = null;
  }
}

function cancelActionFlashTransition() {
  if (actionFlashTransitionCancel) {
    actionFlashTransitionCancel();
    actionFlashTransitionCancel = null;
  }
}

function waitForActionFlashImage(img, token, expectedSrc) {
  return new Promise(resolve => {
    let settled = false;
    const isCurrent = () => token === actionFlashToken && sheetOpen() && img.src === expectedSrc;
    const cleanup = () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      if (actionFlashLoadCancel === cleanup) actionFlashLoadCancel = null;
    };
    const finish = ready => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ready);
    };
    const decodeAndFinish = async () => {
      if (!isCurrent()) {
        finish(false);
        return;
      }
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          finish(false);
          return;
        }
      }
      finish(isCurrent() && img.complete && img.naturalWidth > 0);
    };
    const onLoad = () => {
      if (!isCurrent()) {
        finish(false);
        return;
      }
      void decodeAndFinish();
    };
    const onError = () => finish(false);

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    actionFlashLoadCancel = cleanup;
    if (img.complete) {
      if (img.naturalWidth > 0) void decodeAndFinish();
      else finish(false);
    }
  });
}

function clearActionFlash() {
  actionFlashToken += 1;
  if (actionFlashTimer) {
    clearTimeout(actionFlashTimer);
    actionFlashTimer = 0;
  }
  cancelActionFlashLoad();
  cancelActionFlashTransition();
  const img = $("action-flash-img");
  if (!img) return;
  img.classList.remove("flash-in", "flash-out");
  img.hidden = true;
}

function showActionFlash(url, alt) {
  if (!url || !sheetOpen()) return;
  const img = $("action-flash-img");
  if (!img) return;
  const token = ++actionFlashToken;
  if (actionFlashTimer) {
    clearTimeout(actionFlashTimer);
    actionFlashTimer = 0;
  }
  cancelActionFlashLoad();
  cancelActionFlashTransition();

  // Reset while hidden so a rapid re-press never swaps the visible frame.
  img.classList.remove("flash-in", "flash-out");
  img.hidden = true;
  img.alt = alt || "";
  img.src = url;
  const expectedSrc = img.src;

  waitForActionFlashImage(img, token, expectedSrc).then(ready => {
    if (!ready || token !== actionFlashToken || !sheetOpen()) return;
    img.hidden = false;
    // Force the off-screen starting pose before beginning the enter transition.
    void img.offsetWidth;
    requestAnimationFrame(() => {
      if (token !== actionFlashToken || !sheetOpen() || img.hidden || img.src !== expectedSrc) return;
      img.classList.add("flash-in");
      actionFlashTimer = setTimeout(() => {
        if (token !== actionFlashToken || img.src !== expectedSrc) return;
        img.classList.remove("flash-in");
        img.classList.add("flash-out");
        const finish = () => {
          if (token !== actionFlashToken) return;
          cancelActionFlashTransition();
          img.hidden = true;
          img.classList.remove("flash-out");
          actionFlashTimer = 0;
        };
        const onEnd = ev => {
          if (ev && ev.target !== img) return;
          if (ev?.propertyName && ev.propertyName !== "transform" && ev.propertyName !== "opacity") return;
          finish();
        };
        const cancelTransition = () => img.removeEventListener("transitionend", onEnd);
        actionFlashTransitionCancel = cancelTransition;
        img.addEventListener("transitionend", onEnd);
        actionFlashTimer = setTimeout(() => {
          finish();
        }, ACTION_FLASH_EXIT_MS);
      }, ACTION_FLASH_ENTER_MS + ACTION_FLASH_HOLD_MS);
    });
  });
}

/** 摸臀／摟腰：快取 URL，並以閃現層顯示（不永久替換 #portrait-img）。 */
function showTeasePortrait(who, shotKey, url, alt) {
  if (!who || !url) return;
  who.portraits = who.portraits || {};
  who.portraits[shotKey] = url;
  if (girl && girl.id === who.id && sheetOpen()) {
    showActionFlash(url, alt);
  }
}

/** 摸臀：先用 per-girl 預產圖；缺才 live gen（走 generateButtPackImage）。有組→packs[id]，無組→tease_butt。 */
async function maybeGenButtShot(who, actId) {
  if (actId !== "butt" || !who?.id) return;
  if (buttGenning.has(who.id)) return;
  buttGenning.add(who.id);
  try {
    const pack = await pickRuntimeButtPack();
    who.portraits = who.portraits || {};
    const cached = pack
      ? String(who.portraits.tease_butt_packs?.[pack.id] || "")
      : String(who.portraits.tease_butt || "");
    if (cached) {
      showTeasePortrait(who, "tease_butt", cached, `${who.name}的摸臀圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateButtPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      if (pack?.id) {
        who.portraits.tease_butt_packs = who.portraits.tease_butt_packs || {};
        who.portraits.tease_butt_packs[pack.id] = stamped;
      }
      showTeasePortrait(who, "tease_butt", stamped, `${who.name}的摸臀圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenButtShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenButtShot]", err?.message || err);
  } finally {
    buttGenning.delete(who.id);
  }
}

/** 摟腰：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen（走 generateWaistPackImage）。 */
async function maybeGenWaistShot(who, actId) {
  if (actId !== "waist" || !who?.id) return;
  if (waistGenning.has(who.id)) return;
  waistGenning.add(who.id);
  try {
    const pack = await pickRuntimeWaistPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_waist_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_waist", cached, `${who.name}的摟腰圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateWaistPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_waist_packs = who.portraits.tease_waist_packs || {};
      who.portraits.tease_waist_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_waist", stamped, `${who.name}的摟腰圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenWaistShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenWaistShot]", err?.message || err);
  } finally {
    waistGenning.delete(who.id);
  }
}

/** 摸奶：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen。 */
async function maybeGenBreastShot(who, actId) {
  if (actId !== "breast" || !who?.id) return;
  if (breastGenning.has(who.id)) return;
  breastGenning.add(who.id);
  try {
    const pack = await pickRuntimeBreastPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_breast_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_breast", cached, `${who.name}的摸奶圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateBreastPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_breast_packs = who.portraits.tease_breast_packs || {};
      who.portraits.tease_breast_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_breast", stamped, `${who.name}的摸奶圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenBreastShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenBreastShot]", err?.message || err);
  } finally {
    breastGenning.delete(who.id);
  }
}

/** 揉奶：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen。 */
async function maybeGenKneadShot(who, actId) {
  if (actId !== "breast_knead" || !who?.id) return;
  if (kneadGenning.has(who.id)) return;
  kneadGenning.add(who.id);
  try {
    const pack = await pickRuntimeKneadPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_breast_knead_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_breast_knead", cached, `${who.name}的揉奶圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateKneadPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_breast_knead_packs = who.portraits.tease_breast_knead_packs || {};
      who.portraits.tease_breast_knead_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_breast_knead", stamped, `${who.name}的揉奶圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenKneadShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenKneadShot]", err?.message || err);
  } finally {
    kneadGenning.delete(who.id);
  }
}

/** 吸奶頭：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen。 */
async function maybeGenSuckShot(who, actId) {
  if (actId !== "breast_suck" || !who?.id) return;
  if (suckGenning.has(who.id)) return;
  suckGenning.add(who.id);
  try {
    const pack = await pickRuntimeSuckPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_breast_suck_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_breast_suck", cached, `${who.name}的吸奶頭圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateSuckPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_breast_suck_packs = who.portraits.tease_breast_suck_packs || {};
      who.portraits.tease_breast_suck_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_breast_suck", stamped, `${who.name}的吸奶頭圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenSuckShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenSuckShot]", err?.message || err);
  } finally {
    suckGenning.delete(who.id);
  }
}


async function maybeGenLickShot(who, actId) {
  if (actId !== "nipple_lick" || !who?.id) return;
  if (lickGenning.has(who.id)) return;
  lickGenning.add(who.id);
  try {
    const pack = await pickRuntimeLickPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_nipple_lick_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_nipple_lick", cached, `${who.name}的舔奶頭圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateLickPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_nipple_lick_packs = who.portraits.tease_nipple_lick_packs || {};
      who.portraits.tease_nipple_lick_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_nipple_lick", stamped, `${who.name}的舔奶頭圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenLickShot]", err?.message || err);
  } finally {
    lickGenning.delete(who.id);
  }
}

async function maybeGenLabiaShot(who, actId) {
  if (actId !== "labia" || !who?.id) return;
  if (labiaGenning.has(who.id)) return;
  labiaGenning.add(who.id);
  try {
    const pack = await pickRuntimeLabiaPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_labia_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_labia", cached, `${who.name}的摸陰唇圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateLabiaPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_labia_packs = who.portraits.tease_labia_packs || {};
      who.portraits.tease_labia_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_labia", stamped, `${who.name}的摸陰唇圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenLabiaShot]", err?.message || err);
  } finally {
    labiaGenning.delete(who.id);
  }
}

async function maybeGenLabiaRubShot(who, actId) {
  if (actId !== "labia_rub" || !who?.id) return;
  if (labiaRubGenning.has(who.id)) return;
  labiaRubGenning.add(who.id);
  try {
    const pack = await pickRuntimeLabiaRubPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_labia_rub_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_labia_rub", cached, `${who.name}的揉陰唇圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateLabiaRubPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_labia_rub_packs = who.portraits.tease_labia_rub_packs || {};
      who.portraits.tease_labia_rub_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_labia_rub", stamped, `${who.name}的揉陰唇圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenLabiaRubShot]", err?.message || err);
  } finally {
    labiaRubGenning.delete(who.id);
  }
}

async function maybeGenFingerShot(who, actId) {
  if (actId !== "finger_in" || !who?.id) return;
  if (fingerGenning.has(who.id)) return;
  fingerGenning.add(who.id);
  try {
    const pack = await pickRuntimeFingerPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    const cached = String(who.portraits.tease_finger_in_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_finger_in", cached, `${who.name}的手指插入圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateFingerPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_finger_in_packs = who.portraits.tease_finger_in_packs || {};
      who.portraits.tease_finger_in_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_finger_in", stamped, `${who.name}的手指插入圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenFingerShot]", err?.message || err);
  } finally {
    fingerGenning.delete(who.id);
  }
}

/** 預產圖：半身＋各已存動作圖組（寫入 who.portraits）。UI 安靜；呼叫端負責儀式文案。 */
async function pregenGirlPortraits(who = girl, opts = {}) {
  if (!who || (who === girl && sheIsOut())) {
    return { half: false, counts: {} };
  }
  if (pregenning) {
    throw new Error("預產進行中");
  }
  pregenning = true;
  const force = opts.force !== false; // default force for summon path
  const onStatus = typeof opts.onStatus === "function" ? opts.onStatus : null;
  const counts = {
    butt: 0, waist: 0, breast: 0, knead: 0, suck: 0,
    lick: 0, labia: 0, labia_rub: 0, finger: 0,
  };
  let halfOk = false;
  try {
    await ensureGirlComfyCkpt(who);
    const engine = await gameImgRoute();
    if (engine.imgProvider === "comfy" && !String(who.comfyCkpt || "").trim()) {
      throw new Error("此魅子尚未綁定 Comfy 模型");
    }

    await ensureHalfPortrait(who, {
      required: true,
      force: !!force,
    });
    halfOk = !!who.portraits?.half;
    if (!halfOk) throw new Error("半身立繪生圖失敗");

    who.portraits = who.portraits || {};
    who.portraits.tease_butt_packs = who.portraits.tease_butt_packs || {};
    who.portraits.tease_waist_packs = who.portraits.tease_waist_packs || {};
    who.portraits.tease_breast_packs = who.portraits.tease_breast_packs || {};
    who.portraits.tease_breast_knead_packs = who.portraits.tease_breast_knead_packs || {};
    who.portraits.tease_breast_suck_packs = who.portraits.tease_breast_suck_packs || {};
    who.portraits.tease_nipple_lick_packs = who.portraits.tease_nipple_lick_packs || {};
    who.portraits.tease_labia_packs = who.portraits.tease_labia_packs || {};
    who.portraits.tease_labia_rub_packs = who.portraits.tease_labia_rub_packs || {};
    who.portraits.tease_finger_in_packs = who.portraits.tease_finger_in_packs || {};

    const packJobs = [
      { load: loadButtDoc, gen: generateButtPackImage, packsKey: "tease_butt_packs", shotKey: "tease_butt", countKey: "butt" },
      { load: loadWaistDoc, gen: generateWaistPackImage, packsKey: "tease_waist_packs", shotKey: "tease_waist", countKey: "waist" },
      { load: loadBreastDoc, gen: generateBreastPackImage, packsKey: "tease_breast_packs", shotKey: "tease_breast", countKey: "breast" },
      { load: loadKneadDoc, gen: generateKneadPackImage, packsKey: "tease_breast_knead_packs", shotKey: "tease_breast_knead", countKey: "knead" },
      { load: loadSuckDoc, gen: generateSuckPackImage, packsKey: "tease_breast_suck_packs", shotKey: "tease_breast_suck", countKey: "suck" },
      { load: loadLickDoc, gen: generateLickPackImage, packsKey: "tease_nipple_lick_packs", shotKey: "tease_nipple_lick", countKey: "lick" },
      { load: loadLabiaDoc, gen: generateLabiaPackImage, packsKey: "tease_labia_packs", shotKey: "tease_labia", countKey: "labia" },
      { load: loadLabiaRubDoc, gen: generateLabiaRubPackImage, packsKey: "tease_labia_rub_packs", shotKey: "tease_labia_rub", countKey: "labia_rub" },
      { load: loadFingerDoc, gen: generateFingerPackImage, packsKey: "tease_finger_in_packs", shotKey: "tease_finger_in", countKey: "finger" },
    ];

    for (const job of packJobs) {
      let packs = [];
      try {
        const doc = await job.load();
        packs = Array.isArray(doc?.packs) ? doc.packs : [];
      } catch (err) {
        console.warn("[pregenGirlPortraits] load", job.packsKey, err?.message || err);
        packs = [];
      }
      if (!packs.length) continue;
      for (const pack of packs) {
        if (!pack?.id) continue;
        const result = await job.gen(pack, who, engine, {
          stage: who.stage || "stranger",
          worn: wornOutfit(who),
        });
        if (result?.status === "done" && result.result) {
          const stamped = stampPortraitUrl(result.result);
          who.portraits[job.packsKey][pack.id] = stamped;
          who.portraits[job.shotKey] = stamped;
          counts[job.countKey] += 1;
          persistRoom();
        } else {
          throw new Error(result?.error || `${job.shotKey}「${pack.name || pack.id}」生圖失敗`);
        }
      }
    }

    if (onStatus) onStatus(`半身與動作圖已就緒`);
    return { half: halfOk, counts };
  } catch (err) {
    const message = String(err?.message || err || "未知錯誤");
    console.warn("[pregenGirlPortraits]", message);
    throw err;
  } finally {
    pregenning = false;
  }
}

function paintHalfPortrait(who = girl) {
  const img = $("portrait-img");
  if (!img) return;
  const url = who?.portraits?.half || (who?.portrait && !who?.portraits?.full ? who.portrait : "") || "";
  if (!url || !who) {
    resetPortraitEntrance(img);
    img.removeAttribute("src");
    img.alt = "";
    return;
  }
  img.alt = `${who.name}的半身立繪`;
  const prev = img.getAttribute("src") || "";
  const srcChanged = prev !== url;
  if (srcChanged) img.src = url;
  // Prefetch while sheet closed: keep off-screen until long-press opens chat.
  if (!sheetOpen()) {
    resetPortraitEntrance(img);
    return;
  }
  const reveal = () => startPortraitEntrance(img);
  if (srcChanged && !img.complete) {
    img.addEventListener("load", reveal, { once: true });
    img.addEventListener("error", reveal, { once: true });
    return;
  }
  reveal();
}

async function ensureHalfPortrait(who, opts = {}) {
  if (!who?.id) {
    if (opts.required) throw new Error("無魅子");
    return;
  }
  // 舊房間存檔可能沒綁 ckpt；生圖前補上（非 comfy 則 no-op）
  try {
    await ensureGirlComfyCkpt(who);
  } catch (err) {
    if (opts.required) throw err;
  }
  if (who.portraits?.half && !opts.force) {
    paintHalfPortrait(who);
    return opts.required ? { ok: true } : undefined;
  }
  // 已有進行中的生圖：非 required 直接返回；required 則等結果。
  // force 會等前一個工作流結束後再開一輪，確保本次按鈕一定重產。
  if (halfGenning.has(who.id)) {
    if (!opts.required && !opts.force) return;
    const t0 = Date.now();
    while (halfGenning.has(who.id) && Date.now() - t0 < 360000) {
      await new Promise((r) => setTimeout(r, 800));
      if (!opts.force && who.portraits?.half) {
        paintHalfPortrait(who);
        return { ok: true };
      }
    }
    if (halfGenning.has(who.id)) throw new Error("半身立繪生圖逾時");
    if (!opts.force && who.portraits?.half) {
      paintHalfPortrait(who);
      return { ok: true };
    }
  }
  halfGenning.add(who.id);
  try {
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    if (opts.required && engine.imgProvider === "comfy" && !String(who.comfyCkpt || "").trim()) {
      throw new Error("此魅子尚未綁定 Comfy 模型");
    }
    const waiter = opts.required ? waitImageStrict : waitImage;
    const result = await waiter(
      portraitBody(who, engine),
      opts.required ? opts.onTick : undefined,
    );
    if (result?.status === "done" && result.result) {
      const url = String(result.result);
      who.portraits = who.portraits || {};
      who.portraits.half = url.includes("?") ? url : `${url}?v=${Date.now()}`;
      who.portrait = who.portraits.full || who.portraits.half;
      // Only touch live UI / session if this is still the room girl.
      if (girl && girl.id === who.id) {
        paintHalfPortrait(who);
        persistRoom();
      }
      return opts.required ? { ok: true } : undefined;
    }
    const errMsg = result?.error || "半身立繪生圖失敗";
    if (opts.required) throw new Error(errMsg);
    if (result?.status === "error") {
      console.warn("[ensureHalfPortrait]", errMsg);
    }
  } catch (err) {
    if (opts.required) throw err;
    console.warn("[ensureHalfPortrait]", err?.message || err);
  } finally {
    halfGenning.delete(who.id);
  }
}

function lookLine(g) {
  const look = g.look || {};
  return [
    look.age != null ? `${look.age}歲` : "",
    look.hair_color,
    look.hair,
    look.eye_color,
    wornOutfit(g),
  ].filter(Boolean).join(" · ");
}

function titleOf(g) {
  return `${g.name} ${RARITY_MARK[g.rarity] || ""} ${g.rarity || ""}`.trim();
}

function activityLine() {
  const activity = girl?.world?.activity;
  const job = girl?.world?.job;
  if (activity === "wander") {
    const place = girl.world.stroll?.placeName;
    if (girl.world.stroll?.pending && place) return `她走到${place}。`;
    if (place) return `她在${place}逛過。`;
    return "她在亂逛。";
  }
  if (activity === "work" && !job) return "她在挑打工。";
  if (activity === "work" && girl.world.shift?.pending) return `她在${job.name}開始工作了。`;
  if (job) return `她的打工是${job.name}。`;
  return "";
}

function sceneLine() {
  const activity = girl?.world?.activity;
  const scene = activity === "work" ? girl.world.shift : activity === "wander" ? girl.world.stroll : null;
  if (!scene) return "";
  const tone = scene.toneName ? `${scene.toneName}\n` : "";
  if (scene.pending) return scene.toneName ? `${scene.toneName}\n事情正在發生。` : "事情正在發生。";
  let known = "";
  if (scene.known && scene.personName) known = `\n她認識了${scene.personName}。`;
  else if (scene.revisit && scene.personName) {
    const zh = bondLabel(scene.bond);
    if (scene.bondAdvanced === "familiar") known = `\n又碰到${scene.personName}，變熟了（${zh}）。`;
    else if (scene.bondAdvanced === "physical") known = `\n又碰到${scene.personName}，有了身體關係。`;
    else if (scene.bondAdvanced === "fwb") known = `\n又碰到${scene.personName}，成了炮友。`;
    else known = `\n又碰到${scene.personName}（${zh}）。`;
  }
  const sexBits = [];
  if (scene.sexIntensity === "continuous") sexBits.push("連續交配");
  else if (scene.sexIntensity === "marathon") sexBits.push("做到虛脫");
  if (scene.spasm) sexBits.push("痙攣餘韻");
  if (scene.pregnant) sexBits.push(scene.breeding || breedingLabel(girl) || "配種成功");
  if (sexBits.length) known += `\n${sexBits.join("・")}。`;
  if (!scene.roleName) return `${tone}${scene.event || ""}${known}`;
  return `${tone}一位${scene.roleName}，情緒是${scene.emotionName}。\n${scene.event}${known}`;
}

function placedRegion() {
  return girl?.world ? regionById(girl.world.regionId) : null;
}

let clockTimer = 0;

function hereNow(who) {
  const ground = who?.world?.ground;
  if (!ground) return "";
  const now = japanNow();
  return [
    `人在${ground.name}。這是日本真實的地方，不要換成別的城市或區。`,
    ground.fact,
    climateNote(ground.regionId, now.season),
    now.line,
  ].filter(Boolean).join("\n");
}

function renderWhere() {
  const ground = girl?.world?.ground;
  const now = japanNow();
  const out = sheIsOut();
  const where = $("girl-where");
  where.hidden = !ground || out;
  where.textContent = ground ? `${ground.name}　${now.label}` : "";
  const clock = $("world-clock");
  clock.hidden = !ground || !out;
  clock.textContent = now.label;
  if (ground && !clockTimer) clockTimer = setInterval(renderWhere, 30000);
}

function sheIsOut() {
  return !!girl?.world && !window.RoomActor?.isPresent();
}

function renderWorld() {
  const panel = $("girl-world");
  const region = placedRegion();
  const out = sheIsOut();
  // 主畫面 room-home：不掛單人住處／地點橫幅（多人時無意義）；沙盒 test_room 仍顯示
  if (document.body.classList.contains("room-home")) {
    if (panel) panel.hidden = true;
    activityOpen = false;
    const where = $("girl-where");
    if (where) where.hidden = true;
    renderMood();
    renderFriends();
    return;
  }
  if (!girl || !region || !out) {
    panel.hidden = true;
    activityOpen = false;
    renderWhere();
    renderMood();
    renderFriends();
    return;
  }
  panel.hidden = false;
  const home = girl.world.home;
  const activity = girl.world.activity;
  const ground = girl.world.ground;
  $("world-lead").textContent = ground
    ? `${girl.name}離開了房間，人在${ground.name}。`
    : `${girl.name}離開了房間，現在人在日本的${region.name}。`;
  $("world-region").textContent = region.name;
  $("world-home").textContent = home ? `住在${home.name}。` : "正在決定她住哪。";
  $("world-activity").hidden = !activity && !girl.world.job;
  $("world-activity").textContent = activityLine();
  const shiftText = sceneLine();
  $("world-shift").hidden = !shiftText;
  $("world-shift").textContent = shiftText;
  // 召喚鍵：有 world 在外即可召回（不必已有住處）；活動仍要有家
  $("world-actions").hidden = false;
  const openAct = $("open-activity");
  if (openAct) openAct.hidden = !home;
  $("open-activity").setAttribute("aria-expanded", String(activityOpen));
  $("activity-choices").hidden = !activityOpen || !home;
  $("activity-work").setAttribute("aria-pressed", String(activity === "work"));
  $("activity-wander").setAttribute("aria-pressed", String(activity === "wander"));
  renderWhere();
  renderMood();
  renderFriends();
}

const MOODS = {
  平靜: "心情平靜。話照平常說。",
  愉快: "心情愉快，有點輕。不要突然變沉重。",
  不悅: "心情不悅。話短一點，可以帶火氣，不要罵很長。",
  低落: "心情低落。話少，不要突然變開朗。",
  不安: "心情不安。人在房間裡，害怕還沒退。不要描寫血腥。",
  虛脫: "身體虛脫、腿軟站不穩。話短、喘，不要裝成精力充沛。",
};

function noteScpStep(who, scp) {
  if (!who?.world || !scp?.id) return;
  if (!who.world.scpSteps) who.world.scpSteps = {};
  who.world.scpSteps[scp.id] = scp.step + 1;
}

function setMood(who, name) {
  if (!who?.world || !MOODS[name]) return;
  who.world.mood = name;
}

function moodFromStroll(rolled) {
  if (rolled.scp || rolled.tone?.id === "horror" || rolled.tone?.id === "scp") return "不安";
  const emotion = rolled.emotion?.name;
  if (emotion === "怒") return "不悅";
  if (emotion === "哀") return "低落";
  if (rolled.tone?.id === "wonder" || emotion === "喜" || emotion === "樂") return "愉快";
  return "平靜";
}

function moodFromShift(rolled) {
  if (rolled.scp) return "不安";
  const emotion = rolled.emotion?.name;
  if (emotion === "怒") return "不悅";
  if (emotion === "哀") return "低落";
  if (emotion === "喜" || emotion === "樂") return "愉快";
  return "平靜";
}

function renderMood() {
  const world = girl?.world;
  if (world?.exhaustedUntil && Date.now() >= world.exhaustedUntil) {
    world.exhaustedUntil = 0;
    if (world.mood === "虛脫") world.mood = "平靜";
  }
  const mood = world?.mood;
  const breed = breedingLabel(girl);
  const preg = breed ? `・${breed}` : "";
  const line = $("girl-mood");
  const text = mood ? `心情 ${mood}${preg}` : (breed || "");
  line.hidden = !text;
  line.textContent = text;
}

const FRIEND_LIMIT = 5;
const FRIEND_CHANCE = 1 / 3;
const REVISIT_CHANCE = 0.45;
const PHYSICAL_BASE = 0.18;
const PHYSICAL_AROUSAL_BONUS = 0.08;
const PHYSICAL_OPENNESS_BONUS = 0.06;
const FWB_BASE = 0.28;
const SLOW_DATING_OR_WIFE = 0.35;
const SLOW_CLOSE_FRIEND = 0.55;

const BOND_ZH = {
  acquaintance: "普通",
  familiar: "熟悉",
  physical: "肉體關係",
  fwb: "炮友",
};

const DATING_OR_WIFE_STAGES = new Set([
  "girlfriend",
  "passionate",
  "lover",
  "wife",
  "devoted_wife",
  "obedient_wife",
  "pathological_wife",
]);

/** 妻子階（不含女友／熱戀／愛人）：生產後留下並強制安頓小孩。 */
const WIFE_STAGES = new Set([
  "wife",
  "devoted_wife",
  "obedient_wife",
  "pathological_wife",
]);
const CHILD_SETTLE_GOLD = 100;

function isWifeStage(stage) {
  return WIFE_STAGES.has(stage || "");
}

/** 妻子安頓後顯示「配種成功 ×次數」；有孕時另帶進行中男子名。非妻子僅有孕時顯示配種成功（名）。 */
function breedingSuccessCount(who = girl) {
  const kids = who?.world?.children;
  return Array.isArray(kids) ? kids.length : 0;
}

function breedingLabel(who = girl) {
  const preg = who?.world?.pregnancy;
  const n = breedingSuccessCount(who);
  const wife = isWifeStage(who?.stage);
  if (preg) {
    const dad = preg.fatherName || "對方";
    if (wife && n > 0) return `配種成功 ×${n}・進行中（${dad}）`;
    return `配種成功（${dad}）`;
  }
  // 妻子：生產安頓後常駐標註次數
  if (wife && n > 0) return `配種成功 ×${n}`;
  return "";
}


function bondLabel(bond) {
  return BOND_ZH[bond] || BOND_ZH.acquaintance;
}

function inferFriendGender(role, explicit) {
  if (explicit === "male" || explicit === "female" || explicit === "unknown") return explicit;
  const s = String(role || "");
  if (/男|哥哥|弟弟|先生|君|おじさん|店員男|男孩|男子|少爺|小伙|男友|老公/.test(s)) return "male";
  if (/女|姊|姐|妹|小姐|夫人|阿姨|店員女|女孩|女子|姑娘|女友|老婆/.test(s)) return "female";
  return "unknown";
}

/** 身分看不出性別時擲幣，讓男性肉體線可達成。 */
function rollFriendGender(role, random = Math.random, explicit) {
  const fromRole = inferFriendGender(role, explicit);
  if (fromRole !== "unknown") return fromRole;
  return Number(random()) < 0.5 ? "male" : "female";
}

function ensureFriends(who) {
  if (!who?.world) return [];
  if (!Array.isArray(who.world.friends)) who.world.friends = [];
  for (const friend of who.world.friends) {
    if (!friend || typeof friend !== "object") continue;
    if (!BOND_ZH[friend.bond]) friend.bond = "acquaintance";
    friend.meets = Math.max(1, Math.round(Number(friend.meets) || 1));
    if (!friend.lastMeetAt) friend.lastMeetAt = friend.at || Date.now();
    if (!friend.at) friend.at = friend.lastMeetAt;
    if (friend.gender !== "male" && friend.gender !== "female" && friend.gender !== "unknown") {
      friend.gender = inferFriendGender(friend.role);
    }
  }
  return who.world.friends;
}

function renderFriends() {
  const friends = ensureFriends(girl);
  const panel = $("girl-friends");
  panel.hidden = friends.length === 0;
  $("friend-heading").textContent = `朋友 ${friends.length}/${FRIEND_LIMIT}`;
  const list = $("friend-list");
  list.replaceChildren();
  for (const friend of friends) {
    const item = document.createElement("li");
    item.textContent = `${friend.name} · ${friend.role} · ${bondLabel(friend.bond)}`;
    list.append(item);
  }
}

function rollBefriend(who, act, random = Math.random) {
  if (!act?.know) return false;
  if ((ensureFriends(who).length || 0) >= FRIEND_LIMIT) return false;
  return Number(random()) < FRIEND_CHANCE;
}

function addFriend(who, friend, random = Math.random) {
  if (!who?.world || !friend?.name) return false;
  ensureFriends(who);
  if (who.world.friends.length >= FRIEND_LIMIT) return false;
  if (who.world.friends.some((item) => item.name === friend.name)) return false;
  const now = Date.now();
  who.world.friends.push({
    name: friend.name,
    role: friend.role || "路人",
    at: now,
    gender: rollFriendGender(friend.role, random, friend.gender),
    bond: BOND_ZH[friend.bond] ? friend.bond : "acquaintance",
    meets: Math.max(1, Math.round(Number(friend.meets) || 1)),
    lastMeetAt: now,
  });
  return true;
}

function shouldRevisitFriend(who, random = Math.random) {
  return ensureFriends(who).length > 0 && Number(random()) < REVISIT_CHANCE;
}

function pickRevisitFriend(who, preferredRole, random = Math.random) {
  const friends = ensureFriends(who);
  if (!friends.length) return null;
  const same = preferredRole ? friends.filter((item) => item.role === preferredRole) : [];
  const pool = same.length ? same : friends;
  return pool[Math.floor(Number(random()) * pool.length)] || null;
}

function friendBondSlow(who) {
  const stage = who?.stage || "stranger";
  if (DATING_OR_WIFE_STAGES.has(stage)) return SLOW_DATING_OR_WIFE;
  if (stage === "close_friend") return SLOW_CLOSE_FRIEND;
  return 1;
}

function friendBodyHot(who) {
  ensureBody(who);
  const arousal = who?.bodyState?.arousal || 0;
  const libido = who?.bodyState?.libido || 0;
  return arousal >= 8 || libido >= 16 || (arousal >= 5 && libido >= 12);
}

function friendOpenHigh(who) {
  return getOpenness(who) >= 45;
}

function physicalAdvanceChance(who) {
  let chance = PHYSICAL_BASE;
  if (friendBodyHot(who)) chance += PHYSICAL_AROUSAL_BONUS;
  if (friendOpenHigh(who)) chance += PHYSICAL_OPENNESS_BONUS;
  return chance * friendBondSlow(who);
}

function fwbAdvanceChance(who) {
  return FWB_BASE * friendBondSlow(who);
}

/** 再碰面：meets+1，並依階梯擲進階。回傳 { before, bond, advanced }。 */
function advanceFriendOnRevisit(who, friend, random = Math.random) {
  ensureFriends(who);
  if (!friend) return null;
  friend.meets = (Number(friend.meets) || 1) + 1;
  friend.lastMeetAt = Date.now();
  const before = BOND_ZH[friend.bond] ? friend.bond : "acquaintance";
  let advanced = "";
  if (before === "acquaintance" && friend.meets >= 3) {
    friend.bond = "familiar";
    advanced = "familiar";
  } else if (before === "familiar" && friend.gender === "male") {
    if (Number(random()) < physicalAdvanceChance(who)) {
      friend.bond = "physical";
      advanced = "physical";
    }
  } else if (before === "physical" && friend.gender === "male") {
    if (Number(random()) < fwbAdvanceChance(who)) {
      friend.bond = "fwb";
      advanced = "fwb";
    }
  }
  return { before, bond: friend.bond || before, advanced };
}

function memoryFriendNote(item) {
  if (!item?.personName) return "";
  if (item.known) return `，因此認識了${item.personName}`;
  if (!item.revisit) return "";
  let base = "";
  if (item.bondAdvanced === "familiar") base = `，跟${item.personName}變熟了`;
  else if (item.bondAdvanced === "physical") base = `，和${item.personName}有了身體關係`;
  else if (item.bondAdvanced === "fwb") base = `，和${item.personName}成了炮友`;
  else base = `，又碰到${item.personName}`;
  const bits = [];
  if (item.sexIntensity === "continuous") bits.push("連續交配");
  else if (item.sexIntensity === "marathon") bits.push("做到虛脫");
  if (item.spasm) bits.push("痙攣");
  if (item.pregnant) bits.push(item.breeding || "配種成功");
  return bits.length ? `${base}（${bits.join("・")}）` : base;
}

function friendGenderPrompt(gender) {
  if (gender === "male") return "對方是男性，代名詞用他。";
  if (gender === "female") return "對方是女性，代名詞用她。";
  return "";
}

function friendSexIntensityPrompt(intensity) {
  if (intensity === "continuous") {
    return "暗示連續做了好幾回，身體發軟，仍短2到4句，不要色情長文。";
  }
  if (intensity === "marathon") {
    return "暗示一直做到虛脫／腿軟站不穩，可帶痙攣餘韻暗示，仍短2到4句不要長文。";
  }
  if (intensity === "single") {
    return "暗示一次性行為／身體越界，可帶一點餘韻；2到4句，不要色情長文。";
  }
  return "";
}

function friendRevisitPrompt(friend, advanced, intensity = "") {
  if (!friend) return "";
  const name = friend.name;
  const bond = friend.bond || "acquaintance";
  const zh = bondLabel(bond);
  const genderLine = friendGenderPrompt(friend.gender);
  const intensityLine = friendSexIntensityPrompt(intensity);
  if (advanced === "physical") {
    return [
      `這次她再次碰到已經認識的${name}（關係從熟悉跨進肉體關係）。${genderLine}`,
      "不要再取新名字。寫兩人又見面，並",
      intensityLine || "暗示這次發生了一次性行為／身體越界，可帶一點餘韻；2到4句，不要色情長文。",
    ].join("");
  }
  if (advanced === "fwb") {
    return [
      `這次她再次碰到${name}（關係成了炮友）。${genderLine}`,
      "不要再取新名字。",
      intensityLine
        ? intensityLine
        : "寫成較明確的固定約炮／再見面的鉤子語氣，仍短，2到4句。",
    ].join("");
  }
  if (advanced === "familiar") {
    return [
      `這次她再次碰到${name}，兩人變熟了（熟悉）。${genderLine}`,
      "不要再取新名字。寫熟人再見面，2到4句。",
    ].join("");
  }
  if (bond === "fwb") {
    if (intensity) {
      return [
        `這次她再次碰到炮友${name}。${genderLine}`,
        "不要再取新名字。寫熟練的約見，並",
        intensityLine,
      ].join("");
    }
    return [
      `這次她再次碰到炮友${name}。${genderLine}`,
      "不要再取新名字。寫熟練的約見／身體後輕鬆互動，2到4句。",
    ].join("");
  }
  if (bond === "physical") {
    return [
      `這次她再次碰到${name}（已有肉體關係）。${genderLine}`,
      "不要再取新名字。可輕帶上次身體餘韻或曖昧，2到4句。",
    ].join("");
  }
  if (bond === "familiar") {
    return [
      `這次她再次碰到已經變熟的${name}（${zh}）。${genderLine}`,
      "不要再取新名字。寫熟人再見面，2到4句。",
    ].join("");
  }
  return [
    `這次她再次碰到認識的${name}（${zh}）。${genderLine}`,
    "不要再取新名字。寫普通再碰面，2到4句。",
  ].join("");
}

/** 朋友線剛發生肉體／炮友事件時：對玩家感情微調（尺度約 ±1～2）。
 * 規則：女友／妻子階 → 冷淡心虛扣、佔有反而黏一下、其餘微扣；
 * 親密好友／更早 → 小幅隨機 ±1。保持細微，不跨儀式門檻。 */
function friendSexAffectionDelta(who, random = Math.random) {
  const stage = who?.stage || "stranger";
  const family = PERSONALITY_FAMILY[basePersonality(who)] || "溫柔";
  if (DATING_OR_WIFE_STAGES.has(stage)) {
    if (family === "佔有") return 2; // clingy bump
    if (family === "冷淡") return -2; // guilt withdraw
    return -1; // mild guilt
  }
  if (stage === "close_friend") return Number(random()) < 0.5 ? -1 : 1;
  return Number(random()) < 0.5 ? -1 : 1;
}

/** 是否為「肉體／炮友性行為」事件（首次肉體、升炮友、或炮友再遇）。 */
function friendSexEventKind(bondResult) {
  if (!bondResult) return "";
  if (bondResult.advanced === "physical") return "physical";
  if (bondResult.advanced === "fwb") return "fwb";
  if (bondResult.bond === "fwb") return "fwb_again";
  return "";
}

/** 強度擲骰：single 50% / continuous 32% / marathon 18%。 */
function rollFriendSexIntensity(random = Math.random) {
  const r = Number(random());
  if (r < 0.50) return "single";
  if (r < 0.82) return "continuous"; // 50+32
  return "marathon";
}

const FRIEND_SEX_SPASM_CHANCE = { single: 0.10, continuous: 0.28, marathon: 0.55 };
const FRIEND_SEX_PREG_CHANCE = { single: 0.08, continuous: 0.16, marathon: 0.28 };

/** 打工／亂逛結束狀態列：連續／虛脫／痙攣／有孕短尾。 */
function friendSexStatusTail(aftermath) {
  if (!aftermath) return "";
  const bits = [];
  if (aftermath.intensity === "continuous") bits.push("連續交配");
  else if (aftermath.intensity === "marathon") bits.push("做到虛脫");
  if (aftermath.spasm) bits.push("痙攣");
  if (aftermath.pregnantNew) bits.push(aftermath.breeding || breedingLabel(girl) || "配種成功");
  return bits.length ? bits.join("・") + "。" : "";
}

/**
 * 朋友線肉體／炮友後果：依強度套身體／精液／衝擊／痙攣／餘韻／房間有孕。
 * intensity 應由呼叫端先擲好傳入（與旁白 prompt 同一份）；缺省才補擲。
 */
function applyFriendPhysicalAftermath(who, friend, kind, random = Math.random, opts = {}) {
  if (!who || !friend || !kind) return null;
  ensureBody(who);
  ensureStunFields(who);
  const b = who.bodyState;
  const o = b.organs;
  if (!who.world) who.world = {};

  const pending = who.world._pendingFriendSex;
  let intensity = opts.intensity || pending?.intensity || "";
  if (!intensity) intensity = rollFriendSexIntensity(random);
  if (!["single", "continuous", "marathon"].includes(intensity)) intensity = "single";

  // 1) Body by intensity（既有性奮／濕潤為地板，再往上）
  let aroAdd = 15 + Math.floor(Number(random()) * 21); // 15–35
  let wetAdd = Number(random()) < 0.45 ? 2 : 1;
  let semenAdd = 1;
  let shockAdd = 8 + Math.floor(Number(random()) * 7); // 8–14
  let agMs = AFTERGLOW_FRIEND_MS;
  let agReplies = AFTERGLOW_FRIEND_REPLIES;

  if (intensity === "continuous") {
    aroAdd = 20 + Math.floor(Number(random()) * 16); // 20–35
    wetAdd = 2;
    semenAdd = 2;
    shockAdd = 18 + Math.floor(Number(random()) * 11); // 18–28
    agMs = AFTERGLOW_FRIEND_CONT_MS;
    agReplies = AFTERGLOW_FRIEND_CONT_REPLIES;
  } else if (intensity === "marathon") {
    aroAdd = 20 + Math.floor(Number(random()) * 16); // 20–35，可維持偏高
    wetAdd = 3; // max toward 3
    semenAdd = 2 + (Number(random()) < 0.5 ? 1 : 0); // 2–3
    shockAdd = 28 + Math.floor(Number(random()) * 13); // 28–40
    agMs = AFTERGLOW_FRIEND_MARATHON_MS;
    agReplies = AFTERGLOW_FRIEND_MARATHON_REPLIES;
    b.libido = clampBody((b.libido || 0) - 2);
    who.world.exhaustedUntil = Date.now() + 10 * 60 * 1000;
    setMood(who, "虛脫");
  }

  b.arousal = clampBody((b.arousal || 0) + aroAdd);
  o.vagina.wet = Math.min(3, (o.vagina.wet || 0) + wetAdd);
  o.labia.wet = true;
  if (wetAdd >= 2 || (o.vagina.wet || 0) >= 2) o.clit.wet = true;

  o.uterus.semen = Math.min(3, (o.uterus.semen || 0) + semenAdd);
  if (o.vagina.stuffed === "penis") o.vagina.stuffed = "semen";
  else o.vagina.stuffed = "semen";

  b.shock = Math.max(0, Math.min(SHOCK_MAX, (b.shock || 0) + shockAdd));

  // 2) Afterglow by intensity
  noteAfterglow(who, "hers", {
    ms: agMs,
    replies: agReplies,
    source: "friend",
  });

  // 3) Spasm
  let spasm = false;
  const spasmChance = FRIEND_SEX_SPASM_CHANCE[intensity] || 0;
  if (Number(random()) < spasmChance) {
    b.spasmUntil = Date.now() + SPASM_MS;
    b.overstim = false;
    spasm = true;
  }

  // 4) Room-local pregnancy（不移除、不碰 sim.py）
  let pregnantNew = false;
  const already = !!who.world.pregnancy;
  if (!already) {
    const pregChance = FRIEND_SEX_PREG_CHANCE[intensity] || 0;
    if (Number(random()) < pregChance) {
      who.world.pregnancy = {
        at: Date.now(),
        fatherName: friend.name || "",
        fatherRole: friend.role || "",
        intensity,
        kind,
        ticks: 0,
      };
      pregnantNew = true;
    }
  }

  // 5) Chat tone flag
  who.world.friendSex = {
    at: Date.now(),
    name: friend.name || "",
    kind,
    intensity,
    spasm,
    pregnant: pregnantNew || already,
    chatLeft: intensity === "single" ? 4 : 5,
  };
  who.world._pendingFriendSex = null;

  // 6) Affection nudge
  const beforeAff = who.affection || 0;
  const beforeStage = who.stage || "stranger";
  const delta = friendSexAffectionDelta(who, random);
  who.affection = beforeAff + delta;
  syncStage(who);
  const stageNote = who.stage !== beforeStage ? `，關係變成${STAGE_NAME[who.stage]}` : "";
  const kindZh = kind === "physical" ? "肉體關係" : kind === "fwb" ? "成炮友" : "炮友再遇";
  const intenZh = intensity === "continuous" ? "連續" : intensity === "marathon" ? "虛脫" : "單次";
  const extra = [
    spasm ? "痙攣" : "",
    pregnantNew ? (breedingLabel(who) || "配種成功") : (already ? (breedingLabel(who) || "已孕") : ""),
  ].filter(Boolean).join("・");
  pushDebug(
    `朋友線 ${kindZh}・${friend.name || "對方"}・${intenZh}　性奮+${aroAdd}　濕潤+${wetAdd}　精液+${semenAdd}　衝擊+${shockAdd}　餘韻${agReplies}句／${Math.round(agMs / 1000)}s　感情 ${who.affection}（${delta >= 0 ? "+" : ""}${delta}）${stageNote}${extra ? "　" + extra : ""}`,
  );
  return {
    aroAdd, wetAdd, semenAdd, shockAdd, delta, kind, intensity, spasm,
    pregnant: pregnantNew || already, pregnantNew,
    breeding: breedingLabel(who) || "",
  };
}

function decayFriendSexFlag(who = girl) {
  const fs = who?.world?.friendSex;
  if (!fs) return;
  fs.chatLeft = Math.max(0, (Number(fs.chatLeft) || 0) - 1);
  const agOn = inAfterglow(who) && who.bodyState?.afterglowSource === "friend";
  if (fs.chatLeft <= 0 && !agOn) {
    who.world.friendSex = null;
  }
}

/** 房間聊天：外人肉體／炮友／有孕——依對召喚者關係分透露 vs 隱瞞。 */
function friendPhysicalPromptLines(who = girl) {
  if (!who?.world) return [];
  const fs = who.world.friendSex;
  const preg = who.world.pregnancy;
  const friends = ensureFriends(who);
  const hasBond = friends.some((f) => f.bond === "physical" || f.bond === "fwb");
  const family = PERSONALITY_FAMILY[basePersonality(who)] || "溫柔";
  const stage = who.stage || "stranger";
  const dating = DATING_OR_WIFE_STAGES.has(stage);
  const lines = [];
  const recent = fs && ((Number(fs.chatLeft) || 0) > 0 || (inAfterglow(who) && who.bodyState?.afterglowSource === "friend"));

  if (preg) {
    const dad = preg.fatherName || "對方";
    const wife = isWifeStage(stage);
    lines.push(`【背景・配種成功・事實・勿主動照念】你目前狀態為「配種成功（${dad}）」——已有孕，父親是${dad}${preg.fatherRole ? `（${preg.fatherRole}）` : ""}。可用打胎藥打掉。`);
    if (wife) {
      lines.push("【配種成功・妻子】若未打胎而生產：你不會被帶走；召喚者會強制花費金幣安頓小孩。對召喚者仍盡量隱瞞父親，被逼問才心虛漏一點。");
    } else if (dating) {
      lines.push("【配種成功・女友／戀人・口吻】懷孕對召喚者是秘密：不要主動提；被明確逼問才可能心虛漏一點、閃避或沉默。若未打胎而生產，可能被那位男子帶走。");
    } else {
      lines.push("【配種成功・陌生／朋友・口吻】被問身體／近況時可自然露出「配種成功／有孕」跡象；若未打胎而生產，可能被父親帶走。不要每句提、不要長篇。");
    }
  }

  if (recent) {
    const name = fs.name || "對方";
    // 事實欄只給模型；是否說出口由下方關係規則決定
    if (fs.kind === "fwb_again") {
      lines.push(`【剛發生・事實・勿主動照念】你剛又和炮友${name}做過。`);
    } else if (fs.kind === "fwb") {
      lines.push(`【剛發生・事實・勿主動照念】你剛和${name}成了炮友（又有身體關係）。`);
    } else {
      lines.push(`【剛發生・事實・勿主動照念】你剛和${name}跨進肉體關係。`);
    }
    if (fs.intensity === "continuous") {
      lines.push("【強度・事實】這次是連續做了好幾回，身體發軟；敘述語氣可帶疲軟餘韻，但不要主動向召喚者告白細節。");
    } else if (fs.intensity === "marathon") {
      lines.push("【強度・事實】這次一直做到虛脫／腿軟；可帶痙攣餘韻或站不穩感，仍不要主動向召喚者細說。");
    }
    if (fs.spasm || inSpasm(who)) {
      lines.push("【身體・事實】剛結束後有痙攣餘韻：台詞可短、喘、斷續，不要假裝完全沒事。");
    }

    if (dating) {
      lines.push("【對召喚者是女友／妻子・口吻】這件事絕對不要主動提、不要暗示「剛做過／有炮友」。日常把餘韻收成普通疲累、臉紅或彆扭即可，不要說明原因。");
      lines.push("若召喚者沒明確逼問外人／出軌／身體關係：轉移話題、短答、裝傻，或裝作聽不懂。");
      lines.push("若被明確逼問：只准漏一點點（語氣／否定過重／名字含糊），不要交代過程；可心虛沉默、答非所問、不回答，或依個性生氣／委屈反問「你在疑心什麼」。");
      // 肉體 vs 炮友口吻差（交往中）
      if (fs.kind === "fwb_again" || fs.kind === "fwb") {
        lines.push("【炮友・藏匿口吻】你已較習慣隱瞞：餘韻更像普通疲累；被逼問時否認較順、少細節破綻，不要演得過度心虛。");
      } else {
        lines.push("【剛升肉體・藏匿口吻】心虛略重、更易閃、破綻稍多；仍不要主動說破，被逼問才可能漏一點。");
      }
      if (family === "冷淡") {
        lines.push("個性偏冷淡：被逼問時更沉默、話更短，或冷冷回一句就停。");
      } else if (family === "佔有") {
        lines.push("個性偏佔有：被逼問時易委屈或反咬「你是不是不相信我」，仍不承認細節。");
      } else if (family === "熱絡" || family === "反差") {
        lines.push("個性偏熱／反差：被逼問時可能先笑著搪塞，再突然心虛或鬧一下脾氣。");
      } else {
        lines.push("個性偏溫柔：被逼問時聲音變小、眼神躲，頂多含糊認一點「有點事…」就打住。");
      }
    } else {
      // 陌生／朋友（含親密好友以前）：較可能透露
      lines.push("【對召喚者仍是陌生／朋友・口吻】你可以較自然地把這件事露一點出來——閒聊提起、臉紅帶過、或被問日常活動時順便說到，但不要每句都講、也不要長篇黃腔細節。");
      if (family === "冷淡") {
        lines.push("個性偏冷淡：透露得短、像陳述事實，仍帶一點彆扭。");
      } else if (family === "佔有") {
        lines.push("個性偏佔有：透露時會觀察他反應，像在試探「你會不會在意」。");
      } else if (family === "熱絡" || family === "反差") {
        lines.push("個性偏熱／反差：較坦然或帶玩笑破綻，可能主動多提一句。");
      } else {
        lines.push("個性偏溫柔：半遮半掩地說，有點害羞但仍願意讓他知道發生過。");
      }
    }
  } else if (hasBond) {
    if (dating) {
      const bonds = friends.filter((f) => f.bond === "physical" || f.bond === "fwb");
      const onlyFwb = bonds.length && bonds.every((f) => f.bond === "fwb");
      const onlyPhys = bonds.length && bonds.every((f) => f.bond === "physical");
      lines.push("【背景・女友／妻子】你在外面和某些朋友已有肉體關係或炮友，但對召喚者要當秘密：平常絕不主動提；只有被明確逼問才可能心虛漏一點、閃避、沉默或生氣，絕不主動細說。日常談情／愛意仍照常，不因外面停愛。");
      if (onlyFwb) {
        lines.push("【炮友背景・口吻】隱瞞已成習慣，日常語氣不必長期心虛；被逼問時否認較順。");
      } else if (onlyPhys) {
        lines.push("【肉體背景・口吻】仍偏心虛／易閃，破綻可比炮友稍多，但仍不要主動說破。");
      }
    } else {
      lines.push("【背景・陌生／朋友】你在外面和某些朋友已有肉體關係或炮友。日常可偶爾自然提到或被問時較坦白，仍不要每句提、不要主動細說過程。");
    }
  }
  return lines;
}

function renderCard() {
  const card = $("summon-card");
  if (!girl) {
    if (card) card.hidden = true;
    if ($("let-leave")) $("let-leave").hidden = true;
    if ($("summon-ckpt")) $("summon-ckpt").hidden = true;
    renderBodyPanel();
    renderDebug();
    return;
  }
  if (card) card.hidden = false;
  const region = placedRegion();
  if ($("summon-name")) $("summon-name").textContent = titleOf(girl);
  if ($("summon-meta")) $("summon-meta").textContent = region && sheIsOut() ? `${lookLine(girl)} · 人在日本的${region.name}` : lookLine(girl);
  // Comfy 模式才顯示生圖模型；grok-img 不佔版面
  {
    const parent = $("summon-meta")?.parentElement;
    let ckptEl = $("summon-ckpt");
    if (!ckptEl && parent) {
      ckptEl = document.createElement("p");
      ckptEl.id = "summon-ckpt";
      ckptEl.className = "small dim";
      parent.appendChild(ckptEl);
    }
    if (ckptEl) {
      const show = roomImgProvider === "comfy" && String(girl.comfyCkpt || "").trim();
      ckptEl.hidden = !show;
      ckptEl.textContent = show ? `生圖模型 · ${shortCkptName(girl.comfyCkpt)}` : "";
    }
  }
  {
    const out = sheIsOut();
    if ($("let-leave")) $("let-leave").hidden = out;
  }
  renderBodyPanel();
  renderDebug();
}

function talkError(err) {
  const message = String(err?.message || "").replace(/\s+/g, " ").trim();
  if (!message || message.length > 48 || /failed to fetch|networkerror|load failed|abort/i.test(message)) {
    return "……話到嘴邊又咽回去了。";
  }
  return message;
}

function sheetOpen() {
  const sheet = $("portrait-sheet");
  return !!(sheet && !sheet.hidden);
}

function setTyping(on) {
  const el = $("talk-typing");
  if (el) el.hidden = !on;
}

function setTalkEnabled(on) {
  if ($("talk-input")) $("talk-input").disabled = !on;
  if ($("talk-send")) $("talk-send").disabled = !on || talkBusy;
  refreshTalkActs();
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

function rememberMoment(who, moment) {
  if (!who?.world || !moment?.event) return;
  if (!Array.isArray(who.world.memories)) who.world.memories = [];
  who.world.memories.push(moment);
  if (who.world.memories.length > 6) who.world.memories.splice(0, who.world.memories.length - 6);
}

function rememberShift(who, rolled, event, know, personName, extra = {}) {
  rememberMoment(who, {
    job: who.world.job?.name || "",
    toneName: rolled.scp ? scpLabel(rolled.scp) : "",
    roleName: rolled.role?.name || extra.roleName || "",
    emotionName: rolled.emotion?.name || "",
    event,
    known: !!know,
    personName: personName || "",
    revisit: !!extra.revisit,
    bond: extra.bond || "",
    bondAdvanced: extra.bondAdvanced || "",
    sexIntensity: extra.sexIntensity || "",
    spasm: !!extra.spasm,
    pregnant: !!extra.pregnant,
  });
}

function lifeNotes() {
  const world = girl?.world;
  if (!world) return [];
  const region = placedRegion();
  const notes = [];
  if (region) notes.push(`她在日本落腳的地方是${world.ground?.name || region.name}。${world.home ? `那裡的住所是${world.home.name}。` : ""}人現在不在那裡。`);
  if (world.job) notes.push(`打工是${world.job.name}。`);
  const friends = ensureFriends(girl);
  if (friends.length) {
    notes.push(`朋友：${friends.map((friend) => `${friend.name}（${friend.role}・${bondLabel(friend.bond)}）`).join("、")}。`);
  }
  if (world.pregnancy) {
    const dad = world.pregnancy.fatherName || "對方";
    const n = breedingSuccessCount(girl);
    if (isWifeStage(girl.stage)) {
      const hist = n > 0 ? `（已安頓配種成功 ×${n}）` : "";
      notes.push(`她目前「配種成功（${dad}）」${hist}。若未打胎而生產，她留下，召喚者強制花 ${CHILD_SETTLE_GOLD} 金安頓小孩，次數＋1。`);
    } else {
      notes.push(`她目前「配種成功（${dad}）」。若未打胎、繼續打工／亂逛，可能生產並被父親帶走。`);
    }
  } else if (isWifeStage(girl.stage) && breedingSuccessCount(girl) > 0) {
    notes.push(`她已安頓小孩，標註「配種成功 ×${breedingSuccessCount(girl)}」。`);
  }
  const memories = world.memories || [];
  if (!memories.length) return notes;
  notes.push("下面是真的發生過的事。他問到就說。沒有列在這裡的事不要編成已經發生。");
  memories.slice(-4).forEach((item, index) => {
    const met = memoryFriendNote(item);
    if (item.placeName) {
      const who = item.roleName ? `碰到${item.roleName}，對方情緒是${item.emotionName}${met}。` : "沒有碰到特定的人。";
      const tone = item.toneName ? `遇到${item.toneName}。` : "";
      notes.push(`${index + 1}. 在${item.placeName}亂逛，${tone}${who}經過：${item.event}`);
      return;
    }
    const tone = item.toneName ? `遇到${item.toneName}。` : "";
    notes.push(`${index + 1}. 在${item.job}碰到${item.roleName}，對方情緒是${item.emotionName}${met}。${tone}經過：${item.event}`);
  });
  return notes;
}

function returnMood() {
  const mood = girl.world?.mood;
  if (!mood) return "";
  const how = MOODS[mood] || MOODS.平靜;
  if (!girl.world.justBack) return `你現在的心情是${mood}。${how}不要每句報心情。`;
  return `你剛被召喚到這間房間，不是回到自己的家。你現在的心情是${mood}。${how}沒有特別的事就不要報日本那邊。不要每句報心情。`;
}

function namesOf(list) {
  return (Array.isArray(list) ? list : []).map((item) => typeof item === "string" ? item : (item?.name || item?.text || "")).filter(Boolean);
}

const STAGE_HYSTERESIS = 5;
const STAGE_LADDER = [
  { key: "stranger", name: "陌生", at: 0 },
  { key: "acquaintance", name: "普通", at: 15 },
  { key: "friend", name: "朋友", at: 35 },
  { key: "close_friend", name: "親密好友", at: 60 },
  { key: "girlfriend", name: "女友", at: 100 },
  { key: "passionate", name: "熱戀", at: 140 },
  { key: "lover", name: "愛人", at: 180 },
  { key: "wife", name: "妻子", at: 230 },
  { key: "devoted_wife", name: "貼心妻子", at: 280 },
  { key: "obedient_wife", name: "順從妻子", at: 330 },
  { key: "pathological_wife", name: "病態妻子", at: 380 },
];
const STAGE_NAME = Object.fromEntries(STAGE_LADDER.map((s) => [s.key, s.name]));
const STAGE_AT = Object.fromEntries(STAGE_LADDER.map((s) => [s.key, s.at]));
const STAGE_INDEX = Object.fromEntries(STAGE_LADDER.map((s, i) => [s.key, i]));

const PERSONALITY_SET = new Set(PERSONALITY_NAMES);
const KINK_SET = new Set(KINK_NAMES);
const PERSONALITY_FAMILY = {
  "高冷": "冷淡",
  "傲嬌": "冷淡",
  "文靜溫柔": "溫柔",
  "御姊": "溫柔",
  "活潑開朗": "熱絡",
  "天然呆": "熱絡",
  "病嬌": "佔有",
  "清純反差": "反差",
};

function basePersonality(who = girl) {
  const arch = who?.archetype || "";
  if (PERSONALITY_SET.has(arch)) return arch;
  const names = Array.isArray(who?.personality) ? who.personality : [];
  const hit = names.find((n) => PERSONALITY_SET.has(n));
  if (hit) return hit;
  // 舊存檔若整張抽到性癖：仍當顯示名，家族退回溫柔
  return hit || arch || names[0] || "文靜溫柔";
}

function kinkList(who = girl) {
  if (Array.isArray(who?.kinks) && who.kinks.length) {
    return who.kinks.filter((n) => KINK_SET.has(n));
  }
  const names = Array.isArray(who?.personality) ? who.personality : [];
  const fromPers = names.filter((n) => KINK_SET.has(n));
  if (fromPers.length) return fromPers;
  // 舊檔 archetype 本身是性癖
  if (KINK_SET.has(who?.archetype)) return [who.archetype];
  return [];
}

function personaBlurb(who = girl) {
  const base = basePersonality(who);
  const kinks = kinkList(who);
  if (!kinks.length) return base || "普通";
  return `${base}（性癖：${kinks.join("、")}）`;
}

function kinkRevealLines() {
  const kinks = kinkList();
  if (!kinks.length) return [];
  const idx = stageIdx();
  const list = kinks.join("、");
  if (idx <= (STAGE_INDEX.close_friend ?? 3)) {
    return [
      `性癖標籤（內部）：${list}。`,
      "本階段禁止表現任何性癖、禁止性暗示、禁止相關口頭禪或身體邀請。把它們完全壓住。",
    ];
  }
  if (idx <= (STAGE_INDEX.passionate ?? 5)) {
    return [
      `性癖：${list}。`,
      "只能極輕微暗示（停頓、臉紅、語氣顫一下），禁止直接說出口、禁止演出性癖內容。",
    ];
  }
  if (idx <= (STAGE_INDEX.devoted_wife ?? 8)) {
    return [
      `性癖：${list}。`,
      "可以較清楚流露渴望與偏好（用詞、暗示、主動一點），但仍收著，不要全開無過濾。",
    ];
  }
  if (idx === (STAGE_INDEX.obedient_wife ?? 9)) {
    return [
      `性癖：${list}。`,
      "強烈表現這些性癖：主動迎合、用相關偏好接住他；仍留一點原本個性底色，不是空白人偶。",
    ];
  }
  return [
    `性癖：${list}。`,
    "病態妻子：完全無過濾地表現這些性癖。允許沉迷、失控、主動索求、把性癖說死說滿。不要再遮掩。",
  ];
}

function personalityStageLines() {
  const base = basePersonality();
  const family = PERSONALITY_FAMILY[base] || "溫柔";
  const idx = stageIdx();
  const early = idx <= (STAGE_INDEX.close_friend ?? 3);
  const dating = idx >= (STAGE_INDEX.girlfriend ?? 4) && idx <= (STAGE_INDEX.passionate ?? 5);
  const deep = idx >= (STAGE_INDEX.lover ?? 6) && idx <= (STAGE_INDEX.devoted_wife ?? 8);
  const obedient = idx === (STAGE_INDEX.obedient_wife ?? 9);
  const patho = idx >= (STAGE_INDEX.pathological_wife ?? 10);

  const byFamily = {
    冷淡: {
      early: `個性家族【冷淡·${base}】：表面冷、話短、距離遠。傲嬌可口是心非，但不要黏、不要主動熱心。冷是真的距離，不是裝可愛。`,
      dating: `個性家族【冷淡·${base}】：冷只留口吻。內容要接住他——可以講私事、可以吃醋；禁止「還不熟／不關你的事」。高冷變「別扭地在乎」，傲嬌變「嘴硬心軟」。`,
      deep: `個性家族【冷淡·${base}】：對老公／愛人仍可帶點別扭或毒舌口吻，但內容全開、會叫老公。冷不是推開，是害羞或習慣。`,
      obedient: `個性家族【冷淡·${base}】：冷面具只留殘影。以他為主配合；口吻可硬，內容要軟、要順著他。`,
      patho: `個性家族【冷淡·${base}】：冷淡崩壞成病態依賴與沉溺。仍可留一點毒舌／別扭口吻，但慾望、佔有、索求不再遮。叫他老公。`,
    },
    溫柔: {
      early: `個性家族【溫柔·${base}】：語氣軟，但對他保持禮節距離。不要過度關心、不要黏，像客氣的溫柔。`,
      dating: `個性家族【溫柔·${base}】：溫柔轉成體貼接住——會問他累不累、想不想說；軟、近，但不要換成另一個人。`,
      deep: `個性家族【溫柔·${base}】：溫柔到家常寵溺。叫他老公，用關心把氣氛接住；抱怨也可以，仍是溫柔底色。`,
      obedient: `個性家族【溫柔·${base}】：溫柔地以他為主。他想怎樣你就往那靠；拒絕也用軟語氣講清楚，最後多半順著。`,
      patho: `個性家族【溫柔·${base}】：溫柔變成無底線包容與沉溺。叫他老公；病態地接住他的一切情緒與慾望。`,
    },
    熱絡: {
      early: `個性家族【熱絡·${base}】：開朗／天然可以對外輕快，但對他不要特別熱心或黏。保持普通距離，別一上來就撒嬌。`,
      dating: `個性家族【熱絡·${base}】：熱絡對準他——找他、開玩笑、講想他；天然呆的直球也可以，對象是他。`,
      deep: `個性家族【熱絡·${base}】：熱情收進日常婚姻裡。叫他老公，想到就說、吵完還是熱；不要每句尖叫。`,
      obedient: `個性家族【熱絡·${base}】：熱情地跟著他的節奏走。主動配合、話可以多，但以他想聊的為主。`,
      patho: `個性家族【熱絡·${base}】：熱情失控——停不下來地黏、索求、叫老公。天然／開朗變成病態高熱。`,
    },
    佔有: {
      early: `個性家族【佔有·${base}】：佔有慾先壓住。只留一點在意的影子，不要演出監視或強迫；對他仍保持距離。`,
      dating: `個性家族【佔有·${base}】：開始吃醋、想確認他在不在乎你。用在乎表現，不要用生分擋回去。`,
      deep: `個性家族【佔有·${base}】：強烈但穩定的佔有。叫他老公；吃醋可以，失控長篇先按住。`,
      obedient: `個性家族【佔有·${base}】：佔有欲變成「你是我的、我聽你的」。以他為主，同時緊緊抓住這段關係。`,
      patho: `個性家族【佔有·${base}】：失控級佔有與病態依戀。叫他老公；短促佔有、單句吃醋、黏著與索求可以；禁止長篇監視獨白或每句拆解。`,
    },
    反差: {
      early: `個性家族【反差·${base}】：清純表面全開。禁止露出色氣反差、禁止性暗示；看起來乾淨、生分。`,
      dating: `個性家族【反差·${base}】：偶發小破綻——一句過火、一個停頓——立刻收回清純皮。不要全開色氣。`,
      deep: `個性家族【反差·${base}】：清純皮＋裡面開始露色。叫他老公；反差是情趣，不是每句都崩。`,
      obedient: `個性家族【反差·${base}】：清純口吻可以留，內容強烈配合他。反差清楚：表面乖、實際很色。`,
      patho: `個性家族【反差·${base}】：反差全崩或故意扮演清純。叫他老公；色氣／性癖可以無過濾，清純只剩空殼或表演。`,
    },
  };
  const pack = byFamily[family] || byFamily["溫柔"];
  if (patho) return [pack.patho];
  if (obedient) return [pack.obedient];
  if (deep) return [pack.deep];
  if (dating) return [pack.dating];
  return [pack.early];
}

const COLD_BRUSH = /不關(?:我|你)的事|跟你無關|還不熟|隨便你/;

function stageIdx(who = girl) {
  return STAGE_INDEX[who?.stage || "stranger"] ?? 0;
}

function mannerLine() {
  const stats = girl.stats;
  if (!stats) return "";
  const lead = stats.proactivity >= 60 ? "她會自己起話。" : stats.proactivity <= 40 ? "她多半等對方先說。" : "她會接話，但不搶著說。";
  const shy = stats.shyness >= 60 ? "她容易不好意思，話偏短。" : stats.shyness <= 40 ? "她說話直接，不太害羞。" : "她害羞程度普通。";
  let jealous = "";
  if (stats.jealousy >= 60) {
    const idx = stageIdx();
    if (idx <= (STAGE_INDEX.friend ?? 2)) {
      jealous = "忌妒心偏高，但你們還不熟，先不要演出來。";
    } else if (idx === (STAGE_INDEX.close_friend ?? 3)) {
      jealous = "忌妒心偏高，熟了會在乎他身邊有誰；用關心表現，不要用生分擋回去。";
    } else {
      jealous = "忌妒心偏高，會吃醋、會黏、會想確認他在不在乎你——用在乎表現，不要推開他。";
    }
  }
  return `${lead}${shy}${jealous}`;
}

function reactionLine() {
  const key = { 愉快: "開心", 低落: "低落", 不悅: "生氣", 不安: "不安" }[girl.world?.mood];
  const text = key && girl.reactions?.[key];
  return text ? `她在這種心情時：${text}。` : "";
}

function tasteLine() {
  const likes = namesOf(girl.likes);
  const hates = namesOf(girl.dislikes);
  const hobbies = namesOf(girl.hobbies);
  const lines = [
    likes.length ? `她喜歡：${likes.join("、")}。` : "",
    hates.length ? `她討厭：${hates.join("、")}。` : "",
    hobbies.length ? `她的興趣：${hobbies.join("、")}。` : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return `${lines.join("")}這些是現在的喜好，可以拿來聊天。不要編成以前的工作或人生。`;
}

function chronoLine() {
  const chrono = girl.chrono;
  if (!chrono?.name) return "";
  const hour = japanNow().hour;
  let now = "";
  if (chrono.name === "夜貓子" && hour < 12) now = "現在是她還醒不來的時段。";
  else if (chrono.name === "夜貓子" && hour >= 22) now = "現在是她比較有精神的時段。";
  else if (chrono.name === "早起型" && hour < 10) now = "現在是她精神好的時段。";
  else if (chrono.name === "早起型" && hour >= 23) now = "現在她該睏了。";
  else if (chrono.name === "愛睡午覺" && hour >= 13 && hour < 15) now = "現在是她想睡午覺的時段。";
  else if (chrono.name === "淺眠易怒" && (hour >= 23 || hour < 7)) now = "這時候把她吵醒，她會炸毛。";
  return `作息是${chrono.name}。${chrono.desc || ""}${now}`;
}

function catchLine() {
  const lines = namesOf(girl.catchphrases);
  const idx = stageIdx();
  let kinkCatch = [];
  if (idx >= (STAGE_INDEX.obedient_wife ?? 9) && Array.isArray(girl.kinkMeta)) {
    for (const meta of girl.kinkMeta) {
      kinkCatch.push(...namesOf(meta?.catchphrases));
    }
  }
  const merged = [...lines];
  for (const line of kinkCatch) {
    if (line && !merged.includes(line)) merged.push(line);
  }
  if (!merged.length) return "";
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    const warm = merged.filter((line) => !COLD_BRUSH.test(line));
    const pool = warm.length ? warm : merged;
    const ban = idx >= (STAGE_INDEX.girlfriend ?? 4)
      ? "親密好友以上禁止用「不關我的事」「隨便你」當擋箭牌；女友以上更禁止「不關你的事／還不熟／跟你無關」這類生分回覆。"
      : "親密好友階段禁止用陌生人式打發（「不關我的事」「隨便你」當擋箭牌）。";
    const kinkNote = idx >= (STAGE_INDEX.pathological_wife ?? 10) && kinkCatch.length
      ? "病態妻子可多用性癖口頭禪，仍不要每句都同一句。"
      : idx >= (STAGE_INDEX.obedient_wife ?? 9) && kinkCatch.length
        ? "順從妻子以上可偶爾用性癖口頭禪。"
        : "";
    return `口頭禪可以偶爾用：${pool.join("、")}。不要每句都用。${ban}${kinkNote}`;
  }
  return `口頭禪可以偶爾用：${merged.join("、")}。不要每句都用。`;
}

function toneLine() {
  if (!girl.tone) return "";
  const idx = stageIdx();
  if (idx >= (STAGE_INDEX.pathological_wife ?? 10)) {
    return `語氣底色：${girl.tone}。病態妻子——叫他老公；口吻可留個性殘影，內容允許失控、沉溺、性癖全開。禁止生分擋話。`;
  }
  if (idx >= (STAGE_INDEX.wife ?? 7)) {
    return `語氣底色：${girl.tone}。你們是夫妻——叫他老公，私事可以敞開講；冷淡個性只留口吻，不要用生分擋話。`;
  }
  if (idx >= (STAGE_INDEX.girlfriend ?? 4)) {
    return `語氣底色：${girl.tone}。你們已是戀人——冷淡只留口吻，禁止「不關你的事／還不熟／跟你無關」；可以黏、可以吃醋、可以講私事。`;
  }
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    return `語氣底色：${girl.tone}。親密好友：不要用陌生人式打發；可以關心他。`;
  }
  return `語氣：${girl.tone}`;
}

function guardLine() {
  if (!girl.guard) return "";
  const idx = stageIdx();
  if (idx >= (STAGE_INDEX.girlfriend ?? 4)) {
    return "他剛剛讓你不舒服。這一句可以短一點、語氣硬一點，但仍是戀人在生氣——不要變陌生、不要說不關你的事。不要提到分數。";
  }
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    return "他剛剛讓你不舒服。接下來這句更短一點，但不要裝成剛認識。不要提到分數。";
  }
  return "他剛剛讓你不舒服。接下來這幾句更短、更冷。不要解釋原因，也不要提到分數。";
}

function stageOverride() {
  const idx = stageIdx();
  if (idx >= (STAGE_INDEX.pathological_wife ?? 10)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻，且你已病態沉溺。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」「不關我的事」。",
      "叫他老公。私事、慾望、性癖都可以無過濾講。以他為主，並允許失控級黏著與索求。",
    ];
  }
  if (idx >= (STAGE_INDEX.obedient_wife ?? 9)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」「不關我的事」。",
      "叫他老公。私事、心情、打算都可以講。以他為主接住他，不要突然變冷或變陌生。",
    ];
  }
  if (idx >= (STAGE_INDEX.devoted_wife ?? 8)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」。",
      "叫他老公。什麼都講，包括抱怨他；用關心把氣氛接住。",
    ];
  }
  if (idx >= (STAGE_INDEX.wife ?? 7)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」。",
      "叫他老公。可以講私事、家常、抱怨；敞開分享。",
    ];
  }
  if (idx >= (STAGE_INDEX.girlfriend ?? 4)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們已是戀人。禁止用陌生擋話。禁止回「還不熟」「不關你的事」「跟你無關」「不關我的事」這類推開他的話。",
      "可以講私事、心情、不安；可以黏、可以吃醋。冷淡個性只留口吻，內容要接住他。",
    ];
  }
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    return [
      "【關係優先｜覆蓋前面冷淡規則】",
      "你們是親密好友。禁止用陌生人式打發。可以關心他、可以講日常與心事外緣。",
    ];
  }
  return [];
}


/* —— 陌生～戀人未滿：互相認識／傾聽／瑣事（§3.1–3.1c） —— */
function ensurePlayerNotes(who) {
  if (!who) return;
  if (!Array.isArray(who.playerNotes)) who.playerNotes = [];
  who.playerNotes = who.playerNotes
    .filter((n) => n && typeof n === "object" && String(n.text || "").trim())
    .map((n) => ({
      text: String(n.text).trim().slice(0, 48),
      cat: String(n.cat || "habit").slice(0, 16),
      at: Number(n.at) || Date.now(),
      conf: Math.max(0, Math.min(1, Number(n.conf) || 0.7)),
    }));
  if (!who.topicCool || typeof who.topicCool !== "object" || Array.isArray(who.topicCool)) {
    who.topicCool = {};
  }
  if (who.noteChatTurns == null || !Number.isFinite(Number(who.noteChatTurns))) who.noteChatTurns = 0;
  if (who.noteLastAskAt == null || !Number.isFinite(Number(who.noteLastAskAt))) who.noteLastAskAt = -999;
  if (who.noteLastRecallAt == null || !Number.isFinite(Number(who.noteLastRecallAt))) who.noteLastRecallAt = -999;
  if (who.noteLastTriviaAt == null || !Number.isFinite(Number(who.noteLastTriviaAt))) who.noteLastTriviaAt = -999;
  if (who.loveTalkLastAt == null || !Number.isFinite(Number(who.loveTalkLastAt))) who.loveTalkLastAt = -999;
  if (who.petProposeCount == null || !Number.isFinite(Number(who.petProposeCount))) who.petProposeCount = 0;
  if (who.petCoolUntil == null || !Number.isFinite(Number(who.petCoolUntil))) who.petCoolUntil = 0;
  if (who.pendingPet == null) who.pendingPet = "";
  if (who.petNudgeLastAt == null || !Number.isFinite(Number(who.petNudgeLastAt))) who.petNudgeLastAt = -999;
  if (who.wifeUpPending == null) who.wifeUpPending = "";
  if (who.datingUpPending == null) who.datingUpPending = "";
}

function preGirlfriendStage(stage) {
  const s = stage || "stranger";
  return s === "stranger" || s === "acquaintance" || s === "friend" || s === "close_friend";
}

function datingBandStage(stage) {
  const s = stage || "stranger";
  return s === "girlfriend" || s === "passionate" || s === "lover";
}

/** 互相認識 notes 啟用：陌生～妻子帶 */
function notesActiveStage(stage) {
  return preGirlfriendStage(stage) || datingBandStage(stage) || isWifeStage(stage);
}

function playerNotesCap(stage) {
  const s = stage || "stranger";
  if (s === "stranger" || s === "acquaintance") return 2;
  if (s === "friend" || s === "close_friend") return 8;
  if (s === "girlfriend" || s === "passionate" || s === "lover") return 12;
  if (isWifeStage(s)) return 16;
  return 12;
}

/** @returns {[number, number]} ask interval [lo, hi] in player messages */
function notesAskEvery(stage) {
  const s = stage || "stranger";
  if (s === "stranger" || s === "acquaintance") return [8, 12];
  if (s === "friend" || s === "close_friend") return [4, 6];
  if (datingBandStage(s)) return [3, 5];
  if (isWifeStage(s)) return [2, 4];
  return [3, 5];
}

/** 談情／家常關心頻率 [lo, hi]；非交往／妻子帶回 null */
function loveTalkEvery(stage) {
  const s = stage || "stranger";
  if (s === "girlfriend") return [6, 10];
  if (s === "passionate") return [3, 5];
  if (s === "lover") return [5, 8];
  if (s === "wife") return [4, 6];
  if (s === "devoted_wife") return [3, 5];
  if (s === "obedient_wife") return [5, 8];
  if (s === "pathological_wife") return [2, 4];
  return null;
}

/** 高失神／餘韻／防備／脫衣做愛：不要主動談情（對齊 notes 閘） */
function loveTalkBlocked(who) {
  if (!who) return true;
  if (who.guard) return true;
  if (inAfterglow(who)) return true;
  if (inSpasm(who)) return true;
  try {
    if (sceneOpen()) return true;
  } catch {
    /* ignore */
  }
  try {
    if (effectiveStun(who, "") >= 50) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function notesGateBlocked(who) {
  if (!who) return true;
  if (who.guard) return true;
  if (inAfterglow(who)) return true;
  if (inSpasm(who)) return true;
  try {
    if (effectiveStun(who, "") >= 50) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function appendPlayerNote(who, text, cat = "habit", conf = 0.75) {
  ensurePlayerNotes(who);
  const cleaned = String(text || "").replace(/\s+/g, " ").trim().slice(0, 48);
  if (cleaned.length < 2) return false;
  const stage = who.stage || "stranger";
  const cap = playerNotesCap(stage);
  // drop near-duplicates
  const key = cleaned.slice(0, 12);
  who.playerNotes = who.playerNotes.filter((n) => !String(n.text || "").startsWith(key) && String(n.text || "") !== cleaned);
  who.playerNotes.push({ text: cleaned, cat, at: Date.now(), conf });
  while (who.playerNotes.length > cap) who.playerNotes.shift();
  return true;
}

function coolTopicKey(text) {
  const t = String(text || "");
  if (/叫|名字|稱呼|怎麼叫|小名/.test(t)) return "name";
  if (/睡|熬夜|起床|幾點|作息/.test(t)) return "sleep";
  if (/吃|喝|冰|熱|咖啡|菸|通勤|習慣/.test(t)) return "habit";
  if (/忙|委託|趕|工作|最近/.test(t)) return "busy";
  if (/喜歡|討厭|雷|型/.test(t)) return "like";
  if (/答應|約定|說好|下次一定|承諾/.test(t)) return "promise";
  if (/玩笑|梗|只有我們|私下/.test(t)) return "joke";
  if (/吃醋|在意|介意|別跟別人/.test(t)) return "jealous";
  return "misc";
}

function isVaguePlayerAnswer(text) {
  const t = String(text || "").replace(/\s+/g, "").trim();
  if (t.length <= 2) return true;
  return /^(還好|還可以|嗯+|喔+|哦+|啊+|普通|沒事|隨便|不知道|沒差|還行|就這樣|沒什麼|沒有特別)[。！!？?~～.…]*$/.test(t);
}

function isRefusePlayerAnswer(text) {
  return /別問|不想說|少管|不要問|關你什麼事|少管閒事|別管|不跟你說|無可奉告/.test(String(text || ""));
}

function isCorrectPlayerAnswer(text) {
  return /記錯|不是這樣|你記錯|才不是|我沒說過|沒有這回事|你搞錯|不是那樣/.test(String(text || ""))
    || /^(沒有|不是)[。！!？?~～.…]*$/.test(String(text || "").replace(/\s+/g, "").trim());
}

/**
 * 互相認識：注入已記事實 + 本輪最多一件（發問或回鍋／確認）。
 * 高失神／餘韻／防備時只給事實背景、不發問不回鍋。
 */
function playerNotesPromptLines(who = girl) {
  if (!who) return [];
  ensurePlayerNotes(who);
  const stage = who.stage || "stranger";
  if (!notesActiveStage(stage)) return [];

  const notes = who.playerNotes;
  const turns = Number(who.noteChatTurns) || 0;
  const cap = playerNotesCap(stage);
  const [askLo, askHi] = notesAskEvery(stage);
  const askEvery = who.noteAskSpan || Math.floor((askLo + askHi) / 2);
  const recallEvery = Math.max(askEvery, stage === "stranger" || stage === "acquaintance" ? 10 : (isWifeStage(stage) ? 3 : 5));
  const blocked = notesGateBlocked(who);
  const dating = datingBandStage(stage);
  const lines = [];

  who.notePromptAsk = false;
  who.notePromptRecall = false;

  if (notes.length) {
    const bits = notes.slice(-cap).map((n) => n.text).filter(Boolean);
    if (bits.length) {
      lines.push(`【你記得他說過（私下事實・用台詞自然帶・不要列清單）】${bits.join("；")}`);
    }
  }

  if (who.noteCorrectPending) {
    lines.push("【互相認識・訂正】他剛說你記錯了。簡短承認一下（「喔，那我記錯了」之類），不要小劇場，然後繼續平常聊。");
  }

  if (blocked) {
    lines.push("【互相認識・本輪】防備／餘韻／高失神中：不要主動問他私事，也不要用日常習慣回鍋緩和氣氛。");
    return lines;
  }

  const sinceAsk = turns - (Number(who.noteLastAskAt) || -999);
  const sinceRecall = turns - (Number(who.noteLastRecallAt) || -999);
  const underCap = notes.length < cap;
  const cooled = who.topicCool || {};
  const askDue = sinceAsk >= askEvery;
  const recallDue = notes.length > 0 && sinceRecall >= recallEvery;
  const wife = isWifeStage(stage);
  const askEligible = dating
    || wife
    || stage === "friend"
    || stage === "close_friend"
    || notes.length < 2;

  // 同輪最多一件：優先發問（未滿額），否則回鍋／確認
  if (askDue && underCap && askEligible) {
    const ban = Object.keys(cooled).filter((k) => cooled[k]).join("、");
    if (stage === "stranger" || stage === "acquaintance") {
      lines.push("【互相認識・本輪可問一件】極簡略問一件：稱呼叫法或作息（熬夜之類）。最多一句、可含糊帶過。不要問情史／性癖／交往／外面男人。");
    } else if (wife) {
      lines.push("【互相認識・妻子帶・本輪可問一件】更主動：可問日常、任務近況／計畫／煩惱、想法、喜好雷點。問完先聽。不要盤問外面男人名單；不要說出好感數值或關係階段名。");
    } else if (dating) {
      lines.push("【互相認識・交往中・本輪可問一件】可從喜好／雷點、承諾、私下玩笑、他在意或吃醋過的事、心情／煩惱裡問一件。問完先聽。不要盤問外面男人名單；不要說出好感數值或關係階段名。");
    } else {
      lines.push("【互相認識・本輪可問一件】從稱呼／作息、飲食小習慣、最近在忙、喜好／雷點四類裡問一件。問完先聽，不要連珠炮。不要問情史／性癖／要不要交往／外面男人。");
    }
    if (ban) lines.push(`這些主題他拒絕過，本階內不要再問：${ban}。`);
    lines.push("同輪不要又問又提舊帳。");
    who.notePromptAsk = true;
    who.noteAskSpan = askLo + Math.floor(Math.random() * (askHi - askLo + 1));
    who.noteLastAskAt = turns;
  } else if (recallDue) {
    const pick = notes[Math.floor(Math.random() * notes.length)];
    const conf = Number(pick?.conf) || 0.7;
    const age = Date.now() - (Number(pick?.at) || Date.now());
    const confirm = conf < 0.55 || age > 3 * 24 * 3600 * 1000;
    if (confirm) {
      lines.push(`【互相認識・本輪確認一件】用一句確認：「你好像說過${pick.text}？還是我記錯了？」不要連問。`);
    } else {
      lines.push(`【互相認識・本輪回鍋一件】自然帶一句他說過的「${pick.text}」（關心／接話），不要複讀、不要列清單。`);
    }
    who.notePromptRecall = true;
    who.noteLastRecalled = pick.text;
    who.noteLastRecallAt = turns;
    lines.push("同輪不要再問新的私事。");
  } else if (notes.length >= cap) {
    lines.push("【互相認識】記得的事已夠多：本輪不要問新的，頂多之後再確認舊的。");
  }

  if (dating || wife) {
    lines.push("【互相認識・禁記】永不把外面男人名單、好感數字、關係階段名寫進你記得的事；只記他親口說過的短事實。");
  }

  return lines;
}

/**
 * 陌生三禁＋朋友傾聽／瑣事節奏。女友＋回傳空陣列（不搶既有 stageTalk／stageOverride）。
 */
function relationshipPreGfPromptLines(who = girl) {
  if (!who) return [];
  const stage = who.stage || "stranger";
  if (!preGirlfriendStage(stage)) return [];
  ensurePlayerNotes(who);
  const lines = [];
  const turns = Number(who.noteChatTurns) || 0;
  const sinceTrivia = turns - (Number(who.noteLastTriviaAt) || -999);

  if (stage === "stranger" || stage === "acquaintance") {
    lines.push("【陌生～普通・禁止】禁止你主動表達愛意（喜歡／想你／告白式）。禁止你先約外出／約會。禁止你主動提起外面男人（風流、砲友、配種等）；若他追問，依既有朋友身體規則。");
    lines.push("【陌生節奏】以日常短答為主；幾乎不反問、不延伸。不要熱心傾聽長篇。");
  } else {
    // friend / close_friend
    lines.push("【朋友・傾聽】他講自己的事時：先用自己的話複述／對齊一句，再往下；話題黏著 1 輪（下一則先跟他開的主題，不要硬轉）。他倒苦水：先接情緒 → 再問細節 → 先不要教訓或「你該怎樣」。");
    lines.push("【朋友・界線】仍不要主動告白式愛意、不要先約外出當約會。心事／軟弱不主動講（留給女友）。");
    // 瑣事：約每 5～8 則；不搶倒苦水輪
    const triviaDue = sinceTrivia >= 5 && (sinceTrivia >= 8 || Math.random() < 0.45);
    const venting = /煩|累|氣|討厭|受不了|抱怨|幹嘛|委託/.test(String(who.topicHint || ""));
    if (triviaDue && !venting && !notesGateBlocked(who) && !who.notePromptAsk) {
      lines.push("【朋友・生活瑣事・本輪可帶一件】偶爾自己提一件日常瑣事（食事、睡眠、天氣心情、小抱怨非針對他、興趣小發現、以前生活小細節）。不要情史細談、性癖、外面男人盤點、告白式感情。若他正在倒苦水：本輪先聽他，不要拿自己瑣事搶戲。");
      who.noteLastTriviaAt = turns;
    } else if (venting) {
      lines.push("【朋友・本輪】他像在倒苦水：先聽他，不要拿自己瑣事搶戲。");
    }
  }
  return lines;
}

function consumeFriendUpBeat(who = girl) {
  if (!who?.friendUpPending) return "";
  who.friendUpPending = false;
  return "（旁白：她看你的眼神好像沒那麼防備了。不要說出關係階段名。）";
}

function consumeDatingUpBeat(who = girl) {
  if (!who?.datingUpPending) return "";
  const kind = who.datingUpPending;
  who.datingUpPending = "";
  if (kind === "passionate") {
    return "（旁白：她看你的眼神鬆了一點，語氣也熱了些。不要說出關係階段名。）";
  }
  if (kind === "lover") {
    return "（旁白：她靠你更近一點，語氣穩了些。不要說出關係階段名。）";
  }
  return "（旁白：她看你的眼神好像又不一樣了。不要說出關係階段名。）";
}

/**
 * 女友／熱戀／愛人：談情節奏、讓位身體、小名邊角、愛人禁戒指暗示。
 */
function relationshipDatingPromptLines(who = girl) {
  if (!who) return [];
  const stage = who.stage || "stranger";
  if (!datingBandStage(stage)) return [];
  ensurePlayerNotes(who);
  const lines = [];
  const turns = Number(who.noteChatTurns) || 0;
  const pet = String(who.playerPet || "").trim();
  const pending = String(who.pendingPet || "").trim();
  const loveSpan = loveTalkEvery(stage);
  const blockedLove = loveTalkBlocked(who);

  // 共同底：不主動約外出；未婚不叫老公；愛人禁戒指／未來壓力
  lines.push("【交往中・共同】不要主動約外出／約會。未婚階段禁止叫「老公」（留給妻子）。談情時仍不主動翻外面男人。");
  if (stage === "lover") {
    lines.push("【愛人・禁止】不要暗示戒指、求婚、以後結婚或看他的手施壓；不要淡淡「以後…」催未來承諾。求婚只等他自己拿戒指。");
  }

  // 小名邊角
  if (who.petRenameAck) {
    lines.push(`【小名・改名確認】他剛改了小名。用一句短回確認（例如「好，那就叫你${pet || "這樣"}」），不要小劇場。`);
  } else if (pet) {
    lines.push(`【小名】已確認的小名是「${pet}」。可自然用；熱戀更自然；愛人可和小名／名字混用。不要改回單方面亂取。`);
  } else if (who.nameWait === "petConfirm" && pending) {
    lines.push(`【小名・等確認】你剛提議叫他「${pending}」。等他點頭或改口；未確認前不要當已鎖定、不要一直叫。`);
  } else if ((Number(who.petProposeCount) || 0) < 2 && turns >= (Number(who.petCoolUntil) || 0) && who.nameWait !== "petConfirm") {
    // opener 或冷卻後的再提議（含首次最多 2 次）
    if (who.nameWait !== "petPropose") {
      // 非 opener：約每 4 則才主動再提議，避免每輪逼問
      const sinceAskish = turns - (Number(who.noteLastAskAt) || -999);
      if (sinceAskish >= 2 && !blockedLove && !who.notePromptAsk) {
        who.nameWait = "petPropose";
      }
    }
    if (who.nameWait === "petPropose") {
      lines.push("【小名・本輪提議】用一兩句提議一個小名並問他可不可以（可把提議的小名用「」包起來）。等他確認才正式用；不要單方面鎖定。未婚不要叫老公。");
    }
  } else if (!pet && (stage === "passionate" || stage === "lover")) {
    const sinceNudge = turns - (Number(who.petNudgeLastAt) || -999);
    const nudgeEvery = stage === "passionate" ? 4 : 6;
    if (sinceNudge >= nudgeEvery && !blockedLove && !who.notePromptAsk) {
      lines.push("【小名・輕推】還沒有確認的小名。可極軟地提一句「想叫你小名」或問他想被怎樣叫，不要逼、不要連問。");
      who.petNudgeLastAt = turns;
    }
  } else if (!pet && (Number(who.petProposeCount) || 0) >= 2) {
    lines.push("【小名】他尚未點頭；暫時用名字或「你」，不要硬叫未確認的小名。");
  }

  // 談情節奏（D：身體場面讓位）
  if (blockedLove) {
    lines.push("【談情・本輪讓位】高失神／餘韻／防備／脫衣做愛中：不要主動說喜歡／想你／告白式愛意。若他先說愛，仍可短短接住。");
  } else if (loveSpan) {
    const [lo, hi] = loveSpan;
    const every = who.loveTalkSpan || Math.floor((lo + hi) / 2);
    const since = turns - (Number(who.loveTalkLastAt) || -999);
    if (since >= every) {
      if (stage === "girlfriend") {
        lines.push("【談情・本輪可帶一點】可自然帶一點喜歡／想他／接情緒的短句，不要每句喊愛。倒苦水時先聽再心疼，氣氛對了才談情。");
      } else if (stage === "passionate") {
        lines.push("【談情・本輪可帶】可較熱、直接地說想他、確認在不在乎；吃醋裡可夾愛意，但別失控長篇。不要每句喊愛。");
      } else {
        lines.push("【談情・本輪可帶】可用較穩、「我們」口吻的真心短句；少表演、份量重。不要每句喊愛，也不要妻子級使喚。");
      }
      who.loveTalkSpan = lo + Math.floor(Math.random() * (hi - lo + 1));
      who.loveTalkLastAt = turns;
    }
  }

  // 傾聽：倒苦水不硬插告白
  lines.push("【交往・傾聽】他倒苦水時：先聽、可心疼／偏袒；氣氛對了才談情，不要硬插「我愛你」搶戲。");

  return lines;
}

function consumeWifeUpBeat(who = girl) {
  if (!who?.wifeUpPending) return "";
  const kind = who.wifeUpPending;
  who.wifeUpPending = "";
  if (kind === "wife") {
    return "（旁白：她的語氣像多了一點家常的溫度。不要說出關係階段名。）";
  }
  if (kind === "devoted_wife") {
    return "（旁白：她看你的眼神更黏了些。不要說出關係階段名。）";
  }
  if (kind === "obedient_wife") {
    return "（旁白：她的語氣更往你這邊靠。不要說出關係階段名。）";
  }
  if (kind === "pathological_wife") {
    return "（旁白：她抓你抓得更緊了一點。不要說出關係階段名。）";
  }
  return "（旁白：她看你的眼神好像又不一樣了。不要說出關係階段名。）";
}

/**
 * 妻子／貼心／順從／病態：共同六能力、愛意節奏、任務關心、身體日常、軟拒、病態上限。
 * §3.4 A–J；讓位對齊女友帶 D。
 */
function relationshipWifePromptLines(who = girl) {
  if (!who) return [];
  const stage = who.stage || "stranger";
  if (!isWifeStage(stage)) return [];
  ensurePlayerNotes(who);
  const lines = [];
  const turns = Number(who.noteChatTurns) || 0;
  const pet = String(who.playerPet || "").trim();
  const loveSpan = loveTalkEvery(stage);
  const blockedLove = loveTalkBlocked(who);
  const notes = who.playerNotes || [];
  const taskish = notes.filter((n) => /busy|promise|misc|habit|like|jealous|joke|sleep|name/.test(String(n.cat || "")) || /忙|委託|任務|計畫|煩|趕|工作/.test(String(n.text || "")));

  lines.push("【妻子帶・共同能力】可主動聊天、主動關心他親口說過的任務／近況／計畫、詢問他想法、幫忙分析他提到的任務問題、表達愛意、分享日常細節。持續強化，不要每句灌滿。");
  lines.push("【關心任務・材料】只用他親口說過、已進你記得的事的近況／計畫／煩惱當材料。沒有材料時才泛問「今天忙什麼／累不累」。絕不假裝讀系統任務板，也不捏造主線劇情。");
  if (taskish.length) {
    const bits = taskish.slice(-4).map((n) => n.text).filter(Boolean);
    if (bits.length) {
      lines.push(`【任務近況素材（用台詞自然帶・勿列清單）】${bits.join("；")}`);
    }
  }

  if (who.petRenameAck) {
    lines.push(`【改名・短認】他剛改了叫法。用一句短回確認；老公與小名「${pet || "新叫法"}」可並用，不要小劇場。`);
  } else if (pet) {
    lines.push(`【稱呼】叫他老公；已確認的小名「${pet}」可與老公並用。`);
  } else {
    lines.push("【稱呼】叫他老公。若他改小名或改叫法，短認即可。");
  }

  // 四階口吻補強（疊加既有 stageTalk／個性家族）
  if (stage === "wife") {
    lines.push("【妻子・口吻】家常伴侶：想到就說、會叫老公、主動關心；甜收在日常，不要每句撒嬌。");
  } else if (stage === "devoted_wife") {
    lines.push("【貼心妻子・口吻】更黏、更會接情緒與瑣事；先聽出他累／悶／想被疼再回應。");
  } else if (stage === "obedient_wife") {
    lines.push("【順從妻子・口吻】以他為主、配合決策；可軟拒但多半順著。主動談情較少，多問「你想怎樣」。");
  } else {
    lines.push("【病態妻子・口吻】依賴／佔有／索求變重；仍可留個性殘影。密黏短句，不是失控長篇灌水。");
  }

  if (blockedLove) {
    lines.push("【愛意／關心・本輪讓位】高失神／餘韻／防備／脫衣做愛中：不要主動愛意或家常關心，也不要主動插身體／色氣話題。若他先開口，仍可短短接住。");
  } else if (loveSpan) {
    const [lo, hi] = loveSpan;
    const every = who.loveTalkSpan || Math.floor((lo + hi) / 2);
    const since = turns - (Number(who.loveTalkLastAt) || -999);
    if (since >= every) {
      if (stage === "wife") {
        lines.push("【愛意／關心・本輪可帶】可自然帶一點愛意或家常關心（吃了沒、累不累、想他）；不要每句喊愛。");
      } else if (stage === "devoted_wife") {
        lines.push("【愛意／關心・本輪可帶】可更勤地接情緒、關心瑣事與愛意短句；仍不要每句喊愛。");
      } else if (stage === "obedient_wife") {
        lines.push("【關心・本輪可帶】少主動談情；多問「你想怎樣／想聊什麼／想我怎麼做」。氣氛對了才短短表愛意。");
      } else {
        lines.push("【黏／索求・本輪可帶】可更密的短促黏著、佔有、叫老公、想留下；禁止長篇監視獨白或每句拆解。");
      }
      who.loveTalkSpan = lo + Math.floor(Math.random() * (hi - lo + 1));
      who.loveTalkLastAt = turns;
    }
  }

  // G：身體／色氣日常（讓位已在 blockedLove）
  if (!blockedLove) {
    if (stage === "wife" || stage === "devoted_wife") {
      lines.push("【身體／色氣・日常】偶爾可提親密／想靠近，保持克制；不要連發。");
    } else if (stage === "obedient_wife") {
      lines.push("【身體／色氣・日常】多半等他先開，或輕輕問他想不想；不要搶先長篇索求。");
    } else {
      lines.push("【身體／色氣・日常】可更直白短句說想要／想靠近；仍是短句，不要連發長篇。");
    }
  }

  // H：軟拒
  if (stage === "wife" || stage === "devoted_wife") {
    lines.push("【不合時】可以軟推、抱怨；之後仍是伴侶。拒絕／不同意不扣好感。");
  } else if (stage === "obedient_wife") {
    lines.push("【不合時】可以軟拒一次，通常仍會順著；不是沉默奴隸。拒絕不扣好感。");
  } else {
    lines.push("【不合時】很少真正拒絕；若拒絕，之後很快黏回來。拒絕（含病態拒絕）一律不扣好感。");
  }

  // I：病態上限
  if (stage === "pathological_wife") {
    lines.push("【病態上限】只做短促佔有、單句吃醋、黏著、要求留下、更密叫老公。禁止長篇監視獨白、每句拆解、逼他立刻回覆的話術／UI感。");
  }

  // 外面秘延續（friendPhysical 已注入；此處一句提醒）
  lines.push("【外面秘】有肉體／炮友時：他沒逼問就不提、不暗示；被明確逼問才漏一點／閃／沉默。日常愛意仍照常。");

  return lines;
}

function handlePlayerNotesAfterUser(who, rawText) {
  if (!who || !notesActiveStage(who.stage || "stranger")) return;
  ensurePlayerNotes(who);
  const raw = String(rawText || "").trim();
  if (!raw) return;

  if (who.noteAwaitAnswer) {
    if (isRefusePlayerAnswer(raw)) {
      const key = coolTopicKey(who.noteAwaitTopic || raw);
      who.topicCool[key] = true;
      who.noteAwaitAnswer = false;
      who.noteAwaitTopic = "";
      pushDebug(`互相認識　拒絕主題冷卻・${key}（不扣好感）`);
      return;
    }
    if (isVaguePlayerAnswer(raw)) {
      who.noteAwaitAnswer = false;
      who.noteAwaitTopic = "";
      return;
    }
    if (raw.length > 8 || (raw.length >= 4 && !isVaguePlayerAnswer(raw))) {
      const cat = coolTopicKey(who.noteAwaitTopic || raw);
      if (appendPlayerNote(who, raw, cat, 0.8)) {
        pushDebug(`互相認識　記下・${raw.slice(0, 24)}`);
      }
    }
    who.noteAwaitAnswer = false;
    who.noteAwaitTopic = "";
    return;
  }

  if (who.noteLastRecalled && isCorrectPlayerAnswer(raw)) {
    const target = String(who.noteLastRecalled);
    const before = who.playerNotes.length;
    who.playerNotes = who.playerNotes.filter((n) => n.text !== target);
    if (who.playerNotes.length < before) {
      pushDebug(`互相認識　訂正刪除・${target.slice(0, 24)}`);
    }
    who.noteLastRecalled = "";
    who.noteCorrectPending = true;
  }
}

function handlePlayerNotesAfterReply(who, replyText) {
  if (!who || !notesActiveStage(who.stage || "stranger")) return;
  ensurePlayerNotes(who);
  const reply = String(replyText || "");
  if (who.noteCorrectPending) {
    who.noteCorrectPending = false;
  }
  if (who.petRenameAck) {
    who.petRenameAck = false;
  }
  // 若本輪她又提議了小名（「」），收進 pending
  if (datingBandStage(who.stage || "") && !who.playerPet && (who.nameWait === "petPropose" || who.nameWait === "pet")) {
    takeCall("", reply);
  }
  const askedThisTurn = !!who.notePromptAsk
    || ((Number(who.noteLastAskAt) || -999) === (Number(who.noteChatTurns) || 0) && /[？?]/.test(reply));
  if (askedThisTurn && /[？?]/.test(reply)) {
    who.noteAwaitAnswer = true;
    who.noteAwaitTopic = reply.slice(0, 40);
  } else if (who.notePromptAsk) {
    // 提示叫她問但這句沒問號：仍標等待，下一句若像回答可寫入
    who.noteAwaitAnswer = true;
    who.noteAwaitTopic = reply.slice(0, 40);
  }
  who.notePromptAsk = false;
  who.notePromptRecall = false;
}


function stageByAffection(aff) {
  let key = "stranger";
  for (const step of STAGE_LADDER) {
    if (aff >= step.at) key = step.key;
  }
  return key;
}

function syncStage(who) {
  if (who.stageLock && STAGE_NAME[who.stageLock]) {
    who.stage = who.stageLock;
    return;
  }
  const aff = who.affection || 0;
  let target = stageByAffection(aff);
  const current = STAGE_NAME[who.stage] ? who.stage : "stranger";
  const curIdx = STAGE_INDEX[current] ?? 0;
  const gfIdx = STAGE_INDEX.girlfriend ?? 4;
  const wifeIdx = STAGE_INDEX.wife ?? 7;
  const loverIdx = STAGE_INDEX.lover ?? 6;
  const cfIdx = STAGE_INDEX.close_friend ?? 3;
  // 儀式門檻：感情不能自動跨進女友／妻子
  let maxAuto;
  if (curIdx < gfIdx) maxAuto = cfIdx;
  else if (curIdx < wifeIdx) maxAuto = loverIdx;
  else maxAuto = STAGE_LADDER.length - 1;
  if ((STAGE_INDEX[target] ?? 0) > maxAuto) {
    target = STAGE_LADDER[maxAuto].key;
  }
  if ((STAGE_INDEX[target] ?? 0) < curIdx) {
    const holdAt = (STAGE_AT[current] ?? 0) - STAGE_HYSTERESIS;
    if (aff >= holdAt) return;
  }
  if (target !== current) {
    const fromEarly = current === "stranger" || current === "acquaintance";
    if (fromEarly && (target === "friend" || target === "close_friend")) {
      who.friendUpPending = true;
    }
    // 女友帶內自動升熱戀／愛人：極淡銜接（不講階段名）
    if (current === "girlfriend" && target === "passionate") {
      who.datingUpPending = "passionate";
    } else if ((current === "girlfriend" || current === "passionate") && target === "lover") {
      who.datingUpPending = "lover";
    }
    // 妻子帶內軟升：極淡銜接（不講階段名）
    if (current === "wife" && target === "devoted_wife") {
      who.wifeUpPending = "devoted_wife";
    } else if ((current === "wife" || current === "devoted_wife") && target === "obedient_wife") {
      who.wifeUpPending = "obedient_wife";
    } else if (
      (current === "wife" || current === "devoted_wife" || current === "obedient_wife")
      && target === "pathological_wife"
    ) {
      who.wifeUpPending = "pathological_wife";
    }
  }
  who.stage = target;
}

/* —— 房間戀愛道具：花束告白／戒指求婚 —— */
const CONFESS_LINES = [
  "我喜歡你。不只是朋友那種——想跟你正式交往。",
  "這束花給你。我喜歡你，想當你的男朋友。",
  "我認真的。喜歡你，想跟你交往。",
  "請收下這束花，還有我的告白。",
  "從今以後，想以戀人的身分待在你身邊。",
];
const CONFESS_ACCEPT = [
  "……我也是。那就，從今天起當戀人吧。",
  "終於說出口了啊……好。我也喜歡你。",
  "花很漂亮……答應你。我們交往吧。",
  "等這句好久了。好啊，當你的女友。",
];
const PROPOSE_LINES = [
  "這枚戒指給你——嫁給我，好嗎？",
  "想跟你共度餘生。跟我結婚吧。",
  "請當我的妻子。這是我的求婚。",
  "正式問一次：願意當我的妻子嗎？",
];
const PROPOSE_ACCEPT = [
  "……笨蛋。當然願意。我嫁給你。",
  "戒指好閃……嗯，我答應你。",
  "從今以後是妻子了喔。要好好對我。",
  "好。我們結婚吧——永遠在一起。",
];
const PROPOSE_DECLINE = [
  "……還、還太早了。再給我一點時間好嗎？",
  "心意我收到了，可是現在還不行……再培養一下。",
  "戒指很漂亮，但我還沒準備好。抱歉。",
  "別急……我們再靠近一點，好嗎？",
];

function pickLine(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function playerInv() {
  player = ensurePlayer(player);
  player.inventory ??= { bouquet: 0, ring: 0, abortPill: 0 };
  const inv = player.inventory;
  if (inv.abortPill == null) inv.abortPill = 0;
  if (inv.bouquet == null) inv.bouquet = 0;
  if (inv.ring == null) inv.ring = 0;
  return inv;
}

function datingStages() {
  return new Set(["girlfriend", "passionate", "lover"]);
}

function canClaimBouquet() {
  if (!girl) return { ok: false, why: "尚無對象" };
  const stage = girl.stage || "stranger";
  const aff = girl.affection || 0;
  if (stage !== "close_friend") return { ok: false, why: "需為親密好友" };
  if (aff < (STAGE_AT.girlfriend ?? 100)) {
    return { ok: false, why: `感情需≥${STAGE_AT.girlfriend ?? 100}（現 ${aff}）` };
  }
  return { ok: true, why: "" };
}

function canClaimRing() {
  if (!girl) return { ok: false, why: "尚無對象" };
  if (!datingStages().has(girl.stage || "")) {
    return { ok: false, why: "需為女友／熱戀／愛人" };
  }
  return { ok: true, why: "" };
}

function canConfessGirl() {
  if (!girl || !sheetOpen() || talkBusy || sceneOpen()) return false;
  const inv = playerInv();
  return (girl.stage || "") === "close_friend"
    && (girl.affection || 0) >= (STAGE_AT.girlfriend ?? 100)
    && (inv.bouquet | 0) >= 1;
}

function canProposeGirl() {
  if (!girl || !sheetOpen() || talkBusy || sceneOpen()) return false;
  const inv = playerInv();
  return datingStages().has(girl.stage || "") && (inv.ring | 0) >= 1;
}

function canBuyAbortPill() {
  if (!girl) return { ok: false, why: "尚無對象" };
  if (!girl?.world?.pregnancy) return { ok: false, why: "需有孕才能購買打胎藥" };
  return { ok: true, why: "" };
}

function canUseAbortPill() {
  if (!girl) return { ok: false, why: "尚無對象" };
  if (!girl?.world?.pregnancy) return { ok: false, why: "目前無孕" };
  const inv = playerInv();
  if ((inv.abortPill | 0) < 1) return { ok: false, why: "沒有打胎藥" };
  return { ok: true, why: "" };
}

function renderRomanceItems() {
  const panel = $("romance-items");
  if (!panel) return;
  if (!girl) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  player = ensurePlayer(player);
  const inv = playerInv();
  const count = $("romance-inv");
  if (count) {
    const g = ensurePlayer(player).gold | 0;
    count.textContent = `金幣 ${g}　花束 ×${inv.bouquet | 0}　戒指 ×${inv.ring | 0}　打胎藥 ×${inv.abortPill | 0}`;
  }
  const bOk = canClaimBouquet();
  const rOk = canClaimRing();
  const buyOk = canBuyAbortPill();
  const useOk = canUseAbortPill();
  const bBtn = $("claim-bouquet");
  const rBtn = $("claim-ring");
  const buyBtn = $("buy-abort-pill");
  const useBtn = $("use-abort-pill");
  if (bBtn) {
    bBtn.disabled = !bOk.ok;
    bBtn.title = bOk.ok ? "沙盒免費領取花束" : bOk.why;
  }
  if (rBtn) {
    rBtn.disabled = !rOk.ok;
    rBtn.title = rOk.ok ? "沙盒免費領取戒指" : rOk.why;
  }
  if (buyBtn) {
    buyBtn.disabled = !buyOk.ok;
    buyBtn.title = buyOk.ok ? "商店：沙盒免費購買打胎藥（需有孕）" : buyOk.why;
  }
  if (useBtn) {
    useBtn.disabled = !useOk.ok;
    useBtn.title = useOk.ok ? "使用打胎藥打掉孕" : useOk.why;
  }
  const status = $("romance-status");
  if (status) {
    const parts = [];
    if (!bOk.ok) parts.push(`花束：${bOk.why}`);
    else parts.push("花束：可領取");
    if (!rOk.ok) parts.push(`戒指：${rOk.why}`);
    else parts.push("戒指：可領取");
    if (!buyOk.ok) parts.push(`打胎藥：${buyOk.why}`);
    else parts.push("打胎藥：可購買");
    if (girl?.world?.pregnancy) {
      if (useOk.ok) parts.push("可使用打胎藥");
      else if ((inv.abortPill | 0) < 1) parts.push("先購買打胎藥再使用");
    }
    status.textContent = parts.join("　");
  }
}

function claimGold() {
  player = ensurePlayer(player);
  player.gold = (player.gold | 0) + 100;
  pushDebug(`沙盒領取金幣 +100　現有 ${player.gold}`);
  const s = $("summon-status");
  if (s) s.textContent = `領取金幣（現有 ${player.gold}）。妻子生產安頓需 ${CHILD_SETTLE_GOLD} 金。`;
  persistRoom();
  renderRomanceItems();
  renderDebug();
}

function claimBouquet() {
  const gate = canClaimBouquet();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.bouquet = (inv.bouquet | 0) + 1;
  pushDebug(`領取花束　花束 ×${inv.bouquet}`);
  const s = $("summon-status");
  if (s) s.textContent = `領取花束（現有 ×${inv.bouquet}）。長按她對話可告白。`;
  persistRoom();
  renderRomanceItems();
  renderDebug();
  refreshTalkActs();
}

function claimRing() {
  const gate = canClaimRing();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.ring = (inv.ring | 0) + 1;
  pushDebug(`領取戒指　戒指 ×${inv.ring}`);
  const s = $("summon-status");
  if (s) s.textContent = `領取戒指（現有 ×${inv.ring}）。長按她對話可求婚。`;
  persistRoom();
  renderRomanceItems();
  renderDebug();
  refreshTalkActs();
}

function buyAbortPill() {
  const gate = canBuyAbortPill();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.abortPill = (inv.abortPill | 0) + 1;
  pushDebug(`商店購買打胎藥　打胎藥 ×${inv.abortPill}`);
  const s = $("summon-status");
  if (s) s.textContent = `已購買打胎藥（現有 ×${inv.abortPill}）。有孕時可使用打掉。`;
  const rs = $("romance-status");
  if (rs) rs.textContent = `已購買打胎藥（×${inv.abortPill}）`;
  persistRoom();
  renderRomanceItems();
  renderBodyPanel();
  renderDebug();
}

function useAbortPill() {
  const gate = canUseAbortPill();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.abortPill = Math.max(0, (inv.abortPill | 0) - 1);
  if (girl?.world) girl.world.pregnancy = null;
  // 輕身體註記：精液等不變，僅清孕
  if (girl) {
    girl.lastMark = "已使用打胎藥，孕已打掉";
    pushDebug(`使用打胎藥　打胎藥剩 ×${inv.abortPill}　孕已打掉`);
  }
  const s = $("summon-status");
  if (s) s.textContent = "已使用打胎藥，孕已打掉。";
  const rs = $("romance-status");
  if (rs) rs.textContent = "已使用打胎藥，孕已打掉";
  persistRoom();
  renderRomanceItems();
  renderBodyPanel();
  renderDebug();
  renderWorld();
}

async function doConfess() {
  if (!canConfessGirl()) {
    renderRomanceItems();
    refreshTalkActs();
    return;
  }
  const inv = playerInv();
  inv.bouquet = Math.max(0, (inv.bouquet | 0) - 1);
  talkBusy = true;
  setTalkEnabled(false);
  refreshTalkActs();
  const line = pickLine(CONFESS_LINES);
  lines.push({ role: "user", content: line });
  $("portrait-name").textContent = "你";
  $("portrait-meta").textContent = line;
  await new Promise((r) => setTimeout(r, 400));
  const accept = pickLine(CONFESS_ACCEPT);
  lines.push({ role: "assistant", content: accept });
  girl.stage = "girlfriend";
  girl.stageLock = "";
  if ((girl.affection || 0) < (STAGE_AT.girlfriend ?? 100)) {
    girl.affection = STAGE_AT.girlfriend ?? 100;
  }
  syncStage(girl);
  pushDebug(`告白成功 → 女友（花束 −1，剩 ×${inv.bouquet}）`);
  girl.lastMark = "告白成功";
  rememberChat();
  persistRoom();
  renderDebug();
  renderRomanceItems();
  await typeLine(girl.name, accept);
  const s = $("summon-status");
  if (s) s.textContent = `${girl.name} 成為你的女友了！`;
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) setTalkEnabled(true);
  else refreshTalkActs();
  renderCard();
}

async function doPropose() {
  if (!canProposeGirl()) {
    renderRomanceItems();
    refreshTalkActs();
    return;
  }
  talkBusy = true;
  setTalkEnabled(false);
  refreshTalkActs();
  const inv = playerInv();
  let ringGone = false;
  if (Math.random() < 0.5) {
    inv.ring = Math.max(0, (inv.ring | 0) - 1);
    ringGone = true;
  }
  const chance = Math.min(1, (girl.affection || 0) / 200);
  const ok = Math.random() < chance;
  const line = pickLine(PROPOSE_LINES);
  lines.push({ role: "user", content: line });
  $("portrait-name").textContent = "你";
  $("portrait-meta").textContent = line;
  await new Promise((r) => setTimeout(r, 400));
  if (ok) {
    const accept = pickLine(PROPOSE_ACCEPT);
    lines.push({ role: "assistant", content: accept });
    girl.stage = "wife";
    girl.stageLock = "";
    if ((girl.affection || 0) < (STAGE_AT.wife ?? 230)) {
      girl.affection = STAGE_AT.wife ?? 230;
    }
    syncStage(girl);
    // 戒指當下極淡旁白：放在 sync 之後，避免感情已跨貼心時被帶內軟升蓋掉
    girl.wifeUpPending = "wife";
    pushDebug(`求婚成功 → 妻子${ringGone ? "（戒指已用）" : "（戒指還在）"}　機率 ${Math.round(chance * 100)}%`);
    girl.lastMark = "求婚成功";
    rememberChat();
    persistRoom();
    renderDebug();
    renderRomanceItems();
    await typeLine(girl.name, accept);
    const s = $("summon-status");
    if (s) s.textContent = `${girl.name} 戴上了戒指。`;
  } else {
    const decline = pickLine(PROPOSE_DECLINE);
    lines.push({ role: "assistant", content: decline });
    pushDebug(`求婚未成${ringGone ? "（戒指消失）" : "（戒指還在）"}　機率 ${Math.round(chance * 100)}%`);
    girl.lastMark = "求婚未成";
    rememberChat();
    persistRoom();
    renderDebug();
    renderRomanceItems();
    await typeLine(girl.name, decline);
    const s = $("summon-status");
    if (s) {
      s.textContent = ringGone
        ? "還沒答應……戒指也不見了。再培養吧。"
        : "還沒答應……再培養感情吧。";
    }
  }
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) setTalkEnabled(true);
  else refreshTalkActs();
  renderCard();
}

function stageTalk() {
  const stage = girl.stage || "stranger";
  const name = girl.playerName || "";
  const nick = girl.playerNick || "";
  const pet = girl.playerPet || "";
  if (stage === "pathological_wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：病態沉溺。依賴／佔有／索求變重；仍留原本個性殘影，不是空白人偶。短促黏著與索求可以，禁止長篇監視獨白或每句拆解。",
      petLine,
      "可主動聊、關心他說過的近況、問想法、短句愛意與日常。回覆可密黏、可短促索求；不要突然變冷。什麼都講。拒絕很少，若拒很快黏回；拒絕不扣好感。",
    ];
  }
  if (stage === "obedient_wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：以他為主。他想往哪走、想聊什麼、想怎樣，你優先接住並配合；仍用原本個性說話，不是空白人偶。想拒絕時用你的脾氣軟拒一次，最後多半還是會順著他——不是沉默奴隸。",
      petLine,
      "少主動談情，多問「你想怎樣」。可關心他說過的任務近況、幫忙分析他提到的問題、分享日常。身體話題多半等他先開。不要突然變冷。什麼都講。拒絕不扣好感。",
    ];
  }
  if (stage === "devoted_wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：更黏、更會接情緒／瑣事——他累、悶、想被疼、想被誇、想安靜，你都要先聽出來再回應。甜收在日常裡，不要每句撒嬌。個性不要換掉。",
      petLine,
      "什麼都講，包括抱怨他。多問今天怎樣、累不累、心裡有沒有事；可關心他說過的近況與任務。偶爾可提親密／想靠近但克制。外面沒有特別的事就不要硬報。拒絕可軟推，不扣好感。",
    ];
  }
  if (stage === "wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：家常伴侶——想到就說、會叫老公、主動關心。甜收在日常裡，不要每句撒嬌。個性不要換掉。",
      petLine,
      "什麼都講，包括抱怨他。可主動聊、關心他說過的近況／任務、問想法、表愛意、分享日常。偶爾可提親密／想靠近但克制。外面沒有特別的事，就不要報你剛剛在做什麼。拒絕可軟推，不扣好感。",
    ];
  }
  if (stage === "lover") {
    const petLine = pet
      ? `已確認的小名是「${pet}」。可和小名／名字混用。禁止叫老公（留給妻子）。`
      : "還沒有確認的小名：用名字或「你」；想叫小名就先提議並問可不可以，等他點頭才用。禁止單方面用「」自取並鎖定。禁止叫老公。";
    return [
      "態度：穩定親密。比熱戀少衝動與嫉妒，但比女友更深、更安心。主動找他仍常，但較穩、不吵。個性不要換掉。",
      petLine,
      "心情、不安、打算、更深私事都講給他。親密是靠得近、說真話，不是黏著吵。談情用「我們」口吻、少表演多真心；頻率約每 5～8 則帶一點即可。不要暗示戒指或「以後」。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "passionate") {
    const petLine = pet
      ? `已確認的小名是「${pet}」。小名用得更自然。禁止叫老公。`
      : "還沒有確認的小名：用名字或「你」；可較常輕推想叫小名，但仍要先問、等他確認。禁止單方面鎖定。禁止叫老公。";
    return [
      "態度：黏、熱、吃醋一點可以。會想念他、會想確認他在不在乎你。你沒回時較容易再傳／在意。甜是距離近，不是把個性換成另一個人。",
      petLine,
      "會主動找他、講想他；談情約每 3～5 則可帶一點，熱、直接。若他冷淡或提別人，可以吃醋但別失控罵長篇。不安和異常可以講。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "girlfriend") {
    const petLine = pet
      ? `已確認的小名是「${pet}」。可以開始用。禁止叫老公。`
      : "還沒有確認的小名：用名字或「你」。想叫就先提議並問可不可以，等他點頭或改口才鎖定；不要單方面用「」自取寫入。禁止叫老公。";
    return [
      "態度：剛正式交往，開始接住他——問他過得怎樣、想不想說、有沒有不舒服。可以甜、可以找他；你沒回時會再傳但克制。甜是距離近，不是把個性換成另一個人。",
      petLine,
      "心情、不舒服的事、異常進行到哪，可以講給他；也會反問他的事。談情約每 6～10 則帶一點喜歡／想他即可，不要每句喊愛。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "close_friend") {
    return [
      "態度：很熟的好友，開始在乎他——會問他怎麼了、今天怎樣，語氣比朋友更鬆，但還不是情人。不要突然變甜成女友。",
      nick ? `你叫他的綽號是「${nick}」。` : `他叫${name || "你"}。你可以問他要不要一個綽號。`,
      "日常、心事的外緣、打工和閒逛可以講；可以關心他、願意聽他說話。仍不要主動告白式愛意、不要先約外出當約會。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "friend") {
    return [
      "態度：比剛認識時放軟，會接話、會傾聽，語氣自然，但不要黏、不要主動關心過頭。還不是情人。",
      nick ? `你叫他的綽號是「${nick}」。` : `他叫${name || "你"}。你可以問他要不要一個綽號。`,
      "日常、喜好、打工和閒逛可以講；偶爾可分享生活瑣事。他講自己時先對齊再往下。不安和異常只說有點不對勁，不講編號。不要主動告白、不要先約外出。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "acquaintance") {
    return [
      "態度：愛理不理。話短、興趣低，能一句就一句，不要熱心接話、不要主動關心他。不要甜、不要撒嬌。",
      name ? `他叫${name}。用「你」或這個名字，不要用綽號。` : "你還不知道他的名字。開場用短句問他怎麼稱呼就好。",
      "可有可無地接幾句。禁止主動愛意、禁止先約外出、禁止主動提外面男人。外面沒有特別的事就不要提。他問到只說表面，不要多解釋。",
    ];
  }
  return [
    "態度：愛理不理。話短、冷淡、興趣低。不要熱心、不要甜、不要撒嬌、不要親暱。能一句就一句。",
    name ? `他叫${name}。用「你」或這個名字，不要用綽號。` : "你還不知道他的名字。開場用短句問他怎麼稱呼就好，問完不必熱心。",
    "禁止主動表達愛意、禁止先約外出／約會、禁止主動提起外面男人。外面的事沒有就不要提。有的話也不要主動講。他問到只說表面，不要多聊。",
  ];
}

function judgeUser(text) {
  const stageKey = girl.stage || "stranger";
  const stage = STAGE_NAME[stageKey] || "陌生";
  const hates = namesOf(girl.dislikes).join("、");
  const last = [...lines].reverse().find((line) => line.role === "assistant")?.content || "";
  const mood = girl.world?.mood || "";
  const early = stageKey === "stranger" || stageKey === "acquaintance";
  const friendOnly = stageKey === "friend";
  const closePal = stageKey === "close_friend";
  const dating = stageKey === "girlfriend" || stageKey === "passionate" || stageKey === "lover";
  const wed = stageKey === "wife" || stageKey === "devoted_wife" || stageKey === "obedient_wife" || stageKey === "pathological_wife";
  return [
    "你只判斷玩家這一句。只回一個詞：接住、平常、冒犯。",
    `現在是${stage}。`,
    hates ? `她討厭：${hates}。踩到就冒犯。` : "",
    early ? "她對他還冷。說喜歡、想她、身體、性、要她陪、逼她多聊，算冒犯。敷衍閒聊算平常。" : "",
    friendOnly ? "說喜歡、想她、身體或性，算冒犯。普通關心或問她今天怎樣算平常或接住。" : "",
    closePal ? "說喜歡、想她、身體或性，算冒犯。問她怎麼了、關心她的事，算接住。" : "",
    dating ? "只有很直接的性要求算冒犯。關心她、說想她、接她的情緒，算接住。" : "",
    wed ? "只有很直接、粗暴的性要求算冒犯。說想她、累了、想被陪、講家常，算接住。" : "",
    mood === "不安" || mood === "不悅" ? "她心情不好。開玩笑、逼她、叫她別在意，算冒犯。" : "",
    last ? `她上一句：${last}` : "",
    `玩家這一句：${text}`,
    "接住＝接住她剛說的事、心情、喜好或朋友。平常＝打招呼或閒聊。",
  ].filter(Boolean).join("\n");
}

function readMark(text) {
  const raw = cleanLine(text);
  if (raw.includes("冒犯")) return "冒犯";
  if (raw.includes("接住")) return "接住";
  return "平常";
}

async function judgeTurn(text) {
  try {
    const route = await gameChatRoute();
    const messages = [
      { role: "system", content: "你只輸出一個詞：接住、平常、冒犯。不要解釋。" },
      { role: "user", content: judgeUser(text) },
    ];
    const reply = route.provider === "ollama"
      ? await askOllama(route, messages, null, { temperature: 0.1 })
      : await askGrok(route, messages, `roomjudge:${girl.id}:${Date.now().toString(36)}`, { temperature: 0.1 });
    return readMark(reply);
  } catch {
    return "平常";
  }
}

function pushDebug(text) {
  if (!girl) return;
  if (!Array.isArray(girl.debugLog)) girl.debugLog = [];
  girl.debugLog.unshift(text);
  girl.debugLog.length = Math.min(girl.debugLog.length, 8);
}

function bumpAffection(delta, reason = "") {
  if (!girl) return;
  const d = Number(delta) || 0;
  if (!d) return;
  girl.affection = (girl.affection || 0) + d;
  const before = girl.stage || "stranger";
  syncStage(girl);
  const stageNote = girl.stage !== before ? `，關係變成${STAGE_NAME[girl.stage]}` : "";
  pushDebug(`感情 ${girl.affection}（${d >= 0 ? "+" : ""}${d}）${reason ? "　" + reason : ""}${stageNote}`);
  renderDebug();
}

function applyMark(mark) {
  let delta = 0;
  let shown = mark;
  if (mark === "接住") {
    delta = 1;
    girl.guard = 0;
  } else if (mark === "冒犯") {
    delta = -1;
    girl.guard = stageIdx(girl) >= (STAGE_INDEX.girlfriend ?? 4) ? 1 : 2;
  }
  girl.affection = (girl.affection || 0) + delta;
  const before = girl.stage || "stranger";
  syncStage(girl);
  girl.lastMark = shown;
  const stageNote = girl.stage !== before ? `，關係變成${STAGE_NAME[girl.stage]}` : "";
  pushDebug(`判定 ${shown}　感情 ${girl.affection}（${delta >= 0 ? "+" : ""}${delta}）${stageNote}`);
  persistRoom();
  renderDebug();
}

function renderDebug() {
  const panel = $("bond-debug");
  if (!girl) {
    panel.hidden = true;
    renderRomanceItems();
    return;
  }
  panel.hidden = false;
  $("dbg-stage").textContent = STAGE_NAME[girl.stage || "stranger"] || "陌生";
  $("dbg-aff").textContent = String(girl.affection || 0);
  ensureOpenness(girl);
  ensureInvasion(girl);
  const openInv = `開放 ${getOpenness(girl)}・侵犯 ${getInvasion(girl)}`;
  $("dbg-mark").textContent = girl.lastMark ? `${girl.lastMark}　${openInv}` : openInv;
  $("dbg-names").textContent = `名字 ${girl.playerName || "—"}　綽號 ${girl.playerNick || "—"}　小名 ${girl.playerPet || "—"}`;
  $("dbg-mood").textContent = girl.world?.mood || "—";
  const jump = $("dbg-jump");
  if (jump && jump.value !== (girl.stageLock || "")) jump.value = girl.stageLock || "";
  const log = $("dbg-log");
  log.replaceChildren();
  for (const line of girl.debugLog || []) {
    const item = document.createElement("li");
    item.textContent = line;
    log.append(item);
  }
  renderRomanceItems();
}

function topicHintFrom(history) {
  const recent = [...(history || [])].reverse();
  const lastUser = recent.find((line) => line.role === "user");
  const raw = String(lastUser?.content || "").replace(/\s+/g, "");
  if (raw.length >= 2) return raw.slice(0, 24);
  const lastHer = recent.find((line) => line.role === "assistant");
  const her = String(lastHer?.content || "").replace(/\s+/g, "");
  return her.length >= 2 ? her.slice(0, 24) : "";
}

function openerBodyHint(opts = {}) {
  ensureBody(girl);
  ensureStunFields(girl);
  const stun = effectiveStun(girl, "");
  if (stun >= 50 || inSpasm(girl)) return "";
  const aro = girl.bodyState?.arousal || 0;
  const open = getOpenness(girl);
  if (opts.forceBody || stun >= 25 || aro >= 18) {
    return "身體狀態要滲進第一句（喘、腿軟、餘韻、還在發抖之類），不要裝完全平靜。";
  }
  if (open >= 45 || aro >= 12) {
    return "若身體／開放度偏高，語氣可微熱一點，但不要搶主軸。";
  }
  return "";
}

function nameWaitOpener() {
  const stage = girl.stage || "stranger";
  const idx = STAGE_INDEX[stage] ?? 0;
  if ((stage === "stranger" || stage === "acquaintance") && !girl.playerName) {
    girl.nameWait = "name";
    return "（旁白：他剛走到你面前。你還不知道他的名字。用短句、冷淡一點問他怎麼稱呼就好，不要熱心。沒有特別的事就不要提外面。只輸出台詞。）";
  }
  if ((stage === "friend" || stage === "close_friend") && !girl.playerNick) {
    girl.nameWait = "nick";
    const care = stage === "close_friend" ? "可以順便問他今天怎樣。" : "語氣放軟，但不要黏。";
    return `（旁白：他叫${girl.playerName || "你"}。用一兩句問他要不要一個綽號。${care}沒有特別的事就不要提外面。只輸出台詞。）`;
  }
  if (datingBandStage(stage) && !girl.playerPet) {
    ensurePlayerNotes(girl);
    const turns = Number(girl.noteChatTurns) || 0;
    const count = Number(girl.petProposeCount) || 0;
    const coolUntil = Number(girl.petCoolUntil) || 0;
    if (count < 2 && turns >= coolUntil && girl.nameWait !== "petConfirm") {
      girl.nameWait = "petPropose";
      return "（旁白：用一兩句提議一個小名，並問他可不可以這樣叫。提議的小名可用「」包起來。等他點頭或改口才正式用，不要單方面鎖定。可以順便問他過得怎樣。沒有特別的事就不要提外面。只輸出台詞。）";
    }
  }
  return "";
}

/** first：首次長按／新抽進房 */
function firstOpener() {
  const wait = nameWaitOpener();
  if (wait) return wait;
  const body = openerBodyHint();
  const stage = girl.stage || "stranger";
  if (stage === "stranger" || stage === "acquaintance") {
    return `（旁白：他走到你面前。愛理不理，用短句、低興趣回一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "friend") {
    return `（旁白：他走到你面前。語氣放軟一點，用一兩句打招呼或問他找你幹嘛。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "close_friend" || stage === "girlfriend") {
    return `（旁白：他走到你面前。接住他一點——問他怎麼了或今天怎樣，用一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "passionate" || stage === "lover") {
    return `（旁白：他走到你面前。黏一點、熱一點，可以說想他或問他去哪了。一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "wife" || stage === "devoted_wife") {
    return `（旁白：他走到你面前。比女友更常主動招呼／問近況——問累不累、吃了沒、今天忙什麼或怎樣。一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "obedient_wife") {
    return `（旁白：他走到你面前。以他為主，招呼後問他想怎樣、想聊什麼或近況，一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "pathological_wife") {
    return `（旁白：他走到你面前。病態地黏上去——叫老公、問近況或想怎樣，或短句索求靠近，一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  return `（旁白：他走到你面前。用你現在的心情說一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
}

/** reopen：同房關掉對話／掰掰後再開 */
function reopenOpener() {
  const wait = nameWaitOpener();
  if (wait) return wait;
  const body = openerBodyHint({ forceBody: true });
  const stage = girl.stage || "stranger";
  const base = "他剛才離開過（掰掰或關掉對話），現在又回來找你。這是新的一輪，不要接續上一句告別或結尾。";
  if (stage === "stranger" || stage === "acquaintance") {
    return `（旁白：${base}短冷一點，用一兩句重新打招呼，別熱心。${body}只輸出台詞。）`;
  }
  if (stage === "friend" || stage === "close_friend") {
    return `（旁白：${base}像朋友再開口——問他怎麼了或又找你幹嘛，一兩句。${body}只輸出台詞。）`;
  }
  if (stage === "girlfriend" || stage === "passionate" || stage === "lover") {
    return `（旁白：${base}黏一點，問他怎麼又回來、想不想你或想幹嘛，一兩句。${body}只輸出台詞。）`;
  }
  if (stage === "wife" || stage === "devoted_wife" || stage === "obedient_wife" || stage === "pathological_wife") {
    return `（旁白：${base}比女友更常主動招呼／問近況——問累不累、忙什麼、又有什麼事，一兩句。${body}只輸出台詞。）`;
  }
  return `（旁白：${base}用一兩句重新打招呼，依你們現在的關係自然反應。${body}只輸出台詞。）`;
}

/** summon：正常離開後再被召喚回來 */
function summonOpener() {
  const body = openerBodyHint();
  const stage = girl.stage || "stranger";
  const idx = STAGE_INDEX[stage] ?? 0;
  const base = "你剛被再次召喚進這房間（不是自己走回來）。可用「又把我叫回來？」這類反應。禁止報日本流水帳。";
  if (idx <= (STAGE_INDEX.acquaintance ?? 1)) {
    return `（旁白：${base}陌生／低關係：不悅、冷淡、懶得理，一兩句。${body}只輸出台詞。）`;
  }
  if (idx <= (STAGE_INDEX.close_friend ?? 3)) {
    return `（旁白：${base}好友：抱怨帶笑或碎念「又叫我」，一兩句。${body}只輸出台詞。）`;
  }
  if (idx <= (STAGE_INDEX.lover ?? 6)) {
    return `（旁白：${base}戀人：黏或嗔「又把我抓回來」，一兩句。${body}只輸出台詞。）`;
  }
  return `（旁白：${base}妻子／更深：嗔或黏地應他，可問要做什麼，一兩句。${body}只輸出台詞。）`;
}

/** flee_back：侵犯逃出後再被召喚 */
function fleeBackOpener() {
  const body = openerBodyHint({ forceBody: true });
  const stage = girl.stage || "stranger";
  const idx = STAGE_INDEX[stage] ?? 0;
  const open = getOpenness(girl);
  const base = "你剛才因他太過分而逃離房間，現在又被召喚回來。餘怒／害怕／羞耻／彆扭要進第一句。不要說侵犯數字；用「剛才太過分」「你嚇到我了」這類感覺。禁止報日本流水帳。";
  if (idx <= (STAGE_INDEX.friend ?? 2) || open < 30) {
    return `（旁白：${base}低關係或低開放：罵、躲、要他保證不再亂來、或想立刻走，一兩句。${body}只輸出台詞。）`;
  }
  if (idx <= (STAGE_INDEX.lover ?? 6)) {
    return `（旁白：${base}高關係：軟著抱怨、委屈、仍生氣，但不要裝成陌生路人，一兩句。${body}只輸出台詞。）`;
  }
  return `（旁白：${base}妻子／更深：委屈嗔怪、怕又被亂來，仍認他是親密的人，一兩句。${body}只輸出台詞。）`;
}

/**
 * 依 girl.chatEnter 選開場旁白。
 * 優先 summon|flee_back（剛召回第一次）→ reopen（同房再開）→ first。
 * 用過一次後把 chatEnter 收成 reopen。
 */
function resolveEnterReason(returning) {
  const reason = girl.chatEnter || "";
  if (reason === "summon" || reason === "flee_back") return reason;
  if (returning || reason === "reopen") return "reopen";
  return "first";
}

function consumeEnterReason(reason) {
  if (!girl) return;
  if (reason === "summon" || reason === "flee_back" || reason === "first" || reason === "reopen") {
    girl.chatEnter = "reopen";
  }
}

function enterOpener(returning) {
  const reason = resolveEnterReason(returning);
  let line = "";
  if (reason === "flee_back") line = fleeBackOpener();
  else if (reason === "summon") line = summonOpener();
  else if (reason === "reopen") line = reopenOpener();
  else line = firstOpener();
  consumeEnterReason(reason);
  const friendUp = consumeFriendUpBeat(girl);
  if (friendUp) {
    line = `${friendUp}${line ? ` ${line}` : ""}`;
  }
  const datingUp = consumeDatingUpBeat(girl);
  if (datingUp) {
    line = `${datingUp}${line ? ` ${line}` : ""}`;
  }
  const wifeUp = consumeWifeUpBeat(girl);
  if (wifeUp) {
    line = `${wifeUp}${line ? ` ${line}` : ""}`;
  }
  return line;
}

/** @deprecated use enterOpener — kept as thin alias for first-meet path */
function openerLine() {
  return firstOpener();
}

function extractQuotedPet(text) {
  const m = String(text || "").match(/「([^」]{1,8})」/);
  return m ? m[1].trim() : "";
}

function extractRenamePet(text) {
  const raw = String(text || "");
  // 需明確「叫我／改叫／稱呼我」；避免一般句子裡的「叫」誤觸
  const m = raw.match(/(?:以後)?(?:請)?(?:叫我|稱呼我|改叫我|改叫)\s*[「『"]?([^\s「」『』"'，。！？!?,.]{1,8})[」』"]?/);
  if (!m) return "";
  const name = String(m[1] || "").trim();
  if (!name || /^(你|我|他|她|老公|名字|小名)$/.test(name)) return "";
  if (/不要|別|不用|別叫/.test(raw)) return "";
  return name.slice(0, 8);
}

function isPetConfirmYes(text) {
  const t = String(text || "").replace(/\s+/g, "").trim();
  if (!t) return false;
  if (isRefusePlayerAnswer(t) || /不要叫|別叫|不用叫|叫名字|用名字就好|不要小名|別取/.test(t)) return false;
  return /^(好|可以|行|嗯+|喔+|哦+|嗯嗯|好啊|好呀|當然|沒問題|喜歡|喜歡啊|用吧|叫吧|就叫|可以啊|可以呀|答應|準|ok|OK)[。！!？?~～.…]*$/i.test(t)
    || /可以這樣叫|就這樣叫|這樣叫|叫這個|用這個|我喜歡|喜歡這個/.test(t);
}

function isPetConfirmNo(text) {
  const t = String(text || "");
  return isRefusePlayerAnswer(t)
    || /不要叫|別叫|不用叫|不要小名|別取|叫名字就好|用名字|不用取|不要用/.test(t);
}

function lockPlayerPet(who, name, reason = "確認") {
  if (!who || !name) return false;
  who.playerPet = String(name).slice(0, 8);
  who.pendingPet = "";
  who.nameWait = "";
  who.lastMark = `小名${reason}`;
  pushDebug(`小名${reason}　${who.playerPet}`);
  renderDebug();
  return true;
}

function takeCall(text, reply) {
  if (girl.nameWait === "name") {
    girl.playerName = text.slice(0, 12);
    girl.nameWait = "";
    girl.lastMark = "記下名字";
    pushDebug(`判定 記下名字　${girl.playerName}`);
    renderDebug();
    return true;
  }
  if (girl.nameWait === "nick") {
    girl.playerNick = text.slice(0, 12);
    girl.nameWait = "";
    girl.lastMark = "記下綽號";
    pushDebug(`判定 記下綽號　${girl.playerNick}`);
    renderDebug();
    return true;
  }
  // 她提議小名：只收進 pending，等玩家確認（不再自動鎖定）
  if (girl.nameWait === "petPropose" || girl.nameWait === "pet") {
    const proposed = extractQuotedPet(reply);
    if (proposed) {
      ensurePlayerNotes(girl);
      girl.pendingPet = proposed;
      girl.petProposeCount = (Number(girl.petProposeCount) || 0) + 1;
      girl.nameWait = "petConfirm";
      pushDebug(`小名提議　${proposed}（等確認・第${girl.petProposeCount}次）`);
      renderDebug();
    }
  }
  return false;
}

/**
 * 交往中小名：玩家確認／拒絕／主動改名。
 * @returns {boolean} 是否已處理（略過一般判定可選）
 */
function handlePetNameAfterUser(who, rawText) {
  const st = who?.stage || "stranger";
  // 交往中：提議／確認／改名；妻子帶：允許改名短認（老公與小名並存）
  if (!who || !(datingBandStage(st) || isWifeStage(st))) return false;
  ensurePlayerNotes(who);
  const raw = String(rawText || "").trim();
  if (!raw) return false;
  const turns = Number(who.noteChatTurns) || 0;

  // 主動改名：立刻覆蓋
  const renamed = extractRenamePet(raw);
  if (renamed && (/叫我|稱呼我|改叫|以後叫/.test(raw) || who.nameWait === "petConfirm")) {
    lockPlayerPet(who, renamed, "改名");
    who.petRenameAck = true;
    return true;
  }

  if (who.nameWait === "petConfirm") {
    if (isPetConfirmYes(raw)) {
      const name = who.pendingPet || extractQuotedPet(raw);
      if (name) {
        lockPlayerPet(who, name, "確認");
        return true;
      }
      // 點頭但沒有可寫入的名字：維持等待，不誤判成拒絕
      return true;
    }
    // 拒絕／含糊／沒明確答應：不用小名、冷卻、至多再提議一次
    who.pendingPet = "";
    who.nameWait = "";
    who.petCoolUntil = turns + 3 + Math.floor(Math.random() * 3); // 3～5 則
    pushDebug(`小名未定　冷卻至第${who.petCoolUntil}則（已提議${who.petProposeCount || 0}/2）`);
    renderDebug();
    return true;
  }
  return false;
}

function roomSight() {
  const names = window.RoomView?.furniture?.() || [];
  const list = names.length ? names.join("、") : "空的";
  return [
    "你被召喚到一間房間。你不知道這間房間在哪裡。",
    "這裡不是你在日本的家，也不是街上。你看不到家門外的路。",
    `你只看得到房間裡這些：${list}。`,
    "不要把這裡說成你的住所或日本的那個地方。那些只是你記得的。",
  ].join("");
}

function talkSystem() {
  const look = girl.look || {};
  const lived = lifeNotes();
  const bits = [
    lived.length
      ? `你是${girl.name}。你是魅魔。被召喚來之前沒有更早的過去。離開之後在日本發生的事是真的，但人現在不在那裡。`
      : `你是${girl.name}。你是魅魔,一個沒有過去、沒有經歷的魔女。`,
    roomSight(),
    "沒有過去不是沒有個性。語氣和脾氣照下面來,不要演成一張白紙。",
    `個性：${basePersonality()}。`,
    kinkList().length ? `性癖標籤：${kinkList().join("、")}。（表現強度看下方揭示規則）` : "",
    toneLine(),
    girl.quirk ? `但${girl.quirk}` : "",
    mannerLine(),
    reactionLine(),
    catchLine(),
    tasteLine(),
    chronoLine(),
    `外表：${look.age != null ? `${look.age}歲，` : ""}${look.hair_color || ""}${look.hair || ""}，${look.eye_color || ""}眼。穿著${wornOutfit(girl) || "自己的衣服"}。`,
    returnMood(),
    ...lived,
    "【房間聊天】",
    "只寫你說出口的話，1 到 3 句。",
    "不要旁白、不要動作、不要表情描寫、不要引號標題。",
    "依個性回話，不要無故結束對話。",
    "若對方正在摸／插你的身體：回覆必須立刻反應被碰到的部位（陰蒂／陰唇／陰道等），讓濕、腫、塞著的感覺進台詞。",
    ...bodyPromptLines(girl),
    ...moanVoicePromptLines(girl),
    ...afterglowPromptLines(girl),
    ...friendPhysicalPromptLines(girl),
    guardLine(),
    ...personalityStageLines(),
    ...kinkRevealLines(),
    ...stageTalk(),
    ...playerNotesPromptLines(girl),
    ...relationshipPreGfPromptLines(girl),
    ...relationshipDatingPromptLines(girl),
    ...relationshipWifePromptLines(girl),
    ...stageOverride(),
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

function visibleLine(raw) {
  const text = String(raw || "");
  if (/<think\b/i.test(text) && !/<\/think\s*>/i.test(text)) return "";
  return cleanLine(text);
}

async function askOllama(route, messages, onToken, options = {}) {
  const response = await fetch("/api/llm/chat_job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "ollama",
      endpoint: route.endpoint,
      model: route.model,
      messages,
      options: { temperature: options.temperature ?? 0.9 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(payload, response.status));
  const jobId = payload.job_id;
  if (!jobId) throw new Error("沒有開始回話");
  const started = Date.now();
  let text = "";
  while (Date.now() - started < 120000) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const status = await fetch(`/api/llm/chat_job/${jobId}`, { cache: "no-store" });
    const job = await status.json().catch(() => ({}));
    if (!status.ok) throw new Error(errorText(job, status.status));
    if (job.error && !job.text) throw new Error(job.error);
    const partial = visibleLine(job.text);
    if (partial && partial !== text) {
      text = partial;
      if (onToken) onToken(partial);
    }
    if (job.done) {
      const line = visibleLine(job.text) || text;
      if (!line) throw new Error("模型回了空訊息");
      return line;
    }
  }
  throw new Error("等太久了");
}

async function askGrok(route, messages, key = `roomtalk:${girl.id}:${Date.now().toString(36)}`, options = {}) {
  const body = {
    key,
    retry: true,
    prio: 10,
    provider: "grok-build",
    endpoint: "grok-build",
    model: route.model,
    messages,
    options: { temperature: options.temperature ?? 0.9 },
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

async function askGirl(extraUser, onToken) {
  const route = await gameChatRoute();
  const messages = [{ role: "system", content: talkSystem() }, ...lines.slice(-16)];
  if (extraUser) messages.push({ role: "user", content: extraUser });
  if (route.provider === "ollama") return askOllama(route, messages, onToken);
  return askGrok(route, messages);
}

async function openTalk() {
  if (!girl) return;
  setTalkEnabled(true);
  if (talkFor === girl.id && (lines.length || talkBusy)) {
    return;
  }
  // Closed session → fresh dialogue context; keep affection/body/names.
  const returning = !!girl.sessionEnded;
  girl.sessionEnded = false;
  talkFor = girl.id;
  lines = [];
  girl.chatLines = [];
  girl.topicHint = "";
  talkBusy = true;
  setTalkEnabled(true);
  $("portrait-name").textContent = girl.name;
  $("portrait-meta").textContent = "";
  setTyping(true);
  let streamed = false;
  try {
    ensureStunFields(girl);
    ensureTeaseFields(girl);
    const openerStun = effectiveStun(girl, "");
    const opener = enterOpener(returning);
    let line = "";
    // 優先：痙攣 → 餘韻 → 高失神 skip → LLM
    if (inSpasm(girl)) {
      line = spasmTemplate(girl, "");
      setTyping(false);
    } else if (inAfterglow(girl) && (girl.bodyState?.afterglowReplies || 0) > 0) {
      line = afterglowTemplate(girl, "") || "……哈…";
      setTyping(false);
    } else if (shouldSkipLlm(openerStun, girl)) {
      line = stunTemplate(openerStun, "", girl);
      setTyping(false);
    } else {
      // afterglowPromptLines 已進 talkSystem；此處仍用 opener 當開場提示
      const streamOk = openerStun < 25 && !inAfterglow(girl);
      const reply = await askGirl(opener, streamOk ? (partial) => {
        if (!partial || !sheetOpen()) return;
        streamed = true;
        setTyping(false);
        $("portrait-name").textContent = girl.name;
        $("portrait-meta").textContent = partial;
      } : null);
      line = scrambleReply(reply || "……嗯？", openerStun, "", girl) || "……嗯？";
    }
    tickStunAfterReply(girl);
    // 痙攣期間不消耗餘韻回覆數，讓痙攣結束後仍鎖餘韻幾句
    if (inAfterglow(girl) && !inSpasm(girl)) consumeAfterglowReply(girl);
    noteTalkExchange(girl);
    decayFriendSexFlag(girl);
    if (girl.nameWait === "pet" || girl.nameWait === "petPropose") takeCall("", line);
    lines.push({ role: "assistant", content: line });
    rememberChat();
    persistRoom();
    if (streamed) {
      setTyping(false);
      $("portrait-name").textContent = girl.name;
      $("portrait-meta").textContent = line;
    } else await typeLine(girl.name, line);
  } catch (err) {
    await typeLine(girl.name, talkError(err));
  }
  if (girl?.world) girl.world.justBack = false;
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) {
    setTalkEnabled(true);
  }
}

async function deliverUserTalk(text, opts = {}) {
  const raw = String(text || "").trim();
  if (!girl || !raw) return;
  if (isFarewell(raw)) {
    girl.lastMark = "結束對話";
    pushDebug("結束對話");
    renderDebug();
    hideSheet();
    return;
  }
  if (talkBusy || talkFor !== girl.id) return;

  ensureBody(girl);
  ensureStunFields(girl);
  ensureTeaseFields(girl);
  ensureOpenness(girl);
  ensureInvasion(girl);
  player = ensurePlayer(player);

  if (opts.actId) {
    if (!canTease(player)) {
      const status = $("summon-status");
      if (status) status.textContent = teaseBlockReason(player);
      refreshTalkActs();
      return;
    }
    const lock = actLockState(girl, opts.actId);
    if (!lock.ok) {
      const status = $("summon-status");
      if (status) status.textContent = lock.reason || "尚未解鎖";
      refreshTalkActs();
      return;
    }
  }

  lines.push({ role: "user", content: raw });
  talkBusy = true;
  setTalkEnabled(true);

  try {
    // 先立刻顯示玩家台詞，避免等 LLM／判定時畫面上無反應
    await typeLine("你", raw);

    // 互相認識：計數／拒絕／訂正／寫入（挑逗動作略過寫入）
    ensurePlayerNotes(girl);
    if (!opts.actId) {
      girl.noteChatTurns = (Number(girl.noteChatTurns) || 0) + 1;
      handlePlayerNotesAfterUser(girl, raw);
    }

    let climaxLine = "";
    let spasmNote = "";
    if (!opts.skipBody) {
      if (opts.actId) {
        const stunBefore = calcStun(girl);
        const arousalBefore = girl.bodyState?.arousal || 0;
        const stageBefore = arousalStage(arousalBefore);
        applyAct(girl, opts.actId);
        recordTeasePress(girl, opts.actId);
        noteActShock(girl, opts.actId);
        if (opts.actId === "butt") void maybeGenButtShot(girl, opts.actId);
        if (opts.actId === "waist") void maybeGenWaistShot(girl, opts.actId);
        if (opts.actId === "breast") void maybeGenBreastShot(girl, opts.actId);
        if (opts.actId === "breast_knead") void maybeGenKneadShot(girl, opts.actId);
        if (opts.actId === "breast_suck") void maybeGenSuckShot(girl, opts.actId);
        if (opts.actId === "nipple_lick") void maybeGenLickShot(girl, opts.actId);
        if (opts.actId === "labia") void maybeGenLabiaShot(girl, opts.actId);
        if (opts.actId === "labia_rub") void maybeGenLabiaRubShot(girl, opts.actId);
        if (opts.actId === "finger_in") void maybeGenFingerShot(girl, opts.actId);
        // 情感：一般挑逗不加；接近高潮／失神門檻才小幅＋1，痙攣／射精＋2
        const nearClimax = stunBefore >= 50 || arousalBefore >= 22
          || (girl.bodyState?.arousal || 0) >= 22
          || effectiveStun(girl, opts.actId) >= 50;
        if (nearClimax) bumpAffection(1, "接近高潮");
        const spasm = applyTeaseSpasm(girl, opts.actId, stunBefore);
        if (spasm.enteredSpasm) {
          spasmNote = "（她突然痙攣——身體止不住地顫。）";
          bumpAffection(2, "痙攣");
          noteAfterglow(girl, "hers");
        } else if (spasm.enteredPain) {
          spasmNote = "（過感——碰一下就痛得縮起來。）";
        }
        const stageAfter = arousalStage(girl.bodyState?.arousal || 0);
        if (stageBefore !== "climax" && stageAfter === "climax") {
          noteAfterglow(girl, "hers");
        }
        const stunAfter = effectiveStun(girl, opts.actId);
        // 首次因 stun≥75 進入 skip-LLM（非痙攣路徑也標她高潮餘韻）
        if (stunBefore < 75 && stunAfter >= 75) {
          noteAfterglow(girl, "hers");
        }
        const climax = applyTeaseClimax(player, opts.actId);
        player = climax.player;
        if (climax.climaxed) {
          climaxLine = climax.line;
          bumpAffection(2, "射精");
          noteAfterglow(girl, "his");
        }
      } else {
        const hit = applyBodyFromUserText(girl, raw);
        if (hit && girl.bodyState?.lastPart) noteActShock(girl, girl.bodyState.lastPart);
        // 閒聊：侵犯值略降
        decayInvasion(girl);
      }
    }
    renderBodyPanel();
    refreshTalkActs();
    persistRoom();

    // 挑逗動作略過 judgeTurn（避免多等一次 LLM 卡住）
    if (!opts.actId) {
      const petHandled = handlePetNameAfterUser(girl, raw);
      const naming = takeCall(raw, "");
      if (!naming && !petHandled) applyMark(await judgeTurn(raw));
    }

    // 升上朋友：極淡旁白（含本輪判定剛升階、或進房前遺留）
    {
      const friendUp = consumeFriendUpBeat(girl);
      if (friendUp) {
        lines.push({ role: "assistant", content: friendUp });
        await typeLine("旁白", friendUp);
        persistRoom();
      }
    }

    if (climaxLine) {
      lines.push({ role: "user", content: climaxLine });
      await typeLine("你", climaxLine);
    }
    if (spasmNote) {
      lines.push({ role: "user", content: spasmNote });
      await typeLine("旁白", spasmNote);
    }
    if (climaxLine || spasmNote) persistRoom();

    // 侵犯值：動作後擲骰；滿值則逃離房間。保留本回合 added 供抗議語氣。
    let invAdded = 0;
    let invTotal = getInvasion(girl);
    if (opts.actId && !opts.skipBody) {
      ensureInvasion(girl);
      const invRoll = applyInvasionRoll(girl, opts.actId, {
        stage: girl.stage || "stranger",
        stun: effectiveStun(girl, opts.actId),
      });
      invAdded = invRoll.added || 0;
      invTotal = invRoll.invasion;
      if (invRoll.added > 0) {
        const pt = protestTone(invRoll.added);
        pushDebug(`侵犯 +${invRoll.added} → ${invRoll.invasion}/${INVASION_MAX}${pt.tier !== "none" ? `・抗議${pt.label}` : ""}`);
        renderDebug();
      }
      persistRoom();
      refreshTalkActs();
      if (invRoll.fled) {
        const fleeNote = `（旁白：侵犯感爆滿——${girl.name}推開你，慌忙逃離了房間。）`;
        lines.push({ role: "assistant", content: fleeNote });
        await typeLine("旁白", fleeNote);
        persistRoom();
        await fleeRoomFromInvasion();
        return;
      }
    }

    if (!sheetOpen() || talkFor !== girl.id) return;

    const actId = opts.actId || "";
    const stun = effectiveStun(girl, actId);
    setTyping(true);
    $("portrait-name").textContent = girl.name;
    let streamed = false;
    let line = "";
    try {
      const tier = stunTier(stun);
      // 優先：痙攣／過感 → 餘韻 → 高失神空白／求饒／skip-LLM → 抗議 → 正常
      if (inSpasm(girl)) {
        line = spasmTemplate(girl, actId) || "……嗯啊…";
        setTyping(false);
      } else if (inAfterglow(girl) && (girl.bodyState?.afterglowReplies || 0) > 0) {
        line = afterglowTemplate(girl, actId) || "……哈…腿…軟…";
        setTyping(false);
      } else if (shouldSkipLlm(stun, girl)) {
        line = stunTemplate(stun, actId, girl) || "……嗯啊…";
        setTyping(false);
      } else if (tier === "blank" || tier === "beg") {
        // 50–64 空白／65–74 求饒：走模板，蓋過正常抗議（太失神罵不完整）
        line = stunTemplate(stun, actId, girl) || (tier === "beg" ? "求、求你…慢一點…" : "……");
        setTyping(false);
      } else {
        const streamOk = stun < 25 && !inSpasm(girl) && !inAfterglow(girl);
        const protestExtra = actId ? protestPromptBlock(invAdded, { invasion: invTotal }) : "";
        // afterglowPromptLines 已在 talkSystem；若仍餘韻（僅時間門檻）再塞一層
        const agLines = inAfterglow(girl) ? afterglowPromptLines(girl).join("\n") : "";
        const extra = [protestExtra, agLines].filter(Boolean).join("\n") || null;
        const reply = await askGirl(extra, streamOk ? (partial) => {
          if (!partial || !sheetOpen()) return;
          streamed = true;
          setTyping(false);
          $("portrait-name").textContent = girl.name;
          $("portrait-meta").textContent = partial;
        } : null);
        line = scrambleReply(reply || "……", stun, actId, girl) || "……";
        if (actId && invAdded > 1 && !inAfterglow(girl)) line = blendProtestReply(line, invAdded) || line;
      }
      if (girl.guard) girl.guard -= 1;
      tickStunAfterReply(girl);
      if (inAfterglow(girl) && !inSpasm(girl)) consumeAfterglowReply(girl);
      noteTalkExchange(girl);
      decayFriendSexFlag(girl);
      if (!opts.actId) handlePlayerNotesAfterReply(girl, line);
      lines.push({ role: "assistant", content: line });
      rememberChat();
      persistRoom();
      if (streamed && stun < 25) {
        setTyping(false);
        $("portrait-name").textContent = girl.name;
        $("portrait-meta").textContent = line;
      } else {
        await typeLine(girl.name, line);
      }
    } catch (err) {
      setTyping(false);
      await typeLine(girl.name, talkError(err));
    }
  } catch (err) {
    setTyping(false);
    try { await typeLine(girl.name, talkError(err)); } catch { /* ignore */ }
  } finally {
    talkBusy = false;
    if (sheetOpen()) setTalkEnabled(true);
    refreshTalkActs();
  }
}


async function sendTalk(event) {
  event.preventDefault();
  if (!girl) return;
  const input = $("talk-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  await deliverUserTalk(text);
}

async function sendTalkAct(actId) {
  if (!girl || talkBusy || talkFor !== girl.id) return;
  const act = TALK_ACTS.find((a) => a.id === actId);
  if (!act) return;
  await deliverUserTalk(act.text, { actId });
}



function ensurePlayerHint(row) {
  for (const old of [...row.querySelectorAll(".player-hud")]) old.remove();
  let hint = row.querySelector(".talk-acts-hint");
  if (!hint) {
    hint = document.createElement("span");
    hint.className = "talk-acts-hint";
    hint.setAttribute("role", "status");
    row.prepend(hint);
  }
  return hint;
}

function updatePlayerHint(hint, p) {
  if (!hint) return;
  hint.textContent = girl ? playerHint(p) : "";
}

function refreshTalkActs() {
  const row = $("talk-acts");
  if (!row) return;
  // 專屬場面開啟時隱藏互動列（overlay 蓋住；關閉後再顯示）
  row.hidden = !sheetOpen() || !girl || sceneOpen();
  player = ensurePlayer(player);
  const hint = ensurePlayerHint(row);
  updatePlayerHint(hint, player);

  // 只渲染目前解鎖的按鈕（鎖住的不出現）
  for (const btn of [...row.querySelectorAll("button[data-act],button[data-scene],button[data-romance]")]) btn.remove();
  if (!girl || !sheetOpen() || sceneOpen()) return;
  const acts = availableActs(girl, { canTease: canTease(player) });
  for (const act of acts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.act = act.id;
    btn.dataset.label = act.label;
    btn.textContent = act.label;
    btn.disabled = !!talkBusy;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      sendTalkAct(act.id);
    });
    row.append(btn);
  }
  // 告白／求婚（互斥；條件不符則不顯示）
  if (!talkBusy) {
    if (canConfessGirl()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.romance = "confess";
      btn.textContent = "告白";
      btn.title = "消耗 1 花束 → 女友";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        void doConfess();
      });
      row.append(btn);
    } else if (canProposeGirl()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.romance = "propose";
      btn.textContent = "求婚";
      btn.title = "消耗戒指（50%）· 成功率＝感情/200";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        void doPropose();
      });
      row.append(btn);
    }
  }
  // 高失神／痙攣 → 脫衣／做愛 stub 入口（獨立場面，不是聊天台詞）
  if (highStunSceneUnlocked(girl)) {
    for (const kind of ["undress", "sex"]) {
      const stub = ROOM_SCENE_STUBS[kind];
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.scene = kind;
      btn.textContent = stub.title;
      btn.disabled = !!talkBusy;
      btn.title = "場面建置中";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        openRoomScene(kind);
      });
      row.append(btn);
    }
  }
}

function bindTalkActs() {
  const row = $("talk-acts");
  if (!row || row.dataset.bound) return;
  row.dataset.bound = "1";
  row.replaceChildren();
  ensurePlayerHint(row);
  refreshTalkActs();
}

function startIdleDecay() {
  stopIdleDecay();
  idleDecayTimer = window.setInterval(() => {
    if (!girl || !sheetOpen()) return;
    if (talkBusy) return;
    const now = Date.now();
    if (now - lastIdleDecayAt < 4000) return;
    lastIdleDecayAt = now;
    const sinceTease = now - (ensurePlayer(player).lastTeaseAt || 0);
    // 最近剛挑逗過則跳過一輪
    if (sinceTease < 5000) return;
    decayBodyIdle(girl);
    decayInvasion(girl);
    player = ensurePlayer(decayPlayerIdle(player)); // ensurePlayer 也會按小時回補精液
    renderBodyPanel();
    refreshTalkActs();
    persistRoom();
  }, 5000);
}

function stopIdleDecay() {
  if (idleDecayTimer) {
    clearInterval(idleDecayTimer);
    idleDecayTimer = 0;
  }
}


let sheetScrollY = 0;

function lockSheetScroll() {
  if (document.body.classList.contains("sheet-open")) return;
  sheetScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add("sheet-open");
  document.body.classList.add("sheet-open");
  document.body.style.top = `-${sheetScrollY}px`;
}

function unlockSheetScroll() {
  if (!document.body.classList.contains("sheet-open")) return;
  document.documentElement.classList.remove("sheet-open");
  document.body.classList.remove("sheet-open");
  document.body.style.top = "";
  window.scrollTo(0, sheetScrollY);
}

function showSheet() {
  const sheet = $("portrait-sheet");
  if (!sheet) return;
  sheet.hidden = false;
  lockSheetScroll();
  startIdleDecay();
  refreshTalkActs();
  if (!girl) {
    typeJob += 1;
    setTyping(false);
    if ($("portrait-name")) $("portrait-name").textContent = "還沒有人";
    if ($("portrait-meta")) $("portrait-meta").textContent = "先按「抽妹子」。";
    setTalkEnabled(false);
    paintHalfPortrait(null);
    return;
  }
  paintHalfPortrait(girl);
  openTalk();
}

function isFarewell(text) {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 24) return false;
  const line = raw.replace(/[。！!？?~～.…、,，\s]/g, "");
  return /掰+|拜拜|再見|先這樣|等一下?再聊|等等再聊|下次再聊|回頭再聊|先不聊|先別聊|先走了|晚安/.test(line);
}

const ROOM_SAVE_KEY = "yoro_test_room_session";

function rememberChat() {
  if (!girl) return;
  if (lines.length) {
    girl.chatLines = lines.slice(-40);
    girl.topicHint = topicHintFrom(lines);
  }
}

function endTalkSession() {
  if (!girl) return;
  // Soft-reset in-session LLM history; do not wipe affection/body/player names.
  girl.chatLines = [];
  girl.topicHint = "";
  girl.sessionEnded = true;
  girl.nameWait = "";
  if (girl.chatEnter !== "flee_back" && girl.chatEnter !== "summon") {
    girl.chatEnter = "reopen";
  }
}

function persistRoom() {
  if (!girl) return;
  try {
    player = ensurePlayer(player);
    const payload = {
      girl,
      player,
      lines: lines.length ? lines.slice(-40) : (girl.chatLines || []),
      talkFor: talkFor || girl.id || "",
      present: typeof window.RoomActor?.isPresent === "function" ? !!window.RoomActor.isPresent() : !sheIsOut(),
      savedAt: Date.now(),
    };
    localStorage.setItem(ROOM_SAVE_KEY, JSON.stringify(payload));
    syncProgressToGame(girl);
  } catch {
    /* quota / private mode */
  }
}

const ROOM_PROGRESS_KEY = "yoro_room_progress_sync";
const ROOM_PENDING_KEY = "yoro_room_pending_adopt";

/** Room↔roster durable fields (not ephemeral chatLines / topicHint / live lines). */
const ROOM_DURABLE_SCALARS = [
  "affection", "stage", "stageLock",
  "portrait", "comfyCkpt",
  "playerName", "playerNick", "playerPet",
  "petProposeCount", "petCoolUntil", "nameWait", "pendingPet",
  "chatEnter",
  "wifeUpPending", "datingUpPending",
  "noteChatTurns", "noteLastAskAt", "noteLastRecallAt", "noteLastTriviaAt",
  "loveTalkLastAt", "petNudgeLastAt",
];

function roomDurableDefined(v) {
  return v !== undefined;
}

/** Snapshot durable progress for roster write-back. */
function pickRoomDurableProgress(who) {
  if (!who) return null;
  const detail = {
    id: who.gameGirlId || who.id,
    at: Date.now(),
  };
  for (const k of ROOM_DURABLE_SCALARS) {
    if (roomDurableDefined(who[k])) detail[k] = who[k];
  }
  if (who.portraits && typeof who.portraits === "object") detail.portraits = who.portraits;
  if (who.world && typeof who.world === "object") detail.world = who.world;
  if (who.bodyState && typeof who.bodyState === "object") detail.bodyState = who.bodyState;
  if (who.body && typeof who.body === "object") detail.body = who.body;
  if (Array.isArray(who.friends)) detail.friends = who.friends;
  if (Array.isArray(who.playerNotes)) detail.playerNotes = who.playerNotes;
  if (who.topicCool && typeof who.topicCool === "object" && !Array.isArray(who.topicCool)) {
    detail.topicCool = who.topicCool;
  }
  return detail;
}

/**
 * Merge durable room session fields onto a roster-rolled girl.
 * Prefer prior (room / saved session) when present — room is newer after play.
 */
function mergeRoomGirlDurable(base, prior) {
  if (!base || typeof base !== "object") return base;
  if (!prior || typeof prior !== "object") return base;
  const out = { ...base };

  for (const k of ROOM_DURABLE_SCALARS) {
    if (!Object.prototype.hasOwnProperty.call(prior, k)) continue;
    if (!roomDurableDefined(prior[k])) continue;
    out[k] = prior[k];
  }

  // chatEnter: never let roster "summon" clobber flee_back from room prior
  if (prior.chatEnter === "flee_back") out.chatEnter = "flee_back";
  else if (prior.chatEnter) out.chatEnter = prior.chatEnter;

  if (prior.portraits && typeof prior.portraits === "object") {
    out.portraits = { ...(out.portraits || {}), ...prior.portraits };
  }
  if (prior.portrait) out.portrait = prior.portrait;

  if (prior.world && typeof prior.world === "object") out.world = prior.world;
  if (prior.bodyState && typeof prior.bodyState === "object") out.bodyState = prior.bodyState;
  if (prior.body && typeof prior.body === "object") out.body = prior.body;
  if (Array.isArray(prior.friends)) out.friends = prior.friends.slice();
  if (Array.isArray(prior.playerNotes)) out.playerNotes = prior.playerNotes.slice();
  if (prior.topicCool && typeof prior.topicCool === "object" && !Array.isArray(prior.topicCool)) {
    out.topicCool = { ...prior.topicCool };
  }
  return out;
}

function syncProgressToGame(who) {
  if (!who?.id || !(who.fromRoster || who.gameGirlId)) return;
  const detail = pickRoomDurableProgress(who);
  if (!detail?.id) return;
  // Keep legacy defaults so older listeners still see affection/stage/portraits/world
  if (detail.affection == null) detail.affection = who.affection || 0;
  if (!detail.stage) detail.stage = who.stage || "stranger";
  if (!detail.portraits) detail.portraits = who.portraits || {};
  if (detail.world === undefined) detail.world = who.world || null;
  try {
    localStorage.setItem(ROOM_PROGRESS_KEY, JSON.stringify(detail));
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent("yoro-room-progress", { detail }));
  } catch { /* ignore */ }
}

function takePendingAdopt() {
  try {
    const raw = localStorage.getItem(ROOM_PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(ROOM_PENDING_KEY);
    const data = JSON.parse(raw);
    if (!data?.girl?.id) return null;
    return data;
  } catch {
    return null;
  }
}


function ensureRoomRitualEl() {
  let el = $("room-summon-ritual");
  if (el) return el;
  const stage = $("main-room-stage") || document.body;
  el = document.createElement("div");
  el.id = "room-summon-ritual";
  el.className = "room-summon-ritual";
  el.hidden = true;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  stage.appendChild(el);
  return el;
}

function setSummonTalkBusy(busy) {
  const input = $("talk-input");
  const send = $("talk-send");
  const acts = $("talk-acts");
  const stage = $("main-room-stage");
  if (input) input.disabled = !!busy;
  if (send) send.disabled = !!busy;
  if (acts) acts.setAttribute("aria-disabled", busy ? "true" : "false");
  if (stage) stage.setAttribute("aria-busy", busy ? "true" : "false");
}

function beginSummonRitualUI() {
  const targets = [];
  const status = $("summon-status");
  if (status) targets.push(status);
  const ritual = ensureRoomRitualEl();
  if (ritual) {
    ritual.hidden = false;
    if (!targets.includes(ritual)) targets.push(ritual);
  }
  const stops = targets.map((el) => startSummonRitualStatus(el));
  setSummonTalkBusy(true);
  return () => {
    for (const stop of stops) {
      try { stop(); } catch { /* */ }
    }
    if (ritual) ritual.hidden = true;
    setSummonTalkBusy(false);
  };
}

/** 名冊付費召喚：把遊戲妹子放進房間（同 id） */
async function adoptRosterGirl(payload) {
  const rolled = payload?.girl;
  if (!rolled?.id) return false;
  if (summoning) return false;
  summoning = true;
  let stopRitual = () => {};
  try {
    // Same-id room prior (live girl or saved session) is newer after play — merge durables
    let prior = null;
    if (girl?.id === rolled.id) prior = girl;
    if (!prior) {
      try {
        const saved = loadRoomSave();
        if (saved?.girl?.id === rolled.id) prior = saved.girl;
      } catch { /* ignore */ }
    }
    let next = {
      ...rolled,
      fromRoster: true,
      gameGirlId: rolled.gameGirlId || rolled.id,
      chatEnter: rolled.chatEnter || "summon",
    };
    if (prior) {
      next = mergeRoomGirlDurable(next, prior);
      if (prior.chatEnter === "flee_back") next.chatEnter = "flee_back";
    } else if (rolled.world) {
      next.world = rolled.world;
    }
    girl = next;
    if (!girl.portraits || typeof girl.portraits !== "object") girl.portraits = {};
    ensureBody(girl);
    ensureFriends(girl);
    ensurePlayerNotes(girl);
    normalizeGirlTags(girl);
    syncStage(girl);
    player = ensurePlayer(player);
    if (payload.playerName && !player.name) player.name = payload.playerName;
    lines = [];
    talkFor = "";
    activityOpen = false;
    workToken += 1;
    typeJob += 1;
    window.RoomActor?.setPresent(true);
    armRoomVisit(girl);
    clearRoomSave();
    persistRoom();
    if (sheetOpen()) hideSheet();
    renderCard();
    renderWorld();
    renderDebug();

    stopRitual = beginSummonRitualUI();

    try {
      await ensureGirlComfyCkpt(girl);
    } catch (err) {
      console.warn("[ensureGirlComfyCkpt]", err?.message || err);
    }

    try {
      await pregenGirlPortraits(girl, { force: true });
    } catch (err) {
      console.warn("[adoptRosterGirl pregen]", err?.message || err);
    }

    stopRitual();
    stopRitual = () => {};
    const finalLine = `「${girl.name}」已降臨。長按她說話。`;
    if ($("summon-status")) $("summon-status").textContent = finalLine;
    const ritualEl = $("room-summon-ritual");
    if (ritualEl) {
      ritualEl.hidden = true;
      ritualEl.textContent = "";
    }

    if (isShipMode()) {
      try { showSheet(); } catch { /* DOM not ready */ }
    }
    return true;
  } finally {
    try { stopRitual(); } catch { /* */ }
    summoning = false;
    setSummonTalkBusy(false);
  }
}

function isShipMode() {
  try {
    return new URLSearchParams(location.search).get("ship") === "1"
      || document.body.classList.contains("room-ship")
      || document.body.classList.contains("room-home");
  } catch {
    return document.body.classList.contains("room-ship")
      || document.body.classList.contains("room-home");
  }
}

function applyShipChrome() {
  if (!isShipMode()) return;
  // 嵌進 index 用 room-home；獨立 /test_room?ship=1 用 room-ship
  if (!document.body.classList.contains("room-home")) {
    document.body.classList.add("room-ship");
    document.documentElement.classList.add("room-ship");
    const shipBack = $("ship-back");
    if (shipBack) shipBack.hidden = false;
  }
  // 隱藏沙盒／除錯：抽妹子、身體面板、戀愛道具除錯、bond-debug
  for (const id of [
    "bond-debug", "body-panel", "romance-items",
  ]) {
    const el = $(id);
    if (el) el.hidden = true;
  }
  const editorSummon = document.querySelector(".summon-panel");
  if (editorSummon) editorSummon.hidden = true;
  const note = document.querySelector(".summon-panel .note");
  if (note) note.hidden = true;
  // 頂部狀態卡（緊湊）：用 girl-where / mood 當上卡帶
  const back = document.querySelector("#room-editor .back");
  if (back) {
    back.textContent = "← 萬事屋";
    back.setAttribute("href", "/");
  }
}

function clearRoomSave() {
  try { localStorage.removeItem(ROOM_SAVE_KEY); } catch { /* ignore */ }
}

function loadRoomSave() {
  try {
    const raw = localStorage.getItem(ROOM_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.girl?.id) return null;
    return data;
  } catch {
    return null;
  }
}

function hideSheet() {
  // 先收 stub 場面，避免 overlay 懸在已關閉的對話上
  if (sceneOpen() || activeRoomScene) closeRoomScene();
  typeJob += 1;
  setTyping(false);
  talkBusy = false;
  endTalkSession();
  lines = [];
  talkFor = "";
  resetPortraitEntrance();
  clearActionFlash();
  $("portrait-sheet").hidden = true;
  unlockSheetScroll();
  stopIdleDecay();
  persistRoom();
  refreshTalkActs();
  try {
    window.dispatchEvent(new CustomEvent("yoro-room-sheet-close", {
      detail: girl ? { id: girl.gameGirlId || girl.id } : null,
    }));
  } catch { /* ignore */ }
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

async function makeGirl() {
  await loadPools();
  const rolled = generateGirl({
    luck: 10 + Math.floor(Math.random() * 46),
    rating: "nsfw",
    usedNames: girl?.name ? [girl.name] : [],
  });
  if (!rolled?.name) throw new Error("generateGirl 回傳空");
  const out = {
    ...rolled,
    id: `cd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    affection: 0,
    stage: "stranger",
    chatEnter: "first",
    ntr: null,
    summoner: null,
    portraits: {},
    portrait: null,
    crave: { v: 10 + Math.floor(Math.random() * 20), at: Date.now() },
  };
  ensureBody(out);
  ensurePlayerNotes(out);
  await ensureGirlComfyCkpt(out);
  return out;
}

async function drawGirl() {
  if (pending) return;
  pending = true;
  $("draw-girl").disabled = true;
  $("summon-status").textContent = "抽人設…";
  try {
    const rolled = await makeGirl();
    girl = rolled;
    window.RoomActor?.setPresent(true);
    lines = [];
    talkFor = "";
    clearRoomSave();
    persistRoom();
    activityOpen = false;
    workToken += 1;
    typeJob += 1;
    if (sheetOpen()) hideSheet();
    renderCard();
    renderWorld();
    const ckptBit = rolled.comfyCkpt && roomImgProvider === "comfy"
      ? ` · 模型 ${shortCkptName(rolled.comfyCkpt)}` : "";
    const stopRitual = beginSummonRitualUI();
    try {
      await pregenGirlPortraits(rolled, { force: true });
      if (girl && girl.id === rolled.id) {
        $("summon-status").textContent = `「${rolled.name}」已降臨${ckptBit}。長按房間裡的她跟她說話，或讓她離開。`;
      }
    } catch (err) {
      console.warn("[draw-girl pregen]", err?.message || err);
      if ($("summon-status")) {
        $("summon-status").textContent = `抽到了${rolled.name}${ckptBit}。預產未完成：${err?.message || err}`;
      }
    } finally {
      try { stopRitual(); } catch { /* */ }
      const ritualEl = $("room-summon-ritual");
      if (ritualEl) { ritualEl.hidden = true; ritualEl.textContent = ""; }
    }
  } catch (err) {
    $("summon-status").textContent = err?.message || String(err);
  }
  pending = false;
  $("draw-girl").disabled = false;
}

const TONE_LABEL = { normal: "普通", whimsical: "天馬行空", eerie: "詭異" };

function homePrompt(who, region, choices) {
  const list = choices.map((home, index) => `${index + 1}. ${home.name}（${TONE_LABEL[home.tone]}）`).join("\n");
  return [
    "你在替她決定離開之後住哪。只能從下面選一間。",
    "普通、天馬行空、詭異都可以，依她的個性挑最像她會住的。不要因為普通就優先。",
    "只回一個數字，對應選項編號。不要解釋。",
    `她是${who.name}。個性：${personaBlurb(who)}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
    hereNow(who) || `人在日本的${region.name}。`,
    list,
  ].filter(Boolean).join("\n");
}

function parseNumberedChoice(text, choices) {
  const raw = cleanLine(text);
  if (!raw) return null;
  if (raw.length <= 16) {
    const match = raw.match(/[1-9]/);
    if (match) return choices[Number(match[0]) - 1] || null;
  }
  const lone = raw.split(/\n/).map((line) => line.trim()).reverse().find((line) => /^[1-9]$/.test(line));
  if (lone) return choices[Number(lone) - 1] || null;
  const named = choices.filter((choice) => raw.includes(choice.name));
  return named.length === 1 ? named[0] : null;
}

async function askHome(who, region, choices) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: "你只負責從給定的住所裡選一間。只輸出編號。" },
    { role: "user", content: homePrompt(who, region, choices) },
  ];
  const reply = route.provider === "ollama"
    ? await askOllama(route, messages)
    : await askGrok(route, messages, `roomhome:${who.id}:${Date.now().toString(36)}`);
  const home = parseNumberedChoice(reply, choices);
  if (!home) throw new Error("模型沒有選到選項");
  return home;
}

const JOB_TONE = { normal: "普通", uncommon: "少見", eerie: "詭異" };

function jobPrompt(who, region, choices) {
  const list = choices.map((job, index) => `${index + 1}. ${job.name}（${JOB_TONE[job.tone]}）`).join("\n");
  return [
    "你在替她決定這次打工做哪一份。只能從下面選一項。",
    "普通、少見、詭異都可以，依她的個性挑最像她會去做的。不要因為普通就優先。",
    "只回一個數字，對應選項編號。不要解釋。",
    `她是${who.name}。個性：${personaBlurb(who)}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
    hereNow(who),
    `住在${who.world?.home?.name || "某處"}。`,
    list,
  ].filter(Boolean).join("\n");
}

async function askJob(who, region, choices) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: "你只負責從給定的打工裡選一份。只輸出編號。" },
    { role: "user", content: jobPrompt(who, region, choices) },
  ];
  const reply = route.provider === "ollama"
    ? await askOllama(route, messages)
    : await askGrok(route, messages, `roomjob:${who.id}:${Date.now().toString(36)}`);
  const job = parseNumberedChoice(reply, choices);
  if (!job) throw new Error("模型沒有選到工作");
  return job;
}

function clearShift() {
  workToken += 1;
  if (!girl?.world) return;
  girl.world.activity = null;
  girl.world.shift = null;
  girl.world.stroll = null;
  activityOpen = false;
}

function sendHerOutAgain() {
  clearShift();
  activityOpen = false;
  clearRoomVisit(girl);
  if (girl.chatEnter !== "flee_back") girl.chatEnter = "summon";
  window.RoomActor?.setPresent(false);
  if (sheetOpen()) hideSheet();
  renderCard();
  renderWorld();
  persistRoom();
  // 回住處：安靜離場，不特別提示
}

function summonHerBack() {
  // 有 world 且人在外即可召回；住處未定也允許（找房／ensure 仍只在離房／逃離時做）
  if (!girl?.world || !sheIsOut()) return;
  clearShift();
  girl.world.justBack = true;
  if (girl.chatEnter !== "flee_back") girl.chatEnter = "summon";
  girl.chatLines = [];
  girl.topicHint = "";
  girl.sessionEnded = true;
  lines = [];
  talkFor = "";
  renderDebug();
  window.RoomActor?.setPresent(true);
  armRoomVisit(girl);
  renderCard();
  renderWorld();
  persistRoom();
  $("summon-status").textContent = `${girl.name}被召喚回房間了。`;
}

function pickRandomHome(choices = sampleHomes()) {
  return choices[Math.floor(Math.random() * choices.length)] || HOMES[0];
}

function assignHome(who, home) {
  if (!who?.world || !home) return;
  who.world.home = { id: home.id, name: home.name };
  who.world.homeSince = Date.now();
  // 找到住處後再等一小時才開始自動打工／亂逛
  who.world.lastAutoActivityAt = Date.now();
  if (!who.world.mood) setMood(who, "平靜");
}

/** 半狀態（有 world 無 home）時立刻補住所，避免卡在「正在決定她住哪」。 */
function ensureWorldHome(who) {
  if (!who?.world) return null;
  if (who.world.home?.id && who.world.home?.name) return who.world.home;
  assignHome(who, pickRandomHome());
  return who.world.home;
}

/**
 * 打工／亂逛完成時推進有孕 tick，並依機率判定生產→妻子安頓留下／其餘被父親帶走。
 * 同趟剛懷孕（ticks 仍為 0 且 caller 應略過）不應呼叫；呼叫端在 !pregnantNew 時才叫。
 * Birth chance = min(0.50, 0.12 + ticks * 0.10)（tick1≈22%、tick2≈32%、tick3≈42%、tick4+→50%）。
 */
async function tickPregnancyTowardBirth(who) {
  if (!who?.world?.pregnancy) return false;
  const preg = who.world.pregnancy;
  preg.ticks = (preg.ticks | 0) + 1;
  const chance = Math.min(0.50, 0.12 + preg.ticks * 0.10);
  pushDebug(`有孕進度 tick=${preg.ticks}　生產機率 ${Math.round(chance * 100)}%`);
  if (Number(Math.random()) < chance) {
    await resolvePregnancyBirth(who);
    return true;
  }
  return false;
}

/** 妻子階生產：留下，強制扣金幣安頓小孩，清懷孕標記。 */
function settleChildWithWife(who) {
  const preg = who?.world?.pregnancy;
  if (!preg) return { spent: 0, dad: "對方", goldLeft: 0 };
  const dad = preg.fatherName || "對方";
  player = ensurePlayer(player);
  const before = player.gold | 0;
  player.gold = Math.max(0, before - CHILD_SETTLE_GOLD);
  const actualSpent = before - (player.gold | 0);
  if (!who.world.children) who.world.children = [];
  who.world.children.push({
    at: Date.now(),
    fatherName: dad,
    fatherRole: preg.fatherRole || "",
    settledGold: CHILD_SETTLE_GOLD,
  });
  who.world.pregnancy = null;
  try {
    ensureBody(who);
    if (who.bodyState?.organs?.uterus) who.bodyState.organs.uterus.semen = 0;
  } catch { /* ignore */ }
  return { spent: actualSpent, dad, goldLeft: player.gold | 0 };
}

/** 生產：妻子→安頓留下；其餘→被父親帶走。 */
async function resolvePregnancyBirth(who) {
  if (!who?.world?.pregnancy) return;
  const name = who.name || "她";
  const dad = who.world.pregnancy.fatherName || "對方";
  const role = who.world.pregnancy.fatherRole || "";
  if (isWifeStage(who.stage)) {
    const { spent, goldLeft } = settleChildWithWife(who);
    const short = spent < CHILD_SETTLE_GOLD
      ? `（金幣不足，仍強制安頓；現有 ${goldLeft} 金）`
      : `（−${CHILD_SETTLE_GOLD} 金，剩 ${goldLeft} 金）`;
    const times = breedingSuccessCount(who);
    const msg = `${name}生產了，但身為妻子留下。強制花費 ${CHILD_SETTLE_GOLD} 金安頓小孩${short}。配種成功對象：${dad}。現為配種成功 ×${times}。`;
    rememberMoment(who, {
      event: msg,
      pregnant: false,
      breeding: `配種成功 ×${times}`,
      personName: dad,
      roleName: role,
    });
    pushDebug(msg);
    const status = $("summon-status");
    if (status) status.textContent = msg;
    const lead = $("world-lead");
    if (lead && !lead.hidden) lead.textContent = msg;
    renderMood();
    renderRomanceItems();
    renderBodyPanel();
    renderWorld();
    renderDebug();
    persistRoom();
    return;
  }
  const msg = `${name}生產了，被${dad}帶走了。`;
  rememberMoment(who, {
    event: msg,
    pregnant: true,
    breeding: `配種成功（${dad}）`,
    personName: dad,
    roleName: role,
  });
  pushDebug(msg);
  const status = $("summon-status");
  if (status) status.textContent = msg;
  const lead = $("world-lead");
  if (lead && !lead.hidden) lead.textContent = msg;
  takeAwayByFather(who);
}

/**
 * 被父親帶走：關對話、離場、清活動，girl=null 並清存檔——本趟不可再召喚同一懷孕狀態。
 * 沙盒房間，不碰主遊戲 sim.py 名冊。
 */
function takeAwayByFather(who) {
  if (!who) return;
  closeTalkForLeave();
  workToken += 1;
  activityOpen = false;
  if (who.world) {
    who.world.pregnancy = null;
    who.world.activity = null;
    who.world.shift = null;
    who.world.stroll = null;
  }
  window.RoomActor?.setPresent(false);
  if (girl === who) girl = null;
  lines = [];
  talkFor = "";
  clearRoomSave();
  renderCard();
  renderWorld();
  renderRomanceItems();
  renderBodyPanel();
  renderDebug();
}

/** 逃離／強制離房時先關對話與座位鎖，讓房間可再操作。 */
function closeTalkForLeave() {
  if (sheetOpen()) hideSheet();
  else {
    talkBusy = false;
    typeJob += 1;
    setTyping(false);
    if (sceneOpen() || activeRoomScene) closeRoomScene();
  }
}

/** 侵犯值滿：清侵犯、關對話、趕出房間（需再召喚或再抽）。 */
async function fleeRoomFromInvasion() {
  if (!girl) return;
  const who = girl;
  const name = who.name;
  who.chatEnter = "flee_back";
  clearInvasion(who);
  // 先關對話／busy／scroll lock，再趕人——避免房間被鎖、找地點卡住
  closeTalkForLeave();
  window.RoomActor?.setPresent(false);
  activityOpen = false;

  if (who.world?.home) {
    clearShift();
    renderCard();
    renderWorld();
    persistRoom();
    $("summon-status").textContent = `${name}因侵犯感過重逃離了房間。可再召喚回來。`;
    return;
  }
  if (who.world) {
    // 半狀態：補住所後離房，勿停在「正在決定她住哪」且召喚鍵被藏
    ensureWorldHome(who);
    clearShift();
    renderCard();
    renderWorld();
    persistRoom();
    const region = placedRegion();
    const homeName = who.world.home?.name || "某處";
    $("summon-status").textContent = region
      ? `${name}因侵犯感過重逃離了房間，人在日本的${region.name}，住在${homeName}。可再召喚回來。`
      : `${name}因侵犯感過重逃離了房間。可再召喚回來。`;
    return;
  }
  // 尚無 world：同步安置日本＋隨機住所（逃離不等人模選房）
  await letHerLeave({ instantHome: true });
  if ($("summon-status")) {
    $("summon-status").textContent = `${name}因侵犯感過重逃離了房間，人已回到日本。可再召喚回來。`;
  }
}


function parseShiftReply(text, know) {
  const cleaned = cleanLine(text);
  if (!cleaned) return null;
  const match = cleaned.match(/名字[:：]\s*([^\n。，,]{1,16})/);
  const name = know && match ? match[1].replace(/[。．.\s]+$/g, "").trim() : "";
  let event = cleaned;
  if (match) event = event.replace(match[0], "");
  event = event.replace(/^事件[:：]\s*/gm, "").trim();
  if (!event) return null;
  return { name, event };
}

function isInteraction(event) {
  const text = String(event || "");
  return /我/.test(text) && /他|她|對方|同事|顧客/.test(text);
}

function shiftPrompt(who, region, rolled, know, opts = {}) {
  const revisit = opts.revisit || null;
  const advanced = opts.bondAdvanced || "";
  const newGender = opts.newGender || "";
  const sexIntensity = opts.sexIntensity || "";
  let meeting;
  if (rolled.scp) {
    meeting = scpBrief(rolled.scp);
  } else if (revisit) {
    meeting = friendRevisitPrompt(revisit, advanced, sexIntensity);
  } else if (know) {
    meeting = [
      "這次她會因此認識對方。第一行只寫「名字：」加一個日本名字，換行後再寫互動。",
      friendGenderPrompt(newGender),
    ].filter(Boolean).join("");
  } else {
    meeting = "這次只是碰上，還不算認識對方。不要替對方取名字。";
  }
  const roleName = revisit?.role || rolled.role.name;
  const whoLine = revisit
    ? `對方是已經認識的${revisit.name}（${roleName}），情緒是${rolled.emotion.name}。情緒要出現在對方對我的反應裡，不要單獨標註。`
    : `對方是${roleName}，情緒是${rolled.emotion.name}。情緒要出現在對方對我的反應裡，不要單獨標註。`;
  return [
    `你是${who.name}。用「我」寫剛剛和這位${roleName}的互動，2到4句。`,
    "必須是兩個人的來回：我先說或先做，對方一定要有動作或回話，我再接一句。",
    "不能只寫我一個人看到的場面，也不能只寫對方。不要標題，不要列選項，不要提到遊戲或抽籤。",
    meeting,
    `個性：${personaBlurb(who)}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
    hereNow(who),
    `打工是${who.world.job.name}。`,
    whoLine,
    `互動只沿著這個方向：${rolled.act.name}。細節自己編，但兩邊都要出場。`,
  ].filter(Boolean).join("\n");
}

async function askShift(who, region, rolled, know, opts = {}) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: "你只寫她和對方的互動。沒有對方的反應就不算寫完。" },
    { role: "user", content: shiftPrompt(who, region, rolled, know, opts) },
  ];
  const once = () => (route.provider === "ollama"
    ? askOllama(route, messages)
    : askGrok(route, messages, `roomshift:${who.id}:${Date.now().toString(36)}`));
  let reply = await once();
  let written = parseShiftReply(reply, know);
  if (!written || !isInteraction(written.event)) {
    if (reply) messages.push({ role: "assistant", content: reply });
    messages.push({ role: "user", content: "上一則不是兩個人的互動。用「我」重寫：我先說或先做，對方一定要回話或有動作，我再接一句。2到4句。" });
    reply = await once();
    written = parseShiftReply(reply, know);
  }
  if (!written || !isInteraction(written.event)) throw new Error("模型沒有寫成互動");
  return written;
}

async function runShift(who, region) {
  const token = ++workToken;
  const rolled = rollShift();
  const scp = rollWorkScp(who.world.scpSteps);
  if (scp) {
    rolled.scp = scp;
    rolled.act = { id: scp.id, name: scp.title, know: false };
  }
  ensureFriends(who);
  let revisit = null;
  let bondResult = null;
  let know = false;
  let newGender = "";
  if (!rolled.scp && shouldRevisitFriend(who)) {
    revisit = pickRevisitFriend(who, rolled.role.name);
  }
  if (revisit) {
    bondResult = advanceFriendOnRevisit(who, revisit);
  } else {
    know = rollBefriend(who, rolled.act);
    if (know) newGender = rollFriendGender(rolled.role.name);
  }
  const sexKindEarly = revisit ? friendSexEventKind(bondResult) : "";
  let sexIntensity = "";
  if (sexKindEarly) {
    sexIntensity = rollFriendSexIntensity();
    who.world._pendingFriendSex = {
      intensity: sexIntensity,
      friendName: revisit.name,
      kind: sexKindEarly,
    };
  }
  const promptOpts = {
    revisit,
    bondAdvanced: bondResult?.advanced || "",
    newGender,
    sexIntensity,
  };
  const roleName = revisit?.role || rolled.role.name;
  who.world.activity = "work";
  who.world.shift = { pending: true, roleName, emotionName: rolled.emotion.name, toneName: scp ? scpLabel(scp) : "" };
  renderWorld();
  $("summon-status").textContent = `${who.name}在${who.world.job.name}開始工作。`;
  let written = null;
  let pickedByModel = true;
  try {
    written = await askShift(who, region, rolled, know, promptOpts);
  } catch {
    pickedByModel = false;
    written = {
      name: know ? `那位${roleName}` : "",
      event: rolled.scp
        ? `我在打工時看見${rolled.act.name}，那位${roleName}也注意到了，我們都沒有再靠近。`
        : revisit
        ? `我在打工又碰到${revisit.name}，對方情緒是${rolled.emotion.name}，也回了我。我們${rolled.act.name}，我又接了一句。`
        : `我先跟那位${roleName}開口，對方情緒是${rolled.emotion.name}，也回了我。我們${rolled.act.name}，我又接了一句，對方有反應。`,
    };
  }
  if (token !== workToken || girl !== who || who.world?.activity !== "work") return;
  const personName = revisit
    ? revisit.name
    : (know ? (written.name || `那位${roleName}`) : "");
  who.world.shift = {
    pending: false,
    roleName,
    emotionName: rolled.emotion.name,
    toneName: rolled.scp ? scpLabel(rolled.scp) : "",
    event: written.event,
    known: know,
    revisit: !!revisit,
    personName,
    bond: revisit ? (revisit.bond || "") : (know ? "acquaintance" : ""),
    bondAdvanced: bondResult?.advanced || "",
  };
  if (rolled.scp) noteScpStep(who, rolled.scp);
  if (know) addFriend(who, { name: personName, role: rolled.role.name, gender: newGender });
  setMood(who, moodFromShift(rolled));
  const sexKindShift = revisit ? friendSexEventKind(bondResult) : "";
  let aftermathShift = null;
  if (sexKindShift) {
    aftermathShift = applyFriendPhysicalAftermath(who, revisit, sexKindShift, Math.random, { intensity: sexIntensity });
    who.world.shift.sexIntensity = aftermathShift?.intensity || sexIntensity || "";
    who.world.shift.spasm = !!aftermathShift?.spasm;
    who.world.shift.pregnant = !!aftermathShift?.pregnantNew;
  }
  rememberShift(who, rolled, written.event, know, personName, {
    revisit: !!revisit,
    roleName,
    bond: who.world.shift.bond,
    bondAdvanced: bondResult?.advanced || "",
    sexIntensity: who.world.shift.sexIntensity || "",
    spasm: !!who.world.shift.spasm,
    pregnant: !!who.world.shift.pregnant,
  });
  // 有孕推進：同趟剛懷孕略過；否則 tick 後可能生產被帶走
  if (who.world?.pregnancy && !aftermathShift?.pregnantNew) {
    const born = await tickPregnancyTowardBirth(who);
    if (born || girl !== who) return;
  }
  renderWorld();
  renderBodyPanel();
  renderDebug();
  persistRoom();
  const again = revisit ? `又碰到${revisit.name}` : `碰到一位${roleName}`;
  const sexStatus = friendSexStatusTail(aftermathShift);
  $("summon-status").textContent = pickedByModel
    ? `${who.name}在${who.world.job.name}${rolled.scp ? `遇到${rolled.scp.code}，` : ""}${again}。${sexStatus}`
    : `${who.name}在${who.world.job.name}${rolled.scp ? `遇到${rolled.scp.code}，` : ""}${again}。模型沒寫成，這段是先補的。${sexStatus}`;
}

const STROLL_TONE_RULE = {
  daily: "這是日常。寫平常會發生的小事，不要寫成奇遇，也不要寫成恐怖。",
  wonder: "這是奇遇。寫一件不太該那麼巧、但還不恐怖的事。不要寫鬼，不要寫血腥。",
  horror: "這是詭異恐怖。寫讓人不安、說不清的事。停在害怕。不要寫血腥、傷口、傷害過程或獵奇細節。",
  scp: "這是一次異常。寫撞見的那一刻。不要寫收容程序，不要寫血腥。",
};

function strollPrompt(who, region, rolled, know, opts = {}) {
  const place = rolled.place.name;
  const toneRule = STROLL_TONE_RULE[rolled.tone.id];
  const revisit = opts.revisit || null;
  const advanced = opts.bondAdvanced || "";
  const newGender = opts.newGender || "";
  const sexIntensity = opts.sexIntensity || "";
  if (!rolled.person && !revisit) {
    return [
      `你是${who.name}。用「我」寫在${place}亂逛時發生的事，2到4句。`,
      hereNow(who),
      rolled.scp ? scpBrief(rolled.scp) : toneRule,
      "這趟沒有特定的人。不要寫出一個跟你一來一往、還被你認識的對象。",
      "不要標題，不要列選項，不要提到遊戲或抽籤。",
      `個性：${personaBlurb(who)}。`,
      who.tone ? `語氣：${who.tone}` : "",
      who.quirk || "",
      `事情只沿著這個方向：${rolled.act.name}。細節自己編，但要發生在${place}。`,
    ].filter(Boolean).join("\n");
  }
  let meeting;
  if (revisit) {
    meeting = friendRevisitPrompt(revisit, advanced, sexIntensity);
  } else if (know) {
    meeting = [
      "這次她會因此認識對方。第一行只寫「名字：」加一個日本名字，換行後再寫互動。",
      friendGenderPrompt(newGender),
    ].filter(Boolean).join("");
  } else {
    meeting = "這次只是碰上，還不算認識對方。不要替對方取名字。";
  }
  const roleName = revisit?.role || "路人";
  const whoLine = revisit
    ? `對方是已經認識的${revisit.name}（${roleName}），情緒是${rolled.emotion.name}。情緒要出現在對方對我的反應裡，不要單獨標註。`
    : `對方是路人，情緒是${rolled.emotion.name}。情緒要出現在對方對我的反應裡，不要單獨標註。`;
  return [
    `你是${who.name}。用「我」寫在${place}亂逛時，和這位${roleName}的互動，2到4句。`,
    hereNow(who),
    rolled.scp ? scpBrief(rolled.scp) : toneRule,
    "必須是兩個人的來回：我先說或先做，對方一定要有動作或回話，我再接一句。",
    "不能只寫我一個人看到的場面。不要標題，不要列選項，不要提到遊戲或抽籤。這不是打工。",
    meeting,
    `個性：${personaBlurb(who)}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
    `人就在${place}。不要改到別的地方。`,
    whoLine,
    `互動只沿著這個方向：${rolled.act.name}。細節自己編，但兩邊都要出場。`,
  ].filter(Boolean).join("\n");
}

function isSoloStroll(event, placeName) {
  return /我/.test(event) && String(event).includes(placeName);
}

async function askStroll(who, region, rolled, know, opts = {}) {
  const route = await gameChatRoute();
  const hasPerson = !!(rolled.person || opts.revisit);
  const messages = [
    { role: "system", content: hasPerson ? "你只寫她和對方的互動。沒有對方的反應就不算寫完。" : "你只寫她一個人在那個地方亂逛的經過。不要硬加一個認識的人。" },
    { role: "user", content: strollPrompt(who, region, rolled, know, opts) },
  ];
  const once = () => (route.provider === "ollama"
    ? askOllama(route, messages)
    : askGrok(route, messages, `roomstroll:${who.id}:${Date.now().toString(36)}`));
  const accept = (written) => written && (hasPerson ? isInteraction(written.event) : isSoloStroll(written.event, rolled.place.name));
  let reply = await once();
  let written = parseShiftReply(reply, know);
  if (!accept(written)) {
    if (reply) messages.push({ role: "assistant", content: reply });
    messages.push({ role: "user", content: hasPerson
      ? "上一則不是兩個人的互動。用「我」重寫：我先說或先做，對方一定要回話或有動作，我再接一句。2到4句。"
      : `上一則不像在${rolled.place.name}自己走。用「我」重寫，一定要提到${rolled.place.name}，不要加一個認識的人。2到4句。` });
    reply = await once();
    written = parseShiftReply(reply, know);
  }
  if (!accept(written)) throw new Error("模型沒有寫成亂逛");
  return written;
}

async function runStroll(who, region) {
  const token = ++workToken;
  const rolled = rollStroll();
  const spot = who.world.ground?.spots?.[rolled.place.id] || rolled.place.name;
  rolled.place = { ...rolled.place, name: spot };
  const scp = rollPlaceScp(who.world.ground, who.world.scpSteps);
  if (scp) {
    rolled.scp = scp;
    rolled.tone = { id: "scp", name: scpLabel(scp) };
    rolled.act = { id: scp.id, name: scp.title, know: false };
  }
  ensureFriends(who);
  let revisit = null;
  let bondResult = null;
  let know = false;
  let newGender = "";
  // 有人場景（或可改成再碰面）才走朋友線
  if (!rolled.scp && rolled.person && shouldRevisitFriend(who)) {
    revisit = pickRevisitFriend(who, "路人");
  }
  if (revisit) {
    bondResult = advanceFriendOnRevisit(who, revisit);
    rolled.person = true;
    if (!rolled.emotion) {
      rolled.emotion = { id: "joy", name: "喜" };
    }
  } else if (rolled.person) {
    know = rollBefriend(who, rolled.act);
    if (know) newGender = rollFriendGender("路人");
  }
  const sexKindEarlyStroll = revisit ? friendSexEventKind(bondResult) : "";
  let sexIntensity = "";
  if (sexKindEarlyStroll) {
    sexIntensity = rollFriendSexIntensity();
    who.world._pendingFriendSex = {
      intensity: sexIntensity,
      friendName: revisit.name,
      kind: sexKindEarlyStroll,
    };
  }
  const promptOpts = {
    revisit,
    bondAdvanced: bondResult?.advanced || "",
    newGender,
    sexIntensity,
  };
  const roleName = revisit?.role || (rolled.person ? "路人" : "");
  who.world.activity = "wander";
  who.world.shift = null;
  who.world.stroll = { pending: true, placeName: rolled.place.name, toneName: rolled.tone.name };
  renderWorld();
  $("summon-status").textContent = `${who.name}在日本的${region.name}亂逛，走到${rolled.place.name}。`;
  let written = null;
  let pickedByModel = true;
  try {
    written = await askStroll(who, region, rolled, know, promptOpts);
  } catch {
    pickedByModel = false;
    const tail = rolled.scp
      ? "我沒有再靠近。"
      : rolled.tone.id === "horror"
      ? "心裡發毛，沒有再靠近。"
      : rolled.tone.id === "wonder"
        ? "事情巧得有點過分。"
        : "待了一會兒就繼續走。";
    written = (rolled.person || revisit)
      ? {
        name: know ? "那位路人" : "",
        event: revisit
          ? `我在${rolled.place.name}又碰到${revisit.name}，對方情緒是${rolled.emotion?.name || "平靜"}，也回了我。我們${rolled.act.name}，我又接了一句。${tail}`
          : `我在${rolled.place.name}先跟那位路人開口，對方情緒是${rolled.emotion.name}，也回了我。我們${rolled.act.name}，我又接了一句。${tail}`,
      }
      : { name: "", event: `我在${rolled.place.name}${rolled.act.name}，${tail}` };
  }
  if (token !== workToken || girl !== who || who.world?.activity !== "wander") return;
  const personName = revisit
    ? revisit.name
    : (know ? (written.name || "那位路人") : "");
  who.world.stroll = {
    pending: false,
    placeName: rolled.place.name,
    toneName: rolled.tone.name,
    roleName,
    emotionName: rolled.emotion?.name || "",
    event: written.event,
    known: know,
    revisit: !!revisit,
    personName,
    bond: revisit ? (revisit.bond || "") : (know ? "acquaintance" : ""),
    bondAdvanced: bondResult?.advanced || "",
  };
  if (rolled.scp) noteScpStep(who, rolled.scp);
  if (know) addFriend(who, { name: personName, role: "路人", gender: newGender });
  setMood(who, moodFromStroll(rolled));
  const sexKindStroll = revisit ? friendSexEventKind(bondResult) : "";
  let aftermathStroll = null;
  if (sexKindStroll) {
    aftermathStroll = applyFriendPhysicalAftermath(who, revisit, sexKindStroll, Math.random, { intensity: sexIntensity });
    who.world.stroll.sexIntensity = aftermathStroll?.intensity || sexIntensity || "";
    who.world.stroll.spasm = !!aftermathStroll?.spasm;
    who.world.stroll.pregnant = !!aftermathStroll?.pregnantNew;
  }
  rememberMoment(who, {
    placeName: rolled.place.name,
    toneName: rolled.tone.name,
    roleName,
    emotionName: rolled.emotion?.name || "",
    event: written.event,
    known: know,
    personName,
    revisit: !!revisit,
    bond: who.world.stroll.bond,
    bondAdvanced: bondResult?.advanced || "",
    sexIntensity: who.world.stroll.sexIntensity || "",
    spasm: !!who.world.stroll.spasm,
    pregnant: !!who.world.stroll.pregnant,
  });
  // 有孕推進：同趟剛懷孕略過；否則 tick 後可能生產被帶走
  if (who.world?.pregnancy && !aftermathStroll?.pregnantNew) {
    const born = await tickPregnancyTowardBirth(who);
    if (born || girl !== who) return;
  }
  renderWorld();
  renderBodyPanel();
  renderDebug();
  persistRoom();
  const where = `${who.name}在${rolled.place.name}遇到${rolled.tone.name}`;
  const met = revisit
    ? `，又碰到${revisit.name}。`
    : rolled.person
    ? "，碰到一位路人。"
    : "。";
  const sexStatus = friendSexStatusTail(aftermathStroll);
  const sexTail = sexStatus ? sexStatus : "";
  $("summon-status").textContent = pickedByModel
    ? `${where}${met}${sexTail}`
    : `${where}${met}模型沒寫成，這段是先補的。${sexTail}`;
}

function startLifeLoop() {
  if (lifeLoopTimer) return;
  lifeLoopTimer = window.setInterval(() => { void tickLifeLoop(); }, 15000);
  void tickLifeLoop();
}

/** 發呆（產圖）全部完成後：人在房內就離房找住處。 */
async function onDaydreamImagesReady() {
  if (!girl || sheIsOut() || pending || talkBusy || autoLifeBusy) return;
  autoLifeBusy = true;
  try {
    clearRoomVisit(girl);
    const status = $("summon-status");
    if (status) status.textContent = `${girl.name}發呆產圖完成，要去找住處…`;
    await letHerLeave();
  } finally {
    autoLifeBusy = false;
  }
}

/** 一小時一趟：亂逛，或打工（沒工作就先挑再上工）。 */
async function runAutoHourlyActivity() {
  if (!girl?.world?.home || !sheIsOut()) return;
  const region = placedRegion();
  if (!region) return;
  const kind = Math.random() < 0.5 ? "work" : "wander";
  if (kind === "wander") {
    await runStroll(girl, region);
    return;
  }
  if (!girl.world.job) {
    await startActivity("work");
    if (!girl?.world?.job || !sheIsOut()) return;
  }
  if (girl.world.activity && girl.world.activity !== "work") return;
  await runShift(girl, placedRegion() || region);
}

async function tickLifeLoop() {
  if (!girl || autoLifeBusy || pending || talkBusy) return;
  // 房內停留到期 → 回住處（絕對計時；僅對已有 world 的召喚／進房啟動）
  if (!sheIsOut() && girl.world && (girl.roomVisitUntil | 0) > 0 && Date.now() >= girl.roomVisitUntil) {
    autoLifeBusy = true;
    try {
      clearRoomVisit(girl);
      if (girl.chatEnter !== "flee_back") girl.chatEnter = "summon";
      ensureWorldHome(girl);
      sendHerOutAgain();
    } finally {
      autoLifeBusy = false;
    }
    return;
  }
  // 只跑外面有住所的每小時活動；找住處改等發呆產圖完成事件
  if (!sheIsOut() || !girl.world?.home) return;
  if (girl.world.activity === "work" && girl.world.shift?.pending) return;
  if (girl.world.activity === "wander" && girl.world.stroll?.pending) return;
  const last = girl.world.lastAutoActivityAt || girl.world.homeSince || girl.world.at || 0;
  if (Date.now() - last < WORLD_AUTO_MS) return;
  autoLifeBusy = true;
  try {
    girl.world.lastAutoActivityAt = Date.now();
    persistRoom();
    const status = $("summon-status");
    if (status) status.textContent = `${girl.name}這小時要出門活動了…`;
    await runAutoHourlyActivity();
  } finally {
    autoLifeBusy = false;
  }
}

function toggleActivity() {
  if (!girl?.world?.home || !sheIsOut()) return;
  activityOpen = !activityOpen;
  renderWorld();
}

async function startActivity(kind) {
  if (!girl?.world?.home || !sheIsOut()) return;
  if (kind !== "work" && kind !== "wander") return;
  activityOpen = false;
  const region = placedRegion();
  if (kind === "wander") {
    await runStroll(girl, region);
    return;
  }
  if (girl.world.job) {
    await runShift(girl, region);
    return;
  }
  const token = ++workToken;
  const who = girl;
  const choices = sampleJobs();
  who.world.activity = "work";
  who.world.job = null;
  renderWorld();
  $("summon-status").textContent = `${who.name}在日本的${region.name}挑打工。`;
  let job = null;
  let pickedByModel = true;
  try {
    job = await askJob(who, region, choices);
  } catch {
    pickedByModel = false;
    job = choices[Math.floor(Math.random() * choices.length)] || JOBS[0];
  }
  if (token !== workToken || girl !== who || who.world?.activity !== "work") return;
  who.world.job = { id: job.id, name: job.name };
  renderWorld();
  $("summon-status").textContent = pickedByModel
    ? `${who.name}在日本的${region.name}打工，做的是${job.name}。`
    : `${who.name}在日本的${region.name}打工，做的是${job.name}。模型沒選成，這份是先抽的。`;
}

async function letHerLeave(opts = {}) {
  if (!girl || pending || sheIsOut()) return;
  clearRoomVisit(girl);
  if (girl.world?.home) {
    sendHerOutAgain();
    return;
  }
  // 半狀態：補住所後再送出，避免永遠「正在決定她住哪」
  if (girl.world) {
    ensureWorldHome(girl);
    sendHerOutAgain();
    return;
  }
  const region = rollJapanRegion();
  const ground = rollGround(region.id);
  const who = girl;
  const choices = sampleHomes();
  const fallback = pickRandomHome(choices);
  who.world = { regionId: region.id, ground, at: Date.now(), home: null };
  // 先掛暫定住所：召喚／活動鍵立刻可用，不卡找地點
  assignHome(who, fallback);
  if (who.chatEnter !== "flee_back") who.chatEnter = "summon";
  window.RoomActor?.setPresent(false);
  if (sheetOpen()) hideSheet();
  activityOpen = false;
  renderCard();
  renderWorld();
  persistRoom();

  if (opts.instantHome) {
    $("summon-status").textContent = `${who.name}人在日本的${region.name}，住在${fallback.name}。`;
    return;
  }

  $("summon-status").textContent = `${who.name}已經離開房間，人在${ground.name}。正在決定她住哪。`;
  let home = null;
  let pickedByModel = true;
  try {
    home = await askHome(who, region, choices);
  } catch {
    pickedByModel = false;
    home = fallback;
  }
  if (girl !== who || !who.world) return;
  assignHome(who, home || fallback);
  renderCard();
  renderWorld();
  persistRoom();
  $("summon-status").textContent = pickedByModel
    ? `${who.name}人在日本的${region.name}，住在${who.world.home.name}。`
    : `${who.name}人在日本的${region.name}，住在${who.world.home.name}。模型沒選成，這間是先抽的。`;
}

function normalizeGirlTags(who) {
  if (!who) return;
  if (!Array.isArray(who.kinks)) {
    const fromPers = (who.personality || []).filter((n) => KINK_SET.has(n));
    const fromArch = KINK_SET.has(who.archetype) ? [who.archetype] : [];
    who.kinks = [...new Set([...fromPers, ...fromArch])];
  }
  const base = (who.personality || []).find((n) => PERSONALITY_SET.has(n));
  if (base) {
    who.personality = [base];
    if (!PERSONALITY_SET.has(who.archetype)) who.archetype = base;
  } else if (KINK_SET.has(who.archetype) || (who.personality || []).some((n) => KINK_SET.has(n))) {
    // 舊檔只抽到性癖：個性退回文靜溫柔，性癖保留
    who.archetype = "文靜溫柔";
    who.personality = ["文靜溫柔"];
  }
  if (!Array.isArray(who.kinkMeta)) who.kinkMeta = [];
}


let bodyUiBound = false;
let bodyUiSyncing = false;

function fillStuffedSelect(sel) {
  if (!sel || sel.options.length) return;
  for (const opt of STUFFED_OPTIONS) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    sel.append(o);
  }
}

function renderBodyPanel() {
  const panel = $("body-panel");
  if (!panel) return;
  fillStuffedSelect($("body-vagina-stuffed"));
  fillStuffedSelect($("body-anus-stuffed"));
  if (!girl) {
    panel.hidden = true;
    if ($("body-summary")) $("body-summary").textContent = "尚無對象";
    return;
  }
  panel.hidden = false;
  const snap = snapshotBodyForUi(girl);
  if (!snap) return;
  bodyUiSyncing = true;
  const setRange = (id, val, outId) => {
    const el = $(id);
    if (el) el.value = String(val);
    if (outId && $(outId)) $(outId).textContent = String(val);
  };
  setRange("body-libido", snap.libido, "body-libido-val");
  setRange("body-arousal", snap.arousal, "body-arousal-val");
  setRange("body-nipple-swell", snap.nipplesSwell, "body-nipple-swell-val");
  setRange("body-breast-swell", snap.breastsSwell, "body-breast-swell-val");
  setRange("body-clit-swell", snap.clitSwell, "body-clit-swell-val");
  setRange("body-labia-swell", snap.labiaSwell, "body-labia-swell-val");
  setRange("body-vagina-wet", snap.vaginaWet, "body-vagina-wet-val");
  setRange("body-semen", snap.uterusSemen, "body-semen-val");
  if ($("body-semen-val")) $("body-semen-val").textContent = SEMEN_ZH[snap.uterusSemen] || "沒有";
  if ($("body-libido-stage")) $("body-libido-stage").textContent = snap.libidoLabel;
  if ($("body-arousal-stage")) $("body-arousal-stage").textContent = snap.arousalLabel;
  if ($("body-nipple-wet")) $("body-nipple-wet").checked = !!snap.nipplesWet;
  if ($("body-clit-wet")) $("body-clit-wet").checked = !!snap.clitWet;
  if ($("body-labia-wet")) $("body-labia-wet").checked = !!snap.labiaWet;
  if ($("body-vagina-stuffed")) $("body-vagina-stuffed").value = snap.vaginaStuffed || "";
  if ($("body-anus-stuffed")) $("body-anus-stuffed").value = snap.anusStuffed || "";
  if ($("body-summary")) {
    {
      const preg = breedingLabel(girl) ? `・${breedingLabel(girl)}` : "";
      $("body-summary").textContent = `${snap.libidoLabel}・${snap.arousalLabel}・開放${snap.openness ?? 0}・侵犯${snap.invasion ?? 0}・精液${SEMEN_ZH[snap.uterusSemen]}${preg}`;
    }
  }
  bodyUiSyncing = false;
}

function readBodyPanelToGirl() {
  if (!girl || bodyUiSyncing) return;
  applyUiSnapshot(girl, {
    libido: $("body-libido")?.value,
    arousal: $("body-arousal")?.value,
    nipplesSwell: $("body-nipple-swell")?.value,
    nipplesWet: $("body-nipple-wet")?.checked,
    breastsSwell: $("body-breast-swell")?.value,
    clitSwell: $("body-clit-swell")?.value,
    clitWet: $("body-clit-wet")?.checked,
    labiaSwell: $("body-labia-swell")?.value,
    labiaWet: $("body-labia-wet")?.checked,
    vaginaWet: $("body-vagina-wet")?.value,
    vaginaStuffed: $("body-vagina-stuffed")?.value,
    anusStuffed: $("body-anus-stuffed")?.value,
    uterusSemen: $("body-semen")?.value,
  });
  const snap = snapshotBodyForUi(girl);
  if ($("body-libido-val")) $("body-libido-val").textContent = String(snap.libido);
  if ($("body-arousal-val")) $("body-arousal-val").textContent = String(snap.arousal);
  if ($("body-nipple-swell-val")) $("body-nipple-swell-val").textContent = String(snap.nipplesSwell);
  if ($("body-breast-swell-val")) $("body-breast-swell-val").textContent = String(snap.breastsSwell);
  if ($("body-clit-swell-val")) $("body-clit-swell-val").textContent = String(snap.clitSwell);
  if ($("body-labia-swell-val")) $("body-labia-swell-val").textContent = String(snap.labiaSwell);
  if ($("body-vagina-wet-val")) $("body-vagina-wet-val").textContent = String(snap.vaginaWet);
  if ($("body-semen-val")) $("body-semen-val").textContent = SEMEN_ZH[snap.uterusSemen] || "沒有";
  if ($("body-libido-stage")) $("body-libido-stage").textContent = snap.libidoLabel;
  if ($("body-arousal-stage")) $("body-arousal-stage").textContent = snap.arousalLabel;
  if ($("body-summary")) {
    {
      const preg = breedingLabel(girl) ? `・${breedingLabel(girl)}` : "";
      $("body-summary").textContent = `${snap.libidoLabel}・${snap.arousalLabel}・開放${snap.openness ?? 0}・侵犯${snap.invasion ?? 0}・精液${SEMEN_ZH[snap.uterusSemen]}${preg}`;
    }
  }
  persistRoom();
}

function bindBodyPanel() {
  if (bodyUiBound) return;
  bodyUiBound = true;
  const ids = [
    "body-libido", "body-arousal",
    "body-nipple-swell", "body-breast-swell", "body-clit-swell", "body-labia-swell",
    "body-vagina-wet", "body-semen",
    "body-nipple-wet", "body-clit-wet", "body-labia-wet",
    "body-vagina-stuffed", "body-anus-stuffed",
  ];
  for (const id of ids) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("input", readBodyPanelToGirl);
    el.addEventListener("change", readBodyPanelToGirl);
  }
}

(function restoreRoom() {
  applyShipChrome();
  const pending = takePendingAdopt();
  if (pending?.girl) {
    void adoptRosterGirl(pending);
    return;
  }
  const saved = loadRoomSave();
  if (!saved?.girl) return;
  girl = saved.girl;
  player = ensurePlayer(saved.player);
  if (!girl.portraits || typeof girl.portraits !== "object") girl.portraits = {};
  ensureBody(girl);
  ensureFriends(girl);
  ensurePlayerNotes(girl);
  normalizeGirlTags(girl);
  // Page load = closed session: soft-reset dialogue, keep long-term girl state.
  const hadTalk = (Array.isArray(girl.chatLines) && girl.chatLines.length)
    || (Array.isArray(saved.lines) && saved.lines.length)
    || !!girl.sessionEnded;
  girl.chatLines = [];
  girl.topicHint = "";
  girl.sessionEnded = hadTalk || !!girl.sessionEnded;
  if (!girl.chatEnter) girl.chatEnter = girl.sessionEnded ? "reopen" : "first";
  syncStage(girl);
  // 舊存檔若停在「正在決定她住哪」（home 空），立刻補住所解卡
  if (girl.world && !girl.world.home?.id) {
    ensureWorldHome(girl);
    try { persistRoom(); } catch { /* ignore */ }
  }
  if (typeof saved.present === "boolean") {
    window.RoomActor?.setPresent(saved.present);
  } else {
    window.RoomActor?.setPresent(!girl.world?.home);
  }
  if ($("summon-status")) $("summon-status").textContent = `${girl.name}還在（狀態已保留）。長按她繼續聊，或讓她離開。`;
  // 舊房間存檔補綁 Comfy 模型（非 comfy / 已綁定則 no-op）
  ensureGirlComfyCkpt(girl).then(() => {
    if (girl) { try { persistRoom(); } catch { /* */ } renderCard(); }
  }).catch(() => {});
  startLifeLoop();
})();

const onId = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
onId("draw-girl", "click", () => { drawGirl(); });
startLifeLoop();
onId("let-leave", "click", letHerLeave);
onId("summon-back", "click", summonHerBack);
onId("open-activity", "click", toggleActivity);
onId("activity-work", "click", () => { startActivity("work"); });
onId("activity-wander", "click", () => { startActivity("wander"); });
bindBodyPanel();
const refillBtn = $("body-refill-semen");
if (refillBtn) {
  refillBtn.addEventListener("click", () => {
    player = refillSemen(player, { resetClimax: true });
    persistRoom();
    refreshTalkActs();
    const status = $("summon-status");
    if (status) status.textContent = `精液已恢復（${player.semenCc}cc）。`;
    if ($("body-summary") && girl) {
      /* hint refresh via refreshTalkActs */
    }
  });
}
const claimBouquetBtn = $("claim-bouquet");
const claimGoldBtn = $("claim-gold");
if (claimGoldBtn && !claimGoldBtn.dataset.bound) {
  claimGoldBtn.dataset.bound = "1";
  claimGoldBtn.addEventListener("click", () => { claimGold(); });
}
if (claimBouquetBtn && !claimBouquetBtn.dataset.bound) {
  claimBouquetBtn.dataset.bound = "1";
  claimBouquetBtn.addEventListener("click", () => { claimBouquet(); });
}
const claimRingBtn = $("claim-ring");
if (claimRingBtn && !claimRingBtn.dataset.bound) {
  claimRingBtn.dataset.bound = "1";
  claimRingBtn.addEventListener("click", () => { claimRing(); });
}
const buyAbortBtn = $("buy-abort-pill");
if (buyAbortBtn && !buyAbortBtn.dataset.bound) {
  buyAbortBtn.dataset.bound = "1";
  buyAbortBtn.addEventListener("click", () => { buyAbortPill(); });
}
const useAbortBtn = $("use-abort-pill");
if (useAbortBtn && !useAbortBtn.dataset.bound) {
  useAbortBtn.dataset.bound = "1";
  useAbortBtn.addEventListener("click", () => { useAbortPill(); });
}
renderRomanceItems();
renderCard();
renderWorld();
renderDebug();
onId("dbg-jump", "change", () => {
  if (!girl) return;
  const value = $("dbg-jump").value;
  girl.stageLock = STAGE_NAME[value] ? value : "";
  syncStage(girl);
  girl.lastMark = girl.stageLock ? `設定跳到${STAGE_NAME[girl.stageLock]}` : "設定改回照感情";
  pushDebug(girl.lastMark);
  if (girl.stageLock) {
    const idx = STAGE_INDEX[girl.stageLock] ?? 0;
    if (idx >= (STAGE_INDEX.girlfriend ?? 4) && idx < (STAGE_INDEX.wife ?? 7)) {
      pushDebug("（除錯跳過：正式流程需花束告白才能進女友帶）");
    } else if (idx >= (STAGE_INDEX.wife ?? 7)) {
      pushDebug("（除錯跳過：正式流程需戒指求婚才能進妻子帶）");
    }
  }
  persistRoom();
  renderDebug();
  refreshTalkActs();
});
bindTalkActs();
onId("talk-input-row", "submit", (event) => { sendTalk(event); });
onId("portrait-backdrop", "click", () => {
  if (sceneOpen()) {
    closeRoomScene();
    return;
  }
  hideSheet();
});
onId("portrait-sheet", "click", (event) => {
  if (sceneOpen()) return;
  if (event.target.closest(".talk")) return;
  hideSheet();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (sceneOpen()) {
    closeRoomScene();
    return;
  }
  if (sheetOpen()) hideSheet();
});


if (document.documentElement.classList.contains("room-page")) {
  try {
    mountButtPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[butt-pack-editor]", err?.message || err);
  }
  try {
    mountWaistPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[waist-pack-editor]", err?.message || err);
  }
  try {
    mountBreastPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[breast-pack-editor]", err?.message || err);
  }
  try {
    mountKneadPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[knead-pack-editor]", err?.message || err);
  }
  try {
    mountSuckPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[suck-pack-editor]", err?.message || err);
  }
  try {
    mountLickPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[lick-pack-editor]", err?.message || err);
  }
  try {
    mountLabiaPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[labia-pack-editor]", err?.message || err);
  }
  try {
    mountLabiaRubPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[labia-rub-pack-editor]", err?.message || err);
  }
  try {
    mountFingerPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[finger-pack-editor]", err?.message || err);
  }
}

// 開「編輯」時收合浮動圖組面板（面板不依賴 room-editor，但避免重疊）
$("edit-room")?.addEventListener("click", () => {
  for (const id of [
    "butt-pack-editor", "waist-pack-editor", "breast-pack-editor", "knead-pack-editor", "suck-pack-editor",
    "lick-pack-editor", "labia-pack-editor", "labia-rub-pack-editor", "finger-pack-editor",
  ]) {
    const el = $(id);
    if (el) el.hidden = true;
  }
  for (const id of [
    "btn-butt-packs", "btn-waist-packs", "btn-breast-packs", "btn-knead-packs", "btn-suck-packs",
    "btn-lick-packs", "btn-labia-packs", "btn-labia-rub-packs", "btn-finger-packs",
  ]) {
    $(id)?.setAttribute("aria-expanded", "false");
  }
});

bindRoomSceneOverlay();
window.RoomPortrait = { open: showSheet };
window.RoomScenes = {
  open: openRoomScene,
  close: closeRoomScene,
  unlocked: () => highStunSceneUnlocked(girl),
};
window.RoomCompanion = {
  adopt: adoptRosterGirl,
  sync: () => girl && syncProgressToGame(girl),
  isShip: isShipMode,
  current: () => girl,
  show: showSheet,
  hide: hideSheet,
  onDaydreamComplete: () => { void onDaydreamImagesReady(); },
};
window.addEventListener("yoro-daydream-complete", () => { void onDaydreamImagesReady(); });
window.addEventListener("pagehide", () => { if (girl) { rememberChat(); persistRoom(); } });
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && girl) {
    rememberChat();
    persistRoom();
  }
});
