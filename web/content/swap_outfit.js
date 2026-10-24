/* 換妻約會的外出服（2026-10-24）——純規則，node 可測。不改房間的穿衣系統、不寫 look.owned。
 * 對方妻子：有完整日常衣櫃 → 依 outfitPick（沒有就用 id 雜湊）挑一套外出服。
 * 你老婆：她擁有的日常衣服裡有像樣的外出服就穿那套；沒有 → 換妻專用的體面預設（上衣＋裙／牛仔褲），不加進 owned。
 * 內衣／睡衣／情趣／白 T 三角褲這類一律不算外出服。 */
import { ownedOf } from "./outfit_pick.js?v=2";

export const NOT_OUTING_RE = /內衣|內褲|三角褲|胸罩|睡衣|睡袍|浴袍|情趣|吊帶襪|比基尼|泳裝|丁字褲|馬甲|透視|網襪|bra|panties|lingerie|underwear|pajama|bikini/i;
export const DATE_DEFAULTS = [
  "米白色針織上衣配及膝牛仔裙",
  "淺藍色襯衫配黑色高腰A字裙",
  "粉色圓領上衣配直筒牛仔褲",
];
export const isOutingOutfit = (s) => { const t = String(s || "").trim(); return !!t && !NOT_OUTING_RE.test(t) && !/^白色 ?T ?恤/.test(t); };
function hashOf(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
export const dateDefaultOf = (g) => DATE_DEFAULTS[hashOf(g?.id || g?.name || "x") % DATE_DEFAULTS.length];

/** 這個人今晚約會穿什麼。role：other（對方妻子）／wife（你老婆）。回中文衣服名。 */
export function dateOutfitOf(g, role = "wife") {
  const look = g?.look || {};
  if (role === "other") {
    const ward = (Array.isArray(look.wardrobe) ? look.wardrobe : []).map((x, i) => ({ name: String(x || "").trim(), i })).filter((x) => isOutingOutfit(x.name));
    if (ward.length) {
      const hit = ward.find((x) => x.i === g?.outfitPick);
      return (hit || ward[hashOf(g?.id || g?.name || "x") % ward.length]).name;
    }
    const st = String(look.style || "").trim();
    return isOutingOutfit(st) ? st : dateDefaultOf(g);
  }
  const owned = ownedOf(look, "w").filter((x) => isOutingOutfit(x.name));
  if (owned.length) {
    const hit = owned.find((x) => x.i === g?.outfitPick);
    return (hit || owned[0]).name;
  }
  return dateDefaultOf(g);
}
/** 給生圖用的人物複本：outfitName＝約會裝（伺服器 _outfit_of 先看 outfitName）。不動原物件。 */
export const withDateOutfit = (g, role = "wife") => (g ? { ...g, outfitName: dateOutfitOf(g, role) } : g);
