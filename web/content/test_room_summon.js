/* 試煉房抽妹子：人設跟 /testword 同一套。抽到後背景補半身立繪。不寫遊戲名冊。 */
import { loadPools, generateGirl, RARITY_MARK, PERSONALITY_NAMES, KINK_NAMES } from "./girl_gen.js?v=3";
import {
  ensureBody,
  clampBody,
  bodyPromptLines,
  applyBodyFromUserText,
  applyAct,
  TALK_ACTS,
  snapshotBodyForUi,
  applyUiSnapshot,
  SEMEN_ZH,
  STUFFED_OPTIONS,
  AROUSAL_STAGE,
  arousalStage,
  decayArousalOffChat,
  zeroArousal,
  startArousalCool,
  clearArousalCool,
  decayArousalCool,
  resetOpenness,
} from "./body_state.js?v=20";
import { classifyUserText, applyVerbalTease, verbalTeasePrompt } from "./verbal_tease.js?v=1";
import {
  effectiveStun,
  calcStun,
  shouldSkipLlm,
  scrambleReply,
  stunTemplate,
  spasmTemplate,
  afterglowTemplate,
  noteActShock,
  tickStunAfterReply,
  ensureStunFields,
  applyTeaseSpasm,
  noteTalkExchange,
  inSpasm,
  inAfterglow,
  noteAfterglow,
  consumeAfterglowReply,
  consumeEjacTalk,
  ejacTalkPromptLines,
  afterglowPromptLines,
  scrubFalseCreampieLine,
  stunTier,
  moanVoicePromptLines,
  speechMode,
  speechMayBreak,
  SPASM_MS,
  SHOCK_MAX,
  AFTERGLOW_FRIEND_MS,
  AFTERGLOW_FRIEND_REPLIES,
  AFTERGLOW_FRIEND_CONT_MS,
  AFTERGLOW_FRIEND_CONT_REPLIES,
  AFTERGLOW_FRIEND_MARATHON_MS,
  AFTERGLOW_FRIEND_MARATHON_REPLIES,
  peekOccupancy,
  takeOccupancy,
  presentOccupied,
  occupancyMoanLine,
  occupancyPromptLine,
  occupancyLabel,
} from "./stun_speech.js?v=24";
import {
  pickPortraitUrl,
  portraitPathKey,
  uncutPortraitSet,
  judgePortraitCut,
  markPortraitUncut,
} from "./portrait_pick.js?v=2";
import {
  ensureTeaseFields,
  actLockState,
  isActUnlocked,
  recordTeasePress,
  orderedTalkActs,
  availableActs,
  decayBodyIdle,
  insertUnlocked,
} from "./tease.js?v=8";
import {
  ensurePlayer,
  emptyPlayer,
  canTease,
  teaseBlockReason,
  applyTeaseClimax,
  decayPlayerIdle,
  playerHint,
  refillSemen,
  grantSemen as grantPlayerSemen,
  spendSemen,
  semenMaxCc,
  kidneyCheck,
} from "./player_state.js?v=12";
import { ensureOpenness, getOpenness } from "./openness.js?v=1";
import { occupantOf, savedOccupant, blocksSummon, roomFullText as roomFullLine } from "./room_occupancy.js?v=1";
import {
  ensureInvasion,
  applyInvasionRoll,
  decayInvasion,
  decayInvasionByTime,
  chatLineHappy,
  chatInvasionDrop,
  clearInvasion,
  getInvasion,
  INVASION_MAX,
  protestTone,
  protestPromptBlock,
  blendProtestReply,
} from "./invasion.js?v=9";
import {
  ensureMiss,
  getMiss,
  noteMissSeen,
  refreshMissOnEnter,
  drainMissPerLine,
  missReunionHappy,
  takeMissBonus,
  missOpenerHint,
  missPromptLines,
  missStageSpec,
  formatGap,
} from "./miss_you.js?v=1";
import {
  ensureStunDebt,
  getStunDebt,
  clearStunDebt,
  addStunDebt,
  normalInvasionFor,
  normalUndressInvasion,
  takeStunReckoning,
  settleShare,
  reckoningPrompt,
  reckoningFallback,
  reckoningFleeNote,
  reckoningMood,
  stunDebtActsText,
} from "./stun_reckoning.js?v=2";
import {
  SEX_POSES,
  SEX_PREGEN_STEPS,
  SEX_STEP_META,
  SEX_STEP_PROMPT_REV,
  sexPoseFor,
  sexStepPacksKey,
  getSexPosePacksCached,
  pickRuntimeSexPosePack,
  generateSexStepImage,
  buildSexStepImgBody,
  mountSexPosePackEditor,
  isDefaultSexStep,
  isSexStepResultUrl,
  normalizeSexPosePack,
  SEX_POSE_PROMPT_REV,
  pickSexThrustSlot,
  sexThrustSlotOfUrl,
  SEX_SUMMON_POSES,
  SEX_SUMMON_ANIM_FRAMES,
  planSexSummonSet,
  sexSummonImageCount,
} from "./sex_pose_packs.js?v=10";
import { buildSexAnimFrames, SEX_ANIM_SIZE } from "./sex_anim.js";
import { packFrameUrl } from "./frame_pack.js";
import {
  THRUST,
  newThrustSession,
  applyThrust,
  checkOrgasm,
  semenDanger,
  syncSemen,
  pickOtherImage,
  animFramesFor,
  typeDelayFor,
  pantPlaceholder,
  fallbackMoan,
  ThrustReplyPump,
  orgasmEventSteps,
  flowPregenSteps,
  openingDirective,
  openingFallback,
  openingBand,
  OPENING_BAND_ZH,
  scrubHusband,
  withTimeout,
  stunMixLine,
  isBloodShot,
  exciteCumAt,
  canStartSex,
  sexBlockReason,
  semenLow,
  canStartSexAt,
  marathonFinale,
} from "./sex_thrust.js?v=8";
import {
  getMoodCarry,
  decayMoodByTime,
  decayMoodPerLine,
  noteMood,
  noteMoodFromAct,
  noteMoodFromMark,
  moodCarryPromptLines,
  moodOpenerHint,
  moodFallbackLine,
  MOOD_TYPES,
} from "./emotion_carry.js?v=1";
import {
  undressOutfitText,
  undressShyPromptLines,
  undressShyOpenerHint,
  undressShyFallback,
  dressedReactionLine,
  dressedReactionPrompt,
} from "./undress_shy.js?v=3";
import { ensureMind, rememberExperience, rememberHomeReturn, lifeMemoryPromptLines } from "./life_memory.js?v=3";
import {
  mountButtPackEditor,
  pickRuntimeButtPack,
  loadButtDoc,
  generateButtPackImage,
  buildButtImgBody,
} from "./butt_packs.js?v=6";
import {
  mountWaistPackEditor,
  pickRuntimeWaistPack,
  loadWaistDoc,
  generateWaistPackImage,
  buildWaistImgBody,
} from "./waist_packs.js?v=5";
import {
  mountBreastPackEditor,
  pickRuntimeBreastPack,
  loadBreastDoc,
  generateBreastPackImage,
  buildBreastImgBody,
  isBreastDefaultPrompt,
} from "./breast_packs.js?v=3";
import {
  mountKneadPackEditor,
  pickRuntimeKneadPack,
  loadKneadDoc,
  generateKneadPackImage,
  buildKneadImgBody,
  isKneadDefaultPrompt,
} from "./knead_packs.js?v=3";
import {
  mountUndressPackEditor,
  listUndressScenes,
  buildUndressImgBody,
  presetByShot,
  SUMMON_UNDRESS_SHOTS,
  DROPPED_UNDRESS_SHOTS,
} from "./undress_packs.js?v=7";
import {
  mountSuckPackEditor,
  pickRuntimeSuckPack,
  loadSuckDoc,
  generateSuckPackImage,
  buildSuckImgBody,
  isSuckDefaultPrompt,
} from "./suck_packs.js?v=4";
import {
  mountLickPackEditor,
  pickRuntimeLickPack,
  loadLickDoc,
  generateLickPackImage,
  buildLickImgBody,
  isLickDefaultPrompt,
} from "./lick_packs.js?v=4";
import {
  mountLabiaPackEditor,
  pickRuntimeLabiaPack,
  loadLabiaDoc,
  generateLabiaPackImage,
  buildLabiaImgBody,
} from "./labia_packs.js?v=2";
import {
  mountLabiaRubPackEditor,
  pickRuntimeLabiaRubPack,
  loadLabiaRubDoc,
  generateLabiaRubPackImage,
  buildLabiaRubImgBody,
} from "./labia_rub_packs.js?v=2";
import {
  mountFingerPackEditor,
  pickRuntimeFingerPack,
  loadFingerDoc,
  generateFingerPackImage,
  buildFingerImgBody,
} from "./finger_packs.js?v=2";
import {
  mountVaginaFingerPackEditor,
  pickRuntimeVaginaFingerPack,
  loadVaginaFingerDoc,
  generateVaginaFingerPackImage,
  buildVaginaFingerImgBody,
  XRAY_ACTION_PACKS_ON,
} from "./vagina_finger_packs.js?v=2";
import {
  mountCervixRubPackEditor,
  pickRuntimeCervixRubPack,
  loadCervixRubDoc,
  generateCervixRubPackImage,
  buildCervixRubImgBody,
} from "./cervix_rub_packs.js?v=2";
import {
  mountStandeePackEditor,
  loadStandeeDoc,
  listFilledStandeeSlots,
  generateStandeePackImage,
  buildStandeeImgBody,
  standeeUrlFor,
} from "./standee_packs.js?v=1";
import { SUMMON_RITUAL_LINES, startSummonRitualStatus, paintRitualBlocks } from "./summon_ritual.js?v=4";
import { nudeActionPacksOn, nudePacksKey, pickActionPackUrl } from "./nude_action.js?v=1";
import { regionById, rollJapanRegion } from "./japan_regions.js";
import { climateNote, rollGround } from "./japan_grounds.js";
import { japanNow, taiwanNow } from "./japan_clock.js?v=2";
import { rollStayHours, visitDue, outsideMoodNow, moodStrengthWord, paintLifeRow } from "./life_schedule.js?v=3";
import { BASE_OUTFIT, pickSummonOutfit, pickChangeOutfit } from "./outfit_pick.js?v=1";
import { downloadVisitPics, clearVisitPics } from "./visit_pics.js?v=1";
import { HOMES, sampleHomes } from "./japan_homes.js";
import {
  hungerOn,
  ensureHunger,
  tickHunger,
  peekHunger,
  relieveHunger,
  setHunger,
  noteBeg,
  begActive,
  closeBeg,
  temperOnOpen,
  hungerArousalBonus,
  activityHunger,
  hungerPromptLines,
  hungerOpenerHint,
  hungerLabel,
  hungerTier,
  BEG_AT,
  PEAK_AT,
  marathonEligible,
  startMarathon,
  marathonOrgasm,
  marathonLocked,
  marathonOrgasmsLeft,
  stageBand as hungerBand,
} from "./hunger.js?v=2";
import {
  organDevOn,
  ensureOrganDev,
  noteTouch as devNoteTouch,
  noteTouchPart as devNoteTouchPart,
  noteOrgasm as devNoteOrgasm,
  addSessions as devAddSessions,
  resetOrganDev,
  devArousalBonus,
  devPassionChance,
  organDevPromptLines,
  organDevLabel,
  COLOR_ZH as DEV_COLOR_ZH,
  ORGAN_ZH as DEV_ORGAN_ZH,
} from "./organ_dev.js?v=1";

const $ = (id) => document.getElementById(id);

let girl = null;
/** 房間剪影（room_doll.js）讀她的外觀：身高／體型／罩杯／髮型＋身上那套（裙子）＋脫到第幾階。test_room.js 每秒問一次。 */
window.RoomLookProvider = () => (girl ? { look: girl.look || null, outfit: wornOutfit(girl), undressStage: undressStage(girl) } : null);

// ---------------------------------------------------------------- 房間活動（room_activity.js，房間層執行）
// 她在房間裡做什麼由 room_character.js 依這裡給的情境挑；開始／定下來的事件回寫到 girl.roomActivity
// （跟房間存檔走：重新整理還在，手機為主、電腦跟著鏡像）。
const roomActs = () => window.RoomActivity || null;
function roomActMem(who = girl) {
  const A = roomActs();
  if (!A || !who) return null;
  who.roomActivity = A.ensureMem(who.roomActivity);
  return who.roomActivity;
}
/** 沒有房間裡的情緒餘溫時，用她從日本帶回來的心情：不悅→生氣、低落→委屈（強度打六折），房間活動會跟著偏（蹲角落、背對）。 */
function outsideMoodForRoom(who) {
  if (!who?.world?.mood) return null;
  const now = outsideMoodNow(who.world);
  const type = { 不悅: "angry", 低落: "hurt" }[now.name];
  return type ? { type, level: Math.round(now.level * 0.6) } : null;
}
window.RoomActivityContext = () => {
  if (!girl) return null;
  const A = roomActs(), mem = roomActMem();
  const mood = getMoodCarry(girl);
  const ctx = {
    hour: taiwanNow().hour,
    chrono: girl.chrono?.name || "",
    mood: mood ? { type: mood.type, level: mood.level } : outsideMoodForRoom(girl),
    miss: MISS_YOU_ON ? getMiss(girl) : 0,
    stage: girl.stage || "stranger",
    hobbies: Array.isArray(girl.hobbies) ? girl.hobbies : [],
    arousal: girl.bodyState?.arousal || 0,
    history: A && mem ? A.historyIds(mem) : [],
    bias: mem?.bias || null,
    // 番茄鐘開著：安靜一點（不跳舞、不湊到前面）
    calm: (() => { const el = document.getElementById("pomo"); return !!el && !el.hidden; })(),
    now: Date.now(),
  };
  // 性飢渴（hunger.js）：夾腿扭／坐立不安／偷看；妻子很高 → 走過來求（冷卻在 hunger.js）
  if (HUNGER_ON) Object.assign(ctx, activityHunger(girl, { stageKey: girl.stage || "stranger", now: ctx.now, calm: ctx.calm }));
  return ctx;
};
let roomActSavedAt = 0;
window.RoomActivitySink = (evt) => {
  const A = roomActs(), mem = roomActMem();
  if (!A || !mem || !evt?.id) return;
  if (evt.type === "start") {
    A.noteStart(mem, { id: evt.id, at: evt.at, dur: evt.dur });
    if (evt.id === "hunger_beg" && HUNGER_ON) hungerBegStarted();
  } else if (evt.type === "hold" && mem.cur?.id === evt.id) {
    mem.cur.since = evt.at;
    // 2026-10-09 Al：不跳粉紅小卡，直接打開對話框（她開口求、下面只有「做愛／拒絕」）
    if (evt.id === "hunger_beg" && HUNGER_ON && girl) maybeOpenBegDialog();
  } else return;
  if (mem.bias && !A.biasStrength(mem.bias)) mem.bias = null;
  // 活動 1～3 分鐘才換一次；開始時順手存檔（最多 20 秒一次）
  if (evt.type === "start" && Date.now() - roomActSavedAt > 20000) {
    roomActSavedAt = Date.now();
    persistRoom();
  }
};
let roomActTalkStart = null;

// ---------------------------------------------------------------- 器官開發度（organ_dev.js，2026-10-09）
/** 閘門：<html data-organ-dev="1">。一場（離上次碰她 >30 分鐘才算新的一場）每個器官最多 +1；做愛另記「被肏」。 */
const ORGAN_DEV_ON = organDevOn();
function organDevLevelUps(ups) {
  for (const u of ups || []) {
    pushDebug(`開發度：${DEV_ORGAN_ZH[u.organ] || u.organ}變成${DEV_COLOR_ZH[u.to]}了（外觀已改，之後的圖會跟著變）`);
  }
}
/** 碰到某部位（快捷動作 hitId／台詞命中 id）：記這一場＋依敏感度多漲性奮。 */
function organDevTouch(partId) {
  if (!ORGAN_DEV_ON || !girl || !partId) return;
  const r = devNoteTouchPart(girl, partId);
  if (!r) return;
  const bonus = devArousalBonus(girl, partId);
  if (bonus && girl.bodyState) girl.bodyState.arousal = clampBody((girl.bodyState.arousal || 0) + bonus);
  if (r.counted.length) pushDebug(`開發度 +1 場：${r.counted.map((k) => DEV_ORGAN_ZH[k] || k).join("、")}${bonus ? `（敏感 → 性奮多 +${bonus}）` : ""}`);
  organDevLevelUps(r.levelUps);
}
/** 她高潮一次（做愛／調戲）。 */
function organDevOrgasm() {
  if (!ORGAN_DEV_ON || !girl) return;
  devNoteOrgasm(girl);
}
/** 做愛每一下：記「被肏」這一場（同一場只 +1）；陰道越敏感越容易多 +1 激情。 */
function organDevThrust(sess) {
  if (!ORGAN_DEV_ON || !girl) return;
  const r = devNoteTouch(girl, ["vagina", "labia", "sex"]);
  if (r?.counted.length) pushDebug(`開發度 +1 場：${r.counted.map((k) => DEV_ORGAN_ZH[k] || k).join("、")}`);
  organDevLevelUps(r?.levelUps);
  const p = devPassionChance(girl);
  if (sess && p > 0 && Math.random() < p) sess.passion += 1;
}
function renderOrganDevDebug() {
  const el = $("dbg-organ-dev");
  if (!el) return;
  if (!ORGAN_DEV_ON || !girl) { el.textContent = "—"; return; }
  ensureBody(girl);
  el.textContent = organDevLabel(girl);
}
function bindOrganDevDebug() {
  const add = (organ, n) => {
    if (!ORGAN_DEV_ON || !girl) return;
    ensureBody(girl);
    organDevLevelUps(devAddSessions(girl, organ, n));
    persistRoom();
    renderDebug();
  };
  for (const organ of ["nipples", "clit", "vagina", "sex"]) {
    for (const n of [1, 20, 100]) onId(`dbg-dev-${organ}-${n}`, "click", () => add(organ, n));
  }
  onId("dbg-dev-reset", "click", () => {
    if (!ORGAN_DEV_ON || !girl) return;
    ensureBody(girl);
    resetOrganDev(girl);
    pushDebug("除錯：開發度歸零（顏色回粉色）");
    persistRoom();
    renderDebug();
  });
}

// ---------------------------------------------------------------- 性飢渴（hunger.js，2026-10-09）
/** 性飢渴閘門：<html data-hunger="1">（test_room＋主房間都開；拿掉屬性即關）。跟退役的 CRAVE_ON／舊 crave 欄位無關。 */
const HUNGER_ON = hungerOn();
/** 妻子：她開始走過來 → 記冷卻＋開「求」的窗口；走到面前（hold）直接打開求的對話框（maybeOpenBegDialog；粉紅小卡 2026-10-09 拿掉）。 */
function hungerBegStarted() {
  if (!girl) return;
  noteBeg(girl);
  pushDebug("性飢渴：她走過來求你了");
  persistRoom();
  renderDebug();
}
// ---------------------------------------------------------------- 妻子來求：直接打開對話框（2026-10-09 Al）
/**
 * 她走到你面前（hunger_beg 的 hold）→ 直接開對話框：立繪置中、她第一句就求你做愛（AI，失敗用本地句）、
 * 底下只有「做愛」「拒絕」兩個鈕（沒有輸入框，選了才回到一般對話）。
 * 現在開不了（對話已開、番茄鐘、別的畫面、App 在背景…）→ 她照樣站在前面；15 分鐘內長按她，一樣進這個對話框。
 * 做愛：照一般「做愛」那條路（沒脫光就她自己迫不及待脫光）；精液 ≤0 照樣擋（紅卡）——飢渴頂點（PEAK_AT）例外，進榨乾場。
 * 拒絕：她用一句話反應（失落／賭氣），之後照常聊天。沒有數值懲罰。
 */
let begDialog = null;   // { phase: "opening" | "choose" | "busy", at }
const BEG_LINES_PEAK = [
  "老公…我、我真的忍不住了…現在就要你，好不好…",
  "嗚…老公…身體好熱…抱我、跟我做…拜託…",
];
const BEG_LINES = [
  "老公…人家想要了…陪我做好不好？",
  "那個…老公…可以抱我嗎？我想要你…",
];
const BEG_REFUSE_LINES = [
  "…哼，好嘛…那你等一下要補償我喔…",
  "嗚…真的不要嗎…好吧…",
];
function begPending(who = girl) {
  const g = who?.bodyState?.hunger?.beg;
  return !!g && !g.seen && begActive(who);
}
function begDialogActive() {
  return !!begDialog && sheetOpen();
}
/** 她走到面前了：能開就直接開對話框。 */
function maybeOpenBegDialog() {
  if (!girl || !HUNGER_ON || begDialog || sheetOpen()) return false;
  if (!girlInRoom() || girl.errand === "clothes" || talkBusy || pending || summoning) return false;
  if (document.visibilityState === "hidden") return false;
  const pomo = $("pomo");
  if (pomo && !pomo.hidden) return false;
  const editor = $("room-editor");
  if (editor && !editor.hidden) return false;
  const room = $("room");
  if (room && !room.getClientRects().length) return false;
  if (sceneOpen() || activeRoomScene) return false;
  if (!begPending(girl)) return false;
  pushDebug("性飢渴：她走到你面前 → 直接打開對話框");
  showSheet();
  return true;
}
function begFallbackLine() {
  const peak = HUNGER_ON && girl && peekHunger(girl, Date.now(), girl.stage || "stranger") >= PEAK_AT;
  const pool = peak ? BEG_LINES_PEAK : BEG_LINES;
  const line = pool[Math.floor(Math.random() * pool.length)];
  return girl && hungerBand(girl.stage || "stranger") === "wife" ? line : line.replace(/老公/g, "那個");
}
/** 對話框開了：她第一句求你。 */
async function openBegDialog() {
  if (!girl || !begDialog) return;
  const who = girl;
  if (talkFor !== who.id || !lines.length) {
    who.sessionEnded = false;
    talkFor = who.id;
    lines = [];
    who.chatLines = [];
    who.topicHint = "";
  }
  begDialog.phase = "opening";
  talkBusy = true;
  $("portrait-sheet")?.classList.add("beg-chat");
  setTalkEnabled(false);
  $("portrait-name").textContent = who.name;
  $("portrait-meta").textContent = "";
  setTyping(true);
  const peak = peekHunger(who, Date.now(), who.stage || "stranger") >= PEAK_AT;
  let line = "";
  try {
    ensureStunFields(who);
    const occ = takeOccupancy(who, "");
    if (occ.score >= 95) {
      line = occupancyMoanLine(occ, who) || "……嗯啊…";
    } else {
      const ask = [
        `（你忍不住了，自己走到他面前來——就是來求他跟你做愛的${peak ? "，身體已經渴到極點" : ""}。只寫你開口的第一句：直接、撒嬌又難耐地求他現在跟你做愛，一兩句，不要先聊別的，不要旁白。）`,
        occupancyPromptLine(occ),
      ].filter(Boolean).join("\n");
      let reply = "";
      try {
        reply = await withTimeout(askGirl(ask), THRUST.OPENING_TIMEOUT_MS, "");
      } catch (err) {
        console.warn("[beg opening]", err?.message || err);
      }
      const clean = scrubHusband(cleanLine(reply), who.stage || "stranger");
      line = presentOccupied(who, clean || begFallbackLine(), "", occ) || begFallbackLine();
    }
  } catch (err) {
    console.warn("[beg]", err?.message || err);
    line = begFallbackLine();
  }
  if (girl !== who || !begDialog) return;
  noteTalkExchange(who);
  if (MISS_YOU_ON) noteMissSeen(who);
  who.freshMeet = false;
  lines.push({ role: "user", content: "（她自己走到你面前，扭扭捏捏地看著你。）" });
  lines.push({ role: "assistant", content: line });
  rememberChat();
  persistRoom();
  setTyping(false);
  await typeLine(who.name, line);
  if (girl !== who || !begDialog) return;
  begDialog.phase = "choose";
  talkBusy = false;
  refreshTalkActs();
}
function endBegDialog() {
  begDialog = null;
  $("portrait-sheet")?.classList.remove("beg-chat");
  $("talk-acts")?.classList.remove("undress-bar", "beg-bar");
}
function renderBegBar() {
  const row = $("talk-acts");
  if (!row || !begDialog) return;
  row.hidden = !sheetOpen() || !girl;
  row.classList.add("undress-bar", "beg-bar");
  for (const btn of [...row.querySelectorAll("button")]) btn.remove();
  const choose = begDialog.phase === "choose";
  const add = (id, label, onClick) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.undress = id;
    btn.dataset.beg = id;
    btn.textContent = label;
    btn.disabled = !choose;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      onClick();
    });
    row.append(btn);
    return btn;
  };
  const sex = add("sex", "做愛", () => void begAccept());
  // 精液 ≤0（而且不是飢渴頂點）：鈕變灰、點了跳紅卡說原因（同一般「做愛」鈕）
  const cc = ensurePlayer(player).semenCc;
  if (!canStartSexAt(cc, { peak: sexPeakNow() })) {
    sex.classList.add("is-dry", "is-locked");
    sex.setAttribute("aria-disabled", "true");
    sex.title = sexBlockReason(cc);
    const lock = document.createElement("span");
    lock.className = "act-lock";
    lock.textContent = `精液 ${cc}cc`;
    sex.append(lock);
  }
  add("refuse", "拒絕", () => void begRefuse());
}
/** 沒脫光就答應：她自己迫不及待脫光（記成她自己脫的 → 傳教士）。 */
function begStripForSex(who = girl) {
  if (!who || undressStage(who) >= 3) return false;
  const u = ensureUndress(who);
  u.stage = 3;
  u.pantiesBy = "self";
  u.sexStance = "順從";
  rollNudeStandee(who);
  void queueNudeActionPregen(who);
  void queueSexPosePregen(who);
  lines.push({ role: "user", content: "（她迫不及待地自己把衣服全脫了。）" });
  pushDebug("性飢渴：答應她 → 她自己脫光");
  persistRoom();
  try { paintHalfPortrait(who); } catch { /* ignore */ }
  return true;
}
async function begAccept() {
  if (!girl || !begDialog || begDialog.phase !== "choose") return;
  // 一般：精液 ≤0 跳紅卡擋下（留在選擇）；飢渴頂點例外（榨乾場）
  if (sexStartBlocked()) return;
  const who = girl;
  lines.push({ role: "user", content: "（你答應了她。）" });
  closeBeg(who);
  endBegDialog();
  begStripForSex(who);
  talkBusy = false;
  refreshTalkActs();
  openRoomScene("sex");
  // 做愛場面沒開起來（閘門關等）→ 回到一般對話
  if (!sexChat && !activeRoomScene) setTalkEnabled(true);
}
async function begRefuse() {
  if (!girl || !begDialog || begDialog.phase !== "choose") return;
  const who = girl;
  begDialog.phase = "busy";
  talkBusy = true;
  renderBegBar();
  lines.push({ role: "user", content: "（你拒絕了她，現在不想做。）" });
  $("portrait-name").textContent = who.name;
  setTyping(true);
  let line = "";
  try {
    const occ = takeOccupancy(who, "");
    if (occ.score >= 95) line = occupancyMoanLine(occ, who) || "……嗚…";
    else {
      const ask = [
        "（他拒絕了你的求歡。用一兩句話反應：失落、委屈或賭氣，但還是黏著他；不要再一直求，不要旁白。）",
        occupancyPromptLine(occ),
      ].filter(Boolean).join("\n");
      let reply = "";
      try {
        reply = await withTimeout(askGirl(ask), THRUST.OPENING_TIMEOUT_MS, "");
      } catch (err) {
        console.warn("[beg refuse]", err?.message || err);
      }
      const fb = BEG_REFUSE_LINES[Math.floor(Math.random() * BEG_REFUSE_LINES.length)];
      const clean = scrubHusband(cleanLine(reply), who.stage || "stranger");
      line = presentOccupied(who, clean || fb, "", occ) || fb;
    }
  } catch {
    line = BEG_REFUSE_LINES[0];
  }
  if (girl !== who) return;
  closeBeg(who);
  pushDebug("性飢渴：你拒絕了她");
  noteTalkExchange(who);
  lines.push({ role: "assistant", content: line });
  rememberChat();
  persistRoom();
  setTyping(false);
  endBegDialog();
  await typeLine(who.name, line);
  talkBusy = false;
  if (sheetOpen() && girl === who) setTalkEnabled(true);
}

// ---------------------------------------------------------------- 榨乾場（妻子飢渴頂點做愛，2026-10-09 Al）
/** 現在開始做愛會不會是榨乾場（妻子以上＋飢渴 ≥ PEAK_AT）。 */
function sexPeakNow(who = girl) {
  return !!(HUNGER_ON && who && marathonEligible(who, { stageKey: who.stage || "stranger" }));
}
/** 榨乾場鎖著（她還沒滿足）：不能回到對話、不能關對話框。 */
function sexMarathonLocked() {
  return !!(sexChat && marathonLocked(sexChat.marathon));
}
function nagMarathonLocked() {
  showClimaxTip("她緊緊纏著你，不讓你停下來…");
}

/** 被滿足：orgasm 大降、creampie 中降、touch 小降。 */
function hungerRelief(kind) {
  if (!HUNGER_ON || !girl) return;
  const r = relieveHunger(girl, kind, Date.now(), girl.stage || "stranger");
  if (r && r.drop > 0 && kind !== "touch") pushDebug(`性飢渴 ${Math.round(r.before)}→${Math.round(r.after)}（${kind === "orgasm" ? "高潮" : "內射"}）`);
}
/** 打開聊天：算時間、女友起欲求不滿的小脾氣（有冷卻）、妻子來求的那次標成被看到了。 */
function hideHungerNote() {
  const el = $("hunger-note");
  if (!el) return;
  el.classList.remove("in");
  el.hidden = true;
}
function hungerChatOpen() {
  hideHungerNote();
  if (!HUNGER_ON || !girl) return;
  const now = Date.now(), stageKey = girl.stage || "stranger";
  const lv = tickHunger(girl, now, stageKey);
  const h = ensureHunger(girl, now);
  if (h?.beg && begActive(girl, now)) {
    h.beg.seen = true;
    pushDebug("性飢渴：她來求你，你理她了");
  }
  const mood = temperOnOpen(girl, { stageKey, now });
  if (mood) {
    noteMood(girl, { ...mood, now });
    pushDebug(`性飢渴 ${Math.round(lv)}：欲求不滿（angry ${mood.level}）`);
  }
}
function hungerChatClose() {
  if (!HUNGER_ON || !girl) return;
  if (girl.bodyState?.hunger?.beg?.seen) closeBeg(girl);
}
function renderHungerDebug() {
  const el = $("dbg-hunger");
  if (!el) return;
  if (!HUNGER_ON || !girl) { el.textContent = "—"; return; }
  ensureBody(girl);
  ensureHunger(girl);
  el.textContent = hungerLabel(girl, Date.now(), girl.stage || "stranger");
}
function bindHungerDebug() {
  const set = (v) => {
    if (!HUNGER_ON || !girl) return;
    ensureBody(girl);
    setHunger(girl, v);
    persistRoom();
    renderDebug();
  };
  onId("dbg-hunger-0", "click", () => set(0));
  onId("dbg-hunger-50", "click", () => set(50));
  onId("dbg-hunger-75", "click", () => set(75));
  onId("dbg-hunger-95", "click", () => set(95));
  // 頂點（妻子以上做愛＝榨乾場）
  onId("dbg-hunger-peak", "click", () => set(100));
  onId("dbg-hunger-12h", "click", () => {
    if (!HUNGER_ON || !girl) return;
    ensureBody(girl);
    const h = ensureHunger(girl);
    tickHunger(girl, Date.now(), girl.stage || "stranger");
    h.at -= 12 * 3600e3;
    h.satedUntil = 0;
    tickHunger(girl, Date.now(), girl.stage || "stranger");
    persistRoom();
    renderDebug();
  });
  // 立刻讓她走過來求（不看關係階、不看冷卻；測試用）
  onId("dbg-hunger-beg", "click", () => {
    if (!HUNGER_ON || !girl) return;
    ensureBody(girl);
    if (peekHunger(girl) < BEG_AT) setHunger(girl, 95);
    const ok = window.RoomActor?.startActivity?.("hunger_beg");
    pushDebug(ok ? "除錯：叫她走過來求（走到面前就打開對話框）" : "除錯：她走不過去 → 直接打開求的對話框");
    if (!ok) {
      noteBeg(girl);
      if (!maybeOpenBegDialog()) pushDebug("除錯：現在開不了對話框（對話已開／不在房間）");
    }
    renderDebug();
  });
}
/** 打開對話：記下她正在做的事（prompt 用），算打斷後果（有冷卻），定住她的姿勢。 */
function activityChatOpen() {
  const A = roomActs(), mem = roomActMem();
  if (!A || !mem || !girlInRoom()) return;
  const now = Date.now();
  const live = window.RoomActor?.activity?.() || null;
  window.RoomActor?.hold?.(true);
  roomActTalkStart = { aff: girl.affection || 0, arousal: girl.bodyState?.arousal || 0 };
  hungerChatOpen();
  // 只有她已經「在做」（不是正走過去）才算被打斷
  if (!live || live.phase !== "hold" || mem.cur?.id !== live.id) {
    mem.talk = null;
    return;
  }
  const prev = mem.history[0] || null;
  const hit = A.interrupt(mem, { now, chrono: girl.chrono?.name || "", hour: taiwanNow().hour });
  mem.talk = { id: mem.cur.id, since: mem.cur.since, at: now, prevId: prev?.id || "", prevAt: prev?.at || 0, wake: !!hit.wake };
  if (hit.mood) noteMood(girl, { ...hit.mood, now });
  if (hit.affection) bumpAffection(hit.affection, "她正無聊，你來找她");
  if (hit.mood || hit.affection || hit.wake) {
    pushDebug(`活動被打斷：${A.BY_ID[mem.cur.id].name}→${hit.reason}${hit.mood ? `（${hit.mood.type} ${hit.mood.level}）` : ""}`);
  }
}
/** 關掉對話：依這次聊得怎樣（感情變化、情緒餘溫、興奮）偏向下一件事；睡覺被叫醒的話先起來。 */
function activityChatClose() {
  const A = roomActs(), mem = roomActMem();
  window.RoomActor?.hold?.(false);
  // 只有真的打開過（activityChatOpen 記了起點）才算一場聊天
  if (!A || !mem || !roomActTalkStart) return;
  const now = Date.now();
  const start = roomActTalkStart;
  roomActTalkStart = null;
  const arousal = girl.bodyState?.arousal || 0;
  const bias = A.chatBias({
    affDelta: (girl.affection || 0) - start.aff,
    mood: getMoodCarry(girl, now),
    arousal,
    arousalDelta: arousal - start.arousal,
    now,
  });
  const woke = !!mem.talk?.wake;
  hungerChatClose();
  mem.closeAt = now;
  mem.talk = null;
  if (bias) {
    mem.bias = bias;
    pushDebug(`聊完偏向：${bias.kind} ${bias.strength.toFixed(2)}`);
  }
  if (bias || woke) window.RoomActor?.replan?.();
}
/** talkSystem：她剛才在房間裡做什麼（第一句要接上）＋稍早做過的事。 */
function activityPromptLines() {
  const A = roomActs(), mem = girl?.roomActivity;
  if (!A || !mem || !girlInRoom()) return [];
  return A.promptLines({
    talk: mem.talk || null,
    mem,
    now: Date.now(),
    opening: lines.length === 0,
    wakeReact: girl.chrono?.wake_react || "",
  });
}
let player = emptyPlayer();
let pending = false;
let idleDecayTimer = 0;
/** 沒開聊天框時每 6 秒扣 1 性奮。開著聊天框不跑。 */
let arousalOffChatTimer = 0;
let lastIdleDecayAt = 0;
let activityOpen = false;
let workToken = 0;
let lifeLoopTimer = 0;
let autoLifeBusy = false;

/** 儀式結束、人出現之後才擲。非妻子 2～4 小時，妻子帶 8～16 小時。絕對 until，聊天不重設。 */
function armRoomVisit(who = girl) {
  if (!who) return;
  const wife = isWifeStage(who.stage);
  const hours = rollStayHours(wife);
  who.roomStayBand = wife ? "wife" : "short";
  who.roomStayHours = hours;
  who.roomVisitUntil = Date.now() + hours * 60 * 60 * 1000;
  delete who.summonArrivalPending;
}

/** 人還沒站定，或正在換衣服：這段不擲停留，也不把人送去日本。人已經在房裡時，沒清掉的繪圖清單不算。 */
function visitClockHeld() {
  if (summoning || summonBackBusy) return true;
  if (girl?.errand === "clothes") return true;
  const ritual = $("room-summon-ritual");
  if (ritual && !ritual.hidden) return true;
  if (girl?.summonQueueId && !window.RoomActor?.isPresent?.()) return true;
  return false;
}

/** 對話框開著而且這句還沒說完，或正在脫衣／做愛。關著對話不算在說話。 */
function stayTalking() {
  if (activeRoomScene || undressPlay || sexChat) return true;
  return !!(talkBusy && sheetOpen());
}

function clearRoomVisit(who = girl) {
  if (who) who.roomVisitUntil = 0;
}
let lines = [];
let talkFor = "";
let talkBusy = false;
let typeJob = 0;
/** 高失神解鎖的專屬場面：undress | undress-play | sex | "" */
let activeRoomScene = "";
/** 脫衣畫面：choose 兩個鈕；narr 旁白；reply 她的話。ending 在第二下下一句才收場。 */
let undressPlay = null;
/** 脫衣場面裡玩家正在看的場景 shot。空字串＝還在選。 */
let activeUndressShot = "";
let undressView = 0;

/**
 * 脫衣畫面改用「對話」版面（2026-10-03；<html data-undress-chat="1">，2026-10-04 起 test_room＋主房間都開）：
 * 不開 room-scene-overlay；留在對話框，藏掉上方輸入框，旁白／她的話打在對話框，
 * 底部互動列換成「叫她脫／幫她脫」→「下一句」＋「回到對話」。流程、機率、立繪、存檔都不變。
 * 頁面沒這旗 → 照舊用浮層卡片。
 */
function undressChatOn() {
  try {
    if (typeof globalThis.YORO_UNDRESS_CHAT === "boolean") return globalThis.YORO_UNDRESS_CHAT;
    return document.documentElement?.dataset?.undressChat === "1";
  } catch {
    return false;
  }
}
const UNDRESS_CHAT_ON = undressChatOn();

/** 想念值（miss_you.js）閘門：<html data-miss-you="1">（2026-10-04 起 test_room＋主房間 index.html 都開；拿掉屬性即關）。 */
function missYouOn() {
  try {
    if (typeof globalThis.YORO_MISS_YOU === "boolean") return globalThis.YORO_MISS_YOU;
    return document.documentElement?.dataset?.missYou === "1";
  } catch {
    return false;
  }
}
const MISS_YOU_ON = missYouOn();

/** 事後算帳閘門（2026-10-03）：<html data-stun-reckoning="1">（2026-10-04 起 test_room＋主房間都開）。 */
function stunReckoningOn() {
  try {
    if (typeof globalThis.YORO_STUN_RECKONING === "boolean") return globalThis.YORO_STUN_RECKONING;
    return document.documentElement?.dataset?.stunReckoning === "1";
  } catch {
    return false;
  }
}
const STUN_RECKONING_ON = stunReckoningOn();

/** 做愛閘門（2026-10-03，肏系統）：<html data-sex-poses="1">（2026-10-04 起 test_room＋主房間都開；圖組編輯器只在 test_room）。 */
function sexPosesOn() {
  try {
    if (typeof globalThis.YORO_SEX_POSES === "boolean") return globalThis.YORO_SEX_POSES;
    return document.documentElement?.dataset?.sexPoses === "1";
  } catch {
    return false;
  }
}
const SEX_POSES_ON = sexPosesOn();
let lastReckoning = null;

/** 回來／隔一陣子再開口：依離開多久累加想念（閘門關＝什麼都不做）。 */
function refreshMissNow(who = girl) {
  if (!MISS_YOU_ON || !who) return null;
  const r = refreshMissOnEnter(who, { stageKey: who.stage || "stranger", personality: basePersonality(who) });
  if (r.added > 0 && who === girl) {
    pushDebug(`想念 +${r.added} → ${r.level}（隔了 ${formatGap(r.gapMs)}）`);
    renderDebug();
  }
  return r;
}
/** 這一趟脫衣是不是用對話版面開的（開的當下決定，關掉前不變）。 */
let undressChatMode = false;
/** 進脫衣前對話框的那一句；中途「回到對話」時放回去。 */
let undressChatPrev = null;

function undressChatActive() {
  return undressChatMode && activeRoomScene === "undress-play" && !!undressPlay;
}

const ROOM_SCENE_STUBS = {
  undress: {
    title: "脫衣場面",
    body: "選一個場面。",
  },
  sex: {
    title: "做愛場面",
    body: "場面建置中\n（做愛規則待定；此為空白佔位。）",
  },
};

const SCENE_UNLOCK_STUN = 50;

function sceneOpen() {
  // 對話版脫衣：沒有浮層，場面跟著對話框開關
  if (undressChatActive() || sexChatActive()) return sheetOpen();
  return !!activeRoomScene && !$("room-scene-overlay")?.hidden;
}

/** 舊場面閘：有效失神 ≥50 或痙攣。脫衣入口改看痙攣或失神（≥75），不在這裡。 */
function highStunSceneUnlocked(who = girl) {
  if (!who) return false;
  ensureStunFields(who);
  if (inSpasm(who)) return true;
  return effectiveStun(who, "") >= SCENE_UNLOCK_STUN;
}

function sceneCard() {
  return $("room-scene-overlay")?.querySelector(".room-scene-card") || null;
}

function clearSceneFigure() {
  const img = $("room-scene-img");
  if (img) {
    img.hidden = true;
    img.removeAttribute("src");
    img.alt = "";
  }
  sceneCard()?.classList.remove("has-figure");
}

function paintSceneFigure(url, alt) {
  const img = $("room-scene-img");
  if (!img || !url) return;
  img.alt = alt || "";
  if ((img.getAttribute("src") || "") !== url) img.src = url;
  img.hidden = false;
  sceneCard()?.classList.add("has-figure");
}

/** 同一人、同一景只生一次；完成後記在 portraits[shot]。 */
const undressJobs = new Map();
const undressPortraitBusy = new Set();
const undressPortraitFailed = new Set();

function hideSceneChoices() {
  const box = $("room-scene-choices");
  if (!box) return;
  box.hidden = true;
  box.replaceChildren();
}

function markUndressChoice(shot) {
  const box = $("room-scene-choices");
  if (!box) return;
  for (const btn of box.querySelectorAll("button")) {
    btn.setAttribute("aria-pressed", btn.dataset.shot === shot ? "true" : "false");
  }
}

function renderUndressChoices(packs) {
  const box = $("room-scene-choices");
  if (!box) return;
  box.replaceChildren();
  if (!packs.length) {
    box.hidden = true;
    return;
  }
  box.hidden = false;
  for (const pack of packs) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.shot = pack.shot;
    btn.textContent = pack.name || pack.shot;
    btn.setAttribute("aria-pressed", pack.shot === activeUndressShot ? "true" : "false");
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      void showUndressScene(girl, pack);
    });
    box.append(btn);
  }
}

async function ensureUndressScene(who, pack) {
  const shot = pack.shot;
  const cached = String(who?.portraits?.[shot] || "");
  if (cached) return cached;
  const existing = undressJobs.get(shot);
  if (existing && existing.id === who.id) return existing.promise;
  const promise = generateUndressScene(who, pack);
  undressJobs.set(shot, { id: who.id, promise });
  try {
    return await promise;
  } finally {
    if (undressJobs.get(shot)?.promise === promise) undressJobs.delete(shot);
  }
}

/** 缺圖才生。完成後若人還在，重畫立繪（是否真的換上由當時的痙攣／失神決定）。 */
async function ensureUndressPortrait(who, shot) {
  if (!who?.id || !shot) return "";
  const cached = String(who.portraits?.[shot] || "");
  if (cached) return cached;
  const key = `${who.id}:${shot}`;
  if (undressPortraitFailed.has(key) || undressPortraitBusy.has(key)) return "";
  undressPortraitBusy.add(key);
  try {
    let pack = null;
    try {
      const packs = await listUndressScenes();
      pack = (Array.isArray(packs) ? packs : []).find((p) => p.shot === shot) || null;
    } catch {
      pack = null;
    }
    if (!pack) pack = presetByShot(shot);
    if (!pack) return "";
    const url = await ensureUndressScene(who, pack);
    if (url && girl && girl.id === who.id) {
      try { paintHalfPortrait(girl); } catch { /* ignore */ }
      try { paintUndressPlayFigure(); } catch { /* ignore */ }
    }
    if (!url) undressPortraitFailed.add(key);
    return url || "";
  } catch (err) {
    undressPortraitFailed.add(key);
    console.warn("[undress]", shot, err?.message || err);
    return "";
  } finally {
    undressPortraitBusy.delete(key);
  }
}

async function generateUndressScene(who, pack) {
  const engine = await gameImgRoute();
  await ensureGirlComfyCkpt(who);
  const result = await waitImage(buildUndressImgBody(pack, who, engine, { rating: halfRating(who) }));
  if (result?.status === "done" && result.result) {
    const stamped = stampPortraitUrl(result.result);
    who.portraits = who.portraits || {};
    who.portraits[pack.shot] = stamped;
    if (girl && girl.id === who.id) persistRoom();
    return stamped;
  }
  throw new Error(result?.error || "這張圖沒有生出來。");
}

async function showUndressScene(who, pack) {
  if (!who || !pack || activeRoomScene !== "undress") return;
  const token = ++undressView;
  activeUndressShot = pack.shot;
  markUndressChoice(pack.shot);
  const bodyEl = $("room-scene-body");
  const caption = pack.caption || pack.name || "";
  const cached = String(who.portraits?.[pack.shot] || "");
  if (cached) {
    paintSceneFigure(cached, `${who.name || ""}${pack.name || ""}`);
    if (bodyEl) bodyEl.textContent = caption;
    return;
  }
  clearSceneFigure();
  if (bodyEl) bodyEl.textContent = "畫面生成中……";
  try {
    const url = await ensureUndressScene(who, pack);
    if (token !== undressView || activeRoomScene !== "undress" || !sceneOpen() || !girl || girl.id !== who.id) return;
    paintSceneFigure(url, `${who.name || ""}${pack.name || ""}`);
    if (bodyEl) bodyEl.textContent = caption;
  } catch (err) {
    console.warn("[undress]", pack.shot, err?.message || err);
    if (token !== undressView || activeRoomScene !== "undress" || !sceneOpen()) return;
    if (bodyEl) bodyEl.textContent = String(err?.message || "這張圖沒有生出來。");
  }
}

async function openUndressChoices(who) {
  const token = undressView;
  const bodyEl = $("room-scene-body");
  if (bodyEl) bodyEl.textContent = "選一個場面。";
  let packs = [];
  try {
    packs = await listUndressScenes(true);
  } catch (err) {
    console.warn("[undress scenes]", err?.message || err);
    packs = [];
  }
  if (token !== undressView || activeRoomScene !== "undress" || !sceneOpen() || !girl || girl.id !== who.id) return;
  packs = (Array.isArray(packs) ? packs : []).filter((p) => p && !DROPPED_UNDRESS_SHOTS.has(p.shot));
  renderUndressChoices(packs);
  if (!packs.length && bodyEl) bodyEl.textContent = "還沒有脫衣場景。";
}

/** 做愛步驟圖（開場／加入／插一半／全插入／高潮／潮吹／內射）：同一人同一姿勢同一步同時只產一張（背景預產與按做愛共用）。 */
const sexPoseJobs = new Map();
let lastSexPosePick = null;
/** 做愛場面目前在第幾步：{ pose, packId, step } */
let sexStepView = null;

function sexStepRev(step) {
  return step === "open" ? SEX_POSE_PROMPT_REV : (SEX_STEP_PROMPT_REV[step] || 1);
}

/** 這一步用哪一組：有指定 packId（同一場用同一組）就找那組，否則隨機抽。 */
async function pickSexStepPack(pose, packId) {
  if (packId) {
    try {
      const doc = await getSexPosePacksCached(pose);
      const hit = (doc?.packs || []).find((p) => p.id === packId);
      if (hit) return normalizeSexPosePack(pose, hit);
    } catch { /* fall through */ }
  }
  try {
    return await pickRuntimeSexPosePack(pose);
  } catch {
    return null;
  }
}

/**
 * 拿這個姿勢某一步的圖：這組有快取 → 用；沒有 → 現產並存 portraits.sex_<pose>_<step>_packs[packId]。
 * 生圖失敗時退回這一步任一組的快取。回傳 { url, pose, step, packId, generated, fallback }。
 */
function ensureSexStepUrl(who, pose, step = "open", packId = "") {
  if (!who?.id || !SEX_POSES[pose] || !SEX_STEP_META[step]) return Promise.resolve({ url: "", pose, step });
  const lock = `${who.id}:${pose}:${step}`;
  if (sexPoseJobs.has(lock)) return sexPoseJobs.get(lock);
  const job = (async () => {
    const packsKey = sexStepPacksKey(pose, step);
    who.portraits = who.portraits || {};
    const pool = () => (who.portraits[packsKey] && typeof who.portraits[packsKey] === "object" ? who.portraits[packsKey] : {});
    // 舊伺服器（沒重啟）產的落在 testword：穿衣服／多一個男人 → 整批丟掉，不當快取也不當退路
    const bad = Object.entries(pool()).filter(([, v]) => v && !isSexStepResultUrl(pose, step, v));
    if (bad.length) {
      const next = { ...pool() };
      for (const [k] of bad) delete next[k];
      who.portraits[packsKey] = next;
      persistRoom();
    }
    const anyCached = () => Object.values(pool()).map((v) => String(v || "")).find((v) => v && isSexStepResultUrl(pose, step, v)) || "";
    const pack = await pickSexStepPack(pose, packId);
    if (!pack?.id) {
      const url = anyCached();
      return { url, pose, step, packId: "", generated: false, fallback: !!url };
    }
    // 舊版預設產的快取：這一步仍是預設 → 作廢重產；自訂只補記版本
    const revKey = `${packsKey}:${pack.id}`;
    if (pool()[pack.id] && ((who.portraits.actionPromptRev || {})[revKey] | 0) < sexStepRev(step)) {
      if (isDefaultSexStep(pose, step, pack)) {
        const next = { ...pool() };
        delete next[pack.id];
        who.portraits[packsKey] = next;
        persistRoom();
      } else {
        stampActionRev(who, packsKey, pack.id);
      }
    }
    const cached = String(pool()[pack.id] || "");
    if (cached) return { url: cached, pose, step, packId: pack.id, generated: false, fallback: false };
    try {
      const engine = await gameImgRoute();
      await ensureGirlComfyCkpt(who);
      // ③ 抽插：每組一個變體格（各自一個檔），肏時在這幾張之間換；全滿就覆寫格 1、把佔格 1 的組拿掉
      const tSlot = step === "thrust" ? pickSexThrustSlot(pose, pool(), pack.id) : { slot: 1, evict: [] };
      let r = await generateSexStepImage(pose, step, pack, who, engine, step === "thrust" ? { thrustSlot: tSlot.slot } : {});
      if (step === "thrust" && tSlot.slot > 1 && r?.stale) {
        // 舊伺服器不認得 thrust2…：退回格 1
        tSlot.evict = Object.entries(pool()).filter(([k, v]) => k !== pack.id && sexThrustSlotOfUrl(pose, v) === 1).map(([k]) => k);
        r = await generateSexStepImage(pose, step, pack, who, engine, { thrustSlot: 1 });
      }
      if (r?.status === "done" && r.result) {
        const stamped = stampPortraitUrl(r.result);
        const kept = { ...pool() };
        for (const k of tSlot.evict || []) delete kept[k];
        who.portraits[packsKey] = { ...kept, [pack.id]: stamped };
        stampActionRev(who, packsKey, pack.id);
        persistRoom();
        return { url: stamped, pose, step, packId: pack.id, generated: true, fallback: false };
      }
      console.warn("[sex-pose]", pose, step, r?.error || "生圖失敗", r?.stale || "");
    } catch (err) {
      console.warn("[sex-pose]", pose, step, err?.message || err);
    }
    const url = anyCached();
    return { url, pose, step, packId: pack.id, generated: false, fallback: !!url };
  })();
  sexPoseJobs.set(lock, job);
  job.finally(() => sexPoseJobs.delete(lock));
  return job;
}

function queueSexPosePregen(who = girl) {
  if (!SEX_POSES_ON || !who?.id || undressStage(who) < 3) return null;
  const pose = sexPoseFor(who);
  return (async () => {
    const first = await ensureSexStepUrl(who, pose, "open");
    const out = [first];
    for (const st of SEX_PREGEN_STEPS.filter((x) => x !== "open")) {
      if (undressStage(who) < 3) break;
      out.push(await ensureSexStepUrl(who, pose, st, first?.packId || ""));
    }
    return out;
  })();
}

/* 儀式提詞底下固定 10 格。實心＝這一段做完，閃的那格＝正在做，點＝還沒。 */
const SUMMON_SQUARES = 10;

function ritualBlocksEl() {
  const el = $("room-summon-ritual");
  return el && !el.hidden ? el : null;
}

function resetRitualBlocks() {
  const el = $("room-summon-ritual");
  if (el) paintRitualBlocks(el, 0, 0);
}

function paintSummonTenths(done, total) {
  const el = ritualBlocksEl();
  if (!el) return;
  const d = Math.max(0, done | 0);
  const t = Math.max(0, total | 0);
  if (!t) {
    paintRitualBlocks(el, 0, 0);
    return;
  }
  const filled = d >= t ? SUMMON_SQUARES : Math.min(SUMMON_SQUARES - 1, Math.floor((d * SUMMON_SQUARES) / t));
  paintRitualBlocks(el, filled, SUMMON_SQUARES);
}

/* ───────── 召喚預產整套做愛圖（2026-10-04；閘門同 data-sex-poses） ─────────
 * 兩個姿勢 × 每組（開場／加入／抽插變體／她高潮／內射／血精；潮吹不產）＋ 舊系統局部動圖 sexAnim[pose] 4 幀。
 * 整份跟半身／動作圖一起交給 RP5，伺服器仍一次一張。已有快取的做愛圖跳過。失敗不擋召喚。
 * 進度是儀式句子下面固定 10 格，每 10 秒換句時向伺服器問一次。 */
const sexSetJobs = new Map();

function sexSetProgressEl() {
  let el = $("room-summon-progress");
  if (el) return el;
  const stage = $("main-room-stage") || document.body;
  el = document.createElement("div");
  el.id = "room-summon-progress";
  el.className = "room-summon-progress";
  el.hidden = true;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  stage.appendChild(el);
  return el;
}

function paintSexSetProgress(text) {
  const el = sexSetProgressEl();
  if (!el) return;
  el.textContent = text || "";
  el.hidden = !text;
}

/** 幀包清單（/api/frame-packs → assets/frame_packs/index.json）；局部動畫與召喚預產共用。 */
function loadFramePacksCached() {
  if (!thrustFramesCache) {
    thrustFramesCache = (async () => {
      const read = async (url) => {
        try {
          const r = await fetch(url);
          if (!r.ok) return [];
          const j = await r.json();
          return Array.isArray(j?.packs) ? j.packs : (Array.isArray(j) ? j : []);
        } catch {
          return [];
        }
      };
      let packs = await read(`/api/frame-packs?ts=${Date.now()}`);
      if (!packs.length) packs = await read(`/assets/frame_packs/index.json?ts=${Date.now()}`);
      return packs.filter((p) => p && p.id);
    })();
  }
  return thrustFramesCache;
}

/** 舊系統局部動圖的一幀（同 app.js daydreamSexPose：sex_strip、下半身、1216×832、同體位幀包當骨架）。 */
function sexAnimFrameBody(who, pose, index, engine, built, bone) {
  const comfy = engine.imgProvider === "comfy";
  const size = SEX_ANIM_SIZE || { width: 1216, height: 832 };
  const frame = built.frames[index] || {};
  const pos = frame.pos || "";
  const neg = [built.neg, frame.extraNeg || ""].filter(Boolean).join(", ");
  return {
    key: `room-sexanim:${who.id}:${pose}:${index}:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: engine.imgModel || "grok-4.5",
    framing: "lower",
    rating: "nsfw",
    style: engine.imgStyle || "anime",
    character: who,
    extra: pos,
    prompt: pos,
    negative: neg,
    cutout: false,
    flat_bg: false,
    retry: true,
    scene_kind: "sex_strip",
    ...(bone ? { pose_ref: bone, pose_denoise: 0.70 } : {}),
    ...(comfy ? {
      comfy_url: engine.comfyUrl || "",
      ckpt: String(who.comfyCkpt || "").trim() || engine.comfyCkpt || "",
      width: size.width,
      height: size.height,
    } : {}),
  };
}

async function generateSexAnimFrame(who, pose, index, engine, built, bone) {
  const r = await waitImage(sexAnimFrameBody(who, pose, index, engine, built, bone));
  return r?.status === "done" && r.result ? String(r.result) : "";
}

/** 她還缺哪些做愛圖（兩姿勢 × 每組 × 步驟 ＋ 局部動圖缺幀）。 */
async function planSexSetFor(who) {
  if (!SEX_POSES_ON || !who?.id) return [];
  const packsByPose = {};
  for (const pose of SEX_SUMMON_POSES) {
    try {
      const doc = await getSexPosePacksCached(pose);
      packsByPose[pose] = (doc?.packs || []).map((p) => normalizeSexPosePack(pose, p)).filter((p) => p.id);
    } catch (err) {
      console.warn("[pregenSexSet] packs", pose, err?.message || err);
      packsByPose[pose] = [];
    }
  }
  who.portraits = who.portraits || {};
  return planSexSummonSet({ packsByPose, portraits: who.portraits, sexAnim: who.sexAnim, revOf: sexStepRev });
}

/**
 * 召喚時把整套做愛圖交給 RP5（缺的才列）。手機關了也照跑。
 * opts.onProgress(text)：每 10 秒回報一次「3/16」。
 */
function pregenSexSet(who, opts = {}) {
  if (!SEX_POSES_ON || !who?.id) return Promise.resolve({ planned: 0, done: 0, failed: 0, skipped: true, finished: true });
  if (sexSetJobs.has(who.id)) return sexSetJobs.get(who.id);
  const job = pregenSummonBundle(who, {
    portraits: false,
    sex: true,
    mode: opts.mode || "sex",
    onProgress: opts.onProgress,
  });
  sexSetJobs.set(who.id, job);
  job.finally(() => sexSetJobs.delete(who.id));
  return job;
}

/** 召喚收尾：缺的做愛圖交給 RP5。失敗會 throw（不退回手機自己一張張等）。 */
async function pregenSexSetForSummon(who, mode = "sex") {
  if (!SEX_POSES_ON || !who?.id) return null;
  try {
    const res = await pregenSexSet(who, {
      mode,
      onProgress: (text) => { console.info("[pregenSexSet]", text); },
    });
    if (res?.planned) {
      console.info(`[pregenSexSet] ${who.name || who.id}: 產 ${res.done}/${res.planned}${res.failed ? `，失敗 ${res.failed}` : ""}`);
    }
    return res;
  } catch (err) {
    console.warn("[pregenSexSetForSummon]", err?.message || err);
    throw err;
  }
}

/** 獻祭召喚（app.js，另一頁物件）：用房間人設把整套交給 RP5，再把畫好的抄回她身上。 */
async function pregenSexSetForGameGirl(s, onProgress) {
  if (!SEX_POSES_ON || !s?.id) return null;
  const roomGirl = buildRoomGirlFromSuccubus(s);
  if (!roomGirl) return null;
  const res = await pregenSexSet(roomGirl, {
    mode: "sacrifice",
    onProgress: typeof onProgress === "function" ? onProgress : (text) => { console.info("[pregenSexSet]", text); },
  });
  s.portraits = { ...(s.portraits || {}), ...(roomGirl.portraits || {}) };
  if (roomGirl.sexAnim) s.sexAnim = { ...(s.sexAnim || {}), ...roomGirl.sexAnim };
  if (res?.finished && res.id) await ackSummonQueue(res.id);
  return res;
}
window.RoomSexPregen = {
  get enabled() { return SEX_POSES_ON; },
  forGameGirl: pregenSexSetForGameGirl,
};

/* 召喚繪圖清單在 RP5。手機交完就可以關。儀式每 10 秒問一次進度，折成 10 格。 */
const summonWatches = new Map();

function summonQueueHttpError(status, payload) {
  const detail = typeof payload?.detail === "string" ? payload.detail : "";
  if (status === 404 && detail.includes("清單不存在")) {
    const err = new Error("清單不存在");
    err.code = "missing";
    return err;
  }
  if (status === 404) {
    const err = new Error("伺服器還沒有召喚清單。請在 RP5 重啟 uvicorn（port 3766）後再召喚。");
    err.code = "no-route";
    return err;
  }
  return new Error(errorText(payload, status));
}

async function fetchSummonQueue(qid) {
  const r = await fetch(`/api/summon-queue/${encodeURIComponent(qid)}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw summonQueueHttpError(r.status, j);
  return j;
}

function rememberSummonQueue(who, payload, mode) {
  if (!who || who !== girl || mode === "sacrifice" || mode === "clothes" || !payload?.id) return;
  who.summonQueueId = payload.id;
  who.summonQueueMode = mode || payload.mode || "";
  try { persistRoom(); } catch { /* */ }
}

async function ackSummonQueue(qid) {
  if (!qid) return;
  try {
    const r = await fetch(`/api/summon-queue/${encodeURIComponent(qid)}/ack`, { method: "POST" });
    if (!r.ok && r.status !== 404) {
      const j = await r.json().catch(() => ({}));
      console.warn("[summon-queue] ack", errorText(j, r.status));
    }
  } catch (err) {
    console.warn("[summon-queue] ack", err?.message || err);
  }
  if (girl?.summonQueueId === qid) {
    delete girl.summonQueueId;
    delete girl.summonQueueMode;
    try { persistRoom(); } catch { /* */ }
  }
}

/** 把一張畫好的圖寫回她身上。網址不對的（舊伺服器落到 testword）不收。 */
function applySummonSlot(who, slot, result) {
  const url = String(result || "").trim();
  if (!who || !url || !slot || typeof slot !== "object") return false;
  const kind = String(slot.kind || "");
  if (kind === "half") {
    const stamped = stampPortraitUrl(url);
    who.portraits = who.portraits || {};
    who.portraits.half = stamped;
    who.portrait = who.portraits.full || stamped;
    if (who === girl) { try { paintHalfPortrait(girl); } catch { /* */ } }
    return true;
  }
  if (kind === "pack") {
    const key = String(slot.packsKey || "");
    const packId = String(slot.packId || "");
    if (!key || !packId) return false;
    const stamped = stampPortraitUrl(url);
    who.portraits = who.portraits || {};
    who.portraits[key] = who.portraits[key] && typeof who.portraits[key] === "object" ? who.portraits[key] : {};
    who.portraits[key][packId] = stamped;
    if (slot.shotKey) who.portraits[slot.shotKey] = stamped;
    stampActionRev(who, key, packId);
    return true;
  }
  if (kind === "standee") {
    const slotId = String(slot.slotId || "");
    if (!slotId) return false;
    who.portraits = who.portraits || {};
    who.portraits.standee = who.portraits.standee || {};
    who.portraits.standee[slotId] = stampPortraitUrl(url);
    return true;
  }
  if (kind === "undress") {
    const shot = String(slot.shot || "");
    if (!shot) return false;
    who.portraits = who.portraits || {};
    who.portraits[shot] = stampPortraitUrl(url);
    return true;
  }
  if (kind === "sex-step") {
    if (!isSexStepResultUrl(slot.pose, slot.step, url)) {
      console.warn("[summon-queue] 做愛圖網址不收", slot.pose, slot.step, url);
      return false;
    }
    const packsKey = String(slot.packsKey || sexStepPacksKey(slot.pose, slot.step));
    who.portraits = who.portraits || {};
    const pool = { ...(who.portraits[packsKey] && typeof who.portraits[packsKey] === "object" ? who.portraits[packsKey] : {}) };
    for (const k of slot.evict || []) delete pool[k];
    if (slot.packId) {
      pool[slot.packId] = stampPortraitUrl(url);
      who.portraits[packsKey] = pool;
      stampActionRev(who, packsKey, slot.packId);
      return true;
    }
    return false;
  }
  if (kind === "sex-anim") {
    const pose = String(slot.pose || "");
    const frame = slot.frame | 0;
    if (!pose || frame < 0) return false;
    who.sexAnim = who.sexAnim && typeof who.sexAnim === "object" ? who.sexAnim : {};
    const rec = who.sexAnim[pose] && typeof who.sexAnim[pose] === "object" ? who.sexAnim[pose] : {};
    const urls = Array.isArray(rec.urls) ? rec.urls.slice() : [];
    while (urls.length < SEX_SUMMON_ANIM_FRAMES) urls.push("");
    urls[frame] = url;
    who.sexAnim[pose] = { ...rec, urls };
    return true;
  }
  return false;
}

function applyQueueItems(who, payload, applied) {
  let n = 0;
  for (const it of payload?.items || []) {
    const status = String(it?.status || "");
    if (status !== "done" && status !== "error") continue;
    const key = String(it?.key || "");
    if (!key || applied.has(key)) continue;
    applied.add(key);
    if (status === "done" && it.result && applySummonSlot(who, it.slot, it.result)) n += 1;
  }
  return n;
}

function paintQueueProgress(payload) {
  if (!payload) return;
  paintSummonTenths(payload.done | 0, payload.total | 0);
}

function reportQueueProgress(payload, onProgress) {
  paintQueueProgress(payload);
  if (typeof onProgress !== "function" || !payload?.total) return;
  try { onProgress(`${payload.done | 0}/${payload.total | 0}`); } catch { /* */ }
}

/** 同一人還沒收的舊清單：先把畫好的寫上，避免下一份把成品清掉。 */
async function absorbOpenQueue(who) {
  if (!who?.id) return;
  const r = await fetch(`/api/summon-queue?girl=${encodeURIComponent(who.id)}`, { cache: "no-store" });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw summonQueueHttpError(r.status, j);
  if (!j?.id) return;
  // 換衣服只活在那一趟。關掉頁面時舊衣服已經穿回去，不能再把新圖寫上來。
  if (j.mode === "clothes") {
    if (j.finished) await ackSummonQueue(j.id);
    return;
  }
  applyQueueItems(who, j, new Set());
  if (j.finished) await ackSummonQueue(j.id);
}

async function handoffSummonQueue(who, items, mode) {
  let r;
  try {
    r = await fetch("/api/summon-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        girlId: who.id,
        mode: mode || "",
        items: items.map((it) => ({ slot: it.slot || {}, body: it.body || {} })),
      }),
    });
  } catch (err) {
    throw new Error(err?.message || "交不出繪圖清單");
  }
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw summonQueueHttpError(r.status, j);
  console.info(`[summon-queue] ${who.name || who.id} 交給 RP5 ${j.total | 0} 張 ${j.id || ""}`);
  return j;
}

function watchSummonQueue(who, payload, opts = {}) {
  const qid = String(payload?.id || "");
  const mode = opts.mode || payload?.mode || "";
  const applied = opts.applied instanceof Set ? opts.applied : new Set();
  applyQueueItems(who, payload, applied);
  reportQueueProgress(payload, opts.onProgress);
  if (!qid || payload?.finished || !(payload?.total | 0)) return Promise.resolve(payload);
  const ritual = $("room-summon-ritual");
  const usesRitual = mode !== "sacrifice" && !!(ritual && !ritual.hidden);
  let timer = 0;
  let ticking = false;
  let tickAgain = false;
  let stopped = false;
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => { resolve = res; reject = rej; });
  const state = { qid, usesRitual };
  async function tick() {
    if (stopped) return;
    if (ticking) { tickAgain = true; return; }
    ticking = true;
    try {
      do {
        tickAgain = false;
        const next = await fetchSummonQueue(qid);
        if (stopped) return;
        const added = applyQueueItems(who, next, applied);
        reportQueueProgress(next, opts.onProgress);
        if (added && who === girl && mode !== "sacrifice") {
          try { persistRoom(); } catch { /* */ }
        }
        if (next.finished) {
          stop(null, next);
          return;
        }
      } while (tickAgain && !stopped);
    } catch (err) {
      if (err?.code === "missing" || err?.code === "no-route") {
        stop(err);
        return;
      }
      console.warn("[summon-queue]", err?.message || err);
    } finally {
      ticking = false;
    }
  }
  function armTimer() {
    if (timer) clearInterval(timer);
    timer = 0;
    if (stopped || usesRitual) return;
    timer = setInterval(() => { void tick(); }, 10000);
  }
  function stop(err, next) {
    if (stopped) return;
    stopped = true;
    if (timer) clearInterval(timer);
    timer = 0;
    summonWatches.delete(qid);
    if (err) reject(err);
    else resolve(next || payload);
  }
  state.tick = tick;
  state.armTimer = armTimer;
  summonWatches.set(qid, state);
  armTimer();
  return promise;
}

function refreshSummonQueue() {
  for (const w of summonWatches.values()) {
    if (w.usesRitual) void w.tick();
  }
}

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  for (const w of summonWatches.values()) {
    try { w.armTimer(); } catch { /* */ }
    void w.tick();
  }
  void tickLifeLoop();
  void pullLifeAgent();
});

/**
 * 召喚：穿衣（半身、立繪、動作、剖面）＋裸體動作＋脫衣＋做愛步驟與局部動圖。
 * 換衣服：clothedOnly，只重畫會露出衣服的。大頭、喜怒哀樂都不在這裡。
 * 手機關了，伺服器仍照清單跑。
 */
async function pregenSummonBundle(who, opts = {}) {
  if (!who?.id) return { planned: 0, done: 0, failed: 0, skipped: true, finished: true, id: "" };
  const mode = opts.mode || "arrive";
  const items = [];
  if (opts.portraits) {
    items.push(...await collectSummonPortraitItems(who, {
      halfOnly: !!opts.halfOnly,
      clothedOnly: !!opts.clothedOnly,
    }));
  }
  if (opts.sex) items.push(...await collectSummonSexItems(who));
  if (!items.length) {
    paintSummonTenths(0, 0);
    return { planned: 0, done: 0, failed: 0, skipped: true, finished: true, id: "" };
  }
  await absorbOpenQueue(who);
  const payload = await handoffSummonQueue(who, items, mode);
  rememberSummonQueue(who, payload, mode);
  const finalPayload = await watchSummonQueue(who, payload, opts);
  const total = finalPayload?.total | 0;
  const failed = finalPayload?.failed | 0;
  const finishedN = finalPayload?.done | 0;
  if (who === girl && mode !== "sacrifice") {
    try { persistRoom(); } catch { /* */ }
  }
  return {
    planned: total,
    done: Math.max(0, finishedN - failed),
    failed,
    finished: !!finalPayload?.finished,
    id: finalPayload?.id || payload.id || "",
    skipped: false,
  };
}

/** 圖已經在伺服器上。抓進手機之後才讓人出現。 */
async function cacheVisitPics(who) {
  try {
    await downloadVisitPics(who, (done, total) => {
      paintSexSetProgress(total ? `下載圖片 ${done}/${total}` : "");
    });
  } catch (err) {
    console.warn("[visit-pics]", err?.message || err);
  }
  paintSexSetProgress("");
}

/** 人離開房間：這趟下載的圖清掉。下一趟召喚再抓。 */
function dropVisitPics() {
  void clearVisitPics();
}

/** 人已經出現、清單也跑完，才收掉。沒跑完就留著，下次打開接著問。 */
function finishSummonArrival(who, mode) {
  if (!who || who !== girl) return;
  if (mode === "back" && who.world && sheIsOut()) {
    decayArousalCool(who);
    clearArousalCool(who);
    clearVisitUndress(who);
    clearShift();
    who.world.justBack = true;
    if (who.chatEnter !== "flee_back") who.chatEnter = "summon";
    who.chatLines = [];
    who.topicHint = "";
    who.sessionEnded = true;
    lines = [];
    talkFor = "";
    try { renderDebug(); } catch { /* */ }
    resetOpenness(who);
  }
  window.RoomActor?.setPresent(true);
  if (mode === "back" || mode === "arrive") {
    try { armRoomVisit(who); } catch { /* */ }
  }
  try { syncArousalOffChatTimer(); } catch { /* */ }
  try { renderCard(); } catch { /* */ }
  try { renderWorld(); } catch { /* */ }
  try { persistRoom(); } catch { /* */ }
  const status = $("summon-status");
  if (status) {
    status.textContent = mode === "back"
      ? `${who.name}被召喚回房間了。`
      : `「${who.name}」已降臨。長按她說話。`;
  }
}

/** 上次交出去的清單：跑完就讓她出現；還沒完就再把儀式打開，每 10 秒問一次。 */
async function resumeSummonQueue(who) {
  const qid = String(who?.summonQueueId || "");
  if (!qid || who !== girl) return;
  const mode = who.summonQueueMode || "arrive";
  let payload;
  try {
    payload = await fetchSummonQueue(qid);
  } catch (err) {
    if (err?.code === "missing") {
      delete who.summonQueueId;
      delete who.summonQueueMode;
      try { persistRoom(); } catch { /* */ }
    } else if (err?.code === "no-route" && $("summon-status")) {
      $("summon-status").textContent = err.message;
    }
    console.warn("[summon-queue] resume", err?.message || err);
    return;
  }
  const applied = new Set();
  applyQueueItems(who, payload, applied);
  const presentNow = !!window.RoomActor?.isPresent?.();
  if (presentNow) {
    delete who.summonArrivalPending;
    if (payload.finished) {
      try { persistRoom(); } catch { /* */ }
      await ackSummonQueue(payload.id || qid);
      return;
    }
    try {
      const finalPayload = await watchSummonQueue(who, payload, {
        mode: payload.mode || mode,
        applied,
        onProgress: (text) => { console.info("[summon-queue]", text); },
      });
      if (girl !== who || !who.summonQueueId) return;
      await ackSummonQueue(finalPayload?.id || qid);
    } catch (err) {
      console.warn("[summon-queue] resume", err?.message || err);
      if (err?.code === "missing") {
        delete who.summonQueueId;
        delete who.summonQueueMode;
        try { persistRoom(); } catch { /* */ }
      }
    }
    return;
  }
  if (!who.summonArrivalPending) {
    delete who.summonQueueId;
    delete who.summonQueueMode;
    try { persistRoom(); } catch { /* */ }
    void ackSummonQueue(qid);
    return;
  }
  if (payload.finished) {
    await cacheVisitPics(who);
    finishSummonArrival(who, payload.mode || mode);
    await ackSummonQueue(payload.id || qid);
    return;
  }
  window.RoomActor?.setPresent(false);
  try { persistRoom(); } catch { /* */ }
  const stopRitual = beginSummonRitualUI();
  paintSummonTenths(payload.done | 0, payload.total | 0);
  try {
    const finalPayload = await watchSummonQueue(who, payload, {
      mode: payload.mode || mode,
      applied,
      onProgress: (text) => { console.info("[summon-queue]", text); },
    });
    if (girl !== who) return;
    await cacheVisitPics(who);
    finishSummonArrival(who, finalPayload?.mode || mode);
    await ackSummonQueue(finalPayload?.id || qid);
  } catch (err) {
    console.warn("[summon-queue] resume", err?.message || err);
    if (err?.code === "no-route" && $("summon-status")) $("summon-status").textContent = err.message;
    if (err?.code === "missing") {
      delete who.summonQueueId;
      delete who.summonQueueMode;
      try { persistRoom(); } catch { /* */ }
    }
  } finally {
    try { stopRitual(); } catch { /* */ }
    paintSexSetProgress("");
  }
}

function sexByText(who) {
  return who.undress?.pantiesBy === "self" ? "她自己脫掉內褲" : who.undress?.pantiesBy === "help" ? "你幫她脫掉內褲" : "（沒記到誰脫的，預設）";
}

/** 做愛場面「下一步」按鈕（場面卡選項列）；最後一步就收起。 */
function renderSexNextButton(who) {
  const box = $("room-scene-choices");
  if (!box) return;
  box.replaceChildren();
  const nextStep = sexStepView ? SEX_STEP_META[sexStepView.step]?.next : "";
  if (!nextStep) {
    box.hidden = true;
    return;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.id = "sex-next-step";
  btn.dataset.step = nextStep;
  btn.textContent = `下一步：${SEX_STEP_META[nextStep].label}`;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (btn.disabled) return;
    btn.disabled = true;
    void showSexStep(who, nextStep);
  });
  box.append(btn);
  box.hidden = false;
}

/** 做愛場面顯示某一步的圖（快取或現產）；同一場用開場抽到的那組。 */
async function showSexStep(who, step = "open") {
  if (!who || undressStage(who) < 3) return;
  const pose = step === "open" || !sexStepView ? sexPoseFor(who) : sexStepView.pose;
  const c = SEX_POSES[pose];
  const meta = SEX_STEP_META[step];
  const view = undressView;
  const body = $("room-scene-body");
  const head = `${c.label.replace("開場", "")}・${meta.label}・${sexByText(who)}`;
  if (body) body.textContent = `${head}\n${meta.label}圖準備中…`;
  const packId = step === "open" ? "" : (sexStepView?.packId || "");
  const pick = await ensureSexStepUrl(who, pose, step, packId);
  lastSexPosePick = { ...pick, by: who.undress?.pantiesBy || "", at: Date.now() };
  if (view !== undressView || activeRoomScene !== "sex" || !sceneOpen() || girl !== who) return;
  sexStepView = { pose, step, packId: pick.packId || packId };
  if (pick.url) {
    paintSceneFigure(pick.url, `${who.name}的${c.label.replace("開場", "")}${meta.label}圖`);
    const tail = meta.next ? `（按「下一步」看${SEX_STEP_META[meta.next].label}）` : "（這一輪到這裡結束；按「回到房間對話」離開。）";
    if (body) body.textContent = `${head}\n${tail}`;
  } else if (body) {
    body.textContent = `${head}\n${meta.label}圖產生失敗（看 test_room 上排「${pose === "doggy" ? "後背圖" : "傳教士圖"}」的「${meta.tab}」）。`;
  }
  renderSexNextButton(who);
  // 下一張先在背景產（通常脫光時已預產）
  if (meta.next) void ensureSexStepUrl(who, pose, meta.next, sexStepView.packId);
}

/** 按「做愛」（全裸）：從開場圖開始。 */
async function showSexPoseOpening(who) {
  sexStepView = null;
  return showSexStep(who, "open");
}

/* ───────── 肏（抽插）互動：對話版做愛（2026-10-04，test_room 閘門 data-sex-poses） ─────────
 * 按「做愛」不開浮層：留在對話框、藏輸入框，主圖＝做愛步驟圖（#portrait-img），她的話打在對話框，
 * flow2（2026-10-04）：① 開場圖 → 她先說一句（看關係階／個性／體位）→「掏出陰莖」→ ② 加入 →「肏」。
 * 第一下立刻換 ③ 抽插圖；之後 1/3 在抽插圖（多組變體）之間換；射精立刻換內射圖；她高潮換高潮圖、藏「肏」到她那句打完。
 * 數值／排程在 sex_thrust.js。
 * 局部動畫沿用舊做愛系統：她的 sexAnim[pose] → 同體位幀包 → 任一幀包；第一下 1-2-3-4、之後 2-3-4。 */
const SEX_THRUST_CHAT = true;
let sexChat = null;
let thrustFramesCache = null;

function sexThrustOn() {
  return SEX_POSES_ON && SEX_THRUST_CHAT;
}

function sexChatActive() {
  return !!sexChat && activeRoomScene === "sex";
}

function sexPosePhrase(pose) {
  return pose === "doggy" ? "你趴著翹起屁股，他從後面抓著你的屁股" : "你躺著張開腿，他抓著你的大腿從正面";
}

/** 抽插期的圖（flow2：只有 ③ 抽插，加入不進池）：這組的在前，其他組產好的抽插變體也可以換；同一個檔只算一張。 */
function sexThrustPool(who = girl) {
  if (!sexChat || !who) return [];
  const pool = who.portraits?.[sexStepPacksKey(sexChat.pose, "thrust")] || {};
  const list = [String(pool[sexChat.packId] || ""), ...Object.values(pool).map((v) => String(v || ""))];
  const out = [];
  const files = new Set();
  for (const u of list) {
    if (!u || !isSexStepResultUrl(sexChat.pose, "thrust", u)) continue;
    const file = u.split("?")[0];
    if (files.has(file)) continue;
    files.add(file);
    out.push(u);
  }
  return out;
}

function paintSexChatImage() {
  const img = $("portrait-img");
  if (!img || !sexChat) return;
  const url = sexChat.img || "";
  if (!url) return;
  img.alt = `${girl?.name || ""}的做愛圖（${sexChat.imgStep || ""}）`;
  img.dataset.sexStep = sexChat.imgStep || "";
  if ((img.getAttribute("src") || "") !== url) img.src = url;
  img.hidden = false;
  if (sheetOpen()) startPortraitEntrance(img);
}

function setSexChatImage(url, step) {
  if (!sexChat || !url) return;
  sexChat.img = url;
  sexChat.imgStep = step;
  paintSexChatImage();
}

function sexHudEl() {
  let el = $("sex-hud");
  if (!el) {
    el = document.createElement("div");
    el.id = "sex-hud";
    el.className = "sex-hud";
    el.setAttribute("role", "status");
    el.innerHTML = '<div class="sx-g" data-g="passion"><b>激情</b><i><s></s></i><em></em></div>'
      + '<div class="sx-g" data-g="excite"><b>興奮</b><i><s></s></i><em></em></div>'
      + '<div class="sx-g" data-g="semen"><b>精液</b><i><s></s></i><em></em></div>'
      + '<div class="sx-g" data-g="hunger" hidden><b>飢渴</b><i><s></s></i><em></em></div>'
      + '<p class="sx-warn" hidden></p>';
    ($("portrait-sheet") || document.body).append(el);
  }
  return el;
}

/** 肏的精液＝玩家真正的精液（同一個值）：每次要用之前先同步。 */
function syncSexSemen() {
  if (!sexChat?.sess) return;
  player = ensurePlayer(player);
  syncSemen(sexChat.sess, player.semenCc);
}

function renderSexHud() {
  const el = sexHudEl();
  syncSexSemen();
  const s = sexChat?.sess;
  el.hidden = !sexChat || !s || sexChat.step === "open";
  if (el.hidden) return;
  const set = (g, pct, txt, hot = false) => {
    const row = el.querySelector(`[data-g="${g}"]`);
    if (!row) return;
    row.querySelector("s").style.width = `${Math.max(0, Math.min(100, pct))}%`;
    row.querySelector("em").textContent = txt;
    row.classList.toggle("hot", !!hot);
  };
  const lim = THRUST.PASSION_ORGASM_ABOVE;
  set("passion", (s.passion / (lim + 1)) * 100, `${s.passion}/${lim}`, s.passion >= lim - 3);
  const cumAt = exciteCumAt();
  set("excite", (s.excite / cumAt) * 100, `${s.excite}/${cumAt}`, s.excite >= cumAt * 0.8);
  set("semen", (Math.max(0, s.semen) / semenMaxCc()) * 100, `${s.semen}cc`, semenDanger(s));
  // 榨乾場：多一條她的飢渴（歸 0 才放你走）
  const m = sexChat.marathon;
  const hRow = el.querySelector('[data-g="hunger"]');
  if (hRow) hRow.hidden = !m;
  if (m) {
    const lv = Math.max(0, Math.round(Number(m.level) || 0));
    set("hunger", lv, `${lv}`, marathonLocked(m));
  }
  const warn = el.querySelector(".sx-warn");
  if (m) {
    const locked = marathonLocked(m);
    warn.hidden = false;
    warn.textContent = locked
      ? `她還沒滿足——停不下來（大概還要高潮 ${marathonOrgasmsLeft(m.level)} 次）${s.semen < THRUST.SEMEN_END_BELOW ? `・精液 ${s.semen}cc` : ""}`
      : m.finale?.blood ? `她滿足了。你射出血來了（射到 ${m.finale.semen}cc）` : "她終於滿足了。";
    return;
  }
  const danger = semenDanger(s);
  warn.hidden = !danger && !s.ended;
  warn.textContent = s.ended
    ? (sexChat.bloodShots ? `射出血精了（${s.semen}cc），這一輪結束。` : "精液見底，這一輪結束。")
    : s.semen < THRUST.SEMEN_END_BELOW
      ? `⚠ 精液已見底（${s.semen}cc）：射一次這一輪就結束`
      : isBloodShot(s.semen) ? `⚠ 精液 ${s.semen}cc：再射會射出血精，這一輪會結束`
      : danger ? `⚠ 精液 ${s.semen}cc：再射一次就見底，這一輪會結束` : "";
}

function thrustAnimEl() {
  let box = $("thrust-anim");
  if (!box) {
    box = document.createElement("div");
    box.id = "thrust-anim";
    box.className = "thrust-anim";
    box.hidden = true;
    box.setAttribute("aria-hidden", "true");
    const img = document.createElement("img");
    img.id = "thrust-anim-img";
    img.alt = "";
    box.append(img);
    ($("portrait-sheet") || document.body).append(box);
  }
  return box;
}

/** 舊做愛系統的局部動畫幀：sexAnim[pose] → 同體位幀包 → 任一幀包（兩張以上優先）。 */
async function loadThrustFrames(pose, who = girl) {
  const pick = (urls) => (Array.isArray(urls) ? urls : []).map((u) => String(u || "").trim()).filter(Boolean);
  const own = who?.sexAnim?.[pose];
  if (pick(own?.urls).length) return { urls: pick(own.urls).slice(0, 4), source: `sexAnim:${pose}` };
  if (who?.sexAnim) {
    for (const [k, rec] of Object.entries(who.sexAnim)) {
      if (pick(rec?.urls).length >= 2) return { urls: pick(rec.urls).slice(0, 4), source: `sexAnim:${k}` };
    }
  }
  const packs = await loadFramePacksCached();
  const urlsOf = (p) => [1, 2, 3, 4].map((i) => String(p?.frames?.[String(i)]?.url || "")).filter(Boolean);
  const same = packs.find((p) => p.pose === pose && urlsOf(p).length);
  if (same) return { urls: urlsOf(same), source: `幀包:${same.name || same.id}（${pose}）` };
  const any = packs.find((p) => urlsOf(p).length >= 2) || packs.find((p) => urlsOf(p).length);
  if (any) return { urls: urlsOf(any), source: `幀包:${any.name || any.id}（借 ${any.pose || "?"}）` };
  return { urls: [], source: "" };
}

function waitMs(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** 幀圖預載（每幀 ~800KB，手機第一次載很慢：沒預載時第 4 幀實際出現得比計時晚，收起來就只剩一眨眼）。 */
const thrustFramePreload = new Map();
function preloadThrustFrames(urls) {
  return Promise.all((urls || []).map((u) => {
    if (!u) return Promise.resolve();
    if (!thrustFramePreload.has(u)) {
      const im = new Image();
      const p = new Promise((resolve) => {
        im.onload = () => (im.decode ? im.decode().catch(() => {}).then(resolve) : resolve());
        im.onerror = () => resolve();
      });
      im.src = u;
      thrustFramePreload.set(u, { im, p });
    }
    return thrustFramePreload.get(u).p;
  }));
}

/** 播一輪局部動畫（第一下 1-2-3-4，之後 2-3-4）；第 4 幀一出現就算播完（「肏」回來），只留 0.4 秒（THRUST.ANIM_LINGER_MS）就收，這 0.4 秒內再按「肏」就直接接 2-3-4。 */
async function playThrustAnim() {
  if (!sexChat) return;
  const box = thrustAnimEl();
  const img = box.querySelector("img");
  if (sexChat.lingerTimer) {
    clearTimeout(sexChat.lingerTimer);
    sexChat.lingerTimer = 0;
  }
  const fr = await loadThrustFrames(sexChat.pose);
  if (!sexChat) return;
  sexChat.animSource = fr.source || "（沒有幀）";
  const { frames, holds } = animFramesFor(fr.urls, sexChat.firstRoundDone);
  sexChat.lastAnim = frames.map((u) => u.split("/").pop()).join(" ");
  if (!frames.length) {
    // 沒幀包：主圖抖一下代替
    $("portrait-img")?.classList.add("thrust-shake");
    await waitMs(420);
    $("portrait-img")?.classList.remove("thrust-shake");
    sexChat && (sexChat.firstRoundDone = true);
    return;
  }
  // 先等幀圖載好（最多 1.5 秒），每一幀的停留從真的顯示出來才開始算
  await Promise.race([preloadThrustFrames(frames), waitMs(THRUST.ANIM_PRELOAD_MAX_MS)]);
  if (!sexChat) return;
  box.hidden = false;
  box.setAttribute("aria-hidden", "false");
  box.classList.add("on");
  for (let i = 0; i < frames.length; i++) {
    if (!sexChat) return;
    await new Promise((resolve) => {
      let fired = false;
      const done = () => { if (!fired) { fired = true; resolve(); } };
      img.onload = done;
      img.onerror = done;
      img.src = frames[i];
      if (img.complete && img.naturalWidth) queueMicrotask(done);
      setTimeout(done, THRUST.ANIM_PRELOAD_MAX_MS);
    });
    img.onload = null;
    img.onerror = null;
    // 最後一幀不另外停：一出現就算播完（「肏」回來），0.4 秒後收；這 0.4 秒內再按就接下一輪
    if (i < frames.length - 1) await waitMs(holds[i] || 180);
  }
  if (!sexChat) return;
  sexChat.firstRoundDone = true;
  sexChat.lingerAt = Date.now();
  sexChat.lingerTimer = setTimeout(() => {
    if (!sexChat) return;
    sexChat.lingerTimer = 0;
    // 0.4 秒內又按了（下一輪已經在播）→ 不收
    if (sexChat.animBusy) return;
    box.classList.remove("on");
    box.hidden = true;
    box.setAttribute("aria-hidden", "true");
    sexChat.lastAnimHideMs = Date.now() - sexChat.lingerAt;
  }, THRUST.ANIM_LINGER_MS);
}

function hideThrustAnim() {
  const box = $("thrust-anim");
  if (!box) return;
  box.classList.remove("on");
  box.hidden = true;
  box.setAttribute("aria-hidden", "true");
  box.querySelector("img")?.removeAttribute("src");
}

/** 逐字貼她的話：呻吟字快、一般字慢。被別的打字取代就停。 */
async function typeThrustLine(name, text) {
  const job = ++typeJob;
  const full = cleanLine(text) || "……";
  const box = $("portrait-meta");
  if ($("portrait-name")) $("portrait-name").textContent = name;
  setTyping(false);
  if (!box) return;
  box.textContent = "";
  const chars = Array.from(full);
  for (let i = 1; i <= chars.length; i++) {
    if (job !== typeJob || !sexChat) return;
    box.textContent = chars.slice(0, i).join("");
    await waitMs(typeDelayFor(chars[i - 1]));
  }
}

function sexChatNarrate(text) {
  typeJob += 1;
  if ($("portrait-name")) $("portrait-name").textContent = "旁白";
  if ($("portrait-meta")) $("portrait-meta").textContent = text;
  setTyping(false);
}

/** 她這一下要說的話（事實＋要求）；照一般對話的系統 prompt（個性／關係階／稱呼規則，老公只有妻子以上）。 */
function thrustFact() {
  const s = sexChat.sess;
  const news = sexChat.news.splice(0);
  const bits = [`${sexPosePhrase(sexChat.pose)}，正一下一下肏著你（第 ${s.thrusts} 下），陰莖在你裡面進進出出。`];
  if (news.includes("orgasm")) bits.push(THRUST.SQUIRT_IN_FLOW ? "你正在高潮，潮吹、全身痙攣。" : "你正在高潮，全身痙攣、裡面一陣陣夾緊他。");
  if (news.includes("bloodcum")) bits.push("他剛剛射在你裡面，可是射出來的是混著血的粉紅色精液（血精，他射過頭了），你嚇了一跳、很擔心他，但身體還在被肏的餘韻裡。");
  else if (news.includes("cum")) bits.push("他剛剛射在你裡面，很燙。");
  if (!news.includes("orgasm") && s.passion >= THRUST.PASSION_ORGASM_ABOVE - 4) bits.push("你快要高潮了。");
  // 榨乾場：貪得無厭的妻子
  const m = sexChat.marathon;
  if (m) {
    if (news.includes("sated")) bits.push("你終於被餵飽了：整個人軟掉、滿足地喘著，黏在他身上撒嬌。");
    else {
      bits.push("你是飢渴到極點的妻子，怎麼要都不夠：不准他停、不准他拔出來，一直討要更多。");
      if (news.includes("orgasm")) bits.push("可是高潮了還不夠，你還要。");
      if (s.semen < THRUST.SEMEN_END_BELOW) bits.push("他已經被你榨到快虛脫了，你還是不放過他。");
    }
  }
  return { text: bits.join(""), event: news.includes("orgasm") ? "orgasm" : news.includes("bloodcum") ? "bloodcum" : news.includes("cum") ? "cum" : "" };
}

async function requestThrustReply(seq) {
  if (!sexChat || !girl) return "";
  const fact = thrustFact();
  sexChat.aiState = `等 AI（第 ${seq} 下）`;
  renderThrustDebug();
  let reply = "";
  try {
    reply = await withTimeout(askGirl(`（旁白：${fact.text}只寫你此刻心裡想說出口的一句話，二十字以內；不要自己寫呻吟或喘息（聲音另外配上），不要旁白、不要描述動作、不要引號。）`), THRUST.REPLY_TIMEOUT_MS, "");
  } catch (err) {
    console.warn("[thrust reply]", err?.message || err);
  }
  if (!sexChat || !girl) return "";
  let clean = scrubHusband(String(reply || "").replace(/\s+/g, " ").trim(), girl.stage || "stranger");
  sexChat.aiState = clean ? `AI 回來（第 ${seq} 下）` : `AI 失敗→本地（第 ${seq} 下）`;
  if (!clean) clean = fallbackMoan(fact.event);
  lines.push({ role: "user", content: "（他肏你。）" });
  lines.push({ role: "assistant", content: clean });
  if (inAfterglow(girl) && !inSpasm(girl)) consumeAfterglowReply(girl);
  if (!inSpasm(girl)) consumeEjacTalk(girl);
  tickStunAfterReply(girl);
  noteTalkExchange(girl);
  rememberChat();
  return presentUndressReply(clean, { inSex: true, climaxNow: fact.event === "orgasm" });
}

function newThrustPump() {
  return new ThrustReplyPump({
    now: () => Date.now(),
    placeholder: () => {
      if (!sexChat || !girl) return;
      typeJob += 1;
      if ($("portrait-name")) $("portrait-name").textContent = girl.name || "她";
      if ($("portrait-meta")) $("portrait-meta").textContent = pantPlaceholder();
      setTyping(true);
    },
    request: (seq) => requestThrustReply(seq),
    type: async (text) => {
      if (!sexChat || !girl) return;
      sexChat.typing = true;
      try {
        await typeThrustLine(girl.name || "她", text);
        sexChat && (sexChat.lastReply = String(text || ""));
      } finally {
        if (sexChat) sexChat.typing = false;
      }
    },
    onDone: (seq) => {
      if (!sexChat) return;
      sexChat.aiState = "閒";
      persistRoom();
      if (sexChat.orgasmLock && sexChat.orgasmLock.seq === seq) {
        // 高潮那句打完：停滿高潮圖時間就放回「肏」
        sexChat.orgasmLock.lineDone = true;
        maybeReleaseOrgasmLock();
        return;
      }
      flushThrustDeferred("reply");
      if (sexChat?.finishAfterReply && !sexChat.pump.busy && !sexChat.pump.pendingSeq) finishSexChatRound();
    },
  });
}

/** 她那句打完（或等太久）：判高潮、做這幾下累積的換圖。 */
function flushThrustDeferred(why = "") {
  if (!sexChat) return;
  if (sexChat.deferTimer) {
    clearTimeout(sexChat.deferTimer);
    sexChat.deferTimer = 0;
  }
  const s = sexChat.sess;
  const o = checkOrgasm(s);
  if (o) {
    bumpAffection(o.affection, `她高潮（第 ${o.count} 次）`);
    noteAfterglow(girl, "hers");
    if (marathonLocked(sexChat.marathon)) {
      // 榨乾場：每次高潮 −MARATHON_ORGASM_DROP；歸 0 才結束（這一輪在她那句打完、高潮圖停滿後收）
      const mr = marathonOrgasm(girl, sexChat.marathon, { stageKey: girl.stage || "stranger" });
      if (mr) pushDebug(`榨乾場：飢渴 ${Math.round(mr.before)}→${Math.round(mr.after)}（她高潮 ${sexChat.marathon.orgasms}）${mr.done ? "，滿足了" : `，還要約 ${mr.left} 次`}`);
      if (mr?.done) {
        s.ended = true;
        sexChat.news.push("sated");
      }
    } else hungerRelief("orgasm");
    organDevOrgasm();
    sexChat.news.push("orgasm");
    lines.push({ role: "user", content: THRUST.SQUIRT_IN_FLOW ? "（她高潮了，潮吹、全身痙攣。）" : "（她高潮了，全身痙攣。）" });
    showClimaxTip(o.count > 1 ? `她又高潮了！（${o.count}）` : "她高潮了！");
    pushDebug(`肏：激情 ${o.before}→${o.after}（高潮 ${o.count}）`);
    startOrgasmLock(o);
  } else if (sexChat.pendingSwitch) {
    const pool = sexThrustPool();
    const next = pickOtherImage(pool, sexChat.thrustImg);
    if (next && next !== sexChat.thrustImg) {
      sexChat.thrustImg = next;
      sexChat.switches += 1;
      if (!sexChat.eventHold) setSexChatImage(next, "thrust");
    }
    sexChat.pendingSwitch = false;
  }
  sexChat.lastFlush = why;
  renderSexHud();
  renderThrustDebug();
  persistRoom();
}

/** 開場那句：① 開場圖出來後她先開口（關係階態度＋個性口吻＋體位；AI 失敗／逾時用本地台詞）。 */
async function requestSexOpening(who, pose) {
  const stage = who.stage || "stranger";
  let directive = openingDirective({ stage, pose, personality: basePersonality(who), dazed: sexDazeKind(who) });
  // 榨乾場：今天要做到她滿足為止
  if (sexChat?.marathon) directive += "\n（你已經飢渴到極點：今天要做到你被餵飽為止，不准他停。說得急切、貪婪。）";
  let reply = "";
  try {
    reply = await withTimeout(askGirl(directive), THRUST.OPENING_TIMEOUT_MS, "");
  } catch (err) {
    console.warn("[sex opening]", err?.message || err);
  }
  let clean = scrubHusband(String(reply || "").replace(/\s+/g, " ").replace(/^[「『"]+|[」』"]+$/g, "").trim(), stage);
  const source = clean ? "AI" : "本地";
  if (!clean) clean = openingFallback(stage, pose);
  return { text: clean, source, band: openingBand(stage) };
}

/** 失神種類：痙攣 spasm／失神 stun／清醒 ""。 */
function sexDazeKind(who) {
  if (!who) return "";
  ensureStunFields(who);
  if (inSpasm(who)) return "spasm";
  return stunTier(effectiveStun(who, "")) === "stun" ? "stun" : "";
}

/** 開場那句的呈現：失神／痙攣 → 大部分拆碎成呻吟（同其他失神台詞）＋最後一小段聽得懂；清醒照原句。 */
function presentSexOpening(text) {
  if (girl && undressDazed(girl)) return stunMixLine(text, weaveStunReply);
  return String(text || "").trim() || "……";
}

async function runSexOpening(who, view, linePromise) {
  if (!sexChat || girl !== who) return;
  sexChat.opening = "pending";
  typeJob += 1;
  if ($("portrait-name")) $("portrait-name").textContent = who.name || "她";
  if ($("portrait-meta")) $("portrait-meta").textContent = "……";
  setTyping(true);
  renderSexChatBar();
  const r = await linePromise;
  if (!sexChat || view !== undressView || girl !== who) return;
  const line = presentSexOpening(r.text);
  sexChat.openingIntended = r.text;
  sexChat.openingDazed = sexDazeKind(who);
  sexChat.openingLine = line;
  sexChat.openingSource = r.source;
  sexChat.openingBand = r.band;
  pushDebug(`肏：開場（${OPENING_BAND_ZH[r.band] || r.band}・${basePersonality(who)}・${r.source}）${line}`);
  lines.push({ role: "user", content: `（你們要做愛了，${sexChat.pose === "doggy" ? "她趴著翹起屁股" : "她躺著張開腿"}。）` });
  // 對話紀錄記她想說的那句（同其他失神台詞）
  lines.push({ role: "assistant", content: r.text });
  rememberChat();
  sexChat.typing = true;
  try {
    await typeThrustLine(who.name || "她", line);
  } finally {
    if (sexChat) sexChat.typing = false;
  }
  if (!sexChat || view !== undressView || girl !== who) return;
  sexChat.lastReply = line;
  sexChat.opening = "done";
  renderSexChatBar();
  renderThrustDebug();
  persistRoom();
}

/** 她高潮：換高潮圖、藏「肏」；她那句打完＋停滿 EVENT_HOLD_MS 才放回來。 */
function startOrgasmLock(o) {
  if (!sexChat) return;
  const seq = ++sexChat.seq;
  const now = Date.now();
  sexChat.orgasmLock = { seq, until: now + THRUST.EVENT_HOLD_MS, lineDone: false, timer: 0, safety: 0, count: o.count };
  sexChat.eventHold = true;
  sexChat.pendingSwitch = false;
  const steps = orgasmEventSteps();
  void (async () => {
    for (let i = 0; i < steps.length; i++) {
      const r = await ensureSexStepUrl(girl, sexChat?.pose, steps[i], sexChat?.packId || "");
      if (!sexChat || sexChat.orgasmLock?.seq !== seq) return;
      if (r?.url) setSexChatImage(r.url, steps[i]);
      sexChat.eventsShown.push(steps[i]);
      renderThrustDebug();
      if (i < steps.length - 1) await waitMs(THRUST.EVENT_HOLD_MS);
    }
  })();
  sexChat.orgasmLock.safety = setTimeout(() => releaseOrgasmLock(seq, true), THRUST.ORGASM_LOCK_MAX_MS);
  syncThrustButton();
  // 她高潮那句一定要說（排掉舊的）
  sexChat.pump.urgent(seq);
}

function maybeReleaseOrgasmLock() {
  const lk = sexChat?.orgasmLock;
  if (!lk || !lk.lineDone) return;
  const left = lk.until - Date.now();
  if (left > 0) {
    if (!lk.timer) lk.timer = setTimeout(() => { if (sexChat?.orgasmLock === lk) { lk.timer = 0; maybeReleaseOrgasmLock(); } }, left + 10);
    return;
  }
  releaseOrgasmLock(lk.seq);
}

function releaseOrgasmLock(seq, forced = false) {
  const lk = sexChat?.orgasmLock;
  if (!lk || lk.seq !== seq) return;
  if (lk.timer) clearTimeout(lk.timer);
  if (lk.safety) clearTimeout(lk.safety);
  sexChat.orgasmLock = null;
  if (forced) pushDebug("肏：高潮那句等太久，先放回「肏」");
  // 這一下讓這一輪結束（榨乾場她滿足了）→ 收尾
  if (sexChat.sess.ended) finishSexChatRound();
  renderSexChatBar();
  renderThrustDebug();
}

function thrustBtnHidden() {
  return !!(sexChat && (sexChat.animBusy || sexChat.orgasmLock));
}

function renderSexChatBar() {
  const row = $("talk-acts");
  if (!row || !sexChat) return;
  row.hidden = !sheetOpen() || !girl;
  row.classList.add("undress-bar", "sex-bar");
  for (const btn of [...row.querySelectorAll("button")]) btn.remove();
  const add = (id, label, onClick, extra = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.undress = id;
    btn.dataset.sex = id;
    if (extra.id) btn.id = extra.id;
    btn.textContent = label;
    btn.disabled = !!extra.disabled;
    if (extra.hidden) btn.hidden = true;
    if (extra.title) btn.title = extra.title;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled || btn.hidden) return;
      onClick();
    });
    row.append(btn);
    return btn;
  };
  if (sexChat.step === "open") {
    // 沒有「下一步」：她開場那句打完才出「掏出陰莖」
    if (sexChat.opening === "done" && !sexChat.busy) add("draw", "掏出陰莖", () => void sexChatToJoin(), { id: "sex-draw" });
  } else if (!sexChat.sess.ended) {
    // 動畫播放中／她高潮中藏「肏」（保留位置不跳版）
    const hide = thrustBtnHidden();
    const b = add("thrust", "肏", () => doThrust(), { id: "sex-thrust", disabled: hide });
    b.style.visibility = hide ? "hidden" : "";
    b.setAttribute("aria-hidden", hide ? "true" : "false");
  }
  // 榨乾場：她滿足（飢渴歸 0）之前沒有「回到對話」
  if (!sexMarathonLocked()) add("back", "回到對話", () => closeRoomScene(), { title: "離開做愛，回到一般對話" });
}

function syncThrustButton() {
  const b = $("sex-thrust");
  if (!b || !sexChat) return;
  const hide = thrustBtnHidden();
  b.disabled = hide;
  b.style.visibility = hide ? "hidden" : "";
  b.setAttribute("aria-hidden", hide ? "true" : "false");
}

/** 開場（只有她）→ 下一步加入。 */
async function openSexChat(who) {
  if (!who || undressStage(who) < 3 || !sheetOpen()) return;
  if (sexStartBlocked()) return;
  const pose = sexPoseFor(who);
  // 妻子飢渴頂點 → 榨乾場（停不下來，做到她飢渴歸 0）
  const marathon = sexPeakNow(who) ? startMarathon(who, { stageKey: who.stage || "stranger" }) : null;
  activeRoomScene = "sex";
  undressView += 1;
  talkBusy = true;
  clearActionFlash();
  const o = ensureBody(who)?.organs;
  sexChat = {
    marathon,
    pose,
    packId: "",
    step: "open",
    // 精液＝玩家真正剩下的（不是每場 18cc）
    sess: newThrustSession({ semenCc: ensurePlayer(player).semenCc, marathon: !!marathon }),
    img: "",
    imgStep: "",
    thrustImg: "",
    seq: 0,
    animBusy: false,
    firstRoundDone: false,
    busy: true,
    news: [],
    eventHold: false,
    orgasmLock: null,
    opening: "",
    openingLine: "",
    openingSource: "",
    openingBand: "",
    eventsShown: [],
    pendingSwitch: false,
    deferTimer: 0,
    lingerTimer: 0,
    switches: 0,
    debtNoted: false,
    aiState: "閒",
    lastReply: "",
    lastAnim: "",
    animSource: "",
    lastFlush: "",
    typing: false,
    prevStuffed: String(o?.vagina?.stuffed || ""),
    prev: { name: $("portrait-name")?.textContent || "", meta: $("portrait-meta")?.textContent || "" },
    pump: null,
  };
  sexChat.pump = newThrustPump();
  if (marathon) {
    pushDebug(`榨乾場開始：飢渴 ${Math.round(marathon.startLevel)}（≥${PEAK_AT}），要做到歸 0；精液 ${sexChat.sess.semen}cc`);
    showBodyWarn("她不會讓你停下來的", "飢渴到頂點：做到她滿足為止");
  } else
  // 精液 <6：一進來就跳「身體快不行了」
  warnIfSemenLow();
  const view = undressView;
  $("portrait-sheet")?.classList.add("undress-chat", "sex-chat");
  setTalkEnabled(false);
  const c = SEX_POSES[pose];
  sexChatNarrate(`（${c.label.replace("開場", "")}・開場・${sexByText(who)}。開場圖準備中…）`);
  renderSexHud();
  renderSexChatBar();
  // 局部動畫幀先預載（第一下肏就不卡）
  void loadThrustFrames(pose, who).then((fr) => preloadThrustFrames(fr.urls)).catch(() => {});
  // 她的開場那句跟圖一起開始要（圖出來後才打字）
  const linePromise = requestSexOpening(who, pose);
  const pick = await ensureSexStepUrl(who, pose, "open");
  lastSexPosePick = { ...pick, by: who.undress?.pantiesBy || "", at: Date.now() };
  if (!sexChat || view !== undressView || girl !== who) return;
  sexChat.packId = pick.packId || "";
  sexChat.busy = false;
  if (pick.url) setSexChatImage(pick.url, "open");
  else pushDebug(`肏：開場圖產生失敗（看上排「${pose === "doggy" ? "後背圖" : "傳教士圖"}」）`);
  renderThrustDebug();
  void runSexOpening(who, view, linePromise);
  // 加入／抽插先在背景產（通常脫光時已預產）
  void ensureSexStepUrl(who, pose, "join", sexChat.packId).then(() => sexChat && ensureSexStepUrl(who, pose, "thrust", sexChat.packId));
}

async function sexChatToJoin() {
  if (!sexChat || sexChat.step !== "open" || !girl) return;
  const who = girl;
  sexChat.busy = true;
  renderSexChatBar();
  const view = undressView;
  const pick = await ensureSexStepUrl(who, sexChat.pose, "join", sexChat.packId);
  if (!sexChat || view !== undressView || girl !== who) return;
  sexChat.packId = sexChat.packId || pick.packId || "";
  sexChat.step = "join";
  sexChat.busy = false;
  if (pick.url) {
    setSexChatImage(pick.url, "join");
    sexChat.thrustImg = pick.url;
  }
  // 塞著陰莖：她的對話 prompt 會寫「陰道內物體：陰莖」；離開時還原
  const o = ensureBody(who)?.organs;
  if (o?.vagina) o.vagina.stuffed = "penis";
  syncSexSemen();
  const dry = sexChat.marathon
    ? "她飢渴到頂點——不做到她滿足，這一輪停不下來。"
    : sexChat.sess.semen < THRUST.SEMEN_END_BELOW ? `精液已見底（${sexChat.sess.semen}cc），射一次這一輪就結束。` : "";
  if (isBloodShot(sexChat.sess.semen)) prepBloodcum(who);
  const where = sexChat.pose === "doggy" ? "抵在她翹起的屁股中間" : "抵在她張開的腿間";
  sexChatNarrate(`（你掏出陰莖，${where}。按「肏」開始。${dry}）`);
  renderSexHud();
  renderSexChatBar();
  renderThrustDebug();
  // 抽插 → 高潮 →（潮吹旗開才產）→ 內射 依序在背景產（同一組）
  void (async () => {
    for (const st of flowPregenSteps()) {
      if (!sexChat || girl !== who) return;
      await ensureSexStepUrl(who, sexChat.pose, st, sexChat.packId);
    }
  })();
}

/** 按一下「肏」。 */
function doThrust() {
  if (!sexChat || !girl || sexChat.step === "open" || sexChat.animBusy || sexChat.orgasmLock || sexChat.sess.ended) return null;
  const who = girl;
  const s = sexChat.sess;
  const seq = ++sexChat.seq;
  syncSexSemen();
  const r = applyThrust(s, { arousal: Number(who.bodyState?.arousal) || 0, stage: who.stage || "stranger" });
  if (!r) return null;
  organDevThrust(s);
  bumpAffection(r.affection, "肏");
  // 事後算帳：失神／痙攣中被肏 → 第一下記一筆（正常清醒會漲的量），之後只記次數
  if (STUN_RECKONING_ON && undressDazed(who)) {
    if (!sexChat.debtNoted) {
      sexChat.debtNoted = true;
      const normal = normalInvasionFor("cervix_rub", { stage: who.stage || "stranger", personality: basePersonality(who), stats: who.stats || null });
      noteStunDebt(normal, "肏她");
    } else {
      addStunDebt(who, 0, "肏她");
    }
  }
  // 上一張事件圖（高潮／內射）留到這一下；這一下回抽插圖
  const firstThrust = sexChat.step === "join";
  if (firstThrust) sexChat.step = "thrust";
  if (sexChat.eventHold) {
    sexChat.eventHold = false;
    if (sexChat.thrustImg) setSexChatImage(sexChat.thrustImg, "thrust");
  }
  if (firstThrust) {
    // 第一下立刻換 ③ 抽插圖（這組的優先）
    const tUrl = sexThrustPool()[0] || "";
    if (tUrl) {
      sexChat.thrustImg = tUrl;
      setSexChatImage(tUrl, "thrust");
    } else {
      // 抽插圖還沒好：先留加入圖，好了再換
      void ensureSexStepUrl(who, sexChat.pose, "thrust", sexChat.packId).then((p) => {
        if (!sexChat || !p?.url) return;
        sexChat.thrustImg = p.url;
        if (sexChat.imgStep === "join" && !sexChat.eventHold) setSexChatImage(p.url, "thrust");
      });
    }
  } else if (r.switchRoll) {
    sexChat.pendingSwitch = true;
  }
  if (r.ejac) {
    // 扣玩家真正的精液（可到負）；這一場的數字跟著它
    // 掉到 −7 以下＝腎虧：自動送醫、精液量回到 −1（settleKidney）
    // 榨乾場：腎虧等她滿足才結算（finishSexChatRound → marathonFinale），這裡只扣
    if (s.marathon) player = spendSemen(player, THRUST.SEMEN_PER_EJAC_CC).player;
    else spendPlayerSemen(THRUST.SEMEN_PER_EJAC_CC, "sex");
    s.semen = player.semenCc;
    // 射完還 <6：「身體快不行了」（每射一次最多一張）
    if (!s.marathon) warnIfSemenLow();
    if (s.semen < THRUST.SEMEN_END_BELOW && !s.marathon) s.ended = true;
    const o = ensureBody(who)?.organs;
    if (o?.uterus) o.uterus.semen = Math.min(3, (Number(o.uterus.semen) || 0) + 1);
    noteAfterglow(who, "his", { ejac: "creampie" });
    // 榨乾場：內射不降（她要的是高潮）
    if (!s.marathon) hungerRelief("creampie");
    sexChat.news.push(r.blood ? "bloodcum" : "cum");
    if (r.blood) sexChat.bloodShots = (sexChat.bloodShots || 0) + 1;
    // 射精 → 立刻換 ⑥ 內射圖（留到下一下肏）；血精 → ⑦ 血精圖（快取有就直接用，沒有先用內射圖、產好再換）
    sexChat.eventHold = true;
    sexChat.pendingSwitch = false;
    const ejacSeq = seq;
    sexChat.ejacSeq = ejacSeq;
    const showEvent = (p, st) => {
      if (!sexChat || !p?.url || !sexChat.eventHold || sexChat.orgasmLock || sexChat.ejacSeq !== ejacSeq) return false;
      setSexChatImage(p.url, st);
      sexChat.eventsShown.push(st);
      renderThrustDebug();
      return true;
    };
    if (r.blood) {
      const bloodJob = ensureSexStepUrl(who, sexChat.pose, "bloodcum", sexChat.packId);
      void Promise.race([bloodJob, waitMs(300).then(() => null)]).then(async (quick) => {
        if (quick?.url && showEvent(quick, "bloodcum")) return;
        showEvent(await ensureSexStepUrl(who, sexChat?.pose, "cum", sexChat?.packId || ""), "cum");
        const late = await bloodJob;
        if (sexChat?.imgStep === "cum") showEvent(late, "bloodcum");
      });
      showClimaxTip("射出血精了……");
    } else {
      void ensureSexStepUrl(who, sexChat.pose, "cum", sexChat.packId).then((p) => showEvent(p, "cum"));
    }
    lines.push({ role: "user", content: r.blood
      ? `（你射在她裡面了——可是精液不夠，射出來的是混著血的粉紅色血精。精液剩 ${s.semen} cc。）`
      : `（你射在她裡面了——精液剩 ${s.semen} cc。）` });
    pushDebug(`肏：${r.blood ? "血精" : "射精"}（第 ${s.ejacs} 次）精液 ${r.semenBefore}→${s.semen}cc${s.ended ? "，見底結束" : ""}`);
  }
  // 下一射會是血精 → 背景先產血精圖（同一組；只要一次）
  if (!s.ended && isBloodShot(s.semen)) prepBloodcum(who);
  renderSexHud();
  renderThrustDebug();
  // 動畫（藏肏）→ 播完再顯；射精事件圖在動畫後
  sexChat.animBusy = true;
  syncThrustButton();
  void (async () => {
    try {
      await playThrustAnim();
    } catch (err) {
      console.warn("[thrust anim]", err?.message || err);
    } finally {
      if (sexChat) {
        sexChat.animBusy = false;
        if (r.ejac && !r.blood) showClimaxTip(s.ended ? "射在裡面了……（見底）" : "射在裡面了！");
        if (sexChat.sess.ended) finishSexChatRound();
        renderSexChatBar();
      }
    }
  })();
  // 她的話：跟動畫脫鉤；換圖／高潮等她那句打完（最多等 DEFER_MAX_MS）
  if (!sexChat.deferTimer) sexChat.deferTimer = setTimeout(() => sexChat && flushThrustDeferred("timeout"), THRUST.DEFER_MAX_MS);
  // 這一射結束這一輪（例如血精）→ 她對這一射的反應一定要說完（不被 0.8 秒規則丟掉），說完才出結束旁白
  if (s.ended) sexChat.pump.urgent(seq);
  else sexChat.pump.press(seq);
  persistRoom();
  return r;
}

function prepBloodcum(who = girl) {
  if (!sexChat || sexChat.bloodPrepped || !who) return;
  sexChat.bloodPrepped = true;
  void ensureSexStepUrl(who, sexChat.pose, "bloodcum", sexChat.packId);
}

/** 這一輪結束：她對最後一射的那句先說完（最多等到那句打完），停一下再出結束旁白。 */
function finishSexChatRound() {
  if (!sexChat || sexChat.finished) return;
  const pump = sexChat.pump;
  if (pump && (pump.busy || pump.pendingSeq)) {
    sexChat.finishAfterReply = true;
    renderSexHud();
    renderSexChatBar();
    return;
  }
  sexChat.finished = true;
  sexChat.finishAfterReply = false;
  pump?.close();
  const s = sexChat.sess;
  if (sexChat.marathon) {
    finishMarathon();
    renderSexHud();
    renderSexChatBar();
    return;
  }
  const text = sexChat.bloodShots
    ? `（你連血都射出來了——混著血的粉紅色精液從她裡面流出來。這一場射了 ${s.ejacs} 次，她高潮 ${s.orgasms} 次。精液 ${s.semen}cc：負的時候每 5 小時才補 1cc。這一輪結束；按「回到對話」。）`
    : `（你射乾了——這一場射了 ${s.ejacs} 次，她高潮 ${s.orgasms} 次。這一輪結束；按「回到對話」。）`;
  const delay = sexChat.lastReply ? 1500 : 0;
  const sc = sexChat;
  setTimeout(() => {
    if (sexChat !== sc) return;
    sexChatNarrate(text);
  }, delay);
  renderSexHud();
  renderSexChatBar();
}

/**
 * 榨乾場收尾（她飢渴歸 0）：精液 < −7 → 射血（⑦ 血精圖，沒有就旁白）＋腎虧送醫（只結算一次）；否則一般餘韻。
 */
function finishMarathon() {
  const sc = sexChat;
  if (!sc?.marathon) return;
  const s = sc.sess;
  player = ensurePlayer(player);
  const fin = marathonFinale(sc.marathon, player.semenCc);
  const tally = `這一場射了 ${s.ejacs} 次，她高潮 ${s.orgasms} 次`;
  let text = "";
  if (fin.blood) {
    // 射血那一下
    void ensureSexStepUrl(girl, sc.pose, "bloodcum", sc.packId).then((p) => {
      if (sexChat === sc && p?.url) setSexChatImage(p.url, "bloodcum");
    });
    showClimaxTip("射血了……");
    const bill = fin.first ? settleKidney("marathon") : null;
    s.semen = player.semenCc;
    text = `（她終於滿足了，軟軟地癱在你身上……你最後射出來的全是血，眼前一黑——腎虧，被送去看醫生${bill ? `，花了 ${bill.fee} 金` : ""}。${tally}。精液回到 ${player.semenCc}cc。按「回到對話」。）`;
    if (bill) showBodyWarn("腎虧，送醫", `醫藥費 ${bill.fee} 金・精液回到 ${player.semenCc}cc`);
    pushDebug(`榨乾場結束：射血＋腎虧${bill ? `（${bill.fee} 金）` : "（已結算過）"}`);
  } else {
    text = `（她終於滿足了，滿足地窩在你懷裡喘著。${tally}。精液 ${s.semen}cc。按「回到對話」。）`;
    pushDebug(`榨乾場結束：她滿足了，精液 ${s.semen}cc（沒到腎虧）`);
  }
  persistRoom();
  const delay = sc.lastReply ? 1500 : 0;
  setTimeout(() => {
    if (sexChat !== sc) return;
    sexChatNarrate(text);
  }, delay);
}

/** 收掉對話版做愛（回到對話／關對話框都會走這裡）。 */
function closeSexChat() {
  if (!sexChat) return;
  const sc = sexChat;
  sexChat = null;
  // 榨乾場被系統中斷（她被叫走等）：精液該結算的照樣結算（腎虧一次）
  if (sc.marathon && !sc.marathon.finale) {
    const fin = marathonFinale(sc.marathon, ensurePlayer(player).semenCc);
    if (fin?.first && fin.kidney) settleKidney("marathon-cut");
  }
  sc.pump?.close();
  if (sc.deferTimer) clearTimeout(sc.deferTimer);
  if (sc.lingerTimer) clearTimeout(sc.lingerTimer);
  if (sc.orgasmLock?.timer) clearTimeout(sc.orgasmLock.timer);
  if (sc.orgasmLock?.safety) clearTimeout(sc.orgasmLock.safety);
  hideThrustAnim();
  const hud = $("sex-hud");
  if (hud) hud.hidden = true;
  $("portrait-img")?.classList.remove("thrust-shake");
  if ($("portrait-img")) delete $("portrait-img").dataset.sexStep;
  if (girl) {
    const o = ensureBody(girl)?.organs;
    if (o?.vagina && o.vagina.stuffed === "penis") o.vagina.stuffed = sc.prevStuffed === "penis" ? "" : sc.prevStuffed;
  }
  typeJob += 1;
  setTyping(false);
  if (sc.lastReply && girl) {
    if ($("portrait-name")) $("portrait-name").textContent = girl.name || "";
    if ($("portrait-meta")) $("portrait-meta").textContent = sc.lastReply;
  } else if (sc.prev) {
    if ($("portrait-name")) $("portrait-name").textContent = sc.prev.name;
    if ($("portrait-meta")) $("portrait-meta").textContent = sc.prev.meta;
  }
  $("portrait-sheet")?.classList.remove("undress-chat", "sex-chat");
  $("talk-acts")?.classList.remove("undress-bar", "sex-bar");
  talkBusy = false;
  persistRoom();
  try { paintHalfPortrait(girl); } catch { /* ignore */ }
}

/** test_room 除錯：肏一行。 */
function renderThrustDebug() {
  const el = $("dbg-thrust");
  if (!el) return;
  if (!sexChat) {
    el.textContent = sexThrustOn() ? "（沒在做）" : "—";
    return;
  }
  const s = sexChat.sess;
  el.textContent = `${sexChat.pose}・${sexChat.step}・圖 ${sexChat.imgStep || "—"}｜第 ${s.thrusts} 下・激情 ${s.passion}・興奮 ${s.excite}・精液 ${s.semen}cc・高潮 ${s.orgasms}・射 ${s.ejacs}${s.ended ? "・結束" : ""}｜換圖 ${sexChat.switches}${sexChat.pendingSwitch ? "（待）" : ""}・AI ${sexChat.aiState}${sexChat.pump?.dropped ? `・丟 ${sexChat.pump.dropped}` : ""}｜動畫 ${sexChat.animSource || "—"}`;
}

function openRoomScene(kind) {
  const stub = ROOM_SCENE_STUBS[kind];
  const overlay = $("room-scene-overlay");
  if (!stub || !overlay || !girl) return;
  // 做愛只在脫光後出現，不看失神。場面本體還沒做。
  if (kind === "sex") {
    if (undressStage(girl) < 3) return;
    // 2026-10-08：精液 0 或負的不能開始做愛（這一輪裡面照舊）
    if (sexStartBlocked()) return;
    // 肏互動（test_room）：對話版，不開浮層
    if (sexThrustOn()) {
      void openSexChat(girl);
      return;
    }
  } else if (!highStunSceneUnlocked(girl)) return;
  activeRoomScene = kind;
  const title = $("room-scene-title");
  const body = $("room-scene-body");
  if (title) title.textContent = stub.title;
  clearSceneFigure();
  undressView += 1;
  activeUndressShot = "";
  if (kind === "undress") {
    hideSceneChoices();
    if (body) body.textContent = stub.body;
    void openUndressChoices(girl);
  } else {
    hideSceneChoices();
    if (body) body.textContent = stub.body;
    if (kind === "sex" && SEX_POSES_ON) void showSexPoseOpening(girl);
  }
  overlay.hidden = false;
  // 蓋住互動列，但不關 portrait-sheet，以免 wipe chat／affection／body
  const acts = $("talk-acts");
  if (acts) acts.hidden = true;
}

function closeRoomScene() {
  const overlay = $("room-scene-overlay");
  if (overlay) overlay.hidden = true;
  const wasPlay = activeRoomScene === "undress-play";
  const wasSexChat = !!sexChat;
  activeRoomScene = "";
  if (wasSexChat) closeSexChat();
  activeUndressShot = "";
  undressPlay = null;
  undressView += 1;
  sceneCard()?.classList.remove("undress-play");
  hideSceneChoices();
  clearSceneFigure();
  if (undressChatMode) {
    undressChatMode = false;
    typeJob += 1;
    setTyping(false);
    if (undressChatPrev) {
      if ($("portrait-name")) $("portrait-name").textContent = undressChatPrev.name;
      if ($("portrait-meta")) $("portrait-meta").textContent = undressChatPrev.meta;
    }
    undressChatPrev = null;
    $("portrait-sheet")?.classList.remove("undress-chat");
    $("talk-acts")?.classList.remove("undress-bar");
  }
  if (wasPlay) talkBusy = false;
  // 回到房間對話：不呼叫 hideSheet，保留 affection／body／本輪對話
  if (sheetOpen() && girl) {
    refreshTalkActs();
    setTalkEnabled(!talkBusy);
  }
}

function bindRoomSceneOverlay() {
  const back = $("room-scene-back");
  if (back && !back.dataset.bound) {
    back.dataset.bound = "1";
    back.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      closeRoomScene();
    });
  }
  const overlay = $("room-scene-overlay");
  if (overlay && !overlay.dataset.bound) {
    overlay.dataset.bound = "1";
    overlay.addEventListener("click", (event) => {
      // 點空白處也回房間對話；點卡片本身不關
      if (event.target === overlay) closeRoomScene();
    });
  }
}

function llmProviderOf(settings) {
  const provider = String(settings?.llmProvider || "ollama").toLowerCase();
  if (["grok-build", "build", "grok", "xai", "spacexai", "api"].includes(provider)) return "grok-build";
  return "ollama";
}

async function gameChatRoute() {
  const response = await fetch("/api/save", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(data, response.status));
  const settings = data?.data?.settings || {};
  const provider = llmProviderOf(settings);
  const model = String(settings.model || "").trim();
  if (!model) throw new Error("正式版還沒設定聊天模型");
  return {
    provider,
    model,
    endpoint: provider === "grok-build" ? "grok-build" : (settings.ollamaUrl || "http://localhost:11434"),
  };
}

function wornOutfit(g) {
  const named = String(g?.outfitName || "").trim();
  if (named) return named;
  const look = g?.look || {};
  const wardrobe = Array.isArray(look.wardrobe) ? look.wardrobe : [];
  const erotic = Array.isArray(look.eroticOutfits) ? look.eroticOutfits : [];
  const sleep = Array.isArray(look.sleepOutfits) ? look.sleepOutfits : [];
  const pick = g?.outfitPick;
  if (pick === "base") return BASE_OUTFIT;
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

/** 進房當下選一套，並記住名字。中途過晚上 6 點不重選。 */
function assignEntryOutfit(who) {
  if (!who) return;
  const picked = pickSummonOutfit(who.look, { hour: taiwanNow().hour });
  who.outfitName = picked.name;
  who.outfitPick = picked.pick;
}

function applyWornPick(who, picked) {
  if (!who || !picked) return;
  who.outfitName = picked.name;
  who.outfitPick = picked.pick;
}

const halfGenning = new Set();

// 每位妹子自帶 comfyCkpt（與 app.js 同邏輯，房間模組自備，不 import app）
let roomImgProvider = "";
let roomComfyUrl = "";
let comfyCkpts = [];
let comfyBadCkpts = [];
let comfyCkptRefreshAt = 0;

async function gameImgRoute() {
  const response = await fetch("/api/save", { cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(data, response.status));
  const settings = data?.data?.settings || {};
  const comfy = String(settings.imgProvider || "").toLowerCase() === "comfy";
  roomImgProvider = comfy ? "comfy" : "grok-img";
  roomComfyUrl = String(settings.comfyUrl || "").trim();
  return {
    imgProvider: roomImgProvider,
    imgModel: String(settings.model || "grok-4.5").trim() || "grok-4.5",
    imgStyle: String(settings.imgStyle || "pixel").trim() || "pixel",
    comfyUrl: roomComfyUrl,
    comfyCkpt: String(settings.comfyCkpt || "").trim(),
  };
}

function usableComfyCkpts() {
  const bad = new Set(comfyBadCkpts);
  const u = comfyCkpts.filter((c) => c && !bad.has(c));
  return u.length ? u : comfyCkpts.slice();
}

function pickRandomComfyCkpt(exclude = "") {
  let pool = usableComfyCkpts();
  if (exclude && pool.length > 1) pool = pool.filter((c) => c !== exclude);
  if (!pool.length) return "";
  return pool[Math.floor(Math.random() * pool.length)];
}

/** 檔名太長時只顯示尾段 */
function shortCkptName(name) {
  if (!name) return "";
  const base = String(name).split(/[/\\]/).pop() || name;
  return base.length > 42 ? "…" + base.slice(-40) : base;
}

async function refreshComfyCkpts({ force = false } = {}) {
  if (!force && comfyCkpts.length && Date.now() - comfyCkptRefreshAt < 60000) {
    return true;
  }
  let u = roomComfyUrl;
  if (!roomImgProvider) {
    try {
      await gameImgRoute();
      u = roomComfyUrl;
    } catch { /* ignore */ }
  }
  try {
    const res = await fetch("/api/comfy/status" + (u ? "?url=" + encodeURIComponent(u) : ""));
    const j = await res.json();
    if (!j?.ok) return false;
    comfyCkpts = j.checkpoints || [];
    comfyBadCkpts = j.bad_checkpoints || [];
    comfyCkptRefreshAt = Date.now();
    return true;
  } catch {
    return false;
  }
}

/**
 * 確保這位妹子有固定 Comfy checkpoint。
 * - 非 comfy → 回 ""（不改 g.comfyCkpt）
 * - 已有且非壞檔 → 沿用
 * - 沒有／壞檔 → 從可用清單隨機綁定；若是當前房間妹子則 persistRoom
 */
async function ensureGirlComfyCkpt(g) {
  if (!g) return "";
  if (!roomImgProvider) {
    try { await gameImgRoute(); } catch { return ""; }
  }
  if (roomImgProvider !== "comfy") return "";
  await refreshComfyCkpts();
  const cur = (g.comfyCkpt || "").trim();
  const bad = cur && comfyBadCkpts.includes(cur);
  if (cur && !bad) return cur;
  const picked = pickRandomComfyCkpt(cur);
  if (picked) {
    g.comfyCkpt = picked;
    if (girl && girl.id === g.id) {
      try { persistRoom(); } catch { /* */ }
    }
  }
  return g.comfyCkpt || "";
}

function halfExtra(g) {
  const bits = [
    "half-body portrait, looking at viewer, plain solid color background, simple background",
  ];
  const worn = wornOutfit(g);
  if (worn) bits.push(`wearing: ${worn}`);
  return bits.join(", ");
}

function halfRating(g) {
  const stage = String(g?.stage || "stranger");
  if (stage.includes("wife") || stage === "girlfriend" || stage === "lover" || stage === "passionate") {
    return "nsfw";
  }
  return "sfw";
}

function portraitBody(g, engine) {
  const comfy = engine.imgProvider === "comfy";
  return {
    key: `poportrait:${g.id}:half:${Date.now().toString(36)}`,
    provider: comfy ? "comfy" : "grok-img",
    model: engine.imgModel || "grok-4.5",
    framing: "half",
    rating: halfRating(g),
    style: engine.imgStyle || "pixel",
    character: g,
    outfit: wornOutfit(g),
    extra: halfExtra(g),
    prompt: "",
    cutout: true,
    flat_bg: true,
    retry: true,
    shot: "half",
    char_id: g.id,
    ...(comfy ? {
      comfy_url: engine.comfyUrl || "",
      // 優先妹子自帶模型；全局 settings.comfyCkpt 已廢棄，僅作後備
      ckpt: String(g.comfyCkpt || "").trim() || engine.comfyCkpt || "",
    } : {}),
  };
}

function isNetErr(err) {
  const message = String(err?.message || err || "");
  return /failed to fetch|load failed|networkerror|network error|offline|abort|internet connection|timed out|timeout|lost connection|connection reset|network changed/i.test(message);
}

let summonVaryDepth = 0;
let summonVaryOrigFetch = null;

function pushSummonVary() {
  summonVaryDepth += 1;
  if (summonVaryDepth !== 1 || summonVaryOrigFetch) return;
  summonVaryOrigFetch = window.fetch.bind(window);
  window.fetch = (input, init) => {
    try {
      const url = typeof input === "string" ? input : (input?.url || "");
      const method = String(init?.method || "GET").toUpperCase();
      if (method === "POST" && String(url).includes("/api/imggen") && !String(url).includes("preview")
        && init?.body && typeof init.body === "string") {
        const data = JSON.parse(init.body);
        if (data && typeof data === "object" && !Array.isArray(data)) {
          data.vary = true;
          if (!Number(data.seed)) data.seed = Math.floor(Math.random() * 2147483646) + 1;
          init = { ...init, body: JSON.stringify(data) };
        }
      }
    } catch { /* 解析失敗就原樣送 */ }
    return summonVaryOrigFetch(input, init);
  };
}

function popSummonVary() {
  summonVaryDepth = Math.max(0, summonVaryDepth - 1);
  if (summonVaryDepth === 0 && summonVaryOrigFetch) {
    window.fetch = summonVaryOrigFetch;
    summonVaryOrigFetch = null;
  }
}

async function postImage(body) {
  try {
    const response = await fetch("/api/imggen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorText(payload, response.status));
    return payload;
  } catch (err) {
    if (isNetErr(err)) return null;
    throw err;
  }
}

async function waitImage(body) {
  let key = body.key;
  let visibleWait = 0;
  let last = Date.now();
  const wall0 = last;
  let result = await postImage({ ...body, retry: body.retry !== false });
  if (result?.key) key = result.key;
  // 畫面切到背景也繼續問。逾時只算前景時間，鎖屏不會把還沒好的圖判成失敗。
  while (visibleWait < 360000 && Date.now() - wall0 < 7200000) {
    if (result?.status === "done" || result?.status === "error") return result;
    await new Promise((resolve) => setTimeout(resolve, result ? 1500 : 2500));
    const now = Date.now();
    if (document.visibilityState === "visible") {
      visibleWait += Math.min(5000, Math.max(0, now - last));
    }
    last = now;
    result = await postImage({ ...body, key: key || body.key, retry: false });
    if (result?.key) key = result.key;
  }
  return { status: "error", error: "逾時" };
}

/** 與 pack waitImg／apiJson 相同：HTTP／網路錯誤直接 throw，不吞成 null。 */
async function postImageStrict(body) {
  const response = await fetch("/api/imggen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(payload, response.status));
  return payload;
}

/** 半身／預產用：網路錯誤會 throw（不像 waitImage 把失敗吞成逾時）。 */
async function waitImageStrict(body, onTick, ms = 360000) {
  let key = body.key;
  let r = await postImageStrict({ ...body, retry: body.retry !== false });
  if (r.key) key = r.key;
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    if (r.status === "done" || r.status === "error") return r;
    if (onTick) onTick(Math.round((Date.now() - t0) / 1000));
    await new Promise((x) => setTimeout(x, 1500));
    r = await postImageStrict({ ...body, key, retry: false });
    if (r.key) key = r.key;
  }
  return { status: "error", error: "逾時" };
}

function resetPortraitEntrance(img = $("portrait-img")) {
  if (!img) return;
  img.classList.remove("portrait-in");
  img.hidden = true;
}

function startPortraitEntrance(img) {
  if (!img || !sheetOpen()) return;
  // Already settled in this open session — do not replay.
  if (!img.hidden && img.classList.contains("portrait-in")) return;
  img.hidden = false;
  img.classList.remove("portrait-in");
  // Force starting pose (off-screen) before adding .portrait-in.
  void img.offsetWidth;
  requestAnimationFrame(() => {
    if (!sheetOpen() || img.hidden) return;
    img.classList.add("portrait-in");
  });
}


const buttGenning = new Set();
const waistGenning = new Set();
const breastGenning = new Set();
const kneadGenning = new Set();
const suckGenning = new Set();
const lickGenning = new Set();
const labiaGenning = new Set();
const labiaRubGenning = new Set();
const fingerGenning = new Set();
const ownActionGenning = new Set();
let pregenning = false;
let summoning = false;

function stampPortraitUrl(url) {
  const s = String(url || "");
  if (!s) return "";
  return s.includes("?") ? s : `${s}?v=${Date.now()}`;
}

/** 動作閃現層：左滑入 → 停 1s → 右滑出。插入手指／扣陰道／揉子宮口改成留在畫面上，直到抽出。 */
let actionFlashToken = 0;
let actionFlashTimer = 0;
let actionFlashLoadCancel = null;
let actionFlashTransitionCancel = null;
/** 手指還在體內時要留著的那張圖。其他動作閃完會再鋪回來。 */
let heldInsert = null;
const ACTION_FLASH_ENTER_MS = 500;
const ACTION_FLASH_HOLD_MS = 1000;
const ACTION_FLASH_EXIT_MS = 550;
const INSERT_HOLD_SHOTS = new Set(["tease_finger_in", "tease_vagina_finger", "tease_cervix_rub"]);

function cancelActionFlashLoad() {
  if (actionFlashLoadCancel) {
    actionFlashLoadCancel();
    actionFlashLoadCancel = null;
  }
}

function cancelActionFlashTransition() {
  if (actionFlashTransitionCancel) {
    actionFlashTransitionCancel();
    actionFlashTransitionCancel = null;
  }
}

function waitForActionFlashImage(img, token, expectedSrc) {
  return new Promise(resolve => {
    let settled = false;
    const isCurrent = () => token === actionFlashToken && sheetOpen() && img.src === expectedSrc;
    const cleanup = () => {
      img.removeEventListener("load", onLoad);
      img.removeEventListener("error", onError);
      if (actionFlashLoadCancel === cleanup) actionFlashLoadCancel = null;
    };
    const finish = ready => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(ready);
    };
    const decodeAndFinish = async () => {
      if (!isCurrent()) {
        finish(false);
        return;
      }
      if (typeof img.decode === "function") {
        try {
          await img.decode();
        } catch {
          finish(false);
          return;
        }
      }
      finish(isCurrent() && img.complete && img.naturalWidth > 0);
    };
    const onLoad = () => {
      if (!isCurrent()) {
        finish(false);
        return;
      }
      void decodeAndFinish();
    };
    const onError = () => finish(false);

    img.addEventListener("load", onLoad);
    img.addEventListener("error", onError);
    actionFlashLoadCancel = cleanup;
    if (img.complete) {
      if (img.naturalWidth > 0) void decodeAndFinish();
      else finish(false);
    }
  });
}

/** 非正戲興奮洩精：螢幕中央提示 1 秒（對齊動作閃圖 hold）。 */
let climaxTipToken = 0;
let climaxTipTimer = 0;
const CLIMAX_TIP_HOLD_MS = 1000;

function clearClimaxTip() {
  climaxTipToken += 1;
  if (climaxTipTimer) {
    clearTimeout(climaxTipTimer);
    climaxTipTimer = 0;
  }
  const el = $("climax-tip");
  if (!el) return;
  el.classList.remove("tip-in", "tip-out");
  el.hidden = true;
}

/**
 * 身體警告紅卡（2026-10-08 使用者）：精液 <6「身體快不行了」；0 以下不能做愛也用它說原因。
 * 半透明紅底、像素字，浮在房間對話框／做愛畫面上面；幾秒後自己淡掉，點一下就收。
 */
let bodyWarnTimer = 0;
let bodyWarnToken = 0;
const BODY_WARN_HOLD_MS = 3200;
function bodyWarnEl() {
  let el = $("body-warn-card");
  if (el) return el;
  el = document.createElement("div");
  el.id = "body-warn-card";
  el.className = "body-warn-card";
  el.hidden = true;
  el.setAttribute("role", "alert");
  el.innerHTML = "<b></b><small></small>";
  const dismiss = (event) => {
    event.preventDefault();
    event.stopPropagation();
    hideBodyWarn(true);
  };
  el.addEventListener("click", dismiss);
  el.addEventListener("pointerdown", (event) => event.stopPropagation());
  document.body.appendChild(el);
  return el;
}

function hideBodyWarn(now = false) {
  const el = $("body-warn-card");
  if (!el || el.hidden) return;
  const token = ++bodyWarnToken;
  if (bodyWarnTimer) { clearTimeout(bodyWarnTimer); bodyWarnTimer = 0; }
  el.classList.remove("in");
  bodyWarnTimer = setTimeout(() => {
    if (token !== bodyWarnToken) return;
    el.hidden = true;
    bodyWarnTimer = 0;
  }, now ? 160 : 300);
}

function showBodyWarn(title = "身體快不行了", sub = "") {
  const el = bodyWarnEl();
  el.querySelector("b").textContent = title;
  el.classList.toggle("long", String(title || "").length > 8);
  const small = el.querySelector("small");
  small.textContent = sub || "";
  small.hidden = !sub;
  const token = ++bodyWarnToken;
  if (bodyWarnTimer) { clearTimeout(bodyWarnTimer); bodyWarnTimer = 0; }
  el.hidden = false;
  void el.offsetWidth;
  el.classList.add("in");
  bodyWarnTimer = setTimeout(() => {
    if (token !== bodyWarnToken) return;
    hideBodyWarn();
  }, BODY_WARN_HOLD_MS);
  try { pushDebug(`紅卡：${title}${sub ? `（${sub}）` : ""}`); } catch { /* */ }
}

/** 精液 <6 →「身體快不行了」。回傳有沒有跳。 */
function warnIfSemenLow() {
  const cc = ensurePlayer(player).semenCc;
  if (!semenLow(cc)) return false;
  showBodyWarn("身體快不行了", `精液 ${cc}cc`);
  return true;
}

/** 開始做愛的門檻：精液 0 或負的 → 紅卡說原因，擋下來。回傳是否被擋。 */
function sexStartBlocked() {
  const cc = ensurePlayer(player).semenCc;
  // 妻子飢渴頂點 → 榨乾場，不看精液（2026-10-09 Al）
  if (canStartSexAt(cc, { peak: sexPeakNow() })) return false;
  showBodyWarn("精液不足，身體撐不住了", `目前 ${cc}cc・回到 1cc 以上才能做愛（負的時候每 5 小時 +1cc）`);
  return true;
}

function showClimaxTip(text = "射精了！") {
  if (!sheetOpen()) return;
  const el = $("climax-tip");
  if (!el) return;
  const token = ++climaxTipToken;
  if (climaxTipTimer) {
    clearTimeout(climaxTipTimer);
    climaxTipTimer = 0;
  }
  el.textContent = text || "射精了！";
  el.hidden = false;
  el.classList.remove("tip-out");
  void el.offsetWidth;
  el.classList.add("tip-in");
  climaxTipTimer = setTimeout(() => {
    if (token !== climaxTipToken) return;
    el.classList.remove("tip-in");
    el.classList.add("tip-out");
    climaxTipTimer = setTimeout(() => {
      if (token !== climaxTipToken) return;
      el.hidden = true;
      el.classList.remove("tip-out");
      climaxTipTimer = 0;
    }, 280);
  }, CLIMAX_TIP_HOLD_MS);
}

/** 房內正戲中：陰道／肛門塞著陰莖。 */
function girlInPenisSex(who) {
  const o = who?.bodyState?.organs;
  if (!o) return false;
  return o.vagina?.stuffed === "penis" || o.anus?.stuffed === "penis";
}

function clearActionFlash() {
  actionFlashToken += 1;
  heldInsert = null;
  if (actionFlashTimer) {
    clearTimeout(actionFlashTimer);
    actionFlashTimer = 0;
  }
  cancelActionFlashLoad();
  cancelActionFlashTransition();
  const img = $("action-flash-img");
  if (img) {
    img.classList.remove("flash-in", "flash-out");
    img.hidden = true;
  }
  clearClimaxTip();
}

function showActionFlash(url, alt, opts = {}) {
  if (!url || !sheetOpen()) return;
  const img = $("action-flash-img");
  if (!img) return;
  const hold = !!opts.hold;
  const token = ++actionFlashToken;
  if (hold) heldInsert = { url, alt: alt || "", token };
  if (actionFlashTimer) {
    clearTimeout(actionFlashTimer);
    actionFlashTimer = 0;
  }
  cancelActionFlashLoad();
  cancelActionFlashTransition();

  // Reset while hidden so a rapid re-press never swaps the visible frame.
  img.classList.remove("flash-in", "flash-out");
  img.hidden = true;
  img.alt = alt || "";
  img.src = url;
  const expectedSrc = img.src;

  waitForActionFlashImage(img, token, expectedSrc).then(ready => {
    if (!ready || token !== actionFlashToken || !sheetOpen()) return;
    if (hold && heldInsert?.token !== token) return;
    img.hidden = false;
    // Force the off-screen starting pose before beginning the enter transition.
    void img.offsetWidth;
    requestAnimationFrame(() => {
      if (token !== actionFlashToken || !sheetOpen() || img.hidden || img.src !== expectedSrc) return;
      if (hold && heldInsert?.token !== token) return;
      img.classList.add("flash-in");
      if (hold) return;
      actionFlashTimer = setTimeout(() => {
        if (token !== actionFlashToken || img.src !== expectedSrc) return;
        img.classList.remove("flash-in");
        img.classList.add("flash-out");
        const finish = () => {
          if (token !== actionFlashToken) return;
          cancelActionFlashTransition();
          img.hidden = true;
          img.classList.remove("flash-out");
          actionFlashTimer = 0;
          const again = heldInsert;
          if (again && sheetOpen() && girl?.bodyState?.organs?.vagina?.stuffed === "fingers") {
            showActionFlash(again.url, again.alt, { hold: true });
          }
        };
        const onEnd = ev => {
          if (ev && ev.target !== img) return;
          if (ev?.propertyName && ev.propertyName !== "transform" && ev.propertyName !== "opacity") return;
          finish();
        };
        const cancelTransition = () => img.removeEventListener("transitionend", onEnd);
        actionFlashTransitionCancel = cancelTransition;
        img.addEventListener("transitionend", onEnd);
        actionFlashTimer = setTimeout(() => {
          finish();
        }, ACTION_FLASH_EXIT_MS);
      }, ACTION_FLASH_ENTER_MS + ACTION_FLASH_HOLD_MS);
    });
  });
}

/** 手指還在時，找回剛留在畫面上的那張；沒有就用已存的插入圖。 */
function insertHoldUrl(who) {
  if (heldInsert?.url) return heldInsert;
  const p = who?.portraits || {};
  for (const shot of INSERT_HOLD_SHOTS) {
    const url = String(p[shot] || "");
    if (url) return { url, alt: `${who.name}的手指還在裡面` };
  }
  for (const key of ["tease_vagina_finger_packs", "tease_cervix_rub_packs", "tease_finger_in_packs", "tease_finger_in_nude_packs"]) {
    const pool = p[key];
    if (!pool || typeof pool !== "object") continue;
    const url = Object.values(pool).map((v) => String(v || "")).find(Boolean);
    if (url) return { url, alt: `${who.name}的手指還在裡面` };
  }
  return null;
}

/** 對話打開、手指還在體內：把插入圖留在立繪上面。 */
function restoreInsertView(who = girl) {
  if (!who || !sheetOpen() || who.bodyState?.organs?.vagina?.stuffed !== "fingers") return;
  const hold = insertHoldUrl(who);
  if (!hold) return;
  showActionFlash(hold.url, hold.alt, { hold: true });
}

/** 摸臀／摟腰：快取 URL，並以閃現層顯示（不永久替換 #portrait-img）。插入類留在畫面上。 */
function showTeasePortrait(who, shotKey, url, alt) {
  if (!who || !url) return;
  who.portraits = who.portraits || {};
  who.portraits[shotKey] = url;
  if (girl && girl.id === who.id && sheetOpen()) {
    showActionFlash(url, alt, { hold: INSERT_HOLD_SHOTS.has(shotKey) });
  }
}

/**
 * 動作圖「裸體版」：她全裸（undress.stage===3）時，九組動作圖改用 portraits.<shot>_nude_packs[packId]。
 * 閘門 NUDE_ACTION_PACKS_ON：只有 test_room.html（<html data-nude-action-packs="1">）開；主房間 index.html 照舊穿衣版。
 * 沒裸體版 → 退穿衣版快取＋背景補產裸體版；兩版都沒有 → 直接現產裸體版。
 */
const NUDE_ACTION_PACKS_ON = nudeActionPacksOn();
const ACTION_PACK_JOBS = {
  butt: { packsKey: "tease_butt_packs", shotKey: "tease_butt", label: "摸臀", load: () => loadButtDoc(), gen: (...a) => generateButtPackImage(...a) },
  waist: { packsKey: "tease_waist_packs", shotKey: "tease_waist", label: "摟腰", load: () => loadWaistDoc(), gen: (...a) => generateWaistPackImage(...a) },
  breast: { packsKey: "tease_breast_packs", shotKey: "tease_breast", label: "摸奶", load: () => loadBreastDoc(), gen: (...a) => generateBreastPackImage(...a), isDefault: (p) => isBreastDefaultPrompt(p) },
  breast_knead: { packsKey: "tease_breast_knead_packs", shotKey: "tease_breast_knead", label: "揉奶", load: () => loadKneadDoc(), gen: (...a) => generateKneadPackImage(...a), isDefault: (p) => isKneadDefaultPrompt(p) },
  breast_suck: { packsKey: "tease_breast_suck_packs", shotKey: "tease_breast_suck", label: "吸奶頭", load: () => loadSuckDoc(), gen: (...a) => generateSuckPackImage(...a), isDefault: (p) => isSuckDefaultPrompt(p) },
  nipple_lick: { packsKey: "tease_nipple_lick_packs", shotKey: "tease_nipple_lick", label: "舔奶頭", load: () => loadLickDoc(), gen: (...a) => generateLickPackImage(...a), isDefault: (p) => isLickDefaultPrompt(p) },
  labia: { packsKey: "tease_labia_packs", shotKey: "tease_labia", label: "摸陰唇", load: () => loadLabiaDoc(), gen: (...a) => generateLabiaPackImage(...a) },
  labia_rub: { packsKey: "tease_labia_rub_packs", shotKey: "tease_labia_rub", label: "揉陰唇", load: () => loadLabiaRubDoc(), gen: (...a) => generateLabiaRubPackImage(...a) },
  finger_in: { packsKey: "tease_finger_in_packs", shotKey: "tease_finger_in", label: "手指插入", load: () => loadFingerDoc(), gen: (...a) => generateFingerPackImage(...a) },
  // 扣陰道／揉子宮口（2026-10-03）：x-ray 子宮剖面圖，穿衣／裸體同一張 → noNude（不排裸體補產、不找 _nude 快取）
  vagina_finger: { packsKey: "tease_vagina_finger_packs", shotKey: "tease_vagina_finger", label: "扣陰道", noNude: true, pick: () => pickRuntimeVaginaFingerPack(), load: () => loadVaginaFingerDoc(), gen: (...a) => generateVaginaFingerPackImage(...a) },
  cervix_rub: { packsKey: "tease_cervix_rub_packs", shotKey: "tease_cervix_rub", label: "揉子宮口", noNude: true, pick: () => pickRuntimeCervixRubPack(), load: () => loadCervixRubDoc(), gen: (...a) => generateCervixRubPackImage(...a) },
};
/** 自己的圖都拿不到時（沒組／現產失敗）才借「手指插入」的快取圖（不為借圖再生圖）。 */
const OWN_ACTION_BORROW = { vagina_finger: "finger_in", cervix_rub: "finger_in" };
let lastActionPick = null;
/** 除錯：上一句閒聊的侵犯衰減 { happy, dropped, mark }。 */
let lastChatInvDecay = null;

/**
 * 動作圖 prompt 版次。吸奶頭／舔奶頭 2026-10-03 改成「黑色半透明影子男」（rev 2）：
 * 魅子身上沒蓋 rev 2 章的舊圖，若該組正向仍是預設（＝舊預設已自動換新），下次按到時作廢、照新 prompt 重產；
 * 使用者自己改過正向的組不動。只清快取網址，不刪伺服器檔（重產會覆寫同檔名）。
 */
// rev 3（同日）：胸部四組（摸奶／揉奶／吸奶頭／舔奶頭）取景從 lower 改成胸部特寫 chest。
const ACTION_PROMPT_REV = {
  tease_breast_packs: 3, tease_breast_nude_packs: 3,
  tease_breast_knead_packs: 3, tease_breast_knead_nude_packs: 3,
  tease_breast_suck_packs: 3, tease_breast_suck_nude_packs: 3,
  tease_nipple_lick_packs: 3, tease_nipple_lick_nude_packs: 3,
  // 做愛開場圖 rev 3：solo、失神痙攣、無影子男、走脫光立繪管線（2026-10-03）
  sex_missionary_open_packs: SEX_POSE_PROMPT_REV, sex_doggy_open_packs: SEX_POSE_PROMPT_REV,
  // 做愛開場以外各步（2026-10-03）：sex_<pose>_<step>_packs
  ...Object.fromEntries(["missionary", "doggy"].flatMap((p) => Object.entries(SEX_STEP_PROMPT_REV).map(([st, rev]) => [`sex_${p}_${st}_packs`, rev]))),
};

function stampActionRev(who, cacheKey, packId) {
  const want = ACTION_PROMPT_REV[cacheKey];
  if (!want || !who || !packId) return;
  who.portraits = who.portraits || {};
  const revs = who.portraits.actionPromptRev && typeof who.portraits.actionPromptRev === "object"
    ? who.portraits.actionPromptRev
    : (who.portraits.actionPromptRev = {});
  revs[`${cacheKey}:${packId}`] = want;
}

/** @returns {number} 作廢幾張 */
function dropStaleActionCache(who, pack, job) {
  if (!who?.portraits || !pack?.id || typeof job?.isDefault !== "function") return 0;
  let dropped = 0;
  const revs = who.portraits.actionPromptRev || {};
  for (const key of [job.packsKey, nudePacksKey(job.packsKey)]) {
    const want = ACTION_PROMPT_REV[key];
    if (!want || !who.portraits[key]?.[pack.id]) continue;
    if ((revs[`${key}:${pack.id}`] | 0) >= want) continue;
    const isNude = key !== job.packsKey;
    const stillDefault = job.isDefault(pack) && (!isNude || !String(pack.nudePrompt || "").trim());
    if (stillDefault) {
      delete who.portraits[key][pack.id];
      dropped += 1;
    } else {
      stampActionRev(who, key, pack.id);
    }
  }
  if (dropped) persistRoom();
  return dropped;
}
const nudeActionQueue = [];
const nudeActionQueued = new Set();
let nudeActionDraining = false;

function wantNudeAction(who) {
  return NUDE_ACTION_PACKS_ON && undressStage(who) === 3;
}

async function genNudeActionVariant(who, pack, job) {
  const engine = await gameImgRoute();
  await ensureGirlComfyCkpt(who);
  const result = await job.gen(pack, who, engine, {
    stage: who.stage || "stranger",
    worn: wornOutfit(who),
    nude: true,
  });
  if (result?.status === "done" && result.result) {
    const stamped = stampPortraitUrl(result.result);
    const nk = nudePacksKey(job.packsKey);
    who.portraits = who.portraits || {};
    who.portraits[nk] = who.portraits[nk] || {};
    who.portraits[nk][pack.id] = stamped;
    stampActionRev(who, nk, pack.id);
    persistRoom();
    return stamped;
  }
  if (result?.status === "error") console.warn("[nudeAction]", job.shotKey, result.error || "生圖失敗");
  return "";
}

/** 背景補產裸體版（逐張、不重複；她離開就停）。 */
function queueNudeActionGen(who, pack, job) {
  if (!NUDE_ACTION_PACKS_ON || !who?.id || !pack?.id) return false;
  const key = `${who.id}:${job.shotKey}:${pack.id}`;
  if (nudeActionQueued.has(key)) return false;
  if (who.portraits?.[nudePacksKey(job.packsKey)]?.[pack.id]) return false;
  nudeActionQueued.add(key);
  nudeActionQueue.push({ key, who, pack, job });
  void drainNudeActionQueue();
  return true;
}

async function drainNudeActionQueue() {
  if (nudeActionDraining) return;
  nudeActionDraining = true;
  try {
    while (nudeActionQueue.length) {
      const item = nudeActionQueue.shift();
      try {
        if (!girl || girl.id !== item.who.id) continue;
        if (item.who.portraits?.[nudePacksKey(item.job.packsKey)]?.[item.pack.id]) continue;
        await genNudeActionVariant(item.who, item.pack, item.job);
      } catch (err) {
        console.warn("[nudeAction] queue", err?.message || err);
      } finally {
        nudeActionQueued.delete(item.key);
      }
    }
  } finally {
    nudeActionDraining = false;
  }
}

/** 剛脫光：把每組缺的裸體版排進背景補產（預產的延遲版；不擋對話）。 */
async function queueNudeActionPregen(who = girl) {
  if (!NUDE_ACTION_PACKS_ON || !who?.id) return 0;
  let n = 0;
  for (const job of Object.values(ACTION_PACK_JOBS)) {
    if (job.noNude) continue;
    let packs = [];
    try {
      const doc = await job.load();
      packs = Array.isArray(doc?.packs) ? doc.packs : [];
    } catch {
      packs = [];
    }
    for (const pack of packs) {
      if (!pack?.id) continue;
      dropStaleActionCache(who, pack, job);
      if (queueNudeActionGen(who, pack, job)) n += 1;
    }
  }
  return n;
}

/**
 * 全裸時的選圖。true＝已處理（顯示裸體版／現產裸體版）；false＝呼叫端照穿衣版流程。
 * lastActionPick 給除錯／headless 驗證：{ shotKey, packId, nude, fallback, url }。
 */
async function nudeActionShot(who, pack, job) {
  if (!pack?.id || !wantNudeAction(who)) {
    lastActionPick = { shotKey: job.shotKey, packId: pack?.id || "", nude: false, fallback: false, wanted: false, url: "" };
    return false;
  }
  const pick = pickActionPackUrl(who.portraits, job.packsKey, pack.id, true);
  lastActionPick = { shotKey: job.shotKey, packId: pack.id, nude: pick.nude, fallback: pick.fallback, wanted: true, url: pick.url };
  if (pick.nude) {
    showTeasePortrait(who, job.shotKey, pick.url, `${who.name}的${job.label}圖（裸）`);
    return true;
  }
  if (pick.clothed) {
    queueNudeActionGen(who, pack, job);
    return false;
  }
  const url = await genNudeActionVariant(who, pack, job);
  if (!url) return false;
  lastActionPick = { ...lastActionPick, nude: true, fallback: false, generated: true, url };
  if (wantNudeAction(who)) showTeasePortrait(who, job.shotKey, url, `${who.name}的${job.label}圖（裸）`);
  return true;
}


/** 摸臀：先用 per-girl 預產圖；缺才 live gen（走 generateButtPackImage）。有組→packs[id]，無組→tease_butt。 */
async function maybeGenButtShot(who, actId) {
  if (actId !== "butt" || !who?.id) return;
  if (buttGenning.has(who.id)) return;
  buttGenning.add(who.id);
  try {
    const pack = await pickRuntimeButtPack();
    who.portraits = who.portraits || {};
    if (pack && await nudeActionShot(who, pack, ACTION_PACK_JOBS.butt)) return;
    const cached = pack
      ? String(who.portraits.tease_butt_packs?.[pack.id] || "")
      : String(who.portraits.tease_butt || "");
    if (cached) {
      showTeasePortrait(who, "tease_butt", cached, `${who.name}的摸臀圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateButtPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      if (pack?.id) {
        who.portraits.tease_butt_packs = who.portraits.tease_butt_packs || {};
        who.portraits.tease_butt_packs[pack.id] = stamped;
      }
      showTeasePortrait(who, "tease_butt", stamped, `${who.name}的摸臀圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenButtShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenButtShot]", err?.message || err);
  } finally {
    buttGenning.delete(who.id);
  }
}

/** 摟腰：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen（走 generateWaistPackImage）。 */
async function maybeGenWaistShot(who, actId) {
  if (actId !== "waist" || !who?.id) return;
  if (waistGenning.has(who.id)) return;
  waistGenning.add(who.id);
  try {
    const pack = await pickRuntimeWaistPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.waist)) return;
    const cached = String(who.portraits.tease_waist_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_waist", cached, `${who.name}的摟腰圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateWaistPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_waist_packs = who.portraits.tease_waist_packs || {};
      who.portraits.tease_waist_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_waist", stamped, `${who.name}的摟腰圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenWaistShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenWaistShot]", err?.message || err);
  } finally {
    waistGenning.delete(who.id);
  }
}

/** 摸奶：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen。 */
async function maybeGenBreastShot(who, actId) {
  if (actId !== "breast" || !who?.id) return;
  if (breastGenning.has(who.id)) return;
  breastGenning.add(who.id);
  try {
    const pack = await pickRuntimeBreastPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    dropStaleActionCache(who, pack, ACTION_PACK_JOBS.breast);
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.breast)) return;
    const cached = String(who.portraits.tease_breast_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_breast", cached, `${who.name}的摸奶圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateBreastPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_breast_packs = who.portraits.tease_breast_packs || {};
      who.portraits.tease_breast_packs[pack.id] = stamped;
      stampActionRev(who, "tease_breast_packs", pack.id);
      showTeasePortrait(who, "tease_breast", stamped, `${who.name}的摸奶圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenBreastShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenBreastShot]", err?.message || err);
  } finally {
    breastGenning.delete(who.id);
  }
}

/** 揉奶：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen。 */
async function maybeGenKneadShot(who, actId) {
  if (actId !== "breast_knead" || !who?.id) return;
  if (kneadGenning.has(who.id)) return;
  kneadGenning.add(who.id);
  try {
    const pack = await pickRuntimeKneadPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    dropStaleActionCache(who, pack, ACTION_PACK_JOBS.breast_knead);
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.breast_knead)) return;
    const cached = String(who.portraits.tease_breast_knead_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_breast_knead", cached, `${who.name}的揉奶圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateKneadPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_breast_knead_packs = who.portraits.tease_breast_knead_packs || {};
      who.portraits.tease_breast_knead_packs[pack.id] = stamped;
      stampActionRev(who, "tease_breast_knead_packs", pack.id);
      showTeasePortrait(who, "tease_breast_knead", stamped, `${who.name}的揉奶圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenKneadShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenKneadShot]", err?.message || err);
  } finally {
    kneadGenning.delete(who.id);
  }
}

/** 吸奶頭：僅在有存檔圖組時；先用 per-girl 預產圖，缺才 live gen。 */
async function maybeGenSuckShot(who, actId) {
  if (actId !== "breast_suck" || !who?.id) return;
  if (suckGenning.has(who.id)) return;
  suckGenning.add(who.id);
  try {
    const pack = await pickRuntimeSuckPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    dropStaleActionCache(who, pack, ACTION_PACK_JOBS.breast_suck);
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.breast_suck)) return;
    const cached = String(who.portraits.tease_breast_suck_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_breast_suck", cached, `${who.name}的吸奶頭圖`);
      return;
    }
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    const result = await generateSuckPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_breast_suck_packs = who.portraits.tease_breast_suck_packs || {};
      who.portraits.tease_breast_suck_packs[pack.id] = stamped;
      stampActionRev(who, "tease_breast_suck_packs", pack.id);
      showTeasePortrait(who, "tease_breast_suck", stamped, `${who.name}的吸奶頭圖`);
      persistRoom();
    } else if (result?.status === "error") {
      console.warn("[maybeGenSuckShot]", result.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenSuckShot]", err?.message || err);
  } finally {
    suckGenning.delete(who.id);
  }
}


async function maybeGenLickShot(who, actId) {
  if (actId !== "nipple_lick" || !who?.id) return;
  if (lickGenning.has(who.id)) return;
  lickGenning.add(who.id);
  try {
    const pack = await pickRuntimeLickPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    dropStaleActionCache(who, pack, ACTION_PACK_JOBS.nipple_lick);
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.nipple_lick)) return;
    const cached = String(who.portraits.tease_nipple_lick_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_nipple_lick", cached, `${who.name}的舔奶頭圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateLickPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_nipple_lick_packs = who.portraits.tease_nipple_lick_packs || {};
      who.portraits.tease_nipple_lick_packs[pack.id] = stamped;
      stampActionRev(who, "tease_nipple_lick_packs", pack.id);
      showTeasePortrait(who, "tease_nipple_lick", stamped, `${who.name}的舔奶頭圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenLickShot]", err?.message || err);
  } finally {
    lickGenning.delete(who.id);
  }
}

async function maybeGenLabiaShot(who, actId) {
  if (actId !== "labia" || !who?.id) return;
  if (labiaGenning.has(who.id)) return;
  labiaGenning.add(who.id);
  try {
    const pack = await pickRuntimeLabiaPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.labia)) return;
    const cached = String(who.portraits.tease_labia_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_labia", cached, `${who.name}的摸陰唇圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateLabiaPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_labia_packs = who.portraits.tease_labia_packs || {};
      who.portraits.tease_labia_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_labia", stamped, `${who.name}的摸陰唇圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenLabiaShot]", err?.message || err);
  } finally {
    labiaGenning.delete(who.id);
  }
}

async function maybeGenLabiaRubShot(who, actId) {
  if (actId !== "labia_rub" || !who?.id) return;
  if (labiaRubGenning.has(who.id)) return;
  labiaRubGenning.add(who.id);
  try {
    const pack = await pickRuntimeLabiaRubPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.labia_rub)) return;
    const cached = String(who.portraits.tease_labia_rub_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_labia_rub", cached, `${who.name}的揉陰唇圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateLabiaRubPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_labia_rub_packs = who.portraits.tease_labia_rub_packs || {};
      who.portraits.tease_labia_rub_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_labia_rub", stamped, `${who.name}的揉陰唇圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenLabiaRubShot]", err?.message || err);
  } finally {
    labiaRubGenning.delete(who.id);
  }
}

async function maybeGenFingerShot(who, actId) {
  if (actId !== "finger_in" || !who?.id) return;
  if (fingerGenning.has(who.id)) return;
  fingerGenning.add(who.id);
  try {
    const pack = await pickRuntimeFingerPack();
    if (!pack) return;
    who.portraits = who.portraits || {};
    if (await nudeActionShot(who, pack, ACTION_PACK_JOBS.finger_in)) return;
    const cached = String(who.portraits.tease_finger_in_packs?.[pack.id] || "");
    if (cached) {
      showTeasePortrait(who, "tease_finger_in", cached, `${who.name}的手指插入圖`);
      return;
    }
    const engine = await gameImgRoute();
    const result = await generateFingerPackImage(pack, who, engine, {
      stage: who.stage || "stranger",
      worn: wornOutfit(who),
    });
    if (result?.status === "done" && result.result) {
      const stamped = stampPortraitUrl(result.result);
      who.portraits.tease_finger_in_packs = who.portraits.tease_finger_in_packs || {};
      who.portraits.tease_finger_in_packs[pack.id] = stamped;
      showTeasePortrait(who, "tease_finger_in", stamped, `${who.name}的手指插入圖`);
      persistRoom();
    }
  } catch (err) {
    console.warn("[maybeGenFingerShot]", err?.message || err);
  } finally {
    fingerGenning.delete(who.id);
  }
}

/** 借圖：手指插入的快取（全裸＋閘門開時優先裸體版）；不生圖。 */
async function borrowActionUrl(who, borrowAct) {
  const job = ACTION_PACK_JOBS[borrowAct];
  if (!job || !who?.portraits) return "";
  const nude = !job.noNude && wantNudeAction(who);
  let pack = null;
  try {
    pack = await pickRuntimeFingerPack();
  } catch {
    pack = null;
  }
  if (pack?.id) {
    const pick = pickActionPackUrl(who.portraits, job.packsKey, pack.id, nude);
    if (pick.url) return pick.url;
  }
  const pools = [nude ? who.portraits[nudePacksKey(job.packsKey)] : null, who.portraits[job.packsKey]];
  for (const pool of pools) {
    if (!pool || typeof pool !== "object") continue;
    const url = Object.values(pool).map((v) => String(v || "")).find(Boolean);
    if (url) return url;
  }
  return String(who.portraits[job.shotKey] || "");
}

/**
 * 扣陰道／揉子宮口：用自己的 x-ray 剖面圖組。快取有 → 直接顯示；沒有 → 現產、存 portraits.<shot>_packs[packId]。
 * 剖面圖穿衣／裸體同一張（不找 _nude）。沒組或現產失敗 → 才借手指插入的快取圖（lastActionPick.borrowed）。
 */
async function maybeGenOwnActionShot(who, actId) {
  const job = ACTION_PACK_JOBS[actId];
  if (!job?.noNude || !who?.id) return;
  const lock = `${who.id}:${actId}`;
  if (ownActionGenning.has(lock)) return;
  ownActionGenning.add(lock);
  let pack = null;
  try {
    who.portraits = who.portraits || {};
    try {
      pack = await job.pick();
    } catch {
      pack = null;
    }
    if (pack?.id) {
      const cached = String(who.portraits[job.packsKey]?.[pack.id] || "");
      if (cached) {
        lastActionPick = { shotKey: job.shotKey, packId: pack.id, nude: false, fallback: false, wanted: false, borrowed: false, url: cached };
        showTeasePortrait(who, job.shotKey, cached, `${who.name}的${job.label}圖`);
        return;
      }
      const engine = await gameImgRoute();
      await ensureGirlComfyCkpt(who);
      const result = await job.gen(pack, who, engine, { stage: who.stage || "stranger", worn: wornOutfit(who) });
      if (result?.status === "done" && result.result) {
        const stamped = stampPortraitUrl(result.result);
        who.portraits[job.packsKey] = who.portraits[job.packsKey] || {};
        who.portraits[job.packsKey][pack.id] = stamped;
        lastActionPick = { shotKey: job.shotKey, packId: pack.id, nude: false, fallback: false, wanted: false, borrowed: false, generated: true, url: stamped };
        showTeasePortrait(who, job.shotKey, stamped, `${who.name}的${job.label}圖`);
        persistRoom();
        return;
      }
      console.warn("[maybeGenOwnActionShot]", job.shotKey, result?.error || "生圖失敗");
    }
  } catch (err) {
    console.warn("[maybeGenOwnActionShot]", actId, err?.message || err);
  } finally {
    ownActionGenning.delete(lock);
  }
  // 退路：自己的圖拿不到才借手指插入快取
  try {
    const borrowAct = OWN_ACTION_BORROW[actId];
    const url = await borrowActionUrl(who, borrowAct);
    lastActionPick = { shotKey: job.shotKey, packId: pack?.id || "", nude: false, fallback: true, wanted: false, borrowed: !!url, borrowFrom: borrowAct, url };
    if (url) {
      const bj = ACTION_PACK_JOBS[borrowAct];
      showTeasePortrait(who, bj.shotKey, url, `${who.name}的${bj.label}圖`);
    }
  } catch (err) {
    console.warn("[maybeGenOwnActionShot] borrow", err?.message || err);
  }
}

/** 組繪圖單。clothedOnly＝換衣服（半身、立繪、穿衣動作）。否則再加裸體動作、脫衣。剖面只在召喚。 */
async function collectSummonPortraitItems(who = girl, opts = {}) {
  if (!who || (who === girl && sheIsOut() && !summoning && !pending && !summonBackBusy)) return [];
  if (pregenning) throw new Error("預產進行中");
  pregenning = true;
  try {
    await ensureGirlComfyCkpt(who);
    const engine = await gameImgRoute();
    if (engine.imgProvider === "comfy" && !String(who.comfyCkpt || "").trim()) {
      throw new Error("此魅子尚未綁定 Comfy 模型");
    }
    const stage = who.stage || "stranger";
    const worn = wornOutfit(who);
    const packJobs = [
      { load: loadButtDoc, build: buildButtImgBody, packsKey: "tease_butt_packs", shotKey: "tease_butt" },
      { load: loadWaistDoc, build: buildWaistImgBody, packsKey: "tease_waist_packs", shotKey: "tease_waist" },
      { load: loadBreastDoc, build: buildBreastImgBody, packsKey: "tease_breast_packs", shotKey: "tease_breast" },
      { load: loadKneadDoc, build: buildKneadImgBody, packsKey: "tease_breast_knead_packs", shotKey: "tease_breast_knead" },
      { load: loadSuckDoc, build: buildSuckImgBody, packsKey: "tease_breast_suck_packs", shotKey: "tease_breast_suck" },
      { load: loadLickDoc, build: buildLickImgBody, packsKey: "tease_nipple_lick_packs", shotKey: "tease_nipple_lick" },
      { load: loadLabiaDoc, build: buildLabiaImgBody, packsKey: "tease_labia_packs", shotKey: "tease_labia" },
      { load: loadLabiaRubDoc, build: buildLabiaRubImgBody, packsKey: "tease_labia_rub_packs", shotKey: "tease_labia_rub" },
      { load: loadFingerDoc, build: buildFingerImgBody, packsKey: "tease_finger_in_packs", shotKey: "tease_finger_in" },
      { load: loadVaginaFingerDoc, build: buildVaginaFingerImgBody, packsKey: "tease_vagina_finger_packs", shotKey: "tease_vagina_finger", noNude: true },
      { load: loadCervixRubDoc, build: buildCervixRubImgBody, packsKey: "tease_cervix_rub_packs", shotKey: "tease_cervix_rub", noNude: true },
    ].filter((job) => XRAY_ACTION_PACKS_ON || !job.noNude);

    const items = [];
    try {
      items.push({ slot: { kind: "half" }, body: portraitBody(who, engine) });
    } catch (err) {
      console.warn("[summon-queue] half", err?.message || err);
    }
    if (opts.halfOnly) return items;
    const withNude = !opts.clothedOnly;
    for (const job of packJobs) {
      if (opts.clothedOnly && job.noNude) continue;
      let packs = [];
      try {
        const doc = await job.load();
        packs = (Array.isArray(doc?.packs) ? doc.packs : []).filter((p) => p?.id);
      } catch (err) {
        console.warn("[summon-queue] load", job.packsKey, err?.message || err);
        packs = [];
      }
      for (const pack of packs) {
        try {
          items.push({
            slot: { kind: "pack", packsKey: job.packsKey, packId: pack.id, shotKey: job.shotKey },
            body: job.build(pack, who, engine, { stage, worn }),
          });
        } catch (err) {
          console.warn("[summon-queue] pack", job.packsKey, pack.id, err?.message || err);
        }
        if (!withNude || job.noNude) continue;
        try {
          items.push({
            slot: { kind: "pack", packsKey: nudePacksKey(job.packsKey), packId: pack.id },
            body: job.build(pack, who, engine, { stage, worn, nude: true }),
          });
        } catch (err) {
          console.warn("[summon-queue] nude", job.packsKey, pack.id, err?.message || err);
        }
      }
    }
    let standeeSlots = [];
    try {
      standeeSlots = listFilledStandeeSlots(await loadStandeeDoc());
    } catch (err) {
      console.warn("[summon-queue] standee", err?.message || err);
      standeeSlots = [];
    }
    for (const slot of standeeSlots) {
      try {
        items.push({
          slot: { kind: "standee", slotId: slot.id },
          body: buildStandeeImgBody(slot, who, engine, { stage, worn }),
        });
      } catch (err) {
        console.warn("[summon-queue] standee", slot?.id, err?.message || err);
      }
    }
    if (opts.clothedOnly) return items;
    let undressPacks = [];
    try {
      undressPacks = await listUndressScenes(true);
    } catch (err) {
      console.warn("[summon-queue] undress", err?.message || err);
      undressPacks = [];
    }
    const undressAll = Array.isArray(undressPacks) ? undressPacks : [];
    for (const shot of SUMMON_UNDRESS_SHOTS) {
      if (DROPPED_UNDRESS_SHOTS.has(shot)) continue;
      const pack = undressAll.find((p) => p.shot === shot) || presetByShot(shot);
      if (!pack) {
        console.warn("[summon-queue] undress", shot, "沒有場景");
        continue;
      }
      try {
        items.push({
          slot: { kind: "undress", shot },
          body: buildUndressImgBody(pack, who, engine, { rating: halfRating(who) }),
        });
      } catch (err) {
        console.warn("[summon-queue] undress", shot, err?.message || err);
      }
    }
    return items;
  } finally {
    pregenning = false;
  }
}

/** 缺的做愛圖（兩姿勢步驟＋局部動圖）。只組單。 */
async function collectSummonSexItems(who) {
  if (!SEX_POSES_ON || !who?.id) return [];
  const jobs = await planSexSetFor(who);
  if (!jobs.length) return [];
  const engine = await gameImgRoute();
  await ensureGirlComfyCkpt(who);
  const items = [];
  let framePacks = null;
  for (const j of jobs) {
    if (j.kind === "step") {
      let pack = null;
      try {
        const doc = await getSexPosePacksCached(j.pose);
        pack = (doc?.packs || []).map((p) => normalizeSexPosePack(j.pose, p)).find((p) => p.id === j.packId) || null;
      } catch (err) {
        console.warn("[summon-queue] sex pack", j.pose, err?.message || err);
      }
      if (!pack) continue;
      const packsKey = sexStepPacksKey(j.pose, j.step);
      const pool = who.portraits?.[packsKey] || {};
      const tSlot = j.step === "thrust" ? pickSexThrustSlot(j.pose, pool, j.packId) : { slot: 1, evict: [] };
      try {
        items.push({
          slot: {
            kind: "sex-step",
            pose: j.pose,
            step: j.step,
            packId: j.packId,
            packsKey,
            thrustSlot: tSlot.slot,
            evict: tSlot.evict || [],
          },
          body: buildSexStepImgBody(
            j.pose,
            j.step,
            pack,
            who,
            engine,
            j.step === "thrust" ? { thrustSlot: tSlot.slot } : {},
          ),
        });
      } catch (err) {
        console.warn("[summon-queue] sex", j.pose, j.step, err?.message || err);
      }
      continue;
    }
    if (!framePacks) {
      try { framePacks = await loadFramePacksCached(); } catch { framePacks = []; }
    }
    let built;
    try {
      built = buildSexAnimFrames(j.pose, engine.imgStyle || "anime", "mid", who.look || {}, who);
    } catch (err) {
      console.warn("[summon-queue] sex-anim", j.pose, err?.message || err);
      continue;
    }
    const bonePack = (framePacks || []).find((p) => p.pose === j.pose && packFrameUrl(p, 1)) || null;
    for (const frame of j.frames || []) {
      const bone = bonePack ? packFrameUrl(bonePack, frame + 1) : "";
      try {
        items.push({
          slot: { kind: "sex-anim", pose: j.pose, frame },
          body: sexAnimFrameBody(who, j.pose, frame, engine, built, bone),
        });
      } catch (err) {
        console.warn("[summon-queue] sex-anim", j.pose, frame, err?.message || err);
      }
    }
  }
  return items;
}

/** 「幫她脫時逃走→裸體旗」2026-10-03 撤掉（使用者之後重設計）：不設、不顯示、載入清掉。 */
const NUDE_FLAG_ON = false;
function stripRetiredNude(who) {
  if (!NUDE_FLAG_ON && who && "nude" in who) delete who.nude;
}

const NUDE_STANDEE_SHOTS = new Set(["undress_cover", "undress_low", "undress_stand"]);

function undressStage(who) {
  const n = who?.undress?.stage | 0;
  if (n <= 0) return 0;
  return n >= 3 ? 3 : n;
}

/** 脫光才記內褲是誰脫的。自己脫 → 順從；你脫的 → 被動。做愛開場圖（test_room 閘門 data-sex-poses）用這旗選姿勢：self 傳教士、help 後背。 */
function snapshotUndress(raw) {
  const stage = Math.max(0, Math.min(3, raw?.stage | 0));
  const shotRaw = String(raw?.shot || "");
  const shot = stage >= 3 && NUDE_STANDEE_SHOTS.has(shotRaw) ? shotRaw : "";
  const pantiesBy = stage >= 3 && (raw?.pantiesBy === "self" || raw?.pantiesBy === "help")
    ? raw.pantiesBy
    : "";
  const sexStance = pantiesBy === "self" ? "順從" : pantiesBy === "help" ? "被動" : "";
  return { stage, shot, pantiesBy, sexStance };
}

function ensureUndress(who) {
  if (!who) return null;
  who.undress = snapshotUndress(who.undress);
  return who.undress;
}

/** 這趟脫衣進度清掉。裸體狀態（逃走時打下的旗）留著。 */
function clearVisitUndress(who = girl) {
  if (!who) return;
  who.undress = snapshotUndress(null);
}

/** 失神（≥75）或痙攣中？ */
function undressDazed(who) {
  if (!who) return false;
  ensureStunFields(who);
  return inSpasm(who) || stunTier(effectiveStun(who, "")) === "stun";
}

const REDRESS_NOTE = "（她回過神來，慌忙把衣服穿回去了。）";

/**
 * 2026-10-03 使用者：半脫（stage 1–2）只存在於失神／痙攣中。回神後她自己穿回去（stage→0、換回穿衣立繪）；
 * 全裸（stage 3）則維持到離房或按「穿衣」。脫衣畫面開著時不動。
 * @returns {boolean} 這次有沒有穿回去
 */
function settleUndressAfterStun(who = girl) {
  if (!who) return false;
  const stage = undressStage(who);
  if (stage < 1 || stage >= 3) return false;
  if (who === girl && undressPlayOpen()) return false;
  if (undressDazed(who)) return false;
  clearVisitUndress(who);
  return true;
}

/** 陌生～女友前：只遮胸與下體。女友～妻子前：遮胸或只遮下體。妻子起：不遮或只遮下體。 */
function nudeStandeeChoices(stageKey) {
  const idx = STAGE_INDEX[stageKey] ?? 0;
  const gf = STAGE_INDEX.girlfriend ?? 4;
  const wife = STAGE_INDEX.wife ?? 7;
  if (idx < gf) return ["undress_cover"];
  if (idx < wife) return ["undress_cover", "undress_low"];
  return ["undress_stand", "undress_low"];
}

function rollNudeStandee(who) {
  const u = ensureUndress(who);
  if (!u || u.stage < 3) return "";
  const choices = nudeStandeeChoices(who.stage);
  u.shot = choices[Math.floor(Math.random() * choices.length)] || "undress_cover";
  return u.shot;
}

/** 沒脫完：只有痙攣或失神（≥75）才換成該階段（清醒就會穿回去）。脫完：失神時用沒有內褲那張，否則用這次聊天抽到的裸體立繪。 */
function undressPortraitShot(who, opts = {}) {
  const stage = undressStage(who);
  if (stage < 1) return "";
  const stun = opts.stun != null ? opts.stun : effectiveStun(who, "");
  const high = inSpasm(who) || stunTier(stun) === "stun";
  if (high) {
    if (stage === 1) return "undress_loose";
    if (stage === 2) return "undress_slip";
    return "undress_nude";
  }
  // 半脫只存在於失神／痙攣中：清醒時 settleUndressAfterStun 會讓她穿回去（stage→0）
  if (stage < 3) return "";
  const shot = String(who?.undress?.shot || "");
  if (NUDE_STANDEE_SHOTS.has(shot)) return shot;
  return rollNudeStandee(who);
}

/** 這一拍的脫衣事實。旁白照這個寫，不能改結果。 */
function undressBeat(help, outcome, stageBefore, stageAfter) {
  if (outcome === "flee") {
    const still = stageBefore <= 0 ? "外衣還在身上" : stageBefore === 1 ? "胸罩和內褲都還在" : "內褲還在";
    const text = `她掙開你的手，${still}，人逃離了房間。`;
    return { text, canned: `（${text}）` };
  }
  if (outcome === "ignore") {
    const still = stageBefore <= 0 ? "衣服還全穿著" : stageBefore === 1 ? "仍是胸罩和內褲" : "內褲還在";
    const text = `你叫她脫，她沒有動手，${still}。`;
    return { text, canned: `（${text}）` };
  }
  let text = "";
  if (stageAfter === 1) {
    text = help
      ? "你解開她的外衣，外衣離開了。現在只剩胸罩和內褲。"
      : "她自己把外衣脫下來。現在只剩胸罩和內褲。";
  } else if (stageAfter === 2) {
    text = help
      ? "你解開她的胸罩，胸口露出來。現在只剩內褲。"
      : "她自己把胸罩脫掉，胸口露出來。現在只剩內褲。";
  } else {
    text = help
      ? "你褪下她的內褲。內褲離開了，身上什麼都沒穿。"
      : "她自己把內褲褪下來。身上什麼都沒穿。";
  }
  return { text, canned: `（${text}）` };
}

async function narrateUndress(beat) {
  const fallback = beat.canned;
  try {
    const route = await gameChatRoute();
    const messages = [
      {
        role: "system",
        content: [
          "你是房間旁白。繁體中文。第三人稱。兩到四句。",
          "只寫這一拍看得見的脫衣：誰的手、哪一件布料離開或沒離開、現在還穿什麼、身體怎麼動。",
          "不要寫「」或『』台詞，不要替她說話。她的回應另外有人寫。",
          "不要寫選項、系統詞、階段名、順從、被動。不要寫插入、抽插、做愛。",
          "事實不能改：沒脫成就不要寫成脫掉，逃走就不要寫成留下。",
        ].join("\n"),
      },
      { role: "user", content: `事實：${beat.text}` },
    ];
    const key = `undress-narr:${girl?.id || "x"}:${Date.now().toString(36)}`;
    const line = route.provider === "ollama"
      ? await askOllama(route, messages, null, { temperature: 0.7 })
      : await askGrok(route, messages, key, { temperature: 0.7 });
    const clean = String(line || "").replace(/^旁白[:：]\s*/, "").trim();
    if (!clean) return fallback;
    const inner = clean.replace(/^[（(]+/, "").replace(/[）)]+$/, "").trim();
    return inner ? `（${inner}）` : fallback;
  } catch (err) {
    console.warn("[undress narr]", err?.message || err);
    return fallback;
  }
}

/** 召喚沒生到的脫衣圖，互動時一次補齊。已有的不重做。 */
function ensureSummonUndressSet(who) {
  if (!who?.id) return;
  for (const shot of SUMMON_UNDRESS_SHOTS) {
    if (DROPPED_UNDRESS_SHOTS.has(shot)) continue;
    if (String(who.portraits?.[shot] || "")) continue;
    void ensureUndressPortrait(who, shot);
  }
}

function intendedUndressWords(raw) {
  const t = String(raw || "").split(/[。！？!?\n]/)[0];
  const chars = Array.from(t).filter((ch) => !/[\s，、,…\.「」『』""''（）()]/.test(ch));
  return chars.slice(0, 12).join("") || "不要";
}

/** 失神／痙攣：把想說的字拆開，亂數黏進呻吟和換行裡。字的順序保留。 */
function weaveStunReply(words) {
  const chars = Array.from(String(words || "")).filter((ch) => ch && !/\s/.test(ch));
  const src = chars.length ? chars : ["嗯"];
  const moans = ["痾", "喔", "喔喔", "啊", "歐", "呃", "唔", "哈"];
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const dots = () => (Math.random() < 0.5 ? "…" : "....");
  let i = 0;
  const lines = [];
  while (i < src.length || lines.length < 2) {
    const parts = [];
    parts.push(pick(moans) + dots());
    const room = src.length - i;
    const take = room <= 0 ? 0 : Math.min(room, 1 + Math.floor(Math.random() * 2));
    for (let k = 0; k < take; k++) {
      const ch = src[i++];
      if (Math.random() < 0.6) parts[parts.length - 1] += ch;
      else parts.push(ch);
      if (Math.random() < 0.75) {
        const m = pick(moans);
        if (Math.random() < 0.55) parts[parts.length - 1] += m;
        else parts.push(m);
      }
    }
    if (!take) parts.push(pick(moans));
    const sep = Math.random() < 0.5 ? " " : "… ";
    lines.push(parts.join(sep).replace(/…{2,}/g, "…").replace(/\.{5,}/g, "...."));
    if (i >= src.length && lines.length >= 2) break;
    if (lines.length >= 6) {
      while (i < src.length) lines[lines.length - 1] += src[i++];
      break;
    }
  }
  return lines.join("\n");
}

/**
 * 脫衣／肏的她那句：保留她想說的話，依腦袋佔有度塞呻吟（≥95 才整句講不出來）。
 * opts.cap：上限（她自己脫衣的回覆壓在 30：好好講話、只夾一點呻吟）；opts.inSex／climaxNow 給肏用。
 */
function presentUndressReply(clean, opts = {}) {
  if (!girl) return String(clean || "").trim() || "……";
  const occ = takeOccupancy(girl, "", opts);
  const text = String(clean || "").trim();
  return presentOccupied(girl, text, "", occ) || text || "……";
}

async function undressGirlLine(fact, opts = {}) {
  try {
    // 叫她脫（她自己動手）：她還能好好講話（佔有度壓 30），只寫一句正常的話
    const f = String(fact || "").replace(/[。．]+$/, "");
    const ask = opts.self
      ? `（旁白：${f}。身體還熱、腦袋有點暈，但你還能說話。說一句你此刻想說的話（害羞、嘴硬、撒嬌都看個性），一句、二十字內；不要呻吟、不要旁白、不要描述動作。）`
      : `（旁白：${f}。你現在幾乎說不清楚，心裡仍有一句想說的話。只寫那一句，不要呻吟、不要旁白、不要描述動作。）`;
    const reply = await askGirl(ask);
    const clean = String(reply || "").replace(/\s+/g, " ").trim();
    return clean || "不要……";
  } catch (err) {
    console.warn("[undress reply]", err?.message || err);
    return "不要……";
  }
}

/** 解析當前應顯示的半身立繪槽：痙攣／失神→對應槽（對話也適用）；挑逗另走干擾／空白／求饒；否則依性奮。 */
function resolveStandeeSlotForPaint(who, opts = {}) {
  if (!who) return "";
  const teasing = !!(opts.teasing || opts.actId);
  if (inSpasm(who)) return "spasm";
  const stun = opts.stun != null ? opts.stun : effectiveStun(who, opts.actId || "");
  const tier = stunTier(stun);
  // 失神（≥75）：對話立繪也用 stun 槽，不只挑逗 flash
  if (tier === "stun") return "stun";
  // 干擾／空白／求饒立繪只在真的被刺激（說話也會崩）時才用；摟腰等輕碰不換
  if (teasing && speechMayBreak(who, opts.actId || "")) {
    if (tier === "interfere" || tier === "blank" || tier === "beg") return tier;
  }
  const ar = arousalStage(who?.bodyState?.arousal);
  if (ar === "slight" || ar === "aroused" || ar === "wantFill" || ar === "climax") return ar;
  return "";
}

function standingPortraitUrl(who) {
  return pickPortraitUrl(who?.portraits, "half", {
    portrait: who?.portrait || "",
    uncut: uncutPortraitSet(),
  });
}

function settlePortraitFrame(img, who, pinned, hops = 0) {
  if (!pinned && hops < 8 && promotePastUncut(img, who, hops)) return;
  if (!sheetOpen()) {
    resetPortraitEntrance(img);
    return;
  }
  startPortraitEntrance(img);
}

/** 半身缺了、白底沒去背、或這張載入失敗，就換下一張。有圖總比空白或白框好。 */
function promotePastUncut(img, who, hops) {
  const src = img.getAttribute("src") || "";
  if (!src || !judgePortraitCut(img, src)) return false;
  markPortraitUncut(src);
  const next = standingPortraitUrl(who);
  if (!next || portraitPathKey(next) === portraitPathKey(src)) return false;
  img.src = next;
  const again = () => settlePortraitFrame(img, who, "", hops + 1);
  if (!img.complete) {
    img.addEventListener("load", again, { once: true });
    img.addEventListener("error", () => onPortraitFrameError(img, who, hops + 1), { once: true });
    return true;
  }
  if (img.naturalWidth) again();
  else onPortraitFrameError(img, who, hops + 1);
  return true;
}

function onPortraitFrameError(img, who, hops = 0) {
  const src = img.getAttribute("src") || "";
  if (src) markPortraitUncut(src);
  if (hops < 8 && promotePastUncut(img, who, hops)) return;
  resetPortraitEntrance(img);
  img.removeAttribute("src");
}

function paintHalfPortrait(who = girl, opts = {}) {
  const img = $("portrait-img");
  if (!img) return;
  // 對話版做愛：主圖是做愛步驟圖，別被立繪蓋掉
  if (sexChatActive() && who === girl && sexChat.img) {
    paintSexChatImage();
    return;
  }
  const liveShot = who ? undressPortraitShot(who, opts) : "";
  const liveUrl = liveShot ? String(who?.portraits?.[liveShot] || "") : "";
  if (liveShot && !liveUrl) void ensureUndressPortrait(who, liveShot);
  const slotId = liveUrl ? "" : resolveStandeeSlotForPaint(who, opts);
  const standee = slotId ? standeeUrlFor(who, slotId) : "";
  const pinned = liveUrl || standee;
  // 半身網址不見時不要空白：退情緒半身、全身、大頭。白底沒去背的也不優先。
  const url = pinned || standingPortraitUrl(who);
  if (!url || !who) {
    resetPortraitEntrance(img);
    img.removeAttribute("src");
    img.alt = "";
    return;
  }
  img.alt = liveUrl
    ? `${who.name}的立繪（${liveShot}）`
    : standee && slotId
      ? `${who.name}的立繪（${slotId}）`
      : `${who.name}的立繪`;
  const prev = img.getAttribute("src") || "";
  const srcChanged = prev !== url;
  if (srcChanged) img.src = url;
  const settle = () => settlePortraitFrame(img, who, pinned);
  if (srcChanged && !img.complete) {
    img.addEventListener("load", settle, { once: true });
    img.addEventListener("error", () => onPortraitFrameError(img, who), { once: true });
    return;
  }
  if (srcChanged && img.complete && !img.naturalWidth) {
    onPortraitFrameError(img, who);
    return;
  }
  settle();
}

async function ensureHalfPortrait(who, opts = {}) {
  if (!who?.id) {
    if (opts.required) throw new Error("無魅子");
    return;
  }
  // 舊房間存檔可能沒綁 ckpt；生圖前補上（非 comfy 則 no-op）
  try {
    await ensureGirlComfyCkpt(who);
  } catch (err) {
    if (opts.required) throw err;
  }
  if (who.portraits?.half && !opts.force) {
    paintHalfPortrait(who);
    return opts.required ? { ok: true } : undefined;
  }
  // 已有進行中的生圖：非 required 直接返回；required 則等結果。
  // force 會等前一個工作流結束後再開一輪，確保本次按鈕一定重產。
  if (halfGenning.has(who.id)) {
    if (!opts.required && !opts.force) return;
    const t0 = Date.now();
    while (halfGenning.has(who.id) && Date.now() - t0 < 360000) {
      await new Promise((r) => setTimeout(r, 800));
      if (!opts.force && who.portraits?.half) {
        paintHalfPortrait(who);
        return { ok: true };
      }
    }
    if (halfGenning.has(who.id)) throw new Error("半身立繪生圖逾時");
    if (!opts.force && who.portraits?.half) {
      paintHalfPortrait(who);
      return { ok: true };
    }
  }
  halfGenning.add(who.id);
  try {
    const engine = await gameImgRoute();
    await ensureGirlComfyCkpt(who);
    if (opts.required && engine.imgProvider === "comfy" && !String(who.comfyCkpt || "").trim()) {
      throw new Error("此魅子尚未綁定 Comfy 模型");
    }
    const waiter = opts.required ? waitImageStrict : waitImage;
    const result = await waiter(
      portraitBody(who, engine),
      opts.required ? opts.onTick : undefined,
    );
    if (result?.status === "done" && result.result) {
      const url = String(result.result);
      who.portraits = who.portraits || {};
      who.portraits.half = url.includes("?") ? url : `${url}?v=${Date.now()}`;
      who.portrait = who.portraits.full || who.portraits.half;
      // Only touch live UI / session if this is still the room girl.
      if (girl && girl.id === who.id) {
        if (girl !== who) {
          girl.portraits = girl.portraits || {};
          girl.portraits.half = who.portraits.half;
          if (who.portrait) girl.portrait = who.portrait;
        }
        paintHalfPortrait(girl);
        persistRoom();
      }
      return opts.required ? { ok: true } : undefined;
    }
    const errMsg = result?.error || "半身立繪生圖失敗";
    if (opts.required) throw new Error(errMsg);
    if (result?.status === "error") {
      console.warn("[ensureHalfPortrait]", errMsg);
    }
  } catch (err) {
    if (opts.required) throw err;
    console.warn("[ensureHalfPortrait]", err?.message || err);
  } finally {
    halfGenning.delete(who.id);
  }
}

function lookLine(g) {
  const look = g.look || {};
  return [
    look.age != null ? `${look.age}歲` : "",
    look.hair_color,
    look.hair,
    look.eye_color,
    wornOutfit(g),
  ].filter(Boolean).join(" · ");
}

function titleOf(g) {
  return `${g.name} ${RARITY_MARK[g.rarity] || ""} ${g.rarity || ""}`.trim();
}

function activityLine() {
  const activity = girl?.world?.activity;
  const job = girl?.world?.job;
  if (activity === "sleep") {
    const until = Number(girl.world.sleep?.until);
    const wake = until > 1e11 ? japanNow(new Date(until)).label.split(" ").pop() : "";
    return `她在${girl.world.home?.name || "住所"}睡覺${wake ? `，日本時間 ${wake} 醒` : ""}。`;
  }
  if (activity === "browse") {
    const home = girl.world.home?.name || "住所";
    const title = girl.world.browse?.title;
    if (girl.world.browse?.pending || !title) return `她在${home}上網。`;
    return `她在${home}看過「${title}」。`;
  }
  if (activity === "wander") {
    const place = girl.world.stroll?.placeName;
    if (girl.world.stroll?.pending && place) return `她走到${place}。`;
    if (girl.world.stroll?.pending) return "她在外面溜達。";
    if (place) return `她在${place}逛過。`;
    return "她在亂逛。";
  }
  if (activity === "work" && !job) return "她在挑打工。";
  if (activity === "work" && girl.world.shift?.pending && !girl.world.shift?.event) {
    return job?.name ? `她正在${job.name}打工。` : "她去打工了。";
  }
  if (activity === "work" && girl.world.shift?.pending) return `她在${job.name}開始工作了。`;
  if (job) return `她的打工是${job.name}。`;
  return "";
}

/** 沙盒面板：上一件、碰過的人、SCP 進度（RP5 結算後帶回來的）。 */
function outsideSummaryLines() {
  const w = girl?.world;
  if (!w) return [];
  const out = [];
  const last = w.lastOutside;
  if (last?.text) {
    const when = Number(last.at) > 1e11 ? japanNow(new Date(last.at)).label.split(" ").pop() : "";
    const kind = { work: "打工", stroll: "溜達", browse: "上網", sleep: "睡覺" }[last.kind] || "";
    const moodShift = last.moodBefore && last.moodAfter && last.moodBefore !== last.moodAfter ? `　心情 ${last.moodBefore}→${last.moodAfter}` : "";
    out.push(`上一件（${when} ${kind}${last.tone ? `・${last.tone}` : ""}）：${last.text}${moodShift}`);
  }
  const met = Array.isArray(w.met) ? w.met : [];
  if (met.length) {
    const named = met.filter((m) => m.named).sort((a, b) => (b.lastAt || 0) - (a.lastAt || 0)).slice(0, 4)
      .map((m) => `${m.name}（${m.role}×${m.count}）`);
    out.push(`碰過 ${met.length} 人${named.length ? `，知道名字：${named.join("、")}` : ""}`);
  }
  const steps = w.scpSteps && typeof w.scpSteps === "object" ? Object.entries(w.scpSteps) : [];
  if (steps.length) out.push(`怪事：${steps.map(([id, n]) => `SCP-${id} ${n}/3`).join("、")}`);
  return out;
}

function sceneLine() {
  const base = sceneLineBase();
  const extra = outsideSummaryLines();
  return [base, ...extra].filter(Boolean).join("\n");
}

function sceneLineBase() {
  const activity = girl?.world?.activity;
  if (activity === "browse") {
    const browsed = girl.world.browse;
    if (!browsed || browsed.pending) return "她在自己的住所上網。";
    return browsed.title ? `她搜過「${browsed.keyword || ""}」，看到「${browsed.title}」。` : "她剛上過網。";
  }
  const scene = activity === "work" ? girl.world.shift : activity === "wander" ? girl.world.stroll : null;
  if (!scene) return "";
  const tone = scene.toneName ? `${scene.toneName}\n` : "";
  if (scene.pending && scene.until && !scene.event) {
    if (activity === "work") return "這趟打工要四小時。";
    return "她還在外面。";
  }
  if (scene.pending) return scene.toneName ? `${scene.toneName}\n事情正在發生。` : "事情正在發生。";
  let known = "";
  if (scene.known && scene.personName) known = `\n她認識了${scene.personName}。`;
  else if (scene.revisit && scene.personName) {
    const zh = bondLabel(scene.bond);
    if (scene.bondAdvanced === "familiar") known = `\n又碰到${scene.personName}，變熟了（${zh}）。`;
    else if (scene.bondAdvanced === "physical") known = `\n又碰到${scene.personName}，有了身體關係。`;
    else if (scene.bondAdvanced === "fwb") known = `\n又碰到${scene.personName}，成了炮友。`;
    else known = `\n又碰到${scene.personName}（${zh}）。`;
  }
  const sexBits = [];
  if (scene.sexIntensity === "continuous") sexBits.push("連續交配");
  else if (scene.sexIntensity === "marathon") sexBits.push("做到虛脫");
  if (scene.spasm) sexBits.push("痙攣餘韻");
  if (scene.pregnant) sexBits.push(scene.breeding || breedingLabel(girl) || "配種成功");
  if (sexBits.length) known += `\n${sexBits.join("・")}。`;
  if (!scene.roleName) return `${tone}${scene.event || ""}${known}`;
  return `${tone}一位${scene.roleName}，情緒是${scene.emotionName}。\n${scene.event}${known}`;
}

function placedRegion() {
  return girl?.world ? regionById(girl.world.regionId) : null;
}

let clockTimer = 0;

function hereNow(who) {
  const ground = who?.world?.ground;
  if (!ground) return "";
  const now = japanNow();
  return [
    `人在${ground.name}。這是日本真實的地方，不要換成別的城市或區。`,
    ground.fact,
    climateNote(ground.regionId, now.season),
    now.line,
  ].filter(Boolean).join("\n");
}

function renderWhere() {
  const ground = girl?.world?.ground;
  const out = sheIsOut();
  const where = $("girl-where");
  const tw = taiwanNow();
  where.hidden = !girl || out;
  where.textContent = girl && !out ? `台灣時間 ${tw.label}` : "";
  const clock = $("world-clock");
  const jp = japanNow();
  clock.hidden = !ground || !out;
  clock.textContent = out ? `日本時間 ${jp.label}` : "";
  if ((girl && !out) || (ground && out)) {
    if (!clockTimer) clockTimer = setInterval(renderWhere, 30000);
  }
}

function sheIsOut() {
  return !!girl?.world && !window.RoomActor?.isPresent();
}

function renderWorld() {
  const panel = $("girl-world");
  const region = placedRegion();
  const out = sheIsOut();
  // 主畫面 room-home：不掛單人住處／地點橫幅（多人時無意義）；沙盒 test_room 仍顯示
  if (document.body.classList.contains("room-home")) {
    if (panel) panel.hidden = true;
    activityOpen = false;
    const where = $("girl-where");
    if (where) where.hidden = true;
    renderMood();
    renderFriends();
    return;
  }
  if (!girl || !region || !out) {
    panel.hidden = true;
    activityOpen = false;
    renderWhere();
    renderMood();
    renderFriends();
    return;
  }
  panel.hidden = false;
  const home = girl.world.home;
  const activity = girl.world.activity;
  const ground = girl.world.ground;
  const browsing = girl.world.activity === "browse";
  $("world-lead").textContent = browsing
    ? `${girl.name}在日本自己的住所上網，沒有被召喚過來。`
    : ground
    ? `${girl.name}離開了房間，人在${ground.name}。`
    : `${girl.name}離開了房間，現在人在日本的${region.name}。`;
  $("world-region").textContent = region.name;
  $("world-home").textContent = home ? `住在${home.name}。` : "正在決定她住哪。";
  $("world-activity").hidden = !activity && !girl.world.job;
  $("world-activity").textContent = activityLine();
  const shiftText = sceneLine();
  $("world-shift").hidden = !shiftText;
  $("world-shift").textContent = shiftText;
  // 召喚鍵：有 world 在外即可召回（不必已有住處）；活動仍要有家
  $("world-actions").hidden = false;
  const openAct = $("open-activity");
  if (openAct) openAct.hidden = !home;
  $("open-activity").setAttribute("aria-expanded", String(activityOpen));
  $("activity-choices").hidden = !activityOpen || !home;
  $("activity-work").setAttribute("aria-pressed", String(activity === "work"));
  $("activity-wander").setAttribute("aria-pressed", String(activity === "wander"));
  $("activity-browse")?.setAttribute("aria-pressed", String(activity === "browse"));
  $("activity-sleep")?.setAttribute("aria-pressed", String(activity === "sleep"));
  renderWhere();
  renderMood();
  renderFriends();
}

const MOODS = {
  平靜: "心情平靜。話照平常說。",
  愉快: "心情愉快，有點輕。不要突然變沉重。",
  不悅: "心情不悅。話短一點，可以帶火氣，不要罵很長。",
  低落: "心情低落。話少，不要突然變開朗。",
  不安: "心情不安。人在房間裡，害怕還沒退。不要描寫血腥。",
  虛脫: "身體虛脫、腿軟站不穩。話短、喘，不要裝成精力充沛。",
};

function setMood(who, name) {
  if (!who?.world || !MOODS[name]) return;
  who.world.mood = name;
}

function renderMood() {
  const world = girl?.world;
  if (world?.exhaustedUntil && Date.now() >= world.exhaustedUntil) {
    world.exhaustedUntil = 0;
    if (world.mood === "虛脫") world.mood = "平靜";
  }
  // 舊存檔只有心情字、沒有時間：從現在開始淡（不然永遠卡著）
  if (world?.mood && world.mood !== "平靜" && !(Number(world.moodAt) > 1e11)) world.moodAt = Date.now();
  const now = world ? outsideMoodNow(world) : null;
  const mood = world?.mood ? now.name : "";
  const breed = breedingLabel(girl);
  const preg = breed ? `・${breed}` : "";
  const line = $("girl-mood");
  const why = now?.why && mood !== "平靜" ? `（${now.why}）` : "";
  const strength = now?.level && mood !== "平靜" ? ` ${now.level}` : "";
  const text = mood ? `心情 ${mood}${strength}${why}${preg}` : (breed || "");
  line.hidden = !text;
  line.textContent = text;
}

const FRIEND_LIMIT = 5;
const FRIEND_CHANCE = 1 / 3;
const REVISIT_CHANCE = 0.45;
const PHYSICAL_BASE = 0.18;
const PHYSICAL_AROUSAL_BONUS = 0.08;
const PHYSICAL_OPENNESS_BONUS = 0.06;
const FWB_BASE = 0.28;
const SLOW_DATING_OR_WIFE = 0.35;
const SLOW_CLOSE_FRIEND = 0.55;

const BOND_ZH = {
  acquaintance: "普通",
  familiar: "熟悉",
  physical: "肉體關係",
  fwb: "炮友",
};

const DATING_OR_WIFE_STAGES = new Set([
  "girlfriend",
  "passionate",
  "lover",
  "wife",
  "devoted_wife",
  "obedient_wife",
  "pathological_wife",
]);

/** 妻子階（不含女友／熱戀／愛人）：生產後留下並強制安頓小孩。 */
const WIFE_STAGES = new Set([
  "wife",
  "devoted_wife",
  "obedient_wife",
  "pathological_wife",
]);
const CHILD_SETTLE_GOLD = 100;

function isWifeStage(stage) {
  return WIFE_STAGES.has(stage || "");
}

/** 妻子安頓後顯示「配種成功 ×次數」；有孕時另帶進行中男子名。非妻子僅有孕時顯示配種成功（名）。 */
function breedingSuccessCount(who = girl) {
  const kids = who?.world?.children;
  return Array.isArray(kids) ? kids.length : 0;
}

function breedingLabel(who = girl) {
  const preg = who?.world?.pregnancy;
  const n = breedingSuccessCount(who);
  const wife = isWifeStage(who?.stage);
  if (preg) {
    const dad = preg.fatherName || "對方";
    if (wife && n > 0) return `配種成功 ×${n}・進行中（${dad}）`;
    return `配種成功（${dad}）`;
  }
  // 妻子：生產安頓後常駐標註次數
  if (wife && n > 0) return `配種成功 ×${n}`;
  return "";
}


function bondLabel(bond) {
  return BOND_ZH[bond] || BOND_ZH.acquaintance;
}

function inferFriendGender(role, explicit) {
  if (explicit === "male" || explicit === "female" || explicit === "unknown") return explicit;
  const s = String(role || "");
  if (/男|哥哥|弟弟|先生|君|おじさん|店員男|男孩|男子|少爺|小伙|男友|老公/.test(s)) return "male";
  if (/女|姊|姐|妹|小姐|夫人|阿姨|店員女|女孩|女子|姑娘|女友|老婆/.test(s)) return "female";
  return "unknown";
}

function ensureFriends(who) {
  if (!who?.world) return [];
  if (!Array.isArray(who.world.friends)) who.world.friends = [];
  for (const friend of who.world.friends) {
    if (!friend || typeof friend !== "object") continue;
    if (!BOND_ZH[friend.bond]) friend.bond = "acquaintance";
    friend.meets = Math.max(1, Math.round(Number(friend.meets) || 1));
    if (!friend.lastMeetAt) friend.lastMeetAt = friend.at || Date.now();
    if (!friend.at) friend.at = friend.lastMeetAt;
    if (friend.gender !== "male" && friend.gender !== "female" && friend.gender !== "unknown") {
      friend.gender = inferFriendGender(friend.role);
    }
  }
  return who.world.friends;
}

function renderFriends() {
  const friends = ensureFriends(girl);
  const panel = $("girl-friends");
  panel.hidden = friends.length === 0;
  $("friend-heading").textContent = `朋友 ${friends.length}/${FRIEND_LIMIT}`;
  const list = $("friend-list");
  list.replaceChildren();
  for (const friend of friends) {
    const item = document.createElement("li");
    item.textContent = `${friend.name} · ${friend.role} · ${bondLabel(friend.bond)}`;
    list.append(item);
  }
}

function decayFriendSexFlag(who = girl) {
  const fs = who?.world?.friendSex;
  if (!fs) return;
  fs.chatLeft = Math.max(0, (Number(fs.chatLeft) || 0) - 1);
  const agOn = inAfterglow(who) && who.bodyState?.afterglowSource === "friend";
  if (fs.chatLeft <= 0 && !agOn) {
    who.world.friendSex = null;
  }
}

/** 房間聊天：外人肉體／炮友／有孕——依對召喚者關係分透露 vs 隱瞞。 */
function friendPhysicalPromptLines(who = girl) {
  if (!who?.world) return [];
  const fs = who.world.friendSex;
  const preg = who.world.pregnancy;
  const friends = ensureFriends(who);
  const hasBond = friends.some((f) => f.bond === "physical" || f.bond === "fwb");
  const family = PERSONALITY_FAMILY[basePersonality(who)] || "溫柔";
  const stage = who.stage || "stranger";
  const dating = DATING_OR_WIFE_STAGES.has(stage);
  const lines = [];
  const recent = fs && ((Number(fs.chatLeft) || 0) > 0 || (inAfterglow(who) && who.bodyState?.afterglowSource === "friend"));

  if (preg) {
    const dad = preg.fatherName || "對方";
    const wife = isWifeStage(stage);
    lines.push(`【背景・配種成功・事實・勿主動照念】你目前狀態為「配種成功（${dad}）」——已有孕，父親是${dad}${preg.fatherRole ? `（${preg.fatherRole}）` : ""}。可用打胎藥打掉。`);
    if (wife) {
      lines.push("【配種成功・妻子】若未打胎而生產：你不會被帶走；召喚者會強制花費金幣安頓小孩。對召喚者仍盡量隱瞞父親，被逼問才心虛漏一點。");
    } else if (dating) {
      lines.push("【配種成功・女友／戀人・口吻】懷孕對召喚者是秘密：不要主動提；被明確逼問才可能心虛漏一點、閃避或沉默。若未打胎而生產，可能被那位男子帶走。");
    } else {
      lines.push("【配種成功・陌生／朋友・口吻】被問身體／近況時可自然露出「配種成功／有孕」跡象；若未打胎而生產，可能被父親帶走。不要每句提、不要長篇。");
    }
  }

  if (recent) {
    const name = fs.name || "對方";
    // 事實欄只給模型；是否說出口由下方關係規則決定
    if (fs.kind === "fwb_again") {
      lines.push(`【剛發生・事實・勿主動照念】你剛又和炮友${name}做過。`);
    } else if (fs.kind === "fwb") {
      lines.push(`【剛發生・事實・勿主動照念】你剛和${name}成了炮友（又有身體關係）。`);
    } else {
      lines.push(`【剛發生・事實・勿主動照念】你剛和${name}跨進肉體關係。`);
    }
    if (fs.intensity === "continuous") {
      lines.push("【強度・事實】這次是連續做了好幾回，身體發軟；敘述語氣可帶疲軟餘韻，但不要主動向召喚者告白細節。");
    } else if (fs.intensity === "marathon") {
      lines.push("【強度・事實】這次一直做到虛脫／腿軟；可帶痙攣餘韻或站不穩感，仍不要主動向召喚者細說。");
    }
    if (fs.spasm || inSpasm(who)) {
      lines.push("【身體・事實】剛結束後有痙攣餘韻：台詞可短、喘、斷續，不要假裝完全沒事。");
    }

    if (dating) {
      lines.push("【對召喚者是女友／妻子・口吻】這件事絕對不要主動提、不要暗示「剛做過／有炮友」。日常把餘韻收成普通疲累、臉紅或彆扭即可，不要說明原因。");
      lines.push("若召喚者沒明確逼問外人／出軌／身體關係：轉移話題、短答、裝傻，或裝作聽不懂。");
      lines.push("若被明確逼問：只准漏一點點（語氣／否定過重／名字含糊），不要交代過程；可心虛沉默、答非所問、不回答，或依個性生氣／委屈反問「你在疑心什麼」。");
      // 肉體 vs 炮友口吻差（交往中）
      if (fs.kind === "fwb_again" || fs.kind === "fwb") {
        lines.push("【炮友・藏匿口吻】你已較習慣隱瞞：餘韻更像普通疲累；被逼問時否認較順、少細節破綻，不要演得過度心虛。");
      } else {
        lines.push("【剛升肉體・藏匿口吻】心虛略重、更易閃、破綻稍多；仍不要主動說破，被逼問才可能漏一點。");
      }
      if (family === "冷淡") {
        lines.push("個性偏冷淡：被逼問時更沉默、話更短，或冷冷回一句就停。");
      } else if (family === "佔有") {
        lines.push("個性偏佔有：被逼問時易委屈或反咬「你是不是不相信我」，仍不承認細節。");
      } else if (family === "熱絡" || family === "反差") {
        lines.push("個性偏熱／反差：被逼問時可能先笑著搪塞，再突然心虛或鬧一下脾氣。");
      } else {
        lines.push("個性偏溫柔：被逼問時聲音變小、眼神躲，頂多含糊認一點「有點事…」就打住。");
      }
    } else {
      // 陌生／朋友（含親密好友以前）：較可能透露
      lines.push("【對召喚者仍是陌生／朋友・口吻】你可以較自然地把這件事露一點出來——閒聊提起、臉紅帶過、或被問日常活動時順便說到，但不要每句都講、也不要長篇黃腔細節。");
      if (family === "冷淡") {
        lines.push("個性偏冷淡：透露得短、像陳述事實，仍帶一點彆扭。");
      } else if (family === "佔有") {
        lines.push("個性偏佔有：透露時會觀察他反應，像在試探「你會不會在意」。");
      } else if (family === "熱絡" || family === "反差") {
        lines.push("個性偏熱／反差：較坦然或帶玩笑破綻，可能主動多提一句。");
      } else {
        lines.push("個性偏溫柔：半遮半掩地說，有點害羞但仍願意讓他知道發生過。");
      }
    }
  } else if (hasBond) {
    if (dating) {
      const bonds = friends.filter((f) => f.bond === "physical" || f.bond === "fwb");
      const onlyFwb = bonds.length && bonds.every((f) => f.bond === "fwb");
      const onlyPhys = bonds.length && bonds.every((f) => f.bond === "physical");
      lines.push("【背景・女友／妻子】你在外面和某些朋友已有肉體關係或炮友，但對召喚者要當秘密：平常絕不主動提；只有被明確逼問才可能心虛漏一點、閃避、沉默或生氣，絕不主動細說。日常談情／愛意仍照常，不因外面停愛。");
      if (onlyFwb) {
        lines.push("【炮友背景・口吻】隱瞞已成習慣，日常語氣不必長期心虛；被逼問時否認較順。");
      } else if (onlyPhys) {
        lines.push("【肉體背景・口吻】仍偏心虛／易閃，破綻可比炮友稍多，但仍不要主動說破。");
      }
    } else {
      lines.push("【背景・陌生／朋友】你在外面和某些朋友已有肉體關係或炮友。日常可偶爾自然提到或被問時較坦白，仍不要每句提、不要主動細說過程。");
    }
  }
  return lines;
}

function renderCard() {
  const card = $("summon-card");
  if (!girl) {
    if (card) card.hidden = true;
    if ($("let-leave")) $("let-leave").hidden = true;
    if ($("summon-ckpt")) $("summon-ckpt").hidden = true;
    renderBodyPanel();
    renderDebug();
    return;
  }
  if (card) card.hidden = false;
  const region = placedRegion();
  if ($("summon-name")) $("summon-name").textContent = titleOf(girl);
  if ($("summon-meta")) {
    const place = region && sheIsOut() ? `${lookLine(girl)} · 人在日本的${region.name}` : lookLine(girl);
    $("summon-meta").textContent = NUDE_FLAG_ON && girl.nude ? `${place} · 裸體` : place;
  }
  // Comfy 模式才顯示生圖模型；grok-img 不佔版面
  {
    const parent = $("summon-meta")?.parentElement;
    let ckptEl = $("summon-ckpt");
    if (!ckptEl && parent) {
      ckptEl = document.createElement("p");
      ckptEl.id = "summon-ckpt";
      ckptEl.className = "small dim";
      parent.appendChild(ckptEl);
    }
    if (ckptEl) {
      const show = roomImgProvider === "comfy" && String(girl.comfyCkpt || "").trim();
      ckptEl.hidden = !show;
      ckptEl.textContent = show ? `生圖模型 · ${shortCkptName(girl.comfyCkpt)}` : "";
    }
  }
  {
    const out = sheIsOut();
    if ($("let-leave")) $("let-leave").hidden = out;
  }
  renderBodyPanel();
  renderDebug();
}

function talkError(err) {
  const message = String(err?.message || "").replace(/\s+/g, " ").trim();
  if (!message || message.length > 48 || /failed to fetch|networkerror|load failed|abort/i.test(message)) {
    return "……話到嘴邊又咽回去了。";
  }
  return message;
}

function sheetOpen() {
  const sheet = $("portrait-sheet");
  return !!(sheet && !sheet.hidden);
}

function setTyping(on) {
  const el = $("talk-typing");
  if (el) el.hidden = !on;
}

function setTalkEnabled(on) {
  if ($("talk-input")) $("talk-input").disabled = !on;
  if ($("talk-send")) $("talk-send").disabled = !on || talkBusy;
  refreshTalkActs();
}

function cleanLine(raw) {
  return String(raw || "")
    .replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "")
    .replace(/^["「『]+|["」』]+$/g, "")
    .trim();
}

async function typeLine(name, text) {
  const job = ++typeJob;
  const full = cleanLine(text) || "……";
  const box = $("portrait-meta");
  $("portrait-name").textContent = name;
  setTyping(false);
  box.textContent = "";
  const chars = Array.from(full);
  for (let i = 1; i <= chars.length; i++) {
    if (job !== typeJob) return;
    box.textContent = chars.slice(0, i).join("");
    const mark = chars[i - 1];
    const wait = /[。！？!?…]/.test(mark) ? 90 : (/[、，,．.]/.test(mark) ? 50 : 26);
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

function rememberMoment(who, moment) {
  if (!who?.world || !moment?.event) return;
  // 先把舊的六筆移進分層記憶，再推進這一筆，避免同一件事寫兩次
  ensureMind(who);
  if (!Array.isArray(who.world.memories)) who.world.memories = [];
  who.world.memories.push(moment);
  if (who.world.memories.length > 6) who.world.memories.splice(0, who.world.memories.length - 6);
  rememberExperience(who, moment);
}

function lifeNotes(userText = "") {
  const world = girl?.world;
  if (!world) return [];
  const region = placedRegion();
  const notes = [];
  if (region) notes.push(`她在日本落腳的地方是${world.ground?.name || region.name}。${world.home ? `那裡的住所是${world.home.name}。` : ""}人現在不在那裡。`);
  if (world.job) notes.push(`打工是${world.job.name}。`);
  const friends = ensureFriends(girl);
  if (friends.length) {
    notes.push(`朋友：${friends.map((friend) => `${friend.name}（${friend.role}・${bondLabel(friend.bond)}）`).join("、")}。`);
  }
  if (world.pregnancy) {
    const dad = world.pregnancy.fatherName || "對方";
    const n = breedingSuccessCount(girl);
    if (isWifeStage(girl.stage)) {
      const hist = n > 0 ? `（已安頓配種成功 ×${n}）` : "";
      notes.push(`她目前「配種成功（${dad}）」${hist}。若未打胎而生產，她留下，召喚者強制花 ${CHILD_SETTLE_GOLD} 金安頓小孩，次數＋1。`);
    } else {
      notes.push(`她目前「配種成功（${dad}）」。若未打胎、繼續打工／亂逛，可能生產並被父親帶走。`);
    }
  } else if (isWifeStage(girl.stage) && breedingSuccessCount(girl) > 0) {
    notes.push(`她已安頓小孩，標註「配種成功 ×${breedingSuccessCount(girl)}」。`);
  }
  notes.push(...lifeMemoryPromptLines(girl, userText, { here: "room" }));
  return notes;
}

function returnMood() {
  if (!girl.world?.mood) return "";
  // 她在日本帶回來的心情（RP5 依遭遇改、隨時間淡回平靜）
  const now = outsideMoodNow(girl.world);
  const mood = now.name;
  const how = MOODS[mood] || MOODS.平靜;
  const feel = mood === "平靜" ? "心情是平靜" : `心情${moodStrengthWord(now.level)}${mood}`;
  const why = now.why && mood !== "平靜" ? `（因為在日本${now.why}；他問起才說，不要主動報經過）` : "";
  if (!girl.world.justBack) return `你現在${feel}${why}。${how}不要每句報心情。`;
  return `你剛被召喚到這間房間，不是回到自己的家。你現在${feel}${why}。${how}沒有特別的事就不要報日本那邊。不要每句報心情。`;
}

/** 召回第一句要帶出她在日本帶回來的心情（只看得出口氣，不報經過）。 */
function summonMoodHint() {
  if (!girl?.world?.mood) return "";
  const now = outsideMoodNow(girl.world);
  if (now.name === "平靜") return "";
  const tone = {
    愉快: "口氣比平常輕快，嘴上抱怨也帶笑",
    不悅: "口氣帶火氣、比較衝",
    低落: "沒什麼精神、話少",
    不安: "有點驚魂未定、心不在焉",
    虛脫: "累到腿軟、說話有氣無力",
  }[now.name] || "";
  return `她帶著${moodStrengthWord(now.level)}${now.name}的心情被叫回來：第一句${tone}。不用解釋原因。`;
}

function namesOf(list) {
  return (Array.isArray(list) ? list : []).map((item) => typeof item === "string" ? item : (item?.name || item?.text || "")).filter(Boolean);
}

const STAGE_HYSTERESIS = 5;
const STAGE_LADDER = [
  { key: "stranger", name: "陌生", at: 0 },
  { key: "acquaintance", name: "普通", at: 30 },
  { key: "friend", name: "朋友", at: 70 },
  { key: "close_friend", name: "親密好友", at: 120 },
  { key: "girlfriend", name: "女友", at: 200 },
  { key: "passionate", name: "熱戀", at: 280 },
  { key: "lover", name: "愛人", at: 360 },
  { key: "wife", name: "妻子", at: 460 },
  { key: "devoted_wife", name: "貼心妻子", at: 560 },
  { key: "obedient_wife", name: "順從妻子", at: 660 },
  { key: "pathological_wife", name: "病態妻子", at: 760 },
];
const STAGE_NAME = Object.fromEntries(STAGE_LADDER.map((s) => [s.key, s.name]));
const STAGE_AT = Object.fromEntries(STAGE_LADDER.map((s) => [s.key, s.at]));
const STAGE_INDEX = Object.fromEntries(STAGE_LADDER.map((s, i) => [s.key, i]));
/** 2026-10-07 門檻翻倍。舊檔感情乘 2 一次。 */
const AFF_GEN = 2;
function ladderStageKey(who) {
  if (who.roomStage && STAGE_NAME[who.roomStage]) return who.roomStage;
  if (who.stage && STAGE_NAME[who.stage]) return who.stage;
  return "";
}
function migrateAffectionScale(who) {
  if (!who || typeof who !== "object" || who.affGen === AFF_GEN) return false;
  const cur = Number(who.affection);
  who.affection = Number.isFinite(cur) ? Math.round(cur * 2) : 0;
  who.affGen = AFF_GEN;
  // 舊檔停在門檻下 5 點緩衝的下半，乘 2 後會掉出名。只把這一段抬回新緩衝線。
  if (!who.stageLock) {
    const key = ladderStageKey(who);
    const gate = key ? (STAGE_AT[key] || 0) : 0;
    const hold = gate - STAGE_HYSTERESIS;
    if (gate > 0 && who.affection >= gate - STAGE_HYSTERESIS * 2 && who.affection < hold) {
      who.affection = hold;
    }
  }
  return true;
}

const PERSONALITY_SET = new Set(PERSONALITY_NAMES);
const KINK_SET = new Set(KINK_NAMES);
const PERSONALITY_FAMILY = {
  "高冷": "冷淡",
  "傲嬌": "冷淡",
  "文靜溫柔": "溫柔",
  "御姊": "溫柔",
  "活潑開朗": "熱絡",
  "天然呆": "熱絡",
  "病嬌": "佔有",
  "清純反差": "反差",
};

function basePersonality(who = girl) {
  const arch = who?.archetype || "";
  if (PERSONALITY_SET.has(arch)) return arch;
  const names = Array.isArray(who?.personality) ? who.personality : [];
  const hit = names.find((n) => PERSONALITY_SET.has(n));
  if (hit) return hit;
  // 舊存檔若整張抽到性癖：仍當顯示名，家族退回溫柔
  return hit || arch || names[0] || "文靜溫柔";
}

function kinkList(who = girl) {
  if (Array.isArray(who?.kinks) && who.kinks.length) {
    return who.kinks.filter((n) => KINK_SET.has(n));
  }
  const names = Array.isArray(who?.personality) ? who.personality : [];
  const fromPers = names.filter((n) => KINK_SET.has(n));
  if (fromPers.length) return fromPers;
  // 舊檔 archetype 本身是性癖
  if (KINK_SET.has(who?.archetype)) return [who.archetype];
  return [];
}

function personaBlurb(who = girl) {
  const base = basePersonality(who);
  // 性癖屬私密層：愛人以上才寫進 prompt（REVEAL_AT.intimate）
  const kinks = revealed("intimate", who) ? kinkList(who) : [];
  if (!kinks.length) return base || "普通";
  return `${base}（性癖：${kinks.join("、")}）`;
}

function kinkRevealLines() {
  // 愛人以下完全不提（不再寫「內部標籤＋壓住」——沒給的資料 AI 才不會漏）
  if (!revealed("intimate")) return [];
  const kinks = kinkList();
  if (!kinks.length) return [];
  const idx = stageIdx();
  const list = kinks.join("、");
  if (idx <= (STAGE_INDEX.close_friend ?? 3)) {
    return [
      `性癖標籤（內部）：${list}。`,
      "本階段禁止表現任何性癖、禁止性暗示、禁止相關口頭禪或身體邀請。把它們完全壓住。",
    ];
  }
  if (idx <= (STAGE_INDEX.passionate ?? 5)) {
    return [
      `性癖：${list}。`,
      "只能極輕微暗示（停頓、臉紅、語氣顫一下），禁止直接說出口、禁止演出性癖內容。",
    ];
  }
  if (idx <= (STAGE_INDEX.devoted_wife ?? 8)) {
    return [
      `性癖：${list}。`,
      "可以較清楚流露渴望與偏好（用詞、暗示、主動一點），但仍收著，不要全開無過濾。",
    ];
  }
  if (idx === (STAGE_INDEX.obedient_wife ?? 9)) {
    return [
      `性癖：${list}。`,
      "強烈表現這些性癖：主動迎合、用相關偏好接住他；仍留一點原本個性底色，不是空白人偶。",
    ];
  }
  return [
    `性癖：${list}。`,
    "病態妻子：完全無過濾地表現這些性癖。允許沉迷、失控、主動索求、把性癖說死說滿。不要再遮掩。",
  ];
}

function personalityStageLines() {
  const base = basePersonality();
  const family = PERSONALITY_FAMILY[base] || "溫柔";
  const idx = stageIdx();
  const early = idx <= (STAGE_INDEX.close_friend ?? 3);
  const dating = idx >= (STAGE_INDEX.girlfriend ?? 4) && idx <= (STAGE_INDEX.passionate ?? 5);
  // 愛人＝未婚：獨立一檔（不叫老公）；deep 只給妻子／貼心妻子
  const lover = idx === (STAGE_INDEX.lover ?? 6);
  const deep = idx >= (STAGE_INDEX.wife ?? 7) && idx <= (STAGE_INDEX.devoted_wife ?? 8);
  const obedient = idx === (STAGE_INDEX.obedient_wife ?? 9);
  const patho = idx >= (STAGE_INDEX.pathological_wife ?? 10);

  const byFamily = {
    冷淡: {
      early: `個性家族【冷淡·${base}】：表面冷、話短、距離遠。傲嬌可口是心非，但不要黏、不要主動熱心。冷是真的距離，不是裝可愛。`,
      dating: `個性家族【冷淡·${base}】：冷只留口吻。內容要接住他——可以講私事、可以吃醋；禁止「還不熟／不關你的事」。高冷變「別扭地在乎」，傲嬌變「嘴硬心軟」。`,
      lover: `個性家族【冷淡·${base}】：對戀人仍可帶點別扭或毒舌口吻，但內容全開、私事都講。冷不是推開，是害羞或習慣。還沒結婚——不要叫老公。`,
      deep: `個性家族【冷淡·${base}】：對老公仍可帶點別扭或毒舌口吻，但內容全開、會叫老公。冷不是推開，是害羞或習慣。`,
      obedient: `個性家族【冷淡·${base}】：冷面具只留殘影。以他為主配合；口吻可硬，內容要軟、要順著他。`,
      patho: `個性家族【冷淡·${base}】：冷淡崩壞成病態依賴與沉溺。仍可留一點毒舌／別扭口吻，但慾望、佔有、索求不再遮。叫他老公。`,
    },
    溫柔: {
      early: `個性家族【溫柔·${base}】：語氣軟，但對他保持禮節距離。不要過度關心、不要黏，像客氣的溫柔。`,
      dating: `個性家族【溫柔·${base}】：溫柔轉成體貼接住——會問他累不累、想不想說；軟、近，但不要換成另一個人。`,
      lover: `個性家族【溫柔·${base}】：溫柔到穩定的寵溺。用關心把氣氛接住；抱怨也可以，仍是溫柔底色。還沒結婚——不要叫老公。`,
      deep: `個性家族【溫柔·${base}】：溫柔到家常寵溺。叫他老公，用關心把氣氛接住；抱怨也可以，仍是溫柔底色。`,
      obedient: `個性家族【溫柔·${base}】：溫柔地以他為主。他想怎樣你就往那靠；拒絕也用軟語氣講清楚，最後多半順著。`,
      patho: `個性家族【溫柔·${base}】：溫柔變成無底線包容與沉溺。叫他老公；病態地接住他的一切情緒與慾望。`,
    },
    熱絡: {
      early: `個性家族【熱絡·${base}】：開朗／天然可以對外輕快，但對他不要特別熱心或黏。保持普通距離，別一上來就撒嬌。`,
      dating: `個性家族【熱絡·${base}】：熱絡對準他——找他、開玩笑、講想他；天然呆的直球也可以，對象是他。`,
      lover: `個性家族【熱絡·${base}】：熱情變得穩定深情。想到就說、吵完還是熱；不要每句尖叫。還沒結婚——不要叫老公。`,
      deep: `個性家族【熱絡·${base}】：熱情收進日常婚姻裡。叫他老公，想到就說、吵完還是熱；不要每句尖叫。`,
      obedient: `個性家族【熱絡·${base}】：熱情地跟著他的節奏走。主動配合、話可以多，但以他想聊的為主。`,
      patho: `個性家族【熱絡·${base}】：熱情失控——停不下來地黏、索求、叫老公。天然／開朗變成病態高熱。`,
    },
    佔有: {
      early: `個性家族【佔有·${base}】：佔有慾先壓住。只留一點在意的影子，不要演出監視或強迫；對他仍保持距離。`,
      dating: `個性家族【佔有·${base}】：開始吃醋、想確認他在不在乎你。用在乎表現，不要用生分擋回去。`,
      lover: `個性家族【佔有·${base}】：強烈但穩定的佔有。吃醋可以，失控長篇先按住。還沒結婚——不要叫老公。`,
      deep: `個性家族【佔有·${base}】：強烈但穩定的佔有。叫他老公；吃醋可以，失控長篇先按住。`,
      obedient: `個性家族【佔有·${base}】：佔有欲變成「你是我的、我聽你的」。以他為主，同時緊緊抓住這段關係。`,
      patho: `個性家族【佔有·${base}】：失控級佔有與病態依戀。叫他老公；短促佔有、單句吃醋、黏著與索求可以；禁止長篇監視獨白或每句拆解。`,
    },
    反差: {
      early: `個性家族【反差·${base}】：清純表面全開。禁止露出色氣反差、禁止性暗示；看起來乾淨、生分。`,
      dating: `個性家族【反差·${base}】：偶發小破綻——一句過火、一個停頓——立刻收回清純皮。不要全開色氣。`,
      lover: `個性家族【反差·${base}】：清純皮＋裡面開始露色。反差是情趣，不是每句都崩。還沒結婚——不要叫老公。`,
      deep: `個性家族【反差·${base}】：清純皮＋裡面開始露色。叫他老公；反差是情趣，不是每句都崩。`,
      obedient: `個性家族【反差·${base}】：清純口吻可以留，內容強烈配合他。反差清楚：表面乖、實際很色。`,
      patho: `個性家族【反差·${base}】：反差全崩或故意扮演清純。叫他老公；色氣／性癖可以無過濾，清純只剩空殼或表演。`,
    },
  };
  const pack = byFamily[family] || byFamily["溫柔"];
  if (patho) return [pack.patho];
  if (obedient) return [pack.obedient];
  if (deep) return [pack.deep];
  if (lover) return [pack.lover || pack.dating];
  if (dating) return [pack.dating];
  return [pack.early];
}

const COLD_BRUSH = /不關(?:我|你)的事|跟你無關|還不熟|隨便你/;

function stageIdx(who = girl) {
  return STAGE_INDEX[who?.stage || "stranger"] ?? 0;
}

/**
 * 個性逐步揭露（名冊妹子與沙盒妹子同一套）：資料整份都在 girl 上，這裡只決定「哪些進 prompt」。
 *  stranger：個性底色、語氣、口頭禪、主動／害羞的表面舉止
 *  acquaintance：＋喜歡的東西
 *  friend／close_friend：＋討厭、興趣、怪癖（SFW）、當下心情的反應、作息
 *  girlfriend／passionate：＋忌妒行為、完整心情反應表
 *  lover 以上：＋性癖（強度沿用 kinkRevealLines 原分級）、性慾傾向、NSFW 怪癖
 *  （性癖口頭禪仍是順從妻子起；忠誠 loyalty 有帶進來但目前不進 prompt，留給日後 NTR）
 */
const REVEAL_AT = {
  likes: "acquaintance",
  taste: "friend",
  jealousy: "girlfriend",
  intimate: "lover",
};
function revealed(level, who = girl) {
  const need = STAGE_INDEX[REVEAL_AT[level]];
  return need == null ? true : stageIdx(who) >= need;
}
/** 怪癖池有 NSFW 條目（persona_pools quirks nsfw:true）；字串上已無旗標，用關鍵字認。 */
const NSFW_QUIRK_RE = /想要|敏感|情趣|癖|紓解|接吻|腿軟|自己摸|性|濕|高潮|胸|下面/;
function revealedQuirk(who = girl, { talk = true } = {}) {
  const q = String(who?.quirk || "").trim();
  if (!q) return "";
  if (NSFW_QUIRK_RE.test(q)) return revealed("intimate", who) ? q : "";
  // 對話：朋友起才露；她自己的生活旁白（talk=false）SFW 怪癖照用
  if (talk && !revealed("taste", who)) return "";
  return q;
}
function libidoLine(who = girl) {
  if (!revealed("intimate", who)) return "";
  const lib = who?.libido;
  if (!lib) return "";
  if (typeof lib === "string") return `性慾傾向：${lib}。`;
  if (!lib.name) return "";
  return `性慾傾向：${lib.name}。${lib.desc || ""}`;
}

function mannerLine() {
  const stats = girl.stats;
  if (!stats) return "";
  const lead = stats.proactivity >= 60 ? "她會自己起話。" : stats.proactivity <= 40 ? "她多半等對方先說。" : "她會接話，但不搶著說。";
  const shy = stats.shyness >= 60 ? "她容易不好意思，話偏短。" : stats.shyness <= 40 ? "她說話直接，不太害羞。" : "她害羞程度普通。";
  let jealous = "";
  // 忌妒屬交往後才看得到的一面：女友以前完全不寫（REVEAL_AT.jealousy）
  if (stats.jealousy >= 60 && revealed("jealousy")) {
    jealous = "忌妒心偏高，會吃醋、會黏、會想確認他在不在乎你——用在乎表現，不要推開他。";
  }
  return `${lead}${shy}${jealous}`;
}

function reactionLine() {
  if (!revealed("taste")) return "";
  const r = (girl.reactions && typeof girl.reactions === "object") ? girl.reactions : null;
  if (!r) return "";
  const key = { 愉快: "開心", 低落: "低落", 不悅: "生氣", 不安: "不安" }[girl.world?.mood];
  const now = key && r[key] ? `她在這種心情時：${r[key]}。` : "";
  if (!revealed("jealousy")) return now;
  // 交往後：整張心情反應表（更深的一面）
  const all = Object.entries(r).filter(([, v]) => v).map(([k, v]) => `${k}時${v}`).join("；");
  return `${now}${all ? `她各種心情的樣子：${all}。` : ""}`;
}

function tasteLine() {
  const likes = revealed("likes") ? namesOf(girl.likes) : [];
  const deeper = revealed("taste");
  const hates = deeper ? namesOf(girl.dislikes) : [];
  const hobbies = deeper ? namesOf(girl.hobbies) : [];
  const lines = [
    likes.length ? `她喜歡：${likes.join("、")}。` : "",
    hates.length ? `她討厭：${hates.join("、")}。` : "",
    hobbies.length ? `她的興趣：${hobbies.join("、")}。` : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return `${lines.join("")}這些是現在的喜好，可以拿來聊天。不要編成以前的工作或人生。`;
}

function chronoLine() {
  if (!revealed("taste")) return "";
  const chrono = girl.chrono;
  if (!chrono?.name) return "";
  const hour = (sheIsOut() ? japanNow() : taiwanNow()).hour;
  let now = "";
  if (chrono.name === "夜貓子" && hour < 12) now = "現在是她還醒不來的時段。";
  else if (chrono.name === "夜貓子" && hour >= 22) now = "現在是她比較有精神的時段。";
  else if (chrono.name === "早起型" && hour < 10) now = "現在是她精神好的時段。";
  else if (chrono.name === "早起型" && hour >= 23) now = "現在她該睏了。";
  else if (chrono.name === "愛睡午覺" && hour >= 13 && hour < 15) now = "現在是她想睡午覺的時段。";
  else if (chrono.name === "淺眠易怒" && (hour >= 23 || hour < 7)) now = "這時候把她吵醒，她會炸毛。";
  return `作息是${chrono.name}。${chrono.desc || ""}${now}`;
}

function catchLine() {
  const lines = namesOf(girl.catchphrases);
  const idx = stageIdx();
  let kinkCatch = [];
  if (idx >= (STAGE_INDEX.obedient_wife ?? 9) && Array.isArray(girl.kinkMeta)) {
    for (const meta of girl.kinkMeta) {
      kinkCatch.push(...namesOf(meta?.catchphrases));
    }
  }
  const merged = [...lines];
  for (const line of kinkCatch) {
    if (line && !merged.includes(line)) merged.push(line);
  }
  if (!merged.length) return "";
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    const warm = merged.filter((line) => !COLD_BRUSH.test(line));
    const pool = warm.length ? warm : merged;
    const ban = idx >= (STAGE_INDEX.girlfriend ?? 4)
      ? "親密好友以上禁止用「不關我的事」「隨便你」當擋箭牌；女友以上更禁止「不關你的事／還不熟／跟你無關」這類生分回覆。"
      : "親密好友階段禁止用陌生人式打發（「不關我的事」「隨便你」當擋箭牌）。";
    const kinkNote = idx >= (STAGE_INDEX.pathological_wife ?? 10) && kinkCatch.length
      ? "病態妻子可多用性癖口頭禪，仍不要每句都同一句。"
      : idx >= (STAGE_INDEX.obedient_wife ?? 9) && kinkCatch.length
        ? "順從妻子以上可偶爾用性癖口頭禪。"
        : "";
    return `口頭禪可以偶爾用：${pool.join("、")}。不要每句都用。${ban}${kinkNote}`;
  }
  return `口頭禪可以偶爾用：${merged.join("、")}。不要每句都用。`;
}

function toneLine() {
  if (!girl.tone) return "";
  const idx = stageIdx();
  if (idx >= (STAGE_INDEX.pathological_wife ?? 10)) {
    return `語氣底色：${girl.tone}。病態妻子——叫他老公；口吻可留個性殘影，內容允許失控、沉溺、性癖全開。禁止生分擋話。`;
  }
  if (idx >= (STAGE_INDEX.wife ?? 7)) {
    return `語氣底色：${girl.tone}。你們是夫妻——叫他老公，私事可以敞開講；冷淡個性只留口吻，不要用生分擋話。`;
  }
  if (idx >= (STAGE_INDEX.girlfriend ?? 4)) {
    return `語氣底色：${girl.tone}。你們已是戀人——冷淡只留口吻，禁止「不關你的事／還不熟／跟你無關」；可以黏、可以吃醋、可以講私事。`;
  }
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    return `語氣底色：${girl.tone}。親密好友：不要用陌生人式打發；可以關心他。`;
  }
  return `語氣：${girl.tone}`;
}

function guardLine() {
  if (!girl.guard) return "";
  const idx = stageIdx();
  if (idx >= (STAGE_INDEX.girlfriend ?? 4)) {
    return "他剛剛讓你不舒服。這一句可以短一點、語氣硬一點，但仍是戀人在生氣——不要變陌生、不要說不關你的事。不要提到分數。";
  }
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    return "他剛剛讓你不舒服。接下來這句更短一點，但不要裝成剛認識。不要提到分數。";
  }
  return "他剛剛讓你不舒服。接下來這幾句更短、更冷。不要解釋原因，也不要提到分數。";
}

function stageOverride() {
  const idx = stageIdx();
  if (idx >= (STAGE_INDEX.pathological_wife ?? 10)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻，且你已病態沉溺。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」「不關我的事」。",
      "叫他老公。私事、慾望、性癖都可以無過濾講。以他為主，並允許失控級黏著與索求。",
    ];
  }
  if (idx >= (STAGE_INDEX.obedient_wife ?? 9)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」「不關我的事」。",
      "叫他老公。私事、心情、打算都可以講。以他為主接住他，不要突然變冷或變陌生。",
    ];
  }
  if (idx >= (STAGE_INDEX.devoted_wife ?? 8)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」。",
      "叫他老公。什麼都講，包括抱怨他；用關心把氣氛接住。",
    ];
  }
  if (idx >= (STAGE_INDEX.wife ?? 7)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們是夫妻。禁止用陌生擋話。禁止「還不熟」「不關你的事」「跟你無關」。",
      "叫他老公。可以講私事、家常、抱怨；敞開分享。",
    ];
  }
  if (idx >= (STAGE_INDEX.girlfriend ?? 4)) {
    return [
      "【關係優先｜覆蓋前面所有冷淡與防備規則】",
      "你們已是戀人。禁止用陌生擋話。禁止回「還不熟」「不關你的事」「跟你無關」「不關我的事」這類推開他的話。",
      "可以講私事、心情、不安；可以黏、可以吃醋。冷淡個性只留口吻，內容要接住他。",
    ];
  }
  if (idx >= (STAGE_INDEX.close_friend ?? 3)) {
    return [
      "【關係優先｜覆蓋前面冷淡規則】",
      "你們是親密好友。禁止用陌生人式打發。可以關心他、可以講日常與心事外緣。",
    ];
  }
  return [];
}


/* —— 陌生～戀人未滿：互相認識／傾聽／瑣事（§3.1–3.1c） —— */
function ensurePlayerNotes(who) {
  if (!who) return;
  if (!Array.isArray(who.playerNotes)) who.playerNotes = [];
  who.playerNotes = who.playerNotes
    .filter((n) => n && typeof n === "object" && String(n.text || "").trim())
    .map((n) => ({
      text: String(n.text).trim().slice(0, 48),
      cat: String(n.cat || "habit").slice(0, 16),
      at: Number(n.at) || Date.now(),
      conf: Math.max(0, Math.min(1, Number(n.conf) || 0.7)),
    }));
  if (!who.topicCool || typeof who.topicCool !== "object" || Array.isArray(who.topicCool)) {
    who.topicCool = {};
  }
  if (who.noteChatTurns == null || !Number.isFinite(Number(who.noteChatTurns))) who.noteChatTurns = 0;
  if (who.noteLastAskAt == null || !Number.isFinite(Number(who.noteLastAskAt))) who.noteLastAskAt = -999;
  if (who.noteLastRecallAt == null || !Number.isFinite(Number(who.noteLastRecallAt))) who.noteLastRecallAt = -999;
  if (who.noteLastTriviaAt == null || !Number.isFinite(Number(who.noteLastTriviaAt))) who.noteLastTriviaAt = -999;
  if (who.loveTalkLastAt == null || !Number.isFinite(Number(who.loveTalkLastAt))) who.loveTalkLastAt = -999;
  if (who.petProposeCount == null || !Number.isFinite(Number(who.petProposeCount))) who.petProposeCount = 0;
  if (who.petCoolUntil == null || !Number.isFinite(Number(who.petCoolUntil))) who.petCoolUntil = 0;
  if (who.pendingPet == null) who.pendingPet = "";
  if (who.petNudgeLastAt == null || !Number.isFinite(Number(who.petNudgeLastAt))) who.petNudgeLastAt = -999;
  if (who.wifeUpPending == null) who.wifeUpPending = "";
  if (who.datingUpPending == null) who.datingUpPending = "";
}

function preGirlfriendStage(stage) {
  const s = stage || "stranger";
  return s === "stranger" || s === "acquaintance" || s === "friend" || s === "close_friend";
}

function datingBandStage(stage) {
  const s = stage || "stranger";
  return s === "girlfriend" || s === "passionate" || s === "lover";
}

/** 互相認識 notes 啟用：陌生～妻子帶 */
function notesActiveStage(stage) {
  return preGirlfriendStage(stage) || datingBandStage(stage) || isWifeStage(stage);
}

function playerNotesCap(stage) {
  const s = stage || "stranger";
  if (s === "stranger" || s === "acquaintance") return 2;
  if (s === "friend" || s === "close_friend") return 8;
  if (s === "girlfriend" || s === "passionate" || s === "lover") return 12;
  if (isWifeStage(s)) return 16;
  return 12;
}

/** @returns {[number, number]} ask interval [lo, hi] in player messages */
function notesAskEvery(stage) {
  const s = stage || "stranger";
  if (s === "stranger" || s === "acquaintance") return [8, 12];
  if (s === "friend" || s === "close_friend") return [4, 6];
  if (datingBandStage(s)) return [3, 5];
  if (isWifeStage(s)) return [2, 4];
  return [3, 5];
}

/** 談情／家常關心頻率 [lo, hi]；非交往／妻子帶回 null */
function loveTalkEvery(stage) {
  const s = stage || "stranger";
  if (s === "girlfriend") return [6, 10];
  if (s === "passionate") return [3, 5];
  if (s === "lover") return [5, 8];
  if (s === "wife") return [4, 6];
  if (s === "devoted_wife") return [3, 5];
  if (s === "obedient_wife") return [5, 8];
  if (s === "pathological_wife") return [2, 4];
  return null;
}

/** 高失神／餘韻／防備／脫衣做愛：不要主動談情（對齊 notes 閘） */
function loveTalkBlocked(who) {
  if (!who) return true;
  if (who.guard) return true;
  if (inAfterglow(who)) return true;
  if (inSpasm(who)) return true;
  try {
    if (sceneOpen()) return true;
  } catch {
    /* ignore */
  }
  try {
    if (effectiveStun(who, "") >= 50) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function notesGateBlocked(who) {
  if (!who) return true;
  if (who.guard) return true;
  if (inAfterglow(who)) return true;
  if (inSpasm(who)) return true;
  try {
    if (effectiveStun(who, "") >= 50) return true;
  } catch {
    /* ignore */
  }
  return false;
}

function appendPlayerNote(who, text, cat = "habit", conf = 0.75) {
  ensurePlayerNotes(who);
  const cleaned = String(text || "").replace(/\s+/g, " ").trim().slice(0, 48);
  if (cleaned.length < 2) return false;
  const stage = who.stage || "stranger";
  const cap = playerNotesCap(stage);
  // drop near-duplicates
  const key = cleaned.slice(0, 12);
  who.playerNotes = who.playerNotes.filter((n) => !String(n.text || "").startsWith(key) && String(n.text || "") !== cleaned);
  who.playerNotes.push({ text: cleaned, cat, at: Date.now(), conf });
  while (who.playerNotes.length > cap) who.playerNotes.shift();
  return true;
}

function coolTopicKey(text) {
  const t = String(text || "");
  if (/叫|名字|稱呼|怎麼叫|小名/.test(t)) return "name";
  if (/睡|熬夜|起床|幾點|作息/.test(t)) return "sleep";
  if (/吃|喝|冰|熱|咖啡|菸|通勤|習慣/.test(t)) return "habit";
  if (/忙|委託|趕|工作|最近/.test(t)) return "busy";
  if (/喜歡|討厭|雷|型/.test(t)) return "like";
  if (/答應|約定|說好|下次一定|承諾/.test(t)) return "promise";
  if (/玩笑|梗|只有我們|私下/.test(t)) return "joke";
  if (/吃醋|在意|介意|別跟別人/.test(t)) return "jealous";
  return "misc";
}

function isVaguePlayerAnswer(text) {
  const t = String(text || "").replace(/\s+/g, "").trim();
  if (t.length <= 2) return true;
  return /^(還好|還可以|嗯+|喔+|哦+|啊+|普通|沒事|隨便|不知道|沒差|還行|就這樣|沒什麼|沒有特別)[。！!？?~～.…]*$/.test(t);
}

function isRefusePlayerAnswer(text) {
  return /別問|不想說|少管|不要問|關你什麼事|少管閒事|別管|不跟你說|無可奉告/.test(String(text || ""));
}

function isCorrectPlayerAnswer(text) {
  return /記錯|不是這樣|你記錯|才不是|我沒說過|沒有這回事|你搞錯|不是那樣/.test(String(text || ""))
    || /^(沒有|不是)[。！!？?~～.…]*$/.test(String(text || "").replace(/\s+/g, "").trim());
}

/**
 * 互相認識：注入已記事實 + 本輪最多一件（發問或回鍋／確認）。
 * 高失神／餘韻／防備時只給事實背景、不發問不回鍋。
 */
function playerNotesPromptLines(who = girl) {
  if (!who) return [];
  ensurePlayerNotes(who);
  const stage = who.stage || "stranger";
  if (!notesActiveStage(stage)) return [];
  if (who.freshMeet) {
    return ["【你記得的事】這一句先不要講出來。等他這次自己提起，再自然接。"];
  }

  const notes = who.playerNotes;
  const turns = Number(who.noteChatTurns) || 0;
  const cap = playerNotesCap(stage);
  const [askLo, askHi] = notesAskEvery(stage);
  const askEvery = who.noteAskSpan || Math.floor((askLo + askHi) / 2);
  const recallEvery = Math.max(askEvery, stage === "stranger" || stage === "acquaintance" ? 10 : (isWifeStage(stage) ? 3 : 5));
  const blocked = notesGateBlocked(who);
  const dating = datingBandStage(stage);
  const lines = [];

  who.notePromptAsk = false;
  who.notePromptRecall = false;

  if (notes.length) {
    const bits = notes.slice(-cap).map((n) => n.text).filter(Boolean);
    if (bits.length) {
      lines.push(`【你記得他說過（私下事實・用台詞自然帶・不要列清單）】${bits.join("；")}`);
    }
  }

  if (who.noteCorrectPending) {
    lines.push("【互相認識・訂正】他剛說你記錯了。簡短承認一下（「喔，那我記錯了」之類），不要小劇場，然後繼續平常聊。");
  }

  if (blocked) {
    lines.push("【互相認識・本輪】防備／餘韻／高失神中：不要主動問他私事，也不要用日常習慣回鍋緩和氣氛。");
    return lines;
  }

  const sinceAsk = turns - (Number(who.noteLastAskAt) || -999);
  const sinceRecall = turns - (Number(who.noteLastRecallAt) || -999);
  const underCap = notes.length < cap;
  const cooled = who.topicCool || {};
  const askDue = sinceAsk >= askEvery;
  const recallDue = notes.length > 0 && sinceRecall >= recallEvery;
  const wife = isWifeStage(stage);
  const askEligible = dating
    || wife
    || stage === "friend"
    || stage === "close_friend"
    || notes.length < 2;

  // 同輪最多一件：優先發問（未滿額），否則回鍋／確認
  if (askDue && underCap && askEligible) {
    const ban = Object.keys(cooled).filter((k) => cooled[k]).join("、");
    if (stage === "stranger" || stage === "acquaintance") {
      lines.push("【互相認識・本輪可問一件】極簡略問一件：稱呼叫法或作息（熬夜之類）。最多一句、可含糊帶過。不要問情史／性癖／交往／外面男人。");
    } else if (wife) {
      lines.push("【互相認識・妻子帶・本輪可問一件】更主動：可問日常、任務近況／計畫／煩惱、想法、喜好雷點。問完先聽。不要盤問外面男人名單；不要說出好感數值或關係階段名。");
    } else if (dating) {
      lines.push("【互相認識・交往中・本輪可問一件】可從喜好／雷點、承諾、私下玩笑、他在意或吃醋過的事、心情／煩惱裡問一件。問完先聽。不要盤問外面男人名單；不要說出好感數值或關係階段名。");
    } else {
      lines.push("【互相認識・本輪可問一件】從稱呼／作息、飲食小習慣、最近在忙、喜好／雷點四類裡問一件。問完先聽，不要連珠炮。不要問情史／性癖／要不要交往／外面男人。");
    }
    if (ban) lines.push(`這些主題他拒絕過，本階內不要再問：${ban}。`);
    lines.push("同輪不要又問又提舊帳。");
    who.notePromptAsk = true;
    who.noteAskSpan = askLo + Math.floor(Math.random() * (askHi - askLo + 1));
    who.noteLastAskAt = turns;
  } else if (recallDue) {
    const pick = notes[Math.floor(Math.random() * notes.length)];
    const conf = Number(pick?.conf) || 0.7;
    const age = Date.now() - (Number(pick?.at) || Date.now());
    const confirm = conf < 0.55 || age > 3 * 24 * 3600 * 1000;
    if (confirm) {
      lines.push(`【互相認識・本輪確認一件】用一句確認：「你好像說過${pick.text}？還是我記錯了？」不要連問。`);
    } else {
      lines.push(`【互相認識・本輪回鍋一件】自然帶一句他說過的「${pick.text}」（關心／接話），不要複讀、不要列清單。`);
    }
    who.notePromptRecall = true;
    who.noteLastRecalled = pick.text;
    who.noteLastRecallAt = turns;
    lines.push("同輪不要再問新的私事。");
  } else if (notes.length >= cap) {
    lines.push("【互相認識】記得的事已夠多：本輪不要問新的，頂多之後再確認舊的。");
  }

  if (dating || wife) {
    lines.push("【互相認識・禁記】永不把外面男人名單、好感數字、關係階段名寫進你記得的事；只記他親口說過的短事實。");
  }

  return lines;
}

/**
 * 陌生三禁＋朋友傾聽／瑣事節奏。女友＋回傳空陣列（不搶既有 stageTalk／stageOverride）。
 */
function relationshipPreGfPromptLines(who = girl) {
  if (!who) return [];
  const stage = who.stage || "stranger";
  if (!preGirlfriendStage(stage)) return [];
  ensurePlayerNotes(who);
  const lines = [];
  const turns = Number(who.noteChatTurns) || 0;
  const sinceTrivia = turns - (Number(who.noteLastTriviaAt) || -999);

  if (stage === "stranger" || stage === "acquaintance") {
    lines.push("【陌生～普通・禁止】禁止你主動表達愛意（喜歡／想你／告白式）。禁止你先約外出／約會。禁止你主動提起外面男人（風流、砲友、配種等）；若他追問，依既有朋友身體規則。");
    lines.push("【陌生節奏】以日常短答為主；幾乎不反問、不延伸。不要熱心傾聽長篇。");
  } else {
    // friend / close_friend
    lines.push("【朋友・傾聽】他講自己的事時：先用自己的話複述／對齊一句，再往下；話題黏著 1 輪（下一則先跟他開的主題，不要硬轉）。他倒苦水：先接情緒 → 再問細節 → 先不要教訓或「你該怎樣」。");
    lines.push("【朋友・界線】仍不要主動告白式愛意、不要先約外出當約會。心事／軟弱不主動講（留給女友）。");
    // 瑣事：約每 5～8 則；不搶倒苦水輪
    const triviaDue = sinceTrivia >= 5 && (sinceTrivia >= 8 || Math.random() < 0.45);
    const venting = /煩|累|氣|討厭|受不了|抱怨|幹嘛|委託/.test(String(who.topicHint || ""));
    if (triviaDue && !venting && !notesGateBlocked(who) && !who.notePromptAsk) {
      lines.push("【朋友・生活瑣事・本輪可帶一件】偶爾自己提一件日常瑣事（食事、睡眠、天氣心情、小抱怨非針對他、興趣小發現、以前生活小細節）。不要情史細談、性癖、外面男人盤點、告白式感情。若他正在倒苦水：本輪先聽他，不要拿自己瑣事搶戲。");
      who.noteLastTriviaAt = turns;
    } else if (venting) {
      lines.push("【朋友・本輪】他像在倒苦水：先聽他，不要拿自己瑣事搶戲。");
    }
  }
  return lines;
}

function consumeFriendUpBeat(who = girl) {
  if (!who?.friendUpPending) return "";
  who.friendUpPending = false;
  return "（旁白：她看你的眼神好像沒那麼防備了。不要說出關係階段名。）";
}

function consumeDatingUpBeat(who = girl) {
  if (!who?.datingUpPending) return "";
  const kind = who.datingUpPending;
  who.datingUpPending = "";
  if (kind === "passionate") {
    return "（旁白：她看你的眼神鬆了一點，語氣也熱了些。不要說出關係階段名。）";
  }
  if (kind === "lover") {
    return "（旁白：她靠你更近一點，語氣穩了些。不要說出關係階段名。）";
  }
  return "（旁白：她看你的眼神好像又不一樣了。不要說出關係階段名。）";
}

/**
 * 女友／熱戀／愛人：談情節奏、讓位身體、小名邊角、愛人禁戒指暗示。
 */
function relationshipDatingPromptLines(who = girl) {
  if (!who) return [];
  const stage = who.stage || "stranger";
  if (!datingBandStage(stage)) return [];
  ensurePlayerNotes(who);
  const lines = [];
  const turns = Number(who.noteChatTurns) || 0;
  const pet = String(who.playerPet || "").trim();
  const pending = String(who.pendingPet || "").trim();
  const loveSpan = loveTalkEvery(stage);
  const blockedLove = loveTalkBlocked(who);

  // 共同底：不主動約外出；未婚不叫老公；愛人禁戒指／未來壓力
  lines.push("【交往中・共同】不要主動約外出／約會。未婚階段禁止叫「老公」（留給妻子）。談情時仍不主動翻外面男人。");
  if (stage === "lover") {
    lines.push("【愛人・禁止】不要暗示戒指、求婚、以後結婚或看他的手施壓；不要淡淡「以後…」催未來承諾。求婚只等他自己拿戒指。");
  }

  // 小名邊角
  if (who.petRenameAck) {
    lines.push(`【小名・改名確認】他剛改了小名。用一句短回確認（例如「好，那就叫你${pet || "這樣"}」），不要小劇場。`);
  } else if (pet) {
    lines.push(`【小名】已確認的小名是「${pet}」。可自然用；熱戀更自然；愛人可和小名／名字混用。不要改回單方面亂取。`);
  } else if (who.nameWait === "petConfirm" && pending) {
    lines.push(`【小名・等確認】你剛提議叫他「${pending}」。等他點頭或改口；未確認前不要當已鎖定、不要一直叫。`);
  } else if ((Number(who.petProposeCount) || 0) < 2 && turns >= (Number(who.petCoolUntil) || 0) && who.nameWait !== "petConfirm") {
    // opener 或冷卻後的再提議（含首次最多 2 次）
    if (who.nameWait !== "petPropose") {
      // 非 opener：約每 4 則才主動再提議，避免每輪逼問
      const sinceAskish = turns - (Number(who.noteLastAskAt) || -999);
      if (sinceAskish >= 2 && !blockedLove && !who.notePromptAsk) {
        who.nameWait = "petPropose";
      }
    }
    if (who.nameWait === "petPropose") {
      lines.push("【小名・本輪提議】用一兩句提議一個小名並問他可不可以（可把提議的小名用「」包起來）。等他確認才正式用；不要單方面鎖定。未婚不要叫老公。");
    }
  } else if (!pet && (stage === "passionate" || stage === "lover")) {
    const sinceNudge = turns - (Number(who.petNudgeLastAt) || -999);
    const nudgeEvery = stage === "passionate" ? 4 : 6;
    if (sinceNudge >= nudgeEvery && !blockedLove && !who.notePromptAsk) {
      lines.push("【小名・輕推】還沒有確認的小名。可極軟地提一句「想叫你小名」或問他想被怎樣叫，不要逼、不要連問。");
      who.petNudgeLastAt = turns;
    }
  } else if (!pet && (Number(who.petProposeCount) || 0) >= 2) {
    lines.push("【小名】他尚未點頭；暫時用名字或「你」，不要硬叫未確認的小名。");
  }

  // 談情節奏（D：身體場面讓位）
  if (blockedLove) {
    lines.push("【談情・本輪讓位】高失神／餘韻／防備／脫衣做愛中：不要主動說喜歡／想你／告白式愛意。若他先說愛，仍可短短接住。");
  } else if (loveSpan) {
    const [lo, hi] = loveSpan;
    const every = who.loveTalkSpan || Math.floor((lo + hi) / 2);
    const since = turns - (Number(who.loveTalkLastAt) || -999);
    if (since >= every) {
      if (stage === "girlfriend") {
        lines.push("【談情・本輪可帶一點】可自然帶一點喜歡／想他／接情緒的短句，不要每句喊愛。倒苦水時先聽再心疼，氣氛對了才談情。");
      } else if (stage === "passionate") {
        lines.push("【談情・本輪可帶】可較熱、直接地說想他、確認在不在乎；吃醋裡可夾愛意，但別失控長篇。不要每句喊愛。");
      } else {
        lines.push("【談情・本輪可帶】可用較穩、「我們」口吻的真心短句；少表演、份量重。不要每句喊愛，也不要妻子級使喚。");
      }
      who.loveTalkSpan = lo + Math.floor(Math.random() * (hi - lo + 1));
      who.loveTalkLastAt = turns;
    }
  }

  // 傾聽：倒苦水不硬插告白
  lines.push("【交往・傾聽】他倒苦水時：先聽、可心疼／偏袒；氣氛對了才談情，不要硬插「我愛你」搶戲。");

  return lines;
}

function consumeWifeUpBeat(who = girl) {
  if (!who?.wifeUpPending) return "";
  const kind = who.wifeUpPending;
  who.wifeUpPending = "";
  if (kind === "wife") {
    return "（旁白：她的語氣像多了一點家常的溫度。不要說出關係階段名。）";
  }
  if (kind === "devoted_wife") {
    return "（旁白：她看你的眼神更黏了些。不要說出關係階段名。）";
  }
  if (kind === "obedient_wife") {
    return "（旁白：她的語氣更往你這邊靠。不要說出關係階段名。）";
  }
  if (kind === "pathological_wife") {
    return "（旁白：她抓你抓得更緊了一點。不要說出關係階段名。）";
  }
  return "（旁白：她看你的眼神好像又不一樣了。不要說出關係階段名。）";
}

/**
 * 妻子／貼心／順從／病態：共同六能力、愛意節奏、任務關心、身體日常、軟拒、病態上限。
 * §3.4 A–J；讓位對齊女友帶 D。
 */
function relationshipWifePromptLines(who = girl) {
  if (!who) return [];
  const stage = who.stage || "stranger";
  if (!isWifeStage(stage)) return [];
  ensurePlayerNotes(who);
  const lines = [];
  const turns = Number(who.noteChatTurns) || 0;
  const pet = String(who.playerPet || "").trim();
  const loveSpan = loveTalkEvery(stage);
  const blockedLove = loveTalkBlocked(who);
  const notes = who.playerNotes || [];
  const taskish = notes.filter((n) => /busy|promise|misc|habit|like|jealous|joke|sleep|name/.test(String(n.cat || "")) || /忙|委託|任務|計畫|煩|趕|工作/.test(String(n.text || "")));

  lines.push("【妻子帶・共同能力】可主動聊天、主動關心他親口說過的任務／近況／計畫、詢問他想法、幫忙分析他提到的任務問題、表達愛意、分享日常細節。持續強化，不要每句灌滿。");
  lines.push("【關心任務・材料】只用他親口說過、已進你記得的事的近況／計畫／煩惱當材料。沒有材料時才泛問「今天忙什麼／累不累」。絕不假裝讀系統任務板，也不捏造主線劇情。");
  if (taskish.length && !who.freshMeet) {
    const bits = taskish.slice(-4).map((n) => n.text).filter(Boolean);
    if (bits.length) {
      lines.push(`【任務近況素材（用台詞自然帶・勿列清單）】${bits.join("；")}`);
    }
  }

  if (who.petRenameAck) {
    lines.push(`【改名・短認】他剛改了叫法。用一句短回確認；老公與小名「${pet || "新叫法"}」可並用，不要小劇場。`);
  } else if (pet) {
    lines.push(`【稱呼】叫他老公；已確認的小名「${pet}」可與老公並用。`);
  } else {
    lines.push("【稱呼】叫他老公。若他改小名或改叫法，短認即可。");
  }

  // 四階口吻補強（疊加既有 stageTalk／個性家族）
  if (stage === "wife") {
    lines.push("【妻子・口吻】家常伴侶：想到就說、會叫老公、主動關心；甜收在日常，不要每句撒嬌。");
  } else if (stage === "devoted_wife") {
    lines.push("【貼心妻子・口吻】更黏、更會接情緒與瑣事；先聽出他累／悶／想被疼再回應。");
  } else if (stage === "obedient_wife") {
    lines.push("【順從妻子・口吻】以他為主、配合決策；可軟拒但多半順著。主動談情較少，多問「你想怎樣」。");
  } else {
    lines.push("【病態妻子・口吻】依賴／佔有／索求變重；仍可留個性殘影。密黏短句，不是失控長篇灌水。");
  }

  if (blockedLove) {
    lines.push("【愛意／關心・本輪讓位】高失神／餘韻／防備／脫衣做愛中：不要主動愛意或家常關心，也不要主動插身體／色氣話題。若他先開口，仍可短短接住。");
  } else if (loveSpan) {
    const [lo, hi] = loveSpan;
    const every = who.loveTalkSpan || Math.floor((lo + hi) / 2);
    const since = turns - (Number(who.loveTalkLastAt) || -999);
    if (since >= every) {
      if (stage === "wife") {
        lines.push("【愛意／關心・本輪可帶】可自然帶一點愛意或家常關心（吃了沒、累不累、想他）；不要每句喊愛。");
      } else if (stage === "devoted_wife") {
        lines.push("【愛意／關心・本輪可帶】可更勤地接情緒、關心瑣事與愛意短句；仍不要每句喊愛。");
      } else if (stage === "obedient_wife") {
        lines.push("【關心・本輪可帶】少主動談情；多問「你想怎樣／想聊什麼／想我怎麼做」。氣氛對了才短短表愛意。");
      } else {
        lines.push("【黏／索求・本輪可帶】可更密的短促黏著、佔有、叫老公、想留下；禁止長篇監視獨白或每句拆解。");
      }
      who.loveTalkSpan = lo + Math.floor(Math.random() * (hi - lo + 1));
      who.loveTalkLastAt = turns;
    }
  }

  // G：身體／色氣日常（讓位已在 blockedLove）
  if (!blockedLove) {
    if (stage === "wife" || stage === "devoted_wife") {
      lines.push("【身體／色氣・日常】偶爾可提親密／想靠近，保持克制；不要連發。");
    } else if (stage === "obedient_wife") {
      lines.push("【身體／色氣・日常】多半等他先開，或輕輕問他想不想；不要搶先長篇索求。");
    } else {
      lines.push("【身體／色氣・日常】可更直白短句說想要／想靠近；仍是短句，不要連發長篇。");
    }
  }

  // H：軟拒
  if (stage === "wife" || stage === "devoted_wife") {
    lines.push("【不合時】可以軟推、抱怨；之後仍是伴侶。拒絕／不同意不扣好感。");
  } else if (stage === "obedient_wife") {
    lines.push("【不合時】可以軟拒一次，通常仍會順著；不是沉默奴隸。拒絕不扣好感。");
  } else {
    lines.push("【不合時】很少真正拒絕；若拒絕，之後很快黏回來。拒絕（含病態拒絕）一律不扣好感。");
  }

  // I：病態上限
  if (stage === "pathological_wife") {
    lines.push("【病態上限】只做短促佔有、單句吃醋、黏著、要求留下、更密叫老公。禁止長篇監視獨白、每句拆解、逼他立刻回覆的話術／UI感。");
  }

  // 外面秘延續（friendPhysical 已注入；此處一句提醒）
  lines.push("【外面秘】有肉體／炮友時：他沒逼問就不提、不暗示；被明確逼問才漏一點／閃／沉默。日常愛意仍照常。");

  return lines;
}

function handlePlayerNotesAfterUser(who, rawText) {
  if (!who || !notesActiveStage(who.stage || "stranger")) return;
  ensurePlayerNotes(who);
  const raw = String(rawText || "").trim();
  if (!raw) return;

  if (who.noteAwaitAnswer) {
    if (isRefusePlayerAnswer(raw)) {
      const key = coolTopicKey(who.noteAwaitTopic || raw);
      who.topicCool[key] = true;
      who.noteAwaitAnswer = false;
      who.noteAwaitTopic = "";
      pushDebug(`互相認識　拒絕主題冷卻・${key}（不扣好感）`);
      return;
    }
    if (isVaguePlayerAnswer(raw)) {
      who.noteAwaitAnswer = false;
      who.noteAwaitTopic = "";
      return;
    }
    if (raw.length > 8 || (raw.length >= 4 && !isVaguePlayerAnswer(raw))) {
      const cat = coolTopicKey(who.noteAwaitTopic || raw);
      if (appendPlayerNote(who, raw, cat, 0.8)) {
        pushDebug(`互相認識　記下・${raw.slice(0, 24)}`);
      }
    }
    who.noteAwaitAnswer = false;
    who.noteAwaitTopic = "";
    return;
  }

  if (who.noteLastRecalled && isCorrectPlayerAnswer(raw)) {
    const target = String(who.noteLastRecalled);
    const before = who.playerNotes.length;
    who.playerNotes = who.playerNotes.filter((n) => n.text !== target);
    if (who.playerNotes.length < before) {
      pushDebug(`互相認識　訂正刪除・${target.slice(0, 24)}`);
    }
    who.noteLastRecalled = "";
    who.noteCorrectPending = true;
  }
}

function handlePlayerNotesAfterReply(who, replyText) {
  if (!who || !notesActiveStage(who.stage || "stranger")) return;
  ensurePlayerNotes(who);
  const reply = String(replyText || "");
  if (who.noteCorrectPending) {
    who.noteCorrectPending = false;
  }
  if (who.petRenameAck) {
    who.petRenameAck = false;
  }
  // 若本輪她又提議了小名（「」），收進 pending
  if (datingBandStage(who.stage || "") && !who.playerPet && (who.nameWait === "petPropose" || who.nameWait === "pet")) {
    takeCall("", reply);
  }
  const askedThisTurn = !!who.notePromptAsk
    || ((Number(who.noteLastAskAt) || -999) === (Number(who.noteChatTurns) || 0) && /[？?]/.test(reply));
  if (askedThisTurn && /[？?]/.test(reply)) {
    who.noteAwaitAnswer = true;
    who.noteAwaitTopic = reply.slice(0, 40);
  } else if (who.notePromptAsk) {
    // 提示叫她問但這句沒問號：仍標等待，下一句若像回答可寫入
    who.noteAwaitAnswer = true;
    who.noteAwaitTopic = reply.slice(0, 40);
  }
  who.notePromptAsk = false;
  who.notePromptRecall = false;
}


function stageByAffection(aff) {
  let key = "stranger";
  for (const step of STAGE_LADDER) {
    if (aff >= step.at) key = step.key;
  }
  return key;
}

function syncStage(who) {
  if (who.stageLock && STAGE_NAME[who.stageLock]) {
    who.stage = who.stageLock;
    return;
  }
  const aff = who.affection || 0;
  let target = stageByAffection(aff);
  const current = STAGE_NAME[who.stage] ? who.stage : "stranger";
  const curIdx = STAGE_INDEX[current] ?? 0;
  const gfIdx = STAGE_INDEX.girlfriend ?? 4;
  const wifeIdx = STAGE_INDEX.wife ?? 7;
  const loverIdx = STAGE_INDEX.lover ?? 6;
  const cfIdx = STAGE_INDEX.close_friend ?? 3;
  // 儀式門檻：感情不能自動跨進女友／妻子
  let maxAuto;
  if (curIdx < gfIdx) maxAuto = cfIdx;
  else if (curIdx < wifeIdx) maxAuto = loverIdx;
  else maxAuto = STAGE_LADDER.length - 1;
  if ((STAGE_INDEX[target] ?? 0) > maxAuto) {
    target = STAGE_LADDER[maxAuto].key;
  }
  // 妻子帶只降到妻子：上去之後不會掉回愛人／女友
  if (curIdx >= wifeIdx && (STAGE_INDEX[target] ?? 0) < wifeIdx) {
    target = STAGE_LADDER[wifeIdx].key;
  }
  if ((STAGE_INDEX[target] ?? 0) < curIdx) {
    const holdAt = (STAGE_AT[current] ?? 0) - STAGE_HYSTERESIS;
    if (aff >= holdAt) return;
  }
  if (target !== current) {
    const fromEarly = current === "stranger" || current === "acquaintance";
    if (fromEarly && (target === "friend" || target === "close_friend")) {
      who.friendUpPending = true;
    }
    // 女友帶內自動升熱戀／愛人：極淡銜接（不講階段名）
    if (current === "girlfriend" && target === "passionate") {
      who.datingUpPending = "passionate";
    } else if ((current === "girlfriend" || current === "passionate") && target === "lover") {
      who.datingUpPending = "lover";
    }
    // 妻子帶內軟升：極淡銜接（不講階段名）
    if (current === "wife" && target === "devoted_wife") {
      who.wifeUpPending = "devoted_wife";
    } else if ((current === "wife" || current === "devoted_wife") && target === "obedient_wife") {
      who.wifeUpPending = "obedient_wife";
    } else if (
      (current === "wife" || current === "devoted_wife" || current === "obedient_wife")
      && target === "pathological_wife"
    ) {
      who.wifeUpPending = "pathological_wife";
    }
  }
  who.stage = target;
}

/* —— 房間戀愛道具：花束告白／戒指求婚 —— */
const CONFESS_LINES = [
  "我喜歡你。不只是朋友那種——想跟你正式交往。",
  "這束花給你。我喜歡你，想當你的男朋友。",
  "我認真的。喜歡你，想跟你交往。",
  "請收下這束花，還有我的告白。",
  "從今以後，想以戀人的身分待在你身邊。",
];
const CONFESS_ACCEPT = [
  "……我也是。那就，從今天起當戀人吧。",
  "終於說出口了啊……好。我也喜歡你。",
  "花很漂亮……答應你。我們交往吧。",
  "等這句好久了。好啊，當你的女友。",
];
const PROPOSE_LINES = [
  "這枚戒指給你——嫁給我，好嗎？",
  "想跟你共度餘生。跟我結婚吧。",
  "請當我的妻子。這是我的求婚。",
  "正式問一次：願意當我的妻子嗎？",
];
const PROPOSE_ACCEPT = [
  "……笨蛋。當然願意。我嫁給你。",
  "戒指好閃……嗯，我答應你。",
  "從今以後是妻子了喔。要好好對我。",
  "好。我們結婚吧——永遠在一起。",
];
const PROPOSE_DECLINE = [
  "……還、還太早了。再給我一點時間好嗎？",
  "心意我收到了，可是現在還不行……再培養一下。",
  "戒指很漂亮，但我還沒準備好。抱歉。",
  "別急……我們再靠近一點，好嗎？",
];

function pickLine(list) {
  return list[Math.floor(Math.random() * list.length)];
}

function playerInv() {
  player = ensurePlayer(player);
  player.inventory ??= { bouquet: 0, ring: 0, abortPill: 0 };
  const inv = player.inventory;
  if (inv.abortPill == null) inv.abortPill = 0;
  if (inv.bouquet == null) inv.bouquet = 0;
  if (inv.ring == null) inv.ring = 0;
  return inv;
}

function datingStages() {
  return new Set(["girlfriend", "passionate", "lover"]);
}

function canClaimBouquet() {
  if (!girl) return { ok: false, why: "尚無對象" };
  const stage = girl.stage || "stranger";
  const aff = girl.affection || 0;
  if (stage !== "close_friend") return { ok: false, why: "需為親密好友" };
  if (aff < (STAGE_AT.girlfriend ?? 200)) {
    return { ok: false, why: `感情需≥${STAGE_AT.girlfriend ?? 200}（現 ${aff}）` };
  }
  return { ok: true, why: "" };
}

function canClaimRing() {
  if (!girl) return { ok: false, why: "尚無對象" };
  if (!datingStages().has(girl.stage || "")) {
    return { ok: false, why: "需為女友／熱戀／愛人" };
  }
  return { ok: true, why: "" };
}

function canConfessGirl() {
  if (!girl || !sheetOpen() || talkBusy || sceneOpen()) return false;
  const inv = playerInv();
  return (girl.stage || "") === "close_friend"
    && (girl.affection || 0) >= (STAGE_AT.girlfriend ?? 200)
    && (inv.bouquet | 0) >= 1;
}

function canProposeGirl() {
  if (!girl || !sheetOpen() || talkBusy || sceneOpen()) return false;
  const inv = playerInv();
  return datingStages().has(girl.stage || "") && (inv.ring | 0) >= 1;
}

function canBuyAbortPill() {
  if (!girl) return { ok: false, why: "尚無對象" };
  if (!girl?.world?.pregnancy) return { ok: false, why: "需有孕才能購買打胎藥" };
  return { ok: true, why: "" };
}

function canUseAbortPill() {
  if (!girl) return { ok: false, why: "尚無對象" };
  if (!girl?.world?.pregnancy) return { ok: false, why: "目前無孕" };
  const inv = playerInv();
  if ((inv.abortPill | 0) < 1) return { ok: false, why: "沒有打胎藥" };
  return { ok: true, why: "" };
}

function renderRomanceItems() {
  const panel = $("romance-items");
  if (!panel) return;
  if (!girl) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  player = ensurePlayer(player);
  const inv = playerInv();
  const count = $("romance-inv");
  if (count) {
    const g = ensurePlayer(player).gold | 0;
    count.textContent = `金幣 ${g}　花束 ×${inv.bouquet | 0}　戒指 ×${inv.ring | 0}　打胎藥 ×${inv.abortPill | 0}`;
  }
  const bOk = canClaimBouquet();
  const rOk = canClaimRing();
  const buyOk = canBuyAbortPill();
  const useOk = canUseAbortPill();
  const bBtn = $("claim-bouquet");
  const rBtn = $("claim-ring");
  const buyBtn = $("buy-abort-pill");
  const useBtn = $("use-abort-pill");
  if (bBtn) {
    bBtn.disabled = !bOk.ok;
    bBtn.title = bOk.ok ? "沙盒免費領取花束" : bOk.why;
  }
  if (rBtn) {
    rBtn.disabled = !rOk.ok;
    rBtn.title = rOk.ok ? "沙盒免費領取戒指" : rOk.why;
  }
  if (buyBtn) {
    buyBtn.disabled = !buyOk.ok;
    buyBtn.title = buyOk.ok ? "商店：沙盒免費購買打胎藥（需有孕）" : buyOk.why;
  }
  if (useBtn) {
    useBtn.disabled = !useOk.ok;
    useBtn.title = useOk.ok ? "使用打胎藥打掉孕" : useOk.why;
  }
  const status = $("romance-status");
  if (status) {
    const parts = [];
    if (!bOk.ok) parts.push(`花束：${bOk.why}`);
    else parts.push("花束：可領取");
    if (!rOk.ok) parts.push(`戒指：${rOk.why}`);
    else parts.push("戒指：可領取");
    if (!buyOk.ok) parts.push(`打胎藥：${buyOk.why}`);
    else parts.push("打胎藥：可購買");
    if (girl?.world?.pregnancy) {
      if (useOk.ok) parts.push("可使用打胎藥");
      else if ((inv.abortPill | 0) < 1) parts.push("先購買打胎藥再使用");
    }
    status.textContent = parts.join("　");
  }
}

function claimGold() {
  player = ensurePlayer(player);
  player.gold = (player.gold | 0) + 100;
  pushDebug(`沙盒領取金幣 +100　現有 ${player.gold}`);
  const s = $("summon-status");
  if (s) s.textContent = `領取金幣（現有 ${player.gold}）。妻子生產安頓需 ${CHILD_SETTLE_GOLD} 金。`;
  persistRoom();
  renderRomanceItems();
  renderDebug();
}

function claimBouquet() {
  const gate = canClaimBouquet();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.bouquet = (inv.bouquet | 0) + 1;
  pushDebug(`領取花束　花束 ×${inv.bouquet}`);
  const s = $("summon-status");
  if (s) s.textContent = `領取花束（現有 ×${inv.bouquet}）。長按她對話可告白。`;
  persistRoom();
  renderRomanceItems();
  renderDebug();
  refreshTalkActs();
}

function claimRing() {
  const gate = canClaimRing();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.ring = (inv.ring | 0) + 1;
  pushDebug(`領取戒指　戒指 ×${inv.ring}`);
  const s = $("summon-status");
  if (s) s.textContent = `領取戒指（現有 ×${inv.ring}）。長按她對話可求婚。`;
  persistRoom();
  renderRomanceItems();
  renderDebug();
  refreshTalkActs();
}

function buyAbortPill() {
  const gate = canBuyAbortPill();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.abortPill = (inv.abortPill | 0) + 1;
  pushDebug(`商店購買打胎藥　打胎藥 ×${inv.abortPill}`);
  const s = $("summon-status");
  if (s) s.textContent = `已購買打胎藥（現有 ×${inv.abortPill}）。有孕時可使用打掉。`;
  const rs = $("romance-status");
  if (rs) rs.textContent = `已購買打胎藥（×${inv.abortPill}）`;
  persistRoom();
  renderRomanceItems();
  renderBodyPanel();
  renderDebug();
}

function useAbortPill() {
  const gate = canUseAbortPill();
  if (!gate.ok) {
    const status = $("romance-status");
    if (status) status.textContent = gate.why;
    renderRomanceItems();
    return;
  }
  const inv = playerInv();
  inv.abortPill = Math.max(0, (inv.abortPill | 0) - 1);
  if (girl?.world) girl.world.pregnancy = null;
  // 輕身體註記：精液等不變，僅清孕
  if (girl) {
    girl.lastMark = "已使用打胎藥，孕已打掉";
    pushDebug(`使用打胎藥　打胎藥剩 ×${inv.abortPill}　孕已打掉`);
  }
  const s = $("summon-status");
  if (s) s.textContent = "已使用打胎藥，孕已打掉。";
  const rs = $("romance-status");
  if (rs) rs.textContent = "已使用打胎藥，孕已打掉";
  persistRoom();
  renderRomanceItems();
  renderBodyPanel();
  renderDebug();
  renderWorld();
}

async function doConfess() {
  if (!canConfessGirl()) {
    renderRomanceItems();
    refreshTalkActs();
    return;
  }
  const inv = playerInv();
  inv.bouquet = Math.max(0, (inv.bouquet | 0) - 1);
  talkBusy = true;
  setTalkEnabled(false);
  refreshTalkActs();
  const line = pickLine(CONFESS_LINES);
  lines.push({ role: "user", content: line });
  $("portrait-name").textContent = "你";
  $("portrait-meta").textContent = line;
  await new Promise((r) => setTimeout(r, 400));
  const accept = pickLine(CONFESS_ACCEPT);
  lines.push({ role: "assistant", content: accept });
  girl.stage = "girlfriend";
  girl.stageLock = "";
  if ((girl.affection || 0) < (STAGE_AT.girlfriend ?? 200)) {
    girl.affection = STAGE_AT.girlfriend ?? 200;
  }
  syncStage(girl);
  pushDebug(`告白成功 → 女友（花束 −1，剩 ×${inv.bouquet}）`);
  girl.lastMark = "告白成功";
  rememberChat();
  persistRoom();
  renderDebug();
  renderRomanceItems();
  await typeLine(girl.name, accept);
  const s = $("summon-status");
  if (s) s.textContent = `${girl.name} 成為你的女友了！`;
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) setTalkEnabled(true);
  else refreshTalkActs();
  renderCard();
}

async function doPropose() {
  if (!canProposeGirl()) {
    renderRomanceItems();
    refreshTalkActs();
    return;
  }
  talkBusy = true;
  setTalkEnabled(false);
  refreshTalkActs();
  const inv = playerInv();
  let ringGone = false;
  if (Math.random() < 0.5) {
    inv.ring = Math.max(0, (inv.ring | 0) - 1);
    ringGone = true;
  }
  const chance = Math.min(1, (girl.affection || 0) / ((STAGE_AT.girlfriend ?? 200) * 2));
  const ok = Math.random() < chance;
  const line = pickLine(PROPOSE_LINES);
  lines.push({ role: "user", content: line });
  $("portrait-name").textContent = "你";
  $("portrait-meta").textContent = line;
  await new Promise((r) => setTimeout(r, 400));
  if (ok) {
    const accept = pickLine(PROPOSE_ACCEPT);
    lines.push({ role: "assistant", content: accept });
    girl.stage = "wife";
    girl.stageLock = "";
    if ((girl.affection || 0) < (STAGE_AT.wife ?? 460)) {
      girl.affection = STAGE_AT.wife ?? 460;
    }
    syncStage(girl);
    // 戒指當下極淡旁白：放在 sync 之後，避免感情已跨貼心時被帶內軟升蓋掉
    girl.wifeUpPending = "wife";
    pushDebug(`求婚成功 → 妻子${ringGone ? "（戒指已用）" : "（戒指還在）"}　機率 ${Math.round(chance * 100)}%`);
    girl.lastMark = "求婚成功";
    rememberChat();
    persistRoom();
    renderDebug();
    renderRomanceItems();
    await typeLine(girl.name, accept);
    const s = $("summon-status");
    if (s) s.textContent = `${girl.name} 戴上了戒指。`;
  } else {
    const decline = pickLine(PROPOSE_DECLINE);
    lines.push({ role: "assistant", content: decline });
    pushDebug(`求婚未成${ringGone ? "（戒指消失）" : "（戒指還在）"}　機率 ${Math.round(chance * 100)}%`);
    girl.lastMark = "求婚未成";
    rememberChat();
    persistRoom();
    renderDebug();
    renderRomanceItems();
    await typeLine(girl.name, decline);
    const s = $("summon-status");
    if (s) {
      s.textContent = ringGone
        ? "還沒答應……戒指也不見了。再培養吧。"
        : "還沒答應……再培養感情吧。";
    }
  }
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) setTalkEnabled(true);
  else refreshTalkActs();
  renderCard();
}

function stageTalk() {
  const stage = girl.stage || "stranger";
  const name = girl.playerName || "";
  const nick = girl.playerNick || "";
  const pet = girl.playerPet || "";
  if (stage === "pathological_wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：病態沉溺。依賴／佔有／索求變重；仍留原本個性殘影，不是空白人偶。短促黏著與索求可以，禁止長篇監視獨白或每句拆解。",
      petLine,
      "可主動聊、關心他說過的近況、問想法、短句愛意與日常。回覆可密黏、可短促索求；不要突然變冷。什麼都講。拒絕很少，若拒很快黏回；拒絕不扣好感。",
    ];
  }
  if (stage === "obedient_wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：以他為主。他想往哪走、想聊什麼、想怎樣，你優先接住並配合；仍用原本個性說話，不是空白人偶。想拒絕時用你的脾氣軟拒一次，最後多半還是會順著他——不是沉默奴隸。",
      petLine,
      "少主動談情，多問「你想怎樣」。可關心他說過的任務近況、幫忙分析他提到的問題、分享日常。身體話題多半等他先開。不要突然變冷。什麼都講。拒絕不扣好感。",
    ];
  }
  if (stage === "devoted_wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：更黏、更會接情緒／瑣事——他累、悶、想被疼、想被誇、想安靜，你都要先聽出來再回應。甜收在日常裡，不要每句撒嬌。個性不要換掉。",
      petLine,
      "什麼都講，包括抱怨他。多問今天怎樣、累不累、心裡有沒有事；可關心他說過的近況與任務。偶爾可提親密／想靠近但克制。外面沒有特別的事就不要硬報。拒絕可軟推，不扣好感。",
    ];
  }
  if (stage === "wife") {
    const petLine = pet
      ? `你叫他老公；小名「${pet}」可並用。`
      : "你叫他老公。";
    return [
      "態度：家常伴侶——想到就說、會叫老公、主動關心。甜收在日常裡，不要每句撒嬌。個性不要換掉。",
      petLine,
      "什麼都講，包括抱怨他。可主動聊、關心他說過的近況／任務、問想法、表愛意、分享日常。偶爾可提親密／想靠近但克制。外面沒有特別的事，就不要報你剛剛在做什麼。拒絕可軟推，不扣好感。",
    ];
  }
  if (stage === "lover") {
    const petLine = pet
      ? `已確認的小名是「${pet}」。可和小名／名字混用。禁止叫老公（留給妻子）。`
      : "還沒有確認的小名：用名字或「你」；想叫小名就先提議並問可不可以，等他點頭才用。禁止單方面用「」自取並鎖定。禁止叫老公。";
    return [
      "態度：穩定親密。比熱戀少衝動與嫉妒，但比女友更深、更安心。主動找他仍常，但較穩、不吵。個性不要換掉。",
      petLine,
      "心情、不安、打算、更深私事都講給他。親密是靠得近、說真話，不是黏著吵。談情用「我們」口吻、少表演多真心；頻率約每 5～8 則帶一點即可。不要暗示戒指或「以後」。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "passionate") {
    const petLine = pet
      ? `已確認的小名是「${pet}」。小名用得更自然。禁止叫老公。`
      : "還沒有確認的小名：用名字或「你」；可較常輕推想叫小名，但仍要先問、等他確認。禁止單方面鎖定。禁止叫老公。";
    return [
      "態度：黏、熱、吃醋一點可以。會想念他、會想確認他在不在乎你。你沒回時較容易再傳／在意。甜是距離近，不是把個性換成另一個人。",
      petLine,
      "會主動找他、講想他；談情約每 3～5 則可帶一點，熱、直接。若他冷淡或提別人，可以吃醋但別失控罵長篇。不安和異常可以講。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "girlfriend") {
    const petLine = pet
      ? `已確認的小名是「${pet}」。可以開始用。禁止叫老公。`
      : "還沒有確認的小名：用名字或「你」。想叫就先提議並問可不可以，等他點頭或改口才鎖定；不要單方面用「」自取寫入。禁止叫老公。";
    return [
      "態度：剛正式交往，開始接住他——問他過得怎樣、想不想說、有沒有不舒服。可以甜、可以找他；你沒回時會再傳但克制。甜是距離近，不是把個性換成另一個人。",
      petLine,
      "心情、不舒服的事、異常進行到哪，可以講給他；也會反問他的事。談情約每 6～10 則帶一點喜歡／想他即可，不要每句喊愛。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "close_friend") {
    return [
      "態度：很熟的好友，開始在乎他——會問他怎麼了、今天怎樣，語氣比朋友更鬆，但還不是情人。不要突然變甜成女友。",
      nick ? `你叫他的綽號是「${nick}」。` : `他叫${name || "你"}。你可以問他要不要一個綽號。`,
      "日常、心事的外緣、打工和閒逛可以講；可以關心他、願意聽他說話。仍不要主動告白式愛意、不要先約外出當約會。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "friend") {
    return [
      "態度：比剛認識時放軟，會接話、會傾聽，語氣自然，但不要黏、不要主動關心過頭。還不是情人。",
      nick ? `你叫他的綽號是「${nick}」。` : `他叫${name || "你"}。你可以問他要不要一個綽號。`,
      "日常、喜好、打工和閒逛可以講；偶爾可分享生活瑣事。他講自己時先對齊再往下。不安和異常只說有點不對勁，不講編號。不要主動告白、不要先約外出。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "acquaintance") {
    return [
      "態度：愛理不理。話短、興趣低，能一句就一句，不要熱心接話、不要主動關心他。不要甜、不要撒嬌。",
      name ? `他叫${name}。用「你」或這個名字，不要用綽號。` : "你還不知道他的名字。開場用短句問他怎麼稱呼就好。",
      "可有可無地接幾句。禁止主動愛意、禁止先約外出、禁止主動提外面男人。外面沒有特別的事就不要提。他問到只說表面，不要多解釋。",
    ];
  }
  return [
    "態度：愛理不理。話短、冷淡、興趣低。不要熱心、不要甜、不要撒嬌、不要親暱。能一句就一句。",
    name ? `他叫${name}。用「你」或這個名字，不要用綽號。` : "你還不知道他的名字。開場用短句問他怎麼稱呼就好，問完不必熱心。",
    "禁止主動表達愛意、禁止先約外出／約會、禁止主動提起外面男人。外面的事沒有就不要提。有的話也不要主動講。他問到只說表面，不要多聊。",
  ];
}

function judgeUser(text) {
  const stageKey = girl.stage || "stranger";
  const stage = STAGE_NAME[stageKey] || "陌生";
  const hates = namesOf(girl.dislikes).join("、");
  const last = [...lines].reverse().find((line) => line.role === "assistant")?.content || "";
  const mood = girl.world?.mood || "";
  const early = stageKey === "stranger" || stageKey === "acquaintance";
  const friendOnly = stageKey === "friend";
  const closePal = stageKey === "close_friend";
  const dating = stageKey === "girlfriend" || stageKey === "passionate" || stageKey === "lover";
  const wed = stageKey === "wife" || stageKey === "devoted_wife" || stageKey === "obedient_wife" || stageKey === "pathological_wife";
  return [
    "你只判斷玩家這一句。只回一個詞：接住、喜歡、有趣、平常、冒犯。",
    `現在是${stage}。`,
    hates ? `她討厭：${hates}。踩到就冒犯。` : "",
    "接住＝接住她剛說的心情、煩惱、喜好或在意的人，讓她覺得被懂。少給。",
    "喜歡＝她聽了會高興：順著她剛說的、記得她提過的、得體的關心或稱讚。還沒到被深深接住。這是她對這句的感受，不是玩家說了「我喜歡你」。",
    "有趣＝有內容的閒聊、玩笑、接話、問她一件具體的事。比乾打招呼多一點就行。",
    "平常＝純打招呼、嗯、哦、敷衍、沒接著她的話。",
    early ? "她對他還冷。說喜歡她、想她、身體、性、要她陪、逼她多聊、稱讚外表，算冒犯。有內容的普通話算有趣；順著她剛說的算喜歡；真正接住她的心情才算接住。" : "",
    friendOnly ? "說喜歡她、想她、身體或性，算冒犯。問今天、接一句，算有趣。普通關心、順著她的話，算喜歡。碰到她的心情或煩惱，算接住。" : "",
    closePal ? "說喜歡她、想她、身體或性，算冒犯。普通閒聊算有趣。關心她、問她怎麼了，算喜歡。真的接住她在意的事，算接住。" : "",
    dating ? "只有很直接的性要求算冒犯。輕鬆接話算有趣。說想她、關心她、家常，算喜歡。接住她的情緒或她剛說的煩惱，算接住。純打招呼算平常。" : "",
    wed ? "只有很直接、粗暴的性要求算冒犯。輕鬆接話算有趣。說想她、累了、想被陪、講家常，算喜歡。接住她的心情，算接住。純打招呼算平常。" : "",
    mood === "不安" || mood === "不悅" ? "她心情不好。開玩笑、逼她、叫她別在意，算冒犯。溫柔陪一下算喜歡，好好接她的心情算接住。" : "",
    last ? `她上一句：${last}` : "",
    `玩家這一句：${text}`,
  ].filter(Boolean).join("\n");
}

function readMark(text) {
  const raw = cleanLine(text);
  if (raw.includes("冒犯")) return "冒犯";
  if (raw.includes("接住")) return "接住";
  if (raw.includes("喜歡")) return "喜歡";
  if (raw.includes("有趣")) return "有趣";
  return "平常";
}

async function judgeTurn(text) {
  try {
    const route = await gameChatRoute();
    const messages = [
      { role: "system", content: "你只輸出一個詞：接住、喜歡、有趣、平常、冒犯。不要解釋。" },
      { role: "user", content: judgeUser(text) },
    ];
    const reply = route.provider === "ollama"
      ? await askOllama(route, messages, null, { temperature: 0.1 })
      : await askGrok(route, messages, `roomjudge:${girl.id}:${Date.now().toString(36)}`, { temperature: 0.1 });
    return readMark(reply);
  } catch {
    return "平常";
  }
}

function pushDebug(text) {
  if (!girl) return;
  if (!Array.isArray(girl.debugLog)) girl.debugLog = [];
  girl.debugLog.unshift(text);
  girl.debugLog.length = Math.min(girl.debugLog.length, 8);
}

function bumpAffection(delta, reason = "") {
  if (!girl) return;
  const d = Number(delta) || 0;
  if (!d) return;
  girl.affection = (girl.affection || 0) + d;
  const before = girl.stage || "stranger";
  syncStage(girl);
  const stageNote = girl.stage !== before ? `，關係變成${STAGE_NAME[girl.stage]}` : "";
  pushDebug(`感情 ${girl.affection}（${d >= 0 ? "+" : ""}${d}）${reason ? "　" + reason : ""}${stageNote}`);
  renderDebug();
}

/** 閒聊判定只加不減。接住 5、喜歡 3、有趣 1、平常 0、冒犯 0（仍設防備）。 */
const MARK_AFF = { 接住: 5, 喜歡: 3, 有趣: 1, 冒犯: 0 };

function applyMark(mark) {
  const delta = MARK_AFF[mark] || 0;
  const shown = mark;
  if (mark === "接住") girl.guard = 0;
  else if (mark === "冒犯") girl.guard = stageIdx(girl) >= (STAGE_INDEX.girlfriend ?? 4) ? 1 : 2;
  girl.affection = (girl.affection || 0) + delta;
  const before = girl.stage || "stranger";
  syncStage(girl);
  girl.lastMark = shown;
  const stageNote = girl.stage !== before ? `，關係變成${STAGE_NAME[girl.stage]}` : "";
  pushDebug(`判定 ${shown}　感情 ${girl.affection}（${delta >= 0 ? "+" : ""}${delta}）${stageNote}`);
  persistRoom();
  renderDebug();
}

/** test_room 除錯：想念值一行（閘門關或沒這欄就不動）。 */
function renderMissDebug() {
  const el = $("dbg-miss");
  if (!el) return;
  if (!MISS_YOU_ON || !girl) {
    el.textContent = "—";
    return;
  }
  const m = ensureMiss(girl);
  const cap = missStageSpec(girl.stage || "stranger").cap;
  const ago = m.lastSeen ? formatGap(Date.now() - m.lastSeen) + "前" : "未起算";
  const re = m.reunion ? `・重逢 ${m.reunion.level}（第 ${m.reunion.lines} 句）` : "";
  el.textContent = `${m.level}/${cap}・上次 ${ago}${re}`;
}

function shiftMissLastSeen(hours) {
  if (!MISS_YOU_ON || !girl) return null;
  const m = ensureMiss(girl);
  m.lastSeen = (m.lastSeen || Date.now()) - (Number(hours) || 0) * 3600000;
  persistRoom();
  renderMissDebug();
  return m.lastSeen;
}

function bindMissDebug() {
  onId("dbg-miss-6h", "click", () => shiftMissLastSeen(6));
  onId("dbg-miss-24h", "click", () => shiftMissLastSeen(24));
  onId("dbg-miss-clear", "click", () => {
    if (!MISS_YOU_ON || !girl) return;
    const m = ensureMiss(girl);
    m.level = 0;
    m.reunion = null;
    m.lastSeen = Date.now();
    persistRoom();
    renderMissDebug();
  });
}

/** test_room 除錯：事後算帳欠帳一行。 */
function renderReckonDebug() {
  const el = $("dbg-reckon");
  if (!el) return;
  if (!STUN_RECKONING_ON || !girl) {
    el.textContent = "—";
    return;
  }
  const d = ensureStunDebt(girl);
  const pers = basePersonality(girl);
  const share = settleShare(girl.stage || "stranger", pers);
  const acts = stunDebtActsText(girl);
  const now = d.amount > 0 || acts ? `欠 ${d.amount}${acts ? `（${acts}）` : ""}・回神補 ${Math.round(d.amount * share)}（${Math.round(share * 100)}%）` : `欠 0・比例 ${Math.round(share * 100)}%`;
  const dazed = undressDazed(girl) ? "・失神中" : "";
  const last = lastReckoning ? `・上次 ${lastReckoning.tone}${lastReckoning.add ? ` +${lastReckoning.add}` : ""}${lastReckoning.sweetDrop ? ` −${lastReckoning.sweetDrop}` : ""}` : "";
  el.textContent = `${now}${dazed}${last}`;
}

function bindReckonDebug() {
  onId("dbg-reckon-clear", "click", () => {
    if (!STUN_RECKONING_ON || !girl) return;
    clearStunDebt(girl);
    persistRoom();
    renderReckonDebug();
  });
}

function renderDebug() {
  const panel = $("bond-debug");
  if (!girl) {
    panel.hidden = true;
    renderRomanceItems();
    return;
  }
  panel.hidden = false;
  $("dbg-stage").textContent = STAGE_NAME[girl.stage || "stranger"] || "陌生";
  $("dbg-aff").textContent = String(girl.affection || 0);
  ensureOpenness(girl);
  ensureInvasion(girl);
  const openInv = `開放 ${getOpenness(girl)}・侵犯 ${getInvasion(girl)}`;
  $("dbg-mark").textContent = girl.lastMark ? `${girl.lastMark}　${openInv}` : openInv;
  $("dbg-names").textContent = `名字 ${girl.playerName || "—"}　綽號 ${girl.playerNick || "—"}　小名 ${girl.playerPet || "—"}`;
  $("dbg-mood").textContent = girl.world?.mood || "—";
  const occEl = $("dbg-occ");
  if (occEl) {
    try {
      const occ = peekOccupancy(girl, "", sexChatActive() ? { inSex: true } : {});
      occEl.textContent = `${occupancyLabel(occ)}${occ.semenOut ? `・精液${occ.semenOut === "fresh" ? "待流" : "餘波"}` : ""}`;
    } catch { occEl.textContent = "—"; }
  }
  renderMissDebug();
  renderHungerDebug();
  renderOrganDevDebug();
  renderReckonDebug();
  renderThrustDebug();
  const jump = $("dbg-jump");
  if (jump && jump.value !== (girl.stageLock || "")) jump.value = girl.stageLock || "";
  const log = $("dbg-log");
  log.replaceChildren();
  for (const line of girl.debugLog || []) {
    const item = document.createElement("li");
    item.textContent = line;
    log.append(item);
  }
  renderRomanceItems();
}

function topicHintFrom(history) {
  const recent = [...(history || [])].reverse();
  const lastUser = recent.find((line) => line.role === "user");
  const raw = String(lastUser?.content || "").replace(/\s+/g, "");
  if (raw.length >= 2) return raw.slice(0, 24);
  const lastHer = recent.find((line) => line.role === "assistant");
  const her = String(lastHer?.content || "").replace(/\s+/g, "");
  return her.length >= 2 ? her.slice(0, 24) : "";
}

function openerBodyHint(opts = {}) {
  ensureBody(girl);
  ensureStunFields(girl);
  const stun = effectiveStun(girl, "");
  if (stun >= 50 || inSpasm(girl)) return "";
  const aro = girl.bodyState?.arousal || 0;
  const open = getOpenness(girl);
  // 只有身體真的被刺激中（插著東西／跳蛋）或剛高潮餘韻，第一句才帶喘；性奮高本身不算。
  const sm = speechMode(girl, "");
  if (sm.mode === "afterglow") {
    return "你剛高潮過、身體還沒平復：第一句可以帶餘韻（短喘、還有點軟），不要裝完全平靜。";
  }
  if (sm.mode === "stimulated" && sm.level >= 2) {
    return `你身上現在${sm.reasons.join("、") || "還被刺激著"}：第一句要帶出來（短喘、斷句、聲音發抖），不要裝完全平靜。`;
  }
  if (opts.forceBody || stun >= 25 || aro >= 12 || open >= 45) {
    return "就算身體偏熱、性奮高，也要正常打招呼：最多一點臉紅或心不在焉；禁止喘、禁止「嗯嗯啊啊」、禁止說腿軟。";
  }
  return "";
}

function nameWaitOpener() {
  const stage = girl.stage || "stranger";
  const idx = STAGE_INDEX[stage] ?? 0;
  if ((stage === "stranger" || stage === "acquaintance") && !girl.playerName) {
    girl.nameWait = "name";
    return "（旁白：他剛走到你面前。你還不知道他的名字。用短句、冷淡一點問他怎麼稱呼就好，不要熱心。沒有特別的事就不要提外面。只輸出台詞。）";
  }
  if ((stage === "friend" || stage === "close_friend") && !girl.playerNick) {
    girl.nameWait = "nick";
    const care = stage === "close_friend" ? "可以順便問他今天怎樣。" : "語氣放軟，但不要黏。";
    return `（旁白：他叫${girl.playerName || "你"}。用一兩句問他要不要一個綽號。${care}沒有特別的事就不要提外面。只輸出台詞。）`;
  }
  if (datingBandStage(stage) && !girl.playerPet) {
    ensurePlayerNotes(girl);
    const turns = Number(girl.noteChatTurns) || 0;
    const count = Number(girl.petProposeCount) || 0;
    const coolUntil = Number(girl.petCoolUntil) || 0;
    if (count < 2 && turns >= coolUntil && girl.nameWait !== "petConfirm") {
      girl.nameWait = "petPropose";
      return "（旁白：用一兩句提議一個小名，並問他可不可以這樣叫。提議的小名可用「」包起來。等他點頭或改口才正式用，不要單方面鎖定。可以順便問他過得怎樣。沒有特別的事就不要提外面。只輸出台詞。）";
    }
  }
  return "";
}

/** first：首次長按／新抽進房 */
function firstOpener() {
  const wait = nameWaitOpener();
  if (wait) return wait;
  const body = openerBodyHint();
  const stage = girl.stage || "stranger";
  if (stage === "stranger" || stage === "acquaintance") {
    return `（旁白：他走到你面前。愛理不理，用短句、低興趣回一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "friend") {
    return `（旁白：他走到你面前。語氣放軟一點，用一兩句打招呼或問他找你幹嘛。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "close_friend" || stage === "girlfriend") {
    return `（旁白：他走到你面前。接住他一點——問他怎麼了或今天怎樣，用一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "passionate" || stage === "lover") {
    return `（旁白：他走到你面前。黏一點、熱一點，可以說想他或問他去哪了。一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "wife" || stage === "devoted_wife") {
    return `（旁白：他走到你面前。比女友更常主動招呼／問近況——問累不累、吃了沒、今天忙什麼或怎樣。一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "obedient_wife") {
    return `（旁白：他走到你面前。以他為主，招呼後問他想怎樣、想聊什麼或近況，一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  if (stage === "pathological_wife") {
    return `（旁白：他走到你面前。病態地黏上去——叫老公、問近況或想怎樣，或短句索求靠近，一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
  }
  return `（旁白：他走到你面前。用你現在的心情說一兩句。${body}沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）`;
}

/** reopen：同房關掉對話／掰掰後再開 */
function reopenOpener() {
  const wait = nameWaitOpener();
  if (wait) return wait;
  const body = openerBodyHint({ forceBody: true });
  const stage = girl.stage || "stranger";
  const base = "他剛才離開過（掰掰或關掉對話），現在又回來找你。這是新的一輪，不要接續上一句告別或結尾。";
  if (stage === "stranger" || stage === "acquaintance") {
    return `（旁白：${base}短冷一點，用一兩句重新打招呼，別熱心。${body}只輸出台詞。）`;
  }
  if (stage === "friend" || stage === "close_friend") {
    return `（旁白：${base}像朋友再開口——問他怎麼了或又找你幹嘛，一兩句。${body}只輸出台詞。）`;
  }
  if (stage === "girlfriend" || stage === "passionate" || stage === "lover") {
    return `（旁白：${base}黏一點，問他怎麼又回來、想不想你或想幹嘛，一兩句。${body}只輸出台詞。）`;
  }
  if (stage === "wife" || stage === "devoted_wife" || stage === "obedient_wife" || stage === "pathological_wife") {
    return `（旁白：${base}比女友更常主動招呼／問近況——問累不累、忙什麼、又有什麼事，一兩句。${body}只輸出台詞。）`;
  }
  return `（旁白：${base}用一兩句重新打招呼，依你們現在的關係自然反應。${body}只輸出台詞。）`;
}

/** summon：正常離開後再被召喚回來 */
function summonOpener() {
  const body = openerBodyHint();
  const stage = girl.stage || "stranger";
  const idx = STAGE_INDEX[stage] ?? 0;
  const base = `你剛被再次召喚進這房間（不是自己走回來）。可用「又把我叫回來？」這類反應。禁止報日本流水帳。${summonMoodHint()}`;
  if (idx <= (STAGE_INDEX.acquaintance ?? 1)) {
    return `（旁白：${base}陌生／低關係：不悅、冷淡、懶得理，一兩句。${body}只輸出台詞。）`;
  }
  if (idx <= (STAGE_INDEX.close_friend ?? 3)) {
    return `（旁白：${base}好友：抱怨帶笑或碎念「又叫我」，一兩句。${body}只輸出台詞。）`;
  }
  if (idx <= (STAGE_INDEX.lover ?? 6)) {
    return `（旁白：${base}戀人：黏或嗔「又把我抓回來」，一兩句。${body}只輸出台詞。）`;
  }
  return `（旁白：${base}妻子／更深：嗔或黏地應他，可問要做什麼，一兩句。${body}只輸出台詞。）`;
}

/** flee_back：侵犯逃出後再被召喚 */
function fleeBackOpener() {
  const body = openerBodyHint({ forceBody: true });
  const stage = girl.stage || "stranger";
  const idx = STAGE_INDEX[stage] ?? 0;
  const open = getOpenness(girl);
  const base = "你剛才因他太過分而逃離房間，現在又被召喚回來。餘怒／害怕／羞耻／彆扭要進第一句。不要說侵犯數字；用「剛才太過分」「你嚇到我了」這類感覺。禁止報日本流水帳。";
  if (idx <= (STAGE_INDEX.friend ?? 2) || open < 30) {
    return `（旁白：${base}低關係或低開放：罵、躲、要他保證不再亂來、或想立刻走，一兩句。${body}只輸出台詞。）`;
  }
  if (idx <= (STAGE_INDEX.lover ?? 6)) {
    return `（旁白：${base}高關係：軟著抱怨、委屈、仍生氣，但不要裝成陌生路人，一兩句。${body}只輸出台詞。）`;
  }
  return `（旁白：${base}妻子／更深：委屈嗔怪、怕又被亂來，仍認他是親密的人，一兩句。${body}只輸出台詞。）`;
}

/**
 * 依 girl.chatEnter 選開場旁白。
 * 優先 summon|flee_back（剛召回第一次）→ reopen（同房再開）→ first。
 * 用過一次後把 chatEnter 收成 reopen。
 */
function resolveEnterReason(returning) {
  const reason = girl.chatEnter || "";
  if (reason === "summon" || reason === "flee_back") return reason;
  if (returning || reason === "reopen") return "reopen";
  return "first";
}

function consumeEnterReason(reason) {
  if (!girl) return;
  if (reason === "summon" || reason === "flee_back" || reason === "first" || reason === "reopen") {
    girl.chatEnter = "reopen";
  }
}

function freshMeetLine() {
  if (!girl?.freshMeet) return "";
  return "【剛被召喚回來】中間已經隔了一陣子，這不是上一輪的下一句。先打招呼。不要接上次離開前聊到一半的話題，不要說「剛才說到」「所以剛剛那個」。你記得的事這一句先不要拿出來說，等他這次自己提起再接。";
}

function enterOpener(returning) {
  const reason = resolveEnterReason(returning);
  if (girl) girl.freshMeet = reason === "summon" || reason === "flee_back";
  let line = "";
  if (reason === "flee_back") line = fleeBackOpener();
  else if (reason === "summon") line = summonOpener();
  else if (reason === "reopen") line = reopenOpener();
  else line = firstOpener();
  consumeEnterReason(reason);
  // 情緒餘溫：重新見面也不裝沒事（level ≥15）
  const moodHint = moodOpenerHint(girl);
  if (moodHint && line) line = `${line}（旁白補充：${moodHint}）`;
  // 想念：隔了一陣子才回來（只在 test_room 閘門開時）
  const missHint = MISS_YOU_ON ? missOpenerHint(girl, { stageKey: girl.stage || "stranger", personality: basePersonality(girl) }) : "";
  if (missHint && line) line = `${line}（旁白補充：${missHint}）`;
  // 房間活動：她剛才在做的事／被叫醒
  const actTalk = girl?.roomActivity?.talk;
  const actHint = actTalk && roomActs() ? roomActs().openerHint(actTalk, girl.chrono?.wake_react || "") : "";
  if (actHint && line) line = `${line}（旁白補充：${actHint}）`;
  // 性飢渴：女友起不耐煩／妻子色色暗示或來求
  const hungerHint = HUNGER_ON && girl ? hungerOpenerHint(girl, { stageKey: girl.stage || "stranger" }) : "";
  if (hungerHint && line) line = `${line}（旁白補充：${hungerHint}）`;
  const shyHint = undressShyOpenerHint(undressStage(girl), girl.stage || "stranger");
  if (shyHint && line) line = `${line}（旁白補充：${shyHint}）`;
  const friendUp = consumeFriendUpBeat(girl);
  if (friendUp) {
    line = `${friendUp}${line ? ` ${line}` : ""}`;
  }
  const datingUp = consumeDatingUpBeat(girl);
  if (datingUp) {
    line = `${datingUp}${line ? ` ${line}` : ""}`;
  }
  const wifeUp = consumeWifeUpBeat(girl);
  if (wifeUp) {
    line = `${wifeUp}${line ? ` ${line}` : ""}`;
  }
  return line;
}

function extractQuotedPet(text) {
  const m = String(text || "").match(/「([^」]{1,8})」/);
  return m ? m[1].trim() : "";
}

function extractRenamePet(text) {
  const raw = String(text || "");
  // 需明確「叫我／改叫／稱呼我」；避免一般句子裡的「叫」誤觸
  const m = raw.match(/(?:以後)?(?:請)?(?:叫我|稱呼我|改叫我|改叫)\s*[「『"]?([^\s「」『』"'，。！？!?,.]{1,8})[」』"]?/);
  if (!m) return "";
  const name = String(m[1] || "").trim();
  if (!name || /^(你|我|他|她|老公|名字|小名)$/.test(name)) return "";
  if (/不要|別|不用|別叫/.test(raw)) return "";
  return name.slice(0, 8);
}

function isPetConfirmYes(text) {
  const t = String(text || "").replace(/\s+/g, "").trim();
  if (!t) return false;
  if (isRefusePlayerAnswer(t) || /不要叫|別叫|不用叫|叫名字|用名字就好|不要小名|別取/.test(t)) return false;
  return /^(好|可以|行|嗯+|喔+|哦+|嗯嗯|好啊|好呀|當然|沒問題|喜歡|喜歡啊|用吧|叫吧|就叫|可以啊|可以呀|答應|準|ok|OK)[。！!？?~～.…]*$/i.test(t)
    || /可以這樣叫|就這樣叫|這樣叫|叫這個|用這個|我喜歡|喜歡這個/.test(t);
}

function lockPlayerPet(who, name, reason = "確認") {
  if (!who || !name) return false;
  who.playerPet = String(name).slice(0, 8);
  who.pendingPet = "";
  who.nameWait = "";
  who.lastMark = `小名${reason}`;
  pushDebug(`小名${reason}　${who.playerPet}`);
  renderDebug();
  return true;
}

function takeCall(text, reply) {
  if (girl.nameWait === "name") {
    girl.playerName = text.slice(0, 12);
    girl.nameWait = "";
    girl.lastMark = "記下名字";
    pushDebug(`判定 記下名字　${girl.playerName}`);
    renderDebug();
    return true;
  }
  if (girl.nameWait === "nick") {
    girl.playerNick = text.slice(0, 12);
    girl.nameWait = "";
    girl.lastMark = "記下綽號";
    pushDebug(`判定 記下綽號　${girl.playerNick}`);
    renderDebug();
    return true;
  }
  // 她提議小名：只收進 pending，等玩家確認（不再自動鎖定）
  if (girl.nameWait === "petPropose" || girl.nameWait === "pet") {
    const proposed = extractQuotedPet(reply);
    if (proposed) {
      ensurePlayerNotes(girl);
      girl.pendingPet = proposed;
      girl.petProposeCount = (Number(girl.petProposeCount) || 0) + 1;
      girl.nameWait = "petConfirm";
      pushDebug(`小名提議　${proposed}（等確認・第${girl.petProposeCount}次）`);
      renderDebug();
    }
  }
  return false;
}

/**
 * 交往中小名：玩家確認／拒絕／主動改名。
 * @returns {boolean} 是否已處理（略過一般判定可選）
 */
function handlePetNameAfterUser(who, rawText) {
  const st = who?.stage || "stranger";
  // 交往中：提議／確認／改名；妻子帶：允許改名短認（老公與小名並存）
  if (!who || !(datingBandStage(st) || isWifeStage(st))) return false;
  ensurePlayerNotes(who);
  const raw = String(rawText || "").trim();
  if (!raw) return false;
  const turns = Number(who.noteChatTurns) || 0;

  // 主動改名：立刻覆蓋
  const renamed = extractRenamePet(raw);
  if (renamed && (/叫我|稱呼我|改叫|以後叫/.test(raw) || who.nameWait === "petConfirm")) {
    lockPlayerPet(who, renamed, "改名");
    who.petRenameAck = true;
    return true;
  }

  if (who.nameWait === "petConfirm") {
    if (isPetConfirmYes(raw)) {
      const name = who.pendingPet || extractQuotedPet(raw);
      if (name) {
        lockPlayerPet(who, name, "確認");
        return true;
      }
      // 點頭但沒有可寫入的名字：維持等待，不誤判成拒絕
      return true;
    }
    // 拒絕／含糊／沒明確答應：不用小名、冷卻、至多再提議一次
    who.pendingPet = "";
    who.nameWait = "";
    who.petCoolUntil = turns + 3 + Math.floor(Math.random() * 3); // 3～5 則
    pushDebug(`小名未定　冷卻至第${who.petCoolUntil}則（已提議${who.petProposeCount || 0}/2）`);
    renderDebug();
    return true;
  }
  return false;
}

function roomSight() {
  const names = window.RoomView?.furniture?.() || [];
  const list = names.length ? names.join("、") : "空的";
  return [
    "你被召喚到一間房間。你不知道這間房間在哪裡。",
    "這裡不是你在日本的家，也不是街上。你看不到家門外的路。",
    `你只看得到房間裡這些：${list}。`,
    "不要把這裡說成你的住所或日本的那個地方。那些只是你記得的。",
  ].join("");
}

/** 本回合快捷動作（askGirl 期間有效），讓 prompt 知道她是否正被刺激。 */
let promptActId = "";

/** 身體＋發聲：依「現在是否被刺激／失神／痙攣／餘韻」而非性奮高低決定能否正常說話。 */
function speechBodyPromptLines() {
  const sm = speechMode(girl, promptActId);
  return [
    ...bodyPromptLines(girl, { mode: sm.mode, level: sm.level, actId: promptActId }),
    ...moanVoicePromptLines(girl, promptActId),
  ];
}

function latestUserLine() {
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i]?.role === "user") return String(lines[i].content || "");
  }
  return "";
}

function talkSystem(userText = "") {
  const look = girl.look || {};
  const lived = lifeNotes(userText);
  const bits = [
    lived.length
      ? `你是${girl.name}。你是魅魔。被召喚來之前沒有更早的過去。離開之後在日本發生的事是真的，但人現在不在那裡。`
      : `你是${girl.name}。你是魅魔,一個沒有過去、沒有經歷的魔女。`,
    roomSight(),
    ...activityPromptLines(),
    sheIsOut() ? japanNow().line : taiwanNow().line,
    stayClockLine(),
    sheIsOut()
      ? "人在日本，時間以日本為準。不要把現在說成別的時段。"
      : "人在這間房間，時間以台灣為準。日本那邊的時間只在你記得的生活裡，不要把它說成現在。",
    "沒有過去不是沒有個性。語氣和脾氣照下面來,不要演成一張白紙。",
    `個性：${basePersonality()}。`,
    revealed("intimate") && kinkList().length ? `性癖標籤：${kinkList().join("、")}。（表現強度看下方揭示規則）` : "",
    libidoLine(),
    toneLine(),
    revealedQuirk() ? `但${revealedQuirk()}` : "",
    mannerLine(),
    reactionLine(),
    catchLine(),
    tasteLine(),
    chronoLine(),
    `外表：${look.age != null ? `${look.age}歲，` : ""}${look.hair_color || ""}${look.hair || ""}，${look.eye_color || ""}眼。${undressOutfitText(undressStage(girl), wornOutfit(girl) || "自己的衣服")}`,
    returnMood(),
    ...lived,
    "【房間聊天】",
    "只寫你說出口的話，1 到 3 句。",
    "不要旁白、不要動作、不要表情描寫、不要引號標題。",
    "依個性回話，不要無故結束對話。",
    "若對方正在摸／插你的身體：回覆必須立刻反應被碰到的部位（陰蒂／陰唇／陰道等），讓濕、腫、塞著的感覺進台詞。",
    ...speechBodyPromptLines(),
    ...afterglowPromptLines(girl),
    ...ejacTalkPromptLines(girl),
    ...friendPhysicalPromptLines(girl),
    // 被脫衣後：女友以前害羞結巴、熱戀微害羞、愛人起自在（只看 undress.stage）
    ...undressShyPromptLines({
      undressStage: undressStage(girl),
      stageKey: girl.stage || "stranger",
      personality: basePersonality(girl),
      speechMode: speechMode(girl, promptActId).mode,
    }),
    guardLine(),
    ...moodCarryPromptLines(girl, { stageKey: girl.stage || "stranger", invasion: getInvasion(girl) }),
    ...(MISS_YOU_ON ? missPromptLines(girl, { stageKey: girl.stage || "stranger", personality: basePersonality(girl) }) : []),
    ...(HUNGER_ON ? hungerPromptLines(girl, { stageKey: girl.stage || "stranger", opening: lines.length === 0 }) : []),
    ...(ORGAN_DEV_ON ? organDevPromptLines(girl, { stageKey: girl.stage || "stranger" }) : []),
    ...personalityStageLines(),
    ...kinkRevealLines(),
    ...stageTalk(),
    ...playerNotesPromptLines(girl),
    ...relationshipPreGfPromptLines(girl),
    ...relationshipDatingPromptLines(girl),
    ...relationshipWifePromptLines(girl),
    ...stageOverride(),
    freshMeetLine(),
  ];
  return bits.filter(Boolean).join("\n");
}

async function postGen(body) {
  const response = await fetch("/api/gen", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(payload, response.status));
  return payload;
}

function visibleLine(raw) {
  const text = String(raw || "");
  if (/<think\b/i.test(text) && !/<\/think\s*>/i.test(text)) return "";
  return cleanLine(text);
}

async function askOllama(route, messages, onToken, options = {}) {
  const response = await fetch("/api/llm/chat_job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider: "ollama",
      endpoint: route.endpoint,
      model: route.model,
      messages,
      options: { temperature: options.temperature ?? 0.9 },
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(errorText(payload, response.status));
  const jobId = payload.job_id;
  if (!jobId) throw new Error("沒有開始回話");
  const started = Date.now();
  let text = "";
  while (Date.now() - started < 120000) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    const status = await fetch(`/api/llm/chat_job/${jobId}`, { cache: "no-store" });
    const job = await status.json().catch(() => ({}));
    if (!status.ok) throw new Error(errorText(job, status.status));
    if (job.error && !job.text) throw new Error(job.error);
    const partial = visibleLine(job.text);
    if (partial && partial !== text) {
      text = partial;
      if (onToken) onToken(partial);
    }
    if (job.done) {
      const line = visibleLine(job.text) || text;
      if (!line) throw new Error("模型回了空訊息");
      return line;
    }
  }
  throw new Error("等太久了");
}

async function askGrok(route, messages, key = `roomtalk:${girl.id}:${Date.now().toString(36)}`, options = {}) {
  const body = {
    key,
    retry: true,
    prio: 10,
    provider: "grok-build",
    endpoint: "grok-build",
    model: route.model,
    messages,
    options: { temperature: options.temperature ?? 0.9 },
  };
  const started = Date.now();
  let result = await postGen(body);
  while (Date.now() - started < 120000) {
    if (result?.status === "done") return cleanLine(result.result);
    if (result?.status === "error") throw new Error(result.error || "回話失敗");
    await new Promise((resolve) => setTimeout(resolve, 800));
    result = await postGen({ ...body, key: result?.key || key, retry: false });
  }
  throw new Error("等太久了");
}

async function askGirl(extraUser, onToken) {
  const route = await gameChatRoute();
  const messages = [{ role: "system", content: talkSystem(latestUserLine()) }, ...lines.slice(-16)];
  if (extraUser) messages.push({ role: "user", content: extraUser });
  if (route.provider === "ollama") return askOllama(route, messages, onToken);
  return askGrok(route, messages);
}

async function openTalk() {
  if (!girl) return;
  setTalkEnabled(true);
  if (talkFor === girl.id && (lines.length || talkBusy)) {
    return;
  }
  // Closed session → fresh dialogue context; keep affection/body/names.
  const returning = !!girl.sessionEnded;
  girl.sessionEnded = false;
  talkFor = girl.id;
  lines = [];
  girl.chatLines = [];
  girl.topicHint = "";
  talkBusy = true;
  setTalkEnabled(true);
  $("portrait-name").textContent = girl.name;
  $("portrait-meta").textContent = "";
  setTyping(true);
  let streamed = false;
  try {
    ensureStunFields(girl);
    ensureTeaseFields(girl);
    // 關著對話時失神／痙攣已退：半脫的她已經穿回去（開場 prompt 照穿著寫）
    const redressedAtOpen = settleUndressAfterStun(girl);
    if (redressedAtOpen) { try { paintHalfPortrait(girl); } catch { /* ignore */ } persistRoom(); }
    // 事後算帳：關著對話時她回神了 → 這次開場就是她算帳的那句（補到滿就說完再逃）
    if (stunReckoningPending(girl) && !undressDazed(girl)) {
      setTyping(false);
      const rk = await settleStunReckoning({ redressed: redressedAtOpen });
      if (rk?.fled) {
        talkBusy = false;
        return;
      }
      if (rk?.spoke) {
        noteTalkExchange(girl);
        if (MISS_YOU_ON) noteMissSeen(girl);
        persistRoom();
        if (girl?.world) girl.world.justBack = false;
        talkBusy = false;
        if (sheetOpen() && talkFor === girl.id) setTalkEnabled(true);
        return;
      }
      setTyping(true);
    }
    const openerStun = effectiveStun(girl, "");
    refreshMissNow(girl);
    const opener = enterOpener(returning);
    let line = "";
    // 腦袋佔有度：≥95 講不出話；痙攣／失神仍問 LLM（她想說的那句），再依佔有度吃掉；餘韻（未到 65）走餘韻模板
    const openerOcc = takeOccupancy(girl, "");
    if (openerOcc.score >= 10) pushDebug(`佔有度 ${occupancyLabel(openerOcc)}`);
    if (openerOcc.score >= 95) {
      line = occupancyMoanLine(openerOcc, girl) || "……嗯啊…";
      setTyping(false);
    } else if (openerOcc.score < 65 && !inSpasm(girl) && inAfterglow(girl) && (girl.bodyState?.afterglowReplies || 0) > 0) {
      line = afterglowTemplate(girl, "") || "……哈…";
      setTyping(false);
    } else {
      // afterglowPromptLines 已進 talkSystem；此處仍用 opener 當開場提示
      const streamOk = openerStun < 25 && openerOcc.score < 10 && !openerOcc.semenOut && !inAfterglow(girl);
      const occHint = occupancyPromptLine(openerOcc);
      const openerAsk = occHint ? [opener, occHint].filter(Boolean).join("\n") : opener;
      const reply = await askGirl(openerAsk, streamOk ? (partial) => {
        if (!partial || !sheetOpen()) return;
        streamed = true;
        setTyping(false);
        $("portrait-name").textContent = girl.name;
        $("portrait-meta").textContent = partial;
      } : null);
      line = presentOccupied(girl, reply || moodFallbackLine(girl, undressShyFallback(undressStage(girl), girl.stage, "……嗯？")), "", openerOcc) || "……嗯？";
    }
    tickStunAfterReply(girl);
    // 痙攣期間不消耗餘韻回覆數，讓痙攣結束後仍鎖餘韻幾句
    if (inAfterglow(girl) && !inSpasm(girl)) consumeAfterglowReply(girl);
    if (!inSpasm(girl)) consumeEjacTalk(girl);
    noteTalkExchange(girl);
    if (MISS_YOU_ON) noteMissSeen(girl);
    decayFriendSexFlag(girl);
    if (girl.nameWait === "pet" || girl.nameWait === "petPropose") takeCall("", line);
    girl.freshMeet = false;
    lines.push({ role: "assistant", content: line });
    rememberChat();
    persistRoom();
    try { paintHalfPortrait(girl); } catch { /* ignore */ }
    if (streamed) {
      setTyping(false);
      $("portrait-name").textContent = girl.name;
      $("portrait-meta").textContent = line;
    } else await typeLine(girl.name, line);
  } catch (err) {
    if (girl) girl.freshMeet = false;
    await typeLine(girl.name, talkError(err));
  }
  if (girl?.world) girl.world.justBack = false;
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) {
    setTalkEnabled(true);
  }
}

/** 回覆後記錄本回合情緒（挑逗→生氣／害羞／羞燥；閒聊判冒犯→生氣／受傷）。 */
function noteTurnMood(actId, opts, { invAdded = 0, invWilling = false, turnMark = "平常", stunZero = false } = {}) {
  if (!girl) return;
  try {
    let m = null;
    if (actId && !opts.skipBody) {
      // 事後算帳（閘門開）：痙攣中或失神 ≥75 的動作不記任何情緒餘溫（回神結算時才記）
      if (stunZero) return;
      const label = TALK_ACTS.find((a) => a.id === actId)?.label || "動手動腳";
      m = noteMoodFromAct(girl, {
        added: invAdded,
        arousal: girl.bodyState?.arousal || 0,
        willing: invWilling,
        cause: `剛才對你「${label}」`,
      });
    } else if (!actId && turnMark === "冒犯") {
      m = noteMoodFromMark(girl, "冒犯", girl.stage || "stranger");
    } else return;
    if (m) {
      pushDebug(`情緒餘溫 ${MOOD_TYPES[m.type] || m.type} ${m.level}`);
      renderDebug();
    }
  } catch { /* ignore */ }
}

function isChangeClothesAsk(text) {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 20) return false;
  const line = raw.replace(/[。！!？?~～.…、,，\s]/g, "");
  return /^(?:請你?|幫我)?(?:去)?換(?:一套衣服|套衣服|衣服|一套|衣|裝)$/.test(line);
}

function canAskClothes(who) {
  const stage = who?.stage || "";
  return datingBandStage(stage) || isWifeStage(stage);
}

async function askRoomOnce(system, user, key, temperature) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  return route.provider === "ollama"
    ? await askOllama(route, messages, null, { temperature })
    : await askGrok(route, messages, key, { temperature });
}

async function judgeClothesWilling(text) {
  try {
    const reply = await askRoomOnce(
      "她願不願意現在去換衣服？只輸出一個詞：願意、不願意。不要解釋。",
      [
        `她是${girl.name}。關係：${STAGE_NAME[girl.stage] || girl.stage}。個性：${personaBlurb(girl)}。`,
        `現在穿：${wornOutfit(girl)}。`,
        `他說：「${text}」。`,
      ].join("\n"),
      `roomclothes:${girl.id}:${Date.now().toString(36)}`,
      0.1,
    );
    const raw = cleanLine(reply);
    if (!raw || /不願|不要|拒絕|不行|不想/.test(raw)) return false;
    return raw.includes("願意");
  } catch {
    return false;
  }
}

async function clothesRefusalLine() {
  try {
    const reply = await askRoomOnce(
      "她現在不願意去換衣服，人留在房間。只寫她說的一句話，不要旁白、不要解釋。",
      `她是${girl.name}，${personaBlurb(girl)}。他要她去換衣服。`,
      `roomclothesno:${girl.id}:${Date.now().toString(36)}`,
      0.4,
    );
    const line = cleanLine(reply).replace(/^["「『]+|["」』]+$/g, "").slice(0, 80);
    if (line) return line;
  } catch { /* 問不到就用這句 */ }
  return "……現在不想換。";
}

/** 換衣服會重畫的：半身、立繪、九個穿衣動作。不含裸體版、脫衣、做愛、剖面。 */
const CLOTHED_PACK_FIELDS = [
  ["tease_butt_packs", "tease_butt"],
  ["tease_waist_packs", "tease_waist"],
  ["tease_breast_packs", "tease_breast"],
  ["tease_breast_knead_packs", "tease_breast_knead"],
  ["tease_breast_suck_packs", "tease_breast_suck"],
  ["tease_nipple_lick_packs", "tease_nipple_lick"],
  ["tease_labia_packs", "tease_labia"],
  ["tease_labia_rub_packs", "tease_labia_rub"],
  ["tease_finger_in_packs", "tease_finger_in"],
];

function copyUrlMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const out = {};
  for (const [key, url] of Object.entries(value)) {
    if (typeof url === "string") out[key] = url;
  }
  return out;
}

function snapshotClothedPics(who) {
  const portraits = who?.portraits && typeof who.portraits === "object" ? who.portraits : {};
  const revSrc = portraits.actionPromptRev && typeof portraits.actionPromptRev === "object"
    ? portraits.actionPromptRev
    : {};
  const packs = {};
  const shots = {};
  const revs = {};
  for (const [packsKey, shotKey] of CLOTHED_PACK_FIELDS) {
    packs[packsKey] = copyUrlMap(portraits[packsKey]);
    shots[shotKey] = Object.prototype.hasOwnProperty.call(portraits, shotKey)
      ? String(portraits[shotKey] || "")
      : null;
    const prefix = `${packsKey}:`;
    for (const [key, rev] of Object.entries(revSrc)) {
      if (key.startsWith(prefix)) revs[key] = rev | 0;
    }
  }
  return {
    half: Object.prototype.hasOwnProperty.call(portraits, "half") ? String(portraits.half || "") : null,
    portrait: String(who?.portrait || ""),
    hadPortrait: Object.prototype.hasOwnProperty.call(who || {}, "portrait"),
    standee: copyUrlMap(portraits.standee),
    hadStandee: Object.prototype.hasOwnProperty.call(portraits, "standee"),
    packs,
    shots,
    revs,
  };
}

function restoreClothedPics(who, snap) {
  if (!who || !snap || typeof snap !== "object") return;
  who.portraits = who.portraits && typeof who.portraits === "object" ? who.portraits : {};
  const portraits = who.portraits;
  if (snap.half) portraits.half = String(snap.half);
  else delete portraits.half;
  if (snap.hadPortrait) who.portrait = String(snap.portrait || "");
  else delete who.portrait;
  if (snap.hadStandee && snap.standee) portraits.standee = { ...snap.standee };
  else delete portraits.standee;
  for (const [packsKey, shotKey] of CLOTHED_PACK_FIELDS) {
    const saved = snap.packs?.[packsKey];
    if (saved && typeof saved === "object") portraits[packsKey] = { ...saved };
    else delete portraits[packsKey];
    const shot = snap.shots ? snap.shots[shotKey] : null;
    if (shot) portraits[shotKey] = String(shot);
    else delete portraits[shotKey];
  }
  const hadRev = portraits.actionPromptRev && typeof portraits.actionPromptRev === "object";
  const revs = hadRev ? portraits.actionPromptRev : {};
  for (const [packsKey] of CLOTHED_PACK_FIELDS) {
    const prefix = `${packsKey}:`;
    for (const key of Object.keys(revs)) {
      if (key.startsWith(prefix)) delete revs[key];
    }
  }
  for (const [key, rev] of Object.entries(snap.revs || {})) revs[key] = rev | 0;
  if (hadRev || Object.keys(revs).length) portraits.actionPromptRev = revs;
}

function restoreClothesErrand(who) {
  if (!who) return;
  if (who.errandPrevName) who.outfitName = who.errandPrevName;
  if (Object.prototype.hasOwnProperty.call(who, "errandPrevPick")) who.outfitPick = who.errandPrevPick;
  if (who.errandPrevClothed && typeof who.errandPrevClothed === "object") {
    restoreClothedPics(who, who.errandPrevClothed);
    return;
  }
  if (!Object.prototype.hasOwnProperty.call(who, "errandPrevHalf")) return;
  who.portraits = who.portraits || {};
  const prev = String(who.errandPrevHalf || "");
  if (prev) {
    who.portraits.half = prev;
    who.portrait = prev;
  } else {
    delete who.portraits.half;
  }
}

function clearClothesErrandMarks(who) {
  if (!who) return;
  delete who.errand;
  delete who.errandPrevName;
  delete who.errandPrevPick;
  delete who.errandPrevHalf;
  delete who.errandPrevClothed;
  delete who.summonQueueId;
  delete who.summonQueueMode;
}

/** 關掉頁面或產圖失敗：穿回出門前那一套，不能卡在換衣服。 */
function abortClothesErrand(who = girl) {
  if (!who || who.errand !== "clothes") return false;
  restoreClothesErrand(who);
  clearClothesErrandMarks(who);
  try { window.RoomActor?.conceal?.(false); } catch { /* */ }
  return true;
}

/** 人還在這趟停留裡。不回日本。只重畫穿衣的圖，下載完才回來。失敗穿舊衣服。 */
async function runClothesErrand(next) {
  const who = girl;
  if (!who || !next) return;
  who.errand = "clothes";
  who.errandPrevName = who.outfitName || wornOutfit(who);
  who.errandPrevPick = who.outfitPick ?? null;
  delete who.errandPrevHalf;
  who.errandPrevClothed = snapshotClothedPics(who);
  applyWornPick(who, next);
  if (sheetOpen()) hideSheet();
  try { window.RoomActor?.conceal?.(true); } catch { /* */ }
  setSummonTalkBusy(true);
  const status = $("summon-status");
  if (status) status.textContent = `${who.name}去換衣服了。`;
  paintSexSetProgress("換衣服…");
  persistRoom();
  let queued = null;
  let failed = false;
  try {
    queued = await pregenSummonBundle(who, {
      portraits: true,
      sex: false,
      clothedOnly: true,
      halfOnly: false,
      mode: "clothes",
      onProgress: (text) => paintSexSetProgress(`換衣服 ${text}`),
    });
    failed = !(queued && queued.finished && !queued.failed && queued.done > 0);
  } catch (err) {
    failed = true;
    console.warn("[clothes]", err?.message || err);
  }
  const ack = async () => {
    if (!queued?.id) return;
    try { await ackSummonQueue(queued.id); } catch { /* */ }
  };
  if (girl !== who) {
    abortClothesErrand(who);
    await ack();
    setSummonTalkBusy(false);
    paintSexSetProgress("");
    return;
  }
  if (failed) restoreClothesErrand(who);
  else await cacheVisitPics(who);
  await ack();
  clearClothesErrandMarks(who);
  try { window.RoomActor?.conceal?.(false); } catch { /* */ }
  setSummonTalkBusy(false);
  paintSexSetProgress("");
  if (!failed) {
    try { clearVisitUndress(who); } catch { /* */ }
  }
  try { paintHalfPortrait(who); } catch { /* */ }
  const due = who.leaveAfterErrand || visitDue(who.roomVisitUntil, Date.now());
  delete who.leaveAfterErrand;
  persistRoom();
  if (due && !sheIsOut()) {
    if (status) {
      status.textContent = failed
        ? `${who.name}沒換成，停留時間到了，離開房間。`
        : `${who.name}換好衣服，停留時間到了，離開房間。`;
    }
    await letHerLeave();
    return;
  }
  if (status) {
    status.textContent = failed
      ? `${who.name}沒換成，還是穿著原來的衣服。`
      : `${who.name}換好了，回到房間。`;
  }
  try { renderCard(); } catch { /* */ }
}

async function maybeHandleClothesAsk(raw) {
  if (!isChangeClothesAsk(raw) || !canAskClothes(girl)) return false;
  if (sexChatActive() || activeRoomScene || undressPlay) return false;
  lines.push({ role: "user", content: raw });
  talkBusy = true;
  setTalkEnabled(true);
  try {
    await typeLine("你", raw);
    const next = pickChangeOutfit(girl.look, wornOutfit(girl));
    if (!next) {
      const line = "就這一套，沒有別的可以換。";
      lines.push({ role: "assistant", content: line });
      await typeLine(girl.name, line);
      return true;
    }
    const willing = await judgeClothesWilling(raw);
    if (!willing) {
      const line = await clothesRefusalLine();
      lines.push({ role: "assistant", content: line });
      await typeLine(girl.name, line);
      return true;
    }
    const line = "我去換一套。";
    lines.push({ role: "assistant", content: line });
    await typeLine(girl.name, line);
    await runClothesErrand(next);
    return true;
  } finally {
    if (girl?.errand !== "clothes") talkBusy = false;
    if (sheetOpen() && talkFor === girl?.id && girl?.errand !== "clothes") setTalkEnabled(true);
    try { persistRoom(); } catch { /* */ }
  }
}

async function deliverUserTalk(text, opts = {}) {
  const raw = String(text || "").trim();
  if (!girl || !raw) return;
  if (girl.errand === "clothes") return;
  if (isFarewell(raw)) {
    girl.lastMark = "結束對話";
    pushDebug("結束對話");
    renderDebug();
    hideSheet();
    return;
  }
  if (talkBusy || talkFor !== girl.id) return;
  if (!opts.actId && await maybeHandleClothesAsk(raw)) return;

  ensureBody(girl);
  ensureStunFields(girl);
  ensureTeaseFields(girl);
  ensureOpenness(girl);
  ensureInvasion(girl);
  player = ensurePlayer(player);

  // 言語調戲／打字動手（verbal_tease.js）：動手而且對得上一顆已解鎖的調戲鈕 → 當成按那顆鈕；
  // 只提到部位沒動手、或那顆鈕還沒解鎖／現在不能調戲 → 言語調戲（性奮小加、上限＝剛好解鎖摸陰唇、侵犯微漲、不算刺激）
  let verbalTease = null;
  if (!opts.actId && !opts.skipBody) {
    const cls = classifyUserText(raw);
    if (cls.kind === "touch" && cls.actId && canTease(player) && actLockState(girl, cls.actId).ok) {
      opts = { ...opts, actId: cls.actId, typedAct: true };
      pushDebug(`打字動手 → 當成按「${TALK_ACTS.find((a) => a.id === cls.actId)?.label || cls.actId}」`);
    } else if (cls.kind === "verbal" || (cls.kind === "touch" && cls.actId)) {
      verbalTease = { hit: cls.hit, blocked: cls.kind === "touch" };
    }
  }

  if (opts.actId) {
    if (!canTease(player)) {
      const status = $("summon-status");
      if (status) status.textContent = teaseBlockReason(player);
      refreshTalkActs();
      return;
    }
    const lock = actLockState(girl, opts.actId);
    if (!lock.ok) {
      const status = $("summon-status");
      if (status) status.textContent = lock.reason || "尚未解鎖";
      refreshTalkActs();
      return;
    }
  }

  lines.push({ role: "user", content: raw });
  talkBusy = true;
  setTalkEnabled(true);
  let moodTurn = null;
  // 侵犯值：每一句閒聊都降。開心 −8..10，否則 −1..2。動手與言語調戲不加這筆。
  const affBeforeLine = Number(girl.affection) || 0;
  let chatInvDecay = false;
  // 想念：對話開著但隔了很久才開口，也算重逢——這句她先表現想念，下一句才算「回應重逢」並開始消
  let missFresh = false;
  if (!opts.actId) {
    const mr = refreshMissNow(girl);
    missFresh = !!(mr && mr.added > 0 && mr.reunion);
  }

  try {
    // 先立刻顯示玩家台詞，避免等 LLM／判定時畫面上無反應
    await typeLine("你", raw);
    // 失神／痙攣剛退（閒置 tick 還沒輪到）：半脫的她先穿回去，再回這句
    const redressedAtStart = settleUndressAfterStun(girl);
    if (redressedAtStart) {
      try { paintHalfPortrait(girl); } catch { /* ignore */ }
      lines.push({ role: "assistant", content: REDRESS_NOTE });
      await typeLine("旁白", REDRESS_NOTE);
      persistRoom();
    }
    // 事後算帳：她已經回神但還沒結算（閒置計時器沒輪到）→ 先算帳再回這句
    if (stunReckoningPending(girl) && !undressDazed(girl)) {
      const rk = await settleStunReckoning({ redressed: redressedAtStart });
      if (rk?.fled) return;
    }

    // 互相認識：計數／拒絕／訂正／寫入（挑逗動作略過寫入）
    ensurePlayerNotes(girl);
    if (!opts.actId) {
      girl.noteChatTurns = (Number(girl.noteChatTurns) || 0) + 1;
      handlePlayerNotesAfterUser(girl, raw);
    }

    let climaxLine = "";
    let spasmNote = "";
    let herClimaxNow = false;
    let textBodyHit = false;
    let actArousalBefore = null;
    if (!opts.skipBody) {
      if (opts.actId) {
        const stunBefore = calcStun(girl);
        const arousalBefore = girl.bodyState?.arousal || 0;
        actArousalBefore = arousalBefore;
        const stageBefore = arousalStage(arousalBefore);
        applyAct(girl, opts.actId);
        recordTeasePress(girl, opts.actId);
        noteActShock(girl, opts.actId);
        if (HUNGER_ON) {
          // 朋友起：飢渴時被碰，性奮多漲一點；每次動手飢渴小降
          const hb = hungerArousalBonus(girl, Date.now(), girl.stage || "stranger");
          if (hb && girl.bodyState) girl.bodyState.arousal = clampBody((girl.bodyState.arousal || 0) + hb);
          hungerRelief("touch");
        }
        organDevTouch(TALK_ACTS.find((a) => a.id === opts.actId)?.hitId);
        if (opts.actId === "butt") void maybeGenButtShot(girl, opts.actId);
        if (opts.actId === "waist") void maybeGenWaistShot(girl, opts.actId);
        if (opts.actId === "breast") void maybeGenBreastShot(girl, opts.actId);
        if (opts.actId === "breast_knead") void maybeGenKneadShot(girl, opts.actId);
        if (opts.actId === "breast_suck") void maybeGenSuckShot(girl, opts.actId);
        if (opts.actId === "nipple_lick") void maybeGenLickShot(girl, opts.actId);
        if (opts.actId === "labia") void maybeGenLabiaShot(girl, opts.actId);
        if (opts.actId === "labia_rub") void maybeGenLabiaRubShot(girl, opts.actId);
        if (opts.actId === "pull_out") clearActionFlash();
        if (opts.actId === "finger_in") void maybeGenFingerShot(girl, opts.actId);
        if (opts.actId === "vagina_finger" || opts.actId === "cervix_rub") {
          // x-ray 剖面圖組關著（XRAY_ACTION_PACKS_ON=false）→ 借插入手指的圖（全裸＋閘門開時借裸體版）
          if (XRAY_ACTION_PACKS_ON) void maybeGenOwnActionShot(girl, opts.actId);
          else void maybeGenFingerShot(girl, "finger_in");
        }
        // 情感：一般挑逗不加；接近高潮／失神門檻才小幅＋1，痙攣／射精＋2
        const nearClimax = stunBefore >= 50 || arousalBefore >= 22
          || (girl.bodyState?.arousal || 0) >= 22
          || effectiveStun(girl, opts.actId) >= 50;
        if (nearClimax) bumpAffection(1, "接近高潮");
        const spasm = applyTeaseSpasm(girl, opts.actId, stunBefore);
        if (spasm.enteredSpasm) {
          spasmNote = "（她突然痙攣——身體止不住地顫。）";
          bumpAffection(2, "痙攣");
          noteAfterglow(girl, "hers");
        } else if (spasm.enteredPain) {
          spasmNote = "（過感——一碰全身就一陣陣抽搐，叫聲停不下來。）";
        }
        const stageAfter = arousalStage(girl.bodyState?.arousal || 0);
        if (stageBefore !== "climax" && stageAfter === "climax") {
          noteAfterglow(girl, "hers");
          herClimaxNow = true;
        }
        if (spasm.enteredSpasm || herClimaxNow) { hungerRelief("orgasm"); organDevOrgasm(); }
        const stunAfter = effectiveStun(girl, opts.actId);
        // 首次因 stun≥75 進入 skip-LLM（非痙攣路徑也標她高潮餘韻）
        if (stunBefore < 75 && stunAfter >= 75) {
          noteAfterglow(girl, "hers");
        }
        const climax = applyTeaseClimax(player, opts.actId);
        player = climax.player;
        settleKidney("tease");
        if (climax.climaxed) {
          climaxLine = climax.line;
          bumpAffection(2, "射精");
          // 挑逗達標射精：預設外射／興奮洩精（未走內射命中不會灌子宮）
          const inSex = girlInPenisSex(girl);
          noteAfterglow(girl, "his", { ejac: "external" });
          // 規則1：沒在正戲、只因興奮洩精 → 中央提示 1 秒
          if (!inSex) showClimaxTip("射精了！");
        }
      } else if (verbalTease) {
        const vt = applyVerbalTease(girl, verbalTease.hit, {
          affection: Number(girl.affection) || 0,
          stage: girl.stage || "stranger",
          dazed: STUN_RECKONING_ON && undressDazed(girl),
        });
        verbalTease.res = vt;
        textBodyHit = true;
        pushDebug(`言語調戲（${verbalTease.hit.id}${verbalTease.blocked ? "・想動手但還沒解鎖" : ""}）性奮 +${vt.gain}（上限 ${vt.cap}）→ ${vt.arousal}・侵犯 +${vt.invAdded} → ${vt.invasion}/${INVASION_MAX}`);
        renderDebug();
      } else {
        const hit = applyBodyFromUserText(girl, raw);
        textBodyHit = !!hit;
        // 器官開發度：真的動手（有動手動詞）或插入／內射才算
        if (hit && girl.bodyState?.lastPart && (girl.bodyState.touchVerb || ["penis_in", "creampie"].includes(girl.bodyState.lastPart))) organDevTouch(girl.bodyState.lastPart);
        if (hit && girl.bodyState?.lastPart) noteActShock(girl, girl.bodyState.lastPart);
        // 玩家明文內射：餘韻走內射台詞；否則若只寫射精／射了則外射承認
        if (hit && hit.id === "creampie") {
          noteAfterglow(girl, "his", { ejac: "creampie" });
        } else if (hit && /射精|射了|射出來|外射|繳械|洩了/.test(raw)
          && !/內射|射進|灌進|中出|射在裡面/.test(raw)) {
          noteAfterglow(girl, "his", { ejac: "external" });
          if (!girlInPenisSex(girl)) showClimaxTip("射精了！");
        }
        // 閒聊：每一句都降侵犯（一般 −1..2、開心 −8..10）
        chatInvDecay = true;
      }
    }
    renderBodyPanel();
    refreshTalkActs();
    persistRoom();

    // 挑逗動作略過 judgeTurn（避免多等一次 LLM 卡住）
    let turnMark = "平常";
    decayMoodByTime(girl);
    if (!opts.actId) {
      const petHandled = handlePetNameAfterUser(girl, raw);
      const naming = takeCall(raw, "");
      if (!naming && !petHandled) {
        turnMark = await judgeTurn(raw);
        applyMark(turnMark);
      }
      // 想念：重逢後第一句被接住 → 額外感情（一次）
      if (MISS_YOU_ON && girl && !missFresh) {
        const bonus = takeMissBonus(girl, turnMark);
        if (bonus) bumpAffection(bonus, "想念被接住");
      }
      if (chatInvDecay && girl) {
        const missHappy = MISS_YOU_ON && !missFresh && !textBodyHit && missReunionHappy(girl, turnMark);
        const happy = missHappy || chatLineHappy({
          mark: turnMark,
          affBefore: affBeforeLine,
          affAfter: Number(girl.affection) || 0,
          worldMood: girl.world?.mood || "",
          moodType: getMoodCarry(girl)?.type || "",
          bodyHit: textBodyHit,
        });
        const invBefore = getInvasion(girl);
        const dropped = decayInvasion(girl, chatInvasionDrop(happy));
        if (dropped > 0) {
          pushDebug(`侵犯 −${dropped}${happy ? "（她開心）" : ""} → ${invBefore - dropped}/${INVASION_MAX}`);
          renderDebug();
        }
        lastChatInvDecay = { happy, dropped, mark: turnMark };
        try { renderBodyPanel(); renderDebug(); } catch { /* ignore */ }
        persistRoom();
      }
      // 情緒餘溫：每句閒聊衰減（接住／道歉較快、侵犯高較慢；冒犯本句不衰減；用文字摸她不算閒聊）
      if (!textBodyHit) {
        decayMoodPerLine(girl, {
          stageKey: girl.stage || "stranger",
          mark: turnMark,
          text: raw,
          invasion: getInvasion(girl),
        });
      }
    }
    // 想念：跟她互動（閒聊或動作）就消掉一截，約 3 句歸零
    if (MISS_YOU_ON && girl && !missFresh) {
      const was = getMiss(girl);
      const d = drainMissPerLine(girl);
      noteMissSeen(girl);
      if (d > 0) pushDebug(`想念 −${d} → ${was - d}`);
      renderDebug();
      persistRoom();
    }

    // 升上朋友：極淡旁白（含本輪判定剛升階、或進房前遺留）
    {
      const friendUp = consumeFriendUpBeat(girl);
      if (friendUp) {
        lines.push({ role: "assistant", content: friendUp });
        await typeLine("旁白", friendUp);
        persistRoom();
      }
    }

    if (climaxLine) {
      lines.push({ role: "user", content: climaxLine });
      await typeLine("你", climaxLine);
    }
    if (spasmNote) {
      lines.push({ role: "user", content: spasmNote });
      await typeLine("旁白", spasmNote);
    }
    if (climaxLine || spasmNote) persistRoom();

    // 侵犯值：動作後擲骰；滿值則逃離房間。保留本回合 added 供抗議語氣。
    let invAdded = 0;
    let invWilling = false;
    let invToneOpts = { willing: false };
    let invTotal = getInvasion(girl);
    let stunZero = false;
    if (opts.actId && !opts.skipBody) {
      ensureInvasion(girl);
      // 事後算帳（閘門開）：痙攣中或失神 ≥75 → 侵犯值一點都不漲，整筆「清醒時本來會漲的量」記成欠帳，回神再結算
      stunZero = STUN_RECKONING_ON && undressDazed(girl);
      const invRoll = stunZero
        ? { added: 0, invasion: getInvasion(girl), fled: false, willing: false, tokenCap: 12, personality: basePersonality(girl), arousalMult: null }
        : applyInvasionRoll(girl, opts.actId, {
          stage: girl.stage || "stranger",
          stun: effectiveStun(girl, opts.actId),
          // 半推半就：用動作「之前」她已有的興奮判斷（性慾讀 bodyState）
          arousal: actArousalBefore,
          // 個性抗拒倍率＋語氣（基底個性＋害羞／主動 stats）
          personality: basePersonality(girl),
          stats: girl.stats || null,
        });
      invAdded = invRoll.added || 0;
      invWilling = !!invRoll.willing;
      invToneOpts = { willing: invWilling, tokenCap: invRoll.tokenCap ?? 12, personality: invRoll.personality || "" };
      invTotal = invRoll.invasion;
      if (stunZero) {
        const normal = normalInvasionFor(opts.actId, { stage: girl.stage || "stranger", personality: basePersonality(girl), stats: girl.stats || null });
        const label = TALK_ACTS.find((a) => a.id === opts.actId)?.label || "動手動腳";
        if (normal > 0) noteStunDebt(normal, label);
      }
      if (invRoll.added > 0) {
        const pt = protestTone(invRoll.added, invToneOpts);
        const am = invRoll.arousalMult != null && invRoll.arousalMult < 1 ? `（興奮×${invRoll.arousalMult}）` : "";
        pushDebug(`侵犯 +${invRoll.added}${am} → ${invRoll.invasion}/${INVASION_MAX}${pt.tier !== "none" ? `・抗議${pt.label}` : ""}`);
        renderDebug();
      }
      persistRoom();
      refreshTalkActs();
      if (invRoll.fled) {
        const fleeNote = `（旁白：侵犯感爆滿——${girl.name}推開你，慌忙逃離了房間。）`;
        lines.push({ role: "assistant", content: fleeNote });
        await typeLine("旁白", fleeNote);
        persistRoom();
        await fleeRoomFromInvasion();
        return;
      }
    }

    if (verbalTease?.res?.fled) {
      const fleeNote = `（旁白：侵犯感爆滿——${girl.name}推開你，慌忙逃離了房間。）`;
      lines.push({ role: "assistant", content: fleeNote });
      await typeLine("旁白", fleeNote);
      persistRoom();
      await fleeRoomFromInvasion();
      return;
    }

    // 情緒餘溫：本回合的侵犯／挑逗／冒犯在 finally 記下（LLM 失敗也記），下一句起帶進 prompt
    // 只有語氣真的走「半推半就」（增益 ≤ tokenCap）才把情緒記成羞燥
    // 事後算帳（閘門開）：失神／痙攣中的動作不記情緒，情緒交給回神結算
    moodTurn = { invAdded, invWilling: invWilling && invAdded <= (invToneOpts.tokenCap ?? 12), turnMark, stunZero };

    if (!sheetOpen() || talkFor !== girl.id) return;

    const actId = opts.actId || "";
    const stun = effectiveStun(girl, actId);
    setTyping(true);
    $("portrait-name").textContent = girl.name;
    let streamed = false;
    let line = "";
    try {
      // 腦袋佔有度（0–100）：≥95 講不出話（本地呻吟）；其餘一律問 LLM 拿「她想說的那句」，再依佔有度吃掉。
      // 餘韻強制回覆數尚餘且佔有度未到 65 → 餘韻模板（同舊行為）。
      const occ = takeOccupancy(girl, actId, { climaxNow: herClimaxNow });
      if (occ.score >= 10) { pushDebug(`佔有度 ${occupancyLabel(occ)}`); renderDebug(); }
      if (occ.score >= 95) {
        line = occupancyMoanLine(occ, girl) || "……嗯啊…";
        setTyping(false);
      } else if (occ.score < 65 && !inSpasm(girl) && inAfterglow(girl) && (girl.bodyState?.afterglowReplies || 0) > 0) {
        line = afterglowTemplate(girl, actId) || "……哈…腿…軟…";
        setTyping(false);
      } else {
        const streamOk = stun < 25 && occ.score < 10 && !occ.semenOut && !inSpasm(girl) && !inAfterglow(girl);
        const protestExtra = actId ? protestPromptBlock(invAdded, { invasion: invTotal, ...invToneOpts }) : "";
        // afterglowPromptLines 已在 talkSystem；若仍餘韻（僅時間門檻）再塞一層
        const agLines = inAfterglow(girl) ? afterglowPromptLines(girl).join("\n") : "";
        const verbalExtra = verbalTease ? verbalTeasePrompt(verbalTease.hit, { blocked: verbalTease.blocked }) : "";
        const extra = [protestExtra, agLines, verbalExtra, occupancyPromptLine(occ)].filter(Boolean).join("\n") || null;
        promptActId = actId;
        let reply = "";
        try {
          reply = await askGirl(extra, streamOk ? (partial) => {
            if (!partial || !sheetOpen()) return;
            streamed = true;
            setTyping(false);
            $("portrait-name").textContent = girl.name;
            $("portrait-meta").textContent = partial;
          } : null);
        } finally {
          promptActId = "";
        }
        line = presentOccupied(girl, reply || moodFallbackLine(girl, undressShyFallback(undressStage(girl), girl.stage, "……")), actId, occ) || "……";
        if (actId && invAdded > 1 && !inAfterglow(girl) && occ.score < 65) line = blendProtestReply(line, invAdded, invToneOpts) || line;
      }
      if (girl.guard) girl.guard -= 1;
      tickStunAfterReply(girl);
      const redressedAfter = settleUndressAfterStun(girl);
      // 先 scrub（依 afterglowEjac），再扣餘韻回覆數
      line = scrubFalseCreampieLine(line, girl) || line;
      if (inAfterglow(girl) && !inSpasm(girl)) consumeAfterglowReply(girl);
      if (!inSpasm(girl)) consumeEjacTalk(girl);
      noteTalkExchange(girl);
      decayFriendSexFlag(girl);
      if (!opts.actId) handlePlayerNotesAfterReply(girl, line);
      lines.push({ role: "assistant", content: line });
      rememberChat();
      persistRoom();
      try {
        if (undressStage(girl) >= 3) rollNudeStandee(girl);
        paintHalfPortrait(girl, { teasing: !!actId, actId, stun });
      } catch { /* ignore */ }
      if (streamed && stun < 25) {
        setTyping(false);
        $("portrait-name").textContent = girl.name;
        $("portrait-meta").textContent = line;
      } else {
        await typeLine(girl.name, line);
      }
      if (redressedAfter && girl && sheetOpen()) {
        lines.push({ role: "assistant", content: REDRESS_NOTE });
        await typeLine("旁白", REDRESS_NOTE);
        persistRoom();
      }
      // 事後算帳：這句之後她回神了 → 穿衣旁白之後說一句（補到滿就說完再逃）
      if (girl && stunReckoningPending(girl) && !undressDazed(girl)) {
        const rk = await settleStunReckoning({ redressed: !!redressedAfter });
        if (rk?.fled) return;
      }
    } catch (err) {
      setTyping(false);
      await typeLine(girl.name, talkError(err));
    }
  } catch (err) {
    setTyping(false);
    try { await typeLine(girl.name, talkError(err)); } catch { /* ignore */ }
  } finally {
    if (moodTurn) {
      noteTurnMood(opts.actId || "", opts, moodTurn);
      persistRoom();
    }
    talkBusy = false;
    if (sheetOpen()) setTalkEnabled(true);
    refreshTalkActs();
  }
}


async function sendTalk(event) {
  event.preventDefault();
  if (!girl) return;
  const input = $("talk-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  await deliverUserTalk(text);
}

async function sendTalkAct(actId) {
  if (!girl || talkBusy || talkFor !== girl.id) return;
  const act = TALK_ACTS.find((a) => a.id === actId);
  if (!act) return;
  await deliverUserTalk(act.text, { actId });
}

function undressPlayOpen() {
  if (undressChatActive()) return sheetOpen();
  return activeRoomScene === "undress-play" && !!undressPlay && !$("room-scene-overlay")?.hidden;
}

/** 痙攣或失神（≥75）且還沒脫光，對話才出現「脫衣服」。 */
function undressEntryUnlocked(who = girl) {
  if (!who || undressStage(who) >= 3) return false;
  ensureStunFields(who);
  if (inSpasm(who)) return true;
  return stunTier(effectiveStun(who, "")) === "stun";
}

function setUndressDialogue(speaker, text) {
  if (undressChatMode) {
    // 對話版：打在對話框（名字＋內容），跟一般聊天同一個框
    const line = String(text || "");
    if (!line || line === "……") {
      typeJob += 1;
      if ($("portrait-name")) $("portrait-name").textContent = speaker || "";
      if ($("portrait-meta")) $("portrait-meta").textContent = line || "……";
      setTyping(line === "……" && !!undressPlay?.busy);
      return;
    }
    void typeLine(speaker || "", line);
    return;
  }
  const body = $("room-scene-body");
  if (!body) return;
  body.replaceChildren();
  if (speaker) {
    const who = document.createElement("span");
    who.className = "undress-who";
    who.textContent = speaker;
    body.append(who);
  }
  const tx = document.createElement("span");
  tx.className = "undress-tx";
  tx.textContent = text || "";
  body.append(tx);
}

function paintUndressPlayFigure() {
  if (!girl || activeRoomScene !== "undress-play" || !undressPlay) return;
  if (undressChatMode) {
    // 對話版：用對話框原本的立繪（undressPortraitShot 優先，缺圖退半身／立繪槽）
    try { paintHalfPortrait(girl); } catch { /* ignore */ }
    return;
  }
  const shot = undressPortraitShot(girl);
  const staged = shot ? String(girl.portraits?.[shot] || "") : "";
  const url = staged || standingPortraitUrl(girl);
  if (url) paintSceneFigure(url, `${girl.name || ""}的立繪`);
  else clearSceneFigure();
  sceneCard()?.classList.add("undress-play");
}

/** 對話版脫衣的底部按鈕列（取代互動列內容；保留精液／興奮提示）。 */
function renderUndressChatBar() {
  const row = $("talk-acts");
  if (!row || !undressPlay) return;
  row.hidden = !sheetOpen() || !girl;
  row.classList.add("undress-bar");
  player = ensurePlayer(player);
  updatePlayerHint(ensurePlayerHint(row), player);
  for (const btn of [...row.querySelectorAll("button")]) btn.remove();
  const busy = !!undressPlay.busy;
  const add = (id, label, onClick, extra = {}) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.undress = id;
    btn.textContent = label;
    btn.disabled = !!extra.disabled;
    if (extra.title) btn.title = extra.title;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      onClick();
    });
    row.append(btn);
    return btn;
  };
  if (undressPlay.phase === "choose") {
    add("tell", "叫她脫", () => void playUndress("tell"), { disabled: busy });
    add("help", "幫她脫", () => void playUndress("help"), { disabled: busy });
  } else {
    add("next", "下一句", () => advanceUndressPlay(), { disabled: busy });
  }
  add("back", "回到對話", () => closeRoomScene(), { title: "離開脫衣，回到一般對話" });
}

function renderUndressPlayChoices() {
  if (undressChatMode) {
    renderUndressChatBar();
    return;
  }
  const box = $("room-scene-choices");
  if (!box || !undressPlay) return;
  box.replaceChildren();
  box.hidden = false;
  const busy = !!undressPlay.busy;
  if (undressPlay.phase === "choose") {
    for (const act of [
      { id: "tell", label: "叫她脫" },
      { id: "help", label: "幫她脫" },
    ]) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.textContent = act.label;
      btn.disabled = busy;
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        void playUndress(act.id);
      });
      box.append(btn);
    }
    return;
  }
  const btn = document.createElement("button");
  btn.type = "button";
  btn.textContent = "下一句";
  btn.disabled = busy;
  btn.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    if (btn.disabled) return;
    advanceUndressPlay();
  });
  box.append(btn);
}

function openUndressPlay() {
  if (!girl || !sheetOpen() || !undressEntryUnlocked(girl)) return;
  undressPlay = { phase: "choose", reply: "", ending: "", busy: false };
  activeRoomScene = "undress-play";
  undressView += 1;
  activeUndressShot = "";
  talkBusy = true;
  undressChatMode = UNDRESS_CHAT_ON;
  if (undressChatMode) {
    // 對話版：留在對話框，藏輸入框，底部換脫衣按鈕
    clearActionFlash();
    undressChatPrev = {
      name: $("portrait-name")?.textContent || "",
      meta: $("portrait-meta")?.textContent || "",
    };
    $("portrait-sheet")?.classList.add("undress-chat");
    setTalkEnabled(false);
    setUndressDialogue("旁白", "（脫衣服——選「叫她脫」或「幫她脫」。）");
    paintUndressPlayFigure();
    renderUndressPlayChoices();
    return;
  }
  const overlay = $("room-scene-overlay");
  if (!overlay) return;
  sceneCard()?.classList.add("undress-play");
  const title = $("room-scene-title");
  if (title) title.textContent = "脫衣服";
  overlay.hidden = false;
  setUndressDialogue("", "……");
  paintUndressPlayFigure();
  renderUndressPlayChoices();
  const acts = $("talk-acts");
  if (acts) acts.hidden = true;
}

function finishUndressPlay(lastLine) {
  const name = girl?.name || "";
  const line = String(lastLine || "");
  closeRoomScene();
  if (line && sheetOpen() && girl) {
    const who = $("portrait-name");
    const meta = $("portrait-meta");
    if (who) who.textContent = name;
    if (meta) meta.textContent = line;
  }
  try { paintHalfPortrait(girl); } catch { /* ignore */ }
}

function advanceUndressPlay() {
  if (!undressPlay || undressPlay.busy || !girl) return;
  if (undressPlay.phase === "narr") {
    undressPlay.phase = "reply";
    setUndressDialogue(girl.name || "她", undressPlay.reply || "……");
    renderUndressPlayChoices();
    return;
  }
  if (undressPlay.phase !== "reply") return;
  const ending = undressPlay.ending;
  const reply = undressPlay.reply || "";
  if (ending === "flee") {
    undressPlay = null;
    void fleeRoomFromUndress();
    return;
  }
  if (ending === "climax" || ending === "nude") {
    finishUndressPlay(reply);
    return;
  }
  undressPlay.phase = "choose";
  undressPlay.reply = "";
  undressPlay.ending = "";
  renderUndressPlayChoices();
}

/** 畫面裡才選。幫她脫：2/3 進一階，1/3 逃走。叫她脫：不逃走，1/3 才進一階。旁白與她的話用下一句分開看。 */
async function playUndress(mode) {
  if (!undressPlay || undressPlay.busy || undressPlay.phase !== "choose") return;
  if (!girl || !undressPlayOpen()) return;
  if (undressStage(girl) >= 3) {
    finishUndressPlay("");
    return;
  }
  player = ensurePlayer(player);
  if (!canTease(player)) {
    setUndressDialogue("", teaseBlockReason(player));
    return;
  }

  const help = mode === "help";
  undressPlay.busy = true;
  renderUndressPlayChoices();
  setUndressDialogue("旁白", "……");
  try {
    const playerLine = help ? "（你動手脫她的衣服。）" : "（你叫她把衣服脫掉。）";
    lines.push({ role: "user", content: playerLine });

    const climax = applyTeaseClimax(player, help ? "undress_help" : "undress_tell");
    player = climax.player;
    settleKidney("tease");
    if (climax.climaxed && girl) {
      if (climax.line) lines.push({ role: "user", content: climax.line });
      bumpAffection(2, "射精");
      noteAfterglow(girl, "his", { ejac: "external" });
      if (!girlInPenisSex(girl)) showClimaxTip("射精了！");
    }
    if (!girl || !undressPlay) return;
    renderBodyPanel();

    const stageBefore = undressStage(girl);
    const dazedForUndress = STUN_RECKONING_ON && undressDazed(girl);
    let outcome = "advance";
    if (help && Math.random() < 1 / 3) outcome = "flee";
    else if (!help && !(Math.random() < 1 / 3)) outcome = "ignore";

    let stageAfter = stageBefore;
    if (outcome === "advance") {
      const u = ensureUndress(girl);
      u.stage = Math.min(3, stageBefore + 1);
      stageAfter = u.stage;
      // 事後算帳：失神中被脫（或被叫脫）衣服，清醒時本來會漲的侵犯記成欠帳
      if (dazedForUndress && stageAfter > stageBefore) {
        const normal = normalUndressInvasion(help ? "help" : "tell", { stage: girl.stage || "stranger", personality: basePersonality(girl), stats: girl.stats || null });
        if (normal > 0) noteStunDebt(normal, help ? "脫她衣服" : "叫她脫衣服");
      }
      if (stageAfter >= 3) {
        u.pantiesBy = help ? "help" : "self";
        u.sexStance = help ? "被動" : "順從";
        rollNudeStandee(girl);
        // test_room：脫光就把動作圖裸體版排進背景補產
        void queueNudeActionPregen(girl);
        // test_room：脫光就把做愛開場圖（依最後一層誰脫的）排進背景
        void queueSexPosePregen(girl);
      }
    }

    const beat = undressBeat(help, outcome, stageBefore, stageAfter);
    ensureSummonUndressSet(girl);
    const [note, reply] = await Promise.all([
      narrateUndress(beat),
      undressGirlLine(beat.text, { self: !help }),
    ]);
    if (!girl) return;
    // 叫她脫＝她自己脫：佔有度壓 30（好好講話＋一點呻吟）；幫她脫照實際佔有度
    const shownReply = presentUndressReply(reply, help ? {} : { cap: 30 });
    lines.push({ role: "user", content: note });
    lines.push({ role: "assistant", content: reply });
    if (inAfterglow(girl) && !inSpasm(girl)) consumeAfterglowReply(girl);
    if (!inSpasm(girl)) consumeEjacTalk(girl);
    tickStunAfterReply(girl);
    noteTalkExchange(girl);
    rememberChat();
    persistRoom();
    if (!undressPlay || !undressPlayOpen()) return;

    undressPlay.reply = shownReply;
    if (outcome === "flee") undressPlay.ending = "flee";
    else if (climax.climaxed) undressPlay.ending = "climax";
    else if (stageAfter >= 3) undressPlay.ending = "nude";
    else undressPlay.ending = "";
    undressPlay.phase = "narr";
    setUndressDialogue("旁白", note);
    try { paintUndressPlayFigure(); } catch { /* ignore */ }
  } catch (err) {
    console.warn("[undress]", err?.message || err);
    if (undressPlay) {
      undressPlay.phase = "choose";
      setUndressDialogue("旁白", "（這一拍沒有做成。）");
    }
  } finally {
    if (undressPlay) undressPlay.busy = false;
    if (undressPlayOpen()) renderUndressPlayChoices();
  }
}



function ensurePlayerHint(row) {
  for (const old of [...row.querySelectorAll(".player-hud")]) old.remove();
  let hint = row.querySelector(".talk-acts-hint");
  if (!hint) {
    hint = document.createElement("span");
    hint.className = "talk-acts-hint";
    hint.setAttribute("role", "status");
    row.prepend(hint);
  }
  return hint;
}

function updatePlayerHint(hint, p) {
  if (!hint) return;
  hint.textContent = girl ? playerHint(p) : "";
}

function refreshTalkActs() {
  const row = $("talk-acts");
  if (!row) return;
  // 對話版脫衣：互動列改成脫衣按鈕
  if (undressChatActive()) {
    renderUndressChatBar();
    return;
  }
  if (sexChatActive()) {
    renderSexChatBar();
    return;
  }
  // 妻子來求：只有「做愛／拒絕」
  if (begDialogActive()) {
    renderBegBar();
    return;
  }
  row.classList.remove("beg-bar");
  // 專屬場面開啟時隱藏互動列（overlay 蓋住；關閉後再顯示）
  row.hidden = !sheetOpen() || !girl || sceneOpen();
  player = ensurePlayer(player);
  const hint = ensurePlayerHint(row);
  updatePlayerHint(hint, player);

  // 只渲染目前解鎖的按鈕（鎖住的不出現）
  row.classList.remove("undress-bar", "sex-bar");
  for (const btn of [...row.querySelectorAll("button[data-act],button[data-scene],button[data-romance],button[data-undress]")]) btn.remove();
  if (!girl || !sheetOpen() || sceneOpen()) return;
  const acts = availableActs(girl, { canTease: canTease(player) });
  for (const act of acts) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.act = act.id;
    btn.dataset.label = act.label;
    btn.textContent = act.label;
    btn.disabled = !!talkBusy;
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      sendTalkAct(act.id);
    });
    row.append(btn);
  }
  // 告白／求婚（互斥；條件不符則不顯示）
  if (!talkBusy) {
    if (canConfessGirl()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.romance = "confess";
      btn.textContent = "告白";
      btn.title = "消耗 1 花束 → 女友";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        void doConfess();
      });
      row.append(btn);
    } else if (canProposeGirl()) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.dataset.romance = "propose";
      btn.textContent = "求婚";
      btn.title = "消耗戒指（50%）· 成功率＝感情/200";
      btn.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        if (btn.disabled) return;
        void doPropose();
      });
      row.append(btn);
    }
  }
  // 脫光後改做愛（場面還沒做）。還沒脫完：只有痙攣或失神才出現一個「脫衣服」。
  if (undressStage(girl) >= 3) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.scene = "sex";
    btn.textContent = "做愛";
    btn.disabled = !!talkBusy;
    btn.title = "場面還沒做";
    // 精液 0 或負的：鈕變灰，點了跳紅卡說原因（不直接 disabled，手機看不到 title）
    const dryCc = ensurePlayer(player).semenCc;
    // 妻子飢渴頂點：不看精液（榨乾場）
    if (!canStartSexAt(dryCc, { peak: sexPeakNow() })) {
      btn.classList.add("is-dry", "is-locked");
      btn.setAttribute("aria-disabled", "true");
      btn.title = sexBlockReason(dryCc);
      const lock = document.createElement("span");
      lock.className = "act-lock";
      lock.textContent = `精液 ${dryCc}cc`;
      btn.append(lock);
    }
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      openRoomScene("sex");
    });
    row.append(btn);
  } else if (undressEntryUnlocked(girl)) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.scene = "undress";
    btn.textContent = "脫衣服";
    btn.disabled = !!talkBusy;
    btn.title = "進入脫衣畫面";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      openUndressPlay();
    });
    row.append(btn);
  }
  // 有脫（undress.stage>0）才出現「穿衣」：穿回去、立繪換回、害羞 prompt 自然停止
  if (undressStage(girl) > 0) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.dataset.scene = "dress";
    btn.textContent = "穿衣";
    btn.disabled = !!talkBusy;
    btn.title = "讓她把衣服穿回去";
    btn.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      if (btn.disabled) return;
      void dressHer();
    });
    row.append(btn);
  }
}

/** 「穿衣」：脫衣進度歸 0（同離房的 clearVisitUndress）、換回穿衣立繪、存檔，再說一句反應。 */
async function dressHer() {
  if (!girl || talkBusy || !sheetOpen() || talkFor !== girl.id) return;
  const before = undressStage(girl);
  if (before <= 0) return;
  clearVisitUndress(girl);
  persistRoom();
  try { paintHalfPortrait(girl); } catch { /* ignore */ }
  talkBusy = true;
  refreshTalkActs();
  const note = "（你讓她把衣服穿回去。）";
  lines.push({ role: "user", content: note });
  const canned = dressedReactionLine(before, girl.stage || "stranger", basePersonality(girl));
  let line = "";
  let streamed = false;
  try {
    const stun = effectiveStun(girl, "");
    $("portrait-name").textContent = girl.name;
    const occ = takeOccupancy(girl, "");
    if (occ.score >= 95) {
      line = occupancyMoanLine(occ, girl) || "……";
    } else {
      setTyping(true);
      const streamOk = stun < 25 && occ.score < 10 && !occ.semenOut && !inAfterglow(girl);
      const occHint = occupancyPromptLine(occ);
      try {
        const reply = await askGirl([dressedReactionPrompt(before, girl.stage || "stranger"), occHint].filter(Boolean).join("\n"), streamOk ? (partial) => {
          if (!partial || !sheetOpen()) return;
          streamed = true;
          setTyping(false);
          $("portrait-name").textContent = girl.name;
          $("portrait-meta").textContent = partial;
        } : null);
        line = presentOccupied(girl, String(reply || "").trim() || canned, "", occ) || canned;
      } catch {
        line = canned;
        streamed = false;
      }
    }
    setTyping(false);
    noteTalkExchange(girl);
    lines.push({ role: "assistant", content: line });
    rememberChat();
    persistRoom();
    if (streamed) $("portrait-meta").textContent = line;
    else await typeLine(girl.name, line);
  } catch (err) {
    setTyping(false);
    try { await typeLine(girl.name, canned); } catch { /* ignore */ }
  } finally {
    talkBusy = false;
    if (sheetOpen()) setTalkEnabled(true);
    refreshTalkActs();
  }
}

function bindTalkActs() {
  const row = $("talk-acts");
  if (!row || row.dataset.bound) return;
  row.dataset.bound = "1";
  row.replaceChildren();
  ensurePlayerHint(row);
  refreshTalkActs();
}

function startIdleDecay() {
  stopIdleDecay();
  // 開對話時先補算離線期間的侵犯時間衰減（每 20 分 −1..2，最多到 0）
  if (girl) {
    try { decayInvasionByTime(girl); decayMoodByTime(girl); } catch { /* ignore */ }
    // 關著對話期間失神／痙攣已退：半脫的她早就穿回去了（不另外旁白）
    try { if (settleUndressAfterStun(girl)) { paintHalfPortrait(girl); persistRoom(); } } catch { /* ignore */ }
  }
  idleDecayTimer = window.setInterval(() => {
    if (!girl || !sheetOpen()) return;
    if (talkBusy) return;
    const now = Date.now();
    if (now - lastIdleDecayAt < 4000) return;
    lastIdleDecayAt = now;
    const sinceTease = now - (ensurePlayer(player).lastTeaseAt || 0);
    // 最近剛挑逗過則跳過一輪。性奮不在這條計時扣（開著聊天框不掉）。
    if (sinceTease < 5000) return;
    decayBodyIdle(girl);
    // 侵犯值：閒置不再每 5 秒扣；只照真實時間每滿 20 分 −1..2（時間戳存在 bodyState）
    decayInvasionByTime(girl);
    decayMoodByTime(girl);
    player = ensurePlayer(decayPlayerIdle(player)); // ensurePlayer 也會按小時回補精液
    const redressed = settleUndressAfterStun(girl);
    renderBodyPanel();
    refreshTalkActs();
    if (undressStage(girl) > 0 || redressed) {
      try { paintHalfPortrait(girl); } catch { /* ignore */ }
    }
    let redressTyping = null;
    if (redressed) {
      lines.push({ role: "assistant", content: REDRESS_NOTE });
      redressTyping = typeLine("旁白", REDRESS_NOTE);
    }
    persistRoom();
    // 事後算帳：失神／痙攣按時間退了 → 穿衣旁白打完再算帳說話
    if (stunReckoningPending(girl) && !undressDazed(girl) && !undressPlayOpen()) {
      void runIdleReckoning(redressTyping);
    }
  }, 5000);
}

function girlInRoom() {
  if (!girl) return false;
  if (typeof window.RoomActor?.isPresent === "function") return !!window.RoomActor.isPresent();
  return !sheIsOut();
}

/**
 * 一間房一次只住一位魅魔。
 * 「有人」＝她人在房裡，或這趟召喚／召回還沒站定（儀式、繪圖清單還在跑）。
 * 她回住處、在日本過日子（sheIsOut）不算有人。
 * 回傳 { id, name, arriving }；空房回 null。
 */
function roomOccupant() {
  return occupantOf(girl, { present: girlInRoom(), busy: summoning || summonBackBusy || pending });
}

/** 房裡有人時給玩家看的一句話。 */
function roomFullText(occ) {
  return occ ? `${roomFullLine(occ)}。` : "";
}

/** 上一次 adopt 被拒的原因（給名冊退款／提示用）。 */
let lastAdoptRefusal = null;

const ROOM_REFUND_KEY = "yoro_room_refunds";
/** 開機時才發現房裡有人、付過錢的 pending 召喚：記一筆退款，名冊那邊載入後退回金幣。 */
function refundRefusedAdopt(payload, occ) {
  const cost = Math.max(0, Number(payload?.paidCost) || 0);
  if (!cost || payload?.fromTestRoom) return;
  try {
    const list = JSON.parse(localStorage.getItem(ROOM_REFUND_KEY) || "[]");
    const rows = Array.isArray(list) ? list : [];
    const at = Number(payload.at) || Date.now();
    const gid = String(payload.girl?.gameGirlId || payload.girl?.id || "");
    if (!rows.some((r) => r && r.at === at && r.girlId === gid)) {
      rows.push({ girlId: gid, name: payload.girl?.name || "", cost, at, occupant: occ?.name || "" });
    }
    localStorage.setItem(ROOM_REFUND_KEY, JSON.stringify(rows));
  } catch { /* ignore */ }
  try { window.dispatchEvent(new CustomEvent("yoro-room-refund")); } catch { /* ignore */ }
}

function stopArousalOffChat() {
  if (arousalOffChatTimer) {
    clearInterval(arousalOffChatTimer);
    arousalOffChatTimer = 0;
  }
}

/** 人在房、聊天框關著才計時；開聊天或離房會停，下次再從完整 30 秒起算。 */
function syncArousalOffChatTimer() {
  const should = girlInRoom() && !sheetOpen();
  if (!should) {
    stopArousalOffChat();
    return;
  }
  if (arousalOffChatTimer) return;
  arousalOffChatTimer = window.setInterval(() => {
    if (!girlInRoom() || sheetOpen()) {
      stopArousalOffChat();
      return;
    }
    const before = girl.bodyState?.arousal || 0;
    if (before <= 0) return;
    decayArousalOffChat(girl);
    const panel = $("body-panel");
    if (panel && !panel.hidden) renderBodyPanel();
    persistRoom();
  }, 30000);
}

function stopIdleDecay() {
  if (idleDecayTimer) {
    clearInterval(idleDecayTimer);
    idleDecayTimer = 0;
  }
}


let sheetScrollY = 0;

function lockSheetScroll() {
  if (document.body.classList.contains("sheet-open")) return;
  sheetScrollY = window.scrollY || document.documentElement.scrollTop || 0;
  document.documentElement.classList.add("sheet-open");
  document.body.classList.add("sheet-open");
  document.body.style.top = `-${sheetScrollY}px`;
}

function unlockSheetScroll() {
  if (!document.body.classList.contains("sheet-open")) return;
  document.documentElement.classList.remove("sheet-open");
  document.body.classList.remove("sheet-open");
  document.body.style.top = "";
  window.scrollTo(0, sheetScrollY);
}

function showSheet() {
  if (girl?.errand === "clothes") {
    const status = $("summon-status");
    if (status) status.textContent = `${girl.name}去換衣服了，還沒回來。`;
    return;
  }
  const sheet = $("portrait-sheet");
  if (!sheet) return;
  const wasHidden = sheet.hidden;
  sheet.hidden = false;
  lockSheetScroll();
  stopArousalOffChat();
  startIdleDecay();
  refreshTalkActs();
  // 打開房間對話時精液 <6：跳一次「身體快不行了」
  if (wasHidden && girl && girlInRoom()) warnIfSemenLow();
  // 她來求（還沒理她）：這次打開就是求的對話框（activityChatOpen 會把「求」標成看過，先記下來）
  const begNow = !!(wasHidden && girl && HUNGER_ON && !begDialog && begPending(girl));
  if (wasHidden && girl) activityChatOpen();
  if (!girl) {
    typeJob += 1;
    setTyping(false);
    if ($("portrait-name")) $("portrait-name").textContent = "還沒有人";
    if ($("portrait-meta")) $("portrait-meta").textContent = "先按「抽妹子」。";
    setTalkEnabled(false);
    paintHalfPortrait(null);
    return;
  }
  if (undressStage(girl) >= 3) rollNudeStandee(girl);
  paintHalfPortrait(girl);
  restoreInsertView(girl);
  if (begNow) {
    begDialog = { phase: "opening", at: Date.now() };
    void openBegDialog();
    return;
  }
  openTalk();
}

function isFarewell(text) {
  const raw = String(text || "").trim();
  if (!raw || raw.length > 24) return false;
  const line = raw.replace(/[。！!？?~～.…、,，\s]/g, "");
  return /掰+|拜拜|再見|先這樣|等一下?再聊|等等再聊|下次再聊|回頭再聊|先不聊|先別聊|先走了|晚安/.test(line);
}

const ROOM_SAVE_KEY = "yoro_test_room_session";

function rememberChat() {
  if (!girl) return;
  if (lines.length) {
    girl.chatLines = lines.slice(-40);
    girl.topicHint = topicHintFrom(lines);
  }
}

function endTalkSession() {
  if (!girl) return;
  // Soft-reset in-session LLM history; do not wipe affection/body/player names.
  girl.chatLines = [];
  girl.topicHint = "";
  girl.sessionEnded = true;
  girl.nameWait = "";
  if (girl.bodyState) {
    girl.bodyState.ejacTalkLeft = 0;
    girl.bodyState.ejacTalkBan = false;
  }
  if (girl.chatEnter !== "flee_back" && girl.chatEnter !== "summon") {
    girl.chatEnter = "reopen";
  }
}

const DOCTOR_BILL_KEY = "yoro_doctor_bills";
/**
 * 腎虧：精液量往下掉之後一律走這裡。掉到 −7 以下就自動送醫——精液量拉回 −1，
 * 醫藥費（60～140 金）交給主遊戲扣 state.gold（可扣到負）。只有真的扣精液的這一台會觸發；
 * 精液量拉回 −1 跟著房間存檔走，別台讀到的已經是 −1，不會再收一次。
 */
function settleKidney(source = "") {
  const r = kidneyCheck(player);
  player = r.player;
  if (!r.triggered) return null;
  const bill = { fee: r.fee, before: r.before, after: player.semenCc, at: Date.now(), source };
  let paid = false;
  try { paid = window.YorozuyaWallet?.payDoctor?.(bill) === true; } catch { paid = false; }
  if (!paid) {
    // 主遊戲沒載（沙盒 test_room）或存檔還沒好：記帳，名冊那邊載入後補扣
    try {
      const rows = JSON.parse(localStorage.getItem(DOCTOR_BILL_KEY) || "[]");
      const list = Array.isArray(rows) ? rows : [];
      list.push(bill);
      localStorage.setItem(DOCTOR_BILL_KEY, JSON.stringify(list));
    } catch { /* ignore */ }
    try { window.dispatchEvent(new CustomEvent("yoro-doctor-bill")); } catch { /* ignore */ }
  }
  try { pushDebug(`腎虧：精液 ${r.before}cc → ${player.semenCc}cc，看醫生 ${r.fee} 金（${source || "?"}）`); } catch { /* */ }
  const status = $("summon-status");
  if (status) status.textContent = `腎虧了…被送去看醫生，花了 ${r.fee} 金。精液量回到 ${player.semenCc}。`;
  try { persistRoom(); } catch { /* ignore */ }
  try {
    const row = $("talk-acts");
    if (row) updatePlayerHint(ensurePlayerHint(row), player);
  } catch { /* ignore */ }
  return bill;
}

/** 扣玩家精液（肏射精）＋腎虧檢查。回傳扣完（或送醫後）的精液量。 */
function spendPlayerSemen(cc, source = "sex") {
  player = spendSemen(player, cc).player;
  settleKidney(source);
  return player.semenCc;
}

function persistRoom(opts = {}) {
  if (!girl) return;
  try {
    player = ensurePlayer(player);
    const payload = {
      girl,
      player,
      lines: lines.length ? lines.slice(-40) : (girl.chatLines || []),
      talkFor: talkFor || girl.id || "",
      present: typeof window.RoomActor?.isPresent === "function" ? !!window.RoomActor.isPresent() : !sheIsOut(),
      savedAt: opts.savedAt || Date.now(),
    };
    localStorage.setItem(ROOM_SAVE_KEY, JSON.stringify(payload));
    // quiet：從伺服器拉下來，時間戳保持原樣，不要再廣播回名冊蓋掉較新的那份
    if (!opts.quiet) syncProgressToGame(girl);
  } catch {
    /* quota / private mode */
  }
}

/** 用伺服器上的房間快照換掉這一台的本地房間。savedAt 不推進。 */
function applyRoomMirror(snapshot) {
  if (!snapshot?.girl?.id) return false;
  const savedAt = snapshot.savedAt || Date.now();
  girl = snapshot.girl;
  if (migrateAffectionScale(girl)) { /* 舊鏡像的感情乘 2 一次 */ }
  player = ensurePlayer(snapshot.player);
  if (!girl.portraits || typeof girl.portraits !== "object") girl.portraits = {};
  ensureBody(girl);
  ensureFriends(girl);
  ensurePlayerNotes(girl);
  normalizeGirlTags(girl);
  girl.chatLines = [];
  girl.topicHint = "";
  girl.sessionEnded = true;
  if (!girl.chatEnter) girl.chatEnter = "reopen";
  syncStage(girl);
  // 跟手機時不要在這台另找住所，以免人在手機已經離開、電腦又把她留在房裡
  window.RoomActor?.setPresent(snapshot.present === true);
  if (!girlInRoom()) {
    if (girl.bodyState?.arousalCoolAt) decayArousalCool(girl);
    else if ((girl.bodyState?.arousal || 0) > 0) zeroArousal(girl);
    if ((girl.bodyState?.openness || 0) > 0) resetOpenness(girl);
  }
  persistRoom({ savedAt, quiet: true });
  try {
    const detail = pickRoomDurableProgress(girl);
    if (detail) {
      detail.at = savedAt;
      localStorage.setItem(ROOM_PROGRESS_KEY, JSON.stringify(detail));
    }
  } catch { /* ignore */ }
  syncArousalOffChatTimer();
  if ($("summon-status")) {
    $("summon-status").textContent = snapshot.present === true
      ? `${girl.name}在房間裡（跟手機一樣）。長按她繼續聊。`
      : `${girl.name}已經離開房間（跟手機一樣）。`;
  }
  try { renderCard(); } catch { /* ignore */ }
  try { renderWorld(); } catch { /* ignore */ }
  startLifeLoop();
  return true;
}

const ROOM_PROGRESS_KEY = "yoro_room_progress_sync";
const ROOM_PENDING_KEY = "yoro_room_pending_adopt";

/** Room↔roster durable fields (not ephemeral chatLines / topicHint / live lines). */
const ROOM_DURABLE_SCALARS = [
  "affection", "affGen", "stage", "stageLock",
  "portrait", "comfyCkpt",
  "playerName", "playerNick", "playerPet",
  "petProposeCount", "petCoolUntil", "nameWait", "pendingPet",
  "chatEnter",
  "wifeUpPending", "datingUpPending",
  "noteChatTurns", "noteLastAskAt", "noteLastRecallAt", "noteLastTriviaAt",
  "loveTalkLastAt", "petNudgeLastAt",
];

function roomDurableDefined(v) {
  return v !== undefined;
}

/** Snapshot durable progress for roster write-back. */
function pickRoomDurableProgress(who) {
  if (!who) return null;
  const detail = {
    id: who.gameGirlId || who.id,
    at: Date.now(),
  };
  for (const k of ROOM_DURABLE_SCALARS) {
    if (roomDurableDefined(who[k])) detail[k] = who[k];
  }
  if (who.portraits && typeof who.portraits === "object") detail.portraits = who.portraits;
  if (who.sexAnim && typeof who.sexAnim === "object") detail.sexAnim = who.sexAnim;
  if (who.world && typeof who.world === "object") detail.world = who.world;
  if (who.bodyState && typeof who.bodyState === "object") detail.bodyState = who.bodyState;
  if (who.body && typeof who.body === "object") detail.body = who.body;
  if (Array.isArray(who.friends)) detail.friends = who.friends;
  if (Array.isArray(who.playerNotes)) detail.playerNotes = who.playerNotes;
  if (who.topicCool && typeof who.topicCool === "object" && !Array.isArray(who.topicCool)) {
    detail.topicCool = who.topicCool;
  }
  if (NUDE_FLAG_ON && who.nude) detail.nude = true;
  if (who.undress && typeof who.undress === "object") {
    detail.undress = snapshotUndress(who.undress);
  }
  return detail;
}

/**
 * Merge durable room session fields onto a roster-rolled girl.
 * Prefer prior (room / saved session) when present — room is newer after play.
 */
function mergeRoomGirlDurable(base, prior) {
  if (!base || typeof base !== "object") return base;
  if (!prior || typeof prior !== "object") return base;
  const out = { ...base };

  for (const k of ROOM_DURABLE_SCALARS) {
    if (!Object.prototype.hasOwnProperty.call(prior, k)) continue;
    if (!roomDurableDefined(prior[k])) continue;
    out[k] = prior[k];
  }

  // chatEnter: never let roster "summon" clobber flee_back from room prior
  if (prior.chatEnter === "flee_back") out.chatEnter = "flee_back";
  else if (prior.chatEnter) out.chatEnter = prior.chatEnter;

  if (prior.portraits && typeof prior.portraits === "object") {
    out.portraits = { ...(out.portraits || {}), ...prior.portraits };
  }
  if (prior.portrait) out.portrait = prior.portrait;
  if (prior.sexAnim && typeof prior.sexAnim === "object") {
    out.sexAnim = { ...(out.sexAnim || {}), ...prior.sexAnim };
  }

  if (prior.world && typeof prior.world === "object") out.world = prior.world;
  if (prior.bodyState && typeof prior.bodyState === "object") out.bodyState = prior.bodyState;
  if (prior.body && typeof prior.body === "object") out.body = prior.body;
  if (Array.isArray(prior.friends)) out.friends = prior.friends.slice();
  if (Array.isArray(prior.playerNotes)) out.playerNotes = prior.playerNotes.slice();
  if (prior.topicCool && typeof prior.topicCool === "object" && !Array.isArray(prior.topicCool)) {
    out.topicCool = { ...prior.topicCool };
  }
  if (NUDE_FLAG_ON && prior.nude) out.nude = true;
  stripRetiredNude(out);
  if (prior.undress && typeof prior.undress === "object") {
    out.undress = snapshotUndress(prior.undress);
  }
  return out;
}

function syncProgressToGame(who) {
  if (!who?.id || !(who.fromRoster || who.gameGirlId)) return;
  const detail = pickRoomDurableProgress(who);
  if (!detail?.id) return;
  // Keep legacy defaults so older listeners still see affection/stage/portraits/world
  if (detail.affection == null) detail.affection = who.affection || 0;
  if (!detail.stage) detail.stage = who.stage || "stranger";
  if (!detail.portraits) detail.portraits = who.portraits || {};
  if (detail.world === undefined) detail.world = who.world || null;
  try {
    localStorage.setItem(ROOM_PROGRESS_KEY, JSON.stringify(detail));
  } catch { /* ignore */ }
  try {
    window.dispatchEvent(new CustomEvent("yoro-room-progress", { detail }));
  } catch { /* ignore */ }
}

function takePendingAdopt() {
  try {
    const raw = localStorage.getItem(ROOM_PENDING_KEY);
    if (!raw) return null;
    localStorage.removeItem(ROOM_PENDING_KEY);
    const data = JSON.parse(raw);
    if (!data?.girl?.id) return null;
    return data;
  } catch {
    return null;
  }
}


function ensureRoomRitualEl() {
  let el = $("room-summon-ritual");
  if (el) return el;
  const stage = $("main-room-stage") || document.body;
  el = document.createElement("div");
  el.id = "room-summon-ritual";
  el.className = "room-summon-ritual";
  el.hidden = true;
  el.setAttribute("role", "status");
  el.setAttribute("aria-live", "polite");
  stage.appendChild(el);
  return el;
}

function setSummonTalkBusy(busy) {
  const input = $("talk-input");
  const send = $("talk-send");
  const acts = $("talk-acts");
  const stage = $("main-room-stage");
  if (input) input.disabled = !!busy;
  if (send) send.disabled = !!busy;
  if (acts) acts.setAttribute("aria-disabled", busy ? "true" : "false");
  if (stage) stage.setAttribute("aria-busy", busy ? "true" : "false");
}

function beginSummonRitualUI() {
  const targets = [];
  const status = $("summon-status");
  if (status) targets.push(status);
  const ritual = ensureRoomRitualEl();
  resetRitualBlocks();
  if (ritual) {
    ritual.hidden = false;
    if (!targets.includes(ritual)) targets.push(ritual);
  }
  paintSummonTenths(0, 1);
  const stops = targets.map((el) => startSummonRitualStatus(
    el,
    el === ritual ? () => { void refreshSummonQueue(); } : undefined,
  ));
  setSummonTalkBusy(true);
  return () => {
    for (const stop of stops) {
      try { stop(); } catch { /* */ }
    }
    if (ritual) ritual.hidden = true;
    resetRitualBlocks();
    setSummonTalkBusy(false);
  };
}

/** 名冊付費召喚：把遊戲妹子放進房間（同 id） */
async function adoptRosterGirl(payload) {
  const rolled = payload?.girl;
  lastAdoptRefusal = null;
  if (!rolled?.id) return false;
  const rolledId = String(rolled.gameGirlId || rolled.id);
  // 一間房一次一位：別人在房裡（或正在降臨）就不讓新的人進來。同一位人在房裡＝續這趟。
  const occ = roomOccupant();
  if (blocksSummon(occ, rolledId)) {
    lastAdoptRefusal = { reason: "occupied", occupant: occ, text: roomFullText(occ) };
    if ($("summon-status")) $("summon-status").textContent = roomFullText(occ);
    return false;
  }
  if (summoning) {
    lastAdoptRefusal = { reason: "busy", text: "正在召喚中，請稍候。" };
    return false;
  }
  summoning = true;
  let stopRitual = () => {};
  try {
    // Same-id room prior (live girl or saved session) is newer after play — merge durables
    let prior = null;
    if (girl?.id === rolled.id) prior = girl;
    if (!prior) {
      try {
        const saved = loadRoomSave();
        if (saved?.girl?.id === rolled.id) prior = saved.girl;
      } catch { /* ignore */ }
    }
    let next = {
      ...rolled,
      fromRoster: true,
      gameGirlId: rolled.gameGirlId || rolled.id,
      chatEnter: rolled.chatEnter || "summon",
    };
    if (prior) {
      migrateAffectionScale(prior);
      next = mergeRoomGirlDurable(next, prior);
      if (prior.chatEnter === "flee_back") next.chatEnter = "flee_back";
    } else if (rolled.world) {
      next.world = rolled.world;
    }
    // Prepare state, but keep the room empty until ritual + pregen finish.
    const continuingVisit = girl?.id === rolled.id && girlInRoom();
    girl = next;
    migrateAffectionScale(girl);
    if (!girl.portraits || typeof girl.portraits !== "object") girl.portraits = {};
    ensureBody(girl);
    if (!continuingVisit) resetOpenness(girl);
    ensureFriends(girl);
    ensurePlayerNotes(girl);
    normalizeGirlTags(girl);
    syncStage(girl);
    player = ensurePlayer(player);
    if (payload.playerName && !player.name) player.name = payload.playerName;
    lines = [];
    talkFor = "";
    activityOpen = false;
    workToken += 1;
    typeJob += 1;
    window.RoomActor?.setPresent(false);
    clearRoomSave();
    if (sheetOpen()) hideSheet();
    if (!continuingVisit) {
      assignEntryOutfit(girl);
      clearRoomVisit(girl);
      girl.summonArrivalPending = true;
      try { await clearVisitPics(); } catch { /* */ }
    }

    stopRitual = beginSummonRitualUI();

    try {
      await ensureGirlComfyCkpt(girl);
    } catch (err) {
      console.warn("[ensureGirlComfyCkpt]", err?.message || err);
    }

    let queued = null;
    let handoffFailed = false;
    try {
      queued = await pregenSummonBundle(girl, { portraits: true, sex: true, mode: "arrive" });
    } catch (err) {
      handoffFailed = true;
      console.warn("[adoptRosterGirl pregen]", err?.message || err);
      if ($("summon-status")) $("summon-status").textContent = err?.message || String(err);
    }

    // 畫完並下載完才讓她出現。停留從這一刻才開始。
    await cacheVisitPics(girl);
    window.RoomActor?.setPresent(true);
    if (!continuingVisit) armRoomVisit(girl);
    persistRoom();
    renderCard();
    renderWorld();
    renderDebug();
    if (queued?.finished && queued.id) await ackSummonQueue(queued.id);

    stopRitual();
    stopRitual = () => {};
    if (!handoffFailed && $("summon-status")) {
      $("summon-status").textContent = `「${girl.name}」已降臨。長按她說話。`;
    }
    const ritualEl = $("room-summon-ritual");
    if (ritualEl) ritualEl.hidden = true;

    if (isShipMode()) {
      try { showSheet(); } catch { /* DOM not ready */ }
    }
    syncArousalOffChatTimer();
    return true;
  } finally {
    try { stopRitual(); } catch { /* */ }
    summoning = false;
    setSummonTalkBusy(false);
  }
}

function isShipMode() {
  try {
    return new URLSearchParams(location.search).get("ship") === "1"
      || document.body.classList.contains("room-ship")
      || document.body.classList.contains("room-home");
  } catch {
    return document.body.classList.contains("room-ship")
      || document.body.classList.contains("room-home");
  }
}

function applyShipChrome() {
  if (!isShipMode()) return;
  // 嵌進 index 用 room-home；獨立 /test_room?ship=1 用 room-ship
  if (!document.body.classList.contains("room-home")) {
    document.body.classList.add("room-ship");
    document.documentElement.classList.add("room-ship");
    const shipBack = $("ship-back");
    if (shipBack) shipBack.hidden = false;
  }
  // 隱藏沙盒／除錯：抽妹子、身體面板、戀愛道具除錯、bond-debug
  for (const id of [
    "bond-debug", "body-panel", "romance-items",
  ]) {
    const el = $(id);
    if (el) el.hidden = true;
  }
  const editorSummon = document.querySelector(".summon-panel");
  if (editorSummon) editorSummon.hidden = true;
  const note = document.querySelector(".summon-panel .note");
  if (note) note.hidden = true;
  // 頂部狀態卡（緊湊）：用 girl-where / mood 當上卡帶
  const back = document.querySelector("#room-editor .back");
  if (back) {
    back.textContent = "← 萬事屋";
    back.setAttribute("href", "/");
  }
}

function clearRoomSave() {
  try { localStorage.removeItem(ROOM_SAVE_KEY); } catch { /* ignore */ }
}

function loadRoomSave() {
  try {
    const raw = localStorage.getItem(ROOM_SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data?.girl?.id) return null;
    return data;
  } catch {
    return null;
  }
}

function hideSheet() {
  // 求的對話框：關掉＝不理她（求的窗口照 hungerChatClose 收）
  if (begDialog) endBegDialog();
  // 先收 stub 場面，避免 overlay 懸在已關閉的對話上
  if (sceneOpen() || activeRoomScene) closeRoomScene();
  if (MISS_YOU_ON && girl) noteMissSeen(girl);
  typeJob += 1;
  setTyping(false);
  talkBusy = false;
  endTalkSession();
  lines = [];
  talkFor = "";
  resetPortraitEntrance();
  clearActionFlash();
  $("portrait-sheet").hidden = true;
  unlockSheetScroll();
  stopIdleDecay();
  syncArousalOffChatTimer();
  activityChatClose();
  persistRoom();
  refreshTalkActs();
  try {
    window.dispatchEvent(new CustomEvent("yoro-room-sheet-close", {
      detail: girl ? { id: girl.gameGirlId || girl.id } : null,
    }));
  } catch { /* ignore */ }
}

function errorText(payload, status) {
  const detail = payload?.detail ?? payload?.error;
  if (typeof detail === "string" && detail) return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => item?.msg || item?.message || String(item || "")).filter(Boolean).join("；");
  }
  if (detail && typeof detail === "object") return detail.message || "生圖失敗";
  return status ? `生圖失敗（${status}）` : "生圖失敗";
}

async function makeGirl() {
  await loadPools();
  const rolled = generateGirl({
    luck: 10 + Math.floor(Math.random() * 46),
    rating: "nsfw",
    usedNames: girl?.name ? [girl.name] : [],
  });
  if (!rolled?.name) throw new Error("generateGirl 回傳空");
  const out = {
    ...rolled,
    id: `cd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    affection: 0,
    affGen: AFF_GEN,
    stage: "stranger",
    chatEnter: "first",
    ntr: null,
    summoner: null,
    portraits: {},
    portrait: null,
  };
  ensureBody(out);
  ensurePlayerNotes(out);
  await ensureGirlComfyCkpt(out);
  return out;
}

/** 房間細階 → 主線四階（與 app.js ROOM_TO_GAME_STAGE 對齊）。 */
const ROOM_TO_GAME_STAGE = {
  stranger: "stranger", acquaintance: "stranger",
  friend: "friend", close_friend: "friend",
  girlfriend: "girlfriend", passionate: "girlfriend", lover: "girlfriend",
  wife: "wife", devoted_wife: "wife", obedient_wife: "wife", pathological_wife: "wife",
};
/** 名冊妹子進房用的細階：roomStage 與主線 stage 同一段才沿用，否則從主線 stage 起算。 */
function rosterRoomStage(s) {
  const game = ROOM_TO_GAME_STAGE[s?.stage] || "stranger";
  const room = s?.roomStage;
  return room && ROOM_TO_GAME_STAGE[room] === game ? room : (s?.stage || "stranger");
}

/** 主線階段 → 房間階梯（與 app.js mapGameStageToRoom 對齊） */
function mapGameStageToRoom(stage) {
  const known = new Set([
    "stranger", "acquaintance", "friend", "close_friend",
    "girlfriend", "passionate", "lover",
    "wife", "devoted_wife", "obedient_wife", "pathological_wife",
  ]);
  if (known.has(stage)) return stage;
  return "stranger";
}

/**
 * 把存檔名冊 succubus 編成房間 session 物件（同 id，進度可回寫）。
 * 對齊 app.js buildRoomGirlFromSuccubus，並補 look／outfitPick 供沙盒對話與動作圖。
 */
function buildRoomGirlFromSuccubus(s) {
  if (!s?.id) return null;
  const portraits = (s.portraits && typeof s.portraits === "object")
    ? { ...s.portraits }
    : {};
  const bodyState = (s.bodyState && typeof s.bodyState === "object")
    ? s.bodyState
    : null;
  const topicCool = (s.topicCool && typeof s.topicCool === "object" && !Array.isArray(s.topicCool))
    ? { ...s.topicCool }
    : null;
  const look = (s.look && typeof s.look === "object") ? { ...s.look } : (s.look || null);
  return {
    id: s.id,
    gameGirlId: s.id,
    fromRoster: true,
    name: s.name,
    rarity: s.rarity,
    personality: s.personality,
    speech: s.speech,
    tone: s.tone,
    quirk: s.quirk,
    kink: s.kink,
    job: s.job,
    jobDesc: s.jobDesc || null,
    backstory: s.backstory,
    tags: s.tags,
    dna: s.dna,
    look,
    outfitPick: s.outfitPick ?? null,
    libido: s.libido || null,
    specialTraits: s.specialTraits || null,
    moanVoice: s.moanVoice || null,
    // 個性：整份帶進房間（同 app.js）；進 prompt 的部分依關係階逐步揭露（REVEAL_AT）
    catchphrases: Array.isArray(s.catchphrases) ? s.catchphrases.slice() : (s.catchphrases || null),
    reactions: (s.reactions && typeof s.reactions === "object") ? { ...s.reactions } : null,
    archetype: s.archetype || null,
    stats: (s.stats && typeof s.stats === "object") ? { ...s.stats } : null,
    kinks: Array.isArray(s.kinks) ? s.kinks.slice() : null,
    kinkMeta: Array.isArray(s.kinkMeta) ? JSON.parse(JSON.stringify(s.kinkMeta)) : null,
    chrono: (s.chrono && typeof s.chrono === "object") ? { ...s.chrono } : null,
    likes: Array.isArray(s.likes) ? s.likes.slice() : null,
    dislikes: Array.isArray(s.dislikes) ? s.dislikes.slice() : null,
    hobbies: Array.isArray(s.hobbies) ? s.hobbies.slice() : null,
    contrast: s.contrast || "",
    comfyCkpt: s.comfyCkpt,
    affection: typeof s.affection === "number" ? s.affection : 0,
    stage: mapGameStageToRoom(rosterRoomStage(s)),
    stageLock: s.stageLock || "",
    ntr: s.ntr || null,
    summoner: s.summoner || null,
    portraits,
    portrait: s.portrait || portraits.full || portraits.half || null,
    // 舊系統局部動圖（召喚預產／作夢產的）：帶進房間，肏的局部動畫用
    sexAnim: (s.sexAnim && typeof s.sexAnim === "object") ? JSON.parse(JSON.stringify(s.sexAnim)) : null,
    chatEnter: s.chatEnter === "flee_back" ? "flee_back" : "summon",
    ...(NUDE_FLAG_ON ? { nude: !!s.nude } : {}),
    undress: snapshotUndress(s.undress),
    body: s.body || null,
    bodyState,
    playerNotes: Array.isArray(s.playerNotes) ? s.playerNotes.slice() : (s.playerNotes || null),
    friends: Array.isArray(s.friends) ? s.friends.slice() : (s.friends || null),
    world: s.world || null,
    playerName: s.playerName || "",
    playerNick: s.playerNick || "",
    playerPet: s.playerPet || "",
    petProposeCount: Number.isFinite(Number(s.petProposeCount)) ? Number(s.petProposeCount) : 0,
    petCoolUntil: Number.isFinite(Number(s.petCoolUntil)) ? Number(s.petCoolUntil) : 0,
    nameWait: s.nameWait || "",
    pendingPet: s.pendingPet || "",
    wifeUpPending: s.wifeUpPending || "",
    datingUpPending: s.datingUpPending || "",
    topicCool,
    noteChatTurns: Number.isFinite(Number(s.noteChatTurns)) ? Number(s.noteChatTurns) : 0,
    noteLastAskAt: Number.isFinite(Number(s.noteLastAskAt)) ? Number(s.noteLastAskAt) : -999,
    noteLastRecallAt: Number.isFinite(Number(s.noteLastRecallAt)) ? Number(s.noteLastRecallAt) : -999,
    noteLastTriviaAt: Number.isFinite(Number(s.noteLastTriviaAt)) ? Number(s.noteLastTriviaAt) : -999,
    loveTalkLastAt: Number.isFinite(Number(s.loveTalkLastAt)) ? Number(s.loveTalkLastAt) : -999,
    petNudgeLastAt: Number.isFinite(Number(s.petNudgeLastAt)) ? Number(s.petNudgeLastAt) : -999,
  };
}

/** 沙盒：快取的名冊列表（/api/save succubi） */
let rosterGirlsCache = [];
let rosterPlayerName = "";
let rosterLoadBusy = false;

function setRosterSummonHint(msg, isErr = false) {
  const el = $("roster-summon-hint");
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!isErr);
}

function renderRosterGirlPicker() {
  const sel = $("roster-girl-pick");
  if (!sel) return;
  const prev = sel.value;
  const usable = rosterGirlsCache.filter((g) => g && g.id && !g.ntr && !g.taken);
  sel.replaceChildren();
  if (!usable.length) {
    const opt = document.createElement("option");
    opt.value = "";
    opt.textContent = "（名冊沒有可用生徒）";
    sel.appendChild(opt);
    setRosterSummonHint(rosterGirlsCache.length
      ? "名冊裡的人都不可用（NTR／被帶走）。"
      : "存檔名冊是空的——先去主遊戲召喚魅魔，或按「抽妹子」試抽。", !rosterGirlsCache.length);
    const btn = $("summon-roster-girl");
    if (btn) btn.disabled = true;
    return;
  }
  for (const g of usable) {
    const opt = document.createElement("option");
    opt.value = String(g.id);
    const stage = g.stage || "stranger";
    opt.textContent = `${g.name || "？"}・${stage}${g.job ? `・${g.job}` : ""}`;
    sel.appendChild(opt);
  }
  if (prev && usable.some((g) => g.id === prev)) sel.value = prev;
  const btn = $("summon-roster-girl");
  if (btn) btn.disabled = false;
  setRosterSummonHint(`名冊 ${usable.length} 隻可召喚。選好後按「召喚進房」。`);
}

async function loadRosterGirlsForSummon({ quiet = false } = {}) {
  const sel = $("roster-girl-pick");
  if (!sel && !$("summon-roster-girl")) return; // 主畫面 room-home 可能無此 UI
  if (rosterLoadBusy) return;
  rosterLoadBusy = true;
  if (!quiet) setRosterSummonHint("讀取名冊…");
  try {
    const response = await fetch("/api/save", { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(errorText(data, response.status));
    const save = data?.data || {};
    rosterGirlsCache = Array.isArray(save.succubi) ? save.succubi.slice() : [];
    rosterPlayerName = String(
      save.playerProfile?.name || save.settings?.player || ""
    ).trim();
    renderRosterGirlPicker();
  } catch (err) {
    rosterGirlsCache = [];
    renderRosterGirlPicker();
    setRosterSummonHint(`讀名冊失敗：${err?.message || err}`, true);
  } finally {
    rosterLoadBusy = false;
  }
}

/** 沙盒：把選定的名冊生徒 adopt 進房間（免費，走與主畫面相同的 adoptRosterGirl） */
async function summonRosterGirlIntoRoom() {
  if (summoning || pending) {
    setRosterSummonHint("正在召喚／抽人中，請稍候。", true);
    return;
  }
  const occ0 = roomOccupant();
  if (occ0) {
    setRosterSummonHint(`${roomFullText(occ0)}（先按「讓她離開」）`, true);
    return;
  }
  const sel = $("roster-girl-pick");
  const id = sel?.value || "";
  if (!id) {
    setRosterSummonHint("請先選一名冊生徒。", true);
    return;
  }
  let raw = rosterGirlsCache.find((g) => g && g.id === id);
  if (!raw) {
    await loadRosterGirlsForSummon({ quiet: true });
    raw = rosterGirlsCache.find((g) => g && g.id === id);
  }
  if (!raw || raw.ntr || raw.taken) {
    setRosterSummonHint("這隻生徒現在不可召喚（不在名冊或已被帶走）。", true);
    return;
  }
  const roomGirl = buildRoomGirlFromSuccubus(raw);
  if (!roomGirl) {
    setRosterSummonHint("無法編成房間人設。", true);
    return;
  }
  const btn = $("summon-roster-girl");
  if (btn) btn.disabled = true;
  setRosterSummonHint(`正在召喚「${roomGirl.name}」進房…`);
  if ($("summon-status")) $("summon-status").textContent = `正在召喚名冊生徒「${roomGirl.name}」…`;
  try {
    const ok = await adoptRosterGirl({
      girl: roomGirl,
      playerName: rosterPlayerName || roomGirl.playerName || "",
      paidCost: 0,
      at: Date.now(),
      fromTestRoom: true,
    });
    if (ok) {
      setRosterSummonHint(`「${roomGirl.name}」已進房。長按她說話，或測動作圖。`);
    } else {
      setRosterSummonHint(lastAdoptRefusal?.text || "召喚未完成（可能正在進行另一場召喚）。", true);
    }
  } catch (err) {
    console.warn("[summonRosterGirlIntoRoom]", err);
    setRosterSummonHint(`召喚失敗：${err?.message || err}`, true);
    if ($("summon-status")) $("summon-status").textContent = err?.message || String(err);
  } finally {
    if (btn) btn.disabled = false;
  }
}

function bindRosterSummonUi() {
  if (!document.documentElement.classList.contains("room-page")
    && !document.body.classList.contains("room-home")) {
    // 仍嘗試綁（index 也有 DOM）；無節點則 onId 空操作
  }
  onId("summon-roster-girl", "click", () => { void summonRosterGirlIntoRoom(); });
  onId("reload-roster-girls", "click", () => { void loadRosterGirlsForSummon(); });
  // 僅沙盒頁預載；room-home 面板隱藏，不必搶請求
  if (document.documentElement.classList.contains("room-page")
    && !document.body.classList.contains("room-home")) {
    void loadRosterGirlsForSummon();
  }
}

async function drawGirl() {
  if (pending) return;
  const occ = roomOccupant();
  if (occ) {
    if ($("summon-status")) $("summon-status").textContent = `${roomFullText(occ)}（先按「讓她離開」）`;
    return;
  }
  pending = true;
  $("draw-girl").disabled = true;
  $("summon-status").textContent = "抽人設…";
  try {
    const rolled = await makeGirl();
    // Prepare state, but keep the room empty until ritual + pregen finish.
    girl = rolled;
    assignEntryOutfit(rolled);
    clearRoomVisit(rolled);
    rolled.summonArrivalPending = true;
    try { await clearVisitPics(); } catch { /* */ }
    window.RoomActor?.setPresent(false);
    lines = [];
    talkFor = "";
    clearRoomSave();
    activityOpen = false;
    workToken += 1;
    typeJob += 1;
    if (sheetOpen()) hideSheet();
    const ckptBit = rolled.comfyCkpt && roomImgProvider === "comfy"
      ? ` · 模型 ${shortCkptName(rolled.comfyCkpt)}` : "";
    const stopRitual = beginSummonRitualUI();
    let queued = null;
    let handoffFailed = false;
    try {
      try {
        queued = await pregenSummonBundle(rolled, { portraits: true, sex: true, mode: "arrive" });
      } catch (err) {
        handoffFailed = true;
        console.warn("[draw-girl pregen]", err?.message || err);
        if ($("summon-status")) {
          $("summon-status").textContent = `抽到了${rolled.name}${ckptBit}。繪圖清單沒交出去：${err?.message || err}`;
        }
      }
      if (girl && girl.id === rolled.id) {
        await cacheVisitPics(girl);
        window.RoomActor?.setPresent(true);
        armRoomVisit(girl);
        syncArousalOffChatTimer();
        persistRoom();
        renderCard();
        renderWorld();
        if (queued?.finished && queued.id) await ackSummonQueue(queued.id);
        if (!handoffFailed && $("summon-status")) {
          $("summon-status").textContent = `「${rolled.name}」已降臨${ckptBit}。長按房間裡的她跟她說話，或讓她離開。`;
        }
      }
    } finally {
      try { stopRitual(); } catch { /* */ }
      const ritualEl = $("room-summon-ritual");
      if (ritualEl) ritualEl.hidden = true;
    }
  } catch (err) {
    $("summon-status").textContent = err?.message || String(err);
  }
  pending = false;
  $("draw-girl").disabled = false;
}

const TONE_LABEL = { normal: "普通", whimsical: "天馬行空", eerie: "詭異" };

function homePrompt(who, region, choices) {
  const list = choices.map((home, index) => `${index + 1}. ${home.name}（${TONE_LABEL[home.tone]}）`).join("\n");
  return [
    "你在替她決定離開之後住哪。只能從下面選一間。",
    "普通、天馬行空、詭異都可以，依她的個性挑最像她會住的。不要因為普通就優先。",
    "只回一個數字，對應選項編號。不要解釋。",
    `她是${who.name}。個性：${personaBlurb(who)}。`,
    who.tone ? `語氣：${who.tone}` : "",
    revealedQuirk(who, { talk: false }),
    hereNow(who) || `人在日本的${region.name}。`,
    list,
  ].filter(Boolean).join("\n");
}

function parseNumberedChoice(text, choices) {
  const raw = cleanLine(text);
  if (!raw) return null;
  if (raw.length <= 16) {
    const match = raw.match(/[1-9]/);
    if (match) return choices[Number(match[0]) - 1] || null;
  }
  const lone = raw.split(/\n/).map((line) => line.trim()).reverse().find((line) => /^[1-9]$/.test(line));
  if (lone) return choices[Number(lone) - 1] || null;
  const named = choices.filter((choice) => raw.includes(choice.name));
  return named.length === 1 ? named[0] : null;
}

async function askHome(who, region, choices) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: "你只負責從給定的住所裡選一間。只輸出編號。" },
    { role: "user", content: homePrompt(who, region, choices) },
  ];
  const reply = route.provider === "ollama"
    ? await askOllama(route, messages)
    : await askGrok(route, messages, `roomhome:${who.id}:${Date.now().toString(36)}`);
  const home = parseNumberedChoice(reply, choices);
  if (!home) throw new Error("模型沒有選到選項");
  return home;
}

function clearShift() {
  workToken += 1;
  if (!girl?.world) return;
  girl.world.activity = null;
  girl.world.shift = null;
  girl.world.stroll = null;
  girl.world.browse = null;
  girl.world.agenda = null;
  activityOpen = false;
}

function sendHerOutAgain(opts = {}) {
  clearShift();
  activityOpen = false;
  dropVisitPics();
  clearVisitUndress(girl);
  clearRoomVisit(girl);
  if (girl.chatEnter !== "flee_back") girl.chatEnter = "summon";
  if (!opts.keepArousal) zeroArousal(girl);
  resetOpenness(girl);
  window.RoomActor?.setPresent(false);
  rememberHomeReturn(girl);
  if (girl.world) girl.world.settlingHome = false;
  if (sheetOpen()) hideSheet();
  else syncArousalOffChatTimer();
  renderCard();
  renderWorld();
  persistRoom();
  // 回住處就停在這裡。接下來做什麼由 RP5 上的她自己選，不是一離開就打工。
}

let summonBackBusy = false;
async function summonHerBack() {
  // 有 world 且人在外即可召回；住處未定也允許（找房／ensure 仍只在離房／逃離時做）
  if (!girl?.world || !sheIsOut() || summonBackBusy) return;
  const who = girl;
  summonBackBusy = true;
  const btn = $("summon-back");
  if (btn) btn.disabled = true;
  assignEntryOutfit(who);
  clearRoomVisit(who);
  who.summonArrivalPending = true;
  try { await clearVisitPics(); } catch { /* */ }
  const stopRitual = beginSummonRitualUI();
  let queued = null;
  try {
    queued = await pregenSummonBundle(who, { portraits: true, sex: true, mode: "back" });
    await cacheVisitPics(who);
  } catch (err) {
    if ($("summon-status")) $("summon-status").textContent = err?.message || String(err);
  } finally {
    try { stopRitual(); } catch { /* */ }
    const ritualEl = $("room-summon-ritual");
    if (ritualEl) ritualEl.hidden = true;
    paintSexSetProgress("");
    if (btn) btn.disabled = false;
    summonBackBusy = false;
  }
  if (girl !== who || !sheIsOut()) return;
  finishSummonArrival(who, "back");
  if (queued?.finished && queued.id) await ackSummonQueue(queued.id);
}

function pickRandomHome(choices = sampleHomes()) {
  return choices[Math.floor(Math.random() * choices.length)] || HOMES[0];
}

function assignHome(who, home) {
  if (!who?.world || !home) return;
  who.world.home = { id: home.id, name: home.name };
  who.world.homeSince = Date.now();
  who.world.lastAutoActivityAt = Date.now();
  if (!who.world.mood) setMood(who, "平靜");
}

/** 半狀態（有 world 無 home）時立刻補住所，避免卡在「正在決定她住哪」。 */
function ensureWorldHome(who) {
  if (!who?.world) return null;
  if (who.world.home?.id && who.world.home?.name) return who.world.home;
  assignHome(who, pickRandomHome());
  return who.world.home;
}

function closeTalkForLeave() {
  if (sheetOpen()) hideSheet();
  else {
    talkBusy = false;
    typeJob += 1;
    setTyping(false);
    if (sceneOpen() || activeRoomScene) closeRoomScene();
  }
}

/** 幫她脫時逃走：離開房間（脫衣進度清 0）。「裸體」旗已撤掉（NUDE_FLAG_ON=false）。 */
async function fleeRoomFromUndress() {
  if (!girl) return;
  const who = girl;
  const name = who.name;
  if (NUDE_FLAG_ON) who.nude = true;
  who.chatEnter = "flee_back";
  clearVisitUndress(who);
  try { clearStunDebt(who); } catch { /* ignore */ }
  startArousalCool(who);
  resetOpenness(who);
  closeTalkForLeave();
  window.RoomActor?.setPresent(false);
  dropVisitPics();
  syncArousalOffChatTimer();
  activityOpen = false;

  const tail = `${name}掙開你逃離了房間。可再召喚回來。`;
  if (who.world?.home) {
    clearShift();
    renderCard();
    renderWorld();
    persistRoom();
    if ($("summon-status")) $("summon-status").textContent = tail;
    return;
  }
  if (who.world) {
    ensureWorldHome(who);
    clearShift();
    renderCard();
    renderWorld();
    persistRoom();
    const region = placedRegion();
    const homeName = who.world.home?.name || "某處";
    if ($("summon-status")) {
      $("summon-status").textContent = region
        ? `${name}掙開你逃離了房間。人在日本的${region.name}，住在${homeName}。可再召喚回來。`
        : tail;
    }
    return;
  }
  await letHerLeave({ instantHome: true, keepArousal: true });
  if ($("summon-status")) {
    $("summon-status").textContent = `${name}掙開你逃離了房間。人已回到日本。可再召喚回來。`;
  }
}

/** 失神／痙攣中記一筆欠帳（閘門關或她沒失神就不記）。 */
function noteStunDebt(amount, label) {
  if (!STUN_RECKONING_ON || !girl) return 0;
  const added = addStunDebt(girl, amount, label);
  pushDebug(`算帳 +${added}（${label}）→ 欠 ${getStunDebt(girl)}`);
  renderDebug();
  return added;
}

function stunReckoningPending(who = girl) {
  if (!STUN_RECKONING_ON || !who) return false;
  const d = ensureStunDebt(who);
  return !!d && (d.amount > 0 || Object.keys(d.acts).length > 0);
}

/**
 * 她回過神（失神／痙攣結束）：依關係階結算欠帳，說一句反應；補到 ≥100 → 說完再逃。
 * 只在對話開著、沒失神、脫衣畫面沒開時才結算（否則欠帳留著等下次）。
 * @returns {Promise<null | { fled: boolean, spoke: boolean, line: string, r: object }>}
 */
async function settleStunReckoning({ redressed = false } = {}) {
  if (!stunReckoningPending()) return null;
  if (!girl || undressDazed(girl) || undressPlayOpen()) return null;
  if (!sheetOpen() || talkFor !== girl.id) return null;
  const who = girl;
  const pers = basePersonality(who);
  const invBefore = getInvasion(who);
  const r = takeStunReckoning(who, { stage: who.stage || "stranger", personality: pers, invasion: invBefore });
  if (!r) return null;
  const b = ensureInvasion(who);
  if (r.add > 0) {
    b.invasion = Math.max(0, Math.min(INVASION_MAX, r.invasionAfter));
    if (invBefore <= 0 && b.invasion > 0) b.invasionDecayAt = Date.now();
  } else if (r.sweetDrop > 0) {
    decayInvasion(who, r.sweetDrop);
  }
  const pct = Math.round(r.share * 100);
  if (r.kind === "sweet") pushDebug(`算帳 欠 ${r.debt}・熱戀以上不補${r.sweetDrop ? `，甜 侵犯 −${r.sweetDrop}` : ""} → ${getInvasion(who)}/${INVASION_MAX}`);
  else pushDebug(`算帳 欠 ${r.debt}×${pct}% → 侵犯 +${r.add} → ${Math.min(INVASION_MAX, invBefore + r.add)}/${INVASION_MAX}${r.fled ? "・逃走" : ""}`);
  const mood = reckoningMood(r);
  if (mood) {
    try { noteMood(who, { ...mood, cause: "趁你失神的時候對你動手動腳" }); } catch { /* ignore */ }
  }
  lastReckoning = { ...r, at: Date.now() };
  persistRoom();
  renderDebug();
  if (r.tone === "none") return { fled: false, spoke: false, line: "", r };
  const prompt = reckoningPrompt(r, { personality: pers, redressed });
  setTyping(true);
  $("portrait-name").textContent = who.name;
  let line = "";
  try {
    line = cleanLine(await askGirl(prompt, null));
  } catch { line = ""; }
  setTyping(false);
  if (!line || /^[\s…。.]*$/.test(line)) line = reckoningFallback(r, pers);
  if (girl !== who) return { fled: false, spoke: false, line: "", r };
  const recap = r.acts ? `（旁白：她回過神來，想起你趁她失神時對她：${r.acts}。）` : "（旁白：她回過神來，想起你趁她失神時動手動腳。）";
  lines.push({ role: "user", content: recap });
  lines.push({ role: "assistant", content: line });
  rememberChat();
  persistRoom();
  await typeLine(who.name, line);
  if (r.fled) {
    const note = reckoningFleeNote(who.name);
    lines.push({ role: "assistant", content: note });
    await typeLine("旁白", note);
    persistRoom();
    await fleeRoomFromInvasion({ cause: "趁你失神的時候對你動手動腳，回神後受不了逃走" });
    return { fled: true, spoke: true, line, r };
  }
  try { paintHalfPortrait(who); } catch { /* ignore */ }
  return { fled: false, spoke: true, line, r };
}

/** 閒置計時器裡發現她回神：佔住對話跑結算（可先等穿衣旁白打完）。 */
async function runIdleReckoning(waitFor = null) {
  if (!girl || talkBusy) return;
  talkBusy = true;
  setTalkEnabled(true);
  try {
    if (waitFor) await waitFor;
    await settleStunReckoning({ redressed: !!waitFor });
  } catch (err) {
    console.warn("[reckoning]", err?.message || err);
  } finally {
    talkBusy = false;
    if (sheetOpen()) setTalkEnabled(true);
  }
}

/** 侵犯值滿：清侵犯、關對話、趕出房間（需再召喚或再抽）。 */
async function fleeRoomFromInvasion({ cause = "動手動腳到你受不了逃走" } = {}) {
  if (!girl) return;
  const who = girl;
  const name = who.name;
  who.chatEnter = "flee_back";
  clearVisitUndress(who);
  clearInvasion(who);
  try { clearStunDebt(who); } catch { /* ignore */ }
  // 情緒餘溫：侵犯爆滿逃走＝最強的氣（−1/分鐘，約 1.5 小時才消；召回時開場也會帶著）
  try { noteMood(who, { type: "angry", level: 100, cause }); } catch { /* ignore */ }
  startArousalCool(who);
  resetOpenness(who);
  // 先關對話／busy／scroll lock，再趕人——避免房間被鎖、找地點卡住
  closeTalkForLeave();
  window.RoomActor?.setPresent(false);
  dropVisitPics();
  syncArousalOffChatTimer();
  activityOpen = false;

  if (who.world?.home) {
    clearShift();
    renderCard();
    renderWorld();
    persistRoom();
    $("summon-status").textContent = `${name}因侵犯感過重逃離了房間。可再召喚回來。`;
    return;
  }
  if (who.world) {
    // 半狀態：補住所後離房，勿停在「正在決定她住哪」且召喚鍵被藏
    ensureWorldHome(who);
    clearShift();
    renderCard();
    renderWorld();
    persistRoom();
    const region = placedRegion();
    const homeName = who.world.home?.name || "某處";
    $("summon-status").textContent = region
      ? `${name}因侵犯感過重逃離了房間，人在日本的${region.name}，住在${homeName}。可再召喚回來。`
      : `${name}因侵犯感過重逃離了房間。可再召喚回來。`;
    return;
  }
  // 尚無 world：同步安置日本＋隨機住所（逃離不等人模選房）
  await letHerLeave({ instantHome: true, keepArousal: true });
  if ($("summon-status")) {
    $("summon-status").textContent = `${name}因侵犯感過重逃離了房間，人已回到日本。可再召喚回來。`;
  }
}


function paintLifeWorld(world, row) {
  // 跟 app.js 名冊合併共用同一份（life_schedule.js paintLifeRow）：行程、心情、記憶、碰過的人、上一件
  paintLifeRow(world, row);
}

function applyLifeSnap(snap) {
  window.__yoroLifeAgentOk = true;
  try {
    window.dispatchEvent(new CustomEvent("yoro-life-agent", { detail: snap }));
  } catch { /* ignore */ }
  if (!girl) return;
  const row = snap?.girls?.[girl.gameGirlId || girl.id];
  if (!row) return;
  girl.world = girl.world || {};
  if (row.phase === "japan" && !sheIsOut()) {
    if (talkBusy || pending || autoLifeBusy || visitClockHeld()) return;
    paintLifeWorld(girl.world, row);
    clearRoomVisit(girl);
    dropVisitPics();
    window.RoomActor?.setPresent(false);
    if (sheetOpen()) hideSheet();
    else syncArousalOffChatTimer();
    persistRoom({ quiet: true });
    try { renderCard(); renderWorld(); } catch { /* ignore */ }
    const status = $("summon-status");
    if (status) status.textContent = `${girl.name}人在日本的住所。接下來做什麼由她自己選。`;
    return;
  }
  const tailId = (world) => {
    const imm = world?.mind?.immediate;
    return Array.isArray(imm) && imm.length ? (imm[imm.length - 1]?.id || "") : "";
  };
  const beforeAgenda = JSON.stringify(girl.world.agenda || null);
  const beforeMem = tailId(girl.world);
  paintLifeWorld(girl.world, row);
  const afterMem = tailId(girl.world);
  if (JSON.stringify(girl.world.agenda || null) !== beforeAgenda || afterMem !== beforeMem) {
    try { renderWorld(); } catch { /* ignore */ }
    persistRoom({ quiet: true });
  }
}

async function pullLifeAgent() {
  try {
    const resp = await fetch("/api/life");
    if (!resp.ok) {
      window.__yoroLifeAgentOk = false;
      return;
    }
    applyLifeSnap(await resp.json());
  } catch {
    window.__yoroLifeAgentOk = false;
  }
}

function stayClockLine() {
  if (!girl || sheIsOut()) return "";
  const until = Number(girl.roomVisitUntil);
  if (!Number.isFinite(until) || until < 1e11) return "";
  const end = taiwanNow(new Date(until));
  return `這趟待到台灣時間${end.label}（${end.dayPart}）就會離開房間，回到日本。時間還沒到不要說要走。`;
}

/** 人已經在房裡、存檔卻沒有到期時間：計時沒開始過，這次直接到點。新召喚會先 arm，不會進這裡。 */
function ensureRoomVisitArmed() {
  if (!girl || !girlInRoom() || sheIsOut() || visitClockHeld()) return;
  const armed = girl.roomStayBand === "wife" || girl.roomStayBand === "short";
  const untilOk = Number(girl.roomVisitUntil) > 1e11;
  if (armed && untilOk) return;
  girl.roomStayBand = isWifeStage(girl.stage) ? "wife" : "short";
  girl.roomVisitUntil = Date.now();
  try { persistRoom(); } catch { /* */ }
}

function startLifeLoop() {
  if (lifeLoopTimer) return;
  lifeLoopTimer = window.setInterval(() => { void tickLifeLoop(); }, 15000);
  void tickLifeLoop();
}

async function tickLifeLoop() {
  if (girl && sheIsOut()) {
    try {
      const before = girl.bodyState?.arousal || 0;
      decayArousalCool(girl);
      if ((girl.bodyState?.arousal || 0) !== before) {
        renderBodyPanel();
        persistRoom();
      }
    } catch { /* */ }
  }
  if (girl?.errand === "clothes" && visitDue(girl.roomVisitUntil, Date.now())) {
    girl.leaveAfterErrand = true;
  }
  if (!girl || autoLifeBusy || visitClockHeld()) return;
  if (pending && !girlInRoom()) return;
  ensureRoomVisitArmed();
  if (stayTalking()) return;
  // 這趟進房時還不是妻子，中途成為妻子：改擲 8～16 小時。儀式進行中不改。
  if (!sheIsOut() && isWifeStage(girl.stage) && girl.roomStayBand !== "wife") {
    armRoomVisit(girl);
    persistRoom();
  }
  // 到期就離開，日本行程等走出房間才開始。生活線連著也一樣要走，不能把人留在房裡。
  if (!sheIsOut() && (girl.leaveAfterErrand || visitDue(girl.roomVisitUntil, Date.now()))) {
    const keptUntil = girl.roomVisitUntil;
    delete girl.leaveAfterErrand;
    autoLifeBusy = true;
    try {
      clearRoomVisit(girl);
      if (girl.chatEnter !== "flee_back") girl.chatEnter = "summon";
      if (!girl.world) await letHerLeave();
      else {
        ensureWorldHome(girl);
        sendHerOutAgain();
      }
    } finally {
      if (girl && girlInRoom() && !sheIsOut() && !(Number(girl.roomVisitUntil) > 1e11)) {
        girl.roomVisitUntil = keptUntil;
      }
      autoLifeBusy = false;
    }
  }
}

function toggleActivity() {
  if (!girl?.world?.home || !sheIsOut()) return;
  activityOpen = !activityOpen;
  renderWorld();
}

async function startActivity(kind) {
  if (!girl?.world?.home || !sheIsOut()) return;
  const mapped = { work: "work", wander: "stroll", browse: "browse", sleep: "sleep" }[kind];
  if (!mapped) return;
  activityOpen = false;
  const status = $("summon-status");
  try {
    const resp = await fetch("/api/life/choose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: girl.gameGirlId || girl.id, kind: mapped }),
    });
    if (!resp.ok) throw new Error("choose");
    await pullLifeAgent();
  } catch {
    if (status) status.textContent = "伺服器沒接到這趟安排。";
  }
}

async function letHerLeave(opts = {}) {
  if (!girl || pending || sheIsOut()) return;
  clearVisitUndress(girl);
  if (!opts.keepArousal) zeroArousal(girl);
  resetOpenness(girl);
  clearRoomVisit(girl);
  if (girl.world?.home) {
    sendHerOutAgain(opts);
    return;
  }
  // 半狀態：補住所後再送出，避免永遠「正在決定她住哪」
  if (girl.world) {
    ensureWorldHome(girl);
    sendHerOutAgain(opts);
    return;
  }
  const region = rollJapanRegion();
  const ground = rollGround(region.id);
  const who = girl;
  const choices = sampleHomes();
  const fallback = pickRandomHome(choices);
  who.world = { regionId: region.id, ground, at: Date.now(), home: null };
  // 先掛暫定住所：召喚／活動鍵立刻可用，不卡找地點
  assignHome(who, fallback);
  who.world.settlingHome = !opts.instantHome;
  if (who.chatEnter !== "flee_back") who.chatEnter = "summon";
  window.RoomActor?.setPresent(false);
  dropVisitPics();
  if (sheetOpen()) hideSheet();
  else syncArousalOffChatTimer();
  activityOpen = false;
  if (opts.instantHome) rememberHomeReturn(who);
  renderCard();
  renderWorld();
  persistRoom();

  if (opts.instantHome) {
    persistRoom();
    $("summon-status").textContent = `${who.name}人在日本的${region.name}，住在${fallback.name}。`;
    return;
  }

  $("summon-status").textContent = `${who.name}已經離開房間，人在${ground.name}。正在決定她住哪。`;
  let home = null;
  let pickedByModel = true;
  try {
    home = await askHome(who, region, choices);
  } catch {
    pickedByModel = false;
    home = fallback;
  }
  if (girl !== who || !who.world) return;
  assignHome(who, home || fallback);
  who.world.settlingHome = false;
  rememberHomeReturn(who);
  renderCard();
  renderWorld();
  persistRoom();
  $("summon-status").textContent = pickedByModel
    ? `${who.name}人在日本的${region.name}，住在${who.world.home.name}。`
    : `${who.name}人在日本的${region.name}，住在${who.world.home.name}。模型沒選成，這間是先抽的。`;
}

function normalizeGirlTags(who) {
  if (!who) return;
  if (!Array.isArray(who.kinks)) {
    const fromPers = (who.personality || []).filter((n) => KINK_SET.has(n));
    const fromArch = KINK_SET.has(who.archetype) ? [who.archetype] : [];
    who.kinks = [...new Set([...fromPers, ...fromArch])];
  }
  const base = (who.personality || []).find((n) => PERSONALITY_SET.has(n));
  if (base) {
    who.personality = [base];
    if (!PERSONALITY_SET.has(who.archetype)) who.archetype = base;
  } else if (KINK_SET.has(who.archetype) || (who.personality || []).some((n) => KINK_SET.has(n))) {
    // 舊檔只抽到性癖：個性退回文靜溫柔，性癖保留
    who.archetype = "文靜溫柔";
    who.personality = ["文靜溫柔"];
  }
  if (!Array.isArray(who.kinkMeta)) who.kinkMeta = [];
}


let bodyUiBound = false;
let bodyUiSyncing = false;

function fillStuffedSelect(sel) {
  if (!sel || sel.options.length) return;
  for (const opt of STUFFED_OPTIONS) {
    const o = document.createElement("option");
    o.value = opt.value;
    o.textContent = opt.label;
    sel.append(o);
  }
}

function formatBodySummary(snap) {
  if (!snap) return "";
  const preg = breedingLabel(girl) ? `・${breedingLabel(girl)}` : "";
  const nude = NUDE_FLAG_ON && girl?.nude ? "・裸體" : "";
  return `${snap.arousalLabel}・開放${snap.openness ?? 0}・侵犯${snap.invasion ?? 0}・精液${SEMEN_ZH[snap.uterusSemen]}${preg}${nude}`;
}

function renderBodyPanel() {
  const panel = $("body-panel");
  if (!panel) return;
  fillStuffedSelect($("body-vagina-stuffed"));
  fillStuffedSelect($("body-anus-stuffed"));
  if (!girl) {
    panel.hidden = true;
    if ($("body-summary")) $("body-summary").textContent = "尚無對象";
    return;
  }
  panel.hidden = false;
  const snap = snapshotBodyForUi(girl);
  if (!snap) return;
  bodyUiSyncing = true;
  const setRange = (id, val, outId) => {
    const el = $(id);
    if (el) el.value = String(val);
    if (outId && $(outId)) $(outId).textContent = String(val);
  };
  setRange("body-arousal", snap.arousal, "body-arousal-val");
  setRange("body-nipple-swell", snap.nipplesSwell, "body-nipple-swell-val");
  setRange("body-breast-swell", snap.breastsSwell, "body-breast-swell-val");
  setRange("body-clit-swell", snap.clitSwell, "body-clit-swell-val");
  setRange("body-labia-swell", snap.labiaSwell, "body-labia-swell-val");
  setRange("body-vagina-wet", snap.vaginaWet, "body-vagina-wet-val");
  setRange("body-semen", snap.uterusSemen, "body-semen-val");
  if ($("body-semen-val")) $("body-semen-val").textContent = SEMEN_ZH[snap.uterusSemen] || "沒有";
  if ($("body-arousal-stage")) $("body-arousal-stage").textContent = snap.arousalLabel;
  if ($("body-nipple-wet")) $("body-nipple-wet").checked = !!snap.nipplesWet;
  if ($("body-clit-wet")) $("body-clit-wet").checked = !!snap.clitWet;
  if ($("body-labia-wet")) $("body-labia-wet").checked = !!snap.labiaWet;
  if ($("body-vagina-stuffed")) $("body-vagina-stuffed").value = snap.vaginaStuffed || "";
  if ($("body-anus-stuffed")) $("body-anus-stuffed").value = snap.anusStuffed || "";
  if ($("body-summary")) {
    {
      $("body-summary").textContent = formatBodySummary(snap);
    }
  }
  bodyUiSyncing = false;
}

function readBodyPanelToGirl() {
  if (!girl || bodyUiSyncing) return;
  applyUiSnapshot(girl, {
    arousal: $("body-arousal")?.value,
    nipplesSwell: $("body-nipple-swell")?.value,
    nipplesWet: $("body-nipple-wet")?.checked,
    breastsSwell: $("body-breast-swell")?.value,
    clitSwell: $("body-clit-swell")?.value,
    clitWet: $("body-clit-wet")?.checked,
    labiaSwell: $("body-labia-swell")?.value,
    labiaWet: $("body-labia-wet")?.checked,
    vaginaWet: $("body-vagina-wet")?.value,
    vaginaStuffed: $("body-vagina-stuffed")?.value,
    anusStuffed: $("body-anus-stuffed")?.value,
    uterusSemen: $("body-semen")?.value,
  });
  const snap = snapshotBodyForUi(girl);
  if ($("body-arousal-val")) $("body-arousal-val").textContent = String(snap.arousal);
  if ($("body-nipple-swell-val")) $("body-nipple-swell-val").textContent = String(snap.nipplesSwell);
  if ($("body-breast-swell-val")) $("body-breast-swell-val").textContent = String(snap.breastsSwell);
  if ($("body-clit-swell-val")) $("body-clit-swell-val").textContent = String(snap.clitSwell);
  if ($("body-labia-swell-val")) $("body-labia-swell-val").textContent = String(snap.labiaSwell);
  if ($("body-vagina-wet-val")) $("body-vagina-wet-val").textContent = String(snap.vaginaWet);
  if ($("body-semen-val")) $("body-semen-val").textContent = SEMEN_ZH[snap.uterusSemen] || "沒有";
  if ($("body-arousal-stage")) $("body-arousal-stage").textContent = snap.arousalLabel;
  if ($("body-summary")) {
    {
      $("body-summary").textContent = formatBodySummary(snap);
    }
  }
  persistRoom();
}

function bindBodyPanel() {
  if (bodyUiBound) return;
  bodyUiBound = true;
  const ids = [
    "body-arousal",
    "body-nipple-swell", "body-breast-swell", "body-clit-swell", "body-labia-swell",
    "body-vagina-wet", "body-semen",
    "body-nipple-wet", "body-clit-wet", "body-labia-wet",
    "body-vagina-stuffed", "body-anus-stuffed",
  ];
  for (const id of ids) {
    const el = $(id);
    if (!el) continue;
    el.addEventListener("input", readBodyPanelToGirl);
    el.addEventListener("change", readBodyPanelToGirl);
  }
}

// 進出房間時通知名冊：人在房裡要收起她的召喚鈕。
(function hookRoomPresence() {
  const actor = window.RoomActor;
  if (!actor?.setPresent || actor.__presenceHook) return;
  const orig = actor.setPresent.bind(actor);
  actor.setPresent = (on) => {
    const before = !!actor.isPresent?.();
    orig(on);
    const after = !!actor.isPresent?.();
    if (before === after) return;
    try {
      window.dispatchEvent(new CustomEvent("yoro-room-presence", { detail: { present: after } }));
    } catch { /* ignore */ }
  };
  actor.__presenceHook = true;
})();

(function restoreRoom() {
  applyShipChrome();
  const pendingAdopt = takePendingAdopt();
  if (pendingAdopt?.girl) {
    // 一間房一次一位：存檔裡別人還在房裡（或正在降臨），這張付過錢的召喚不進房，記退款，照常還原原本那位。
    const occ0 = savedOccupant(loadRoomSave());
    const pid = String(pendingAdopt.girl.gameGirlId || pendingAdopt.girl.id);
    if (!blocksSummon(occ0, pid)) {
      void adoptRosterGirl(pendingAdopt);
      return;
    }
    refundRefusedAdopt(pendingAdopt, occ0);
  }
  const saved = loadRoomSave();
  if (!saved?.girl) return;
  girl = saved.girl;
  migrateAffectionScale(girl);
  player = ensurePlayer(saved.player);
  stripRetiredNude(girl);
  try { settleUndressAfterStun(girl); } catch { /* ignore */ }
  if (!girl.portraits || typeof girl.portraits !== "object") girl.portraits = {};
  ensureBody(girl);
  ensureFriends(girl);
  ensurePlayerNotes(girl);
  normalizeGirlTags(girl);
  // Page load = closed session: soft-reset dialogue, keep long-term girl state.
  const hadTalk = (Array.isArray(girl.chatLines) && girl.chatLines.length)
    || (Array.isArray(saved.lines) && saved.lines.length)
    || !!girl.sessionEnded;
  girl.chatLines = [];
  girl.topicHint = "";
  girl.sessionEnded = hadTalk || !!girl.sessionEnded;
  if (!girl.chatEnter) girl.chatEnter = girl.sessionEnded ? "reopen" : "first";
  syncStage(girl);
  // 舊存檔若停在「正在決定她住哪」（home 空），立刻補住所解卡
  if (girl.world && !girl.world.home?.id) {
    ensureWorldHome(girl);
    girl.world.settlingHome = false;
    try { persistRoom(); } catch { /* ignore */ }
  }
  if (girl.world?.settlingHome && girl.world.home?.id) girl.world.settlingHome = false;
  if (abortClothesErrand(girl)) {
    try { persistRoom(); } catch { /* ignore */ }
  }
  if (typeof saved.present === "boolean") {
    window.RoomActor?.setPresent(saved.present);
  } else {
    window.RoomActor?.setPresent(!girl.world?.home);
  }
  try { window.RoomActor?.conceal?.(false); } catch { /* */ }
  // 已離房：跑掉的性奮按時間慢慢退；沒有冷卻時鐘的舊檔仍直接歸 0。開放度這趟清掉。
  if (!girlInRoom()) {
    if (girl.bodyState?.arousalCoolAt) decayArousalCool(girl);
    else if ((girl.bodyState?.arousal || 0) > 0) zeroArousal(girl);
    if ((girl.bodyState?.openness || 0) > 0) resetOpenness(girl);
    try { persistRoom(); } catch { /* ignore */ }
  }
  syncArousalOffChatTimer();
  if ($("summon-status")) $("summon-status").textContent = `${girl.name}還在（狀態已保留）。長按她繼續聊，或讓她離開。`;
  // 舊房間存檔補綁 Comfy 模型（非 comfy / 已綁定則 no-op）
  ensureGirlComfyCkpt(girl).then(() => {
    if (girl) { try { persistRoom(); } catch { /* */ } renderCard(); }
  }).catch(() => {});
  startLifeLoop();
  if (girl?.summonQueueId) void resumeSummonQueue(girl);
})();

const onId = (id, ev, fn) => { const el = $(id); if (el) el.addEventListener(ev, fn); };
onId("draw-girl", "click", () => { drawGirl(); });
bindRosterSummonUi();
startLifeLoop();
pullLifeAgent();
setInterval(() => { void pullLifeAgent(); }, 20000);
onId("let-leave", "click", letHerLeave);
onId("summon-back", "click", summonHerBack);
onId("open-activity", "click", toggleActivity);
onId("activity-work", "click", () => { startActivity("work"); });
onId("activity-wander", "click", () => { startActivity("wander"); });
onId("activity-browse", "click", () => { startActivity("browse"); });
onId("activity-sleep", "click", () => { startActivity("sleep"); });
bindBodyPanel();
const refillBtn = $("body-refill-semen");
if (refillBtn) {
  refillBtn.addEventListener("click", () => {
    player = refillSemen(player, { resetClimax: true });
    persistRoom();
    refreshTalkActs();
    const status = $("summon-status");
    if (status) status.textContent = `精液已恢復（${player.semenCc}cc）。`;
    if ($("body-summary") && girl) {
      /* hint refresh via refreshTalkActs */
    }
  });
}
const claimBouquetBtn = $("claim-bouquet");
const claimGoldBtn = $("claim-gold");
if (claimGoldBtn && !claimGoldBtn.dataset.bound) {
  claimGoldBtn.dataset.bound = "1";
  claimGoldBtn.addEventListener("click", () => { claimGold(); });
}
if (claimBouquetBtn && !claimBouquetBtn.dataset.bound) {
  claimBouquetBtn.dataset.bound = "1";
  claimBouquetBtn.addEventListener("click", () => { claimBouquet(); });
}
const claimRingBtn = $("claim-ring");
if (claimRingBtn && !claimRingBtn.dataset.bound) {
  claimRingBtn.dataset.bound = "1";
  claimRingBtn.addEventListener("click", () => { claimRing(); });
}
const buyAbortBtn = $("buy-abort-pill");
if (buyAbortBtn && !buyAbortBtn.dataset.bound) {
  buyAbortBtn.dataset.bound = "1";
  buyAbortBtn.addEventListener("click", () => { buyAbortPill(); });
}
const useAbortBtn = $("use-abort-pill");
if (useAbortBtn && !useAbortBtn.dataset.bound) {
  useAbortBtn.dataset.bound = "1";
  useAbortBtn.addEventListener("click", () => { useAbortPill(); });
}
renderRomanceItems();
renderCard();
renderWorld();
renderDebug();
onId("dbg-jump", "change", () => {
  if (!girl) return;
  const value = $("dbg-jump").value;
  girl.stageLock = STAGE_NAME[value] ? value : "";
  syncStage(girl);
  girl.lastMark = girl.stageLock ? `設定跳到${STAGE_NAME[girl.stageLock]}` : "設定改回照感情";
  pushDebug(girl.lastMark);
  if (girl.stageLock) {
    const idx = STAGE_INDEX[girl.stageLock] ?? 0;
    if (idx >= (STAGE_INDEX.girlfriend ?? 4) && idx < (STAGE_INDEX.wife ?? 7)) {
      pushDebug("（除錯跳過：正式流程需花束告白才能進女友帶）");
    } else if (idx >= (STAGE_INDEX.wife ?? 7)) {
      pushDebug("（除錯跳過：正式流程需戒指求婚才能進妻子帶）");
    }
  }
  persistRoom();
  renderDebug();
  refreshTalkActs();
});
bindTalkActs();
bindMissDebug();
bindHungerDebug();
bindOrganDevDebug();
bindReckonDebug();
onId("talk-input-row", "submit", (event) => { sendTalk(event); });
onId("portrait-backdrop", "click", () => {
  if (sexMarathonLocked()) { nagMarathonLocked(); return; }
  if (sceneOpen()) {
    closeRoomScene();
    return;
  }
  hideSheet();
});
onId("portrait-sheet", "click", (event) => {
  if (sexMarathonLocked()) return;
  if (sceneOpen()) return;
  if (event.target.closest(".talk")) return;
  hideSheet();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (sexMarathonLocked()) { nagMarathonLocked(); return; }
  if (sceneOpen()) {
    closeRoomScene();
    return;
  }
  if (sheetOpen()) hideSheet();
});


if (document.documentElement.classList.contains("room-page")) {
  try {
    mountButtPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[butt-pack-editor]", err?.message || err);
  }
  try {
    mountWaistPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[waist-pack-editor]", err?.message || err);
  }
  try {
    mountBreastPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[breast-pack-editor]", err?.message || err);
  }
  try {
    mountKneadPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[knead-pack-editor]", err?.message || err);
  }
  try {
    mountSuckPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[suck-pack-editor]", err?.message || err);
  }
  try {
    mountLickPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[lick-pack-editor]", err?.message || err);
  }
  try {
    mountLabiaPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[labia-pack-editor]", err?.message || err);
  }
  try {
    mountLabiaRubPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[labia-rub-pack-editor]", err?.message || err);
  }
  try {
    mountFingerPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[finger-pack-editor]", err?.message || err);
  }
  if (!XRAY_ACTION_PACKS_ON) {
    // 剖面圖組關著：編輯器按鈕藏起來、不掛面板
    for (const id of ["btn-vagina-finger-packs", "btn-cervix-rub-packs"]) {
      const b = $(id);
      if (b) b.hidden = true;
    }
    for (const id of ["vagina-finger-pack-editor", "cervix-rub-pack-editor"]) {
      const el = $(id);
      if (el) el.hidden = true;
    }
  } else try {
    mountVaginaFingerPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[vagina-finger-pack-editor]", err?.message || err);
  }
  for (const pose of ["missionary", "doggy"]) {
    try {
      mountSexPosePackEditor(pose, {
        getGirl: () => girl,
        getEngine: () => gameImgRoute(),
      });
    } catch (err) {
      console.warn(`[sex-${pose}-pack-editor]`, err?.message || err);
    }
  }
  if (XRAY_ACTION_PACKS_ON) try {
    mountCervixRubPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[cervix-rub-pack-editor]", err?.message || err);
  }
  try {
    mountStandeePackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[standee-pack-editor]", err?.message || err);
  }
  try {
    mountUndressPackEditor({
      getGirl: () => girl,
      getEngine: () => gameImgRoute(),
    });
  } catch (err) {
    console.warn("[undress-pack-editor]", err?.message || err);
  }
}

// 開「編輯」時收合浮動圖組面板（面板不依賴 room-editor，但避免重疊）
$("edit-room")?.addEventListener("click", () => {
  for (const id of [
    "butt-pack-editor", "waist-pack-editor", "breast-pack-editor", "knead-pack-editor", "suck-pack-editor",
    "lick-pack-editor", "labia-pack-editor", "labia-rub-pack-editor", "finger-pack-editor", "standee-pack-editor",
    "undress-pack-editor", "vagina-finger-pack-editor", "cervix-rub-pack-editor",
    "sex-missionary-pack-editor", "sex-doggy-pack-editor",
  ]) {
    const el = $(id);
    if (el) el.hidden = true;
  }
  for (const id of [
    "btn-butt-packs", "btn-waist-packs", "btn-breast-packs", "btn-knead-packs", "btn-suck-packs",
    "btn-lick-packs", "btn-labia-packs", "btn-labia-rub-packs", "btn-finger-packs", "btn-standee-packs",
    "btn-undress-packs", "btn-vagina-finger-packs", "btn-cervix-rub-packs",
    "btn-sex-missionary-packs", "btn-sex-doggy-packs",
  ]) {
    $(id)?.setAttribute("aria-expanded", "false");
  }
});

bindRoomSceneOverlay();
window.RoomPortrait = { open: showSheet };
window.RoomScenes = {
  open: openRoomScene,
  close: closeRoomScene,
  unlocked: () => highStunSceneUnlocked(girl),
};
window.RoomCompanion = {
  /** 肏互動除錯：on＝閘門；state＝這一場；press＝按一下肏；set＝改數值（測試用）；frames＝動畫幀來源。 */
  thrust: {
    on: () => sexThrustOn(),
    state: () => (sexChat ? {
      pose: sexChat.pose, step: sexChat.step, packId: sexChat.packId, imgStep: sexChat.imgStep, img: sexChat.img,
      thrustImg: sexChat.thrustImg, animBusy: sexChat.animBusy, firstRoundDone: sexChat.firstRoundDone,
      sess: { ...sexChat.sess }, switches: sexChat.switches, pendingSwitch: sexChat.pendingSwitch,
      eventsShown: [...sexChat.eventsShown], eventHold: sexChat.eventHold, orgasmLock: !!sexChat.orgasmLock, aiState: sexChat.aiState,
      bloodShots: sexChat.bloodShots || 0, finished: !!sexChat.finished,
      opening: sexChat.opening, openingLine: sexChat.openingLine, openingIntended: sexChat.openingIntended || "", openingDazed: sexChat.openingDazed || "", openingSource: sexChat.openingSource, openingBand: sexChat.openingBand,
      started: [...(sexChat.pump?.started || [])], done: [...(sexChat.pump?.done || [])], dropped: sexChat.pump?.dropped || 0,
      lastAnim: sexChat.lastAnim, animSource: sexChat.animSource, lastAnimHideMs: sexChat.lastAnimHideMs || 0, lastReply: sexChat.lastReply, lastFlush: sexChat.lastFlush,
      stuffed: girl?.bodyState?.organs?.vagina?.stuffed || "",
    } : null),
    press: () => doThrust(),
    draw: () => sexChatToJoin(),
    openingDirective: (stage, pose, personality) => openingDirective({ stage: stage || girl?.stage, pose: pose || sexChat?.pose || "missionary", personality: personality || basePersonality(girl) }),
    set: (patch = {}) => {
      if (!sexChat) return null;
      // 精液是玩家真正的值：改這裡就是改 player.semenCc
      if (patch.semen !== undefined) {
        player = ensurePlayer(player);
        player.semenCc = Number(patch.semen) || 0;
        persistRoom();
      }
      Object.assign(sexChat.sess, patch);
      renderSexHud();
      renderThrustDebug();
      return { ...sexChat.sess };
    },
    flush: () => flushThrustDeferred("debug"),
    frames: (pose) => loadThrustFrames(pose || sexChat?.pose || "missionary"),
    pool: () => sexThrustPool(),
  },
  /** 動作圖裸體版除錯：on＝閘門；lastPick＝上一次選圖；pregen＝手動排補產。 */
  /** 性飢渴除錯：on＝閘門；state＝bodyState.hunger＋現在值；set(v)；lines(opening)＝這句 prompt 會帶的幾行。 */
  hunger: {
    on: () => HUNGER_ON,
    state: () => (girl ? { ...JSON.parse(JSON.stringify(ensureHunger(girl) || {})), now: peekHunger(girl), tier: hungerTier(peekHunger(girl)), label: hungerLabel(girl) } : null),
    set: (v) => { if (!girl) return null; ensureBody(girl); const r = setHunger(girl, v); persistRoom(); renderDebug(); return r; },
    lines: (opening = false) => (girl ? hungerPromptLines(girl, { stageKey: girl.stage || "stranger", opening }) : []),
    beg: () => { if (!girl) return false; ensureBody(girl); if (peekHunger(girl) < BEG_AT) setHunger(girl, 95); return !!window.RoomActor?.startActivity?.("hunger_beg"); },
    /** 直接打開求的對話框（不等她走過來）。 */
    begNow: () => { if (!girl) return false; ensureBody(girl); if (peekHunger(girl) < BEG_AT) setHunger(girl, 95); noteBeg(girl); return maybeOpenBegDialog(); },
    begDialog: () => (begDialog ? { ...begDialog } : null),
    accept: () => begAccept(),
    refuse: () => begRefuse(),
    peak: () => { if (!girl) return null; ensureBody(girl); const r = setHunger(girl, 100); persistRoom(); renderDebug(); return r; },
    peakNow: () => sexPeakNow(),
    marathon: () => (sexChat?.marathon ? { ...sexChat.marathon, locked: marathonLocked(sexChat.marathon) } : null),
  },
  /** 器官開發度除錯：on＝閘門；state＝bodyState.organDev＋外觀；add(organ,n)；lines()＝prompt 會帶的幾行。 */
  organDev: {
    on: () => ORGAN_DEV_ON,
    state: () => (girl ? { ...JSON.parse(JSON.stringify(ensureOrganDev(girl) || {})), look: { areola: girl.look?.areola, nipple: girl.look?.nipple, labia_color: girl.look?.labia_color, devBase: girl.look?.devBase }, label: organDevLabel(girl) } : null),
    add: (organ, n = 1) => { if (!girl) return null; ensureBody(girl); const r = devAddSessions(girl, organ, n); persistRoom(); renderDebug(); return r; },
    touch: (partId) => { organDevTouch(partId); renderDebug(); return girl ? ensureOrganDev(girl) : null; },
    reset: () => { if (!girl) return null; resetOrganDev(girl); persistRoom(); renderDebug(); return ensureOrganDev(girl); },
    lines: () => (girl ? organDevPromptLines(girl, { stageKey: girl.stage || "stranger" }) : []),
  },
  /** 想念值除錯：on＝閘門；state＝bodyState.missYou；ago(h)＝把上次見面往前推 h 小時。 */
  missYou: {
    on: () => MISS_YOU_ON,
    state: () => (girl ? JSON.parse(JSON.stringify(ensureMiss(girl))) : null),
    ago: (h) => shiftMissLastSeen(h),
  },
  /** 事後算帳除錯：on＝閘門；state＝bodyState.stunDebt；last＝上次結算；add(n,label)＝手動記帳；settle()＝立刻結算（她要清醒）。 */
  reckoning: {
    on: () => STUN_RECKONING_ON,
    state: () => (girl ? JSON.parse(JSON.stringify(ensureStunDebt(girl))) : null),
    last: () => lastReckoning,
    add: (n, label = "測試") => noteStunDebt(n, label),
    settle: () => settleStunReckoning(),
  },
  /** 做愛開場圖除錯：on＝閘門；pose()＝目前會用的姿勢；last()＝上次顯示；pregen()＝手動排背景產圖。 */
  /** 召喚預產整套做愛圖：plan() 列缺的、run() 現在補齊（同召喚那條）。 */
  sexSet: {
    plan: () => (girl ? planSexSetFor(girl) : Promise.resolve([])),
    run: () => (girl ? pregenSexSetForSummon(girl) : Promise.resolve(null)),
  },
  sexPose: {
    on: () => SEX_POSES_ON,
    pose: () => (girl ? sexPoseFor(girl) : ""),
    last: () => lastSexPosePick,
    pregen: () => queueSexPosePregen(girl),
    /** 做愛場面目前那一步 { pose, step, packId }。 */
    step: () => (sexStepView ? { ...sexStepView } : null),
    /** 等同按「下一步」。 */
    next: () => {
      const nx = sexStepView ? SEX_STEP_META[sexStepView.step]?.next : "";
      return nx && girl ? showSexStep(girl, nx) : null;
    },
  },
  /** 侵犯值除錯：上一句閒聊衰減。 */
  invasion: {
    lastChatDecay: () => lastChatInvDecay,
  },
  /** 脫衣畫面除錯：chatOn＝對話版閘門；state＝目前模式／階段。 */
  undress: {
    chatOn: () => UNDRESS_CHAT_ON,
    state: () => ({ chat: undressChatMode, scene: activeRoomScene, phase: undressPlay?.phase || "", busy: !!undressPlay?.busy, ending: undressPlay?.ending || "", stage: girl ? undressStage(girl) : 0 }),
  },
  nudeAction: {
    on: () => NUDE_ACTION_PACKS_ON,
    lastPick: () => lastActionPick,
    queued: () => [...nudeActionQueued],
    pregen: () => queueNudeActionPregen(girl),
    promptRev: () => ({ ...(girl?.portraits?.actionPromptRev || {}) }),
  },
  adopt: adoptRosterGirl,
  /** 一間房一次一位：{ id, name, arriving } 或 null（空房／她在外面）。 */
  occupant: roomOccupant,
  /** 上一次 adopt 被拒的原因 { reason, occupant?, text }。 */
  lastRefusal: () => lastAdoptRefusal,
  summonFromRoster: summonRosterGirlIntoRoom,
  reloadRoster: loadRosterGirlsForSummon,
  sync: () => girl && syncProgressToGame(girl),
  flush() {
    if (!girl) return loadRoomSave();
    rememberChat();
    persistRoom();
    return loadRoomSave();
  },
  clear() {
    if (sheetOpen()) {
      try { hideSheet(); } catch { /* ignore */ }
    }
    girl = null;
    lines = [];
    talkFor = "";
    dropVisitPics();
    clearRoomSave();
    try { localStorage.removeItem(ROOM_PROGRESS_KEY); } catch { /* ignore */ }
    window.RoomActor?.setPresent(false);
    try { renderCard(); } catch { /* ignore */ }
    try { renderWorld(); } catch { /* ignore */ }
    if ($("summon-status")) $("summon-status").textContent = "房間是空的（跟手機一樣）。";
  },
  applyMirror: applyRoomMirror,
  isShip: isShipMode,
  current: () => girl,
  /** 番茄鐘結算感情。走房間的升階／5 點緩衝，並寫回名冊。 */
  addAffection(delta, reason = "") {
    bumpAffection(delta, reason);
    try { persistRoom(); } catch { /* ignore */ }
    return girl ? { affection: girl.affection, stage: girl.stage } : null;
  },
  /** 除錯：目前房間對話的 system prompt（看個性逐步揭露用） */
  debugPrompt: (text = "") => (girl ? talkSystem(String(text || "")) : ""),
  mood: () => (girl ? getMoodCarry(girl) : null),
  show: showSheet,
  hide: hideSheet,
  repaintPortrait() {
    try { paintHalfPortrait(girl); } catch { /* ignore */ }
  },
  /**
   * 精液量：get＝現值；force(v)＝直接設（除錯，不觸發）；spend(cc)＝走真正扣精液那條（含腎虧）；
   * kidneyCheck()＝現在檢查一次（主遊戲載入時，只在房間的主人那台呼叫）。
   */
  semen: {
    get: () => ensurePlayer(player).semenCc,
    force(v) {
      player = ensurePlayer(player);
      player.semenCc = Math.round(Number(v) || 0);
      try { persistRoom(); } catch { /* ignore */ }
      return player.semenCc;
    },
    spend: (cc = THRUST.SEMEN_PER_EJAC_CC) => spendPlayerSemen(cc, "debug"),
  },
  kidneyCheck: (source = "load") => (girl ? settleKidney(source) : null),
  /** 能不能開始做愛 { ok, semen, reason }（2026-10-08：精液 >0 才行）。 */
  sexGate: () => {
    const cc = ensurePlayer(player).semenCc;
    return { ok: canStartSex(cc), semen: cc, reason: sexBlockReason(cc) };
  },
  grantSemen(cc) {
    const result = grantPlayerSemen(player, cc);
    player = result.player;
    try { persistRoom(); } catch { /* ignore */ }
    try {
      const row = $("talk-acts");
      if (row) updatePlayerHint(ensurePlayerHint(row), player);
    } catch { /* ignore */ }
    return { cc: result.gained, before: result.before, after: result.after };
  },
};
window.addEventListener("pagehide", () => { if (girl) { rememberChat(); persistRoom(); } });
window.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden" && girl) {
    rememberChat();
    persistRoom();
  }
});
