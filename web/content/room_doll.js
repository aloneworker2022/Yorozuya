/* 房間魅子剪影（v4 doll）：依 girl.look 程序化生成的半透明像素剪影。
   一個小 3D 人偶（圓錐／橢球 SDF），每個像素沿房間投影（64×32 等角菱形）做 ray march，
   所以站／走／坐、各方向都出自同一個模型，逐像素深度與家具同一套 (gy+z)/32。
   純計算、不碰 DOM：主執行緒、Web Worker（見 room_character.js）、node 測試共用。
   來源：mockups/tools/doll.py＋doll3.py（v3 罩杯曲線＋乳搖）＋make_v4（不透明度 80%）。 */
(function (root) {
  'use strict';
  function factory() {
    const W = 64, H_CANVAS = 140, ANCHOR = { x: 32, y: 126 };
    const BODY_RGB = [51, 45, 64], HAIR_RGB = [31, 24, 42], HAIR_HI_RGB = [78, 66, 98];
    const LINE_RGB = [30, 24, 40], MARK_RGB = [33, 27, 45];
    const BODY_A = 204, HAIR_A = 220;
    const GIRTH = 1.1;
    const CUP_R = { A: 2.3, B: 3.1, C: 3.8, D: 4.5, E: 5.15, F: 5.7, G: 6.1, H: 6.55, I: 7.0 };
    const CUP_BOUNCE = { A: .12, B: .35, C: .55, D: .8, E: 1.05, F: 1.25, G: 1.42, H: 1.58, I: 1.75 };
    const BASE = { frame: 1, sh: 1, chest: 1, waist: 1, hip: 1, butt: 1, thigh: 1, calf: 1, arm: 1, bust: 1,
      belly: 0, soft: 0, muscle: 0, bone: 0, leg: 0, head: 1, neck: 0 };
    const BUILDS = {
      '勻稱有致': {},
      '骨感清瘦': { sh: .98, chest: .9, waist: .84, hip: .84, butt: .66, thigh: .72, calf: .78, arm: .74, bust: .8, bone: 1 },
      '纖細苗條': { sh: .95, chest: .93, waist: .86, hip: .92, butt: .86, thigh: .86, calf: .88, arm: .86, bust: .95, leg: .008 },
      '嬌小玲瓏': { frame: .88, sh: .94, waist: .94, hip: .96, thigh: .96, calf: .94, arm: .92, bust: .95, head: 1.06, leg: -.012 },
      '微肉圓潤': { sh: 1.04, chest: 1.1, waist: 1.24, hip: 1.14, butt: 1.18, thigh: 1.26, calf: 1.16, arm: 1.26, bust: 1.12, belly: 1, soft: 1 },
      '結實緊緻': { sh: 1.05, chest: 1.0, waist: .94, hip: 1.03, butt: 1.1, thigh: 1.08, calf: 1.1, arm: 1.04, muscle: .55 },
      '運動健美': { sh: 1.13, chest: 1.06, waist: .98, hip: 1.0, butt: 1.1, thigh: 1.14, calf: 1.18, arm: 1.14, bust: .95, muscle: 1 },
      '軟肉感有腰': { chest: 1.04, waist: .95, hip: 1.16, butt: 1.22, thigh: 1.2, calf: 1.06, arm: 1.12, bust: 1.08, belly: .45, soft: .7 },
      '高挑纖長': { frame: .97, sh: .98, waist: .9, hip: .95, thigh: .9, calf: .9, arm: .9, leg: .035, neck: 1.2, head: .97 },
      '豐滿火辣': { sh: 1.04, chest: 1.08, waist: .98, hip: 1.2, butt: 1.28, thigh: 1.18, calf: 1.06, arm: 1.06, bust: 1.28, soft: .3 },
      '細腰寬臀': { sh: .97, chest: .98, waist: .8, hip: 1.24, butt: 1.24, thigh: 1.14, calf: 1.0, bust: 1.0 },
      '凹凸有致的沙漏身材': { sh: 1.06, chest: 1.05, waist: .78, hip: 1.18, butt: 1.2, thigh: 1.1, bust: 1.22 },
      '極端腰臀比的漫畫比例': { sh: 1.04, chest: 1.02, waist: .64, hip: 1.34, butt: 1.38, thigh: 1.22, calf: .98, bust: 1.38, leg: .02 },
    };
    const SPRING = { soft: [2.6, .16, 1.25], normal: [3.2, .24, 1.0], firm: [4.4, .4, .6] };
    const BUILD_SPRING = { '微肉圓潤': 'soft', '軟肉感有腰': 'soft', '豐滿火辣': 'soft', '極端腰臀比的漫畫比例': 'soft',
      '運動健美': 'firm', '結實緊緻': 'firm', '骨感清瘦': 'firm' };
    const HAIRS = ['short', 'bob', 'medium', 'long', 'waist', 'pony_hi', 'pony_lo', 'bun', 'buns', 'braid', 'twin'];
    const HAIR_MAP = {
      '俏麗短髮': 'short', '俐落短鮑伯': 'bob', '及肩微捲': 'medium', '鎖骨長度的內彎髮': 'medium',
      '中分長髮': 'long', '旁分無瀏海': 'long', '空氣瀏海長髮': 'long', '大波浪捲': 'long', '齊瀏海公主切': 'long',
      '兩側編辮的長髮': 'long', '妖媚側分長捲': 'long', '及腰長直髮': 'waist', '及腰大波浪': 'waist',
      '高馬尾': 'pony_hi', '低馬尾': 'pony_lo', '丸子頭': 'bun', '隨手綁起的亂丸子': 'bun', '雙丸子頭': 'buns',
      '一條麻花辮': 'braid', '雙馬尾': 'twin',
    };
    const WALK_FRAMES = 8, WALK_FPS = 14, WALK_CYCLE_S = WALK_FRAMES / WALK_FPS;
    const DEFAULT = { height_cm: 161, build: '勻稱有致', cup: 'D', hair: 'long', skirt: '' };

    // ------------------------------------------------------------ look → doll
    function hairStyle(text) {
      const s = String(text || '').trim();
      if (!s) return DEFAULT.hair;
      if (HAIR_MAP[s]) return HAIR_MAP[s];
      if (HAIRS.includes(s)) return s;
      if (s.includes('雙馬尾')) return 'twin';
      if (s.includes('馬尾')) return s.includes('低') ? 'pony_lo' : 'pony_hi';
      if (s.includes('雙丸子')) return 'buns';
      if (s.includes('丸子') || s.includes('盤髮')) return 'bun';
      if (s.includes('辮') && !s.includes('長髮')) return 'braid';
      if (s.includes('鮑伯')) return 'bob';
      if (s.includes('腰')) return 'waist';
      if (s.includes('短')) return 'short';
      if (s.includes('肩') || s.includes('鎖骨')) return 'medium';
      return 'long';
    }
    function skirtOf(outfit) {
      const s = String(outfit || '');
      if (!s) return '';
      if (/長裙|森林系|名媛|哥德|古著/.test(s)) return 'long';
      if (/裙|洋裝|JK|制服|旗袍/i.test(s)) return 'short';
      return '';
    }
    /** look：girl.look；opts.outfit：身上那套（wornOutfit）；opts.undressStage：0~3，≥2 沒有裙子。 */
    function lookToDoll(look, opts = {}) {
      const L = look && typeof look === 'object' ? look : null;
      const hc = Number(L?.height_cm);
      const build = L && BUILDS[String(L.build || '').trim()] ? String(L.build).trim() : DEFAULT.build;
      const letter = String(L?.cup || '').trim().charAt(0).toUpperCase();
      const stage = Number(opts.undressStage) || 0;
      return {
        height_cm: Number.isFinite(hc) && hc > 0 ? Math.max(140, Math.min(185, hc)) : DEFAULT.height_cm,
        build,
        cup: CUP_R[letter] ? letter : (L ? 'D' : DEFAULT.cup),
        hair: L ? hairStyle(L.hair) : DEFAULT.hair,
        skirt: stage >= 2 ? '' : skirtOf(opts.outfit),
      };
    }
    function dollKey(d) { return [d.height_cm, d.build, d.cup, d.hair, d.skirt || '-'].join('|'); }
    function bparams(name) { return Object.assign({}, BASE, BUILDS[name] || {}); }

    // ------------------------------------------------------------ SDF primitives
    const hypot3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    function makeShape() {
      const prims = [];
      const sh = { prims, off: [0, 0, 0] };
      const push = (p) => { p.off = sh.off.slice(); prims.push(p); };
      sh.ell = (mat, c, r, clip) => push({ k: 0, mat, c, r, clip: clip || null,
        bc: c, br: Math.max(r[0], r[1], r[2]) });
      sh.cone = (mat, a, b, ra, rb, clip) => {
        const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const L2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2] || 1e-6;
        push({ k: 1, mat, a, ba, L2, ra, rb, clip: clip || null,
          bc: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], br: Math.sqrt(L2) / 2 + Math.max(ra, rb) });
      };
      sh.chain = (mat, pts, radii) => { for (let i = 0; i < pts.length - 1; i++) sh.cone(mat, pts[i], pts[i + 1], radii[i], radii[i + 1]); };
      sh.capped = (mat, c, h, rBottom, rTop, ysq, ycen) => {
        const rr = Math.max(rBottom, rTop) * Math.max(1, ysq);
        push({ k: 2, mat, c, h, rB: rBottom, rT: rTop, ysq, ycen, clip: null,
          k2x: rTop - rBottom, k2y: 2 * h, k2d: (rTop - rBottom) ** 2 + 4 * h * h,
          bc: [c[0], c[1] + ycen, c[2]], br: Math.sqrt(rr * rr + h * h) + 1 });
      };
      return sh;
    }
    function primDist(p, x, y, z) {
      x -= p.off[0]; y -= p.off[1]; z -= p.off[2];
      let d;
      if (p.k === 0) {
        const c = p.c, r = p.r, dx = x - c[0], dy = y - c[1], dz = z - c[2];
        const k0 = hypot3(dx / r[0], dy / r[1], dz / r[2]);
        const k1 = hypot3(dx / (r[0] * r[0]), dy / (r[1] * r[1]), dz / (r[2] * r[2]));
        d = k0 * (k0 - 1) / Math.max(k1, 1e-6);
      } else if (p.k === 1) {
        const a = p.a, ba = p.ba, px = x - a[0], py = y - a[1], pz = z - a[2];
        const t = clamp((px * ba[0] + py * ba[1] + pz * ba[2]) / p.L2, 0, 1);
        d = hypot3(px - ba[0] * t, py - ba[1] * t, pz - ba[2] * t) - (p.ra + (p.rb - p.ra) * t);
      } else {
        const c = p.c, yy = (y - c[1] - p.ycen) / p.ysq;
        const qx = Math.sqrt((x - c[0]) ** 2 + yy * yy), qy = z - c[2];
        const cax = qx - Math.min(qx, qy < 0 ? p.rB : p.rT), cay = Math.abs(qy) - p.h;
        const tt = clamp(((p.rT - qx) * p.k2x + (p.h - qy) * p.k2y) / p.k2d, 0, 1);
        const cbx = qx - p.rT + p.k2x * tt, cby = qy - p.h + p.k2y * tt;
        const s = (cbx < 0 && cay < 0) ? -1 : 1;
        d = s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
      }
      const cl = p.clip;
      if (cl) {
        let c = -Math.max(cl.y0 + 1 - y, z - (cl.zc + cl.bang));
        if (cl.bottom !== null) c = Math.max(c, cl.bottom - z);
        if (cl.cut !== null) c = Math.max(c, cl.cut - z);
        if (c > d) d = c;
      }
      return d;
    }
    function bodyDist(sh, x, y, z) {
      let best = 1e3;
      for (const p of sh.prims) if (p.mat === 0) { const d = primDist(p, x, y, z); if (d < best) best = d; }
      return best;
    }
    const BODY = 0, HAIR = 1, MARK = 2;

    // ------------------------------------------------------------ skeleton
    const dollH = (d) => 110 + (d.height_cm - 161) * 0.85;
    function proportions(doll) {
      const H = dollH(doll), b = bparams(doll.build);
      const head_h = (17.6 + (H - 110) * 0.07) * b.head;
      const head_top = H - 1.2, zc = head_top - head_h / 2, chin = head_top - head_h;
      const S = chin - 4.6 - b.neck;
      const C = H * (0.468 + (H - 110) * 0.0011 + b.leg);
      return { H, b, head_h, zc, chin, S, C, T: S - C, knee: C * 0.6, hipz: C + 3.4, ankle: 3.3 };
    }
    const F = (b, k) => b[k] * b.frame;
    function leg(sh, P, side, hip, knee, ankle, toe) {
      const b = P.b, wT = F(b, 'thigh'), wC = F(b, 'calf'), fr = b.frame;
      const [hx, hy, hz] = hip, [kx, ky, kz] = knee, [ax, ay, az] = ankle;
      const knee_r = b.bone ? 2.55 : 2.75 * Math.min(wT, 1.08) * fr ** .3;
      const mid = [hx + (kx - hx) * .4, hy + (ky - hy) * .4, hz + (kz - hz) * .4];
      sh.cone(BODY, hip, mid, 4.7 * wT, 4.15 * wT);
      sh.cone(BODY, mid, knee, 4.15 * wT, knee_r);
      if (b.muscle) sh.ell(BODY, [hx + (kx - hx) * .62 + side * .9, hy + (ky - hy) * .62 + 1.0, hz + (kz - hz) * .62], [2.9 * wT, 3.0 * wT, 5.5]);
      const peak = b.muscle < .8 ? .26 : .22;
      const cpos = [kx + (ax - kx) * peak + side * .25, ky + (ay - ky) * peak - .7 - .5 * b.muscle, kz + (az - kz) * peak];
      const calf_r = 3.05 * wC * (1 + .08 * b.muscle);
      sh.cone(BODY, knee, cpos, knee_r * .95, calf_r);
      sh.cone(BODY, cpos, ankle, calf_r, 1.55 * Math.min(wC, 1.1) * fr ** .5);
      const [tx, ty, tz] = toe, fl = 4.6 * fr ** .7;
      sh.cone(BODY, [ax, ay - .6, az - 1.6], [ax + tx * fl, ay + ty * fl, Math.max(0.9, az - 2.4 + tz * fl)], 1.7 * fr ** .5, 1.1);
    }
    function arm(sh, P, shoulder, elbow, wrist, hand = true) {
      const b = P.b, wA = F(b, 'arm'), fr = b.frame;
      const elbow_r = b.bone ? 1.95 : 2.1 * wA;
      sh.cone(BODY, shoulder, elbow, 2.8 * wA, elbow_r);
      if (b.muscle) sh.ell(BODY, shoulder.map((s, i) => s + (elbow[i] - s) * .4), [2.6 * wA, 2.6 * wA, 4.0]);
      sh.cone(BODY, elbow, wrist, elbow_r, 1.5 * Math.min(wA, 1.15));
      if (hand) {
        let d = [wrist[0] - elbow[0], wrist[1] - elbow[1], wrist[2] - elbow[2]];
        const n = hypot3(d[0], d[1], d[2]) || 1; d = d.map(v => v / n);
        const L = 3.8 * fr ** .7;
        sh.cone(BODY, wrist, wrist.map((w, i) => w + d[i] * L), 1.65 * fr ** .5, 1.1 * fr ** .5);
      }
    }
    function frontSurfaceY(sh, x, z) {
      for (let i = 0; i < 240; i++) {
        const y = 14 - i * .1;
        if (bodyDist(sh, x, y, z) < 0) return y;
      }
      return null;
    }
    function marks(sh, pts2, depth = .28, r = .55) {
      const pts = [];
      for (const [x, z] of pts2) { const y = frontSurfaceY(sh, x, z); if (y !== null) pts.push([x, y - r + depth, z]); }
      for (let i = 0; i + 1 < pts.length; i++) sh.cone(MARK, pts[i], pts[i + 1], r, r);
    }
    function cupRadius(P, doll) { const b = P.b; return (CUP_R[doll.cup] || 3.1) * b.bust ** .7 * b.frame ** .5; }
    function bustOuter(P, doll) { const b = P.b, r = cupRadius(P, doll); return (3.2 + r * .3) * F(b, 'chest') ** .5 + r * .95; }
    function torso(sh, P, doll, dy = 0, dz = 0, lean = 0, bounce = [0, 0, 0, 0]) {
      const b = P.b, zc = P.zc + dz, S = P.S + dz, C = P.C + dz, T = P.T;
      const yl = (z) => dy + (z - C) * lean;
      const hs = b.head, soft = b.soft;
      sh.ell(BODY, [0, yl(zc) + .3, zc], [6.9 * hs, 7.2 * hs, P.head_h / 2]);
      sh.ell(BODY, [0, yl(zc) + 2.2, zc - 6.0 * hs], [(4.6 + .8 * soft) * hs, 4.6 * hs, 3.6 * hs]);
      const neck_r = 2.7 * b.frame * (1 + .12 * soft + .06 * b.muscle);
      sh.cone(BODY, [0, yl(S) - .4, S - 1], [0, yl(zc) - .6, P.chin + dz + 2], neck_r, neck_r * .85);
      const wS = F(b, 'sh');
      sh.cone(BODY, [-8.0 * wS, yl(S) - .6, S - 1.8], [8.0 * wS, yl(S) - .6, S - 1.8], 2.9 * b.frame, 2.9 * b.frame);
      if (b.muscle) for (const s of [-1, 1]) sh.ell(BODY, [s * 9.2 * wS, yl(S) - .6, S - 4.0], [2.9 * b.muscle ** .5 + .4, 2.8, 3.6]);
      const zCh = S - .24 * T;
      sh.ell(BODY, [0, yl(zCh) - .2, zCh], [7.7 * F(b, 'chest'), 4.9 * F(b, 'chest') ** .5, .27 * T]);
      const zW = S - .6 * T;
      sh.ell(BODY, [0, yl(zW), zW], [5.9 * F(b, 'waist'), 4.3 * F(b, 'waist') ** .7, .2 * T]);
      const zP = C + .2 * T;
      sh.ell(BODY, [0, yl(zP) - .2, zP], [9.0 * F(b, 'hip'), 5.3 * F(b, 'hip') ** .6, .24 * T]);
      sh.ell(BODY, [0, yl(C + 3) - .3, C + 3.5], [5.0 * F(b, 'hip'), 3.8, 4.2]);
      if (b.belly) { const bz = zW - .32 * T; sh.ell(BODY, [0, yl(bz) + 1.6 + 1.2 * b.belly, bz], [5.4 * F(b, 'waist'), 3.6 + .6 * b.belly, 5.0]); }
      for (const s of [-1, 1]) {
        const bb = F(b, 'butt'), lift = 1.2 * b.muscle;
        sh.ell(BODY, [s * 3.7 * F(b, 'hip'), yl(C + .09 * T) - 2.7 - .4 * (bb - 1), C + .09 * T + lift], [4.5 * bb, 4.2 * bb, 4.6 * bb]);
      }
      const r = cupRadius(P, doll), [bx, by, bz, sq] = bounce, cs = F(b, 'chest') ** .5;
      const zA = S - .16 * T, zB = S - .35 * T - (r - 3.1) * .3 + bz;
      for (const s of [-1, 1]) {
        const root = [s * (2.6 + r * .22) * cs + bx * .3, yl(zA) + 2.6 * cs + r * .12 + by * .3, zA + bz * .3];
        const cx = s * (3.2 + r * .3) * cs + bx, cy = yl(zB) + 3.3 * cs + r * .5 + by;
        sh.cone(BODY, root, [cx, cy, zB], r * .45, r * .82);
        sh.ell(BODY, [cx, cy - r * .1, zB], [r * .95, r * .86, r * .86 * (1 - sq)]);
      }
      return { zc, S, C, T, zW, zB, cupr: r, yl };
    }
    function definition(sh, P, tor, xoff = 0) {
      const b = P.b, S = tor.S, zW = tor.zW;
      const lin = (a, z, n) => Array.from({ length: n }, (_, i) => a + (z - a) * i / (n - 1));
      if (b.muscle) {
        const top = tor.zB - tor.cupr - 1.2;
        marks(sh, lin(top, zW - 4.5, 6).map(z => [xoff, z]));
        if (b.muscle >= .8) for (const s of [-1, 1]) marks(sh, lin(zW + 3.5, zW - 3.5, 4).map(z => [xoff + s * 3.4 * F(b, 'waist'), z]));
      }
      if (b.bone) for (const s of [-1, 1]) marks(sh, [[xoff + s * 1.6, S - 1.6], [xoff + s * 4.0, S - 1.2], [xoff + s * 6.4, S - 1.0]], .3);
      if (b.belly || b.muscle >= .5) marks(sh, [[xoff, zW - 3.2], [xoff, zW - 3.7]], .35, .6);
    }
    function skirt(sh, P, doll, tor, sway = 0) {
      if (!doll.skirt) return;
      const b = P.b, C = tor.C, top = tor.zW + 2;
      const hem = doll.skirt === 'short' ? C - 8.5 : P.knee - 7 + (tor.C - P.C);
      const hip_r = 9.2 * F(b, 'hip'), rb = hip_r * (doll.skirt === 'short' ? 1.2 : 1.32), h = (top - hem) / 2;
      sh.capped(BODY, [sway * .3, tor.yl(C) - .6, hem + h], h, rb, 6.2 * F(b, 'waist'), .78, 0);
    }
    function hair(sh, P, doll, tor, sway = 0) {
      const zc = tor.zc, S = tor.S, yl = tor.yl, y0 = yl(zc), style = doll.hair, hh = P.head_h / 2, T = P.T;
      const bottoms = { short: zc - 4.5, bob: zc - 9.6, bun: zc - 5.5, buns: zc - 5.5, pony_hi: zc - 5.5, pony_lo: zc - 7 };
      const bottom = style in bottoms ? bottoms[style] : null;
      const cap = { y0, zc, bang: 2.4, bottom, cut: null };
      sh.ell(HAIR, [0, y0 - .6, zc + .9], [8.0, 8.3, hh + 1.1], cap);
      for (const s of [-1, 1]) sh.cone(HAIR, [s * 5.6, y0 + 3.6, zc + 3.5], [s * 6.5, y0 + 4.0, zc - 2.0], 1.9, 1.1);
      if (style === 'bob') sh.ell(HAIR, [0, y0 - 1.2, zc - 4.2], [9.0, 8.4, 5.2], { y0, zc, bang: 2.4, bottom, cut: zc - 10.0 });
      if (style === 'medium' || style === 'long' || style === 'waist') {
        const end = { medium: S - 3.5, long: S - .5 * T, waist: S - .78 * T }[style];
        const n = Math.max(3, Math.trunc((zc - end) / 2.2));
        for (let i = 0; i <= n; i++) {
          const t = i / n, z = zc + 1 - (zc + 1 - end) * t;
          const w = 8.0 - 1.4 * t + (style === 'medium' && t > .7 ? 1.2 : 0);
          const yb = yl(z) - (4.6 + 2.6 * Math.min(1, t * 1.6));
          sh.ell(HAIR, [sway * t * t, yb, z], [w, 2.4 + (1 - t) * 2.2, 2.6]);
        }
        const lockEnd = { medium: S - 1.0, long: S - .38 * T, waist: S - .62 * T }[style];
        const flare = style === 'medium' ? 2.2 : .8;
        const rr = style === 'medium' ? [1.9, 2.0, 1.0] : [2.0, 2.1, 1.9, 1.0];
        for (const s of [-1, 1]) {
          const pts = [[s * 6.2, y0 + 1.8, zc + 1], [s * (7.4 + flare * .5), y0 + 1.6, zc - 7]];
          if (style !== 'medium') pts.push([s * 7.6 + sway * .2, yl(S) + 2.8, S - 2]);
          pts.push([s * (6.9 + flare) + sway * .3, yl(lockEnd) + 3.4, lockEnd]);
          sh.chain(HAIR, pts, rr);
        }
      }
      if (style === 'pony_hi') {
        sh.ell(HAIR, [0, y0 - 8.2, zc + 2.4], [2.7, 2.6, 2.6]);
        sh.chain(HAIR, [[0, y0 - 9.6, zc + 3.0], [sway * .3, y0 - 12.6, zc + .5], [sway * .7, y0 - 12.6, zc - 7], [sway, yl(S) - 10.0, S - 9]], [2.6, 3.1, 2.4, 1.0]);
      }
      if (style === 'pony_lo') {
        sh.ell(HAIR, [0, y0 - 7.4, zc - 5.0], [2.3, 2.1, 2.1]);
        sh.chain(HAIR, [[0, y0 - 8.4, zc - 5.6], [sway * .5, yl(S) - 7.6, S - 6], [sway, yl(S) - 7.2, S - 17]], [2.4, 2.6, 1.1]);
      }
      if (style === 'twin') for (const s of [-1, 1]) {
        sh.ell(HAIR, [s * 6.4, y0 - 2.4, zc + 4.4], [2.1, 2.0, 2.1]);
        sh.chain(HAIR, [[s * 8.2, y0 - 2.6, zc + 4.2], [s * 11.2, y0 - 2.6, zc - .5], [s * 12.4 + sway * .4, y0 - 2.6, zc - 11],
          [s * 12.0 + sway * .8, y0 - 2.4, S - 14], [s * 10.8 + sway, yl(S) - 2.2, S - 24]], [2.0, 2.5, 2.1, 1.6, .7]);
      }
      if (style === 'bun') sh.ell(HAIR, [0, y0 - 5.2, zc + hh - .6], [4.0, 3.8, 3.6]);
      if (style === 'buns') for (const s of [-1, 1]) sh.ell(HAIR, [s * 6.0, y0 - 1.8, zc + hh + 1.8], [3.1, 2.9, 3.0]);
      if (style === 'braid') {
        const pts = [[-6.0, y0 - 1.5, zc - 4.5], [-6.8, yl(S) + 2.0, S + 1], [-6.2, yl(S) + 4.6, S - 5]];
        for (let i = 0; i < 6; i++) pts.push([-5.6 + i * .15, yl(S - 7 - i * 2.4) + 5.4 + i * .1, S - 7 - i * 2.4]);
        pts.forEach((p, i) => { const r = 2.3 - i * .1 + (i % 2 ? .35 : 0); sh.ell(HAIR, p, [r, r * .9, i > 1 ? 1.7 : 2.4]); });
        sh.chain(HAIR, pts.slice(0, 3), [2.4, 2.2, 2.0]);
        const tail = pts[pts.length - 1];
        sh.cone(HAIR, tail, [tail[0], tail[1] + .3, tail[2] - 3.5], 1.4, .6);
      }
    }

    // ------------------------------------------------------------ gait + bounce
    function legAngles(ph) {
      const thigh = 1.5 + 15.5 * Math.cos(ph);
      const knee = 4 + 4 * (1 - Math.cos(ph)) / 2 + 40 * Math.max(0, Math.sin(ph - Math.PI)) ** 1.4;
      return [thigh, knee];
    }
    function gait(P, phase) {
      const Lt = P.hipz - P.knee, Ls = P.knee - P.ankle, raw = {};
      let lowest = 1e9;
      for (const [s, ph] of [[-1, phase], [1, phase + Math.PI]]) {
        const [th, kn] = legAngles(ph), a = th * Math.PI / 180, k = (th - kn) * Math.PI / 180;
        const knee = [Lt * Math.sin(a), -Lt * Math.cos(a)];
        const ank = [knee[0] + Ls * Math.sin(k), knee[1] - Ls * Math.cos(k)];
        raw[s] = [knee, ank]; lowest = Math.min(lowest, ank[1]);
      }
      const hipz = P.ankle - lowest, out = { hipz };
      for (const s of [-1, 1]) {
        const [[ky, kz], [ay, az]] = raw[s], an = [0, ay, hipz + az];
        out[s] = [[0, ky, hipz + kz], an, Math.max(0, an[2] - P.ankle)];
      }
      return out;
    }
    const bounceCache = new Map();
    function bounceCurve(P, doll, samples = 96) {
      const kind = BUILD_SPRING[doll.build] || 'normal', key = `${P.H.toFixed(2)}|${doll.build}|${kind}`;
      if (bounceCache.has(key)) return bounceCache.get(key);
      const [f0, zeta, gain] = SPRING[kind], w = 2 * Math.PI * f0, dt = WALK_CYCLE_S / samples;
      const zt = Array.from({ length: samples }, (_, i) => gait(P, 2 * Math.PI * i / samples).hipz);
      const acc = zt.map((z, i) => (zt[(i + 1) % samples] - 2 * z + zt[(i - 1 + samples) % samples]) / (dt * dt));
      let y = 0, v = 0; const hist = [];
      for (let c = 0; c < 12; c++) for (let i = 0; i < samples; i++) {
        for (let j = 0; j < 8; j++) { v += (-w * w * y - 2 * zeta * w * v - acc[i]) * dt / 8; y += v * dt / 8; }
        if (c === 11) hist.push(y);
      }
      const peak = Math.max(...hist.map(Math.abs)) || 1;
      const curve = hist.map(h => h / peak * gain);
      bounceCache.set(key, curve);
      return curve;
    }
    function bounceAt(P, doll, phase, scale = 1) {
      const curve = bounceCurve(P, doll), n = curve.length;
      const f = phase / (2 * Math.PI) * n, i = Math.trunc(f) % n, t = f - Math.trunc(f);
      const yv = curve[i] * (1 - t) + curve[(i + 1) % n] * t;
      const amp = (CUP_BOUNCE[doll.cup] ?? .35) * scale, dz = yv * amp;
      return [.35 * amp * Math.sin(phase) * .6, .35 * dz, dz, Math.max(-.08, Math.min(.08, -dz * .025))];
    }

    // ------------------------------------------------------------ poses
    function build(doll, pose, frame, yaw, opts = {}) {
      const P = proportions(doll), sh = makeShape(), b = P.b;
      const hip_x = 5.1 * F(b, 'hip') * (1 + .3 * (F(b, 'thigh') - 1));
      const kx = () => 3.2 + .65 * F(b, 'thigh');
      const hip_out = Math.max(9.0 * F(b, 'hip'), hip_x + 4.7 * F(b, 'thigh'));
      const waist_out = 5.9 * F(b, 'waist');
      const bo = bustOuter(P, doll), arm_clear = () => bo * .8 + .5;
      const front = Math.cos(yaw * Math.PI / 180) > -.2;
      if (pose === 'idle') {
        const cp = 1, w = 1, o = [w * .9 * cp, 0, -.3 * cp];
        sh.off = o;
        const tor = torso(sh, P, doll);
        skirt(sh, P, doll, tor);
        for (const s of [-1, 1]) {
          const sh_j = [s * 8.3 * F(b, 'sh'), -.4, tor.S - 2.6];
          if (s === w) {
            const elbow = [s * Math.max(waist_out + 2.8 * F(b, 'arm') + 6.2, hip_out + 2.2), -1.8, tor.zW + 2.5];
            const wrist = [s * (waist_out + (hip_out - waist_out) * .45 + 1.6), .3, tor.zW - .22 * tor.T];
            arm(sh, P, sh_j, elbow, wrist, false);
            sh.ell(BODY, [wrist[0] - s * .6, wrist[1], wrist[2] - .6], [1.8, 1.6, 2.1]);
          } else {
            const elbow = [s * Math.max(waist_out + 2.8 * F(b, 'arm') + 1.6, arm_clear()), -1.0, tor.zW - 1];
            const wrist = [s * (hip_out + 1.5 * F(b, 'arm') + 1.1), .8, tor.C - 1];
            arm(sh, P, sh_j, elbow, wrist);
          }
        }
        sh.off = [0, 0, 0];
        for (const s of [-1, 1]) {
          if (s === w) leg(sh, P, s, [s * hip_x + w * .9 * cp, 0, P.hipz + .2 * cp], [s * kx() + w * .5 * cp, .4, P.knee],
            [s * 3.0 + w * .3 * cp, -.2, P.ankle], [s * .3, .95, 0]);
          else leg(sh, P, s, [s * hip_x + w * .9 * cp, 0, P.hipz - .9 * cp], [s * kx() + w * 1.6 * cp, .4 + 1.8 * cp, P.knee - .4 * cp],
            [s * 3.5 + w * .4 * cp, .6 * cp, P.ankle + .9 * cp], [s * .35, .9, -.25 * cp]);
        }
        if (front) { sh.off = o; definition(sh, P, tor); }
        sh.off = o;
        hair(sh, P, doll, tor, ({ pony_hi: 3.5, pony_lo: 2.5 }[doll.hair] || 0) * w);
        sh.off = [0, 0, 0];
        return { sh, P };
      }
      if (pose === 'walk') {
        const n = WALK_FRAMES, phase = 2 * Math.PI * (((frame % n) + n) % n) / n;
        const g = gait(P, phase), hipz = g.hipz;
        const bnc = bounceAt(P, doll, phase, opts.bounceScale ?? 1);
        const tor = torso(sh, P, doll, 0, hipz - P.hipz, .02, bnc);
        const sway = 1.2 * Math.cos(phase);
        skirt(sh, P, doll, tor, sway * .5);
        for (const s of [-1, 1]) {
          const [kn, an, lift] = g[s];
          leg(sh, P, s, [s * hip_x, 0, hipz], [s * (kx() - .2), kn[1], kn[2]], [s * 2.8, an[1], an[2]],
            [0, .96 - lift * .04, lift > 1 ? -.25 : 0]);
          const swd = 16 * Math.cos(phase) * (s === 1 ? 1 : -1);
          const sw = swd * (swd > 0 ? .35 : 1.15) * Math.PI / 180;
          const ex = Math.max(waist_out + 2.8 * F(b, 'arm') + 1.2, arm_clear());
          const sh_j = [s * 8.3 * F(b, 'sh'), -1.4, tor.S - 2.6];
          const elbow = [s * ex, -1.6 + 19 * Math.sin(sw), sh_j[2] - 19 * Math.cos(sw)];
          const wrist = [s * Math.max(hip_out + 1.5 * F(b, 'arm') + .4, ex + .5), elbow[1] + 15 * Math.sin(sw + .12), elbow[2] - 15 * Math.cos(sw + .12)];
          arm(sh, P, sh_j, elbow, wrist);
        }
        if (front) definition(sh, P, tor);
        hair(sh, P, doll, tor, -sway);
        return { sh, P };
      }
      if (pose === 'sit') {
        const seat = opts.seat ?? 35, hipz = seat + 3.8;
        const Lt = P.hipz - P.knee, Ls = P.knee - P.ankle, hip_y = -5.5;
        const tor = torso(sh, P, doll, hip_y, hipz - P.hipz, -.02);
        const kz = P.ankle + Ls, ky = hip_y + Math.sqrt(Math.max(1, Lt * Lt - (hipz - kz) ** 2));
        for (const s of [-1, 1]) {
          leg(sh, P, s, [s * hip_x, hip_y, hipz], [s * kx(), ky, kz], [s * 3.0, ky - 1.0, P.ankle], [s * .15, .98, 0]);
          const sh_j = [s * 8.3 * F(b, 'sh'), hip_y - .6, tor.S - 2.6];
          const elbow = [s * (waist_out + 2.8 * F(b, 'arm') + 1.4), hip_y + 1.5, tor.zW - 2];
          const wrist = [s * 5.0 * F(b, 'hip'), hip_y + 10.5, hipz + 4.6 * F(b, 'thigh')];
          arm(sh, P, sh_j, elbow, wrist);
        }
        if (doll.skirt) { const hip_r = 9.2 * F(b, 'hip'); sh.ell(BODY, [0, hip_y + 4.5, hipz + 2.4], [hip_r * 1.1, doll.skirt === 'short' ? 9.5 : 12.5, 3.6]); }
        if (front) definition(sh, P, tor);
        hair(sh, P, doll, tor);
        return { sh, P };
      }
      throw new Error('unknown pose ' + pose);
    }

    // ------------------------------------------------------------ render
    /** 回傳 {width,height,anchor,pixels:Uint8ClampedArray,depth:Float32Array(-Infinity=空)}。 */
    function render(doll, pose = 'idle', frame = 0, yaw = 0, opts = {}) {
      const width = W, height = H_CANVAS, ax = ANCHOR.x, ay = ANCHOR.y;
      const { sh, P } = build(doll, pose, frame, yaw, opts);
      const prims = sh.prims, np = prims.length;
      // world-space bounding spheres (primitive offsets folded in)
      const bcx = new Float64Array(np), bcy = new Float64Array(np), bcz = new Float64Array(np), brr = new Float64Array(np), pm = new Uint8Array(np);
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      for (let i = 0; i < np; i++) {
        const p = prims[i];
        bcx[i] = p.bc[0] + p.off[0]; bcy[i] = p.bc[1] + p.off[1]; bcz[i] = p.bc[2] + p.off[2]; brr[i] = p.br; pm[i] = p.mat;
        mnx = Math.min(mnx, bcx[i] - brr[i]); mxx = Math.max(mxx, bcx[i] + brr[i]);
        mny = Math.min(mny, bcy[i] - brr[i]); mxy = Math.max(mxy, bcy[i] + brr[i]);
        mnz = Math.min(mnz, bcz[i] - brr[i]); mxz = Math.max(mxz, bcz[i] + brr[i]);
      }
      const gcx = (mnx + mxx) / 2, gcy = (mny + mxy) / 2, gcz = (mnz + mxz) / 2;
      const gr = hypot3(mxx - gcx, mxy - gcy, mxz - gcz) + .5;
      const th = yaw * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), gw = GIRTH;
      const dX = -2 * s / gw, dY = 2 * c / gw, dZ = 1, dd = dX * dX + dY * dY + dZ * dZ;
      const n = width * height;
      const hit = new Uint8Array(n), mat = new Uint8Array(n), tt = new Float64Array(n).fill(-1e9);
      const STEP = .8 / Math.sqrt(5);
      const dist = [0, 0, 0];
      for (let py = 0; py < height; py++) {
        const sy = py + .5 - ay;
        for (let px = 0; px < width; px++) {
          const sx = px + .5 - ax;
          // ray: X = (sx*c - 2t*s)/gw, Y = (sx*s + 2t*c)/gw, Z = t - sy
          const ox = sx * c / gw - gcx, oy = sx * s / gw - gcy, oz = -sy - gcz;
          const bq = 2 * (ox * dX + oy * dY + oz * dZ), cq = ox * ox + oy * oy + oz * oz - gr * gr;
          const disc = bq * bq - 4 * dd * cq;
          if (disc < 0) continue;
          const sq = Math.sqrt(disc);
          let t = Math.min(40, (-bq + sq) / (2 * dd));
          const tEnd = Math.max(-45, (-bq - sq) / (2 * dd));
          const idx = py * width + px;
          for (let it = 0; it < 160 && t >= tEnd; it++) {
            const X = (sx * c - 2 * t * s) / gw, Y = (sx * s + 2 * t * c) / gw, Z = t - sy;
            dist[0] = dist[1] = dist[2] = 1e3;
            for (let i = 0; i < np; i++) {
              const m = pm[i], lb = hypot3(X - bcx[i], Y - bcy[i], Z - bcz[i]) - brr[i];
              if (lb >= dist[m]) continue;
              const d = primDist(prims[i], X, Y, Z);
              if (d < dist[m]) dist[m] = d;
            }
            const d = Math.min(dist[0], dist[1], dist[2]);
            if (d < .05) {
              hit[idx] = 1; tt[idx] = t;
              let mm = dist[1] < dist[0] + .15 ? 2 : 1;
              if (dist[2] < .05 && dist[1] > .05) mm = 3;
              mat[idx] = mm;
              break;
            }
            t -= Math.max(d, .08) * STEP;
          }
        }
      }
      // clean single-pixel specks and pinholes
      const m = new Uint8Array(n), holes = new Uint8Array(n);
      const at = (a, x, y) => (x < 0 || y < 0 || x >= width || y >= height) ? 0 : a[y * width + x];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x, n4 = at(hit, x, y - 1) + at(hit, x, y + 1) + at(hit, x - 1, y) + at(hit, x + 1, y);
        if (hit[i] && n4 > 0) m[i] = 1;
        else if (!hit[i] && n4 >= 3) { m[i] = 1; holes[i] = 1; }
      }
      const pixels = new Uint8ClampedArray(n * 4), depth = new Float32Array(n).fill(-Infinity);
      const sheenRow = ay - P.H * .55;
      const set = (i, rgb, a) => { pixels[i * 4] = rgb[0]; pixels[i * 4 + 1] = rgb[1]; pixels[i * 4 + 2] = rgb[2]; pixels[i * 4 + 3] = a; };
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!m[i]) continue;
        const isHair = mat[i] === 2, isMark = mat[i] === 3;
        if (isHair) {
          const upHair = y > 0 && m[i - width] && mat[i - width] === 2;
          set(i, !upHair && y < sheenRow ? HAIR_HI_RGB : HAIR_RGB, HAIR_A);
        } else if (isMark) set(i, MARK_RGB, BODY_A);
        else {
          const di = hit[i] ? tt[i] : -1e9;
          let near = false;
          for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]) {
            if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
            const j = ny * width + nx;
            if (m[j] && hit[j] && tt[j] > di + 4.5) { near = true; break; }
          }
          set(i, near ? LINE_RGB : BODY_RGB, BODY_A);
        }
        if (hit[i]) depth[i] = (2 * tt[i] + (tt[i] - (y + .5 - ay))) / 32;
      }
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {   // pinholes take their neighbours' depth
        const i = y * width + x;
        if (!holes[i]) continue;
        let sum = 0, cnt = 0;
        for (const j of [i - width, i + width, i - 1, i + 1]) if (j >= 0 && j < n && Number.isFinite(depth[j]) && hit[j]) { sum += depth[j]; cnt++; }
        depth[i] = cnt ? sum / cnt : 0;
      }
      return { width, height, anchor: { x: ax, y: ay }, pixels, depth };
    }
    function mirror(f) {
      const { width, height } = f, pixels = new Uint8ClampedArray(f.pixels.length), depth = new Float32Array(f.depth.length);
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const a = y * width + x, b = y * width + (width - 1 - x);
        pixels.set(f.pixels.subarray(a * 4, a * 4 + 4), b * 4); depth[b] = f.depth[a];
      }
      return { width, height, anchor: { x: width - f.anchor.x, y: f.anchor.y }, pixels, depth };
    }
    /** 房間座位朝向 → 模型 yaw（left=往 +v 左下，right=往 +u 右下）。 */
    const SEAT_YAW = { left: -45, right: 45, 'back-right': 135, 'back-left': -135 };
    return { W, H_CANVAS, ANCHOR, BODY_RGB, HAIR_RGB, HAIR_HI_RGB, LINE_RGB, MARK_RGB, BODY_A, HAIR_A, CUP_R, CUP_BOUNCE,
      BUILDS, BUILD_SPRING, SPRING, HAIRS, HAIR_MAP, WALK_FRAMES, WALK_FPS, DEFAULT, SEAT_YAW,
      lookToDoll, dollKey, hairStyle, skirtOf, proportions, cupRadius, bounceCurve, bounceAt, build, render, mirror };
  }
  const api = factory();
  api.factorySource = factory.toString();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.RoomDoll = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
