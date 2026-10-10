/* 接客還債（2026-10-10 Al）：純規則，手機與 node 測試共用；RP5 那邊數字在 server/escort.py（tests 會比對）。
 * 負債＝state.gold < 0。只有妻子以上（妻子／貼心／順從／病態）會為了你去接客；沒有老婆就只擋召喚。
 * 負債 > 50：老婆自己去（一班 2～4 小時、1～4 位客人、每位 15～40 金，錢直接拿去還債，還清就收工）。
 * 負債 1～50：她不會自己去；房間聊天多一顆「拜託她幫忙還債」，她看個性／心情／關係／忠誠決定。
 * 一天（24 小時內）最多 2 班，兩班之間至少在你房間休息 4 小時。偷看 10～25 金（加到負債上），8% 被她發現。 */
import { familyOf, stageIndexOf, STAGE_IDX, isWifeStage } from "./girl_voice.js?v=1";

export const AUTO_DEBT = 50;            // 負債超過這個（嚴格 >）老婆自己去
export const SHIFT_MIN_MS = 2 * 3600e3;
export const SHIFT_MAX_MS = 4 * 3600e3;
export const CLIENTS_MIN = 1;
export const CLIENTS_MAX = 4;
export const PAY_MIN = 15;
export const PAY_MAX = 40;
export const SHIFTS_PER_DAY = 2;
export const DAY_MS = 24 * 3600e3;
export const REST_MS = 4 * 3600e3;       // 兩班之間至少休息
export const ASK_COOL_MS = 6 * 3600e3;   // 拜託被拒絕後多久才能再拜託
export const PEEK_MIN = 10;
export const PEEK_MAX = 25;
export const NOTICE_CHANCE = 0.08;
export const RETURN_WINDOW_MS = 12 * 3600e3;  // 收工後這麼久內打開 App，才自動回房間
export const LIBIDO_PAY = { N: 0, R: 2, S: 4, SS: 7, SSR: 10 };
export const POSES = ["missionary", "cowgirl", "doggy", "kiss", "reverse"];
export const POSE_ZH = { missionary: "傳教士", cowgirl: "騎乘", doggy: "老漢推車", kiss: "面對面擁吻", reverse: "背向坐姿" };

export function stageKeyOf(who) { return who?.roomStage || who?.stage || "stranger"; }
export function canEscort(who) { return !!who && !who.ntr && isWifeStage(stageKeyOf(who)); }
export function debtOf(gold) { const g = Number(gold); return Number.isFinite(g) && g < 0 ? Math.round(-g) : 0; }
export function autoDue(gold) { return debtOf(gold) > AUTO_DEBT; }
export function askable(gold) { const d = debtOf(gold); return d > 0 && d <= AUTO_DEBT; }

/** 好幾個老婆：人在房裡的優先，其次階段高、忠誠高。 */
export function pickWife(girls, roomId = "") {
  const list = (girls || []).filter(canEscort);
  if (!list.length) return null;
  list.sort((a, b) => (b.id === roomId) - (a.id === roomId)
    || stageIndexOf(stageKeyOf(b)) - stageIndexOf(stageKeyOf(a))
    || (Number(b.stats?.loyalty) || 0) - (Number(a.stats?.loyalty) || 0));
  return list[0];
}

/** escort 紀錄：world.escort（RP5 畫的）＋手機自己的 girl.escortMine（離房時間、拜託冷卻、偷看）。 */
export function shiftsIn(starts, now, span = DAY_MS) { return (starts || []).filter((t) => now - Number(t) < span).length; }
export function limitOk(log, now) {
  const starts = log?.starts || [];
  if (shiftsIn(starts, now) >= SHIFTS_PER_DAY) return { ok: false, why: "today" };
  const end = Number(log?.lastEnd) || 0;
  if (end && now - end < REST_MS) return { ok: false, why: "rest", wait: REST_MS - (now - end) };
  return { ok: true };
}

/** 一位客人付多少：15～40，看性慾等級和被肏開發的場數。 */
export function clientPay(grade, fucked, r = Math.random()) {
  const base = PAY_MIN + Math.floor(r * 16);              // 15～30
  const dev = Math.min(5, Math.floor((Number(fucked) || 0) / 10));
  return Math.max(PAY_MIN, Math.min(PAY_MAX, base + (LIBIDO_PAY[String(grade || "R").toUpperCase()] ?? 2) + dev));
}

/** 拜託她：答應的機率。 */
export const ASK_STAGE = { wife: 0.55, devoted_wife: 0.75, obedient_wife: 0.85, pathological_wife: 0.7 };
export const ASK_FAMILY = { 冷淡: -0.1, 溫柔: 0.05, 熱絡: 0.05, 佔有: 0, 反差: 0.1 };
export function askChance({ stage, family, loyalty = 60, mood = null, hunger = 0 } = {}) {
  let p = ASK_STAGE[stage] ?? 0;
  if (!p) return 0;
  p += ASK_FAMILY[family] ?? 0;
  p += ((Number(loyalty) || 60) - 60) / 200;
  if (mood?.type === "angry" || mood?.type === "hurt") p -= Math.min(0.35, (Number(mood.level) || 0) / 150);
  if (family === "反差" && hunger >= 60) p += 0.1;
  return Math.max(0.1, Math.min(0.95, Math.round(p * 100) / 100));
}

/** 出門／回家的心情：看個性家族（有的委屈、有的認命、有的反而興奮）。 */
export const FEEL = { 冷淡: "resigned", 溫柔: "wronged", 熱絡: "willing", 佔有: "wronged", 反差: "aroused" };
export function feelOf(who) { return FEEL[familyOf(who)] || "wronged"; }
/** 回房間時的情緒餘溫（房間 MOOD_TYPES）。 */
export function returnMood(who, clients) {
  const n = Math.max(1, Number(clients) || 1), f = feelOf(who);
  if (f === "aroused") return { type: "aroused", level: 18 + 6 * n, cause: "剛接完客回來，身體還在發燙" };
  if (f === "willing") return null;   // 幫你還了債，反而有點得意：不留壞情緒
  if (f === "resigned") return { type: "hurt", level: 8 + 4 * n, cause: "接客回來，累了" };
  return { type: "hurt", level: 14 + 6 * n, cause: "為了你去接客，心裡委屈" };
}
export function noticedMood(who) {
  const fam = familyOf(who);
  return fam === "反差" || fam === "熱絡" ? { type: "flustered", level: 40, cause: "接客時發現你在門縫偷看" }
    : { type: "angry", level: 38, cause: "接客時發現你在門縫偷看" };
}

/** 出門前那一句（沒有模型時用）。 */
const LEAVE_LINES = {
  wronged: ["……債的事我去處理，你不要想太多。", "我出門一下……你乖乖等我回來。", "沒關係的，為了你，我可以。"],
  resigned: ["我去工作了。", "……該去還債了，晚點回來。", "別擺那種臉，我去就是了。"],
  willing: ["交給我吧！很快就幫你還完～", "我去賺錢囉，回來要誇我！", "放心啦，這點小事我來。"],
  aroused: ["……那我去囉，你、你不要亂想喔。", "去接客的話……嗯，我會好好做的。", "幫你還債是應該的……才、才不是因為想要。"],
};
const ASK_YES = { wronged: ["……好，我去。", "既然你開口了……我去。"], resigned: ["知道了，我去。", "……行吧。"], willing: ["好啊，包在我身上！", "嗯！我去幫你賺回來～"], aroused: ["……好啦，我去就是了。", "要我去……那我去囉。"] };
const ASK_NO = { wronged: ["……今天真的不想去，好不好？", "可以先不要嗎……"], resigned: ["今天不行。", "改天吧。"], willing: ["今天好累喔，明天再說～", "這點債你先自己想辦法嘛。"], aroused: ["今、今天不行啦！", "……不要，今天不要。"] };
export function pickLine(pool, r = Math.random()) { return pool[Math.floor(r * pool.length) % pool.length] || ""; }
export function leaveLine(who, r) { return pickLine(LEAVE_LINES[feelOf(who)], r); }
export function askLine(who, yes, r) { return pickLine((yes ? ASK_YES : ASK_NO)[feelOf(who)], r); }

/** RP5 累計付了多少（world.escort.paid）→ 手機收差額（state.escortTaken[id]）。回傳這次收多少。 */
export function collectPaid(state, s) {
  const paid = Math.floor(Number(s?.world?.escort?.paid) || 0);
  if (!state || !s?.id || !paid) return 0;
  state.escortTaken = state.escortTaken && typeof state.escortTaken === "object" ? state.escortTaken : {};
  const taken = Math.floor(Number(state.escortTaken[s.id]) || 0);
  if (paid <= taken) return 0;
  state.escortTaken[s.id] = paid;
  state.gold = (Number(state.gold) || 0) + (paid - taken);
  return paid - taken;
}
export function repayToast(name, amount, gold) {
  const left = debtOf(gold);
  return left > 0 ? `${name}還了 ${amount} 金，剩餘負債 ${left} 金` : `${name}還了 ${amount} 金，債還清了`;
}

/** 偷看：價格、會不會被發現、抽體位。 */
export function peekCost(r = Math.random()) { return PEEK_MIN + Math.floor(r * (PEEK_MAX - PEEK_MIN + 1)); }
export function peekNoticed(r = Math.random()) { return r < NOTICE_CHANCE; }
export function pickPose(r = Math.random()) { return POSES[Math.floor(r * POSES.length) % POSES.length]; }

/** 正在接客嗎（RP5 view）。 */
export function workingNow(s, now = Date.now()) {
  const a = s?.world?.agenda;
  return !!a && a.kind === "escort" && Number(a.until) > now;
}
/** 收工了、還沒帶回房間的那一班。 */
export function returnDue(s, now = Date.now()) {
  const e = s?.world?.escort;
  const seq = Math.floor(Number(e?.lastSeq) || 0);
  if (!seq || seq <= Math.floor(Number(s?.escortBackSeq) || 0)) return null;
  if (workingNow(s, now)) return null;
  const end = Number(e?.lastEnd) || 0;
  if (!end || now - end > RETURN_WINDOW_MS) return null;
  return { seq, end, clients: Number(e?.lastClients) || 1, paid: Number(e?.lastPaid) || 0 };
}

/** 她現在願不願意（房間用）：個性家族、心情餘溫、飢渴都帶進去。 */
export function askChanceFor(who, mood = null, hunger = 0) {
  return askChance({ stage: stageKeyOf(who), family: familyOf(who), loyalty: who?.stats?.loyalty ?? 60, mood, hunger });
}
/** 手機這邊看得到的開班紀錄：RP5 的（world.escort.starts／lastEnd）＋手機自己帶她出門的（escortMine.starts）。 */
export function escortLog(who) {
  const e = who?.world?.escort || {};
  const mine = who?.escortMine || {};
  const starts = [...new Set([...(e.starts || []), ...(mine.starts || [])].map(Number).filter(Boolean))];
  return { starts, lastEnd: Number(e.lastEnd) || 0 };
}
/** 名冊卡：「接客中・第 N 位客人」——照這班時間平均分給每位客人。 */
export function currentClient(s, now = Date.now()) {
  const a = s?.world?.escort?.active;
  if (!a || !workingNow(s, now)) return 0;
  const span = Math.max(1, Number(a.until) - Number(a.startedAt));
  const n = Math.max(1, Number(a.clients) || 1);
  return Math.min(n, Math.floor(((now - Number(a.startedAt)) / span) * n) + 1);
}

/** 客人體型（2026-10-10）：用客人 id 決定（FNV-1a 32 位），常客永遠同一個身材。server/escort.py client_build 同一套。 */
export const CLIENT_BUILDS = ["average", "slim", "muscular", "fat", "tall", "short", "old"];
export function clientBuild(id) {
  let h = 0x811c9dc5;
  for (const byte of new TextEncoder().encode(String(id ?? ""))) { h ^= byte; h = Math.imul(h, 0x01000193) >>> 0; }
  return CLIENT_BUILDS[h % CLIENT_BUILDS.length];
}
/** 正在接的那位客人（RP5 開班時排好的 guests）；沒有就用班次＋第幾位當種子。 */
export function currentGuest(s, now = Date.now()) {
  const k = currentClient(s, now);
  if (!k) return null;
  const a = s.world.escort.active, g = Array.isArray(a.guests) ? a.guests[k - 1] : null;
  if (g && g.id) return { id: g.id, build: CLIENT_BUILDS.includes(g.build) ? g.build : clientBuild(g.id), named: !!g.named };
  const id = `s${a.seq || 0}-${k}`;
  return { id, build: clientBuild(id), named: false };
}
