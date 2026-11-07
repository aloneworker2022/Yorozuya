// 2026-11-05 droom 真 3D 畫法（使用者選 B：VR 低頭不再是整張往上推）。WebGL1、不靠外部函式庫。
// 世界座標跟 play.html 一樣：x,y＝地圖格（M 字串，'0' 空地），z 往上（牆高 1、地板 0）。
// 畫法對齊舊的 Doom 式畫面：地板棋盤、天花板、磚牆（wallCol 同一套）、距離變暗 min(1, .45＋2.5/距離)。
// 地板／天花板不寫深度（她的頭超過天花板也照畫，跟舊畫面一樣只被牆擋）。
// 她：
//   bill  ＝直立的板子（永遠面向玩家），貼現在的 8 方向 sheet（一格）。
//   cyl   ＝面對面近景：render_close.cjs 的 'look' 圖（每一列＝低頭到那個角度的視線）貼回「以玩家眼睛為中心、繞左右軸彎的弧面」，
//           轉頭到哪個角度看到的都對（Cardboard 只追轉頭不追位置，剛好成立）。
(function () {
  const VS_W = `attribute vec3 aP;attribute vec2 aK;uniform vec3 uE,uR,uU,uF;uniform vec4 uS;varying vec3 vP;varying vec2 vK;
void main(){vec3 r=aP-uE;float x=dot(r,uR),y=dot(r,uU),z=dot(r,uF);vP=aP;vK=aK;gl_Position=vec4(x*uS.x,y*uS.y,(z*(uS.w+uS.z)-2.0*uS.w*uS.z)/(uS.w-uS.z),z);}`;
  // aK.x：0 地板、1 天花板、2 牆（米色）、3 牆（粉色）；aK.y：牆的方向（0＝面朝 x、1＝面朝 y，後者暗 0.7）
  const FS_W = `precision highp float;uniform vec3 uE;varying vec3 vP;varying vec2 vK;
void main(){float d=length(vP.xy-uE.xy);vec3 c;
 if(vK.x<0.5){float k=mod(floor(vP.x)+floor(vP.y),2.0);c=k>0.5?vec3(200.,190.,175.):vec3(175.,165.,150.);c*=min(1.0,.45+2.5/max(d,.01));}
 else if(vK.x<1.5){c=vec3(150.,145.,160.)*min(1.0,.45+2.5/max(d,.01));}
 else{float u=fract(vK.y>0.5?vP.x:vP.y),v=clamp(1.0-vP.z,0.0,.9999),row=floor(v*8.0),odd=mod(row,2.0);
  float brick=odd>0.5?floor(u*4.0+.5):floor(u*4.0);bool mort=fract(v*8.0)<.08||fract(u*4.0+(odd>0.5?.5:0.0))<.05;
  c=vK.x>2.5?vec3(190.,150.,170.):vec3(215.,195.,165.);if(mort)c=vec3(140.,130.,120.);else c*=1.0-mod(brick*37.0,11.0)/40.0;
  if(vK.y>0.5)c*=.7;c*=min(1.0,.45+2.5/max(d,.01));}
 gl_FragColor=vec4(c/255.0,1.0);}`;
  const VS_S = `attribute vec3 aP;attribute vec2 aT;uniform vec3 uE,uR,uU,uF;uniform vec4 uS;varying vec2 vT;
void main(){vec3 r=aP-uE;float x=dot(r,uR),y=dot(r,uU),z=dot(r,uF);vT=aT;gl_Position=vec4(x*uS.x,y*uS.y,(z*(uS.w+uS.z)-2.0*uS.w*uS.z)/(uS.w-uS.z),z);}`;
  const FS_S = `precision mediump float;uniform sampler2D uT;varying vec2 vT;void main(){vec4 c=texture2D(uT,vT);if(c.a<.02)discard;gl_FragColor=c;}`;

  let gl = null, pW, pS, bW, nW, bS, texOf = new WeakMap();
  function prog(vs, fs) {
    const mk = (t, s) => { const h = gl.createShader(t); gl.shaderSource(h, s); gl.compileShader(h); if (!gl.getShaderParameter(h, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(h)); return h; };
    const p = gl.createProgram(); gl.attachShader(p, mk(gl.VERTEX_SHADER, vs)); gl.attachShader(p, mk(gl.FRAGMENT_SHADER, fs)); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const u = n => gl.getUniformLocation(p, n);
    return { p, aP: gl.getAttribLocation(p, 'aP'), aK: gl.getAttribLocation(p, 'aK'), aT: gl.getAttribLocation(p, 'aT'), uE: u('uE'), uR: u('uR'), uU: u('uU'), uF: u('uF'), uS: u('uS'), uT: u('uT') };
  }
  // 房間網格：地板、天花板各一大片；每個牆格朝空地的每一面一片
  function buildWorld(M) {
    const W = M[0].length, H = M.length, isW = (x, y) => { const r = M[y]; return !r || r[x] === undefined || r[x] !== '0'; }, v = [];
    const quad = (a, b, c, d, k, s) => { for (const p of [a, b, c, a, c, d]) v.push(p[0], p[1], p[2], k, s); };
    quad([0, 0, 0], [W, 0, 0], [W, H, 0], [0, H, 0], 0, 0);
    quad([0, 0, 1], [W, 0, 1], [W, H, 1], [0, H, 1], 1, 0);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      if (!isW(x, y)) continue; const k = M[y][x] === '2' ? 3 : 2;
      if (x + 1 < W && !isW(x + 1, y)) quad([x + 1, y, 0], [x + 1, y + 1, 0], [x + 1, y + 1, 1], [x + 1, y, 1], k, 0);
      if (x > 0 && !isW(x - 1, y)) quad([x, y, 0], [x, y + 1, 0], [x, y + 1, 1], [x, y, 1], k, 0);
      if (y + 1 < H && !isW(x, y + 1)) quad([x, y + 1, 0], [x + 1, y + 1, 0], [x + 1, y + 1, 1], [x, y + 1, 1], k, 1);
      if (y > 0 && !isW(x, y - 1)) quad([x, y, 0], [x + 1, y, 0], [x + 1, y, 1], [x, y, 1], k, 1);
    }
    bW = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, bW); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.STATIC_DRAW); nW = v.length / 5;
  }
  function tex(c) {
    let t = texOf.get(c); if (t) return t;
    t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, c);
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    texOf.set(c, t); return t;
  }
  // 攝影機：yaw＝P.a（往前＝(cos,sin)），pitch＝真的仰角（弳，往下為負）。tanH＝水平半寬（play.html 的 plane .66）
  function camera(c) {
    const ca = Math.cos(c.yaw), sa = Math.sin(c.yaw), cp = Math.cos(c.pitch), sp = Math.sin(c.pitch);
    const R = [-sa, ca, 0], F = [ca * cp, sa * cp, sp], U = [-ca * sp, -sa * sp, cp];
    const sx = 1 / c.tanH, sy = sx * c.aspect;
    return { E: [c.x, c.y, c.z], R, U, F, S: [sx, sy, .01, 60] };
  }
  function setCam(p, k) { gl.uniform3fv(p.uE, k.E); gl.uniform3fv(p.uR, k.R); gl.uniform3fv(p.uU, k.U); gl.uniform3fv(p.uF, k.F); gl.uniform4fv(p.uS, k.S); }
  function drawSprite(k, verts, c) {
    gl.useProgram(pS.p); setCam(pS, k);
    gl.bindBuffer(gl.ARRAY_BUFFER, bS); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(pS.aP); gl.vertexAttribPointer(pS.aP, 3, gl.FLOAT, false, 20, 0);
    gl.enableVertexAttribArray(pS.aT); gl.vertexAttribPointer(pS.aT, 2, gl.FLOAT, false, 20, 12);
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex(c)); gl.uniform1i(pS.uT, 0);
    gl.drawArrays(gl.TRIANGLES, 0, verts.length / 5);
  }
  const D3 = {
    ok: false,
    init(canvas, M) {
      try {
        gl = canvas.getContext('webgl', { antialias: false, preserveDrawingBuffer: true, alpha: false });
        if (!gl) return false;
        pW = prog(VS_W, FS_W); pS = prog(VS_S, FS_S); buildWorld(M); bS = gl.createBuffer(); D3.ok = true;
      } catch (e) { console.warn('droom 3D 開不起來，用舊畫法', e); D3.ok = false; }
      return D3.ok;
    },
    // view：{x,y,z,yaw,pitch,tanH,aspect, vp:[x,y,w,h]}；girls：[{kind:'bill',c,x,y,w,z0,z1,u0,u1,v0,v1} | {kind:'cyl',c,ex,ey,ez,dir,R,fpx,cx,cy,k}]
    draw(view, girls, clear = true) {
      const k = camera(view), [vx, vy, vw, vh] = view.vp;
      gl.viewport(vx, vy, vw, vh); gl.enable(gl.SCISSOR_TEST); gl.scissor(vx, vy, vw, vh);
      if (clear) { gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT); }
      gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND);
      gl.useProgram(pW.p); setCam(pW, k);
      gl.bindBuffer(gl.ARRAY_BUFFER, bW);
      gl.enableVertexAttribArray(pW.aP); gl.vertexAttribPointer(pW.aP, 3, gl.FLOAT, false, 20, 0);
      gl.enableVertexAttribArray(pW.aK); gl.vertexAttribPointer(pW.aK, 2, gl.FLOAT, false, 20, 12);
      gl.depthMask(false); gl.drawArrays(gl.TRIANGLES, 0, 12);          // 地板＋天花板：不寫深度
      gl.depthMask(true); gl.drawArrays(gl.TRIANGLES, 12, nW - 12);      // 牆
      gl.disableVertexAttribArray(pW.aK);
      gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
      for (const g of girls) {
        if (g.kind === 'bill') {   // 板子面向玩家（只繞 z 轉）
          const dx = g.x - view.x, dy = g.y - view.y, L = Math.hypot(dx, dy) || 1, rx = -dy / L, ry = dx / L, h = g.w / 2;
          const a = [g.x - rx * h, g.y - ry * h], b = [g.x + rx * h, g.y + ry * h], v = [];
          for (const [p, z, u, t] of [[a, g.z0, g.u0, g.v1], [b, g.z0, g.u1, g.v1], [b, g.z1, g.u1, g.v0], [a, g.z0, g.u0, g.v1], [b, g.z1, g.u1, g.v0], [a, g.z1, g.u0, g.v0]]) v.push(p[0], p[1], z, u, t);
          drawSprite(k, v, g.c);
        } else if (g.kind === 'cyl') {   // 'look' 圖：第 r 列＝俯角 (r−cy)/fpx（×k），第 s 欄＝右邊 (s−cx)/fpx（×k）倍的距離；貼在半徑 R 的弧面
          const W = g.c.width, H = g.c.height, fx = Math.cos(g.dir), fy = Math.sin(g.dir), rx = -fy, ry = fx, N = 96, v = [];
          const P = (row, col) => { const ph = (row - g.cy) / g.fpx * g.k, cq = Math.cos(ph), sq = Math.sin(ph), s = (col - g.cx) / g.fpx * g.k * g.R;
            return [g.ex + g.R * cq * fx + s * rx, g.ey + g.R * cq * fy + s * ry, g.ez - g.R * sq, col / W, row / H]; };
          for (let i = 0; i < N; i++) {
            const r0 = H * i / N, r1 = H * (i + 1) / N, A = P(r0, 0), B = P(r0, W), C = P(r1, W), D = P(r1, 0);
            for (const q of [A, B, C, A, C, D]) v.push(...q);
          }
          drawSprite(k, v, g.c);
        }
      }
      gl.disable(gl.BLEND); gl.disable(gl.SCISSOR_TEST);
    },
  };
  window.Droom3D = D3;
})();
