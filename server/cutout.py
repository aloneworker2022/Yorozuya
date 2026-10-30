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

# Pillow 是**選配**:少了它只是不去背(圖照樣生得出來,只是留著背景),
# 不該讓整個遊戲伺服器起不來。忘了 pip install 的人會在第一次生圖時看到
# 一行提示,而不是開機就 ModuleNotFoundError。
try:
    from PIL import Image, ImageFilter
    AVAILABLE = True
except ImportError:  # pragma: no cover — 沒裝 Pillow 的環境
    Image = ImageFilter = None  # type: ignore[assignment]
    AVAILABLE = False

# 縮圖倍率:遮罩在 1/MASK_DIV 邊長的圖上算
MASK_DIV = 4
# 但不能無限縮。256×256 的大頭照除以 4 只剩 64 px,一根頭髮還不到一個像素,
# 摳出來的邊會像鋸子。長邊低於這個數就不再縮,寧可多算幾十毫秒。
MASK_MIN = 192
# 與背景色的容差(每通道差值上限)。太小會留一圈殘影,太大會啃到角色
TOLERANCE = 38
# 邊緣羽化:遮罩放大後再模糊這麼多像素,消掉樓梯狀邊緣
FEATHER = 1.2
# 背景遮罩往角色方向多吃幾個像素(在縮圖尺度上算,1 = MaxFilter(3))。
#
# 這是「摳完還留一圈白邊」的解法。SD 出的圖邊緣是反鋸齒過的:角色與背景之間
# 有一兩個像素是兩者的混色,它們既不夠接近背景色(漫延走不過去)、又明顯比
# 角色亮。遮罩剛好停在那圈混色的外側,放大回原尺寸後那一圈就留下來,疊在深色
# 遊戲背景上變成一道白框。往內多吃一點正好把它吃掉,羽化再把接縫抹平。
DILATE = 1


def _bg_color(px, w: int, h: int) -> tuple[int, int, int]:
    """背景基準色:取**外框一整圈的眾數**——模型不一定真的畫白色。

    原本是「四個角落取中位數」,那對大頭照是錯的:head-and-shoulders 構圖的
    左下、右下兩角就是她的肩膀,四取二有一半是人,中位數會挑到角色的顏色,
    接下來漫延去摳的就是角色而不是背景(外框命中率暴跌,整張放棄去背)。

    改看外框一整圈:平背景的立繪不管什麼構圖,那一圈都是背景佔多數。
    量化成 16 階投票挑出眾數桶,再回頭平均桶內的真實像素取回精度。
    """
    from collections import Counter

    step = max(1, (w + h) // 256)   # 大圖抽樣,小圖逐點
    ring = [px[x, y] for x in range(0, w, step) for y in (0, h - 1)]
    ring += [px[x, y] for y in range(0, h, step) for x in (0, w - 1)]
    votes = Counter((p[0] // 16, p[1] // 16, p[2] // 16) for p in ring)
    top = votes.most_common(1)[0][0]
    hits = [p for p in ring if (p[0] // 16, p[1] // 16, p[2] // 16) == top]
    return tuple(sum(p[i] for p in hits) // len(hits) for i in range(3))


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
#
# 這是**半身/全身**的門檻。大頭照要另外放寬:head 是 head and shoulders 的
# 正方形構圖,肩膀本來就會佔滿整條下緣(一條邊 = 整圈的四分之一),拿 0.72
# 去卡它等於「大頭照永遠去不了背」。呼叫端用 border_min 指定,見 PORTRAIT_SHOTS。
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


def cut_background(
    path: Path,
    tol: int = TOLERANCE,
    border_min: float = BORDER_MIN,
    dilate: int = DILATE,
) -> tuple[bool, str]:
    """就地把 path 這張圖去背(轉成 RGBA PNG)。回 (有沒有動它, 說明)。

    三道閘門,任一不過就原圖不動——寧可留著背景,也不要交出一張破圖:
      外框命中率低    模型畫了真實場景,不是我們要的平背景
      摳太少(<8%)   背景本來就不平,摳了只是留一圈殘影
      摳太多(>85%)  角色大概跟背景同色,再摳人就沒了

    border_min 由呼叫端依構圖給:大頭照的肩膀會佔滿下緣,門檻得放寬,
    不然「head 永遠去不了背」(見 comfy.PORTRAIT_SHOTS)。
    """
    if not AVAILABLE:
        return False, "沒裝 Pillow,跳過去背(pip install -r server/requirements.txt)"
    try:
        img = Image.open(path).convert("RGB")
    except Exception as e:  # noqa: BLE001
        return False, f"讀不到圖({type(e).__name__})"

    w, h = img.size
    # 縮到 1/MASK_DIV,但長邊不低於 MASK_MIN:256 的大頭照再除以 4 只剩 64,
    # 一撮頭髮不到一個像素,摳出來的邊會像鋸子。
    div = max(1, min(MASK_DIV, max(1, max(w, h) // MASK_MIN)))
    sw, sh = max(8, w // div), max(8, h // div)
    small = img.resize((sw, sh), Image.BILINEAR)
    mask = _edge_mask(small, tol)

    border = _border_ratio(mask)
    if border < border_min:
        return False, f"外框只有 {border:.0%} 是背景(門檻 {border_min:.0%}),不是平背景,保留原圖"
    cov = _coverage(mask)
    if cov < 0.08:
        return False, f"背景不夠平,只能摳掉 {cov:.0%},保留原圖"
    if cov > 0.85:
        return False, f"會摳掉 {cov:.0%},角色大概跟背景同色,保留原圖"

    # 背景區往角色多吃 dilate 圈,把反鋸齒留下的那道白邊一起帶走(見 DILATE)
    if dilate > 0:
        mask = mask.filter(ImageFilter.MaxFilter(2 * int(dilate) + 1))
    big = mask.resize((w, h), Image.BILINEAR).filter(ImageFilter.GaussianBlur(FEATHER))
    out = img.convert("RGBA")
    out.putalpha(Image.eval(big, lambda v: 255 - v))
    # optimize:立繪要透過 Tailscale 傳到手機,而且看板娘每次進分頁都要載。
    # 去背後大片透明區壓縮率很好,多花的編碼時間換得到明顯的檔案縮減。
    out.save(path, "PNG", optimize=True)
    return True, f"去背完成(摳掉 {cov:.0%},外框 {border:.0%})"


# ---- 2026-10-21 綠幕去背（換妻咖啡廳立繪）／2026-10-23 改成「取樣背景色＋HSV 色相」色鍵 ----
# 舊版用綠度 G−max(R,B) 做 16–44 的軟邊：模型畫的綠常常不純（偏暗、偏灰、偏藍綠、漸層、雜訊），
# 綠度落在軟邊區間 → 整片背景變成半透明的綠紗。新版：
#  (a) 四邊像素取中位數當背景色，以它的色相為準（不是假設 #00ff00）
#  (b) HSV：色相在背景色相 ±CH_HUE_CORE° 內、飽和度夠 → 全透明；只有色相 ±CH_HUE_SOFT° 或飽和度略低的才給軟邊
#  (c) 從四邊 flood fill 連通的背景色；另外整張找被包住的大塊明顯綠（手臂與身體之間）
#  (d) 留下來的邊緣像素去溢色：G 壓到 max(R, B)
#  (e) 收尾：alpha < CH_VEIL 的背景色像素一律全透明（不留綠紗）
CH_HUE_CORE = 28      # 度
CH_HUE_SOFT = 40      # 度
CH_S_MIN = 30         # 0–255；核心飽和度下限 = clamp(背景 S × 0.45, CH_S_MIN, 60)
CH_V_MIN = 26         # 太暗的不當背景（黑髮、陰影）
CH_VEIL = 102         # 40% alpha
CHROMA_ENCLOSED_MIN = 0.002   # 被包住的綠區至少佔全圖這個比例才當背景
# 舊常數保留給呼叫端（lo／hi 參數不再使用）
CHROMA_LO = 16
CHROMA_HI = 44
CHROMA_ENCLOSED_GD = 70


def _border_keys(W: int, H: int) -> list[int]:
    ks = [x for x in range(W)] + [(H - 1) * W + x for x in range(W)]
    ks += [y * W for y in range(1, H - 1)] + [y * W + W - 1 for y in range(1, H - 1)]
    return ks


def chroma_key(path: Path, lo: int = CHROMA_LO, hi: int = CHROMA_HI) -> tuple[bool, str, Path]:
    """綠幕去背。回 (changed, why, 輸出路徑)；非 PNG 另存成同名 .png。量到的比例放 LAST_CHROMA。"""
    import colorsys
    if not AVAILABLE:
        return False, "沒裝 Pillow", path
    im = Image.open(path).convert("RGBA")
    W, H = im.size
    N = W * H
    hb, sb, vb = (b.tobytes() for b in im.convert("RGB").convert("HSV").split())
    px = im.load()
    border = _border_keys(W, H)
    # (a) 背景色：四邊中位數
    rgb = [px[k % W, k // W] for k in border]
    med = [sorted(c[i] for c in rgb)[len(rgb) // 2] for i in range(3)]
    h0, s0, v0 = colorsys.rgb_to_hsv(*(c / 255 for c in med))
    hue_ok = 60 / 360 <= h0 <= 190 / 360 and s0 >= 0.12
    bh = round((h0 if hue_ok else 1 / 3) * 255)
    s_core = int(max(CH_S_MIN, min(60, s0 * 255 * 0.45)))
    s_soft = int(s_core * 0.6)
    hc, hs = CH_HUE_CORE * 255 // 360, CH_HUE_SOFT * 255 // 360
    # 每點：0 不是背景色、1 軟邊、2 核心；soft 的 alpha 另算
    cls = bytearray(N)
    alpha = bytearray(b"\xff") * N
    for k in range(N):
        if vb[k] < CH_V_MIN or sb[k] < s_soft:
            continue
        d = abs(hb[k] - bh); d = 256 - d if d > 128 else d
        if d > hs:
            continue
        if d <= hc and sb[k] >= s_core:
            cls[k] = 2; alpha[k] = 0
        else:
            fh = 0.0 if d <= hc else (d - hc) / max(1, hs - hc)
            fs = 0.0 if sb[k] >= s_core else (s_core - sb[k]) / max(1, s_core - s_soft)
            cls[k] = 1; alpha[k] = min(255, int(255 * max(fh, fs)))
    border_green = sum(1 for k in border if cls[k]) / len(border) if border else 0.0
    # (c) flood fill
    bg = bytearray(N)
    q = deque(k for k in border if cls[k])
    while q:
        k = q.pop()
        if bg[k] or not cls[k]:
            continue
        bg[k] = 1
        x = k % W
        if x > 0: q.append(k - 1)
        if x < W - 1: q.append(k + 1)
        if k >= W: q.append(k - W)
        if k < N - W: q.append(k + W)
    seen = bytearray(N)
    for s in range(N):
        if bg[s] or seen[s] or cls[s] != 2:
            continue
        comp = []; q.append(s); seen[s] = 1
        while q:
            k = q.pop(); comp.append(k)
            x = k % W
            for n in ((k - 1) if x > 0 else -1, (k + 1) if x < W - 1 else -1, k - W, k + W):
                if 0 <= n < N and not seen[n] and not bg[n] and cls[n]:
                    seen[n] = 1; q.append(n)
        if len(comp) >= N * CHROMA_ENCLOSED_MIN and sum(1 for k in comp if cls[k] == 2) >= 0.7 * len(comp):
            for k in comp:
                bg[k] = 1
    changed = removed = 0
    for k in range(N):
        x, y = k % W, k // W
        if bg[k]:
            a = alpha[k]
            if a < CH_VEIL:          # (e) 不留綠紗
                a = 0
        else:
            edge = (x > 0 and bg[k - 1]) or (x < W - 1 and bg[k + 1]) or (k >= W and bg[k - W]) or (k < N - W and bg[k + W])
            if not edge:
                continue
            a = 255
        r, g, b, a0 = px[x, y]
        m = r if r > b else b
        if g > m:                    # (d) 去溢色
            g = m
        a = min(a, a0)
        px[x, y] = (r, g, b, a)
        changed += 1
        if a == 0:
            removed += 1
    removed_r = removed / N if N else 0.0
    LAST_CHROMA.clear()
    LAST_CHROMA.update({"border_green": round(border_green, 4), "removed": round(removed_r, 4),
                        "bg_rgb": med, "bg_hue": round(h0 * 360), "bg_ok": hue_ok})
    tag = f"背景色 #{med[0]:02x}{med[1]:02x}{med[2]:02x} 色相 {round(h0 * 360)}°、四邊綠 {border_green:.0%}"
    if not removed:
        return False, f"沒有綠色背景（{tag}）", path
    out = path if path.suffix.lower() == ".png" else path.with_suffix(".png")
    im.save(out)
    return True, f"綠幕去背（{tag}、摳掉 {removed_r:.0%}）", out


LAST_CHROMA: dict = {}   # 最近一次 chroma_key 量到的 {border_green, removed, bg_rgb, bg_hue, bg_ok}（/api/cutout 回給前端顯示）
