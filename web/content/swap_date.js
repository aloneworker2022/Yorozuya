/* 換妻約會：左對話、右正在說的人、下面輸入。酒吧四人群聊；之後只剩你跟對方妻子。 */
import { api, pickBackdrop } from "./swap_cafe_gen.js?v=38";
import { queuePortraits } from "./swap_pregen.js?v=5";
import {
  addAccept, addDrunk, lockIfReady, bothAgreed, husbandPickScene, barChatGain, toastOf,
  teaseList, teaseOk, husbandBeat, watchPenalty, playerStageGain, hotelHusbandAct, applyHotelAct,
  parseHotelText, portraitExpr, TEASE_ZH, TEASE_AT, HOTEL_AT,
} from "./swap_meet_rules.js?v=2";
import { cachedUrl, genTeaseImage, jobsForAct } from "./swap_tease.js?v=13";
import { runHotelSex, createLocalAnim, POSE_ZH, STATE_ZH, STATE_STEP, sexImgCandidates, posesFor, rollAffDelta, swapAffStage, SENSE_RULE, SWAP_SEX_FB, DIRTY_TALK_RULE, DIRTY_TALK, isInitiative } from "./swap_chat_sex.js?v=8";
import { clinkFx, onLongPress } from "./swap_clink.js?v=1";
import { sexKey } from "./swap_tease_rules.js?v=11";
import { pairOwner, pairCut, startPairLoop, applyPairFrame } from "./swap_pair_gen.js?v=28";

/** pt310u #12：第二場景（KTV／公園）她跟對方丈夫的親密動作 → 雙人圖格子。 */
export const PAIR_SLOT_OF = { kiss: "kiss", oral: "fellatio", breast: "grope", breast_knead: "grope", breast_suck: "grope", nipple_lick: "grope", butt: "grope", waist: "grope", molest: "grope", labia: "cunni", labia_rub: "cunni", sex: "behind~2" };
/** pt310u #14：對方丈夫射完後不能做愛的秒數。 */
export const OH_SEX_CD_MS = 20000;
/** pt310u #11：她在第二場景的互動間隔（第一次不等）。 */
export const BEAT_MS = 10000;
/** pt310u #13：第三場景她做愛時的立繪（正面開腿／背面翹臀）、聊天時隨機半身裸體。 */
export const wifeHotelLook = (act, rng = Math.random) => act === "sex" ? (rng() < 0.5 ? "nude_spread" : "nude_prone") : act === "chat" ? (rng() < 0.5 ? "nude" : "nude_shy") : "";

/** pt310u #10：玩家這場要射幾次（3–5），射完做愛就結束。 */
export const rollEjacGoal = (rng = Math.random) => 3 + Math.floor(rng() * 3);
/** pt310u #9：每輪隨機體位（背後／正面／騎乘…）。 */
export const randPose = (poses, rng = Math.random, not = "") => { const p = poses.length > 1 ? poses.filter((x) => x !== not) : poses; return p[Math.floor(rng() * p.length)] || poses[0]; };
/** pt310u #6：調戲圖 左滑入 → 停 3 秒 → 右滑出。 */
export const TEASE_HOLD_MS = 3000;
const TEASE_GEN_WAIT_MS = 25000;


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
  // 2026-10-29 pt310u：背景滿版不被擠；輸入框在上面；人物下緣貼畫面下緣；對話紀錄疊在上方左側
  ov.innerHTML = `<style>
    #sd-ov{position:fixed;inset:0;z-index:8700;overflow:hidden;background:#1a120c;color:#f4efe6;font:16px/1.45 system-ui,"Noto Sans TC",sans-serif}
    #sd-ov button,#sd-ov input{font:inherit;box-shadow:none;text-shadow:none;letter-spacing:0}
    #sd-ov .bg{position:absolute;inset:0;background:center/cover no-repeat;z-index:0}
    #sd-ov .pbg{position:absolute;inset:0;z-index:0;display:flex;align-items:center;justify-content:center;pointer-events:none;background:rgba(0,0,0,.35)}
    #sd-ov .pbg[hidden]{display:none}
    #sd-ov .pbg>div{position:relative;height:88%;aspect-ratio:3/4}
    #sd-ov .pbg img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;opacity:.85}
    #sd-ov .pbg .pbl{position:absolute;left:8px;bottom:calc(8px + env(safe-area-inset-bottom));font-size:12px;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:8px}
    #sd-ov .fig{position:absolute;left:34%;right:0;bottom:0;top:14%;z-index:1;pointer-events:none}
    #sd-ov .ch{position:absolute;left:58%;bottom:0;height:100%;width:min(96%,560px);display:flex;flex-direction:column;align-items:center;justify-content:flex-end;transform:translateX(-50%);transition:transform .55s cubic-bezier(.22,.8,.3,1),opacity .55s ease;pointer-events:auto;cursor:pointer;-webkit-tap-highlight-color:transparent;-webkit-touch-callout:none;user-select:none;-webkit-user-select:none;touch-action:manipulation}
    #sd-ov .ch.from-l{transform:translateX(-50%) translateX(-110vw)}
    #sd-ov .ch.to-r{transform:translateX(-50%) translateX(110vw);opacity:0;pointer-events:none}
    #sd-ov .ch img{display:block;max-height:100%;max-width:100%;width:auto;object-fit:contain;object-position:bottom center;filter:drop-shadow(0 8px 18px rgba(0,0,0,.45))}
    #sd-ov .ch .ph{width:70%;aspect-ratio:3/4;border:1px dashed #6b5a45;border-radius:12px;display:flex;align-items:center;justify-content:center;color:#b7a88f;text-align:center;padding:8px;margin-bottom:12%;white-space:pre-line;background:rgba(0,0,0,.35)}
    #sd-ov .ch .who{position:absolute;bottom:calc(8px + env(safe-area-inset-bottom));font-size:13px;background:rgba(0,0,0,.5);padding:2px 8px;border-radius:8px}
    #sd-ov .ch.drink img{animation:sd-drink 1.4s ease-in-out}
    @keyframes sd-drink{0%,100%{transform:none}30%{transform:rotate(-4deg) translateY(-2%)}60%{transform:rotate(3deg)}}
    #sd-ov .cheers{position:absolute;left:50%;top:38%;z-index:6;font-size:54px;transform:translate(-50%,0) scale(.4);opacity:0;pointer-events:none;animation:sd-cheers 1.5s ease-out forwards;text-shadow:0 4px 10px #000}
    @keyframes sd-cheers{20%{opacity:1;transform:translate(-50%,-10px) scale(1.15)}70%{opacity:1;transform:translate(-50%,-30px) scale(1)}100%{opacity:0;transform:translate(-50%,-60px) scale(.9)}}
    #sd-ov .hud{position:absolute;left:0;top:0;bottom:0;width:min(40%,330px);z-index:3;display:flex;flex-direction:column;pointer-events:none;background:linear-gradient(90deg,rgba(20,14,10,.45),rgba(20,14,10,.12));padding-bottom:env(safe-area-inset-bottom)}
    #sd-ov .hud>*{pointer-events:auto}
    #sd-ov .top{display:flex;gap:8px;align-items:center;padding:calc(8px + env(safe-area-inset-top)) 10px 8px;background:rgba(42,33,24,.55);backdrop-filter:blur(6px)}
    #sd-ov .top b{flex:1;font-size:15px}
    #sd-ov .top button{background:rgba(58,46,34,.75);color:#f4efe6;border:0;border-radius:8px;padding:6px 10px}
    #sd-ov .st{font-size:12px;color:#d9c7a4;padding:4px 10px;background:rgba(36,25,16,.45)}
    #sd-ov form{display:flex;gap:6px;padding:8px 10px;background:rgba(42,33,24,.55);backdrop-filter:blur(6px)}
    #sd-ov input{flex:1;min-width:0;border:0;border-radius:10px;padding:10px;font-size:16px;background:rgba(244,239,230,.92);color:#1a120c}
    #sd-ov input:disabled{opacity:.6}
    #sd-ov form button{background:#c4a574;color:#1a120c;border:0;border-radius:10px;padding:0 14px;min-height:44px}
    #sd-ov form button:disabled{opacity:.5}
    #sd-ov .acts{display:flex;flex-wrap:wrap;gap:6px;padding:6px 10px;background:rgba(36,25,16,.4)}
    #sd-ov .acts:empty{display:none}
    #sd-ov .acts button{background:rgba(58,46,34,.8);color:#f4efe6;border:0;border-radius:999px;padding:8px 12px;min-height:40px}
    #sd-ov .acts button.on{background:#8a5a2a}
    #sd-ov .log{flex:1 1 auto;min-height:0;overflow:auto;padding:8px 10px;display:flex;flex-direction:column;gap:6px;max-width:100%;-webkit-mask-image:linear-gradient(transparent,#000 14px)}
    #sd-ov .b{max-width:100%;background:rgba(44,36,28,.62);border-radius:12px;padding:6px 10px;backdrop-filter:blur(4px);border:1px solid rgba(255,255,255,.08)}
    #sd-ov .b.player{background:rgba(36,92,56,.66)}
    #sd-ov .b .nm{font-size:11px;color:#d9c7a4;text-shadow:0 1px 2px #000}
    #sd-ov .b.sys{background:rgba(0,0,0,.35);color:#d8c9ae;font-size:12px;padding:2px 8px;border:0;backdrop-filter:none}
    #sd-ov .dots{height:14px;color:#ffe2a8;font-size:12px;padding:0 12px;text-shadow:0 1px 2px #000}
    #sd-ov .pv{position:absolute;left:50%;top:50%;z-index:7;width:min(78vw,460px);transform:translate(-50%,-50%) translateX(-120vw);transition:transform .5s cubic-bezier(.22,.8,.3,1);pointer-events:none;border-radius:14px;overflow:hidden;background:rgba(0,0,0,.55);box-shadow:0 12px 32px rgba(0,0,0,.6),0 0 0 1px rgba(255,79,216,.35)}
    #sd-ov .pv.in{transform:translate(-50%,-50%)}
    #sd-ov .pv.out{transform:translate(-50%,-50%) translateX(120vw)}
    #sd-ov .pv img{display:block;width:100%;height:auto;max-height:70vh;object-fit:contain}
    #sd-ov .pv .pvw{padding:40px 10px;text-align:center;color:#ddd}
    #sd-ov .pv .pvw:empty{display:none}
    #sd-ov .pv .pvl{position:absolute;left:8px;top:8px;font-size:12px;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:8px}
    #sd-ov .hud{transition:transform .45s ease}
    #sd-ov.sexing .hud{transform:translateY(-110%)}
    #sd-ov.sexing .fig{opacity:0;transition:opacity .3s}
    #sd-ov .sxline{position:absolute;left:10px;right:10px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:8;background:rgba(30,16,24,.78);border-radius:12px;padding:8px 12px;font-size:15px;display:none}
    #sd-ov.sexing .sxline{display:block}
    #sd-ov .sxline:empty{display:none}
    #sd-ov .sxbar{position:absolute;right:14px;bottom:calc(90px + env(safe-area-inset-bottom));z-index:9;display:none;flex-direction:column;align-items:flex-end;gap:10px}
    #sd-ov.sexing .sxbar{display:flex}
    #sd-ov .sxbar button{border:0;color:#fff;box-shadow:0 4px 14px rgba(0,0,0,.5)}
    #sd-ov .sxbar .th{width:76px;height:76px;border-radius:50%;background:#d23c78;font-weight:700;font-size:26px}
    #sd-ov .sxbar .ps{height:40px;border-radius:20px;padding:0 14px;background:#7a3cd2;font-size:14px}
    #sd-ov .sxbar .cnt{font-size:13px;background:rgba(0,0,0,.55);padding:2px 8px;border-radius:8px}
    #sd-ov .dbg{position:absolute;right:4px;bottom:calc(4px + env(safe-area-inset-bottom));z-index:4;display:flex;flex-direction:column;gap:4px;opacity:.75}
    #sd-ov .dbg button{font-size:11px;background:#333;color:#ccc;border:0;border-radius:6px;padding:4px 6px}
  </style>
  <div class="bg"></div>
  <div class="pbg" hidden><div><img class="pf1" alt=""><img class="pf2" alt=""></div><span class="pbl"></span></div>
  <div class="fig"></div>
  <div class="hud">
    <div class="top"><b class="ttl"></b><button type="button" class="end">結束</button></div>
    <div class="st"></div>
    <form><input maxlength="200" placeholder="說點什麼" enterkeyhint="send" autocomplete="off"><button type="submit">送出</button></form>
    <div class="acts"></div>
    <div class="dots"></div>
    <div class="log"></div>
  </div>
  <div class="pv" hidden><img alt=""><div class="pvw"></div><div class="pvl"></div></div>
  <div class="sxline"></div>
  <div class="sxbar"><span class="cnt"></span><button type="button" class="ps">換姿勢</button><button type="button" class="th">肏</button></div>
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
  let pairSlot = "", wifeLook = "", wifeLoc = "hotel_room", ohCdUntil = 0, nextBeatAt = Date.now() + BEAT_MS, stopPbg = null;
  const pairHave = () => images[pairOwner(wife, couple)] || {};
  function urlOf(ch, ex) {
    if ((ch === "wife" || ch === "husband") && watching && stage2() && pairSlot) { const u = pairCut(pairHave(), pairSlot) || pairCut(pairHave(), pairSlot.replace(/~2$/, "~1")); if (u) return u; }
    if (ch === "wife" && hotel() && wifeLook) ex = wifeLook;
    const owner = ch === "wife" ? wife.id : couple.id;
    const bag = images[owner] || {};
    // pt310u #17：旅館一律裸體立繪；沒有裸體圖寧可顯示「還沒好」也不退回穿衣服的
    if (hotel() && !String(ex).startsWith("nude")) ex = ch === "husband" ? "nude_ero" : /shy|startled/.test(ex) ? "nude_shy" : /happy/.test(ex) ? "nude_happy" : "nude_normal";
    const chain = hotel() ? [ex, "nude_shy", "nude_normal", "nude", "nude_happy", "nude_ero", "nude_ahe"]
      : String(ex).startsWith("nude") ? [ex, "nude_shy", "nude_normal", "nude", "shy", "normal"] : [ex, "normal", "shy", "happy"];
    for (const k of chain) { const c = bag[`${ch}~${k}`]?.cut; if (c) return c; }
    return "";
  }
  function shown() {
    if (watching && pairWho) return pairWho;
    if (scene === "bar") return rightNow || "husband";
    return "other";
  }
  // pt310u #16：每句都帶「誰在哪、跟誰、在做什麼」＋最近對話，免得她們亂講（例如 KTV 說老公在等她，其實他正跟玩家老婆在一起）
  let lastBeat = "";
  const BEAT_ZH = { chat: "聊天", kiss: "接吻", oral: "口交", sex: "做愛", bath: "一起洗澡", leak: "做完在休息", breast: "摸胸", butt: "摸屁股", waist: "摟腰", labia: "摸下面", molest: "毛手毛腳", drink: "喝酒", duet: "唱歌" };
  function sceneCtx(who) {
    const here = SZ[scene] || scene, act = lastBeat ? `（剛剛在${BEAT_ZH[lastBeat] || lastBeat}）` : "";
    if (scene === "bar") return `現在四個人（${name.husband}和妻子${name.other}、玩家和妻子${name.wife}）一起坐在${here}同一桌喝酒聊天，還沒交換。`;
    const where = hotel() ? (wifeLoc === scene ? `同一個${here}（就在玩家旁邊）` : "隔壁另一處") : `${here}的另一邊（另一個包廂／另一段步道）`;
    const base = `已經交換伴侶了：玩家正跟${name.other}單獨在${here}；${name.wife}（玩家的妻子）正跟${name.husband}（${name.other}的丈夫）在${where}${act}。`;
    if (who === "other") return `${base}你的丈夫${name.husband}此刻正在陪玩家的妻子${name.wife}，不是在等你，也不在你身邊；你身邊的人是玩家。`;
    if (who === "wife") return `${base}你的丈夫（玩家）此刻正在陪${name.other}；你身邊的人是${name.husband}。`;
    if (who === "husband") return `${base}你身邊的人是${name.wife}；你的妻子${name.other}正在陪玩家。`;
    return base;
  }
  const histTxt = (box = logs) => box.filter((m) => m.who !== "sys").slice(-8).map((m) => `${m.who === "player" ? "玩家" : name[m.who]}：${m.text}`).join("\n");
  async function say(who, task, fallback) {
    const ctxTxt = `${sceneCtx(who)}${(meet.drunk?.[who] || 0) >= 60 ? "你已經喝醉了。" : ""}`;
    const box = watching && (who === "wife" || who === "husband") && scene !== "bar" ? watchLogs : logs;
    const hist = histTxt(box), histPart = hist ? `最近的對話：\n${hist}\n` : "";
    try {
      if (who === "wife" && ctx.say) {
        const t = await ctx.say(wife, `（換妻約會，現在在${SZ[scene] || scene}。${ctxTxt}${histPart}${task}用「（動作）台詞」只寫一句，不要替別人說話。）`, fallback);
        if (t) return String(t).slice(0, 140);
      } else if ((who === "husband" || who === "other") && ctx.chat) {
        const self = who === "husband" ? `你是${name.husband}（男），你的妻子是${name.other}` : `你是${name.other}（女），你的丈夫是${name.husband}`;
        const t = await ctx.chat(`${self}。這是跟另一對夫妻的換妻約會，現在在${SZ[scene] || scene}。玩家是另一位丈夫，他的妻子是${name.wife}。${ctxTxt}用「（動作）台詞」只寫你自己的一句，不要替別人說話、不要旁白。`, `${histPart}${task}`);
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
  // pt310u #2：換人＝新的人從左邊滑進來、原本的人從中間往右滑出
  let figWho = "", figNode = null;
  function figFill(node, who, url) {
    node.dataset.url = url || "";
    node.innerHTML = url ? `<img alt="" src="${esc(url)}"><div class="who">${esc(name[who] || "")}</div>`
      : `<div class="ph">${esc(name[who] || "")}\n立繪還沒好</div><div class="who">${esc(name[who] || "")}</div>`;
  }
  function renderSide() {
    const who = shown();
    const accept = who === "other" ? meet.accept.other : who === "wife" ? meet.accept.wife : 0;
    const ex = portraitExpr(who, { scene, act: sideAct, accept, mood: sideMood });
    const url = urlOf(who, ex);
    const fig = $(".fig");
    if (who !== figWho || !figNode) {
      const old = figNode;
      if (old) { old.classList.add("to-r"); setTimeout(() => old.remove(), 600); }
      const n = document.createElement("div"); n.className = "ch from-l"; n.dataset.who = who; figFill(n, who, url);
      fig.append(n); void n.offsetWidth; n.classList.remove("from-l");
      figNode = n; figWho = who;
    } else if ((figNode.dataset.url || "") !== (url || "")) figFill(figNode, who, url);
    $(".dots").textContent = typing ? `${name[rightNow] || ""}正在輸入…` : "";
    $(".bg").style.backgroundImage = `url(${backdrop(scene)})`;
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
      if (scene === "ktv") { add("對唱", () => doSoft("duet", "你們唱了一首。")); add("敬酒", () => doToast()); }
      if (meet.accept.other > HOTEL_AT) add("去旅館", () => proposeHotel());
    }
    if (hotel() && !sexing) {   // pt310u #7 #8：旅館＝摸奶／摸臀／摸陰唇（動作圖）＋做愛（正式版脫光後那套）
      for (const act of ["breast", "butt", "labia"]) add(TEASE_ZH[act], () => void hotelTouch(act));
      if (!sexDone) add("做愛", () => void playSex());
      else add("（今晚射完了）", () => {});
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
    logs = []; watchLogs = []; watching = false; sideAct = ""; sideMood = ""; pairSlot = ""; wifeLook = "";
    nextBeatAt = next === "park" || next === "ktv" ? 0 : Date.now() + BEAT_MS;   // pt310u #11：一進第二場景先互動一次，之後才讀秒
    if (next === "park" || next === "ktv") sys(`到了${SZ[next]}。你跟${name.other}在一起，${name.wife}跟${name.husband}在另一邊。`);
    if (String(next).startsWith("hotel")) {
      sys("她把衣服脫了。想做什麼，直接說。");
      queuePortraits("hotel", wife, couple).then(() => refreshImages().then(render)).catch((e) => ctx.debug?.(`換妻旅館圖：${e.message || e}`));
    }
    render();
  }

  // pt310u #4：酒吧＝玩家說一句算一回合；三個人依序回，每句都等打字＋讀完才換下一個，不再自己一直刷
  const readMs = (t) => Math.min(5200, Math.max(1600, String(t || "").length * 90));
  function lockInput(on) { on = on || flashing || sexing; const i = $("input"), b = $("form button"); i.disabled = on; b.disabled = on; i.placeholder = on ? "等大家說完…" : "說點什麼"; }
  async function npcSay(who, task, fallback) {
    typing = true; rightNow = who; sideMood = ""; renderSide();
    const text = await say(who, task, fallback);
    typing = false;
    if (ended) return text;
    const box = watching && (who === "wife" || who === "husband") && scene !== "bar" ? watchLogs : logs;
    push(who, text, box);
    if (scene === "bar") {
      const g = barChatGain(who);
      addAccept(meet, "wife", g.wife); addAccept(meet, "other", g.other);
      noteLock(who);
    }
    render();
    await sleep(readMs(text));   // 讓玩家看完這句
    return text;
  }
  async function npcRound(first) {
    if (busy || ended) return;
    busy = true; lockInput(true);
    try {
      if (scene === "bar") {
        const order = ["husband", "other", "wife"];
        const ks = first ? [first, ...order.filter((k) => k !== first)] : order;
        for (const who of ks) {
          if (ended || leaving || scene !== "bar") break;
          await npcSay(who, who === ks[0] ? "玩家剛剛說了話，回應他一句。" : "接著前面大家說的，在四個人的酒桌上自然地說一句（可以回玩家，也可以回剛剛說話的人）。", pick(FB[who] || FB.other));
        }
      } else {
        const n = nextNpc();
        await npcSay(n.who, n.task, n.fb);
      }
    } finally { busy = false; if (!ended) { lockInput(false); render(); } }
  }
  function nextNpc() {
    return { who: "other", task: "你現在跟玩家單獨在一起。他剛剛說了話。你的回應可以害羞、可以拒絕，但留在這裡。", fb: pick(FB.other) };
  }

  function sendText(text) {
    const t = String(text || "").trim(); if (!t || ended) return;
    if (watching || busy || flashing || sexing) return;
    if (hotel()) { const p0 = parseHotelText(t); if (p0.kind === "sex" && !sexDone) { push("player", t); render(); void playSex(); return; } if (p0.kind === "tease" && p0.act !== "waist") { push("player", t); render(); void hotelTouch(p0.act); return; } }
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
    const first = scene === "bar" ? (["husband", "other", "wife"].find((k) => t.includes(name[k])) || "") : "";
    void npcRound(first);
  }

  function doTease(act) {
    if (watching || flashing || busy) return;
    sideAct = act;
    if (!teaseOk(act, meet.accept.other)) {
      sideMood = "startled";
      push("player", `（${TEASE_ZH[act]}）`);
      push("other", pick(FB.dodge));
      render(); return;
    }
    sideMood = "shy";
    push("player", `（${TEASE_ZH[act]}）`);
    render();
    void teaseFlash(act).then(() => { if (!ended) { push("other", pick(FB.allow)); render(); } });
  }
  // ---- pt310u #6：猥褻動作圖：左邊滑入 → 停 3 秒 → 右邊滑出；滑出前不能再輸入／互動
  let flashing = false, sexing = false, sexDone = false;
  const pv = $(".pv"), pvImg = $(".pv img"), pvW = $(".pv .pvw"), pvL = $(".pv .pvl");
  let pvTok = 0;
  const S0 = () => ({ images });
  const setImgs = (imgs) => { if (imgs) images = imgs; };
  const pvIn = () => { if (!pv.hidden && pv.classList.contains("in")) return; pv.classList.remove("in", "out"); pv.hidden = false; void pv.offsetWidth; pv.classList.add("in"); };
  const pvOut = async () => { if (pv.hidden) return; pv.classList.remove("in"); pv.classList.add("out"); await sleep(520); if (!pv.classList.contains("in")) { pv.hidden = true; pv.classList.remove("out"); } };
  /** 放一張動作圖（有快取直接用；沒有就現產，最多等 maxWait）。回有沒有圖。 */
  async function pvShow(job, label, tok, maxWait = TEASE_GEN_WAIT_MS) {
    let u = cachedUrl(S0(), couple, job.key);
    pvIn(); pvL.textContent = label;
    if (!u) {
      pvImg.removeAttribute("src"); pvW.textContent = "生圖中…";
      try { const g = genTeaseImage(couple, job, { debug: (m) => ctx.debug?.(m) }); const imgs = await Promise.race([g, sleep(maxWait).then(() => null)]); setImgs(imgs); u = cachedUrl(S0(), couple, job.key); }
      catch (e) { ctx.debug?.(`動作圖 ${job.key} 失敗：${e?.message || e}`); }
    }
    if (tok !== pvTok || ended) return false;
    pvW.textContent = u ? "" : "（沒有圖）"; if (u) pvImg.src = u; else pvImg.removeAttribute("src");
    return !!u;
  }
  async function teaseFlash(act) {
    if (flashing || ended) return;
    const jobs = jobsForAct(act, scene, hotel() ? 2 : 0);
    if (!jobs.length) return;
    flashing = true; lockInput(true); renderActs();
    const tok = ++pvTok;
    try {
      await pvShow(jobs[0], TEASE_ZH[act] || act, tok);
      await sleep(TEASE_HOLD_MS);
      await pvOut();
    } finally { flashing = false; if (!ended) { lockInput(busy); render(); } }
  }
  async function hotelTouch(act) {
    if (flashing || sexing || busy || ended) return;
    sideAct = act; sideMood = "shy";
    push("player", `（${TEASE_ZH[act]}）`); render();
    await teaseFlash(act);
    if (ended) return;
    const t = await say("other", `玩家正在旅館對你「${TEASE_ZH[act]}」，你全裸、已經同意了。用第一人稱對玩家說一句此刻身體的反應。${SENSE_RULE}`, pick(FB.allow));
    push("other", t); render();
  }
  // ---- pt310u #7 #9 #10：旅館玩家做愛＝正式版「脫光後做愛」那套（runHotelSex：準備→頂住→「肏」＋局部動圖＋POV 步驟圖）
  //   對話框移出；每輪隨機體位；射精次數 3–5（不受原本一次就 CD 的限制），射完做愛結束。
  async function playSex() {
    if (sexing || sexDone || flashing || busy || ended || !hotel()) return;
    sexing = true; ov.classList.add("sexing"); lockInput(true); renderActs();
    const goal = rollEjacGoal(), poses = posesFor(scene), girl = couple.wife || {};
    const thB = $(".sxbar .th"), psB = $(".sxbar .ps"), cnt = $(".sxbar .cnt"), sxl = $(".sxline");
    let animPose = "missionary", showSeq = 0, pressRes = null, ejacs = 0, pose = randPose(poses);
    const anim = createLocalAnim(ov, () => ({ pose: animPose, girl }));
    const tok = ++pvTok;
    const showSex = async (ps, state) => {
      const my = ++showSeq; psB.textContent = `換姿勢（${POSE_ZH[ps]}）`;
      const hit = sexImgCandidates(ps, state).find((k) => cachedUrl(S0(), couple, k));
      const gp = ps === "cowgirl" ? "missionary" : ps, step = STATE_STEP[state];
      const job = hit ? { kind: "sex", pose: ps, step, key: hit } : { kind: "sex", pose: gp, step, key: sexKey(gp, step) };
      if (my !== showSeq) return;
      await pvShow(job, `做愛・${POSE_ZH[ps]}・${STATE_ZH[state]}`, tok, 360000);
    };
    const setCnt = () => { cnt.textContent = `射 ${ejacs}/${goal}`; };
    thB.onclick = () => { const r = pressRes; pressRes = null; r?.("thrust"); };
    psB.onclick = () => { const r = pressRes; pressRes = null; r?.("pose"); };
    sxl.textContent = ""; setCnt();
    try {
      while (ejacs < goal && !ended) {
        let presses = 0;
        const r = await runHotelSex({
          showState: (ps, state) => { void showSex(ps, state); },
          anim: (ap) => { animPose = ap; anim.play().catch(() => {}); },
          waitPress: () => new Promise((res, rej) => {
            if (ended) return rej(new Error("ended"));
            if (presses > 2 && Math.random() < 0.12) return res("pose");   // #9：做到一半隨機換體位
            pressRes = (a) => { if (a === "thrust") presses++; res(a); };
            const iv = setInterval(() => { if (ended) { clearInterval(iv); rej(new Error("ended")); } else if (!pressRes) clearInterval(iv); }, 500);
          }),
          line: async (x) => {
            const ev = { tip: "陰莖頂在你的入口、還沒進去", thrust: "他正在肏你", climax: "你剛剛高潮了（全身痙攣、腿發抖）", ejac: "他在你裡面射了（內射）", both: "你們一起高潮、他射在你裡面" }[x.event] || "他正在肏你";
            const fb = SWAP_SEX_FB[x.event === "tip" ? 1 : x.event === "climax" || x.event === "both" ? 5 : x.event === "ejac" ? 4 : 2];
            const ini = isInitiative(x.event);
            const t = await say("other", `你全裸正在跟玩家在旅館做愛，體位：${POSE_ZH[x.pose]}；${ev}${x.climaxes ? `（你這輪已經高潮 ${x.climaxes} 次）` : ""}${ejacs ? `（他今晚已經射了 ${ejacs} 次）` : ""}。用第一人稱對正在肏你的玩家說一句${ini ? "主動的色話" : "反應"}。${ini ? DIRTY_TALK_RULE : "不要寫你伸手撫摸的動作。"}${SENSE_RULE}`, pick(ini ? DIRTY_TALK : fb));
            if (ended) return;
            push("other", t); sxl.textContent = `${name.other}：${t}`;
          },
          portrait: () => {},
          aff: () => { const d = rollAffDelta(3, swapAffStage(meet.accept.other)); if (d) addAccept(meet, "other", d); },
          onClimax: (st) => { meet.orgasm.other = (meet.orgasm.other || 0) + 1; sys(`${name.other}高潮了（${st.climaxes}）。`); },
          onEjac: () => { ejacs++; meet.semen.other = (meet.semen.other || 0) + 1; setCnt(); sys(`你射在她裡面（${ejacs}/${goal}）。`); },
        }, { pose, poses });
        ctx.debug?.(`換妻旅館做愛：肏 ${r.thrusts} 下、她高潮 ${r.climaxes}、射 ${ejacs}/${goal}`);
        if (ejacs < goal && !ended) { pose = randPose(poses, Math.random, r.pose); await sleep(1600); }
      }
      if (!ended) { sexDone = true; sys(`射了 ${ejacs} 次，做完了。`); await sleep(1800); }
    } catch { /* 結束約會 */ } finally {
      anim.stop(); anim.el.remove(); pvTok++; await pvOut().catch(() => {});
      sexing = false; ov.classList.remove("sexing"); sxl.textContent = "";
      if (!ended) { sideAct = "leak"; sideMood = "shy"; lockInput(busy); render(); }
    }
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
  // pt310u #3：酒吧／KTV 點人物＝敬酒：乾杯特效＋她仰頭喝
  function doToast() {
    const who = shown();
    if ((scene !== "bar" && scene !== "ktv") || !who || who === "player") return;
    const t = scene === "bar" ? toastOf(who, who === "husband" ? 80 : meet.accept[who] || 0) : (() => { const g = playerStageGain("drink"); return { drank: g.ok, accept: g.accept, drunk: g.drunk }; })();
    clinkFx(ov, !!t.drank);
    if (t.drank && figNode) { figNode.classList.remove("drink"); void figNode.offsetWidth; figNode.classList.add("drink"); }
    if ((who === "wife" || who === "other") && t.accept) addAccept(meet, who, t.accept);
    if (t.drunk) addDrunk(meet, who, t.drunk);
    push("player", "（舉杯）乾杯！");
    sys(t.drank ? `${name[who]}跟你碰杯，一口喝掉。醉度 ${meet.drunk[who] ?? ""}${t.accept ? `，接受度 +${t.accept}` : ""}。` : `${name[who]}笑著搖頭，這杯沒喝。`);
    if (scene === "bar") noteLock(who);
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
    let beat = hotel() ? hotelHusbandAct(meet) : husbandBeat(meet, scene);
    // pt310u #14：他射完 20 秒內不能做愛，改口交／聊天／摸奶
    if (hotel() && beat.act === "sex" && Date.now() < ohCdUntil) {
      if (beat.orgasm) { meet.accept.wife -= beat.accept; meet.orgasm.wife -= 1; }
      if (beat.ejac) meet.semen.wife -= 1;
      beat = applyHotelAct(meet, "wife", pick(["oral", "chat", "breast"]));
    }
    if (hotel() && beat.ejac && (beat.act === "sex" || beat.act === "oral")) ohCdUntil = Date.now() + OH_SEX_CD_MS;
    if (hotel()) { if (beat.act === "bath") wifeLoc = "hotel_bath"; else if (beat.act === "sex") wifeLoc = "hotel_room"; wifeLook = wifeHotelLook(beat.act); }
    pairSlot = stage2() ? PAIR_SLOT_OF[beat.act] || "" : "";
    beatN += 1; lastBeat = beat.act || "";
    syncPairBg(beat.act);
    if (watching) {
      if (beat.act === "sex") { spread = wifeLook ? wifeLook === "nude_spread" : !spread; sideMood = spread ? "spread" : ""; }
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
      if (beat.ejac) bits.push(hotel() ? `他射在她裡面（${OH_SEX_CD_MS / 1000} 秒內不能再做愛）` : "他射在她裡面");
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
  // pt312u：按住人物 0.5 秒＝敬酒（短按不喝）
  onLongPress($(".fig"), (t) => (!watching && (scene === "bar" || scene === "ktv") ? t.closest?.(".ch") : null), () => doToast());
  $(".fig").addEventListener("contextmenu", (e) => e.preventDefault());
  ov.querySelectorAll("[data-d]").forEach((b) => b.addEventListener("click", () => {
    const d = b.dataset.d;
    if (d === "other") addAccept(meet, "other", 10);
    if (d === "wife") addAccept(meet, "wife", 10);
    if (d === "drunk") addDrunk(meet, "wife", 20);
    if (d === "agree") { meet.agreed.wife = true; meet.agreed.other = true; if (scene === "bar") void leaveBar(); }
    noteLock("wife"); noteLock("other"); render();
  }));

  // pt310u #15：第三場景她在跟他做愛、地點跟你同一處 → 對話框背景播他們做愛的動圖
  function syncPairBg(act) {
    const box = $(".pbg"), on = hotel() && act === "sex" && wifeLoc === scene;
    stopPbg?.(); stopPbg = null;
    if (!on) { box.hidden = true; return; }
    const have = pairHave(), slot = pick(["behind", "normal", "prone", "seated"].filter((k) => pairCut(have, `${k}~1`)) ) || "";
    const u1 = slot ? pairCut(have, `${slot}~1`) : "", u2 = slot ? pairCut(have, `${slot}~2`) : "";
    if (!u1) { box.hidden = true; return; }
    box.querySelector(".pf1").src = u1; box.querySelector(".pf2").src = u2 || u1;
    box.querySelector(".pbl").textContent = `${name.wife} × ${name.husband}（就在你旁邊）`;
    box.hidden = false;
    stopPbg = startPairLoop((f2) => applyPairFrame(box, f2));
  }
  const timer = setInterval(() => { if (!ended && Date.now() >= nextBeatAt) { nextBeatAt = Date.now() + BEAT_MS; void pairBeat(); } }, 500);
  const imgTimer = setInterval(() => { if (!ended) void refreshImages().then(() => { if (!ended) renderSide(); }); }, 4000);
  function finish(why) {
    if (ended) return; ended = true;
    clearInterval(timer); clearInterval(imgTimer); stopPbg?.();
    try {
      localStorage.setItem(LAST_KEY, JSON.stringify({ at: Date.now(), why, wifeId: wife.id, coupleId: couple.id, semen: meet.semen, orgasm: meet.orgasm, accept: meet.accept }));
    } catch { /* */ }
    ctx.debug?.(`換妻結束（${why}）精液 她 ${meet.semen.wife}／對方 ${meet.semen.other}`);
    ov.remove();
  }
  void refreshImages().then(() => {
    render();
    sys(scene === "bar" ? "四個人在酒吧。你說一句，大家輪流回。按住人物可以敬酒。兩位妻子超過 50 並開口之後就會同意。" : `${SZ[scene] || ""}。`);
    render();
    if (scene === "bar") { busy = true; lockInput(true); void npcSay("husband", "你是東道主，先開口歡迎另一對夫妻。", pick(FB.husband)).finally(() => { busy = false; if (!ended) lockInput(false); }); }
    if (hotel()) queuePortraits("hotel", wife, couple).catch((e) => ctx.debug?.(`換妻旅館圖：${e.message || e}`));
  });
  return ov;
}
