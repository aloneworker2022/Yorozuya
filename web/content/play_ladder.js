/** 猥褻五階 × 三型。搭訕語氣仍走 summoners 四系；這份只管玩弄梯子。 */

export const PLAY_TYPES = {
  talk: { id: "talk", zh: "言語調戲" },
  touch: { id: "touch", zh: "觸碰玩弄" },
  expose: { id: "expose", zh: "猥褻露出" },
};
export const PLAY_TYPE_IDS = ["talk", "touch", "expose"];
export const PLAY_STEPS = [
  { idx: 1, name: "起手" },
  { idx: 2, name: "調戲" },
  { idx: 3, name: "越線" },
  { idx: 4, name: "猥褻" },
  { idx: 5, name: "交配" },
];
export const PLAY_STEP_LV = [0, 1, 2, 3, 4, 6];
// 公園每一句＝一次嘗試。舊 1/15 是「幾小時才擲一次」的分母，用在約會拍會永遠停在起手。
const OPENER0 = 4;
const REL_DROP = 1;
const SKIP5 = [200, 120, 80, 40, 20, 3, 2];
const SKIP_MUL = [4, 3, 2.5, 2, 1.6, 1.3, 1.1];

const m = (id, name, how, cmd) => ({ id, name, how, cmd });

export const DEFAULT_PLAY_LADDERS = {
  talk: [
    [
      m("pl_talk_1_1", "閒聊眼前", "從樹、風、椅子這些眼前的東西開口，先當普通路人把話說上。", "說 這時候出來剛好"),
      m("pl_talk_1_2", "問她來做什麼", "問她是散步、等人還是路過。問題要普通，不先碰身體。", "說 妳也來散步嗎"),
      m("pl_talk_1_3", "稱讚口氣", "誇她講話好聽、笑起來順耳，把稱讚當開門，不立刻色。", "說 妳講話很好聽"),
      m("pl_talk_1_4", "報名字問她", "先報自己的名字，再問她怎麼稱呼。把認識說成順水推舟。", "說 我叫那個，妳呢"),
      m("pl_talk_1_5", "接話不放", "她回一句就再問一句，不給空檔走開。還是日常聊天。", "說 所以呢然後呢"),
      m("pl_talk_1_6", "聊氣氛", "講光線、人少、今晚風，把兩人留在同一段閒話裡。", "說 這裡人不多耶"),
    ],
    [
      m("pl_talk_2_1", "黃色笑話", "丟一個擦邊的笑話，看她接不接。接了就再往下講。", "說 我講個不好的"),
      m("pl_talk_2_2", "誇身材", "用說話點她腰、腿、胸的線條，還假裝在稱讚穿搭。", "說 妳身材真的很好"),
      m("pl_talk_2_3", "低聲叫寶貝", "靠近把聲音壓低，用只有她聽得到的稱呼試探。", "說 寶貝，看我一下"),
      m("pl_talk_2_4", "問有沒有人", "問她是不是一個人、有沒有男友，語氣輕薄。", "說 沒人陪妳嗎"),
      m("pl_talk_2_5", "說想看看近的", "講想靠近一點看她的臉，話裡帶想親的意思。", "說 靠近一點看妳"),
      m("pl_talk_2_6", "講她笑想親", "盯著她嘴說笑起來想親，還說自己開玩笑。", "說 妳這樣笑很想親"),
    ],
    [
      m("pl_talk_3_1", "下賤稱呼", "改叫淫娃、小騷貨這類，看她罵還是愣。", "說 小騷貨看我"),
      m("pl_talk_3_2", "當眾點下面", "壓低聲音講她下面、胸，像只有兩人聽到。", "說 下面是不是熱了"),
      m("pl_talk_3_3", "逼她承認", "要她親口說想不想被碰，不說就反覆問。", "說 說妳想不想"),
      m("pl_talk_3_4", "說她欠摸", "講她表情就是欠摸、欠親，用話壓她。", "說 妳一臉就欠摸"),
      m("pl_talk_3_5", "講她會濕", "直接形容她會出水、腿會夾，不碰只講。", "說 妳現在會濕吧"),
      m("pl_talk_3_6", "命令開口", "要她叫自己的名字或叫哥哥，當口令。", "說 叫我一聲"),
    ],
    [
      m("pl_talk_4_1", "話到就吻", "講完「親一下」直接吻上去，不給她組織句子。", "親 嘴唇"),
      m("pl_talk_4_2", "捧臉深吻", "邊講邊捧臉吻，舌頭伸進去。", "親 嘴唇"),
      m("pl_talk_4_3", "吻的時候摸胸", "嘴唇不離，手同時覆上胸部隔衣揉。", "摸 胸部"),
      m("pl_talk_4_4", "咬唇再摸", "咬她下唇，手從腰滑到胸。", "摸 胸部"),
      m("pl_talk_4_5", "當眾邊親邊揉", "人看得到的距離親她，手在胸上。", "摸 胸部"),
      m("pl_talk_4_6", "用話按著吻", "叫她不准躲，吻住再伸手進衣服。", "摸 胸部"),
    ],
    [
      m("pl_talk_5_1", "命令她坐上來", "用話指揮她跨上來，自己解開對準。", "磨 下面"),
      m("pl_talk_5_2", "邊罵邊插", "下賤稱呼不中斷，同時頂進去。", "磨 下面"),
      m("pl_talk_5_3", "要她求", "不插、逼她把「要」說出口才給。", "提議 做愛"),
      m("pl_talk_5_4", "口令姿勢", "用說話指定她轉過身、彎腰、自己分開。", "提議 做愛"),
      m("pl_talk_5_5", "邊做邊逼她講", "抽插時要她報有多舒服、多賤。", "磨 下面"),
      m("pl_talk_5_6", "叫她求射裡面", "用話逼她求中出，動作不停。", "磨 下面"),
    ],
  ],
  touch: [
    [
      m("pl_touch_1_1", "握手", "伸手要握，握完多留一秒再放。當普通禮貌。", "說 握個手"),
      m("pl_touch_1_2", "稱讚頭髮", "誇髮質，指尖只碰到髮尾，問她怎麼保養。", "說 頭髮很漂亮"),
      m("pl_touch_1_3", "稱讚皮膚", "誇手或手臂皮膚細，指腹輕輕貼一下手背。", "說 皮膚真好"),
      m("pl_touch_1_4", "幫撥頭髮", "說吹到眼睛，伸手把頭髮撥到耳後。", "說 頭髮吹到了"),
      m("pl_touch_1_5", "輕拍肩膀", "講到重點時拍一下肩，立刻拿開。", "說 對吧"),
      m("pl_touch_1_6", "碰手腕", "指方向時碰到她手腕，像不小心。", "說 這邊"),
    ],
    [
      m("pl_touch_2_1", "攬肩", "手臂輕輕搭上她肩，帶她往旁邊走一步。", "摸 腰"),
      m("pl_touch_2_2", "碰手臂", "說話時手覆在她小臂上，不拿開。", "摸 腰"),
      m("pl_touch_2_3", "十指扣", "從握手變成扣指，把她手留在自己掌心。", "摸 腰"),
      m("pl_touch_2_4", "摸後背", "手滑到肩胛，隔衣來回。", "摸 腰"),
      m("pl_touch_2_5", "靠太近", "胸貼著她肩或背，呼吸打在耳邊。", "摸 腰"),
      m("pl_touch_2_6", "摸腰外側", "手落到腰側，拇指扣著。", "摸 腰"),
    ],
    [
      m("pl_touch_3_1", "摟緊腰", "整條手臂環住腰，把她帶進自己懷裡。", "摸 腰"),
      m("pl_touch_3_2", "摸大腿", "手落到大腿外側，隔布來回。", "摸 大腿"),
      m("pl_touch_3_3", "隔衣摸臀", "掌心覆上臀，輕輕抓。", "摸 臀部"),
      m("pl_touch_3_4", "抬下巴", "拇指抬她下巴逼她看自己。", "摸 腰"),
      m("pl_touch_3_5", "按後頸", "手扣後頸，不讓她低頭逃。", "摸 腰"),
      m("pl_touch_3_6", "貼著走", "下腹貼她臀或腰，帶她走。", "摸 腰"),
    ],
    [
      m("pl_touch_4_1", "隔衣摸奶", "手覆上胸部揉，隔著衣服。", "摸 胸部"),
      m("pl_touch_4_2", "伸進衣服", "從下擺伸進去貼皮膚摸胸。", "摸 胸部"),
      m("pl_touch_4_3", "隔布摸陰唇", "手從裙底或褲腰伸到陰唇。", "摸 陰唇"),
      m("pl_touch_4_4", "揉胸捏乳", "隔衣抓乳，指腹找乳頭。", "摸 胸部"),
      m("pl_touch_4_5", "摸臀縫", "手指沿臀縫往下，隔布壓住。", "摸 臀部"),
      m("pl_touch_4_6", "掀裙摸", "掀開裙擺把手伸進去。", "掀 裙子"),
    ],
    [
      m("pl_touch_5_1", "抱著插入", "把她抱離地或按在身上對準插。", "磨 下面"),
      m("pl_touch_5_2", "從背後進", "轉過她、按腰，從後面頂進去。", "磨 下面"),
      m("pl_touch_5_3", "按著做", "把她按在椅、樹或牆上抽插。", "磨 下面"),
      m("pl_touch_5_4", "邊摸邊插", "一手揉胸一手固定，下身進去。", "磨 下面"),
      m("pl_touch_5_5", "抬腿進", "抬她一條腿對準插。", "磨 下面"),
      m("pl_touch_5_6", "扣著腰頂", "雙手扣腰往自己身上撞。", "磨 下面"),
    ],
  ],
  expose: [
    [
      m("pl_exp_1_1", "稱讚臉", "盯著五官誇，視線停在嘴唇、眼睛。還像在看臉。", "看 她"),
      m("pl_exp_1_2", "稱讚鎖骨", "視線落到鎖骨和領口，誇線條。", "看 她"),
      m("pl_exp_1_3", "看腿", "視線在小腿、膝停住，誇腿形。", "看 她"),
      m("pl_exp_1_4", "誇身材線", "用看的把腰、胸、臀掃過，講很勻稱。", "看 她"),
      m("pl_exp_1_5", "誇露出的肌膚", "點她袖口、領口露出的皮膚，說白、說細。", "看 她"),
      m("pl_exp_1_6", "誇手臂肩線", "看她手臂和肩，講有線條、好看。", "看 她"),
    ],
    [
      m("pl_exp_2_1", "盯胸", "視線釘在胸部，不假裝看臉。", "看 胸部"),
      m("pl_exp_2_2", "盯腿間", "視線往裙擺、腿根看。", "看 臀部"),
      m("pl_exp_2_3", "要她轉一圈", "說想看背面、看腰，讓她轉身。", "說 轉一圈給我看"),
      m("pl_exp_2_4", "誇胸型", "直接講形狀、大小，看她遮不遮。", "看 胸部"),
      m("pl_exp_2_5", "誇臀", "視線停在臀，講翹、講圓。", "看 臀部"),
      m("pl_exp_2_6", "靠近看皮膚", "把臉靠近鎖骨或頸側看毛孔、看汗。", "看 她"),
    ],
    [
      m("pl_exp_3_1", "撥衣領", "手指把領口往外撥，看鎖骨以下。", "掀 裙子"),
      m("pl_exp_3_2", "掀裙角", "指尖勾裙擺掀一點。", "掀 裙子"),
      m("pl_exp_3_3", "拉上衣", "把下擺往上提，露出腰。", "脫 上衣"),
      m("pl_exp_3_4", "鬆腰帶", "解腰帶或拉褲頭，不立刻脫光。", "脫 褲子"),
      m("pl_exp_3_5", "撥肩帶", "把肩帶撥掉一邊，看她抓不抓。", "脫 上衣"),
      m("pl_exp_3_6", "要她自己掀", "用話要她自己把衣服掀給他看。", "說 自己掀起來"),
    ],
    [
      m("pl_exp_4_1", "露點", "把胸衣撥開或上衣掀到露出乳頭。", "脫 胸罩"),
      m("pl_exp_4_2", "露底", "掀裙或拉褲，讓陰唇或內褲外露。", "掀 裙子"),
      m("pl_exp_4_3", "脫上衣", "把上衣剝掉，當眾只剩內衣或裸胸。", "脫 上衣"),
      m("pl_exp_4_4", "當眾掀到底", "裙子掀到腰，不讓她拉下來。", "掀 裙子"),
      m("pl_exp_4_5", "拉下內衣", "把胸罩拉下，乳房彈出。", "脫 胸罩"),
      m("pl_exp_4_6", "剝內褲", "把內褲褪到腿上，下身空著。", "脫 內褲"),
    ],
    [
      m("pl_exp_5_1", "當眾插入", "不遮、就在能被看見的地方進去。", "磨 下面"),
      m("pl_exp_5_2", "不讓她遮", "拉開她擋胸、擋下面的手，同時頂進去。", "磨 下面"),
      m("pl_exp_5_3", "看著人做", "把她轉到面向路或燈，從後面進。", "磨 下面"),
      m("pl_exp_5_4", "露出來抽插", "衣服還敞著，每一下都看得見交合。", "磨 下面"),
      m("pl_exp_5_5", "腿分開給看", "把她腿拉開固定，插進去給空氣看。", "磨 下面"),
      m("pl_exp_5_6", "射在外面展示", "拔出來射在胸或腹，要她看著。", "磨 下面"),
    ],
  ],
};

export function playTypeZh(id) {
  return PLAY_TYPES[id]?.zh || "言語調戲";
}

export function openerDenom(stageIdx) {
  const st = Math.max(0, Math.min(6, Number(stageIdx) || 0));
  return Math.max(1, OPENER0 - REL_DROP * st);
}

/** 走梯子：起手依七段，手段每一階 ×2。七段 0＝4／8／16／32／64。成功一次本階與下一階 −5。 */
export function stepWalkDenom(step, stageIdx) {
  const s = Math.max(1, Math.min(5, Number(step) || 1));
  return openerDenom(stageIdx) * (2 ** (s - 1));
}

export function emptyPlayHeat(stageIdx = 0) {
  const out = [0];
  for (let s = 1; s <= 5; s++) out[s] = stepWalkDenom(s, stageIdx);
  return out;
}

/** 七段升了：現在的分母一律 −REL_DROP（關係，不是手段）。 */
export function applyRelDrop(su) {
  if (!su) return;
  su.playHeat = su.playHeat || emptyPlayHeat(su.stageIdx || 0);
  for (let s = 1; s <= 5; s++) {
    su.playHeat[s] = Math.max(1, (su.playHeat[s] || stepWalkDenom(s, su.stageIdx)) - REL_DROP);
  }
}

export function cloneLadders(src) {
  const o = src || DEFAULT_PLAY_LADDERS;
  const out = {};
  for (const t of PLAY_TYPE_IDS) {
    const steps = o[t] || DEFAULT_PLAY_LADDERS[t];
    out[t] = PLAY_STEPS.map((s, i) => {
      const row = (steps[i] || DEFAULT_PLAY_LADDERS[t][i] || []).slice(0, 6);
      const filled = row.map((x, j) => ({
        id: x.id || `pl_${t}_${s.idx}_${j + 1}`,
        name: String(x.name || "").trim(),
        how: String(x.how || "").trim(),
        cmd: String(x.cmd || "").trim(),
      }));
      while (filled.length < 6) {
        const j = filled.length;
        filled.push({ id: `pl_${t}_${s.idx}_${j + 1}`, name: "", how: "", cmd: "" });
      }
      return filled;
    });
  }
  return out;
}

export function playMethodsAt(ladders, type, step) {
  const L = ladders || DEFAULT_PLAY_LADDERS;
  const row = L[type]?.[step - 1] || [];
  return row.filter((x) => x && x.name);
}

export function pickPlayMethod(ladders, { type, step, mix = false } = {}) {
  const pool = [];
  if (step <= 1 || !mix) {
    pool.push(...playMethodsAt(ladders, type, step));
  } else {
    for (const t of PLAY_TYPE_IDS) pool.push(...playMethodsAt(ladders, t, step).map((x) => ({ ...x, playType: t })));
  }
  if (!pool.length) return null;
  const x = pool[Math.floor(Math.random() * pool.length)];
  return { ...x, playType: x.playType || type, step };
}

/** 跳級（沒熱過就做這一階）的分母。五階交配：女友 1/3、妻子 1/2。 */
export function playSkipDenom(step, stageIdx) {
  const st = Math.max(0, Math.min(6, Number(stageIdx) || 0));
  const s = Math.max(1, Math.min(5, Number(step) || 1));
  if (s === 5) return SKIP5[st];
  const walk = stepWalkDenom(s, st);
  return Math.max(walk + 6, Math.round(walk * SKIP_MUL[st]));
}

export function playAttemptChance({ step, heat, unlocked, stageIdx } = {}) {
  const s = Math.max(1, Math.min(5, Number(step) || 1));
  const u = Math.max(1, Number(unlocked) || 1);
  const jumping = s > u;
  let denom = jumping
    ? playSkipDenom(s, stageIdx)
    : Math.max(1, (heat && heat[s]) || stepWalkDenom(s, stageIdx));
  // 公園當面硬來：已開的調戲／越線／猥褻不要再 1/10 才碰到。
  if (!jumping && s >= 2 && s <= 4) denom = Math.max(1, Math.min(denom, s <= 3 ? 2 : 3));
  if (jumping && s <= 4) denom = Math.max(2, Math.min(denom, s === 4 ? 4 : 3));
  return { p: 1 / denom, denom, jumping };
}

export function playChanceZh(info) {
  if (!info) return "";
  if (info.p >= 1) return "一定做成";
  return `${info.jumping ? "跳級 " : ""}1/${info.denom}`;
}

export function applyPlayHeat(su, step) {
  if (!su) return;
  su.playHeat = su.playHeat || emptyPlayHeat(su.stageIdx || 0);
  const s = Math.max(1, Math.min(5, Number(step) || 1));
  const st = su.stageIdx || 0;
  su.playHeat[s] = Math.max(1, (su.playHeat[s] || stepWalkDenom(s, st)) - 5);
  if (s < 5) su.playHeat[s + 1] = Math.max(1, (su.playHeat[s + 1] || stepWalkDenom(s + 1, st)) - 5);
  su.playUnlocked = Math.max(su.playUnlocked || 1, Math.min(5, s + 1));
  su.playStep = s;
}

export function pickPlayOpener(su, ladders) {
  const type = PLAY_TYPES[su?.playType] ? su.playType : "talk";
  const method = pickPlayMethod(ladders, { type, step: 1, mix: false });
  if (!method) return null;
  // 人已經走過來了：入場起手做成，下一拍才開始擲調戲。
  return { ...method, step: 1, roll: { p: 1, denom: 1, jumping: false } };
}

function playPushRate(line) {
  if (line === "otaku") return 0.42;
  if (line === "common") return 0.52;
  return 0.62;
}

export function pickPlayAttempt(su, ladders) {
  const type = PLAY_TYPES[su?.playType] ? su.playType : "talk";
  const u = Math.max(1, su?.playUnlocked || 1);
  let step = u;
  const r = Math.random();
  const push = playPushRate(su?.line);
  // 強硬：開了就往越線／猥褻壓，很少退回客套起手。交配仍較少、要死角。
  if (u < 4 && r < push * 0.45 && u <= 2) step = 4;
  else if (u < 4 && r < push) step = Math.min(4, u + 1);
  else if (u === 4 && r < 0.3) step = 5;
  else if (u > 2 && r > 0.9) step = u - 1;
  const mix = step >= 2;
  const method = pickPlayMethod(ladders, { type, step, mix });
  if (!method) return null;
  const roll = playAttemptChance({
    step,
    heat: su.playHeat,
    unlocked: u,
    stageIdx: su.stageIdx || 0,
  });
  return { ...method, step, roll };
}
