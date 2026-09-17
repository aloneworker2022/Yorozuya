/** 約會旅館做愛：旅館列表＋階段行為包（單男共用）。 */

import { normalizeMolestPack, emptyMaleMolestPack } from "./date_molest.js";
import { uid } from "./script_mode.js";

const EJAC = new Set(["none", "in", "out"]);
const STAGES = new Set([1, 2, 3, 4]);

export function emptyHotelSexAct(name = "行為", stage = 1) {
  const base = emptyMaleMolestPack(name);
  return {
    ...base,
    name: String(name || "行為").slice(0, 40),
    stage: STAGES.has(Number(stage)) ? Number(stage) : 1,
    ejac: "none",
    voiceOut: "",
    replyToPlayer: "",
    attitude:
      "依關係：陌生羞怒、朋友羞恥抗拒又沉淪、女友又羞又受、妻子投入享受。這是旅館裡跟場上男子做愛。",
    playerAct: "男子把她壓在床上，分開腿整根進入。",
    narrPrompt: "寫 1～2 句旁白：旅館裡男子與她做愛的現場（體態、結合、喘息）。不要寫台詞。",
    feelPrompt: "這一拍被插入／摩擦的感覺、羞恥與快感。只影響台詞口氣。",
    placeId: "plaza",
    imgMode: "txt",
    slot: {
      prompt: "1boy having sex with woman in hotel room, nsfw, explicit",
      negative: "looking at viewer, text, watermark, ugly, extra fingers",
      ref: "",
      url: "",
    },
  };
}

export function normalizeHotelSexAct(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const mol = normalizeMolestPack({
    ...s,
    imgMode: "txt",
    playerAct: s.playerAct ?? s.maleAct ?? s.male ?? s.player,
    narrPrompt: s.narrPrompt ?? s.narr,
    feelPrompt: s.feelPrompt ?? s.feel,
  });
  let stage = Number(s.stage);
  if (!STAGES.has(stage)) stage = 1;
  let ejac = String(s.ejac || "none").toLowerCase();
  if (ejac === "內射" || ejac === "in") ejac = "in";
  else if (ejac === "外射" || ejac === "out") ejac = "out";
  else if (ejac === "無" || ejac === "none" || ejac === "") ejac = "none";
  else if (!EJAC.has(ejac)) ejac = "none";
  return {
    ...mol,
    id: String(s.id || mol.id || uid()).slice(0, 24) || uid(),
    name: String(s.name || mol.name || "行為").slice(0, 40) || "行為",
    stage,
    ejac,
    voiceOut: String(s.voiceOut ?? s.voice_out ?? "").trim(),
    replyToPlayer: String(s.replyToPlayer ?? s.reply_to_player ?? s.reply ?? "").trim(),
    imgMode: "txt",
  };
}

export function emptyHotel(id, name) {
  return {
    id: String(id || uid()).slice(0, 24) || uid(),
    name: String(name || "旅館").slice(0, 40) || "旅館",
    acts: [],
  };
}

function act(partial) {
  return normalizeHotelSexAct({
    id: partial.id || uid(),
    ...emptyHotelSexAct(partial.name, partial.stage),
    ...partial,
  });
}

/** 預設三間旅館，各涵蓋階段 1～4 的樣本行為 */
export function defaultHotels() {
  return [
    {
      id: "onsen",
      name: "溫泉旅館",
      acts: [
        act({
          id: "onsen_s1a",
          name: "寬衣入湯",
          stage: 1,
          ejac: "none",
          narrPrompt: "他們進了溫泉旅館的客房，男子幫她解開浴衣帶，帶她走向露天風呂。",
          playerAct: "先把衣服脫了。泡熱一點，等下比較好幹。",
          voiceOut: "走廊隱約傳來脫衣與水聲，她輕輕「嗯」了一聲。",
          replyToPlayer: "……別一直看。水很熱……",
          feelPrompt: "熱水漫過皮膚，胸口發熱，知道等一下會發生什麼。",
          slot: { prompt: "1boy undressing woman in onsen ryokan, yukata, steam, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s1b",
          name: "池沿貼近",
          stage: 1,
          ejac: "none",
          narrPrompt: "蒸汽裡，男子從背後貼上她，手環過她的腰，讓她靠在池沿。",
          playerAct: "腰再往後一點。對，靠著我就好。",
          voiceOut: "水花輕響，男人低聲說了什麼，她沒有推開。",
          replyToPlayer: "你……也在看嗎？好羞……",
          feelPrompt: "背部貼著他的胸膛，熱氣與心跳混在一起。",
          slot: { prompt: "1boy embracing naked woman in outdoor onsen, steam, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s2a",
          name: "湯裡愛撫",
          stage: 2,
          ejac: "none",
          narrPrompt: "水面下，他的手指滑進她腿間，慢而確實地揉開。",
          playerAct: "水裡摸得到。已經這麼軟了。",
          voiceOut: "水聲變亂，夾著壓抑的喘息。",
          replyToPlayer: "手……不要在水裡……哈……",
          feelPrompt: "熱水與手指一起進來，腿發軟，站不穩。",
          slot: { prompt: "1boy fingering woman in onsen water, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s2b",
          name: "扶沿插入",
          stage: 2,
          ejac: "none",
          narrPrompt: "他把她轉過去扶住池沿，從後面慢慢頂進去，熱水晃出一圈波紋。",
          playerAct: "整根進去了。夾緊，別讓水沖掉感覺。",
          voiceOut: "一聲短促的驚喘，接著是規律的水花拍打。",
          replyToPlayer: "進、進來了……好深……",
          feelPrompt: "被撐開的飽脹感混著熱水，腰不自覺往後送。",
          slot: { prompt: "1boy penetrating woman from behind in onsen, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s3a",
          name: "池邊騎乘",
          stage: 3,
          ejac: "in",
          narrPrompt: "他坐在池沿，讓她跨坐下來自己動，直到頂著最深處射進去。",
          playerAct: "自己坐到底。射進去了，給我含著。",
          voiceOut: "劇烈的水響與她壓不住的叫聲，隨後安靜幾秒。",
          replyToPlayer: "射、射在裡面……好燙……你還在看……",
          feelPrompt: "內射的熱度散開，穴口一下一下抽著。",
          slot: { prompt: "woman cowgirl on man at onsen edge, creampie, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s3b",
          name: "後入衝刺",
          stage: 3,
          ejac: "out",
          narrPrompt: "他把她按在石頭上加速抽插，最後拔出來射在她濕淋淋的背上。",
          playerAct: "拔出來射在背上。看好，都是你害的。",
          voiceOut: "拍肉聲變急，男人悶哼一聲，水聲頓了一下。",
          replyToPlayer: "背……好黏……不要給他看啦……",
          feelPrompt: "突然被抽出來的空虛，精液順著脊骨往下滑。",
          slot: { prompt: "1boy doggy style in onsen, cum on back, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s3c",
          name: "抱起深頂",
          stage: 3,
          ejac: "in",
          narrPrompt: "他托著她的臀把她抱離水面，懸空抽插，最後整根埋進去射滿。",
          playerAct: "懸空也能吃到底。再給我夾一次。",
          voiceOut: "肉體撞擊與她斷斷續續的求饒聲傳到門外。",
          replyToPlayer: "腳……碰不到地……又射進來了……",
          feelPrompt: "懸空只能夾緊他，內射時整個人繃直。",
          slot: { prompt: "1boy carrying woman mid sex in onsen steam, creampie, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s4a",
          name: "湯裡餘韻",
          stage: 4,
          ejac: "none",
          narrPrompt: "射完之後他仍抱著她泡在混濁的熱水裡，偶爾輕輕動一下。",
          playerAct: "先別起來。裡面還熱著。",
          voiceOut: "水聲緩了，只剩低語與偶爾的輕喘。",
          replyToPlayer: "還……還埋著……腿好軟……",
          feelPrompt: "精液與熱水混在一起，疲憊卻捨不得分開。",
          slot: { prompt: "couple embracing in onsen after sex, steam, intimate, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "onsen_s4b",
          name: "穿回浴衣",
          stage: 4,
          ejac: "none",
          narrPrompt: "他們擦乾身體，他替她繫上浴衣帶，精液偶有一點沿著大腿內側。",
          playerAct: "夾好再出門。浴衣底下什麼都別穿。",
          voiceOut: "布料窸窣，她小聲應了一句，房門還沒開。",
          replyToPlayer: "會……會流出來的……你別盯著看……",
          feelPrompt: "浴衣布料摩擦敏感處，每走一步都想起剛才。",
          slot: { prompt: "woman in yukata after sex, flushed, hotel room, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
      ],
    },
    {
      id: "motel",
      name: "汽車旅館",
      acts: [
        act({
          id: "motel_s1a",
          name: "進門就脫",
          stage: 1,
          ejac: "none",
          narrPrompt: "房卡一刷，男子把她推進汽車旅館狹窄的房間，門一關就解她扣子。",
          playerAct: "這裡隔音差，叫大聲一點也沒人管。",
          voiceOut: "門重重關上，接著是急促的解衣聲。",
          replyToPlayer: "燈……先關一下……好亮……",
          feelPrompt: "廉價香水味與冰涼的空調，心跳快得嚇人。",
          slot: { prompt: "1boy undressing woman in cheap motel room, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s1b",
          name: "按在門上吻",
          stage: 1,
          ejac: "none",
          narrPrompt: "他把她按在門板上深吻，膝蓋頂進她腿間。",
          playerAct: "親夠了再上報。腿張開。",
          voiceOut: "門板被撞得悶響，喘息聲斷斷續續。",
          replyToPlayer: "門……會被走廊聽到……嗯……",
          feelPrompt: "背抵著冷門，腿被迫分開，逃不了。",
          slot: { prompt: "1boy pinning woman against motel door kissing, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s2a",
          name: "床邊口交",
          stage: 2,
          ejac: "none",
          narrPrompt: "他坐在床沿，按著她的後腦讓她含到底，吞吐間發出水聲。",
          playerAct: "用嘴先弄硬。等下插穴。",
          voiceOut: "隱約傳來吞吐的水聲與男人低哼。",
          replyToPlayer: "嘴……好酸……你還要看……",
          feelPrompt: "口腔被塞滿，眼角餘光還掃到門口的你。",
          slot: { prompt: "woman giving oral sex in motel, 1boy, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s2b",
          name: "傳教士開腿",
          stage: 2,
          ejac: "none",
          narrPrompt: "他把她壓進彈簧床，抬起她一條腿整根沒入，床架開始響。",
          playerAct: "床會響就讓它響。夾緊點。",
          voiceOut: "床架開始有節奏地吱呀作響。",
          replyToPlayer: "好深……床好吵……不要那麼用力……",
          feelPrompt: "彈簧一下一下頂著腰，結合處又熱又緊。",
          slot: { prompt: "missionary sex on motel bed, 1boy 1girl, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s3a",
          name: "後入抓髮",
          stage: 3,
          ejac: "in",
          narrPrompt: "他抓著她的頭髮從後面猛幹，最後頂著最深處射進去。",
          playerAct: "頭抬起來給旁邊那位看。射進去了。",
          voiceOut: "拍肉聲又急又響，她叫了一聲後安靜下來。",
          replyToPlayer: "頭髮……被抓著……裡面滿了……",
          feelPrompt: "頭皮發麻，內射時穴口止不住地抽搐。",
          slot: { prompt: "doggy style hair pull motel, creampie, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s3b",
          name: "騎乘自己動",
          stage: 3,
          ejac: "out",
          narrPrompt: "他躺著讓她自己上下，最後把她推開，射在她小腹與胸前。",
          playerAct: "拔出來。射在肚子上，抹開給他看。",
          voiceOut: "節奏亂掉，男人罵了一聲，隨後是黏稠的安靜。",
          replyToPlayer: "肚子……都是……好羞……",
          feelPrompt: "突然被抽出的失落，溫熱精液糊在皮膚上。",
          slot: { prompt: "cowgirl then cum on stomach motel, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s3c",
          name: "站立抬腿",
          stage: 3,
          ejac: "in",
          narrPrompt: "他把她一條腿掛在臂彎，靠牆站著抽插，直到再射一發進去。",
          playerAct: "靠牆站好。再給我吃一發。",
          voiceOut: "牆面被撞得咚咚響，她幾乎叫不出完整的句子。",
          replyToPlayer: "站不住……又……又射了……",
          feelPrompt: "單腳著地，整個人掛在他身上承受第二發。",
          slot: { prompt: "standing sex against motel wall, creampie, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s4a",
          name: "射後退床",
          stage: 4,
          ejac: "none",
          narrPrompt: "兩人癱在發皺的床單上，空調嗡嗡響，精液慢慢從穴口溢出。",
          playerAct: "別擦。就這樣躺著給他看清楚。",
          voiceOut: "床聲停了，只剩空調與粗重的呼吸。",
          replyToPlayer: "腿……合不起來……都流出來了……",
          feelPrompt: "腰痠、腿抖，體內還殘留著被填滿的錯覺。",
          slot: { prompt: "after sex on messy motel bed, cum leaking, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "motel_s4b",
          name: "穿衣前檢查",
          stage: 4,
          ejac: "none",
          narrPrompt: "離開前他掰開她的腿看了一眼，才把衣服扔給她。",
          playerAct: "夾緊再穿褲子。車裡不准漏到座位上。",
          voiceOut: "布料摩擦聲，她小聲應著，門鎖還沒開。",
          replyToPlayer: "會……會濕衣服……你別再說了……",
          feelPrompt: "穿回褲子時布料立刻被濡濕，羞得抬不起頭。",
          slot: { prompt: "woman dressing after sex in motel, flushed, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
      ],
    },
    {
      id: "business",
      name: "商務旅館",
      acts: [
        act({
          id: "biz_s1a",
          name: "商務房關門",
          stage: 1,
          ejac: "none",
          narrPrompt: "整潔的商務客房裡，男子掛好房卡，把她拉到窗簾還沒拉上的窗邊。",
          playerAct: "窗簾先拉開一點。讓夜景看著妳被幹。",
          voiceOut: "電子鎖嘀了一聲，房間裡傳來壓低的對話。",
          replyToPlayer: "窗……會被看到嗎……好亮……",
          feelPrompt: "落地燈太白，羞恥比情慾先爬上臉。",
          slot: { prompt: "1boy and woman in business hotel room by window, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s1b",
          name: "辦公桌沿",
          stage: 1,
          ejac: "none",
          narrPrompt: "他把她按在附設的小書桌上，文件被掃到一邊，裙子掀到腰。",
          playerAct: "桌子高度剛好。先摸到濕再說。",
          voiceOut: "有東西掉到地毯上的悶響，接著是裙子布料聲。",
          replyToPlayer: "桌子好冰……別掀那麼高……",
          feelPrompt: "冰涼桌面貼著大腿，手指卻已經探進來。",
          slot: { prompt: "1boy bending woman over hotel desk, skirt up, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s2a",
          name: "書桌插入",
          stage: 2,
          ejac: "none",
          narrPrompt: "他從後面整根沒入，書桌上的水杯晃出一圈水紋。",
          playerAct: "水杯都在晃。再夾緊一點。",
          voiceOut: "規律的撞擊讓杯子叮噹輕響。",
          replyToPlayer: "好滿……桌子在響……嗯……",
          feelPrompt: "每次頂入都讓桌沿硌著胯骨，卻停不下來。",
          slot: { prompt: "desk sex in business hotel, rear entry, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s2b",
          name: "床上慢幹",
          stage: 2,
          ejac: "none",
          narrPrompt: "換到大床上，他壓著她的手腕，一下一下慢而深地抽。",
          playerAct: "看著我。每一寸都吃進去。",
          voiceOut: "床墊輕響，她的呼吸越來越亂。",
          replyToPlayer: "太深了……眼睛……不要一直看我……",
          feelPrompt: "慢節奏反而更清楚感受被撐開的形狀。",
          slot: { prompt: "slow missionary in business hotel bed, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s3a",
          name: "對鏡後入",
          stage: 3,
          ejac: "in",
          narrPrompt: "他轉過她面向更衣鏡，從後面抽插，射進去時逼她看自己的表情。",
          playerAct: "鏡子看清楚。精液進去的臉最好看。",
          voiceOut: "拍擊聲變重，她短促尖叫後聲音啞掉。",
          replyToPlayer: "鏡子……好羞……射進來了……",
          feelPrompt: "看著自己被內射的臉，羞恥與高潮一起炸開。",
          slot: { prompt: "sex in front of mirror hotel, creampie, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s3b",
          name: "浴室磁磚",
          stage: 3,
          ejac: "out",
          narrPrompt: "他把她推進淋浴間，按在濕磁磚上加速，最後拔出射在她大腿與磁磚上。",
          playerAct: "水開著射。大腿張開給他看白濁。",
          voiceOut: "水聲突然變大，蓋過一兩聲壓抑的叫。",
          replyToPlayer: "腿……都是……沖不掉……",
          feelPrompt: "熱水沖著精液往下淌，膝蓋發軟扶著牆。",
          slot: { prompt: "shower sex business hotel, cum on thighs, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s3c",
          name: "床沿抬腰",
          stage: 3,
          ejac: "in",
          narrPrompt: "回到床沿，他把枕頭墊在她腰下猛頂，再次灌進去。",
          playerAct: "枕頭墊高，宮口對準。再給我一發。",
          voiceOut: "床撞牆的節奏又響了一陣，然後停住。",
          replyToPlayer: "腰……墊太高……又滿了……",
          feelPrompt: "角度太深，內射時小腹一陣發熱發沉。",
          slot: { prompt: "pillow under hips creampie hotel bed, nsfw, explicit", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s4a",
          name: "窗簾合上",
          stage: 4,
          ejac: "none",
          narrPrompt: "事後他才拉上窗簾，兩人靠在床頭，床單凌亂，空氣裡都是味道。",
          playerAct: "休息一下。精還在裡面就別站起來。",
          voiceOut: "窗簾軌道聲響過後，房間安靜下來。",
          replyToPlayer: "腿間……黏黏的……還能不能走……",
          feelPrompt: "疲憊裡仍感覺得到體內殘留的熱度。",
          slot: { prompt: "couple resting after sex business hotel, messy sheets, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
        act({
          id: "biz_s4b",
          name: "退房前整理",
          stage: 4,
          ejac: "none",
          narrPrompt: "離開前他把用過的毛巾丟進籃子，看著她一手按著裙子下襬走路。",
          playerAct: "下樓別夾不住。電梯裡不准漏。",
          voiceOut: "行李箱輪子輕響，她應了一聲很輕的「知道了」。",
          replyToPlayer: "裙子……會印出來……你快走前面……",
          feelPrompt: "每一步都擔心精液滲出，腿心又熱又濕。",
          slot: { prompt: "woman leaving business hotel after sex, flushed, nsfw", negative: "looking at viewer, text, watermark", ref: "", url: "" },
        }),
      ],
    },
  ].map((h) => normalizeHotel(h));
}

export function normalizeHotel(raw) {
  const s = raw && typeof raw === "object" ? raw : {};
  const id = String(s.id || uid()).slice(0, 24) || uid();
  const name = String(s.name || "旅館").slice(0, 40) || "旅館";
  const actsSrc = Array.isArray(s.acts) ? s.acts : [];
  const acts = actsSrc.map(normalizeHotelSexAct).filter((a) => a.id);
  const seen = new Set();
  const uniq = [];
  for (const a of acts) {
    let aid = a.id;
    if (seen.has(aid)) aid = `${aid}_${uniq.length}`;
    seen.add(aid);
    a.id = aid;
    uniq.push(a);
  }
  return { id, name, acts: uniq };
}

export function normalizeHotels(rawList) {
  const list = Array.isArray(rawList) ? rawList.map(normalizeHotel).filter((h) => h.id) : [];
  if (list.length) {
    const seen = new Set();
    return list.map((h, i) => {
      let id = h.id;
      if (seen.has(id)) id = `${id}_${i + 1}`;
      seen.add(id);
      return { ...h, id };
    });
  }
  return defaultHotels();
}

/** 依階段取行為（保持編輯順序） */
export function hotelActsByStage(hotel, stage) {
  const n = Number(stage);
  return (hotel?.acts || []).filter((a) => Number(a.stage) === n);
}

/**
 * 組出本場播放序列：
 * - 1、2、4：依序全部
 * - 3：隨機抽一個；之後每次 2/3 再抽（可重複），1/3 停
 */
export function buildHotelPlayQueue(hotel) {
  const h = normalizeHotel(hotel || {});
  const out = [];
  for (const st of [1, 2]) {
    out.push(...hotelActsByStage(h, st));
  }
  const s3 = hotelActsByStage(h, 3);
  if (s3.length) {
    const pick = () => s3[Math.floor(Math.random() * s3.length)];
    out.push(pick());
    while (Math.random() < 2 / 3) {
      out.push(pick());
    }
  }
  out.push(...hotelActsByStage(h, 4));
  return out;
}

export function countHotelStats(playedActs) {
  const list = Array.isArray(playedActs) ? playedActs : [];
  let acts = list.length;
  let ejacIn = 0;
  let ejacOut = 0;
  for (const a of list) {
    if (a?.ejac === "in") ejacIn += 1;
    else if (a?.ejac === "out") ejacOut += 1;
  }
  return {
    acts,
    ejacIn,
    ejacOut,
    ejacTotal: ejacIn + ejacOut,
  };
}

export function ejacZh(ejac) {
  if (ejac === "in") return "內射";
  if (ejac === "out") return "外射";
  return "無";
}
