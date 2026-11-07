/* 牆上的相框（2026-11-04）：相框裡是一個網頁，她（魅魔）寫的；伺服器 server/room_frames.py。
   - 四個位置：左牆 0、1，後牆 2、3（一面牆兩個）。test_room.js 畫框、點框 → open(slot)。
   - 點掛著的：打開看網頁（iframe sandbox allow-scripts，可以是 app），「拿下來」只有你能按（她不會拿）。
   - 點空的：請她寫一個網頁掛這裡（放一件上她的桌，做完她自己掛），或從書櫃挑她做過的網頁掛上去。
   - 四個都掛滿了不能再掛，要先拿下一幅（伺服器也擋，409）。
   - 書桌附件裡的 .html 也可以直接「掛牆上」（room_desk.js 叫 hangFile）。
   window.RoomFrames = {slots, key, open, hangFile, promptLines, pull} */
(() => {
  'use strict';
  const POLL_MS = 8000, SLOTS = 4;
  const WALL = ['左牆', '左牆', '後牆', '後牆'];
  const SANDBOX = 'allow-scripts allow-forms allow-modals allow-popups allow-downloads';
  let frames = [null, null, null, null], wants = [], loaded = false, offline = false;
  const seen = new Set();
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
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

  /** 聊天 prompt：她知道牆上掛著什麼（她自己做的） */
  function promptLines() {
    const hung = frames.filter(Boolean);
    if (!hung.length) return [];
    const list = hung.map(f => `${WALL[f.slot]}「${f.title}」${f.by === 'her' ? '（妳寫的、妳自己掛上去的）' : f.girlName ? `（${f.girlName}寫的，他掛的）` : '（他掛的）'}`).join('、');
    return [`房間牆上的相框裡掛著妳寫的網頁：${list}。他可以點開來看、玩；只有他能把相框拿下來。`];
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
    if (mode === 'view' && f) {
      const by = f.by === 'her' ? `${esc(f.girlName || '她')}寫的、自己掛的` : `${esc(f.girlName || '她')}寫的、你掛的`;
      c.innerHTML = `<div class="hd"><h2>🖼 ${esc(f.title)}</h2>
          <button type="button" data-a="full" aria-label="放大">${ov.classList.contains('full') ? '縮小' : '放大'}</button>
          <a class="btn" href="${esc(f.url)}" target="_blank" rel="noopener">新分頁</a>
          <button type="button" class="x" data-a="close" aria-label="關閉">×</button></div>
        <div class="mini">${where}・${by}</div>
        ${msg ? `<div class="msg">${esc(msg)}</div>` : ''}
        <div class="wood"><iframe src="${esc(f.url)}" sandbox="${SANDBOX}" referrerpolicy="no-referrer" title="${esc(f.title)}"></iframe></div>
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

  window.RoomFrames = { slots, key, open, close, hangFile, promptLines, pull, state: () => ({ frames: frames.slice(), wants: wants.slice(), offline }) };
  void pull();
  setTimeout(loop, POLL_MS);
})();
