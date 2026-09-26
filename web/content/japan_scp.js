/* 同一件異常分三步。第一次很少；已經開始的，再遇到會進下一步。 */
const FIRST_CHANCE = 1 / 15;
const NEXT_CHANCE = 1 / 2;

export const SCP_EVENTS = [
  {
    id: "173",
    code: "SCP-173",
    title: "混凝土雕像",
    grounds: ["asakusa"],
    work: true,
    stages: [
      "餘光裡，雕像好像不在剛才的位置。盯著看的時候它不動。",
      "她一眨眼，雕像明顯靠近了。旁邊的人也看見了。",
      "只要視線離開，它就在動。他們不敢眨眼，也不敢轉頭。",
    ],
  },
  {
    id: "106",
    code: "SCP-106",
    title: "穿牆的老人",
    grounds: ["kamakura"],
    stages: [
      "牆上有一塊不該有的潮濕、發暗的痕跡。",
      "那塊痕跡裡慢慢鼓出一隻手的形狀。",
      "一個腐爛的老人從牆裡跨出一步。她退開，沒有讓他碰到。",
    ],
  },
  {
    id: "096",
    code: "SCP-096",
    title: "不該看清的臉",
    grounds: ["aomori-city"],
    stages: [
      "遠處有個瘦長的人，臉還沒看清。",
      "她不小心看清了那張蒼白瘦長的臉。",
      "她知道那東西已經知道被看過。只寫被盯上的感覺，不要寫追逐。",
    ],
  },
  {
    id: "087",
    code: "SCP-087",
    title: "沒有底的樓梯",
    grounds: ["hakodate-motomachi"],
    stages: [
      "樓裡多了一道往下的樓梯，燈比別處暗。",
      "階梯數不完，下面有聲音，又好像沒有。",
      "黑暗深處有一張臉對著她。她停在入口，沒有下去。",
    ],
  },
  {
    id: "513",
    code: "SCP-513",
    title: "一聲鐘",
    grounds: ["dogo"],
    work: true,
    stages: [
      "不知道哪裡響了一聲鐘，周圍的人沒有反應。",
      "之後她在沒人的角落瞥見一個模糊人影，一看又沒有。",
      "人影比上次近，而且是在她確定沒有人的地方。",
    ],
  },
  {
    id: "701",
    code: "SCP-701",
    title: "弔王悲劇",
    grounds: ["higashiyama"],
    stages: [
      "牆上貼著《弔王悲劇》的海報，她只覺得名字不舒服。",
      "海報上的一句話她讀了，就忘不掉。",
      "她開始不受控制地想起下一句。只寫這個侵入，不要寫完整劇情。",
    ],
  },
  {
    id: "1471",
    code: "SCP-1471",
    title: "相片裡的身影",
    grounds: ["dotonbori"],
    work: true,
    stages: [
      "手機裡多了一個她沒裝過的程式。",
      "相片背景裡有一隻瘦高的影子，臉像骷髏。",
      "那個影子比上一張相片更近，幾乎就在她身後。",
    ],
  },
  {
    id: "3008",
    code: "SCP-3008",
    title: "走不完的店",
    grounds: ["osu"],
    work: true,
    stages: [
      "店比看起來深，她一時找不到剛才的入口。",
      "走道在重複，招牌一樣，出口還是不在。",
      "她明白這家店沒有盡頭。她還在裡面。",
    ],
  },
  {
    id: "049",
    code: "SCP-049",
    title: "鳥嘴面具",
    grounds: ["kurashiki"],
    stages: [
      "人群裡有一個鳥嘴面具，她以為是人在玩。",
      "那個人穿過現代的街道，朝她伸手。",
      "手伸得很近。她避開了，沒有被碰到。",
    ],
  },
  {
    id: "2316",
    code: "SCP-2316",
    title: "海裡不該認的人",
    grounds: ["naha"],
    stages: [
      "海面上有幾個站著的人，遠得看不清。",
      "她覺得那些人有點眼熟，又立刻不該這樣想。",
      "她沒有承認自己認得。那些人還在，而且好像更近。",
    ],
  },
  {
    id: "426",
    code: "SCP-426",
    title: "只能稱作我的家電",
    work: true,
    stages: [
      "一台小家電。她想叫它，嘴裡卻說成「我」。",
      "別人想糾正，自己也只能說「我」。",
      "那台家電好像才是在說話的那個「我」。她沒有再指它。",
    ],
  },
];

export function scpLabel(scp) {
  return `${scp.code}　${scp.step + 1}/${scp.stages.length}`;
}

export function scpBrief(scp) {
  const prior = scp.stages.slice(0, scp.step).map((line, index) => `${index + 1}. ${line}`).join("\n");
  return [
    `這是${scp.code}的第 ${scp.step + 1}/${scp.stages.length} 步，要比上一次更可怕。`,
    `這一步只寫：${scp.stage}`,
    prior ? `她已經歷過：\n${prior}\n接著寫，不要重頭，不要跳到更後面。` : "這是第一次。只寫這一點不對勁，不要把後面的恐怖一次寫完。",
    "用「我」寫在這個時間、這個地點，2到4句。她不認識編號，不要讓她說出編號。不要寫收容程序，不要寫血腥或傷害過程。",
  ].join("\n");
}

function choose(events, progress, random) {
  const open = events
    .map((event) => ({ event, step: progress?.[event.id] || 0 }))
    .filter((item) => item.step < item.event.stages.length);
  const started = open.filter((item) => item.step > 0);
  const pool = started.length ? started : open;
  if (!pool.length) return null;
  const chance = started.length ? NEXT_CHANCE : FIRST_CHANCE;
  if (!(Number(random()) < chance)) return null;
  const index = Math.floor(Number(random()) * pool.length);
  const picked = pool[index] || pool[0];
  return { ...picked.event, step: picked.step, stage: picked.event.stages[picked.step] };
}

export function rollPlaceScp(ground, progress, random = Math.random) {
  return choose(SCP_EVENTS.filter((event) => event.grounds?.includes(ground?.id)), progress, random);
}

export function rollWorkScp(progress, random = Math.random) {
  return choose(SCP_EVENTS.filter((event) => event.work), progress, random);
}
