/** 公園場地腳本：區域／時段模板 + 異常裁判。旁白只寫「此刻這一區」。 */

export const PARK_TIME_ZH = {
  morning: "早上",
  dusk: "黃昏",
  night: "深夜",
  afternoon: "黃昏",
  evening: "黃昏",
};

/** 相鄰才走得到，不能瞬移。入口接廣場／遊戲區／步道；遊戲區接廁所。 */
export const PARK_LINKS = {
  gate: ["plaza", "playground", "path"],
  plaza: ["gate", "path", "playground"],
  playground: ["gate", "plaza", "path", "toilet"],
  toilet: ["playground"],
  path: ["gate", "plaza", "playground", "pond", "woods"],
  pond: ["path", "woods"],
  woods: ["path", "pond"],
};

export const PARK_ZONES = {
  gate: {
    id: "gate",
    name: "入口",
    foci: ["大門", "公告欄", "停車棚"],
    desc:
      "公園正門。鐵柵欄、公告欄和一小片停車棚。往裡走才分出廣場、兒童遊戲區和主步道。人從這裡進出，站在門口能同時看見馬路與園內空地。",
  },
  plaza: {
    id: "plaza",
    name: "廣場",
    foci: ["長椅", "路燈", "孤立的老樹"],
    desc:
      "最開闊的空地，有長椅、路燈與一棵孤立的老樹。白天是交會點，晚上燈一亮就顯得更大、更空。這裡是看起來最正常的區域，被追時相對容易被人看見。",
  },
  path: {
    id: "path",
    name: "步道",
    foci: ["矮燈", "沿路椅子", "轉角"],
    desc:
      "連接各區的主路，沿路有矮燈與間距不一的椅子。用步道表現移動：人聲變稀、燈光變少、地面從乾淨水泥變成有落葉。深夜要寫回音與背後是否有腳步。",
  },
  pond: {
    id: "pond",
    name: "水池",
    foci: ["池岸", "濕石頭", "被踩歪的警示牌"],
    desc:
      "老舊水泥池岸，水面偏綠，風來時有一層薄膜似的波紋。對岸步道隱約可見，池邊石頭濕滑，有青苔和被踩歪的警示牌。白天能看見水底影子；光線一斜，水面就變成看不透的深色。",
  },
  toilet: {
    id: "toilet",
    name: "廁所",
    foci: ["廁所門", "洗手台鏡子", "窄走道"],
    desc:
      "一棟矮的公共廁所，門板會晃，裡頭有水箱與潮味，燈管時亮時暗。男女側入口分開，洗手台的鏡子有水垢。外面走道窄，站在門口能同時聽到裡面滴水與公園深處的風。",
  },
  playground: {
    id: "playground",
    name: "兒童遊戲區",
    foci: ["溜滑梯", "鞦韆", "沙坑"],
    desc:
      "溜滑梯、鞦韆、沙坑和一圈褪色欄杆。地面是橡膠墊，陽光下會反光。這個區域只承接生活聲：小孩跑跳、家長叫名字、塑膠座椅晃動。任何時段都不得在此轉入成人向或超自然傷害事件。",
  },
  woods: {
    id: "woods",
    name: "樹林區",
    foci: ["樹叢", "變細的步道", "腐葉地面"],
    desc:
      "樹冠擋住大部分天空，地面有腐葉與潮土。步道在林子裡變細，三步外人影就開始模糊。能聽見外面廣場的聲音，但從外面不容易看進林裡。適合寫抄近路與視線死角，不要預設一進林就出事。",
  },
};

/**
 * 這一區提供哪種約會胃口、人在這裡實際做什麼。
 * 胃口種類由 date_style.js 定義；別的場地（電影院／百貨／KTV／海邊）各自寫一份這種表即可。
 */
export const PARK_ZONE_DATE = {
  gate: {
    transit: true,
    score: { wander: 2, gaze: 1, talk: 1 },
    do: {
      gaze: { text: "看大門人來人往、公告欄", foci: ["大門", "公告欄"] },
      wander: { text: "門口只是過路，往裡走才開始約會" },
      talk: { text: "門口不好聊，進廣場找長椅" },
      play: { text: "這裡不能玩，兒童遊戲區才像" },
      consume: { text: "這裡沒東西吃" },
    },
  },
  plaza: {
    score: { talk: 3, gaze: 2, wander: 2, play: 1 },
    do: {
      gaze: { text: "看孤立的老樹、路燈、空地的光", foci: ["孤立的老樹", "路燈"] },
      wander: { text: "廣場轉一圈，再決定下一區", foci: ["長椅"] },
      talk: { text: "坐長椅聊", foci: ["長椅"] },
      play: { text: "廣場空地不大能玩，兒童遊戲區比較像" },
      consume: { text: "沒攤販，只能坐著聊或看" },
    },
  },
  path: {
    score: { wander: 3, gaze: 2, talk: 1 },
    do: {
      gaze: { text: "看沿路樹影、矮燈、轉角", foci: ["矮燈", "轉角"] },
      wander: { text: "沿步道走，換一區" },
      talk: { text: "邊走邊聊，或在沿路椅子坐下", foci: ["沿路椅子"] },
      play: { text: "步道不是玩的地方" },
      consume: { text: "步道沒東西吃" },
    },
  },
  pond: {
    score: { gaze: 3, talk: 2, wander: 1 },
    do: {
      gaze: { text: "看水面、對岸、光", foci: ["池岸", "水面"] },
      talk: { text: "在池邊停下來說話", foci: ["池岸"] },
      wander: { text: "沿池岸走一圈" },
      play: { text: "水池不能玩水，看就好" },
      consume: { text: "池邊沒東西吃" },
    },
  },
  playground: {
    score: { play: 3, talk: 2, gaze: 1 },
    do: {
      play: { text: "靠近溜滑梯、鞦韆，當生活區玩一下", foci: ["溜滑梯", "鞦韆", "沙坑"] },
      talk: { text: "看小孩跑跳當話題", foci: ["鞦韆"] },
      gaze: { text: "看遊戲區的顏色與動靜", foci: ["溜滑梯"] },
      wander: { text: "繞欄杆轉一圈" },
      consume: { text: "遊戲區沒東西吃" },
    },
  },
  woods: {
    score: { gaze: 2, wander: 2, talk: 1 },
    do: {
      gaze: { text: "看樹冠、腐葉、光縫", foci: ["樹叢", "腐葉地面"] },
      wander: { text: "在林子裡抄近路", foci: ["變細的步道"] },
      talk: { text: "人少，可以小聲聊" },
      play: { text: "樹林不是遊樂場" },
      consume: { text: "林子裡沒東西吃" },
    },
  },
  toilet: {
    score: {},
    do: {
      talk: { text: "廁所不是約會的地方" },
      wander: { text: "上完就離開" },
    },
  },
};

const TIME_MOOD = {
  morning:
    "晨光偏白，空氣還帶一點涼。遠處有人慢走與低聲交談，遊戲區已經有小孩的聲音。整座公園公開、生活、不太藏得住事。",
  dusk:
    "太陽西斜，影子被拉長，金色光線貼在樹幹與池面上。廣場與步道仍有人，但邊角開始空出來。空氣裡有晚餐氣味和要回家的催促聲。水池是這時唯一需要額外檢查水面正不正常的地方。",
  night:
    "多數燈沒開或只剩稀疏幾盞。蟲鳴很大，人聲幾乎沒有。廣場空成一塊亮斑，樹林與池岸沉在暗裡。任何多餘的腳步、引擎或笑聲都應該顯得不該出現。",
};

const KAPPA_OMENS = [
  "水面中央有比風更大的起伏，但岸邊沒有魚跳。",
  "池岸石頭上出現新鮮的濕足跡，像從水裡走上來，卻沒有人影。",
  "對岸或樹後有人低聲叫不要靠那麼近，轉頭卻找不到人。",
  "水邊突然變冷，一股河泥與腥甜混在一起的味道。",
  "水面下有小孩般的輪廓，但頭型與四肢比例不對。",
];

const GANG_OMENS = [
  "遠處有機車怠速或壓低的笑罵，燈光一閃就暗。",
  "前方路燈下站著幾個人，看見你之後不讓路。",
  "身後腳步從一個人變成一群人，距離在縮。",
  "廁所外有人把風，裡面有東西掉在地上的聲音。",
  "廣場長椅上本來沒人，走過後才發現暗處有人起身。",
];

const NORMAL_EVENTS = {
  morning: [
    "有老人慢走過來，抬手問現在幾點。",
    "一顆小孩皮球滾到腳邊。",
    "清潔人員拖過水池岸，水痕還在。",
  ],
  dusk: [
    "一對情侶從步道經過，沒停。",
    "遠處有家長喊小孩回家。",
    "廣場有人靠著路燈打電話。",
  ],
  night: [
    "自動灑水突然響起又停。",
    "一隻野貓從樹林衝出，跑向暗處。",
    "遠方大馬路車聲，公園裡沒有人應。",
    "廁所燈自己閃一下。",
  ],
};

const KAPPA_OPTS = [
  "後退，沿步道回廣場",
  "停在原地看水面",
  "走近池岸／伸手或出聲",
  "繞去廁所或樹林避開水面",
];

const GANG_OPTS = [
  "立刻改道去有燈的廣場或公園出口",
  "假裝沒看見，繼續走",
  "出聲質問／對視",
  "躲進樹林或廁所",
];

const ENCOUNTER_OPTS = [
  "掙扎推開，往有燈的廣場跑",
  "呼救",
  "先別動",
  "設法往開闊燈光處移動",
];

export function emptyPark() {
  return {
    zone: "gate",
    prevZone: "",
    event: "",
    phase: "",
    verdict: "",
    omens: [],
    lastEventBeat: -9,
    beat: 0,
    stay: 0,
    askedSafety: false,
    rolledThisBeat: false,
  };
}

export function parkTimeKey(raw) {
  const t = String(raw || "dusk");
  if (t === "afternoon" || t === "evening") return "dusk";
  if (t === "morning" || t === "dusk" || t === "night") return t;
  return "dusk";
}

export function parkZoneName(id) {
  return PARK_ZONES[id]?.name || "入口";
}

export function parkLinked(from, to) {
  if (!from || !to) return false;
  if (from === to) return true;
  return (PARK_LINKS[from] || []).includes(to);
}

export function parkZoneIdFromName(name) {
  const s = String(name || "").trim();
  if (!s) return "";
  if (PARK_ZONES[s]) return s;
  for (const z of Object.values(PARK_ZONES)) {
    if (z.name === s) return z.id;
  }
  return matchParkZone(s);
}

/** 最短路徑（含起點）。走不到回空陣列。 */
export function parkPath(from, to) {
  const a = parkZoneIdFromName(from) || from;
  const b = parkZoneIdFromName(to) || to;
  if (!PARK_ZONES[a] || !PARK_ZONES[b]) return [];
  if (a === b) return [a];
  const q = [[a]];
  const seen = new Set([a]);
  while (q.length) {
    const path = q.shift();
    const cur = path[path.length - 1];
    for (const n of PARK_LINKS[cur] || []) {
      if (seen.has(n)) continue;
      const next = path.concat(n);
      if (n === b) return next;
      seen.add(n);
      q.push(next);
    }
  }
  return [];
}

export function parkNextHop(from, to) {
  const path = parkPath(from, to);
  return path.length >= 2 ? path[1] : "";
}

export function applyParkMove(state, dest) {
  const to = parkZoneIdFromName(dest) || dest;
  if (!state || !PARK_ZONES[to]) return false;
  if (to === state.zone) return false;
  if (!parkLinked(state.zone, to)) return false;
  state.prevZone = state.zone;
  state.zone = to;
  state.stay = 0;
  return true;
}

export function parkExitIds(zoneId) {
  return (PARK_LINKS[zoneId] || []).slice();
}

export function parkExitNames(zoneId) {
  return parkExitIds(zoneId).map((id) => PARK_ZONES[id]?.name).filter(Boolean);
}

/** MUD LOOK：區域名、時段、環境一句、焦點、出口。人不寫在這裡。 */
export function parkMudRoom(state, time, { brief = false } = {}) {
  const zone = PARK_ZONES[state?.zone] || PARK_ZONES.gate || PARK_ZONES.plaza;
  const t = parkTimeKey(time);
  const exits = parkExitNames(zone.id);
  const first = String(zone.desc || "").split("。")[0];
  if (brief) {
    return `【公園·${zone.name}】${PARK_TIME_ZH[t] || "黃昏"}`;
  }
  const lines = [
    `【公園·${zone.name}】${PARK_TIME_ZH[t] || "黃昏"}`,
    first ? `${first}。` : "",
    zone.foci?.length ? `你看見：${zone.foci.join("、")}。` : "",
    exits.length ? `出口：${exits.join("、")}。` : "",
  ];
  return lines.filter(Boolean).join("\n");
}

export function parkAlone({ girlArrived, rivalPresent } = {}) {
  return !girlArrived && !rivalPresent;
}

export function parkLifeOnly(time, zone) {
  if (zone === "playground") return true;
  if (time === "morning") return true;
  if (time === "dusk" && (zone === "plaza" || zone === "path" || zone === "playground" || zone === "gate")) return true;
  return false;
}

export function parkAdultOk(state, time) {
  const phase = state?.phase || "";
  if (phase === "omen" || phase === "omen2" || phase === "encounter") return false;
  return !parkLifeOnly(time, state?.zone || "plaza");
}

export function matchParkZone(text) {
  const s = String(text || "");
  if (/兒童|遊戲區|溜滑梯|鞦韆|沙坑/.test(s)) return "playground";
  if (/廁所|化妝室|洗手台/.test(s)) return "toilet";
  if (/樹林|林子|樹叢|抄近路/.test(s)) return "woods";
  if (/水池|池邊|池岸|水面|池塘/.test(s)) return "pond";
  if (/入口|大門|正門|公園門口/.test(s)) return "gate";
  if (/廣場|空地|老樹/.test(s)) return "plaza";
  if (/步道|小路|主路/.test(s)) return "path";
  return "";
}

function pickOne(arr, used) {
  const left = (arr || []).filter((x) => !(used || []).includes(x));
  const src = left.length ? left : arr || [];
  if (!src.length) return "";
  return src[Math.floor(Math.random() * src.length)];
}

function choiceKind(text, event) {
  const s = String(text || "");
  const zone = matchParkZone(s);
  if (event === "kappa") {
    if (/後退|回廣場|沿步道|離開|跑/.test(s) || zone === "plaza" || zone === "path" || zone === "playground") return "A";
    if (/停|原地|看水面|繼續看/.test(s)) return "B";
    if (/走近|靠近|伸手|出聲|對峙/.test(s)) return "C";
    if (/繞|避開|廁所|樹林/.test(s) || zone === "toilet" || zone === "woods") return "D";
  }
  if (event === "gang") {
    if (/改道|廣場|出口|有燈|立刻|跑|逃/.test(s) || (zone === "plaza" && /燈|開闊/.test(s))) return "A";
    if (/假裝|沒看見|繼續走/.test(s)) return "B";
    if (/質問|對視|出聲|對峙|罵/.test(s)) return "C";
    if (/躲|樹林|廁所/.test(s) || zone === "woods" || zone === "toilet") return "D";
  }
  if (/呼救|救命|喊人/.test(s)) return "call";
  if (/掙扎|推開|往.*跑|燈光/.test(s)) return "struggle";
  if (/別動|妥協|先不要動/.test(s)) return "still";
  return "";
}

function addOmen(state, event) {
  const pool = event === "kappa" ? KAPPA_OMENS : GANG_OMENS;
  const omen = pickOne(pool, state.omens);
  if (omen) state.omens.push(omen);
  return omen;
}

function resolveChoice(state, text) {
  const k = choiceKind(text, state.event);
  if (state.phase === "encounter") {
    if (k === "A" || k === "call" || k === "struggle" || /廣場|出口|燈/.test(text)) {
      state.phase = "ended";
      state.verdict = k === "call" ? "call" : "escape";
      state.lastEventBeat = state.beat;
      return;
    }
    state.verdict = "hold";
    return;
  }
  if (state.event === "kappa") {
    if (k === "A") {
      state.phase = "ended";
      state.verdict = "fade";
      const want = matchParkZone(text) || (/廣場/.test(text) ? "plaza" : "path");
      const hop = parkNextHop(state.zone, want) || (parkLinked(state.zone, want) ? want : "");
      if (hop) applyParkMove(state, hop);
    } else if (k === "B") {
      state.phase = state.phase === "omen" ? "omen2" : "encounter";
      state.verdict = state.phase === "omen2" ? "closer" : "grab";
      if (state.phase === "omen2") addOmen(state, "kappa");
    } else if (k === "C") {
      state.phase = "encounter";
      state.verdict = "grab";
    } else if (k === "D") {
      const dest = matchParkZone(text);
      const hop = dest ? parkNextHop(state.zone, dest) : "";
      if (hop) applyParkMove(state, hop);
      state.phase = "ended";
      state.verdict = "follow-stop";
    } else if (state.phase === "omen2") {
      state.phase = "encounter";
      state.verdict = "grab";
    } else {
      state.verdict = "linger";
    }
  } else if (state.event === "gang") {
    if (k === "A") {
      state.phase = "ended";
      state.verdict = "fade";
      const hop = parkNextHop(state.zone, "plaza") || parkNextHop(state.zone, "gate");
      if (hop) applyParkMove(state, hop);
    } else if (k === "B") {
      state.phase = state.phase === "omen" ? "omen2" : "encounter";
      state.verdict = state.phase === "omen2" ? "closer" : "surround";
      if (state.phase === "omen2") addOmen(state, "gang");
    } else if (k === "C") {
      state.phase = "encounter";
      state.verdict = "surround";
    } else if (k === "D") {
      const dest = matchParkZone(text);
      const hop = dest ? parkNextHop(state.zone, dest) : "";
      if (hop) applyParkMove(state, hop);
      state.phase = "omen2";
      state.verdict = "follow-in";
      addOmen(state, "gang");
    } else if (state.phase === "omen2") {
      state.phase = "encounter";
      state.verdict = "surround";
    } else {
      state.verdict = "linger";
    }
  }
  if (state.phase === "ended") state.lastEventBeat = state.beat;
}

export function applyParkAct(state, ctx) {
  const text = String(ctx.text || "");
  state.beat += 1;
  state.rolledThisBeat = false;
  state.askedSafety = /安全|危險|安不安全|有沒有人/.test(text);
  state.verdict = "";
  if (!ctx.skipMove) {
    const dest = matchParkZone(text);
    if (dest && dest !== state.zone && parkLinked(state.zone, dest)) {
      state.prevZone = state.zone;
      state.zone = dest;
      state.stay = 0;
    } else {
      state.prevZone = ctx.keepPrev ? state.prevZone : "";
      state.stay += 1;
    }
  } else {
    state.stay = 0;
  }

  if (!ctx.alone && (state.phase === "omen" || state.phase === "omen2" || state.phase === "encounter")) {
    state.phase = "ended";
    state.verdict = "interrupt";
    state.lastEventBeat = state.beat;
    return state;
  }
  if (state.phase === "omen" || state.phase === "omen2" || state.phase === "encounter") {
    resolveChoice(state, text);
  }
  return state;
}

export function maybeStartParkEvent(state, ctx) {
  if (state.rolledThisBeat) return state;
  state.rolledThisBeat = true;
  if (state.phase && state.phase !== "ended") return state;
  if (state.phase === "ended" && state.beat - state.lastEventBeat < 3) return state;
  if (!ctx.alone) return state;
  const time = ctx.time;
  const zone = state.zone;
  let kind = "";
  if (time === "dusk" && zone === "pond") kind = "kappa";
  else if (time === "night" && zone !== "playground") {
    if (zone === "path" || zone === "woods" || zone === "toilet") kind = "gang";
    else if (zone === "plaza") kind = "gang";
  }
  if (!kind) return state;
  if (kind === "kappa") {
    const act = String(ctx.text || "");
    const near = zone === "pond" && (/靠近|池岸|水面|伸手|看水|停|站/.test(act) || state.stay >= 1 || destIsPond(act) || !act);
    if (!near) return state;
  }
  const p = kind === "gang" && zone === "plaza" ? 0.12 : 0.22;
  if (Math.random() > p) return state;
  state.event = kind;
  state.phase = "omen";
  state.verdict = "omen";
  state.omens = [];
  addOmen(state, kind);
  state.lastEventBeat = state.beat;
  return state;
}

function destIsPond(text) {
  return matchParkZone(text) === "pond";
}

export function parkForcedOptions(state) {
  if (state.phase === "omen" || state.phase === "omen2") {
    if (state.event === "kappa") return KAPPA_OPTS.slice();
    if (state.event === "gang") return GANG_OPTS.slice();
  }
  if (state.phase === "encounter") return ENCOUNTER_OPTS.slice();
  return null;
}

export function parkDefaultOptions(state, { waiting = false } = {}) {
  const z = PARK_ZONES[state.zone] || PARK_ZONES.gate || PARK_ZONES.plaza;
  const foci = (z.foci || []).slice(0, 2).map((f) => `靠近${f}`);
  const go = parkExitNames(state.zone).map((n) => `去${n}`);
  if (waiting) return ["坐著等她", "四處看看", ...go].slice(0, 5);
  return [...foci, ...go].slice(0, 5);
}

export function parkSafetyFeel(time, zone) {
  if (time === "morning") return "看起來普通。";
  if (time === "dusk" && zone === "pond") return "平靜裡有不對。";
  if (time === "dusk") return "普通，邊角開始空。";
  if (time === "night" && zone === "plaza") return "空，但相對看得見。";
  if (time === "night") return "視線差，適合不安，仍不一定出事。";
  return "看起來普通。";
}

export function parkNormalBeat(time) {
  if (Math.random() > 0.55) return "";
  return pickOne(NORMAL_EVENTS[time] || [], []);
}

function eventInstruction(state) {
  if (state.verdict === "interrupt") {
    return "異常中斷：有同伴或近距離圍觀。只寫遠處有動靜後消失。不要提河童或不良集團。不要繼續前兆。";
  }
  if (state.phase === "ended" && state.verdict === "fade") {
    return "前兆消退。改回普通場面。不要再寫剛才的異常，不要提河童或不良集團。";
  }
  if (state.phase === "ended" && state.verdict === "follow-stop") {
    return "背後有水聲／腳步跟上幾步後停下。之後當普通場面。不要寫出河童或集團名字。";
  }
  if (state.phase === "ended" && (state.verdict === "escape" || state.verdict === "call")) {
    return "玩家跑向燈光／呼救成功。事件中斷。只寫遠處笑聲或水聲停掉、廣場燈下比較看得見。禁止傷害與性行為描寫。";
  }
  if (state.phase === "omen" || state.phase === "omen2") {
    const omens = state.omens.slice(-2).join(" ");
    const who = state.event === "kappa" ? "黃昏水池前兆" : "深夜有人把路堵上的前兆";
    return [
      `這一拍有異常前兆（${who}）。每次最多用1～2個前兆，已選定：${omens}`,
      "只寫前兆與壓迫感。不要寫出河童、妖怪、不良集團這些詞。未把玩家攔下之前不要演完傷害。",
      "選項必須用系統給的那幾條，不要自己另編結局。",
    ].join("\n");
  }
  if (state.phase === "encounter") {
    if (state.event === "kappa") {
      return [
        "遭遇開始。只寫被從水邊接近、身體被抓住或拖向濕岸、無法輕易掙脫的現場。",
        "然後停在下一步由玩家選。禁止描寫交配、射精、器具與傷害手法。禁止寫河童這個詞。",
      ].join("\n");
    }
    return [
      "被圍。寫封鎖去路、語言威脅（不要用引號台詞）、被抓住手臂或推到牆／樹／廁所隔間。",
      "停在下一步由玩家選。禁止描寫輪姦過程與性手法。不要寫不良集團這個詞。",
    ].join("\n");
  }
  return "";
}

export function parkNarratorLines(state, ctx) {
  const time = ctx.time;
  const zone = PARK_ZONES[state.zone] || PARK_ZONES.plaza;
  const moving = state.prevZone && state.prevZone !== state.zone;
  const from = PARK_ZONES[state.prevZone];
  const life = parkLifeOnly(time, state.zone);
  const event = eventInstruction(state);
  const normal = !event ? parkNormalBeat(time) : "";
  const lines = [
    "【角色】你是這個公園的場景旁白與環境裁判。你不扮演玩家。你只描述此刻所在位置看得到、聽得到、聞得到的事物。",
    "不要一次介紹整座公園。不要用設定解說口吻。不要提前劇透晚上會出事。未觸發則不要提河童或不良集團。",
    "",
    "【每次輸出固定格式】",
    "1. 時段／光線（一句）",
    "2. 所在區域環境（2～4句）",
    "3. 人、聲、味（有就寫；沒有就寫空，三個字：沒有。）",
    "4. 可互動焦點（最多3個，寫進正文，例如長椅、池岸、廁所門、樹叢、路燈）",
    "5. 若有異常：只寫前兆。未觸發不要寫第5點的異常。",
    "然後另起：",
    "【選項】",
    "1. （動作）",
    "2. （動作）",
    "3. （動作）",
    "重點用 **兩側星號** 包起來。只標關鍵：濕足跡、水面不對、去路被堵、她要跑、衣服狀態。不要整段加星號。",
    "仍然禁止替玩家／妹子／其他召喚師寫出口的對白。環境聲可以寫，不要用引號包句子。",
    "",
    "【硬規則】",
    "・兒童遊戲區，以及早上／黃昏仍有小孩與家長在場時：只寫生活場景。禁止任何成人向、怪物、性、輪姦、跟蹤獵食描寫。",
    "・河童只可能出現在黃昏＋水池，且玩家單獨、停留或靠近池岸。由系統決定是否觸發，你不要自己發明。",
    "・不良集團只可能出現在深夜，優先步道、樹林口、廁所外、廣場暗角；玩家單獨。由系統決定是否觸發。",
    "・有同伴、有路人近距離圍觀、玩家明確離開，則異常中斷或改為遠處有動靜後消失。",
    "・一旦靠近／對峙／被攔住：只寫現場壓迫、身體被限制、恐懼與選擇後果的環境層，不要描寫具體性行為手法。",
    "・逃跑成功、呼救成功、或進入有燈光的開闊廣場，事件可以中斷。",
    "",
    `【此刻時段】${PARK_TIME_ZH[time] || "黃昏"}。${TIME_MOOD[time] || TIME_MOOD.dusk}`,
    `【此刻區域＝${zone.name}】只寫這裡。${zone.desc}`,
    `可互動焦點：${(zone.foci || []).join("、")}。`,
  ];
  if (moving && from) {
    lines.push(
      `【移動】玩家從${from.name}來到${zone.name}。先用步道過渡一句，再切換本區。例：你離開${from.name}，步道燈光一盞比一盞稀。轉過樹叢後，${zone.name}的氣味先到。`,
    );
  }
  if (life) {
    lines.push("【生活區鎖定】這一拍只准生活場景。禁止裸露特寫、性、怪物、獵食。有人靠近也只寫躲開、拉衣服、路人目光。");
  }
  if (ctx.waiting) {
    lines.push("【等待】約好的人還沒到。不要把她寫進畫面。選項以等、走、換區為主，不要寫牽手。");
  }
  if (event) {
    lines.push("", "【本拍異常（系統已判定，照做）】", event);
  } else {
    lines.push("【本拍異常】未觸發。不要寫前兆，不要提河童或不良集團。");
    if (normal) lines.push(`【普通事件】可寫進「人、聲、味」：${normal}`);
  }
  if (state.askedSafety) {
    lines.push(`【有人問安不安全】不要全知。只給感覺：${parkSafetyFeel(time, state.zone)}`);
  }
  const forced = parkForcedOptions(state);
  if (forced?.length) {
    lines.push("", "【選項鎖定＝必須原樣輸出這幾條，可改順序不可改意思】");
    forced.forEach((opt, i) => lines.push(`${i + 1}. ${opt}`));
  } else {
    lines.push("選項以換區、靠近焦點、等待、離開為主。動作，不要寫成已經說出口的台詞。");
  }
  return lines;
}

export function parkFallbackNarration(state, time, { waiting = false, girlWaiting = false } = {}) {
  const mood = TIME_MOOD[time] || TIME_MOOD.dusk;
  const zone = PARK_ZONES[state.zone] || PARK_ZONES.plaza;
  if (waiting) {
    return `${mood}廣場長椅還空著。約好的人還沒到，入口方向偶爾有人經過。`;
  }
  if (girlWaiting) {
    return `${mood}${zone.name}已經有人在等。入口那邊才剛走進一個身影。`;
  }
  return `${mood}你在${zone.name}。${zone.desc.split("。")[0]}。`;
}
