# 研習 v9：照使用者貼的那張（外側從腋下往內勾→直→往外鼓到乳頭那條線→繞到底；內側「)(」；細鎖骨；乳暈外深內淺）
# 再加：乳房往上 DZ、乳頭往外 NX、肋骨骨架（肋弓＋劍突＋兩側短肋骨）
import sys, os
exec(open(os.path.join(os.path.dirname(os.path.abspath(sys.argv[0])), 'ribcage.py'), encoding='utf8').read().split('# 乳房蓋住的地方')[0])
SKIN, MID, DEEP = (242, 204, 177), (216, 166, 140), (184, 124, 104)
RING, AREO, NIP = (190, 124, 132), (206, 144, 148), (178, 108, 120)
E = lambda k, d: float(os.environ.get(k, d)); DZ = E('DZ', 0)
# 罩杯：以乳房上方（離中線 5.2、乳房上緣附近）為基準縮放——底面寬 SX、往下 SZ；越大越往外鼓、越往下、乳溝越近
SX, SZ, AR = E('SX', 1), E('SZ', 1), E('AR', 1); AX, AZ = 5.2, 77.0 + DZ
def cupT(x, z): return (AX + (x - AX) * SX, AZ + (z - AZ) * SZ)
def up(pts, keep=0): return [(x, z + DZ) if i < keep else cupT(x, z + DZ) for i, (x, z) in enumerate(pts)]
# 量自使用者那張（畫面格；右邊那顆，左邊鏡像）
OUTER = up([(10.2, 80.0), (9.0, 79.3), (8.53, 78.6), (8.53, 76.4), (9.0, 75.5), (9.7, 74.5), (9.86, 73.6), (9.5, 72.4)], keep=2)
BOTTOM = up([(9.5, 72.4), (8.4, 71.2), (6.9, 70.5), (5.4, 70.25), (3.8, 70.4), (2.7, 70.7), (1.9, 71.1)])
INNER = up([(1.9, 71.1), (1.05, 72.2), (E('IX', .65), 73.6), (.8, 74.7), (1.2, 75.5), (1.7, 76.1)])   # 內側「)(」：乳頭高度最靠中線，往上往下慢慢離開
TOP = up([(1.7, 76.1), (3.0, 77.0), (4.6, 77.7), (6.6, 78.4), (8.53, 78.6)])
if DZ: OUTER = [OUTER[0], OUTER[1]] + [(x, min(z, 79.0)) for x, z in OUTER[2:]]
LOOP = OUTER[2:] + BOTTOM[1:] + INNER[1:] + TOP[1:]
NIPPLE = cupT(E('NX', 6.07), 73.6 + DZ)
TERM = up([(9.86, 73.6), (9.0, 72.6), (7.6, 71.9), (5.6, 71.6), (3.6, 71.8), (2.4, 72.3), (1.3, 72.9), (E('IX', .65), 73.6)])   # 下半陰影的上緣
def sym(pts, s): return [P(s * x, z) for x, z in pts]
def paint():
    im = Image.new('RGB', (W, H), (236, 232, 226)); px = im.load(); d = ImageDraw.Draw(im); bg = (236, 232, 226)
    for y in range(H):
        for x in range(W):
            if mp[x, y][3]: px[x, y] = SKIN
    BM = Image.new('L', (W, H), 0); bd = ImageDraw.Draw(BM)
    for s in (-1, 1):
        poly = spline(sym(LOOP + [LOOP[0]], s)); d.polygon(poly, fill=SKIN); bd.polygon(poly, fill=255)
    bm = BM.load()
    for y in range(1, H - 1):   # 手臂和身體交界（腋下以下、乳房外面）
        for x in range(1, W - 1):
            c = mp[x, y]
            if c[3] and c[2] != 255 and not bm[x, y] and any(mp[x + dx, y][2] == 255 for dx in (-1, 1)) and 126 - y / K < 79.5: px[x, y] = MID
    MM = Image.new('L', (W, H), 0); md = ImageDraw.Draw(MM)
    for s in (-1, 1):
        md.polygon(spline(sym(OUTER[6:] + BOTTOM[1:] + INNER[1:3], s)) + spline(sym(TERM, s))[::-1], fill=255)        # 下半轉過去（含內下）
        cast = [(x, z - (.75 if 1.0 < x < 9.0 else .3) * SZ) for x, z in BOTTOM]
        md.polygon(spline(sym(BOTTOM, s)) + spline(sym(cast, s))[::-1], fill=255)                                     # 落在胸腔上的影子
        md.polygon(sym([(0, 84.4), (0.6, 85.3)], s) + sym([(0, 84.4), (0.25, 85.3)], s)[::-1], fill=255)             # 胸骨上窩
    for s in (-1, 1):
        inner_in = up([(1.9, 71.1), (1.75, 72.2), (1.45, 73.6), (1.35, 74.6), (1.45, 75.4), (1.7, 76.1)])
        md.polygon(spline(sym(INNER, s)) + spline(sym(inner_in, s))[::-1], fill=255)
    gap = INNER[2::-1]   # 兩顆中間：最靠近那點往下（往上是亮的胸口）；兩顆離得遠（小罩杯）就不塗
    if INNER[2][0] < 1.0: md.polygon(spline([P(x, z) for x, z in gap]) + spline([P(-x, z) for x, z in gap])[::-1], fill=255)
    mm = MM.load()
    for y in range(H):
        for x in range(W):
            if mm[x, y] and px[x, y] != bg: px[x, y] = MID
    if os.environ.get('RIBS'):   # 肋骨骨架（陰影色細線；乳房和影子裡面不畫）
        RL = Image.new('L', (W, H), 0); rd = ImageDraw.Draw(RL); XI = E('XZ', 72.9)
        for s in (-1, 1):
            rd.line(spline(sym([(0, XI), (1.6, XI - .8), (3.4, XI - 1.9), (5.0, XI - 2.8), (5.9, XI - 3.5)], s)), fill=255)
            for (x0, z0, x1, z1) in [(4.9, XI - .9, 6.3, XI - 2.0), (5.3, XI - 2.2, 6.1, XI - 2.9)]:
                rd.line(spline(sym([(x0, z0), ((x0 + x1) / 2 + .15, (z0 + z1) / 2 + .1), (x1, z1)], s)), fill=255)
        rd.line([P(0, XI), P(0, XI - .7)], fill=255)
        rl = RL.load()
        for y in range(H):
            for x in range(W):
                if rl[x, y] and px[x, y] == SKIN and not bm[x, y]: px[x, y] = MID
    for s in (-1, 1):
        cx, cz = s * NIPPLE[0], NIPPLE[1]
        for r, c in ((1.4 * AR, RING), (1.0 * AR, AREO), (.42 * (1 + (AR - 1) * .5), NIP)):
            x0, y0 = P(cx - r * (.92 if r > .5 else 1), cz + r); x1, y1 = P(cx + r * (.92 if r > .5 else 1), cz - r); d.ellipse([x0, y0, x1, y1], fill=c)
        d.line(spline(sym(OUTER[:7], s)), fill=MID)                       # 外側：腋下→往內勾→直→往外鼓
        d.line(spline(sym(OUTER[6:] + BOTTOM[1:], s)), fill=DEEP)       # 下緣的摺（到內下就停）
        d.line(sym([(10.2, 80.0), (9.6, 79.65)], s), fill=DEEP)           # 腋下小角
        if os.environ.get('TOPARC'):   # 圓形：上緣一條微微的折線（上半也是圓的）
            arc = up([(1.5, 75.9), (2.8, 76.8), (4.6, 77.3), (6.6, 77.2), (8.0, 76.8), (8.53, 76.4)])
            TL = Image.new('L', (W, H), 0); ImageDraw.Draw(TL).line(spline(sym(arc, s)), fill=255); tl = TL.load()
            dash = os.environ.get('TOPARC') == 'dash'
            for yy in range(H):
                for xx in range(W):
                    if tl[xx, yy] and (not dash or (xx // 2) % 2 == 0): px[xx, yy] = MID
        d.line(spline(sym([(0.9, 84.0), (3.2, 84.05), (5.9, 84.3)], s)), fill=MID)   # 鎖骨（細）
    # 乳溝：兩顆最靠近那裡一小塊深色（不是線），上下慢慢淡掉
    DM = Image.new('L', (W, H), 0); dmd = ImageDraw.Draw(DM)
    zc, wl = INNER[2][1], max(0, min(.3, .9 - INNER[2][0]))   # 兩顆擠在一起那一小塊：只有靠得夠近才有
    lens = [(0, zc + .5 * SZ), (wl * .75, zc + .2 * SZ), (wl, zc - .2 * SZ), (wl * .8, zc - .7 * SZ), (0, zc - 1.0 * SZ)] if wl > 0 else [(0, zc), (0, zc), (0, zc)]
    dmd.polygon(spline([P(x, z) for x, z in lens]) + spline([P(-x, z) for x, z in lens])[::-1], fill=255)
    dm = DM.load()
    for y in range(H):
        for x in range(W):
            if dm[x, y] and px[x, y] != bg: px[x, y] = DEEP
    return im
a = paint(); a.save(os.environ.get('OUT', f'{SP}/v9') + '.full.png')
y0, y1 = int(H * .262) - 8, int(H * .47)
a.crop((60, y0, 196, y1)).resize((136 * 3, (y1 - y0) * 3), Image.NEAREST).save(os.environ.get('OUT', f'{SP}/v9') + '.png')
