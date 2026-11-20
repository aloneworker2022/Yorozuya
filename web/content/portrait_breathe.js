/* 立繪呼吸（2026-11-20，使用者：整張放大太假；應該是圖片中間放大、扭曲，兩邊沒有放大）。
   在 #portrait-img 上面疊一張 WebGL 畫布，每格把立繪照「中間（胸口一帶）鼓起來、往外越來越小、四周不動」扭曲畫出來：
     慢慢鼓起 2.4 秒 → 停 0.6 秒 → 慢慢回去 2.4 秒 → 停 0.6 秒。
   原本的 <img> 留著（位置、大小、進場動畫、長按都照舊），只用 filter: opacity(0) 藏起來；畫布照它的位置、透明度跟著。
   做愛步驟圖（data-sex-step）不扭；圖片跨網域讀不到像素、沒有 WebGL、使用者要求減少動態 → 不扭，照舊顯示原圖。 */
(function () {
  'use strict';
  const PERIOD = 6, UP = 2.4, HOLD = .6;   // 秒（使用者：再緩慢一點——鼓起、回去各 2.4 秒，停 0.6 秒）
  const AMT = .065;   // 中心最多放大 6.5%
  const CENTER = [.5, .56], RAD = [.42, .34];   // 鼓起的中心（圖片寬高的比例，從左上算；使用者：半身立繪上方是頭，中心往下到胸口）、範圍（使用者：範圍大一點）
  let img = null, cv = null, gl = null, prog = null, tex = null, texSrc = '', broken = false, raf = 0;

  function ease(x) { return x * x * (3 - 2 * x); }
  function amount(t) {
    const p = (t / 1000) % PERIOD;
    if (p < UP) return ease(p / UP);
    if (p < UP + HOLD) return 1;
    if (p < UP * 2 + HOLD) return 1 - ease((p - UP - HOLD) / UP);
    return 0;
  }

  function setup() {
    cv = document.createElement('canvas');
    cv.id = 'portrait-warp';
    cv.setAttribute('aria-hidden', 'true');
    img.insertAdjacentElement('afterend', cv);
    gl = cv.getContext('webgl', { premultipliedAlpha: false, alpha: true }) || null;
    if (!gl) { broken = true; return; }
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    prog = gl.createProgram();
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, 'attribute vec2 p;varying vec2 v;void main(){v=vec2(p.x*.5+.5,.5-p.y*.5);gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, [
      'precision mediump float;varying vec2 v;uniform sampler2D t;uniform vec2 c;uniform vec2 r;uniform float a;',
      'void main(){vec2 d=(v-c)/r;float g=exp(-dot(d,d)*1.4);vec2 s=c+(v-c)/(1.+a*g);',   // 中間放大（往外取樣得少）、外圍 g≈0 不動
      'if(s.x<0.||s.y<0.||s.x>1.||s.y>1.){gl_FragColor=vec4(0.);return;}gl_FragColor=texture2D(t,s);}'].join('')));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
    gl.useProgram(prog);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(prog, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    tex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.uniform2f(gl.getUniformLocation(prog, 'c'), CENTER[0], CENTER[1]);
    gl.uniform2f(gl.getUniformLocation(prog, 'r'), RAD[0], RAD[1]);
  }

  function off() {
    if (cv) cv.style.display = 'none';
    if (img) img.classList.remove('pb-on');
  }

  function frame(t) {
    raf = requestAnimationFrame(frame);
    if (broken || !img || !gl) { off(); return; }
    const cs = getComputedStyle(img);
    const show = !img.hidden && cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0
      && !img.dataset.sexStep && img.complete && img.naturalWidth > 0 && img.getAttribute('src');
    if (!show) { off(); return; }
    const src = img.currentSrc || img.src;
    if (src !== texSrc) {
      try { gl.bindTexture(gl.TEXTURE_2D, tex); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, img); texSrc = src; }
      catch (e) { console.warn('portrait_breathe', e); broken = true; off(); return; }   // 跨網域讀不到：不扭
    }
    // 圖片實際畫出來的範圍（object-fit: contain、靠下置中）
    const r = img.getBoundingClientRect(), s = Math.min(r.width / img.naturalWidth, r.height / img.naturalHeight);
    const w = img.naturalWidth * s, h = img.naturalHeight * s, x = r.left + (r.width - w) / 2, y = r.bottom - h;
    const dpr = Math.min(2, window.devicePixelRatio || 1), pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
    if (cv.width !== pw || cv.height !== ph) { cv.width = pw; cv.height = ph; }
    Object.assign(cv.style, { display: 'block', left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px', opacity: cs.opacity });
    img.classList.add('pb-on');
    gl.viewport(0, 0, pw, ph);
    gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(gl.getUniformLocation(prog, 'a'), AMT * amount(t));
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  function boot() {
    img = document.getElementById('portrait-img');
    if (!img) return;
    if (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    try { setup(); } catch (e) { console.warn('portrait_breathe', e); broken = true; }
    if (!broken) raf = requestAnimationFrame(frame);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
