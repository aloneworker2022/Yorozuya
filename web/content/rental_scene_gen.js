/* test_room 上排快捷「日式房間／汽車旅館／旅館」（2026-10-17 Al）：一個房型一顆按鈕；按下去把這個房型的 5 個地點姿勢（床鋪接吻／正面／背後、浴室泡澡／站著）
 * 各生 2 張（不同 seed）。2026-10-18：純文生圖，跟她自己的圖同一條路（遊戲設定、她的模型、character＋lock_identity）；
 * 姿勢／地點／房型／平視側面／客人外觀全寫在 prompt，不送底圖（圖生圖會把她身材拉歪）；好了搬到 assets/rental_scenes/ 登記 manifest（/api/rental/scene-images），遊戲點人物時從這裡挑。 */
import { SLOT_KEYS, VARIANT_KEYS, VARIANT_ZH, LOC_ZH, POSE_ZH, loadImages, ownersOf } from "./rental_session.js?v=8";
import { rollClients } from "./rental.js?v=7";

// 2026-10-18：鏡頭一律「站在旁邊平視看」：側面、與人物同高。之前躺／趴／泡澡的姿勢被模型畫成俯視（底圖是整間房的高角度＋小人）。
const CAM_EN = "side view, from side, profile, eye level shot, camera at waist height, horizontal view, standing observer beside them, full body in frame";
const NEG_EN = "from above, top-down view, overhead view, high angle, bird's-eye view, aerial view, pov, first-person view, from below, ceiling view";
// 人物單獨畫在白底上（之後去背）；家具只留碰到的那一點（床緣／浴缸邊），合成時背景補上
/** 2026-10-18 Al：背景直接寫進 prompt（一張圖畫完，不去背不合成）。 */
const BG_EN = {
  ryokan: { bed: "japanese tatami room, futon bedding on tatami floor, shoji sliding doors, paper andon lamp, ryokan interior", bath: "japanese-style bathroom, wooden hinoki onsen bathtub, stone tiles, steam, ryokan bath" },
  motel: { bed: "motel room, motel bed, cheap neon-lit interior", bath: "motel bathroom, jacuzzi bathtub, tiled walls" },
  hotel: { bed: "hotel room, large hotel bed with white sheets, hotel interior", bath: "hotel bathroom, bathtub, marble tiles" },
};
const POSE_EN = {
  bed_kiss: "sitting on bed edge, face to face, kissing, embracing, partially clothed, side view of both bodies",
  bed_undress: "sitting on bed edge, kissing while undressing each other, partially undressed, removing clothes, open shirt, pulling down her clothes, bra visible, unbuttoning his shirt, side view of both bodies",
  bed_missionary: "sex, missionary, she lies on her back on the bed seen from the side, her legs raised, he kneels between her legs, both bodies in profile, nude, creampie",
  bed_doggy: "sex, doggystyle, from behind, she is on all fours on the bed facing left, he kneels behind her holding her hips, both bodies in profile, hanging breasts, nude, creampie",
  bath_soak: "bathing together, sitting in bathtub, girl sitting on his lap leaning back against his chest, water up to chest, wet, steam, both in profile, nude",
  bath_standing: "sex, standing sex, from behind, she bends forward 90 degrees with hands gripping the bathtub edge, standing on tiptoe, he stands behind her holding her hips, both full bodies in profile, wet, nude, creampie",
};
async function postImg(body) {
  const r = await fetch("/api/imggen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail ? String(j.detail) : `生圖 ${r.status}`);
  return j;
}
async function waitImg(body, onTick, ms = 600000) {
  let j = await postImg({ ...body, retry: true });
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (j.status === "done" || j.status === "error") return j;
    onTick?.(Math.round((Date.now() - t0) / 1000));
    await new Promise((x) => setTimeout(x, 2000));
    j = await postImg({ ...body, retry: false });
  }
  return { status: "error", error: "逾時" };
}

// 2026-10-17 Al：一張圖兩個她 → 人數寫死、負面擋多一個人。
const PAIR_EN = "1girl, 1boy, hetero, couple";
const PAIR_NEG = "2girls, multiple girls, extra person, clone, duplicate";
// 2026-10-18 Al：人物要清楚
const QUALITY_EN = "masterpiece, best quality, detailed, sharp focus, clear face, detailed body";
const CLEAR_NEG = "blurry, lowres, jpeg artifacts, low detail";
/** 跟她自己的圖同一條路（test_room_summon 的 gameImgRoute ＋ sex_pose_packs 的 buildSexStepImgBody）：遊戲設定的生圖器／模型／畫風，她綁的 Comfy 模型。 */
export async function gameEngine() {
  const r = await fetch("/api/save", { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  const st = j?.data?.settings || {};
  return {
    imgProvider: String(st.imgProvider || "").toLowerCase() === "comfy" ? "comfy" : "grok-img",
    imgModel: String(st.model || "grok-4.5").trim() || "grok-4.5",
    imgStyle: String(st.imgStyle || "pixel").trim() || "pixel",
    comfyUrl: String(st.comfyUrl || "").trim(),
    comfyCkpt: String(st.comfyCkpt || "").trim(),
  };
}
/** /api/imggen 的 body：character＝她整份人設＋lock_identity（伺服器用她存的 look 長相錨點），男方＝客人 tag。 */
// 2026-10-18 Al：結尾兩種（跟這一段內射結束一致）
const VARIANT_EN = {
  orgasm: "female orgasm, she is climaxing, trembling, arched back, ahegao, rolling eyes, tongue out, heavy blush, sweat, toes curling, he keeps thrusting",
  cum: "male ejaculation, cum inside, creampie, he is ejaculating inside her, cum overflow, cum dripping from pussy, deep penetration, she shivers",
};
// 浴室兩個人都要在：男的全身入鏡
const BATH_PAIR_EN = "two people, a man and a woman together, 1girl, 1boy, couple, hetero, the man is clearly visible with his full body in the bath, wide-angle shot from the doorway showing both of them";
const BATH_PAIR_NEG = "solo, solo focus, 1girl only, male pov, faceless male, close-up";
// 2026-10-18 Al：接吻可以穿衣服、邊親邊脫是脫到一半；其餘每一段兩個人都全裸（男的也是）
const NUDE_EN = "both fully nude, completely naked, she is completely naked, he is completely naked, nude man, nude woman";
const NUDE_NEG = "clothes, clothed, dressed, shirt, pants, underwear, bra, panties, towel, swimsuit, clothed male";
// 浴室：第三人稱站在浴室門口往裡看（不是 pov）
const BATH_CAM_EN = "third person view from the bathroom doorway looking in, wide-angle shot, from doorway, both full bodies in the tub visible, eye level";
const BATH_NEG = "pov, first-person view, from his pov, cropped body";
// ---------------------------------------------------------------- 2026-10-18 Al：提示詞模板（test_room 可改、存伺服器 assets/rental_scenes/prompts.json，全域）
// 佔位符每次生圖自動代入她／客人的資料：{girl} {girl_body} {girl_outfit} {man} {man_body} {auto_neg}
// 身材分開寫：「the woman: …; the man: …」，每個形容詞都掛在 woman／man 上，不留光禿禿的 fat／slim（之前嬌小她＋胖宅男 → 畫成胖女瘦男）。
const GIRL_BUILD_EN = {
  "勻稱有致": "slender", "骨感清瘦": "skinny slender", "纖細苗條": "slim slender", "嬌小玲瓏": "petite",
  "肉感微肉": "plump", "微肉圓潤": "plump chubby", "結實緊緻": "toned", "運動健美": "athletic",
  "高挑纖長": "tall slender long-legged", "豐滿火辣": "curvy voluptuous", "軟肉感有腰": "soft plump narrow-waisted",
  "細腰寬臀": "narrow-waisted wide-hipped", "凹凸有致的沙漏身材": "hourglass-figured", "極端腰臀比的漫畫比例": "hourglass-figured",
};
const CUP_EN = { A: "flat chest", B: "small breasts", C: "medium breasts", D: "large breasts", E: "huge breasts", F: "huge breasts" };
function girlInfo(girl) {
  const look = girl?.look || {}, b = String(look.build || ""), h = Number(look.height_cm) || 0;
  let build = GIRL_BUILD_EN[b] || Object.entries(GIRL_BUILD_EN).find(([k]) => b && (b.includes(k) || k.includes(b)))?.[1] || "slender";
  if (h && h <= 154 && !build.includes("petite")) build = `petite ${build}`;
  if (h >= 170 && !build.includes("tall")) build = `tall ${build}`;
  const cupL = String(look.cup || "").trim().charAt(0).toUpperCase(), cup = CUP_EN[cupL] || (cupL >= "G" && cupL <= "Z" ? "gigantic breasts" : "");
  const slim = /petite|slim|slender|skinny/.test(build) && !/plump|chubby/.test(build), plump = /plump|chubby|voluptuous/.test(build);
  return { body: `${build} woman${cup ? ` with ${cup}` : ""}${h && h <= 154 ? ", short woman" : ""}`, slim, plump, short: h && h <= 154 };
}
const MAN_BUILD_EN = {
  average: "average build man", slim: "thin skinny man", muscular: "muscular man with broad shoulders",
  fat: "fat obese man with a big round belly", tall: "very tall man", short: "short man", old: "old middle-aged man with a receding hairline",
};
const MAN_PERSONA_EN = {
  gentleman: "gentle man with neat short hair, clean-shaven man", clingy: "eager clingy man hugging her tightly", showoff: "flashy man with stylish hair and a confident smirk",
  dominant: "stern dominant man gripping her firmly", otaku: "otaku man with glasses and messy hair, shy nervous pale man",
};
function manInfo(c = {}) {
  const age = Number(c.age) || 0;
  const ageEn = age >= 50 ? "man in his 50s" : age >= 40 ? "man in his 40s" : age >= 30 ? "man in his 30s" : age ? "young man in his 20s" : "adult man";
  return { desc: [ageEn, MAN_PERSONA_EN[c.persona] || ""].filter(Boolean).join(", "), body: MAN_BUILD_EN[c.build] || MAN_BUILD_EN.average, build: c.build || "average" };
}
/** 依兩個人的資料推出的負面詞（她瘦 → 擋 fat woman；他胖 → 擋 thin man…）。 */
function autoNeg(gi, mi) {
  const n = [];
  if (gi.slim) n.push("fat woman", "chubby woman", "plump woman", "obese woman");
  if (gi.plump) n.push("skinny woman");
  if (gi.short) n.push("tall woman");
  if (mi.build === "fat") n.push("thin man", "skinny man", "slim man", "muscular man");
  if (mi.build === "slim") n.push("fat man", "obese man");
  if (mi.build === "muscular") n.push("fat man", "skinny man");
  if (mi.build === "old") n.push("young man");
  return n.join(", ");
}
/** 預設模板（含佔位符）。編輯器「回預設」＝這個。 */
export function defaultTemplate(venue, key) {
  const [base, variant] = key.split("~");
  const bath = base.startsWith("bath_"), nude = base !== "bed_kiss" && base !== "bed_undress";
  const pos = [QUALITY_EN, bath ? BATH_PAIR_EN : PAIR_EN, POSE_EN[base], variant ? VARIANT_EN[variant] : "", nude ? NUDE_EN : "",
    "the woman: {girl}, {girl_body}, {girl_outfit}", "the man: {man_body}, {man}",
    "third person", bath ? BATH_CAM_EN : CAM_EN, BG_EN[venue]?.[base.split("_")[0]] || "", "detailed background"].filter(Boolean).join(", ");
  const neg = [PAIR_NEG, CLEAR_NEG, NEG_EN, nude ? NUDE_NEG : "", bath ? `${BATH_NEG}, ${BATH_PAIR_NEG}` : "", "{auto_neg}"].filter(Boolean).join(", ");
  return { pos, neg, img2img: { on: false, ref: "", denoise: 0.6 } };
}
/** 代入佔位符。stage：接吻穿著、邊親邊脫脫一半、其餘全裸。 */
export function fillTemplate(tpl, key, girl, client) {
  const base = key.split("~")[0], gi = girlInfo(girl), mi = manInfo(client);
  const outfit = base === "bed_kiss" ? "the woman wearing her own outfit" : base === "bed_undress" ? "the woman's outfit half removed" : "the woman completely naked";
  const map = { girl: "1 woman", girl_body: gi.body, girl_outfit: outfit, man: mi.desc, man_body: mi.body, auto_neg: autoNeg(gi, mi) };
  const sub = (t) => String(t || "").replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m)).replace(/(,\s*)+,/g, ",").replace(/^[,\s]+|[,\s]+$/g, "");
  return { pos: sub(tpl.pos), neg: sub(tpl.neg) };
}
let promptCache = null, promptAt = 0;
export async function loadPrompts(force = false) {
  if (!force && promptCache && Date.now() - promptAt < 30e3) return promptCache;
  try { const r = await fetch("/api/rental/scene-prompts", { cache: "no-store" }); promptCache = r.ok ? (await r.json()).prompts || {} : {}; } catch { promptCache = promptCache || {}; }
  promptAt = Date.now();
  return promptCache;
}
/** 這一張圖（格＋第幾張）現在用的模板：這張自己存的（空欄退回預設）→ 預設。 */
export function templateFor(prompts, venue, key, slot = 0) {
  const d = defaultTemplate(venue, key), t = prompts?.[venue]?.[`${key}#${slot}`];
  if (!t) return d;
  return { pos: String(t.pos || "").trim() || d.pos, neg: String(t.neg || "").trim() || d.neg, img2img: { ...d.img2img, ...(t.img2img || {}) }, saved: true };
}
/** /api/imggen 的 body：character＝她整份人設＋lock_identity（伺服器用她存的 look 長相錨點）；extra／negative＝模板代入後。
 *  o：{ seed, tpl }（tpl 沒給＝預設）。img2img 只在模板勾了才帶（預設純文生圖）。 */
export function sceneBody(venue, key, girl, client, eng, n = 0, o = {}) {
  if (!girl?.id) throw new Error("先選魅子");
  const comfy = eng.imgProvider === "comfy";
  const ckpt = String(girl.comfyCkpt || "").trim() || eng.comfyCkpt;
  if (comfy && !ckpt) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt）");
  const tpl = o.tpl || defaultTemplate(venue, key), f = fillTemplate(tpl, key, girl, client);
  const base = key.split("~")[0], clothed = base === "bed_kiss" || base === "bed_undress";
  const i2 = tpl.img2img?.on && tpl.img2img.ref ? { pose_ref: tpl.img2img.ref, pose_denoise: Math.min(0.95, Math.max(0.3, Number(tpl.img2img.denoise) || 0.6)) } : {};
  return {
    key: `rental-scene:${venue}:${key}:${girl.id}:${Date.now().toString(36)}${n}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel, style: eng.imgStyle,
    framing: "full", rating: "nsfw",
    character: girl, outfit: clothed ? wornOutfit(girl) : "", prompt: "", extra: f.pos,
    negative: f.neg, visual_neg: f.neg,
    cutout: false, flat_bg: false, lock_identity: true, retry: true,
    scene_kind: "script", char_id: girl.id,
    ...(o.seed ? { seed: o.seed } : {}),
    ...i2,
    ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}
/** 她現在那身（同 sex_pose_packs.wornOutfit）；伺服器把中文衣服轉成 tag。 */
function wornOutfit(g) {
  const look = g?.look || {}, pick = g?.outfitPick;
  const arr = (x) => (Array.isArray(x) ? x : []);
  if (typeof pick === "string" && pick[0] === "e" && arr(look.eroticOutfits)[+pick.slice(1)]) return String(look.eroticOutfits[+pick.slice(1)]);
  if (typeof pick === "string" && pick[0] === "s" && arr(look.sleepOutfits)[+pick.slice(1)]) return String(look.sleepOutfits[+pick.slice(1)]);
  if (Number.isInteger(pick) && arr(look.wardrobe)[pick]) return String(look.wardrobe[pick]);
  return String(look.career_outfit || look.style || "");
}
async function putScene(venue, it, url, owners) {
  const put = await fetch("/api/rental/scene-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue, key: it.key, slot: it.slot, url, owners: owners || [] }) });
  if (!put.ok) throw new Error(`登記失敗 ${put.status}`);
  return (await put.json()).url;
}
/** 生一個房型的圖（2026-10-18 Al：純文生圖一張畫完——兩個人＋房型背景都寫在 prompt，原圖直接顯示）。
 *  opts：{ girl, client, keys?, perSlot?（預設 2，每張不同 seed）, owners, onProgress }。 */
export async function generateVenue(venue, opts = {}) {
  // 姿勢圖每格 2 張（不同 seed）；結尾變體（高潮／內射）每格 1 張（一個房型 8 格，2 張要多生 16 張太久）
  const keys = opts.keys?.length ? opts.keys : [...SLOT_KEYS, ...VARIANT_KEYS], per = opts.perSlot || 2;
  const items = keys.flatMap((key) => Array.from({ length: key.includes("~") ? 1 : per }, (_, slot) => ({ key, slot, state: "等待" })));
  const say = (txt) => opts.onProgress?.(txt, items);
  const eng = await gameEngine(), prompts = await loadPrompts(true);
  let n = 0;
  for (const it of items) {
    n++;
    const [kb, kv] = it.key.split("~"), [loc, pose] = kb.split("_"), label = `${LOC_ZH[loc]}・${POSE_ZH[pose]}${kv ? `・${VARIANT_ZH[kv]}` : ""} #${it.slot + 1}`;
    try {
      const seed = Math.floor(Math.random() * 2 ** 31) || 1;
      const body = sceneBody(venue, it.key, opts.girl, opts.client || {}, eng, n, { seed, tpl: templateFor(prompts, venue, it.key, it.slot) });
      it.state = "生圖中"; say(`${n}/${items.length} ${label}：生圖（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、seed ${seed}${body.pose_ref ? `、圖生圖 ${body.pose_denoise}` : ""}）`);
      const res = await waitImg(body, (s) => say(`${n}/${items.length} ${label}：生圖 ${s} 秒`));
      if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
      const up = String(res.result).split("|")[0];
      it.url = await putScene(venue, it, up, opts.owners); it.state = "好了";
    } catch (e) { it.state = "失敗"; it.error = String(e?.message || e); }
    say(`${n}/${items.length} ${label}：${it.state}${it.error ? `（${it.error}）` : ""}`);
  }
  await loadImages(true);
  return items;
}

const VZH = { ryokan: "日式房間（溫泉旅館）", motel: "汽車旅館", hotel: "旅館" };
/** 綁上排快捷的三顆按鈕＋面板。api：{ girl()（現在的她）, debug(msg) }。按房型按鈕＝打開面板並開始生這個房型的 10 張。 */
export function bindPanel(api = {}) {
  const $ = (id) => document.getElementById(id);
  const panel = $("rental-scene-editor");
  if (!panel) return;
  const btns = [...document.querySelectorAll("#room-pack-chrome button[aria-controls='rental-scene-editor']")];
  let venue = "ryokan", busy = "", clients = [];
  const grid = $("rs-grid"), status = $("rs-status"), sel = $("rs-client");
  const PZH = PERSONA_ZH;
  const BZH = { average: "普通", slim: "瘦", muscular: "壯", fat: "胖", tall: "高", short: "矮", old: "老" };
  /** 客人清單：她現在日租約會的那位（api.client()）＋隨機三位（rental.rollClients，跟遊戲同一個產生器）。 */
  const fillClients = (reroll = false) => {
    if (reroll || !clients.length) clients = rollClients([], Date.now());
    const live = api.client?.();
    const list = live?.id ? [{ ...live, live: true }, ...clients.filter((c) => c.id !== live.id)] : clients;
    const keep = sel?.value;
    if (sel) {
      sel.innerHTML = list.map((c) => `<option value="${c.id}">${c.live ? "（約會中）" : ""}${c.name}・${c.age}歲・${PZH[c.persona] || c.persona}・${BZH[c.build] || c.build}</option>`).join("");
      if (list.some((c) => c.id === keep)) sel.value = keep;
    }
    return list;
  };
  const curClient = () => { const list = fillClients(); return list.find((c) => c.id === sel?.value) || list[0]; };
  $("rs-reroll")?.addEventListener("click", () => fillClients(true));
  const show = async (items = null) => {
    $("rs-title").textContent = `旅館房間圖・${VZH[venue]}`;
    const m = await loadImages(true), g = api.girl?.(), c = curClient(), owners = ownersOf(g?.id, c?.id);
    grid.replaceChildren(...[...SLOT_KEYS, ...VARIANT_KEYS].flatMap((key) => (key.includes("~") ? [0] : [0, 1]).map((slot) => {
      const [kb, kv] = key.split("~"), d = document.createElement("div"), [loc, pose] = kb.split("_"), it = items?.find((x) => x.key === key && x.slot === slot), url = (owners.length ? ((m?.[venue] || {})["@" + owners[0]] || {})[key] || [] : (m?.[venue] || {})[key] || [])[slot];
      d.style.cssText = "font-size:12px;text-align:center";
      d.innerHTML = url ? `<img src="${url}" style="width:100%;max-height:160px;object-fit:contain;background:#000;border-radius:6px">` : `<div style="height:60px;background:#222;border-radius:6px;color:#999;display:flex;align-items:center;justify-content:center">${it?.state || "還沒有"}</div>`;
      d.append(`${LOC_ZH[loc]}・${POSE_ZH[pose]}${kv ? `・${VARIANT_ZH[kv]}` : ""} #${slot + 1}${it?.error ? `（${it.error}）` : ""}`);
      return d;
    })));
  };
  const close = () => { panel.hidden = true; btns.forEach((b) => b.setAttribute("aria-expanded", "false")); };
  const run = async () => {
    if (busy) { status.textContent = `${VZH[busy]}還在生，等它好了再按。`; return; }
    busy = venue;
    const v = venue, girl = api.girl?.() || null, client = curClient();
    try {
      // 登記給「這個她＋這個客人」和「這個她（任何客人）」：遊戲裡同一個客人優先，換客人時至少臉是她
      const items = await generateVenue(v, { girl, client, owners: ownersOf(girl?.id, client?.id),
        onProgress: (txt, list) => { if (venue === v) { status.textContent = txt; void show(list); } } });
      const ok = items.filter((x) => x.url).length;
      api.debug?.(`旅館房間圖（${VZH[v]}）：好了 ${ok}／${items.length}`);
      if (venue === v) { status.textContent = `好了 ${ok}／${items.length}`; void show(items); }
    } finally { busy = ""; }
  };
  for (const b of btns) b.addEventListener("click", () => {
    const v = b.dataset.venue;
    if (!panel.hidden && venue === v && !busy) { close(); return; }
    document.querySelectorAll(".tease-pack-panel").forEach((el) => { if (el !== panel) el.hidden = true; });
    document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((x) => x.setAttribute("aria-expanded", x === b ? "true" : "false"));
    venue = v; panel.hidden = false; fillClients(); void loadEditor(); status.textContent = busy ? `${VZH[busy]}生圖中……` : "";
    void show();
  });
  // 點別的快捷按鈕時收起
  document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => { if (!btns.includes(b) && b.id !== "edit-room") b.addEventListener("click", () => { if (!panel.hidden) close(); }); });
  $("rs-run")?.addEventListener("click", () => void run());
  // ---- 提示詞編輯器（每個房型×每格；存伺服器、全域）
  const pk = $("rs-p-key"), pPos = $("rs-p-pos"), pNeg = $("rs-p-neg"), pI2 = $("rs-p-i2"), pRef = $("rs-p-ref"), pDn = $("rs-p-dn"), pDnV = $("rs-p-dn-v"), pSt = $("rs-p-status"), pPrev = $("rs-p-preview");
  // 每一張圖各一組：「格#張」（姿勢 2 張、結尾 1 張）
  const allKeys = [...SLOT_KEYS, ...VARIANT_KEYS].flatMap((k) => (k.includes("~") ? [0] : [0, 1]).map((i) => `${k}#${i}`));
  const keyZh = (ik) => { const [k, i] = ik.split("#"), [b, v] = k.split("~"), [l, p] = b.split("_"); return `${LOC_ZH[l]}・${POSE_ZH[p]}${v ? `・${VARIANT_ZH[v]}` : ""} #${+i + 1}`; };
  const pkKey = () => pk.value.split("#")[0], pkSlot = () => +(pk.value.split("#")[1] || 0);
  if (pk && !pk.options.length) pk.innerHTML = allKeys.map((k) => `<option value="${k}">${keyZh(k)}</option>`).join("");
  let pRefUrl = "";
  const preview = () => {
    if (!pPrev || !pk) return;
    const f = fillTemplate({ pos: pPos.value, neg: pNeg.value }, pkKey(), api.girl?.() || null, curClient() || {});
    pPrev.textContent = `代入（目前的她＋選的客人）：\n＋ ${f.pos}\n－ ${f.neg}`;
  };
  const loadEditor = async () => {
    if (!pk) return;
    const t = templateFor(await loadPrompts(true), venue, pkKey(), pkSlot());
    pPos.value = t.pos; pNeg.value = t.neg; pI2.checked = !!t.img2img.on; pRefUrl = t.img2img.ref || ""; pDn.value = String(t.img2img.denoise || 0.6);
    pDnV.textContent = Number(pDn.value).toFixed(2); pRef.textContent = pRefUrl ? pRefUrl.split("/").pop() : "（沒有參考圖）";
    pSt.textContent = `${VZH[venue]}・${keyZh(pk.value)}：${t.saved ? "用這張自己存的模板" : "預設"}`; preview();
  };
  const savePrompt = async (tpl) => {
    const r = await fetch("/api/rental/scene-prompts", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue, key: pk.value, tpl }) });
    if (!r.ok) throw new Error(`存檔失敗 ${r.status}（伺服器要重啟？）`);
    await loadPrompts(true);
  };
  pk?.addEventListener("change", () => void loadEditor());
  pPos?.addEventListener("input", preview); pNeg?.addEventListener("input", preview);
  pDn?.addEventListener("input", () => { pDnV.textContent = Number(pDn.value).toFixed(2); });
  $("rs-p-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0]; if (!file) return;
    const fd = new FormData(); fd.append("file", file, file.name);
    const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
    if (!r.ok) { pSt.textContent = `上傳失敗 ${r.status}`; return; }
    pRefUrl = (await r.json()).url; pRef.textContent = pRefUrl.split("/").pop(); pI2.checked = true;
  });
  $("rs-p-save")?.addEventListener("click", async () => {
    try { await savePrompt({ pos: pPos.value, neg: pNeg.value, img2img: { on: pI2.checked && !!pRefUrl, ref: pRefUrl, denoise: Number(pDn.value) || 0.6 } }); pSt.textContent = `已存：${VZH[venue]}・${keyZh(pk.value)}（test_room 和遊戲生圖都用這個）`; }
    catch (e) { pSt.textContent = String(e?.message || e); }
  });
  $("rs-p-reset")?.addEventListener("click", async () => {
    try { await savePrompt(null); await loadEditor(); pSt.textContent = `已回預設：${keyZh(pk.value)}`; } catch (e) { pSt.textContent = String(e?.message || e); }
  });
  sel?.addEventListener("change", preview);
  $("rs-close")?.addEventListener("click", close);
  return { client: curClient };
}
export const PERSONA_ZH = { gentleman: "紳士", clingy: "黏人", showoff: "炫耀", dominant: "強勢", otaku: "害羞宅男" };
const bgJobs = new Set();
/** 遊戲裡進房（rental_ui）：這一場用到的地點姿勢，這個她＋這個客人還沒有圖的，背景各生 1 張（同一條生圖路）。 */
export async function ensureSessionImages(venue, session, girl, client, doll = null, debug = null) {
  const owners = ownersOf(girl?.id, client?.id);
  if (!owners.length || !client?.id || !session?.acts?.length) return [];
  const lock = `${venue}|${owners[0]}`;
  if (bgJobs.has(lock)) return [];
  bgJobs.add(lock);
  try {
    const m = await loadImages(true), have = ((m?.[venue] || {})["@" + owners[0]]) || {};
    const acts = [...new Set(session.acts.map((a) => `${a.loc}_${a.pose}`))];
    const keys = [...acts, ...acts.flatMap((k) => VARIANT_KEYS.filter((v) => v.startsWith(`${k}~`)))].filter((k) => (SLOT_KEYS.includes(k) || VARIANT_KEYS.includes(k)) && !(have[k] || []).some(Boolean));
    if (!keys.length) return [];
    const items = await generateVenue(venue, { girl, client, keys, perSlot: 1, owners: [owners[0]] });
    debug?.(`旅館房間圖（背景，${client.name || client.id}）：好了 ${items.filter((x) => x.url).length}／${items.length}`);
    return items;
  } catch (e) { debug?.(`旅館房間圖（背景）失敗：${e?.message || e}`); return []; } finally { bgJobs.delete(lock); }
}
