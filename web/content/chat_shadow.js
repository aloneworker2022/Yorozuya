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
  const DROOM_URL = new URL('../droom/room_doll_chest.js?v=10', (document.currentScript && document.currentScript.src) || location.href).href;
  const N = 16, NA_OF = { shirt: 22, bra: 36, panties: 32, peak: 24, r_breast: 8, r_groin: 8, r_waist: 8, ang_akimbo: 20, ang_cross: 13 }, FPS = { breathe: 4, talk: 7 };
  const REACTS = ['r_breast', 'r_groin', 'r_waist'];   // 被摸的反應（2026-11-20 使用者：摸她時她會反抗、遮擋）
  /** 脫衣動畫的節奏（使用者：太快、要有節奏）：每一格停多久（毫秒）——伸手慢、解扣子頓一拍、抽出來快、丟下去頓一拍。 */
  const BEAT = {
    shirt: (u) => (u < .12 ? 160 : u < .45 ? 130 : u < .62 ? 120 : u < .8 ? 95 : 150) + (Math.abs(u - .57) < .025 ? 380 : 0),   // 套過頭時卡一下
    bra: (u) => (u < .28 ? 175 : u < .42 ? 160 : u < .6 ? 125 : u < .78 ? 70 : u < .86 ? 85 : 140) + (Math.abs(u - .37) < .015 ? 520 : 0) + (Math.abs(u - .86) < .015 ? 750 : 0),
    // 妻子摸陰唇時高潮（使用者）：揉快 4 格 → 3 格頭往後仰到底 → 抽搐（抽動 1 格快、停頓不規則，越來越弱）→ 慢慢放鬆
    peak: (u) => { const i = Math.round(u * 23); return i < 4 ? 110 : i < 7 ? 75 : i < 17 ? ((i - 7) % 2 === 0 ? 55 : [140, 200, 120, 180, 220][((i - 7) >> 1) % 5]) : 170; },
    panties: (u) => (u < .2 ? 165 : u < .32 ? 160 : u < .46 ? 125 : u < .7 ? 75 : u < .84 ? 85 : 140) + (Math.abs(u - .27) < .017 ? 480 : 0) + (Math.abs(u - .84) < .017 ? 700 : 0),
  };
  // 被摸的反應（2026-11-21 使用者：摸她沒動作——反應要算很久）：只算 8 格（縮手遮住 3 格、遮著掙扎 5 格），放下時把縮手那幾格倒著播
  const REACT_SEQ = [0, 1, 2, 3, 4, 5, 6, 7, 1, 0], REACT_MS = [60, 70, 90, 120, 120, 120, 120, 140, 110, 110];
  // 生氣說話（2026-11-21 使用者：生氣時說話會叉腰或雙手抱胸；叉腰身體抖一下、胸部晃一下；抱胸胸部在手臂上面）：
  //   進場那幾格播一次（叉腰：手到腰 4 格＋「哼」抖一下、乳房慢半拍晃 8 格；抱胸：手交叉到乳房下面 5 格），
  //   接著循環講話那 8 格；講完 1.2 秒手放下（進場的手部那幾格倒著播）
  const ANGS = ['ang_akimbo', 'ang_cross'];
  const ANG = {
    ang_akimbo: { enter: 12, loop: [12, 19], exit: [3, 2, 1, 0], ms: (i) => (i < 4 ? 75 : i === 4 ? 60 : i < 12 ? 75 : 150) },
    ang_cross: { enter: 5, loop: [5, 12], exit: [4, 3, 2, 1, 0], ms: (i) => (i < 5 ? 85 : 155) },
  };
  const beatCum = {};
  /** 播了 ms 毫秒，該是第幾格（超過最後一格回 n）。 */
  function beatFrame(kind, ms) {
    const n = NA_OF[kind];
    if (!beatCum[kind]) { let t = 0; beatCum[kind] = Array.from({ length: n }, (_, i) => (t += BEAT[kind](i / (n - 1)))); }
    const c = beatCum[kind]; for (let i = 0; i < n; i++) if (ms < c[i]) return i; return n;
  }
  const ANIMS = ['shirt', 'bra', 'panties'];   // 脫衣動畫：undress.stage 0→1 脫 T 恤、1→2 脫胸罩、2→3 脫內褲
  const nOf = (pose) => NA_OF[pose] || N;
  const SCALE = 2, CV = { w: 84, h: 134, ax: 42, ay: 131, tMax: 40, tMin: -45 };   // 手抬起來也在框內；腳底固定在 ay
  // 坐著（美人魚坐姿，脫衣時）：腿往右收比較寬、人比較矮 → 自己的畫布（顯示時一樣撐滿高度＝坐著的她看起來比較大）
  const CV_SIT = { w: 116, h: 100, ax: 56, ay: 94, tMax: 70, tMin: -70 };   // 上面留空間給脫 T 恤時舉到頭上的手
  const CV_SIT_LOW = { w: 116, h: 76, ax: 56, ay: 72, tMax: 70, tMin: -70 };   // 一般聊天坐著（妻子摸自己）：手不會舉過頭 → 上面不留空，人顯示得比較大
  const cvOf = (doll) => (doll && doll._body === 'mermaid' ? (doll._mode ? CV_SIT_LOW : CV_SIT) : CV);

  // look.breast_shape → 模型乳型（照 droom-chest-model 備忘錄 MEMO-2026-11-18、使用者確認的表）；外擴型（2026-11-21 使用者：外擴可以、八字不行）＝自然圓潤＋從根部慢慢往外彎（room_doll_chest.js splay:'wide'：越往前、越下面越往外，乳暈、下乳明顯往外），不用模型裡取消的八字 shape wide
  const SHAPE_OF = [[/母乳|沉重/, { shape: 'heavy' }], [/木瓜/, { shape: 'pendulous' }], [/鐘/, { shape: 'bell' }], [/水滴/, { shape: 'teardrop' }],
    [/深溝|極密/, { shape: 'round', gap: 'close' }], [/外擴/, { shape: 'round', splay: 'wide' }], [/半球/, { shape: 'round', braSupport: true }], [/挺俏|上挺/, { shape: 'perky' }],
    [/饅頭/, { shape: 'dome' }], [/平坦|微隆/, { shape: 'flat' }]];
  function shapeOf(t) { t = String(t || ''); for (const [re, v] of SHAPE_OF) if (re.test(t)) return v; return { shape: 'round' }; }
  function areolaOf(t) {
    t = String(t || '');
    if (/佔滿|誇張/.test(t)) return 'huge';
    if (/偏大|寬廣|大乳暈|偏腫|深咖啡/.test(t)) return 'large';
    if (/小巧|偏小/.test(t)) return 'small';
    return 'medium';
  }

  /** 第 f 格的動作量（worker 裡也用，不能用外面的變數）。pose：breathe／talk／脫衣動畫 shirt／bra／panties；sit＝坐著（不比劃）。 */
  function motion(pose, f, n, sit, mode, tier) {
    const ph = 2 * Math.PI * f / n;
    if (pose === 'ang_akimbo' || pose === 'ang_cross') {
      // 生氣說話：叉腰（f0–3 左手也叉到腰上、f4「哼」身體往上一抖、f5 落下，乳房慢半拍上下晃、越晃越小；f12–19 叉腰講話循環）
      //   抱胸（f0–4 兩手交叉到乳房下面、把乳房托起來壓在手臂上；f5–12 抱胸講話循環，頭轉開、下巴微抬）
      const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, ak = pose === 'ang_akimbo';
      let wa, jolt = 0, bounce = 0, tilt, nod, turn, br;
      if (ak) {
        wa = sm(f / 3);
        jolt = f === 4 ? .9 : f === 5 ? -.3 : 0;
        bounce = [0, 0, 0, 0, -1, .9, -.6, .4, -.25, .15, -.08, 0][f] || 0;   // 乳房相對身體的上下（身體往上它晚到＝往下）
        if (f < 12) { tilt = -2 * wa; nod = 4 * wa - (f === 4 ? 4 : 0); turn = -10 * wa; br = f >= 4 && f < 8 ? .8 : .3; }
        else { const q = 2 * Math.PI * (f - 12) / 8; tilt = -2 + 2.5 * Math.sin(q); nod = 4 + 3 * Math.max(0, Math.sin(2 * q)); turn = -10 + 3 * Math.sin(q); br = .45 + .25 * Math.sin(2 * q); }
      } else {
        wa = sm(f / 4);
        if (f < 5) { tilt = 3 * wa; nod = -5 * wa; turn = -16 * wa; br = .3; }
        else { const q = 2 * Math.PI * (f - 5) / 8; tilt = 3 + 2 * Math.sin(q); nod = -5 + 3 * Math.max(0, Math.sin(2 * q)); turn = -16 + 4 * Math.sin(q); br = .35 + .2 * Math.sin(2 * q); }
      }
      return { ph: 0, br, tilt, nod, turn, gest: 0, ang: { kind: ak ? 'akimbo' : 'cross', w: wa, bounce }, jolt };
    }
    if (pose === 'r_breast' || pose === 'r_groin' || pose === 'r_waist') {
      // 被摸的反應（使用者：陌生生氣、朋友生氣、女友無奈嫌煩、妻子喜歡調情；摸的時候會反抗、遮擋）：
      //   陌生／朋友：轉頭、低頭，手先推開再遮住被摸的地方，遮著的時候掙扎（頭小幅甩）；陌生多一下驚跳
      //   女友：一隻手遮、頭轉一點點、低頭嘆一口氣；妻子：不遮，頭往後仰、身體一顫、手摀嘴
      const u = f / (n - 1) * .72, sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };   // 只算到遮著掙扎完（放下＝倒著播）
      const w = u < .22 ? sm(u / .22) : u < .72 ? 1 : 1 - sm((u - .72) / .28);
      const base = mode ? motion('breathe', 0, 16, sit, mode) : { ph: 0, br: .2, tilt: 0, nod: 0, turn: 0, gest: 0 };
      const T = tier || 'stranger', shake = u > .22 && u < .72 ? Math.sin((u - .22) * 38) : 0;
      const D = { stranger: [-38, 6, -5, .35, 4], friend: [-30, 9, -4, .3, 2.5], girlfriend: [-14, 11, 4, .8, 0], wife: [12, -15, 7, .6, 0] }[T] || [-30, 8, -4, .3, 2];
      const bump = (c, r) => Math.max(0, 1 - Math.abs(u - c) / r);
      const jolt = T === 'wife' ? .45 * bump(.3, .09) : T === 'stranger' ? .3 * bump(.1, .1) : 0;
      return { ph: base.ph, br: base.br + D[3] * w, tilt: base.tilt + D[2] * w, nod: base.nod + D[1] * w,
        turn: Math.max(-62, Math.min(62, (base.turn || 0) + (D[0] + D[4] * shake) * w)), gest: 0, mode: mode || null,
        react: { zone: pose.slice(2), u, w, tier: T }, jolt };
    }
    if (mode && (pose === 'breathe' || pose === 'talk' || pose === 'peak')) {   // 脫光後的動作：手照 mode 擺（deform），這裡只給頭和呼吸
      const talk = pose === 'talk', b = talk ? .65 * (.5 - .5 * Math.cos(2 * ph)) : .5 - .5 * Math.cos(ph);
      const tn = talk ? 3 * Math.max(0, Math.sin(2 * ph)) : 0;
      if (mode === 'cover') return { ph, br: b, tilt: -3 + 1.5 * Math.sin(ph), nod: 9 + tn, turn: -52, gest: 0, mode };   // 側臉看旁邊、微低頭（害羞）
      if (pose === 'peak') {   // 高潮：揉快 → 3 格仰頭 → 抽搐（身體、頭各抽一下＝一格）→ 慢慢回來
        const i = Math.round(f * 23 / (n - 1)), smo = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
        const k = i < 4 ? 0 : i < 7 ? (i - 3) / 3 : i < 17 ? 1 : 1 - smo((i - 16) / 7);
        const tw = i >= 7 && i < 17 && (i - 7) % 2 === 0 ? 1 - (i - 7) / 14 : 0;   // 抽動的那一格（越抽越弱）
        const sgn = ((i - 7) >> 1) % 2 ? -1 : 1;
        return { ph: ph * 2, br: .3 + .7 * k, tilt: 3 * Math.sin(ph) + 4 * k + 7 * tw * sgn, nod: -15 - 30 * k - 9 * tw, turn: 4 * tw * sgn, gest: 0, mode, peak: k, jolt: tw };
      }
      if (mode === 'fondle') return { ph, br: b, tilt: 5 * Math.sin(ph), nod: -7 - tn, turn: 0, gest: 0, mode };   // 頭微微往後仰
      return { ph, br: b, tilt: 3 * Math.sin(ph), nod: -15 - tn, turn: 0, gest: 0, mode };   // touch：抬頭
    }
    const breath = (q) => { q = ((q % 1) + 1) % 1; return q < .4 ? .5 - .5 * Math.cos(Math.PI * q / .4) : .5 + .5 * Math.cos(Math.PI * (q - .4) / .6); };
    if (pose === 'shirt' || pose === 'bra' || pose === 'panties') {
      // 脫胸罩／內褲：害羞，頭轉向一邊、微微低下（伸手時慢慢轉過去，脫完才慢慢轉回來）
      const u = f / (n - 1), sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, shy = pose === 'shirt' ? 0 : sm((u - .04) / .24) * (1 - sm((u - .9) / .1));
      return { ph, br: .4 * breath(f / n), tilt: -4 * shy, nod: 9 * shy, turn: -32 * shy, gest: 0, anim: { kind: pose, u } };
    }
    if (pose === 'talk') return { ph, br: .65 * breath(2 * f / n),
      tilt: 3.2 * Math.sin(ph) + 1.2 * Math.sin(3 * ph + .5),
      nod: 4.5 * Math.max(0, Math.sin(2 * ph)) ** 1.5 - 1.2 * Math.sin(3 * ph + 1),
      gest: sit ? 0 : .5 - .5 * Math.cos(ph) };
    return { ph, br: breath(f / n), tilt: 1.6 * Math.sin(ph + .6), nod: 0, gest: 0 };
  }

  /** 照部位動零件（droom render 的 opts.deform）。H：droom 的矩陣小工具＋primDist。
   *  身體零件照部位動；衣服零件跟著離它最近的身體零件一起動；袖子跟上臂／前臂。
   *  m.anim＝脫衣動畫 {kind: shirt|bra|panties, u: 0～1}：兩手擺到位、那件衣服移走（u＞.78 不見）、手再放回來。 */
  function deform(sh, P, H, m) {
    const { br, tilt, nod, gest, ph } = m, anim = m.anim || null, lift = br * 1.6, hl = lift * .85;
    // 肩線／胯下高度從實際的肩關節推（坐著時整個人往下移了，不能用站著的 P.S／P.C）
    const shA = sh.prims.find(p => p.part === 'armL' && p.a && !p.cloth);
    const S = shA ? shA.a[2] + shA.off[2] + 3.4 : P.S, C = S - P.T, zW = S - .6 * P.T;
    const sm = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };
    const nrm = (v) => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; };
    const app = (X, q) => { const r = H.mulV(X.R, q); return [r[0] + X.t[0], r[1] + X.t[1], r[2] + X.t[2]]; };
    /** 把方向 u 轉到 v（只轉 w 那麼多）的旋轉矩陣。 */
    const rotTo = (u, v, w) => {
      u = nrm(u); v = nrm(v);
      let ax = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
      if (Math.hypot(...ax) < 1e-6) ax = [1, 0, 0];
      ax = nrm(ax);
      const ang = Math.acos(Math.max(-1, Math.min(1, u[0] * v[0] + u[1] * v[1] + u[2] * v[2]))) * w;
      const c = Math.cos(ang), sn = Math.sin(ang), t = 1 - c, [x, y, z] = ax;
      return [c + t * x * x, t * x * y - sn * z, t * x * z + sn * y, t * x * y + sn * z, c + t * y * y, t * y * z - sn * x, t * x * z - sn * y, t * y * z + sn * x, c + t * z * z];
    };
    const head = sh.prims.find(p => p.part === 'head'), o = head ? head.off : [0, 0, 0];
    const turn = m.turn || 0, rz = turn * Math.PI / 180, RZ = [Math.cos(rz), -Math.sin(rz), 0, Math.sin(rz), Math.cos(rz), 0, 0, 0, 1];   // 頭往旁邊轉（看別處）
    const headX = tilt || nod || turn ? H.about(H.mulR(RZ, H.mulR(H.rotY(tilt), H.rotX(-nod))), [o[0], o[1], S - 1 + o[2] + hl]) : null;
    // 兩隻手：肩、手肘、手腕（零件 a 點，從上往下排）；armX[side]＝{up, fore, upper}
    const LIFT = { armL: .9, armR: .5 };
    // 害羞遮下體：肩膀往前、往下沉一點（縮肩），手才搆得到胯下前面
    const rx = !anim && !m.mode && m.react && m.react.w > .02 ? m.react : null;   // 被摸的反應（脫光後的姿勢手已經在擺，只動頭）
    const kS = rx && rx.zone === 'groin' && rx.tier !== 'wife' ? rx.w : 0;   // 遮下體：縮肩手才搆得到
    const SHRUG = !anim && m.mode === 'cover' ? { armR: [-.4, 1.5, -3] } : kS ? Object.assign({ armR: [-.4 * kS, 1.5 * kS, -3 * kS] }, rx.tier === 'girlfriend' ? {} : { armL: [.4 * kS, 1.5 * kS, -3 * kS] }) : {};
    const armX = {};
    const lerp = (a, c, k) => a.map((v, i) => v + (c[i] - v) * k);
    const armPts = (part) => {
      const arm = sh.prims.filter(p => p.part === part && p.a && !p.cloth);
      if (arm.length < 2) return null;
      const lz = lift * LIFT[part], e = SHRUG[part] || [0, 0, 0], pt = (p) => [p.a[0] + p.off[0] + e[0], p.a[1] + p.off[1] + e[1], p.a[2] + p.off[2] + lz + e[2]];
      const f1 = arm[1], end = f1.ba ? [f1.a[0] + f1.ba[0] + f1.off[0] + e[0], f1.a[1] + f1.ba[1] + f1.off[1] + e[1], f1.a[2] + f1.ba[2] + f1.off[2] + lz + e[2]] : null;
      const sp = pt(arm[0]), ep = pt(arm[1]), w0 = arm[2] ? pt(arm[2]) : end || [ep[0], ep[1], ep[2] - 10];   // 沒有手掌零件（插腰的拳頭）：手腕＝前臂圓錐的末端
      return { arm, sp, ep, w0 };
    };
    /** 兩節手臂 IK：手腕要到 T（到不了就伸直往那邊）；手肘往 pole 那邊彎。回傳 {up, fore, upper}。 */
    const ikArm = (part, T, pole, handDir) => {
      const A = armPts(part); if (!A) return null;
      const { arm, sp, ep, w0 } = A, sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]], len = (v) => Math.hypot(v[0], v[1], v[2]);
      const l1 = len(sub(ep, sp)), l2 = len(sub(w0, ep));
      const D = sub(T, sp), d = Math.max(Math.abs(l1 - l2) + .1, Math.min(l1 + l2 - .05, len(D))), dir = nrm(D);
      const Tc = [sp[0] + dir[0] * d, sp[1] + dir[1] * d, sp[2] + dir[2] * d];
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const pd = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2], n = nrm([pole[0] - dir[0] * pd, pole[1] - dir[1] * pd, pole[2] - dir[2] * pd]);
      const elbow = [sp[0] + dir[0] * a + n[0] * h, sp[1] + dir[1] * a + n[1] * h, sp[2] + dir[2] * a + n[2] * h];
      const up = H.about(rotTo(sub(ep, sp), sub(elbow, sp), 1), sp), w1 = app(up, w0);
      const fore = H.compose(H.about(rotTo(sub(w1, elbow), sub(Tc, elbow), 1), elbow), up);
      const X = { up, fore, upper: arm[0] };
      if (handDir) {   // 手掌另外轉（手腕以下的零件）：例如遮下體時手掌往下指、蓋住陰唇
        const f2 = sub(w0, ep), L2 = f2[0] * f2[0] + f2[1] * f2[1] + f2[2] * f2[2] || 1;
        const raw = (p) => [p.a ? p.a[0] + p.off[0] : 0, p.a ? p.a[1] + p.off[1] : 0, p.a ? p.a[2] + p.off[2] : 0];
        const e0 = raw(arm[1]);   // 手肘（還沒加呼吸、縮肩的位移）；前臂方向 f2 跟位移無關
        X.hand = new Set(sh.prims.filter(p => p.part === part && !p.cloth && p !== arm[0] && p !== arm[1]
          && ((p.bc[0] + p.off[0] - e0[0]) * f2[0] + (p.bc[1] + p.off[1] - e0[1]) * f2[1] + (p.bc[2] + p.off[2] - e0[2]) * f2[2]) / L2 > .95));
        const fdir = H.mulV(fore.R, f2);
        X.handX = H.compose(H.about(rotTo(fdir, handDir, 1), Tc), fore);
      }
      return X;
    };
    // 脫 T 恤（使用者：拉著衣角往上脫，衣服會被翻折，不是整件像紙板）：
    //   雙手抓住下襬往上拉，翻折線從下襬一路往上捲——翻折線以下的布照翻折線反射到上面、裡面朝外疊在還穿著的那截外面；
    //   翻折線到胸口時下襬已經被拉到頭頂附近（手舉起來），手搆不到的部分在手裡擠成一束；
    //   最後整件連領口一起從頭上拉掉（往上、往中間收），u＞.8 不見，手放回來。
    let shirtPlan = null;
    if (anim && anim.kind === 'shirt') {
      const u = anim.u, O = sh.prims.filter(p => p.cloth && !p.under && !p.sleeve);
      if (O.length && u <= .8) {
        const Q = O.map(p => [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]]);
        const hemZ = Math.min(...Q.map(q => q[2])), topZ = Math.max(...Q.map(q => q[2]));
        const headTop = Math.max(...sh.prims.filter(p => p.part === 'head' || p.mat === 1).map(p => p.bc[2] + p.off[2] + p.br * .6), topZ + 12);
        const NB = 24, zb = (z) => Math.max(0, Math.min(Math.round(topZ - hemZ), Math.round(z - hemZ)));
        const ring = [], R = [];
        Q.forEach((q) => { const k = zb(q[2]); (ring[k] = ring[k] || [0, 0, 0])[0] += q[0]; ring[k][1] += q[1]; ring[k][2]++; });
        for (let k = 0; k < ring.length; k++) if (ring[k]) ring[k] = [ring[k][0] / ring[k][2], ring[k][1] / ring[k][2]];
        const ctr = (z) => { let k = zb(z); for (let d = 0; d < ring.length; d++) { if (ring[k - d]) return ring[k - d]; if (ring[k + d]) return ring[k + d]; } return [0, 0]; };
        const polar = (q) => { const c = ctr(q[2]), dx = q[0] - c[0], dy = q[1] - c[1]; return [Math.atan2(dy, dx), Math.hypot(dx, dy)]; };
        const tb = (t) => ((Math.round((t + Math.PI) / (2 * Math.PI) * NB) % NB) + NB) % NB;
        Q.forEach((q) => { const [t, r] = polar(q), k = zb(q[2]), j = tb(t); R[k] = R[k] || []; R[k][j] = Math.max(R[k][j] || 0, r); });
        const Rat = (z, t) => { let k = zb(z); const j = tb(t); for (let d = 0; d < R.length; d++) { const a = R[k - d] && R[k - d][j], c = R[k + d] && R[k + d][j]; if (a || c) return Math.max(a || 0, c || 0); } return 8; };
        const frontY = (z) => ctr(z)[1] + Rat(z, Math.PI / 2);
        // 手：抓下襬的兩側前面；超過肩膀以後往頭頂中間收
        const A = { armL: armPts('armL'), armR: armPts('armR') };
        const reach = Math.min(...['armL', 'armR'].filter(k => A[k]).map(k => { const a = A[k]; return a.sp[2] + .92 * (Math.hypot(a.ep[0] - a.sp[0], a.ep[1] - a.sp[1], a.ep[2] - a.sp[2]) + Math.hypot(a.w0[0] - a.ep[0], a.w0[1] - a.ep[1], a.w0[2] - a.ep[2])); }));
        const zCap = Math.max(topZ + 4, Math.min(reach, headTop + 8));
        const grip = (sd, z) => {
          if (z <= topZ) return [sd * 6.5, frontY(z) + 2.2, z];
          const t = sm((z - topZ) / Math.max(1, zCap - topZ));
          return [sd * (6.5 - 3 * t), (frontY(topZ) + 2.2) * (1 - t) + (ctr(topZ)[1] + 1) * t, z];
        };
        const kGrab = sm(u / .12), kFold = sm((u - .12) / .48), kOff = sm((u - .6) / .2);
        const zf = hemZ + kFold * (topZ + .5 - hemZ), zh = Math.min(zCap, 2 * zf - hemZ);
        const lift2 = kOff * (headTop + 10 - topZ);
        const handZ = zh + kOff * Math.max(0, zCap - zh);
        const hands = {};
        for (const [part, sd] of [['armL', -1], ['armR', 1]]) if (A[part]) {
          const g = grip(sd, handZ);
          hands[part] = u < .12 ? lerp(A[part].w0, grip(sd, hemZ), kGrab) : g;
        }
        const hmid = hands.armL && hands.armR ? lerp(hands.armL, hands.armR, .5) : [0, frontY(topZ), handZ];
        /** 一片 T 恤布這一格在哪（中心點）。 */
        const place = (q) => {
          let [x, y, z] = q;
          if (z < zf) {   // 翻折線以下：反射到翻折線上面、裡面朝外疊在外層
            const [t] = polar(q);
            let z2 = 2 * zf - z;
            if (z2 > zCap) z2 = zCap + (z2 - zCap) * .25;   // 手搆不到：在手裡擠成一束
            if (z2 <= topZ) { const c = ctr(z2), rr = Math.max(polar(q)[1], Rat(z2, t)) + 1.2; [x, y] = [c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)]; }
            else {
              const c = ctr(topZ), rr = Rat(topZ, t) + 1.2, base = [c[0] + rr * Math.cos(t), c[1] + rr * Math.sin(t)];
              const k = sm((z2 - topZ) / Math.max(1, zCap - topZ)), tgt = [hmid[0] + 4.5 * Math.cos(t), hmid[1] + 2.5 * Math.sin(t)];
              [x, y] = [base[0] + (tgt[0] - base[0]) * k, base[1] + (tgt[1] - base[1]) * k];
            }
            z = z2;
          }
          if (kOff) {   // 最後：整件連領口往上拉過頭、往中間收
            const c = ctr(topZ);
            x = c[0] + (x - c[0]) * (1 - .4 * kOff); y = c[1] + (y - c[1]) * (1 - .4 * kOff); z += lift2;
          }
          return [x, y, z];
        };
        shirtPlan = { place, hands, kOff, hmid };
      }
    }
    // 脫胸罩／脫內褲（使用者給的步驟）：garPlan＝{hands: {armL, armR}（手腕要到哪；沒給＝不動）, place(q)（那件衣服的一片布在哪）}
    let garPlan = null;
    if (anim && (anim.kind === 'bra' || anim.kind === 'panties')) {
      const u = anim.u, sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]], add = (a, c, k = 1) => [a[0] + c[0] * k, a[1] + c[1] * k, a[2] + c[2] * k];
      const mean = (L) => { const c = [0, 0, 0]; for (const q of L) for (let i = 0; i < 3; i++) c[i] += q[i] / L.length; return c; };
      const W = (p) => [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      /** 關鍵格之間平滑內插：keys＝[[u, 位置], …]。 */
      const key = (keys) => { if (u <= keys[0][0]) return keys[0][1]; for (let i = 0; i + 1 < keys.length; i++) { const [u0, a] = keys[i], [u1, c] = keys[i + 1]; if (u <= u1) return lerp(a, c, sm((u - u0) / (u1 - u0))); } return keys[keys.length - 1][1]; };
      const A = { armL: armPts('armL'), armR: armPts('armR') };
      const rest = (part) => A[part] && A[part].w0;
      // 大腿上（膝蓋前面）：腿零件裡在前面、靠中間的最高處
      const legsF = sh.prims.filter(p => p.part === 'legs' && !p.cloth && W(p)[1] > 1 && Math.abs(W(p)[0]) < 14);
      const lapZ = legsF.length ? Math.max(...legsF.map(p => W(p)[2] + p.br * .55)) : C;
      const lap = [2.5, legsF.length ? mean(legsF.map(W))[1] : 6, lapZ + .6];
      const toss = [80, 8, S - 4], throwHand = [21, 7, S - 9];   // 往她左邊（畫面右邊）、肩膀高度往外丟出去
      if (anim.kind === 'bra') {
        // 脫胸罩（使用者給的節奏）：兩手慢慢伸到背後（頭轉開、害羞）→ 在背後摸索解扣（頓一拍）→ 扣子開了、胸罩鬆下來 →
        //   左手橫過來按住胸部、右手抓住兩個罩杯中間 → 很快地抽出來，胸罩從抓的地方對折、兩邊自然往下垂成一條 →
        //   放手丟在旁邊地上（落地頓一拍）→ 右手收回，左手繼續遮著。
        const G = sh.prims.filter(p => p.cloth && p.under && (p.cloth === 1 || p.cloth === 2));
        if (G.length) {
          const Q = G.map(W), qc = mean(Q), zBand = Math.min(...Q.map(q => q[2])), yBack = Math.min(...Q.map(q => q[1]));
          const yFront = Math.max(...Q.map(q => q[1])), zCup = mean(Q.filter(q => q[1] > yFront - 3))[2];
          const breastC = (sd) => { const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && Math.sign(W(p)[0]) === sd).map(W); return L.length ? mean(L) : [sd * 5, yFront - 2, zCup]; };
          const clasp = (sd) => [sd * 2.2, yBack - 1.2, zBand + 1.4];
          const grabF = [qc[0], yFront + .8, zCup + .5];
          const pullOut = [17, yFront + 5, zCup - 1];
          const cover = [breastC(1)[0] - 1.5, yFront + 2.4, zCup + .4];   // 左手（畫面左那隻）橫過胸前、按在另一邊的乳房前面（不能陷進身體裡）
          const floorAt = [19, yFront - 2, 1.0];
          const hands = {};
          for (const [part, sd] of [['armL', -1], ['armR', 1]]) if (A[part]) {
            const r = rest(part), c = clasp(sd), w1 = add(c, [-sd * 1.1, .2, .5]), w2 = add(c, [sd * .5, -.2, -.4]);
            hands[part] = part === 'armL'
              ? key([[0, r], [.28, c], [.31, w1], [.34, c], [.37, w2], [.42, c], [.56, cover]])
              : key([[0, r], [.28, c], [.31, w1], [.34, c], [.37, w2], [.42, c], [.56, grabF], [.62, grabF], [.76, pullOut], [.8, pullOut], [.9, add(pullOut, [-3, -1, -4])], [1, r]]);
          }
          garPlan = { hands, place: (q) => {
            if (u < .42) return null;   // 還沒解開：照身體動
            const loose = add(q, [0, .6, -1.3], sm((u - .42) / .08));   // 扣子開了：整件鬆下來一點
            if (u < .62) return loose;
            // 被抽出來：從抓的地方對折，兩半自然往下垂成一條（不是揉成一團）
            const hand = hands.armR, dx = q[0] - grabF[0];
            const hang = add(hand, [Math.sign(dx) * .6 + dx * .04, .4 + (q[1] - qc[1]) * .06, -Math.abs(dx) * 1.35 - (q[2] - zBand) * .1 - .8]);   // 細長地垂下來（罩杯也壓扁）
            if (u < .8) return lerp(loose, hang, sm((u - .62) / .12));
            // 放手：掉到旁邊地上、攤開（落地後不動）
            const land = add(floorAt, [dx * .55, (q[1] - qc[1]) * .3, (q[2] - zBand) * .06]);
            return lerp(hang, land, Math.min(1, ((u - .8) / .06) ** 2));
          } };
        }
      } else {
        const G = sh.prims.filter(p => p.cloth && p.under && p.pk);
        if (G.length) {
          const by = (pk, sd) => G.filter(p => p.pk === pk && (sd == null || p.pside === sd)).map(W);
          const bow = { [-1]: mean(by('bow', -1).length ? by('bow', -1) : [[-8, 0, C + 8]]), [1]: mean(by('bow', 1).length ? by('bow', 1) : [[8, 0, C + 8]]) };
          const fr = by('front'), ftop = Math.max(...fr.map(q => q[2])), grab0 = [0, Math.max(...fr.filter(q => q[2] > ftop - 1.5).map(q => q[1])) + 1.2, ftop - .4];
          const lift = [8, grab0[1] + 6, grab0[2] + 9];
          const hands = {};
          for (const [part, sd] of [['armL', -1], ['armR', 1]]) if (A[part]) {
            const r = rest(part), b = add(bow[sd], [sd * 1.2, 1, .2]), pull = add(bow[sd], [sd * 3.6, 1.4, 2.6]);
            hands[part] = part === 'armL'
              ? key([[0, r], [.2, b], [.3, pull], [.44, r]])
              : key([[0, r], [.2, b], [.3, pull], [.42, grab0], [.46, grab0], [.66, lift], [.72, add(lift, [6, -1, -3])], [1, r]]);
          }
          const Dmax = Math.max(...G.map(p => Math.hypot(...sub(W(p), grab0))));
          garPlan = { hands, place: (q, p) => {
            let out = q;
            // 拉開結：那一邊的蝴蝶結、帶尾跟著手；拉開以後帶子鬆開垂下來
            if (p.pk === 'bow' || (p.pk === 'str' && Math.abs(q[0]) > 5)) {
              const sd = p.pside || Math.sign(q[0]), b = bow[sd];
              const near = Math.max(0, 1 - Math.hypot(...sub(q, b)) / 6);
              const pullOff = sub(add(b, [sd * 3.6, 1.4, 2.6]), add(b, [sd * 1.2, 1, .2]));
              if (u >= .2 && u < .32) out = add(out, pullOff, near * sm((u - .2) / .1));
              else if (u >= .32) out = add(out, [sd * .8 * near, .5 * near, -3.5 * near], sm((u - .32) / .1));
            }
            if (u < .46) return out;
            // 抓住前片往前上方抽出來：離手近的先動，背後的細繩最後從腿間抽出來
            const hand = grab, d = Math.hypot(...sub(q, grab0)), k = sm(((u - .46) / .2) * (Dmax + 6) / 6 - d / 6);
            const held = add(hand, sub(q, grab0), .22);
            if (u < .72) return lerp(out, held, k);
            // 放手丟在旁邊地上（落地頓一拍，之後不動）
            const land = add([19, grab0[1] - 3, .9], [(q[0] - grab0[0]) * .3, (q[1] - grab0[1]) * .2, 0]);
            return lerp(held, land, Math.min(1, ((u - .72) / .1) ** 2));
          } };
          var grab = hands.armR || grab0;
        }
      }
    }
    // 脫光後的動作（m.mode）：cover 一手遮胸、一手遮下體；fondle 兩手托著乳房揉；touch（坐著）右手摸陰唇
    let modePlan = null, BX = null;   // BX：乳房（連同蓋在上面的衣服）整顆再加的位移，左右各一（生氣說話：晃、托高）
    if (!anim && m.mode) {
      const W = (p) => [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      const mean = (L) => { const c = [0, 0, 0]; for (const q of L) for (let i = 0; i < 3; i++) c[i] += q[i] / L.length; return c; };
      const bodyP = sh.prims.filter(p => p.mat === 0 && !p.cloth && !p.carve && p.part !== 'armL' && p.part !== 'armR');
      /** (x, z) 那一點身體最前面的 y。 */
      const frontY = (x, z) => { for (let y = 22; y > -10; y -= .25) { for (const p of bodyP) if (H.primDist(p, x, y, z) < 0) return y; } return 4; };
      const BR = [-1, 1].map(sd => { const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && !p.nip && Math.sign(W(p)[0]) === sd); if (!L.length) return null; const c = mean(L.map(W)); const r = Math.max(...L.filter(p => p.r).map(p => Math.max(...p.r)), 2); return { c, r, front: Math.max(...L.map(p => W(p)[1] + p.br * .7)) }; });
      const big = BR[1] ? Math.max(.3, Math.min(1, (BR[1].r - 3.4) / 2.6)) : .5;   // 罩杯越大（D 以上）被壓得越明顯
      const ph2 = ph * 2;
      const hands = {}, poles = {}, modeHand = {}, push = { [-1]: [0, 0, 0], [1]: [0, 0, 0] }, round = { [-1]: 0, [1]: 0 };
      if (m.mode === 'cover' && BR[1]) {
        // 左手（畫面左那隻）橫過胸前壓住另一邊的乳房；右手遮住下體。胸部被手臂往上、往中間擠：更挺、更圓
        hands.armL = [BR[1].c[0] - 1.6, BR[1].front + 1.6, BR[1].c[2] + .4]; poles.armL = [-.4, .7, -.7];
        hands.armR = [.6, frontY(.6, C + 4.4) + 2.4, C + 4.4]; poles.armR = [1, .2, -.1];   // 手腕在恥骨上方、手掌轉成往下指，蓋住陰唇
        modeHand.armR = [-.05, .3, -1];   // 手腕在下體上方、手掌往下蓋住下體（手臂不夠長到胯下）；離身體一點，邊線才畫得出來
        for (const sd of [-1, 1]) { push[sd] = [-sd * .7 * big, .6 * big, 1.6 * big]; round[sd] = big; }
      } else if (m.mode === 'fondle' && BR[0] && BR[1]) {
        // 兩手從下面托著自己的乳房，往上抬、揉（左右錯開）；乳房跟著手上下動
        for (const [part, sd] of [['armL', -1], ['armR', 1]]) {
          const b = BR[sd < 0 ? 0 : 1], k = Math.sin(ph2 + (sd > 0 ? 1.4 : 0));
          hands[part] = [b.c[0] * 1.05 + sd * .4 * k, b.front - b.r * .25, b.c[2] - b.r * .55 + 1.1 * k];
          poles[part] = [sd, .25, -.8];
          push[sd] = [-sd * .45 * (1 + k) * .5, .3, .9 + .9 * k]; round[sd] = .6 * big;
        }
      } else if (m.mode === 'touch') {
        // 坐著：右手伸到下體揉陰唇（小小地上下左右揉），左手照舊撐地
        const pk = m.peak || 0, k = Math.sin(ph2 * 1.5) * (1 - pk), k2 = Math.cos(ph2 * 1.5) * (1 - pk);   // 仰頭那一下手停住、按緊
        hands.armR = [.4 + .6 * k2, frontY(.4, C + 1.2) + 1.2 - .6 * pk, C + 1.2 + .6 * k]; poles.armR = [1, .45, -.3];
      }
      modePlan = { hands, poles, push, round, handDir: modeHand };
    } else if (rx) {
      // 被摸的反應：照關係帶擺手（hands＝手腕目標；從原本的位置照 w 過去再回來）
      const W = (p) => [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      const mean = (L) => { const c = [0, 0, 0]; for (const q of L) for (let i = 0; i < 3; i++) c[i] += q[i] / L.length; return c; };
      const bodyP = sh.prims.filter(p => p.mat === 0 && !p.cloth && !p.carve && p.part !== 'armL' && p.part !== 'armR' && p.part !== 'head');
      const frontY = (x, z) => { for (let y = 22; y > -10; y -= .25) { for (const p of bodyP) if (H.primDist(p, x, y, z) < 0) return y; } return 4; };
      const backY = (x, z) => { for (let y = -22; y < 10; y += .25) { for (const p of bodyP) if (H.primDist(p, x, y, z) < 0) return y; } return -6; };
      const BR = [-1, 1].map(sd => { const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && !p.nip && Math.sign(W(p)[0]) === sd); if (!L.length) return null; const c = mean(L.map(W)); const r = Math.max(...L.filter(p => p.r).map(p => Math.max(...p.r)), 2); return { c, r, front: Math.max(...L.map(p => W(p)[1] + p.br * .7)) }; });
      const big = BR[1] ? Math.max(.3, Math.min(1, (BR[1].r - 3.4) / 2.6)) : .5;
      const HP = sh.prims.filter(p => p.part === 'head' && !p.cloth && p.mat === 0), hc = HP.length ? mean(HP.map(W)) : [0, 2, S + 8];
      const mouth = [-.6, (HP.length ? Math.max(...HP.map(p => W(p)[1] + p.br * .6)) : hc[1] + 4) + 1.6, hc[2] - 2.2];
      const A = { armL: armPts('armL'), armR: armPts('armR') }, w = rx.w, u = rx.u, T = rx.tier;
      const hands = {}, poles = {}, hd = {}, push = { [-1]: [0, 0, 0], [1]: [0, 0, 0] }, round = { [-1]: 0, [1]: 0 };
      const go = (part, tgt, pole, dir, pushAt) => {   // 手腕：原位 → （陌生先往前推開）→ 遮住；照 w 收回
        if (!A[part]) return;
        let t = tgt;
        if (pushAt && T === 'stranger') t = u < .18 ? lerp(A[part].w0, pushAt, sm(u / .14)) : lerp(pushAt, tgt, sm((u - .18) / .16));
        hands[part] = lerp(A[part].w0, t, w); poles[part] = pole; if (dir) hd[part] = dir;
      };
      const angry = T === 'stranger' || T === 'friend';
      if (T === 'wife') go('armL', mouth, [-.7, .5, -.6]);   // 妻子：手摀嘴（舒服、忍住聲音），另一手不動
      else if (rx.zone === 'breast' && BR[0] && BR[1]) {
        go('armL', [BR[1].c[0] - 1.2, BR[1].front + 2.2, BR[1].c[2] + .6], [-.4, .7, -.7], null, [-2, BR[1].front + 10, S - 4]);
        if (angry) go('armR', [BR[0].c[0] + 1.4, BR[0].front + 3.4, BR[0].c[2] - 1.4], [.4, .7, -.7]);
        const k = sh.prims.some(p => p.cloth && !p.pk) ? 0 : (angry ? 1 : .6) * w;   // 穿著 T 恤／胸罩不擠（不然乳房會穿出衣服）
        for (const sd of [-1, 1]) { push[sd] = [-sd * .6 * big * k, .5 * big * k, 1.2 * big * k]; round[sd] = big * k; }   // 手臂夾著：胸部往中間擠
      } else if (rx.zone === 'groin') {
        go('armR', [.6, frontY(.6, C + 4.4) + 2.4, C + 4.4], [1, .2, -.1], [-.05, .3, -1]);
        if (angry) go('armL', [-1.4, frontY(-1.4, C + 5.8) + 3.2, C + 5.8], [-1, .2, -.1], [.05, .3, -1], [-3, frontY(-3, C + 8) + 10, C + 9]);
      } else if (rx.zone === 'waist') {
        go('armR', [7, backY(7, C + 1.5) - 1.6, C + 1.5], [1, -.3, -.4]);   // 手繞到後面護住屁股
        if (angry) go('armL', [-8.5, frontY(-8.5, zW) + 2, zW], [-1, .3, -.5], null, [-10, frontY(-8.5, zW) + 10, zW + 3]);   // 另一手擋在腰側（陌生先往前推）
      }
      modePlan = { hands, poles, push, round, handDir: hd };
    } else if (!anim && !m.mode && m.ang && m.ang.w > .02) {
      // 生氣說話：叉腰＝左手也照右手（原本就插腰）的位置叉到腰上；抱胸＝兩隻前臂交叉橫在乳房下面，乳房被托高、壓在手臂上
      const W = (p) => [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      const mean = (L) => { const c = [0, 0, 0]; for (const q of L) for (let i = 0; i < 3; i++) c[i] += q[i] / L.length; return c; };
      const bodyP = sh.prims.filter(p => p.mat === 0 && !p.carve && !p.sleeve && p.part !== 'armL' && p.part !== 'armR' && p.part !== 'head');   // 含衣服：手臂要在 T 恤外面
      const frontY = (x, z) => { for (let y = 22; y > -10; y -= .25) { for (const p of bodyP) if (H.primDist(p, x, y, z) < 0) return y; } return 4; };
      const BR = [-1, 1].map(sd => { const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && !p.nip && Math.sign(W(p)[0]) === sd); if (!L.length) return null;
        const c = mean(L.map(W)), r = Math.max(...L.filter(p => p.r).map(p => Math.max(...p.r)), 2), bot = Math.min(...L.map(p => W(p)[2] - (p.r ? p.r[2] : p.br * .5)));
        return { c, r, bot, front: Math.max(...L.map(p => W(p)[1] + p.br * .7)) }; });
      const big = BR[1] ? Math.max(.3, Math.min(1, (BR[1].r - 3.4) / 2.6)) : .5, w = m.ang.w;
      const A = { armL: armPts('armL'), armR: armPts('armR') };
      const hands = {}, poles = {};
      if (m.ang.kind === 'akimbo') {
        if (A.armL && A.armR) { const r = A.armR.w0; hands.armL = lerp(A.armL.w0, [-r[0], r[1], r[2]], w); poles.armL = [-1, -.4, .15]; }
        BX = { [-1]: [0, 0, m.ang.bounce * (.5 + 1.3 * big)], [1]: [0, 0, m.ang.bounce * (.5 + 1.3 * big)] };
      } else if (BR[0] && BR[1]) {
        // 2026-11-21 使用者：大於 C 的抱胸不是把胸壓扁，是手臂把胸撐起來、胸部放在手臂上——
        //   前臂在乳房（托高之後的）下緣下面、貼著身體（不擋在乳房前面），乳房整顆往上托、形狀不壓扁；C 以下只是手交叉在胸下
        const breastP = sh.prims.filter(p => p.part === 'breast' && !p.cloth);
        const bottom = (b) => {   // 這顆乳房真正的最低點（從中心往下掃）
          let zb = b.c[2];
          for (let z = b.c[2]; z > b.c[2] - 3 * b.r; z -= .2) {
            let hit = false;
            for (let y = b.c[1] - b.r; y <= b.c[1] + b.r * 1.6 && !hit; y += .4) for (const p of breastP) if (H.primDist(p, b.c[0], y, z) < 0) { hit = true; break; }
            if (hit) zb = z; else if (z < b.c[2] - b.r * .4) break;
          }
          return zb;
        };
        const rest = BR[1].r > 4.1;   // D 以上：胸部放在手臂上
        const lift = rest ? (.6 + 1.2 * big) * w : 0, ARM = 1.35;
        const zA = Math.min(bottom(BR[0]), bottom(BR[1])) + lift - ARM - .05;   // 前臂上緣剛好頂著托高後的下緣
        const torsoP = bodyP.filter(p => p.part !== 'breast');
        const torsoY = (x, z) => { for (let y = 22; y > -10; y -= .25) { for (const p of torsoP) if (H.primDist(p, x, y, z) < 0) return y; } return 4; };
        if (A.armL) { hands.armL = lerp(A.armL.w0, [BR[1].c[0] * .95 + 1.2, torsoY(BR[1].c[0], zA) + ARM + .2, zA], w); poles.armL = [-1, -.1, -.55]; }
        if (A.armR) { hands.armR = lerp(A.armR.w0, [BR[0].c[0] * .95 - 1.2, torsoY(BR[0].c[0], zA - .6) + ARM + 1.3, zA - .6], w); poles.armR = [1, -.1, -.55]; }   // 另一隻在外面、低一點（看得出交叉）
        BX = { [-1]: [0, .25 * lift, lift], [1]: [0, .25 * lift, lift] };
      }
      modePlan = { hands, poles, push: { [-1]: [0, 0, 0], [1]: [0, 0, 0] }, round: { [-1]: 0, [1]: 0 }, handDir: {} };
    }
    for (const part of ['armL', 'armR']) {
      if (modePlan) {
        const T = modePlan.hands[part];
        if (T) { const X = ikArm(part, T, modePlan.poles[part], modePlan.handDir[part]); if (X) armX[part] = X; }
        continue;
      }
      if (garPlan) {   // 脫胸罩／內褲：手腕照步驟走（IK）
        const sd = part === 'armL' ? -1 : 1, T = garPlan.hands[part];
        const pole = anim.kind === 'bra' && anim.u < .48 ? [sd, -.4, .1] : anim.kind === 'bra' && part === 'armL' ? [sd * .4, .7, -.7] : [sd, .35, -.55];   // 遮胸：手肘往前下、前臂橫在胸前
        if (T) { const X = ikArm(part, T, pole); if (X) armX[part] = X; }
        continue;
      }
      if (shirtPlan) {   // 脫 T 恤：手腕跟著下襬走（IK）；u＞.8 手放回來
        const u = anim.u, sd = part === 'armL' ? -1 : 1, T = shirtPlan.hands[part];
        if (T) { const X = ikArm(part, T, [sd, .35, -.55]); if (X) armX[part] = X; }
        continue;
      }
      if (anim && anim.kind === 'shirt' && anim.u > .8) {   // 脫完：手從頭頂慢慢放回原位
        const A = armPts(part); if (!A) continue;
        const sd = part === 'armL' ? -1 : 1, k = sm((anim.u - .8) / .2), top = [sd * 3.5, A.sp[1] + 2, A.sp[2] + 22];
        const X = ikArm(part, lerp(top, A.w0, k), [sd, .35, -.55]); if (X) armX[part] = X;
        continue;
      }
      const arm = sh.prims.filter(p => p.part === part && p.a && !p.cloth);   // 照建立順序：上臂（a＝肩）、前臂（a＝手肘）、手（a＝手腕）——不能照高度排（手放在腿上時手腕比手肘高）
      if (arm.length < 2) continue;
      const sd = part === 'armL' ? -1 : 1, lz = lift * LIFT[part];
      const pt = (p) => [p.a[0] + p.off[0], p.a[1] + p.off[1], p.a[2] + p.off[2] + lz];
      const sp = pt(arm[0]), ep = pt(arm[1]), w0 = arm[2] ? pt(arm[2]) : [ep[0], ep[1], ep[2] - 10];
      let upT = null, foreT = null, w = 0;
      if (anim) {
        const u = anim.u;
        w = u < .3 ? sm(u / .3) : u < .78 ? 1 : 1 - sm((u - .78) / .22);
        if (anim.kind === 'shirt') { upT = [sd * .32, .12, .94]; foreT = [-sd * .6, .2, .78]; }   // 兩手舉到頭上、在頭頂交叉拉衣服
        else if (anim.kind === 'bra') { upT = [sd * .7, -.5, -.5]; foreT = [-sd * .75, -.6, .25]; }   // 手肘往外往後、手到背後解扣
        else { upT = [sd * .3, .35, -.89]; foreT = [sd * .05, .6, -.8]; }   // 兩手往下到腰側、把內褲往下拉
      } else if (gest > 0 && part === 'armL') {   // 說話比劃（站著）：上臂往外往前一點、前臂往上往前攤手
        w = gest; upT = null; foreT = [sd * (.12 + .16 * Math.sin(4 * ph)), .62, .78];
      }
      if (!w) continue;
      const up = upT ? H.about(rotTo([ep[0] - sp[0], ep[1] - sp[1], ep[2] - sp[2]], upT, w), sp) : H.about(H.mulR(H.rotY(-sd * 14 * w), H.rotX(12 * w)), sp);
      const e2 = app(up, ep), w1 = app(up, w0);
      const fore = H.compose(H.about(rotTo([w1[0] - e2[0], w1[1] - e2[1], w1[2] - e2[2]], foreT, w), e2), up);
      armX[part] = { up, fore, upper: arm[0] };
    }
    // 軀幹（含乳房、衣服）用連續的位移場：往上從胯下 0 平滑升到肩膀 lift；往前胸口最多；乳房附近再往前往外一點
    const bcs = [-1, 1].map(sd => { const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && Math.sign(p.bc[0] + p.off[0]) === sd); if (!L.length) return null; const c = [0, 0, 0]; let r = 0; for (const p of L) { for (let i = 0; i < 3; i++) c[i] += (p.bc[i] + p.off[i]) / L.length; r = Math.max(r, p.br); } return { c, r: Math.min(r, 9) + 2 }; });
    const field = (q) => {
      const f = sm((q[2] - C) / (S - C)), fc = sm((q[2] - zW) / (S - zW));
      const d = [0, .3 * br * fc, lift * f];
      for (const [i, b] of bcs.entries()) if (b) { const w = 1 - Math.hypot(q[0] - b.c[0], q[1] - b.c[1], q[2] - b.c[2]) / b.r; if (w > 0) { const ws = sm(w); d[0] += (i ? 1 : -1) * .3 * br * ws; d[1] += .2 * br * ws; } }
      return d;
    };
    /** which：true／'up' 上臂、'hand' 手掌（有另外轉才有）、其他＝前臂。 */
    const armAct = (part, which) => { const X = armX[part], e = SHRUG[part] || [0, 0, 0], jj = m.jolt ? 1 : 0; return [e[0], e[1] + (jj ? -.7 * m.jolt : 0), lift * LIFT[part] + e[2] + (jj ? 1.6 * m.jolt : 0), X ? (which === true || which === 'up' ? X.up : which === 'hand' && X.handX ? X.handX : X.fore) : null]; };
    // 高潮抽搐（m.jolt）：上半身（胸、肩、頭、手、乳房）往上往後猛抽一下，腿不動
    const J = m.jolt || 0, jz = 1.6 * J, jy = -.7 * J;
    /** 一個身體零件這格怎麼動：[dx, dy, dz, 轉動或 null]。 */
    const act = (p, q) => {
      const part = p.part;
      if (part === 'head' || p.mat === 1) return [0, jy, hl + jz, headX];
      if (part === 'armL' || part === 'armR') { const X = armX[part]; return armAct(part, !X ? false : p === X.upper ? 'up' : X.hand && X.hand.has(p) ? 'hand' : false); }
      if (part === 'legs') return null;
      const d = field(q);
      if (J) { const w = Math.max(0, Math.min(1, (q[2] - C) / (S - C))); d[1] += jy * w; d[2] += jz * w; }   // 越上面抽得越多
      d.push(null); return d;
    };
    const body = sh.prims.filter(p => p.mat === 0 && !p.cloth && !p.carve);
    // 脫衣動畫：要移走的那件（T 恤＝外衣；胸罩＝內衣的布 1／2；內褲＝內衣的其他（蕾絲、褲頭））
    const isGone = !anim ? null : anim.kind === 'shirt' ? (p) => p.cloth && !p.under : anim.kind === 'bra' ? (p) => p.cloth && p.under && (p.cloth === 1 || p.cloth === 2) : (p) => p.cloth && p.under && p.cloth !== 1 && p.cloth !== 2;
    let goneMove = null;
    if (anim) {
      const u = anim.u, G = sh.prims.filter(isGone);
      if ((anim.kind === 'shirt' ? u > .8 : u > .78) || !G.length) goneMove = () => [0, 0, 1000];   // 已經脫掉：移到畫面外
      else if (anim.kind === 'shirt') goneMove = null;   // T 恤另外照 shirtPlan 翻折（下面）
      else if (anim.kind === 'bra') {   // 解開後往下往前掉
        const k = sm((u - .38) / .38);
        goneMove = () => [0, 5 * k, -16 * k];
      } else {   // 內褲：沿大腿往膝蓋方向滑下去
        const k = sm((u - .25) / .5), dir = nrm([.55, .45, -.25]);
        goneMove = () => [dir[0] * 16 * k, dir[1] * 16 * k, dir[2] * 16 * k];
      }
    }
    const acts = new Map();
    for (const p of sh.prims) {
      let a;
      const q = [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      if (shirtPlan && p.cloth && !p.under) {   // 脫 T 恤：布照翻折算新位置；袖子先跟上臂，最後拉過頭時收進手裡
        if (p.sleeve && !shirtPlan.kOff) a = armAct(p.bc[0] + p.off[0] < 0 ? 'armL' : 'armR', true);
        else if (p.sleeve) { const sd = Math.sign(p.bc[0] + p.off[0]) || 1, h = shirtPlan.hmid; a = [h[0] + sd * 3 - q[0], h[1] - q[1], h[2] - 1 - q[2], null]; }
        else { const n = shirtPlan.place(q); a = [n[0] - q[0], n[1] - q[1], n[2] - q[2], null]; }
      } else if (garPlan && isGone(p)) {
        const n = garPlan.place(q, p);
        if (!n) { const f = field(q); a = [f[0], f[1], f[2], null]; }
        else if (n[2] >= 999 && n[0] === 0) a = [0, 0, 1000, null];
        else a = [n[0] - q[0], n[1] - q[1], n[2] - q[2], null];
      } else if (goneMove && isGone(p)) { const g = goneMove(q), f = field(q); a = [g[0] + f[0], g[1] + f[1], g[2] + f[2], null]; }
      else if (p.sleeve) {   // 袖子：上臂那段跟上臂、前臂那段跟前臂
        const part = p.bc[0] + p.off[0] < 0 ? 'armL' : 'armR';
        a = armAct(part, p.sleeve === 1);
      } else if (p.cloth) {   // 衣服：最近的是上臂才跟手走（袖子），其他照軀幹的位移場（靠近手的下襬、褲頭不會被帶走）
        let best = null, bd = 1e9;
        for (const b of body) { const lb = Math.hypot(q[0] - b.bc[0] - b.off[0], q[1] - b.bc[1] - b.off[1], q[2] - b.bc[2] - b.off[2]) - b.br; if (lb >= bd) continue; const d = H.primDist(b, q[0], q[1], q[2]); if (d < bd) { bd = d; best = b; } }
        const X = best && armX[best.part];
        a = !best ? null : X && best === X.upper ? armAct(best.part, true) : (best.part === 'armL' || best.part === 'armR') ? field(q).concat([null]) : act(best, q);
        if (BX && a && best && best.part === 'breast') { const e = BX[Math.sign(best.bc[0] + best.off[0]) || 1]; a = [a[0] + e[0], a[1] + e[1], a[2] + e[2], a[3]]; }   // 蓋在乳房上的衣服跟著乳房晃／托高
      } else {
        a = act(p, q);
        if (BX && a && p.part === 'breast') { const e = BX[Math.sign(q[0]) || 1]; a = [a[0] + e[0], a[1] + e[1], a[2] + e[2], a[3]]; }
      }
      if (a) acts.set(p, a);
    }
    if (modePlan) for (const p of sh.prims) {   // 被手壓著／托著的乳房：往上往中間擠、更挺更圓（乳房零件和乳暈一起動）
      if (p.part !== 'breast' || p.cloth) continue;
      const sd = Math.sign(p.bc[0] + p.off[0]) || 1, d = modePlan.push[sd], k = modePlan.round[sd];
      const a = acts.get(p) || [0, 0, 0, null]; acts.set(p, [a[0] + d[0], a[1] + d[1], a[2] + d[2], a[3]]);
      if (k && p.k === 0 && p.r && !p.nip) { p.r = [p.r[0] * (1 - .04 * k), p.r[1] * (1 + .1 * k), p.r[2] * (1 - .05 * k)]; p.br = Math.max(p.br, ...p.r); }   // 前後更凸、上下稍扁＝圓潤挺
    }
    for (const [p, a] of acts) {
      p.off = [p.off[0] + a[0], p.off[1] + a[1], p.off[2] + a[2]];
      if (a[3]) p.xf = p.xf ? H.compose(a[3], p.xf) : a[3];
    }
    for (const st of sh.areolaStamps || []) {
      const sd = Math.sign(st.q[0]) || 1, d = modePlan ? modePlan.push[sd] : [0, 0, 0], k = modePlan ? modePlan.round[sd] : 0;
      const e = BX ? BX[sd] : [0, 0, 0];
      st.q = [st.q[0] + sd * .3 * br + d[0] + e[0], st.q[1] + .45 * br + d[1] + .25 * k + e[1], st.q[2] + lift * .75 + d[2] + e[2]];
    }
  }

  /** droom 的部位標記色 → 房間黑影配色（白邊→深線；乳暈乳頭→淡淡的印子；摺線→身體色）。 */
  function shade(px) {
    for (let i = 0; i < px.length; i += 4) {
      if (!px[i + 3]) continue;
      const r = px[i], g = px[i + 1], b = px[i + 2];
      let o = null;
      if (r === 240 && g === 240 && b === 240) o = [30, 24, 40];   // 手腳疊在身體前面的邊：深色
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
    const key = JSON.stringify(doll), body = doll._body || 'idle';   // _body：站著 idle／脫衣時坐著 mermaid
    if (cache.key !== key) { cache.key = key; cache.base = F.build(doll, body, 0, 0, {}); }
    const base = cache.base;
    const shape = () => ({ P: base.P, sh: Object.assign({}, base.sh, { prims: base.sh.prims.map(p => Object.assign({}, p)), areolaStamps: (base.sh.areolaStamps || []).map(q => Object.assign({}, q)) }) });
    const m = motion(pose, f, n, body === 'mermaid', doll._mode || null, doll._tier || null);
    // 分三次畫：只有身體 → 身體＋內衣（胸罩、丁字褲）→ 身體＋外衣（T 恤），再一層層疊灰色上去
    // 先用全部零件變形（脫 T 恤時手要照 T 恤的下襬走——只畫身體那一層也要看得到 T 恤），再篩這一層要畫的
    const run = (keep) => F.render(doll, body, 0, 0, { scale, cv, shape, deform: (sh, P, H) => { deform(sh, P, H, m); sh.prims = sh.prims.filter(keep); } });
    const hasU = base.sh.prims.some(p => p.cloth && p.under), hasO = base.sh.prims.some(p => p.cloth && !p.under);
    const r = run(p => !p.cloth);
    shade(r.pixels);
    if (doll._mode || m.react || m.ang) {   // 脫光後的姿勢、被摸的反應、生氣說話：手臂疊在身體前面的地方加深（使用者：半透明的影子疊兩層＝比較深；不用淺色）
      const isArm = (p) => !p.cloth && (p.part === 'armL' || p.part === 'armR');
      const arms = run(isArm), body = run(p => !p.cloth && !isArm(p)), px = r.pixels, ad = arms.depth, bd = body.depth;
      for (let i = 0, n = px.length / 4; i < n; i++) {
        if (!arms.pixels[i * 4 + 3] || !body.pixels[i * 4 + 3] || !(ad[i] > bd[i])) continue;   // 手臂在身體前面
        const j = i * 4; if (px[j] === 31 || px[j] === 78) continue;   // 頭髮蓋在手上：照舊
        px[j] = px[j] * .66; px[j + 1] = px[j + 1] * .66; px[j + 2] = px[j + 2] * .66; px[j + 3] = Math.min(255, px[j + 3] + 30);
      }
    }
    if (hasU) veil(r.pixels, run(p => !p.cloth || p.under).pixels);
    if (hasO) veil(r.pixels, run(p => !p.cloth || !p.under).pixels);
    return r;
  }

  // ---------------------------------------------------------------- droom 人偶＋worker
  let F = null, loading = null, worker = null, workers = [], seq = 0;
  // 2026-11-21：一格要 1～2 秒 → 開好幾個 worker 一起算（核心數 −1，最多 4 個），算好的格子存進 IndexedDB，下次打開直接拿
  const POOL = Math.max(1, Math.min(4, ((navigator.hardwareConcurrency || 2) - 1)));
  const waiters = new Map();
  function loadDroom() {
    if (F) return Promise.resolve(F);
    if (!loading) loading = fetch(DROOM_URL).then(r => r.text()).then(src => {
      const box = {};
      new Function('globalThis', 'module', src)(box, undefined);   // 兩個人偶檔都叫 RoomDoll → 另外裝，不蓋掉房間用的
      F = box.RoomDoll;
      try {
        const code = `const F=(${F.factorySource})();const motion=${motion};const deform=${deform};const shade=${shade};const clothAt=${clothAt};const veil=${veil};const drawFrame=${drawFrame};const CV=${JSON.stringify(CV)};const cache={};
onmessage=(e)=>{const j=e.data;try{const r=drawFrame(F,cache,j.doll,j.pose,j.f,j.n,${SCALE},j.cv);postMessage({id:j.id,w:r.width,h:r.height,px:r.pixels},[r.pixels.buffer]);}catch(err){postMessage({id:j.id,err:String(err)});}};`;
        const url = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
        for (let i = 0; i < POOL; i++) {
          const w = new Worker(url); w.busy = 0;
          w.onmessage = (e) => { w.busy--; const cb = waiters.get(e.data.id); if (cb) { waiters.delete(e.data.id); cb(e.data); } };
          workers.push(w);
        }
        worker = workers[0];
      } catch { worker = null; }
      return F;
    });
    return loading;
  }
  const mainCache = {};
  function renderFrame(doll, pose, f) {
    if (workers.length) {
      const id = ++seq, w = workers.reduce((a, b) => (b.busy < a.busy ? b : a));
      w.busy++;
      return new Promise((res) => { waiters.set(id, res); w.postMessage({ id, doll, pose, f, n: nOf(pose), cv: cvOf(doll) }); });
    }
    const r = drawFrame(F, mainCache, doll, pose, f, nOf(pose), SCALE, cvOf(doll));
    return Promise.resolve({ w: r.width, h: r.height, px: r.pixels });
  }

  // ---------------------------------------------------------------- 算好的格子存在手機裡（IndexedDB，PNG）
  //   鑰匙＝程式版本（動作／變形／畫法的原始碼雜湊＋人偶檔）＋身形＋第幾格；程式一改就自動作廢（開頁時清掉舊版本的）。
  const CODE_HASH = (() => { const t = DROOM_URL + SCALE + String(motion) + String(deform) + String(drawFrame) + String(shade) + String(veil) + String(clothAt); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); })();
  let dbP = null;
  function db() {
    if (!dbP) dbP = new Promise((res) => {
      try {
        const rq = indexedDB.open('chat-shadow-frames', 1);
        rq.onupgradeneeded = () => rq.result.createObjectStore('f');
        rq.onsuccess = () => { const d = rq.result; res(d); setTimeout(() => prune(d), 8000); };
        rq.onerror = () => res(null);
      } catch { res(null); }
    });
    return dbP;
  }
  function prune(d) {   // 舊版本的格子、30 天沒用的都刪掉
    try {
      const st = d.transaction('f', 'readwrite').objectStore('f'), old = Date.now() - 30 * 864e5;
      st.openCursor().onsuccess = (e) => { const c = e.target.result; if (!c) return; if (!String(c.key).startsWith(CODE_HASH + '|') || !(c.value && c.value.at > old)) c.delete(); c.continue(); };
    } catch { /* ignore */ }
  }
  const fkey = (job, pose, f) => `${CODE_HASH}|${job.key}|${pose}|${f}`;
  async function cacheGet(k) {
    const d = await db(); if (!d) return null;
    const v = await new Promise((res) => { try { const rq = d.transaction('f').objectStore('f').get(k); rq.onsuccess = () => res(rq.result || null); rq.onerror = () => res(null); } catch { res(null); } });
    if (!v || !v.blob) return null;
    try {
      const bm = await createImageBitmap(v.blob), c = document.createElement('canvas'); c.width = bm.width; c.height = bm.height;
      const x = c.getContext('2d', { willReadFrequently: true }); x.drawImage(bm, 0, 0); bm.close && bm.close();
      return x.getImageData(0, 0, c.width, c.height);
    } catch { return null; }
  }
  async function cachePut(k, img) {
    const d = await db(); if (!d) return;
    try {
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').putImageData(img, 0, 0);
      const blob = await new Promise((res) => c.toBlob(res, 'image/png')); if (!blob) return;
      d.transaction('f', 'readwrite').objectStore('f').put({ blob, at: Date.now() }, k);
    } catch { /* 存不下就算了 */ }
  }
  /** 把某一組（例如剛被摸的部位）插隊到最前面先算。 */
  function bump(job, pose) {
    if (!job.todo) return;
    const mine = job.todo.filter(([p]) => p === pose);
    job.todo = mine.concat(job.todo.filter(([p]) => p !== pose));
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
    // 脫衣對話中（使用者）：美人魚坐姿；脫衣進度釘在 pinStage，脫衣動畫播完才換到下一階
    const undressing = pinStage != null;
    const st = Math.max(0, Math.min(3, Number(undressing ? pinStage : s.undressStage) || 0));
    doll.skirt = '';
    if (undressing) doll._body = 'mermaid';
    // 一般聊天、脫光以後（使用者）：妻子以下害羞——一手遮胸（壓得胸部更挺更圓）、一手遮下體、側臉看旁邊；
    //   妻子以上主動——站著兩手托著乳房揉，或坐下來摸陰唇、抬頭（每次打開聊天隨機一種）
    if (!undressing) doll._tier = s.tier || (s.wife ? 'wife' : 'stranger');   // 被摸的反應照關係帶
    if (!undressing && st >= 3) {
      if (!s.wife) doll._mode = 'cover';
      else if (wifePick === 'touch') { doll._mode = 'touch'; doll._body = 'mermaid'; }
      else doll._mode = 'fondle';
    }
    if (st === 0) { doll.cloth = 'tee'; doll.underBra = true; }
    else if (st === 1) doll.cloth = 'bra';
    if (st <= 1) doll.braSupport = true;
    if (st <= 2) doll.pants = 'tie_thong';   // 綁帶丁字褲（使用者：要像內褲、脫的時候解開兩側的帶子）
    const key = JSON.stringify(doll);
    if (cur && cur.key === key) return isReady(cur);
    if (cur) cur.dead = true;
    if (canvas) canvas.dataset.f = '';   // 新的一組：格名跟上一組一樣（breathe0…）也要重畫
    const job = cur = { key, sets: { breathe: [], talk: [] }, dead: false, P: F.proportions ? F.proportions(doll) : null, cv: cvOf(doll), stage: st };
    const todo = [];
    if (undressing) {
      // 脫衣對話（使用者）：平常顯示立繪，黑影只在她答應脫的時候出來播動畫 → 只預載下一件的脫衣動畫
      if (st < 3) { const a = ANIMS[st]; job.anim = a; job.sets[a] = []; for (let f = 0; f < nOf(a); f++) todo.push([a, f]); }
    } else {
      // 順序（使用者：摸她沒動作）：先第一格呼吸（人先出來）→ 被摸的反應（站著才摸得到）→ 其他呼吸 → 說話
      todo.push(['breathe', 0]);
      if (cvOf(doll) === CV) for (const r of REACTS) { job.sets[r] = []; for (let f = 0; f < NA_OF[r]; f++) todo.push([r, f]); }
      for (let f = 1; f < N; f++) todo.push(['breathe', f]);
      for (let f = 0; f < N; f++) todo.push(['talk', f]);
      if (cvOf(doll) === CV && !doll._mode) for (const a of ANGS) { job.sets[a] = []; for (let f = 0; f < NA_OF[a]; f++) todo.push([a, f]); }   // 生氣說話（站著、還沒脫光）
      if (doll._mode === 'touch') { job.sets.peak = []; for (let f = 0; f < NA_OF.peak; f++) todo.push(['peak', f]); }   // 忽然仰頭（偶爾播）
    }
    job.todo = todo;
    const runner = async () => {
      while (!job.dead && job.todo.length) {
        const [pose, f] = job.todo.shift(), k = fkey(job, pose, f);
        let img = await cacheGet(k);
        if (job.dead) return;
        if (!img) {
          const r = await renderFrame(doll, pose, f);
          if (job.dead) return;
          if (r.err) { console.warn('chat_shadow', r.err); job.todo = []; return; }
          img = new ImageData(new Uint8ClampedArray(r.px), r.w, r.h);
          void cachePut(k, img);
        }
        job.sets[pose][f] = img;
        if (isReady(job) && !job.sentReady) { job.sentReady = true; sync(); }
      }
    };
    for (let i = 0; i < Math.max(1, workers.length); i++) void runner();   // 每個 worker 一條（第一格呼吸一定先拿走）
    return false;
  }

  /** 這一組可以顯示了嗎：一般＝第一格呼吸好了；脫衣中＝脫衣動畫整段好了。 */
  function isReady(job) { return job.anim ? full(job.sets[job.anim], nOf(job.anim)) : !!job.sets.breathe[0]; }
  function full(set, n = N) { if (!set || set.length < n) return false; for (let i = 0; i < n; i++) if (!set[i]) return false; return true; }
  function draw(img, tag) {
    if (canvas.width !== img.width || canvas.height !== img.height) { canvas.width = img.width; canvas.height = img.height; }   // 站著↔坐著畫布大小不同
    ctx.putImageData(img, 0, 0); canvas.dataset.f = tag;
    const fb = feetRow(img);
    if (fb !== canvas._feet) { canvas._feet = fb; placeFeet(); }
  }
  // ---------------------------------------------------------------- 站在對話框上面（使用者：不要被對話框擋到，差 2 px）
  const feetCache = new WeakMap();
  /** 這一格她最低的那一列（腳底／坐著的屁股、腿）。 */
  function feetRow(img) {
    let y = feetCache.get(img);
    if (y == null) {
      const { width: w, height: h, data } = img; y = h - 1;
      scan: for (; y >= 0; y--) for (let x = 0; x < w; x++) if (data[(y * w + x) * 4 + 3]) break scan;
      feetCache.set(img, y);
    }
    return y;
  }
  /** 脫衣對話（使用者）：立繪的底端也在對話框上緣上面 2 px（平常的聊天照舊：立繪貼畫面底、下半身被對話框蓋住）。 */
  function placePortrait() {
    const img = document.getElementById('portrait-img'), sheet = document.getElementById('portrait-sheet');
    if (!img || !sheet) return;
    const box = document.getElementById('talk-box');
    let T = box ? box.getBoundingClientRect().top : 0;
    // 鍵盤出來時對話框會往上移：立繪照鍵盤出來之前的位置算（不縮小，只是被鍵盤蓋住）
    if (T > 0 && document.body.classList.contains('kb-open')) T += parseFloat(getComputedStyle(document.body).getPropertyValue('--kb')) || 0;
    const undress = sheet.classList.contains('undress-chat');
    // 2026-11-21 使用者：長按頭換成的半身立繪太低、被對話框擋到 → 一般聊天的立繪模式也放在對話框上面 2 px，上緣讓開最上面的輸入列
    const pmode = sheet.classList.contains('portrait-mode') && !img.dataset.sexStep;
    if ((undress || pmode) && !sheet.hidden && T > 0) {
      img.style.bottom = (window.innerHeight - T + 2) + 'px';
      let top = 12;
      if (undress) { const bar = sheet.querySelector('.talk-acts.undress-bar'), br = bar && !bar.hidden ? bar.getBoundingClientRect() : null; if (br && br.height) top = br.bottom + 6; }   // 脫衣按鈕在上方：立繪上緣讓開
      else { const row = document.getElementById('talk-input-row'), rr = row ? row.getBoundingClientRect() : null; if (rr && rr.height && rr.bottom < T) top = rr.bottom + 6; }   // 輸入列在上方
      img.style.height = Math.max(120, Math.min(720, T - 2 - top)) + 'px';
      img.style.maxHeight = 'none';
    } else if (img.style.bottom) { img.style.bottom = ''; img.style.height = ''; img.style.maxHeight = ''; }
  }
  /** 量對話框上緣，把黑影往上／下移到腳底剛好在對話框上面 2 px（畫布縮放會跟著高度變，量三次收斂）。 */
  // 2026-11-21 使用者：打字時鍵盤彈出，黑影不要縮小——照原本的大小、位置，只是被鍵盤蓋住。
  //   鍵盤出來（body.kb-open，或畫面高度突然矮了 80px 以上）那一刻把黑影的上緣、高度釘成像素；鍵盤收起來才放開、照對話框重新對齊。
  //   畫面本身會變矮的手機（adjustResize）：鍵盤一出來黑影就已經被擠小了 → 用鍵盤出來之前最後一次對齊好的位置（lastRect）。
  let fullH = 0, kbPin = null, lastRect = null;
  function keyboardUp() {
    const h = window.innerHeight, ae = document.activeElement;
    if (!kbPin) fullH = Math.max(fullH, h);
    const typing = !!ae && (ae.tagName === 'INPUT' || ae.tagName === 'TEXTAREA' || ae.isContentEditable);
    return document.body.classList.contains('kb-open') || (typing && fullH > 0 && h < fullH - 80);
  }
  window.addEventListener('orientationchange', () => { fullH = 0; });
  function pinForKeyboard() {
    if (!wrap) return false;
    const up = !wrap.hidden && keyboardUp();
    if (up && !kbPin) {
      const r = lastRect || wrap.getBoundingClientRect();
      if (r.height > 0) { kbPin = { top: r.top, h: r.height }; Object.assign(wrap.style, { top: r.top + 'px', height: r.height + 'px', bottom: 'auto' }); }
    } else if (!up && kbPin) {
      kbPin = null; wrap.style.top = ''; wrap.style.height = ''; wrap.style.bottom = '';
      fullH = window.innerHeight;
    }
    return !!kbPin;
  }
  function placeFeet() {
    placePortrait();
    if (!wrap || wrap.hidden || canvas._feet == null) return;
    if (pinForKeyboard()) return;   // 鍵盤出來：釘住不動
    const box = document.getElementById('talk-box');
    const T = box ? box.getBoundingClientRect().top : 0;
    if (!T || T <= 0) return;
    for (let i = 0; i < 3; i++) {
      const cr = canvas.getBoundingClientRect(); if (!cr.height) return;
      const k = Math.min(cr.width / canvas.width, cr.height / canvas.height);
      const feet = cr.bottom - (canvas.height - canvas._feet - 1) * k;
      const d = feet - (T - 2);
      if (Math.abs(d) < .5) break;
      const b = parseFloat(getComputedStyle(wrap).bottom) || 0;
      wrap.style.bottom = (b + d) + 'px';
    }
    const lr = wrap.getBoundingClientRect(); if (lr.height > 0) lastRect = { top: lr.top, height: lr.height };
  }

  // ---------------------------------------------------------------- 脫衣（使用者：按下脫衣、她脫了 → 黑影表演脫衣動畫）
  let reactPlay = null;   // 被摸的反應 {kind, t0}
  let angPlay = null, angPick = null;   // 生氣說話 {kind, phase, i, at}；angPick：這次生氣用叉腰還是抱胸（30 秒內同一種）
  let pinStage = null, animPlay = null;   // pinStage：脫衣對話中畫的是哪一階；animPlay：{kind, to, t0, wait}
  /** test_room_summon.js 在她決定脫一件時叫（from→to）。動畫還沒算好就等一下（最多 25 秒），算不出來就直接換。 */
  function undress(from, to) {
    if (pinStage == null || !cur || from >= 3) { if (pinStage != null) { pinStage = to; sync(); } return; }
    animPlay = { kind: ANIMS[from], to, t0: 0, wait: performance.now() };
    play();   // 立繪顯示中也要跑：動畫算好就切到黑影播
  }

  function tick(t) {
    raf = 0;
    if (!wrap || !cur || (wrap.hidden && !animPlay)) return;
    const dt = Math.min(.25, lastT ? (t - lastT) / 1000 : 0); lastT = t;
    if (!tick.placed || t - tick.placed > 500) { tick.placed = t; placeFeet(); }   // 對話框晚一點才到位也對得齊
    if (animPlay) {
      const set = cur.sets[animPlay.kind];
      if (!animPlay.t0) {
        if (full(set, nOf(animPlay.kind))) { animPlay.t0 = t; draw(set[0], animPlay.kind + 0); sync(); }   // 算好了：從立繪切到黑影開始播
        else if (t - animPlay.wait > 25000) { const to = animPlay.to; animPlay = null; pinStage = to; sync(); }   // 等太久（還沒算好）：不播，直接換
      }
      if (animPlay && animPlay.t0) {
        const i = beatFrame(animPlay.kind, t - animPlay.t0);
        if (i >= nOf(animPlay.kind)) { const to = animPlay.to; animPlay = null; pinStage = to; sync(); }   // 播完：黑影淡出回到立繪，開始預載下一件
        else if (canvas.dataset.f !== animPlay.kind + i) draw(set[i], animPlay.kind + i);
      }
      raf = requestAnimationFrame(tick);
      return;
    }
    if (reactPlay) {   // 被摸的反應：播完回到呼吸／說話；還沒算好（已經插隊先算）最多等 4 秒
      const set = cur.sets[reactPlay.kind];
      if (!full(set, nOf(reactPlay.kind))) { if (t - reactPlay.wait > 4000) reactPlay = null; }
      else {
        if (!reactPlay.t0) reactPlay.t0 = t;
        let el = t - reactPlay.t0, k = 0;
        while (k < REACT_SEQ.length && el >= REACT_MS[k]) el -= REACT_MS[k++];
        if (k >= REACT_SEQ.length) { reactPlay = null; mode = ''; }
        else { const i = REACT_SEQ[k]; if (canvas.dataset.f !== reactPlay.kind + i) draw(set[i], reactPlay.kind + i); raf = requestAnimationFrame(tick); return; }
      }
    }
    if (angPlay && !reactPlay) {   // 生氣說話：進場一次 → 講話循環 → 講完 1.2 秒手放下
      const k = angPlay.kind, set = cur.sets[k], A = ANG[k];
      if (!full(set, nOf(k))) angPlay = null;
      else {
        if (!angPlay.at) { angPlay.at = t; angPlay.phase = 'enter'; angPlay.i = 0; angPlay.x = 0; }
        let guard = 0;
        while (angPlay && t - angPlay.at >= A.ms(angPlay.i) && guard++ < 50) {
          angPlay.at += A.ms(angPlay.i);
          if (angPlay.phase === 'enter') { angPlay.i++; if (angPlay.i >= A.enter) { angPlay.phase = 'loop'; angPlay.i = A.loop[0]; } }
          else if (angPlay.phase === 'loop') {
            if (t > talkUntil + 1200) { angPlay.phase = 'exit'; angPlay.x = 0; angPlay.i = A.exit[0]; }
            else angPlay.i = angPlay.i >= A.loop[1] ? A.loop[0] : angPlay.i + 1;
          } else { angPlay.x++; if (angPlay.x >= A.exit.length) { angPlay = null; mode = ''; } else angPlay.i = A.exit[angPlay.x]; }
        }
        if (angPlay) { if (canvas.dataset.f !== k + angPlay.i) draw(set[angPlay.i], k + angPlay.i); raf = requestAnimationFrame(tick); return; }
      }
    }
    // 妻子摸陰唇：每 8～16 秒忽然仰頭一次（說話時不播）
    if (cur.sets.peak && full(cur.sets.peak, nOf('peak'))) {
      if (!cur.peakAt) cur.peakAt = t + 5000 + Math.random() * 6000;
      if (!cur.peakT0 && t >= cur.peakAt && t >= talkUntil) cur.peakT0 = t;
      if (cur.peakT0) {
        const i = beatFrame('peak', t - cur.peakT0);
        if (i >= nOf('peak')) { cur.peakT0 = 0; cur.peakAt = t + 8000 + Math.random() * 8000; mode = ''; }
        else { if (canvas.dataset.f !== 'peak' + i) draw(cur.sets.peak[i], 'peak' + i); raf = requestAnimationFrame(tick); return; }
      }
    }
    const next = t < talkUntil && full(cur.sets.talk) ? 'talk' : 'breathe';
    if (next !== mode) { mode = next; clock = 0; }
    const set = cur.sets[mode];
    clock += dt * FPS[mode];
    let i = Math.floor(clock) % N;
    if (!set[i]) { i = 0; clock = 0; }   // 還沒算好的格：先停在第一格
    if (set[i] && canvas.dataset.f !== mode + i) draw(set[i], mode + i);
    raf = requestAnimationFrame(tick);
  }
  function play() { if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function wanted(sheet) {
    if (!sheet || sheet.hidden) return null;
    const img = document.getElementById('portrait-img');
    if (img && img.dataset.sexStep) return null;   // 做愛對話：主圖是步驟圖
    if (document.getElementById('room-scene-overlay')?.hidden === false) return null;
    const s = spec();
    return s && s.look !== undefined ? s : null;
  }

  // 2026-11-19 使用者：聊天先出現黑影；長按黑影的頭 → 半身立繪；長按立繪 → 回到黑影。每次打開聊天都從黑影開始。
  let portraitMode = false, wasOpen = false, fadeT = 0, wifePick = 'fondle';
  function sync() {
    const sheet = document.getElementById('portrait-sheet');
    if (!ensureEl()) return;
    const open = !!(sheet && !sheet.hidden);
    if (open && !wasOpen) { portraitMode = false; wifePick = Math.random() < .5 ? 'fondle' : 'touch'; }
    wasOpen = open;
    // 脫衣對話開始／結束：開始時釘住目前的脫衣進度（坐下）；結束就照實際進度（站起來）
    const undressOn = open && !!sheet?.classList.contains('undress-chat');
    if (undressOn && pinStage == null) { const sp = spec(); pinStage = Math.max(0, Math.min(3, Number(sp?.undressStage) || 0)); }
    if (!undressOn && pinStage != null) { pinStage = null; animPlay = null; }
    const s = wanted(sheet);
    const ready = s ? prepare(s) : false;   // 立繪顯示時也照算（脫衣動畫預載）
    // 脫衣中（使用者）：平常是立繪，只有她答應脫、動畫開始播的時候才是黑影
    const show = !portraitMode && (!undressOn || !!(animPlay && animPlay.t0));
    const want = !!s && show;
    // 換姿勢／換下一階時新的一組還在算：黑影留著（畫布停在上一格），不要閃掉
    const on = want && (ready || (open && !wrap.hidden && !wrap.classList.contains('cs-out')));
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
      if (open) {   // 換成立繪（長按、脫衣動畫播完、進脫衣對話）：黑影淡出（立繪同時在中間淡入，CSS）
        wrap.classList.remove('cs-in'); wrap.classList.add('cs-out');
        fadeT = setTimeout(() => { fadeT = 0; if (wrap.classList.contains('cs-out')) { wrap.hidden = true; wrap.classList.remove('cs-out'); } }, 420);
      } else { wrap.hidden = true; wrap.classList.remove('cs-in', 'cs-out'); }
    }
    if (on || (animPlay && !animPlay.t0)) play(); else stop();
    if (on) placeFeet(); else placePortrait();
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
    if (top < 0 || y < top - 8 || y > top + ((cur.cv || CV).ay * SCALE - top) * .16) return false;
    for (let dy = -8; dy <= 8; dy += 2) for (let dx = -8; dx <= 8; dx += 2) if (A(Math.round(x + dx), Math.round(y + dy))) return true;
    return false;
  }
  /** 畫布像素 → 摸到哪一區（照她的身體比例 P：S 肩線、C 胯下、T 軀幹長；droom 橫向拉寬 1.1）。 */
  function zoneAt(px, py) {
    const P = cur && cur.P; if (!P || cur.cv !== CV) return null;   // 只有站著時摸得到（脫衣對話坐著時本來就不能調戲）
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
    // 使用者：立繪時按空白 → 回到黑影（不關聊天）；黑影時按空白 → 回房間（原本的關聊天）。捕獲階段先攔，蓋過 summon 的關閉
    document.addEventListener('click', (ev) => {
      if (!portraitMode || ev.target?.id !== 'portrait-backdrop') return;
      ev.stopImmediatePropagation(); ev.preventDefault();
      portraitMode = false; sync();
    }, true);
    // 黑影畫布蓋住畫面中間：點到她旁邊透明的地方＝點背景（關掉聊天，跟原本一樣）；
    // 點在她身上＝摸她（使用者：調戲不用按鈕）：胸部／下體／腰部臀部 → test_room_summon.js 的 RoomTouch.zone 挑一個已解鎖的動作
    canvas.addEventListener('click', (ev) => {
      const [x, y] = toCanvas(ev), f = cur && cur.sets[mode] && (cur.sets[mode].find(Boolean));
      if (!f) return;
      const xi = Math.round(x), yi = Math.round(y);
      const solid = xi >= 0 && yi >= 0 && xi < f.width && yi < f.height && f.data[(yi * f.width + xi) * 4 + 3] > 0;
      if (!solid) { document.getElementById('portrait-backdrop')?.click(); return; }
      const zone = zoneAt(x, y);
      // 摸到就有反應（使用者：摸她沒動作）；還沒解鎖的地方一樣會反抗／遮，只是不算動作、她不說話
      if (zone) {
        window.RoomTouch?.zone(zone);
        const k = 'r_' + zone;
        if (cur && cur.sets[k]) { if (!full(cur.sets[k], nOf(k))) bump(cur, k); reactPlay = { kind: k, t0: 0, wait: performance.now() }; play(); }
      }
    });
  }

  /** 她的字一個一個出來 → 說話動作；停下來 0.9 秒後回到呼吸。 */
  function talking() {
    const now = performance.now(), fresh = now > talkUntil;
    talkUntil = now + 900;
    if (fresh) maybeAngry(now);   // 她開口那一刻看是不是在生氣
  }
  /** 她在生氣（summon 的 RoomLookProvider().angry）就用叉腰／抱胸講話；還沒算好就插隊先算，這次先照一般說話。 */
  function maybeAngry(now) {
    if (angPlay || !cur || !cur.sets.ang_akimbo) return;
    const s = spec(); if (!s || !s.angry) return;
    if (!angPick || now - angPick.at > 30000) angPick = { kind: ANGS[Math.random() < .5 ? 0 : 1], at: now };
    angPick.at = now;
    const k = angPick.kind;
    if (!full(cur.sets[k], nOf(k))) { bump(cur, k); return; }
    angPlay = { kind: k, at: 0 }; play();
  }

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
    // 對話框高度、螢幕大小變了：重新對齊腳底
    window.addEventListener('resize', () => placeFeet());
    const tb = document.getElementById('talk-box');
    if (tb && typeof ResizeObserver === 'function') new ResizeObserver(() => placeFeet()).observe(tb);
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.ChatShadow = { sync, undress, shapeOf, areolaOf, motion, deform, shade, ready: (k) => !!(cur && full(cur.sets[k], nOf(k))), P: () => cur && cur.P };
})();
