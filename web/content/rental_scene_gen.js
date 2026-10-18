/* test_room 上排快捷「日式房間／汽車旅館／旅館」（2026-10-17 Al）：一個房型一顆按鈕；按下去把這個房型的 5 個地點姿勢（床鋪接吻／正面／背後、浴室泡澡／站著）
 * 各生 2 張（不同 seed）。2026-10-18：純文生圖，跟她自己的圖同一條路（遊戲設定、她的模型、character＋lock_identity）；
 * 姿勢／地點／房型／平視側面／客人外觀全寫在 prompt，不送底圖（圖生圖會把她身材拉歪）；好了搬到 assets/rental_scenes/ 登記 manifest（/api/rental/scene-images），遊戲點人物時從這裡挑。 */
import { SLOT_KEYS, LOC_ZH, POSE_ZH, loadImages, ownersOf } from "./rental_session.js?v=6";
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
/** 客人資料 → 男方外觀 tag（rental.js 的 CLIENT_BUILDS／PERSONAS／age）。 */
export const CLIENT_BUILD_EN = {
  average: "average build man",
  slim: "thin skinny man, slender",
  muscular: "muscular man, broad shoulders, toned body",
  fat: "fat man, chubby, big belly",
  tall: "very tall man, long limbs",
  short: "short man, shorter than her",
  old: "old man, middle-aged, receding hairline, wrinkles",
};
export const CLIENT_PERSONA_EN = {
  gentleman: "neat short hair, clean-shaven, gentle smile",
  clingy: "eager clingy expression, hugging her tightly",
  showoff: "stylish hair, confident smirk, flashy",
  dominant: "stern face, dominant, gripping her firmly",
  otaku: "otaku, glasses, messy hair, shy nervous expression, pale skin",
};
export function clientTags(c = {}) {
  const age = Number(c.age) || 0;
  const ageEn = age >= 50 ? "man in his 50s" : age >= 40 ? "man in his 40s" : age >= 30 ? "man in his 30s" : age ? "young man in his 20s" : "adult man";
  return [ageEn, CLIENT_BUILD_EN[c.build] || CLIENT_BUILD_EN.average, CLIENT_PERSONA_EN[c.persona] || ""].filter(Boolean).join(", ");
}
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
// 2026-10-18 Al：接吻可以穿衣服、邊親邊脫是脫到一半；其餘每一段兩個人都全裸（男的也是）
const NUDE_EN = "both fully nude, completely naked, she is completely naked, he is completely naked, nude man, nude woman";
const NUDE_NEG = "clothes, clothed, dressed, shirt, pants, underwear, bra, panties, towel, swimsuit, clothed male";
// 浴室：第三人稱站在浴室門口往裡看（不是 pov）
const BATH_CAM_EN = "third person view from the bathroom doorway looking in, wide shot, from doorway, full bodies in the tub visible, eye level";
const BATH_NEG = "pov, first-person view, from his pov, close-up, cropped body";
export function sceneBody(venue, key, girl, client, eng, n = 0, o = {}) {
  if (!girl?.id) throw new Error("先選魅子");
  const comfy = eng.imgProvider === "comfy";
  const ckpt = String(girl.comfyCkpt || "").trim() || eng.comfyCkpt;
  if (comfy && !ckpt) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt）");
  const bath = key.startsWith("bath_"), nude = key !== "bed_kiss" && key !== "bed_undress";
  const extra = `${QUALITY_EN}, ${PAIR_EN}, ${POSE_EN[key]}${nude ? `, ${NUDE_EN}` : ""}, the man: ${clientTags(client)}, third person, ${bath ? BATH_CAM_EN : CAM_EN}, ${BG_EN[venue]?.[key.split("_")[0]] || ""}, detailed background`;
  const neg = `${PAIR_NEG}, ${CLEAR_NEG}, ${NEG_EN}${nude ? `, ${NUDE_NEG}` : ""}${bath ? `, ${BATH_NEG}` : ""}`;
  return {
    key: `rental-scene:${venue}:${key}:${girl.id}:${Date.now().toString(36)}${n}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel, style: eng.imgStyle,
    framing: "full", rating: "nsfw",
    character: girl, outfit: "", prompt: "", extra,
    negative: neg, visual_neg: neg,
    cutout: false, flat_bg: false, lock_identity: true, retry: true,
    scene_kind: "script", char_id: girl.id,
        ...(o.seed ? { seed: o.seed } : {}),
    ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}

async function putScene(venue, it, url, owners) {
  const put = await fetch("/api/rental/scene-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue, key: it.key, slot: it.slot, url, owners: owners || [] }) });
  if (!put.ok) throw new Error(`登記失敗 ${put.status}`);
  return (await put.json()).url;
}
/** 生一個房型的圖（2026-10-18 Al：純文生圖一張畫完——兩個人＋房型背景都寫在 prompt，原圖直接顯示）。
 *  opts：{ girl, client, keys?, perSlot?（預設 2，每張不同 seed）, owners, onProgress }。 */
export async function generateVenue(venue, opts = {}) {
  const keys = opts.keys?.length ? opts.keys : SLOT_KEYS, per = opts.perSlot || 2;
  const items = keys.flatMap((key) => Array.from({ length: per }, (_, slot) => ({ key, slot, state: "等待" })));
  const say = (txt) => opts.onProgress?.(txt, items);
  const eng = await gameEngine();
  let n = 0;
  for (const it of items) {
    n++;
    const [loc, pose] = it.key.split("_"), label = `${LOC_ZH[loc]}・${POSE_ZH[pose]} #${it.slot + 1}`;
    try {
      const seed = Math.floor(Math.random() * 2 ** 31) || 1;
      const body = sceneBody(venue, it.key, opts.girl, opts.client || {}, eng, n, { seed });
      it.state = "生圖中"; say(`${n}/${items.length} ${label}：生圖（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、seed ${seed}）`);
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
    grid.replaceChildren(...SLOT_KEYS.flatMap((key) => [0, 1].map((slot) => {
      const d = document.createElement("div"), [loc, pose] = key.split("_"), it = items?.find((x) => x.key === key && x.slot === slot), url = (owners.length ? ((m?.[venue] || {})["@" + owners[0]] || {})[key] || [] : (m?.[venue] || {})[key] || [])[slot];
      d.style.cssText = "font-size:12px;text-align:center";
      d.innerHTML = url ? `<img src="${url}" style="width:100%;max-height:160px;object-fit:contain;background:#000;border-radius:6px">` : `<div style="height:60px;background:#222;border-radius:6px;color:#999;display:flex;align-items:center;justify-content:center">${it?.state || "還沒有"}</div>`;
      d.append(`${LOC_ZH[loc]}・${POSE_ZH[pose]} #${slot + 1}${it?.error ? `（${it.error}）` : ""}`);
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
    venue = v; panel.hidden = false; fillClients(); status.textContent = busy ? `${VZH[busy]}生圖中……` : "";
    void show();
  });
  // 點別的快捷按鈕時收起
  document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => { if (!btns.includes(b) && b.id !== "edit-room") b.addEventListener("click", () => { if (!panel.hidden) close(); }); });
  $("rs-run")?.addEventListener("click", () => void run());
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
    const keys = [...new Set(session.acts.map((a) => `${a.loc}_${a.pose}`))].filter((k) => SLOT_KEYS.includes(k) && !(have[k] || []).some(Boolean));
    if (!keys.length) return [];
    const items = await generateVenue(venue, { girl, client, keys, perSlot: 1, owners: [owners[0]] });
    debug?.(`旅館房間圖（背景，${client.name || client.id}）：好了 ${items.filter((x) => x.url).length}／${items.length}`);
    return items;
  } catch (e) { debug?.(`旅館房間圖（背景）失敗：${e?.message || e}`); return []; } finally { bgJobs.delete(lock); }
}
