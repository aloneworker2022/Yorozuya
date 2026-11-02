/* 她桌上的工作（agent office，2026-11-01）：前端這一半。
   伺服器（server/desk_agent.py）背景跑 agent、記事件；這裡每 2 秒拉一次，給：
   - 房間：桌上的紙／報告書（prop）、她頭上的氣泡（icon）、做中時讓她一直坐在書桌前（busy）
   - 點書桌：工作日誌（主 agent 時間軸、使魔＝subagent、外包、卡住的地方）＋報告書（完成委託／退回重做）
   - 聊天：她知道自己桌上在做什麼（promptLines）；「這件交給妳：…」由 test_room_summon 呼叫 give()
   她坐到書桌前（desk_work 定下來）而桌上有還沒開工的委託 → 自動 start。
   window.RoomDesk = {give, start, busy, prop, icon, promptLines, openLog, state} */
(() => {
  'use strict';
  const POLL_MS = 2000, IDLE_POLL_MS = 6000;
  let run = null, events = [], summary = { subs: [], exts: [], last: null, trouble: null }, agent = 'mock';
  let lastSeq = 0, offline = false, polling = false, startAsked = 0;

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(j.detail || `HTTP ${r.status}`); e.status = r.status; throw e; }
    return j;
  }
  function take(j) {
    const next = j.run || null;
    if (!next || !run || next.id !== run.id) { events = []; lastSeq = 0; }
    const report = next && next.status === 'done' ? (next.report || run?.report || '') : '';
    run = next ? { ...next, report } : null;
    for (const e of j.events || []) if (e.seq > lastSeq) { events.push(e); lastSeq = e.seq; }
    if (events.length > 400) events = events.slice(-400);
    summary = j.summary || summary;
    agent = j.agent || agent;
  }
  async function pull() {
    if (polling) return;
    polling = true;
    try {
      const j = await api(`/api/desk?since=${run ? lastSeq : 0}`);
      offline = false;
      const before = run && `${run.id}:${run.status}`;
      take(j);
      if (before !== (run && `${run.id}:${run.status}`)) onStatusChange();
      maybeStart();
      maybeAsk();
      paint();
    } catch { offline = true; }
    finally { polling = false; }
  }
  function loop() {
    setTimeout(async () => { if (!document.hidden) await pull(); loop(); }, run && run.status === 'running' ? POLL_MS : IDLE_POLL_MS);
  }

  // ------------------------------------------------------------ 房間
  /** 她坐到書桌前、桌上的委託還沒開工（或出錯停了）→ 開工。 */
  function maybeStart() {
    if (!run || (run.status !== 'placed') || Date.now() - startAsked < 8000) return;
    const a = window.RoomActor?.activity?.();
    if (!a || a.id !== 'desk_work' || a.phase !== 'hold') return;
    startAsked = Date.now();
    void start();
  }
  async function start() {
    try { take({ ...(await api('/api/desk/start', {})), events: [], summary }); await pull(); return true; }
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
      take({ run: j.run, events: [], summary });
      void pull(); paint();
      return { ok: true, choice: j.choice };
    } catch (e) {
      if (e.status === 409) void pull();
      return { error: e.message || String(e) };
    }
  }
  const pendingAsk = () => (run && run.ask) || null;
  function refreshQuests() { try { window.YorozuyaQuests?.refresh?.(); } catch { /* */ } }
  function onStatusChange() {
    refreshQuests();
    if (run && run.status === 'done') toastRoom(`「${run.title}」的報告寫好了，點書桌看。`);
    if (run && run.status === 'failed') toastRoom(`「${run.title}」做到一半出錯停了，點書桌看。`);
  }
  const busy = () => !!(run && run.status === 'running');
  /** 桌上有她該做的事（放著還沒開工＋做中）：她會回書桌、坐著不起來。 */
  const working = () => !!(run && (run.status === 'running' || run.status === 'placed'));
  /** 桌上要畫什麼：paper 一疊紙（放著／做中）｜report 報告書（交上來了）｜null。 */
  const prop = () => !run ? null : run.status === 'done' ? 'report' : 'paper';
  /** 她在書桌前換什麼動作（權重）：做中多半在寫、偶爾撐頭想；卡住就一直撐著頭想；交了報告伸懶腰、滑手機。
      沒有委託在做 → null（照 desk_work.poses）。 */
  function poseWeights() {
    if (!run) return null;
    if (run.status === 'running') return summary.trouble ? { sit_think: 5, sit_work: 1, sit_scribble: .6 }
      : { sit_work: 3, sit_scribble: 2.5, sit_think: 1.2, sit_stretch: .3 };
    if (run.status === 'done') return { sit_stretch: 1.5, sit_phone: 2, sit_think: .5 };
    if (run.status === 'failed') return { sit_think: 3, sit_phone: 1 };
    return null;
  }
  /** 她在書桌前的氣泡（蓋過動作的氣泡）：卡住冒汗；報告交了愛心；其他照她的動作（寫字鉛筆、想事情點點…）。 */
  function icon() {
    if (!run) return null;
    if (run.ask) return 'sweat';
    if (run.status === 'running') return summary.trouble ? 'sweat' : null;
    if (run.status === 'failed') return 'sweat';
    if (run.status === 'done') return 'heart';
    return null;
  }
  function toastRoom(text) { try { window.RoomActor?.tip?.(text); } catch { /* */ } }

  // ------------------------------------------------------------ 聊天
  /** 交給她：放上桌。→ {placed:title}｜{busy:title}｜{offline:true}｜{error} */
  /** go：放上去就叫她去書桌（委託板長按放上桌；聊天交的等對話關掉才走，不用 go）。
      girlId／girlName 沒給就問現在房間裡的她（test_room_summon 設的 RoomDesk.who）。 */
  async function give({ questId = '', title = '', note = '', girlId = '', girlName = '', go = false } = {}) {
    try {
      if (!girlId && !girlName) { try { ({ id: girlId = '', name: girlName = '' } = window.RoomDesk.who?.() || {}); } catch { /* */ } }
      const j = await api('/api/desk/put', { questId, title, note, girlId, girlName });
      take({ run: j.run, events: [], summary: { subs: [], exts: [], last: null, trouble: null }, agent });
      void pull(); paint();
      refreshQuests();
      if (go && window.RoomActor?.isPresent?.()) {
        const a = window.RoomActor.activity?.();
        if (!(a && a.id === 'desk_work')) window.RoomActor.order?.('work');
      }
      return { placed: j.run.title };
    } catch (e) {
      if (e.status === 409) { await pull(); return { busy: run ? run.title : '' }; }
      if (!e.status) return { offline: true };
      return { error: e.message };
    }
  }
  function mins(ms) { const m = Math.max(0, Math.round(ms / 60000)); return m < 1 ? '不到一分鐘' : m < 60 ? `${m} 分鐘` : `${Math.round(m / 6) / 10} 小時`; }
  /** 她桌上的工作 → prompt（她知道自己在做什麼、卡在哪；不要把過程條列給他）。 */
  function promptLines() {
    if (!run) return [];
    const t = `「${run.title}」`, out = ['【你桌上的工作】'];
    if (run.ask) {
      out.push(run.ask.kind === 'clarify'
        ? `你在做${t}時卡住，要問他：${run.ask.text}。用你的口氣問他，等他回答。`
        : `你在做${t}時停下來，要他決定可不可以：${run.ask.text}。用你的口氣簡單說要做什麼、問他可不可以，等他回答（他說可以或不行）。`);
      return out;
    }
    if (run.status === 'placed') out.push(`他交給你的委託${t}放在你桌上，還沒開始做（坐到書桌前就開工）。`);
    if (run.note) out.push(`他附的說明：${run.note}`);
    else if (run.status === 'running') {
      out.push(`你正在做他交給你的委託${t}（做了${mins(Date.now() - (run.started || Date.now()))}）。`);
      if (summary.last) out.push(`現在做到：${summary.last.text}`);
      if (summary.trouble) out.push(`剛剛卡住：${summary.trouble.text}`);
      const live = summary.subs.filter(s => s.status === 'run').length;
      if (live) out.push(`你叫了 ${live} 隻使魔在幫忙。`);
    } else if (run.status === 'done') out.push(`${t}的報告你寫好了，放在桌上等他看。`);
    else if (run.status === 'failed') out.push(`${t}做到一半出錯停下來了。`);
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
  const STATUS = { placed: '放在桌上・還沒開工', running: '做中', done: '報告交了', failed: '出錯停了' };
  const KIND = { ask: '問你', plan: '計畫', tool: '工具', think: '想', trouble: '卡住', spawn: '叫出', done: '完成', dispatch: '外包', report: '報告', note: '你說', status: '', error: '出錯' };
  function who(actor) {
    if (actor === 'main') return run?.girlName || '她';
    const m = actor.match(/^sub:(\d+)/);
    if (m) return `使魔${'①②③④⑤⑥⑦⑧⑨⑩'[Number(m[1]) - 1] || m[1]}`;
    const x = actor.match(/^ext:(.+)/);
    if (x) return `外包・${({ claude: 'Claude Code', grok: 'Grok', chatgpt: 'ChatGPT', codex: 'Codex' })[x[1]] || x[1]}`;
    return actor;
  }
  const hhmm = at => { const d = new Date(at); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };

  let card = null, mode = 'log', msg = '';
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
#desk-card .row button{font:inherit;border:1px solid #c8bba7;background:#f6f1e7;color:#4e463a;border-radius:8px;padding:9px 12px;min-height:40px;cursor:pointer}
#desk-card .row button.main{background:#6b3a2a;border-color:#6b3a2a;color:#fff}
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
    ov.addEventListener('click', e => { if (e.target === ov) closeLog(); });
    document.body.append(ov);
    card = ov;
    return card;
  }
  function openLog(view = null) {
    ensureCard();
    mode = view || (run && run.status === 'done' ? 'report' : 'log');
    msg = '';
    card.hidden = false;
    paint(true);
    void pull();
  }
  function closeLog() { if (card) card.hidden = true; }
  function paint(force = false) {
    if (!card || card.hidden) return;
    const box = card.querySelector('#desk-card');
    const keep = box.querySelector('textarea')?.value;
    if (!force && box.querySelector('textarea') === document.activeElement) return;   // 正在打退回意見：不重畫
    const head = `<div class="hd"><h2 id="desk-h">${mode === 'report' ? '報告書' : '她桌上的工作'}</h2><button type="button" class="x" aria-label="關閉">×</button></div>`;
    let body = '';
    if (!run) {
      body = `<p>${offline ? '書桌連不上伺服器。' : '桌上沒有工作。'}</p><p class="mini">在聊天裡跟她說「這件交給妳：（委託）」，就會放到她桌上；她坐到書桌前就開工。一次只能放一件。</p>`;
    } else if (mode === 'report' && run.status === 'done') {
      body = `<div class="title">${esc(run.title)}</div><div class="report">${md(run.report)}</div>
        <div class="row"><button type="button" class="main" data-a="accept">完成委託</button><button type="button" data-a="redo-open">退回重做</button><button type="button" data-a="log">看工作日誌</button></div>
        ${mode === 'report' && msg === '__redo' ? '' : ''}`;
    } else if (mode === 'redo') {
      body = `<div class="title">${esc(run.title)}</div><p class="mini">寫哪裡要改，她會照你的意見接著做同一件。</p>
        <textarea id="desk-fb" maxlength="2000" placeholder="例：結論寫短一點，多舉一個例子">${esc(keep || '')}</textarea>
        <div class="row"><button type="button" class="main" data-a="redo">送回去重做</button><button type="button" data-a="report">回報告</button></div>`;
    } else {
      const elapsed = run.started ? `・${mins((run.finished || Date.now()) - run.started)}` : '';
      const subs = summary.subs.map(s => `<div class="agent"><span class="st">${s.status === 'run' ? '…' : s.status === 'ok' ? '✓' : '✗'}</span><b>${esc(who(s.id))}</b>${esc(s.goal)}<div class="mini">${esc(s.last || '')}</div></div>`).join('');
      const exts = summary.exts.map(s => `<div class="agent"><span class="st">${s.status === 'run' ? '…' : s.status === 'ok' ? '✓' : '✗'}</span><b>${esc(who(s.id))}</b>${esc(s.goal)}<div class="mini">${esc(s.last || '')}</div></div>`).join('');
      const tl = events.slice().reverse().filter(e => e.actor === 'main' || e.kind !== 'tool' || e.status !== 'run').slice(0, 60).map(e =>
        `<li class="${e.status === 'fail' ? 'fail' : e.status === 'ok' ? 'ok' : ''}"><span class="t">${hhmm(e.at)}</span><span><span class="w">${esc(who(e.actor))}${KIND[e.kind] ? '・' + KIND[e.kind] : ''}</span>${esc(e.text)}</span></li>`).join('');
      body = `<div class="title">${esc(run.title)}</div>${run.note ? `<p class="mini note">說明：${esc(run.note)}</p>` : ''}
        <div><span class="chip ${run.status === 'running' ? 'run' : run.status}">${STATUS[run.status] || run.status}${elapsed}</span><span class="mini">${agent === 'mock' ? '示範 agent（還沒接 Hermes）' : agent === 'hermes' ? 'Hermes（RP5）' : esc(agent)}</span></div>
        ${run.ask ? `<div class="ask"><b>${run.ask.kind === 'clarify' ? '她要問你' : '她要你決定'}</b><div>${esc(run.ask.text)}</div>
          ${run.ask.kind === 'clarify' ? `<textarea id="desk-ans" maxlength="2000" placeholder="你的回答">${esc(keep || '')}</textarea>
          <div class="row"><button type="button" class="main" data-a="ans">送出</button></div>`
          : `<div class="row"><button type="button" class="main" data-a="yes">可以</button><button type="button" data-a="no">不行</button></div>`}</div>`
          : summary.trouble && run.status === 'running' ? `<div class="trouble">卡住：${esc(summary.trouble.text)}</div>` : ''}
        ${subs ? `<div class="sec">使魔（subagent）</div><div class="cards">${subs}</div>` : ''}
        ${exts ? `<div class="sec">外包</div><div class="cards">${exts}</div>` : ''}
        <div class="sec">工作日誌</div><ol class="tl">${tl || '<li><span></span><span class="mini">還沒有紀錄。</span></li>'}</ol>
        <div class="row">
          ${run.status === 'done' ? '<button type="button" class="main" data-a="report">看報告書</button>' : ''}
          ${run.status === 'failed' ? '<button type="button" class="main" data-a="start">重來</button>' : ''}
          ${run.status === 'placed' ? '<span class="mini">叫她「去工作」，她坐到書桌前就開工。</span>' : ''}
          <button type="button" data-a="cancel">收回這件</button>
        </div>`;
    }
    box.innerHTML = head + body + (msg && msg !== '__redo' ? `<div class="msg">${esc(msg)}</div>` : '');
    box.querySelector('.x').onclick = closeLog;
    box.querySelectorAll('[data-a]').forEach(b => b.onclick = () => act(b.dataset.a));
  }
  async function act(a) {
    msg = '';
    try {
      if (a === 'log' || a === 'report') { mode = a; paint(true); return; }
      if (a === 'redo-open') { mode = 'redo'; paint(true); card.querySelector('#desk-fb')?.focus(); return; }
      if (a === 'start') { await start(); mode = 'log'; }
      if (a === 'yes' || a === 'no' || a === 'ans') {
        const text = a === 'yes' ? '可以' : a === 'no' ? '不行' : (card.querySelector('#desk-ans')?.value || '');
        const r = await answer(text);
        if (r.error) { msg = r.error; paint(true); return; }
        toastRoom(a === 'no' ? '你說不行，她換個做法。' : '回答了，她接著做。');
        try { if (window.RoomActor?.activity?.()?.id === 'desk_ask') window.RoomActor.order?.('work'); } catch { /* */ }
      }
      if (a === 'redo') {
        const fb = card.querySelector('#desk-fb')?.value || '';
        take({ ...(await api('/api/desk/redo', { feedback: fb })), events: [], summary });
        mode = 'log';
        toastRoom('退回去了，她會照你的意見再做一次。');
      }
      if (a === 'accept') {
        const done = run;
        await api('/api/desk/accept', {});
        const Q = window.YorozuyaQuests;
        const ok = done?.questId && Q?.complete ? Q.complete(done.questId) : false;
        toastRoom(ok ? `「${done.title}」完成了。` : `收下「${done.title}」的報告了。`);
        run = null; events = []; lastSeq = 0;
        closeLog();
      }
      if (a === 'cancel') {
        if (!window.confirm('把這件從她桌上收回？做到一半的會停掉。')) return;
        await api('/api/desk/cancel', {});
        run = null; events = []; lastSeq = 0;
        mode = 'log';
      }
      await pull();
      paint(true);
    } catch (e) { msg = e.message || String(e); paint(true); }
  }

  window.RoomDesk = { give, start, answer, pendingAsk, busy, working, prop, icon, poseWeights, promptLines, openLog, closeLog,
    state: () => ({ run, events: events.slice(), summary, agent, offline }), pull };
  void pull();
  loop();
})();
