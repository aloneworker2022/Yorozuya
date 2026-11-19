/* 聊天時放大的她（2026-11-19，使用者：按房間裡的黑影聊天時，把黑影放大、視角改成水平）。
   v3（使用者：乳型不對，套 droom 的）：人偶改用 droom 人偶，正面平視、黑影配色。
   v4（使用者：用 droom-chest-model 分支的新乳房，只換聊天）：載 droom/room_doll_chest.js（分支的 room_doll_full.js），
   胸型照 look.breast_shape（使用者確認的表，見 SHAPE_OF）、乳暈照 look.areola（small／medium／large／huge）。
   動作是 3D 人偶逐格算出來的：droom render 的 opts.deform 在畫之前照部位動零件——
     breathe：吸氣吐氣（胸廓由下往上抬、胸部往前往外、肩膀／手／頭跟著上去）、頭微歪；
     talk：短氣、頭歪＋點頭、空著的手從肩膀和手肘抬起來比劃。
   一組 16 格在 Web Worker 算（droom 一格要 0.1～0.4 秒），第一格到了就先顯示。
   顯示：聊天先出現黑影（立繪藏起來）；長按黑影的頭 → 換成半身立繪；長按立繪 → 回到黑影（v8）。做愛對話（主圖是做愛步驟圖）、脫衣對話、房間場面不畫，立繪照原本的位置。 */
(function () {
  'use strict';
  const DROOM_URL = new URL('../droom/room_doll_chest.js?v=5', (document.currentScript && document.currentScript.src) || location.href).href;
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

  /** 照部位動零件（droom render 的 opts.deform）。H：droom 的矩陣小工具＋primDist。
   *  身體零件照部位動；衣服零件（襯衫、胸罩、丁字褲）跟著離它最近的身體零件一起動。 */
  function deform(sh, P, H, m) {
    const { br, tilt, nod, gest, ph } = m, lift = br * 1.6, hl = lift * .85, S = P.S, zW = S - .6 * P.T;
    const head = sh.prims.find(p => p.part === 'head'), o = head ? head.off : [0, 0, 0];
    const headX = tilt || nod ? H.about(H.mulR(H.rotY(tilt), H.rotX(-nod)), [o[0], o[1], S - 1 + o[2] + hl]) : null;
    // 比劃的手（armL：空著的那隻；armR 插腰）：上臂繞肩膀往外抬、前臂繞手肘轉到往上往前（攤手）
    let upX = null, foreX = null, upper = null;
    const arm = sh.prims.filter(p => p.part === 'armL' && p.a && !p.cloth);
    arm.sort((a, b) => (b.a[2] + b.off[2]) - (a.a[2] + a.off[2]));
    upper = arm[0] || null;
    if (gest > 0 && arm.length >= 2) {
      const sp = [arm[0].a[0] + arm[0].off[0], arm[0].a[1] + arm[0].off[1], arm[0].a[2] + arm[0].off[2] + lift * .9];
      const ep = [arm[1].a[0] + arm[1].off[0], arm[1].a[1] + arm[1].off[1], arm[1].a[2] + arm[1].off[2] + lift * .9];
      upX = H.about(H.mulR(H.rotY(14 * gest), H.rotX(12 * gest)), sp);
      const e2 = H.mulV(upX.R, ep); e2[0] += upX.t[0]; e2[1] += upX.t[1]; e2[2] += upX.t[2];
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
    // 軀幹（含乳房、衣服）用連續的位移場，不照零件分段——不然衣服一圈一圈跟不同零件走會裂開：
    //   往上：從胯下 0 平滑升到肩膀 lift；往前：胸口最多；乳房附近再往前往外一點（越靠近乳房中心越多）
    const C = P.C, sm = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    const bc = [-1, 1].map(sd => { const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && Math.sign(p.bc[0] + p.off[0]) === sd); if (!L.length) return null; const c = [0, 0, 0]; let r = 0; for (const p of L) { for (let i = 0; i < 3; i++) c[i] += (p.bc[i] + p.off[i]) / L.length; r = Math.max(r, p.br); } return { c, r: Math.min(r, 9) + 2 }; });
    const field = (q) => {
      const f = sm((q[2] - C) / (S - C)), fc = sm((q[2] - zW) / (S - zW));
      const d = [0, .3 * br * fc, lift * f];
      for (const [i, b] of bc.entries()) if (b) { const w = 1 - Math.hypot(q[0] - b.c[0], q[1] - b.c[1], q[2] - b.c[2]) / b.r; if (w > 0) { const ws = sm(w); d[0] += (i ? 1 : -1) * .3 * br * ws; d[1] += .2 * br * ws; } }
      return d;
    };
    /** 一個身體零件這格怎麼動：[dx, dy, dz, 轉動或 null]。 */
    const act = (p, q) => {
      const part = p.part;
      if (part === 'head' || p.mat === 1) return [0, 0, hl, headX];
      if (part === 'armL') return [0, 0, lift * .9, upX ? (p === upper ? upX : foreX) : null];
      if (part === 'armR') return [0, 0, lift * .5, null];
      if (part === 'legs') return null;
      const d = field(q); d.push(null); return d;
    };
    const body = sh.prims.filter(p => p.mat === 0 && !p.cloth && !p.carve);
    const acts = new Map();
    for (const p of sh.prims) {
      let a;
      const q = [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      if (p.sleeve) {   // 襯衫袖子：上臂那段跟上臂、前臂那段跟前臂
        const L = p.bc[0] + p.off[0] < 0 ? 'armL' : 'armR';
        a = L === 'armR' ? [0, 0, lift * .5, null] : [0, 0, lift * .9, upX ? (p.sleeve === 1 ? upX : foreX) : null];
      } else if (p.cloth) {   // 衣服：最近的身體零件是手／頭 → 跟著它；其他（軀幹上的）照位移場
        let best = null, bd = 1e9;
        for (const b of body) { const lb = Math.hypot(q[0] - b.bc[0] - b.off[0], q[1] - b.bc[1] - b.off[1], q[2] - b.bc[2] - b.off[2]) - b.br; if (lb >= bd) continue; const d = H.primDist(b, q[0], q[1], q[2]); if (d < bd) { bd = d; best = b; } }
        // 袖子只套到上臂 → 最近的是上臂才跟手走；靠近垂在腰邊的手的下襬、褲頭照軀幹走（不然抬手會被帶走）
        a = !best ? null : best.part === 'armL' || best.part === 'armR' ? (best === upper ? [0, 0, lift * .9, upX] : best.part === 'armR' && q[2] > zW ? act(best, q) : field(q).concat([null])) : act(best, q);
      } else a = act(p, q);
      if (a) acts.set(p, a);
    }
    for (const [p, a] of acts) {
      p.off = [p.off[0] + a[0], p.off[1] + a[1], p.off[2] + a[2]];
      if (a[3]) p.xf = p.xf ? H.compose(a[3], p.xf) : a[3];
    }
    for (const st of sh.areolaStamps || []) { const sd = Math.sign(st.q[0]) || 1; st.q = [st.q[0] + sd * .3 * br, st.q[1] + .45 * br, st.q[2] + lift * .75]; }
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
  /** 衣服的部位標記色：1＝布（T 恤布、胸罩布、蕾絲、褲頭）、2＝滾邊／扣子；0＝不是衣服。 */
  function clothAt(px, i) {
    if (!px[i + 3]) return 0;
    const r = px[i], g = px[i + 1], b = px[i + 2];
    if ((r === 250 && g === 250 && b === 252) || (r === 214 && g === 216 && b === 228) || (r === 0 && g === 255 && b === 255) || (r === 0 && g === 170 && b === 170) || (r === 255 && g === 128 && b === 0)) return 1;
    if ((r === 255 && g === 0 && b === 0) || (r === 0 && g === 255 && b === 0)) return 2;
    return 0;
  }
  /** 衣服（使用者：灰色、微微透明，黑影模式）：身體那層上面，內衣、外衣各疊一層灰；看得到底下的身體輪廓，T 恤底下隱約看到胸罩。 */
  function veil(out, layer) {
    const GRAY = { 1: [168, 168, 180], 2: [124, 124, 138] }, K = { 1: .72, 2: .82 }, OUT = { 1: [118, 116, 130, 200], 2: [96, 94, 110, 220] };
    for (let i = 0; i < out.length; i += 4) {
      const c = clothAt(layer, i); if (!c) continue;
      const g = GRAY[c], k = K[c];
      if (out[i + 3]) {
        // 衣服底下不透出乳暈、乳頭（只透出身體輪廓）
        if ((out[i] === 72 && out[i + 1] === 58 && out[i + 2] === 84) || (out[i] === 88 && out[i + 1] === 72 && out[i + 2] === 100)) { out[i] = 51; out[i + 1] = 45; out[i + 2] = 64; }
        for (let j = 0; j < 3; j++) out[i + j] = out[i + j] * (1 - k) + g[j] * k; out[i + 3] = Math.max(out[i + 3], 220);
      } else { const q = OUT[c]; out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2]; out[i + 3] = q[3]; }   // 身體外面的布（袖口、褲頭兩側、胯下細繩）：深一點的半透明灰，淺色背景上才不會像白線
    }
  }

  /** 一格：同一個身形只建一次模型（襯衫／胸罩建模要好幾秒），每格複製一份再照動作變形、畫、上黑影色。worker 裡也用。 */
  function drawFrame(F, cache, doll, pose, f, n, scale, cv) {
    const key = JSON.stringify(doll);
    if (cache.key !== key) { cache.key = key; cache.base = F.build(doll, 'idle', 0, 0, {}); }
    const base = cache.base;
    const shape = () => ({ P: base.P, sh: Object.assign({}, base.sh, { prims: base.sh.prims.map(p => Object.assign({}, p)), areolaStamps: (base.sh.areolaStamps || []).map(q => Object.assign({}, q)) }) });
    const m = motion(pose, f, n);
    // 分三次畫：只有身體 → 身體＋內衣（胸罩、丁字褲）→ 身體＋外衣（T 恤），再一層層疊灰色上去
    const run = (keep) => F.render(doll, 'idle', 0, 0, { scale, cv, shape: () => { const v = shape(); v.sh.prims = v.sh.prims.filter(keep); return v; }, deform: (sh, P, H) => deform(sh, P, H, m) });
    const hasU = base.sh.prims.some(p => p.cloth && p.under), hasO = base.sh.prims.some(p => p.cloth && !p.under);
    const r = run(p => !p.cloth);
    shade(r.pixels);
    if (hasU) veil(r.pixels, run(p => !p.cloth || p.under).pixels);
    if (hasO) veil(r.pixels, run(p => !p.cloth || !p.under).pixels);
    return r;
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
        const code = `const F=(${F.factorySource})();const motion=${motion};const deform=${deform};const shade=${shade};const clothAt=${clothAt};const veil=${veil};const drawFrame=${drawFrame};const CV=${JSON.stringify(CV)};const cache={};
onmessage=(e)=>{const j=e.data;try{const r=drawFrame(F,cache,j.doll,j.pose,j.f,j.n,${SCALE},CV);postMessage({id:j.id,w:r.width,h:r.height,px:r.pixels},[r.pixels.buffer]);}catch(err){postMessage({id:j.id,err:String(err)});}};`;
        worker = new Worker(URL.createObjectURL(new Blob([code], { type: 'text/javascript' })));
        worker.onmessage = (e) => { const w = waiters.get(e.data.id); if (w) { waiters.delete(e.data.id); w(e.data); } };
      } catch { worker = null; }
      return F;
    });
    return loading;
  }
  const mainCache = {};
  function renderFrame(doll, pose, f) {
    if (worker) {
      const id = ++seq;
      return new Promise((res) => { waiters.set(id, res); worker.postMessage({ id, doll, pose, f, n: N }); });
    }
    const r = drawFrame(F, mainCache, doll, pose, f, N, SCALE, CV);
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
    // 穿著（使用者：一開始是 droom 那套白色 T 恤＋胸罩＋丁字褲；穿胸罩乳房變挺）：跟脫衣進度 undress.stage 走——
    //   0 白色 T 恤（裡面穿胸罩）＋丁字褲、1 胸罩＋丁字褲、2 只剩丁字褲、3 全裸。不畫她衣櫃裡的衣服（裙子也不畫）。
    const st = Math.max(0, Math.min(3, Number(s.undressStage) || 0));
    doll.skirt = '';
    if (st === 0) { doll.cloth = 'tee'; doll.underBra = true; }
    else if (st === 1) doll.cloth = 'bra';
    if (st <= 1) doll.braSupport = true;
    if (st <= 2) doll.pants = 'lace_thong';
    const key = JSON.stringify(doll);
    if (cur && cur.key === key) return !!cur.sets.breathe[0];
    if (cur) cur.dead = true;
    const job = cur = { key, sets: { breathe: [], talk: [] }, dead: false, P: F.proportions ? F.proportions(doll) : null };
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

  // 2026-11-19 使用者：聊天先出現黑影；長按黑影的頭 → 半身立繪；長按立繪 → 回到黑影。每次打開聊天都從黑影開始。
  let portraitMode = false, wasOpen = false, fadeT = 0;
  function sync() {
    const sheet = document.getElementById('portrait-sheet');
    if (!ensureEl()) return;
    const open = !!(sheet && !sheet.hidden);
    if (open && !wasOpen) portraitMode = false;
    wasOpen = open;
    const s = wanted(sheet);
    const want = !!s && !portraitMode;
    const on = !!(s && prepare(s)) && !portraitMode;
    sheet?.classList.toggle('portrait-mode', open && portraitMode);
    // 使用者：點房間的她先跑出立繪才生字不對 → 一打開就把立繪藏起來（不等黑影第一格算好）
    sheet?.classList.toggle('has-shadow', want);
    if (on && (wrap.hidden || wrap.classList.contains('cs-out'))) {
      clearTimeout(fadeT); fadeT = 0;
      if (wrap.hidden) canvas.dataset.f = '';
      wrap.hidden = false;
      wrap.classList.remove('cs-in', 'cs-out');
      void wrap.offsetWidth;
      requestAnimationFrame(() => wrap.classList.add('cs-in'));
    } else if (!on && !wrap.hidden && !fadeT) {
      if (open && portraitMode) {   // 換成立繪：黑影淡出（立繪同時在中間淡入，CSS）
        wrap.classList.remove('cs-in'); wrap.classList.add('cs-out');
        fadeT = setTimeout(() => { fadeT = 0; if (wrap.classList.contains('cs-out')) { wrap.hidden = true; wrap.classList.remove('cs-out'); } }, 420);
      } else { wrap.hidden = true; wrap.classList.remove('cs-in', 'cs-out'); }
    }
    if (on) play(); else stop();
  }

  // ---------------------------------------------------------------- 長按切換（黑影的頭 ↔ 半身立繪）
  const LONG_MS = 500, SLOP = 10;
  function tip(text) {
    let el = document.getElementById('chat-shadow-tip');
    if (!el) { el = document.createElement('div'); el.id = 'chat-shadow-tip'; el.setAttribute('role', 'status'); document.getElementById('portrait-sheet')?.appendChild(el); }
    el.textContent = text; el.hidden = false; clearTimeout(tip.t); tip.t = setTimeout(() => { el.hidden = true; }, 1800);
  }
  /** 畫面座標 → 黑影畫布的像素（canvas 是 object-fit: contain、靠下置中）。 */
  function toCanvas(ev) {
    const r = canvas.getBoundingClientRect(), k = Math.min(r.width / canvas.width, r.height / canvas.height);
    return [(ev.clientX - (r.left + (r.width - canvas.width * k) / 2)) / k, (ev.clientY - (r.bottom - canvas.height * k)) / k];   // object-position: bottom center
  }
  /** 按在她的頭上嗎：畫布最上面有東西的那一列往下約 16% 身高、附近有像素。 */
  function onHead(x, y) {
    const img = cur && cur.sets[mode] && cur.sets[mode].find(Boolean); if (!img) return false;
    const { width: w, height: h, data } = img, A = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && data[(yy * w + xx) * 4 + 3] > 0;
    let top = -1; for (let yy = 0; yy < h && top < 0; yy++) for (let xx = 0; xx < w; xx++) if (A(xx, yy)) { top = yy; break; }
    if (top < 0 || y < top - 8 || y > top + (CV.ay * SCALE - top) * .16) return false;
    for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) if (A(Math.round(x + dx), Math.round(y + dy))) return true;
    return false;
  }
  /** 畫布像素 → 摸到哪一區（照她的身體比例 P：S 肩線、C 胯下、T 軀幹長；droom 橫向拉寬 1.1）。 */
  function zoneAt(px, py) {
    const P = cur && cur.P; if (!P) return null;
    const x = Math.abs((px / SCALE - CV.ax) / 1.1), z = CV.ay - py / SCALE, S = P.S, C = P.C, T = P.T;
    if (z <= C + 4.5 && z >= C - 5 && x <= 5) return 'groin';
    if (z <= S - .06 * T && z >= S - .52 * T && x <= 11) return 'breast';
    if (z < S - .52 * T && z >= C - 9 && x <= 13) return 'waist';
    return null;
  }
  function longPress(el, test, fire) {
    let t = 0, x0 = 0, y0 = 0;
    const cancel = () => { clearTimeout(t); t = 0; };
    el.addEventListener('pointerdown', (ev) => { if (!test(ev)) return; x0 = ev.clientX; y0 = ev.clientY; cancel(); t = setTimeout(() => { t = 0; fire(); }, LONG_MS); });
    el.addEventListener('pointermove', (ev) => { if (t && Math.hypot(ev.clientX - x0, ev.clientY - y0) > SLOP) cancel(); });
    for (const k of ['pointerup', 'pointercancel', 'pointerleave']) el.addEventListener(k, cancel);
    el.addEventListener('contextmenu', (ev) => ev.preventDefault());
  }
  function bindSwitch() {
    longPress(canvas, (ev) => { const [x, y] = toCanvas(ev); return onHead(x, y); }, () => {
      const img = document.getElementById('portrait-img');
      if (!img || !img.getAttribute('src')) { tip('她還沒有立繪'); return; }
      portraitMode = true; sync();
    });
    const img = document.getElementById('portrait-img');
    if (img) longPress(img, () => portraitMode, () => { portraitMode = false; sync(); });
    // 黑影畫布蓋住畫面中間：點到她旁邊透明的地方＝點背景（關掉聊天，跟原本一樣）；
    // 點在她身上＝摸她（使用者：調戲不用按鈕）：胸部／下體／腰部臀部 → test_room_summon.js 的 RoomTouch.zone 挑一個已解鎖的動作
    canvas.addEventListener('click', (ev) => {
      const [x, y] = toCanvas(ev), f = cur && cur.sets[mode] && (cur.sets[mode].find(Boolean));
      if (!f) return;
      const xi = Math.round(x), yi = Math.round(y);
      const solid = xi >= 0 && yi >= 0 && xi < f.width && yi < f.height && f.data[(yi * f.width + xi) * 4 + 3] > 0;
      if (!solid) { document.getElementById('portrait-backdrop')?.click(); return; }
      const zone = zoneAt(x, y);
      if (zone) window.RoomTouch?.zone(zone);
    });
  }

  /** 她的字一個一個出來 → 說話動作；停下來 0.9 秒後回到呼吸。 */
  function talking() { talkUntil = performance.now() + 900; }

  function boot() {
    const sheet = document.getElementById('portrait-sheet');
    if (!sheet) return;
    if (ensureEl()) bindSwitch();
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
