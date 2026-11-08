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
SPREAD = INSERT > 0.05                             # 插著：陰唇被撐開
ENT_Y = 80.0 if SPREAD else OPEN_Y                 # 陰莖進到體內的那一列（撐開那一圈裡，看得到的莖到這裡為止）
CERVIX_Y = 57.5                                    # 子宮頸（陰道頂；斜上方看，子宮趴在膀胱上、頸朝下）
PEN_TIP = 85.5 - INSERT * (85.5 - (CERVIX_Y + 2.2))   # 龜頭頂（插到底＝抵在子宮頸下）
RUB = int(os.environ.get('RUB', '0'))             # 在外面磨蹭三格：1 沒碰到（陰唇腫脹微張）／2 往前碰到（大陰唇含著龜頭）／3 往下磨蹭撥弄
OPEN_OVER = False
OPEN_AMT = float(os.environ.get('OPEN_AMT', '1'))   # 打開程度 0＝第 1 格（腫脹微張）… 1＝全開（中間過渡幀用）
if RUB in (5, 6):                                  # 互動用：PTIP 指定陰莖高度（龜頭頂那一列）
    PEN_TIP = float(os.environ.get('PTIP', '101'))  # 5＝還沒打開（碰到就照 2 的畫法、沒碰到照 1）；6＝打開後（外翻陰唇，陰莖直接疊在上面）
    if RUB == 6: OPEN_OVER = True; RUB = 4
    else: RUB = 2 if PEN_TIP < 85.0 else 1        # 拉到下面不用「陰唇被往下帶」那種（像黏著龜頭）：照第 1 格、陰莖疊在前面
    INSERT = 0.0
elif RUB == 8:                                     # 插入（陰唇打開後）：PTIP＝龜頭頂；龜頭過了肉穴口就算插進去
    PEN_TIP = float(os.environ.get('PTIP', '85'))
    OPEN_OVER = True; RUB = 4
elif RUB: INSERT = 0.0; PEN_TIP = {1: 101.0, 2: 79.5, 3: 86.0, 4: 101.0}[RUB]   # 4：摩擦以後（陰莖退回下面）
INS_MODE = os.environ.get('RUB') == '8'
HOLE_Y = 87.4                                      # 打開後肉穴中心（rub_open 全開）
if INS_MODE:
    INSERT = 1.0 if PEN_TIP < HOLE_Y - 3.0 else 0.0  # 龜頭頂過了肉穴上緣＝插進去
    SPREAD = False                                 # 不用舊的「插著陰唇撐開」，陰唇照打開那張
    ENT_Y = HOLE_Y                                 # 看得到的莖到肉穴為止，往上是體內（透視）
XRAY = os.environ.get('XRAY', '1' if INS_MODE else ('0' if RUB else '1')) == '1'   # 陰道子宮透視（磨蹭先不做；插入要）
PEN_GLANS = 9.5                                    # 龜頭長
PEN_COLORS = {
    'skin': dict(edge=(150, 96, 80, 255), base=(226, 172, 146, 255), sh=(200, 142, 118, 255), hi=(240, 194, 168, 255),
                 g_base=(214, 128, 136, 255), g_sh=(184, 98, 110, 255), g_hi=(236, 162, 168, 255), slit=(120, 50, 64, 255)),
    # 影子男：實心黑（使用者：不要做透明的）——只有外框一圈，裡面一個顏色
    'shadow': dict(edge=(70, 62, 82, 255), base=(20, 18, 26, 255), sh=(20, 18, 26, 255), hi=(20, 18, 26, 255),
                   g_base=(20, 18, 26, 255), g_sh=(20, 18, 26, 255), g_hi=(20, 18, 26, 255), slit=(20, 18, 26, 255)),
}
SKIN_PX = (242, 204, 177, 255)
SKIN_HI = (250, 222, 202, 255)
SKIN_SH = (217, 168, 143, 255)
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
    for y in (range(int(LAB_TOP), int(LAB_BOT) + 1) if not (SPREAD or RUB) else []):
        v = (y + .5 - LAB_TOP) / H
        if not 0 <= v <= 1: continue
        w = LAB_W * max(0, math.sin(math.pi * v ** 1.15)) ** .7
        for x in range(MIDX - 4, MIDX + 5):
            u = abs(x + .5 - MIDX)
            if u > w: continue
            px[x, y] = LAB_EDGE if u > w - 1 else LAB_IN
    for y in (range(int(LAB_TOP) - (4 if HAIR_ON else -1), int(LAB_BOT)) if not (SPREAD or RUB) else []):   # 有陰毛時縫往上接進陰毛
        px[MIDX, y] = LAB_SLIT
    for dx in ((-1, 1) if not (SPREAD or RUB) else ()):                                          # 頂端小開叉（陰蒂包皮那一點）
        for (x, y) in pixel_perfect(stroke([(MIDX, LAB_TOP - 1.2), (MIDX + dx * 2, LAB_TOP + .9)])): px[x, y] = LAB_EDGE
    if RUB == 1: rub_labia(px)
    if RUB == 4 and OPEN_OVER: rub_open(px)               # 打開後：陰莖直接疊在外翻的陰唇上
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
            if inside and y < ENT_Y: continue           # 體內那段：透視層再畫
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
        if not (inside and cy < ENT_Y) and PENIS != 'shadow':
            for x in range(MIDX - int(glans_w(cor - .5)), MIDX + int(glans_w(cor - .5)) + 1): px[x, cy] = C['edge']
            for x in range(MIDX - 4, MIDX + 5):
                if px[x, cy + 1][:3] not in ((255, 255, 255),): px[x, cy + 1] = C['sh']
        # 尿道口（龜頭頂中間一小條）、繫帶（龜頭中線往下一點）
        if not inside:
            px[MIDX, int(PEN_TIP) + 1] = C['slit']; px[MIDX, int(PEN_TIP) + 2] = C['slit']
            for y in range(int(PEN_TIP) + 5, int(cor)): px[MIDX, y] = C['g_sh']       # 繫帶（龜頭中線往下）
        # 莖中線一條淡血管（左側）
        for y in range(max(cy + 4, int(ENT_Y) if inside else 0), N - 2, 1):
            px[MIDX - 1 - (1 if (y // 6) % 2 else 0), y] = C['sh'] if PENIS == 'skin' else C['hi']
    # 插著：陰唇被撐開——小陰唇撐成一圈包住陰莖兩側，大陰唇的肉被往兩邊推、往大腿那邊鼓；陰蒂在那一圈最上面
    if SPREAD:
        sp = min(1.0, INSERT / 0.15)                     # 剛頂進去時慢慢撐開
        PW = 5.0                                         # 莖半寬（撐開那一圈的寬）
        for y in range(int(LAB_TOP) - 1, int(LAB_BOT) + 3):
            v = (y + .5 - LAB_TOP) / (LAB_BOT - LAB_TOP + 1.5)
            if not 0 <= v <= 1: continue
            o = PW * sp * min(1, 1.35 * max(0, math.sin(math.pi * v)) ** .45)    # 開口（上下收尖）
            mi = 2.0                                                             # 小陰唇那圈
            ma = (4.2 + 2.4 * sp) * max(0, math.sin(math.pi * min(1, v * 1.05))) ** .65  # 大陰唇被推開的肉（往大腿那邊鼓）
            for x in range(MIDX - 13, MIDX + 14):
                u = abs(x + .5 - MIDX)
                if u <= o: continue                       # 開口裡：陰莖（或體內）
                if u <= o + mi: px[x, y] = LAB_EDGE if (u > o + mi - .9 or u < o + .7) else LAB_IN
                elif u <= o + mi + ma:
                    t = (u - o - mi) / max(.5, ma)
                    if t > .86: px[x, y] = LINE                                           # 外緣（肉被推到大腿的那道摺）
                    elif t > .6 or v > .85: px[x, y] = SKIN_SH                            # 往外轉的那面陰影
                    elif t < .35 and .12 < v < .72: px[x, y] = SKIN_HI                    # 鼓起來的亮面
                    else: px[x, y] = SKIN_PX
        # 陰蒂包皮＋陰蒂：那一圈最上面
        ty = LAB_TOP - .5
        for dx in (-1, 1):
            for (x, y) in pixel_perfect(stroke([(MIDX, ty - 1.4), (MIDX + dx * 2.4, ty + 1.2)])): px[x, y] = LAB_EDGE
        px[MIDX, int(ty) + 1] = (250, 176, 184, 255)
    if PENIS in PEN_COLORS: PEN_SET.update(PEN_COLORS[PENIS].values())
    if RUB in (2, 3): rub_press(px)                       # 龜頭揉進一團軟肉（大陰唇＋小陰唇包著龜頭）
    if RUB == 4 and not OPEN_OVER: rub_open(px)           # 摩擦以後：陰唇外翻、肉穴打開變大
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
        PEN_PX = set(PEN_COLORS[PENIS].values()) if PENIS in PEN_COLORS else set()
        for i, (x, y) in enumerate(pix):
            if px[x, y] in PEN_PX: continue                       # 陰莖在前面：身體的線不畫到陰莖上
            px[x, y] = (CREASE_TOP if i < len(pix) * .3 else CREASE_COL) if col == 'crease' else col
    return im


PEN_SET = set()
SW = dict(edge=(204, 96, 112, 255), lip=(238, 160, 166, 255), hi=(250, 198, 202, 255),
          red=(208, 52, 72, 255), hole=(122, 14, 30, 255), clit=(252, 182, 190, 255),
          inrim=(214, 112, 124, 255), soft=(244, 178, 182, 255))   # 腫脹（充血）的陰唇色


CLIT_HI, CLIT, CLIT_SH = (250, 160, 174, 255), (224, 92, 118, 255), (180, 60, 86, 255)
URETHRA = (140, 34, 56, 255)


CLIT_ER = (236, 70, 104, 255)                         # 勃起：更紅


def draw_clit(px, y, erect=0.0):
    """陰蒂：包皮∧底下一顆小肉粒（兩格高，上亮下深，兩側一點陰影）。
    erect（0～1，陰唇打開後）：微微勃起——變大一圈、更突出、更紅（往上多長一格，中間那列兩側也變肉粒）。"""
    y = int(y)
    def put(x, yy, c):
        if px[x, yy] not in PEN_SET: px[x, yy] = c
    if erect < .35:
        put(MIDX, y, CLIT_HI); put(MIDX, y + 1, CLIT)
        for dx in (-1, 1): put(MIDX + dx, y + 1, CLIT_SH)
        return
    # 勃起：一顆有深色外框的圓肉粒（淡粉亮面），從周圍的紅裡跳出來；越勃起越大
    OUT, HI, BODY = (150, 40, 62, 255), (252, 214, 220, 255), (240, 150, 170, 255)
    big = erect >= .7
    if big:
        put(MIDX, y - 1, OUT)
        put(MIDX - 1, y, OUT); put(MIDX, y, HI); put(MIDX + 1, y, OUT)
        put(MIDX - 1, y + 1, OUT); put(MIDX, y + 1, BODY); put(MIDX + 1, y + 1, OUT)
        put(MIDX, y + 2, OUT)
    else:
        put(MIDX, y, HI); put(MIDX, y + 1, BODY)
        put(MIDX - 1, y + 1, OUT); put(MIDX + 1, y + 1, OUT); put(MIDX, y + 2, OUT)


def draw_urethra(px, y, big=False):
    """尿道口：陰蒂和陰道口中間一個小深點（打開時是一條小縫）。"""
    y = int(y)
    if px[MIDX, y] in PEN_SET: return
    px[MIDX, y] = URETHRA
    if big and px[MIDX, y + 1] not in PEN_SET: px[MIDX, y + 1] = URETHRA


def rub_labia(px, over=False):
    """磨蹭三格的陰唇（使用者紅筆）：外陰唇（大陰唇）＝兩邊「( )」鼓起來的肉；小陰唇在中間。
    1 沒碰到：大陰唇腫起來（( ) 鼓），小陰唇腫、微微張開露一點紅、下段穴口。
    2 往前碰到：龜頭頂進兩片唇中間（沒插進去）。唇從上到下是同一對、連續的：上面一條縫，往下貼著龜頭圓頭、順著龜頭兩側往下夾著龜頭（只貼著邊，龜頭保持原大小；唇夠厚）；大陰唇 ( ) 更寬。
    3 往下磨蹭：同樣夾著，龜頭往下滑、陰唇被往下拖，龜頭上方那段縫拉長。
    只要微微腫脹：鼓一點、外緣線＋外側陰影，不打亮。"""
    SKIN_LN = (200, 146, 124, 255)                      # 外陰唇「( )」那道線
    tip, cor = PEN_TIP, PEN_TIP + PEN_GLANS
    def gw(y):
        if RUB == 1 or y < tip: return 0
        if y < cor: return 5.9 * max(0, math.sin(math.pi / 2 * min(1, (y - tip) / PEN_GLANS * 1.25))) ** .5
        return 4.8
    # ---- 大陰唇：( ) ----
    mtop, mbot, MW = {1: (70.0, 96.5, 9.0), 2: (68.5, 96.8, 11.6), 3: (69.2, 97.8, 11.6)}[RUB]   # 大陰唇：碰到／磨蹭時被撐開一些
    def maj(y):
        v = (y - mtop) / (mbot - mtop)
        return MW * max(0, math.sin(math.pi * min(1, max(0, v)) ** .9)) ** .55 if 0 <= v <= 1 else 0
    # ---- 小陰唇 ----
    if RUB == 1:
        itop, ibot = LAB_TOP - .5, LAB_BOT
        def inner(y):                                   # (開口, 外緣)
            v = (y - itop) / (ibot - itop)
            if not 0 <= v <= 1: return None
            w = 3.9 * max(0, math.sin(math.pi * v ** 1.1)) ** .62
            return (.6 * max(0, math.sin(math.pi * v)) ** .8, w)
    else:
        # 碰到／磨蹭：陰唇保持彎的杏仁形（不是沿著龜頭的直條），撐大到包得住龜頭；
        # 內側開口：龜頭頂上方是一條縫，到龜頭頂附近才順著彎開、蓋過龜頭圓頭；往下兩片唇蓋住龜頭兩側一點點
        drag = 1.0 if RUB == 3 else 0.0
        itop, ibot = LAB_TOP - .5 + drag * .5, LAB_BOT + drag
        OPMAX, LIPW = 5.4, 3.4
        def inner(y):
            v = (y - itop) / (ibot - itop)
            if not 0 <= v <= 1: return None
            alm = max(0, math.sin(math.pi * min(1, v * 1.1))) ** .55
            slit = .6 * max(0, math.sin(math.pi * v)) ** .8
            ease = min(1, max(0, (y - (tip - 4.5)) / 6)) ** .7            # 龜頭頂上方幾列開始順著彎開
            op = max(slit, OPMAX * alm * ease)
            if y >= tip: op = max(op, gw(y) - .8)                          # 打開：唇在龜頭兩側分開，龜頭下面不合起來
            outer = (OPMAX + LIPW) * max(0, math.sin(math.pi * min(1, v * 1.05))) ** .5
            return (op, max(outer, op + 2.2))
    for y in range(int(min(mtop, itop)) - 1, int(max(mbot, ibot)) + 2):
        fy = y + .5
        M_ = maj(fy); I_ = inner(fy)
        for x in range(MIDX - 13, MIDX + 14):
            u = abs(x + .5 - MIDX)
            if I_ and u <= I_[1]:
                op, iw = I_
                if RUB != 1 and not over: continue                                # 2／3 第一遍：小陰唇等陰莖畫完再畫（才蓋得過龜頭）
                if u <= op:
                    if RUB != 1 and fy >= tip: continue                               # 微微打開的縫裡：龜頭
                    if op < 1: px[x, y] = SW['red']                                   # 縫：一條紅
                    else: px[x, y] = SW['red'] if u < max(.7, op * .3) else (SW['edge'] if u > op - .8 else SW['lip'])   # 撥開的內面：粉紅、正中一條紅
                else:
                    t = (u - op) / max(.5, iw - op)                       # 0 內緣 … 1 外緣
                    if u > iw - 1: c = SW['edge']
                    elif RUB != 1 and u < op + .9: c = SW['inrim']        # 內緣（往裡捲進去）
                    elif RUB != 1 and .25 < t < .65 and fy < ibot - 2: c = SW['soft']   # 鼓起來的軟肉（淡粉、不打白）
                    else: c = SW['lip']
                    px[x, y] = c
            elif M_ and u <= M_ and not over:
                if px[x, y] in PEN_SET: continue
                inner_w = I_[1] if I_ else 0
                t = (u - inner_w) / max(.5, M_ - inner_w)
                if u > M_ - 1: px[x, y] = SKIN_LN                         # ( ) 的線
                else: px[x, y] = SKIN_PX                                  # 一般肉色，不畫陰影漸層
    if over: return
    if RUB == 1:                                          # 穴口
        hy = int(itop + (ibot - itop) * .74); px[MIDX, hy] = SW['hole']; px[MIDX, hy + 1] = SW['hole']
    # 陰蒂包皮∧＋陰蒂（圈／縫的最上面）
    ty = itop
    for dx in (-1, 1):
        for (x, y) in pixel_perfect(stroke([(MIDX, ty - 1.4), (MIDX + dx * 2.4, ty + 1.0)])): px[x, y] = SW['edge']
    draw_clit(px, ty + .6)
    if RUB == 1: draw_urethra(px, itop + (ibot - itop) * .46)


def rub_open(px):
    """4 摩擦以後：大陰唇腫成兩團軟肉（波浪外緣），小陰唇像花瓣一樣往兩邊翻開、露出裡面的粉紅，
    中間前庭打開，下段肉穴張開變大（紅圈、裡面深）。不打白。"""
    SKIN_LN = (186, 122, 108, 255)
    MJ, MJ_SH = (240, 188, 170, 255), (224, 162, 146, 255)
    VEST, HOLE_RIM = (230, 120, 136, 255), (196, 48, 72, 255)
    A = max(0.0, min(1.0, OPEN_AMT))
    L = lambda a, b: a + (b - a) * A                             # 第 1 格 → 全開
    top, bot = L(LAB_TOP - .5, LAB_TOP - 2.0), L(LAB_BOT, LAB_BOT + .8)
    H = bot - top
    hx, hy, hrx, hry = MIDX + .5, top + H * L(.74, .64), L(.7, 3.1), L(1.1, 4.4)   # 肉穴（打開變大）
    for y in range(int(top) - 4, int(bot) + 2):
        fy = y + .5
        v = (fy - top) / H
        if not 0 <= v <= 1: continue
        V = L(.6 * max(0, math.sin(math.pi * v)) ** .8, 4.0 * max(0, math.sin(math.pi * v)) ** .55)   # 前庭（打開的那塊）
        P = max(V + 1.0, L(3.9 * max(0, math.sin(math.pi * v ** 1.1)) ** .62, V + 2.0 + .5 * math.sin(fy * 1.3)))   # 小陰唇（慢慢翻開）
        mv = (fy - 70.0) / (96.5 - 70.0)
        M = 9.0 * max(0, math.sin(math.pi * min(1, max(0, mv)) ** .9)) ** .55 if 0 <= mv <= 1 else 0   # 大陰唇：跟第 1 格同一條圓弧
        for x in range(MIDX - 13, MIDX + 14):
            u = abs(x + .5 - MIDX)
            e = ((x + .5 - hx) / hrx) ** 2 + ((fy - hy) / hry) ** 2
            if e < 1:                                               # 肉穴：外圈紅、裡面深
                px[x, y] = SW['hole'] if e < .35 else (SW['red'] if e < .7 else HOLE_RIM); continue
            if u <= V: px[x, y] = VEST if u < V - .8 else SW['red']; continue
            if u <= P:                                              # 翻開的小陰唇：外緣深、中間一道摺
                t = (u - V) / max(.5, P - V)
                px[x, y] = SW['edge'] if (u > P - .9) else (SW['inrim'] if (.4 < t < .6 and P - V > 2.2) else SW['lip']); continue
            if u <= M:                                              # 大陰唇軟肉
                t = (u - P) / max(.5, M - P)
                px[x, y] = SKIN_LN if u > M - 1 else SKIN_PX                    # 外緣線（腫起）；裡面那條弧線不要
    # 陰蒂包皮＋陰蒂（上面）
    for dx in (-1, 1):
        for (x, y) in pixel_perfect(stroke([(MIDX, top - 1.6 - A), (MIDX + dx * 2.6, top + 1.0 - A)])): px[x, y] = SW['edge']   # 包皮往上退
    draw_clit(px, top + .4 + .8 * A, erect=A)                  # 打開後陰蒂微微勃起（往下一點、在打開的那塊裡）
    draw_urethra(px, top + H * L(.46, .4), big=A > .5)         # 尿道口：前庭裡、陰道口上面


def rub_press(px):
    """碰到／磨蹭（使用者草圖：像一根棒子在揉一團肉）。只改龜頭和陰唇接觸的那一塊：
    - 小陰唇：龜頭頂上方的內裡被往上擠成尖尖的火焰形（紅、粉紅邊），兩側順著龜頭圓頭往下包、貼著龜頭邊。
    - 大陰唇：一團軟肉，外緣波浪圓弧，上面鼓得很寬，往下繞到龜頭兩側，到冠狀溝往內收口、蓋過龜頭邊（含著）。
    3 磨蹭：龜頭更低，火焰拉長、大陰唇跟著往下拖。"""
    tip = PEN_TIP; cor = tip + PEN_GLANS
    def gw(y):
        if y < tip: return 0
        if y < cor: return 5.9 * max(0, math.sin(math.pi / 2 * min(1, (y - tip) / PEN_GLANS * 1.25))) ** .5
        return 4.8
    SKIN_LN = (186, 122, 108, 255)                         # 大陰唇外緣（深一點才看得出那團肉）
    MJ, MJ_SH, MJ_HI = (240, 188, 170, 255), (224, 162, 146, 255), (246, 204, 186, 255)   # 微微充血的肉色
    apex = LAB_TOP + .5                                    # 火焰尖（跟第 1 格的縫頂同高：陰唇不往上移）
    top, end = 70.0, 96.5                                  # 大陰唇：跟第 1 格一樣大、一樣位置（只是打開）
    def flame(y):                                          # 火焰半寬：尖 → 龜頭頂那麼寬
        if y < apex or y > tip + 2: return -1
        t = (y - apex) / max(1, tip + 1.5 - apex)
        return 4.4 * min(1, t) ** 1.25
    def inner(y):                                          # 大陰唇內緣（小陰唇外緣）
        f = flame(y); g = gw(y)
        return max(f + 1.4, g + 1.0) if (f >= 0 or g > 0) else 0
    def outer(y):                                          # 大陰唇外緣：跟第 1 格同一條圓弧
        if y < top or y > end: return -1
        v = (y - top) / (end - top)
        return max(gw(y) - .6, 9.0 * max(0, math.sin(math.pi * min(1, max(0, v)) ** .9)) ** .55)
    for y in range(int(top) - 1, int(end) + 2):
        fy = y + .5
        f, g, io, oo = flame(fy), gw(fy), inner(fy), outer(fy)
        for x in range(MIDX - 15, MIDX + 16):
            u = abs(x + .5 - MIDX)
            pen = px[x, y] in PEN_SET
            # 火焰（被擠上來的內裡）：只在龜頭上方
            if f >= 0 and u <= f and not pen:
                px[x, y] = SW['red'] if u < f - 1 else SW['lip']; continue
            # 小陰唇：火焰兩邊＋順著龜頭圓頭往下，貼著龜頭邊（蓋過龜頭邊 .7 格）
            if (f >= 0 and f < u <= f + 1.4 and not pen) or (g > 0 and fy < cor + .5 and g - .7 < u <= g + 1.0):
                px[x, y] = SW['edge'] if (u > max(f + 1.4, g + 1.0) - .9) else SW['lip']; continue
            # 大陰唇：一團軟肉
            if oo > 0 and io < u <= oo:
                if pen and not (fy > end - 4 and u > g - 2.2): continue        # 只有收口那段蓋過龜頭邊（含著）
                t = (u - io) / max(.5, oo - io)
                if u > oo - 1: c = SKIN_LN                                     # 外緣（圓弧）
                else: c = SKIN_PX                                              # 一般肉色；裡面那條弧線不要（使用者）
                px[x, y] = c
    # 陰蒂包皮＋陰蒂（火焰尖上面）
    ty = LAB_TOP - .5
    for dx in (-1, 1):
        for (x, y) in pixel_perfect(stroke([(MIDX, ty - 1.4), (MIDX + dx * 2.4, ty + 1.0)])): px[x, y] = SW['edge']
    draw_clit(px, ty + .6)
    uy = apex + 4.5                                        # 尿道口：被擠開的那塊裡（龜頭還沒蓋到才看得到）
    if uy < tip - 1 and flame(uy + .5) > 1.2: draw_urethra(px, uy)


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
    bot_y = ENT_Y if pen_in else (HOLE_Y - 3.5 if INS_MODE else LAB_TOP - 1)   # 插入模式沒插時：陰道一條線接到肉穴上緣
    def persp(y): return .78 + .22 * (y - top_y) / max(1, OPEN_Y - top_y)   # 越上越遠越窄
    def pen_w(y):
        if y < PEN_TIP: return 0
        if y < cor:
            t = (y - PEN_TIP) / PEN_GLANS
            return 5.9 * max(0, math.sin(math.pi / 2 * min(1, t * 1.25))) ** .5
        return 4.8 + 1.4 * min(1, (y - cor) / (N - cor))
    # 陰道＝圓筒：側面（筒壁往後轉）暗、中間亮；一圈圈皺褶環（從前下方看＝往下彎的弧）
    def lum_w(y): return max(.8, pen_w(y + .5) * persp(y) + .3) if pen_in and y >= PEN_TIP - .5 else 1.9 * persp(y)
    WALL_T = 2.0
    LINE_ONLY = INS_MODE and not pen_in                           # 插入模式還沒插：照使用者紅線，一條線＋橫皺褶（不畫粗管子，陰唇看得到）
    for y in (range(int(top_y), int(bot_y) + 1) if LINE_ONLY else []):
        blend(MIDX, y, RIM, .85)
        if y % 3 == 0:
            for x in range(MIDX - 1, MIDX + 2): blend(x, y, RIM, .7)
    for y in (range(int(top_y), int(bot_y) + 1) if not LINE_ONLY else []):
        lum = lum_w(y); R = lum + WALL_T
        for x in range(MIDX - 12, MIDX + 13):
            u = abs(x + .5 - UX)
            if u > R: continue
            if u > R - 1: blend(x, y, RIM, .85)                  # 筒的外緣
            elif u > lum: blend(x, y, WALL, .6)                  # 筒壁側面
            else: blend(x, y, (236, 150, 170) if u < lum * .45 else WALL, .38)   # 筒內：中間亮、往兩側暗
    RINGS = [] if LINE_ONLY else [y for y in range(int(top_y) + 2, int(bot_y) - 1, 3)]
    def ring(yr, a):
        R = lum_w(yr) + WALL_T - .6
        for x in range(MIDX - 12, MIDX + 13):
            u = (x + .5 - UX) / max(1, R)
            if abs(u) > 1: continue
            blend(x, int(round(yr + 2.2 * (1 - u * u))), RIM, a)
    # 體內那段陰莖（黑剪影隔著肚皮透出來；越上越遠一點點窄）
    if pen_in:
        C = PEN_COLORS[PENIS]
        for y in range(int(PEN_TIP), int(ENT_Y)):
            w = pen_w(y + .5) * persp(y)
            for x in range(MIDX - 7, MIDX + 8):
                u = x + .5 - UX
                if abs(u) > w: continue
                edge = abs(u) > w - 1 or y == int(PEN_TIP)
                blend(x, y, C['edge'] if edge else (C['hi'] if u < -w * .4 else C['base']), .8)
        cy = int(cor)
        if cy < ENT_Y:
            for x in range(MIDX - 5, MIDX + 6): blend(x, cy, C['edge'], .8)
    for yr in RINGS: ring(yr, .4 if pen_in else .75)            # 環的前半圈在陰莖前面，淡淡蓋過去
    if INS_MODE and pen_in:                                      # 肉穴口被撐開，一圈紅緊緊包著陰莖
        for y in range(int(HOLE_Y) - 2, int(HOLE_Y) + 2):
            w = pen_w(y + .5)
            for x in range(MIDX - 9, MIDX + 10):
                u = abs(x + .5 - UX)
                if w - .3 < u <= w + 1.3: blend(x, y, (196, 48, 72), .9)
    return im


def xray_section(im):
    """插入用的透視＝剖面（使用者：不是圓管＋環）。微微斜角。
    - 子宮：漏斗形——上面寬（子宮底，上緣一道橢圓弧＝斜著看），往下收窄，底下一段子宮頸（小圓頭伸進陰道頂、頸口）；剖面看得到裡面的子宮腔（倒三角＋頸管）。輸卵管＋卵巢。
    - 陰道：剖面＝左右兩道陰道壁（內緣一節一節的皺褶），沒插時兩壁貼著＝一條縫；插著時兩壁被陰莖撐開、陰莖在中間；
      靠陰道口那段被撐開、往外張，接到打開的陰唇（肉穴口一圈紅包著莖）。"""
    px = im.load()
    body = lambda x, y: px[x, y][:3] not in ((40, 34, 50), (255, 255, 255))
    def blend(x, y, c, a):
        x, y = int(x), int(y)
        if not (0 <= x < N and 0 <= y < N) or not body(x, y): return
        o = px[x, y]; px[x, y] = tuple(int(o[j] * (1 - a) + c[j] * a) for j in range(3)) + (255,)
    WALL, CAV, RIM, OVA = (236, 112, 140), (196, 52, 86), (172, 52, 82), (246, 176, 186)
    CX = MIDX + .5
    # ---- 子宮（漏斗）----
    F_TOP, F_BOT, F_W, NECK_W = 47.0, 56.0, 8.2, 2.4          # 子宮底、漏斗底、上寬、頸寬
    CERV_BOT = 60.0                                          # 子宮頸伸到陰道頂
    def uw(y):
        if y < F_TOP: return 0
        if y <= F_BOT:
            t = (y - F_TOP) / (F_BOT - F_TOP)
            return NECK_W + (F_W - NECK_W) * (1 - t) ** 1.25     # 漏斗：往下收窄（側邊微微鼓）
        if y <= CERV_BOT: return NECK_W * (1 - .25 * ((y - F_BOT) / (CERV_BOT - F_BOT)) ** 2)   # 子宮頸
        return 0
    for y in range(int(F_TOP) - 3, int(CERV_BOT) + 1):
        fy = y + .5
        w = uw(fy)
        # 上緣：一道橢圓弧（子宮底，斜著看）
        for x in range(MIDX - 10, MIDX + 11):
            u = x + .5 - CX
            e = (u / F_W) ** 2 + ((fy - F_TOP) / 2.4) ** 2
            if fy < F_TOP and e < 1: blend(x, y, RIM if e > .55 else WALL, .85 if e > .55 else .55)
            if w and abs(u) <= w:
                wall = abs(u) > w - 1.6
                blend(x, y, RIM if abs(u) > w - .8 else (WALL if wall else CAV), .85 if wall else .5)
    for (x, y) in pixel_perfect(stroke([(MIDX, F_TOP + 1.5), (MIDX, CERV_BOT)])): blend(x, y, CAV, .9)   # 頸管
    for d in (-1, 1):                                          # 子宮腔：倒三角的兩邊
        for (x, y) in pixel_perfect(stroke([(CX + d * (F_W - 3), F_TOP + 1), (CX + d * .4, F_BOT - .5)])): blend(x, y, CAV, .8)
    for d, oy in ((-1, 50.0), (1, 49.0)):                     # 輸卵管＋卵巢
        tube = [(CX + d * (F_W - .5), F_TOP - .2), (CX + d * (F_W + 3), F_TOP - 1.6), (CX + d * (F_W + 6), F_TOP - .2), (CX + d * (F_W + 7.2), oy - 1.2)]
        for (x, y) in pixel_perfect(stroke(cr(tube))): blend(x, y, RIM, .8)
        ox = CX + d * (F_W + 7.4)
        for y in range(int(oy) - 2, int(oy) + 3):
            for x in range(int(ox) - 3, int(ox) + 4):
                e = ((x + .5 - ox) / 2.4) ** 2 + ((y + .5 - oy) / 1.7) ** 2
                if e < 1: blend(x, y, RIM if e > .5 else OVA, .8 if e > .5 else .6)
    # ---- 陰道（剖面）----
    pen_in = INSERT > .05 and PENIS in PEN_COLORS
    cor = PEN_TIP + PEN_GLANS
    top_y, bot_y = CERV_BOT - 1.0, HOLE_Y - 1.5
    def persp(y): return .82 + .18 * (y - top_y) / max(1, bot_y - top_y)   # 越上越遠一點點窄（斜角）
    def pen_w(y):
        if not pen_in or y < PEN_TIP: return 0
        if y < cor:
            t = (y - PEN_TIP) / PEN_GLANS
            return 5.9 * max(0, math.sin(math.pi / 2 * min(1, t * 1.25))) ** .5
        return 4.8 + 1.4 * min(1, (y - cor) / (N - cor))
    WT = 1.8                                                   # 陰道壁厚
    for y in range(int(top_y), int(bot_y) + 1):
        fy = y + .5
        g = pen_w(fy) * persp(fy)
        flare = max(0, (fy - (bot_y - 5)) / 5) * 1.6 if pen_in else 0     # 靠陰道口那段被撐開、往外張
        gap = (g + .2 + flare) if g > 0 else .5                  # 兩壁之間：插著＝陰莖寬；沒插＝貼著一條縫
        rug = .7 if (y % 3 == 0) else 0                          # 皺褶：內緣一節一節往裡凸
        for x in range(MIDX - 12, MIDX + 13):
            u = abs(x + .5 - CX)
            if gap - rug < u <= gap + WT:
                blend(x, y, RIM if (u > gap + WT - .9 or u <= gap - rug + .8) else WALL, .85)
            elif u <= gap and g == 0:
                blend(x, y, CAV, .7)                              # 沒插：中間那條縫
    # 體內那段陰莖（剖面裡，在兩壁中間；不再蓋環）
    if pen_in:
        C = PEN_COLORS[PENIS]
        for y in range(int(PEN_TIP), int(ENT_Y)):
            w = pen_w(y + .5) * persp(y + .5)
            for x in range(MIDX - 7, MIDX + 8):
                u = x + .5 - CX
                if abs(u) > w: continue
                edge = abs(u) > w - 1 or y == int(PEN_TIP)
                blend(x, y, C['edge'] if edge else C['base'], .85)
        for y in range(int(HOLE_Y) - 2, int(HOLE_Y) + 2):      # 肉穴口一圈紅包著莖
            w = pen_w(y + .5)
            for x in range(MIDX - 9, MIDX + 10):
                u = abs(x + .5 - CX)
                if w - .3 < u <= w + 1.3: blend(x, y, (196, 48, 72), .9)
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--up', type=int, default=1); ap.add_argument('--fill', action='store_true')
    a = ap.parse_args()
    im = draw()
    if a.fill:
        im = fill_preview(im)
        if XRAY: im = xray_section(im) if INS_MODE else xray(im)
    if a.up > 1: im = im.resize((N * a.up, N * a.up), Image.NEAREST)
    im.save(a.out)
