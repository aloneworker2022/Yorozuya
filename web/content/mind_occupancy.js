/**
 * 腦袋佔有度（mind occupancy）0–100：她想說的那句（LLM 回覆）保留，
 * 再依佔有度把句子「吃掉」多少、用呻吟塞進去。純函式（rng 可注入），房間聊天／脫衣／肏 共用。
 *
 * 來源（各自一種呻吟味道）：spasm 痙攣、overstim 痙攣中還被弄、climax 高潮、stun 失神、
 * nipple 乳頭腫、clit 陰蒂腫、nipple_ring 乳環（掛鉤，尚無道具）、vibe／penis／dildo／cucumber／fingers 陰道塞著、
 * anal 後穴塞著、semen_out 子宮精液流出（一次性事件）、hunger 性飢渴很高（hunger.js，朋友起 6～14，2026-10-09）。
 *
 * 疊加：最大的來源全算，其餘依「剩下的空間」打折加上：score = max + Σ其他 × (100 − max)/100。
 *   例：跳蛋 45 ＋ 乳頭腫 15 → 45 + 15×0.55 ≈ 53。
 *
 * 分段：<10 不動；10–34 light 整句＋偶爾一聲；35–64 split 切成幾段塞呻吟；
 *       65–94 eaten 只剩關鍵字、大部分是呻吟；≥95 mute 講不出話。
 */

export const OCC_BANDS = { light: 10, split: 35, eaten: 65, mute: 95 };

/** 可調：各來源基礎分（stun_speech 依身體狀態取用）。 */
export const OCC_PTS = {
  spasm: 78,
  spasmTouched: 84,
  overstim: 92,
  climaxNow: 97,
  climaxTeased: 80,
  climaxTeaseStep: 3,
  climaxTeasedMax: 92,
  nipple: [0, 10, 18, 25],
  clit: [0, 10, 18, 25],
  nippleRing: 12,
  nippleRingRub: 8,
  vibe: 45,
  penis: 60,
  dildo: 42,
  cucumber: 38,
  fingers: 32,
  semenOut: 35,
  semenOutFade: 15,
};

/** 各來源的呻吟（連叫型為底；其他語氣用 voiceize 轉）。 */
const SOURCE_MOANS = {
  spasm: ["呃厄厄", "啊啊啊啊", "喔喔", "喔喔喔", "阿阿", "呃厄", "啊啊啊", "呃呃厄厄", "阿阿阿", "誒誒"],
  overstim: ["呃厄厄厄", "啊啊", "喔喔喔", "阿阿阿阿", "喔喔", "呃", "呃厄厄厄厄", "咿咿咿", "啊啊啊啊啊", "喔喔喔喔"],
  climax: ["啊啊啊啊——", "喔喔喔", "呃厄厄", "阿阿阿", "咿咿咿——", "啊啊——", "喔喔喔喔——", "啊啊啊"],
  stun: ["啊啊", "嗯嗯", "啊啊啊", "嗯", "哈啊", "啊…啊", "嗯嗯嗯", "啊"],
  nipple: ["嗯", "嗯", "唔", "嗯嗯"],
  clit: ["咿", "咿", "嗯咿", "咿！"],
  nipple_ring: ["嗯♡", "嗯♡", "咿♡", "唔♡"],
  vibe: ["嗯、嗯", "嗯嗯", "嗯、嗯、嗯", "啊！", "嗯、嗯"],
  penis: ["啊", "嗯嗯", "啊啊", "哈啊", "嗯啊", "啊"],
  dildo: ["嗯", "啊…", "嗯嗯", "唔嗯"],
  cucumber: ["嗯", "咿…", "嗯嗯", "唔"],
  fingers: ["嗯", "啊", "嗯嗯", "唔嗯"],
  anal: ["唔", "嗯", "咿"],
  semen_out: ["啊～", "喔～", "呀～"],
  hunger: ["哈…", "嗯…", "唔…", "嗯"],
};

/** 精液流出：一次性驚呼（整段塞一次）。 */
const SEMEN_OUT_CRIES = [
  "啊～…流、流出來了…喔～",
  "呀～…有、有東西流出來…喔～",
  "啊～…腿、腿上…熱熱的…",
  "喔～…流下來了…啊～",
];
const SEMEN_OUT_FADE = ["啊～", "還、還在流…", "喔～", "嗯～"];

/** 跳蛋：字講到一半突然被震斷（「我生、啊！…氣了」）。 */
const SUDDEN = { vibe: ["啊！", "咿！"], penis: ["啊！"] };
/** 被打斷的機率（跳蛋最常；陰莖偶爾）。 */
const SUDDEN_P = { vibe: 0.75, penis: 0.25 };

const STUTTER = ["誒呢", "呃", "欸"];

export const OCC_VOICES = ["scream", "refuse", "gasp", "beggy", "blankish"];

function clampN(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}

export function makeRng(seed = 1) {
  let a = (Number(seed) >>> 0) || 1;
  return function mulberry32() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pickR(rng, arr) {
  if (!arr || !arr.length) return "";
  return arr[Math.floor(rng() * arr.length) % arr.length];
}

/** 來源 → { score, sources[{id,pts}], top, band, cap }。cap 例：自己脫衣回覆壓 30。 */
export function combineOccupancy(list, opts = {}) {
  const sources = (list || [])
    .filter((s) => s && s.id && Number(s.pts) > 0)
    .map((s) => ({ id: String(s.id), pts: Math.round(clampN(s.pts, 0, 100)) }))
    .sort((a, b) => b.pts - a.pts);
  let score = 0;
  if (sources.length) {
    const max = sources[0].pts;
    const rest = sources.slice(1).reduce((n, s) => n + s.pts, 0);
    score = max + rest * ((100 - max) / 100);
  }
  score = Math.round(clampN(score, 0, 100));
  const cap = opts.cap != null ? Math.round(clampN(opts.cap, 0, 100)) : null;
  const raw = score;
  if (cap != null) score = Math.min(score, cap);
  return { score, raw, cap, sources, top: sources[0]?.id || "", band: occupancyBand(score) };
}

export function occupancyBand(score) {
  const s = Number(score) || 0;
  if (s >= OCC_BANDS.mute) return "mute";
  if (s >= OCC_BANDS.eaten) return "eaten";
  if (s >= OCC_BANDS.split) return "split";
  if (s >= OCC_BANDS.light) return "light";
  return "none";
}

/** 依語氣把一聲呻吟轉味道。 */
function voiceize(bit, voice, rng, heavy) {
  let s = String(bit || "");
  if (!s) return s;
  if (voice === "gasp") {
    // 短喘：疊字縮短、夾哈
    s = s.replace(/(.)\1{2,}/g, "$1$1").replace(/——/g, "");
    if (rng() < 0.35) s = rng() < 0.5 ? `哈…${s}` : "哈啊";
  } else if (voice === "blankish") {
    // 失語含糊：最多兩字、不帶驚嘆
    s = s.replace(/[！!♡～—…、]/g, "");
    s = Array.from(s).slice(0, rng() < 0.5 ? 1 : 2).join("") || "嗯";
  } else if (voice === "beggy") {
    if (!/♡$/.test(s) && rng() < (heavy ? 0.4 : 0.3)) s = `${s.replace(/[！!]$/, "")}♡`;
  } else if (voice === "refuse") {
    if (heavy && rng() < 0.2) s = rng() < 0.5 ? "不…" : "停…";
  }
  return s;
}

/** 依來源權重挑一個來源 id。 */
function pickSource(rng, sources) {
  const pool = sources.filter((s) => SOURCE_MOANS[s.id] && s.id !== "semen_out");
  if (!pool.length) return "stun";
  const total = pool.reduce((n, s) => n + s.pts, 0);
  let r = rng() * total;
  for (const s of pool) {
    r -= s.pts;
    if (r <= 0) return s.id;
  }
  return pool[0].id;
}

function moanOf(rng, occ, voice, heavy) {
  const id = pickSource(rng, occ.sources || []);
  return voiceize(pickR(rng, SOURCE_MOANS[id] || SOURCE_MOANS.stun), voice, rng, heavy);
}

const MOAN_ONLY_RE = /^[\s嗯啊唔哈咿呀喔哦噢呃厄阿誒欸痾歐♡～~…\.。、，,！!？?—-]+$/;
const DICT2 = new Set([
  "不要", "不行", "這樣", "那樣", "生氣", "喜歡", "討厭", "什麼", "怎麼", "可以", "不是", "沒有",
  "知道", "真的", "還要", "舒服", "現在", "今天", "這裡", "那裡", "裡面", "出來", "進來", "已經",
  "一直", "一點", "一下", "等等", "停下", "慢點", "快點", "好爽", "討厭", "壞蛋", "笨蛋", "變態",
  "看著", "不准", "不許", "別人", "東西", "衣服", "身體", "感覺", "為什", "麼樣", "所以", "因為",
  "但是", "可是", "我們", "你們", "他們", "她們", "自己", "這個", "那個", "時候", "地方",
]);
const SINGLE = new Set(Array.from("你我他她它妳了的嗎呢吧啦呀啊喔哦嘛耶欸哼好別停去又再就也都很太才"));
const KEY_WORDS = /^(不要|不行|停下?|還要|不准|不許|別|你|妳|生氣|討厭|喜歡|舒服|慢點|等等|好爽)$/;
const LOW_WORDS = /^(了|的|嗎|呢|吧|啦|呀|啊|喔|哦|嘛|耶|欸|也|都|就|很|才)$/;

function cleanIntended(text, occScore) {
  let s = String(text || "")
    .replace(/[（(][^）)]*[）)]/g, "")
    .replace(/[「」『』"“”]/g, "")
    .replace(/\s+/g, "")
    .trim();
  if (occScore >= OCC_BANDS.split) {
    // 她自己寫的呻吟段落拿掉，改由佔有度配
    const parts = s.split(/(?<=[，,。！？!?…、])/);
    const kept = parts.filter((p) => !MOAN_ONLY_RE.test(p));
    if (kept.length) s = kept.join("");
  }
  return s;
}

/** 句子 → 子句 → 詞（簡單斷詞：常用二字詞／單字代詞語氣詞／其餘兩字一組）。 */
export function segmentWords(text) {
  const clauses = String(text || "")
    .split(/[，,。！？!?…、；;：:\n～~]+/)
    .map((c) => c.trim())
    .filter(Boolean);
  return clauses.map((c) => {
    const chars = Array.from(c);
    const out = [];
    let i = 0;
    while (i < chars.length) {
      const two = chars.slice(i, i + 2).join("");
      if (two.length === 2 && DICT2.has(two)) { out.push(two); i += 2; continue; }
      if (SINGLE.has(chars[i]) || i + 1 >= chars.length || SINGLE.has(chars[i + 1])) { out.push(chars[i]); i += 1; continue; }
      out.push(two);
      i += 2;
    }
    return out;
  });
}

function tidy(s, voice) {
  let out = String(s || "")
    .replace(/…{2,}/g, "…")
    .replace(/\.{3,}/g, "…")
    .replace(/…([。！？])/g, "…")
    .replace(/([。！？])…/g, "$1")
    .replace(/([！？!?♡])。/g, "$1")
    .replace(/^[…、，。]+/, "");
  if (voice === "blankish") out = out.replace(/…/g, "……");
  return out;
}

function endPunct(text) {
  const m = String(text || "").match(/[。！？!?…]$/);
  return m ? m[0] : "。";
}

/**
 * 主函式：把她想說的話依佔有度改寫。
 * occ：combineOccupancy 結果；opts.voice、opts.rng、opts.semenOutEvent（"fresh"｜"fade"｜""）
 */
export function applyOccupancy(text, occ, opts = {}) {
  const rng = opts.rng || Math.random;
  const voice = OCC_VOICES.includes(opts.voice) ? opts.voice : "scream";
  const semenEv = opts.semenOutEvent || "";
  // 精液流出只塞一聲驚呼，不決定句子被吃多少：分段只看其他來源
  const body = (occ?.sources || []).filter((s) => s.id !== "semen_out");
  const bodyOcc = combineOccupancy(body, { cap: occ?.cap });
  const score = bodyOcc.score;
  const band = occupancyBand(score);
  occ = bodyOcc;
  const src = cleanIntended(text, score);
  if (band === "mute" || (!src && score >= OCC_BANDS.light)) return occupancyMoanLine(occ, { voice, rng });
  if (!src) return semenEv === "fresh" ? pickR(rng, SEMEN_OUT_CRIES) : "……";
  if (band === "none") {
    if (semenEv) return lightBand(src, occ, voice, rng, semenEv);
    return src;
  }
  if (band === "light") return lightBand(src, occ, voice, rng, semenEv);
  if (band === "split") return splitBand(src, occ, voice, rng, semenEv);
  return eatenBand(src, occ, voice, rng, semenEv);
}

function semenCry(rng, semenEv) {
  if (semenEv === "fresh") return pickR(rng, SEMEN_OUT_CRIES);
  if (semenEv === "fade") return pickR(rng, SEMEN_OUT_FADE);
  return "";
}

/** 10–34：整句保留；偶爾在子句間或句尾一聲。 */
function lightBand(src, occ, voice, rng, semenEv) {
  const score = occ.score;
  const clauses = src.split(/(?<=[，,。！？!?…])/).map((c) => c.trim()).filter(Boolean);
  const end = endPunct(src);
  const body = clauses.map((c) => c.replace(/[，,。！？!?…]+$/, ""));
  const cry = semenCry(rng, semenEv);
  // 非精液來源的分數（精液另外塞一次）
  const others = (occ.sources || []).filter((s) => s.id !== "semen_out");
  const pMoan = others.length ? clampN(score / 40, 0, 0.9) : 0;
  const slots = new Array(Math.max(0, body.length - 1)).fill("");
  let trail = "";
  if (rng() < pMoan) {
    const m = moanOf(rng, occ, voice, false);
    if (slots.length && rng() < 0.6) slots[Math.floor(rng() * slots.length)] = m;
    else trail = m;
  }
  if (score >= 28 && rng() < 0.4) trail = trail || moanOf(rng, occ, voice, false);
  if (cry) {
    if (slots.length) slots[Math.floor(rng() * slots.length)] = cry;
    else trail = trail ? `${cry}…${trail}` : cry;
  }
  let out = "";
  body.forEach((c, i) => {
    out += c;
    if (i < slots.length) out += slots[i] ? `…${slots[i]}…` : "，";
  });
  out += trail ? `…${trail}${end === "…" ? "…" : "。"}` : end;
  return tidy(out, voice);
}

function suddenOf(occ) {
  for (const s of occ.sources || []) if (SUDDEN[s.id]) return { bits: SUDDEN[s.id], p: SUDDEN_P[s.id] || 0.5 };
  return null;
}

/** 35–64：每個字都在，但切成幾段塞呻吟。 */
function splitBand(src, occ, voice, rng, semenEv) {
  const score = occ.score;
  const segs = segmentWords(src);
  const words = segs.flat();
  if (!words.length) return occupancyMoanLine(occ, { voice, rng });
  const clauseEnd = new Set();
  { let n = 0; for (const c of segs) { n += c.length; clauseEnd.add(n - 1); } }
  const pMoan = clampN((score - 28) / 70, 0.15, 0.55);
  const pBreak = 0.22;
  const sudden = suddenOf(occ);
  const minMoans = score >= 50 ? 2 : 1;
  const gaps = words.length - 1;
  const plan = new Array(Math.max(0, gaps)).fill("");
  for (let i = 0; i < gaps; i++) {
    const r = rng();
    if (r < pMoan) plan[i] = "moan";
    else if (r < pMoan + pBreak || clauseEnd.has(i)) plan[i] = "break";
  }
  let moans = plan.filter((p) => p === "moan").length;
  for (let guard = 0; moans < Math.min(minMoans, gaps) && guard < 20; guard++) {
    const i = Math.floor(rng() * gaps);
    if (plan[i] !== "moan") { plan[i] = "moan"; moans += 1; }
  }
  // 跳蛋等：某個兩字詞講到一半被震斷
  let suddenAt = -1;
  if (sudden && rng() < sudden.p) {
    // 優先打斷句子後半的普通詞（「我生、啊！…氣了」），不拆「不要」這類關鍵字
    let twos = words.map((w, i) => (Array.from(w).length >= 2 && !/^(不要|不行|還要|不准|不許)$/.test(w) ? i : -1)).filter((i) => i > 0);
    if (!twos.length) twos = words.map((w, i) => (Array.from(w).length >= 2 ? i : -1)).filter((i) => i > 0);
    if (twos.length) suddenAt = twos[Math.floor(rng() * twos.length)];
  }
  const cry = semenCry(rng, semenEv);
  const cryAt = cry ? Math.max(0, Math.min(gaps - 1, Math.floor(gaps / 2))) : -1;
  let out = "";
  words.forEach((w, i) => {
    if (i === suddenAt) {
      const ch = Array.from(w);
      out += `${ch[0]}、${pickR(rng, sudden.bits)}…${ch.slice(1).join("")}`;
      if (i < gaps && !plan[i]) plan[i] = "";
    } else out += w;
    if (i < gaps) {
      if (i === cryAt) out += `…${cry}…`;
      else if (plan[i] === "moan") out += `…${moanOf(rng, occ, voice, false)}…`;
      else if (plan[i] === "break") out += "…";
    }
  });
  if (score >= 50 && rng() < 0.45) out += `…${moanOf(rng, occ, voice, false)}`;
  out += "。";
  return tidy(out, voice);
}

/** 65–94：只剩幾個關鍵字，大部分是呻吟。 */
function eatenBand(src, occ, voice, rng, semenEv) {
  const score = occ.score;
  const words = segmentWords(src).flat();
  let keepFrac = clampN(0.8 - (score - 65) * 0.022, 0.08, 0.8);
  if (voice === "blankish") keepFrac *= 0.5;
  const ranked = words.map((w, i) => {
    let imp = 1;
    if (KEY_WORDS.test(w)) imp = /^(生氣|討厭|喜歡|舒服)$/.test(w) ? 1.5 : 2.2;
    else if (LOW_WORDS.test(w)) imp = 0.3;
    return { w, i, r: imp + rng() * 0.9 };
  });
  const nKeep = Math.max(1, Math.round(words.length * keepFrac));
  const keepIdx = new Set(ranked.slice().sort((a, b) => b.r - a.r).slice(0, nKeep).map((x) => x.i));
  let kept = words.filter((_, i) => keepIdx.has(i));
  // 語氣：碎拒崩壞型把否定疊起來；黏求型夾「還、還要」
  if (voice === "refuse") kept = kept.map((w) => (/^不要$/.test(w) && rng() < 0.6 ? "不要不要" : w));
  if (voice === "beggy" && rng() < 0.6) kept.splice(Math.min(kept.length, 1 + Math.floor(rng() * kept.length)), 0, "還、還要");
  const heavy = score >= 75;
  const pMoan = clampN(0.7 + (score - 65) * 0.012, 0.7, 1);
  const parts = [];
  if (heavy || rng() < 0.4) parts.push(moanOf(rng, occ, voice, true) + (heavy && rng() < 0.5 ? "。" : ""));
  if (voice === "refuse" && rng() < 0.5) parts.push("不");
  const cry = semenCry(rng, semenEv);
  kept.forEach((w, i) => {
    // 痙攣類：偶爾把剛講的那個字含糊重講一次（誒呢你）
    const garble = heavy && i > 0 && rng() < 0.18 && !/^還/.test(w) ? `${pickR(rng, STUTTER)}${kept[i - 1]}` : "";
    parts.push(w);
    if (garble) parts.push(garble);
    if (cry && i === Math.floor(kept.length / 2)) parts.push(cry);
    if (rng() < pMoan) parts.push(moanOf(rng, occ, voice, heavy));
  });
  if (voice === "refuse" && rng() < 0.5) parts.push("停");
  const lastIsMoan = parts.length && !kept.includes(parts[parts.length - 1]);
  if (!lastIsMoan) parts.push(moanOf(rng, occ, voice, heavy));
  if (score >= 88) {
    // 過感：更碎、更長
    parts.splice(1, 0, moanOf(rng, occ, voice, true));
    parts.push(moanOf(rng, occ, voice, true));
  }
  let out = parts.join("…").replace(/。…/g, "。");
  out += voice === "beggy" || score >= 70 ? (rng() < 0.5 ? "。" : "…") : "。";
  return tidy(out, voice);
}

/** ≥95（或沒有原句）：講不出話，一串呻吟。 */
export function occupancyMoanLine(occ, opts = {}) {
  const rng = opts.rng || Math.random;
  const voice = OCC_VOICES.includes(opts.voice) ? opts.voice : "scream";
  const o = occ && occ.sources && occ.sources.length ? occ : { score: 96, sources: [{ id: "spasm", pts: 96 }] };
  const n = 4 + Math.floor(rng() * 3);
  const parts = [];
  for (let i = 0; i < n; i++) {
    const m = moanOf(rng, o, voice, true);
    if (parts[parts.length - 1] !== m) parts.push(m);
  }
  // 痙攣／高潮的崩潰感：偶爾一個「去／不」碎字
  if ((o.score || 0) >= 95 && rng() < 0.5) {
    const word = voice === "refuse" ? "不" : voice === "beggy" ? "還、還要" : (o.top === "climax" ? "去" : "不");
    parts.splice(1 + Math.floor(rng() * (parts.length - 1)), 0, word);
  }
  return tidy(`${parts.join("…")}…`, voice);
}

/** 給 prompt：佔有度高時要 LLM 只寫「心裡想說的那句」，聲音由程式加。 */
export function occupancyPromptLine(occ) {
  const s = Number(occ?.score) || 0;
  if (s < OCC_BANDS.split) return "";
  return "【腦袋佔有度】只寫你心裡想說的那一句完整的話（一句、二十字內）。不要自己寫呻吟、喘息、嗯啊、斷句或省略號；聲音會另外配上。";
}

/** 除錯字串：「72（痙攣 78・乳頭 18）」 */
const SRC_ZH = {
  spasm: "痙攣", overstim: "過感", climax: "高潮", stun: "失神", nipple: "乳頭腫", clit: "陰蒂腫",
  nipple_ring: "乳環", vibe: "跳蛋", penis: "陰莖", dildo: "假陰莖", cucumber: "小黃瓜", fingers: "手指",
  anal: "後穴", semen_out: "精液流出", hunger: "飢渴",
};
export function occupancyLabel(occ) {
  if (!occ) return "—";
  const src = (occ.sources || []).map((s) => `${SRC_ZH[s.id] || s.id} ${s.pts}`).join("・");
  const cap = occ.cap != null && occ.raw > occ.cap ? `，壓到 ${occ.cap}` : "";
  return `${occ.score}${src ? `（${src}${cap}）` : ""}`;
}
