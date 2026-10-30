/** 插入之後的做愛場：姿勢 × 做法 × 高潮。召喚師每拍選一手，妹子也會高潮。 */

const ON_HER = "陰莖已經在她陰道裡。對象是她。禁止拔出來改成只言語。禁止脫自己上衣。";

const p = (id, name, how) => ({ id, name, how: how + ON_HER });
const s = (id, name, how) => ({ id, name, how: how + ON_HER });
const c = (id, name, how, girl, him) => ({ id, name, how: how + ON_HER, girl: !!girl, him: !!him });

export const SEX_POSITIONS = [
  p("missionary", "傳教士", "壓在她身上正面進，看著她的臉抽。"),
  p("doggy", "後入", "轉過她、按腰，從後面整根沒入。"),
  p("cowgirl", "騎乘", "自己躺下，要她跨上來把陰莖吃到底。"),
  p("reverse_cowgirl", "反向騎乘", "要她背對你坐下來，看她臀吃進去。"),
  p("standing", "站立抱插", "把她抱離地或按在牆上站著插。"),
  p("lift_leg", "抬腿", "抬她一條腿對準，結合處敞著抽。"),
  p("folded", "折疊", "把她腿壓到胸或扛到肩，穴口完全打開。"),
  p("side", "側躺勺入", "側躺從後面勺著她插。"),
  p("prone", "趴臥", "按她趴平，從後面淺淺磨再深。"),
  p("sitting", "坐抱", "坐著讓她面對你坐在陰莖上。"),
  p("edge", "床沿／沿邊", "她躺沿邊，你站著抬腿進。"),
  p("kneel", "對跪", "兩人跪著，把她拉進自己胯下。"),
  p("fullnelson", "從後鎖臂", "從後面鎖她手臂，往上頂。"),
  p("lotus", "盤坐深入", "盤坐把她抱在腿上，每下都深。"),
  p("bridge", "墊腰", "墊她腰或臀，龜頭對準宮口。"),
  p("one_knee", "單膝", "一膝著地，把她一腿掛上抽。"),
  p("wall", "抵牆", "背抵牆或樹，正面或後面進。"),
  p("carry", "抱走抽", "抱著邊走邊插，不讓她腳著地。"),
  p("face_down_ass_up", "跪趴翹臀", "頭低、臀高，從後面整根沒入。"),
  p("spoon_deep", "深勺", "腿夾著她大腿，從後面頂到最深。"),
];

export const SEX_STYLES = [
  s("slow_deep", "慢而深", "每一下都慢、都頂到最深，抽出時陰唇被帶翻。"),
  s("fast_short", "快速短抽", "只在穴口一段快速短抽，再突然整根沒入。"),
  s("grind", "根部研磨", "整根埋著不拔，用根部磨她陰蒂和陰唇。"),
  s("cervix", "頂宮口", "專頂宮口，停著轉、再頂。"),
  s("hold", "埋住不動", "整根埋著不動，要她自己絞、自己求。"),
  s("pound", "狠撞", "扣腰往自己陰莖上撞，拍肉聲要有。"),
  s("shallow_tease", "淺淺逗穴", "只進龜頭一點點再抽出，不讓她吃滿。"),
  s("long_stroke", "長抽", "幾乎整根抽出再整根沒入，水聲拉長。"),
  s("angle", "換角度", "把她腿換邊或抬高，換一個點磨。"),
  s("clit_thumb", "抽插兼揉陰蒂", "下身抽，拇指按她陰蒂。"),
  s("breast", "抽插兼揉乳", "一手揉胸一手扣腰，下身不停。"),
  s("hair", "抓髮後入", "抓她頭髮從後面抽。"),
  s("kiss_thrust", "邊親邊頂", "堵住她的嘴，每親一下就頂一下。"),
  s("spank", "拍臀抽插", "每抽一下拍她臀一下。"),
  s("count", "要她數", "要她數進了幾下，數錯就更深。"),
  s("look_down", "要她看結合處", "要她低頭看陰莖進出自己的穴。"),
  s("talk_dirty", "邊幹邊講", "講她裡面多濕、宮口怎麼含，同時抽。"),
  s("edge_her", "把她吊在高潮前", "她快到時放慢，不讓她先去。"),
  s("no_escape", "不讓逃", "她腰往前逃就扣回來吃到底。"),
  s("rhythm_change", "忽快忽慢", "快十下再慢三下，打亂她呼吸。"),
];

export const SEX_CLIMAX = [
  c("girl_first", "幹到她高潮", "專攻她的點，把她先幹到高潮。你還硬著繼續。", true, false),
  c("girl_hold", "高潮時按住她", "她開始絞的時候整根按死、不讓她逃開。", true, false),
  c("girl_again", "高潮還沒完又抽", "她還在抖就繼續抽，疊第二波。", true, false),
  c("together", "一起高潮", "感覺她絞緊就射進去，兩人一起到。", true, true),
  c("creampie", "內射高潮", "頂著宮口射進去，射的時候還在小幅抽。", true, true),
  c("creampie_hold", "射完不拔", "射完仍埋著，用殘硬堵住精液。", true, true),
  c("creampie_mix", "射完再攪", "射進去再抽幾下，把精液攪開。", true, true),
  c("pullout_belly", "拔出射小腹", "整根抽出射在她小腹或胸，再塞回去。", false, true),
  c("pullout_face", "拔出射臉", "抽出射在她臉上，再立刻插回去。", false, true),
  c("edge_then_fill", "忍到最深再灌", "自己先忍，頂到最深才射滿。", true, true),
  c("make_her_beg", "要她求才讓她高潮", "吊著她，等她求出來才給最後幾下。", true, false),
  c("aftershock", "高潮餘波裡再頂宮口", "她高潮還在跳，專頂宮口延長。", true, false),
];

function pk(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

export function inSexScene({ venue, sexAsk, stuffed, rivalHere } = {}) {
  if (!rivalHere && venue !== "hotel") return false;
  if (venue === "hotel") return stuffed === "penis";
  return sexAsk === "stay" || stuffed === "penis";
}

export function pickSexPlay({
  lastPosId = "",
  lastStyleId = "",
  sexBeats = 0,
  arousal = 0,
  lastIds = [],
  noHim = false,
} = {}) {
  const climaxReady = sexBeats >= 3 && arousal >= 16;
  const wantClimax = climaxReady && (arousal >= 22 || sexBeats >= 5) && Math.random() < (arousal >= 23 ? 0.55 : 0.32);
  let pos = SEX_POSITIONS.find((x) => x.id === lastPosId) || pk(SEX_POSITIONS);
  if (!lastPosId || Math.random() < 0.45) {
    const freshP = SEX_POSITIONS.filter((x) => x.id !== lastPosId);
    pos = pk(freshP.length ? freshP : SEX_POSITIONS);
  }
  let style = SEX_STYLES.find((x) => x.id === lastStyleId) || pk(SEX_STYLES);
  if (!lastStyleId || Math.random() < 0.7) {
    const freshS = SEX_STYLES.filter((x) => x.id !== lastStyleId && !lastIds.includes("st_" + x.id));
    style = pk(freshS.length ? freshS : SEX_STYLES);
  }
  let climax = null;
  if (wantClimax) {
    let bag = SEX_CLIMAX.filter((x) => !lastIds.includes("cx_" + x.id));
    if (noHim) bag = bag.filter((x) => !x.him);
    climax = pk(bag.length ? bag : SEX_CLIMAX.filter((x) => (noHim ? !x.him : true)));
  }
  const name = climax ? `${pos.name}・${climax.name}` : `${pos.name}・${style.name}`;
  const how = climax
    ? `姿勢＝${pos.name}。${pos.how}${climax.how}`
    : `姿勢＝${pos.name}。做法＝${style.name}。${pos.how}${style.how}`;
  return {
    id: climax ? `sx_${pos.id}_${climax.id}` : `sx_${pos.id}_${style.id}`,
    name,
    how,
    cmd: "磨 她下面",
    kind: "mate",
    minArousal: 24,
    maxArousal: 30,
    dateAct: true,
    sex: {
      position: pos.id,
      positionZh: pos.name,
      style: style.id,
      styleZh: style.name,
      climax: climax ? { id: climax.id, zh: climax.name, girl: climax.girl, him: climax.him } : null,
    },
    roll: { p: 1, denom: 1, jumping: false },
  };
}
