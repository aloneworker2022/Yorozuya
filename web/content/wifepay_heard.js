/* 老婆還債：隔門聽不清（隻字片語／吟叫穿插）。純函式，遊戲與 /wifepay 測試、node 測試共用。
 * 只改男子／她的對白；旁白原樣。同一句＋同一顆種子會得到同一段，換種子才會變。
 */
const CJK_MIN = 0x3400, CJK_MAX = 0x9FFF, CJK_FA_MIN = 0xF900, CJK_FA_MAX = 0xFAFF;
const ELLIPSIS_CHARS = "…⋯.";
const PUNCT_CHARS = "、，。！？!?~～・·「」『』【】（）()—─－-．,";
const PARTICLES = "的了嗎呢吧啊嗯哈喔哦噢唉阿痾唔呀嘛啦咯呵喲欸";
const FUNC_WORDS = new Set([
  "怎麼", "什麼", "那個", "這個", "就是", "還是", "然後", "因為", "所以",
  "但是", "而且", "的話", "一下", "這樣", "那樣", "這麼", "那麼", "有點",
  "不是", "沒有", "已經", "還要", "一個", "一些", "一樣",
]);
const KEY_BITS = [
  "射", "進", "出", "深", "慢", "快", "爽", "愛", "要", "給", "夾", "頂", "插",
  "吻", "舔", "摸", "碰", "滿", "壞", "去", "來", "可以", "不行", "不要",
  "裡面", "後面", "前面", "舒服", "喜歡", "坐", "動", "翹", "高", "緊", "值",
  "近", "羞", "跪", "痠", "腰", "抱", "停", "黏", "錢", "舌", "嘴", "再", "點",
  "幹", "濕", "熱", "硬", "大",
];
const LEXICON = [
  "射進去", "慢一點", "快一點", "坐深一點", "最裡面", "從後面",
  "再近一點", "不要停", "好害羞", "好舒服", "好喜歡", "進到", "太深了",
  "不可以", "怎麼了", "射進來", "自己動", "深一點", "翹高一點", "有點愛上",
  "愛上了", "這麼黏", "伸出來", "貼這麼緊", "喜歡嗎", "膝蓋好痠",
  "怎麼", "可以", "射進", "進去", "進來", "出來", "不要", "不行", "一點",
  "裡面", "後面", "前面", "好爽", "好深", "好滿", "好近", "舒服", "喜歡",
  "自己", "愛上", "這麼", "那麼", "這樣", "那樣", "舌頭", "太深", "太快",
  "慢慢", "害羞", "膝蓋", "好痠", "姿勢", "最深", "真值", "再坐", "再近",
  "不要停", "有點", "太深了", "慢一點", "快一點",
];
const WIFE_MOANS = ["啊…", "嗯…", "哈啊", "痾…", "痾痾", "好爽…", "嗯啊", "啊啊", "唔…", "哈…", "啊"];
const MAN_MOANS = ["嗯", "哈", "呼…", "呃", "嗯…"];
const WIFE_TAILS = ["啊…", "嗯…", "好爽…", "哈啊…"];
const MAN_TAILS = ["嗯…", "哈…"];
const BANNED = ["強暴", "強姦", "迷姦", "未成年", "國中", "國小", "小學", "高中生", "幼", "蘿莉", "放開我", "救命", "報警"];
const LEVELS = {
  light: { clear: 0.22, a: 0.34, b: 0.28, ab: 0.16, drop: 0.45, keyKeep: 0.85, moanGap: 0.28, moanBreak: 0.12, moanTail: 0.28, moanMax: 2 },
  mid:   { clear: 0.12, a: 0.30, b: 0.30, ab: 0.28, drop: 0.62, keyKeep: 0.70, moanGap: 0.45, moanBreak: 0.28, moanTail: 0.45, moanMax: 3 },
  heavy: { clear: 0.05, a: 0.26, b: 0.28, ab: 0.41, drop: 0.78, keyKeep: 0.55, moanGap: 0.65, moanBreak: 0.45, moanTail: 0.70, moanMax: 4 },
};

const LEX_SORTED = [...new Set(LEXICON)].sort((a, b) => b.length - a.length || a.localeCompare(b));

function isCjk(ch) {
  const o = String(ch).charCodeAt(0);
  return (o >= CJK_MIN && o <= CJK_MAX) || (o >= CJK_FA_MIN && o <= CJK_FA_MAX);
}

export function normalizeMuffleLevel(v) {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "light" || s === "輕" || s === "lo" || s === "low" || s === "1") return "light";
  if (s === "heavy" || s === "重" || s === "hi" || s === "high" || s === "3") return "heavy";
  return "mid";
}

export function parseMuffleEnabled(v, fallback = true) {
  if (v == null || v === "") return fallback;
  if (typeof v === "boolean") return v;
  const s = String(v).trim().toLowerCase();
  if (["0", "false", "off", "no", "否", "關"].includes(s)) return false;
  if (["1", "true", "on", "yes", "是", "開"].includes(s)) return true;
  return fallback;
}

export function fnv1a(text) {
  let h = 2166136261;
  const bytes = new TextEncoder().encode(String(text ?? ""));
  for (const b of bytes) {
    h ^= b;
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h || 1;
}

export function makeRng(seed) {
  let s = (Number(seed) >>> 0) || 0x9E3779B9;
  return {
    next() {
      s = (Math.imul(1664525, s) + 1013904223) >>> 0;
      return s / 4294967296;
    },
    randint(n) {
      if (n <= 1) return 0;
      return Math.floor(this.next() * n) % n;
    },
    chance(p) { return this.next() < p; },
    pick(items) { return items[this.randint(items.length)]; },
  };
}

export function tokenizeHeard(text) {
  const s = String(text ?? "");
  const out = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      let j = i + 1;
      while (j < n && /\s/.test(s[j])) j += 1;
      out.push(s.slice(i, j));
      i = j;
      continue;
    }
    if (ELLIPSIS_CHARS.includes(ch) || PUNCT_CHARS.includes(ch)) {
      let j = i + 1;
      while (j < n && (ELLIPSIS_CHARS.includes(s[j]) || PUNCT_CHARS.includes(s[j]))) j += 1;
      out.push(s.slice(i, j));
      i = j;
      continue;
    }
    if (isCjk(ch)) {
      let hit = "";
      for (const w of LEX_SORTED) {
        if (s.startsWith(w, i)) { hit = w; break; }
      }
      if (hit) {
        out.push(hit);
        i += hit.length;
        continue;
      }
      out.push(ch);
      i += 1;
      continue;
    }
    let j = i + 1;
    while (j < n && !/\s/.test(s[j]) && !ELLIPSIS_CHARS.includes(s[j]) && !PUNCT_CHARS.includes(s[j]) && !isCjk(s[j])) j += 1;
    out.push(s.slice(i, j));
    i = j;
  }
  return out;
}

function isEllipsisTok(tok) {
  return /^[.…⋯\s]+$/.test(tok) && /[.…⋯]/.test(tok);
}

function isPunctTok(tok) {
  if (!tok) return true;
  if (/^\s+$/.test(tok)) return true;
  return [...tok].every((c) => ELLIPSIS_CHARS.includes(c) || PUNCT_CHARS.includes(c) || /\s/.test(c));
}

function isContentTok(tok) {
  return !!tok && !isPunctTok(tok);
}

function isKeyTok(tok) {
  if (!isContentTok(tok) || isEllipsisTok(tok)) return false;
  if (FUNC_WORDS.has(tok) || (tok.length === 1 && PARTICLES.includes(tok))) return false;
  if (KEY_BITS.some((b) => tok.includes(b))) return true;
  return tok.length >= 2 && ![...tok].every((c) => PARTICLES.includes(c));
}

function hasBanned(text) {
  const t = String(text || "");
  return BANNED.some((b) => t.includes(b));
}

function pickMode(rng, level, side) {
  const L = LEVELS[level] || LEVELS.mid;
  let clear = L.clear, a = L.a, b = L.b, ab = L.ab;
  if (side === "man") {
    a += 0.08; b -= 0.04; ab -= 0.04;
  }
  const x = rng.next();
  if (x < clear) return "clear";
  if (x < clear + a) return "a";
  if (x < clear + a + b) return "b";
  return "ab";
}

function ellipsisMark(rng) {
  const mark = rng.pick(["……", "...", "...."]);
  const left = rng.chance(0.6) ? " " : "";
  const right = rng.chance(0.5) ? " " : "";
  return { mark, left, right };
}

function applyA(tokens, rng, L) {
  const decisions = tokens.map((tok) => ({ tok, keep: tok }));
  let firstContent = -1;
  for (let i = 0; i < tokens.length; i++) {
    if (isContentTok(tokens[i])) { firstContent = i; break; }
  }
  for (let i = 0; i < tokens.length; i++) {
    const tok = tokens[i];
    if (!isContentTok(tok)) {
      decisions[i].keep = rng.chance(0.7) ? tok : "";
      continue;
    }
    const key = isKeyTok(tok);
    if (i === firstContent) {
      if (key && (tok.length <= 2 || rng.chance(L.keyKeep))) decisions[i].keep = tok;
      else decisions[i].keep = tok.slice(0, Math.max(1, rng.chance(0.45) && tok.length >= 2 ? 2 : 1));
      continue;
    }
    if (key) {
      if (rng.chance(L.keyKeep)) decisions[i].keep = tok;
      else if (tok.length >= 2 && rng.chance(0.7)) decisions[i].keep = tok.slice(0, tok.length >= 3 && rng.chance(0.5) ? 2 : 1);
      else decisions[i].keep = "";
    } else if (rng.chance(L.drop)) {
      decisions[i].keep = "";
    } else {
      decisions[i].keep = tok;
    }
  }

  const restore = (idx, prefixOk = true) => {
    const tok = tokens[idx];
    if (!isContentTok(tok)) return;
    if (prefixOk && tok.length >= 2 && isKeyTok(tok) && rng.chance(0.4)) {
      decisions[idx].keep = tok.slice(0, tok.length >= 3 ? 2 : 1);
    } else {
      decisions[idx].keep = tok;
    }
  };

  const fragmentsOf = () => decisions.filter((d) => isContentTok(d.keep)).map((d) => d.keep);
  let frags = fragmentsOf();
  if (frags.length < 2) {
    const keys = [];
    for (let i = 0; i < tokens.length; i++) {
      if (isKeyTok(tokens[i]) && !isContentTok(decisions[i].keep)) keys.push(i);
    }
    for (const i of keys) {
      if (fragmentsOf().length >= 2) break;
      restore(i, true);
    }
  }
  frags = fragmentsOf();
  if (frags.length < 2) {
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (fragmentsOf().length >= 2) break;
      if (isContentTok(tokens[i]) && !isContentTok(decisions[i].keep)) restore(i, true);
    }
  }
  frags = fragmentsOf();
  if (frags.length < 2 && firstContent >= 0) {
    const last = tokens.length - 1;
    let lastC = -1;
    for (let i = tokens.length - 1; i >= 0; i--) {
      if (isContentTok(tokens[i])) { lastC = i; break; }
    }
    if (lastC > firstContent) {
      decisions[firstContent].keep = decisions[firstContent].keep || tokens[firstContent].slice(0, 1);
      decisions[lastC].keep = tokens[lastC].length >= 2 ? tokens[lastC].slice(0, 2) : tokens[lastC];
    }
  }
  frags = fragmentsOf();

  const parts = [];
  let pendingDrop = false;
  const pushEllipsis = () => {
    const e = ellipsisMark(rng);
    const prev = parts.length ? parts[parts.length - 1] : "";
    const chunk = `${prev && e.left ? e.left : ""}${e.mark}${e.right}`;
    parts.push(chunk);
  };
  for (const d of decisions) {
    if (!d.keep) {
      if (isContentTok(d.tok) || isEllipsisTok(d.tok)) pendingDrop = true;
      continue;
    }
    if (pendingDrop && isContentTok(d.keep)) {
      pushEllipsis();
      pendingDrop = false;
    }
    if (/^\s+$/.test(d.keep) && pendingDrop) continue;
    parts.push(d.keep);
  }
  if (pendingDrop && parts.some((x) => isContentTok(x))) pushEllipsis();
  const text = parts.join("").replace(/[ \t]+/g, " ").trim();
  return { text, fragments: fragmentsOf() };
}

function applyB(text, rng, L, side) {
  const tokens = tokenizeHeard(text);
  if (!tokens.length) return text;
  const moans = side === "man" ? MAN_MOANS : WIFE_MOANS;
  const tails = side === "man" ? MAN_TAILS : WIFE_TAILS;
  const gapP = L.moanGap * (side === "man" ? 0.55 : 1);
  const breakP = L.moanBreak * (side === "man" ? 0.4 : 1);
  const tailP = L.moanTail * (side === "man" ? 0.5 : 1);
  let used = 0;
  const out = [];
  const maybeMoan = () => {
    if (used >= L.moanMax || !rng.chance(gapP)) return;
    out.push(rng.chance(0.5) ? ` ${rng.pick(moans)} ` : rng.pick(moans));
    used += 1;
  };
  let seenContent = false;
  for (const tok of tokens) {
    if (isContentTok(tok) && !isEllipsisTok(tok) && tok.length >= 2 && used < L.moanMax && rng.chance(breakP)) {
      if (seenContent) maybeMoan();
      const cut = tok.length >= 3 && rng.chance(0.4) ? 2 : 1;
      out.push(tok.slice(0, cut));
      out.push(rng.chance(0.5) ? ` ${rng.pick(moans)} ` : rng.pick(moans));
      used += 1;
      out.push(tok.slice(cut));
      seenContent = true;
      continue;
    }
    if (isContentTok(tok) && seenContent) maybeMoan();
    out.push(tok);
    if (isContentTok(tok)) seenContent = true;
  }
  if (used < L.moanMax && rng.chance(tailP)) {
    out.push(rng.chance(0.6) ? ` ${rng.pick(tails)}` : rng.pick(tails));
  }
  return out.join("").replace(/[ \t]+/g, " ").trim();
}

export function hearLine(text, opts = {}) {
  const original = String(text ?? "");
  const side = String(opts.side || "wife").toLowerCase();
  const enabled = opts.enabled !== false;
  const level = normalizeMuffleLevel(opts.level);
  const seed = Number(opts.seed);
  const forced = String(opts.mode || "").trim().toLowerCase();
  if (!enabled || side === "narration" || side === "nar" || side === "旁白") {
    return { text: original, mode: "off", fragments: isContentTok(original) ? [original] : [], original };
  }
  const compact = original.replace(/\s+/g, "");
  if (!compact || compact === "—" || compact === "-" || compact === "–" || original.length < 2) {
    return { text: original, mode: "clear", fragments: compact ? [original] : [], original };
  }
  const rng = makeRng(fnv1a(`${Number.isFinite(seed) ? Math.floor(seed) : 0}|${side}|${original}|${level}|${forced}`));
  const L = LEVELS[level] || LEVELS.mid;
  let mode = forced;
  if (!mode || !["a", "b", "ab", "clear"].includes(mode)) mode = pickMode(rng, level, side);
  let out = original;
  let fragments = [];
  if (mode === "clear") {
    fragments = tokenizeHeard(original).filter(isContentTok);
    out = original;
  } else if (mode === "a") {
    const r = applyA(tokenizeHeard(original), rng, L);
    out = r.text || original;
    fragments = r.fragments;
  } else if (mode === "b") {
    out = applyB(original, rng, L, side) || original;
    fragments = tokenizeHeard(out).filter((t) => isContentTok(t) && !isEllipsisTok(t) && !WIFE_MOANS.includes(t) && !MAN_MOANS.includes(t) && !WIFE_TAILS.includes(t) && !MAN_TAILS.includes(t));
  } else {
    const r = applyA(tokenizeHeard(original), rng, L);
    out = applyB(r.text || original, rng, L, side) || r.text || original;
    fragments = r.fragments;
  }
  out = String(out || "").replace(/[ \t]+/g, " ").trim() || original;
  if (hasBanned(out) && !hasBanned(original)) out = original;
  if (!out) out = original;
  if ((mode === "a" || mode === "ab") && fragments.length < 2 && original.replace(/\s+/g, "").length >= 3) {
    // 保底：首字 + 最後兩個字
    const chars = [...original.replace(/\s+/g, "")];
    out = `${chars[0]}……${chars.slice(-2).join("")}`;
    fragments = [chars[0], chars.slice(-2).join("")];
  }
  return { text: out, mode, fragments, original };
}

export function hearThroughDoor(text, opts = {}) {
  return hearLine(text, opts).text;
}

export function hearDialog(row, opts = {}) {
  const narration = String(row?.narration || "");
  const man = String(row?.man || "");
  const wife = String(row?.wife || "");
  const common = {
    enabled: opts.enabled !== false,
    level: opts.level,
    seed: opts.seed,
  };
  return {
    narration,
    man: hearThroughDoor(man, { ...common, side: "man", mode: opts.manMode }),
    wife: hearThroughDoor(wife, { ...common, side: "wife", mode: opts.wifeMode }),
    man_orig: man,
    wife_orig: wife,
    narration_orig: narration,
  };
}

export { LEVELS, WIFE_MOANS, MAN_MOANS };
