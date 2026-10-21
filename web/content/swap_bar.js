/* 2026-10-21 換妻・酒吧自我介紹（VN）：
 * 1 對方丈夫打招呼、介紹自己跟老婆 → 2 對方妻子自我介紹（害羞人妻短／老手話多／不太情願勉強）→ 3 玩家自己打字介紹
 * → 4 玩家老婆自我介紹（緊張程度看她的數值）→ 5 對方丈夫點酒、丟第一個話題 → 自由聊天輸入框（還沒有提議卡）。
 * NPC 句子＝live AI（ctx.chat(system, user)），格式「（動作）台詞」，失敗用句庫。老婆用 ctx.say（她自己的聊天人設）。
 * 舞台照互動規則：誰在跟誰講就畫誰（玩家不畫）。 */
import { actLine } from "./swap_select.js?v=9";

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

// ------------------------------------------------------------ 自由聊天（2026-10-21）：對象選擇、AI 回話、NPC 之間的小插曲、玩家反應
import { SESSION_KEY } from "./swap_select.js?v=9";
export const CHAT_NUM = {
  affChat: 1, affNice: 2, affRude: -2,          // 你跟某人說話：+1；稱讚／謝謝 +2；罵人 −2
  progChat: 1, progMax: 100,                    // 每回合場景進度 +1（0–100）
  secondP: 0.35,                                // 另一個人插一句的機率（每回合最多 2 句）
  interEvery: [2, 3],                           // 每 2–3 個玩家回合一段 NPC 插曲
  interPairs: [["wife", "husband", 0.6], ["wife", "other", 0.2], ["husband", "other", 0.2]],
  react: {                                      // 插曲後你的反應
    吃醋: { wife: 2, husband: 0, progress: -2 },
    阻止: { wife: 1, husband: -2, progress: -4 },
    當作沒看到: { wife: -1, husband: 0, progress: 3 },
  },
};
const NICE_RE = /漂亮|可愛|帥|美|謝謝|喜歡|厲害|好看|性感|迷人/, RUDE_RE = /醜|滾|閉嘴|討厭|煩|白痴|笨/;
const ZH = { wife: "老婆", husband: "對方丈夫", other: "對方妻子", all: "大家" };
/** 大家 → 從字面猜對象；猜不到＝對方丈夫先回。 */
export function inferTarget(text, names = {}) {
  const t = String(text || "");
  const has = (n) => n && t.includes(n);
  if (has(names.other) || /嫂子|大嫂|美女|夫人|太太|妳老婆|你老婆|你太太/.test(t)) return "other";
  if (has(names.wife) || /老婆|寶貝|親愛的/.test(t)) return "wife";
  if (has(names.husband) || /大哥|老兄|先生|兄弟|老闆/.test(t)) return "husband";
  return "husband";
}
const FB = {
  husband: ["（笑著舉杯）哈哈，說得好，來，乾一杯！", "（往前傾了傾身）真的嗎？再多說一點嘛。", "（看了你老婆一眼，又看回你）你們感情真好啊。"],
  other: ["（抿著嘴笑）你這個人真有趣。", "（玩著杯緣，偷偷看你）……嗯，我也這麼覺得。", "（臉微微紅了）別、別一直看著我啦。"],
  wife: ["（偷偷拉了拉你的衣角）……老公，你少喝一點。", "（勉強笑了笑）嗯，是啊。", "（低頭喝了一口酒）我、我沒事啦。"],
};
const INTER_FB = {
  "wife|husband": { narr: ["（你看見他的手搭上了老婆的肩）", "（他湊到老婆耳邊說了什麼，她的耳根紅了）"],
    lines: [["husband", "（把酒杯推到她面前）這杯很順口，妳試試看。"], ["wife", "（猶豫了一下，小口喝了）……嗯，甜甜的。"], ["husband", "（笑著靠近一點）妳喝酒的樣子很可愛。"], ["wife", "（別開臉，聲音變小）你、你別這樣說啦……"]] },
  "wife|other": { narr: ["（兩個女人靠在一起竊竊私語）"],
    lines: [["other", "（湊過去小聲）第一次來嗎？我也是會緊張的。"], ["wife", "（點點頭）……嗯，有一點。"], ["other", "（拍拍她的手）放輕鬆，我老公人很好的。"]] },
  "husband|other": { narr: ["（對面那對夫妻低頭交換了一個眼神）"],
    lines: [["other", "（湊到丈夫耳邊）……你覺得她怎麼樣？"], ["husband", "（低笑）很可愛。妳呢？那位先生？"], ["other", "（掩嘴笑）還不錯啦～"]] },
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
function loadSess() { try { return JSON.parse(localStorage.getItem(SESSION_KEY) || "{}") || {}; } catch { return {}; } }
function saveSess(s) { try { localStorage.setItem(SESSION_KEY, JSON.stringify(s)); } catch { /* */ } }

/** el：{ dlg, nm, tx, nx, form, inp, stageEl }；ui：同 runBarIntro。 */
export function runBarChat({ ctx = {}, c, S = {}, ui, el, log = [], isClosed = () => false }) {
  const h = c.husband, w = c.wife, wife = ctx.girl?.() || null, wn = wife?.name || "老婆";
  const name = { wife: wn, husband: h.name, other: w.name };
  const img = (owner, key, ex) => (S.images?.[owner] || {})[`${key}~${ex}`]?.cut || (S.images?.[owner] || {})[`${key}~normal`]?.cut || "";
  const P = (id, ex = "normal") => ({ id, url: id === "wife" ? (wife ? img(wife.id, "wife", ex) : "") : img(c.id, id, ex), label: name[id] });
  const ALL = () => [P("husband"), P("other"), P("wife")];
  const sess = loadSess();
  sess.aff = { wife: 0, husband: 0, other: 0, ...(sess.aff || {}) }; sess.progress = Number(sess.progress) || 0;
  const bump = (k, d, why) => { if (!d) return; sess.aff[k] = (sess.aff[k] || 0) + d; ctx.debug?.(`換妻・酒吧：${name[k]} 好感 ${d > 0 ? "+" : ""}${d}（${why}）→ ${sess.aff[k]}`); };
  const prog = (d, why) => { sess.progress = Math.max(0, Math.min(CHAT_NUM.progMax, sess.progress + d)); ctx.debug?.(`換妻・酒吧：進度 ${d > 0 ? "+" : ""}${d}（${why}）→ ${sess.progress}`); };
  const hType = h.swapType || "紳士型", wType = w.swapType || "害羞人妻";

  // ---- 對象選擇：chips＋點舞台上的人
  let target = "all";
  const chips = document.createElement("div");
  chips.style.cssText = "display:none;gap:6px;margin-top:8px;flex-wrap:wrap";
  chips.innerHTML = ["wife", "husband", "other", "all"].map((k) => `<button type="button" data-t="${k}" style="border:1px solid #6a4a5c;border-radius:14px;padding:3px 10px;font-size:13px;background:#2a2030;color:#e8dce6;box-shadow:none">${ZH[k]}</button>`).join("");
  el.form.before(chips);
  const react = document.createElement("div");
  react.style.cssText = "display:none;gap:6px;margin-top:8px";
  react.innerHTML = Object.keys(CHAT_NUM.react).map((k) => `<button type="button" data-r="${k}" style="flex:1;border:1px solid #c0508a;border-radius:12px;padding:6px;font-size:14px;background:#3a1f33;color:#ffd6ea;box-shadow:none">${k}</button>`).join("");
  el.form.before(react);
  const mark = () => {
    if (chatting && chips.style.display !== "none") el.inp.placeholder = `跟${target === "all" ? "大家" : name[target]}說點什麼…`;
    chips.querySelectorAll("button").forEach((b) => { const on = b.dataset.t === target; b.style.background = on ? "#c0508a" : "#2a2030"; b.style.color = on ? "#fff" : "#e8dce6"; });
    el.stageEl.querySelectorAll(".swap-stage-char").forEach((n) => {
      const on = target !== "all" && n.dataset.id === target, im = n.querySelector("img") || n.firstElementChild;
      n.style.transform = on ? "translateX(-50%) translateY(-2%) scale(1.07)" : "translateX(-50%)";
      n.style.zIndex = on ? "2" : "1";
      if (im) im.style.filter = on ? "drop-shadow(0 0 3px #ffd6ea) drop-shadow(0 0 8px #ff7ab6)" : (im.tagName === "IMG" ? "drop-shadow(0 4px 8px rgba(0,0,0,.45))" : "");
    });
  };
  chips.addEventListener("click", (e) => { const b = e.target.closest("button"); if (!b) return; target = b.dataset.t; mark(); });
  el.stageEl.addEventListener("click", (e) => { const n = e.target.closest(".swap-stage-char"); if (!n || !chatting) return; target = target === n.dataset.id ? "all" : n.dataset.id; mark(); });
  let chatting = false;
  const openInput = (msg = "") => {
    chatting = true; el.dlg.hidden = false; el.nm.textContent = "自由聊天"; el.tx.textContent = msg; el.nx.hidden = true;
    chips.style.display = "flex"; el.form.style.display = "flex"; el.inp.placeholder = `跟${ZH[target]}說點什麼…`;
    el.stageEl.querySelectorAll(".swap-stage-char").forEach((n) => { n.style.pointerEvents = "auto"; n.style.cursor = "pointer"; });
    mark();
  };
  const busy = () => { chatting = false; chips.style.display = "none"; react.style.display = "none"; el.form.style.display = "none"; };

  // ---- AI
  const persona = (k) => k === "husband" ? `你是${h.name}，${h.age}歲，${w.name}的丈夫，個性：${H_FLAVOR[hType]}。`
    : `你是${w.name}，${w.age}歲，${h.name}的妻子，個性：${W_FLAVOR[wType]}。`;
  const RULE = `場合：酒吧裡的換妻約會，另一對是矮胖的宅男丈夫（玩家）和他的妻子${wn}。只寫一句，「（動作）台詞」格式，繁體中文口語，60 字內，不要旁白、不要替別人說話。`;
  const say1 = async (k, task, fb) => {
    const hist = log.slice(-10).join("\n");
    let t = "";
    if (k === "wife") {
      if (wife && ctx.say) try { t = await ctx.say(wife, `（換妻約會在酒吧。最近的對話：\n${hist}\n${task}用「（動作）台詞」格式只寫一句。）`, ""); } catch { /* */ }
    } else if (ctx.chat) try { t = await ctx.chat(persona(k) + RULE, `最近的對話：\n${hist}\n\n${task}`); } catch { /* */ }
    return actLine(t, fb.match(/^（[^）]*）/)?.[0] || "（笑了笑）") || fb;
  };
  const turnLine = async (k, text) => { log.push(`${name[k]}：${text}`); };

  let turns = 0, nextInter = CHAT_NUM.interEvery[0] + Math.floor(Math.random() * (CHAT_NUM.interEvery[1] - CHAT_NUM.interEvery[0] + 1));
  const interlude = async () => {
    const r = Math.random(); let acc = 0, pair = CHAT_NUM.interPairs[0];
    for (const pp of CHAT_NUM.interPairs) { acc += pp[2]; if (r < acc) { pair = pp; break; } }
    const [a, b] = pair, key = `${a}|${b}`, fb = INTER_FB[key], head = `${a === "wife" ? "老婆" : ZH[a]}（${name[a]}）↔ ${ZH[b]}（${name[b]}）`;
    ctx.debug?.(`換妻・酒吧：插曲 ${name[a]} ↔ ${name[b]}`);
    await ui.show([P(b, b === "other" && wType === "害羞人妻" ? "shy" : "normal"), P(a, a === "wife" ? "shy" : "normal")]);
    const n = Math.min(fb.lines.length, 3 + Math.floor(Math.random() * 2));
    const narrAt = Math.random() < 0.7 ? 1 + Math.floor(Math.random() * (n - 1)) : -1;
    for (let i = 0; i < n; i++) {
      if (i === narrAt) { const nl = pick(fb.narr); log.push(nl); await ui.say(head, nl); }
      const [sp, fl] = fb.lines[i], other = sp === a ? b : a;
      const line = await say1(sp, `你正在跟${name[other]}小聲說話（玩家在旁邊，聽得到一點）。接著上一句回一句，${a === "wife" && b === "husband" ? "曖昧一點" : "自然一點"}。`, fl);
      await turnLine(sp, line); await ui.say(head, `${name[sp]}：${line}`);
    }
    if (isClosed()) return;
    await ui.show(ALL());
    // 你的反應
    el.dlg.hidden = false; el.nm.textContent = "你要怎麼做？"; el.tx.textContent = ""; el.nx.hidden = true;
    react.style.display = "flex"; chips.style.display = "none"; el.form.style.display = "flex"; el.inp.placeholder = "或直接說點什麼…";
    chatting = true;
  };
  react.addEventListener("click", async (e) => {
    const bt = e.target.closest("button"); if (!bt) return;
    const k = bt.dataset.r, fx = CHAT_NUM.react[k];
    busy();
    bump("wife", fx.wife, k); bump("husband", fx.husband, k); prog(fx.progress, k); saveSess(sess);
    log.push(`（你${k === "當作沒看到" ? "假裝沒看到" : k}）`);
    const fb = { 吃醋: "（看了你一眼，偷偷笑了）……你吃醋啦？", 阻止: "（趕緊坐回你身邊）對、對不起……", 當作沒看到: "（看你沒反應，咬了咬嘴唇）……" }[k];
    const line = await say1("wife", `你老公剛才${k === "當作沒看到" ? "假裝沒看到你跟別人的互動" : k === "吃醋" ? "明顯吃醋了" : "出聲阻止了你跟別人的互動"}。回應他一句。`, fb);
    await ui.show([P("wife", "shy")]);
    await turnLine("wife", line); await ui.say(wn, line);
    await ui.show(ALL()); openInput();
  });
  el.form.onsubmit = async (e) => {
    e.preventDefault(); if (!chatting) return;
    const v = el.inp.value.trim(); if (!v) return; el.inp.value = "";
    const tgt = target === "all" ? inferTarget(v, name) : target;
    busy();
    log.push(`你（對${target === "all" ? "大家" : name[tgt]}）：${v}`);
    bump(tgt, RUDE_RE.test(v) ? CHAT_NUM.affRude : NICE_RE.test(v) ? CHAT_NUM.affNice : CHAT_NUM.affChat, "聊天"); prog(CHAT_NUM.progChat, "聊天");
    // 第二個人（每回合最多 2 句）
    const second = Math.random() < CHAT_NUM.secondP ? ({ wife: "husband", other: "husband", husband: "other" }[tgt]) : "";
    await ui.show(second ? [P(second), P(tgt)] : [P(tgt)]);
    await ui.say("你", v);
    const l1 = await say1(tgt, `玩家${target === "all" ? "對大家說" : "對你說"}：「${v}」。回他一句。`, pick(FB[tgt]));
    await turnLine(tgt, l1); await ui.say(name[tgt], l1);
    if (second) { const l2 = await say1(second, `接著${name[tgt]}剛才那句，插一句話。`, pick(FB[second])); await turnLine(second, l2); await ui.say(name[second], l2); }
    sess.log = log.slice(-20); saveSess(sess);
    turns++;
    if (turns >= nextInter) { turns = 0; nextInter = CHAT_NUM.interEvery[0] + Math.floor(Math.random() * 2); await interlude(); return; }
    await ui.show(ALL()); openInput();
  };
  saveSess(sess);
  void ui.show(ALL()).then(() => openInput("（現在可以自由聊天了：選對象，或點舞台上的人）"));
  return { get target() { return target; }, sess };
}
