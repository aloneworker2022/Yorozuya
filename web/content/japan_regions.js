/* 日本八地方。離開房間後先落在其中一個。 */
export const JAPAN_REGIONS = [
  { id: "hokkaido", name: "北海道" },
  { id: "tohoku", name: "東北" },
  { id: "kanto", name: "關東" },
  { id: "chubu", name: "中部" },
  { id: "kinki", name: "近畿" },
  { id: "chugoku", name: "中國地方" },
  { id: "shikoku", name: "四國" },
  { id: "kyushu", name: "九州" },
];

const byId = new Map(JAPAN_REGIONS.map((region) => [region.id, region]));

export function regionById(id) {
  return byId.get(id) || null;
}

export function rollJapanRegion(random = Math.random) {
  const index = Math.floor(Number(random()) * JAPAN_REGIONS.length);
  return JAPAN_REGIONS[index] || JAPAN_REGIONS[JAPAN_REGIONS.length - 1];
}
