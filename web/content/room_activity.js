/* 房間活動（2026-10 Al）：她在房間裡不再隨機亂走，而是挑一件事做 1～3 分鐘
   （走過去 → 進入姿勢 → 小循環動作 → 起身），再挑下一件。
   這個檔案是純資料＋純函式（不碰 DOM、不碰存檔），給 room_character.js（執行活動）、
   test_room_summon.js（聊天 prompt／打斷後果／聊完的偏向）、node 測試共用。
   以後玩家買了床／沙發／書桌，只要在 ACTIVITIES 加一筆 place:'seat', seat:['bed'] 之類即可。
   不做（Al：之後再說）：用聊天叫她做事。主動走過來找你聊天見 proactive_talk.js（approach_talk）。 */
(function (root) {
  'use strict';
  const STAGES = ['stranger', 'acquaintance', 'friend', 'close_friend', 'girlfriend', 'passionate',
    'lover', 'wife', 'devoted_wife', 'obedient_wife', 'pathological_wife'];
  /**
   * place：floor＝地上（spot 規則找格子）／seat＝家具座位（seat：可用的家具 type）。
   * spot：any 任一空格；wall 靠牆格；corner 牆角；front 最靠畫面前的格子；open 要三格直線（躺下）。
   * facing：out 面向房間前方；wall 面向牆（背對你）；front 正面對著畫面。
   * kind：idle 無聊（打斷她反而開心）；focus 專心（打斷會有點煩）；fun 玩得正開心；sleep 睡覺；mood 鬧情緒中。
   * relax：0 陌生人也會做；1 要熟一點；2 很放鬆才會（躺在你房間地上）。
   * w：基礎權重；moodOnly：只有對應情緒／偏向時才會出現。
   */
  const ACTIVITIES = [
    { id: 'hug_knees', name: '坐在地上抱著膝蓋', pose: 'hug_knees', place: 'floor', spot: 'wall', facing: 'out', dur: [70, 160],
      icon: 'dots', kind: 'idle', relax: 1, w: 1,
      doing: '抱著膝蓋坐在地上發呆', react: '剛剛抱著膝蓋在發呆，被叫到才回過神' },
    { id: 'lie_phone', name: '躺在地上滑手機', pose: 'lie_phone', place: 'floor', spot: 'open', facing: 'out', dur: [90, 180],
      icon: 'phone', kind: 'focus', focus: .8, relax: 2, w: 1.1, lie: true,
      doing: '躺在地上滑手機', react: '正在滑手機看東西，第一句先像「等一下，我在看東西…好了，幹嘛？」那樣，再理他' },
    { id: 'prone_kick', name: '趴在地上晃腳', pose: 'prone_kick', place: 'floor', spot: 'open', facing: 'out', dur: [70, 150],
      icon: 'note', kind: 'fun', focus: .4, relax: 2, w: .9, lie: true, lively: true,
      doing: '趴在地上撐著下巴晃腳', react: '趴著晃腳晃得正開心，口氣輕快' },
    { id: 'stretch', name: '伸懶腰', pose: 'stretch', place: 'floor', spot: 'any', facing: 'out', dur: [40, 70],
      icon: 'tilde', kind: 'idle', relax: 0, w: .5, lively: true,
      doing: '站著伸懶腰', react: '剛伸完懶腰，聲音還有點拖長' },
    { id: 'wall_lean', name: '靠著牆站著發呆', pose: 'wall_lean', place: 'floor', spot: 'wall', facing: 'out', dur: [60, 150],
      icon: 'dots', kind: 'idle', relax: 0, w: 1,
      doing: '靠在牆邊抱著手臂發呆', react: '剛剛在發呆放空，被叫到才回神' },
    { id: 'sulk', name: '蹲在角落背對你', pose: 'crouch', place: 'floor', spot: 'corner', facing: 'wall', dur: [90, 180],
      icon: 'anger', kind: 'mood', relax: 0, w: 0, moodOnly: true,
      doing: '蹲在牆角背對著他生悶氣', react: '還在生悶氣，背對著他，第一句冷淡或賭氣' },
    { id: 'sleep', name: '在地上蜷著睡著了', pose: 'sleep_curl', place: 'floor', spot: 'open', facing: 'out', dur: [150, 300],
      icon: 'zzz', kind: 'sleep', relax: 1, w: .35, lie: true,
      doing: '蜷在地上睡著了', react: '剛被吵醒' },
    { id: 'hum', name: '哼著歌晃身體', pose: 'sway', place: 'floor', spot: 'any', facing: 'out', dur: [60, 140],
      icon: 'note', kind: 'fun', focus: .5, relax: 0, w: .8, lively: true,
      doing: '一邊哼歌一邊晃著身體', react: '正哼歌哼到一半，心情不錯' },
    { id: 'stare', name: '走到前面盯著你看', pose: 'stare', place: 'floor', spot: 'front', facing: 'front', dur: [45, 100],
      icon: 'heart', kind: 'idle', relax: 0, w: .12,
      doing: '站在最前面，手背在後面盯著他看', react: '一直在等他注意到自己，被理了有點開心但可能嘴硬' },
    { id: 'restless', name: '在前面坐立不安地偷瞄你', pose: 'restless', place: 'floor', spot: 'front', facing: 'front', dur: [45, 90],
      icon: 'sweat', kind: 'mood', relax: 0, w: 0, moodOnly: true,
      doing: '在前面扭來扭去、一直偷瞄他', react: '身體還有點燥熱、心神不寧，被叫時有點慌' },
    { id: 'twirl', name: '無聊地捲著頭髮', pose: 'twirl', place: 'floor', spot: 'any', facing: 'out', dur: [50, 120],
      icon: 'dots', kind: 'idle', relax: 0, w: .9,
      doing: '無聊地捲著頭髮', react: '正無聊，被理很高興' },
    // 性飢渴（hunger.js，2026-10-09）：只在飢渴時出現
    { id: 'squirm', name: '夾著腿扭來扭去', pose: 'restless', place: 'floor', spot: 'any', facing: 'out', dur: [50, 110],
      icon: 'sweat', kind: 'mood', relax: 0, w: 0, moodOnly: true,
      doing: '夾著腿站著扭來扭去、一直換重心', react: '身體燥熱、坐立難安，被叫到嚇一跳，裝作沒事' },
    { id: 'hunger_beg', name: '走到你面前扭扭捏捏地求你', pose: 'restless', place: 'floor', spot: 'front', facing: 'front', dur: [100, 180],
      icon: 'heart', kind: 'mood', relax: 0, w: 0, moodOnly: true, sticky: true,
      doing: '特地走到他面前，扭扭捏捏地一直看著他、等他碰自己', react: '是特地過來求他的，第一句就撒嬌地求他抱你、跟你做' },
    // 主動找你聊天（proactive_talk.js，2026-10-10）：只由 test_room_summon 直接叫出來（權重 0）
    { id: 'approach_talk', name: '走到你面前想跟你說話', pose: 'stare', place: 'floor', spot: 'front', facing: 'front', dur: [600, 660],
      icon: 'talk', kind: 'mood', relax: 0, w: 0, moodOnly: true, sticky: true, wait: true,
      doing: '特地走到他面前，看著他、想跟他說話', react: '是自己走過來找他聊天的，第一句由你先開口' },
    { id: 'chair_sit', name: '端正地坐在椅子上', pose: 'sit', place: 'seat', seat: ['chair'], dur: [80, 180],
      icon: null, kind: 'idle', relax: 0, w: 1,
      doing: '端正地坐在椅子上', react: '坐著沒事做，被叫到馬上看過來' },
    { id: 'chair_phone', name: '蜷在椅子上滑手機', pose: 'sit_curl', place: 'seat', seat: ['chair'], dur: [90, 180],
      icon: 'phone', kind: 'focus', focus: .8, relax: 1, w: .9,
      doing: '把腳收到椅子上蜷著滑手機', react: '正在滑手機，第一句先像「等一下…好，什麼事？」' },
    // 書桌＋床（agent office，2026-11-01）：seatKind 'lie'＝床上躺的位置；near＝座位正前方要有這件家具。
    // 玩家也可以直接叫她去（RoomActor.order('sleep'|'work')，ordered:true 時 prompt 會說是他叫的）。
    { id: 'bed_sleep', name: '躺在床上睡覺', pose: 'sleep_curl', place: 'seat', seat: ['bed'], seatKind: 'lie', dur: [150, 300], orderDur: [900, 1800],
      icon: 'zzz', kind: 'sleep', relax: 1, w: .35,
      doing: '躺在床上睡著了', react: '剛被吵醒' },
    { id: 'desk_work', name: '坐在書桌前寫東西', pose: 'sit_work', place: 'seat', seat: ['chair'], near: 'desk', dur: [120, 300], orderDur: [900, 1800],
      icon: 'write', kind: 'focus', focus: .9, relax: 0, w: .7,
      doing: '坐在書桌前低著頭專心寫東西', react: '正在寫東西寫到一半，第一句先像「等一下，我寫完這句…好，怎麼了？」那樣，再理他' },
  ];
  /** 玩家下的指令 → 活動。 */
  const ORDERS = { sleep: 'bed_sleep', work: 'desk_work' };
  // 聊天裡叫她去做（2026-11-01 Al：不用按鈕，用說的）。要有「去／快／該…」這類叫人的口氣，
  // 只提到「工作」「睡覺」不算（例：「我昨天沒睡覺」）；有否定就不算。
  const ORDER_NOT = /不要|不用|不准|不必|別(去|睡|工作|寫)|先不|還不/;
  const ORDER_SAY = {
    work: [/(去|快去|給我去|乖乖去|先去|妳去|你去|回去|過去)(書桌|桌子|桌前)?(那邊|那裡|前面)?(坐著)?(工作|上班|做事|寫字|寫東西|寫作業|寫功課|念書|讀書|辦公|寫報告)/,
      /(工作|寫作業|寫功課|念書|讀書|寫字|寫東西)(吧|去|啦|囉)/, /^(去)?工作[!！。~～]*$/],
    sleep: [/(去|快去|給我去|乖乖去|先去|妳去|你去|回去|上)(床上?)?(睡|睡覺|睡一下|睡個覺|休息|躺著?)/,
      /(快|該|早點|趕快)(去)?睡(覺)?(吧|了|啦|囉)?/, /睡(覺|一下)?(吧|啦|囉)/, /^(去)?睡覺?[!！。~～]*$/],
  };
  /** 玩家這句話是不是叫她去工作／睡覺 → 'work' | 'sleep' | null。 */
  function orderIntent(text) {
    const t = String(text || '').replace(/\s+/g, '');
    if (!t || ORDER_NOT.test(t)) return null;
    for (const kind of ['sleep', 'work']) if (ORDER_SAY[kind].some(re => re.test(t))) return kind;
    return null;
  }
  // 把委託交給她（放到她桌上，2026-11-01）：「這件交給妳：寫季報」「幫我做季報」「季報拿去做」「放妳桌上」。
  const GIVE_SAY = /(交給(妳|你)|交給妳做|給(妳|你)做|幫我(做|寫|處理|弄|查|整理|想)|拿去(做|寫|處理)|放(到|在)?(妳|你)(的)?桌上|(妳|你)來(做|處理|寫)|拜託(妳|你)(做|處理|寫)?)/;
  const PUNCT = /[\s「」『』"'“”‘’（）()【】\[\]，,。.！!？?：:；;、~～…]+/g;
  const norm = t => String(t || '').replace(PUNCT, '').toLowerCase();
  function commonRun(a, b) {   // 最長共同連續字數
    let best = 0;
    for (let i = 0; i < a.length; i++) for (let j = 0; j < b.length; j++) {
      let k = 0; while (i + k < a.length && j + k < b.length && a[i + k] === b[j + k]) k++;
      if (k > best) best = k;
    }
    return best;
  }
  /**
   * 玩家這句是不是把委託交給她 → null｜{target, quest, candidates}
   * quests：[{id,text}]（主遊戲已承接／執行中）；null＝沙盒沒有委託板 → 用他說的字當委託。
   * quest：對到的那件（對不到或好幾件一樣像 → null，candidates 給她問）。
   */
  function deskIntent(text, quests = null) {
    const raw = String(text || '');
    if (!GIVE_SAY.test(raw.replace(/\s+/g, '')) || ORDER_NOT.test(raw)) return null;
    const quoted = raw.match(/[「『"“]([^」』"”]{2,})[」』"”]/);
    const after = raw.split(/[：:]/).slice(1).join('：');
    let target = quoted ? quoted[1] : after || raw.replace(GIVE_SAY, ' ').replace(/這件|那件|這個|那個|委託|事情|工作|一下|好嗎|可以嗎|吧|啦|喔|哦|嗎/g, ' ');
    target = target.replace(/\s+/g, ' ').trim();
    const t = norm(target);
    if (!Array.isArray(quests)) return { target, quest: t.length >= 2 ? { id: '', text: target } : null, candidates: [] };
    const scored = quests.filter(q => q && q.text).map(q => {
      const qt = norm(q.text);
      if (!t || !qt) return { q, s: 0 };
      if (t.includes(qt) || (t.length >= 2 && qt.includes(t))) return { q, s: 100 + Math.min(t.length, qt.length) };
      const run = commonRun(t, qt);
      return { q, s: run >= 2 && run >= Math.min(t.length, qt.length) / 2 ? run : 0 };
    }).filter(x => x.s > 0).sort((a, b) => b.s - a.s);
    if (!scored.length) return { target, quest: quests.length === 1 && !t ? quests[0] : null, candidates: quests.slice(0, 6) };
    const top = scored.filter(x => x.s === scored[0].s).map(x => x.q);
    return { target, quest: top.length === 1 ? top[0] : null, candidates: top.length > 1 ? top : [] };
  }
  /** 交委託那一句的 prompt：放上桌了／桌上已有一件／聽不出是哪件。 */
  function givePromptLine(r) {
    if (!r) return '';
    if (r.placed) return `【他把委託「${r.placed}」交給你，放到你桌上了】你會去書桌那邊做：回完這句就過去。用你的口氣答應他（可以撒嬌或小抱怨），不要拒絕，不要寫動作旁白。`;
    if (r.busy) return `【他想再交一件委託給你，可是你桌上的「${r.busy}」還沒交差】一次只能做一件。用你的口氣跟他說，等這件做完再給你。`;
    if (r.offline) return '【他想交一件委託給你，可是你的書桌現在用不了（伺服器連不上）】用你的口氣跟他說等一下再給你。';
    const names = (r.candidates || []).map(q => `「${q.text}」`).join('、');
    return names ? `【他想交一件委託給你，但你聽不出是哪一件】他接下的委託有：${names}。問他是哪一件。`
      : '【他想交一件委託給你，可是他現在沒有接下的委託】跟他說要先去接委託，再拿給你。';
  }
  /** 叫她去做的那一句：prompt（她照做、回一句再過去）。 */
  function orderPromptLine(kind) {
    const where = kind === 'sleep' ? '床上睡覺' : '書桌那邊坐著寫東西';
    return `【他剛剛叫你去${where}】你會照做：回完這句就起身過去。用你的口氣回他一句（可以乖乖答應、撒嬌或小抱怨），不要拒絕，不要寫動作旁白。`;
  }
  const BY_ID = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));
  const HISTORY_MAX = 8;
  const BIAS_TAU_MS = 8 * 60 * 1000;          // 聊完的偏向：e 倍衰減時間
  const BIAS_MIN = .08;
  const HUNGER_ACT_AT = 40;                   // 性飢渴 ≥40 才開始影響活動
  const GLAD_COOLDOWN_MS = 20 * 60 * 1000;    // 打斷她無聊 → 感情 +1，每 20 分鐘最多一次
  const ANNOY_COOLDOWN_MS = 10 * 60 * 1000;   // 打斷專心的事 → 小小不爽，每 10 分鐘最多一次
  const REOPEN_GRACE_MS = 60 * 1000;          // 關掉對話 1 分鐘內再打開：不算打斷
  const MIN_ENGAGED_MS = 20 * 1000;           // 才剛開始做（<20 秒）不算打斷
  const WAKE_ANNOY = { '淺眠易怒': 30, '夜貓子': 22, '愛睡午覺': 18, '早起型': 12, '隨和好睡': 0 };
  const IRRITABLE = { '淺眠易怒': 1.3, '夜貓子': 1.1, '隨和好睡': .7 };
  const MUSIC_HOBBY = /唱歌|跳街舞|彈吉他|聽黑膠|夜店|跳舞|音樂/;
  const PHONE_HOBBY = /追劇|蒐集穿搭|逛選物店|指甲彩繪|看獨立電影|咖啡巡禮|逛展/;

  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  function stageIndex(key) { const i = STAGES.indexOf(String(key || 'stranger')); return i < 0 ? 0 : i; }

  /** 0～1：現在多想睡（依台灣時間＋作息型）。 */
  function sleepiness(hour, chrono) {
    const h = ((Number(hour) || 0) % 24 + 24) % 24;
    let s = h < 5 ? .9 : h < 6 ? .6 : h < 8 ? .3 : h >= 23 ? .65 : h >= 22 ? .45 : (h >= 13 && h < 15) ? .22 : .05;
    if (chrono === '夜貓子') s = h < 3 ? .12 : h < 6 ? .55 : h < 12 ? .75 : (h >= 13 && h < 15) ? .3 : h >= 22 ? .04 : .08;
    else if (chrono === '早起型') s = h >= 21 || h < 5 ? .92 : h < 9 ? .04 : (h >= 13 && h < 15) ? .2 : .06;
    else if (chrono === '愛睡午覺' && h >= 13 && h < 15) s = .9;
    else if (chrono === '隨和好睡') s = Math.min(1, s + .15);
    return s;
  }
  /** 有多少活力（跳舞、晃腳、伸懶腰的倍率）。 */
  function liveliness(hour, chrono) {
    const h = ((Number(hour) || 0) % 24 + 24) % 24;
    if (chrono === '夜貓子') return h >= 21 || h < 3 ? 1.7 : h < 12 ? .45 : 1;
    if (chrono === '早起型') return h >= 6 && h < 11 ? 1.6 : h >= 21 || h < 5 ? .35 : 1;
    return h < 6 ? .5 : 1;
  }
  function partOfDay(hour) {
    const h = ((Number(hour) || 0) % 24 + 24) % 24;
    return h < 5 ? '深夜' : h < 9 ? '早上' : h < 12 ? '上午' : h < 13 ? '中午' : h < 18 ? '下午' : h < 22 ? '晚上' : '深夜';
  }
  /** 聊完的偏向：{kind, strength, at} → 現在剩多少（0～1）。 */
  function biasStrength(bias, now = Date.now()) {
    if (!bias || !bias.kind) return 0;
    const age = Math.max(0, now - (Number(bias.at) || 0));
    const s = (Number(bias.strength) || 0) * Math.exp(-age / BIAS_TAU_MS);
    return s < BIAS_MIN ? 0 : s;
  }

  /**
   * ctx：{hour, chrono, mood:{type,level}, miss, stage, hobbies[], arousal, history:[id…新→舊], bias, now, seats:['chair'…], calm,
   *       hunger 0–100（性飢渴，hunger.js）, hungerBeg（妻子、很高、冷卻過了 → 走過來求）}
   * 回傳每個活動的權重（Map id → w）。
   */
  function weights(ctx = {}) {
    const now = ctx.now ?? Date.now();
    const hour = ctx.hour ?? 12, chrono = ctx.chrono || '';
    const sl = sleepiness(hour, chrono), live = liveliness(hour, chrono);
    const st = stageIndex(ctx.stage), reserved = st <= 1, close = st >= 4;
    const mood = ctx.mood && ctx.mood.level >= 12 ? ctx.mood : null;
    const ml = mood ? mood.level : 0, mt = mood ? mood.type : '';
    const miss = clamp(Number(ctx.miss) || 0, 0, 100);
    const arousal = clamp(Number(ctx.arousal) || 0, 0, 100);
    const hunger = clamp(Number(ctx.hunger) || 0, 0, 100);
    const hobbies = (ctx.hobbies || []).join('、');
    const hist = ctx.history || [];
    const seats = new Set(ctx.seats || []);
    const bk = ctx.bias && ctx.bias.kind, bs = biasStrength(ctx.bias, now);
    const out = new Map();
    for (const a of ACTIVITIES) {
      let w = a.w;
      if (a.place === 'seat' && !(a.seat || []).some(t => seats.has(t))) { out.set(a.id, 0); continue; }
      if (a.near && !seats.has(a.near) && !(ctx.furniture || []).includes(a.near)) { out.set(a.id, 0); continue; }
      // 有床就睡床上，很少直接睡地板
      if (a.id === 'sleep' && seats.has('bed')) w *= .15;
      // 時段＋作息
      if (a.kind === 'sleep') w *= .15 + 14 * sl * sl;
      else if (a.lie) w *= 1 + sl * .6;
      if (a.lively) w *= live * (1 - sl * .6);
      if (a.id === 'stretch' && (hour >= 6 && hour < 10)) w *= 2.2;
      if (a.id === 'stretch' && hist[0] === 'sleep') w *= 8;      // 睡醒先伸懶腰
      // 關係：陌生時拘謹（站著、靠邊、端正坐），熟了才會在你房間地上躺
      if (reserved) w *= a.relax === 2 ? .12 : a.relax === 1 ? .5 : 1.4;
      else if (close) w *= a.relax === 2 ? 1.6 : a.relax === 1 ? 1.2 : 1;
      if (reserved && a.id === 'chair_sit') w *= 1.4;
      // 情緒餘溫
      if (a.id === 'sulk') w = (mt === 'angry' || mt === 'hurt') ? ml / 6 : 0;
      if (a.id === 'restless') w = mt === 'aroused' ? ml / 14 : arousal >= 45 ? (arousal - 30) / 40 : 0;
      if (mt === 'angry' || mt === 'hurt') { if (a.kind === 'fun' || a.id === 'stare') w *= Math.max(.1, 1 - ml / 50); if (a.id === 'hug_knees' && mt === 'hurt') w *= 2; }
      if (mt === 'flustered') { if (a.id === 'twirl') w += ml / 18; if (a.id === 'hug_knees') w *= 1.6; }
      if (mt === 'aroused' && a.id === 'stare') w += ml / 40;
      // 性飢渴：夾腿扭、前面坐立不安偷瞄、盯著你、捲頭髮、抱膝夾腿；不太睡得著。所有關係階都有（陌生只有這些）
      if (hunger >= HUNGER_ACT_AT) {
        const k = (hunger - HUNGER_ACT_AT) / (100 - HUNGER_ACT_AT);   // 0～1
        if (a.id === 'squirm') w += .25 + 2.4 * k;
        if (a.id === 'restless') w += 2 * k;
        if (a.id === 'stare') w += .5 * k;
        if (a.id === 'twirl') w *= 1 + .8 * k;
        if (a.id === 'hug_knees') w *= 1 + k;
        if (a.kind === 'sleep') w *= 1 - .6 * k;
      }
      if (a.id === 'hunger_beg') w = ctx.hungerBeg && !ctx.calm ? 40 : 0;
      if (a.id === 'approach_talk') w = 0;
      // 想念：高 → 走到前面盯著你、不想躺遠遠的
      if (a.id === 'stare') w += Math.max(0, miss - 30) / 16;
      if ((a.lie || a.kind === 'sleep') && miss > 40) w *= 1 - (miss - 40) / 100;
      // 興趣
      if (a.id === 'hum' && MUSIC_HOBBY.test(hobbies)) w *= 2.5;
      if (a.icon === 'phone' && PHONE_HOBBY.test(hobbies)) w *= 1.5;
      // 聊完的偏向（隨時間淡掉）
      if (bs > 0) {
        if (bk === 'happy') { if (a.id === 'hum' || a.id === 'stare') w = w * (1 + 3 * bs) + .6 * bs; if (a.id === 'sulk') w = 0; if (a.kind === 'sleep') w *= 1 - .7 * bs; }
        if (bk === 'angry') { if (a.id === 'sulk') w += 4 * bs; else if (a.id === 'wall_lean') w *= 1 + bs; else w *= 1 - .6 * bs; }
        if (bk === 'aroused') { if (a.id === 'restless') w += 3 * bs; else if (a.id === 'stare') w = w * (1 + bs) + .3 * bs; else if (a.kind === 'sleep') w *= 1 - .8 * bs; }
        if (bk === 'flustered') { if (a.id === 'twirl') w += 2 * bs; else if (a.id === 'hug_knees') w *= 1 + 2 * bs; }
      }
      // 番茄鐘開著：安靜一點
      if (ctx.calm && (a.lively || a.id === 'restless' || a.id === 'stare' || a.id === 'squirm')) w *= .25;
      // 最近做過的：不連續重複
      if (hist[0] === a.id) w = 0;
      else if (hist[1] === a.id) w *= .35;
      else if (hist.slice(0, 5).filter(x => x === a.id).length >= 2) w *= .6;
      // 桌上的委託還在做（room_desk.js）：她會回書桌繼續（不受上面的不重複限制）
      if (a.id === 'desk_work' && ctx.deskBusy) w = 30;
      out.set(a.id, Math.max(0, w));
    }
    return out;
  }
  /** 依權重抽下一件事。rng：() => [0,1)。 */
  function pick(ctx = {}, rng = Math.random) {
    const ws = weights(ctx);
    let total = 0;
    for (const w of ws.values()) total += w;
    if (total <= 0) return { act: BY_ID.twirl, weights: ws };
    let r = rng() * total;
    for (const a of ACTIVITIES) { r -= ws.get(a.id); if (r < 0 && ws.get(a.id) > 0) return { act: a, weights: ws }; }
    return { act: ACTIVITIES.filter(a => ws.get(a.id) > 0).pop(), weights: ws };
  }
  /** 這次要做多久（秒）。睡覺在想睡的時段更久。ordered：玩家叫的（orderDur）。 */
  function duration(act, ctx = {}, rng = Math.random, ordered = false) {
    const [lo, hi] = ordered && act.orderDur ? act.orderDur : act.dur;   // 玩家叫她去做的：做久一點
    let d = lo + (hi - lo) * rng();
    if (act.kind === 'sleep') d *= 1 + sleepiness(ctx.hour ?? 12, ctx.chrono || '');
    return Math.round(d);
  }

  // ------------------------------------------------------------ 記憶（存在 girl.roomActivity）
  function ensureMem(mem) {
    const m = mem && typeof mem === 'object' ? mem : {};
    m.seq = Math.max(0, Number(m.seq) | 0);
    m.history = Array.isArray(m.history) ? m.history.filter(h => h && BY_ID[h.id]).slice(0, HISTORY_MAX) : [];
    if (m.cur && !BY_ID[m.cur.id]) m.cur = null;
    return m;
  }
  /** 開始一件新的事：上一件收進 history（新→舊）。 */
  function noteStart(mem, { id, at = Date.now(), dur = 0, ordered = false } = {}) {
    const m = ensureMem(mem);
    if (!BY_ID[id]) return m;
    if (m.cur) m.history.unshift({ id: m.cur.id, at: m.cur.since, end: at });
    m.history = m.history.slice(0, HISTORY_MAX);
    m.seq += 1;
    m.cur = { id, since: at, dur: Math.round(dur) || 0, seq: m.seq };
    if (ordered) m.cur.ordered = true;
    return m;
  }
  function historyIds(mem) {
    const m = ensureMem(mem);
    return [...(m.cur ? [m.cur.id] : []), ...m.history.map(h => h.id)];
  }

  // ------------------------------------------------------------ 打斷她（打開對話）
  /**
   * 打開對話時她正在做的事 → 小小後果。會改 mem（冷卻）。
   * 回傳 {mood:{type,level,cause}|null, affection:0|1, wake:bool, reason}
   */
  function interrupt(mem, { now = Date.now(), chrono = '', hour = 12 } = {}) {
    const m = ensureMem(mem), cur = m.cur, act = cur && BY_ID[cur.id];
    const none = (reason) => ({ mood: null, affection: 0, wake: false, reason });
    if (!act) return none('沒在做什麼');
    if (act.kind === 'sleep') {
      // 叫她一定會醒；起床氣只算一次（同一場睡眠）
      if (m.hitSeq === cur.seq) return { mood: null, affection: 0, wake: true, reason: '又叫醒她一次' };
      m.hitSeq = cur.seq;
      let level = WAKE_ANNOY[chrono] ?? 15;
      if (chrono === '愛睡午覺' && hour >= 13 && hour < 15) level += 10;
      return { mood: level >= 8 ? { type: 'angry', level, cause: '睡覺被你吵醒' } : null, affection: 0, wake: true, reason: '吵醒她' };
    }
    if (m.hitSeq === cur.seq) return none('這件事已經被打斷過');
    if (now - (Number(m.closeAt) || 0) < REOPEN_GRACE_MS) return none('剛聊完');
    m.hitSeq = cur.seq;
    const engaged = now - (Number(cur.since) || now);
    if (engaged < MIN_ENGAGED_MS) return none('才剛開始');
    if (act.kind === 'focus' || act.kind === 'fun') {
      if (now - (Number(m.annoyAt) || 0) < ANNOY_COOLDOWN_MS) return none('冷卻中');
      m.annoyAt = now;
      const level = Math.round((8 + 6 * (act.focus || .5)) * (IRRITABLE[chrono] || 1));
      return { mood: { type: 'angry', level, cause: `${act.doing}被你打斷` }, affection: 0, wake: false, reason: '打斷她專心的事' };
    }
    if (act.kind === 'idle') {
      if (now - (Number(m.gladAt) || 0) < GLAD_COOLDOWN_MS) return none('冷卻中');
      m.gladAt = now;
      return { mood: null, affection: 1, wake: false, reason: '她正無聊，被理很開心' };
    }
    return none('鬧情緒中');
  }

  /** 聊完 → 下一件事的偏向。 */
  function chatBias({ affDelta = 0, mood = null, arousal = 0, arousalDelta = 0, now = Date.now() } = {}) {
    const lv = mood ? Number(mood.level) || 0 : 0, t = mood ? mood.type : '';
    if ((t === 'angry' || t === 'hurt') && lv >= 20) return { kind: 'angry', strength: clamp(lv / 60, .35, 1), at: now };
    if ((t === 'aroused' && lv >= 15) || arousalDelta >= 15 || arousal >= 40)
      return { kind: 'aroused', strength: clamp(Math.max(lv, arousal) / 60, .35, 1), at: now };
    if (t === 'flustered' && lv >= 15) return { kind: 'flustered', strength: clamp(lv / 50, .3, 1), at: now };
    if (affDelta >= 3) return { kind: 'happy', strength: clamp(affDelta / 10, .3, 1), at: now };
    return null;
  }

  // ------------------------------------------------------------ prompt
  function ago(ms) {
    const s = Math.max(0, Math.round(ms / 1000));
    if (s < 60) return '不到一分鐘';
    const m = Math.round(s / 60);
    if (m < 60) return `${m} 分鐘`;
    const h = Math.round(m / 60);
    return h < 24 ? `${h} 小時` : `${Math.round(h / 24)} 天`;
  }
  /**
   * talk：打開對話那一刻的快照 {id, since, at, prevId, prevAt, wake}；mem：girl.roomActivity。
   * opening：還沒開口（第一句）。wakeReact：她作息型的 wake_react。
   */
  function promptLines({ talk = null, mem = null, now = Date.now(), opening = false, wakeReact = '' } = {}) {
    const out = [];
    const act = talk && BY_ID[talk.id];
    const m = ensureMem(mem);
    if (act) {
      const at = Number(talk.at) || now;
      const long = ago(at - (Number(talk.since) || at));
      const prev = talk.prevId && BY_ID[talk.prevId];
      out.push('【你剛才在房間裡】');
      out.push(`他找你說話的時候，你${act.kind === 'sleep' ? '' : '正'}${act.doing}${talk.since ? `（大概${long}了）` : ''}。` +
        (talk.ordered ? `（是他剛才叫你去${act.kind === 'sleep' ? '睡覺' : '做'}的。）` : '') +
        (prev ? `在那之前你${prev.doing}。` : ''));
      if (opening) {
        if (talk.wake || act.kind === 'sleep') out.push(`你剛才睡著了，是被他叫醒的。起床反應：${wakeReact || '迷迷糊糊'}。第一句帶著剛醒的口氣。`);
        else out.push(`第一句先自然接上你正在做的事（${act.react}），再回他。只寫說出口的話。`);
      } else out.push('這只是剛才的狀態，話題不用一直繞著它。');
    }
    const earlier = m.history.filter(h => !talk || h.at !== talk.prevAt).slice(0, 4);
    if (earlier.length) {
      const bits = earlier.map(h => `${ago(now - (Number(h.at) || now))}前${BY_ID[h.id].doing}`);
      out.push(`稍早你在房間裡：${bits.join('；')}。聊到的話可以自然提起，不要條列。`);
    }
    return out;
  }
  /** 開場旁白補充（enterOpener 用）。 */
  function openerHint(talk, wakeReact = '') {
    const act = talk && BY_ID[talk.id];
    if (!act) return '';
    if (talk.wake || act.kind === 'sleep') return `她剛才在地上睡著了，被叫醒；起床反應：${wakeReact || '迷迷糊糊'}`;
    return `她剛才正${act.doing}；${act.react}`;
  }

  const api = { ACTIVITIES, BY_ID, ORDERS, orderIntent, orderPromptLine, deskIntent, givePromptLine, STAGES, HISTORY_MAX, HUNGER_ACT_AT, BIAS_TAU_MS, GLAD_COOLDOWN_MS, ANNOY_COOLDOWN_MS, REOPEN_GRACE_MS, MIN_ENGAGED_MS, WAKE_ANNOY,
    sleepiness, liveliness, partOfDay, biasStrength, weights, pick, duration, ensureMem, noteStart, historyIds,
    interrupt, chatBias, promptLines, openerHint, ago };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.RoomActivity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
