/* 2026-10-22 換妻：雙人半身互動圖（你老婆＋對方丈夫）— 只做 test_room 測試，還沒接進場景。
 * 同咖啡廳立繪那條路：/api/imggen（她＝character＋lock_identity＋她自己的模型）→ 綠幕 → /api/cutout chroma → 存 /api/swap/cafe/image。
 * 長相：她的臉／髮／胸／身材 tags 由伺服器從她的人設組（跟她的單人立繪同一套）；對方丈夫用他單人立繪同一組描述（manInfo）寫進 extra。
 * 模型：用她自己綁的 comfyCkpt（沒綁才退全域）。理由：長相鎖只鎖得住她（伺服器用她的人設＋她的模型組 tag），男方只有文字描述，換哪個模型都一樣；
 *       而且她的模型就是她單人立繪那個，畫風才對得上。對方丈夫自己的 ckpt 不用。
 * 存：owner＝「她 id.couple id」（一對夫妻配一個老婆），key＝pair~<act>；已有的不重生（missingPairs）。 */
import { gameEngine } from "./rental_scene_gen.js?v=16";
import { api, BG_EN, girlInfo, manInfo, wornOutfit, waitImg, cutoutOf } from "./swap_cafe_gen.js?v=14";

// framing：half＝upper body（能半身的都半身）；wide＝要看到下半身的動作，一律同一種「full＋cowboy/wide shot」取景，彼此一致。
export const PAIR_ACTS = [
  { key: "chat", zh: "聊天", scene: "ktv", framing: "half", rating: "sfw", clothes: "dressed",
    act: "sitting close together side by side, chatting, he leans toward her and talks, she laughs shyly, looking at each other, holding drinks, his arm resting behind her shoulders" },
  { key: "kiss", zh: "接吻", scene: "ktv", framing: "half", rating: "sfw", clothes: "dressed",
    act: "kissing, face to face, from side, profile, eyes closed, his hand on her cheek, her hand on his chest, embrace" },
  { key: "grope", zh: "摸胸部", scene: "ktv", framing: "half", rating: "nsfw", clothes: "dressed",
    act: "groping, breast grab, he stands behind her and grabs her breasts with both hands over her clothes, male hands on breasts, his face near her ear, she is embarrassed, clothes disheveled" },
  { key: "fellatio", zh: "口交", scene: "ktv", framing: "wide", rating: "nsfw", clothes: "partial",
    act: "fellatio, oral, she kneels in front of him, penis in mouth, he is standing, his hand on her head, his pants pulled down, she looks up at him, from side" },
  { key: "cunni", zh: "舔陰唇", scene: "ktv", framing: "wide", rating: "nsfw", clothes: "partial",
    act: "cunnilingus, she sits leaning back with legs spread, he kneels between her thighs and licks her pussy, skirt lifted, panties pulled aside, pussy, labia, she bites her finger, head tilted back, from side" },
  { key: "missionary", zh: "正面", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude",
    act: "sex, vaginal, missionary, she lies on her back with legs spread, he is on top between her legs, penis, penetration, her arms around his neck, from side" },
  { key: "behind", zh: "背後", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude",
    act: "sex from behind, doggy style, vaginal, she is on all fours, he kneels behind her holding her hips, penis, penetration, she looks back over her shoulder, from side" },
  { key: "seated", zh: "面對面坐著擁吻交配", scene: "hotel", framing: "wide", rating: "nsfw", clothes: "nude",
    act: "sex, vaginal, sitting, face to face, straddling, she sits on his lap facing him, upright straddle, arms around his neck, kissing, embrace, penis, penetration, from side" },
];
export const PAIR_KEYS = PAIR_ACTS.map((a) => a.key);
const ACT = Object.fromEntries(PAIR_ACTS.map((a) => [a.key, a]));
const FRAME_EN = { half: "upper body, waist up", wide: "cowboy shot, wide shot, both bodies in frame" };
const EXPR_EN = { chat: "shy smile, light blush", kiss: "blushing, eyes closed", grope: "blushing, embarrassed, open mouth" };
const NSFW_EXPR = "blushing, aroused, heavy breathing, sweat";
const MAN_CLOTHES = { dressed: "", partial: "", nude: "nude man, naked man" };
const HER_CLOTHES = { dressed: "", partial: "", nude: "nude, completely nude, bare breasts, nipples" };
const PAIR_NEG = "multiple girls, 2girls, extra person, three people, 2boys, extra man, clone, extra arms, extra hands, extra fingers, bad hands, fused bodies, merged bodies, bad anatomy, deformed, mutated limbs, missing limbs, blurry, lowres, jpeg artifacts, text, watermark";
const PAIR_BG_NEG = "white background, gradient background, background scenery, detailed background, room, green clothes, green hair, green eyes, shadow on background";
const HALF_BG_NEG = "bed, sofa, furniture";   // 寬景（坐著／躺著）要留東西給她坐躺，只在半身時擋家具

/** 這對（她＋這對夫妻）的 owner：只留伺服器允許的字、最長 80。 */
export const pairOwner = (wife, couple) => `${wife?.id || ""}.${couple?.id || ""}`.replace(/[^A-Za-z0-9_.:-]/g, "-").slice(0, 80);
/** 組正／負向（extra 會接在伺服器組好的她的身份 tags 後面）。 */
export function pairPrompt(actKey, wife, couple) {
  const a = ACT[actKey]; if (!a) throw new Error(`沒有這個動作 ${actKey}`);
  const gi = girlInfo(wife), mi = manInfo(couple?.husband || {});
  const manLook = [mi.desc, mi.body, a.clothes === "dressed" ? `wearing ${mi.outfit}` : a.clothes === "partial" ? `${mi.outfit}, clothes partially removed` : MAN_CLOTHES.nude].filter(Boolean).join(", ");
  // 她的衣服 tag 由伺服器用 outfit 欄翻（中文穿搭名不要塞進 extra）
  const herLook = [gi.body, a.clothes === "partial" ? "clothes partially removed" : a.clothes === "nude" ? HER_CLOTHES.nude : ""].filter(Boolean).join(", ");
  const pos = ["1man, 1girl, couple, man and woman, hetero", a.act, FRAME_EN[a.framing], `the man: ${manLook}`, `the woman: ${herLook}`, EXPR_EN[a.key] || NSFW_EXPR, BG_EN].join(", ");
  const neg = [PAIR_NEG, PAIR_BG_NEG, a.framing === "half" ? HALF_BG_NEG : "", a.rating === "sfw" ? "nude, nsfw, nipples, penis" : "", a.clothes === "nude" ? "fully clothed" : "",
    mi.build === "fat" ? "thin man, muscular man" : mi.build === "slim" ? "fat man" : mi.build === "old" ? "young man" : "", gi.slim ? "fat woman, chubby woman" : ""].filter(Boolean).join(", ");
  return { pos, neg };
}
/** 伺服器依關係階段決定她穿多少（陌生／朋友會補 fully clothed, safe 蓋掉動作）。
 * 她在這個玩法裡就是玩家的老婆：色的動作用 stage=wife（情色裝、不補 fully clothed）；全裸的再加 _force_exposed（寫乳頭、不套回衣服）。聊天／接吻照她原本的階段。 */
function herFor(a, wife) {
  if (a.rating === "sfw") return wife;
  return { ...wife, stage: "wife", ...(a.clothes === "nude" ? { _force_exposed: true } : {}) };
}
/** /api/imggen body：她當 character（lock_identity，伺服器出卡場景模式：不寫 solo／不對鏡、寫 1man 1girl）、她的模型。 */
export function pairBody(actKey, wife, couple, eng, seed) {
  if (!wife?.id) throw new Error("先選測試魅子"); if (!couple?.husband) throw new Error("先抽一對對方夫妻");
  const a = ACT[actKey], comfy = eng.imgProvider === "comfy", f = pairPrompt(actKey, wife, couple);
  const ckpt = String(wife.comfyCkpt || "").trim() || eng.comfyCkpt || "";
  if (comfy && !ckpt) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt），全域也沒設");
  return {
    key: `swap-pair:${actKey}:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, provider: comfy ? "comfy" : "grok-img", model: eng.imgModel, style: eng.imgStyle,
    framing: a.framing === "half" ? "half" : "full", rating: a.rating, negative: f.neg, visual_neg: f.neg, cutout: false, flat_bg: false, retry: true, seed,
    character: herFor(a, wife), outfit: a.clothes === "dressed" ? wornOutfit(wife) : "", extra: f.pos, prompt: "", lock_identity: true, char_id: wife.id,
    ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}
export const missingPairs = (S, wife, couple) => { const have = S?.images?.[pairOwner(wife, couple)] || {}; return PAIR_KEYS.filter((k) => !have[`pair~${k}`]?.cut); };
/** 生一張（綠幕→色鍵→存）；回新的 images。 */
export async function genPair(actKey, wife, couple, say = () => {}) {
  const eng = await gameEngine(), seed = Math.floor(Math.random() * 2 ** 31) || 1, body = pairBody(actKey, wife, couple, eng, seed), t0 = Date.now();
  say(`生圖（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、seed ${seed}）`);
  const res = await waitImg(body, (s) => say(`生圖 ${s} 秒`));
  if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
  const raw = String(res.result).split("|")[0], cut = await cutoutOf(raw, say);
  const j = await api.put("image", { owner: pairOwner(wife, couple), key: `pair~${actKey}`, raw, ...cut }, "POST");
  return { images: j.images, sec: Math.round((Date.now() - t0) / 1000), how: cut.how };
}

/** test_room 咖啡廳面板裡的「雙人互動圖」區塊。ctx：{ girl(), couple(), state(), setImages(images), backdrop(scene) }。 */
export function bindPairBox(ctx) {
  const $ = (id) => document.getElementById(id), grid = $("sc-pair-grid"), st = $("sc-pair-status");
  if (!grid) return null;
  let busy = false;
  const say = (x) => { if (st) st.textContent = x; };
  const imgs = () => ctx.state()?.images?.[pairOwner(ctx.girl(), ctx.couple())] || {};
  const render = (msg = {}) => {
    const have = imgs();
    grid.innerHTML = PAIR_ACTS.map((a) => { const im = have[`pair~${a.key}`];
      return `<div data-k="${a.key}" style="border:1px solid #333;border-radius:8px;padding:4px;background:#141418">
        <div class="mini" style="display:flex;justify-content:space-between;gap:4px"><b>${a.zh}</b><span>${a.scene === "ktv" ? "KTV" : "飯店"}</span></div>
        <div style="position:relative;aspect-ratio:2/3;border-radius:6px;overflow:hidden;background:url(${ctx.backdrop(a.scene)}) center/cover">${im ? `<img src="${im.cut}" alt="${a.zh}" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);height:100%;max-width:100%;object-fit:contain">` : `<span class="mini" style="position:absolute;inset:auto 0 40% 0;text-align:center;color:#999">還沒有</span>`}</div>
        ${im?.raw ? `<a class="mini" href="${im.raw}" target="_blank" rel="noopener">原圖</a> ` : ""}<button type="button" class="mini" data-regen="${a.key}">${im ? "重生" : "產生"}</button>
        <div class="mini" style="white-space:pre-wrap;color:#aaa">${msg[a.key] || ""}</div></div>`; }).join("");
  };
  const note = {};
  const run = async (keys) => {
    if (busy) { say("還有在生，等它好了再按。"); return; }
    const w = ctx.girl(), c = ctx.couple(); if (!w?.id) { say("先選測試魅子"); return; } if (!c) { say("先抽一對對方夫妻"); return; }
    if (!keys.length) { say("8 張都有了（要重來就按個別的「重生」）"); return; }
    busy = true;
    try {
      for (let i = 0; i < keys.length; i++) {
        const k = keys[i], zh = ACT[k].zh;
        try {
          const r = await genPair(k, w, c, (x) => { note[k] = x; say(`${i + 1}/${keys.length}「${zh}」${x}`); render(note); });
          ctx.setImages(r.images); note[k] = `好了 ${r.sec} 秒（${r.how}）`;
        } catch (e) { note[k] = `失敗：${e?.message || e}`; }
        render(note);
      }
      say(`完成 ${keys.length} 張`);
    } finally { busy = false; }
  };
  $("sc-pair-all")?.addEventListener("click", () => void run(missingPairs(ctx.state(), ctx.girl(), ctx.couple())));
  grid.addEventListener("click", (e) => { const b = e.target.closest("button[data-regen]"); if (b) void run([b.dataset.regen]); });
  return { render };
}
