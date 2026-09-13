/** 約會胃口：跟場地無關。個性決定「想怎麼過這段時間」，場地只負責翻譯成這裡能做的事。 */

export const APPETITES = {
  gaze: {
    id: "gaze",
    zh: "看",
    want: "把時間花在眼前的畫面、光、風景、陳列上。停下來看，用台詞講你看見的。",
  },
  wander: {
    id: "wander",
    zh: "逛",
    want: "對空間本身有興趣：走動、換角度看、想去下一處。不是無目的遊蕩。",
  },
  talk: {
    id: "talk",
    zh: "聊",
    want: "注意力放在對方身上。找能坐下或並肩停住的地方說話。",
  },
  play: {
    id: "play",
    zh: "玩",
    want: "動手參加場地能玩的事，不要只站著看。",
  },
  consume: {
    id: "consume",
    zh: "吃挑",
    want: "對吃的、喝的、能買能挑的東西有興趣。",
  },
};

const ARCH_WEIGHTS = {
  活潑開朗: { wander: 3, play: 3, talk: 2 },
  高冷: { gaze: 4, talk: 1 },
  傲嬌: { talk: 3, wander: 2 },
  文靜溫柔: { gaze: 3, talk: 3 },
  天然呆: { wander: 2, play: 2, talk: 2, gaze: 1 },
  御姊: { talk: 3, gaze: 2, consume: 1 },
  病嬌: { talk: 4 },
  淫蕩放蕩: { wander: 2, talk: 2, play: 1 },
  "抖M 受虐": { talk: 3, gaze: 1 },
  "抖S 施虐": { talk: 3, wander: 1 },
  癡女主動: { play: 2, wander: 2, talk: 2 },
  清純反差: { gaze: 3, talk: 2 },
  人妻風味: { talk: 3, consume: 2 },
  露出癖: { wander: 3, play: 2 },
  痴漢容忍型: { gaze: 2, talk: 2 },
  精液中毒: { talk: 2, wander: 2 },
  妊娠渴望: { talk: 3, consume: 1 },
  "多P 開放": { wander: 3, play: 2, talk: 2 },
  嗜虐嬌喘: { talk: 2, gaze: 1 },
  女王様: { talk: 3, gaze: 2 },
  悶騷內衣控: { gaze: 2, wander: 2, talk: 1 },
  "NTR 癖好": { talk: 3, wander: 1 },
};

const VIBE_WEIGHTS = {
  文靜: { gaze: 2, talk: 2 },
  文藝: { gaze: 3, talk: 1 },
  活潑: { play: 3, wander: 2 },
  居家: { talk: 3, consume: 1 },
  時髦: { wander: 3, consume: 2, gaze: 1 },
};

const TEXT_HINTS = [
  { re: /攝影|拍立得|畫畫|美術館|電影|星空|看海|插花|明信片|黑膠|盆栽|煙火|下雨/, k: "gaze", w: 3 },
  { re: /逛選物|選物店|二手書店|咖啡巡禮|蒐集穿搭|指甲彩繪/, k: "wander", w: 3 },
  { re: /唱歌|衝浪|羽球|登山|街舞|露營|潛水|夜騎|桌遊|夜跑/, k: "play", w: 3 },
  { re: /甜點|烘焙|手沖咖啡|熱可可|草莓|抹茶|紅酒|宵夜/, k: "consume", w: 3 },
  { re: /手帳|拼圖|泡茶|追劇|寫鋼筆/, k: "talk", w: 2 },
];

const EMPTY = { gaze: 0, wander: 0, talk: 0, play: 0, consume: 0 };

function addScore(dst, src, mul = 1) {
  if (!src) return;
  for (const [k, v] of Object.entries(src)) {
    if (dst[k] == null) continue;
    dst[k] += (Number(v) || 0) * mul;
  }
}

function blobOf(girl) {
  const bits = [
    ...(girl?.personality || []),
    girl?.archetype,
    ...(girl?.hobbies || []),
    ...(girl?.likes || []),
  ];
  return bits.filter(Boolean).join("、");
}

function ranked(scores) {
  return Object.keys(APPETITES)
    .map((k) => [k, scores[k] || 0])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
}

export function dateStyleOf(girl) {
  const scores = { ...EMPTY };
  const reasons = [];
  const names = [
    ...(girl?.personality || []),
    girl?.archetype,
  ].filter(Boolean);

  let hitArch = false;
  for (const n of names) {
    if (ARCH_WEIGHTS[n]) {
      addScore(scores, ARCH_WEIGHTS[n]);
      const top = ranked(ARCH_WEIGHTS[n])[0];
      reasons.push(`個性「${n}」偏${APPETITES[top[0]].zh}`);
      hitArch = true;
      break;
    }
  }
  if (!hitArch) addScore(scores, { talk: 2, wander: 1 });

  const vibes = girl?.hobby_vibes || [];
  for (const v of vibes) addScore(scores, VIBE_WEIGHTS[v], 0.6);

  const blob = blobOf(girl);
  for (const h of TEXT_HINTS) {
    if (h.re.test(blob)) {
      scores[h.k] += h.w;
      reasons.push(`${APPETITES[h.k].zh}向興趣／喜好`);
    }
  }

  const st = girl?.stats || {};
  if ((st.shyness || 0) >= 60) {
    scores.gaze += 1;
    scores.wander -= 1;
  }
  if ((st.proactivity || 0) >= 70) {
    scores.wander += 1;
    scores.play += 1;
  } else if ((st.proactivity || 50) <= 35) {
    scores.gaze += 1;
    scores.talk += 1;
    scores.wander -= 1;
  }

  for (const k of Object.keys(scores)) {
    if (scores[k] < 0) scores[k] = 0;
  }
  const order = ranked(scores);
  const primary = order[0][0];
  const secondary = order[1][1] > 0 && order[1][0] !== primary ? order[1][0] : "";
  return {
    scores,
    primary,
    secondary,
    primaryZh: APPETITES[primary].zh,
    secondaryZh: secondary ? APPETITES[secondary].zh : "",
    reasons: reasons.slice(0, 3),
  };
}

function zoneScore(zone, k) {
  return Number(zone?.score?.[k] || 0);
}

function bestLink(links, k) {
  let best = null;
  for (const L of links || []) {
    const n = Number(L.score?.[k] || 0);
    if (!best || n > best.score) best = { id: L.id, name: L.name, score: n };
  }
  return best;
}

function pickActive(style, zone, links) {
  const cand = [style.primary, style.secondary].filter(Boolean);
  for (const k of cand) {
    const here = zoneScore(zone, k);
    const near = bestLink(links, k);
    if (here > 0 || (near && near.score > 0)) return k;
  }
  const hereBest = ranked(zone?.score || EMPTY)[0];
  if (hereBest && hereBest[1] > 0) return hereBest[0];
  return style.primary;
}

/**
 * 把她的胃口對上「這一格場地提供什麼」。
 * zone: { score, do, transit? }  由場地腳本提供，不是寫死在個性裡。
 */
export function matchDateMoment({
  style,
  zoneId,
  zoneName,
  venueName = "",
  zone,
  links = [],
  stay = 0,
  arriving = false,
} = {}) {
  const active = pickActive(style, zone, links);
  const here = zoneScore(zone, active);
  const pull = bestLink(links, active);
  const doHere = zone?.do?.[active] || {};
  const foci = (doHere.foci || []).slice();
  const transit = !!zone?.transit;
  let allowWalk = false;
  let walkWhy = "";
  if (!arriving) {
    if (transit && pull && pull.score > here) {
      allowWalk = true;
      walkWhy = "這裡只是過路";
    } else if (here <= 0 && pull && pull.score > 0) {
      allowWalk = true;
      walkWhy = "你想做的事不在這一區";
    } else if (active === "wander" && stay >= 1) {
      allowWalk = true;
      walkWhy = "你是會逛的人，這裡已經看過一拍";
    } else if (pull && pull.score >= here + 2 && stay >= 2) {
      allowWalk = true;
      walkWhy = "相鄰那區更對你的胃口";
    } else if (stay >= 3) {
      allowWalk = true;
      walkWhy = "這裡待夠了，可以換一處再做同一件事";
    }
  }
  const pullBetter = !!(pull && pull.score > here);
  return {
    style,
    active,
    activeZh: APPETITES[active].zh,
    here,
    pull: pullBetter ? pull : null,
    allowWalk,
    walkWhy,
    walkOnlyPull: allowWalk && pullBetter && active !== "wander" && stay < 3,
    foci,
    doText: doHere.text || APPETITES[active].want,
    zoneId,
    zoneName,
    venueName,
    stay,
    arriving,
  };
}

export function dateStylePromptLines(moment) {
  const s = moment?.style;
  if (!s) return [];
  const a = APPETITES[moment.active] || APPETITES.talk;
  const pair = s.secondaryZh ? `${s.primaryZh}（主）／${s.secondaryZh}（次）` : s.primaryZh;
  const why = s.reasons.length ? `（${s.reasons.join("；")}）` : "";
  const lines = [
    "【約會胃口——跟場地無關】",
    `你過約會的方式＝${pair}${why}。`,
    a.want,
    "換電影院、百貨、KTV、海邊也還是這套：想看的人盯畫面／櫥窗／海；想逛的人走動換點；想聊的人找能坐下的地方說話；想玩的人參加場地能玩的事。不要因為換地方就變成每一拍換區。",
    `【此刻】${moment.venueName ? moment.venueName + "·" : ""}${moment.zoneName || ""}。這一拍要用「${moment.activeZh}」過。`,
    `這裡：${moment.doText}`,
  ];
  if (moment.foci?.length) {
    lines.push(`先對準：${moment.foci.map((f) => `看 ${f}`).join("／")}，或坐下來。用台詞講你看見／想做的，不要只換區。`);
  } else if (moment.active === "talk") {
    lines.push("指令優先：坐、說、看 他。把話聊下去。");
  } else if (moment.active === "wander") {
    lines.push("可以走動，但每一區至少看一眼或說一句再走。禁止連續換區當唯一行動。");
  }
  if (moment.arriving) {
    lines.push("你剛到。這一拍先打招呼／看這裡，不要立刻換區。");
  } else if (!moment.allowWalk) {
    lines.push("禁止這一拍用「走」。遊蕩不是約會。待在這裡做你想做的。玩家用「提議」換區，你不想去就拒絕並用胃口解釋。");
  } else if (moment.walkOnlyPull && moment.pull) {
    lines.push(
      `可以走，但只准往更對味的「${moment.pull.name}」（${moment.walkWhy}）。到了就停下做「${moment.activeZh}」，不要再一路換區。`,
    );
  } else {
    lines.push(`可以換區（${moment.walkWhy}）。仍帶著「${moment.activeZh}」走，不要無目的亂走。`);
  }
  return lines;
}

export function girlWalkExits(moment, allExits) {
  const exits = allExits || [];
  if (!moment?.allowWalk) return [];
  if (moment.walkOnlyPull && moment.pull?.name) {
    return exits.includes(moment.pull.name) ? [moment.pull.name] : exits;
  }
  return exits;
}

export function girlLookSamples(moment, { withPlayer = false } = {}) {
  const look = ["看 這裡"];
  if (withPlayer) look.push("看 他");
  for (const f of (moment?.foci || []).slice(0, 3)) look.push(`看 ${f}`);
  return look;
}
