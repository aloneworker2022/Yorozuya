/** 約會聊天劇本：分類關鍵字與 AI 規則。/edit_date 可改，寫回 edit_date.json。 */

export const DATE_ACT_ZH = {
  interact: "互動",
  talk: "言語調戲",
  tease: "調戲",
  molest: "猥褻",
  eat: "吃東西",
  end: "回家",
  rescue: "帶女子脫離騷擾",
  oral: "口交",
  sex: "做愛",
};

export const DEFAULT_DATE_SCRIPT = {
  girl_system: [
    "你正在公園跟他約會。人就在他眼前。這不是店頭看板，這是約會現場。",
    "回話必須符合上方「你和他現在的關係」，但這是約會現場：陌生也比店頭鬆——人已經願意出門，可以接話、可以吐槽，越界用害羞／無奈擋，不要盛怒仇視。朋友羞怒、女友害羞但身體享受、妻子順從享受。個性只決定怎麼說，關係決定能說什麼。",
    "系統會另外注入這一拍的【場景】。你要帶入場景裡正在發生的事來回話，不要當沒這回事。",
    "【只輸出台詞】只寫你說出口的話。不要角色名冒號。禁止身體動作、表情、姿態、喘息等描寫。長度以上方關係段為準。",
    "只能對已經發生的事做反應。不准下達行動、不准提議換地、不准結束約會、不准唸出體力／性慾／羞恥／感情的數字。",
    "這裡不能口交、不能做愛。他若開口要求，用台詞擋回去，不要配合演出。",
    "言語調戲用話接。猥褻是他已經動手——依關係反應，不要自己把場面做成口交或做愛。",
  ].join("\n"),
  narr_system:
    "你是約會場景的旁白。只根據已經發生的事寫 1～2 句中文旁白，旁白主要是人物體態動作，神情，場景描述。不要寫人物台詞，不要替任何人下指令，不要發明新事件，不要唸數值。不要寫成口交或做愛。",
  acts: {
    tease: [
      { narr: "玩家靠過去一點，壓低聲音。", player: "這裡人還不少。妳臉有點紅。" },
      { narr: "玩家看她站姿，故意把話講得很近。", player: "這樣站著很好看。被看到也沒關係。" },
      { narr: "玩家用肩膀輕輕碰她一下。", player: "跟緊一點。風有點大。" },
      { narr: "玩家把視線停在她身上，笑了一下。", player: "妳等一下也這樣給我看？" },
      { narr: "有人走過去，玩家卻只看她。", player: "他們走了。現在輪到我看妳。" },
      { narr: "玩家側過身擋住一點視線。", player: "靠近一點。就說一句。" },
      { narr: "玩家盯著她的領口，語氣像在開玩笑。", player: "這件衣服很襯妳。還是在襯我。" },
    ],
    molest: [
      { narr: "趁她看旁邊的空檔，手從後面碰她腰。", player: "別動。沒人注意這邊。" },
      { narr: "玩家站到她身後，掌心貼上她腰側。", player: "站好。假裝還在看前面。" },
      { narr: "有人走過去，玩家的手指在她衣襬邊。", player: "等他們走過去。" },
      { narr: "玩家用身體擋住側邊視線，手往她背上滑。", player: "廣場很大，沒人盯著妳。" },
      { narr: "玩家的手環過她腰，把她帶近一點。", player: "靠過來。就幾秒。" },
      { narr: "她視線還在場中央，玩家的拇指在她腰窩按一下。", player: "看前面就好。" },
      { narr: "玩家的手從腰側往上，隔著衣服停在她胸口下緣。", player: "噓。別叫出來。" },
    ],
  },
  classify: {
    oral: {
      keywords: [
        "口交", "含住", "含著", "幫我口", "給我吸", "幫我吸", "口我", "吹簫",
        "舔雞", "吃雞", "含我", "舔我的", "用嘴",
      ],
      refuse: "這裡不能口交。",
    },
    sex: {
      keywords: [
        "交配", "做愛", "幹你", "肏你", "我要幹", "我要肏", "插你", "幹死",
        "猛幹", "猛操", "猛糙", "內射", "中出", "插入", "騎乘", "上來騎",
        "坐上來", "騎我", "後入", "從後面幹", "狗爬", "趴下給我",
      ],
      refuse: "這裡不能做愛。",
    },
    molest: {
      keywords: [
        "猥褻", "亂摸", "動手", "摸奶", "摸乳", "揉奶", "揉胸", "摸胸",
        "吃奶", "吸奶", "玩奶", "摸臀", "揉臀", "摸屁股", "揉屁股", "打屁股",
        "捏臀", "伸進", "掀裙", "掀衣服", "脫她", "脫你", "摸下面", "摳她",
        "摳你", "把手伸", "隔衣摸", "從後面抱", "抓胸", "抓臀",
        "摸乳頭", "捏奶", "摟腰", "把手放進",
      ],
    },
    talk: {
      keywords: [
        "言語調戲", "色話", "黃色", "下流", "騷貨", "想摸你", "內衣",
        "內褲", "胸型", "奶子真", "下面是不是", "今晚能不能", "叫我一聲",
        "欠摸", "想舔妳", "想舔你", "調戲", "色色", "想看妳", "想看你",
        "乳頭", "陰唇", "濕了沒",
      ],
    },
  },
};

function linesOf(list, fallback) {
  const src = Array.isArray(list) ? list : fallback;
  const out = [];
  const seen = new Set();
  for (const x of src) {
    const s = String(x || "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
  }
  return out;
}

function actList(list, fallback) {
  const src = Array.isArray(list) && list.length ? list : fallback;
  return src
    .map((x) => ({
      narr: String(x?.narr || "").trim(),
      player: String(x?.player || "").trim(),
    }))
    .filter((x) => x.narr && x.player);
}

export function formatActs(list) {
  return actList(list, []).map((x) => `${x.narr}\n${x.player}`).join("\n\n");
}

export function parseActs(text) {
  return String(text || "")
    .split(/\n\s*\n/)
    .map((block) => {
      const ls = block.split("\n").map((s) => s.trim()).filter(Boolean);
      if (ls.length < 2) return null;
      return { narr: ls[0], player: ls.slice(1).join("") };
    })
    .filter(Boolean);
}

export function normalizeDateScript(raw) {
  const d = DEFAULT_DATE_SCRIPT;
  const src = raw && typeof raw === "object" ? raw : {};
  const cls = src.classify && typeof src.classify === "object" ? src.classify : {};
  const block = (key) => {
    const cur = cls[key] && typeof cls[key] === "object" ? cls[key] : {};
    const base = d.classify[key];
    const out = { keywords: linesOf(cur.keywords, base.keywords) };
    if (base.refuse != null) out.refuse = String(cur.refuse || base.refuse);
    return out;
  };
  const acts = src.acts && typeof src.acts === "object" ? src.acts : {};
  return {
    girl_system: String(src.girl_system || d.girl_system).trim() || d.girl_system,
    narr_system: String(src.narr_system || d.narr_system).trim() || d.narr_system,
    classify: {
      oral: block("oral"),
      sex: block("sex"),
      molest: block("molest"),
      talk: block("talk"),
    },
    acts: {
      tease: actList(acts.tease, d.acts.tease),
      molest: actList(acts.molest, d.acts.molest),
    },
  };
}

export function classifyDateLine(text, script) {
  const t = String(text || "");
  const cls = normalizeDateScript(script).classify;
  const hit = (kws) => (kws || []).some((k) => k && t.includes(k));
  if (hit(cls.oral.keywords)) return { act: "oral", refuse: cls.oral.refuse };
  if (hit(cls.sex.keywords)) return { act: "sex", refuse: cls.sex.refuse };
  if (hit(cls.molest.keywords)) return { act: "molest" };
  if (hit(cls.talk.keywords)) return { act: "talk" };
  return { act: "interact" };
}
