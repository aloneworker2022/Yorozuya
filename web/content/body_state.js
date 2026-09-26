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
  { re: /屁股|臀部/, id: "butt", arousal: 6 },
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
  b.libido = clampBody(b.libido == null ? libidoSeedFromGirl(who) : b.libido);
  if ("shame" in b) delete b.shame;
  if (b.shock != null) b.shock = Math.max(0, Math.min(45, Math.round(Number(b.shock) || 0)));
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
  bits.push(`性奮階段：${AROUSAL_STAGE[stage]}`);
  bits.push(`性欲底色：${LIBIDO_STAGE[libidoStage(b.libido)]}`);
  if (o.nipples.swell >= 2) bits.push("乳頭充血、硬挺，擦到衣服就會過電。");
  else if (o.nipples.swell >= 1) bits.push("乳頭微微腫、敏感。");
  if (o.nipples.wet) bits.push("乳尖是濕的。");
  if (o.breasts.swell >= 2) bits.push("乳房發脹、發熱。");
  if (stage === "none") bits.push("陰唇合攏、陰蒂縮在包皮裡、陰道口緊、表面偏乾。");
  else if (stage === "slight") bits.push("陰蒂頭探出一點；大陰唇還合著但縫變軟；陰道壁發熱。");
  else if (stage === "aroused") bits.push("陰唇充血分開、愛液滲出；陰蒂脹紅硬挺；陰道輕微開合。");
  else if (stage === "wantFill") bits.push("陰唇外翻、穴口又寬又軟、愛液沿腿流；子宮下沉、宮口在找東西含。");
  else bits.push("子宮強力收縮、宮口一張一合；大腿抽搐、腿使不上力。");
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

export function bodyPromptLines(who) {
  const b = ensureBody(who);
  if (!b) return [];
  const o = b.organs || {};
  const lib = libidoStage(b.libido);
  const ar = arousalStage(b.arousal);
  const tone = [];
  const must = [];

  // 總規則：身體狀態必須改寫語氣與用詞，不准當沒感覺。
  must.push("硬性規則：下面身體狀態必須改變你的語氣、斷句與用詞；不准平淡回話、不准假裝沒感覺、不准唸出數字或狀態名。");
  must.push("只准用說出口的話演出：喘息、吞嚥、躲閃、求繼續／求停、被碰到時的短叫。不要旁白、不要動作描述。");

  if (lib === "peak" || ar === "climax") {
    tone.push("【語氣・極限】呼吸亂、句子碎成半截；常被快感打斷；主動求摸／求插／求停都可以，但要用台詞，不要旁白。");
  } else if (ar === "wantFill" || lib === "high") {
    tone.push("【語氣・渴望】喘、黏、心不在焉；會把話題拐回身體；主動求填滿或求再碰，詞彙可以露骨。");
  } else if (ar === "aroused" || lib === "mid") {
    tone.push("【語氣・性奮】帶黏與散漫，聲音發軟；偶爾露骨，但仍壓著一點；被碰到會漏出短喘。");
  } else if (ar === "slight" || lib === "mid") {
    tone.push("【語氣・微熱】比平常多曖昧與不好意思；身體感若有若無，碰到敏感處才明顯。");
  } else {
    tone.push("【語氣・平靜】不要硬寫情色；除非對方主動碰，否則保持日常。一旦被碰，立刻讓狀態進台詞。");
  }

  // 器官特化：陰蒂／陰唇／陰道
  if ((o.clit?.swell || 0) >= 2 || o.clit?.wet) {
    tone.push("陰蒂又腫又敏：被提到或碰到時，聲音要尖一瞬、句子抖一下；會下意識夾腿或求輕一點／再用力。");
  } else if ((o.clit?.swell || 0) >= 1) {
    tone.push("陰蒂已探頭發熱：談話中心思容易飄到那裡，被點到會輕喘。");
  }
  if ((o.labia?.swell || 0) >= 2 || o.labia?.wet) {
    tone.push("陰唇腫／濕：說話帶悶熱與滑膩感；被撫過會漏出難為情的短音，詞彙變軟。");
  } else if ((o.labia?.swell || 0) >= 1) {
    tone.push("陰唇微腫：下面發熱發軟，語氣比平常黏一點。");
  }
  if ((o.vagina?.wet || 0) >= 3) {
    tone.push("陰道大量出水：幾乎無法專心；台詞要帶濕熱、腿軟、怕被發現的急促。");
  } else if ((o.vagina?.wet || 0) >= 2) {
    tone.push("陰道在流水：意識被下面拉走，回答會慢半拍或突然喘一下。");
  } else if ((o.vagina?.wet || 0) >= 1) {
    tone.push("私處有濕意：語氣多一層不好意思，偶發軟。");
  }
  if (o.vagina?.stuffed) {
    tone.push(`陰道裡還塞著${toyName(o.vagina.stuffed)}：每一句都要帶被撐開／異物／抽動感，不准假裝空的；被問到必須承認還在裡面。`);
  }
  if (o.anus?.stuffed) {
    tone.push(`後穴還塞著${toyName(o.anus.stuffed)}：站坐都彆扭，語氣緊、容易漏叫。`);
  }
  if ((o.uterus?.semen || 0) >= 2) {
    tone.push("子宮裡精液很多：熱、沉、往外滲；語氣帶餘韻與羞、腿心發軟。");
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
  else if (id === "nipple") {
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

/** 依使用者台詞輕觸更新身體＋性慾。回傳是否命中。 */
export function applyBodyFromUserText(who, text) {
  const b = ensureBody(who);
  if (!b) return false;
  const hit = matchBodyHit(text);
  if (!hit) {
    // 閒聊：性奮略降
    b.arousal = clampBody(b.arousal - 1);
    b.lastPart = "";
    b.lastVerb = "";
    return false;
  }
  applyOrganFromHit(who, hit, text);
  b.arousal = clampBody(b.arousal + (hit.arousal || 0));
  b.lastPart = hit.id;
  b.lastVerb = actVerb(text);
  // 高性欲底色：被碰到時更容易再往上衝
  if (b.libido >= 16) b.arousal = clampBody(b.arousal + 2);
  return true;
}


/** 聊天快捷動作：按鈕標籤＋玩家可見台詞；hitId 直接走器官模型（避開台詞誤匹配）。 */
export const TALK_ACTS = [
  { id: "clit", label: "摸陰蒂", text: "輕輕揉弄她的陰蒂", hitId: "clit", arousal: 11 },
  { id: "labia", label: "撫陰唇", text: "用手指撫過她的陰唇", hitId: "labia", arousal: 10 },
  { id: "vagina", label: "愛撫陰道", text: "愛撫她的陰道口", hitId: "vagina", arousal: 10 },
  { id: "finger_in", label: "插入手指", text: "把手指伸進她的陰道", hitId: "vagina", arousal: 12 },
  { id: "pull_out", label: "抽出", text: "把手指抽出來", hitId: "fingers_out", arousal: 3 },
  { id: "breast", label: "揉胸", text: "揉她的胸部", hitId: "breast", arousal: 6 },
  { id: "nipple", label: "撥弄乳頭", text: "撥弄她的乳頭", hitId: "nipple", arousal: 9 },
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
  const hit = { id: act.hitId, arousal: act.arousal || 0 };
  // finger_in 台詞需含「指」才會塞入手指
  applyOrganFromHit(who, hit, act.text);
  b.arousal = clampBody(b.arousal + (hit.arousal || 0));
  b.lastPart = hit.id;
  b.lastVerb = actVerb(act.text);
  if (b.libido >= 16) b.arousal = clampBody(b.arousal + 2);
  return { act, hit: true };
}

export function snapshotBodyForUi(who) {
  const b = ensureBody(who);
  if (!b) return null;
  const o = b.organs;
  return {
    libido: b.libido,
    arousal: b.arousal,
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
  b.libido = clampBody(snap.libido);
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
