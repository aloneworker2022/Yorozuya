# 研習：先胸腔構圖、再放乳房（2D 線稿，量原本人偶的剪影；單位＝畫面格，×4 像素）
import sys
from PIL import Image, ImageDraw
SP = sys.argv[1]
K = 4
m = Image.open(f'{SP}/mask_nobust.png').convert('RGBA'); W, H = m.size; mp = m.load()
P = lambda X, z: (128 + X * K - .5, (126 - z) * K)
def spline(pts, n=12):  # Catmull-Rom
    out = []
    pts = [pts[0]] + pts + [pts[-1]]
    for i in range(1, len(pts) - 2):
        p0, p1, p2, p3 = pts[i-1], pts[i], pts[i+1], pts[i+2]
        for k in range(n):
            t = k / n
            out.append(tuple(.5 * ((2*p1[j]) + (-p0[j]+p2[j])*t + (2*p0[j]-5*p1[j]+4*p2[j]-p3[j])*t*t + (-p0[j]+3*p1[j]-3*p2[j]+p3[j])*t**3) for j in (0, 1)))
    out.append(pts[-2]); return out
def curve(d, pts, col, mirror=True):
    for s in ([-1, 1] if mirror else [1]):
        q = [P(s * x, z) for x, z in pts]
        d.line(spline(q), fill=col, width=1)
# ── 形狀（畫面格）──
RIB_SIDE = [(4.6, 85.0), (6.8, 83.0), (8.0, 81.0), (8.7, 79.0), (8.75, 77.0), (8.3, 75.0), (7.5, 73.0), (6.6, 71.6), (6.1, 70.6)]
RIB_ARCH = [(6.1, 70.6), (4.0, 71.4), (2.0, 72.6), (0, 73.6)]
STERNUM = [(0, 84.4), (0, 73.6)]
CLAV = [(0.7, 84.5), (3.0, 84.9), (5.8, 85.2), (8.4, 85.7)]
SHOULDER = (10.0, 82.6, 2.7)
import os
if os.environ.get('V1'): BREAST = [(8.6, 79.6), (9.3, 77.4), (9.4, 76.0), (8.9, 74.2), (7.7, 72.6), (5.7, 71.6), (3.9, 72.1), (2.6, 73.4), (2.2, 74.6)]
else: BREAST = [(8.5, 79.6), (8.85, 77.6), (8.9, 76.0), (8.4, 74.0), (7.2, 72.4), (5.3, 71.5), (3.4, 71.9), (2.1, 73.0), (1.5, 74.4), (1.35, 75.9), (1.5, 77.0)]   # 往中間收、外側只多鼓一點；內緣往上收到乳溝
HEART = [(0, 84.4), (3.5, 82.2), (6.6, 80.6), (8.6, 79.6)]
def base(sil=True):
    im = Image.new('RGB', (W, H), (255, 255, 255)); px = im.load()
    for y in range(H):
        for x in range(W):
            r, g, b, a = mp[x, y]
            if a and sil: px[x, y] = (236, 236, 236)
    return im
def outline(im, col=(150, 150, 150), skip=None):
    px = im.load()
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            c = mp[x, y]
            if not c[3]: continue
            edge = False
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                n = mp[x + dx, y + dy]
                if not n[3] or (n[2] == 255) != (c[2] == 255): edge = True
            if edge and not (skip and skip(x, y)): px[x, y] = col
# 乳房蓋住的地方：裡面的輪廓線（胸腔側邊、手臂內線）不畫
HM = Image.new('L', (W, H), 0); hd = ImageDraw.Draw(HM)
for s_ in (-1, 1): hd.polygon(spline([P(s_ * x, z) for x, z in BREAST]), fill=255)
hmp = HM.load()
def hidden(x, y): return hmp[x, y] > 0
# ① 胸腔構圖
a = base(); outline(a); d = ImageDraw.Draw(a)
BLUE, GREEN, YEL, BLK, CL = (60, 90, 220), (40, 170, 70), (225, 180, 20), (30, 26, 30), (120, 70, 60)
curve(d, RIB_SIDE, BLUE); curve(d, RIB_ARCH, BLUE); curve(d, STERNUM, BLUE, False); curve(d, CLAV, CL)
for s in (-1, 1):
    cx, cz, r = SHOULDER; x0, y0 = P(s * cx - r, cz + r); x1, y1 = P(s * cx + r, cz - r); d.ellipse([x0, y0, x1, y1], outline=GREEN)
# ② 放上乳房
b = a.copy(); d = ImageDraw.Draw(b); curve(d, HEART, YEL); curve(d, BREAST, BLK)
# ③ 只留線稿
c = base(False); outline(c, BLK, hidden); d = ImageDraw.Draw(c); curve(d, CLAV[:3], BLK); curve(d, BREAST, BLK)
y0, y1 = int(H * .262) - 8, int(H * .47)
ims = [i.crop((60, y0, 196, y1)).resize(((196 - 60) * 3, (y1 - y0) * 3), Image.NEAREST) for i in (a, b, c)]
w, h = ims[0].size; o = Image.new('RGB', (w * 3 + 20, h + 30), (255, 255, 255)); dd = ImageDraw.Draw(o)
for i, (im, t) in enumerate(zip(ims, ['1 ribcage first', '2 breasts on the ribcage', '3 line art'])):
    o.paste(im, (i * (w + 10), 30)); dd.text((i * (w + 10) + 8, 8), t, fill=0)
o.save(f'{SP}/ribcage_steps.png'); print(o.size)
