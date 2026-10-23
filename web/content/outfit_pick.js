/* 進房穿哪一套。關係解鎖張數不參與，只看她「擁有」哪幾套。
 * look.wardrobe／eroticOutfits／sleepOutfits 是她天生的品味（召喚就抽好、藏著）；
 * look.owned = { wardrobe:[], erotic:[], sleep:[] }（索引）才是衣櫃裡真的有的。
 * 新召喚 owned 全空＝只有白 T 加三角褲；舊存檔沒有 owned 欄位＝全部都有（照舊）。 */

export const BASE_OUTFIT = "白色 T 恤配三角褲";

const OWN_KEY = { w: "wardrobe", e: "erotic", s: "sleep" };
const LIST_KEY = { w: "wardrobe", e: "eroticOutfits", s: "sleepOutfits" };

/** 有 owned 欄位＝新制；沒有＝舊存檔，全部視為擁有。 */
export function hasOwnedList(look) {
  return !!(look && look.owned && typeof look.owned === "object" && !Array.isArray(look.owned));
}

/** 她有沒有這一套。kind: "w" 日常、"e" 情趣、"s" 睡衣。 */
export function ownsOutfit(look, kind, index) {
  if (!Number.isInteger(index) || index < 0) return false;
  if (!hasOwnedList(look)) return true;
  const list = look.owned[OWN_KEY[kind] || "wardrobe"];
  return Array.isArray(list) && list.map(Number).includes(index);
}

/** 新召喚用：空衣櫃。 */
export function emptyOwned() {
  return { wardrobe: [], erotic: [], sleep: [] };
}

/** 她擁有的某一類衣服：[{ name, i }]（i 是原清單索引）。 */
export function ownedOf(look, kind) {
  const list = Array.isArray(look?.[LIST_KEY[kind]]) ? look[LIST_KEY[kind]] : [];
  const out = [];
  list.forEach((item, i) => {
    const name = String(item || "").trim();
    if (name && ownsOutfit(look, kind, i)) out.push({ name, i });
  });
  return out;
}

/** 沒挑或挑到沒有的那套時穿什麼：生涯服裝 → （舊存檔）style → 白 T。 */
export function fallbackOutfit(look) {
  const career = String(look?.career_outfit || "").trim();
  if (career) return career;
  if (!hasOwnedList(look)) {
    const style = String(look?.style || "").trim();
    if (style) return style;
  }
  return BASE_OUTFIT;
}

/** 她現在身上那套（共用版）：outfitName → base → 擁有的 eN/sN/索引 → fallback。 */
export function wornOutfitOf(g) {
  const named = String(g?.outfitName || "").trim();
  if (named) return named;
  const look = g?.look || {};
  const pick = g?.outfitPick;
  if (pick === "base") return BASE_OUTFIT;
  let kind = null, index = -1;
  if (typeof pick === "string" && (pick[0] === "e" || pick[0] === "s")) { kind = pick[0]; index = Number(pick.slice(1)); }
  else if (Number.isInteger(pick)) { kind = "w"; index = pick; }
  if (kind && Number.isInteger(index) && index >= 0 && ownsOutfit(look, kind, index)) {
    const list = look[LIST_KEY[kind]];
    const name = Array.isArray(list) ? String(list[index] || "").trim() : "";
    if (name) return name;
  }
  return fallbackOutfit(look);
}

function rollIndex(length, rng) {
  if (length <= 1) return 0;
  const n = Number(rng());
  const u = Number.isFinite(n) ? Math.min(0.999999, Math.max(0, n)) : 0;
  return Math.min(length - 1, Math.floor(u * length));
}

/**
 * 進房當下選一次。
 * 台灣時間 18 點起，而且有情趣裝，只從情趣裝抽。
 * 否則從白 T 加上日常衣櫃抽。中途過 6 點不重選。
 */
export function pickSummonOutfit(look, opts = {}) {
  const hour = Number(opts.hour) || 0;
  const rng = typeof opts.rng === "function" ? opts.rng : Math.random;
  const wardrobe = ownedOf(look, "w");
  const erotic = ownedOf(look, "e");
  if (hour >= 18 && erotic.length) {
    const e = erotic[rollIndex(erotic.length, rng)];
    return { name: e.name, pick: `e${e.i}` };
  }
  const i = rollIndex(wardrobe.length + 1, rng);
  if (i === 0) return { name: BASE_OUTFIT, pick: "base" };
  const w = wardrobe[i - 1];
  return { name: w.name, pick: w.i };
}

/** 換一套：白 T、她擁有的日常、情趣、睡衣，避開現在這套。沒有別套就 null，不要產圖。 */
export function pickChangeOutfit(look, currentName, rng = Math.random) {
  const roll = typeof rng === "function" ? rng : Math.random;
  const pool = [{ name: BASE_OUTFIT, pick: "base" }];
  ownedOf(look, "w").forEach(({ name, i }) => pool.push({ name, pick: i }));
  ownedOf(look, "e").forEach(({ name, i }) => pool.push({ name, pick: `e${i}` }));
  ownedOf(look, "s").forEach(({ name, i }) => pool.push({ name, pick: `s${i}` }));
  const cur = String(currentName || "").trim();
  const choices = pool.filter((item) => item.name !== cur);
  if (!choices.length) return null;
  return choices[rollIndex(choices.length, roll)];
}
