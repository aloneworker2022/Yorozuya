/* 房間停留與日本作息的時長。真實時間，不跟看板娘時長。 */

export const HOUR_MS = 60 * 60 * 1000;
export const WORK_MS = 4 * HOUR_MS;
export const BROWSE_MS = 30 * 60 * 1000;
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

/** 打工固定 4 小時；上網固定 30 分鐘；溜達 30 分鐘或 1 小時。 */
export function agendaDurationMs(kind, random = Math.random) {
  if (kind === "work") return WORK_MS;
  if (kind === "browse") return BROWSE_MS;
  return Number(random()) < 0.5 ? STROLL_SHORT_MS : HOUR_MS;
}

/** 打工結束後才溜達或上網；那兩樣做完再回去打工。 */
export function nextAgendaKind(last, random = Math.random) {
  if (last === "work") return Number(random()) < 0.5 ? "stroll" : "browse";
  return "work";
}

/** 停留到期。不用 `| 0`，毫秒時間戳會被砍成負數，人就永遠不走。 */
export function visitDue(until, now) {
  const n = Number(until);
  if (!Number.isFinite(n) || n < 1e11) return false;
  return now >= n;
}
