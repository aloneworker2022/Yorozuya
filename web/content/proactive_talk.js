/* 主動找你聊天（2026-10-10 Al）：女友以上的魅魔在房間裡沒事時，會自己走到你面前、先開口。
   不是求歡（hunger.js 的 hunger_beg 優先）。純資料＋純函式，test_room_summon.js 執行、node 測試共用。
   狀態存在 girl.proactiveTalk = { leftMs, lastAt, lastTrigger, pending:{trigger,at,detail}, ignored, ignoreMoodAt, closedAt }。
   計時用「她在房間的時間」：tick 只在她在房、App 在前景時扣 leftMs。 */
import { STAGE_IDX, stageIndexOf, isWifeStage, addressRule, STAGE_ZH } from "./girl_voice.js?v=1";

const MIN = 60e3, HR = 3600e3;
export const TALK_KNOBS = {
  /** 各階基本間隔（分鐘，她在房間的時間）：女友最少、病態最黏。 */
  INTERVAL_MIN: { girlfriend: 75, passionate: 60, lover: 50, wife: 38, devoted_wife: 30, obedient_wife: 34, pathological_wife: 20 },
  JITTER: 0.25,              // ±25%
  CHAT_COOLDOWN_MS: 20 * MIN, // 任何一次聊天關掉後至少 20 分鐘
  WAIT_MS: 10 * MIN,          // 走到面前開不了對話框：站著等 10 分鐘
  IGNORE_MOOD_AFTER: 2,       // 連續被晾 2 次才鬧情緒
  IGNORE_MOOD_COOLDOWN_MS: 90 * MIN,
  IGNORE_MOOD: { normal: 10, pathological_wife: 18 },
  MEMORY_FRESH_MS: 6 * HR,    // 生活記憶／LINE 事件多新才算「想講」
  WAKE_FRESH_MS: 10 * MIN,
};
const K = TALK_KNOBS;

export const TRIGGERS = ["miss", "share", "vent", "memory", "line", "woke", "bored"];
export const TRIGGER_ZH = { miss: "想你", share: "心情好想分享", vent: "心情差想討拍", memory: "外面發生的事", line: "LINE 群的事", woke: "剛睡醒", bored: "無聊" };

/** 女友以上才會主動來聊。 */
export function talkEligible(stageKey) { return stageIndexOf(stageKey) >= STAGE_IDX.girlfriend; }

/** 下一次的間隔（毫秒）：階段 × 主動度（50 → ×1，90 → ×0.76，10 → ×1.24）× 隨機。 */
export function talkIntervalMs(stageKey, proactivity = 50, rnd = Math.random) {
  if (!talkEligible(stageKey)) return Infinity;
  const base = K.INTERVAL_MIN[stageKey] ?? 60;
  const p = Number.isFinite(Number(proactivity)) ? Math.max(0, Math.min(100, Number(proactivity))) : 50;
  const mult = 1.3 - 0.6 * (p / 100);
  const jitter = 1 - K.JITTER + 2 * K.JITTER * rnd();
  return Math.round(base * mult * jitter * MIN);
}

export function ensureTalkState(who, rnd = Math.random) {
  if (!who) return null;
  const t = who.proactiveTalk && typeof who.proactiveTalk === "object" ? who.proactiveTalk : {};
  const stage = who.stage || "stranger";
  t.leftMs = Number.isFinite(Number(t.leftMs)) ? Number(t.leftMs) : talkIntervalMs(stage, who.stats?.proactivity, rnd);
  t.lastAt = Number(t.lastAt) || 0;
  t.closedAt = Number(t.closedAt) || 0;
  t.ignored = Math.max(0, Number(t.ignored) | 0);
  t.ignoreMoodAt = Number(t.ignoreMoodAt) || 0;
  t.lastTrigger = TRIGGERS.includes(t.lastTrigger) ? t.lastTrigger : "";
  t.pending = t.pending && TRIGGERS.includes(t.pending.trigger) ? t.pending : null;
  who.proactiveTalk = t;
  return t;
}

/**
 * 閘門。busy：{sheetOpen, talkBusy, pomodoro, scene, sex, undress, editor, hidden, notInRoom, summoning, errand, roomHidden}
 * beg：{pending, peak, canBeg}（性飢渴求歡優先）。回傳 {ok, why}。
 */
export function talkGate({ stage, busy = {}, beg = {}, state = null, now = Date.now() } = {}) {
  if (!talkEligible(stage)) return { ok: false, why: "還沒交往" };
  for (const [k, zh] of [["notInRoom", "不在房間"], ["hidden", "App 在背景"], ["roomHidden", "不在房間畫面"], ["sheetOpen", "對話開著"],
    ["talkBusy", "正在說話"], ["pomodoro", "番茄鐘"], ["scene", "場面中"], ["sex", "做愛中"], ["undress", "脫衣中"], ["editor", "編輯房間"],
    ["summoning", "召喚中"], ["errand", "去換衣服"], ["asleep", "她在睡覺"]]) if (busy[k]) return { ok: false, why: zh };
  if (beg.pending || beg.peak || beg.canBeg) return { ok: false, why: "求歡優先" };
  if (state?.pending) return { ok: false, why: "已經在等你" };
  if (state && now - (state.closedAt || 0) < K.CHAT_COOLDOWN_MS) return { ok: false, why: "剛聊過（冷卻）" };
  if (state && state.leftMs > 0) return { ok: false, why: `還沒到（約 ${Math.ceil(state.leftMs / MIN)} 分）` };
  return { ok: true, why: "" };
}

/** 給 tick：扣掉這段在房間的時間。 */
export function tickTalk(state, dtMs) {
  if (!state) return 0;
  state.leftMs = Math.max(0, (state.leftMs || 0) - Math.max(0, Math.min(dtMs, 5 * MIN)));
  return state.leftMs;
}

const SECRET_PRIVATE = (item, stage) => {
  if (!item?.private) return false;
  if (item.private === "affair") return true;               // 女友以上：秘密，不主動講
  if (item.private === "ero") return !isWifeStage(stage);   // 色情奇遇：妻子才會自己提
  return true;
};
/** 最近能主動講的生活記憶（不含秘密）。 */
export function freshMemory(who, now = Date.now()) {
  const mind = who?.world?.mind;
  const stage = who?.stage || "stranger";
  const items = [...(mind?.immediate || [])].reverse();
  return items.find((it) => it?.text && now - (Number(it.at) || 0) < K.MEMORY_FRESH_MS && it.kind !== "home" && !SECRET_PRIVATE(it, stage)) || null;
}
const JEALOUS = new Set(["warmOther", "needled", "flirt"]);
export function freshLineEvent(who, now = Date.now()) {
  const evs = Array.isArray(who?.lineEvents) ? who.lineEvents : [];
  for (let i = evs.length - 1; i >= 0; i--) {
    const e = evs[i];
    if (now - (Number(e?.t) || 0) >= K.MEMORY_FRESH_MS) break;
    if (JEALOUS.has(e.kind) || e.kind === "warmMe") return e;
  }
  return null;
}

/**
 * 觸發權重。ctx：{stage, miss 0–100, mood:{type,level}|null（房間餘溫）, outside:{name,level}（日本帶回的心情）,
 *   memory, lineEvent, wokeAgoMs, usedMemoryId, usedLineT}
 */
export function triggerWeights(ctx = {}) {
  const stage = ctx.stage || "girlfriend";
  const patho = stage === "pathological_wife";
  const miss = Math.max(0, Math.min(100, Number(ctx.miss) || 0));
  const w = Object.fromEntries(TRIGGERS.map((k) => [k, 0]));
  w.bored = 1;
  if (miss >= 30) w.miss = (miss - 20) / 12 * (patho ? 1.6 : 1);
  const mt = ctx.mood?.type || "", ml = Number(ctx.mood?.level) || 0;
  const on = ctx.outside?.name || "", ol = Number(ctx.outside?.level) || 0;
  if (on === "愉快" && ol >= 15) w.share = 1 + ol / 25;
  if ((on === "不悅" || on === "低落" || on === "不安") && ol >= 15) w.vent = 1 + ol / 20;
  if ((mt === "hurt") && ml >= 15) w.vent += 1 + ml / 25;
  if (mt === "angry" && ml >= 30) { w.bored *= .3; w.share = 0; }   // 正在氣你：不會來閒聊（去蹲角落）
  if (ctx.memory && ctx.memory.id !== ctx.usedMemoryId) w.memory = 2.2;
  if (ctx.lineEvent && ctx.lineEvent.t !== ctx.usedLineT) w.line = JEALOUS.has(ctx.lineEvent.kind) ? 2.5 * (patho ? 1.5 : 1) : 1.5;
  if (Number.isFinite(ctx.wokeAgoMs) && ctx.wokeAgoMs < K.WAKE_FRESH_MS) w.woke = 3;
  if (patho) w.bored *= 1.4;
  return w;
}
export function pickTrigger(ctx = {}, rnd = Math.random) {
  const w = triggerWeights(ctx);
  const total = Object.values(w).reduce((a, b) => a + b, 0);
  let r = rnd() * total;
  for (const k of TRIGGERS) { r -= w[k]; if (r < 0 && w[k] > 0) return k; }
  return "bored";
}

/** 觸發 → 給 LLM 的開場指示（她先開口）。detail：{memoryText, lineText, lineKind, withName, outsideWhy, moodCause}。 */
export function openerAsk(trigger, { stage = "girlfriend", pet = "", playerName = "", detail = {} } = {}) {
  const d = detail || {};
  const why = {
    miss: "你一陣子沒跟他好好說話，很想他，自己走過來黏他、想跟他講話",
    share: `你心情很好，想跟他分享${d.outsideWhy ? `（${d.outsideWhy}）` : "今天的開心事"}`,
    vent: `你心情不太好，想找他講講、討拍${d.outsideWhy ? `（${d.outsideWhy}）` : d.moodCause ? `（${d.moodCause}）` : ""}`,
    memory: `你想跟他講最近在外面遇到的一件事：${d.memoryText || "外面的見聞"}`,
    line: d.lineKind === "warmMe" ? `你還在開心他在 LINE 群裡特地回你（${d.lineText || ""}），想當面跟他說`
      : `你很在意 LINE 群裡的事：${d.lineText || ""}。你有點吃醋或不是滋味，想當面問他${d.withName ? `、提到${d.withName}口氣會差一點` : ""}`,
    woke: "你剛在房間裡睡醒，迷迷糊糊地走過來找他說話",
    bored: "你閒著沒事、有點無聊，走過來找他聊天",
  }[trigger] || "你想找他聊天";
  const patho = stage === "pathological_wife" ? "你很黏、很依賴，帶一點佔有慾。" : "";
  return [
    `（你自己走到他面前，主動找他說話：${why}。${patho}`,
    "只寫你開口的第一句（一到兩句），用你平常的口氣，不要旁白，不要求他做愛、不要提性。",
    `${addressRule(stage, pet, playerName)}`,
    "外面跟別人越線的事是秘密，不要提。）",
  ].join("");
}

const FALLBACK = {
  miss: ["欸…你在幹嘛？陪我說說話嘛。", "人家想你了啦…理我一下。"],
  share: ["跟你說喔！今天有件開心的事～", "嘿嘿，你猜我今天怎麼了？"],
  vent: ["……可以聽我抱怨一下嗎？", "今天好煩喔…你陪我一下。"],
  memory: ["欸，我跟你說，我在外面遇到一件事…", "你知道嗎？我前幾天在外面看到…"],
  line: ["你剛剛在群裡幹嘛一直回她？", "……群裡那個是怎樣？你說清楚。"],
  woke: ["嗯…我睡醒了…你在幹嘛…", "哈啊…睡好久…陪我說話。"],
  bored: ["好無聊喔～跟我聊天嘛。", "欸，你在忙嗎？"],
};
export function fallbackOpener(trigger, stage = "girlfriend", rnd = Math.random) {
  const pool = FALLBACK[trigger] || FALLBACK.bored;
  let line = pool[Math.floor(rnd() * pool.length)];
  if (trigger === "line" && !isWifeStage(stage)) line = line.replace(/老公/g, "");
  if (isWifeStage(stage) && trigger !== "line" && rnd() < .5) line = `老公，${line}`;
  return line;
}

/** 開對話時呼叫：她被理了（不論玩家有沒有回）。 */
export function noteOpened(state, now = Date.now()) {
  if (!state?.pending) return null;
  const p = state.pending;
  state.pending = null;
  state.lastAt = now;
  state.opened = { trigger: p.trigger, at: now, replied: false };
  return p;
}
export function noteReplied(state) { if (state?.opened) state.opened.replied = true; }

/**
 * 被晾：等到超時沒理／開了對話直接關掉（沒回半句）。連續 IGNORE_MOOD_AFTER 次才鬧小情緒，有冷卻。
 * 回傳 {type, level, cause} 或 null。不會加減感情（不能刷數值）。
 */
export function noteIgnored(state, stage, now = Date.now()) {
  if (!state) return null;
  state.ignored += 1;
  if (state.ignored < K.IGNORE_MOOD_AFTER) return null;
  if (now - (state.ignoreMoodAt || 0) < K.IGNORE_MOOD_COOLDOWN_MS) return null;
  state.ignoreMoodAt = now;
  const level = stage === "pathological_wife" ? K.IGNORE_MOOD.pathological_wife : K.IGNORE_MOOD.normal;
  return { type: "hurt", level, cause: "主動找你說話，你都不理她" };
}

/** 對話關掉：設冷卻＋排下一次。回傳 被晾的情緒（若有）。 */
export function noteClosed(state, stage, proactivity, now = Date.now(), rnd = Math.random) {
  if (!state) return null;
  state.closedAt = now;
  state.leftMs = Math.max(talkIntervalMs(stage, proactivity, rnd), 0);
  const o = state.opened;
  state.opened = null;
  if (o && !o.replied) return noteIgnored(state, stage, now);
  if (o && o.replied) state.ignored = 0;
  return null;
}
/** 在前面等太久沒人理。 */
export function waitExpired(state, now = Date.now()) {
  return !!state?.pending && now - (Number(state.pending.at) || 0) > K.WAIT_MS;
}

export function talkLabel(state, stage, now = Date.now()) {
  if (!talkEligible(stage)) return `—（${STAGE_ZH[stage] || stage}：女友起才會主動來聊）`;
  if (!state) return "—";
  const cd = Math.max(0, K.CHAT_COOLDOWN_MS - (now - (state.closedAt || 0)));
  const eta = Math.max(state.leftMs || 0, cd);
  const pend = state.pending ? `・正在等你（${TRIGGER_ZH[state.pending.trigger]}）` : "";
  return `下次約 ${Math.ceil(eta / MIN)} 分後（房間時間）${pend}・上次：${state.lastTrigger ? TRIGGER_ZH[state.lastTrigger] : "—"}・被晾 ${state.ignored}`;
}
