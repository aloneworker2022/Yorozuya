// ============================================================
// GirlGen — 內容模組銜接口③:魅魔人物生成器(原型骨幹+評級抽卡)
// 廠商替換點:池子在 persona_pools.json(/edit_person 可編輯),
// 本檔只是抽取邏輯。nsfw 標記的項目只在分級 NSFW 時參與抽取。
// 每一軸獨立依該軸稀有度抽;名冊稀有度=全部計分軸純平均。
// 梯子只有 N / R / S / SS / SSR(舊池子的 SR、普通/史詩 會在讀取時翻過來)。
// ============================================================

export let POOLS = null;

export const GRADE_ORDER = ["N", "R", "S", "SS", "SSR"];
const GRADE_WEIGHT = { N: 100, R: 55, S: 12, SS: 5, SSR: 2 };
const LUCK_CURVE = 2.8;
const UPGRADE_P = 0.05;           // 總評算出後 5% 再升一階
const SSR_PROMOTE_AT_MAX = 0.08;  // 獻滿 6 人(luck 92)時,SS 再升 SSR 的額外機率 → 總 SSR ≈ 5%
const GRADE_VALUE = { N: 0, R: 1, S: 2, SS: 3, SSR: 4 };
// 舊池子 / 舊存檔相容
const LEGACY_GRADE = {
  SR: "SS", sr: "SS",
  "普通": "N", "稀有": "R", "史詩": "S", "傳說": "SSR",
};
export const RARITY_ORDER = GRADE_ORDER;
export const RARITY_MARK = { N: "⚪", R: "🔵", S: "🟣", SS: "🟡", SSR: "🌟" };

function normGrade(g) {
  if (!g) return "N";
  if (GRADE_ORDER.includes(g)) return g;
  return LEGACY_GRADE[g] || "N";
}

export async function loadPools() {
  try {
    POOLS = await fetch("content/persona_pools.json?ts=" + Date.now()).then(r => r.ok ? r.json() : null);
  } catch { POOLS = null; }
  return POOLS;
}
export function setPools(p) { POOLS = p; }   // 測試/Node 注入用

const ri = (a, b) => a + Math.floor(Math.random() * (b - a + 1));
const pk = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, Math.round(v)));
const allow = (item, rating) => rating === "nsfw" || !item.nsfw;
// 未成年設定的職業:NSFW 抽卡一律排除(見 generateGirl 的 occPool)
const MINOR_OCC = new Set(["女高中生"]);

function pickPlain(pool, rating) {
  const av = (pool || []).filter(x => x != null && allow(typeof x === "string" ? {} : x, rating));
  if (!av.length) return null;
  return pk(av);
}

function pickN(arr, n) {
  const a = [...arr].sort(() => Math.random() - 0.5);
  return a.slice(0, Math.min(n, a.length));
}

// 個人喜好衣櫃的總套數。一次抽滿(她的品味是天生的,不是升級長出來的),
// 但玩家看得到幾套要看關係:WARDROBE_UNLOCK。
export const WARDROBE_SIZE = 6;
export const EROTIC_OUTFIT_SIZE = 3;
export const SLEEP_OUTFIT_SIZE = 2;
// 關係階段 → 解鎖幾套日常衣櫃。陌生時你只見過她工作時的樣子。
export const WARDROBE_UNLOCK = { stranger: 0, friend: 1, girlfriend: 3, wife: 6 };
// 女友多 1 套色情裝；妻子 3 套色情裝 + 2 套睡衣
export const EROTIC_UNLOCK = { stranger: 0, friend: 0, girlfriend: 1, wife: 3 };
export const SLEEP_UNLOCK = { stranger: 0, friend: 0, girlfriend: 0, wife: 2 };

function weightedPick(items, weights) {
  let sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

function asGraded(item) {
  if (item == null) return null;
  if (typeof item === "string") return { text: item, grade: "N" };
  return item;
}

function itemGrade(item) {
  if (!item) return "N";
  if (item.grade) return normGrade(item.grade);
  if (item.rarity) return normGrade(item.rarity);
  return "N";
}

// 評級加權抽:luck(0~100) 把機率往高階傾斜(指數型,高 luck 時高階明顯變常見)
function rollGraded(pool, luck, rating, extraWeight = null) {
  const raw = (pool || []).map(asGraded).filter(Boolean);
  const av = raw.filter(x => allow(x, rating));
  if (!av.length) return null;
  const boost = clamp(luck) / 100;
  const w = av.map(x => {
    const g = itemGrade(x);
    const tier = Math.max(0, GRADE_ORDER.indexOf(g));
    let wt = (GRADE_WEIGHT[g] || 30) * Math.pow(1 + boost * LUCK_CURVE, tier);
    if (extraWeight) wt *= extraWeight(x, g, tier);
    return wt;
  });
  return weightedPick(av, w);
}

function cupLetter(item) {
  if (!item) return "";
  if (item.cup) return String(item.cup).toUpperCase();
  const m = String(item.text || "").match(/([ABDEI])\s*罩杯/i);
  return m ? m[1].toUpperCase() : "";
}

// A／B 只抽 N／R 乳型;I 額外加重 SS／SSR 乳型
function rollBreastShape(pool, luck, rating, cupItem) {
  const letter = cupLetter(cupItem);
  const small = letter === "A" || letter === "B";
  const hyper = letter === "I";
  return rollGraded(pool, luck, rating, (x, g) => {
    if (small && !(g === "N" || g === "R")) return 0;
    if (hyper && (g === "SS" || g === "SSR")) return 2.6;
    return 1;
  });
}

// 特殊屬性:抽 1~3 個,同類(cat)不重複,luck 拉高高稀有度
function rollTraits(pool, luck, rating) {
  const av = (pool || []).filter(x => allow(x, rating));
  const boost = clamp(luck) / 100;
  let count = 1 + (Math.random() < 0.5 + boost * 0.3 ? 1 : 0) + (Math.random() < 0.2 + boost * 0.3 ? 1 : 0);
  const chosen = [], used = new Set();
  while (chosen.length < count) {
    const cand = av.filter(t => !used.has(t.cat));
    if (!cand.length) break;
    const w = cand.map(t => {
      const g = itemGrade(t);
      const tier = Math.max(0, GRADE_ORDER.indexOf(g));
      return (GRADE_WEIGHT[g] || 30) * Math.pow(1 + boost * (LUCK_CURVE + 0.5), tier);
    });
    const t = weightedPick(cand, w);
    const g = itemGrade(t);
    chosen.push({ name: t.name, rarity: g, grade: g, cat: t.cat });
    used.add(t.cat);
  }
  chosen.sort((a, b) => GRADE_ORDER.indexOf(itemGrade(b)) - GRADE_ORDER.indexOf(itemGrade(a)));
  return chosen;
}

// 興趣依原型氣質加權(偏好桶權重 5、其餘 1)
function pickHobbies(arch, hobbyPool, n) {
  const prefs = arch.hobby_vibes || Object.keys(hobbyPool);
  const items = [], weights = [];
  for (const [vibe, hs] of Object.entries(hobbyPool)) {
    const w = prefs.includes(vibe) ? 5 : 1;
    for (const h of hs) { items.push(h); weights.push(w); }
  }
  const picks = new Set();
  let guard = 0;
  while (picks.size < n && guard++ < 60) picks.add(weightedPick(items, weights));
  return [...picks];
}

/** 生成一名魅魔的完整人設。
 *  luck: 0~100(獻祭人數換算;越高越容易高評級)
 *  rating: 'sfw' | 'nsfw'(nsfw 項目的參與開關)
 *  usedNames: 已用名字(防撞)  */
export function generateGirl({ luck = 0, rating = "nsfw", usedNames = [] } = {}) {
  const F = POOLS?.female;
  if (!F) return null;

  const arch = rollGraded(F.archetypes, luck, rating) || pk(F.archetypes.filter(a => allow(a, rating)));
  const proactivity = clamp(arch.proactivity + ri(-12, 12), 5, 98);
  const shynessBase = arch.shyness;

  // 職業:NSFW 模式排除未成年設定的職業。這一整套人設會直接餵給性向描寫的
  // prompt(身體感軸、飢渴、交配演出),未成年職業不能走那條路徑。
  const occPool = rating === "nsfw" ? F.occupations.filter(o => !MINOR_OCC.has(o.name)) : F.occupations;
  const occ = rollGraded(occPool, luck, rating);
  if (!occ || !arch) return null;
  const lib = rollGraded(F.libido, luck, rating) || { name: "普通", grade: "R", shyness_delta: 0, desc: "" };
  const shyness = clamp(shynessBase + (lib.shyness_delta || 0));
  const quirk = pk(F.quirks.filter(q => allow(q, rating))).text;
  const chrono = pk(F.chronotypes);
  const attitude = pk(F.attitudes);
  const arc = pk(F.arcs);

  const A = F.appearance;
  const txt = x => (x && (x.text || x.name)) || "";
  const build = rollGraded(A.build, luck, rating);
  const cupPool = A.cup || A.bust;
  const cup = rollGraded(cupPool, luck, rating);
  const breastShape = rollBreastShape(A.breast_shape, luck, rating, cup);
  const eyes = rollGraded(A.eyes, luck, rating);
  const areola = (A.areola && A.areola.length) ? rollGraded(A.areola, luck, rating) : null;
  const nipple = (A.nipple && A.nipple.length) ? rollGraded(A.nipple, luck, rating) : null;
  // 性器軸：陰唇／陰蒂／顏色各三級、陰毛四級；等機率、不進稀有度（特寫圖用，不是抽卡賣點）
  const labiaSize = (A.labia_size && A.labia_size.length) ? pickPlain(A.labia_size, rating) : null;
  const clitSize = (A.clitoris_size && A.clitoris_size.length) ? pickPlain(A.clitoris_size, rating) : null;
  const labiaColor = (A.labia_color && A.labia_color.length) ? pickPlain(A.labia_color, rating) : null;
  const pubicHair = (A.pubic_hair && A.pubic_hair.length) ? pickPlain(A.pubic_hair, rating) : null;
  const eyeColor = (A.eye_color && A.eye_color.length) ? rollGraded(A.eye_color, luck, rating) : null;
  const face = rollGraded(A.face, luck, rating);
  const mouth = rollGraded(A.mouth, luck, rating);
  const hair = rollGraded(A.hair, luck, rating);
  const hairColor = rollGraded(A.hair_color, luck, rating);
  const feature = rollGraded(A.feature, luck, rating);
  // 年齡:池子裡沒有這欄,由這裡抽。生圖非有不可——不給年齡,模型畫出來的
  // 年紀會隨機漂,同一個人設每次看起來都不同歲數。範圍見 persona_pools 的
  // age(沒設就用 18~33:她們都是被從現實生活裡擄來的成年人)。
  const ageRange = F.age || {};
  // 服裝分兩個維度(見 README「服裝:生涯服裝 + 個人衣櫃」):
  //   career_outfit —— 職業給的,她平常就穿這身。學生就是制服,不會是西裝。
  //   wardrobe      —— 個人喜好,依關係解鎖(朋友 1 / 女友 3 / 妻子 6 套)。
  // 陌生階段她只讓你看見工作時的樣子,所以預設作畫用的是 career_outfit。
  const wardrobe = pickN(A.style, WARDROBE_SIZE);
  const eroticPool = (A.erotic_style || []).filter(x => allow(typeof x === "string" ? { nsfw: true } : x, rating));
  const eroticSrc = eroticPool.length ? eroticPool.map(x => typeof x === "string" ? x : x.text) : [];
  const sleepSrc = (A.sleep_style || []).map(x => typeof x === "string" ? x : x.text).filter(Boolean);
  const eroticOutfits = eroticSrc.length ? pickN(eroticSrc, EROTIC_OUTFIT_SIZE) : [];
  const sleepOutfits = sleepSrc.length ? pickN(sleepSrc, SLEEP_OUTFIT_SIZE) : [];
  const cupText = txt(cup);
  const shapeText = txt(breastShape);
  const look = {
    age: ri(Math.max(18, ageRange.min || 18), Math.max(18, ageRange.max || 33)),
    height_cm: ri(150, 172),
    build: txt(build),
    cup: cupText,
    breast_shape: shapeText,
    // 舊欄位:卡牌綁定／舊 UI 仍讀 look.bust
    bust: [cupText, shapeText].filter(Boolean).join("、"),
    eyes: txt(eyes),
    areola: txt(areola),
    nipple: txt(nipple),
    labia_size: txt(labiaSize),
    clitoris_size: txt(clitSize),
    labia_color: txt(labiaColor),
    pubic_hair: txt(pubicHair),
    eye_color: txt(eyeColor),
    face: txt(face),
    mouth: txt(mouth),
    hair: txt(hair),
    hair_color: txt(hairColor),
    style: wardrobe[0],   // 舊欄位:仍指得到一套衣服,舊程式路徑不會拿到 undefined
    career_outfit: occ.outfit || "",
    wardrobe,
    eroticOutfits,
    sleepOutfits,
    feature: txt(feature),
  };
  const traits = rollTraits(F.special_traits, luck, rating);

  // 總評 = 計分軸純平均。髮色／特徵仍抽進 look,但不進分(鑑別度低、只會把 SSR 稀釋掉)。
  // 性器軸等機率抽、不進分。NSFW 沒抽到的軸(乳暈／乳頭)不進平均,避免 SFW 被缺軸扭曲。
  const grades = {
    occupation: itemGrade(occ),
    personality: itemGrade(arch),
    libido: itemGrade(lib),
    build: itemGrade(build),
    cup: itemGrade(cup),
    breast_shape: itemGrade(breastShape),
    eyes: itemGrade(eyes),
    eye_color: itemGrade(eyeColor),
    face: itemGrade(face),
    mouth: itemGrade(mouth),
    hair: itemGrade(hair),
  };
  if (areola) grades.areola = itemGrade(areola);
  if (nipple) grades.nipple = itemGrade(nipple);
  traits.forEach((t, i) => { grades["special" + (i + 1)] = itemGrade(t); });
  const vals = Object.values(grades).map(g => GRADE_VALUE[normGrade(g)] ?? 1);
  const score = vals.reduce((a, b) => a + b, 0) / vals.length;
  // 機率化進位:小數部分當進位機率(分佈平滑,沒有整數斷崖)
  let idx = Math.min(GRADE_ORDER.length - 1, Math.floor(score) + (Math.random() < (score - Math.floor(score)) ? 1 : 0));
  // 整體獲得率 +5%:算出總評後有 5% 再升一階
  if (idx < GRADE_ORDER.length - 1 && Math.random() < UPGRADE_P) idx += 1;
  // 滿 6 人 SSR 拉到約 5%:只從 SS 往上升,隨 luck 線性加(luck 0 不加)
  if (GRADE_ORDER[idx] === "SS") {
    const p = (clamp(luck) / 92) * SSR_PROMOTE_AT_MAX;
    if (p > 0 && Math.random() < p) idx += 1;
  }
  const overallGrade = GRADE_ORDER[idx];

  // 名字防撞
  const used = new Set(usedNames);
  const freeNames = F.names.filter(x => !used.has(x));
  const name = pk(freeNames.length ? freeNames : F.names);

  // 作息:職業四時段;深夜睡覺（不再預設「織夢」）
  const slots = ["morning", "noon", "afternoon", "evening"];
  const acts = occ.sch || ["過著自己的生活", "吃頓飯歇口氣", "忙自己的事", "度過一個平凡的夜晚"];
  const schedule = {};
  slots.forEach((k, i) => schedule[k] = acts[i]);
  schedule.night = "睡覺";

  return {
    name,
    rarity: overallGrade,
    personality: [arch.name],
    archetype: arch.name,
    tone: arch.tone,
    catchphrases: arch.catchphrases,
    reactions: arch.reactions,
    stats: { proactivity, shyness, jealousy: arch.jealousy, loyalty: clamp((arch.loyalty ?? 60) + ri(-10, 10)) },
    libido: { name: lib.name, grade: lib.grade, desc: lib.desc, nsfw: !!lib.nsfw },
    // SS／SSR 性慾：半身立繪 1/2 出裸體（召喚時擲一次,之後固定）
    portraitNude: (itemGrade(lib) === "SS" || itemGrade(lib) === "SSR") && Math.random() < 0.5,
    quirk,
    contrast: `是${arch.name}的人,但${quirk}`,
    likes: pickN(F.likes, 3),
    dislikes: pickN(F.dislikes, 2),
    hobbies: pickHobbies(arch, F.hobby_pool, ri(2, 3)),
    chrono: { name: chrono.name, desc: chrono.desc, wake_react: chrono.wake_react },
    arc,
    job: occ.name,
    jobDesc: occ.desc || null,
    backstory: `她原本是現實世界的${occ.name}——${occ.life}。某天毫無預警地被召喚到魅魔萬事屋,成了所謂的「魅魔」。${attitude}。`,
    schedule,
    look,
    specialTraits: traits,
    grades: { ...grades, overall: overallGrade },
  };
}
