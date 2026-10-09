/* 交友線（2026-10-10）：見過 → 認識 → 朋友 → 曖昧 → 肉體 → 炮友。規則在 RP5（server/life_friends.py），
 * 這裡只有：同一套數字（tests 會比對）、手機收「外面做愛留下的痕跡」、test_room 的名單。
 * 跟退役的 NTR_ON／SUMMONER／CRAVE 無關；舊的 world.friends（BOND_ZH）那條線被這條取代。 */
import { ensureBody } from "./body_state.js?v=20";
import { addSessions } from "./organ_dev.js?v=1";

export const FRIEND_STAGES = ["seen", "known", "friend", "flirt", "physical", "fwb"];
export const FRIEND_STAGE_ZH = { seen: "見過", known: "認識", friend: "朋友", flirt: "曖昧", physical: "肉體", fwb: "炮友" };
export const FRIEND_INTENT_ZH = { friendly: "單純友善", court: "想追她", lust: "只想上床", danger: "危險人物" };
export const ROLE_EASE = { 同事: 1.0, 顧客: 0.6, 路人: 0.45 };
export const STEP_BASE = { seen: 0.5, known: 0.5, friend: 0.3, flirt: 0.3, physical: 0.3 };
export const SEX_BASE = { physical: 0.35, fwb: 0.55 };
export const BAND_GATE = { reserved: 1.0, friend: 0.85, dating: 0.25, wife: 0.08 };
export const LOYALTY_K = { reserved: 0.2, friend: 0.3, dating: 0.6, wife: 0.9 };
export const SEX_HUNGER_RELIEF = 30;
export const LOYALTY_PER_SEX = 1;
export const NAKED_CHANCE = 0.7;
export const NAKED_MAX = 15;
export const NAKED_STRANGER = 0.6;
export const NAKED_ANON_BELOW = 5;
export const NAKED_FWB_ABOVE = 10;
/* 痕跡多久內進房間還看得到（之後只剩記憶；器官開發場數照算）。 */
export const TRACE_FRESH_MS = 12 * 3600e3;

/** 舊 met 列沒有 stage：有名字＝認識，不然見過。 */
export function friendStageOf(row) {
  if (FRIEND_STAGES.includes(row?.stage)) return row.stage;
  return row?.named ? "known" : "seen";
}

/** test_room 名單：照階排，高的在前。 */
export function friendRows(who) {
  const met = Array.isArray(who?.world?.met) ? who.world.met : [];
  return met
    .filter((m) => m && typeof m === "object")
    .map((m) => ({
      id: m.id,
      name: m.named || FRIEND_STAGES.indexOf(friendStageOf(m)) >= 1 ? m.name : `（${m.role || "路人"}）`,
      role: m.role || "",
      where: m.where || "",
      stage: friendStageOf(m),
      stageZh: FRIEND_STAGE_ZH[friendStageOf(m)],
      intent: m.intent || "",
      intentZh: FRIEND_INTENT_ZH[m.intent] || "",
      sexCount: Number(m.sexCount) || 0,
      count: Number(m.count) || 0,
    }))
    .sort((a, b) => FRIEND_STAGES.indexOf(b.stage) - FRIEND_STAGES.indexOf(a.stage) || b.count - a.count);
}

/**
 * 進房間時收外面做愛的痕跡（world.lifeTraces，RP5 給；bodyState.lifeTraceSeq 記收到第幾筆）。
 * 新鮮的（TRACE_FRESH_MS 內）：子宮精液、陰唇濕、陰道濕；每一場都算一次器官開發（「一場做愛算一次」）。
 * 回傳收了幾筆，以及最新那筆是不是新鮮的（給餘韻用）。
 */
export function applyLifeTraces(who, now = Date.now()) {
  const traces = Array.isArray(who?.world?.lifeTraces) ? who.world.lifeTraces : [];
  const b = ensureBody(who);
  if (!b || !traces.length) return { taken: 0, fresh: null };
  const seen = Math.floor(Number(b.lifeTraceSeq) || 0);
  const fresh = [];
  let taken = 0;
  for (const t of traces) {
    const seq = Math.floor(Number(t?.seq) || 0);
    if (seq <= seen) continue;
    taken++;
    try { addSessions(who, "sex", 1, now); } catch { /* 開發關掉時不管 */ }
    if (now - (Number(t.at) || 0) <= TRACE_FRESH_MS) fresh.push(t);
  }
  b.lifeTraceSeq = Math.max(seen, ...traces.map((t) => Math.floor(Number(t?.seq) || 0)));
  if (fresh.length) {
    const o = b.organs;
    const rounds = fresh.reduce((n, t) => n + (Number(t.rounds) || 1), 0);
    if (o?.uterus) o.uterus.semen = Math.min(3, (Number(o.uterus.semen) || 0) + Math.min(3, rounds));
    if (o?.labia) { o.labia.wet = true; o.labia.swell = Math.min(3, Math.max(Number(o.labia.swell) || 0, rounds >= 8 ? 2 : 1)); }
    if (o?.vagina) o.vagina.wet = Math.min(3, Math.max(Number(o.vagina.wet) || 0, 2));
  }
  return { taken, fresh: fresh.length ? fresh[fresh.length - 1] : null };
}

/** 剛在外面做過（lastAffair 在痕跡新鮮期內）→ 給房間聊天的 friendPhysicalPromptLines 用，形狀跟舊 world.friendSex 一樣。 */
export function recentAffair(who, now = Date.now()) {
  const a = who?.world?.lastAffair;
  if (!a || typeof a !== "object" || now - (Number(a.at) || 0) > TRACE_FRESH_MS) return null;
  const rounds = Number(a.rounds) || 1;
  const kind = a.kind === "fwb_again" || a.kind === "fwb" ? a.kind : "physical";
  return {
    name: a.name || (a.kind === "naked" ? "陌生人" : "對方"),
    kind,
    naked: a.kind === "naked",
    intensity: rounds >= 8 ? "marathon" : rounds >= 3 ? "continuous" : "",
    at: Number(a.at) || 0,
  };
}
