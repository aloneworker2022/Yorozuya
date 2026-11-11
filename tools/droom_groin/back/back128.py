#!/usr/bin/env python3
"""背後體位（她趴著、屁股朝鏡頭，第一人稱從後面看）描線樣品，128×128、1px 像素線。畫法照 trace128.py。"""
import math, sys, os
VAR = os.environ.get('VAR', 'a')
from PIL import Image
N, MIDX = 128, 64
LINE = (132, 100, 70, 255); SECT = (168, 120, 96, 255)
CREASE = (216, 166, 140, 255); CREASE_TOP = (229, 185, 158, 255)
LAB_EDGE = (196, 108, 118, 255); LAB_IN = (230, 168, 168, 255); LAB_SLIT = (170, 84, 98, 255)

def mirror(p): return [(2 * MIDX - x, y) for x, y in p]
def cr(pts, n=10):
    out = []; p = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1])); return out
def stroke(q):
    out = []
    for a, b in zip(q, q[1:]):
        x0, y0, x1, y1 = round(a[0]), round(a[1]), round(b[0]), round(b[1])
        dx, dy = abs(x1 - x0), -abs(y1 - y0); sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1); e = dx + dy
        while True:
            if (not out or out[-1] != (x0, y0)) and 0 <= x0 < N and 0 <= y0 < N: out.append((x0, y0))
            if x0 == x1 and y0 == y1: break
            e2 = 2 * e
            if e2 >= dy: e += dy; x0 += sx
            if e2 <= dx: e += dx; y0 += sy
    return out
def pp(pts):
    out = []
    for p in pts:
        if len(out) >= 2:
            a, b = out[-2], out[-1]
            if abs(p[0] - a[0]) == 1 and abs(p[1] - a[1]) == 1 and (b[0] == a[0] or b[1] == a[1]) and (b[0] == p[0] or b[1] == p[1]): out.pop()
        if p not in out[-3:]: out.append(p)
    return out

# ---- 左半邊（右邊鏡像）。照使用者在參考圖上的紅筆（2026-11-10）----
WAIST_L = [(41.6, 0), (43.2, 6), (43, 13), (40, 19.4), (34, 26)]            # 腰（跪著翹臀，腰凹）
# 屁股：外輪廓 → 整圈圓底（垂得比胯下低很多）→ 內側往上，兩瓣在胯下下面幾乎貼著，一路到胯下兩旁
BUTT_L = [(34, 26), (31.6, 29), (27.6, 34.6), (23.6, 42), (20.4, 52), (19, 62), (19.4, 70), (21.6, 78), (28, 88.6), (38, 95), (48, 96.6), (56, 92.4), (60.6, 85.6), (60.8, 78), (59.8, 72)]
CLEFT = [(64, 31), (64, 60)]
TOP_L = [(64, 31), (62.4, 28.8), (59, 27.2), (54.6, 26.8), (50.6, 27.6)]     # 屁股上緣微微的弧
FOLD_L = [(64, 60), (61.6, 64.6), (58.6, 68.6), (52.4, 72.6), (46, 74.2)]    # 股溝到底分開：兩道往外攤平的短弧
LOBE_L = [(59.4, 70.6), (60.4, 73.2), (62.6, 74), (64, 72.6)]                # 大陰唇的圓底（ω）
ANUS = (64, 65)
# 腿：屁股底下露出一小段大腿，膝窩一道淡摺，再下來是小腿（往鏡頭這邊來，小腿肚微微鼓）
LEG_OUT_L = [(24.6, 84.8), (25.2, 91), (26.6, 99.4), (25.2, 107), (26, 115), (28.6, 128)]
LEG_IN_L = [(54, 94), (53.6, 97), (52.8, 100), (53.8, 107), (52.8, 115), (50.4, 128)]
KNEE_L = [(30.4, 100.4), (37, 101.8), (44, 101.6), (49.4, 100.4)]
SPINE = [(64, 0), (64, 16)]
DIMPLE_L = (58, 18)


def labia_open(px, y0, y1):
    """臀部翹起時陰唇打開（OPEN=1）：跟臀部往後那張同一種開法——從肛門下面一個尖往下張開，底不連起來（切在大陰唇底緣），
    只有左右兩道小陰唇的邊；差別是這個角度看得比較正，洞口露比較多（肉穴比較大）。蝴蝶：兩邊的皮再往下垂過切口。"""
    k = os.environ.get('LAB', 'line')
    HOLE, RING = (110, 30, 50, 255), (200, 72, 96, 255)
    hw, rim = {'line': (2, 1), 'mid': (3, 1), 'butterfly': (4, 2)}[k]
    top, bot = y0 - 1, y1 + 2
    AMT = float(os.environ.get('OPEN_AMT', '1'))                      # 打開過渡幀：開口先窄、洞先小
    hw = max(1, round(hw * AMT))
    n = bot - top
    for y in range(top, bot + 1):
        w = min(hw, round(hw * ((y - top + .6) / n) ** .7))
        for u in range(0, w + 1):
            c = LAB_EDGE if (u > w - rim and u > 0) else LAB_IN
            px[MIDX - u, y] = c; px[MIDX + u, y] = c
    px[MIDX, top] = LAB_EDGE
    px[MIDX, bot - 5] = RING
    for y in range(bot - (4 if AMT >= 1 else 2 if AMT > .5 else 0), bot + 1): px[MIDX, y] = HOLE if AMT > .5 else RING                 # 肉穴：比臀部往後那張大，一路開到切口
    if hw >= 3:
        for y in range(bot - 3, bot + 1):
            for sx in (-1, 1): px[MIDX + sx, y] = HOLE if y >= bot - 2 else RING
        for y in range(bot - 2, bot + 1):
            for sx in (-1, 1): px[MIDX + 2 * sx, y] = RING if hw > 3 or y > bot - 2 else px[MIDX + 2 * sx, y]
    else:
        for y in range(bot - 2, bot + 1):
            for sx in (-1, 1): px[MIDX + sx, y] = RING
    if k == 'butterfly':
        for d in (1, 2, 3):
            for sx in (-1, 1):
                px[MIDX + sx * (hw - 1), bot + d] = LAB_EDGE
                if d < 3: px[MIDX + sx * (hw - 2), bot + d] = LAB_EDGE if d == 2 else LAB_IN


def labia_kind(px, y0, y1):
    if os.environ.get('OPEN') == '1': return labia_open(px, y0, y1)
    """陰唇三種（LAB=line 一線鮑／mid 一般／butterfly 蝴蝶），照使用者草圖：外面是兩瓣大陰唇的心形不變；
    小陰唇是直的、從縫裡往下凸出來的皮（不是往兩邊攤開）。y0..y1＝縫的上下。"""
    k = os.environ.get('LAB', 'line')
    if k == 'mid':                                   # 一般：縫下半一顆細長的小陰唇，底微微凸出大陰唇一格
        for y in range(y0 + 1, y1 + 3): px[MIDX - 1, y] = LAB_IN; px[MIDX + 1, y] = LAB_IN; px[MIDX, y] = LAB_SLIT
        px[MIDX, y1 + 3] = LAB_EDGE
    elif k == 'butterfly':                           # 蝴蝶：兩片長長的皮垂到大陰唇下面很多，底下分成兩個尖
        for y in range(y0, y1 + 4):
            w = 1 if y == y0 else 2
            for u in range(1, w + 1):
                c = LAB_EDGE if u == w else LAB_IN
                px[MIDX - u, y] = c; px[MIDX + u, y] = c
            px[MIDX, y] = LAB_SLIT
        for y in (y1 + 4, y1 + 5):
            for sx in (-1, 1): px[MIDX + sx, y] = LAB_IN; px[MIDX + 2 * sx, y] = LAB_EDGE
            px[MIDX, y] = LAB_SLIT
        for sx in (-1, 1): px[MIDX + sx, y1 + 6] = LAB_EDGE


def draw():
    im = Image.new('RGBA', (N, N), (255, 255, 255, 255)); px = im.load()
    def put(pts, col, smooth=True):
        for (x, y) in pp(stroke(cr(pts) if smooth else pts)): px[x, y] = col
    def fade(pts, cols, cuts):
        q = pp(stroke(cr(pts)))
        for i, (x, y) in enumerate(q):
            t = i / max(1, len(q)); k = sum(t >= c for c in cuts); px[x, y] = cols[k]
    for L in (LEG_OUT_L, LEG_IN_L):
        for pts in (L, mirror(L)): put(pts, LINE)
    for pts in (KNEE_L, mirror(KNEE_L)): put(pts, CREASE)
    for pts in (WAIST_L, mirror(WAIST_L), BUTT_L, mirror(BUTT_L)): put(pts, LINE)
    for pts in (TOP_L, mirror(TOP_L)): fade(pts, (SECT, CREASE, CREASE_TOP), (.25, .6))
    for pts in (FOLD_L, mirror(FOLD_L)): fade(pts, (LINE, SECT, CREASE), (.55, .8))
    put(CLEFT, LINE, False)
    for y in range(SPINE[0][1], SPINE[1][1] + 1):
        if y % 3: px[64, y] = CREASE_TOP
    for x, y in (DIMPLE_L, mirror([DIMPLE_L])[0]): px[int(x), int(y)] = SECT; px[int(x), int(y) + 1] = CREASE
    ax, ay = ANUS
    px[ax, ay] = LAB_SLIT; px[ax, ay + 1] = LAB_SLIT
    for pts in (LOBE_L, mirror(LOBE_L)): put(pts, SECT)
    for y in range(68, 73): px[MIDX, y] = LAB_SLIT
    labia_kind(px, 68, 72)
    if VAR == 'b':                                  # 縫下段露一點小陰唇
        for y in range(69, 76):
            v = (y - 69) / 6
            w = 1.6 * math.sin(math.pi * v ** .8) ** .6
            for x in range(MIDX - 2, MIDX + 3):
                u = abs(x - MIDX)
                if u > w: continue
                px[x, y] = LAB_SLIT if u == 0 and 0 < v < 1 else LAB_EDGE if u > w - 1 else LAB_IN
    return im

def fill(lines_img):
    """上色照正面那張（trace128.py fill_preview）：droom 肉色平塗、外圈 1px 白邊、深色底；輪廓線→深色，淡線照原色；屁股圓底下面的腿壓一格陰影。"""
    from PIL import ImageDraw
    BG, SKIN, SH, EDGE = (40, 34, 50), (242, 204, 177), (216, 166, 140), (184, 124, 104)
    m = Image.new('L', (N, N), 0); d = ImageDraw.Draw(m)
    body = [(WAIST_L[0][0], -2)] + cr(WAIST_L) + cr(BUTT_L)[1:]
    d.polygon(body + mirror(body)[::-1], fill=255)
    for sgn in (0, 1):
        leg = cr(LEG_OUT_L) + [(LEG_OUT_L[-1][0], N + 2), (LEG_IN_L[-1][0], N + 2)] + cr(LEG_IN_L)[::-1]
        d.polygon(mirror(leg) if sgn else leg, fill=255)
    M = m.load(); im = Image.new('RGBA', (N, N), BG + (255,)); px = im.load(); lp = lines_img.load()
    for y in range(N):
        for x in range(N):
            if M[x, y] or lp[x, y][:3] != (255, 255, 255): px[x, y] = SKIN + (255,)
    for y in range(N):
        for x in range(N):
            if px[x, y][:3] == BG and any(0 <= x + dx < N and 0 <= y + dy < N and px[x + dx, y + dy][:3] not in (BG, (255, 255, 255)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = (255, 255, 255, 255)
    for y in range(N):
        for x in range(N):
            c = lp[x, y]
            if c[:3] == (255, 255, 255): continue
            px[x, y] = EDGE + (255,) if c == LINE else SH + (255,) if c == SECT else c
    for side in (BUTT_L, mirror(BUTT_L)):                       # 屁股圓底壓在腿上的陰影
        for (x, y) in pp(stroke(cr(side))):
            if y > 80 and y + 1 < N and px[x, y + 1][:3] == SKIN: px[x, y + 1] = SH + (255,)
    return im


if __name__ == '__main__':
    out = sys.argv[1]; up = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    im = draw()
    if os.environ.get('FILL') == '1': im = fill(im)
    if os.environ.get('XRAY') == '1' and os.environ.get('FILL') == '1':
        from xray_back import xray
        im = xray(im, 66, (65, 66))
    if os.environ.get('PEN'):
        from pov_back import draw_pov
        im = draw_pov(im, float(os.environ['PEN']))
    if up > 1: im = im.resize((N * up, N * up), Image.NEAREST)
    im.save(out)
