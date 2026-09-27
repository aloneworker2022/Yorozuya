/** 開放度：信任／接受度 0–100，與性奮分開；解鎖挑逗動作。 */

import { ensureBody } from "./body_state.js?v=9";

export const OPENNESS_MAX = 100;

/**
 * 動作解鎖門檻與成功後開放度增量。
 * unlock: openness >= openThr - affDisc  OR  arousal >= aroThr - affDisc2
 */
export const ACT_UNLOCK = {
  waist:         { label: "摟腰",     openThr: 0,  aroThr: 0,  gain: 2 },
  breast:        { label: "摸奶",     openThr: 8,  aroThr: 4,  gain: 3 },
  butt:          { label: "摸臀",     openThr: 8,  aroThr: 4,  gain: 3 },
  breast_knead:  { label: "揉奶",     openThr: 18, aroThr: 8,  gain: 4 },
  labia:         { label: "摸陰唇",   openThr: 32, aroThr: 12, gain: 5 },
  labia_rub:     { label: "揉陰唇",   openThr: 40, aroThr: 14, gain: 5 },
  breast_suck:   { label: "吸奶",     openThr: 28, aroThr: 10, gain: 4 },
  nipple_lick:   { label: "舔奶頭",   openThr: 35, aroThr: 12, gain: 4 },
  finger_in:     { label: "插入手指", openThr: 55, aroThr: 22, gain: 6 },
  vagina_finger: { label: "扣陰道",   openThr: 65, aroThr: 24, gain: 5 },
  cervix_rub:    { label: "揉子宮口", openThr: 78, aroThr: 26, gain: 4 },
};

/** 感情折扣：每 10 感情 → 開放度門檻 −3、性奮門檻 −1。 */
export function affectionDiscounts(affection) {
  const steps = Math.max(0, Math.floor((Number(affection) || 0) / 10));
  return { openDisc: steps * 3, aroDisc: steps * 1 };
}

function clampOpen(n) {
  return Math.max(0, Math.min(OPENNESS_MAX, Math.round(Number(n) || 0)));
}

export function ensureOpenness(who) {
  const b = ensureBody(who);
  if (!b) return null;
  b.openness = clampOpen(b.openness);
  return b;
}

export function getOpenness(who) {
  return ensureOpenness(who)?.openness || 0;
}

/**
 * @returns {{ ok: boolean, locked?: boolean, reason?: string, via?: string }}
 */
export function actOpennessLock(who, actId, affection = 0) {
  ensureOpenness(who);
  if (!who) return { ok: false, locked: true, reason: "尚無對象" };
  const row = ACT_UNLOCK[actId];
  if (!row) return { ok: true, locked: false }; // 未列門檻的動作（如 pull_out）另判
  const b = who.bodyState;
  const { openDisc, aroDisc } = affectionDiscounts(affection);
  const needOpen = Math.max(0, row.openThr - openDisc);
  const needAro = Math.max(0, row.aroThr - aroDisc);
  const open = b.openness || 0;
  const aro = b.arousal || 0;
  if (open >= needOpen) return { ok: true, locked: false, via: "openness" };
  if (aro >= needAro) return { ok: true, locked: false, via: "arousal" };
  return {
    ok: false,
    locked: true,
    reason: `需開放度≥${needOpen}或性奮≥${needAro}`,
  };
}

export function isOpennessUnlocked(who, actId, affection = 0) {
  return !!actOpennessLock(who, actId, affection).ok;
}

/** 成功執行動作後增加開放度。 */
export function gainOpenness(who, actId) {
  const b = ensureOpenness(who);
  if (!b) return { gained: 0, openness: 0 };
  const row = ACT_UNLOCK[actId];
  const add = row?.gain || 0;
  if (!add) return { gained: 0, openness: b.openness };
  const before = b.openness || 0;
  b.openness = clampOpen(before + add);
  return { gained: b.openness - before, openness: b.openness };
}

export function opennessHint(who, affection = 0) {
  const b = ensureOpenness(who);
  if (!b) return "";
  const open = b.openness || 0;
  const aro = b.arousal || 0;
  const { openDisc, aroDisc } = affectionDiscounts(affection);
  // 找下一個尚未解鎖的動作
  const order = [
    "waist", "breast", "butt", "breast_knead", "breast_suck", "nipple_lick",
    "labia", "labia_rub", "finger_in", "vagina_finger", "cervix_rub",
  ];
  for (const id of order) {
    const row = ACT_UNLOCK[id];
    if (!row) continue;
    const needOpen = Math.max(0, row.openThr - openDisc);
    const needAro = Math.max(0, row.aroThr - aroDisc);
    if (open >= needOpen || aro >= needAro) continue;
    return `開放度 ${open}・下一解鎖「${row.label}」需≥${needOpen}（或性奮≥${needAro}）`;
  }
  return `開放度 ${open}`;
}
