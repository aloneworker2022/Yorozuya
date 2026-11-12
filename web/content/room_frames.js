/* 牆上的相框（2026-11-04）：相框裡是一個網頁，她（魅魔）寫的；伺服器 server/room_frames.py。
   - 四個位置：左牆 0、1，後牆 2、3（一面牆兩個）。test_room.js 畫框、點框 → open(slot)。
   - 點掛著的：打開看網頁（iframe sandbox allow-scripts，可以是 app），「拿下來」只有你能按（她不會拿）。
   - 點空的：請她寫一個網頁掛這裡（放一件上她的桌，做完她自己掛），或從書櫃挑她做過的網頁掛上去。
   - 四個都掛滿了不能再掛，要先拿下一幅（伺服器也擋，409）。
   - 書桌附件裡的 .html 也可以直接「掛牆上」（room_desk.js 叫 hangFile）。
   - 使用者模式（2026-11-12）：相框外層（不是她寫的網頁）由你設定 誰來用（她／Hermes／她跟 Hermes）、
     誰可以看（你／她／Hermes）、查看時間（每天幾點到幾點＋可選日期，台北時間）。存在伺服器（跟著那份網頁）。
     預設只有你看得到；她要你勾了、而且在時間內才知道這幅（promptLines 只講她看得到的）。
     你不在名單或不在時間內：打開只看到外層（可以改設定），網頁內容藏起來。
   window.RoomFrames = {slots, key, open, hangFile, promptLines, pull, canView, inWindow} */
(() => {
  'use strict';
  const POLL_MS = 8000, SLOTS = 4;
  const WALL = ['左牆', '左牆', '後牆', '後牆'];
  const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-downloads';
  let frames = [null, null, null, null], wants = [], loaded = false, offline = false;
  const seen = new Set();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
  const OPS = { her: '她', hermes: 'Hermes', both: '她跟 Hermes 一起' };
  const WHO = { you: '你', her: '她', hermes: 'Hermes' };
  const DEF_MODE = { operator: '', viewers: ['you'], start: '', end: '', dateFrom: '', dateTo: '' };
  const modeOf = f => ({ ...DEF_MODE, ...((f && f.mode) || {}) });
  /** 台北時間（UTC+8、沒有夏令時間）→ {day:'YYYY-MM-DD', hm:'HH:MM'} */
  function tpe(nowMs) {
    const d = new Date((nowMs ?? Date.now()) + 8 * 3600e3), p = n => String(n).padStart(2, '0');
    return { day: `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())}`, hm: `${p(d.getUTCHours())}:${p(d.getUTCMinutes())}` };
  }
  /** 現在在不在查看時間裡（沒設＝一直都在；22:00–02:00 這種跨午夜也行） */
  function inWindow(mode, nowMs) {
    const m = { ...DEF_MODE, ...(mode || {}) }, t = tpe(nowMs);
    if (m.dateFrom && t.day < m.dateFrom) return false;
    if (m.dateTo && t.day > m.dateTo) return false;
    if (!m.start || !m.end) return true;
    return m.start < m.end ? (t.hm >= m.start && t.hm < m.end) : (t.hm >= m.start || t.hm < m.end);
  }
  /** who（you／her／hermes）現在看得到這幅網頁嗎 */
  const canView = (f, who, nowMs) => !!f && modeOf(f).viewers.includes(who) && inWindow(modeOf(f), nowMs);
  function modeText(m) {
    const time = m.start && m.end ? `每天 ${m.start}–${m.end}` : '不限時間';
    const days = m.dateFrom || m.dateTo ? `（${m.dateFrom || '…'} ～ ${m.dateTo || '…'}）` : '';
    return `誰來用：${OPS[m.operator] || '還沒選'}・誰可以看：${m.viewers.map(v => WHO[v]).join('、') || '沒有人'}・${time}${days}`;
  }
  const tip = text => { try { window.RoomActor?.tip?.(text); } catch { /* */ } };

  async function api(path, body) {
    const r = await fetch(path, body === undefined ? { cache: 'no-store' } : {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || {}) });
    const j = await r.json().catch(() => ({}));
    if (!r.ok) {
      const old = r.status === 405 || (r.status === 404 && !j.detail);
      const e = new Error(old ? '伺服器還是舊版，請重開遊戲伺服器（~/start_yorozuya.sh）' : (j.detail || `HTTP ${r.status}`));
      e.status = r.status; throw e;
    }
    return j;
  }
  async function pull() {
    try {
      const j = await api('/api/frames');
      const next = Array.from({ length: SLOTS }, (_, i) => (j.frames || [])[i] || null);
      for (const f of next) {
        if (!f || seen.has(f.fid)) continue;
        seen.add(f.fid);
        if (loaded && f.by === 'her') tip(`${f.girlName || '她'}把「${f.title}」掛到${WALL[f.slot]}上了，點相框看看。`);
      }
      frames = next; wants = j.wants || []; loaded = true; offline = false;
    } catch { offline = true; }
  }
  async function loop() {
    if (!document.hidden) await pull();
    setTimeout(loop, POLL_MS);
  }

  /** test_room 畫框用：每格 {state: empty|frame|want, title, hue, her} */
  function slots() {
    return frames.map((f, i) => {
      if (f) { let h = 0; for (const c of f.fid) h = (h * 31 + c.charCodeAt(0)) % 360; return { state: 'frame', title: f.title, hue: h, her: f.by === 'her' }; }
      return { state: wants.some(w => w.slot === i) ? 'want' : 'empty' };
    });
  }
  const key = () => slots().map(s => `${s.state}:${s.hue ?? ''}`).join('|');

  /** 書桌附件「掛牆上」：第一個空位。→ true／false（掛滿等等，已提示） */
  async function hangFile(runId, name, slot) {
    if (loaded && slot == null && frames.every(Boolean)) { tip('牆上四個位置都掛滿了，先點一幅、拿下來才能再掛。'); return false; }
    try {
      const j = await api('/api/frames/hang', { runId, name, slot });
      await pull();
      tip(`「${j.frame.title}」掛到${WALL[j.frame.slot]}上了。`);
      return true;
    } catch (e) { tip(e.message); return false; }
  }

  /** 聊天 prompt（你＝她、他＝玩家）：只講她現在看得到的那幾幅（他勾了她、而且在查看時間內）；
      看不到的一個字都不提，她不會知道。誰來用決定她能不能自己操作、能不能請 Hermes 一起。 */
  function promptLines(nowMs) {
    const mine = frames.filter(f => canView(f, 'her', nowMs));
    if (!mine.length) return [];
    const out = ['【牆上的相框】'];
    for (const f of mine) {
      const m = modeOf(f), where = `${WALL[f.slot]}「${f.title}」`;
      const origin = f.by === 'her' ? '你請 Hermes 寫的、你自己掛上去的' : '你請 Hermes 寫的、他掛上去的';
      if (m.operator === 'her') out.push(`${where}（${origin}）：這幅是給你用的看板，你可以自己打開來用、操作，聊到相關的事可以提起你在上面看到或做了什麼。`);
      else if (m.operator === 'both') out.push(`${where}（${origin}）：這幅是給你和 Hermes 一起用的看板，你可以自己打開來用、操作；要更新內容或改功能時，也可以請 Hermes 幫你操作或更新它（坐到書桌前，接著同一件工作交給 Hermes）。`);
      else if (m.operator === 'hermes') out.push(`${where}（${origin}）：這幅是 Hermes 在用的看板，你知道它在那裡、可以看，但不是給你自己操作的。`);
      else out.push(`${where}（${origin}）：他還沒決定這幅給誰用，你可以看，但先不要自己動它。`);
    }
    out.push('他可以點開相框來看；只有他能把相框拿下來，也只有他能決定誰可以看、誰來用。');
    return out;
  }

  // ------------------------------------------------------------ 畫面
  let ov = null, slotNow = -1, mode = 'view', msg = '', cands = null;
  function ensure() {
    if (ov) return ov;
    const css = document.createElement('style');
    css.textContent = `
#frame-ov{position:fixed;inset:0;z-index:8450;display:flex;align-items:flex-end;justify-content:center;background:rgba(20,16,26,.5)}
#frame-ov[hidden]{display:none}
#frame-card{width:min(100%,520px);max-height:min(88svh,820px);display:flex;flex-direction:column;background:#fbf6ec;color:#3b3328;
  border-radius:14px 14px 0 0;padding:12px 12px max(12px,env(safe-area-inset-bottom));box-shadow:0 -8px 28px rgba(0,0,0,.35);
  font:14px/1.55 system-ui,"Noto Sans TC",sans-serif;box-sizing:border-box}
#frame-ov.full #frame-card{width:100%;max-width:none;height:100svh;max-height:none;border-radius:0}
#frame-card .hd{display:flex;align-items:center;gap:6px;margin-bottom:8px}
#frame-card h2{font-size:15px;margin:0;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#frame-card .x{border:0;background:none;font-size:22px;line-height:1;padding:4px 8px;color:#7a6c5a;cursor:pointer}
#frame-card button,#frame-card a.btn{font:inherit;font-size:13px;padding:5px 10px;border-radius:8px;border:1px solid #cdbb9c;background:#fffaf0;color:#4a3d2c;cursor:pointer;text-decoration:none;white-space:nowrap}
#frame-card button.warn{border-color:#d7a59c;color:#8a3a31}
#frame-card button.go{background:#8c4a3a;border-color:#8c4a3a;color:#fff}
#frame-card .mini{font-size:12px;color:#8a7d6b}
#frame-card .msg{margin:6px 0;padding:6px 10px;border-radius:8px;background:#fbe3dc;color:#7c3a2c;font-size:13px}
#frame-card .body{overflow:auto;flex:1;min-height:0}
#frame-card .wood{flex:1;min-height:52svh;display:flex;border:8px solid #8a5a3c;border-radius:4px;background:#fff;box-shadow:inset 0 0 0 3px #f3e6cc}
#frame-ov.full #frame-card .wood{min-height:0}
#frame-card iframe{flex:1;width:100%;min-height:0;border:0;display:block;background:#fff}
#frame-card .sec{font-size:12px;color:#8a7d6b;margin:12px 0 4px;border-top:1px solid #e7ddcb;padding-top:8px}
#frame-card textarea{width:100%;box-sizing:border-box;min-height:64px;font:inherit;border:1px solid #cdbb9c;border-radius:8px;padding:6px 8px;background:#fff}
#frame-card .row{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed #e7ddcb}
#frame-card .row .t{flex:1;min-width:0}
#frame-card .usr{margin:6px 0;padding:8px 10px;border:1px solid #e0cfb0;border-radius:10px;background:#fffaf0}
#frame-card .usr label{display:inline-flex;align-items:center;gap:4px;margin:2px 12px 2px 0;white-space:nowrap}
#frame-card .usr input[type=time],#frame-card .usr input[type=date]{font:inherit;font-size:13px;border:1px solid #cdbb9c;border-radius:8px;padding:3px 6px;background:#fff}
#frame-card .hide{flex:1;min-height:52svh;display:flex;align-items:center;justify-content:center;text-align:center;padding:16px;border:8px solid #8a5a3c;border-radius:4px;background:#f3e6cc;color:#7a6c5a}
#frame-card .row .t b{display:block;font-weight:500;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`;
    document.head.appendChild(css);
    ov = document.createElement('div');
    ov.id = 'frame-ov'; ov.hidden = true;
    ov.innerHTML = '<div id="frame-card" role="dialog" aria-modal="true"></div>';
    document.body.appendChild(ov);
    // 遮罩：按下去和放開都在外面才關（手機點相框後補的 click 不要馬上關掉）
    let downOut = false;
    ov.addEventListener('pointerdown', e => { downOut = e.target === ov; });
    ov.addEventListener('click', e => { if (e.target === ov && downOut) close(); downOut = false; });
    ov.querySelector('#frame-card').addEventListener('click', onClick);
    return ov;
  }
  const card = () => ensure().querySelector('#frame-card');
  function close() { if (ov) { ov.hidden = true; ov.classList.remove('full'); card().innerHTML = ''; } slotNow = -1; cands = null; }

  async function open(slot) {
    if (!loaded) await pull();
    slotNow = slot; msg = ''; cands = null;
    mode = frames[slot] ? 'view' : 'empty';
    ensure().hidden = false;
    paint();
    if (mode === 'empty') loadCands();
  }
  async function loadCands() {
    try { cands = (await api('/api/frames/candidates')).items || []; } catch (e) { cands = []; msg = e.message; }
    if (mode === 'empty' && slotNow >= 0) paint();
  }
  function paint() {
    const c = card(), f = frames[slotNow], where = `${WALL[slotNow] || ''}・第 ${slotNow % 2 + 1} 個位置`;
    if (mode === 'usermode' && f) {
      const m = modeOf(f);
      const radio = (v, t) => `<label><input type="radio" name="frame-op" value="${v}"${m.operator === v ? ' checked' : ''}>${t}</label>`;
      const box = v => `<label><input type="checkbox" name="frame-vw" value="${v}"${m.viewers.includes(v) ? ' checked' : ''}>${WHO[v]}</label>`;
      c.innerHTML = `<div class="hd"><h2>👥 使用者模式・${esc(f.title)}</h2><button type="button" class="x" data-a="close" aria-label="關閉">×</button></div>
        <div class="mini">${where}・設定的是相框外層，她寫的網頁不會改。</div>
        ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
        <div class="body">
        <div class="sec">誰來用</div>
        <div class="usr">${radio('', '還沒選')}${radio('her', '她')}${radio('hermes', 'Hermes')}${radio('both', '她跟 Hermes 一起')}
          <div class="mini">選「她」或「她跟 Hermes 一起」，她才會知道這幅是給她用的。</div></div>
        <div class="sec">誰可以看</div>
        <div class="usr">${box('you')}${box('her')}${box('hermes')}
          <div class="mini">沒勾她，她就不會知道牆上有這幅。不勾你自己也行：你還是打得開這裡改設定，只是看不到網頁內容。</div></div>
        <div class="sec">查看時間（台北時間，空著＝不限）</div>
        <div class="usr">
          <label>每天 <input type="time" id="frame-start" value="${esc(m.start)}"></label><label>到 <input type="time" id="frame-end" value="${esc(m.end)}"></label><br>
          <label>從 <input type="date" id="frame-d0" value="${esc(m.dateFrom)}"></label><label>到 <input type="date" id="frame-d1" value="${esc(m.dateTo)}"></label>
          <div class="mini">例如每天 18:00 到 22:00；結束比開始早＝跨過午夜（22:00 到 02:00）。日期可以只填一邊。</div></div>
        </div>
        <div class="hd" style="margin:8px 0 0"><span style="flex:1"></span>
          <button type="button" data-a="mode-cancel">取消</button><button type="button" class="go" data-a="mode-save">儲存</button></div>`;
      return;
    }
    if (mode === 'view' && f) {
      const by = f.by === 'her' ? `${esc(f.girlName || '她')}寫的、自己掛的` : `${esc(f.girlName || '她')}寫的、你掛的`;
      const m = modeOf(f), see = canView(f, 'you');
      const why = !m.viewers.includes('you') ? '「誰可以看」沒有勾你' : '現在不在查看時間內';
      c.innerHTML = `<div class="hd"><h2>🖼 ${esc(f.title)}</h2>
          <button type="button" data-a="usermode">使用者模式</button>
          ${see ? `<button type="button" data-a="full" aria-label="放大">${ov.classList.contains('full') ? '縮小' : '放大'}</button>
          <a class="btn" href="${esc(f.url)}" target="_blank" rel="noopener">新分頁</a>` : ''}
          <button type="button" class="x" data-a="close" aria-label="關閉">×</button></div>
        <div class="mini">${where}・${by}</div>
        <div class="mini">${esc(modeText(m))}</div>
        ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
        ${see ? `<div class="wood"><iframe src="${esc(f.url)}" sandbox="${SANDBOX}" referrerpolicy="no-referrer" title="${esc(f.title)}"></iframe></div>`
          : `<div class="hide">這幅現在不給你看（${why}）。<br>按上面的「使用者模式」可以改。</div>`}
        <div class="hd" style="margin:8px 0 0"><span class="mini" style="flex:1">只有你能把相框拿下來。</span>
          <button type="button" class="warn" data-a="unhang">拿下來</button></div>`;
      return;
    }
    const want = wants.find(w => w.slot === slotNow);
    const full = frames.every(Boolean);
    const who = (() => { try { return window.RoomDesk?.who?.() || null; } catch { return null; } })();
    const list = cands == null ? '<p class="mini">找找書櫃…</p>' : !cands.length ? '<p class="mini">她還沒做過網頁。</p>'
      : cands.map(x => x.files.map(n => `<div class="row"><div class="t"><b>${esc(x.title)}</b><span class="mini">${esc(n)}${x.girlName ? `・${esc(x.girlName)}` : ''}</span></div>
          <button type="button" data-a="hang" data-id="${x.runId}" data-f="${esc(n)}">掛這裡</button></div>`).join('')).join('');
    c.innerHTML = `<div class="hd"><h2>${where}（空的）</h2><button type="button" class="x" data-a="close" aria-label="關閉">×</button></div>
      ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
      <div class="body">
      ${want ? `<p class="mini">她正在寫「${esc(want.title)}」，做完會自己掛到這裡（這格被佔了就掛別的空位）。</p>` : ''}
      ${full ? '<p class="msg">牆上四個位置都掛滿了，先拿下一幅才能再掛。</p>' : ''}
      <div class="sec">請${esc(who?.name || '她')}寫一個網頁掛這裡</div>
      ${who ? `<textarea id="frame-what" maxlength="120" placeholder="想要什麼？例如：倒數我們下次約會的計時器、今天的待辦小抄、會動的魚缸…（可以是 app，也可以只是好看的頁面）"></textarea>
        <div class="hd" style="margin:6px 0 0"><span class="mini" style="flex:1">會放一件到她的書桌，她坐到書桌前就開始寫。</span><button type="button" class="go" data-a="ask">交給她</button></div>`
        : '<p class="mini">房間裡沒有人。叫她來房間，才能請她寫。</p>'}
      <div class="sec">從書櫃挑她做過的網頁</div>${list}
      </div>`;
  }
  async function onClick(e) {
    const b = e.target.closest('[data-a]');
    if (!b) return;
    const a = b.dataset.a;
    try {
      if (a === 'close') { close(); return; }
      if (a === 'full') { ov.classList.toggle('full'); b.textContent = ov.classList.contains('full') ? '縮小' : '放大'; return; }
      if (a === 'usermode') { ov.classList.remove('full'); mode = 'usermode'; msg = ''; paint(); return; }
      if (a === 'mode-cancel') { mode = 'view'; msg = ''; paint(); return; }
      if (a === 'mode-save') {
        const q = sel => card().querySelector(sel);
        const body = {
          slot: slotNow,
          operator: q('input[name="frame-op"]:checked')?.value || '',
          viewers: [...card().querySelectorAll('input[name="frame-vw"]:checked')].map(x => x.value),
          start: q('#frame-start')?.value || '', end: q('#frame-end')?.value || '',
          dateFrom: q('#frame-d0')?.value || '', dateTo: q('#frame-d1')?.value || '',
        };
        const j = await api('/api/frames/mode', body);
        if (j.frame) frames[slotNow] = j.frame;
        await pull();
        tip(`「${j.frame?.title || ''}」的使用者模式存好了。`);
        mode = 'view'; msg = ''; paint(); return;
      }
      if (a === 'unhang') {
        const f = frames[slotNow];
        if (!f || !window.confirm(`把「${f.title}」從牆上拿下來？（書櫃裡的原檔還在的話，之後可以再掛）`)) return;
        await api('/api/frames/unhang', { slot: slotNow });
        await pull();
        tip(`「${f.title}」拿下來了。`);
        mode = 'empty'; msg = ''; cands = null; paint(); loadCands(); return;
      }
      if (a === 'hang') {
        const ok = await hangFile(Number(b.dataset.id), b.dataset.f, slotNow);
        if (ok) { mode = 'view'; msg = ''; paint(); } else { msg = '掛不上去。'; paint(); }
        return;
      }
      if (a === 'ask') {
        const what = card().querySelector('#frame-what')?.value || '';
        const who = window.RoomDesk?.who?.() || {};
        const j = await api('/api/frames/ask', { slot: slotNow, what, girlId: who.id || '', girlName: who.name || '' });
        await pull();
        try { await window.RoomDesk?.pull?.(); } catch { /* */ }
        try {
          if (window.RoomActor?.isPresent?.() && window.RoomActor.activity?.()?.id !== 'desk_work') window.RoomActor.order?.('work');
        } catch { /* */ }
        tip(`交給${who.name || '她'}了：「${j.run.title}」，她會去書桌寫，寫好自己掛上來。`);
        close(); return;
      }
    } catch (err) { msg = err.message || String(err); paint(); }
  }
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && ov && !ov.hidden) close(); });

  window.RoomFrames = { slots, key, open, close, hangFile, promptLines, pull, canView, inWindow, state: () => ({ frames: frames.slice(), wants: wants.slice(), offline }) };
  void pull();
  setTimeout(loop, POLL_MS);
})();
