/** test_sex — 正式劇本對話框互動（場景圖下層）。鏡像 beginScriptScene / ScriptMode。 */
import {
  fillBinds,
  pickPack,
  normalizeData,
  normalizePack,
  KIND_ZH,
  SCENE_ZH,
  nextAfterScene1,
  narrLines,
  rollSexThrust,
  rollAffDelta,
  buildReplyMsgs,
  resolveScriptKind,
  boundFramePackId,
} from "./script_mode.js";
import { buildSystemPrompt } from "./persona_builder.js";
import { RARITY_MARK } from "./girl_gen.js";
import * as FramePack from "./frame_pack.js";

const $ = (id) => document.getElementById(id);

let girls = [];
let currentGirl = null;
let playerName = "你";
let packData = null;
let settings = { model: "", llmProvider: "ollama", ollamaUrl: "http://localhost:11434", rating: "nsfw", typeSpeed: 0.5 };
let worldLore = "";

/** @type {null | {
 *   kind: string, pack: object, scene: number,
 *   openStep: string, awaiting: boolean, ending: boolean, transitionBusy: boolean,
 *   flowGen: number, history: Array,
 *   urls: string[], imgI: number, revealImg: boolean
 * }} */
let play = null;

let typeJob = 0;
let typeSkip = false;
let typeBusy = false;

/** 幀包快取（肏局部動畫退路） */
let FRAME_PACKS = [];
let scriptAnimRun = null;
let scriptAnimTimer = 0;
let animPlaying = false;
/** 播完留最後一幀；場景 2/3 內不自動消失，清幀僅 finishPlay／離正戲／可選長閒置 */
const ANIM_LINGER_IDLE_MS = 0; // 可選長閒置（≥20000）；0=場景2/3內永不因閒置收
let animLinger = false;
let animLingerTimer = 0;
// 本場景首輪已播過後，連按只播第 2–4 幀。
let animDidFirstRound = false;

function bustAssetUrl(url, ver) {
  if (!url) return "";
  const clean = String(url).split("?")[0].split("#")[0];
  if (!clean) return "";
  const v = ver != null && ver !== "" ? ver : Date.now();
  return `${clean}?v=${v}`;
}


function packScriptArtCount(s, pack, scene) {
  if (!s || !pack?.id) return 0;
  if (scene != null) {
    const urls = s.scriptArt?.[pack.id]?.[String(scene)]?.urls;
    return Array.isArray(urls) ? urls.filter(Boolean).length : 0;
  }
  const art = s.scriptArt?.[pack.id];
  if (!art || typeof art !== "object") return 0;
  let n = 0;
  for (const rec of Object.values(art)) {
    if (Array.isArray(rec?.urls)) n += rec.urls.filter(Boolean).length;
  }
  return n;
}

/**
 * 與 app.js preferScriptPackWithArt 對齊：本 pack 沒預產圖時改挑同 kind 有 scriptArt 的。
 */
function preferScriptPackWithArt(s, pack, kind) {
  if (!pack) return pack;
  const k = resolveScriptKind(kind || pack.kind);
  if (packScriptArtCount(s, pack) > 0) return pack;
  const data = packData || normalizeData({});
  const active = pickPack(data, k);
  if (active && packScriptArtCount(s, active) > 0) {
    return normalizePack(active);
  }
  const packs = data.packs || [];
  const hit = packs.find(
    (p) => resolveScriptKind(p.kind) === k && packScriptArtCount(s, p) > 0,
  );
  return hit ? normalizePack(hit) : pack;
}

/** 鏡像 app.js scriptSceneUrls：scriptArt → 同 kind 其他 pack → slots[].url；bust 快取。 */
function scriptSceneUrls(s, pack, n) {
  const bust = (list, ver) => (list || []).filter(Boolean).map((u) => (
    String(u).includes("?v=") ? u : bustAssetUrl(u, ver)
  ));
  const rec = s?.scriptArt?.[pack?.id]?.[String(n)];
  const pre = rec?.urls;
  const ver = rec?.at || s?.portraitsRefreshedAt || Date.now();
  if (Array.isArray(pre) && pre.filter(Boolean).length) {
    return bust(pre, ver);
  }
  const k = resolveScriptKind(pack?.kind);
  for (const p of ((packData || normalizeData({})).packs || [])) {
    if (!p?.id || p.id === pack?.id) continue;
    if (resolveScriptKind(p.kind) !== k) continue;
    const alt = s?.scriptArt?.[p.id]?.[String(n)];
    const urls = alt?.urls;
    if (Array.isArray(urls) && urls.filter(Boolean).length) {
      return bust(urls, alt?.at || ver);
    }
  }
  const slots = pack?.scenes?.[String(n)]?.slots || [];
  return bust(slots.map((x) => x.url), ver);
}

function hideSceneArt() {
  const box = $("scene-art");
  const img = $("scene-art-img");
  box?.classList.remove("on");
  box?.setAttribute("aria-hidden", "true");
  if (img) {
    try { img.removeAttribute("src"); } catch { /* */ }
    img.alt = "";
  }
}

function showSceneArtUrl(url) {
  const box = $("scene-art");
  const img = $("scene-art-img");
  if (!box || !img) return;
  const next = String(url || "").trim();
  if (!next) {
    hideSceneArt();
    return;
  }
  const apply = () => {
    box.classList.add("on");
    box.setAttribute("aria-hidden", "false");
  };
  if (img.getAttribute("src") === next) {
    if (img.complete && img.naturalWidth > 0) apply();
    return;
  }
  img.onload = () => {
    if (img.getAttribute("src") !== next) return;
    apply();
  };
  img.onerror = () => {
    if (img.getAttribute("src") !== next) return;
    hideSceneArt();
    setStatus("play-status", "場景圖未就緒", true);
  };
  // 先掛 src；成功後才顯示，避免破圖框
  img.alt = currentGirl?.name || "";
  img.src = next;
}

function refreshSceneArt() {
  if (!play?.revealImg) {
    hideSceneArt();
    return;
  }
  const urls = play.urls || [];
  const i = ((Number(play.imgI) || 0) % Math.max(urls.length, 1) + Math.max(urls.length, 1)) % Math.max(urls.length, 1);
  const url = urls.length ? urls[i] : "";
  if (!url) {
    hideSceneArt();
    if (play && !play._scriptArtMissingToast) {
      play._scriptArtMissingToast = true;
      setStatus("play-status", "場景圖未就緒");
    }
    return;
  }
  showSceneArtUrl(url);
}


async function loadFramePacks() {
  try {
    const r = await fetch("/api/frame-packs?ts=" + Date.now(), { cache: "no-store" });
    const j = await r.json();
    const packs = Array.isArray(j?.packs) ? j.packs : (Array.isArray(j) ? j : []);
    FRAME_PACKS = packs.filter((p) => p && p.id);
  } catch {
    FRAME_PACKS = FRAME_PACKS || [];
  }
  return FRAME_PACKS;
}

function boundScriptFramePack(pack, spec) {
  const id = boundFramePackId(pack, spec);
  return FramePack.findPack(FRAME_PACKS, id);
}

/**
 * 與主遊戲對齊：primary=daydream sexAnim；fallback=幀包 1–4。
 * sexAnim URL 可能已被 GC 刪檔→播放時若 primary 全掛才改播 fallback。
 */
function scriptAnimUrlCandidates() {
  const g = currentGirl;
  const poseId = String(play?.pack?.pose || "").trim();
  const pick = (urls) => (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean);
  const bust = (urls, ver) => pick(urls).map((u) => {
    try { return bustAssetUrl(u, ver); } catch { return u; }
  });

  let primary = [];
  if (g?.sexAnim) {
    if (poseId) {
      const hit = g.sexAnim[poseId];
      const urls = bust(hit?.urls, hit?.at);
      if (urls.length) primary = urls.slice(0, 4);
    }
    if (!primary.length) {
      for (const rec of Object.values(g.sexAnim)) {
        const urls = bust(rec?.urls, rec?.at);
        if (urls.length >= 2) { primary = urls.slice(0, 4); break; }
      }
    }
    if (!primary.length) {
      for (const rec of Object.values(g.sexAnim)) {
        const urls = bust(rec?.urls, rec?.at);
        if (urls.length) { primary = urls.slice(0, 4); break; }
      }
    }
  }

  let fallback = [];
  const spec = play?.pack?.scenes?.[String(play?.scene)];
  const bound = boundScriptFramePack(play?.pack, spec);
  let urls = pick(FramePack.packFrameUrls(bound));
  if (urls.length) fallback = urls.slice(0, 4);
  if (!fallback.length && poseId) {
    const posePack = (FRAME_PACKS || []).find(
      (p) => p && p.pose === poseId && pick(FramePack.packFrameUrls(p)).length,
    );
    urls = pick(FramePack.packFrameUrls(posePack));
    if (urls.length) fallback = urls.slice(0, 4);
  }
  if (!fallback.length) {
    const anyPack = (FRAME_PACKS || []).find((p) => pick(FramePack.packFrameUrls(p)).length >= 2)
      || (FRAME_PACKS || []).find((p) => pick(FramePack.packFrameUrls(p)).length);
    urls = pick(FramePack.packFrameUrls(anyPack));
    if (urls.length) fallback = urls.slice(0, 4);
  }

  return { primary, fallback };
}

function scriptAnimUrls() {
  const { primary, fallback } = scriptAnimUrlCandidates();
  return primary.length ? primary : fallback;
}

function clearAnimLinger() {
  if (animLingerTimer) {
    clearTimeout(animLingerTimer);
    animLingerTimer = 0;
  }
  animLinger = false;
}

/** 取消進行中的 run／計時，但不藏 overlay、不清 img.src（連肏無閃爍） */
function cancelScriptAnimRunOnly() {
  clearAnimLinger();
  if (scriptAnimTimer) {
    clearTimeout(scriptAnimTimer);
    scriptAnimTimer = 0;
  }
  const run = scriptAnimRun;
  scriptAnimRun = null;
  animPlaying = false;
  if (run) {
    run.cancelled = true;
    for (const cancel of run.waiters) cancel();
    run.waiters.clear();
  }
}

function stopScriptAnim() {
  cancelScriptAnimRunOnly();
  animDidFirstRound = false;
  const box = $("sex-anim-popup");
  const img = $("sex-anim-img");
  box?.classList.add("hidden");
  box?.setAttribute("aria-hidden", "true");
  if (img) img.removeAttribute("src");
  document.body.classList.remove("sex-anim-on");
  syncUi();
}

/** 一輪播完：明確留最後一幀＋sex-anim-on；場景 2/3 內不秒消，清幀僅離正戲／結束／可選長閒置 */
function endAnimRoundToLinger() {
  if (scriptAnimTimer) {
    clearTimeout(scriptAnimTimer);
    scriptAnimTimer = 0;
  }
  const run = scriptAnimRun;
  scriptAnimRun = null;
  animPlaying = false;
  if (run) {
    run.cancelled = true;
    for (const cancel of run.waiters) cancel();
    run.waiters.clear();
  }
  clearAnimLinger();
  const scene = Number(play?.scene) || 0;
  const box = $("sex-anim-popup");
  const img = $("sex-anim-img");
  // 已離開正戲／投入 → 不 linger，直接收
  if (scene !== 2 && scene !== 3) {
    animDidFirstRound = false;
    box?.classList.add("hidden");
    box?.setAttribute("aria-hidden", "true");
    if (img) img.removeAttribute("src");
    document.body.classList.remove("sex-anim-on");
    syncUi();
    return;
  }
  // 明確保持 overlay 可見、保留 src
  animDidFirstRound = true;
  box?.classList.remove("hidden");
  box?.setAttribute("aria-hidden", "false");
  animLinger = true;
  document.body.classList.add("sex-anim-on");
  syncUi();
  // 可選長閒置（≥20s）；場景 2/3 內預設不秒消
  if (ANIM_LINGER_IDLE_MS > 0) {
    animLingerTimer = setTimeout(() => {
      animLingerTimer = 0;
      if (!animLinger || animPlaying || scriptAnimRun) return;
      const sc = Number(play?.scene) || 0;
      if (sc === 2 || sc === 3) return; // 仍在正戲：不因閒置收
      animLinger = false;
      const b = $("sex-anim-popup");
      const im = $("sex-anim-img");
      b?.classList.add("hidden");
      b?.setAttribute("aria-hidden", "true");
      if (im) im.removeAttribute("src");
      document.body.classList.remove("sex-anim-on");
      syncUi();
    }, ANIM_LINGER_IDLE_MS);
  }
}

function scriptAnimLoad(run, img, url) {
  if (run.cancelled) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    const cancel = () => finish(false);
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      run.waiters.delete(cancel);
      img.onload = null;
      img.onerror = null;
      resolve(ok);
    };
    run.waiters.add(cancel);
    img.onload = () => finish(true);
    img.onerror = () => finish(false);
    img.src = url;
    if (img.complete && img.naturalWidth) queueMicrotask(() => finish(true));
  });
}

function scriptAnimHold(run, ms) {
  if (run.cancelled) return Promise.resolve(false);
  return new Promise((resolve) => {
    let settled = false;
    let timer = 0;
    const cancel = () => finish(false);
    const finish = (ok) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (scriptAnimTimer === timer) scriptAnimTimer = 0;
      run.waiters.delete(cancel);
      resolve(ok);
    };
    run.waiters.add(cancel);
    timer = setTimeout(() => finish(true), ms);
    scriptAnimTimer = timer;
  });
}

/** 預載幀圖，減少換幀空白。 */
function scriptAnimPreload(run, urls) {
  if (run.cancelled || !urls?.length) return Promise.resolve();
  return Promise.all(urls.map((url) => new Promise((resolve) => {
    if (run.cancelled) return resolve();
    const im = new Image();
    let settled = false;
    const cancel = () => finish();
    const finish = () => {
      if (settled) return;
      settled = true;
      run.waiters.delete(cancel);
      im.onload = null;
      im.onerror = null;
      resolve();
    };
    run.waiters.add(cancel);
    im.onload = finish;
    im.onerror = finish;
    im.src = url;
    if (im.complete) queueMicrotask(finish);
  })));
}

/** 肏：播幀 1–4（慢快快慢）；播完留最後一幀可連按下一輪；場景 2/3 內不自動消失。
 *  opts.fromLinger / 當前 animLinger：不藏 overlay，直接換幀 2 無閃爍連播。 */
async function flashScriptAnim(opts = {}) {
  const box = $("sex-anim-popup");
  const img = $("sex-anim-img");
  if (!box || !img) {
    console.warn("[test_sex sex-anim] overlay DOM missing");
    return;
  }
  const fromLinger = !!(opts?.fromLinger || animLinger || animDidFirstRound);
  // 連肏／首播皆只取消舊 run，不清 src／不藏 overlay（避免轉場競態把動圖砍掉）
  cancelScriptAnimRunOnly();
  animPlaying = true;
  animLinger = false;
  document.body.classList.add("sex-anim-on");
  syncUi();
  // 獨立彈窗：掛到 <html> 最末，脫離任何 transform / 對話堆疊
  (document.documentElement || document.body).appendChild(box);
  // 先顯 overlay，再 await 載幀包，縮短「按下肏→第一幀」空白
  box.classList.remove("hidden");
  box.setAttribute("aria-hidden", "false");
  const run = { cancelled: false, waiters: new Set() };
  scriptAnimRun = run;
  let shown = 0;
  try {
    try { await loadFramePacks(); } catch { /* */ }
    if (run.cancelled) return;
    const { primary, fallback } = scriptAnimUrlCandidates();
    let urls = primary.length ? primary : fallback;
    if (!urls.length) {
      console.warn("[test_sex sex-anim] no urls", {
        pose: play?.pack?.pose,
        framePackId: play?.pack?.framePackId,
        packs: (FRAME_PACKS || []).length,
        sexAnim: Object.keys(currentGirl?.sexAnim || {}),
      });
      setStatus("play-status", "沒有局部動畫圖（幀包／sexAnim 皆空）", true);
      return;
    }
    // 首輪慢快快慢 1–4；連按只播 2–4，節奏快快慢。
    const FIRST_HOLDS = [300, 180, 180, 300];
    const CONTINUE_HOLDS = [180, 180, 300];
    const playUrls = async (sourceList) => {
      const list = (fromLinger ? sourceList.slice(1, 4) : sourceList.slice(0, 4));
      const holds = fromLinger ? CONTINUE_HOLDS : FIRST_HOLDS;
      if (!list.length) return 0;
      // 連肏：先立刻換幀 2，再背景預載其餘，避免先藏再開
      if (fromLinger && list[0]) {
        await scriptAnimLoad(run, img, list[0]);
        if (run.cancelled) return 0;
        const rest = list.slice(1);
        if (rest.length) await scriptAnimPreload(run, rest);
        if (run.cancelled) return 0;
        let n = 1;
        await scriptAnimHold(run, holds[0]);
        for (const url of rest) {
          if (run.cancelled) break;
          const ok = await scriptAnimLoad(run, img, url);
          if (run.cancelled) break;
          if (ok) {
            const hold = holds[Math.min(n, holds.length - 1)];
            n += 1;
            await scriptAnimHold(run, hold);
          }
        }
        return n;
      }
      await scriptAnimPreload(run, list);
      if (run.cancelled) return 0;
      let n = 0;
      for (const url of list) {
        if (run.cancelled) break;
        const ok = await scriptAnimLoad(run, img, url);
        if (run.cancelled) break;
        if (ok) {
          const hold = holds[Math.min(n, holds.length - 1)];
          n += 1;
          await scriptAnimHold(run, hold);
        }
      }
      return n;
    };
    shown = await playUrls(urls);
    // sexAnim 全 404（GC 刪檔）→ 改播幀包
    if (!shown && !run.cancelled && primary.length && fallback.length) {
      setStatus("play-status", "sexAnim 圖已失效，改用幀包");
      shown = await playUrls(fallback.slice(0, 4));
    }
    if (!shown && !run.cancelled) await scriptAnimHold(run, 120);
  } finally {
    // 僅本 run 仍是 current：有播過／仍有 src → linger（即使 cancelled）；從未顯示才 stop
    if (scriptAnimRun === run) {
      const hasImg = !!(img.getAttribute("src"));
      if (shown > 0 || hasImg) endAnimRoundToLinger();
      else stopScriptAnim();
    }
  }
}


function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function setStatus(id, msg, err = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!err);
}

function setPlaying(active) {
  document.body.classList.toggle("playing", !!active);
}

function lookSummary(g) {
  const L = g?.look || {};
  return [L.age != null ? `${L.age}歲` : "", L.hair_color, L.hair, L.eye_color, L.cup || L.bust, L.build]
    .filter(Boolean)
    .join(" · ") || "（無外觀摘要）";
}

function renderGirlMeta() {
  const meta = $("girl-meta");
  if (!meta) return;
  if (!currentGirl) {
    meta.innerHTML = `<span>尚未選擇</span>`;
    return;
  }
  const g = currentGirl;
  const mark = RARITY_MARK[g.rarity] || "";
  const persona = Array.isArray(g.personality) ? g.personality.join("・") : (g.personality || "");
  meta.innerHTML = `
    <div><b>${esc(g.name || "？")}</b> ${esc(mark)} ${esc(g.rarity || "")}
      <span>· ${esc(g.id || "")}</span>
      · 關係 ${esc(g.stage || "stranger")}
      · 模型 ${esc(settings.model || "（空＝罐頭）")}</div>
    <div style="margin-top:.2em">${esc(persona || "（無人設）")} · ${esc(lookSummary(g))}</div>
  `;
}

function renderGirlSelect() {
  const sel = $("girl-sel");
  if (!sel) return;
  if (!girls.length) {
    sel.innerHTML = `<option value="">（存檔沒有看板娘）</option>`;
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
    const data = j?.data || {};
    settings = {
      model: data.settings?.model || "",
      llmProvider: (data.settings?.llmProvider || "ollama").toLowerCase(),
      ollamaUrl: data.settings?.ollamaUrl || "http://localhost:11434",
      rating: data.settings?.rating || "nsfw",
      typeSpeed: Number(data.settings?.typeSpeed) || 0.5,
    };
    playerName =
      data.playerProfile?.name || data.settings?.playerName || data.settings?.player || "你";
    const list = (data.succubi || []).filter((g) => g && g.id && !g.taken);
    girls = list;
    if (!currentGirl || !girls.some((g) => g.id === currentGirl.id)) {
      currentGirl = girls[0] || null;
    } else {
      currentGirl = girls.find((g) => g.id === currentGirl.id) || girls[0] || null;
    }
    renderGirlSelect();
    if (currentGirl) $("girl-sel").value = currentGirl.id;
    renderGirlMeta();
    setStatus("roster-status", girls.length ? `名冊 ${girls.length} 隻 · LLM ${settings.model || "罐頭"}` : "存檔沒有可用看板娘", !girls.length);
  } catch (e) {
    girls = [];
    currentGirl = null;
    renderGirlSelect();
    renderGirlMeta();
    setStatus("roster-status", "讀存檔失敗：" + e.message, true);
  }
}

async function loadPacks() {
  try {
    const r = await fetch("/api/script-packs", { cache: "no-store" });
    const j = await r.json();
    packData = normalizeData(j);
  } catch {
    packData = normalizeData({});
  }
}

async function loadWorld() {
  try {
    const r = await fetch("/content/world.md", { cache: "no-store" });
    if (r.ok) worldLore = await r.text();
  } catch {
    worldLore = "";
  }
}

/** 優先 active sex；場景1有旁白才用。否則 tease（對齊測試頁「先做愛」意圖）。 */
function pickStartPack() {
  const data = packData || normalizeData({});
  const tryKind = (kind) => {
    const pack = pickPack(data, kind);
    const spec = pack?.scenes?.["1"];
    const lines = narrLines(spec);
    if (lines.length) return { pack: normalizePack(pack), kind: resolveScriptKind(kind) };
    return null;
  };
  return tryKind("sex") || tryKind("tease") || tryKind("oral") || {
    pack: pickPack(data, "sex"),
    kind: "sex",
  };
}

function typeDelayMs() {
  const v = Math.min(1, Math.max(0.1, Number(settings.typeSpeed) || 0.5));
  return Math.round(20 / v);
}

function vnCancelType() {
  typeJob += 1;
  typeSkip = true;
  typeBusy = false;
  $("vn-typing")?.classList.add("hidden");
}

function vnShow(name, text, who = "ai") {
  vnCancelType();
  const nameEl = $("vn-name");
  const textEl = $("vn-text");
  if (nameEl) {
    nameEl.textContent = name || (who === "sys" ? "旁白" : "");
    nameEl.classList.toggle("sys", who === "sys" || !name);
  }
  if (textEl) textEl.textContent = text || "";
  $("vn-cursor")?.classList.remove("hidden");
  $("vn-typing")?.classList.add("hidden");
}

async function vnType(name, text, who = "ai") {
  const job = ++typeJob;
  typeSkip = false;
  typeBusy = true;
  const nameEl = $("vn-name");
  const textEl = $("vn-text");
  const full = String(text ?? "");
  if (nameEl) {
    nameEl.textContent = name || (who === "sys" ? "旁白" : "");
    nameEl.classList.toggle("sys", who === "sys" || !name);
  }
  if (textEl) textEl.textContent = "";
  $("vn-cursor")?.classList.add("hidden");
  $("vn-typing")?.classList.remove("hidden");
  const delay = typeDelayMs();
  for (let i = 1; i <= full.length; i++) {
    if (job !== typeJob || typeSkip) break;
    if (textEl) textEl.textContent = full.slice(0, i);
    await new Promise((r) => setTimeout(r, delay));
  }
  if (textEl) textEl.textContent = full;
  if (job === typeJob) {
    typeBusy = false;
    $("vn-typing")?.classList.add("hidden");
    $("vn-cursor")?.classList.remove("hidden");
  }
}

function syncUi() {
  const live = !!play && !play.ending;
  const scene = Number(play?.scene) || 0;
  const kind = play?.kind || "";
  // mid-anim 兩鈕皆 ghost（占位）；animLinger 只放肏（mutex）
  const animOn = animPlaying || !!scriptAnimRun;
  const canThrust = !!(live && (scene === 2 || scene === 3) && !animOn);
  const needNext = !!(live && !animOn && (
    play.openStep === "wait_ai" ||
    play.openStep === "wait_go" ||
    play.openStep === "wait_end"
  ));
  const showThrust = canThrust;
  const showNext = !showThrust && needNext;
  // play 進行中永遠顯示 #act-row（不因 mid-anim 整列 hidden 造成對話跳排版）
  const showAct = !!play;

  $("stage-idle")?.classList.toggle("hidden", !!play);
  $("act-row")?.classList.toggle("hidden", !showAct);

  const nextBtn = $("btn-next");
  const thrust = $("btn-thrust");
  if (nextBtn) {
    nextBtn.hidden = false;
    nextBtn.classList.remove("hidden");
    nextBtn.classList.toggle("is-ghost", !showNext);
    nextBtn.style.visibility = showNext ? "" : "hidden";
    nextBtn.style.pointerEvents = showNext ? "" : "none";
    nextBtn.setAttribute("aria-hidden", showNext ? "false" : "true");
    nextBtn.disabled = !showNext || !!play?.awaiting || typeBusy;
    if (play?.openStep === "wait_end") nextBtn.textContent = "結束 ▶";
    else nextBtn.textContent = "下一句 ▶";
  }
  if (thrust) {
    thrust.hidden = false;
    thrust.classList.remove("hidden");
    thrust.classList.toggle("is-ghost", !showThrust);
    thrust.style.visibility = showThrust ? "" : "hidden";
    thrust.style.pointerEvents = showThrust ? "" : "none";
    thrust.setAttribute("aria-hidden", showThrust ? "false" : "true");
    thrust.disabled = false;
    thrust.textContent = kind === "oral" ? "含" : "肏";
  }

  const g = currentGirl;
  const title = $("hud-title");
  if (title) {
    if (play && g) {
      title.textContent = `${g.name}・${KIND_ZH[kind] || kind}・${SCENE_ZH[scene] || `場景${scene}`}`;
    } else {
      title.textContent = "尚未開始";
    }
  }
}

function pushHist(role, content) {
  if (!play) return;
  play.history.push({ role, content, t: Date.now() });
}

function firstNarr(pack, n, girl) {
  const spec = pack?.scenes?.[String(n)];
  const lines = narrLines(spec).map((x) => fillBinds(x, girl, playerName));
  return lines[0] || "……";
}

function buildGirlCtx(girl) {
  return {
    character: {
      name: girl.name || "她",
      rarity: girl.rarity,
      personality: girl.personality,
      speech_style: girl.speech,
      appearance_dna: girl.dna,
      backstory: girl.backstory || "",
      tone: girl.tone || null,
      catchphrases: girl.catchphrases || null,
      reactions: girl.reactions || null,
      quirk: girl.quirk || null,
      contrast: girl.contrast || null,
      likes: girl.likes || null,
      dislikes: girl.dislikes || null,
      hobbies: girl.hobbies || null,
      chrono: girl.chrono || null,
      arc: girl.arc || null,
      libido: girl.libido || null,
      look: girl.look || null,
      special_traits: girl.specialTraits || null,
      job_desc: girl.jobDesc || null,
    },
    relationship: {
      stage: girl.stage || "stranger",
      progress: null,
      days_since_summon: girl.summonedAt
        ? Math.floor((Date.now() - girl.summonedAt) / 86400000)
        : 0,
    },
    player: { name: playerName },
    world: worldLore || "",
    content_rating: settings.rating || "nsfw",
    scene: {
      type: "talk",
      location: "test_sex",
      scene_prompt: "劇本測試・場景圖下層",
      time_of_day: "night",
      time_label: "夜",
    },
  };
}

function llmEndpoint() {
  const p = (settings.llmProvider || "ollama").toLowerCase();
  if (p === "grok-build" || p === "xai" || p === "grok") {
    return { provider: "grok-build", endpoint: "grok-build" };
  }
  return { provider: "ollama", endpoint: settings.ollamaUrl || "http://localhost:11434" };
}

async function llmChat(messages) {
  const model = (settings.model || "").trim();
  if (!model) return "……";
  const { provider, endpoint } = llmEndpoint();
  const startRes = await fetch("/api/llm/chat_job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      endpoint,
      model,
      messages,
      options: { temperature: 0.9, num_predict: 180 },
    }),
  });
  if (!startRes.ok) throw new Error("LLM 連線失敗");
  const { job_id } = await startRes.json();
  const t0 = Date.now();
  let acc = "";
  while (Date.now() - t0 < 120000) {
    await new Promise((r) => setTimeout(r, 350));
    const r = await fetch(`/api/llm/chat_job/${job_id}`, { cache: "no-store" });
    if (!r.ok) continue;
    const j = await r.json();
    if (j.error) throw new Error(j.error);
    if (j.text) acc = j.text;
    if (j.done) return String(acc || "").trim() || "……";
  }
  throw new Error("LLM 逾時");
}

async function scriptTypeAi(girl, extra) {
  const tok = play?.flowGen;
  try {
    const sys = buildSystemPrompt(buildGirlCtx(girl));
    const spec = play?.pack?.scenes?.[String(play?.scene)];
    const attitude = fillBinds(spec?.attitude || "", girl, playerName);
    const scriptSys = [
      sys,
      "",
      `【劇本・${KIND_ZH[play.kind] || play.kind}・${SCENE_ZH[play.scene] || ""}】`,
      attitude ? `這一景態度：${attitude}` : "",
      "只演這一景。不要自己往下推高潮。只輸出台詞，不要旁白、不要引號。",
    ].filter(Boolean).join("\n");

    const hist = (play.history || [])
      .filter((m) => m.role === "user" || m.role === "assistant")
      .slice(-20)
      .map((m) => ({ role: m.role, content: m.content }));

    // 與 ScriptMode.buildReplyMsgs 對齊的 user 拍；仍帶完整 persona system
    const replyMsgs = buildReplyMsgs(girl.name, attitude, extra || "……", girl.stage);
    const msgs = [
      { role: "system", content: scriptSys },
      ...hist,
      replyMsgs[1],
    ];

    const reply = await llmChat(msgs);
    if (!play || play.flowGen !== tok) return "abort";
    const text = String(reply || "").trim() || "……";
    pushHist("assistant", text);
    await vnType(girl.name, text, "ai");
  } catch (e) {
    if (!play || play.flowGen !== tok) return "abort";
    const fallback = "……";
    pushHist("assistant", fallback);
    await vnType(girl.name, fallback, "ai");
    setStatus("play-status", "AI 失敗，用省略號：" + (e.message || e), true);
  }
  return "ok";
}

async function scriptTypeNarr(girl, text) {
  const t = String(text || "……");
  pushHist("sys", t);
  await vnType("", t, "sys");
}

async function scriptNarrAndAi(girl, scene) {
  if (!play) return "abort";
  const gen = play.flowGen || 0;
  const narr = firstNarr(play.pack, scene, girl);
  const spec = play.pack?.scenes?.[String(scene)];
  const attitude = fillBinds(spec?.attitude || "", girl, playerName);
  play.awaiting = true;
  syncUi();
  await scriptTypeNarr(girl, narr);
  if (!play || play.flowGen !== gen) return "abort";
  const r = await scriptTypeAi(girl, `（旁白：${narr}。這一景態度：${attitude}。只輸出台詞。）`);
  if (!play || play.flowGen !== gen) return "abort";
  play.awaiting = false;
  syncUi();
  return r;
}

async function beginScene(n) {
  const girl = currentGirl;
  if (!play || !girl) return;
  const spec = play.pack.scenes[String(n)];
  if (!spec) {
    finishPlay("這一景沒寫。");
    return;
  }
  // 離開正戲／投入（場景 2–3）時：若動圖仍在播（肏→結局並行）不立刻砍；
  // 若已 linger，進入非 2/3（結局／場景1）則清 overlay。
  if (n !== 2 && n !== 3) {
    animDidFirstRound = false;
    if (animLinger || document.body.classList.contains("sex-anim-on")) {
      if (!animPlaying && !scriptAnimRun) stopScriptAnim();
    }
  }
  play.flowGen = (play.flowGen || 0) + 1;
  play.scene = n;
  play.awaiting = false;
  play.ending = false;
  // 場景一開始就載好 urls（scene1 等 wait_go 揭圖；2+ 立刻顯示）
  if (play.pack && packScriptArtCount(girl, play.pack) <= 0) {
    play.pack = preferScriptPackWithArt(girl, play.pack, play.kind || play.pack.kind);
  }
  play.urls = scriptSceneUrls(girl, play.pack, n);
  play.imgI = 0;
  play._scriptArtMissingToast = false;

  if (n === 1) {
    play.revealImg = false;
    hideSceneArt();
    play.openStep = "wait_ai";
    syncUi();
    await scriptTypeNarr(girl, firstNarr(play.pack, 1, girl));
    syncUi();
    return;
  }
  if (n === 2 || n === 3) {
    play.revealImg = true;
    refreshSceneArt();
    play.openStep = "";
    syncUi();
    await scriptNarrAndAi(girl, n);
    syncUi();
    return;
  }
  // 4 / 5 結局景
  play.revealImg = true;
  refreshSceneArt();
  play.openStep = "";
  play.ending = true;
  syncUi();
  const done = await scriptNarrAndAi(girl, n);
  if (done === "abort" || !play) return;
  play.openStep = "wait_end";
  play.awaiting = false;
  play.ending = false; // 等玩家按結束
  syncUi();
}

async function handleNext() {
  const girl = currentGirl;
  if (!play || !girl) return;
  if (typeBusy) {
    typeSkip = true;
    return;
  }
  if (play.openStep === "wait_end") {
    finishPlay();
    return;
  }
  if (play.ending || play.awaiting) return;
  if (play.scene !== 1) return;

  if (play.openStep === "wait_ai") {
    play.openStep = "ai";
    play.awaiting = true;
    syncUi();
    const spec = play.pack?.scenes?.["1"];
    const narr = firstNarr(play.pack, 1, girl);
    const attitude = fillBinds(spec?.attitude || "", girl, playerName);
    const r = await scriptTypeAi(girl, `（旁白：${narr}。這一景態度：${attitude}。只輸出台詞。）`);
    if (r === "abort" || !play) return;
    // 正式遊戲此處 revealImg：再抓一次 urls（發呆可能剛寫入）並顯示場景圖
    play.urls = scriptSceneUrls(girl, play.pack, 1);
    play.imgI = 0;
    play.revealImg = true;
    refreshSceneArt();
    play.openStep = "wait_go";
    play.awaiting = false;
    syncUi();
    return;
  }

  if (play.openStep === "wait_go") {
    const nx = nextAfterScene1(play.kind);
    if (!nx) {
      finishPlay("調戲結束了。");
      return;
    }
    await beginScene(nx);
  }
}

/** 肏／含：立刻重啟動圖；並行擲骰轉場（不鎖鈕）。 */
function handleThrust() {
  if (!play || play.ending) return;
  if (play.scene !== 2 && play.scene !== 3) return;
  // 動圖立刻啟動／重啟（不閘 typeBusy／awaiting／transitionBusy）
  void flashScriptAnim();
  void runThrustTransition();
}

/** 骰子／AI／換景；transitionBusy 防堆疊，不影響肏鈕與動圖。 */
async function runThrustTransition() {
  const girl = currentGirl;
  if (!play || !girl || play.ending) return;
  if (play.scene !== 2 && play.scene !== 3) return;
  // 已在轉場／AI／換景中：略過本次骰，動圖仍已重啟
  if (play.transitionBusy || play.awaiting) return;
  play.transitionBusy = true;
  try {
    if (!play || play.ending) return;
    const d = rollAffDelta(play.scene, girl.stage);
    if (d) {
      girl.affection = (Number(girl.affection) || 0) + d;
      setStatus("play-status", `好感 ${d > 0 ? "+" : ""}${d} → ${girl.affection}（僅本頁，不寫回存檔）`);
    }
    const act = rollSexThrust(play.scene);
    if (act === "swap") {
      const n = play.urls?.length || 0;
      if (n >= 2) {
        play.imgI = play.imgI === 0 ? 1 : 0;
        refreshSceneArt();
        setStatus("play-status", `換場景圖 ${play.imgI + 1}/${n}`);
      } else {
        setStatus("play-status", "場景圖不足兩張，無法換圖");
      }
      return;
    }
    if (act === "player") {
      vnCancelType();
      play.awaiting = false;
      await beginScene(4);
      return;
    }
    if (act === "both") {
      vnCancelType();
      play.awaiting = false;
      await beginScene(5);
      return;
    }
    if (act === "scene3") {
      vnCancelType();
      play.awaiting = false;
      await beginScene(3);
      return;
    }
    if (act === "ai") {
      if (play.awaiting) return;
      play.awaiting = true;
      // 不 disable 肏；awaiting 只閘「下一句」
      syncUi();
      const spec = play.pack?.scenes?.[String(play.scene)];
      const attitude = fillBinds(spec?.attitude || "", girl, playerName);
      await scriptTypeAi(girl, `（正戲進行中。這一景態度：${attitude}。只輸出台詞，短句、喘。）`);
      if (play) play.awaiting = false;
    } else if (act && act !== "none") {
      setStatus("play-status", `肏 → ${act}`);
    }
  } finally {
    if (play) {
      play.transitionBusy = false;
      syncUi();
    }
  }
}

function finishPlay(msg) {
  if (play) {
    play.ending = true;
    play.openStep = "";
  }
  stopScriptAnim();
  hideSceneArt();
  vnCancelType();
  const g = currentGirl;
  const line = msg || "調戲結束了。";
  if (g) pushHist("sys", line);
  vnShow("", `—— ${line} ——`, "sys");
  setStatus("play-status", `${g?.name || ""} 結束了這次劇本互動`);
  play = null;
  setPlaying(false);
  syncUi();
}

function startPlay() {
  if (!currentGirl) {
    setStatus("play-status", "請先選看板娘", true);
    return;
  }
  if (!packData) {
    setStatus("play-status", "劇本包尚未載入", true);
    return;
  }
  vnCancelType();
  stopScriptAnim();
  const { pack, kind } = pickStartPack();
  play = {
    kind,
    pack,
    scene: 1,
    openStep: "",
    awaiting: false,
    ending: false,
    transitionBusy: false,
    flowGen: 0,
    history: [],
    urls: [],
    imgI: 0,
    revealImg: false,
  };
  hideSceneArt();
  setPlaying(true);
  pushHist("sys", `劇本・${KIND_ZH[kind] || kind}・場景1`);
  setStatus(
    "play-status",
    `開始：${KIND_ZH[kind] || kind}「${pack.name || pack.id}」· 模型 ${settings.model || "罐頭"}`,
  );
  syncUi();
  void beginScene(1);
}

function bind() {
  $("girl-sel")?.addEventListener("change", () => {
    const id = $("girl-sel").value;
    currentGirl = girls.find((g) => g.id === id) || null;
    renderGirlMeta();
    if (play) finishPlay("已換看板娘，結束上一場。");
  });
  $("btn-reload")?.addEventListener("click", () => loadGirls());
  $("btn-start")?.addEventListener("click", () => startPlay());
  $("btn-next")?.addEventListener("click", () => void handleNext());
  $("btn-thrust")?.addEventListener("click", () => void handleThrust());
  $("btn-end")?.addEventListener("click", () => {
    if (play) finishPlay("手動結束。");
    else setPlaying(false);
  });
  // 點對話框只略過打字，不推進（同正式 app 劇本 UX）
  $("vn-box")?.addEventListener("click", () => {
    if (typeBusy) typeSkip = true;
  });
}

bind();
syncUi();
Promise.all([loadGirls(), loadPacks(), loadWorld(), loadFramePacks()]).catch(() => {});
