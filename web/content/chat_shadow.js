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
  const DROOM_URL = new URL('../droom/room_doll_chest.js?v=26', (document.currentScript && document.currentScript.src) || location.href).href;
  const N = 16, NA_OF = { shirt: 22, bra: 36, panties: 32, peak: 24, r_breast: 8, r_groin: 8, r_waist: 8, ang_akimbo: 20, ang_cross: 13, laugh_bend: 23, laugh_back: 23, fg_r0: 12, fg_r1: 12, fg_r2: 12, fg_w0: 12, fg_w1: 12, fg_w2: 12, fg_rx: 8, fg_wx: 8, col_d: 10, col_s: 12, col_q: 8 }, FPS = { breathe: 4, talk: 7 };
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
  // 開心笑（2026-11-21 使用者）：笑彎腰（抱胸、彎腰低頭，笑得一抖一抖）、摀嘴仰頭笑（一手遮嘴、頭往後仰）：進場 4 格 → 笑的循環 6 格 → 放下
  const ANGS = ['ang_akimbo', 'ang_cross', 'laugh_bend', 'laugh_back'];
  const EMO_OF = { angry: ['ang_akimbo', 'ang_cross'], happy: ['laugh_bend', 'laugh_back'] };
  const ANG = {
    ang_akimbo: { enter: 12, loop: [12, 19], exit: [3, 2, 1, 0], ms: (i) => (i < 4 ? 75 : i === 4 ? 60 : i < 12 ? 75 : 150) },
    ang_cross: { enter: 5, loop: [5, 12], exit: [4, 3, 2, 1, 0], ms: (i) => (i < 5 ? 85 : 155) },
    // 2026-11-22 使用者：笑用更多格（胸部的動作不順）——進場 5 格、循環 18 格（一圈笑三下，每格 55 毫秒）
    laugh_bend: { enter: 5, loop: [5, 22], exit: [4, 3, 2, 1, 0], ms: (i) => (i < 5 ? 70 : 55) },
    laugh_back: { enter: 5, loop: [5, 22], exit: [4, 3, 2, 1, 0], ms: (i) => (i < 5 ? 70 : 55) },
  };
  const beatCum = {};
  /** 播了 ms 毫秒，該是第幾格（超過最後一格回 n）。 */
  function beatFrame(kind, ms) {
    const n = NA_OF[kind];
    if (!beatCum[kind]) { let t = 0; beatCum[kind] = Array.from({ length: n }, (_, i) => (t += BEAT[kind](i / (n - 1)))); }
    const c = beatCum[kind]; for (let i = 0; i < n; i++) if (ms < c[i]) return i; return n;
  }
  // 脫衣動畫認哪幾片：胸罩＝內衣那層的布 1／2，或比基尼上面；內褲＝內衣那層的其他，或比基尼下面（worker 裡也用）
  // 手指插入：玩家手臂走的路（人偶座標 x, z）：A0 畫面右下外面 → M 褲頭右上方 → E 褲頭（伸進去的地方）→ L 最深。
  //   at(u)：M→A0 那段（露在外面的前臂）上的點，她抓前臂就抓這裡。worker 裡也用（deform 照零件找褲頭，畫手那層照衣著算）。
  function fgArmPts(cx, band, gz) {
    const Ez = band == null ? gz + 4.2 : band, E = [cx + .7, Ez], M = [cx + 5.5, Ez + 2.2], A0 = [cx + 30, gz - 20], L = [cx + .25, gz - .9];
    return { cx, gz, band, E, M, A0, L, at: (u) => [M[0] + (A0[0] - M[0]) * u, M[1] + (A0[1] - M[1]) * u], wr: (v) => [M[0] + (E[0] - M[0]) * v, M[1] + (E[1] - M[1]) * v] };   // wr(v)：手腕那一節（褲頭上面，M→E）
  }
  function fgArm(sh, C) {
    const L = sh._legs || [], hip = (e) => e[4] ? e[0][0] + e[4][0] : e[0][0];
    const cx = L.length >= 2 ? (hip(L[0]) + hip(L[1])) / 2 : .9;
    const top = (f) => { let z = null; for (const p of sh.prims) if (f(p)) { const x = p.bc[0] + p.off[0], q = p.bc[2] + p.off[2]; if (Math.abs(x - cx) < 3.5 && (z == null || q > z)) z = q; } return z; };
    let band = top((p) => p.cloth && (p.garm === 'bot' || p.bik === 'bot'));
    if (band == null) band = top((p) => p.cloth && p.under && p.pk);
    return fgArmPts(cx, band, C + 1.4);
  }
  function braPiece(p) { return !!p.cloth && ((p.under && (p.cloth === 1 || p.cloth === 2)) || p.bik === 'top'); }
  function pantyPiece(p) { return !!p.cloth && ((p.under && p.cloth !== 1 && p.cloth !== 2) || p.bik === 'bot'); }
  const ANIMS = ['shirt', 'bra', 'panties'];   // 脫衣動畫：undress.stage 0→1 脫 T 恤、1→2 脫胸罩、2→3 脫內褲
  const nOf = (pose) => NA_OF[pose] || N;
  const SCALE = 2, CV = { w: 84, h: 134, ax: 42, ay: 131, tMax: 40, tMin: -45 };   // 手抬起來也在框內；腳底固定在 ay
  // 坐著（美人魚坐姿，脫衣時）：腿往右收比較寬、人比較矮 → 自己的畫布（顯示時一樣撐滿高度＝坐著的她看起來比較大）
  const CV_SIT = { w: 116, h: 100, ax: 56, ay: 94, tMax: 70, tMin: -70 };   // 上面留空間給脫 T 恤時舉到頭上的手
  const CV_SIT_LOW = { w: 116, h: 76, ax: 56, ay: 72, tMax: 70, tMin: -70 };   // 一般聊天坐著（妻子摸自己）：手不會舉過頭 → 上面不留空，人顯示得比較大
  const cvOf = (doll) => (doll && doll._body === 'mermaid' ? (doll._mode ? CV_SIT_LOW : CV_SIT) : CV);

  // look.breast_shape → 模型乳型（照 droom-chest-model 備忘錄 MEMO-2026-11-18、使用者確認的表）；外擴（2026-11-21 使用者：另一個維度 look.breast_splay，見 dollOf；舊存檔的乳型「外擴型」也照這樣）＝自然圓潤＋從根部慢慢往外彎（room_doll_chest.js splay:'wide'：越往前、越下面越往外，乳暈、下乳明顯往外），不用模型裡取消的八字 shape wide
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

  // 2026-11-21 使用者：畫她衣櫃裡的衣服——身上那套的文字 → 衣服零件（room_doll_chest.js 的 doll.wear）。
  //   top：tee T 恤／crop 短版／over 寬鬆 oversize／cami 細肩帶／long 長袖／shirt 襯衫；bottom：short 短裙／long 長裙／pencil 窄裙／pleat 百褶裙／pants 長褲／shorts 短褲；dress：洋裝（上衣到腰接裙子）。
  //   情趣裝、睡衣的特殊件（絲襪、吊襪帶、馬甲、睡袍、圍裙、旗袍、薄紗）還沒做，先用最接近的。認不出來＝白 T。
  const T = (top, bottom, dress) => ({ top, bottom: bottom || null, dress: !!dress });
  const X = (o) => ({ bottom: null, dress: false, ...o, dress: !!o.dress, noBra: o.noBra instanceof RegExp ? 'test' : !!o.noBra, noPants: o.noPants instanceof RegExp ? 'test' : !!o.noPants, _re: o });
  const WEAR_OF = [
    [/白色 ?T ?恤配胸罩/, T('tee')],
    [/簡約日系/, T('tee', 'long')], [/甜美洋裝/, T('tee', 'short', 1)], [/街頭 ?oversize/i, T('over', 'shorts')], [/知性 ?OL|成熟知性套裝/i, T('shirt', 'pencil')],
    [/清新文青|古著復古/, T('shirt', 'long')], [/性感俐落|小露性感/, T('cami', 'short')], [/森林系/, T('tee', 'long', 1)], [/甜辣風|Y2K/i, T('crop', 'short')],
    [/JK|制服/i, T('shirt', 'pleat')], [/運動辣妹/, T('crop', 'shorts')], [/優雅名媛/, T('cami', 'long', 1)], [/暗黑哥德/, T('long', 'long', 1)],
    [/清純鄰家/, T('tee', 'short')], [/韓系慵懶/, T('over', 'pants')], [/洛麗塔|可愛甜美/, T('tee', 'pleat', 1)], [/極簡冷淡/, T('tee', 'pants')],
    [/健康陽光/, T('cami', 'shorts')], [/輕熟女/, T('shirt', 'short')],
    // 睡衣
    [/睡衣套裝|格紋睡衣/, T('long', 'pants')], [/男友襯衫/, T('shirt')], [/吊帶短褲睡衣/, T('cami', 'shorts')], [/睡裙/, T('long', 'long', 1)], [/背心配睡褲/, T('crop', 'pants')],
    // 情趣裝（特殊件還沒做）
    // 情趣裝（第二階段：絲襪、吊襪帶、馬甲、睡袍、圍裙、旗袍、薄紗）；noBra／noPants＝真空（不穿胸罩／內褲）
    [/胸罩配吊襪帶/, X({ top: null, extras: ['garter', 'stockings'] })], [/情趣連身衣/, X({ top: 'teddy', noBra: 1 })], [/半透明白襯衫|不扣鈕/, X({ top: 'openShirt', fab: 7, noBra: 1 })],
    [/束腰/, X({ top: 'corset', noBra: 1 })], [/睡袍/, X({ top: 'robe', noBra: /真空/, noPants: /真空/ })], [/圍裙/, X({ top: null, extras: ['apron', 'collar', 'ears'], noBra: 1 })],
    [/濕身白 ?T/, X({ top: 'tee', fab: 7, noBra: 1 })], [/馬甲/, X({ top: 'corsetFull', extras: ['stockings', 'garter'], noBra: 1 })], [/旗袍/, X({ top: 'qipao', bottom: 'qipao', dress: 1 })],
    [/薄紗|只遮重點/, X({ top: 'cami', bottom: 'long', dress: 1, fab: 7, botFab: 7 })],
    [/三角比基尼|比基尼/, X({ top: 'bikini', bottom: 'bikini', noBra: 1, noPants: 1 })],   // 2026-11-22 使用者：情趣內衣——小三角比基尼擋住乳頭＋綁帶三角褲（黑色）
    // 自己取的名字：關鍵字
    [/洋裝|連身裙/, T('tee', 'short', 1)], [/長裙/, T('tee', 'long')], [/百褶/, T('shirt', 'pleat')], [/窄裙|鉛筆裙|套裝/, T('shirt', 'pencil')], [/短裙|裙/, T('tee', 'short')],
    [/短褲|熱褲/, T('tee', 'shorts')], [/褲/, T('tee', 'pants')], [/襯衫/, T('shirt')], [/細肩帶|吊帶|背心/, T('cami')], [/帽 ?T|衛衣|外套|oversize/i, T('over')], [/長袖/, T('long')],
  ];
  /** 身上那套的文字 → doll.wear（null＝沒有外衣，只剩內衣）；認不出來回 undefined（照舊白 T）。 */
  function wearOf(text) {
    const t = String(text || '');
    if (!t) return undefined;
    for (const [re, w] of WEAR_OF) if (re.test(t)) {
      if (!w) return null;
      const o = { top: w.top, bottom: w.bottom, dress: w.dress };
      for (const k of ['fab', 'botFab', 'extras']) if (w[k] != null) o[k] = w[k];
      for (const k of ['noBra', 'noPants']) if (w[k]) o[k] = w[k] === 'test' ? w._re[k].test(t) : true;   // 正規式：文字裡有才算（例：睡袍「真空」）
      return o;
    }
    return undefined;
  }

  /** 第 f 格的動作量（worker 裡也用，不能用外面的變數）。pose：breathe／talk／脫衣動畫 shirt／bra／panties；sit＝坐著（不比劃）。 */
  function motion(pose, f, n, sit, mode, tier) {
    const ph = 2 * Math.PI * f / n;
    // 2026-11-22 使用者：手伸進褲子時她的反應（循環）。r＝抗拒、w＝迎合；0 普通、1 有感、2 高潮。
    //   bend＋往前彎、nod＋低頭／－仰頭、turn 搖頭；drop 腿軟（整個上半身往下、膝蓋彎）、open 大腿打開、squirt 噴水（畫在手那一層）
    // 2026-11-22 使用者：被摸到噴水以後，手收回去她不會站著——腿軟、雙腿打開成 M 字，癱坐在地上。
    //   col_d 坐下去（一次，最後屁股著地彈一下）、col_s 癱坐著（循環：喘、一抖一抖）。dropFrac＝往下沉到屁股著地的比例（deform 照身形換算）
    // 2026-11-22 使用者（第二版）：忽然沒力、狠狠地坐下去——「碰！」屁股撞地（彈一下），撞地那一下噴水；
    //   一邊噴身體一邊抖（col_q），之後癱坐（col_s）；頭一直往上仰。
    if (pose === 'col_d' || pose === 'col_s' || pose === 'col_q') {
      if (pose === 'col_d') {
        const E = [0, .04, .3, .78, 1.1, .94, 1.03, .99, 1, 1][Math.min(9, f)], J = [0, 0, 0, 0, .45, -.25, .15, -.06, 0, 0][Math.min(9, f)];   // 第 4 格屁股撞地
        return { ph, br: .25, tilt: 6 * E, nod: -6 - 18 * Math.min(1, E) - 10 * Math.max(0, J), turn: -4 * E, gest: 0, bend: -6 * Math.min(1, E), jolt: 0,
          fg: { kind: 'cd', ph, drop: 0, dropFrac: E, open: .5 + 2.1 * Math.min(1, E), squirt: false } };
      }
      if (pose === 'col_q') {   // 一邊噴一邊抖：身體一抽一抽、腿跟著顫、頭往上仰
        const J = [.55, -.45, .5, -.4, .55, -.35, .45, -.5][f % 8];   // 抖的幅度放在頭、背、腿（身體往上抽太大，上衣和褲頭中間會裂開）
        return { ph, br: .25, tilt: 6 + 4 * J, nod: -28 - 8 * J, turn: -4 + 5 * J, gest: 0, bend: -5, jolt: 0,   // 抖在頭、肩、腿（不用 jolt、不加 bend、不另外沉：上半身一動，腿張開時褲頭和褲管會分開）
          fg: { kind: 'cq', ph, drop: 0, dropFrac: 1, open: 2.45 + .15 * J, squirt: false } };   // 腿不要比癱坐張更開（褲子胯下那條縫會裂開）
      }
      const s3 = Math.sin(3 * ph);   // 癱坐：喘、偶爾抖一下，頭還是往上仰
      return { ph, br: .25 + .1 * Math.sin(2 * ph), tilt: 6 + 1.5 * s3,   // 呼吸起伏放小（腿張開時上半身抬太多，褲頭和褲管會分開）
        nod: -20 + 3 * Math.sin(ph), turn: -4, gest: 0, bend: -5, jolt: 0,
        fg: { kind: 'cs', ph, drop: 0, dropFrac: 1, open: 2.6 + .05 * Math.sin(2 * ph), squirt: false } };
    }
    if (pose.slice(0, 3) === 'fg_') {
      const k = pose.slice(3), s2 = Math.sin(2 * ph), s4 = Math.sin(4 * ph);
      const Q = {
        r0: { bend: 9, nod: 6, turn: 22 * s2, tilt: 0, drop: 0, open: 0, jolt: 0 },                                     // 抗拒：微微前傾、搖頭
        r1: { bend: 20, nod: 24, turn: 14 * s2, tilt: 3, drop: 0, open: 0, jolt: 0 },                                   // 有感：低頭搖頭、往前彎
        r2: { bend: 12, nod: 16, turn: -16 + 4 * s2, tilt: 7, drop: 2.8 + .35 * s2, open: 1, jolt: .14 * s4, squirt: 1 }, // 非常有感：腿軟彎、大腿打開、噴水
        w0: { bend: 0, nod: -5, turn: 9, tilt: -4, drop: 0, open: .45, jolt: 0 },                                       // 迎合：腿微微打開
        w1: { bend: -6, nod: -22, turn: 6, tilt: -5, drop: 0, open: .55, jolt: .16 * Math.sin(3 * ph) },                // 有感：仰頭、身體抖
        w2: { bend: -8, nod: -26, turn: 4 * Math.sin(ph), tilt: -6, drop: 1.9 + .3 * s2, open: 1.25, jolt: .2 * s4, squirt: 1 },   // 高潮：腿軟、揉奶、大腿打開、噴水
        // 噴水時的痙攣（2026-11-22 使用者：噴水要搭配身體痙攣）：一抽一抽（越來越小）——腰往前頂、頭往後甩、腿一軟一挺
        rx: (() => { const J = [0, 1, -.5, .85, -.35, .6, -.2, .25][f % 8] || 0; return { bend: 12 + 10 * J, nod: 16 - 16 * J, turn: -16, tilt: 7, drop: 2.8 - 1.3 * J, open: 1.1, jolt: J }; })(),
        wx: (() => { const J = [0, 1, -.5, .85, -.35, .6, -.2, .25][f % 8] || 0; return { bend: -8 - 9 * J, nod: -26 - 10 * J, turn: 4, tilt: -6, drop: 1.9 - 1.1 * J, open: 1.35, jolt: J }; })(),
      }[k] || { bend: 0, nod: 0, turn: 0, tilt: 0, drop: 0, open: 0, jolt: 0 };
      return { ph, br: .5 + .2 * s2, tilt: Q.tilt, nod: Q.nod, turn: Q.turn, gest: 0, bend: Q.bend, jolt: Q.jolt, fg: { kind: k, ph, drop: Q.drop, open: Q.open, squirt: !!Q.squirt } };
    }
    if (pose === 'laugh_bend' || pose === 'laugh_back') {
      // 笑：bend＝上半身從腰往前彎（度，負＝往後仰）；jolt 一抖一抖（笑的時候肩膀一上一下）
      // 2026-11-22 使用者：用更多格、胸部要順——進場 5 格（wa 慢慢到位）＋循環 18 格（一圈笑三下）：
      //   身體一上一下是平滑的波（hop），乳房像軟彈簧慢半拍跟著晃（bounce，相位落後），一圈剛好接回開頭，不會一格一格跳
      const sm = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); }, E = 5, LOOP = 18;
      const wa = sm(f / (E - 1)), inL = f >= E, ph3 = inL ? 2 * Math.PI * 3 * (f - E) / LOOP : 0;
      const hop = inL ? .32 * Math.sin(ph3) : 0;
      const bounce = inL ? -.85 * Math.sin(ph3 - 1.15) : 0;
      const sh2 = inL ? Math.sin(ph3 + .6) : 0;   // 肩膀、頭跟著一下一下（比身體早一點）
      if (pose === 'laugh_bend') return { ph: 0, br: .5 + .2 * sh2, tilt: 3 * wa + 2 * Math.sin(ph3 / 3), nod: 14 * wa + 3 * sh2, turn: 0, gest: 0,
        ang: { kind: 'cross', w: wa, bounce, laugh: true }, bend: 24 * wa + 2.5 * sh2, jolt: hop };
      return { ph: 0, br: .5 + .2 * sh2, tilt: 5 * wa + 2 * Math.sin(ph3 / 3), nod: -18 * wa - 3 * sh2, turn: 6 * wa, gest: 0,
        ang: { kind: 'mouth', w: wa, bounce }, bend: -6 * wa, jolt: hop };
    }
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
      const u = anim.u, O = sh.prims.filter(p => p.cloth && !p.under && !p.sleeve && p.garm !== 'bot');   // 下身（裙子、褲子）另外往下脫
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
        const G = sh.prims.filter(braPiece);
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
        const G = sh.prims.filter(p => pantyPiece(p) && p.pk);
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
    let modePlan = null, SOFT = null, crossBand = null;   // SOFT：乳房軟變形（左右各一個位移；根部不動、越往下推越多，連同蓋在上面的衣服）——生氣說話的晃、抱胸托高
    // 2026-11-22 使用者：脫比基尼上面、脫胸罩，帶子（扣子）解開的時候胸部會垂落——托著的布一鬆，乳房往下掉、晃兩下停住（根部不動、下半顆掉最多）
    if (anim && anim.kind === 'bra' && sh.supDrop && anim.u > .42) {
      const t = (anim.u - .42) * 35, D = sh.supDrop, dz = -D * (1 - Math.exp(-t / 2.2) * Math.cos(t * 1.25)), dy = -.25 * D * Math.min(1, t / 3);
      SOFT = { [-1]: [0, dy, dz], [1]: [0, dy, dz] };
    }
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
    } else if (!anim && m.fg) {
      // 手伸進褲子時的反應（m.fg.kind）：抓住玩家的前臂／隔著褲子抓住手掌／遮臉／摀嘴／手伸進衣服摸奶／兩手揉奶
      const W = (p) => [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      const mean = (L) => { const c = [0, 0, 0]; for (const q of L) for (let i = 0; i < 3; i++) c[i] += q[i] / L.length; return c; };
      const bodyP = sh.prims.filter(p => p.mat === 0 && !p.cloth && !p.carve && p.part !== 'armL' && p.part !== 'armR' && p.part !== 'head');
      const frontY = (x, z) => { for (let y = 22; y > -10; y -= .25) { for (const p of bodyP) if (H.primDist(p, x, y, z) < 0) return y; } return 4; };
      const BR = [-1, 1].map(sd => { const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && !p.nip && Math.sign(W(p)[0]) === sd); if (!L.length) return null; const c = mean(L.map(W)); const r = Math.max(...L.filter(p => p.r).map(p => Math.max(...p.r)), 2); return { c, r, front: Math.max(...L.map(p => W(p)[1] + p.br * .7)) }; });
      const big = BR[1] ? Math.max(.3, Math.min(1, (BR[1].r - 3.4) / 2.6)) : .5;
      const HP = sh.prims.filter(p => p.part === 'head' && !p.cloth && p.mat === 0), hc = HP.length ? mean(HP.map(W)) : [0, 2, S + 8];
      const faceY = HP.length ? Math.max(...HP.map(p => W(p)[1] + p.br * .6)) : hc[1] + 4;
      const G = fgArm(sh, C), k = m.fg.kind === 'rx' ? 'r2' : m.fg.kind === 'wx' ? 'w2' : m.fg.kind, ph2 = m.fg.ph * 2;   // 痙攣：手跟高潮那段一樣
      const hands = {}, poles = {}, hd = {}, push = { [-1]: [0, 0, 0], [1]: [0, 0, 0] }, round = { [-1]: 0, [1]: 0 };
      // 最外面（含衣服）的表面：玩家的前臂在衣服外面，她的手要抓在前臂上（不然手會被衣服蓋住）；那個 x 打不到身體就往中線靠
      const outerP = sh.prims.filter(p => p.mat === 0 && !p.carve && p.part !== 'armL' && p.part !== 'armR' && p.part !== 'head' && !(p.cloth && p.under));
      const frontAny = (x, z) => { for (let k = 0; k < 6; k++) { const xx = x + (G.cx - x) * k / 6; for (let y = 22; y > -10; y -= .25) { for (const p of outerP) if (H.primDist(p, xx, y, z) < 0) return y; } } return 6; };
      // 2026-11-22 使用者：抓手臂要抓前面那一節（手腕、褲頭上面那段 M→E），不是後面的前臂
      const grip = (part, v, pole) => { const q = G.wr(v); hands[part] = [q[0], frontAny(q[0], q[1]) + 3.2, q[1] + .3]; poles[part] = pole; };
      const knead = (part, b, sd, amp) => { const kk = Math.sin(ph2 + (sd > 0 ? 1.4 : 0)); hands[part] = [b.c[0] * 1.05 + sd * .4 * kk, b.front - b.r * .25, b.c[2] - b.r * .55 + amp * kk]; poles[part] = [sd, .25, -.8]; push[sd] = [-sd * .45 * (1 + kk) * .5, .3, .9 + amp * .8 * kk]; round[sd] = .6 * big; };
      if ((k === 'cd' || k === 'cs' || k === 'cq') && sh.prims.some(p => p.cloth && p.garm === 'bot')) sh.prims = sh.prims.filter(p => !(p.cloth && p.under && p.pk));   // 癱坐腿張很開：褲子胯下會裂開一點，裡面的黑色丁字褲不要露出來（看到的是皮膚的影子）
      if (k === 'cd' || k === 'cs' || k === 'cq') {   // 癱坐：兩手軟軟地垂到地上（身體往下沉之前的座標：最後的位置＋沉下去的量）
        const A2 = { armL: armPts('armL'), armR: armPts('armR') }, dMax = Math.max(0, (P.hipz - .9) - P.ankle - 7), dN = (m.fg.drop || 0) + (m.fg.dropFrac || 0) * dMax, e = Math.min(1, m.fg.dropFrac || 0);
        for (const [part, sd] of [['armL', -1], ['armR', 1]]) if (A2[part]) { const fl = [G.cx + sd * 8.5, -1.5, P.ankle + 3 + dN]; hands[part] = lerp(A2[part].w0, fl, e); poles[part] = [sd, -.2, .3]; }
      } else
      if (k === 'r0') { grip('armR', .2, [1, .2, -.6]); grip('armL', .8, [-.6, .6, -.6]); }
      else if (k === 'r1') {   // 隔著褲子抓住玩家的手掌
        hands.armL = [G.cx - .9, frontY(G.cx - .9, G.gz + 2.6) + 1.1, G.gz + 2.6]; poles.armL = [-1, .3, -.4]; hd.armL = [.1, .3, -1];
        hands.armR = [G.cx + 1.7, frontY(G.cx + 1.7, G.gz + 3.6) + 1.1, G.gz + 3.6]; poles.armR = [1, .3, -.4]; hd.armR = [-.1, .3, -1];
      } else if (k === 'r2') { hands.armL = [hc[0] - .3, faceY + 1.5, hc[2] - .4]; poles.armL = [-.7, .5, -.6]; grip('armR', .4, [1, .2, -.6]); }   // 右手（畫面左邊那隻）遮臉、左手抓玩家的手腕
      else if (k === 'w0') { hands.armL = [-.6, faceY + 1.6, hc[2] - 2.2]; poles.armL = [-.7, .5, -.6]; grip('armR', .35, [1, .2, -.6]); }   // 摀嘴
      else if (k === 'w1') { grip('armR', .35, [1, .2, -.6]); if (BR[0]) { knead('armL', BR[0], -1, .7); poles.armL = [-.25, .45, -1]; } }   // 一手伸進衣服摸自己的奶（手肘往下，從衣服下襬伸進去）
      else if (k === 'w2' && BR[0] && BR[1]) { knead('armL', BR[0], -1, 1.2); knead('armR', BR[1], 1, 1.2); }   // 兩手揉自己的乳房（上下揉）
      modePlan = { hands, poles, push, round, handDir: hd };
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
      if (m.ang.kind === 'mouth') {   // 摀嘴笑：左手手背遮在嘴前（跟著頭仰）
        const HP = sh.prims.filter(p => p.part === 'head' && !p.cloth && p.mat === 0), hc = HP.length ? mean(HP.map(W)) : [0, 2, S + 8];
        const Jm = m.jolt || 0, mo = [-.4, (HP.length ? Math.max(...HP.map(p => W(p)[1] + p.br * .6)) : hc[1] + 4) + 1.4, hc[2] - 2.4];
        const mq = headX ? app(headX, [mo[0], mo[1] - .7 * Jm, mo[2] + hl + 1.6 * Jm]) : mo;
        if (A.armL) { hands.armL = lerp(A.armL.w0, mq, w); poles.armL = [-.25, .35, -1]; }   // 手肘往下垂、前臂從胸前斜上來（不要橫過臉）
      } else if (m.ang.kind === 'akimbo') {
        if (A.armL && A.armR) { const r = A.armR.w0; hands.armL = lerp(A.armL.w0, [-r[0], r[1], r[2]], w); poles.armL = [-1, -.4, .15]; }
        SOFT = { [-1]: [0, 0, m.ang.bounce * (.5 + 1.3 * big)], [1]: [0, 0, m.ang.bounce * (.5 + 1.3 * big)] };   // 晃：根部不動、下半顆晃得最多
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
        // 2026-11-21 使用者：大於 C 抱胸，乳房明顯被托高（在手臂上），手臂大概在胸部下緣的位置 → 托高 1.4～3 格（照罩杯），手臂中心落在原本的下緣附近
        const lift = rest && !m.ang.laugh ? (1.4 + 1.6 * big) * w : 0, ARM = 1.35;   // 笑彎腰：手臂在下面但不托（胸部往前垂，2026-11-22 使用者）
        const zA = Math.min(bottom(BR[0]), bottom(BR[1])) + lift - ARM - .05;   // 前臂上緣剛好頂著托高後的下緣
        const torsoP = bodyP.filter(p => p.part !== 'breast');
        // 2026-11-22 使用者：雙手抱胸怎麼感覺手在後背——大胸穿 T 恤時布從胸口直直垂下來、離肚子很遠，手臂貼著身體就藏在衣服裡面
        //   → 手臂貼在最外面（含外衣）的表面上
        const clothP = sh.prims.filter(p => p.cloth && !p.under && p.mat === 0 && p.part !== 'armL' && p.part !== 'armR' && p.part !== 'head');
        const torsoY = (x, z) => { for (let y = 22; y > -10; y -= .25) { for (const p of torsoP) if (H.primDist(p, x, y, z) < 0) return y; for (const p of clothP) if (H.primDist(p, x, y, z) < 0) return y; } return 4; };
        if (A.armL) { hands.armL = lerp(A.armL.w0, [BR[1].c[0] * .95 + 1.2, torsoY(BR[1].c[0], zA) + ARM + .2, zA], w); poles.armL = [-.75, .65, -.45]; }   // 手肘往前（前臂平平地橫在身體前面，不是從身體側邊斜插進去）
        if (A.armR) { hands.armR = lerp(A.armR.w0, [BR[0].c[0] * .95 - 1.2, torsoY(BR[0].c[0], zA - .6) + ARM + 1.3, zA - .6], w); poles.armR = [.75, .65, -.45]; }   // 另一隻在外面、低一點（看得出交叉）
        if (w > .3) crossBand = { zLo: zA - 3.2, zHi: zA + 1.6, xMax: Math.abs(BR[0].c[0]) + 4.5, y: Math.min(hands.armL ? hands.armL[1] : 99, hands.armR ? hands.armR[1] : 99) - ARM };   // 前臂橫的那條：衣服要被壓到手臂後面
        SOFT = { [-1]: [0, .35 * lift, lift], [1]: [0, .35 * lift, lift] };   // 托：下緣被手臂往上推、肉往上往前擠，根部不動（使用者：乳房很柔軟，根部不會動）
      }
      // 2026-11-22 使用者：笑的時候往前彎，胸部自然往前垂、跟著笑一晃一晃——身體往前彎 θ，重力在身體裡變成往前（sinθ）：
      //   乳房（根部不動）往前、往下垂，越大垂越多；笑的一抖一抖也順著往前垂的方向晃
      const th = m.ang.laugh && m.bend > 0 ? m.bend * Math.PI / 180 : 0;
      if (th) {
        const BR2 = sh.prims.filter(p => p.part === 'breast' && !p.cloth && !p.nip && p.r), rr = BR2.length ? Math.max(...BR2.map(p => Math.max(...p.r))) : 3;
        const d = rr * (.4 + .3 * big), hy = 1.6 * d * Math.sin(th), hz = -.6 * d * Math.sin(th);   // 正面看：往前垂的那段大多朝鏡頭，所以往下的量要給夠才看得出來
        SOFT = SOFT || { [-1]: [0, 0, 0], [1]: [0, 0, 0] };
        for (const sd of [-1, 1]) SOFT[sd] = [SOFT[sd][0], SOFT[sd][1] + hy, SOFT[sd][2] + hz];
      }
      if (m.ang.kind !== 'akimbo' && m.ang.bounce) {   // 笑：乳房跟著一抖一抖（疊在托高上；彎腰時順著往前垂的方向晃）
        // 2026-11-22 使用者：胸部沒有晃（量過只動 0～2 像素）→ 幅度加大到看得出來，C 也會晃、越大晃越多；左右兩顆往外一點點反著晃
        const bz = m.ang.bounce * (1.4 + 2.6 * big);
        SOFT = SOFT || { [-1]: [0, 0, 0], [1]: [0, 0, 0] };
        for (const sd of [-1, 1]) SOFT[sd] = [SOFT[sd][0] + sd * .18 * bz, SOFT[sd][1] + (th ? .9 * bz * Math.sin(th) + .35 * bz : 0), SOFT[sd][2] + bz];
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
      // 長頭髮：肩膀以下那段不跟著頭轉（頭往後仰時，整束長髮像棍子一樣甩到前面、蓋到胯下）——照樣往下垂，只跟著身體動
      if (p.mat === 1 && part !== 'head' && headX && q[2] < S - 3) return [0, jy, hl + jz, null];
      if (part === 'head' || p.mat === 1) return [0, jy, hl + jz, headX];
      if (part === 'armL' || part === 'armR') { const X = armX[part]; return armAct(part, !X ? false : p === X.upper ? 'up' : X.hand && X.hand.has(p) ? 'hand' : false); }
      if (part === 'legs') return null;
      const d = field(q);
      if (J) { const w = Math.max(0, Math.min(1, (q[2] - C) / (S - C))); d[1] += jy * w; d[2] += jz * w; }   // 越上面抽得越多
      d.push(null); return d;
    };
    const body = sh.prims.filter(p => p.mat === 0 && !p.cloth && !p.carve);
    // 脫衣動畫：要移走的那件（T 恤＝外衣；胸罩＝內衣的布 1／2；內褲＝內衣的其他（蕾絲、褲頭））
    const isGone = !anim ? null : anim.kind === 'shirt' ? (p) => p.cloth && !p.under : anim.kind === 'bra' ? braPiece : pantyPiece;
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
    const acts = new Map(), overBreast = new Map();
    for (const p of sh.prims) {
      let a;
      const q = [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
      if (anim && anim.kind === 'shirt' && p.garm === 'bot') {   // 脫外衣時的下身：上衣拉過頭的時候，裙子／褲子往下滑掉（.55～.8），之後不見
        const k = sm((anim.u - .55) / .25); a = anim.u > .8 ? [0, 0, 1000, null] : [0, 2.5 * k, -11 * k, null];
      } else if (shirtPlan && p.cloth && !p.under) {   // 脫 T 恤：布照翻折算新位置；袖子先跟上臂，最後拉過頭時收進手裡
        if (p.sleeve && !shirtPlan.kOff) a = armAct(p.bc[0] + p.off[0] < 0 ? 'armL' : 'armR', true);
        else if (p.sleeve) { const sd = Math.sign(p.bc[0] + p.off[0]) || 1, h = shirtPlan.hmid; a = [h[0] + sd * 3 - q[0], h[1] - q[1], h[2] - 1 - q[2], null]; }
        else { const n = shirtPlan.place(q); a = [n[0] - q[0], n[1] - q[1], n[2] - q[2], null]; }
      } else if (garPlan && isGone(p)) {
        const n = garPlan.place(q, p);
        if (!n) { const f = field(q); a = [f[0], f[1], f[2], null]; }
        else if (n[2] >= 999 && n[0] === 0) a = [0, 0, 1000, null];
        else a = [n[0] - q[0], n[1] - q[1], n[2] - q[2], null];
        // 解開以後、還沒被抽走之前：胸罩／比基尼上面貼著乳房，跟著乳房一起垂落（同一個軟變形），不是停在原地
        if (anim.kind === 'bra' && anim.u < .62) overBreast.set(p, Math.sign(q[0]) || 1);
      } else if (goneMove && isGone(p)) { const g = goneMove(q), f = field(q); a = [g[0] + f[0], g[1] + f[1], g[2] + f[2], null]; }
      else if (p.sleeve) {   // 袖子：上臂那段跟上臂、前臂那段跟前臂
        const part = p.bc[0] + p.off[0] < 0 ? 'armL' : 'armR';
        a = armAct(part, p.sleeve === 1);
      } else if (p.cloth) {   // 衣服：最近的是上臂才跟手走（袖子），其他照軀幹的位移場（靠近手的下襬、褲頭不會被帶走）
        let best = null, bd = 1e9;
        for (const b of body) { const lb = Math.hypot(q[0] - b.bc[0] - b.off[0], q[1] - b.bc[1] - b.off[1], q[2] - b.bc[2] - b.off[2]) - b.br; if (lb >= bd) continue; const d = H.primDist(b, q[0], q[1], q[2]); if (d < bd) { bd = d; best = b; } }
        const X = best && armX[best.part];
        a = !best ? null : X && best === X.upper ? armAct(best.part, true) : (best.part === 'armL' || best.part === 'armR') ? field(q).concat([null]) : act(best, q);
        if (SOFT && best && best.part === 'breast') overBreast.set(p, Math.sign(best.bc[0] + best.off[0]) || 1);   // 蓋在乳房上的衣服跟著乳房一起軟變形
      } else a = act(p, q);
      if (a) acts.set(p, a);
    }
    if (modePlan) for (const p of sh.prims) {   // 被手壓著／托著的乳房：往上往中間擠、更挺更圓（乳房零件和乳暈一起動）
      if (p.part !== 'breast' || p.cloth) continue;
      const sd = Math.sign(p.bc[0] + p.off[0]) || 1, d = modePlan.push[sd], k = modePlan.round[sd];
      const a = acts.get(p) || [0, 0, 0, null]; acts.set(p, [a[0] + d[0], a[1] + d[1], a[2] + d[2], a[3]]);
      if (k && p.k === 0 && p.r && !p.nip) { p.r = [p.r[0] * (1 - .04 * k), p.r[1] * (1 + .1 * k), p.r[2] * (1 - .05 * k)]; p.br = Math.max(p.br, ...p.r); }   // 前後更凸、上下稍扁＝圓潤挺
    }
    // 脫胸罩：胸罩抽出來以後，胸罩托出來的乳溝線、上乳弧線（braLine）也不見
    if (anim && anim.kind === 'bra' && anim.u > .6) sh.prims = sh.prims.filter(p => !p.braLine);
    for (const [p, a] of acts) {
      p.off = [p.off[0] + a[0], p.off[1] + a[1], p.off[2] + a[2]];
      if (a[3]) p.xf = p.xf ? H.compose(a[3], p.xf) : a[3];
    }
    // 抱胸：前臂橫過去那一條，外衣（T 恤垂下來的布）被手臂壓到後面——不然大胸穿 T 恤時布垂在手臂前面，看起來像手在背後（2026-11-22 使用者）
    //   T 恤從胸口垂下來的布是一條條直的長圓錐：只要跟這條重疊、又凸到手臂前面，就拿掉（手臂蓋住的地方，後面那層布還在）
    if (crossBand) {
      const lim = crossBand.y - .6;
      const span = (p) => p.k === 1 ? [Math.min(p.a[2], p.a[2] + p.ba[2]) + p.off[2], Math.max(p.a[2], p.a[2] + p.ba[2]) + p.off[2]] : [p.bc[2] + p.off[2] - (p.r ? p.r[2] : p.br), p.bc[2] + p.off[2] + (p.r ? p.r[2] : p.br)];
      const front = (p) => p.k === 1 ? Math.max(p.a[1], p.a[1] + p.ba[1]) + p.off[1] + Math.max(p.ra, p.rb) : p.bc[1] + p.off[1] + (p.r ? p.r[1] : p.br);
      sh.prims = sh.prims.filter((p) => {
        if (!p.cloth || p.under || p.sleeve || p.xf || p.part === 'armL' || p.part === 'armR') return true;
        if (Math.abs(p.bc[0] + p.off[0]) > crossBand.xMax) return true;
        const [lo, hi] = span(p); if (hi < crossBand.zLo || lo > crossBand.zHi) return true;
        if (front(p) <= lim) return true;
        overBreast.delete(p); return false;
      });
    }
    // 腿軟／大腿打開（手指插入的反應）：上半身整個往下 drop、腳底不動 → 膝蓋往前往外彎；大腿往外打開 open（腳往外移一點）
    if (!anim && m.fg && (m.fg.drop || m.fg.dropFrac || m.fg.open)) {
      const d = (m.fg.drop || 0) + (m.fg.dropFrac || 0) * Math.max(0, (P.hipz - .9) - P.ankle - 7), op = m.fg.open || 0;   // dropFrac：沉到屁股著地（癱坐）
      const L = (sh._legs || []).map(([h, k, a, sd, o]) => { const mv = (q) => o ? [q[0] + o[0], q[1] + o[1], q[2] + o[2]] : q; return { h: mv(h), k: mv(k), a: mv(a) }; });
      if (L.length === 2) {
        const cx0 = (L[0].h[0] + L[1].h[0]) / 2, sub = (a, c) => [a[0] - c[0], a[1] - c[1], a[2] - c[2]], len = (v) => Math.hypot(v[0], v[1], v[2]);
        const shift = (X, v) => ({ R: X.R, t: [X.t[0] + v[0], X.t[1] + v[1], X.t[2] + v[2]] });
        const legs = L.map((g) => {
          // 癱坐（dropFrac）：M 字腿——腳往前放到屁股前面、膝蓋往上往外立起來（不是青蛙腿往兩邊攤平）
          const km = Math.min(1, m.fg.dropFrac || 0);
          const sd = Math.sign(g.h[0] - cx0) || 1, h2 = [g.h[0] + sd * .2 * op, g.h[1], g.h[2] - d], a2 = [g.a[0] + sd * 1.1 * op * (1 - .45 * km), g.a[1] + 10 * km, g.a[2]];
          const l1 = len(sub(g.k, g.h)), l2 = len(sub(g.a, g.k)), D = sub(a2, h2), dl = Math.max(Math.abs(l1 - l2) + .1, Math.min(l1 + l2 - .02, len(D))), dir = nrm(D);
          const aa = (l1 * l1 - l2 * l2 + dl * dl) / (2 * dl), hh = Math.sqrt(Math.max(0, l1 * l1 - aa * aa)), pole = nrm([sd * ((.35 + op) * (1 - km) + .75 * km), 1 - .5 * km, 1.4 * km]);
          const pd = pole[0] * dir[0] + pole[1] * dir[1] + pole[2] * dir[2], n = nrm([pole[0] - dir[0] * pd, pole[1] - dir[1] * pd, pole[2] - dir[2] * pd]);
          const k2 = [h2[0] + dir[0] * aa + n[0] * hh, h2[1] + dir[1] * aa + n[1] * hh, h2[2] + dir[2] * aa + n[2] * hh];
          const thigh = shift(H.about(rotTo(sub(g.k, g.h), sub(k2, h2), 1), g.h), sub(h2, g.h));
          const shin = shift(H.about(rotTo(sub(g.a, g.k), sub(a2, k2), 1), g.k), sub(k2, g.k));
          return { sd, g, thigh, shin, foot: { R: [1, 0, 0, 0, 1, 0, 0, 0, 1], t: sub(a2, g.a) } };
        });
        for (const p of sh.prims) {
          const q = [p.bc[0] + p.off[0], p.bc[1] + p.off[1], p.bc[2] + p.off[2]];
          const onLeg = p.part === 'legs' || (p.cloth && (p.garm === 'bot' || p.bik === 'bot' || p.under) && q[2] < Math.min(legs[0].g.h[2], legs[1].g.h[2]) - 1.5);
          if (!onLeg) { if (p.xf) p.xf = { R: p.xf.R, t: [p.xf.t[0], p.xf.t[1], p.xf.t[2] - d] }; else p.off = [p.off[0], p.off[1], p.off[2] - d]; continue; }   // 有轉動的零件（手臂 IK、頭）：往下沉要加在世界座標，不能加在轉過的 off 裡
          const lg = legs[(Math.sign(q[0] - cx0) || 1) === legs[0].sd ? 0 : 1];
          const X = q[2] < lg.g.a[2] + .8 ? lg.foot : q[2] > lg.g.k[2] ? lg.thigh : lg.shin;
          p.xf = p.xf ? H.compose(X, p.xf) : X;
        }
        for (const st of sh.areolaStamps || []) st.q = [st.q[0], st.q[1], st.q[2] - d];
      }
    }
    // 乳房軟變形（同 droom 揉乳房的 kw：零件的每一點照「從根部往下多遠」推，根部 0、下緣全推；在 primDist 裡反推回去算距離）
    const softRoot = {};
    if (SOFT) for (const sd of [-1, 1]) {
      const L = sh.prims.filter(p => p.part === 'breast' && !p.cloth && !p.xf && (Math.sign(p.bc[0] + p.off[0]) || 1) === sd);
      if (!L.length) continue;
      let top = -1e9, bot = 1e9, cx = 0, cy = 0;
      for (const p of L) {
        const z = p.bc[2] + p.off[2], h = p.k === 0 && p.r ? p.r[2] : p.br * .6;
        top = Math.max(top, z + h); bot = Math.min(bot, z - h); cx += (p.bc[0] + p.off[0]) / L.length; cy += (p.bc[1] + p.off[1]) / L.length;
      }
      const o = SOFT[sd], g = Math.hypot(o[0], o[1], o[2]);
      if (top - bot < 1 || g < .01) continue;
      softRoot[sd] = { root: [cx, cy, top], L: top - bot, o };
      const put = (p) => { p.kw = { root: [cx - p.off[0], cy - p.off[1], top - p.off[2]], f: [0, 0, -1], L: top - bot, o }; p.br += g; };
      for (const p of L) put(p);
      for (const [p, s2] of overBreast) if (s2 === sd && !p.xf) put(p);
    }
    for (const st of sh.areolaStamps || []) {
      const sd = Math.sign(st.q[0]) || 1, d = modePlan ? modePlan.push[sd] : [0, 0, 0], k = modePlan ? modePlan.round[sd] : 0;
      const sr = softRoot[sd];   // 乳暈印子：照同一個軟變形往前推（kw 是反推，這裡正推）
      let e = [0, 0, 0];
      if (sr) { const t = Math.max(0, Math.min(1, (sr.root[2] - st.q[2]) / sr.L)), w = t * t * (3 - 2 * t); e = [sr.o[0] * w, sr.o[1] * w, sr.o[2] * w]; }
      st.q = [st.q[0] + sd * .3 * br + d[0] + e[0], st.q[1] + .45 * br + d[1] + .25 * k + e[1], st.q[2] + lift * .75 + d[2] + e[2]];
    }
    // 彎腰／往後仰（m.bend 度，正＝往前彎）：腰以上整個上半身（含手、頭、頭髮、衣服、乳房）繞腰轉；從腰往上 7 格內漸增，腿不動
    if (m.bend) {
      const piv = [0, 0, zW - 1], wOf = (z) => sm((z - (zW - 4)) / 7), T = (w) => H.about(H.rotX(-m.bend * w), piv);
      for (const p of sh.prims) {
        if (p.part === 'legs') continue;
        const w = wOf(p.bc[2] + p.off[2]); if (w <= 0) continue;
        const X = T(w); p.xf = p.xf ? H.compose(X, p.xf) : X;
      }
      for (const st of sh.areolaStamps || []) { const w = wOf(st.q[2]); if (w > 0) st.q = app(T(w), st.q); }
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
    if (r === 0 && g === 0 && (b === 255 || b === 160)) return 3;   // 下身（裙子、褲子）的布：深一點的灰
    if (r === 128 && g === 0 && b === 0) return 1;   // 絲襪
    return 0;
  }
  /** 衣服（使用者：灰色、微微透明，黑影模式）：身體那層上面，內衣、外衣各疊一層灰；看得到底下的身體輪廓，T 恤底下隱約看到胸罩。 */
  function veil(out, layer, outer) {
    // 2026-11-21 使用者：T 恤不要這麼透明（90% 還是太透）→ 外衣完全不透明（胸型改用布離身體多遠的陰影表現，見 drawFrame）；內衣照舊微微透明
    const GRAY = { 1: [168, 168, 180], 2: [124, 124, 138], 3: [132, 131, 146] }, K = outer ? { 1: 1, 2: 1, 3: 1 } : { 1: .72, 2: .82, 3: .72 }, OUT = { 1: [118, 116, 130, 200], 2: [96, 94, 110, 220], 3: [100, 98, 114, 210] };
    for (let i = 0; i < out.length; i += 4) {
      const c = clothAt(layer, i); if (!c) continue;
      // 2026-11-21 第二階段的布（外衣那層，照標記色）：黑色情趣布（255,128,0）不透明黑；絲襪（128,0,0）半透明深色；薄紗／濕身（0,255,255／0,170,170）半透明白、看得到乳暈
      if (outer) {
        const r0 = layer[i], g0 = layer[i + 1], b0 = layer[i + 2];
        if (r0 === 255 && g0 === 128 && b0 === 0) { out[i] = 26; out[i + 1] = 22; out[i + 2] = 32; out[i + 3] = 245; continue; }
        if (r0 === 128 && g0 === 0 && b0 === 0) { if (out[i + 3]) { for (let j = 0; j < 3; j++) out[i + j] = out[i + j] * .4 + [28, 24, 36][j] * .6; out[i + 3] = 236; } else { out[i] = 40; out[i + 1] = 36; out[i + 2] = 52; out[i + 3] = 190; } continue; }
        if (g0 === b0 && r0 === 0 && (g0 === 255 || g0 === 170)) { if (out[i + 3]) { for (let j = 0; j < 3; j++) out[i + j] = out[i + j] * .55 + [206, 206, 216][j] * .45; out[i + 3] = 230; } else { out[i] = 206; out[i + 1] = 206; out[i + 2] = 216; out[i + 3] = 110; } continue; }
      }
      // 2026-11-21 使用者：胸罩不要半透明，做成黑色 → 內衣那層裡的胸罩（布 250／214、滾邊 255,0,0）不透明黑；丁字褲照舊
      if (!outer) {
        const r0 = layer[i], g0 = layer[i + 1], b0 = layer[i + 2];
        const braCloth = (r0 === 250 && g0 === 250 && b0 === 252) || (r0 === 214 && g0 === 216 && b0 === 228), braTrim = r0 === 255 && g0 === 0 && b0 === 0;
        if (braCloth || braTrim) { const q = braTrim ? [60, 55, 74] : [22, 19, 28]; out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2]; out[i + 3] = 245; continue; }
      }
      const g = GRAY[c], k = K[c];
      if (out[i + 3]) {
        // 衣服底下不透出乳暈、乳頭（只透出身體輪廓）
        if ((out[i] === 72 && out[i + 1] === 58 && out[i + 2] === 84) || (out[i] === 88 && out[i + 1] === 72 && out[i + 2] === 100)) { out[i] = 51; out[i + 1] = 45; out[i + 2] = 64; }
        for (let j = 0; j < 3; j++) out[i + j] = out[i + j] * (1 - k) + g[j] * k; out[i + 3] = outer ? 236 : 220;   // 透明度一律一樣（乳暈原本是不透明的，不統一的話蓋上衣服還看得到一圈）
      } else if (outer) { out[i] = g[0]; out[i + 1] = g[1]; out[i + 2] = g[2]; out[i + 3] = 255; }   // 外衣（T 恤）垂空、後面沒有身體的地方：一樣是不透明的布
      else { const q = OUT[c]; out[i] = q[0]; out[i + 1] = q[1]; out[i + 2] = q[2]; out[i + 3] = q[3]; }   // 身體外面的布（袖口、褲頭兩側、胯下細繩）：深一點的半透明灰，淺色背景上才不會像白線
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
    const run = (keep, bare) => F.render(doll, body, 0, 0, { scale, cv, shape, deform: (sh, P, H) => { deform(sh, P, H, m); sh.prims = sh.prims.filter(keep); if (bare && sh.areolaStamps) sh.areolaStamps.length = 0; } });   // bare：衣服那幾層不畫乳暈印子（印子會蓋在衣服上面）
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
    // 衣服那幾層不畫皮膚上的標記（乳房輪廓弧線等 mat 2／摺線、乳暈印子、乳頭：浮在皮膚表面或直接印上去，會穿出衣服、在衣服上留一圈；T 恤做形狀時也不跟著乳頭凸起）
    if (hasU) veil(r.pixels, run(p => (!p.cloth || p.under) && p.mat !== 2 && !p.crease && !p.nip, true).pixels);
    if (hasO) {
      const o = run(p => (!p.cloth || !p.under) && p.mat !== 2 && !p.crease && !p.nip, true), px = r.pixels, od = o.depth;
      // T 恤上被底下的東西（乳暈、胸罩邊）穿出來的小洞：上下左右 7 格人偶單位內都碰得到布 → 也當成布（外衣是不透明的）
      { const Wo = o.width, Ho = o.height, op = o.pixels, R0 = Math.max(6, Math.round(7 * scale)), isC = (x, y) => { if (x < 0 || y < 0 || x >= Wo || y >= Ho) return false; const c = clothAt(op, (y * Wo + x) * 4); return c === 1 || c === 3; };
        const fill = [];
        for (let y = 0; y < Ho; y++) for (let x = 0; x < Wo; x++) {
          const j = (y * Wo + x) * 4; if (clothAt(op, j)) continue;   // 那一層空著（什麼都沒畫到）的也算洞
          let l = 0, rr = 0, u2 = 0, dn = 0;
          for (let t = 1; t <= R0 && !(l && rr && u2 && dn); t++) { if (!l && isC(x - t, y)) l = (y * Wo + x - t) * 4 + 1; if (!rr && isC(x + t, y)) rr = 1; if (!u2 && isC(x, y - t)) u2 = 1; if (!dn && isC(x, y + t)) dn = 1; }
          if (l && rr && u2 && dn) fill.push([j, l - 1]);   // 用左邊那塊布的顏色補（黑馬甲上的洞補黑的）
        }
        for (const [j, from] of fill) { op[j] = op[from]; op[j + 1] = op[from + 1]; op[j + 2] = op[from + 2]; op[j + 3] = 255; } }
      veil(px, o.pixels, true);
      // 外衣不透明，胸型靠 T 恤自己的形狀打光（光從上面來）：布面往下、往後斜（乳房下面垂下來那一片）暗一點，往上斜（上胸）亮一點。
      //   深度＝(y＋z)/32 → 往下一列：每往下 1 格人偶單位，布往前多少 s＝32·Δ深度·scale＋1（直立的面＝0）。先平均一下去掉雜訊。
      const Wd = o.width, Hd = o.height, n = Wd * Hd, sv = new Float32Array(n), wt = new Float32Array(n), op = o.pixels;
      for (let y = 1; y < Hd - 1; y++) for (let x = 0; x < Wd; x++) {
        const i = y * Wd + x; if (!clothAt(op, i * 4) || !clothAt(op, (i - Wd) * 4) || !clothAt(op, (i + Wd) * 4)) continue;
        const sl = 32 * (od[i + Wd] - od[i - Wd]) / 2 * scale + 1; if (!(Math.abs(sl) < 6)) continue;
        sv[i] = sl; wt[i] = 1;
      }
      const R = Math.max(2, Math.round(2 * scale)), blur = (src, dst, horiz) => {   // 平均 2 格人偶單位：布管一條條的起伏不要畫成條紋
        for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
          let a2 = 0; const lo = horiz ? Math.max(0, x - R) : Math.max(0, y - R), hi = horiz ? Math.min(Wd - 1, x + R) : Math.min(Hd - 1, y + R);
          for (let t = lo; t <= hi; t++) a2 += src[horiz ? y * Wd + t : t * Wd + x];
          dst[y * Wd + x] = a2;
        }
      };
      const t1 = new Float32Array(n), s2 = new Float32Array(n), w1 = new Float32Array(n), w2 = new Float32Array(n);
      blur(sv, t1, true); blur(t1, s2, false); blur(wt, w1, true); blur(w1, w2, false);
      for (let i = 0; i < n; i++) {
        const j = i * 4; if (!clothAt(op, j) || !px[j + 3] || !w2[i]) continue;
        const sl = s2[i] / w2[i], k = sl < 0 ? 1 - .22 * Math.min(1, -sl / .7) : 1 + .05 * Math.min(1, sl / 1.5);
        px[j] = Math.min(255, px[j] * k); px[j + 1] = Math.min(255, px[j + 1] * k); px[j + 2] = Math.min(255, px[j + 2] * k);
      }
    }
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
        const code = `const F=(${F.factorySource})();const motion=${motion};const fgArmPts=${fgArmPts};const fgArm=${fgArm};const braPiece=${braPiece};const pantyPiece=${pantyPiece};const deform=${deform};const shade=${shade};const clothAt=${clothAt};const veil=${veil};const drawFrame=${drawFrame};const CV=${JSON.stringify(CV)};const cache={};
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
  const CODE_HASH = (() => { const t = DROOM_URL + SCALE + String(motion) + String(fgArmPts) + String(fgArm) + String(braPiece) + String(pantyPiece) + String(deform) + String(drawFrame) + String(shade) + String(veil) + String(clothAt); let h = 5381; for (let i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0; return h.toString(36); })();
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
    // 2026-11-22 手指插入：鏡頭靠近＝整個黑影（連同玩家的手那層）一起放大 → 多一層 zoom 包住畫布和手
    FG.zoom = document.createElement('div');
    FG.zoom.className = 'cs-zoom';
    FG.zoom.style.cssText = 'position:relative;width:100%;height:100%;display:flex;align-items:flex-end;justify-content:center;transform-origin:50% 50%';
    FG.hand = document.createElement('canvas');
    FG.hand.width = canvas.width; FG.hand.height = canvas.height;
    FG.hand.style.cssText = 'position:absolute;pointer-events:none;filter:none';
    FG.hand.hidden = true;
    FG.zoom.append(canvas, FG.hand);
    wrap.appendChild(FG.zoom);
    talk.insertBefore(wrap, talk.firstChild);
    return wrap;
  }

  function spec() {
    try { return typeof window.RoomLookProvider === 'function' ? window.RoomLookProvider() : null; } catch { return null; }
  }

  /** 身形＋衣著＋姿勢 → droom 人偶（聊天和 testword 測試台共用）。st：脫衣進度 0～3；undressing：脫衣對話（美人魚坐姿）；
   *  mode：脫光後的姿勢（cover／fondle／touch），沒給就照關係（妻子以下 cover、妻子 wifePick）。 */
  function dollOf(s, st, undressing, mode) {
    const doll = F.lookToDoll(s.look || null, { outfit: s.outfit, undressStage: st, belly: s.belly });
    Object.assign(doll, shapeOf(s.look?.breast_shape));
    if (/外擴/.test(String(s.look?.breast_splay || ''))) doll.splay = 'wide';   // 外擴是另一個維度（2026-11-21 使用者：例如木瓜型＋外擴、母乳型＋外擴）
    doll.areola = areolaOf(s.look?.areola);
    // 穿著（使用者：一開始是 droom 那套白色 T 恤＋胸罩＋丁字褲；穿胸罩乳房變挺）：跟脫衣進度 undress.stage 走——
    //   0 白色 T 恤（裡面穿胸罩）＋丁字褲、1 胸罩＋丁字褲、2 只剩丁字褲、3 全裸。不畫她衣櫃裡的衣服（裙子也不畫）。
    doll.skirt = '';
    if (undressing) doll._body = 'mermaid';
    // 一般聊天、脫光以後（使用者）：妻子以下害羞——一手遮胸（壓得胸部更挺更圓）、一手遮下體、側臉看旁邊；
    //   妻子以上主動——站著兩手托著乳房揉，或坐下來摸陰唇、抬頭（每次打開聊天隨機一種）
    if (!undressing) doll._tier = s.tier || (s.wife ? 'wife' : 'stranger');   // 被摸的反應照關係帶
    if (!undressing && st >= 3) {
      const md = mode || (!s.wife ? 'cover' : wifePick === 'touch' ? 'touch' : 'fondle');
      if (md !== 'none') { doll._mode = md; if (md === 'touch') doll._body = 'mermaid'; }
    }
    let noBra = false;
    const w0 = wearOf(s.outfit), bikini = !!(w0 && w0.top === 'bikini');   // 2026-11-22 使用者：比基尼脫掉就是全裸（沒有胸罩、內褲那兩階）
    if (bikini && st >= 1) { doll.pants = ''; if (st <= 2) doll.wear = { top: null, bottom: 'bikini', dress: false }; return doll; }   // 上面解掉了、下面還在（脫的動畫中間那一階）
    if (st === 0) {   // 2026-11-21 使用者：畫她衣櫃裡的衣服（對照表 WEAR_OF）
      const w = wearOf(s.outfit);
      if (w) { doll.wear = w; noBra = !!w.noBra; if (!noBra) doll.underBra = true; if (w.noPants) doll.pants = ''; if (bikini) doll.bikiniSupport = true; }   // 比基尼：托高成水球、不集中、外擴照舊
      else if (w === null) doll.cloth = 'bra';
      else { doll.cloth = 'tee'; doll.underBra = true; }
    }
    else if (st === 1) doll.cloth = 'bra';
    if (st <= 1 && !noBra) { doll.braSupport = true; doll.gap = 'close'; doll.splay = 0; }   // splay 0：擠在一起時乳頭朝正前方（不然往外轉 20°，乳暈跑出罩杯外側＝穿模）   // 穿胸罩：托高＋往中間集中（使用者：胸罩集中托高，乳溝超明顯，尤其巨乳）
    if (st <= 2 && !(st === 0 && doll.wear && doll.wear.noPants)) doll.pants = 'tie_thong';   // 綁帶丁字褲（使用者：要像內褲、脫的時候解開兩側的帶子）
    return doll;
  }

  /** 換人／換身形 → 重算兩組動畫；第一格到了才顯示。 */
  function prepare(s) {
    if (!F) { loadDroom().then(sync).catch(e => console.warn('chat_shadow', e)); return false; }
    // 脫衣對話中（使用者）：美人魚坐姿；脫衣進度釘在 pinStage，脫衣動畫播完才換到下一階
    const undressing = pinStage != null;
    const st = Math.max(0, Math.min(3, Number(undressing ? pinStage : s.undressStage) || 0));
    const doll = dollOf(s, st, undressing, null);
    const key = JSON.stringify(doll);
    if (cur && cur.key === key) return isReady(cur);
    if (cur) cur.dead = true;
    if (canvas) canvas.dataset.f = '';   // 新的一組：格名跟上一組一樣（breathe0…）也要重畫
    const job = cur = { key, sets: { breathe: [], talk: [] }, dead: false, P: F.proportions ? F.proportions(doll) : null, cv: cvOf(doll), stage: st, bikini: !!(doll.wear && (doll.wear.top === 'bikini' || doll.wear.bottom === 'bikini')) };
    const todo = [];
    if (undressing) {
      // 脫衣對話（使用者）：平常顯示立繪，黑影只在她答應脫的時候出來播動畫 → 只預載下一件的脫衣動畫
      if (st < 3) { const a = animOf(doll, st); job.anim = a; job.sets[a] = []; for (let f = 0; f < nOf(a); f++) todo.push([a, f]); }
    } else {
      // 順序（使用者：摸她沒動作）：先第一格呼吸（人先出來）→ 被摸的反應（站著才摸得到）→ 其他呼吸 → 說話
      todo.push(['breathe', 0]);
      if (cvOf(doll) === CV) for (const r of REACTS) { job.sets[r] = []; for (let f = 0; f < NA_OF[r]; f++) todo.push([r, f]); }
      for (let f = 1; f < N; f++) todo.push(['breathe', f]);
      for (let f = 0; f < N; f++) todo.push(['talk', f]);
      if (cvOf(doll) === CV && !doll._mode) for (const a of ANGS) { job.sets[a] = []; for (let f = 0; f < NA_OF[a]; f++) todo.push([a, f]); }   // 生氣說話（站著、還沒脫光）
      if (doll._mode === 'touch') { job.sets.peak = []; for (let f = 0; f < NA_OF.peak; f++) todo.push(['peak', f]); }   // 忽然仰頭（偶爾播）
      if (cvOf(doll) === CV && doll._mode !== 'touch') for (const c of ['col_d', 'col_q', 'col_s']) { job.sets[c] = []; for (let f = 0; f < NA_OF[c]; f++) todo.push([c, f]); }   // 噴水後癱坐（2026-11-22）：先在背景算好（算過的存起來，下次直接拿），放開時才坐得下去
    }
    job.todo = todo; job.doll = doll; job.running = 0;
    runJob(job);
    return false;
  }
  /** 這一組要再多算一段（例如手指插入的反應）：排到最前面；工人都閒著就再開。 */
  function ensureSet(job, pose) {
    if (!job || job.dead || job.sets[pose]) return;
    job.sets[pose] = [];
    const add = []; for (let f = 0; f < nOf(pose); f++) add.push([pose, f]);
    job.todo = add.concat(job.todo || []);
    if (!job.running) runJob(job);
  }
  function runJob(job) {
    const doll = job.doll;
    const runner = async () => {
      job.running++;
      try { while (!job.dead && job.todo.length) {
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
      } } finally { job.running--; }
    };
    for (let i = 0; i < Math.max(1, workers.length); i++) void runner();   // 每個 worker 一條（第一格呼吸一定先拿走）
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
    if (FG.st !== 'idle') return;   // 手指插入的鏡頭靠近中：畫布放大了，不要拿放大後的位置去對腳底
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
  /** 這一階要預載哪一段脫衣動畫：一般照 ANIMS；比基尼 0＝解上面（胸罩那段）、1～2＝解下面（內褲那段）。 */
  function animOf(doll, st) {
    const w = doll.wear;
    if (w && w.top === 'bikini') return 'bra';
    if (w && w.bottom === 'bikini') return 'panties';
    return ANIMS[st];
  }
  function animDone(a) {
    animPlay = null; pinStage = a.to; sync();
    if (a.then != null) { animPlay = { kind: 'panties', to: a.then, then: null, t0: 0, wait: performance.now() }; play(); }
  }
  /** test_room_summon.js 在她決定脫一件時叫（from→to）。動畫還沒算好就等一下（最多 25 秒），算不出來就直接換。 */
  function undress(from, to) {
    if (pinStage == null || !cur || from >= 3) { if (pinStage != null) { pinStage = to; sync(); } return; }
    // 2026-11-22 使用者：脫比基尼跟脫胸罩一樣（手伸到背後解開）→ 上面先（胸罩那段），再接下面（解開兩側的結，跟丁字褲一樣）
    const bik = !!(cur.bikini && from === 0 && to >= 3);
    animPlay = { kind: bik ? 'bra' : ANIMS[from], to: bik ? 2 : to, then: bik ? to : null, t0: 0, wait: performance.now() };
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
        else if (t - animPlay.wait > 25000) { animDone(animPlay); }   // 等太久（還沒算好）：不播，直接換
      }
      if (animPlay && animPlay.t0) {
        const i = beatFrame(animPlay.kind, t - animPlay.t0);
        if (i >= nOf(animPlay.kind)) animDone(animPlay);   // 播完：黑影淡出回到立繪，開始預載下一件（比基尼：接著播脫下面）
        else if (canvas.dataset.f !== animPlay.kind + i) draw(set[i], animPlay.kind + i);
      }
      raf = requestAnimationFrame(tick);
      return;
    }
    if (COL.st !== 'none' && FG.st === 'idle') {   // 癱坐：坐下去（一次）→ 癱坐循環 → 時間到站起來（坐下去倒著播）；蓋過呼吸、說話、被摸
      reactPlay = null; angPlay = null;
      // 坐下去的格子一格一格算好就一格一格播（不用等全部算好；手機上全部算完要十幾秒，那段時間她會一直站著）；癱坐循環還沒好就停在坐下的最後一格
      const nd = nOf('col_d'), D = cur.sets.col_d || [], Sx = cur.sets.col_s || [];
      let k = '', i = 0;
      if (COL.st === 'wait' && D[0]) { COL.st = 'down'; COL.t0 = t; COL.fi = 0; }
      if (COL.st === 'down') {
        const want = Math.floor((t - COL.t0) / 1000 * COL_FPS);
        while (COL.fi < Math.min(want, nd - 1) && D[COL.fi + 1]) COL.fi++;
        if (COL.fi < Math.min(want, nd - 1)) COL.t0 = t - COL.fi * 1000 / COL_FPS;   // 下一格還沒算好：停在這一格等
        if (COL.fi >= COL_IMPACT && !COL.impactAt) COL.impactAt = t;   // 屁股著地：忍不住又噴
        if (COL.fi >= nd - 1 && want >= nd) COL.st = 'hold';
        k = 'col_d'; i = COL.fi;
      }
      // 坐下去以後：還在噴就一邊噴一邊抖（col_q），噴完才癱坐（col_s）；那段還沒算好就停在坐下的最後一格
      const sprayEnd = COL.impactAt ? COL.impactAt + Math.max(...SPRAY[COL.style].map((w) => w[1])) + 250 : 0, Q = cur.sets.col_q || [];
      if (COL.st === 'hold') {
        if (t < sprayEnd && full(Q, nOf('col_q'))) { k = 'col_q'; i = Math.floor((t - COL.impactAt) / 1000 * COL_Q_FPS) % nOf('col_q'); }
        else if (t >= sprayEnd && full(Sx, nOf('col_s'))) { COL.st = 'sit'; COL.t0 = t; COL.until = t + COL_SIT; }
        else { k = 'col_d'; i = nd - 1; }
      }
      if (COL.st === 'sit') { if (t > COL.until) { COL.st = 'up'; COL.t0 = t; } else { k = 'col_s'; i = Math.floor((t - COL.t0) / 1000 * 6) % nOf('col_s'); } }
      if (COL.st === 'up') { i = nd - 1 - Math.floor((t - COL.t0) / 1000 * COL_FPS); if (i < 0) { colReset(); mode = ''; } else k = 'col_d'; }
      if (k && cur.sets[k] && cur.sets[k][i]) { COL.disp = { k, i }; if (canvas.dataset.f !== k + i) draw(cur.sets[k][i], k + i); }
      if (COL.st !== 'none') { raf = requestAnimationFrame(tick); return; }
    }
    if (FG.st === 'in' && FG.pose && full(cur.sets[FG.pose], nOf(FG.pose))) FG.shown = FG.pose;   // 新的一段算好了才換（沒好之前照舊播上一段，不要掉回呼吸）
    const fgK = FG.st === 'in' && FG.shown && cur.sets[FG.shown] && full(cur.sets[FG.shown], nOf(FG.shown)) ? FG.shown : '';
    if (fgK) {   // 手在褲子裡：她的反應一直循環（蓋過呼吸、說話、被摸）；噴水那一下播痙攣
      reactPlay = null; angPlay = null;
      FG.clock += dt * FG_FPS;
      const spK = 'fg_' + fgK.charAt(3) + 'x', spI = FG.squirtAt ? Math.floor((t - FG.squirtAt) / FG_SP_MS) : -1;
      let k = fgK, i = Math.floor(FG.clock) % nOf(fgK);
      if (spI >= 0 && spI < nOf(spK) && cur.sets[spK] && full(cur.sets[spK], nOf(spK))) { k = spK; i = spI; }
      FG.disp = { k, i };
      if (canvas.dataset.f !== k + i) draw(cur.sets[k][i], k + i);
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
  let portraitMode = false, wasOpen = false, fadeT = 0, wifePick = 'fondle', openedAt = 0;
  function sync() {
    const sheet = document.getElementById('portrait-sheet');
    if (!ensureEl()) return;
    const open = !!(sheet && !sheet.hidden);
    if (open && !wasOpen) { portraitMode = false; wifePick = Math.random() < .5 ? 'fondle' : 'touch'; openedAt = performance.now(); }
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
    if (!on && FG.st !== 'idle') { FG.squirted = false; fingerReset(); }   // 聊天關了／換立繪：鏡頭、手都收掉
    if (!on && COL.st !== 'none') colReset();   // 關掉聊天：癱坐結束
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
    fingerBind();
    canvas.addEventListener('click', (ev) => {
      if (FG.eatClick) { FG.eatClick = false; return; }   // 按住下體（手指插入）放開時的那一下不算摸
      if (performance.now() - openedAt < 450) return;   // 點房間的她打開聊天、手機緊接著補的那一下 click：不算摸她、也不算點背景（不然聊天一開就被關掉）
      const [x, y] = toCanvas(ev), f = cur && cur.sets[mode] && (cur.sets[mode].find(Boolean));
      if (!f) return;
      const xi = Math.round(x), yi = Math.round(y);
      const solid = xi >= 0 && yi >= 0 && xi < f.width && yi < f.height && f.data[(yi * f.width + xi) * 4 + 3] > 0;
      if (!solid) { document.getElementById('portrait-backdrop')?.click(); return; }
      if (COL.st !== 'none') return;   // 癱坐在地上：身體位置跟站著不一樣，先不算摸
      const zone = zoneAt(x, y);
      // 摸到就有反應（使用者：摸她沒動作）；還沒解鎖的地方一樣會反抗／遮，只是不算動作、她不說話
      if (zone) {
        window.RoomTouch?.zone(zone);
        const k = 'r_' + zone;
        if (cur && cur.sets[k]) { if (!full(cur.sets[k], nOf(k))) bump(cur, k); reactPlay = { kind: k, t0: 0, wait: performance.now() }; play(); }
      }
    });
  }

  // ---------------------------------------------------------------- 手指插入（2026-11-22 使用者，第三版）
  //   按住陰唇：可以玩弄（RoomTouch.finger.can()＝插入手指解鎖沒）才靠近——鏡頭以胸口為中心慢慢放大，到陰唇在對話框上緣上面一點點停；
  //   不行＝她馬上反抗（摸下體的反應＋罵你），不靠近。靠近後玩家的手從畫面右下伸過來、越過褲頭從上面伸進去（不是從下面）。
  //   一直按著：往左滑＝摸陰唇、往右滑＝扣子宮（揉子宮口）；按著的時候一輪一輪做（一輪＝一個動作，結算一次狀態，動作圖＋一句約一秒）；
  //   放開＝結束（手拿出來）回到原來畫面。她的反應一直循環（fg_r0～r2 抗拒、fg_w0～w2 迎合；熱戀以前抗拒、程度照她的感覺）。
  //   噴水不是常態：某一輪做完她到了最高那段才噴一次——往畫面前方、微微往上噴開（像開香檳）。
  const FG = { st: 'idle', p: 0, t: 0, S: 1, O: null, box0: null, holdT: 0, eatClick: false, mode: 'idle', roundAt: 0, loop: 0, last: 0, zoom: null, hand: null, geo: null, ui: null, pose: '', shown: '', clock: 0, pid: null, x0: 0, choice: null, squirtAt: 0, squirtCheck: 0, wasIn: false };
  const FG_APPROACH = 1500, FG_REACH = 1700, FG_OUT = 700, FG_BACK = 700, FG_HOLD = 220, FG_FPS = 8, FG_ROUND = 1000, FG_SWIPE = 26, FG_SQUIRT = 720, FG_SP_MS = 70;
  const fgEase = (x) => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };
  /** 畫布像素 → zoom 層（沒放大時）的座標。畫布是 object-fit: contain、靠下置中。 */
  function fgLocal(px, py) {
    const cw = canvas.offsetWidth, ch = canvas.offsetHeight, k = Math.min(cw / canvas.width, ch / canvas.height);
    return [canvas.offsetLeft + (cw - canvas.width * k) / 2 + px * k, canvas.offsetTop + (ch - canvas.height * k) + py * k];
  }
  const fgPx = (x, z) => [(CV.ax + x * 1.1) * SCALE, (CV.ay - z) * SCALE];   // 人偶座標 → 畫布像素（跟 zoneAt 反過來）
  /** 這一次的幾何：身體中線、陰唇、胸口、褲頭高度（沒有褲頭＝全裸）。 */
  function fgGeo() {
    const P = cur && cur.P; if (!P) return null;
    let doll = null; try { doll = JSON.parse(cur.key); } catch { doll = null; }
    const S = P.S, C = P.C, T = P.T, zW = S - .6 * T;
    let cx = .9;   // 身體中線：照這一格的像素量（站姿重心偏一邊）
    const img = cur.sets.breathe && cur.sets.breathe.find(Boolean);
    if (img) {
      const [gx, gy] = fgPx(.9, C + 4), y = Math.round(gy), A = (x) => x >= 0 && x < img.width && img.data[(y * img.width + x) * 4 + 3] > 0;
      let l = Math.round(gx), r = l; if (A(l)) { while (A(l - 1)) l--; while (A(r + 1)) r++; cx = ((l + r) / 2 / SCALE - CV.ax) / 1.1; }
    }
    const w = doll && doll.wear, bot = w && w.bottom;
    let band = null;
    if (w && (w.dress || ['pants', 'shorts', 'short', 'long', 'pencil', 'pleat', 'qipao'].includes(bot))) band = zW + .3;
    else if (bot === 'bikini') band = C + 6.2;
    else if (doll && doll.pants === 'tie_thong') band = C + 7.4;
    else if (doll && doll.pants) band = C + 9;
    return { cx, C, S, T, gz: C + 1.4, chestZ: S - .3 * T, band, arm: fgArmPts(cx, band, C + 1.4) };
  }
  /** 放大：直接把 zoom 層的版面放大（不用 CSS transform——transform 縮放會被瀏覽器糊掉，像素要清楚），以胸口 O 為中心。 */
  function fgApply(scale) {
    const z = FG.zoom; if (!z) return;
    if (scale <= 1.0001 || !FG.O) { z.style.position = 'relative'; z.style.left = z.style.top = ''; z.style.width = z.style.height = '100%'; return; }
    const [w0, h0] = FG.box0, [ox, oy] = FG.O;
    z.style.position = 'absolute'; z.style.width = (w0 * scale) + 'px'; z.style.height = (h0 * scale) + 'px';
    // 她腿軟往下沉（反應的 drop）：鏡頭跟著往下，陰唇還是停在對話框上面
    const fi = fgFrame(), dr = fi >= 0 ? (motion(FG.disp.k, fi, nOf(FG.disp.k)).fg || {}).drop || 0 : 0;
    const k = Math.min(canvas.offsetWidth / canvas.width, canvas.offsetHeight / canvas.height) || 1;
    // 噴水／痙攣那一下：整個畫面跟著抖（越來越小）
    const sq = FG.squirtAt ? (performance.now() - FG.squirtAt) / FG_SQUIRT : 9, shk = sq < 1 ? (1 - sq) * 5 : 0, tt = performance.now() / 1000;
    z.style.left = (ox - ox * scale + shk * Math.sin(tt * 97)) + 'px'; z.style.top = (oy - oy * scale - dr * SCALE * k + shk * .7 * Math.cos(tt * 83)) + 'px';
  }
  function fgStart() {
    const g = fgGeo(); if (!g) return false;
    FG.geo = g;
    const O = fgLocal(...fgPx(g.cx, g.chestZ)), Gl = fgLocal(...fgPx(g.cx, g.gz));
    const wr = FG.zoom.getBoundingClientRect(), box = document.getElementById('talk-box'), top = box ? box.getBoundingClientRect().top : innerHeight * .7;
    const chestY = wr.top + O[1], groinY = wr.top + Gl[1];
    FG.box0 = [FG.zoom.offsetWidth, FG.zoom.offsetHeight];
    FG.O = O; FG.S = Math.max(1.15, Math.min(5, (top - 10 - chestY) / Math.max(4, groinY - chestY)));   // 陰唇停在對話框上緣上面一點點
    FG.st = 'approach'; FG.p = 0; FG.t = 0; FG.mode = 'idle'; FG.choice = null; FG.pose = ''; FG.squirtAt = 0; FG.squirted = false; FG.colQ = false;
    fgRun();
    return true;
  }
  function fingerReset() {
    if (FG.wasIn) document.dispatchEvent(new CustomEvent('chat-shadow-finger', { detail: { on: false } }));   // 手收回來了：對話框、插入圖照舊
    FG.wasIn = false;
    FG.st = 'idle'; FG.p = 0; FG.t = 0; FG.geo = null; FG.pose = ''; FG.shown = ''; FG.disp = null; FG.mode = 'idle';
    fgApply(1); fgSwipe(false);
    if (FG.hand) { FG.hand.hidden = true; FG.hand.getContext('2d').clearRect(0, 0, FG.hand.width, FG.hand.height); }
    if (FG.loop) cancelAnimationFrame(FG.loop); FG.loop = 0;
    placeFeet();
  }
  /** 現在她該做哪一個反應（fg_r0…fg_w2）。 */
  function fgPoseOf(sp) { return 'fg_' + (sp && sp.fgWelcome ? 'w' : 'r') + Math.max(0, Math.min(2, Number(sp && sp.fgLevel) || 0)); }
  /** 噴水粒子（像開香檳：往畫面前方、微微往上噴開；正面看＝往外一圈散開、整團往上衝再落一點，越飛越近水珠越大越淡）。
   *  src＝人偶座標（陰唇）；el＝從開始噴過了幾毫秒；wins＝哪幾段時間在噴 [[開始, 結束], …]；每顆飛 life 毫秒。 */
  //   2026-11-22 使用者：噴出去要快、有速度感，水滴落下正常 → 噴出去很快（前 0.1 秒就飛到大半、拉出一條殘影），之後慢下來、照重力落下
  function fgSpray(od, Wd, Hd, src, el, wins, life = 900) {
    const G = 70;   // 重力（人偶單位／秒²）
    const pos = (j, tau, ang, spread) => { const k = 1 - Math.exp(-tau / .06); return [src[0] + Math.cos(ang) * spread * k, src[1] + (Math.sin(ang) * spread * .55 + 12) * k - .5 * G * tau * tau]; };
    const put = (X, Y, al, hi) => { if (X < 0 || Y < 0 || X >= Wd || Y >= Hd) return; const k = (Y * Wd + X) * 4; od[k] = hi ? 248 : 206; od[k + 1] = hi ? 252 : 228; od[k + 2] = 255; od[k + 3] = Math.max(od[k + 3], al); };
    for (const [a, b] of wins) {
      if (el < a || el > b + life) continue;
      const N = Math.max(12, Math.round((b - a) / 6));
      for (let j = 0; j < N; j++) {
        const born = a + (b - a) * j / N, ms = el - born; if (ms <= 0 || ms >= life) continue;
        const tau = ms / 1000, u = ms / life;
        const h1 = Math.sin(j * 12.9898 + a * .013) * 43758.5453, r1 = h1 - Math.floor(h1), h2 = Math.sin(j * 78.233 + a * .07) * 12345.678, r2 = h2 - Math.floor(h2);
        const core = j % 3 === 0, ang = r1 * 2 * Math.PI, spread = (core ? 8 : 22) * (0.35 + .65 * r2);
        const [x, z] = pos(j, tau, ang, spread), [px, py] = fgPx(x, z);
        const k = 1 - Math.exp(-tau / .06), sz = 1 + Math.round(3 * Math.min(1, k * 1.2)), al = Math.round(235 * (1 - Math.max(0, (u - .55) / .45)));
        // 剛噴出去（很快）：往回拉一條殘影
        if (tau < .14) {
          const [x0, z0] = pos(j, Math.max(0, tau - .03), ang, spread), [qx, qy] = fgPx(x0, z0), n = Math.max(1, Math.ceil(Math.hypot(px - qx, py - qy)));
          for (let s2 = 0; s2 <= n; s2++) put(Math.round(qx + (px - qx) * s2 / n), Math.round(qy + (py - qy) * s2 / n), Math.round(al * (.35 + .5 * s2 / n)), false);
        }
        for (let oy = 0; oy < sz; oy++) for (let ox = 0; ox < sz; ox++) put(Math.round(px) + ox, Math.round(py) + oy, al, ox === 0 && oy === 0 && sz > 1);
      }
    }
  }
  // ---------------------------------------------------------------- 癱坐（2026-11-22 使用者）
  //   被摸到噴水以後，手收回去她不會站著：腿軟、雙腿打開成 M 字、癱坐在地上；屁股著地那一下忍不住又噴（每個妹子不一樣：
  //   once 噴一下／faucet 像水龍頭噴三秒／double 噴一下又再噴一下，summon 的 fgSquirt）。坐一陣子（40 秒）或關掉聊天才起來。
  const COL = { st: 'none', t0: 0, impactAt: 0, until: 0, style: 'once', disp: null, loop: 0 };
  const COL_FPS = 16, COL_SIT = 40000, COL_IMPACT = 4, COL_Q_FPS = 14;
  const SPRAY = { once: [[0, 300]], faucet: [[0, 3000]], double: [[0, 260], [800, 1060]] };
  function colStart() {
    if (!cur || cur.cv !== CV) return;
    const sp = spec(); COL.style = (sp && SPRAY[sp.fgSquirt]) ? sp.fgSquirt : 'once';
    for (const c of ['col_s', 'col_q', 'col_d']) { ensureSet(cur, c); bump(cur, c); }
    COL.st = 'wait'; COL.t0 = 0; COL.impactAt = 0; COL.until = 0;
    play(); colRun();
  }
  function colReset() { COL.st = 'none'; COL.disp = null; COL.impactAt = 0; if (FG.hand && FG.st === 'idle') FG.hand.hidden = true; }
  function colRun() { if (!COL.loop) COL.loop = requestAnimationFrame(colTick); }
  /** 癱坐時手那一層只畫噴水（屁股著地那一下）；撞地「碰！」那一下整個畫面震一下。 */
  function colTick(now) {
    COL.loop = 0;
    if (COL.st === 'none' || !wrap || wrap.hidden) { if (COL.st !== 'none') colReset(); return; }
    if (FG.zoom && FG.st === 'idle') {
      const ie = COL.impactAt ? now - COL.impactAt : -1, sprayMs = Math.max(...SPRAY[COL.style].map((w) => w[1])) + 250;
      // 撞地「碰！」大震一下；之後噴水的那段身體一直小小地抖（抖的那段動畫還沒算好也看得到在抖）
      const amp = ie >= 0 && ie < 420 ? Math.max(9 * Math.pow(1 - ie / 420, 1.6), 2.2) : ie >= 0 && ie < sprayMs ? 2.2 : 0;
      if (amp > .3) { FG.zoom.style.left = (amp * Math.sin(ie * .09)).toFixed(1) + 'px'; FG.zoom.style.top = (amp * .9 * Math.abs(Math.cos(ie * .07))).toFixed(1) + 'px'; FG.shaking = true; }
      else if (FG.shaking) { FG.zoom.style.left = FG.zoom.style.top = ''; FG.shaking = false; }
    }
    const H = FG.hand;
    if (H && FG.st === 'idle') {
      const el = COL.impactAt ? now - COL.impactAt : -1, wins = SPRAY[COL.style], end = Math.max(...wins.map((w) => w[1])) + 950;
      if (el >= 0 && el < end && COL.disp) {
        H.style.left = canvas.offsetLeft + 'px'; H.style.top = canvas.offsetTop + 'px'; H.style.width = canvas.offsetWidth + 'px'; H.style.height = canvas.offsetHeight + 'px';
        const g = FG.geo || fgGeo(), P = cur && cur.P;
        if (g && P) {
          const mf = motion(COL.disp.k, COL.disp.i, nOf(COL.disp.k)), d = (mf.fg.dropFrac || 0) * Math.max(0, (P.hipz - .9) - P.ankle - 7);
          const c2 = H.getContext('2d'), out = c2.createImageData(H.width, H.height);
          fgSpray(out.data, H.width, H.height, [g.cx + .2, g.gz - d - .2], el, wins);
          c2.putImageData(out, 0, 0); H.hidden = false;
        }
      } else if (!H.hidden) { H.getContext('2d').clearRect(0, 0, H.width, H.height); H.hidden = true; }
    }
    COL.loop = requestAnimationFrame(colTick);
  }
  /** 左右滑的提示（左摸陰唇、右扣子宮）：不能按（手指一直按在她身上），只是告訴你往哪滑、現在在做哪個。 */
  function fgSwipe(show) {
    if (!FG.ui) {
      if (!show) return;
      const box = document.createElement('div'); box.id = 'fg-swipe';
      box.style.cssText = 'position:fixed;left:0;right:0;z-index:90;pointer-events:none;display:flex;justify-content:space-between;align-items:flex-end;padding:0 8px;box-sizing:border-box';
      const mk = (id, label) => { const b = document.createElement('div'); b.dataset.fg = id; b.textContent = label;
        b.style.cssText = 'font-size:1.02em;padding:.55em .9em;border-radius:10px;border:2px solid rgba(255,255,255,.55);background:rgba(20,18,36,.6);color:#fff6fb;transition:transform .12s,background .12s,opacity .12s'; return b; };
      box.append(mk('labia', '◀ 摸陰唇'), mk('cervix_rub', '扣子宮 ▶'));
      document.getElementById('portrait-sheet')?.appendChild(box);
      FG.ui = box;
    }
    FG.ui.style.display = show ? 'flex' : 'none';
    if (!show) return;
    // 放在畫面下面：互動鍵列在的話放在它上面；對話框在下半部（還沒移到最上面）就放在對話框上面
    const tb = document.getElementById('talk-box'), ta = document.getElementById('talk-acts');
    let top = innerHeight - 14;
    if (tb) { const r = tb.getBoundingClientRect(); if (r.height > 0 && r.top > innerHeight * .5) top = r.top; }
    if (ta && !ta.hidden) { const r = ta.getBoundingClientRect(); if (r.height > 0 && r.top < top + 4 && r.bottom > top - 80) top = Math.min(top, r.top); }
    FG.ui.style.bottom = Math.max(0, innerHeight - top + 10) + 'px';
    const F = window.RoomTouch && window.RoomTouch.finger;
    for (const b of FG.ui.children) {
      const on = FG.choice === b.dataset.fg, ok = !F || F.can(b.dataset.fg) || on;
      b.style.background = on ? 'rgba(160,40,96,.9)' : 'rgba(20,18,36,.6)';
      b.style.transform = on ? 'scale(1.12)' : '';
      b.style.opacity = ok || F.busy() ? '' : '.4';
    }
  }
  /** 放開：結束（手拿出來、回到原來畫面）。 */
  function fgEnd() {
    if (FG.pid != null) { try { canvas.releasePointerCapture(FG.pid); } catch { /* 已經放了 */ } }
    FG.pid = null; FG.choice = null; fgSwipe(false);
    clearTimeout(FG.holdT); FG.holdT = 0;
    if (FG.st === 'approach') FG.st = 'back';
    else if (FG.st === 'reach' || FG.st === 'in') { const wasReach = FG.st === 'reach'; FG.st = 'out'; FG.t = wasReach ? FG.t : 1; window.RoomTouch?.finger?.end?.(); }
  }
  /** 每一輪（2026-11-22 使用者）：半身立繪在畫面中央淡入淡出、半透明，整段大約一秒。 */
  function fgPulse() {
    const src = document.getElementById('portrait-img')?.getAttribute('src');
    if (!src) return;
    let el = document.getElementById('fg-pulse');
    if (!el) {
      el = document.createElement('img'); el.id = 'fg-pulse'; el.alt = '';
      el.style.cssText = 'position:fixed;left:50%;top:40%;transform:translate(-50%,-50%);height:min(70svh,640px);width:auto;max-width:96vw;object-fit:contain;pointer-events:none;z-index:85;opacity:0';
      document.getElementById('portrait-sheet')?.appendChild(el);
    }
    if (el.getAttribute('src') !== src) el.src = src;
    try { el.getAnimations().forEach((a) => a.cancel()); el.animate([{ opacity: 0 }, { opacity: .5, offset: .4 }, { opacity: .5, offset: .6 }, { opacity: 0 }], { duration: 1000, easing: 'ease-in-out' }); } catch { /* 舊瀏覽器：不做 */ }
  }
  function fgRun() { if (!FG.loop) { FG.last = 0; FG.loop = requestAnimationFrame(fgTick); } }
  function fgTick(now) {
    FG.loop = 0;
    if (FG.st === 'idle' || !wrap || wrap.hidden) { if (FG.st !== 'idle') fingerReset(); return; }
    const dt = FG.last ? Math.min(100, now - FG.last) : 16; FG.last = now;
    const sp = (!fgTick.spAt || now - fgTick.spAt > 300) ? (fgTick.sp = spec(), fgTick.spAt = now, fgTick.sp) : fgTick.sp;
    const F = window.RoomTouch && window.RoomTouch.finger;
    if (FG.st === 'reach' || FG.st === 'in') {
      const k = fgPoseOf(sp); if (k !== FG.pose || !cur.sets[k]) { FG.pose = k; ensureSet(cur, k); bump(cur, k); }
      // 到了最高那段：癱坐排到最前面先算（每次按著只排一次；順序：現在這段 → 噴水痙攣 → 坐下去 → 癱坐），噴了以後放開才坐得下去
      if (k.slice(-1) === '2' && !FG.colQ) { FG.colQ = true; for (const c of ['col_s', 'col_q', 'col_d', 'fg_' + k.charAt(3) + 'x', k]) { ensureSet(cur, c); bump(cur, c); } }
    }
    if (FG.st === 'approach') { FG.p = Math.min(1, FG.p + dt / FG_APPROACH); if (FG.p >= 1) { FG.st = 'reach'; FG.t = 0; } }
    else if (FG.st === 'back') { FG.p = Math.max(0, FG.p - dt / FG_BACK); if (FG.p <= 0) { const sq = FG.squirted; FG.squirted = false; fingerReset(); if (sq) colStart(); return; } }   // 噴過：手收回去以後癱坐
    else if (FG.st === 'reach') { FG.t = Math.min(1, FG.t + dt / FG_REACH); if (FG.t >= 1) { FG.st = 'in'; FG.mode = 'idle'; fgSwipe(true); } }
    else if (FG.st === 'in') {
      // 按著往左右滑：選哪個；有選、上一輪做完（她那句出來了）、而且過了一秒 → 下一輪
      const want = FG.choice, busy = F ? F.busy() : false;
      if (want && !busy && now - FG.roundAt >= FG_ROUND) {
        if (F && F.round(want)) { FG.mode = want === 'labia' ? 'rub' : 'dig'; FG.roundAt = now; FG.squirtCheck = now + 700; fgPulse(); }
        else FG.mode = 'idle';
      } else if (!want && !busy && now - FG.roundAt >= FG_ROUND) FG.mode = 'idle';
      // 這一輪做完她到了最高那段 → 噴一次（不是一直噴）
      if (FG.squirtCheck && now >= FG.squirtCheck && !busy) { FG.squirtCheck = 0; const s2 = spec(); if (s2 && Number(s2.fgLevel) >= 2) { FG.squirtAt = now; if (!FG.squirted) { FG.squirted = true; for (const c of ['col_s', 'col_q', 'col_d']) { ensureSet(cur, c); bump(cur, c); } } } }   // 噴過：放開以後會癱坐——坐下去的格子馬上排到最前面算
      if (!fgTick.uiAt || now - fgTick.uiAt > 250) { fgTick.uiAt = now; fgSwipe(true); }
    } else if (FG.st === 'out') { FG.t = Math.max(0, FG.t - dt / FG_OUT); if (FG.t <= 0) FG.st = 'back'; }
    const zp = FG.st === 'approach' || FG.st === 'back' ? fgEase(FG.p) : 1;
    fgApply(1 + (FG.S - 1) * zp);
    fgDraw(now);
    FG.loop = requestAnimationFrame(fgTick);
  }
  /** 她現在畫的是反應的哪一格（手那一層要跟著她腿軟往下）。 */
  function fgFrame() { return FG.st === 'in' && FG.disp && cur && cur.sets[FG.disp.k] ? FG.disp.i : -1; }   // 現在畫的是哪一段的哪一格（FG.disp，tick 畫的時候記下）
  const FG_GRIP = { r0: [.8, .2], r2: [.4], rx: [.4], w0: [.35], w1: [.35] };   // 她抓玩家手腕（M→E 那一節）的地方（跟 deform 一樣）   // 她抓玩家前臂的地方（跟 deform 一樣）：那裡她的手蓋在上面
  /** 玩家的手（像素風，比她的身體深一點的暖灰、深色描邊）。整條手臂沿一條路走：畫面右下（畫面外）→ 褲頭右上方 → 從褲頭往下伸進去 → 陰唇。
   *  過了褲頭的那一段藏在布裡（淡淡的鼓起來）；全裸＝指尖過了陰唇就看不到（進去了）。摸陰唇＝指尖在陰唇上上下摸；扣子宮＝整根伸到最裡面、一下一下往裡扣。 */
  function fgDraw(now) {
    const H = FG.hand, g = FG.geo; if (!H || !g) return;
    const showHand = FG.st === 'reach' || FG.st === 'in' || FG.st === 'out';
    H.style.left = canvas.offsetLeft + 'px'; H.style.top = canvas.offsetTop + 'px'; H.style.width = canvas.offsetWidth + 'px'; H.style.height = canvas.offsetHeight + 'px';
    const c2 = H.getContext('2d'); c2.clearRect(0, 0, H.width, H.height);
    H.hidden = !showHand; if (!showHand) return;
    const fi = fgFrame(), mf = fi >= 0 ? motion(FG.disp.k, fi, nOf(FG.disp.k)) : null, drop = mf && mf.fg ? mf.fg.drop : 0;
    const A = g.arm, nude = g.band == null, sh0 = (q) => [q[0], q[1] - drop];
    const E = sh0(A.E), M = sh0(A.M), L = sh0(A.L), A0 = A.A0, Lz = g.gz - drop;
    const Q = [A0, M, E, L], seg = [], cum = [0];
    for (let i = 0; i + 1 < Q.length; i++) { const l = Math.hypot(Q[i + 1][0] - Q[i][0], Q[i + 1][1] - Q[i][1]); seg.push(l); cum.push(cum[i] + l); }
    const end = cum[cum.length - 1];
    const at = (d) => { if (d > end) { const v = [L[0] - E[0], L[1] - E[1]], l = Math.hypot(v[0], v[1]) || 1; return [L[0] + v[0] / l * (d - end), L[1] + v[1] / l * (d - end)]; } d = Math.max(-40, d); let i = 0; while (i < seg.length - 1 && d > cum[i + 1]) i++; const u = (d - cum[i]) / seg[i]; return [Q[i][0] + (Q[i + 1][0] - Q[i][0]) * u, Q[i][1] + (Q[i + 1][1] - Q[i][1]) * u]; };
    const dE = cum[2], dLip = nude ? dE + Math.hypot(E[0] - L[0], E[1] - (Lz - .2)) : dE, dRest = dE + Math.max(0, Math.hypot(E[0] - L[0], E[1] - (Lz + .4)));   // dRest：指尖停在陰唇上（還沒進去）
    const t = FG.st === 'in' ? 1 : FG.t, sec = now / 1000;
    let dTip;
    if (t < .5) dTip = (dE - .3) * fgEase(t / .5);
    else dTip = dE - .3 + (dRest - dE + .3) * fgEase((t - .5) / .5);
    if (FG.st === 'in') {
      if (FG.mode === 'rub') dTip = dRest - .4 + 1.2 * Math.sin(sec * 2 * Math.PI / .55);            // 摸陰唇：指尖在陰唇上上下摸（不進去）
      else if (FG.mode === 'dig') dTip = end + 1.2 + 1.0 * Math.sin(sec * 2 * Math.PI / .45);       // 扣子宮：整根伸到最裡面、一下一下往裡扣
      else dTip = dRest + .15 * Math.sin(sec * 2 * Math.PI / 1.6);                                    // 停著：輕輕放在陰唇上
    }
    const FL = 3.4, PL = 3.2, ARM = 60;
    const W = (d) => { const back = dTip - d; return back < FL ? 2.1 : back < FL + PL ? 3.4 : back < FL + PL + 1.2 ? 3.0 : 3.6 + Math.min(1, (back - FL - PL) / 10) * .8; };
    const tmp = fgDraw.tmp || (fgDraw.tmp = [document.createElement('canvas'), document.createElement('canvas')]);
    const layers = tmp.map((cv) => { cv.width = H.width; cv.height = H.height; const c = cv.getContext('2d', { willReadFrequently: true }); c.clearRect(0, 0, cv.width, cv.height); c.fillStyle = '#000'; return c; });
    const disc = (c, q, r) => { const [x, y] = fgPx(q[0], q[1]); c.beginPath(); c.arc(x, y, r * 1.1 * SCALE / 2 + .6, 0, 2 * Math.PI); c.fill(); };
    for (let d = dTip; d > dTip - ARM; d -= .25) disc(d > dLip ? layers[1] : layers[0], at(d), W(d));
    const tipQ = at(dTip), b0 = at(dTip - FL), b1 = at(dTip - FL - .8), dv = [b0[0] - b1[0], b0[1] - b1[1]], dl = Math.hypot(dv[0], dv[1]) || 1, nrmv = [dv[1] / dl, -dv[0] / dl];
    disc(dTip > dLip ? layers[1] : layers[0], tipQ, 2.0);
    disc(dTip - FL > dLip ? layers[1] : layers[0], [b0[0] + nrmv[0] * 1.6, b0[1] + nrmv[1] * 1.6], 1.6);
    // 她的手抓在前臂上：那裡挖掉，讓她的手看起來蓋在上面
    // 她的手抓在前臂上：抓的地方附近，她那一格是皮膚（手）的像素就讓她的手蓋在上面
    const grips = ((fi >= 0 && FG_GRIP[FG.disp.k.slice(3)]) || []).map((v) => fgPx(...sh0(A.wr(v)))), fr = fi >= 0 ? cur.sets[FG.disp.k][fi] : null, GR = 5.5 * SCALE;
    const herHand = (x, y) => { if (!fr || !grips.some(([gx, gy]) => (x - gx) ** 2 + (y - gy) ** 2 < GR * GR)) return false; const j = (y * fr.width + x) * 4; if (!fr.data[j + 3]) return false; return fr.data[j] + fr.data[j + 1] + fr.data[j + 2] < 330; };
    const Wd = H.width, Hd = H.height, out = c2.createImageData(Wd, Hd), od = out.data;
    const srcs = layers.map((c) => c.getImageData(0, 0, Wd, Hd).data);
    const on = (sd, x, y) => x >= 0 && y >= 0 && x < Wd && y < Hd && sd[(y * Wd + x) * 4 + 3] >= 128;
    for (let L2 = 1; L2 >= 0; L2--) {
      const sd = srcs[L2], alpha = L2 === 0 ? 255 : nude ? 0 : 80; if (!alpha) continue;
      for (let y = 0; y < Hd; y++) for (let x = 0; x < Wd; x++) {
        if (!on(sd, x, y)) continue;
        if (L2 === 1 && on(srcs[0], x, y)) continue;
        if (L2 === 0 && herHand(x, y)) continue;
        const i = (y * Wd + x) * 4, edge = !on(sd, x - 1, y) || !on(sd, x + 1, y) || !on(sd, x, y - 1) || !on(sd, x, y + 1);
        const c = edge ? [26, 20, 30] : [74, 60, 70];
        od[i] = c[0]; od[i + 1] = c[1]; od[i + 2] = c[2]; od[i + 3] = alpha;
      }
    }
    // 噴水（某一輪做完她到了最高那段才噴一次）：像開香檳——往畫面前方、微微往上噴開（fgSpray）
    if (FG.squirtAt && now - FG.squirtAt < FG_SQUIRT + 950) fgSpray(od, Wd, Hd, [g.cx + .2, Lz - .3], now - FG.squirtAt, [[0, 260]]);
    c2.putImageData(out, 0, 0);
  }
  function fingerBind() {
    // 按住下體 0.22 秒：可以玩弄才靠近（不行＝她馬上反抗）；點一下照舊是摸陰唇。按著不放：往左右滑選、放開＝結束
    canvas.addEventListener('pointerdown', (ev) => {
      if (FG.st !== 'idle' || COL.st !== 'none' || !cur || cur.cv !== CV) return;
      const [x, y] = toCanvas(ev); if (zoneAt(x, y) !== 'groin') return;
      clearTimeout(FG.holdT);
      const pid = ev.pointerId, x0 = ev.clientX;
      FG.holdT = setTimeout(() => {
        FG.holdT = 0; FG.eatClick = true;
        const F = window.RoomTouch && window.RoomTouch.finger;
        if (!(F && F.can())) {   // 不能玩弄：不靠近，她馬上反抗
          window.RoomTouch?.zone('groin');
          if (cur && cur.sets.r_groin) { if (!full(cur.sets.r_groin, nOf('r_groin'))) bump(cur, 'r_groin'); reactPlay = { kind: 'r_groin', t0: 0, wait: performance.now() }; play(); }
          return;
        }
        if (!fgStart()) return;
        FG.pid = pid; FG.x0 = x0; FG.choice = null;
        try { canvas.setPointerCapture(pid); } catch { /* 已經放開了 */ }
        // 手伸進去：通知 summon（對話框字出完一秒收、圖只閃一秒）；三段反應先算
        FG.wasIn = true; document.dispatchEvent(new CustomEvent('chat-shadow-finger', { detail: { on: true } }));
        const sp = spec(), ty = fgPoseOf(sp).slice(3, 4), now0 = fgPoseOf(sp);
        for (const k of ['fg_' + ty + '0', 'fg_' + ty + '1', 'fg_' + ty + '2', 'fg_' + ty + 'x', now0]) { ensureSet(cur, k); bump(cur, k); }   // 算的順序：現在這段 → 痙攣 → 高潮 → 有感 → 普通
      }, FG_HOLD);
    });
    canvas.addEventListener('pointermove', (ev) => {
      if (FG.pid == null || ev.pointerId !== FG.pid) return;
      if (FG.st !== 'in') { FG.x0 = ev.clientX; return; }   // 手還沒伸進去：起點跟著手指（伸進去以後才算滑）
      const dx = ev.clientX - FG.x0;
      FG.choice = dx <= -FG_SWIPE ? 'labia' : dx >= FG_SWIPE ? 'cervix_rub' : null;
    });
    const up = (ev) => { if (FG.holdT) { clearTimeout(FG.holdT); FG.holdT = 0; } if (FG.pid != null && ev.pointerId === FG.pid) fgEnd(); };
    canvas.addEventListener('pointerup', up);
    canvas.addEventListener('pointercancel', up);
  }

  // 生氣／開心也看她說的話（2026-11-21 使用者：話裡有「哼」「討厭」「生氣」「變態」這類字也算生氣）；「不生氣」「別生氣」不算
  const ANGRY_RE = /哼|討厭|讨厌|(?<![不沒没別别])生氣|(?<![不沒没別别])生气|變態|变态|色狼|走開|滾開|閉嘴|氣死|可惡|混蛋|笨蛋/;
  const HAPPY_RE = /哈哈|呵呵|嘻嘻|嘿嘿|噗哧|噗嗤|笑死|好好笑|開心|开心|太好了/;
  let talkMood = null;   // 這句開口時 summon 給的情緒（angry／happy／null）
  /** 她的字一個一個出來 → 說話動作；停下來 0.9 秒後回到呼吸。開口那一刻看 summon 的情緒；之後每出一個字看話裡有沒有生氣／笑的字。 */
  function talking() {
    const now = performance.now(), fresh = now > talkUntil;
    talkUntil = now + 900;
    const who = (document.getElementById('portrait-name')?.textContent || '').trim();
    if (!who || who === '你' || who === '旁白') return;
    if (fresh) { const sp = spec(); talkMood = sp && sp.angry ? 'angry' : sp && sp.happy ? 'happy' : null; }
    if (angPlay) return;
    const text = document.getElementById('portrait-meta')?.textContent || '';
    const kind = talkMood === 'angry' || ANGRY_RE.test(text) ? 'angry' : talkMood === 'happy' || HAPPY_RE.test(text) ? 'happy' : null;
    if (kind) maybeEmote(now, kind);
  }
  /** 生氣＝叉腰／抱胸，開心＝笑彎腰／摀嘴仰頭笑（同一種情緒 30 秒內用同一個）；還沒算好就插隊先算，這次照一般說話。 */
  function maybeEmote(now, kind) {
    if (angPlay || !cur || !cur.sets.ang_akimbo) return;
    if (!angPick || angPick.kind !== kind || now - angPick.at > 30000) { const L = EMO_OF[kind]; angPick = { kind, pose: L[Math.random() < .5 ? 0 : 1], at: now }; }
    angPick.at = now;
    const k = angPick.pose;
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

  // 2026-11-22 後台算圖（server/shadow_render.mjs 用 Node 跑這個檔）：不碰畫面，只把算圖的函式交出去
  if (globalThis.__CHAT_SHADOW_HEADLESS) { Object.assign(globalThis.__CHAT_SHADOW_HEADLESS, { setF: (f) => { F = f; }, dollOf, wearOf, motion, drawFrame, nOf, playSeq, CV, SCALE, N }); return; }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  // ---------------------------------------------------------------- testword 測試台（2026-11-21 使用者：黑影人動作測試，選體型、參數、衣著、動作，按播放）
  /** 這個動作怎麼播：[[第幾格, 停多久 ms], …]。 */
  function playSeq(pose) {
    const n = nOf(pose);
    if (pose === 'breathe' || pose === 'talk') return Array.from({ length: n }, (_, i) => [i, 1000 / FPS[pose]]);
    if (REACTS.includes(pose)) return REACT_SEQ.map((i, k) => [i, REACT_MS[k]]);
    if (ANG[pose]) {
      const A = ANG[pose], out = [];
      for (let i = 0; i < A.enter; i++) out.push([i, A.ms(i)]);
      for (let r = 0; r < 3; r++) for (let i = A.loop[0]; i <= A.loop[1]; i++) out.push([i, A.ms(i)]);
      for (const i of A.exit) out.push([i, A.ms(i)]);
      return out;
    }
    if (BEAT[pose]) return Array.from({ length: n }, (_, i) => [i, BEAT[pose](i / (n - 1))]);
    return Array.from({ length: n }, (_, i) => [i, 150]);
  }
  /** spec：{look, undressStage, wife, tier, mode}；pose：動作。算好全部格子（有存過的直接拿）→ {frames, seq, doll}。 */
  async function testRender(spec, pose, onProgress) {
    await loadDroom();
    const UND = { shirt: 0, bra: 1, panties: 2 };
    // 2026-11-22 使用者：測試時比基尼還是舊的脫法 → 身上那套是比基尼時，脫衣動作一律照遊戲裡的脫法：先上面（手伸到背後解開，胸罩那段）、再下面（解開兩側的結）
    const bik = (wearOf(spec.outfit) || {}).top === 'bikini';
    if (bik && (pose in UND || pose === 'bikini')) pose = 'bikini';
    const parts = pose === 'bikini' ? [['bra', 0], ['panties', 2]] : [[pose, null]];
    const frames = [], seq = []; let doll = null, total = 0, done = 0;
    for (const [ps] of parts) total += nOf(ps);
    for (const [ps, st0] of parts) {
      let st = Math.max(0, Math.min(3, Number(spec.undressStage) || 0)), undressing = false, mode = spec.mode || null;
      if (st0 != null) { st = st0; undressing = true; }
      else if (ps in UND) { st = UND[ps]; undressing = true; }
      if (ps === 'peak') { st = 3; mode = 'touch'; }
      const d = dollOf(spec, st, undressing, mode), job = { key: JSON.stringify(d) }, n = nOf(ps), base = frames.length, part = [];
      doll = doll || d;
      let next = 0;
      const worker1 = async () => {
        while (next < n) {
          const f = next++, k = fkey(job, ps, f);
          let img = await cacheGet(k);
          if (!img) {
            const r = await renderFrame(d, ps, f);
            if (r.err) throw new Error(r.err);
            img = new ImageData(new Uint8ClampedArray(r.px), r.w, r.h);
            void cachePut(k, img);
          }
          part[f] = img;
          if (onProgress) onProgress(++done, total);
        }
      };
      await Promise.all(Array.from({ length: Math.max(1, workers.length) }, worker1));
      frames.push(...part);
      for (const [i, ms] of playSeq(ps)) seq.push([base + i, ms]);
    }
    return { frames, seq, doll, pose };
  }

  window.ChatShadow = { sync, undress, shapeOf, areolaOf, motion, deform, shade, ready: (k) => !!(cur && full(cur.sets[k], nOf(k))), P: () => cur && cur.P,
    test: { render: testRender, poses: () => ['breathe', 'talk', ...REACTS, ...ANGS, ...ANIMS, 'bikini', 'peak', 'fg_r0', 'fg_r1', 'fg_r2', 'fg_w0', 'fg_w1', 'fg_w2', 'fg_rx', 'fg_wx', 'col_d', 'col_q', 'col_s'] } };
})();
