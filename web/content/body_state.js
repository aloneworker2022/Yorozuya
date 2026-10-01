/** 房間／約會共用：執行期身體狀態（非靜態外貌）。從 testdate 精簡移植。 */

export const BODY_MAX = 30;

export const SEMEN_ZH = ["沒有", "少量", "中量", "大量"];

export const AROUSAL_STAGE = {
  none: "無性奮",
  slight: "微微性奮",
  aroused: "性奮",
  wantFill: "想被填滿",
  climax: "高潮接受中",
};

export const LIBIDO_STAGE = {
  low: "性欲平靜",
  mid: "有點想要",
  high: "慾火高漲",
  peak: "幾乎按捺不住",
};

export const TOY_ZH = {
  vibe: "跳蛋／按摩器",
  dildo: "假陰莖",
  cucumber: "小黃瓜",
  penis: "陰莖",
  fingers: "手指",
  semen: "精液",
};

export const STUFFED_OPTIONS = [
  { value: "", label: "空的" },
  { value: "fingers", label: "手指" },
  { value: "vibe", label: "跳蛋／按摩器" },
  { value: "dildo", label: "假陰莖" },
  { value: "cucumber", label: "小黃瓜" },
  { value: "penis", label: "陰莖" },
  { value: "semen", label: "精液" },
];

const BODY_HITS = [
  { re: /拔掉?(?:跳蛋|按摩器)|取出(?:跳蛋|按摩器)/, id: "vibe_out", arousal: 2 },
  { re: /拔掉?假[陰陽][莖具]|取出假[陰陽][莖具]/, id: "dildo_out", arousal: 3 },
  { re: /拔掉?小黃瓜|取出小黃瓜/, id: "cucumber_out", arousal: 3 },
  { re: /(?:陰莖|肉棒|鸡巴).{0,4}(?:拔|抽)出|(?:拔|抽)出.{0,4}(?:陰莖|肉棒|鸡巴)/, id: "penis_out", arousal: 4 },
  { re: /抽出手指|拔出手指|取出手指|把手指抽|手指抽[出離]|抽出來|抽出/, id: "fingers_out", arousal: 3 },
  { re: /跳蛋|按摩器|震動棒/, id: "vibe_in", arousal: 8 },
  { re: /假陰莖|假陽具|按摩棒/, id: "dildo_in", arousal: 10 },
  { re: /小黃瓜/, id: "cucumber_in", arousal: 10 },
  { re: /內射|射進|灌進子宮|射在裡面/, id: "creampie", arousal: 14 },
  { re: /(?:陰莖|肉棒|鸡巴).{0,6}(?:插|進|入)|(?<!手指)插入|抽送|做愛|幹[她妳]/, id: "penis_in", arousal: 14 },
  { re: /子宮|宮口/, id: "uterus", arousal: 12 },
  { re: /陰蒂/, id: "clit", arousal: 11 },
  { re: /陰唇|小穴|私處|下面/, id: "labia", arousal: 10 },
  { re: /陰道|穴口|裡面/, id: "vagina", arousal: 12 },
  { re: /屁眼|肛門|後穴/, id: "anus", arousal: 9 },
  { re: /乳頭|乳尖/, id: "nipple", arousal: 9 },
  { re: /乳房|胸部|奶子|揉胸/, id: "breast", arousal: 6 },
  { re: /親|吻|嘴唇/, id: "lips", arousal: 4 },
  { re: /腰|細腰|摸腰/, id: "waist", arousal: 3 },
  { re: /大腿|腿根|撫大腿/, id: "thigh", arousal: 5 },
  { re: /屁股|臀部|揉臀/, id: "butt", arousal: 6 },
];

export function clampBody(n, max = BODY_MAX) {
  return Math.max(0, Math.min(max, Math.round(Number(n) || 0)));
}

export function emptyOrgans() {
  return {
    nipples: { swell: 0, wet: false },
    breasts: { swell: 0 },
    clit: { swell: 0, wet: false },
    labia: { swell: 0, wet: false },
    vagina: { wet: 0, stuffed: "" },
    anus: { stuffed: "" },
    uterus: { semen: 0 },
  };
}

export function emptyBody(seedLibido = 8) {
  return {
    arousal: 0,
    libido: clampBody(seedLibido),
    lastPart: "",
    lastVerb: "",
    openness: 0,
    invasion: 0,
    // 舊階梯欄位保留相容；解鎖改走 openness
    teaseStage: 0,
    teaseProgress: 0,
    teaseCounts: {},
    organs: emptyOrgans(),
  };
}

function libidoSeedFromGirl(who) {
  const g = String(who?.libido?.grade || who?.grades?.libido || "N").toUpperCase();
  const map = { N: [4, 10], R: [8, 14], S: [12, 18], SS: [16, 24], SSR: [20, 28] };
  const [lo, hi] = map[g] || map.N;
  return lo + Math.floor(Math.random() * (hi - lo + 1));
}

export function ensureBody(who) {
  if (!who || typeof who !== "object") return null;
  if (!who.bodyState || typeof who.bodyState !== "object") {
    who.bodyState = emptyBody(libidoSeedFromGirl(who));
  }
  const b = who.bodyState;
  b.arousal = clampBody(b.arousal);
  b.climaxTease = Math.max(0, Math.min(6, Math.round(Number(b.climaxTease) || 0)));
  b.libido = clampBody(b.libido == null ? libidoSeedFromGirl(who) : b.libido);
  if ("shame" in b) delete b.shame;
  if (b.shock != null) b.shock = Math.max(0, Math.min(45, Math.round(Number(b.shock) || 0)));
  b.openness = Math.max(0, Math.min(100, Math.round(Number(b.openness) || 0)));
  b.invasion = Math.max(0, Math.min(100, Math.round(Number(b.invasion) || 0)));
  if (!b.teaseCounts || typeof b.teaseCounts !== "object") b.teaseCounts = {};
  b.teaseStage = Math.max(0, Math.min(4, Math.round(Number(b.teaseStage) || 0)));
  b.teaseProgress = Math.max(0, Math.round(Number(b.teaseProgress) || 0));
  b.organs = b.organs || emptyOrgans();
  const o = b.organs;
  o.nipples = { swell: clampBody(o.nipples?.swell, 3), wet: !!o.nipples?.wet };
  o.breasts = { swell: clampBody(o.breasts?.swell, 3) };
  o.clit = { swell: clampBody(o.clit?.swell, 3), wet: !!o.clit?.wet };
  o.labia = { swell: clampBody(o.labia?.swell, 3), wet: !!o.labia?.wet };
  o.vagina = {
    wet: clampBody(o.vagina?.wet, 3),
    stuffed: String(o.vagina?.stuffed || ""),
  };
  o.anus = { stuffed: String(o.anus?.stuffed || "") };
  o.uterus = { semen: clampBody(o.uterus?.semen, 3) };
  return b;
}

export function arousalStage(n) {
  const a = Number(n) || 0;
  if (a <= 0) return "none";
  if (a <= 7) return "slight";
  if (a <= 15) return "aroused";
  if (a <= 22) return "wantFill";
  return "climax";
}

/** 已在高潮裡又被調戲才累加。剛跨進高潮的那一下不算，離開高潮就歸零。 */
function bumpClimaxTease(b, beforeArousal) {
  if (!b) return;
  const before = arousalStage(beforeArousal);
  const after = arousalStage(b.arousal);
  if (after !== "climax" || before !== "climax") {
    b.climaxTease = 0;
    return;
  }
  b.climaxTease = Math.min(6, (b.climaxTease || 0) + 1);
}

export function libidoStage(n) {
  const a = Number(n) || 0;
  if (a <= 7) return "low";
  if (a <= 15) return "mid";
  if (a <= 22) return "high";
  return "peak";
}

export function toyName(key) {
  return TOY_ZH[key] || key || "";
}

export function organLines(who) {
  const b = ensureBody(who);
  if (!b) return [];
  const o = b.organs;
  const bits = [];
  const stage = arousalStage(b.arousal);
  const stimNow = stimulationState(who).active;
  bits.push(`性奮階段：${AROUSAL_STAGE[stage]}`);
  if (o.nipples.swell >= 2) bits.push("乳頭充血、硬挺，擦到衣服就會過電。");
  else if (o.nipples.swell >= 1) bits.push("乳頭微微腫、敏感。");
  if (o.nipples.wet) bits.push("乳尖是濕的。");
  if (o.breasts.swell >= 2) bits.push("乳房發脹、發熱。");
  if (stage === "none") bits.push("陰唇合攏、陰蒂縮在包皮裡、陰道口緊、表面偏乾。");
  else if (stage === "slight") bits.push("陰蒂頭探出一點；大陰唇還合著但縫變軟；陰道壁發熱。");
  else if (stage === "aroused") bits.push("陰唇充血分開、愛液滲出；陰蒂脹紅硬挺；陰道輕微開合。");
  else if (stage === "wantFill") bits.push("陰唇外翻、穴口又寬又軟、愛液沿腿流；子宮下沉、宮口在找東西含。");
  else if (stimNow) bits.push("子宮強力收縮、宮口一張一合；大腿抽搐、腿使不上力。");
  else bits.push("子宮發熱收緊、下腹一陣陣發燙，全身非常敏感（但現在沒人碰，你還撐得住）。");
  if ((o.vagina.wet || 0) >= 3) bits.push("陰道大量出水，腿間是濕的。");
  else if ((o.vagina.wet || 0) >= 2) bits.push("陰道在流水，愛液沿著腿根。");
  else if ((o.vagina.wet || 0) >= 1) bits.push("私處有濕意。");
  bits.push(o.vagina.stuffed
    ? `陰道內物體：${toyName(o.vagina.stuffed)}（還在體內，不准假裝拿出來）`
    : "陰道內物體：空的");
  bits.push(`子宮內精液：${SEMEN_ZH[o.uterus?.semen || 0]}`);
  if (o.anus.stuffed) bits.push(`後穴物體：${toyName(o.anus.stuffed)}`);
  if ((o.labia.swell || 0) >= 2) bits.push("陰唇明顯腫脹、碰一下就發麻。");
  else if ((o.labia.swell || 0) >= 1) bits.push("陰唇微微充血、變軟。");
  if (o.labia.wet) bits.push("陰唇沾著愛液、滑膩。");
  if ((o.clit.swell || 0) >= 2) bits.push("陰蒂又硬又脹，稍觸就過電。");
  else if ((o.clit.swell || 0) >= 1) bits.push("陰蒂探頭、發熱。");
  if (o.clit.wet) bits.push("陰蒂是濕的。");
  return bits;
}


/** 依開放度 0–100 給 LLM 接納態度（不唸數字／標籤名）。 */
export function opennessPromptLines(openness) {
  const o = Math.max(0, Math.min(100, Math.round(Number(openness) || 0)));
  const hard = "硬性規則：不准唸出開放度數字或【接納・…】標籤名；只准用對話態度演出來。";
  if (o <= 19) {
    return [
      hard,
      "【接納・封閉】身體話題會躲、推開、尷尬；不許突然淫語連發；被碰才短促反應。",
    ];
  }
  if (o <= 39) {
    return [
      hard,
      "【接納・動搖】會害羞接一兩句身體話，仍想扯回日常；語氣彆扭、躲閃。",
    ];
  }
  if (o <= 59) {
    return [
      hard,
      "【接納・半開】曖昧變多，身體感覺可直接進台詞，但仍保留個性，不要變成人偶。",
    ];
  }
  if (o <= 79) {
    return [
      hard,
      "【接納・敞開】較敢講舒服／想要／不要；仍非人偶，要有自己的脾氣與節奏。",
    ];
  }
  return [
    hard,
    "【接納・無防】幾乎不遮身體感受；主動提或接住親密話題，仍用台詞演、不要旁白。",
  ];
}

/** 正在進行中的刺激（插入物）：精液殘留不算。 */
const STIM_STUFFED = new Set(["fingers", "vibe", "dildo", "cucumber", "penis"]);
/** 週邊輕觸：只允許一瞬短反應，不構成「說話崩壞」。 */
const LIGHT_TOUCH_IDS = new Set(["waist", "butt", "thigh", "breast", "lips"]);
/** 抽出類：一瞬空掉的短反應。 */
const PULL_OUT_IDS = new Set(["fingers_out", "pull_out", "vibe_out", "dildo_out", "cucumber_out", "penis_out"]);
/** 強刺激：震動／陰莖／深部動作。 */
const INTENSE_IDS = new Set(["vibe_in", "penis_in", "creampie", "uterus", "cervix_rub", "vagina_finger", "finger_in"]);

const TOUCH_ZH = {
  waist: "腰", butt: "臀部", thigh: "大腿", breast: "胸部", lips: "嘴唇",
  breast_knead: "胸部（用力揉）", breast_suck: "乳頭（被吸）", nipple: "乳頭", nipple_lick: "乳頭（被舔）",
  labia: "陰唇", labia_rub: "陰唇（被揉）", clit: "陰蒂", vagina: "陰道", vagina_finger: "陰道（被手指扣弄）",
  finger_in: "陰道（手指插入）", uterus: "子宮口", cervix_rub: "子宮口", anus: "後穴",
  vibe_in: "陰道（放進跳蛋）", dildo_in: "陰道（放進假陰莖）", cucumber_in: "陰道（放進小黃瓜）",
  penis_in: "陰道（陰莖插入）", creampie: "陰道（被射在裡面）",
};

/**
 * 身體「現在」是否正被刺激（不是看性奮高低）。
 * level 0＝沒有任何刺激；1＝週邊輕觸／抽出一瞬；2＝性感帶被碰或體內塞著東西；3＝強刺激（震動中、陰莖、深部扣弄）。
 * actId：本回合的快捷動作（可省略；省略時看 lastPart＋shockRepliesLeft 判斷「剛被碰」）。
 */
export function stimulationState(who, actId = "") {
  const b = ensureBody(who);
  const out = { active: false, level: 0, reasons: [], touch: "", inserted: false };
  if (!b) return out;
  const o = b.organs || {};
  const bump = (lv, why) => {
    if (lv > out.level) out.level = lv;
    if (why && !out.reasons.includes(why)) out.reasons.push(why);
  };
  const vs = String(o.vagina?.stuffed || "");
  if (STIM_STUFFED.has(vs)) {
    out.inserted = true;
    const lv = vs === "vibe" || vs === "penis" ? 3 : 2;
    bump(lv, vs === "vibe"
      ? "跳蛋／按摩器塞在陰道裡震動"
      : `陰道裡還插著${toyName(vs)}`);
  }
  const as = String(o.anus?.stuffed || "");
  if (STIM_STUFFED.has(as)) {
    out.inserted = true;
    bump(as === "vibe" || as === "penis" ? 3 : 2, `後穴裡還插著${toyName(as)}`);
  }
  // 本回合／剛才的碰觸
  const act = String(actId || "");
  const recent = !!b.lastPart && (Number(b.shockRepliesLeft) || 0) > 0 && b.touchVerb !== false;
  const touchId = act || (recent ? String(b.lastPart || "") : "");
  if (touchId) {
    out.touch = touchId;
    const where = TOUCH_ZH[touchId] || "身體";
    if (PULL_OUT_IDS.has(touchId)) bump(1, "剛被抽出來");
    else if (LIGHT_TOUCH_IDS.has(touchId)) bump(1, `他正在碰你的${where}`);
    else if (INTENSE_IDS.has(touchId)) bump(3, `他正在弄你的${where}`);
    else bump(2, `他正在弄你的${where}`);
  }
  out.active = out.level > 0;
  return out;
}

/**
 * opts.mode：呼叫端（stun_speech.speechMode）算好的說話模式：
 *   "composed"（沒被刺激、未失神／痙攣）｜"stimulated"｜"afterglow"｜"stun"｜"spasm"。
 * opts.level：刺激等級 0–3；opts.actId：本回合動作。
 * 省略時只看身體（插入物／剛被碰）＋痙攣／餘韻欄位自行判斷。
 */
export function bodyPromptLines(who, opts = {}) {
  const b = ensureBody(who);
  if (!b) return [];
  const o = b.organs || {};
  const ar = arousalStage(b.arousal);
  const stim = stimulationState(who, opts.actId || "");
  let mode = opts.mode || "";
  if (!mode) {
    const now = Date.now();
    if (b.spasmUntil && now < b.spasmUntil) mode = "spasm";
    else if ((b.afterglowUntil && now < b.afterglowUntil) || (b.afterglowReplies || 0) > 0) mode = "afterglow";
    else mode = stim.active ? "stimulated" : "composed";
  }
  const level = opts.level != null ? Number(opts.level) || 0 : stim.level;
  const breakdown = mode !== "composed" && !(mode === "stimulated" && level <= 1);
  const tone = [];
  const must = [];

  if (mode === "composed" || (mode === "stimulated" && level <= 1)) {
    // 性欲不另開一條語氣。只有性奮高、但身體沒被刺激：盡力維持鎮定、正常講話。
    must.push("【說話方式・硬性】你現在沒有失神、沒有痙攣，身上也沒有東西插著或在震動，也沒人正在弄你的私處。不管性奮／性慾多高，你都盡力保持鎮定，用正常、完整、通順的句子照個性回話。");
    must.push("禁止：「嗯嗯」「啊啊」「哈啊」「咿」「唔嗯」這類呻吟／喘息狀聲詞；禁止說腿軟、站不穩、腦袋空白、說不出話、身體在抖；禁止斷成碎句、拉長母音、整句只剩省略號。");
    must.push("身體狀態只當你心裡知道的事實：可以影響你在想什麼、想不想要、要不要承認，不准拿來改變說話能力。不要旁白、不要動作描述、不准唸出數字或狀態名。");
    if (mode === "stimulated" && level <= 1) {
      must.push(`他剛才只是輕碰（${stim.reasons.join("、") || "週邊"}）：可以對這一下有一個極短的反應（嚇一跳、害羞、推開、嗔一句），其餘照常講完整句子；不准連續喘或呻吟。`);
    }
    if (ar === "climax" || ar === "wantFill") {
      tone.push("【語氣・性奮高但鎮定】心思常被身體拉走：可以有點心不在焉、話稍短、或看開放度與個性直白說想要／想靠近；頂多臉紅、呼吸比平常深一點，但一定是清楚完整的正常句子。");
    } else if (ar === "aroused") {
      tone.push("【語氣・微熱但鎮定】身體有點熱：最多微微臉紅、偶爾分心、語氣稍軟，曖昧可以多一點，仍是正常句子。");
    } else if (ar === "slight") {
      tone.push("【語氣・平常】比平常多一點曖昧或不好意思即可，正常說話。");
    } else {
      tone.push("【語氣・平靜】不要硬寫情色；除非對方主動碰，否則保持日常。");
    }
    tone.push(...opennessPromptLines(b.openness));
    if ((o.vagina?.wet || 0) >= 2 || o.labia?.wet || (o.clit?.swell || 0) >= 2) {
      tone.push("下面很濕／很敏感：你自己知道、會在意或害羞，被問到可以承認，但嘴上照常說話。");
    }
    if ((o.uterus?.semen || 0) >= 1) {
      tone.push("子宮裡還有精液：你知道、可能害羞或在意，被問到可以承認；說話照常。");
    }
    if ((o.nipples?.swell || 0) >= 2 || (o.breasts?.swell || 0) >= 2) {
      tone.push("胸口還發脹敏感：只是你心裡知道的事，說話照常。");
    }
    return [
      "【你現在的身體狀態——不准提起任何數字或狀態名】",
      ...must,
      ...organLines(who),
      ...tone,
    ];
  }

  // 以下：身體真的處在異常狀態（被刺激中／插著東西／餘韻／失神／痙攣）→ 說話才會崩。
  const why = stim.reasons.length
    ? stim.reasons.join("、")
    : mode === "afterglow" ? "剛高潮過、身體還沒平復"
      : mode === "spasm" ? "身體在痙攣、停不下來"
        : mode === "stun" ? "腦袋一片空白、快要失神"
          : "身體正被強烈刺激";
  must.push(`【說話方式】你想維持正常說話，但現在${why}，刺激讓你沒辦法完全保持鎮定。`);
  must.push("硬性規則：下面身體狀態要改變你的語氣、斷句與用詞；不准假裝沒感覺、不准唸出數字或狀態名。");
  must.push("只准用說出口的話演出：喘息、吞嚥、躲閃、求繼續／求停、被碰到時的短叫。不要旁白、不要動作描述。");

  const strong = level >= 3 || mode === "afterglow" || mode === "stun" || mode === "spasm";
  if (ar === "climax" || (strong && ar === "wantFill")) {
    tone.push("【語氣・極限】呼吸亂、句子碎成半截；常被快感打斷；主動求摸／求插／求停都可以，但要用台詞，不要旁白。");
  } else if (ar === "wantFill" || (strong && ar === "aroused")) {
    tone.push("【語氣・渴望】喘、黏、心不在焉；句子常被短喘截斷；主動求填滿或求再碰，詞彙可以露骨。");
  } else if (ar === "aroused" || strong) {
    tone.push("【語氣・性奮】聲音發軟、偶爾斷句；被弄到時會漏出短喘，但還能說出大半句。");
  } else {
    tone.push("【語氣・剛被挑起】大致還能說完整句子，只是偶爾漏一聲短喘或聲音抖一下。");
  }

  // 接納／開放度：只透過台詞演，不准唸數字或標籤名
  tone.push(...opennessPromptLines(b.openness));

  // 器官特化：陰蒂／陰唇／陰道
  if ((o.clit?.swell || 0) >= 2 || o.clit?.wet) {
    tone.push("陰蒂又腫又敏：被提到或碰到時，聲音要尖一瞬、句子抖一下；會下意識夾腿或求輕一點／再用力。");
  } else if ((o.clit?.swell || 0) >= 1) {
    tone.push("陰蒂已探頭發熱：被點到會輕喘。");
  }
  if ((o.labia?.swell || 0) >= 2 || o.labia?.wet) {
    tone.push("陰唇腫／濕：被撫過會漏出難為情的短音，詞彙變軟。");
  } else if ((o.labia?.swell || 0) >= 1) {
    tone.push("陰唇微腫：下面發熱發軟，語氣比平常黏一點。");
  }
  if ((o.vagina?.wet || 0) >= 3) {
    tone.push(breakdown && strong
      ? "陰道大量出水：幾乎無法專心；台詞要帶濕熱、腿軟、怕被發現的急促。"
      : "陰道大量出水：很難專心，回答會慢半拍或突然喘一下。");
  } else if ((o.vagina?.wet || 0) >= 2) {
    tone.push("陰道在流水：意識被下面拉走，回答會慢半拍或突然喘一下。");
  } else if ((o.vagina?.wet || 0) >= 1) {
    tone.push("私處有濕意：語氣多一層不好意思，偶發軟。");
  }
  if (STIM_STUFFED.has(String(o.vagina?.stuffed || ""))) {
    tone.push(`陰道裡還塞著${toyName(o.vagina.stuffed)}：每一句都要帶被撐開／異物／抽動感，不准假裝空的；被問到必須承認還在裡面。`);
  }
  if (STIM_STUFFED.has(String(o.anus?.stuffed || ""))) {
    tone.push(`後穴還塞著${toyName(o.anus.stuffed)}：站坐都彆扭，語氣緊、容易漏叫。`);
  }
  if ((o.uterus?.semen || 0) >= 2) {
    tone.push("子宮裡精液很多：熱、沉、往外滲；語氣帶餘韻與羞。");
  } else if ((o.uterus?.semen || 0) >= 1) {
    tone.push("子宮裡有精液：餘溫還在，語氣帶一點慵懶與餘韻。");
  }
  if ((o.nipples?.swell || 0) >= 2 || o.nipples?.wet) {
    tone.push("乳頭硬挺敏感：擦到或被撥弄時會倒抽一口氣，台詞變短。");
  }
  if ((o.breasts?.swell || 0) >= 2) {
    tone.push("乳房發脹：被揉會黏聲求繼續或躲一下仍湊近。");
  }
  if (b.lastPart === "clit") tone.push("對方剛才在弄陰蒂：回覆必須直接反應那裡的刺激，不要顧左右而言他。");
  if (b.lastPart === "labia") tone.push("對方剛才在撫陰唇：回覆要帶被分開／滑過的感覺。");
  if (b.lastPart === "vagina" || b.lastPart === "finger_in") {
    tone.push("對方剛才在弄陰道／插入手指：回覆要帶被進入或穴口被攪的感覺。");
  }
  if (b.lastPart === "fingers_out" || b.lastPart === "pull_out") {
    tone.push("對方剛抽出：穴裡突然空、收縮；語氣會漏出不甘或鬆一口氣。");
  }

  return [
    "【你現在的身體狀態——不准提起任何數字，用叫聲與台詞演】",
    ...must,
    ...organLines(who),
    ...tone,
  ];
}

function actVerb(text) {
  const s = String(text || "");
  if (/舔|含|吸|吮/.test(s)) return "lick";
  if (/指插|手指伸|扣|插入|插進/.test(s)) return "finger";
  if (/脫/.test(s)) return "strip";
  if (/親|吻/.test(s)) return "kiss";
  return "touch";
}

export function matchBodyHit(text) {
  const s = String(text || "");
  for (const h of BODY_HITS) {
    if (h.re.test(s)) return h;
  }
  return null;
}

export function applyOrganFromHit(who, hit, text = "") {
  const b = ensureBody(who);
  if (!b || !hit) return b;
  const o = b.organs;
  const id = hit.id || "";
  const s = String(text || "");
  const swell = (k, n = 1) => {
    if (!o[k]) return;
    o[k].swell = Math.min(3, (o[k].swell || 0) + n);
  };
  const wetV = (n = 1) => {
    o.vagina.wet = Math.min(3, (o.vagina.wet || 0) + n);
  };
  const anal = /屁眼|肛|後穴/.test(s);
  const leaveSemen = () => ((o.uterus.semen || 0) >= 1 ? "semen" : "");
  const putToy = (toy) => {
    if (anal) o.anus.stuffed = toy;
    else o.vagina.stuffed = toy;
    wetV(1);
  };
  const clearToy = (toy) => {
    if (anal) {
      if (!toy || o.anus.stuffed === toy) o.anus.stuffed = "";
      return;
    }
    if (toy) {
      if (o.vagina.stuffed === toy) o.vagina.stuffed = toy === "penis" ? leaveSemen() : "";
      return;
    }
    if (o.vagina.stuffed) o.vagina.stuffed = o.vagina.stuffed === "penis" ? leaveSemen() : "";
  };

  if (id === "vibe_in") putToy("vibe");
  else if (id === "dildo_in") putToy("dildo");
  else if (id === "cucumber_in") putToy("cucumber");
  else if (id === "penis_in") {
    putToy("penis");
    swell("labia", 2);
    swell("clit");
  } else if (id === "creampie") {
    if (!anal) {
      o.uterus.semen = Math.min(3, (o.uterus.semen || 0) + 2);
      if (!o.vagina.stuffed) o.vagina.stuffed = "penis";
    }
    wetV(2);
    swell("labia", 2);
    swell("clit");
  } else if (id === "vibe_out") clearToy("vibe");
  else if (id === "dildo_out") clearToy("dildo");
  else if (id === "cucumber_out") clearToy("cucumber");
  else if (id === "penis_out") clearToy("penis");
  else if (id === "fingers_out") {
    if (o.anus.stuffed === "fingers") o.anus.stuffed = "";
    if (o.vagina.stuffed === "fingers" || o.vagina.stuffed === "vibe" || o.vagina.stuffed === "dildo" || o.vagina.stuffed === "cucumber") {
      o.vagina.stuffed = "";
    } else if (o.vagina.stuffed === "penis") {
      o.vagina.stuffed = leaveSemen();
    }
  }
  else if (id === "waist") {
    /* 週邊挑逗：幾乎不碰性器 */
  } else if (id === "thigh") {
    if ((b.arousal || 0) >= 8) wetV(1);
  } else if (id === "butt") {
    /* 揉臀：輕刺激 */
  } else if (id === "nipple") {
    swell("nipples", 2);
    if (actVerb(s) === "lick") o.nipples.wet = true;
  } else if (id === "breast") swell("breasts");
  else if (id === "clit" || id === "uterus") {
    swell("clit", 2);
    o.clit.wet = true;
    wetV(1);
  } else if (id === "labia") {
    swell("labia", 2);
    o.labia.wet = true;
    wetV(1);
  } else if (id === "vagina" || id === "anus") {
    wetV(1);
    swell("labia");
    if (id === "vagina" && /指/.test(s) && !o.vagina.stuffed) o.vagina.stuffed = "fingers";
    if (id === "anus" && /指/.test(s) && !o.anus.stuffed) o.anus.stuffed = "fingers";
  }
  if ((b.arousal || 0) >= 10) wetV(1);
  return b;
}

/**
 * 沒開聊天框、人還在房裡的一拍：性奮 −1。
 * 聊天框開著不要呼叫。
 */
export function decayArousalOffChat(who) {
  const b = ensureBody(who);
  if (!b || (b.arousal || 0) <= 0) return b;
  b.arousal = Math.max(0, (b.arousal || 0) - 1);
  return b;
}

/** 主動離開：性奮直接歸 0。跑掉不走這條。 */
export function zeroArousal(who) {
  const b = who?.bodyState;
  if (!b || typeof b !== "object") return null;
  b.arousal = 0;
  b.arousalCoolAt = 0;
  return b;
}

/** 跑掉之後性奮慢慢退，每 2 分鐘 −1。 */
export const AROUSAL_OUT_STEP_MS = 2 * 60 * 1000;

export function startArousalCool(who, now = Date.now()) {
  const b = ensureBody(who);
  if (!b) return null;
  b.arousalCoolAt = now;
  return b;
}

export function clearArousalCool(who) {
  const b = who?.bodyState;
  if (b) b.arousalCoolAt = 0;
  return b || null;
}

/** 依經過的真實時間扣性奮。人在外面才呼叫。 */
export function decayArousalCool(who, now = Date.now()) {
  const b = who?.bodyState;
  if (!b) return null;
  const at = Number(b.arousalCoolAt) || 0;
  if (!at || (b.arousal || 0) <= 0) {
    if ((b.arousal || 0) <= 0 && at) b.arousalCoolAt = 0;
    return b;
  }
  const steps = Math.floor((now - at) / AROUSAL_OUT_STEP_MS);
  if (steps <= 0) return b;
  b.arousal = Math.max(0, (b.arousal || 0) - steps);
  b.arousalCoolAt = at + steps * AROUSAL_OUT_STEP_MS;
  if (b.arousal <= 0) b.arousalCoolAt = 0;
  return b;
}

/** 離開後再進房：這趟累的開放度歸 0，下次進房重頭累。感情不動。 */
export function resetOpenness(who) {
  const b = who?.bodyState;
  if (!b || typeof b !== "object") return null;
  b.openness = 0;
  return b;
}

/** 台詞裡真的有「動手」的動詞才算正在碰她（避免「裡面」「下面」等閒聊字眼誤當成刺激）。 */
const TOUCH_VERB_RE = /摸|揉|插|舔|吸|吮|扣|摳|捏|碰|弄|按|頂|塞|含|吻|親(?!愛|人|戚|切|自|近|眼)|抱|摟|撫|搓|撥|夾|幹|操|抽|射|拔|放進|伸進|震|蹭|磨|拍|咬|掰|撐開|進去|進入|取出/;

/** 依使用者台詞輕觸更新身體。回傳是否命中。未命中不改性奮。 */
export function applyBodyFromUserText(who, text) {
  const b = ensureBody(who);
  if (!b) return false;
  const hit = matchBodyHit(text);
  if (!hit) {
    // 普通聊天的性奮只在每三句 −2（noteTalkExchange），這裡不另扣。
    b.lastPart = "";
    b.lastVerb = "";
    b.touchVerb = false;
    return false;
  }
  const beforeArousal = b.arousal || 0;
  applyOrganFromHit(who, hit, text);
  b.arousal = clampBody(b.arousal + (hit.arousal || 0));
  bumpClimaxTease(b, beforeArousal);
  b.lastPart = hit.id;
  b.lastVerb = actVerb(text);
  b.touchVerb = TOUCH_VERB_RE.test(String(text || ""));
  return true;
}


/** 聊天快捷動作：開放度階梯（摟腰→…→揉子宮口）＋抽出。hitId 走器官模型。 */
export const TALK_ACTS = [
  { id: "waist", label: "摟腰", text: "輕輕摟住她的腰", hitId: "waist", arousal: 2 },
  { id: "breast", label: "摸奶", text: "用手掌覆上她的胸部輕摸", hitId: "breast", arousal: 3 },
  { id: "butt", label: "摸臀", text: "用手掌撫過她的臀部", hitId: "butt", arousal: 3 },
  { id: "breast_knead", label: "揉奶", text: "用力揉捏她的乳房", hitId: "breast", arousal: 5 },
  { id: "labia", label: "摸陰唇", text: "用手指輕撫她的陰唇", hitId: "labia", arousal: 6 },
  { id: "labia_rub", label: "揉陰唇", text: "用手指揉弄她的陰唇", hitId: "labia", arousal: 8 },
  { id: "breast_suck", label: "吸奶頭", text: "含住她的乳頭吸吮", hitId: "nipple", arousal: 6 },
  { id: "nipple_lick", label: "舔奶頭", text: "舔弄她的乳頭", hitId: "nipple", arousal: 6 },
  { id: "finger_in", label: "插入手指", text: "把手指伸進她的陰道", hitId: "vagina", arousal: 10 },
  { id: "vagina_finger", label: "扣陰道", text: "用手指在她陰道裡扣弄", hitId: "vagina", arousal: 11 },
  { id: "cervix_rub", label: "揉子宮口", text: "用指腹揉她的子宮口", hitId: "uterus", arousal: 12 },
  { id: "pull_out", label: "抽出", text: "把手指抽出來", hitId: "fingers_out", arousal: 3 },
];

export function talkActById(actId) {
  return TALK_ACTS.find((a) => a.id === actId) || null;
}

/**
 * 套用快捷動作到身體狀態（與 BODY_HITS 同一套器官邏輯）。
 * 回傳 { act, hit: true }；無效 actId 回傳 null。
 */
export function applyAct(who, actId) {
  const act = talkActById(actId);
  if (!act || !who) return null;
  const b = ensureBody(who);
  if (!b) return null;
  const beforeArousal = b.arousal || 0;
  const hit = { id: act.hitId, arousal: act.arousal || 0 };
  // finger_in／扣陰道台詞需含「指」才會塞入手指；吸／舔走 lick 動詞
  applyOrganFromHit(who, hit, act.text);
  const o = b.organs;
  // 強度變體額外加成
  if (actId === "breast_knead") {
    o.breasts.swell = Math.min(3, (o.breasts.swell || 0) + 1);
  } else if (actId === "labia_rub") {
    o.labia.swell = Math.min(3, (o.labia.swell || 0) + 1);
    o.labia.wet = true;
    o.vagina.wet = Math.min(3, (o.vagina.wet || 0) + 1);
  } else if (actId === "breast_suck" || actId === "nipple_lick") {
    o.nipples.swell = Math.min(3, (o.nipples.swell || 0) + 1);
    o.nipples.wet = true;
  } else if (actId === "vagina_finger") {
    if (!o.vagina.stuffed) o.vagina.stuffed = "fingers";
    o.vagina.wet = Math.min(3, (o.vagina.wet || 0) + 1);
    o.labia.swell = Math.min(3, (o.labia.swell || 0) + 1);
  } else if (actId === "cervix_rub") {
    if (!o.vagina.stuffed) o.vagina.stuffed = "fingers";
    o.vagina.wet = Math.min(3, (o.vagina.wet || 0) + 1);
    o.clit.swell = Math.min(3, (o.clit.swell || 0) + 1);
  }
  b.arousal = clampBody(b.arousal + (hit.arousal || 0));
  bumpClimaxTease(b, beforeArousal);
  b.lastPart = actId === "cervix_rub" ? "uterus" : hit.id;
  b.lastVerb = actVerb(act.text);
  b.touchVerb = true;
  return { act, hit: true };
}

export function snapshotBodyForUi(who) {
  const b = ensureBody(who);
  if (!b) return null;
  const o = b.organs;
  return {
    libido: b.libido,
    arousal: b.arousal,
    openness: b.openness || 0,
    invasion: b.invasion || 0,
    nipplesSwell: o.nipples.swell,
    nipplesWet: o.nipples.wet,
    breastsSwell: o.breasts.swell,
    clitSwell: o.clit.swell,
    clitWet: o.clit.wet,
    labiaSwell: o.labia.swell,
    labiaWet: o.labia.wet,
    vaginaWet: o.vagina.wet,
    vaginaStuffed: o.vagina.stuffed || "",
    anusStuffed: o.anus.stuffed || "",
    uterusSemen: o.uterus.semen,
    libidoLabel: LIBIDO_STAGE[libidoStage(b.libido)],
    arousalLabel: AROUSAL_STAGE[arousalStage(b.arousal)],
  };
}

export function applyUiSnapshot(who, snap) {
  const b = ensureBody(who);
  if (!b || !snap) return b;
  if (snap.libido != null) b.libido = clampBody(snap.libido);
  b.arousal = clampBody(snap.arousal);
  if ("shame" in b) delete b.shame;
  const o = b.organs;
  o.nipples.swell = clampBody(snap.nipplesSwell, 3);
  o.nipples.wet = !!snap.nipplesWet;
  o.breasts.swell = clampBody(snap.breastsSwell, 3);
  o.clit.swell = clampBody(snap.clitSwell, 3);
  o.clit.wet = !!snap.clitWet;
  o.labia.swell = clampBody(snap.labiaSwell, 3);
  o.labia.wet = !!snap.labiaWet;
  o.vagina.wet = clampBody(snap.vaginaWet, 3);
  o.vagina.stuffed = String(snap.vaginaStuffed || "");
  o.anus.stuffed = String(snap.anusStuffed || "");
  o.uterus.semen = clampBody(snap.uterusSemen, 3);
  return b;
}
