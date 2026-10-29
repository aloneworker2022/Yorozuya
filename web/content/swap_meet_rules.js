/* 換妻三段（酒吧 → 公園或 KTV → 旅館）的純規則。沒有 DOM。 */

// pt301u：全部立繪一次預產（31 張）
export const PRE_PARK = [
  ["other", "normal"], ["other", "shy"], ["other", "happy"], ["other", "startled"],
  ["other", "nude_normal"], ["other", "nude_shy"], ["other", "nude_happy"], ["other", "nude_startled"],
  ["other", "tipsy"], ["other", "under"], ["other", "nude"], ["other", "climax"], ["other", "creampie"],
  ["husband", "normal"], ["husband", "happy"], ["husband", "erotic"], ["husband", "nude_ero"], ["husband", "shy"], ["husband", "nude"],
  ["wife", "normal"], ["wife", "shy"], ["wife", "happy"], ["wife", "startled"],
  ["wife", "nude_ahe"], ["wife", "nude_prone"], ["wife", "nude_spread"],
  ["wife", "tipsy"], ["wife", "under"], ["wife", "nude"], ["wife", "climax"], ["wife", "creampie"],
];
export const HOTEL_PORTRAIT = [
  ["other", "nude_normal"], ["other", "nude_shy"], ["other", "nude_happy"], ["other", "nude_startled"],
];
export const SLOT_ZH = {
  "other~tipsy": "對方妻子・微醺", "other~under": "對方妻子・內衣", "other~nude": "對方妻子・裸體", "other~climax": "對方妻子・高潮癱軟坐著", "other~creampie": "對方妻子・內射後開腿坐著",
  "husband~shy": "對方丈夫・害羞", "husband~nude": "對方丈夫・裸體",
  "wife~tipsy": "你老婆・微醺", "wife~under": "你老婆・內衣", "wife~nude": "你老婆・裸體", "wife~climax": "你老婆・高潮癱軟坐著", "wife~creampie": "你老婆・內射後開腿坐著",
  "other~normal": "對方妻子・一般", "other~shy": "對方妻子・害羞", "other~happy": "對方妻子・開心", "other~startled": "對方妻子・驚嚇",
  "other~nude_normal": "對方妻子・裸體一般", "other~nude_shy": "對方妻子・裸體害羞", "other~nude_happy": "對方妻子・裸體開心", "other~nude_startled": "對方妻子・裸體驚嚇",
  "husband~normal": "對方丈夫・一般", "husband~happy": "對方丈夫・開心", "husband~erotic": "對方丈夫・色情", "husband~nude_ero": "對方丈夫・裸體色情",
  "wife~normal": "你老婆・一般", "wife~shy": "你老婆・害羞", "wife~happy": "你老婆・開心", "wife~startled": "你老婆・驚嚇",
  "wife~nude_ahe": "你老婆・裸體失神", "wife~nude_prone": "你老婆・裸體趴著", "wife~nude_spread": "你老婆・裸體開腿",
};
export const TEASE_AT = { waist: 60, butt: 65, breast: 70, labia: 80 };
export const HOTEL_AT = 85;
export const TEASE_ZH = { waist: "摟腰", butt: "摸臀", breast: "摸奶", labia: "摸陰唇" };

const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const num = (n) => (Number.isFinite(Number(n)) ? Number(n) : 0);

export function freshMeet() {
  return {
    phase: "bar",
    accept: { wife: 0, other: 0 },
    drunk: { wife: 0, other: 0, husband: 0 },
    agreed: { wife: false, other: false },
    semen: { wife: 0, other: 0 },
    orgasm: { wife: 0, other: 0 },
    toilet: false,
    swapped: false,
  };
}
/** 測試捷徑：公園／KTV 當第二段剛開始；旅館當第三段。正式赴約走 freshMeet。 */
export function testMeet(scene) {
  const s = String(scene || "bar");
  if (s === "park" || s === "ktv") {
    const m = freshMeet();
    m.phase = s; m.swapped = true; m.agreed = { wife: true, other: true };
    m.accept = { wife: 40, other: 62 };
    return m;
  }
  if (s === "hotel_room" || s === "hotel_bath") {
    const m = freshMeet();
    m.phase = "hotel_room"; m.swapped = true; m.agreed = { wife: true, other: true };
    m.accept = { wife: 80, other: 90 };
    return m;
  }
  return freshMeet();
}

export function addAccept(m, who, n) {
  if (!m.accept[who]) m.accept[who] = 0;
  m.accept[who] = clamp(Math.round(num(m.accept[who]) + num(n)), 0, 100);
  return m.accept[who];
}
export function addDrunk(m, who, n) {
  m.drunk[who] = clamp(Math.round(num(m.drunk[who]) + num(n)), 0, 100);
  return m.drunk[who];
}
/** 她這句說完：接受度已超過 50 就鎖成同意。 */
export function lockIfReady(m, who) {
  if ((who !== "wife" && who !== "other") || m.agreed[who]) return false;
  if (num(m.accept[who]) > 50) { m.agreed[who] = true; return true; }
  return false;
}
export const bothAgreed = (m) => !!(m.agreed.wife && m.agreed.other);
export const husbandPickScene = (rng = Math.random) => (rng() < 0.5 ? "ktv" : "park");

/** 酒吧敬酒會喝的機率。接受度 0 → 40%，100 → 90%。 */
export const drinkChance = (accept) => clamp(0.4 + num(accept) / 200, 0.4, 0.9);

/** 酒吧一句聊天。玩家或對方丈夫：兩位妻子各 +2。 */
export function barChatGain(who) {
  return who === "player" || who === "husband" ? { wife: 2, other: 2 } : { wife: 0, other: 0 };
}
/** 敬酒結果。喝了：被敬的妻子 +4、醉度 +5。丈夫只加自己的醉度。 */
export function toastOf(who, accept, rng = Math.random) {
  const drank = rng() < (who === "husband" ? 0.85 : drinkChance(accept));
  return { drank, accept: drank && (who === "wife" || who === "other") ? 4 : 0, drunk: drank ? 5 : 0 };
}

export function teaseList(scene) {
  return scene === "park" ? ["breast"] : ["waist", "butt", "breast", "labia"];
}
export const teaseOk = (act, accept) => num(accept) > (TEASE_AT[act] || 100);

/** 第二段，對方丈夫每 10 秒。沒過門檻的猥褻改成聊天。 */
export function husbandBeat(m, scene, rng = Math.random) {
  if (scene === "ktv" && !m.toilet && num(m.drunk.wife) >= 75) {
    m.toilet = true;
    const act = rng() < 0.5 ? "sex" : "oral";
    if (num(m.accept.wife) < 80) m.accept.wife = 80;
    return { act, toilet: true, accept: 0, drunk: 0, setAccept: 80 };
  }
  const r = rng();
  let kind = r < 0.4 ? "chat" : r < 0.7 ? "molest" : "idle";
  if (kind === "molest") {
    const ok = teaseList(scene).filter((a) => teaseOk(a, m.accept.wife));
    if (!ok.length) kind = "chat";
    else return { act: ok[Math.floor(rng() * ok.length)], accept: 0, drunk: 0 };
  }
  if (kind === "chat") {
    addAccept(m, "wife", 4);
    return { act: "chat", accept: 4, drunk: 0 };
  }
  if (scene === "ktv") {
    addDrunk(m, "wife", 1);
    return { act: "drink", accept: 0, drunk: 1 };
  }
  const gain = rng() < 0.5 ? 2 : 0;
  addAccept(m, "wife", gain);
  return { act: "walk", accept: gain, drunk: 0 };
}

/** 看完對方丈夫這一拍：對方妻子對你 −2。 */
export function watchPenalty(m) {
  addAccept(m, "other", -2);
  return m.accept.other;
}

export function playerStageGain(kind, rng = Math.random) {
  if (kind === "chat") return { accept: 3, drunk: 0, ok: true };
  if (kind === "walk" || kind === "duet") return { accept: rng() < 0.5 ? 2 : 0, drunk: 0, ok: true };
  if (kind === "drink") {
    const ok = rng() < 0.5;
    return { accept: ok ? 2 : 0, drunk: ok ? 8 : 0, ok };
  }
  return { accept: 0, drunk: 0, ok: true };
}

/** 旅館丈夫這一拍。四項各 20%；多出來的 20% 在有精液時給流出、接受度 >98 時給接吻，兩個都有就各 10%。 */
export function hotelHusbandAct(m, rng = Math.random) {
  const items = [["sex", 20], ["oral", 20], ["chat", 20], ["bath", 20]];
  const semen = num(m.semen.wife) > 0, kiss = num(m.accept.wife) > 98;
  if (semen && kiss) items.push(["leak", 10], ["kiss", 10]);
  else if (semen) items.push(["leak", 20]);
  else if (kiss) items.push(["kiss", 20]);
  else for (const it of items) it[1] += 5;
  let r = rng() * items.reduce((s, it) => s + it[1], 0);
  let act = items[0][0];
  for (const [k, w] of items) { r -= w; if (r < 0) { act = k; break; } }
  return applyHotelAct(m, "wife", act, rng);
}
/** 做愛或口交：一半高潮（接受度 +5）、約三分之一射精（精液 +1）。流出：精液 −1。 */
export function applyHotelAct(m, who, act, rng = Math.random) {
  const out = { act, orgasm: false, ejac: false, accept: 0, semen: 0 };
  if (act === "leak") {
    if (num(m.semen[who]) > 0) { m.semen[who] -= 1; out.semen = -1; }
    return out;
  }
  if (act === "sex" || act === "oral") {
    if (rng() < 0.5) { out.orgasm = true; out.accept = 5; addAccept(m, who, 5); m.orgasm[who] = num(m.orgasm[who]) + 1; }
    if (rng() < 1 / 3) { out.ejac = true; out.semen = 1; m.semen[who] = num(m.semen[who]) + 1; }
  }
  return out;
}

const LEAK_RE = /流出/;
const SEX_RE = /做愛|性交|插入|抽插/;
const TEASE_RE = /猥褻|摸|揉|撫|抱/;
/** 旅館只看玩家打的字。同一句裡的地點跟動作都算。 */
export function parseHotelText(text) {
  const t = String(text || "");
  const where = /浴室/.test(t) ? "bath" : /房間/.test(t) ? "room" : "";
  if (LEAK_RE.test(t)) return { kind: "leak", where };
  if (SEX_RE.test(t)) return { kind: "sex", where };
  if (TEASE_RE.test(t)) {
    const act = /陰|穴/.test(t) ? "labia" : /臀|屁股/.test(t) ? "butt" : /腰/.test(t) ? "waist" : "breast";
    return { kind: "tease", act, where };
  }
  if (where) return { kind: "move", where };
  return { kind: "chat", where: "" };
}

export function portraitExpr(who, { scene = "bar", act = "", accept = 0, mood = "" } = {}) {
  const hotel = String(scene).startsWith("hotel");
  if (who === "husband") {
    if (act === "sex" || act === "oral" || act === "leak") return "nude_ero";
    if (TEASE_AT[act] || act === "molest") return "erotic";
    if (mood === "happy") return "happy";
    return "normal";
  }
  if (who === "wife") {
    if (act === "sex") return mood === "spread" ? "nude_spread" : "nude_prone";
    if (act === "oral" || act === "leak" || (hotel && (act === "kiss" || act === "bath"))) return "nude_ahe";
    if (mood === "startled") return "startled";
    if (mood === "shy" || num(accept) < 40) return "shy";
    if (mood === "happy" || num(accept) > 70) return "happy";
    return "normal";
  }
  if (hotel) {
    const base = mood === "startled" ? "startled" : mood === "happy" || num(accept) > 90 ? "happy" : mood === "shy" || num(accept) < 70 ? "shy" : "normal";
    return `nude_${base}`;
  }
  if (mood === "startled") return "startled";
  if (mood === "shy" || num(accept) < 35) return "shy";
  if (mood === "happy" || num(accept) > 70) return "happy";
  return "normal";
}
