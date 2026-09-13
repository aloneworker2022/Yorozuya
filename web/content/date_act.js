/** 召喚師約會動作：依女子興奮度選下一手。搭訕開頭仍走行為卡；這裡管入場之後。 */

import { rivalActChance } from "./date_explore.js";

export const DATE_ACT_KINDS = {
  talk: { zh: "言語" },
  touch: { zh: "上手" },
  strip: { zh: "脫衣" },
  penis: { zh: "露莖" },
  invite: { zh: "邀配" },
  mate: { zh: "交配" },
};

export const DATE_ACT_KIND_IDS = Object.keys(DATE_ACT_KINDS);

export const DATE_ACT_BANDS = [
  { min: 0, max: 5, zh: "性慾 0–5　言語挑釁" },
  { min: 6, max: 11, zh: "性慾 6–11　摸／摳" },
  { min: 12, max: 17, zh: "性慾 12–17　脫衣／露莖" },
  { min: 18, max: 23, zh: "性慾 18–23　邀交配" },
  { min: 24, max: 30, zh: "性慾 24–30　帶走／插入" },
];

const KIND_BAND_IDX = { talk: 0, touch: 1, strip: 2, penis: 2, invite: 3, mate: 4 };

const ON_HER = "對象＝女方。脫／掀／摸／舔／吸的是她的衣服與身體，露出的是她的乳頭或陰唇。禁止脫自己上衣、禁止自己露乳頭交差。只有掏陰莖是男子露出自己的下體去碰她。不要寫死地點名字。";

const da = (id, name, kind, minArousal, cmd, how) => {
  let c = String(cmd || "").trim();
  if (/^(摸|掀|脫|舔|吸|親|揉|捏)\s+/.test(c) && !/^(摸|掀|脫|舔|吸|親|揉|捏)\s+她/.test(c)) {
    c = c.replace(/^(摸|掀|脫|舔|吸|親|揉|捏)\s+/, "$1 她");
  }
  if (/^磨\s+/.test(c) && !/^磨\s+她/.test(c)) c = c.replace(/^磨\s+/, "磨 她");
  const lock = kind === "talk" ? "不要寫死地點名字。" : ON_HER;
  return { id, name, kind, minArousal, cmd: c, how: `${how}${lock}` };
};

export const DEFAULT_DATE_ACTS = [
  // ── 興奮 0–3　言語猥褻 ×30 ──
  da("da_t01", "黃色笑話", "talk", 0, "說 我講個不好的", "丟一個擦邊黃段子，盯她臉看接不接。不伸手。講完再補一句更色的。"),
  da("da_t02", "言語點胸", "talk", 0, "說 胸型真好", "用話點她胸部形狀、晃、領口，裝作稱讚穿搭。手插口袋，禁止改成只看她。"),
  da("da_t03", "言語猥褻下面", "talk", 0, "說 下面是不是熱了", "壓低聲音當眾講她下面、會不會濕、內褲什麼顏色。不碰，只用話讓她夾腿。"),
  da("da_t04", "問有沒有人", "talk", 0, "說 沒人陪妳嗎", "問她是不是一個人、有沒有男友，語氣輕薄，話裡帶今晚能帶走的意思。"),
  da("da_t05", "誇身材欠摸", "talk", 0, "說 妳一臉就欠摸", "講腰、腿、胸的線條，然後說這身材就是欠摸。還假裝在開玩笑。"),
  da("da_t06", "問內褲顏色", "talk", 0, "說 今天穿什麼顏色", "當眾問內褲顏色、是棉的還是蕾絲。要她回答，不讓她裝沒聽到。"),
  da("da_t07", "下賤稱呼", "talk", 0, "說 小騷貨看我", "改叫淫娃、小騷貨這類，看她罵還是愣。稱呼出口就不收回。"),
  da("da_t08", "問今晚能不能做", "talk", 0, "說 今晚能不能做", "直接問能不能做愛、做到哪一步。把約會說成上床的前置。"),
  da("da_t09", "講她走路會晃", "talk", 0, "說 走路胸會晃", "講她走路胸部晃、臀會顫，像在報導。不伸手，用話釘住。"),
  da("da_t10", "說想舔哪", "talk", 0, "說 想舔妳那裡", "清楚講想舔乳頭還是陰唇，觀察她縮不縮。禁止改成真的去看。"),
  da("da_t11", "講當場做愛", "talk", 0, "說 這裡就能做", "講就在這裡、椅子上、轉角後能怎麼幹她。用眼前場景當黃段子，不要寫死地名。"),
  da("da_t12", "要她笑一個", "talk", 0, "說 笑一個給我親", "要她笑、張嘴、伸舌頭給他看，話裡帶想親。還不親上去。"),
  da("da_t13", "貼近問味道", "talk", 1, "說 靠近聞一下", "把臉湊近頸側或領口，問香水和皮膚的味道，話拐到下面的味道。"),
  da("da_t14", "問乳頭硬了沒", "talk", 1, "說 乳頭硬了沒", "當眾問乳頭有沒有硬、擦到衣服會不會過電。要她自己摸給他聽。"),
  da("da_t15", "說她下面會夾", "talk", 1, "說 下面會自己夾吧", "講陰唇會夾、會出水、會把手指咬住。只用話，讓她夾腿。"),
  da("da_t16", "當眾唸尺寸", "talk", 1, "說 我跟妳說尺寸", "講自己陰莖有多硬、多粗，要比給她看但先只講。看她往哪瞟。"),
  da("da_t17", "逼她承認想被摸", "talk", 1, "說 說妳想不想被摸", "反覆問想不想被摸胸、被摳。不說就再問，不讓話題逃。"),
  da("da_t18", "講精液射哪", "talk", 1, "說 要射在裡面還是臉上", "問內射、射臉上還是射小腹。把選擇丟給她，當眾問。"),
  da("da_t19", "貼耳下流", "talk", 2, "說 靠近聽我講", "身體貼上去，嘴湊耳邊講要摸哪、想不想被摳。手可搭腰，還不進衣服。"),
  da("da_t20", "耳邊報下一步", "talk", 2, "說 接下來摸哪裡", "貼著耳朵預告下一手：胸、臀、還是伸進裙子。讓她等那一下。"),
  da("da_t21", "低聲命令張開", "talk", 2, "說 腿張開一點", "用只有她聽得到的聲音命令腿張開、手拿開。還不碰，先用口令壓。"),
  da("da_t22", "講要掏出來", "talk", 2, "說 要掏出來給妳看", "講現在就想把陰莖掏出來給她看、讓她握。先不動褲鏈。"),
  da("da_t23", "問敢不敢當場濕", "talk", 2, "說 敢不敢當場濕", "激她：現在就能讓她濕、路人會不會發現。用話賭她的羞恥。"),
  da("da_t24", "當眾點名陰唇", "talk", 3, "說 陰唇張開了沒", "直接講陰唇、陰蒂、穴口現在的狀態。要她用話回答，不准只啊一聲。"),
  da("da_t25", "說現在就可以插", "talk", 3, "說 現在就能插進去", "講拉開褲子就能插、這裡人夠少。把插入說成下一秒的事。"),
  da("da_t26", "要她求", "talk", 3, "說 求我摸摸", "要她把「摸我」「摳我」說出口才肯動手。反覆逼，不讓她含糊帶過。"),
  da("da_t27", "講她會噴", "talk", 3, "說 妳會噴出來", "講她被摳會噴水、噴尿，地上會有痕跡。用後果壓她。"),
  da("da_t28", "比較那根", "talk", 3, "說 比他的還硬", "當著玩家的面講自己比較硬、比較粗、能插得更深。嗆旁邊那個。"),
  da("da_t29", "說帶去沒人處幹", "talk", 3, "說 去沒人處給我幹", "用命令口吻說帶她去沒人的死角幹一炮。還不拉走，先把話說死。不要寫死地名。"),
  da("da_t30", "命令叫哥哥", "talk", 3, "說 叫我一聲哥哥", "要她叫哥哥、主人或他的名字。叫出來才罷休，當眾逼。"),

  // ── 興奮 4–6　摸／摳 ×30 ──
  da("da_h01", "隔衣摸胸", "touch", 4, "摸 胸部", "整掌覆上胸部隔衣揉，拇指找乳頭。不徵求同意，抓著不放。"),
  da("da_h02", "抓臀貼緊", "touch", 4, "摸 臀部", "單手抓臀肉往自己下體帶，把她貼緊。當眾抓，不裝成不小心。"),
  da("da_h03", "摸大腿往上", "touch", 4, "摸 大腿", "手落到大腿外側，隔布往裙底／褲襠滑，停在腿根。"),
  da("da_h04", "摟腰扣緊", "touch", 4, "摸 腰", "整條手臂環住腰，拇指扣進腰窩，把她帶進懷裡。"),
  da("da_h05", "從背後環胸", "touch", 4, "摸 胸部", "繞到她背後，兩手從腋下環上去隔衣抓乳，下巴擱她肩。"),
  da("da_h06", "隔衣抓乳搖", "touch", 4, "摸 胸部", "抓住乳房上下搖、左右揉，隔著衣服讓乳尖擦布。"),
  da("da_h07", "掌心拍臀", "touch", 4, "摸 臀部", "掌心拍一下臀再覆上去揉，像在教訓又像在摸。"),
  da("da_h08", "手伸進腰際", "touch", 4, "摸 腰", "從衣襬伸進去貼皮膚摸腰，手指沿褲頭來回。"),
  da("da_h09", "扣手再摸腰", "touch", 4, "摸 腰", "先扣住她的手不讓掙，另一手落到腰側來回。"),
  da("da_h10", "下體隔褲頂臀", "touch", 4, "摸 臀部", "用硬起來的下體隔著褲子頂她臀，手按著不讓她逃。"),
  da("da_h11", "摸小腹往下", "touch", 4, "摸 腰", "掌心貼小腹往褲頭方向壓，停在恥骨上方威脅下一寸。"),
  da("da_h12", "隔衣刮乳溝", "touch", 4, "摸 胸部", "指尖沿領口、乳溝刮下去，假裝整理衣服。"),
  da("da_h13", "裙底摳陰唇", "touch", 5, "摸 陰唇", "手從裙底或褲腰伸進去，指腹分開陰唇前後摳，按到陰蒂。"),
  da("da_h14", "隔內褲按陰蒂", "touch", 5, "摸 陰唇", "隔著內褲布按陰蒂打轉，布會濕、會陷進去。"),
  da("da_h15", "手指沿臀縫", "touch", 5, "摸 臀部", "手指沿臀縫往下，隔布壓住後穴和會陰。"),
  da("da_h16", "從褲頭探進去", "touch", 5, "摸 陰唇", "拉開褲頭伸進去，掌心貼陰毛和陰唇，先不進穴。"),
  da("da_h17", "兩手摸胸臀", "touch", 5, "摸 胸部", "一手揉胸一手抓臀，把她夾在兩掌中間。"),
  da("da_h18", "托乳往上揉", "touch", 5, "摸 胸部", "從乳房下緣托起來揉，隔衣擠出乳溝。"),
  da("da_h19", "捏腿根", "touch", 5, "摸 大腿", "拇指捏大腿根靠近穴口的軟肉，越捏越往縫裡靠。"),
  da("da_h20", "隔布畫陰唇縫", "touch", 5, "摸 陰唇", "隔著裙子或褲子用指節上下畫陰唇縫，故意走慢。"),
  da("da_h21", "拇指按穴口", "touch", 5, "摸 陰唇", "隔布或伸進去用拇指按住陰道口，不進去，只壓著。"),
  da("da_h22", "隔衣捻乳頭", "touch", 6, "摸 乳頭", "隔衣捻乳頭，她越躲越捻，另一手按著背。"),
  da("da_h23", "伸進胸罩捻", "touch", 6, "摸 乳頭", "從肩帶或下擺伸進胸罩，指腹直接捻乳尖。"),
  da("da_h24", "撥開內褲摳", "touch", 6, "摸 陰唇", "把內褲撥到一邊，指腹直接貼陰唇摳開。"),
  da("da_h25", "中指陷進縫", "touch", 6, "摸 陰唇", "中指沿陰唇縫陷進去，還沒進陰道，先把縫撐開。"),
  da("da_h26", "揉胸加腿間", "touch", 6, "摸 胸部", "一手揉胸，另一手同時在腿間隔布按，兩處一起弄。"),
  da("da_h27", "從後面伸手摳", "touch", 6, "摸 陰唇", "站她身後，手從前面褲頭伸進去往後摳陰唇。"),
  da("da_h28", "按陰蒂打轉", "touch", 6, "摸 陰唇", "找到陰蒂隔布或直接按，慢圈快圈交替，不讓她併腿。"),
  da("da_h29", "抓她手去摸自己", "touch", 6, "摸 腰", "抓她的手按到自己胯下硬處，要她隔褲摸形狀。"),
  da("da_h30", "按在樹上摸", "touch", 6, "摸 陰唇", "把她按在樹或椅背上，手從後面伸進腿間亂摸。"),

  // ── 興奮 7–14　脫衣／露莖 ×30 ──
  da("da_s01", "掀她裙子露底", "strip", 7, "掀 她裙子", "掀的是她的裙擺或褲頭，讓她的陰唇或內褲外露。不讓她拉回去。禁止掀自己的衣服。"),
  da("da_s02", "脫她上衣", "strip", 7, "脫 她上衣", "剝的是她的上衣，當眾露出她的胸罩或乳房。抓住她想遮的手。禁止脫自己上衣。"),
  da("da_s03", "掏出陰莖", "penis", 7, "磨 下面", "拉開褲鏈把勃起的陰莖掏出來給她看。龜頭先碰到她手或裙，還不插。禁止改成只看她。"),
  da("da_s04", "撥開她胸罩", "strip", 7, "脫 她胸罩", "撥開的是她的罩杯或肩帶，露出她的乳頭。禁止脫自己的衣服。"),
  da("da_s05", "拉低褲頭露莖", "penis", 7, "磨 下面", "只拉低自己褲頭，陰莖彈出來打在她腿或手上。"),
  da("da_s06", "掀她上衣露乳", "strip", 7, "掀 她上衣", "掀的是她的上衣下擺到胸上，露出她的乳房或胸罩。禁止掀自己衣服、禁止露出自己乳頭。"),
  da("da_s07", "用陰莖拍臀", "penis", 7, "磨 下面", "掏出陰莖在臀肉上拍兩下，再貼著臀縫停住。"),
  da("da_s08", "龜頭戳手背", "penis", 7, "磨 下面", "抓她的手，用龜頭戳手背和掌心，要她看清楚。"),
  da("da_s09", "拉下她內褲", "strip", 8, "脫 她內褲", "從她裙底或褲腰把她的內褲褪到腿，她的陰唇直接接觸空氣。"),
  da("da_s10", "脫掉她胸罩", "strip", 8, "脫 她胸罩", "解開的是她的後扣，剝掉她的胸罩，她的乳房失去支撐。禁止脫自己的。"),
  da("da_s11", "褪她褲到膝", "strip", 8, "脫 她褲子", "把她的褲子或裙內襯褪到膝蓋，她的腿間完全沒遮。"),
  da("da_s12", "陰莖貼小腹", "penis", 8, "磨 下面", "掏出的陰莖豎著貼她小腹，前液塗上去。還不對準穴。"),
  da("da_s13", "龜頭擦乳", "penis", 9, "磨 下面", "把陰莖擠進乳溝或在乳頭上擦，龜頭沾乳尖。"),
  da("da_s14", "當眾敞褲", "penis", 9, "磨 下面", "褲鏈全開，陰莖垂在外面走路，故意讓她視線碰到。"),
  da("da_s15", "陰莖磨陰唇", "penis", 10, "磨 下面", "用龜頭隔布或直接在陰唇上磨，只擦過穴口，不真的插進去。"),
  da("da_s16", "手指插進去", "touch", 11, "摸 陰唇", "兩指伸進陰道扣，拇指按陰蒂。當眾讓她夾著手。"),
  da("da_s17", "龜頭磨陰蒂", "penis", 10, "磨 下面", "龜頭對準陰蒂上下磨，陰唇被擠開又合上。"),
  da("da_s18", "剝掉她上衣", "strip", 10, "脫 她上衣", "整件剝掉的是她的上衣，當眾只剩她的內衣或裸胸，不讓她撿回來。禁止脫自己。"),
  da("da_s19", "內褲掛腿上磨", "penis", 11, "磨 下面", "內褲掛在一邊腿上，陰莖直接磨裸著的陰唇。"),
  da("da_s20", "兩指扣穴", "touch", 11, "摸 陰唇", "食指中指一起進陰道屈指扣，水聲要讓旁邊聽見。"),
  da("da_s21", "陰莖夾腿間", "penis", 12, "磨 下面", "把陰莖夾進她大腿根，前後抽，穴口偶爾擦到。"),
  da("da_s22", "掀她裙子到底", "strip", 12, "掀 她裙子", "把她的裙子掀到腰固定，手擋著不讓她拉下來，她的陰唇晾著。"),
  da("da_s23", "要她握住陰莖", "penis", 13, "說 用手握住", "抓她的手按到自己已經掏出的陰莖上，要她握住、套動。"),
  da("da_s24", "要她跪下對準", "penis", 13, "說 跪下對準", "按她肩要她蹲或跪，陰莖對準臉或嘴，還不塞進去。"),
  da("da_s25", "龜頭抵唇", "penis", 13, "磨 她下面", "用自己的龜頭抵她嘴唇，要她張開。當場就做這一下。"),
  da("da_s26", "三指進去", "touch", 14, "摸 陰唇", "三指撐開陰道，轉著扣。要她夾緊再鬆。"),
  da("da_s27", "陰莖拍陰唇", "penis", 14, "磨 下面", "用陰莖拍打陰唇和陰蒂，每一下都發出黏聲。"),
  da("da_s28", "拉她手套弄", "penis", 14, "說 套動", "握著她的手在陰莖上上下套，節奏由他決定。"),
  da("da_s29", "掀她下身貼上去", "strip", 14, "掀 她裙子", "掀開的是她的下身；男子只敞自己的褲鏈用陰莖貼她，不要脫自己上衣。"),
  da("da_s30", "陰莖分開陰唇不插", "penis", 14, "磨 下面", "龜頭把陰唇左右撥開，抵住穴口停著。故意不進去。"),

  // ── 興奮 15–19　邀交配 ×30 ──
  da("da_i01", "邀去交配", "invite", 15, "提議 做愛", "直接說帶她去沒人的死角插進去。語氣是命令加邀請，不裝成散步。不要寫死地名。"),
  da("da_i02", "當眾對準要插", "invite", 16, "磨 下面", "龜頭抵住陰道口，還沒進去。要她點頭或自己坐下來。"),
  da("da_i03", "要她求插", "invite", 15, "說 求我插進去", "龜頭抵著或隔著布頂著，不進。逼她把「插進來」說出口。"),
  da("da_i04", "提議去沒人處", "invite", 15, "提議 去沒人處", "抓住手腕說換沒人的地方做。不跟旁邊的人商量。不要寫死地名。"),
  da("da_i05", "指向沒人那邊", "invite", 15, "提議 去沒人處", "指向視線死角說那邊就能插。拉她走一步看她跟不跟。不要寫死地名。"),
  da("da_i06", "說在椅上做", "invite", 16, "提議 做愛", "指眼前的椅子或牆說靠上去就能進。把插入講成下一秒。"),
  da("da_i07", "要她自己坐上來", "invite", 16, "說 自己坐上來", "自己坐下或靠著，陰莖翹著，要她分開腿坐下來吃進去。"),
  da("da_i08", "數到三就進", "invite", 16, "說 數到三就進去", "龜頭抵穴口，當眾數三下。用倒數逼她。"),
  da("da_i09", "問要內射嗎", "invite", 17, "說 要不要內射", "還沒進就問射裡面還是外面。把中當選擇題丟給她。"),
  da("da_i10", "比給旁邊看再邀", "invite", 17, "提議 做愛", "把結合處或硬著的陰莖轉給旁邊的人看，再說帶她去插。"),
  da("da_i11", "說比他先做", "invite", 17, "說 我先幹妳", "當玩家的面說自己要先插、先射。把邀請變成搶人。"),
  da("da_i12", "要她選姿勢", "invite", 17, "說 從後面還是騎上來", "問後入還是騎乘，選了就走。把交配當菜單。"),
  da("da_i13", "龜頭淺淺頂進一點", "invite", 18, "磨 下面", "龜頭只進陰唇一點點就停，問還要不要更深。"),
  da("da_i14", "說隔間剛好", "invite", 18, "提議 去沒人處", "講找個能關上門的死角就能整根進去。拉她往沒人的方向。不要寫死地名。"),
  da("da_i15", "說那邊沒人", "invite", 18, "提議 去沒人處", "講視線死角現在去就能做完。不給她找藉口。不要寫死地名。"),
  da("da_i16", "要她牽過去", "invite", 18, "說 妳牽我去", "要她自己牽他的手去沒人的死角。把主動權丟回去羞她。不要寫死地名。"),
  da("da_i17", "用陰莖指方向", "invite", 18, "磨 下面", "用翹著的陰莖點她穴口，再說跟我走就讓它進去。"),
  da("da_i18", "說一次就好", "invite", 19, "提議 做愛", "講只做一次、射完就停。用「一次」當通行證逼她。"),
  da("da_i19", "說進去就不拔", "invite", 19, "說 進去就不拔", "預告插進去就頂到射。讓她知道這不是磨外面。"),
  da("da_i20", "要她承認想被幹", "invite", 19, "說 說想被幹", "要她親口說想被插入。說了才肯帶她走。"),
  da("da_i21", "把她轉過去對準", "invite", 19, "磨 下面", "轉過她的腰，從後面用龜頭對準穴口，問現在進不進。"),
  da("da_i22", "抬一條腿對準", "invite", 19, "磨 下面", "抬她一條腿，陰莖對準敞開的穴，停在入口等她聲。"),
  da("da_i23", "說給他看我們做", "invite", 19, "提議 做愛", "指著玩家說就讓他看著幹。把邀請變成當眾。"),
  da("da_i24", "講子宮會含住", "invite", 19, "說 子宮會含住我", "講插到底宮口會含龜頭。用身體後果當邀請。"),
  da("da_i25", "要她自己分開", "invite", 16, "說 自己用手分開", "要她兩手分開陰唇給他對準。分開了就當答應。"),
  da("da_i26", "說濕成這樣不插可惜", "invite", 16, "提議 做愛", "用她已經濕當理由，說不插進去浪費。"),
  da("da_i27", "拉褲鏈當邀請", "invite", 15, "磨 下面", "當著她把褲鏈拉到底，陰莖彈出，問去哪裡吃進去。"),
  da("da_i28", "說十分鐘就夠", "invite", 15, "提議 做愛", "講十分鐘、一個隔間、射完回來。把交配說得很短很好逃。"),
  da("da_i29", "用前液塗穴口再問", "invite", 17, "磨 下面", "把前液塗在陰唇和穴口上，問這潤滑夠不夠進去。"),
  da("da_i30", "說現在不走就當場進", "invite", 19, "提議 去沒人處", "給兩個選擇：跟他走到沒人的死角，或就在這裡被插。不要寫死地名。"),

  // ── 興奮 20–30　帶走／插入 ×30 ──
  da("da_m01", "拉走去交配", "mate", 20, "提議 去沒人處", "抓住她的手腕或腰，要把她帶到沒人的死角真正插進去。不跟旁邊的人商量。不要寫死地名。"),
  da("da_m02", "就地插入", "mate", 22, "磨 她下面", "用自己的陰莖插進她的陰道抽送。若這裡還能被看見，先把她拖到沒人處再插。不要寫死地名。"),
  da("da_m03", "拉去沒人處幹", "mate", 20, "提議 去沒人處", "扣著她的腰往沒人的方向走，進死角就要插。步伐不給她停。不要寫死地名。"),
  da("da_m04", "拖進死角", "mate", 20, "提議 去沒人處", "幾乎是拖著她走，進死角就把她按住插入。不要寫死地名。"),
  da("da_m05", "從後面進", "mate", 22, "磨 下面", "轉過她、按腰，從後面整根頂進去。"),
  da("da_m06", "抱起來插", "mate", 22, "磨 下面", "把她抱離地或按在身上對準插，腿掛在他腰上。"),
  da("da_m07", "按在椅上抽", "mate", 23, "磨 下面", "把她按在椅、樹或牆上抽插，每一下都到底。"),
  da("da_m08", "抬腿進", "mate", 23, "磨 下面", "抬她一條腿對準插，結合處敞著。"),
  da("da_m09", "扣腰往自己撞", "mate", 23, "磨 下面", "雙手扣腰把她往自己陰莖上撞，節奏由他。"),
  da("da_m10", "邊摸胸邊插", "mate", 24, "磨 下面", "一手揉胸一手固定，下身整根進去抽。"),
  da("da_m11", "要她自己坐到底", "mate", 24, "說 坐到底", "讓她跨上來，按著肩要她自己把陰莖吃到宮口。"),
  da("da_m12", "淺淺抽出再整根", "mate", 24, "磨 下面", "只留龜頭在裡面再整根沒入，反覆。"),
  da("da_m13", "頂宮口停住", "mate", 25, "磨 下面", "頂到宮口就不拔，轉著磨，要她含住。"),
  da("da_m14", "當眾抽插", "mate", 25, "磨 下面", "不避路人視線，抽插的水聲和拍肉聲都要有。"),
  da("da_m15", "邊罵邊插", "mate", 25, "磨 下面", "下賤稱呼不中斷，同時頂進去。叫她報有多深。"),
  da("da_m16", "要她看結合處", "mate", 26, "磨 下面", "要她低頭看陰莖進進出出。看一下就頂一下。"),
  da("da_m17", "快速短抽", "mate", 26, "磨 下面", "只在穴口一段快速短抽，再突然整根沒入。"),
  da("da_m18", "慢而深", "mate", 26, "磨 下面", "每一下都慢、都頂到最深，抽出時陰唇被帶翻。"),
  da("da_m19", "換邊再進", "mate", 27, "磨 下面", "拔出來轉個方向或換腿，再插回去。不讓她合攏。"),
  da("da_m20", "抵著射前問", "mate", 27, "說 要射了說在哪", "整根埋著跳動，問射裡面還是拔出來。還沒射。"),
  da("da_m21", "內射灌進去", "mate", 28, "磨 下面", "頂著宮口射進去，射的時候還在小幅抽。"),
  da("da_m22", "射完不拔", "mate", 28, "磨 下面", "射完仍埋在裡面，用殘硬堵住不讓精液流出。"),
  da("da_m23", "拔出來再塞回去", "mate", 28, "磨 下面", "整根抽出帶出精液和愛液，再塞回去攪。"),
  da("da_m24", "第二輪接著幹", "mate", 29, "磨 下面", "剛射過又硬著繼續抽，不給她休息。"),
  da("da_m25", "把她翻面再進", "mate", 29, "磨 下面", "仰躺改跪、或跪改坐，換面立刻插回去。"),
  da("da_m26", "一邊走一邊還含著", "mate", 29, "提議 去沒人處", "插著她或剛從她體內拔出來，拉她換一個更裡面的死角繼續。不要寫死地名。"),
  da("da_m27", "按著頭從後面進", "mate", 30, "磨 下面", "按著後頸讓她彎腰，從後面整根沒入。"),
  da("da_m28", "腿扛肩上插", "mate", 30, "磨 下面", "把她腿扛到肩或折到胸，穴口完全打開再插。"),
  da("da_m29", "要她自己動", "mate", 30, "說 自己動", "陰莖埋著不動，要她自己扭腰套。不動就頂一下懲罰。"),
  da("da_m30", "做到腿軟還不讓走", "mate", 30, "磨 下面", "她腿已經軟了仍扣著腰抽，做到站不穩才罷。"),
];

for (const x of DEFAULT_DATE_ACTS) {
  const b = DATE_ACT_BANDS[KIND_BAND_IDX[x.kind] ?? 0] || DATE_ACT_BANDS[0];
  x.minArousal = b.min;
  x.maxArousal = b.max;
}

const KIND_STEP = { talk: 2, touch: 3, strip: 4, penis: 4, invite: 4, mate: 5 };
const KIND_TYPE = { talk: "talk", touch: "touch", strip: "expose", penis: "touch", invite: "talk", mate: "touch" };
const KIND_EXPLORE = { talk: 2, touch: 4, strip: 5, penis: 5, invite: 6, mate: 6 };

export function dateActKindZh(kind) {
  return DATE_ACT_KINDS[kind]?.zh || "言語";
}

export function isTeaseKind(kind) {
  return kind === "talk" || kind === "touch" || kind === "strip" || kind === "penis";
}

export function isMateAskKind(kind) {
  return kind === "invite" || kind === "mate";
}

export function dateActExploreLv(kind) {
  return KIND_EXPLORE[kind] || 2;
}

export function dateActBandOf(act) {
  const i = KIND_BAND_IDX[act?.kind];
  if (i != null) return DATE_ACT_BANDS[i];
  const min = Number(act?.minArousal) || 0;
  return DATE_ACT_BANDS.find((b) => min >= b.min && min <= b.max) || DATE_ACT_BANDS[0];
}

export function dateActBandIndex(arousal) {
  const a = Math.max(0, Math.min(30, Number(arousal) || 0));
  let i = 0;
  for (let b = 0; b < DATE_ACT_BANDS.length; b++) {
    if (a >= DATE_ACT_BANDS[b].min) i = b;
  }
  return i;
}

export function actsInBand(list, band) {
  if (!band) return [];
  return (list || []).filter((x) => {
    const b = dateActBandOf(x);
    return b.min === band.min && b.max === band.max;
  });
}

export function normalizeDateAct(x, i = 0) {
  if (!x || !String(x.name || "").trim()) return null;
  const kind = DATE_ACT_KINDS[x.kind] ? x.kind : "talk";
  const band = dateActBandOf({ ...x, kind });
  return {
    id: String(x.id || "").trim() || `da_${i + 1}`,
    name: String(x.name || "").trim(),
    how: String(x.how || "").trim(),
    cmd: String(x.cmd || "").trim(),
    kind,
    minArousal: band.min,
    maxArousal: band.max,
  };
}

export function normalizeDateActs(list) {
  const seen = new Set();
  const out = [];
  (list || []).forEach((x, i) => {
    const a = normalizeDateAct(x, i);
    if (!a || !a.how || !a.cmd) return;
    let id = a.id;
    if (seen.has(id)) id = `${id}_${i}`;
    seen.add(id);
    out.push({ ...a, id });
  });
  return out;
}

export function cloneDateActs(list) {
  const n = normalizeDateActs(list);
  return n.length ? n : DEFAULT_DATE_ACTS.map((x) => ({ ...x }));
}

export function dateActBandZh(minArousal, kind) {
  return dateActBandOf({ minArousal, kind }).zh;
}

export function dateActChance(act, { stageIdx = 0, haveLv = 0 } = {}) {
  const kind = act?.kind || "talk";
  const want = KIND_EXPLORE[kind] || 2;
  const p = rivalActChance(stageIdx, want, haveLv);
  const denom = p >= 1 ? 1 : Math.max(2, Math.round(1 / Math.max(0.01, p)));
  return { p, denom, jumping: false };
}

export function adaptDateAct(act, { deadAngle = false, lifeOnly = false } = {}) {
  if (!act) return null;
  const a = { ...act };
  if (lifeOnly && isTeaseKind(a.kind) && a.kind !== "talk") {
    a.how = `${a.how} 這裡人多：仍用這一手調戲。禁止改成帶走、禁止寫跟隨。`;
    return a;
  }
  if (isMateAskKind(a.kind) && !deadAngle) {
    a.how = `${a.how} 這裡還能被看見：把邀配／交配這一手做成即可。成功後由系統問三選一。禁止改成跟隨或帶走。`;
  }
  return a;
}

export function pickDateAct(acts, {
  arousal = 0,
  lifeOnly = false,
  deadAngle = false,
  lastIds = [],
} = {}) {
  const a = Math.max(0, Math.min(30, Number(arousal) || 0));
  const all = cloneDateActs(acts);
  if (!all.length) return null;
  const idx = dateActBandIndex(a);
  const take = (i) => actsInBand(all, DATE_ACT_BANDS[i]);
  let pool = take(idx);
  if (!pool.length) {
    for (let i = idx - 1; i >= 0; i--) {
      pool = take(i);
      if (pool.length) break;
    }
  }
  const band = DATE_ACT_BANDS[idx];
  if (idx > 0 && a <= band.min + 1 && Math.random() < 0.12) {
    const prev = take(idx - 1);
    if (prev.length) pool = prev;
  }
  if (!pool.length) return null;
  const fresh = pool.filter((x) => !lastIds.includes(x.id));
  if (fresh.length) pool = fresh;
  const pick = pool[Math.floor(Math.random() * pool.length)];
  return adaptDateAct(pick, { deadAngle, lifeOnly });
}

export function copyDateAct(x) {
  if (!x) return null;
  return {
    id: x.id,
    name: x.name,
    how: x.how || "",
    cmd: x.cmd || "",
    kind: x.kind || "talk",
    minArousal: Number(x.minArousal) || 0,
    maxArousal: x.maxArousal != null ? Number(x.maxArousal) : undefined,
  };
}

/** 每個興奮檔抽 2～6 種，給這個召喚師當專屬調戲手段。 */
export function drawDateActsByBand(poolActs, { minN = 2, maxN = 6 } = {}) {
  const all = cloneDateActs(poolActs);
  const out = [];
  for (const band of DATE_ACT_BANDS) {
    const bag = actsInBand(all, band);
    if (!bag.length) continue;
    const lo = Math.min(minN, bag.length);
    const hi = Math.min(maxN, bag.length);
    const n = lo + Math.floor(Math.random() * (hi - lo + 1));
    const pick = bag.slice();
    for (let i = pick.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pick[i], pick[j]] = [pick[j], pick[i]];
    }
    for (let i = 0; i < n; i++) out.push(copyDateAct(pick[i]));
  }
  return out;
}

export function dateActsByBandText(acts) {
  const list = acts || [];
  return DATE_ACT_BANDS.map((band) => {
    const names = actsInBand(list, band).map((x) => x.name);
    return `${band.zh}（${names.length}）：${names.join("、") || "（無）"}`;
  }).join("\n");
}

export function dateActToPlay(act) {
  if (!act) return null;
  const step = KIND_STEP[act.kind] || 2;
  return {
    id: act.id,
    name: act.name,
    how: act.how,
    cmd: act.cmd,
    kind: act.kind,
    minArousal: act.minArousal,
    maxArousal: act.maxArousal,
    playType: KIND_TYPE[act.kind] || "talk",
    step,
    roll: dateActChance(act),
    dateAct: true,
  };
}
