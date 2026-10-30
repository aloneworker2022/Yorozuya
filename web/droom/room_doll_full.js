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
    // 2026-10-13：乳房弧線（疊在身體前面時描一條淺色線，不然黑影疊黑影看不出胸型）
    const BUST_RGB = [134, 112, 152], BUST_DEPTH = 1.0;
    const AREOLA_RGB = [150, 100, 128], NIP_RGB = [205, 150, 175], AREOLA_R = { small: 1.15, medium: 1.75, large: 2.5, huge: 3.6 };
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
      const belly = Math.round(clamp(Number(opts.belly) || 0, 0, 1) * 5) / 5;   // 懷孕肚子 0～1（5 段，快取用）
      const out = {
        height_cm: Number.isFinite(hc) && hc > 0 ? Math.max(140, Math.min(185, hc)) : DEFAULT.height_cm,
        build,
        cup: CUP_R[letter] ? letter : (L ? 'D' : DEFAULT.cup),
        hair: L ? hairStyle(L.hair) : DEFAULT.hair,
        skirt: stage >= 2 ? '' : skirtOf(opts.outfit),
      };
      if (belly > 0) out.belly = belly;
      return out;
    }
    function dollKey(d) { return [d.height_cm, d.build, d.cup, d.hair, d.skirt || '-'].concat(d.belly ? [d.belly] : []).join('|'); }
    function bparams(name) { return Object.assign({}, BASE, BUILDS[name] || {}); }

    // ------------------------------------------------------------ SDF primitives
    const hypot3 = (x, y, z) => Math.sqrt(x * x + y * y + z * z);
    const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
    function makeShape() {
      const prims = [];
      // xf：整組零件的剛體變換（world = R·local + t），躺／趴／側睡用；floor：把地板以下切掉。
      const sh = { prims, off: [0, 0, 0], xf: null, floor: false };
      const push = (p) => { p.off = sh.off.slice(); p.xf = sh.xf; p.floor = sh.floor; p.bust = !!sh.bust; p.nip = sh.nip || 0; p.cloth = sh.cloth || 0; p.flat = !!sh.flat; prims.push(p); };
      sh.ell = (mat, c, r, clip) => push({ k: 0, mat, c, r, clip: clip || null,
        bc: c, br: Math.max(r[0], r[1], r[2]) });
      sh.cone = (mat, a, b, ra, rb, clip) => {
        const ba = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const L2 = ba[0] * ba[0] + ba[1] * ba[1] + ba[2] * ba[2] || 1e-6;
        push({ k: 1, mat, a, ba, L2, ra, rb, clip: clip || null,
          bc: [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2], br: Math.sqrt(L2) / 2 + Math.max(ra, rb) });
      };
      // 2026-10-15：側臉輪廓——(y,z) 多邊形沿 x 擠出 ±hw、邊角圓 rr（偷看的側臉用，照使用者手稿）
      sh.prism = (mat, poly, hw, rr = .6) => {
        let cy = 0, cz = 0; for (const q of poly) { cy += q[0] / poly.length; cz += q[1] / poly.length; }
        let br = 0; for (const q of poly) br = Math.max(br, Math.hypot(q[0] - cy, q[1] - cz));
        push({ k: 3, mat, poly, hw, rr, clip: null, bc: [0, cy, cz], br: Math.hypot(br, hw) + rr });
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
      const fz = z;
      if (p.xf) {
        const R = p.xf.R, t = p.xf.t, dx = x - t[0], dy = y - t[1], dz = z - t[2];
        x = R[0] * dx + R[3] * dy + R[6] * dz; y = R[1] * dx + R[4] * dy + R[7] * dz; z = R[2] * dx + R[5] * dy + R[8] * dz;
      }
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
      } else if (p.k === 3) {
        const v = p.poly, N = v.length;
        let dd = (y - v[0][0]) ** 2 + (z - v[0][1]) ** 2, sg = 1;
        for (let a = 0, b = N - 1; a < N; b = a++) {
          const ey = v[b][0] - v[a][0], ez = v[b][1] - v[a][1], wy = y - v[a][0], wz = z - v[a][1];
          const t = clamp((wy * ey + wz * ez) / (ey * ey + ez * ez || 1e-9), 0, 1), by = wy - ey * t, bz = wz - ez * t;
          dd = Math.min(dd, by * by + bz * bz);
          const c1 = z >= v[a][1], c2 = z < v[b][1], c3 = ey * wz > ez * wy;
          if ((c1 && c2 && c3) || (!c1 && !c2 && !c3)) sg = -sg;
        }
        const d2 = sg * Math.sqrt(dd), dx = Math.abs(x) - p.hw;
        d = Math.hypot(Math.max(d2, 0), Math.max(dx, 0)) + Math.min(Math.max(d2, dx), 0) - p.rr;
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
      if (p.pl) { const n = p.pl.n, c = p.pl.o - (x * n[0] + y * n[1] + z * n[2]); if (c > d) d = c; }   // 2026-10-30 pt24u：平面切（巨大乳暈殼）
      if (p.floor && -fz > d) d = -fz;
      return d;
    }
    // rigid transforms {R(row-major 3×3), t}
    function rotX(deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; }
    function rotZ(deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; }
    function rotY(deg) { const a = deg * Math.PI / 180, c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; }
    function mulR(A, B) {
      const o = new Array(9);
      for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * B[j] + A[i * 3 + 1] * B[3 + j] + A[i * 3 + 2] * B[6 + j];
      return o;
    }
    const mulV = (R, v) => [R[0] * v[0] + R[1] * v[1] + R[2] * v[2], R[3] * v[0] + R[4] * v[1] + R[5] * v[2], R[6] * v[0] + R[7] * v[1] + R[8] * v[2]];
    function compose(A, B) { const bt = mulV(A.R, B.t); return { R: mulR(A.R, B.R), t: [bt[0] + A.t[0], bt[1] + A.t[1], bt[2] + A.t[2]] }; }
    function about(R, pivot) { const rp = mulV(R, pivot); return { R, t: [pivot[0] - rp[0], pivot[1] - rp[1], pivot[2] - rp[2]] }; }
    /** 兩節骨 IK：從 A 到 B，長度 l1／l2，膝／肘往 pole 方向彎。 */
    function ik(A, B, l1, l2, pole) {
      const D = [B[0] - A[0], B[1] - A[1], B[2] - A[2]], d = hypot3(D[0], D[1], D[2]) || 1e-6, u = D.map(v => v / d);
      if (d >= l1 + l2 - 1e-3) return A.map((a, i) => a + u[i] * d * l1 / (l1 + l2));
      const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
      const pu = pole[0] * u[0] + pole[1] * u[1] + pole[2] * u[2];
      let v = [pole[0] - pu * u[0], pole[1] - pu * u[1], pole[2] - pu * u[2]];
      const n = hypot3(v[0], v[1], v[2]) || 1; v = v.map(x => x / n);
      return A.map((x, i) => x + a * u[i] + h * v[i]);
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
    function r0(P, doll) { return cupRadius(P, doll); }
    function cupRadius(P, doll) { const b = P.b; return (CUP_R[doll.cup] || 3.1) * b.bust ** .7 * b.frame ** .5; }
    function bustOuter(P, doll) { const b = P.b, r = cupRadius(P, doll); return (3.2 + r * .3) * F(b, 'chest') ** .5 + r * .95; }
    function headPart(sh, P, yl, zc) {
      const hs = P.b.head, soft = P.b.soft;
      sh.ell(BODY, [0, yl(zc) + .3, zc], [6.9 * hs, 7.2 * hs, P.head_h / 2]);
      sh.ell(BODY, [0, yl(zc) + 2.2, zc - 6.0 * hs], [(4.6 + .8 * soft) * hs, 4.6 * hs, 3.6 * hs]);
    }
    /** 側面頭（偷看，2026-10-15 v3，照使用者手稿）：只有輪廓、不畫五官。
     * 頭骨（橢圓）＋臉的側面輪廓（多邊形擠出）：額頭→眉→鼻樑凹→尖鼻子往前突→鼻下往內凹→上唇；
     * 下顎另一塊多邊形，繞耳下的轉軸張開，兩塊中間的缺口＝張開的嘴；下巴往下掉、下顎線斜回耳下。
     * 輪廓座標：(y 往臉前方, z 往上)，相對 (y0, zc)，以頭高 20 為準縮放。ex：{ mouth 0～1 }。 */
    const FACE_UP = [[0, 3.4], [6.5, 3.4], [7.0, 1.4], [6.5, -.4], [6.9, -1.6], [9.3, -3.9], [7.7, -4.3], [6.8, -4.6], [7.2, -5.6], [6.5, -6.1], [2.6, -6.0], [0, -4.2]];
    const FACE_JAW = [[2.6, -6.0], [6.3, -6.2], [6.8, -7.0], [6.1, -7.9], [6.5, -9.0], [5.4, -10.0], [1.6, -8.4], [-.6, -4.8]];
    const FACE_HINGE = [.4, -3.8];
    function sideHead(sh, P, yl, zc, ex = {}) {
      const hs = P.b.head, hh = P.head_h / 2, k = hh / 10, y0 = yl(zc) + .3, mouth = ex.mouth ?? .5;
      sh.flat = true;   // 整顆頭不打光、塗同一色：臉跟下巴之間不會出現接縫（使用者：臉應該是平的）
      sh.ell(BODY, [0, y0 - .6, zc + 1.8], [6.9 * hs, 7.0 * hs, hh - 1.6]);                     // 頭骨（後腦）
      const th = -(4 + 26 * mouth) * Math.PI / 180, c = Math.cos(th), sn = Math.sin(th);
      const at = (q) => [y0 + q[0] * k, zc + q[1] * k];
      const rot = (q) => { const dy = q[0] - FACE_HINGE[0], dz = q[1] - FACE_HINGE[1]; return [FACE_HINGE[0] + dy * c - dz * sn, FACE_HINGE[1] + dy * sn + dz * c]; };
      sh.prism(BODY, FACE_UP.map(at), 4.6 * hs, .7);
      sh.prism(BODY, FACE_JAW.map(q => at(rot(q))), 4.6 * hs, .7);
      sh.flat = false;
    }
    function torso(sh, P, doll, dy = 0, dz = 0, lean = 0, bounce = [0, 0, 0, 0], noHead = false, jig = null) {
      const b = P.b, zc = P.zc + dz, S = P.S + dz, C = P.C + dz, T = P.T;
      const yl = (z) => dy + (z - C) * lean;
      const soft = b.soft;
      if (!noHead) headPart(sh, P, yl, zc);
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
      if (doll.belly > 0) {   // 懷孕（2026-10-10）：第 3 天起肚子往前圓起來，第 10 天最大
        const e = doll.belly, pz = zW - .3 * T - 1.2 * e;
        sh.ell(BODY, [0, yl(pz) + 1.4 + 6.2 * e, pz], [(5.6 + 2.6 * e) * F(b, 'waist') ** .5, 3.2 + 5.6 * e, 5.4 + 3.4 * e]);
      }
      if (b.belly) { const bz = zW - .32 * T; sh.ell(BODY, [0, yl(bz) + 1.6 + 1.2 * b.belly, bz], [5.4 * F(b, 'waist'), 3.6 + .6 * b.belly, 5.0]); }
      for (const s of [-1, 1]) {
        const bb = F(b, 'butt'), lift = 1.2 * b.muscle, q = jig ? jig.sq : 0;
        // jig（偷看，2026-10-15）：被撞時臀肉往撞的方向推、前後壓扁、上下左右鼓出，再彈回來晃
        const [jx, jy, jz] = jig ? jig.d : [0, 0, 0];
        sh.ell(BODY, [s * 3.7 * F(b, 'hip') + jx, yl(C + .09 * T) - 2.7 - .4 * (bb - 1) + jy, C + .09 * T + lift + jz],
          [4.5 * bb * (1 + .45 * q), 4.2 * bb * (1 - q), 4.6 * bb * (1 + .35 * q)]);
      }
      if (jig && jig.thigh) for (const s of [-1, 1]) {
        const q = jig.sq;   // 大腿根的肉跟著晃（晚一點、小一點）
        const [tx, ty, tz] = jig.thigh;
        sh.ell(BODY, [s * 4.6 * F(b, 'hip') + tx, yl(C - 2) - 1.2 + ty, C - 2.5 + tz], [3.9 * F(b, 'thigh'), 3.9 * F(b, 'thigh') * (1 - .6 * q), 3.6]);
      }
      const AR = (AREOLA_R[doll.areola] || 1.5) * (.35 + r0(P, doll) * .16)   /* 2026-10-29 pt11u：乳暈隨乳房大小放大（A≈0.72× → H≈1.4×） */, nipAt = (q, fwd = [0, 1, 0], bod = null) => { if (doll.nipples === false) return; sh.nip = 1;
        if (doll.areola === 'huge' && bod) {   // 2026-10-30 pt24u：巨大乳暈＝貼著乳房曲面的殼，蓋住朝前約半個乳房（球面 60° 帽）
          const fl = Math.hypot(...fwd), n = fwd.map(v => v / fl), rf = Math.hypot(bod.r[0] * n[0], bod.r[1] * n[1], bod.r[2] * n[2]);
          sh.ell(BODY, bod.c, bod.r.map(v => v * 1.03 + .12));
          sh.prims[sh.prims.length - 1].pl = { n, o: n[0] * q[0] + n[1] * q[1] + n[2] * q[2] - rf * .62 };
        } else sh.ell(BODY, [q[0] + fwd[0] * .1, q[1] + fwd[1] * .3, q[2] + fwd[2] * .3], [AR, .45, AR * (fwd[2] ? .8 : 1)]); sh.nip = 2; sh.ell(BODY, [q[0] + fwd[0] * .55, q[1] + fwd[1] * .55, q[2] + fwd[2] * .55], [.6, .6, .6]); sh.nip = 0; };
      const SHP = doll.shape || 'round', r = cupRadius(P, doll), [bx, by, bz, sq, sy = 0, hang = 0, sw = null] = bounce, cs = F(b, 'chest') ** .5;
      const zA = S - .16 * T, zB = S - .35 * T - (r - 3.1) * .3 + bz;
      sh.bust = true;   // 2026-10-13：乳房零件另外標記，render 才描得出跟身體重疊時的弧線
      for (const s of [-1, 1]) {
        const root = [s * (2.6 + r * .22) * cs + bx * .3, yl(zA) + 2.6 * cs + r * .12 + by * .3, zA + bz * .3];
        const cx = s * (3.2 + r * .3) * cs + bx, cy = yl(zB) + 3.3 * cs + r * .5 + by;
        if (SHP === 'bell' && hang <= .05) {
          // 鐘型（v8, front-view patch）：上緣窄、細細從胸口長出；下半部寬而飽滿、重心偏低（像鐘）。z 是高度（往下＝減 z）
          const top = [s * (2.9 + r * .2) * cs, yl(zA) + 2.2 * cs, zA - r * .1];
          const bot = [s * (3.3 + r * .4) * cs + bx, yl(zB) + 3.3 * cs + r * .55 + by, zB - r * .55];
          sh.cone(BODY, top, bot, r * .3, r * .95);
          sh.ell(BODY, bot, [r * 1.12, r * .9, r * .82]);
          nipAt([bot[0], bot[1] + r * .97, bot[2] - r * .05], [0, 1, 0], { c: bot, r: [r * 1.12, r * .9, r * .82] });
        } else if (SHP === 'pendulous' && hang <= .05) {
          // 下垂（v8）：根部在胸口高處，乳肉沿重力往下（−z）長長掛下來，最低點遠低於乳房下緣，底部像袋子最飽滿、乳頭朝下
          const L = r * 1.9 + 1.5;
          const top = [s * (2.9 + r * .22) * cs, yl(zA) + 2.0 * cs + r * .25, zA];
          const mid = [s * (3.2 + r * .3) * cs, yl(zA) + 2.4 * cs + r * .55, zA - L * .55];
          const bot = [s * (3.4 + r * .32) * cs + bx, yl(zA) + 2.4 * cs + r * .6 + by, zA - L + bz];   // 2026-10-29：形狀回復 v8 下垂（pt11u 上胸變扁版被退回）；保留 bz 讓走路晃動吃得到
          sh.cone(BODY, top, mid, r * .5, r * .78);
          sh.cone(BODY, mid, bot, r * .78, r * .9);
          sh.ell(BODY, [bot[0], bot[1], bot[2] + r * .1], [r * .98, r * .8, r * .85]);
          nipAt([bot[0], bot[1] + r * .95, bot[2] - r * .15], [0, .8, -.6], { c: [bot[0], bot[1], bot[2] + r * .1], r: [r * .98, r * .8, r * .85] });
        } else if (SHP === 'round' && hang <= .05) {
          // 圓形：上下一樣飽滿的球
          sh.cone(BODY, root, [cx, cy, zB + r * .15], r * .55, r * .8);
          sh.ell(BODY, [cx, cy - r * .1, zB + r * .15], [r * .95, r * .92, r * .95]);
          nipAt([cx, cy - r * .1 + r * .92, zB + r * .1], [0, 1, 0], { c: [cx, cy - r * .1, zB + r * .15], r: [r * .95, r * .92, r * .95] });
        } else
        if (hang > .05) {
          // v5 高斯垂吊：胸口根部最寬（＝乳房寬），沿重力方向平滑收窄，到乳頭微尖。寬度(t)＝Rb·exp(−k t²)。
          // 罩杯越大、肉越軟 → 垂得越長；甩動（bx／bz）只移動尖端，根部固定在胸口（鐘擺）。
          const h = hang, Rb = r * 1.0, L = r * (1.15 + .4 * b.soft) * (.55 + .45 * h) + .6, k = .8, N = 6;   // 2026-10-15：短一點、飽滿的水滴形（原本細長像圓錐）
          // v6：根部往上移到靠肩那端（站姿乳根 zA＝S−.16T 附近），跟其他姿勢的附著點一致
          const zR = S - .2 * T - r * .12;
          // v7：根部釘在胸口不動；甩動沿垂吊軸越往尖端越大 disp(t)＝t^1.5，尖端再多晚一點（混上一格的位移）→ 甩成弧、像鞭梢
          const base = [s * (3.2 + r * .3) * cs, yl(zR) + 3.3 * cs + r * .1, zR];
          const [cx1, cz1, px1, pz1] = sw || [0, 0, 0, 0];
          const at = (t) => { const w = t ** 1.5, lg = .4 * t; return [base[0] + w * (cx1 * (1 - lg) + px1 * lg), base[1] + L * t, base[2] + w * (cz1 * (1 - lg) + pz1 * lg)]; };
          for (let q = 0; q < N; q++) {
            const t0 = q / N, t1 = (q + 1) / N;
            sh.cone(BODY, at(t0), at(t1), Rb * Math.exp(-k * t0 * t0) * (q ? 1 : 1), Rb * Math.exp(-k * t1 * t1));
          }
          const tp = at(1), rt = Rb * Math.exp(-k) * .55;
          sh.cone(BODY, tp, [tp[0], tp[1] + rt * 1.2, tp[2]], Rb * Math.exp(-k), rt * .45);   // 微尖的乳頭端
        } else {
          sh.cone(BODY, root, [cx, cy, zB], r * .45, r * .82);
          sh.ell(BODY, [cx, cy - r * .1 - r * sy * .3, zB], [r * .95 * (1 + sy * .35), r * .86 * (1 - sy), r * .86 * (1 - sq)]);
        }
      }
      sh.bust = false;
      return { zc, S, C, T, zW, zB, cupr: r, yl };
    }
    // 2026-10-30 pt28u：第一套衣服「餐巾白布」——一塊薄白布從脖子／鎖骨垂下，順著胸型繃過乳尖再直直落下，蓋住胸部。
    // 做法：每條直條（x）沿 z 由上往下找身體最前緣，布只會往前不會往回貼（掛在乳尖上再垂直落下）。tag cloth＝1。
    // 2026-10-30 pt29u：加金色頸鍊（布不會掉）、下緣邊框、兩個下垂角＋配重（bell 鈴鐺／jade 玉石）。
    // sheet 只是「部位標記色」：布 CLOTH_RGB/LO、邊框 TRIM_RGB、鍊 CHAIN_RGB、配重 WEIGHT_RGB；真正配色由前端依配色方案上色。
    const CLOTHES = ['napkin_bell', 'napkin_jade'];
    const CLOTH_RGB = [250, 250, 252], CLOTH_LO_RGB = [214, 216, 228], CLOTH_A = 236;
    const TRIM_RGB = [255, 0, 0], CHAIN_RGB = [0, 255, 0], WEIGHT_RGB = [0, 0, 255], WEIGHT_LO_RGB = [0, 0, 160];
    function napkin(sh, P, doll, tor, weight) {
      const S = tor.S, r = tor.cupr, bo = bustOuter(P, doll), hw = Math.min(bo * .92, 8.3 * F(P.b, 'sh') - 2.2) + .6;
      const top = S - .6, bot = tor.zB - r - 4.2 - .25 * r;
      const nx = Math.max(6, Math.round(hw * 2 / 1.1)), nz = Math.max(6, Math.round((top - bot) / 2.0));
      const X = [], Z = [], C = [];   // C[i][j]＝第 i 條、第 j 段的布面前緣 y（往下只會更前，不貼回去）
      for (let j = 0; j <= nz; j++) Z.push(top - (top - bot) * j / nz);
      for (let i = 0; i <= nx; i++) {
        const x = -hw + 2 * hw * i / nx; X.push(x); let yMax = -1e3; const col = [];
        for (let j = 0; j <= nz; j++) {
          let ys = null; for (let k = 0; k < 300; k++) { const y = 24 - k * .1; if (bodyDist(sh, x, y, Z[j]) < 0) { ys = y; break; } }
          if (ys !== null) yMax = Math.max(yMax, ys); col.push(yMax);
        }
        C.push(col);
      }
      sh.cloth = 1;
      const BOT = [];   // 每條直條最下面一點（邊框／配重用）
      for (let i = 0; i <= nx; i++) {   // 乳溝處布橫跨兩邊乳尖繃著，不陷進去
        const pts = [], edge = Math.abs(X[i]) / hw;
        for (let j = 0; j <= nz; j++) {
          let L = -1e3, R = -1e3; for (let q = 0; q <= i; q++) L = Math.max(L, C[q][j]); for (let q = i; q <= nx; q++) R = Math.max(R, C[q][j]);
          const y = Math.min(L, R); if (y > -1e3) pts.push([X[i], y + .55, Z[j] - edge * edge * 1.2]);
        }
        if (pts.length > 1) {
          const e = edge > .8 ? (edge - .8) / .2 : 0, last = pts[pts.length - 1];   // 兩個角往下垂
          if (e > 0) pts.push([last[0], last[1] + .2, last[2] - 3.2 * e]);
          sh.chain(BODY, pts, pts.map(() => .8)); BOT.push(pts[pts.length - 1]);
        }
      }
      // 下緣邊框
      sh.cloth = 2;
      if (BOT.length > 1) sh.chain(BODY, BOT.map(q => [q[0], q[1] + .35, q[2] + .3]), BOT.map(() => 1.05));
      // 配重：掛在兩個下垂角
      sh.cloth = 4;
      for (const q of [BOT[0], BOT[BOT.length - 1]]) {
        if (!q) continue; const c = [q[0], q[1] + .3, q[2] - 1.6];
        if (weight === 'bell') { sh.ell(BODY, c, [1.5, 1.5, 1.4]); sh.ell(BODY, [c[0], c[1], c[2] - .9], [1.9, 1.9, .6]); }
        else sh.ell(BODY, [c[0], c[1], c[2] - .6], [1.0, 1.0, 2.0]);
      }
      // 金色頸鍊：從布兩個上角繞過脖子後面
      sh.cloth = 3;
      const nz0 = S + 2.2; let yf = null, yb = null, xr = null;
      for (let k = 0; k < 300; k++) { const y = 15 - k * .1; if (bodyDist(sh, 0, y, nz0) < 0) { yf = y; break; } }
      for (let k = 0; k < 300; k++) { const y = -15 + k * .1; if (bodyDist(sh, 0, y, nz0) < 0) { yb = y; break; } }
      if (yf !== null && yb !== null) {
        const yc = (yf + yb) / 2;
        for (let k = 0; k < 200; k++) { const x = 12 - k * .1; if (bodyDist(sh, x, yc, nz0) < 0) { xr = x; break; } }
        const ry = (yf - yb) / 2 + .7, rx = (xr || 3) + .7, ring = [];
        for (let a = 0; a <= 180; a += 15) { const t = a * Math.PI / 180; ring.push([rx * Math.cos(t), yc - ry * Math.sin(t), nz0 + .3 * Math.sin(t)]); }
        const L = C[0][0] + .55, R = C[nx][0] + .55;
        sh.chain(BODY, [[-hw, R > -1e3 ? L : yf, top], [-rx, yc, nz0]], [.4, .4]);
        sh.chain(BODY, [[hw, R > -1e3 ? R : yf, top], [rx, yc, nz0]], [.4, .4]);
        sh.chain(BODY, ring, ring.map(() => .4));
      }
      sh.cloth = 0;
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
    /** 從 [0,0,−1] 轉到 g 的旋轉（Rodrigues），髮尾照重力垂用。 */
    function gravRot(g) {
      const n = hypot3(g[0], g[1], g[2]) || 1, b = [g[0] / n, g[1] / n, g[2] / n], c = -b[2];
      if (c < -.999) return [1, 0, 0, 0, -1, 0, 0, 0, -1];
      const v = [b[1], -b[0], 0], k = 1 / (1 + c);   // v＝[0,0,−1]×b
      return [1 - k * v[1] * v[1], k * v[0] * v[1], v[1], k * v[0] * v[1], 1 - k * v[0] * v[0], -v[0], -v[1], v[0], 1 - k * (v[0] * v[0] + v[1] * v[1])];
    }
    /** 2026-10-13：grav＝頭部局部座標裡的「下」。站著是 [0,0,−1]（不動）；躺／趴時馬尾、雙馬尾、麻花辮從根部照重力垂，不再跟著頭轉成一根棍子。 */
    /** side＝側面（偷看）：鬢髮與兩側髮束收到臉頰後面（耳朵前後），不然從側面看整張臉被頭髮蓋住（2026-10-15）。 */
    function hair(sh, P, doll, tor, sway = 0, grav = null, side = false, swing = null) {
      const Rg = grav ? gravRot(grav) : null;
      const bend = (pts, root = pts[0]) => !Rg ? pts : pts.map(p => { const d = mulV(Rg, [p[0] - root[0], p[1] - root[1], p[2] - root[2]]); return [root[0] + d[0], root[1] + d[1], root[2] + d[2]]; });
      // swing（頭的局部座標向量）：髮根不動、越往髮尾甩越多；sw(p, w) 把點 p 照權重 w（0～1）推過去
      const SW = swing || [0, 0, 0], sw = (p, w) => [p[0] + SW[0] * w, p[1] + SW[1] * w, p[2] + SW[2] * w];
      const swc = (pts, ws) => pts.map((p, i) => sw(p, ws[i]));
      const zc = tor.zc, S = tor.S, yl = tor.yl, y0 = yl(zc), style = doll.hair, hh = P.head_h / 2, T = P.T;
      if (style === 'none') return;
      if ('backHair' in doll || 'frontHair' in doll) return layeredHair(sh, P, doll, tor, sway, side, sw, swc, bend);
      const bottoms = { short: zc - 4.5, bob: zc - 9.6, bun: zc - 5.5, buns: zc - 5.5, pony_hi: zc - 5.5, pony_lo: zc - 7 };
      const bottom = style in bottoms ? bottoms[style] : null;
      const cap = { y0, zc, bang: 2.4, bottom, cut: null };
      sh.ell(HAIR, [0, y0 - .6, zc + .9], [8.0, 8.3, hh + 1.1], cap);
      const fy = side ? -3.4 : 0;   // 側面：髮束往後挪，露出臉
      for (const s of [-1, 1]) sh.cone(HAIR, [s * 5.6, y0 + 3.6 + fy, zc + 3.5], [s * 6.5, y0 + 4.0 + fy * 1.1, zc - 2.0], side ? 1.5 : 1.9, side ? .9 : 1.1);
      if (style === 'bob') sh.ell(HAIR, sw([0, y0 - 1.2, zc - 4.2], .18), [9.0, 8.4, 5.2], { y0, zc, bang: 2.4, bottom, cut: zc - 10.0 });
      if (style === 'medium' || style === 'long' || style === 'waist') {
        const end = { medium: S - 3.5, long: S - .5 * T, waist: S - .78 * T }[style];
        const n = Math.max(3, Math.trunc((zc - end) / 2.2));
        for (let i = 0; i <= n; i++) {
          const t = i / n, z = zc + 1 - (zc + 1 - end) * t;
          const w = 8.0 - 1.4 * t + (style === 'medium' && t > .7 ? 1.2 : 0);
          const yb = yl(z) - (4.6 + 2.6 * Math.min(1, t * 1.6));
          sh.ell(HAIR, sw([sway * t * t, yb, z], t ** 1.6), [w, 2.4 + (1 - t) * 2.2, 2.6]);
        }
        const lockEnd = { medium: S - 1.0, long: S - .38 * T, waist: S - .62 * T }[style];
        const flare = style === 'medium' ? 2.2 : .8;
        const rr = style === 'medium' ? [1.9, 2.0, 1.0] : [2.0, 2.1, 1.9, 1.0];
        for (const s of [-1, 1]) {
          const pts = [[s * 6.2, y0 + 1.8 + fy, zc + 1], [s * (7.4 + flare * .5), y0 + 1.6 + fy, zc - 7]];
          // 側面：垂到胸前的兩束收到肩膀後面（不然從側面看蓋住胸口）
          if (style !== 'medium') pts.push([s * 7.6 + sway * .2, yl(S) + 2.8 + fy * (side ? 1.8 : .7), S - 2]);
          pts.push([s * (6.9 + flare) + sway * .3, yl(lockEnd) + 3.4 + fy * (side ? 2.2 : .5), lockEnd]);
          sh.chain(HAIR, swc(pts, pts.length === 3 ? [0, .3, 1] : [0, .25, .6, 1]), rr);
        }
      }
      if (style === 'pony_hi') {
        sh.ell(HAIR, [0, y0 - 8.2, zc + 2.4], [2.7, 2.6, 2.6]);
        sh.chain(HAIR, swc(bend([[0, y0 - 9.6, zc + 3.0], [sway * .3, y0 - 12.6, zc + .5], [sway * .7, y0 - 12.6, zc - 7], [sway, yl(S) - 10.0, S - 9]]), [0, .2, .6, 1]), [2.6, 3.1, 2.4, 1.0]);
      }
      if (style === 'pony_lo') {
        sh.ell(HAIR, [0, y0 - 7.4, zc - 5.0], [2.3, 2.1, 2.1]);
        sh.chain(HAIR, swc(bend([[0, y0 - 8.4, zc - 5.6], [sway * .5, yl(S) - 7.6, S - 6], [sway, yl(S) - 7.2, S - 17]]), [0, .45, 1]), [2.4, 2.6, 1.1]);
      }
      if (style === 'twin') for (const s of [-1, 1]) {
        sh.ell(HAIR, [s * 6.4, y0 - 2.4, zc + 4.4], [2.1, 2.0, 2.1]);
        sh.chain(HAIR, swc(bend([[s * 8.2, y0 - 2.6, zc + 4.2], [s * 11.2, y0 - 2.6, zc - .5], [s * 12.4 + sway * .4, y0 - 2.6, zc - 11],
          [s * 12.0 + sway * .8, y0 - 2.4, S - 14], [s * 10.8 + sway, yl(S) - 2.2, S - 24]]), [0, .12, .4, .72, 1]), [2.0, 2.5, 2.1, 1.6, .7]);
      }
      if (style === 'bun') sh.ell(HAIR, sw([0, y0 - 5.2, zc + hh - .6], .08), [4.0, 3.8, 3.6]);
      if (style === 'buns') for (const s of [-1, 1]) sh.ell(HAIR, sw([s * 6.0, y0 - 1.8, zc + hh + 1.8], .08), [3.1, 2.9, 3.0]);
      if (style === 'braid') {
        const pts = [[-6.0, y0 - 1.5, zc - 4.5], [-6.8, yl(S) + 2.0, S + 1], [-6.2, yl(S) + 4.6, S - 5]];
        for (let i = 0; i < 6; i++) pts.push([-5.6 + i * .15, yl(S - 7 - i * 2.4) + 5.4 + i * .1, S - 7 - i * 2.4]);
        if (Rg) pts.splice(0, pts.length, ...bend(pts));
        pts.splice(0, pts.length, ...pts.map((p, i) => sw(p, (i / (pts.length - 1)) ** 1.4)));
        pts.forEach((p, i) => { const r = 2.3 - i * .1 + (i % 2 ? .35 : 0); sh.ell(HAIR, p, [r, r * .9, i > 1 ? 1.7 : 2.4]); });
        sh.chain(HAIR, pts.slice(0, 3), [2.4, 2.2, 2.0]);
        const tail = pts[pts.length - 1];
        sh.cone(HAIR, tail, [tail[0], tail[1] + .3, tail[2] - 3.5], 1.4, .6);
      }
    }


    // 2026-10-30 pt24u：髮型系統＝後髮＋前髮兩層（null＝不畫這層）。前髮含頭頂髮帽。
    const BACK_HAIRS = ['long', 'wavy', 'short', 'pony', 'medium', 'twin', 'ponyhi', 'bun'];   // 2026-10-30 pt27u：＋雙馬尾、高馬尾、包子頭
    const FRONT_HAIRS = ['blunt', 'french', 'side', 'pomp', 'curtain'];
    function layeredHair(sh, P, doll, tor, sway, side, sw, swc, bend) {
      const zc = tor.zc, S = tor.S, yl = tor.yl, y0 = yl(zc), hh = P.head_h / 2, T = P.T, fy = side ? -3.4 : 0;
      const NOFACE = 1e9, B = doll.backHair, F = doll.frontHair;
      if (F) {
        const bang = { blunt: 2.0, french: 3.4, side: 4.6, pomp: 6.0, curtain: 4.8 }[F] ?? 2.4;
        sh.ell(HAIR, [0, y0 - .6, zc + .9], [8.0, 8.3, hh + 1.1], { y0, zc, bang, bottom: null, cut: null });
        for (const s of [-1, 1]) sh.cone(HAIR, [s * 5.6, y0 + 3.6 + fy, zc + 3.5], [s * 6.5, y0 + 4.0 + fy * 1.1, zc - 2.0], side ? 1.5 : 1.9, side ? .9 : 1.1);
        if (F === 'blunt') {   // 齊瀏海（2026-10-30 pt26u 依使用者參考照）：厚實、密、一刀水平切齊，蓋過眉毛，寬度到兩側太陽穴、方角無碎髮
          sh.ell(HAIR, [0, y0 + 5.4, zc + 3.6], [7.9, 2.9, 4.6], { y0: NOFACE, zc, bang: 0, bottom: zc - .5, cut: null });
          for (const s of [-1, 1]) sh.ell(HAIR, [s * 6.6, y0 + 4.2, zc + 1.6], [1.9, 2.4, 2.8], { y0: NOFACE, zc, bang: 0, bottom: zc - .5, cut: null });   // 方角：兩端垂直落下不收圓
        } else if (F === 'french') {   // 法式瀏海：短、輕、中間微分的空氣感細束
          for (const x of [-4.2, -2.1, 0, 2.1, 4.2]) sh.cone(HAIR, [x * .8, y0 + 5.0, zc + hh - .2], [x * 1.05, y0 + 6.9, zc + 2.4 + Math.abs(x) * .25], 1.3, .45);
        } else if (F === 'side') {   // 旁分：髮線偏一邊，一大片斜斜蓋過額頭到另一側
          sh.chain(HAIR, [[-2.6, y0 + 4.2, zc + hh + .4], [1.8, y0 + 6.4, zc + 4.6], [6.4, y0 + 5.4, zc + 1.4], [7.4, y0 + 3.6, zc - 2.5]], [2.2, 2.0, 1.6, 1.0]);
          sh.ell(HAIR, [-5.6, y0 + 4.4, zc + 4.6], [2.4, 2.2, 2.0]);
        } else if (F === 'pomp') {   // 吹高髮：前額髮根吹蓬、往上往後翻
          sh.ell(HAIR, [0, y0 + 3.6, zc + hh + 1.0], [6.2, 4.4, 3.2]);
          sh.ell(HAIR, [0, y0 + 5.8, zc + hh - .8], [5.0, 2.4, 2.6], { y0: NOFACE, zc, bang: 0, bottom: zc + 5.4, cut: null });
        } else if (F === 'curtain') {   // 長髮分兩邊：中分，兩大束沿臉頰垂到胸前上緣
          for (const s of [-1, 1]) {
            sh.chain(HAIR, swc([[s * 1.2, y0 + 5.4, zc + hh], [s * 5.4, y0 + 5.2, zc + 3.0], [s * 7.2, y0 + 3.2, zc - 4.0], [s * 8.4 + sway * .2, yl(S) + 1.6 + fy, S - 3], [s * 8.6 + sway * .3, yl(S - .3 * T) + 2.0 + fy, S - .3 * T]], [0, .05, .2, .6, 1]), [1.5, 1.9, 2.0, 1.9, 1.0]);
          }
        }
      }
      if (!B) return;
      if (B === 'short') {   // 短髮：後腦勺包到耳下
        sh.ell(HAIR, [0, y0 - 2.6, zc - .6], [8.4, 6.6, hh + .4], { y0: NOFACE, zc, bang: 0, bottom: zc - 5.0, cut: null });
        return;
      }
      if (B === 'pony') {   // 馬尾：後腦高綁，一束甩動
        sh.ell(HAIR, [0, y0 - 2.4, zc + .4], [7.9, 6.4, hh + .6], { y0: NOFACE, zc, bang: 0, bottom: zc - 4.6, cut: null });
        sh.ell(HAIR, [0, y0 - 8.2, zc + 2.4], [2.7, 2.6, 2.6]);
        const sv = sway * 2.2;
        sh.chain(HAIR, swc(bend([[0, y0 - 9.6, zc + 3.0], [sv * .3, y0 - 12.6, zc + .5], [sv * .7, y0 - 12.6, zc - 7], [sv, yl(S) - 10.0, S - 9]]), [0, .2, .6, 1]), [2.6, 3.1, 2.4, 1.0]);
        return;
      }
      if (B === 'twin' || B === 'ponyhi' || B === 'bun') {   // 2026-10-30 pt27u：綁起來的三款，後腦先貼頭包好
        sh.ell(HAIR, [0, y0 - 2.4, zc + .4], [7.9, 6.4, hh + .6], { y0: NOFACE, zc, bang: 0, bottom: zc - 4.6, cut: null });
        const sv = sway * 2.2;
        if (B === 'twin') for (const s of [-1, 1]) {   // 雙馬尾：頭頂兩側高綁，兩束往外再垂到胸下
          sh.ell(HAIR, [s * 6.4, y0 - 2.4, zc + 4.4], [2.1, 2.0, 2.1]);
          sh.chain(HAIR, swc(bend([[s * 8.2, y0 - 2.6, zc + 4.2], [s * 11.2, y0 - 2.6, zc - .5], [s * 12.4 + sv * .3, y0 - 2.6, zc - 11],
            [s * 12.0 + sv * .6, y0 - 2.4, S - 14], [s * 10.8 + sv * .8, yl(S) - 2.2, S - 24]]), [0, .12, .4, .72, 1]), [2.0, 2.5, 2.1, 1.6, .7]);
        }
        if (B === 'ponyhi') {   // 高馬尾：綁在頭頂後方（比馬尾高很多），先往上後翹再垂下
          sh.ell(HAIR, [0, y0 - 5.6, zc + hh - .4], [2.8, 2.7, 2.6]);
          sh.chain(HAIR, swc(bend([[0, y0 - 6.6, zc + hh + .4], [sv * .2, y0 - 10.8, zc + hh + 1.2], [sv * .5, y0 - 13.4, zc + 2.0], [sv * .8, y0 - 13.0, zc - 8], [sv, yl(S) - 10.5, S - 6]]), [0, .1, .3, .65, 1]), [2.6, 3.0, 3.0, 2.3, 1.0]);
        }
        if (B === 'bun') {   // 包子頭：頭頂一顆圓髻＋底部束口
          sh.ell(HAIR, sw([0, y0 - 3.0, zc + hh + 3.4], .05), [4.4, 4.2, 3.9]);
          sh.ell(HAIR, [0, y0 - 2.6, zc + hh + .2], [2.6, 2.5, 1.4]);
        }
        return;
      }
      const end = { long: S - .5 * T, wavy: S - .5 * T, medium: S - 3.5 }[B];
      const n = Math.max(3, Math.trunc((zc - end) / 2.2)), wave = B === 'wavy';
      for (let i = 0; i <= n; i++) {
        const t = i / n, z = zc + 1 - (zc + 1 - end) * t;
        let w = 8.0 - 1.4 * t + (B === 'medium' && t > .7 ? 1.2 : 0);
        if (wave) w += 1.0 + 1.1 * Math.sin(t * Math.PI * 4.5);
        const yb = yl(z) - (4.6 + 2.6 * Math.min(1, t * 1.6));
        sh.ell(HAIR, sw([sway * t * t + (wave ? .8 * Math.sin(t * Math.PI * 3) : 0), yb, z], t ** 1.6), [w, 2.4 + (1 - t) * 2.2, 2.6]);
      }
      const lockEnd = { long: S - .38 * T, wavy: S - .38 * T, medium: S - 1.0 }[B];
      const flare = B === 'medium' ? 2.2 : wave ? 1.8 : .8;
      for (const s of [-1, 1]) {   // 兩側髮束（放在肩後，前髮另外管胸前）
        const pts = [[s * 6.4, y0 - .6 + fy, zc + 1], [s * (7.6 + flare * .5), y0 - 1.0 + fy, zc - 7]];
        if (B === 'long' || wave) pts.push([s * (7.8 + (wave ? 1.2 : 0)) + sway * .2, yl(S) - 1.0 + fy, S - 2]);
        pts.push([s * (6.9 + flare + (wave ? -.8 : 0)) + sway * .3, yl(lockEnd) - .8 + fy, lockEnd]);
        sh.chain(HAIR, swc(pts, pts.length === 3 ? [0, .3, 1] : [0, .25, .6, 1]), pts.length === 3 ? [1.9, 2.0, 1.0] : [2.0, 2.2, 2.0, 1.0]);
        if (wave) for (let k = 0; k < 3; k++) sh.ell(HAIR, sw([s * (8.6 - k * .5 + (k % 2 ? 1.2 : 0)), yl(S - k * 5) - 1.0 + fy, S - 2 - k * 5], .5 + k * .2), [1.9, 1.8, 2.2]);
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
      const cb = CUP_BOUNCE[doll.cup] ?? .35, amp = cb * (.55 + .45 * cb) * 1.35 * scale, dz = yv * amp;   // 2026-10-29 pt11u：越大越晃（超線性：A≈0.1 → H≈2.4）
      return [.35 * amp * Math.sin(phase) * .6, .35 * dz, dz, Math.max(-.08, Math.min(.08, -dz * .025))];
    }

    // ------------------------------------------------------------ poses
    /** 畫布：std＝站／坐；tall＝手舉高（伸懶腰）；wide＝躺在地上（橫跨兩格）。 */
    const CANVAS = {
      std: { w: W, h: H_CANVAS, ax: ANCHOR.x, ay: ANCHOR.y, tMax: 40, tMin: -45 },
      // 側面正交：螢幕 x＝世界 +y（往右）、螢幕 y＝−z；scale＝每模型單位幾像素
      peek: { w: 260, h: 166, ax: 120, ay: 152, side: true, scale: 1.28 },
      tall: { w: W, h: 166, ax: ANCHOR.x, ay: 152, tMax: 40, tMin: -45 },
      wide: { w: 128, h: 100, ax: 64, ay: 70, tMax: 95, tMin: -95 },
    };
    /** frames：小循環格數；fps：循環速度（每秒幾格）；canvas：見上。 */
    const POSES = {
      idle: { frames: 1, fps: 0 }, walk: { frames: WALK_FRAMES, fps: WALK_FPS }, sit: { frames: 2, fps: .7 },
      hug_knees: { frames: 2, fps: .7 }, crouch: { frames: 2, fps: .6 }, stretch: { frames: 3, fps: 1.6, canvas: 'tall', pingpong: true },
      wall_lean: { frames: 2, fps: .6 }, sway: { frames: 4, fps: 3.2 }, restless: { frames: 4, fps: 2.2 },
      stare: { frames: 2, fps: .9 }, twirl: { frames: 3, fps: 2.4 },
      lie_phone: { frames: 2, fps: .5, canvas: 'wide' }, prone_kick: { frames: 4, fps: 3, canvas: 'wide' },
      sleep_curl: { frames: 2, fps: .35, canvas: 'wide' }, sit_curl: { frames: 2, fps: .45 },
      // 接客偷看（2026-10-10）：側面正交投影、10 格一個抽送循環（慢慢退出→猛地頂進）
      sex_missionary: { frames: 30, fps: 9, canvas: 'peek' }, sex_cowgirl: { frames: 30, fps: 12, canvas: 'peek' },
      sex_doggy: { frames: 30, fps: 12, canvas: 'peek' }, sex_kiss: { frames: 30, fps: 12, canvas: 'peek' },
      sex_reverse: { frames: 30, fps: 12, canvas: 'peek' },
    };
    /** 抽送深度（1＝頂到底、0＝退到最外）；每格停留毫秒。照 mockups/peek/half4.py。 */
    // v3（2026-10-10）：節奏改自然——一輪 5 下、每下 6 格，約 2 下／秒（380～680ms 一下），深淺快慢不一：
    // 一下深慢 → 兩三下快淺（小衝刺）→ 再一下最深最慢。每下用餘弦（不再「啪」一下），頂進比退出略快（55%：45%）。
    // 2026-10-15：使用者：不要忽快忽慢 → 每一下同樣快、同樣深（退出／頂進各半）
    const SEX_STROKES = [[520, 1], [520, 1], [520, 1], [520, 1], [520, 1]];
    const SEX_THRUST = [], SEX_FRAME_MS = [], SEX_DEPTH = [];
    for (const [ms, d] of SEX_STROKES) for (let k = 0; k < 6; k++) {
      const t = k / 6, s = t;   // 退出、頂回各半（等速）
      SEX_THRUST.push(+(d * (.5 + .5 * Math.cos(2 * Math.PI * s))).toFixed(3));
      SEX_FRAME_MS.push(Math.round(ms / 6)); SEX_DEPTH.push(d);
    }
    /** 她被撞的位移比他晚一格才到；撞完多彈一點（跟這一下的深度成正比）。 */
    const HER_J = SEX_THRUST.map((p, i, a) => { const prev = a[(i - 1 + a.length) % a.length]; return .55 * p + .45 * prev + (i % 6 === 1 ? .16 * SEX_DEPTH[i] : 0); });
    /** 上半身（肩、頭）再晚一格：衝擊從骨盆一路傳到頭。 */
    const HER_U = HER_J.map((_, i, a) => a[(i - 1 + a.length) % a.length]);
    const SEX_BOUNCE_GAIN = 3.2;   // 2026-10-15：7 太大（使用者：乳房晃動不對），跳得像脫離身體   // 被撞時乳搖幅度（× CUP_BOUNCE）
    const SEX_POSES = ['sex_missionary', 'sex_cowgirl', 'sex_doggy', 'sex_kiss', 'sex_reverse'];
    /** 偷看的床：床面高度（模型單位，z）。客人剪影跟著這些世界座標畫（escort_peek.js）。 */
    const PEEK_BED_Z = 0;
    function mulT(R, v) { return [R[0] * v[0] + R[3] * v[1] + R[6] * v[2], R[1] * v[0] + R[4] * v[1] + R[7] * v[2], R[2] * v[0] + R[5] * v[1] + R[8] * v[2]]; }
    function toLocal(xf, w) { return mulT(xf.R, [w[0] - xf.t[0], w[1] - xf.t[1], w[2] - xf.t[2]]); }
    function toWorld(xf, l) { const v = mulV(xf.R, l); return [v[0] + xf.t[0], v[1] + xf.t[1], v[2] + xf.t[2]]; }
    /** 抽送時她身體被撞的位移 → 乳房阻尼彈簧（同一套 SPRING／CUP_BOUNCE）。回傳 10 格的 [bx,by,bz,sq]（局部座標）。 */
    const sexBounceCache = new Map(), traceCache = new Map();
    /** 身體被撞的位移（amp×HER_J）推一個阻尼彈簧 f0（Hz）／zeta，跑 6 輪取最後一輪：每格的彈簧位移（原始單位）。 */
    function springTrace(amp, f0, zeta) {
      const key = `${amp}|${f0}|${zeta}`;
      if (traceCache.has(key)) return traceCache.get(key);
      const out = springSignal(HER_J.map(v => amp * v), f0, zeta);
      traceCache.set(key, out);
      return out;
    }
    /** 一般版：sig＝每格的位置（循環），回傳每格的彈簧相對位移（同座標；慢半拍跟著的那一邊是 −方向，呼叫端自己決定怎麼用）。 */
    function springSignal(sig, f0, zeta) {
      const w = 2 * Math.PI * f0, n = SEX_THRUST.length;
      const total = SEX_FRAME_MS.reduce((a, b) => a + b, 0) / 1000, steps = 200, dt = total / steps;
      const pos = (tm) => {   // 位置（跟著格的時間內插）
        let acc = 0; for (let i = 0; i < n; i++) { const d = SEX_FRAME_MS[i] / 1000; if (tm < acc + d) { const f = (tm - acc) / d; return sig[i] * (1 - f) + sig[(i + 1) % n] * f; } acc += d; }
        return sig[0];
      };
      let y = 0, v = 0; const out = new Array(n).fill(0);
      for (let c = 0; c < 6; c++) {
        let acc = 0, fi = 0;
        for (let k = 0; k < steps; k++) {
          const tm = k * dt, a = (pos(tm + dt) - 2 * pos(tm) + pos(Math.max(0, tm - dt))) / (dt * dt);
          for (let j = 0; j < 8; j++) { v += (-w * w * y - 2 * zeta * w * v - a) * dt / 8; y += v * dt / 8; }
          if (c === 5 && tm >= acc) { out[fi] = y; acc += SEX_FRAME_MS[fi] / 1000; fi = Math.min(n - 1, fi + 1); }
        }
      }
      return out;
    }
    /** 頭髮甩動（2026-10-15）：頭在世界（側面畫面）的前後 y／上下 z 每格位置 → 彈簧（2.2Hz、阻尼 0.28）→ 每格頭髮的世界位移。 */
    const hairCache = new Map();
    function hairSwing(doll, pose) {
      const key = dollKey(doll) + '|' + pose;
      if (hairCache.has(key)) return hairCache.get(key);
      const n = SEX_THRUST.length, hy = [], hz = [];
      for (let f = 0; f < n; f++) { const h = sexAnchor(doll, pose, f).head; hy.push(h[1]); hz.push(h[2]); }
      const out = [springSignal(hy, 2.2, .28), springSignal(hz, 2.2, .28)];
      hairCache.set(key, out);
      return out;
    }
    function sexBounce(P, doll, axis, amp) {
      const kind = BUILD_SPRING[doll.build] || 'normal', key = `${doll.build}|${doll.cup}|${axis}|${amp}`;
      if (sexBounceCache.has(key)) return sexBounceCache.get(key);
      const [f0, zeta, gain] = SPRING[kind], out = springTrace(amp, f0, zeta);
      // 2026-10-10：原本 ×1.6（D 罩杯只晃 1～2 px，實機看不出來）→ ×5，×7，上限是罩杯半徑的 1.1
      const peak = Math.max(...out.map(Math.abs)) || 1, cb = (CUP_BOUNCE[doll.cup] ?? .35) * gain;
      const cap = cupRadius(P, doll) * .55;
      const res = out.map(o => Math.max(-cap, Math.min(cap, o / peak * cb * SEX_BOUNCE_GAIN)));
      sexBounceCache.set(key, res);
      return res;
    }
    function build(doll, pose, frame, yaw, opts = {}) {
      const P = proportions(doll), sh = makeShape(), b = P.b;
      const hip_x = 5.1 * F(b, 'hip') * (1 + .3 * (F(b, 'thigh') - 1));
      const kx = () => 3.2 + .65 * F(b, 'thigh');
      const hip_out = Math.max(9.0 * F(b, 'hip'), hip_x + 4.7 * F(b, 'thigh'));
      const waist_out = 5.9 * F(b, 'waist');
      const bo = bustOuter(P, doll), arm_clear = () => bo * .8 + .5;
      const front = Math.cos(yaw * Math.PI / 180) > -.2;
      const Lt = P.hipz - P.knee, Ls = P.knee - P.ankle;
      const shj = (s, tor, dy = -.4) => [s * 8.3 * F(b, 'sh'), tor.yl(tor.S) + dy, tor.S - 2.6];
      const phone = (c) => sh.ell(BODY, c, [3.0, .85, 4.6]);
      const NF = (POSES[pose] && POSES[pose].frames) || 1, f = ((frame % NF) + NF) % NF;
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
        if (String(doll.cloth || '').startsWith('napkin')) napkin(sh, P, doll, tor, doll.cloth.split('_')[1] || 'bell');
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
        if (String(doll.cloth || '').startsWith('napkin')) napkin(sh, P, doll, tor, doll.cloth.split('_')[1] || 'bell');
        hair(sh, P, doll, tor, -sway);
        return { sh, P };
      }
      if (pose === 'sit') {
        const seat = opts.seat ?? 35, hipz = seat + 3.8;
        const hip_y = -5.5;
        const br = frame % 2 ? .4 : 0;   // frame 1：吸氣（活動「正坐」的呼吸循環）
        const tor = torso(sh, P, doll, hip_y, hipz - P.hipz + br * .25, -.02, [0, 0, br * .5, 0]);
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
      // -------------------------------------------------- activity poses（房間活動；小循環動作）
      const standLegs = (shift = 0, bend = 0, tip = 0) => {   // 兩腳站；bend>0 右腳（+1）微彎，<0 左腳
        for (const s of [-1, 1]) {
          const k = (s === 1 ? Math.max(0, bend) : Math.max(0, -bend));
          leg(sh, P, s, [s * hip_x + shift, 0, P.hipz + tip - .9 * k], [s * kx() + shift + s * .2 * k, .4 + 1.8 * k, P.knee + tip - .4 * k],
            [s * 3.0 + shift * .4, -.2 + .6 * k, P.ankle + tip + .9 * k], [s * .3, .95 - .5 * (tip > .5 ? 1 : 0), tip > .5 ? -.7 : -.25 * k]);
        }
      };
      if (pose === 'hug_knees') {             // 坐地抱膝（呼吸）
        const br = f ? .45 : 0, dz = 2.6 - P.C, hz = P.hipz + dz;
        const tor = torso(sh, P, doll, -1.5, dz + br * .3, .08, [0, 0, br * .5, 0]);
        let knees = {};
        for (const s of [-1, 1]) {
          const hip = [s * hip_x, -1.5, hz], ankle = [s * 3.6, 15, P.ankle];
          const knee = ik(hip, ankle, Lt, Ls, [s * .15, .2, 1]);
          knees[s] = knee;
          leg(sh, P, s, hip, knee, ankle, [s * .2, .98, 0]);
        }
        for (const s of [-1, 1]) {
          const k = knees[s];
          arm(sh, P, shj(s, tor), [s * Math.max(hip_out + 1.2, Math.abs(k[0]) + 6), k[1] - 1.5, k[2] - 5], [s * 1.4, k[1] + 4.2, k[2] - 9.5]);
        }
        if (doll.skirt) sh.ell(BODY, [0, 2, hz + 1.5], [9.2 * F(b, 'hip') * 1.1, 8, 3]);
        hair(sh, P, doll, tor);
        return { sh, P };
      }
      if (pose === 'crouch') {                 // 蹲角落背對（輕輕前後晃）
        const dz = 17 - P.C, hz = P.hipz + dz, lean = f ? .3 : .26;
        const tor = torso(sh, P, doll, f ? .4 : 0, dz, lean);
        const knees = {};
        for (const s of [-1, 1]) {
          const hip = [s * hip_x, 0, hz], ankle = [s * 4.2, 3.5, P.ankle];
          knees[s] = ik(hip, ankle, Lt, Ls, [s * .25, 1, .35]);
          leg(sh, P, s, hip, knees[s], ankle, [s * .2, .98, 0]);
        }
        for (const s of [-1, 1]) {
          const k = knees[s];
          arm(sh, P, shj(s, tor), [s * (hip_out + 1.5), k[1] - 6, k[2] + 6], [s * 2.2, k[1] + 2.5, k[2] + 2]);
        }
        if (doll.skirt) sh.ell(BODY, [0, 1, hz], [9.2 * F(b, 'hip') * 1.15, 9, 4]);
        hair(sh, P, doll, tor);
        return { sh, P };
      }
      if (pose === 'stretch') {                // 伸懶腰（踮腳、手往上延伸）
        const k = [0, .6, 1][f], tip = 1.7 * k;
        const tor = torso(sh, P, doll, 0, tip, -.03 * k);
        skirt(sh, P, doll, tor);
        standLegs(0, 0, tip);
        for (const s of [-1, 1]) arm(sh, P, shj(s, tor), [s * (9.4 - .6 * k), .2, tor.S + 10 + 4 * k], [s * (7.2 + 1.8 * k), .8, tor.S + 24 + 6 * k]);
        hair(sh, P, doll, tor);
        return { sh, P };
      }
      if (pose === 'wall_lean') {              // 靠牆站、雙手抱胸、一腳踩牆（呼吸）
        const br = f ? .4 : 0;
        const tor = torso(sh, P, doll, -1.2, br * .25, -.04, [0, 0, br * .5, 0]);
        skirt(sh, P, doll, tor);
        leg(sh, P, -1, [-hip_x, -1.2, P.hipz], [-kx(), -.8, P.knee], [-3.2, -1.4, P.ankle], [-.3, .95, 0]);
        const hip = [hip_x, -1.2, P.hipz - .6], ankle = [3.8, -6.8, P.knee * .5];
        leg(sh, P, 1, hip, ik(hip, ankle, Lt, Ls, [.2, 1, 0]), ankle, [.1, -.25, -.96]);
        const wz = Math.min(tor.zW + 3.5, tor.zB - tor.cupr * .86 - 1.2);
        for (const s of [-1, 1]) arm(sh, P, shj(s, tor), [s * (waist_out + 2.6), tor.yl(tor.zW) + 3.6, wz - 2],
          [-s * (waist_out - .8), tor.yl(tor.zW) + 6.4 + (s > 0 ? .9 : 0), wz]);
        hair(sh, P, doll, tor);
        return { sh, P };
      }
      if (pose === 'sway' || pose === 'restless') {   // 哼歌晃身體／坐立不安（重心左右換）
        const ph = 2 * Math.PI * f / NF, sn = Math.sin(ph), cs = Math.cos(ph);
        const ang = (pose === 'sway' ? 6 : 3) * sn, shift = (pose === 'sway' ? -1.0 : -.8) * sn;
        sh.xf = compose({ R: rotY(0), t: [shift, 0, 0] }, about(rotY(ang), [0, 0, P.hipz]));
        const tor = torso(sh, P, doll, 0, 0, pose === 'restless' ? .04 : 0);
        skirt(sh, P, doll, tor, -2 * sn);
        if (pose === 'sway') {
          for (const s of [-1, 1]) {
            const sw = s * sn;
            arm(sh, P, shj(s, tor), [s * Math.max(waist_out + 2.8 * F(b, 'arm') + 2.2, arm_clear()), -1 + 2.5 * sw, tor.zW + 1 + 1.5 * cs * s],
              [s * (hip_out + 2.4), 2.5 + 4 * sw, tor.C + 1 + 2 * Math.max(0, sw)]);
          }
        } else {
          // 一手抱著另一隻手臂、腳尖內八
          arm(sh, P, shj(1, tor), [Math.max(waist_out + 2.8 * F(b, 'arm') + 1.4, arm_clear()), -.8, tor.zW - 1], [hip_out + 1.4, .8, tor.C]);
          arm(sh, P, shj(-1, tor), [-(waist_out + 1.6), Math.max(3.2, bo * .55), tor.zW + 1], [waist_out + 2.2, Math.max(4, bo * .5), tor.zW - 4]);
        }
        hair(sh, P, doll, tor, -3 * sn);
        sh.xf = null;
        const bend = sn > .3 ? 1 : sn < -.3 ? -1 : 0;
        if (pose === 'sway') standLegs(shift, bend * .8);
        else for (const s of [-1, 1]) {
          const kb = (s === 1 ? Math.max(0, bend) : Math.max(0, -bend)) * .7;
          leg(sh, P, s, [s * hip_x + shift, 0, P.hipz - .8 * kb], [s * (kx() - 1.6) + shift, .8 + 1.6 * kb, P.knee - .3 * kb],
            [s * 3.4 + shift * .4, .2 + .5 * kb, P.ankle + .8 * kb], [-s * .25, .96, -.2 * kb]);
        }
        return { sh, P };
      }
      if (pose === 'stare') {                  // 走到畫面前盯著你：手背在後、身體前傾、踮一下
        const tip = f ? .9 : 0;
        const tor = torso(sh, P, doll, 0, tip, .07);
        skirt(sh, P, doll, tor);
        for (const s of [-1, 1]) arm(sh, P, shj(s, tor), [s * (waist_out + 2.4), -4.2, tor.zW + .5], [s * 1.9, -6.6, tor.C + 4.5], false);
        for (const s of [-1, 1]) leg(sh, P, s, [s * hip_x, 0, P.hipz + tip], [s * (kx() - .5), .6, P.knee + tip], [s * 2.6, .2, P.ankle + tip],
          [s * .15, .98 - .4 * (tip ? 1 : 0), tip ? -.45 : 0]);
        if (front) definition(sh, P, tor);
        hair(sh, P, doll, tor);
        return { sh, P };
      }
      if (pose === 'twirl') {                  // 撥頭髮／捲髮尾（無聊、害羞）：一手叉腰、一手在耳邊繞
        const w = 1, o = [.9, 0, -.3], th = 2 * Math.PI * f / NF;
        sh.off = o;
        const tor = torso(sh, P, doll);
        skirt(sh, P, doll, tor);
        const sj = shj(w, tor, 0);
        const wrist = [w * (waist_out + (hip_out - waist_out) * .45 + 1.6), .3, tor.zW - .22 * tor.T];
        arm(sh, P, sj, [w * Math.max(waist_out + 2.8 * F(b, 'arm') + 6.2, hip_out + 2.2), -1.8, tor.zW + 2.5], wrist, false);
        sh.ell(BODY, [wrist[0] - w * .6, wrist[1], wrist[2] - .6], [1.8, 1.6, 2.1]);
        const r = [-(7.8 + .9 * Math.cos(th)), 2.6 + .9 * Math.sin(th), tor.zc - 4 + 1.1 * Math.sin(th)];
        arm(sh, P, shj(-1, tor, 0), [-(Math.max(waist_out + 5, bo * .9) + 3.5), 3.5, tor.S - 7], r);
        sh.off = [0, 0, 0];
        for (const s of [-1, 1]) {
          if (s === w) leg(sh, P, s, [s * hip_x + .9, 0, P.hipz + .2], [s * kx() + .5, .4, P.knee], [s * 3.0 + .3, -.2, P.ankle], [s * .3, .95, 0]);
          else leg(sh, P, s, [s * hip_x + .9, 0, P.hipz - .9], [s * kx() + 1.6, 2.2, P.knee - .4], [s * 3.5 + .4, .6, P.ankle + .9], [s * .35, .9, -.25]);
        }
        sh.off = o;
        if (front) definition(sh, P, tor);
        hair(sh, P, doll, tor, 2);
        sh.off = [0, 0, 0];
        return { sh, P };
      }
      if (pose === 'lie_phone') {              // 仰躺滑手機：一腳屈膝、雙手舉著手機
        sh.xf = { R: rotX(90), t: [0, P.H * .45, 7.2] }; sh.floor = true;
        const tor = torso(sh, P, doll, 0, 0, 0, [0, 0, f ? .35 : 0, 0]);
        skirt(sh, P, doll, tor);
        leg(sh, P, -1, [-hip_x, 0, P.hipz], [-kx(), .4, P.knee], [-3.2, -.2, P.ankle], [-.4, .9, 0]);
        const hip = [hip_x, 0, P.hipz], ankle = [3.8 + (f ? .5 : 0), -3.6, P.knee * .62];
        leg(sh, P, 1, hip, ik(hip, ankle, Lt, Ls, [.15, 1, 0]), ankle, [.2, -.1, -.98]);
        const lift = f ? .6 : 0;
        for (const s of [-1, 1]) arm(sh, P, shj(s, tor), [s * (waist_out + 3.6), -3.2, tor.S - 10], [s * 2.8, 9 + lift, tor.S + 1]);
        phone([0, 11.6 + lift, tor.S + 4.6]);
        hair(sh, P, doll, tor);
        sh.xf = null; sh.floor = false;
        return { sh, P };
      }
      if (pose === 'prone_kick') {             // 趴地撐手肘、小腿交互晃
        const lower = { R: rotX(-90), t: [0, -P.H * .5, 5.6] };
        const upper = compose(lower, about(rotX(36), [0, 0, P.hipz]));
        sh.floor = true;
        sh.xf = upper;
        const tor = torso(sh, P, doll);
        for (const s of [-1, 1]) arm(sh, P, shj(s, tor), [s * (waist_out + 2.8), 10, tor.S - 18], [s * 2.6, 5, tor.S + 1.5]);
        hair(sh, P, doll, tor);
        sh.xf = lower;
        skirt(sh, P, doll, tor);
        const ph = 2 * Math.PI * f / NF;
        for (const s of [-1, 1]) {
          const al = (62 + 30 * Math.sin(ph) * s) * Math.PI / 180;
          const knee = [s * kx(), .4, P.knee], ankle = [s * 3.0, .4 - Ls * Math.sin(al), P.knee - Ls * Math.cos(al)];
          leg(sh, P, s, [s * hip_x, 0, P.hipz], knee, ankle, [0, -Math.sin(al), -Math.cos(al)]);
        }
        sh.xf = null; sh.floor = false;
        return { sh, P };
      }
      if (pose === 'sleep_curl') {             // 側躺蜷著睡（呼吸起伏）
        const br = f ? .45 : 0;
        sh.xf = { R: rotY(-90), t: [P.H * .56, 0, Math.max(hip_out - 1, 8.3 * F(b, 'sh') + 1.2)] }; sh.floor = true;
        const tor = torso(sh, P, doll, 0, br * .2, .14, [0, 0, br * .6, 0]);
        for (const s of [-1, 1]) {
          const fw = s > 0 ? 2.5 : 0, a75 = 75 * Math.PI / 180;
          const hip = [s * hip_x * .85, 0, P.hipz];
          const knee = [s * kx() * .8, Lt * Math.sin(a75) + fw, P.hipz - Lt * Math.cos(a75)];
          const ankle = [s * 2.6, knee[1] - Ls * .55, knee[2] - Ls * .83];
          leg(sh, P, s, hip, knee, ankle, [0, -.25, -.97]);
          arm(sh, P, shj(s, tor), [s * (waist_out + 1) * .8, 8 + fw, tor.zW + 4], [s * 1.6, 11 + fw * .4, tor.S + 2]);
        }
        if (doll.skirt) sh.ell(BODY, [0, 4, P.hipz - 4], [9.2 * F(b, 'hip') * 1.05, 9, 7]);
        hair(sh, P, doll, tor);
        sh.xf = null; sh.floor = false;
        return { sh, P };
      }
      if (pose === 'sit_curl') {               // 蜷在椅子上滑手機：腳收上椅面、膝蓋往兩側
        const seat = opts.seat ?? 35, hipz = seat + 3.8, hip_y = -5.5, lift = f ? 1.4 : 0;
        const tor = torso(sh, P, doll, hip_y, hipz - P.hipz, f ? .11 : .06);   // 滑手機：低頭湊近一點又抬起
        const knees = {};
        for (const s of [-1, 1]) {
          const hip = [s * hip_x, hip_y, hipz], ankle = [s * 4.2, hip_y + 9, seat + P.ankle];
          knees[s] = ik(hip, ankle, Lt, Ls, [s * .35, .7, .9]);
          leg(sh, P, s, hip, knees[s], ankle, [s * .25, .97, 0]);
        }
        const kz = (knees[1][2] + knees[-1][2]) / 2, ky = (knees[1][1] + knees[-1][1]) / 2;
        for (const s of [-1, 1]) arm(sh, P, shj(s, tor), [s * (Math.abs(knees[s][0]) - 1.5), ky - 2, kz - 3], [s * 2.6, ky + 3, kz + 6 + lift]);
        phone([0, ky + 4.2, kz + 9.5 + lift]);
        if (doll.skirt) sh.ell(BODY, [0, hip_y + 3, hipz + 2], [9.2 * F(b, 'hip') * 1.1, 8, 3.2]);
        hair(sh, P, doll, tor);
        return { sh, P };
      }
      if (SEX_POSES.includes(pose)) return buildSex(doll, pose, f, opts);
      throw new Error('unknown pose ' + pose);
    }

    // -------------------------------------------------- 接客偷看的四種體位（側面；世界 +y＝往右＝客人那邊，床面 z＝0）
    const DOGGY_R = [-1, 0, 0, 0, 0, -1, 0, -1, 0];   // 局部「上」→ 世界 −y（頭朝左）、局部「前」→ 世界 −z（胸口朝床）
    /**
     * v2 姿勢（2026-10-10，照人體力學重做；規格見 docs/PLAN-2026-10.md「偷看體位 v2」）。
     * 共通：j＝她被撞的位移（HER_J，比他晚一格）、u＝上半身再晚一格（HER_U）；頭／髮再跟著 u 甩。
     * 世界：+y＝往右（客人那邊）、z＝上、床面 z＝0。
     */
    function sexRig(P, pose, f) {
      const b = P.b, n = SEX_THRUST.length, i = ((f % n) + n) % n;
      const p = SEX_THRUST[i], j = HER_J[i], u = HER_U[i];
      const Lt = P.hipz - P.knee, Ls = P.knee - P.ankle;
      const hipW = 5.1 * F(b, 'hip') * (1 + .3 * (F(b, 'thigh') - 1));
      const soft = 1 + .25 * b.soft;          // 肉多的被撞位移大一點
      if (pose === 'sex_missionary') {
        // 仰躺、骨盆被枕著微微後傾抬起；膝彎、小腿靠他肩；手抓他上臂。撞擊沿她骨盆軸 → 整個人往枕頭滑、上身晚一格、頭往後仰。
        const H = [0, -3.6 * j * soft, 6.8 + .5 * j];
        return { p, j, u, H, R: mulR(rotX(80), rotX(-6 * u)), lean: -.04 * u, headR: rotX(-22 - 10 * u),
          ankles: (s) => [s * (6 + hipW * .3), H[1] + 17 + (s > 0 ? 2 : 0), 30 + 2 * j], pole: (s) => [s * .35, -.6, 1],
          wrists: (s) => [s * 7.5, 15 - 3 * j, 25], apole: (s) => [s * .8, -.3, -.2],
          toe: [0, .55, .85], axis: 'y', amp: 3.6 };
      }
      if (pose === 'sex_cowgirl') {
        // 跨坐、膝在他腰兩側、小腿貼床往後；上身前傾 ~18°、手撐他胸口（肩在手腕正上方）。
        // 起：慢慢抬（ease），落：快、坐到底時骨盆前後一擺；上半身晚一格、反向擺（counter-rock）。
        const rise = 1 - p;                     // 0＝坐到底
        const H = [0, 3 + 1.4 * j, 10.5 + 13 * rise ** 1.3];
        return { p, j, u, H, R: mulR(rotZ(180), rotX(-4 * u)), lean: .2 + .06 * (u - rise), headR: rotX(16 - 8 * u),
          ankles: (s) => [s * (7.5 + hipW * .25), H[1] + 15, 1.5], pole: (s) => [s * .35, -1, .1],
          wrists: (s) => [s * 6, -13, Math.max(9.5, 9.5 + 2 * rise)], apole: (s) => [s * .7, .4, -.1],
          toe: [0, .25, -.95], axis: 'z', amp: 15 };
      }
      if (pose === 'sex_doggy') {
        // 四肢著地：膝在髖正下方、手腕在肩正下方；腰微塌（骨盆前傾）、背平；臉朝枕頭、頸跟背一直線微抬。
        // 撞擊從臀部推進：骨盆往前、肩晚一格、頭再晚；膝不動（大腿跟著斜一點）。
        const H = [0, 8 - 3.4 * j * soft, Lt + 1.2];
        // 背的斜度由手臂長度決定：肩高≈手臂長×0.8（手腕在肩正下方、手肘彎著撐；背接近水平、腰微塌），髖高≈大腿長（膝在髖正下方）
        const armZ = P.H * .3 * .8, back = (P.S - P.hipz) * .92;
        const tilt = -Math.asin(Math.max(-.6, Math.min(.6, (H[2] - armZ) / back))) * 180 / Math.PI;
        return { p, j, u, H, R: mulR(DOGGY_R, rotX(tilt - 12 + 2.5 * u)), lean: -.05 - .03 * u, headR: rotX(26 + 6 * u),
          knees: (s) => [s * hipW * .85, 8 + .3, 1.8], ankles: (s) => [s * hipW * .75, 8 + Ls + .5, 1.2],
          wrists: 'under', apole: (s) => [s * .3, .6, .2],
          toe: [0, .2, -.98], axis: 'y', amp: 3.2 };
      }
      if (pose === 'sex_reverse') {
        // 背向坐在他腿上（他坐著、在她背後 +y）：她面朝 −y、背貼他胸口；膝往前、腳掌平放床上；手撐他大腿。
        // 她上下套（慢起快落、幅度小於騎乘）；他雙手從後面抓她胸（乳房被壓扁、不太晃）。
        const rise = 1 - p / 1.06;
        const H = [0, 5 + .8 * j, 12 + 7 * rise];
        return { p, j, u, H, R: mulR(rotZ(180), rotX(-8 - 3 * u)), lean: -.06, headR: rotX(-12 - 8 * u),
          ankles: (s) => [s * 8, -15, 1.4], pole: (s) => [s * .5, -1, .6],
          wrists: (s) => [s * 9.5, -3, 9 + 2 * rise], apole: (s) => [s * 1, .3, -.2],
          toe: [0, -1, -.05], foot: 'flat', axis: 'z', amp: 6, grope: true };
      }
      // sex_kiss（v3）：坐在他腿上面對面深吻。不是上下套：骨盆前後畫圈磨（hip roll），上身反向前後＋左右搖，頭側一邊、跟他一起動。
      // 腳：小腿繞到他背後、腳踝自然伸直（腳背順著小腿），兩腳在他腰後交叉。
      const ph = 2 * Math.PI * i / 6, roll = Math.sin(ph), fwd = Math.cos(ph) * (.6 + .4 * SEX_DEPTH[i]);
      const H = [.9 * roll, -4 + 1.2 * fwd, 13.5 + .5 * (1 - Math.abs(fwd))];
      return { p, j, u, H, R: mulR(rotY(6 * roll), rotX(3 * fwd)), lean: .19 + .02 * fwd, headR: mulR(rotY(-18 + 4 * roll), rotX(-12 - 4 * fwd)),
        ankles: (s) => [s * 3.5, 23.5, 15 + s], pole: (s) => [s * 1, .25, .4],
        wrists: (s) => [s * 4, 15.5 + .8 * fwd, 40.5], apole: (s) => [s * 1, -.2, -.4],
        toe: 'shin', axis: 'y', amp: 4, sway: roll, fwd };
    }
    function buildSex(doll, pose, f, opts = {}) {
      const P = proportions(doll), sh = makeShape();
      // 2026-10-13：側面畫布只有 1.28 px／單位，前臂、小腿只剩 2 px 像棍子 → 偷看裡四肢加粗一點（房間人偶不動）
      P.b = { ...P.b, arm: P.b.arm * 1.18, calf: P.b.calf * 1.1 };
      const b = P.b;
      const g = { ...sexRig(P, pose, f) };
      {
        // 2026-10-15 次級動作（不再整塊僵硬平移）：一個 30 格循環裡慢慢扭腰／轉頭（slow），
        // 頭比上半身再晚一格甩（whip），手腳跟著被撞的方向滑一點，每一下都不一樣。
        const nn = SEX_THRUST.length, k = ((f % nn) + nn) % nn, ph = 2 * Math.PI * k / nn;
        const slow = Math.sin(ph), slow2 = Math.cos(ph), lag = HER_U[(k - 1 + nn) % nn], whip = lag - g.u;
        const KW = { sex_missionary: -16, sex_cowgirl: 20, sex_doggy: 14, sex_reverse: -14, sex_kiss: 6 }[pose] ?? 10;
        if (pose !== 'sex_kiss') g.R = mulR(g.R, rotZ(5 * slow));
        g.lean = g.lean + .05 * (lag - .5) * (pose === 'sex_cowgirl' ? 1 : -1);
        g.headR = mulR(g.headR || rotX(0), mulR(rotZ(9 * slow2), mulR(rotY(5 * slow), rotX(KW * whip + 5 * (g.j - .5) * Math.sign(KW)))));
        const wr = g.wrists, an = g.ankles;
        if (typeof wr === 'function') g.wrists = (sd) => { const w = wr(sd); return [w[0] + .6 * sd * slow, w[1] - 1.4 * (lag - .5), w[2] + .9 * Math.sin(ph * 2 + sd)]; };
        if (pose === 'sex_missionary') g.ankles = (sd) => { const a = an(sd); return [a[0] + 1.3 * sd * slow, a[1] + 1.6 * (lag - .5), a[2] + 1.4 * g.j]; };
        g.face = { mouth: Math.min(1, .35 + .65 * g.j) };
      }
      const Lt = P.hipz - P.knee, Ls = P.knee - P.ankle, Lu = P.H * .16, Lf = P.H * .14;
      const hip_x = 5.1 * F(b, 'hip') * (1 + .3 * (F(b, 'thigh') - 1));
      const R = g.R, H = g.H;
      const pivot = [0, 0, P.hipz], rp = mulV(R, pivot);
      const xf = { R, t: [H[0] - rp[0], H[1] - rp[1], H[2] - rp[2]] };
      sh.xf = xf;
      sh.floor = true;   // 床面以下切掉（腳尖、垂下來的髮尾不會穿到床下）
      const n = SEX_THRUST.length, fi = ((f % n) + n) % n;
      // 2026-10-15 修正：HER_J 變大＝她往世界 −axis 移動（被撞往枕頭／往下坐），彈簧位移要反號才是「慢半拍跟著」，原本是搶在身體前面
      const bv = -sexBounce(P, doll, g.axis, g.amp)[fi] * (opts.bounceScale ?? 1) * (g.grope ? .3 : 1);
      // v3：重力跟著身體方向走——把世界「下」換到她的局部座標；站姿（局部 −z）是 0。四肢著地時就往床（局部前方）垂。
      const r0 = cupRadius(P, doll), gl = mulT(R, [0, 0, -1]), sagK = r0 * (.42 + .12 * b.soft) * Math.min(1.3, r0 / 3.4);
      // 甩動方向＝她被撞的世界方向（傳教士／老漢推車：前後擺 → 鐘擺；騎乘：上下），也換到局部
      const ax = mulT(R, g.axis === 'z' ? [0, 0, 1] : [0, 1, 0]);
      const sq = Math.max(-.07, Math.min(.07, -bv * .03 * Math.abs(ax[2])));
      const bnc = [ax[0] * bv + sagK * gl[0], ax[1] * bv + sagK * gl[1] + Math.abs(bv) * .15, ax[2] * bv + sagK * (gl[2] + 1), sq,
        g.grope ? .3 + .08 * g.j : 0, Math.max(0, gl[1])];
      {   // 垂吊用的純甩動（不含站姿下垂補償）：這一格＋上一格（尖端的額外延遲）。×1.5：尖端是最大位移處
        const bvp = -sexBounce(P, doll, g.axis, g.amp)[(fi - 1 + n) % n] * (opts.bounceScale ?? 1) * (g.grope ? .3 : 1);
        bnc[6] = [ax[0] * bv * .9, ax[2] * bv * .9, ax[0] * bvp * .9, ax[2] * bvp * .9];
      }
      if (pose === 'sex_kiss') {
        // v4：面對面坐姿不吃「抽送方向」的彈簧。上身直立 → 自然往下垂（站姿形）；跟著她骨盆畫圈／上身搖，晚一格甩：
        // 主要前後（y）、一點左右（x）；往前貼他胸口時被壓扁（sy）。
        const ph1 = 2 * Math.PI * ((fi - 1 + n) % n) / 6, lagF = Math.cos(ph1), lagR = Math.sin(ph1);
        const kb = r0 * (CUP_BOUNCE[doll.cup] ?? .35) * (.8 + .3 * b.soft) * (opts.bounceScale ?? 1);
        const press = Math.max(0, g.fwd) * .22 * Math.min(1.4, r0 / 3.4);
        bnc[0] = -.5 * kb * lagR; bnc[1] = -.45 * kb * lagF - press * r0 * .4; bnc[2] = -.2 * kb * Math.abs(lagF); bnc[3] = -press * .4; bnc[4] = press; bnc[5] = 0;
      }
      // 肉體撞擊（2026-10-15）：頂到底那一格臀肉被壓扁、往撞的方向推，之後用較快的彈簧晃回來（大腿根晚一格）
      let jig = null;
      if (pose !== 'sex_kiss') {
        const tr = springTrace(g.amp, 4.6, .2), pk = Math.max(...tr.map(Math.abs)) || 1, A = 1.3 * F(b, 'butt') * (1 + .5 * b.soft);
        const jv = -tr[fi] / pk, jv1 = -tr[(fi - 1 + n) % n] / pk, k6 = fi % 6, imp = k6 === 0 ? SEX_DEPTH[fi] : k6 === 1 ? .45 * SEX_DEPTH[fi] : 0;
        jig = { d: [ax[0] * jv * A, ax[1] * jv * A, ax[2] * jv * A], sq: Math.max(-.08, Math.min(.2, .16 * imp + .05 * jv)),
          thigh: [ax[0] * jv1 * A * .7, ax[1] * jv1 * A * .7, ax[2] * jv1 * A * .7] };
      }
      const tor = torso(sh, P, doll, 0, 0, g.lean, bnc, true, jig);
      for (const s of [-1, 1]) {
        const hipL = [s * hip_x, 0, P.hipz], hipW = toWorld(xf, hipL), ankW = g.ankles(s);
        const kneeW = g.knees ? g.knees(s) : ik(hipW, ankW, Lt, Ls, g.pole(s));
        let toe = g.toe;
        if (toe === 'shin') { const d = [ankW[0] - kneeW[0], ankW[1] - kneeW[1], ankW[2] - kneeW[2]], n = Math.hypot(...d) || 1; toe = [d[0] / n * .8, d[1] / n * .8 + .2, d[2] / n * .8 - .45]; }
        leg(sh, P, s, hipL, toLocal(xf, kneeW), toLocal(xf, ankW), mulT(R, toe));
      }
      for (const s of [-1, 1]) {
        const sj = [s * 8.3 * F(b, 'sh'), tor.yl(tor.S) - .4, tor.S - 2.6], sjW = toWorld(xf, sj);
        const wW = g.wrists === 'under' ? [s * 6.5 * F(b, 'sh'), sjW[1] - 5, 1.2] : g.wrists(s);   // v6：手腕略往前，側面看得到垂下的胸
        const eW = ik(sjW, wW, Lu, Lf, g.apole(s));
        arm(sh, P, sj, toLocal(xf, eW), toLocal(xf, wW));
      }
      // 頭（照姿勢轉）＋頭髮：髮尾再比上半身晚一格（follow-through）
      const neck = [0, tor.yl(tor.S), tor.S + 1.5];
      sh.xf = g.headR ? compose(xf, about(g.headR, neck)) : xf;
      sideHead(sh, P, tor.yl, tor.zc, g.face);
      // v6：四肢著地時長髮收短（塞到耳後／垂到肩為止），不擋住胸
      // 2026-10-13：仰躺（傳教士）長髮也收短——不然整束沿身體斜斜垂到床下面，像一根棍子
      const hdoll = (pose === 'sex_doggy' || pose === 'sex_missionary') && (doll.hair === 'long' || doll.hair === 'waist') ? { ...doll, hair: 'medium' } : doll;
      const Rh = g.headR ? mulR(R, g.headR) : R;
      // 2026-10-15：原本 sway 只加在左右（x），側面看不到 → 頭髮黏在頭上。改成頭在畫面上的前後／上下位置推彈簧，
      // 慢半拍甩、甩過頭再回來；世界位移換到頭的局部座標，髮尾最大。
      const [hsy, hsz] = hairSwing(doll, pose), HG = 1.5, cl = (v) => Math.max(-6.5, Math.min(6.5, v));
      const swing = mulT(Rh, [0, cl(hsy[fi] * HG), cl(hsz[fi] * HG)]);   // 輸入是世界座標 → 彈簧位移就是落後方向，不反號
      swing[1] = Math.min(swing[1], 1.2);   // 頭髮從後腦垂下：往臉／胸那邊只能甩一點，不然蓋住胸口
      hair(sh, P, hdoll, tor, g.sway ? 1.2 * g.sway : 0, mulT(Rh, [0, 0, -1]), true, swing);
      sh.xf = null;
      return { sh, P, xf, H };
    }
    /** 檢查用：這個體位一個循環的乳房位移（局部單位）。 */
    function sexBounceOf(doll, pose) {
      const P = proportions(doll), g = sexRig(P, pose, 0);
      return sexBounce(P, doll, g.axis, g.amp).slice();
    }
    /** 給偷看畫客人用：這一格她的骨盆世界座標、他的抽送深度 p。 */
    function sexAnchor(doll, pose, frame) {
      const P = proportions(doll), g = sexRig(P, pose, frame);
      const n = SEX_THRUST.length, i = ((frame % n) + n) % n;
      const xf = { R: g.R, t: (() => { const rp = mulV(g.R, [0, 0, P.hipz]); return [g.H[0] - rp[0], g.H[1] - rp[1], g.H[2] - rp[2]]; })() };
      const T = P.T, r = cupRadius(P, doll), zB = P.S - .35 * T - (r - 3.1) * .3;
      const chest = toWorld(xf, [0, 3.3 * F(P.b, 'chest') ** .5 + r * 1.1, zB]);
      const headW = toWorld(xf, [0, 0, P.zc]);
      return { hip: g.H.slice(), p: g.p, j: g.j, u: g.u, d: SEX_DEPTH[i], sway: g.sway || 0, fwd: g.fwd || 0, chest, head: headW, cupr: r,
        H: P.H, butt: 6.5 * F(P.b, 'butt'), hipW: 5.1 * F(P.b, 'hip') };
    }

    // -------------------------------------------------- 客人（2026-10-13）：跟她同一套 SDF＋側面投影畫的男人，取代 2D 圓柱棍子
    // M＝客人體型（escort_peek.js MAN_BUILDS：h 身高、w 軀幹粗、lm 四肢粗、belly 肚子、stoop 駝背、chest 胸肌、depth 退出幅度）。
    // 世界座標跟她一樣：+y＝往右（床尾）、z＝上、床面 z＝0、x＝側面視線方向（越大越靠鏡頭）。
    const MAN_RGB = [52, 86, 178], MAN_LINE_RGB = [24, 40, 100], MAN_HAIR_RGB = [26, 44, 108], MAN_A = 240;
    const norm2 = (v) => { const n = Math.hypot(v[0], v[1]) || 1; return [v[0] / n, v[1] / n]; };
    function manRig(doll, pose, frame, M) {
      const a = sexAnchor(doll, pose, frame), h = M.h || 1, hy = a.hip[1], hz = a.hip[2];
      const out = 9 * (1 - a.p) * (M.depth || 1), lean = 5 * (a.p - .5), bp = 3.5 * (M.belly || 0);
      const S = (x, y, z) => [x, y, z];
      if (pose === 'sex_missionary') {
        // 跪坐在她兩腿間：膝往前張開、墊在她屁股下，小腿往後收；上身直、雙手抓她大腿，頭往下看她
        const y0 = hy + 8 + bp * .6;
        return { pel: [y0 + out * 1.4, 9 + .8 * a.p], up: [3 - lean * .6, 30], front: [-1, 0], headR: rotX(-16),
          knee: (s) => S(s * 13, y0 - 12, 3), ankle: (s) => S(s * 9, y0 + 7, 2), toe: [0, 1, -.15],
          wrist: (s) => S(s * 9.5, hy + 13, 22 + 1.5 * a.j), epole: (s) => [s * .7, .6, -.5] };
      }
      if (pose === 'sex_doggy') {
        // 直跪在她後面：大腿直、小腿平貼床往後；雙手抓她兩邊屁股，頭低下來看
        const y0 = hy + 7 + bp * .5;
        return { pel: [y0 + out * 1.1, hz + 1 - (1 - h) * 4], up: [3 - lean * 1.2, 30], front: [-1, 0], headR: rotX(-22),
          knee: (s) => S(s * 7.5, y0 + 3, 3), ankle: (s) => S(s * 7, y0 + 3 + 24 * h, 2), toe: [0, 1, -.1],
          wrist: (s) => S(s * (a.hipW + 3), hy + 3, hz + 4), epole: (s) => [s * .9, .5, -.3] };
      }
      if (pose === 'sex_cowgirl') {
        // 仰躺（頭朝枕頭 −y）：她坐上來時骨盆被壓、她起來時往上頂一點；雙手扶她腰，頭抬起來看
        return { pel: [5, 6.5 + 1.6 * a.p * (M.depth || 1)], up: [-1, .06], front: [0, 1], headR: rotX(-26),
          knee: (s) => S(s * 8, 5 + 24 * h, 6.5), ankle: (s) => S(s * 7.5, 5 + 47 * h, 2.5), toe: [0, .25, 1],
          wrist: (s) => S(s * (a.hipW + 3.5), hy - 1, Math.max(14, hz + 1)), epole: (s) => [s * 1, .1, -1] };
      }
      if (pose === 'sex_reverse') {
        // 坐著、腿往前伸在她腿下；她背貼他胸口坐在腿上，他雙手從後面繞過來抓她的胸
        const y0 = 14 + bp * .4, bob = .6 * (a.j - .5), c = a.chest || [0, hy - 4, hz + 20];
        return { pel: [y0, 8], up: [-.6 + bob, 29], front: [-1, 0], headR: mulR(rotY(10), rotX(-14)),
          knee: (s) => S(s * 8.5, y0 - 24 * h, 7), ankle: (s) => S(s * 8, y0 - 47 * h, 2), toe: [0, -.25, 1],
          wrist: (s) => S(s * 5.6, c[1] + 1.5, c[2] - 1), epole: (s) => [s * 1, .4, -.5], palm: 1.25 };
      }
      // sex_kiss：坐著、腿往前；她面對面坐在腿上、腳繞到他背後。他雙手抱她的背，頭往另一側歪著吻
      const rock = 1.4 * (a.fwd || 0), y0 = 17 + bp * .4 + rock * .5;
      return { pel: [y0, 9], up: [-1 + rock * .5, 27], front: [-1, 0], headR: mulR(rotY(16), rotX(-10)),
        knee: (s) => S(s * 9, y0 - 22 * h, 7.5), ankle: (s) => S(s * 8, y0 - 46 * h, 2), toe: [0, -.2, 1],
        wrist: (s) => S(s * 7.5, hy - 5, 31), epole: (s) => [s * 1, .3, -.5] };
    }
    function buildMan(doll, pose, frame, M) {
      const g = manRig(doll, pose, frame, M), sh = makeShape();
      const h = M.h || 1, w = M.w || 1, lm = M.lm || 1, belly = M.belly || 0, stoop = M.stoop || 0, wd = 1 + (w - 1) * .8;
      const u = norm2(g.up), f0 = norm2(g.front), fd = f0[0] * u[0] + f0[1] * u[1], f = norm2([f0[0] - fd * u[0], f0[1] - fd * u[1]]);
      // 軀幹局部：原點＝骨盆、+z＝上身方向、+y＝胸口朝向
      const xf = { R: [1, 0, 0, 0, f[0], u[0], 0, f[1], u[1]], t: [0, g.pel[0], g.pel[1]] };
      const TL = 34 * h;
      sh.xf = xf;
      // 2026-10-15：骨盆／屁股左右收窄，她的臀肉在接觸點才露在他前面（撞擊時的壓扁、彈晃看得到）
      sh.ell(BODY, [0, -.5, 2], [6.8 * w, 5.8 * wd, 6.5]);                               // 骨盆
      for (const s of [-1, 1]) sh.ell(BODY, [s * 3.4 * w, -3.2, .5], [4.2 * w, 4.6 * wd, 5.6]);   // 屁股
      sh.ell(BODY, [0, 0, 12], [7.4 * w, 5.2 * wd, 9.5]);                                 // 腰腹
      sh.ell(BODY, [0, .3 + 1.2 * stoop, 23.5], [10.2 * w, 6.4 * wd + (M.chest ? 1.2 : 0), 9.8]);   // 胸廓
      if (M.chest) for (const s of [-1, 1]) sh.ell(BODY, [s * 4.6 * w, 5.4 * wd, 25.5], [5.2 * w, 2.6, 4.2]);   // 胸肌
      if (belly) sh.ell(BODY, [0, 3.5 + 5 * belly, 10.5], [(7 + 2 * belly) * w, 4 + 5 * belly, 8 + 2 * belly]);   // 肚子
      const shY = -.5 + 2.6 * stoop, shZ = TL - 1.5 - 1.5 * stoop;
      sh.cone(BODY, [-10.6 * w, shY, shZ], [10.6 * w, shY, shZ], 3.9 * w ** .5, 3.9 * w ** .5);   // 肩
      for (const s of [-1, 1]) sh.cone(BODY, [s * 4.2 * w, shY - .6, shZ + .4], [0, shY + .2, TL + 3], 3.4, 3.2);   // 斜方肌
      const neckB = [0, shY + .3, TL], neckT = [0, shY + 1 + 2.2 * stoop, TL + 6 - 1.2 * stoop];
      sh.cone(BODY, neckB, neckT, 3.5 * w ** .3, 3.1);
      sh.xf = compose(xf, about(g.headR || [1, 0, 0, 0, 1, 0, 0, 0, 1], neckT));
      sh.ell(BODY, [0, neckT[1] + .9, neckT[2] + 7.2], [5.8, 6.6, 7.9]);                  // 頭
      sh.ell(BODY, [0, neckT[1] + 3.4, neckT[2] + 2.6], [4.3, 4.0, 3.2]);                 // 下巴
      sh.ell(HAIR, [0, neckT[1] - .3, neckT[2] + 9.2], [6.3, 7.0, 6.4], { y0: neckT[1] + 1, zc: neckT[2] + 7.2, bang: 4.2, bottom: neckT[2] + 4.5, cut: null });   // 短髮
      sh.xf = null;
      const W = (l) => toWorld(xf, l);
      const Lt = 27 * h, Ls = 25 * h, Lu = 19 * h, Lf = 17 * h;
      for (const s of [-1, 1]) {
        // 2026-10-15：大腿根往內收（4.0）、上端細一點，不然從側面整片蓋住她被撞的臀部
        const hip = W([s * 4.0 * w, 0, 0]), knee = g.knee(s), ank = g.ankle(s);
        const mid = hip.map((v, i) => v + (knee[i] - v) * .45);
        sh.cone(BODY, hip, mid, 5.0 * lm, 4.9 * lm);
        sh.cone(BODY, mid, knee, 4.9 * lm, 3.5 * lm);
        const calf = knee.map((v, i) => v + (ank[i] - v) * .3);
        sh.cone(BODY, knee, calf, 3.4 * lm, 3.9 * lm);
        sh.cone(BODY, calf, ank, 3.9 * lm, 2.0 * lm ** .5);
        const t = g.toe, fl = 8 * h;
        sh.cone(BODY, ank, [ank[0] + t[0] * fl, ank[1] + t[1] * fl, ank[2] + t[2] * fl], 2.2, 1.5);
        const shj = W([s * 10.2 * w, shY, shZ - .5]), wr = g.wrist(s);
        const el = ik(shj, wr, Lu, Lf, g.epole(s));
        sh.cone(BODY, shj, el, 3.5 * lm, 2.6 * lm);
        sh.cone(BODY, el, wr, 2.7 * lm, 1.9 * lm);
        let d = [wr[0] - el[0], wr[1] - el[1], wr[2] - el[2]]; const n = hypot3(...d) || 1; d = d.map(v => v / n);
        const pl = g.palm || 1, tip = wr.map((v, i) => v + d[i] * 5 * pl);
        sh.cone(BODY, wr, tip, 2.3 * pl, 1.8 * pl);                                       // 手掌
      }
      return sh;
    }
    /** 客人一格（側面、跟她同一個畫布）：{width,height,anchor,pixels,depth}；depth 跟她的一樣（世界 x，越大越近）。 */
    function renderMan(doll, pose, frame, M = {}) {
      return renderSide(buildMan(doll, pose, frame, M), null, CANVAS.peek, MAN_PAL);
    }

    // ------------------------------------------------------------ render
    /** 回傳 {width,height,anchor,pixels:Uint8ClampedArray,depth:Float32Array(-Infinity=空)}。 */
    function render(doll, pose = 'idle', frame = 0, yaw = 0, opts = {}) {
      const cv = CANVAS[(POSES[pose] && POSES[pose].canvas) || 'std'];
      const width = cv.w, height = cv.h, ax = cv.ax, ay = cv.ay;
      const { sh, P } = build(doll, pose, frame, yaw, opts);
      if (cv.side) return renderSide(sh, P, cv);
      const prims = sh.prims, np = prims.length;
      // world-space bounding spheres (primitive offsets folded in)
      const bcx = new Float64Array(np), bcy = new Float64Array(np), bcz = new Float64Array(np), brr = new Float64Array(np), pm = new Uint8Array(np), pb = new Uint8Array(np);
      let mnx = 1e9, mny = 1e9, mnz = 1e9, mxx = -1e9, mxy = -1e9, mxz = -1e9;
      for (let i = 0; i < np; i++) {
        const p = prims[i];
        let q = [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
        if (p.xf) { const w = mulV(p.xf.R, q); q = [w[0] + p.xf.t[0], w[1] + p.xf.t[1], w[2] + p.xf.t[2]]; }
        bcx[i] = q[0]; bcy[i] = q[1]; bcz[i] = q[2]; brr[i] = p.br; pm[i] = p.mat; pb[i] = p.cloth ? 4 + p.cloth : p.nip ? p.nip + 1 : p.bust ? 1 : 0;
        mnx = Math.min(mnx, bcx[i] - brr[i]); mxx = Math.max(mxx, bcx[i] + brr[i]);
        mny = Math.min(mny, bcy[i] - brr[i]); mxy = Math.max(mxy, bcy[i] + brr[i]);
        mnz = Math.min(mnz, bcz[i] - brr[i]); mxz = Math.max(mxz, bcz[i] + brr[i]);
      }
      const gcx = (mnx + mxx) / 2, gcy = (mny + mxy) / 2, gcz = (mnz + mxz) / 2;
      const gr = hypot3(mxx - gcx, mxy - gcy, mxz - gcz) + .5;
      const th = yaw * Math.PI / 180, c = Math.cos(th), s = Math.sin(th), gw = GIRTH;
      const dX = -2 * s / gw, dY = 2 * c / gw, dZ = 0, dd = dX * dX + dY * dY + dZ * dZ;
      const n = width * height;
      const hit = new Uint8Array(n), mat = new Uint8Array(n), tt = new Float64Array(n).fill(-1e9), bust = new Uint8Array(n);
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
          let t = Math.min(cv.tMax, (-bq + sq) / (2 * dd));
          const tEnd = Math.max(cv.tMin, (-bq - sq) / (2 * dd));
          const idx = py * width + px;
          for (let it = 0; it < 220 && t >= tEnd; it++) {
            const X = (sx * c - 2 * t * s) / gw, Y = (sx * s + 2 * t * c) / gw, Z = -sy;
            dist[0] = dist[1] = dist[2] = 1e3;
            let bb = 0;
            for (let i = 0; i < np; i++) {
              const m = pm[i], lb = hypot3(X - bcx[i], Y - bcy[i], Z - bcz[i]) - brr[i];
              if (lb >= dist[m]) continue;
              const d = primDist(prims[i], X, Y, Z);
              if (d < dist[m]) { dist[m] = d; if (m === 0) bb = pb[i]; }
            }
            const d = Math.min(dist[0], dist[1], dist[2]);
            if (d < .05) {
              hit[idx] = 1; tt[idx] = t;
              let mm = dist[1] < dist[0] + .15 ? 2 : 1;
              if (dist[2] < .05 && dist[1] > .05) mm = 3;
              mat[idx] = mm; bust[idx] = mm === 1 ? bb : 0;
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
          if (bust[i] >= 5) { const cb = bust[i]; set(i, cb === 6 ? TRIM_RGB : cb === 7 ? CHAIN_RGB : cb === 8 ? (near ? WEIGHT_LO_RGB : WEIGHT_RGB) : near ? CLOTH_LO_RGB : CLOTH_RGB, CLOTH_A); if (hit[i]) depth[i] = (2 * tt[i] + (tt[i] - (y + .5 - ay))) / 32; continue; }
          set(i, bust[i] === 3 ? NIP_RGB : bust[i] === 2 ? AREOLA_RGB : near ? LINE_RGB : bustEdge(bust, hit, tt, i, x, y, width, height, BUST_DEPTH) ? BUST_RGB : BODY_RGB, BODY_A);
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
    /** 側面正交投影（接客偷看）：視線沿 −x，螢幕 x＝ax＋y·scale、螢幕 y＝ay−z·scale。深度＝x（越大越近）。 */
    function renderSide(sh, P, cv, pal = SIDE_PAL) {
      const bodyRGB = pal.body, lineRGB = pal.line, bodyA = pal.a, hairRGB = pal.hair, hairHi = pal.hairHi, bustRGB = pal.bust;
      const width = cv.w, height = cv.h, ax = cv.ax, ay = cv.ay, k = cv.scale;
      const prims = sh.prims, np = prims.length;
      const wb = prims.map(p => { let q = [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]]; if (p.xf) { const w = mulV(p.xf.R, q); q = [w[0] + p.xf.t[0], w[1] + p.xf.t[1], w[2] + p.xf.t[2]]; } return q; });
      let xmax = -1e9, xmin = 1e9;
      for (let i = 0; i < np; i++) { xmax = Math.max(xmax, wb[i][0] + prims[i].br); xmin = Math.min(xmin, wb[i][0] - prims[i].br); }
      const n = width * height, hit = new Uint8Array(n), mat = new Uint8Array(n), tt = new Float64Array(n).fill(-1e9), bust = new Uint8Array(n), flat = new Uint8Array(n);
      const dist = [0, 0, 0];
      for (let py = 0; py < height; py++) {
        const Z = (ay - py - .5) / k;
        for (let px = 0; px < width; px++) {
          const Y = (px + .5 - ax) / k;
          const cand = [];
          for (let i = 0; i < np; i++) { const r = prims[i].br, dy = Y - wb[i][1], dz = Z - wb[i][2]; if (dy * dy + dz * dz < r * r) cand.push(i); }
          if (!cand.length) continue;
          const idx = py * width + px;
          let X = xmax;
          for (let it = 0; it < 160 && X >= xmin; it++) {
            dist[0] = dist[1] = dist[2] = 1e3;
            let bb = 0, fl = 0;
            for (const i of cand) { const m = prims[i].mat, d = primDist(prims[i], X, Y, Z); if (d < dist[m]) { dist[m] = d; if (m === 0) { bb = prims[i].bust ? 1 : 0; fl = prims[i].flat ? 1 : 0; } } }
            const d = Math.min(dist[0], dist[1], dist[2]);
            if (d < .05) { hit[idx] = 1; tt[idx] = X; let mm = dist[1] < dist[0] + .15 ? 2 : 1; if (dist[2] < .05 && dist[1] > .05) mm = 3; mat[idx] = mm; bust[idx] = mm === 1 ? bb : 0; flat[idx] = mm === 1 ? fl : 0; break; }
            X -= Math.max(d, .08) * .9;
          }
        }
      }
      const pixels = new Uint8ClampedArray(n * 4), depth = new Float32Array(n).fill(-Infinity), tone = new Uint8Array(n);   // tone：0＝不是明暗格、1 暗／2 中／3 亮
      const set = (i, rgb, a) => { pixels[i * 4] = rgb[0]; pixels[i * 4 + 1] = rgb[1]; pixels[i * 4 + 2] = rgb[2]; pixels[i * 4 + 3] = a; };
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x;
        if (!hit[i]) continue;
        if (mat[i] === 2) { const up = y > 0 && hit[i - width] && mat[i - width] === 2; set(i, up ? hairRGB : hairHi, HAIR_A); }
        else if (mat[i] === 3) set(i, MARK_RGB, BODY_A);
        else {
          let near = false;
          for (const j of [i - width, i + width, i - 1, i + 1]) if (j >= 0 && j < n && hit[j] && tt[j] > tt[i] + 3.5 && !(flat[i] && flat[j])) { near = true; break; }
          if (flat[i] && !near) { tone[i] = 2; pixels[i * 4 + 3] = bodyA; }
          else if (near) set(i, lineRGB, bodyA);
          else if (bustEdge(bust, hit, tt, i, x, y, width, height, BUST_DEPTH)) set(i, bustRGB, bodyA);
          else { tone[i] = pal.flat ? 2 : sideTone(hit, mat, tt, i, x, y, width, height, k); pixels[i * 4 + 3] = bodyA; }
        }
        depth[i] = tt[i];
      }
      // 去雜點：一格跟上下左右（有明暗的）都不同階、而且鄰居多數同一階 → 併過去
      const tn = tone.slice(), TONES = [null, pal.lo, pal.body, pal.hi];
      for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
        const i = y * width + x; if (!tone[i]) continue;
        const cnt = [0, 0, 0, 0]; let m = 0;
        for (const j of [x > 0 ? i - 1 : -1, x < width - 1 ? i + 1 : -1, y > 0 ? i - width : -1, y < height - 1 ? i + width : -1]) if (j >= 0 && tone[j]) { cnt[tone[j]]++; m++; }
        if (m >= 3 && !cnt[tone[i]]) tn[i] = cnt.indexOf(Math.max(...cnt));
      }
      for (let i = 0; i < n; i++) if (tn[i]) { const c = TONES[tn[i]]; pixels[i * 4] = c[0]; pixels[i * 4 + 1] = c[1]; pixels[i * 4 + 2] = c[2]; }
      return { width, height, anchor: { x: ax, y: ay }, pixels, depth, scale: k };
    }
    // 2026-10-13：偷看側面的她改亮一點＋三階明暗（燈在左上前方），黑影疊黑影看不出形體
    // 2026-10-15：紫灰影子 → 暖燈下的膚色（使用者：太假）
    const SIDE_PAL = { body: [170, 118, 108], hi: [212, 158, 138], lo: [116, 76, 80], line: [70, 40, 48], hair: [38, 26, 34], hairHi: [76, 54, 62],
      bust: [226, 176, 156], a: 236, flat: true };   // flat：身體也平塗（使用者），只留前後重疊的分界線和乳房弧線
    const MAN_PAL = { body: [52, 86, 178], hi: [86, 124, 216], lo: [34, 58, 132], line: [22, 36, 96], hair: [26, 44, 108], hairHi: [26, 44, 108],
      bust: [52, 86, 178], a: 240 };
    const LIGHT = (() => { const v = [.55, -.55, .65], n = Math.hypot(...v); return v.map(c => c / n); })();
    /** 側面一格的明暗：用深度圖（世界 x）估法線，跟燈的方向做 Lambert，切成亮／中／暗三階。 */
    function sideTone(hit, mat, tt, i, x, y, w, h, k) {
      const d = (j) => (j >= 0 && hit[j] && mat[j] === 1 && Math.abs(tt[j] - tt[i]) < 2.5 ? tt[j] : null);
      const l = x > 0 ? d(i - 1) : null, r = x < w - 1 ? d(i + 1) : null, u = y > 0 ? d(i - w) : null, dn = y < h - 1 ? d(i + w) : null;
      const gy = l !== null && r !== null ? (r - l) / 2 : l !== null ? tt[i] - l : r !== null ? r - tt[i] : 0;
      const gz = u !== null && dn !== null ? (u - dn) / 2 : u !== null ? u - tt[i] : dn !== null ? tt[i] - dn : 0;
      const nx = 1, ny = -gy * k, nz = -gz * k, nn = Math.hypot(nx, ny, nz);
      const lam = (nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]) / nn;
      return lam > .8 ? 3 : lam < .3 ? 1 : 2;
    }
    /** 乳房邊緣：這格是乳房，旁邊是身體（比它遠 ≥ thr）或外面 → 描線。 */
    function bustEdge(bust, hit, tt, i, x, y, w, h, thr) {
      if (!bust[i]) return false;
      // 上緣（往胸口接上去那邊）不描，只描下緣弧線和外側，不然正面看像穿了胸罩
      for (const [nx, ny, up] of [[x, y - 1, 1], [x, y + 1, 0], [x - 1, y, 0], [x + 1, y, 0]]) {
        if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
        const j = ny * w + nx;
        if (!hit[j]) return true;
        if (!up && !bust[j] && tt[j] < tt[i] - thr) return true;
      }
      return false;
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
    return { CLOTHES, TRIM_RGB, CHAIN_RGB, WEIGHT_RGB, WEIGHT_LO_RGB, CLOTH_RGB, CLOTH_LO_RGB, CLOTH_A, SEX_DEPTH, W, H_CANVAS, ANCHOR, BODY_RGB, HAIR_RGB, HAIR_HI_RGB, LINE_RGB, MARK_RGB, BODY_A, HAIR_A, CUP_R, CUP_BOUNCE,
      BUILDS, BUILD_SPRING, SPRING, HAIRS, HAIR_MAP, WALK_FRAMES, WALK_FPS, DEFAULT, SEAT_YAW, POSES, CANVAS,
      SEX_THRUST, SEX_FRAME_MS, HER_J, SEX_POSES, PEEK_BED_Z, sexAnchor, sexBounceOf, renderMan, MAN_RGB, MAN_LINE_RGB, BUST_RGB, SIDE_PAL, MAN_PAL,
      lookToDoll, dollKey, hairStyle, BACK_HAIRS, FRONT_HAIRS, skirtOf, proportions, cupRadius, bounceCurve, bounceAt, build, render, mirror };
  }
  const api = factory();
  api.factorySource = factory.toString();
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.RoomDoll = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
