/* 2026-10-26 pt261u：換妻旅館裡「玩家自己做愛」＝房間聊天那套劇本做愛（ScriptMode sex 劇本）。
 * 流程跟 app.js 的 beginScriptScene／rollSexThrust 一樣：場景1 開場（旁白→她回一句）→ 場景2 正戲（「肏」鈕）
 * → 每次肏骰 rollSexThrust：換圖／新 AI／進投入（場景3）／玩家高潮（場景4）／雙方高潮（場景5）→ 結束。
 * 圖用換妻的 sex~<姿勢>~open|join|thrust（同一套快取，沒有就現產）；你老婆×對方丈夫的雙人圖不動。 */
import { pickPack, normalizeData, fillBinds, narrLines, rollSexThrust, SCENE_ZH } from "./script_mode.js";

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
 * io：{ girl（她的人設，給 [name] 綁定）, narrate(text), reply(attitude, narr) → 她說完一句, showStep(step), thrustAnim(), waitThrust() → Promise, roll? }
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
  await play(1);
  let scene = 2, thrusts = 0;
  await play(2);
  for (;;) {
    await io.waitThrust();
    thrusts++;
    await io.thrustAnim?.();
    let act = roll(scene);
    if (thrusts >= MAX_THRUST && act !== "both") act = "player";
    const nx = nextSceneOf(scene, act);
    if (nx === 4 || nx === 5) { await play(nx); return { climax: nx === 5 ? "both" : "player", thrusts }; }
    if (nx === 3) { scene = 3; await play(3); continue; }
    if (act === "swap") await io.showStep?.(SCENE_STEP[scene], SCENE_ZH[scene], true);
    else if (act === "ai") await io.reply(sc(scene).attitude || "", "（你繼續肏她）", scene);
  }
}
