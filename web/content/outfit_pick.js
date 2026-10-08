/* 進房穿哪一套。關係解鎖張數不參與，只看她有沒有那一類衣服。 */

export const BASE_OUTFIT = "白色 T 恤配三角褲";

function names(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const item of list) {
    const name = String(item || "").trim();
    if (name) out.push(name);
  }
  return out;
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
  const wardrobe = names(look?.wardrobe);
  const erotic = names(look?.eroticOutfits);
  if (hour >= 18 && erotic.length) {
    const i = rollIndex(erotic.length, rng);
    return { name: erotic[i], pick: `e${i}` };
  }
  const daily = [BASE_OUTFIT, ...wardrobe];
  const i = rollIndex(daily.length, rng);
  if (i === 0) return { name: BASE_OUTFIT, pick: "base" };
  return { name: wardrobe[i - 1], pick: i - 1 };
}

/** 換一套：白 T、日常、情趣、睡衣，避開現在這套。沒有別套就 null，不要產圖。 */
export function pickChangeOutfit(look, currentName, rng = Math.random) {
  const roll = typeof rng === "function" ? rng : Math.random;
  const pool = [{ name: BASE_OUTFIT, pick: "base" }];
  names(look?.wardrobe).forEach((name, i) => pool.push({ name, pick: i }));
  names(look?.eroticOutfits).forEach((name, i) => pool.push({ name, pick: `e${i}` }));
  names(look?.sleepOutfits).forEach((name, i) => pool.push({ name, pick: `s${i}` }));
  const cur = String(currentName || "").trim();
  const choices = pool.filter((item) => item.name !== cur);
  if (!choices.length) return null;
  return choices[rollIndex(choices.length, roll)];
}
