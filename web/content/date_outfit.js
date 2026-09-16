/** 約會穿著：不用職業制服，改從個人衣櫃挑便服。 */

const WORK_WEAR_RE = /制服|白袍|工作服|圍裙|職業裝|護理|店員|工地|校服|實驗衣|手術|西裝套裝/;

export function isWorkWear(s) {
  return WORK_WEAR_RE.test(String(s || ""));
}

export function wardrobeList(g) {
  const L = g?.look || {};
  const w = Array.isArray(L.wardrobe) ? L.wardrobe.filter(Boolean) : [];
  if (w.length) return w;
  if (L.style && !isWorkWear(L.style)) return [L.style];
  return [];
}

/**
 * 為這場約會挑一套便服（固定到同一 girlId 前可快取）。
 * @param {object} g
 * @param {string} [relStage] stranger|friend|girlfriend|wife
 */
export function pickDateOutfit(g, relStage = "stranger") {
  const L = g?.look || {};
  const career = L.career_outfit || "";
  const pool = wardrobeList(g).filter((x) => x !== career && !isWorkWear(x));
  const fallback = "輕便的私服（出門約會的便裝，不是上班那身）";
  if (!pool.length) return { text: fallback, index: 0, girlId: g?.id || "" };
  const span = relStage === "girlfriend" || relStage === "wife" ? pool.length : Math.min(2, pool.length);
  const pick = pool[Math.floor(Math.random() * Math.max(1, span))];
  const wardrobe = wardrobeList(g);
  const index = Math.max(0, wardrobe.indexOf(pick));
  return { text: pick, index, girlId: g?.id || "" };
}

/** 回傳給生圖／綁定用的人設：穿約會便服，不當制服。 */
export function girlForDate(g, outfit) {
  if (!g) return null;
  const o = outfit || pickDateOutfit(g);
  const wardrobe = wardrobeList(g);
  const w = wardrobe.length ? wardrobe : [o.text];
  const index = wardrobe.length && Number.isInteger(o.index) && o.index >= 0
    ? o.index
    : 0;
  return {
    ...g,
    look: {
      ...(g.look || {}),
      // 約會當下穿著寫進 career_outfit，避免綁定／打底又變回制服
      career_outfit: o.text,
      style: o.text,
      wardrobe: w,
    },
    outfitPick: index,
    _dateOutfit: o.text,
  };
}

/** 明確傳給 imggen 的 outfit 字串 */
export function dateOutfitText(g, outfit) {
  if (outfit?.text) return outfit.text;
  if (g?._dateOutfit) return g._dateOutfit;
  return pickDateOutfit(g).text;
}
