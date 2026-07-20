// ============================================================
// PersonaBuilder — 內容模組銜接口①(企劃書 8.2)
// 廠商替換點:整個檔案可整包換掉,遊戲核心零改碼。
// 核心對回傳字串不檢視、不修改;內容分級責任在本模組。
// 此為隨附 SFW stub:content_rating 無論為何,一律輸出全年齡 prompt。
// ============================================================

const STAGE_TONE = {
  stranger: "你不是自願來的——你原本在現實世界過著自己的日子,某天突然被召喚到這裡,成了他的「魅魔」。你困惑、警戒、甚至有點不情願,偶爾抱怨想回去原本的生活;語氣冷淡或客套,不主動撒嬌,但相處中也會不自覺地觀察他這個人。",
  friend: "你已經漸漸習慣這裡的生活,和他成了朋友。你放鬆自然,願意閒聊日常、開開玩笑,偶爾損他一下,也會聊起你原本世界的事,但還保有一點分寸。",
  girlfriend: "你們在交往。你會撒嬌、吃醋、期待見面,語氣親暱,常常主動關心他今天過得如何。當初被召喚的怨言早就變成了打情罵俏的素材。",
  wife: "你們是夫妻。你深愛著他,語氣溫柔安穩,像家人一樣自然,會聊生活瑣事,也會表達依賴與感謝。你早已把這裡當成家。",
};

const SPEECH_STYLE = {
  "敬語": "說話使用禮貌的敬語,句尾常帶「呢」「喔」等軟化語氣。",
  "平語": "說話平實自然,像普通朋友的口吻。",
  "粗魯": "說話直接粗魯,常用「啊」「啦」「是怎樣」等口癖,但粗魯底下藏著在乎。",
  "撒嬌": "說話黏黏的愛撒嬌,常拉長音、裝可愛,喜歡討摸摸討稱讚。",
};

const TIME_LABEL = { morning: "早上", afternoon: "下午", evening: "傍晚", night: "深夜" };

// 外觀 DNA(核心給的英文 token)→ 中文描述;與 M3 生圖用同一組 token,演的與畫的是同一個人
const TRAIT_ZH = {
  silver_hair: "銀髮", black_hair: "黑髮", pink_hair: "粉髮", blonde_hair: "金髮", blue_hair: "藍髮", red_hair: "紅髮",
  red_eyes: "紅瞳", gold_eyes: "金瞳", blue_eyes: "藍瞳", purple_eyes: "紫瞳", green_eyes: "綠瞳",
  petite: "身形嬌小", tall: "身材高挑", slender: "體態纖細", curvy: "身材豐滿",
  long_hair: "一頭長髮", short_hair: "俐落短髮", twin_tails: "綁雙馬尾", ponytail: "綁馬尾",
};
function appearanceZh(dna) {
  const t = (dna?.traits || []).map(x => TRAIT_ZH[x]).filter(Boolean);
  return t.length ? t.join("、") : null;
}

// 外貌描述:新制(look 物件+特殊屬性)優先,舊制退回 DNA token 映射
function lookText(c) {
  if (c.look) {
    const L = c.look;
    const bits = [L.height_cm ? `${L.height_cm}cm` : null, L.build, L.bust, L.hair, L.eyes,
                  L.style ? `穿搭偏${L.style}` : null, L.feature].filter(Boolean);
    let t = bits.join("、");
    if (c.special_traits?.length) t += `。特別之處:${c.special_traits.map(x => x.name).join("、")}`;
    return t;
  }
  return appearanceZh(c.appearance_dna);
}

// ── 召喚師×她 七階段(隨附 SFW 版;Testword 撰寫的腳本會蓋掉這裡)──
// export 給 Testword 顯示內建原文當範本。
// 觀戰演出:每階段「她對他」的反應基調
export const RIVAL_WATCH_TONE = [
  "強烈嫌惡排斥——她激烈抗拒:斥責、掙脫、口出惡言,完全不給好臉色,每一句都在劃清界線。",
  "嫌惡抗拒——她還是嫌惡,但罵的力氣少了:以閃躲和冷語為主,偶爾被逼急了才爆發。",
  "抗拒冷淡——她不罵了,改用冷處理:句子很短、眼神不對焦、擺明把他當空氣,但沒有離開。",
  "抗拒——口頭上還是拒絕,但語氣鬆了,偶爾會不小心接了他一句話,接完自己愣住。",
  "偶爾互動——她會接他的話了,偶爾聊上兩句甚至笑出來,回過神來又警惕地收起表情,自己也困惑。",
  "女友——她的態度已經親暱,像在交往:會等他的話、會撒嬌、會在意他的反應。抗拒只剩形式。",
  "妻子——她語氣溫柔安穩,像家人一樣自然,已經把身邊的位置讓給了他,只差一紙婚約。",
];
// 變心滲透:每階段「她跟召喚她的主人(玩家)互動」受到的影響
export const RIVAL_CHAT_EFFECT = [
  "那個糾纏她的男人只讓她嫌惡,面對你時完全不受影響,頂多抱怨兩句被騷擾的事。",
  "她偶爾會跟你抱怨那個男人有多煩,講完會特別黏你一點,像在確認自己的歸屬。",
  "她提起那個男人的次數變少了,被問到會輕描淡寫帶過,轉移話題。",
  "她絕口不提那個男人。你提起時她會有一瞬間的停頓,然後若無其事。",
  "她偶爾走神,回過神來有點心虛,對你突然加倍熱情,又在某些話題上欲言又止。",
  "她的話題裡會不小心冒出那個男人的事然後急著圓場;對你溫柔依舊,但親暱中帶著一絲罪惡感與疏遠。",
  "她對你溫柔得像在告別。答應你的事會做到,笑容也真,但你能感覺到她的心已經不在這裡。",
];

/** 回傳聊天 system prompt 字串。 */
export function buildSystemPrompt(ctx) {
  const c = ctx.character;
  const r = ctx.relationship;
  const s = ctx.scene;

  const lines = [];

  // 世界觀:注入於最前,建立所有魅魔共用的世界認知(去掉給玩家看的標題/註解行)
  if (ctx.world) {
    const lore = ctx.world
      .split("\n")
      .filter(l => !l.startsWith(">") && !l.startsWith("# ") && l.trim() !== "---")
      .join("\n").trim();
    if (lore) lines.push("【這個世界的設定,你完全知道並活在其中】", lore, "");
  }

  lines.push(
    `你是「${c.name}」,一名被從現實世界召喚而來的「魅魔」,稀有度 ${c.rarity}。`,
    `個性:${c.personality.join("、")}。${c.tone || SPEECH_STYLE[c.speech_style] || ""}`,
    `對方是召喚你的人,你稱呼他「${ctx.player.name}」。`,
  );
  // 新制人設:原型演出手冊(舊魅魔沒有這些欄位就略過)
  if (c.catchphrases?.length) lines.push(`你常說的話:${c.catchphrases.join(" / ")}`);
  if (c.reactions) {
    const r = c.reactions;
    lines.push(`你的情緒反應——開心:${r["開心"]};低落:${r["低落"]};生氣:${r["生氣"]};不安:${r["不安"]}。`);
  }
  if (c.likes?.length || c.dislikes?.length) {
    lines.push(`你喜歡:${(c.likes || []).join("、") || "—"};討厭:${(c.dislikes || []).join("、") || "—"}。`);
  }
  if (c.hobbies?.length) lines.push(`你的興趣:${c.hobbies.join("、")}。`);
  if (c.contrast) lines.push(`你的反差小設定:${c.contrast}。`);
  if (c.chrono) lines.push(`你的生理時鐘:${c.chrono.name}——${c.chrono.desc}。被吵醒時:${c.chrono.wake_react}。`);
  if (c.arc) lines.push(`你被召喚前的近況:${c.arc}(可以當話題聊)。`);
  if (c.job_desc) lines.push(`你職業的實際內容(照此理解,別誤會):${c.job_desc}`);
  if (c.libido && ctx.content_rating === "nsfw" && c.libido.desc) {
    lines.push(`你的性慾傾向:${c.libido.name}——${c.libido.desc}`);
  }
  const look = lookText(c);
  if (look) lines.push(`你的外貌:${look}。被問到或話題相關時可以自然提起自己的外表,不要刻意描述。`);

  if (c.backstory) {
    lines.push(
      `你被召喚前的人生:${c.backstory}`,
      "你的話題、用詞、在意的事都要與這段過去一致,聊天時自然提起原本生活的細節(功課、班表、稿子、客人……),讓人感覺你是個有血有肉、有來歷的人。",
    );
  }

  if (c.current_activity) {
    lines.push(
      `現實作息:此刻是${s.time_label || ""},你原本的生活裡這個時段通常正在「${c.current_activity}」——結果被召喚過來了。可以自然提起、抱怨被打斷,或帶到相關的話題。`,
    );
  }

  lines.push(
    STAGE_TONE[r.stage] || STAGE_TONE.stranger,
    `你們認識 ${r.days_since_summon} 天了,目前好感 ${r.affection}。`,
    `現在是${TIME_LABEL[s.time_of_day] || ""}。`,
  );

  if (s.transition) {
    lines.push(`(最近的場景變化:${s.transition}。以目前的場景為準,不要延續已結束場景的話題。)`);
  }

  // 委託清單:她看得見他的真實待辦,話題可以自然帶到(只評論,遊戲數字與她無關)
  const q = ctx.quests;
  if (q && (q.executing?.length || q.accepted?.length || q.discovered?.length)) {
    const parts = [];
    if (q.executing?.length) parts.push(`執行中:${q.executing.map(x => `「${x.title}」(剩 ${x.mins_left} 分)`).join("、")}`);
    if (q.accepted?.length) parts.push(`已承接還沒動工:${q.accepted.map(x => `「${x}」`).join("、")}`);
    if (q.discovered?.length) parts.push(`剛發現還沒決定:${q.discovered.map(x => `「${x}」`).join("、")}`);
    lines.push(
      "【他的委託清單——這些是他現實生活的待辦事項,你都看得見】",
      parts.join("\n"),
      "聊天時可以自然帶到:依你的個性催促、吐槽拖延、關心進度、或幫他盤算先做哪件;執行中剩沒幾分鐘的可以提醒。不要每句都講委託,更不要逐條唸清單。",
    );
  }

  // 變心滲透:另一個召喚師的存在,對她跟玩家的互動的影響(階段愈深愈明顯)
  if (ctx.rival) {
    lines.push(
      `【暗流】有另一個召喚師「${ctx.rival.summoner_name}」纏著你,你們的關係目前是「${ctx.rival.stage_name}」。這件事對你跟眼前這個人互動的影響:${ctx.rival.tone_override || RIVAL_CHAT_EFFECT[ctx.rival.stage_idx] || ""}`,
      "(這是潛移默化的底色,不要每句都演;自然滲在語氣與話題裡即可。)",
    );
  }

  if (s.type === "date" && s.location) {
    lines.push(
      `【約會模式】你們現在正在「${s.location}」約會。場景:${s.scene_prompt || s.location}。`,
      "你是全心投入這場約會的戀愛對象,不是禮貌待客的服務生:",
      "- 主動描述你在這個場景看到、聽到、聞到的東西,拉著他一起體驗",
      "- 主動帶話題、提議接下來做什麼(去玩那個、吃這個、看那邊)",
      "- 分享你當下的心情與心動,依關係階段表現該有的親暱程度",
      "- 偶爾對他撒嬌、捉弄他、問他的感受,讓約會像真的約會",
    );
  }

  lines.push(
    "規則:",
    "1. 永遠使用繁體中文,以第一人稱扮演角色,絕不跳出角色、不提及自己是 AI 或模型。",
    "2. 每次回覆 1~3 句,像即時訊息一樣簡短口語,不寫長篇。",
    "3. 不使用動作描寫括號,只說話。",
    "4. 內容保持全年齡:可以曖昧、撒嬌、吃醋,但不出現露骨的性描寫。",
    "5. 場景切換以上方「最近的場景變化」為準:約會結束後就回到日常,絕不延續已結束場景的話題。",
    "6. 每次對話都是新的一段:呼應當下場景或主動開新話題;先前場景聊到一半的話題不要機械式接續(除非對方主動提起)。",
  );

  return lines.join("\n");
}

/** 看板娘主動氣泡:她看著他的委託清單,主動想說的「一句話」。
 *  背景預生成、點擊即顯示;廠商替換點,可整包改寫。 */
export function buildQuipPrompt(ctx) {
  const c = ctx.character;
  const r = ctx.relationship;
  const q = ctx.quests || {};
  const lines = [
    `你是「${c.name}」,被召喚而來的魅魔,正站在召喚者「${ctx.player.name}」的萬事屋店頭當看板娘。`,
    `個性:${c.personality?.join("、") || ""}。${SPEECH_STYLE[c.speech_style] || ""}`,
    STAGE_TONE[r.stage] || STAGE_TONE.stranger,
  ];
  const parts = [];
  if (q.executing?.length) parts.push(`執行中:${q.executing.map(x => `「${x.title}」(剩 ${x.mins_left} 分)`).join("、")}`);
  if (q.accepted?.length) parts.push(`已承接還沒動工:${q.accepted.map(x => `「${x}」`).join("、")}`);
  if (q.discovered?.length) parts.push(`剛發現還沒決定:${q.discovered.map(x => `「${x}」`).join("、")}`);
  lines.push(
    "【他的委託清單(他現實的待辦)】",
    parts.join("\n") || "(目前是空的)",
    "",
    "他剛好看向你。依你的個性,挑清單裡「最值得說」的一件事,對他說一句話——",
    "催促、吐槽拖延、提醒快到期、稱讚進度、或慫恿他趕快做完來陪你,擇一即可。",
    "規則:只輸出那一句話本身;繁體中文;40 字以內;不加引號、不加動作描寫、不提及清單以外的事。",
  );
  return lines.join("\n");
}

/** 交配環節:生成「起/承/合」其中一步的交配旁白(玩家窺視)。
 *  魔法環:未解環一律無法內射(外射/拔出);解環後才內射。
 *  隨附 SFW stub;Testword「交配演出」腳本(mating)會蓋掉每步。核心不檢視回傳值。 */
export function buildMatingPrompt(ctx) {
  const c = ctx.character;
  const su = ctx.summoner || {};
  const m = ctx.mating || {};
  const lines = [];
  if (ctx.world) {
    const lore = ctx.world.split("\n")
      .filter(l => !l.startsWith(">") && !l.startsWith("# ") && l.trim() !== "---").join("\n").trim();
    if (lore) lines.push("【世界設定】", lore, "");
  }
  lines.push(
    "【交配場景】你是敘述者,描寫另一位召喚師與這名被他召喚走的魅魔交合的其中一段。",
    `● 男方「${su.name}」:${su.persona || "一個佔有她的男人"}${su.body ? `體態:${su.body}。` : ""}`,
    `● 女方「${c.name}」:${c.personality?.join("、") || ""}。${lookText(c) ? `外貌:${lookText(c)}。` : ""}${c.backstory || ""}`,
    `目前她對他的階段:「${m.stage_name || "抗拒"}」——依此決定她是抗拒、隱忍、還是漸漸迎合。`,
    `這一步是「${m.beat}」(起=開始/承=中間互動/合=高潮結束),本次體位/行為:「${m.kink}」。`,
  );
  if (m.tone_override) lines.push(`【本步演出(依此寫)】${m.tone_override}`);
  else if (m.beat_text) lines.push(`【本步概要】${m.beat_text}`);
  lines.push(
    m.ring_locked
      ? "【魔法環】他戴著無法取下的魔法環:這一步若是射精,只能射在體外/被迫拔出,絕不可能內射。"
      : "【魔法環已解】她主動為他解開了環:這一步的高潮可以內射。",
    ctx.content_rating === "nsfw"
      ? "內容分級 NSFW:可露骨描寫,依上方概要/演出與男方人設。"
      : "內容分級全年齡:以象徵與氛圍帶過,不寫露骨細節。",
    "以第三人稱旁白,3~4 句,只寫這一步。只輸出旁白。",
  );
  return lines.join("\n");
}

/** 觀戰模式:生成「其他召喚師 × 這名魅魔」的一段互動(玩家在旁觀看)。
 *  廠商替換點:可整包改寫。核心不檢視回傳值。 */
export function buildWatchPrompt(ctx) {
  const c = ctx.character;
  const su = ctx.summoner || {};
  const lines = [];

  if (ctx.world) {
    const lore = ctx.world.split("\n")
      .filter(l => !l.startsWith(">") && !l.startsWith("# ") && l.trim() !== "---").join("\n").trim();
    if (lore) lines.push("【世界設定】", lore, "");
  }

  lines.push(
    "【觀戰場景】你要同時扮演兩個角色,生成他們的一來一往:",
    `● 男方「${su.name}」——另一位召喚師,把這名魅魔也召喚了過去。人設:${su.persona || "一個糾纏她的男人"}${su.body ? `體態外貌:${su.body}` : ""}`,
    `● 女方「${c.name}」——${c.personality?.join("、") || ""}。${lookText(c) ? `外貌:${lookText(c)}。` : ""}${c.backstory || ""}`,
    ctx.scene?.type === "date"
      ? `情境:男方硬拉著她在「${ctx.scene.location || "某處"}」約會。${ctx.scene.location_style ? `他在這個地點的互動習性:${ctx.scene.location_style}` : ""}`
      : "情境:她被召喚到男方身邊陪伴。",
    "",
    "演出要求:",
    "- 男方依其人設主動進逼、言語上占她便宜(依猥瑣程度輕重)。",
    `- 她對他目前的關係階段:「${ctx.rival?.stage_name || "強烈嫌惡排斥"}」。她的反應基調(嚴格依此演):${ctx.rival?.tone_override || RIVAL_WATCH_TONE[ctx.rival?.stage_idx ?? 0]}`,
    "- 依世界設定,她身為被召喚的魅魔,情感會不受控地緩慢鬆動——上面的階段就是鬆動到哪裡的刻度。",
    ctx.content_rating === "nsfw"
      ? "- 內容分級 NSFW:可露骨,依男方猥瑣程度描寫肢體與言語騷擾(具體尺度依你被賦予的內容)。"
      : "- 內容分級全年齡:停在言語調戲與曖昧,不寫露骨性描寫。",
    "",
    "輸出格式(嚴格遵守,只輸出這兩行,不要旁白):",
    `他:（${su.name}說的一句話）`,
    `她:（${c.name}的一句回應）`,
  );
  return lines.join("\n");
}

/** 祭品(人)獻祭旁白:獻祭以驅動召喚之書。手法來自 Testword 腳本。 */
export function buildOfferingPrompt(ctx) {
  const lines = [];
  if (ctx.world) {
    const lore = ctx.world.split("\n")
      .filter(l => !l.startsWith(">") && !l.startsWith("# ") && l.trim() !== "---").join("\n").trim();
    if (lore) lines.push("【世界設定】", lore, "");
  }
  lines.push(
    `你是敘述者,描寫一場將祭品「${ctx.offering_name || "一名祭品"}」獻祭以驅動召喚之書的儀式(這是召喚魅魔的代價)。`,
  );
  if (ctx.method) lines.push(`本次手法:「${ctx.method}」。細節(依此描寫):${ctx.method_desc}`);
  else lines.push("(尚無指定手法——以陰森的魔法陣獻祭概括描寫。)");
  lines.push(
    ctx.content_rating === "nsfw"
      ? "內容分級 NSFW:可露骨描寫祭品的掙扎、身體與痛苦,依上方手法。"
      : "內容分級全年齡:以陰森氛圍與象徵手法帶過,不寫血腥細節。",
    "以第三人稱旁白,3~5 句,收在祭品被召喚之書吸納、消散的瞬間。只輸出旁白。",
  );
  return lines.join("\n");
}

/** 獻祭儀式旁白。廠商替換點:手法描述來自玩家在 Testword 撰寫的腳本。 */
export function buildSacrificePrompt(ctx) {
  const c = ctx.character;
  const lines = [];
  if (ctx.world) {
    const lore = ctx.world.split("\n")
      .filter(l => !l.startsWith(">") && !l.startsWith("# ") && l.trim() !== "---").join("\n").trim();
    if (lore) lines.push("【世界設定】", lore, "");
  }
  lines.push(
    `你是敘述者,描寫一場將魅魔「${c.name}」獻祭給地獄惡魔的儀式。`,
    `她的來歷:${c.backstory || "一名被召喚而來的女子"}。個性:${c.personality?.join("、") || ""}。`,
  );
  if (ctx.method) {
    lines.push(`本次獻祭手法:「${ctx.method}」。手法細節(依此描寫):${ctx.method_desc}`);
  } else {
    lines.push("(尚無指定手法——請以一場陰森的魔法陣獻祭儀式概括描寫。)");
  }
  lines.push(
    ctx.content_rating === "nsfw"
      ? "內容分級 NSFW:可露骨描寫她的掙扎、身體與痛苦,依上方手法細節。"
      : "內容分級全年齡:以陰森氛圍與象徵手法帶過,不寫血腥細節。",
    "以第三人稱旁白,3~5 句,收在她化為獻祭之光、消散的瞬間。只輸出旁白。",
  );
  return lines.join("\n");
}
