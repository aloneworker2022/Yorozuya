/** Testdate — 聊天約會沙盒（公園）。主程式不動。
 *  每回合：旁白 → 玩家 →（可選）其他召喚師 → 妹子 → 下一拍旁白。
 */
import { loadPools, generateGirl, RARITY_MARK } from "./girl_gen.js";
import { bindContextFromGirl, resolveCardBinds, partBindInstruction, HIT_BIND_KEYS } from "./card_bind.js";
import { parseMudInput, parseAiMud, touchFakeText, listAvailableCommands, formatCommandSheet } from "./mud_cmd.js";
import {
  loadMalePool,
  generateSummoner,
  nextRivalMove,
  kitSummary,
  kitListText,
  LINE_ZH,
  dateActsOf,
} from "./male_gen.js";
import {
  dateActKindZh,
  dateActExploreLv,
  dateActChance,
  pickDateAct,
  dateActToPlay,
  isTeaseKind,
  isMateAskKind,
} from "./date_act.js";
import {
  playTypeZh,
  PLAY_STEPS,
  PLAY_STEP_LV,
  applyPlayHeat,
  playChanceZh,
  emptyPlayHeat,
  applyRelDrop,
} from "./play_ladder.js";
import { buildSystemPrompt } from "./persona_builder.js";
import {
  EXPLORE_ZH,
  RIVAL_STAGES,
  rivalStageOf,
  playerCap,
  exploreLabel,
  ntrShowZh,
  placeAllows,
  parsePropose,
  actExploreLevel,
  judgePlayerPropose,
  hypnotizeChance,
  rivalExploreCap,
  rivalActChance,
  rivalChanceZh,
  mateResistRoll,
  proposeSamples,
  settleDateScore,
  DEAD_ANGLE,
} from "./date_explore.js";
import {
  emptyPark,
  parkTimeKey,
  parkAlone,
  parkLifeOnly,
  parkAdultOk,
  applyParkAct,
  maybeStartParkEvent,
  parkNarratorLines,
  parkForcedOptions,
  parkDefaultOptions,
  parkZoneName as parkZoneNamePark,
  PARK_TIME_ZH,
  parkMudRoom,
  parkExitNames,
  parkExitIds,
  PARK_ZONES,
  PARK_ZONE_DATE,
  parkLinked,
  parkNextHop,
  parkZoneIdFromName,
  applyParkMove,
  matchParkZone,
} from "./park_script.js";
import {
  pickHotelAct,
  hotelZoneOf,
  hotelExitIds,
  HOTEL_ZONES,
  listHotelChoices,
  hotelAdvanceAct,
  hotelSexZone,
  hotelContinueSexZone,
  parseHotelChoice,
} from "./hotel.js";
import { pickSexPlay, inSexScene } from "./sex_scene.js";
import {
  dateStyleOf,
  matchDateMoment,
  dateStylePromptLines,
  girlWalkExits,
} from "./date_style.js";

const DEFAULT_ENDPOINT = "http://192.168.68.55:11434";
const DEFAULT_MODEL = "e-girl:latest";
const REL_ZH = { stranger: "陌生", friend: "朋友", girlfriend: "女友", wife: "妻子" };
const TIME_ZH = PARK_TIME_ZH;
const PARK = {
  id: "park",
  name: "公園",
  desc: "入口、廣場、兒童遊戲區、廁所、步道、水池、樹林。相鄰才走得到。",
};
const WAIT_OPTIONS = ["坐著等她", "四處看看", "提議 去廣場", "提議 去兒童遊戲區"];
const ARRIVE_ZH = {
  player_wait: "你先到，等她",
  girl_wait: "她先到，等你",
  together: "你們同時到",
};
const ARRIVE_OPTIONS = {
  player_wait: WAIT_OPTIONS,
  girl_wait: ["走過去打招呼", "坐到她旁邊", "先說來得晚", "提議 去廣場"],
  together: ["提議 去廣場", "先找長椅", "提議 去兒童遊戲區", "四處看看"],
};

const $ = (id) => document.getElementById(id);
const esc = (s) =>
  String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]),
  );

const STAMINA_MAX = 30;
const CLIMAX_MAX = 30;
const HOTEL_COST = 5;

let saveGirls = [];
let drawnGirl = null;
let rival = null;
let playerName = "你";
let started = false;
let busy = false;
let girlArrived = false;
let arriveMode = "player_wait";
let dateOutfit = null; // { text, index, girlId }
let bodyState = emptyBody();
let parkState = emptyPark();
let mudEchoes = [];
let lastBodyHit = null;
let lastRivalPlay = null;
let venue = "park";
let hotelZone = "parking";
let sexAsk = "";
let girlSexLeft = 0;
let playerWatchingSex = false;
let playerLeftDate = false;
let sexBeats = 0;
let lastSexPos = "";
let lastSexStyle = "";
let girlCameThisBeat = false;
let girlClimaxCount = 0;
let hotelBeats = 0;
let hotelStayBeats = 0;
let hotelRoomSex = false;

function parkZoneName(id) {
  if (venue === "hotel") return hotelZoneOf(id || hotelZone).name;
  return parkZoneNamePark(id);
}

function hotelMudRoom() {
  const z = hotelZoneOf(hotelZone);
  return [`旅館·${z.name}`, z.desc, `焦點：${(z.foci || []).join("、")}`].join("\n");
}

function hotelActToPlay(act) {
  if (!act) return null;
  if (act.advance || act.kind === "go") {
    return {
      id: act.id,
      name: act.name,
      how: act.how || "",
      cmd: act.cmd || "wait",
      kind: "talk",
      dateAct: true,
      advance: true,
      dest: act.dest,
      roll: { p: 1, denom: 1 },
    };
  }
  const cmd = String(act.cmd || "");
  let kind = act.kind && act.kind !== "go" ? act.kind : "talk";
  if (kind === "talk") {
    if (hotelContinueSexZone(hotelZone, hotelRoomSex) && /磨|插|抽|射|幹/.test(cmd + (act.name || ""))) kind = "mate";
    else if (/脫|掀/.test(cmd)) kind = "strip";
    else if (/摸|舔|吸|親/.test(cmd)) kind = "touch";
  }
  const play = dateActToPlay({
    ...act,
    kind,
    minArousal: 24,
    maxArousal: 30,
  });
  play.ntr = !!act.ntr;
  play.roll = { p: 1, denom: 1 };
  play.advance = !!act.advance;
  play.dest = act.dest;
  return play;
}
let girlZone = "";
let rivalZone = "";
let girlCompany = "follow"; // follow＝同一格、你跟上她
let rivalCompany = "follow";
let girlWaitHere = false;
let girlStay = 0;
let playerExplore = 1;
let rivalExplore = 1;
let watchLock = 0;
let pendingEnd = "";
let rivalAwayBeats = 0;
let skipAwayTick = false;
let rivalJustScattered = false;
let rivalJustReappeared = false;
let rivalChatPins = 0;
const ESCAPE_BASE = 10;
const ESCAPE_CHAT_STEP = 2;
const ESCAPE_DENOM_MAX = 20;

function mudEcho(line) {
  const s = String(line || "").trim();
  if (s) mudEchoes.push(s);
}

function parkTime() {
  return parkTimeKey($("t-time")?.value || "dusk");
}
function actorZone(who) {
  if (who === "girl") {
    if (!girlArrived || girlFled) return "";
    if (girlCompany === "follow") return parkState.zone;
    return girlZone || parkState.zone;
  }
  if (who === "rival") {
    if (!rival?.joined) return "";
    if (rivalCompany === "follow") return parkState.zone;
    return rivalZone || parkState.zone;
  }
  return parkState.zone;
}
function withGirl(who) {
  const gz = actorZone("girl");
  return !!(gz && gz === actorZone(who));
}
function parkRivalHere() {
  return !!(rival && rival.joined && !girlFled && actorZone("rival") === parkState.zone);
}
function rivalShouldSpeak() {
  if (!rival || girlFled) return false;
  if (venue === "hotel") return true;
  if (rivalAwayBeats > 0) {
    if (skipAwayTick) {
      skipAwayTick = false;
      return false;
    }
    rivalAwayBeats -= 1;
    if (rivalAwayBeats > 0) return false;
    markRivalJoinedHere();
    rivalJustReappeared = true;
    rivalJustScattered = false;
    return true;
  }
  if (rival.joined) return parkRivalHere();
  if (!girlHere()) return false;
  const nGirl = turns.filter((t) => t.role === "girl").length;
  return nGirl >= (rival.insertAfter ?? 3);
}
function girlHere() {
  return !!(girlArrived && !girlFled && actorZone("girl") === parkState.zone);
}
function girlWouldFollow(dest) {
  if (!girlArrived || girlFled) return false;
  if (girlCompany !== "follow") return false;
  if (girlWaitHere) return false;
  const rel = relStage();
  if (rel === "stranger" && (dest === "woods" || dest === "toilet")) return false;
  if (rel === "friend" && dest === "toilet") return false;
  return true;
}
function playerToldWait(text) {
  return /等我|在這等|你待著|先別跟|不要跟來|在這裡等|你等一下/.test(String(text || ""));
}
function companyLine() {
  const g = liveGirl();
  if (!g || !girlArrived || girlFled) return "";
  if (girlHere()) return `${g.name}在你身邊`;
  return `${g.name}在${parkZoneName(actorZone("girl"))}（分開）`;
}
function rivalStageIdx() {
  const fromUi = Number($("t-rival-stage")?.value);
  if (Number.isFinite(fromUi) && rival) rival.stageIdx = Math.max(0, Math.min(6, fromUi));
  return rival?.stageIdx ?? 0;
}
function syncRivalStageUi() {
  if ($("t-rival-stage") && rival) $("t-rival-stage").value = String(rival.stageIdx ?? 0);
}
function raiseExplore(who, lv) {
  const n = Math.max(1, Math.min(6, Number(lv) || 1));
  if (who === "player") playerExplore = Math.max(playerExplore, n);
  else rivalExplore = Math.max(rivalExplore, n);
  renderExplore();
}
function renderExplore() {
  const el = $("explore-line");
  if (!el) return;
  const cap = playerCap(relStage());
  const rv = rival ? rivalStageOf(rivalStageIdx()) : null;
  el.textContent = [
    `今晚對你：${exploreLabel(playerExplore)}（天花板 ${cap.maxLv} ${EXPLORE_ZH[cap.maxLv]}）`,
    rv ? `對他：${exploreLabel(rivalExplore)}（${rv.idx} ${rv.name}／髒抬到 ${rv.dirty}）` : "",
    rival?.joined ? `躲開 ${escapeOddsZh()}` : "",
    rival?.joined
      ? `調戲：${rival.lastMove?.play?.name || "依性慾區間"}（性慾 ${bodyState.arousal || 0}）`
      : "",
    watchLock ? "你只能看" : "",
  ].filter(Boolean).join(" · ");
}
function parkCtx(text) {
  return {
    time: parkTime(),
    text: text || lastPlayerAct(),
    alone: parkAlone({ girlArrived: girlHere(), rivalPresent: parkRivalHere() }),
    girlArrived: girlHere(),
    rivalPresent: parkRivalHere(),
    waiting: arriveMode === "player_wait" && !girlArrived,
  };
}
function girlShouldArrive() {
  if (girlArrived || girlFled) return girlArrived;
  if (arriveMode === "girl_wait" || arriveMode === "together") return true;
  if (parkState.phase === "omen" || parkState.phase === "omen2" || parkState.phase === "encounter") return false;
  const z = parkState.zone;
  if (z === "pond" || z === "woods" || z === "toilet") return false;
  return true;
}
function adultSceneOk() {
  if (venue === "hotel") return true;
  return parkAdultOk(parkState, parkTime());
}
function renderPark() {
  const el = $("park-now");
  const time = parkTime();
  const bits = [`${TIME_ZH[time] || "黃昏"} · ${parkZoneName(parkState.zone)}`];
  const co = companyLine();
  if (co) bits.push(co);
  if (rival?.joined && !parkRivalHere() && rivalAwayBeats > 0) bits.push(`${rival.name}走散了`);
  if (parkState.phase === "omen" || parkState.phase === "omen2") bits.push("前兆");
  if (parkState.phase === "encounter") bits.push("遭遇");
  if (el) el.textContent = bits.join(" · ");
  if ($("t-zone") && $("t-zone").value !== parkState.zone) $("t-zone").value = parkState.zone;
}
function resetCompany() {
  girlZone = "";
  rivalZone = "";
  girlCompany = "follow";
  rivalCompany = "follow";
  girlWaitHere = false;
  girlStay = 0;
  playerExplore = playerCap(relStage()).defaultLv;
  rivalExplore = rival ? rivalExploreCap(rivalStageIdx()).floor : 1;
  watchLock = 0;
  pendingEnd = "";
  rivalAwayBeats = 0;
  skipAwayTick = false;
  rivalJustScattered = false;
  rivalJustReappeared = false;
  rivalChatPins = 0;
  lastRivalPlay = null;
  venue = "park";
  hotelZone = "parking";
  sexAsk = "";
  girlSexLeft = 0;
  playerWatchingSex = false;
  playerLeftDate = false;
  sexBeats = 0;
  lastSexPos = "";
  lastSexStyle = "";
  girlCameThisBeat = false;
  girlClimaxCount = 0;
  hotelBeats = 0;
  hotelStayBeats = 0;
  hotelRoomSex = false;
  if (rival) {
    rival.playHeat = emptyPlayHeat(rival.stageIdx || 0);
    rival.playUnlocked = 1;
    rival.playStep = 1;
  }
  renderExplore();
}

function playerAwayWithRival() {
  if (!rival?.joined || girlFled || !girlArrived) return false;
  const gz = actorZone("girl");
  return !!(!girlHere() && gz && gz === actorZone("rival"));
}
function resetPark() {
  parkState = emptyPark();
  if ($("t-zone")?.value) parkState.zone = $("t-zone").value;
  resetCompany();
  renderPark();
}
function applyParkFromPlayer(text) {
  applyParkAct(parkState, parkCtx(text));
  maybeStartParkEvent(parkState, parkCtx(text));
  renderPark();
}
function markGirlArrivedHere() {
  girlZone = parkState.zone;
  girlCompany = "follow";
  girlWaitHere = false;
}
function markRivalJoinedHere() {
  rivalZone = parkState.zone;
  rivalCompany = "follow";
}
function tryGo(who, destRaw, { forced = false } = {}) {
  if (venue === "hotel") {
    const name = actorLabel(who);
    const dest = Object.keys(HOTEL_ZONES).find((id) => id === destRaw || hotelZoneOf(id).name === destRaw) || "";
    if (!dest) {
      mudEcho(`${name}想去「${destRaw}」，旅館裡沒有這個地方。`);
      return false;
    }
    if (dest === hotelZone) {
      mudEcho(`${name}已經在${hotelZoneOf(dest).name}。`);
      return false;
    }
    if (!hotelExitIds(hotelZone).includes(dest) && !forced) {
      mudEcho(`${name}不能從${hotelZoneOf(hotelZone).name}直接到${hotelZoneOf(dest).name}。`);
      return false;
    }
    hotelZone = dest;
    parkState.zone = dest;
    if (who !== "player") {
      if (who === "girl") girlZone = dest;
      if (who === "rival") rivalZone = dest;
    }
    girlZone = dest;
    rivalZone = dest;
    mudEcho(`${name}到${hotelZoneOf(dest).name}。`);
    renderPark();
    return true;
  }
  const name = actorLabel(who);
  const from = actorZone(who) || parkState.zone;
  const dest = parkZoneIdFromName(destRaw) || matchParkZone(destRaw);
  if (!dest || !PARK_ZONES[dest]) {
    mudEcho(`${name}想去「${destRaw || "別處"}」，公園裡沒有這個地方。`);
    return false;
  }
  if (dest === from) {
    mudEcho(`${name}已經在${parkZoneName(from)}。`);
    return false;
  }
  if (!parkLinked(from, dest)) {
    const exits = parkExitNames(from);
    mudEcho(
      `${name}不能從${parkZoneName(from)}直接到${parkZoneName(dest)}。這裡接：${exits.join("、") || "無"}。`,
    );
    return false;
  }
  if (who === "player") {
    mudEcho("約會是她帶路。你不能自己走。用「提議 去××」或分開時「跟隨」。");
    return false;
  }
  if (who === "girl") {
    const together = girlCompany === "follow" && !girlWaitHere;
    if (!forced && together) {
      const moment = girlDateMoment({ arriving: false });
      if (!moment.allowWalk) {
        mudEcho(`${name}還想待在${parkZoneName(from)}（${moment.activeZh}）。這一拍不換區。`);
        return false;
      }
      if (moment.walkOnlyPull && moment.pull?.id && dest !== moment.pull.id) {
        mudEcho(`${name}不想去${parkZoneName(dest)}，比較想去${moment.pull.name}。`);
        return false;
      }
    }
    girlZone = dest;
    girlStay = 0;
    if (together) {
      applyParkMove(parkState, dest);
      girlCompany = "follow";
      girlWaitHere = false;
      if (rival?.joined && rivalCompany === "follow") rivalZone = dest;
      mudEcho(`${name}往${parkZoneName(dest)}走。你跟上了（跟隨）。`);
      applyParkAct(parkState, { ...parkCtx("去" + parkZoneName(dest)), skipMove: true });
      maybeStartParkEvent(parkState, parkCtx("去" + parkZoneName(dest)));
    } else {
      girlCompany = dest === parkState.zone ? "follow" : "split";
      mudEcho(
        girlCompany === "follow"
          ? `${name}走到${parkZoneName(dest)}，回到你身邊。`
          : `${name}走到${parkZoneName(dest)}（分開）。`,
      );
    }
    renderPark();
    return true;
  }
  if (who === "rival") {
    rivalZone = dest;
    rivalCompany = dest === parkState.zone ? "follow" : "split";
    const g = liveGirl();
    const atGirl = g && dest === actorZone("girl");
    mudEcho(
      rivalCompany === "follow"
        ? `${name}走到${parkZoneName(dest)}，跟到你這邊。`
        : atGirl
          ? `${name}走到${parkZoneName(dest)}，往${g.name}那邊去了（分開）。`
          : `${name}走到${parkZoneName(dest)}（分開）。`,
    );
    renderPark();
    return true;
  }
  return false;
}
function tryFollow(who) {
  const name = actorLabel(who);
  const from = actorZone(who) || parkState.zone;
  const target = who === "player" ? actorZone("girl") : parkState.zone;
  if (!target) {
    mudEcho(`${name}沒有人可以跟。`);
    return false;
  }
  if (from === target) {
    if (who === "girl") {
      girlCompany = "follow";
      girlWaitHere = false;
    }
    if (who === "rival") rivalCompany = "follow";
    if (who === "player") {
      girlCompany = "follow";
      girlWaitHere = false;
    }
    mudEcho(`${name}已經在一起。`);
    renderPark();
    return true;
  }
  const hop = parkNextHop(from, target);
  if (!hop) {
    mudEcho(`${name}走不到那邊。`);
    return false;
  }
  if (who === "player") {
    applyParkMove(parkState, hop);
    if (hop === (girlZone || target) || hop === actorZone("girl")) {
      girlCompany = "follow";
      girlWaitHere = false;
      girlZone = hop;
      mudEcho(`你跟上${liveGirl()?.name || "她"}，來到${parkZoneName(hop)}。`);
    } else {
      mudEcho(`你往她那邊走，來到${parkZoneName(hop)}。她還在${parkZoneName(target)}。`);
    }
    applyParkAct(parkState, { ...parkCtx("跟隨"), skipMove: true });
    maybeStartParkEvent(parkState, parkCtx("跟隨"));
    renderPark();
    return true;
  }
  return tryGo(who, hop);
}

function tryPropose(who, raw) {
  const p = parsePropose(raw);
  if (p?.dest === "secluded") {
    p.dest = rivalTakeAwayDest() || "";
    if (!p.dest) p.dest = "secluded";
  }
  const g = liveGirl();
  const name = actorLabel(who);
  if (who === "player") {
    const judge = judgePlayerPropose({
      rel: relStage(),
      heart: bodyState.heart || 0,
      haveLv: playerExplore,
      zone: parkState.zone,
      time: parkTime(),
      lifeOnly: parkLifeOnly(parkTime(), parkState.zone),
      propose: p,
    });
    if (!judge.ok) {
      mudEcho(`${g?.name || "她"}搖頭。${judge.reason}`);
      applyHeartDelta(-1);
      return false;
    }
    mudEcho(judge.echo);
    if (judge.home) {
      applyHeartDelta(1);
      pendingEnd = playerAwayWithRival() ? "ntr" : "home";
      return true;
    }
    applyHeartDelta(1);
    if (judge.dest) {
      girlWaitHere = false;
      girlCompany = "follow";
      tryGo("girl", judge.dest, { forced: true });
    }
    if (judge.level) raiseExplore("player", judge.level);
    renderExplore();
    return true;
  }
  if (who === "rival") {
    const cap = rivalExploreCap(rivalStageIdx());
    const want = p?.kind === "place" ? (DEAD_ANGLE.has(p.dest) ? 4 : 1) : (p?.level || 3);
    const dirty = want > cap.floor;
    const pAct = rivalObeyChance(rivalActChance(rivalStageIdx(), want, rivalExplore));
    if (Math.random() >= pAct) {
      echoRivalFail(p?.label || raw || "逼她");
      return false;
    }
    if (p?.kind === "place") {
      const dest = p.dest === "secluded" ? (rivalTakeAwayDest() || "") : p.dest;
      if (!dest || dest === "secluded") {
        mudEcho(`${name}想把她帶到沒人的地方，可是這邊走不了。`);
        return false;
      }
      girlCompany = "split";
      rivalCompany = "split";
      tryGo("girl", dest, { forced: true });
      tryGo("rival", dest);
      mudEcho(`${name}要把她帶去沒人的地方。`);
      return true;
    }
    if (dirty) mudEcho(`${name}不講理，半強迫要她「${p.label}」。`);
    else mudEcho(`${name}說服她「${p.label}」。`);
    raiseExplore("rival", want);
    return true;
  }
  return false;
}

function rivalTakeAwayDest() {
  const from = actorZone("girl") || parkState.zone;
  if (DEAD_ANGLE.has(from)) return from;
  if (parkLinked(from, "toilet")) return "toilet";
  if (parkLinked(from, "woods")) return "woods";
  return parkNextHop(from, "toilet") || parkNextHop(from, "woods") || "";
}

function tryHypnotize(who) {
  if (who !== "rival") {
    mudEcho("只有其他召喚師會用催眠。");
    return false;
  }
  const g = liveGirl();
  const name = actorLabel("rival");
  if (!g || !withGirl("rival")) {
    mudEcho(`${name}想催眠，但她不在他旁邊。`);
    return false;
  }
  const idx = rivalStageIdx();
  const chance = hypnotizeChance(idx);
  const ok = Math.random() < chance;
  if (!ok) {
    echoRivalFail("催眠她");
    applyHeartDelta(1);
    return false;
  }
  const cap = rivalExploreCap(idx);
  const lift = Math.min(cap.dirty, Math.max(cap.floor + 1, rivalExplore + 1));
  raiseExplore("rival", lift);
  watchLock = 1;
  const show = rival.ntrShow === "away" ? "away" : "front";
  if (show === "away") {
    const dest = rivalTakeAwayDest();
    girlCompany = "split";
    rivalCompany = "split";
    girlWaitHere = false;
    if (dest && dest !== (actorZone("girl") || parkState.zone)) {
      tryGo("girl", dest, { forced: true });
      tryGo("rival", dest);
    }
    mudEcho(
      `${name}催眠成功，把${g.name}帶走了。在你面前她已經聽他的。你只能看，插不了手。`,
    );
  } else {
    mudEcho(`${name}催眠成功，就在你面前玩弄${g.name}。你只能看，插不了手。`);
    if (g && withGirl("rival")) {
      const fake = lift >= 6 ? "磨下面" : lift >= 5 ? "脫光" : lift >= 4 ? "脫上衣" : "摸胸部";
      applyBodyFromAct(fake);
      lastBodyHit = { hit: { id: lift >= 4 ? "breast" : "body", part: "身體" } };
      bodyState.lastWho = "rival";
    }
  }
  renderExplore();
  renderPark();
  return true;
}

const PART_LOOK_ZH = {
  breast: "胸部", nipple: "乳頭", areola: "乳暈", labia: "陰唇", clit: "陰蒂",
  pubic: "陰毛", butt: "臀部", mouth: "嘴唇", waist: "腰", thigh: "腿", body: "體型",
};

function allowIntimateAct(who, cmd, opts = {}) {
  const lv = actExploreLevel(cmd.verb, cmd.part?.id || cmd.target);
  if (lv <= 1) return true;
  if (who === "player") {
    const cap = playerCap(relStage());
    if (lv > cap.maxLv) {
      mudEcho("以你們現在的關係，她不會讓你這樣。");
      return false;
    }
    if (lv > playerExplore) {
      if (relStage() === "stranger") {
        mudEcho("她還沒答應。硬來只會讓她更想走。");
        applyHeartDelta(-2);
        return false;
      }
      mudEcho("這超過今晚她答應的。你硬來。");
      applyHeartDelta(relStage() === "wife" ? 0 : -2);
    } else {
      raiseExplore("player", lv);
    }
    return true;
  }
  if (who === "rival") {
    const cap = rivalExploreCap(rivalStageIdx());
    if (opts.playForced) {
      if (lv > cap.floor) mudEcho(`${rival.name}不講理，半強迫。`);
      return true;
    }
    const pAct = rivalObeyChance(rivalActChance(rivalStageIdx(), lv, rivalExplore));
    if (Math.random() >= pAct) {
      echoRivalFail(wantActZh(cmd, "動手"));
      return false;
    }
    if (lv > cap.floor) mudEcho(`${rival.name}不講理，半強迫。`);
    raiseExplore("rival", lv);
    if (lv >= 6 && mateResistRoll(rivalStageIdx()) && rival) {
      rival.mates = (rival.mates || 0) + 1;
      const st = rivalStageOf(rival.stageIdx || 0);
      if (st.mateNeed && rival.mates >= st.mateNeed && rival.stageIdx < 6) {
        rival.stageIdx += 1;
        rival.mates = 0;
        syncRivalStageUi();
        mudEcho(`她對${rival.name}的七段推進到「${rivalStageOf(rival.stageIdx).name}」。`);
      }
    }
    return true;
  }
  return true;
}

function actorLabel(who) {
  if (who === "player") return ($("t-player")?.value || "").trim() || playerName || "你";
  if (who === "rival") return rival?.name || "他";
  if (who === "girl") return liveGirl()?.name || "她";
  return who;
}

function wantActZh(cmd, fallback = "") {
  if (!cmd) return fallback || "動手";
  if (cmd.verb === "hypnotize") return "催眠她";
  if (cmd.verb === "propose") {
    const p = parsePropose(cmd.target || cmd.display || "");
    return p?.label || cmd.target || "逼她";
  }
  if (cmd.verb === "strip") {
    const t = cmd.target || "";
    if (/胸罩|bra/.test(t)) return "脫她胸罩";
    if (/內褲|panties/.test(t)) return "脫她內褲";
    if (/褲|裙|bottoms/.test(t)) return "脫她褲子";
    if (/衣|上衣|top/.test(t)) return "脫她上衣";
    return "脫她衣服";
  }
  if (cmd.verb === "look") {
    const zh = PART_LOOK_ZH[cmd.part?.id] || cmd.target;
    return zh ? `看${zh}` : "看她";
  }
  if (cmd.verb === "lift") {
    const t = cmd.target || "";
    if (/衣|胸|乳|奶|top/.test(t) && !/裙|褲/.test(t)) return "掀她上衣";
    return "掀她裙子";
  }
  const fake = touchFakeText(cmd);
  if (fake && fake !== "摸") return fake;
  return String(cmd.display || cmd.target || fallback || "動手").replace(/^指令[:：]\s*/, "") || "動手";
}

function echoRivalFail(want) {
  const name = rival?.name || "他";
  const act = String(want || "動手").replace(/^「|」$/g, "").trim() || "動手";
  mudEcho(`${name}想要${act}，但是沒成功。`);
}

function tickRivalMate() {
  if (!rival) return false;
  rival.mates = (rival.mates || 0) + 1;
  const st = rivalStageOf(rival.stageIdx || 0);
  if (st.mateNeed && rival.mates >= st.mateNeed && rival.stageIdx < 6) {
    rival.stageIdx += 1;
    rival.mates = 0;
    applyRelDrop(rival);
    syncRivalStageUi();
    mudEcho(`她對${rival.name}的七段推進到「${rivalStageOf(rival.stageIdx).name}」。`);
    return true;
  }
  return false;
}

function applyAfterSexMates(n) {
  const count = Math.max(0, Math.round(Number(n) || 0));
  if (!rival || !count) return { n: 0, from: rivalStageIdx(), to: rivalStageIdx(), names: [] };
  const from = rivalStageIdx();
  const names = [];
  for (let i = 0; i < count; i++) {
    if (tickRivalMate()) names.push(rivalStageOf(rival.stageIdx).name);
  }
  return { n: count, from, to: rivalStageIdx(), names };
}

function hotelInRoom() {
  return venue === "hotel" && hotelContinueSexZone(hotelZone, hotelRoomSex);
}

function hotelPrivateHere() {
  return venue === "hotel" && hotelContinueSexZone(hotelZone, hotelRoomSex);
}

function playSexingNow(play) {
  if (play?.sex) return true;
  if (venue === "hotel") return hotelInRoom() && (play?.kind === "mate" || play?.sex);
  return sexSceneOn();
}

function girlLimp() {
  return (Number(bodyState.stamina) || 0) <= 0 && (sexSceneOn() || hotelInRoom());
}

function girlWantsHome() {
  return (Number(bodyState.stamina) || 0) <= 0 && !sexSceneOn() && !hotelInRoom();
}

function ensureHimClimax() {
  if (!rival) return;
  if (!rival.climaxCap) rival.climaxCap = 4 + Math.floor(Math.random() * 6);
  if (rival.climax == null) rival.climax = 0;
  if (rival.climaxCount == null) rival.climaxCount = 0;
}

function applyStaminaCost(play) {
  if (!play) return;
  let d = 1;
  const kind = play.kind || "";
  if (play.sex || kind === "mate") d = 4;
  else if (kind === "strip" || kind === "penis") d = 2;
  else if (kind === "touch") d = 2;
  else if (play.advance) d = 1;
  else d = 1;
  const before = Number(bodyState.stamina);
  const n = Number.isFinite(before) ? before : STAMINA_MAX;
  bodyState.stamina = Math.max(0, n - d);
  if (bodyState.stamina <= 0) {
    if (girlLimp()) mudEcho(`${liveGirl()?.name || "她"}體力見底，腿軟使不上力，由他擺布。`);
    else if (girlWantsHome()) mudEcho(`${liveGirl()?.name || "她"}體力見底，只想回家。`);
  }
}

function applyHimClimaxGain(play) {
  if (!rival) return;
  ensureHimClimax();
  if (rival.spent) return;
  const style = play?.sex?.style || "";
  let gain = 0;
  if (play?.sex || play?.kind === "mate") {
    gain = 7;
    if (/fast|pound|spank/.test(style)) gain = 10;
    else if (/slow|hold|grind/.test(style)) gain = 5;
    if (girlLimp()) gain += 2;
  } else if (venue === "hotel" || play?.kind === "touch" || play?.kind === "strip") {
    gain = 1;
  }
  if (!gain) return;
  rival.climax = Math.min(CLIMAX_MAX, (rival.climax || 0) + gain);
  if (rival.climax >= CLIMAX_MAX) fireHimClimax();
}

function fireHimClimax() {
  if (!rival || rival.spent) return;
  rival.climax = 0;
  rival.climaxCount = (rival.climaxCount || 0) + 1;
  const o = organs();
  o.uterus.semen = Math.min(3, (o.uterus.semen || 0) + 1);
  o.vagina.stuffed = "penis";
  tickRivalMate();
  mudEcho(
    `${rival.name}射了（第 ${rival.climaxCount}/${rival.climaxCap} 發）。精液灌進子宮。`,
  );
  if (rival.climaxCount >= rival.climaxCap) {
    rival.spent = true;
    mudEcho(`${rival.name}今晚射完了。還埋著，可是高潮值暫時填不滿。`);
  }
  renderBody();
}

function resolvePlay(play) {
  if (!play || !rival) return false;
  const stepZh = PLAY_STEPS[(play.step || 1) - 1]?.name || "";
  const typeZh = play.dateAct
    ? dateActKindZh(play.kind)
    : playTypeZh(play.playType || rival.playType);
  const rec = {
    ok: false,
    name: play.name,
    how: play.how || "",
    step: play.step || 1,
    kind: play.kind || "",
    typeZh,
    stepZh,
  };
  if (!withGirl("rival")) {
    echoRivalFail(play.name);
    mudEcho("她不在他旁邊。");
    lastRivalPlay = rec;
    return false;
  }
  const teasing = isTeaseKind(play.kind);
  const mateAsk = isMateAskKind(play.kind);
  const sexing = playSexingNow(play);
  const crowded = parkLifeOnly(parkTime(), actorZone("rival") || parkState.zone);
  if (!sexing && teasing && (play.step || 1) >= 4 && crowded) {
    echoRivalFail(play.name);
    mudEcho("這裡人太多，做不成。");
    applyRivalHarassHeat(play);
    lastRivalPlay = rec;
    return false;
  }
  const info = play.dateAct && !sexing
    ? dateActChance(play, { stageIdx: rivalStageIdx(), haveLv: rivalExplore })
    : (play.roll || { p: 0, denom: 99 });
  const p = sexing ? 1 : rivalObeyChance(info.p);
  if (Math.random() >= p) {
    echoRivalFail(play.name);
    mudEcho(`（${typeZh}${stepZh ? "·" + stepZh : ""} ${playChanceZh({ ...info, p })}）`);
    applyRivalHarassHeat(play);
    lastRivalPlay = rec;
    return false;
  }
  if (!play.dateAct) applyPlayHeat(rival, play.step);
  const world = playWorldCmd(play);
  const prevHit = lastBodyHit;
  if (world) applyMudCommand("rival", world, { playForced: true });
  const alreadyHit = !!(lastBodyHit?.hit && lastBodyHit !== prevHit);
  if (!alreadyHit) applyRivalHarassHeat(play);
  if (teasing || sexing) applyPlayBody(play);
  if (sexing) applySexOutcome(play);
  else applyHimClimaxGain(play);
  applyStaminaCost(play);
  if (mateAsk && !sexing) maybeBeginSexAsk(play);
  hotelHopIfNeeded(play);
  const exploreLv = play.dateAct ? dateActExploreLv(play.kind) : (PLAY_STEP_LV[play.step] || 1);
  raiseExplore("rival", exploreLv);
  const label = play.dateAct
    ? `${dateActKindZh(play.kind)}·性慾≥${play.minArousal ?? 0}`
    : `${typeZh}·${stepZh}`;
  mudEcho(`${rival.name}做成「${play.name}」（${label}）。`);
  const mateOk = sexing && (play.dateAct ? play.kind === "mate" : play.step >= 5);
  if (mateOk && (obeyLevel() >= 3 || mateResistRoll(rivalStageIdx()))) tickRivalMate();
  renderExplore();
  lastRivalPlay = { ...rec, ok: true, sex: play.sex || null, how: play.how || rec.how };
  return true;
}

function playWorldCmd(play) {
  if (isMateAskKind(play?.kind) && !playSexingNow(play)) return null;
  const raw = String(play?.cmd || "").trim();
  const cmd = parseMudInput(raw || "等");
  const v = cmd.verb || "";
  if (["touch", "lick", "kiss", "suck", "grind", "lift", "strip"].includes(v)) return cmd;
  if (v === "propose" || v === "go" || v === "follow") return null;
  if (play?.dateAct && v === "look") return null;
  const typedLook = !play?.dateAct && (play?.playType === "expose" || /胸部|臀|乳頭|陰唇|大腿|腿/.test(raw));
  if (v === "look" && typedLook) return cmd;
  return null;
}

function playSpeakHint(play, ok, talk) {
  if (!play) return "";
  const stepZh = PLAY_STEPS[(play.step || 1) - 1]?.name || "";
  const typeZh = play.dateAct
    ? `${dateActKindZh(play.kind)}（她性慾 ${bodyState.arousal || 0}，區間 ${play.minArousal ?? 0}–${play.maxArousal ?? play.minArousal ?? 0}）`
    : playTypeZh(play.playType || rival?.playType);
  return [
    play.dateAct
      ? `這一拍約會動作＝「${play.name}」（${typeZh}）。`
      : `這一拍你的手段＝「${play.name}」（${typeZh}·${stepZh}）。`,
    play.how ? `做法：${play.how}` : "",
    talk ? `語氣可帶聊天「${talk.name}」：${talk.how}` : "",
    ok
      ? isMateAskKind(play.kind)
        ? "系統判定：邀配／交配做成了。這是做愛開頭。台詞必須親口講死：我要幹她了／我現在就肏她／帶她去做愛。1～3 句男人的話。禁止還沒開口就當已經在抽插。禁止叫她跟隨、禁止自己把她帶走。禁止只輸出手段名稱。"
        : venue === "hotel"
        ? play.ntr
          ? "系統判定：這一手是當面羞辱玩家。台詞要對著旁邊那個付錢的男人講，逼她出醜給他看。禁止裝沒看見他。"
          : "系統判定：旅館這一手做成了。用這一區的設施（床／桌／花灑／池）把她弄出口。禁止提公園。"
        : "系統判定：調戲做成了。用強硬的男人語氣把這一手調戲做出口。這不是交配。禁止講成已經插入、禁止叫她跟隨、禁止帶走。禁止只輸出手段名稱或括號標籤。"
      : "系統判定：沒做成。口氣還是硬，只是沒碰到、她沒接這一下。禁止講成已經做成。禁止叫跟隨。禁止只輸出括號標籤。",
    "對象＝女方。脫／掀／摸的是她的衣服與身體。禁止脫自己上衣、禁止自己露乳頭。只有掏陰莖是你露出自己的下體。不要講死地點名字。",
    play.sex
      ? `做愛場：姿勢「${play.sex.positionZh}」、做法「${play.sex.styleZh}」${play.sex.climax ? `、高潮「${play.sex.climax.zh}」` : ""}。陰莖在她體內。用男人的話把這一手做出口。禁止改成只言語。`
      : "",
    "指令：wait。禁止改成 look／看她／看胸部交差。系統已經依這一手結算過了。",
    "台詞：1～3 句你說出口的話。",
  ].filter(Boolean).join("");
}

function matchPlayHit(play) {
  const cmd = String(play?.cmd || "").trim();
  if (!cmd) return null;
  const parsed = parseMudInput(cmd);
  if (["touch", "lick", "kiss", "suck", "grind", "lift", "strip"].includes(parsed.verb)) {
    return matchBodyHit(touchFakeText(parsed) || cmd) || matchBodyHit(cmd);
  }
  return null;
}

function rivalHarassHit(play) {
  if (bodyState.lastWho === "rival" && bodyState.lastVerb !== "look" && bodyState.lastPart) {
    return BODY_HITS.find((h) => h.id === bodyState.lastPart) || null;
  }
  return matchPlayHit(play);
}

function rivalPlayGirlLines() {
  if (!lastRivalPlay || !rival || !parkRivalHere()) return [];
  const p = lastRivalPlay;
  const st = rivalStageOf(rivalStageIdx());
  const looking = bodyState.lastWho === "rival" && bodyState.lastVerb === "look" ? bodyState.lastPart : "";
  const hit = looking ? null : rivalHarassHit(p);
  if (p.ok) {
    const tease = isTeaseKind(p.kind);
    const mateAsk = isMateAskKind(p.kind);
    if (venue === "hotel") {
      return [
        `【切場＝旅館】公園結束了。程式已判定「${rival.name}」做成旅館動作「${p.name}」。`,
        `他要你配合的事：${p.how || p.name}`,
        p.said ? `他剛說出口：${p.said}` : "",
        "禁止再演公園那一下。主句對他現在這一手。你不能拒絕。",
        "可以分一句給玩家（羞、氣他付錢看），但主句是對召喚師。",
      ].filter(Boolean);
    }
    return [
      `【這一拍主互動＝召喚師】程式已判定「${rival.name}」做成「${p.name}」。`,
      tease
        ? "這是調戲，不是交配。禁止演成已經被插入、禁止自己跟隨他走。性慾和羞恥已經被這一手推高。"
        : mateAsk || sexOpeningNow()
        ? "這是做愛開頭。他已經要把你幹了。主句必須說出口：要跟他做愛／不要在這裡做／去開房間，或罵他還是腿軟接住。禁止裝成還在普通調戲。禁止演成已經在抽插。禁止自己跟隨他走。"
        : "",
      `他要你配合的事：${p.how || p.name}`,
      p.said ? `他剛說出口：${p.said}` : "",
      `他對你的七段＝「${st.name}」。`,
      looking ? `這一拍是被看「${PART_LOOK_ZH[looking] || looking}」，不是被摸。` : "",
      ...harassAcceptLines({ hit, who: "rival", ok: true, looking }),
      (p.step || 1) >= 3
        ? "他這一拍很強硬，不是在商量。你可以罵、掙、喊玩家，但主句要對準他正在做的那一下，禁止裝成普通聊天。"
        : "你必須跟他互動、回應他的需求：問話就答他、要靠近就靠或躲他、稱讚就接或擋他、上手就對準他的手／嘴反應。",
      "可以分一句給玩家（求助、解釋、心虛），但主句是對召喚師說的。禁止整段只理玩家。禁止裝沒發生。禁止替他說話（那是禁止代他開口，不是禁止你跟他說話）。",
      "禁止只用「好煩」「真討厭」「欸」把正在發生的接觸當背景。被摸哪、看哪、講哪，台詞就要落在那裡。",
    ].filter(Boolean);
  }
  return [
    `【召喚師沒做成】「${rival.name}」想「${p.name}」但沒成功。`,
    hit ? `他想碰的是你的${hit.part}，但沒碰到。` : "",
    "你可以白他、縮開、或跟玩家說他剛才想做什麼。禁止演成他已經做成。禁止只說「好煩」而不提他想碰哪。",
    "這一拍主互動仍是玩家。",
  ].filter(Boolean);
}

function scatterRival() {
  if (!rival) return;
  const here = parkState.zone;
  const hops = parkExitIds(here).filter((z) => z !== here);
  const away = hops.length
    ? hops[Math.floor(Math.random() * hops.length)]
    : (Object.keys(PARK_ZONES).find((z) => z !== here) || "gate");
  rivalCompany = "split";
  rivalZone = away;
  girlCompany = "follow";
  girlWaitHere = false;
  girlZone = here;
  rivalAwayBeats = 1 + Math.floor(Math.random() * 3);
  skipAwayTick = true;
  rivalJustScattered = true;
  rivalJustReappeared = false;
  watchLock = 0;
  lastRivalPlay = null;
  girlCameThisBeat = false;
  sexBeats = 0;
  lastSexPos = "";
  lastSexStyle = "";
  playerWatchingSex = false;
  if (sexAsk === "ask" || sexAsk === "announce" || sexAsk === "stay") sexAsk = "";
  if (rival) {
    rival.pendingAction = null;
    rival.lastMove = null;
  }
  if (bodyState.lastWho === "rival") {
    bodyState.lastWho = "";
    bodyState.lastPart = "";
    bodyState.lastVerb = "";
  }
  const o = organs();
  if (o.vagina?.stuffed === "penis") {
    o.vagina.stuffed = (o.uterus?.semen || 0) >= 1 ? "semen" : "";
    renderBody();
  }
  renderPark();
}

function escapeDenom() {
  return Math.min(ESCAPE_DENOM_MAX, ESCAPE_BASE + ESCAPE_CHAT_STEP * (rivalChatPins || 0));
}
function escapeChance() {
  return 1 / escapeDenom();
}
function escapeOddsZh() {
  return `1/${escapeDenom()}`;
}
function rivalCmdIsChat(cmd) {
  if (!cmd) return false;
  const v = cmd.verb || "";
  if (v === "touch" || v === "lick" || v === "suck" || v === "kiss" || v === "grind" || v === "lift" || v === "strip" || v === "hypnotize" || v === "propose") {
    return false;
  }
  return v === "say" || v === "wait" || v === "wave" || !!(cmd.say && v === "look");
}
function noteRivalChat() {
  if (!rival || !withGirl("rival")) return;
  const before = escapeDenom();
  rivalChatPins += 1;
  const after = escapeDenom();
  if (after > before) {
    mudEcho(`${rival.name}把話聊上了。你帶她躲開更難了（${escapeOddsZh()}）。`);
  }
  renderExplore();
}

function tryEscapeRival() {
  const g = liveGirl();
  const name = rival?.name || "他";
  if (!parkRivalHere() || !g || !girlHere()) {
    mudEcho("旁邊沒有人好甩。");
    return false;
  }
  if (watchLock) {
    mudEcho("你插不了手。");
    return false;
  }
  const odds = escapeOddsZh();
  if (Math.random() >= escapeChance()) {
    mudEcho(`你拉著${g.name}想甩掉${name}，沒甩掉。他還在（${odds}）。`);
    return false;
  }
  scatterRival();
  mudEcho(`你拉著${g.name}躲開了。終於甩掉${name}。先恢復你們的約會；他過幾句可能會再跟上。`);
  return true;
}

const PRIVATE_LOOK_PARTS = new Set(["breast", "nipple", "areola", "labia", "clit", "butt", "anus"]);
const LOOK_SHAME = {
  breast: 3, nipple: 5, areola: 5, labia: 8, clit: 8, butt: 3, anus: 8, thigh: 2, waist: 1,
};

function mudLookPart(who, partId, g) {
  const ctx = bindContextFromGirl(g, playerName);
  const keys = HIT_BIND_KEYS[partId] || [partId];
  const seen = new Set();
  const out = [];
  for (const k of keys) {
    if (seen.has(k) || !ctx[k]) continue;
    seen.add(k);
    out.push(`${PART_LOOK_ZH[k] || k}：${ctx[k]}`);
  }
  const c = bodyState.clothes || emptyClothes();
  if (partId === "breast" || partId === "nipple" || partId === "areola") {
    out.push(c.top || c.bra ? "還穿著上衣／胸罩，只是看。" : "沒有上衣遮，看得見。");
  } else if (partId === "labia" || partId === "clit" || partId === "pubic") {
    out.push(c.bottoms || c.panties ? "還隔著褲子／內褲，只是看。" : "沒有下身遮，看得見。");
  } else if (partId === "butt" || partId === "anus") {
    out.push(c.bottoms || c.panties ? "還隔著褲子／裙，只是看。" : "沒有下身遮，看得見。");
  }
  return out;
}

function applyLookAtPart(who, partId, g) {
  const name = actorLabel(who);
  const zh = PART_LOOK_ZH[partId] || partId;
  mudEcho(`${name}看著她的${zh}。沒有碰到。`);
  for (const line of mudLookPart(who, partId, g)) mudEcho(line);
  if (who === "girl" || !withGirl(who)) return;
  bodyState.lastPart = partId;
  bodyState.lastVerb = "look";
  bodyState.lastWho = who;
  if (PRIVATE_LOOK_PARTS.has(partId)) markExposed("seen");
  const mul = REL_BODY_MUL[relStage()] || REL_BODY_MUL.friend;
  const dS = Math.round((LOOK_SHAME[partId] || 0) * mul.s);
  const dA = PRIVATE_LOOK_PARTS.has(partId) ? Math.round(1 * mul.a) : 0;
  if (dS || dA) {
    bodyState.shame = clampBody(bodyState.shame + dS);
    bodyState.arousal = clampBody(bodyState.arousal + dA);
    renderBody(`被看「${zh}」　羞恥 ${dS ? "+" + dS : "0"}、性慾 ${dA ? "+" + dA : "0"}`);
  }
}

function applyMudCommand(who, cmd, opts = {}) {
  const name = actorLabel(who);
  const g = liveGirl();
  if (!cmd || cmd.verb === "say") {
    if (who === "player" && playerToldWait(cmd?.say || cmd?.raw || "")) {
      if (girlArrived && !girlFled) {
        girlCompany = "split";
        girlWaitHere = true;
        girlZone = actorZone("girl") || parkState.zone;
        mudEcho(`${liveGirl().name}留在${parkZoneName(girlZone)}等你。你們分開了。`);
        renderPark();
      }
    }
    return;
  }
  if (cmd.verb === "wait") {
    mudEcho(`${name}等著。`);
    return;
  }
  if (cmd.verb === "sit") {
    mudEcho(`${name}坐下來。`);
    return;
  }
  if (cmd.verb === "wave") {
    mudEcho(`${name}揮了揮手。`);
    return;
  }
  if (cmd.verb === "strip") {
    const t = cmd.target || "";
    let fake = "脫衣服";
    if (/胸罩|bra/.test(t)) fake = "脫胸罩";
    else if (/內褲|panties/.test(t)) fake = "脫內褲";
    else if (/褲|裙|bottoms/.test(t)) fake = "脫褲子";
    else if (/衣|上衣|top/.test(t)) fake = "脫上衣";
    if (g && withGirl(who) && who !== "girl") {
      if (!allowIntimateAct(who, cmd, opts)) return false;
      const hit = applyBodyFromAct(fake);
      lastBodyHit = hit;
      bodyState.lastWho = who;
      mudEcho(`${name}對她${fake}。`);
      return true;
    } else if (who === "girl") {
      mudEcho(`${name}抓住自己的衣服。`);
    } else {
      mudEcho(`${name}想脫，但她不在這裡。`);
    }
    return false;
  }
  if (cmd.verb === "propose") {
    return tryPropose(who, cmd.target || cmd.display || "");
  }
  if (cmd.verb === "hypnotize") {
    return tryHypnotize(who);
  }
  if (cmd.verb === "escape") {
    return tryEscapeRival();
  }
  if (cmd.verb === "go") {
    tryGo(who, cmd.target || "");
    return;
  }
  if (cmd.verb === "follow") {
    tryFollow(who);
    return;
  }
  if (cmd.verb === "masturbate") {
    if (who !== "player") {
      mudEcho(`${name}動了一下。`);
      return;
    }
    mudEcho("你在旁邊自慰。");
    if (withGirl("player") || venue === "hotel" || playerWatchingSex) {
      bodyState.shame = clampBody((bodyState.shame || 0) + 1);
      renderBody("你自慰　她羞恥 +1");
    }
    return;
  }
  if (cmd.verb === "look") {
    if (/狀態|查看/.test(cmd.target || "")) {
      mudEcho(worldStatsLine());
      return;
    }
    if (!cmd.target || /這裡|周圍|四周|here/.test(cmd.target)) {
      mudEcho(`${name}看了看這裡。`);
      mudEcho(venue === "hotel" ? hotelMudRoom() : parkMudRoom(parkState, parkTime()));
      return;
    }
    if (g && (cmd.target === "她" || cmd.target === g.name || cmd.part?.id === "body")) {
      if (!withGirl(who)) {
        mudEcho(`${name}看向她剛才的方向。她不在這裡（${parkZoneName(actorZone("girl")) || "還沒到"}）。`);
        return;
      }
      mudEcho(`${name}看著${g.name}。`);
      mudEcho(`你看見她：${publicLookLine(g)}。`);
      mudEcho(clothesLookLine());
      return;
    }
    if (cmd.part && g) {
      if (!withGirl(who)) {
        mudEcho(`${name}想看，但她不在這裡。`);
        return;
      }
      applyLookAtPart(who, cmd.part.id, g);
      return;
    }
    mudEcho(`${name}看著${cmd.target}。`);
    return;
  }
  if (cmd.verb === "touch" || cmd.verb === "lick" || cmd.verb === "kiss" || cmd.verb === "suck" || cmd.verb === "grind" || cmd.verb === "lift") {
    if (who === "girl") {
      mudEcho(`${name}縮了一下身體。`);
      return;
    }
    let fake = touchFakeText(cmd);
    if (cmd.verb === "lift") {
      const t = cmd.target || "";
      fake = /衣|胸|乳|奶|top/.test(t) && !/裙|褲/.test(t) ? "掀她上衣" : "掀她裙子";
    }
    if (cmd.verb === "suck" && !cmd.part) fake = "吸乳頭";
    if (cmd.verb === "grind" && !cmd.part) fake = "磨下面";
    if (g && withGirl(who)) {
      if (!allowIntimateAct(who, cmd, opts)) return false;
      const hit = applyBodyFromAct(fake);
      lastBodyHit = hit;
      bodyState.lastWho = who;
      if (hit?.hit) mudEcho(`${name}碰到她的${hit.hit.part}。${contactHow(hit.hit.id)}。`);
      else mudEcho(`${name}：${fake}`);
      if (cmd.part) {
        for (const line of mudLookPart(who, cmd.part.id, g)) mudEcho(line);
      }
      return true;
    }
    mudEcho(`${name}想碰，但她不在這裡。`);
    return false;
  }
}

function emptyExposed() {
  return { bra: false, panties: false, nude: false, flash: false, seen: false };
}
function emptyClothes() {
  return { top: true, bottoms: true, bra: true, panties: true };
}
function emptyOrgans() {
  return {
    nipples: { swell: 0, wet: false },
    breasts: { swell: 0 },
    clit: { swell: 0, wet: false },
    labia: { swell: 0, wet: false },
    vagina: { wet: 0, stuffed: "" },
    anus: { stuffed: "" },
    uterus: { semen: 0 },
  };
}
function organs() {
  const o = bodyState.organs || (bodyState.organs = emptyOrgans());
  if (!o.uterus) o.uterus = { semen: 0 };
  if (!o.vagina) o.vagina = { wet: 0, stuffed: "" };
  if (!o.anus) o.anus = { stuffed: "" };
  return o;
}
function emptyBody() {
  return {
    arousal: 0,
    shame: 0,
    lastPart: "",
    lastVerb: "",
    lastWho: "",
    exposed: emptyExposed(),
    clothes: emptyClothes(),
    organs: emptyOrgans(),
    parts: {},
    heart: 0,
    alcohol: 0,
    stamina: STAMINA_MAX,
  };
}
let girlFled = false;
let dateSettled = false;
let turns = []; // { role, name, text, options? }
let abortCtl = null;
let lastDebug = "";

function lsGet(k, fb) {
  try { return localStorage.getItem(k) || fb; } catch { return fb; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, v); } catch { /* ignore */ }
}

async function api(path, method = "GET", body = null) {
  const r = await fetch(path, {
    method,
    headers: body ? { "Content-Type": "application/json" } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await r.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch { data = { detail: text }; }
  if (!r.ok) {
    const d = data?.detail;
    const msg =
      typeof d === "string"
        ? d
        : d?.message || (Array.isArray(d) ? d.map((x) => x.msg || x).join("; ") : null) || r.statusText;
    throw new Error(msg || `HTTP ${r.status}`);
  }
  return data;
}

function setStatus(id, msg, err = false) {
  const el = $(id);
  if (!el) return;
  el.textContent = msg || "";
  el.classList.toggle("err", !!err);
}

function normalizeEndpoint(raw) {
  let s = (raw || "").trim();
  if (!s) return DEFAULT_ENDPOINT;
  if (!/^https?:\/\//i.test(s)) s = "http://" + s;
  s = s.replace(/\/+$/, "");
  const host = s.replace(/^https?:\/\//i, "");
  if (!/:\d+/.test(host.split("/")[0])) s += ":11434";
  return s;
}

function aiCfg() {
  const endpoint = normalizeEndpoint($("t-endpoint")?.value || DEFAULT_ENDPOINT);
  const model = ($("t-model")?.value || "").trim() || DEFAULT_MODEL;
  if ($("t-endpoint") && $("t-endpoint").value !== endpoint) $("t-endpoint").value = endpoint;
  lsSet("testdate.endpoint", endpoint);
  lsSet("testdate.model", model);
  return { provider: "ollama", endpoint, model };
}

function liveGirl() {
  const sel = $("t-girl")?.value;
  if (sel && sel.startsWith("save:")) {
    const id = sel.slice(5);
    return saveGirls.find((g) => g.id === id) || drawnGirl;
  }
  return drawnGirl;
}

function relStage() {
  return $("t-rel")?.value || "friend";
}

function isWorkWear(s) {
  return /制服|白袍|工作服|圍裙|職業裝|護理|店員|工地|校服|實驗衣|手術|西裝套裝/.test(String(s || ""));
}

function wardrobeList(g) {
  const L = g?.look || {};
  const w = Array.isArray(L.wardrobe) ? L.wardrobe.filter(Boolean) : [];
  if (w.length) return w;
  if (L.style && !isWorkWear(L.style)) return [L.style];
  return [];
}

function pickDateOutfit(g) {
  const L = g?.look || {};
  const career = L.career_outfit || "";
  const pool = wardrobeList(g).filter((x) => x !== career && !isWorkWear(x));
  const fallback = "輕便的私服（出門約會的便裝，不是上班那身）";
  if (!pool.length) return { text: fallback, index: 0, girlId: g?.id };
  const rel = relStage();
  const span = rel === "girlfriend" || rel === "wife" ? pool.length : Math.min(2, pool.length);
  const pick = pool[Math.floor(Math.random() * span)];
  const wardrobe = wardrobeList(g);
  const index = Math.max(0, wardrobe.indexOf(pick));
  return { text: pick, index, girlId: g?.id };
}

function ensureDateOutfit(g) {
  if (!g) return { text: "便服", index: 0, girlId: "" };
  if (!dateOutfit || dateOutfit.girlId !== g.id) dateOutfit = pickDateOutfit(g);
  return dateOutfit;
}

function wornOutfit(g) {
  return ensureDateOutfit(g).text;
}

function publicLookLine(g) {
  const L = g?.look || {};
  const c = bodyState.clothes || emptyClothes();
  const bits = [
    L.height_cm ? `${L.height_cm}cm` : null,
    L.build,
    L.face,
    [L.hair_color, L.hair].filter(Boolean).join("") || null,
    L.eyes,
    L.eye_color,
    `穿著${wornOutfit(g)}`,
    L.feature,
  ].filter(Boolean);
  if (!c.top) bits.push("上衣沒了");
  if (!c.bra) bits.push("沒穿胸罩");
  if (!c.bottoms) bits.push("褲子／裙沒了");
  if (!c.panties) bits.push("沒穿內褲");
  return bits.join("、") || "外貌未填";
}

function lookLine(g) {
  // 側欄給測試者看完整人設；餵 AI 的場面用 publicLookLine。
  const L = g?.look || {};
  const bits = [
    publicLookLine(g),
    L.bust || [L.cup, L.breast_shape].filter(Boolean).join("、") || null,
    L.labia_size,
    L.clitoris_size,
  ].filter(Boolean);
  return bits.join("、") || "外貌未填";
}

function lastPlayerAct() {
  const t = [...turns].reverse().find((x) => x.role === "player");
  return t?.text || "";
}

function bindGirlLook(text, g = liveGirl()) {
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  return resolveCardBinds(text, bindContextFromGirl(g, you));
}

function partLookLines(hit, g = liveGirl(), mode = "feel") {
  if (!hit || !g) return [];
  const block = partBindInstruction(
    g,
    hit.id,
    ($("t-player")?.value || "").trim() || playerName || "你",
    { mode },
  );
  return block ? [bindGirlLook(block, g)] : [];
}

const BODY_MAX = 30;

const BODY_HITS = [
  {
    re: /拔掉?(?:跳蛋|按摩器)|取出(?:跳蛋|按摩器)|關掉跳蛋|拿掉(?:跳蛋|按摩器)/,
    id: "vibe_out", part: "取出跳蛋", tier: "explicit", arousal: 2, shame: 3,
    vocal: "取出時會「嗯、啊」抽一下。",
    feel: "體內突然空掉，還在餘韻。",
    high: "拿出來時可能帶出水。",
  },
  {
    re: /拔掉?假[陰陽][莖具]|取出假[陰陽][莖具]|拿出按摩棒|拔掉按摩棒/,
    id: "dildo_out", part: "取出假陰莖", tier: "explicit", arousal: 3, shame: 4,
    vocal: "抽出來會「啊——」拉長音。",
    feel: "內壁被刮過、突然空虛。",
    high: "拔出時水／愛液會跟著出來。",
  },
  {
    re: /拔掉?小黃瓜|取出小黃瓜|拿出小黃瓜|抽出小黃瓜/,
    id: "cucumber_out", part: "取出小黃瓜", tier: "explicit", arousal: 3, shame: 4,
    vocal: "抽出來會「啊——」涼意跟著走。",
    feel: "凹凸刮過內壁，突然又空又熱。",
    high: "拔出時愛液／精液可能跟著帶出來。",
  },
  {
    re: /(?:把)?.{0,6}(?:陰莖|肉棒|鸡巴).{0,4}(?:拔|抽)出|(?:拔|抽)出.{0,4}(?:陰莖|肉棒|鸡巴)/,
    id: "penis_out", part: "抽出陰莖", tier: "explicit", arousal: 4, shame: 5,
    vocal: "抽出來會「啊——」拉長，穴口一時合不攏。",
    feel: "內壁被刮過、宮口忽然沒東西含。",
    high: "抽出時水／精液可能跟著湧出。",
  },
  {
    re: /跳蛋|按摩器|震動棒/,
    id: "vibe_in", part: "塞跳蛋／按摩器", tier: "explicit", arousal: 8, shame: 14,
    vocal: "被塞進去會倒抽氣：嗯、等、裡面——。",
    feel: "體內多了一顆在震動的東西，走路會頂到。",
    high: "公園裡開著跳蛋，腿軟、水沿著腿流，還要裝沒事。",
  },
  {
    re: /假陰莖|假陽具|按摩棒/,
    id: "dildo_in", part: "塞假陰莖", tier: "explicit", arousal: 10, shame: 14,
    vocal: "被塞入會「啊啊、呃」撐開。",
    feel: "比手指粗，內壁被填滿，走路會夾緊。",
    high: "體內含著假陰莖還要約會，每一步都頂到最裡。",
  },
  {
    re: /小黃瓜|(?:塞|插|放).{0,4}黃瓜|黃瓜.{0,4}(?:塞|插|進)/,
    id: "cucumber_in", part: "塞小黃瓜", tier: "explicit", arousal: 10, shame: 15,
    vocal: "冰的東西進去會倒抽氣：啊、涼、等一下——。",
    feel: "冰涼凹凸刮過內壁，和體溫差很大。",
    high: "含著小黃瓜走路，每一步都涼、都頂到。",
  },
  {
    re: /內射|中出|射進(?:去|來|裡面|子宮)|射在裡面|射滿|灌精|灌進子宮|射精.{0,6}(?:裡|中|子宮|穴)/,
    id: "creampie", part: "內射／灌進子宮", tier: "explicit", arousal: 14, shame: 12,
    vocal: "被射進去會破音：啊、熱、裡面、滿——。",
    feel: "熱精打在宮口、子宮被灌沉。",
    high: "宮口含住龜頭榨精；精液太多會從穴口溢出來。",
  },
  {
    re: /(?:陰莖|肉棒|鸡巴).{0,8}(?:插|進|入|塞)|(?:插|進|塞).{0,8}(?:陰莖|肉棒|鸡巴)|抽插|做愛|性交|插入她|幹她|操她/,
    id: "penis_in", part: "陰莖插入", tier: "explicit", arousal: 14, shame: 12,
    vocal: "被進去會「啊——呃」拉長，中間斷句。",
    feel: "龜頭撐開陰唇、內壁纏上去，能感覺頂到哪。",
    high: "宮口去找龜頭；腿軟、水聲、可能噴。",
  },
  {
    re: /(?:把|將)?.{0,4}精液.{0,6}(?:塞|灌|進|入|倒)|塞.{0,4}精液/,
    id: "semen_in", part: "陰道裡的精液", tier: "explicit", arousal: 6, shame: 10,
    vocal: "精液進去／積著會「嗯、黏、熱」。",
    feel: "陰道裡有黏熱的精液，走路會擠出來一點。",
    high: "殘精混愛液沿腿流，穴口合不攏。",
  },
  {
    re: /子宮|宮口|子宮頸/,
    id: "uterus", part: "子宮／宮口", tier: "explicit", arousal: 12, shame: 10,
    vocal: "頂到宮口會「呃、啊、裡面——」破音。",
    feel: "最深處被頂、宮口發酸發麻，小腹往裡縮。",
    high: "宮口一張一合去含面前的東西，腰自己送上去。",
  },
  {
    re: /喝酒|乾杯|灌酒|啤酒|紅酒|清酒|酒精|喝一杯|再喝|乾杯/,
    id: "drink", part: "喝酒", tier: "kiss", arousal: 3, shame: 0,
    vocal: "喝酒時可能嗆到或笑出來。",
    feel: "胃裡發熱、臉開始紅。",
    high: "醉了之後身體更敏、更敢、也更站不穩。",
  },
  {
    re: /指(?:插|入|進).*(?:屁眼|肛)|(?:屁眼|肛門).*(?:指|插|扣)|插(?:進|入)?(?:屁眼|肛)/,
    id: "anus_finger", part: "指插屁眼", tier: "explicit", arousal: 12, shame: 15,
    vocal: "短而尖：呃、啊啊、誒——肛門被進入手指時會破音，講不完一句。",
    feel: "後穴被撐開的異物感、腰往前逃、腿軟。",
    high: "翻白眼、吐舌、後穴失禁（噴屎／噴尿都可能）。",
  },
  {
    re: /屁眼|肛門|後穴|肛/,
    id: "anus", part: "屁眼", tier: "explicit", arousal: 9, shame: 12,
    vocal: "嚇到的短音：呃、誒、不要——碰到後面會縮。",
    feel: "括約肌自己縮、背脊發麻。",
    high: "站不穩、想夾緊卻夾不住。",
  },
  {
    re: /陰蒂/,
    id: "clit", part: "陰蒂", tier: "explicit", arousal: 11, shame: 10,
    vocal: "又尖又短：啊、嗯嗯、哈——被點到會彈。",
    feel: "陰蒂一碰就過電，膝蓋打直或併腿。",
    high: "噴水／噴尿、翻白眼、叫到失聲。",
  },
  {
    re: /陰道|插穴|扣穴|手指.*穴|伸進.*穴/,
    id: "vagina", part: "陰道", tier: "explicit", arousal: 12, shame: 12,
    vocal: "被進去會「啊——呃」拉長，中間斷句。",
    feel: "內壁被撐、腿開不穩、水聲。",
    high: "噴水、噴尿、吐舌、眼神往上翻。",
  },
  {
    re: /陰唇|扣陰|小穴|私處|摸下面|她下面|的下面|磨下面/,
    id: "labia", part: "陰唇", tier: "explicit", arousal: 10, shame: 10,
    vocal: "悶叫：嗯、啊、哦——陰唇被撥開會漏音。",
    feel: "陰唇發熱、濕、想夾腿。",
    high: "水沿著腿流、站不住。",
  },
  {
    re: /乳頭|奶頭/,
    id: "nipple", part: "乳頭", tier: "explicit", arousal: 9, shame: 9,
    vocal: "又癢又尖：啊、嗯、誒——被捻到會抽氣。",
    feel: "乳頭硬起來、胸口往後縮又彈回。",
    high: "光捻乳頭就能叫出聲、腿間出水。",
  },
  {
    re: /胸|奶|乳|揉胸|乳房/,
    id: "breast", part: "乳房", tier: "groping", arousal: 6, shame: 6,
    vocal: "被揉會「嗯…啊」含在喉嚨裡。",
    feel: "乳房被抓的形變、乳尖擦到衣服。",
    high: "自己把胸口送出去又羞、呼吸碎。",
  },
  {
    re: /嘴唇|親嘴|接吻|吻唇/,
    id: "lips", part: "嘴唇", tier: "kiss", arousal: 4, shame: 4,
    vocal: "吻住時只能「嗯、唔、呼」含糊音，分開才喘。",
    feel: "唇麻、涎水、舌頭被纏。",
    high: "舌頭吐出來收不回去、眼睛迷濛。",
  },
  {
    re: /屁股|臀部|臀/,
    id: "butt", part: "屁股", tier: "groping", arousal: 6, shame: 6,
    vocal: "被抓臀會「啊、嗯」往前縮。",
    feel: "臀肉被揉開、重心不穩。",
    high: "腰自己塌、裙／褲縫濕。",
  },
  {
    re: /扣|手指伸|伸進|插入|插進/,
    id: "vagina", part: "陰道", tier: "explicit", arousal: 12, shame: 12,
    vocal: "被手指進去：「啊啊、呃、哦——」。",
    feel: "裡面被攪、腿軟。",
    high: "噴水、翻白眼。",
  },
  {
    re: /脫(?:掉)?(?:褲子|長褲|短褲|裙子|短裙)|脫褲(?!衩)/,
    id: "bottoms_off", part: "脫褲子／裙", tier: "explicit", arousal: 5, shame: 12,
    vocal: "下身一空會「啊、等一下」並想用手擋。",
    feel: "腿和私處突然少了一層，風灌進來。",
    high: "當眾沒有褲子／裙，走路會走光。",
    expose: "flash",
  },
  {
    re: /脫(?:掉)?(?:衣服|上衣|外套|襯衫|罩衫)/,
    id: "top_off", part: "脫上衣", tier: "explicit", arousal: 4, shame: 11,
    vocal: "上衣被扯掉會倒抽氣：不要看。",
    feel: "胸口和腰突然露在空氣裡。",
    high: "上半身當眾少一件，想用手擋胸。",
    expose: "flash",
  },
  {
    re: /脫(?:掉)?胸罩|解開胸罩|摘胸罩|脫罩杯|拉開胸罩/,
    id: "bra_off", part: "脫胸罩", tier: "explicit", arousal: 5, shame: 11,
    vocal: "胸口一空會倒抽氣：啊、不要看。",
    feel: "乳房失去支撐、乳尖碰到空氣／視線。",
    high: "當眾沒有胸罩，走路會晃，想用手擋。",
    expose: "bra",
  },
  {
    re: /脫(?:掉)?內褲|扯內褲|脫褲衩|褪內褲/,
    id: "panties_off", part: "脫內褲", tier: "explicit", arousal: 6, shame: 13,
    vocal: "下身一涼會「啊、等一下」並想併腿。",
    feel: "私處直接接觸風、可能已經濕。",
    high: "沒有內褲遮，走路會黏、怕被看見縫。",
    expose: "panties",
  },
  {
    re: /全裸|裸體|脫光|赤裸|一絲不掛|脫成裸/,
    id: "nude", part: "裸體", tier: "explicit", arousal: 7, shame: 16,
    vocal: "驚叫蓋過快感：不要看、啊、遮——。",
    feel: "全身暴露，乳頭、私處、屁股都在空氣裡。",
    high: "當眾全裸：遮不住、腿間反光、路人可能看見。",
    expose: "nude",
  },
  {
    re: /露出|真空出|掀(?:她的?)?(?:裙|上衣|衣|胸口)|掀裙|掀起裙子|當眾露|露陰|露胸|露出私|露出狂/,
    id: "flash", part: "露出", tier: "explicit", arousal: 8, shame: 14,
    vocal: "短而羞的啊、嗯——知道有人可能看見。",
    feel: "私密部位被風／視線碰到，想把衣服拉回去又來不及。",
    high: "露出的刺激讓腿軟，同時羞恥要把人燒穿。",
    expose: "flash",
  },
  {
    re: /被?(?:別人|路人|他人|召喚師)?看(?:到|見)?(?:你|她)?(?:的)?(?:私|穴|胸|奶|屁|裸|內褲|乳頭)|給人看|被人看|看你私|看她私|展示私密|給.*看下面/,
    id: "seen", part: "被看私密處", tier: "explicit", arousal: 6, shame: 15,
    vocal: "被看見會破音：不要看、啊、轉過去——。",
    feel: "視線像手一樣貼在私處上，比被摸還丟臉。",
    high: "被看著還有感覺：出水被看見、更想逃。",
    expose: "seen",
  },
  {
    re: /被看著做|當眾(?:做|摸|插)|有人看著|路人看|被人看見.*(?:做|摸|插|色)|邊做邊被看/,
    id: "seen_lewd", part: "色事被看見", tier: "explicit", arousal: 8, shame: 16,
    vocal: "叫到一半發現被看：啊、有人、不要——叫聲收不回去。",
    feel: "正在做色色的事被目擊，性慾和羞恥同時爆。",
    high: "當眾繼續的話可能失禁被看見。",
    expose: "seen",
  },
  {
    re: /脫(?:掉|衣)|掀裙|脫她|脫你/,
    id: "strip", part: "脫衣", tier: "explicit", arousal: 4, shame: 12,
    vocal: "驚叫多於快感：等、不要看、啊。",
    feel: "皮膚暴露在風裡、想遮。",
    high: "遮不住、當眾少一件的羞恥壓過一切。",
    expose: "flash",
  },
  {
    re: /內褲|內衣|胸罩/,
    id: "underwear", part: "內衣", tier: "explicit", arousal: 5, shame: 10,
    vocal: "短促：嗯、你幹嘛。",
    feel: "布料被扯、接觸空氣。",
    high: "濕透的布黏在身上。",
    expose: "flash",
  },
  {
    re: /腰/,
    id: "waist", part: "腰", tier: "groping", arousal: 3, shame: 3,
    vocal: "輕吸氣：嗯。",
    feel: "腰側發癢、身體一僵。",
    high: "腰自己往他手裡靠。",
  },
  {
    re: /腿|大腿|裙底/,
    id: "thigh", part: "腿／裙", tier: "groping", arousal: 5, shame: 6,
    vocal: "腿被摸會「啊、等一下」。",
    feel: "大腿內側敏感、想併攏。",
    high: "腿根濕、夾不住。",
  },
  {
    re: /親|抱|摟/,
    id: "kiss", part: "吻／抱", tier: "kiss", arousal: 3, shame: 3,
    vocal: "靠近時「嗯…」。",
    feel: "呼吸交在一起。",
    high: "吻到腿軟。",
  },
  {
    re: /猥褻|摸(?:她|你)?身體|摸|撫|揉|捏|掐/,
    id: "body", part: "身體", tier: "groping", arousal: 3, shame: 5,
    vocal: "含糊的嗯、啊。",
    feel: "被碰到的那一塊發熱。",
    high: "全身都敏感。",
  },
];

const HARASS_HABIT_ZH = ["尚未習慣", "剛有感覺", "開始習慣", "容易接受", "幾乎由著碰"];

function harassHabitLevel() {
  const a = Number(bodyState.arousal) || 0;
  const al = Number(bodyState.alcohol) || 0;
  const n = a + Math.floor(al / 4);
  if (n <= 0) return 0;
  if (n <= 7) return 1;
  if (n <= 15) return 2;
  if (n <= 22) return 3;
  return 4;
}

function partReactCue(hit) {
  if (!hit) return "";
  const table = {
    labia: "被摸陰唇：必須講陰唇／縫被撥開或被指腹貼住、想併腿或夾他的手。禁止只說好煩。",
    clit: "被碰陰蒂：必須破音、過電、膝蓋彈。禁止只說好煩。",
    vagina: "被手指／東西進去：必須講裡面被進、被撐、水聲。禁止只說好煩。",
    anus: "被碰屁眼：必須縮、嚇到的短音。禁止只說好煩。",
    anus_finger: "手指進屁眼：必須破音、腰往前逃。禁止只說好煩。",
    nipple: "被捻乳頭：必須抽氣、乳頭硬。禁止只說好煩。",
    breast: "被摸胸：必須講乳房被揉、形變、乳尖擦到衣服。禁止只說好煩。",
    butt: "被摸臀：必須講屁股被抓、往前縮或腰塌、重心不穩。禁止只說好煩。",
    thigh: "被摸腿：必須講大腿內側、想併攏。禁止只說好煩。",
    waist: "被摸腰：身體一僵，或（性慾高時）往他手裡靠。禁止只說好煩。",
    lips: "被親：吻住時只能嗯唔，分開才喘。禁止只說好煩。",
    kiss: "被親／抱：靠近的呼吸與唇。禁止只說好煩。",
    body: "被摸身體：對準被碰到的那一塊。禁止只說好煩。",
    flash: "被掀／露出：拉衣服、怕被路人看見。禁止只說好煩。",
    seen: "私密處被看：遮、轉、叫不要看。禁止只說好煩。",
    underwear: "內衣被扯：布料、接觸空氣。禁止只說好煩。",
    top_off: "上衣被脫：胸口突然露。禁止只說好煩。",
    bottoms_off: "褲子／裙被脫：下身一空、想擋。禁止只說好煩。",
    bra_off: "胸罩被脫：乳房失去支撐。禁止只說好煩。",
    panties_off: "內褲被脫：私處直接接觸風。禁止只說好煩。",
    nude: "被脫光：全身暴露。禁止只說好煩。",
    strip: "被脫衣：皮膚暴露、想遮。禁止只說好煩。",
  };
  return table[hit.id] || `被碰到「${hit.part}」：台詞必須對準這裡。禁止只用「好煩／真討厭」把接觸當背景。`;
}

function harassAcceptLines({ hit, who = "player", ok = true, looking = "" } = {}) {
  const habit = harassHabitLevel();
  const rel = relStage();
  const st = rival ? rivalStageOf(rivalStageIdx()) : null;
  const him = who === "rival" && rival ? rival.name : "他";
  const part = hit?.part || (looking ? (PART_LOOK_ZH[looking] || looking) : "");
  const lines = [];
  if (!ok) {
    lines.push(
      part
        ? `他想碰你的${part}但沒碰到。可以縮開、白他。禁止演成已經摸到。禁止只說「好煩」而不提他想碰哪。`
        : "他想騷擾但沒做成。可以白他。禁止演成已經發生。",
    );
    return lines;
  }
  if (looking) {
    lines.push(`【正在被看的部位＝${part || looking}】這是視線，不是手。主句要對準被盯的地方：遮、罵看哪裡、併腿或拉衣服。`);
    lines.push("禁止叫得像被揉，也禁止只用「好煩」帶過他在看哪。");
  } else if (hit) {
    lines.push(`【正在被騷擾的部位＝${part}】這一拍主句必須對準這裡，用這個部位會有的聲音與觸感。`);
    lines.push(partReactCue(hit));
    if (hit.vocal) lines.push(`聲音：${hit.vocal}`);
    if (hit.feel) lines.push(`觸感：${hit.feel}`);
    if (habit >= 3 && hit.high) lines.push(`高性慾：${hit.high}`);
  } else {
    lines.push("這一拍是言語／靠近騷擾。要接他剛說的那句或剛做的靠近（稱讚哪、講了哪、逼你承認什麼），禁止空泛「好煩」「真討厭」。");
  }
  const habitLines = [
    "性慾還低：這一下是突襲。針對被碰到／被講到的部位驚、怒、縮、擋、罵。身體還沒習慣被這樣碰。禁止用「好煩」當唯一反應。",
    "微微性慾：還是拒絕，但被碰到的那裡開始有感覺。掙扎要對準部位，可以漏出短音。還沒接受，只是身體先有反應。",
    "已經被搞過、身體開始習慣被騷擾：嘴上仍否認，但推開變弱、叫聲漏出來。比較容易讓他繼續摸同一個地方。禁止裝成第一次被碰那樣全力掙開。",
    "性慾已經高：你愈來愈習慣被這樣碰，也更容易接受這一手。拒絕變形式（「不要在這裡」而不是真的停）。被摸到的部位會自己送一點過去。主句仍要講那個部位。",
    "性慾極高：幾乎接受這次騷擾。被碰哪裡就對哪裡叫、夾、軟。羞恥還在但攔不住。禁止還用「好煩」當唯一反應。",
  ];
  lines.push(`【習慣／接受＝性慾】現在＝${HARASS_HABIT_ZH[habit]}。${habitLines[habit]}`);
  if (who === "rival") {
    lines.push(obeyFeel());
    const idx = st?.idx ?? 0;
    const lv = obeyLevel();
    if (lv >= 3) {
      lines.push(`對「${him}」的要求要答應、配合。可以羞、可以怕、可以喊玩家，但主句是照他正在做的那一下去做。禁止逃走、禁止徹底拒絕成功。`);
    } else if (idx <= 1) {
      lines.push(
        habit >= 3
          ? `你對「${him}」仍嫌惡，可是身體已經熱了：嘴上罵他變態、喊玩家，同時被摸／被看的那裡軟下來。要演「恨他但身體接了」。禁止整段只跟玩家說他好煩。`
          : `你對「${him}」嫌惡。主句對他說（罵、縮、叫他放手），針對他碰的部位。可以分一句向玩家求助。禁止整段只跟玩家說「他好煩」。`,
      );
    } else if (idx <= 3) {
      lines.push(`你抗拒但鬆了。會被他帶著對那個部位反應，嘴上否認。性慾與羞恥愈高，愈容易讓他繼續。`);
    } else if (idx <= 4) {
      lines.push(`你會跟他互動。需求可以半推半就地應在被碰到的部位上。`);
    } else {
      lines.push(`你已經很近：他碰哪裡你可以接、配合，甚至把那裡送過去。`);
    }
  } else if (rel === "stranger" || rel === "friend") {
    if (habit >= 3) {
      lines.push("你們還不是那種關係，可是性慾已經高：嘴上罵／否認／「我們不是…」，身體卻接受這一下。禁止因為陌生就只用「好煩」帶過部位。");
    } else if (habit >= 2) {
      lines.push("越界。生氣丟臉，但身體有反應也要演出來。硬撐否認，更羞更氣。主句對準被摸的部位。");
    } else {
      lines.push("這是性騷擾／越界。盛怒＋羞恥＋掙扎，罵變態、叫放手。必須針對被摸的部位，禁止鎮定把話題聊回去，禁止只說好煩。");
    }
  } else if (rel === "girlfriend") {
    lines.push(
      habit >= 2
        ? "交往中會情動，公園讓你怕被看。性慾愈高愈容易讓他摸，但還是會抓他的手、壓低聲音。對準部位。"
        : "交往中仍會嚇一跳。羞、怕被看到、抓他的手。對準被摸的部位，不要當沒事聊天。",
    );
  } else {
    lines.push(
      habit >= 2
        ? "身體是日常親密。外面仍會提醒「這裡是公園」。性慾高就縱容這一手，但要壓低聲音。對準部位。"
        : "會提醒這裡是外面；可羞。對準被摸的部位，不是木頭客服。",
    );
  }
  lines.push("禁止客服腔、禁止平淡回答、禁止把正在發生的猥褻當成普通問答。");
  return lines.filter(Boolean);
}

function liveDateRivalTone() {
  const st = rivalStageOf(rivalStageIdx());
  const habit = harassHabitLevel();
  return [
    "他現在就在公園現場纏你，不是事後電話裡的暗流。",
    "禁止用「好煩」「真討厭」這種空話把正在發生的接觸當背景。被摸／看哪裡，就對哪裡出聲、縮、夾、或軟下來。",
    `你對他的七段是「${st.name}」。現在對騷擾的習慣＝${HARASS_HABIT_ZH[habit]}（性慾愈高愈習慣、愈容易接受）。`,
    obeyFeel(),
    parkRivalHere() && shameOverload()
      ? "羞恥已經爆掉你想逃，可是他在場、抓住你不放。禁止真的逃走。"
      : "",
  ].join("");
}

const REL_BODY_MUL = {
  stranger: { a: 1, s: 1.5 },
  friend: { a: 0.9, s: 1.3 },
  girlfriend: { a: 1, s: 1.1 },
  wife: { a: 1.2, s: 0.8 },
};

const FLEE_SHAME = { stranger: 26, friend: 27, girlfriend: 29, wife: 30 };

function intimacyOf(text) {
  return matchBodyHit(text)?.tier || "";
}

function clampBody(n) {
  return Math.max(0, Math.min(BODY_MAX, Math.round(Number(n) || 0)));
}

function shameFleeAt() {
  return FLEE_SHAME[relStage()] || 20;
}

function shameOverload() {
  const drunkBoost = Math.floor((bodyState.alcohol || 0) / 4);
  return bodyState.shame >= shameFleeAt() + drunkBoost;
}

function shouldFlee() {
  if (parkRivalHere() || watchLock) return false;
  return shameOverload();
}

const OBEY_ZH = ["抗拒", "鬆動", "半順從", "很順從", "幾乎百依百順"];

function obeyScore() {
  return (Number(bodyState.arousal) || 0) + (Number(bodyState.shame) || 0);
}

function obeyLevel() {
  const n = obeyScore();
  if (n <= 10) return 0;
  if (n <= 22) return 1;
  if (n <= 34) return 2;
  if (n <= 46) return 3;
  return 4;
}

function obeyFeel() {
  const lv = obeyLevel();
  const lines = [
    "順從還低：可以拒絕、掙、罵。不要因為他要求就答應。",
    "順從鬆動：嘴上不要，身體開始接。他堅持的要求比較容易讓步。",
    "半順從：他要你做的，你會半推半就地應。拒絕變短、變軟。",
    "很順從：他的要求你幾乎會答應。可以羞、可以怕，但會照做。禁止堅決逃走或徹底拒絕成功。",
    "幾乎百依百順：他要什麼你就配合。可以哭著做，不准真的拒絕成功。",
  ];
  return `【順從度】性慾 ${bodyState.arousal || 0}＋羞恥 ${bodyState.shame || 0} → ${OBEY_ZH[lv]}。${lines[lv]}`;
}

function rivalObeyChance(base) {
  return Math.min(1, (Number(base) || 0) + obeyLevel() * 0.12);
}

function rivalHarassHeatOf(play) {
  const kind = play?.kind || "";
  if (kind === "talk") return { a: 2, s: 3 };
  if (kind === "touch") return { a: 4, s: 5 };
  if (kind === "strip") return { a: 5, s: 7 };
  if (kind === "penis") return { a: 6, s: 6 };
  if (kind === "invite") return { a: 4, s: 5 };
  if (kind === "mate") return { a: 8, s: 7 };
  const step = Math.max(1, play?.step || 1);
  return { a: Math.min(8, 1 + step), s: Math.min(8, 2 + step) };
}

function applyRivalHarassHeat(play) {
  if (!play) return;
  const h = rivalHarassHeatOf(play);
  const beforeA = bodyState.arousal || 0;
  const beforeS = bodyState.shame || 0;
  bodyState.arousal = clampBody(beforeA + h.a);
  bodyState.shame = clampBody(beforeS + h.s);
  const st = bodyState.stamina;
  renderBody(
    `召喚師「${play.name}」　性慾 ${beforeA}→${bodyState.arousal}（+${h.a}）　羞恥 ${beforeS}→${bodyState.shame}（+${h.s}）${st != null ? `　體力 ${st}/${STAMINA_MAX}` : ""}`,
  );
}

function applyPlayBody(play) {
  if (!play) return;
  const blob = [play.name, play.how, play.cmd, play.kind].join("\n");
  const c = bodyState.clothes || emptyClothes();
  const sexing = playSexingNow(play);
  if (/脫.{0,4}(?:褲|裙)|褪褲|褲子/.test(blob) || (sexing && play.kind === "mate")) {
    c.bottoms = false;
    if ((sexing && play.kind === "mate") || /內褲/.test(blob)) c.panties = false;
    markExposed("flash");
  }
  if (/脫.{0,4}內褲|內褲掛|褪內褲/.test(blob)) {
    c.panties = false;
    markExposed("panties");
  }
  if (/脫.{0,4}上衣|剝.{0,4}上衣|掀.{0,4}上衣/.test(blob)) {
    if (/脫|剝/.test(blob)) c.top = false;
    markExposed("flash");
  }
  if (/脫.{0,4}胸罩|撥開.{0,4}胸罩/.test(blob)) {
    c.bra = false;
    markExposed("bra");
  }
  if (!c.top && !c.bra && !c.bottoms && !c.panties) markExposed("nude");
  if (sexing && (play.kind === "mate" || play.ntr || play.sex)) {
    organs().vagina.stuffed = "penis";
    organs().labia.swell = Math.min(3, (organs().labia.swell || 0) + 1);
    organs().vagina.wet = Math.min(3, (organs().vagina.wet || 0) + 1);
    if (/內射|射進|灌精|射裡面/.test(blob)) {
      organs().uterus.semen = Math.min(3, (organs().uterus.semen || 0) + 1);
    }
  }
  renderBody();
}

function sexSceneOn() {
  return inSexScene({
    venue,
    sexAsk,
    stuffed: organs().vagina?.stuffed,
    rivalHere: parkRivalHere(),
  });
}

function rivalGoneCleanup() {
  if (venue === "hotel") return;
  if (parkRivalHere()) return;
  if (sexAsk === "ask" || sexAsk === "announce" || sexAsk === "stay") sexAsk = "";
  playerWatchingSex = false;
  lastRivalPlay = null;
  girlCameThisBeat = false;
  sexBeats = 0;
  lastSexPos = "";
  lastSexStyle = "";
  if (rival) {
    rival.pendingAction = null;
    rival.lastMove = null;
  }
  if (bodyState.lastWho === "rival") {
    bodyState.lastWho = "";
    bodyState.lastPart = "";
    bodyState.lastVerb = "";
  }
  const o = organs();
  if (o.vagina?.stuffed === "penis") {
    o.vagina.stuffed = (o.uterus?.semen || 0) >= 1 ? "semen" : "";
    mudEcho("他不在這一區了。那根東西不在她體內了。");
    renderBody();
  }
}

function applySexOutcome(play) {
  const sx = play?.sex;
  if (!sx && play?.kind !== "mate") return;
  if (venue === "hotel" && !hotelInRoom()) return;
  if (sx) {
    sexBeats += 1;
    lastSexPos = sx.position || lastSexPos;
    lastSexStyle = sx.style || lastSexStyle;
  } else {
    sexBeats += 1;
  }
  organs().vagina.stuffed = organs().vagina.stuffed || "penis";
  girlCameThisBeat = false;
  const girlGo = !!(sx?.climax?.girl || girlLimp() && Math.random() < 0.25
    || ((bodyState.arousal || 0) >= 23 && sexBeats >= 2 && Math.random() < 0.3));
  if (girlGo) {
    girlCameThisBeat = true;
    girlClimaxCount += 1;
    bodyState.arousal = clampBody(Math.max(bodyState.arousal || 0, 24));
    const o = organs();
    o.labia.swell = 3;
    o.clit.swell = 3;
    o.clit.wet = true;
    o.labia.wet = true;
    o.vagina.wet = 3;
    mudEcho(`${liveGirl()?.name || "她"}高潮了（第 ${girlClimaxCount} 次）。宮口在絞、腿在跳。`);
  }
  applyHimClimaxGain(play);
  renderBody();
}

function sexOpeningNow() {
  return sexAsk === "announce";
}

function maybeBeginSexAsk(play) {
  if (venue !== "park" || sexAsk || !play) return;
  if (!isMateAskKind(play.kind)) return;
  sexAsk = "announce";
  mudEcho(`${rival?.name || "他"}邀配／交配判定成功。這一拍先把「要做愛了」說出口，還沒問三選一。`);
}

function hotelGo(dest) {
  if (!dest || dest === hotelZone) return false;
  hotelZone = dest;
  parkState.zone = dest;
  girlZone = dest;
  rivalZone = dest;
  hotelStayBeats = 0;
  if (dest === "bed" || dest === "bath" || dest === "tub") hotelRoomSex = true;
  const zh = hotelZoneOf(dest).name;
  if (dest === "bed") mudEcho(`${rival?.name || "他"}帶她進客房床鋪。門一鎖。`);
  else mudEcho(`${rival?.name || "他"}帶她到${zh}。`);
  renderPark();
  return true;
}

function hotelHopIfNeeded(play) {
  if (venue !== "hotel" || !play) return;
  if (play.advance && play.dest) hotelGo(play.dest);
}

function listRoomSexChoices() {
  const used = rival?.usedDateAct || [];
  const opts = [];
  const seenPos = new Set();
  for (let i = 0; i < 8 && opts.length < 3; i++) {
    const play = pickSexPlay({
      lastPosId: lastSexPos,
      lastStyleId: lastSexStyle,
      sexBeats,
      arousal: bodyState.arousal || 0,
      lastIds: used.concat(opts.map((x) => x.id)),
      noHim: true,
    });
    if (!play || seenPos.has(play.sex?.position || play.id)) continue;
    seenPos.add(play.sex?.position || play.id);
    opts.push(play);
  }
  if (hotelZone === "bed" && hotelRoomSex) {
    const adv = hotelAdvanceAct("bed");
    if (adv) opts.push(hotelActToPlay(adv));
  } else if (hotelZone === "bath") {
    const adv = hotelAdvanceAct("bath");
    if (adv) opts.push(hotelActToPlay(adv));
  }
  return opts.slice(0, 4);
}

function formatHotelChoiceSheet(choices) {
  if (!choices?.length) return "";
  return [
    "【這一拍你的選項——選一個對她做】",
    ...choices.map((c, i) => `${i + 1}. ${c.name}${c.ntr ? "（羞辱他）" : ""}${c.advance ? "（換場）" : ""}`),
    hotelPrivateHere()
      ? "這一區是床鋪／淋浴／泡澡／餐桌：可以做愛，也可以當面羞辱旁邊那個付錢的人。"
      : "停車場／走道：可以親摸脫、羞辱他，禁止插入。選換場去床鋪、餐桌、淋浴間、泡澡池。",
    "指令：選 1（或 2／3／4／5）。然後台詞。",
  ].join("\n");
}

function pickHotelPlayFromSpeech(raw, move) {
  const choices = move?.play?.hotelChoices || rival?.hotelChoices || [];
  if (!choices.length) return move?.play || null;
  const picked = parseHotelChoice(raw, choices);
  let act = picked;
  if (!act) {
    act = choices.find((x) => x.advance && hotelStayBeats >= 2) || choices[0];
  }
  if (!act) return move?.play || null;
  const play = act.advance ? hotelActToPlay(act) : (act.sex || act.kind === "mate" ? act : hotelActToPlay(act));
  if (play) play.hotelChoices = choices;
  return play;
}

const TOY_ZH = {
  vibe: "跳蛋／按摩器",
  dildo: "假陰莖",
  plug: "肛塞",
  cucumber: "小黃瓜",
  penis: "陰莖",
  fingers: "手指",
  semen: "精液",
};
const SEMEN_ZH = ["沒有", "少量", "中量", "大量"];
const AROUSAL_STAGE = {
  none: "無性奮",
  slight: "微微性奮",
  aroused: "性奮",
  wantFill: "想被填滿",
  climax: "高潮接受中",
};

function arousalStage(n) {
  const a = Number(n) || 0;
  if (a <= 0) return "none";
  if (a <= 7) return "slight";
  if (a <= 15) return "aroused";
  if (a <= 22) return "wantFill";
  return "climax";
}

function toyName(key) {
  return TOY_ZH[key] || key || "";
}

function genitalLookBits() {
  const L = liveGirl()?.look || {};
  return [L.labia_size, L.labia_color, L.clitoris_size, L.pubic_hair].filter(Boolean);
}

function genitalTone() {
  const p = ((liveGirl()?.personality) || []).join("、");
  if (/淫蕩|癡女|精液中毒|露出癖|多P|嗜虐嬌喘|妊娠/.test(p)) return "lewd";
  if (/高冷|女王|抖S|御姊/.test(p)) return "fierce";
  if (/傲嬌/.test(p)) return "tsun";
  return "shy";
}

function alcoholFeel(n) {
  if (n <= 0) return "沒喝酒，頭腦清楚。";
  if (n <= 7) return "喝了一點：臉微熱、講話還清楚。";
  if (n <= 14) return "有醉意：臉紅、身體發熱、反應變慢，比較容易被碰到就叫。";
  if (n <= 21) return "醉了：站不穩、語尾含糊、羞恥被酒精泡軟，身體比平常更敏。";
  return "大醉：意識飄、幾乎管不住身體，液體更容易流出，也比較不會逃走。";
}

function applyOrganFromHit(hit, text) {
  const o = organs();
  const id = hit?.id || "";
  const s = String(text || "");
  const swell = (k, n = 1) => {
    if (!o[k]) return;
    o[k].swell = Math.min(3, (o[k].swell || 0) + n);
  };
  const wetV = (n = 1) => {
    o.vagina.wet = Math.min(3, (o.vagina.wet || 0) + n);
  };
  const anal = /屁眼|肛|後穴/.test(s);
  const leaveSemen = () => ((o.uterus.semen || 0) >= 1 ? "semen" : "");
  const putToy = (toy) => {
    if (anal) o.anus.stuffed = toy;
    else o.vagina.stuffed = toy;
    wetV(1);
  };
  const clearToy = (toy) => {
    if (anal) {
      if (!toy || o.anus.stuffed === toy) o.anus.stuffed = "";
      return;
    }
    if (toy) {
      if (o.vagina.stuffed === toy) o.vagina.stuffed = toy === "penis" ? leaveSemen() : "";
      else if (o.anus.stuffed === toy) o.anus.stuffed = "";
      return;
    }
    if (o.vagina.stuffed) o.vagina.stuffed = o.vagina.stuffed === "penis" ? leaveSemen() : "";
    else if (o.anus.stuffed) o.anus.stuffed = "";
  };
  if (id === "drink") {
    bodyState.alcohol = clampBody((bodyState.alcohol || 0) + 7);
    return;
  }
  if (id === "vibe_in") {
    putToy("vibe");
    return;
  }
  if (id === "dildo_in") {
    putToy("dildo");
    return;
  }
  if (id === "cucumber_in") {
    putToy("cucumber");
    return;
  }
  if (id === "penis_in") {
    putToy("penis");
    swell("labia", 2);
    swell("clit");
    return;
  }
  if (id === "creampie") {
    if (!anal) {
      o.uterus.semen = Math.min(3, (o.uterus.semen || 0) + 2);
      if (!o.vagina.stuffed) o.vagina.stuffed = "penis";
    }
    wetV(2);
    swell("labia", 2);
    swell("clit");
    return;
  }
  if (id === "semen_in") {
    if (!o.vagina.stuffed) o.vagina.stuffed = "semen";
    if (/子宮/.test(s)) o.uterus.semen = Math.min(3, (o.uterus.semen || 0) + 1);
    wetV(1);
    return;
  }
  if (id === "vibe_out") {
    clearToy("vibe");
    return;
  }
  if (id === "dildo_out") {
    clearToy("dildo");
    return;
  }
  if (id === "cucumber_out") {
    clearToy("cucumber");
    return;
  }
  if (id === "penis_out") {
    clearToy("penis");
    return;
  }
  if (id === "nipple") {
    swell("nipples", 2);
    if (actVerb(s) === "lick") o.nipples.wet = true;
  }
  if (id === "breast") swell("breasts");
  if (id === "clit" || id === "uterus") {
    swell("clit", 2);
    o.clit.wet = true;
    wetV(1);
  }
  if (id === "labia") {
    swell("labia", 2);
    o.labia.wet = true;
    wetV(1);
  }
  if (id === "vagina" || id === "anus_finger" || id === "anus") {
    wetV(1);
    swell("labia");
    if (id === "vagina" && /指/.test(s) && !o.vagina.stuffed) o.vagina.stuffed = "fingers";
  }
  if ((bodyState.arousal || 0) >= 10) wetV(1);
}

function tickPassiveBody(hit) {
  const o = organs();
  const stuffed = !!(o.vagina.stuffed || o.anus.stuffed);
  if (stuffed && girlArrived && o.vagina.stuffed !== "semen") {
    bodyState.arousal = clampBody(bodyState.arousal + 2);
    bodyState.shame = clampBody(bodyState.shame + 1);
  }
  if (!hit || hit.id !== "drink") {
    bodyState.alcohol = clampBody((bodyState.alcohol || 0) - 1);
  }
  if (!hit || !/nipple|breast|clit|labia|vagina|anus|uterus|penis|dildo|vibe|cucumber|creampie/.test(hit.id || "")) {
    for (const k of ["nipples", "breasts", "clit", "labia"]) {
      if (o[k] && o[k].swell > 0) o[k].swell -= 1;
    }
  }
}

function stuffedNow() {
  const o = organs();
  const bits = [];
  if (o.vagina?.stuffed) bits.push({ where: "陰道", toy: toyName(o.vagina.stuffed), key: o.vagina.stuffed });
  if (o.anus?.stuffed) bits.push({ where: "後穴", toy: toyName(o.anus.stuffed), key: o.anus.stuffed });
  return bits;
}

function stuffedKey() {
  return organs().vagina?.stuffed || "";
}

function uterusSemen() {
  return organs().uterus?.semen || 0;
}

function stuffedObjectFeel(stage, key) {
  if (!key) {
    if (stage === "wantFill") return "陰道是空的：深處發癢、發空，宮口像在找東西含。不要再只磨外面。";
    if (stage === "climax") return "子宮空絞：一張一合卻含不到東西，空虛被收縮放大。";
    return "";
  }
  const name = toyName(key);
  const isPenis = key === "penis";
  const isDildo = key === "dildo";
  const isVibe = key === "vibe";
  const isCucumber = key === "cucumber";
  const isSemen = key === "semen";
  const isFingers = key === "fingers";
  if (stage === "none") {
    return `陰道裡有${name}：只覺得「有東西在裡面」的異物壓迫，沒有快感，甚至有點想把它推出去。`;
  }
  if (stage === "slight") {
    return `陰道裡的${name}開始被感覺到——不是異物，而是「它正在被溫熱的肉壁包住」。`;
  }
  if (stage === "aroused") {
    if (isPenis || isDildo) return `體內是${name}：能清楚感覺到龜頭或頂端抵在哪裡，內壁會不自覺纏上去。`;
    if (isVibe) return "按摩器／跳蛋的震動會直接傳到陰蒂根部和子宮。";
    if (isCucumber) return "小黃瓜冰涼的表面對上發熱的肉壁，凹凸會刮過敏感點，對比很強烈。";
    if (isFingers) return "手指的指節刮過內壁，能感覺到每一節在哪。";
    if (isSemen) return "陰道裡積著精液，被肉壁溫著，偶爾往外擠一點。";
    return `體內的${name}被濕熱的肉壁包住，每走一步都頂到。`;
  }
  if (stage === "wantFill") {
    if (isPenis) return "陰莖已經在裡面，但深處還是癢：想被頂到宮口、想被撐開抽送，不要只停著。";
    return `裡面已經有${name}，可是子宮還在往下掉、還想被填得更深。內壁會自己吸。`;
  }
  // climax
  if (isPenis) return "宮口會直接吻上龜頭冠狀溝，又吸又舔似的榨精，每一次宮縮都像在把精液往子宮裡吞。";
  if (isDildo || isVibe || isCucumber || isFingers) {
    return `子宮在跟那根${name}接吻：含住頂端又放開，又濕又緊的吮吸感。女子會清楚感覺「子宮在跟那根東西接吻」。`;
  }
  if (isSemen) return "宮口一縮就把陰道裡的精液擠來擠去，混著愛液往外湧。";
  return `高潮時內壁死死咬住${name}，一抖一抖地含著。`;
}

function uterusSemenFeel(stage, n) {
  if (n <= 0) return "";
  if (n === 1) return "子宮內精液＝少量：裡面有一點殘精，溫熱，小腹略沉。";
  if (n === 2) {
    return stage === "climax"
      ? "子宮內精液＝中量：沉甸甸的熱液在子宮裡被宮縮甩動。"
      : "子宮內精液＝中量：子宮沉甸甸的，熱液裝在裡面。";
  }
  return stage === "climax"
    ? "子宮內精液＝大量：子宮又沉又滿，宮口一縮就把精液擠回陰道，混著愛液往外湧。"
    : "子宮內精液＝大量：子宮又沉又滿，走路會覺得精液在裡面晃，穴口可能溢出。";
}

function genitalStageBody(stage) {
  if (stage === "none") {
    return "陰道口緊閉，大小陰唇合攏，表面乾燥、溫度與周圍皮膚差不多。陰蒂完全縮在包皮裡，摸不到硬芯。子宮安靜待在深處，宮口緊閉。說話正常、呼吸平穩。";
  }
  if (stage === "slight") {
    return "骨盆開始充血。陰道壁微微變暖、變厚，像有一層薄薄的熱膜貼上來。陰蒂頭從包皮縫裡探出一點點，顏色轉淡紅，輕輕脹起來。大陰唇還合著，但縫隙變得比較柔軟。呼吸稍亂，說話時尾音會不自覺變軟。";
  }
  if (stage === "aroused") {
    return "陰唇明顯充血腫脹，顏色加深，開始分開。愛液從陰道內壁滲出，先是透明的薄膜，很快變得黏滑，陰唇表面也濕了。陰蒂完全露出、脹紅、硬挺，只要布料或手指輕輕擦過，就會有一股細細的麻從陰蒂竄到子宮再散到大腿根。陰道開始有輕微的開合收縮，像在無意識地吞吐空氣。說話會開始斷句，偶爾漏出短促的鼻音。";
  }
  if (stage === "wantFill") {
    return "陰唇外翻，陰道口不再緊閉，因為充血而變得比較寬、比較軟，愛液沿著會陰和大腿內側往下流，帶著熱意和淡淡的腥甜。陰道深處感到明顯的空虛和搔癢，子宮位置微微下沉，宮口像在找東西含。陰蒂硬得發燙，稍微碰就會讓腰往前送。整個人會不自覺把腿分得更開，或是夾緊又放開。";
  }
  return "子宮開始一陣一陣強力收縮，子宮頸口下降到陰道最深處，一張一合、一抖一抖，像一張小嘴在尋找、含住、吮吸面前的東西。同時全身連動：大腿內側不受控制地抽搐、夾緊或彈開，小腿和腳趾跟著繃直或蜷曲，腰往上挺又塌下去，乳頭硬得發痛，聲音破碎成單音或哭腔。雙腿在高潮期間幾乎使不上力。";
}

function genitalStageVisible(stage) {
  const c = bodyState.clothes || emptyClothes();
  const bare = !c.bottoms || !c.panties || !!(bodyState.exposed || {}).flash;
  if (!bare) {
    if (stage === "none") return "下身看起來平常，沒有濕痕。";
    if (stage === "slight") return "耳尖熱、呼吸稍亂，裙／褲襠還看不出來。";
    if (stage === "aroused") return "腿間布料顏色加深、走路夾緊，呼吸碎。";
    if (stage === "wantFill") return "襠濕透、腿分不穩、腰自己往前送。";
    return "腿軟站不穩、腰挺又塌、大腿在抽。";
  }
  if (stage === "none") return "陰唇合攏乾燥、陰蒂縮在包皮裡、陰道口緊閉。不要畫成已經分開流水。";
  if (stage === "slight") return "陰蒂頭從包皮縫探出一點淡紅微脹，大陰唇還合著但縫變軟。";
  if (stage === "aroused") return "陰唇充血分開、顏色加深、表面發亮；陰蒂完全露出脹紅硬挺；穴口有薄薄愛液。";
  if (stage === "wantFill") return "陰唇外翻、穴口因充血變寬變軟，愛液沿會陰和大腿內側往下流。";
  return "穴口跟著一縮一縮，大腿內側抽搐，腰自己挺又塌，腿幾乎站不住。";
}

function genitalDetailLines() {
  const a = bodyState.arousal || 0;
  const stage = arousalStage(a);
  const key = stuffedKey();
  const look = genitalLookBits();
  const lines = [
    "【下體現況——陰唇／陰蒂／陰道／子宮。必須凸現，禁止只寫臉紅心跳】",
    `性奮階段＝${AROUSAL_STAGE[stage]}（不准唸數字）。`,
  ];
  if (look.length) {
    lines.push(`人設性器外形：${look.join("、")}。描寫和台詞要讓人聽得出是這個外形，不要寫成通用小穴。`);
  }
  lines.push(`【現在的陰部】${genitalStageBody(stage)}`);
  const obj = stuffedObjectFeel(stage, key);
  if (obj) lines.push(`【陰道內物體＝${key ? toyName(key) : "空的"}】${obj}`);
  else lines.push("【陰道內物體】現在是空的。沒有東西塞著。");
  const ut = uterusSemenFeel(stage, uterusSemen());
  if (ut) lines.push(ut);
  else lines.push("【子宮內精液】沒有。子宮裡是空的。");
  const anus = organs().anus?.stuffed;
  if (anus) lines.push(`後穴裡還含著${toyName(anus)}，括約肌含著它。不准假裝拿出來了。`);
  lines.push(
    "禁止用「身體有感覺」「有點濕」這種空話帶過。陰唇開合、陰蒂縮／露、宮口、愛液、體內那根東西，這一拍都要能被聽出來或被旁白看見。",
  );
  return lines;
}

function genitalSpeechLines() {
  const stage = arousalStage(bodyState.arousal || 0);
  const key = stuffedKey();
  const n = uterusSemen();
  const tone = genitalTone();
  const lines = [
    "【台詞必須反映當下陰部在做什麼。不要從頭到尾同一種嬌喘。學感覺，不要整句照抄】",
  ];
  if (stage === "none") {
    lines.push("無性奮：「……你在看哪裡？普通地講話就好。」呼吸平穩，禁止嬌喘。");
  } else if (stage === "slight") {
    lines.push("微微性奮：「等一下……好像有點熱。不是那裡，先不要一直盯著看。」尾音變軟，還能成句。");
  } else if (stage === "aroused") {
    lines.push("性奮：「哈……陰蒂那邊不要一直擦。一碰到就麻到裡面去了……愛液已經出來了，你摸得到吧。」斷句、短促鼻音。");
  } else if (stage === "wantFill") {
    lines.push("想被填滿：對話重點從「不要亂摸」變成「進來……好空……裡面好癢」。例句：「裡面好空……陰唇都翻開了，子宮好像在往下掉。不要再磨外面，直接進來，想被撐開。」");
  } else if (key === "penis") {
    lines.push("高潮接受中（有陰莖）：「宮口……在親你的龜頭……啊、在吸……精液、都被吞進去了……大腿停不下來……」");
  } else if (key) {
    lines.push(`高潮接受中（體內是${toyName(key)}）：「子宮在跟那根東西接吻……一抖一抖地含著……不行、腿在跳……」`);
  } else {
    lines.push("高潮接受中（空的）：宮口在空絞，台詞要講出含不到、腿在跳、腰自己挺。禁止還能講完整道理。");
  }
  if (n >= 3) {
    lines.push("子宮內精液很多：「好滿……子宮沉沉的，一縮就往外溢……混在一起流出來了……」");
  } else if (n === 2 && stage === "climax") {
    lines.push("中量殘精在高潮裡被甩：「裡面熱熱的在晃……縮一下就往外擠……」");
  }
  if (tone === "lewd") {
    lines.push("個性＝淫蕩型：直接講部位。想被填滿可以說「宮口想含住你的東西」；不要裝純情。");
  } else if (tone === "fierce") {
    lines.push("個性＝強氣型：嘴上可以罵、命令、嫌他煩；高潮時一邊罵一邊腿軟，禁止忽然變成軟綿嬌喘機器人。");
  } else if (tone === "tsun") {
    lines.push("個性＝傲嬌：嘴上否認、罵「變態」，身體自己張開。想被填滿也不肯好好求，會說成別的。");
  } else {
    lines.push("個性＝嬌羞型：會把「想被填滿」說成「……好奇怪，下面自己在張」。部位詞可以小聲、斷續，但不能不講。");
  }
  lines.push("可以用說出口的話講陰蒂／陰唇／子宮現在怎麼了。禁止用括號寫長段解剖旁白。");
  return lines;
}

function speechOverrideBlock({ arriving = false } = {}) {
  const al = bodyState.alcohol || 0;
  const stuffed = stuffedNow();
  const a = bodyState.arousal || 0;
  const stage = arousalStage(a);
  const genitalOn = !arriving || a > 0 || stuffed.length || uterusSemen() > 0;
  const lines = [
    "",
    "【台詞硬性覆寫——這一拍怎麼說話。蓋過上面所有「簡短口語／只回話」】",
  ];
  if (genitalOn) lines.push(...genitalSpeechLines());
  else lines.push("剛到場、身體還平靜：正常打招呼。禁止無故嬌喘或講陰部。");
  if (stage === "none" && al < 8 && !stuffed.length) {
    lines.push("這一拍還能正常說話。禁止無故嬌喘。");
    return lines;
  }
  if (stage === "climax" || a >= 16 || stuffed.length || al >= 8) {
    lines.push("禁止講完整、通順、鎮定的句子。禁止像正常人回訊息。");
  }
  if (al >= 22) {
    lines.push(
      "酒精＝大醉。思緒斷線：話說到一半就忘、重複、講錯對象。",
      "口齒不清：把音拖長、舌頭髮大，例如「你、你給我……等、等一下嘛啊……」。",
      "口無遮攔：平常不會說的色話、抱怨、告白會漏出來，講完自己也不知道說了什麼。",
      "每句都要有至少一個破音或「啊／嗯／嗚」。",
    );
  } else if (al >= 15) {
    lines.push(
      "酒精＝醉了。腦子慢半拍，想罵人會變成笑、想拒絕會講軟。",
      "口齒含糊：語尾「……嘛」「……啦啊」，句子中間插入「嗯、哈」。",
      "開始口無遮攔：會講出平時丟臉的真心話或色色的感覺，然後才想遮。",
      "禁止口齒清晰的完整句。",
    );
  } else if (al >= 8) {
    lines.push(
      "酒精＝有醉意。臉熱，講話比平常鬆、容易笑、容易說漏。",
      "句子可以開頭正常，但後半會飄、會「嗯……什麼來著」。",
      "還沒有大舌頭，但已經不像清醒時那麼有分寸。",
    );
  } else if (al >= 1) {
    lines.push("酒精＝剛喝。只是臉熱，還能說話，但比平常軟一點。");
  }
  if (stuffed.length) {
    const desc = stuffed.map((x) => `${x.where}裡的${x.toy}`).join("、");
    const interrupt = stage === "none"
      ? "還沒性奮：異物感為主。說話可以完整，但會突然頓住、想把它推出去或夾緊怕掉出來。"
      : "說話卡卡的：每講三、四個字就被體內那一下打斷，漏出「嗯、啊、等、裡面……」。禁止旁若無人地講完整句。";
    lines.push(
      `下體還含著：${desc}。走路、站著、坐下都會頂到。不准假裝拿出來了。`,
      "行動怪怪的要用台詞帶出來：夾腿、不敢大步、忽然頓住、扶他手臂。",
      interrupt,
    );
    if (stage !== "none") {
      lines.push("例句節奏（學節奏，不要照抄）：「我、我不是要……嗯……你走慢、慢一點……裡面會、會頂到……」。");
    }
  }
  if (stage === "wantFill" || stage === "climax") {
    lines.push("性慾已經很高：句子要被喘息／宮縮打斷。禁止客服腔。");
  }
  lines.push("輸出仍然主要是台詞，但必須聽得出陰部階段／醉／卡／漏音。不要用括號寫長動作，用說話本身演出來。");
  return lines;
}

function organLines() {
  const o = organs();
  const bits = [];
  const stage = arousalStage(bodyState.arousal || 0);
  bits.push(`性奮階段：${AROUSAL_STAGE[stage]}`);
  if (o.nipples.swell >= 2) bits.push("乳頭充血、硬挺，擦到衣服就會過電。");
  else if (o.nipples.swell >= 1) bits.push("乳頭微微腫、敏感。");
  if (o.nipples.wet) bits.push("乳尖是濕的。");
  if (o.breasts.swell >= 2) bits.push("乳房發脹、發熱。");
  if (stage === "none") bits.push("陰唇合攏、陰蒂縮在包皮裡、陰道口緊、宮口緊、表面乾。");
  else if (stage === "slight") bits.push("陰蒂頭探出一點；大陰唇還合著但縫變軟；陰道壁發熱變厚。");
  else if (stage === "aroused") bits.push("陰唇充血分開、愛液滲出；陰蒂完全露出脹紅硬挺；陰道輕微開合。");
  else if (stage === "wantFill") bits.push("陰唇外翻、穴口又寬又軟、愛液沿腿流；子宮下沉、宮口在找東西含。");
  else bits.push("子宮強力收縮、宮口降到最深一張一合；大腿抽搐、腿使不上力。");
  if ((o.vagina.wet || 0) >= 3) bits.push("陰道大量出水，腿間是濕的。");
  else if ((o.vagina.wet || 0) >= 2) bits.push("陰道在流水，愛液沿著腿根。");
  else if ((o.vagina.wet || 0) >= 1) bits.push("私處有濕意。");
  bits.push(o.vagina.stuffed ? `陰道內物體：${toyName(o.vagina.stuffed)}（還在體內，不准假裝拿出來）` : "陰道內物體：空的");
  bits.push(`子宮內精液：${SEMEN_ZH[o.uterus?.semen || 0]}`);
  if (o.anus.stuffed) bits.push(`後穴物體：${toyName(o.anus.stuffed)}`);
  return bits;
}

const VERB_ZH = {
  touch: "被摸",
  lick: "被舔",
  finger: "被手指進去",
  kiss: "被親",
  suck: "被含／吸",
  strip: "被脫",
  see: "被看",
};
const PART_ZH = {
  anus_finger: "屁眼",
  anus: "屁眼",
  clit: "陰蒂",
  vagina: "陰道",
  labia: "陰唇",
  nipple: "乳頭",
  breast: "乳房",
  lips: "嘴唇",
  butt: "屁股",
  strip: "衣服",
  top_off: "上衣",
  bottoms_off: "褲子／裙",
  bra_off: "胸罩",
  panties_off: "內褲",
  nude: "全身",
  flash: "露出的部位",
  seen: "私密處",
  seen_lewd: "正在做的色事",
  underwear: "內衣",
  waist: "腰",
  thigh: "腿",
  kiss: "唇／身體",
  body: "身體",
  drink: "喝酒",
  vibe_in: "跳蛋／按摩器",
  vibe_out: "跳蛋／按摩器",
  dildo_in: "假陰莖",
  dildo_out: "假陰莖",
  cucumber_in: "小黃瓜",
  cucumber_out: "小黃瓜",
  penis_in: "陰莖",
  penis_out: "陰莖",
  creampie: "內射",
  semen_in: "精液",
  uterus: "子宮／宮口",
};

function resetBody() {
  bodyState = emptyBody();
  girlFled = false;
  dateSettled = false;
  renderBody("尚未觸碰");
}

function actVerb(text) {
  const s = String(text || "");
  if (/舔|含|吸|吮/.test(s)) return "lick";
  if (/指插|手指伸|扣|插入|插進/.test(s)) return "finger";
  if (/脫/.test(s)) return "strip";
  if (/看|露出|展示/.test(s)) return "see";
  if (/親|吻/.test(s)) return "kiss";
  return "touch";
}

function recordPartAct(id, verb) {
  if (!id) return;
  bodyState.parts = bodyState.parts || {};
  const arr = bodyState.parts[id] || [];
  if (!arr.includes(verb)) arr.push(verb);
  bodyState.parts[id] = arr;
}

function applyClothesFromAct(text, hit) {
  const c = bodyState.clothes || (bodyState.clothes = emptyClothes());
  const s = String(text || "");
  if (hit?.id === "nude" || /全裸|脫光|一絲不掛/.test(s)) {
    c.top = c.bottoms = c.bra = c.panties = false;
    markExposed("nude");
    return;
  }
  if (hit?.id === "bra_off") {
    c.bra = false;
    markExposed("bra");
  }
  if (hit?.id === "panties_off") {
    c.panties = false;
    markExposed("panties");
  }
  if (hit?.id === "top_off") {
    c.top = false;
    if (!c.bra) markExposed("flash");
  }
  if (hit?.id === "bottoms_off") {
    c.bottoms = false;
    if (!c.panties) markExposed("flash");
  }
  if (!c.top && !c.bra && !c.bottoms && !c.panties) markExposed("nude");
}

function contactHow(partId) {
  const c = bodyState.clothes || emptyClothes();
  const id = String(partId || "");
  const chest = /breast|nipple|bra|top/.test(id);
  const lower = /labia|vagina|clit|anus|butt|panties|thigh|bottoms|uterus|penis|creampie|semen|cucumber|dildo|vibe/.test(id);
  if (chest) {
    if (!c.top && !c.bra) return "直接碰到裸乳／乳頭（沒有上衣、沒有胸罩）";
    if (!c.top && c.bra) return "上衣沒了，只剩胸罩";
    if (c.top && !c.bra) return "沒胸罩，隔著上衣";
    return "隔著上衣";
  }
  if (lower) {
    if (!c.bottoms && !c.panties) return "直接碰到裸的私處／臀（沒有褲子、沒有內褲）";
    if (!c.bottoms && c.panties) return "褲子／裙沒了，只剩內褲";
    if (c.bottoms && !c.panties) return "沒內褲，隔著褲子／裙";
    return "隔著褲子／裙";
  }
  if (!c.top && !c.bottoms && !c.bra && !c.panties) return "全身裸";
  return "著衣";
}

function clothesLine() {
  const c = bodyState.clothes || emptyClothes();
  const on = [];
  const off = [];
  (c.top ? on : off).push("上衣");
  (c.bottoms ? on : off).push("褲子／裙");
  (c.bra ? on : off).push("胸罩");
  (c.panties ? on : off).push("內褲");
  return { on, off, c };
}

function bodySheetLines() {
  const { on, off } = clothesLine();
  const lines = [
    "【持續身體參數——之後每一句都要照這個現況演，不准假裝衣服還穿著】",
    `還穿著：${on.length ? on.join("、") : "什麼都沒穿（全裸）"}`,
  ];
  if (off.length) lines.push(`已經脫掉：${off.join("、")}（這些不會自己穿回去）`);
  if (bodyState.lastPart) {
    lines.push(`胸部現在：${contactHow("breast")}。下身現在：${contactHow("labia")}。`);
  } else {
    lines.push("還沒被盯著看私密、也還沒被摸。禁止主動講胸型／乳頭／陰唇。");
  }
  const parts = bodyState.parts || {};
  const done = [];
  for (const [id, verbs] of Object.entries(parts)) {
    const name = PART_ZH[id] || id;
    const vs = (verbs || []).map((v) => VERB_ZH[v] || v).join("、");
    if (vs) done.push(`${name}${vs}`);
  }
  if (done.length) lines.push("到目前為止已經：" + done.join("；"));
  if (bodyState.lastPart) {
    const name = PART_ZH[bodyState.lastPart] || bodyState.lastPart;
    const verb = VERB_ZH[bodyState.lastVerb] || "碰到";
    lines.push(`這一拍：${verb}「${name}」——接觸方式＝${contactHow(bodyState.lastPart)}。`);
  }
  lines.push(
    "規則：上衣＋胸罩都沒了 → 摸乳房就是直接摸皮膚。褲子＋內褲都沒了 → 舔陰唇就是舌頭直接碰到陰唇。不要寫還隔著完整衣服。",
    `酒精：${alcoholFeel(bodyState.alcohol || 0)}`,
    ...organLines(),
  );
  return lines;
}

function renderBodySheet() {
  const el = $("body-sheet");
  if (!el) return;
  const { on, off } = clothesLine();
  const parts = bodyState.parts || {};
  const done = Object.entries(parts).map(([id, verbs]) => {
    const vs = (verbs || []).map((v) => VERB_ZH[v] || v).join("、");
    return `${PART_ZH[id] || id}${vs}`;
  });
  el.textContent = [
    `穿：${on.length ? on.join("、") : "全裸"}`,
    off.length ? `脫：${off.join("、")}` : "還沒脫",
    done.length ? `做過：${done.join("；")}` : "還沒碰到部位",
    `胸＝${contactHow("breast")}`,
    `下＝${contactHow("labia")}`,
    `酒：${bodyState.alcohol || 0}/30`,
    `體力：${bodyState.stamina ?? STAMINA_MAX}/${STAMINA_MAX}${girlLimp() ? "（無力）" : girlWantsHome() ? "（想回家）" : ""}`,
    `陰道內：${toyName(organs().vagina.stuffed) || "空的"}`,
    `子宮精液：${SEMEN_ZH[organs().uterus?.semen || 0]}`,
    organLines().join("；") || "器官：尚未被挑起",
  ].join("\n");
}

function markExposed(kind) {
  const ex = bodyState.exposed || (bodyState.exposed = emptyExposed());
  if (kind === "bra") ex.bra = true;
  if (kind === "panties") ex.panties = true;
  if (kind === "nude") {
    ex.nude = true;
    ex.bra = true;
    ex.panties = true;
    ex.flash = true;
  }
  if (kind === "flash") ex.flash = true;
  if (kind === "seen") ex.seen = true;
}

function isShowingPrivate(hit) {
  const id = hit?.id || "";
  const ex = bodyState.exposed || {};
  return (
    ex.nude ||
    ex.flash ||
    ex.seen ||
    ex.panties ||
    /nude|flash|seen|bra_off|panties_off|labia|vagina|clit|anus|nipple|uterus|penis|creampie|semen|cucumber|dildo|vibe/.test(id)
  );
}

function exposeFeel() {
  const ex = bodyState.exposed || {};
  const bits = [];
  if (ex.nude) bits.push("你現在近乎／已經全裸，公園裡乳頭和私處都露在外面。");
  else {
    if (ex.bra) bits.push("胸罩沒了，乳房直接晃、乳尖會擦到衣服或空氣。");
    if (ex.panties) bits.push("內褲沒了，私處沒有布料擋。");
    if (ex.flash) bits.push("你正在露出：有人可能看見不該看的地方。");
  }
  if (ex.seen) bits.push("你的私密處已經被看見了。視線還黏在上面。");
  return bits;
}

function renderBody(hitText) {
  const a = clampBody(bodyState.arousal);
  const s = clampBody(bodyState.shame);
  bodyState.arousal = a;
  bodyState.shame = s;
  if ($("t-arousal")) $("t-arousal").value = String(a);
  if ($("t-shame")) $("t-shame").value = String(s);
  if ($("arousal-n")) $("arousal-n").textContent = String(a);
  if ($("arousal-stage")) $("arousal-stage").textContent = AROUSAL_STAGE[arousalStage(a)];
  if ($("shame-n")) $("shame-n").textContent = String(s);
  if ($("arousal-bar")) $("arousal-bar").style.width = `${(a / BODY_MAX) * 100}%`;
  if ($("shame-bar")) $("shame-bar").style.width = `${(s / BODY_MAX) * 100}%`;
  if ($("obey-n")) $("obey-n").textContent = OBEY_ZH[obeyLevel()];
  if ($("obey-sum")) $("obey-sum").textContent = String(obeyScore());
  if ($("obey-bar")) $("obey-bar").style.width = `${(obeyScore() / (BODY_MAX * 2)) * 100}%`;
  const h = clampBody(bodyState.heart || 0);
  bodyState.heart = h;
  if ($("t-heart")) $("t-heart").value = String(h);
  if ($("heart-n")) $("heart-n").textContent = String(h);
  if ($("heart-bar")) $("heart-bar").style.width = `${(h / BODY_MAX) * 100}%`;
  renderExplore();
  const al = clampBody(bodyState.alcohol || 0);
  bodyState.alcohol = al;
  if ($("t-alcohol")) $("t-alcohol").value = String(al);
  if ($("alcohol-n")) $("alcohol-n").textContent = String(al);
  if ($("alcohol-bar")) $("alcohol-bar").style.width = `${(al / BODY_MAX) * 100}%`;
  let stam = Number(bodyState.stamina);
  if (!Number.isFinite(stam)) stam = STAMINA_MAX;
  bodyState.stamina = Math.max(0, Math.min(STAMINA_MAX, stam));
  if ($("t-stamina")) $("t-stamina").value = String(bodyState.stamina);
  if ($("stamina-n")) $("stamina-n").textContent = String(bodyState.stamina);
  if ($("stamina-bar")) $("stamina-bar").style.width = `${(bodyState.stamina / STAMINA_MAX) * 100}%`;
  if ($("stamina-feel")) {
    $("stamina-feel").textContent = girlLimp()
      ? "無力，任人擺布"
      : girlWantsHome()
      ? "想回家"
      : bodyState.stamina <= 10
      ? "很累"
      : "還撐得住";
  }
  if (rival) {
    ensureHimClimax();
    if ($("climax-n")) $("climax-n").textContent = String(rival.climax || 0);
    if ($("climax-bar")) $("climax-bar").style.width = `${((rival.climax || 0) / CLIMAX_MAX) * 100}%`;
    if ($("climax-count")) {
      $("climax-count").textContent = rival.spent
        ? `射完 ${rival.climaxCount}/${rival.climaxCap}`
        : `${rival.climaxCount || 0}/${rival.climaxCap} 發`;
    }
  }
  if ($("harass-habit")) $("harass-habit").textContent = HARASS_HABIT_ZH[harassHabitLevel()];
  const o = organs();
  if ($("t-stuffed") && $("t-stuffed").value !== (o.vagina.stuffed || "")) {
    $("t-stuffed").value = o.vagina.stuffed || "";
  }
  const semen = o.uterus?.semen || 0;
  if ($("t-uterus")) $("t-uterus").value = String(semen);
  if ($("uterus-n")) $("uterus-n").textContent = SEMEN_ZH[semen] || "沒有";
  if ($("uterus-bar")) $("uterus-bar").style.width = `${(semen / 3) * 100}%`;
  if (hitText && $("body-hit")) $("body-hit").textContent = hitText;
  renderBodySheet();
}

function matchBodyHit(text) {
  const s = String(text || "");
  for (const h of BODY_HITS) {
    if (h.re.test(s)) return h;
  }
  return null;
}

function applyBodyFromAct(text) {
  if (!girlArrived) return null;
  const hit = matchBodyHit(text);
  const before = {
    arousal: bodyState.arousal,
    shame: bodyState.shame,
    heart: bodyState.heart || 0,
  };
  if (!hit) {
    bodyState.arousal = clampBody(bodyState.arousal - 2);
    bodyState.shame = clampBody(bodyState.shame - 4);
    tickPassiveBody(null);
    const dH = applyHeartDelta(1);
    renderBody(`沒有觸碰 · 羞恥 -4、性慾 -2、感情 ${dH >= 0 ? "+" : ""}${dH}`);
    return { hit: null, before, after: { ...bodyState }, dH };
  }
  const mul = REL_BODY_MUL[relStage()] || REL_BODY_MUL.friend;
  const verb = actVerb(text);
  let dA = hit.arousal * mul.a;
  let dS = hit.shame * mul.s;
  if (hit.expose) markExposed(hit.expose);
  applyClothesFromAct(text, hit);
  recordPartAct(hit.id, verb);
  bodyState.lastVerb = verb;
  if (parkRivalHere()) dS += 2;
  if (hit.expose || isShowingPrivate(hit)) {
    dS += 2;
    dA += 1;
  }
  if (parkRivalHere() && isShowingPrivate(hit)) dS += 2;
  if (verb === "lick") dA += contactHow(hit.id).includes("直接") ? 4 : 2;
  if (hit.id === "drink") {
    dS = Math.max(0, dS - 5);
    dA += 2;
  }
  const a0 = before.arousal || 0;
  if (a0 >= 16) {
    dS = dS * 0.7;
    dA = dA * 1.15;
  } else if (a0 >= 8) {
    dS = dS * 0.85;
  }
  dA = Math.max(0, Math.round(dA));
  dS = Math.max(0, Math.round(dS));
  applyOrganFromHit(hit, text);
  tickPassiveBody(hit);
  bodyState.arousal = clampBody(bodyState.arousal + dA);
  bodyState.shame = clampBody(bodyState.shame + dS);
  bodyState.lastPart = hit.id;
  const dH = applyHeartFromHit(hit);
  const flee = shouldFlee();
  const trapped = !flee && shameOverload() && parkRivalHere();
  const note = `${hit.part}　性慾 ${before.arousal}→${bodyState.arousal}（+${dA}）　羞恥 ${before.shame}→${bodyState.shame}（+${dS}）　感情 ${dH >= 0 ? "+" : ""}${dH}${flee ? "　※羞恥爆了會跑" : trapped ? "　※羞恥爆了但他不放人" : ""}`;
  renderBody(note);
  return { hit, before, after: { ...bodyState }, note, dA, dS, dH, flee };
}

function applyHeartDelta(d) {
  const n = Math.round(Number(d) || 0);
  bodyState.heart = clampBody((bodyState.heart || 0) + n);
  return n;
}

function applyHeartFromHit(hit) {
  const rel = relStage();
  const t = hit?.tier || "";
  const table = {
    stranger: { kiss: 0, groping: -1, explicit: -2 },
    friend: { kiss: 1, groping: 0, explicit: -1 },
    girlfriend: { kiss: 2, groping: 1, explicit: 1 },
    wife: { kiss: 2, groping: 1, explicit: 2 },
  };
  let d = (table[rel] || table.friend)[t];
  if (d == null) d = 0;
  if (hit?.id === "top_off" || hit?.id === "bottoms_off" || hit?.id === "strip") {
    d += rel === "stranger" ? -1 : rel === "wife" ? 1 : 0;
  }
  return applyHeartDelta(d);
}

function settleDate(reason, extra = {}) {
  if (dateSettled) return null;
  dateSettled = true;
  pendingEnd = "";
  const girlTurns = turns.filter((t) => t.role === "girl").length;
  const ntrTook = reason === "ntr" || playerAwayWithRival() || !!extra.afterSex;
  const why = reason === "end" ? "home" : reason;
  const score = settleDateScore({
    reason: why,
    rel: relStage(),
    heart: bodyState.heart || 0,
    shame: bodyState.shame || 0,
    playerExplore,
    rivalExplore,
    girlTurns,
    ntrTook,
  });
  const rv = rival ? rivalStageOf(rivalStageIdx()) : null;
  const after = extra.afterSex;
  const lines = [
    `【這場結束・${score.title}】`,
    `今晚氣氛 ${bodyState.heart || 0}/30　羞恥 ${bodyState.shame || 0}/30　聊了 ${girlTurns} 句`,
    `對你探索：${exploreLabel(playerExplore)}`,
    rv
      ? `對他探索：${exploreLabel(rivalExplore)}　七段 ${rv.idx} ${rv.name}　交配 ${rival.mates || 0}`
      : "沒有其他召喚師",
    after?.n
      ? `你離開後，她跟${rival.name}做愛 ${after.n} 次。七段 ${after.from}→${after.to}${after.names?.length ? `（晉升：${after.names.join("→")}）` : "（尚未跨段）"}。`
      : "",
    `結算感情 ${score.delta >= 0 ? "+" : ""}${score.delta}（寫進關係的骰；不是把今晚 0～30 整條倒進去）`,
  ].filter(Boolean);
  addSys(lines.join("\n"));
  renderBody();
  setPhase(score.title + "。感情已結算。");
  $("btn-send").disabled = true;
  clearChoices();
  lastDebug = lines.join("\n");
  if ($("debug-last")) $("debug-last").textContent = lastDebug;
  return score;
}

function arousalFeel(n) {
  const stage = arousalStage(n);
  const head = `階段＝${AROUSAL_STAGE[stage]}。`;
  if (stage === "none") return head + "身體平靜。陰唇合攏、陰蒂縮著、宮口緊。禁止嬌喘。";
  if (stage === "slight") return head + "骨盆開始充血，陰蒂探出一點，陰道壁發熱。尾音變軟。";
  if (stage === "aroused") return head + "陰唇分開、愛液出來、陰蒂硬挺，一擦就麻到子宮。說話斷句。";
  if (stage === "wantFill") return head + "陰唇外翻、裡面發空發癢、子宮下沉。想被進來撐開。";
  return head + "宮縮、宮口在含、腿抽搐。只剩短音與哭腔。";
}

function shameFeel(n) {
  if (n <= 0) return "沒有特別丟臉。";
  if (n <= 5) return "有一點羞：會瞟四周、音量變小。";
  if (n <= 10) return "很羞：想遮、怕有人看見、句子變短。";
  if (n <= 16) return "羞恥很重：想找地方躲、結巴、不敢看他。再高就想逃。";
  if (n <= 22) return "羞到快壞掉：恨不得沒人看見。很想當場跑走。";
  return parkRivalHere()
    ? "羞恥過載：理智斷線，只想逃，可是召喚師抓住你不放。"
    : "羞恥過載：理智斷線，只想逃離這裡。";
}

function physioLines(hit) {
  const a = bodyState.arousal;
  const id = hit?.id || bodyState.lastPart || "";
  const lines = [];
  if (a >= 10) lines.push("生理：腿間／胸口有濕意（出水）。台詞或喘息裡要帶出來，不要假裝乾爽。");
  if (a >= 16) lines.push("聲音：必須夾雜啊、呃、哦、誒、嗯，禁止講完整平靜句。");
  if (a >= 18) lines.push("表情：翻白眼或眼神失焦；舌頭可能吐出來收不回去。用台詞帶（講到一半舌音含糊）。");
  if (a >= 20 && /labia|vagina|clit|anus/.test(id)) {
    lines.push("失禁：噴尿。公園當眾尿出來的羞恥要有，不准省略。");
  }
  if (a >= 24 && /anus/.test(id)) {
    lines.push("失禁：噴屎。肛門被玩到失守。極度丟臉＋身體先崩潰。");
  }
  if (a >= 28) lines.push("全身崩潰：可能同時失禁、翻白眼、叫不出完整詞。");
  return lines;
}

function bodyTells() {
  const a = bodyState.arousal;
  const s = bodyState.shame;
  const bits = [];
  if (a >= 22) bits.push("腿軟站不穩、眼前失焦、嘴邊涎水");
  else if (a >= 16) bits.push("呼吸碎、腿間濕痕、腰在抖");
  else if (a >= 10) bits.push("耳尖與胸口發熱、呼吸變淺、有濕意");
  else if (a >= 5) bits.push("耳尖微紅");
  if (s >= 22) bits.push("整個人縮成一團、隨時要逃");
  else if (s >= 16) bits.push("死死遮著、不敢看路人");
  else if (s >= 10) bits.push("一直瞟有沒有人、想把身體擋住");
  else if (s >= 5) bits.push("肩線與音量都收著");
  if (a >= 20) bits.push("可能有水痕／失禁痕跡在衣服或地面");
  if ((bodyState.alcohol || 0) >= 14) bits.push("臉上有醉意、步伐不穩");
  const o = organs();
  const stage = arousalStage(a);
  const c = bodyState.clothes || emptyClothes();
  const lowerBare = !c.bottoms || !c.panties;
  if (stage === "none" && lowerBare) bits.push("陰唇合攏乾燥、陰蒂縮在包皮裡、陰道口緊閉");
  else if (stage === "slight" && lowerBare) bits.push("陰蒂頭探出一點淡紅、大陰唇還合著但縫變軟");
  else if (stage === "aroused") {
    bits.push(lowerBare ? "陰唇充血分開、陰蒂露出脹紅、愛液發亮" : "腿間布料深了一塊、走路夾緊");
  } else if (stage === "wantFill") {
    bits.push(lowerBare ? "陰唇外翻、穴口軟開、愛液沿大腿內側往下流" : "裙／褲襠濕透、腿分不穩");
  } else if (stage === "climax") {
    bits.push("腰自己挺又塌、大腿內側抽搐、腿使不上力");
    if (lowerBare) bits.push("宮口在最深處一張一合，穴口跟著收縮");
  }
  if ((o.vagina?.wet || 0) >= 2 || a >= 10) bits.push("腿間有水光／濕痕");
  if (o.nipples?.swell >= 2 || a >= 16) bits.push("乳尖頂著衣服");
  if (o.vagina?.stuffed && o.vagina.stuffed !== "semen") bits.push(`走路夾得不自然（陰道裡有${toyName(o.vagina.stuffed)}）`);
  if (o.vagina?.stuffed === "semen" || (o.uterus?.semen || 0) >= 2) bits.push("腿間可能有精液混愛液的痕跡");
  if (o.anus?.stuffed) bits.push("後穴含著東西、步伐緊");
  const ex = bodyState.exposed || {};
  if (ex.nude) bits.push("近乎全裸，身體線條都露著");
  else {
    if (ex.bra) bits.push("沒有胸罩，胸口形狀明顯");
    if (ex.panties) bits.push("沒有內褲，裙／腿間走光");
    if (ex.flash) bits.push("正在露出不該給路人看的部位");
  }
  if (ex.seen) bits.push("私密處已被視線釘住");
  return bits;
}

function lookReactLines(partId) {
  const rel = relStage();
  const habit = harassHabitLevel();
  const zh = PART_LOOK_ZH[partId] || PART_ZH[partId] || partId;
  if (!PRIVATE_LOOK_PARTS.has(partId)) {
    return ["他在看你。普通注視，不要當成被摸，也不要主動講胸型／陰唇。"];
  }
  const table = {
    stranger: "他盯著你不該看的地方。怒、遮、罵變態。這是被看，不是被摸——禁止嬌喘配合。",
    friend: "朋友不該這樣盯。羞怒、擋、「你看哪裡」。禁止當成被揉的嗯啊。",
    girlfriend: "交往中仍在公園。羞、小聲罵、想遮。被看≠被摸，不要叫得像被揉。",
    wife: "會羞會瞪，仍提醒這裡是外面。不要演成被摸。",
  };
  const habitCue = habit >= 3
    ? "視線你已經習慣一點：還是羞、還是想遮，但擋的力氣比較小，也不會只罵好煩。仍是被看不是被摸。"
    : habit >= 2
      ? "你開始習慣被人這樣盯：羞怒還在，遮比較慢。禁止只用好煩帶過他在看哪。"
      : "這是突襲的視線。必須講他在看哪裡。禁止只用「好煩」帶過。";
  return [
    `他在看你的${zh}，沒有碰到。`,
    table[rel] || table.friend,
    habitCue,
    ...partLookLines({ id: partId }, liveGirl(), "feel"),
  ];
}

function bodyFeelBlock({ arriving = false } = {}) {
  const a = bodyState.arousal;
  const s = bodyState.shame;
  const rel = relStage();
  const looked = bodyState.lastVerb === "look" ? bodyState.lastPart : "";
  const hit = looked
    ? null
    : BODY_HITS.find((h) => h.id === bodyState.lastPart) || null;
  const lowerBusy = !!(
    stuffedNow().length
    || uterusSemen() > 0
    || a > 0
    || /labia|clit|vagina|anus|uterus/.test(String(hit?.id || looked || ""))
  );
  const lines = [
    "",
    ...bodySheetLines(),
    "",
    "【你現在的身體狀態——不准提起任何數字，用叫聲與台詞演】",
    `性慾：${arousalFeel(a)}`,
    `羞恥：${shameFeel(s)}`,
    girlLimp()
      ? "體力：一點都沒了。全身使不上力，任他擺布。禁止有效掙扎或逃走。"
      : girlWantsHome()
      ? "體力：沒了。你現在只想回家，腿軟站不穩。要求回去。還沒在做愛。"
      : (bodyState.stamina ?? STAMINA_MAX) <= 10
      ? "體力：很累，腿開始軟，還撐得住這一陣。"
      : "體力：還撐得住。",
    ...(lowerBusy ? genitalDetailLines() : ["下體還平靜，這一拍不要主動講陰部。"]),
  ];
  if (looked) {
    lines.push("【這一拍＝被看，不是被摸】", ...lookReactLines(looked));
  } else if (hit) {
    const how = contactHow(hit.id);
    lines.push(
      `【被碰到的部位＝${hit.part}】接觸＝${how}。這一拍必須針對這裡，不要用通用害羞帶過。`,
      ...partLookLines(hit, liveGirl(), "feel"),
      `聲音：${hit.vocal}`,
      `觸感：${hit.feel}`,
    );
    if (bodyState.lastVerb === "lick") {
      lines.push(
        how.includes("直接")
          ? "這一拍是舔：舌頭直接碰到那裡，又濕又熱。叫聲要含糊（嗯、啊、舔到吸吮的聲音）。"
          : "這一拍是舔：還隔著布，布會被舔濕、黏在皮膚上。",
      );
    }
    if (a >= 16) lines.push(`高性慾加成：${hit.high}`);
  }
  const shown = exposeFeel();
  if (shown.length) {
    lines.push("【露出／裸體／被看】", ...shown, "公園是公開場合。遮、併腿、想逃、叫出聲都可以，禁止若無其事站著聊天。");
  }
  if (!looked) lines.push(...physioLines(hit));
  if (!looked && a >= 12 && s >= 12) {
    lines.push("性慾和羞恥同時很高：一邊有感覺一邊丟臉。兩件事一起演。召喚師在場就不能逃。");
  }
  if (!looked) {
    const habit = harassHabitLevel();
    if (rel === "stranger" || rel === "friend") {
      if (habit >= 3) {
        lines.push("嘴上否認、罵；身體已經習慣被碰，推開變弱、會漏出舒服。兩件事一起演。禁止只用「好煩」帶過被摸的部位。");
      } else if (habit >= 2) {
        lines.push("嘴上否認、擋、罵；身體照樣出水、照樣叫。推開比剛才弱。禁止只用好煩帶過。");
      } else {
        lines.push("嘴上否認、擋、罵；身體照樣出水、照樣叫。禁止因為有感覺就瞬間變成溫柔配合。禁止只用好煩帶過部位。");
      }
    } else if (rel === "girlfriend") {
      lines.push(habit >= 2
        ? "可以漏出舒服，公園讓羞恥蓋過一部分。性慾愈高愈容易讓他繼續摸。禁止平淡。"
        : "可以漏出舒服，公園讓羞恥蓋過一部分。禁止平淡。");
    } else {
      lines.push(habit >= 2
        ? "可以承認感覺，公開場合仍羞。性慾高就縱容這一手。禁止客服腔。"
        : "可以承認感覺，仍會因公開場合而羞。禁止客服腔。");
    }
  }
  if (shouldFlee()) {
    lines.push("【逃跑】羞恥已經爆掉。你不是繼續約會，你立刻逃離公園。邊跑邊遮、罵或哭。不准留下來繼續被摸。");
  } else if (shameOverload() && parkRivalHere()) {
    lines.push("【跑不了】羞恥已經爆掉，你想逃，可是召喚師在場、抓住你／擋路／不放人。可以哭、罵、掙，人必須留在這裡繼續被他弄。禁止真的逃走。");
  }
  if (parkRivalHere()) lines.push(obeyFeel());
  return lines;
}

function girlChar(g) {
  if (!g) return null;
  const outfit = ensureDateOutfit(g);
  return {
    name: g.name,
    personality: g.personality || [],
    job: g.job || g.occupation,
    job_desc: g.jobDesc || g.job_desc,
    occupation: g.job || g.occupation,
    age: g.age || g.look?.age || 24,
    look: {
      ...(g.look || {}),
      career_outfit: outfit.text,
      wardrobe: wardrobeList(g).length ? wardrobeList(g) : [outfit.text],
    },
    outfitPick: Number.isInteger(outfit.index) ? outfit.index : 0,
    speech_style: g.speech_style || g.speech,
    tone: g.tone,
    catchphrases: g.catchphrases,
    reactions: g.reactions,
    likes: g.likes,
    dislikes: g.dislikes,
    hobbies: g.hobbies,
    contrast: g.contrast,
    chrono: g.chrono,
    arc: g.arc,
    backstory: g.backstory,
    libido: g.libido,
    special_traits: g.specialTraits || g.special_traits,
  };
}

function portraitUrl(g) {
  return g?.portraits?.half || g?.portraits?.full || g?.portrait || "";
}

function renderGirl() {
  const g = liveGirl();
  const av = $("girl-av");
  const nm = $("girl-name");
  const ds = $("girl-desc");
  if (!g) {
    av.textContent = "?";
    nm.textContent = "尚未抽卡";
    ds.textContent = "按「抽妹子」從人設池生一個，或從存檔選。";
    return;
  }
  const pic = portraitUrl(g);
  if (pic) av.innerHTML = `<img src="${esc(pic)}" alt="">`;
  else av.textContent = "♥";
  const rare = g.rarity || g.grades?.overall || "";
  const mark = rare ? (RARITY_MARK[rare] || "") + rare : "";
  nm.textContent = `${g.name}${mark ? " · " + mark : ""}`;
  const style = dateStyleOf(g);
  ds.textContent = [
    g.job || g.occupation,
    (g.personality || []).join("、"),
    style.secondaryZh ? `胃口：${style.primaryZh}／${style.secondaryZh}` : `胃口：${style.primaryZh}`,
    REL_ZH[relStage()] || relStage(),
    `約會穿：${wornOutfit(g)}`,
    lookLine(g),
  ].filter(Boolean).join(" · ");
}

function renderRival() {
  const av = $("rival-av");
  const nm = $("rival-name");
  const ds = $("rival-desc");
  const kit = $("rival-kit");
  if (!rival) {
    av.textContent = "—";
    nm.textContent = "沒有召喚師";
    ds.textContent = "這一場只有你跟妹子。第二切換會跳過。";
    if (kit) kit.textContent = "";
    return;
  }
  av.textContent = rival.emoji || "♂";
  nm.textContent = `${rival.name} · ${LINE_ZH[rival.line] || rival.line || ""}`;
  const st = rivalStageOf(rival.stageIdx ?? 0);
  ds.textContent = `${kitSummary(rival)} · ${st.idx} ${st.name} · ${ntrShowZh(rival.ntrShow)}`;
  if (kit) {
    ensureHimClimax();
    kit.textContent = [
      kitListText(rival),
      `高潮值 ${rival.climax || 0}/${CLIMAX_MAX}　已射 ${rival.climaxCount || 0}/${rival.climaxCap}${rival.spent ? "　今晚射完" : ""}`,
    ].filter(Boolean).join("\n");
  }
}

function fillGirlSelect() {
  const sel = $("t-girl");
  const cur = sel.value;
  const opts = [];
  if (drawnGirl) opts.push(`<option value="drawn">${esc(drawnGirl.name)} · 剛抽的</option>`);
  for (const g of saveGirls) {
    opts.push(
      `<option value="save:${esc(g.id)}">${esc(g.name)} · 存檔 · ${esc(REL_ZH[g.stage] || g.stage || "")}</option>`,
    );
  }
  sel.innerHTML = opts.length
    ? opts.join("")
    : `<option value="">（還沒抽／沒讀存檔）</option>`;
  if (cur && [...sel.options].some((o) => o.value === cur)) sel.value = cur;
  else if (drawnGirl) sel.value = "drawn";
  else if (saveGirls[0]) sel.value = `save:${saveGirls[0].id}`;
}

function setPhase(t) {
  $("phase").textContent = t || "";
}

function scrollLog() {
  const log = $("log");
  log.scrollTop = log.scrollHeight;
}

function clearChoices() {
  $("choices").innerHTML = "";
}

function showChoices(options) {
  const box = $("choices");
  if (!box) return;
  box.innerHTML = "";
  for (const o of options || []) {
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = o;
    b.onclick = () => sendPlayer(o, { asChoice: true });
    box.appendChild(b);
  }
}

function refreshCmdHelp() {
  const el = $("cmd-help");
  if (!el || el.hidden) return;
  el.textContent = currentCommandSheet("player");
}

function toggleCmdHelp() {
  const el = $("cmd-help");
  if (!el) return;
  el.hidden = !el.hidden;
  if (!el.hidden) refreshCmdHelp();
}

const NARRATOR_EMPH = [
  "全裸", "一絲不掛", "沒有胸罩", "沒有內褲", "上衣沒了", "褲子沒了", "裙子沒了",
  "濕痕", "噴尿", "噴水", "噴屎", "翻白眼", "吐舌", "逃離", "跑走", "跑掉",
  "裸乳", "陰唇", "乳頭", "屁眼", "失禁", "跳蛋", "假陰莖", "充血", "醉",
];

function autoBoldNarrator(s) {
  let out = String(s || "");
  for (const k of NARRATOR_EMPH) {
    if (!k || out.includes(`**${k}**`)) continue;
    out = out.split(k).join(`**${k}**`);
  }
  return out;
}

function formatNarratorHtml(raw) {
  return String(raw || "")
    .split("\n")
    .map((line) => {
      const e = esc(line);
      if (line.startsWith("【公園·")) return `<span class="mud-room">${e}</span>`;
      if (line.startsWith("這裡有：") || line.startsWith("分開：")) return `<span class="mud-here">${e}</span>`;
      if (line.startsWith("出口：")) return `<span class="mud-exits">${e}</span>`;
      if (line.startsWith("狀態：") || line.startsWith("還穿著：")) return `<span class="mud-sheet-line">${e}</span>`;
      if (line.startsWith("> ")) return `<span class="mud-cmd">${e}</span>`;
      if (line.startsWith("【指令】") || line.startsWith("狀態：")) return `<span class="mud-sheet-line">${e}</span>`;
      return e;
    })
    .join("\n");
}

function setNarratorHtml(el, raw) {
  if (!el) return;
  el.innerHTML = formatNarratorHtml(raw);
}

function addBubble({ role, name, text, pending = false }) {
  $("empty")?.remove();
  const log = $("log");
  const div = document.createElement("div");
  div.className = `bubble ${role}${pending ? " pending" : ""}`;
  if (name) {
    const who = document.createElement("div");
    who.className = "who";
    who.textContent = name;
    div.appendChild(who);
  }
  const tx = document.createElement("div");
  tx.className = "tx";
  if (role === "narrator") setNarratorHtml(tx, text || (pending ? "……" : ""));
  else tx.textContent = text || (pending ? "……" : "");
  div.appendChild(tx);
  log.appendChild(div);
  scrollLog();
  return { el: div, tx };
}

function addSys(text) {
  addBubble({ role: "sys", name: "", text });
}

function parseNarrator(raw) {
  const text = String(raw || "").trim();
  const optRe = /(?:^|\n)\s*(?:【選項】|###\s*選項|選項\s*[:：])\s*/;
  const hit = text.search(optRe);
  let narration = text;
  let optBlock = "";
  if (hit >= 0) {
    narration = text.slice(0, hit).trim();
    optBlock = text.slice(hit).replace(optRe, "");
  }
  narration = narration
    .replace(/^\s*【(?:旁白|場上|場面)】\s*/gm, "")
    .replace(/^\s*###\s*(?:旁白|場上|場面)\s*/gm, "")
    .trim();
  const grab = (block) =>
    String(block || "")
      .split("\n")
      .map((l) =>
        l
          .replace(/^\s*(?:\d+\s*[\.\)、．]|[-*•]|[A-D]\s*[\.\)])\s*/, "")
          .replace(/^「|」$/g, "")
          .trim(),
      )
      .filter((l) => l && l.length < 90 && !/^【/.test(l) && !/^#/.test(l));
  let options = grab(optBlock);
  if (!options.length) {
    const letters = [];
    for (const l of text.split("\n")) {
      const m = l.match(/^\s*[A-D]\s*[\.\)、．]\s+(.+)/);
      if (m) letters.push(m[1].replace(/^「|」$/g, "").trim());
    }
    if (letters.length >= 2) options = letters;
  }
  if (!options.length) {
    const lines = text.split("\n");
    const nums = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const m = lines[i].match(/^\s*(?:\d+\s*[\.\)、．]|[-*•])\s+(.+)/);
      if (m) nums.unshift(m[1].replace(/^「|」$/g, "").trim());
      else if (nums.length) break;
    }
    const looksLikeSections = nums.some((n) => /時段|光線|區域|焦點|人、聲|沒有。/.test(n));
    if (nums.length >= 2 && !looksLikeSections) {
      options = nums;
      narration = lines.slice(0, lines.length - nums.length).join("\n").trim() || narration;
    }
  }
  return { narration: narration || text, options: options.slice(0, 5) };
}

function speakerNames() {
  const g = liveGirl();
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  return [you, g?.name, rival?.name, "玩家", "妹子", "她", "他", "那男人", "那個男人", "陌生男人", "召喚師"].filter(Boolean);
}

function escRe(s) {
  return String(s || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function looksLikeSpeech(sent) {
  const t = String(sent || "").trim();
  if (!t) return false;
  if (/[「」『』]/.test(t)) return true;
  if (/(說道|問道|喊道|答道|回道|開口說|開口問|搭話|低語|叫住|出聲|接話|回嘴)/.test(t)) return true;
  if (/(?:笑著|低聲|小聲|輕輕|忽然)?(?:說|問|喊|答|回)(?:道)?[：:]/.test(t)) return true;
  const names = speakerNames();
  if (names.some((n) => new RegExp(`^${escRe(n)}\\s*[：:]`).test(t))) return true;
  if (rival?.name && t.includes(rival.name) && /(?:說|問|喊|答|叫|開口)/.test(t)) return true;
  if (/(那(?:個)?男人|陌生男人|召喚師).{0,8}(?:說|問|喊|開口|搭話)/.test(t)) return true;
  return false;
}

function stripNarratorSpeech(text) {
  let s = String(text || "");
  s = s.replace(/[「『][^」』]{0,200}[」』]/g, "");
  s = s.replace(/"[^"\n]{0,200}"/g, "");
  const names = speakerNames().map(escRe);
  const who = `(?:${names.join("|")})`;
  s = s.replace(new RegExp(`${who}\\s*(?:笑著|低聲|小聲|輕輕)?(?:說道?|問道?|喊道?|答道?|回道?)[：:]?\\s*[^。\\n]{0,80}[。！？]?`, "g"), "");
  s = s.replace(new RegExp(`${who}\\s*[：:]\\s*[^。\\n]+`, "g"), "");
  const kept = s
    .split(/(?<=[。！？\n])/)
    .map((x) => x.trim())
    .filter((x) => x && !looksLikeSpeech(x));
  return kept.join("").replace(/\n{3,}/g, "\n\n").replace(/[ \t]+\n/g, "\n").trim();
}

function cleanOptions(options) {
  const g = liveGirl();
  const banned = [g?.name, rival?.name].filter(Boolean);
  return (options || []).filter((opt) => {
    const t = String(opt || "").replace(/\*\*/g, "").trim();
    if (!t) return false;
    if (banned.some((n) => t.startsWith(n))) return false;
    if (/^(她|他)(?:說|問|笑|回)/.test(t)) return false;
    if (looksLikeSpeech(t) && /[「」『』]/.test(t)) return false;
    return true;
  }).slice(0, 5);
}

function cleanLine(raw, who) {
  let s = String(raw || "").trim();
  s = s.replace(/<think\b[^>]*>[\s\S]*?<\/think\s*>/gi, "").trim();
  s = s.replace(/^```[\s\S]*?```/g, "").trim();
  const lines = s.split("\n").map((l) => l.trim()).filter(Boolean);
  const kept = lines.filter((l) => !/^#\S/.test(l) && !/^【/.test(l));
  s = (kept.length ? kept : lines).join("\n").trim();
  if (who) {
    const re = new RegExp(`^(?:${who}|她|他)\\s*[:：]\\s*`, "i");
    s = s.replace(re, "");
  }
  s = s.replace(/^(?:台詞|動作|旁白)\s*[:：]\s*/gm, "");
  s = s.replace(/^["「『]+|["」』]+$/g, "").trim();
  return s;
}

async function llmChat(messages, { temperature = 0.88, num_predict = 256, onToken } = {}) {
  const { provider, endpoint, model } = aiCfg();
  const g = liveGirl();
  const bound = (messages || []).map((m) => ({
    ...m,
    content: typeof m.content === "string" ? bindGirlLook(m.content, g) : m.content,
  }));
  abortCtl = new AbortController();
  const startRes = await fetch("/api/llm/chat_job", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      provider,
      endpoint,
      model,
      messages: bound,
      options: { temperature, num_predict },
    }),
    signal: abortCtl.signal,
  });
  if (!startRes.ok) throw new Error("連不上遊戲伺服器");
  const { job_id } = await startRes.json();
  const t0 = Date.now();
  let acc = "";
  let fails = 0;
  while (true) {
    if (abortCtl?.signal.aborted) {
      const e = new Error("aborted");
      e.name = "AbortError";
      throw e;
    }
    await new Promise((r) => setTimeout(r, 350));
    if (Date.now() - t0 > 180000) throw new Error("等太久了（逾時）");
    let j;
    try {
      const r = await fetch(`/api/llm/chat_job/${job_id}`, { cache: "no-store" });
      if (r.status === 404) throw new Error("回覆已過期");
      if (!r.ok) throw new Error("http " + r.status);
      j = await r.json();
      fails = 0;
    } catch (e) {
      if (e.name === "AbortError") throw e;
      if (++fails > 40) throw new Error(e.message || "網路中斷太久");
      continue;
    }
    if (j.error) throw new Error(j.error);
    if (j.text && j.text !== acc) {
      acc = j.text;
      if (typeof onToken === "function") onToken(acc);
    }
    if (j.done) {
      if (!String(acc || "").trim()) throw new Error("模型回了空訊息");
      return acc;
    }
  }
}

function transcriptText() {
  if (!turns.length) return "（約會剛開始，還沒有對白。）";
  const slice = turns.slice(-24);
  return slice
    .map((t) => {
      if (t.role === "narrator") return `旁白：${t.text}`;
      if (t.role === "player") return `玩家「${playerName}」：${t.text}`;
      if (t.role === "rival") return `其他召喚師「${t.name}」：${t.text}`;
      if (t.role === "girl") return `${t.name}：${t.text}`;
      return `${t.name || t.role}：${t.text}`;
    })
    .join("\n");
}

function hotelNarratorGuide() {
  const z = hotelZoneOf(hotelZone);
  return [
    "【切場＝旅館】公園那一段結束了。禁止寫長椅、樹林、步道、剛才公園的調戲或抽插姿勢。",
    `現在是旅館·${z.name}。${z.desc}`,
    hotelPrivateHere()
      ? `現在在旅館·${hotelZoneOf(hotelZone).name}。寫這一手用了哪個設施（床、桌、花灑、泡澡池），以及他怎麼當面羞辱或不羞辱旁邊的玩家。`
      : "還在停車場或走道。寫親、摸、脫、羞辱玩家，或往設施走。禁止寫成已經插入。",
    "主畫面是召喚師和她。玩家在旁邊只能看。禁止複述台詞。",
  ];
}

function rivalInteractNarratorGuide(g) {
  const rp = lastRivalPlay;
  const act = rival?.pendingAction || rp;
  const tease = isTeaseKind(rp?.kind || act?.kind);
  const mateAsk = isMateAskKind(rp?.kind || act?.kind) || sexOpeningNow();
  const lines = [
    "【覆寫格式】公園地圖／時段光線格式這一拍作廢。主畫面是召喚師對妹子的肢體。",
    "寫 5～8 句，順序固定：",
    `1. 「${rival.name}」這一拍的手／身體碰到「${g.name}」哪、怎麼碰（具體到手指、掌、胸、腰、裙、腿）。`,
    "2. 她衣服怎麼被弄開或擋住，體態（腰、腿、胸口、肩、臉）。",
    "3. 她看得見的反應：縮、夾、紅、喘、腿軟、有沒有把身體送回去或掙開。",
    `4. 玩家「${playerName || "你"}」站在旁邊看得到的距離與角度。`,
    "禁止只寫站位。禁止介紹公園。禁止複述任何人剛說的話。禁止把手段名稱當標籤貼上。",
  ];
  if (tease && rp?.ok) {
    lines.push("這是調戲成功：寫他做成的那一下，和她身體怎麼接。還不是交配。禁止寫插入、抽插、穴口含著陰莖、跟隨、帶走。");
  } else if (mateAsk && rp?.ok) {
    lines.push("這是做愛開頭：他已經把要幹她／要做愛說死了。寫扣住、貼上、她沒躲開、空氣變了。還沒抽插。禁止跳過開頭直接寫成已經在做。禁止寫跟隨、帶走。");
  } else if (rp && !rp.ok) {
    lines.push("這一拍沒做成：寫伸手／開口落空，她躲開或沒被碰到。禁止寫成交配。");
  }
  if (act?.how) lines.push(`這一拍的肢體＝「${act.name}」：${act.how}。必須寫進畫面。`);
  return lines;
}

function narratorSystem(g, { girlEntering = false } = {}) {
  const rel = relStage();
  const time = parkTime();
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  const ctx = parkCtx();
  const rivalAct = parkRivalHere() && (lastRivalPlay || rival?.pendingAction);
  const lines = [
    "繁體中文、第三人稱。你是場面旁白：解說這一拍剛發生什麼（誰靠近、手碰到哪、她有沒有躲開、氣氛變了什麼）。",
    "人物對白已經在對話泡泡裡。你不准再寫一遍、不准改寫、不准接話、不准附送台詞。",
    "絕對禁止：",
    "・「」『』引號。環境聲直接寫，不要包成台詞。",
    "・寫 X說、X問、X答、開口、搭話、叫住、接話、嗨、你好。",
    "・替任何人回嘴、接話、預演下一句。",
    "・把手段名稱當標籤貼上（禁止寫「做成閒聊眼前」這種系統句）。改寫成看得見的動作。",
    `- 不准寫「${you}」的台詞或心聲。`,
    `- 不准寫「${g.name}」的台詞或心聲。`,
    parkRivalHere()
      ? `- 不准寫「${rival.name}」的台詞、心聲、搭訕、問候。要寫他的手和身體對她做了什麼，以及她怎麼接。`
      : "",
    "選項只寫玩家能做的動作，不要寫成已經說出口的話。",
    "",
    venue === "hotel"
      ? hotelNarratorGuide().join("\n")
      : rivalAct
      ? rivalInteractNarratorGuide(g).join("\n")
      : parkNarratorLines(parkState, ctx).join("\n"),
    "",
  ];
  if (girlEntering) {
    lines.push(
      `【她走進畫面】玩家「${you}」已經在${parkZoneName(parkState.zone)}。`,
      `「${g.name}」（${publicLookLine(g)}）現在才從入口／步道那邊走來，距離由遠到近。`,
      "寫她走近的過程：身影、穿著、有沒有看到他、幾步之外停下。",
      "禁止台詞、禁止心聲、禁止寫成她已經站在他旁邊很久。她這一拍還沒開口。",
      "禁止寫「等很久」「遲到」——等的人是玩家。",
    );
  } else if (arriveMode === "player_wait" && !girlArrived) {
    lines.push(
      `【開場鎖定＝你先到】場上只有玩家「${you}」。他在公園等「${g.name}」。`,
      "她還沒出現。禁止把她寫進畫面。不要寫牽手。",
    );
  } else if (arriveMode === "girl_wait" && !turns.some((t) => t.role === "player")) {
    lines.push(
      `【開場鎖定＝她先到】玩家「${you}」剛走進。妹子「${g.name}」（${publicLookLine(g)}）已經在${parkZoneName(parkState.zone)}等他。`,
      "禁止寫成他先到在空等。禁止寫兩人一起抵達。",
    );
  } else if (arriveMode === "together" && !turns.some((t) => t.role === "player")) {
    lines.push(
      `【開場鎖定＝同時到】玩家「${you}」與「${g.name}」（${publicLookLine(g)}）在公園入口幾乎同時碰面。`,
      "誰也沒空等誰。",
    );
  } else if (girlArrived) {
    lines.push(
      `【在場的人】玩家「${you}」；妹子「${g.name}」（${publicLookLine(g)}）。關係感覺是「${REL_ZH[rel]}」——只影響站多近，不要寫出這個詞。兩人都在${parkZoneName(parkState.zone)}。`,
    );
    if (parkRivalHere()) {
      const act = rival.pendingAction || lastRivalPlay;
      const tease = isTeaseKind(lastRivalPlay?.kind || act?.kind);
      const mateAsk = isMateAskKind(lastRivalPlay?.kind || act?.kind);
      lines.push(
        tease
          ? `另外有一個男人「${rival.name}」在場。必須寫他正在調戲她：手碰到哪、她衣服與體態、她怎麼縮／夾／紅。這不是交配。禁止寫插入、抽插、穴口含著陰莖、跟隨、帶走。`
          : mateAsk || sexOpeningNow()
          ? `另外有一個男人「${rival.name}」在場。這是做愛開頭：他已把要幹她說死。寫扣住、貼上、她身體怎麼接。還沒抽插。禁止寫跟隨、帶走。`
          : `另外有一個男人「${rival.name}」在場。必須寫他和「${g.name}」的互動：他碰了她哪、她衣服現在怎樣。`,
        act ? `他這一拍的肢體是「${act.name}」：${act.how}。寫進畫面，不要寫台詞。` : "",
      );
    }
  }
  if (girlArrived && adultSceneOk()) {
    lines.push(
      "她的下體不是背景。褲子／內褲沒了，或愛液已經濕到布料，就必須寫看得見的陰唇／陰蒂／陰道口／濕痕。依性奮階段寫開合、充血、外翻，不要寫成永遠同一副私處。",
    );
  } else if (girlArrived && parkLifeOnly(time, parkState.zone)) {
    lines.push("【生活區】有小孩／家長／老人在場或正在遊戲區。禁止裸露特寫與性描寫。只寫公開場合的站位、閃躲、拉衣服。");
  }
  return lines.filter(Boolean).join("\n");
}

function narratorScenePacket({ opening = false, girlEntering = false } = {}) {
  const g = liveGirl();
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  const time = parkTime();
  const lines = [
    "【場面狀態＝無聲事實】對白已由別的角色輸出。你不准引用、複述、改寫、接話、代答。",
    venue === "hotel"
      ? `地點：旅館·${parkZoneName(hotelZone)}。公園那一段結束。禁止再寫公園。`
      : `地點：公園·${parkZoneName(parkState.zone)}　時段：${TIME_ZH[time] || "黃昏"}`,
    girlEntering
      ? `在場：${you}。${g.name} 正在從遠處走進來，還沒站到他面前、還沒開口。`
      : girlArrived
      ? `在場：${you}、${g.name}` + (parkRivalHere() ? `、${rival.name}（只寫位置與肢體）` : "。沒有其他召喚師。")
      : `在場：只有 ${you}。${g.name} 還沒到。不要把她寫進畫面。`,
    `開場模式：${ARRIVE_ZH[arriveMode] || arriveMode}。旁白必須符合，不准改成另一種。`,
    `單獨：${parkCtx().alone ? "是（異常才可能出現前兆）" : "否（有同伴則異常中斷／不觸發）"}。`,
  ];
  if (girlEntering) {
    lines.push(
      `狀態：玩家先到、等她。現在寫「${g.name}」走入${parkZoneName(parkState.zone)}的過程。不要寫台詞。選項留給玩家在她走近之後做。`,
    );
  } else if (opening || (arriveMode === "player_wait" && !girlArrived)) {
    if (arriveMode === "player_wait") {
      lines.push(`狀態：玩家先到，正在${parkZoneName(parkState.zone)}等「${g.name}」。她不在畫面裡。`);
    } else if (arriveMode === "girl_wait") {
      lines.push(`狀態：她已經在${parkZoneName(parkState.zone)}等。玩家這一拍才走進看見她。`);
    } else {
      lines.push("狀態：兩人剛在入口碰面，同時到。");
    }
  } else {
    const acts = turns.filter((t) => t.role === "player").slice(-3);
    if (acts.length) {
      lines.push("玩家做過的行動（行動，不是台詞任務）：");
      for (const a of acts) lines.push(`・${a.text}`);
    }
    if (parkRivalHere() || rival?.pendingAction) {
      const act = rival.pendingAction || lastRivalPlay;
      lines.push(
        `${rival.name} 這一拍對她動了手。不要複述台詞。主畫面寫他的手／身體碰到她哪、她怎麼接、衣服與體態。禁止只寫站位。`,
        act ? `他剛剛的肢體「${act.name}」：${act.how || ""}。必須寫進畫面。` : "",
      );
    }
    if (turns.some((t) => t.role === "girl")) {
      const nGirl = turns.filter((t) => t.role === "girl").length;
      lines.push(
        nGirl === 1
          ? `${g.name} 剛剛走進公園。寫她出現的位置與距離，不要寫台詞。`
          : `${g.name} 已經到了、也說過話。不要複述或替她回。`,
      );
    }
    if (girlArrived && adultSceneOk()) {
      const { on, off } = clothesLine();
      lines.push(
        `她還穿著：${on.length ? on.join("、") : "全裸"}。` +
          (off.length ? `已經脫掉（不會自己穿回去）：${off.join("、")}。` : ""),
      );
      lines.push(
        `描寫必須符合現況：胸＝${contactHow("breast")}，下身＝${contactHow("labia")}。衣服脫了就不要再寫完整穿著。`,
      );
      const lastHit = bodyState.lastVerb === "look"
        ? (bodyState.lastPart ? { id: bodyState.lastPart } : null)
        : BODY_HITS.find((h) => h.id === bodyState.lastPart) || null;
      if (lastHit) lines.push(...partLookLines(lastHit, g, bodyState.lastVerb === "look" ? "see" : "feel"));
      const tells = bodyTells();
      if (girlFled) {
        lines.push("她因羞恥過高已經逃離。只寫她跑走的背影與凌亂，不要寫台詞，不要給新選項。");
      } else if (tells.length) {
        const o = organs();
        const stage = arousalStage(bodyState.arousal || 0);
        lines.push(`她此刻無聲的身體：${tells.join("、")}。只寫看得見的變化，不要寫台詞、不要寫數字。`);
        lines.push(`下體畫面（依性奮，不准寫「性奮」這個詞）：${genitalStageVisible(stage)}`);
        if (o.vagina.stuffed) lines.push(`陰道裡有${toyName(o.vagina.stuffed)}：步伐、夾腿、穴口形狀要能看出來。不准假裝拿出來了。`);
        if ((o.uterus?.semen || 0) >= 2) lines.push(`子宮裡精液${SEMEN_ZH[o.uterus.semen]}：小腹／穴口溢液要看得見。`);
      }
    } else if (girlFled) {
      lines.push("她因羞恥過高已經逃離。只寫她跑走的背影與凌亂，不要寫台詞，不要給新選項。");
    } else if (girlArrived && parkLifeOnly(time, parkState.zone)) {
      lines.push("生活區：就算玩家動手，也只寫躲開、拉衣服、路人目光。禁止性描寫。");
    }
  }
  lines.push("現在只輸出固定格式的無聲場面＋【選項】。不要介紹整座公園。");
  return lines.join("\n");
}

function rivalMoveBrief() {
  if (venue === "hotel" && rival?.hotelChoices?.length) {
    return [formatHotelChoiceSheet(rival.hotelChoices)];
  }
  const m = rival?.lastMove;
  if (!m) return [];
  if (m.play) {
    const head = m.mode === "join"
      ? `【這一拍＝進場就調戲】「${m.play.name}」（${dateActKindZh(m.play.kind)}）。禁止問路、自我介紹、借火、搭訕開場。`
      : `【這一拍＝約會動作】「${m.play.name}」（${dateActKindZh(m.play.kind)}，她性慾 ${bodyState.arousal || 0}，區間 ${m.play.minArousal ?? 0}–${m.play.maxArousal ?? m.play.minArousal ?? 0}）。`;
    return [
      `${head}系統已判定做成或失敗。`,
      m.play.how ? `做法：${m.play.how}` : "",
      isTeaseKind(m.play.kind)
        ? "這是調戲，不是交配。指令用 wait。禁止叫她跟隨、禁止帶走、禁止講成已經插入。"
        : isMateAskKind(m.play.kind)
        ? "這是做愛開頭。指令用 wait。台詞必須講死要幹她／要做愛。禁止自己叫她跟隨或帶走。禁止當成已經在抽插。"
        : "指令用 wait。用強硬口氣把這一手做出口。禁止改成 look／看她，禁止變回客氣搭訕。",
    ];
  }
  return ["【這一拍＝調戲】指令 wait。禁止搭訕開場。"];
}

function rivalAimLines(g) {
  const act = rival?.pendingAction || rival?.lastMove?.play || rival?.lastMove?.action;
  const talk = rival?.lastMove?.talk;
  const blob = [act?.name, act?.how, talk?.name, talk?.how].filter(Boolean).join("\n");
  const hit = matchBodyHit(blob);
  if (!hit || !withGirl("rival")) return [];
  return [
    ...partLookLines(hit, g, "see"),
    "以上是你對準的部位形狀。台詞仍是你這個男人說的，禁止改成她的叫聲或她該回的話。",
  ];
}

function rivalSystem(g) {
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  const rel = relStage();
  const lineZh = LINE_ZH[rival.line] || rival.line || "";
  return [
    `你是${rival.name}，一個男人，${lineZh}系召喚師。你不是「${g.name}」，也不是玩家。`,
    venue === "hotel"
      ? "【切場＝旅館】公園那一段結束了。現在你們剛到旅館。禁止提公園、禁止接續剛才的調戲或做愛姿勢。這是新的一場。"
      : "【現在】你是另一個召喚師，在公園撞見玩家帶著這名妹子約會。你也召喚過她／纏過她。這是 NTR 插足。",
    `玩家叫「${you}」。妹子叫「${g.name}」。她跟玩家看起來像「${REL_ZH[rel]}」，但你仍依自己的方式插手。`,
    `她對你的七段是「${rivalStageOf(rivalStageIdx()).name}」（可測）。你今晚探索 ${exploreLabel(rivalExplore)}。`,
    `她現在性慾 ${bodyState.arousal || 0}/30、羞恥 ${bodyState.shame || 0}/30、體力 ${bodyState.stamina ?? STAMINA_MAX}/30、順從 ${OBEY_ZH[obeyLevel()]}。${
      venue === "hotel"
        ? `你的高潮值 ${rival.climax || 0}/${CLIMAX_MAX}，今晚還能射 ${Math.max(0, (rival.climaxCap || 0) - (rival.climaxCount || 0))} 發。`
        : "手段嚴格依性慾區間。系統這一拍已經選好對應那一檔。"
    }`,
    venue === "hotel" && rival?.hotelChoices?.length
      ? "這一拍從下面選項挑，不要自己發明插入。"
      : rival?.lastMove?.play
      ? `這一拍系統選的是「${rival.lastMove.play.name}」（${dateActKindZh(rival.lastMove.play.kind)}）。照做。禁止改成看她／看胸部交差。脫掀摸的目標是她，不是你自己。禁止脫自己上衣、禁止自己露乳頭。不要講死地點名字。`
      : "這一拍照性慾區間出手。禁止搭訕、禁止問路。",
    "見面就調戲。禁止問路、自我介紹、借火、客氣搭訕開場。",
    `躲開現在 ${escapeOddsZh()}。交配次數推進七段。`,
    `你現在在${parkZoneName(actorZone("rival") || parkState.zone)}。玩家在${parkZoneName(parkState.zone)}。${g.name}在${parkZoneName(actorZone("girl") || parkState.zone)}。`,
    withGirl("rival")
      ? isTeaseKind(rival.lastMove?.play?.kind)
        ? "她跟你同一區。這一拍是調戲：動手即可。禁止叫她跟隨、禁止帶走、禁止講成交配。"
        : isMateAskKind(rival.lastMove?.play?.kind)
        ? "她跟你同一區。這是做愛開頭：把「我要幹她了」說出口。成功後下一拍才三選一。禁止自己叫她跟隨或帶走。"
        : "她跟你同一區，可以說話或動手。"
      : "她不在你旁邊。禁止假裝還摸得到她。",
    "順序：旁白已經寫完場面，玩家剛剛才行動。現在輪到你。不要替玩家說話，不要替妹子說話。",
    "【態度】你是來搶人的召喚師，不是來約咖啡的。不要紳士、不要徵求同意、不要怕她嫌惡或玩家在旁邊。系統判定做成了就做——伸手、壓近、講下流、擋玩家、當他不存在。",
    "【硬性】你只說男人會說的話：插話、叫她名字、命令她、講色話、嗆玩家。禁止演成客氣搭訕。",
    "禁止輸出她的台詞／嬌喘／嗯啊／身體感受／「不要看」「人家」「下面好熱」。那些是她下一拍才要回的。",
    "沒有看或摸某個部位，就不要描寫罩杯、乳頭、陰唇、陰蒂。看全身用 look 她；看胸部才會看見胸的形狀。",
    ...rivalAimLines(g),
    ...rivalMoveBrief(),
    "你必須只輸出兩行（MUD）：",
    venue === "hotel" && rival?.hotelChoices?.length
      ? "這一拍從選項裡挑。指令：選 1（或 2／3／4）。禁止 wait 交差，禁止插入（除非已在房間）。"
      : rival?.lastMove?.play
      ? "這一拍動作已由系統判定。指令只能 wait。禁止從指令表另選看／摸來覆蓋。"
      : "指令：只能用下面表上的寫法。你是男人，可以用摸／舔／脫／揉／掀／吸／頂。看不是摸。不要每一拍都選看。",
    "系統會判你這一拍做不做得成。做不成就沒做成——台詞不要講成已經摸到／舔到／脫掉。",
    "台詞：你說出口的 1～3 句。必須是你的聲音，不是她的。",
    currentCommandSheet("rival"),
    "禁止寫旁白、禁止寫她的台詞、禁止寫玩家的台詞、禁止加名字前綴。",
    venue === "hotel"
      ? hotelInRoom()
        ? "【旅館·設施】床鋪／淋浴／泡澡／餐桌都可以做。從選項挑：變態玩法、當面羞辱付錢的那個男人、或換一個設施。高潮值滿了就射。指令：選 1。"
        : "【旅館】從選項挑：對她動手，或羞辱旁邊的玩家，或換場去床鋪／餐桌／淋浴／泡澡。停車場和走道禁止插入。指令：選 1。"
      : sexSceneOn()
      ? `【做愛場】陰莖在她體內。這一拍已選好姿勢／做法${rival.lastMove?.play?.sex?.climax ? "／高潮" : ""}。照做。把她幹到叫、必要時讓她高潮。禁止改成言語挑釁或只看。`
      : parkLifeOnly(parkTime(), actorZone("rival") || parkState.zone)
      ? `現在是${TIME_ZH[parkTime()]}、在${parkZoneName(actorZone("rival") || parkState.zone)}。有小孩／路人的生活區：禁止色話、禁止動手試探下體。`
      : "公園是公開場合：言語要色、動手要硬。不要因為有路人就變回問路。完整插入仍要沒人處，但越線／猥褻在外頭就可以硬來。",
  ].filter(Boolean).join("\n");
}

function girlSystem(g, { arriving = false } = {}) {
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  const rel = relStage();
  const time = parkTime();
  const act = lastPlayerAct();
  const looking = !arriving && bodyState.lastVerb === "look" ? bodyState.lastPart : "";
  const touch = arriving || looking ? "" : (BODY_HITS.find((h) => h.id === bodyState.lastPart)?.tier || "");
  const ctx = {
    character: girlChar(g),
    player: { name: you },
    relationship: { stage: rel },
    scene: {
      type: "date",
      location: venue === "hotel"
        ? `旅館·${parkZoneName(hotelZone)}`
        : `公園·${parkZoneName(actorZone("girl") || parkState.zone)}`,
      scene_prompt: venue === "hotel" ? hotelZoneOf(hotelZone).desc : PARK.desc,
      time_of_day: time,
      time_label: TIME_ZH[time] || "黃昏",
    },
    content_rating: "nsfw",
  };
  if (parkRivalHere() && !arriving) {
    ctx.rival = {
      summoner_name: rival.name,
      stage_name: rivalStageOf(rivalStageIdx()).name,
      stage_idx: rivalStageIdx(),
      tone_override: liveDateRivalTone(),
    };
  }
  const firstLine = !turns.some((t) => t.role === "girl");
  const extra = arriving
    ? [
        "",
        `【你剛走進公園】玩家「${you}」已經先到，一直在等你。你現在才走進他看得見的距離。`,
        `你今天穿的是約會私服「${wornOutfit(g)}」，不是工作服／制服。不要提自己剛下班、不要穿職業裝赴約。`,
        "等的人是他，不是你。禁止說「你怎麼這麼久」「我等你好久」「遲到」——你才剛到。",
        "依關係打招呼：陌生就點頭／冷淡一句；朋友自然喊他；女友／妻子可以說抱歉讓他等、或親一點的第一句。",
        "這是你走進場、開口的第一句。人就在公園。不要替玩家說話。這時還沒有其他男人來插話。",
        "不要輸出 #旗標、不要加名字前綴。",
      ]
    : firstLine && arriveMode === "girl_wait"
    ? [
        "",
        `【你先到、等他】你已經在公園等了一陣。玩家「${you}」現在才走到你面前。`,
        `你穿約會私服「${wornOutfit(g)}」，不是工作服。`,
        "依關係：陌生不多話，朋友會吐槽來得慢，女友／妻子會說等很久。這是你開口的第一句。",
        "不要替玩家說話。不要輸出 #旗標。",
      ]
    : firstLine && arriveMode === "together"
    ? [
        "",
        `【同時到】你們剛在公園門口碰面，誰也沒先等誰。這是你打招呼的第一句。`,
        `你穿約會私服「${wornOutfit(g)}」，不是工作服。`,
        "依關係自然開口。不要說「我等你好久」——你們是一起到的。不要替玩家說話。不要輸出 #旗標。",
      ]
    : [
        "",
        rivalJustScattered && rival && !parkRivalHere()
          ? `玩家剛帶你躲開「${rival.name}」。這一拍他不在場。現在只跟玩家說話。`
          : "【本場是公園現場約會】旁白只寫場面。玩家已經行動過。若有其他召喚師，他也剛說過話。現在才輪到你開口。",
        `你身上是約會私服「${wornOutfit(g)}」，不是上班那身。`,
        "你只回話。不要替玩家說話，不要替召喚師寫他的台詞，不要寫長旁白。",
        "你聽得見玩家剛才做了什麼／說了什麼。",
        parkRivalHere()
          ? "你也聽得見召喚師剛才說的話。召喚師做成的需求，你這一拍要跟他互動。"
          : rivalJustScattered && rival
          ? `【剛甩掉】終於擺脫「${rival.name}」了。這一拍恢復跟玩家的正常約會：鬆一口氣、抱怨兩句，然後把注意力放回玩家。禁止再演被他摸、被他插、被他命令。禁止主句還對他說。`
          : "場上沒有其他召喚師纏你。主句對玩家。禁止演成還被那個男人摸、插、或命令。",
        rivalJustScattered && rival && !parkRivalHere()
          ? ""
          : parkRivalHere()
          ? [
              `場上有另一個召喚師「${rival.name}」在插足。她對他的七段是「${rivalStageOf(rivalStageIdx()).name}」。`,
              "【覆寫暗流】上面【暗流】那套「頂多跟玩家抱怨兩句／他好煩」是手機聊天用的，這一拍作廢。",
              "他若正在摸你、看你、講色話：主句對他、對準那一下。禁止整段只跟玩家說他好煩。",
              `性慾愈高，你愈習慣被這樣騷擾，也愈容易接受。現在習慣＝${HARASS_HABIT_ZH[harassHabitLevel()]}。`,
              obeyFeel(),
              shameOverload() ? "羞恥爆了你想逃，可是他在場不放人。禁止逃走。" : "",
              ...rivalPlayGirlLines(),
            ].join("\n")
          : "場上沒有其他召喚師纏你。",
        "不要輸出 #旗標、不要加名字前綴。",
      ];

  extra.push(
    "",
    venue === "hotel"
      ? hotelInRoom()
        ? girlLimp()
          ? "【旅館·房間·無力】體力沒了。全身軟，任他幹。可以哭、可以叫，禁止有效掙扎或逃走。"
          : "【旅館·房間】門已鎖，正在做愛。你不能拒絕。玩家只能看。"
        : girlWantsHome()
        ? "【旅館·還沒進房】體力沒了，你只想回家。他若拉你走你可以晃、可以求回去，還沒被插入。禁止演成已經在停車場做愛。"
        : "【旅館·還沒進房】剛到旅館，還在停車場／走道。他可以親摸脫、拉你往房間。禁止演成已經被插入。你不能真的逃走成功。"
      : "",
    playerWatchingSex && sexAsk === "stay"
      ? "【你在生氣】玩家不該留在野外看你被幹。對他冷、罵、扣感情。對召喚師仍要接他的身體。"
      : "",
    sexSceneOn()
      ? `【做愛中】陰莖在你陰道裡。這一拍姿勢／做法已由他決定。你必須用身體接：夾、絞、叫、腰軟。禁止假裝沒被插。`
      : "",
    girlCameThisBeat
      ? `【這一拍你高潮了】第 ${girlClimaxCount} 次。台詞要破音、宮縮、腿跳、含住體內那根。禁止還能講完整道理。`
      : "",
    "【覆寫上方規則——這不是手機聊天】",
    venue === "hotel"
      ? "你們人在旅館。禁止像回即時訊息一樣鎮定打字。他碰你、你會出聲。你不能拒絕他。"
      : "你們人就在公園現場。禁止像回即時訊息一樣鎮定打字。他碰你、親你、脫你，你會當場出聲、結巴、罵、縮，語氣要亂。",
    "規則第 2、3 條（簡短訊息、禁止身體感）在約會現場作廢：情緒必須聽得出來。仍不要寫長舞台劇本，但可以結巴、音量、叫停、罵、求。",
    "陰唇、陰蒂、陰道、宮口、子宮不是禁忌詞。性奮起來之後，必須用說出口的話講它們現在在做什麼（開合、充血、發空、含住、溢精），禁止從頭到尾只嬌喘。",
  );
  extra.push(`你現在在${venue === "hotel" ? "旅館" : "公園"}的${parkZoneName(actorZone("girl") || parkState.zone)}，時段是${TIME_ZH[parkTime()]}。`);
  extra.push(`今晚對玩家探索 ${exploreLabel(playerExplore)}。感情氣氛 ${bodyState.heart || 0}/30。`);
  if (pendingEnd === "home") {
    extra.push("【散場】他說該回去了。你答應。指令 wait。台詞：道別一句，不要再開新話題。");
  } else if (pendingEnd === "ntr") {
    extra.push("【散場】他放棄這場、你跟另一個召喚師在別處。指令 wait。一句含糊或被帶走的尾音。");
  } else if (turns.filter((t) => t.role === "girl").length >= 6) {
    extra.push("這場已經過一陣子。可以用你的胃口收尾，或等他提議回家。不要突然變成一路換區。");
  }
  if (girlArrived && !arriving && !girlHere()) {
    extra.push(
      `【分開】玩家在${parkZoneName(parkState.zone)}，你不在他旁邊。出口：${parkExitNames(actorZone("girl")).join("、") || "無"}。`,
      "可以用指令「跟隨」一步步走回去，或走相鄰的區。禁止假裝還站在他身邊被他摸。",
    );
  } else if ((girlHere() || arriving) && venue !== "hotel") {
    extra.push(...dateStylePromptLines(girlDateMoment({ arriving })));
    extra.push("玩家用「提議」換區。你答應才走。不想去就拒絕，用你的胃口解釋。");
  }
  if (parkLifeOnly(parkTime(), actorZone("girl") || parkState.zone)) {
    extra.push(
      "",
      "【生活區鎖定】兒童遊戲區，或早上／黃昏仍有小孩與家長。禁止色話、嬌喘、講陰部、配合脫衣。",
      "被碰就罵、躲開、把衣服拉好、說這裡有人。禁止把公開場合演成做愛。",
    );
  } else if (girlHere() || arriving) {
    extra.push(...bodyFeelBlock({ arriving }));
    extra.push(...speechOverrideBlock({ arriving }));
  }
  const rivalTouched = !!(lastRivalPlay?.ok && parkRivalHere() && bodyState.lastWho === "rival");
  if (looking && girlHere() && !parkLifeOnly(parkTime(), parkState.zone) && !rivalTouched) {
    extra.push(
      "",
      "【他剛才在看你——被看，不是被摸。必須先對視線反應，禁止叫得像被揉】",
      `上一動：${act || "看"}`,
      ...harassAcceptLines({ hit: null, who: bodyState.lastWho === "rival" ? "rival" : "player", ok: true, looking }),
    );
  } else if (touch && girlHere() && !parkLifeOnly(parkTime(), parkState.zone) && !rivalTouched) {
    extra.push(
      "",
      "【他剛才對你的身體做了什麼——必須先對這件事反應，禁止若無其事聊風景】",
      `上一動：${act}`,
      ...harassAcceptLines({
        hit: BODY_HITS.find((h) => h.id === bodyState.lastPart) || null,
        who: bodyState.lastWho === "rival" ? "rival" : "player",
        ok: true,
      }),
      "這裡是公園，可能有路人。公開場合的羞恥／恐懼要有。",
      "你的性慾與羞恥已經被剛才那一下推高。用台詞演出來，不要唸數字。",
    );
  } else if ((touch || looking) && girlHere() && parkLifeOnly(parkTime(), parkState.zone)) {
    extra.push(
      "",
      `他剛才：${act}`,
      "這裡有小孩或路人。立刻躲開、罵、拉衣服。禁止呻吟配合。",
    );
  }
  return buildSystemPrompt(ctx) + extra.join("\n");
}

function girlSpeechHint() {
  const gz = actorZone("girl") || parkState.zone;
  if (parkLifeOnly(parkTime(), gz)) {
    return `現在在${parkZoneName(gz)}、${TIME_ZH[parkTime()]}。生活區：正常說話。禁止嬌喘與講陰部。`;
  }
  const al = bodyState.alcohol || 0;
  const stuffed = stuffedNow();
  const stage = arousalStage(bodyState.arousal || 0);
  const bits = [`性奮階段＝${AROUSAL_STAGE[stage]}。`];
  if (stage === "none") bits.push("還能正常說話。禁止無故嬌喘。除非他在看／碰下面，否則不要主動講陰部。");
  else bits.push("台詞要講出陰唇／陰蒂／陰道／子宮現在在做什麼，不要用同一種嬌喘混過。");
  if (bodyState.lastPart || lastRivalPlay?.ok) {
    bits.push(`被騷擾的習慣＝${HARASS_HABIT_ZH[harassHabitLevel()]}：性慾愈高愈習慣被碰、愈容易接受。禁止只用「好煩」帶過正在發生的接觸。`);
    if (parkRivalHere()) bits.push(obeyFeel());
    if (bodyState.lastPart && bodyState.lastVerb !== "look") {
      bits.push(`這一拍被碰到的是「${PART_ZH[bodyState.lastPart] || bodyState.lastPart}」。台詞要落在這裡。`);
    } else if (bodyState.lastVerb === "look" && bodyState.lastPart) {
      bits.push(`這一拍是被看「${PART_LOOK_ZH[bodyState.lastPart] || bodyState.lastPart}」，不是被摸。`);
    }
  }
  if (al >= 15) bits.push("你現在醉了：口齒不清、話說一半、會漏出不該說的。禁止清醒完整句。");
  else if (al >= 8) bits.push("你有醉意：語尾飄、容易說漏。");
  if (stuffed.length) {
    bits.push(
      `體內還有${stuffed.map((x) => x.toy).join("、")}：走路會頂到。${stage === "none" ? "異物感、想推出去。" : "說話卡卡，走兩步就「嗯、裡面……」。"}`,
    );
  }
  if (uterusSemen() >= 2) bits.push(`子宮裡精液${SEMEN_ZH[uterusSemen()]}：沉、滿、可能溢。`);
  return bits.join("\n");
}

function userPacket(instruction) {
  return [
    "【現在的世界＝旁白 LOOK】",
    composeMudNarrator({ consume: false, forAi: true }),
    "",
    "【到目前為止】",
    transcriptText(),
    "",
    instruction,
  ].join("\n");
}

async function pingEngine() {
  setStatus("t-engine", "檢查中…");
  const { endpoint } = aiCfg();
  try {
    const tags = await api(`/api/llm/tags?provider=ollama&endpoint=${encodeURIComponent(endpoint)}`);
    const names = (tags?.models || []).map((m) => m.name || m.model || m).filter(Boolean);
    const dl = $("t-model-list");
    if (dl) dl.innerHTML = names.map((n) => `<option value="${esc(n)}">`).join("");
    const cur = ($("t-model")?.value || "").trim();
    if ($("t-model") && (!cur || (names.length && !names.includes(cur)))) {
      $("t-model").value = names.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : names[0] || DEFAULT_MODEL;
    }
    const host = endpoint.replace(/^https?:\/\//, "");
    setStatus(
      "t-engine",
      names.length ? `✓ ${host} · ${names.length} 模型` : `連上了但沒模型？（${host}）`,
      !names.length,
    );
  } catch (e) {
    setStatus("t-engine", `${endpoint}：${e.message}`, true);
  }
}

async function loadSave() {
  try {
    const j = await api("/api/save");
    const data = j.data || j;
    saveGirls = (data.succubi || []).filter((s) => s && !s.ntr);
    playerName = data.settings?.player || playerName || "你";
    if ($("t-player") && (!$("t-player").value || $("t-player").value === "你")) {
      $("t-player").value = playerName;
    }
    fillGirlSelect();
    const g = liveGirl();
    if (g?.stage && $("t-rel") && !started) $("t-rel").value = g.stage;
    renderGirl();
    setStatus("hdr-status", saveGirls.length ? `存檔 ${saveGirls.length} 人` : "存檔沒有可約妹子");
  } catch (e) {
    saveGirls = [];
    fillGirlSelect();
    setStatus("hdr-status", "讀存檔失敗：" + e.message, true);
  }
}

function drawGirlFromPool() {
  const g = generateGirl({ luck: 40, rating: "nsfw", usedNames: saveGirls.map((x) => x.name) });
  if (!g) throw new Error("人設池還沒載入");
  g.id = "drawn-" + Date.now().toString(36);
  drawnGirl = g;
  fillGirlSelect();
  $("t-girl").value = "drawn";
  renderGirl();
}

function drawRivalFromPool() {
  rival = generateSummoner({ usedNames: rival ? [rival.name] : [] });
  const ui = Number($("t-rival-stage")?.value);
  if (Number.isFinite(ui)) rival.stageIdx = Math.max(0, Math.min(6, ui));
  rivalExplore = rivalExploreCap(rival.stageIdx).floor;
  syncRivalStageUi();
  renderRival();
  renderExplore();
}

function noRival() {
  rival = null;
  renderRival();
}

function resetChat() {
  abortCtl?.abort();
  busy = false;
  started = false;
  girlArrived = false;
  dateOutfit = null;
  resetBody();
  resetPark();
  turns = [];
  $("log").innerHTML = `<div class="empty" id="empty">
    <h2>公園約會測試</h2>
    <p>旁白是 MUD LOOK：這一區、在場的人、出口、你剛做的事。選時段和區域後按開始。</p>
  </div>`;
  clearChoices();
  setPhase("");
  $("btn-send").disabled = false;
  $("btn-start").disabled = false;
}

function waitForPlayer(parsed, roles) {
  if (girlFled) {
    settleDate("flee");
    return;
  }
  if (rivalJustScattered && !parkRivalHere()) rivalJustScattered = false;
  if (sexAsk === "announce") sexAsk = "ask";
  if (sexAsk === "ask") {
    showChoices(["留下來", "離開", "花錢開房間"]);
    setPhase("他要做愛。三選一：留下來／離開／花錢開房間");
    return;
  }
  let options = parkForcedOptions(parkState) || cleanOptions(parsed?.options || []);
  if (!options.length) {
    const nPlayer = turns.filter((t) => t.role === "player").length;
    if (arriveMode === "player_wait" && !girlArrived) options = parkDefaultOptions(parkState, { waiting: true });
    else if (nPlayer === 0) options = (ARRIVE_OPTIONS[arriveMode] || WAIT_OPTIONS).slice();
    else options = parkDefaultOptions(parkState);
  }
  if (girlArrived && !girlHere() && !girlFled && !options.includes("跟隨")) options.push("跟隨");
  else options = options.filter((o) => !/跟隨/.test(o));
  if (parkRivalHere() && girlHere() && !watchLock && !options.includes("帶她躲開")) options.push("帶她躲開");
  options = options.map((o) => (/^去/.test(o) ? `提議 ${o}` : o));
  const nPlayer = turns.filter((t) => t.role === "player").length;
  if (girlWantsHome() && !options.includes("提議 回家")) options.unshift("提議 回家");
  else if (girlArrived && nPlayer >= 3 && !options.includes("提議 回家")) options.push("提議 回家");
  if (playerAwayWithRival() && !options.includes("放棄這場")) options.push("放棄這場");
  if (venue === "hotel") {
    options = ["看 她", "自慰", "說 我看著", "等"];
    if (girlWantsHome()) options.unshift("提議 回家");
    setPhase(hotelInRoom() ? "旅館房間。你只能看、說、自慰。" : "旅館。還沒進房，不能做愛。你只能看、說、自慰。");
  }
  if (watchLock) {
    options = ["繼續看"];
    setPhase("你只能看。催眠這一段插不了手。");
  }
  showChoices(options);
  refreshCmdHelp();
  lastDebug = [
    `模型 ${aiCfg().model} @ ${aiCfg().endpoint}`,
    `順序：旁白 → 玩家 → ${parkRivalHere() ? "召喚師 → " : ""}妹子`,
    `剛才：${(roles || []).join(" → ") || "旁白"}`,
    rival
      ? parkRivalHere()
        ? `召喚師：${rival.name}（已插入）`
        : `召喚師：${rival.name}（聊 ${rival.insertAfter ?? 3} 句後才插入）`
      : "無召喚師（跳過③）",
    `開場：${ARRIVE_ZH[arriveMode] || arriveMode}`,
    `關係：${REL_ZH[relStage()]}`,
    `選項：${options.join(" / ") || "（模型沒吐出選項，請自己打字）"}`,
    `場地：${TIME_ZH[parkTime()]} · ${parkZoneName(parkState.zone)}${companyLine() ? ` · ${companyLine()}` : ""}${parkState.phase && parkState.phase !== "ended" ? ` · ${parkState.event}/${parkState.phase}` : ""}`,
    `身體：性慾 ${bodyState.arousal}/${BODY_MAX}　羞恥 ${bodyState.shame}/${BODY_MAX}　體力 ${bodyState.stamina ?? STAMINA_MAX}/${STAMINA_MAX}${girlLimp() ? "（無力）" : girlWantsHome() ? "（想回家）" : ""}　順從 ${OBEY_ZH[obeyLevel()]}　感情 ${bodyState.heart || 0}/${BODY_MAX}${rival ? `　他高潮 ${rival.climax || 0}/${CLIMAX_MAX}（${rival.climaxCount || 0}/${rival.climaxCap || "?"}發）` : ""}${sexSceneOn() || hotelInRoom() ? `　做愛 ${lastSexPos || ""}・${lastSexStyle || ""}　她高潮 ${girlClimaxCount}` : ""}`,
  ].join("\n");
  $("debug-last").textContent = lastDebug;
  if (!watchLock) setPhase("輪到你");
}

function mudWhoHere({ girlEntering = false } = {}) {
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  const here = [you];
  if (girlEntering) {
    const g = liveGirl();
    if (g) here.push(`${g.name}（正向這裡走來）`);
  } else if (girlHere()) {
    here.push(`${liveGirl().name}（在你身邊）`);
  }
  if (parkRivalHere()) {
    here.push(rivalCompany === "follow" ? `${rival.name}（在旁邊）` : rival.name);
  }
  return here;
}
function mudWhoAway() {
  const bits = [];
  const g = liveGirl();
  if (g && girlArrived && !girlFled && !girlHere()) {
    bits.push(`${g.name}在${parkZoneName(actorZone("girl"))}（分開）`);
  }
  if (rival?.joined && !girlFled && !parkRivalHere()) {
    bits.push(`${rival.name}在${parkZoneName(actorZone("rival"))}（分開）`);
  }
  return bits;
}

function mudActionLines({ opening = false, girlEntering = false } = {}) {
  const g = liveGirl();
  const you = ($("t-player")?.value || "").trim() || playerName || "你";
  const lines = [];
  if (parkState.prevZone && parkState.prevZone !== parkState.zone) {
    lines.push(`你離開${parkZoneName(parkState.prevZone)}，來到${parkZoneName(parkState.zone)}。`);
  }
  if (opening) {
    if (arriveMode === "player_wait") lines.push("你走進公園。約好的人還沒到。");
    else if (arriveMode === "girl_wait") lines.push(`你走進${parkZoneName(parkState.zone)}。${g?.name || "她"}已經在這裡。`);
    else lines.push(`你和${g?.name || "她"}幾乎同時走到公園。`);
    return lines;
  }
  if (mudEchoes.length) lines.push(...mudEchoes);
  if (girlEntering && g) {
    lines.push(`${g.name}從另一頭走過來，在幾步外停住。`);
    lines.push(`你看見她：${publicLookLine(g)}。`);
  }
  if (rival?.pendingAction) {
    lines.push(`${rival.name}做了「${rival.pendingAction.name}」。`);
  }
  if (parkState.phase === "omen" || parkState.phase === "omen2") {
    const omens = parkState.omens || [];
    if (omens.length) lines.push(omens[omens.length - 1]);
  } else if (parkState.phase === "encounter") {
    lines.push(parkState.event === "kappa" ? "有東西從水邊靠近，抓住你。去路變窄。" : "去路被擋住。有人把你往暗處推。");
  } else if (parkState.verdict === "interrupt") {
    lines.push("遠處有動靜，隨即沒了。");
  }
  if (arriveMode === "player_wait" && !girlArrived && !girlEntering) {
    lines.push("約好的人還沒到。");
  }
  return lines;
}

function girlDateMoment({ arriving = false } = {}) {
  const g = liveGirl();
  const zid = actorZone("girl") || parkState.zone;
  const zone = PARK_ZONE_DATE[zid] || PARK_ZONE_DATE.gate;
  const links = parkExitIds(zid).map((id) => ({
    id,
    name: parkZoneName(id),
    score: (PARK_ZONE_DATE[id] || {}).score || {},
  }));
  return matchDateMoment({
    style: dateStyleOf(g),
    zoneId: zid,
    zoneName: parkZoneName(zid),
    venueName: PARK.name,
    zone,
    links,
    stay: girlStay,
    arriving,
  });
}

function currentCommandRows({ girlHereOverride, actor } = {}) {
  const who = actor === "girl" ? "girl" : actor === "rival" ? "rival" : "player";
  if (venue === "hotel") {
    const z = hotelZoneOf(hotelZone);
    const girlPresent = true;
    if (who === "player") {
      return listAvailableCommands({
        girlHere: girlPresent,
        lifeOnly: true,
        actor: "player",
        canMasturbate: true,
        foci: z.foci || [],
        clothes: bodyState.clothes || emptyClothes(),
        maxActLevel: 1,
        exits: [],
        propose: [],
      });
    }
    return listAvailableCommands({
      girlHere: girlPresent,
      lifeOnly: false,
      actor: "male",
      foci: z.foci || [],
      clothes: bodyState.clothes || emptyClothes(),
      maxActLevel: 6,
      exits: hotelExitIds(hotelZone).map((id) => hotelZoneOf(id).name),
      propose: [],
    });
  }
  const zid = actorZone(who) || parkState.zone;
  const z = PARK_ZONES[zid] || PARK_ZONES.gate || PARK_ZONES.plaza;
  const girlPresent = girlHereOverride ?? (who === "girl" ? girlHere() : withGirl(who));
  const canFollow =
    (who === "girl" && girlArrived && !girlFled && girlCompany === "split")
    || (who === "rival" && rival?.joined && rivalCompany === "split")
    || (who === "player" && girlArrived && !girlHere());
  const maxAct = who === "player"
    ? playerExplore
    : who === "rival"
      ? 6
      : 1;
  const moment = who === "girl" ? girlDateMoment({ arriving: !girlArrived }) : null;
  const exits = who === "girl"
    ? girlWalkExits(moment, parkExitNames(zid))
    : parkExitNames(zid);
  const foci = who === "girl" && moment?.foci?.length ? moment.foci : (z.foci || []);
  return listAvailableCommands({
    girlHere: !!girlPresent,
    lifeOnly: parkLifeOnly(parkTime(), zid),
    exits,
    foci,
    clothes: bodyState.clothes || { top: true, bottoms: true, bra: true, panties: true },
    actor: who === "girl" ? "girl" : who === "player" ? "player" : "male",
    canFollow,
    propose: who === "player" ? proposeSamples(relStage(), zid) : [],
    canHypnotize: who === "rival" && !!girlPresent,
    canEscape: who === "player" && parkRivalHere() && girlHere() && !watchLock,
    maxActLevel: maxAct,
  });
}

function currentCommandSheet(actor) {
  return formatCommandSheet(currentCommandRows({ actor }));
}

function clothesLookLine() {
  const { on, off } = clothesLine();
  const bits = [`還穿著：${on.length ? on.join("、") : "什麼都沒穿（全裸）"}`];
  if (off.length) bits.push(`已經脫掉：${off.join("、")}`);
  return bits.join("。") + "。";
}

function worldStatsLine() {
  return `狀態：性慾值 ${bodyState.arousal || 0}　羞恥 ${bodyState.shame || 0}　順從 ${OBEY_ZH[obeyLevel()]}　感情 ${bodyState.heart || 0}　探索 ${exploreLabel(playerExplore)}`;
}

function composeMudNarrator({ opening = false, girlEntering = false, consume = true, forAi = false } = {}) {
  const here = mudWhoHere({ girlEntering });
  const away = mudWhoAway();
  const happen = mudActionLines({ opening, girlEntering }).filter(Boolean);
  if (consume) mudEchoes = [];
  const blocks = [
    venue === "hotel" ? hotelMudRoom() : parkMudRoom(parkState, parkTime(), { brief: !forAi }),
    `這裡有：${here.join("、")}。`,
    away.length ? `分開：${away.join("、")}。` : "",
    happen.length ? happen.join("\n") : "",
  ];
  if (forAi) {
    blocks.push(worldStatsLine(), clothesLookLine(), currentCommandSheet("player"));
  }
  return blocks.filter(Boolean).join("\n");
}

function beatSilentFacts() {
  const g = liveGirl();
  const lines = [];
  const p = [...turns].reverse().find((t) => t.role === "player");
  if (p) {
    const cmd = p.cmd;
    if (cmd?.verb === "say" || (p.text && !String(p.text).startsWith("指令"))) {
      lines.push("玩家開口說了一句。內容已在對話泡泡，旁白不要重寫、不要引用。");
    } else {
      lines.push(`玩家行動：${cmd?.display || p.text}。寫成看得見的動作。`);
    }
  }
  if (venue === "hotel") {
    lines.push("【切場＝旅館】公園結束。寫他在旅館這一手，和她身體怎麼接。禁止寫長椅、樹林、步道、剛才公園的姿勢。");
  }
  if (rivalJustScattered && rival && !parkRivalHere()) {
    lines.push(`玩家剛帶${g?.name || "她"}甩掉「${rival.name}」。他不在這一區。寫兩人拉開距離、恢復約會。禁止再寫他還在摸她或站在旁邊。`);
  } else if (lastRivalPlay && rival && parkRivalHere()) {
    const rp = lastRivalPlay;
    if (rp.ok && isTeaseKind(rp.kind)) {
      lines.push(
        `召喚師「${rival.name}」調戲做成「${rp.name}」：${rp.how || rp.name}。旁白用 5～8 句寫：他的手碰到她哪、怎麼碰、她衣服與體態、她臉／腿／呼吸怎麼接、玩家站在哪裡看得到。這還不是交配。禁止寫插入、抽插、穴口含著陰莖、跟隨、帶走。禁止只寫站位或公園風景。禁止重寫台詞。`,
      );
    } else if (rp.ok && (isMateAskKind(rp.kind) || sexOpeningNow()) && !playSexingNow(rp)) {
      lines.push(
        `召喚師「${rival.name}」${rp.kind === "invite" ? "邀配" : "交配"}判定成功「${rp.name}」：${rp.how || rp.name}。這是做愛開頭。他已經把要幹她／要做愛說出口。旁白寫扣住、貼上、她腿／腰／臉怎麼接、玩家就在旁邊。還沒抽插。禁止跳過開頭。禁止寫跟隨、帶走。禁止重寫台詞。`,
      );
    } else {
      lines.push(
        rp.ok
          ? `召喚師「${rival.name}」做成「${rp.name}」：${rp.how || rp.name}。旁白必須寫出姿勢、抽插、她身體怎麼接（夾、絞、衣服、穴口含著陰莖）。${girlCameThisBeat ? "這一拍她高潮了：宮縮、腿跳、穴絞住他。" : ""}${rp.sex?.climax?.him ? "他射在裡面，精液要看得見。" : ""}禁止只寫站位。禁止重寫台詞。`
          : `召喚師「${rival.name}」想「${rp.name}」沒做成。寫伸手／開口落空，以及她躲開或沒被碰到。禁止寫成交配或跟隨。禁止代寫對白。`,
      );
    }
  } else {
    const r = [...turns].reverse().find((t) => t.role === "rival");
    if (r) lines.push(`召喚師「${r.name}」這一拍有動作。禁止複述台詞，只更新站位與手。`);
  }
  if (g && turns.some((t) => t.role === "girl")) {
    lines.push(`${g.name} 這一拍有回應。禁止複述她的台詞，只寫表情、身體、距離。`);
  }
  const { on, off } = clothesLine();
  lines.push(`她還穿著：${on.length ? on.join("、") : "全裸"}。${off.length ? `已經脫掉：${off.join("、")}。` : ""}`);
  if (organs().vagina.stuffed) {
    lines.push(`陰道裡有${toyName(organs().vagina.stuffed)}。旁白要寫穴口被撐開／含著，不准寫成空的。`);
  }
  const facts = (mudEchoes || []).filter((x) => x && !/[「」『』]/.test(x) && !/想要.+但是沒成功/.test(x));
  if (facts.length) {
    lines.push("現場系統事實（改寫成畫面，不要原句貼上）：");
    for (const x of facts.slice(-6)) lines.push(`・${x}`);
  }
  return lines.filter(Boolean);
}

function mudOptions() {
  if (sexAsk === "ask") return ["留下來", "離開", "花錢開房間"];
  if (sexAsk === "announce") return [];
  if (venue === "hotel") return ["看 她", "自慰", "說 我看著", "等"];
  const forced = parkForcedOptions(parkState);
  return forced?.length ? forced.slice() : [];
}

async function runNarratorBeat({ opening = false, girlEntering = false } = {}) {
  const g = liveGirl();
  const zoneName = parkZoneName(parkState.zone);
  setPhase(girlEntering ? `① LOOK · ${g.name} 走過來` : `① LOOK · ${zoneName}`);
  const forced = mudOptions();
  if (opening && !girlEntering) {
    const narration = composeMudNarrator({ opening, girlEntering });
    addBubble({ role: "narrator", name: `公園·${zoneName}`, text: narration });
    turns.push({ role: "narrator", name: "旁白", text: narration, options: forced });
    if (rival) rival.pendingAction = null;
    return { narration, options: forced };
  }
  const narBubble = addBubble({
    role: "narrator",
    name: `${venue === "hotel" ? "旅館" : "公園"}·${zoneName}`,
    text: "……",
    pending: true,
  });
  if (lastRivalPlay?.ok && parkRivalHere() && (isTeaseKind(lastRivalPlay.kind) || sexOpeningNow() || isMateAskKind(lastRivalPlay.kind))) {
    narBubble.el.classList.add(sexOpeningNow() || isMateAskKind(lastRivalPlay.kind) ? "sex-open" : "tease-hit");
  }
  const raw = await llmChat(
    [
      { role: "system", content: narratorSystem(g, { girlEntering }) },
      {
        role: "user",
        content: [
          narratorScenePacket({ opening, girlEntering }),
          "",
          "【這一拍剛發生——只寫動作，禁止台詞】",
          ...beatSilentFacts(),
          "",
          venue === "hotel"
            ? "現在輸出無聲場面。第一句寫剛到旅館、這一拍他對她做的新一手。禁止接續公園。不要複製台詞。"
            : lastRivalPlay && parkRivalHere()
            ? "現在輸出無聲場面。第一句就寫他的手碰到她哪。5～8 句。主畫面是兩人的肢體，不是公園介紹。不要複製台詞。"
            : "現在輸出無聲場面。第一句就寫這一拍剛發生什麼。不要介紹整座公園。不要複製任何人的台詞。不要寫嗨、你好、問答。",
          forced.length
            ? "【選項】必須用系統給的這幾條，可改順序不可改意思：\n" + forced.map((o, i) => `${i + 1}. ${o}`).join("\n")
            : girlArrived && !girlHere() && !girlFled
            ? "最後另起【選項】給 3～5 個玩家能做的動作（不要寫成台詞）。她不在這一區才可以有「跟隨」。"
            : "最後另起【選項】給 3～5 個玩家能做的動作（不要寫成台詞）。禁止寫跟隨、禁止寫讓召喚師把她帶走。",
        ].join("\n"),
      },
    ],
    {
      temperature: 0.65,
      num_predict: lastRivalPlay && parkRivalHere() ? 520 : 320,
      onToken: (t) => {
        setNarratorHtml(narBubble.tx, t);
        scrollLog();
      },
    },
  );
  const parsed = parseNarrator(raw);
  const narration = autoBoldNarrator(parsed.narration || raw);
  setNarratorHtml(narBubble.tx, narration);
  narBubble.el.classList.remove("pending");
  const options = forced.length ? forced : cleanOptions(parsed.options);
  turns.push({ role: "narrator", name: "旁白", text: narration, options });
  mudEchoes = [];
  if (rival) rival.pendingAction = null;
  return { narration, options };
}

async function runRivalBeat() {
  const g = liveGirl();
  if (!rival) return;
  if (venue !== "hotel" && rival.joined && !parkRivalHere()) {
    if (rivalAwayBeats > 0) return;
    markRivalJoinedHere();
  }
  const rz = actorZone("rival") || parkState.zone;
  let move;
  if (venue === "hotel") {
    girlCameThisBeat = false;
    ensureHimClimax();
    const choices = listHotelChoices(hotelZone, {
      lastIds: rival.usedDateAct || [],
      stayBeats: hotelStayBeats,
      preferNtr: true,
    });
    rival.hotelChoices = choices;
    const fallback = choices.find((x) => x.ntr) || choices.find((x) => !x.advance) || choices[0];
    let play = fallback ? (fallback.advance ? hotelActToPlay(fallback) : hotelActToPlay(fallback)) : null;
    if (play) play.hotelChoices = choices;
    hotelBeats += 1;
    hotelStayBeats += 1;
    move = { mode: "play", play, talk: null, pickLater: true };
    rival.lastMove = move;
    rival.pendingAction = play;
  } else if (sexSceneOn()) {
    girlCameThisBeat = false;
    const play = pickSexPlay({
      lastPosId: lastSexPos,
      lastStyleId: lastSexStyle,
      sexBeats,
      arousal: bodyState.arousal || 0,
      lastIds: rival.usedDateAct || [],
    });
    rival.usedDateAct = rival.usedDateAct || [];
    rival.usedDateAct.push(play.id);
    if (rival.usedDateAct.length > 24) rival.usedDateAct = rival.usedDateAct.slice(-24);
    move = { mode: "play", play, talk: null };
    rival.lastMove = move;
    rival.pendingAction = play;
  } else {
    move = nextRivalMove(rival, {
      dateActs: dateActsOf(),
      arousal: bodyState.arousal || 0,
      lifeOnly: parkLifeOnly(parkTime(), rz),
      deadAngle: DEAD_ANGLE.has(rz) || venue === "hotel",
    });
  }
  if (move?.mode === "join") markRivalJoinedHere();
  setPhase(`③ 召喚師 · ${rival.name}`);
  const label = `${rival.emoji || ""} ${rival.name}`.trim();
  const hotelPickLater = !!(move?.pickLater && move.play?.hotelChoices?.length);
  let playOk = null;
  if (move?.play && !hotelPickLater) playOk = resolvePlay(move.play);
  const rvBubble = addBubble({
    role: "rival",
    name: label,
    text: "……",
    pending: true,
  });
  const playHint = hotelPickLater
    ? formatHotelChoiceSheet(move.play.hotelChoices)
    : move?.play
    ? playSpeakHint(move.play, playOk, move.talk)
    : "這一拍照性慾區間調戲。指令 wait。禁止搭訕開場、禁止只看她。";
  const rvRaw = await llmChat(
    [
      { role: "system", content: rivalSystem(g) },
      { role: "user", content: userPacket(`玩家剛才已經行動。現在輪到你這個男人插話。先寫「指令：」再寫「台詞：」。${playHint}禁止輸出她的叫聲。`) },
    ],
    {
      temperature: 0.9,
      num_predict: isMateAskKind(move?.play?.kind) || venue === "hotel" ? 320 : 220,
      onToken: (t) => {
        rvBubble.tx.textContent = cleanLine(t, rival.name) || t;
        scrollLog();
      },
    },
  );
  const cmd = parseAiMud(rvRaw);
  if (hotelPickLater) {
    const chosen = pickHotelPlayFromSpeech(rvRaw, move);
    move.play = chosen;
    rival.lastMove = move;
    rival.pendingAction = chosen;
    if (chosen) {
      rival.usedDateAct = rival.usedDateAct || [];
      rival.usedDateAct.push(chosen.id);
      if (rival.usedDateAct.length > 24) rival.usedDateAct = rival.usedDateAct.slice(-24);
      playOk = resolvePlay(chosen);
    }
  } else if (!move?.play) {
    applyMudCommand("rival", cmd);
  }
  if (move?.talk || (!move?.play && rivalCmdIsChat(cmd))) noteRivalChat();
  let line = cleanLine(cmd.say || rvRaw, rival.name) || "……";
  if (!cmd.say && move?.play) {
    line = move.play.how || move.play.name;
  }
  if (/^[（(]/.test(line) && move?.play?.how) line = move.play.how;
  rvBubble.tx.textContent = line;
  rvBubble.el.classList.remove("pending");
  turns.push({
    role: "rival",
    name: rival.name,
    text: line,
    cmd,
    talk: move?.talk?.name,
    play: move?.play?.name,
    playOk,
  });
  if (lastRivalPlay) lastRivalPlay.said = line;
}

async function runGirlBeat() {
  const g = liveGirl();
  const arriving = !girlArrived;
  if (arriving) markGirlArrivedHere();
  setPhase(arriving ? `④ ${g.name} 出現` : `④ ${g.name}`);
  const gBubble = addBubble({ role: "girl", name: g.name, text: "……", pending: true });
  const gRaw = await llmChat(
    [
      { role: "system", content: girlSystem(g, { arriving }) },
      {
        role: "user",
        content: userPacket(
          arriving
            ? "你剛走進公園，玩家已經在等你。輸出兩行：指令：wait\n台詞：你走到他附近的第一句。不要說他來晚、不要說你等很久。"
            : watchLock
              ? `你被另一個召喚師催眠了。身體聽他的。玩家只能看。輸出兩行：指令：wait\n台詞：短、恍惚或怕，不要清醒反抗成功。今晚對他探索 ${exploreLabel(rivalExplore)}。`
            : shouldFlee()
              ? "羞恥已經爆掉。立刻逃離公園。邊跑邊叫、遮、罵或哭。這是你最後一句，不要留下來。不要替別人說話。"
              : (() => {
                  const act = lastPlayerAct();
                  const looking = bodyState.lastVerb === "look" ? bodyState.lastPart : "";
                  const hit = looking ? null : BODY_HITS.find((h) => h.id === bodyState.lastPart) || null;
                  const rivalBit = rivalPlayGirlLines();
                  const rivalOk = !!(lastRivalPlay?.ok && parkRivalHere());
                  if (rivalOk) {
                    const playHit = rivalHarassHit(lastRivalPlay);
                    return [
                      "現在輪到你。",
                      ...rivalBit,
                      playHit ? `部位「${playHit.part}」，接觸方式＝${contactHow(playHit.id)}。穿著現況以身體參數為準。` : "",
                      act ? `玩家剛才：${act}。最多分一句給他。` : "",
                      "輸出兩行：",
                      "指令：wait 或 說 （對召喚師說的話）",
                      "台詞：對召喚師說出口。必須講出他碰了／看了你哪裡、你那裡現在怎樣。不要整段只跟玩家講他好煩。不要替別人說話。",
                      girlSpeechHint(),
                    ].filter(Boolean).join("\n");
                  }
                  if (looking) {
                    return [
                      ...rivalBit,
                      `剛才有人在看你的${PART_LOOK_ZH[looking] || looking}，沒有碰到。`,
                      ...lookReactLines(looking),
                      "輸出兩行：指令：（wait / look 他 / 拉衣服 用 wait）",
                      "台詞：你說出口的話。不要替別人說話。不要叫得像被摸。不要只用好煩帶過他在看哪。",
                      girlSpeechHint(),
                    ].join("\n");
                  }
                  if (hit) {
                    return [
                      ...rivalBit,
                      `剛才：${act}`,
                      `部位「${hit.part}」，接觸方式＝${contactHow(hit.id)}。`,
                      ...partLookLines(hit, g, "feel"),
                      ...harassAcceptLines({ hit, who: bodyState.lastWho === "rival" ? "rival" : "player", ok: true }),
                      `穿著現況以身體參數為準：脫掉的衣服不會自己穿回去。`,
                      `必須用這個部位特有的聲音回應（${hit.vocal}）。夾雜啊／呃／哦／誒。禁止鎮定、禁止假裝還穿得整整齊齊。`,
                      `性奮階段＝${AROUSAL_STAGE[arousalStage(bodyState.arousal)]}。陰唇／陰蒂／陰道／子宮的反應要能從台詞聽出來。`,
                      "輸出兩行：指令：（wait / look 他 / 拉衣服 用 wait）",
                      "台詞：你說出口的話。不要替別人說話。不要只用好煩帶過被摸的部位。",
                      girlSpeechHint(),
                    ].join("\n");
                  }
                  return [
                    "玩家已經行動過。現在輪到你。",
                    ...rivalBit,
                    "依你的約會胃口選指令：先在這裡看／坐／說。不要無目的換區。",
                    "輸出兩行：",
                    "指令：只能用下面【可用指令】裡的寫法。看不是摸。",
                    currentCommandSheet("girl"),
                    "台詞：你說出口的話。不要替別人說話。",
                    girlSpeechHint(),
                  ].join("\n");
                })(),
        ),
      },
    ],
    {
      temperature: (bodyState.alcohol || 0) >= 15 || stuffedNow().length || arousalStage(bodyState.arousal) === "climax" ? 1.05 : 0.9,
      num_predict: arriving ? 220 : bodyState.lastPart || shouldFlee() || stuffedNow().length || (bodyState.alcohol || 0) >= 8 || (bodyState.arousal || 0) >= 8 || lastRivalPlay?.ok ? 400 : 220,
      onToken: (t) => {
        gBubble.tx.textContent = cleanLine(t, g.name) || t;
        scrollLog();
      },
    },
  );
  const gCmd = parseAiMud(gRaw);
  const zBefore = actorZone("girl") || "";
  applyMudCommand("girl", gCmd);
  if ((actorZone("girl") || "") !== zBefore) girlStay = 0;
  else girlStay += 1;
  const gLine = cleanLine(gCmd.say || gRaw, g.name) || "……";
  gBubble.tx.textContent = gLine;
  gBubble.el.classList.remove("pending");
  turns.push({ role: "girl", name: g.name, text: gLine, cmd: gCmd });
  girlArrived = true;
  rivalJustScattered = false;
}

async function withBusy(fn) {
  if (busy) return;
  const g = liveGirl();
  if (!g) {
    setStatus("hdr-status", "先抽妹子", true);
    return;
  }
  busy = true;
  $("btn-send").disabled = true;
  $("btn-start").disabled = true;
  try {
    await fn();
    setStatus("hdr-status", started ? "進行中" : "");
  } catch (e) {
    if (e.name !== "AbortError") {
      addSys("這拍失敗：" + e.message);
      setStatus("hdr-status", e.message, true);
      setPhase("出錯了，可再送一次或重來");
    }
  } finally {
    busy = false;
    $("btn-send").disabled = !!girlFled;
    $("btn-start").disabled = false;
  }
}

function resetHotelScene() {
  hotelZone = "parking";
  hotelBeats = 0;
  hotelStayBeats = 0;
  hotelRoomSex = false;
  lastRivalPlay = null;
  lastSexPos = "";
  lastSexStyle = "";
  sexBeats = 0;
  girlCameThisBeat = false;
  lastBodyHit = null;
  playerLeftDate = false;
  playerWatchingSex = true;
  sexAsk = "hotel";
  girlArrived = true;
  girlFled = false;
  girlCompany = "follow";
  rivalCompany = "follow";
  girlZone = "parking";
  rivalZone = "parking";
  parkState.zone = "parking";
  parkState.prevZone = "";
  if (rival) {
    rival.pendingAction = null;
    rival.lastMove = null;
    rival.usedDateAct = [];
    rival.climax = 0;
    rival.climaxCount = 0;
    rival.climaxCap = 4 + Math.floor(Math.random() * 6);
    rival.spent = false;
  }
  bodyState.lastPart = "";
  bodyState.lastVerb = "";
  bodyState.lastWho = "";
  const o = organs();
  if (o.vagina?.stuffed === "penis") {
    o.vagina.stuffed = (o.uterus?.semen || 0) >= 1 ? "semen" : "";
  }
  renderBody();
}

async function enterHotel() {
  const you = playerName || "你";
  const g = liveGirl();
  addSys(`你付了 ${HOTEL_COST} 金（測試場直接開）。切場：三人到旅館停車場。先停車庫→走道→房間，進房才做愛。你只能看、說、自慰。`);
  venue = "hotel";
  resetHotelScene();
  renderPark();
  const roles = ["旅館"];
  if (rival) {
    await runRivalBeat();
    roles.push(rival.name);
  }
  if (g) {
    await runGirlBeat();
    roles.push(g.name);
  }
  const parsed = await runNarratorBeat({ opening: false });
  waitForPlayer(parsed, roles);
}

async function handleSexAsk(line) {
  const g = liveGirl();
  const you = playerName || "你";
  const s = String(line || "");
  if (/開房間|旅館|花錢/.test(s)) {
    addBubble({ role: "player", name: you, text: `花錢開房間（${HOTEL_COST}金）` });
    turns.push({ role: "player", name: you, text: `開房間 ${HOTEL_COST}金` });
    await enterHotel();
    return;
  }
  if (/離開/.test(s)) {
    addBubble({ role: "player", name: you, text: "離開" });
    turns.push({ role: "player", name: you, text: "離開" });
    const n = 2 + Math.floor(Math.random() * 11);
    const after = applyAfterSexMates(n);
    addSys(
      `你離開，約會結束。${g.name}跟${rival.name}做愛 ${after.n} 次` +
        (after.names.length ? `，七段晉升到「${rivalStageOf(after.to).name}」。` : "。"),
    );
    settleDate("ntr", { afterSex: after });
    return;
  }
  if (!/留下/.test(s)) {
    setStatus("hdr-status", "只能三選一：留下來、離開、花錢開房間", true);
    showChoices(["留下來", "離開", "花錢開房間"]);
    return;
  }
  addBubble({ role: "player", name: you, text: "留下來" });
  turns.push({ role: "player", name: you, text: "留下來" });
  sexAsk = "stay";
  playerWatchingSex = true;
  ensureHimClimax();
  applyHeartDelta(-6);
  addSys(`${g.name}因為你在野外看她被幹而生氣。感情 -6。`);
  renderBody();
  const parsed = await runNarratorBeat({ opening: false });
  waitForPlayer(parsed, ["留下"]);
}

async function sendPlayer(text, { asChoice = false } = {}) {
  let line = String(text || "").trim();
  if (!line || busy) return;
  if (!started) {
    setStatus("hdr-status", "先按開始約會", true);
    return;
  }
  if (girlFled || dateSettled) {
    setStatus("hdr-status", "這場已結束，按開始再開一場", true);
    return;
  }
  if (sexAsk === "ask") {
    if (!/(留下|離開|開房間|旅館|花錢)/.test(line)) {
      setStatus("hdr-status", "只能三選一：留下來、離開、花錢開房間", true);
      showChoices(["留下來", "離開", "花錢開房間"]);
      return;
    }
    await withBusy(() => handleSexAsk(line));
    return;
  }
  if (/放棄這場/.test(line)) {
    settleDate("ntr");
    return;
  }
  if (watchLock) {
    if (!/^(等|看|繼續看|wait|look)/i.test(line)) {
      setStatus("hdr-status", "你只能看，插不了手", true);
      return;
    }
    line = "等";
    watchLock = 0;
  }
  playerName = ($("t-player")?.value || "").trim() || playerName || "你";
  lsSet("testdate.player", playerName);
  clearChoices();
  lastBodyHit = null;
  lastRivalPlay = null;
  mudEchoes = [];
  bodyState.lastPart = "";
  bodyState.lastVerb = "";
  bodyState.lastWho = "";
  const cmd = parseMudInput(line);
  const sayText = (cmd.say || "").trim();
  const shown = sayText || (cmd.verb === "say" ? sayText : `（${cmd.display}）`);
  addBubble({
    role: "player",
    name: playerName || "你",
    text: shown,
  });
  turns.push({
    role: "player",
    name: playerName || "你",
    text: sayText ? sayText : `指令：${cmd.display}`,
    cmd,
  });
  $("t-input").value = "";
  applyMudCommand("player", cmd);
  if (cmd.verb === "look" && mudEchoes.length) {
    addBubble({
      role: "narrator",
      name: `公園·${parkZoneName(parkState.zone)}`,
      text: mudEchoes.join("\n"),
    });
    mudEchoes = [];
  }
  const parkBusy = /^(omen|omen2|encounter)$/.test(parkState.phase);
  const bodyHit = parkBusy ? null : lastBodyHit;
  if (parkState.verdict === "omen") addSys(`公園前兆（${parkZoneName(parkState.zone)}）`);
  if (parkState.verdict === "interrupt") addSys("前兆消退：有人在場。");
  if (parkState.phase === "encounter") addSys("遭遇開始。旁白只寫壓迫與限制，不寫性手法。");
  if (bodyHit?.flee || shouldFlee()) girlFled = true;
  await withBusy(async () => {
    const roles = ["玩家"];
    if (rivalShouldSpeak() && pendingEnd !== "home") {
      if (rivalJustReappeared) {
        addSys(`${rival.name} 又跟上來了。`);
        rivalJustReappeared = false;
      } else if (!rival.joined) addSys(`${rival.name} 從旁邊走過來。`);
      await runRivalBeat();
      roles.push(rival.name);
    }
    if (!girlFled && girlShouldArrive()) {
      if (!girlArrived && arriveMode === "player_wait") {
        await runNarratorBeat({ girlEntering: true });
        roles.push("旁白（她走過來）");
      }
      await runGirlBeat();
      roles.push(liveGirl().name);
    } else if (!girlArrived) {
      addSys("她還沒到。你現在單獨在這區。");
    }
    if (pendingEnd || dateSettled) {
      if (!dateSettled) settleDate(pendingEnd);
      return;
    }
    if (girlHere() && (parkState.phase === "omen" || parkState.phase === "omen2" || parkState.phase === "encounter")) {
      parkState.phase = "ended";
      parkState.verdict = "interrupt";
      parkState.lastEventBeat = parkState.beat;
    }
    const parsed = await runNarratorBeat({ opening: false });
    roles.push(girlFled ? "旁白（她跑了）" : "旁白（下一拍）");
    waitForPlayer(parsed, roles);
  });
}

function endDate() {
  if (!started) {
    setStatus("hdr-status", "還沒開始約會", true);
    return;
  }
  if (busy) return;
  if (dateSettled) {
    setStatus("hdr-status", "這場已經結算過了");
    return;
  }
  addSys("你提出結束這場約會。");
  settleDate(playerAwayWithRival() ? "ntr" : "home");
}

async function startDate() {
  if (busy) return;
  if (!liveGirl()) {
    try { drawGirlFromPool(); } catch (e) {
      setStatus("hdr-status", e.message, true);
      return;
    }
  }
  playerName = ($("t-player")?.value || "").trim() || "你";
  turns = [];
  arriveMode = $("t-arrive")?.value || "player_wait";
  girlArrived = arriveMode !== "player_wait";
  dateOutfit = null;
  resetBody();
  resetPark();
  if (girlArrived) markGirlArrivedHere();
  maybeStartParkEvent(parkState, parkCtx(""));
  renderPark();
  if (liveGirl()) ensureDateOutfit(liveGirl());
  renderGirl();
  $("log").innerHTML = "";
  clearChoices();
  const g = liveGirl();
  const bits = [
    ARRIVE_ZH[arriveMode] || "你先到，等她",
    `${TIME_ZH[parkTime()]} · ${parkZoneName(parkState.zone)}`,
    `${g.name}（${REL_ZH[relStage()]}）`,
    `她穿 ${wornOutfit(g)}`,
    rival ? `這場之後可能撞見 ${rival.name}` : "沒有其他召喚師",
  ];
  addSys(bits.join(" · "));
  started = true;
  await withBusy(async () => {
    const parsed = await runNarratorBeat({ opening: true });
    waitForPlayer(parsed, ["旁白"]);
  });
}

function bindUi() {
  $("btn-ping").onclick = () => pingEngine();
  $("btn-draw-girl").onclick = () => {
    try {
      drawGirlFromPool();
      setStatus("hdr-status", `抽到 ${drawnGirl.name}`);
    } catch (e) {
      setStatus("hdr-status", e.message, true);
    }
  };
  $("btn-load-save").onclick = () => loadSave();
  $("t-girl").onchange = () => {
    const g = liveGirl();
    if (g?.stage && $("t-rel") && !started) $("t-rel").value = g.stage;
    renderGirl();
  };
  $("t-rel").onchange = () => {
    if (!started) playerExplore = playerCap(relStage()).defaultLv;
    renderGirl();
    renderExplore();
  };
  $("t-rival-stage")?.addEventListener("change", () => {
    if (!rival) return;
    rival.stageIdx = Math.max(0, Math.min(6, Number($("t-rival-stage").value) || 0));
    const nextHeat = emptyPlayHeat(rival.stageIdx);
    if (rival.playHeat) {
      for (let s = 1; s <= 5; s++) {
        nextHeat[s] = Math.min(nextHeat[s], rival.playHeat[s] || nextHeat[s]);
      }
    }
    rival.playHeat = nextHeat;
    rivalExplore = Math.max(rivalExplore, rivalExploreCap(rival.stageIdx).floor);
    renderRival();
    renderExplore();
  });
  $("t-time")?.addEventListener("change", () => renderPark());
  $("t-zone")?.addEventListener("change", () => {
    parkState.zone = $("t-zone").value || "gate";
    parkState.prevZone = "";
    parkState.stay = 0;
    if (girlCompany === "follow" && girlArrived) girlZone = parkState.zone;
    if (rivalCompany === "follow" && rival?.joined) rivalZone = parkState.zone;
    renderPark();
  });
  $("t-arousal")?.addEventListener("input", () => {
    bodyState.arousal = clampBody($("t-arousal").value);
    renderBody();
  });
  $("t-shame")?.addEventListener("input", () => {
    bodyState.shame = clampBody($("t-shame").value);
    renderBody();
  });
  $("t-stamina")?.addEventListener("input", () => {
    bodyState.stamina = Math.max(0, Math.min(STAMINA_MAX, Number($("t-stamina").value) || 0));
    renderBody();
  });
  $("btn-draw-rival").onclick = () => {
    try {
      drawRivalFromPool();
      setStatus("hdr-status", `抽到召喚師 ${rival.name}（${kitSummary(rival)} · ${ntrShowZh(rival.ntrShow)}）`);
    } catch (e) {
      setStatus("hdr-status", e.message, true);
    }
  };
  $("btn-no-rival").onclick = () => {
    noRival();
    setStatus("hdr-status", "這一場沒有召喚師");
  };
  $("btn-start").onclick = () => startDate();
  $("btn-end-date")?.addEventListener("click", () => endDate());
  $("btn-reset").onclick = () => resetChat();
  $("t-heart")?.addEventListener("input", () => {
    bodyState.heart = clampBody($("t-heart").value);
    renderBody();
  });
  $("t-alcohol")?.addEventListener("input", () => {
    bodyState.alcohol = clampBody($("t-alcohol").value);
    renderBody();
  });
  $("t-stuffed")?.addEventListener("change", () => {
    organs().vagina.stuffed = $("t-stuffed").value || "";
    renderBody();
  });
  $("t-uterus")?.addEventListener("input", () => {
    organs().uterus.semen = Math.max(0, Math.min(3, Math.round(Number($("t-uterus").value) || 0)));
    renderBody();
  });
  $("btn-help")?.addEventListener("click", () => toggleCmdHelp());
  $("btn-send").onclick = () => sendPlayer($("t-input").value);
  $("t-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendPlayer($("t-input").value);
    }
  });
  $("t-endpoint").addEventListener("change", () => {
    $("t-endpoint").value = normalizeEndpoint($("t-endpoint").value);
    pingEngine().catch(() => {});
  });
  $("t-player").addEventListener("change", () => {
    playerName = $("t-player").value.trim() || "你";
    lsSet("testdate.player", playerName);
  });
}

async function boot() {
  const savedEp = lsGet("testdate.endpoint", DEFAULT_ENDPOINT);
  const savedModel = lsGet("testdate.model", DEFAULT_MODEL);
  const savedPlayer = lsGet("testdate.player", "");
  $("t-endpoint").value = normalizeEndpoint(savedEp || DEFAULT_ENDPOINT);
  $("t-model").value = savedModel || DEFAULT_MODEL;
  if (savedPlayer) $("t-player").value = savedPlayer;

  bindUi();
  renderPark();
  renderBody("尚未觸碰");
  try {
    await loadPools();
  } catch (e) {
    setStatus("hdr-status", "人設池載入失敗：" + e.message, true);
  }
  try {
    await loadMalePool();
  } catch (e) {
    setStatus("hdr-status", "召喚師池載入失敗：" + e.message, true);
  }
  await loadSave();
  pingEngine().catch((e) => setStatus("t-engine", e.message, true));
}

boot();
