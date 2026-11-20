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
  const DROOM_URL = new URL('../droom/room_doll_chest.js?v=8', (document.currentScript && document.currentScript.src) || location.href).href;
  const N = 16, NA_OF = { shirt: 20, bra: 28, panties: 28 }, FPS = { breathe: 4, talk: 7, shirt: 10, bra: 10, panties: 10 };
  const ANIMS = ['shirt', 'bra', 'panties'];   // 脫衣動畫：undress.stage 0→1 脫 T 恤、1→2 脫胸罩、2→3 脫內褲
  const nOf = (pose) => NA_OF[pose] || N;
  const SCALE = 2, CV = { w: 84, h: 134, ax: 42, ay: 131, tMax: 40, tMin: -45 };   // 手抬起來也在框內；腳底固定在 ay
  // 坐著（美人魚坐姿，脫衣時）：腿往右收比較寬、人比較矮 → 自己的畫布（顯示時一樣撐滿高度＝坐著的她看起來比較大）
  const CV_SIT = { w: 116, h: 100, ax: 56, ay: 94, tMax: 70, tMin: -70 };   // 上面留空間給脫 T 恤時舉到頭上的手
  const cvOf = (doll) => (doll && doll._body === 'mermaid' ? CV_SIT : CV);

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

  /** 第 f 格的動作量（worker 裡也用，不能用外面的變數）。pose：breathe／talk／脫衣動畫 shirt／bra／panties；sit＝坐著（不比劃）。 */
  function motion(pose, f, n, sit) {
    const ph = 2 * Math.PI * f / n;
    const breath = (q) => { q = ((q % 1) + 1) % 1; return q < .4 ? .5 - .5 * Math.cos(Math.PI * q / .4) : .5 + .5 * Math.cos(Math.PI * (q - .4) / .6); };
    if (pose === 'shirt' || pose === 'bra' || pose === 'panties') return { ph, br: .4 * breath(f / n), tilt: 0, nod: pose === 'shirt' ? 0 : 6 * Math.sin(Math.PI * f / (n - 1)), gest: 0, anim: { kind: pose, u: f / (n - 1) } };
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
    const headX = tilt || nod ? H.about(H.mulR(H.rotY(tilt), H.rotX(-nod)), [o[0], o[1], S - 1 + o[2] + hl]) : null;
    // 兩隻手：肩、手肘、手腕（零件 a 點，從上往下排）；armX[side]＝{up, fore, upper}
    const LIFT = { armL: .9, armR: .5 };
    const armX = {};
    const lerp = (a, c, k) => a.map((v, i) => v + (c[i] - v) * k);
    const armPts = (part) => {
      const arm = sh.prims.filter(p => p.part === part && p.a && !p.cloth);
      if (arm.length < 2) return null;
      const lz = lift * LIFT[part], pt = (p) => [p.a[0] + p.off[0], p.a[1] + p.off[1], p.a[2] + p.off[2] + lz];
      const sp = pt(arm[0]), ep = pt(arm[1]), w0 = arm[2] ? pt(arm[2]) : [ep[0], ep[1], ep[2] - 10];
      return { arm, sp, ep, w0 };
    };
    /** 兩節手臂 IK：手腕要到 T（到不了就伸直往那邊）；手肘往 pole 那邊彎。回傳 {up, fore, upper}。 */
    const ikArm = (part, T, pole) => {
      const A = armPts(part); if (!A) return null;
      const { arm, sp, ep, w0 } = A, sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]], len = (v) => Math.hypot(v[0], v[1], v[2]);
      const l1 = len(sub(ep, sp)), l2 = len(sub(w0, ep));
      const D = sub(T, sp), d = Math.max(Math.abs(l1 - l2) + .1, Math.min(l1 + l2 - .05, len(D))), dir = nrm(D);
      const Tc = [sp[0] + dir[0] * d, sp[1] + dir[1] * d, sp[2] + dir[2] * d];
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const pd = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2], n = nrm([pole[0] - dir[0] * pd, pole[1] - dir[1] * pd, pole[2] - dir[2] * pd]);
      const elbow = [sp[0] + dir[0] * a + n[0] * h, sp[1] + dir[1] * a + n[1] * h, sp[2] + dir[2] * a + n[2] * h];
      const up = H.about(rotTo(sub(ep, sp), sub(elbow, sp), 1), sp), w1 = app(up, w0);
      return { up, fore: H.compose(H.about(rotTo(sub(w1, elbow), sub(Tc, elbow), 1), elbow), up), upper: arm[0] };
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
        const G = sh.prims.filter(p => p.cloth && p.under && (p.cloth === 1 || p.cloth === 2));
        if (G.length && u <= .84) {
          const Q = G.map(W), qc = mean(Q), zBand = Math.min(...Q.map(q => q[2])), yBack = Math.min(...Q.map(q => q[1]));
          const clasp = (sd) => [sd * 2.2, yBack - 1.2, zBand + 1.4];
          const hands = {};
          for (const [part, sd] of [['armL', -1], ['armR', 1]]) if (A[part]) {
            const r = rest(part), c = clasp(sd), wig = add(c, [sd * -.8, 0, .3]);
            hands[part] = part === 'armL'
              ? key([[0, r], [.2, c], [.25, wig], [.3, c], [.48, r]])
              : key([[0, r], [.2, c], [.25, wig], [.3, c], [.44, add(lap, [3, 2, 4])], [.56, add(lap, [0, 1, 1.4])], [.64, add(lap, [0, 1, 1.4])], [.72, [10, lap[1] + 3, S - 14]], [.84, throwHand], [1, r]]);
          }
          const grab = hands.armR || lap;
          garPlan = { hands, place: (q) => {
            if (u < .3) return null;   // 還沒解開：照身體動
            const land = add(lap, [(q[0] - qc[0]) * 1.1, (q[1] - qc[1]) * .45, (q[2] - qc[2]) * .18]);   // 掉在大腿上：攤開、壓扁（軟的）
            if (u < .5) { const k = ((u - .3) / .2) ** 2; return lerp(q, land, k); }   // 往下掉（越掉越快）
            if (u < .64) return land;
            const held = add(grab, [(q[0] - qc[0]) * .3, (q[1] - qc[1]) * .3, (q[2] - qc[2]) * .3 - 1.2]);   // 抓在手裡：揉成一團
            if (u < .72) return lerp(land, held, sm((u - .64) / .04));
            return lerp(held, add(toss, sub(q, qc).map(v => v * .3)), sm((u - .74) / .1) ** 1.6);   // 甩出去
          } };
        } else if (u > .84) garPlan = { hands: { armR: A.armR ? key([[.84, throwHand], [1, rest('armR')]]) : null }, place: () => [0, 0, 1000] };
      } else {
        const G = sh.prims.filter(p => p.cloth && p.under && p.pk);
        if (G.length && u <= .84) {
          const by = (pk, sd) => G.filter(p => p.pk === pk && (sd == null || p.pside === sd)).map(W);
          const bow = { [-1]: mean(by('bow', -1).length ? by('bow', -1) : [[-8, 0, C + 8]]), [1]: mean(by('bow', 1).length ? by('bow', 1) : [[8, 0, C + 8]]) };
          const fr = by('front'), ftop = Math.max(...fr.map(q => q[2])), grab0 = [0, Math.max(...fr.filter(q => q[2] > ftop - 1.5).map(q => q[1])) + 1.2, ftop - .4];
          const lift = [8, grab0[1] + 6, grab0[2] + 9];
          const hands = {};
          for (const [part, sd] of [['armL', -1], ['armR', 1]]) if (A[part]) {
            const r = rest(part), b = add(bow[sd], [sd * 1.2, 1, .2]), pull = add(bow[sd], [sd * 3.6, 1.4, 2.6]);
            hands[part] = part === 'armL'
              ? key([[0, r], [.2, b], [.3, pull], [.44, r]])
              : key([[0, r], [.2, b], [.3, pull], [.42, grab0], [.46, grab0], [.66, lift], [.78, throwHand], [1, r]]);
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
            if (u < .7) return lerp(out, held, k);
            return lerp(held, add(toss, sub(q, grab0).map(v => v * .25)), sm((u - .7) / .14) ** 1.6);   // 丟到一旁
          } };
          var grab = hands.armR || grab0;
        } else if (u > .84) garPlan = { hands: { armR: A.armR ? key([[.84, throwHand], [1, rest('armR')]]) : null }, place: () => [0, 0, 1000] };
      }
    }
    for (const part of ['armL', 'armR']) {
      if (garPlan) {   // 脫胸罩／內褲：手腕照步驟走（IK）
        const sd = part === 'armL' ? -1 : 1, T = garPlan.hands[part];
        if (T) { const X = ikArm(part, T, anim.kind === 'bra' && anim.u < .48 ? [sd, -.4, .1] : [sd, .35, -.55]); if (X) armX[part] = X; }
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
    const armAct = (part, isUpper) => { const X = armX[part]; return [0, 0, lift * LIFT[part], X ? (isUpper ? X.up : X.fore) : null]; };
    /** 一個身體零件這格怎麼動：[dx, dy, dz, 轉動或 null]。 */
    const act = (p, q) => {
      const part = p.part;
      if (part === 'head' || p.mat === 1) return [0, 0, hl, headX];
      if (part === 'armL' || part === 'armR') return armAct(part, armX[part] ? p === armX[part].upper : false);
      if (part === 'legs') return null;
      const d = field(q); d.push(null); return d;
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
    const key = JSON.stringify(doll), body = doll._body || 'idle';   // _body：站著 idle／脫衣時坐著 mermaid
    if (cache.key !== key) { cache.key = key; cache.base = F.build(doll, body, 0, 0, {}); }
    const base = cache.base;
    const shape = () => ({ P: base.P, sh: Object.assign({}, base.sh, { prims: base.sh.prims.map(p => Object.assign({}, p)), areolaStamps: (base.sh.areolaStamps || []).map(q => Object.assign({}, q)) }) });
    const m = motion(pose, f, n, body === 'mermaid');
    // 分三次畫：只有身體 → 身體＋內衣（胸罩、丁字褲）→ 身體＋外衣（T 恤），再一層層疊灰色上去
    // 先用全部零件變形（脫 T 恤時手要照 T 恤的下襬走——只畫身體那一層也要看得到 T 恤），再篩這一層要畫的
    const run = (keep) => F.render(doll, body, 0, 0, { scale, cv, shape, deform: (sh, P, H) => { deform(sh, P, H, m); sh.prims = sh.prims.filter(keep); } });
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
onmessage=(e)=>{const j=e.data;try{const r=drawFrame(F,cache,j.doll,j.pose,j.f,j.n,${SCALE},j.cv);postMessage({id:j.id,w:r.width,h:r.height,px:r.pixels},[r.pixels.buffer]);}catch(err){postMessage({id:j.id,err:String(err)});}};`;
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
      return new Promise((res) => { waiters.set(id, res); worker.postMessage({ id, doll, pose, f, n: nOf(pose), cv: cvOf(doll) }); });
    }
    const r = drawFrame(F, mainCache, doll, pose, f, nOf(pose), SCALE, cvOf(doll));
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
    // 脫衣對話中（使用者）：美人魚坐姿；脫衣進度釘在 pinStage，脫衣動畫播完才換到下一階
    const undressing = pinStage != null;
    const st = Math.max(0, Math.min(3, Number(undressing ? pinStage : s.undressStage) || 0));
    doll.skirt = '';
    if (undressing) doll._body = 'mermaid';
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
      todo.push(['breathe', 0]);
      for (let f = 1; f < N; f++) todo.push(['breathe', f]);
      for (let f = 0; f < N; f++) todo.push(['talk', f]);
    }
    (async () => {
      for (const [pose, f] of todo) {
        if (job.dead) return;
        const r = await renderFrame(doll, pose, f);
        if (job.dead) return;
        if (r.err) { console.warn('chat_shadow', r.err); return; }
        job.sets[pose][f] = new ImageData(new Uint8ClampedArray(r.px), r.w, r.h);
        if (isReady(job) && !job.sentReady) { job.sentReady = true; sync(); }
      }
    })();
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
    const box = document.getElementById('talk-box'), T = box ? box.getBoundingClientRect().top : 0;
    if (sheet.classList.contains('undress-chat') && !sheet.hidden && T > 0) {
      img.style.bottom = (window.innerHeight - T + 2) + 'px';
      img.style.height = Math.max(120, Math.min(720, T - 2 - 12)) + 'px';
      img.style.maxHeight = 'none';
    } else if (img.style.bottom) { img.style.bottom = ''; img.style.height = ''; img.style.maxHeight = ''; }
  }
  /** 量對話框上緣，把黑影往上／下移到腳底剛好在對話框上面 2 px（畫布縮放會跟著高度變，量三次收斂）。 */
  function placeFeet() {
    placePortrait();
    if (!wrap || wrap.hidden || canvas._feet == null) return;
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
  }

  // ---------------------------------------------------------------- 脫衣（使用者：按下脫衣、她脫了 → 黑影表演脫衣動畫）
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
        const i = Math.floor((t - animPlay.t0) / 1000 * FPS[animPlay.kind]);
        if (i >= nOf(animPlay.kind)) { const to = animPlay.to; animPlay = null; pinStage = to; sync(); }   // 播完：黑影淡出回到立繪，開始預載下一件
        else if (canvas.dataset.f !== animPlay.kind + i) draw(set[i], animPlay.kind + i);
      }
      raf = requestAnimationFrame(tick);
      return;
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
  let portraitMode = false, wasOpen = false, fadeT = 0;
  function sync() {
    const sheet = document.getElementById('portrait-sheet');
    if (!ensureEl()) return;
    const open = !!(sheet && !sheet.hidden);
    if (open && !wasOpen) portraitMode = false;
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
    // 對話框高度、螢幕大小變了：重新對齊腳底
    window.addEventListener('resize', () => placeFeet());
    const tb = document.getElementById('talk-box');
    if (tb && typeof ResizeObserver === 'function') new ResizeObserver(() => placeFeet()).observe(tb);
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.ChatShadow = { sync, undress, shapeOf, areolaOf, motion, deform, shade };
})();
