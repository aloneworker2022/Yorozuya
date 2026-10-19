/* 日租女友・旅館的「生圖帶節奏」流程（2026-10-19 Al）：不再是固定 20 秒一段，而是跟著生成走。
 *   ① 開車路上：AI 旁白（打字機一個字一個字）＋同時即時生第一段（接吻）的圖；兩個都好了才到玄關。
 *   ② 進房：這一段開始 → 生兩人的對話；對話好了 → 生下一段的圖。
 *   ③ 下一段的圖好了（或失敗／逾時）→ 每 ADV_CHECK_MS 擲一次 ADV_P 換下一段；等滿 ADV_MAX_MS 一定換（不會卡住）。
 *      換之前：做愛的段落先「她高潮」（下一張圖好了之後）→ 決定換時「內射」停 CUM_MS → 下一段。
 *   段落順序照 rental_session.planSession（接吻 → 邊親邊脫 → 隨機姿勢、每段內射、做完 1/3 退房）。每一段＝遊戲時間 10 分鐘。
 *   已經有的圖（這個她＋這個客人）直接用，不重生。 */
import { generateVenue } from "./rental_scene_gen.js?v=14";
import { loadImages, pickUrls, fetchTalk, slotKey, ACT_SLOT_KEYS, LOC_ZH, POSE_ZH, ACTION_GAME_MIN } from "./rental_session.js?v=8";

export const GEN_TIMEOUT_MS = 240e3;   // 一張圖最多等 4 分鐘，之後當沒有圖照走
export const TALK_TIMEOUT_MS = 30e3;   // 對話最多等 30 秒（伺服器 20 秒就會給保底句）
export const MIN_SCENE_MS = 20e3;      // 每一段至少演 20 秒
export const ADV_CHECK_MS = 5e3;       // 下一張好了之後每 5 秒擲一次
export const ADV_P = 0.35;             // 每次 35% 換下一段（平均約 14 秒）
export const ADV_MAX_MS = 45e3;        // 下一張好了之後最多再等 45 秒，一定換
export const CUM_MS = 6e3;             // 內射那一刻停 6 秒再換
const NARR_CPS = 14;                   // 打字機：每秒 14 個字

const withTimeout = (p, ms, v) => Promise.race([p, new Promise((r) => setTimeout(() => r(v), ms))]);

/** 這一段的圖：已經有（這個她＋這個客人／她）就直接用；沒有就生一張（第 1 張的模板）。回 url 或 ""。 */
export async function ensureActImage(venue, key, girl, client, owners, debug) {
  const m = await loadImages(true);
  const have = pickUrls(m, venue, key, owners.slice(0, 1));
  if (have.length) return have[0];
  if (!girl?.id) return "";
  const job = generateVenue(venue, { girl, client, keys: [key], perSlot: 1, owners: owners.slice(0, 1) })
    .then((items) => items.find((x) => x.url)?.url || "").catch((e) => { debug?.(`旅館圖（${key}）失敗：${e?.message || e}`); return ""; });
  return withTimeout(job, GEN_TIMEOUT_MS, "");
}

/** ① 開車路上：旁白打字機＋生第一段的圖；兩個都好了才 resolve。回 { text, firstUrl }。 */
export function openDrive({ venue, venueZh, girl, client, girlInfo, clientInfo, owners, firstKey = "bed_kiss", debug }) {
  const ov = document.createElement("div");
  ov.className = "rent-drive";
  ov.style.cssText = "position:fixed;inset:0;z-index:9000;background:#05060a;color:#e8e2d8;display:flex;flex-direction:column;justify-content:center;padding:10% 8%;font:16px/1.8 'Fusion Pixel',system-ui,sans-serif";
  ov.innerHTML = `<div style="color:#8a90a8;font-size:13px;margin-bottom:12px"></div><div class="tx" style="white-space:pre-wrap;min-height:40%"></div><div class="st" style="color:#6f7590;font-size:12px;margin-top:14px"></div>`;
  ov.firstChild.textContent = `開車前往 ${venueZh || "旅館"}……`;
  document.body.append(ov);
  const tx = ov.querySelector(".tx"), st = ov.querySelector(".st");
  const narr = withTimeout(fetch("/api/rental/drive-narration", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue, girl: girlInfo, client: clientInfo }) })
    .then((r) => r.json()).then((j) => String(j.text || "")).catch(() => ""), 25e3, "")
    .then((t) => t || "車窗外的燈一盞一盞往後退。後座的兩個人靠得很近，你假裝專心看路。");
  const typed = narr.then((t) => new Promise((done) => {
    let i = 0; const tick = () => { tx.textContent = t.slice(0, ++i); if (i < t.length) setTimeout(tick, 1000 / NARR_CPS); else done(t); }; tick();
  }));
  st.textContent = "（快到了……）";
  const img = ensureActImage(venue, firstKey, girl, client, owners, debug).then((u) => { st.textContent = u ? "到了。" : "到了。（這段的圖沒生出來，先不管）"; return u; });
  return Promise.all([typed, img]).then(([text, firstUrl]) => new Promise((ok) => setTimeout(() => { ov.remove(); ok({ text, firstUrl }); }, 900)));
}

const runners = new Map();
/** ② ③ 房間裡的節奏。session＝planSession 的結果（acts 已經擲好）。同一場重開房間沿用同一個 runner。
 *  回 { state() → {i, act, done, cums, phase, gameMin}, talkLines(i), stop() }。 */
export function getRunner(session, ctx) {
  const id = String(session.startAt);
  if (runners.has(id)) return runners.get(id);
  const { venue, girl, client, owners, talkBase = {}, debug } = ctx;
  const acts = session.acts;
  const S = { i: Number(session.i) || 0, phase: "", sceneAt: Date.now(), readyAt: 0, decideAt: 0, talk: {}, done: false, timer: 0, stopped: false };
  const isAct = (a) => ACT_SLOT_KEYS.includes(slotKey(a));
  const startScene = () => {
    if (S.stopped) return;
    if (S.i >= acts.length) { S.done = true; session.i = acts.length; ctx.onDone?.(); return; }
    session.i = S.i; ctx.onScene?.(S.i);
    S.phase = ""; S.sceneAt = Date.now(); S.readyAt = 0; S.decideAt = 0;
    const i = S.i, act = acts[i], cums = acts.slice(0, i).filter((a) => a.cum).length;
    debug?.(`旅館流程：第 ${i + 1} 段 ${LOC_ZH[act.loc]}・${POSE_ZH[act.pose]}（生對話）`);
    // 這一段開始 → 生對話；好了 → 生下一段的圖
    withTimeout(fetchTalk({ ...talkBase, venue, loc: act.loc, pose: act.pose, step: i + 1, cums }), TALK_TIMEOUT_MS, null)
      .then((j) => { S.talk[i] = j?.lines || []; })
      .then(() => {
        if (S.stopped || S.i !== i) return;
        const nx = acts[i + 1];
        if (!nx) { S.readyAt = Date.now(); return; }
        debug?.(`旅館流程：生下一段（${LOC_ZH[nx.loc]}・${POSE_ZH[nx.pose]}）的圖`);
        return ensureActImage(venue, slotKey(nx), girl, client, owners, debug).then(() => { if (S.i === i) S.readyAt = Date.now(); });
      });
  };
  const tick = () => {
    if (S.stopped || S.done) return;
    const now = Date.now();
    if (S.decideAt) {
      if (now - S.decideAt >= (isAct(acts[S.i]) ? CUM_MS : 0)) { S.i++; startScene(); }
    } else if (S.readyAt && now - S.sceneAt >= MIN_SCENE_MS) {
      if (isAct(acts[S.i])) S.phase = "orgasm";
      const waited = now - S.readyAt;
      if (waited >= ADV_MAX_MS || (waited >= ADV_CHECK_MS && Math.random() < ADV_P)) {
        S.decideAt = now; if (isAct(acts[S.i])) S.phase = "cum";
      }
    }
    S.timer = setTimeout(tick, ADV_CHECK_MS / 5);
  };
  const R = {
    state() {
      if (S.done || S.i >= acts.length) return { i: acts.length, act: null, done: true, cums: acts.filter((a) => a.cum).length, phase: "", gameMin: acts.length * ACTION_GAME_MIN };
      return { i: S.i, act: acts[S.i], done: false, cums: acts.slice(0, S.i).filter((a) => a.cum).length, phase: S.phase, gameMin: S.i * ACTION_GAME_MIN, left: 1 };
    },
    talkLines(i) { return (S.talk[i] || []).slice(); },
    stop() { S.stopped = true; clearTimeout(S.timer); runners.delete(id); },
  };
  runners.set(id, R);
  startScene(); tick();
  return R;
}
