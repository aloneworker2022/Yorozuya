// 詞墜繼承解析（卡牌 v7 概念）
// 每張卡是一個「詞墜」；子卡繼承父卡鏈上所有詞墜，再疊自己的。
// 例：問候 → [問候]；打趣(parent=問候) → [問候] [說笑話]
// 核心與編輯器共用；不要在此碰 DOM。

const STAGE_ORDER = ["stranger", "friend", "girlfriend", "wife"];

/**
 * @param {object[]} cards
 * @returns {Record<string, object>}
 */
export function indexById(cards) {
  const m = Object.create(null);
  for (const c of cards || []) {
    if (c?.id) m[c.id] = c;
  }
  return m;
}

/**
 * 自葉到根走 parentId，再反轉成祖先→自己。
 * @returns {{ id: string, name: string, token: string, card: object }[]}
 */
export function resolveTokenChain(card, byId, { maxDepth = 32 } = {}) {
  if (!card) return [];
  const seen = new Set();
  const stack = [];
  let cur = card;
  let depth = 0;
  while (cur && depth < maxDepth) {
    if (seen.has(cur.id)) {
      stack.push({
        id: cur.id,
        name: cur.name || cur.id,
        token: tokenOf(cur),
        card: cur,
        cycle: true,
      });
      break;
    }
    seen.add(cur.id);
    stack.push({
      id: cur.id,
      name: cur.name || cur.id,
      token: tokenOf(cur),
      card: cur,
    });
    const pid = cur.parentId || null;
    cur = pid ? byId[pid] : null;
    depth += 1;
  }
  stack.reverse();
  return stack;
}

/** 本卡貢獻的詞墜字串（缺則退回 name） */
export function tokenOf(card) {
  if (!card) return "";
  const t = (card.token ?? "").toString().trim();
  if (t) return t;
  return (card.name || card.id || "").toString().trim();
}

/** 格式化：`[問候] [說笑話]` */
export function formatTokenChain(chain) {
  return (chain || [])
    .map((n) => `[${n.token}]`)
    .join(" ");
}

/** 僅 token 字串陣列 */
export function tokenList(chain) {
  return (chain || []).map((n) => n.token);
}

/**
 * 合併父→子 effect（子覆寫同名鍵；數字 delta 可選擇相加）
 * @param {"override"|"sum"} mode
 */
export function resolveMergedEffect(card, byId, { mode = "sum" } = {}) {
  const chain = resolveTokenChain(card, byId);
  const out = {};
  for (const node of chain) {
    const eff = node.card?.effect;
    if (!eff || typeof eff !== "object") continue;
    for (const [k, v] of Object.entries(eff)) {
      if (mode === "sum" && typeof v === "number" && typeof out[k] === "number") {
        out[k] = out[k] + v;
      } else if (mode === "sum" && Array.isArray(v) && Array.isArray(out[k])) {
        out[k] = [...new Set([...out[k], ...v])];
      } else {
        out[k] = v;
      }
    }
  }
  return out;
}

/**
 * 感情表：子卡有寫就用子卡；否則沿父鏈找第一個有該 stage 的。
 * fail 時用 emotionOnFail 或 defaults。
 */
export function resolveEmotionTable(card, byId, stage, { fail = false, failDefault = { min: -3, max: -1 } } = {}) {
  const chain = resolveTokenChain(card, byId);
  if (fail) {
    for (let i = chain.length - 1; i >= 0; i--) {
      const e = chain[i].card?.emotionOnFail;
      if (e && typeof e.min === "number") return { ...e, source: chain[i].id };
    }
    return { ...failDefault, source: "default" };
  }
  for (let i = chain.length - 1; i >= 0; i--) {
    const e = chain[i].card?.emotion?.[stage];
    if (e && typeof e.min === "number") return { ...e, source: chain[i].id };
  }
  return { min: 0, max: 0, source: "empty" };
}

/** 模擬骰子 N 次，回傳分布摘要 */
export function simulateEmotion(card, byId, stage, { fail = false, trials = 200, failDefault } = {}) {
  const t = resolveEmotionTable(card, byId, stage, { fail, failDefault });
  const lo = t.min ?? 0;
  const hi = t.max ?? 0;
  const hist = Object.create(null);
  let sum = 0;
  for (let i = 0; i < trials; i++) {
    const v = lo + Math.floor(Math.random() * (hi - lo + 1));
    hist[v] = (hist[v] || 0) + 1;
    sum += v;
  }
  return {
    table: t,
    trials,
    mean: trials ? sum / trials : 0,
    hist,
    range: [lo, hi],
  };
}

/** 建樹：根卡 → children[] */
export function buildCardForest(cards) {
  const byId = indexById(cards);
  const roots = [];
  const kids = Object.create(null);
  for (const c of cards || []) {
    const pid = c.parentId || null;
    if (pid && byId[pid]) {
      (kids[pid] ??= []).push(c);
    } else {
      roots.push(c);
    }
  }
  function attach(c) {
    return {
      card: c,
      children: (kids[c.id] || [])
        .slice()
        .sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh"))
        .map(attach),
    };
  }
  return roots
    .slice()
    .sort((a, b) => (a.name || "").localeCompare(b.name || "", "zh"))
    .map(attach);
}

/** 子卡列表（直接 children） */
export function directChildren(cardId, cards) {
  return (cards || []).filter((c) => c.parentId === cardId);
}

/** 是否會形成環 */
export function wouldCycle(cardId, newParentId, byId) {
  if (!newParentId) return false;
  if (newParentId === cardId) return true;
  let cur = byId[newParentId];
  const seen = new Set([cardId]);
  let n = 0;
  while (cur && n < 64) {
    if (seen.has(cur.id)) return true;
    seen.add(cur.id);
    cur = cur.parentId ? byId[cur.parentId] : null;
    n += 1;
  }
  return false;
}

/** 從名稱推一個短詞墜（僅建議，不強制） */
export function suggestTokenFromName(name) {
  const s = (name || "").trim();
  if (!s) return "";
  // 去掉常見前綴噪音，取 2～6 字
  const cleaned = s
    .replace(/^(輕聲|把話|有話|岔開|多餘的|盯著)/, "")
    .trim();
  const base = cleaned || s;
  return base.slice(0, 6);
}

/** 組「詞墜效果」給 AI 用的短描述 */
export function tokenEffectBrief(card, byId) {
  const chain = resolveTokenChain(card, byId);
  const tokens = formatTokenChain(chain);
  const descs = chain
    .map((n) => {
      const d = (n.card.tokenDesc || "").trim();
      return d ? `${n.token}（${d}）` : n.token;
    })
    .join(" → ");
  return { tokens, descs, chain };
}

export function stageLabel(stage) {
  return (
    {
      stranger: "陌生",
      friend: "朋友",
      girlfriend: "女友",
      wife: "妻子",
    }[stage] || stage
  );
}

/** 沿 parentId 走到根（同 byId 可見範圍） */
export function findLineageRoot(card, byId) {
  if (!card) return null;
  let cur = card;
  const seen = new Set();
  while (cur?.parentId && byId[cur.parentId] && !seen.has(cur.id)) {
    seen.add(cur.id);
    cur = byId[cur.parentId];
  }
  return cur;
}

/**
 * 收集以 rootId 為根的整棵子樹 id（含自己，BFS）
 * @param {object[]} cards  搜尋子卡的範圍
 */
export function collectSubtreeIds(rootId, cards) {
  const kids = Object.create(null);
  for (const c of cards || []) {
    if (c.parentId) (kids[c.parentId] ??= []).push(c.id);
  }
  const out = [];
  const q = [rootId];
  const seen = new Set();
  while (q.length) {
    const id = q.shift();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    for (const k of kids[id] || []) q.push(k);
  }
  return out;
}

/**
 * 深拷一整支輩分，重編 id／parentId，掛到新 setId。
 * @param {"full"|"subtree"} mode
 *   full    = 從選中卡走到根，再取整棵
 *   subtree = 以選中卡為新根（切斷對原父的繼承）
 * @returns {{ clones: object[], idMap: Record<string,string>, rootOldId: string, rootNewId: string }}
 */
export function extractLineageClone(selectedCard, allCards, {
  mode = "full",
  newSetId,
  idPrefix = "x",
  stripStarter = true,
} = {}) {
  if (!selectedCard) throw new Error("沒有選中的卡");
  // 輩分只在「來源卡組」內走
  const srcSet = selectedCard.setId || "main";
  const srcCards = (allCards || []).filter((c) => (c.setId || "main") === srcSet);
  const by = indexById(srcCards);
  if (!by[selectedCard.id]) throw new Error("選中卡不在來源卡組");

  let rootOld = selectedCard;
  if (mode === "full") {
    rootOld = findLineageRoot(selectedCard, by) || selectedCard;
  }
  const oldIds = collectSubtreeIds(rootOld.id, srcCards);
  if (!oldIds.length) throw new Error("輩分是空的");

  const idMap = Object.create(null);
  const used = new Set((allCards || []).map((c) => c.id));

  function allocId(oldId) {
    const base = `${idPrefix}_${oldId}`.replace(/[^\w\-]+/g, "_").slice(0, 56);
    let id = base;
    let n = 2;
    while (used.has(id)) {
      id = `${base}_${n++}`;
    }
    idMap[oldId] = id;
    used.add(id);
    return id;
  }
  for (const oid of oldIds) allocId(oid);

  const clones = oldIds.map((oid) => {
    const src = by[oid];
    const copy = JSON.parse(JSON.stringify(src));
    copy.id = idMap[oid];
    copy.setId = newSetId || copy.setId;
    // subtree 模式：選中根切斷父；其餘 remapped
    if (mode === "subtree" && oid === rootOld.id) {
      copy.parentId = null;
    } else if (copy.parentId && idMap[copy.parentId]) {
      copy.parentId = idMap[copy.parentId];
    } else {
      // 父不在子樹內 → 變根
      copy.parentId = null;
    }
    if (stripStarter) copy.starter = false;
    copy._extract = {
      fromSetId: srcSet,
      fromCardId: oid,
      mode,
      at: Date.now(),
    };
    return copy;
  });

  return {
    clones,
    idMap,
    rootOldId: rootOld.id,
    rootNewId: idMap[rootOld.id],
    count: clones.length,
  };
}

export { STAGE_ORDER };
