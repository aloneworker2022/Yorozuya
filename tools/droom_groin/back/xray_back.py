"""背後體位的陰道子宮透視：直接用正面現行的透視（tools/droom_groin/trace128.py，RUB=8 還沒插、XRAY=1 和 XRAY=0 相減出來的那一層
front_xray_layer.png：漏斗形子宮＋輸卵管卵巢＋子宮頸＋一條有皺褶的陰道），整層上下平移，讓陰道下端接到背後這張的陰唇開口。"""
import os
from PIL import Image
N = 128
BG = (40, 34, 50)
LAYER_BOT = 85          # 那一層陰道最下面一列


def xray(im, bot_y, skip_rows=()):
    lay = Image.open(os.path.join(os.path.dirname(os.path.abspath(__file__)), 'front_xray_layer.png')).convert('RGBA'); lp = lay.load()
    px = im.load(); dy = bot_y - LAYER_BOT
    for y in range(N):
        for x in range(N):
            c = lp[x, y]; ty = y + dy
            if not c[3] or not 0 <= ty < N or ty in skip_rows: continue
            if px[x, ty][:3] in (BG, (255, 255, 255)): continue
            px[x, ty] = c
    return im
