/* 把換妻立繪整批交給伺服器。網頁關掉，這台仍會生完。 */
import { gameEngine } from "./rental_scene_gen.js?v=17";
import { api, templateFor, cafeBody } from "./swap_cafe_gen.js?v=38";
import { PAIR_SLOTS, pairBody, pairOwner } from "./swap_pair_gen.js?v=28";
import { pregenTease } from "./swap_tease.js?v=13";
import { PRE_PARK, HOTEL_PORTRAIT } from "./swap_meet_rules.js?v=2";

async function post(path, body) {
  const r = await fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body || {}) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : `產圖排隊失敗 ${r.status}（伺服器要重啟？）`);
  return j;
}
export const pregenState = () => fetch("/api/swap/pregen", { cache: "no-store" }).then(async (r) => {
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j.detail || `讀不到產圖進度 ${r.status}`);
  return j;
});
export const pregenRetry = (bucket) => post("/api/swap/pregen/retry", { bucket });
export const pregenCancel = () => { teaseStop = true; return post("/api/swap/pregen/cancel", {}); };
export const pregenEnter = () => post("/api/swap/pregen/enter", {});

/** bucket：date＝進酒吧前全部 31 張立繪＋21 張雙人圖；hotel＝對方妻子裸體四張。已有的伺服器會標完成、不重生。 */
export async function queuePortraits(bucket, wife, couple) {
  if (!wife?.id) throw new Error("先選一位魅子");
  if (!couple?.id) throw new Error("沒有對方夫妻");
  const eng = await gameEngine();
  const S = await api.state();
  const slots = bucket === "hotel" ? HOTEL_PORTRAIT : PRE_PARK;
  const jobs = slots.map(([ch, ex]) => {
    const seed = Math.floor(Math.random() * 2 ** 31) || 1;
    return {
      owner: ch === "wife" ? wife.id : couple.id,
      key: `${ch}~${ex}`,
      body: cafeBody(ch, ex, wife, couple, eng, templateFor(S.prompts, ch, ex), seed),
    };
  });
  // pt302u：date＝全部立繪＋全部雙人圖一起交給伺服器（同一動作的格共用 seed）
  if (bucket !== "hotel") {
    const seeds = {};
    for (const slot of PAIR_SLOTS) {
      const act = slot.split("~")[0];
      const seed = seeds[act] || (seeds[act] = Math.floor(Math.random() * 2 ** 31) || 1);
      try { jobs.push({ owner: pairOwner(wife, couple), key: `pair~${slot}`, body: pairBody(slot, wife, couple, eng, seed) }); } catch { /* 沒模型就跳過雙人圖 */ }
    }
  }
  const names = { wife: wife.name || "老婆", husband: couple.husband?.name || "對方丈夫", other: couple.wife?.name || "對方妻子" };
  return post("/api/swap/pregen", {
    bucket: bucket === "hotel" ? "hotel" : "date",
    coupleId: couple.id, wifeId: wife.id, price: couple.husband?.swapPrice || 0, names, jobs,
  });
}

/** pt302u：KTV／旅館（房間＋浴室）動作圖＋做愛步驟圖。這些圖組在瀏覽器組 prompt，網頁開著就在背景一張張排進伺服器。 */
let teaseRun = null, teaseStop = false;
export function kickTeasePregen(couple, debug = () => {}) {
  if (!couple?.id || teaseRun) return teaseRun;
  teaseStop = false;
  teaseRun = (async () => {
    let S = await api.state();
    for (const scene of ["ktv", "hotel"]) { if (teaseStop) break; S = await pregenTease(couple, scene, S, { debug, alive: () => !teaseStop, onTick: (d, t, f) => debug(`換妻預產動作圖（${scene}）${d}/${t}${f ? `，失敗 ${f}` : ""}`) }); }
  })().catch((e) => debug(`換妻預產動作圖：${e?.message || e}`)).finally(() => { teaseRun = null; });
  return teaseRun;
}
