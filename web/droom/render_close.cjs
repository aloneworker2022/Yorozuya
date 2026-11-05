// 2026-11-03 近景（樣品）：玩家站在她面前約 0.6 格時看到的樣子，用透視攝影機（render opts.cam）重畫，不再拿遠景 sheet 放大。
// 每格 CW×CH（K＝1＝遊戲畫布 320×240 的像素密度；0.6 格時平視＝胸部以上），畫全身（低頭也看得到腳）。
// 輸出 sheets_close/ 底下跟 sheets2x 相同的相對路徑（身體、頭髮、衣服、臉部標記），play.html 近距離時改用這套。
// 2026-11-03 面對面（FACE=1）：解析度 2 倍（K＝2；使用者：調低一點，原本 3 倍），只出站姿 1 格（opts.stand：雙腳併攏、手垂下，不是走路第 0 格）；輸出 sheets_f2f/<view>/（路徑同 sheets2x，1 格寬）。VIEWS=p0,down 可限定。
//   p0 ＝碰撞點 0.4 格平視，每格 320×780（K＝1），第 130 列＝玩家眼睛高（往下畫到腳，捲上去時不會切掉）；play.html 讓它跟世界一起捲。
//   down（目前不用；使用者：只要靠近那一段，VIEWS=down 才出）＝低頭到一個角度後換的下一張（使用者實測：角度只要比平視再斜一點點、位置跟原本一樣、跟著視線上下移動）：攝影機跟 p0 同一點（0.4 格、玩家眼睛高），往下 DOWN 度（預設 20），320×530，第 150 列（往下到腳）＝視線方向。
//   FACE=1 node render_close.cjs
// 用法：node render_close.cjs  [BODY=balanced] [SHAPE=round] [CUP=D] [AR=medium] [DIRS=front,...] [BH=wavy,...] [FH=curtain,...] [CL=napkin_bell] [SHARD=i NSHARD=n]
const D = require(__dirname + '/room_doll_full.js'), png = require(__dirname + '/png.cjs'), fs = require('fs'), path = require('path');
const CELL = 126 / 1.15;   // play.html：走路 sheet 地面以上 126 單位＝1.15 格
const FACEV = !!process.env.FACE, D0 = +(process.env.D0 || (FACEV ? .28 : .6)), CW = FACEV ? 420 : 240, CH = FACEV ? 900 : 480, K = FACEV ? 2 : 1, NFR = FACEV ? 1 : 8;
const CAM0 = { dist: D0 * CELL, eyeZ: .95 * CELL, pitch: 0, f: FACEV ? 310 : 240, w: CW, h: CH, cx: CW / 2, cy: FACEV ? 130 : 20 };   // 2026-11-04 面對面：她再近一點（0.28 格）、再大一點（f 310≈×1.29），420×900 往下到腳（站姿）
   // f＝SH（play.html 1 格遠＝SH 像素）；近景 cy＝玩家眼睛高（地平線）在第幾列
const P0_PITCH = +(process.env.P0PITCH || 10);   // 2026-11-04 使用者：人物太斜，要更直立、像由上往下看一點 → 平視那張攝影機往下一點點（度）（PROJ=rect 才用）
// 2026-11-05 使用者：靠近時做錯了——應該臉正常、越往下越短，胸部往前凸（不是平視）、腳比較短（從上往下看進去）。
//   針孔（平面底片）往畫面下面會越拉越長 → p0 改用 cam.proj＝'look'（每一列＝低頭到那個角度時的正中間：俯角＝(列−cy)/f，角度等距），
//   不用再往下 10°（'look' 轉上下只是整張平移）；cy＝80＝玩家眼睛高（地平線），420×560 往下到腳。PROJ=rect 回舊做法。
const LOOKP = FACEV && (process.env.PROJ || 'look') === 'look';
// 2026-11-05 再改（使用者：人物再靠近玩家一點、頭高一點；不是由上往下看妹子，而是快要平視她的臉部、肩膀）：
//   攝影機 0.28→0.22 格（D0）、眼睛高 0.95→0.87 格（EYE；約她下巴高，臉跟肩膀接近平視），cy 80→200（頭頂留給頭髮），420×640。
// 2026-11-05 三改（使用者：比例可以但太近一點；忽然切到這張太跳、像忽然放大）：原因＝在 0.22 格拍、卻在 0.4 格顯示（放大約 1.8 倍）。
//   改成在 0.3 格拍、play.html 也在 0.3 格（碰撞點）顯示，跟 3D 的遠處板子同一個比例、同一個眼睛高（0.87 格≈她下巴），切換時不放大；cy 150、420×540。
const P0_CAM = LOOKP ? { ...CAM0, proj: 'look', pitch: 0, dist: +(process.env.D0 || .3) * CELL, eyeZ: +(process.env.EYE || .87) * CELL, h: 540, cy: 150 } : { ...CAM0, pitch: P0_PITCH * Math.PI / 180 };
const VIEW_CAM = { p0: P0_CAM, down: { ...CAM0, pitch: +(process.env.DOWN || 20) * Math.PI / 180, h: 530, cy: 150 } };
const VIEWS = FACEV ? (process.env.VIEWS || 'p0').split(',') : ['close'];
const BODY = { balanced: { height_cm: 161, build: '勻稱有致', hair: '中分長髮' }, slim: { height_cm: 166, build: '纖細苗條', hair: '短髮' }, petite: { height_cm: 150, build: '嬌小玲瓏', hair: '雙馬尾' }, curvy: { height_cm: 163, build: '微肉圓潤', hair: '大波浪長髮' } };
const DIR = { front: 0, front_right: 45, right: 90, back_right: 135, back: 180, back_left: -135, left: -90, front_left: -45 };
const env = (k, def) => process.env[k] ? process.env[k].split(',') : def;
const B = env('BODY', ['balanced'])[0], SHAPE = process.env.SHAPE || 'round', CUP = process.env.CUP || 'D', AR = process.env.AR || 'medium';
const DIRS = env('DIRS', FACEV ? ['front'] : Object.keys(DIR)), BHS = env('BH', ['wavy']), FHS = env('FH', ['curtain']), CLS = env('CL', ['napkin_bell']);
const SHARD = +(process.env.SHARD || 0), NSH = +(process.env.NSHARD || 1);
const FACE = [['nose', 'small', [D.NOSE_RGB, D.NOSE_LO_RGB], 'nose_small'], ['mouth', 'line', [D.MOUTH_RGB, D.MOUTH_LO_RGB, D.LIPLO_RGB, D.LIPLO_LO_RGB], 'mouth'], ['brows', 'natural', [D.BROW_RGB, D.BROW_LO_RGB], 'brows'], ['eyes', 'mark', [D.EYE_RGB, D.EYE_LO_RGB], 'eyes', { nose: 'small' }]];   // 2026-11-05 使用者：側面眼睛是被山根擋住、不是印上去 → 眼睛圖層連鼻子一起算（鼻子擋住的地方沒有眼睛）   // 2026-11-05 眼睛位置（使用者：下一步做眼睛）
// ONLY=eyes（或 nose,mouth,...）：只重出這幾個臉部圖層，其他（身體、頭髮、衣服、下身）不動
const ONLY = process.env.ONLY ? process.env.ONLY.split(',') : null;
const mk = (o = {}) => { const x = D.lookToDoll({ ...BODY[B], cup: CUP + ' 罩杯' }); x.shape = SHAPE; x.areola = AR; x.face = 'anime'; if (!o.backHair && !o.frontHair) x.hair = 'none'; Object.assign(x, o); return x; };
let CAM = CAM0, O = __dirname + '/sheets_close';
const R = (doll, f, yaw) => D.render(doll, 'walk', f, yaw, { scale: K, cam: CAM, stand: FACEV });
const isA = (q, i) => q[i + 3] === D.CLOTH_A;
const cols = list => (q, i) => q[i + 3] === D.CLOTH_A && list.some(c => q[i] === c[0] && q[i + 1] === c[1] && q[i + 2] === c[2]);
const all = (q, i) => q[i + 3] > 0;

// 工作：每個方向一個單位（8 格）
const jobs = []; for (const v of VIEWS) for (const d of DIRS) jobs.push([v, d]);
let n = 0;
jobs.forEach(([v, d], ji) => {
  if (ji % NSH !== SHARD) return;
  CAM = VIEW_CAM[v] || CAM0; O = __dirname + (FACEV ? `/sheets_f2f/${v}` : '/sheets_close');
  const yaw = DIR[d], outs = {}, FW = CAM.w * K, FH = CAM.h * K;
  const put = (p, i, px, keep) => { const S = outs[p] || (outs[p] = { width: FW * NFR, height: FH, pixels: new Uint8ClampedArray(FW * NFR * FH * 4) }); for (let y = 0; y < FH; y++) for (let x = 0; x < FW; x++) { const si = (y * FW + x) * 4; if (keep(px, si)) S.pixels.set(px.subarray(si, si + 4), (y * FW * NFR + i * FW + x) * 4); } };
  for (let f = 0; f < NFR; f++) {
    if (!ONLY) {
    put(`/${B}_${SHAPE}_${CUP}_${AR}_${d}.png`, f, R(mk(), f, yaw).pixels, all);
    for (const st of BHS) put(`/hair/${B}_back_${st}_${d}.png`, f, D.renderHairLayer(mk({ backHair: st, frontHair: null }), 'walk', f, yaw, { scale: K, cam: CAM, stand: FACEV }).pixels, all);
    for (const st of FHS) put(`/hair/${B}_front_${st}_${d}.png`, f, D.renderHairLayer(mk({ backHair: null, frontHair: st }), 'walk', f, yaw, { scale: K, cam: CAM, stand: FACEV }).pixels, all);
    for (const cl of CLS) put(`/cloth/${B}_${SHAPE}_${CUP}_${cl}_${d}.png`, f, R(mk({ cloth: cl }), f, yaw).pixels, isA);
    if (FACEV) for (const [k, st] of [...D.PUBICS.map(x => ['pubic', x]), ...D.LABIAS.map(x => ['labia', x]), ...D.PANTS.map(x => ['pants', x])]) {   // 2026-11-04 不穿衣服時近景也看得到下身（同 render_hd：只留 CLOTH_A、而且身體在的地方）
      const r = R(mk({ [k]: st }), f, yaw).pixels, g = R(mk(), f, yaw).pixels;
      put(`/groin/${B}_${k}_${st}_${d}.png`, f, r, (q, i) => q[i + 3] === D.CLOTH_A && g[i + 3] > 0);
    }
    }
    for (const [k, st, c, name, ex] of FACE) if (!ONLY || ONLY.includes(name)) put(`/face/${B}_${name}_${d}.png`, f, R(mk({ [k]: st, ...(ex || {}) }), f, yaw).pixels, cols(c));
  }
  for (const [p, S] of Object.entries(outs)) { fs.mkdirSync(path.dirname(O + p), { recursive: true }); png(S, 1, O + p); }
  console.log(FACEV ? `f2f ${v}` : 'close', d, 'done'); n++;
});
console.log('close shard', SHARD, 'units', n, 'of', jobs.length, 'CAM', JSON.stringify(FACEV ? P0_CAM : CAM0));
