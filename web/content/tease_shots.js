/** 感應調戲：立繪 extra 與聊天判讀（只產目前關係那一套）。 */

export const TEASE_LIVE_SHOTS = [
  "tease_breast", "tease_butt",
  "tease_oral_ready", "tease_oral_suck", "tease_oral_deep", "tease_oral_cum",
  "tease_doggy_ready", "tease_doggy_half", "tease_doggy_more", "tease_doggy_deep", "tease_doggy_cum",
  "tease_cowgirl_ready", "tease_cowgirl_half", "tease_cowgirl_more", "tease_cowgirl_deep", "tease_cowgirl_cum",
];

export const TEASE_SEQ = {
  breast: ["tease_breast"],
  butt: ["tease_butt"],
  oral: ["tease_oral_ready", "tease_oral_suck", "tease_oral_deep", "tease_oral_cum"],
  doggy: ["tease_doggy_ready", "tease_doggy_half", "tease_doggy_more", "tease_doggy_deep", "tease_doggy_cum"],
  cowgirl: ["tease_cowgirl_ready", "tease_cowgirl_half", "tease_cowgirl_more", "tease_cowgirl_deep", "tease_cowgirl_cum"],
};

export const TEASE_KIND_ZH = {
  tease: "調戲", breast: "調戲", butt: "調戲", oral: "口交",
  sex: "做愛", doggy: "做愛", cowgirl: "做愛",
};

export function isSexTease(kind) {
  return kind === "sex" || kind === "doggy" || kind === "cowgirl";
}

export function teaseKindLabel(kind) {
  return TEASE_KIND_ZH[kind] || kind || "";
}

export function resolveTeaseKind(kind) {
  if (kind === "breast" || kind === "butt") return "tease";
  if (kind === "doggy" || kind === "cowgirl") return "sex";
  if (kind === "sex") return "sex";
  return kind;
}

export function teaseKindsMatch(a, b) {
  if (a === b) return true;
  return isSexTease(a) && isSexTease(b);
}

export function teaseCumStep(kind) {
  const seq = TEASE_SEQ[kind] || [];
  return Math.max(0, seq.length - 1);
}

/** 正戲可跳的張（1-index：圖2 起；不含前戲圖1、不含射精圖）。
 *  口交＝圖2↔3；交配＝圖2～4。射精另切最後一張（口交圖4／交配圖5）。 */
export function teasePlayableSteps(kind) {
  const last = teaseCumStep(kind);
  if (kind === "oral") return [1, 2].filter(i => i < last);
  return [1, 2, 3].filter(i => i < last);
}

export const TEASE_PHASE_ZH = {
  start: "前・開始",
  mid: "中・進行",
  climax: "後・射精",
};

/** 單張（摸乳／摸臀）只有前；口交／交配：0=前，中間=中，最後=後。 */
export function teasePhaseOf(kind, step) {
  if (kind === "breast" || kind === "butt") return "start";
  const seq = TEASE_SEQ[kind] || [];
  if (seq.length <= 1) return "start";
  const i = Math.max(0, step | 0);
  if (i >= seq.length - 1) return "climax";
  if (i <= 0) return "start";
  return "mid";
}

export function teasePhaseLabel(kind, step) {
  const phase = teasePhaseOf(kind, step);
  return TEASE_PHASE_ZH[phase] || TEASE_PHASE_ZH.start;
}

/** 這一拍在演什麼（給 AI，對齊立繪）。 */
export function teaseBeatLine(kind, step) {
  const phase = teasePhaseOf(kind, step);
  if (kind === "breast") return "他的手在摸／揉你的胸。只有這一段，沒有插入、沒有射精。";
  if (kind === "butt") return "他的手在摸／揉你的臀。只有這一段，沒有插入、沒有射精。";
  if (kind === "oral") {
    if (phase === "start") return "剛開始口交：性器抵在你唇邊／剛含住前端。還沒含深，還沒射。";
    if (phase === "mid") return "口交進行中：正在含、吸、動。還沒射，不要演射進嘴裡或收尾。";
    return "口交後段・射精：射在嘴裡／口內。只演這一拍的射精與收尾，不要倒回剛含住。";
  }
  if (kind === "doggy" || kind === "cowgirl") {
    if (phase === "start") return "剛開始做愛：抵住、還沒整根進去。不要演已經在猛抽或射精。";
    if (phase === "mid") return "做愛進行中：正在抽送。還沒射，不要演內射或結束。台詞多是氣音：啊、哈、嗯、痾……講不了正常長句。";
    return "做愛後段・射精：射進去／內射。只演這一拍，不要倒回剛開始。";
  }
  return "";
}

export function isTeaseShot(shot) {
  return String(shot || "").startsWith("tease_");
}

export function teaseFraming(shot) {
  const s = String(shot || "");
  if (s === "tease_butt") return "lower";
  if (s === "tease_breast" || s.startsWith("tease_oral")) return "half";
  return "full";
}

export function teaseWilling(stage) {
  const st = String(stage || "stranger");
  return st === "girlfriend" || st === "wife";
}

function teaseExpr(stage) {
  switch (String(stage || "stranger")) {
    case "wife":
      return "blush, happy blush, pleased, loving, enjoying, soft smile";
    case "girlfriend":
      return "shy, blush, bashful, embarrassed smile";
    case "friend":
      return "angry expression, furrowed brows, frown, upset, glaring";
    default:
      return "frightened, scared, angry, furious, blush, wide eyes, shocked, glare, furrowed brows";
  }
}

function sexClothes(stage, worn) {
  const cloth = String(worn || "").trim();
  switch (String(stage || "stranger")) {
    case "wife":
      return "girl nude, girl nipples";
    case "girlfriend":
      return [cloth && `girl wearing ${cloth}`, "girl revealing clothes, girl cleavage"].filter(Boolean).join(", ");
    default:
      return [
        "girl fully clothed",
        cloth && `girl wearing ${cloth}`,
        "NO girl nude, NO girl nipples, NO girl topless, NO girl breasts out",
      ].filter(Boolean).join(", ");
  }
}

function sexFace(beat, stage) {
  const willing = teaseWilling(stage);
  switch (String(beat || "")) {
    case "ready":
      return willing
        ? "girl open mouth, girl shy, girl bashful, girl expectant, girl anticipating"
        : "girl open mouth, girl resistance, girl reluctant, girl unwilling, girl tense, girl embarrassed, girl rejecting, girl frightened, girl scared, girl wide eyes";
    case "half":
      return willing
        ? "girl open mouth, girl intoxicated, girl pleasure, girl tongue out, NO girl head up, NO girl chin up, NO girl looking up"
        : "girl open mouth, girl shy, girl blush, girl struggling, girl writhing, NO girl head up, NO girl chin up, NO girl looking up";
    case "more":
      return willing
        ? "girl open mouth, girl head down, girl looking down, girl face down, girl intoxicated, girl pleasure, girl blissful"
        : "girl open mouth, girl head down, girl looking down, girl face down, girl pained, girl suffering, girl grimace";
    case "deep":
      return willing
        ? "girl open mouth, girl head up, girl chin up, girl looking up, girl intoxicated, girl pleasure, girl tongue out"
        : "girl open mouth, girl head up, girl chin up, girl looking up, girl shy, girl blush, girl struggling, girl writhing";
    case "cum":
      return willing
        ? "girl open mouth, girl satisfied, girl content, girl happy blush, girl flushed"
        : "girl open mouth, girl frightened, girl scared, girl shy, girl blush";
    default:
      return "girl open mouth";
  }
}

function sexNeg() {
  return [
    "NO girl covering face",
    "NO girl angry",
    "NO girl furious",
    "NO girl glare",
    "NO girl rage",
    "NO girl looking at viewer",
    "NO girl looking at player",
    "NO girl looking back",
  ].join(", ");
}

function oralClothes(stage, worn) {
  const cloth = String(worn || "").trim();
  switch (String(stage || "stranger")) {
    case "wife":
      return "nude, nipples";
    case "girlfriend":
      return [cloth && `wearing: ${cloth}`, "revealing clothes, cleavage"].filter(Boolean).join(", ");
    default:
      return [
        "fully clothed",
        cloth && `wearing: ${cloth}`,
        "NO nude, NO nipples, NO topless, NO breasts out",
      ].filter(Boolean).join(", ");
  }
}

function oralHands(stage) {
  if (teaseWilling(stage)) {
    return "girl hand holding penis, girl fingers on shaft";
  }
  return "girl hand covering own eyes, girl hand covering own face, NO male hand covering her face";
}

function oralAct(shot) {
  switch (String(shot || "")) {
    case "tease_oral_ready":
      return "male hand on girl head, penis tip against girl lips, about to start oral, NO penis in mouth, NO cum";
    case "tease_oral_suck":
      return "fellatio, penis in mouth, half of penis in mouth, NO deepthroat, NO cum";
    case "tease_oral_deep":
      return "deepthroat, entire penis in mouth, throat bulge, NO cum";
    case "tease_oral_cum":
      return "fellatio, penis in mouth, cum in mouth, oral creampie, overflowing cum";
    default:
      return "fellatio, oral, penis, nsfw, explicit";
  }
}

function breastHands(stage) {
  const pov = "first-person POV, one male hand, NO both hands";
  switch (String(stage || "stranger")) {
    case "wife":
      return `${pov}, nude, one hand lifting one breast, grabbing one breast`;
    case "girlfriend":
      return `${pov}, one hand on her breast, grabbing one breast`;
    case "friend":
      return `${pov}, one hand pulling her clothes aside and groping one breast`;
    default:
      return `${pov}, over clothes, grabbing one breast over clothes, fully clothed, NO nude, NO nipples`;
  }
}

function doggyHands(shot, stage) {
  const willing = teaseWilling(stage);
  const beat = String(shot || "").replace("tease_doggy_", "");
  if (beat === "ready") {
    return willing
      ? "girl hands on bed, girl hands supporting"
      : "girl hand grabbing male hand, girl other hand reaching back, girl hand gripping male arm";
  }
  if (!willing && (beat === "half" || beat === "deep")) return "girl hands struggling, girl hands pushing back";
  if (willing) return "girl hands on bed, girl hands supporting";
  return "";
}

function doggyAct(shot) {
  switch (String(shot || "")) {
    case "tease_doggy_ready":
      return "doggy style, from behind, girl arched back, male hands grabbing girl buttocks, erect penis against girl pussy, glans touching girl labia, about to penetrate, still outside girl pussy, NO insertion, NO cum";
    case "tease_doggy_half":
      return "doggy style, from behind, girl arched back, male hands on girl hips, only the glans inserted, only glans inside girl vagina, glans wrapped by labia, labia enveloping the glans, long penis, very long penis, long shaft, half of the penis still outside, wet pussy, NO full insertion, NO entire penis inside, NO cum";
    case "tease_doggy_more":
      return "doggy style, from behind, first-person POV, glans, glans inside girl vagina, glans at vaginal opening, long vagina, deep vagina, long vaginal canal, x-ray, vaginal x-ray, cutaway, cross-section, NO glans hitting uterus, NO hitting cervix, NO womb bulge, NO cum";
    case "tease_doggy_deep":
      return "doggy style, from behind, girl open mouth, girl buttocks slamming male groin, buttocks impact, girl body shaking, male pubic hair, hitting girl cervix, glans hitting uterus, x-ray, vaginal x-ray, cutaway, nsfw, explicit, NO cum";
    case "tease_doggy_cum":
      return "doggy style, from behind, entire penis inside, creampie, cum inside girl pussy, overflowing cum";
    default:
      return "doggy style, from behind, sex, nsfw, explicit";
  }
}

function cowgirlHands(shot, stage) {
  const willing = teaseWilling(stage);
  const beat = String(shot || "").replace("tease_cowgirl_", "");
  if (beat === "ready") {
    return willing
      ? "girl hands on male chest, girl hands supporting"
      : "girl hand grabbing male hand, girl other hand on male chest, girl hand pushing male chest";
  }
  if (!willing && (beat === "half" || beat === "deep")) return "girl hands struggling, girl hands pushing male chest";
  if (willing) return "girl hands on male chest, girl hands supporting";
  return "";
}

function cowgirlAct(shot) {
  switch (String(shot || "")) {
    case "tease_cowgirl_ready":
      return "cowgirl, girl on top, girl straddling, male hands on girl hips, erect penis against girl pussy, glans touching girl labia, about to penetrate, girl hovering above, NO insertion, NO cum";
    case "tease_cowgirl_half":
      return "cowgirl, girl on top, girl straddling, male hands on girl hips, only the glans inserted, only glans inside girl vagina, glans wrapped by labia, labia enveloping the glans, long penis, very long penis, long shaft, half of the penis still outside, wet pussy, NO full insertion, NO entire penis inside, NO cum";
    case "tease_cowgirl_more":
      return "cowgirl, girl on top, first-person POV, from below, glans, glans inside girl vagina, glans at vaginal opening, long vagina, deep vagina, long vaginal canal, x-ray, vaginal x-ray, cutaway, cross-section, NO glans hitting uterus, NO hitting cervix, NO womb bulge, NO cum";
    case "tease_cowgirl_deep":
      return "cowgirl, girl on top, girl open mouth, girl labia pressed tightly against male abdomen, male pubic hair, hitting girl cervix, glans hitting uterus, x-ray, vaginal x-ray, cutaway, nsfw, explicit, NO cum";
    case "tease_cowgirl_cum":
      return "cowgirl, girl on top, entire penis inside, creampie, cum inside girl pussy, overflowing cum";
    default:
      return "cowgirl, girl on top, sex, nsfw, explicit";
  }
}

export function composeTeaseExtra(shot, stage, worn) {
  const s = String(shot || "");
  if (s === "tease_breast") {
    return [
      "simple background, half-body portrait",
      teaseExpr(stage),
      breastHands(stage),
    ].join(", ");
  }
  if (s === "tease_butt") {
    return [
      "white background, simple background",
      "lower body, below waist, from behind, ass focus",
      "looking back",
      teaseExpr(stage),
      "first-person POV, one male hand, male hand on her buttocks",
      "NO both hands",
    ].join(", ");
  }
  if (s.startsWith("tease_oral_")) {
    const pov = s === "tease_oral_ready"
      ? "first-person POV, one male hand, male hand on girl head"
      : "first-person POV";
    return [
      "simple background, upper body, face focus, half-body close-up",
      teaseExpr(stage),
      oralClothes(stage, worn),
      pov,
      oralHands(stage),
      "penis, nsfw, explicit",
      oralAct(s),
    ].join(", ");
  }
  if (s.startsWith("tease_doggy_")) {
    const beat = s.replace("tease_doggy_", "");
    const extraTag = beat === "more"
      ? "glans, nsfw, explicit, NO glans hitting uterus, NO hitting cervix, NO womb bulge"
      : (beat === "deep" ? "nsfw, explicit" : (beat === "half" ? "glans, long penis, very long penis, nsfw, explicit" : "penis, erect penis, nsfw, explicit"));
    return [
      "simple background, full body, from behind, ass focus, hips focus",
      sexClothes(stage, worn),
      "first-person POV, male hands grabbing girl buttocks",
      doggyHands(s, stage),
      sexFace(beat, stage),
      sexNeg(),
      extraTag,
      doggyAct(s),
    ].filter(Boolean).join(", ");
  }
  if (s.startsWith("tease_cowgirl_")) {
    const beat = s.replace("tease_cowgirl_", "");
    const extraTag = beat === "more"
      ? "glans, nsfw, explicit, NO glans hitting uterus, NO hitting cervix, NO womb bulge"
      : (beat === "deep" ? "nsfw, explicit" : (beat === "half" ? "glans, long penis, very long penis, nsfw, explicit" : "penis, erect penis, nsfw, explicit"));
    return [
      "simple background, full body, from below, hips focus",
      sexClothes(stage, worn),
      "first-person POV, male hands on girl hips",
      cowgirlHands(s, stage),
      sexFace(beat, stage),
      sexNeg(),
      extraTag,
      cowgirlAct(s),
    ].filter(Boolean).join(", ");
  }
  return "";
}

export function teaseNoRef(shot) {
  return String(shot || "") === "tease_butt";
}

/** 劇本模式：調戲／口交可強迫必發；做愛才擲關係檢定。舊摸乳口令視為調戲。 */
export function isForcedTeaseKind() {
  return false;
}

/** 口交／做愛：走肏／射精按鈕，不再打字推進。 */
export function isMatingTease(kind) {
  return kind === "oral" || isSexTease(kind);
}

export const TEASE_PLAY_CLIMAX_RATE = 1 / 15;

/** 陌生／朋友 50% +1 或 −1；女友 50% +1 或 0；妻子必 +1。 */
export function teasePlayAffDelta(stage) {
  const st = String(stage || "stranger");
  if (st === "wife") return 1;
  if (st === "girlfriend") return Math.random() < 0.5 ? 1 : 0;
  return Math.random() < 0.5 ? 1 : -1;
}

/** 玩家台詞 → 調戲種類。較具體的優先。 */
export function detectTeaseIntent(text) {
  const t = String(text || "");
  if (!t.trim()) return null;
  if (/口交|含住|含著|幫我口|給我吸|幫我吸|口我|吹簫|舔雞|吃雞|含我/.test(t)) return "oral";
  if (/交配|做愛|幹你|肏你|我要幹|我要肏|插你|幹死|猛幹|猛操|猛糙|內射|中出|插入|騎乘|上來騎|坐上來|騎我|背後|後入|從後面|狗爬|趴下|趴著/.test(t)) return "sex";
  if (/調戲|玩弄|騷擾|猥褻|亂摸|動手|摸奶|摸乳|揉奶|揉胸|摸胸|吃奶|吸奶|玩奶|胸部|奶子|乳房|摸臀|揉臀|摸屁股|揉屁股|打屁股|捏臀/.test(t)) return "tease";
  return null;
}

export function detectTeaseContinue(kind, text) {
  const t = String(text || "");
  if (kind === "oral") return /吸|含|舔|深|繼續|再|整根|喉嚨|動/.test(t);
  if (isSexTease(kind)) {
    return /幹|肏|插|操|糙|動|繼續|猛|深|頂|再來|用力/.test(t);
  }
  return /繼續|再|還要|別停/.test(t);
}

export function detectTeaseClimax(text) {
  return /射精|內射|內設|中出|射了|要射|射出來|射進去|射在|出來了|繳械|洩了|去了/.test(String(text || ""));
}

export function detectTeaseStop(text) {
  return /停下來|不要了|放開|夠了|停止|穿上|結束|不做了|到此/.test(String(text || ""));
}

export function teaseShotAt(kind, step) {
  const seq = TEASE_SEQ[kind] || [];
  if (!seq.length) return "";
  const i = Math.max(0, Math.min(step, seq.length - 1));
  return seq[i];
}

/** 進入該體位的第一步。 */
export function teaseStartStep() {
  return 0;
}

/**
 * 前中後三段。繼續只在前→中，中段來回；後段只有 climax。
 * 口交／交配都不會從中繞回開始，也不會因「繼續」跳到射精。
 */
export function teaseAdvanceStep(kind, step, action) {
  const seq = TEASE_SEQ[kind] || [];
  const last = Math.max(0, seq.length - 1);
  if (action === "climax") return last;
  if (seq.length <= 1) return 0;
  const i = step | 0;
  if (i >= last) return last;
  if (i <= 0) return 1;
  if (kind === "oral" || isSexTease(kind)) {
    if (i === 1) return Math.min(2, last - 1);
    return 1;
  }
  return i;
}

export function teaseIsClimaxStep(kind, step) {
  const seq = TEASE_SEQ[kind] || [];
  return seq.length > 1 && step >= seq.length - 1;
}
