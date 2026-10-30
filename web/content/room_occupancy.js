// 一間房一次只住一位魅魔（PLAN §14 Q6「一次只能召喚一人」）。純函式，房間與名冊共用，tests/room_occupancy.test.mjs 測。
//
// 「有人」＝她人在房裡，或這趟召喚／召回還沒站定（儀式、繪圖清單還在跑）。
// 她回住處、在日本過日子（人不在房裡、也沒在降臨）＝空房。

/** 房間裡的那位 → { id, name, arriving }；空房回 null。present＝RoomActor 在場；busy＝儀式／抽人正在跑。 */
export function occupantOf(girl, { present = false, busy = false } = {}) {
  if (!girl) return null;
  const here = !!present;
  const arriving = !here && !!(busy || (girl.summonArrivalPending && girl.summonQueueId));
  if (!here && !arriving) return null;
  return { id: String(girl.gameGirlId || girl.id || ""), name: girl.name || "她", arriving };
}

/** 從房間存檔（localStorage）讀出佔房的人。沒寫 present 的舊檔：沒住所＝還在房裡。 */
export function savedOccupant(saved) {
  const g = saved?.girl;
  if (!g) return null;
  const present = typeof saved.present === "boolean" ? saved.present : !g.world?.home;
  return occupantOf(g, { present });
}

/** 這位（id）能不能進房：房裡是別人，或有人正在降臨（含她自己）→ 擋。同一位人已在房裡＝續這趟，不擋。 */
export function blocksSummon(occ, id) {
  if (!occ) return false;
  return occ.arriving || occ.id !== String(id || "");
}

/** 給玩家看的一句話（不帶句號，呼叫端自己接）。 */
export function roomFullText(occ) {
  if (!occ) return "";
  return occ.arriving
    ? `${occ.name}正在降臨——等她到了、離開以後才能召喚別人`
    : `房裡已經有${occ.name}了——等她離開才能召喚別人`;
}
