/* 把換妻立繪整批交給伺服器。網頁關掉，這台仍會生完。 */
import { gameEngine } from "./rental_scene_gen.js?v=17";
import { api, templateFor, cafeBody } from "./swap_cafe_gen.js?v=37";
import { PRE_PARK, HOTEL_PORTRAIT } from "./swap_meet_rules.js?v=1";

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
export const pregenCancel = () => post("/api/swap/pregen/cancel", {});
export const pregenEnter = () => post("/api/swap/pregen/enter", {});

/** bucket：date＝進酒吧前的 15 張；hotel＝對方妻子裸體四張。已有的伺服器會標完成、不重生。 */
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
  const names = { wife: wife.name || "老婆", husband: couple.husband?.name || "對方丈夫", other: couple.wife?.name || "對方妻子" };
  return post("/api/swap/pregen", {
    bucket: bucket === "hotel" ? "hotel" : "date",
    coupleId: couple.id, wifeId: wife.id, price: couple.husband?.swapPrice || 0, names, jobs,
  });
}
