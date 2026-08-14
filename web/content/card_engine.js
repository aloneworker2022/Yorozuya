// 互動牌制核心（無 DOM）
// 規格：docs/card-system.md；內容：web/content/cards.json
// 常數以 JSON defaults 為準；禁止擅自改 bubble_chance 等鎖定值。
// 詞墜繼承：token / parentId → content/token_chain.js

import {
  resolveTokenChain,
  formatTokenChain,
  resolveMergedEffect,
  tokenEffectBrief,
  tokenOf,
} from "./token_chain.js";
import {
  bindContextFromGirl,
  resolveCardBinds,
  identityLockBlock,
  listBindsInText,
  BIND_PLACEHOLDERS,
} from "./card_bind.js";

const STAGE_ORDER = ["stranger", "friend", "girlfriend", "wife"];

let DATA = null;
const BY_ID = Object.create(null);

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
function randInt(lo, hi) {
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}
function clamp(n, a, b) {
  return Math.max(a, Math.min(b, n));
}

/**
 * 遊戲資料已是「上線那一份牌組檔」的全文（由 /api/cards 或 active pack 載入）。
 * 檔內若還殘留舊的 card_sets/setId 標記，一律視為本檔內容、全部可用。
 */
export function setCardsData(data) {
  DATA = data;
  for (const k of Object.keys(BY_ID)) delete BY_ID[k];
  for (const c of data?.cards || []) {
    if (c?.id) BY_ID[c.id] = c;
  }
}

export function cardsReady() {
  return !!DATA && Array.isArray(DATA.cards);
}

export function cardById(id) {
  return BY_ID[id] || null;
}

export function allCards() {
  return DATA?.cards || [];
}

export function allCardsRaw() {
  return DATA?.cards || [];
}

/** 詞墜鏈（祖先→自己） */
export function cardTokenChain(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def) return [];
  return resolveTokenChain(def, BY_ID);
}

/** 例：`[問候] [說笑話]` */
export function cardTokenString(cardOrId) {
  return formatTokenChain(cardTokenChain(cardOrId));
}

export function cardTokenOf(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  return tokenOf(def);
}

export function cardMergedEffect(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def) return {};
  return resolveMergedEffect(def, BY_ID, { mode: "sum" });
}

export function cardTokenBrief(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def) return { tokens: "", descs: "", chain: [] };
  return tokenEffectBrief(def, BY_ID);
}

export function cardDefaults() {
  return DATA?.defaults || {};
}

export function d(key, fallback) {
  const v = DATA?.defaults?.[key];
  return v !== undefined && v !== null ? v : fallback;
}

// ── 色情卡（kind=erotic）──────────────────────────────────
// 規格：一律消耗；打出必 forceAnotherRound；依階段機率觸發做愛。
// 機率鎖死：陌生 1/10、朋友 1/8、女友 1/3、妻子 1/2。
//
// ── 做愛：前戲 kind=foreplay ／ 正戲 kind=intercourse ────
// 前戲：玩家 2 選 1（根→L1）。
// 正戲：系統隨機；每幕後權重 same/finish/next（預設 1/2、1/3、1/3 正規化）。
// finish＝跳玩家射精 L5 收束。不進商店、不進庫存、不扣 nLeft。

const SEX_TRIGGER_FALLBACK = {
  stranger: 1 / 10,
  friend: 1 / 8,
  girlfriend: 1 / 3,
  wife: 1 / 2,
};

/** 是否色情卡（kind=erotic） */
export function isEroticCard(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  return !!def && def.kind === "erotic";
}

/** 做愛內容卡（前戲／正戲／舊 kind=sex） */
export function isSexCard(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def) return false;
  return def.kind === "foreplay" || def.kind === "intercourse" || def.kind === "sex";
}

/** 前戲卡 */
export function isForeplayCard(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def || !isSexCard(def)) return false;
  if (def.kind === "foreplay") return true;
  if (def.kind === "intercourse") return false;
  const t = def.sexTier || "";
  return !!def.sexBase || t === "foreplay" || t === "foreplay_l1" || t.startsWith("foreplay");
}

/** 正戲卡（含激烈／她高潮／玩家收束） */
export function isIntercourseCard(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def || !isSexCard(def)) return false;
  if (def.kind === "intercourse") return true;
  if (def.kind === "foreplay") return false;
  const t = def.sexTier || "";
  return t.startsWith("sex_act") || def.sexPhase === "intercourse" || def.sexPhase === "climax"
    || def.sexPhase === "player_climax" || def.sexPhase === "intercourse_intense" || !!def.sexEnd;
}

/** 玩家射精收束卡 */
export function isSexFinishCard(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def || !isSexCard(def)) return false;
  return !!(def.sexEnd || def.sexTier === "sex_act_l5" || def.sexPhase === "player_climax");
}

/** 色情卡是否用則碎（規格：一律 true；JSON 寫錯也當 true） */
export function eroticShatters(def) {
  return isEroticCard(def);
}

/**
 * 色情卡 → 做愛觸發率（0～1）。
 * 優先 defaults.sex_trigger_by_stage；缺表用分數常數。
 */
export function sexTriggerChance(stage) {
  const table = d("sex_trigger_by_stage", null);
  const raw = table?.[stage] ?? SEX_TRIGGER_FALLBACK[stage] ?? SEX_TRIGGER_FALLBACK.stranger;
  const p = Number(raw);
  if (!Number.isFinite(p)) return SEX_TRIGGER_FALLBACK.stranger;
  return clamp(p, 0, 1);
}

/** 擲是否觸發做愛 */
export function rollSexTrigger(stage) {
  return Math.random() < sexTriggerChance(stage);
}

function sampleIds(ids, n) {
  const arr = [...new Set((ids || []).filter(Boolean))];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.slice(0, Math.max(0, n));
}

function pickRandomId(ids) {
  if (!ids?.length) return null;
  return ids[Math.floor(Math.random() * ids.length)];
}

/**
 * 基礎前戲根卡池。
 * 優先 defaults.sex_base_pool；否則 kind=foreplay 且 sexBase／無 parent。
 */
export function sexBasePoolIds() {
  const listed = d("sex_base_pool", null);
  if (Array.isArray(listed) && listed.length) {
    return listed.filter((id) => BY_ID[id] && isForeplayCard(id));
  }
  return (DATA?.cards || [])
    .filter((c) => c?.id && isForeplayCard(c) && (c.sexBase || !c.parentId) && BY_ID[c.id])
    .map((c) => c.id);
}

/** 全部做愛卡 id */
export function sexAllPoolIds() {
  const sw = DATA?.shop_weights?.sex_pool;
  if (Array.isArray(sw) && sw.length) {
    return sw.filter((id) => BY_ID[id] && isSexCard(id));
  }
  return (DATA?.cards || [])
    .filter((c) => c?.id && isSexCard(c) && BY_ID[c.id])
    .map((c) => c.id);
}

/** 直屬子卡 */
export function sexChildIds(parentId) {
  if (!parentId) return [];
  return sexAllPoolIds().filter((id) => BY_ID[id]?.parentId === parentId);
}

/** 沿 parentId 走到根 */
export function sexRootId(cardId) {
  let cur = BY_ID[cardId];
  let guard = 0;
  while (cur?.parentId && BY_ID[cur.parentId] && guard++ < 40) {
    cur = BY_ID[cur.parentId];
  }
  return cur?.id || cardId || null;
}

/** 同根下的玩家收束卡 */
export function sexFinishPoolIds(rootId) {
  const root = rootId || null;
  return sexAllPoolIds().filter((id) => {
    if (!isSexFinishCard(id)) return false;
    if (!root) return true;
    return sexRootId(id) === root;
  });
}

/**
 * 正戲分支：same | finish | next
 * defaults.sex_intercourse_roll 作相對權重再正規化（口頭 1/2、1/3、1/3）。
 */
export function rollIntercourseBranch({ sameCount = 0 } = {}) {
  const maxSame = Math.max(0, Number(d("sex_same_max", 2)) || 2);
  const raw = d("sex_intercourse_roll", { same: 0.5, finish: 1 / 3, next: 1 / 3 });
  let wSame = Number(raw?.same);
  let wFinish = Number(raw?.finish);
  let wNext = Number(raw?.next);
  if (!Number.isFinite(wSame) || wSame < 0) wSame = 0.5;
  if (!Number.isFinite(wFinish) || wFinish < 0) wFinish = 1 / 3;
  if (!Number.isFinite(wNext) || wNext < 0) wNext = 1 / 3;
  if (sameCount >= maxSame) wSame = 0;
  const sum = wSame + wFinish + wNext;
  if (sum <= 0) return "finish";
  const r = Math.random() * sum;
  if (r < wSame) return "same";
  if (r < wSame + wFinish) return "finish";
  return "next";
}

/** 抽卡 id（prefer 優先） */
export function pickSexCardId({ excludeIds = [], preferId = null } = {}) {
  const ban = new Set(excludeIds || []);
  if (preferId && isSexCard(preferId) && !ban.has(preferId)) return preferId;
  let pool = sexBasePoolIds().filter((id) => !ban.has(id));
  if (!pool.length) pool = sexAllPoolIds().filter((id) => !ban.has(id));
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 目前是否在「前戲 2 選 1」 */
export function sexNeedsChoice(state) {
  const p = state?.cardSession?.pendingSex;
  return !!(p && p.mode === "choose" && Array.isArray(p.choices) && p.choices.length);
}

/** 前戲選項卡定義列表 */
export function sexChoiceOptions(state) {
  if (!sexNeedsChoice(state)) return [];
  return (state.cardSession.pendingSex.choices || [])
    .map((id) => cardById(id))
    .filter(Boolean);
}

/**
 * 用則碎？（規格：色情卡一律碎；做愛卡不進庫存故不走碎庫）
 */
export function shattersOnUse(cardOrId) {
  const def = typeof cardOrId === "string" ? cardById(cardOrId) : cardOrId;
  if (!def) return false;
  if (isSexCard(def)) return false;
  if (def.kind === "erotic") return true;
  return !!def.shatterOnUse;
}

/**
 * 創角基礎卡池（永久、不碎）：
 * 1) starter_pool 裡且卡片存在、且可當底色
 * 2) 加上 cards 裡 starter:true 的
 * 3) 若仍空：退回 kind=speech 且不碎的卡
 * 4) 再空：[] —— **禁止**把碎卡／整包塞進來（會讓創角抽到後 grant 失敗而卡死）
 */
export function starterPoolIds() {
  const cards = DATA?.cards || [];
  const by = Object.create(null);
  for (const c of cards) {
    if (c?.id) by[c.id] = c;
  }
  const out = [];
  const seen = new Set();
  const canStart = (id) => {
    const c = by[id];
    if (!c) return false;
    // 碎卡、本體、場地絕不能當創角底色
    if (c.shatterOnUse) return false;
    if (c.kind === "girl_trait" || c.kind === "venue_event" || isSexCard(c)) return false;
    return true;
  };
  const push = (id) => {
    if (!id || seen.has(id) || !by[id] || !canStart(id)) return;
    seen.add(id);
    out.push(id);
  };
  for (const id of DATA?.starter_pool || []) push(id);
  for (const c of cards) {
    if (c.starter) push(c.id);
  }
  if (!out.length) {
    for (const c of cards) {
      if (c.kind === "speech" && !c.shatterOnUse) push(c.id);
    }
  }
  // 不再 fallback 整包——NSFW 純碎卡包應回 []，創角走「略過底色」
  return out;
}

export function activePackMeta() {
  const m = DATA?._meta || {};
  return {
    packId: m.active_pack || m.pack_id || null,
    file: m.active_file || null,
    title: m.title || null,
    liveEpoch: m.live_epoch ?? m.liveEpoch ?? 0,
  };
}

export function venuesList() {
  return DATA?.venues || [];
}

export function bubbleCanned() {
  return DATA?.bubble_canned || {};
}

export function stageIndex(stage) {
  const i = STAGE_ORDER.indexOf(stage);
  return i < 0 ? 0 : i;
}

export function stageOk(stage, minStage) {
  if (!minStage) return true;
  return stageIndex(stage) >= stageIndex(minStage);
}

// ── Inventory ──────────────────────────────────────────────

export function invEntry(state, cardId) {
  return state.cardInventory?.[cardId] || null;
}

export function invCount(state, cardId) {
  const e = invEntry(state, cardId);
  return e ? (e.count || 0) : 0;
}

/** 話術／不碎卡：已解鎖即擁有；碎卡看 count */
export function invOwns(state, cardId) {
  const def = BY_ID[cardId];
  if (!def) return false;
  const e = invEntry(state, cardId);
  if (!e) return false;
  if (!shattersOnUse(def)) return !!(e.unlocked || e.count > 0);
  return (e.count || 0) > 0;
}

export function invAdd(state, cardId, n = 1) {
  const def = BY_ID[cardId];
  if (!def) return false;
  state.cardInventory ??= {};
  const e = (state.cardInventory[cardId] ??= { count: 0 });
  if (!shattersOnUse(def)) {
    e.unlocked = true;
    e.count = 1;
  } else {
    e.count = (e.count || 0) + n;
  }
  return true;
}

/** 確認使用碎卡後扣庫存，並立刻從出戰牌組踢掉用光的 id */
export function invShatter(state, cardId) {
  const def = BY_ID[cardId];
  if (!shattersOnUse(def)) return;
  const e = state.cardInventory?.[cardId];
  if (!e) {
    pruneDeck(state);
    return;
  }
  e.count = Math.max(0, (e.count || 0) - 1);
  // 用光：刪庫存條目，避免幽靈 count:0 佔位
  if ((e.count || 0) <= 0) {
    delete state.cardInventory[cardId];
    // 誤當底色的碎卡用光 → 清指標，避免 prune 又塞回幽靈
    if (state.playerProfile?.starterSpeechCardId === cardId) {
      state.playerProfile.starterSpeechCardId = null;
    }
  }
  // 牌組必須同步（否則組卡畫面還掛著已碎卡，開戰也會整組注入失敗）
  pruneDeck(state);
}

/** 可否當創角底色話術（永久、不碎） */
export function isStarterEligible(cardId) {
  const def = BY_ID[cardId];
  if (!def) return false;
  if (shattersOnUse(def) || def.kind === "erotic" || isSexCard(def)) return false;
  if (def.kind === "girl_trait" || def.kind === "venue_event" || isSexCard(def)) return false;
  if (def.starter) return true;
  const pool = starterPoolIds();
  if (pool.length) return pool.includes(cardId);
  // 池空：只允許 kind=speech 的不碎卡
  return def.kind === "speech";
}

export function grantStarter(state, cardId) {
  const def = BY_ID[cardId];
  if (!def) {
    return {
      ok: false,
      err: `找不到卡「${cardId}」——目前上線卡組可能沒載入到這張（請在 /cardedit 確認已上線、且 starter_pool／starter 有勾）`,
    };
  }
  if (!isStarterEligible(cardId)) {
    return { ok: false, err: "不是創角話術（需不碎的 speech／starter；碎卡不能當底色）" };
  }
  invAdd(state, cardId, 1);
  state.playerProfile ??= {};
  state.playerProfile.starterSpeechCardId = cardId;
  return { ok: true };
}

/**
 * 清空玩家端全部卡牌進度（換上線牌組時硬切）。
 * 不動金幣／委託／魅魔等非牌制欄位。
 */
export function resetPlayerCardProgress(state, { packId = null, epoch = 0 } = {}) {
  state.cardInventory = {};
  state.cardDeck = [];
  state.deckPresets = [];
  state.cardShop = null;
  state.cardSession = null;
  state.playerProfile ??= {
    name: "",
    body: "",
    look: "",
    habit: "",
    prefs: [],
    starterSpeechCardId: null,
    cardPlayerLv: 0,
    onboardDone: false,
  };
  state.playerProfile.starterSpeechCardId = null;
  // 換包後必須重跑創角（含「無 starter 池直接進」的標記）
  state.playerProfile.onboardDone = false;
  state.cardsLive = {
    packId: packId || null,
    epoch: epoch ?? 0,
  };
  return state.cardsLive;
}

/**
 * 綁定存檔到「目前上線」牌組。
 * - packId / liveEpoch 與存檔一致 → 不動
 * - 首次寫入 cardsLive 且庫存全是本包合法卡 → 軟綁定（不洗進度）
 * - 否則硬清玩家牌庫／貨架／牌組／創角話術
 */
export function bindLivePack(state, packId, epoch = 0) {
  const pid = packId || null;
  const ep = epoch ?? 0;
  state.cardsLive ??= { packId: null, epoch: 0 };
  const prev = state.cardsLive;
  if (prev.packId === pid && (prev.epoch ?? 0) === ep) {
    return { wiped: false, reason: "same" };
  }
  // 首次導入：無 pack 綁定
  if (prev.packId == null) {
    const invIds = Object.keys(state.cardInventory || {});
    const orphans = invIds.filter(id => !BY_ID[id]);
    const starter = state.playerProfile?.starterSpeechCardId;
    const starterOk = !starter || !!BY_ID[starter];
    const shopOrphans = (state.cardShop?.slots || []).some(
      s => s?.cardId && !BY_ID[s.cardId],
    );
    if (!orphans.length && starterOk && !shopOrphans) {
      state.cardsLive = { packId: pid, epoch: ep };
      // 順手標貨架所屬
      if (state.cardShop && typeof state.cardShop === "object") {
        state.cardShop.packId = pid;
      }
      return { wiped: false, reason: "migrate_bind" };
    }
  }
  resetPlayerCardProgress(state, { packId: pid, epoch: ep });
  return { wiped: true, reason: "pack_switch", from: prev.packId, to: pid, epoch: ep };
}

/**
 * 舊存檔相容：已有進度卻沒話術 → 補一張；全新檔不自動給，留給創角輪巡。
 * 剛因換上線牌組洗過進度時也不自動補（要重抽創角話術）。
 */
export function ensureStarterFallback(state) {
  state.cardInventory ??= {};
  state.playerProfile ??= {
    name: "",
    body: "",
    look: "",
    habit: "",
    prefs: [],
    starterSpeechCardId: null,
    cardPlayerLv: 0,
  };
  const sid0 = state.playerProfile.starterSpeechCardId;
  // 幽靈／碎卡底色 → 清掉（碎卡用光後絕不可自動「補回」）
  if (sid0) {
    const sdef = BY_ID[sid0];
    if (!sdef || sdef.shatterOnUse || !isStarterEligible(sid0)) {
      state.playerProfile.starterSpeechCardId = null;
    }
  }
  const hasAnySpeech = Object.keys(state.cardInventory).some(id => {
    const def = BY_ID[id];
    return def && def.kind === "speech" && !def.shatterOnUse && invOwns(state, id);
  });
  if (hasAnySpeech) {
    if (!state.playerProfile.starterSpeechCardId) {
      const first = Object.keys(state.cardInventory).find(id => {
        const def = BY_ID[id];
        return def && def.kind === "speech" && !def.shatterOnUse && invOwns(state, id);
      });
      if (first) state.playerProfile.starterSpeechCardId = first;
    }
    pruneDeck(state);
    return;
  }
  // starter 指向別包幽靈卡 → 已在上面清掉
  if (!state.playerProfile.starterSpeechCardId) {
    // 全新／重置／換包後：不自動發卡
    const progressed =
      (state.succubi?.length || 0) > 0 ||
      (state.gold || 0) !== 0 ||
      (state.quests?.length || 0) > 0 ||
      (state.dungeon?.length || 0) > 0;
    if (!progressed) {
      pruneDeck(state);
      return;
    }
    // 舊存檔有進度卻完全沒牌制欄位（且尚未綁定過 cardsLive）
    if (state.cardsLive?.packId) {
      pruneDeck(state);
      return;
    }
    const sid = starterPoolIds().find(id => isStarterEligible(id));
    if (!sid) {
      pruneDeck(state);
      return;
    }
    invAdd(state, sid, 1);
    state.playerProfile.starterSpeechCardId = sid;
    pruneDeck(state);
    return;
  }
  // 已寫過合法 starter 且為不碎話術、庫存空了 → 補回一張（永久話術）
  const sid = state.playerProfile.starterSpeechCardId;
  if (isStarterEligible(sid) && !invOwns(state, sid)) {
    invAdd(state, sid, 1);
  }
  pruneDeck(state);
}

/**
 * 依 tag 分數從 starter_pool 配一張基礎話術。
 * scores: { soft: n, blunt: n, ... } 對應 speech_* 後綴
 * （舊創角測驗用；現改隨機 starter，仍保留供相容）
 */
export function pickStarterByScores(scores = {}) {
  const pool = starterPoolIds();
  let bestId = pool[0] || "speech_soft";
  let best = -Infinity;
  for (const id of pool) {
    const key = id.startsWith("speech_") ? id.slice("speech_".length) : id;
    const sc = scores[key] || 0;
    if (sc > best) {
      best = sc;
      bestId = id;
    } else if (sc === best && Math.random() < 0.5) {
      bestId = id; // 同分隨機
    }
  }
  return bestId;
}

/** 從 starter 池均勻隨機一張；池空回 null */
export function pickStarterRandom() {
  const pool = starterPoolIds();
  if (!pool.length) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ── Card shop（state.cardShop；勿與祭品 state.shop 混淆）──

function currentPackKey() {
  const m = DATA?._meta || {};
  return m.active_pack || m.active_file || m.pack_id || m.title || "";
}

/**
 * 商店池：優先 shop_weights.speech_pool / premium_pool / erotic_pool（只收本包存在的 id）。
 * 若某池為空（空牌組剛加卡、編輯器沒寫 pool 很常見）→ 回退到本包 kind。
 * girl_trait / venue_event 永不進玩家貨架。
 * erotic 與 shop_premium 都算「高級／色情貨架」，可進 premium 偏好槽。
 */
function resolveShopPools() {
  const sw = DATA?.shop_weights || {};
  const listedSpeech = (sw.speech_pool || []).filter(id => BY_ID[id]);
  const listedPrem = (sw.premium_pool || []).filter(id => BY_ID[id]);
  const listedErotic = (sw.erotic_pool || []).filter(id => BY_ID[id]);
  const speech = listedSpeech.length
    ? listedSpeech
    : (DATA?.cards || [])
        .filter(c => c?.id && c.kind === "speech" && BY_ID[c.id])
        .map(c => c.id);
  const premiumFromKind = (DATA?.cards || [])
    .filter(c => c?.id && c.kind === "shop_premium" && BY_ID[c.id])
    .map(c => c.id);
  const eroticFromKind = (DATA?.cards || [])
    .filter(c => c?.id && c.kind === "erotic" && BY_ID[c.id])
    .map(c => c.id);
  // kind=sex 永不進貨架（只由 pendingSex 系統抽）
  // premium 槽：列名 premium + erotic；空則 kind 回退
  const premiumListed = [...listedPrem, ...listedErotic];
  const premium = premiumListed.length
    ? premiumListed
    : [...premiumFromKind, ...eroticFromKind];
  return { speech, premium, combined: [...speech, ...premium] };
}

function weightedPick(ids) {
  const items = [];
  for (const id of ids) {
    const def = BY_ID[id];
    if (!def) continue;
    items.push({ id, w: def.shopWeight ?? 1 });
  }
  if (!items.length) return null;
  const total = items.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= it.w;
    if (r <= 0) return it.id;
  }
  return items[items.length - 1].id;
}

/** 貨架是否仍對應當前上線牌組（切 pack 後舊 slot 會殘留幽靈卡） */
function cardShopStale(shop) {
  if (!shop || !Array.isArray(shop.slots)) return true;
  const pack = currentPackKey();
  if (shop.packId != null && pack && shop.packId !== pack) return true;
  for (const slot of shop.slots) {
    if (slot?.cardId && !BY_ID[slot.cardId]) return true;
  }
  return false;
}

export function refreshCardShop(state, now = Date.now()) {
  const slotsN = d("shop_slots", 3);
  const hours = d("shop_refresh_hours", 4);
  const { speech, premium, combined } = resolveShopPools();
  // 可上架張數少於槽位時只填能填的，避免 ensure 永遠 length!==3 狂刷
  const maxUnique = new Set(combined).size;
  const fillN = maxUnique > 0 ? Math.min(slotsN, maxUnique) : 0;
  const slots = [];
  const used = new Set();
  for (let i = 0; i < fillN; i++) {
    const prefer = i === 0 ? speech : Math.random() < 0.3 ? speech : premium;
    let id = null;
    for (let t = 0; t < 24; t++) {
      const cand = weightedPick(prefer.length ? prefer : combined);
      if (cand && !used.has(cand)) {
        id = cand;
        break;
      }
    }
    if (!id) id = weightedPick(combined.filter(x => !used.has(x)));
    if (!id) id = weightedPick(combined);
    if (!id) continue;
    used.add(id);
    const def = BY_ID[id];
    slots.push({
      cardId: id,
      price: def?.price ?? 10,
      sold: false,
      isSale: false,
      salePrice: null,
    });
  }
  // 0～1 張特價（高級／色情 7 折）
  const premIdx = slots
    .map((s, i) => i)
    .filter(i => {
      const k = BY_ID[slots[i].cardId]?.kind;
      return k === "shop_premium" || k === "erotic";
    });
  if (premIdx.length && Math.random() < 0.55) {
    const i = premIdx[Math.floor(Math.random() * premIdx.length)];
    slots[i].isSale = true;
    slots[i].salePrice = Math.max(1, Math.floor(slots[i].price * 0.7));
  }
  state.cardShop = {
    packId: currentPackKey() || null,
    nextRefreshAt: now + hours * 3600 * 1000,
    slots,
  };
}

export function ensureCardShop(state, now = Date.now()) {
  state.cardShop ??= { nextRefreshAt: 0, slots: [], packId: null };
  const shop = state.cardShop;
  const slotsN = d("shop_slots", 3);
  const { combined } = resolveShopPools();
  const expected = Math.min(slotsN, new Set(combined).size);
  // 已售罄可暫時少於 expected；只有「整架對不上當前 pack／幽靈 id／超額／到期」才重擲
  const overfilled = Array.isArray(shop.slots) && shop.slots.length > Math.max(expected, slotsN);
  const need =
    cardShopStale(shop) ||
    !Array.isArray(shop.slots) ||
    overfilled ||
    (expected > 0 && shop.slots.length === 0) ||
    now >= (shop.nextRefreshAt || 0);
  if (need) refreshCardShop(state, now);
  return state.cardShop;
}

export function buyFromCardShop(state, slotIndex) {
  ensureCardShop(state);
  const slot = state.cardShop.slots[slotIndex];
  if (!slot) return { ok: false, err: "貨架空了" };
  if (slot.sold) return { ok: false, err: "已售出" };
  const def = BY_ID[slot.cardId];
  if (!def) return { ok: false, err: "卡不存在" };
  if (!shattersOnUse(def) && invOwns(state, slot.cardId)) {
    return { ok: false, err: "已擁有這張話術" };
  }
  const price = slot.isSale && slot.salePrice != null ? slot.salePrice : slot.price;
  if ((state.gold || 0) < price) return { ok: false, err: "金幣不夠" };
  state.gold -= price;
  invAdd(state, slot.cardId, 1);
  slot.sold = true;
  return { ok: true, cardId: slot.cardId, price, name: def.name, shatter: shattersOnUse(def) };
}

export function inventoryList(state) {
  const rows = [];
  for (const [id, e] of Object.entries(state.cardInventory || {})) {
    const def = BY_ID[id];
    if (!def) continue;
    const shatter = shattersOnUse(def);
    if (!shatter && !(e.unlocked || e.count > 0)) continue;
    if (shatter && !(e.count > 0)) continue;
    rows.push({
      cardId: id,
      name: def.name,
      kind: def.kind,
      shatterOnUse: shatter,
      erotic: def.kind === "erotic",
      count: shatter ? e.count || 0 : 1,
      rarity: def.rarity || "N",
      tags: def.tags || [],
      price: def.price || 0,
    });
  }
  rows.sort((a, b) => {
    if (a.kind !== b.kind) return a.kind < b.kind ? -1 : 1;
    return a.name.localeCompare(b.name, "zh-Hant");
  });
  return rows;
}

// ── Instance helpers ───────────────────────────────────────

export function makeInstance(cardId, source) {
  return {
    instanceId: uid(),
    cardId,
    source,
    used: false,
  };
}

/**
 * 弱台詞：空、只有省略號／標點——不能當她的回應。
 * AI 常偷懶回「……」，必須當失敗回落（M4 即時路徑）。
 */
export function isWeakLine(s) {
  if (s == null) return true;
  const t = String(s).trim();
  if (!t) return true;
  // 去掉省略號、句點、全形空白後幾乎沒字
  const core = t
    .replace(/[\s.…・.．。，,、！!？?～~「」『』（）()【】\[\]\-—–]/g, "")
    .replace(/^\.+|\.+$/g, "");
  return core.length < 2;
}

/**
 * 舊存檔若卡在 pregen／ready（整輪預產時代）→ 正規成 round_play。
 * 即時 AI 路徑不再使用這兩個 phase。
 */
export function normalizeSessionPhase(sess) {
  if (!sess) return sess;
  if (sess.phase === "pregen" || sess.phase === "ready") {
    sess.phase = "round_play";
  }
  ensureArc(sess);
  // 舊局：只有 drawPile／hand、沒有 sessionDeck → 合成實體池；手牌超過 hand_draw 則截斷
  if (!Array.isArray(sess.sessionDeck) || !sess.sessionDeck.length) {
    const merged = [];
    const seen = new Set();
    for (const c of [...(sess.hand || []), ...(sess.drawPile || [])]) {
      if (!c?.instanceId || seen.has(c.instanceId)) continue;
      seen.add(c.instanceId);
      merged.push({ ...c, shattered: !!c.shattered, used: !!c.used });
    }
    if (merged.length) sess.sessionDeck = merged;
  }
  const hd = handDrawCount();
  if (Array.isArray(sess.hand) && sess.hand.length > hd) {
    sess.hand = sess.hand.slice(0, hd);
  }
  return sess;
}

export function compatible(cardDef, chainAttr) {
  if (!chainAttr || chainAttr === "any") return true;
  const tags = cardDef?.tags || [];
  if (tags.includes("any")) return true;
  return tags.includes(chainAttr);
}

export function maxInject(state) {
  // v7：固定 8（defaults.max_inject）；成長軸日後再接 cardPlayerLv
  return d("max_inject", 8);
}

/** 每輪抽幾張（v7；不再用 hand_size 當補牌上限） */
export function handDrawCount() {
  return Math.max(1, Number(d("hand_draw", 2)) || 2);
}

// ── 出戰牌組（商店頁編輯；開戰直接用，不再局內組牌）────────

/** 校驗一組 cardId 可否當押入／牌組（庫存與上限） */
export function validateInjectIds(state, injectCardIds) {
  const max = maxInject(state);
  const ids = (injectCardIds || []).slice(0, max);
  const need = Object.create(null);
  for (const id of ids) need[id] = (need[id] || 0) + 1;
  for (const [id, n] of Object.entries(need)) {
    const def = BY_ID[id];
    if (!def) return { ok: false, err: `未知卡 ${id}`, ids: [] };
    if (def.kind === "girl_trait" || def.kind === "venue_event" || isSexCard(def)) {
      return { ok: false, err: "本體／場地／做愛卡不能進牌組", ids: [] };
    }
    if (!shattersOnUse(def)) {
      if (!invOwns(state, id)) return { ok: false, err: `未擁有「${def.name}」`, ids: [] };
      if (n > 1) return { ok: false, err: `話術「${def.name}」牌組只能 1 張`, ids: [] };
    } else if (invCount(state, id) < n) {
      return { ok: false, err: `「${def.name}」庫存不足`, ids: [] };
    }
  }
  return { ok: true, ids, err: null };
}

/** 依庫存修剪牌組（賣光／用光的碎卡踢掉） */
export function pruneDeck(state) {
  state.cardDeck ??= [];
  const max = maxInject(state);
  const next = [];
  const need = Object.create(null);
  for (const id of state.cardDeck) {
    if (next.length >= max) break;
    const def = BY_ID[id];
    if (!def || def.kind === "girl_trait" || def.kind === "venue_event" || isSexCard(def)) continue;
    const n = (need[id] || 0) + 1;
    if (!shattersOnUse(def)) {
      if (!invOwns(state, id) || n > 1) continue;
    } else if (invCount(state, id) < n) {
      continue;
    }
    need[id] = n;
    next.push(id);
  }
  // 空牌組且有創角話術 → 僅在「真的擁有且不碎」時自動放一張
  // 禁止：只因 BY_ID 存在就塞回（會把已碎／未擁有卡變成幽靈牌組 → 組卡占位、開戰整組失敗）
  if (!next.length && state.playerProfile?.starterSpeechCardId) {
    const sid = state.playerProfile.starterSpeechCardId;
    const sdef = BY_ID[sid];
    if (sdef && !shattersOnUse(sdef) && invOwns(state, sid)) {
      next.push(sid);
    } else if (shattersOnUse(sdef) || (sid && !invOwns(state, sid))) {
      // 底色指向碎卡或已無庫存 → 清掉幽靈指標
      if (shattersOnUse(sdef) || !sdef) state.playerProfile.starterSpeechCardId = null;
    }
  }
  state.cardDeck = next;
  return state.cardDeck;
}

export function getDeck(state) {
  return pruneDeck(state);
}

export function setDeck(state, cardIds) {
  const v = validateInjectIds(state, cardIds);
  if (!v.ok) return v;
  state.cardDeck = v.ids.slice();
  return { ok: true, deck: state.cardDeck };
}

export function addToDeck(state, cardId) {
  const deck = getDeck(state).slice();
  const max = maxInject(state);
  if (deck.length >= max) return { ok: false, err: `牌組最多 ${max} 張` };
  deck.push(cardId);
  return setDeck(state, deck);
}

export function removeFromDeckAt(state, index) {
  const deck = getDeck(state).slice();
  if (index < 0 || index >= deck.length) return { ok: false, err: "位置無效" };
  deck.splice(index, 1);
  state.cardDeck = deck;
  return { ok: true, deck };
}

export function deckCountOf(state, cardId) {
  return getDeck(state).filter(id => id === cardId).length;
}

export function basePlays(stage, guardHigh) {
  const table = d("base_plays_by_stage", {
    stranger: 1,
    friend: 2,
    girlfriend: 3,
    wife: 4,
  });
  let n = table[stage] ?? 1;
  if (guardHigh) n = Math.max(1, n - 1);
  return n;
}

export function stayChance(stage) {
  const table = d("stay_base_by_stage", {
    stranger: 0.05,
    friend: 0.15,
    girlfriend: 0.3,
    wife: 0.45,
  });
  return clamp(table[stage] ?? 0.05, 0.05, 0.5);
}

// ── Girl trait cards ───────────────────────────────────────

/** 各關係階段要掛幾張「個性本體」：陌生1／朋友1／女友2／妻子3 */
const ARCH_STAGE_COUNTS = {
  stranger: 1,
  friend: 1,
  girlfriend: 2,
  wife: 3,
};

function girlArchetypeName(girl) {
  if (!girl) return "";
  if (typeof girl.archetype === "string" && girl.archetype.trim()) return girl.archetype.trim();
  if (Array.isArray(girl.personality) && girl.personality[0]) return String(girl.personality[0]).trim();
  if (typeof girl.personality === "string" && girl.personality.trim()) {
    return girl.personality.split(/[、,]/)[0].trim();
  }
  return "";
}

/**
 * 依 archetypeBind + stageBind 挑該個性在此階段的本體牌（id 排序穩定）。
 */
export function pickArchetypeStageCards(archName, stage, limit) {
  if (!archName || !stage || limit <= 0) return [];
  const cards = (DATA?.cards || []).filter((c) => {
    if (!c || c.kind !== "girl_trait") return false;
    if (c.archetypeBind !== archName) return false;
    const bind = c.stageBind;
    if (Array.isArray(bind) && bind.length) return bind.includes(stage);
    return c.minStage === stage;
  });
  cards.sort((a, b) => String(a.id).localeCompare(String(b.id)));
  return cards.slice(0, limit).filter((c) => BY_ID[c.id]);
}

/**
 * @param girl { stage, archetype?, personality?, specialTraits?, job? }
 * @param opts { cravingMidOrHigh: boolean, stage?: string }
 */
export function buildGirlCards(girl, opts = {}) {
  const rules = DATA?.girl_card_build_rules;
  const max = rules?.max || d("max_girl_cards", 3);
  const out = [];
  const stage = opts.stage || girl?.stage || "stranger";
  const archName = girlArchetypeName(girl);
  const hasSpecial = Array.isArray(girl?.specialTraits) && girl.specialTraits.length > 0;
  const counts = { ...ARCH_STAGE_COUNTS, ...(rules?.stage_counts || {}) };
  const archNeed = counts[stage] ?? 1;

  // 1) 個性 × 階段本體（ca 包 22×7；沒掛到再走舊 fallback）
  const archDefs = pickArchetypeStageCards(archName, stage, archNeed);
  for (const def of archDefs) {
    if (out.length >= max) break;
    out.push(makeInstance(def.id, "girl"));
  }
  if (!out.length) {
    const fb = rules?.fallback_stage_pick || rules?.slots?.find((s) => s.slot === "stage")?.pick;
    const id = fb?.[stage] || fb?.stranger;
    if (id && BY_ID[id]) out.push(makeInstance(id, "girl"));
  }

  // 2) 其餘槽：規則 slots（跳過已處理的 archetype_stage／舊 stage）
  for (const slot of rules?.slots || []) {
    if (out.length >= max) break;
    if (slot.slot === "archetype_stage" || slot.slot === "stage") continue;
    if (slot.slot === "identity") {
      if (hasSpecial && slot.if_special_traits && BY_ID[slot.if_special_traits]) {
        out.push(makeInstance(slot.if_special_traits, "girl"));
      } else if (Array.isArray(slot.always_try)) {
        for (const id of slot.always_try) {
          if (out.length >= max) break;
          if (BY_ID[id]) out.push(makeInstance(id, "girl"));
        }
      }
    } else if (slot.slot === "state") {
      if (opts.cravingMidOrHigh && slot.if_craving_mid_or_high && BY_ID[slot.if_craving_mid_or_high]) {
        out.push(makeInstance(slot.if_craving_mid_or_high, "girl"));
      }
    }
  }
  return out.slice(0, max);
}

/**
 * 約會章節結構（每景點）：
 *   第1章固定 1 張（normal）→ 感情 2～5
 *   之後 ½ 進正常第2章（2選1）、½ 進 NTR 第一階段（遇其他召喚師）
 *   正常線：1/4 進第3章、3 選 1 → 感情 10～15 → 結束
 *   NTR 線：L1→L2→L3猥褻→L4交配；一半 L4→L5 高潮迎合；L6 雙結局
 *           （帶走當他看板／回到玩家身邊）
 *           各階繼續：1/6 抽離／5/12 A／5/12 B（L6 為 1/2 結局）
 *           中途按結束逃跑 → 她與該召喚師關係進一階
 */
export function dateChapterEmotion(stage, { track = "normal" } = {}) {
  if (track === "ntr") {
    const tN = d("date_chapter_emotion_ntr", {
      1: { min: -2, max: 2 },
      2: { min: -3, max: 1 },
      3: { min: -5, max: 1 },
      4: { min: -4, max: 3 },
      5: { min: 0, max: 5 },
      6: { min: -3, max: 3 },
    });
    const rN = tN[String(stage)] || tN[stage] || { min: -2, max: 2 };
    return {
      min: Number(rN.min) || 0,
      max: Number(rN.max) || 0,
    };
  }
  const key = String(stage);
  const t = d("date_chapter_emotion", {
    1: { min: 2, max: 5 },
    2: { min: 5, max: 10 },
    3: { min: 10, max: 15 },
  });
  const r = t[key] || t[stage] || { min: 1, max: 2 };
  return {
    min: Number(r.min) || 0,
    max: Number(r.max) || 0,
  };
}

/** 進入 normal stage（2 或 3）的機率。L1→L2 已改由 dateNtrBranchChance 分流，此處 2 僅作後備。 */
export function dateContinueChance(stage) {
  const t = d("date_continue_chance", { 2: 0.5, 3: 0.25 });
  const v = t[String(stage)] ?? t[stage];
  const n = Number(v);
  return Number.isFinite(n) ? n : (stage === 2 ? 0.5 : 0.25);
}

/**
 * L1 打完後進 NTR 第一階段的機率（其餘走正常 L2）。
 * 預設 0.5；可在 pack defaults.date_ntr_branch_chance 調。
 */
export function dateNtrBranchChance() {
  const v = d("date_ntr_branch_chance", 0.5);
  const n = Number(v);
  return Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0.5;
}

/**
 * NTR 某張卡衍生的子卡 id（parentId 指向 parentCardId，dateTrack=ntr）。
 * 通常 L1 → 兩張 L2。
 */
export function dateNtrChildIds(parentCardId) {
  const pid = String(parentCardId || "");
  if (!pid) return [];
  return (DATA?.cards || [])
    .filter((c) => c && c.dateTrack === "ntr" && c.parentId === pid)
    .map((c) => c.id);
}

/**
 * 讀場地章節卡 id 列表。
 * @returns {{ 1..6: string[] } | null}
 */
export function getVenueDateChapters(venueId, { track = "normal" } = {}) {
  const v = (DATA?.venues || []).find((x) => x.id === venueId);
  if (!v) return null;
  const stages = [1, 2, 3, 4, 5, 6];
  if (v.dateChapters && typeof v.dateChapters === "object") {
    const out = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
    for (const st of stages) {
      const raw = v.dateChapters[String(st)] || v.dateChapters[st] || [];
      out[st] = (raw || []).filter((id) => {
        const def = BY_ID[id];
        if (!def) return false;
        return (def.dateTrack || "normal") === track;
      });
    }
    if (out[1].length) return out;
  }
  // 後備：依 dateStage 欄位掃 cardIds
  const ids = v.cardIds || [];
  const out = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [] };
  for (const id of ids) {
    const def = BY_ID[id];
    if (!def || (def.dateTrack || "normal") !== track) continue;
    const st = Number(def.dateStage) || 1;
    if (out[st]) out[st].push(id);
  }
  return out[1].length ? out : null;
}

/** 該場地約會會用到的全部卡 instance（給準備／牌池） */
export function buildVenueCards(venueId, { track = "normal" } = {}) {
  const ch = getVenueDateChapters(venueId, { track });
  if (!ch) {
    const v = (DATA?.venues || []).find((x) => x.id === venueId);
    if (!v) return [];
    return (v.cardIds || []).filter((id) => BY_ID[id]).map((id) => makeInstance(id, "venue"));
  }
  const ids = [...(ch[1] || []), ...(ch[2] || []), ...(ch[3] || []), ...(ch[4] || []), ...(ch[5] || []), ...(ch[6] || [])];
  return ids.filter((id) => BY_ID[id]).map((id) => makeInstance(id, "venue"));
}

/** 章節可選卡 id（L1 應為 1 張；L2=2；L3=3） */
export function dateChapterOptionIds(venueId, stage, { track = "normal" } = {}) {
  const ch = getVenueDateChapters(venueId, { track });
  if (!ch) return [];
  return ch[stage] || ch[String(stage)] || [];
}

// ── Emotion dice ───────────────────────────────────────────

// NSFW 三階段感情（鎖死，全關係共用區間；不以舊「女友前必負」覆蓋）：
//   猥褻 erotic: -15～-5
//   前戲 foreplay: +3～+9
//   正戲 intercourse: +5～+10
// 一般話術等：女友以前仍硬夾負分。

const FALLBACK_EMOTION = {
  speech: {
    stranger: { min: -2, max: -1 },
    friend: { min: -2, max: -1 },
    girlfriend: { min: 0, max: 2 },
    wife: { min: 0, max: 1 },
  },
  touch: {
    stranger: { min: -3, max: -1 },
    friend: { min: -2, max: -1 },
    girlfriend: { min: 1, max: 3 },
    wife: { min: 1, max: 2 },
  },
  sex: {
    stranger: { min: -4, max: -2 },
    friend: { min: -3, max: -1 },
    girlfriend: { min: 0, max: 4 },
    wife: { min: 1, max: 3 },
  },
};

const NSFW_EMOTION_FALLBACK = {
  erotic: { min: -15, max: -5 },
  foreplay: { min: 3, max: 9 },
  intercourse: { min: 5, max: 10 },
};

function normEmotionRange(table, fallback) {
  let lo = Number(table?.min);
  let hi = Number(table?.max);
  if (!Number.isFinite(lo)) lo = fallback.min;
  if (!Number.isFinite(hi)) hi = fallback.max;
  if (lo > hi) [lo, hi] = [hi, lo];
  return { min: lo, max: hi };
}

/**
 * NSFW 階段感情表（有則優先於卡面 emotion／女友前硬夾）。
 * @returns {{ min, max, phase } | null}
 */
export function nsfwPhaseEmotion(def) {
  if (!def) return null;
  if (isEroticCard(def)) {
    return {
      phase: "erotic",
      ...normEmotionRange(d("emotion_nsfw_erotic", null), NSFW_EMOTION_FALLBACK.erotic),
    };
  }
  if (isForeplayCard(def)) {
    return {
      phase: "foreplay",
      ...normEmotionRange(d("emotion_nsfw_foreplay", null), NSFW_EMOTION_FALLBACK.foreplay),
    };
  }
  if (isIntercourseCard(def) || (isSexCard(def) && !isForeplayCard(def))) {
    return {
      phase: "intercourse",
      ...normEmotionRange(d("emotion_nsfw_intercourse", null), NSFW_EMOTION_FALLBACK.intercourse),
    };
  }
  return null;
}

/** 女友以前：表與卡面 emotion 都夾成 max≤-1（永遠負分）——不套用 NSFW 三階段 */
function clampEmotionPreGirlfriend(stage, table) {
  if (stage !== "stranger" && stage !== "friend") return table;
  let lo = Number.isFinite(table?.min) ? table.min : -2;
  let hi = Number.isFinite(table?.max) ? table.max : -1;
  if (hi > -1) hi = -1;
  if (lo > hi) lo = Math.min(hi, -2);
  if (lo > -1) lo = -2;
  return { min: lo, max: hi };
}

export function emotionTable(def, stage, { fail = false } = {}) {
  if (fail) {
    // 父鏈 emotionOnFail：子優先
    let cur = def;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.emotionOnFail) {
        return clampEmotionPreGirlfriend(stage, cur.emotionOnFail);
      }
      cur = cur.parentId ? BY_ID[cur.parentId] : null;
    }
    return clampEmotionPreGirlfriend(stage, d("emotion_fail_open", { min: -3, max: -1 }));
  }

  // NSFW 三階段：猥褻／前戲／正戲 — 固定區間，不吃女友前硬夾、不吃舊卡面表
  const phase = nsfwPhaseEmotion(def);
  if (phase) return { min: phase.min, max: phase.max };

  // 詞墜繼承：子卡有寫該 stage 就用子；否則沿父鏈往上
  let cur = def;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.emotion?.[stage]) {
      return clampEmotionPreGirlfriend(stage, cur.emotion[stage]);
    }
    cur = cur.parentId ? BY_ID[cur.parentId] : null;
  }
  if (def?.emotion?.[stage]) {
    return clampEmotionPreGirlfriend(stage, def.emotion[stage]);
  }
  const tags = def?.tags || [];
  let lane = "speech";
  if (tags.includes("sex")) lane = "sex";
  else if (tags.includes("touch") || tags.includes("play")) lane = "touch";
  const table = FALLBACK_EMOTION[lane] || FALLBACK_EMOTION.speech;
  const raw = table[stage] || table.stranger || { min: -1, max: -1 };
  return clampEmotionPreGirlfriend(stage, raw);
}

export function rollEmotion(def, stage, opts = {}) {
  const t = emotionTable(def, stage, opts);
  let delta = randInt(t.min ?? 0, t.max ?? 0);
  const phaseLocked = !!nsfwPhaseEmotion(def);
  // 非 NSFW 三階段：女友以前硬鎖負分
  if (!phaseLocked && (stage === "stranger" || stage === "friend")) {
    if (delta >= 0) delta = -1;
  } else if (!phaseLocked && opts.guardHigh && delta > 0) {
    delta = 0;
  }
  return delta;
}

/**
 * 無 AI 時的她反應（3 句左右）。AI 路徑用長 prompt；此為 fallback。
 * 一律第一人稱台詞；情感仍只由骰子決定。
 */
const REACT_FAIL = [
  "你在做什麼。我沒說可以。先離我遠一點。",
  "別過來。剛才那一下……我還沒準備好。",
  "夠了。你當我不會生氣嗎？",
];
const REACT_BY_BAND = {
  // delta 帶：hi(>=2) pos(1) zero(0) neg(-1) lo(<=-2)
  hi: {
    stranger: [
      "哼……算你還有點分寸。別以為我會謝謝你。我只是暫時不把你推開。",
      "……勉強讓你過關。下次別靠這麼近。我說真的。",
    ],
    friend: [
      "你啊，這次還行啦。我有點意外。下次別突然這樣，我會不知道怎麼接。",
      "行吧，這次算你的。我沒有很生氣……好啦，有一點開心，別笑。",
    ],
    girlfriend: [
      "嗯……看你這樣我也沒辦法。再靠近一點也可以，但你要看著我。",
      "好啦，我接住了。你剛才那樣，心臟會亂跳欸。少得寸進尺一點……或是再得寸一點點。",
    ],
    wife: [
      "知道了，就這樣。我沒有要你停。等一下記得把話說完。",
      "嗯，我聽到了。你這樣比較像我認識的那個人。來，手給我。",
    ],
  },
  pos: {
    stranger: [
      "哦。我聽著。你想幹嘛就直說，別用那種眼神看我。",
      "嗯……然後呢。我沒有答應什麼。只是還沒叫你滾。",
    ],
    friend: [
      "還行。我聽著。你今天狀態還可以嘛。繼續說。",
      "嗯，繼續說。我沒有在生氣。只是覺得你有點突然。",
    ],
    girlfriend: [
      "嗯，我在聽。你這樣講我會心軟，你知道吧。",
      "這樣啊……我知道了。過來一點，我想看你臉。",
    ],
    wife: [
      "嗯，好。我在。你慢一點也沒關係。",
      "說吧，我聽著。先把手放好，別只顧著講。",
    ],
  },
  zero: {
    stranger: [
      "怎樣。你想幹嘛。說完沒有就讓開。",
      "你靠這麼近要做什麼。我可沒有空跟你耗。",
    ],
    friend: [
      "嗯？然後呢。你今天話很多欸。",
      "所以呢。有事就講，沒事別把空氣弄得怪怪的。",
    ],
    girlfriend: [
      "怎樣？你又想怎樣。表情那麼認真，我反而緊張。",
      "你又來了。說清楚一點，我才知道要生氣還是接住。",
    ],
    wife: [
      "還有事嗎？沒有的話我繼續忙。有的話一次講完。",
      "嗯，說吧。我有在聽，只是手沒停。",
    ],
  },
  neg: {
    stranger: [
      "別太過分。我說了不舒服。你聽不懂是嗎。",
      "夠了。再這樣我會直接把你推開。",
    ],
    friend: [
      "你認真的？這樣很煩。我們不是這種關係吧。",
      "差不多一點。我當朋友跟你說話，不是讓你踩線。",
    ],
    girlfriend: [
      "你這樣我會生氣。不是鬧著玩的那種。先停一下。",
      "拜託，別這樣。我需要你聽我說，不是只顧自己。",
    ],
    wife: [
      "過了。等下再談。我現在不想笑著接。",
      "我們等下再談。你先讓我緩一下。",
    ],
  },
  lo: {
    stranger: [
      "夠了。別再靠近。我不想理你。",
      "你太過分了。離我遠一點。現在。",
    ],
    friend: [
      "夠了。我現在不想理你。你太過分了。",
      "你太過分了。先自己待著，別跟我說話。",
    ],
    girlfriend: [
      "你太過分了。別說話。我需要一點空間。",
      "我現在真的生氣。你讓我靜一靜，別跟過來。",
    ],
    wife: [
      "我們等下再談。先這樣。你別用那種臉看我。",
      "先這樣。我不是要分手，我是要你懂得停。",
    ],
  },
};

function pickLine(arr) {
  if (!arr?.length) return "我沒話說。";
  return arr[Math.floor(Math.random() * arr.length)];
}

/**
 * 僅 L2 正戲以上：無 AI 時用淫聲罐頭（仍分階段態度碎渣）。
 * 猥褻／前戲走下方 REACT_LEWD。
 */
const REACT_SEX_L2 = {
  intercourse: {
    stranger: [
      "啊……哈……放、放開……太深……",
      "嗯啊……不要……變態……啊……",
      "哈……拔出去……啊……",
    ],
    friend: [
      "啊……等、等一下……太過分……",
      "嗯……慢、慢一點……啊……",
      "哈啊……我們不該……啊……",
    ],
    girlfriend: [
      "啊……哈啊……好、好深……",
      "嗯……討厭……可是……啊……",
      "哈……慢一點……會去……啊……",
    ],
    wife: [
      "啊……嗯……再、再進來……",
      "哈啊……好舒服……深一點……",
      "嗯……別停……啊……",
    ],
  },
  intercourse_intense: {
    stranger: [
      "啊啊……不、不要……哈啊……",
      "嗯啊……停下……要壞掉……啊……",
      "哈……放開我……啊啊……",
    ],
    friend: [
      "啊啊……太、太快……哈……",
      "嗯……過分……裡面……啊……",
      "哈啊……停一下……啊……",
    ],
    girlfriend: [
      "啊啊……好深……喜歡……哈……",
      "嗯啊……要去了……抱我……",
      "哈……再快一點……啊啊……",
    ],
    wife: [
      "啊啊……就是那裡……嗯……",
      "哈啊……全部給我……啊……",
      "嗯……用力……我是你的……啊……",
    ],
  },
  climax: {
    stranger: [
      "啊啊……去、去了……不要……啊……",
      "不行……啊啊……放開……嗯啊……",
      "……啊……要……壞掉……啊啊……",
    ],
    friend: [
      "啊啊……去了……太過分……嗯……",
      "不行……大腦……啊啊……",
      "……啊……羞死了……啊啊……",
    ],
    girlfriend: [
      "啊啊……去了……好舒服……嗯啊……",
      "不行……要去……抱緊我……啊……",
      "……啊……喜歡……啊啊……",
    ],
    wife: [
      "啊啊……去了……射進來……嗯……",
      "哈啊……一起……全部……啊啊……",
      "……啊……好滿……還要……嗯……",
    ],
  },
  player_climax: {
    stranger: [
      "嗯啊……熱……不要射……裡面……",
      "哈啊……拔、拔出去……啊……",
      "……啊……精液……討厭……嗯……",
    ],
    friend: [
      "嗯啊……熱……裡面……太過分……",
      "哈啊……射進來了……羞……",
      "……啊……滿……怎麼辦……嗯……",
    ],
    girlfriend: [
      "嗯啊……射進來……好熱……喜歡……",
      "哈啊……滿……不要拔……嗯……",
      "……啊……精液……好羞……可是……",
    ],
    wife: [
      "嗯啊……射滿我……好燙……",
      "哈啊……全部……裡面……嗯……",
      "……啊……還要……再射……嗯……",
    ],
  },
};

/** 猥褻／前戲：正常句子，四階段態度分明 */
const REACT_LEWD = {
  erotic: {
    stranger: [
      "你幹嘛！別碰我……變態！",
      "放開！我沒答應這種事，離我遠一點！",
      "你以為摸一下我就會怎樣？滾。",
    ],
    friend: [
      "喂……你這算什麼啊！太過分了吧。",
      "等等，我還沒說可以……手拿開，很丟臉。",
      "你認真的？我們不是那種關係……我很生氣。",
    ],
    girlfriend: [
      "你……突然這樣我會嚇到啦……可是、先看著我。",
      "嗯……這裡不行啦……會被人看到……壞心眼。",
      "討厭……你知道我會害羞還一直摸。",
    ],
    wife: [
      "你又來……把門關好再碰。",
      "嗯，可以……就是別只顧著摸，看著我。",
      "摸啊……我沒說不要，就是有點急。",
    ],
  },
  foreplay: {
    stranger: [
      "停、停下！我沒說可以親、可以脫……放開！",
      "你這是強姦！鬆手！我說不要！",
      "別脫我衣服……我恨你……不要……",
    ],
    friend: [
      "等等……我們什麼時候變成可以這樣了？太過分。",
      "你慢一點……我還沒準備好，也很丟臉。",
      "羞死了……至少別把衣服扯成這樣，我會生氣。",
    ],
    girlfriend: [
      "嗯……親可以……脫太快了啦，我會、會害羞。",
      "你手……再輕一點……不是討厭，是太刺激。",
      "真是的……今晚真的要這樣嗎……看著我。",
    ],
    wife: [
      "知道了……過來。想脫就脫，別急著一次全光。",
      "嗯，我沒有要推開你……親我一下。",
      "你今晚很急耶……我在，慢慢來。",
    ],
  },
};

/** 罐頭台詞（給玩家看的對話） */
export function girlReactionLine({
  stage = "stranger",
  emotionDelta = 0,
  openFail = false,
  kind = "",
  sexPhase = "",
} = {}) {
  if (openFail) return pickLine(REACT_FAIL);
  const phase = sexPhase || "";
  const st = stage || "stranger";

  // L2 以上才淫聲（分階段態度）
  const pickSexL2 = (bag) => {
    const bySt = bag?.[st] || bag?.stranger || bag;
    if (Array.isArray(bySt)) return pickLine(bySt);
    if (Array.isArray(bag)) return pickLine(bag);
    return pickLine(REACT_SEX_L2.intercourse.stranger);
  };
  if (phase === "climax" || phase === "player_climax" || phase === "intercourse_intense") {
    return pickSexL2(REACT_SEX_L2[phase] || REACT_SEX_L2.intercourse);
  }
  if (kind === "intercourse" || kind === "sex" || phase === "intercourse") {
    return pickSexL2(REACT_SEX_L2.intercourse);
  }

  // 猥褻／前戲：正常句子＋羞恥／討厭（掛關係階段）
  if (kind === "erotic") {
    const bag = REACT_LEWD.erotic;
    return pickLine(bag[st] || bag.stranger);
  }
  if (kind === "foreplay" || phase === "foreplay") {
    const bag = REACT_LEWD.foreplay;
    return pickLine(bag[st] || bag.stranger);
  }

  let band = "zero";
  if (emotionDelta >= 2) band = "hi";
  else if (emotionDelta >= 1) band = "pos";
  else if (emotionDelta <= -2) band = "lo";
  else if (emotionDelta <= -1) band = "neg";
  const byStage = REACT_BY_BAND[band] || REACT_BY_BAND.zero;
  return pickLine(byStage[st] || byStage.stranger || REACT_BY_BAND.zero.stranger);
}

export function emotionFeelLabel(delta) {
  if (delta >= 2) return "明顯軟了";
  if (delta === 1) return "軟了一點";
  if (delta === 0) return "沒什麼波瀾";
  if (delta === -1) return "冷了一點";
  return "明顯僵了";
}

// ── Open chain ─────────────────────────────────────────────

export function rollForceOpen(/* stage, def */) {
  // 第一版固定 50%
  return Math.random() < 0.5;
}

export function tryOpen(def, stage) {
  if (!def?.openChain) return { success: true, isOpener: false };
  if (stageOk(stage, def.minStage)) return { success: true, isOpener: true };
  if (def.forceable) return { success: rollForceOpen(stage, def), isOpener: true };
  return { success: false, isOpener: true };
}

// ── Session state machine ──────────────────────────────────

function shuffleInPlace(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function ensureArc(sess) {
  if (!sess) return { lastId: null, playedIds: [] };
  if (!sess.arc || typeof sess.arc !== "object") {
    sess.arc = { lastId: null, playedIds: [] };
  }
  if (!Array.isArray(sess.arc.playedIds)) sess.arc.playedIds = [];
  if (sess.arc.lastId === undefined) sess.arc.lastId = null;
  return sess.arc;
}

function arcWeightTable() {
  const w = d("arc_weights", null) || {};
  const child = Number(w.child);
  const other = Number(w.other);
  return {
    child: child > 0 ? child : 8,
    other: other > 0 ? other : 1,
  };
}

function isT1Child(inst, lastId) {
  if (!lastId || !inst?.cardId) return false;
  const def = BY_ID[inst.cardId];
  return !!(def && def.parentId === lastId);
}

/**
 * 可抽池 = 本局實體池 − playedIds − 已碎 − 目前手牌中的實例
 * （未打出回池：清空 hand 即可，不需額外 push）
 */
export function buildDrawPool(sess) {
  if (!sess) return [];
  const arc = ensureArc(sess);
  const played = new Set(arc.playedIds || []);
  const inHand = new Set((sess.hand || []).map((h) => h.instanceId));
  return (sess.sessionDeck || []).filter((inst) => {
    if (!inst || !inst.cardId) return false;
    if (inst.shattered) return false;
    if (played.has(inst.cardId)) return false;
    if (inHand.has(inst.instanceId)) return false;
    return true;
  });
}

function weightOfInst(inst, lastId, weights, boostT1) {
  if (boostT1 && isT1Child(inst, lastId)) return weights.child;
  return weights.other;
}

/** 加權抽 1 張（不放回：呼叫端從 pool 移除）。無 T1 或無 lastId → 均勻（other 權重）。 */
function weightedPickOne(pool, lastId) {
  if (!pool.length) return null;
  const weights = arcWeightTable();
  const boostT1 = !!lastId && pool.some((p) => isT1Child(p, lastId));
  let total = 0;
  const ws = pool.map((p) => {
    const w = weightOfInst(p, lastId, weights, boostT1);
    total += w;
    return w;
  });
  if (total <= 0) return pool[Math.floor(Math.random() * pool.length)];
  let r = Math.random() * total;
  for (let i = 0; i < pool.length; i++) {
    r -= ws[i];
    if (r <= 0) return pool[i];
  }
  return pool[pool.length - 1];
}

/**
 * v7：每輪從可抽池加權抽 hand_draw 張（預設 2）。
 * 舊 drawToHand（補到手牌 5）已廢。
 */
export function drawHandV7(sess) {
  if (!sess) return [];
  ensureArc(sess);
  const k = handDrawCount();
  sess.hand = [];
  for (let i = 0; i < k; i++) {
    const pool = buildDrawPool(sess);
    if (!pool.length) break;
    const pick = weightedPickOne(pool, sess.arc.lastId);
    if (!pick) break;
    sess.hand.push(pick);
  }
  return sess.hand;
}

/** @deprecated 改走 drawHandV7；保留避免舊呼叫炸 */
function drawToHand(sess) {
  return drawHandV7(sess);
}

/**
 * 手牌裡的妹子卡（source===girl）自動打出選中的那張。
 * 兩張都是妹子 → 隨機 1 張；僅一張妹子 → 打那張。
 * 只回傳可選中的；無則 null。
 */
export function pickGirlAutoPlay(sess) {
  if (!sess || sess.phase !== "round_play") return null;
  if (playsLeft(sess) <= 0) return null;
  const girls = (sess.hand || []).filter((h) => h && h.source === "girl" && !h.used);
  if (!girls.length) return null;
  const selectable = girls.filter((g) => canSelectCard(sess, g).ok);
  const pool = selectable.length ? selectable : girls;
  if (pool.length === 1) return pool[0];
  return pool[Math.floor(Math.random() * pool.length)];
}

/**
 * 打出結算後：更新 arc／碎標記、清空手牌（未打出回可抽池）、若還有輪數再抽 2。
 * @returns {{ drew: boolean, empty: boolean, hand: object[] }}
 */
function settleAfterPlay(sess, inst, def, { shattered = false } = {}) {
  const arc = ensureArc(sess);
  if (def?.id) {
    if (!arc.playedIds.includes(def.id)) arc.playedIds.push(def.id);
    arc.lastId = def.id;
  }
  if (inst) {
    inst.used = true;
    if (shattered) {
      inst.shattered = true;
      const deckInst = (sess.sessionDeck || []).find((x) => x.instanceId === inst.instanceId);
      if (deckInst) deckInst.shattered = true;
    }
  }
  // 未打出的一併離手 → 回可抽池（未進 playedIds、未 shattered）
  sess.hand = [];

  if (playsLeft(sess) <= 0) {
    return { drew: false, empty: true, hand: [] };
  }
  const hand = drawHandV7(sess);
  if (!hand.length) {
    // 可抽池空，無法再開下一輪
    sess.phase = "round_end";
    return { drew: false, empty: true, hand: [] };
  }
  return { drew: true, empty: false, hand };
}

/**
 * 開看板／約會 session（尚未組牌）。
 * phase: idle_present（可只陪伴）
 */
export function openSession(state, { mode, girlId, girlCards = [], venueId = null, venueCards = [] }) {
  if (state.cardSession && state.cardSession.phase && state.cardSession.phase !== "closed") {
    return { ok: false, err: "已有進行中的牌局" };
  }
  state.cardSession = {
    mode: mode || "kanban",
    girlId,
    phase: "idle_present",
    roundIndex: 0,
    girlCards: girlCards.slice(0, d("max_girl_cards", 3)),
    injected: [],
    sessionDeck: [], // v7 本局實體池
    drawPile: [], // 舊欄位；v7 不再用補牌堆
    hand: [],
    nBase: 0,
    nLeft: 0,
    chain: null,
    flags: {},
    arc: { lastId: null, playedIds: [] },
    playedThisRound: [],
    forceAnotherRound: false,
    venueId: venueId || null,
    venueCards: venueCards || [],
    log: [],
    pending: null, // { instanceId } 確認層
    // 開戰前牌意演繹：cardId → { status, text }（動態 scene，非 JSON 固定句）
    cardNarr: null,
    narrToken: null,
    narrDeckKey: null,
    // 本桌場景圖鏈：上一張出卡場景 URL，下一張 image_edit 接續用（結束牌局清空）
    sceneChainUrl: null,
  };
  return { ok: true, session: state.cardSession };
}

/** 本局會用到的卡 id（本體＋出戰牌組＋場地） */
export function sessionCardIds(state) {
  const sess = state.cardSession;
  if (!sess) return [];
  const ids = new Set();
  for (const c of sess.girlCards || []) if (c?.cardId) ids.add(c.cardId);
  for (const c of sess.venueCards || []) if (c?.cardId) ids.add(c.cardId);
  for (const id of getDeck(state) || []) if (id) ids.add(id);
  return [...ids];
}

/**
 * 準備進度。
 * cardNarr[id] = {
 *   status: pending|done|error,
 *   text: 玩家動作旁白,
 *   reply: 妹子預回話,
 *   actionStatus / replyStatus: pending|done|error,
 * }
 * 整卡完成 = 動作＋回話都好（舊存檔只有 text 不算 ready，會重跑準備）。
 */
export function narrProgress(sess) {
  const map = sess?.cardNarr || {};
  const ids = Object.keys(map);
  const total = ids.length;
  let done = 0;
  let actionDone = 0;
  let replyDone = 0;
  for (const id of ids) {
    const e = map[id];
    if (!e) continue;
    const hasAct = !!(e.text && String(e.text).trim())
      || e.actionStatus === "done" || e.actionStatus === "error";
    const hasRep = !!(e.reply && String(e.reply).trim())
      || e.replyStatus === "done" || e.replyStatus === "error";
    if (hasAct) actionDone++;
    if (hasRep) replyDone++;
    if (hasAct && hasRep) {
      if (e.status !== "error") e.status = "done";
      done++;
    }
  }
  return {
    done,
    total,
    ready: total > 0 && done >= total,
    actionDone,
    replyDone,
  };
}

/** 打牌用動態場面句；沒有才退回卡面固定 sceneStart */
export function sceneTextFor(state, cardId) {
  const def = cardById(cardId);
  const dyn = state.cardSession?.cardNarr?.[cardId];
  if (dyn?.text && !isWeakLine(dyn.text)
    && (dyn.status === "done" || dyn.actionStatus === "done" || dyn.from)) {
    return dyn.text;
  }
  return def?.sceneStart || def?.name || "……";
}

/** 準備時預產的妹子回話；出卡可優先採用 */
export function prefabReplyFor(state, cardId) {
  const dyn = state.cardSession?.cardNarr?.[cardId];
  if (!dyn) return "";
  const r = String(dyn.reply || "").trim();
  if (!r || isWeakLine(r)) return "";
  if (dyn.replyStatus === "error" && !r) return "";
  return r;
}

/** 女子綁定位（[name][eye][breast]…） */
export {
  bindContextFromGirl,
  resolveCardBinds,
  identityLockBlock,
  listBindsInText,
  BIND_PLACEHOLDERS,
};

/**
 * 解析卡面文案上的女子綁定。
 * @param {string} text
 * @param {object} girl  存檔魅魔或 character
 * @param {string} [playerName]
 */
export function bindCardText(text, girl, playerName = "你") {
  const ctx = bindContextFromGirl(girl, playerName);
  return {
    text: resolveCardBinds(text, ctx),
    ctx,
  };
}

/** scene + promptHint 一併綁定 */
export function bindCardDefText(def, girl, playerName = "你") {
  const ctx = bindContextFromGirl(girl, playerName);
  return {
    sceneStart: resolveCardBinds(def?.sceneStart || "", ctx),
    promptHint: resolveCardBinds(def?.promptHint || "", ctx),
    name: def?.name || "",
    ctx,
  };
}

export function sessionActive(state) {
  const s = state.cardSession;
  return !!(s && s.phase && s.phase !== "closed");
}

/** idle_present → round_setup */
export function enterRoundSetup(state) {
  const sess = state.cardSession;
  if (!sess || (sess.phase !== "idle_present" && sess.phase !== "round_end")) {
    return { ok: false, err: "現在不能組牌" };
  }
  sess.phase = "round_setup";
  sess.injected = [];
  sess.sessionDeck = [];
  sess.drawPile = [];
  sess.hand = [];
  sess.chain = null;
  sess.arc = { lastId: null, playedIds: [] };
  sess.playedThisRound = [];
  sess.forceAnotherRound = false;
  sess.pending = null;
  sess.flags = sess.flags || {};
  return { ok: true };
}

/**
 * 從 inventory 勾選押入。injectCardIds 可重複 id（多張碎卡）。
 * 押入時不扣 count；打出才扣。
 */
export function setInject(state, injectCardIds) {
  const sess = state.cardSession;
  if (!sess) return { ok: false, err: "沒有牌局" };
  const v = validateInjectIds(state, injectCardIds);
  if (!v.ok) return v;
  sess.injected = v.ids.map(id => makeInstance(id, "inventory"));
  return { ok: true, injected: sess.injected };
}

/**
 * 用商店設定的出戰牌組開戰（跳過局內組牌 UI）。
 * 可從 idle_present / round_setup / round_end / round_play 進入
 * （舊 pregen／ready 會先 normalize 成 round_play）。
 */
export function startPlayRound(state, { stage, guardHigh = false } = {}) {
  const sess = state.cardSession;
  if (!sess) return { ok: false, err: "沒有牌局" };
  normalizeSessionPhase(sess);
  ensureArc(sess);
  // 已在打牌且還有輪數 → 視為繼續；手牌空則補抽一輪出示
  if (sess.phase === "round_play" && playsLeft(sess) > 0) {
    if (!sess.hand?.length && (sess.sessionDeck || []).length) {
      drawHandV7(sess);
    }
    return { ok: true, already: true, hand: sess.hand, nLeft: sess.nLeft };
  }
  const okPhases = new Set([
    "idle_present", "round_setup", "round_end", "round_play", "narr_prep", "narr_ready",
  ]);
  if (!okPhases.has(sess.phase)) {
    return { ok: false, err: "現在不能開戰" };
  }
  // 牌意未演繹完不可開戰（narr_ready＝已備妥等玩家按開始）
  if (sess.phase === "narr_prep") {
    const p = narrProgress(sess);
    if (!p.ready) return { ok: false, err: "牌意還在演繹中" };
  }

  // 開戰前再修剪一次：踢掉已碎／超庫存幽靈，避免整組 validate 失敗變空押入
  const deck = getDeck(state);
  let ir = setInject(state, deck);
  if (!ir.ok) {
    // 軟注入：逐張能帶就帶，不要「一張壞就整組清空」
    const soft = [];
    const need = Object.create(null);
    const max = maxInject(state);
    for (const id of deck) {
      if (soft.length >= max) break;
      const def = BY_ID[id];
      if (!def || def.kind === "girl_trait" || def.kind === "venue_event" || isSexCard(def)) continue;
      const n = (need[id] || 0) + 1;
      if (!shattersOnUse(def)) {
        if (!invOwns(state, id) || n > 1) continue;
      } else if (invCount(state, id) < n) {
        continue;
      }
      need[id] = n;
      soft.push(id);
    }
    state.cardDeck = soft.slice();
    ir = setInject(state, soft);
    if (!ir.ok) sess.injected = [];
  }

  // v7：本局實體池（攜帶≤8 ∪ 妹子 ≤3 ∪ 場地）
  const pile = [
    ...sess.girlCards.map((c) => ({ ...c, used: false, shattered: false })),
    ...sess.injected.map((c) => ({ ...c, used: false, shattered: false })),
    ...(sess.venueCards || []).map((c) => ({ ...c, used: false, shattered: false })),
  ];
  if (!pile.length) return { ok: false, err: "牌堆是空的——商店編一組牌或等本體卡" };

  sess.sessionDeck = pile;
  sess.drawPile = []; // 舊欄位清空
  sess.hand = [];
  sess.arc = { lastId: null, playedIds: [] };

  sess.girlStage = stage || "stranger";
  sess.nBase = basePlays(sess.girlStage, guardHigh);
  sess.nLeft = sess.nBase;
  sess.chain = null;
  sess.roundIndex = (sess.roundIndex || 0) + 1;
  sess.playedThisRound = [];
  sess.forceAnotherRound = false;
  sess.pending = null;
  sess.phase = "round_play";

  // 第一輪：均勻抽 2（無 lastId）
  drawHandV7(sess);
  if (!sess.hand.length) {
    return { ok: false, err: "抽不到牌——可抽池是空的" };
  }

  sess.log = sess.log || [];
  sess.log.push({
    t: Date.now(),
    kind: "round_start",
    n: sess.nLeft,
    round: sess.roundIndex,
    deck: deck.slice(),
    handDraw: handDrawCount(),
    poolSize: pile.length,
  });
  return {
    ok: true,
    hand: sess.hand,
    nLeft: sess.nLeft,
    phase: "round_play",
    deckSize: deck.length,
    poolSize: pile.length,
  };
}

/** @deprecated 改走 startPlayRound；保留給舊呼叫 */
export function startRound(state, opts = {}) {
  return startPlayRound(state, opts);
}

export function playsLeft(sess) {
  if (!sess) return 0;
  return (sess.nLeft || 0) + (sess.chain?.kLeft || 0);
}

export function canSelectCard(sess, inst, stage = null) {
  if (!sess || sess.phase !== "round_play") return { ok: false, err: "不在打牌中" };
  if (playsLeft(sess) <= 0) return { ok: false, err: "她今夜不願再應對" };
  if (!inst || inst.used) return { ok: false, err: "這張已用過" };
  if (!sess.hand.some(h => h.instanceId === inst.instanceId)) {
    return { ok: false, err: "不在手牌" };
  }
  const def = BY_ID[inst.cardId];
  if (!def) return { ok: false, err: "卡定義遺失" };

  if (def.requires?.flagsAll) {
    for (const f of def.requires.flagsAll) {
      if (!sess.flags?.[f]) return { ok: false, err: "條件未滿足" };
    }
  }
  if (def.requires?.mode) {
    const modes = def.requires.mode;
    if (Array.isArray(modes) && modes.length && !modes.includes(sess.mode)) {
      return { ok: false, err: "此場合不能用這張" };
    }
  }
  const st = stage || sess.girlStage || "stranger";
  // 非開門卡：未達 minStage 且不可硬開 → 不可打（開門卡在 commit 時骰成敗）
  if (def.minStage && !def.openChain && !def.forceable && !stageOk(st, def.minStage)) {
    return { ok: false, err: "關係還不到" };
  }
  // 有 chain 時不相容灰掉
  if (sess.chain && sess.chain.kLeft > 0 && !compatible(def, sess.chain.attr)) {
    return { ok: false, err: "與當前節奏不合", chainBlock: true };
  }
  return { ok: true, def };
}

/** 點牌：碎卡／色情卡進確認層；話術可直接 play */
export function requestPlay(state, instanceId, opts = {}) {
  const sess = state.cardSession;
  const inst = sess?.hand?.find(h => h.instanceId === instanceId);
  const check = canSelectCard(sess, inst);
  if (!check.ok) return check;
  const def = check.def;
  if (shattersOnUse(def)) {
    sess.pending = { instanceId };
    return { ok: true, needConfirm: true, def, inst };
  }
  return commitPlay(state, instanceId, opts);
}

export function cancelPending(state) {
  if (state.cardSession) state.cardSession.pending = null;
  return { ok: true };
}

/**
 * 確認打出。
 * @returns result for UI / affection
 */
export function commitPlay(state, instanceId, { stage = "stranger", guardHigh = false } = {}) {
  const sess = state.cardSession;
  if (!sess || sess.phase !== "round_play") return { ok: false, err: "不在打牌中" };
  const handIdx = sess.hand.findIndex(h => h.instanceId === instanceId);
  if (handIdx < 0) return { ok: false, err: "不在手牌" };
  const inst = sess.hand[handIdx];
  const check = canSelectCard(sess, inst);
  if (!check.ok) return check;
  const def = check.def;

  sess.pending = null;

  // 標記已使用意圖
  inst.used = true;
  sess.hand.splice(handIdx, 1);

  const result = {
    ok: true,
    cardId: def.id,
    name: def.name,
    kind: def.kind || null,
    erotic: isEroticCard(def),
    // 優先本局 AI 演繹的 3～4 句，不是 JSON 固定句
    sceneStart: sceneTextFor(state, def.id),
    girlLine: "",
    feelLabel: "",
    open: null,
    emotionDelta: 0,
    shattered: false,
    chain: null,
    forceAnotherRound: false,
    sexTriggered: false,
    effects: [],
    playsLeft: 0,
    roundEnded: false,
  };

  const finishPlay = (openFail = false, settle = null) => {
    // 即時路徑：先填罐頭；有模型時 app 會背景下單覆寫 girlLine
    let line = girlReactionLine({
      stage,
      emotionDelta: result.emotionDelta,
      openFail,
      kind: def?.kind || result.kind || "",
      sexPhase: result.sexPhase || def?.sexPhase || "",
    });
    if (isWeakLine(line)) {
      line = openFail
        ? "我沒接住。別這樣。"
        : (def?.kind === "intercourse" || def?.kind === "sex" || def?.kind === "foreplay" || def?.kind === "erotic")
          ? "……啊……嗯……"
          : "……我聽到了。";
    }
    result.girlLine = line;
    result.visualPose = null; // 畫圖用表情／動作，文字好了再填
    result.fromAi = false;
    result.feelLabel = emotionFeelLabel(result.emotionDelta);
    result.playsLeft = playsLeft(sess);
    result.chain = sess.chain ? { ...sess.chain } : null;
    result.arc = sess.arc ? { lastId: sess.arc.lastId, playedIds: [...(sess.arc.playedIds || [])] } : null;
    result.forceAnotherRound = !!sess.forceAnotherRound;
    result.sexTriggered = !!sess.pendingSex;
    // 輪數用完或可抽池空：標 roundEnded，等玩家看完反應再進 round_end
    // 色情卡已設 forceAnotherRound：輪末必留下，文案仍走 round_end 流程
    if (result.playsLeft <= 0 || settle?.empty) result.roundEnded = true;
    else if (result.playsLeft <= 0) maybeRoundEnd(sess);
  };

  // 開門
  if (def.openChain) {
    const open = tryOpen(def, stage);
    result.open = open;
    // 開門消耗：清舊鍊、扣 1 base N（本輪）
    sess.chain = null;
    sess.nLeft = Math.max(0, (sess.nLeft || 0) - 1);

    if (!open.success) {
      result.emotionDelta = rollEmotion(def, stage, { fail: true, guardHigh });
      let shattered = false;
      const shouldShatter = shattersOnUse(def) && inst.source === "inventory";
      if (shouldShatter) {
        invShatter(state, def.id);
        result.shattered = true;
        shattered = true;
      }
      sess.playedThisRound.push(def.id);
      const settle = settleAfterPlay(sess, inst, def, { shattered });
      sess.log.push({ t: Date.now(), kind: "open_fail", cardId: def.id, delta: result.emotionDelta });
      finishPlay(true, settle);
      return result;
    }

    sess.chain = {
      attr: def.openChain.attr,
      kLeft: def.openChain.k,
      sourceCardId: def.id,
    };
    result.emotionDelta = rollEmotion(def, stage, { guardHigh });
    applyCardEffect(sess, def, result, stage);
    let shattered = false;
    // 色情卡規格一律碎；其餘看 shatterOnUse
    const shouldShatter = shattersOnUse(def) && inst.source === "inventory";
    if (shouldShatter) {
      invShatter(state, def.id);
      result.shattered = true;
      shattered = true;
    }
    sess.playedThisRound.push(def.id);
    const settle = settleAfterPlay(sess, inst, def, { shattered });
    sess.log.push({
      t: Date.now(),
      kind: "open_ok",
      cardId: def.id,
      chain: result.chain,
      delta: result.emotionDelta,
      sexTriggered: result.sexTriggered,
    });
    finishPlay(false, settle);
    return result;
  }

  // 普通卡
  spendPlayNormal(sess, def);
  result.emotionDelta = rollEmotion(def, stage, { guardHigh });
  applyCardEffect(sess, def, result, stage);
  let shattered = false;
  const shouldShatter = shattersOnUse(def) && inst.source === "inventory";
  if (shouldShatter) {
    invShatter(state, def.id);
    result.shattered = true;
    shattered = true;
  }
  sess.playedThisRound.push(def.id);
  const settle = settleAfterPlay(sess, inst, def, { shattered });
  sess.log.push({
    t: Date.now(),
    kind: "play",
    cardId: def.id,
    delta: result.emotionDelta,
    sexTriggered: result.sexTriggered,
    forceAnotherRound: result.forceAnotherRound,
  });
  finishPlay(false, settle);
  return result;
}

function spendPlayNormal(sess, def) {
  if (sess.chain && sess.chain.kLeft > 0 && compatible(def, sess.chain.attr)) {
    sess.chain.kLeft -= 1;
    if (sess.chain.kLeft <= 0) sess.chain = null;
  } else {
    sess.nLeft = Math.max(0, (sess.nLeft || 0) - 1);
  }
}

function resolveSexTierPhase(def) {
  const tier = def.sexTier || (isForeplayCard(def)
    ? (def.sexBase || !def.parentId ? "foreplay" : "foreplay_l1")
    : "sex_act");
  const phase = def.sexPhase || (
    tier === "sex_act_l5" || def.sexEnd ? "player_climax"
      : tier === "sex_act_l4" ? "climax"
        : tier === "sex_act_l3" ? "intercourse_intense"
          : tier === "sex_act" || isIntercourseCard(def) ? "intercourse"
            : "foreplay"
  );
  const sexEnd = !!(def.sexEnd || tier === "sex_act_l5" || phase === "player_climax");
  return { sexTier: tier, sexPhase: phase, sexEnd };
}

function pendingBase(pending, st, extra = {}) {
  return {
    fromCardId: pending.fromCardId || null,
    fromErotic: pending.fromErotic || pending.fromCardId || null,
    stage: st,
    at: Date.now(),
    chainDepth: (pending.chainDepth || 0) + 1,
    rootId: pending.rootId || null,
    sameCount: pending.sameCount || 0,
    ...extra,
  };
}

/** 安排下一幕 pendingSex；回傳 { chainNext, needChoice, branch } */
function scheduleSexFollowup(sess, def, pending, st, result) {
  const { sexEnd } = resolveSexTierPhase(def);
  if (sexEnd) {
    sess.pendingSex = null;
    return { chainNext: false, needChoice: false, branch: "end" };
  }

  const rootId = pending.rootId || (isForeplayCard(def) && (def.sexBase || !def.parentId)
    ? def.id
    : sexRootId(def.id));
  const depth = (pending.chainDepth || 0) + 1;
  if (depth > 24) {
    const fin = pickRandomId(sexFinishPoolIds(rootId)) || pickRandomId(sexFinishPoolIds(null));
    if (fin) {
      sess.pendingSex = pendingBase(pending, st, {
        mode: "play",
        preferId: fin,
        phase: "intercourse",
        rootId,
        sameCount: 0,
        chainDepth: depth,
      });
      return { chainNext: true, needChoice: false, branch: "finish_cap" };
    }
    sess.pendingSex = null;
    return { chainNext: false, needChoice: false, branch: "end" };
  }

  // ── 前戲：子卡若仍是前戲 → 玩家 2 選 1；若已是正戲子 → 系統隨機進正戲
  if (isForeplayCard(def)) {
    const kids = sexChildIds(def.id);
    const fpKids = kids.filter((id) => isForeplayCard(id));
    const intKids = kids.filter((id) => isIntercourseCard(id));
    const choiceN = Math.max(1, Number(d("sex_choice_count", 2)) || 2);

    if (fpKids.length) {
      const choices = sampleIds(fpKids, Math.min(choiceN, fpKids.length));
      if (choices.length >= 2) {
        sess.pendingSex = pendingBase(pending, st, {
          mode: "choose",
          choices,
          phase: "foreplay",
          rootId: rootId || def.id,
          sameCount: 0,
          chainDepth: depth,
        });
        return { chainNext: true, needChoice: true, branch: "foreplay_choice" };
      }
      // 僅一張：自動打
      sess.pendingSex = pendingBase(pending, st, {
        mode: "play",
        preferId: choices[0],
        phase: "foreplay",
        rootId: rootId || def.id,
        sameCount: 0,
        chainDepth: depth,
      });
      return { chainNext: true, needChoice: false, branch: "foreplay_auto" };
    }

    if (intKids.length) {
      sess.pendingSex = pendingBase(pending, st, {
        mode: "play",
        preferId: pickRandomId(intKids),
        phase: "intercourse",
        rootId: rootId || def.id,
        sameCount: 0,
        chainDepth: depth,
      });
      return { chainNext: true, needChoice: false, branch: "enter_intercourse" };
    }

    // 無子：跳射精
    const fin = pickRandomId(sexFinishPoolIds(rootId || def.id));
    if (fin) {
      sess.pendingSex = pendingBase(pending, st, {
        mode: "play",
        preferId: fin,
        phase: "intercourse",
        rootId: rootId || def.id,
        sameCount: 0,
        chainDepth: depth,
      });
      return { chainNext: true, needChoice: false, branch: "finish" };
    }
    sess.pendingSex = null;
    return { chainNext: false, needChoice: false, branch: "end" };
  }

  // ── 正戲：same 1/2 · finish 1/3 · next 1/3（相對權重正規化）
  const branch = rollIntercourseBranch({ sameCount: pending.sameCount || 0 });
  let preferId = null;
  let sameCount = pending.sameCount || 0;
  let branchTag = branch;

  if (branch === "same") {
    preferId = def.id;
    sameCount += 1;
  } else if (branch === "finish") {
    preferId = pickRandomId(sexFinishPoolIds(rootId)) || pickRandomId(sexFinishPoolIds(null));
    sameCount = 0;
  } else {
    // next
    const kids = sexChildIds(def.id);
    if (kids.length) {
      preferId = pickRandomId(kids);
      sameCount = 0;
    } else {
      preferId = pickRandomId(sexFinishPoolIds(rootId)) || pickRandomId(sexFinishPoolIds(null));
      sameCount = 0;
      branchTag = "finish_fallback";
    }
  }

  if (!preferId) {
    sess.pendingSex = null;
    return { chainNext: false, needChoice: false, branch: "end" };
  }

  sess.pendingSex = pendingBase(pending, st, {
    mode: "play",
    preferId,
    phase: "intercourse",
    rootId,
    sameCount,
    chainDepth: depth,
    lastCardId: def.id,
    lastBranch: branchTag,
  });
  result.effects.push(`sex:branch_${branchTag}`);
  return { chainNext: true, needChoice: false, branch: branchTag };
}

/**
 * 演出一張做愛卡（前戲／正戲）。
 * - 前戲選完或系統 preferId 後呼叫
 * - 不進手牌、不扣 nLeft、不碎庫存
 */
export function commitSexPlay(state, { stage = "stranger", guardHigh = false, cardId = null } = {}) {
  const sess = state.cardSession;
  if (!sess) return { ok: false, err: "沒有牌局" };
  if (!sess.pendingSex) return { ok: false, err: "沒有待進行的做愛" };
  if (sess.pendingSex.mode === "choose" && !cardId) {
    return { ok: false, err: "請先選擇前戲", needChoice: true, choices: sexChoiceOptions(state) };
  }

  const pending = { ...sess.pendingSex };
  // 玩家選擇：必須在 choices 內
  if (pending.mode === "choose" && cardId) {
    if (!(pending.choices || []).includes(cardId)) {
      return { ok: false, err: "不是可選的前戲卡" };
    }
  }

  const pickId =
    (cardId && isSexCard(cardId) ? cardId : null) ||
    pickSexCardId({
      preferId: pending.preferId || null,
      excludeIds: pending.excludeIds || [],
    });
  const def = pickId ? cardById(pickId) : null;
  if (!def || !isSexCard(def)) {
    sess.pendingSex = null;
    return { ok: false, err: "做愛卡池是空的（請在牌組加 foreplay／intercourse 卡）" };
  }

  const st = stage || pending.stage || "stranger";
  const { sexTier, sexPhase, sexEnd } = resolveSexTierPhase(def);
  const rootId = pending.rootId
    || (isForeplayCard(def) && (def.sexBase || !def.parentId) ? def.id : sexRootId(def.id));

  const result = {
    ok: true,
    cardId: def.id,
    name: def.name,
    kind: def.kind || (isForeplayCard(def) ? "foreplay" : "intercourse"),
    erotic: false,
    sexScene: true,
    sexTriggered: false,
    sexTier,
    sexPhase,
    sexEnd,
    parentId: def.parentId || null,
    fromErotic: pending.fromErotic || pending.fromCardId || null,
    sceneStart: sceneTextFor(state, def.id),
    girlLine: "",
    feelLabel: "",
    open: null,
    emotionDelta: 0,
    shattered: false,
    chain: sess.chain ? { ...sess.chain } : null,
    forceAnotherRound: !!sess.forceAnotherRound,
    effects: [isForeplayCard(def) ? "sex:foreplay" : "sex:intercourse"],
    playsLeft: playsLeft(sess),
    roundEnded: false,
    pendingCleared: true,
    sexChainNext: false,
    needSexChoice: false,
    sexBranch: null,
  };

  result.emotionDelta = rollEmotion(def, st, { guardHigh });
  // 不做 applyCardEffect 的 erotic 分支；sex 卡只套 effect 合併
  const eff = resolveMergedEffect(def, BY_ID, { mode: "sum" }) || {};
  if (eff.forceAnotherRound) {
    sess.forceAnotherRound = true;
    result.forceAnotherRound = true;
  }
  if (isSexCard(def)) {
    result.sexScene = true;
    result.effects.push("sex:scene");
  }

  const arc = ensureArc(sess);
  // 同卡重演允許；仍更新 lastId
  if (!arc.playedIds.includes(def.id)) arc.playedIds.push(def.id);
  arc.lastId = def.id;
  sess.playedThisRound.push(def.id);

  // 更新 root 後排程下一幕
  pending.rootId = rootId;
  const follow = scheduleSexFollowup(sess, def, pending, st, result);
  result.sexChainNext = !!follow.chainNext;
  result.needSexChoice = !!follow.needChoice;
  result.sexBranch = follow.branch || null;
  result.pendingCleared = !sess.pendingSex;

  let line = girlReactionLine({
    stage: st,
    emotionDelta: result.emotionDelta,
    openFail: false,
    kind: result.kind,
    sexPhase,
  });
  if (isWeakLine(line)) {
    line = sexEnd
      ? "……哈啊……射、射進來了……"
      : sexPhase === "climax"
        ? "……啊啊……去、去了……"
        : "……啊、哈……太深……";
  }
  result.girlLine = line;
  result.visualPose = null;
  result.fromAi = false;
  result.feelLabel = emotionFeelLabel(result.emotionDelta);
  result.playsLeft = playsLeft(sess);
  result.forceAnotherRound = !!sess.forceAnotherRound;
  // 做愛鏈結束 ≠ 牌局結束：不在這裡標 roundEnded。
  // 回打牌桌由 UI afterSexReturnToCards 處理（有輪數就回手牌；有 forceAnotherRound 就再開一輪）。
  result.sexChainDone = !!(sexEnd && !result.sexChainNext);
  result.roundEnded = false;

  sess.log.push({
    t: Date.now(),
    kind: "sex_play",
    cardId: def.id,
    cardKind: def.kind,
    parentId: def.parentId || null,
    fromErotic: result.fromErotic,
    chainNext: result.sexChainNext,
    chainDone: result.sexChainDone,
    branch: result.sexBranch,
    delta: result.emotionDelta,
  });

  return result;
}

/** 玩家點選前戲 2 選 1 */
export function commitSexChoice(state, cardId, opts = {}) {
  const sess = state.cardSession;
  if (!sess?.pendingSex || sess.pendingSex.mode !== "choose") {
    return { ok: false, err: "現在不是選前戲的時候" };
  }
  return commitSexPlay(state, { ...opts, cardId });
}

/** 是否還有待演出／待選擇的做愛 */
export function hasPendingSex(state) {
  return !!(state.cardSession?.pendingSex);
}

function applyCardEffect(sess, def, result, stage = "stranger") {
  // 詞墜繼承：父鏈 effect 加總後再套用（子覆寫同名非數字鍵）
  const eff = resolveMergedEffect(def, BY_ID, { mode: "sum" }) || {};

  // 色情卡內建：一律消耗語意已在 shatter 分支；此處強制再一輪 + 擲做愛
  if (isEroticCard(def)) {
    sess.forceAnotherRound = true;
    result.forceAnotherRound = true;
    result.effects.push("erotic:force_next_round");
    // 做愛機率：陌生 1/10、朋友 1/8、女友 1/3、妻子 1/2
    // 觸發 → 前戲 2 選 1（看完反應後 UI 選）
    if (rollSexTrigger(stage)) {
      const pool = sexBasePoolIds();
      const choiceN = Math.max(1, Number(d("sex_choice_count", 2)) || 2);
      const choices = sampleIds(pool, Math.min(choiceN, pool.length || 0));
      if (choices.length) {
        sess.pendingSex = {
          mode: choices.length >= 2 ? "choose" : "play",
          choices: choices.length >= 2 ? choices : undefined,
          preferId: choices.length === 1 ? choices[0] : undefined,
          phase: "foreplay",
          fromCardId: def.id,
          fromErotic: def.id,
          stage,
          at: Date.now(),
          poolSize: pool.length,
          rootId: null,
          sameCount: 0,
          chainDepth: 0,
        };
        result.sexTriggered = true;
        result.needSexChoice = choices.length >= 2;
        result.sexChoices = choices.length >= 2 ? [...choices] : null;
        result.effects.push("erotic:sex_trigger");
      }
    }
  }

  // 做愛卡經 commitSexPlay 演出，一般 commitPlay 不應打到
  if (isSexCard(def)) {
    result.sexScene = true;
    result.effects.push("sex:scene");
    if (eff.sexScene) result.effects.push("sex:flag");
  }

  if (!eff || !Object.keys(eff).length) {
    // 無 effect 物件時色情內建已處理完
    return;
  }
  if (eff.forceAnotherRound) {
    sess.forceAnotherRound = true;
    result.forceAnotherRound = true;
  }
  if (Array.isArray(eff.setFlags)) {
    sess.flags ??= {};
    for (const f of eff.setFlags) sess.flags[f] = true;
    result.effects.push(...eff.setFlags.map(f => `flag:${f}`));
  }
  if (eff.guardDelta) result.effects.push({ guardDelta: eff.guardDelta });
  if (eff.cravingDelta) result.effects.push({ cravingDelta: eff.cravingDelta });
  if (eff.mentionErrand) result.effects.push({ mentionErrand: true });
}

function maybeRoundEnd(sess) {
  if (playsLeft(sess) <= 0) {
    // 進入 round_end 由 resolveRoundEnd 處理；此處只標 phase 可選
    // 留給玩家按「結束」或自動：自動較省事
    sess.phase = "round_end";
  }
}

export function playerEndRound(state) {
  const sess = state.cardSession;
  if (!sess || sess.phase !== "round_play") return { ok: false, err: "不在打牌中" };
  sess.phase = "round_end";
  sess.pending = null;
  return { ok: true };
}

/**
 * 輪末：未用 inventory 退庫（本來就沒扣）；girl/venue 丟棄。
 * 留下 → round_setup；離開 → idle_present（看板）或 closed（約會）
 */
export function resolveRoundEnd(state, { stage = "stranger" } = {}) {
  const sess = state.cardSession;
  if (!sess || sess.phase !== "round_end") return { ok: false, err: "不在輪末" };

  // 未打出 inventory：count 未扣（已保證）；已碎已在 commit 扣完
  sess.hand = [];
  sess.drawPile = [];
  sess.sessionDeck = [];
  sess.injected = [];
  sess.chain = null;
  sess.nLeft = 0;
  sess.pending = null;
  sess.arc = { lastId: null, playedIds: [] };

  let stay = false;
  let stayReason = "roll";
  if (sess.forceAnotherRound) {
    // 《不可走》或色情卡：無條件再來一輪（不骰留下）
    stay = true;
    stayReason = sess.pendingSex ? "erotic_or_force+sex" : "forceAnotherRound";
    sess.forceAnotherRound = false;
  } else if (sess.mode === "date") {
    // M3：約會輪末預設散場（只有《不可走》等 forceAnotherRound 可再來一輪）
    stay = false;
    stayReason = "date_default_leave";
  } else {
    stay = Math.random() < stayChance(stage);
    stayReason = stay ? "stay_roll" : "leave_roll";
  }

  // 輪末若還掛著 pendingSex：本應在反應後立刻 commitSexPlay；
  // 若玩家跳過／異常進輪末，此處作廢以免殘旗。
  if (sess.pendingSex) {
    sess.log.push({ t: Date.now(), kind: "sex_pending_drop", pending: { ...sess.pendingSex } });
    sess.pendingSex = null;
  }

  if (stay) {
    // 再來一輪：不回局內組牌，由 UI 直接 startPlayRound 用牌組
    sess.phase = "idle_present";
    sess.log.push({ t: Date.now(), kind: "stay", reason: stayReason });
    return {
      ok: true,
      stay: true,
      phase: sess.phase,
      stayReason,
      pendingSex: null,
    };
  }

  // 離開
  if (sess.pendingSex) sess.pendingSex = null;

  // 離開打牌 session，看板仍在任
  if (sess.mode === "kanban") {
    sess.phase = "idle_present";
    sess.roundIndex = sess.roundIndex; // 保留輪數資訊
    sess.log.push({ t: Date.now(), kind: "leave_table", reason: stayReason });
    return { ok: true, stay: false, phase: sess.phase, closed: false, stayReason };
  }

  // 約會散
  closeSession(state, "date_end");
  return { ok: true, stay: false, phase: "closed", closed: true, stayReason };
}

export function closeSession(state, reason = "close") {
  const sess = state.cardSession;
  if (!sess) return { ok: true };
  // 未用碎卡：count 未扣，無需退
  // 進行中若有 pending 未確認，也沒扣
  sess.phase = "closed";
  sess.hand = [];
  sess.drawPile = [];
  sess.sessionDeck = [];
  sess.injected = [];
  sess.chain = null;
  sess.pending = null;
  sess.arc = { lastId: null, playedIds: [] };
  sess.closedReason = reason;
  state.cardSession = null;
  return { ok: true, reason };
}

/** 看板到期／解召：強制關 session */
export function closeSessionIfGirl(state, girlId) {
  if (state.cardSession?.girlId === girlId) closeSession(state, "girl_left");
}

// ── Bubble（M2：委託三節點 15% 碎嘴）──────────────────────
// 鎖死：機率固定 bubble_chance（預設 0.15），禁止改成成長公式。
// 情感：每次中氣泡 +0/+1 各半；每隻每日來自氣泡的情感上限 +2（仍可顯示台詞）。

export const BUBBLE_AFF_DAY_CAP = 2;

function ensureBubbleAff(state, dayKey) {
  state.bubbleAff ??= { day: null, byGirl: {} };
  if (dayKey != null && state.bubbleAff.day !== dayKey) {
    state.bubbleAff = { day: dayKey, byGirl: {} };
  }
  return state.bubbleAff;
}

/**
 * @param {string} eventKey  discover | accept | complete（其他 key 不擲）
 * @returns {{ girlId, text, emotionDelta }[]}
 */
export function rollBubble(state, eventKey, {
  questText = "",
  asleep = false,
  girlIds = [],
  dayKey = null,
} = {}) {
  const chance = d("bubble_chance", 0.15);
  if (asleep) return [];
  if (state.cardSession?.phase === "round_play") return [];
  const poolMap = {
    discover: "on_discover",
    accept: "on_accept",
    complete: "on_complete",
  };
  const poolKey = poolMap[eventKey];
  if (!poolKey) return [];
  const lines = bubbleCanned()[poolKey] || [];
  const aff = ensureBubbleAff(state, dayKey);
  const out = [];
  for (const gid of girlIds) {
    if (Math.random() >= chance) continue;
    let text = lines.length ? lines[Math.floor(Math.random() * lines.length)] : "……";
    text = text.replace(/\{quest\}/g, questText || "那件事");
    let emotionDelta = 0;
    // 台詞不因 cap 封鎖；只有情感受日 cap
    if (dayKey != null) {
      const used = aff.byGirl[gid] || 0;
      if (used < BUBBLE_AFF_DAY_CAP && Math.random() < 0.5) {
        emotionDelta = 1;
        aff.byGirl[gid] = used + 1;
      }
    }
    out.push({ girlId: gid, text, emotionDelta });
  }
  return out;
}

// ── Debug helpers ──────────────────────────────────────────

export function debugDump() {
  return {
    ready: cardsReady(),
    cardCount: DATA?.cards?.length || 0,
    starter: starterPoolIds().length,
    defaults: cardDefaults(),
  };
}
