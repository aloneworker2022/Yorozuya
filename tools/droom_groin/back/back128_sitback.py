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

# ---- 左半邊（右邊鏡像）----
# 腰（往畫面裡遠去，所以窄）→ 髖 → 屁股外輪廓（最寬在 y62 附近）→ 大腿外側往下伸出畫面
BACK_L = [(34, 34), (31.6, 37), (27.6, 42.6), (23.6, 50), (20.4, 60), (19, 70), (19.8, 78), (22.6, 85), (28, 90.4), (36, 94.2), (44, 95.2), (49.6, 93.6), (53.8, 90.6), (57.2, 86.6), (59.8, 82), (62, 77.4), (64, 73)]
# 股溝：尾椎往下到肛門上面
CLEFT = [(64, 39), (64, 73)]
# 屁股內緣：從肛門兩旁分開，繞過陰唇兩邊（大腿根），收到大腿內側
INNER_L = [(64, 72), (64, 73)]
# 大腿內側：往下伸出畫面（兩腿之間空著，陰莖從這裡上來）
THIGH_IN_L = [(52.6, 91.6), (50.6, 102), (49.4, 115), (49, 128)]
# 屁股下緣（臀摺）：趴著時被拉平，只剩靠內側一小段弧
FOLD_L = [(59.6, 81.4), (55, 84), (49, 85.6), (43, 85.6)]
# 屁股的圓：尾椎兩旁往外一道淡淡的弧（兩瓣屁股的上緣）
TOP_L = [(64, 39), (62.4, 36.8), (59, 35.2), (54.6, 34.8), (50.6, 35.6)]
GMED_L = [(53, 31.6), (45, 35.6), (36, 43.6), (29, 54)]   # 臀中肌／臀大肌交界（淡）
MONS_L = [(57.6, 93.2), (60.6, 96), (64, 96.8)]            # 胯下再過去（陰阜底、肚子那頭）
SPINE = [(64, 4), (64, 24)]
DIMPLE_L = (58, 26)
# 撞到玩家腹部時臀部被壓扁（SQUASH=1，專門用在臀部往後撞上腹部那一下）：屁股的肉被腹部往上、往兩邊擠——
#   外輪廓下半往兩邊鼓出去、圓底往上縮變扁；越靠中間動越少（胯下、肛門、陰唇位置不變，插入對得上）。腹部上緣上面擠出兩道肉的波紋。
SQUASH = float(os.environ.get('SQUASH', '0'))      # 壓扁幾倍（1＝貼著腹部時的樣子；果凍晃動用 0.6～1.5 幾張輪流）
def _sq(p):
    x, y = p; t = max(0, min(1, (y - 56) / 30)); k = min(1, abs(x - MIDX) / 22)
    return (MIDX + (x - MIDX) * (1 + .13 * SQUASH * t * k), y - 5 * SQUASH * t * t * k)
if SQUASH: BACK_L = [_sq(p) for p in BACK_L]
RIPPLE_L = [[(29, 84.6), (36, 82), (44, 79.6), (53, 78)], [(33, 77.6), (42, 74.6), (50, 73)]]
ANUS = (64, 76)
LAB_TOP, LAB_BOT, LAB_W = 80.0, 89.0, 3.2   # 陰唇（從後面看：上面是陰道口、下面是陰蒂那頭；被大腿夾著鼓出來）

def labia_open(px, y0, y1):
    """臀部往後時陰唇打開（OPEN=1）：這個角度看到的是斷面——開口從肛門下面一個尖往下張開，到底被大陰唇的底緣直接切掉，
    沒有上緣、下緣那一圈；只有左右兩道小陰唇的邊，中間粉紅，裡面一個深紅的肉穴。蝴蝶：兩邊的皮再往下垂過切口。"""
    k = os.environ.get('LAB', 'line')
    HOLE, RING = (110, 30, 50, 255), (200, 72, 96, 255)
    hw, rim = {'line': (2, 1), 'mid': (3, 1), 'butterfly': (4, 2)}[k]
    top, bot = y0 + 1, y1 + 2     # 打開的角度跟臀部翹起那張一樣（同一條斜率，n 固定 7），只是切得早：看到的只有上面 5 列
    n = 7
    for y in range(top, bot + 1):
        w = round(hw * ((y - top + .6) / n) ** .7)
        w = min(hw, w)
        for u in range(0, w + 1):
            c = LAB_EDGE if (u > w - rim and u > 0) else LAB_IN
            px[MIDX - u, y] = c; px[MIDX + u, y] = c
        for u in range(w + 1, 6):                                # 切口那一列：把大陰唇底緣在開口裡的線擦掉以外不動
            pass
    px[MIDX, top] = LAB_EDGE
    hy = bot - 2
    px[MIDX, hy] = HOLE; px[MIDX, hy + 1] = HOLE; px[MIDX, hy - 1] = RING
    if hw >= 3: px[MIDX - 1, hy + 1] = RING; px[MIDX + 1, hy + 1] = RING; px[MIDX - 1, hy + 2] = RING; px[MIDX + 1, hy + 2] = RING
    px[MIDX, bot] = HOLE if hw >= 3 else RING
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
        for i, (x, y) in enumerate(pp(stroke(cr(pts) if smooth else pts))):
            px[x, y] = col
    for pts in (BACK_L, mirror(BACK_L)): put(pts, LINE)
    for pts in (INNER_L, mirror(INNER_L)): put(pts, CREASE)
    TO = [(25.4, 88.4), (27, 98), (29.4, 110), (31.4, 128)]   # 大腿外側（從屁股底下出來）
    for pts in ():
        q = pp(stroke(cr(pts)))
        for i, (x, y) in enumerate(q): px[x, y] = LINE if i < len(q) * .4 else SECT if i < len(q) * .7 else CREASE
    for pts in (TOP_L, mirror(TOP_L)):
        q = pp(stroke(cr(pts)))
        for i, (x, y) in enumerate(q): px[x, y] = SECT if i < len(q) * .25 else CREASE if i < len(q) * .6 else CREASE_TOP
    W = [(38.4, 0), (41.4, 7), (43.4, 14.6), (43, 21), (40, 27.4), (34, 34)]
    for pts in (W, mirror(W)): put(pts, LINE)
    M = [(58.4, 87), (60.6, 90.4), (64, 91.4)]   # 胯下再過去（陰阜底）
    put(CLEFT, LINE, False)
    for y in range(SPINE[0][1], SPINE[1][1] + 1):
        if y % 3: px[64, y] = CREASE_TOP
    for x, y in (DIMPLE_L, mirror([DIMPLE_L])[0]): px[int(x), int(y)] = SECT; px[int(x), int(y) + 1] = CREASE
    # 照使用者草圖：倒 V 那塊三角就是胯下的肉——肛門一個點在三角上半；下半是兩瓣大陰唇，
    # 底是兩個圓底（中間在縫那裡凹一下）把三角封起來；中間一條縫從三角中段到底。
    # VAR=b（草圖下面那張）：縫的下段是小陰唇，一顆細長杏仁，微微超出底緣。
    ax, ay = ANUS
    px[ax, ay] = LAB_SLIT
    LOBE = [(59.6, 82), (60.6, 83.6), (62.6, 83.9), (64, 82.8)]
    for pts in (LOBE, mirror(LOBE)): put(pts, SECT)
    for y in range(79, 83): px[MIDX, y] = LAB_SLIT
    labia_kind(px, 79, 82)
    if VAR == 'b':
        for y in range(84, 93):
            v = (y - 84) / 8
            w = 1.6 * math.sin(math.pi * v ** .8) ** .6
            for x in range(MIDX - 2, MIDX + 3):
                u = abs(x - MIDX)
                if u > w: continue
                px[x, y] = LAB_SLIT if u == 0 and 0 < v < 1 else LAB_EDGE if u > w - 1 else LAB_IN
    if SQUASH:
        for k, r in enumerate(RIPPLE_L):
            r = [(x - (SQUASH - 1) * 2, y - (SQUASH - 1) * 2.5) for x, y in r]          # 波紋跟著肉一起晃
            for pts in (r, mirror(r)): put(pts, CREASE if k == 0 else CREASE_TOP)
    return im

# 兩張是連貫的動圖：膝蓋、小腿跪在床上不動 → 腿的線跟「臀部翹起」那張（back128.py）用同一組座標；
# 屁股往後坐＝整個身體往下 DY 格、蓋住那一小段大腿和膝窩，小腿直接從屁股底下出來。
LEG_OUT_L = [(24.6, 84.8), (25.2, 91), (26.6, 99.4), (25.2, 107), (26, 115), (28.6, 128)]
LEG_IN_L = [(54, 94), (53.6, 97), (52.8, 100), (53.8, 107), (52.8, 115), (50.4, 128)]
DY = 9


def draw2():
    from PIL import ImageDraw
    body = draw(); bp = body.load()
    im = Image.new('RGBA', (N, N), (255, 255, 255, 255)); px = im.load()
    for L in (LEG_OUT_L, LEG_IN_L):
        for pts in (L, mirror(L)):
            for (x, y) in pp(stroke(cr(pts))): px[x, y] = LINE
    sh = lambda pts: [(x, y + DY) for x, y in pts]
    poly = sh(cr(BACK_L)); ImageDraw.Draw(im).polygon(poly + mirror(poly)[::-1], fill=(255, 255, 255, 255))   # 屁股蓋住後面的腿
    for y in range(N - DY):
        for x in range(N):
            if bp[x, y][:3] != (255, 255, 255): px[x, y + DY] = bp[x, y]
    for pts in ([(36.4, 0), (38.4, DY)], [(91.6, 0), (89.6, DY)]):                                             # 上面補回被推下來的腰線
        for (x, y) in pp(stroke(pts)): px[x, y] = LINE
    return im


def fill2(lines_img):
    """上色跟「臀部翹起」那張同一套：droom 肉色平塗、外圈 1px 白邊、深色底；屁股圓底壓在腿上的一格陰影。"""
    from PIL import ImageDraw
    BG, SKIN, SH, EDGE = (40, 34, 50), (242, 204, 177), (216, 166, 140), (184, 124, 104)
    sh = lambda pts: [(x, y + DY) for x, y in pts]
    m = Image.new('L', (N, N), 0); d = ImageDraw.Draw(m)
    W = [(38.4, 0), (41.4, 7), (43.4, 14.6), (43, 21), (40, 27.4), (34, 34)]
    body = [(36.4, -2)] + sh(cr(W)) + sh(cr(BACK_L))[1:]
    d.polygon(body + mirror(body)[::-1], fill=255)
    tri = sh([(64, 72), (62, 77.4), (59.6, 82), (60.6, 83.6), (62.6, 83.9), (64, 82.8)])     # 胯下那塊三角（肛門、陰唇）
    d.polygon(tri + mirror(tri)[::-1], fill=255)
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
    for side in (BACK_L, mirror(BACK_L)):
        for (x, y) in pp(stroke(sh(cr(side)))):
            if y > 84 and y + 1 < N and px[x, y + 1][:3] == SKIN: px[x, y + 1] = SH + (255,)
    return im


if __name__ == '__main__':
    out = sys.argv[1]; up = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    im = draw2()
    if os.environ.get('FILL') == '1': im = fill2(im)
    if os.environ.get('XRAY') == '1' and os.environ.get('FILL') == '1':
        from xray_back import xray
        im = xray(im, 82 if os.environ.get('OPEN') != '1' else 83, (80, 81))
    if os.environ.get('PEN'):
        from pov_back import draw_pov
        im = draw_pov(im, float(os.environ['PEN']))
    if up > 1: im = im.resize((N * up, N * up), Image.NEAREST)
    im.save(out)
