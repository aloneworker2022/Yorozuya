/** test_bodyM「偷看體位 → 圖生圖」（2026-10-11）：
 * 拿接客偷看的體位動畫（5 種體位、她的身材從名冊／測試身材／上面抽到的妹子、客人體型）當來源幀，
 * 每幀上傳成姿勢參考（/api/pose-refs）→ /api/imggen 圖生圖（denoise 預設 0.3、每幀同一個 seed，臉和畫風才連得起來）
 * → /api/bodym/assemble 組回 GIF／WebP。 */
import { peekStills, MAN_BUILDS } from "./escort_peek.js?v=5";
import { POSE_ZH } from "./escort.js?v=4";

const $ = (id) => document.getElementById(id);
const POSES = ["missionary", "cowgirl", "doggy", "kiss", "reverse"];
const POSE_TAGS = {
  missionary: "missionary position, lying on back, legs spread, man kneeling between legs",
  cowgirl: "cowgirl position, girl on top, straddling, man lying on back",
  doggy: "doggystyle, on all fours, from behind, hanging breasts, man kneeling behind",
  kiss: "face-to-face sitting, straddling his lap, deep kiss, hugging, arms around neck",
  reverse: "reverse cowgirl sitting on lap, man behind her, grabbing breasts, groping from behind",
};
const TEST_BUILDS = {
  A_bony_150: { height_cm: 150, build: "骨感清瘦", cup: "A 罩杯、平坦俐落", hair: "短髮鮑伯" },
  D_balanced_162: { height_cm: 162, build: "勻稱有致", cup: "D 罩杯、飽滿有份量", hair: "中分長髮" },
  F_chubby_156: { height_cm: 156, build: "微肉圓潤", cup: "F 罩杯", hair: "雙馬尾" },
  I_hourglass_172: { height_cm: 172, build: "凹凸有致的沙漏身材", cup: "I 罩杯、不科學爆乳", hair: "大波浪長髮" },
};
const st = { stills: [], outs: [], busy: false };

function roster() {
  try {
    const bag = JSON.parse(localStorage.getItem("yorozuya_cache") || "null");
    return (bag?.data?.succubi || []).filter((s) => s && s.look);
  } catch { return []; }
}
function who() {
  const v = $("pk-who").value;
  if (v === "drawn") return window.__bodyMGirl || null;
  if (v.startsWith("test:")) { const k = v.slice(5); return { id: `bmtest_${k}`, name: k, look: TEST_BUILDS[k] }; }
  if (v.startsWith("roster:")) return roster().find((s) => String(s.id) === v.slice(7)) || null;
  return null;
}
function status(msg, err) { const el = $("pk-status"); el.textContent = msg || ""; el.className = "status" + (err ? " err" : ""); }
function fillWho() {
  const sel = $("pk-who"), keep = sel.value;
  sel.innerHTML = "";
  const add = (v, t) => { const o = document.createElement("option"); o.value = v; o.textContent = t; sel.appendChild(o); };
  add("drawn", "上面抽到的妹子");
  for (const k of Object.keys(TEST_BUILDS)) add(`test:${k}`, `測試身材 ${k}`);
  for (const s of roster()) add(`roster:${s.id}`, `名冊 ${s.name}`);
  if ([...sel.options].some((o) => o.value === keep)) sel.value = keep; else sel.value = "test:D_balanced_162";
}
/** 每 step 格取一格；被跳過的格時間併進前一格（總長不變）。 */
export function pickFrames(msList, step) {
  const out = [];
  for (let i = 0; i < msList.length; i += step) {
    let ms = 0; for (let k = i; k < Math.min(msList.length, i + step); k++) ms += msList[k];
    out.push({ frame: i, ms });
  }
  return out;
}
async function makeStills() {
  const g = who();
  if (!g?.look) { status("先選一位（上面抽、測試身材或名冊）。", true); return; }
  const step = Math.max(1, Number($("pk-step").value) || 4);
  const D = window.RoomDoll, pose = $("pk-pose").value, man = $("pk-man").value;
  const picks = pickFrames(D.SEX_FRAME_MS.map((m) => Math.round(m * MAN_BUILDS[man].tempo)), step);
  status("畫來源幀…");
  const stills = await peekStills({ look: g.look, pose, man, frames: picks.map((p) => p.frame), scale: 4 });
  st.stills = stills.map((s, i) => ({ ...s, ms: picks[i].ms }));
  st.outs = [];
  paint();
  status(`來源幀 ${st.stills.length} 張（${pose}・客人 ${man}）。按「圖生圖全部」送 Comfy。`);
}
function paint() {
  const box = $("pk-strip");
  box.innerHTML = "";
  st.stills.forEach((s, i) => {
    const cell = document.createElement("div"); cell.className = "pk-cell";
    const a = s.canvas.cloneNode(); a.getContext("2d").drawImage(s.canvas, 0, 0); a.className = "pk-src";
    cell.appendChild(a);
    if (st.outs[i]?.url) { const im = document.createElement("img"); im.src = st.outs[i].url; im.className = "pk-out"; cell.appendChild(im); }
    const cap = document.createElement("div"); cap.className = "dim"; cap.textContent = `#${s.frame}・${s.ms}ms${st.outs[i]?.msg ? "・" + st.outs[i].msg : ""}`;
    cell.appendChild(cap);
    box.appendChild(cell);
  });
}
async function upload(canvas, name) {
  const blob = await new Promise((res) => canvas.toBlob(res, "image/png"));
  const fd = new FormData(); fd.append("file", blob, name);
  const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) throw new Error(j.detail || "參考圖沒上去 HTTP " + r.status);
  return j.url;
}
async function imggen(body) {
  const post = async (b) => {
    const r = await fetch("/api/imggen", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(b) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(typeof j.detail === "string" ? j.detail : "HTTP " + r.status);
    return j;
  };
  let cur = await post(body), key = cur.key || body.key;
  const end = Date.now() + 360000;
  while (Date.now() < end) {
    if (cur.status === "done" || cur.status === "error") return cur;
    await new Promise((r) => setTimeout(r, 1500));
    cur = await post({ ...body, key, retry: false }); key = cur.key || key;
  }
  return { status: "error", error: "逾時" };
}
/** 一幀的 /api/imggen 請求（每幀同一個 seed、同一句 prompt，只換姿勢參考）。 */
export function frameBody({ girl, pose, man, ref, seed, denoise, provider, comfyUrl, idx, stamp }) {
  return {
    key: `bodym-peek:${girl.id || "g"}:${stamp}:${idx}`,
    provider, model: "grok-4.5", framing: "full", rating: "nsfw", style: "anime",
    character: girl, extra: `1girl, 1boy, sex, nude, ${POSE_TAGS[pose]}, faceless male, ${man} build man, bedroom, warm lamp light, side view`,
    prompt: "", cutout: false, flat_bg: false, retry: true, seed,
    ckpt: girl.comfyCkpt || "", comfy_url: comfyUrl,
    pose_ref: ref, pose_denoise: Math.min(0.9, Math.max(0.25, denoise)),
  };
}
async function runAll() {
  if (st.busy) return;
  if (!st.stills.length) await makeStills();
  const g = who();
  if (!st.stills.length || !g) return;
  st.busy = true;
  const seed = Number($("pk-seed").value) || (Math.floor(Math.random() * 2 ** 31) || 1);
  $("pk-seed").value = seed;
  const denoise = Number($("pk-denoise").value) || 0.3, pose = $("pk-pose").value, man = $("pk-man").value;
  const provider = $("provider")?.value || "comfy", comfyUrl = $("comfy-url")?.value.trim() || "", stamp = Date.now().toString(36);
  try {
    for (let i = 0; i < st.stills.length; i++) {
      if (st.outs[i]?.url) continue;
      st.outs[i] = { msg: "上傳…" }; paint();
      status(`第 ${i + 1}/${st.stills.length} 幀：圖生圖（denoise ${denoise}、seed ${seed}）…`);
      const ref = await upload(st.stills[i].canvas, `bodym_peek_${stamp}_${i}.png`);
      const r = await imggen(frameBody({ girl: g, pose, man, ref, seed, denoise, provider, comfyUrl, idx: i, stamp }));
      st.outs[i] = r.status === "done" && r.result ? { url: r.result, msg: "完成" } : { msg: r.error || "失敗" };
      paint();
      if (!st.outs[i].url) { status(`第 ${i + 1} 幀失敗：${st.outs[i].msg}`, true); return; }
    }
    status("全部畫好，按「組動圖」。");
  } catch (err) {
    status(String(err?.message || err), true);
  } finally { st.busy = false; }
}
async function assemble() {
  const urls = st.outs.map((o) => o?.url).filter(Boolean);
  if (urls.length !== st.stills.length || urls.length < 2) { status("還有幀沒畫好。", true); return; }
  const r = await fetch("/api/bodym/assemble", { method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ urls, ms: st.stills.map((s) => s.ms), fmt: $("pk-fmt").value, name: `${$("pk-pose").value}_${$("pk-man").value}` }) });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.url) { status(j.detail || "組不起來 HTTP " + r.status, true); return; }
  $("pk-result").innerHTML = `<img src="${j.url}" alt="" style="max-width:100%"><p><a href="${j.url}" download>${j.url}</a></p>`;
  status(`動圖好了：${j.frames} 幀 ${j.fmt}`);
}
function boot() {
  if (!$("pk-pose")) return;
  $("pk-pose").innerHTML = POSES.map((p) => `<option value="${p}">${POSE_ZH[p] || p}</option>`).join("");
  $("pk-pose").value = "doggy";
  $("pk-man").innerHTML = Object.keys(MAN_BUILDS).map((m) => `<option value="${m}">${m}</option>`).join("");
  fillWho();
  $("pk-who").addEventListener("focus", fillWho);
  $("pk-src").addEventListener("click", () => { void makeStills(); });
  $("pk-run").addEventListener("click", () => { void runAll(); });
  $("pk-asm").addEventListener("click", () => { void assemble(); });
}
boot();
window.__bodyMPeek = { makeStills, st };
