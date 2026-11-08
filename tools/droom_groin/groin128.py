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


# ---------- 形狀 ----------
def torso_hw(y):            # 腰（上）→ 胯（下）半寬
    return 14.5 + 3 * sm(y / 40) + 13 * sm((y - 36) / 28)     # 腰細、到髖才往外張


def in_torso(x, y):
    return y <= 100 and abs(x - CX) < torso_hw(min(y, 64))


def thigh(x, y, side):
    """大腿＝從胯（內）到畫面外（外）的粗管，靠胯那頭粗一點、上緣微凸。回傳 (在裡面, 0..1 沿腿位置, 離上緣比例)。"""
    px, py = CX + side * -13, 92          # 內端（胯旁）
    qx, qy = CX + side * -96, 64          # 外端（畫面外，往外微微往上：膝蓋在畫面外抬著）
    dx, dy = qx - px, qy - py
    L2 = dx * dx + dy * dy
    t = max(0.0, min(1.0, ((x - px) * dx + (y - py) * dy) / L2))
    ex, ey = px + dx * t, py + dy * t
    r = 25 - 5 * t
    nx, ny = x - ex, y - ey
    # 上緣往上鼓一點（大腿上面的肉）
    bulge = 3.0 * math.sin(math.pi * min(1, t * 1.4)) if ny < 0 else 0
    d = math.hypot(nx, ny)
    return d < r + bulge, t, (ny / (r + bulge))


def in_butt(x, y):
    for bx in (CX - 15, CX + 15):
        if ((x - bx) / 19) ** 2 + ((y - 116) / 15) ** 2 < 1:
            return True
    return False


def in_body(x, y):
    return in_torso(x, y) or thigh(x, y, 1)[0] or thigh(x, y, -1)[0] or in_butt(x, y)


def draw(hair='triangle', opened=False, sweat=True):
    img = [[None] * N for _ in range(N)]

    def put(x, y, c):
        x, y = int(round(x)), int(round(y))
        if 0 <= x < N and 0 <= y < N and img[y][x] is not None:
            img[y][x] = c

    # 底色
    for y in range(N):
        for x in range(N):
            if in_body(x + .5, y + .5):
                img[y][x] = SKIN

    # 陰影：腰側（只在大腿以外）、大腿下緣、屁股下緣／內側
    for y in range(N):
        for x in range(N):
            if img[y][x] is None: continue
            fx, fy = x + .5, y + .5
            inT = in_torso(fx, fy)
            tL, tR = thigh(fx, fy, 1), thigh(fx, fy, -1)
            onThigh = tL[0] or tR[0]
            if inT and fy < 64 and not onThigh and not in_butt(fx, fy) and abs(fx - CX) > torso_hw(fy) - 2.2:
                img[y][x] = SH
            for th in (tL, tR):
                if th[0] and th[2] > .84 and not in_butt(fx, fy):
                    img[y][x] = SH          # 大腿下面那條陰影
            if in_butt(fx, fy):
                for bx, s in ((CX - 15, -1), (CX + 15, 1)):
                    e = ((fx - bx) / 19) ** 2 + ((fy - 116) / 15) ** 2
                    if e < 1 and (fy - 116) > 4 and e > .62:
                        img[y][x] = SH      # 屁股下緣

    # 肚臍（腰下面 1/3）＋肚子微亮
    for y in range(14, 46):
        for x in range(CX - 7, CX + 8):
            if img[y][x] == SKIN and ((x - CX + 2) / 7) ** 2 + ((y - 30) / 14) ** 2 < 1 and hsh(x, y, 7) < .0:
                img[y][x] = HI
    put(CX, 30, DK); put(CX, 31, SH); put(CX - 1, 30, SH); put(CX, 29, SH)

    # 鼠蹊線 V：從髖（腰側和大腿上緣交接）斜下到陰唇兩旁
    for s in (-1, 1):
        x0, y0, x1, y1 = CX + s * 25, 58, CX + s * 10, 102
        for i in range(60):
            t = i / 59
            x = x0 + (x1 - x0) * t + s * 1.5 * math.sin(math.pi * t)   # 微微往外彎
            y = y0 + (y1 - y0) * t
            put(x, y, CREASE if t < .55 else SH)
            if t > .8: put(x + s, y, SH)
    # 屁股中間的縫＋會陰
    for y in range(103, N):
        put(CX, y, DK if y > 107 else SH)
        if y > 110: put(CX - 1, y, SH); put(CX + 1, y, SH)

    # ---------- 陰唇肉穴 ----------
    top, bot = 78.0, 105.0
    H = bot - top
    W = lambda v: 8.2 * max(0, math.sin(math.pi * min(1, max(0, v)))) ** .6 * (1 - .08 * v)
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
    put(CX, bot, DK)                                                              # 下面收進會陰

    # ---------- 陰毛 ----------
    if hair != 'none':
        if hair == 'strip':
            hx, hy0, hy1, hw = CX, 60, 82, 4
        else:
            hx, hy0, hy1, hw = CX, 57, 84, 15
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
        n = 110 if hair == 'triangle' else 30
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
