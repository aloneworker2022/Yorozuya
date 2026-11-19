/* 聊天時放大的她（2026-11-19，使用者：按房間裡的黑影聊天時，把黑影放大、視角改成水平）。
   對話框（#portrait-sheet）打開 → 右側畫一個正面平視、全身的半透明黑影（RoomDoll.renderFront，跟房間同一個人偶：
   身高／體型／罩杯／髮型／裙子／肚子）。
   動作是 3D 人偶逐格算出來的（不是把圖縮放）：平常 breathe（吸氣吐氣：胸廓撐開、肩膀和頭抬起、胸部跟著上去、頭微歪），
   她的字在跑時 talk（短氣、頭點、空著的手抬起來比劃）。一組 16 格，第一格先畫出來，其餘分批算、不卡畫面。
   有立繪的話立繪縮小、靠左下。做愛對話（主圖是做愛步驟圖）、脫衣對話、房間場面不畫，立繪照原本的位置。 */
(function () {
  'use strict';
  const K = 1.5;
  let wrap = null, canvas = null, ctx = null;
  let cur = null;          // { key, box, sets: { breathe: ImageData[], talk: ImageData[] }, job }
  let talkUntil = 0, raf = 0, clock = 0, lastT = 0, mode = 'breathe';

  function ensureEl() {
    if (wrap) return wrap;
    const talk = document.querySelector('#portrait-sheet .talk');
    if (!talk) return null;
    wrap = document.createElement('div');
    wrap.id = 'chat-shadow';
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
    canvas = document.createElement('canvas');
    ctx = canvas.getContext('2d');
    wrap.appendChild(canvas);
    talk.insertBefore(wrap, talk.firstChild);
    return wrap;
  }

  function spec() {
    try { return typeof window.RoomLookProvider === 'function' ? window.RoomLookProvider() : null; } catch { return null; }
  }

  /** 換人／換身形 → 重算兩組動畫。第一格同步畫（馬上看得到），其餘每次算一格、讓出主執行緒。 */
  function prepare(s) {
    const D = window.RoomDoll;
    if (!D || !D.renderFront) return false;
    const doll = D.lookToDoll(s.look || null, { outfit: s.outfit, undressStage: s.undressStage, belly: s.belly });
    const key = D.dollKey(doll);
    if (cur && cur.key === key) return true;
    let first;
    try { first = D.renderFront(doll, 'breathe', 0, K); } catch (e) { console.warn('chat_shadow', e); return false; }
    const box = first.box;
    const job = {};
    cur = { key, box, sets: { breathe: [toImage(first)], talk: [] }, job };
    canvas.width = first.width; canvas.height = first.height;
    // 高度跟身高走：185cm 畫滿框，矮的照比例小一點（不同妹子放大後高矮看得出來）
    canvas.style.setProperty('--cs-h', String(Math.min(1, first.height / (Math.ceil(143 * K) + 5))));
    ctx.putImageData(cur.sets.breathe[0], 0, 0);
    const todo = [];
    for (let f = 1; f < D.POSES.breathe.frames; f++) todo.push(['breathe', f]);
    for (let f = 0; f < D.POSES.talk.frames; f++) todo.push(['talk', f]);
    const step = () => {
      if (job.dead || !todo.length) return;
      const [pose, f] = todo.shift();
      try { cur.sets[pose][f] = toImage(D.renderFront(doll, pose, f, K, box)); } catch (e) { console.warn('chat_shadow', e); return; }
      setTimeout(step, 0);
    };
    setTimeout(step, 0);
    return true;
  }
  function toImage(r) { return new ImageData(r.pixels, r.width, r.height); }

  function ready(set) { return set.length && set.every(Boolean) && set.length === window.RoomDoll.POSES[set === cur.sets.talk ? 'talk' : 'breathe'].frames; }

  function tick(t) {
    raf = 0;
    if (!wrap || wrap.hidden || !cur) return;
    const dt = Math.min(.25, lastT ? (t - lastT) / 1000 : 0); lastT = t;
    const D = window.RoomDoll, talking = t < talkUntil && ready(cur.sets.talk);
    const want = talking ? 'talk' : 'breathe';
    if (want !== mode) { mode = want; clock = 0; }
    const set = cur.sets[mode], fps = D.POSES[mode].fps, n = D.POSES[mode].frames;
    clock += dt * fps;
    let i = Math.floor(clock) % n;
    if (!set[i]) { i = 0; clock = 0; }   // 還沒算好的格：先停在第一格
    if (set[i] && canvas.dataset.f !== mode + i) { ctx.putImageData(set[i], 0, 0); canvas.dataset.f = mode + i; }
    raf = requestAnimationFrame(tick);
  }
  function play() { if (!raf) { lastT = 0; raf = requestAnimationFrame(tick); } }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; }

  function wanted(sheet) {
    if (!sheet || sheet.hidden) return null;
    if (sheet.classList.contains('undress-chat')) return null;
    const img = document.getElementById('portrait-img');
    if (img && img.dataset.sexStep) return null;   // 做愛對話：主圖是步驟圖
    if (document.getElementById('room-scene-overlay')?.hidden === false) return null;
    const s = spec();
    return s && s.look !== undefined ? s : null;
  }

  function sync() {
    const sheet = document.getElementById('portrait-sheet');
    if (!ensureEl()) return;
    const s = wanted(sheet);
    const on = !!(s && prepare(s));
    if (on && wrap.hidden) {
      wrap.hidden = false;
      wrap.classList.remove('cs-in');
      void wrap.offsetWidth;
      requestAnimationFrame(() => wrap.classList.add('cs-in'));
    } else if (!on && !wrap.hidden) {
      wrap.hidden = true;
      wrap.classList.remove('cs-in');
    }
    if (on) play(); else stop();
    sheet?.classList.toggle('has-shadow', on);
  }

  /** 她的字一個一個出來 → 說話動作；停下來 0.9 秒後回到呼吸。 */
  function talking() { talkUntil = performance.now() + 900; }

  function boot() {
    const sheet = document.getElementById('portrait-sheet');
    if (!sheet) return;
    ensureEl();
    const mo = new MutationObserver(sync);
    mo.observe(sheet, { attributes: true, attributeFilter: ['hidden', 'class'] });
    const img = document.getElementById('portrait-img');
    if (img) mo.observe(img, { attributes: true, attributeFilter: ['data-sex-step'] });
    const scene = document.getElementById('room-scene-overlay');
    if (scene) mo.observe(scene, { attributes: true, attributeFilter: ['hidden'] });
    const meta = document.getElementById('portrait-meta');   // 她說的話
    if (meta) new MutationObserver(talking).observe(meta, { childList: true, subtree: true, characterData: true });
    // 換衣服、脫衣、懷孕肚子變了：開著的時候每 2 秒對一次（同一個身形不重算）
    setInterval(() => { if (!sheet.hidden) sync(); }, 2000);
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.ChatShadow = { sync };
})();
