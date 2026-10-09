/* 房間停留與日本作息的時長。真實時間，不跟看板娘時長。 */

export const HOUR_MS = 60 * 60 * 1000;
export const WORK_MS = 4 * HOUR_MS;
export const BROWSE_MS = 30 * 60 * 1000; // 在家上網固定 30 分
/* 跟 server/life_agent.py、life_data.py 同一套（2026-10-09 加在家的事）。改一邊要改另一邊。 */
export const OUTSIDE_KINDS = ["work", "stroll", "browse", "sleep", "idle", "tidy", "meal"];
export const HOME_KINDS = ["browse", "idle", "tidy", "meal"];
export const OUTSIDE_KIND_ZH = { work: "打工", stroll: "溜達", browse: "上網", sleep: "睡覺", idle: "發呆", tidy: "整理房間", meal: "吃飯" };
export const HOME_DURATIONS_MIN = { idle: [30], browse: [30], tidy: [30, 60] };
export const MEAL_TIMES = { 早起型: [6, 12, 18], 夜貓子: [12, 18.5, 0.5], 愛睡午覺: [8, 12, 19], 淺眠易怒: [7.5, 12, 19], 隨和好睡: [8.5, 12.5, 19], "": [8, 12, 19] };
export const MEAL_MIN = [30, 30, 30];
/* 選擇權重：醒著時在家的事佔大半；溜達一天最多 3 次；打工第一班 4.5、第二班 0.15（偶爾兩班）。 */
export const LIFE_WEIGHTS = { stroll: 1.5, browse: 2.0, idle: 2.4, tidy: 0.9, workFirst: 4.5, workSecond: 0.15, strollPerDay: 3 };
/* 在家每件把心情往平靜壓的量。 */
export const HOME_CALM = { browse: 6, idle: 10, tidy: 14, meal: 8 };
/* SCP：第一次 1/40、下一步 1/8，同一人兩步之間至少 10 天（大約幾週一步）。 */
export const SCP_FIRST_CHANCE = 1 / 40;
export const SCP_NEXT_CHANCE = 1 / 8;
export const SCP_GAP_MS = 10 * 24 * HOUR_MS;
const STROLL_SHORT_MS = 30 * 60 * 1000;

/** 非妻子 2、3 或 4 小時；妻子帶 8～16 小時。 */
export function rollStayHours(isWife, random = Math.random) {
  const n = Number(random());
  if (isWife) return 8 + Math.floor(n * 9);
  return 2 + Math.floor(n * 3);
}

/** 房間召喚黏著價，3～5 金。 */
export function rollSummonCost(random = Math.random) {
  return 3 + Math.floor(Number(random()) * 3);
}

/** 打工固定 4 小時；發呆／在家上網／吃飯固定 30 分；整理房間 30 或 60 分；溜達 30 分鐘或 1 小時。 */
export function agendaDurationMs(kind, random = Math.random) {
  if (kind === "work") return WORK_MS;
  if (kind === "meal") return 30 * 60 * 1000;
  const opts = HOME_DURATIONS_MIN[kind];
  if (opts) return opts[Math.floor(Number(random()) * opts.length) % opts.length] * 60 * 1000;
  return Number(random()) < 0.5 ? STROLL_SHORT_MS : HOUR_MS;
}

/* 下一件做什麼由 RP5 決定（server/life_agent.py pick_next：日本時間＋作息＋心情＋最近做過什麼，含睡覺）。
 * 以前這裡的 nextAgendaKind 沒人呼叫，2026-10-09 拿掉，避免兩邊規則不一樣。 */

/* 她在日本帶回來的心情：強度 0～100，隨時間淡回平靜。跟 server/life_agent.py mood_now 同一套數字。 */
export const OUTSIDE_MOODS = ["平靜", "愉快", "不悅", "低落", "不安", "虛脫"];
export const MOOD_CLEAR = 12;
export const MOOD_DECAY_PER_HOUR = { 愉快: 5, 不悅: 5, 低落: 4, 不安: 5, 虛脫: 15 };
const MOOD_DEFAULT_LEVEL = 40;

/** 現在的心情（惰性衰減，不寫回）。舊存檔只有字、沒有強度：當 40、從現在起算。 */
export function outsideMoodNow(world, now = Date.now()) {
  const name = String(world?.mood || "平靜");
  if (!OUTSIDE_MOODS.includes(name) || name === "平靜") return { name: "平靜", level: 0, why: "" };
  const raw = Number(world.moodLevel);
  const level0 = Number.isFinite(raw) && raw > 0 ? raw : MOOD_DEFAULT_LEVEL;
  const at = Number(world.moodAt);
  const hours = Number.isFinite(at) && at > 1e11 ? Math.max(0, (now - at) / HOUR_MS) : 0;
  const level = level0 - hours * (MOOD_DECAY_PER_HOUR[name] || 5);
  if (level < MOOD_CLEAR) return { name: "平靜", level: 0, why: "" };
  return { name, level: Math.round(Math.min(100, level)), why: String(world.moodWhy || "") };
}

/** 強度講成話：給聊天提示用。 */
export function moodStrengthWord(level) {
  const n = Number(level) || 0;
  return n >= 60 ? "很" : n >= 30 ? "" : "有一點";
}

/** RP5 /api/life 那一列畫進 world。房間（test_room_summon）和名冊（app.js）共用，免得一邊漏抄。
 * 心情只在她人在日本時才蓋（人在房裡時手機是真相）。記憶照 id 去重推進 mind。 */
export function paintLifeRow(world, row) {
  if (!world || !row) return;
  if (row.home?.id) world.home = { id: row.home.id, name: row.home.name };
  if (row.regionId) world.regionId = row.regionId;
  if (row.job?.name) world.job = { id: row.job.id || "", name: row.job.name };
  world.agenda = row.agenda || null;
  world.activity = row.activity || null;
  world.shift = row.shift || null;
  world.stroll = row.stroll || null;
  world.browse = row.browse || null;
  world.sleep = row.sleep || null;
  world.homeAct = row.homeAct || null;
  if (row.phase === "japan" && row.mood) {
    world.mood = row.mood;
    world.moodLevel = Number(row.moodLevel) || 0;
    world.moodAt = Number(row.moodAt) || 0;
    world.moodWhy = row.moodWhy || "";
  }
  if (Array.isArray(row.met) && row.met.length) world.met = row.met;
  if (row.last && typeof row.last === "object") world.lastOutside = row.last;
  if (row.scpSteps && typeof row.scpSteps === "object" && Object.keys(row.scpSteps).length) world.scpSteps = row.scpSteps;
  if (!world.mind || typeof world.mind !== "object" || Array.isArray(world.mind)) {
    world.mind = { immediate: [], mid: [], long: [], seeded: true };
  }
  const mind = world.mind;
  if (!Array.isArray(mind.immediate)) mind.immediate = [];
  if (!Array.isArray(mind.mid)) mind.mid = [];
  if (!Array.isArray(mind.long)) mind.long = [];
  const seen = new Set();
  for (const tier of [mind.immediate, mind.mid, mind.long]) {
    for (const item of tier) if (item?.id) seen.add(item.id);
  }
  for (const item of row.memories || []) {
    if (!item?.id || !item.text || seen.has(item.id)) continue;
    mind.immediate.push(item);
    seen.add(item.id);
    while (mind.immediate.length > 10) mind.mid.push(mind.immediate.shift());
    while (mind.mid.length > 30) mind.long.push(mind.mid.shift());
    while (mind.long.length > 1000) mind.long.shift();
  }
  mind.seeded = true;
}

/** 停留到期。不用 `| 0`，毫秒時間戳會被砍成負數，人就永遠不走。 */
export function visitDue(until, now) {
  const n = Number(until);
  if (!Number.isFinite(n) || n < 1e11) return false;
  return now >= n;
}
