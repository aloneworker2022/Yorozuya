/* test_room 上排快捷「日式房間／汽車旅館／旅館」（2026-10-17 Al）：一個房型一顆按鈕；按下去把這個房型的 5 個地點姿勢（床鋪接吻／正面／背後、浴室泡澡／站著）
 * 各生 2 張。底圖＝我們的點陣場景（rental_entry 的房間＋rental_session 的兩個人）放大 4 倍，上傳成姿勢參考（/api/pose-refs），
 * 再丟 /api/imggen（scene_kind=sex_strip、nsfw、圖生圖）；好了搬到 assets/rental_scenes/ 登記 manifest（/api/rental/scene-images），遊戲點人物時從這裡挑。 */
import { drawRoom } from "./rental_entry.js?v=16";
import { SLOT_KEYS, LOC_ZH, POSE_ZH, loadImages, ownersOf } from "./rental_session.js?v=3";
import { rollClients } from "./rental.js?v=7";
import { makeCouple } from "./rental_couple.js?v=1";

const LW = 195, LH = 422, UP = 4;
const VENUE_EN = { ryokan: "japanese ryokan room, tatami, wooden onsen bath", hotel: "love hotel room, double bed, marble bathtub", motel: "motel room, neon lights, jacuzzi bathtub" };
// 2026-10-18：鏡頭一律「站在旁邊平視看」：側面、與人物同高。之前躺／趴／泡澡的姿勢被模型畫成俯視（底圖是整間房的高角度＋小人）。
const CAM_EN = "side view, from side, profile, eye level shot, camera at waist height, horizontal view, standing observer beside them, full body in frame";
const NEG_EN = "from above, top-down view, overhead view, high angle, bird's-eye view, aerial view, pov, first-person view, from below, ceiling view";
const POSE_EN = {
  bed_kiss: "sitting on bed edge, face to face, kissing, embracing, partially clothed, side view of both bodies",
  bed_missionary: "sex, missionary, she lies on her back on the bed seen from the side, her legs raised, he kneels between her legs, both bodies in profile, nude, creampie",
  bed_doggy: "sex, doggystyle, from behind, she is on all fours on the bed facing left, he kneels behind her holding her hips, both bodies in profile, hanging breasts, nude, creampie",
  bath_soak: "bathing together, sitting in bathtub, girl sitting on his lap leaning back against his chest, water up to chest, wet, steam, both in profile, nude",
  bath_standing: "sex, standing sex, from behind, she bends forward 90 degrees with hands gripping the bathtub edge, standing on tiptoe, he stands behind her holding her hips, both full bodies in profile, wet, nude, creampie",
};
/** 畫一張底圖（點陣房間＋兩個人，第 f 格）。2026-10-18：裁得更緊（人物撐滿）、先最近鄰放 2 倍再平滑放大到約 1024 高，
 *  模型不會照抄點陣的格子／糊邊。回 canvas（.ms＝這一格的毫秒數）。 */
export function baseCanvas(venue, key, doll = null, f = 0) {
  const [loc, pose] = key.split("_");
  const bg = document.createElement("canvas"); bg.width = LW; bg.height = LH;
  drawRoom(bg.getContext("2d"), venue, true, loc === "bed" ? 0 : 1);
  const cp = makeCouple({ venue, scene: loc, pose, doll: doll || {}, bg });
  const fr = cp.buildAll()[((f % 30) + 30) % 30];
  const b = fr?.box || { x0: 0, y0: 0, x1: LW - 1, y1: LH - 1 };
  let w = (b.x1 - b.x0 + 1) * 1.4, h = (b.y1 - b.y0 + 1) * 1.4;
  if (w / h > 3 / 4) h = w * 4 / 3; else w = h * 3 / 4;
  w = Math.min(LW, w); h = Math.min(LH, h);
  const cx = (b.x0 + b.x1 + 1) / 2, cy = (b.y0 + b.y1 + 1) / 2;
  const sx = Math.max(0, Math.min(LW - w, cx - w / 2)), sy = Math.max(0, Math.min(LH - h, cy - h / 2));
  const mid = document.createElement("canvas"); mid.width = Math.round(w * 2); mid.height = Math.round(h * 2);
  const gm = mid.getContext("2d"); gm.imageSmoothingEnabled = false; gm.drawImage(fr?.canvas || bg, sx, sy, w, h, 0, 0, mid.width, mid.height);
  const H = 1024, W = Math.round(H * w / h);
  const big = document.createElement("canvas"); big.width = W; big.height = H;
  const g = big.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high"; g.drawImage(mid, 0, 0, W, H);
  big.ms = fr?.ms || 100;
  return big;
}
async function uploadPose(canvas) {
  const blob = await new Promise((r) => canvas.toBlob(r, "image/png"));
  const fd = new FormData(); fd.append("file", blob, "rental_scene.png");
  const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`上傳底圖失敗 ${r.status}`);
  return (await r.json()).url;
}
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
export const DENOISE_DEFAULT = 0.7;
/** 靜圖：每個姿勢 2 張用動畫裡兩個不同的關鍵格（0、15）；動圖：一圈平均取 N 格。 */
export const KEY_FRAMES = [0, 15];
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
export function sceneBody(venue, key, girl, client, eng, poseUrl, n = 0, o = {}) {
  if (!girl?.id) throw new Error("先選魅子");
  const comfy = eng.imgProvider === "comfy";
  const ckpt = String(girl.comfyCkpt || "").trim() || eng.comfyCkpt;
  if (comfy && !ckpt) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt）");
  const extra = `${QUALITY_EN}, ${PAIR_EN}, ${POSE_EN[key]}, the man: ${clientTags(client)}, third person, ${CAM_EN}, ${VENUE_EN[venue]}, detailed background`;
  const neg = `${PAIR_NEG}, ${CLEAR_NEG}, ${NEG_EN}`;
  const dn = Math.min(0.95, Math.max(0.3, Number(o.denoise) || DENOISE_DEFAULT));
  return {
    key: `rental-scene:${venue}:${key}:${girl.id}:${Date.now().toString(36)}${n}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel, style: eng.imgStyle,
    framing: "full", rating: "nsfw",
    character: girl, outfit: "", prompt: "", extra,
    negative: neg, visual_neg: neg,
    cutout: false, flat_bg: false, lock_identity: true, retry: true,
    scene_kind: "script", char_id: girl.id,
    pose_ref: poseUrl, pose_denoise: dn,
    ...(o.seed ? { seed: o.seed } : {}),
    ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}

async function putScene(venue, it, url, owners) {
  const put = await fetch("/api/rental/scene-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue, key: it.key, slot: it.slot, url, owners: owners || [] }) });
  if (!put.ok) throw new Error(`登記失敗 ${put.status}`);
  return (await put.json()).url;
}
/** 生一個房型的圖。opts：{ girl, client, doll, keys?, perSlot?（預設 2）, owners, denoise（0.3–0.95，預設 0.7）,
 *  mode："still"（每格一張靜圖，底圖＝不同關鍵格）|"gif"（每個姿勢一張動圖：N 格同 seed 圖生圖 → /api/bodym/assemble）, frames（動圖幾格，預設 6）, onProgress }。 */
export async function generateVenue(venue, opts = {}) {
  const gif = opts.mode === "gif", keys = opts.keys?.length ? opts.keys : SLOT_KEYS, per = gif ? 1 : opts.perSlot || 2;
  const nF = Math.max(2, Math.min(12, Number(opts.frames) || 6));
  const items = keys.flatMap((key) => Array.from({ length: per }, (_, slot) => ({ key, slot, state: "等待" })));
  const say = (txt) => opts.onProgress?.(txt, items);
  const eng = await gameEngine();
  let n = 0;
  for (const it of items) {
    n++;
    const [loc, pose] = it.key.split("_"), label = `${LOC_ZH[loc]}・${POSE_ZH[pose]} #${it.slot + 1}${gif ? "（動圖）" : ""}`;
    try {
      const frames = gif ? Array.from({ length: nF }, (_, i) => Math.round((i * 30) / nF)) : [KEY_FRAMES[it.slot % KEY_FRAMES.length]];
      const seed = Math.floor(Math.random() * 2 ** 31) || 1, urls = [], ms = [];
      for (let i = 0; i < frames.length; i++) {
        const tag = gif ? ` 第 ${i + 1}/${frames.length} 格` : "";
        it.state = "畫底圖"; say(`${n}/${items.length} ${label}${tag}：上傳底圖`);
        const base = baseCanvas(venue, it.key, opts.doll, frames[i]);
        const poseUrl = await uploadPose(base);
        const body = sceneBody(venue, it.key, opts.girl, opts.client || {}, eng, poseUrl, `${n}_${i}`, { denoise: opts.denoise, seed: gif ? seed : 0 });
        it.state = "生圖中"; say(`${n}/${items.length} ${label}${tag}：生圖中（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、denoise ${body.pose_denoise}）`);
        const res = await waitImg(body, (s) => say(`${n}/${items.length} ${label}${tag}：生圖中 ${s} 秒`));
        if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
        urls.push(String(res.result).split("|")[0]);
        // 動畫一圈 30 格；取 N 格 → 每格停 30/N 格那麼久
        ms.push(Math.round((base.ms || 100) * 30 / frames.length));
      }
      let url = urls[0];
      if (gif) {
        it.state = "組動圖"; say(`${n}/${items.length} ${label}：組動圖`);
        const r = await fetch("/api/bodym/assemble", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ urls, ms, fmt: "gif", name: `rental_${venue}_${it.key}` }) });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.url) throw new Error(j.detail || `組動圖失敗 ${r.status}`);
        url = j.url;
      }
      it.url = await putScene(venue, it, url, opts.owners); it.state = "好了";
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
  const dn = $("rs-denoise"), dnv = $("rs-denoise-v");
  if (dn) { dn.value = String(DENOISE_DEFAULT); dn.addEventListener("input", () => { if (dnv) dnv.textContent = Number(dn.value).toFixed(2); }); if (dnv) dnv.textContent = DENOISE_DEFAULT.toFixed(2); }
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
    const v = venue, girl = api.girl?.() || null, doll = girl ? window.RoomDoll?.lookToDoll(girl.look || null) || null : null, client = curClient();
    try {
      // 登記給「這個她＋這個客人」和「這個她（任何客人）」：遊戲裡同一個客人優先，換客人時至少臉是她
      const items = await generateVenue(v, { girl, client, doll, owners: ownersOf(girl?.id, client?.id),
        denoise: Number($("rs-denoise")?.value) || DENOISE_DEFAULT, mode: $("rs-mode")?.value === "gif" ? "gif" : "still", frames: Number($("rs-frames")?.value) || 6,
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
    const items = await generateVenue(venue, { girl, client, doll, keys, perSlot: 1, owners: [owners[0]] });
    debug?.(`旅館房間圖（背景，${client.name || client.id}）：好了 ${items.filter((x) => x.url).length}／${items.length}`);
    return items;
  } catch (e) { debug?.(`旅館房間圖（背景）失敗：${e?.message || e}`); return []; } finally { bgJobs.delete(lock); }
}
