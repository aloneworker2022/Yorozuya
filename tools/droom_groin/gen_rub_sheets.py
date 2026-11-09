#!/usr/bin/env python3
"""產 test_bodyM 磨蹭互動用的兩條圖片條（預產動圖）：陰莖龜頭頂從 TIP0 到 TIP1 每 1 格一張，128×128 橫排。
  rub_closed.png：還沒打開（RUB=5：碰到時大小陰唇包著龜頭、沒碰到是腫脹微張）
  rub_open.png  ：打開後（RUB=6：外翻陰唇＋肉穴，陰莖直接疊在上面）
  rub_open_a35.png／rub_open_a70.png：打開的過渡幀（OPEN_AMT＝0.35／0.7），讓打開滑順
  rub_insert.png：插入（RUB=8，龜頭頂 INS0～INS1；龜頭進去後才有陰道子宮剖面透視）
  rub_insert_g1～g3.png：插著的反應 1～3 階（GRIP＝AROUSE＝階/3：陰道收緊、陰道口那圈纏住、陰道勃起變長）
  rub_insert_g1p～g3p.png：同上、往外抽的那一下（PULL=1：陰道口那圈黏著莖被拖出來）
  rub_insert_g2s／g3s.png：2、3 階的痙攣那一下（SPASM=1：陰道因為興奮一抖一抖鎖緊，網頁一陣一陣跟平常那條交替）
  rub_insert_g3u.png：3 階子宮口吸吮往上那一下（BOB=1：子宮口往上縮、頸口張開；網頁上下交替吸陰道裡的精液）
  rub_open_e.png：打開後陰蒂勃起（CLIT=1；反應 1 階以上、還沒插進去時用）
  1 階起陰蒂勃起（CLIT=1）；3 階子宮腫脹（SWELL=1）、子宮口下降 DESC＝7 格（整個子宮降下來）；龜頭頂到子宮口就畫子宮口親著龜頭（愛心網頁畫）
  rub_insert_lumen.png：上面插入那 10 條的陰道空間遮罩（一條一列，照 LUMEN_ROWS 順序；紅＝陰道裡空著、綠＝子宮腔）——網頁讓內射的精液照陰道形狀流
用法：python3 gen_rub_sheets.py [輸出資料夾，預設 web/test_bodyM]
"""
import os, sys, subprocess, tempfile
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'web', 'test_bodyM')
TIP0, TIP1 = 76, 106
# 高潮分階段（使用者）：1 陰唇外翻（打開）→ 2 陰蒂勃起（反應 1 階）→ 3 陰道痙攣（2 階）→ 4 子宮腫脹、下降、吸吮（3 階）
DESC_BY_LV = [0, 0, 0, 7]                                 # 子宮口下降幾格（跟網頁 DESC_BY_LV 一樣）
INS0, INS1 = 54, 84                                       # 插入：龜頭頂 54（頂到子宮頸再往裡推 6 格，子宮被壓扁）～84（剛進肉穴口）
tips = list(range(TIP0, TIP1 + 1))
with tempfile.TemporaryDirectory() as td:
    jobs = [(5, 'rub_closed.png', 1, {}), (6, 'rub_open.png', 1, {}), (6, 'rub_open_a35.png', .35, {}), (6, 'rub_open_a70.png', .7, {}), (6, 'rub_open_e.png', 1, {'CLIT': '1'}), (8, 'rub_insert.png', 1, {})]
    for lv in (1, 2, 3):                                  # 插著的反應：陰道收緊＋勃起變長，往外抽那一下另一條
        r = {'GRIP': str(lv / 3), 'AROUSE': str(lv / 3), 'DESC': str(DESC_BY_LV[lv]), 'CLIT': '1', 'SWELL': '1' if lv == 3 else '0'}
        jobs += [(8, f'rub_insert_g{lv}.png', 1, r), (8, f'rub_insert_g{lv}p.png', 1, {**r, 'PULL': '1'})]
        if lv >= 2: jobs.append((8, f'rub_insert_g{lv}s.png', 1, {**r, 'SPASM': '1'}))
        if lv == 3: jobs.append((8, f'rub_insert_g{lv}u.png', 1, {**r, 'BOB': '1'}))
    LUMEN_ROWS = [n for (m, n, a, e) in jobs if m == 8]
    lumen = Image.new('RGB', (128 * (INS1 - INS0 + 1), 128 * len(LUMEN_ROWS)), (0, 0, 0))
    only = os.environ.get('ONLY')                         # 只重產某幾條（逗號分隔檔名）
    for mode, name, amt, extra in jobs:
        if only and name not in only.split(','): continue
        ts = list(range(INS0, INS1 + 1)) if mode == 8 else tips
        sheet = Image.new('RGBA', (128 * len(ts), 128))
        for i, t in enumerate(ts):
            fp = os.path.join(td, f'{mode}_{t}.png')
            subprocess.run([sys.executable, os.path.join(HERE, 'trace128.py'), fp, '--fill'], check=True,
                           env={**os.environ, 'RUB': str(mode), 'PTIP': str(t), 'OPEN_AMT': str(amt), **extra,
                                **({'LUMEN_OUT': fp + '.lumen.png'} if mode == 8 else {})})
            sheet.paste(Image.open(fp).convert('RGBA'), (128 * i, 0))
            if mode == 8: lumen.paste(Image.open(fp + '.lumen.png'), (128 * i, 128 * LUMEN_ROWS.index(name)))
        sheet.save(os.path.join(OUT, name), optimize=True)
        print(name, sheet.size)
    if not only or 'lumen' in only:
        lumen.save(os.path.join(OUT, 'rub_insert_lumen.png'), optimize=True)
        print('rub_insert_lumen.png', lumen.size, LUMEN_ROWS)
print('tips', TIP0, TIP1, 'insert', INS0, INS1)
