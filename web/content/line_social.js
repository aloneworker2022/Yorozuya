// 名冊群 LINE 的社交規則（純函式，手機用；RP5 server/line_group.py 是同一套數字）。
// 主動發文間隔、魅魔之間合不合、誰酸誰、秘密過濾、RP5 訊息合併、帶進房間的群組事件。
import { familyOf, stageIndexOf, STAGE_IDX, isDatingPlus, isWifeStage } from "./girl_voice.js?v=1";

export const LINE_KNOBS = {
  P_LO: 30, P_HI: 90, MIN_AT_LO: 240, MIN_AT_HI: 30, // 主動度 30 → 4 小時、90 → 30 分（連續、指數）
  MIN_MIN: 15, MAX_MIN: 360,
  GOOD: 0.6, LOW: 1.5, LURK: 0.3,
  CHIME_MS: 10 * 60e3, CHIME_P: 0.5, REACT_MAX: 2,
  EVENTS_CAP: 10,
  ONE_CAP: 60, MULTI_LINE_CAP: 40, MULTI_LINES: 3,
  AFF_HALF_LIFE_H: 24, AFF_MIN: -100, AFF_MAX: 100,
};
const K = LINE_KNOBS;

/** 主動度 → 基本間隔（分鐘）。30→240、90→30，中間連續（指數），兩端外推後夾在 15～360。 */
export function baseIntervalMin(proactivity) {
  const p = Number.isFinite(Number(proactivity)) ? Number(proactivity) : 50;
  const t = (p - K.P_LO) / (K.P_HI - K.P_LO);
  const m = K.MIN_AT_LO * Math.pow(K.MIN_AT_HI / K.MIN_AT_LO, t);
  return Math.max(K.MIN_MIN, Math.min(K.MAX_MIN, m));
}

const GOOD_MOODS = new Set(["愉快", "臉紅心跳"]);
const LOW_MOODS = new Set(["低落", "不悅", "不安", "虛脫", "心虛"]);
/** 這次間隔的倍率：心情好／飢渴高／剛遇到事 各 ×0.6；心情低落 ×1.5。 */
export function intervalMult({ mood = "平靜", moodLevel = 0, hunger = 0, eventAgoMin = Infinity } = {}) {
  let m = 1;
  if (GOOD_MOODS.has(mood) && moodLevel >= 25) m *= K.GOOD;
  if (Number(hunger) >= 70) m *= K.GOOD;
  if (eventAgoMin <= 60) m *= K.GOOD;
  if (LOW_MOODS.has(mood) && moodLevel >= 25) m *= K.LOW;
  return m;
}
export function intervalMin(opts = {}, rnd = Math.random) {
  const jitter = 0.75 + rnd() * 0.5;
  return Math.max(K.MIN_MIN * 0.6, baseIntervalMin(opts.proactivity) * intervalMult(opts) * jitter);
}

function hash32(s) {
  let h = 2166136261;
  for (const c of String(s)) { h ^= c.codePointAt(0); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
/** 冷淡家族：每個日本日 30% 整天潛水（同一天結果固定）。 */
export function lurksToday(gid, family, dayKey) {
  if (family !== "冷淡") return false;
  return (hash32(`${gid}|${dayKey}`) % 1000) / 1000 < K.LURK;
}

// ── 魅魔之間合不合 ──
const FAMILY_PAIR = {
  "熱絡|溫柔": 20, "溫柔|熱絡": 20,
  "冷淡|熱絡": -5, "熱絡|冷淡": -5,
  "反差|溫柔": 5, "溫柔|反差": 5,
};
export function familyPairScore(fa, fb) {
  if (fa === "佔有" && fb === "佔有") return -15;
  if (fa === "佔有" || fb === "佔有") return -20;
  if (fa === fb) return 20;
  return FAMILY_PAIR[`${fa}|${fb}`] || 0;
}
function names(list) {
  return (Array.isArray(list) ? list : []).map((x) => String(typeof x === "string" ? x : (x?.name || "")).trim()).filter(Boolean);
}
export function sharedCount(a, b) {
  const B = new Set(names(b));
  return new Set(names(a).filter((x) => B.has(x))).size;
}
/** 初始合不合：家族搭配＋共同興趣（每個 +8，最多 +24）＋共同喜好（每個 +5，最多 +15）。 */
export function seedAffinity(ga, gb) {
  const base = familyPairScore(familyOf(ga), familyOf(gb));
  const hob = Math.min(24, sharedCount(ga?.hobbies, gb?.hobbies) * 8);
  const like = Math.min(15, sharedCount(ga?.likes, gb?.likes) * 5);
  return Math.max(-60, Math.min(60, base + hob + like));
}
export function pairKey(a, b) { return [String(a), String(b)].sort().join("|"); }

/** 現在的值：吵完會慢慢回到初始值（24 小時退一半）。 */
export function affinityNow(rec, now = Date.now()) {
  if (!rec) return 0;
  const seed = Number(rec.seed) || 0;
  const v = Number.isFinite(Number(rec.v)) ? Number(rec.v) : seed;
  const hours = Math.max(0, (now - (Number(rec.at) || now)) / 3600e3);
  return seed + (v - seed) * Math.pow(0.5, hours / K.AFF_HALF_LIFE_H);
}
export function ensureAffinity(lg, ga, gb, now = Date.now()) {
  lg.affinity ??= {};
  const key = pairKey(ga.id, gb.id);
  let rec = lg.affinity[key];
  if (!rec) { const seed = seedAffinity(ga, gb); rec = lg.affinity[key] = { seed, v: seed, at: now }; }
  return rec;
}
export function getAffinity(lg, ga, gb, now = Date.now()) {
  if (!ga || !gb || ga.id === gb.id) return 0;
  return affinityNow(ensureAffinity(lg, ga, gb, now), now);
}
export const AFF_DELTA = { needle: -8, claim: -5, tease: -3, agree: 3, chat: 2 };
export function bumpAffinity(lg, ga, gb, delta, now = Date.now()) {
  if (!ga || !gb || ga.id === gb.id || !delta) return 0;
  const rec = ensureAffinity(lg, ga, gb, now);
  rec.v = Math.max(K.AFF_MIN, Math.min(K.AFF_MAX, affinityNow(rec, now) + delta));
  rec.at = now;
  return rec.v;
}
export function affinityWord(v) {
  if (v >= 30) return "很合";
  if (v >= 10) return "還不錯";
  if (v <= -30) return "很不合";
  if (v <= -10) return "不太合";
  return "普通";
}

// ── 回覆長度 ──
export function replyCap(stageKey) {
  return isDatingPlus(stageKey) ? { lines: K.MULTI_LINES, chars: K.MULTI_LINE_CAP } : { lines: 1, chars: K.ONE_CAP };
}

// ── 秘密 ──
export const SECRET_RE = /做愛|上床|性交|外遇|出軌|偷情|偷吃|約炮|炮友|精液|內射|中出|被.{0,4}(?:幹|肏|上了)|光著身子|全裸|裸著|色狼|變態|露出狂|陌生男|搭訕.{0,6}(?:親|摸)/;
export function secretLeak(text) { return SECRET_RE.test(String(text || "")); }

/** 拆模型回覆：#已讀 → readOnly；否則依階段取 1～3 行、每行截字。 */
export function clipReply(raw, stageKey) {
  const t = String(raw || "").trim();
  if (!t || /^#\s*(已讀|略過)/.test(t)) return { readOnly: true, lines: [] };
  const cap = replyCap(stageKey);
  const lines = t.replace(/#\s*(已讀|略過)/g, "")
    .split(/\n+/)
    .map((x) => x.trim().replace(/^\[[^\]]*\]\s*/, "").replace(/^[^：:「]{1,8}[：:]\s*/, "").replace(/^["「『]|["」』]$/g, "").replace(/^#\S+\s*/, "").trim())
    .filter((x) => x && !/^[（(].*[)）]$/.test(x))
    .slice(0, cap.lines)
    .map((x) => (x.length > cap.chars ? x.slice(0, cap.chars) : x));
  if (!lines.length) return { readOnly: true, lines: [] };
  return { readOnly: false, lines };
}

// ── 玩家這句是在回誰（特地對誰好） ──
/** 點名優先；沒點名就看玩家這句前 30 分鐘內、最後一個開口的妹子。 */
export function warmTarget(messages, playerMsg, girls) {
  if (!playerMsg) return "";
  const text = String(playerMsg.text || "");
  const named = girls.filter((g) => g.name && text.includes(g.name));
  if (named.length === 1) return named[0].id;
  if (named.length > 1) return "";
  const idx = messages.findIndex((m) => m.id === playerMsg.id);
  for (let i = (idx < 0 ? messages.length : idx) - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.kind === "player") return "";
    if (m.kind === "girl" && (Number(playerMsg.t) - Number(m.t)) <= 30 * 60e3) return m.girlId || "";
    if ((Number(playerMsg.t) - Number(m.t)) > 30 * 60e3) return "";
  }
  return "";
}

/**
 * 玩家一句話後，這個妹子這一輪要做什麼：
 *  reply（回玩家）／needle（酸被特別回的人）／claim（妻子宣示主權）／agree／tease（接群友的話）
 */
export function planTurn(girl, { lg, warmId = "", girlsById = {}, lastOther = null, now = Date.now() } = {}, rnd = Math.random) {
  const stage = girl.roomStage || girl.stage || "stranger";
  const jealousy = Number(girl.stats?.jealousy) || 30;
  if (warmId && warmId !== girl.id && girlsById[warmId]) {
    const tgt = girlsById[warmId];
    const aff = getAffinity(lg, girl, tgt, now);
    const band = isDatingPlus(stage) ? 0.8 : stageIndexOf(stage) >= STAGE_IDX.friend ? 0.3 : 0.1;
    const p = (jealousy / 100) * band * (aff < -10 ? 1.3 : aff > 30 ? 0.5 : 1);
    if (rnd() < p) {
      const act = isWifeStage(stage) && jealousy >= 60 && rnd() < 0.5 ? "claim" : "needle";
      return { act, target: warmId };
    }
  }
  if (lastOther && lastOther.girlId && lastOther.girlId !== girl.id && girlsById[lastOther.girlId] && rnd() < 0.35) {
    const aff = getAffinity(lg, girl, girlsById[lastOther.girlId], now);
    const act = aff >= 10 ? "agree" : aff <= -10 ? "tease" : (rnd() < 0.5 ? "agree" : "tease");
    return { act, target: lastOther.girlId };
  }
  return { act: "reply", target: "" };
}

export const ACT_ASK = {
  needle: (n) => `他剛在群裡特地回了${n}，你吃醋了：酸${n}一句（短、口語、不要罵髒話），也可以順便對他撒嬌。`,
  claim: (n) => `他剛在群裡特地回了${n}。你是他的妻子：短短宣示主權（例如「他是我老公」那種意思），對${n}帶點刺。`,
  agree: (n) => `接${n}剛剛那句話，附和或補一句。`,
  tease: (n) => `接${n}剛剛那句話，吐槽她一句（照你們合不合決定輕重）。`,
  chat: (n) => `接${n}剛剛那句話，自然聊下去。`,
};

// ── 群組事件帶進房間 ──
export function pushLineEvent(who, ev) {
  if (!who) return;
  who.lineEvents = Array.isArray(who.lineEvents) ? who.lineEvents : [];
  who.lineEvents.push({ t: ev.t || Date.now(), text: String(ev.text || "").slice(0, 90), with: ev.with || "", withName: ev.withName || "", sour: ev.sour ? 1 : 0, kind: ev.kind || "" });
  if (who.lineEvents.length > K.EVENTS_CAP) who.lineEvents.splice(0, who.lineEvents.length - K.EVENTS_CAP);
}

/** 一則訊息造成的事件與合不合變化。每則只算一次（m.fx）。 */
export function applyMsgEffects(lg, msg, girlsById, now = Date.now()) {
  if (!msg || msg.fx) return false;
  msg.fx = 1;
  const meta = msg.meta || {};
  const quote = `「${String(msg.text || "").slice(0, 28)}」`;
  const all = Object.values(girlsById);
  // 收到事件的人跟「事件裡另一個人」合不合（帶進房間時決定口氣）
  const ev = (who, other, kind, text) => pushLineEvent(who, {
    t: msg.t, kind, text, with: other?.id || "", withName: other?.name || "",
    sour: other ? getAffinity(lg, who, other, now) <= -10 : false,
  });
  if (msg.kind === "player") {
    const tgt = girlsById[meta.warm];
    if (!tgt) return true;
    ev(tgt, null, "warmMe", `他在群裡特地回你：${quote}`);
    for (const g of all) if (g.id !== tgt.id) ev(g, tgt, "warmOther", `他在群裡特地回了${tgt.name}：${quote}`);
    return true;
  }
  const from = girlsById[msg.girlId];
  if (!from) return true;
  const tgt = girlsById[meta.target];
  const act = meta.act || "";
  if (tgt && AFF_DELTA[act]) bumpAffinity(lg, from, tgt, AFF_DELTA[act], now);
  if (tgt && (act === "needle" || act === "claim" || act === "tease")) {
    ev(tgt, from, "needled", `${from.name}在群裡${act === "claim" ? "對你宣示主權" : "酸你"}：${quote}`);
    ev(from, tgt, "needler", `你在群裡酸了${tgt.name}：${quote}`);
  }
  if (meta.at === "player" && isDatingPlus(from.roomStage || from.stage)) {
    for (const g of all) if (g.id !== from.id) ev(g, from, "flirt", `${from.name}在群裡跟他撒嬌：${quote}`);
  }
  return true;
}

/** 房間 prompt：最近群組事件（3 天內）；提到不合的人口氣比較差。 */
export const FLIRT_RE = /老公|想你|愛你|抱抱|親親|陪我|召喚我|❤|♡|💕/;
export function lineEventPromptLines(who, { now = Date.now() } = {}) {
  const evs = (Array.isArray(who?.lineEvents) ? who.lineEvents : []).filter((e) => now - (Number(e.t) || 0) < 3 * 24 * 3600e3);
  if (!evs.length) return [];
  const out = ["【LINE 群最近的事】你記得群組裡發生過這些。聊到相關的可以自然提起（例如問他為什麼一直回別人），不要每句都提，也不要一次全講。"];
  const sour = new Set();
  for (const e of evs.slice(-K.EVENTS_CAP)) {
    const ago = Math.round((now - e.t) / 3600e3);
    out.push(`・${ago < 1 ? "剛剛" : ago < 24 ? `${ago} 小時前` : `${Math.round(ago / 24)} 天前`}：${e.text}`);
    if (e.sour && e.withName) sour.add(e.withName);
  }
  if (sour.size) out.push(`你跟${[...sour].join("、")}不太合，提到她口氣會比較差。`);
  return out;
}

// ── RP5 主動發文合併 ──
/** 把 RP5 的訊息合併進本地：id 去重、照時間排；回傳新加的訊息。 */
export function mergeFeed(local, incoming, cap = 500) {
  const have = new Set(local.map((m) => m.id));
  const added = [];
  for (const m of incoming || []) {
    if (!m || !m.id || have.has(m.id)) continue;
    have.add(m.id);
    local.push({ ...m });
    added.push(local[local.length - 1]);
  }
  if (added.length) {
    local.sort((a, b) => (Number(a.t) || 0) - (Number(b.t) || 0));
    if (local.length > cap) local.splice(0, local.length - cap);
  }
  return added;
}
