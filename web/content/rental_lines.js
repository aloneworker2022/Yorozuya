/* 日租女友 LINE 句庫（2026-10-13）：AI 失敗時用，句子都吃「真相」變數（地點、點的東西、發生的事），不寫空話。
 * 客人把玩家當經紀人（不知道你們是夫妻）；她傳給老公的訊息照誠實度：誠實／輕描淡寫／說謊。 */
import { SPOTS, PERSONAS } from "./rental.js?v=3";

const pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length) % arr.length];
/** 同一場不重複同一個句型：date.used 記用過的範本。 */
function pickFresh(date, pool, r) {
  const used = (date.used = Array.isArray(date.used) ? date.used : []);
  const fresh = pool.filter((t) => !used.includes(t));
  const t = pick(fresh.length ? fresh : pool, r);
  used.push(t);
  if (used.length > 40) used.splice(0, used.length - 40);
  return t;
}
const fill = (t, v) => String(t).replace(/\{(\w+)\}/g, (_, k) => (v[k] ?? ""));
/** 每個點「她做了什麼」的說法（東西類型不同：飲料、展區、設施、電影…）。her＝客人講她、me＝她自己講。 */
const SPOT_DO = {
  cafe: { her: "她點了{item}", me: "我點了{item}" }, aquarium: { her: "她最喜歡{item}", me: "{item}好漂亮" },
  amusement: { her: "她一直想玩{item}", me: "剛玩了{item}" }, shopping: { her: "她在看{item}", me: "在看{item}" },
  cinema: { her: "看的是{item}", me: "看的是{item}" }, dinner: { her: "她點了{item}", me: "我點了{item}" },
  karaoke: { her: "她唱了{item}", me: "唱了{item}" }, izakaya: { her: "她喝了{item}", me: "喝了一點{item}" },
  nightview: { her: "我們在{item}", me: "在{item}看夜景" },
};
const doOf = (key, who, item) => fill((SPOT_DO[key] || SPOT_DO.cafe)[who], { item });

/** 客人在每個點傳給經紀人的話（真相：spot.item / act / gift / drunk）。 */
const CLIENT_SPOT = {
  gentleman: ["我們到{place}了。{herDo}，看起來很喜歡。", "謝謝您安排，{place}很愉快。", "{place}這邊人不多，她放鬆了一些。",
    "{place}這邊很順利，{act}，她有點害羞。", "剛剛在{place}，{act}，她沒有拒絕，我很開心。", "在{place}{act}了，她的手很暖。"],
  clingy: ["{place}到了！{herDo}欸，好可愛～", "可以多待一下嗎，{place}好好玩", "她在{place}一直笑，好想一直看",
    "在{place}我們{act}了喔！好開心", "{place}好擠，所以{act}～", "{place}這邊剛剛{act}！我要記住今天"],
  showoff: ["在{place}，{herDo}，旁邊的人都在看她，羨慕死了吧", "{place}這邊大家一直回頭看我們", "{place}，店員都在偷看她",
    "跟你講，剛剛在{place}{act}，她身材真的很好", "在{place}{act}，路人眼睛都直了", "在{place}{act}的時候她胸部貼過來，你家這個真的讚"],
  dominant: ["{place}。{herDo}。", "{place}。下一站照排，別打電話來。", "{place}，她很乖。",
    "{place}。剛剛{act}，她沒拒絕。", "{place}，{act}。她臉紅了。", "在{place}{act}，她挺習慣的嘛。"],
  otaku: ["到、到{place}了……{herDo}", "{place}，她笑了，好好看……", "她在{place}跟我說話了……好緊張",
    "在{place}……剛剛{act}了……我心臟快停了", "在{place}……{act}……這是真的嗎……", "{place}……{act}了……我、我手都在抖"],
};
const ACT_TEXT = { 牽手: "牽了她的手", "挽著他的手": "她挽著我的手", "餵他吃一口": "她餵我吃了一口", "被他摟著腰": "我摟了她的腰", "靠在他肩上": "她靠在我肩上" };
export function clientSpotLine(date, i, r) {
  const s = date.spots[i], sp = SPOTS[s.key], pool = CLIENT_SPOT[date.client.persona] || CLIENT_SPOT.gentleman;
  const withAct = pool.filter((t) => t.includes("{act}")), noAct = pool.filter((t) => !t.includes("{act}"));
  let line = fill(pickFresh(date, s.act ? withAct : noAct, r), { place: sp.zh, item: s.item, herDo: doOf(s.key, "her", s.item), act: ACT_TEXT[s.act] || s.act });
  if (s.gift) line += `（買了${s.item}送她）`;
  if (s.drunk) line += " 她好像有點醉了";
  return line;
}

/** 她主動傳給老公的話（每個點一次）。level：honest／downplay／lie；family 決定口氣。 */
const WIFE_SPOT = {
  honest: ["在{place}，{meDo}", "現在在{place}～{meDo}", "{place}，{meDo}，還不錯"],
  honestAct: ["在{place}，{meDo}。{actTold}", "現在在{place}～{actTold}你不要生氣喔", "{place}，{meDo}。{actTold}"],
  downplay: ["在{place}，{meDo}，就普通", "{place}，一切正常，不用擔心", "現在在{place}～有點無聊"],
  lie: ["在{place}，什麼事都沒有喔", "{place}，他很規矩，放心", "在{place}，等等就結束了"],
};
const TAIL = { 冷淡: ["。", ""], 溫柔: ["……想你。", "，等我回家。"], 熱絡: ["！", "～"], 佔有: ["。你乖乖在家等我。", "。只想你。"], 反差: ["……", "♡"] };
export function wifeSpotLine(date, i, { level = "honest", family = "溫柔" } = {}, r) {
  const s = date.spots[i], sp = SPOTS[s.key];
  const actTold = s.act && level === "honest" ? `剛剛${s.act === "被他摟著腰" ? "被他摟了一下腰" : s.act === "餵他吃一口" ? "餵他吃了一口" : s.act === "挽著他的手" ? "挽了他的手" : s.act === "靠在他肩上" ? "靠了一下他的肩" : "牽了手"}。` : "";
  const pool = actTold ? WIFE_SPOT.honestAct : WIFE_SPOT[level] || WIFE_SPOT.honest;
  const body = fill(pickFresh(date, pool, r), { place: sp.zh, item: s.item, meDo: doOf(s.key, "me", s.item), actTold }).replace(/[。！～]+$/, "");
  const tail = pick(TAIL[family] || [""], r);
  return body + (tail && /^[。！～…，]/.test(tail) ? tail : `。${tail}`);
}

/** 延長要求（客人 → 經紀人）。 */
export function clientExtLine(date, i, r) {
  const sp = SPOTS[date.spots[i].key].zh;
  return {
    gentleman: `不好意思，${sp}這邊想多留一小時，可以嗎？費用我會補。`, clingy: `經紀人拜託～${sp}可以延長一小時嗎！我加錢！`,
    showoff: `${sp}再一小時，錢不是問題。`, dominant: `延長一小時。`, otaku: `那個……可、可以多一個小時嗎……`,
  }[date.client.persona] || `${sp}可以延長一小時嗎？`;
}
export function clientExtReply(date, ok) {
  const p = date.client.persona;
  if (ok) return { gentleman: "謝謝您。", clingy: "耶！謝謝經紀人！", showoff: "早該這樣。", dominant: "嗯。", otaku: "謝、謝謝……" }[p] || "謝謝。";
  return { gentleman: "了解，那照原定。", clingy: "嗚……好吧。", showoff: "嘖，小氣。", dominant: "……隨便。", otaku: "啊……好的……" }[p] || "好吧。";
}

/** 邀請成功後，客人通知經紀人去休息（紳士客氣、宅男自顧自）。 */
export function clientInviteLine(date) {
  const where = date.invite.stay === "stay" ? "今晚就住下" : "去休息一下";
  return {
    gentleman: `我問了她要不要${where}，她說好。跟您說一聲。`, clingy: `她答應了！我們要${where}喔～`,
    showoff: `她答應跟我${where}了，你家這個真的很上道。`, dominant: `我們${where}。`,
    otaku: `那、那個……我們要${where}了……她、她應該是答應了……`,
  }[date.client.persona] || `我們要${where}。`;
}
/** 沒被邀（或沒成功）：約會結束。 */
export function clientByeLine(date, st) {
  return {
    gentleman: "今天非常愉快，她已經回去了，謝謝您。", clingy: "今天好開心！下次還要找她！", showoff: "今天不錯，她回去了。",
    dominant: "結束了，她自己回去。", otaku: "今、今天謝謝……她回去了……",
  }[date.client.persona] || "今天結束了。";
}

/** 旅館裡：客人回訊息（正在做的時候沒空、很慢、很短）。 */
const HOTEL_BUSY = ["……", "等等", "忙", "晚點回", "嗯"];
const HOTEL_BRAG = {
  gentleman: ["她很溫柔。", "請放心，我會好好對她。"], clingy: ["她好可愛……", "不想讓她走了"],
  showoff: ["你家這個身材真的沒話說", "她叫得很好聽喔", "嘖，她私下很騷耶"], dominant: ["她很聽話。", "還沒完。"], otaku: ["她、她好軟……", "我、我第一次這樣……"],
};
export function clientHotelReply(date, busy, r) { return busy ? pick(HOTEL_BUSY, r) : pick(HOTEL_BRAG[date.client.persona] || HOTEL_BRAG.gentleman, r); }
export function clientHotelDone(date) {
  const h = date.hotel?.result, n = h?.cums || 0;
  const brag = date.client.persona === "showoff" || date.client.persona === "dominant";
  if (brag && h?.level === "sex") return `結束了。${n > 1 ? `做了 ${n} 次，` : ""}${h.creampies ? "她讓我射裡面。" : "她很棒。"}`;
  return { gentleman: "她休息好了，我送她回去。謝謝您今天的安排。", clingy: "要放她回去了……捨不得", showoff: "結束了，她很棒。", dominant: "結束。", otaku: "那、那個……結束了……謝謝……" }[date.client.persona] || "結束了。";
}

/** 她在旅館裡／之後傳給老公（照誠實度）。 */
export function wifeHotelLine(date, level) {
  const h = date.hotel?.result;
  if (!h) return "";
  if (level === "honest") return "……我們去休息了。對不起，回家我會全部告訴你。";
  if (level === "downplay") return "去休息了一下，沒什麼，等等就回家。";
  return "他累了想休息一下，我陪他坐著而已，等等回家。";
}

/** 玩家主動傳訊（AI 失敗時）：客人／她的短回覆。 */
export function clientReply(date, phase, r) {
  if (phase === "hotel") return clientHotelReply(date, r() < 0.7, r);
  return pick({ gentleman: ["好的，沒問題。", "她很好，請放心。"], clingy: ["嗯嗯！", "她好可愛喔"], showoff: ["知道啦", "你家這個不錯"],
    dominant: ["嗯。", "別一直傳。"], otaku: ["好、好的……", "嗯……"] }[date.client.persona] || ["好。"], r);
}
export function wifeReply(date, phase, { family = "溫柔" } = {}, r) {
  if (phase === "hotel") return pick(["……", "等等", "現在不方便", "晚點說"], r);
  return pick({ 冷淡: ["嗯。", "在忙。"], 溫柔: ["嗯，我沒事，你不要擔心。", "快結束了，等我。"], 熱絡: ["好啦好啦～", "很快就回去啦！"],
    佔有: ["你在想我嗎？", "乖，等我。"], 反差: ["嗯……", "等、等一下啦"] }[family] || ["嗯。"], r);
}

export const PERSONA_ZH = Object.fromEntries(Object.entries(PERSONAS).map(([k, v]) => [k, v.zh]));
