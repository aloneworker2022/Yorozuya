#!/usr/bin/env python3
"""droom 胯下（M 字腿正面、腰部以下）描線，128×128、1px 像素線。座標直接用 128 格（原本照 structure_ref.jpg 描，之後照使用者紅筆修）。

2026-11-08 使用者修正：
  1. 大腿內側有弧度（大腿肉飽滿）→ 鼠蹊線上半段往中間鼓。
  2. 鼠蹊部下半段微微漲（陰唇的位置）→ 鼠蹊線下半段往外撐開一點，收到底部凹口。
  3. 大腿剖面＝表現大腿肉 → 大腿盡頭是一個圓鼓的橢圓：外半邊是外輪廓（往外鼓），內半邊是剖面線。
  4. 腰線：中段往內收（腰最細），往下到髖往外鼓＝下腹部的肉感；肚臍在中線 y35。
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

HIP = (35, 55)
THIGH_E = dict(cx=16, cy=62, rx=10.5, ry=18)          # 左大腿剖面橢圓


def ell(e, deg):
    t = math.radians(deg)
    return (e['cx'] + e['rx'] * math.cos(t), e['cy'] + e['ry'] * math.sin(t))


def arc(e, a0, a1, step=6):
    n = max(2, int(abs(a1 - a0) / step))
    return [ell(e, a0 + (a1 - a0) * i / n) for i in range(n + 1)]


WAIST_L = [(35, 22), (38.5, 30), (41, 38), (40.3, 46), (37.8, 52), HIP]             # 腰：中段往內收（最細）、往下到髖往外鼓（下腹部的肉感）
THIGH_TOP_L = [HIP, (30, 51.5), (24, 47.5), ell(THIGH_E, -100)]                     # 大腿上緣：髖 → 剖面頂
OUTER_L = arc(THIGH_E, -100, -238)                                                   # 剖面外半邊（外輪廓，往外鼓）
SECT_L = arc(THIGH_E, -100, 98)                                                      # 剖面內半邊（大腿肉的圓）
BUTT_L = [ell(THIGH_E, -238), (16, 84), (24, 89.5), (34, 94), (45, 97.2), (54, 98.6), (59, 97.6), (61, 96)]   # 臀部下緣 → 凹口
CREASE_L = [HIP, (45, 63), (51.5, 72), (54.5, 80), (55.6, 87), (57.6, 93), (61, 96)]   # 上半往內鼓（大腿肉）、下半往外撐（陰唇）
NOTCH = [(61, 96), (67, 96)]
NAVEL = (64, 35)                                                                     # 肚臍（使用者標的＋）


def mirror(pts): return [(2 * MIDX - x, y) for (x, y) in pts]


STROKES = [  # (名字, 點, 色, 平滑)
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
    for name, pts, col, smooth in STROKES:
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
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--up', type=int, default=1); ap.add_argument('--fill', action='store_true')
    a = ap.parse_args()
    im = draw()
    if a.fill: im = fill_preview(im)
    if a.up > 1: im = im.resize((N * a.up, N * a.up), Image.NEAREST)
    im.save(a.out)
