"""把生成圖的平背景去掉,換成透明(立繪去背)

SD 畫不出 alpha 通道,所以做法是:prompt 要一個**平的單色背景**
(`simple background, white background` 是 danbooru 訓練得很紮實的一組),
生完之後在這裡把那塊背景摳掉。

摳法是**從四邊往內漫延**,不是「顏色接近白就砍」。差別在角色身上的白:
白襯衫、白髮、眼睛的高光都可能接近背景色,單純比顏色會把她挖出一堆洞。
從邊緣漫延只會吃掉「連通到畫面外緣」的那一塊,身體內部的白動不到。

漫延在**縮小過的圖上跑**(1/4 邊長,約六萬像素),純 Python BFS 也只要
幾十毫秒;算完的遮罩再放大回原尺寸,雙線性插值順便給邊緣一點羽化,
比在原圖上硬切還自然(頭髮邊緣不會有鋸齒白邊)。

背景色不寫死白色:取四個角落的中位數當基準。模型偶爾不理會 white
background 而畫成淺灰或淺藍,這樣一樣摳得掉。
"""

from __future__ import annotations

from collections import deque
from pathlib import Path

from PIL import Image

# 縮圖倍率:遮罩在 1/MASK_DIV 邊長的圖上算
MASK_DIV = 4
# 與背景色的容差(每通道差值上限)。太小會留一圈殘影,太大會啃到角色
TOLERANCE = 38
# 邊緣羽化:遮罩放大後再模糊這麼多像素,消掉樓梯狀邊緣
FEATHER = 1.2


def _bg_color(px, w: int, h: int) -> tuple[int, int, int]:
    """四個角落取中位數當背景基準色——模型不一定真的畫白色。"""
    corners = [px[0, 0], px[w - 1, 0], px[0, h - 1], px[w - 1, h - 1]]
    return tuple(sorted(c[i] for c in corners)[1] for i in range(3))


def _near(a, b, tol: int) -> bool:
    return abs(a[0] - b[0]) <= tol and abs(a[1] - b[1]) <= tol and abs(a[2] - b[2]) <= tol


def _edge_mask(small: Image.Image, tol: int) -> Image.Image:
    """回一張 L 模式遮罩:255 = 背景(要變透明),0 = 保留。"""
    w, h = small.size
    px = small.load()
    bg = _bg_color(px, w, h)
    seen = bytearray(w * h)
    q: deque[tuple[int, int]] = deque()

    def push(x: int, y: int):
        i = y * w + x
        if not seen[i] and _near(px[x, y], bg, tol):
            seen[i] = 1
            q.append((x, y))

    for x in range(w):
        push(x, 0)
        push(x, h - 1)
    for y in range(h):
        push(0, y)
        push(w - 1, y)

    while q:
        x, y = q.popleft()
        if x > 0:
            push(x - 1, y)
        if x < w - 1:
            push(x + 1, y)
        if y > 0:
            push(x, y - 1)
        if y < h - 1:
            push(x, y + 1)

    mask = Image.new("L", (w, h))
    mask.putdata([255 if v else 0 for v in seen])
    return mask


# 外框有多少比例被判定成背景。**這是真正分得出好壞的那道閘門**:
# 漫延只走「接近背景色」的像素,所以摳出來的那塊必然顏色均勻——拿均勻度當
# 判準等於沒判。反過來看外框就很乾脆:平背景的立繪,外圈幾乎整圈都是背景
# (全身站姿踩到下緣頂多吃掉兩成);模型畫了真實場景時,外圈只會零星命中。
BORDER_MIN = 0.72


def _border_ratio(mask: Image.Image) -> float:
    w, h = mask.size
    px = mask.load()
    hits = total = 0
    for x in range(w):
        for y in (0, h - 1):
            total += 1
            hits += px[x, y] > 127
    for y in range(1, h - 1):
        for x in (0, w - 1):
            total += 1
            hits += px[x, y] > 127
    return hits / max(1, total)


def _coverage(mask: Image.Image) -> float:
    data = mask.getdata()
    return sum(1 for v in data if v > 127) / max(1, len(data))


def cut_background(path: Path, tol: int = TOLERANCE) -> tuple[bool, str]:
    """就地把 path 這張圖去背(轉成 RGBA PNG)。回 (有沒有動它, 說明)。

    三道閘門,任一不過就原圖不動——寧可留著背景,也不要交出一張破圖:
      外框命中率低    模型畫了真實場景,不是我們要的平背景
      摳太少(<8%)   背景本來就不平,摳了只是留一圈殘影
      摳太多(>85%)  角色大概跟背景同色,再摳人就沒了
    """
    try:
        img = Image.open(path).convert("RGB")
    except Exception as e:  # noqa: BLE001
        return False, f"讀不到圖({type(e).__name__})"

    w, h = img.size
    sw, sh = max(8, w // MASK_DIV), max(8, h // MASK_DIV)
    small = img.resize((sw, sh), Image.BILINEAR)
    mask = _edge_mask(small, tol)

    border = _border_ratio(mask)
    if border < BORDER_MIN:
        return False, f"外框只有 {border:.0%} 是背景,不是平背景,保留原圖"
    cov = _coverage(mask)
    if cov < 0.08:
        return False, f"背景不夠平,只能摳掉 {cov:.0%},保留原圖"
    if cov > 0.85:
        return False, f"會摳掉 {cov:.0%},角色大概跟背景同色,保留原圖"

    from PIL import ImageFilter
    big = mask.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(FEATHER))
    out = img.convert("RGBA")
    out.putalpha(Image.eval(big, lambda v: 255 - v))
    # optimize:立繪要透過 Tailscale 傳到手機,而且看板娘每次進分頁都要載。
    # 去背後大片透明區壓縮率很好,多花的編碼時間換得到明顯的檔案縮減。
    out.save(path, "PNG", optimize=True)
    return True, f"去背完成(摳掉 {cov:.0%})"
