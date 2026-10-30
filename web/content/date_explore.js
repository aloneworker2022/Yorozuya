/** 約會探索梯子＋說服／NTR 七段。程式判尺度，模型只演過／不過。 */

export const EXPLORE_ZH = {
  1: "逛／聊",
  2: "靠近／牽／親",
  3: "隔衣摸",
  4: "伸進衣服／擦邊",
  5: "裸體露出",
  6: "做愛",
};

/** 召喚師×她 七段＝他那把梯子的天花板。交配推進（testdate 可手動調）。 */
export const RIVAL_STAGES = [
  { idx: 0, name: "強烈嫌惡排斥", resist: 10, mateNeed: 2, floor: 1, dirty: 2 },
  { idx: 1, name: "嫌惡抗拒", resist: 8, mateNeed: 3, floor: 2, dirty: 3 },
  { idx: 2, name: "抗拒冷淡", resist: 6, mateNeed: 5, floor: 3, dirty: 4 },
  { idx: 3, name: "抗拒", resist: 5, mateNeed: 5, floor: 4, dirty: 6 },
  { idx: 4, name: "偶爾互動", resist: 4, mateNeed: 0, floor: 4, dirty: 6 },
  { idx: 5, name: "女友", resist: 1, mateNeed: 20, floor: 5, dirty: 6 },
  { idx: 6, name: "妻子", resist: 1, mateNeed: 0, floor: 6, dirty: 6 },
];

/** 對玩家：階段＝天花板；default＝不用說服就停這。 */
export const PLAYER_CAP = {
  stranger: { defaultLv: 1, maxLv: 2 },
  friend: { defaultLv: 2, maxLv: 3 },
  girlfriend: { defaultLv: 3, maxLv: 6 },
  wife: { defaultLv: 4, maxLv: 6 },
};

export const DEAD_ANGLE = new Set(["toilet", "woods"]);

export function rivalStageOf(idx) {
  const n = Math.max(0, Math.min(6, Number(idx) || 0));
  return RIVAL_STAGES[n];
}

export function playerCap(rel) {
  return PLAYER_CAP[rel] || PLAYER_CAP.stranger;
}

export function exploreLabel(n) {
  const lv = Math.max(1, Math.min(6, Number(n) || 1));
  return `${lv} ${EXPLORE_ZH[lv]}`;
}

export function ntrShowOfLine(line) {
  if (line === "creep") return "front";
  if (line === "otaku") return "away";
  if (line === "erotic") return Math.random() < 0.55 ? "front" : "away";
  return Math.random() < 0.35 ? "front" : "away";
}

export function ntrShowZh(show) {
  return show === "front" ? "在你面前玩弄她" : "帶走";
}

/** 場地：生活區禁 4+；做愛只在廁所／樹林。 */
export function placeAllows(level, zone, { time, lifeOnly } = {}) {
  const lv = Number(level) || 1;
  const z = zone || "gate";
  if (lifeOnly || z === "playground") return lv <= 3;
  if (lv >= 6) return DEAD_ANGLE.has(z);
  if (lv >= 5) return z !== "gate";
  return true;
}

export function heartNeed(rel, wantLv) {
  const cap = playerCap(rel);
  const want = Math.max(1, Math.min(cap.maxLv, Number(wantLv) || 1));
  const extra = Math.max(0, want - cap.defaultLv);
  return extra * 8;
}

export function parsePropose(raw) {
  const s = String(raw || "").trim();
  if (!s) return null;
  if (/回家|回去|結束|散了|到此為止|先回去/.test(s)) {
    return { kind: "home", dest: "gate", level: 0, label: "回家" };
  }
  if (/沒人處|沒人的地方|死角|暗處|更裡面|裡面一點/.test(s)) {
    return { kind: "place", dest: "secluded", level: 0, label: "去沒人處" };
  }
  if (/樹林|林子|樹叢|草叢/.test(s)) return { kind: "place", dest: "woods", level: 0, label: "去樹林" };
  if (/廁所/.test(s)) return { kind: "place", dest: "toilet", level: 0, label: "去廁所" };
  if (/遊戲區|兒童/.test(s)) return { kind: "place", dest: "playground", level: 0, label: "去兒童遊戲區" };
  if (/廣場/.test(s)) return { kind: "place", dest: "plaza", level: 0, label: "去廣場" };
  if (/入口|大門/.test(s)) return { kind: "place", dest: "gate", level: 0, label: "去入口" };
  if (/水池|池邊/.test(s)) return { kind: "place", dest: "pond", level: 0, label: "去水池" };
  if (/步道/.test(s)) return { kind: "place", dest: "path", level: 0, label: "去步道" };
  if (/做愛|插入|交配|幹/.test(s)) return { kind: "act", level: 6, label: "做愛" };
  if (/裸|脫光|露出|全裸/.test(s)) return { kind: "act", level: 5, label: "裸體露出" };
  if (/脫|掀|伸進|內衣|內褲/.test(s)) return { kind: "act", level: 4, label: "伸進衣服" };
  if (/摸|揉|猥褻/.test(s)) return { kind: "act", level: 3, label: "隔衣摸" };
  if (/親|吻|牽|靠近|摟/.test(s)) return { kind: "act", level: 2, label: "靠近／親" };
  if (/聊|逛|走走|去哪/.test(s)) return { kind: "act", level: 1, label: "逛／聊" };
  return { kind: "act", level: 1, label: s.slice(0, 12) };
}

export function actExploreLevel(verb, partId) {
  const v = String(verb || "");
  const p = String(partId || "");
  if (v === "look" || v === "wait" || v === "wave" || v === "sit" || v === "say") return 1;
  if (v === "kiss") return 2;
  if (v === "grind") return 6;
  if (v === "strip" && /光|裸|nude/.test(p)) return 5;
  if (v === "strip" || v === "lift") return 4;
  if (v === "lick" || v === "suck") return /labia|clit|nipple/.test(p) ? 4 : 3;
  if (v === "touch") {
    if (/labia|clit|nipple|anus/.test(p)) return 4;
    return 3;
  }
  if (v === "hypnotize") return 0;
  if (v === "propose") return 0;
  return 1;
}

/**
 * 玩家提議。ok=她答應（程式判）。
 */
export function judgePlayerPropose({ rel, heart, haveLv, zone, time, lifeOnly, propose }) {
  const cap = playerCap(rel);
  const p = propose;
  if (!p) return { ok: false, reason: "沒聽懂你要提議什麼。" };
  if (p.kind === "home") {
    return { ok: true, home: true, echo: "她點頭。該回去了。" };
  }
  if (p.kind === "place") {
    const dest = p.dest;
    const needLv = DEAD_ANGLE.has(dest) ? (rel === "wife" ? 4 : rel === "girlfriend" ? 4 : 9) : 1;
    if (needLv > cap.maxLv) {
      return { ok: false, reason: "以你們現在的關係，她不會跟你去那種地方。" };
    }
    if (DEAD_ANGLE.has(dest) && (rel === "stranger" || rel === "friend")) {
      return { ok: false, reason: "她不想跟你去沒人的地方。" };
    }
    if (DEAD_ANGLE.has(dest) && heart < heartNeed(rel, 4)) {
      return { ok: false, reason: "氣氛還不夠，她搖頭。" };
    }
    return { ok: true, dest, level: haveLv, echo: `她答應往${p.label.replace(/^去/, "")}走。` };
  }
  const want = Math.min(p.level, cap.maxLv);
  if (p.level > cap.maxLv) {
    return { ok: false, reason: "以你們現在的關係，這件事她聽不進去。" };
  }
  if (want > cap.defaultLv && heart < heartNeed(rel, want)) {
    return { ok: false, reason: "她還沒被說動。再聊聊、把這場感情養高一點。" };
  }
  if (!placeAllows(want, zone, { time, lifeOnly })) {
    if (want >= 6) {
      return { ok: false, reason: "這裡不行。要做愛得她帶去廁所或樹林。" };
    }
    return { ok: false, reason: "這裡人太多／有小孩。她不肯。" };
  }
  return { ok: true, level: want, echo: `她肯了：${p.label}。` };
}

export function hypnotizeChance(stageIdx) {
  return [0.15, 0.25, 0.35, 0.5, 0.7, 0.9, 1][Math.max(0, Math.min(6, Number(stageIdx) || 0))];
}

/** 他願意做到哪／作弊最多抬到哪 */
export function rivalExploreCap(stageIdx) {
  const st = rivalStageOf(stageIdx);
  return { floor: st.floor, dirty: st.dirty, name: st.name, resist: st.resist };
}

/**
 * 超過保證線（dirty）仍可硬來，擲骰。haveLv＝今晚已經做成的探索。
 * 剛認識猥褻約 1/5，做愛更低；今晚突破過的同一檔之後保證做成。
 */
export function rivalActChance(stageIdx, wantLv, haveLv = 0) {
  const st = rivalStageOf(stageIdx);
  const want = Math.max(1, Math.min(6, Number(wantLv) || 1));
  const have = Math.max(0, Number(haveLv) || 0);
  if (want <= 1) return 1;
  if (want <= st.floor || want <= st.dirty || want <= have) return 1;
  const i = st.idx;
  if (want <= 4) return [0.2, 0.35, 0.5, 0.75, 0.9, 1, 1][i];
  if (want === 5) return [0.1, 0.18, 0.3, 0.55, 0.8, 0.95, 1][i];
  return [0.08, 0.15, 0.25, 0.5, 0.75, 0.9, 1][i];
}

export function rivalChanceZh(p) {
  const n = Number(p);
  if (!(n > 0)) return "一定失敗";
  if (n >= 1) return "一定做成";
  return `約 1/${Math.max(2, Math.round(1 / n))}`;
}

export function mateResistRoll(stageIdx) {
  const r = rivalStageOf(stageIdx).resist;
  return Math.random() < 1 / Math.max(1, r);
}

/**
 * 散場結算。今晚氣氛（heart 0～30）只是場內溫度計；
 * 寫進關係的是這一顆 Δ（成功約 +1～+5，炸掉為負）。
 */
export function settleDateScore({
  reason = "home",
  rel = "friend",
  heart = 0,
  shame = 0,
  playerExplore = 1,
  rivalExplore = 1,
  girlTurns = 0,
  ntrTook = false,
} = {}) {
  let delta = 0;
  let title = "正常散場";
  if (reason === "flee") {
    title = "她跑掉了";
    delta = -4;
  } else if (reason === "ntr") {
    title = "她被他帶走了";
    delta = rel === "wife" ? -2 : -3;
  } else {
    title = "正常散場";
    delta = 1;
    if (girlTurns >= 3) delta += 1;
    if (girlTurns >= 6) delta += 1;
    if (heart >= 10) delta += 1;
    if (heart >= 18) delta += 1;
    const cap = playerCap(rel);
    if (rel === "stranger" || rel === "friend") {
      if (playerExplore >= 2) delta += 1;
      if (playerExplore >= 4) delta -= 1;
    } else {
      if (playerExplore >= Math.min(4, cap.maxLv)) delta += 1;
    }
    if (shame >= 22) delta -= 2;
    else if (shame >= 16) delta -= 1;
    if (ntrTook) delta -= 1;
    if (delta > 5) delta = 5;
    if (delta < 1) delta = 1;
  }
  return { title, delta, reason };
}

export function proposeSamples(rel, zone) {
  const cap = playerCap(rel);
  const out = ["提議 去哪", "提議 牽手", "提議 回家"];
  if (cap.maxLv >= 2) out.push("提議 親");
  if (cap.maxLv >= 3) out.push("提議 摸");
  if (cap.maxLv >= 4) {
    out.push("提議 去樹林", "提議 去廁所");
  }
  if (cap.maxLv >= 5 && rel === "wife") out.push("提議 露出");
  if (cap.maxLv >= 6) out.push("提議 做愛");
  return out;
}
