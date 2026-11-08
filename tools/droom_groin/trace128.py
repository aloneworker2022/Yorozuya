#!/usr/bin/env python3
"""droom 胯下（M 字腿正面、腰部以下）描線，128×128、1px 像素線。座標直接用 128 格（原本照 structure_ref.jpg 描，之後照使用者紅筆修）。

2026-11-08 使用者修正：
  1. 大腿內側有弧度（大腿肉飽滿）→ 鼠蹊線上半段往中間鼓。
  2. 鼠蹊部下半段微微漲（陰唇的位置）→ 鼠蹊線下半段往外撐開一點，收到底部凹口。
  3. 大腿剖面＝表現大腿肉 → 大腿盡頭是一個圓鼓的橢圓：外半邊是外輪廓（往外鼓），內半邊是剖面線。
  4. 腹部肉（使用者給三張參考：漫畫素材「股のラインが一直線」、坐姿「肉擠壓感」、骨盆簡化）：
     腰中段最細 → 髂前上棘上方外腹斜肌的肉往外鼓 → 被大腿往上擠，壓出一道往內勾的摺（squeeze），鼠蹊線從摺尾開始；
     股溝線不是直線；肚臍在中線 y35。
用法：python3 trace128.py OUT.png [--up 6] [--fill]
"""
import math, argparse
from PIL import Image, ImageDraw

N = 128
MIDX = 64                      # 中線（左右鏡像）
LINE = (132, 100, 70, 255)     # 輪廓線
SECT = (168, 120, 96, 255)     # 大腿剖面線（內側，比輪廓淡一點）
CREASE_COL = (216, 166, 140, 255)   # 鼠蹊：droom 陰影色（微微深）
CREASE_TOP = (229, 185, 158, 255)   # 鼠蹊上段更淡

HIP = (36.6, 53.2)                                         # 髂前上棘（髖的凸點；腰側的肉在這上面鼓、下面被大腿擠）
THIGH_E = dict(cx=16, cy=62, rx=10.5, ry=18)          # 左大腿剖面橢圓


def ell(e, deg):
    t = math.radians(deg)
    return (e['cx'] + e['rx'] * math.cos(t), e['cy'] + e['ry'] * math.sin(t))


def arc(e, a0, a1, step=6):
    n = max(2, int(abs(a1 - a0) / step))
    return [ell(e, a0 + (a1 - a0) * i / n) for i in range(n + 1)]


WAIST_L = [(35, 22), (38.5, 30), (41, 37), (39.6, 42), (36.6, 46.5), (35.2, 50), HIP]             # 腰：中段最細 → 外腹斜肌的肉在髂前上棘上方往外鼓
SQUEEZE_L = [(35.6, 50.5), (36.6, 53.2), (38.6, 55.4), (41.6, 56.8), (44, 57.6)]                         # 肉擠壓：腹側的肉被大腿往上擠，壓出一道往內勾的摺（坐姿參考圖）
THIGH_TOP_L = [HIP, (30, 51), (24, 47.5), ell(THIGH_E, -100)]                     # 大腿上緣：髖 → 剖面頂
OUTER_L = arc(THIGH_E, -100, -238)                                                   # 剖面外半邊（外輪廓，往外鼓）
SECT_L = arc(THIGH_E, -100, 98)                                                      # 剖面內半邊（大腿肉的圓）
BUTT_L = [ell(THIGH_E, -238), (16, 84), (24, 89.5), (34, 94), (45, 97.2), (54, 98.6), (59, 97.6), (61, 96)]   # 臀部下緣 → 凹口
CREASE_L = [(44, 57.6), (47.2, 63.5), (51.5, 72), (54.5, 80), (55.6, 87), (57.6, 93), (61, 96)]   # 上半往內鼓（大腿肉）、下半往外撐（陰唇）
NOTCH = [(61, 96), (67, 96)]
# ---- 陰唇＋陰毛（使用者紅筆：陰毛從陰唇頂往上扇形散開、毛尖朝上，左邊幾根捲；陰唇細長杏仁、縫往上接進陰毛）----
LAB_TOP, LAB_BOT, LAB_W = 73.5, 95.6, 3.0          # 陰唇上下、最寬半寬（使用者紅筆：在胯下最底部、下端到凹口；最寬偏下）
LAB_EDGE = (196, 108, 118, 255)                    # droom 陰唇色
LAB_IN = (230, 168, 168, 255)                      # 裡面淡粉
LAB_SLIT = (170, 84, 98, 255)                      # 中間的縫
HAIR_ON = False                                    # 使用者：陰毛先不要（程式留著，改 True 就回來）
HAIR = [(40, 28, 26, 255), (70, 52, 46, 255)]      # 陰毛（深、亮）
# 每根毛：根（靠中間下面）→ 尖（往上往外），bend＝往外彎多少
HAIR_STRANDS = [
    ((63.5, 68), (61.5, 45.5), -1.0), ((64.5, 68), (66.5, 45), 1.0), ((63, 67), (58, 46.5), -1.5),
    ((65, 67), (70, 46), 1.5), ((62.5, 66.5), (55, 48), -2.0), ((65.5, 66.5), (73, 47.5), 2.0),
    ((62, 66), (52, 50), -2.0), ((66, 66), (76, 49.5), 2.0), ((62, 65), (49.5, 53), -1.8),
    ((66, 65), (78.5, 52.5), 1.8), ((62.5, 64), (48, 57), -1.2), ((65.5, 64), (79.5, 56.5), 1.2),
    ((63, 66), (60, 50), -0.6), ((65, 66), (68, 49), 0.6), ((64, 66.5), (64, 47), 0.3),
    ((63.2, 63), (56, 52.5), -1.0), ((64.8, 63), (72, 52), 1.0), ((63.5, 62), (51.5, 55.5), -0.8),
    ((64.5, 62), (76, 55), 0.8), ((63, 67.5), (53, 58.5), -0.6), ((65, 67.5), (75.5, 58), 0.6),
]
HAIR_CURLS = [[(50, 52), (48, 50.5), (47.6, 52.4), (49.2, 53.6), (51, 52.6)], [(53, 50), (51.4, 48.6), (50.6, 50.2), (52, 51.2)]]   # 左邊捲毛
# ---- 陰莖（第一人稱：從畫面下面往上伸，龜頭抵在穴口）----
import os
PENIS = os.environ.get('PENIS', 'shadow')           # skin＝肉色（droom 低頭看自己那種）／shadow＝影子男黑剪影／none
INSERT = float(os.environ.get('INSERT', '0'))      # 0＝龜頭抵在穴口、1＝頂到子宮頸
OPEN_Y = 89.0                                      # 陰道口（陰唇下段）
CERVIX_Y = 57.5                                    # 子宮頸（陰道頂；斜上方看，子宮趴在膀胱上、頸朝下）
PEN_TIP = 85.5 - INSERT * (85.5 - (CERVIX_Y + 2.2))   # 龜頭頂（插到底＝抵在子宮頸下）
XRAY = os.environ.get('XRAY', '1') == '1'          # 陰道子宮透視
PEN_GLANS = 9.5                                    # 龜頭長
PEN_COLORS = {
    'skin': dict(edge=(150, 96, 80, 255), base=(226, 172, 146, 255), sh=(200, 142, 118, 255), hi=(240, 194, 168, 255),
                 g_base=(214, 128, 136, 255), g_sh=(184, 98, 110, 255), g_hi=(236, 162, 168, 255), slit=(120, 50, 64, 255)),
    'shadow': dict(edge=(70, 62, 82, 255), base=(20, 18, 26, 255), sh=(12, 10, 16, 255), hi=(34, 30, 42, 255),
                   g_base=(26, 22, 32, 255), g_sh=(14, 12, 18, 255), g_hi=(44, 38, 54, 255), slit=(6, 4, 8, 255)),
}
NAVEL = (64, 35)                                                                     # 肚臍（使用者標的＋）


def mirror(pts): return [(2 * MIDX - x, y) for (x, y) in pts]


STROKES = [  # (名字, 點, 色, 平滑)
    ('squeeze_L', None, LINE, True), ('squeeze_R', None, LINE, True),
    ('waist_L', WAIST_L, LINE, True), ('waist_R', mirror(WAIST_L), LINE, True),
    ('thigh_L', THIGH_TOP_L, LINE, True), ('thigh_R', mirror(THIGH_TOP_L), LINE, True),
    ('outer_L', OUTER_L, LINE, False), ('outer_R', mirror(OUTER_L), LINE, False),
    ('sect_L', SECT_L, SECT, False), ('sect_R', mirror(SECT_L), SECT, False),
    ('butt_L', BUTT_L, LINE, True), ('butt_R', mirror(BUTT_L), LINE, True),
    ('crease_L', CREASE_L, 'crease', True), ('crease_R', mirror(CREASE_L), 'crease', True),
    ('notch', NOTCH, LINE, False),
]


def cr(pts, n=10):
    """Catmull-Rom 補點。"""
    out = []
    p = [pts[0]] + list(pts) + [pts[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(tuple(pts[-1]))
    return out


def stroke(q):
    """一筆的像素（照順序、不重複）。"""
    out = []
    for a, b in zip(q, q[1:]):
        x0, y0, x1, y1 = round(a[0]), round(a[1]), round(b[0]), round(b[1])
        dx, dy = abs(x1 - x0), -abs(y1 - y0)
        sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
        e = dx + dy
        while True:
            if (not out or out[-1] != (x0, y0)) and 0 <= x0 < N and 0 <= y0 < N: out.append((x0, y0))
            if x0 == x1 and y0 == y1: break
            e2 = 2 * e
            if e2 >= dy: e += dy; x0 += sx
            if e2 <= dx: e += dx; y0 += sy
    return out


def pixel_perfect(pts):
    """像素線清乾淨：拿掉 L 形轉角多出來的那一格。"""
    out = []
    for p in pts:
        if len(out) >= 2:
            a, b = out[-2], out[-1]
            if abs(p[0] - a[0]) == 1 and abs(p[1] - a[1]) == 1 and (b[0] == a[0] or b[1] == a[1]) and (b[0] == p[0] or b[1] == p[1]):
                out.pop()
        if p not in out[-3:]: out.append(p)
    return out


def draw():
    im = Image.new('RGBA', (N, N), (255, 255, 255, 255))
    px = im.load()
    nx, ny = NAVEL
    px[nx, ny] = SECT; px[nx, ny + 1] = LINE                                          # 肚臍：上淡下深兩格
    # 陰唇：細長杏仁（最寬偏下），外緣陰唇色、裡面淡粉、中間一條縫（往上接進陰毛）
    H = LAB_BOT - LAB_TOP
    for y in range(int(LAB_TOP), int(LAB_BOT) + 1):
        v = (y + .5 - LAB_TOP) / H
        if not 0 <= v <= 1: continue
        w = LAB_W * max(0, math.sin(math.pi * v ** 1.15)) ** .7
        for x in range(MIDX - 4, MIDX + 5):
            u = abs(x + .5 - MIDX)
            if u > w: continue
            px[x, y] = LAB_EDGE if u > w - 1 else LAB_IN
    for y in range(int(LAB_TOP) - (4 if HAIR_ON else -1), int(LAB_BOT)):   # 有陰毛時縫往上接進陰毛
        px[MIDX, y] = LAB_SLIT
    for dx in (-1, 1):                                                                 # 頂端小開叉（陰蒂包皮那一點）
        for (x, y) in pixel_perfect(stroke([(MIDX, LAB_TOP - 1.2), (MIDX + dx * 2, LAB_TOP + .9)])): px[x, y] = LAB_EDGE
    # 陰莖（畫在陰唇上面）：莖從畫面底往上微微收細；龜頭冠狀溝最寬、往上收成圓頭；左亮右暗
    if PENIS in PEN_COLORS:
        C = PEN_COLORS[PENIS]
        cor = PEN_TIP + PEN_GLANS                       # 冠狀溝那一列
        def shaft_w(y): return 4.8 + 1.4 * min(1, (y - cor) / (N - cor))
        def glans_w(y):
            t = (y - PEN_TIP) / PEN_GLANS                # 0 頂 → 1 冠狀溝
            return 5.9 * max(0, math.sin(math.pi / 2 * min(1, t * 1.25))) ** .5 if t >= 0 else 0
        inside = XRAY and INSERT > 0.05
        for y in range(int(PEN_TIP), N):
            if inside and y < OPEN_Y: continue          # 體內那段：透視層再畫
            g = y < cor
            w = glans_w(y + .5) if g else shaft_w(y + .5)
            for x in range(MIDX - 8, MIDX + 9):
                u = x + .5 - MIDX
                if abs(u) > w: continue
                edge = abs(u) > w - 1 or (g and y == int(PEN_TIP)) or (not g and y == int(cor) and abs(u) > shaft_w(y) - .2)
                t = u / max(1, w)                        # −1 左 … ＋1 右
                if g: c = C['edge'] if edge else C['g_hi'] if t < -.35 and y < cor - 3 else C['g_sh'] if t > .4 or y >= cor - 1 else C['g_base']
                else: c = C['edge'] if edge else C['hi'] if t < -.4 else C['sh'] if t > .35 else C['base']
                px[x, y] = c
        # 冠狀溝：龜頭底下比莖寬的那一圈＋下面一格陰影
        cy = int(cor)
        if not (inside and cy < OPEN_Y):
            for x in range(MIDX - int(glans_w(cor - .5)), MIDX + int(glans_w(cor - .5)) + 1): px[x, cy] = C['edge']
            for x in range(MIDX - 4, MIDX + 5):
                if px[x, cy + 1][:3] not in ((255, 255, 255),): px[x, cy + 1] = C['sh']
        # 尿道口（龜頭頂中間一小條）、繫帶（龜頭中線往下一點）
        if not inside:
            px[MIDX, int(PEN_TIP) + 1] = C['slit']; px[MIDX, int(PEN_TIP) + 2] = C['slit']
            for y in range(int(PEN_TIP) + 5, int(cor)): px[MIDX, y] = C['g_sh']       # 繫帶（龜頭中線往下）
        # 莖中線一條淡血管（左側）
        for y in range(max(cy + 4, int(OPEN_Y) if inside else 0), N - 2, 1):
            px[MIDX - 1 - (1 if (y // 6) % 2 else 0), y] = C['sh'] if PENIS == 'skin' else C['hi']
    # 陰毛：一根根從根往上往外，畫在陰唇上面
    for k, (a, b, bend) in enumerate(HAIR_STRANDS if HAIR_ON else []):
        L = .78 + .22 * ((k * 37) % 10) / 9                      # 長短不一
        b = (a[0] + (b[0] - a[0]) * L, a[1] + (b[1] - a[1]) * L)
        w = (1 if k % 2 else -1) * (.6 + (k % 3) * .3)          # 中段微彎、尖端往回勾一點（毛躁）
        p1 = (a[0] + (b[0] - a[0]) * .35 + bend * .6, a[1] + (b[1] - a[1]) * .35)
        p2 = (a[0] + (b[0] - a[0]) * .7 + bend + w, a[1] + (b[1] - a[1]) * .7)
        tip = (b[0] - w * .5, b[1])
        for i, (x, y) in enumerate(pixel_perfect(stroke(cr([a, p1, p2, tip])))):
            px[x, y] = HAIR[1] if (k % 3 == 0 and i % 4 == 2) else HAIR[0]
    for c in (HAIR_CURLS if HAIR_ON else []):
        for (x, y) in pixel_perfect(stroke(cr(c))): px[x, y] = HAIR[0]
    # 根部密一點：陰唇頂上方一小團
    for y in (range(61, 69) if HAIR_ON else []):
        for x in range(MIDX - 2, MIDX + 3):
            if abs(x - MIDX) <= 1 + (68 - y) * .25 and (x + y) % 2 == 0: px[x, y] = HAIR[0]
    for name, pts, col, smooth in STROKES:
        if name.startswith('squeeze'): pts = SQUEEZE_L if name.endswith('L') else mirror(SQUEEZE_L)
        pix = pixel_perfect(stroke(cr(pts) if smooth else pts))
        for i, (x, y) in enumerate(pix):
            px[x, y] = (CREASE_TOP if i < len(pix) * .3 else CREASE_COL) if col == 'crease' else col
    return im


def silhouette():
    left = [(WAIST_L[0][0], -2)] + WAIST_L + cr(THIGH_TOP_L)[1:] + OUTER_L[1:] + cr(BUTT_L)[1:]
    return left + mirror(left)[::-1]


def fill_preview(lines_img):
    """外輪廓圍起來填 droom 肉色、外面 1px 白邊，線畫在上面（輪廓線→深色、剖面／鼠蹊照原色）。只看肢體形狀用。"""
    m = Image.new('L', (N, N), 0); ImageDraw.Draw(m).polygon(silhouette(), fill=255); M = m.load()
    im = Image.new('RGBA', (N, N), (40, 34, 50, 255)); px = im.load(); lp = lines_img.load()
    for y in range(N):
        for x in range(N):
            if M[x, y] or lp[x, y][:3] != (255, 255, 255): px[x, y] = (242, 204, 177, 255)
    for y in range(N):
        for x in range(N):
            if px[x, y][:3] == (40, 34, 50) and any(0 <= x + dx < N and 0 <= y + dy < N and px[x + dx, y + dy][:3] not in ((40, 34, 50), (255, 255, 255)) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                px[x, y] = (255, 255, 255, 255)
    for y in range(N):
        for x in range(N):
            c = lp[x, y]
            if c[:3] == (255, 255, 255): continue
            px[x, y] = (184, 124, 104, 255) if c == LINE else (216, 166, 140, 255) if c == SECT else c
    for side in (SQUEEZE_L, mirror(SQUEEZE_L)):
        for (x, y) in pixel_perfect(stroke(cr(side)))[1:]:
            if y + 1 < N and px[x, y + 1][:3] == (242, 204, 177): px[x, y + 1] = (216, 166, 140, 255)
    return im


def xray(im):
    """陰道子宮透視（使用者紅筆＋參考圖）。視角是她前方偏上斜看，不是正上方：
    - 子宮往前倒、趴在膀胱上 → 看到頂面＝一頂寬扁的帽子（粉紅邊、淺色內面、中間子宮腔），下面一顆子宮頸小圓頭朝下；兩邊輸卵管連卵巢。
    - 陰道從穴口往她身體裡、往後上走 → 畫面上被壓短、越上越窄；沒插＝一條線＋一道道橫皺褶，插著＝兩側有皺褶的粉紅帶子包著陰莖。
    """
    px = im.load()
    body = lambda x, y: px[x, y][:3] not in ((40, 34, 50), (255, 255, 255))
    def blend(x, y, c, a):
        if not (0 <= x < N and 0 <= y < N) or not body(x, y): return
        o = px[x, y]; px[x, y] = tuple(int(o[j] * (1 - a) + c[j] * a) for j in range(3)) + (255,)
    WALL, CAV, RIM, PALE, OVA = (236, 112, 140), (196, 52, 86), (172, 52, 82), (252, 228, 232), (246, 176, 186)
    UX, UY, URX, URY = MIDX + .5, 50.5, 9.0, 4.6          # 子宮帽：中心、半寬、半高（扁）
    def in_cap(x, y, k=1.0):
        nx, ny = (x - UX) / (URX * k), (y - UY) / (URY * k)
        top = ny < 0
        return nx * nx + (ny * (1.0 if top else 1.35)) ** 2 < 1   # 下緣比較平（帽簷）
    for y in range(int(UY - URY) - 1, int(UY + URY) + 2):
        for x in range(int(UX - URX) - 1, int(UX + URX) + 2):
            fx, fy = x + .5, y + .5
            if not in_cap(fx, fy): continue
            if not in_cap(fx, fy, .7): blend(x, y, RIM if not in_cap(fx, fy, .86) else WALL, .85)    # 粉紅厚邊
            else: blend(x, y, PALE, .75)                                                             # 淺色內面
    for (x, y) in pixel_perfect(stroke(cr([(UX - 3.6, UY - .8), (UX - 1.2, UY + .4), (UX, UY + 1.6)]))): blend(x, y, CAV, .8)   # 子宮腔（Y 字）
    for (x, y) in pixel_perfect(stroke(cr([(UX + 3.6, UY - .8), (UX + 1.2, UY + .4), (UX, UY + 1.6)]))): blend(x, y, CAV, .8)
    # 輸卵管＋卵巢（左邊略低）
    for d, oy in ((-1, 54.5), (1, 53.0)):
        tube = [(UX + d * (URX - .5), UY - .3), (UX + d * (URX + 3), UY - 1.6), (UX + d * (URX + 6), UY - .2), (UX + d * (URX + 7.4), oy - 1.4)]
        for (x, y) in pixel_perfect(stroke(cr(tube))): blend(x, y, RIM, .8)
        ox = UX + d * (URX + 7.6)
        for y in range(int(oy) - 2, int(oy) + 3):
            for x in range(int(ox) - 3, int(ox) + 4):
                e = ((x + .5 - ox) / 2.6) ** 2 + ((y + .5 - oy) / 1.9) ** 2
                if e < 1: blend(x, y, RIM if e > .5 else OVA, .8 if e > .5 else .6)
    # 子宮頸：帽子底下一顆小圓頭（朝下），中間頸口
    for y in range(int(CERVIX_Y) - 2, int(CERVIX_Y) + 3):
        for x in range(MIDX - 4, MIDX + 5):
            e = ((x + .5 - UX) / 2.6) ** 2 + ((y + .5 - CERVIX_Y) / 2.2) ** 2
            if e < 1: blend(x, y, RIM if e > .5 else WALL, .9 if e > .5 else .7)
    blend(MIDX, int(CERVIX_Y) + 1, CAV, .95)
    # 陰道
    pen_in = INSERT > .05 and PENIS in PEN_COLORS
    cor = PEN_TIP + PEN_GLANS
    top_y = CERVIX_Y + 2.2
    bot_y = OPEN_Y if pen_in else LAB_TOP - 1
    def persp(y): return .78 + .22 * (y - top_y) / max(1, OPEN_Y - top_y)   # 越上越遠越窄
    def pen_w(y):
        if y < PEN_TIP: return 0
        if y < cor:
            t = (y - PEN_TIP) / PEN_GLANS
            return 5.9 * max(0, math.sin(math.pi / 2 * min(1, t * 1.25))) ** .5
        return 4.8 + 1.4 * min(1, (y - cor) / (N - cor))
    for y in range(int(top_y), int(bot_y) + 1):
        if pen_in:
            lum = max(.8, pen_w(y + .5) * persp(y) + .3)
            band = 2.4 + (1 if (y % 3 == 0) else 0)              # 兩側皺褶帶：每三列鼓出一格（參考圖那種一節一節）
            for x in range(MIDX - 11, MIDX + 12):
                u = abs(x + .5 - UX)
                if lum < u <= lum + band:
                    out = u > lum + band - 1
                    blend(x, y, RIM if out or y % 3 == 0 else WALL, .85 if out else .6)
        else:
            blend(MIDX, y, RIM, .8)                              # 一條線
            if y % 3 == 0:                                        # 一道道橫皺褶（越上越短）
                w = 1 + (1 if persp(y) > .9 else 0)
                for x in range(MIDX - w, MIDX + w + 1): blend(x, y, RIM, .7)
    # 體內那段陰莖（黑剪影隔著肚皮透出來；越上越遠一點點窄）
    if pen_in:
        C = PEN_COLORS[PENIS]
        for y in range(int(PEN_TIP), int(OPEN_Y)):
            w = pen_w(y + .5) * persp(y)
            for x in range(MIDX - 7, MIDX + 8):
                u = x + .5 - UX
                if abs(u) > w: continue
                edge = abs(u) > w - 1 or y == int(PEN_TIP)
                blend(x, y, C['edge'] if edge else (C['hi'] if u < -w * .4 else C['base']), .8)
        cy = int(cor)
        if cy < OPEN_Y:
            for x in range(MIDX - 5, MIDX + 6): blend(x, cy, C['edge'], .8)
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--up', type=int, default=1); ap.add_argument('--fill', action='store_true')
    a = ap.parse_args()
    im = draw()
    if a.fill:
        im = fill_preview(im)
        if XRAY: im = xray(im)
    if a.up > 1: im = im.resize((N * a.up, N * a.up), Image.NEAREST)
    im.save(a.out)
