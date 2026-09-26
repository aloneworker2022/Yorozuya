/* 上班時碰上的人。身份、情緒、情況各抽一個；情況只給方向，經過由她自己寫。 */
export const SHIFT_ROLES = [
  { id: "coworker", name: "同事" },
  { id: "customer", name: "顧客" },
];

export const SHIFT_EMOTIONS = [
  { id: "joy", name: "喜" },
  { id: "anger", name: "怒" },
  { id: "sorrow", name: "哀" },
  { id: "delight", name: "樂" },
];

export const SHIFT_ACTS = [
  { id: "glance", name: "打了照面", know: false },
  { id: "together", name: "一起做事", know: false },
  { id: "argue", name: "起了爭執", know: false },
  { id: "help", name: "幫了忙", know: false },
  { id: "blame", name: "被責怪", know: false },
  { id: "chat", name: "聊了一陣", know: true },
  { id: "contact", name: "留了連絡方式", know: true },
  { id: "quiet", name: "幾乎沒說話", know: false },
  { id: "favor", name: "被拜託私事", know: true },
  { id: "return", name: "又回頭來找她", know: true },
];

function pick(list, random) {
  const index = Math.floor(Number(random()) * list.length);
  return list[index] || list[list.length - 1];
}

export function rollShift(random = Math.random) {
  return {
    role: pick(SHIFT_ROLES, random),
    emotion: pick(SHIFT_EMOTIONS, random),
    act: pick(SHIFT_ACTS, random),
  };
}
