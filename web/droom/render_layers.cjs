// 2026-11-03 圖層重出（2×、動漫臉、新肩頸）：衣服／托高衣服／頭髮／下身／臉部，輸出到 sheets2x 原本的路徑（前端不用改路徑）。
// 加速做法（拆部位）：每個 體型×方向×格 只算一次身體各部位原始資料（gbuf），乳房依 胸型×罩杯 快取；
//   衣服／下身／臉部標記＝只算 over 零件 → 跟身體疊（每格取最近）→ render(gbufIn) 上色 → 只留該圖層的像素；
//   頭髮＝只算頭髮零件，跟 H 罩杯 圓形／鐘型／下垂／托高 四種身體比遠近（同 renderHairLayer：四種都在前面＝一定蓋上，其餘＝可能被擋 alpha 214）；
//   私處「打開」（會在身體挖洞）照舊整張畫。
// 用法：node render_layers.cjs  [POSES=walk,sit_m,sit_v] [BODY=balanced,...] [DIRS=front,...（走路）] [ONLY=cloth,supcloth,hair,groin,face]
//       SHARD=i NSHARD=n（以 姿勢×體型×方向 為單位分）；TEST=1 只比對（跟舊做法整張畫的結果）不寫檔
const D = require(__dirname + '/room_doll_full.js'), png = require(__dirname + '/png.cjs'), fs = require('fs'), path = require('path');
const K = 2, O = __dirname + '/sheets2x';
const BODY = { balanced: { height_cm: 161, build: '勻稱有致', hair: '中分長髮' }, slim: { height_cm: 166, build: '纖細苗條', hair: '短髮' }, petite: { height_cm: 150, build: '嬌小玲瓏', hair: '雙馬尾' }, curvy: { height_cm: 163, build: '微肉圓潤', hair: '大波浪長髮' } };
const DIR = { front: 0, front_right: 45, right: 90, back_right: 135, back: 180, back_left: -135, left: -90, front_left: -45 }, SIT = [0, 45, 90, 135, 180, -135, -90, -45];
const env = (k, def) => process.env[k] ? process.env[k].split(',') : def;
const POSES = env('POSES', ['walk', 'sit_m', 'sit_v']), BODIES = env('BODY', Object.keys(BODY)), DIRS = env('DIRS', Object.keys(DIR));
const on = k => !process.env.ONLY || process.env.ONLY.split(',').includes(k);
const SHARD = +(process.env.SHARD || 0), NSH = +(process.env.NSHARD || 1), TEST = !!process.env.TEST;
const SHAPES = ['round', 'bell', 'pendulous'], CUPS = 'ABCDEFGH'.split(''), SUPCL = ['bra', 'tee', 'napkin_bell', 'napkin_jade'];
const BASE = ['head', 'chest', 'waist', 'hips', 'torso', 'armL', 'armR', 'legs'];
const FACE = [['blindfold', D.BLINDS, [D.BLIND_RGB, D.BLIND_LO_RGB], true], ['nose', D.NOSES, [D.NOSE_RGB, D.NOSE_LO_RGB], true], ['mouth', ['line'], [D.MOUTH_RGB, D.MOUTH_LO_RGB, D.LIPLO_RGB, D.LIPLO_LO_RGB], false], ['brows', ['natural'], [D.BROW_RGB, D.BROW_LO_RGB], false]];
const GROIN = [...D.PUBICS.map(s => ['pubic', s]), ...D.LABIAS.map(s => ['labia', s]), ...D.PANTS.map(s => ['pants', s])];

// mk：頭髮圖層同舊腳本，hair 保留 lookToDoll 的值（由 backHair／frontHair 決定畫哪一層），其他一律 hair='none'
const mk = (b, o = {}) => { const x = D.lookToDoll({ ...BODY[b], cup: (o.cup || 'D') + ' 罩杯' }); x.shape = o.shape || 'round'; x.braSupport = !!o.sup; x.areola = 'medium'; if (o.backHair === undefined && o.frontHair === undefined) x.hair = 'none'; x.face = 'anime'; for (const k of ['cloth', 'backHair', 'frontHair', 'pubic', 'labia', 'pants', 'blindfold', 'nose', 'mouth', 'brows']) if (o[k] !== undefined) x[k] = o[k]; return x; };
function gmerge(list, tol = 0) {   // 每格取最近（同 renderComposite）
  const n = list[0].hit.length, G = { hit: new Uint8Array(n), mat: new Uint8Array(n), tt: new Float64Array(n).fill(-1e9), bust: new Uint8Array(n), limb: new Uint8Array(n) };
  for (const b of list) for (let i = 0; i < n; i++) if (b.hit[i] && (!G.hit[i] || b.tt[i] > G.tt[i])) { G.hit[i] = 1; G.tt[i] = b.tt[i]; G.mat[i] = b.mat[i]; G.bust[i] = b.bust[i]; G.limb[i] = b.limb[i]; }
  return G;
}
// 一個單位（姿勢×體型×方向）：走路＝8 格；坐姿＝1 格×8 方向（每「格」是一個方向）
function unit(pose, b, dir) {
  const walk = pose === 'walk', FW = walk ? 64 * K : 150 * K, FH = walk ? 140 * K : 84 * K;
  const frames = walk ? [...Array(8)].map((_, i) => [i % ((D.POSES.walk && D.POSES.walk.frames) || 8), DIR[dir]]) : SIT.map(y => [0, y]);
  const sfx = walk ? `_${dir}.png` : '.png', pre = walk ? O + '/' : `${O}/${pose}/`;
  const outs = {};   // path → sheet
  const put = (p, i, px, keep) => { const S = outs[p] || (outs[p] = { width: FW * 8, height: FH, pixels: new Uint8ClampedArray(FW * 8 * FH * 4) }); for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const si = (y * FW + x) * 4; if (keep(px, si)) S.pixels.set(px.subarray(si, si + 4), (y * FW * 8 + i * FW + x) * 4); } };
  const isA = (q, i) => q[i + 3] === D.CLOTH_A;
  frames.forEach(([f, yaw], i) => {
    const R = (doll, o) => D.render(doll, pose, f, yaw, { scale: K, ...o });
    const base = BASE.map(p => R(mk(b), { parts: [p], gbuf: true })), bc = {};
    const breast = (shape, cup, sup) => bc[shape + cup + sup] || (bc[shape + cup + sup] = R(mk(b, { shape, cup, sup }), { parts: ['breast'], gbuf: true }));
    const bodyG = (shape, cup, sup) => gmerge([...base, breast(shape, cup, sup)]);
    const overlay = (o, keep, needBody) => {   // over 零件疊在身體上上色，只留 keep 的像素；needBody：只留身體剪影裡的（下身）
      const doll = mk(b, o), G0 = bodyG(o.shape || 'round', o.cup || 'D', !!o.sup), ov = R(doll, { parts: ['over'], gbuf: true });
      const px = R(doll, { gbufIn: gmerge([G0, ov]) }).pixels;
      if (!needBody) return [px, keep];
      const bp = R(mk(b, { shape: o.shape, cup: o.cup, sup: o.sup }), { gbufIn: G0 }).pixels;
      return [px, (q, j) => keep(q, j) && bp[j + 3] > 0];
    };
    if (walk && on('cloth')) for (const sh of SHAPES) for (const c of CUPS) for (const cl of D.CLOTHES) { const [px, k] = overlay({ shape: sh, cup: c, cloth: cl }, isA); put(`${pre}cloth/${b}_${sh}_${c}_${cl}${sfx}`, i, px, k); }
    if (walk && on('supcloth')) for (const c of CUPS) for (const cl of SUPCL) { const [px, k] = overlay({ cup: c, sup: true, cloth: cl }, isA); put(`${pre}sup/cloth/${b}_sup_${c}_${cl}${sfx}`, i, px, k); }
    if (on('face')) for (const [it, list, cols, styled] of FACE) for (const st of list) {
      const [px, k] = overlay({ [it]: st }, (q, j) => q[j + 3] === D.CLOTH_A && cols.some(c => q[j] === c[0] && q[j + 1] === c[1] && q[j + 2] === c[2]));
      put(`${pre}face/${b}_${it}${styled ? '_' + st : ''}${sfx}`, i, px, k);
    }
    if (on('groin')) for (const [kk, st] of GROIN) {
      const p = `${pre}groin/${b}_${kk}_${st}${sfx}`;
      if (st.endsWith('_open')) {   // 挖洞：整張畫（同舊做法：有下身 vs 沒下身，只留下身標記且在身體剪影裡）
        const px = R(mk(b, { [kk]: st })).pixels, g = R(mk(b)).pixels;
        put(p, i, px, (q, j) => q[j + 3] === D.CLOTH_A && g[j + 3] > 0);
      } else { const [px, k] = overlay({ [kk]: st }, isA, true); put(p, i, px, k); }
    }
    if (on('hair')) {
      const vars = [['round', 0], ['bell', 0], ['pendulous', 0], ['round', 1]].map(([s, u]) => bodyG(s, 'H', !!u));
      for (const [L, list] of [['back', D.BACK_HAIRS], ['front', D.FRONT_HAIRS]]) for (const st of list) {
        const o = { backHair: L === 'back' ? st : null, frontHair: L === 'front' ? st : null }, doll = mk(b, o);
        const solo = R(doll, { onlyMat: 1 }).pixels;   // 只有頭髮（HAIR＝1）
        const hv = [['round', 0], ['bell', 0], ['pendulous', 0], ['round', 1]].map(([s, u]) => R(mk(b, { ...o, shape: s, cup: 'H', sup: !!u }), { onlyMat: 1, gbuf: true }));
        const out = new Uint8ClampedArray(solo.length);
        for (let j = 0, n = 0; j < solo.length; j += 4, n++) {
          if (solo[j + 3] !== D.HAIR_A) continue;
          // 整張渲染時頭髮在身體表面 0.15 以內就算頭髮 → 深度給一點容許
          const front = vars.every((G, v) => hv[v].hit[n] && (!G.hit[n] || hv[v].tt[n] > G.tt[n] - .08));
          out[j] = solo[j]; out[j + 1] = solo[j + 1]; out[j + 2] = solo[j + 2]; out[j + 3] = front ? D.HAIR_A : D.HAIR_BACK_A;
        }
        put(`${pre}hair/${b}_${L}_${st}${sfx}`, i, out, (q, j) => q[j + 3] > 0);
      }
    }
  });
  return outs;
}
// 舊做法（整張畫）對照，TEST 用
function oldSheet(p, pose, b, dir) {
  const walk = pose === 'walk', FW = walk ? 64 * K : 150 * K, FH = walk ? 140 * K : 84 * K, frames = walk ? [...Array(8)].map((_, i) => [i, DIR[dir]]) : SIT.map(y => [0, y]);
  const nm = path.basename(p, '.png').replace(walk ? '_' + dir : '', '').split('_').slice(1);
  let doll, keep, nk = null, hair = false;
  if (p.includes('/sup/cloth/')) { doll = mk(b, { cup: nm[1], sup: true, cloth: nm.slice(2).join('_') }); keep = (q, j) => q[j + 3] === D.CLOTH_A; }
  else if (p.includes('/cloth/')) { doll = mk(b, { shape: nm[0], cup: nm[1], cloth: nm.slice(2).join('_') }); keep = (q, j) => q[j + 3] === D.CLOTH_A; }
  else if (p.includes('/hair/')) { doll = mk(b, { backHair: nm[0] === 'back' ? nm.slice(1).join('_') : null, frontHair: nm[0] === 'front' ? nm.slice(1).join('_') : null }); hair = true; keep = (q, j) => q[j + 3] > 0; }
  else if (p.includes('/groin/')) { doll = mk(b, { [nm[0]]: nm.slice(1).join('_') }); nk = mk(b); keep = (q, j) => q[j + 3] === D.CLOTH_A; }
  else { const it = FACE.find(f => f[0] === nm[0]); doll = mk(b, { [nm[0]]: nm[1] || it[1][0] }); keep = (q, j) => q[j + 3] === D.CLOTH_A && it[2].some(c => q[j] === c[0] && q[j + 1] === c[1] && q[j + 2] === c[2]); }
  const S = new Uint8ClampedArray(FW * 8 * FH * 4);
  frames.forEach(([f, yaw], i) => { const px = hair ? D.renderHairLayer(doll, pose, f, yaw, { scale: K }).pixels : D.render(doll, pose, f, yaw, { scale: K }).pixels, g = nk && D.render(nk, pose, f, yaw, { scale: K }).pixels;
    for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const si = (y * FW + x) * 4; if (keep(px, si) && (!g || g[si + 3])) S.set(px.subarray(si, si + 4), (y * FW * 8 + i * FW + x) * 4); } });
  return S;
}
const units = [];
for (const pose of POSES) for (const b of BODIES) { if (pose === 'walk') for (const d of DIRS) units.push([pose, b, d]); else units.push([pose, b, null]); }
let n = 0;
units.forEach(([pose, b, d], ui) => {
  if (ui % NSH !== SHARD) return;
  const t0 = Date.now(), outs = unit(pose, b, d);
  if (TEST) {
    for (const p of Object.keys(outs).filter((_, k) => k % +(process.env.TEST_EVERY || 1) === 0)) {
      const a = outs[p].pixels, r = oldSheet(p, pose, b, d); let tot = 0, df = 0;
      for (let j = 0; j < a.length; j += 4) if (a[j + 3] || r[j + 3]) { tot++; if (a[j] !== r[j] || a[j + 1] !== r[j + 1] || a[j + 2] !== r[j + 2] || a[j + 3] !== r[j + 3]) df++; }
      console.log(path.relative(O, p), 'px', tot, 'diff', df, tot ? (df / tot * 100).toFixed(2) + '%' : '');
    }
  } else for (const p in outs) { fs.mkdirSync(path.dirname(p), { recursive: true }); png(outs[p], 1, p); n++; }
  console.log('unit', pose, b, d || '', Object.keys(outs).length, 'sheets', ((Date.now() - t0) / 1000).toFixed(0) + 's');
});
if (!TEST) console.log('layers shard', SHARD, 'wrote', n);
