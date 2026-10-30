/* 離開房間後的住所。每次只抽幾間給模型選，畫面上不列出全部。 */
export const HOMES = [
  { id: "station-apartment", tone: "normal", name: "車站步行圈的單人公寓" },
  { id: "market-flat", tone: "normal", name: "超市樓上的一房" },
  { id: "work-suite", tone: "normal", name: "公司附近的套房" },
  { id: "family-room", tone: "normal", name: "親戚空出的和室" },
  { id: "business-hotel", tone: "normal", name: "月租商務旅館的一間" },
  { id: "old-block", tone: "normal", name: "老社區裡的兩房公寓" },
  { id: "river-van", tone: "whimsical", name: "停在河堤的箱型車" },
  { id: "bookshop-upstairs", tone: "whimsical", name: "書店樓上的房間" },
  { id: "shrine-hut", tone: "whimsical", name: "神社後面的小屋" },
  { id: "roof-greenhouse", tone: "whimsical", name: "屋頂加蓋的溫室" },
  { id: "platform-room", tone: "whimsical", name: "廢線月台改的小房間" },
  { id: "onsen-room", tone: "whimsical", name: "溫泉街住下來的邊間" },
  { id: "cafe-attic", tone: "whimsical", name: "打烊後才能上樓的咖啡店閣樓" },
  { id: "boat-cabin", tone: "whimsical", name: "港邊小船的艙房" },
  { id: "no-plate", tone: "eerie", name: "門牌被撕掉的公寓" },
  { id: "drawn-curtains", tone: "eerie", name: "白天也拉著窗簾的房間" },
  { id: "windowless", tone: "eerie", name: "沒有窗戶的地下室" },
  { id: "many-mirrors", tone: "eerie", name: "鏡子很多的空屋" },
  { id: "closed-inn", tone: "eerie", name: "已經不接客人的老旅館一間" },
  { id: "dark-end", tone: "eerie", name: "走廊盡頭、燈總是不亮的那一戶" },
  { id: "empty-lights", tone: "eerie", name: "鄰居說沒人住、夜裡卻有燈的房子" },
  { id: "phone-rings", tone: "eerie", name: "電話有時自己會響的房子" },
];

const TONES = ["normal", "whimsical", "eerie"];

function take(pool, count, random) {
  const copy = [...pool];
  const picked = [];
  for (let i = 0; i < count && copy.length; i++) {
    const index = Math.floor(Number(random()) * copy.length);
    picked.push(copy.splice(index, 1)[0] || copy.pop());
  }
  return picked.filter(Boolean);
}

export function sampleHomes(random = Math.random) {
  const picked = TONES.flatMap((tone) => take(HOMES.filter((home) => home.tone === tone), 2, random));
  return take(picked, picked.length, random);
}
