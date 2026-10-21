/* 2026-10-21 換妻 step 1：咖啡廳半身立繪產生器（test_room 上排「咖啡廳」）。
 * 三個角色：妻子（＝現在的測試魅子，跟她自己的立繪同一條路：她的模型＋lock_identity）、對方丈夫（日租客人產生器 rollClients）、
 * 對方妻子（簡單的 NPC 檔案，長得像魅子資料：look.hair／build／cup／outfit、personality）。對方夫妻存在伺服器（/api/swap/cafe），可重抽。
 * 每個角色 × 表情（一般／害羞）＝一張卡：縮圖、自己的正／負向（預設＋佔位符）、圖生圖（預設關）＋denoise、產生／存／回預設。
 * 生圖：綠幕半身（2026-10-21 Al：白底去背會啃到身體）→ /api/cutout mode=chroma 色鍵 → 不行就瀏覽器自己色鍵；預覽＝去背圖疊在咖啡廳背景上（底部對齊，像 VN）＋原圖。 */
import { gameEngine } from "./rental_scene_gen.js?v=16";
import { rollClients } from "./rental.js?v=7";

const BACKDROP = "/assets/swap/cafe.jpg";
const CHARS = { wife: "妻子（你老婆）", husband: "對方丈夫", other: "對方妻子" };
const EXPRS = { normal: "一般", shy: "害羞" };
const EXPR_EN = { normal: "gentle smile, calm relaxed expression", shy: "shy, blushing, red cheeks, embarrassed, flustered, looking slightly away, bashful smile" };
const QUALITY_EN = "masterpiece, best quality, detailed, sharp focus, clear face";
const PORTRAIT_EN = "solo, half-body portrait, upper body, cowboy shot from the waist up, facing viewer, looking at viewer, on a casual date at a cafe";
// 綠幕：要換深綠（使用者說的 dark green，例 #1f5f2f）只改這一行的字（例 "solid dark green background"）；色鍵看「綠比紅藍多多少」，深綠也摳得掉。
const GREEN_BG = "solid green background";
const BG_EN = `simple background, ${GREEN_BG}, green screen, chroma key green background, no background scenery`;
const BG_NEG = "white background, gradient background, green clothes, green hair, green eyes, background scenery, cafe interior, furniture, table, detailed background, shadow on background";
const BASE_NEG = "full body, legs, feet, lower body, multiple people, extra person, clone, blurry, lowres, jpeg artifacts, nude, nsfw, nipples";

// ---- 身材 → 英文（同 rental_scene_gen 的對照，這裡各自一份，不動那支檔）
const GIRL_BUILD_EN = {
  "勻稱有致": "slender", "骨感清瘦": "skinny slender", "纖細苗條": "slim slender", "嬌小玲瓏": "petite", "肉感微肉": "plump", "微肉圓潤": "plump chubby",
  "結實緊緻": "toned", "運動健美": "athletic", "高挑纖長": "tall slender", "豐滿火辣": "curvy voluptuous", "軟肉感有腰": "soft plump narrow-waisted",
  "細腰寬臀": "narrow-waisted wide-hipped", "凹凸有致的沙漏身材": "hourglass-figured", "極端腰臀比的漫畫比例": "hourglass-figured",
};
const CUP_EN = { A: "flat chest", B: "small breasts", C: "medium breasts", D: "large breasts", E: "huge breasts", F: "huge breasts" };
function girlInfo(g) {
  const look = g?.look || {}, b = String(look.build || ""), h = Number(look.height_cm) || 0;
  let build = GIRL_BUILD_EN[b] || Object.entries(GIRL_BUILD_EN).find(([k]) => b && (b.includes(k) || k.includes(b)))?.[1] || "slender";
  if (h && h <= 154 && !build.includes("petite")) build = `petite ${build}`;
  const cupL = String(look.cup || "").trim().charAt(0).toUpperCase(), cup = CUP_EN[cupL] || (cupL >= "G" && cupL <= "Z" ? "gigantic breasts" : "");
  return { body: `${build} woman${cup ? ` with ${cup}` : ""}`, slim: /petite|slim|slender|skinny/.test(build) && !/plump|chubby/.test(build), plump: /plump|chubby|voluptuous/.test(build) };
}
const MAN_BUILD_EN = {
  average: "average build man", slim: "thin skinny man", muscular: "muscular man with broad shoulders", fat: "fat obese man with a big round belly and double chin",
  tall: "very tall man", short: "short man", old: "old middle-aged man with a receding hairline",
};
const MAN_PERSONA_EN = {
  gentleman: "gentle man with neat short hair, clean-shaven", clingy: "eager friendly man with a wide grin", showoff: "flashy man with stylish hair and a confident smirk",
  dominant: "stern confident man with sharp eyes", otaku: "otaku man with glasses and messy hair, nervous pale man",
};
const MAN_OUTFIT_EN = { gentleman: "neat shirt and blazer", clingy: "casual polo shirt", showoff: "designer jacket and gold necklace", dominant: "dark suit, open collar", otaku: "checkered shirt over an anime t-shirt" };
function manInfo(c = {}) {
  const a = Number(c.age) || 0;
  const age = a >= 50 ? "man in his 50s" : a >= 40 ? "man in his 40s" : a >= 30 ? "man in his 30s" : a ? "young man in his 20s" : "adult man";
  return { desc: [age, MAN_PERSONA_EN[c.persona] || ""].filter(Boolean).join(", "), body: MAN_BUILD_EN[c.build] || MAN_BUILD_EN.average, outfit: MAN_OUTFIT_EN[c.persona] || "casual date outfit", build: c.build || "average" };
}
function autoNeg(ch, gi, mi) {
  const n = [];
  if (ch !== "husband") { if (gi.slim) n.push("fat woman", "chubby woman", "plump woman"); if (gi.plump) n.push("skinny woman"); }
  else { if (mi.build === "fat") n.push("thin man", "skinny man", "slim man", "muscular man"); if (mi.build === "slim") n.push("fat man", "obese man"); if (mi.build === "muscular") n.push("fat man", "skinny man"); if (mi.build === "old") n.push("young man"); }
  return n.join(", ");
}
/** 她現在那身（同 rental_scene_gen.wornOutfit）。 */
function wornOutfit(g) {
  const look = g?.look || {}, pick = g?.outfitPick, arr = (x) => (Array.isArray(x) ? x : []);
  if (Number.isInteger(pick) && arr(look.wardrobe)[pick]) return String(look.wardrobe[pick]);
  return String(look.career_outfit || look.style || "");
}

// ---- 對方妻子：簡單的 NPC 檔案（魅子資料的形狀：look.{hair, build, cup, height_cm, style}＋personality）
const OW_HAIR = [["黑色鮑伯短髮", "short black bob hair"], ["栗色長捲髮", "long wavy chestnut hair"], ["茶色低馬尾", "brown low ponytail"], ["黑長直髮", "long straight black hair"], ["蜜棕色中長髮", "medium-length honey brown hair"], ["盤髮", "dark hair in an elegant updo"]];
const OW_BUILD = ["勻稱有致", "纖細苗條", "嬌小玲瓏", "肉感微肉", "豐滿火辣", "細腰寬臀"];
const OW_CUP = ["B", "C", "C", "D", "D", "E", "F"];
const OW_OUTFIT = [["白色針織衫配長裙", "white knit sweater and long skirt"], ["米色洋裝", "beige sundress"], ["黑色貼身毛衣", "tight black sweater"], ["淺藍襯衫配開襟外套", "light blue blouse with a cardigan"], ["碎花連身裙", "floral print dress"], ["酒紅色V領上衣", "burgundy v-neck top"]];
const OW_PERSONA = ["溫柔體貼", "害羞內向", "開朗健談", "強勢主導", "悶騷", "好奇大膽"];
const OW_NAMES = ["美咲", "由香", "千夏", "真理子", "彩花", "瞳", "麻衣", "裕子"];
const pk = (a) => a[Math.floor(Math.random() * a.length)];
export function rollCouple() {
  const [h] = rollClients([], Date.now()), hair = pk(OW_HAIR), outfit = pk(OW_OUTFIT), id = `c${Date.now().toString(36)}`;
  const wife = { id: `${id}w`, name: pk(OW_NAMES), gender: "female", age: 25 + Math.floor(Math.random() * 14), personality: pk(OW_PERSONA),
    look: { hair: hair[0], hair_en: hair[1], build: pk(OW_BUILD), cup: pk(OW_CUP), height_cm: 152 + Math.floor(Math.random() * 18), style: outfit[0], outfit_en: outfit[1] } };
  return { id, at: Date.now(), husband: { ...h, id: `${id}h` }, wife };
}

// ---- 模板
export function defaultTemplate(ch, ex) {
  const who = ch === "husband" ? "1boy, male focus, the man: {man}, {man_body}, wearing {man_outfit}" : "1girl, the woman: {girl}, {girl_body}, wearing {girl_outfit}";
  const pos = [QUALITY_EN, PORTRAIT_EN, who, "{expr}", BG_EN].join(", ");
  const neg = [BASE_NEG, BG_NEG, ch === "husband" ? "1girl, woman, female, breasts" : "1boy, man, male, 2girls", "{auto_neg}"].join(", ");
  return { pos, neg, img2img: { on: false, ref: "", denoise: 0.6 } };
}
export function templateFor(prompts, ch, ex) {
  const d = defaultTemplate(ch, ex), t = prompts?.[`${ch}~${ex}`];
  if (!t) return d;
  return { pos: String(t.pos || "").trim() || d.pos, neg: String(t.neg || "").trim() || d.neg, img2img: { ...d.img2img, ...(t.img2img || {}) }, saved: true };
}
export function fillTemplate(tpl, ch, ex, wife, couple) {
  const g = ch === "other" ? couple?.wife : wife, c = couple?.husband || {}, gi = girlInfo(g), mi = manInfo(c);
  const girlDesc = ch === "other" ? ["1 woman", g?.look?.hair_en, g?.age ? `${g.age} years old` : ""].filter(Boolean).join(", ") : "1 woman";
  const outfit = ch === "other" ? (g?.look?.outfit_en || "casual date outfit") : (wornOutfit(g) || "her own casual date outfit");
  const map = { girl: girlDesc, girl_body: gi.body, girl_outfit: outfit, man: mi.desc, man_body: mi.body, man_outfit: mi.outfit, expr: EXPR_EN[ex], auto_neg: autoNeg(ch, gi, mi) };
  const sub = (t) => String(t || "").replace(/\{(\w+)\}/g, (m, k) => (k in map ? map[k] : m)).replace(/(,\s*)+,/g, ",").replace(/^[,\s]+|[,\s]+$/g, "");
  return { pos: sub(tpl.pos), neg: sub(tpl.neg) };
}
/** /api/imggen 的 body。妻子＝她自己（character＋lock_identity＋她的模型，同 portraitBody）；對方妻子＝NPC 檔案當 character；丈夫＝prompt 原樣送。 */
export function cafeBody(ch, ex, wife, couple, eng, tpl, seed) {
  const comfy = eng.imgProvider === "comfy", f = fillTemplate(tpl, ch, ex, wife, couple);
  const ckpt = (ch === "wife" ? String(wife?.comfyCkpt || "").trim() : "") || eng.comfyCkpt || String(wife?.comfyCkpt || "").trim();
  if (comfy && !ckpt) throw new Error("沒有 Comfy 模型（魅子 comfyCkpt／設定 comfyCkpt）");
  if (ch === "wife" && !wife?.id) throw new Error("先選魅子");
  const i2 = tpl.img2img?.on && tpl.img2img.ref ? { pose_ref: tpl.img2img.ref, pose_denoise: Math.min(0.95, Math.max(0.3, Number(tpl.img2img.denoise) || 0.6)) } : {};
  const who = ch === "wife" ? { character: wife, outfit: wornOutfit(wife), extra: f.pos, prompt: "", lock_identity: true, char_id: wife.id }
    : ch === "other" ? { character: couple.wife, outfit: couple.wife?.look?.outfit_en || "", extra: f.pos, prompt: "", lock_identity: false }
    : { prompt: f.pos, extra: "", lock_identity: false };
  return {
    key: `swap-cafe:${ch}:${ex}:${Date.now().toString(36)}`, provider: comfy ? "comfy" : "grok-img", model: eng.imgModel, style: eng.imgStyle,
    framing: "half", rating: "sfw", negative: f.neg, visual_neg: f.neg, cutout: false, flat_bg: false, retry: true, seed,   // 不走伺服器白底去背（flat_bg 會塞 white background）；生完自己綠幕色鍵
    ...who, ...i2, ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}
async function postImg(body) {
  const r = await fetch("/api/imggen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.detail ? String(j.detail) : `生圖 ${r.status}`);
  return j;
}
async function waitImg(body, onTick, ms = 600000) {
  let j = await postImg({ ...body, retry: true }); const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (j.status === "done" || j.status === "error") return j;
    onTick?.(Math.round((Date.now() - t0) / 1000)); await new Promise((x) => setTimeout(x, 2000)); j = await postImg({ ...body, retry: false });
  }
  return { status: "error", error: "逾時" };
}
// ---- 去背：綠幕色鍵（伺服器 /api/cutout mode=chroma → 瀏覽器同一套）
const loadImg = (url) => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => no(new Error("圖載不到")); im.src = url; });
async function isCut(url) {
  const im = await loadImg(url), c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0); const W = c.width, H = c.height;
  const pts = [[2, 2], [W - 3, 2], [2, H >> 1], [W - 3, H >> 1], [W >> 1, 2]];
  return pts.filter(([x, y]) => g.getImageData(x, y, 1, 1).data[3] < 40).length >= 3;
}
// 同 server/cutout.py chroma_key：綠度 gd＝G−max(R,B)；LO 以下不動、HI 以上全透明、中間軟邊
export const CHROMA = { lo: 16, hi: 44, enclosedMin: 0.002, enclosedGd: 70 };
/** 綠幕色鍵：只摳從四邊連過來的綠（角色身上的綠不動，除非是被包住的大塊純綠背景），邊緣去溢色。輸入 url 或 ImageData；回 dataURL（或 {data}）。 */
export function chromaKeyData(d) {
  const { lo, hi } = CHROMA, W = d.width, H = d.height, p = d.data, N = W * H, gd = new Uint8Array(N), bg = new Uint8Array(N);
  for (let k = 0; k < N; k++) { const i = k * 4, m = Math.max(p[i], p[i + 2]), v = p[i + 1] - m; gd[k] = v < 0 ? 0 : v > 255 ? 255 : v; }
  const st = [];
  for (let x = 0; x < W; x++) st.push(x, (H - 1) * W + x); for (let y = 0; y < H; y++) st.push(y * W, y * W + W - 1);
  while (st.length) { const k = st.pop(); if (bg[k] || gd[k] <= lo) continue; bg[k] = 1; const x = k % W;
    if (x > 0) st.push(k - 1); if (x < W - 1) st.push(k + 1); if (k >= W) st.push(k - W); if (k < N - W) st.push(k + W); }
  const seen = new Uint8Array(N);
  for (let s = 0; s < N; s++) {
    if (bg[s] || seen[s] || gd[s] < hi) continue;
    const comp = []; let tot = 0; st.push(s); seen[s] = 1;
    while (st.length) { const k = st.pop(); comp.push(k); tot += gd[k]; const x = k % W;
      for (const n of [x > 0 ? k - 1 : -1, x < W - 1 ? k + 1 : -1, k - W, k + W]) if (n >= 0 && n < N && !seen[n] && !bg[n] && gd[n] > lo) { seen[n] = 1; st.push(n); } }
    if (comp.length >= N * CHROMA.enclosedMin && tot / comp.length >= CHROMA.enclosedGd) for (const k of comp) bg[k] = 1;
  }
  const span = Math.max(1, hi - lo);
  for (let k = 0; k < N; k++) {
    const x = k % W; let a = 255;
    if (bg[k]) a = 255 - Math.min(255, Math.floor((gd[k] - lo) * 255 / span));
    else if (!((x > 0 && bg[k - 1]) || (x < W - 1 && bg[k + 1]) || (k >= W && bg[k - W]) || (k < N - W && bg[k + W]))) continue;
    const i = k * 4, m = Math.max(p[i], p[i + 2]); if (p[i + 1] > m) p[i + 1] = m; p[i + 3] = Math.min(a, p[i + 3]);
  }
  return d;
}
export async function browserChroma(url) {
  const im = await loadImg(url), c = document.createElement("canvas"); c.width = im.naturalWidth; c.height = im.naturalHeight;
  const g = c.getContext("2d"); g.drawImage(im, 0, 0); g.putImageData(chromaKeyData(g.getImageData(0, 0, c.width, c.height)), 0, 0);
  return c.toDataURL("image/png");
}
async function cutoutOf(url, say) {
  try {
    say?.("綠幕去背（伺服器）……");
    const r = await fetch("/api/cutout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url, mode: "chroma" }) });
    if (r.ok) { const j = await r.json(); if (j.changed && await isCut(j.url)) return { cut: j.url, how: "伺服器綠幕去背" }; }
  } catch { /* */ }
  say?.("改用瀏覽器綠幕去背……");
  return { cut_data: await browserChroma(url), how: "瀏覽器綠幕去背" };
}
const api = {
  state: async () => { const r = await fetch("/api/swap/cafe", { cache: "no-store" }); if (!r.ok) throw new Error(`讀不到換妻資料 ${r.status}（伺服器要重啟？）`); return r.json(); },
  put: async (path, body, method = "PUT") => { const r = await fetch(`/api/swap/cafe/${path}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }); if (!r.ok) throw new Error(`存檔失敗 ${r.status}（伺服器要重啟？）`); return r.json(); },
};

const BZH = { average: "普通", slim: "瘦", muscular: "壯", fat: "胖", tall: "高", short: "矮", old: "老" };
const PZH = { gentleman: "紳士", clingy: "黏人", showoff: "炫耀", dominant: "強勢", otaku: "宅男" };
/** 綁上排「咖啡廳」＋面板。ctx：{ girl()（現在的測試魅子）, debug(msg) }。 */
export function bindSwapCafePanel(ctx = {}) {
  const $ = (id) => document.getElementById(id), panel = $("swap-cafe-editor"), btn = $("btn-swap-cafe");
  if (!panel || !btn) return null;
  let S = { couples: {}, current: "", prompts: {}, images: {} }, ch = "wife", busy = false;
  const couple = () => S.couples[S.current] || null;
  const ownerOf = (c) => (c === "wife" ? ctx.girl?.()?.id || "" : couple()?.id || "");
  const info = () => {
    const g = ctx.girl?.(), c = couple();
    const w = g ? `${g.name || "她"}・${g.look?.build || "?"}・${g.look?.cup || "?"}罩杯・${wornOutfit(g) || "（沒有穿搭資料）"}` : "（先在上面選一位測試魅子）";
    const h = c ? `${c.husband.name}・${c.husband.age}歲・${PZH[c.husband.persona] || c.husband.persona}・${BZH[c.husband.build] || c.husband.build}` : "—";
    const o = c ? `${c.wife.name}・${c.wife.age}歲・${c.wife.look.hair}・${c.wife.look.build}・${c.wife.look.cup}罩杯・${c.wife.look.style}・${c.wife.personality}` : "—";
    $("sc-info").textContent = `妻子：${w}\n對方丈夫：${h}\n對方妻子：${o}`;
    const sel = $("sc-couple");
    sel.innerHTML = Object.values(S.couples).sort((a, b) => (b.at || 0) - (a.at || 0)).map((x) => `<option value="${x.id}">${x.husband.name} ＆ ${x.wife.name}（${x.id}）</option>`).join("") || `<option value="">（還沒有）</option>`;
    sel.value = S.current || "";
  };
  const preview = (img) => !img ? `<div style="height:90px;background:#222;border-radius:6px;color:#999;display:flex;align-items:center;justify-content:center">還沒有</div>`
    : `<div style="display:flex;gap:6px;align-items:flex-end"><div style="position:relative;flex:2;aspect-ratio:2/3;background:url(${BACKDROP}) center/cover;border-radius:6px;overflow:hidden">
        <img src="${img.cut}" alt="" style="position:absolute;left:50%;bottom:0;transform:translateX(-50%);height:82%;max-width:100%;object-fit:contain"></div>
        <div style="flex:1"><div class="mini">原圖</div><img src="${img.raw}" alt="" style="width:100%;border-radius:6px;background:#fff"></div></div>`;
  const makeCard = (c, ex) => {
    const key = `${c}~${ex}`, el = document.createElement("details"); el.open = true;
    el.style.cssText = "border:1px solid #333;border-radius:8px;padding:6px;margin:4px 0;background:#141418;color:#ddd";
    el.innerHTML = `<summary style="cursor:pointer;font-size:13px">${CHARS[c]}・${EXPRS[ex]} <span class="tag mini" style="color:#8a8"></span></summary>
      <div class="th" style="margin:6px 0"></div>
      <label class="mini">正向</label><textarea class="pos" rows="5" style="width:100%;font-size:12px"></textarea>
      <label class="mini">負向</label><textarea class="neg" rows="3" style="width:100%;font-size:12px"></textarea>
      <div class="bp-row" style="flex-wrap:wrap;gap:6px"><label class="mini"><input type="checkbox" class="i2"> 圖生圖（預設關）</label><input type="file" class="file" accept="image/*" style="max-width:10em"><span class="ref mini"></span></div>
      <div class="bp-row"><span class="bp-grow"><label class="mini">denoise <b class="dnv"></b></label><input type="range" class="dn" min="0.3" max="0.95" step="0.05" style="width:100%"></span></div>
      <div class="bp-row" style="flex-wrap:wrap;gap:6px"><button type="button" class="gen bp-cy">產生</button><button type="button" class="save">存</button><button type="button" class="reset mini">回預設</button></div>
      <div class="st mini" style="white-space:pre-wrap"></div>
      <details class="pv"><summary class="mini">代入預覽</summary><pre class="mini" style="white-space:pre-wrap;max-height:180px;overflow:auto"></pre></details>`;
    const q = (s) => el.querySelector(s), say = (x) => { q(".st").textContent = x; };
    let ref = "";
    const fill = (t) => { q(".pos").value = t.pos; q(".neg").value = t.neg; q(".i2").checked = !!t.img2img?.on; ref = t.img2img?.ref || ""; q(".dn").value = String(t.img2img?.denoise || 0.6);
      q(".dnv").textContent = Number(q(".dn").value).toFixed(2); q(".ref").textContent = ref ? ref.split("/").pop() : "（沒有參考圖）"; q(".tag").textContent = t.saved ? "已存" : "預設"; };
    const read = () => ({ pos: q(".pos").value, neg: q(".neg").value, img2img: { on: q(".i2").checked && !!ref, ref, denoise: Number(q(".dn").value) || 0.6 } });
    const pv = () => { const f = fillTemplate(read(), c, ex, ctx.girl?.() || null, couple()); q(".pv pre").textContent = `＋ ${f.pos}\n－ ${f.neg}`; };
    const thumb = () => { q(".th").innerHTML = preview((S.images[ownerOf(c)] || {})[key]); };
    fill(templateFor(S.prompts, c, ex)); thumb(); pv();
    q(".pos").addEventListener("input", pv); q(".neg").addEventListener("input", pv);
    q(".dn").addEventListener("input", () => { q(".dnv").textContent = Number(q(".dn").value).toFixed(2); });
    q(".file").addEventListener("change", async (e) => {
      const file = e.target.files?.[0]; if (!file) return; const fd = new FormData(); fd.append("file", file, file.name);
      const r = await fetch("/api/pose-refs", { method: "POST", body: fd }); if (!r.ok) { say(`上傳失敗 ${r.status}`); return; }
      ref = (await r.json()).url; q(".ref").textContent = ref.split("/").pop(); q(".i2").checked = true; say("參考圖上傳好了（記得按「存」）");
    });
    q(".save").addEventListener("click", async () => { try { S = await api.put("prompt", { key, tpl: read() }); q(".tag").textContent = "已存"; say("已存"); } catch (e) { say(String(e?.message || e)); } });
    q(".reset").addEventListener("click", async () => { try { S = await api.put("prompt", { key, tpl: null }); fill(templateFor(S.prompts, c, ex)); pv(); say("已回預設"); } catch (e) { say(String(e?.message || e)); } });
    q(".gen").addEventListener("click", async () => {
      if (busy) { say("還有一張在生，等它好了再按。"); return; }
      const owner = ownerOf(c); if (!owner) { say(c === "wife" ? "先選測試魅子" : "先抽一對對方夫妻"); return; }
      busy = true; say("生圖中……");
      try {
        const eng = await gameEngine(), seed = Math.floor(Math.random() * 2 ** 31) || 1, body = cafeBody(c, ex, ctx.girl?.() || null, couple(), eng, read(), seed);
        say(`生圖（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、seed ${seed}${body.pose_ref ? `、圖生圖 ${body.pose_denoise}` : ""}）`);
        const res = await waitImg(body, (s) => say(`生圖 ${s} 秒`));
        if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
        const raw = String(res.result).split("|")[0], cut = await cutoutOf(raw, say);
        const j = await api.put("image", { owner, key, raw, ...cut }, "POST");
        S.images = j.images; thumb(); say(`好了（${cut.how}）`); ctx.debug?.(`咖啡廳立繪：${CHARS[c]}・${EXPRS[ex]} 好了`);
      } catch (e) { say(`失敗：${e?.message || e}`); } finally { busy = false; }
    });
    return el;
  };
  const show = async () => {
    try { S = await api.state(); $("sc-status").textContent = ""; } catch (e) { $("sc-status").textContent = String(e?.message || e); }
    if (!couple()) { try { S = await api.put("couple", { couple: rollCouple() }); } catch { /* 伺服器沒重啟：先用本機的 */ const c = rollCouple(); S.couples[c.id] = c; S.current = c.id; } }
    info();
    document.querySelectorAll("#sc-chars button").forEach((b) => b.setAttribute("aria-pressed", b.dataset.ch === ch ? "true" : "false"));
    $("sc-grid").replaceChildren(...Object.keys(EXPRS).map((ex) => makeCard(ch, ex)));
  };
  const close = () => { panel.hidden = true; btn.setAttribute("aria-expanded", "false"); };
  btn.addEventListener("click", () => {
    if (!panel.hidden) { close(); return; }
    document.querySelectorAll(".tease-pack-panel").forEach((el) => { if (el !== panel) el.hidden = true; });
    document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((x) => x.setAttribute("aria-expanded", x === btn ? "true" : "false"));
    panel.hidden = false; void show();
  });
  document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => { if (b !== btn && b.id !== "edit-room") b.addEventListener("click", () => { if (!panel.hidden) close(); }); });
  document.querySelectorAll("#sc-chars button").forEach((b) => b.addEventListener("click", () => { ch = b.dataset.ch; void show(); }));
  $("sc-reroll")?.addEventListener("click", async () => { try { S = await api.put("couple", { couple: rollCouple() }); } catch (e) { $("sc-status").textContent = String(e?.message || e); } void show(); });
  $("sc-couple")?.addEventListener("change", async (e) => { const c = S.couples[e.target.value]; if (!c) return; try { S = await api.put("couple", { couple: c }); } catch { S.current = c.id; } void show(); });
  $("sc-close")?.addEventListener("click", close);
  return { show };
}
