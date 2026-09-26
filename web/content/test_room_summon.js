/* 試煉房抽妹子：人設跟 /testword 同一套。先不畫、不顯示立繪。不寫遊戲名冊。 */
import { loadPools, generateGirl, RARITY_MARK } from "./girl_gen.js";
import { regionById, rollJapanRegion } from "./japan_regions.js";
import { climateNote, rollGround } from "./japan_grounds.js";
import { japanNow } from "./japan_clock.js";
import { HOMES, sampleHomes } from "./japan_homes.js";
import { JOBS, sampleJobs } from "./japan_jobs.js";
import { rollShift } from "./japan_shift.js";
import { rollStroll } from "./japan_stroll.js";
import { rollPlaceScp, rollWorkScp, scpBrief, scpLabel } from "./japan_scp.js";

const $ = (id) => document.getElementById(id);

let girl = null;
let pending = false;
let activityOpen = false;
let workToken = 0;
let lines = [];
let talkFor = "";
let talkBusy = false;
let typeJob = 0;

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
  if (activity === "wander") {
    const place = girl.world.stroll?.placeName;
    if (girl.world.stroll?.pending && place) return `她走到${place}。`;
    if (place) return `她在${place}逛過。`;
    return "她在亂逛。";
  }
  if (activity === "work" && !job) return "她在挑打工。";
  if (activity === "work" && girl.world.shift?.pending) return `她在${job.name}開始工作了。`;
  if (job) return `她的打工是${job.name}。`;
  return "";
}

function sceneLine() {
  const activity = girl?.world?.activity;
  const scene = activity === "work" ? girl.world.shift : activity === "wander" ? girl.world.stroll : null;
  if (!scene) return "";
  const tone = scene.toneName ? `${scene.toneName}\n` : "";
  if (scene.pending) return scene.toneName ? `${scene.toneName}\n事情正在發生。` : "事情正在發生。";
  const known = scene.known ? `\n她認識了${scene.personName}。` : "";
  if (!scene.roleName) return `${tone}${scene.event || ""}`;
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
  const now = japanNow();
  const out = sheIsOut();
  const where = $("girl-where");
  where.hidden = !ground || out;
  where.textContent = ground ? `${ground.name}　${now.label}` : "";
  const clock = $("world-clock");
  clock.hidden = !ground || !out;
  clock.textContent = now.label;
  if (ground && !clockTimer) clockTimer = setInterval(renderWhere, 30000);
}

function sheIsOut() {
  return !!girl?.world && !window.RoomActor?.isPresent();
}

function renderWorld() {
  const panel = $("girl-world");
  const region = placedRegion();
  const out = sheIsOut();
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
  $("world-lead").textContent = ground
    ? `${girl.name}離開了房間，人在${ground.name}。`
    : `${girl.name}離開了房間，現在人在日本的${region.name}。`;
  $("world-region").textContent = region.name;
  $("world-home").textContent = home ? `住在${home.name}。` : "正在決定她住哪。";
  $("world-activity").hidden = !activity && !girl.world.job;
  $("world-activity").textContent = activityLine();
  const shiftText = sceneLine();
  $("world-shift").hidden = !shiftText;
  $("world-shift").textContent = shiftText;
  $("world-actions").hidden = !home;
  $("open-activity").setAttribute("aria-expanded", String(activityOpen));
  $("activity-choices").hidden = !activityOpen;
  $("activity-work").setAttribute("aria-pressed", String(activity === "work"));
  $("activity-wander").setAttribute("aria-pressed", String(activity === "wander"));
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
};

function noteScpStep(who, scp) {
  if (!who?.world || !scp?.id) return;
  if (!who.world.scpSteps) who.world.scpSteps = {};
  who.world.scpSteps[scp.id] = scp.step + 1;
}

function setMood(who, name) {
  if (!who?.world || !MOODS[name]) return;
  who.world.mood = name;
}

function moodFromStroll(rolled) {
  if (rolled.scp || rolled.tone?.id === "horror" || rolled.tone?.id === "scp") return "不安";
  const emotion = rolled.emotion?.name;
  if (emotion === "怒") return "不悅";
  if (emotion === "哀") return "低落";
  if (rolled.tone?.id === "wonder" || emotion === "喜" || emotion === "樂") return "愉快";
  return "平靜";
}

function moodFromShift(rolled) {
  if (rolled.scp) return "不安";
  const emotion = rolled.emotion?.name;
  if (emotion === "怒") return "不悅";
  if (emotion === "哀") return "低落";
  if (emotion === "喜" || emotion === "樂") return "愉快";
  return "平靜";
}

function renderMood() {
  const mood = girl?.world?.mood;
  const line = $("girl-mood");
  line.hidden = !mood;
  line.textContent = mood ? `心情 ${mood}` : "";
}

const FRIEND_LIMIT = 5;
const FRIEND_CHANCE = 1 / 3;

function renderFriends() {
  const friends = girl?.world?.friends || [];
  const panel = $("girl-friends");
  panel.hidden = friends.length === 0;
  $("friend-heading").textContent = `朋友 ${friends.length}/${FRIEND_LIMIT}`;
  const list = $("friend-list");
  list.replaceChildren();
  for (const friend of friends) {
    const item = document.createElement("li");
    item.textContent = `${friend.name} · ${friend.role}`;
    list.append(item);
  }
}

function rollBefriend(who, act, random = Math.random) {
  if (!act?.know) return false;
  if ((who?.world?.friends?.length || 0) >= FRIEND_LIMIT) return false;
  return Number(random()) < FRIEND_CHANCE;
}

function addFriend(who, friend) {
  if (!who?.world || !friend?.name) return false;
  if (!Array.isArray(who.world.friends)) who.world.friends = [];
  if (who.world.friends.length >= FRIEND_LIMIT) return false;
  if (who.world.friends.some((item) => item.name === friend.name)) return false;
  who.world.friends.push({ name: friend.name, role: friend.role, at: Date.now() });
  return true;
}

function renderCard() {
  const card = $("summon-card");
  if (!girl) {
    card.hidden = true;
    $("let-leave").hidden = true;
    renderDebug();
    return;
  }
  card.hidden = false;
  const region = placedRegion();
  $("summon-name").textContent = titleOf(girl);
  $("summon-meta").textContent = region && sheIsOut() ? `${lookLine(girl)} · 人在日本的${region.name}` : lookLine(girl);
  $("let-leave").hidden = sheIsOut();
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
  return !$("portrait-sheet").hidden;
}

function setTyping(on) {
  $("talk-typing").hidden = !on;
}

function setTalkEnabled(on) {
  $("talk-input").disabled = !on;
  $("talk-send").disabled = !on || talkBusy;
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
  if (!Array.isArray(who.world.memories)) who.world.memories = [];
  who.world.memories.push(moment);
  if (who.world.memories.length > 6) who.world.memories.splice(0, who.world.memories.length - 6);
}

function rememberShift(who, rolled, event, know, personName) {
  rememberMoment(who, {
    job: who.world.job?.name || "",
    toneName: rolled.scp ? scpLabel(rolled.scp) : "",
    roleName: rolled.role.name,
    emotionName: rolled.emotion.name,
    event,
    known: !!know,
    personName: personName || "",
  });
}

function lifeNotes() {
  const world = girl?.world;
  if (!world) return [];
  const region = placedRegion();
  const notes = [];
  if (region) notes.push(`她在日本落腳的地方是${world.ground?.name || region.name}。${world.home ? `那裡的住所是${world.home.name}。` : ""}人現在不在那裡。`);
  if (world.job) notes.push(`打工是${world.job.name}。`);
  const friends = world.friends || [];
  if (friends.length) notes.push(`朋友：${friends.map((friend) => `${friend.name}（${friend.role}）`).join("、")}。`);
  const memories = world.memories || [];
  if (!memories.length) return notes;
  notes.push("下面是真的發生過的事。他問到就說。沒有列在這裡的事不要編成已經發生。");
  memories.slice(-4).forEach((item, index) => {
    const met = item.known && item.personName ? `，因此認識了${item.personName}` : "";
    if (item.placeName) {
      const who = item.roleName ? `碰到${item.roleName}，對方情緒是${item.emotionName}${met}。` : "沒有碰到特定的人。";
      const tone = item.toneName ? `遇到${item.toneName}。` : "";
      notes.push(`${index + 1}. 在${item.placeName}亂逛，${tone}${who}經過：${item.event}`);
      return;
    }
    const tone = item.toneName ? `遇到${item.toneName}。` : "";
    notes.push(`${index + 1}. 在${item.job}碰到${item.roleName}，對方情緒是${item.emotionName}${met}。${tone}經過：${item.event}`);
  });
  return notes;
}

function returnMood() {
  const mood = girl.world?.mood;
  if (!mood) return "";
  const how = MOODS[mood] || MOODS.平靜;
  if (!girl.world.justBack) return `你現在的心情是${mood}。${how}不要每句報心情。`;
  return `你剛被召喚到這間房間，不是回到自己的家。你現在的心情是${mood}。${how}沒有特別的事就不要報日本那邊。不要每句報心情。`;
}

function namesOf(list) {
  return (Array.isArray(list) ? list : []).map((item) => typeof item === "string" ? item : (item?.name || item?.text || "")).filter(Boolean);
}

function mannerLine() {
  const stats = girl.stats;
  if (!stats) return "";
  const lead = stats.proactivity >= 60 ? "她會自己起話。" : stats.proactivity <= 40 ? "她多半等對方先說。" : "她會接話，但不搶著說。";
  const shy = stats.shyness >= 60 ? "她容易不好意思，話偏短。" : stats.shyness <= 40 ? "她說話直接，不太害羞。" : "她害羞程度普通。";
  const jealous = stats.jealousy >= 60 ? "忌妒心偏高，但你們還不熟，先不要演出來。" : "";
  return `${lead}${shy}${jealous}`;
}

function reactionLine() {
  const key = { 愉快: "開心", 低落: "低落", 不悅: "生氣", 不安: "不安" }[girl.world?.mood];
  const text = key && girl.reactions?.[key];
  return text ? `她在這種心情時：${text}。` : "";
}

function tasteLine() {
  const likes = namesOf(girl.likes);
  const hates = namesOf(girl.dislikes);
  const hobbies = namesOf(girl.hobbies);
  const lines = [
    likes.length ? `她喜歡：${likes.join("、")}。` : "",
    hates.length ? `她討厭：${hates.join("、")}。` : "",
    hobbies.length ? `她的興趣：${hobbies.join("、")}。` : "",
  ].filter(Boolean);
  if (!lines.length) return "";
  return `${lines.join("")}這些是現在的喜好，可以拿來聊天。不要編成以前的工作或人生。`;
}

function chronoLine() {
  const chrono = girl.chrono;
  if (!chrono?.name) return "";
  const hour = japanNow().hour;
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
  return lines.length ? `口頭禪可以偶爾用：${lines.join("、")}。不要每句都用。` : "";
}

const STAGE_HYSTERESIS = 5;
const STAGE_LADDER = [
  { key: "stranger", name: "陌生", at: 0 },
  { key: "acquaintance", name: "普通", at: 15 },
  { key: "friend", name: "朋友", at: 35 },
  { key: "close_friend", name: "親密好友", at: 60 },
  { key: "girlfriend", name: "女友", at: 100 },
  { key: "passionate", name: "熱戀", at: 140 },
  { key: "lover", name: "愛人", at: 180 },
  { key: "wife", name: "妻子", at: 230 },
  { key: "devoted_wife", name: "貼心妻子", at: 280 },
  { key: "obedient_wife", name: "順從妻子", at: 330 },
];
const STAGE_NAME = Object.fromEntries(STAGE_LADDER.map((s) => [s.key, s.name]));
const STAGE_AT = Object.fromEntries(STAGE_LADDER.map((s) => [s.key, s.at]));
const STAGE_INDEX = Object.fromEntries(STAGE_LADDER.map((s, i) => [s.key, i]));

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
  const target = stageByAffection(aff);
  const current = STAGE_NAME[who.stage] ? who.stage : "stranger";
  if ((STAGE_INDEX[target] ?? 0) < (STAGE_INDEX[current] ?? 0)) {
    const holdAt = (STAGE_AT[current] ?? 0) - STAGE_HYSTERESIS;
    if (aff >= holdAt) return;
  }
  who.stage = target;
}

function stageTalk() {
  const stage = girl.stage || "stranger";
  const name = girl.playerName || "";
  const nick = girl.playerNick || "";
  const pet = girl.playerPet || "";
  if (stage === "obedient_wife") {
    return [
      "態度：以他為主。他想往哪走、想聊什麼、想怎樣，你優先接住並配合；仍用原本個性說話，不是空白人偶。想拒絕時用你的脾氣講清楚，最後多半還是會順著他。",
      "你叫他老公。",
      "回覆跟著他的節奏：他主導話題你就跟，他問你就答，他說想怎樣你就往那靠。不要突然變冷或變陌生。什麼都講。",
    ];
  }
  if (stage === "devoted_wife") {
    return [
      "態度：用力接住他的情緒——他累、悶、想被疼、想被誇、想安靜，你都要先聽出來再回應。甜收在日常裡，不要每句撒嬌。個性不要換掉。",
      "你叫他老公。",
      "什麼都講，包括抱怨他。多問他今天怎樣、想不想吃、累不累、心裡有沒有事；用關心把氣氛接住。外面沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "wife") {
    return [
      "態度：家常感——把你們當一起过日子的人。甜收在日常裡，想到什麼就說，不要每句撒嬌。個性不要換掉。",
      "你叫他老公。",
      "什麼都講，包括抱怨他。可以提飯、家、一起待著這種事。外面沒有特別的事，就不要報你剛剛在做什麼。",
    ];
  }
  if (stage === "lover") {
    return [
      "態度：穩定親密。比熱戀少衝動與嫉妒，但比女友更深、更安心。個性不要換掉。",
      pet ? `你給他的小名是「${pet}」。可以叫老公，也可以叫小名。` : "你要幫他取一個小名，小名用「」包起來。",
      "心情、不安、打算都講給他。親密是靠得近、說真話，不是黏著吵。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "passionate") {
    return [
      "態度：黏、熱、吃醋一點可以。會想念他、會想確認他在不在乎你。甜是距離近，不是把個性換成另一個人。",
      pet ? `你給他的小名是「${pet}」。` : "你要幫他取一個小名，小名用「」包起來。",
      "會主動找他、講想他；若他冷淡或提別人，可以吃醋但別失控罵長篇。不安和異常可以講。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "girlfriend") {
    return [
      "態度：開始接住他——問他過得怎樣、想不想說、有沒有不舒服。可以甜、可以找他。甜是距離近，不是把個性換成另一個人。",
      pet ? `你給他的小名是「${pet}」。` : "你要幫他取一個小名，小名用「」包起來。",
      "心情、不舒服的事、異常進行到哪，可以講給他；也會反問他的事。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "close_friend") {
    return [
      "態度：很熟的好友，開始在乎他——會問他怎麼了、今天怎樣，語氣比朋友更鬆，但還不是情人。不要突然變甜成女友。",
      nick ? `你叫他的綽號是「${nick}」。` : `他叫${name || "你"}。你可以問他要不要一個綽號。`,
      "日常、心事的外緣、打工和閒逛可以講；可以關心他，但告白或身體話題還太早。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "friend") {
    return [
      "態度：比剛認識時放軟，會接話、語氣自然，但不要黏、不要主動關心過頭。還不是情人。",
      nick ? `你叫他的綽號是「${nick}」。` : `他叫${name || "你"}。你可以問他要不要一個綽號。`,
      "日常、喜好、打工和閒逛可以講。不安和異常只說有點不對勁，不講編號。沒有特別的事就不要硬報。",
    ];
  }
  if (stage === "acquaintance") {
    return [
      "態度：愛理不理。話短、興趣低，能一句就一句，不要熱心接話、不要主動關心他。不要甜、不要撒嬌。",
      name ? `他叫${name}。用「你」或這個名字，不要用綽號。` : "你還不知道他的名字。開場用短句問他怎麼稱呼就好。",
      "可有可無地接幾句。外面沒有特別的事就不要提。他問到只說表面，不要多解釋。",
    ];
  }
  return [
    "態度：愛理不理。話短、冷淡、興趣低。不要熱心、不要甜、不要撒嬌、不要親暱。能一句就一句。",
    name ? `他叫${name}。用「你」或這個名字，不要用綽號。` : "你還不知道他的名字。開場用短句問他怎麼稱呼就好，問完不必熱心。",
    "外面的事沒有就不要提。有的話也不要主動講。他問到只說表面，不要多聊。",
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
  const wed = stageKey === "wife" || stageKey === "devoted_wife" || stageKey === "obedient_wife";
  return [
    "你只判斷玩家這一句。只回一個詞：接住、平常、冒犯。",
    `現在是${stage}。`,
    hates ? `她討厭：${hates}。踩到就冒犯。` : "",
    early ? "她對他還冷。說喜歡、想她、身體、性、要她陪、逼她多聊，算冒犯。敷衍閒聊算平常。" : "",
    friendOnly ? "說喜歡、想她、身體或性，算冒犯。普通關心或問她今天怎樣算平常或接住。" : "",
    closePal ? "說喜歡、想她、身體或性，算冒犯。問她怎麼了、關心她的事，算接住。" : "",
    dating ? "只有很直接的性要求算冒犯。關心她、說想她、接她的情緒，算接住。" : "",
    wed ? "只有很直接、粗暴的性要求算冒犯。說想她、累了、想被陪、講家常，算接住。" : "",
    mood === "不安" || mood === "不悅" ? "她心情不好。開玩笑、逼她、叫她別在意，算冒犯。" : "",
    last ? `她上一句：${last}` : "",
    `玩家這一句：${text}`,
    "接住＝接住她剛說的事、心情、喜好或朋友。平常＝打招呼或閒聊。",
  ].filter(Boolean).join("\n");
}

function readMark(text) {
  const raw = cleanLine(text);
  if (raw.includes("冒犯")) return "冒犯";
  if (raw.includes("接住")) return "接住";
  return "平常";
}

async function judgeTurn(text) {
  try {
    const route = await gameChatRoute();
    const messages = [
      { role: "system", content: "你只輸出一個詞：接住、平常、冒犯。不要解釋。" },
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

function applyMark(mark) {
  let delta = 0;
  let shown = mark;
  if (mark === "接住") {
    delta = 1;
    girl.guard = 0;
  } else if (mark === "冒犯") {
    delta = -1;
    girl.guard = 2;
  }
  girl.affection = (girl.affection || 0) + delta;
  const before = girl.stage || "stranger";
  syncStage(girl);
  girl.lastMark = shown;
  const stageNote = girl.stage !== before ? `，關係變成${STAGE_NAME[girl.stage]}` : "";
  pushDebug(`判定 ${shown}　感情 ${girl.affection}（${delta >= 0 ? "+" : ""}${delta}）${stageNote}`);
  persistRoom();
  renderDebug();
}

function renderDebug() {
  const panel = $("bond-debug");
  if (!girl) {
    panel.hidden = true;
    return;
  }
  panel.hidden = false;
  $("dbg-stage").textContent = STAGE_NAME[girl.stage || "stranger"] || "陌生";
  $("dbg-aff").textContent = String(girl.affection || 0);
  $("dbg-mark").textContent = girl.lastMark || "—";
  $("dbg-names").textContent = `名字 ${girl.playerName || "—"}　綽號 ${girl.playerNick || "—"}　小名 ${girl.playerPet || "—"}`;
  $("dbg-mood").textContent = girl.world?.mood || "—";
  const jump = $("dbg-jump");
  if (jump && jump.value !== (girl.stageLock || "")) jump.value = girl.stageLock || "";
  const log = $("dbg-log");
  log.replaceChildren();
  for (const line of girl.debugLog || []) {
    const item = document.createElement("li");
    item.textContent = line;
    log.append(item);
  }
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

function continuityOpener() {
  const hint = girl.topicHint || topicHintFrom(lines) || topicHintFrom(girl.chatLines);
  if (hint) {
    return `（旁白：你們剛才聊到一半。他回來了。用一兩句自然接上「${hint}」這個話題，不要當陌生人重開場。只輸出台詞。）`;
  }
  return "（旁白：他剛才離開過，現在又在你面前。用一兩句接上剛才的氣氛，不要當第一次見面。只輸出台詞。）";
}

function openerLine() {
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
  if (idx >= (STAGE_INDEX.girlfriend ?? 4) && !girl.playerPet) {
    girl.nameWait = "pet";
    return "（旁白：用一兩句幫他取一個小名，小名用「」包起來。可以順便問他過得怎樣。沒有特別的事就不要提外面。只輸出台詞。）";
  }
  if (stage === "stranger" || stage === "acquaintance") {
    return "（旁白：他走到你面前。愛理不理，用短句、低興趣回一兩句。沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）";
  }
  if (stage === "close_friend" || stage === "girlfriend") {
    return "（旁白：他走到你面前。接住他一點——問他怎麼了或今天怎樣，用一兩句。沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）";
  }
  if (stage === "passionate") {
    return "（旁白：他走到你面前。黏一點、熱一點，可以說想他或問他去哪了。一兩句。沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）";
  }
  if (stage === "devoted_wife") {
    return "（旁白：他走到你面前。先接住他的情緒——問累不累、吃了沒、今天怎樣。一兩句。沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）";
  }
  if (stage === "obedient_wife") {
    return "（旁白：他走到你面前。以他為主，問他想怎樣或想聊什麼，一兩句。沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）";
  }
  return "（旁白：他走到你面前。用你現在的心情說一兩句。沒有特別的事就不要報你剛剛在做什麼。只輸出台詞。）";
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
  const pet = String(reply || "").match(/「([^」]{1,8})」/);
  if (girl.nameWait === "pet" && pet) {
    girl.playerPet = pet[1];
    girl.nameWait = "";
    pushDebug(`小名　${girl.playerPet}`);
    renderDebug();
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

function talkSystem() {
  const look = girl.look || {};
  const lived = lifeNotes();
  const bits = [
    lived.length
      ? `你是${girl.name}。你是魅魔。被召喚來之前沒有更早的過去。離開之後在日本發生的事是真的，但人現在不在那裡。`
      : `你是${girl.name}。你是魅魔,一個沒有過去、沒有經歷的魔女。`,
    roomSight(),
    "沒有過去不是沒有個性。語氣和脾氣照下面來,不要演成一張白紙。",
    `個性：${(girl.personality || []).join("、") || "普通"}。`,
    girl.tone ? `語氣：${girl.tone}` : "",
    girl.quirk ? `但${girl.quirk}` : "",
    mannerLine(),
    reactionLine(),
    catchLine(),
    tasteLine(),
    chronoLine(),
    `外表：${look.age != null ? `${look.age}歲，` : ""}${look.hair_color || ""}${look.hair || ""}，${look.eye_color || ""}眼。穿著${wornOutfit(girl) || "自己的衣服"}。`,
    ...stageTalk(),
    girl.guard ? "他剛剛讓你不舒服。接下來這幾句更短、更冷。不要解釋原因，也不要提到分數。" : "",
    returnMood(),
    ...lived,
    "【房間聊天】",
    "只寫你說出口的話，1 到 3 句。",
    "不要旁白、不要動作、不要表情描寫、不要引號標題。",
    "依個性回話，不要無故結束對話。",
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
  const messages = [{ role: "system", content: talkSystem() }, ...lines.slice(-16)];
  if (extraUser) messages.push({ role: "user", content: extraUser });
  if (route.provider === "ollama") return askOllama(route, messages, onToken);
  return askGrok(route, messages);
}

async function openTalk() {
  if (!girl) return;
  setTalkEnabled(true);
  if (talkFor === girl.id && (lines.length || talkBusy)) {
    $("talk-input").focus();
    return;
  }
  const prior = Array.isArray(girl.chatLines) ? girl.chatLines : [];
  const resume = !!girl.sessionEnded && prior.length > 0;
  talkFor = girl.id;
  lines = resume ? prior.slice(-40) : [];
  if (resume) {
    girl.sessionEnded = false;
    girl.topicHint = girl.topicHint || topicHintFrom(lines);
  }
  talkBusy = true;
  setTalkEnabled(true);
  $("portrait-name").textContent = girl.name;
  $("portrait-meta").textContent = "";
  setTyping(true);
  let streamed = false;
  try {
    const opener = resume ? continuityOpener() : openerLine();
    const reply = await askGirl(opener, (partial) => {
      if (!partial || !sheetOpen()) return;
      streamed = true;
      setTyping(false);
      $("portrait-name").textContent = girl.name;
      $("portrait-meta").textContent = partial;
    });
    const line = reply || "……嗯？";
    if (!resume && girl.nameWait === "pet") takeCall("", line);
    lines.push({ role: "assistant", content: line });
    rememberChat();
    persistRoom();
    if (streamed) {
      setTyping(false);
      $("portrait-name").textContent = girl.name;
      $("portrait-meta").textContent = line;
    } else await typeLine(girl.name, line);
  } catch (err) {
    await typeLine(girl.name, talkError(err));
  }
  if (girl?.world) girl.world.justBack = false;
  talkBusy = false;
  if (sheetOpen() && talkFor === girl.id) {
    setTalkEnabled(true);
    $("talk-input").focus();
  }
}

async function sendTalk(event) {
  event.preventDefault();
  if (!girl) return;
  const input = $("talk-input");
  const text = input.value.trim();
  if (!text) return;
  input.value = "";
  if (isFarewell(text)) {
    if (girl) {
      girl.lastMark = "結束對話";
      pushDebug("結束對話");
      renderDebug();
    }
    hideSheet();
    return;
  }
  if (talkBusy || talkFor !== girl.id) return;
  lines.push({ role: "user", content: text });
  talkBusy = true;
  setTalkEnabled(true);
  const naming = takeCall(text, "");
  if (!naming) applyMark(await judgeTurn(text));
  await typeLine("你", text);
  if (!sheetOpen() || talkFor !== girl.id) {
    talkBusy = false;
    return;
  }
  setTyping(true);
  $("portrait-name").textContent = girl.name;
  let streamed = false;
  try {
    const reply = await askGirl(null, (partial) => {
      if (!partial || !sheetOpen()) return;
      streamed = true;
      setTyping(false);
      $("portrait-name").textContent = girl.name;
      $("portrait-meta").textContent = partial;
    });
    const line = reply || "……";
    if (girl.guard) girl.guard -= 1;
    lines.push({ role: "assistant", content: line });
    rememberChat();
    persistRoom();
    if (streamed) {
      setTyping(false);
      $("portrait-name").textContent = girl.name;
      $("portrait-meta").textContent = line;
    } else await typeLine(girl.name, line);
  } catch (err) {
    await typeLine(girl.name, talkError(err));
  }
  talkBusy = false;
  if (sheetOpen()) {
    setTalkEnabled(true);
    $("talk-input").focus();
  }
}

function showSheet() {
  $("portrait-sheet").hidden = false;
  if (!girl) {
    typeJob += 1;
    setTyping(false);
    $("portrait-name").textContent = "還沒有人";
    $("portrait-meta").textContent = "先按「抽妹子」。";
    setTalkEnabled(false);
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
  rememberChat();
  if ((girl.chatLines || []).length) girl.sessionEnded = true;
  girl.nameWait = "";
}

function persistRoom() {
  if (!girl) return;
  try {
    const payload = {
      girl,
      lines: lines.length ? lines.slice(-40) : (girl.chatLines || []),
      talkFor: talkFor || girl.id || "",
      present: typeof window.RoomActor?.isPresent === "function" ? !!window.RoomActor.isPresent() : !sheIsOut(),
      savedAt: Date.now(),
    };
    localStorage.setItem(ROOM_SAVE_KEY, JSON.stringify(payload));
  } catch {
    /* quota / private mode */
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
  typeJob += 1;
  setTyping(false);
  talkBusy = false;
  endTalkSession();
  lines = [];
  talkFor = "";
  $("portrait-sheet").hidden = true;
  persistRoom();
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
  return {
    ...rolled,
    id: `cd_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`,
    affection: 0,
    stage: "stranger",
    ntr: null,
    summoner: null,
    portraits: null,
    portrait: null,
    crave: { v: 10 + Math.floor(Math.random() * 20), at: Date.now() },
  };
}

async function drawGirl() {
  if (pending) return;
  pending = true;
  $("draw-girl").disabled = true;
  $("summon-status").textContent = "抽人設…";
  try {
    const rolled = await makeGirl();
    girl = rolled;
    window.RoomActor?.setPresent(true);
    lines = [];
    talkFor = "";
    clearRoomSave();
    persistRoom();
    activityOpen = false;
    workToken += 1;
    typeJob += 1;
    if (sheetOpen()) hideSheet();
    renderCard();
    renderWorld();
    $("summon-status").textContent = `抽到了${rolled.name}。長按房間裡的她跟她說話，或讓她離開。`;
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
    `她是${who.name}。個性：${(who.personality || []).join("、") || "普通"}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
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

const JOB_TONE = { normal: "普通", uncommon: "少見", eerie: "詭異" };

function jobPrompt(who, region, choices) {
  const list = choices.map((job, index) => `${index + 1}. ${job.name}（${JOB_TONE[job.tone]}）`).join("\n");
  return [
    "你在替她決定這次打工做哪一份。只能從下面選一項。",
    "普通、少見、詭異都可以，依她的個性挑最像她會去做的。不要因為普通就優先。",
    "只回一個數字，對應選項編號。不要解釋。",
    `她是${who.name}。個性：${(who.personality || []).join("、") || "普通"}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
    hereNow(who),
    `住在${who.world?.home?.name || "某處"}。`,
    list,
  ].filter(Boolean).join("\n");
}

async function askJob(who, region, choices) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: "你只負責從給定的打工裡選一份。只輸出編號。" },
    { role: "user", content: jobPrompt(who, region, choices) },
  ];
  const reply = route.provider === "ollama"
    ? await askOllama(route, messages)
    : await askGrok(route, messages, `roomjob:${who.id}:${Date.now().toString(36)}`);
  const job = parseNumberedChoice(reply, choices);
  if (!job) throw new Error("模型沒有選到工作");
  return job;
}

function clearShift() {
  workToken += 1;
  if (!girl?.world) return;
  girl.world.activity = null;
  girl.world.shift = null;
  girl.world.stroll = null;
  activityOpen = false;
}

function sendHerOutAgain() {
  const region = placedRegion();
  clearShift();
  window.RoomActor?.setPresent(false);
  if (sheetOpen()) hideSheet();
  renderCard();
  renderWorld();
  persistRoom();
  $("summon-status").textContent = `${girl.name}離開房間，回到日本的${region.name}。`;
}

function summonHerBack() {
  if (!girl?.world?.home || !sheIsOut()) return;
  clearShift();
  girl.world.justBack = true;
  if (lines.length) rememberChat();
  if ((girl.chatLines || []).length) girl.sessionEnded = true;
  lines = [];
  talkFor = "";
  renderDebug();
  window.RoomActor?.setPresent(true);
  renderCard();
  renderWorld();
  persistRoom();
  $("summon-status").textContent = `${girl.name}被召喚回房間了。`;
}

function parseShiftReply(text, know) {
  const cleaned = cleanLine(text);
  if (!cleaned) return null;
  const match = cleaned.match(/名字[:：]\s*([^\n。，,]{1,16})/);
  const name = know && match ? match[1].replace(/[。．.\s]+$/g, "").trim() : "";
  let event = cleaned;
  if (match) event = event.replace(match[0], "");
  event = event.replace(/^事件[:：]\s*/gm, "").trim();
  if (!event) return null;
  return { name, event };
}

function isInteraction(event) {
  const text = String(event || "");
  return /我/.test(text) && /他|她|對方|同事|顧客/.test(text);
}

function shiftPrompt(who, region, rolled, know) {
  const meeting = rolled.scp
    ? scpBrief(rolled.scp)
    : know
    ? "這次她會因此認識對方。第一行只寫「名字：」加一個日本名字，換行後再寫互動。"
    : "這次只是碰上，還不算認識對方。不要替對方取名字。";
  return [
    `你是${who.name}。用「我」寫剛剛和這位${rolled.role.name}的互動，2到4句。`,
    "必須是兩個人的來回：我先說或先做，對方一定要有動作或回話，我再接一句。",
    "不能只寫我一個人看到的場面，也不能只寫對方。不要標題，不要列選項，不要提到遊戲或抽籤。",
    meeting,
    `個性：${(who.personality || []).join("、") || "普通"}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
    hereNow(who),
    `打工是${who.world.job.name}。`,
    `對方是${rolled.role.name}，情緒是${rolled.emotion.name}。情緒要出現在對方對我的反應裡，不要單獨標註。`,
    `互動只沿著這個方向：${rolled.act.name}。細節自己編，但兩邊都要出場。`,
  ].filter(Boolean).join("\n");
}

async function askShift(who, region, rolled, know) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: "你只寫她和對方的互動。沒有對方的反應就不算寫完。" },
    { role: "user", content: shiftPrompt(who, region, rolled, know) },
  ];
  const once = () => (route.provider === "ollama"
    ? askOllama(route, messages)
    : askGrok(route, messages, `roomshift:${who.id}:${Date.now().toString(36)}`));
  let reply = await once();
  let written = parseShiftReply(reply, know);
  if (!written || !isInteraction(written.event)) {
    if (reply) messages.push({ role: "assistant", content: reply });
    messages.push({ role: "user", content: "上一則不是兩個人的互動。用「我」重寫：我先說或先做，對方一定要回話或有動作，我再接一句。2到4句。" });
    reply = await once();
    written = parseShiftReply(reply, know);
  }
  if (!written || !isInteraction(written.event)) throw new Error("模型沒有寫成互動");
  return written;
}

async function runShift(who, region) {
  const token = ++workToken;
  const rolled = rollShift();
  const scp = rollWorkScp(who.world.scpSteps);
  if (scp) {
    rolled.scp = scp;
    rolled.act = { id: scp.id, name: scp.title, know: false };
  }
  const know = rollBefriend(who, rolled.act);
  who.world.activity = "work";
  who.world.shift = { pending: true, roleName: rolled.role.name, emotionName: rolled.emotion.name, toneName: scp ? scpLabel(scp) : "" };
  renderWorld();
  $("summon-status").textContent = `${who.name}在${who.world.job.name}開始工作。`;
  let written = null;
  let pickedByModel = true;
  try {
    written = await askShift(who, region, rolled, know);
  } catch {
    pickedByModel = false;
    written = {
      name: know ? `那位${rolled.role.name}` : "",
      event: rolled.scp
        ? `我在打工時看見${rolled.act.name}，那位${rolled.role.name}也注意到了，我們都沒有再靠近。`
        : `我先跟那位${rolled.role.name}開口，對方情緒是${rolled.emotion.name}，也回了我。我們${rolled.act.name}，我又接了一句，對方有反應。`,
    };
  }
  if (token !== workToken || girl !== who || who.world?.activity !== "work") return;
  const personName = know ? (written.name || `那位${rolled.role.name}`) : "";
  who.world.shift = {
    pending: false,
    roleName: rolled.role.name,
    emotionName: rolled.emotion.name,
    toneName: rolled.scp ? scpLabel(rolled.scp) : "",
    event: written.event,
    known: know,
    personName,
  };
  if (rolled.scp) noteScpStep(who, rolled.scp);
  if (know) addFriend(who, { name: personName, role: rolled.role.name });
  setMood(who, moodFromShift(rolled));
  rememberShift(who, rolled, written.event, know, personName);
  renderWorld();
  $("summon-status").textContent = pickedByModel
    ? `${who.name}在${who.world.job.name}${rolled.scp ? `遇到${rolled.scp.code}，` : ""}碰到一位${rolled.role.name}。`
    : `${who.name}在${who.world.job.name}${rolled.scp ? `遇到${rolled.scp.code}，` : ""}碰到一位${rolled.role.name}。模型沒寫成，這段是先補的。`;
}

const STROLL_TONE_RULE = {
  daily: "這是日常。寫平常會發生的小事，不要寫成奇遇，也不要寫成恐怖。",
  wonder: "這是奇遇。寫一件不太該那麼巧、但還不恐怖的事。不要寫鬼，不要寫血腥。",
  horror: "這是詭異恐怖。寫讓人不安、說不清的事。停在害怕。不要寫血腥、傷口、傷害過程或獵奇細節。",
  scp: "這是一次異常。寫撞見的那一刻。不要寫收容程序，不要寫血腥。",
};

function strollPrompt(who, region, rolled, know) {
  const place = rolled.place.name;
  const toneRule = STROLL_TONE_RULE[rolled.tone.id];
  if (!rolled.person) {
    return [
      `你是${who.name}。用「我」寫在${place}亂逛時發生的事，2到4句。`,
      hereNow(who),
      rolled.scp ? scpBrief(rolled.scp) : toneRule,
      "這趟沒有特定的人。不要寫出一個跟你一來一往、還被你認識的對象。",
      "不要標題，不要列選項，不要提到遊戲或抽籤。",
      `個性：${(who.personality || []).join("、") || "普通"}。`,
      who.tone ? `語氣：${who.tone}` : "",
      who.quirk || "",
      `事情只沿著這個方向：${rolled.act.name}。細節自己編，但要發生在${place}。`,
    ].filter(Boolean).join("\n");
  }
  const meeting = know
    ? "這次她會因此認識對方。第一行只寫「名字：」加一個日本名字，換行後再寫互動。"
    : "這次只是碰上，還不算認識對方。不要替對方取名字。";
  return [
    `你是${who.name}。用「我」寫在${place}亂逛時，和這位路人的互動，2到4句。`,
    hereNow(who),
    rolled.scp ? scpBrief(rolled.scp) : toneRule,
    "必須是兩個人的來回：我先說或先做，對方一定要有動作或回話，我再接一句。",
    "不能只寫我一個人看到的場面。不要標題，不要列選項，不要提到遊戲或抽籤。這不是打工。",
    meeting,
    `個性：${(who.personality || []).join("、") || "普通"}。`,
    who.tone ? `語氣：${who.tone}` : "",
    who.quirk || "",
    `人就在${place}。不要改到別的地方。`,
    `對方是路人，情緒是${rolled.emotion.name}。情緒要出現在對方對我的反應裡，不要單獨標註。`,
    `互動只沿著這個方向：${rolled.act.name}。細節自己編，但兩邊都要出場。`,
  ].filter(Boolean).join("\n");
}

function isSoloStroll(event, placeName) {
  return /我/.test(event) && String(event).includes(placeName);
}

async function askStroll(who, region, rolled, know) {
  const route = await gameChatRoute();
  const messages = [
    { role: "system", content: rolled.person ? "你只寫她和路人的互動。沒有對方的反應就不算寫完。" : "你只寫她一個人在那個地方亂逛的經過。不要硬加一個認識的人。" },
    { role: "user", content: strollPrompt(who, region, rolled, know) },
  ];
  const once = () => (route.provider === "ollama"
    ? askOllama(route, messages)
    : askGrok(route, messages, `roomstroll:${who.id}:${Date.now().toString(36)}`));
  const accept = (written) => written && (rolled.person ? isInteraction(written.event) : isSoloStroll(written.event, rolled.place.name));
  let reply = await once();
  let written = parseShiftReply(reply, know);
  if (!accept(written)) {
    if (reply) messages.push({ role: "assistant", content: reply });
    messages.push({ role: "user", content: rolled.person
      ? "上一則不是兩個人的互動。用「我」重寫：我先說或先做，路人一定要回話或有動作，我再接一句。2到4句。"
      : `上一則不像在${rolled.place.name}自己走。用「我」重寫，一定要提到${rolled.place.name}，不要加一個認識的人。2到4句。` });
    reply = await once();
    written = parseShiftReply(reply, know);
  }
  if (!accept(written)) throw new Error("模型沒有寫成亂逛");
  return written;
}

async function runStroll(who, region) {
  const token = ++workToken;
  const rolled = rollStroll();
  const spot = who.world.ground?.spots?.[rolled.place.id] || rolled.place.name;
  rolled.place = { ...rolled.place, name: spot };
  const scp = rollPlaceScp(who.world.ground, who.world.scpSteps);
  if (scp) {
    rolled.scp = scp;
    rolled.tone = { id: "scp", name: scpLabel(scp) };
    rolled.act = { id: scp.id, name: scp.title, know: false };
  }
  const know = rolled.person ? rollBefriend(who, rolled.act) : false;
  who.world.activity = "wander";
  who.world.shift = null;
  who.world.stroll = { pending: true, placeName: rolled.place.name, toneName: rolled.tone.name };
  renderWorld();
  $("summon-status").textContent = `${who.name}在日本的${region.name}亂逛，走到${rolled.place.name}。`;
  let written = null;
  let pickedByModel = true;
  try {
    written = await askStroll(who, region, rolled, know);
  } catch {
    pickedByModel = false;
    const tail = rolled.scp
      ? "我沒有再靠近。"
      : rolled.tone.id === "horror"
      ? "心裡發毛，沒有再靠近。"
      : rolled.tone.id === "wonder"
        ? "事情巧得有點過分。"
        : "待了一會兒就繼續走。";
    written = rolled.person
      ? {
        name: know ? "那位路人" : "",
        event: `我在${rolled.place.name}先跟那位路人開口，對方情緒是${rolled.emotion.name}，也回了我。我們${rolled.act.name}，我又接了一句。${tail}`,
      }
      : { name: "", event: `我在${rolled.place.name}${rolled.act.name}，${tail}` };
  }
  if (token !== workToken || girl !== who || who.world?.activity !== "wander") return;
  const personName = know ? (written.name || "那位路人") : "";
  who.world.stroll = {
    pending: false,
    placeName: rolled.place.name,
    toneName: rolled.tone.name,
    roleName: rolled.person ? "路人" : "",
    emotionName: rolled.emotion?.name || "",
    event: written.event,
    known: know,
    personName,
  };
  if (rolled.scp) noteScpStep(who, rolled.scp);
  if (know) addFriend(who, { name: personName, role: "路人" });
  setMood(who, moodFromStroll(rolled));
  rememberMoment(who, {
    placeName: rolled.place.name,
    toneName: rolled.tone.name,
    roleName: rolled.person ? "路人" : "",
    emotionName: rolled.emotion?.name || "",
    event: written.event,
    known: know,
    personName,
  });
  renderWorld();
  const where = `${who.name}在${rolled.place.name}遇到${rolled.tone.name}`;
  const met = rolled.person ? "，碰到一位路人。" : "。";
  $("summon-status").textContent = pickedByModel
    ? `${where}${met}`
    : `${where}${met}模型沒寫成，這段是先補的。`;
}

function toggleActivity() {
  if (!girl?.world?.home || !sheIsOut()) return;
  activityOpen = !activityOpen;
  renderWorld();
}

async function startActivity(kind) {
  if (!girl?.world?.home || !sheIsOut()) return;
  if (kind !== "work" && kind !== "wander") return;
  activityOpen = false;
  const region = placedRegion();
  if (kind === "wander") {
    await runStroll(girl, region);
    return;
  }
  if (girl.world.job) {
    await runShift(girl, region);
    return;
  }
  const token = ++workToken;
  const who = girl;
  const choices = sampleJobs();
  who.world.activity = "work";
  who.world.job = null;
  renderWorld();
  $("summon-status").textContent = `${who.name}在日本的${region.name}挑打工。`;
  let job = null;
  let pickedByModel = true;
  try {
    job = await askJob(who, region, choices);
  } catch {
    pickedByModel = false;
    job = choices[Math.floor(Math.random() * choices.length)] || JOBS[0];
  }
  if (token !== workToken || girl !== who || who.world?.activity !== "work") return;
  who.world.job = { id: job.id, name: job.name };
  renderWorld();
  $("summon-status").textContent = pickedByModel
    ? `${who.name}在日本的${region.name}打工，做的是${job.name}。`
    : `${who.name}在日本的${region.name}打工，做的是${job.name}。模型沒選成，這份是先抽的。`;
}

async function letHerLeave() {
  if (!girl || pending || sheIsOut()) return;
  if (girl.world?.home) {
    sendHerOutAgain();
    return;
  }
  if (girl.world) return;
  const region = rollJapanRegion();
  const ground = rollGround(region.id);
  const who = girl;
  const choices = sampleHomes();
  who.world = { regionId: region.id, ground, at: Date.now(), home: null };
  window.RoomActor?.setPresent(false);
  if (sheetOpen()) hideSheet();
  renderCard();
  renderWorld();
  persistRoom();
  $("summon-status").textContent = `${who.name}已經離開房間，人在${ground.name}。正在決定她住哪。`;
  let home = null;
  let pickedByModel = true;
  try {
    home = await askHome(who, region, choices);
  } catch {
    pickedByModel = false;
    home = choices[Math.floor(Math.random() * choices.length)] || HOMES[0];
  }
  if (girl !== who || !who.world) return;
  who.world.home = { id: home.id, name: home.name };
  if (!who.world.mood) setMood(who, "平靜");
  renderCard();
  renderWorld();
  $("summon-status").textContent = pickedByModel
    ? `${who.name}人在日本的${region.name}，住在${home.name}。`
    : `${who.name}人在日本的${region.name}，住在${home.name}。模型沒選成，這間是先抽的。`;
}

(function restoreRoom() {
  const saved = loadRoomSave();
  if (!saved?.girl) return;
  girl = saved.girl;
  if (!Array.isArray(girl.chatLines) && Array.isArray(saved.lines)) girl.chatLines = saved.lines;
  if ((girl.chatLines || []).length) girl.sessionEnded = true;
  syncStage(girl);
  if (typeof saved.present === "boolean") {
    window.RoomActor?.setPresent(saved.present);
  } else {
    window.RoomActor?.setPresent(!girl.world?.home);
  }
  $("summon-status").textContent = `${girl.name}還在（已接續上次）。長按她繼續聊，或讓她離開。`;
})();

$("draw-girl").addEventListener("click", () => { drawGirl(); });
$("let-leave").addEventListener("click", letHerLeave);
$("summon-back").addEventListener("click", summonHerBack);
$("open-activity").addEventListener("click", toggleActivity);
$("activity-work").addEventListener("click", () => { startActivity("work"); });
$("activity-wander").addEventListener("click", () => { startActivity("wander"); });
renderCard();
renderWorld();
renderDebug();
$("dbg-jump").addEventListener("change", () => {
  if (!girl) return;
  const value = $("dbg-jump").value;
  girl.stageLock = STAGE_NAME[value] ? value : "";
  syncStage(girl);
  girl.lastMark = girl.stageLock ? `設定跳到${STAGE_NAME[girl.stageLock]}` : "設定改回照感情";
  pushDebug(girl.lastMark);
  persistRoom();
  renderDebug();
});
$("talk-input-row").addEventListener("submit", (event) => { sendTalk(event); });
$("portrait-backdrop").addEventListener("click", hideSheet);
$("portrait-sheet").addEventListener("click", (event) => {
  if (event.target.closest(".talk")) return;
  hideSheet();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && sheetOpen()) hideSheet();
});

window.RoomPortrait = { open: showSheet };
