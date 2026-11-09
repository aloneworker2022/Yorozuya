#!/usr/bin/env python3
"""產 test_bodyM 磨蹭互動用的兩條圖片條（預產動圖）：陰莖龜頭頂從 TIP0 到 TIP1 每 1 格一張，128×128 橫排。
  rub_closed.png：還沒打開（RUB=5：碰到時大小陰唇包著龜頭、沒碰到是腫脹微張）
  rub_open.png  ：打開後（RUB=6：外翻陰唇＋肉穴，陰莖直接疊在上面）
  rub_open_a35.png／rub_open_a70.png：打開的過渡幀（OPEN_AMT＝0.35／0.7），讓打開滑順
  rub_insert.png：插入（RUB=8，龜頭頂 INS0～INS1；龜頭進去後才有陰道子宮剖面透視）
  rub_insert_g1～g3.png：插著的反應 1～3 階（GRIP＝AROUSE＝階/3：陰道收緊、陰道口那圈纏住、陰道勃起變長）
  rub_insert_g1p～g3p.png：同上、往外抽的那一下（PULL=1：陰道口那圈黏著莖被拖出來）
用法：python3 gen_rub_sheets.py [輸出資料夾，預設 web/test_bodyM]
"""
import os, sys, subprocess, tempfile
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'web', 'test_bodyM')
TIP0, TIP1 = 76, 106
INS0, INS1 = 54, 84                                       # 插入：龜頭頂 54（頂到子宮頸再往裡推 6 格，子宮被壓扁）～84（剛進肉穴口）
tips = list(range(TIP0, TIP1 + 1))
with tempfile.TemporaryDirectory() as td:
    jobs = [(5, 'rub_closed.png', 1, {}), (6, 'rub_open.png', 1, {}), (6, 'rub_open_a35.png', .35, {}), (6, 'rub_open_a70.png', .7, {}), (8, 'rub_insert.png', 1, {})]
    for lv in (1, 2, 3):                                  # 插著的反應：陰道收緊＋勃起變長，往外抽那一下另一條
        r = {'GRIP': str(lv / 3), 'AROUSE': str(lv / 3)}
        jobs += [(8, f'rub_insert_g{lv}.png', 1, r), (8, f'rub_insert_g{lv}p.png', 1, {**r, 'PULL': '1'})]
    only = os.environ.get('ONLY')                         # 只重產某幾條（逗號分隔檔名）
    for mode, name, amt, extra in jobs:
        if only and name not in only.split(','): continue
        ts = list(range(INS0, INS1 + 1)) if mode == 8 else tips
        sheet = Image.new('RGBA', (128 * len(ts), 128))
        for i, t in enumerate(ts):
            fp = os.path.join(td, f'{mode}_{t}.png')
            subprocess.run([sys.executable, os.path.join(HERE, 'trace128.py'), fp, '--fill'], check=True,
                           env={**os.environ, 'RUB': str(mode), 'PTIP': str(t), 'OPEN_AMT': str(amt), **extra})
            sheet.paste(Image.open(fp).convert('RGBA'), (128 * i, 0))
        sheet.save(os.path.join(OUT, name), optimize=True)
        print(name, sheet.size)
print('tips', TIP0, TIP1, 'insert', INS0, INS1)
