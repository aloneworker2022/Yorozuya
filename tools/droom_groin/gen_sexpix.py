#!/usr/bin/env python3
"""產「肏」像素互動（web/content/sex_pixel.js）用的分層圖到 web/sexpix/（2026-11-10）。
分層（網頁由下往上疊）：
  body_<體型>.png            身體底圖（128×128；沒有陰唇、陰莖、透視）。體型＝slim／std／plump／firm／wide，大腿加長出畫面（LONG）
  legs_<體型>.png            大腿抬起 −2～8 格的姿勢（11 張橫排；只留跟底圖不一樣的格子）
  g_<陰唇>_<條>.png           胯下那塊（陰唇＋陰莖），龜頭頂 76～106 每格一張：closed／a35／a70／open。陰唇＝small／mid／large
  g_<陰唇>_v<長度>_<條>.png    插入（龜頭頂 54～84）：insert、g1、g1p、g2、g2p、g2s、g3、g3p、g3s、g3u、g3c。陰道長度＝05／10／15
  lumen_v<長度>.png          插入那 11 條的陰道空間遮罩（一條一列；紅＝陰道裡空著、綠＝子宮腔）
  clit_<大小>.png            陰蒂（6 張橫排：closed、a35、a70、open 沒勃起、open 半勃起、open 全勃起）。大小＝small／mid／large
胯下那幾層是「跟標準體型底圖不一樣的格子＋大陰唇那一塊」，其他透明，所以每種體型的底圖都能疊。陰唇顏色網頁換色（粉→淺褐→深褐）。
用法：python3 gen_sexpix.py [輸出資料夾]　　只產一部分：ONLY=body,legs,clit,g,ins（逗號分隔）
"""
import os, sys, subprocess, tempfile, math
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'web', 'sexpix')
os.makedirs(OUT, exist_ok=True)
ONLY = set(filter(None, os.environ.get('ONLY', '').split(',')))
want = lambda k: not ONLY or k in ONLY
BUILDS = ['slim', 'std', 'plump', 'firm', 'wide']
LABIAS = ['small', 'mid', 'large']
VLENS = {'05': '0.5', '10': '1', '15': '1.5'}
CLITS = ['small', 'mid', 'large']
TIP0, TIP1, INS0, INS1 = 76, 106, 54, 84
LEG0, LEG1 = -2, 8
DESC_BY_LV = [0, 0, 0, 7]
TD = tempfile.mkdtemp()
_n = [0]


def render(env, lumen=False):
    _n[0] += 1
    fp = os.path.join(TD, f'f{_n[0]}_{os.getpid()}_{abs(hash(tuple(sorted(env.items()))))}.png')
    e = {**os.environ, 'LONG': '1', 'LAYER': '1', **{k: str(v) for k, v in env.items()}}
    if lumen: e['LUMEN_OUT'] = fp + '.lumen.png'
    subprocess.run([sys.executable, os.path.join(HERE, 'trace128.py'), fp, '--fill'], check=True, env=e)
    im = Image.open(fp).convert('RGBA'); im.load()
    lm = None
    if lumen: lm = Image.open(fp + '.lumen.png').convert('RGB'); lm.load(); os.remove(fp + '.lumen.png')
    os.remove(fp)
    return (im, lm) if lumen else im


def zone(x, y):
    """大陰唇那一塊（每種體型都用標準體型畫的蓋過去）：插著時撐到最大的那個橢圓＋1。"""
    if not 68 <= y <= 94: return False
    v = (y + .5 - 70.0) / 26.5
    if not 0 <= v <= 1: return False
    return abs(x + .5 - 64) <= 12.0 * max(0, math.sin(math.pi * v ** .9)) ** .55 + 1


def patch(frame, base, force_zone=True):
    fp, bp = frame.load(), base.load()
    out = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); op = out.load()
    for y in range(128):
        for x in range(128):
            if fp[x, y] != bp[x, y] or (force_zone and zone(x, y)): op[x, y] = fp[x, y]
    return out


def strip(frames):
    sh = Image.new('RGBA', (128 * len(frames), 128), (0, 0, 0, 0))
    for i, f in enumerate(frames): sh.paste(f, (128 * i, 0))
    return sh


pool = ThreadPoolExecutor(max_workers=os.cpu_count() or 4)
BASE_STD = render({'BASE': 1})

if want('body') or want('legs'):
    for b in BUILDS:
        base = render({'BASE': 1, 'BUILD': b})
        if want('body'): base.save(os.path.join(OUT, f'body_{b}.png'), optimize=True)
        if want('legs'):
            poses = list(pool.map(lambda k: render({'BASE': 1, 'BUILD': b, 'LEG': k}), range(LEG0, LEG1 + 1)))
            sh = strip([patch(p, base, False) for p in poses])
            for i in range(LEG1 - LEG0 + 1):                   # 檢查：大腿姿勢不能動到胯下中間
                bb = sh.crop((128 * i, 0, 128 * i + 128, 128)).getbbox()
                if bb: assert all(not (46 <= x <= 81 and sh.getpixel((128 * i + x, y))[3]) for x in range(46, 82) for y in range(128)), ('大腿姿勢動到中間了', b, i + LEG0)
            sh.save(os.path.join(OUT, f'legs_{b}.png'), optimize=True)
        print('body/legs', b, flush=True)

if want('clit'):
    states = [{'RUB': 5, 'PTIP': 101}, {'RUB': 6, 'PTIP': 106, 'OPEN_AMT': .35}, {'RUB': 6, 'PTIP': 106, 'OPEN_AMT': .7},
              {'RUB': 6, 'PTIP': 106, 'CLIT': 0}, {'RUB': 6, 'PTIP': 106, 'CLIT': .5}, {'RUB': 6, 'PTIP': 106, 'CLIT': 1}]
    none = [render({**st, 'CLITSIZE': 'none'}) for st in states]
    for c in CLITS:
        strip([patch(render({**st, 'CLITSIZE': c}), none[i], False) for i, st in enumerate(states)]).save(os.path.join(OUT, f'clit_{c}.png'), optimize=True)
        print('clit', c, flush=True)

G = {'CLITSIZE': 'none'}
if want('g'):
    for lb in LABIAS:
        for name, mode, amt in (('closed', 5, 1), ('a35', 6, .35), ('a70', 6, .7), ('open', 6, 1)):
            fr = list(pool.map(lambda t: patch(render({**G, 'LABIA': lb, 'RUB': mode, 'PTIP': t, 'OPEN_AMT': amt}), BASE_STD), range(TIP0, TIP1 + 1)))
            strip(fr).save(os.path.join(OUT, f'g_{lb}_{name}.png'), optimize=True)
        print('g', lb, flush=True)

if want('ins'):
    jobs = [('insert', {})]
    for lv in (1, 2, 3):
        r = {'GRIP': lv / 3, 'AROUSE': lv / 3, 'DESC': DESC_BY_LV[lv], 'CLIT': 1, 'SWELL': 1 if lv == 3 else 0}
        jobs += [(f'g{lv}', r), (f'g{lv}p', {**r, 'PULL': 1})]
        if lv >= 2: jobs.append((f'g{lv}s', {**r, 'SPASM': 1}))
        if lv == 3: jobs += [('g3u', {**r, 'BOB': 1}), ('g3c', {**r, 'CRAMP': 1})]
    ROWS = [n for n, _ in jobs]
    for vk, vv in VLENS.items():
        lumen = Image.new('RGB', (128 * (INS1 - INS0 + 1), 128 * len(ROWS)), (0, 0, 0))
        for li, lb in enumerate(LABIAS):
            for name, extra in jobs:
                res = list(pool.map(lambda t: render({**G, 'LABIA': lb, 'VLEN': vv, 'RUB': 8, 'PTIP': t, **extra}, lumen=True), range(INS0, INS1 + 1)))
                strip([patch(f, BASE_STD) for f, _ in res]).save(os.path.join(OUT, f'g_{lb}_v{vk}_{name}.png'), optimize=True)
                if li == 0:
                    for i, (_, lm) in enumerate(res): lumen.paste(lm, (128 * i, 128 * ROWS.index(name)))
            print('ins', vk, lb, flush=True)
        lumen.save(os.path.join(OUT, f'lumen_v{vk}.png'), optimize=True)
    print('lumen rows', ROWS)
print('done →', OUT)
