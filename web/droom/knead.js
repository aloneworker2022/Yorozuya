// 2026-11-07 揉乳房視窗（droom index.html 最下面；先做右邊那顆＝畫面右邊）。
//   選乳型／罩杯／乳暈 → 畫她胸口正面近景（脖子下到乳房下；很垂的照比例拉大），2×，肉色皮膚＋明暗陰影（看得出手指掐進去）。
//   手指按住右乳＝掐（一段）；按住拖＝像搖桿往 8 個方向拉，拖遠有兩段（超過距離跳下一段）；放手＝彈回去晃幾下（大多上下晃）。
//   手：黑色人手剪影（手掌蓋在乳房上半、4 指往內側張開壓下去、拇指在下外側），跟著乳房被拉的位置走。
//   算圖：knead_worker.js 背景算（底圖一次＋每個狀態被揉那一顆一張），算過的狀態留著。上色（皮膚、光、陰影）在這裡做。
(() => {
  const $ = (id) => document.getElementById(id);
  const PS = window.PartsShade;
  const SHAPES = [['round', '圓形'], ['bell', '鐘型'], ['pendulous', '下垂'], ['dome', '饅頭']];
  const CUPS = 'ABCDEFGHI'.split('');
  const AREOLAS = [['small', '小'], ['medium', '中'], ['large', '大'], ['huge', '巨大']];
  const SOFT = { dome: .6, round: 1, bell: 1.1, pendulous: 1.3 };   // 手感：饅頭硬、下垂軟
  const LV = [0, .32, .9];   // 第 1 段／第 2 段拉多遠（乳房半徑；使用者：第 2 段要大一點）
  const D1 = 16, D2 = 52;   // 拖多遠跳第一段／第二段（CSS 像素；使用者：這個距離可以）
  const K = 2, GIRTH = 1.1;
  const fill = (sel, list, def) => { sel.innerHTML = list.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); sel.value = def; };
  fill($('kn_s'), SHAPES, 'round');
  fill($('kn_c'), CUPS.map(c => [c, c + ' 罩杯']), 'E');
  fill($('kn_a'), AREOLAS, 'medium');

  const cv = $('kn_cv'), off = document.createElement('canvas'), octx = off.getContext('2d');
  let ctx = cv.getContext('2d');
  const hcv = document.createElement('canvas'), hctx = hcv.getContext('2d');
  const worker = new Worker('/droom/knead_worker.js?v=7');
  let gen = 0, base = null, W = 0, H = 0, cupBounce = .8, soft = 1, cam = null;
  const cache = new Map();   // key → { px, knead }
  let queue = [], busy = false, want = keyOf([0, 0, 0], 0), shown = null;
  let hold = null, bounce = null;

  function keyOf(o, pinch) { return o.map(v => (Math.round(v * 100) / 100).toFixed(2)).join(',') + '|' + pinch; }
  function parseKey(k) { const [a, p] = k.split('|'); return { o: a.split(',').map(Number), pinch: +p }; }
  const DIRS = [...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; });   // 0＝右、2＝上（螢幕）
  function pullO(dir, lv) {   // 拉的位置（單位＝乳房半徑）：x＝畫面右、z＝畫面上、y＝往前一點
    if (!lv) return [0, 0, 0];
    const amt = LV[lv] * soft, [dx, dz] = DIRS[dir];
    return [dx * amt, .06 * lv, dz * amt];
  }
  function bounceSeq(o0) {   // 放手：先回一半，再上下晃（往下拉的先往上彈，其他先往下沉）
    const a = Math.min(1.2, .35 + .5 * cupBounce) * soft, s = o0[2] < -.1 ? 1 : -1;
    return [[o0[0] * .45, 0, o0[2] * .45], [o0[0] * .12, 0, s * .2 * a], [0, 0, -s * .11 * a], [0, 0, s * .05 * a], [0, 0, 0]];
  }
  function prewarmKeys() {
    const ks = [keyOf([0, 0, 0], 0), keyOf([0, 0, 0], 1)];
    for (const lv of [1, 2]) for (let d = 0; d < 8; d++) ks.push(keyOf(pullO(d, lv), 1));
    for (const lv of [2, 1]) for (let d = 0; d < 8; d++) for (const o of bounceSeq(pullO(d, lv))) ks.push(keyOf(o, 0));
    return [...new Set(ks)];
  }
  function request(k, front) {
    if (cache.has(k)) return;
    queue = queue.filter(x => x !== k);
    front ? queue.unshift(k) : queue.push(k);
    pump();
  }
  function pump() {
    if (busy || !base || !queue.length) return;
    const k = queue.shift(); if (cache.has(k)) return pump();
    const { o, pinch } = parseKey(k);
    busy = true; worker.postMessage({ type: 'frame', gen, key: k, o, pinch });
  }
  worker.onmessage = (e) => {
    const m = e.data; if (m.gen !== gen) { busy = false; pump(); return; }
    if (m.type === 'base') {
      base = m.G; W = m.W; H = m.H; cam = m.cam; cupBounce = m.cupBounce; cv.width = off.width = W; cv.height = off.height = H;
      cv.style.aspectRatio = `${W} / ${H}`;
      window.__kn = [m.knead.nip[0] / W, m.knead.nip[1] / H];   // 測試用：右乳頭在畫面的位置（比例）
      cache.clear(); queue = prewarmKeys(); pump();
    } else {
      busy = false; cache.set(m.key, { G: m.G, knead: m.knead });
      if (m.key === want) draw();
      pump();
    }
    status();
  };
  function status() {
    const ks = prewarmKeys(), n = ks.filter(k => cache.has(k)).length;
    $('kn_st').textContent = !base ? '算底圖中…' : n < ks.length ? `預先算圖 ${n}/${ks.length}（算好的狀態切換很順）` : `${ks.length} 個狀態都算好了`;
  }
  function setup() {
    gen++; base = null; cache.clear(); queue = []; busy = false; hold = null; bounce = null; want = keyOf([0, 0, 0], 0); shown = null;
    soft = SOFT[$('kn_s').value] || 1;
    worker.postMessage({ type: 'setup', gen, K, maxPull: LV[2] * soft, look: { shape: $('kn_s').value, cup: $('kn_c').value, areola: $('kn_a').value } });
    ctx.clearRect(0, 0, cv.width, cv.height); status();
  }
  for (const id of ['kn_s', 'kn_c', 'kn_a']) $(id).onchange = setup;

  // ── 上色：肉色皮膚＋光（從深度算法線）＋陰影（附近有東西比較靠前＝被遮）＋外輪廓 ──
  // 2026-11-07 第 3 版（使用者：要 pix 風格、加一點陰影就好，不要變成光滑 3D）：每種顏色只有 4 階（亮／本色／陰影／深陰影）＋深色外框
  const TONES = {
    skin: [[255, 228, 208], [246, 202, 178], [222, 164, 144], [184, 122, 112]],
    areola: [[232, 156, 156], [218, 136, 138], [192, 110, 116], [160, 86, 96]],
    nipple: [[222, 132, 140], [204, 114, 124], [178, 92, 106], [148, 72, 88]],
  };
  const BG = [236, 232, 226], EDGE = [120, 70, 66];
  const TONE_AT = [1.04, .84, .66];   // 亮度 ≥ 這些 → 第 0／1／2 階，其餘第 3 階
  const LIGHT = (() => { const v = [-.35, .5, .79], l = Math.hypot(...v); return v.map(x => x / l); })();   // 左上前方
  function shadeSkin(G) {
    const { hit, tt, code } = G, n = W * H, out = new Uint8ClampedArray(n * 4);
    const ppy = cam.f / (cam.dist * GIRTH) * K, ppx = ppy * GIRTH, dW = 2 / GIRTH;   // 每單位幾像素（直／橫）；tt → 世界深度
    const D = (i) => tt[i] * dW;
    const JUMP = 1.2;   // 深度差超過＝不同表面（輪廓）
    const R = Math.max(3, Math.round(ppy * 1.6));   // 陰影取樣半徑
    const AO_DIRS = [...Array(12)].map((_, i) => [Math.cos(i * Math.PI / 6), Math.sin(i * Math.PI / 6)]);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = y * W + x, o = i * 4;
      if (!hit[i]) { out[o] = BG[0]; out[o + 1] = BG[1]; out[o + 2] = BG[2]; out[o + 3] = 255; continue; }
      const c = code[i], d0 = D(i);
      const g = (j1, j2, ok1, ok2) => {   // 單邊差分挑不跨輪廓的那邊
        const a = ok1 && hit[j1] && Math.abs(D(j1) - d0) < JUMP ? d0 - D(j1) : null, b = ok2 && hit[j2] && Math.abs(D(j2) - d0) < JUMP ? D(j2) - d0 : null;
        return a != null && b != null ? (a + b) / 2 : a != null ? a : b != null ? b : 0;
      };
      const gx = g(i - 1, i + 1, x > 0, x < W - 1) * ppx, gy = g(i - W, i + W, y > 0, y < H - 1) * ppy;   // 深度（往鏡頭）對世界距離的斜率
      let nx = -gx, ny = gy, nz = 1; const nl = Math.hypot(nx, ny, nz); nx /= nl; ny /= nl; nz /= nl;
      const dif = Math.max(0, nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]);
      let occ = 0;   // 附近比較靠前的東西＝陰影（乳房下緣、手指掐進去的凹）
      for (const [ax, ay] of AO_DIRS) for (const rr of [R * .35, R]) {
        const sx = Math.round(x + ax * rr), sy = Math.round(y + ay * rr); if (sx < 0 || sy < 0 || sx >= W || sy >= H) continue;
        const j = sy * W + sx; if (!hit[j]) continue;
        const dz = D(j) - d0; if (dz > .15) occ += Math.min(1, (dz - .15) / (rr / ppy * .9 + .3));
      }
      const ao = 1 - .55 * Math.min(1, occ / (AO_DIRS.length * 2) * 2.2);
      let edge = false;   // 外輪廓：旁邊是空的，或旁邊比自己後面很多（乳房蓋在身體上的那條線）
      for (const j of [i - 1, i + 1, i - W, i + W]) if (j < 0 || j >= n || !hit[j] || D(i) - D(j) > JUMP * 1.5) { edge = true; break; }
      const pal = c === 3 ? TONES.nipple : c === 2 ? TONES.areola : TONES.skin;
      const lum = (.5 + .58 * dif) * ao;
      let tone = lum >= TONE_AT[0] ? 0 : lum >= TONE_AT[1] ? 1 : lum >= TONE_AT[2] ? 2 : 3;
      if ((c === 121 || c === 122) && tone < 2) tone = 2;   // 鎖骨等線條：陰影色一條
      const col = edge ? EDGE : pal[tone];
      out[o] = col[0]; out[o + 1] = col[1]; out[o + 2] = col[2]; out[o + 3] = 255;
    }
    return out;
  }

  function merge(A, B) {   // 每格取比較靠前的（線條稍微優先，同 parts_shade）
    const n = W * H, hit = new Uint8Array(n), tt = new Float32Array(n), code = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      const a = A.hit[i], b = B.hit[i];
      if (!a && !b) continue;
      const pickB = b && (!a || B.tt[i] + (B.code[i] >= 121 ? .02 : 0) > A.tt[i] + (A.code[i] >= 121 ? .02 : 0));
      const S = pickB ? B : A; hit[i] = 1; tt[i] = S.tt[i]; code[i] = S.code[i];
    }
    return { hit, tt, code };
  }
  function draw() {
    const f = cache.get(want) || shown; if (!f || !base) return;
    shown = f;
    const px = shadeSkin(merge(base, f.G));
    octx.putImageData(new ImageData(px, W, H), 0, 0);
    ctx.drawImage(off, 0, 0);
    if (hold && f.knead && parseKey(want).pinch) drawHand(f.knead);
  }

  // ── 人手剪影（黑，真人大小）：模型給骨架（指尖、指根、手腕、拇指根／尖的畫面座標）——
  //   前臂從右上出畫面 → 手背（指根那排寬、手腕窄的圓角梯形）→ 4 指併攏（小指在上內側、食指靠拇指；中指最長）→ 拇指在下外側
  function capsule(a, b, wa, wb) {   // 一節：兩端圓、粗細漸變
    const dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L, an = Math.atan2(dy, dx);
    ctx.beginPath();
    ctx.moveTo(a[0] + nx * wa, a[1] + ny * wa); ctx.lineTo(b[0] + nx * wb, b[1] + ny * wb);
    ctx.arc(b[0], b[1], wb, an + Math.PI / 2, an - Math.PI / 2, true);
    ctx.lineTo(a[0] - nx * wa, a[1] - ny * wa);
    ctx.arc(a[0], a[1], wa, an - Math.PI / 2, an + Math.PI / 2, true);
    ctx.fill();
  }
  const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  function drawHand(k) {
    const h = k.hand; if (!h) return;
    const U = k.pxPerUnit, fr = h.fingerR * U, { tips, knuck, wrist } = h;
    // 整隻手先畫在另一張（不透明），最後整張用 90% 疊上去：零件重疊的地方才不會比較黑
    if (hcv.width !== W || hcv.height !== H) { hcv.width = W; hcv.height = H; }
    const real = ctx; ctx = hctx; ctx.clearRect(0, 0, W, H);
    ctx.save(); ctx.fillStyle = ctx.strokeStyle = 'rgb(14,10,18)'; ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    // 前臂：手腕往右上出畫面
    const dir = [wrist[0] - (knuck[1][0] + knuck[2][0]) / 2, wrist[1] - (knuck[1][1] + knuck[2][1]) / 2], dl = Math.hypot(...dir);
    const far = [wrist[0] + dir[0] / dl * W, wrist[1] + dir[1] / dl * W];
    capsule(far, wrist, 3.0 * U, 2.35 * U);
    // 手背：指根那排（兩端往外一點）＋手腕兩側，圓角
    const kv = [knuck[3][0] - knuck[0][0], knuck[3][1] - knuck[0][1]], kl = Math.hypot(...kv), ku = [kv[0] / kl, kv[1] / kl];
    const wv = [-dir[1] / dl, dir[0] / dl], s = Math.sign(wv[0] * ku[0] + wv[1] * ku[1]) || 1;
    const poly = [[knuck[0][0] - ku[0] * fr * .9, knuck[0][1] - ku[1] * fr * .9], ...knuck, [knuck[3][0] + ku[0] * fr * 1.1, knuck[3][1] + ku[1] * fr * 1.1],
      [wrist[0] + wv[0] * s * 2.3 * U, wrist[1] + wv[1] * s * 2.3 * U], [wrist[0] - wv[0] * s * 2.2 * U, wrist[1] - wv[1] * s * 2.2 * U]];
    ctx.lineWidth = fr * 1.6; ctx.beginPath(); poly.forEach((p, i) => i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])); ctx.closePath(); ctx.fill(); ctx.stroke();
    // 4 指：指根 → 中節（往外拱一點＝指節彎下去壓）→ 指尖；小指細
    const WID = [.82, .95, 1, .97];
    tips.forEach((tip, i) => {
      const b = knuck[i], w = fr * WID[i], m = lerp(b, tip, .55), L = Math.hypot(tip[0] - b[0], tip[1] - b[1]) || 1;
      const bend = [m[0] - (tip[1] - b[1]) / L * w * .25 * s, m[1] + (tip[0] - b[0]) / L * w * .25 * s];
      capsule(b, bend, w * 1.05, w * .98); capsule(bend, tip, w * .98, w * .86);
    });
    // 拇指：拇指根 → 中節 → 拇指尖（下外側托著）
    const tb = h.thumbBase, tt = h.thumbTip, tm = lerp(tb, tt, .5);
    capsule(tb, tm, fr * 1.35, fr * 1.15); capsule(tm, tt, fr * 1.15, fr * 1.0);
    ctx.restore();
    { const im = hctx.getImageData(0, 0, W, H), a = im.data; for (let i = 3; i < a.length; i += 4) a[i] = a[i] >= 128 ? 255 : 0; hctx.putImageData(im, 0, 0); }   // pix 風格：手的邊不要糊（不透明度二分）
    ctx = real; ctx.save(); ctx.globalAlpha = .9; ctx.drawImage(hcv, 0, 0); ctx.restore();
  }

  // 互動：按住右乳＝掐；拖＝8 方向 × 2 段
  const toCv = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; };
  cv.addEventListener('pointerdown', (e) => {
    const f = cache.get(keyOf([0, 0, 0], 0)) || shown; if (!f || !f.knead) return;
    const [x, y] = toCv(e), k = f.knead, R = k.r * k.pxPerUnit;
    if (Math.hypot(x - k.nip[0], y - k.nip[1]) > R * 1.7) return;   // 只有按在右乳上才算
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    bounce = null; hold = { x0: e.clientX, y0: e.clientY, dir: 0, lv: 0 };
    setWant(keyOf([0, 0, 0], 1)); $('kn_now').textContent = '掐著';
  });
  cv.addEventListener('pointermove', (e) => {
    if (!hold) return;
    const dx = e.clientX - hold.x0, dy = e.clientY - hold.y0, d = Math.hypot(dx, dy);
    const lv = d < D1 ? 0 : d < D2 ? 1 : 2, dir = ((Math.round(Math.atan2(-dy, dx) / (Math.PI / 4)) % 8) + 8) % 8;
    if (lv === hold.lv && (lv === 0 || dir === hold.dir)) return;
    hold.lv = lv; hold.dir = dir;
    setWant(keyOf(pullO(dir, lv), 1));
    $('kn_now').textContent = lv ? `往${['右', '右上', '上', '左上', '左', '左下', '下', '右下'][dir]}拉・第 ${lv} 段` : '掐著';
  });
  const release = () => {
    if (!hold) return;
    const o0 = pullO(hold.dir, hold.lv); hold = null; $('kn_now').textContent = '放手';
    bounce = { seq: bounceSeq(o0), i: 0 };
    stepBounce();
  };
  cv.addEventListener('pointerup', release); cv.addEventListener('pointercancel', release);
  function stepBounce() {
    if (!bounce) return;
    if (bounce.i >= bounce.seq.length) { bounce = null; $('kn_now').textContent = ''; return; }
    const k = keyOf(bounce.seq[bounce.i], 0);
    setWant(k);
    const next = () => { if (!bounce) return; if (!cache.has(k)) return setTimeout(next, 30); bounce.i++; setTimeout(stepBounce, 75); };
    next();
  }
  function setWant(k) { want = k; if (cache.has(k)) draw(); else { request(k, true); draw(); } }
  cv.style.touchAction = 'none';
  setup();
})();
