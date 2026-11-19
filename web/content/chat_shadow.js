/* 聊天時放大的她（2026-11-19，使用者：按房間裡的黑影聊天時，把黑影放大、視角改成水平）。
   對話框（#portrait-sheet）打開 → 右側畫一個正面平視、全身的半透明黑影（RoomDoll.renderFront，身形跟房間裡的同一個人偶：
   身高／體型／罩杯／髮型／裙子／肚子）；有立繪的話立繪縮小、靠左下。會動：呼吸＋輕微擺動，她說話時多一點點晃。
   做愛對話（主圖是做愛步驟圖）、脫衣對話不畫，立繪照原本的位置。 */
(function () {
  'use strict';
  const K = 1.2;
  let wrap = null, canvas = null, lastKey = '', talkTimer = 0;

  function ensureEl() {
    if (wrap) return wrap;
    const talk = document.querySelector('#portrait-sheet .talk');
    if (!talk) return null;
    wrap = document.createElement('div');
    wrap.id = 'chat-shadow';
    wrap.hidden = true;
    wrap.setAttribute('aria-hidden', 'true');
    const body = document.createElement('div');
    body.className = 'cs-body';
    canvas = document.createElement('canvas');
    body.appendChild(canvas);
    wrap.appendChild(body);
    talk.insertBefore(wrap, talk.firstChild);
    return wrap;
  }

  function spec() {
    try { return typeof window.RoomLookProvider === 'function' ? window.RoomLookProvider() : null; } catch { return null; }
  }

  function paint(s) {
    const D = window.RoomDoll;
    if (!D || !D.renderFront) return false;
    const doll = D.lookToDoll(s.look || null, { outfit: s.outfit, undressStage: s.undressStage, belly: s.belly });
    const key = D.dollKey(doll);
    if (key === lastKey) return true;
    let f;
    try { f = D.renderFront(doll, 'idle', 0, K); } catch (e) { console.warn('chat_shadow', e); return false; }
    canvas.width = f.width; canvas.height = f.height;
    canvas.getContext('2d').putImageData(new ImageData(f.pixels, f.width, f.height), 0, 0);
    // 高度跟身高走：最高 185cm 的畫滿框，矮的照比例小一點（不同妹子放大後高矮看得出來）
    canvas.style.setProperty('--cs-h', String(Math.min(1, f.height / (150 * K + 5))));
    lastKey = key;
    return true;
  }

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
    const on = !!(s && paint(s));
    if (on && wrap.hidden) {
      wrap.hidden = false;
      wrap.classList.remove('cs-in');
      void wrap.offsetWidth;
      requestAnimationFrame(() => wrap.classList.add('cs-in'));
    } else if (!on && !wrap.hidden) {
      wrap.hidden = true;
      wrap.classList.remove('cs-in', 'cs-talk');
    }
    sheet?.classList.toggle('has-shadow', on);
  }

  /** 她的字一個一個出來時晃一下；停下來 0.8 秒後回到呼吸。 */
  function talking() {
    if (!wrap || wrap.hidden) return;
    wrap.classList.add('cs-talk');
    clearTimeout(talkTimer);
    talkTimer = setTimeout(() => wrap && wrap.classList.remove('cs-talk'), 800);
  }

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
    const box = document.getElementById('talk-box');
    if (box) new MutationObserver(talking).observe(box, { childList: true, subtree: true, characterData: true });
    // 換衣服、脫衣、懷孕肚子變了：開著的時候每 2 秒對一次（同一個身形不重畫）
    setInterval(() => { if (!sheet.hidden) sync(); }, 2000);
    sync();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
  window.ChatShadow = { sync };
})();
