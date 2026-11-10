/**
 * 妹子外觀（look）→「肏」像素互動的下體樣子（2026-11-10；純函式，房間與 node 測試共用）。
 *   體型  look.build 13 種 → 5 種下半身（slim 瘦／std 標準／plump 肉／firm 結實／wide 寬臀）
 *   陰唇  look.labia_size（內收小巧／適中微開／外翻飽滿）→ small／mid／large
 *   顏色  look.labia_color（粉／淺褐、咖啡／深褐、黑；跟著器官開發度變深）→ pink／brown／dark
 *   陰蒂  look.clitoris_size（小巧含蓄／明顯可見／腫大突出）→ small／mid／large
 *   陰道長度  look.vagina_len（0.5／1／1.5；玩家陰莖＝1）。舊存檔沒有這欄 → 用她的 id／名字算一個固定的（每次一樣）。
 */
export const PIXEL_BUILD = {
  "勻稱有致": "std", "嬌小玲瓏": "std",
  "骨感清瘦": "slim", "纖細苗條": "slim", "高挑纖長": "slim",
  "微肉圓潤": "plump", "軟肉感有腰": "plump",
  "結實緊緻": "firm", "運動健美": "firm",
  "豐滿火辣": "wide", "細腰寬臀": "wide", "凹凸有致的沙漏身材": "wide", "極端腰臀比的漫畫比例": "wide",
};
export const VAGINA_LENS = [0.5, 1, 1.5];

export function pixelBuildFor(build) {
  const k = String(build || "").trim();
  if (PIXEL_BUILD[k]) return PIXEL_BUILD[k];
  if (/瘦|纖|苗條|高挑/.test(k)) return "slim";
  if (/微肉|圓潤|軟肉/.test(k)) return "plump";
  if (/結實|健美|運動|肌/.test(k)) return "firm";
  if (/寬臀|豐滿|沙漏|腰臀/.test(k)) return "wide";
  return "std";
}
export function pixelLabiaFor(text) {
  const k = String(text || "");
  if (/內收|小巧/.test(k)) return "small";
  if (/外翻|飽滿|肥厚/.test(k)) return "large";
  return "mid";
}
export function pixelLabiaColorFor(text) {
  const k = String(text || "");
  if (/深褐|近黑|黑/.test(k)) return "dark";
  if (/褐|咖啡|棕/.test(k)) return "brown";
  return "pink";
}
export function pixelClitFor(text) {
  const k = String(text || "");
  if (/小巧|含蓄/.test(k)) return "small";
  if (/腫大|突出|肥大/.test(k)) return "large";
  return "mid";
}
/** 字串 → 0～1 的固定數（舊存檔沒有陰道長度時用）。 */
export function stableUnit(seed) {
  let h = 2166136261;
  for (const ch of String(seed || "")) { h ^= ch.codePointAt(0); h = Math.imul(h, 16777619); }
  return ((h >>> 0) % 10000) / 10000;
}
export function pixelVaginaLenFor(look, seed = "") {
  const v = Number(look?.vagina_len);
  if (VAGINA_LENS.includes(v)) return v;
  return VAGINA_LENS[Math.min(2, Math.floor(stableUnit(seed) * 3))];
}
/** 新抽的人：陰道長度三級等機率（跟其他性器軸一樣不進稀有度）。 */
export function rollVaginaLen(rng = Math.random) {
  return VAGINA_LENS[Math.min(2, Math.floor(rng() * 3))];
}
export function pixelLookFor(who) {
  const L = who?.look || {};
  return {
    build: pixelBuildFor(L.build),
    labia: pixelLabiaFor(L.labia_size),
    labcol: pixelLabiaColorFor(L.labia_color),
    clit: pixelClitFor(L.clitoris_size),
    vlen: pixelVaginaLenFor(L, who?.id || who?.name || ""),
  };
}
