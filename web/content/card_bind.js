// 卡牌文案 ↔ 當前女子綁定
// sceneStart / promptHint / 詞墜說明可寫 [name] [eye] [breast] …
// 出卡時用實際人設替換，讓 AI／生圖知道「在跟誰、碰哪裡」。

/** 編輯器提示用 */
export const BIND_PLACEHOLDERS = [
  { key: "name", aliases: ["她", "girl", "her"], sample: "小夜", desc: "女子名字" },
  { key: "player", aliases: ["你", "him", "playername", "召喚師"], sample: "你", desc: "玩家／召喚師名" },
  { key: "eye", aliases: ["eyes", "瞳", "眼睛"], sample: "赤紅色的眼睛", desc: "眼睛外貌" },
  { key: "breast", aliases: ["bust", "chest", "胸", "胸部", "乳房", "奶"], sample: "豐滿的胸部", desc: "胸部／罩杯敘述" },
  { key: "nipple", aliases: ["nipples", "乳頭", "奶頭"], sample: "粉嫩、微微凸起的乳頭", desc: "乳頭" },
  { key: "areola", aliases: ["areolae", "乳暈"], sample: "淺粉的乳暈", desc: "乳暈" },
  { key: "labia", aliases: ["pussy", "陰唇", "小穴", "私處"], sample: "內收小巧的陰唇", desc: "陰唇" },
  { key: "clit", aliases: ["clitoris", "陰蒂"], sample: "明顯可見的陰蒂", desc: "陰蒂" },
  { key: "pubic", aliases: ["pubic_hair", "陰毛"], sample: "稀疏細軟的陰毛", desc: "陰毛" },
  { key: "butt", aliases: ["ass", "hip", "hips", "臀", "臀部", "屁股"], sample: "圓潤的臀部", desc: "臀部" },
  { key: "waist", aliases: ["腰", "腰身"], sample: "纖細的腰", desc: "腰" },
  { key: "thigh", aliases: ["thighs", "腿", "大腿"], sample: "修長的大腿", desc: "腿" },
  { key: "hair", aliases: ["髮", "頭髮"], sample: "黑色長直髮", desc: "髮型（可含髮色）" },
  { key: "face", aliases: ["臉", "臉型"], sample: "鵝蛋臉", desc: "臉型" },
  { key: "mouth", aliases: ["唇", "嘴", "嘴唇"], sample: "薄唇", desc: "嘴巴" },
  { key: "body", aliases: ["build", "身材", "體型"], sample: "纖細", desc: "體型" },
  { key: "job", aliases: ["occupation", "職業", "工作"], sample: "護理師", desc: "職業" },
  { key: "age", aliases: ["歲", "年齡"], sample: "24", desc: "年齡" },
  { key: "look", aliases: ["外貌", "appearance"], sample: "黑髮、紅瞳…", desc: "外貌一句摘要" },
  { key: "outfit", aliases: ["衣服", "服裝", "career"], sample: "護士服", desc: "當前／生涯服裝" },
];

const ALIAS_TO_KEY = (() => {
  const m = Object.create(null);
  for (const p of BIND_PLACEHOLDERS) {
    m[p.key.toLowerCase()] = p.key;
    for (const a of p.aliases || []) m[String(a).toLowerCase()] = p.key;
  }
  return m;
})();

function pickStr(...vals) {
  for (const v of vals) {
    if (v == null) continue;
    const s = String(v).trim();
    if (s) return s;
  }
  return "";
}

function lookOf(girl) {
  if (!girl) return {};
  // 存檔魅魔 / buildCtx.character / 編輯器 girlCache
  return girl.look || girl.character?.look || {};
}

function nameOf(girl) {
  return pickStr(girl?.name, girl?.character?.name, "她") || "她";
}

function hairLine(L) {
  const color = pickStr(L.hair_color, L.hairColor);
  const shape = pickStr(L.hair);
  if (color && shape) {
    // 若 shape 已含顏色字就不再疊
    if (shape.includes(color) || /色|黑|白|金|銀|紅|棕|藍|紫|粉/.test(shape)) return shape;
    return `${color}的${shape}`;
  }
  return shape || color || "";
}

function lookSummary(L, girl) {
  const parts = [
    hairLine(L),
    pickStr(L.eyes),
    pickStr(L.bust),
    pickStr(L.build),
    pickStr(L.face),
  ].filter(Boolean);
  if (parts.length) return parts.join("、");
  return pickStr(girl?.appearance_dna, girl?.dna, "成年女性外貌");
}

/**
 * 從魅魔物件（或 character 形狀）組綁定表。
 * @param {object} girl
 * @param {string} [playerName]
 */
export function bindContextFromGirl(girl, playerName = "你") {
  const L = lookOf(girl);
  const name = nameOf(girl);
  const job = pickStr(
    girl?.job,
    girl?.occupation,
    girl?.character?.job,
    girl?.character?.occupation,
    girl?.jobDesc,
    girl?.job_desc,
  );
  const age = pickStr(
    girl?.age,
    L.age,
    girl?.character?.age,
    girl?.look?.age,
  );
  const outfit = pickStr(
    L.career_outfit,
    L.style,
    girl?.outfit,
    Array.isArray(L.wardrobe) ? L.wardrobe[0] : "",
  );
  const eye = pickStr(L.eyes, "她的眼睛");
  const breast = pickStr(L.bust, [L.cup, L.breast_shape].filter(Boolean).join("、"), "她的胸部");
  const nipple = pickStr(L.nipple, "她的乳頭");
  const areola = pickStr(L.areola, "她的乳暈");
  const labia = pickStr(
    [L.labia_size, L.labia_color].filter(Boolean).join("、"),
    L.labia,
    "她的陰唇",
  );
  const clit = pickStr(L.clitoris_size, L.clit, "她的陰蒂");
  const pubic = pickStr(L.pubic_hair, L.pubic, "她的陰毛");
  const body = pickStr(L.build, "她的身材");
  const butt = pickStr(L.butt, L.hips, body ? `${body}的臀部` : "", "她的臀部");
  const waist = pickStr(L.waist, body ? `${body}的腰` : "", "她的腰");
  const thigh = pickStr(L.thigh, L.thighs, body ? `${body}的大腿` : "", "她的大腿");
  const hair = hairLine(L) || "她的頭髮";
  const face = pickStr(L.face, "她的臉");
  const mouth = pickStr(L.mouth, "她的嘴唇");
  const look = lookSummary(L, girl);

  return {
    name,
    player: pickStr(playerName, "你") || "你",
    eye,
    eyes: eye,
    breast,
    bust: breast,
    chest: breast,
    nipple,
    areola,
    labia,
    clit,
    clitoris: clit,
    pubic,
    pubic_hair: pubic,
    butt,
    ass: butt,
    hip: butt,
    hips: butt,
    waist,
    thigh,
    thighs: thigh,
    hair,
    face,
    mouth,
    body,
    build: body,
    job: job || "—",
    occupation: job || "—",
    age: age || "成年",
    look,
    outfit: outfit || "便服",
    // 給 prompt 用的鎖定句
    who_line: `此刻對象是「${name}」（${age || "成年"}歲${job ? "·" + job : ""}；外貌：${look}）。對方／玩家叫「${pickStr(playerName, "你")}」。`,
  };
}

/**
 * 把文案裡的 [name] [eye] {breast} 等換成實際值。
 * 未知 key 原樣保留，方便之後加欄位。
 */
export function resolveCardBinds(text, ctx) {
  if (text == null || text === "") return text || "";
  if (!ctx || typeof ctx !== "object") return String(text);
  const map = Object.create(null);
  for (const [k, v] of Object.entries(ctx)) {
    if (v == null) continue;
    map[String(k).toLowerCase()] = String(v);
  }
  // 同義鍵
  if (map.eye && !map.eyes) map.eyes = map.eye;
  if (map.breast) {
    map.bust = map.bust || map.breast;
    map.chest = map.chest || map.breast;
  }
  if (map.labia) map.pussy = map.pussy || map.labia;
  if (map.clit) map.clitoris = map.clitoris || map.clit;
  if (map.butt) {
    map.ass = map.ass || map.butt;
    map.hip = map.hip || map.butt;
    map.hips = map.hips || map.butt;
  }

  const replacer = (_, raw) => {
    const key = String(raw).trim().toLowerCase();
    const canon = ALIAS_TO_KEY[key] || key;
    const val = map[canon] ?? map[key];
    if (val != null && val !== "") return val;
    return `[${raw}]`; // 找不到就留著，方便除錯
  };

  let s = String(text);
  s = s.replace(/\[([^\]\n]{1,32})\]/g, replacer);
  s = s.replace(/\{([^{}\n]{1,32})\}/g, replacer);
  return s;
}

/** 旁白／提示是否含綁定位 */
export function listBindsInText(text) {
  const found = new Set();
  const s = String(text || "");
  for (const m of s.matchAll(/[\[{]([^\]}\n]{1,32})[\]}]/g)) {
    const key = String(m[1]).trim().toLowerCase();
    found.add(ALIAS_TO_KEY[key] || key);
  }
  return [...found];
}

/**
 * 給 AI 的「你是誰、對方是誰」短塊（中文）。
 */
/** testdate 身體命中 id → 要用的綁定位 */
export const HIT_BIND_KEYS = {
  breast: ["breast"],
  nipple: ["nipple", "areola", "breast"],
  labia: ["labia", "clit", "pubic"],
  clit: ["clit", "labia"],
  vagina: ["labia", "clit"],
  uterus: ["labia"],
  butt: ["butt"],
  anus: ["butt"],
  anus_finger: ["butt"],
  lips: ["mouth"],
  kiss: ["mouth"],
  bra_off: ["breast"],
  top_off: ["breast"],
  panties_off: ["labia", "butt", "pubic"],
  bottoms_off: ["labia", "butt"],
  nude: ["breast", "labia", "butt"],
  flash: ["breast", "labia", "butt"],
  seen: ["labia", "breast"],
  seen_lewd: ["labia", "breast", "butt"],
  underwear: ["breast", "labia"],
  waist: ["waist"],
  thigh: ["thigh"],
  body: ["body"],
};

const PART_BIND_ZH = {
  breast: "胸部",
  nipple: "乳頭",
  areola: "乳暈",
  labia: "陰唇",
  clit: "陰蒂",
  pubic: "陰毛",
  butt: "臀部",
  mouth: "嘴唇",
  waist: "腰",
  thigh: "腿",
  body: "體型",
};

/**
 * 約會碰到／被看某個部位時，才把這名女子的 [breast]/[labia]/[butt]… 實況寫進 prompt。
 * 呼叫端再 resolveCardBinds，標記會換成實際罩杯／陰唇／臀形。
 * mode:
 *   feel = 妹子自己（被看／被摸時用來感覺與回話）
 *   see  = 看的人／動手的人（對準形狀，禁止改口成她的台詞）
 */
export function partBindInstruction(girl, hitId, playerName = "你", { mode = "feel" } = {}) {
  const keys = HIT_BIND_KEYS[hitId];
  if (!keys || !keys.length || !girl) return "";
  const ctx = bindContextFromGirl(girl, playerName);
  const head =
    mode === "see"
      ? "【你現在看見／摸到的部位】只拿來對準形狀。禁止改寫成她的嬌喘、嗯啊、或她該回的話。"
      : "【部位實況】這一拍這裡被看或被碰到了，必須用你本人的描述，禁止空泛寫「胸／穴／臀」。";
  const lines = [head];
  const seen = new Set();
  for (const k of keys) {
    if (seen.has(k)) continue;
    seen.add(k);
    const val = ctx[k];
    if (!val) continue;
    const zh = PART_BIND_ZH[k] || k;
    lines.push(`${zh}：用 [${k}] 來寫。`);
  }
  if (lines.length <= 1) return "";
  lines.push("描寫形狀、大小、顏色都要對得上上面那句，不要換成另一種身體。");
  if (mode === "see") lines.push("你是在看／動手的人。台詞仍是你自己的，不是她的。");
  return lines.join("\n");
}

export function identityLockBlock(girl, playerName = "你", { hitIds = [] } = {}) {
  const ctx = bindContextFromGirl(girl, playerName);
  const lookBits = [`眼睛「${ctx.eye}」`, `髮「${ctx.hair}」`, `體型「${ctx.body}」`];
  const extra = [];
  for (const id of hitIds || []) {
    for (const k of HIT_BIND_KEYS[id] || []) extra.push(k);
  }
  const seen = new Set();
  for (const k of extra) {
    if (seen.has(k)) continue;
    seen.add(k);
    const zh = PART_BIND_ZH[k];
    const val = ctx[k];
    if (!zh || !val) continue;
    if (k === "eye" || k === "hair" || k === "body") continue;
    lookBits.push(`${zh}「${val}」`);
  }
  return [
    `【對象鎖定——不可搞錯人】`,
    `你就是「${ctx.name}」，不是其他角色、不是旁白者。`,
    `正在跟你互動的人叫「${ctx.player}」。`,
    ctx.job && ctx.job !== "—" ? `你的職業／過去：${ctx.job}。` : "",
    `年齡：${ctx.age}。`,
    `外貌要對得上：${lookBits.join("、")}。`,
    extra.length
      ? "這一拍旁白點到的部位，才用上面的身體實況；沒點到的私密部位不要自己端出來。"
      : "眼睛／髮／體型是認人用的。胸、乳頭、陰唇等私密部位，要被看或被摸才拿出來寫。",
  ]
    .filter(Boolean)
    .join("\n");
}
