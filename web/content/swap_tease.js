/* 換妻・玩家對對方妻子的動作圖＋做愛步驟圖（2026-10-23）。
 * 共用房間那套 *_packs 的 build／generate（同一份圖組 prompt），魅子換成「對方妻子」：她自己的 ckpt＋補成房間 look 格式。
 * 結果存在換妻伺服器狀態 images[couple.id]["tease~<動作>(~nude)" | "sex~<姿勢>~<步驟>"]，之後直接用、不重生。 */
import { api } from "./swap_cafe_gen.js?v=33";
import { gameEngine } from "./rental_scene_gen.js?v=17";
import { teaseGirlOf, teaseKey, sexKey, teaseNude, teaseUnder, sexPoseFor, pregenKeys } from "./swap_tease_rules.js?v=7";
import { UNDER_OUTFIT } from "./swap_outfit.js?v=3";
import { pickRuntimeWaistPack, generateWaistPackImage } from "./waist_packs.js?v=6";
import { pickRuntimeButtPack, generateButtPackImage } from "./butt_packs.js?v=7";
import { pickRuntimeBreastPack, generateBreastPackImage, buildBreastImgBody } from "./breast_packs.js?v=4";
import { pickRuntimeKneadPack, generateKneadPackImage } from "./knead_packs.js?v=4";
import { pickRuntimeSuckPack, generateSuckPackImage } from "./suck_packs.js?v=5";
import { pickRuntimeLickPack, generateLickPackImage } from "./lick_packs.js?v=5";
import { pickRuntimeLabiaPack, generateLabiaPackImage } from "./labia_packs.js?v=3";
import { pickRuntimeLabiaRubPack, generateLabiaRubPackImage } from "./labia_rub_packs.js?v=3";
import { pickRuntimeFingerPack, generateFingerPackImage } from "./finger_packs.js?v=3";
import { pickRuntimeVaginaFingerPack, generateVaginaFingerPackImage } from "./vagina_finger_packs.js?v=3";
import { pickRuntimeCervixRubPack, generateCervixRubPackImage } from "./cervix_rub_packs.js?v=3";
import { pickRuntimeSexPosePack, generateSexStepImage } from "./sex_pose_packs.js?v=11";
import { composeTeaseExtra, teaseFraming } from "./tease_shots.js?v=8";

/** 動作 → 圖組（同房間 ACTION_PACK_JOBS）。oral 沒有圖組：用 tease_oral_suck 的預設動作 prompt。 */
export const TEASE_JOBS = {
  waist: { pick: pickRuntimeWaistPack, gen: generateWaistPackImage },
  butt: { pick: pickRuntimeButtPack, gen: generateButtPackImage },
  breast: { pick: pickRuntimeBreastPack, gen: generateBreastPackImage },
  breast_knead: { pick: pickRuntimeKneadPack, gen: generateKneadPackImage },
  breast_suck: { pick: pickRuntimeSuckPack, gen: generateSuckPackImage },
  nipple_lick: { pick: pickRuntimeLickPack, gen: generateLickPackImage },
  labia: { pick: pickRuntimeLabiaPack, gen: generateLabiaPackImage },
  labia_rub: { pick: pickRuntimeLabiaRubPack, gen: generateLabiaRubPackImage },
  finger_in: { pick: pickRuntimeFingerPack, gen: generateFingerPackImage },
  vagina_finger: { pick: pickRuntimeVaginaFingerPack, gen: generateVaginaFingerPackImage },
  cervix_rub: { pick: pickRuntimeCervixRubPack, gen: generateCervixRubPackImage },
  oral: { pick: async () => null, gen: genOral },
};

async function waitImg(body, ms = 360000) {
  const post = async (b) => { const r = await fetch("/api/imggen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) }); const j = await r.json().catch(() => ({})); if (!r.ok) throw new Error(j.detail || r.status); return j; };
  let r = await post({ ...body, retry: true }), key = r.key || body.key; const t0 = Date.now();
  while (Date.now() - t0 < ms) { if (r.status === "done" || r.status === "error") return r; await new Promise((x) => setTimeout(x, 1500)); r = await post({ ...body, key, retry: false }); if (r.key) key = r.key; }
  return { status: "error", error: "逾時" };
}
async function genOral(_pack, girl, eng, opts = {}) {
  const base = buildBreastImgBody(null, girl, eng, opts), worn = opts.nude ? "" : base.outfit;
  const body = { ...base, key: `swap-oral:${girl.id}:${Date.now().toString(36)}`, framing: teaseFraming("tease_oral_suck"), extra: composeTeaseExtra("tease_oral_suck", opts.stage || "lover", worn), shot: "tease_oral_suck" };
  const r = await waitImg(body); return { status: r.status, result: r.result, error: r.error };
}

export const cachedUrl = (S, c, key) => (S?.images?.[c?.id] || {})[key]?.cut || "";
const inflight = new Map();   // `${couple}|${key}` → Promise<images>

/** 生一張（tease 或 sex）並存進換妻狀態；同一張同時只跑一次。回新的 images（整份）。 */
export function genTeaseImage(c, job, { eng = null, debug = () => {} } = {}) {
  const id = `${c.id}|${job.key}`;
  if (inflight.has(id)) return inflight.get(id);
  const run = (async () => {
    const e = eng || await gameEngine(), g0 = teaseGirlOf(c), girl = job.under ? { ...g0, outfitName: UNDER_OUTFIT } : g0;   // KTV 脫到剩內衣
    let r;
    if (job.kind === "sex") { const pack = await pickRuntimeSexPosePack(job.pose); r = await generateSexStepImage(job.pose, job.step, pack, girl, e, { stage: "lover" }); }
    else { const J = TEASE_JOBS[job.act]; if (!J) throw new Error(`沒有 ${job.act} 的圖組`); const pack = await J.pick(); r = await J.gen(pack, girl, e, { stage: "lover", nude: !!job.nude }); }
    if (r?.status !== "done" || !r.result) throw new Error(r?.error || "沒有結果");
    const raw = String(r.result).split("|")[0];
    const j = await api.put("image", { owner: c.id, key: job.key, raw, cut: raw }, "POST");
    debug(`換妻：動作圖 ${job.key} 完成`);
    return j.images;
  })().finally(() => inflight.delete(id));
  inflight.set(id, run); return run;
}
/** 卡牌 → 要的圖（場景決定穿衣／裸體、做愛姿勢）。做愛回 3 步。 */
export function jobsForAct(act, scene, strip = 0) {
  if (act === "sex") { const pose = sexPoseFor(scene); return ["open", "join", "thrust"].map((step) => ({ kind: "sex", pose, step, key: sexKey(pose, step) })); }
  if (!TEASE_JOBS[act]) return [];   // 接吻等：純文字，不生圖
  const nude = teaseNude(act, scene, strip), under = !nude && teaseUnder(act, scene, strip);
  return [{ kind: "tease", act, nude, under, key: teaseKey(act, nude || (under ? "under" : false)) }];
}
/** 預產（開車黑畫面）：場景那一整組缺的，一張一張生。onTick(done, total, fail)。回最新 S。 */
export async function pregenTease(c, scene, S, { onTick = () => {}, debug = () => {} } = {}) {
  const want = pregenKeys(scene).filter((j) => !cachedUrl(S, c, j.key));
  let done = 0, fail = 0; onTick(0, want.length, 0);
  const eng = want.length ? await gameEngine().catch(() => null) : null;
  for (const j of want) {
    try { const imgs = await genTeaseImage(c, j, { eng, debug }); if (imgs) S = { ...S, images: imgs }; }
    catch (e) { fail++; debug(`換妻：動作圖 ${j.key} 失敗：${e?.message || e}`); }
    onTick(++done, want.length, fail);
  }
  return S;
}
