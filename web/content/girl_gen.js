// ============================================================
// GirlGen — 內容模組銜接口③:魅魔人物生成器(原型骨幹+評級抽卡)
// 廠商替換點:池子在 persona_pools.json(/edit_person 可編輯),
// 本檔只是抽取邏輯。nsfw 標記的項目只在分級 NSFW 時參與抽取。
// 稀有度=各項評級的總評分(獻祭人數→luck→越容易抽到高階)。
// ============================================================

export let POOLS = null;

export const GRADE_ORDER = ["N", "R", "S", "SR", "SSR"];
const GRADE_WEIGHT = { N: 100, R: 55, S: 12, SR: 5, SSR: 2 };
const GRADE_VALUE = { N: 0, R: 1, S: 2, SR: 3, SSR: 4 };
export const RARITY_ORDER = ["普通", "稀有", "史詩", "傳說"];
const RARITY_WEIGHT = { "普通": 60, "稀有": 28, "史詩": 10, "傳說": 2 };
const RARITY_TO_GRADE = { "普通": "N", "稀有": "S", "史詩": "SR", "傳說": "SSR" };
export const RARITY_MARK = { "普通": "⚪", "稀有": "🔵", "史詩": "🟣", "傳說": "🌟" };
// 總評分 → 萬事屋稀有度(SR 檔對應 SS)
const GRADE_TO_YZ = { N: "N", R: "R", S: "S", SR: "SS", SSR: "SSR" };

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

function pickN(arr, n) {
  const a = [...arr].sort(() => Math.random() - 0.5);
  return a.slice(0, Math.min(n, a.length));
}

// 個人喜好衣櫃的總套數。一次抽滿(她的品味是天生的,不是升級長出來的),
// 但玩家看得到幾套要看關係:WARDROBE_UNLOCK。
export const WARDROBE_SIZE = 6;
// 關係階段 → 解鎖幾套。陌生時你只見過她工作時的樣子。
export const WARDROBE_UNLOCK = { stranger: 0, friend: 1, girlfriend: 3, wife: 6 };

function weightedPick(items, weights) {
  let sum = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * sum;
  for (let i = 0; i < items.length; i++) { r -= weights[i]; if (r <= 0) return items[i]; }
  return items[items.length - 1];
}

// 評級加權抽:luck(0~100) 把機率往高階傾斜(指數型,高 luck 時高階明顯變常見)
function rollGraded(pool, luck, rating) {
  const av = pool.filter(x => allow(x, rating));
  if (!av.length) return null;
  const boost = clamp(luck) / 100;
  const w = av.map(x => {
    const tier = Math.max(0, GRADE_ORDER.indexOf(x.grade || "N"));
    return (GRADE_WEIGHT[x.grade] || 30) * Math.pow(1 + boost * 2.8, tier);
  });
  return weightedPick(av, w);
}

// 特殊屬性:抽 1~3 個,同類(cat)不重複,luck 拉高高稀有度
function rollTraits(pool, luck, rating) {
  const av = pool.filter(x => allow(x, rating));
  const boost = clamp(luck) / 100;
  let count = 1 + (Math.random() < 0.5 + boost * 0.3 ? 1 : 0) + (Math.random() < 0.2 + boost * 0.3 ? 1 : 0);
  const chosen = [], used = new Set();
  while (chosen.length < count) {
    const cand = av.filter(t => !used.has(t.cat));
    if (!cand.length) break;
    const w = cand.map(t => {
      const tier = Math.max(0, RARITY_ORDER.indexOf(t.rarity));
      return (RARITY_WEIGHT[t.rarity] || 30) * Math.pow(1 + boost * 3.4, tier);
    });
    const t = weightedPick(cand, w);
    chosen.push({ name: t.name, rarity: t.rarity, cat: t.cat });
    used.add(t.cat);
  }
  chosen.sort((a, b) => RARITY_ORDER.indexOf(b.rarity) - RARITY_ORDER.indexOf(a.rarity));
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
export function generateGirl({ luck = 0, rating = "sfw", usedNames = [] } = {}) {
  const F = POOLS?.female;
  if (!F) return null;

  const archPool = F.archetypes.filter(a => allow(a, rating));
  const arch = pk(archPool);
  const proactivity = clamp(arch.proactivity + ri(-12, 12), 5, 98);
  const shynessBase = arch.shyness;

  // 職業:NSFW 模式排除未成年設定的職業。這一整套人設會直接餵給性向描寫的
  // prompt(身體感軸、飢渴、交配演出),未成年職業不能走那條路徑。
  const occPool = rating === "nsfw" ? F.occupations.filter(o => !MINOR_OCC.has(o.name)) : F.occupations;
  const occ = rollGraded(occPool, luck, rating);
  const lib = rollGraded(F.libido, luck, rating) || { name: "普通", grade: "R", shyness_delta: 0, desc: "" };
  const shyness = clamp(shynessBase + (lib.shyness_delta || 0));
  const quirk = pk(F.quirks.filter(q => allow(q, rating))).text;
  const chrono = pk(F.chronotypes);
  const attitude = pk(F.attitudes);
  const arc = pk(F.arcs);

  const A = F.appearance;
  const build = rollGraded(A.build, luck, rating);
  const bust = rollGraded(A.bust, luck, rating);
  const eyes = rollGraded(A.eyes, luck, rating);
  // 乳暈 / 瞳色:新軸;池子缺或 SFW 濾光後為空就留 ""(舊存檔相容)
  const areola = (A.areola && A.areola.length) ? rollGraded(A.areola, luck, rating) : null;
  const eyeColor = (A.eye_color && A.eye_color.length) ? rollGraded(A.eye_color, luck, rating) : null;
  // 年齡:池子裡沒有這欄,由這裡抽。生圖非有不可——不給年齡,模型畫出來的
  // 年紀會隨機漂,同一個人設每次看起來都不同歲數。範圍見 persona_pools 的
  // age(沒設就用 18~33:她們都是被從現實生活裡擄來的成年人)。
  const ageRange = F.age || {};
  // 服裝分兩個維度(見 README「服裝:生涯服裝 + 個人衣櫃」):
  //   career_outfit —— 職業給的,她平常就穿這身。學生就是制服,不會是西裝。
  //   wardrobe      —— 個人喜好,依關係解鎖(朋友 1 / 女友 3 / 妻子 6 套)。
  // 陌生階段她只讓你看見工作時的樣子,所以預設作畫用的是 career_outfit。
  const wardrobe = pickN(A.style, WARDROBE_SIZE);
  const look = {
    age: ri(Math.max(18, ageRange.min || 18), Math.max(18, ageRange.max || 33)),
    height_cm: ri(150, 172),
    build: build.text, bust: bust.text, eyes: eyes.text,
    // 池子沒這一軸(舊 persona_pools)就留空,不要塞 undefined 進存檔
    areola: areola?.text || "",
    eye_color: eyeColor?.text || "",
    face: pk(A.face || []) || "", mouth: pk(A.mouth || []) || "",
    hair: pk(A.hair), hair_color: pk(A.hair_color || []) || "",
    style: wardrobe[0],   // 舊欄位:仍指得到一套衣服,舊程式路徑不會拿到 undefined
    career_outfit: occ.outfit || "",
    wardrobe,
    feature: pk(A.feature),
  };
  const traits = rollTraits(F.special_traits, luck, rating);

  // 總評分 → 稀有度(職業/性慾/體型/罩杯/眼睛/最高特殊屬性 的平均)
  const grades = {
    occupation: occ.grade || "R", libido: lib.grade || "R",
    build: build.grade || "N", bust: bust.grade || "N", eyes: eyes.grade || "N",
  };
  if (traits.length) grades.special = RARITY_TO_GRADE[traits[0].rarity] || "N";
  // 總評:平均與最高項各佔一半(有一項頂級就明顯拉高;獻越多 luck 越高 → SSR 真的開得出來)
  const vals = Object.values(grades).map(g => GRADE_VALUE[g] ?? 1);
  const avg = vals.reduce((a, b) => a + b, 0) / vals.length;
  const top = Math.max(...vals);
  const score = avg * 0.58 + top * 0.42;
  // 機率化進位:小數部分當進位機率(分佈平滑,沒有整數斷崖)
  const idx = Math.min(GRADE_ORDER.length - 1, Math.floor(score) + (Math.random() < (score - Math.floor(score)) ? 1 : 0));
  const overallGrade = GRADE_ORDER[idx];

  // 名字防撞
  const used = new Set(usedNames);
  const freeNames = F.names.filter(x => !used.has(x));
  const name = pk(freeNames.length ? freeNames : F.names);

  // 作息:職業四時段;夜裡一律回夢境織夢
  const slots = ["morning", "noon", "afternoon", "evening"];
  const acts = occ.sch || ["過著自己的生活", "吃頓飯歇口氣", "忙自己的事", "度過一個平凡的夜晚"];
  const schedule = {};
  slots.forEach((k, i) => schedule[k] = acts[i]);
  schedule.night = "回到夢境織夢";

  return {
    name,
    rarity: GRADE_TO_YZ[overallGrade] || "R",
    personality: [arch.name],
    archetype: arch.name,
    tone: arch.tone,
    catchphrases: arch.catchphrases,
    reactions: arch.reactions,
    stats: { proactivity, shyness, jealousy: arch.jealousy, loyalty: clamp((arch.loyalty ?? 60) + ri(-10, 10)) },
    libido: { name: lib.name, grade: lib.grade, desc: lib.desc, nsfw: !!lib.nsfw },
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
