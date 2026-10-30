/* 懷孕（2026-10-10 Al）：純規則，手機與 node 測試共用；受孕擲骰在 RP5（server/pregnancy.py，數字比對見 tests）。
 * 受孕：只有「別人」內射陰道才會（接客客人、外面的肉體關係／炮友、光著身子離房的路人）。玩家的精子不會讓她懷孕（設定，不在 UI 講）。
 * 10 天：受孕 → 生產。第 3 天起肚子看得出來，到第 10 天最大（房間人偶、偷看、生圖 tag）。
 * 女友以上自己跟你說（一句，個性口吻）；女友以下只有症狀（孕吐、噁心）。
 * 女友以下：懷孕第 5 天永遠離開（從名冊移除、日誌）。女友～愛人：快生（第 10 天）離開。妻子：留下來生，扣 380 金育兒費（可以欠債 → 接客還債）。
 * 打胎藥：30～60 金，買了金幣會變負的（或已經負債）就不能買。
 * 狀態在 bodyState.pregnancy（跟著房間存檔＋名冊回寫走）；RP5 受孕 → world.pregnancyRp5，手機用 key 收一次（bodyState.pregKeys）。 */
import { familyOf, stageIndexOf, STAGE_IDX, isWifeStage } from "./girl_voice.js?v=1";

export const DAY_MS = 24 * 3600e3;
export const PREG_DAYS = 10;
export const BUMP_FROM_DAY = 3;
export const LOW_LEAVE_DAY = 5;         // 女友以下：第 5 天離開
export const DATING_LEAVE_DAY = 9.5;    // 女友～愛人：快生了離開
export const CHILD_FEE = 380;
export const MED_MIN = 30;
export const MED_MAX = 60;
export const CHANCE_MIN = 0.08;
export const CHANCE_MAX = 0.15;

export function stageKeyOf(who) { return who?.roomStage || who?.stage || "stranger"; }
function body(who) { if (!who) return null; who.bodyState = who.bodyState && typeof who.bodyState === "object" ? who.bodyState : {}; return who.bodyState; }
export function pregOf(who) { const p = who?.bodyState?.pregnancy; return p && typeof p === "object" && Number(p.at) > 0 ? p : null; }
export function dayOf(p, now = Date.now()) { return p ? Math.max(0, (now - Number(p.at)) / DAY_MS) : 0; }
/** 肚子 0～1：第 3 天起線性長到第 10 天。 */
export function bellyOf(who, now = Date.now()) {
  const p = pregOf(who); if (!p) return 0;
  const d = dayOf(p, now);
  return d < BUMP_FROM_DAY ? 0 : Math.min(1, (d - BUMP_FROM_DAY) / (PREG_DAYS - BUMP_FROM_DAY) * 0.8 + 0.2);
}
/** 生圖 tag 段：0 沒有、1 微凸、2 明顯、3 臨盆。 */
export function bellyStage(who, now = Date.now()) {
  const b = bellyOf(who, now);
  return b <= 0 ? 0 : b < 0.5 ? 1 : b < 0.9 ? 2 : 3;
}
export function band(stageKey) {
  const i = stageIndexOf(stageKey);
  return isWifeStage(stageKey) ? "wife" : i >= STAGE_IDX.girlfriend ? "dating" : "low";
}
/** 該發生什麼：null／'leave'（離開）／'birth'（妻子生產）。 */
export function outcome(who, now = Date.now()) {
  const p = pregOf(who); if (!p) return null;
  const d = dayOf(p, now), b = band(stageKeyOf(who));
  if (b === "low") return d >= LOW_LEAVE_DAY ? "leave" : null;
  if (b === "dating") return d >= DATING_LEAVE_DAY ? "leave" : null;
  return d >= PREG_DAYS ? "birth" : null;
}
/** 受孕機率（RP5 同一套）：8～15%，排卵期＋飢渴加一點。 */
export function cycleDay(id, now = Date.now()) {
  let h = 0; for (const c of String(id || "")) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return Math.floor((now / DAY_MS + (h % 28))) % 28;
}
export function fertile(id, now = Date.now()) { const d = cycleDay(id, now); return d >= 11 && d <= 16; }
export function conceiveChance(hunger = 0, isFertile = false) {
  const p = CHANCE_MIN + (isFertile ? 0.05 : 0) + Math.max(0, Math.min(100, Number(hunger) || 0)) / 100 * 0.02;
  return Math.round(Math.min(CHANCE_MAX, p) * 1000) / 1000;
}

/** 開始懷孕（除錯／收 RP5）。father：{id,name,role}。 */
export function conceive(who, { key = "", at = Date.now(), father = null, source = "" } = {}) {
  const b = body(who); if (!b || pregOf(who)) return null;
  const k = key || `p${at}`;
  b.pregKeys = [...(b.pregKeys || []), k].slice(-12);
  b.pregnancy = { key: k, at, father: { id: father?.id || "", name: father?.name || "不知名的男人", role: father?.role || "" }, source, told: false, medCost: 0 };
  return b.pregnancy;
}
/** RP5 受孕（world.pregnancyRp5）→ 收一次。 */
export function adoptServer(who) {
  const r = who?.world?.pregnancyRp5;
  if (!r || !r.key) return null;
  const b = body(who);
  if ((b.pregKeys || []).includes(r.key) || pregOf(who)) return null;
  return conceive(who, { key: r.key, at: Number(r.at) || Date.now(), father: { id: r.fatherId, name: r.father, role: r.role }, source: r.source || "" });
}
/** 舊召喚師線卡著的孕（world.pregnancy，沒有時間）→ 新規則，從現在算第 0 天。 */
export function migrateOld(who, now = Date.now()) {
  const old = who?.world?.pregnancy;
  if (!old || typeof old !== "object" || pregOf(who)) return null;
  const p = conceive(who, { key: `old${now}`, at: Number(old.at) > 1e11 ? Number(old.at) : now, father: { name: old.fatherName || "", role: old.fatherRole || "" }, source: "migrated" });
  who.world.pregnancy = null;
  return p;
}
/** 結束（生了／打掉／離開）：記 key，RP5 那邊也清（pregEnded）。 */
export function endPregnancy(who, why = "") {
  const b = body(who); const p = pregOf(who); if (!p) return null;
  b.pregEnded = [...(b.pregEnded || []), p.key].slice(-12);
  b.pregnancy = null;
  if (why === "birth") b.children = [...(b.children || []), { father: p.father?.name || "", at: Date.now() }];
  return p;
}
export function medCost(who, r = Math.random()) {
  const p = pregOf(who); if (!p) return 0;
  if (!p.medCost) p.medCost = MED_MIN + Math.floor(r * (MED_MAX - MED_MIN + 1));
  return p.medCost;
}
export function canBuyMed(gold, cost) {
  const g = Number(gold) || 0;
  if (g < 0) return { ok: false, why: "負債中，買不起藥" };
  if (g - cost < 0) return { ok: false, why: `藥要 ${cost} 金，金幣不夠` };
  return { ok: true, why: "" };
}
/** 你知道了嗎：女友以上跟你說過、或肚子看得出來。 */
export function known(who, now = Date.now()) { const p = pregOf(who); return !!p && (!!p.told || bellyOf(who, now) > 0); }
export function shouldTell(who) { const p = pregOf(who); return !!p && !p.told && band(stageKeyOf(who)) !== "low"; }

const TELL = {
  冷淡: ["……我懷孕了。不是你的。你想怎樣就說吧。", "跟你說一件事。我有了……是{father}的。"],
  溫柔: ["那個……我、我好像懷孕了……是{father}的……對不起……", "我有話跟你說……我懷孕了。孩子的爸爸是{father}……你會生氣嗎？"],
  熱絡: ["欸欸，跟你說喔……我懷孕了！是{father}的……你、你不要嚇到喔。", "我驗了……兩條線。是{father}的啦……怎麼辦？"],
  佔有: ["我懷孕了……是{father}的。可是我只要你，你不准丟下我。", "……肚子裡有小孩了，{father}的。你還要我嗎？"],
  反差: ["我……懷孕了……是{father}的……嗚，好丟臉……", "跟你說……我被{father}弄懷孕了……"],
};
const SYMPTOM = ["……嘔……抱歉，最近一直想吐……", "唔……胃好不舒服，聞到味道就噁心……", "沒事……只是有點頭暈想吐……", "最近好容易累……還一直反胃……"];
export function tellLine(who, r = Math.random()) {
  const p = pregOf(who); const pool = TELL[familyOf(who)] || TELL.溫柔;
  return pool[Math.floor(r * pool.length) % pool.length].replace("{father}", p?.father?.name || "別人");
}
export function symptomLine(r = Math.random()) { return SYMPTOM[Math.floor(r * SYMPTOM.length) % SYMPTOM.length]; }
export function birthText(name, father, fee) { return `${name}生下了${father || "不知名男人"}的孩子。育兒費 −${fee} 金。`; }
export function leaveText(name, stageKey) {
  return band(stageKeyOf({ stage: stageKey })) === "dating"
    ? `${name}快要生了……她留下一封信，離開了萬事屋，再也沒有回來。`
    : `${name}懷孕了，肚子一天天大起來……她沒有說再見，就這樣永遠離開了。`;
}
/** 房間聊天的背景（不照念）。 */
export function promptLines(who, now = Date.now()) {
  const p = pregOf(who); if (!p) return [];
  const d = Math.floor(dayOf(p, now)) + 1, b = band(stageKeyOf(who)), dad = p.father?.name || "別人";
  const out = [`【背景・懷孕・事實・勿主動照念】你懷孕第 ${d} 天（共 ${PREG_DAYS} 天），孩子的爸爸是${dad}${p.father?.role ? `（${p.father.role}）` : ""}，不是他的。${bellyOf(who, now) > 0 ? "肚子已經看得出來。" : ""}`];
  if (b === "wife") out.push("【懷孕・妻子】你會留下來把孩子生下來；他知道。可以撒嬌、不安或依賴，但不要每句都提。");
  else if (b === "dating") out.push(p.told ? "【懷孕・女友】你已經跟他說了。心裡不安，偶爾提到身體不舒服。" : "【懷孕・女友】還沒說出口，心裡掙扎。");
  else out.push("【懷孕・還不熟】不要跟他說懷孕的事；身體會不舒服（想吐、反胃、累），被問就含糊帶過。");
  return out;
}
