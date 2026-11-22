// 2026-11-22 後台算黑影（使用者：手機平板算圖又慢又燙 → testword 填表單送後台算，算完交給前台播；同時量樹莓派一格要幾秒）
// 用法：echo '{"spec":{...},"pose":"breathe"}' | node server/shadow_render.mjs
//   讀 web/content/chat_shadow.js（headless 模式，只拿算圖的函式）和 web/droom/room_doll_chest.js，
//   用所有 CPU 核心（worker_threads，最多 4 個）一起算，回一張橫排的連續圖（PNG，base64）＋播放順序＋花了多久。
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import zlib from "node:zlib";
import { fileURLToPath } from "node:url";
import { Worker, isMainThread, parentPort, workerData } from "node:worker_threads";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 載入算圖的函式：droom 人偶＋chat_shadow 的 dollOf／drawFrame（假的 document／window，不碰畫面）。 */
function loadRenderer() {
  const box = {};
  new Function("globalThis", "module", fs.readFileSync(path.join(ROOT, "web/droom/room_doll_chest.js"), "utf8"))(box, undefined);
  const F = box.RoomDoll;
  const H = {};
  const noop = () => {};
  const fakeDoc = { currentScript: null, readyState: "loading", addEventListener: noop, getElementById: () => null, querySelector: () => null, createElement: () => ({ getContext: () => null, style: {} }), body: { classList: { contains: () => false } } };
  const fakeWin = { addEventListener: noop, innerHeight: 800, innerWidth: 400 };
  const g = Object.assign(Object.create(globalThis), { __CHAT_SHADOW_HEADLESS: H });
  new Function("globalThis", "document", "window", "location", "navigator", fs.readFileSync(path.join(ROOT, "web/content/chat_shadow.js"), "utf8"))(
    g, fakeDoc, fakeWin, { href: "http://localhost/content/chat_shadow.js" }, { hardwareConcurrency: 1 });
  if (!H.drawFrame) throw new Error("chat_shadow.js 沒有交出算圖函式（版本太舊？）");
  H.setF(F);
  return { F, ...H };
}

/** 跟 testword 的 testRender 一樣：這個動作要算哪幾段（比基尼＝先上面再下面）、每段用哪個身形。 */
function planJob(R, spec, pose) {
  const UND = { shirt: 0, bra: 1, panties: 2 };
  const bik = (R.wearOf(spec.outfit) || {}).top === "bikini";
  if (bik && (pose in UND || pose === "bikini")) pose = "bikini";
  const parts = pose === "bikini" ? [["bra", 0], ["panties", 2]] : [[pose, null]];
  return { pose, parts: parts.map(([ps, st0]) => {
    let st = Math.max(0, Math.min(3, Number(spec.undressStage) || 0)), undressing = false, mode = spec.mode || null;
    if (st0 != null) { st = st0; undressing = true; } else if (ps in UND) { st = UND[ps]; undressing = true; }
    if (ps === "peak") { st = 3; mode = "touch"; }
    return { ps, doll: R.dollOf(spec, st, undressing, mode), n: R.nOf(ps) };
  }) };
}

// PNG（RGBA、不壓縮濾波）：IHDR／IDAT／IEND
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
function crc32(buf) { let c = 0xffffffff; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
function chunk(type, data) { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([len, td, c]); }
function encodePng(w, h, rgba) {
  const raw = Buffer.alloc((w * 4 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 4 + 1)] = 0; Buffer.from(rgba.buffer, rgba.byteOffset + y * w * 4, w * 4).copy(raw, y * (w * 4 + 1) + 1); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk("IHDR", ihdr), chunk("IDAT", zlib.deflateSync(raw, { level: 6 })), chunk("IEND", Buffer.alloc(0))]);
}

if (!isMainThread) {
  // 工人：載一次算圖函式，一格一格算（同一個身形只建一次模型）
  const R = loadRenderer(), cache = {};
  parentPort.on("message", ({ id, doll, pose, f, n }) => {
    try { const r = R.drawFrame(R.F, cache, doll, pose, f, n, R.SCALE, R.CV); parentPort.postMessage({ id, w: r.width, h: r.height, px: Buffer.from(r.pixels.buffer, r.pixels.byteOffset, r.pixels.byteLength) }); }
    catch (e) { parentPort.postMessage({ id, err: String(e && e.stack || e) }); }
  });
} else {
  const input = JSON.parse(fs.readFileSync(0, "utf8") || "{}");
  const t0 = Date.now();
  const R = loadRenderer();
  const known = new Set(["breathe", "talk", "bikini", ...Object.keys({ shirt: 1, bra: 1, panties: 1 })]);
  const pose0 = String(input.pose || "breathe");
  if (!known.has(pose0) && !(R.nOf(pose0) && /^[a-z_0-9]+$/.test(pose0))) throw new Error("不認得的動作：" + pose0);
  const plan = planJob(R, input.spec || {}, pose0);
  const tasks = []; for (const p of plan.parts) for (let f = 0; f < p.n; f++) tasks.push({ id: tasks.length, doll: p.doll, pose: p.ps, f, n: p.n });
  const nW = Math.max(1, Math.min(4, os.cpus().length, tasks.length));
  const tLoad = Date.now();
  const results = new Array(tasks.length);
  await new Promise((resolve, reject) => {
    let next = 0, done = 0;
    const workers = Array.from({ length: nW }, () => new Worker(new URL(import.meta.url)));
    const feed = (w) => { if (next < tasks.length) w.postMessage(tasks[next++]); };
    for (const w of workers) {
      w.on("message", (m) => {
        if (m.err) { for (const x of workers) x.terminate(); reject(new Error(m.err)); return; }
        results[m.id] = m; done++;
        if (done === tasks.length) { for (const x of workers) x.terminate(); resolve(); } else feed(w);
      });
      w.on("error", (e) => { for (const x of workers) x.terminate(); reject(e); });
      feed(w);
    }
  });
  const tRender = Date.now();
  const W = results[0].w, Hh = results[0].h, n = results.length, sheet = new Uint8Array(W * n * Hh * 4);
  results.forEach((r, i) => { for (let y = 0; y < Hh; y++) sheet.set(r.px.subarray(y * W * 4, (y + 1) * W * 4), (y * W * n + i * W) * 4); });
  const seq = []; let base = 0;
  for (const p of plan.parts) { for (const [i, ms] of R.playSeq(p.ps)) seq.push([base + i, ms]); base += p.n; }
  const png = encodePng(W * n, Hh, sheet);
  process.stdout.write(JSON.stringify({
    pose: plan.pose, w: W, h: Hh, n, seq, png: png.toString("base64"),
    workers: nW, cpus: os.cpus().length, cpu: (os.cpus()[0] || {}).model || "", arch: os.arch(),
    sec: +((Date.now() - t0) / 1000).toFixed(2), renderSec: +((tRender - tLoad) / 1000).toFixed(2),
    perFrame: +((tRender - tLoad) / 1000 / n).toFixed(2), perFrameCore: +((tRender - tLoad) / 1000 / n * nW).toFixed(2),
  }));
}
