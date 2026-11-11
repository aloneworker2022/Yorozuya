#!/usr/bin/env python3
"""產「肏」後背像素互動（web/content/sex_pixel_back.js）的圖到 web/sexpix/back/（2026-11-11）。
  her_<陰唇>_up.png   臀部翹起（back128.py）：閉著、打開 0.35、0.7、全開
  her_<陰唇>_mid.png  過渡格（back128_mid.py＝兩張的線取中間值）：閉著、打開
  her_<陰唇>_sb.png   臀部往後（back128_sitback.py，DY＝比翹起往下幾格）：閉著、打開
  her_<陰唇>_sq.png   撞到腹部壓扁（SQUASH 0.6～1.5 六張；上列閉著、下列打開）——果凍晃動輪流播
  ins_v<長度>.png      體內那一層：正面 trace128.py 插入 11 條（insert、g1、g1p、g2、g2p、g2s、g3、g3p、g3s、g3u、g3c，參數跟 gen_sexpix.py 一樣）
                       同一格 XRAY=1 減 XRAY=0 只留透視畫出來的東西；正面座標，龜頭頂 54～84 每格一張（網頁照姿勢平移到背後的肉穴）
陰唇＝line 一線鮑／mid 一般／butterfly 蝴蝶（房間的 labia small／mid／large 對到這三種）；陰道長度＝05／10／15。陰道空間遮罩用正面的 web/sexpix/lumen_v*.png。
用法：python3 gen_sexpix_back.py [輸出資料夾]　　只產一部分：ONLY=her,ins
"""
import os, subprocess, sys
from concurrent.futures import ThreadPoolExecutor
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
TRACE = os.path.join(HERE, '..', 'trace128.py')
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', '..', 'web', 'sexpix', 'back')
os.makedirs(OUT, exist_ok=True)
ONLY = set(filter(None, os.environ.get('ONLY', '').split(',')))
want = lambda k: not ONLY or k in ONLY
TMP = os.path.join(OUT, '_tmp'); os.makedirs(TMP, exist_ok=True)


def run(script, name, **env):
    fp = os.path.join(TMP, name + '.png')
    subprocess.run([sys.executable, os.path.join(HERE, script), fp], check=True, cwd=HERE, stdout=subprocess.DEVNULL,
                   env={**os.environ, 'FILL': '1', **{k: str(v) for k, v in env.items()}})
    im = Image.open(fp).convert('RGBA'); im.load(); os.remove(fp); return im


def strip(ims, cols, rows):
    s = Image.new('RGBA', (128 * cols, 128 * rows))
    for i, im in enumerate(ims): s.paste(im, (128 * (i % cols), 128 * (i // cols)))
    return s


SQ = [.6, .8, 1, 1.1, 1.3, 1.5]
def her(lab):
    up = [run('back128.py', f'{lab}_u0', LAB=lab)] + [run('back128.py', f'{lab}_u{a}', LAB=lab, OPEN=1, OPEN_AMT=a) for a in (.35, .7, 1)]
    mid = [run('back128_mid.py', f'{lab}_m{o}', LAB=lab, **({'OPEN': 1} if o else {})) for o in (0, 1)]
    sb = [run('back128_sitback.py', f'{lab}_s{o}', LAB=lab, **({'OPEN': 1} if o else {})) for o in (0, 1)]
    sq = [run('back128_sitback.py', f'{lab}_q{o}{a}', LAB=lab, SQUASH=a, **({'OPEN': 1} if o else {})) for o in (0, 1) for a in SQ]
    for k, ims, c, r in (('up', up, 4, 1), ('mid', mid, 2, 1), ('sb', sb, 2, 1), ('sq', sq, 6, 2)): strip(ims, c, r).save(os.path.join(OUT, f'her_{lab}_{k}.png'), optimize=True)
    print('her', lab, flush=True)


ROWS = ["insert", "g1", "g1p", "g2", "g2p", "g2s", "g3", "g3p", "g3s", "g3u", "g3c"]
DESC = [0, 0, 0, 7]
def params(name):
    if name == 'insert': return {}
    lv = int(name[1]); r = {'GRIP': lv / 3, 'AROUSE': lv / 3, 'DESC': DESC[lv], 'CLIT': 1, 'SWELL': 1 if lv == 3 else 0}
    r.update({'p': {'PULL': 1}, 's': {'SPASM': 1}, 'u': {'BOB': 1}, 'c': {'CRAMP': 1}}.get(name[2:], {}))
    return r
def inside(job):
    vlen, name, t = job; ims = []
    for xr in ('1', '0'):
        fp = os.path.join(TMP, f'ins_{vlen}_{name}_{t}_{xr}.png')
        env = {**os.environ, 'LONG': '1', 'RUB': '8', 'PTIP': str(t), 'XRAY': xr, 'CLITSIZE': 'none', 'LABIA': 'mid', 'VLEN': vlen, **{k: str(v) for k, v in params(name).items()}}
        subprocess.run([sys.executable, TRACE, fp, '--fill'], check=True, env=env)
        ims.append(Image.open(fp).convert('RGBA')); ims[-1].load(); os.remove(fp)
    a, b = ims; ap, bp = a.load(), b.load()
    d = Image.new('RGBA', (128, 128), (0, 0, 0, 0)); dp = d.load()
    for y in range(88):                                       # 肉穴口以下兩張一樣（陰莖在外面那段）
        for x in range(128):
            if ap[x, y] != bp[x, y]: dp[x, y] = ap[x, y]
    return name, t, d


if want('her'):
    with ThreadPoolExecutor(3) as ex: list(ex.map(her, ['line', 'mid', 'butterfly']))
if want('ins'):
    for vk, vv in (('05', '0.5'), ('10', '1'), ('15', '1.5')):
        sh = Image.new('RGBA', (128 * 31, 128 * len(ROWS)), (0, 0, 0, 0))
        with ThreadPoolExecutor(os.cpu_count() or 4) as ex:
            for name, t, d in ex.map(inside, [(vv, n, t) for n in ROWS for t in range(54, 85)]): sh.paste(d, (128 * (t - 54), 128 * ROWS.index(name)))
        sh.save(os.path.join(OUT, f'ins_v{vk}.png'), optimize=True)
        print('ins', vk, flush=True)
os.rmdir(TMP)
print('done →', OUT)
