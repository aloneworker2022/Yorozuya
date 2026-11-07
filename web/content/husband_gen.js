/* 換妻・對方丈夫產生器（2026-10-23）：完整長相軸 zh+en、名字／年紀／體型／身高／穿搭／persona／swapType／個性／喜好／興趣。
 * 模型（ckpt／comfyCkpt）由 rollCkpts 另抽，且與對方妻子不同。純規則，node 可測。 */

import { PERSONA_KEYS, CLIENT_BUILDS } from "./rental.js?v=7";

const pk = (a, r = Math.random) => a[Math.floor(r() * a.length)];
const ri = (a, b, r = Math.random) => a + Math.floor(r() * (b - a + 1));
const pickN = (a, n, r = Math.random) => {
  const pool = a.slice(), out = [];
  while (out.length < n && pool.length) out.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
  return out;
};

const SURNAMES = ["佐藤", "鈴木", "高橋", "田中", "伊藤", "渡邊", "山本", "中村", "小林", "加藤", "吉田", "山田", "佐佐木", "山口", "松本",
  "井上", "木村", "林", "清水", "山崎", "森", "池田", "橋本", "阿部", "石川", "前田", "藤田", "岡田", "後藤", "長谷川"];
const GIVEN_M = ["翔太", "大輔", "健太", "拓也", "直樹", "亮", "達也", "悠斗", "和也", "誠", "隆", "修", "慎吾", "陽介", "蓮", "浩二", "雅人", "健一"];

/** [zh, en] */
const HAIR = [
  ["短髮整齊側分", "neat short side-parted hair"],
  ["短髮自然蓬鬆", "short fluffy natural hair"],
  ["稍長瀏海遮額", "medium short hair with bangs over forehead"],
  ["後梳油頭", "slicked back hair"],
  ["刺蝟短髮", "spiky short hair"],
  ["微捲短髮", "short wavy hair"],
  ["平頭", "buzz cut"],
  ["中長微亂", "medium-length slightly messy hair"],
];
const HAIR_COLOR = [
  ["烏黑", "black hair"], ["深棕", "dark brown hair"], ["茶色", "brown hair"],
  ["栗子色", "chestnut hair"], ["灰黑", "dark gray hair"], ["染成深栗", "dark auburn dyed hair"],
];
const FACE = [
  ["端正的方臉", "square-jawed handsome face"],
  ["柔和的橢圓臉", "soft oval face"],
  ["輪廓分明的長臉", "long angular face"],
  ["略方帶稜角", "angular face with sharp jaw"],
  ["圓潤親和的臉", "round friendly face"],
  ["瘦長臉", "lean long face"],
];
const EYES = [
  ["細長鋭利的眼睛", "narrow sharp eyes"],
  ["圓潤有神的眼睛", "round bright eyes"],
  ["細長帶笑意", "narrow smiling eyes"],
  ["深邃的單眼皮", "deep monolid eyes"],
  ["溫和的桃花眼", "gentle peach-blossom eyes"],
];
const MOUTH = [
  ["乾淨刮鬍", "clean-shaven"],
  ["薄薄的鬍渣", "light stubble"],
  ["短鬚", "short beard"],
  ["八字鬍", "mustache"],
  ["刮得乾淨的下巴", "clean-shaven chin"],
];
const FEATURE = [
  ["左眉有一道淺疤", "thin scar on left eyebrow"],
  ["戴細框眼鏡", "wearing thin-framed glasses"],
  ["右耳戴小耳環", "small earring on right ear"],
  ["嘴角有顆痣", "mole near the mouth"],
  ["笑容有酒窩", "dimples when smiling"],
  ["", ""],
];
const BUILD_ZH = {
  average: "普通身材", slim: "偏瘦", muscular: "結實肌肉", fat: "微胖有肚",
  tall: "高挑", short: "偏矮", old: "中年微胖",
};
const BUILD_EN = {
  average: "average build man", slim: "thin skinny man", muscular: "muscular man with broad shoulders",
  fat: "fat obese man with a big round belly", tall: "very tall man", short: "short man",
  old: "middle-aged man with a receding hairline",
};
const OUTFIT = {
  gentleman: [["整齊襯衫配西裝外套", "neat shirt and blazer"], ["白襯衫領帶", "white shirt and necktie"]],
  clingy: [["休閒 Polo 衫", "casual polo shirt"], ["連帽外套配牛仔褲", "hoodie and jeans"]],
  showoff: [["設計師夾克配金鍊", "designer jacket and gold necklace"], ["敞開領襯衫", "open-collar dress shirt"]],
  dominant: [["深色西裝敞開領", "dark suit open collar"], ["黑色高領毛衣", "black turtleneck"]],
  otaku: [["格子襯衫罩動漫 T", "checkered shirt over an anime t-shirt"], ["寬鬆帽 T", "loose hoodie"]],
};
const PERSONA_PERS = {
  gentleman: ["彬彬有禮、體貼溫和", "客氣沉穩、會照顧氣氛"],
  clingy: ["黏人熱情、話多親近", "自來熟、容易興奮"],
  showoff: ["愛炫耀、自信外向", "財大氣粗、愛談成就"],
  dominant: ["強勢果斷、帶點壓迫感", "主導氣氛、說話直接"],
  otaku: ["害羞宅、有點緊張", "內向但一聊興趣就停不下來"],
};
const LIKES = ["紅酒", "威士忌", "高爾夫", "看球", "開車兜风", "夜景", "居酒屋", "燒肉", "雪茄", "手遊", "動漫", "健身", "釣蝦", "唱 K", "投資"];
const HOBBIES = ["打高爾夫", "健身", "看棒球", "蒐集名錶", "玩手遊", "看動畫", "攝影", "騎重機", "品酒", "麻將"];

const HEIGHT_BY = { short: [160, 168], tall: [182, 192], old: [165, 178], average: [168, 180], slim: [168, 182], muscular: [172, 188], fat: [165, 178] };

/** 從既有薄丈夫補齊 look／喜好（保留 id／name／age／persona／build／ckpt／swapType／swapPrice）。 */
export function enrichHusband(h = {}, r = Math.random) {
  const persona = PERSONA_KEYS.includes(h.persona) ? h.persona : pk(PERSONA_KEYS, r);
  const build = CLIENT_BUILDS.includes(h.build) ? h.build : pk(CLIENT_BUILDS, r);
  const hair = pk(HAIR, r), color = pk(HAIR_COLOR, r), face = pk(FACE, r), eyes = pk(EYES, r), mouth = pk(MOUTH, r), feat = pk(FEATURE, r);
  const outfit = pk(OUTFIT[persona] || OUTFIT.gentleman, r);
  const [hLo, hHi] = HEIGHT_BY[build] || HEIGHT_BY.average;
  const height_cm = Number(h.height_cm) || ri(hLo, hHi, r);
  const look = {
    ...(h.look || {}),
    hair: h.look?.hair || hair[0], hair_en: h.look?.hair_en || hair[1],
    hair_color: h.look?.hair_color || color[0], hair_color_en: h.look?.hair_color_en || color[1],
    face: h.look?.face || face[0], face_en: h.look?.face_en || face[1],
    eyes: h.look?.eyes || eyes[0], eyes_en: h.look?.eyes_en || eyes[1],
    mouth: h.look?.mouth || mouth[0], mouth_en: h.look?.mouth_en || mouth[1],
    feature: h.look?.feature ?? feat[0], feature_en: h.look?.feature_en ?? feat[1],
    build, build_zh: BUILD_ZH[build] || build, build_en: BUILD_EN[build] || BUILD_EN.average,
    height_cm, age: Number(h.age) || ri(28, 48, r),
    outfit: h.look?.outfit || outfit[0], outfit_en: h.look?.outfit_en || outfit[1],
  };
  const out = {
    ...h,
    persona, build, height_cm,
    age: Number(h.age) || look.age,
    name: h.name || (pk(SURNAMES, r) + pk(GIVEN_M, r)),
    personality: h.personality || pk(PERSONA_PERS[persona] || PERSONA_PERS.gentleman, r),
    likes: Array.isArray(h.likes) && h.likes.length ? h.likes : pickN(LIKES, 3, r),
    hobbies: Array.isArray(h.hobbies) && h.hobbies.length ? h.hobbies : pickN(HOBBIES, 2, r),
    look,
  };
  if (out.ckpt && !out.comfyCkpt) out.comfyCkpt = out.ckpt;
  if (out.comfyCkpt && !out.ckpt) out.ckpt = out.comfyCkpt;
  return out;
}

/** 新抽一位對方丈夫。opts：{ id, notCkpt }（模型另由 rollCkpts 綁）。 */
export function rollHusband(opts = {}, r = Math.random) {
  const persona = pk(PERSONA_KEYS, r);
  const build = pk(CLIENT_BUILDS, r);
  const base = {
    id: opts.id || `h${Date.now().toString(36)}`,
    name: pk(SURNAMES, r) + pk(GIVEN_M, r),
    age: ri(28, 48, r),
    persona,
    skill: 1 + Math.floor(r() * 5),
    build,
    regular: false,
  };
  return enrichHusband(base, r);
}

/** 給生圖用的英文 tags（有完整 look 就用；否則退回舊 persona 路徑）。 */
export function husbandLookEn(h = {}) {
  const L = h.look || {};
  if (L.hair_en || L.face_en) {
    return [L.hair_en, L.hair_color_en, L.face_en, L.eyes_en, L.mouth_en, L.feature_en, L.build_en]
      .filter(Boolean).join(", ");
  }
  return "";
}
