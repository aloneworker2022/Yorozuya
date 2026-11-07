// 2026-11-03 拆部位：前端（index.html／play.html）與 Node（render_parts.cjs 驗證）共用。
// 每個部位一張「原始資料 sheet」（RGBA PNG，A 只有 0／255）：
//   R,G＝深度 tt（16 位元：q＝round((tt+128)×256)，越大越靠近鏡頭）
//   B ＝標記碼（bit 0～6）＋手腳旗標（bit 7）。標記碼：身體＝乳房標記 0 一般／1 乳房／2 乳暈／3 乳頭（乳暈已烤進來）；
//       120 頭髮、121 線條（MARK）、122 摺線（CREASE）、123 淡線（FAINT，背部中線）
// 前端把同一格的各部位疊起來（每格取最近的），再照 room_doll_full.js render() 同一套規則上色，
// 產出跟原本身體 sheet 一樣的調色盤像素（之後頭髮、衣服、臉部圖層、tint 都不用改）。
(function (root, f) { const api = f(); if (typeof module === 'object' && module.exports) module.exports = api; else root.PartsShade = api; })(this, function () {
  const BODY_RGB = [51, 45, 64], HAIR_RGB = [31, 24, 42], LINE_RGB = [30, 24, 40], MARK_RGB = [33, 27, 45];
  const BUST_RGB = [134, 112, 152], BUST_DEPTH = 1.0, AREOLA_RGB = [150, 100, 128], NIP_RGB = [205, 150, 175];
  const BODY_A = 204, HAIR_A = 220, EDGE_RGB = [240, 240, 240], EDGE_DEPTH = 2.5, CREASE_RGB = [90, 60, 60], FAINT_RGB = [110, 75, 75];
  const C_HAIR = 120, C_MARK = 121, C_CREASE = 122, C_FAINT = 123, MARK_TOL = .02;

  /** render(..., {gbuf:true}) 的結果 → RGBA（Node 出圖用） */
  function encode(g) {
    const n = g.hit.length, px = new Uint8ClampedArray(n * 4);
    for (let i = 0; i < n; i++) {
      if (!g.hit[i]) continue;
      const q = Math.max(0, Math.min(65535, Math.round((g.tt[i] + 128) * 256)));
      const code = g.mat[i] === 2 ? C_HAIR : g.mat[i] === 3 ? (g.bust[i] === 98 ? C_FAINT : g.bust[i] === 99 ? C_CREASE : C_MARK) : g.bust[i] & 127;
      px[i * 4] = q >> 8; px[i * 4 + 1] = q & 255; px[i * 4 + 2] = code | (g.limb[i] ? 128 : 0); px[i * 4 + 3] = 255;
    }
    return px;
  }
  /** 多張 RGBA（同尺寸；null 跳過）→ 每格取最近 → {hit, tt, code, limb} */
  function merge(list, n) {
    const hit = new Uint8Array(n), tt = new Float32Array(n).fill(-1e9), code = new Uint8Array(n), limb = new Uint8Array(n);
    for (const d of list) {
      if (!d) continue;
      for (let i = 0, j = 0; i < n; i++, j += 4) {
        if (d[j + 3] < 128) continue;
        const t = ((d[j] << 8) | d[j + 1]) / 256 - 128, c = d[j + 2] & 127;
        // 線條／摺線是貼在皮膚上的細管，邊緣會稍微埋進皮膚；整張渲染時「在表面 0.05 以內就算線條」→ 這裡給線條 MARK_TOL 的優先
        if (hit[i] && t + (c >= C_MARK ? MARK_TOL : 0) <= tt[i] + (code[i] >= C_MARK ? MARK_TOL : 0)) continue;
        hit[i] = 1; tt[i] = t; code[i] = c; limb[i] = d[j + 2] >> 7;
      }
    }
    return { hit, tt, code, limb };
  }
  function bustEdge(bust, hit, tt, i, x, y, w, h) {
    if (!bust[i]) return false;
    for (const [nx, ny, up] of [[x, y - 1, 1], [x, y + 1, 0], [x - 1, y, 0], [x + 1, y, 0]]) {
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) return true;
      const j = ny * w + nx;
      if (!hit[j]) return true;
      if (!up && !bust[j] && tt[j] < tt[i] - BUST_DEPTH) return true;
    }
    return false;
  }
  /** 疊好的原始資料 → 調色盤 RGBA（與 render() 上色段相同規則；頭髮不做頂端亮色） */
  function shade(G, width, height, out) {
    const n = width * height, { hit, tt, code, limb } = G;
    const mat = new Uint8Array(n), bust = new Uint8Array(n);
    for (let i = 0; i < n; i++) if (hit[i]) { const c = code[i]; mat[i] = c === C_HAIR ? 2 : c >= C_MARK ? 3 : 1; bust[i] = c === C_FAINT ? 98 : c === C_CREASE ? 99 : c < 100 ? c : 0; }
    const m = new Uint8Array(n);
    const at = (a, x, y) => (x < 0 || y < 0 || x >= width || y >= height) ? 0 : a[y * width + x];
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x, n4 = at(hit, x, y - 1) + at(hit, x, y + 1) + at(hit, x - 1, y) + at(hit, x + 1, y);
      if (hit[i] && n4 > 0) m[i] = 1; else if (!hit[i] && n4 >= 3) m[i] = 1;
    }
    const px = out || new Uint8ClampedArray(n * 4);
    const set = (i, rgb, a) => { px[i * 4] = rgb[0]; px[i * 4 + 1] = rgb[1]; px[i * 4 + 2] = rgb[2]; px[i * 4 + 3] = a; };
    for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (!m[i]) { px[i * 4 + 3] = 0; continue; }
      if (mat[i] === 2) { set(i, HAIR_RGB, HAIR_A); continue; }
      if (mat[i] === 3) { set(i, bust[i] === 98 ? FAINT_RGB : bust[i] === 99 ? CREASE_RGB : MARK_RGB, BODY_A); continue; }
      const di = hit[i] ? tt[i] : -1e9;
      let near = false;
      for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (m[j] && hit[j] && tt[j] > di + 4.5) { near = true; break; }
      }
      let edge = false;
      if (limb[i] && hit[i]) for (const [nx, ny] of [[x, y - 1], [x, y + 1], [x - 1, y], [x + 1, y]]) {
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const j = ny * width + nx;
        if (m[j] && hit[j] && mat[j] === 1 && tt[j] < di - EDGE_DEPTH) { edge = true; break; }
      }
      set(i, bust[i] === 3 ? NIP_RGB : bust[i] === 2 ? AREOLA_RGB : near ? LINE_RGB : edge ? EDGE_RGB : bustEdge(bust, hit, tt, i, x, y, width, height) ? BUST_RGB : BODY_RGB, BODY_A);
    }
    return px;
  }
  return { encode, merge, shade };
});
