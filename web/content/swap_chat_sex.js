/* 2026-10-26 pt261u：換妻旅館裡「玩家自己做愛」＝房間聊天那套劇本做愛（ScriptMode sex 劇本）。
 * 流程跟 app.js 的 beginScriptScene／rollSexThrust 一樣：場景1 開場（旁白→她回一句）→ 場景2 正戲（「肏」鈕）
 * → 每次肏骰 rollSexThrust：換圖／新 AI／進投入（場景3）／玩家高潮（場景4）／雙方高潮（場景5）→ 結束。
 * 圖用換妻的 sex~<姿勢>~open|join|thrust（同一套快取，沒有就現產）；你老婆×對方丈夫的雙人圖不動。 */
import { pickPack, normalizeData, fillBinds, narrLines, rollSexThrust, rollAffDelta, SCENE_ZH } from "./script_mode.js";

// ---- 2026-10-26 pt282u：局部動圖改對齊「房間脫光後做愛」那套（test_room_summon loadThrustFrames／playThrustAnim＋sex_thrust）：
// 候選＝她的 sexAnim[pose] → 她任一 ≥2 幀的 sexAnim → 同體位幀包 → 任一幀包；pose 由場景決定（sexPoseFor(scene)），不吃 ScriptMode 劇本的 pose。
// 首輪 1–4（FIRST_HOLDS），之後整段做愛都 2–4（CONTINUE_HOLDS）；最後一幀一出現就算播完，停 ANIM_LINGER_MS 才收，期間再按直接接下一輪（不閃）。
import { THRUST, animFramesFor } from "./sex_thrust.js?v=8";
export const FIRST_HOLDS = THRUST.FIRST_HOLDS;
export const CONTINUE_HOLDS = THRUST.CONTINUE_HOLDS;
let FRAME_PACKS = null;
export async function loadFramePacks() {
  if (FRAME_PACKS) return FRAME_PACKS;
  const get = async (u) => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };
  const arr = (j) => (Array.isArray(j?.packs) ? j.packs : Array.isArray(j) ? j : []).filter((p) => p && p.id);
  let packs = arr(await get("/api/frame-packs?ts=" + Date.now()));
  if (!packs.length) packs = arr(await get("/assets/frame_packs/index.json?ts=" + Date.now()));
  FRAME_PACKS = packs; return packs;
}
/** 同房間 loadThrustFrames（girl＝對方妻子本人；沒有 sexAnim 就落幀包，不拿玩家老婆的頂替）。回 { urls, source }。 */
export function thrustFrameUrls({ pose = "missionary", girl, framePacks = [] } = {}) {
  const pick = (u) => (Array.isArray(u) ? u : []).map((x) => String(x || "").trim()).filter(Boolean);
  const sa = girl?.sexAnim || null;
  if (pick(sa?.[pose]?.urls).length) return { urls: pick(sa[pose].urls).slice(0, 4), source: `sexAnim:${pose}` };
  if (sa) for (const [k, r] of Object.entries(sa)) if (pick(r?.urls).length >= 2) return { urls: pick(r.urls).slice(0, 4), source: `sexAnim:${k}` };
  const urlsOf = (p) => [1, 2, 3, 4].map((i) => String(p?.frames?.[String(i)]?.url || "")).filter(Boolean);
  const same = framePacks.find((p) => p && p.pose === pose && urlsOf(p).length);
  if (same) return { urls: urlsOf(same), source: `幀包:${same.name || same.id}（${pose}）` };
  const any = framePacks.find((p) => urlsOf(p).length >= 2) || framePacks.find((p) => urlsOf(p).length);
  if (any) return { urls: urlsOf(any), source: `幀包:${any.name || any.id}（借 ${any.pose || "?"}）` };
  return { urls: [], source: "" };
}
/** 這一下要播哪幾幀＋每幀停多久（同 sex_thrust.animFramesFor）。 */
export function animPlan(urls, firstRoundDone) {
  const { frames, holds } = animFramesFor(urls, firstRoundDone);
  return frames.map((u, i) => [u, holds[i]]);
}
const preloadMap = new Map();
function preload(urls) {
  return Promise.all((urls || []).map((u) => {
    if (!preloadMap.has(u)) { const im = new Image(); preloadMap.set(u, new Promise((ok) => { im.onload = () => (im.decode ? im.decode().catch(() => {}).then(ok) : ok()); im.onerror = () => ok(); im.src = u; })); }
    return preloadMap.get(u);
  }));
}
/** 局部動圖彈層（同房間 #sex-anim-popup 樣式）。getCtx() → { pose, girl }。play() 在最後一幀出現時 resolve（「肏」此時才回來）。 */
export function createLocalAnim(root, getCtx, opts = {}) {
  const el = document.createElement("div");
  el.className = "swp-sexanim"; el.hidden = true;
  // pt315u #1：opts.low（旅館）→ 局部動圖往下、縮小、不透明度 .7
  const L = opts.low ? { box: "padding-bottom:calc(24px + env(safe-area-inset-bottom));align-items:flex-end", w: "min(52vw,320px)", h: "min(30vh,320px)", op: ".7" } : { box: "padding-top:18vh;align-items:center", w: "min(72vw,480px)", h: "min(48vh,520px)", op: ".4" };
  el.style.cssText = `position:absolute;inset:0;z-index:28;display:flex;justify-content:center;${L.box};pointer-events:none`;
  el.innerHTML = `<div style="max-width:${L.w};max-height:${L.h};border-radius:12px;overflow:hidden;background:rgba(0,0,0,.4);opacity:${L.op};box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 0 1px rgba(255,79,216,.35)"><img alt="" style="display:block;width:100%;height:auto;max-height:${L.h};object-fit:contain"></div>`;
  root.append(el);
  const img = el.querySelector("img");
  let run = 0, firstDone = false, lingerT = 0;
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  const show = (u) => new Promise((ok) => { let f = false; const d = () => { if (!f) { f = true; ok(); } }; img.onload = d; img.onerror = d; img.src = u; if (img.complete && img.naturalWidth) queueMicrotask(d); setTimeout(d, THRUST.ANIM_PRELOAD_MAX_MS); });
  return {
    el, source: "",
    async play() {
      const my = ++run;
      clearTimeout(lingerT); lingerT = 0;
      const ctx = getCtx() || {};
      const fr = thrustFrameUrls({ ...ctx, framePacks: await loadFramePacks() });
      this.source = fr.source || "（沒有幀）";
      const plan = animPlan(fr.urls, firstDone);
      if (my !== run) return 0;
      if (!plan.length) { firstDone = true; return 0; }
      await Promise.race([preload(plan.map((x) => x[0])), wait(THRUST.ANIM_PRELOAD_MAX_MS)]);
      if (my !== run) return 0;
      el.hidden = false;
      for (let i = 0; i < plan.length; i++) {
        await show(plan[i][0]);
        if (my !== run) return i;
        if (i < plan.length - 1) { await wait(plan[i][1]); if (my !== run) return i + 1; }
      }
      firstDone = true;
      lingerT = setTimeout(() => { if (my === run) el.hidden = true; }, THRUST.ANIM_LINGER_MS);
      return plan.length;
    },
    stop() { run++; clearTimeout(lingerT); firstDone = false; el.hidden = true; img.removeAttribute("src"); },
  };
}

let PACKS = null;
export async function loadSexPack() {
  if (!PACKS) {
    const get = async (u) => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };
    PACKS = normalizeData((await get("/api/script-packs?ts=" + Date.now())) || (await get("content/script_packs.json?ts=" + Date.now())) || {});
  }
  return pickPack(PACKS, "sex");
}

/** 每個場景用哪一步的圖（open＝張開腿、join＝插入、thrust＝抽插）。 */
export const SCENE_STEP = { 1: "open", 2: "join", 3: "thrust", 4: "thrust", 5: "thrust" };
/** rollSexThrust 的結果 → 下一個場景（0＝留在原場景）。 */
export function nextSceneOf(scene, act) {
  if (act === "scene3") return 3;
  if (act === "player") return 4;
  if (act === "both") return 5;
  return 0;
}
export const MAX_THRUST = 40;   // 保險：骰太久就當玩家高潮

/**
 * io：{ girl（她的人設，給 [name] 綁定）, narrate(text), reply(attitude, narr) → 她說完一句, showStep(step), thrustAnim(), waitThrust() → Promise, roll?,
 *       waitTap?(label)（場景1：旁白→點→她回→揭圖→點「開始」才進正戲，跟房間 wait_ai／wait_go 一樣）, localAnim?(scene)（每下肏播局部動圖，跟擲骰並行）,
 *       aff?(delta)（每下肏 rollAffDelta(scene, stage) 的好感，同房間）, stage?, affRoll? }
 * 回 { climax: "player"|"both", thrusts }。
 */
export async function runChatSex(io, pack) {
  const roll = io.roll || rollSexThrust;
  const sc = (n) => pack?.scenes?.[String(n)] || {};
  const play = async (n) => {
    await io.showStep?.(SCENE_STEP[n], SCENE_ZH[n]);
    const lines = narrLines(sc(n));
    for (const t of (lines.length ? lines : ["……"])) { const nar = fillBinds(t, io.girl, "你"); await io.narrate(nar); await io.reply(sc(n).attitude || "", nar, n); }
  };
  const affRoll = io.affRoll || rollAffDelta;
  const stageNow = () => (typeof io.stage === "function" ? io.stage() : io.stage) || "stranger";
  // 場景1：旁白 → （點）她回一句 → 揭圖 → （點）進正戲
  await io.showStep?.(SCENE_STEP[1], SCENE_ZH[1]);
  const l1 = narrLines(sc(1));
  for (const t of (l1.length ? l1 : ["……"])) { const nar = fillBinds(t, io.girl, "你"); await io.narrate(nar); await io.waitTap?.("下一句"); await io.reply(sc(1).attitude || "", nar, 1); }
  await io.waitTap?.("開始");
  let scene = 2, thrusts = 0;
  await play(2);
  for (;;) {
    await io.waitThrust();
    thrusts++;
    const anim = io.localAnim ? io.localAnim(scene) : null;   // 動圖立刻跑，跟擲骰／生文並行（同 scriptHandleThrust）
    await io.thrustAnim?.();
    const d = affRoll(scene, stageNow()); io.aff?.(d);   // pt264u：0 也回報（畫面顯示 ±0），高潮那下也算
    let act = roll(scene);
    if (thrusts >= MAX_THRUST && act !== "both") act = "player";
    const nx = nextSceneOf(scene, act);
    if (nx === 4 || nx === 5) { const dc = affRoll(nx, stageNow()); if (dc) io.aff?.(dc); await anim; io.stopAnim?.(); await play(nx); return { climax: nx === 5 ? "both" : "player", thrusts }; }
    if (nx === 3) { scene = 3; await play(3); continue; }
    if (act === "swap") await io.showStep?.(SCENE_STEP[scene], SCENE_ZH[scene], true);
    else if (act === "ai") await io.reply(sc(scene).attitude || "", "（你繼續肏她）", scene);
  }
}

/** 2026-10-26 pt263u：做完一次 → CD 4–5 回合（回合＝afterPlayerTurn：聊天一句或出一張牌）。CD 期間可以聊天、出別的牌，只是做愛卡抽不到／出不了。 */
export const SEX_CD = [4, 5];
export const rollSexCd = (rng = Math.random) => SEX_CD[0] + Math.floor(rng() * (SEX_CD[1] - SEX_CD[0] + 1));
export const sexCdBlocks = (card, sess) => card?.act === "sex" && (Number(sess?.sexCd) || 0) > 0;
export const tickSexCd = (sess) => { if ((Number(sess?.sexCd) || 0) > 0) sess.sexCd -= 1; return Number(sess?.sexCd) || 0; };

/** 2026-10-26 pt264u：換妻旅館的好感階＝依她對你的接受度（換了＝同意，不是陌生人硬來）。 */
export const swapAffStage = (accept) => { const a = Number(accept) || 0; return a >= 85 ? "wife" : a >= 60 ? "girlfriend" : a >= 30 ? "friend" : "stranger"; };
const STAGE_ZH = { stranger: "陌生", friend: "朋友", girlfriend: "女友", wife: "妻子" };
/** 劇本 attitude 是房間用的「依關係：陌生…、妻子享受」——換妻時那個「妻子」會讓 AI 以為在講玩家老婆。
 *  只留她這一階的那段，並把「妻子」字眼換掉。 */
export function swapAttitude(att, stage = "stranger") {
  const want = STAGE_ZH[stage] || "陌生";
  const out = [];
  for (const sen of String(att || "").split("。").map((x) => x.trim()).filter(Boolean)) {
    const body = sen.replace(/^依關係[：:]/, "");
    const n = ["陌生", "朋友", "女友", "妻子"].filter((k) => body.includes(k)).length;
    if (n < 2) { out.push(sen); continue; }
    const parts = body.split(/[；;、，,]/).map((x) => x.trim()).filter(Boolean);
    const hit = parts.find((x) => x.split(/[／/]/).some((y) => y.startsWith(want)) || x.includes(want)) || parts.find((x) => x.startsWith("女友")) || "";
    const feel = hit.replace(/^((陌生|朋友|女友|妻子)[／/]?)+/, "").trim();
    if (feel) out.push(`她此刻的心情：${feel}`);
  }
  return out.join("。").replace(/妻子/g, "熟女").replace(/\[name\]/g, "她").trim();
}
/** 感覺詞語：生文 prompt 共用。 */
export const SENSE_RULE = "台詞要有身體感覺詞：熱、燙、濕、麻、酥、癢、脹、滑、緊、發抖、喘、腿軟、心跳好快、裡面被撐開、一陣一陣的……寫出她此刻身體的感受，不要只說動作名稱。";
export const SWAP_SEX_FB = {
  2: ["（咬著下唇，腰一抖）……嗯、好燙……整根都、都進來了……", "（抓緊床單，喘著）……裡面被撐得好滿……慢、慢一點……", "（臉頰燒紅）……好奇怪……麻麻的，一直往上竄……"],
  3: ["（雙腿夾住你的腰）……啊、好深……裡面一陣一陣在縮……", "（全身發燙，喘個不停）……好舒服……腿都軟了……別停……", "（濕得發出水聲，羞得別過臉）……聽到了啦……好丟臉、可是好舒服……"],
  4: ["（感覺到裡面一熱，身體一顫）……好燙……你射進來了……", "（喘著氣，小腹還在抽動）……熱熱的……滿到流出來了……"],
  5: ["（弓起背尖叫，全身痙攣）……啊啊、去了……一起……！", "（腦袋一片空白，腿抖個不停）……好熱……整個人都化掉了……"],
  1: ["（呼吸一亂，皮膚泛紅）……頂著了……好燙……你的好硬……", "（腿一縮，又張開）……嗯……比我老公的還粗……快、快進來……"],
};

// ======================================================================
// 2026-10-26 pt283u：旅館做愛重做——「肏」跟對話脫鉤、三姿勢、每下骰射／高潮、立繪切換。
//   流程：準備（張腿）→ 頂住（陰莖頂著）→ 出「肏」鈕 → 每按一下：立刻播一次局部動圖（不等對話）＋擲骰＋要下一句台詞（背景生，生完只貼字）。
//   對話生完貼出時不收「肏」、不停動圖；連按時台詞合併成「生完再補一句」，不排長隊。
//   射＝內射 → 射圖、立繪換「坐著雙腿打開精液流出」(other~creampie)，做愛結束（進 CD）。
//   她高潮可以很多次；累積 ≥ CLIMAX_COLLAPSE_AT 次 → 立繪換「高潮癱軟坐著」(other~climax)。
// ======================================================================
/** 三姿勢（值＝圖鍵用的 pose）：背後＝doggy、正面＝missionary、騎乘＝cowgirl。 */
export { rollAffDelta };
export const HOTEL_POSES = ["missionary", "doggy", "prone", "cowgirl"];   // pt285u：prone＝床鋪背後組（她趴床、他從後面壓著肏、鏡頭在後面）
export const POSE_ZH = { doggy: "背後", missionary: "正面", cowgirl: "騎乘", prone: "趴床背後" };
/** 只能在床上的姿勢（浴室不輪到）。 */
export const BED_ONLY_POSES = new Set(["prone"]);
export const posesFor = (scene) => HOTEL_POSES.filter((p) => scene !== "hotel_bath" || !BED_ONLY_POSES.has(p));
/** 五狀態 → 房間 sex_pose_packs 的步驟（open／tip／thrust／cum／orgasm）。 */
export const SEX_STATES = ["prep", "tip", "thrust", "ejac", "climax"];
export const STATE_ZH = { prep: "準備", tip: "頂住", thrust: "做愛", ejac: "射", climax: "高潮" };
export const STATE_STEP = { prep: "open", tip: "tip", thrust: "thrust", ejac: "cum", climax: "orgasm" };
export const sexImgKey = (pose, state) => `sex~${pose}~${STATE_STEP[state] || state}`;
/** 3 姿勢 × 5 狀態＝15 個圖鍵。 */
export const SEX_IMG_MATRIX = HOTEL_POSES.flatMap((p) => SEX_STATES.map((s) => sexImgKey(p, s)));
/** 找圖的退路：騎乘還沒有自己的圖組（伺服器沒有 sex_cowgirl_* shot）→ 借正面；頂住沒圖→準備；射／高潮沒圖→做愛；做愛沒圖→舊的 join。 */
const STEP_FB = { prep: ["open"], tip: ["tip", "open"], thrust: ["thrust", "join"], ejac: ["cum", "thrust", "join"], climax: ["orgasm", "thrust", "join"] };
export function sexImgCandidates(pose, state) {
  const poses = pose === "cowgirl" ? ["cowgirl", "missionary"] : pose === "prone" ? ["prone", "doggy"] : [pose];
  return poses.flatMap((p) => (STEP_FB[state] || [state]).map((s) => `sex~${p}~${s}`));
}
/** 局部動圖：背後用背後（doggy）；正面、騎乘都用正面（missionary）。 */
export const animPoseOf = (pose) => (pose === "doggy" || pose === "prone" ? "doggy" : "missionary");   // 背後系（含趴床背後）→ 背後動圖
export const nextPose = (pose, poses = HOTEL_POSES) => poses[(poses.indexOf(pose) + 1) % poses.length];
/** 每下肏的機率（第 n 下）：
 *   射：前 EJAC_MIN-1 下不射；之後 6% 起、每下 +1.5%，上限 45%；第 MAX_THRUST 下必射。
 *   她高潮：10% 起、每下 +2%，上限 50%；剛高潮完的下一下不再高潮（不連發）。 */
export const ROLL = { ejacMin: 3, ejacBase: 0.06, ejacStep: 0.015, ejacMax: 0.45, climaxBase: 0.1, climaxStep: 0.02, climaxMax: 0.5 };
export const CLIMAX_COLLAPSE_AT = 3;
export function rollPress(n, rng = Math.random, { lastClimax = false } = {}) {
  const pe = n < ROLL.ejacMin ? 0 : Math.min(ROLL.ejacMax, ROLL.ejacBase + ROLL.ejacStep * (n - ROLL.ejacMin));
  const pc = lastClimax ? 0 : Math.min(ROLL.climaxMax, ROLL.climaxBase + ROLL.climaxStep * (n - 1));
  const climax = rng() < pc;
  const ejac = n >= MAX_THRUST || rng() < pe;
  return { ejac, climax, pe, pc };
}
/** 她的立繪造型：內射 > 高潮癱軟 > 裸體。 */
export const portraitLook = ({ climaxes = 0, creampie = false } = {}) => (creampie ? "creampie" : climaxes >= CLIMAX_COLLAPSE_AT ? "climax" : "nude");

/**
 * io：{ showState(pose, state)（換 POV 圖，不要 await 很久）, anim(animPose)（播一次局部動圖；不 await）,
 *       waitPress() → Promise<"thrust"|"pose">（「肏」鈕／換姿勢鈕；按完鈕不收）, line(ctx) → Promise（生一句＋貼出；背景跑）,
 *       portrait(look), aff?(), sleep?(ms), onClimax?(st), onEjac?(st) }
 * 回 { thrusts, climaxes, creampie, pose }。
 */
export async function runHotelSex(io, { rng = Math.random, pose = "missionary", tipMs = 900, poses = HOTEL_POSES, endOnClimax = false } = {}) {
  const st = { pose: poses.includes(pose) ? pose : "missionary", state: "prep", presses: 0, climaxes: 0, creampie: false, done: false, lastClimax: false };
  const sleep = io.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const set = (s) => { st.state = s; try { io.showState(st.pose, s); } catch { /* */ } };
  set("prep"); await sleep(tipMs); set("tip");
  // 對話：一次只生一句；生的時候又按 → 生完再補一句（只補一句）
  let lineP = null, again = null;
  const kick = (ctx) => {
    if (lineP) { again = ctx; return lineP; }
    lineP = (async () => {
      let c = ctx;
      while (c) { again = null; try { await io.line({ ...c, pose: st.pose, climaxes: st.climaxes }); } catch { /* 生文失敗不影響肏 */ } c = st.done ? null : again; }
    })().finally(() => { lineP = null; });
    return lineP;
  };
  kick({ event: "tip" });
  for (;;) {
    const act = await io.waitPress();
    if (act === "pose") {   // pt317u #4：換體位＝這個體位從第一步（準備→頂住）重來；興奮度（presses／高潮）不變
      st.pose = nextPose(st.pose, poses); set("prep"); await sleep(tipMs); set("tip"); kick({ event: "tip" }); continue;
    }
    st.presses++;
    io.anim(animPoseOf(st.pose));   // 每按一下就播，不等對話
    set("thrust");
    io.aff?.(st);
    const r = rollPress(st.presses, rng, { lastClimax: st.lastClimax });
    st.lastClimax = r.climax;
    if (r.climax) { st.climaxes++; set("climax"); io.onClimax?.(st); io.portrait(portraitLook(st)); }
    // pt316u #5：換妻約會＝一段做愛到「她高潮」或「玩家射」就結束（先到先算）
    if (endOnClimax && r.climax && !r.ejac) {
      st.done = true;
      if (lineP) await Promise.race([lineP, sleep(8000)]);
      try { await io.line({ event: "climax", pose: st.pose, climaxes: st.climaxes, final: true }); } catch { /* */ }
      return { thrusts: st.presses, climaxes: st.climaxes, creampie: false, pose: st.pose, end: "climax" };
    }
    if (r.ejac) {
      st.creampie = true; st.done = true; set("ejac"); io.onEjac?.(st); io.portrait(portraitLook(st));
      if (lineP) await Promise.race([lineP, sleep(8000)]);   // 前一句還在生：最多等 8 秒再貼射精那句
      try { await io.line({ event: r.climax ? "both" : "ejac", pose: st.pose, climaxes: st.climaxes, final: true }); } catch { /* */ }
      return { thrusts: st.presses, climaxes: st.climaxes, creampie: true, pose: st.pose, end: "ejac" };
    }
    kick({ event: r.climax ? "climax" : "thrust" });   // 「肏」也有下一句的效果
  }
}

// ======================================================================
// 2026-10-26 pt284u：她「主動」＝講色色的話，不是摸奶／摸陰唇類動作；內射後點「張腿流精」立繪 → 變態色情回應。
/** 主動時的生文規則：只准講話，不准寫她伸手愛撫的動作。 */
export const DIRTY_TALK_RULE = "她這句是「主動」：主動的方式是講色色的話，不是動手。可以評論他的陰莖（好大／好粗／好硬／意外地小）、拿他跟自己老公比、問他喜不喜歡、舒不舒服、要不要更深、說自己被他肏得多爽。禁止寫她摸胸、揉奶、摸陰唇、撫摸身體、握住陰莖之類的愛撫動作；括號裡最多寫表情、喘息、腰的反應。不要把自己叫成「妻子」。";
export const GROPE_WORDS = ["摸奶", "揉胸", "摸胸", "摸陰唇", "撫摸", "愛撫", "手伸進"];
export const DIRTY_TALK = [
  "（喘著，眯眼看你）……你的好大……比我老公的大好多……裡面整個被撐開了……",
  "（咬著唇笑）……嘻，你的有點小耶……可是頂得好準……麻麻的……",
  "（腰一抖一抖）……跟我老公比起來……你硬好多……燙到裡面在發抖……",
  "（貼著你耳邊喘）……你喜歡嗎？喜歡肏別人的老婆嗎……？",
  "（臉燒紅）……舒服嗎……？我裡面是不是比你老婆還緊……？",
  "（眼神迷濛）……含得好深……都頂到最裡面了……再用力一點嘛……",
  "（喘個不停）……我老公從來沒有頂到這裡過……好酥……腿都軟了……",
  "（小聲）……被你這樣肏……回家我要怎麼跟他做啊……好濕……",
  "（勾起嘴角）……這麼粗……我會被你肏壞掉的……可是好想要……",
  "（扭著腰）……說啊，我跟你老婆，哪一個比較爽……？",
];
/** 內射後點「坐著雙腿打開精液流出」立繪：羞恥＋興奮＋怕懷孕＋自覺變態。 */
export const CREAMPIE_TAP = [
  "（掰開陰唇，看著白濁流出來）……被老公以外的人射進來了……好多……",
  "（腿還在抖）……啊啊……這麼濃……會懷孕的啦……",
  "（捂著臉）……怎麼辦……今天不是安全日……",
  "（喘著）……太爽了……不小心就讓你射在裡面了……",
  "（手指撐開，熱熱的一直流）……還在流……裡面好燙、黏黏的……",
  "（紅著臉笑）……被別人內射還這麼興奮……我是不是變態啊……",
  "（摸著小腹）……都灌進子宮裡了……老公會發現嗎……",
  "（咬著唇）……明明說好要射外面的……可是好舒服……",
  "（低頭看著腿間）……流出來的不是老公的……好丟臉……又好想再要……",
  "（小聲）……要是懷上了……就說是老公的好了……嘻……",
];
/** 高潮太多次癱軟坐著：軟、累、還在餘韻。 */
export const CLIMAX_TAP = [
  "（癱著喘）……不、不行了……去太多次了……",
  "（腿還在抽）……腦袋一片空白……全身都麻麻的……",
  "（虛軟地笑）……被你弄成這樣……站不起來了啦……",
  "（眼神渙散）……裡面還一縮一縮的……好丟臉……",
  "（小聲）……我老公都沒讓我去這麼多次過……",
];
/** 立繪 look → 點擊台詞庫（沒有就回空陣列）。 */
export const PORTRAIT_TAP = { creampie: CREAMPIE_TAP, climax: CLIMAX_TAP };
/** 點立繪拿一句（不連續重複）。 */
export function portraitTapLine(look, rng = Math.random, last = "") {
  const bank = PORTRAIT_TAP[look] || [];
  if (!bank.length) return "";
  const pool = bank.length > 1 ? bank.filter((x) => x !== last) : bank;
  return pool[Math.floor(rng() * pool.length)] || pool[0];
}
/** 做愛中她主動的機率（每句台詞）。 */
export const INITIATIVE_P = 0.4;
export const isInitiative = (event, rng = Math.random) => (event === "thrust" || event === "tip") && rng() < INITIATIVE_P;
/* pt287u：點老婆×對方丈夫雙人圖 → 老婆對玩家說話（右側立繪）。表情＝害羞／失神／高潮；內容＝害羞／懊悔／讚美對方丈夫。
 * {h}＝對方丈夫名字。她是玩家的老婆，可以叫玩家「老公」。 */
export const WIFE_PAIR_EXPR = ["shy", "vacant", "climax"];
export const WIFE_PAIR_EXPR_ZH = { shy: "害羞", vacant: "失神", climax: "高潮" };
/** 表情 → 立繪 look 退路（旅館全裸；沒有專用圖就用 nude）＋濾鏡 */
export const WIFE_PAIR_LOOK = { shy: ["shy", "nude", "under", "normal"], vacant: ["nude", "under", "shy", "normal"], climax: ["climax", "nude", "under", "shy", "normal"] };
export const WIFE_PAIR_FILTER = { shy: "saturate(1.25) hue-rotate(-12deg) brightness(1.05)", vacant: "saturate(.7) brightness(.95) contrast(.95)", climax: "saturate(1.4) hue-rotate(-20deg) brightness(1.08)" };
export const WIFE_PAIR_LINES = {
  shy: [
    "（滿臉通紅別過頭）……老公……不要一直看啦……好丟臉……",
    "（小聲）……被你看著……被{h}這樣弄……我、我會更有感覺的……",
    "（遮住臉）……別盯著我們那裡看嘛……",
    "（害羞）……老公……你、你在旁邊看……我都不知道要怎麼辦了……",
  ],
  regret: [
    "（咬著唇）……對不起……老公……我真的停不下來……",
    "（眼眶泛紅）……我是不是……變成很壞的老婆了……",
    "（喘著）……明明說好只是試試看的……怎麼會……變成這樣……",
    "（愧疚地看著你）……老公……你不會因為這樣討厭我吧……",
  ],
  praise: [
    "（失神地）……老公……{h}的……好大……頂得好深……",
    "（喘）……{h}好會……比你還會……對不起……可是真的好舒服……",
    "（迷濛）……他的腰……一直不停……我快被他弄壞了……",
    "（顫抖）……老公你看……{h}把我弄成這樣了……",
  ],
};
/** 主題 → 偏好表情（讓臉跟台詞對得上） */
const WP_EXPR_OF = { shy: ["shy", "shy", "vacant"], regret: ["shy", "vacant", "vacant"], praise: ["vacant", "climax", "climax"] };
/** 拿一句老婆對玩家的話：{ theme, expr, text }（不連續重複） */
export function wifePairLine(hName = "他", rng = Math.random, last = "") {
  const themes = Object.keys(WIFE_PAIR_LINES), theme = themes[Math.floor(rng() * themes.length) % themes.length];
  const bank = WIFE_PAIR_LINES[theme].map((l) => l.replaceAll("{h}", hName)), pool = bank.length > 1 ? bank.filter((x) => x !== last) : bank;
  const text = pool[Math.floor(rng() * pool.length) % pool.length], ex = WP_EXPR_OF[theme];
  return { theme, expr: ex[Math.floor(rng() * ex.length) % ex.length], text };
}
