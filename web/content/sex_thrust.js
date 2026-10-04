/**
 * 肏（抽插）互動的數值與排程（2026-10-04，test_room 閘門 data-sex-poses；純邏輯，房間 UI 在 test_room_summon.js）。
 *
 * 每按一下「肏」＝一次抽插：
 *   - 激情度（她）+1～2：拿到 2 的機率看性奮（arousal 0–100）與關係階；激情 >20 → 她高潮（④ 高潮圖 → ⑤ 潮吹圖），
 *     感情 +10，激情只降一點（−3），之後更容易連續高潮。高潮判定在她那句話打完之後（不擋按鈕）。
 *   - 玩家興奮 +5～8：到 100 → 射精（⑥ 內射圖，預設 creampie），興奮歸零。
 *   - 精液池：這一場從 18cc 開始，每射一次 −6cc（可到負）；<6 或下一次射完就見底 → 危險提示；<1 → 這次射完就結束。
 *   - 每下感情 +1。
 *   - 換圖：每下 1/3 機率在抽插期的圖（加入／抽插）之間換一張；高潮／潮吹／內射是事件圖。
 *   - 局部動畫（舊做愛系統的四幀）：第一下播 1-2-3-4，之後每下播 2-3-4，播放中藏「肏」。
 * 她的台詞：每下都要一句，但跟動畫／數值脫鉤（ThrustReplyPump）：
 *   - 正在等 AI 時先顯示本地喘息（啊…嗯…）；AI 回來後逐字貼上（呻吟字 ~0.08s、一般字 ~0.12s）。
 *   - 只留最新一下的請求（舊的丟掉）；一句打完時，0.8 秒內有按過「肏」就立刻開下一句。
 */

export const THRUST = {
  SEMEN_START_CC: 18,
  SEMEN_PER_EJAC_CC: 6,
  SEMEN_WARN_BELOW: 6,
  SEMEN_END_BELOW: 1,
  EXCITE_MIN: 5,
  EXCITE_MAX: 8,
  EXCITE_CUM_AT: 100,
  PASSION_ORGASM_ABOVE: 20,
  PASSION_ORGASM_DROP: 3,
  AFF_PER_THRUST: 1,
  AFF_PER_ORGASM: 10,
  SWITCH_CHANCE: 1 / 3,
  /** 舊做愛系統：首輪慢快快慢 1–4；連按只播 2–4。 */
  FIRST_HOLDS: [300, 180, 180, 300],
  CONTINUE_HOLDS: [180, 180, 300],
  TYPE_MOAN_MS: 80,
  TYPE_WORD_MS: 120,
  CHAIN_WINDOW_MS: 800,
  /** 她那句一直沒回來：最多等這麼久就先把換圖／高潮判定做掉（不讓 AI 卡住畫面）。 */
  DEFER_MAX_MS: 8000,
  /** 事件圖（高潮、潮吹、內射）至少停留。 */
  EVENT_HOLD_MS: 2400,
};

/** 關係階 → 0..1（與 test_room_summon STAGE_LADDER 對齊）。 */
export const THRUST_STAGE_ORDER = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];

export function stageFactor(stageKey) {
  const i = THRUST_STAGE_ORDER.indexOf(String(stageKey || "stranger"));
  return i < 0 ? 0 : i / (THRUST_STAGE_ORDER.length - 1);
}

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, Number(n) || 0));
}

export function newThrustSession(opts = {}) {
  return {
    thrusts: 0,
    passion: 0,
    excite: 0,
    semen: Number.isFinite(opts.semenCc) ? opts.semenCc : THRUST.SEMEN_START_CC,
    orgasms: 0,
    ejacs: 0,
    ended: false,
    startedAt: Number(opts.now) || Date.now(),
  };
}

/** 激情一下拿到 2 的機率：性奮與關係越高越容易（0.15～0.9）。 */
export function passionTwoChance(arousal = 0, stageKey = "stranger") {
  return clamp(0.15 + (clamp(arousal, 0, 100) / 100) * 0.45 + stageFactor(stageKey) * 0.3, 0.1, 0.9);
}

export function passionGain(arousal, stageKey, rng = Math.random) {
  return rng() < passionTwoChance(arousal, stageKey) ? 2 : 1;
}

export function exciteGain(rng = Math.random) {
  const span = THRUST.EXCITE_MAX - THRUST.EXCITE_MIN + 1;
  return THRUST.EXCITE_MIN + Math.min(span - 1, Math.floor(rng() * span));
}

/** 下一次射完會不會見底（或已經 <6）→ 危險提示。 */
export function semenDanger(s) {
  if (!s) return false;
  return s.semen < THRUST.SEMEN_WARN_BELOW || s.semen - THRUST.SEMEN_PER_EJAC_CC < THRUST.SEMEN_END_BELOW;
}

/**
 * 一下抽插：激情／興奮／感情立刻算；射精也在這一下判（玩家自己的身體，不等她說話）。
 * 高潮不在這裡判（等她那句打完：checkOrgasm）。
 * @returns {{ passionAdd, exciteAdd, affection, ejac, semenBefore, semenAfter, ended, danger, switchRoll }}
 */
export function applyThrust(s, { arousal = 0, stage = "stranger", rng = Math.random } = {}) {
  if (!s || s.ended) return null;
  const passionAdd = passionGain(arousal, stage, rng);
  const exciteAdd = exciteGain(rng);
  s.thrusts += 1;
  s.passion += passionAdd;
  s.excite = Math.min(THRUST.EXCITE_CUM_AT, s.excite + exciteAdd);
  const switchRoll = rng() < THRUST.SWITCH_CHANCE;
  const semenBefore = s.semen;
  let ejac = false;
  if (s.excite >= THRUST.EXCITE_CUM_AT) {
    ejac = true;
    s.excite = 0;
    s.ejacs += 1;
    s.semen -= THRUST.SEMEN_PER_EJAC_CC;
    if (s.semen < THRUST.SEMEN_END_BELOW) s.ended = true;
  }
  return {
    passionAdd,
    exciteAdd,
    affection: THRUST.AFF_PER_THRUST,
    ejac,
    semenBefore,
    semenAfter: s.semen,
    ended: s.ended,
    danger: semenDanger(s),
    switchRoll,
  };
}

/** 她那句打完時判：激情 >20 → 高潮（激情 −3，感情 +10）。 */
export function checkOrgasm(s) {
  if (!s || s.passion <= THRUST.PASSION_ORGASM_ABOVE) return null;
  const before = s.passion;
  s.passion = Math.max(0, s.passion - THRUST.PASSION_ORGASM_DROP);
  s.orgasms += 1;
  return { before, after: s.passion, affection: THRUST.AFF_PER_ORGASM, count: s.orgasms };
}

/** 抽插期換圖：從池子挑一張跟現在不一樣的（池子只有一張就不換）。 */
export function pickOtherImage(pool, current, rng = Math.random) {
  const list = [...new Set((pool || []).map((u) => String(u || "")).filter(Boolean))];
  const others = list.filter((u) => u !== current);
  if (!others.length) return current || list[0] || "";
  return others[Math.min(others.length - 1, Math.floor(rng() * others.length))];
}

/** 動畫幀：第一下 1-2-3-4，之後 2-3-4。 */
export function animFramesFor(urls, firstRoundDone) {
  const list = (urls || []).map((u) => String(u || "")).filter(Boolean).slice(0, 4);
  if (!list.length) return { frames: [], holds: [] };
  if (firstRoundDone && list.length > 1) return { frames: list.slice(1), holds: THRUST.CONTINUE_HOLDS.slice(0, list.length - 1) };
  return { frames: list, holds: THRUST.FIRST_HOLDS.slice(0, list.length) };
}

const MOAN_CH = /[啊嗯哈唔喔呃哼噢嗚呀咿啦~～♡❤…\.．・、，,！!？?\s—]/;
/** 逐字打字的每字停頓：呻吟／標點快（~0.08s），一般字 ~0.12s。 */
export function typeDelayFor(ch) {
  return MOAN_CH.test(String(ch || "")) ? THRUST.TYPE_MOAN_MS : THRUST.TYPE_WORD_MS;
}

const PANTS = ["啊…嗯…", "嗯…哈啊…", "啊、啊…", "哈…嗯啊…", "唔…嗯…"];
/** 等 AI 時的本地喘息。 */
export function pantPlaceholder(rng = Math.random) {
  return PANTS[Math.min(PANTS.length - 1, Math.floor(rng() * PANTS.length))];
}

/** AI 失敗時的本地台詞。 */
export function fallbackMoan(event = "", rng = Math.random) {
  const pool = event === "orgasm"
    ? ["啊啊…要、要去了…！", "不行…要去了…啊啊…！"]
    : event === "cum"
      ? ["好燙…裡面…都是…", "啊…射、射進來了…"]
      : ["啊…嗯…好深…", "嗯啊…慢、慢一點…", "哈啊…啊…", "啊…那裡…嗯…"];
  return pool[Math.min(pool.length - 1, Math.floor(rng() * pool.length))];
}

/**
 * 台詞幫浦：動畫／數值不等它；同時只跑一句。
 *   press(seq)   每按一下呼叫：閒著就馬上開一句；忙著就記「最新一下」（舊的丟掉）。
 *   一句打完（finish）：最後一下在 0.8 秒內（打完前按的，或打完後 0.8 秒內按的）→ 立刻開下一句。
 * deps：{ request(seq) → Promise<string>, type(text) → Promise<void>, placeholder(), now(), onDone(seq) }
 */
export class ThrustReplyPump {
  constructor(deps) {
    this.d = deps;
    this.busy = false;
    this.pendingSeq = 0;
    this.lastPressAt = 0;
    this.lastFinishAt = 0;
    this.started = [];
    this.done = [];
    this.dropped = 0;
    this.closed = false;
  }

  press(seq) {
    if (this.closed) return;
    const now = this.d.now();
    this.lastPressAt = now;
    if (!this.busy) {
      this._run(seq);
      return;
    }
    if (this.pendingSeq) this.dropped += 1;
    this.pendingSeq = seq;
  }

  close() {
    this.closed = true;
    this.pendingSeq = 0;
  }

  async _run(seq) {
    this.busy = true;
    this.started.push(seq);
    try {
      try { this.d.placeholder?.(seq); } catch { /* */ }
      let text = "";
      try {
        text = await this.d.request(seq);
      } catch {
        text = "";
      }
      if (this.closed) return;
      await this.d.type(text, seq);
    } finally {
      this.busy = false;
      this.lastFinishAt = this.d.now();
      this.done.push(seq);
      if (!this.closed) {
        try { this.d.onDone?.(seq); } catch { /* */ }
        const next = this.pendingSeq;
        this.pendingSeq = 0;
        // 打完前 0.8 秒內有按 → 立刻接下一句；更早的那下算過期，丟掉（下次按再開）
        if (next && this.lastFinishAt - this.lastPressAt <= THRUST.CHAIN_WINDOW_MS) this._run(next);
        else if (next) this.dropped += 1;
      }
    }
  }
}
