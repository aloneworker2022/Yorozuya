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
// 2026-10-25：stage 一律降成 friend（covered）——不然妻子 stage=wife 伺服器會加「erotic lingerie」→ 外出立繪露胸罩
export const withDateOutfit = (g, role = "wife") => (g ? lookCharacter(g, role, "normal") : g);

/* 2026-10-25：依場景／狀態的立繪「造型」（cafe 產生器的 ex 鍵）。
 *   normal／shy：外出服、穿好（stage=friend → 伺服器 covered：不露胸罩、不露乳溝）——公園、酒吧清醒、KTV 一開始。
 *   tipsy：酒吧喝醉才用：同一套外出服但微微鬆開（領口鬆、肩帶滑落），仍不露內衣。
 *   under：KTV 脫衣第 1 階段：只剩內衣褲。
 *   nude：KTV 脫衣第 2 階段：全裸。 */
export const LOOK_KEYS = ["normal", "shy", "tipsy", "under", "nude"];
export const UNDER_OUTFIT = "matching lace bra and panties, underwear only, lingerie";
export const COVER_NEG = "cleavage, bra, visible bra, bra strap, lingerie, underwear, see-through, revealing clothes, open shirt, unbuttoned, midriff, nsfw, nude, nipples";
export function lookFor(ex) {
  if (ex === "nude") return { stage: "wife", force: true, outfit: "nude", neg: "", rating: "nsfw" };
  if (ex === "under") return { stage: "girlfriend", outfit: UNDER_OUTFIT, neg: "nude, nipples, topless, outer clothes, jacket, dress", rating: "nsfw" };
  if (ex === "tipsy") return { stage: "friend", outfitSuffix: ", loosened collar, top slipping slightly off one shoulder, slightly disheveled clothes", neg: "visible bra, lingerie, underwear, nude, nipples, topless", rating: "sfw" };
  return { stage: "friend", outfit: "", neg: COVER_NEG, rating: "sfw" };
}
/** 生圖用的人物：外出服＋依造型決定 stage（伺服器依 stage 決定露多少）。 */
export function lookCharacter(g, role = "wife", ex = "normal") {
  if (!g) return g;
  const L = lookFor(ex), base = dateOutfitOf(g, role);
  const outfitName = L.outfit === "nude" ? "" : L.outfit || base + (L.outfitSuffix || "");
  const out = { ...g, stage: L.stage, outfitName };
  if (g.relationship && typeof g.relationship === "object") out.relationship = { ...g.relationship, stage: L.stage };
  if (L.force) out._force_exposed = true;
  return out;
}
/** 遊戲裡這個人現在要用哪個造型。scene＝park|bar|ktv|hotel…；drunk＝醉度；strip＝0/1/2（KTV 脫衣）；shy＝害羞表情。 */
export function lookKeyOf({ scene = "bar", drunk = 0, strip = 0, shy = false, tipsyAt = 60 } = {}) {
  const s = String(scene);
  if (s === "ktv" && strip >= 1) return "under";   // 2026-10-25 Al：KTV 只脫到內衣，沒有全裸
  if (s.startsWith("bar") && drunk >= tipsyAt) return "tipsy";
  return shy ? "shy" : "normal";
}
/** 找不到圖時的退路順序。 */
export const lookFallback = (ex) => ({ nude: ["nude", "under", "shy", "normal"], under: ["under", "shy", "normal"], tipsy: ["tipsy", "shy", "normal"], shy: ["shy", "normal"] }[ex] || ["normal"]);
