/* 她桌上的工作（agent office，2026-11-01）：前端這一半。
   伺服器（server/desk_agent.py）背景跑 agent、記事件；這裡每 2 秒拉一次，給：
   - 房間：桌上的紙／報告書（prop）、她頭上的氣泡（icon）、有工作就一直坐在書桌前（working）
   - 點書桌：總覽（她正在做的那件＋工作日誌、排隊的、交上來的報告、出錯的）→ 報告書（完成委託／延伸／退回重做）
   - 聊天：她知道自己桌上在做什麼（promptLines）；「這件交給妳：…」由 test_room_summon 呼叫 give()
   2026-11-02：一次可以放很多件，排成一列照順序做；做完一件報告疊在桌上、她接著做下一件。
   放上桌的委託從委託板拿掉（questIds，app.js 濾掉），要看就點書桌。
   她坐到書桌前（desk_work 定下來）而該做的那件還沒開工／停著 → 自動 start。
   書櫃（2026-11-02 Al）：報告交了、她離開書桌（不在書桌前 5 秒）→ 報告收進書櫃（/api/desk/shelve）；
   收下的（完成的委託）也在書櫃。點書櫃（test_room.js）→ openShelf：等你看的報告＋完成的委託，點進去看報告書。
   window.RoomDesk = {give, start, pause, answer, busy, working, prop, icon, poseWeights, promptLines, openLog, openShelf, questIds, state} */
(() => {
  'use strict';
  const POLL_MS = 2000, IDLE_POLL_MS = 6000;
  const EMPTY_SUMMARY = { subs: [], exts: [], last: null, trouble: null };
  // run：她正在做（或下一件要做）的那件；queue：排在後面的；reports：交上來的報告；failed：出錯的
  let run = null, events = [], summary = EMPTY_SUMMARY, agent = 'mock';
  let queue = [], reports = [], failed = [];
  // 書櫃：shelfPending 收進書櫃、還沒看的報告；shelfDone 收下的（完成的委託，新的在前）
  let shelfPending = [], shelfDone = [], shelfTotal = 0;
  let lastSeq = 0, offline = false, polling = false, startAsked = 0, seenIds = null, questKey = '';

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      // 405／404：網頁是新的、伺服器還在跑舊程式（git pull 後沒重開 uvicorn）→ 不認得這個接口
      const old = (r.status === 405 || (r.status === 404 && !j.detail)) && /^\/api\/desk/.test(path);
      const e = new Error(old ? '伺服器還是舊版，請重開遊戲伺服器（~/start_yorozuya.sh）' : (j.detail || `HTTP ${r.status}`));
      e.status = r.status; throw e;
    }
    return j;
  }
  function take(j) {
    const next = j.run || null;
    if (!next || !run || next.id !== run.id) { events = []; lastSeq = 0; }
    run = next;
    for (const e of j.events || []) if (e.seq > lastSeq) { events.push(e); lastSeq = e.seq; }
    if (events.length > 400) events = events.slice(-400);
    summary = next ? (j.summary || summary) : EMPTY_SUMMARY;
    agent = j.agent || agent;
    queue = j.queue || [];
    reports = j.reports || [];
    failed = j.failed || [];
    shelfPending = j.shelf?.pending || [];
    shelfDone = j.shelf?.done || [];
    shelfTotal = j.shelf?.doneTotal || shelfDone.length;
  }
  async function pull() {
    if (polling) return;
    polling = true;
    try {
      const j = await api(`/api/desk?since=${run ? lastSeq : 0}&sinceId=${run ? run.id : 0}`);
      offline = false;
      take(j);
      noticeChanges();
      maybeStart();
      maybeAsk();
      paint();
    } catch { offline = true; }
    finally { polling = false; }
  }
  function loop() {
    setTimeout(async () => { if (!document.hidden) await pull(); loop(); }, run && run.status === 'running' ? POLL_MS : IDLE_POLL_MS);
  }
  /** 新的報告／出錯 → 房間上說一聲；桌上的委託變了 → 委託板重畫（放上桌的不顯示）。 */
  function noticeChanges() {
    const ids = new Set([...reports.map(r => `d${r.id}`), ...shelfPending.map(r => `d${r.id}`), ...failed.map(r => `f${r.id}`)]);
    if (seenIds) {
      for (const r of reports) if (!seenIds.has(`d${r.id}`)) toastRoom(`「${r.title}」的報告寫好了，點書桌看。`);
      for (const r of failed) if (!seenIds.has(`f${r.id}`)) toastRoom(`「${r.title}」做到一半出錯停了，點書桌看。`);
    }
    seenIds = ids;
    const k = [...questIds()].sort().join(',');
    if (k !== questKey) { questKey = k; refreshQuests(); }
  }

  // ------------------------------------------------------------ 房間
  /** 她坐到書桌前、該做的那件還沒開工（或停著）→ 開工。 */
  function maybeStart() {
    if (!run || !['queued', 'placed', 'paused'].includes(run.status) || Date.now() - startAsked < 8000) return;
    const a = window.RoomActor?.activity?.();
    if (!a || a.id !== 'desk_work' || a.phase !== 'hold') return;
    startAsked = Date.now();
    void start();
  }
  async function start() {
    try { await api('/api/desk/start', {}); await pull(); return true; }
    catch (e) { toastRoom(e.message); return false; }
  }
  // ------------------------------------------------------------ 她停下來問你（agent 等核准／提問）
  // 新的問題：她在房間 → 從書桌走過來（desk_ask，定下來時 test_room_summon 打開對話、她先問）；不在 → 房間上提示點書桌。
  let askedFor = '';
  const askKey = () => run && run.ask ? `${run.id}:${run.ask.kind}:${run.ask.text}` : '';
  function maybeAsk() {
    const k = askKey();
    if (!k || k === askedFor) return;
    askedFor = k;
    const A = window.RoomActor;
    if (A?.isPresent?.() && A.startActivity?.('desk_ask')) return;
    toastRoom(run.ask.kind === 'clarify' ? '她有工作上的事要問你，點書桌看。' : '她有工作上的事要你決定，點書桌看。');
  }
  /** 你的回答 → 伺服器 → agent。→ {ok, choice}｜{error} */
  async function answer(text) {
    try {
      const j = await api('/api/desk/answer', { answer: text });
      void pull(); paint();
      return { ok: true, choice: j.choice };
    } catch (e) {
      if (e.status === 409) void pull();
      return { error: e.message || String(e) };
    }
  }
  const pendingAsk = () => (run && run.ask) || null;
  // ------------------------------------------------------------ 她不在書桌前就不做（2026-11-02 Al）
  // 做中而她離開書桌（去做別的事、去睡覺、離開房間）超過 8 秒 → 停下來；坐回書桌 → maybeStart 接著做。
  // 走過來問你（desk_ask）算在工作裡。手機關著／頁面在背景看不到她 → 不算離開（她人還在書桌前）。
  // 剛打開頁面：還沒看過她坐在書桌前（正走回去）不算離開；她根本不在房間要等 15 秒（房間還在載入）。
  const AWAY_MS = 8000, LOAD_GRACE_MS = 15000, loadedAt = Date.now();
  let awaySince = 0, seenAtDesk = false, pausing = false;
  function watchDesk() {
    if (!run || run.status !== 'running' || document.hidden) { awaySince = 0; return; }
    const A = window.RoomActor, present = !!A?.isPresent?.(), a = present ? A.activity?.() : null;
    const atDesk = !!a && ((a.id === 'desk_work' && a.phase === 'hold') || a.id === 'desk_ask');
    if (atDesk) { seenAtDesk = true; awaySince = 0; return; }
    if (!seenAtDesk && (present || Date.now() - loadedAt < LOAD_GRACE_MS)) return;
    if (!awaySince) awaySince = Date.now();
    if (Date.now() - awaySince > AWAY_MS && !pausing) { awaySince = 0; seenAtDesk = false; void pause(); }
  }
  async function pause() {
    pausing = true;
    try { await api('/api/desk/pause', {}); await pull(); toastRoom('她離開書桌了，工作先停著。'); }
    catch { /* 下一秒再看 */ }
    finally { pausing = false; }
  }
  setInterval(watchDesk, 1000);
  // ------------------------------------------------------------ 書櫃（2026-11-02 Al）
  // 報告交了、她不在書桌前（去做別的事、去睡覺、離開房間）5 秒 → 桌上的報告收進書櫃。走過來問你（desk_ask）、
  // 正走回書桌（desk_work）不算離開。剛打開頁面她不在房間：等房間載入（LOAD_GRACE_MS）。
  const SHELVE_MS = 5000;
  let shelfAway = 0, shelving = false;
  function watchShelf() {
    if (!reports.length || document.hidden || shelving) { shelfAway = 0; return; }
    const A = window.RoomActor, present = !!A?.isPresent?.(), a = present ? A.activity?.() : null;
    if (a && (a.id === 'desk_work' || a.id === 'desk_ask')) { shelfAway = 0; return; }
    if (!present && Date.now() - loadedAt < LOAD_GRACE_MS) return;
    if (!shelfAway) shelfAway = Date.now();
    if (Date.now() - shelfAway > SHELVE_MS) { shelfAway = 0; void shelve(); }
  }
  async function shelve() {
    shelving = true;
    try {
      const j = await api('/api/desk/shelve', {});
      await pull();
      if (j.shelved) toastRoom(j.shelved > 1 ? `她把 ${j.shelved} 份報告收進書櫃了，點書櫃看。` : '她把報告收進書櫃了，點書櫃看。');
    } catch { /* 下一秒再看 */ }
    finally { shelving = false; }
  }
  setInterval(watchShelf, 1000);
  function refreshQuests() { try { window.YorozuyaQuests?.refresh?.(); } catch { /* */ } }
  const busy = () => !!(run && run.status === 'running');
  /** 桌上有她該做的事（做中／停著／排隊）：她會回書桌、坐著不起來。 */
  const working = () => !!run;
  /** 桌上要畫什麼：report 報告書（有交上來的）｜paper 一疊紙（有工作）｜null。 */
  const prop = () => reports.length ? 'report' : (run || queue.length || failed.length) ? 'paper' : null;
  /** 桌上的委託（委託板上不顯示這些）。 */
  function questIds() {
    const s = new Set();
    for (const r of [run, ...queue, ...reports, ...failed, ...shelfPending]) if (r && r.questId) s.add(r.questId);
    return s;
  }
  /** 她在書桌前換什麼動作（權重）：做中多半在寫、偶爾撐頭想；卡住就一直撐著頭想；做完了伸懶腰、滑手機。 */
  function poseWeights() {
    if (run && run.status === 'running') return summary.trouble ? { sit_think: 5, sit_work: 1, sit_scribble: .6 }
      : { sit_work: 3, sit_scribble: 2.5, sit_think: 1.2, sit_stretch: .3 };
    if (!run && reports.length) return { sit_stretch: 1.5, sit_phone: 2, sit_think: .5 };
    if (!run && failed.length) return { sit_think: 3, sit_phone: 1 };
    return null;
  }
  /** 她在書桌前的氣泡（蓋過動作的氣泡）：要問你／卡住冒汗；全做完有報告愛心；其他照她的動作。 */
  function icon() {
    if (run && run.ask) return 'sweat';
    if (run && run.status === 'running') return summary.trouble ? 'sweat' : null;
    if (run) return null;
    if (reports.length) return 'heart';
    if (failed.length) return 'sweat';
    return null;
  }
  function toastRoom(text) { try { window.RoomActor?.tip?.(text); } catch { /* */ } }

  // ------------------------------------------------------------ 聊天
  /** 交給她：放上桌（排到最後）。→ {placed:title, pos}｜{busy:訊息（同一件已經在桌上）}｜{offline:true}｜{error}
      go：放上去就叫她去書桌（委託板長按放上桌；聊天交的等對話關掉才走，不用 go）。
      girlId／girlName 沒給就問現在房間裡的她（test_room_summon 設的 RoomDesk.who）。 */
  async function give({ questId = '', title = '', note = '', girlId = '', girlName = '', go = false } = {}) {
    try {
      if (!girlId && !girlName) { try { ({ id: girlId = '', name: girlName = '' } = window.RoomDesk.who?.() || {}); } catch { /* */ } }
      const j = await api('/api/desk/put', { questId, title, note, girlId, girlName });
      await pull();
      refreshQuests();
      if (go && window.RoomActor?.isPresent?.()) {
        const a = window.RoomActor.activity?.();
        if (!(a && a.id === 'desk_work')) window.RoomActor.order?.('work');
      }
      return { placed: j.run.title, pos: j.run.pos || 1 };
    } catch (e) {
      if (e.status === 409) return { busy: e.message };
      if (!e.status) return { offline: true };
      return { error: e.message };
    }
  }
  function mins(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? '不到一分鐘' : m < 60 ? `${m} 分鐘` : `${Math.round(m / 6) / 10} 小時`; }
  /** 她桌上的工作 → prompt（她知道自己在做什麼、卡在哪、還有幾件；不要把過程條列給他）。 */
  function promptLines() {
    if (!run && !queue.length && !reports.length && !failed.length && !shelfPending.length) return [];
    const out = ['【你桌上的工作】'];
    if (run) {
      const t = `「${run.title}」`;
      if (run.ask) {
        out.push(run.ask.kind === 'clarify'
          ? `你在做${t}時卡住，要問他：${run.ask.text}。用你的口氣問他，等他回答。`
          : `你在做${t}時停下來，要他決定可不可以：${run.ask.text}。用你的口氣簡單說要做什麼、問他可不可以，等他回答（他說可以或不行）。`);
        return out;
      }
      if (run.status === 'running') {
        out.push(`你正在做他交給你的委託${t}（做了${mins(Date.now() - (run.started || Date.now()))}）。`);
        if (run.mode === 'extend' && run.feedback) out.push(`這件他已經收下了，你在做他要的後續：${run.feedback}`);
        if (run.mode === 'redo' && run.feedback) out.push(`這件是他退回來要你改的：${run.feedback}`);
        if (summary.last) out.push(`現在做到：${summary.last.text}`);
        if (summary.trouble) out.push(`剛剛卡住：${summary.trouble.text}`);
        const live = summary.subs.filter(s => s.status === 'run').length;
        if (live) out.push(`你叫了 ${live} 隻使魔在幫忙。`);
      } else if (run.status === 'paused') out.push(`他交給你的委託${t}做到一半停著（你離開書桌了），回到書桌就接著做。`);
      else out.push(`下一件要做的是他交給你的委託${t}（坐到書桌前就開工）。`);
      if (run.note) out.push(`他附的說明：${run.note}`);
    }
    if (queue.length) out.push(`後面還排著 ${queue.length} 件：${queue.slice(0, 4).map(q => `「${q.title}」`).join('、')}${queue.length > 4 ? '…' : ''}。`);
    if (reports.length) out.push(`有 ${reports.length} 份報告寫好了放在桌上等他看：${reports.slice(0, 3).map(q => `「${q.title}」`).join('、')}。`);
    if (failed.length) out.push(`${failed.map(q => `「${q.title}」`).join('、')}做到一半出錯停下來了。`);
    if (shelfPending.length) out.push(`有 ${shelfPending.length} 份報告你收進書櫃了，還在等他看：${shelfPending.slice(0, 3).map(q => `「${q.title}」`).join('、')}。`);
    if (shelfTotal) out.push(`書櫃裡放著你完成的 ${shelfTotal} 件委託${shelfDone.length ? `（最近的是「${shelfDone[0].title}」）` : ''}。`);
    out.push('聊到的話自然提起就好，不要條列過程。');
    return out;
  }

  // ------------------------------------------------------------ 工作日誌＋報告書
  const esc = t => String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  /** 很小的 markdown：# 標題、> 引用、- / 1. 清單、**粗體**、`code`。 */
  function md(text) {
    const inline = s => esc(s).replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>').replace(/`([^`]+)`/g, '<code>$1</code>');
    const out = []; let list = null;
    const close = () => { if (list) { out.push(`</${list}>`); list = null; } };
    for (const line of String(text || '').split('\n')) {
      let m;
      if ((m = line.match(/^(#{1,3})\s+(.*)/))) { close(); out.push(`<h${m[1].length + 2}>${inline(m[2])}</h${m[1].length + 2}>`); }
      else if ((m = line.match(/^>\s?(.*)/))) { close(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); }
      else if ((m = line.match(/^\s*[-*]\s+(.*)/))) { if (list !== 'ul') { close(); out.push('<ul>'); list = 'ul'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if ((m = line.match(/^\s*\d+[.)]\s+(.*)/))) { if (list !== 'ol') { close(); out.push('<ol>'); list = 'ol'; } out.push(`<li>${inline(m[1])}</li>`); }
      else if (!line.trim()) close();
      else { close(); out.push(`<p>${inline(line)}</p>`); }
    }
    close();
    return out.join('');
  }
  const STATUS = { queued: '排隊中・她坐下就開工', placed: '排隊中・她坐下就開工', running: '做中', paused: '停著・她不在書桌前',
    done: '報告交了', failed: '出錯停了' };
  const KIND = { ask: '問你', plan: '計畫', tool: '工具', think: '想', trouble: '卡住', spawn: '叫出', done: '完成', dispatch: '外包', report: '報告', note: '你說', status: '', error: '出錯' };
  function who(actor, r) {
    if (actor === 'main') return r?.girlName || '她';
    const m = actor.match(/^sub:(\d+)/);
    if (m) return `使魔${'①②③④⑤⑥⑦⑧⑨⑩'[Number(m[1]) - 1] || m[1]}`;
    const x = actor.match(/^ext:(.+)/);
    if (x) return `外包・${({ claude: 'Claude Code', grok: 'Grok', chatgpt: 'ChatGPT', codex: 'Codex' })[x[1]] || x[1]}`;
    return actor;
  }
  const hhmm = at => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const agentLabel = () => agent === 'mock' ? '示範 agent（還沒接 Hermes）' : agent === 'hermes' ? 'Hermes（RP5）' : esc(agent);
  function timeline(evs, sum, r) {
    const subs = sum.subs.map(s => `<div class="agent"><span class="st">${s.status === 'run' ? '…' : s.status === 'ok' ? '✓' : '✗'}</span><b>${esc(who(s.id, r))}</b>${esc(s.goal)}<div class="mini">${esc(s.last || '')}</div></div>`).join('');
    const exts = sum.exts.map(s => `<div class="agent"><span class="st">${s.status === 'run' ? '…' : s.status === 'ok' ? '✓' : '✗'}</span><b>${esc(who(s.id, r))}</b>${esc(s.goal)}<div class="mini">${esc(s.last || '')}</div></div>`).join('');
    const tl = evs.slice().reverse().filter(e => e.actor === 'main' || e.kind !== 'tool' || e.status !== 'run').slice(0, 60).map(e =>
      `<li class="${e.status === 'fail' ? 'fail' : e.status === 'ok' ? 'ok' : ''}"><span class="t">${hhmm(e.at)}</span><span><span class="w">${esc(who(e.actor, r))}${KIND[e.kind] ? '・' + KIND[e.kind] : ''}</span>${esc(e.text)}</span></li>`).join('');
    return `${subs ? `<div class="sec">使魔（subagent）</div><div class="cards">${subs}</div>` : ''}
      ${exts ? `<div class="sec">外包</div><div class="cards">${exts}</div>` : ''}
      <div class="sec">工作日誌</div><ol class="tl">${tl || '<li><span></span><span class="mini">還沒有紀錄。</span></li>'}</ol>`;
  }

  // mode：log 總覽｜shelf 書櫃｜report 一份報告書｜extend／redo 寫延伸／退回｜fail 出錯的那件｜archive 書櫃裡完成的那件
  // home：從哪裡打開的（log 書桌／shelf 書櫃），‹ 和做完動作回那裡；sel：點進去的那件（/api/desk/run）
  let card = null, mode = 'log', home = 'log', msg = '', sel = null;
  function ensureCard() {
    if (card) return card;
    const css = document.createElement('style');
    css.textContent = `
#desk-ov{position:fixed;inset:0;z-index:8400;display:flex;align-items:flex-end;justify-content:center;background:rgba(20,16,26,.45)}
#desk-ov[hidden]{display:none}
#desk-card{width:min(100%,460px);max-height:min(82svh,720px);overflow:auto;background:#fbf6ec;color:#3b3328;border-radius:14px 14px 0 0;
  padding:14px 14px max(14px,env(safe-area-inset-bottom));box-shadow:0 -8px 28px rgba(0,0,0,.35);font:14px/1.55 system-ui,"Noto Sans TC",sans-serif}
#desk-card h2{font-size:15px;margin:0;font-weight:600;flex:1}
#desk-card .hd{display:flex;align-items:center;gap:8px;margin-bottom:8px}
#desk-card .x{border:0;background:none;box-shadow:none;min-height:0;font-size:20px;line-height:1;padding:4px 8px;color:#7a6c5a;cursor:pointer}
#desk-card .title{font-size:16px;font-weight:600;margin:2px 0 4px}
#desk-card .chip{display:inline-block;font-size:12px;padding:1px 8px;border-radius:10px;background:#e7ddcb;color:#5d5243;margin-right:6px}
#desk-card .chip.run{background:#dce7cf;color:#45603a}#desk-card .chip.done{background:#f3dcc8;color:#7a4a25}#desk-card .chip.failed{background:#f1d0cc;color:#8a3a31}
#desk-card .mini{font-size:12px;color:#8a7d6b}
#desk-card .trouble{margin:8px 0;padding:8px 10px;border-radius:8px;background:#fbe3dc;color:#7c3a2c;font-size:13px}
#desk-card .sec{margin:12px 0 4px;font-size:12px;color:#8a7d6b;letter-spacing:.05em}
#desk-card .cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:6px}
#desk-card .agent{border:1px solid #e1d6c3;border-radius:8px;padding:6px 8px;background:#fffdf8;font-size:12px}
#desk-card .agent b{display:block;font-size:12px}#desk-card .agent .st{float:right}
#desk-card ol.tl{list-style:none;margin:0;padding:0}
#desk-card ol.tl li{display:grid;grid-template-columns:40px 1fr;gap:6px;padding:5px 0;border-bottom:1px dashed #e6dccb;font-size:13px}
#desk-card ol.tl li .t{color:#a0927e;font-size:11px;padding-top:2px}
#desk-card ol.tl li .w{font-size:11px;color:#7a6c5a;margin-right:4px}
#desk-card ol.tl li.fail{color:#8a3a31}#desk-card ol.tl li.ok .w::after{content:" ✓";color:#5b7a4a}
#desk-card .row{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
#desk-card .row button,#desk-card .item button{font:inherit;border:1px solid #c8bba7;background:#f6f1e7;color:#4e463a;border-radius:8px;padding:9px 12px;min-height:40px;cursor:pointer}
#desk-card .row button.main,#desk-card .item button.main{background:#6b3a2a;border-color:#6b3a2a;color:#fff}
#desk-card .item{display:flex;align-items:center;gap:8px;padding:8px 10px;margin-top:6px;border:1px solid #e1d6c3;border-radius:8px;background:#fffdf8}
#desk-card .item .t{flex:1;min-width:0}
#desk-card .item .t b{display:block;font-size:14px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#desk-card .item button{min-height:36px;padding:6px 10px;font-size:13px}
#desk-card .box{border:1px solid #e1d6c3;border-radius:10px;padding:10px 12px;background:#fffdf8;margin-top:6px}
#desk-card textarea{width:100%;box-sizing:border-box;min-height:70px;margin-top:8px;font:inherit;border:1px solid #d5c9b5;border-radius:8px;padding:8px;background:#fff}
#desk-card .report{background:#fff;border:1px solid #e1d6c3;border-radius:8px;padding:4px 12px;margin-top:8px}
#desk-card .report h3{font-size:16px;margin:10px 0 6px}#desk-card .report h4{font-size:14px;margin:10px 0 4px}
#desk-card .report blockquote{margin:6px 0;padding:4px 10px;border-left:3px solid #d8c7ad;color:#6d6252;background:#faf5ec}
#desk-card .report ul,#desk-card .report ol{padding-left:1.3em;margin:4px 0}
#desk-card .msg{margin-top:8px;font-size:12px;color:#8a3a31}
#desk-card .ask{margin:8px 0;padding:10px 12px;border-radius:8px;background:#fff4d6;border:1px solid #ecd49a;font-size:13px}
#desk-card .ask b{display:block;font-size:12px;color:#7a5a17;margin-bottom:2px}
#desk-card .ask .row{margin-top:8px}`;
    document.head.append(css);
    const ov = document.createElement('div');
    ov.id = 'desk-ov'; ov.hidden = true;
    ov.innerHTML = '<div id="desk-card" role="dialog" aria-modal="true" aria-labelledby="desk-h"></div>';
    // 點外面關掉：按下去和放開都在外面才算。點書桌／書櫃打開的那一下，手機放開後補的 click 會落在剛蓋上的 ov 上
    // → 之前一打開就馬上關掉（看起來像點書桌沒反應）。
    let downOut = false;
    ov.addEventListener('pointerdown', e => { downOut = e.target === ov; });
    ov.addEventListener('click', e => { if (e.target === ov && downOut) closeLog(); downOut = false; });
    document.body.append(ov);
    card = ov;
    return card;
  }
  function openLog() { openHome('log'); }
  /** 點書櫃：她完成的（收進書櫃等你看的報告＋收下的委託）。 */
  function openShelf() { openHome('shelf'); }
  function openHome(where) {
    ensureCard();
    mode = home = where; sel = null; msg = '';
    card.hidden = false;
    paint(true);
    void pull();
  }
  function closeLog() { if (card) card.hidden = true; }
  async function openItem(id, view) {
    try { sel = await api(`/api/desk/run?id=${id}`); mode = view; msg = ''; }
    catch (e) { msg = e.message; }
    paint(true);
  }
  function itemRow(r, buttons, sub = '') {
    return `<div class="item"><div class="t"><b>${esc(r.title)}</b>${sub ? `<span class="mini">${sub}</span>` : ''}</div>${buttons}</div>`;
  }
  function paintOverview() {
    if (!run && !queue.length && !reports.length && !failed.length) {
      return `<p>${offline ? '書桌連不上伺服器。' : '桌上沒有工作。'}</p>${shelfHint()}<p class="mini">委託板上長按已承接的委託往上滑，或在聊天裡跟她說「這件交給妳：（委託）」，就會放到她桌上（可以放很多件，她照順序做）。</p>`;
    }
    let html = '';
    if (run) {
      const elapsed = run.started && run.status !== 'queued' && run.status !== 'placed' ? `・${mins(Date.now() - run.started)}` : '';
      html += `<div class="sec">${run.status === 'running' || run.status === 'paused' ? '正在做' : '下一件'}</div><div class="box">
        <div class="title">${esc(run.title)}</div>${run.note ? `<p class="mini">說明：${esc(run.note)}</p>` : ''}
        ${run.mode === 'extend' && run.feedback ? `<p class="mini">延伸：${esc(run.feedback)}</p>` : run.mode === 'redo' && run.feedback ? `<p class="mini">退回重做：${esc(run.feedback)}</p>` : ''}
        <div><span class="chip ${run.status === 'running' ? 'run' : ''}">${STATUS[run.status] || run.status}${elapsed}</span><span class="mini">${agentLabel()}</span></div>
        ${run.ask ? `<div class="ask"><b>${run.ask.kind === 'clarify' ? '她要問你' : '她要你決定'}</b><div>${esc(run.ask.text)}</div>
          ${run.ask.kind === 'clarify' ? `<textarea id="desk-ans" maxlength="2000" placeholder="你的回答"></textarea>
          <div class="row"><button type="button" class="main" data-a="ans">送出</button></div>`
          : `<div class="row"><button type="button" class="main" data-a="yes">可以</button><button type="button" data-a="no">不行</button></div>`}</div>`
          : summary.trouble && run.status === 'running' ? `<div class="trouble">卡住：${esc(summary.trouble.text)}</div>` : ''}
        ${run.status === 'queued' || run.status === 'placed' ? '<p class="mini">叫她「去工作」，她坐到書桌前就開工。</p>' : ''}
        ${run.status === 'paused' ? '<p class="mini">她回到書桌就接著做（叫她「去工作」也行）。</p>' : ''}
        ${run.status === 'running' || run.status === 'paused' ? timeline(events, summary, run) : ''}
        <div class="row">
          ${run.status === 'running' ? '<button type="button" data-a="kick">卡住了？重新接上</button>' : ''}
          <button type="button" data-a="cancel" data-id="${run.id}">收回這件</button>
        </div>
        ${run.status === 'running' && events.length ? `<p class="mini">最後一則動靜：${mins(Date.now() - events[events.length - 1].at)}前</p>` : ''}
        ${run.status === 'running' && !run.ask ? `<div class="sec">補充指示</div>
          <textarea id="desk-steer" maxlength="2000" placeholder="做到一半想加的話，例：記得附上來源"></textarea>
          <div class="row"><button type="button" class="main" data-a="steer">送出補充</button></div>` : ''}
      </div>`;
    }
    if (queue.length) html += `<div class="sec">排隊中（${queue.length}）</div>` + queue.map((q, i) => itemRow(q,
      `<button type="button" data-a="cancel" data-id="${q.id}">收回</button>`,
      `第 ${i + (run ? 2 : 1)} 件${q.mode === 'redo' ? '・退回重做' : q.mode === 'extend' ? '・延伸' : ''}${q.note ? `・${esc(q.note)}` : ''}`)).join('');
    if (reports.length) html += `<div class="sec">報告交了（${reports.length}）</div>` + reports.map(r => itemRow(r,
      `<button type="button" class="main" data-a="open" data-id="${r.id}">看報告</button>`, r.finished ? `${hhmm(r.finished)} 交的` : '')).join('');
    if (failed.length) html += `<div class="sec">出錯的（${failed.length}）</div>` + failed.map(r => itemRow(r,
      `<button type="button" data-a="openfail" data-id="${r.id}">看</button><button type="button" class="main" data-a="retry" data-id="${r.id}">重來</button>`)).join('');
    return html + shelfHint();
  }
  /** 書桌總覽底下：書櫃裡有東西 → 一列「去書櫃看」。 */
  function shelfHint() {
    if (!shelfPending.length && !shelfTotal) return '';
    const sub = [shelfPending.length ? `${shelfPending.length} 份報告等你看` : '', shelfTotal ? `完成 ${shelfTotal} 件` : ''].filter(Boolean).join('・');
    return `<div class="sec">書櫃</div>${itemRow({ title: '她完成的放在書櫃' }, '<button type="button" data-a="shelf">去書櫃看</button>', sub)}`;
  }
  /** 書櫃裡的那件：請她看看（打開對話、她說心得，可以接著討論）／丟掉。 */
  function shelfButtons(r) {
    return `<div class="row"><button type="button" class="main" data-a="discuss">請她看看、說說心得</button><button type="button" data-a="remove" data-id="${r.id}">丟掉</button></div>`;
  }
  const day = at => { const d = new Date(at); return `${d.getMonth() + 1}/${d.getDate()} ${hhmm(at)}`; };
  function paintShelf() {
    if (!shelfPending.length && !shelfDone.length) {
      return `<p>${offline ? '書櫃連不上伺服器。' : '書櫃裡還沒有她完成的東西。'}</p><p class="mini">她做完的報告，等她離開書桌就會收進書櫃；你收下的委託也會放在這裡，隨時可以再看。</p>`;
    }
    let html = '';
    if (shelfPending.length) html += `<div class="sec">等你看的報告（${shelfPending.length}）</div>` + shelfPending.map(r => itemRow(r,
      `<button type="button" class="main" data-a="open" data-id="${r.id}">看報告</button>`, r.finished ? `${day(r.finished)} 交的` : '')).join('');
    if (shelfDone.length) html += `<div class="sec">完成的委託（${shelfTotal}）</div>` + shelfDone.map(r => itemRow(r,
      `<button type="button" data-a="archive" data-id="${r.id}">看</button>`,
      [r.finished ? day(r.finished) : '', r.girlName || ''].filter(Boolean).join('・'))).join('')
      + (shelfTotal > shelfDone.length ? `<p class="mini">只列出最近 ${shelfDone.length} 件。</p>` : '');
    return html;
  }
  function paint(force = false) {
    if (!card || card.hidden) return;
    const box = card.querySelector('#desk-card');
    const keep = box.querySelector('textarea')?.value;
    if (!force && box.querySelector('textarea') === document.activeElement) return;   // 正在打字：不重畫
    const r = sel && sel.run;
    const titles = { log: '她桌上的工作', shelf: '書櫃', report: '報告書', extend: '延伸', redo: '退回重做', fail: '出錯的工作', archive: '完成的委託' };
    const head = `<div class="hd">${mode !== home ? '<button type="button" class="x" data-a="back" aria-label="回上一頁">‹</button>' : ''}<h2 id="desk-h">${titles[mode] || ''}</h2><button type="button" class="x" data-a="close" aria-label="關閉">×</button></div>`;
    let body = '';
    if (mode === 'shelf' || (!r && home === 'shelf')) body = paintShelf();
    else if (mode === 'log' || !r) body = paintOverview();
    else if (mode === 'archive') {
      body = `<div class="title">${esc(r.title)}</div><div><span class="chip done">完成了</span><span class="mini">${r.finished ? day(r.finished) + ' 交的' : ''}</span></div>
        ${r.note ? `<p class="mini">說明：${esc(r.note)}</p>` : ''}
        <div class="report">${r.report ? md(r.report) : '<p class="mini">（沒有報告內容）</p>'}</div>
        ${shelfButtons(r)}
        ${timeline(sel.events, sel.summary, r)}`;
    }
    else if (mode === 'report') {
      body = `<div class="title">${esc(r.title)}</div><div class="report">${md(r.report)}</div>
        <div class="row"><button type="button" class="main" data-a="accept">完成委託</button><button type="button" data-a="extend-open">延伸</button><button type="button" data-a="redo-open">退回重做</button></div>
        <p class="mini">延伸＝這件先算完成、金幣先拿，她接著做後續（插隊，下一件就做）。</p>
        ${r.shelved ? shelfButtons(r) : ''}
        ${timeline(sel.events, sel.summary, r)}`;
    } else if (mode === 'extend') {
      body = `<div class="title">${esc(r.title)}</div><p class="mini">這件委託先算完成（金幣先給、委託板上的拿掉），她接著同一份工作做後續（插隊，下一件就做），做完交新的報告。</p>
        <textarea id="desk-ext" maxlength="2000" placeholder="例：再寫一份給老闆的一頁摘要">${esc(keep || '')}</textarea>
        <div class="row"><button type="button" class="main" data-a="extend">完成並延伸</button><button type="button" data-a="report">回報告</button></div>`;
    } else if (mode === 'redo') {
      body = `<div class="title">${esc(r.title)}</div><p class="mini">寫哪裡要改，她會照你的意見重做同一件（插隊，下一件就做）。</p>
        <textarea id="desk-fb" maxlength="2000" placeholder="例：結論寫短一點，多舉一個例子">${esc(keep || '')}</textarea>
        <div class="row"><button type="button" class="main" data-a="redo">送回去重做</button><button type="button" data-a="report">回報告</button></div>`;
    } else if (mode === 'fail') {
      body = `<div class="title">${esc(r.title)}</div><div><span class="chip failed">出錯停了</span></div>
        <div class="row"><button type="button" class="main" data-a="retry" data-id="${r.id}">重來</button><button type="button" data-a="cancel" data-id="${r.id}">收回</button></div>
        ${timeline(sel.events, sel.summary, r)}`;
    }
    box.innerHTML = head + body + (msg ? `<div class="msg">${esc(msg)}</div>` : '');
    box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a, b.dataset.id ? Number(b.dataset.id) : null));
  }
  async function act(a, id) {
    msg = '';
    const Q = window.YorozuyaQuests;
    try {
      if (a === 'close') { closeLog(); return; }
      if (a === 'back') { mode = home; sel = null; paint(true); return; }
      if (a === 'shelf') { mode = home = 'shelf'; sel = null; paint(true); return; }
      if (a === 'archive') { await openItem(id, 'archive'); return; }
      if (a === 'discuss') {
        // test_room_summon 接手：她在房間就打開對話、她先說心得（RoomDesk.onDiscuss 由它設）
        const r = sel?.run;
        const res = r && window.RoomDesk.onDiscuss ? window.RoomDesk.onDiscuss({ id: r.id, title: r.title, report: r.report || '',
          note: r.note || '', girlId: r.girlId || '', girlName: r.girlName || '', accepted: r.status === 'accepted' }) : { error: '她不在房間。' };
        if (res && res.ok) { closeLog(); return; }
        msg = (res && res.error) || '現在沒辦法叫她看。'; paint(true); return;
      }
      if (a === 'remove') {
        const r = sel?.run;
        const pend = r && r.status === 'done';
        if (!window.confirm(pend ? '丟掉這份報告？還沒收下，委託會回到委託板（沒有完成），報告和日誌刪掉就回不來了。'
          : '從書櫃丟掉這件？報告和日誌刪掉就回不來了（委託已經完成，金幣不會收回）。')) return;
        await api('/api/desk/remove', { id });
        toastRoom(`「${r?.title || ''}」丟掉了。`);
        mode = home; sel = null;
      }
      if (a === 'open') { await openItem(id, 'report'); return; }
      if (a === 'openfail') { await openItem(id, 'fail'); return; }
      if (a === 'report') { mode = 'report'; paint(true); return; }
      if (a === 'redo-open') { mode = 'redo'; paint(true); card.querySelector('#desk-fb')?.focus(); return; }
      if (a === 'extend-open') { mode = 'extend'; paint(true); card.querySelector('#desk-ext')?.focus(); return; }
      if (a === 'extend') {
        // 先讓伺服器收下延伸（寫後續、還有報告才行），成功了才完成委託領金幣
        const r = sel.run, text = card.querySelector('#desk-ext')?.value || '';
        const j = await api('/api/desk/extend', { id: r.id, followup: text });
        const qid = j.run?.doneQuestId || r.questId;
        const ok = qid && Q?.complete ? Q.complete(qid) : false;
        toastRoom(ok ? `「${r.title}」完成了，她接著做後續。` : '她接著做後續。');
        mode = home; sel = null;
      }
      if (a === 'redo') {
        const r = sel.run, fb = card.querySelector('#desk-fb')?.value || '';
        await api('/api/desk/redo', { id: r.id, feedback: fb });
        toastRoom('退回去了，她下一件就照你的意見重做。');
        mode = home; sel = null;
      }
      if (a === 'accept') {
        const r = sel.run;
        await api('/api/desk/accept', { id: r.id });
        const ok = r.questId && Q?.complete ? Q.complete(r.questId) : false;
        toastRoom(ok ? `「${r.title}」完成了。` : `收下「${r.title}」的報告了。`);
        mode = home; sel = null;
      }
      if (a === 'retry') {
        await api('/api/desk/retry', { id });
        toastRoom('排回去了，她下一件就重來。');
        mode = home; sel = null;
      }
      if (a === 'cancel') {
        if (!window.confirm('把這件從她桌上收回？做到一半的會停掉。')) return;
        await api('/api/desk/cancel', { id });
        mode = home; sel = null;
      }
      if (a === 'kick') {
        if (!window.confirm('停掉她現在這一輪，叫她從做到的地方接著做？（她看起來卡住、很久沒動靜時用）')) return;
        await api('/api/desk/kick', {});
        toastRoom('重新接上了，她接著做。');
      }
      if (a === 'steer') {
        const text = card.querySelector('#desk-steer')?.value || '';
        const j = await api('/api/desk/steer', { text });
        card.querySelector('#desk-steer').value = '';
        toastRoom(j.how === 'queued' ? '記下了，下一輪會帶給她。' : '補充給她了。');
      }
      if (a === 'yes' || a === 'no' || a === 'ans') {
        const text = a === 'yes' ? '可以' : a === 'no' ? '不行' : (card.querySelector('#desk-ans')?.value || '');
        const r = await answer(text);
        if (r.error) { msg = r.error; paint(true); return; }
        toastRoom(a === 'no' ? '你說不行，她換個做法。' : '回答了，她接著做。');
        try { if (window.RoomActor?.activity?.()?.id === 'desk_ask') window.RoomActor.order?.('work'); } catch { /* */ }
      }
      await pull();
      refreshQuests();
      paint(true);
    } catch (e) { msg = e.message || String(e); paint(true); }
  }

  window.RoomDesk = { give, start, pause, answer, pendingAsk, busy, working, prop, icon, poseWeights, promptLines, openLog, openShelf, closeLog,
    questIds, state: () => ({ run, events: events.slice(), summary, agent, offline, queue, reports, failed, shelfPending, shelfDone }), pull };
  void pull();
  loop();
})();
