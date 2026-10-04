/** 做愛開場圖組（2026-10-03，肏系統第一步）：她脫光後按「做愛」先顯示一張開場圖，依「最後一層（內褲）怎麼脫掉」：
 *   - 她自己脫（叫她脫）→ 傳教士：正面、躺平、腿張開、雙手撥開陰唇               shot sex_missionary_open
 *   - 你幫她脫（幫她脫）→ 後背：臉趴床、屁股翹高、從後面看、不回頭（臉朝另一邊）   shot sex_doggy_open
 * 這一步男人還沒上場：圖裡只有她（1girl, solo），失神痙攣臉；不寫 pov／男手／影子男（伺服器 solo，不自動補 1man）。
 * 兩組各自多組命名存檔（/api/sex-missionary-packs、/api/sex-doggy-packs），執行時隨機抽一組；
 * 伺服器檔名 {id}_sex_missionary_open.png／{id}_sex_doggy_open.png，garment=nude（不套服裝）。
 * 圖組 prompt 只寫姿勢／取景；人設（臉、髮、膚色、身材、性器）於生圖時由 character 合併。
 *
 * 2026-10-03 第二步起：每個姿勢多步（同一組圖組、同一個編輯器的分頁），做愛場面按「下一步」依序切：
 *   open 開場（只有她；走脫光立繪 undress 管線） → join 玩家加入（POV 影子男抓大腿／抓臀、龜頭頂陰唇）
 *   → half 插一半 → full 全插入 → orgasm 她高潮 → squirt 潮吹 → cum 內射（預設 creampie）。
 *   tip 局部（陰部特寫）程式保留但停用（SEX_STEP_DISABLED）。檔名 {id}_sex_<pose>_<step>.png。
 * 2026-10-04 肏互動：half／full 停用（程式保留），改成一格 thrust 抽插（加入之後按「肏」的主圖）；
 *   高潮／潮吹／內射變成事件圖（sex_thrust.js 判定），不再是「下一步」順序。
 * open 以外有男人 → 走 tease（雙人／POV）管線，但伺服器 garment=nude：不套服裝、負向擋衣物。存在同一組的 pack[step]。 */

export const SEX_POSES = {
  missionary: {
    key: "missionary",
    shot: "sex_missionary_open",
    api: "/api/sex-missionary-packs",
    json: "sex_missionary_packs.json",
    prefix: "sxm",
    label: "傳教士開場",
    packName: "傳教士開場圖組",
    hint: "她自己脫掉內褲（叫她脫）",
  },
  doggy: {
    key: "doggy",
    shot: "sex_doggy_open",
    api: "/api/sex-doggy-packs",
    json: "sex_doggy_packs.json",
    prefix: "sxd",
    label: "後背開場",
    packName: "後背開場圖組",
    hint: "你幫她脫掉內褲（幫她脫）",
  },
};

/** 做愛步驟（全部，含停用的）：open 開場 → (tip 局部，停用) → join 玩家加入 → (half／full 停用) → thrust 抽插 → orgasm 她高潮 → squirt 潮吹 → cum 內射。 */
export const SEX_STEPS = ["open", "tip", "join", "half", "full", "thrust", "orgasm", "squirt", "cum"];
/** 停用的步驟（程式保留；不進順序、編輯器分頁、預產）。② 局部 2026-10-03 使用者測完停用；插一半／全插入 2026-10-04 換成一格「抽插」。 */
export const SEX_STEP_DISABLED = new Set(["tip", "half", "full"]);
/** 實際播放順序。 */
export const SEX_ACTIVE_STEPS = SEX_STEPS.filter((s) => !SEX_STEP_DISABLED.has(s));
/** 脫光那一拍背景預產哪幾步（其餘看到前一步時才預產下一步）。 */
export const SEX_PREGEN_STEPS = ["open", "join", "thrust"];
export const SEX_STEP_META = {
  open: { key: "open", label: "開場", short: "開場", hint: "只有她（男人還沒上場）；走脫光立繪管線" },
  tip: { key: "tip", label: "局部", short: "局部", hint: "（停用）陰部特寫：龜頭頂在陰唇、還沒插入；男人只露陰莖（影子男）" },
  join: { key: "join", label: "玩家加入", short: "加入", hint: "POV＋黑色半透明影子男：傳教士抓大腿／後背抓臀，龜頭頂陰唇" },
  half: { key: "half", label: "插一半", short: "半插", hint: "（停用）陰莖插進一半（龜頭在裡面、還有一半在外面）" },
  full: { key: "full", label: "全插入", short: "全插", hint: "（停用）整根插到底（深入）" },
  thrust: { key: "thrust", label: "抽插", short: "抽插", hint: "按「肏」時的主圖：陰莖在裡面進進出出、動態線、骨盆啪啪撞、流汗" },
  orgasm: { key: "orgasm", label: "她高潮", short: "高潮", hint: "她高潮：頭往後仰、吐舌、阿嘿顏、痙攣（後背：抬頭後仰、仍不看鏡頭）" },
  squirt: { key: "squirt", label: "潮吹", short: "潮吹", hint: "插著時潮吹（像尿一樣噴出來）" },
  cum: { key: "cum", label: "內射", short: "內射", hint: "玩家射精：預設內射（creampie），精液從陰道溢出" },
};
// 依實際順序補 next／tab（① 開場 ② 加入 ③ 半插…）；停用的步驟也補 next（接到下一個啟用的），但不顯示
{
  const CIRCLED = "①②③④⑤⑥⑦⑧⑨⑩";
  SEX_ACTIVE_STEPS.forEach((st, i) => { SEX_STEP_META[st].tab = `${CIRCLED[i]} ${SEX_STEP_META[st].short}`; });
  SEX_STEPS.forEach((st, i) => {
    SEX_STEP_META[st].next = SEX_STEPS.slice(i + 1).find((x) => !SEX_STEP_DISABLED.has(x)) || "";
    if (!SEX_STEP_META[st].tab) SEX_STEP_META[st].tab = `（停用）${SEX_STEP_META[st].short}`;
  });
}
/** 開場以外各步的預設版本（快取圖作廢用；開場見 SEX_POSE_PROMPT_REV）。 */
export const SEX_STEP_PROMPT_REV = { tip: 1, join: 1, half: 1, full: 2, thrust: 1, orgasm: 1, squirt: 1, cum: 1 };

/** 下一個啟用的步驟（最後一步回 ""）。 */
export function nextSexStep(step) {
  return SEX_STEP_META[step]?.next || "";
}

function stepKey(step) {
  return SEX_STEP_META[step] ? step : "open";
}

/** shot：sex_<pose>_open／_tip／_join。 */
export function sexStepShot(pose, step = "open") {
  const c = SEX_POSES[pose] || SEX_POSES.missionary;
  return `sex_${c.key}_${stepKey(step)}`;
}

export function sexStepPacksKey(pose, step = "open") {
  return `${sexStepShot(pose, step)}_packs`;
}

/** 預設 prompt 版本（房間快取圖記 portraits.actionPromptRev["<shot>_packs:<packId>"]；低於此版且該組仍是預設 → 作廢重產）。
 * rev 2（2026-10-03）：男人還沒上場 → 只有她（solo）、失神痙攣臉、無影子男。
 * rev 3（2026-10-03）：改走脫衣全身立繪那條管線（同 undress_nude：scene_kind=portrait、不帶 lock_identity、伺服器 solo＋garment=nude）；
 *   prompt 拿掉 nsfw／explicit（伺服器依 rating 補），補 completely nude／bare breasts；負向多擋衣物。 */
export const SEX_POSE_PROMPT_REV = 3;

/** 舊預設（rev 1：POV＋影子男手；rev 2：solo 但走 tease 管線）。存檔 prompt／negative 一字不差（忽略大小寫空白）等於這些 → 載入時換新預設。 */
export const LEGACY_SEX_POSE_PROMPTS = {
  missionary: [
    "pov, from above, missionary position, girl lying on back, on bed, white bed sheets, legs spread, spread legs, knees up, m legs, spreading own pussy, spread pussy with fingers, fingers spreading labia, presenting pussy, pussy, labia, clitoris, pussy juice, blush, embarrassed, looking at viewer, full body, nsfw, explicit, NO penis, NO male body",
    "1girl, solo, nude, front view, from above, lying on back, on bed, white bed sheets, legs spread, spread legs, knees up, m legs, spread pussy, both hands spreading labia, spreading own pussy with both hands, fingers on labia, pussy, labia, clitoris, pussy juice, dazed, trance, rolling eyes, unfocused eyes, empty eyes, slight ahegao, open mouth, drooling, saliva, heavy breathing, panting, trembling, twitching, convulsing, blush, sweat, full body, nsfw, explicit",
  ],
  doggy: [
    "pov, from behind, doggystyle, doggy position, girl on all fours, on bed, white bed sheets, ass up, butt raised high, top-down bottom-up, arched back, looking back, looking at viewer over shoulder, blush, pussy, labia, pussy visible from behind, anus, presenting, wet pussy, 1man, pov, faceless shadow man, black semi-transparent silhouette, translucent dark silhouette, shadow male hands, shadow male hands on her hips, full body, nsfw, explicit, NO penis, NO detailed male face",
    "1girl, solo, nude, from behind, back view, viewed from behind, lying face down, face down on bed, face in pillow, prone, ass up, butt raised high, top-down bottom-up, hips raised, knees bent, arched back, facing away, face hidden, head turned away, pussy visible from behind, pussy, labia, anus, pussy juice, trembling, twitching, convulsing, heavy breathing, panting, drooling, dazed, blush, sweat, on bed, white bed sheets, full body, nsfw, explicit",
  ],
};
export const LEGACY_SEX_POSE_NEGATIVES = {
  missionary: [
    "penis, testicles, male body, realistic man, panties, bra, clothes, dressed, text, watermark, ugly, extra fingers, bad hands, extra legs",
    "male, 1boy, man, penis, testicles, shadow man, male hands, faceless male, pov hands, multiple girls, panties, bra, clothes, dressed, text, watermark, ugly, extra fingers, bad hands, extra legs",
  ],
  doggy: [
    "penis, testicles, detailed male face, realistic man, realistic male skin, male eyes, panties, bra, clothes, dressed, text, watermark, ugly, extra fingers, bad hands, extra legs",
    "male, 1boy, man, penis, testicles, shadow man, male hands, faceless male, pov hands, multiple girls, looking back, looking at viewer, looking over shoulder, face visible, panties, bra, clothes, dressed, text, watermark, ugly, extra fingers, bad hands, extra legs",
  ],
};

/** 各步舊版預設（載入時換成新預設；快取圖靠 SEX_STEP_PROMPT_REV 作廢）。full v1：沒寫男方骨盆貼住她。 */
export const LEGACY_SEX_STEP_DEFAULTS = {
  full: {
    missionary: {
      prompt: ["1man, 1girl, pov, first-person view, faceless shadow man, black semi-transparent silhouette, translucent dark silhouette, from above, front view, missionary, girl lying on back, on bed, white bed sheets, legs spread, spread legs, knees up, nude, completely nude, bare breasts, nipples, pussy, labia, pussy juice, shadow male hands, shadow male hands holding her thighs, hands on her thighs, sex, vaginal, deep penetration, penis fully inserted, entire penis inside, balls deep, labia pressed against male abdomen, dazed, trance, rolling eyes, unfocused eyes, empty eyes, slight ahegao, open mouth, drooling, saliva, heavy breathing, panting, trembling, twitching, convulsing, blush, sweat"],
      negative: ["realistic man, male face, detailed male face, realistic male skin, male eyes, hairy male body, extra penis, multiple penises, multiple girls, panties, bra, clothes, dressed, underwear, lingerie, shirt, dress, skirt, jacket, coat, uniform, hoodie, covered breasts, text, watermark, ugly, extra fingers, bad hands, extra legs"],
    },
    doggy: {
      prompt: ["1man, 1girl, pov, first-person view, faceless shadow man, black semi-transparent silhouette, translucent dark silhouette, from behind, doggystyle, girl lying face down, face down on bed, ass up, butt raised high, top-down bottom-up, arched back, facing away, face hidden, nude, completely nude, pussy, labia, anus, pussy juice, shadow male hands, shadow male hands gripping her ass, hands on her hips, grabbing buttocks, sex, vaginal, deep penetration, penis fully inserted, entire penis inside, balls deep, buttocks pressed against his hips, trembling, twitching, heavy breathing, sweat, on bed, white bed sheets"],
      negative: ["realistic man, male face, detailed male face, realistic male skin, male eyes, hairy male body, extra penis, multiple penises, multiple girls, looking back, looking at viewer, looking over shoulder, face visible, panties, bra, clothes, dressed, underwear, lingerie, shirt, dress, skirt, jacket, coat, uniform, hoodie, covered breasts, text, watermark, ugly, extra fingers, bad hands, extra legs"],
    },
  },
};

export function canonTags(v) {
  return String(v || "").split(",").map((x) => x.trim().toLowerCase()).filter(Boolean).join(", ");
}

function migrateLegacy(v, legacyList, fresh) {
  const c = canonTags(v);
  return (legacyList || []).some((x) => canonTags(x) === c) ? String(fresh ?? "") : String(v ?? "");
}

/** 這組的 prompt 仍是（新或舊）預設 → 快取圖可依版本作廢。 */
export function isDefaultSexPosePack(pose, pack) {
  const c = canonTags(pack?.prompt);
  if (c === canonTags(defaultSexPosePrompt(pose))) return true;
  return (LEGACY_SEX_POSE_PROMPTS[pose] || []).some((x) => canonTags(x) === c);
}

/** 最後一層怎麼脫的 → 開場姿勢。pantiesBy：self → 傳教士；help → 後背；舊存檔沒記 → 傳教士。 */
export function sexPoseFor(who) {
  const by = String(who?.undress?.pantiesBy || "");
  if (by === "help") return "doggy";
  return "missionary";
}

export function sexPosePacksKey(pose) {
  return `${(SEX_POSES[pose] || SEX_POSES.missionary).shot}_packs`;
}

function cfg(pose) {
  const c = SEX_POSES[pose];
  if (!c) throw new Error(`未知的做愛姿勢：${pose}`);
  return c;
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

export function clampDenoise(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return 0.55;
  return Math.min(0.9, Math.max(0.35, Math.round(n * 100) / 100));
}

/** 失神痙攣（ahegao-lite）：兩個姿勢共用的表情／身體反應。 */
const SEX_DAZED_FACE = "dazed, trance, rolling eyes, unfocused eyes, empty eyes, slight ahegao, open mouth, drooling, saliva, heavy breathing, panting, trembling, twitching, convulsing, blush, sweat";

/** 姿勢／取景 tags only（人設於生圖時合併）。男人還沒上場：只有她一人、全裸；不寫 pov／男手／影子男，也不寫 nsfw／explicit（伺服器依 rating 補，避免被當性行為場景）。 */
export function defaultSexPosePrompt(pose) {
  if (pose === "doggy") {
    return [
      "1girl, solo, nude, completely nude, bare breasts",
      "from behind, back view, viewed from behind",
      "lying face down, face down on bed, face in pillow, prone, ass up, butt raised high, top-down bottom-up, hips raised, knees bent, arched back",
      "facing away, face hidden, head turned away",
      "pussy visible from behind, pussy, labia, anus, pussy juice",
      "trembling, twitching, convulsing, heavy breathing, panting, drooling, dazed, blush, sweat",
      "on bed, white bed sheets, full body",
    ].join(", ");
  }
  return [
    "1girl, solo, nude, completely nude, bare breasts, nipples",
    "front view, from above",
    "lying on back, on bed, white bed sheets",
    "legs spread, spread legs, knees up, m legs",
    "spread pussy, both hands spreading labia, spreading own pussy with both hands, fingers on labia",
    "pussy, labia, clitoris, pussy juice",
    SEX_DAZED_FACE,
    "full body",
  ].join(", ");
}

const SEX_NO_MALE_NEG = "male, 1boy, man, penis, testicles, shadow man, male hands, faceless male, pov hands, multiple girls";
const SEX_NO_CLOTHES_NEG = "clothes, dressed, panties, bra, underwear, lingerie, shirt, dress, skirt, jacket, coat, uniform, hoodie, covered breasts";

/** 負向：擋男人（還沒上場）／衣物／常見瑕疵；後背另擋回頭、看鏡頭。不擋 nude／pussy（伺服器另外剔 nude 類）。 */
export function defaultSexPoseNegative(pose) {
  if (pose === "doggy") {
    return [
      SEX_NO_MALE_NEG,
      "looking back, looking at viewer, looking over shoulder, face visible",
      SEX_NO_CLOTHES_NEG,
      "text, watermark, ugly, extra fingers, bad hands, extra legs",
    ].join(", ");
  }
  return [
    SEX_NO_MALE_NEG,
    SEX_NO_CLOTHES_NEG,
    "text, watermark, ugly, extra fingers, bad hands, extra legs",
  ].join(", ");
}

/** ②③ 的男方：同吸／舔奶頭的影子男（玩家第一人稱、無臉、黑色半透明）。 */
const SEX_SHADOW_MAN = "1man, 1girl, pov, first-person view, faceless shadow man, black semi-transparent silhouette, translucent dark silhouette";
const SEX_TIP_BEAT = "erect penis, penis tip, glans, glans pressing against labia, penis touching pussy, about to insert";
const SEX_STEP_NO_CLOTHES = "panties, bra, clothes, dressed, underwear, lingerie, shirt, dress, skirt, jacket, coat, uniform, hoodie, covered breasts";
const SEX_STEP_NO_INSERT = "inserted, penetration, vaginal penetration, penis inside";
const SEX_STEP_NO_REAL_MAN = "realistic man, male face, detailed male face, realistic male skin, male eyes, hairy male body, extra penis, multiple penises, multiple girls";
const SEX_STEP_FLAWS = "text, watermark, ugly, extra fingers, bad hands, extra legs";

/** 各姿勢的身體／抓法（加入之後每一步共用）。 */
const SEX_BODY = {
  missionary: [
    "from above, front view, missionary, girl lying on back, on bed, white bed sheets, legs spread, spread legs, knees up",
    "nude, completely nude, bare breasts, nipples",
    "pussy, labia, pussy juice",
    "shadow male hands, shadow male hands holding her thighs, hands on her thighs",
  ],
  doggy: [
    "from behind, doggystyle, girl lying face down, face down on bed, ass up, butt raised high, top-down bottom-up, arched back",
    "facing away, face hidden",
    "nude, completely nude",
    "pussy, labia, anus, pussy juice",
    "shadow male hands, shadow male hands gripping her ass, hands on her hips, grabbing buttocks",
  ],
};
const SEX_HALF_BEAT = "sex, vaginal, penis halfway inside, half inserted, glans inside, labia wrapped around penis, half of the penis still outside";
/** 全插入：整根進去 → 男方骨盆／胯下貼住她（看不到陰莖根部、兩人之間沒有縫）。 */
const SEX_FULL_BEAT = "sex, vaginal, deep penetration, penis fully inserted, penis fully inside, balls deep, penis completely hidden inside pussy, no visible penis shaft";
const SEX_FULL_PRESS = "groin pressed against her pussy, male pelvis touching her labia, hips pressed together, crotch to crotch, testicles against her";
const SEX_FULL_PRESS_DOGGY = "his hips pressed against her ass, pelvis against her buttocks, groin pressed against her pussy, male pelvis touching her labia, hips pressed together, testicles against her";
const SEX_IN_BEAT = "sex, vaginal, penis inside, deep penetration";
/** 抽插（肏）：進進出出＋動態線＋骨盆撞擊聲感＋汗。 */
const SEX_THRUST_BEAT = "sex, vaginal, penis inside, thrusting, penis thrusting in and out, rapid thrusting, motion lines, speed lines, pelvis slapping, hips slapping, skin slapping, impact lines, sweat, sweaty body, pussy juice splashing";
const SEX_THRUST_MISSIONARY = "bouncing breasts, body shaking from thrusts";
const SEX_THRUST_DOGGY = "his hips slapping against her ass, ass ripple, jiggling buttocks, body shaking from thrusts";
const SEX_ORGASM_FACE = "female orgasm, head thrown back, tongue out, ahegao, rolling eyes, drooling, open mouth, convulsing, trembling, twitching, arched back, toes curling, heavy breathing, blush, sweat";
const SEX_DOGGY_ORGASM = "female orgasm, head lifted, head tilted back, arched back, facing away, tongue out, drooling, convulsing, trembling, twitching, toes curling, heavy breathing, sweat";
const SEX_SQUIRT_BEAT = "squirting, female ejaculation, liquid spraying from pussy, pee-like spray, splashing, wet bed sheets";
const SEX_CUM_BEAT = "cum inside, creampie, internal ejaculation, cum overflowing from pussy, cum dripping, excessive cum";
const SEX_DOGGY_SHAKE = "trembling, twitching, heavy breathing, sweat";

/** 開場以外各步的預設正向（只寫姿勢／取景／男方／這一拍；人設與 nude 由伺服器 garment=nude 合併）。 */
export function defaultSexStepPrompt(pose, step) {
  const st = stepKey(step);
  if (st === "open") return defaultSexPosePrompt(pose);
  const doggy = pose === "doggy";
  if (st === "tip") {
    return (doggy ? [
      SEX_SHADOW_MAN, "only his penis visible",
      "close-up, crotch close-up, pussy focus, from behind, rear view, ass focus",
      "girl face down, ass up, butt raised",
      "nude, completely nude",
      "ass, pussy, labia, anus, pussy juice, wet pussy",
      SEX_TIP_BEAT, "penis against her pussy from behind",
    ] : [
      SEX_SHADOW_MAN, "only his penis visible",
      "close-up, crotch close-up, pussy focus, front view, from above",
      "girl lying on back, legs spread, spread legs",
      "nude, completely nude",
      "pussy, labia, clitoris, pussy juice, wet pussy",
      SEX_TIP_BEAT,
    ]).join(", ");
  }
  if (st === "join") {
    return (doggy ? [
      SEX_SHADOW_MAN, ...SEX_BODY.doggy,
      SEX_TIP_BEAT, "penis against her pussy from behind",
      SEX_DOGGY_SHAKE,
      "on bed, white bed sheets",
    ] : [
      SEX_SHADOW_MAN, ...SEX_BODY.missionary,
      SEX_TIP_BEAT,
      SEX_DAZED_FACE,
    ]).join(", ");
  }
  const body = doggy
    // 高潮：後背抬頭後仰（拿掉 face down on bed／face hidden）
    ? (st === "orgasm" ? [SEX_BODY.doggy[0].replace("girl lying face down, face down on bed", "girl on stomach, chest on bed"), ...SEX_BODY.doggy.slice(2)] : SEX_BODY.doggy)
    : SEX_BODY.missionary;
  const beat = {
    half: [SEX_HALF_BEAT, doggy ? SEX_DOGGY_SHAKE : SEX_DAZED_FACE],
    full: [SEX_FULL_BEAT, doggy ? SEX_FULL_PRESS_DOGGY : SEX_FULL_PRESS, doggy ? SEX_DOGGY_SHAKE : SEX_DAZED_FACE],
    orgasm: [SEX_IN_BEAT, doggy ? SEX_DOGGY_ORGASM : SEX_ORGASM_FACE],
    squirt: [SEX_IN_BEAT, SEX_SQUIRT_BEAT, doggy ? SEX_DOGGY_SHAKE : SEX_ORGASM_FACE],
    cum: [SEX_IN_BEAT, SEX_CUM_BEAT, doggy ? SEX_DOGGY_SHAKE : SEX_ORGASM_FACE],
    thrust: [SEX_THRUST_BEAT, doggy ? SEX_THRUST_DOGGY : SEX_THRUST_MISSIONARY, doggy ? SEX_DOGGY_SHAKE : SEX_DAZED_FACE],
  }[st] || [];
  return [SEX_SHADOW_MAN, ...body, ...beat, doggy ? "on bed, white bed sheets" : ""].filter(Boolean).join(", ");
}

/**
 * 開場以外各步的預設負向：擋寫實男人／男臉、多個女生、衣物（不擋男人本身）；後背另擋回頭／看鏡頭。
 * 局部／加入（還沒插入）另擋插入；插一半擋整根插到底；內射擋射在外面。
 */
export function defaultSexStepNegative(pose, step) {
  const st = stepKey(step);
  if (st === "open") return defaultSexPoseNegative(pose);
  const bits = [];
  if (st === "tip" || st === "join") bits.push(SEX_STEP_NO_INSERT);
  if (st === "half") bits.push("fully inserted, balls deep");
  if (st === "full") bits.push("visible penis shaft, penis outside, half inserted, partially inserted, gap between bodies");
  if (st === "cum") bits.push("cum on face, facial, cum on body, bukkake");
  if (st === "thrust") bits.push("penis outside, not inserted");
  bits.push(SEX_STEP_NO_REAL_MAN);
  if (pose === "doggy") {
    // 高潮抬頭後仰：臉可能露一點，只擋回頭／看鏡頭
    bits.push(st === "orgasm" ? "looking back, looking at viewer, looking over shoulder" : "looking back, looking at viewer, looking over shoulder, face visible");
  }
  if (st === "tip") bits.push("girl face, upper body");
  bits.push(SEX_STEP_NO_CLOTHES, SEX_STEP_FLAWS);
  return bits.join(", ");
}

function emptyStepSlot(pose, step) {
  return { prompt: defaultSexStepPrompt(pose, step), negative: defaultSexStepNegative(pose, step), ref: "", url: "", poseDenoise: 0.55 };
}

export function normalizeSexStepSlot(pose, step, raw) {
  const base = emptyStepSlot(pose, step);
  const s = raw && typeof raw === "object" ? raw : {};
  const legacy = LEGACY_SEX_STEP_DEFAULTS[stepKey(step)]?.[pose] || {};
  return {
    // 舊版預設 → 換新預設；自訂原樣保留
    prompt: migrateLegacy(s.prompt ?? base.prompt, legacy.prompt, base.prompt),
    negative: migrateLegacy(s.negative ?? base.negative, legacy.negative, base.negative),
    ref: String(s.ref ?? "").trim(),
    url: String(s.url ?? "").trim(),
    poseDenoise: clampDenoise(s.poseDenoise ?? s.pose_denoise ?? base.poseDenoise),
  };
}

/** 這組的某一步（open＝組本身的欄位；tip／join＝pack.tip／pack.join）。 */
export function sexStepSlot(pose, pack, step = "open") {
  const st = stepKey(step);
  if (st === "open") {
    const p = normalizeSexPosePack(pose, pack);
    return { prompt: p.prompt, negative: p.negative, ref: p.ref, url: p.url, poseDenoise: p.poseDenoise };
  }
  return normalizeSexStepSlot(pose, st, pack?.[st]);
}

/** 這一步仍是預設 prompt → 快取圖可依版本作廢。 */
export function isDefaultSexStep(pose, step, pack) {
  const st = stepKey(step);
  if (st === "open") return isDefaultSexPosePack(pose, pack);
  return canonTags(sexStepSlot(pose, pack, st).prompt) === canonTags(defaultSexStepPrompt(pose, st));
}

export function emptySexPosePack(pose, name = "") {
  const c = cfg(pose);
  return {
    id: uid(),
    name: String(name || c.packName).slice(0, 40),
    poseDenoise: 0.55,
    prompt: defaultSexPosePrompt(pose),
    negative: defaultSexPoseNegative(pose),
    ref: "",
    url: "",
    ...Object.fromEntries(SEX_STEPS.slice(1).map((st) => [st, emptyStepSlot(pose, st)])),
    updated: Date.now(),
  };
}

export function normalizeSexPosePack(pose, raw) {
  const base = emptySexPosePack(pose);
  const s = raw && typeof raw === "object" ? raw : {};
  return {
    id: String(s.id || base.id).slice(0, 24) || base.id,
    name: String(s.name || base.name).slice(0, 40) || base.name,
    poseDenoise: clampDenoise(s.poseDenoise ?? s.pose_denoise ?? base.poseDenoise),
    prompt: migrateLegacy(s.prompt ?? base.prompt, LEGACY_SEX_POSE_PROMPTS[pose], base.prompt),
    negative: migrateLegacy(s.negative ?? base.negative, LEGACY_SEX_POSE_NEGATIVES[pose], base.negative),
    ref: String(s.ref ?? "").trim(),
    url: String(s.url ?? "").trim(),
    // 每一步一格（缺的補預設；停用的 tip 也保留，免得存檔時丟掉自訂）
    ...Object.fromEntries(SEX_STEPS.slice(1).map((st) => [st, normalizeSexStepSlot(pose, st, s[st])])),
    updated: Number(s.updated) || Date.now(),
  };
}

export function normalizeSexPoseDoc(pose, raw) {
  const src = raw && typeof raw === "object" ? raw : {};
  const packs = (Array.isArray(src.packs) ? src.packs : []).map((p) => normalizeSexPosePack(pose, p)).filter((p) => p.id);
  let activeId = String(src.activeId || "");
  if (packs.length && !packs.some((p) => p.id === activeId)) activeId = packs[0].id;
  if (!packs.length) activeId = "";
  return { packs, activeId };
}

export function pickRandomSexPosePack(pose, packs) {
  const list = (Array.isArray(packs) ? packs : []).map((p) => normalizeSexPosePack(pose, p)).filter((p) => p.id);
  if (!list.length) return null;
  return list[Math.floor(Math.random() * list.length)];
}

function girlOwnCkpt(girl) {
  return String(girl?.comfyCkpt || "").trim();
}

function shortCkptName(path) {
  const s = String(path || "").trim();
  if (!s) return "";
  const base = s.split(/[/\\]/).pop() || s;
  return base.replace(/\.(safetensors|ckpt|pt|pth)$/i, "");
}

function resolveComfyCkpt(girl, eng = {}) {
  const ck = girlOwnCkpt(girl) || String(eng.comfyCkpt || "").trim();
  if (!ck) throw new Error("此魅子尚未綁定 Comfy 模型（comfyCkpt）");
  return ck;
}

/** 同 undress_packs.js 的 wornOutfit：她現在那身衣服（伺服器 garment=nude 時不寫進 prompt，只為與脫光立繪同一份下單）。 */
function wornOutfit(g) {
  const look = g?.look || {};
  const wardrobe = Array.isArray(look.wardrobe) ? look.wardrobe : [];
  const erotic = Array.isArray(look.eroticOutfits) ? look.eroticOutfits : [];
  const sleep = Array.isArray(look.sleepOutfits) ? look.sleepOutfits : [];
  const pick = g?.outfitPick;
  if (typeof pick === "string" && pick[0] === "e") {
    const index = Number(pick.slice(1));
    if (Number.isInteger(index) && erotic[index]) return String(erotic[index]);
  }
  if (typeof pick === "string" && pick[0] === "s") {
    const index = Number(pick.slice(1));
    if (Number.isInteger(index) && sleep[index]) return String(sleep[index]);
  }
  if (Number.isInteger(pick) && pick >= 0 && pick < wardrobe.length) return String(wardrobe[pick] || "");
  return String(look.career_outfit || look.style || "");
}

/**
 * 組生圖下單。**與脫光立繪（undress_nude，buildUndressImgBody）同一條管線**：
 * scene_kind=portrait、不帶 lock_identity（不當雙人場景）、framing=full、rating=nsfw、outfit＝她那身（伺服器 garment=nude 蓋掉）；
 * 只差 shot（伺服器登記為脫衣全身立繪那一族、不去背）與 extra（姿勢＋失神痙攣）。prompt 留空 → 伺服器以人設＋extra 合併。
 */
export function buildSexPoseImgBody(pose, pack, girl, eng = {}, opts = {}) {
  if (!girl) throw new Error("先選魅子");
  const c = cfg(pose);
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const p = pack ? normalizeSexPosePack(pose, pack) : null;
  const action = p ? String(p.prompt || "").trim() : defaultSexPosePrompt(pose);
  const userNeg = p ? String(p.negative || "").trim() : defaultSexPoseNegative(pose);
  const ref = p ? String(p.ref || "").trim() : "";
  const denoise = p ? clampDenoise(p.poseDenoise) : 0.55;
  const worn = opts.worn != null ? String(opts.worn) : wornOutfit(girl);
  return {
    key: `room-${c.shot}:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: "full",
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: worn,
    prompt: "",
    extra: action,
    negative: userNeg,
    visual_neg: userNeg,
    cutout: false,
    flat_bg: false,
    retry: true,
    scene_kind: "portrait",
    shot: c.shot,
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: denoise } : {}),
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: resolveComfyCkpt(girl, eng) } : {}),
  };
}

/** 新伺服器把這兩個 shot 落到 /assets/portraits/{id}_sex_*_open.png；落到 testword＝伺服器沒重啟（不認得 shot → 不套 nude、會補 1man）。 */
export function isSexPoseResultUrl(pose, url) {
  return isSexStepResultUrl(pose, "open", url);
}

/** 每一步都要落在 /assets/portraits/{id}_sex_<pose>_<step>.png；testword＝伺服器沒重啟。 */
export function isSexStepResultUrl(pose, step, url) {
  const u = String(url || "");
  return !!SEX_POSES[pose] && u.includes("/assets/portraits/") && u.includes(`_${sexStepShot(pose, step)}.png`);
}

/**
 * 某一步的下單。open → buildSexPoseImgBody（脫光立繪管線、只有她）。
 * tip／join → tease（雙人／POV）管線：scene_kind=tease＋lock_identity（允許 1man／pov），outfit 空、伺服器 garment=nude（不套服裝、負向擋衣物）；
 * tip 取景 lower（下半身特寫、正方形），join 取景 full（直圖）。
 */
export function buildSexStepImgBody(pose, step, pack, girl, eng = {}, opts = {}) {
  const st = stepKey(step);
  if (st === "open") return buildSexPoseImgBody(pose, pack, girl, eng, opts);
  if (!girl) throw new Error("先選魅子");
  cfg(pose);
  const shot = sexStepShot(pose, st);
  const comfy = (eng.imgProvider || "grok-img") === "comfy";
  const slot = pack ? sexStepSlot(pose, pack, st) : emptyStepSlot(pose, st);
  const action = String(slot.prompt || "").trim() || defaultSexStepPrompt(pose, st);
  const userNeg = String(slot.negative || "").trim();
  const ref = String(slot.ref || "").trim();
  return {
    key: `room-${shot}:${girl.id || "x"}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: eng.imgModel || "grok-4.5",
    framing: st === "tip" ? "lower" : "full",
    rating: "nsfw",
    style: eng.imgStyle || "pixel",
    character: girl,
    outfit: "",
    prompt: "",
    extra: action,
    negative: userNeg,
    visual_neg: userNeg,
    cutout: false,
    flat_bg: false,
    lock_identity: true,
    retry: true,
    scene_kind: "tease",
    shot,
    char_id: girl.id,
    ...(ref ? { pose_ref: ref, pose_denoise: clampDenoise(slot.poseDenoise) } : {}),
    ...(comfy ? { comfy_url: eng.comfyUrl || "", ckpt: resolveComfyCkpt(girl, eng) } : {}),
  };
}

function formatApiError(method, url, detail) {
  return `${method || "GET"} ${url} → ${detail}`;
}

function restartHint(c, verb) {
  if (verb === "GEN") return `伺服器未重啟：${c.label}這張沒有落到正確的圖檔（舊程式不認得這張圖，會穿衣服或多一個男人），這張不收。請 pull 最新 grok-2026.10 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）`;
  return `${verb === "PUT" ? "伺服器未重啟，無法儲存" : "讀不到"}${c.label}圖組（${verb} ${c.api}）。請 pull 最新 grok-2026.10 並重啟 uvicorn（cd server && uvicorn main:app --host 0.0.0.0 --port 8000）`;
}

export async function loadSexPoseDoc(pose) {
  const c = cfg(pose);
  let r;
  try {
    r = await fetch(c.api + "?ts=" + Date.now(), { cache: "no-store" });
  } catch {
    return loadStatic(pose);
  }
  const j = await r.json().catch(() => ({}));
  if (r.ok) return normalizeSexPoseDoc(pose, j);
  if (r.status !== 404) throw new Error(formatApiError("GET", c.api, j.detail || j.error || r.status));
  return loadStatic(pose);
}

async function loadStatic(pose) {
  const c = cfg(pose);
  try {
    const r = await fetch(`/content/${c.json}?ts=${Date.now()}`, { cache: "no-store" });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(String(r.status));
    return normalizeSexPoseDoc(pose, j);
  } catch {
    throw new Error(restartHint(c, "GET"));
  }
}

export async function saveSexPoseDoc(pose, doc) {
  const c = cfg(pose);
  const body = normalizeSexPoseDoc(pose, doc);
  const r = await fetch(c.api, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    if (r.status === 404 || r.status === 405) throw new Error(restartHint(c, "PUT"));
    throw new Error(formatApiError("PUT", c.api, j.detail || j.error || r.status));
  }
  return body;
}

const _cache = {};
export async function getSexPosePacksCached(pose, force = false) {
  const now = Date.now();
  const hit = _cache[pose];
  if (!force && hit && now - hit.at < 15000) return hit.doc;
  try {
    _cache[pose] = { doc: await loadSexPoseDoc(pose), at: now };
  } catch {
    if (!hit) _cache[pose] = { doc: { packs: [], activeId: "" }, at: now };
  }
  return _cache[pose].doc;
}

export function invalidateSexPoseCache(pose) {
  if (pose) delete _cache[pose];
  else for (const k of Object.keys(_cache)) delete _cache[k];
}

export async function pickRuntimeSexPosePack(pose) {
  const doc = await getSexPosePacksCached(pose);
  return pickRandomSexPosePack(pose, doc.packs);
}

async function apiJson(url, method, body) {
  const verb = method || "GET";
  const r = await fetch(url, {
    method: verb,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(formatApiError(verb, url, j.detail || j.error || r.status));
  return j;
}

async function waitImg(body, onTick, ms = 360000) {
  let key = body.key;
  let r = await apiJson("/api/imggen", "POST", { ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done" || r.status === "error") return r;
    if (onTick) onTick(Math.round((Date.now() - t0) / 1000));
    await new Promise((x) => setTimeout(x, 1500));
    r = await apiJson("/api/imggen", "POST", { ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  return { status: "error", error: "逾時" };
}

/** 生圖（編輯器／背景預產／執行時共用）；不寫入 pack.url。 */
export async function generateSexPosePackImage(pose, pack, girl, eng, opts = {}) {
  return generateSexStepImage(pose, "open", pack, girl, eng, opts);
}

/** 某一步生圖；結果不在 portraits/{id}_sex_<pose>_<step>.png（舊伺服器）→ 不收。 */
export async function generateSexStepImage(pose, step, pack, girl, eng, opts = {}) {
  const body = buildSexStepImgBody(pose, step, pack, girl, eng, opts);
  const r = await waitImg(body, opts.onTick);
  if (r.status === "done" && r.result && !isSexStepResultUrl(pose, step, r.result)) {
    // 舊伺服器：圖會穿衣服或多一個男人 → 不收這張
    return { status: "error", result: "", error: restartHint(cfg(pose), "GEN"), body, key: r.key, stale: String(r.result) };
  }
  return { status: r.status, result: r.result, error: r.error, body, key: r.key };
}

function $(id) {
  return document.getElementById(id);
}

function esc(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * 掛載 test_room 上排「傳教士圖」「後背圖」編輯器（id 前綴 sxm-／sxd-，版面同其他圖組）。
 * @param {"missionary"|"doggy"} pose
 * @param {{ getGirl: () => object|null, getEngine: () => Promise<object> }} hooks
 */
export function mountSexPosePackEditor(pose, hooks = {}) {
  const c = cfg(pose);
  const P = (s) => $(`${c.prefix}-${s}`);
  const openBtn = $(`btn-sex-${pose}-packs`);
  const panel = $(`sex-${pose}-pack-editor`);
  if (!openBtn || !panel || panel.dataset.bound) return;
  panel.dataset.bound = "1";

  let doc = { packs: [], activeId: "" };
  let activeId = "";
  let girls = [];
  let girlId = "";
  let step = "open";

  const setStatus = (msg, err = false) => {
    const el = P("status");
    if (!el) return;
    el.textContent = msg || "";
    el.classList.toggle("err", !!err);
  };
  const activePack = () => doc.packs.find((p) => p.id === activeId) || doc.packs[0] || null;
  /** 目前分頁那一格：open＝組本身；tip／join＝pack.tip／pack.join。 */
  const activeSlot = () => {
    const p = activePack();
    if (!p) return null;
    if (step === "open") return p;
    if (!p[step] || typeof p[step] !== "object") p[step] = normalizeSexStepSlot(pose, step, null);
    return p[step];
  };
  const renderSteps = () => {
    const box = P("steps");
    if (box) {
      if (!box.childElementCount) {
        for (const st of SEX_ACTIVE_STEPS) {
          const b = document.createElement("button");
          b.type = "button";
          b.dataset.step = st;
          b.textContent = SEX_STEP_META[st].tab;
          b.addEventListener("click", () => {
            if (st === step) return;
            collectForm();
            step = st;
            renderForm();
          });
          box.append(b);
        }
      }
      for (const b of box.querySelectorAll("button")) b.setAttribute("aria-pressed", b.dataset.step === step ? "true" : "false");
    }
    if (P("step-hint")) P("step-hint").textContent = `${SEX_STEP_META[step].tab}：${SEX_STEP_META[step].hint}；檔名 {id}_${sexStepShot(pose, step)}.png`;
  };

  const renderPacks = () => {
    const sel = P("pack");
    if (!sel) return;
    if (!doc.packs.some((p) => p.id === activeId) && doc.packs[0]) activeId = doc.packs[0].id;
    sel.innerHTML = doc.packs.length
      ? doc.packs.map((p) => `<option value="${esc(p.id)}"${p.id === activeId ? " selected" : ""}>${esc(p.name)}</option>`).join("")
      : `<option value="">（尚無圖組）</option>`;
  };
  const renderGirls = () => {
    const sel = P("girl");
    if (!sel) return;
    const live = hooks.getGirl?.();
    if (live?.id && !girls.some((g) => g.id === live.id)) girls = [live, ...girls];
    if (!girls.some((g) => g.id === girlId)) girlId = live?.id || girls[0]?.id || "";
    sel.innerHTML = girls.length
      ? girls.map((g) => `<option value="${esc(g.id)}"${g.id === girlId ? " selected" : ""}>${esc(g.name || g.id)}</option>`).join("")
      : `<option value="">（無可用魅子）</option>`;
  };
  const currentGirl = () => {
    const live = hooks.getGirl?.();
    if (live?.id && live.id === girlId) return live;
    return girls.find((g) => g.id === girlId) || live || girls[0] || null;
  };
  const updateRefFlag = () => {
    const p = activeSlot();
    const ref = p?.ref || "";
    const flag = P("mode-flag");
    if (flag) {
      flag.textContent = ref ? "圖生圖（pose_ref）" : "文生圖";
      flag.className = "fg-mode-flag " + (ref ? "img" : "txt");
    }
    if (P("ref-flag")) P("ref-flag").textContent = ref ? "已掛 " + ref : "沒有參考圖 → 文生圖";
    const thumb = P("ref-thumb");
    if (thumb) {
      if (ref) {
        thumb.hidden = false;
        thumb.src = ref + (ref.includes("?") ? "&" : "?") + "t=" + Date.now();
      } else {
        thumb.hidden = true;
        thumb.removeAttribute("src");
      }
    }
  };
  const renderForm = () => {
    const pk = activePack();
    const p = activeSlot();
    renderSteps();
    if (P("name")) P("name").value = pk?.name || "";
    if (P("pos")) P("pos").value = p?.prompt || "";
    if (P("neg")) P("neg").value = p?.negative || "";
    if (P("denoise")) P("denoise").value = String(p?.poseDenoise ?? 0.55);
    if (P("art")) {
      P("art").innerHTML = !p ? `<span class="mini">尚無圖組</span>`
        : p.url ? `<img src="${esc(p.url)}" alt="${esc(c.label)}・${esc(SEX_STEP_META[step].label)}">` : `<span class="mini">尚未產生</span>`;
    }
    updateRefFlag();
  };
  const collectForm = () => {
    const pk = activePack();
    const p = activeSlot();
    if (!pk || !p) return;
    pk.name = String(P("name")?.value || pk.name || c.packName).slice(0, 40);
    p.prompt = P("pos")?.value || "";
    p.negative = P("neg")?.value || "";
    p.poseDenoise = clampDenoise(P("denoise")?.value);
    pk.updated = Date.now();
    doc.activeId = pk.id;
    activeId = pk.id;
  };
  const load = async () => {
    setStatus("讀取中…");
    try {
      doc = await loadSexPoseDoc(pose);
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(doc.packs.length ? `已載入 ${doc.packs.length} 組` : "尚無圖組，按「新增」開始");
    } catch (e) {
      setStatus("讀取失敗：" + e.message, true);
    }
  };
  const loadGirls = async () => {
    try {
      const r = await fetch("/api/save", { cache: "no-store" });
      const j = await r.json();
      girls = (j?.data?.succubi || []).filter((g) => g && g.id && !g.taken);
    } catch {
      girls = [];
    }
    renderGirls();
  };
  const closeSibling = () => {
    document.querySelectorAll(".tease-pack-panel").forEach((el) => {
      if (el !== panel && !el.hidden) el.hidden = true;
    });
    document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => {
      if (b !== openBtn) b.setAttribute("aria-expanded", "false");
    });
  };
  // 其他舊面板的 closeSibling 不認得本面板 → 點別的圖組按鈕時自己收起
  document.querySelectorAll("#room-pack-chrome button[aria-controls]").forEach((b) => {
    if (b === openBtn || b.id === "edit-room") return;
    b.addEventListener("click", () => {
      if (!panel.hidden) {
        panel.hidden = true;
        openBtn.setAttribute("aria-expanded", "false");
      }
    });
  });
  const open = async () => {
    closeSibling();
    panel.hidden = false;
    openBtn.setAttribute("aria-expanded", "true");
    await Promise.all([load(), loadGirls()]);
  };
  const close = () => {
    collectForm();
    panel.hidden = true;
    openBtn.setAttribute("aria-expanded", "false");
  };
  openBtn.addEventListener("click", () => {
    if (panel.hidden) void open();
    else close();
  });
  P("close")?.addEventListener("click", () => close());
  P("pack")?.addEventListener("change", () => {
    collectForm();
    activeId = P("pack").value;
    doc.activeId = activeId;
    renderForm();
  });
  P("girl")?.addEventListener("change", () => { girlId = P("girl").value; });
  P("new")?.addEventListener("click", () => {
    collectForm();
    const p = emptySexPosePack(pose, `${c.label} ${doc.packs.length + 1}`);
    doc.packs.push(p);
    activeId = p.id;
    doc.activeId = p.id;
    renderPacks();
    renderForm();
    setStatus("已新增（記得按儲存）");
  });
  P("del")?.addEventListener("click", () => {
    if (!doc.packs.length) return;
    if (doc.packs.length <= 1) {
      if (!confirm(`刪掉最後一組？刪掉後${c.label}就沒有圖。`)) return;
    } else if (!confirm("刪除這一組？")) return;
    collectForm();
    doc.packs = doc.packs.filter((p) => p.id !== activeId);
    activeId = doc.packs[0]?.id || "";
    doc.activeId = activeId;
    renderPacks();
    renderForm();
    setStatus("已刪除（記得按儲存）");
  });
  P("save")?.addEventListener("click", async () => {
    collectForm();
    try {
      doc = await saveSexPoseDoc(pose, doc);
      invalidateSexPoseCache(pose);
      activeId = doc.activeId || doc.packs[0]?.id || "";
      renderPacks();
      renderForm();
      setStatus(`✓ 已寫入 ${c.json}（${doc.packs.length} 組）`);
    } catch (e) {
      setStatus("儲存失敗：" + e.message, true);
    }
  });
  P("inject")?.addEventListener("click", () => {
    const g = currentGirl();
    if (P("pos")) P("pos").value = defaultSexStepPrompt(pose, step);
    if (P("neg") && !String(P("neg").value || "").trim()) P("neg").value = defaultSexStepNegative(pose, step);
    collectForm();
    const ck = girlOwnCkpt(g);
    const bits = [
      g ? (g.name || g.id) : "（還沒選魅子）",
      ck ? `模型 ${shortCkptName(ck)}` : "模型（尚未綁定）",
      "全裸（garment=nude，不寫服裝）",
      step === "open" ? "只有她（脫光立繪管線）" : "影子男（tease／POV 管線）",
    ];
    setStatus(`✓ 已填${SEX_STEP_META[step].label}預設。執行時會帶入：${bits.join(" · ")}`);
  });
  P("ref-up")?.addEventListener("click", () => P("ref-file")?.click());
  P("ref-file")?.addEventListener("change", async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    const p = activeSlot();
    if (!file || !p) return;
    setStatus("上傳參考圖…");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const r = await fetch("/api/pose-refs", { method: "POST", body: fd });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.detail || j.error || r.status);
      p.ref = String(j.url || "").trim();
      updateRefFlag();
      setStatus("✓ 已掛參考圖");
    } catch (err) {
      setStatus("上傳失敗：" + err.message, true);
    }
  });
  P("ref-clear")?.addEventListener("click", () => {
    const p = activeSlot();
    if (!p) return;
    p.ref = "";
    updateRefFlag();
    setStatus("已拿掉參考圖");
  });
  P("ref-apply")?.addEventListener("click", () => {
    const p = activeSlot();
    if (!p) return;
    const url = String(P("ref-url")?.value || "").trim();
    if (!url) {
      setStatus("先貼 URL", true);
      return;
    }
    p.ref = url;
    updateRefFlag();
    setStatus("✓ 已套用 URL");
  });
  P("gen")?.addEventListener("click", async () => {
    collectForm();
    const p = activePack();
    const slot = activeSlot();
    const st = step;
    const g = currentGirl();
    if (!p || !slot) { setStatus("先新增一組", true); return; }
    if (!g) { setStatus("先選魅子或抽一隻進房", true); return; }
    const btn = P("gen");
    if (btn) btn.disabled = true;
    if (P("art")) P("art").innerHTML = `<span class="mini">生成中…</span>`;
    setStatus("排隊中…");
    try {
      const eng = (await hooks.getEngine?.()) || { imgProvider: "comfy", imgStyle: "pixel" };
      const r = await generateSexStepImage(pose, st, p, g, eng, { onTick: (sec) => setStatus(`生成中… ${sec}s`) });
      if (r.status === "done" && r.result) {
        const url = String(r.result);
        slot.url = url;
        if (P("art")) P("art").innerHTML = `<a href="${esc(url)}" target="_blank" rel="noopener"><img src="${esc(url)}?t=${Date.now()}" alt="result"></a>`;
        setStatus("✓ 測試生圖完成（記得按儲存）");
      } else {
        throw new Error(r.error || "生圖失敗");
      }
    } catch (e) {
      if (P("art")) P("art").innerHTML = `<span class="mini">失敗</span>`;
      setStatus(e.message, true);
    } finally {
      if (btn) btn.disabled = false;
    }
  });
  panel.hidden = true;
  openBtn.setAttribute("aria-expanded", "false");
}
