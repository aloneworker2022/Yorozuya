// 2026-11-03 拆部位出圖（只出 2×）：每個部位一張原始資料 sheet（格式見 parts_shade.js），前端疊好再上色。
//   parts2x/<pose>/<body>_<part>_<dir>.png            head／chest／waist／hips／torso／armL／armR／legs：只跟體型變
//   parts2x/<pose>/breast/<body>_<shape>_<cup>_<areola>_<dir>.png   乳房（胸型 round／bell／pendulous／sup＝穿胸罩托高 × 罩杯 × 乳暈；乳暈已烤進去）
// 臉型一律動漫臉（doll.face='anime'）。走路：每張 8 格橫排（同 sheets2x 走路 sheet，每格 128×280）。
// 坐姿（POSE=sit_m|sit_v）：每張＝8 方向橫排（front, front_right, right, back_right, back, back_left, left, front_left；每格 300×168），檔名沒有 _<dir>（同 sheets2x/<pose>/）。
// 用法：node render_parts.cjs [BODY=balanced] [ONLY=base|breast] [SHAPES=round,...] [CUPS=D,...] [AREOLAS=medium,...] [DIRS=front,...]
//       SHARD=i NSHARD=n 平行；FORCE=1 重畫已存在的檔；CHECK=1 只驗證（疊回去 vs 整張渲染）不寫檔
const D = require(__dirname + '/room_doll_full.js'), PS = require(__dirname + '/parts_shade.js'), png = require(__dirname + '/png.cjs'), fs = require('fs');
const K = 2, POSE = process.env.POSE || 'walk', SITP = POSE !== 'walk', FW = (SITP ? 150 : 64) * K, FH = (SITP ? 84 : 140) * K, O = __dirname + '/parts2x/' + POSE;
const SIT = [0, 45, 90, 135, 180, -135, -90, -45];
const BODY = { balanced: { height_cm: 161, build: '勻稱有致', hair: '中分長髮' }, slim: { height_cm: 166, build: '纖細苗條', hair: '短髮' }, petite: { height_cm: 150, build: '嬌小玲瓏', hair: '雙馬尾' }, curvy: { height_cm: 163, build: '微肉圓潤', hair: '大波浪長髮' } };
const DIR = { front: 0, front_right: 45, right: 90, back_right: 135, back: 180, back_left: -135, left: -90, front_left: -45 };
const env = (k, def) => process.env[k] ? process.env[k].split(',') : def;
const BODIES = env('BODY', Object.keys(BODY)), SHAPES = env('SHAPES', ['round', 'bell', 'pendulous', 'sup']), CUPS = env('CUPS', 'ABCDEFGH'.split('')), ARS = env('AREOLAS', ['small', 'medium', 'large', 'huge']), DIRS = env('DIRS', Object.keys(DIR));
const BASE = ['head', 'chest', 'waist', 'hips', 'torso', 'armL', 'armR', 'legs'];
const ONLY = process.env.ONLY, SHARD = +(process.env.SHARD || 0), NSH = +(process.env.NSHARD || 1), FORCE = !!process.env.FORCE, CHECK = !!process.env.CHECK;
const NF = (D.POSES[POSE] && D.POSES[POSE].frames) || 8;
const mk = (b, shape = 'round', cup = 'D', ar = 'medium') => { const x = D.lookToDoll({ ...BODY[b], cup: cup + ' 罩杯' }); x.shape = shape === 'sup' ? 'round' : shape; x.braSupport = shape === 'sup'; x.areola = ar; x.hair = 'none'; x.face = 'anime'; return x; };
const frame = (doll, part, f, yaw) => PS.encode(D.render(doll, POSE, f, yaw, { scale: K, parts: [part], gbuf: true, bakeStamps: part === 'breast' }));
function sheet(doll, part, yaw) {   // 走路：8 格；坐姿：8 方向（yaw 不用）
  const S = { width: FW * 8, height: FH, pixels: new Uint8ClampedArray(FW * 8 * FH * 4) };
  for (let f = 0; f < 8; f++) { const px = SITP ? frame(doll, part, 0, SIT[f]) : frame(doll, part, f % NF, yaw); for (let y = 0; y < FH; y++) S.pixels.set(px.subarray(y * FW * 4, (y + 1) * FW * 4), (y * FW * 8 + f * FW) * 4); }
  return S;
}
if (CHECK) {   // 驗證：各部位原始資料（經過 16 位元深度量化）疊回去上色 vs 整張 render()
  let tot = 0, diff = 0;
  for (const b of BODIES) for (const sh of SHAPES) for (const c of CUPS) for (const a of ARS) for (const d of DIRS) for (const f of SITP ? [0] : [0, 3, 5]) {
    const doll = mk(b, sh, c, a), n = FW * FH;
    const G = PS.merge([...BASE, 'breast'].map(p => frame(doll, p, f, DIR[d])), n), px = PS.shade(G, FW, FH), ref = D.render(doll, POSE, f, DIR[d], { scale: K }).pixels;
    let dd = 0; for (let i = 0; i < n * 4; i += 4) if (px[i + 3] || ref[i + 3]) { tot++; if (!px[i + 3] !== !ref[i + 3] || px[i] !== ref[i] || px[i + 1] !== ref[i + 1] || px[i + 2] !== ref[i + 2]) { diff++; dd++; } }
    if (process.env.V) console.log(b, sh, c, a, d, f, dd);
  }
  console.log('check', POSE, 'px', tot, 'diff', diff, (diff / tot * 100).toFixed(3) + '%');
  process.exit(0);
}
fs.mkdirSync(O + '/breast', { recursive: true });
const jobs = [];
for (const b of BODIES) for (const d of SITP ? [''] : DIRS) {
  const sf = SITP ? '.png' : `_${d}.png`;
  if (!ONLY || ONLY === 'base') for (const p of BASE) jobs.push([`/${b}_${p}${sf}`, () => sheet(mk(b), p, DIR[d])]);
  if (!ONLY || ONLY === 'breast') for (const sh of SHAPES) for (const c of CUPS) for (const a of ARS) jobs.push([`/breast/${b}_${sh}_${c}_${a}${sf}`, () => sheet(mk(b, sh, c, a), 'breast', DIR[d])]);
}
let n = 0, sk = 0;
jobs.forEach(([p, f], ji) => {
  if (ji % NSH !== SHARD) return;
  if (!FORCE && fs.existsSync(O + p)) { sk++; return; }
  png(f(), 1, O + p); if (++n % 50 === 0) console.log('shard', SHARD, n);
});
console.log('parts', POSE, 'shard', SHARD, 'rendered', n, 'skipped', sk, 'of', jobs.length);
