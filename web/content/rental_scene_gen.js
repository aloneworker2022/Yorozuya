/* test_room 上排快捷「日式房間／汽車旅館／旅館」（2026-10-17 Al）：一個房型一顆按鈕；按下去把這個房型的 5 個地點姿勢（床鋪接吻／正面／背後、浴室泡澡／站著）
 * 各生 2 張。底圖＝我們的點陣場景（rental_entry 的房間＋rental_session 的兩個人）放大 4 倍，上傳成姿勢參考（/api/pose-refs），
 * 再丟 /api/imggen（scene_kind=sex_strip、nsfw、圖生圖）；好了搬到 assets/rental_scenes/ 登記 manifest（/api/rental/scene-images），遊戲點人物時從這裡挑。 */
import { drawRoom } from "./rental_entry.js?v=15";
import { SLOT_KEYS, LOC_ZH, POSE_ZH, loadImages } from "./rental_session.js?v=2";
import { makeCouple } from "./rental_couple.js?v=1";

const LW = 195, LH = 422, UP = 4;
const VENUE_EN = { ryokan: "japanese ryokan room, tatami, wooden onsen bath", hotel: "love hotel room, double bed, marble bathtub", motel: "motel room, neon lights, jacuzzi bathtub" };
const VENUE_ZH = { ryokan: "溫泉旅館的和室", hotel: "旅館房間", motel: "汽車旅館房間" };
const POSE_EN = {
  bed_kiss: "1girl, 1boy, hetero, sitting on bed, kissing, embracing, partially clothed",
  bed_missionary: "1girl, 1boy, hetero, sex, missionary, lying on back on bed, legs up, nude, creampie",
  bed_doggy: "1girl, 1boy, hetero, sex, doggystyle, from behind, all fours on bed, hanging breasts, nude, creampie",
  bath_soak: "1girl, 1boy, hetero, bathing together, sitting in bathtub, girl sitting on lap, leaning back, wet, steam, partially submerged, nude",
  bath_standing: "1girl, 1boy, hetero, sex, standing sex, from behind, bent over, hands on bathtub edge, wet, nude, creampie",
};
const POSE_ZH_LONG = {
  bed_kiss: "成年男女坐在床邊面對面擁吻", bed_missionary: "成年男女在床上傳教士體位做愛（她仰躺），最後內射", bed_doggy: "成年男女在床上後背位做愛（她跪趴、他從後面），乳房下垂晃動，最後內射",
  bath_soak: "成年男女一起泡在浴池裡，她坐在他腿上往後靠，水面以下看不清楚", bath_standing: "成年男女在浴室站著從後面做愛，她彎腰扶著浴缸邊，最後內射",
};

/** 畫一張底圖（點陣房間＋兩個人，第 f 格），放大 UP 倍、最近鄰。 */
export function baseCanvas(venue, key, doll = null, f = 0) {
  const [loc, pose] = key.split("_");
  const bg = document.createElement("canvas"); bg.width = LW; bg.height = LH;
  drawRoom(bg.getContext("2d"), venue, true, loc === "bed" ? 0 : 1);
  const cp = makeCouple({ venue, scene: loc, pose, doll: doll || {}, bg });
  const fr = cp.buildAll()[f % 30];
  const big = document.createElement("canvas"); big.width = LW * UP; big.height = LH * UP;
  const g = big.getContext("2d"); g.imageSmoothingEnabled = false; g.drawImage(fr?.canvas || bg, 0, 0, big.width, big.height);
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

/** 生一個房型全部 5×2 張。opts：{ provider, girl（人設，可空）, onProgress(text, items) }。回 [{key, slot, url|error}]。 */
export async function generateVenue(venue, opts = {}) {
  const provider = opts.provider === "grok-img" ? "grok-img" : "comfy";
  const items = SLOT_KEYS.flatMap((key) => [0, 1].map((slot) => ({ key, slot, state: "等待" })));
  const say = (txt) => opts.onProgress?.(txt, items);
  let n = 0;
  for (const it of items) {
    n++;
    const [loc, pose] = it.key.split("_"), label = `${LOC_ZH[loc]}・${POSE_ZH[pose]} #${it.slot + 1}`;
    try {
      it.state = "畫底圖"; say(`${n}/${items.length} ${label}：上傳底圖`);
      const poseUrl = await uploadPose(baseCanvas(venue, it.key, opts.doll, it.slot * 3));
      const look = opts.girl?.look || {};
      const hair = [look.hair_color, look.hair_style].filter(Boolean).join("");
      const prompt = provider === "comfy"
        ? `masterpiece, best quality, anime, ${POSE_EN[it.key]}, ${VENUE_EN[venue]}, adult woman, adult man, detailed background`
        : `${VENUE_ZH[venue]}，${POSE_ZH_LONG[it.key]}。兩人都是成年人。照參考圖的構圖與位置（參考圖是點陣草圖，藍色人形是男人）。${hair ? `她的頭髮：${hair}。` : ""}動漫風。`;
      it.state = "生圖中"; say(`${n}/${items.length} ${label}：生圖中`);
      const key = `rental-scene:${venue}:${it.key}:${it.slot}:${Date.now()}`;
      const res = await waitImg({ key, provider, rating: "nsfw", style: "anime", scene_kind: "sex_strip", prompt, pose_ref: poseUrl, pose_denoise: 0.62, vary: true,
        character: opts.girl?.character || null, name: opts.girl?.name || "", comfy_url: opts.comfyUrl || "" }, (s) => say(`${n}/${items.length} ${label}：生圖中 ${s} 秒`));
      if (res.status !== "done" || !res.result) throw new Error(res.error || "沒有結果");
      const url = String(res.result).split("|")[0];
      const put = await fetch("/api/rental/scene-images", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ venue, key: it.key, slot: it.slot, url }) });
      if (!put.ok) throw new Error(`登記失敗 ${put.status}`);
      it.url = (await put.json()).url; it.state = "好了";
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
  let venue = "ryokan", busy = "";
  const grid = $("rs-grid"), status = $("rs-status");
  const show = async (items = null) => {
    $("rs-title").textContent = `旅館房間圖・${VZH[venue]}`;
    const m = await loadImages(true), row = m?.[venue] || {};
    grid.replaceChildren(...SLOT_KEYS.flatMap((key) => [0, 1].map((slot) => {
      const d = document.createElement("div"), [loc, pose] = key.split("_"), it = items?.find((x) => x.key === key && x.slot === slot), url = (row[key] || [])[slot];
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
    const v = venue, girl = api.girl?.() || null, doll = girl ? window.RoomDoll?.lookToDoll(girl.look || null) || null : null;
    try {
      const items = await generateVenue(v, { provider: $("rs-provider")?.value || "comfy", girl: girl ? { look: girl.look || {}, name: girl.name || "" } : null, doll,
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
    venue = v; panel.hidden = false; status.textContent = busy ? `${VZH[busy]}生圖中……` : "";
    void show();
    if (!busy) void run();
  });
  // 點別的快捷按鈕時收起
  document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => { if (!btns.includes(b) && b.id !== "edit-room") b.addEventListener("click", () => { if (!panel.hidden) close(); }); });
  $("rs-run")?.addEventListener("click", () => void run());
  $("rs-close")?.addEventListener("click", close);
}
