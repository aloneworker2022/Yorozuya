#!/usr/bin/env python3
"""第一步：只照使用者的結構圖（structure_ref.jpg）描棕線，128×128、1px 像素線；藍線（骨頭）不描、不上色。
線的座標是照原圖棕線位置手描（原圖 865×538），中間用 Catmull-Rom 補平順。
用法：python3 trace128.py OUT.png [--up 6] [--over]（--over：把原圖淡淡墊在底下對照）
"""
import argparse
from PIL import Image

N = 128
CROP = (100, 50, 760, 470)                      # 原圖取這一塊
S = (N - 8) / (CROP[2] - CROP[0])
OX, OY = 4, (N - (CROP[3] - CROP[1]) * S) / 2

LINES = {
    'waist_L':  [(290, 62), (293, 95), (291, 125), (285, 158), (280, 188), (272, 208)],
    'waist_R':  [(555, 62), (546, 95), (540, 130), (542, 165), (553, 192), (565, 206)],
    'thigh_L':  [(158, 160), (185, 165), (220, 180), (250, 198), (270, 210)],
    'thigh_R':  [(565, 207), (600, 190), (640, 178), (688, 165)],
    'arc_L':    [(165, 165), (172, 200), (168, 240), (155, 272), (138, 290), (122, 297)],
    'arc_R':    [(668, 195), (672, 230), (685, 262), (705, 292), (728, 304), (738, 310)],
    'bottom_L': [(120, 312), (150, 360), (200, 400), (260, 428), (320, 448), (370, 455), (400, 445), (416, 435), (430, 436)],
    'bottom_R': [(430, 436), (446, 438), (480, 452), (520, 459), (560, 450), (620, 422), (680, 384), (720, 348), (742, 322)],
    'crease_L': [(362, 310), (372, 350), (385, 385), (400, 418), (412, 435)],
    'crease_R': [(472, 310), (466, 345), (458, 380), (448, 410), (442, 432)],
    'top':      [(300, 182), (340, 172), (380, 163), (420, 160), (458, 158)],
    'top_R':    [(505, 175), (530, 180), (548, 188)],
}


def P(x, y): return ((x - CROP[0]) * S + OX, (y - CROP[1]) * S + OY)


def cr(pts, n=12):
    """Catmull-Rom 補點。"""
    out = []
    p = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(p) - 2):
        p0, p1, p2, p3 = p[i - 1], p[i], p[i + 1], p[i + 2]
        for k in range(n):
            t = k / n; t2, t3 = t * t, t * t * t
            out.append(tuple(.5 * (2 * p1[j] + (-p0[j] + p2[j]) * t + (2 * p0[j] - 5 * p1[j] + 4 * p2[j] - p3[j]) * t2 + (-p0[j] + 3 * p1[j] - 3 * p2[j] + p3[j]) * t3) for j in (0, 1)))
    out.append(pts[-1])
    return out


def plot(px, a, b, col):
    x0, y0, x1, y1 = round(a[0]), round(a[1]), round(b[0]), round(b[1])
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    e = dx + dy
    while True:
        if 0 <= x0 < N and 0 <= y0 < N: px[x0, y0] = col
        if x0 == x1 and y0 == y1: break
        e2 = 2 * e
        if e2 >= dy: e += dy; x0 += sx
        if e2 <= dx: e += dx; y0 += sy


def draw(ref=None):
    im = Image.new('RGBA', (N, N), (255, 255, 255, 255))
    if ref:
        r = Image.open(ref).convert('RGBA').crop(CROP).resize((round((CROP[2] - CROP[0]) * S), round((CROP[3] - CROP[1]) * S)), Image.LANCZOS)
        r.putalpha(70); im.alpha_composite(r, (OX, round(OY)))
    px = im.load()
    for name, pts in LINES.items():
        q = [P(*p) for p in cr(pts)]
        for a, b in zip(q, q[1:]): plot(px, a, b, (132, 100, 70, 255))
    return im


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--up', type=int, default=1); ap.add_argument('--over', action='store_true')
    a = ap.parse_args()
    import os
    im = draw(os.path.join(os.path.dirname(__file__), 'structure_ref.jpg') if a.over else None)
    if a.up > 1: im = im.resize((N * a.up, N * a.up), Image.NEAREST)
    im.save(a.out)
