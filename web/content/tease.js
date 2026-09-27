/** 房間調情：開放度／性奮解鎖動作（取代按次階梯）。 */

import { ensureBody, talkActById, TALK_ACTS } from "./body_state.js?v=8";
import {
  ensureOpenness,
  actOpennessLock,
  isOpennessUnlocked,
  gainOpenness,
  opennessHint,
  ACT_UNLOCK,
} from "./openness.js?v=1";

export const INSERT_ACT = "finger_in";
export const PULL_ACT = "pull_out";

/** 相容舊呼叫：胸部分支不再靠 teaseStage。 */
export const BREAST_ACTS = new Set([
  "breast", "breast_knead", "breast_suck", "nipple_lick", "nipple",
]);

/** @deprecated 舊按次階梯；保留空殼以免舊存檔炸。 */
export const TEASE_LADDER = [
  { id: "waist", label: "摟腰", stage: 0 },
  { id: "breast", label: "摸奶", stage: 1 },
  { id: "labia", label: "摸陰唇", stage: 2 },
  { id: "finger_in", label: "插入手指", stage: 3 },
  { id: "cervix_rub", label: "揉子宮口", stage: 4 },
];

export function ensureTeaseFields(who) {
  const b = ensureBody(who);
  if (!b) return null;
  ensureOpenness(who);
  if (!b.teaseCounts || typeof b.teaseCounts !== "object") b.teaseCounts = {};
  b.teaseStage = Math.max(0, Math.min(4, Math.round(Number(b.teaseStage) || 0)));
  b.teaseProgress = Math.max(0, Math.round(Number(b.teaseProgress) || 0));
  return b;
}

export function affectionOf(who) {
  return Math.max(0, Math.round(Number(who?.affection) || 0));
}

export function pullUnlocked(who) {
  const b = ensureTeaseFields(who);
  if (!b) return false;
  const stuffed = b.organs?.vagina?.stuffed || "";
  return stuffed === "fingers" || stuffed === "vibe" || stuffed === "dildo"
    || stuffed === "cucumber" || stuffed === "penis";
}

/** 插入手指是否已解鎖（開放度或性奮＋感情折扣）。 */
export function insertUnlocked(who) {
  return isOpennessUnlocked(who, INSERT_ACT, affectionOf(who));
}

/**
 * @returns {{ ok: boolean, reason?: string, locked?: boolean }}
 */
export function actLockState(who, actId) {
  ensureTeaseFields(who);
  if (!who) return { ok: false, locked: true, reason: "尚無對象" };
  const act = talkActById(actId);
  if (!act) return { ok: false, locked: true, reason: "未知動作" };

  if (actId === PULL_ACT) {
    if (pullUnlocked(who)) return { ok: true, locked: false };
    return { ok: false, locked: true, reason: "裡面是空的" };
  }

  // 列在 ACT_UNLOCK 的走開放度／性奮；其餘預設開放
  if (ACT_UNLOCK[actId]) {
    return actOpennessLock(who, actId, affectionOf(who));
  }
  return { ok: true, locked: false };
}

export function isActUnlocked(who, actId) {
  return !!actLockState(who, actId).ok;
}

/**
 * 成功執行動作後：累開放度（不再用按次推進 teaseStage）。
 * @returns {{ advanced: boolean, teaseStage: number, openness: number, gained: number }}
 */
export function recordTeasePress(who, actId) {
  const b = ensureTeaseFields(who);
  if (!b) return { advanced: false, teaseStage: 0, openness: 0, gained: 0 };
  b.teaseCounts[actId] = (b.teaseCounts[actId] || 0) + 1;
  if (actId === PULL_ACT) {
    return { advanced: false, teaseStage: b.teaseStage, openness: b.openness || 0, gained: 0 };
  }
  const { gained, openness } = gainOpenness(who, actId);
  return {
    advanced: gained > 0,
    teaseStage: b.teaseStage,
    openness,
    gained,
  };
}

export function teaseHint(who) {
  const b = ensureTeaseFields(who);
  if (!b) return "";
  const openLine = opennessHint(who, affectionOf(who));
  const inv = b.invasion || 0;
  return `${openLine}・侵犯 ${inv}/100`;
}

/** 按鈕列順序（與 TALK_ACTS 對齊；鎖住的由 availableActs 濾掉）。 */
export function orderedTalkActs() {
  const order = [
    "waist", "breast", "butt", "breast_knead",
    "breast_suck", "nipple_lick",
    "labia", "labia_rub",
    "finger_in", "vagina_finger", "cervix_rub",
    "pull_out",
  ];
  const byId = Object.fromEntries(TALK_ACTS.map((a) => [a.id, a]));
  return order.map((id) => byId[id]).filter(Boolean);
}

/** 只回傳目前可顯示的動作（鎖住的不出現）。 */
export function availableActs(who, opts = {}) {
  const can = opts.canTease !== false;
  const acts = orderedTalkActs();
  if (!can) return [];
  return acts.filter((a) => isActUnlocked(who, a.id));
}

/**
 * 閒置衰減：性奮／器官腫濕／衝擊往基線。
 * 陰道塞著假陰莖(dildo)時幾乎不衰減（保持被填滿狀態）。
 */
export function decayBodyIdle(who) {
  const b = ensureTeaseFields(who);
  if (!b) return null;
  const o = b.organs;
  const stuffed = o?.vagina?.stuffed || "";
  const dildoHold = stuffed === "dildo";
  if (dildoHold) {
    if ((b.shock || 0) > 0) b.shock = Math.max(0, (b.shock || 0) - 1);
    return b;
  }
  b.arousal = Math.max(0, (b.arousal || 0) - 1);
  if ((b.shock || 0) > 0) b.shock = Math.max(0, (b.shock || 0) - 3);
  const soft = (part, key, step = 1) => {
    if (!o[part]) return;
    if (typeof o[part][key] === "number" && o[part][key] > 0) {
      o[part][key] = Math.max(0, o[part][key] - step);
    }
  };
  soft("nipples", "swell");
  soft("breasts", "swell");
  soft("clit", "swell");
  soft("labia", "swell");
  soft("vagina", "wet");
  if (o.nipples?.wet && Math.random() < 0.45) o.nipples.wet = false;
  if (o.clit?.wet && Math.random() < 0.4) o.clit.wet = false;
  if (o.labia?.wet && Math.random() < 0.4) o.labia.wet = false;
  if (stuffed === "fingers" && (b.arousal || 0) <= 4 && Math.random() < 0.15) {
    o.vagina.stuffed = "";
  }
  return b;
}
