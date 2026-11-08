#!/usr/bin/env python3
"""產 test_bodyM 磨蹭互動用的兩條圖片條（預產動圖）：陰莖龜頭頂從 TIP0 到 TIP1 每 1 格一張，128×128 橫排。
  rub_closed.png：還沒打開（RUB=5：碰到時大小陰唇包著龜頭、沒碰到是腫脹微張）
  rub_open.png  ：打開後（RUB=6：外翻陰唇＋肉穴，陰莖直接疊在上面）
用法：python3 gen_rub_sheets.py [輸出資料夾，預設 web/test_bodyM]
"""
import os, sys, subprocess, tempfile
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', 'web', 'test_bodyM')
TIP0, TIP1 = 76, 106
tips = list(range(TIP0, TIP1 + 1))
with tempfile.TemporaryDirectory() as td:
    for mode, name in ((5, 'rub_closed.png'), (6, 'rub_open.png')):
        sheet = Image.new('RGBA', (128 * len(tips), 128))
        for i, t in enumerate(tips):
            fp = os.path.join(td, f'{mode}_{t}.png')
            subprocess.run([sys.executable, os.path.join(HERE, 'trace128.py'), fp, '--fill'], check=True,
                           env={**os.environ, 'RUB': str(mode), 'PTIP': str(t)})
            sheet.paste(Image.open(fp).convert('RGBA'), (128 * i, 0))
        sheet.save(os.path.join(OUT, name), optimize=True)
        print(name, sheet.size)
print('tips', TIP0, TIP1)
