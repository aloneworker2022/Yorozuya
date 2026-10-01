/* 妹子在日本的生活記憶。
 * 新經歷進馬上（10）。滿了才把最舊推進中（30），中滿了才推進長（1000）。
 * 不把馬上直接丟進長，也不每句從長記憶隨機換掉中記憶。
 * 聯想鍵只由地點、人、工作、心情這些欄位組，不讓模型自寫。
 */

const IMMEDIATE_CAP = 10;
const MID_CAP = 30;
const LONG_CAP = 1000;
const TEXT_CAP = 180;
const KEY_CAP = 8;
const MID_PICK = 10;
const LONG_PICK = 5;
const BORED_PICK = 3;
const DEDUPE_MS = 1500;

const KINDS = new Set(["home", "work", "stroll", "birth", "life"]);
const RECALL_RE = /想想|想一想|還記得|記不記得|記得嗎|有印象/;
const BORED_RE = /好無聊|無聊死|好閒|好悶|沒事做|在發呆/;

let seq = 0;

function nextId() {
  seq = (seq + 1) % 100000;
  return `lm${Date.now().toString(36)}${seq.toString(36)}`;
}

function clipText(raw) {
  const chars = Array.from(String(raw || "").replace(/\s+/g, " ").trim());
  if (chars.length <= TEXT_CAP) return chars.join("");
  return chars.slice(0, TEXT_CAP).join("");
}

function addKey(keys, raw) {
  const text = String(raw || "").trim();
  if (!text || text.length > 24 || keys.includes(text) || keys.length >= KEY_CAP) return;
  keys.push(text);
}

function friendSuffix(moment) {
  const name = String(moment.personName || "").trim();
  if (!name) return "";
  const event = String(moment.event || "");
  if (moment.known) return event.includes(name) ? "" : `因此認識了${name}。`;
  if (!moment.revisit) return "";
  if (moment.bondAdvanced === "familiar") return `跟${name}變熟了。`;
  if (moment.bondAdvanced === "physical") return `和${name}有了身體關係。`;
  if (moment.bondAdvanced === "fwb") return `和${name}成了炮友。`;
  return event.includes(name) ? "" : `又碰到${name}。`;
}

function flagSuffix(moment) {
  const bits = [];
  if (moment.sexIntensity === "continuous") bits.push("連續交配");
  else if (moment.sexIntensity === "marathon") bits.push("做到虛脫");
  if (moment.spasm) bits.push("痙攣");
  if (moment.pregnant) bits.push(String(moment.breeding || "配種成功"));
  return bits.length ? `（${bits.join("・")}）` : "";
}

function momentToText(moment) {
  const event = String(moment.event || "").replace(/\s+/g, " ").trim();
  if (moment.breeding || /生產了/.test(event)) return event;
  const tail = [friendSuffix(moment), flagSuffix(moment), event].filter(Boolean).join("");
  if (moment.placeName) {
    const tone = moment.toneName ? `遇到${moment.toneName}。` : "";
    const who = moment.roleName
      ? `碰到${moment.roleName}${moment.emotionName ? `，對方是${moment.emotionName}` : ""}。`
      : "";
    return `在${moment.placeName}亂逛。${tone}${who}${tail}`;
  }
  if (moment.job) {
    const tone = moment.toneName ? `遇到${moment.toneName}。` : "";
    const who = moment.roleName
      ? `在${moment.job}碰到${moment.roleName}${moment.emotionName ? `，對方是${moment.emotionName}` : ""}。`
      : `在${moment.job}打工。`;
    return `${who}${tone}${tail}`;
  }
  return tail || event;
}

function inferKind(raw) {
  if (raw.placeName || raw.kind === "stroll") return "stroll";
  if (raw.breeding || /生產了/.test(String(raw.event || raw.text || ""))) return "birth";
  if (raw.job) return "work";
  if (raw.kind === "home") return "home";
  return "life";
}

function normalizeItem(raw) {
  if (!raw || typeof raw !== "object") return null;
  const explicit = String(raw.text || "").trim();
  const text = clipText(explicit || (raw.event ? momentToText(raw) : ""));
  if (!text) return null;
  const kind = KINDS.has(raw.kind) ? raw.kind : inferKind(raw);
  const keys = [];
  if (kind === "home") addKey(keys, "住所");
  if (kind === "work") addKey(keys, "打工");
  if (kind === "stroll") addKey(keys, "遊盪");
  if (kind === "birth") addKey(keys, "生產");
  if (Array.isArray(raw.keys)) raw.keys.forEach((key) => addKey(keys, key));
  addKey(keys, raw.placeName || raw.place);
  addKey(keys, raw.job);
  addKey(keys, raw.personName || raw.person);
  addKey(keys, raw.emotionName || raw.mood);
  addKey(keys, raw.toneName);
  return {
    id: nextId(),
    at: Date.now(),
    kind,
    text,
    keys,
    place: String(raw.placeName || raw.place || "").trim(),
    job: String(raw.job || "").trim(),
    person: String(raw.personName || raw.person || "").trim(),
    mood: String(raw.emotionName || raw.mood || "").trim(),
  };
}

function blankMind() {
  return { immediate: [], mid: [], long: [], seeded: false };
}

function pushTier(mind, item) {
  mind.immediate.push(item);
  while (mind.immediate.length > IMMEDIATE_CAP) mind.mid.push(mind.immediate.shift());
  while (mind.mid.length > MID_CAP) mind.long.push(mind.mid.shift());
  while (mind.long.length > LONG_CAP) mind.long.shift();
}

function recentSameText(mind, text) {
  const now = Date.now();
  for (const tier of [mind.immediate, mind.mid, mind.long]) {
    for (let i = tier.length - 1; i >= 0; i--) {
      const item = tier[i];
      if (item?.text === text && now - (item.at || 0) < DEDUPE_MS) return true;
    }
  }
  return false;
}

export function ensureMind(who) {
  if (!who?.world || typeof who.world !== "object") return null;
  const world = who.world;
  if (!world.mind || typeof world.mind !== "object" || Array.isArray(world.mind)) world.mind = blankMind();
  const mind = world.mind;
  if (!Array.isArray(mind.immediate)) mind.immediate = [];
  if (!Array.isArray(mind.mid)) mind.mid = [];
  if (!Array.isArray(mind.long)) mind.long = [];
  if (!mind.seeded) {
    const old = Array.isArray(world.memories) ? world.memories : [];
    for (const moment of old) {
      const item = normalizeItem(moment);
      if (!item) continue;
      pushTier(mind, item);
    }
    mind.seeded = true;
  }
  return mind;
}

export function rememberExperience(who, raw) {
  const mind = ensureMind(who);
  if (!mind || !raw) return null;
  const item = normalizeItem(raw);
  if (!item) return null;
  if (recentSameText(mind, item.text)) return null;
  pushTier(mind, item);
  return item;
}

export function rememberHomeReturn(who) {
  if (!who?.world) return null;
  const name = String(who.world.home?.name || "").trim();
  return rememberExperience(who, {
    kind: "home",
    text: name ? `離開房間，回到住所${name}。` : "離開房間，回到住所。",
    place: name,
    keys: name ? ["住所", name] : ["住所"],
  });
}

function keyScore(item, utterance) {
  let score = 0;
  for (const key of item?.keys || []) {
    if (key && key.length >= 2 && utterance.includes(key)) score += 1;
  }
  return score;
}

function searchByKeys(items, utterance, cap) {
  const text = String(utterance || "");
  const scored = [];
  (items || []).forEach((item, index) => {
    const score = keyScore(item, text);
    if (score > 0 && item?.text) scored.push({ item, index, score });
  });
  scored.sort((a, b) => b.score - a.score || b.index - a.index);
  return scored.slice(0, cap).map((row) => row.item);
}

function pickMid(mid, utterance) {
  const hits = searchByKeys(mid, utterance, MID_PICK);
  const picked = [];
  const seen = new Set();
  for (const item of hits) {
    if (picked.length >= MID_PICK) break;
    picked.push(item);
    seen.add(item.id);
  }
  for (let i = mid.length - 1; i >= 0 && picked.length < MID_PICK; i--) {
    const item = mid[i];
    if (!item?.text || seen.has(item.id)) continue;
    picked.push(item);
    seen.add(item.id);
  }
  return picked;
}

function boredHits(long) {
  const uniq = [];
  for (const item of long || []) {
    for (const key of item?.keys || []) {
      if (key && key.length >= 2 && !uniq.includes(key)) uniq.push(key);
    }
  }
  if (!uniq.length) return [];
  const key = uniq[Math.floor(Math.random() * uniq.length)];
  const hits = [];
  for (let i = long.length - 1; i >= 0 && hits.length < BORED_PICK; i--) {
    if ((long[i]?.keys || []).includes(key)) hits.push(long[i]);
  }
  return hits;
}

export function lifeMemoryPromptLines(who, utterance, opts = {}) {
  const here = opts.here === "line" ? "line" : "room";
  const mind = ensureMind(who);
  if (!mind) return [];
  const text = String(utterance || "");
  const recalling = RECALL_RE.test(text);
  const imm = mind.immediate.filter((item) => item?.text);
  const mid = pickMid(mind.mid.filter((item) => item?.text), text);
  const lines = [];
  const recall = [];
  if (recalling) {
    const hits = searchByKeys(mind.long, text, LONG_PICK);
    const recentHit = searchByKeys(imm, text, 1).length || searchByKeys(mind.mid, text, 1).length;
    if (hits.length) {
      recall.push("他要你回想。只可以用下面這些，對不上的就說想不起來，不要編。");
      hits.forEach((item) => recall.push(`・想起：${item.text}`));
    } else if (!recentHit) {
      recall.push("他叫你想想，但更早的事裡沒有對上的。就說想不起來，不要編。");
    }
  } else if (BORED_RE.test(text) && mind.long.length) {
    const hits = boredHits(mind.long);
    if (hits.length) {
      recall.push("你這時有點閒，可以輕輕提起下面其中一件，不要一次講完，也不要編沒列的。");
      hits.forEach((item) => recall.push(`・想起：${item.text}`));
    }
  }
  if (!imm.length && !mid.length && !recall.length) return [];
  if (here === "room") lines.push("人現在在房間，下面是記得的日本生活，不是現在站的地方。");
  if (imm.length || mid.length) {
    lines.push("【現在記憶】跟這句話有關才提，不要每句都報。沒有列在這裡的事不要編成已經發生。");
    imm.forEach((item) => lines.push(`・剛發生：${item.text}`));
    mid.forEach((item) => lines.push(`・稍早：${item.text}`));
  }
  lines.push(...recall);
  return lines;
}
