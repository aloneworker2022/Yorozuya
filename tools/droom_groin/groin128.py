#!/usr/bin/env python3
"""128×128 腰部以下（照使用者參考圖的結構）：腰→肚臍→胯，兩腿往左右張到畫面邊，V 字鼠蹊線，陰毛，陰唇肉穴，下面兩瓣屁股。
上色照 droom：肉色三階（MEMO-2026-11-08 定稿：242,204,177／216,166,140／184,124,104）、外圈 1px 白邊、平塗不抖色。
用法：python3 groin128.py OUT.png [--hair triangle|strip|none] [--open] [--up 6]
"""
import math, sys, argparse
from PIL import Image

SKIN, SH, DK = (242, 204, 177), (216, 166, 140), (184, 124, 104)
HI = (253, 230, 214)            # 只用在陰唇肉瓣、肚子亮一點的地方
CREASE = (226, 178, 152)        # droom 鼠蹊線色
HAIR = [(40, 28, 26), (78, 58, 50), (116, 92, 78)]   # 偏棕的黑（參考圖）
LAB = dict(rim=(184, 110, 112), out=(222, 150, 154), minr=(196, 108, 118), inn=(208, 52, 72), hi=(240, 110, 124),
           hole=(122, 14, 30), holeDk=(84, 6, 18), clit=(250, 176, 184))
WHITE = (255, 255, 255)

N = 128
CX = 64


def sm(t):
    t = max(0.0, min(1.0, t)); return t * t * (3 - 2 * t)


def hsh(x, y, k=0):
    h = (x * 374761393 + y * 668265263 + k * 1442695041) & 0xffffffff
    h = ((h ^ (h >> 13)) * 1274126177) & 0xffffffff
    return ((h ^ (h >> 16)) & 0xffffffff) / 4294967296


# ---------- 形狀（照使用者畫的結構線：棕線＝身體輪廓；藍線是骨頭，不畫）----------
# 參考圖座標（850×540，中線 x≈430）→ 128 格：x' = 64 + (x−430)·S，y' = 116 − (436−y)·S
S = 0.19
BY = 121   # 底部凹口在第幾列
def P(x, y): return (CX + (x - 430) * S, BY - (436 - y) * S)
def mirror(pts): return [(2 * 430 - x, y) for (x, y) in pts]
# 左半邊輪廓（從腰上方往下、往外、再沿下緣弧線回到中間底部凹口）
LEFT = [(292, -260), (292, 0), (296, 60), (301, 110), (298, 150), (287, 195),      # 腰→髖（腰線微微往內再往外）
        (270, 197), (230, 180), (190, 166), (160, 156), (53, 112), (-120, 40),     # 大腿上緣：從髖往外往上，延伸出畫面
        (-120, 262), (53, 282), (120, 312),                                         # 大腿下緣（畫面外）回到弧線底
        (150, 346), (200, 380), (260, 409), (330, 428), (395, 437), (422, 433)]    # 下緣大弧線收到中間底部
OUTLINE = [P(*q) for q in LEFT] + [P(*q) for q in reversed(mirror(LEFT))]
CREASE_L = [(287, 198), (318, 255), (352, 318), (385, 380), (410, 425)]              # V 字鼠蹊線
ARC_L = [(165, 158), (178, 182), (172, 218), (152, 262), (124, 302)]                 # 大腿外側弧線（大腿往前那團肉的邊）
BOTTOM_L = LEFT[15:]


def draw(hair='triangle', opened=False, sweat=True):
    from PIL import ImageDraw
    m = Image.new('L', (N, N), 0)
    ImageDraw.Draw(m).polygon(OUTLINE, fill=255)
    M = m.load()
    img = [[(SKIN if M[x, y] else None) for x in range(N)] for y in range(N)]

    def put(x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < N and 0 <= y < N and img[y][x] is not None:
            img[y][x] = c

    def line(pts, col, col2=None, split=1.0):
        pts = [P(*q) for q in pts]
        segs = list(zip(pts, pts[1:]))
        tot = sum(math.hypot(b[0] - a[0], b[1] - a[1]) for a, b in segs)
        acc = 0
        for a, b in segs:
            L = math.hypot(b[0] - a[0], b[1] - a[1]); n = max(1, int(L * 2))
            for i in range(n + 1):
                t = i / n
                put(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, col if (acc + L * t) / tot < split or not col2 else col2)
            acc += L

    def near_edge(x, y, r):
        for dy in range(-r, r + 1):
            for dx in range(-r, r + 1):
                xx, yy = x + dx, y + dy
                if yy < 0: continue
                if not (0 <= xx < N and yy < N) or not M[xx, yy]:
                    return True
        return False

    # 陰影：腰兩側（髖以上）、下緣大弧線內側一條（屁股／大腿下面）
    hipY = P(0, 195)[1]
    for y in range(N):
        for x in range(N):
            if img[y][x] is None: continue
            if y < hipY and near_edge(x, y, 2) and y > 0: img[y][x] = SH
            elif y > hipY + 6 and (not (0 <= y + 3 < N) or not M[x, min(N - 1, y + 3)]) and 4 < x < N - 5: img[y][x] = SH

    # 肚臍
    ny = int(P(0, 95)[1]); put(CX, ny, DK); put(CX, ny + 1, SH); put(CX - 1, ny, SH); put(CX, ny - 1, SH)
    # 結構線：V 字鼠蹊線（上淡下深）、大腿外側弧線
    line(CREASE_L, CREASE, SH, .55); line(mirror(CREASE_L), CREASE, SH, .55)
    line(ARC_L, CREASE); line(mirror(ARC_L), CREASE)
    # 中間底部凹口（會陰）
    put(CX, BY, DK); put(CX - 1, BY + 1, SH); put(CX + 1, BY + 1, SH)

    # ---------- 陰唇肉穴 ----------
    top, bot = P(0, 345)[1], P(0, 432)[1]
    H = bot - top
    W = lambda v: 6.6 * max(0, math.sin(math.pi * min(1, max(0, v)))) ** .6 * (1 - .08 * v)
    op = .42 if opened else .22
    CW = lambda v: W(v) * op * max(0, math.sin(math.pi * v)) ** .45
    for y in range(int(top), int(bot) + 1):
        v = (y + .5 - top) / H
        if not 0 <= v <= 1: continue
        ww, cw = W(v), CW(v)
        for x in range(int(CX - ww - 1), int(CX + ww + 2)):
            au = abs(x + .5 - CX)
            if au > ww: continue
            if au > ww - 1: c = SH                                       # 肉瓣外緣
            elif au > cw + 1:
                t = (au - cw) / max(.1, ww - cw)
                c = HI if (t < .45 and .12 < v < .6) else (SH if (t > .75 and v > .55) else SKIN)
            elif au > cw: c = LAB['rim']                                 # 縫邊
            else:
                t = au / max(.5, cw)
                c = LAB['minr'] if t > .55 else (LAB['inn'] if v > .55 else LAB['out'])
            put(x, y, c)
    put(CX, top + H * .16, LAB['clit'])
    hy = top + H * .72
    for (dx, dy) in ((0, -1), (0, 0), (0, 1), (-1, 0), (1, 0)) if opened else ((0, 0), (0, 1)):
        put(CX + dx, hy + dy, LAB['holeDk'] if (dx, dy) == (0, 0) else LAB['hole'])
    put(CX - 1, top + H * .4, LAB['hi']); put(CX + 1, top + H * .55, LAB['hi'])
    put(CX - 4, top + H * .42, WHITE); put(CX + 3, top + H * .6, WHITE)          # 濕亮
    

    # ---------- 陰毛 ----------
    if hair != 'none':
        if hair == 'strip':
            hx, hy0, hy1, hw = CX, int(P(0, 280)[1]), int(P(0, 366)[1]), 3.5
        else:
            hx, hy0, hy1, hw = CX, int(P(0, 262)[1]), int(P(0, 368)[1]), 13
        hh = hy1 - hy0

        def dH(x, y):
            t = max(0, (y - hy0) / hh)
            shrink = 1 - (.62 if hair == 'triangle' else .2) * t
            return math.hypot((x - hx) / (hw * shrink), (y - (hy0 + hy1) / 2) / (hh / 2))
        for y in range(hy0 - 3, hy1 + 4):
            for x in range(int(hx - hw - 3), int(hx + hw + 4)):
                d = dH(x + .5, y + .5)
                if d < .72:
                    put(x, y, HAIR[0] if hsh(x, y, 1) < .72 else HAIR[1])
                elif d < 1.08 and hsh(x, y, 2) < (1.08 - d) / .36 * .8:
                    put(x, y, HAIR[0])
        # 一根根捲毛（邊緣毛躁、往下往外翹；底下幾根垂到陰唇兩旁）
        n = 90 if hair == 'triangle' else 26
        for k in range(n):
            x = hx + (hsh(k, 3) * 2 - 1) * hw
            y = hy0 + hsh(k, 4) * hh
            if dH(x, y) > 1.0: continue
            side = (x - hx) / hw
            a = math.pi / 2 - side * 1.2 + (hsh(k, 5) - .5) * 1.8
            curl = (hsh(k, 6) - .5) * .9
            ln = 2 + int(hsh(k, 7) * 3)
            col = HAIR[2] if hsh(k, 8) > .82 else HAIR[1] if hsh(k, 8) > .45 else HAIR[0]
            for i in range(ln):
                put(x, y, col); x += math.cos(a); y += math.sin(a); a += curl

    # 汗珠（參考圖：肚子、大腿上的水滴）
    if sweat:
        for (x, y) in ((CX - 8, 18), (CX + 10, 40), (18, 70), (106, 66), (30, 90), (98, 92), (CX + 7, 48)):
            put(x, y, WHITE); put(x, y + 1, SH)

    # 外圈 1px 白邊（droom）
    out = [row[:] for row in img]
    for y in range(N):
        for x in range(N):
            if img[y][x] is not None: continue
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                xx, yy = x + dx, y + dy
                if 0 <= xx < N and 0 <= yy < N and img[yy][xx] is not None:
                    out[y][x] = WHITE; break
    im = Image.new('RGBA', (N, N), (0, 0, 0, 0))
    px = im.load()
    for y in range(N):
        for x in range(N):
            if out[y][x] is not None: px[x, y] = out[y][x] + (255,)
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--hair', default='triangle'); ap.add_argument('--open', action='store_true')
    ap.add_argument('--up', type=int, default=1); ap.add_argument('--bg', action='store_true')
    a = ap.parse_args()
    im = draw(a.hair, a.open)
    if a.bg:
        b = Image.new('RGBA', im.size, (40, 34, 50, 255)); b.alpha_composite(im); im = b
    if a.up > 1: im = im.resize((N * a.up, N * a.up), Image.NEAREST)
    im.save(a.out)
