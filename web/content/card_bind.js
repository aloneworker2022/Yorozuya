// 卡牌文案 ↔ 當前女子綁定
// sceneStart / promptHint / 詞墜說明可寫 [name] [eye] [breast] …
// 出卡時用實際人設替換，讓 AI／生圖知道「在跟誰、碰哪裡」。

/** 編輯器提示用 */
export const BIND_PLACEHOLDERS = [
  { key: "name", aliases: ["她", "girl", "her"], sample: "小夜", desc: "女子名字" },
  { key: "player", aliases: ["你", "him", "playername", "召喚師"], sample: "你", desc: "玩家／召喚師名" },
  { key: "eye", aliases: ["eyes", "瞳", "眼睛"], sample: "赤紅色的眼睛", desc: "眼睛外貌" },
  { key: "breast", aliases: ["bust", "chest", "胸", "胸部"], sample: "豐滿的胸部", desc: "胸部／罩杯敘述" },
  { key: "hair", aliases: ["髮", "頭髮"], sample: "黑色長直髮", desc: "髮型（可含髮色）" },
  { key: "face", aliases: ["臉", "臉型"], sample: "鵝蛋臉", desc: "臉型" },
  { key: "mouth", aliases: ["唇", "嘴"], sample: "薄唇", desc: "嘴巴" },
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
  const hair = hairLine(L) || "她的頭髮";
  const face = pickStr(L.face, "她的臉");
  const mouth = pickStr(L.mouth, "她的嘴唇");
  const body = pickStr(L.build, "她的身材");
  const look = lookSummary(L, girl);

  return {
    name,
    player: pickStr(playerName, "你") || "你",
    eye,
    eyes: eye,
    breast,
    bust: breast,
    chest: breast,
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
export function identityLockBlock(girl, playerName = "你") {
  const ctx = bindContextFromGirl(girl, playerName);
  return [
    `【對象鎖定——不可搞錯人】`,
    `你就是「${ctx.name}」，不是其他角色、不是旁白者。`,
    `正在跟你互動的人叫「${ctx.player}」。`,
    ctx.job && ctx.job !== "—" ? `你的職業／過去：${ctx.job}。` : "",
    `年齡：${ctx.age}。`,
    `外貌要對得上：眼睛「${ctx.eye}」、胸部「${ctx.breast}」、髮「${ctx.hair}」、體型「${ctx.body}」。`,
    `若旁白點名眼睛／胸／名，那就是在對準你自己的身體與名字。`,
  ]
    .filter(Boolean)
    .join("\n");
}
