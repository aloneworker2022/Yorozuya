/** 約會場所：公園分區，給劇本／旁白／產圖共用。 */

export const DATE_PLACES = [
  {
    id: "plaza",
    name: "廣場",
    zh: "在公園廣場",
    en: "in a public park plaza, open square, outdoor daytime park",
  },
  {
    id: "path",
    name: "步道區",
    zh: "在公園步道",
    en: "on a park walking path, tree-lined trail, outdoor park path",
  },
  {
    id: "play",
    name: "遊戲區",
    zh: "在公園遊戲區",
    en: "at a park playground area, outdoor recreation zone",
  },
  {
    id: "woods",
    name: "森林區",
    zh: "在公園森林區",
    en: "in a wooded park area, among trees, outdoor forest path in park",
  },
  {
    id: "toilet",
    name: "廁所",
    zh: "在公園公廁附近",
    en: "near a park public restroom, outdoor toilet area, secluded corner",
  },
];

export function placeOf(id) {
  return DATE_PLACES.find((p) => p.id === id) || DATE_PLACES[0];
}

export function placeZh(id) {
  const p = placeOf(id);
  return p.zh || `在${p.name}`;
}

export function placeEn(id) {
  return placeOf(id).en || "in a public park, outdoor";
}

/** 文案裡的 [place]／[zone]／[場所] → 中文場所 */
export function fillPlaceTokens(text, placeId) {
  const zh = placeZh(placeId);
  const name = placeOf(placeId).name;
  let s = String(text || "");
  for (const a of ["[place]", "{place}", "[zone]", "{zone}", "[場所]", "{場所}"]) {
    s = s.split(a).join(zh);
    // case variants
  }
  s = s.replace(/\[place\]/gi, zh).replace(/\{place\}/gi, zh);
  s = s.replace(/\[zone\]/gi, zh).replace(/\{zone\}/gi, zh);
  s = s.replace(/\[場所\]/g, zh).replace(/\{場所\}/g, zh);
  s = s.replace(/\[placeName\]/gi, name).replace(/\{placeName\}/gi, name);
  return s;
}
