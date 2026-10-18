/* test_room 上排快捷「日式房間／汽車旅館／旅館」（2026-10-17 Al）：一個房型一顆按鈕；按下去把這個房型的 5 個地點姿勢（床鋪接吻／正面／背後、浴室泡澡／站著）
 * 各生 2 張（不同 seed）。2026-10-18：純文生圖，跟她自己的圖同一條路（遊戲設定、她的模型、character＋lock_identity）；
 * 姿勢／地點／房型／平視側面／客人外觀全寫在 prompt，不送底圖（圖生圖會把她身材拉歪）；好了搬到 assets/rental_scenes/ 登記 manifest（/api/rental/scene-images），遊戲點人物時從這裡挑。 */
import { SLOT_KEYS, LOC_ZH, POSE_ZH, loadImages, ownersOf } from "./rental_session.js?v=3";
import { rollClients } from "./rental.js?v=7";
import { drawRoom } from "./rental_entry.js?v=16";

// 2026-10-18：鏡頭一律「站在旁邊平視看」：側面、與人物同高。之前躺／趴／泡澡的姿勢被模型畫成俯視（底圖是整間房的高角度＋小人）。
const CAM_EN = "side view, from side, profile, eye level shot, camera at waist height, horizontal view, standing observer beside them, full body in frame";
const NEG_EN = "from above, top-down view, overhead view, high angle, bird's-eye view, aerial view, pov, first-person view, from below, ceiling view";
/** 2026-10-18 Al：背景分開畫（沒有人），兩個人去背後合成上去。內容照遊戲裡點陣房間（rental_room_paint／rental_bath_paint／rental_scenes_hm）。 */
export const BG_EN = {
  ryokan: {
    bed: "japanese ryokan bedroom, tatami floor, shoji sliding doors, paper andon lamp, low wooden bed with white futon bedding and pillows, large window with lake and mountain view, warm wood, bed in the lower center of the frame seen from the side",
    bath: "japanese ryokan bathroom, beige large tile wall, shower slide bar, travertine lower wall and stone counter, hinoki wooden bench and bath stool, white bathtub clad in red-brown marble with a marble step, towel on the tub rim, warm indirect ceiling light, bathtub in the lower center of the frame seen from the side",
  },
  hotel: {
    bed: "love hotel bedroom, dim lighting, plum purple tufted padded headboard wall, pendant lamp, mirror wall, large double bed with satin sheets, bed in the lower center of the frame seen from the side",
    bath: "love hotel bathroom, dark grey stone walls, glowing bright blue jacuzzi bathtub, glass shower booth, vanity sink with mirror, bathtub in the lower center of the frame seen from the side",
  },
  motel: {
    bed: "motel bedroom, burgundy velvet headboard wall, gold damask wallpaper, mirror on the ceiling, big tv, glossy floor, neon accent light, large bed in the lower center of the frame seen from the side",
    bath: "motel bathroom, black marble with gold veins, huge jacuzzi bathtub, glass shower booth, gold faucets, bathtub in the lower center of the frame seen from the side",
  },
};
const BG_NEG = "people, person, 1girl, 1boy, human, character, text, watermark, from above, top-down view, bird's-eye view, fisheye, blurry, lowres";
const STYLE_EN = { pixel: "pixel art, detailed pixel art background", anime: "anime style background art" };
/** 合成時兩個人放哪：h＝人物框高佔背景高、b＝腳（框底）在背景高的哪裡、w＝最寬佔背景寬、water＝泡澡水面在框高的哪裡（從底往上）。 */
const PLACE = {
  bed_kiss: { h: 0.6, b: 0.86, w: 0.8 },
  bed_missionary: { h: 0.4, b: 0.8, w: 0.9 },
  bed_doggy: { h: 0.46, b: 0.8, w: 0.9 },
  bath_soak: { h: 0.5, b: 0.9, w: 0.8, water: 0.42 },
  bath_standing: { h: 0.8, b: 0.97, w: 0.85 },
};
// 人物單獨畫在白底上（之後去背）；家具只留碰到的那一點（床緣／浴缸邊），合成時背景補上
const FLAT_EN = "simple background, white background, plain background, no scenery, no furniture";
const FLAT_NEG = "scenery, room, detailed background, furniture, bed frame, wall, floor";
const POSE_EN = {
  bed_kiss: "sitting side by side, face to face, kissing, embracing, partially clothed, side view of both bodies, feet on the floor",
  bed_missionary: "sex, missionary, she lies on her back seen from the side, her legs raised, he kneels between her legs, both bodies in profile, nude, creampie",
  bed_doggy: "sex, doggystyle, from behind, she is on all fours facing left, he kneels behind her holding her hips, both bodies in profile, hanging breasts, nude, creampie",
  bath_soak: "bathing together, sitting, girl sitting on his lap leaning back against his chest, wet skin, both in profile, nude",
  bath_standing: "sex, standing sex, from behind, she bends forward 90 degrees with hands resting on an invisible ledge, standing on tiptoe, he stands behind her holding her hips, both full bodies in profile, wet, nude, creampie",
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
export function sceneBody(venue, key, girl, client, eng, n = 0, o = {}) {
  if (!girl?.id) throw new Error("先選魅子");
  const comfy = eng.imgProvider === "comfy";
  const ckpt = String(girl.comfyCkpt || "").trim() || eng.comfyCkpt;
  if (comfy && !ckpt) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt）");
  const extra = `${QUALITY_EN}, ${PAIR_EN}, ${POSE_EN[key]}, the man: ${clientTags(client)}, third person, ${CAM_EN}, ${FLAT_EN}`;
  const neg = `${PAIR_NEG}, ${CLEAR_NEG}, ${NEG_EN}, ${FLAT_NEG}`;
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
/** 背景（沒有人）的 imggen body：同一條生圖路（遊戲設定的生圖器／模型／畫風），scene_kind=backdrop。 */
export function backdropBody(venue, loc, eng, girl = null) {
  const comfy = eng.imgProvider === "comfy";
  const ckpt = eng.comfyCkpt || String(girl?.comfyCkpt || "").trim();
  if (comfy && !ckpt) throw new Error("沒有 Comfy 模型（設定 comfyCkpt）");
  const pos = `${QUALITY_EN.replace(", clear face, detailed body", "")}, ${STYLE_EN[eng.imgStyle] || STYLE_EN.anime}, no humans, scenery, interior, ${BG_EN[venue][loc]}, eye level shot, horizontal view`;
  const prompt = `${pos}, ${BG_NEG.split(", ").map((x) => `NO ${x}`).join(", ")}`;
  return {
    key: `rental-bg:${venue}:${loc}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img", model: eng.imgModel, style: eng.imgStyle,
    framing: "full", rating: "sfw", character: null, prompt, extra: prompt, negative: BG_NEG, retry: true,
    scene_kind: "backdrop", seed: Math.floor(Math.random() * 2 ** 31) || 1,
    width: 896, height: 1152,
    ...(comfy ? { comfy_url: eng.comfyUrl, ckpt } : {}),
  };
}
/** 生（或重生）一個房型某個地點的背景，存進 manifest._bg。回 url。 */
export async function generateBackdrop(venue, loc, opts = {}) {
  const eng = opts.eng || (await gameEngine());
  const res = await waitImg(backdropBody(venue, loc, eng, opts.girl), opts.onTick);
  if (res.status !== "done" || !res.result) throw new Error(res.error || "背景沒有結果");
  const r = await fetch("/api/rental/backdrops", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue, loc, url: String(res.result).split("|")[0] }) });
  if (!r.ok) throw new Error(`背景登記失敗 ${r.status}`);
  await loadImages(true);
  return (await r.json()).url;
}
const loadImg = (src) => new Promise((ok, bad) => { const im = new Image(); im.onload = () => ok(im); im.onerror = () => bad(new Error(`讀不到圖 ${src}`)); im.src = src; });
const OW = 768, OH = 1024;
/** 背景 canvas：生好的背景；沒有 → 遊戲裡的點陣房間放大（平滑）。 */
export async function backdropCanvas(venue, loc, m = null) {
  const c = document.createElement("canvas"); c.width = OW; c.height = OH;
  const g = c.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  const url = (m || (await loadImages()))?._bg?.[venue]?.[loc];
  if (url) {
    try { const im = await loadImg(url); const k = Math.max(OW / im.width, OH / im.height); g.drawImage(im, (OW - im.width * k) / 2, (OH - im.height * k) / 2, im.width * k, im.height * k); c.generated = true; return c; } catch { /* 退回點陣 */ }
  }
  const px = document.createElement("canvas"); px.width = 195; px.height = 422;
  drawRoom(px.getContext("2d"), venue, true, loc === "bed" ? 0 : 1);
  const sh = 260, sy = 422 - sh - 30;
  g.drawImage(px, 0, sy, 195, sh, 0, 0, OW, OH);
  return c;
}
/** 去背保底：伺服器 cutout 沒動它（四邊不是平背景）→ 從四邊往內漫延吃掉跟角落顏色接近的連通區。 */
function floodCut(g, w, h, tol = 40) {
  const d = g.getImageData(0, 0, w, h), a = d.data;
  const corner = [0, w - 1, (h - 1) * w, h * w - 1].map((i) => [a[i * 4], a[i * 4 + 1], a[i * 4 + 2]]);
  const ref = [0, 1, 2].map((k) => corner.map((c) => c[k]).sort((x, y) => x - y)[2]);
  const seen = new Uint8Array(w * h), q = [];
  const near = (i) => Math.abs(a[i * 4] - ref[0]) < tol && Math.abs(a[i * 4 + 1] - ref[1]) < tol && Math.abs(a[i * 4 + 2] - ref[2]) < tol;
  for (let x = 0; x < w; x++) q.push(x, (h - 1) * w + x);
  for (let y = 0; y < h; y++) q.push(y * w, y * w + w - 1);
  while (q.length) {
    const i = q.pop();
    if (seen[i] || !near(i)) continue;
    seen[i] = 1; a[i * 4 + 3] = 0;
    const x = i % w;
    if (x > 0) q.push(i - 1); if (x < w - 1) q.push(i + 1); if (i >= w) q.push(i - w); if (i < w * (h - 1)) q.push(i + w);
  }
  g.putImageData(d, 0, 0);
}
/** 去背後的兩個人 → canvas＋不透明的框。 */
async function cutoutCanvas(url) {
  const im = await loadImg(url);
  const c = document.createElement("canvas"); c.width = im.width; c.height = im.height;
  const g = c.getContext("2d", { willReadFrequently: true }); g.drawImage(im, 0, 0);
  let d = g.getImageData(0, 0, c.width, c.height).data, clear = 0;
  for (let i = 3; i < d.length; i += 4 * 97) if (d[i] < 20) clear++;
  if (clear < 20) { floodCut(g, c.width, c.height); d = g.getImageData(0, 0, c.width, c.height).data; c.cutBy = "flood"; } else c.cutBy = "server";
  let x0 = c.width, y0 = c.height, x1 = -1, y1 = -1;
  for (let y = 0; y < c.height; y += 2) for (let x = 0; x < c.width; x += 2) if (d[(y * c.width + x) * 4 + 3] > 40) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0) throw new Error("去背後沒有人");
  c.box = { x0, y0, x1: x1 + 1, y1: y1 + 1 };
  return c;
}
/** 合成：背景＋兩個人（照 PLACE 縮放對位）；泡澡在下半身疊水層。回 canvas。 */
export function composite(bg, fig, key, venue) {
  const P = PLACE[key] || PLACE.bed_kiss, b = fig.box, bw = b.x1 - b.x0, bh = b.y1 - b.y0;
  const k = Math.min((P.h * OH) / bh, (P.w * OW) / bw);
  const dw = bw * k, dh = bh * k, dx = (OW - dw) / 2, dy = P.b * OH - dh;
  const out = document.createElement("canvas"); out.width = OW; out.height = OH;
  const g = out.getContext("2d"); g.imageSmoothingEnabled = true; g.imageSmoothingQuality = "high";
  g.drawImage(bg, 0, 0);
  // 腳下一點影子，人才像「貼在」床／地上
  g.save(); g.fillStyle = "rgba(0,0,0,0.28)"; g.filter = "blur(10px)";
  g.beginPath(); g.ellipse(OW / 2, P.b * OH - 4, dw * 0.45, Math.max(8, dh * 0.04), 0, 0, Math.PI * 2); g.fill(); g.restore();
  g.drawImage(fig, b.x0, b.y0, bw, bh, dx, dy, dw, dh);
  if (P.water) {
    const wy = P.b * OH - dh * P.water, col = venue === "hotel" ? [70, 150, 235] : venue === "motel" ? [90, 160, 200] : [120, 175, 190];
    const gr = g.createLinearGradient(0, wy, 0, P.b * OH + 10);
    gr.addColorStop(0, `rgba(${col},0.55)`); gr.addColorStop(1, `rgba(${col.map((x) => x * 0.6)},0.85)`);
    g.fillStyle = gr; g.fillRect(dx - dw * 0.08, wy, dw * 1.16, P.b * OH + 10 - wy);
    g.strokeStyle = "rgba(255,255,255,0.6)"; g.lineWidth = 3;
    g.beginPath(); for (let x = dx - dw * 0.08; x <= dx + dw * 1.08; x += 6) g.lineTo(x, wy + Math.sin(x / 13) * 2.5); g.stroke();
  }
  return out;
}
async function uploadCanvas(c, name) {
  const blob = await new Promise((r) => c.toBlob(r, "image/png"));
  const fd = new FormData(); fd.append("file", blob, name);
  const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
  if (!r.ok) throw new Error(`上傳合成圖失敗 ${r.status}`);
  return (await r.json()).url;
}
/** 生一個房型的圖（2026-10-18 Al：背景跟人分開）：
 *  ① 這個房型臥室／浴室的背景沒有就先生（存起來重用）② 兩個人純文生圖、白底 ③ /api/cutout 去背（摳不掉 → 前端漫延去背）④ 合成到背景。
 *  opts：{ girl, client, keys?, perSlot?（預設 2，每張不同 seed）, owners, onProgress }。 */
export async function generateVenue(venue, opts = {}) {
  const keys = opts.keys?.length ? opts.keys : SLOT_KEYS, per = opts.perSlot || 2;
  const items = keys.flatMap((key) => Array.from({ length: per }, (_, slot) => ({ key, slot, state: "等待" })));
  const say = (txt) => opts.onProgress?.(txt, items);
  const eng = await gameEngine();
  const bgs = {};
  let n = 0;
  for (const it of items) {
    n++;
    const [loc, pose] = it.key.split("_"), label = `${LOC_ZH[loc]}・${POSE_ZH[pose]} #${it.slot + 1}`;
    try {
      if (!bgs[loc]) {
        const m = await loadImages(true);
        if (!m?._bg?.[venue]?.[loc]) {
          say(`${n}/${items.length} ${label}：先生${LOC_ZH[loc]}背景`);
          try { await generateBackdrop(venue, loc, { eng, girl: opts.girl, onTick: (s) => say(`${n}/${items.length} ${LOC_ZH[loc]}背景：${s} 秒`) }); }
          catch (e) { say(`${LOC_ZH[loc]}背景失敗（${e?.message || e}），改用點陣房間`); }
        }
        bgs[loc] = await backdropCanvas(venue, loc, await loadImages(true));
      }
      const seed = Math.floor(Math.random() * 2 ** 31) || 1;
      const body = sceneBody(venue, it.key, opts.girl, opts.client || {}, eng, n, { seed });
      it.state = "生圖中"; say(`${n}/${items.length} ${label}：生人物（${body.provider}${body.ckpt ? " " + body.ckpt : ""}、seed ${seed}）`);
      const res = await waitImg(body, (s) => say(`${n}/${items.length} ${label}：生人物 ${s} 秒`));
      if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
      const raw = String(res.result).split("|")[0];
      it.state = "去背"; say(`${n}/${items.length} ${label}：去背`);
      const cut = await fetch("/api/cutout", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: raw }) }).then((r) => r.json()).catch(() => ({}));
      const fig = await cutoutCanvas(cut?.url || raw);
      it.state = "合成"; say(`${n}/${items.length} ${label}：合成（去背：${fig.cutBy === "server" ? "伺服器 cutout" : "漫延保底"}）`);
      const up = await uploadCanvas(composite(bgs[loc], fig, it.key, venue), `rental_${venue}_${it.key}.png`);
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
    const bgBox = $("rs-bg");
    if (bgBox) bgBox.replaceChildren(...["bed", "bath"].map((loc) => {
      const d = document.createElement("div"), u = m?._bg?.[venue]?.[loc];
      d.style.cssText = "font-size:12px;text-align:center";
      d.innerHTML = u ? `<img src="${u}" style="width:100%;max-height:140px;object-fit:contain;background:#000;border-radius:6px">` : `<div style="height:50px;background:#222;border-radius:6px;color:#999;display:flex;align-items:center;justify-content:center">（用點陣房間）</div>`;
      d.append(`${LOC_ZH[loc]}背景`);
      return d;
    }));
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
  for (const loc of ["bed", "bath"]) $(`rs-bg-${loc}`)?.addEventListener("click", async () => {
    if (busy) { status.textContent = `${VZH[busy]}還在生，等它好了再按。`; return; }
    busy = venue; const v = venue;
    try {
      status.textContent = `${VZH[v]}・${LOC_ZH[loc]}背景：生圖中`;
      await generateBackdrop(v, loc, { girl: api.girl?.() || null, onTick: (s) => { status.textContent = `${VZH[v]}・${LOC_ZH[loc]}背景：生圖中 ${s} 秒`; } });
      status.textContent = `${VZH[v]}・${LOC_ZH[loc]}背景：好了（之後的人物圖會合成到這張）`;
    } catch (e) { status.textContent = `背景失敗：${e?.message || e}`; } finally { busy = ""; void show(); }
  });
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
