/* 2026-10-22 換妻：雙人半身互動圖（你老婆＋對方丈夫）— 只做 test_room 測試，還沒接進場景。
 * 同咖啡廳立繪那條路：/api/imggen（她＝character＋lock_identity＋她自己的模型）→ 綠幕 → /api/cutout chroma → 存 /api/swap/cafe/image。
 * 長相：她的臉／髮／胸／身材 tags 由伺服器從她的人設組（跟她的單人立繪同一套）；對方丈夫用他單人立繪同一組描述（manInfo）寫進 extra。
 * 模型：用她自己綁的 comfyCkpt（沒綁才退全域）。理由：長相鎖只鎖得住她（伺服器用她的人設＋她的模型組 tag），男方只有文字描述，換哪個模型都一樣；
 *       而且她的模型就是她單人立繪那個，畫風才對得上。對方丈夫自己的 ckpt 不用。
 * 存：owner＝「她 id.couple id」（一對夫妻配一個老婆），key＝pair~<act>（交配三個動作 pair~<act>~1／~2，存 seed，第 2 格沿用第 1 格的 seed）；已有的不重生（missingPairs）。 */
import { gameEngine } from "./rental_scene_gen.js?v=17";
import { api, wornOutfit, waitImg, chromaKeyData, CHROMA } from "./swap_cafe_gen.js?v=26";

// 2026-10-23 Al 核可：雙人圖預設 prompt 全部改結構（只有雙人圖）。前端給「每段要什麼 tag」（pair 物件），伺服器組成
//   [品質], 1boy, 1girl, hetero, <取景>, [from side（只有 side:true 的動作；聊天／接吻不加，會畫成背對背）], <動作>, (green background:1.3), (simple background:1.2), green screen, chroma key
//   BREAK 1boy, <他：年紀、髮、臉、身材、鬍子、體毛、膚色、衣服、他的姿勢>
//   BREAK 1girl, adult, <她：身材、髮色＋髮型、瞳色、特徵、膚色（伺服器從人設翻）>, <她的姿勢>, <表情>, <衣服>, <露點 tags>
// 品質 tag 伺服器看模型名（pony→score_9…；其他→masterpiece…）；負向＝這裡給的原樣（去重）。BREAK 由 comfy.py 分段編碼再 ConditioningConcat。
// framing：half＝upper body；wide＝wide shot, full body（口交／舔／交配）。clothes：dressed｜partial｜nude。
export const PAIR_ACTS = [
  { key: "chat", zh: "聊天", scene: "ktv", framing: "half", rating: "sfw", clothes: "dressed",
    act: "facing another, looking at another, eye contact, sitting, conversation, smile, holding cup", his: "facing another, leaning forward, hand on another's shoulder", her: "facing another, looking at another, smile, blush", expr: "smile, blush", neg: "back-to-back, looking away" },
  { key: "kiss", zh: "接吻", scene: "ktv", framing: "half", rating: "sfw", clothes: "dressed",
    act: "kiss, face to face, facing another, embrace, closed eyes", neg: "back-to-back, looking away", his: "hand on another's cheek", her: "hand on another's chest", expr: "closed eyes, blush" },
  { key: "grope", zh: "摸胸部", scene: "ktv", framing: "half", rating: "nsfw", clothes: "dressed", side: true,
    act: "grabbing another's breast, from behind, groping, blush", his: "standing behind, hands on another's breasts", her: "standing", expr: "blush, embarrassed, open mouth", body: "breasts" },
  { key: "fellatio", zh: "口交", scene: "ktv", framing: "wide", rating: "nsfw", clothes: "partial", side: true,
    act: "fellatio, kneeling, penis, hand on another's head", his: "standing, hand on another's head", her: "kneeling, looking up", expr: "blush", hisCl: "pants down, penis", herCl: "open shirt", body: "penis" },
  { key: "cunni", zh: "舔陰唇", scene: "ktv", framing: "wide", rating: "nsfw", clothes: "partial", side: true,
    act: "cunnilingus, spread legs, sitting, head between thighs", his: "kneeling, head between thighs", her: "sitting, spread legs, head back", expr: "blush, open mouth", herCl: "skirt lift, panties aside", body: "pussy" },
  // 三個交配動作各兩格（同 seed）：第 1 格還沒插入、第 2 格插到底猛撞
  // 2026-10-23 正常體位：他跪直不壓上去、雙手抓她張開的大腿
  { key: "normal", zh: "正常體位", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude", side: true, his: "kneeling, upright, holding another's legs, leg grab", her: "lying, on back, spread legs, legs up", body: "nipples, pussy" },
  { key: "behind", zh: "背後", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude", side: true, his: "kneeling, hands on another's hips", her: "all fours, looking back", body: "nipples, pussy" },
  { key: "seated", zh: "面對面坐著擁吻交配", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude", side: true, his: "sitting", her: "straddling, arms around neck", body: "nipples, pussy" },
];
export const PAIR_KEYS = PAIR_ACTS.map((a) => a.key);
// 2026-10-23 Al：第 1 格停 2 秒、第 2 格（插入）停 0.6 秒；第 2 格出現時「大力震一下」：一下大位移＋放大、SLAM_MS 內回穩（不連續抖）
export const FRAME1_MS = 2000, FRAME2_MS = 600, SLAM_MS = 200, SLAM_PX = 18;
// 第 2 格共用：男方用力撞（shared 段／1boy 段各加，tag 不寫句子）
const F2_SLAM = "hard thrust, (thrusting:1.2), hip slam, forceful sex, motion lines, sweat";
const F2_EXPR = "tongue out, ahegao, tears, rolling eyes";
export const PAIR_FRAMES = {
  // 2026-10-23 第 1 格改成龜頭剛進去（淺插），負向擋整根插入
  normal: [{ act: "sex, vaginal, kneeling, upright, leg grab, holding another's thighs, spread legs, on back, tip insertion, shallow penetration, glans, partially inserted", expr: "blush, nervous", zh: "龜頭剛進去", neg: "deep penetration, full insertion, lying on another, on top, missionary" },
    { act: `sex, vaginal, kneeling, upright, leg grab, holding another's thighs, spread legs, on back, deep penetration, full insertion, ${F2_SLAM}`, his: "thrusting, hips forward, grabbing another's thighs", expr: F2_EXPR + ", pained expression, open mouth", neg: "lying on another, missionary, tip insertion" }],
  behind: [{ act: "doggystyle, all fours, penis, imminent penetration, looking back", expr: "blush, nervous" },
    { act: `doggystyle, sex from behind, vaginal, deep penetration, ${F2_SLAM}`, his: "thrusting, hips forward, grabbing another's hips", expr: F2_EXPR }],
  seated: [{ act: "straddling, upright straddle, sitting on lap, imminent penetration, kiss", expr: "blush, nervous, kiss" },
    { act: `straddling, sex, vaginal, deep penetration, ${F2_SLAM}`, his: "thrusting, hips up, grabbing another's hips", expr: F2_EXPR }],
};
/** 要生的格子：一般動作一格（pair~chat），交配動作兩格（pair~normal~1／~2）。共 5＋3×2＝11。（2026-10-23 傳教士刪了：容易出錯） */
export const PAIR_SLOTS = PAIR_ACTS.flatMap((a) => (PAIR_FRAMES[a.key] ? [`${a.key}~1`, `${a.key}~2`] : [a.key]));
const slotOf = (slot) => { const [act, f] = String(slot).split("~"); return { act, frame: f ? Number(f) : 0 }; };
const ACT = Object.fromEntries(PAIR_ACTS.map((a) => [a.key, a]));
const FRAME_EN = { half: "upper body", wide: "wide shot, full body" };
// 他：年紀／個性（髮、臉、鬍子）／身材／衣服（跟她的衣服用不同字）
const MAN_AGE = (a) => (a >= 50 ? "old man" : a >= 30 ? "mature male" : "");
const MAN_LOOK = { gentleman: "short hair, black hair, clean-shaven", clingy: "short hair, smile", showoff: "slicked back hair, stubble", dominant: "short hair, stubble, sharp eyes", otaku: "messy hair, glasses" };
const MAN_BODY = { average: "", slim: "skinny", muscular: "muscular male", fat: "fat man, belly", tall: "tall male", short: "short", old: "old man, receding hairline" };
const MAN_CL = { gentleman: "black suit, necktie", clingy: "polo shirt", showoff: "leather jacket, gold necklace", dominant: "black suit, open collar", otaku: "plaid shirt" };
const MAN_HAIRY = new Set(["fat", "old", "muscular"]);
const NEG_BASE = "pov, first-person view, male pov, faceless male, solo, 2girls, multiple girls, 2boys, worst quality, low quality, lowres, bad anatomy, bad hands, extra fingers, extra limbs, watermark, text, green clothes, green hair, green eyes, background scenery";
// 2026-10-23 綠幕沒效果：補回背景負向（半身再擋床；寬景要躺／坐，不擋 bed，改擋白床單）
const BG_NEG = "white background, gradient background, detailed background, scenery, room, floor, shadow, grey background";
const dedupe = (...xs) => { const seen = new Set(); return xs.join(", ").split(",").map((t) => t.trim()).filter((t) => t && !seen.has(t.toLowerCase()) && seen.add(t.toLowerCase())); };

/** 這對（她＋這對夫妻）的 owner：只留伺服器允許的字、最長 80。 */
export const pairOwner = (wife, couple) => `${wife?.id || ""}.${couple?.id || ""}`.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 80);
/** 每段的 tag（伺服器的 _pair_prompts 照這個組；她的長相＋品質 tag 由伺服器補）。 */
export function pairPrompt(slot, wife, couple) {
  const { act: actKey, frame } = slotOf(slot), fr = frame ? PAIR_FRAMES[actKey]?.[frame - 1] : null;
  const a = ACT[actKey]; if (!a) throw new Error(`沒有這個動作 ${actKey}`);
  const h = couple?.husband || {}, nude = a.clothes === "nude";
  const male = dedupe(MAN_AGE(Number(h.age) || 0), MAN_LOOK[h.persona] || "short hair", MAN_BODY[h.build] || "", nude && MAN_HAIRY.has(h.build) ? "chest hair" : "", "tanned male",
    nude ? "nude" : a.clothes === "partial" ? [MAN_CL[h.persona] || "dress shirt", a.hisCl || ""].filter(Boolean).join(", ") : MAN_CL[h.persona] || "dress shirt", a.his || "", fr?.his || "");
  const herCl = nude ? "nude" : a.clothes === "partial" ? a.herCl || "clothes pull" : "";   // dressed＝伺服器翻她的生涯服裝
  const body = dedupe(a.body || "");   // 2026-10-23 胸／私密部位改由伺服器從她的人設翻（跟單人立繪同一份表），這裡只給動作要露的部位
  const neg = dedupe(NEG_BASE, BG_NEG, a.framing === "half" ? "bed" : "white sheets", a.neg || "", fr?.neg ?? (frame === 1 ? "penetration, sex" : ""), a.clothes === "dressed" ? "nude, nipples" : "");
  return {
    framing: FRAME_EN[a.framing], fromSide: !!a.side, shared: dedupe(fr?.act || a.act), male, herPose: dedupe(a.her || ""), expr: dedupe(fr?.expr || a.expr || ""),
    herClothes: herCl, dressed: a.clothes === "dressed", clothes: a.clothes, body, neg,
  };
}
/** /api/imggen body：她當 character（伺服器從她的人設翻長相 tags）、她的模型；pair＝每段的 tag。 */
export function pairBody(slot, wife, couple, eng, seed) {
  const actKey = slotOf(slot).act;
  if (!wife?.id) throw new Error("先選測試魅子"); if (!couple?.husband) throw new Error("先抽一對對方夫妻");
  const a = ACT[actKey], comfy = eng.imgProvider === "comfy", pair = pairPrompt(slot, wife, couple);
  const ckpt = String(wife.comfyCkpt || "").trim() || eng.comfyCkpt || "";
  if (comfy && !ckpt) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt），全域也沒設");
  return {
    key: `swap-pair:${String(slot).replace("~", "-")}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, provider: comfy ? "comfy" : "grok-img", model: eng.imgModel, style: eng.imgStyle,
    framing: a.framing === "half" ? "half" : "full", rating: a.rating, negative: pair.neg.join(", "), visual_neg: "", cutout: false, flat_bg: false, retry: true, seed,
    character: wife, outfit: a.clothes === "dressed" ? wornOutfit(wife) : "", extra: "", prompt: "", lock_identity: true, char_id: wife.id, pair,
    ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}
export const missingPairs = (S, wife, couple) => { const have = S?.images?.[pairOwner(wife, couple)] || {}; return PAIR_SLOTS.filter((k) => !have[`pair~${k}`]?.cut); };
/** 生一格（綠幕→色鍵→存，seed 一起存，第 2 格拿第 1 格的 seed）；seed 不給＝隨機。回新的 images。 */
// ---- 去背（雙人圖專用：量四邊綠的比例，存進紀錄給測試台看）
const loadImg2 = (url) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error("圖載不到")); im.src = url; });
/** 瀏覽器色鍵＋量：四邊像素有幾成是綠的（G−max(R,B) > 16）、摳掉幾成。 */
async function browserCutMeasured(url) {
  const im = await loadImg2(url), c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0); const d = chromaKeyData(g.getImageData(0, 0, c.width, c.height));
  g.putImageData(d, 0, 0);
  return { data: c.toDataURL("image/png"), border_green: d.chroma.border_green, removed: d.chroma.removed };
}
const cutOk = (bgreen, removed) => bgreen >= 0.5 && removed >= 0.05;
/** 伺服器色鍵 → 不行就瀏覽器；回 {cut|cut_data, how, cutinfo:{ok, how, border_green, removed, why}}。 */
export async function cutPair(url, say = () => {}) {
  try {
    say("綠幕去背（伺服器）……");
    const r = await fetch("/api/cutout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, mode: "chroma" }) });
    if (r.ok) { const j = await r.json();
      if (j.changed && cutOk(j.border_green ?? 1, j.removed ?? 1)) return { cut: j.url, how: "伺服器綠幕去背", cutinfo: { ok: true, how: "伺服器綠幕去背", border_green: j.border_green, removed: j.removed, why: j.why } };
      say(`伺服器去背沒效果（${j.why || ""}），改用瀏覽器……`); }
  } catch { /* */ }
  const b = await browserCutMeasured(url), ok = cutOk(b.border_green, b.removed);
  return { cut_data: b.data, how: "瀏覽器綠幕去背", cutinfo: { ok, how: "瀏覽器綠幕去背", border_green: b.border_green, removed: b.removed, why: ok ? "" : "四邊綠太少：模型沒畫綠底" } };
}
/** 重新去背（不重生）：伺服器拿已存原圖重摳；沒效果就瀏覽器摳完傳上去。回新的 images。 */
export async function recutPair(owner, slot, raw, say = () => {}) {
  const post = (b) => fetch("/api/swap/cafe/recut", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner, key: `pair~${slot}`, ...b }) })
    .then(async (r) => { if (!r.ok) throw new Error(`重新去背失敗 ${r.status}（伺服器要重啟？）`); return r.json(); });
  say("重新去背（伺服器）……");
  const j = await post({});
  if (j.changed && cutOk(j.border_green ?? 0, j.removed ?? 0)) return { images: j.images, ok: true, border_green: j.border_green };
  say("伺服器沒摳到，改用瀏覽器……");
  const b = await browserCutMeasured(raw), ok = cutOk(b.border_green, b.removed);
  const k = await post({ cut_data: b.data, cutinfo: { ok, how: "瀏覽器綠幕去背", border_green: b.border_green, removed: b.removed, why: ok ? "" : "四邊綠太少：模型沒畫綠底" } });
  return { images: k.images, ok, border_green: b.border_green };
}
export async function genPair(slot, wife, couple, say = () => {}, seed = 0, edit = null) {
  const eng = await gameEngine(), t0 = Date.now(); seed = Number(edit?.seed) || seed || Math.floor(Math.random() * 2 ** 31) || 1;
  let body = pairBody(slot, wife, couple, eng, seed);
  // 2026-10-22 測試台「用這些設定重生」：正負向原文（伺服器 raw_prompt＝一個字都不加）、steps／cfg、起始圖＋denoise
  if (edit && String(edit.pos || "").trim()) {
    body = { ...body, prompt: String(edit.pos).trim(), negative: String(edit.neg || "").trim(), visual_neg: "", lead: "", extra: "", pair: null, raw_prompt: true,
      ...(Number(edit.steps) > 0 ? { steps: Number(edit.steps) } : {}), ...(Number(edit.cfg) > 0 ? { cfg: Number(edit.cfg) } : {}),
      ...(edit.ref ? { pose_ref: edit.ref, pose_denoise: Math.min(1, Math.max(0.05, Number(edit.denoise) || 0.6)) } : {}) };
  }
  say(`生圖（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、seed ${seed}${body.raw_prompt ? "、自訂 prompt" : ""}${body.pose_ref ? `、圖生圖 ${body.pose_denoise}` : ""}）`);
  const res = await waitImg(body, (s) => say(`生圖 ${s} 秒`));
  if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
  const raw = String(res.result).split("|")[0], { cutinfo, how, ...cut } = await cutPair(raw, say);
  const j = await api.put("image", { owner: pairOwner(wife, couple), key: `pair~${slot}`, raw, seed, sec: Math.round((Date.now() - t0) / 1000), cutinfo, ...cut }, "POST");
  return { images: j.images, sec: Math.round((Date.now() - t0) / 1000), how: `${how}${cutinfo.ok ? "" : "（失敗）"}・四邊綠 ${Math.round((cutinfo.border_green || 0) * 100)}%`, seed };
}
/** 預設 prompt（伺服器照生圖同一條路組好的最終正負向，不生圖）。 */
export async function previewPair(slot, wife, couple) {
  const eng = await gameEngine(), body = pairBody(slot, wife, couple, eng, 1);
  const r = await fetch("/api/swap/pair/preview", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(`預設 prompt 拿不到 ${r.status}（伺服器要重啟？）`);
  return r.json();
}
export async function saveEdit(owner, slot, edit) {
  const r = await fetch("/api/swap/cafe/edit", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ owner, key: `pair~${slot}`, edit }) });
  if (!r.ok) throw new Error(`設定存不了 ${r.status}（伺服器要重啟？）`);
  return r.json();
}
/** 跑一串格子（依序）時的 seed：第 1 格新抽（這一輪記住），第 2 格用這輪的第 1 格、沒有就用已存的第 1 格。 */
export function seedFor(slot, have, runSeeds) {
  const { act, frame } = slotOf(slot);
  if (frame === 2) return runSeeds[act] || Number(have?.[`pair~${act}~1`]?.seed) || 0;
  return 0;
}

// ---- 兩格輪播播放器（test grid 用；之後場景也可以直接拿去用）
let slamCss = false;
function ensureSlamCss() {
  if (slamCss || typeof document === "undefined") return; slamCss = true;
  // 一下重撞：0→12% 猛推（下沉＋放大）→ 35% 小反彈 → 100% 回穩；只跑一次
  const px = SLAM_PX, T = (x, y, sc) => `transform:translateX(-50%) translate(${x}px,${y}px) scale(${sc})`;
  const st = document.createElement("style");
  st.textContent = `@keyframes swpSlam{0%{${T(0, 0, 1)}}12%{${T(px * 0.35, px, 1.07)}}35%{${T(-px * 0.12, -px * 0.25, 0.985)}}60%{${T(0, px * 0.08, 1.01)}}100%{${T(0, 0, 1)}}}`
    + ` .swp-slam{animation:swpSlam ${SLAM_MS}ms cubic-bezier(.2,.9,.3,1) 1;transform-origin:50% 100%}`;
  document.head.appendChild(st);
}
/** 一直跑：第 1 格 FRAME1_MS → 第 2 格 FRAME2_MS → …；每次切換呼叫 cb(isFrame2)。回 stop()。 */
export function startPairLoop(cb) {
  let on = true, f2 = false, t = 0;
  const step = () => { if (!on) return; cb(f2); t = setTimeout(() => { f2 = !f2; step(); }, f2 ? FRAME2_MS : FRAME1_MS); };
  step(); return () => { on = false; clearTimeout(t); };
}
/** root 底下每個有 .pf1／.pf2 的格子切到對應那格；兩格都在才切，只有一格就一直顯示那格。第 2 格加撞擊晃動（第 1 格不晃）。 */
export function applyPairFrame(root, frame2) {
  ensureSlamCss();
  const cells = new Set([...root.querySelectorAll(".pf1, .pf2")].map((im) => im.parentElement));
  cells.forEach((cell) => {
    const a = cell.querySelector(".pf1"), b = cell.querySelector(".pf2");
    const show2 = a && b ? frame2 : !!b && !a;
    if (a) a.style.visibility = show2 ? "hidden" : "visible";
    if (b) { b.style.visibility = show2 ? "visible" : "hidden"; b.classList.remove("swp-slam"); if (show2 && a) { void b.offsetWidth; b.classList.add("swp-slam"); } }
  });
}

/** test_room 咖啡廳面板裡的「雙人互動圖」區塊（2026-10-22：一張一列、每張可改正負向／seed／steps／cfg／起始圖＋denoise）。
 * ctx：{ girl(), couple(), state(), setImages(images), setEdits(edits), backdrop(scene) }。 */
export function bindPairBox(ctx) {
  const $ = (id) => document.getElementById(id), grid = $("sc-pair-grid"), st = $("sc-pair-status");
  if (!grid) return null;
  let busy = false, cells = {}, builtFor = "";
  const say = (x) => { if (st) st.textContent = x; };
  const owner = () => pairOwner(ctx.girl(), ctx.couple());
  const imgs = () => ctx.state()?.images?.[owner()] || {};
  const edits = () => ctx.state()?.edits?.[owner()] || {};
  const esc = (x) => String(x ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const box = (title, text) => `<details style="margin:2px 0"><summary class="mini" style="cursor:pointer">${title}</summary><pre class="mini" style="white-space:pre-wrap;word-break:break-word;max-height:14em;overflow:auto;margin:2px 0;padding:4px;background:#0c0c10;border-radius:4px;user-select:text">${esc(text)}</pre></details>`;
  const labelOf = (k) => { const { act, frame } = slotOf(k); return ACT[act].zh + (frame ? ` 第${frame}格（${PAIR_FRAMES[act]?.[frame - 1]?.zh || (frame === 1 ? "還沒插入" : "插到底")}）` : ""); };
  const info = (im) => {
    if (!im) return "";
    const g = im.gen || {};
    if (!g.positive) return `<div class="mini" style="color:#a88">（這張是舊版生的，沒有存實際 prompt；重生才會有）${g.sec ? `・${g.sec} 秒` : ""}${im.seed ? `・seed ${im.seed}` : ""}</div>`;
    const ref = g.pose_ref ? `<span style="display:flex;gap:4px;align-items:center"><img src="${esc(g.pose_ref)}" alt="" style="width:36px;height:54px;object-fit:cover;border-radius:3px">${esc(g.pose_ref.split("/").pop())}</span>` : `<span>none</span>`;
    const rows = [["checkpoint", g.ckpt || "（沒指定：伺服器自己挑）"], ["seed", g.seed], ["steps", g.steps], ["cfg", g.cfg], ["sampler", `${g.sampler || ""}${g.scheduler ? " / " + g.scheduler : ""}${g.clip_skip ? `（clip skip ${g.clip_skip}）` : ""}`],
      ["size", g.width && g.height ? `${g.width}×${g.height}` : ""], ["denoise", g.denoise == null ? "—（沒有用圖生圖）" : g.denoise], ["prompt", g.raw ? "自訂（原樣送出）" : "預設（伺服器組）"], ["去背", im.cutinfo ? `${im.cutinfo.ok ? "成功" : "失敗"}　綠色比例 ${im.cutinfo.border_green == null ? "?" : Math.round(im.cutinfo.border_green * 100) + "%"}${im.cutinfo.removed == null ? "" : `（摳掉 ${Math.round(im.cutinfo.removed * 100)}%）`}・${im.cutinfo.how || ""}${im.cutinfo.why ? "・" + im.cutinfo.why : ""}` : "（舊紀錄沒量）"],
      ["time", `${g.sec ? g.sec + " 秒" : "?"}${g.at ? `（${new Date(g.at * 1000).toLocaleString()}）` : ""}`]];
    return `<div class="mini" style="display:grid;grid-template-columns:auto 1fr;gap:0 6px;margin-top:4px">${rows.map(([k, v]) => `<span style="color:#888">${k}</span><span style="word-break:break-all">${esc(v)}</span>`).join("")}<span style="color:#888">ref</span>${ref}</div>`
      + box(`上次送出的正向（${g.positive.length} 字）`, g.positive) + box(`上次送出的負向（${(g.negative || "").length} 字）`, g.negative || "");
  };
  // 起始圖選項：沒有／同動作另一格／這對的其他雙人圖／她的半身立繪／上傳
  const refOptions = (k) => {
    const { act, frame } = slotOf(k), have = imgs(), w = ctx.girl(), out = [["", "none（不用圖生圖）"]];
    if (frame) { const o = `${act}~${frame === 1 ? 2 : 1}`; if (have[`pair~${o}`]?.raw) out.push([have[`pair~${o}`].raw, `同動作的${labelOf(o)}`]); }
    for (const s2 of PAIR_SLOTS) if (s2 !== k && have[`pair~${s2}`]?.raw && !out.some(([u]) => u === have[`pair~${s2}`].raw)) out.push([have[`pair~${s2}`].raw, `雙人圖：${labelOf(s2)}`]);
    const solo = ctx.state()?.images?.[w?.id || ""] || {};
    for (const [kk, zh] of [["wife~normal", "一般"], ["wife~shy", "害羞"]]) if (solo[kk]?.raw) out.push([solo[kk].raw, `她的換妻半身立繪（${zh}）`]);
    for (const [kk, zh] of [["half", "半身"], ["full", "全身"]]) { const u = String(w?.portraits?.[kk] || "").split("?")[0]; if (u.startsWith("/assets/portraits/")) out.push([u, `她的遊戲立繪（${zh}）`]); }
    return out;
  };
  const build = () => {
    cells = {}; builtFor = owner(); stopLoops();
    grid.replaceChildren(...PAIR_SLOTS.flatMap((k) => {
      const { act, frame } = slotOf(k), a = ACT[act], el = document.createElement("div");
      el.dataset.k = k; el.style.cssText = "border:1px solid #333;border-radius:8px;padding:6px;background:#141418;min-width:0";
      el.innerHTML = `<div class="mini" style="display:flex;justify-content:space-between;gap:4px"><b style="font-size:14px">${esc(labelOf(k))}</b><span>${a.scene === "ktv" ? "KTV" : "飯店"}</span></div>
        <div class="pic" style="position:relative;width:100%;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:url(${ctx.backdrop(a.scene)}) center/cover"></div>
        <div class="links mini" style="margin:2px 0"></div><div class="msg mini" style="white-space:pre-wrap;color:#aaa"></div><div class="info"></div>
        <details class="ed" style="margin-top:4px" open><summary style="cursor:pointer;font-size:13px">設定（改完按「用這些設定重生」）</summary>
          <label class="mini">正向（原樣送出，伺服器不加字）</label><textarea class="pos" rows="8" style="width:100%;font-size:12px;box-sizing:border-box"></textarea>
          <label class="mini">負向（原樣送出）</label><textarea class="neg" rows="5" style="width:100%;font-size:12px;box-sizing:border-box"></textarea>
          <label class="mini">起始圖（圖生圖）</label><div style="display:flex;gap:6px;align-items:center"><select class="ref" style="flex:1;min-width:0;font-size:12px"></select><img class="refth" alt="" style="width:40px;height:60px;object-fit:cover;border-radius:3px;display:none"></div>
          <div class="mini" style="margin:2px 0">或上傳：<input type="file" class="file" accept="image/*" style="max-width:14em"></div>
          <div style="display:flex;gap:6px;align-items:center"><label class="mini">denoise</label><input type="range" class="dn" min="0.05" max="1" step="0.05" style="flex:1"><input type="number" class="dnn" min="0.05" max="1" step="0.05" style="width:4.5em"></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center;margin-top:2px"><label class="mini">seed <input type="number" class="seed" min="0" style="width:8.5em" placeholder="空＝隨機"></label><button type="button" class="mini rnd">🎲</button>
            <label class="mini">steps <input type="number" class="steps" min="1" max="150" style="width:4em"></label><label class="mini">cfg <input type="number" class="cfg" min="1" max="30" step="0.5" style="width:4em"></label></div>
          <div style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px"><button type="button" class="go bp-cy">用這些設定重生</button><button type="button" class="reset mini">還原預設 prompt</button>${frame === 1 ? `<button type="button" class="both mini">兩格都重生（同 seed）</button>` : ""}</div>
        </details>`;
      const q = (c) => el.querySelector(c);
      const syncDn = (v) => { const x = Math.min(1, Math.max(0.05, Number(v) || 0.6)); q(".dn").value = String(x); q(".dnn").value = x.toFixed(2); };
      q(".dn").addEventListener("input", () => syncDn(q(".dn").value)); q(".dnn").addEventListener("change", () => syncDn(q(".dnn").value));
      q(".rnd").addEventListener("click", () => { q(".seed").value = String(Math.floor(Math.random() * 2 ** 31) || 1); });
      q(".ref").addEventListener("change", () => refThumb(k));
      q(".file").addEventListener("change", async (e) => {
        const file = e.target.files?.[0]; if (!file) return; const fd = new FormData(); fd.append("file", file, file.name);
        try { const r = await fetch("/api/pose-refs", { method: "POST", body: fd }); if (!r.ok) throw new Error(`上傳失敗 ${r.status}`); const u = (await r.json()).url;
          const o = document.createElement("option"); o.value = u; o.textContent = `上傳：${u.split("/").pop()}`; q(".ref").appendChild(o); q(".ref").value = u; refThumb(k); setMsg(k, "上傳好了"); } catch (er) { setMsg(k, String(er?.message || er)); }
      });
      q(".go").addEventListener("click", () => void run([k]));
      q(".both")?.addEventListener("click", () => void run([`${act}~1`, `${act}~2`], true));
      q(".reset").addEventListener("click", async () => {
        try { setMsg(k, "拿預設 prompt……"); const d = await saveEdit(owner(), k, null); ctx.setEdits(d.edits || {}); const p = await previewPair(k, ctx.girl(), ctx.couple());
          q(".pos").value = p.positive; q(".neg").value = p.negative; setMsg(k, "已還原成預設 prompt（seed／steps／cfg／起始圖沒動）"); } catch (er) { setMsg(k, String(er?.message || er)); }
      });
      cells[k] = el;
      return frame === 2 ? [el, loopCard(act)] : [el];
    }));
    for (const k of PAIR_SLOTS) fill(k);
  };
  // 2026-10-23 輪播預覽：跟遊戲同一個 startPairLoop／applyPairFrame，飯店背景＋兩格去背圖疊上去
  const loops = {};
  const stopLoops = () => { for (const a of Object.keys(loops)) { loops[a].stop?.(); delete loops[a]; } };
  const loopCard = (act) => {
    const el = document.createElement("div");
    el.style.cssText = "border:1px solid #446;border-radius:8px;padding:6px;background:#121620;min-width:0";
    el.innerHTML = `<div class="mini" style="display:flex;justify-content:space-between;gap:4px"><b style="font-size:14px">${esc(ACT[act].zh)} 輪播預覽</b><span>${FRAME1_MS / 1000}s ／ ${FRAME2_MS / 1000}s＋撞</span></div>
      <div class="lp" style="position:relative;width:100%;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:url(${ctx.backdrop("hotel")}) center/cover"><div class="cell" style="position:absolute;inset:0"></div></div>
      <div style="display:flex;gap:6px;align-items:center;margin-top:4px"><button type="button" class="play bp-cy">▶ 播放</button><span class="lmsg mini" style="color:#aaa"></span></div>`;
    const btn = el.querySelector(".play"), cell = el.querySelector(".cell"), msg = el.querySelector(".lmsg");
    const stop = () => { loops[act]?.stop?.(); delete loops[act]; btn.textContent = "▶ 播放"; msg.textContent = ""; };
    btn.addEventListener("click", () => {
      if (loops[act]) { stop(); return; }
      const have = imgs(), u1 = have[`pair~${act}~1`]?.cut, u2 = have[`pair~${act}~2`]?.cut;
      if (!u1 || !u2) { msg.textContent = "兩格都生好（去背）才能播"; return; }
      const st = "position:absolute;left:50%;bottom:0;height:100%;width:100%;object-fit:contain;transform:translateX(-50%)";
      cell.innerHTML = `<img class="pf1" alt="" src="${esc(u1)}" style="${st}"><img class="pf2" alt="" src="${esc(u2)}" style="${st};visibility:hidden">`;
      let n = 0;
      const s0 = startPairLoop((f2) => { applyPairFrame(cell.parentElement, f2); if (f2) msg.textContent = `撞 ${++n}`; });
      loops[act] = { stop: () => { s0(); cell.innerHTML = ""; } }; btn.textContent = "■ 停止";
    });
    return el;
  };
  const setMsg = (k, x) => { const c = cells[k]; if (c) c.querySelector(".msg").textContent = x || ""; };
  const refThumb = (k) => { const c = cells[k], u = c.querySelector(".ref").value, th = c.querySelector(".refth"); th.style.display = u ? "" : "none"; if (u) th.src = u; };
  /** 把這格的設定填進表單：存過的設定 → 上次實際送出的 → 伺服器組的預設。 */
  const fill = (k) => {
    const c = cells[k], q = (x) => c.querySelector(x), e = edits()[`pair~${k}`], g = imgs()[`pair~${k}`]?.gen || {};
    const opts = refOptions(k), ref = e?.ref || g.pose_ref || "";
    if (ref && !opts.some(([u]) => u === ref)) opts.push([ref, `之前用的：${ref.split("/").pop()}`]);
    q(".ref").innerHTML = opts.map(([u, t]) => `<option value="${esc(u)}">${esc(t)}</option>`).join(""); q(".ref").value = ref; refThumb(k);
    const dn = e?.denoise ?? g.denoise ?? 0.6; q(".dn").value = String(dn); q(".dnn").value = Number(dn).toFixed(2);
    q(".seed").value = e?.seed ? String(e.seed) : ""; q(".steps").value = String(e?.steps || g.steps || ""); q(".cfg").value = String(e?.cfg || g.cfg || "");
    q(".pos").value = e?.pos || g.positive || ""; q(".neg").value = e?.neg || g.negative || "";
    if (!q(".pos").value) previewPair(k, ctx.girl(), ctx.couple()).then((p) => { if (!q(".pos").value) { q(".pos").value = p.positive; q(".neg").value = p.negative; }
      if (!q(".steps").value) q(".steps").value = String(p.steps); if (!q(".cfg").value) q(".cfg").value = String(p.cfg); }).catch((er) => setMsg(k, String(er?.message || er)));
    paint(k);
  };
  const paint = (k) => {
    const c = cells[k], im = imgs()[`pair~${k}`];
    c.querySelector(".pic").innerHTML = im ? `<img src="${im.cut}" alt="${esc(labelOf(k))}" style="position:absolute;left:0;bottom:0;width:100%;height:100%;object-fit:contain">` : `<span class="mini" style="position:absolute;inset:auto 0 45% 0;text-align:center;color:#999">還沒有</span>`;
    c.querySelector(".links").innerHTML = im?.raw ? `<a href="${im.raw}" target="_blank" rel="noopener">原圖</a> <button type="button" class="mini recut">重新去背</button>` : "";
    c.querySelector(".recut")?.addEventListener("click", async () => {
      if (busy) { setMsg(k, "還有在生，等一下"); return; }
      busy = true;
      try { const r = await recutPair(owner(), k, im.raw, (x) => setMsg(k, x)); ctx.setImages(r.images); paint(k); setMsg(k, `重新去背${r.ok ? "成功" : "失敗"}・綠色比例 ${Math.round((r.border_green || 0) * 100)}%`); }
      catch (e) { setMsg(k, String(e?.message || e)); } finally { busy = false; }
    });
    c.querySelector(".info").innerHTML = info(im);
  };
  const readEdit = (k) => {
    const c = cells[k], q = (x) => c.querySelector(x), num = (x) => (String(q(x).value).trim() === "" ? null : Number(q(x).value));
    return { pos: q(".pos").value, neg: q(".neg").value, ref: q(".ref").value, denoise: Number(q(".dnn").value) || 0.6, seed: num(".seed"), steps: num(".steps"), cfg: num(".cfg") };
  };
  const render = () => { if (!ctx.girl()?.id || !ctx.couple()) { grid.innerHTML = `<div class="mini">先選測試魅子、抽一對對方夫妻</div>`; builtFor = ""; return; } if (builtFor !== owner()) build(); else for (const k of PAIR_SLOTS) paint(k); };
  // useForm：從表單（按鈕）＝存設定＋原樣送；批次「產生缺的」＝有存過設定就用存的，沒有就走預設組法
  const run = async (keys, sameSeed = false, useForm = true) => {
    if (busy) { say("還有在生，等它好了再按。"); return; }
    const w = ctx.girl(), c = ctx.couple(); if (!w?.id) { say("先選測試魅子"); return; } if (!c) { say("先抽一對對方夫妻"); return; }
    if (!keys.length) { say(`${PAIR_SLOTS.length} 格都有了（要重來就在那一格按「用這些設定重生」）`); return; }
    busy = true; const runSeeds = {};
    try {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i], { act, frame } = slotOf(k);
        try {
          let edit = useForm && cells[k] ? readEdit(k) : edits()[`pair~${k}`] || null;
          if (frame === 2 && (sameSeed || !edit?.seed) && runSeeds[act]) edit = { ...(edit || {}), seed: runSeeds[act] };
          if (useForm && cells[k]) { const d = await saveEdit(owner(), k, edit); ctx.setEdits(d.edits || {}); }
          const r = await genPair(k, w, c, (x) => { setMsg(k, x); say(`${i + 1}/${keys.length}「${labelOf(k)}」${x}`); }, seedFor(k, imgs(), runSeeds), edit);
          if (frame === 1) runSeeds[act] = r.seed;
          ctx.setImages(r.images); setMsg(k, `好了 ${r.sec} 秒、seed ${r.seed}（${r.how}）`); paint(k);
        } catch (e) { setMsg(k, `失敗：${e?.message || e}`); }
      }
      say(`完成 ${keys.length} 格`);
      for (const k of PAIR_SLOTS) { const sel = cells[k]?.querySelector(".ref"); if (sel) { const v = sel.value; const opts = refOptions(k); if (v && !opts.some(([u]) => u === v)) opts.push([v, `上傳：${v.split("/").pop()}`]); sel.innerHTML = opts.map(([u, t]) => `<option value="${esc(u)}">${esc(t)}</option>`).join(""); sel.value = v; } }
    } finally { busy = false; }
  };
  $("sc-pair-all")?.addEventListener("click", () => void run(missingPairs(ctx.state(), ctx.girl(), ctx.couple()), false, false));
  return { render };
}
