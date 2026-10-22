/* 2026-10-22 換妻：雙人半身互動圖（你老婆＋對方丈夫）— 只做 test_room 測試，還沒接進場景。
 * 同咖啡廳立繪那條路：/api/imggen（她＝character＋lock_identity＋她自己的模型）→ 綠幕 → /api/cutout chroma → 存 /api/swap/cafe/image。
 * 長相：她的臉／髮／胸／身材 tags 由伺服器從她的人設組（跟她的單人立繪同一套）；對方丈夫用他單人立繪同一組描述（manInfo）寫進 extra。
 * 模型：用她自己綁的 comfyCkpt（沒綁才退全域）。理由：長相鎖只鎖得住她（伺服器用她的人設＋她的模型組 tag），男方只有文字描述，換哪個模型都一樣；
 *       而且她的模型就是她單人立繪那個，畫風才對得上。對方丈夫自己的 ckpt 不用。
 * 存：owner＝「她 id.couple id」（一對夫妻配一個老婆），key＝pair~<act>（交配三個動作 pair~<act>~1／~2，存 seed，第 2 格沿用第 1 格的 seed）；已有的不重生（missingPairs）。 */
import { gameEngine } from "./rental_scene_gen.js?v=16";
import { api, BG_EN, girlInfo, manInfo, wornOutfit, waitImg, cutoutOf } from "./swap_cafe_gen.js?v=16";

// framing：half＝upper body（能半身的都半身）；wide＝要看到下半身的動作，一律同一種「full＋cowboy/wide shot」取景，彼此一致。
export const PAIR_ACTS = [
  { key: "chat", zh: "聊天", scene: "ktv", framing: "half", rating: "sfw", clothes: "dressed",
    act: "sitting close together side by side, chatting, he leans toward her and talks, she laughs shyly, looking at each other, holding drinks, his arm resting behind her shoulders" },
  { key: "kiss", zh: "接吻", scene: "ktv", framing: "half", rating: "sfw", clothes: "dressed",
    act: "kissing, face to face, from side, profile, eyes closed, his hand on her cheek, her hand on his chest, embrace" },
  { key: "grope", zh: "摸胸部", scene: "ktv", framing: "half", rating: "nsfw", clothes: "dressed",
    act: "groping, breast grab, he stands behind her and grabs her breasts with both hands over her clothes, his hands on her breasts, his face near her ear, she is embarrassed, clothes disheveled" },
  { key: "fellatio", zh: "口交", scene: "ktv", framing: "wide", rating: "nsfw", clothes: "partial",
    act: "fellatio, oral, she kneels in front of him, penis in mouth, he is standing, his hand on her head, his pants pulled down, she looks up at him, from side" },
  { key: "cunni", zh: "舔陰唇", scene: "ktv", framing: "wide", rating: "nsfw", clothes: "partial",
    act: "cunnilingus, she sits leaning back with legs spread, he kneels between her thighs and licks her pussy, skirt lifted, panties pulled aside, pussy, labia, she bites her finger, head tilted back, from side" },
  // 2026-10-22 三個交配動作各兩格，輪播 1→2→1…：同 seed、同姿勢／取景，只換 frames 的動作＋表情 tags
  { key: "missionary", zh: "傳教士體位", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude",
    act: "missionary position, missionary, sex, vaginal, she lies on her back with legs spread, he kneels between her legs leaning over her, from side" },
  { key: "behind", zh: "背後", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude",
    act: "sex from behind, doggy style, vaginal, she is on all fours, he kneels behind her holding her hips, she looks back over her shoulder, from side" },
  { key: "seated", zh: "面對面坐著擁吻交配", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude",
    act: "sex, vaginal, sitting, face to face, straddling, upright straddle, she sits on his lap facing him, arms around his neck, embrace, from side" },
];
export const PAIR_KEYS = PAIR_ACTS.map((a) => a.key);
/** 兩格輪播：每格停多久（1→2→1 一輪＝2×）。 */
// 2026-10-22 Al：第 1 格停 2 秒、第 2 格停 0.8 秒（第 2 格被撞得晃：SLAM_HITS 下、每下 SLAM_PX 位移）
export const FRAME1_MS = 2000, FRAME2_MS = 800, SLAM_HITS = 3, SLAM_PX = 6;
const INSERT_NEG = "penetration, inserted, insertion, penis inside, motion lines";
// 每格的動作＋表情（接在 act 後面）。第 1 格：還沒插入、龜頭抵著；第 2 格：整根插到底、猛撞
export const PAIR_FRAMES = {
  missionary: [
    { act: "about to penetrate, penis tip touching her pussy, tip pressed against her entrance, not inserted yet, anticipation", expr: "blushing, nervous, aroused, heavy breathing, looking at him", neg: INSERT_NEG },
    { act: "penetration, penis fully inserted, deep penetration, hilted, thrusting hard, slamming, pounding, motion lines, impact lines, trembling", expr: "tongue out, open mouth, pained expression, overwhelmed, tears, rolling eyes, drooling, sweat, ahegao", neg: "" },
  ],
  behind: [
    { act: "about to penetrate, penis tip touching her pussy from behind, tip pressed against her entrance, not inserted yet, anticipation", expr: "blushing, nervous, aroused, heavy breathing", neg: INSERT_NEG },
    { act: "penetration, penis fully inserted, deep penetration, hilted, thrusting hard, slamming, pounding, ass ripple, motion lines, impact lines, trembling", expr: "tongue out, open mouth, pained expression, overwhelmed, tears, rolling eyes, drooling, sweat, ahegao", neg: "" },
  ],
  seated: [
    { act: "kissing, she is lowering herself onto him, about to penetrate, penis tip touching her pussy, tip pressed against her entrance, not inserted yet, anticipation", expr: "blushing, nervous, aroused, heavy breathing", neg: INSERT_NEG },
    { act: "penetration, penis fully inserted, deep penetration, hilted, he thrusts up hard, slamming, bouncing, motion lines, impact lines, trembling", expr: "tongue out, open mouth, pained expression, overwhelmed, tears, rolling eyes, drooling, sweat, ahegao", neg: "kissing" },
  ],
};
/** 要生的格子：一般動作一格（pair~chat），交配動作兩格（pair~missionary~1／~2）。共 5＋3×2＝11。 */
export const PAIR_SLOTS = PAIR_ACTS.flatMap((a) => (PAIR_FRAMES[a.key] ? [`${a.key}~1`, `${a.key}~2`] : [a.key]));
const slotOf = (slot) => { const [act, f] = String(slot).split("~"); return { act, frame: f ? Number(f) : 0 }; };
const ACT = Object.fromEntries(PAIR_ACTS.map((a) => [a.key, a]));
const FRAME_EN = { half: "upper body, waist up", wide: "cowboy shot, wide shot, both bodies in frame" };
const EXPR_EN = { chat: "shy smile, light blush", kiss: "blushing, eyes closed", grope: "blushing, embarrassed, open mouth" };
const NSFW_EXPR = "blushing, aroused, heavy breathing, sweat";
const MAN_CLOTHES = { dressed: "", partial: "", nude: "nude man, naked man" };
const HER_CLOTHES = { dressed: "", partial: "", nude: "nude, completely nude, bare breasts, nipples" };
// 2026-10-22 RP5 試：很多張變第一人稱 POV、男人沒畫出來 → 人數／第三人稱放最前面加權（伺服器 lead 欄接在整段 prompt 最前），負向擋 POV
export const PAIR_LEAD = "(1girl, 1boy:1.3), (a man and a woman:1.2), (third-person view:1.2), man visible, full view of the man";
const BOTH_FACES = "both faces visible";   // 舔陰唇他的臉埋著，不寫
const POV_NEG = "pov, first-person view, pov hands, pov crotch, disembodied penis, faceless male, bald faceless man, male out of frame, cropped man, solo, solo focus, 1girl solo";
const PAIR_NEG = "multiple girls, 2girls, extra person, three people, 2boys, extra man, clone, extra arms, extra hands, extra fingers, bad hands, fused bodies, merged bodies, bad anatomy, deformed, mutated limbs, missing limbs, blurry, lowres, jpeg artifacts, text, watermark";
const PAIR_BG_NEG = "white background, gradient background, background scenery, detailed background, room, green clothes, green hair, green eyes, shadow on background";
const HALF_BG_NEG = "bed, sofa, furniture";   // 寬景（坐著／躺著）要留東西給她坐躺，只在半身時擋家具

/** 這對（她＋這對夫妻）的 owner：只留伺服器允許的字、最長 80。 */
export const pairOwner = (wife, couple) => `${wife?.id || ""}.${couple?.id || ""}`.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 80);
/** 組正／負向（extra 會接在伺服器組好的她的身份 tags 後面）。 */
export function pairPrompt(slot, wife, couple) {
  const { act: actKey, frame } = slotOf(slot), fr = frame ? PAIR_FRAMES[actKey]?.[frame - 1] : null;
  const a = ACT[actKey]; if (!a) throw new Error(`沒有這個動作 ${actKey}`);
  const gi = girlInfo(wife), mi = manInfo(couple?.husband || {});
  const manLook = [mi.desc, mi.body, a.clothes === "dressed" ? `wearing ${mi.outfit}` : a.clothes === "partial" ? `${mi.outfit}, clothes partially removed` : MAN_CLOTHES.nude].filter(Boolean).join(", ");
  // 她的衣服 tag 由伺服器用 outfit 欄翻（中文穿搭名不要塞進 extra）
  const herLook = [gi.body, a.clothes === "partial" ? "clothes partially removed" : a.clothes === "nude" ? HER_CLOTHES.nude : ""].filter(Boolean).join(", ");
  const lead = [PAIR_LEAD, a.key === "cunni" ? "" : BOTH_FACES].filter(Boolean).join(", ");
  const pos = ["1man, 1girl, couple, man and woman, hetero", a.act, fr?.act || "", FRAME_EN[a.framing], `the man: ${manLook}`, `the woman: ${herLook}`, fr?.expr || EXPR_EN[a.key] || NSFW_EXPR, BG_EN].filter(Boolean).join(", ");
  const neg = [POV_NEG, PAIR_NEG, PAIR_BG_NEG, a.framing === "half" ? HALF_BG_NEG : "", a.rating === "sfw" ? "nude, nsfw, nipples, penis" : "", a.clothes === "nude" ? "fully clothed" : "", fr?.neg || "",
    mi.build === "fat" ? "thin man, muscular man" : mi.build === "slim" ? "fat man" : mi.build === "old" ? "young man" : "", gi.slim ? "fat woman, chubby woman" : ""].filter(Boolean).join(", ");
  return { lead, pos, neg };
}
/** 伺服器依關係階段決定她穿多少（陌生／朋友會補 fully clothed, safe 蓋掉動作）。
 * 她在這個玩法裡就是玩家的老婆：色的動作用 stage=wife（情色裝、不補 fully clothed）；全裸的再加 _force_exposed（寫乳頭、不套回衣服）。聊天／接吻照她原本的階段。 */
function herFor(a, wife) {
  if (a.rating === "sfw") return wife;
  return { ...wife, stage: "wife", ...(a.clothes === "nude" ? { _force_exposed: true } : {}) };
}
/** /api/imggen body：她當 character（lock_identity，伺服器出卡場景模式：不寫 solo／不對鏡、寫 1man 1girl）、她的模型。 */
export function pairBody(slot, wife, couple, eng, seed) {
  const actKey = slotOf(slot).act;
  if (!wife?.id) throw new Error("先選測試魅子"); if (!couple?.husband) throw new Error("先抽一對對方夫妻");
  const a = ACT[actKey], comfy = eng.imgProvider === "comfy", f = pairPrompt(slot, wife, couple);
  const ckpt = String(wife.comfyCkpt || "").trim() || eng.comfyCkpt || "";
  if (comfy && !ckpt) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt），全域也沒設");
  return {
    key: `swap-pair:${String(slot).replace("~", "-")}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, provider: comfy ? "comfy" : "grok-img", model: eng.imgModel, style: eng.imgStyle,
    framing: a.framing === "half" ? "half" : "full", rating: a.rating, negative: f.neg, visual_neg: f.neg, lead: f.lead, cutout: false, flat_bg: false, retry: true, seed,
    character: herFor(a, wife), outfit: a.clothes === "dressed" ? wornOutfit(wife) : "", extra: f.pos, prompt: "", lock_identity: true, char_id: wife.id,
    ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}
export const missingPairs = (S, wife, couple) => { const have = S?.images?.[pairOwner(wife, couple)] || {}; return PAIR_SLOTS.filter((k) => !have[`pair~${k}`]?.cut); };
/** 生一格（綠幕→色鍵→存，seed 一起存，第 2 格拿第 1 格的 seed）；seed 不給＝隨機。回新的 images。 */
export async function genPair(slot, wife, couple, say = () => {}, seed = 0) {
  const eng = await gameEngine(), t0 = Date.now(); seed = seed || Math.floor(Math.random() * 2 ** 31) || 1;
  const body = pairBody(slot, wife, couple, eng, seed);
  say(`生圖（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、seed ${seed}）`);
  const res = await waitImg(body, (s) => say(`生圖 ${s} 秒`));
  if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
  const raw = String(res.result).split("|")[0], cut = await cutoutOf(raw, say);
  const j = await api.put("image", { owner: pairOwner(wife, couple), key: `pair~${slot}`, raw, seed, ...cut }, "POST");
  return { images: j.images, sec: Math.round((Date.now() - t0) / 1000), how: cut.how, seed };
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
  const n = SLAM_HITS, px = SLAM_PX, k = [];
  for (let i = 0; i < n; i++) {   // 每下：瞬間撞歪（位移＋小旋轉）→ 彈回
    const t0 = (i / n) * 100, t1 = t0 + 100 / n * 0.18, t2 = t0 + 100 / n * 0.55, sx = i % 2 ? -1 : 1;
    k.push(`${t0.toFixed(1)}%{transform:translateX(-50%) translate(0,0) rotate(0)}`,
      `${t1.toFixed(1)}%{transform:translateX(-50%) translate(${sx * px}px,${px}px) rotate(${sx * 1.2}deg)}`,
      `${t2.toFixed(1)}%{transform:translateX(-50%) translate(${-sx * px / 3}px,${-px / 3}px) rotate(${-sx * 0.4}deg)}`);
  }
  k.push("100%{transform:translateX(-50%) translate(0,0) rotate(0)}");
  const st = document.createElement("style"); st.textContent = `@keyframes swpSlam{${k.join("")}} .swp-slam{animation:swpSlam ${FRAME2_MS}ms linear 1}`;
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

/** test_room 咖啡廳面板裡的「雙人互動圖」區塊。ctx：{ girl(), couple(), state(), setImages(images), backdrop(scene) }。 */
export function bindPairBox(ctx) {
  const $ = (id) => document.getElementById(id), grid = $("sc-pair-grid"), st = $("sc-pair-status");
  if (!grid) return null;
  let busy = false;
  const say = (x) => { if (st) st.textContent = x; };
  const imgs = () => ctx.state()?.images?.[pairOwner(ctx.girl(), ctx.couple())] || {};
  const cellImg = (im, alt, cls = "") => im ? `<img class="${cls}" src="${im.cut}" alt="${alt}" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);height:100%;max-width:100%;object-fit:contain">` : "";
  const render = (msg = {}) => {
    const have = imgs();
    grid.innerHTML = PAIR_ACTS.map((a) => {
      const two = !!PAIR_FRAMES[a.key], slots = two ? [`${a.key}~1`, `${a.key}~2`] : [a.key], ims = slots.map((k) => have[`pair~${k}`]);
      const pic = two ? cellImg(ims[0], `${a.zh} 1`, "pf1") + cellImg(ims[1], `${a.zh} 2`, "pf2") : cellImg(ims[0], a.zh);
      const btns = slots.map((k, i) => `${ims[i]?.raw ? `<a class="mini" href="${ims[i].raw}" target="_blank" rel="noopener">原圖${two ? i + 1 : ""}</a> ` : ""}<button type="button" class="mini" data-regen="${k}">${ims[i] ? "重生" : "產生"}${two ? ` ${i + 1}` : ""}</button>`).join(" ")
        + (two ? ` <button type="button" class="mini" data-regen="${slots.join(",")}">重生兩張</button>` : "");
      return `<div data-k="${a.key}" style="border:1px solid #333;border-radius:8px;padding:4px;background:#141418">
        <div class="mini" style="display:flex;justify-content:space-between;gap:4px"><b>${a.zh}${two ? "（輪播 1→2）" : ""}</b><span>${a.scene === "ktv" ? "KTV" : "飯店"}</span></div>
        <div style="position:relative;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:url(${ctx.backdrop(a.scene)}) center/cover">${ims.some(Boolean) ? pic : `<span class="mini" style="position:absolute;inset:auto 0 40% 0;text-align:center;color:#999">還沒有</span>`}</div>
        ${btns}
        <div class="mini" style="white-space:pre-wrap;color:#aaa">${slots.map((k) => msg[k] || "").filter(Boolean).join("\n")}</div></div>`; }).join("");
    tick();
  };
  const tick = () => applyPairFrame(grid, frame2);
  let frame2 = false;
  startPairLoop((f2) => { frame2 = f2; tick(); });
  const note = {};
  const run = async (keys) => {
    if (busy) { say("還有在生，等它好了再按。"); return; }
    const w = ctx.girl(), c = ctx.couple(); if (!w?.id) { say("先選測試魅子"); return; } if (!c) { say("先抽一對對方夫妻"); return; }
    if (!keys.length) { say(`${PAIR_SLOTS.length} 格都有了（要重來就按個別的「重生」）`); return; }
    busy = true; const runSeeds = {};
    try {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i], { act, frame } = slotOf(k), zh = ACT[act].zh + (frame ? ` 第${frame}格` : "");
        try {
          const r = await genPair(k, w, c, (x) => { note[k] = x; say(`${i + 1}/${keys.length}「${zh}」${x}`); render(note); }, seedFor(k, imgs(), runSeeds));
          if (frame === 1) runSeeds[act] = r.seed;
          ctx.setImages(r.images); note[k] = `好了 ${r.sec} 秒、seed ${r.seed}（${r.how}）`;
        } catch (e) { note[k] = `失敗：${e?.message || e}`; }
        render(note);
      }
      say(`完成 ${keys.length} 格`);
    } finally { busy = false; }
  };
  $("sc-pair-all")?.addEventListener("click", () => void run(missingPairs(ctx.state(), ctx.girl(), ctx.couple())));
  grid.addEventListener("click", (e) => { const b = e.target.closest("button[data-regen]"); if (b) void run(b.dataset.regen.split(",")); });
  return { render };
}
