/**
 * 裸體／半裸害羞（2026-10-03 使用者）：在房間被脫衣後，女友（含）以前說話害羞、結結巴巴、尷尬；
 * 熱戀只剩一點害羞；愛人起自在。只看實際脫衣進度 girl.undress.stage（0 穿著、1 剩內衣褲、2 剩內褲、3 全裸），
 * 不看 portraitNude（召喚時抽的裸體立繪美術）也不看逃走留下的 girl.nude 旗。
 * 這是「害羞的結巴」，不是呻吟：說話崩壞規則（stun_speech.speechMode）照舊。
 * 純函式：不碰 DOM，方便 node 測試。
 */

const STAGE_ORDER = [
  "stranger", "acquaintance", "friend", "close_friend", "girlfriend", "passionate",
  "lover", "wife", "devoted_wife", "obedient_wife", "pathological_wife",
];
const GF = 4;
const PASSIONATE = 5;

function stageIdx(stageKey) {
  const i = STAGE_ORDER.indexOf(String(stageKey || "stranger"));
  return i < 0 ? 0 : i;
}

export function clampUndress(n) {
  const v = Number(n) | 0;
  return v <= 0 ? 0 : v >= 3 ? 3 : v;
}

/** 衣著現況（取代 prompt 外表裡的「穿著X」）。 */
export function undressOutfitText(undressStage, outfit = "") {
  const s = clampUndress(undressStage);
  const base = String(outfit || "自己的衣服");
  if (s === 0) return `穿著${base}。`;
  if (s === 1) return `原本穿著${base}，外衣已經被脫掉——現在身上只剩胸罩和內褲。`;
  if (s === 2) return `原本穿著${base}，現在只剩一件內褲，胸部露在外面。`;
  return `原本穿著${base}，現在全身赤裸，什麼都沒穿。`;
}

/**
 * 害羞強度：0 無、1 輕、2 中、3 強。
 *   女友（含）以前：全裸 3、剩內褲 2、剩內衣褲 1。
 *   熱戀：全裸 1、剩內褲 1、剩內衣褲 0。
 *   愛人起：0（全裸時另給「自在」提示）。
 */
export function undressShyLevel(undressStage, stageKey) {
  const s = clampUndress(undressStage);
  if (!s) return 0;
  const i = stageIdx(stageKey);
  if (i <= GF) return s;
  if (i === PASSIONATE) return s >= 2 ? 1 : 0;
  return 0;
}

/** 個性口吻（只在害羞時附上）。key＝girl_gen PERSONALITY_NAMES。 */
export const SHY_FLAVOR = {
  "傲嬌": "傲嬌：結巴裡帶兇、嘴硬——「看、看什麼看啦！笨蛋！」「才、才沒有害羞！」臉紅到耳根卻不肯承認。",
  "清純反差": "清純反差：最慌張，聲音發抖、快哭出來——「嗚…不、不可以看…」「好、好丟臉…」拼命遮住自己。",
  "高冷": "高冷：努力維持冷淡，卻一開口就破功結巴——「……別、別看。」話更短、別開臉，冷不起來。",
  "活潑開朗": "活潑開朗：想用笑帶過卻笑得很僵——「哈、哈哈…這、這樣好怪喔…」一直找話題轉移注意力。",
  "天然呆": "天然呆：慢半拍才意識到自己沒穿，突然慌掉——「欸？啊、我、我現在…！」語無倫次。",
  "御姊": "御姊：想裝從容但破綻百出——「咳…你、你看夠了吧」聲音比平常高、耳朵紅透。",
  "病嬌": "病嬌：害羞但目光黏著他——「只、只有你可以看喔…」「別、別讓別人看到…」結巴裡帶著佔有。",
  "文靜溫柔": "文靜溫柔：小小聲、低著頭——「那、那個…可以先別一直看嗎…」溫柔又不知所措。",
};

const STATE_ZH = { 1: "只穿著胸罩和內褲", 2: "只剩一件內褲、胸部露著", 3: "全身赤裸" };

/**
 * @param {{ undressStage:number, stageKey:string, personality?:string, speechMode?:string }} o
 *   speechMode：stun_speech.speechMode().mode；非 composed 時身體規則優先，害羞當底色。
 * @returns {string[]}
 */
export function undressShyPromptLines({ undressStage = 0, stageKey = "stranger", personality = "", speechMode = "composed" } = {}) {
  const s = clampUndress(undressStage);
  if (!s) return [];
  const i = stageIdx(stageKey);
  const lv = undressShyLevel(s, stageKey);
  const state = STATE_ZH[s];
  const out = [];
  if (lv === 0) {
    if (s >= 3 && i > PASSIONATE) {
      out.push(`【裸著也自在】你現在${state}，但在他面前已經很習慣：不必結巴、不必遮掩、不用一直提衣服，可以自然聊天，甚至大方或調侃他「看夠了沒」。`);
    }
    return out;
  }
  if (lv === 3) {
    let who;
    if (i <= 1) who = "你們還不熟——你又羞又慌，想要衣服、叫他轉過去或不准看，語氣慌亂但不是在罵人。";
    else if (i <= 3) who = "你們是朋友，現在這樣非常尷尬——不知道眼睛該看哪裡，拼命找別的話題，想快點把衣服穿回去。";
    else who = "你們是男女朋友，但被他這樣看著還是羞到不行——不敢直視他，聲音變小，不是拒絕他，只是太害羞。";
    out.push(
      `【裸體害羞・強】你現在${state}，雙手遮著胸口和下面。${who}`
      + "每句話都要結結巴巴：開頭或中間至少一次字詞重複／卡住（像「那、那個…」「不、不要一直看啦…」「我、我沒有…」），句子偏短、常用「…」停頓；會尷尬地想轉移話題、抱怨他一直看。",
    );
  } else if (lv === 2) {
    const who = i <= 3 ? "很尷尬、坐立不安" : "很害羞、不太敢看他";
    out.push(
      `【半裸害羞・中】你現在${state}，用手臂遮著胸口，${who}。`
      + "說話常會結巴一下（一句裡一兩處「那、那個…」「不、不要看…」），語氣比平常小聲、彆扭，可能想把話題岔開。",
    );
  } else {
    const txt = i === PASSIONATE
      ? `【裸露・微害羞】你現在${state}。你們正在熱戀，你大致放得開，只是偶爾還會臉紅、小聲結巴一下（如「別、別盯著看啦」），很快就恢復自然，也可以撒嬌。`
      : `【內衣害羞・輕】你現在${state}，有點不自在：偶爾結巴一下、下意識遮一遮，但大致能正常說話。`;
    out.push(txt);
  }
  const flavor = SHY_FLAVOR[String(personality || "")] || SHY_FLAVOR["文靜溫柔"];
  out.push(`害羞口吻依個性——${flavor}`);
  out.push(
    speechMode && speechMode !== "composed"
      ? "（這是害羞造成的結巴；現在身體正被刺激／還在餘韻，身體說話規則優先，害羞只是底色。）"
      : "（這是害羞造成的結巴，不是喘息：沒有被刺激時，不准「嗯…啊…」呻吟、不准喘、不准說腿軟；結巴之外句子仍要有內容、說得出完整意思。不要旁白、不要描寫動作。）",
  );
  return out;
}

/** 開場提示（女友以前全裸／剩內褲才附）。 */
export function undressShyOpenerHint(undressStage, stageKey) {
  const lv = undressShyLevel(undressStage, stageKey);
  if (lv < 2) return "";
  return "你現在還光著身子（或只剩內褲）：第一句就要害羞結巴、遮著自己，不要若無其事地打招呼。";
}

/** LLM 空回覆的保底（害羞 ≥2 才用）；否則回傳 fallback。 */
export function undressShyFallback(undressStage, stageKey, fallback = "……") {
  const lv = undressShyLevel(undressStage, stageKey);
  if (lv >= 3) return "那、那個……不、不要一直看啦……";
  if (lv === 2) return "……不、不要看啦……";
  return fallback;
}
