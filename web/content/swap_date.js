/* 換妻約會：左對話、右正在說的人、下面輸入。酒吧四人群聊；之後只剩你跟對方妻子。 */
import { api, pickBackdrop } from "./swap_cafe_gen.js?v=38";
import { queuePortraits } from "./swap_pregen.js?v=3";
import {
  addAccept, addDrunk, lockIfReady, bothAgreed, husbandPickScene, barChatGain, toastOf,
  teaseList, teaseOk, husbandBeat, watchPenalty, playerStageGain, hotelHusbandAct, applyHotelAct,
  parseHotelText, portraitExpr, TEASE_ZH, TEASE_AT, HOTEL_AT,
} from "./swap_meet_rules.js?v=2";

const SZ = { bar: "酒吧", park: "夜晚公園", ktv: "KTV", hotel_room: "旅館房間", hotel_bath: "旅館浴室" };
const BG = { bar: "bar", park: "park", ktv: "ktv", hotel_room: "hotel", hotel_bath: "bath" };
const LAST_KEY = "yorozuya.swap.last";

const FB = {
  husband: ["（抬杯）今晚就放輕鬆。", "（看著兩位妻子）慢慢來，不急。", "（笑）這酒還可以。"],
  other: ["（小聲）你們好。", "（看了丈夫一眼）……嗯。", "（點一下頭）我知道了。"],
  wife: ["（抓住你的袖子）……我在。", "（聲音很輕）嗯。", "（低頭）我知道。"],
  dodge: ["（往後退）不要……現在還不行。", "（撥開你的手）等一下。"],
  allow: ["（僵了一下，沒有推開）……輕一點。", "（別過臉）你、你故意的吧。"],
  sexNo: ["（咬著唇）啊……不要看我的臉。", "（抓著床單）太深了……"],
  sexYes: ["（腰忽然軟掉）不行、要去了……", "（聲音碎掉）啊……已經……"],
  watchH: ["（湊近她耳邊）別看他們，看我。", "（把手放上她的腰）放輕鬆。"],
  watchW: ["（別開臉）不要……我老公還在。", "（聲音發顫）你不要這樣。"],
};
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function openSwapDate(ctx, couple, meet) {
  const wife = ctx.girl?.();
  if (!wife || !couple) return null;
  document.getElementById("sd-ov")?.remove();
  const ov = document.createElement("div");
  ov.id = "sd-ov";
  ov.innerHTML = `<style>
    #sd-ov{position:fixed;inset:0;z-index:8700;display:flex;flex-direction:column;background:#1a120c;color:#f4efe6;font:16px/1.45 system-ui,"Noto Sans TC",sans-serif}
    #sd-ov button,#sd-ov input{font:inherit;box-shadow:none;text-shadow:none;letter-spacing:0}
    #sd-ov .top{display:flex;gap:8px;align-items:center;padding:8px 10px;background:#2a2118}
    #sd-ov .top b{flex:1;font-size:15px}
    #sd-ov .top button{background:#3a2e22;color:#f4efe6;border:0;border-radius:8px;padding:6px 10px}
    #sd-ov .st{font-size:12px;color:#d9c7a4;padding:4px 10px;background:#241910}
    #sd-ov .mid{flex:1;display:flex;min-height:0}
    #sd-ov .log{flex:1.3;overflow:auto;padding:10px;display:flex;flex-direction:column;gap:8px}
    #sd-ov .b{max-width:92%;background:#2c241c;border-radius:12px;padding:6px 10px}
    #sd-ov .b.player{background:#245c38}
    #sd-ov .b .nm{font-size:11px;color:#d9c7a4}
    #sd-ov .b.sys{background:transparent;color:#b7a88f;font-size:12px;padding:0}
    #sd-ov .side{flex:0.7;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding:8px;background:#120e0a center/cover no-repeat;min-width:120px}
    #sd-ov .side img{max-height:70%;max-width:100%;object-fit:contain}
    #sd-ov .side .ph{width:72%;aspect-ratio:3/4;border:1px dashed #6b5a45;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#b7a88f;text-align:center;padding:8px}
    #sd-ov .side .who{margin-top:6px;font-size:13px}
    #sd-ov .dots{height:14px;color:#d9c7a4;font-size:12px}
    #sd-ov .acts{display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;background:#241910}
    #sd-ov .acts button{background:#3a2e22;color:#f4efe6;border:0;border-radius:999px;padding:8px 12px;min-height:40px}
    #sd-ov .acts button.on{background:#8a5a2a}
    #sd-ov form{display:flex;gap:6px;padding:8px 10px;background:#2a2118}
    #sd-ov input{flex:1;border:0;border-radius:10px;padding:10px;font-size:16px;background:#f4efe6;color:#1a120c}
    #sd-ov form button{background:#c4a574;color:#1a120c;border:0;border-radius:10px;padding:0 14px;min-height:44px}
    #sd-ov .dbg{display:flex;gap:6px;flex-wrap:wrap;padding:4px 10px;background:#120e0a}
    #sd-ov .dbg button{font-size:11px;background:#333;color:#ccc;border:0;border-radius:6px;padding:4px 6px}
  </style>
  <div class="top"><b class="ttl"></b><button type="button" class="end">結束</button></div>
  <div class="st"></div>
  <div class="mid"><div class="log"></div><div class="side"><div class="ph">立繪還沒好</div><img alt="" hidden><div class="who"></div><div class="dots"></div></div></div>
  <div class="acts"></div>
  <form><input maxlength="200" placeholder="說點什麼" enterkeyhint="send" autocomplete="off"><button type="submit">送出</button></form>
  <div class="dbg"><span style="font-size:11px;color:#887">測試</span>
    <button type="button" data-d="other">對方接受度+10</button>
    <button type="button" data-d="wife">老婆接受度+10</button>
    <button type="button" data-d="drunk">老婆醉+20</button>
    <button type="button" data-d="agree">兩人同意並換場</button></div>`;
  document.body.append(ov);
  const $ = (s) => ov.querySelector(s);
  let images = {}, scene = meet.phase || "bar", watching = false, rightNow = "husband", pairWho = "", typing = false, spread = false, ended = false, leaving = false;
  const backs = {};
  const backdrop = (sc) => backs[sc] || (backs[sc] = pickBackdrop(BG[sc] || "bar"));
  let logs = [], watchLogs = [], busy = false, wantReply = false;
  const name = { player: "你", wife: wife.name || "老婆", husband: couple.husband?.name || "對方丈夫", other: couple.wife?.name || "對方妻子" };
  const hotel = () => scene.startsWith("hotel");
  const stage2 = () => scene === "park" || scene === "ktv";

  const push = (who, text, box = logs) => { box.push({ who, text: String(text || "").slice(0, 180) }); };
  const sys = (text, box = logs) => push("sys", text, box);

  async function refreshImages() {
    try { const S = await api.state(); images = S.images || {}; } catch { /* 書籤還在生，先用名字 */ }
  }
  function urlOf(ch, ex) {
    const owner = ch === "wife" ? wife.id : couple.id;
    const bag = images[owner] || {};
    const chain = String(ex).startsWith("nude") ? [ex, "nude_shy", "nude_normal", "nude", "shy", "normal"] : [ex, "normal", "shy", "happy"];
    for (const k of chain) { const c = bag[`${ch}~${k}`]?.cut; if (c) return c; }
    return "";
  }
  function shown() {
    if (watching && pairWho) return pairWho;
    if (scene === "bar") return rightNow || "husband";
    return "other";
  }
  async function say(who, task, fallback) {
    try {
      if (who === "wife" && ctx.say) {
        const t = await ctx.say(wife, `（換妻約會，現在在${SZ[scene] || scene}。${task}用「（動作）台詞」只寫一句。）`, fallback);
        if (t) return String(t).slice(0, 140);
      } else if ((who === "husband" || who === "other") && ctx.chat) {
        const self = who === "husband" ? `你是${name.husband}（男），你的妻子是${name.other}` : `你是${name.other}（女），你的丈夫是${name.husband}`;
        const t = await ctx.chat(`${self}。這是跟另一對夫妻的換妻約會，現在在${SZ[scene] || scene}。玩家是另一位丈夫。用「（動作）台詞」只寫一句。`, task);
        if (t) return String(t).slice(0, 140);
      }
    } catch { /* 用句庫 */ }
    return fallback;
  }

  function renderLog() {
    const box = watching ? watchLogs : logs;
    const log = $(".log"), atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    log.innerHTML = box.map((m) => m.who === "sys"
      ? `<div class="b sys">${esc(m.text)}</div>`
      : `<div class="b ${m.who === "player" ? "player" : ""}"><div class="nm">${esc(name[m.who] || "")}</div>${esc(m.text)}</div>`).join("") || `<div class="b sys">${watching ? "他們下一動才會說話。" : "今晚剛開始。"}</div>`;
    if (atBottom) log.scrollTop = log.scrollHeight;
  }
  function renderSide() {
    const who = shown();
    const accept = who === "other" ? meet.accept.other : who === "wife" ? meet.accept.wife : 0;
    const ex = portraitExpr(who, { scene, act: sideAct, accept, mood: sideMood });
    const url = urlOf(who, ex);
    const img = $(".side img"), ph = $(".side .ph");
    if (url) { img.src = url; img.hidden = false; ph.hidden = true; } else { img.hidden = true; ph.hidden = false; ph.textContent = `${name[who] || ""}\n立繪還沒好`; }
    $(".who").textContent = name[who] || "";
    $(".dots").textContent = typing ? "正在輸入…" : "";
    $(".side").style.backgroundImage = `url(${backdrop(scene)})`;
  }
  let sideAct = "", sideMood = "";
  function renderStatus() {
    const a = meet.agreed || {};
    $(".ttl").textContent = SZ[scene] || scene;
    $(".st").textContent = `對方妻子 ${meet.accept.other}${a.other ? "・已同意" : ""}　你老婆 ${meet.accept.wife}${a.wife ? "・已同意" : ""}　醉 ${meet.drunk.other}/${meet.drunk.wife}　高潮 ${meet.orgasm.other}/${meet.orgasm.wife}　精液 ${meet.semen.other}/${meet.semen.wife}${watching ? "　正在看另一對" : ""}`;
  }
  function renderActs() {
    const box = $(".acts"); box.innerHTML = "";
    const add = (label, fn, on = false) => { const b = document.createElement("button"); b.type = "button"; b.textContent = label; if (on) b.className = "on"; b.addEventListener("click", fn); box.append(b); };
    if (stage2() || hotel()) add(watching ? "回到她身邊" : "看另一對", () => { watching = !watching; pairWho = watching ? "wife" : ""; if (!watching) { sideAct = ""; sideMood = ""; } render(); }, watching);
    if (watching || scene === "bar") return;
    if (stage2()) {
      for (const act of teaseList(scene)) add(TEASE_ZH[act], () => doTease(act));
      if (scene === "park") add("走走", () => doSoft("walk", "你們在公園走了一小段。"));
      if (scene === "ktv") { add("對唱", () => doSoft("duet", "你們唱了一首。")); add("喝酒", () => doDrink()); }
      if (meet.accept.other > HOTEL_AT) add("去旅館", () => proposeHotel());
    }
  }
  function render() { renderStatus(); renderLog(); renderSide(); renderActs(); }
  const esc = (s) => String(s || "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  function noteLock(who) {
    if (!lockIfReady(meet, who)) return;
    sys(`${name[who]}同意交換了。之後不會反悔。`);
    if (scene === "bar" && bothAgreed(meet)) void leaveBar();
  }
  async function leaveBar() {
    if (leaving || scene !== "bar") return;
    leaving = true;
    const next = husbandPickScene();
    push("husband", next === "ktv" ? "（站起來）兩位都點頭了。去包廂。" : "（看向門外）那去公園走走。");
    render();
    await sleep(1400);
    meet.swapped = true;
    await go(next);
    leaving = false;
  }
  async function go(next) {
    scene = next;
    logs = []; watchLogs = []; watching = false; sideAct = ""; sideMood = "";
    if (next === "park" || next === "ktv") sys(`到了${SZ[next]}。你跟${name.other}在一起，${name.wife}跟${name.husband}在另一邊。`);
    if (String(next).startsWith("hotel")) {
      sys("她把衣服脫了。想做什麼，直接說。");
      queuePortraits("hotel", wife, couple).then(() => refreshImages().then(render)).catch((e) => ctx.debug?.(`換妻旅館圖：${e.message || e}`));
    }
    render();
  }

  async function npcSay(who, task, fallback) {
    busy = true; typing = true; rightNow = who; sideMood = ""; renderSide();
    const text = await say(who, task, fallback);
    typing = false;
    const box = watching && (who === "wife" || who === "husband") && scene !== "bar" ? watchLogs : logs;
    push(who, text, box);
    if (scene === "bar") {
      const g = barChatGain(who);
      addAccept(meet, "wife", g.wife); addAccept(meet, "other", g.other);
      noteLock(who);
    }
    busy = false; render();
    if (wantReply && !leaving) { wantReply = false; const n = nextNpc(); void npcSay(n.who, n.task, n.fb); }
  }
  function nextNpc() {
    if (stage2() || hotel()) return { who: "other", task: "你現在跟玩家單獨在一起。他剛剛說了話。你的回應可以害羞、可以拒絕，但留在這裡。", fb: pick(FB.other) };
    const order = ["husband", "other", "wife"];
    const i = order.indexOf(rightNow);
    const who = order[(i + 1) % order.length];
    return { who, task: "輪到你在四個人的酒桌上說一句，自然一點。", fb: pick(FB[who] || FB.other) };
  }

  function sendText(text) {
    const t = String(text || "").trim(); if (!t || ended) return;
    if (watching) return;
    push("player", t);
    if (scene === "bar") {
      const g = barChatGain("player");
      addAccept(meet, "wife", g.wife); addAccept(meet, "other", g.other);
    } else if (stage2()) {
      const g = playerStageGain("chat");
      addAccept(meet, "other", g.accept);
    } else if (hotel()) {
      const p = parseHotelText(t);
      if (p.where) scene = p.where === "bath" ? "hotel_bath" : "hotel_room";
      if (p.kind === "sex") {
        const r = applyHotelAct(meet, "other", "sex");
        sideAct = "sex"; sideMood = r.orgasm ? "happy" : "shy"; spread = !spread; if (spread) sideMood = r.orgasm ? "spread" : sideMood;
        sys(r.orgasm ? `她高潮了。接受度 +5（現在 ${meet.accept.other}）。` : "她沒有高潮。");
        if (r.ejac) sys(`你射在她裡面。精液 ${meet.semen.other}。`);
      } else if (p.kind === "tease") {
        sideAct = p.act;
        if (!teaseOk(p.act, meet.accept.other)) { sideMood = "startled"; sys(`她閃開了。（${TEASE_ZH[p.act]}要超過 ${TEASE_AT[p.act]}，現在 ${meet.accept.other}）`); }
        else { sideMood = "shy"; sys(`${TEASE_ZH[p.act]}。她沒有推開。`); }
      } else if (p.kind === "leak") {
        const before = meet.semen.other;
        applyHotelAct(meet, "other", "leak");
        sideAct = "leak"; sideMood = "shy";
        sys(before > 0 ? `精液流出一些。還剩 ${meet.semen.other}。` : "她裡面現在沒有精液。");
      } else sideAct = "";
    }
    render();
    const n = nextNpc();
    if (busy) wantReply = true;
    else void npcSay(n.who, n.task, n.fb);
  }

  function doTease(act) {
    if (watching) return;
    sideAct = act;
    if (!teaseOk(act, meet.accept.other)) {
      sideMood = "startled";
      push("player", `（${TEASE_ZH[act]}）`);
      push("other", pick(FB.dodge));
      render(); return;
    }
    sideMood = "shy";
    push("player", `（${TEASE_ZH[act]}）`);
    push("other", pick(FB.allow));
    render();
  }
  function doSoft(kind, line) {
    const g = playerStageGain(kind);
    addAccept(meet, "other", g.accept);
    sys(`${line}${g.accept ? ` 接受度 +${g.accept}。` : " 這次沒有更靠近。"}`);
    render();
  }
  function doDrink() {
    const g = playerStageGain("drink");
    addAccept(meet, "other", g.accept); addDrunk(meet, "other", g.drunk);
    sys(g.ok && g.drunk ? `她喝了。醉度 +${g.drunk}${g.accept ? `，接受度 +${g.accept}` : "，接受度沒有加"}。` : "她搖頭，這杯沒喝。");
    render();
  }
  function doToast() {
    const who = shown();
    if (scene !== "bar" || !who || who === "player") return;
    const t = toastOf(who, who === "husband" ? 80 : meet.accept[who] || 0);
    if (who === "wife" || who === "other") addAccept(meet, who, t.accept);
    addDrunk(meet, who, t.drunk);
    sys(t.drank ? `${name[who]}喝了你敬的酒。${t.accept ? `接受度 +${t.accept}。` : ""}` : `${name[who]}沒有喝。`);
    render();
  }
  function proposeHotel() {
    if (meet.accept.other <= HOTEL_AT) return;
    push("player", "我們去旅館吧。");
    push("other", "……好。");
    render();
    setTimeout(() => { void go("hotel_room"); }, 700);
  }

  let pairBusy = false, beatN = 0;
  async function pairBeat() {
    if (pairBusy || ended || scene === "bar") return;
    pairBusy = true;
    const beat = hotel() ? hotelHusbandAct(meet) : husbandBeat(meet, scene);
    beatN += 1;
    if (watching) {
      if (beat.act === "sex") { spread = !spread; sideMood = spread ? "spread" : ""; }
      watchPenalty(meet);
      pairWho = "husband"; sideAct = beat.act; typing = true; render();
      const h = await say("husband", `你正在對${name.wife}做「${beat.act}」。寫一句你對她說的話或動作。`, pick(FB.watchH));
      typing = false; push("husband", h, watchLogs); render();
      pairWho = "wife"; typing = true; render();
      const w = await say("wife", `對方丈夫正在對你做「${beat.act}」。你不願意，但人還在。用抗拒、不得已的語氣寫一句。`, pick(FB.watchW));
      typing = false; push("wife", w, watchLogs);
      const bits = [];
      if (beat.accept) bits.push(`接受度 +${beat.accept}`);
      if (beat.drunk) bits.push(`醉度 +${beat.drunk}`);
      if (beat.setAccept) bits.push(`接受度到 ${beat.setAccept}`);
      if (beat.orgasm) bits.push("她高潮了，接受度 +5");
      if (beat.ejac) bits.push("他射在她裡面");
      if (beat.semen < 0) bits.push("精液流出一些");
      if (bits.length) sys(bits.join("，") + "。", watchLogs);
      sys(`你一直看著。她對你 −2（現在 ${meet.accept.other}）。`, watchLogs);
    }
    pairBusy = false; render();
  }

  $(".end").addEventListener("click", () => finish("結束"));
  $("form").addEventListener("submit", (e) => { e.preventDefault(); const input = $("input"); sendText(input.value); input.value = ""; });
  $("input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.isComposing && e.keyCode !== 229) { e.preventDefault(); $("form").requestSubmit(); }
  });
  let hold = 0;
  const side = $(".side");
  side.addEventListener("pointerdown", () => { if (scene !== "bar") return; hold = setTimeout(doToast, 520); });
  const holdEnd = () => clearTimeout(hold);
  side.addEventListener("pointerup", holdEnd); side.addEventListener("pointerleave", holdEnd);
  side.addEventListener("contextmenu", (e) => e.preventDefault());
  ov.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
    const d = b.dataset.d;
    if (d === "other") addAccept(meet, "other", 10);
    if (d === "wife") addAccept(meet, "wife", 10);
    if (d === "drunk") addDrunk(meet, "wife", 20);
    if (d === "agree") { meet.agreed.wife = true; meet.agreed.other = true; if (scene === "bar") void leaveBar(); }
    noteLock("wife"); noteLock("other"); render();
  }));

  const timer = setInterval(() => { if (!ended) void pairBeat(); }, 10000);
  const barTimer = setInterval(() => {
    if (ended || scene !== "bar" || busy || leaving) return;
    const n = nextNpc();
    void npcSay(n.who, n.task, n.fb);
  }, 9000);
  const imgTimer = setInterval(() => { if (!ended) void refreshImages().then(() => { if (!ended) renderSide(); }); }, 4000);
  function finish(why) {
    if (ended) return; ended = true;
    clearInterval(timer); clearInterval(barTimer); clearInterval(imgTimer);
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ at: Date.now(), why, wifeId: wife.id, coupleId: couple.id, semen: meet.semen, orgasm: meet.orgasm, accept: meet.accept }));
    } catch { /* */ }
    ctx.debug?.(`換妻結束（${why}）精液 她 ${meet.semen.wife}／對方 ${meet.semen.other}`);
    ov.remove();
  }
  void refreshImages().then(() => {
    render();
    sys(scene === "bar" ? "四個人在酒吧。聊天、長按右邊的人敬酒。兩位妻子超過 50 並開口之後就會同意。" : `${SZ[scene] || ""}。`);
    render();
    if (scene === "bar") void npcSay("husband", "你是東道主，先開口歡迎另一對夫妻。", pick(FB.husband));
    if (hotel()) queuePortraits("hotel", wife, couple).catch((e) => ctx.debug?.(`換妻旅館圖：${e.message || e}`));
  });
  return ov;
}
