/** 劇本模式：調戲／口交／做愛。設計者寫場景、態度、旁白、生圖；上線依檢定進入。 */

import { bindContextFromGirl, resolveCardBinds, BIND_PLACEHOLDERS } from "./card_bind.js";

export { BIND_PLACEHOLDERS };

/** 旁白／態度／prompt 裡的 [name][eye][breast][player]… → 這隻妹子。 */
export function fillBinds(text, girl, playerName = "你") {
  const raw = String(text ?? "");
  if (!raw) return "";
  const ctx = bindContextFromGirl(girl, playerName);
  let s = resolveCardBinds(raw, ctx) || raw;
  const name = ctx.name || girl?.name || "她";
  const player = ctx.player || playerName || "你";
  return s
    .replace(/\[name\]/gi, name)
    .replace(/\{name\}/gi, name)
    .replace(/\[player\]/gi, player)
    .replace(/\{player\}/gi, player);
}

export function bindHint() {
  return BIND_PLACEHOLDERS.map(p => `[${p.key}]`).join(" ");
}

export const KIND_ZH = { tease: "調戲", oral: "口交", sex: "做愛" };

export const KIND_SCENES = {
  tease: [1],
  oral: [1, 4],
  sex: [1, 2, 3, 4, 5],
};

export const SCENE_ZH = {
  1: "場景1 · 開場",
  2: "場景2 · 正戲",
  3: "場景3 · 投入",
  4: "場景4 · 玩家高潮",
  5: "場景5 · 雙方高潮",
};

export const SCENE_BLURB = {
  1: "起始檢定通過後進入。一張圖。點對話框推進旁白／AI；旁白與 AI 都跑完才能進下一景。",
  2: "只有做愛。按肏推進，中央播局部做愛動畫掩飾。每次肏 1/10 跳場景4、1/10 進場景3。",
  3: "只有做愛。她更興奮投入（不論關係）。每次肏 1/10 到場景4、1/10 到場景5。",
  4: "玩家高潮射精。口交從場景1跳來。播完結束對話。",
  5: "女子高潮＋玩家射精。播完結束對話。",
};

/** 肏時感情。場景4 的「第三場景」表＝玩家高潮（非妻偏負）；場景5＝雙方高潮。 */
export const AFF_RANGE = {
  2: { stranger: [-2, 0], friend: [-1, 0], girlfriend: [-1, 1], wife: [0, 1] },
  3: { stranger: [0, 1], friend: [0, 2], girlfriend: [1, 2], wife: [3, 3] },
  4: { stranger: [-2, 0], friend: [-2, 0], girlfriend: [-2, 0], wife: [1, 1] },
  5: { stranger: [5, 5], friend: [8, 8], girlfriend: [10, 10], wife: [15, 15] },
};

export const JUMP_RATE = 1 / 10;

export function kindScenes(kind) {
  return (KIND_SCENES[kind] || KIND_SCENES.tease).slice();
}

export function slotCount(scene) {
  return Number(scene) <= 1 ? 1 : 2;
}

export function emptySlot() {
  return { prompt: "", negative: "", ref: "", url: "" };
}

/** 設計者手寫的正向／負向 tag。負向另轉 NO … 給 Grok。 */
export function slotExtra(slot, more = "") {
  return [slot?.prompt, more].map(x => String(x || "").trim()).filter(Boolean).join(", ");
}

export function slotNegative(slot) {
  return String(slot?.negative || "").trim();
}

/**
 * testword 與遊戲共用的劇本生圖下單。
 * 不帶立繪 ref（避免 Grok 只修半身證件照、把設計者 prompt 當小修）。
 */
export function buildScriptImgBody({
  girl,
  slot,
  spec,
  scene = 1,
  extraPose = "",
  playerName = "你",
  imgProvider = "grok-img",
  imgModel = "",
  llmModel = "",
  comfyUrl = "",
  comfyCkpt = "",
  style = "anime",
  outfit = "",
  keyPrefix = "script",
} = {}) {
  const pos = fillBinds(slotExtra(slot, extraPose), girl, playerName);
  const neg = fillBinds(slotNegative(slot), girl, playerName);
  const pose = spec?.imgMode === "ref" ? String(slot?.ref || "") : "";
  const comfy = imgProvider === "comfy" || !!pose;
  const n = Number(scene) || 1;
  return {
    key: `${keyPrefix}:${girl?.id || "x"}:${n}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: comfy ? (imgModel || llmModel || "grok-4.5") : (imgModel || "grok-4.5"),
    framing: n <= 1 ? "half" : "full",
    rating: "nsfw",
    style: style || "anime",
    character: girl,
    outfit: outfit || "",
    extra: pos,
    negative: neg,
    visual_neg: neg,
    prompt: "",
    cutout: false,
    lock_identity: true,
    retry: true,
    scene_kind: "script",
    ...(pose ? { pose_ref: pose, pose_denoise: 0.55 } : {}),
    ...(comfy ? { comfy_url: comfyUrl || "", ckpt: comfyCkpt || "" } : {}),
  };
}

export function emptyScene(n) {
  const count = slotCount(n);
  return {
    attitude: defaultAttitude(n),
    imgMode: "prompt",
    slots: Array.from({ length: count }, emptySlot),
    narr: [defaultNarr(n)],
  };
}

function defaultAttitude(n) {
  if (n === 3) return "不論關係，她比剛才更興奮、更投入。語氣碎、喘，講不了正常長句。";
  if (n === 4) return "玩家正在高潮射精。陌生／朋友抗拒丟臉；女友複雜；妻子接受。";
  if (n === 5) return "她也高潮，同時被射進去。失神、氣音。";
  if (n === 2) return "正戲進行中，還沒到高潮。依關係：陌生抗拒、朋友羞怒、女友又羞又要、妻子投入。";
  return "剛開始被調戲玩弄。依關係：陌生驚怒、朋友羞怒、女友害羞、妻子享受。只演開場，不要自己演高潮。";
}

function defaultNarr(n) {
  if (n === 2) return "你抓住 [name] 的腰，往裡頂。";
  if (n === 3) return "[name] 已經軟了，每一下都撞得更深。";
  if (n === 4) return "你繳械了，全射進 [name] 裡面。";
  if (n === 5) return "[name] 夾緊、自己先去了；你跟著射滿。";
  return "你伸手調戲玩弄 [name]。";
}

export const DEFAULT_KEYWORDS = {
  tease: ["調戲", "玩弄", "亂摸", "騷擾"],
  oral: ["口交", "含住", "含著", "幫我口", "給我吸"],
  sex: ["做愛", "交配", "插入", "肏你", "幹你"],
};

export function parseKeywords(raw) {
  if (Array.isArray(raw)) {
    return raw.map(x => String(x || "").trim()).filter(Boolean);
  }
  return String(raw || "").split(/[,，、\n;；]/).map(x => x.trim()).filter(Boolean);
}

export function emptyPack(kind, name) {
  const k = KIND_SCENES[kind] ? kind : "tease";
  const scenes = {};
  for (const n of kindScenes(k)) scenes[String(n)] = emptyScene(n);
  return {
    id: uid(),
    name: name || (KIND_ZH[k] + "劇本"),
    kind: k,
    keywords: (DEFAULT_KEYWORDS[k] || DEFAULT_KEYWORDS.tease).slice(),
    updated: Date.now(),
    scenes,
  };
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function normalizeSlot(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    prompt: String(s.prompt || ""),
    negative: String(s.negative || ""),
    ref: String(s.ref || ""),
    url: String(s.url || ""),
  };
}

export function normalizeScene(n, raw) {
  const base = emptyScene(n);
  const s = raw && typeof raw === "object" ? raw : {};
  const want = slotCount(n);
  const slots = (Array.isArray(s.slots) ? s.slots : []).map(normalizeSlot);
  while (slots.length < want) slots.push(emptySlot());
  const narr = (Array.isArray(s.narr) ? s.narr : []).map(x => String(x || ""));
  return {
    attitude: String(s.attitude || base.attitude),
    imgMode: s.imgMode === "ref" ? "ref" : "prompt",
    slots: slots.slice(0, want),
    narr: narr.length ? narr : [""],
  };
}

export function normalizePack(raw) {
  const kind = KIND_SCENES[raw?.kind] ? raw.kind : "tease";
  const scenes = {};
  for (const n of kindScenes(kind)) {
    scenes[String(n)] = normalizeScene(n, raw?.scenes?.[String(n)] || raw?.scenes?.[n]);
  }
  const keywords = parseKeywords(raw?.keywords);
  return {
    id: String(raw?.id || uid()),
    name: String(raw?.name || KIND_ZH[kind] + "劇本").slice(0, 40),
    kind,
    keywords: keywords.length ? keywords : (DEFAULT_KEYWORDS[kind] || DEFAULT_KEYWORDS.tease).slice(),
    updated: Number(raw?.updated) || Date.now(),
    scenes,
  };
}

export function normalizeData(raw) {
  const packs = Array.isArray(raw?.packs)
    ? raw.packs.map(normalizePack)
    : [emptyPack("tease"), emptyPack("oral"), emptyPack("sex")];
  const activeByKind = { ...(raw?.activeByKind || {}) };
  for (const k of Object.keys(KIND_ZH)) {
    if (!packs.some(p => p.id === activeByKind[k] && p.kind === k)) {
      const hit = packs.find(p => p.kind === k);
      if (hit) activeByKind[k] = hit.id;
    }
  }
  return { packs, activeByKind };
}

export function pickPack(data, kind) {
  const d = normalizeData(data);
  const k = KIND_SCENES[kind] ? kind : "tease";
  const id = d.activeByKind[k];
  return d.packs.find(p => p.id === id && p.kind === k)
    || d.packs.find(p => p.kind === k)
    || emptyPack(k);
}

export function resolveScriptKind(kind) {
  if (kind === "oral") return "oral";
  if (kind === "sex" || kind === "doggy" || kind === "cowgirl") return "sex";
  return "tease";
}

/**
 * 玩家台詞對上哪一份劇本：最長關鍵詞優先；同長（同詞平手）就從命中的裡面隨機抽一份。
 */
export function matchPackByText(data, text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  const d = normalizeData(data);
  let bestLen = 0;
  const hits = [];
  const seen = new Set();
  for (const p of d.packs) {
    let packLen = 0;
    for (const k of p.keywords || []) {
      if (!k || !t.includes(k)) continue;
      if (k.length > packLen) packLen = k.length;
    }
    if (!packLen) continue;
    if (packLen > bestLen) {
      bestLen = packLen;
      hits.length = 0;
      seen.clear();
    }
    if (packLen === bestLen && !seen.has(p.id)) {
      seen.add(p.id);
      hits.push(p);
    }
  }
  if (!hits.length) return null;
  return hits[Math.floor(Math.random() * hits.length)];
}

/** 關係發動機率：調戲較鬆、口交居中、做愛對齊牌制色情卡。 */
export const TRIGGER_RATE = {
  tease: { stranger: 0.20, friend: 0.40, girlfriend: 0.75, wife: 1 },
  oral: { stranger: 0.10, friend: 0.25, girlfriend: 0.55, wife: 0.90 },
  sex: { stranger: 0.10, friend: 0.125, girlfriend: 1 / 3, wife: 0.50 },
};

export function triggerRate(kind, stage) {
  const k = KIND_SCENES[kind] ? kind : "tease";
  const table = TRIGGER_RATE[k] || TRIGGER_RATE.tease;
  const st = String(stage || "stranger");
  return table[st] ?? table.stranger;
}

export function rollTrigger(kind, stage) {
  return Math.random() < triggerRate(kind, stage);
}

export const STAGE_ZH = { stranger: "陌生", friend: "朋友", girlfriend: "女友", wife: "妻子" };

/** 正：0～妻子門檻 180 對五顆；負：0～-10 對五顆裂心。 */
const AFF_HEART_POS = 36;
const AFF_HEART_NEG = 2;

export function affHeartState(aff) {
  const n = Number(aff) || 0;
  if (n >= 0) {
    return { cracked: false, filled: Math.max(0, Math.min(5, Math.round(n / AFF_HEART_POS))), total: 5 };
  }
  return { cracked: true, filled: Math.max(1, Math.min(5, Math.round(-n / AFF_HEART_NEG))), total: 5 };
}

export function affHeartsHtml(aff) {
  const { cracked, filled, total } = affHeartState(aff);
  const bits = [];
  for (let i = 0; i < total; i++) {
    const on = i < filled;
    const glyph = cracked ? "💔" : (on ? "♥" : "♡");
    bits.push(`<span class="h${on ? " on" : ""}" aria-hidden="true">${glyph}</span>`);
  }
  const n = Number(aff) || 0;
  const label = `好感 ${n}`;
  return `<span class="hearts${cracked ? " cracked" : ""}" title="${label}" aria-label="${label}">${bits.join("")}</span>`;
}

export function nextAfterScene1(kind) {
  if (kind === "oral") return 4;
  if (kind === "sex") return 2;
  return 0;
}

export function sceneEndsTalk(n) {
  return n === 4 || n === 5;
}

/** 場景2／3 按肏：1/10 高潮跳4；場景2另 1/10 到3；場景3另 1/10 到5。 */
export function rollThrustJump(scene) {
  const n = Number(scene) || 0;
  const r = Math.random();
  if (n === 2) {
    if (r < JUMP_RATE) return 4;
    if (r < JUMP_RATE * 2) return 3;
    return 2;
  }
  if (n === 3) {
    if (r < JUMP_RATE) return 4;
    if (r < JUMP_RATE * 2) return 5;
    return 3;
  }
  return n;
}

export function rollAffDelta(scene, stage) {
  const table = AFF_RANGE[Number(scene)];
  if (!table) return 0;
  const st = table[stage] || table.stranger;
  const a = st[0], b = st[1];
  if (a === b) return a;
  return a + Math.floor(Math.random() * (b - a + 1));
}

export function narrLines(scene) {
  return (scene?.narr || []).map(x => String(x || "").trim()).filter(Boolean);
}

/** 旁白與 AI 交錯：旁白1、AI1、旁白2、AI2… */
export function makeBeats(scene) {
  const lines = narrLines(scene);
  const src = lines.length ? lines : ["……"];
  const beats = [];
  for (const text of src) {
    beats.push({ kind: "narr", text });
    beats.push({ kind: "ai", text: "", pending: true });
  }
  return beats;
}

export function imageUrls(scene) {
  return (scene?.slots || []).map(s => s.url).filter(Boolean);
}

export function buildReplyMsgs(girlName, attitude, narr, stage) {
  const who = girlName || "她";
  return [
    {
      role: "system",
      content: [
        `你是「${who}」。只輸出台詞，不要旁白、不要引號、不要寫身體畫面。`,
        "1～3 句繁中。旗標不要。",
        `關係階段：${stage || "stranger"}。`,
        attitude ? `這一景態度：${attitude}` : "",
        `旁白若點名「${who}」，那就是在對你。`,
      ].filter(Boolean).join("\n"),
    },
    {
      role: "user",
      content: `（旁白：${narr}。用口語接這一拍。）`,
    },
  ];
}

export function buildPoseMsgs(girlName, reply) {
  return [
    {
      role: "system",
      content: [
        "把她的台詞翻成生圖用的表情與動作。",
        "只輸出兩行：",
        "表情：英文 danbooru tags",
        "動作：英文 danbooru tags",
        "不要敘事、不要中文、不要編號。",
      ].join("\n"),
    },
    {
      role: "user",
      content: `「${girlName || "她"}」說了：「${String(reply || "").slice(0, 200)}」。只輸出兩行。`,
    },
  ];
}

export function parsePoseLines(raw) {
  const t = String(raw || "");
  const face = /表情[:：]\s*(.+)/.exec(t)?.[1]?.trim() || "";
  const body = /動作[:：]\s*(.+)/.exec(t)?.[1]?.trim() || "";
  return { face, body, text: [face, body].filter(Boolean).join(", ") };
}
