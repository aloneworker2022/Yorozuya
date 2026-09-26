/* 八地方裡的真實地面。亂逛的每一種地方都落到這個地面上的真名。 */
export const GROUNDS = [
  {
    id: "sapporo-susukino",
    regionId: "hokkaido",
    name: "札幌市中央區薄野",
    fact: "薄野是札幌的商業區，晚上店和居酒屋多。附近有大通公園、薄野站和豐平川。",
    spots: { shotengai: "薄野商店街", shrine: "札幌三吉神社", river: "豐平川河岸", station: "薄野站前", park: "大通公園", alley: "薄野的小路", bridge: "豐平橋", market: "二條市場" },
  },
  {
    id: "hakodate-motomachi",
    regionId: "hokkaido",
    name: "函館市元町",
    fact: "元町在函館山腳，坡道多，有西洋館。附近是十字街、函館站和朝市，海邊是大森海濱。",
    spots: { shotengai: "十字街", shrine: "湯倉神社", river: "大森海濱", station: "函館站前", park: "元町公園", alley: "元町的坂道", bridge: "十字街附近的坡", market: "函館朝市" },
  },
  {
    id: "sendai-ichibancho",
    regionId: "tohoku",
    name: "仙台市青葉區一番町",
    fact: "一番町是仙台的商店街。附近有廣瀨川、仙台站和青葉神社。",
    spots: { shotengai: "一番町商店街", shrine: "青葉神社", river: "廣瀨川河岸", station: "仙台站前", park: "西公園", alley: "一番町的小路", bridge: "廣瀨川大橋", market: "一番町的商店" },
  },
  {
    id: "aomori-city",
    regionId: "tohoku",
    name: "青森市",
    fact: "青森市靠陸奧灣，冬天雪多。市內有青森站、八甲田丸附近的海濱和新町商店街。",
    spots: { shotengai: "新町商店街", shrine: "青森縣護國神社", river: "青森灣海濱", station: "青森站前", park: "平和公園", alley: "新町的小路", bridge: "青森站附近的橋", market: "青森市的市場" },
  },
  {
    id: "asakusa",
    regionId: "kanto",
    name: "東京都台東區淺草",
    fact: "淺草靠隅田川。仲見世通向淺草寺，旁邊有吾妻橋、淺草站和合羽橋道具街。",
    spots: { shotengai: "仲見世商店街", shrine: "淺草寺", river: "隅田川河岸", station: "淺草站前", park: "隅田公園", alley: "淺草的小路", bridge: "吾妻橋", market: "合羽橋道具街" },
  },
  {
    id: "kamakura",
    regionId: "kanto",
    name: "神奈川縣鎌倉市",
    fact: "鎌倉靠海，有鶴岡八幡宮、小町通和由比之濱。鎌倉站是市區入口。",
    spots: { shotengai: "小町通", shrine: "鶴岡八幡宮", river: "由比之濱", station: "鎌倉站前", park: "鎌倉海濱公園", alley: "小町的小路", bridge: "滑川的橋", market: "小町通的店" },
  },
  {
    id: "osu",
    regionId: "chubu",
    name: "名古屋市中區大須",
    fact: "大須是名古屋的商店街，有大須觀音。旁邊有堀川和上前津站。",
    spots: { shotengai: "大須商店街", shrine: "大須觀音", river: "堀川河岸", station: "上前津站前", park: "大須的空地", alley: "大須的小路", bridge: "堀川上的橋", market: "大須的店" },
  },
  {
    id: "kanazawa",
    regionId: "chubu",
    name: "石川縣金澤市",
    fact: "金澤有兼六園、近江町市場、尾山神社和犀川。金澤站離市區有一段路。",
    spots: { shotengai: "近江町市場", shrine: "尾山神社", river: "犀川河岸", station: "金澤站前", park: "兼六園", alley: "主計町茶屋街", bridge: "犀川大橋", market: "近江町市場" },
  },
  {
    id: "higashiyama",
    regionId: "kinki",
    name: "京都市東山區",
    fact: "東山有清水寺、二年坂、清水坂和圓山公園，西邊是鴨川和四條大橋。",
    spots: { shotengai: "清水坂", shrine: "清水寺", river: "鴨川河岸", station: "祇園四條站前", park: "圓山公園", alley: "二年坂", bridge: "四條大橋", market: "清水坂的店" },
  },
  {
    id: "dotonbori",
    regionId: "kinki",
    name: "大阪市中央區道頓堀",
    fact: "道頓堀在難波旁邊，沿道頓堀川有招牌和橋。附近有難波站和黑門市場。",
    spots: { shotengai: "道頓堀", shrine: "難波八阪神社", river: "道頓堀川河岸", station: "難波站前", park: "道頓堀河邊", alley: "道頓堀的小路", bridge: "道頓堀橋", market: "黑門市場" },
  },
  {
    id: "hiroshima",
    regionId: "chugoku",
    name: "廣島市中區",
    fact: "市中心有本通商店街、紙鶴紀念的和平紀念公園，以及元安川和元安橋。廣島站在市區東邊。",
    spots: { shotengai: "本通商店街", shrine: "廣島護國神社", river: "元安川河岸", station: "廣島站前", park: "和平紀念公園", alley: "本通的小路", bridge: "元安橋", market: "本通的店" },
  },
  {
    id: "kurashiki",
    regionId: "chugoku",
    name: "岡山縣倉敷市美觀地區",
    fact: "美觀地區沿倉敷川有白壁和柳樹，有今橋。倉敷站離美觀地區不遠。",
    spots: { shotengai: "倉敷美觀商店街", shrine: "阿智神社", river: "倉敷川河岸", station: "倉敷站前", park: "倉敷川畔", alley: "白壁小路", bridge: "今橋", market: "倉敷美觀的店" },
  },
  {
    id: "dogo",
    regionId: "shikoku",
    name: "松山市道後溫泉",
    fact: "道後溫泉有溫泉街和道後溫泉站。附近有道後公園和伊佐爾波神社。",
    spots: { shotengai: "道後溫泉商店街", shrine: "伊佐爾波神社", river: "道後溫泉街", station: "道後溫泉站前", park: "道後公園", alley: "道後的小路", bridge: "道後溫泉街的坡", market: "道後溫泉商店街" },
  },
  {
    id: "kochi",
    regionId: "shikoku",
    name: "高知縣高知市播磨屋橋",
    fact: "播磨屋橋是高知市中心的商店街，靠近高知城和鏡川。週日附近有日曜市。",
    spots: { shotengai: "播磨屋橋商店街", shrine: "高知城", river: "鏡川河岸", station: "高知站前", park: "高知城公園", alley: "播磨屋橋的小路", bridge: "播磨屋橋", market: "日曜市" },
  },
  {
    id: "hakata",
    regionId: "kyushu",
    name: "福岡市博多區",
    fact: "博多有櫛田神社、川端通商店街和那珂川。博多站是市區東邊的大站，中洲在河邊。",
    spots: { shotengai: "川端通商店街", shrine: "櫛田神社", river: "那珂川河岸", station: "博多站前", park: "中洲的河邊", alley: "博多的小路", bridge: "博多橋", market: "柳橋連合市場" },
  },
  {
    id: "naha",
    regionId: "kyushu",
    name: "沖繩縣那霸市國際通",
    fact: "國際通是那霸的商店街，靠近牧志公設市場。海邊有波上宮。縣廳前站在國際通一端。",
    spots: { shotengai: "國際通", shrine: "波上宮", river: "那霸海邊", station: "縣廳前站", park: "波之上海灘", alley: "國際通的小路", bridge: "國際通附近的路", market: "牧志公設市場" },
  },
];

const CLIMATE = {
  hokkaido: { 春: "北海道春天仍涼，雪可能還沒化完。", 夏: "北海道夏天涼爽，很少悶熱。", 秋: "北海道秋天轉涼，夜裡會冷，平地通常還沒有大雪。", 冬: "北海道冬天寒冷，會下雪。" },
  tohoku: { 春: "東北春天偏涼，櫻花比東京晚。", 夏: "東北夏天溫暖，不像關東那麼悶。", 秋: "東北秋天涼，夜裡要加外套。", 冬: "東北冬天冷，靠日本海的地方雪多。" },
  kanto: { 春: "關東春天有櫻花，白天溫和。", 夏: "關東夏天又熱又悶。", 秋: "關東秋天白天還暖，晚上轉涼。", 冬: "關東冬天乾冷，平地很少積雪。" },
  chubu: { 春: "中部春天看地方，太平洋側較暖，山區仍涼。", 夏: "中部夏天熱，金澤一帶比較悶。", 秋: "中部秋天涼爽。", 冬: "日本海側冬天會下雪，太平洋側較乾。" },
  kinki: { 春: "近畿春天有櫻花，京都白天舒服。", 夏: "京都和大阪夏天非常悶熱。", 秋: "近畿秋天晴朗，晚上涼。", 冬: "近畿冬天偏冷，平地少雪。" },
  chugoku: { 春: "中國地方春天溫和。", 夏: "夏天熱。", 秋: "秋天涼爽。", 冬: "山陽側冬天較乾，山陰側會下雪。" },
  shikoku: { 春: "四國春天溫和。", 夏: "四國夏天熱，高知常常晴。", 秋: "四國秋天還算暖。", 冬: "四國冬天不嚴寒，山裡才會冷。" },
  kyushu: { 春: "九州春天早，沖繩更暖。", 夏: "九州夏天熱，沖繩又熱又濕。", 秋: "九州秋天仍暖，沖繩像長夏。", 冬: "福岡冬天偏涼，沖繩冬天也溫暖，不會下雪。" },
};

export function climateNote(regionId, season) {
  return CLIMATE[regionId]?.[season] || "";
}

export function rollGround(regionId, random = Math.random) {
  const list = GROUNDS.filter((ground) => ground.regionId === regionId);
  const index = Math.floor(Number(random()) * list.length);
  return list[index] || list[0];
}
