/* 聊天時放大的她（2026-11-19，使用者：按房間裡的黑影聊天時，把黑影放大、視角改成水平）。
   v3（使用者：乳型不對，套 droom 的）：人偶改用 droom 人偶，正面平視、黑影配色。
   v4（使用者：用 droom-chest-model 分支的新乳房，只換聊天）：載 droom/room_doll_chest.js（分支的 room_doll_full.js），
   胸型照 look.breast_shape（使用者確認的表，見 SHAPE_OF）、乳暈照 look.areola（small／medium／large／huge）。
   動作是 3D 人偶逐格算出來的：droom render 的 opts.deform 在畫之前照部位動零件——
     breathe：吸氣吐氣（胸廓由下往上抬、胸部往前往外、肩膀／手／頭跟著上去）、頭微歪；
     talk：短氣、頭歪＋點頭、空著的手從肩膀和手肘抬起來比劃。
   一組 16 格在 Web Worker 算（droom 一格要 0.1～0.4 秒），第一格到了就先顯示。
   有立繪的話立繪縮小、靠左下。做愛對話（主圖是做愛步驟圖）、脫衣對話、房間場面不畫，立繪照原本的位置。 */
(function () {
  'use strict';
  const DROOM_URL = new URL('../droom/room_doll_chest.js?v=1', (document.currentScript && document.currentScript.src) || location.href).href;
  const N = 16, FPS = { breathe: 4, talk: 7 };
  const SCALE = 2, CV = { w: 84, h: 134, ax: 42, ay: 131, tMax: 40, tMin: -45 };   // 手抬起來也在框內；腳底固定在 ay

  // look.breast_shape → 模型乳型（照 droom-chest-model 備忘錄 MEMO-2026-11-18、使用者確認的表）；外擴／八字使用者取消 → 先用自然圓潤
  const SHAPE_OF = [[/母乳|沉重/, { shape: 'heavy' }], [/木瓜/, { shape: 'pendulous' }], [/鐘/, { shape: 'bell' }], [/水滴/, { shape: 'teardrop' }],
    [/深溝|極密/, { shape: 'round', gap: 'close' }], [/半球/, { shape: 'round', braSupport: true }], [/挺俏|上挺/, { shape: 'perky' }],
    [/饅頭/, { shape: 'dome' }], [/平坦|微隆/, { shape: 'flat' }]];
  function shapeOf(t) { t = String(t || ''); for (const [re, v] of SHAPE_OF) if (re.test(t)) return v; return { shape: 'round' }; }
  function areolaOf(t) {
    t = String(t || '');
    if (/佔滿|誇張/.test(t)) return 'huge';
    if (/偏大|寬廣|大乳暈|偏腫|深咖啡/.test(t)) return 'large';
    if (/小巧|偏小/.test(t)) return 'small';
    return 'medium';
  }

  /** 第 f 格的動作量（worker 裡也用，不能用外面的變數）。 */
  function motion(pose, f, n) {
    const ph = 2 * Math.PI * f / n;
    const breath = (q) => { q = ((q % 1) + 1) % 1; return q < .4 ? .5 - .5 * Math.cos(Math.PI * q / .4) : .5 + .5 * Math.cos(Math.PI * (q - .4) / .6); };
    if (pose === 'talk') return { ph, br: .65 * breath(2 * f / n),
      tilt: 3.2 * Math.sin(ph) + 1.2 * Math.sin(3 * ph + .5),
      nod: 4.5 * Math.max(0, Math.sin(2 * ph)) ** 1.5 - 1.2 * Math.sin(3 * ph + 1),
      gest: .5 - .5 * Math.cos(ph) };
    return { ph, br: breath(f / n), tilt: 1.6 * Math.sin(ph + .6), nod: 0, gest: 0 };
  }

  /** 照部位動零件（droom render 的 opts.deform）。H：droom 的矩陣小工具。 */
  function deform(sh, P, H, m) {
    const { br, tilt, nod, gest, ph } = m, lift = br * 1.6, hl = lift * .85, S = P.S, zW = S - .6 * P.T;
    const tr = (p, dx, dy, dz) => { p.off = [p.off[0] + dx, p.off[1] + dy, p.off[2] + dz]; };
    const rot = (p, X) => { p.xf = p.xf ? H.compose(X, p.xf) : X; };
    const head = sh.prims.find(p => p.part === 'head'), o = head ? head.off : [0, 0, 0];
    const headX = tilt || nod ? H.about(H.mulR(H.rotY(tilt), H.rotX(-nod)), [o[0], o[1], S - 1 + o[2] + hl]) : null;
    // 比劃的手（armL：空著的那隻；armR 插腰）：上臂繞肩膀往外抬、前臂繞手肘再往上往前
    let upX = null, foreX = null, upper = null;
    const arm = sh.prims.filter(p => p.part === 'armL' && p.a);
    if (gest > 0 && arm.length >= 2) {
      arm.sort((a, b) => (b.a[2] + b.off[2]) - (a.a[2] + a.off[2]));
      upper = arm[0];
      const sp = [arm[0].a[0] + arm[0].off[0], arm[0].a[1] + arm[0].off[1], arm[0].a[2] + arm[0].off[2] + lift * .9];
      const ep = [arm[1].a[0] + arm[1].off[0], arm[1].a[1] + arm[1].off[1], arm[1].a[2] + arm[1].off[2] + lift * .9];
      // 上臂：手肘往外、往前一點；前臂：繞手肘往前上方抬（手在手肘上方、略往外＝攤手說話），手腕跟著話左右晃
      upX = H.about(H.mulR(H.rotY(14 * gest), H.rotX(12 * gest)), sp);
      const e2 = H.mulV(upX.R, ep); e2[0] += upX.t[0]; e2[1] += upX.t[1]; e2[2] += upX.t[2];
      // 前臂：從現在的方向轉到「往上、往前、略往外」（手在手肘上方、肩膀前下＝說話攤手），轉角乘 gest；手腕跟著話左右擺
      const w0 = [arm[2] ? arm[2].a[0] + arm[2].off[0] : ep[0], arm[2] ? arm[2].a[1] + arm[2].off[1] : ep[1], arm[2] ? arm[2].a[2] + arm[2].off[2] + lift * .9 : ep[2] - 10];
      const w1 = H.mulV(upX.R, w0); w1[0] += upX.t[0]; w1[1] += upX.t[1]; w1[2] += upX.t[2];
      const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
      const u = nrm([w1[0] - e2[0], w1[1] - e2[1], w1[2] - e2[2]]);
      const v = nrm([Math.sign(sp[0]) * (.12 + .16 * Math.sin(4 * ph)), .62, .78]);
      const ax = nrm([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
      const ang = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * gest;
      const c = Math.cos(ang), sn = Math.sin(ang), t = 1 - c, [x, y, z] = ax;
      const RA = [c + t * x * x, t * x * y - sn * z, t * x * z + sn * y, t * x * y + sn * z, c + t * y * y, t * y * z - sn * x, t * x * z - sn * y, t * y * z + sn * x, c + t * z * z];
      foreX = H.compose(H.about(RA, e2), upX);
    }
    for (const p of sh.prims) {
      const z = p.bc[2] + p.off[2], part = p.part;
      if (part === 'head' || p.mat === 1) { tr(p, 0, 0, hl); if (headX) rot(p, headX); }
      else if (part === 'chest') { const f = Math.max(0, Math.min(1, (z - zW) / (S - zW))); tr(p, 0, .3 * br * f, lift * f); }
      else if (part === 'breast') { const s = Math.sign(p.bc[0] + p.off[0]) || 1; tr(p, s * .3 * br, .45 * br, lift * .75); }
      else if (part === 'waist') tr(p, 0, .15 * br, lift * .12);
      else if (part === 'armL') { tr(p, 0, 0, lift * .9); if (upX) rot(p, p === upper ? upX : foreX); }
      else if (part === 'armR') tr(p, 0, 0, lift * .5);
    }
    for (const st of sh.areolaStamps || []) { const s = Math.sign(st.q[0]) || 1; st.q = [st.q[0] + s * .3 * br, st.q[1] + .45 * br, st.q[2] + lift * .75]; }
  }

  /** droom 的部位標記色 → 房間黑影配色（白邊→深線；乳暈乳頭→淡淡的印子；摺線→身體色）。 */
  function shade(px) {
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      let o = null;
      if (r === 240 && g === 240 && b === 240) o = [30, 24, 40];
      else if (r === 150 && g === 100 && b === 128) o = [72, 58, 84];
      else if (r === 205 && g === 150 && b === 175) o = [88, 72, 100];
      else if ((r === 90 && g === 60 && b === 60) || (r === 110 && g === 75 && b === 75)) o = [51, 45, 64];
      if (o) { px[i] = o[0]; px[i + 1] = o[1]; px[i + 2] = o[2]; }
    }
  }

  // ---------------------------------------------------------------- droom 人偶＋worker
  let F = null, loading = null, worker = null, seq = 0;
  const waiters = new Map();
  function loadDroom() {
    if (F) return Promise.resolve(F);
    if (!loading) loading = fetch(DROOM_URL).then(r => r.text()).then(src => {
      const box = {};
      new Function('globalThis', 'module', src)(box, undefined);   // 兩個人偶檔都叫 RoomDoll → 另外裝，不蓋掉房間用的
      F = box.RoomDoll;
      try {
        const code = `const F=(${F.factorySource})();const motion=${motion};const deform=${deform};const shade=${shade};const CV=${JSON.stringify(CV)};
onmessage=(e)=>{const j=e.data;try{const m=motion(j.pose,j.f,j.n);const r=F.render(j.doll,'idle',0,0,{scale:${SCALE},cv:CV,deform:(sh,P,H)=>deform(sh,P,H,m)});shade(r.pixels);postMessage({id:j.id,w:r.width,h:r.height,px:r.pixels},[r.pixels.buffer]);}catch(err){postMessage({id:j.id,err:String(err)});}};`;
        worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
        worker.onmessage = (e) => { const w = waiters.get(e.data.id); if (w) { waiters.delete(e.data.id); w(e.data); } };
      } catch { worker = null; }
      return F;
    });
    return loading;
  }
  function renderFrame(doll, pose, f) {
    if (worker) {
      const id = ++seq;
      return new Promise((res) => { waiters.set(id, res); worker.postMessage({ id, doll, pose, f, n: N }); });
    }
    const m = motion(pose, f, N);
    const r = F.render(doll, 'idle', 0, 0, { scale: SCALE, cv: CV, deform: (sh, P, H) => deform(sh, P, H, m) });
    shade(r.pixels);
    return Promise.resolve({ w: r.width, h: r.height, px: r.pixels });
  }

  // ---------------------------------------------------------------- 畫面
  let wrap = null, canvas = null, ctx = null;
  let cur = null;          // { key, sets: { breathe: ImageData[], talk: ImageData[] }, dead }
  let talkUntil = 0, raf = 0, clock = 0, lastT = 0, mode = 'breathe';

  function ensureEl() {
    if (wrap) return wrap;
    const talk = document.querySelector('#portrait-sheet .talk');
    if (!talk) return null;
    wrap = document.createElement('div');
    wrap.id = 'chat-shadow';
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    canvas.width = CV.w * SCALE; canvas.height = CV.h * SCALE;
    ctx = canvas.getContext('2d');
    wrap.appendChild(canvas);
    talk.insertBefore(wrap, talk.firstChild);
    return wrap;
  }

  function spec() {
    try { return typeof window.RoomLookProvider === 'function' ? window.RoomLookProvider() : null; } catch { return null; }
  }

  /** 換人／換身形 → 重算兩組動畫；第一格到了才顯示。 */
  function prepare(s) {
    if (!F) { loadDroom().then(sync).catch(e => console.warn('chat_shadow', e)); return false; }
    const doll = F.lookToDoll(s.look || null, { outfit: s.outfit, undressStage: s.undressStage, belly: s.belly });
    Object.assign(doll, shapeOf(s.look?.breast_shape));
    doll.areola = areolaOf(s.look?.areola);
    const key = F.dollKey(doll) + '|' + doll.shape + '|' + (doll.gap || '') + '|' + (doll.braSupport ? 'sup' : '') + '|' + doll.areola;
    if (cur && cur.key === key) return !!cur.sets.breathe[0];
    if (cur) cur.dead = true;
    const job = cur = { key, sets: { breathe: [], talk: [] }, dead: false };
    const todo = [];
    for (let f = 0; f < N; f++) todo.push(['breathe', f]);
    for (let f = 0; f < N; f++) todo.push(['talk', f]);
    (async () => {
      for (const [pose, f] of todo) {
        if (job.dead) return;
        const r = await renderFrame(doll, pose, f);
        if (job.dead) return;
        if (r.err) { console.warn('chat_shadow', r.err); return; }
        job.sets[pose][f] = new ImageData(new Uint8ClampedArray(r.px), r.w, r.h);
        if (pose === 'breathe' && f === 0) sync();
      }
    })();
    return false;
  }

  function full(set) { if (set.length < N) return false; for (let i = 0; i < N; i++) if (!set[i]) return false; return true; }

  function tick(t) {
    raf = 0;
    if (!wrap || wrap.hidden || !cur) return;
    const dt = Math.min(.25, lastT ? (t - lastT) / 1000 : 0); lastT = t;
    const next = t < talkUntil && full(cur.sets.talk) ? 'talk' : 'breathe';
    if (next !== mode) { mode = next; clock = 0; }
    const set = cur.sets[mode];
    clock += dt * FPS[mode];
    let i = Math.floor(clock) % N;
    if (!set[i]) { i = 0; clock = 0; }   // 還沒算好的格：先停在第一格
    if (set[i] && canvas.dataset.f !== mode + i) { ctx.putImageData(set[i], 0, 0); canvas.dataset.f = mode + i; }
    raf = requestAnimationFrame(tick);
  }
  function play() { if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function wanted(sheet) {
    if (!sheet || sheet.hidden) return null;
    if (sheet.classList.contains('undress-chat')) return null;
    const img = document.getElementById('portrait-img');
    if (img && img.dataset.sexStep) return null;   // 做愛對話：主圖是步驟圖
    if (document.getElementById('room-scene-overlay')?.hidden === false) return null;
    const s = spec();
    return s && s.look !== undefined ? s : null;
  }

  function sync() {
    const sheet = document.getElementById('portrait-sheet');
    if (!ensureEl()) return;
    const s = wanted(sheet);
    const on = !!(s && prepare(s));
    if (on && wrap.hidden) {
      canvas.dataset.f = '';
      wrap.hidden = false;
      wrap.classList.remove('cs-in');
      void wrap.offsetWidth;
      requestAnimationFrame(() => wrap.classList.add('cs-in'));
    } else if (!on && !wrap.hidden) {
      wrap.hidden = true;
      wrap.classList.remove('cs-in');
    }
    if (on) play(); else stop();
    sheet?.classList.toggle('has-shadow', on);
  }

  /** 她的字一個一個出來 → 說話動作；停下來 0.9 秒後回到呼吸。 */
  function talking() { talkUntil = performance.now() + 900; }

  function boot() {
    const sheet = document.getElementById('portrait-sheet');
    if (!sheet) return;
    ensureEl();
    const mo = new MutationObserver(sync);
    mo.observe(sheet, { attributes: true, attributeFilter: ['hidden', 'class'] });
    const img = document.getElementById('portrait-img');
    if (img) mo.observe(img, { attributes: true, attributeFilter: ['data-sex-step'] });
    const scene = document.getElementById('room-scene-overlay');
    if (scene) mo.observe(scene, { attributes: true, attributeFilter: ['hidden'] });
    const meta = document.getElementById('portrait-meta');   // 她說的話
    if (meta) new MutationObserver(talking).observe(meta, { childList: true, subtree: true, characterData: true });
    // 換衣服、脫衣、懷孕肚子變了：開著的時候每 2 秒對一次（同一個身形不重算）
    setInterval(() => { if (!sheet.hidden) sync(); }, 2000);
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.ChatShadow = { sync, shapeOf, areolaOf, motion, deform, shade };
})();
