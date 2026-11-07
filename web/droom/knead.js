// 2026-11-07 揉乳房視窗（droom index.html 最下面；先做右邊那顆＝畫面右邊）。
//   選乳型／罩杯／乳暈 → 畫她胸口正面（透視攝影機近景）。
//   手指按住右乳＝掐（一段）；按住拖＝像搖桿往 8 個方向拉，拖遠有兩段（超過距離跳下一段）；放手＝彈回去晃幾下（大多上下晃）。
//   黑手：4 指從上外側抓、拇指在下面，跟著乳房被拉的位置走。
//   算圖：knead_worker.js 背景算（底圖一次＋每個狀態被揉那一顆一張），算過的狀態留著，之後切換不用再算。
(() => {
  const $ = (id) => document.getElementById(id);
  const PS = window.PartsShade;
  const SHAPES = [['round', '圓形'], ['bell', '鐘型'], ['pendulous', '下垂'], ['dome', '饅頭']];
  const CUPS = 'ABCDEFGHI'.split('');
  const AREOLAS = [['small', '小'], ['medium', '中'], ['large', '大'], ['huge', '巨大']];
  const SOFT = { dome: .6, round: 1, bell: 1.1, pendulous: 1.3 };   // 手感：饅頭硬、下垂軟
  const CAM = { dist: 60, eyeZ: 78, pitch: 0, f: 330, w: 180, h: 200, cx: 90, cy: 100 };   // 脖子到胸下（照使用者手稿）
  const D1 = 16, D2 = 52;   // 拖多遠跳第一段／第二段（CSS 像素）
  const fill = (sel, list, def) => { sel.innerHTML = list.map(([v, t]) => `<option value="${v}">${t}</option>`).join(''); sel.value = def; };
  fill($('kn_s'), SHAPES, 'round');
  fill($('kn_c'), CUPS.map(c => [c, c + ' 罩杯']), 'E');
  fill($('kn_a'), AREOLAS, 'medium');
  fill($('kn_k'), [['2', '清楚（2×）'], ['1', '快（1×）']], '2');

  const cv = $('kn_cv'), ctx = cv.getContext('2d'), off = document.createElement('canvas'), octx = off.getContext('2d');
  const worker = new Worker('/droom/knead_worker.js?v=1');
  let gen = 0, base = null, W = 0, H = 0, cupBounce = .8, soft = 1;
  const cache = new Map();   // key → { px, knead }
  let queue = [], busy = false, want = keyOf([0, 0, 0], 0), shown = null;
  let hold = null, bounce = null;

  function keyOf(o, pinch) { return o.map(v => (Math.round(v * 100) / 100).toFixed(2)).join(',') + '|' + pinch; }
  function parseKey(k) { const [a, p] = k.split('|'); return { o: a.split(',').map(Number), pinch: +p }; }
  const DIRS = [...Array(8)].map((_, i) => { const a = i * Math.PI / 4; return [Math.cos(a), Math.sin(a)]; });   // 0＝右、2＝上（螢幕）
  function pullO(dir, lv) {   // 拉的位置（單位＝乳房半徑）：x＝畫面右、z＝畫面上、y＝往前一點
    if (!lv) return [0, 0, 0];
    const amt = (lv === 1 ? .32 : .62) * soft, [dx, dz] = DIRS[dir];
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
      base = m.px; W = m.W; H = m.H; cupBounce = m.cupBounce; cv.width = off.width = W; cv.height = off.height = H;
      cache.clear(); queue = prewarmKeys(); pump();
    } else {
      busy = false; cache.set(m.key, { px: m.px, knead: m.knead });
      if (m.key === want) draw();
      pump();
    }
    status();
  };
  function status() {
    const n = prewarmKeys().filter(k => cache.has(k)).length, all = prewarmKeys().length;
    $('kn_st').textContent = !base ? '算底圖中…' : n < all ? `預先算圖 ${n}/${all}（算好的狀態切換很順）` : `${all} 個狀態都算好了`;
  }
  function setup() {
    gen++; base = null; cache.clear(); queue = []; busy = false; hold = null; bounce = null; want = keyOf([0, 0, 0], 0); shown = null;
    soft = SOFT[$('kn_s').value] || 1;
    const K = +$('kn_k').value;
    worker.postMessage({ type: 'setup', gen, K, cam: CAM, look: { shape: $('kn_s').value, cup: $('kn_c').value, areola: $('kn_a').value } });
    ctx.clearRect(0, 0, cv.width, cv.height); status();
  }
  for (const id of ['kn_s', 'kn_c', 'kn_a', 'kn_k']) $(id).onchange = setup;

  function draw() {
    const f = cache.get(want) || shown; if (!f || !base) return;
    shown = f;
    const n = W * H, px = PS.shade(PS.merge([base, f.px], n), W, H);
    octx.putImageData(new ImageData(px, W, H), 0, 0);
    ctx.fillStyle = '#ece8e2'; ctx.fillRect(0, 0, W, H); ctx.drawImage(off, 0, 0);
    if (hold && f.knead && parseKey(want).pinch) drawHand(f.knead);
  }
  // 黑手（2026-11-07 第 2 版：不要像爪子）：手掌蓋在乳房上外側，4 根粗手指張開往乳頭方向壓下去、指尖到掐的點；
  //   拇指從手掌外側沿乳房外緣繞到下面；前臂往畫面右上出去。
  function drawHand(k) {
    const R = k.r * k.pxPerUnit, F = k.fingers.filter(f => !f.thumb).map(f => f.p), T = k.fingers.find(f => f.thumb).p, N = k.nip;
    const fc = F.reduce((a, p) => [a[0] + p[0] / F.length, a[1] + p[1] / F.length], [0, 0]);
    const palm = [N[0] + R * .95, N[1] - R * 1.05];   // 跟著乳頭（被拉的位置）走
    ctx.save(); ctx.fillStyle = ctx.strokeStyle = 'rgba(12,9,16,.88)'; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.lineWidth = R * 1.0; ctx.beginPath(); ctx.moveTo(palm[0], palm[1]); ctx.lineTo(palm[0] + R * 2.4, palm[1] - R * 2.8); ctx.stroke();   // 前臂
    ctx.beginPath(); ctx.ellipse(palm[0], palm[1], R * .78, R * .62, -.75, 0, Math.PI * 2); ctx.fill();   // 手掌
    ctx.lineWidth = R * .34;
    F.forEach((p, i) => {   // 手指：從手掌靠乳頭那側出來，中段微微拱起（指節），指尖壓在掐的點
      const b = [palm[0] + (p[0] - palm[0]) * .3, palm[1] + (p[1] - palm[1]) * .3];
      const m = [(b[0] + p[0]) / 2 - (p[1] - b[1]) * .12, (b[1] + p[1]) / 2 + (p[0] - b[0]) * .12];
      ctx.beginPath(); ctx.moveTo(b[0], b[1]); ctx.quadraticCurveTo(m[0], m[1], p[0], p[1]); ctx.stroke();
    });
    ctx.lineWidth = R * .38;   // 拇指
    ctx.beginPath(); ctx.moveTo(palm[0] + R * .25, palm[1] + R * .35); ctx.quadraticCurveTo(N[0] + R * 1.35, N[1] + R * .55, T[0], T[1]); ctx.stroke();
    ctx.restore();
  }

  // 互動：按住右乳＝掐；拖＝8 方向 × 2 段
  const toCv = (e) => { const b = cv.getBoundingClientRect(); return [(e.clientX - b.left) * W / b.width, (e.clientY - b.top) * H / b.height]; };
  cv.addEventListener('pointerdown', (e) => {
    const f = cache.get(keyOf([0, 0, 0], 0)) || shown; if (!f || !f.knead) return;
    const [x, y] = toCv(e), k = f.knead, R = k.r * k.pxPerUnit;
    if (Math.hypot(x - k.nip[0], y - k.nip[1]) > R * 1.7) return;   // 只有按在右乳上才算
    e.preventDefault(); cv.setPointerCapture(e.pointerId);
    bounce = null; hold = { x0: e.clientX, y0: e.clientY, dir: 0, lv: 0 };
    setWant(keyOf([0, 0, 0], 1));
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
