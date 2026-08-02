"""人設欄位 → SD tag(plan-v4 §8.3 的 image_job_builder,ComfyUI 專用)

Grok 那條路餵的是中文敘述,因為對面是會讀句子的 agent。SD 系模型不是:
CLIP 對中文幾乎沒有有效編碼,「G 罩杯、傲人豐滿」丟進去約等於沒寫。所以
這裡把抽卡欄位翻成**純英文 Danbooru tag**。

翻譯用精確查表,不做模糊比對:persona_pools.json 裡的字串是固定的廠商件,
查表對得上就是對得上,對不上就是池子被改過——那種情況寧可**丟掉那個欄位並
回報**,也不要把中文原文混進 prompt 假裝有效。unknown 清單會一路傳到
testword 顯示,池子改了你當場就看得到,而不是三個月後才發現圖一直畫錯。

池子改字時,改這裡對應那一行即可(找不到對照 = 該欄位靜靜消失,但會列在
unknown 裡)。
"""

from __future__ import annotations

# ---- 外貌:persona_pools.json female.appearance ----

BUILD = {
    "勻稱有致": "well-proportioned figure",
    "骨感清瘦": "slender, thin",
    "纖細苗條": "slim, slender",
    "嬌小玲瓏": "petite, short",
    "肉感微肉": "plump",
    "微肉圓潤": "chubby, soft body",
    "結實緊緻": "toned, fit",
    "運動健美": "athletic, muscular female, abs",
    "高挑纖長": "tall, long legs, slender",
    "豐滿火辣": "curvy, voluptuous, wide hips",
    "凹凸有致的沙漏身材": "hourglass figure, narrow waist, wide hips",
}

BUST = {
    "A 罩杯、平坦俐落": "flat chest",
    "A 罩杯、小巧清秀": "flat chest",
    "B 罩杯、自然小巧": "small breasts",
    "B 罩杯、剛好一手掌握": "small breasts",
    "C 罩杯、勻稱漂亮": "medium breasts",
    "C 罩杯、圓潤水滴形": "medium breasts",
    "D 罩杯、飽滿有份量": "large breasts",
    "E 罩杯、傲人豐滿": "large breasts",
    "F 罩杯、誇張的巨乳": "huge breasts",
}

EYES = {
    "圓圓的杏眼、很有神": "round eyes, bright eyes",
    "笑起來瞇成月牙": "closed eyes, smile",
    "細長的丹鳳眼": "narrow eyes, almond-shaped eyes",
    "下垂眼、看起來很溫柔": "tareme, droopy eyes",
    "大眼睛、睫毛很長": "large eyes, long eyelashes",
    "上揚的狐狸眼、有點媚": "tsurime, fox eyes",
    "瞳色偏淺、像貓": "pale eyes, slit pupils",
    "含情的桃花眼、天生勾人": "bedroom eyes, half-closed eyes",
}

HAIR = {
    "烏黑長直髮": "black hair, long hair, straight hair",
    "及肩棕色微捲": "brown hair, shoulder-length hair, wavy hair",
    "俏麗短髮": "short hair, bob cut",
    "栗色大波浪": "brown hair, long hair, big wavy hair",
    "高馬尾、俐落": "high ponytail",
    "亞麻色空氣瀏海": "light brown hair, see-through bangs",
    "黑色丸子頭": "black hair, hair bun",
    "鎖骨長度的內彎髮": "medium hair, collarbone-length hair, inward curl",
}

STYLE = {
    "簡約日系": "simple japanese casual outfit",
    "甜美洋裝風": "sweet frilled dress",
    "街頭 oversize": "oversized streetwear, hoodie",
    "知性 OL": "office lady, blazer, pencil skirt",
    "清新文青": "cardigan, long skirt, bookish outfit",
    "性感俐落": "crop top, tight clothes",
    "森林系": "mori kei, earth tone layered clothing",
    "古著復古": "vintage clothing, retro fashion",
    "甜辣風": "crop top, mini skirt",
    "JK 制服風": "school uniform, serafuku, pleated skirt",
    "運動辣妹": "sports bra, track jacket, gyaru",
    "優雅名媛": "elegant evening dress, pearl necklace",
    "暗黑哥德": "gothic lolita, black dress, lace",
    "Y2K 辣妹": "y2k fashion, low-rise pants, baby tee",
}

# 有些「特徵」畫不出來(聲音、笑聲)——對到空字串,靜靜丟掉,不算 unknown
FEATURE = {
    "左臉笑起來有個酒窩": "dimples",
    "有顆小虎牙": "fang",
    "鎖骨上有一顆痣": "mole on collarbone",
    "眼角有淚痣": "mole under eye",
    "聲音偏甜、有點黏": "",
    "脖子細長好看": "slender neck",
    "手指修長": "long fingers",
    "笑聲很有感染力": "",
    "耳朵很小、容易紅": "small ears, blush",
    "嘴唇飽滿": "full lips",
}

# main.py 的確定性雜湊補的兩組(池子裡沒有,同一人設永遠推出同一組)
SKIN = {
    "皮膚白皙": "pale skin",
    "膚色瓷白": "pale skin, porcelain skin",
    "皮膚透白": "pale skin",
    "膚色偏白": "light skin",
    "膚色蜜色": "tan skin",
    "膚色健康小麥": "tan skin",
}

PALETTE = {
    "黑與米白": "black and off-white color scheme",
    "奶油米": "cream and beige color scheme",
    "藏青與白": "navy and white color scheme",
    "霧粉與灰": "dusty pink and grey color scheme",
    "橄欖綠與卡其": "olive green and khaki color scheme",
    "酒紅與炭灰": "wine red and charcoal color scheme",
    "天藍與白": "sky blue and white color scheme",
    "薰衣草紫與銀灰": "lavender and silver grey color scheme",
}

# ---- 取景。part 對應分段生圖的六段,framing 對應整張 ----

FRAMING = {
    "half": "upper body",
    "full": "full body",
}

PART_FRAMING = {
    "head0": "portrait, face focus, head and shoulders",
    "head": "portrait, face focus, head and shoulders",
    "bust0": "upper body, from below, head out of frame",
    "bust": "upper body, head out of frame",
    "lower0": "lower body, from waist down, head out of frame",
    "lower": "lower body, from waist down, head out of frame",
}

ART_STYLE = {
    "anime": "anime style",
    "realistic": "photorealistic, realistic",
    "pixel": "pixel art",
}

# Illustrious / SDXL 系的品質前綴。放最前面權重最高。
QUALITY_PREFIX = "masterpiece, best quality, amazing quality, very aesthetic"

# 分級 tag。Illustrious 認 general/sensitive/nsfw 這組。
# (跟 Grok 那條路不同:那邊寫分級字眼會被擋,SD 沒有這個問題,寫了反而更準)
RATING = {"sfw": "general", "nsfw": "nsfw"}

NEGATIVE = (
    "worst quality, bad quality, low quality, lowres, jpeg artifacts, "
    "signature, watermark, username, text, error, "
    "bad anatomy, bad hands, extra digits, fewer digits, missing fingers, "
    "extra limbs, mutated hands, deformed"
)

# 她們是被擄來改造的,不是人類 —— 立繪要有魔的痕跡
SUCCUBUS_TAGS = "demon girl, succubus, demon horns, pointy ears"


def _look(ch: dict) -> dict:
    look = ch.get("look")
    return look if isinstance(look, dict) else {}


def build_prompt(
    character: dict | None,
    *,
    part: str = "",
    framing: str = "half",
    rating: str = "sfw",
    art_style: str = "anime",
    skin: str = "",
    palette: str = "",
    succubus: bool = True,
    dressed: bool = True,
    extra: str = "",
) -> tuple[str, list[str]]:
    """回 (positive prompt, 查不到對照的原文清單)。

    分段(part)時只放該段真的要畫的欄位——整張畫時模型會把所有特徵糊在一起,
    這是分段生圖存在的理由,tag 版本要維持同樣的取捨。

    dressed=False(第一輪素體)時不放服裝欄位。跟中文那版一樣,靠「不提衣服」
    而不是「說不要衣服」——講到服裝的抽象詞只會讓模型自己補一件上去。
    """
    ch = character if isinstance(character, dict) else {}
    look = _look(ch)
    unknown: list[str] = []

    def tr(table: dict, key: str) -> str:
        raw = str(look.get(key) or "").strip() if key in look or key in (
            "build", "bust", "eyes", "hair", "style", "feature"
        ) else ""
        if not raw:
            return ""
        if raw in table:
            return table[raw]
        unknown.append(f"{key}: {raw}")
        return ""

    bits: list[str] = [QUALITY_PREFIX, "1girl, solo"]
    if succubus:
        bits.append(SUCCUBUS_TAGS)

    p = (part or "").lower()
    seg = p.rstrip("0") if p else ""

    # 取景先寫,模型才知道要畫哪一塊
    if p in PART_FRAMING:
        bits.append(PART_FRAMING[p])
    else:
        bits.append(FRAMING.get(framing, "upper body"))

    if not p or seg == "head":
        bits += [tr(EYES, "eyes"), tr(HAIR, "hair"), tr(FEATURE, "feature")]
        if not p:
            bits.append("looking at viewer")
    if not p or seg == "bust":
        bits += [tr(BUST, "bust")]
    if not p or seg in ("bust", "lower"):
        bits += [tr(BUILD, "build")]
    if p and seg == "lower":
        h = look.get("height_cm")
        if h:
            bits.append("long legs" if int(h or 0) >= 170 else "short stature")

    if not p or seg in ("bust", "lower"):
        bits.append(SKIN.get(skin, "") if skin else "")
        if skin and skin not in SKIN:
            unknown.append(f"skin: {skin}")

    if dressed:
        bits.append(tr(STYLE, "style"))
        if palette:
            if palette in PALETTE:
                bits.append(PALETTE[palette])
            else:
                unknown.append(f"palette: {palette}")

    bits.append(ART_STYLE.get(art_style, ""))
    bits.append(RATING.get((rating or "sfw").lower(), ""))
    if extra.strip():
        bits.append(extra.strip())

    # 去重但保留順序:tag 重複不會加權,只會擠掉 CLIP 的 77 token 額度
    seen: set[str] = set()
    out: list[str] = []
    for chunk in bits:
        for tag in str(chunk).split(","):
            t = tag.strip()
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
    return ", ".join(out), unknown
