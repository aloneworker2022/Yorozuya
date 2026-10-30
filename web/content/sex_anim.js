/** 做愛局部動畫：四幀各一張。性器軸（陰唇／陰蒂／顏色／陰毛）可掛人設。 */

export const SEX_ANIM_FRAMES = 4;

/** 單幀橫幅特寫。Comfy 用 SDXL 橫桶；Grok 走 3:2。 */
export const SEX_ANIM_SIZE = {
  width: 1216,
  height: 832,
  aspect: "3:2",
};

const COMMON = [
  "black background",
  "solid black background",
  "simple background",
  "close-up",
  "extreme close-up",
  "widescreen",
  "lower abdomen focus",
  "hips",
  "inner thighs",
  "1girl",
  "1boy",
  "adult woman",
  "adult man",
  "nude",
  "pussy focus",
  "penis",
  "erect penis",
  "labia",
  "vulva",
  "uncensored",
  "nsfw",
  "explicit",
  "head out of frame",
  "no faces",
  "same camera",
  "same crop",
].join(", ");

const COMMON_NEG = [
  "text",
  "letters",
  "numbers",
  "caption",
  "watermark",
  "signature",
  "comic",
  "4koma",
  "sprite sheet",
  "multiple panels",
  "collage",
  "face",
  "looking at viewer",
  "full body",
  "wide shot",
  "white background",
  "grey background",
  "scenery",
  "censored",
  "mosaic",
  "bar censor",
  "child",
  "loli",
  "chibi",
].join(", ");

export const SEX_ANIM_BEATS = [
  {
    zh: "龜頭插入陰唇",
    tags: "glans, glans inserting into labia, outer labia",
    extraNeg: "hidden glans, white background, scenery",
  },
  {
    zh: "插入（不畫龜頭）",
    tags: "vaginal penetration, labia",
    extraNeg: "glans, hidden glans",
  },
  {
    zh: "整根陰莖在陰道內",
    tags: "penis, short penis, penis in vagina, entire penis in vagina",
    extraNeg: "half inserted, shaft outside, penis still outside, glans",
  },
  {
    zh: "抽出中段（同第 2 幀）",
    tags: "vaginal penetration, labia",
    extraNeg: "glans, hidden glans",
  },
];

export const SEX_ANIM_POSES = [
  {
    id: "missionary",
    label: "正常",
    blurb: "正常位。男女腹部特寫，正面看交合。",
    shared: "missionary, missionary position, from front, facing him, female lower abdomen, male lower abdomen, navel",
    extraNeg: "doggy, from behind, ass focus, cowgirl, girl on top, straddling",
  },
  {
    id: "doggy",
    label: "背後",
    blurb: "背後位。從後面看交合，臀部與陰唇。",
    shared: "doggy, doggy style, from behind, ass, pussy from behind, male pubic hair",
    extraNeg: "cowgirl, girl on top, straddling, missionary, facing him, navel",
  },
  {
    id: "cowgirl_front",
    label: "正面騎乘",
    blurb: "正面騎乘。女子在上，面向他。",
    shared: "cowgirl, girl on top, straddling, facing him, female lower abdomen, male lower abdomen, navel, male pubic hair",
    extraNeg: "doggy, from behind, ass focus, missionary",
  },
];

export const SEX_ANIM_AROUSAL = [
  {
    id: "low",
    label: "低",
    tags: "slightly wet",
    extraNeg: "dripping, pussy juice, squirting, overflowing juices",
  },
  {
    id: "mid",
    label: "中",
    tags: "wet, glistening, aroused",
    extraNeg: "squirting",
  },
  {
    id: "high",
    label: "高",
    tags: "very wet, dripping, pussy juice, swollen labia, aroused",
    extraNeg: "",
  },
];

const STYLE_TAG = {
  anime: "anime",
  realistic: "photorealistic",
  pixel: "pixel art, pixelated",
};

/** 性器軸。text 必須對齊 persona_pools.json；tags 對齊 server/sdtags.py。不分等級。 */
export const GENITAL_TRAITS = {
  labia_size: [
    { text: "內收小巧的陰唇", tags: "innies, small labia, innie pussy", extraNeg: "outies, large labia, plump labia, protruding labia" },
    { text: "適中微開的陰唇", tags: "slightly parted labia", extraNeg: "innies, outies, large labia" },
    { text: "外翻飽滿的陰唇", tags: "outies, large labia, plump labia, protruding inner labia", extraNeg: "innies, small labia, innie pussy" },
  ],
  clitoris_size: [
    { text: "小巧含蓄的陰蒂", tags: "small clitoris", extraNeg: "large clitoris, prominent clitoris, huge clitoris" },
    { text: "明顯可見的陰蒂", tags: "clitoris", extraNeg: "huge clitoris" },
    { text: "腫大突出的陰蒂", tags: "large clitoris, prominent clitoris", extraNeg: "small clitoris, tiny clitoris" },
  ],
  labia_color: [
    { text: "粉嫩淺色的陰唇", tags: "pink pussy, pink labia, pale labia", extraNeg: "dark pussy, dark labia, brown labia" },
    { text: "淺褐自然的陰唇", tags: "brown labia", extraNeg: "pink pussy, pale labia, dark pussy" },
    { text: "深褐近黑的陰唇", tags: "dark pussy, dark labia", extraNeg: "pink pussy, pink labia, pale labia" },
  ],
  pubic_hair: [
    { text: "完全剃光、沒有陰毛", tags: "shaved, completely shaved, no pubic hair", extraNeg: "pubic hair, bush, thick pubic hair, sparse pubic hair" },
    { text: "稀疏細軟的陰毛", tags: "sparse pubic hair, light pubic hair", extraNeg: "shaved, completely shaved, bush, thick pubic hair" },
    { text: "適中自然的陰毛", tags: "pubic hair", extraNeg: "shaved, no pubic hair, completely shaved, bush, thick pubic hair" },
    { text: "濃密茂盛的陰毛", tags: "thick pubic hair, bush, messy pubic hair", extraNeg: "shaved, no pubic hair, completely shaved, sparse pubic hair" },
  ],
};

export const GENITAL_AXES = ["labia_size", "clitoris_size", "labia_color", "pubic_hair"];

export const GENITAL_AXIS_ZH = {
  labia_size: "陰唇大小",
  clitoris_size: "陰蒂大小",
  labia_color: "陰唇顏色",
  pubic_hair: "陰毛",
};

export function genitalTrait(axis, text) {
  return (GENITAL_TRAITS[axis] || []).find(x => x.text === text) || null;
}

export function genitalTagsFromLook(look = {}) {
  const bits = [];
  const negs = [];
  for (const key of GENITAL_AXES) {
    const hit = genitalTrait(key, look[key]);
    if (hit) {
      bits.push(hit.tags);
      if (hit.extraNeg) negs.push(hit.extraNeg);
    }
  }
  return { pos: bits.filter(Boolean).join(", "), extraNeg: negs.filter(Boolean).join(", ") };
}

export function genitalAxisMid(axis) {
  const arr = GENITAL_TRAITS[axis] || [];
  if (!arr.length) return "";
  return arr[Math.min(arr.length - 1, Math.floor(arr.length / 2))].text;
}

export function sexAnimPose(id) {
  return SEX_ANIM_POSES.find(p => p.id === id) || SEX_ANIM_POSES[0];
}

export function sexAnimBeats(poseId) {
  const pose = sexAnimPose(poseId);
  return pose.beats || SEX_ANIM_BEATS;
}

export function sexAnimArousal(id) {
  return SEX_ANIM_AROUSAL.find(a => a.id === id) || SEX_ANIM_AROUSAL[1];
}

export function poseArousal(pose, arousalId) {
  const list = (pose && pose.arousal) || SEX_ANIM_AROUSAL;
  return list.find(a => a.id === arousalId) || list[1] || sexAnimArousal(arousalId);
}

function filterNeg(neg, drop) {
  if (!drop || !drop.length) return neg;
  const d = new Set(drop.map(x => String(x).toLowerCase()));
  return String(neg || "").split(",").map(t => t.trim()).filter(t => t && !d.has(t.toLowerCase())).join(", ");
}

export function buildSexAnimFrames(poseId, style, arousalId, look, girl) {
  const pose = sexAnimPose(poseId);
  const beats = pose.beats || SEX_ANIM_BEATS;
  const common = pose.common || COMMON;
  const aro = poseArousal(pose, arousalId);
  const st = STYLE_TAG[style] || STYLE_TAG.anime;
  const g = pose.usesGenitals === false ? { pos: "", extraNeg: "" } : genitalTagsFromLook(look);
  const neg = [filterNeg(COMMON_NEG, pose.dropNeg), pose.extraNeg, aro.extraNeg, g.extraNeg].filter(Boolean).join(", ");
  return {
    pose,
    arousal: aro,
    look,
    neg,
    frames: beats.map(f => ({
      zh: f.zh,
      pos: [common, pose.shared, aro.tags, f.tags, g.pos, st].filter(Boolean).join(", "),
      extraNeg: [f.extraNeg || "", g.extraNeg].filter(Boolean).join(", "),
    })),
  };
}

const CLOSEUP_COMMON = [
  "black background",
  "solid black background",
  "simple background",
  "close-up",
  "extreme close-up",
  "widescreen",
  "1girl",
  "adult woman",
  "nude",
  "pussy focus",
  "pussy",
  "vulva",
  "labia",
  "clitoris",
  "spread legs",
  "inner thighs",
  "hips",
  "uncensored",
  "nsfw",
  "explicit",
  "head out of frame",
  "no faces",
].join(", ");

const CLOSEUP_NEG = [
  COMMON_NEG,
  "penis",
  "glans",
  "insertion",
  "penetration",
  "cum",
  "creampie",
].join(", ");

export function buildGenitalCloseup(style, look) {
  const g = genitalTagsFromLook(look);
  const st = STYLE_TAG[style] || STYLE_TAG.anime;
  return {
    zh: "性器特寫",
    pos: [CLOSEUP_COMMON, g.pos, st].filter(Boolean).join(", "),
    neg: [CLOSEUP_NEG, g.extraNeg].filter(Boolean).join(", "),
  };
}

/** 對照：每軸各級，另外各軸固定中等。 */
export function buildGenitalCompare(style) {
  const mid = {};
  for (const axis of GENITAL_AXES) mid[axis] = genitalAxisMid(axis);
  const out = [];
  for (const axis of GENITAL_AXES) {
    for (const item of GENITAL_TRAITS[axis]) {
      const look = { ...mid, [axis]: item.text };
      const built = buildGenitalCloseup(style, look);
      out.push({
        axis,
        text: item.text,
        label: `${GENITAL_AXIS_ZH[axis]}・${item.text}`,
        pos: built.pos,
        neg: built.neg,
      });
    }
  }
  return out;
}
