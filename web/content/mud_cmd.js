// MUD 指令表：看 ≠ 摸。世界只認 verb + target，台詞另走 say。

export const PARTS = [
  { id: "breast", names: ["胸部", "乳房", "胸", "奶", "breast", "bust", "chest"] },
  { id: "nipple", names: ["乳頭", "奶頭", "nipple"] },
  { id: "areola", names: ["乳暈", "areola"] },
  { id: "labia", names: ["陰唇", "小穴", "私處", "下面", "labia", "pussy"] },
  { id: "clit", names: ["陰蒂", "clit", "clitoris"] },
  { id: "butt", names: ["臀部", "屁股", "臀", "butt", "ass", "hip"] },
  { id: "waist", names: ["腰", "腰身", "waist"] },
  { id: "thigh", names: ["大腿", "腿", "thigh"] },
  { id: "lips", names: ["嘴唇", "嘴", "唇", "lips", "mouth"] },
  { id: "body", names: ["身體", "全身", "她", "body"] },
];

const VERB_HEADS = [
  { verb: "look", re: /^(?:look|examine|inspect|l|看|觀察|瞄|注視|瞧瞧|打量)(?:看)?\s*/i },
  { verb: "touch", re: /^(?:touch|grope|fondle|摸|揉|碰|撫|抓|捏)\s*/i },
  { verb: "lick", re: /^(?:lick|舔)\s*/i },
  { verb: "suck", re: /^(?:suck|吸|含)\s*/i },
  { verb: "kiss", re: /^(?:kiss|親|吻)\s*/i },
  { verb: "grind", re: /^(?:grind|頂|磨|頂弄)\s*/i },
  { verb: "lift", re: /^(?:lift|掀|掀開|掀起)\s*/i },
  { verb: "strip", re: /^(?:strip|undress|脫掉|脫下|解開|脫)\s*/i },
  { verb: "sit", re: /^(?:sit|坐下|坐)\s*/i },
  { verb: "propose", re: /^(?:propose|提議|建議|問要去哪)\s*/i },
  { verb: "hypnotize", re: /^(?:hypnotize|催眠)\s*/i },
  { verb: "go", re: /^(?:go|walk|去|走去|走向|走到|前往|過去|走)\s*/i },
  { verb: "follow", re: /^(?:follow|跟隨|跟著|跟上去|跟來|跟過去)\s*/i },
  { verb: "escape", re: /^(?:escape|躲開|逃走|甩掉)\s*/i },
  { verb: "say", re: /^(?:say|說|講|道)\s+/i },
  { verb: "wait", re: /^(?:wait|等|等待|站著|站在原地)(?:等她(?:走近)?)?\s*$/i },
  { verb: "wave", re: /^(?:wave|揮手)\s*$/i },
  { verb: "masturbate", re: /^(?:masturbate|自慰|打手槍|尻)\s*$/i },
];

const PHRASES = [
  { re: /坐到.*椅|坐下等/, verb: "wait", target: "" },
  { re: /四處看看|看看周圍|看四周|look around/, verb: "look", target: "" },
  { re: /查看|看狀態|看 狀態/, verb: "look", target: "狀態" },
  { re: /往入口|去入口|到門口/, verb: "go", target: "入口" },
  { re: /沿步道|去步道/, verb: "go", target: "步道" },
  { re: /去水池|水池邊/, verb: "go", target: "水池" },
  { re: /去廣場/, verb: "go", target: "廣場" },
  { re: /去樹林/, verb: "go", target: "樹林區" },
  { re: /去廁所/, verb: "go", target: "廁所" },
  { re: /去兒童|遊戲區/, verb: "go", target: "兒童遊戲區" },
  { re: /問要去哪|要去哪裡/, verb: "propose", target: "去哪" },
  { re: /^提議\s*(.+)$/, verb: "propose", target: "$1" },
  { re: /帶她躲開|帶她逃走|帶她逃|拉她跑|甩掉他|躲開他/, verb: "escape", target: "" },
  { re: /跟隨|跟著走|跟上去/, verb: "follow", target: "" },
  { re: /走過去打招呼|打招呼/, verb: "say", target: "", say: "嗨。" },
  { re: /站在原地等她走近/, verb: "wait", target: "" },
  { re: /^(?:先看她穿什麼|看她)$/, verb: "look", target: "她" },
];

const TOUCH_ZH = { touch: "摸", lick: "舔", kiss: "親", suck: "吸", grind: "磨" };
const PART_ZH = Object.fromEntries(PARTS.map((p) => [p.id, p.names[0]]));

export function findPart(text) {
  const s = String(text || "").trim().toLowerCase();
  if (!s) return null;
  for (const p of PARTS) {
    for (const n of p.names) {
      if (s === n.toLowerCase() || s.includes(n.toLowerCase())) return p;
    }
  }
  return null;
}

function splitSay(raw) {
  let text = String(raw || "").trim();
  let say = "";
  const labeled = text.match(/^指令\s*[:：]\s*([\s\S]+?)(?:\n+\s*台詞\s*[:：]\s*([\s\S]*))?$/);
  if (labeled) {
    text = labeled[1].trim();
    say = (labeled[2] || "").trim();
  }
  const pipe = text.split(/\s*[｜|]\s*/);
  if (pipe.length >= 2) {
    text = pipe[0].trim();
    say = pipe.slice(1).join(" ").trim();
  }
  return { text, say };
}

export function parseMudInput(raw) {
  const split = splitSay(raw);
  let text = split.text;
  let say = split.say;
  if (!text) return { verb: "wait", target: "", part: null, say, display: "等", raw: String(raw || "") };

  for (const ph of PHRASES) {
    const m = text.match(ph.re);
    if (!m) continue;
    const target = (ph.target || "").includes("$1") ? (m[1] || "").trim() : ph.target || "";
    return {
      verb: ph.verb,
      target,
      part: findPart(target),
      say: say || ph.say || "",
      display: text,
      raw: String(raw || ""),
    };
  }

  for (const v of VERB_HEADS) {
    const m = text.match(v.re);
    if (!m) continue;
    const rest = text.slice(m[0].length).trim();
    if (v.verb === "say") {
      return { verb: "say", target: "", part: null, say: say || rest, display: text, raw: String(raw || "") };
    }
    const part = findPart(rest);
    return {
      verb: v.verb,
      target: rest,
      part,
      say,
      display: text,
      raw: String(raw || ""),
    };
  }

  // 「看胸部」黏在一起、沒先寫動詞空白
  const part = findPart(text);
  if (part) {
    const looking = /看|觀察|瞄|注視|瞧瞧|打量/.test(text);
    const touching = /摸|揉|碰|撫|抓|捏/.test(text);
    const licking = /舔/.test(text);
    const sucking = /吸|含/.test(text);
    const grinding = /頂|磨/.test(text);
    const lifting = /掀/.test(text);
    const kissing = /親|吻/.test(text);
    if (looking && !touching && !licking && !kissing && !sucking && !grinding && !lifting) {
      return { verb: "look", target: part.names[0], part, say, display: text, raw: String(raw || "") };
    }
    if (licking) return { verb: "lick", target: part.names[0], part, say, display: text, raw: String(raw || "") };
    if (sucking) return { verb: "suck", target: part.names[0], part, say, display: text, raw: String(raw || "") };
    if (grinding) return { verb: "grind", target: part.names[0], part, say, display: text, raw: String(raw || "") };
    if (lifting) return { verb: "lift", target: part.names[0], part, say, display: text, raw: String(raw || "") };
    if (kissing) return { verb: "kiss", target: part.names[0], part, say, display: text, raw: String(raw || "") };
    if (touching) return { verb: "touch", target: part.names[0], part, say, display: text, raw: String(raw || "") };
  }

  if (/^去/.test(text)) {
    return { verb: "go", target: text.replace(/^去/, "").trim(), part: null, say, display: text, raw: String(raw || "") };
  }

  return { verb: "say", target: "", part: null, say: say || text, display: text, raw: String(raw || "") };
}

export function touchFakeText(cmd) {
  const v = TOUCH_ZH[cmd.verb] || "摸";
  const p = cmd.part ? PART_ZH[cmd.part.id] : cmd.target;
  return p ? `${v}${p}` : v;
}

export function parseAiMud(raw) {
  const s = String(raw || "").trim();
  const cmdM = s.match(/指令\s*[:：]\s*(.+)/);
  const sayM = s.match(/台詞\s*[:：]\s*([\s\S]+)/);
  if (cmdM || sayM) {
    const cmd = parseMudInput((cmdM ? cmdM[1].split("\n")[0] : "等") + (sayM ? "｜" + sayM[1].trim() : ""));
    return cmd;
  }
  return parseMudInput(s);
}

/**
 * 依場景算出「現在能做的指令」。
 * ctx: { girlHere, lifeOnly, exits, foci, clothes, actor: "male"|"girl" }
 */
export function listAvailableCommands(ctx = {}) {
  const girlHere = !!ctx.girlHere;
  const life = !!ctx.lifeOnly;
  const male = ctx.actor !== "girl";
  const player = ctx.actor === "player";
  const exits = ctx.exits || [];
  const foci = ctx.foci || [];
  const c = ctx.clothes || { top: true, bottoms: true, bra: true, panties: true };
  const maxAct = ctx.maxActLevel == null ? 6 : Number(ctx.maxActLevel);
  const rows = [];

  const look = ["看 這裡"];
  if (player) look.push("查看");
  if (girlHere && male) look.push("看 她", "看 胸部", "看 臀部");
  if (girlHere && !male) look.push("看 他");
  if (girlHere && male && (!c.top || !c.bra)) look.push("看 乳頭");
  if (girlHere && male && (!c.bottoms || !c.panties)) look.push("看 陰唇");
  for (const f of foci.slice(0, 3)) look.push(`看 ${f}`);
  rows.push({ verb: "看", samples: look });

  if (exits.length && !player) rows.push({ verb: "走", samples: exits.map((e) => `走 ${e}`) });
  if ((ctx.propose || []).length) rows.push({ verb: "提議", samples: ctx.propose });
  if (ctx.canHypnotize) rows.push({ verb: "催眠", samples: ["催眠"] });
  if (ctx.canFollow) rows.push({ verb: "跟隨", samples: ["跟隨"] });
  if (ctx.canEscape) rows.push({ verb: "躲開", samples: ["帶她躲開"] });
  rows.push({ verb: "坐", samples: ["坐"] });
  rows.push({ verb: "等", samples: ["等"] });
  rows.push({ verb: "說", samples: ["說 嗨"] });
  rows.push({ verb: "揮手", samples: ["揮手"] });
  if (player && ctx.canMasturbate) rows.push({ verb: "自慰", samples: ["自慰"] });

  if (girlHere && !life && male && maxAct >= 2) {
    rows.push({ verb: "親", samples: ["親 嘴唇"] });
    if (maxAct >= 3) {
      const grope = ["摸 胸部", "摸 腰", "摸 臀部"];
      if (maxAct >= 4) grope.push("摸 陰唇");
      rows.push({ verb: "摸", samples: grope });
    }
    if (maxAct >= 4) {
      rows.push({ verb: "舔", samples: ["舔 嘴唇", "舔 胸部", "舔 陰唇"] });
      const lewd = ["揉 胸部", "捏 乳頭", "吸 乳頭", "掀 裙子"];
      if (maxAct >= 6) lewd.push("頂 臀", "磨 下面");
      rows.push({ verb: "猥褻", samples: lewd });
      const strip = [];
      if (c.top) strip.push("脫 上衣");
      if (c.bra) strip.push("脫 胸罩");
      if (c.bottoms) strip.push("脫 褲子");
      if (c.panties) strip.push("脫 內褲");
      if (strip.length) rows.push({ verb: "脫", samples: strip });
    }
  }

  return rows;
}

export function formatCommandSheet(rows) {
  const lines = ["【指令】看≠摸。寫法：動詞 目標｜台詞"];
  for (const r of rows || []) {
    lines.push(`${r.verb}  ${(r.samples || []).join(" / ")}`);
  }
  return lines.join("\n");
}

export function commandSheetSamples(rows, limit = 10) {
  const out = [];
  for (const r of rows || []) {
    for (const s of r.samples || []) {
      if (out.length >= limit) return out;
      out.push(s);
    }
  }
  return out;
}
