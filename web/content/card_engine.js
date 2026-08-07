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

export function setCardsData(data) {
  DATA = data;
  for (const k of Object.keys(BY_ID)) delete BY_ID[k];
  for (const c of data?.cards || []) BY_ID[c.id] = c;
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

export function starterPoolIds() {
  return DATA?.starter_pool || [];
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
  if (!def.shatterOnUse) return !!(e.unlocked || e.count > 0);
  return (e.count || 0) > 0;
}

export function invAdd(state, cardId, n = 1) {
  const def = BY_ID[cardId];
  if (!def) return false;
  state.cardInventory ??= {};
  const e = (state.cardInventory[cardId] ??= { count: 0 });
  if (!def.shatterOnUse) {
    e.unlocked = true;
    e.count = 1;
  } else {
    e.count = (e.count || 0) + n;
  }
  return true;
}

/** 確認使用碎卡後扣庫存 */
export function invShatter(state, cardId) {
  const def = BY_ID[cardId];
  if (!def?.shatterOnUse) return;
  const e = state.cardInventory?.[cardId];
  if (!e) return;
  e.count = Math.max(0, (e.count || 0) - 1);
}

export function grantStarter(state, cardId) {
  if (!starterPoolIds().includes(cardId)) return { ok: false, err: "不是創角話術" };
  invAdd(state, cardId, 1);
  state.playerProfile ??= {};
  state.playerProfile.starterSpeechCardId = cardId;
  return { ok: true };
}

/**
 * 舊存檔相容：已有進度卻沒話術 → 補一張；全新檔不自動給，留給創角輪巡。
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
  const hasAnySpeech = Object.keys(state.cardInventory).some(id => {
    const def = BY_ID[id];
    return def && def.kind === "speech" && invOwns(state, id);
  });
  if (hasAnySpeech) {
    if (!state.playerProfile.starterSpeechCardId) {
      const first = Object.keys(state.cardInventory).find(id => BY_ID[id]?.kind === "speech");
      if (first) state.playerProfile.starterSpeechCardId = first;
    }
    return;
  }
  // 已寫過 starter id 但庫存空了 → 補回
  if (state.playerProfile.starterSpeechCardId) {
    invAdd(state, state.playerProfile.starterSpeechCardId, 1);
    return;
  }
  // 全新／重置：不自動發卡
  const progressed =
    (state.succubi?.length || 0) > 0 ||
    (state.gold || 0) !== 0 ||
    (state.quests?.length || 0) > 0 ||
    (state.dungeon?.length || 0) > 0;
  if (!progressed) return;
  // 舊存檔有進度卻沒牌制欄位
  const sid = starterPoolIds()[0] || "speech_soft";
  invAdd(state, sid, 1);
  state.playerProfile.starterSpeechCardId = sid;
}

/**
 * 依 tag 分數從 starter_pool 配一張基礎話術。
 * scores: { soft: n, blunt: n, ... } 對應 speech_* 後綴
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

// ── Card shop（state.cardShop；勿與祭品 state.shop 混淆）──

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

export function refreshCardShop(state, now = Date.now()) {
  const slotsN = d("shop_slots", 3);
  const hours = d("shop_refresh_hours", 4);
  const sw = DATA?.shop_weights || {};
  const speech = sw.speech_pool || [];
  const premium = sw.premium_pool || [];
  const combined = [...speech, ...premium];
  const slots = [];
  const used = new Set();
  for (let i = 0; i < slotsN; i++) {
    const prefer = i === 0 ? speech : Math.random() < 0.3 ? speech : premium;
    let id = null;
    for (let t = 0; t < 24; t++) {
      const cand = weightedPick(prefer.length ? prefer : combined);
      if (cand && !used.has(cand)) {
        id = cand;
        break;
      }
    }
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
  // 0～1 張特價（premium 7 折）
  const premIdx = slots
    .map((s, i) => i)
    .filter(i => BY_ID[slots[i].cardId]?.kind === "shop_premium");
  if (premIdx.length && Math.random() < 0.55) {
    const i = premIdx[Math.floor(Math.random() * premIdx.length)];
    slots[i].isSale = true;
    slots[i].salePrice = Math.max(1, Math.floor(slots[i].price * 0.7));
  }
  state.cardShop = {
    nextRefreshAt: now + hours * 3600 * 1000,
    slots,
  };
}

export function ensureCardShop(state, now = Date.now()) {
  state.cardShop ??= { nextRefreshAt: 0, slots: [] };
  const need =
    !Array.isArray(state.cardShop.slots) ||
    state.cardShop.slots.length !== d("shop_slots", 3) ||
    now >= (state.cardShop.nextRefreshAt || 0);
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
  if (!def.shatterOnUse && invOwns(state, slot.cardId)) {
    return { ok: false, err: "已擁有這張話術" };
  }
  const price = slot.isSale && slot.salePrice != null ? slot.salePrice : slot.price;
  if ((state.gold || 0) < price) return { ok: false, err: "金幣不夠" };
  state.gold -= price;
  invAdd(state, slot.cardId, 1);
  slot.sold = true;
  return { ok: true, cardId: slot.cardId, price, name: def.name, shatter: !!def.shatterOnUse };
}

export function inventoryList(state) {
  const rows = [];
  for (const [id, e] of Object.entries(state.cardInventory || {})) {
    const def = BY_ID[id];
    if (!def) continue;
    if (!def.shatterOnUse && !(e.unlocked || e.count > 0)) continue;
    if (def.shatterOnUse && !(e.count > 0)) continue;
    rows.push({
      cardId: id,
      name: def.name,
      kind: def.kind,
      shatterOnUse: !!def.shatterOnUse,
      count: def.shatterOnUse ? e.count || 0 : 1,
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
  return sess;
}

export function compatible(cardDef, chainAttr) {
  if (!chainAttr || chainAttr === "any") return true;
  const tags = cardDef?.tags || [];
  if (tags.includes("any")) return true;
  return tags.includes(chainAttr);
}

export function maxInject(state) {
  // 第一版固定 5（defaults.max_inject）；成長軸日後再接 cardPlayerLv
  return d("max_inject", 5);
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
    if (def.kind === "girl_trait" || def.kind === "venue_event") {
      return { ok: false, err: "本體／場地卡不能進牌組", ids: [] };
    }
    if (!def.shatterOnUse) {
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
    if (!def || def.kind === "girl_trait" || def.kind === "venue_event") continue;
    const n = (need[id] || 0) + 1;
    if (!def.shatterOnUse) {
      if (!invOwns(state, id) || n > 1) continue;
    } else if (invCount(state, id) < n) {
      continue;
    }
    need[id] = n;
    next.push(id);
  }
  // 空牌組且有創角話術 → 自動放一張
  if (!next.length && state.playerProfile?.starterSpeechCardId) {
    const sid = state.playerProfile.starterSpeechCardId;
    if (invOwns(state, sid) || BY_ID[sid]) next.push(sid);
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

/**
 * @param girl { stage, specialTraits?, job? }
 * @param opts { cravingMidOrHigh: boolean }
 */
export function buildGirlCards(girl, opts = {}) {
  const rules = DATA?.girl_card_build_rules;
  const max = rules?.max || d("max_girl_cards", 3);
  const out = [];
  const hasSpecial = Array.isArray(girl.specialTraits) && girl.specialTraits.length > 0;

  for (const slot of rules?.slots || []) {
    if (out.length >= max) break;
    if (slot.slot === "stage") {
      const id = slot.pick?.[girl.stage] || slot.pick?.stranger;
      if (id && BY_ID[id]) out.push(makeInstance(id, "girl"));
    } else if (slot.slot === "identity") {
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

export function buildVenueCards(venueId) {
  const v = (DATA?.venues || []).find(x => x.id === venueId);
  if (!v) return [];
  return (v.cardIds || []).slice(0, 3).filter(id => BY_ID[id]).map(id => makeInstance(id, "venue"));
}

// ── Emotion dice ───────────────────────────────────────────

const FALLBACK_EMOTION = {
  speech: {
    stranger: { min: -1, max: 1 },
    friend: { min: 0, max: 2 },
    girlfriend: { min: 0, max: 2 },
    wife: { min: 0, max: 1 },
  },
  touch: {
    stranger: { min: -2, max: 1 },
    friend: { min: -1, max: 2 },
    girlfriend: { min: 1, max: 3 },
    wife: { min: 1, max: 2 },
  },
  sex: {
    stranger: { min: -3, max: 0 },
    friend: { min: -2, max: 1 },
    girlfriend: { min: 0, max: 4 },
    wife: { min: 1, max: 3 },
  },
};

export function emotionTable(def, stage, { fail = false } = {}) {
  if (fail) {
    // 父鏈 emotionOnFail：子優先
    let cur = def;
    const seen = new Set();
    while (cur && !seen.has(cur.id)) {
      seen.add(cur.id);
      if (cur.emotionOnFail) return cur.emotionOnFail;
      cur = cur.parentId ? BY_ID[cur.parentId] : null;
    }
    return d("emotion_fail_open", { min: -3, max: -1 });
  }
  // 詞墜繼承：子卡有寫該 stage 就用子；否則沿父鏈往上
  let cur = def;
  const seen = new Set();
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    if (cur.emotion?.[stage]) return cur.emotion[stage];
    cur = cur.parentId ? BY_ID[cur.parentId] : null;
  }
  if (def?.emotion?.[stage]) return def.emotion[stage];
  const tags = def?.tags || [];
  let lane = "speech";
  if (tags.includes("sex")) lane = "sex";
  else if (tags.includes("touch") || tags.includes("play")) lane = "touch";
  const table = FALLBACK_EMOTION[lane] || FALLBACK_EMOTION.speech;
  return table[stage] || table.stranger || { min: 0, max: 0 };
}

export function rollEmotion(def, stage, opts = {}) {
  const t = emotionTable(def, stage, opts);
  let delta = randInt(t.min ?? 0, t.max ?? 0);
  if (opts.guardHigh && delta > 0) delta = 0;
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

export function girlReactionLine({ stage = "stranger", emotionDelta = 0, openFail = false } = {}) {
  if (openFail) return pickLine(REACT_FAIL);
  let band = "zero";
  if (emotionDelta >= 2) band = "hi";
  else if (emotionDelta >= 1) band = "pos";
  else if (emotionDelta <= -2) band = "lo";
  else if (emotionDelta <= -1) band = "neg";
  const byStage = REACT_BY_BAND[band] || REACT_BY_BAND.zero;
  return pickLine(byStage[stage] || byStage.stranger || REACT_BY_BAND.zero.stranger);
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

function drawToHand(sess) {
  const handMax = d("hand_size", 5);
  while (sess.hand.length < handMax && sess.drawPile.length > 0) {
    sess.hand.push(sess.drawPile.pop());
  }
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
    drawPile: [],
    hand: [],
    nBase: 0,
    nLeft: 0,
    chain: null,
    flags: {},
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

export function narrProgress(sess) {
  const map = sess?.cardNarr || {};
  const ids = Object.keys(map);
  const total = ids.length;
  let done = 0;
  for (const id of ids) {
    if (map[id]?.status === "done" || map[id]?.status === "error") done++;
  }
  return { done, total, ready: total > 0 && done >= total };
}

/** 打牌用動態場面句；沒有才退回卡面固定 sceneStart */
export function sceneTextFor(state, cardId) {
  const def = cardById(cardId);
  const dyn = state.cardSession?.cardNarr?.[cardId];
  if (dyn?.status === "done" && dyn.text && !isWeakLine(dyn.text)) return dyn.text;
  return def?.sceneStart || def?.name || "……";
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
  sess.drawPile = [];
  sess.hand = [];
  sess.chain = null;
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
  // 已在打牌且還有次數 → 視為繼續
  if (sess.phase === "round_play" && playsLeft(sess) > 0) {
    return { ok: true, already: true, hand: sess.hand, nLeft: sess.nLeft };
  }
  const okPhases = new Set([
    "idle_present", "round_setup", "round_end", "round_play", "narr_prep",
  ]);
  if (!okPhases.has(sess.phase)) {
    return { ok: false, err: "現在不能開戰" };
  }
  // 牌意未演繹完不可開戰
  if (sess.phase === "narr_prep") {
    const p = narrProgress(sess);
    if (!p.ready) return { ok: false, err: "牌意還在演繹中" };
  }

  const deck = getDeck(state);
  const ir = setInject(state, deck);
  if (!ir.ok) {
    // 牌組壞了：用空押入（只打本體／場地）
    sess.injected = [];
  }

  const pile = [
    ...sess.girlCards.map(c => ({ ...c, used: false })),
    ...sess.injected.map(c => ({ ...c, used: false })),
    ...(sess.venueCards || []).map(c => ({ ...c, used: false })),
  ];
  if (!pile.length) return { ok: false, err: "牌堆是空的——商店編一組牌或等本體卡" };

  shuffleInPlace(pile);
  sess.drawPile = pile;
  sess.hand = [];
  drawToHand(sess);

  sess.girlStage = stage || "stranger";
  sess.nBase = basePlays(sess.girlStage, guardHigh);
  sess.nLeft = sess.nBase;
  sess.chain = null;
  sess.roundIndex = (sess.roundIndex || 0) + 1;
  sess.playedThisRound = [];
  sess.forceAnotherRound = false;
  sess.pending = null;
  sess.phase = "round_play";
  sess.log = sess.log || [];
  sess.log.push({
    t: Date.now(),
    kind: "round_start",
    n: sess.nLeft,
    round: sess.roundIndex,
    deck: deck.slice(),
  });
  return { ok: true, hand: sess.hand, nLeft: sess.nLeft, phase: "round_play", deckSize: deck.length };
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

/** 點牌：碎卡進確認層；話術可直接 play */
export function requestPlay(state, instanceId, opts = {}) {
  const sess = state.cardSession;
  const inst = sess?.hand?.find(h => h.instanceId === instanceId);
  const check = canSelectCard(sess, inst);
  if (!check.ok) return check;
  const def = check.def;
  if (def.shatterOnUse) {
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
    // 優先本局 AI 演繹的 3～4 句，不是 JSON 固定句
    sceneStart: sceneTextFor(state, def.id),
    girlLine: "",
    feelLabel: "",
    open: null,
    emotionDelta: 0,
    shattered: false,
    chain: null,
    forceAnotherRound: false,
    effects: [],
    playsLeft: 0,
    roundEnded: false,
  };

  const finishPlay = (openFail = false) => {
    // 即時路徑：先填罐頭；有模型時 app 會背景下單覆寫 girlLine
    let line = girlReactionLine({
      stage,
      emotionDelta: result.emotionDelta,
      openFail,
    });
    if (isWeakLine(line)) {
      line = openFail ? "我沒接住。別這樣。" : "我聽到了。";
    }
    result.girlLine = line;
    result.fromAi = false;
    result.feelLabel = emotionFeelLabel(result.emotionDelta);
    result.playsLeft = playsLeft(sess);
    result.chain = sess.chain ? { ...sess.chain } : null;
    // 次數用完：標 roundEnded，但等玩家看完反應再進 round_end
    if (result.playsLeft <= 0) result.roundEnded = true;
    else maybeRoundEnd(sess);
  };

  // 開門
  if (def.openChain) {
    const open = tryOpen(def, stage);
    result.open = open;
    // 開門消耗：清舊鍊、扣 1 base N
    sess.chain = null;
    sess.nLeft = Math.max(0, (sess.nLeft || 0) - 1);

    if (!open.success) {
      result.emotionDelta = rollEmotion(def, stage, { fail: true, guardHigh });
      if (def.shatterOnUse && inst.source === "inventory") {
        invShatter(state, def.id);
        result.shattered = true;
      }
      sess.playedThisRound.push(def.id);
      drawToHand(sess);
      sess.log.push({ t: Date.now(), kind: "open_fail", cardId: def.id, delta: result.emotionDelta });
      finishPlay(true);
      return result;
    }

    sess.chain = {
      attr: def.openChain.attr,
      kLeft: def.openChain.k,
      sourceCardId: def.id,
    };
    result.emotionDelta = rollEmotion(def, stage, { guardHigh });
    applyCardEffect(sess, def, result);
    if (def.shatterOnUse && inst.source === "inventory") {
      invShatter(state, def.id);
      result.shattered = true;
    }
    sess.playedThisRound.push(def.id);
    drawToHand(sess);
    sess.log.push({ t: Date.now(), kind: "open_ok", cardId: def.id, chain: result.chain, delta: result.emotionDelta });
    finishPlay(false);
    return result;
  }

  // 普通卡
  spendPlayNormal(sess, def);
  result.emotionDelta = rollEmotion(def, stage, { guardHigh });
  applyCardEffect(sess, def, result);
  if (def.shatterOnUse && inst.source === "inventory") {
    invShatter(state, def.id);
    result.shattered = true;
  }
  sess.playedThisRound.push(def.id);
  drawToHand(sess);
  sess.log.push({ t: Date.now(), kind: "play", cardId: def.id, delta: result.emotionDelta });
  finishPlay(false);
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

function applyCardEffect(sess, def, result) {
  // 詞墜繼承：父鏈 effect 加總後再套用（子覆寫同名非數字鍵）
  const eff = resolveMergedEffect(def, BY_ID, { mode: "sum" });
  if (!eff || !Object.keys(eff).length) return;
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

  // 手牌 + 抽牌堆裡未 used 的 inventory：不扣 count（已保證）
  // used 的已在 commit 時扣完
  sess.hand = [];
  sess.drawPile = [];
  sess.injected = [];
  sess.chain = null;
  sess.nLeft = 0;
  sess.pending = null;

  let stay = false;
  if (sess.forceAnotherRound) {
    stay = true;
    sess.forceAnotherRound = false;
  } else if (sess.mode === "date") {
    // M3：約會輪末預設散場（只有《不可走》等 forceAnotherRound 可再來一輪）
    stay = false;
  } else {
    stay = Math.random() < stayChance(stage);
  }

  if (stay) {
    // 再來一輪：不回局內組牌，由 UI 直接 startPlayRound 用牌組
    sess.phase = "idle_present";
    sess.log.push({ t: Date.now(), kind: "stay" });
    return { ok: true, stay: true, phase: sess.phase };
  }

  // 離開打牌 session，看板仍在任
  if (sess.mode === "kanban") {
    sess.phase = "idle_present";
    sess.roundIndex = sess.roundIndex; // 保留輪數資訊
    sess.log.push({ t: Date.now(), kind: "leave_table" });
    return { ok: true, stay: false, phase: sess.phase, closed: false };
  }

  // 約會散
  closeSession(state, "date_end");
  return { ok: true, stay: false, phase: "closed", closed: true };
}

export function closeSession(state, reason = "close") {
  const sess = state.cardSession;
  if (!sess) return { ok: true };
  // 未用碎卡：count 未扣，無需退
  // 進行中若有 pending 未確認，也沒扣
  sess.phase = "closed";
  sess.hand = [];
  sess.drawPile = [];
  sess.injected = [];
  sess.chain = null;
  sess.pending = null;
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
