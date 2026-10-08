/* 房間活動（2026-10 Al）：她在房間裡不再隨機亂走，而是挑一件事做 1～3 分鐘
   （走過去 → 進入姿勢 → 小循環動作 → 起身），再挑下一件。
   這個檔案是純資料＋純函式（不碰 DOM、不碰存檔），給 room_character.js（執行活動）、
   test_room_summon.js（聊天 prompt／打斷後果／聊完的偏向）、node 測試共用。
   以後玩家買了床／沙發／書桌，只要在 ACTIVITIES 加一筆 place:'seat', seat:['bed'] 之類即可。
   不做（Al：之後再說）：用聊天叫她做事；她主動走過來找你聊天。 */
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
    { id: 'chair_sit', name: '端正地坐在椅子上', pose: 'sit', place: 'seat', seat: ['chair'], dur: [80, 180],
      icon: null, kind: 'idle', relax: 0, w: 1,
      doing: '端正地坐在椅子上', react: '坐著沒事做，被叫到馬上看過來' },
    { id: 'chair_phone', name: '蜷在椅子上滑手機', pose: 'sit_curl', place: 'seat', seat: ['chair'], dur: [90, 180],
      icon: 'phone', kind: 'focus', focus: .8, relax: 1, w: .9,
      doing: '把腳收到椅子上蜷著滑手機', react: '正在滑手機，第一句先像「等一下…好，什麼事？」' },
  ];
  const BY_ID = Object.fromEntries(ACTIVITIES.map(a => [a.id, a]));
  const HISTORY_MAX = 8;
  const BIAS_TAU_MS = 8 * 60 * 1000;          // 聊完的偏向：e 倍衰減時間
  const BIAS_MIN = .08;
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
   * ctx：{hour, chrono, mood:{type,level}, miss, stage, hobbies[], arousal, history:[id…新→舊], bias, now, seats:['chair'…], calm}
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
    const hobbies = (ctx.hobbies || []).join('、');
    const hist = ctx.history || [];
    const seats = new Set(ctx.seats || []);
    const bk = ctx.bias && ctx.bias.kind, bs = biasStrength(ctx.bias, now);
    const out = new Map();
    for (const a of ACTIVITIES) {
      let w = a.w;
      if (a.place === 'seat' && !(a.seat || []).some(t => seats.has(t))) { out.set(a.id, 0); continue; }
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
      if (ctx.calm && (a.lively || a.id === 'restless' || a.id === 'stare')) w *= .25;
      // 最近做過的：不連續重複
      if (hist[0] === a.id) w = 0;
      else if (hist[1] === a.id) w *= .35;
      else if (hist.slice(0, 5).filter(x => x === a.id).length >= 2) w *= .6;
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
  /** 這次要做多久（秒）。睡覺在想睡的時段更久。 */
  function duration(act, ctx = {}, rng = Math.random) {
    const [lo, hi] = act.dur;
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
  function noteStart(mem, { id, at = Date.now(), dur = 0 } = {}) {
    const m = ensureMem(mem);
    if (!BY_ID[id]) return m;
    if (m.cur) m.history.unshift({ id: m.cur.id, at: m.cur.since, end: at });
    m.history = m.history.slice(0, HISTORY_MAX);
    m.seq += 1;
    m.cur = { id, since: at, dur: Math.round(dur) || 0, seq: m.seq };
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

  const api = { ACTIVITIES, BY_ID, STAGES, HISTORY_MAX, BIAS_TAU_MS, GLAD_COOLDOWN_MS, ANNOY_COOLDOWN_MS, REOPEN_GRACE_MS, MIN_ENGAGED_MS, WAKE_ANNOY,
    sleepiness, liveliness, partOfDay, biasStrength, weights, pick, duration, ensureMem, noteStart, historyIds,
    interrupt, chatBias, promptLines, openerHint, ago };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.RoomActivity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
