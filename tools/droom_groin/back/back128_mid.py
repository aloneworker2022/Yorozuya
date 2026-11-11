#!/usr/bin/env python3
"""背後體位的過渡格：臀部翹起（back128.py）和臀部往後（back128_sitback.py）中間那一張。
兩張的線各自照弧長重新取樣後取中間值；股溝分開的點、肛門、陰唇都在兩張的正中間；腿（膝蓋、小腿）跟兩張一樣不動。"""
import math, os, sys
from PIL import Image, ImageDraw
import back128 as A
import back128_sitback as B
N, MIDX = 128, 64
LINE, SECT, CREASE, CREASE_TOP, LAB_SLIT = A.LINE, A.SECT, A.CREASE, A.CREASE_TOP, A.LAB_SLIT
cr, stroke, pp, mirror = A.cr, A.stroke, A.pp, A.mirror
T = float(os.environ.get('T', '.5'))


def resample(pts, n=120):
    d = [0.0]
    for a, b in zip(pts, pts[1:]): d.append(d[-1] + math.hypot(b[0] - a[0], b[1] - a[1]))
    out = []; j = 0
    for i in range(n):
        s = d[-1] * i / (n - 1)
        while j < len(d) - 2 and d[j + 1] < s: j += 1
        u = 0 if d[j + 1] == d[j] else (s - d[j]) / (d[j + 1] - d[j])
        out.append((pts[j][0] + (pts[j + 1][0] - pts[j][0]) * u, pts[j][1] + (pts[j + 1][1] - pts[j][1]) * u))
    return out
sh = lambda pts: [(x, y + B.DY) for x, y in pts]
mix = lambda p, q: [(a[0] + (b[0] - a[0]) * T, a[1] + (b[1] - a[1]) * T) for a, b in zip(p, q)]
lerp = lambda a, b: a + (b - a) * T
B_W = [(38.4, 0), (41.4, 7), (43.4, 14.6), (43, 21), (40, 27.4), (34, 34)]
WAIST = mix(resample(cr(A.WAIST_L)), resample(sh(cr(B_W))))
WAIST = [(WAIST[0][0] - .5, -1)] + WAIST
BUTT = mix(resample(cr(A.BUTT_L), 240), resample(sh(cr(B.BACK_L)), 240))
FOLD = mix(resample(cr(A.FOLD_L), 40), resample(sh(cr(B.BACK_L))[::-1], 240)[:40 * 1][:40])        # 往後那張：倒 V 就是屁股內緣，取靠胯下那一段
_bv = resample(sh(cr([(64, 73), (62, 77.4), (59.8, 82), (57.2, 86.6), (53.8, 90.6)])), 40)
FOLD = mix(resample(cr(A.FOLD_L), 40), _bv)
TOP = mix(A.TOP_L, sh(B.TOP_L))
SPLIT = lerp(60, 73 + B.DY)                      # 股溝分開的點
CLEFT_TOP = lerp(31, 39 + B.DY)
ANUS_Y = round(lerp(65, 76 + B.DY))
Y0, Y1 = round(lerp(68, 79 + B.DY)), round(lerp(72, 82 + B.DY))          # 縫的上下
LOBE = mix(A.LOBE_L, sh([(59.6, 82), (60.6, 83.6), (62.6, 83.9), (64, 82.8)]))
DIMPLE = (58, round(lerp(18, 26 + B.DY)))
SPINE_BOT = round(lerp(16, 24 + B.DY))


def draw():
    im = Image.new('RGBA', (N, N), (255, 255, 255, 255)); px = im.load()
    def put(pts, col, smooth=False):
        for (x, y) in pp(stroke(cr(pts) if smooth else pts)): px[x, y] = col
    def fade(pts, cols, cuts):
        q = pp(stroke(pts))
        for i, (x, y) in enumerate(q): px[x, y] = cols[sum(i / max(1, len(q)) >= c for c in cuts)]
    for L in (A.LEG_OUT_L, A.LEG_IN_L):
        for pts in (L, mirror(L)): put(pts, LINE, True)
    for pts in (A.KNEE_L, mirror(A.KNEE_L)): put(pts, CREASE, True)
    poly = BUTT + mirror(BUTT)[::-1]
    ImageDraw.Draw(im).polygon(poly, fill=(255, 255, 255, 255))                    # 屁股蓋住後面的腿
    for pts in (WAIST, mirror(WAIST), BUTT, mirror(BUTT)): put(pts, LINE)
    for pts in (TOP, mirror(TOP)): fade(cr(pts), (SECT, CREASE, CREASE_TOP), (.25, .6))
    for pts in (FOLD, mirror(FOLD)): fade(pts, (LINE, SECT, CREASE), (.7, .9))
    put([(64, CLEFT_TOP), (64, SPLIT)], LINE)
    for y in range(0, SPINE_BOT + 1):
        if y % 3: px[64, y] = CREASE_TOP
    for x in (DIMPLE[0], 2 * MIDX - DIMPLE[0]): px[x, DIMPLE[1]] = SECT; px[x, DIMPLE[1] + 1] = CREASE
    px[MIDX, ANUS_Y] = LAB_SLIT; px[MIDX, ANUS_Y + 1] = LAB_SLIT
    for pts in (LOBE, mirror(LOBE)): put(pts, SECT, True)
    for y in range(Y0, Y1 + 1): px[MIDX, y] = LAB_SLIT
    A.labia_kind(px, Y0, Y1)
    return im


def fill(lines_img):
    BG, SKIN, SH, EDGE = (40, 34, 50), (242, 204, 177), (216, 166, 140), (184, 124, 104)
    m = Image.new('L', (N, N), 0); d = ImageDraw.Draw(m)
    body = WAIST + BUTT[1:]
    d.polygon(body + mirror(body)[::-1], fill=255)
    tri = [(64, SPLIT - 1)] + FOLD[:14] + cr(LOBE)                                 # 胯下那塊（肛門、陰唇）
    d.polygon(tri + mirror(tri)[::-1], fill=255)
    for sgn in (0, 1):
        leg = cr(A.LEG_OUT_L) + [(A.LEG_OUT_L[-1][0], N + 2), (A.LEG_IN_L[-1][0], N + 2)] + cr(A.LEG_IN_L)[::-1]
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
    for side in (BUTT, mirror(BUTT)):
        for (x, y) in pp(stroke(side)):
            if y > 84 and y + 1 < N and px[x, y + 1][:3] == SKIN: px[x, y + 1] = SH + (255,)
    return im


if __name__ == '__main__':
    out = sys.argv[1]; up = int(sys.argv[2]) if len(sys.argv) > 2 else 1
    im = draw()
    if os.environ.get('FILL') == '1': im = fill(im)
    if up > 1: im = im.resize((N * up, N * up), Image.NEAREST)
    im.save(out); print('SPLIT', SPLIT, 'ANUS', ANUS_Y, 'slit', Y0, Y1, 'lobe bottom', max(y for _, y in LOBE))
