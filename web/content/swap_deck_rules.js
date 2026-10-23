/* 換妻・各場景玩家手牌組（2026-10-23）。純規則，node 可測。
 * 公園：聊天／輕挑，不含酒。酒吧：沿用原 DECK_BAR。
 * KTV／飯店：配對後手牌只對對方妻子（外加 tease 混抽，見 swap_bar）。 */

import { sceneBase } from "./swap_tease_rules.js?v=4";

/** 有沒有喝酒效果或牌名帶酒。 */
export const isAlcoholCard = (c) => !!(c?.fx?.drink || c?.fx?.strong || /酒|乾杯|乾一杯|烈酒|交杯|敬她一杯|敬他一杯/.test(c?.zh || ""));

/** 公園：無酒。who 可指任何人（破冰四人同場）。 */
export const DECK_PARK = [
  { id: "p_o_hi", who: "other", zh: "跟她打招呼", bold: 1, icon: "chat" },
  { id: "p_o_praise", who: "other", zh: "稱讚她今天很漂亮", bold: 1, icon: "heart" },
  { id: "p_o_ask", who: "other", zh: "問她平常的興趣", bold: 1, icon: "chat" },
  { id: "p_o_walk", who: "other", zh: "邀她一起走走", bold: 2, icon: "seat" },
  { id: "p_o_sit", who: "other", zh: "坐到她旁邊的長椅", bold: 2, icon: "seat", fx: { seat: "player-other" } },
  { id: "p_o_hand", who: "other", zh: "偷偷碰她的手", bold: 3, icon: "hand" },
  { id: "p_o_whisper", who: "other", zh: "說悄悄話", bold: 3, icon: "lips" },
  { id: "p_h_hi", who: "husband", zh: "跟他寒暄", bold: 1, icon: "chat" },
  { id: "p_h_work", who: "husband", zh: "聊工作", bold: 1, icon: "chat" },
  { id: "p_h_praise", who: "husband", zh: "稱讚他老婆", bold: 2, icon: "heart", fx: { aff: { husband: 2 } } },
  { id: "p_h_cross", who: "husband", zh: "提議男女交叉坐", bold: 3, icon: "seat", fx: { seat: "cross" } },
  { id: "p_w_hand", who: "wife", zh: "牽她的手安撫她", bold: 1, icon: "hand", fx: { nerves: -0.15 } },
  { id: "p_w_open", who: "wife", zh: "鼓勵她放開一點", bold: 2, icon: "star", fx: { open: 0.15 } },
  { id: "p_w_seat", who: "wife", zh: "讓她坐到對方丈夫旁邊", bold: 4, icon: "seat", fx: { seat: "wife-husband" } },
  { id: "p_a_topic", who: "all", zh: "丟一個輕鬆話題", bold: 1, icon: "star" },
  { id: "p_a_photo", who: "all", zh: "提議合照", bold: 2, icon: "star" },
  { id: "p_a_truth", who: "all", zh: "玩真心話", bold: 3, icon: "star", fx: { random: true } },
];

/** 酒吧：原牌組（含酒）。 */
export const DECK_BAR = [
  { id: "o_toast", who: "other", zh: "敬她一杯", bold: 1, icon: "cup", fx: { drink: ["player", "other"] } },
  { id: "o_praise", who: "other", zh: "稱讚她今天很漂亮", bold: 1, icon: "heart" },
  { id: "o_strong", who: "other", zh: "幫她點一杯烈酒", bold: 2, icon: "bottle", fx: { drink: ["other"], strong: true } },
  { id: "o_sit", who: "other", zh: "坐到她旁邊", bold: 2, icon: "seat", fx: { seat: "player-other" } },
  { id: "o_hand", who: "other", zh: "偷偷碰她的手", bold: 3, icon: "hand" },
  { id: "o_whisper", who: "other", zh: "說悄悄話", bold: 3, icon: "lips" },
  { id: "o_thigh", who: "other", zh: "手放在她大腿上", bold: 4, icon: "hand" },
  { id: "h_cheers", who: "husband", zh: "乾一杯", bold: 1, icon: "cup", fx: { drink: ["player", "husband"] } },
  { id: "h_work", who: "husband", zh: "聊工作", bold: 1, icon: "chat" },
  { id: "h_praise", who: "husband", zh: "稱讚他老婆", bold: 2, icon: "heart", fx: { aff: { husband: 2 } } },
  { id: "h_cross", who: "husband", zh: "提議男女交叉坐", bold: 3, icon: "seat", fx: { seat: "cross" } },
  { id: "w_hand", who: "wife", zh: "牽她的手安撫她", bold: 1, icon: "hand", fx: { nerves: -0.15 } },
  { id: "w_open", who: "wife", zh: "鼓勵她放開一點", bold: 2, icon: "star", fx: { open: 0.15 } },
  { id: "w_seat", who: "wife", zh: "讓她坐到對方丈夫旁邊", bold: 4, icon: "seat", fx: { seat: "wife-husband" } },
  { id: "a_round", who: "all", zh: "再點一輪酒", bold: 1, icon: "bottle", fx: { drink: ["player", "wife", "husband", "other"] } },
  { id: "a_truth", who: "all", zh: "玩真心話大冒險", bold: 3, icon: "star", fx: { random: true } },
  { id: "a_cross", who: "all", zh: "喝交杯酒", bold: 4, icon: "cup", fx: { drink: ["player", "wife", "husband", "other"], cross: true } },
];

/** KTV（配對後）：玩家手牌只對對方妻子。 */
export const DECK_KTV = [
  { id: "k_o_cheer", who: "other", zh: "幫她鼓掌打氣", bold: 1, icon: "star" },
  { id: "k_o_praise", who: "other", zh: "稱讚她唱歌好聽", bold: 1, icon: "heart" },
  { id: "k_o_duet", who: "other", zh: "邀她對唱", bold: 2, icon: "chat" },
  { id: "k_o_sit", who: "other", zh: "坐到她旁邊", bold: 2, icon: "seat", fx: { seat: "player-other" } },
  { id: "k_o_toast", who: "other", zh: "跟她碰杯", bold: 2, icon: "cup", fx: { drink: ["player", "other"] } },
  { id: "k_o_hand", who: "other", zh: "偷偷碰她的手", bold: 3, icon: "hand" },
  { id: "k_o_whisper", who: "other", zh: "凑到耳邊說悄悄話", bold: 3, icon: "lips" },
  { id: "k_o_arm", who: "other", zh: "摟她的肩", bold: 3, icon: "hand" },
  { id: "k_o_thigh", who: "other", zh: "手放在她大腿上", bold: 4, icon: "hand" },
  { id: "k_o_feed", who: "other", zh: "餵她吃小食", bold: 3, icon: "heart" },
];

/** 飯店房間（配對後）：對對方妻子。 */
export const DECK_HOTEL_ROOM = [
  { id: "hr_o_door", who: "other", zh: "幫她開門進房", bold: 1, icon: "star" },
  { id: "hr_o_praise", who: "other", zh: "稱讚她今天很漂亮", bold: 1, icon: "heart" },
  { id: "hr_o_sit", who: "other", zh: "邀她坐到床邊", bold: 2, icon: "seat", fx: { seat: "player-other" } },
  { id: "hr_o_drink", who: "other", zh: "倒杯水給她", bold: 1, icon: "cup" },
  { id: "hr_o_hand", who: "other", zh: "牽她的手", bold: 2, icon: "hand" },
  { id: "hr_o_whisper", who: "other", zh: "說悄悄話", bold: 3, icon: "lips" },
  { id: "hr_o_kiss_cheek", who: "other", zh: "親她的臉頰", bold: 3, icon: "lips" },
  { id: "hr_o_hold", who: "other", zh: "把她拉進懷裡", bold: 4, icon: "hand" },
  { id: "hr_o_bed", who: "other", zh: "邀她一起躺下", bold: 4, icon: "heart" },
];

/** 飯店浴室（配對後）：對對方妻子。 */
export const DECK_HOTEL_BATH = [
  { id: "hb_o_wait", who: "other", zh: "在門外等她", bold: 1, icon: "chat" },
  { id: "hb_o_praise", who: "other", zh: "稱讚她的身材", bold: 2, icon: "heart" },
  { id: "hb_o_enter", who: "other", zh: "敲開浴室門進去", bold: 3, icon: "seat" },
  { id: "hb_o_wash", who: "other", zh: "幫她沖背", bold: 3, icon: "hand" },
  { id: "hb_o_whisper", who: "other", zh: "凑到耳邊低語", bold: 3, icon: "lips" },
  { id: "hb_o_hold", who: "other", zh: "從後面抱住她", bold: 4, icon: "hand" },
  { id: "hb_o_kiss", who: "other", zh: "在水氣裡親她", bold: 4, icon: "lips" },
  { id: "hb_o_press", who: "other", zh: "把她壓在磁磚牆上", bold: 5, icon: "hand" },
];

export function deckFor(scene) {
  const s = String(scene || "bar");
  if (s === "park") return DECK_PARK;
  if (s === "ktv") return DECK_KTV;
  if (s === "hotel_bath") return DECK_HOTEL_BATH;
  if (s === "hotel_room" || s.startsWith("hotel")) return DECK_HOTEL_ROOM;
  return DECK_BAR;
}

/** 配對後場景（KTV／飯店）：玩家手牌只能對對方妻子（含 tease）。 */
export const isPostPairScene = (scene) => {
  const b = sceneBase(scene);
  return b === "ktv" || b === "hotel";
};

export function handCardOk(card, scene) {
  if (!card) return false;
  if (!isPostPairScene(scene)) return true;
  return card.who === "other" || !!card.tease;
}
