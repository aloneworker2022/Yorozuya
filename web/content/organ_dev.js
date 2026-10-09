/**
 * 器官開發度 organ development（2026-10-09 Al）：被玩得越多越敏感，乳頭／乳暈、陰唇會被玩到變色。
 *
 * 狀態存在 bodyState.organDev（跟著 bodyState 走房間存檔＋名冊回寫；手機為主）：
 *   { counts:{nipples,clit,vagina,labia,sex}, orgasms, color:{nipples,labia}, colorAt:{…}, sess:{start,last,hit{}} }
 *
 * 「一次」＝一場（使用者決定：每一場調戲或做愛算一次，不是每摸一下）：
 *   - 一場＝連續的親熱。離上一次碰她超過 SESSION_GAP_MS（30 分鐘）才算新的一場；
 *     所以關掉聊天馬上再開、同一段時間裡先調戲再做愛，都還是同一場，刷不了。
 *   - 這一場有碰到哪個器官，那個器官 +1（一場最多 +1）。做愛（陰莖插入：抽插場面或台詞插入／內射）另記 sex +1。
 * 變色（只會變深，不會變回來）：
 *   - 乳頭／乳暈：counts.nipples 每 NIPPLE_STEP（100）場一級：粉色 → 咖啡色 → 黑色。
 *   - 陰唇：counts.sex（被肏的場數）每 LABIA_STEP（20）場一級：粉色 → 咖啡色 → 黑色。
 *   - 新召喚的妹子一律從粉色開始（使用者 2026-10-09：抽到的深色乳暈也改粉；顏色只來自開發）。
 *     原本抽到的文字留在 look.devBase，look.areola／look.nipple／look.labia_color 改寫成「同大小／形狀＋目前顏色」的固定字串，
 *     生圖（server/sdtags.py AREOLA／NIPPLE／LABIA_COLOR 查表）和聊天人設都跟著走。
 * 敏感度（0–3，依場數門檻 SENS_STEPS）：
 *   - 被碰到那個器官時性奮多漲 +敏感度；
 *   - 乳頭腫／陰蒂腫的腦袋佔有度 ×(1 + 0.2×敏感度)；
 *   - 做愛時陰道敏感度每級 12% 機率多 +1 激情（比較容易高潮）。
 * 純函式模組：不碰 DOM（organDevOn() 只讀 <html data-organ-dev="1">）。
 */

export const ORGANS = ["nipples", "clit", "vagina", "labia"];
export const ORGAN_ZH = { nipples: "乳頭／乳暈", clit: "陰蒂", vagina: "陰道", labia: "陰唇", sex: "被肏" };
export const SESSION_GAP_MS = 30 * 60e3;
export const NIPPLE_STEP = 100;
export const LABIA_STEP = 20;
export const COLOR_MAX = 2;
export const COLOR_ZH = ["粉色", "咖啡色", "黑色"];
/** 敏感度 1／2／3 級的場數門檻。陰唇看 max(labia, sex)。 */
export const SENS_STEPS = { nipples: [30, 100, 200], clit: [10, 30, 60], vagina: [10, 30, 60], labia: [10, 30, 60] };
export const SENS_ZH = ["普通", "敏感", "很敏感", "一碰就受不了"];
export const OCC_MULT_PER_LEVEL = 0.2;
export const PASSION_CHANCE_PER_LEVEL = 0.12;

/** 快捷動作 hitId／BODY_HITS id → 這一場算到哪些器官。 */
export const PART_ORGANS = {
  nipple: ["nipples"],
  clit: ["clit"],
  uterus: ["clit", "vagina"],
  labia: ["labia"],
  vagina: ["vagina", "labia"],
  vibe_in: ["vagina"],
  dildo_in: ["vagina"],
  cucumber_in: ["vagina"],
  penis_in: ["vagina", "labia", "sex"],
  creampie: ["vagina", "labia", "sex"],
};

// ------------------------------------------------------------ 外觀字串（必須跟 server/sdtags.py 查表對齊）
/** 乳暈：大小 × 顏色。第 0 欄儘量沿用 persona_pools 原本的字串（舊伺服器也查得到）。 */
export const AREOLA_TEXT = {
  small: ["小巧粉嫩的乳暈", "小巧、被玩成咖啡色的乳暈", "小巧、被玩到發黑的乳暈"],
  mid: ["圓潤櫻花粉、中等大小乳暈", "中等大小、被玩成咖啡色的乳暈", "中等大小、被玩到發黑的乳暈"],
  large: ["寬廣深粉、邊緣柔和的大乳暈", "偏大、被玩成咖啡色的乳暈", "偏大、被玩到發黑的乳暈"],
  huge: ["幾乎佔滿半邊乳房的粉色大乳暈", "幾乎佔滿半邊乳房的咖啡色大乳暈", "幾乎佔滿半邊乳房、發黑的大乳暈"],
  puffy: ["粉嫩微腫、看起來很敏感的乳暈", "咖啡色微腫、看起來很敏感的乳暈", "發黑微腫、看起來很敏感的乳暈"],
};
/** 乳頭：形狀 × 顏色。 */
export const NIPPLE_TEXT = {
  inverted: ["小巧內收、幾乎看不出形的乳頭", "小巧內收的咖啡色乳頭", "小巧內收、顏色發黑的乳頭"],
  small: ["粉嫩、微微凸起的乳頭", "咖啡色、微微凸起的乳頭", "發黑、微微凸起的乳頭"],
  erect: ["明顯挺立的粉嫩乳尖", "明顯挺立的咖啡色乳尖", "明顯挺立的發黑乳尖"],
  large: ["較大、粉嫩、看起來充血敏感的乳頭", "較大、咖啡色、看起來充血敏感的乳頭", "較大、發黑、看起來充血敏感的乳頭"],
  long: ["粗長、粉嫩、非常明顯的乳頭", "粗長、咖啡色、非常明顯的乳頭", "粗長、深色、非常明顯的乳頭"],
};
/** 陰唇顏色：persona_pools 原本就是三級，直接用。 */
export const LABIA_TEXT = ["粉嫩淺色的陰唇", "淺褐自然的陰唇", "深褐近黑的陰唇"];
/** 對應的英文 tag（給測試／除錯看；真正查表在 sdtags.py）。 */
export const AREOLA_COLOR_TAG = ["pink areolae", "brown areolae", "dark areolae"];
export const NIPPLE_COLOR_TAG = ["pink nipples", "brown nipples", "dark nipples"];
export const LABIA_COLOR_TAG = ["pink labia", "brown labia", "dark labia"];

export function areolaSize(text) {
  const s = String(text || "");
  if (/腫/.test(s)) return "puffy";
  if (/佔滿|誇張|巨/.test(s)) return "huge";
  if (/中等大小|自然|圓潤/.test(s)) return "mid";
  if (/小/.test(s)) return "small";
  if (/大|寬廣|近乎黑/.test(s)) return "large";
  return "mid";
}
export function nippleShape(text) {
  const s = String(text || "");
  if (/內收|凹/.test(s)) return "inverted";
  if (/粗長|長/.test(s)) return "long";
  if (/較大|充血/.test(s)) return "large";
  if (/挺立/.test(s)) return "erect";
  return "small";
}

const clampLv = (n) => Math.max(0, Math.min(COLOR_MAX, Math.floor(Number(n) || 0)));
const nonNeg = (n) => Math.max(0, Math.floor(Number(n) || 0));

/**
 * 依顏色等級改寫外觀（look 直接改）。第一次會把原本抽到的字串存進 look.devBase（之後一律依 devBase 的大小／形狀）。
 * 空的欄位（SFW 沒抽到）保持空的。
 */
export function applyDevLook(look, { nipples = 0, labia = 0 } = {}) {
  if (!look || typeof look !== "object") return look;
  if (!look.devBase || typeof look.devBase !== "object") {
    look.devBase = { areola: look.areola || "", nipple: look.nipple || "", labia_color: look.labia_color || "" };
  }
  const base = look.devBase;
  const n = clampLv(nipples), l = clampLv(labia);
  if (base.areola) look.areola = AREOLA_TEXT[areolaSize(base.areola)][n];
  if (base.nipple) look.nipple = NIPPLE_TEXT[nippleShape(base.nipple)][n];
  if (base.labia_color) look.labia_color = LABIA_TEXT[l];
  return look;
}

// ------------------------------------------------------------ 狀態
/** <html data-organ-dev="1">（或 globalThis.YORO_ORGAN_DEV）。 */
export function organDevOn() {
  try {
    if (typeof globalThis.YORO_ORGAN_DEV === "boolean") return globalThis.YORO_ORGAN_DEV;
    return globalThis.document?.documentElement?.dataset?.organDev === "1";
  } catch {
    return false;
  }
}

function body(who) {
  return who && typeof who === "object" && who.bodyState && typeof who.bodyState === "object" ? who.bodyState : null;
}

/** 依場數算出來的顏色（不看歷史最大值）。 */
export function colorFromCounts(counts = {}) {
  return {
    nipples: clampLv(nonNeg(counts.nipples) / NIPPLE_STEP),
    labia: clampLv(nonNeg(counts.sex) / LABIA_STEP),
  };
}

/** 補齊 bodyState.organDev，並把外觀對齊目前顏色（舊存檔＝粉色起算）。 */
export function ensureOrganDev(who) {
  const b = body(who);
  if (!b) return null;
  const d = b.organDev && typeof b.organDev === "object" ? b.organDev : (b.organDev = {});
  const c = d.counts && typeof d.counts === "object" ? d.counts : {};
  d.counts = { nipples: nonNeg(c.nipples), clit: nonNeg(c.clit), vagina: nonNeg(c.vagina), labia: nonNeg(c.labia), sex: nonNeg(c.sex) };
  d.orgasms = nonNeg(d.orgasms);
  const calc = colorFromCounts(d.counts);
  const col = d.color && typeof d.color === "object" ? d.color : {};
  // 只會變深：存的等級和場數算出來的取大
  d.color = { nipples: Math.max(clampLv(col.nipples), calc.nipples), labia: Math.max(clampLv(col.labia), calc.labia) };
  const at = d.colorAt && typeof d.colorAt === "object" ? d.colorAt : {};
  d.colorAt = { nipples: Number(at.nipples) || 0, labia: Number(at.labia) || 0 };
  const s = d.sess;
  d.sess = s && typeof s === "object" && Number(s.last) > 0
    ? { start: Number(s.start) || Number(s.last), last: Number(s.last), hit: s.hit && typeof s.hit === "object" ? { ...s.hit } : {} }
    : null;
  if (who.look && typeof who.look === "object") applyDevLook(who.look, d.color);
  return d;
}

/** 重算顏色（只會變深）；有變就改外觀。回傳升級清單 [{organ,from,to}]。 */
function recolor(who, d, now) {
  const calc = colorFromCounts(d.counts);
  const ups = [];
  for (const k of ["nipples", "labia"]) {
    if (calc[k] > d.color[k]) {
      ups.push({ organ: k, from: d.color[k], to: calc[k] });
      d.color[k] = calc[k];
      d.colorAt[k] = now;
    }
  }
  if (ups.length && who.look) applyDevLook(who.look, d.color);
  return ups;
}

/** 這一場現在還算不算同一場（不寫入）。 */
export function sessionLive(who, now = Date.now()) {
  const s = body(who)?.organDev?.sess;
  return !!s && now - (Number(s.last) || 0) <= SESSION_GAP_MS;
}

/**
 * 碰到了這些器官（可含 "sex"）。同一場每個器官最多 +1。
 * 回傳 { counted:[…], levelUps:[…], newSession }。
 */
export function noteTouch(who, organs, now = Date.now()) {
  const d = ensureOrganDev(who);
  if (!d) return null;
  const list = [...new Set((organs || []).filter((k) => k === "sex" || ORGANS.includes(k)))];
  if (!list.length) return { counted: [], levelUps: [], newSession: false };
  let newSession = false;
  if (!d.sess || now - d.sess.last > SESSION_GAP_MS || now < d.sess.start) {
    d.sess = { start: now, last: now, hit: {} };
    newSession = true;
  }
  d.sess.last = Math.max(d.sess.last, now);
  const counted = [];
  for (const k of list) {
    if (d.sess.hit[k]) continue;
    d.sess.hit[k] = true;
    d.counts[k] += 1;
    counted.push(k);
  }
  return { counted, levelUps: recolor(who, d, now), newSession };
}

/** 快捷動作 hitId／身體命中 id → noteTouch。 */
export function noteTouchPart(who, partId, now = Date.now()) {
  const organs = PART_ORGANS[String(partId || "")];
  return organs ? noteTouch(who, organs, now) : null;
}

/** 她高潮一次（做愛或調戲都算）。 */
export function noteOrgasm(who) {
  const d = ensureOrganDev(who);
  if (!d) return 0;
  d.orgasms += 1;
  return d.orgasms;
}

/** 除錯：直接加場數（organ 可為 sex）。 */
export function addSessions(who, organ, n = 1, now = Date.now()) {
  const d = ensureOrganDev(who);
  if (!d || !(organ in d.counts)) return null;
  d.counts[organ] = nonNeg(d.counts[organ] + Number(n));
  if (organ === "sex") d.counts.labia = Math.max(d.counts.labia, d.counts.sex);
  return recolor(who, d, now);
}

/** 除錯：全部歸零（唯一會讓顏色變回粉色的路，只給 test_room 用）。 */
export function resetOrganDev(who) {
  const b = body(who);
  if (!b) return null;
  b.organDev = { counts: {}, color: { nipples: 0, labia: 0 } };
  return ensureOrganDev(who);
}

// ------------------------------------------------------------ 敏感度
export function sensLevel(who, organ) {
  const d = body(who)?.organDev;
  if (!d?.counts) return 0;
  const n = organ === "labia" ? Math.max(nonNeg(d.counts.labia), nonNeg(d.counts.sex)) : nonNeg(d.counts[organ]);
  const steps = SENS_STEPS[organ];
  if (!steps) return 0;
  return steps.filter((x) => n >= x).length;
}

/** 這一下碰到的部位 → 性奮多漲多少（0–3）。 */
export function devArousalBonus(who, partId) {
  const organs = (PART_ORGANS[String(partId || "")] || []).filter((k) => k !== "sex");
  return organs.reduce((m, k) => Math.max(m, sensLevel(who, k)), 0);
}

/** 佔有度倍率：source = nipple | clit。 */
export function devOccupancyMult(who, source) {
  const organ = source === "nipple" ? "nipples" : source === "clit" ? "clit" : "";
  return organ ? 1 + OCC_MULT_PER_LEVEL * sensLevel(who, organ) : 1;
}

/** 做愛時每一下多 +1 激情的機率。 */
export function devPassionChance(who) {
  return PASSION_CHANCE_PER_LEVEL * sensLevel(who, "vagina");
}

// ------------------------------------------------------------ prompt（絕不寫數字）
const RECENT_MS = 24 * 3600e3;
const STAGE_ORDER = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];
const stageIdx = (k) => Math.max(0, STAGE_ORDER.indexOf(String(k || "stranger")));

export function organDevPromptLines(who, { stageKey = who?.stage, now = Date.now() } = {}) {
  const d = body(who)?.organDev;
  if (!d?.counts) return [];
  const out = [];
  const wife = stageIdx(stageKey) >= 7;
  const close = stageIdx(stageKey) >= 4;
  const tone = wife
    ? "你知道是被老公開發成這樣的，會害羞，但也有點認命、甚至帶點撒嬌的驕傲"
    : close
      ? "你知道是被他玩成這樣的，很害羞，被看到或被提到會臉紅、想遮"
      : "你自己知道，覺得很丟臉，絕對不主動提；被看到會慌張地遮住";
  const nc = clampLv(d.color?.nipples), lc = clampLv(d.color?.labia);
  if (nc > 0) {
    const fresh = now - (Number(d.colorAt?.nipples) || 0) < RECENT_MS;
    out.push(nc === 1
      ? `你的乳頭和乳暈原本是粉嫩的，被他玩了太多次，已經變成咖啡色了${fresh ? "（最近才發現的）" : ""}。${tone}。`
      : `你的乳頭和乳暈被他玩到發黑了，已經回不去原本的粉色${fresh ? "（最近才變成這樣的）" : ""}。${tone}。`);
  }
  if (lc > 0) {
    const fresh = now - (Number(d.colorAt?.labia) || 0) < RECENT_MS;
    out.push(lc === 1
      ? `你的陰唇原本是粉嫩的，被他肏了太多次，已經變成咖啡色了${fresh ? "（最近才發現的）" : ""}。${tone}。`
      : `你的陰唇被他肏到發黑了，再也不是粉色${fresh ? "（最近才變成這樣的）" : ""}。${tone}。`);
  }
  const sens = [];
  const sn = sensLevel(who, "nipples"), sc = sensLevel(who, "clit"), sv = sensLevel(who, "vagina");
  if (sn) sens.push(sn >= 3 ? "乳頭一碰就受不了" : sn === 2 ? "乳頭很敏感" : "乳頭比以前敏感");
  if (sc) sens.push(sc >= 3 ? "陰蒂一碰腰就軟掉" : sc === 2 ? "陰蒂很敏感" : "陰蒂比以前敏感");
  if (sv) sens.push(sv >= 3 ? "裡面被開發到一插進來就快去了" : sv === 2 ? "裡面很容易就有感覺" : "裡面比以前容易有感覺");
  if (sens.length) out.push(`你的身體被他開發過了：${sens.join("、")}。被碰到這些地方時反應要比平常大、更難忍住聲音。`);
  const o = nonNeg(d.orgasms);
  if (o >= 50) out.push("你已經被他弄到高潮過數不清的次數，身體記得他的手法。");
  else if (o >= 10) out.push("你已經被他弄到高潮過很多次了。");
  if (out.length) out.unshift("【身體被開發的痕跡】（不要說出任何數字、次數或「等級」這種字眼）");
  return out;
}

/** test_room 除錯一行。 */
export function organDevLabel(who, now = Date.now()) {
  const d = body(who)?.organDev;
  if (!d?.counts) return "—";
  const c = d.counts;
  const sess = sessionLive(who, now) ? `・這一場：${Object.keys(d.sess.hit).map((k) => ORGAN_ZH[k] || k).join("、") || "—"}（${Math.round((now - d.sess.start) / 60e3)} 分）` : "";
  return `乳頭 ${c.nipples} 場（${COLOR_ZH[d.color.nipples]}・${SENS_ZH[sensLevel(who, "nipples")]}）`
    + `｜陰蒂 ${c.clit}（${SENS_ZH[sensLevel(who, "clit")]}）`
    + `｜陰道 ${c.vagina}（${SENS_ZH[sensLevel(who, "vagina")]}）`
    + `｜陰唇 ${c.labia}・被肏 ${c.sex}（${COLOR_ZH[d.color.labia]}・${SENS_ZH[sensLevel(who, "labia")]}）`
    + `｜高潮 ${d.orgasms} 次${sess}`;
}
