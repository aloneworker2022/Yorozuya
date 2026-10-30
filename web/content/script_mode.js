/** 劇本模式：調戲／口交／做愛。設計者寫場景、態度、旁白、生圖；調戲／口交必發，做愛依關係檢定進入。 */

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
  1: "開場：旁白打字 → 點對話框 → AI 打字 → 開場圖 → 再點。做愛接著進正戲；口交跳玩家高潮；調戲結束。",
  2: "正戲。肏鈕出現。每次肏先播一輪局部動畫。1/10 換正戲圖、1/10 玩家高潮、1/10 進投入、3/10 新 AI。",
  3: "投入。每次肏先播一輪局部動畫。1/10 換圖、1/10 玩家高潮、1/10 雙方高潮、3/10 新 AI。",
  4: "玩家高潮：換圖 → 旁白打字 → AI 打字 → 結束。",
  5: "雙方高潮：換圖 → 旁白打字 → AI 打字 → 結束。",
};

/** 肏時感情。場景4 的「第三場景」表＝玩家高潮（非妻偏負）；場景5＝雙方高潮。 */
export const AFF_RANGE = {
  2: { stranger: [-2, 0], friend: [-1, 0], girlfriend: [-1, 1], wife: [0, 1] },
  3: { stranger: [0, 1], friend: [0, 2], girlfriend: [1, 2], wife: [3, 3] },
  4: { stranger: [-2, 0], friend: [-2, 0], girlfriend: [-2, 0], wife: [1, 1] },
  5: { stranger: [5, 5], friend: [8, 8], girlfriend: [10, 10], wife: [15, 15] },
};

export const JUMP_RATE = 1 / 10;
export const THRUST_AI_RATE = 3 / 10;

/**
 * 正戲／投入按肏（互斥一骰）。
 * 場景2：換圖 / 玩家高潮 / 投入 / 新AI / 只播動畫
 * 場景3：換圖 / 玩家高潮 / 雙方高潮 / 新AI / 只播動畫
 */
export function rollSexThrust(scene) {
  const n = Number(scene) || 0;
  const r = Math.random();
  if (n === 2) {
    if (r < JUMP_RATE) return "swap";
    if (r < JUMP_RATE * 2) return "player";
    if (r < JUMP_RATE * 3) return "scene3";
    if (r < JUMP_RATE * 3 + THRUST_AI_RATE) return "ai";
    return "none";
  }
  if (n === 3) {
    if (r < JUMP_RATE) return "swap";
    if (r < JUMP_RATE * 2) return "player";
    if (r < JUMP_RATE * 3) return "both";
    if (r < JUMP_RATE * 3 + THRUST_AI_RATE) return "ai";
    return "none";
  }
  return "none";
}

export function kindScenes(kind) {
  return (KIND_SCENES[kind] || KIND_SCENES.tease).slice();
}

export function slotCount(scene) {
  return Number(scene) <= 1 ? 1 : 2;
}

export function emptySlot() {
  return { prompt: "", negative: "", ref: "", url: "" };
}

/** 跟 sex_anim／圖組庫同一組體位 id。劇本用來對上局部動畫圖組。 */
export const SEX_POSES = [
  { id: "missionary", label: "正常" },
  { id: "doggy", label: "背後" },
  { id: "cowgirl_front", label: "正面騎乘" },
];

export function sexPose(id) {
  return SEX_POSES.find(p => p.id === id) || null;
}

/** 這一景／這本劇本掛的圖組 id。景可覆寫本。 */
export function boundFramePackId(pack, spec) {
  const scene = String(spec?.framePackId || "").trim();
  if (scene) return scene;
  return String(pack?.framePackId || "").trim();
}

/**
 * 圖生圖參考圖：單張 slot.ref 優先；圖生圖模式再退回已掛圖組的對應幀。
 * slotIndex 0 → 1.png，1 → 2.png，以此類推（繞回 4）。
 * 直接 prompt 不掛圖組，免得開場穿衣服鏡頭被特寫骨架帶跑。
 */
export function poseRefForSlot({ spec, slot, slotIndex = 0, pack, framePack } = {}) {
  const own = String(slot?.ref || "").trim();
  if (own) return own;
  if (spec?.imgMode !== "ref") return "";
  if (!boundFramePackId(pack, spec) && !framePack) return "";
  const frames = (framePack && framePack.frames) || {};
  const i = Math.max(0, Number(slotIndex) || 0);
  const n = (i % 4) + 1;
  return String((frames[String(n)] || {}).url || "").trim();
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
  pack = null,
  framePack = null,
  slotIndex = 0,
} = {}) {
  const pos = fillBinds(slotExtra(slot, extraPose), girl, playerName);
  const neg = fillBinds(slotNegative(slot), girl, playerName);
  const pose = poseRefForSlot({ spec, slot, slotIndex, pack, framePack });
  const comfy = imgProvider === "comfy";
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
    framePackId: "",
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
    pose: "",
    framePackId: "",
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
    framePackId: String(s.framePackId || "").slice(0, 16),
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
  const pose = SEX_POSES.some(p => p.id === raw?.pose) ? raw.pose : "";
  return {
    id: String(raw?.id || uid()),
    name: String(raw?.name || KIND_ZH[kind] + "劇本").slice(0, 40),
    kind,
    pose,
    framePackId: String(raw?.framePackId || "").slice(0, 16),
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

/** 調戲／口交可強迫、一律發動；只有做愛依關係檢定（對齊牌制色情卡）。 */
export const TRIGGER_RATE = {
  tease: { stranger: 1, friend: 1, girlfriend: 1, wife: 1 },
  oral: { stranger: 1, friend: 1, girlfriend: 1, wife: 1 },
  sex: { stranger: 0.10, friend: 0.125, girlfriend: 1 / 3, wife: 0.50 },
};

export function triggerRate(kind, stage) {
  const k = KIND_SCENES[kind] ? kind : "tease";
  if (k === "tease" || k === "oral") return 1;
  const table = TRIGGER_RATE.sex;
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

/** 場景2／3 按肏跳景（相容舊呼叫）。新流程請用 rollSexThrust。 */
export function rollThrustJump(scene) {
  const act = rollSexThrust(scene);
  if (act === "player") return 4;
  if (act === "both") return 5;
  if (act === "scene3") return 3;
  return Number(scene) || 0;
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
