/** 房間調情階梯：週邊→陰部→插入解鎖。 */

import { ensureBody, talkActById, TALK_ACTS } from "./body_state.js?v=7";

/** 主階梯（不含胸／抽出）。index = teaseStage 門檻。 */
export const TEASE_LADDER = [
  { id: "waist", label: "摸腰", stage: 0 },
  { id: "butt", label: "揉臀", stage: 1 },
  { id: "thigh", label: "撫大腿", stage: 2 },
  { id: "labia", label: "撫陰唇", stage: 3 },
  { id: "clit", label: "摸陰蒂", stage: 4 },
];

export const BREAST_ACTS = new Set(["breast", "nipple"]);
export const INSERT_ACT = "finger_in";
export const PULL_ACT = "pull_out";

/** 插入所需：已解鎖陰蒂階 + 性奮門檻 */
export const INSERT_MIN_STAGE = 4;
export const INSERT_MIN_AROUSAL = 30;

const PRESSES_PER_ADVANCE = 4;

export function ensureTeaseFields(who) {
  const b = ensureBody(who);
  if (!b) return null;
  if (!b.teaseCounts || typeof b.teaseCounts !== "object") b.teaseCounts = {};
  b.teaseStage = Math.max(0, Math.min(INSERT_MIN_STAGE, Math.round(Number(b.teaseStage) || 0)));
  b.teaseProgress = Math.max(0, Math.round(Number(b.teaseProgress) || 0));
  return b;
}

export function ladderStageOf(actId) {
  const row = TEASE_LADDER.find((a) => a.id === actId);
  return row ? row.stage : -1;
}

export function insertUnlocked(who) {
  const b = ensureTeaseFields(who);
  if (!b) return false;
  return b.teaseStage >= INSERT_MIN_STAGE && (b.arousal || 0) >= INSERT_MIN_AROUSAL;
}

export function pullUnlocked(who) {
  const b = ensureTeaseFields(who);
  if (!b) return false;
  const stuffed = b.organs?.vagina?.stuffed || "";
  return stuffed === "fingers" || stuffed === "vibe" || stuffed === "dildo" || stuffed === "cucumber" || stuffed === "penis";
}

/**
 * @returns {{ ok: boolean, reason?: string, locked?: boolean }}
 */
export function actLockState(who, actId) {
  ensureTeaseFields(who);
  if (!who) return { ok: false, locked: true, reason: "尚無對象" };
  const act = talkActById(actId);
  if (!act) return { ok: false, locked: true, reason: "未知動作" };

  if (BREAST_ACTS.has(actId)) {
    return { ok: true, locked: false };
  }
  if (actId === PULL_ACT) {
    if (pullUnlocked(who)) return { ok: true, locked: false };
    return { ok: false, locked: true, reason: "裡面是空的" };
  }
  if (actId === INSERT_ACT) {
    const b = who.bodyState;
    if (b.teaseStage < INSERT_MIN_STAGE) {
      return { ok: false, locked: true, reason: "先挑逗到陰蒂" };
    }
    if ((b.arousal || 0) < INSERT_MIN_AROUSAL) {
      return { ok: false, locked: true, reason: `性奮需≥${INSERT_MIN_AROUSAL}` };
    }
    return { ok: true, locked: false };
  }
  const stage = ladderStageOf(actId);
  if (stage < 0) return { ok: true, locked: false };
  if (stage <= (who.bodyState.teaseStage || 0)) return { ok: true, locked: false };
  const prev = TEASE_LADDER[stage - 1];
  return {
    ok: false,
    locked: true,
    reason: prev ? `先多${prev.label}` : "尚未解鎖",
  };
}

export function isActUnlocked(who, actId) {
  return !!actLockState(who, actId).ok;
}

/**
 * 成功執行動作後推進階梯。胸部分支不加階；只加性奮貢獻（由 applyAct 處理）。
 * @returns {{ advanced: boolean, teaseStage: number }}
 */
export function recordTeasePress(who, actId) {
  const b = ensureTeaseFields(who);
  if (!b) return { advanced: false, teaseStage: 0 };
  b.teaseCounts[actId] = (b.teaseCounts[actId] || 0) + 1;

  if (BREAST_ACTS.has(actId) || actId === INSERT_ACT || actId === PULL_ACT) {
    return { advanced: false, teaseStage: b.teaseStage };
  }

  const stage = ladderStageOf(actId);
  if (stage < 0 || stage > b.teaseStage) {
    return { advanced: false, teaseStage: b.teaseStage };
  }

  // 當前或更早階的按壓累積進度
  b.teaseProgress = (b.teaseProgress || 0) + 1;
  let advanced = false;
  if (b.teaseProgress >= PRESSES_PER_ADVANCE && b.teaseStage < INSERT_MIN_STAGE) {
    b.teaseStage += 1;
    b.teaseProgress = 0;
    advanced = true;
  }
  return { advanced, teaseStage: b.teaseStage };
}

export function teaseHint(who) {
  const b = ensureTeaseFields(who);
  if (!b) return "";
  if (insertUnlocked(who)) return "可插入";
  if (b.teaseStage >= INSERT_MIN_STAGE) {
    return `性奮 ${b.arousal || 0}/${INSERT_MIN_AROUSAL}`;
  }
  const next = TEASE_LADDER[b.teaseStage + 1];
  const cur = TEASE_LADDER[b.teaseStage];
  const need = PRESSES_PER_ADVANCE - (b.teaseProgress || 0);
  if (!next) return cur ? cur.label : "";
  return `${cur.label}再${need}次→${next.label}`;
}

/** 供按鈕列渲染的有序動作（與 TALK_ACTS 一致，若缺則回 TALK_ACTS）。 */
export function orderedTalkActs() {
  const order = [
    "waist", "butt", "thigh", "labia", "clit",
    "breast", "nipple", "finger_in", "pull_out",
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
    // 假陰莖撐著：只微降衝擊，保持性奮與濕腫
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
  // 手指／一般填充：緩慢變乾；精液／陰莖另議，這裡不自動拔出
  if (stuffed === "fingers" && (b.arousal || 0) <= 4 && Math.random() < 0.15) {
    o.vagina.stuffed = "";
  }
  return b;
}
