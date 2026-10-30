/** 約會聊天劇本：分類關鍵字與 AI 規則。/edit_date 可改，寫回 edit_date.json。 */

import { normalizeMolestPacks, normalizeMolestPack } from "./date_molest.js";
import {
  normalizeHotels,
  normalizeHotel,
  normalizeHotelSexAct,
  emptyHotel,
  emptyHotelSexAct,
  defaultHotels,
  defaultHotelPlaces,
  normalizeHotelPlaces,
} from "./date_hotel_sex.js";

export const DATE_ACT_ZH = {
  interact: "互動",
  talk: "調戲",
  tease: "調戲",
  molest: "猥褻",
  eat: "吃東西",
  end: "回家",
  rescue: "帶女子脫離騷擾",
  "block-tease": "阻止調戲",
  "block-molest": "阻止猥褻",
  interruptOk: "阻止成功",
  oral: "口交",
  sex: "做愛",
};


/** 各種類預設英文外觀 tags（文生圖用） */
export const DEFAULT_MALE_LOOK_EN = {
  fat: "fat male, ugly male, overweight obese male, large protruding belly male, round face male, double chin male, greasy skin male, unkempt messy hair male, baggy stained t-shirt male, unattractive male, lewd smirk male",
  gym: "muscular male, athletic male, broad shoulders male, thick arms male, defined chest male, short hair male, tight tank top male, intense hungry stare male, gym body male",
  lust: "lustful male, slim male, average male, hungry lewd eyes male, messy hair male, casual street clothes male, predatory smile male, male looking at woman, lustful expression male",
};

export const DEFAULT_DATE_SCRIPT = {
  girl_system: [
    "你正在公園跟他約會。人就在他眼前。這不是店頭看板，這是約會現場。",
    "回話必須符合上方「你和他現在的關係」，但這是約會現場：陌生也比店頭鬆——人已經願意出門，可以接話、可以吐槽，越界用害羞／無奈擋，不要盛怒仇視。朋友羞怒、女友害羞但身體享受、妻子順從享受。個性只決定怎麼說，關係決定能說什麼。",
    "系統會另外注入這一拍的【場景】。你要帶入場景裡正在發生的事來回話，不要當沒這回事。",
    "【只輸出台詞】只寫你說出口的話。不要角色名冒號。禁止身體動作、表情、姿態、喘息等描寫。長度以上方關係段為準。",
    "只能對已經發生的事做反應。不准下達行動、不准提議換地、不准結束約會、不准唸出體力／性慾／羞恥／感情的數字。",
    "這裡不能口交、不能做愛。他若開口要求，用台詞擋回去，不要配合演出。",
    "調戲用話接。猥褻是他已經動手——依關係反應，不要自己把場面做成口交或做愛。",
  ].join("\n"),
  narr_system:
    "你是約會場景的旁白。只根據已經發生的事寫 1～2 句中文旁白，旁白主要是人物體態動作，神情，場景描述。不要寫人物台詞，不要替任何人下指令，不要發明新事件，不要唸數值。不要寫成口交或做愛。",
  acts: {
    tease: [
      { narr: "玩家靠過去一點，壓低聲音。", player: "這裡人還不少。妳臉有點紅。" },
      { narr: "玩家看她站姿，故意把話講得很近。", player: "這樣站著很好看。被看到也沒關係。" },
      { narr: "玩家用肩膀輕輕碰她一下。", player: "跟緊一點。風有點大。" },
      { narr: "玩家把視線停在她身上，笑了一下。", player: "妳等一下也這樣給我看？" },
      { narr: "有人走過去，玩家卻只看她。", player: "他們走了。現在輪到我看妳。" },
      { narr: "玩家側過身擋住一點視線。", player: "靠近一點。就說一句。" },
      { narr: "玩家盯著她的領口，語氣像在開玩笑。", player: "這件衣服很襯妳。還是在襯我。" },
    ],
    molest: [
      { narr: "趁她看旁邊的空檔，手從後面碰她腰。", player: "別動。沒人注意這邊。" },
      { narr: "玩家站到她身後，掌心貼上她腰側。", player: "站好。假裝還在看前面。" },
      { narr: "有人走過去，玩家的手指在她衣襬邊。", player: "等他們走過去。" },
      { narr: "玩家用身體擋住側邊視線，手往她背上滑。", player: "廣場很大，沒人盯著妳。" },
      { narr: "玩家的手環過她腰，把她帶近一點。", player: "靠過來。就幾秒。" },
      { narr: "她視線還在場中央，玩家的拇指在她腰窩按一下。", player: "看前面就好。" },
      { narr: "玩家的手從腰側往上，隔著衣服停在她胸口下緣。", player: "噓。別叫出來。" },
    ],
    interruptOk: [
      { narr: "你擋在她身前，一把推開那隻伸過來的手。", player: "別碰她。給我滾開。" },
      { narr: "你抓住他的手腕，把他從她身邊拉開。", player: "眼睛給我放乾淨。她是跟我來的。" },
      { narr: "你側身擋住他，聲音壓得很低。", player: "再靠近一步試試。" },
    ],
  },
  classify: {
    oral: {
      keywords: [
        "口交", "含住", "含著", "幫我口", "給我吸", "幫我吸", "口我", "吹簫",
        "舔雞", "吃雞", "含我", "舔我的", "用嘴",
      ],
      refuse: "這裡不能口交。",
    },
    sex: {
      keywords: [
        "交配", "做愛", "幹你", "肏你", "我要幹", "我要肏", "插你", "幹死",
        "猛幹", "猛操", "猛糙", "內射", "中出", "插入", "騎乘", "上來騎",
        "坐上來", "騎我", "後入", "從後面幹", "狗爬", "趴下給我",
      ],
      refuse: "這裡不能做愛。",
    },
    molest: {
      keywords: [
        "猥褻", "亂摸", "動手", "摸奶", "摸乳", "揉奶", "揉胸", "摸胸",
        "吃奶", "吸奶", "玩奶", "摸臀", "揉臀", "摸屁股", "揉屁股", "打屁股",
        "捏臀", "伸進", "掀裙", "掀衣服", "脫她", "脫你", "摸下面", "摳她",
        "摳你", "把手伸", "隔衣摸", "從後面抱", "抓胸", "抓臀",
        "摸乳頭", "捏奶", "摟腰", "把手放進",
      ],
    },
    talk: {
      keywords: [
        "言語調戲", "色話", "黃色", "下流", "騷貨", "想摸你", "內衣",
        "內褲", "胸型", "奶子真", "下面是不是", "今晚能不能", "叫我一聲",
        "欠摸", "想舔妳", "想舔你", "調戲", "色色", "想看妳", "想看你",
        "乳頭", "陰唇", "濕了沒",
      ],
    },
  },
  /** 單男系統：每種男子各自有搭訕／調戲(harass)／猥褻／嘲諷(taunt)／交配請求池。 */
  male: {
    activeTypeId: "fat",
    hotelPlaces: defaultHotelPlaces(),
    types: [
      {
        id: "fat",
        name: "噁心胖肥宅",
        talkWeight: 0.7,
        lookEn: DEFAULT_MALE_LOOK_EN.fat,
        approach: [
          { narr: "一個穿著寬鬆T恤、肚子把衣襬撐開的男人喘著走過來，眼睛先落在她胸口。", male: "嘿美女，一個人喔？肥宅我也是有需求的啦，讓哥靠近一點嘛。" },
        ],
        harass: [
          { narr: "肥宅站在她身側，喘著壓低聲音卻故意讓周圍聽見。", male: "跟這種貨色約會？不如跟肥宅哥聊兩句。" },
          { narr: "他盯著她的領口，肚子一晃，嘴角扯開。", male: "這樣穿是故意的吧？胸型都看出來了。" },
          { narr: "他湊近她耳邊，氣息又熱又黏。", male: "別裝沒聽到。妳聞起來就很好幹。" },
          { narr: "他上下打量她，笑得很大聲。", male: "旁邊那傢伙養不起妳。換肥宅試試？" },
        ],
        molest: [
          { narr: "肥宅從側後方伸手，隔著衣服按住她腰。", male: "別動。就摸一下，肥宅手軟。" },
          { narr: "他的手從她背後滑到臀側，假裝只是擠過去。", male: "這麼軟，借哥摸兩下不過分吧。" },
          { narr: "他把手伸向她胸口下緣，眼睛盯著玩家挑釁。", male: "她喜歡這樣，你看她沒推開。" },
          { narr: "他一把把她拉近，掌心貼在她大腿外側。", male: "腿夾緊一點。給哥好好摸摸。" },
        ],
        mate: [
          { narr: "肥宅把她拉近自己，聲音又粗又急。", male: "跟我走。現在就去做愛。" },
          { narr: "他指了指旁邊的小路，另一隻手還攬著她。", male: "別裝了。跟肥宅去一趟，保證妳爽。" },
          { narr: "他對玩家揚了揚下巴，把她往自己身側帶。", male: "她要跟我去交配了。你在旁邊看就好。" },
        ],
        taunt: [
          { narr: "肥宅咧嘴笑，把你的手撥開。", male: "擋錯了吧？肥宅說了算。" },
          { narr: "他推了你一把，得意地看著她。", male: "猜錯囉。她比較喜歡我這樣。" },
          { narr: "他拍了拍肚子，嘲諷地看你。", male: "弱雞，連擋都擋不住。" }
        ]
      },
      {
        id: "gym",
        name: "健身變態男",
        talkWeight: 0.3,
        lookEn: DEFAULT_MALE_LOOK_EN.gym,
        approach: [
          { narr: "一個肩很寬、背心貼著胸肌的男人放慢腳步，從她側後方靠近。", male: "身材不錯。過來，讓我摟一下就知道妳多軟。" },
        ],
        harass: [
          { narr: "健身男站在她身側，壓低聲音卻故意讓周圍聽見。", male: "跟這種貨色約會？不如跟有練的聊兩句。" },
          { narr: "他盯著她的領口，嘴角扯開。", male: "這樣穿是故意的吧？胸型都看出來了。" },
          { narr: "他湊近她耳邊，氣息噴在她頸側。", male: "別裝沒聽到。妳聞起來就很好幹。" },
          { narr: "他上下打量她，笑得很大聲。", male: "旁邊那傢伙養不起妳。換哥試試？" },
        ],
        molest: [
          { narr: "健身男從側後方伸手，隔著衣服按住她腰。", male: "別動。就摸一下。" },
          { narr: "他的手從她背後滑到臀側，假裝只是擠過去。", male: "這麼軟，借哥摸兩下不過分吧。" },
          { narr: "他把手伸向她胸口下緣，眼睛盯著玩家挑釁。", male: "她喜歡這樣，你看她沒推開。" },
          { narr: "他一把把她拉近，掌心貼在她大腿外側。", male: "腿夾緊一點。給哥好好摸摸。" },
        ],
        mate: [
          { narr: "健身男把她拉近自己，聲音又粗又急。", male: "跟我走。現在就去做愛。" },
          { narr: "他指了指旁邊的小路，另一隻手還攬著她。", male: "別裝了。跟哥去一趟，保證妳爽。" },
          { narr: "他對玩家揚了揚下巴，把她往自己身側帶。", male: "她要跟我去交配了。你在旁邊看就好。" },
        ],
        taunt: [
          { narr: "健身男一把甩開你的手，肩線壓過來。", male: "力氣不夠就別擋。看著就好。" },
          { narr: "他冷笑一聲，把你撥到一旁。", male: "猜錯了。下一步才是重點。" },
          { narr: "他用胸膛頂開你，視線還黏在她身上。", male: "擋錯方向了，廢物。" }
        ]
      },
      {
        id: "lust",
        name: "色慾單身男",
        talkWeight: 0.25,
        lookEn: DEFAULT_MALE_LOOK_EN.lust,
        approach: [
          { narr: "一個眼神發亮的男人徑直走來，視線黏在她胸和腿之間，沒有要打招呼的意思。", male: "奶形看得出來。別裝沒聽到，我是來摸的。" },
        ],
        harass: [
          { narr: "色慾男站在她身側，壓低聲音卻故意讓周圍聽見。", male: "跟這種貨色約會？不如跟哥聊兩句。" },
          { narr: "他盯著她的領口，嘴角扯開。", male: "這樣穿是故意的吧？胸型都看出來了。" },
          { narr: "他湊近她耳邊，氣息噴在她頸側。", male: "別裝沒聽到。妳聞起來就很好幹。" },
          { narr: "他上下打量她，笑得很大聲。", male: "旁邊那傢伙養不起妳。換哥試試？" },
        ],
        molest: [
          { narr: "色慾男從側後方伸手，隔著衣服按住她腰。", male: "別動。就摸一下。" },
          { narr: "他的手從她背後滑到臀側，假裝只是擠過去。", male: "這麼軟，借哥摸兩下不過分吧。" },
          { narr: "他把手伸向她胸口下緣，眼睛盯著玩家挑釁。", male: "她喜歡這樣，你看她沒推開。" },
          { narr: "他一把把她拉近，掌心貼在她大腿外側。", male: "腿夾緊一點。給哥好好摸摸。" },
        ],
        mate: [
          { narr: "色慾男把她拉近自己，聲音又粗又急。", male: "跟我走。現在就去做愛。" },
          { narr: "他指了指旁邊的小路，另一隻手還攬著她。", male: "別裝了。跟哥去一趟，保證妳爽。" },
          { narr: "他對玩家揚了揚下巴，把她往自己身側帶。", male: "她要跟我去交配了。你在旁邊看就好。" },
        ],
        taunt: [
          { narr: "色慾男偏頭笑，根本不看你。", male: "猜錯了。她已經濕了你不知道？" },
          { narr: "他撥開你的手，舌頭舔了下嘴唇。", male: "擋錯招。接下來更有趣。" },
          { narr: "他嗤了一聲，又往她身邊靠。", male: "廢物男友，連猜都猜不中。" }
        ]
      },
    ],
  },
};

function linesOf(list, fallback) {
  const src = Array.isArray(list) ? list : fallback;
  const out = [];
  const seen = new Set();
  for (const x of src) {
    const s = String(x || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function actList(list, fallback) {
  const src = Array.isArray(list) && list.length ? list : fallback;
  return src
    .map((x) => ({
      narr: String(x?.narr || "").trim(),
      player: String(x?.player || "").trim(),
    }))
    .filter((x) => x.narr && x.player);
}

export function formatActs(list) {
  return actList(list, []).map((x) => `${x.narr}\n${x.player}`).join("\n\n");
}

export function parseActs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((block) => {
      const ls = block.split("\n").map((s) => s.trim()).filter(Boolean);
      if (ls.length < 2) return null;
      return { narr: ls[0], player: ls.slice(1).join("") };
    })
    .filter(Boolean);
}


function maleActList(list, fallback) {
  const src = Array.isArray(list) && list.length ? list : fallback;
  return src
    .map((x) => ({
      narr: String(x?.narr || "").trim(),
      male: String(x?.male || "").trim(),
    }))
    .filter((x) => x.narr && x.male);
}

const MALE_POOL_KEYS = ["approach", "harass", "mate", "taunt"]; // molest → molestPacks

function cloneMaleActs(list) {
  return maleActList(list, []).map((x) => ({ narr: x.narr, male: x.male }));
}

function defaultMaleTypeById(id, fallbackTypes) {
  const fb = Array.isArray(fallbackTypes) ? fallbackTypes : [];
  return fb.find((t) => t.id === id) || fb[0] || null;
}

function seedApproachForType(id, index, legacyApproach, dType) {
  const legacy = Array.isArray(legacyApproach) ? legacyApproach : [];
  const byId = { fat: 0, gym: 1, lust: 2 };
  const idx = id in byId ? byId[id] : index;
  if (legacy[idx]) return cloneMaleActs([legacy[idx]]);
  if (legacy.length === 1) return cloneMaleActs(legacy);
  return cloneMaleActs(dType?.approach);
}

function seedSharedPool(key, legacyTop, dType, dMale) {
  if (Array.isArray(legacyTop?.[key]) && legacyTop[key].length) {
    return cloneMaleActs(legacyTop[key]);
  }
  if (Array.isArray(dType?.[key]) && dType[key].length) {
    return cloneMaleActs(dType[key]);
  }
  // 最後退回第一個預設種類的同名池
  const first = (dMale?.types || [])[0];
  return cloneMaleActs(first?.[key]);
}

function normalizeMaleType(raw, i, ctx) {
  const { legacyTop, dMale } = ctx;
  const dType = defaultMaleTypeById(String(raw?.id || "").trim(), dMale.types)
    || dMale.types[i]
    || dMale.types[0]
    || { id: `m${i + 1}`, name: "男子", talkWeight: 0.5, lookEn: "", approach: [], harass: [], molest: [], mate: [], taunt: [] };
  let id = String(raw?.id || dType.id || `m${i + 1}`).trim() || `m${i + 1}`;
  const tw = Number(raw?.talkWeight ?? dType.talkWeight);
  const lookFallback = (DEFAULT_MALE_LOOK_EN[id] || dType.lookEn || "");
  const out = {
    id,
    name: String(raw?.name || dType.name || "男子").trim() || "男子",
    talkWeight: Number.isFinite(tw) ? Math.min(1, Math.max(0, tw)) : 0.5,
    lookEn: String(raw?.lookEn ?? lookFallback ?? "").trim(),
  };
  for (const key of MALE_POOL_KEYS) {
    const perType = Array.isArray(raw?.[key]) && raw[key].length
      ? maleActList(raw[key], [])
      : null;
    if (perType && perType.length) {
      out[key] = perType;
      continue;
    }
    if (key === "approach") {
      out[key] = seedApproachForType(id, i, legacyTop?.approach, dType);
    } else {
      out[key] = seedSharedPool(key, legacyTop, dType, dMale);
    }
    if (!out[key].length) out[key] = cloneMaleActs(dType[key]);
  }
  // ④ 猥褻：packs 優先；舊 type.molest / 頂層 molest → packsFromLegacyActs
  const legacyMolestActs = (Array.isArray(raw?.molest) && raw.molest.length)
    ? raw.molest
    : (Array.isArray(raw?.molestPacks) && raw.molestPacks.length)
      ? []
      : seedSharedPool("molest", legacyTop, dType, dMale);
  const molestPacks = normalizeMolestPacks(raw?.molestPacks, legacyMolestActs).map((p) =>
    normalizeMolestPack({ ...p, imgMode: p.imgMode === "ref" && !String(p.slot?.ref || "").trim() ? "txt" : p.imgMode })
  );
  // 若從舊池剛遷過來，標記為文生圖
  for (const p of molestPacks) {
    if (!String(p.slot?.ref || "").trim()) p.imgMode = "txt";
  }
  const activeMolestId = String(raw?.activeMolestId || molestPacks[0]?.id || "");
  out.molestPacks = molestPacks;
  out.activeMolestId = molestPacks.some((p) => p.id === activeMolestId)
    ? activeMolestId
    : (molestPacks[0]?.id || "");
  // 舊格式相容：molest 陣列由 packs 同步
  out.molest = molestPacks.map((p) => ({
    narr: String(p.narrPrompt || "").trim() || "男子動手猥褻。",
    male: String(p.playerAct || "").trim() || "……",
  }));
  return out;
}

function maleTypesList(list, fallback, legacyTop, dMale) {
  const src = Array.isArray(list) && list.length ? list : fallback;
  const out = [];
  const seen = new Set();
  const ctx = { legacyTop: legacyTop || {}, dMale: dMale || { types: fallback || [] } };
  src.forEach((x, i) => {
    const t = normalizeMaleType(x, i, ctx);
    let id = t.id;
    if (seen.has(id)) id = `${id}_${i + 1}`;
    seen.add(id);
    t.id = id;
    out.push(t);
  });
  return out.length ? out : maleTypesList(null, fallback, legacyTop, dMale);
}

export function formatMaleActs(list) {
  return maleActList(list, []).map((x) => `${x.narr}\n${x.male}`).join("\n\n");
}

export function parseMaleActs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((block) => {
      const ls = block.split("\n").map((s) => s.trim()).filter(Boolean);
      if (ls.length < 2) return null;
      return { narr: ls[0], male: ls.slice(1).join("") };
    })
    .filter(Boolean);
}

export function normalizeDateScript(raw) {
  const d = DEFAULT_DATE_SCRIPT;
  const src = raw && typeof raw === "object" ? raw : {};
  const cls = src.classify && typeof src.classify === "object" ? src.classify : {};
  const block = (key) => {
    const cur = cls[key] && typeof cls[key] === "object" ? cls[key] : {};
    const base = d.classify[key];
    const out = { keywords: linesOf(cur.keywords, base.keywords) };
    if (base.refuse != null) out.refuse = String(cur.refuse || base.refuse);
    return out;
  };
  const acts = src.acts && typeof src.acts === "object" ? src.acts : {};
  const tease = actList(acts.tease, d.acts.tease);
  const interruptOk = actList(acts.interruptOk, d.acts.interruptOk);
  const legacyMolest = actList(acts.molest, d.acts.molest);
  const molestPacks = normalizeMolestPacks(src.molestPacks, legacyMolest);
  // 舊格式相容：acts.molest 由 packs 同步成 narr/player
  const molestActs = molestPacks.map((p) => ({
    narr: String(p.narrPrompt || "").trim() || "玩家動手猥褻。",
    player: String(p.playerAct || "").trim() || "……",
  }));
  const activeMolestId = String(src.activeMolestId || molestPacks[0]?.id || "");
  const maleSrc = src.male && typeof src.male === "object" ? src.male : {};
  const dMale = d.male;
  // 舊格式相容：頂層 shared pools → 各 type 自有池；正規化後不再保留頂層池
  const legacyTop = {
    approach: maleSrc.approach,
    harass: maleSrc.harass,
    molest: maleSrc.molest,
    mate: maleSrc.mate,
    taunt: maleSrc.taunt,
  };
  const types = maleTypesList(maleSrc.types, dMale.types, legacyTop, dMale);
  let activeTypeId = String(maleSrc.activeTypeId || dMale.activeTypeId || types[0]?.id || "").trim();
  if (!types.some((t) => t.id === activeTypeId)) activeTypeId = types[0]?.id || "";
  const hotelPlaces = normalizeHotelPlaces(maleSrc.hotelPlaces ?? d.male.hotelPlaces);
  const hotels = normalizeHotels(maleSrc.hotels, hotelPlaces);
  let activeHotelId = String(maleSrc.activeHotelId || hotels[0]?.id || "").trim();
  if (!hotels.some((h) => h.id === activeHotelId)) activeHotelId = hotels[0]?.id || "";
  return {
    girl_system: String(src.girl_system || d.girl_system).trim() || d.girl_system,
    narr_system: String(src.narr_system || d.narr_system).trim() || d.narr_system,
    classify: {
      oral: block("oral"),
      sex: block("sex"),
      molest: block("molest"),
      talk: block("talk"),
    },
    acts: {
      tease,
      interruptOk,
      molest: molestActs.length ? molestActs : legacyMolest,
    },
    molestPacks,
    activeMolestId: molestPacks.some((p) => p.id === activeMolestId)
      ? activeMolestId
      : (molestPacks[0]?.id || ""),
    male: {
      activeTypeId,
      types,
      hotelPlaces,
      hotels,
      activeHotelId,
    },
  };
}

export function classifyDateLine(text, script) {
  const t = String(text || "");
  const cls = normalizeDateScript(script).classify;
  const hit = (kws) => (kws || []).some((k) => k && t.includes(k));
  if (hit(cls.oral.keywords)) return { act: "oral", refuse: cls.oral.refuse };
  if (hit(cls.sex.keywords)) return { act: "sex", refuse: cls.sex.refuse };
  if (hit(cls.molest.keywords)) return { act: "molest" };
  if (hit(cls.talk.keywords)) return { act: "talk" };
  return { act: "interact" };
}

export { normalizeMolestPack, normalizeMolestPacks, emptyMaleMolestPack, buildMaleMolestImgBody, formatMaleMolestOutputSheet } from "./date_molest.js";
export {
  normalizeHotels,
  normalizeHotel,
  normalizeHotelSexAct,
  emptyHotel,
  emptyHotelSexAct,
  defaultHotels,
  defaultHotelPlaces,
  normalizeHotelPlaces,
  hotelPlaceZh,
  hotelPlaceEn,
  fillHotelPlaceTokens,
  hotelActsByStage,
  buildHotelPlayQueue,
  countHotelStats,
  ejacZh,
} from "./date_hotel_sex.js";
