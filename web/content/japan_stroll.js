/* 亂逛。先抽地方，再抽事件種類：日常較常、奇遇其次、詭異恐怖較少。 */
import { SHIFT_EMOTIONS } from "./japan_shift.js";

export const STROLL_TONES = [
  { id: "daily", name: "日常", weight: 3 },
  { id: "wonder", name: "奇遇", weight: 2 },
  { id: "horror", name: "詭異恐怖", weight: 1 },
];

export const STROLL_PLACES = [
  { id: "shotengai", name: "商店街" },
  { id: "shrine", name: "神社" },
  { id: "river", name: "河邊" },
  { id: "station", name: "車站前" },
  { id: "park", name: "公園" },
  { id: "alley", name: "巷子" },
  { id: "bridge", name: "橋上" },
  { id: "market", name: "市場" },
];

export const STROLL_SOLO = [
  { id: "pass", name: "只是走過去", know: false },
  { id: "sit", name: "停下來坐一下", know: false },
  { id: "rain", name: "躲了一場雨", know: false },
  { id: "lost", name: "迷路又走回來", know: false },
  { id: "view", name: "看了一會兒風景", know: false },
  { id: "eat", name: "買了點吃的", know: false },
  { id: "crowd", name: "跟著人潮走", know: false },
  { id: "corner", name: "在角落待著", know: false },
  { id: "dusk", name: "天色暗了才離開", know: false },
  { id: "sound", name: "聽見一段不相干的聲音", know: false },
];

export const STROLL_WONDER_SOLO = [
  { id: "lucky", name: "碰上不該那麼巧的事", know: false },
  { id: "gift", name: "得到一個小好處", know: false },
  { id: "path", name: "路突然變得不一樣", know: false },
  { id: "guide", name: "被什麼東西引了一小段", know: false },
];

export const STROLL_WONDER_PERSON = [
  { id: "greet", name: "被誰特別招呼", know: false },
  { id: "help", name: "幫了忙", know: false },
  { id: "chat", name: "聊了一陣", know: true },
  { id: "contact", name: "留了連絡方式", know: true },
  { id: "return", name: "走遠又回頭", know: true },
];

export const STROLL_HORROR_SOLO = [
  { id: "followed", name: "感覺有東西跟著", know: false },
  { id: "wrong", name: "看到不該出現的東西", know: false },
  { id: "sound", name: "聲音對不上", know: false },
  { id: "road", name: "路和記憶不一樣", know: false },
];

export const STROLL_HORROR_PERSON = [
  { id: "stare", name: "被盯著看", know: false },
  { id: "talk", name: "被搭話", know: false },
  { id: "follow", name: "被人跟著走", know: false },
  { id: "gone", name: "人突然不在了", know: false },
];

const STROLL_ACTS = {
  daily: { solo: STROLL_SOLO, person: null },
  wonder: { solo: STROLL_WONDER_SOLO, person: STROLL_WONDER_PERSON },
  horror: { solo: STROLL_HORROR_SOLO, person: STROLL_HORROR_PERSON },
};

export const STROLL_PERSON = [
  { id: "glance", name: "打了照面", know: false },
  { id: "yield", name: "讓了一下路", know: false },
  { id: "argue", name: "起了爭執", know: false },
  { id: "help", name: "幫了忙", know: false },
  { id: "blame", name: "被責怪", know: false },
  { id: "chat", name: "聊了一陣", know: true },
  { id: "contact", name: "留了連絡方式", know: true },
  { id: "quiet", name: "幾乎沒說話", know: false },
  { id: "favor", name: "被拜託私事", know: true },
  { id: "return", name: "走遠又回頭", know: true },
];

function pick(list, random) {
  const index = Math.floor(Number(random()) * list.length);
  return list[index] || list[list.length - 1];
}

function pickWeighted(list, random) {
  const total = list.reduce((sum, item) => sum + item.weight, 0);
  let roll = Number(random()) * total;
  for (const item of list) {
    roll -= item.weight;
    if (roll < 0) return item;
  }
  return list[list.length - 1];
}

export function rollStroll(random = Math.random) {
  const place = pick(STROLL_PLACES, random);
  const tone = pickWeighted(STROLL_TONES, random);
  const person = Number(random()) < 0.5;
  const acts = STROLL_ACTS[tone.id];
  const act = pick(person ? (acts.person || STROLL_PERSON) : acts.solo, random);
  if (!person) return { place, tone, person: false, emotion: null, act };
  return { place, tone, person: true, emotion: pick(SHIFT_EMOTIONS, random), act };
}
