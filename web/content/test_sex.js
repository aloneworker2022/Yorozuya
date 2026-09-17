/** test_sex — 選看板娘進性愛／調戲場景 1（純文字，無圖） */
import { fillBinds, pickPack, normalizeData } from "./script_mode.js";
import { RARITY_MARK } from "./girl_gen.js";

const $ = (id) => document.getElementById(id);

let girls = [];
let currentGirl = null;
let playerName = "你";
let packData = null;

/** 無劇本包時的暫定場景 1（之後可整段替換） */
const PLACEHOLDER_BEATS = [
  { role: "narr", text: "房門關上。燈光偏暗，空氣忽然變熱。" },
  { role: "player", text: "過來一點……先從場景一開始。" },
  { role: "girl", text: "……你認真的？至少、先把話說清楚。" },
  { role: "narr", text: "她站在床邊，手指揪著衣角，還沒決定要不要靠近。" },
  { role: "player", text: "別急。場景一只要開場——接下來再換正式劇本。" },
  { role: "girl", text: "哼……那你看著辦。我先聽你怎麼講。" },
];

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
    meta.innerHTML = `<span class="mini">尚未選擇</span>`;
    return;
  }
  const g = currentGirl;
  const mark = RARITY_MARK[g.rarity] || "";
  meta.innerHTML = `
    <div><b>${esc(g.name || "？")}</b> ${esc(mark)} ${esc(g.rarity || "")}
      <span class="mini">· ${esc(g.id || "")}</span></div>
    <div class="mini" style="margin-top:.25em">職業 ${esc(g.job || "—")} · ${esc(lookSummary(g))}</div>
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
    playerName =
      data.playerProfile?.name || data.settings?.playerName || data.settings?.displayName || "你";
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
    setStatus("roster-status", girls.length ? `名冊 ${girls.length} 隻` : "存檔沒有可用看板娘", !girls.length);
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
    packData = null;
  }
}

/**
 * 從 script_packs 取 sex（優先）或 tease 的場景 1。
 * 旁白用 narr[]；女子／玩家若包裡沒有對應欄位，補暫定台詞。
 */
function beatsFromPack(girl) {
  if (!packData) return null;
  let pack = pickPack(packData, "sex");
  let kind = "sex";
  const scene = pack?.scenes?.["1"] || pack?.scenes?.[1];
  const narr = (scene?.narr || []).map((x) => String(x || "").trim()).filter(Boolean);
  if (!narr.length) {
    pack = pickPack(packData, "tease");
    kind = "tease";
    const s2 = pack?.scenes?.["1"] || pack?.scenes?.[1];
    const n2 = (s2?.narr || []).map((x) => String(x || "").trim()).filter(Boolean);
    if (!n2.length) return null;
    return buildBeats(pack, kind, n2, s2, girl);
  }
  return buildBeats(pack, kind, narr, scene, girl);
}

function buildBeats(pack, kind, narrLines, scene, girl) {
  const fill = (t) => fillBinds(t, girl, playerName);
  const beats = narrLines.map((t) => ({ role: "narr", text: fill(t), provisional: false }));
  // 劇本包場景 1 通常只有旁白＋態度；女子／玩家先用暫定，方便之後接正式台詞
  beats.push({
    role: "player",
    text: fill(`（暫定台詞）靠近 ${girl?.name || "[name]"}，照這份「${pack?.name || kind}」劇本的場景一開場。`),
    provisional: true,
  });
  const attitude = String(scene?.attitude || "").trim();
  beats.push({
    role: "girl",
    text: attitude
      ? fill(`（暫定台詞）……${attitude.slice(0, 80)}${attitude.length > 80 ? "…" : ""}`)
      : fill(`（暫定台詞）……${girl?.name || "她"}還沒開口，只是看著你。`),
    provisional: true,
  });
  return {
    beats,
    source: `script_packs · ${kind} · ${pack?.name || pack?.id || "?"} · 場景1`,
  };
}

function placeholderBeats(girl) {
  const fill = (t) => fillBinds(t, girl, playerName);
  return {
    beats: PLACEHOLDER_BEATS.map((b) => ({
      role: b.role,
      text: fill(b.text),
      provisional: true,
    })),
    source: "暫定台詞（尚無 sex/tease 場景1 旁白）",
  };
}

const WHO_ZH = { narr: "旁白", girl: "女子", player: "玩家" };

function renderLog(payload) {
  const box = $("vn-log");
  if (!box) return;
  const { beats, source } = payload;
  box.innerHTML = beats
    .map((b) => {
      const who = WHO_ZH[b.role] || b.role;
      const tag = b.provisional ? `<span class="tag">暫定台詞</span>` : "";
      return `<div class="beat ${esc(b.role)}"><div class="who">${esc(who)}${tag}</div><div class="tx">${esc(b.text)}</div></div>`;
    })
    .join("");
  const src = $("scene-src");
  if (src) src.textContent = source || "";
}

function startScene1() {
  if (!currentGirl) {
    setStatus("scene-status", "請先選看板娘", true);
    return;
  }
  const fromPack = beatsFromPack(currentGirl);
  const payload = fromPack || placeholderBeats(currentGirl);
  renderLog(payload);
  setStatus(
    "scene-status",
    fromPack
      ? `已進入場景 1（${currentGirl.name || currentGirl.id}）· 純文字`
      : `已進入場景 1（暫定台詞）· ${currentGirl.name || currentGirl.id}`,
    false
  );
}

function bind() {
  $("girl-sel")?.addEventListener("change", () => {
    const id = $("girl-sel").value;
    currentGirl = girls.find((g) => g.id === id) || null;
    renderGirlMeta();
  });
  $("btn-reload")?.addEventListener("click", () => loadGirls());
  $("btn-start")?.addEventListener("click", () => startScene1());
}

bind();
Promise.all([loadGirls(), loadPacks()]).catch(() => {});
