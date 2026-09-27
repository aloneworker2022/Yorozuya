/** 侵犯值 0–100：依關係階段倍率與失神抑制累加；滿值則逃離房間。 */

import { ensureBody } from "./body_state.js?v=9";

export const INVASION_MAX = 100;

/** 與 test_room_summon STAGE_LADDER key 對齊。 */
export const STAGE_INVASION_MULT = {
  stranger: 1.0,
  acquaintance: 0.85,
  friend: 0.7,
  close_friend: 0.55,
  girlfriend: 0.4,
  passionate: 0.28,
  lover: 0.18,
  wife: 0.12,
  devoted_wife: 0.06,
  obedient_wife: 0,
  pathological_wife: 0,
};

/** 陌生階段基礎亂數區間（含端點）。 */
export const INVASION_RANGES = {
  waist:         [15, 20],
  breast:        [22, 28],
  butt:          [22, 28],
  breast_knead:  [28, 35],
  breast_suck:   [30, 38],
  nipple_lick:   [30, 38],
  labia:         [35, 45],
  labia_rub:     [42, 52],
  finger_in:     [50, 65],
  vagina_finger: [55, 70],
  cervix_rub:    [60, 80],
  // 抽出不另加侵犯（或極低）；未列則 0
  pull_out:      [0, 0],
};

function clampInv(n) {
  return Math.max(0, Math.min(INVASION_MAX, Math.round(Number(n) || 0)));
}

function randInclusive(lo, hi) {
  const a = Math.round(Number(lo) || 0);
  const b = Math.round(Number(hi) || 0);
  const min = Math.min(a, b);
  const max = Math.max(a, b);
  return min + Math.floor(Math.random() * (max - min + 1));
}

export function ensureInvasion(who) {
  const b = ensureBody(who);
  if (!b) return null;
  b.invasion = clampInv(b.invasion);
  return b;
}

export function getInvasion(who) {
  return ensureInvasion(who)?.invasion || 0;
}

export function stageInvasionMult(stageKey) {
  const key = String(stageKey || "stranger");
  if (key in STAGE_INVASION_MULT) return STAGE_INVASION_MULT[key];
  return STAGE_INVASION_MULT.stranger;
}

/**
 * round(rand(lo,hi) * stageMult * (1 - stun/150))
 * mult 0 → add 0
 * @returns {{ added: number, invasion: number, fled: boolean }}
 */
export function applyInvasionRoll(who, actId, { stage = "stranger", stun = 0 } = {}) {
  const b = ensureInvasion(who);
  if (!b) return { added: 0, invasion: 0, fled: false };
  const range = INVASION_RANGES[actId];
  if (!range) return { added: 0, invasion: b.invasion || 0, fled: false };
  const mult = stageInvasionMult(stage);
  if (mult <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX };
  }
  const [lo, hi] = range;
  if (hi <= 0 && lo <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX };
  }
  const base = randInclusive(lo, hi);
  const stunDamp = Math.max(0, 1 - (Math.max(0, Number(stun) || 0) / 150));
  const added = Math.round(base * mult * stunDamp);
  b.invasion = clampInv((b.invasion || 0) + added);
  return {
    added,
    invasion: b.invasion,
    fled: b.invasion >= INVASION_MAX,
  };
}

/** 閒聊／閒置輕微衰減：預設 −1..2。 */
export function decayInvasion(who, amount = null) {
  const b = ensureInvasion(who);
  if (!b) return 0;
  const drop = amount == null
    ? (1 + Math.floor(Math.random() * 2)) // 1 or 2
    : Math.max(0, Math.round(Number(amount) || 0));
  const before = b.invasion || 0;
  b.invasion = clampInv(before - drop);
  return before - b.invasion;
}

export function clearInvasion(who) {
  const b = ensureInvasion(who);
  if (!b) return;
  b.invasion = 0;
}

export function invasionHint(who) {
  const inv = getInvasion(who);
  return `侵犯 ${inv}/${INVASION_MAX}`;
}

/** 依「本回合」侵犯增益決定抗議語氣階（非總表）。 */
export function protestTone(gain) {
  const g = Math.max(0, Math.round(Number(gain) || 0));
  if (g <= 1) {
    return {
      gain: g,
      tier: "none",
      label: "幾乎無抗拒",
      promptLine: "",
      scraps: [],
    };
  }
  if (g <= 5) {
    return {
      gain: g,
      tier: "light",
      label: "輕微推拒／害羞",
      promptLine:
        "本回合侵犯感只微微增加。語氣輕推、害羞或軟軟的不悅即可，不要大吼，也不要完全配合。",
      scraps: ["……別、別這樣…", "嗯…有點過分…", "你幹嘛…", "稍微…離遠一點…"],
    };
  }
  if (g <= 12) {
    return {
      gain: g,
      tier: "clear",
      label: "明顯抗議",
      promptLine:
        "本回合侵犯感明顯上升。要用清楚抗議、較硬的語氣拒絕；可以生氣，但不要空白或求饒（失神另論）。",
      scraps: ["放開…！", "不要碰我！", "太過分了…", "給我住手！", "你有病啊…"],
    };
  }
  if (g <= 19) {
    return {
      gain: g,
      tier: "harsh",
      label: "嚴厲斥責",
      promptLine:
        "本回合侵犯感大幅上升。必須嚴厲斥責、提高音量、要求立刻住手；語氣兇、可以罵人；不准平靜、不准害羞軟語、不准享受。",
      scraps: ["給我住手！！", "放開！你幹嘛碰我！", "太過分了吧！？", "再碰我就翻臉！", "滾——別碰我！"],
    };
  }
  return {
    gain: g,
    tier: "furious",
    label: "暴怒／要離開",
    promptLine:
      "本回合侵犯感暴衝。必須暴怒痛罵、揚言要離開或推開對方；語氣失控。不准平靜、不准配合。",
    scraps: ["夠了！！我要走了！", "再碰我一下試試！", "滾！別靠近我！", "受不了了——放開！", "再這樣我真的離開！"],
  };
}

/**
 * 給 LLM 的本回合抗議指令（無增益則空字串）。
 * @param {number} gain 本回合 added
 * @param {{ invasion?: number, max?: number }} [opts]
 */
export function protestPromptBlock(gain, { invasion = null, max = INVASION_MAX } = {}) {
  const p = protestTone(gain);
  if (p.tier === "none" || !p.promptLine) return "";
  const near =
    invasion != null && Number(invasion) >= max - 15
      ? "（侵犯感已接近上限，可暗示再繼續就離開。）"
      : "";
  return `【本回合抗議語氣・侵犯＋${p.gain}・${p.label}】${p.promptLine}${near}只准說出口的話，不要旁白。`;
}

function pickScrap(scraps) {
  if (!scraps?.length) return "";
  return scraps[Math.floor(Math.random() * scraps.length)];
}

const PROTEST_CUE = /住手|放開|滾|過分|離|走|不准|別碰|不要碰|給我|有病|翻臉/;

/**
 * 後處理：高增益時確保回覆聽得出抗議（低增益幾乎不動）。
 * 痙攣／空白／求饒／失神路徑不應呼叫此函式。
 */
export function blendProtestReply(text, gain) {
  const p = protestTone(gain);
  const raw = String(text || "").trim();
  if (p.tier === "none") return raw || "……";

  if (p.tier === "light") {
    if (PROTEST_CUE.test(raw) || Math.random() < 0.55) return raw || "……";
    const scrap = pickScrap(p.scraps);
    if (!scrap) return raw || "……";
    if (!raw) return scrap;
    return `${scrap}${raw}`.slice(0, 80);
  }

  const scrap = pickScrap(p.scraps);
  if (p.tier === "clear") {
    if (PROTEST_CUE.test(raw)) return raw || scrap || "……";
    if (!raw) return scrap || "……";
    return `${scrap}${raw}`.slice(0, 72);
  }

  // harsh / furious：一定要聽得出斥責
  if (PROTEST_CUE.test(raw)) {
    return raw.length > 72 ? `${raw.slice(0, 70)}！` : raw;
  }
  if (!raw) return scrap || "給我住手！！";
  return `${scrap}${raw}`.slice(0, 80);
}
