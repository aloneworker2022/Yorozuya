// ============================================================
// MaleGen — 其他召喚師生成器
// 池子在 summoners.json（/editmale 可編輯）。
// 約會現場只走約會動作（依性慾區間）＋插入後做愛場。
// 見面就調戲，不走搭訕／五階梯子。
// ============================================================

import {
  cloneLadders,
  DEFAULT_PLAY_LADDERS,
} from "./play_ladder.js";
import {
  cloneDateActs,
  pickDateAct,
  dateActToPlay,
  drawDateActsByBand,
  dateActsByBandText,
} from "./date_act.js";

export let MALE_POOL = null;

export const LINE_ZH = { common: "通用", otaku: "宅男", creep: "變態", erotic: "色情" };
export const LINE_EMOJI = { common: "👤", otaku: "🧋", creep: "👁", erotic: "💋" };
export const LINES = ["common", "otaku", "creep", "erotic"];

function pickNtrShow(line) {
  if (line === "creep") return "front";
  if (line === "otaku") return "away";
  if (line === "erotic") return Math.random() < 0.55 ? "front" : "away";
  return Math.random() < 0.35 ? "front" : "away";
}

const pk = (a) => a[Math.floor(Math.random() * a.length)];

export async function loadMalePool() {
  try {
    MALE_POOL = await fetch("/content/summoners.json?ts=" + Date.now()).then((r) => (r.ok ? r.json() : null));
  } catch {
    MALE_POOL = null;
  }
  return MALE_POOL;
}
export function setMalePool(p) { MALE_POOL = p; }

export function playLaddersOf(pool = MALE_POOL) {
  return cloneLadders(pool?.play_ladders || DEFAULT_PLAY_LADDERS);
}

export function dateActsOf(pool = MALE_POOL) {
  return cloneDateActs(pool?.date_acts);
}

export function generateSummoner({ usedNames = [], pool = null, line = null } = {}) {
  const P = pool || MALE_POOL;
  if (!P) throw new Error("召喚師池還沒載入");
  const names = (P.names || []).map((x) => String(x).trim()).filter(Boolean);
  if (!names.length) throw new Error("名字池是空的");
  const fresh = names.filter((n) => !usedNames.includes(n));
  const name = pk(fresh.length ? fresh : names);

  const pickedLine = LINES.includes(line) ? line : pk(LINES);
  const dateActs = drawDateActsByBand(dateActsOf(P), { minN: 2, maxN: 6 });
  if (!dateActs.length) throw new Error("沒有約會調戲動作");

  return {
    id: "su_" + Date.now().toString(36) + "_" + Math.random().toString(36).slice(2, 6),
    name,
    line: pickedLine,
    emoji: LINE_EMOJI[pickedLine] || "👤",
    approachTalks: [],
    chatTalks: [],
    approachActions: [],
    chatActions: [],
    dateActs,
    playType: "touch",
    playHeat: null,
    playUnlocked: 1,
    playStep: 1,
    insertAfter: 0,
    joined: false,
    usedApproachTalk: [],
    usedChatTalk: [],
    usedApproachAct: [],
    usedChatAct: [],
    usedDateAct: [],
    pendingAction: null,
    lastMove: null,
    stageIdx: 0,
    mates: 0,
    ntrShow: pickNtrShow(pickedLine),
  };
}

function takeDatePlay(su, dateActs, ctx) {
  const acts = (su?.dateActs && su.dateActs.length)
    ? su.dateActs
    : (dateActs || dateActsOf());
  if (!acts.length) return null;
  const act = pickDateAct(acts, {
    arousal: ctx.arousal,
    lifeOnly: ctx.lifeOnly,
    deadAngle: ctx.deadAngle,
    lastIds: su.usedDateAct || [],
  });
  if (!act) return null;
  su.usedDateAct = su.usedDateAct || [];
  su.usedDateAct.push(act.id);
  if (su.usedDateAct.length > 20) su.usedDateAct = su.usedDateAct.slice(-20);
  return dateActToPlay(act);
}

/** 見面就調戲。只走性慾區間約會動作，不搭訕、不走五階梯子。 */
export function nextRivalMove(su, {
  dateActs,
  arousal = 0,
  lifeOnly = false,
  deadAngle = false,
} = {}) {
  if (!su) return null;
  const ctx = { arousal, lifeOnly, deadAngle };
  const joining = !su.joined;
  su.joined = true;
  const play = takeDatePlay(su, dateActs, ctx);
  const move = { mode: joining ? "join" : "play", play, talk: null };
  su.lastMove = move;
  su.pendingAction = play || null;
  return move;
}

export function kitSummary(su) {
  if (!su) return "";
  const line = LINE_ZH[su.line] || su.line || "";
  const show = su.ntrShow === "front" ? "在你面前玩弄" : "帶走";
  return [
    `${line}系`,
    show,
    `七段 ${su.stageIdx ?? 0}`,
    `調戲 ${su.dateActs?.length || 0}`,
  ].join(" · ");
}

export function kitListText(su) {
  if (!su) return "";
  return [
    "見面就調戲（不搭訕、不走五階梯子）",
    dateActsByBandText(su.dateActs),
  ].join("\n");
}
