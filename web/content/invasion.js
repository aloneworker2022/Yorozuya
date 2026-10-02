/** 侵犯值 0–100：依關係階段倍率與失神抑制累加；滿值則逃離房間。 */

import { ensureBody, arousalStage, libidoStage } from "./body_state.js?v=9";

export const INVASION_MAX = 100;
/** 時間衰減：每滿 20 分鐘真實時間才 −1..2（2026-10-02 使用者：原本每 5 秒閒置扣太快）。 */
export const INVASION_TIME_STEP_MS = 20 * 60 * 1000;

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
  const at = Number(b.invasionDecayAt);
  b.invasionDecayAt = Number.isFinite(at) && at > 0 ? at : 0;
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
 * 半推半就（2026-10-03 使用者）：她自己被撩起來／性慾高時，侵犯增益打折。
 * 依興奮階段：none 1.0、slight 0.85、aroused 0.6、wantFill 0.35、climax 0.2；
 * 性慾階段再乘：high ×0.9、peak ×0.8（low/mid ×1）。
 * 關係下限（只對侵入性動作：區間下限 ≥35，即 labia 以上）：陌生 0.6、認識 0.5、朋友 0.4、好友 0.3；女友以上無下限。
 * willing（語氣改「半推半就」）＝最終倍率 ≤0.6，且不是陌生／認識被下限頂住的侵入性動作。
 */
export const AROUSAL_INVASION_MULT = { none: 1.0, slight: 0.85, aroused: 0.6, wantFill: 0.35, climax: 0.2 };
export const LIBIDO_INVASION_MULT = { low: 1.0, mid: 1.0, high: 0.9, peak: 0.8 };
export const INVASIVE_FLOOR = { stranger: 0.6, acquaintance: 0.5, friend: 0.4, close_friend: 0.3 };
export const WILLING_AT = 0.6;
const INVASIVE_LO = 35;

/** @returns {{ mult: number, raw: number, floored: boolean, willing: boolean }} */
export function arousalInvasionMult(arousal = 0, libido = 0, { stage = "stranger", actId = "" } = {}) {
  const raw = (AROUSAL_INVASION_MULT[arousalStage(arousal)] ?? 1)
    * (LIBIDO_INVASION_MULT[libidoStage(libido)] ?? 1);
  const range = INVASION_RANGES[actId];
  const invasive = !!range && range[0] >= INVASIVE_LO;
  const floor = invasive ? (INVASIVE_FLOOR[String(stage || "stranger")] ?? 0) : 0;
  const mult = Math.round(Math.max(raw, floor) * 1000) / 1000;
  const floored = floor > raw;
  const lowStage = stage === "stranger" || stage === "acquaintance" || !stage;
  const willing = mult <= WILLING_AT && !(floored && lowStage);
  return { mult, raw: Math.round(raw * 1000) / 1000, floored, willing };
}

/**
 * round(rand(lo,hi) * stageMult * (1 - stun/150) * arousalMult)
 * mult 0 → add 0。arousal/libido 不給就讀 bodyState（應在 applyAct 之後呼叫）。
 * @returns {{ added: number, invasion: number, fled: boolean, arousalMult: number, willing: boolean }}
 */
export function applyInvasionRoll(who, actId, { stage = "stranger", stun = 0, arousal = null, libido = null } = {}) {
  const b = ensureInvasion(who);
  if (!b) return { added: 0, invasion: 0, fled: false, arousalMult: 1, willing: false };
  const am = arousalInvasionMult(
    arousal == null ? b.arousal : arousal,
    libido == null ? b.libido : libido,
    { stage, actId },
  );
  const extra = { arousalMult: am.mult, willing: am.willing };
  const range = INVASION_RANGES[actId];
  if (!range) return { added: 0, invasion: b.invasion || 0, fled: false, ...extra };
  const mult = stageInvasionMult(stage);
  if (mult <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX, ...extra };
  }
  const [lo, hi] = range;
  if (hi <= 0 && lo <= 0) {
    return { added: 0, invasion: b.invasion || 0, fled: (b.invasion || 0) >= INVASION_MAX, ...extra };
  }
  const base = randInclusive(lo, hi);
  const stunDamp = Math.max(0, 1 - (Math.max(0, Number(stun) || 0) / 150));
  const added = Math.round(base * mult * stunDamp * am.mult);
  const before = b.invasion || 0;
  b.invasion = clampInv(before + added);
  // 從 0 開始累積：時間衰減從現在起算（不拿舊時間戳一口氣扣）
  if (before <= 0 && b.invasion > 0) b.invasionDecayAt = Date.now();
  return {
    added,
    invasion: b.invasion,
    fled: b.invasion >= INVASION_MAX,
    ...extra,
  };
}

/** 每句閒聊回覆的輕微衰減：預設 −1..2（時間衰減另走 decayInvasionByTime）。 */
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

/**
 * 時間衰減：以 bodyState.invasionDecayAt（隨 bodyState 存檔，重新整理／換裝置不會重置）計算，
 * 每滿 INVASION_TIME_STEP_MS（20 分鐘）扣一次 −1..2；關掉很久就補 floor(經過/20分) 次，最多扣到 0。
 * 侵犯為 0 時只把時鐘推到現在（下次累積從頭算 20 分鐘）。
 * @returns {number} 實際扣掉的量
 */
export function decayInvasionByTime(who, now = Date.now(), rng = Math.random) {
  const b = ensureInvasion(who);
  if (!b) return 0;
  const t = Number(now) || Date.now();
  const at = Number(b.invasionDecayAt) || 0;
  if ((b.invasion || 0) <= 0 || at <= 0 || at > t + 60 * 1000) {
    b.invasionDecayAt = t;   // 沒有侵犯／沒有時鐘／時鐘在未來（換裝置時差）→ 從現在起算
    return 0;
  }
  const steps = Math.floor((t - at) / INVASION_TIME_STEP_MS);
  if (steps <= 0) return 0;
  b.invasionDecayAt = at + steps * INVASION_TIME_STEP_MS;
  const before = b.invasion || 0;
  let drop = 0;
  for (let i = 0; i < steps && drop < before; i++) drop += 1 + Math.floor(rng() * 2);
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

const TOKEN_TONE = {
  tier: "token",
  label: "半推半就",
  promptLine:
    "你自己其實也被撩起來了、有點想要：嘴上輕輕說不要（像「不要啦…」「討厭，你很壞欸…」），但不是真的拒絕，不推開他、不生氣斥責，語氣軟、帶點撒嬌或嗔怪；依你的個性表現（嘴硬的就嘴硬、害羞的就小聲）。若身體刺激規則允許才可帶喘／斷字，否則說完整句子。",
  scraps: ["不要啦……", "討厭，你很壞欸……", "別在這裡啦……", "你、你真的很壞……", "說了不要了啦……"],
};

/**
 * 依「本回合」侵犯增益決定抗議語氣階（非總表）。
 * opts.willing（半推半就）：light／clear 改為 token；harsh／furious 不變（關係太低或動作太過仍會真的抗拒）。
 */
export function protestTone(gain, { willing = false } = {}) {
  const g = Math.max(0, Math.round(Number(gain) || 0));
  if (willing && g > 1 && g <= 12) return { gain: g, ...TOKEN_TONE };
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
 * @param {{ invasion?: number, max?: number, willing?: boolean }} [opts]
 */
export function protestPromptBlock(gain, { invasion = null, max = INVASION_MAX, willing = false } = {}) {
  const p = protestTone(gain, { willing });
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
const TOKEN_CUE = /不要|討厭|壞|別|才不|不行|笨蛋|色狼/;

export function blendProtestReply(text, gain, { willing = false } = {}) {
  const p = protestTone(gain, { willing });
  const raw = String(text || "").trim();
  if (p.tier === "none") return raw || "……";

  if (p.tier === "token") {
    // 半推半就：嘴上有一點「不要」就好，不硬塞斥責
    if (TOKEN_CUE.test(raw) || Math.random() < 0.5) return raw || pickScrap(p.scraps) || "……";
    const scrap = pickScrap(p.scraps);
    if (!raw) return scrap || "……";
    return `${scrap}${raw}`.slice(0, 80);
  }

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
