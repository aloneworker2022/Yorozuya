/* 打工的工作。每次只抽幾份給模型選，畫面上不列出全部。 */
export const JOBS = [
  { id: "konbini", tone: "normal", name: "便利商店的晚班" },
  { id: "cashier", tone: "normal", name: "超市收銀" },
  { id: "cafe-kitchen", tone: "normal", name: "咖啡店內場" },
  { id: "izakaya", tone: "normal", name: "居酒屋端盤子" },
  { id: "bookstore", tone: "normal", name: "書店整理書架" },
  { id: "ramen", tone: "normal", name: "拉麵店洗碗" },
  { id: "flyers", tone: "normal", name: "車站前發傳單" },
  { id: "drugstore", tone: "normal", name: "藥妝店補貨" },
  { id: "ryokan", tone: "uncommon", name: "溫泉旅館的房務" },
  { id: "shrine", tone: "uncommon", name: "神社授與所" },
  { id: "aquarium", tone: "uncommon", name: "水族館餵食" },
  { id: "florist", tone: "uncommon", name: "花店包花" },
  { id: "tackle", tone: "uncommon", name: "釣具店看店" },
  { id: "cinema", tone: "uncommon", name: "電影院賣票" },
  { id: "records", tone: "uncommon", name: "二手唱片行" },
  { id: "moving", tone: "uncommon", name: "搬家公司當助手" },
  { id: "cemetery", tone: "eerie", name: "靈園的管理員助手" },
  { id: "cleanup", tone: "eerie", name: "半夜出動的特殊清掃" },
  { id: "photo", tone: "eerie", name: "沒有客人的舊照相館" },
  { id: "rain-cafe", tone: "eerie", name: "只在雨天出攤的咖啡" },
  { id: "closed-inn", tone: "eerie", name: "停業旅館裡還排著的班" },
  { id: "unmanned", tone: "eerie", name: "監視器前的無人店" },
  { id: "radio", tone: "eerie", name: "午夜電台的接線" },
  { id: "warehouse", tone: "eerie", name: "倉庫夜班" },
];

const TONES = ["normal", "uncommon", "eerie"];

function take(pool, count, random) {
  const copy = [...pool];
  const picked = [];
  for (let i = 0; i < count && copy.length; i++) {
    const index = Math.floor(Number(random()) * copy.length);
    picked.push(copy.splice(index, 1)[0] || copy.pop());
  }
  return picked.filter(Boolean);
}

export function sampleJobs(random = Math.random) {
  const picked = TONES.flatMap((tone) => take(JOBS.filter((job) => job.tone === tone), 2, random));
  return take(picked, picked.length, random);
}
