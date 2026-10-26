/* 2026-10-26 pt261u：換妻旅館裡「玩家自己做愛」＝房間聊天那套劇本做愛（ScriptMode sex 劇本）。
 * 流程跟 app.js 的 beginScriptScene／rollSexThrust 一樣：場景1 開場（旁白→她回一句）→ 場景2 正戲（「肏」鈕）
 * → 每次肏骰 rollSexThrust：換圖／新 AI／進投入（場景3）／玩家高潮（場景4）／雙方高潮（場景5）→ 結束。
 * 圖用換妻的 sex~<姿勢>~open|join|thrust（同一套快取，沒有就現產）；你老婆×對方丈夫的雙人圖不動。 */
import { pickPack, normalizeData, fillBinds, narrLines, rollSexThrust, rollAffDelta, boundFramePackId, SCENE_ZH } from "./script_mode.js";
import { packFrameUrls, findPack } from "./frame_pack.js";

// ---- 2026-10-26 pt263u「全抄」：局部動圖跟 app.js flashScriptAnim 同一套（sexAnim 優先 → 劇本綁定幀包 → 同體位幀包 → 任何幀包；
// 首輪 1–4 幀「慢快快慢」，連肏只播 2–4「快快慢」；播完停在最後一幀等下一下）。
export const FIRST_HOLDS = [300, 180, 180, 300];
export const CONTINUE_HOLDS = [180, 180, 300];
let FRAME_PACKS = null;
export async function loadFramePacks() {
  if (FRAME_PACKS) return FRAME_PACKS;
  const get = async (u) => { try { const r = await fetch(u, { cache: "no-store" }); return r.ok ? await r.json() : null; } catch { return null; } };
  const arr = (j) => (Array.isArray(j?.packs) ? j.packs : Array.isArray(j) ? j : []).filter((p) => p && p.id);
  let packs = arr(await get("/api/frame-packs?ts=" + Date.now()));
  if (!packs.length) packs = arr(await get("/assets/frame_packs/index.json?ts=" + Date.now()));
  FRAME_PACKS = packs; return packs;
}
/** 跟 app.js scriptAnimUrlCandidates 同順序。girl.sexAnim＝{ pose: { urls, at } }。 */
export function animUrlCandidates({ pack, scene, girl, framePacks = [] } = {}) {
  const pick = (u) => (Array.isArray(u) ? u : []).map((x) => String(x || "").trim()).filter(Boolean);
  const poseId = String(pack?.pose || "").trim();
  let primary = [];
  const sa = girl?.sexAnim || null;
  if (sa) {
    if (poseId) primary = pick(sa[poseId]?.urls);
    if (!primary.length) for (const r of Object.values(sa)) { const u = pick(r?.urls); if (u.length >= 2) { primary = u; break; } }
    if (!primary.length) for (const r of Object.values(sa)) { const u = pick(r?.urls); if (u.length) { primary = u; break; } }
  }
  let fallback = pick(packFrameUrls(findPack(framePacks, boundFramePackId(pack, pack?.scenes?.[String(scene)]))));
  if (!fallback.length && poseId) fallback = pick(packFrameUrls(framePacks.find((p) => p && p.pose === poseId && pick(packFrameUrls(p)).length)));
  if (!fallback.length) fallback = pick(packFrameUrls(framePacks.find((p) => pick(packFrameUrls(p)).length >= 2) || framePacks.find((p) => pick(packFrameUrls(p)).length)));
  return { primary, fallback };
}
/** 這一下要播哪幾幀＋每幀停多久（首輪 vs 連肏）。 */
export function animPlan(urls, linger) {
  const list = linger ? urls.slice(1, 4) : urls.slice(0, 4);
  return list.map((u, i) => [u, (linger ? CONTINUE_HOLDS : FIRST_HOLDS)[Math.min(i, 3)]]);
}
/** 局部動圖彈層（同房間 #sex-anim-popup 樣式：中間偏下、半透明卡、不吃點擊）。回 { play(), stop(), el }。 */
export function createLocalAnim(root, getCtx) {
  const el = document.createElement("div");
  el.className = "swp-sexanim"; el.hidden = true;
  el.style.cssText = "position:absolute;inset:0;z-index:28;display:flex;align-items:center;justify-content:center;padding-top:18vh;pointer-events:none";
  el.innerHTML = `<div style="max-width:min(72vw,480px);max-height:min(48vh,520px);border-radius:12px;overflow:hidden;background:rgba(0,0,0,.4);opacity:.4;box-shadow:0 12px 32px rgba(0,0,0,.5),0 0 0 1px rgba(255,79,216,.35)"><img alt="" style="display:block;width:100%;height:auto;max-height:min(48vh,520px);object-fit:contain"></div>`;
  root.append(el);
  const img = el.querySelector("img");
  let run = 0, linger = false;
  const load = (u) => new Promise((ok) => { img.onload = () => ok(true); img.onerror = () => ok(false); img.src = u; if (img.complete && img.naturalWidth) ok(true); });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  return {
    el,
    async play() {
      const my = ++run;
      el.hidden = false;
      const { primary, fallback } = animUrlCandidates({ ...getCtx(), framePacks: await loadFramePacks() });
      if (my !== run) return 0;
      let shown = 0;
      for (const src of [primary, fallback]) {
        if (!src.length || shown) continue;
        for (const [u, ms] of animPlan(src, linger)) { if (my !== run) return shown; if (await load(u)) { shown++; await wait(ms); } }
      }
      if (my === run) { if (shown) linger = true; else el.hidden = true; }
      return shown;
    },
    stop() { run++; linger = false; el.hidden = true; img.removeAttribute("src"); },
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
  1: ["（呼吸一亂，皮膚泛紅）……你的手好燙……", "（被你碰到的地方一陣酥麻）……嗯……別、別一直看……"],
};
