// 2026-11-03 近景（樣品）：玩家站在她面前約 0.6 格時看到的樣子，用透視攝影機（render opts.cam）重畫，不再拿遠景 sheet 放大。
// 每格 CW×CH（K＝1＝遊戲畫布 320×240 的像素密度；0.6 格時平視＝胸部以上），畫全身（低頭也看得到腳）。
// 輸出 sheets_close/ 底下跟 sheets2x 相同的相對路徑（身體、頭髮、衣服、臉部標記），play.html 近距離時改用這套。
// 用法：node render_close.cjs  [BODY=balanced] [SHAPE=round] [CUP=D] [AR=medium] [DIRS=front,...] [BH=wavy,...] [FH=curtain,...] [CL=napkin_bell] [SHARD=i NSHARD=n]
const D = require(__dirname + '/room_doll_full.js'), png = require(__dirname + '/png.cjs'), fs = require('fs'), path = require('path');
const CELL = 126 / 1.15;   // play.html：走路 sheet 地面以上 126 單位＝1.15 格
const D0 = +(process.env.D0 || .6), CW = 240, CH = 480;
const CAM = { dist: D0 * CELL, eyeZ: .95 * CELL, pitch: 0, f: 240, w: CW, h: CH, cx: CW / 2, cy: 20 };   // f＝SH（play.html 1 格遠＝SH 像素）；cy＝玩家眼睛高（地平線）在第幾列
const O = __dirname + '/sheets_close';
const BODY = { balanced: { height_cm: 161, build: '勻稱有致', hair: '中分長髮' }, slim: { height_cm: 166, build: '纖細苗條', hair: '短髮' }, petite: { height_cm: 150, build: '嬌小玲瓏', hair: '雙馬尾' }, curvy: { height_cm: 163, build: '微肉圓潤', hair: '大波浪長髮' } };
const DIR = { front: 0, front_right: 45, right: 90, back_right: 135, back: 180, back_left: -135, left: -90, front_left: -45 };
const env = (k, def) => process.env[k] ? process.env[k].split(',') : def;
const B = env('BODY', ['balanced'])[0], SHAPE = process.env.SHAPE || 'round', CUP = process.env.CUP || 'D', AR = process.env.AR || 'medium';
const DIRS = env('DIRS', Object.keys(DIR)), BHS = env('BH', ['wavy']), FHS = env('FH', ['curtain']), CLS = env('CL', ['napkin_bell']);
const SHARD = +(process.env.SHARD || 0), NSH = +(process.env.NSHARD || 1);
const FACE = [['nose', 'small', [D.NOSE_RGB, D.NOSE_LO_RGB], 'nose_small'], ['mouth', 'line', [D.MOUTH_RGB, D.MOUTH_LO_RGB, D.LIPLO_RGB, D.LIPLO_LO_RGB], 'mouth'], ['brows', 'natural', [D.BROW_RGB, D.BROW_LO_RGB], 'brows']];
const mk = (o = {}) => { const x = D.lookToDoll({ ...BODY[B], cup: CUP + ' 罩杯' }); x.shape = SHAPE; x.areola = AR; x.face = 'anime'; if (!o.backHair && !o.frontHair) x.hair = 'none'; Object.assign(x, o); return x; };
const R = (doll, f, yaw) => D.render(doll, 'walk', f, yaw, { scale: 1, cam: CAM });
const isA = (q, i) => q[i + 3] === D.CLOTH_A;
const cols = list => (q, i) => q[i + 3] === D.CLOTH_A && list.some(c => q[i] === c[0] && q[i + 1] === c[1] && q[i + 2] === c[2]);
const all = (q, i) => q[i + 3] > 0;

// 工作：每個方向一個單位（8 格）
const jobs = DIRS.map(d => d);
let n = 0;
jobs.forEach((d, ji) => {
  if (ji % NSH !== SHARD) return;
  const yaw = DIR[d], outs = {};
  const put = (p, i, px, keep) => { const S = outs[p] || (outs[p] = { width: CW * 8, height: CH, pixels: new Uint8ClampedArray(CW * 8 * CH * 4) }); for (let y = 0; y < CH; y++) for (let x = 0; x < CW; x++) { const si = (y * CW + x) * 4; if (keep(px, si)) S.pixels.set(px.subarray(si, si + 4), (y * CW * 8 + i * CW + x) * 4); } };
  for (let f = 0; f < 8; f++) {
    put(`/${B}_${SHAPE}_${CUP}_${AR}_${d}.png`, f, R(mk(), f, yaw).pixels, all);
    for (const st of BHS) put(`/hair/${B}_back_${st}_${d}.png`, f, D.renderHairLayer(mk({ backHair: st, frontHair: null }), 'walk', f, yaw, { scale: 1, cam: CAM }).pixels, all);
    for (const st of FHS) put(`/hair/${B}_front_${st}_${d}.png`, f, D.renderHairLayer(mk({ backHair: null, frontHair: st }), 'walk', f, yaw, { scale: 1, cam: CAM }).pixels, all);
    for (const cl of CLS) put(`/cloth/${B}_${SHAPE}_${CUP}_${cl}_${d}.png`, f, R(mk({ cloth: cl }), f, yaw).pixels, isA);
    for (const [k, st, c, name] of FACE) put(`/face/${B}_${name}_${d}.png`, f, R(mk({ [k]: st }), f, yaw).pixels, cols(c));
  }
  for (const [p, S] of Object.entries(outs)) { fs.mkdirSync(path.dirname(O + p), { recursive: true }); png(S, 1, O + p); }
  console.log('close', d, 'done'); n++;
});
console.log('close shard', SHARD, 'units', n, 'of', jobs.length, 'CAM', JSON.stringify(CAM));
