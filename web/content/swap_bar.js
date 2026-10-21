/* 2026-10-21 換妻・酒吧自我介紹（VN）：
 * 1 對方丈夫打招呼、介紹自己跟老婆 → 2 對方妻子自我介紹（害羞人妻短／老手話多／不太情願勉強）→ 3 玩家自己打字介紹
 * → 4 玩家老婆自我介紹（緊張程度看她的數值）→ 5 對方丈夫點酒、丟第一個話題 → 自由聊天輸入框（還沒有提議卡）。
 * NPC 句子＝live AI（ctx.chat(system, user)），格式「（動作）台詞」，失敗用句庫。老婆用 ctx.say（她自己的聊天人設）。
 * 舞台照互動規則：誰在跟誰講就畫誰（玩家不畫）。 */
import { actLine } from "./swap_select.js?v=8";

const H_FLAVOR = {
  紳士型: "彬彬有禮、體貼、說話客氣溫和，會照顧大家的感受",
  老手型: "經驗豐富、從容自在、帶點曖昧的玩笑，很會帶氣氛",
  炫耀型: "愛炫耀自己的工作、收入、老婆的身材，有點自來熟",
};
const W_FLAVOR = {
  害羞人妻: "很害羞、話很少、一句短短的就好，不太敢看人",
  老手: "很放得開、話多、會主動聊、眼神大膽",
  不太情願: "其實不太想來，是被老公拉來的，回答勉強、有點冷淡",
};
const H_FB = {
  紳士型: (h, w) => [`（起身微微點頭）兩位好，我是${h.name}，這是我太太${w.name}。今天謝謝你們願意來。`, `（舉手招來酒保）先來四杯招牌調酒吧，別緊張。對了，你們兩位是怎麼認識的？`],
  老手型: (h, w) => [`（靠在吧台上笑著舉杯）嗨～我是${h.name}，旁邊這位是我老婆${w.name}，今晚放輕鬆玩。`, `（招手叫酒保）來四杯調酒！對了，你們平常週末都做什麼？`],
  炫耀型: (h, w) => [`（整了整名錶，大聲笑）你們好！我${h.name}，開公司的。這是我老婆${w.name}，身材不錯吧？`, `（豪氣地拍桌）今天我請！來最貴的威士忌。話說你們住哪一區？`],
};
const W_FB = {
  害羞人妻: (w) => `（低著頭小聲）……我是${w.name}，請多指教。`,
  老手: (w) => `（撩了撩頭髮，笑著看你）我是${w.name}～老公說今天的對象很可愛，果然沒騙我呢。`,
  不太情願: (w) => `（別開視線，抱著手臂）……${w.name}。是他硬要來的。`,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[m]));
/** 老婆緊張程度 0–1：忠誠／感情高＝越緊張（怕對不起你），飢渴高＝放得開，心情不好再緊一點。 */
export function wifeNerves(who, hunger = 0, mood = null) {
  const loy = Number(who?.stats?.loyalty ?? 60), aff = Number(who?.stats?.affection ?? 60);
  let n = 0.35 + (loy - 60) / 120 + (aff - 60) / 240 - (Number(hunger) || 0) / 200;
  if (mood && ["angry", "hurt", "sad"].includes(mood.type)) n += 0.1;
  return Math.max(0, Math.min(1, n));
}
const nervesZh = (n) => (n >= 0.6 ? "非常緊張，聲音發抖、一直看你" : n >= 0.3 ? "有點緊張、不太自在" : "還算放得開、帶點好奇");

/** 開始自我介紹。ui：{ show(list), say(name, text), ask(placeholder) → Promise<string> }；回 Promise（到自由聊天為止）。 */
export async function runBarIntro({ ctx = {}, c, S = {}, ui }) {
  const h = c.husband, w = c.wife, wife = ctx.girl?.() || null, wn = wife?.name || "老婆";
  const img = (owner, key, ex) => (S.images?.[owner] || {})[`${key}~${ex}`]?.cut || (S.images?.[owner] || {})[`${key}~normal`]?.cut || "";
  const P = {
    husband: (ex = "normal") => ({ id: "husband", url: img(c.id, "husband", ex), label: h.name }),
    other: (ex = "normal") => ({ id: "other", url: img(c.id, "other", ex), label: w.name }),
    wife: (ex = "normal") => ({ id: "wife", url: wife ? img(wife.id, "wife", ex) : "", label: wn }),
  };
  const hType = h.swapType || "紳士型", wType = w.swapType || "害羞人妻";
  const log = [];   // 給 AI 的對話紀錄
  const npc = async (who, task, fb) => {
    const p = who === "husband" ? h : w;
    const sys = `你是${p.name}，${p.age}歲，${who === "husband" ? `${w.name}的丈夫，個性：${H_FLAVOR[hType]}` : `${h.name}的妻子，${w.look?.build || ""}${w.look?.cup ? `、${w.look.cup}罩杯` : ""}，個性：${W_FLAVOR[wType]}`}。`
      + `今晚在酒吧跟另一對夫妻（矮胖的宅男丈夫和他的妻子${wn}）第一次見面，這是一場換妻約會的開場，氣氛曖昧但還很客氣。`
      + `只寫一句，用「（動作）台詞」格式：括號裡是動作神情，後面是說的話；繁體中文、口語、60 字內，不要旁白、不要替別人說話。`;
    const user = (log.length ? `剛才的對話：\n${log.slice(-8).join("\n")}\n\n` : "") + task;
    let t = "";
    try { t = ctx.chat ? await ctx.chat(sys, user) : ""; } catch { /* 句庫 */ }
    return actLine(t, fb.match(/^（[^）]*）/)?.[0] || "（微笑）") || fb;
  };
  const line = async (name, text) => { log.push(`${name}：${text}`); await ui.say(name, text); };

  // 1 對方丈夫
  await ui.show([P.husband(), P.other(wType === "害羞人妻" ? "shy" : "normal")]);
  const [hf1, hf2] = H_FB[hType](h, w);
  await line(h.name, await npc("husband", `你先開口打招呼，介紹你自己和你身邊的妻子${w.name}。`, hf1));
  // 2 對方妻子
  await ui.show([P.other(wType === "害羞人妻" ? "shy" : "normal")]);
  await line(w.name, await npc("other", `輪到你自我介紹（對著那位宅男丈夫）。${wType === "害羞人妻" ? "很短的一句。" : wType === "老手" ? "可以多說兩三句，主動一點。" : "勉強、冷淡一點。"}`, W_FB[wType](w)));
  // 3 玩家
  await ui.show([P.husband(), P.other(), P.wife()]);
  const mine = (await ui.ask("輪到你自我介紹…")).trim() || "大家好，我是……請多指教。";
  log.push(`你：${mine}`); await ui.say("你", mine);
  // 4 老婆
  const mood = ctx.mood?.(wife) || null, hunger = Number(ctx.hunger?.(wife)) || 0, nv = wifeNerves(wife, hunger, mood);
  ctx.debug?.(`換妻・酒吧：${wn}緊張度 ${Math.round(nv * 100)}%`);
  await ui.show([P.husband(), P.other(), P.wife(nv >= 0.3 ? "shy" : "normal")]);
  const wfb = nv >= 0.6 ? `（緊緊抓著你的袖子，小小聲）我、我是${wn}……請多指教……` : nv >= 0.3 ? `（拉了拉裙襬，勉強笑了笑）我是${wn}，你們好。` : `（大方地點頭微笑）我是${wn}，今天請多關照囉。`;
  let wl = "";
  if (wife && ctx.say) {
    try { wl = await ctx.say(wife, `（你們夫妻正在酒吧跟另一對夫妻${h.name}和${w.name}換妻約會的開場。剛才：\n${log.slice(-4).join("\n")}\n輪到你向他們自我介紹。你現在${nervesZh(nv)}。用「（動作）台詞」格式只寫一句。）`, wfb); } catch { /* */ }
  }
  await line(wn, actLine(wl, wfb.match(/^（[^）]*）/)[0]) || wfb);
  // 5 對方丈夫點酒＋話題
  await ui.show([P.husband(), P.other(), P.wife(nv >= 0.6 ? "shy" : "normal")]);
  await line(h.name, await npc("husband", "大家都介紹完了。你幫大家點酒，然後丟出第一個輕鬆的話題（問問題），讓氣氛熱起來。", hf2));
  return log;
}
