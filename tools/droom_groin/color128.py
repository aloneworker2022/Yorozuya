#!/usr/bin/env python3
"""droom 胯下 128×128 上色（用 trace128.py 的線）：droom 三階肉色、平塗不抖色、外圈 1px 白邊；光從左上前方。
三色（droom MEMO-2026-11-08 定稿）：肉色 242,204,177／陰影 216,166,140／深色 184,124,104。
深色只用在最深的摺：腹側被大腿擠出的肉摺、胯下凹口、肚臍。
用法：python3 color128.py OUT.png [--up 6] [--bg]
"""
import argparse, math, os, sys
from PIL import Image, ImageDraw
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import trace128 as T

N = T.N
SKIN, SH, DK = (242, 204, 177), (216, 166, 140), (184, 124, 104)
WHITE = (255, 255, 255)


def poly_mask(pts):
    m = Image.new('L', (N, N), 0); ImageDraw.Draw(m).polygon(pts, fill=255); return m.load()


def pix(pts, smooth=True):
    return T.pixel_perfect(T.stroke(T.cr(pts) if smooth else pts))


def near(px_set):
    """每格到這組像素的最近距離（128×128 暴力算就夠快）。"""
    pts = list(px_set)
    D = [[99.0] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            D[y][x] = min(math.hypot(x - a, y - b) for a, b in pts) if pts else 99
    return D


def color():
    M = poly_mask(T.silhouette())
    mir = T.mirror
    # 大腿範圍（每邊）：髖 → 大腿上緣 → 剖面外半 → 大腿下緣 → 鼠蹊線往上 → 肉摺回髖
    def thigh_poly(side):
        f = (lambda p: p) if side == 'L' else mir
        return (f([T.HIP]) + f(T.cr(T.THIGH_TOP_L))[1:] + f(T.OUTER_L)[1:] + f(T.cr(T.BUTT_L))[1:]
                + f(T.cr(T.CREASE_L))[::-1] + f(T.cr(T.SQUEEZE_L))[::-1])
    TL, TR = poly_mask(thigh_poly('L')), poly_mask(thigh_poly('R'))
    e = T.THIGH_E
    def in_face(x, y, side):        # 大腿剖面（橢圓那一面）
        cx = e['cx'] if side == 'L' else 2 * T.MIDX - e['cx']
        return ((x + .5 - cx) / e['rx']) ** 2 + ((y + .5 - e['cy']) / e['ry']) ** 2 < 1

    under = set(pix(T.BUTT_L)) | set(pix(mir(T.BUTT_L)))
    crease = set(pix(T.CREASE_L)) | set(pix(mir(T.CREASE_L)))
    squeeze = set(pix(T.SQUEEZE_L)) | set(pix(mir(T.SQUEEZE_L)))
    sect = set(pix(T.SECT_L, False)) | set(pix(mir(T.SECT_L), False))
    dU, dC = near(under), near(crease)

    img = [[None] * N for _ in range(N)]
    for y in range(N):
        for x in range(N):
            if not M[x, y]: continue
            c = SKIN
            onL, onR = TL[x, y], TR[x, y]
            if onL or onR:
                side = 'L' if onL else 'R'
                if in_face(x, y, side):
                    # 剖面：本色；背光那半（右下／左下靠身體那側）一圈陰影
                    cx = e['cx'] if side == 'L' else 2 * T.MIDX - e['cx']
                    nx, ny = (x + .5 - cx) / e['rx'], (y + .5 - e['cy']) / e['ry']
                    r = math.hypot(nx, ny)
                    if r > .78 and ny > .25: c = SH
                else:
                    # 大腿面：下緣往上 2 格、靠鼠蹊那側 2 格是陰影（往後轉、背光）
                    if dU[y][x] <= 2.2 or dC[y][x] <= 2.0: c = SH
            else:
                # 身體（腰、下腹、胯下）：腰兩側 2 格陰影（右側 3 格，光從左上）
                left_edge = any(not M[x - k, y] for k in (1, 2) if x - k >= 0)
                right_edge = any(not M[x + k, y] for k in (1, 2, 3) if x + k < N)
                if (left_edge or right_edge) and y < T.HIP[1] + 2: c = SH
                # 胯下凹口兩側往下收：靠底 2 格陰影
                if y >= 92 and abs(x - T.MIDX) <= 5: c = SH
            img[y][x] = c
    def put(x, y, c):
        if 0 <= x < N and 0 <= y < N and img[y][x] is not None: img[y][x] = c
    for (x, y) in crease: put(x, y, SH)
    for (x, y) in sect: put(x, y, SH)
    for (x, y) in under: put(x, y, SH)
    for (x, y) in squeeze:          # 肉摺：摺線深、下面一格陰影
        put(x, y, DK); put(x, y + 1, SH)
    for x in range(T.MIDX - 3, T.MIDX + 4): put(x, 96, DK)      # 胯下凹口
    nx, ny = T.NAVEL; put(nx, ny, DK); put(nx, ny + 1, SH); put(nx, ny - 1, SH)
    # 外圈 1px 白邊
    out = Image.new('RGBA', (N, N), (0, 0, 0, 0)); p = out.load()
    for y in range(N):
        for x in range(N):
            if img[y][x] is not None: p[x, y] = img[y][x] + (255,)
            elif any(0 <= x + dx < N and 0 <= y + dy < N and img[y + dy][x + dx] is not None for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                p[x, y] = WHITE + (255,)
    return out


if __name__ == '__main__':
    ap = argparse.ArgumentParser()
    ap.add_argument('out'); ap.add_argument('--up', type=int, default=1); ap.add_argument('--bg', action='store_true')
    a = ap.parse_args()
    im = color()
    if a.bg:
        b = Image.new('RGBA', im.size, (40, 34, 50, 255)); b.alpha_composite(im); im = b
    if a.up > 1: im = im.resize((N * a.up, N * a.up), Image.NEAREST)
    im.save(a.out)
