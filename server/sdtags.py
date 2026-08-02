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

# 臉是最看得出「有沒有在畫同一個人」的地方,所以拆成五軸各 18 項:
# 眼睛 / 嘴巴 / 臉型 / 髮型 / 髮色。只寫「長相」,表情由個性原型另外給。
EYES = {
    "圓圓的杏眼、很有神": "round eyes, bright eyes",
    "笑起來瞇成月牙": "closed eyes, smile",
    "標準的杏仁眼、眼皮乾淨": "almond-shaped eyes, neat eyelids",
    "單眼皮、看起來有點冷": "monolid, narrow eyes",
    "內雙、笑起來眼尾會彎": "thin eyelid crease, gentle eyes",
    "半睜的睡眼、總像沒睡飽": "sleepy eyes, half-closed eyes",
    "三白眼、看人有點凶": "sanpaku, sharp eyes",
    "沒什麼情緒的死魚眼": "jitome, expressionless eyes",
    "細長的丹鳳眼": "narrow eyes, slanted eyes",
    "下垂眼、看起來很溫柔": "tareme, droopy eyes",
    "圓瞳大眼、像小動物": "round pupils, large eyes",
    "眼尾微揚、有點鋒利": "tsurime, upturned eyes",
    "大眼睛、睫毛很長": "large eyes, long eyelashes",
    "上揚的狐狸眼、有點媚": "tsurime, fox eyes",
    "濕潤的淚眼、總像剛哭過": "teary eyes, wet eyes",
    "瞳色偏淺、像貓": "pale eyes, slit pupils",
    "含情的桃花眼、天生勾人": "bedroom eyes, half-closed eyes",
    "深邃的雙眼皮大眼、眼窩有陰影": "deep-set eyes, large eyes, defined eyelids",
}

MOUTH = {
    "小巧的櫻桃小嘴": "small mouth, cherry lips",
    "飽滿的厚唇": "thick lips, full lips",
    "薄唇、線條俐落": "thin lips",
    "微微上揚的嘴角": "slight smile, upturned mouth",
    "嘴角天生下垂": "frown, downturned mouth",
    "明顯的唇珠": "cupid's bow, defined lips",
    "花瓣一樣的唇形": "petal-shaped lips, soft lips",
    "常常微張的唇": "parted lips",
    "抿著嘴、話不多": "closed mouth, pursed lips",
    "笑起來露出整排牙": "open mouth, wide smile, teeth",
    "唇色偏淡、像沒血色": "pale lips",
    "唇色紅潤、像抹了口紅": "red lips, glossy lips",
    "幾乎不上妝的素唇": "bare lips, no lipstick",
    "咬唇的習慣": "biting own lip",
    "有點嘟的唇、像在撒嬌": "pout, puckered lips",
    "唇形寬、笑起來很大方": "wide mouth, big smile",
    "下唇比上唇厚": "full lower lip",
    "嘴角有顆小痣": "mole near mouth",
}

FACE = {
    "標準的鵝蛋臉": "oval face",
    "圓潤的圓臉": "round face, soft cheeks",
    "稍長的長臉": "long face",
    "尖下巴的瓜子臉": "pointed chin, v-shaped jaw",
    "方一點的鵝蛋臉、線條清楚": "oval face, defined jawline",
    "下顎線俐落": "sharp jawline",
    "顴骨明顯": "high cheekbones",
    "臉頰有嬰兒肥": "chubby cheeks",
    "臉小、五官集中": "small face, delicate features",
    "額頭飽滿": "broad forehead",
    "額頭窄、常被瀏海蓋住": "narrow forehead, covered forehead",
    "鼻樑高挺": "high nose bridge",
    "鼻頭小巧": "small nose",
    "輪廓深、五官立體": "defined facial features, deep-set features",
    "五官偏平、乾淨清秀": "flat facial features, plain pretty face",
    "臉頰有雀斑": "freckles",
    "皮膚薄、容易泛紅": "flushed cheeks, blush",
    "下巴中間有一道淺溝": "cleft chin",
}

# 髮型只講形狀,顏色歸 HAIR_COLOR。舊存檔的 hair 是「顏色+形狀」混在一起的
# 那八項,留在表尾當相容鍵——刪了舊角色的頭髮就會靜靜消失。
HAIR = {
    "及腰長直髮": "very long hair, straight hair",
    "及肩微捲": "shoulder-length hair, wavy hair",
    "俏麗短髮": "short hair, bob cut",
    "大波浪捲": "long hair, big wavy hair",
    "高馬尾": "high ponytail, long hair",
    "低馬尾": "low ponytail",
    "雙馬尾": "twintails",
    "丸子頭": "hair bun",
    "雙丸子頭": "double bun",
    "空氣瀏海長髮": "see-through bangs, long hair",
    "齊瀏海公主切": "blunt bangs, hime cut",
    "旁分無瀏海": "parted bangs, forehead",
    "中分長髮": "center-parted hair, long hair",
    "鎖骨長度的內彎髮": "medium hair, collarbone-length hair, inward curl",
    "俐落短鮑伯": "bob cut, short hair, straight hair",
    "一條麻花辮": "single braid, braided hair",
    "兩側編辮的長髮": "braided sidelocks, long hair",
    "隨手綁起的亂丸子": "messy bun, messy hair",
    # 舊存檔相容(拆軸前的「顏色+形狀」合寫)
    "烏黑長直髮": "black hair, long hair, straight hair",
    "及肩棕色微捲": "brown hair, shoulder-length hair, wavy hair",
    "栗色大波浪": "brown hair, long hair, big wavy hair",
    "高馬尾、俐落": "high ponytail",
    "亞麻色空氣瀏海": "light brown hair, see-through bangs",
    "黑色丸子頭": "black hair, hair bun",
}

HAIR_COLOR = {
    "烏黑": "black hair",
    "深棕": "dark brown hair",
    "淺棕": "light brown hair",
    "栗色": "chestnut hair, brown hair",
    "亞麻色": "flaxen hair, light brown hair",
    "蜜金色": "honey blonde hair",
    "白金色": "platinum blonde hair",
    "灰白": "grey hair",
    "銀白": "silver hair, white hair",
    "藍黑": "blue-black hair",
    "酒紅": "dark red hair, wine red hair",
    "橘紅": "orange hair",
    "玫瑰粉": "pink hair",
    "薰衣草紫": "lavender hair, light purple hair",
    "薄荷綠": "mint green hair",
    "天空藍": "light blue hair",
    "內層挑染彩色": "multicolored hair, streaked hair, inner hair color",
    "漸層的髮尾": "gradient hair, colored tips",
}

# 個人喜好衣櫃(persona_pools 的 appearance.style)。**這一整組要對得齊**:
# 少一項 = 那套衣服查不到對照 = 墊 CLOTHES_FALLBACK,穿搭就白選了。
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
    "清純鄰家": "simple blouse, long skirt, girl next door",
    "小露性感": "off-shoulder top, short skirt",
    "韓系慵懶": "oversized knit sweater, wide-leg pants, korean fashion",
    "洛麗塔": "lolita fashion, frilled dress, bonnet",
    "極簡冷淡風": "minimalist outfit, monochrome clothing, plain coat",
    "健康陽光": "sporty casual, t-shirt, denim shorts",
    "成熟知性套裝": "tailored suit, silk blouse",
    "可愛甜美": "cute pastel dress, ribbon",
    "輕熟女風": "chic blouse, midi skirt, heels",
}

# 生涯服裝(persona_pools 的 occupations[].outfit)。她被擄來之前每天穿的那身。
# 這一組存在的理由:抽卡抽出「女高中生」卻畫成西裝套裝,是這遊戲最出戲的錯——
# 職業寫在人設裡,衣服卻跟它無關。預設作畫用的就是這套,個人衣櫃要關係夠才解鎖。
CAREER_OUTFIT = {
    "水手服制服": "school uniform, serafuku, pleated skirt",
    "針織衫配牛仔褲的學院便服": "knit sweater, blue jeans, college casual",
    "便利商店制服圍裙": "convenience store uniform, apron, name tag",
    "護士服": "nurse uniform, white dress, nurse cap",
    "咖啡店圍裙配白襯衫": "barista apron, white shirt, rolled up sleeves",
    "西裝外套配襯衫窄裙": "office lady, blazer, white shirt, pencil skirt",
    "寬鬆家居 T 恤配棉褲": "oversized t-shirt, loose cotton pants, homewear",
    "練舞室的短版運動服": "dance practice wear, crop top, jogger pants",
    "開襟針織衫配長裙": "cardigan, long skirt, glasses",
    "隊服外套配耳機": "esports team jacket, gaming headset",
    "烘焙圍裙配頭巾": "baker apron, bandana, flour on clothes",
    "連帽外套配睡褲": "hoodie, pajama pants, indoor wear",
    "工作圍裙配棉麻襯衫": "florist apron, linen shirt",
    "白色廚師服配圍裙": "white chef coat, apron",
    "慵懶寬鬆針織配耳機": "loose knit sweater, headphones",
    "運動內衣配緊身褲": "sports bra, leggings, athletic wear",
    "素色襯衫配西裝褲": "plain blouse, dress pants",
    "卡其色工作服配長靴": "khaki work uniform, cargo pants, boots",
    "皮外套配破牛仔褲": "leather jacket, ripped jeans, boots",
    "印花 T 恤配帽 T": "graphic t-shirt, zip hoodie",
    "全黑俐落套裝": "all black outfit, fitted blazer, slim pants",
    "巫女服(紅袴白衣)": "miko outfit, red hakama, white kimono shirt",
    "排練用的寬鬆黑衣": "black rehearsal clothes, loose top, leggings",
    "素色 polo 衫配長褲": "polo shirt, slacks",
    "防水圍裙配長筒膠靴": "rubber apron, rain boots, work clothes",
    "短袖工作服配防水圍裙": "grooming smock, waterproof apron",
    "樸素襯衫配及膝裙": "plain button shirt, knee-length skirt",
    "背心配襯衫領結": "bartender vest, white shirt, bow tie",
    "白袍配保暖外套": "lab coat, warm jacket",
    "極簡剪裁的拍攝套裝": "minimalist fashion outfit, tailored coat",
    "舒適便服配耳機": "comfortable casual clothes, headphones",
    "中式對襟工作服": "chinese style tunic, massage therapist uniform",
    "薄綢短浴袍": "thin silk robe, short robe",
    "貼身泳裝式制服": "one-piece swimsuit uniform",
    "亮片小禮服": "sequin cocktail dress",
    "貼身洋裝配高跟鞋": "tight mini dress, high heels",
    "展場短版制服": "showgirl outfit, crop top uniform, mini skirt",
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
    "後頸有一顆小痣": "mole on nape",
    "嘴唇飽滿": "full lips",   # 舊存檔相容:嘴巴獨立成一軸後,這項已移出池子
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

# ---- 特殊屬性(special_traits):**贏過一般抽卡欄位** ----
#
# 抽到「巨乳」卻在人設寫 B 罩杯,兩個都塞進 prompt 只會得到一張兩邊都不像的圖。
# 特殊屬性是稀有度算分的來源、是玩家真正記得的那一條,所以它說了算:
# 有 override 的那幾項會把對應的一般欄位**整個換掉**,不是疊加。
#
# 三欄:(SD tag, 放進哪一段, 蓋掉哪些一般欄位)
#   段 —— head / bust / lower;"" = 畫不出來(聲音、體香、體質),靜靜丟掉
#   蓋 —— eyes / mouth / hair / bust / build / skin,可多個
#
# 只有「真的規定了尺寸或顏色」的才蓋。「形狀漂亮的美胸」沒說幾罩杯,疊上去就好;
# 「巨乳」說了,那 B 罩杯就得讓位。
SPECIAL: dict[str, tuple[str, str, tuple[str, ...]]] = {
    # 普通
    "紅潤飽滿的雙唇": ("full lips, red lips", "head", ("mouth",)),
    "白皙細嫩的皮膚": ("pale skin, smooth skin", "bust", ("skin",)),
    "筆直美腿": ("straight legs, beautiful legs", "lower", ()),
    "纖細小蠻腰": ("narrow waist", "bust", ()),
    "形狀漂亮的美胸": ("well-shaped breasts", "bust", ()),
    "水潤的杏眼": ("almond-shaped eyes, glossy eyes", "head", ("eyes",)),
    "明顯精緻的鎖骨": ("visible collarbone", "bust", ()),
    "白皙修長的脖頸": ("slender neck, pale neck", "head", ()),
    "柔順的長髮": ("long hair, silky hair", "head", ("hair",)),
    "甜美的少女嗓": ("", "", ()),
    # 稀有
    "巨乳": ("huge breasts", "bust", ("bust",)),
    "修長大長腿": ("long legs", "lower", ()),
    "緊實蜜大腿": ("thick thighs, toned thighs", "lower", ()),
    "渾圓翹臀": ("round ass, curvy hips", "lower", ()),
    "古銅小麥膚色": ("tan skin, dark skin", "bust", ("skin",)),
    "細腰豐臀的沙漏身材": ("hourglass figure, narrow waist, wide hips", "bust", ("build",)),
    "水汪汪的大眼": ("large eyes, sparkling eyes", "head", ("eyes",)),
    "深邃的事業線": ("deep cleavage", "bust", ()),
    "性感的馬甲線": ("toned abs, defined waistline", "bust", ()),
    "光滑無暇的美背": ("smooth back, bare back", "bust", ()),
    "軟糯敏感的耳垂": ("", "", ()),
    "淡淡的奶香體味": ("", "", ()),
    "帶點鼻音的甜膩奶音": ("", "", ()),
    "豐潤圓翹的唇珠": ("full lips, prominent cupid's bow", "head", ("mouth",)),
    # 史詩
    "白皙大長腿": ("long legs, pale legs", "lower", ()),
    "沉甸甸的下垂巨乳": ("huge breasts, sagging breasts", "bust", ("bust",)),
    "粉嫩飽滿、面積偏大的乳暈": ("large areolae, pink areolae", "bust", ()),
    "粉嫩挺立的乳尖": ("pink nipples, erect nipples", "bust", ()),
    "通透的雪白肌膚": ("very pale skin, translucent skin", "bust", ("skin",)),
    "湛藍色的眼睛": ("blue eyes", "head", ()),
    "爆乳配上不科學的細腰": (
        "gigantic breasts, extremely narrow waist", "bust", ("bust", "build")),
    "一捏會陷下去的綿密酥胸": ("soft breasts", "bust", ()),
    "極度敏感、一碰就軟的體質": ("", "", ()),
    "勾魂的沙啞低喘嗓": ("", "", ()),
    "天生會勾人的費洛蒙體香": ("", "", ()),
    "漫畫般凹陷的反差腰窩": ("back dimples, deep waistline", "bust", ()),
    "緊緻飽滿的水蜜桃臀": ("peach shaped ass, firm ass", "lower", ()),
    # 傳說
    "赤紅色的眼睛": ("red eyes", "head", ()),
    "左右異色的雙瞳": ("heterochromia", "head", ()),
    "宛如模特兒的黃金三圍": (
        "model figure, perfect proportions, hourglass figure", "bust", ("build",)),
    "吹彈可破、會發光似的奶白肌": ("flawless milky skin, glowing skin", "bust", ("skin",)),
    "傳說級的名器體質": ("", "", ()),
    "全身佈滿敏感帶的淫紋體質": ("", "", ()),
    "雌性費洛蒙濃到讓人失神的體香": ("", "", ()),
    "豐乳肥臀又不科學細腰的魔鬼身材": (
        "huge breasts, wide hips, extremely narrow waist, voluptuous", "bust", ("bust", "build")),
}


def special_names(character: dict | None) -> list[str]:
    """把 specialTraits 攤成名字清單(存檔裡是 [{name,rarity,cat}],舊檔可能是字串)。"""
    out: list[str] = []
    ch = character if isinstance(character, dict) else {}
    for t in ch.get("specialTraits") or ch.get("special_traits") or []:
        name = (t.get("name") if isinstance(t, dict) else str(t) or "").strip()
        if name:
            out.append(name)
    return out


def resolve_specials(character: dict | None) -> tuple[dict[str, list[str]], set[str], list[str]]:
    """回 (每段的特殊屬性 tag, 被蓋掉的一般欄位, 查不到對照的原文)。

    這是「特殊屬性說了算」的唯一判定處——兩條生圖路都走這裡拿同一份答案,
    免得 ComfyUI 畫巨乳、Grok 畫 B 罩杯。
    """
    by_seg: dict[str, list[str]] = {"head": [], "bust": [], "lower": []}
    overridden: set[str] = set()
    unknown: list[str] = []
    for name in special_names(character):
        hit = SPECIAL.get(name)
        if hit is None:
            unknown.append(f"special: {name}")
            continue
        tag, seg, overs = hit
        overridden.update(overs)
        if tag and seg in by_seg:
            by_seg[seg].append(tag)
    return by_seg, overridden, unknown


def overridden_fields(character: dict | None) -> dict[str, str]:
    """回 {被蓋掉的欄位: 蓋掉它的特殊屬性中文名}。

    給中文那條路(Grok)用:它餵的是句子不是 tag,所以做法是把一般欄位的中文
    整個換成特殊屬性的中文,而不是兩句都寫。
    """
    out: dict[str, str] = {}
    for name in special_names(character):
        hit = SPECIAL.get(name)
        if not hit:
            continue
        for key in hit[2]:
            out.setdefault(key, name)
    return out

# ---- 取景。part 對應分段生圖的六段,framing 對應整張 ----

FRAMING = {
    # head 是召喚三連拍的大頭照:名冊縮圖與聊天頭像用,所以要正面看鏡頭
    "head": "portrait, face focus, head and shoulders, looking at viewer",
    "half": "upper body",
    "full": "full body, standing, full body visible, head to feet",
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

# ---- negative ----
#
# **原則:只擋畫崩,不擋內容。**
#
# 早期版本在 SFW 時塞了一整串「nude, nipples, topless, naked…」。那是錯的:
#   1. 分級是**抽卡**在管的(girl_gen 的 nsfw 項目開關),不是靠 negative 擋。
#   2. 服裝現在由生涯服裝/衣櫃釘死,正面就寫著 `fully clothed, nurse uniform`
#      ——衣服已經指定了,再在 negative 喊一次不會更牢。
#   3. negative 不是免費的。Illustrious/Anima 系對 negative 很敏感,塞越多越稀釋,
#      真正要擋的畫崩反而被擠掉。
#
# 下面這組取三邊的交集:animij 作者頁的建議、Anima base 的 README、
# Illustrious 社群通用版。三邊講的都是同一件事——畫質、壓縮瑕疵、手指、
# 簽名浮水印、單色與分鏡。**沒有任何一邊把內容詞寫進 negative。**
NEGATIVE = (
    "worst quality, low quality, lowres, blurry, jpeg artifacts, "
    "chromatic aberration, bad anatomy, bad hands, extra digits, fewer digits, "
    "signature, watermark, artist name, username, "
    "monochrome, greyscale, comic, multiple views"
)

# 美感排序標籤。animij 作者頁與 Anima base 的 README 都把這三個列進建議 negative
# (Pony / Anima 血統的評分 tag)。純 Illustrious 的 checkpoint 吃不到它們,
# 但也就三個 token,留著讓兩種底都吃得到自己那份。
AESTHETIC_NEGATIVE = "score_1, score_2, score_3"

# 去背用的 negative:任何場景元素都會讓外框判定失敗、整張放棄去背
FLAT_BG_NEGATIVE = "scenery, detailed background, indoors, outdoors, gradient background"

# 她們**不是魔物**。world.md:「魅魔不是地獄來的惡魔…那只是他們對你的叫法」,
# 「你原本是現實世界裡一個普通女子——護理師、上班族、插畫家、店員」,
# 「你還是你,只是身體不是了」。職業池也全是現代人:女高中生、護理師、OL、
# 圖書館員。所以立繪就是一個現代成年女性,沒有角、沒有翅膀、沒有尖耳。
# 被改的是感覺與慾望,那些畫不出來,也不該用長角來代替。
HUMAN_TAGS = "adult woman, modern real world woman"

# 只寫在正面「她是人」還不夠——動漫模型看到這種遊戲語境會自己長角。
# 這組留著,因為它擋的正是「畫面跑偏」:長角、長翅膀就是跑偏。
# 但去掉重複下注——`horns` 已經蓋掉 `demon horns`,`wings`/`tail`/`pointy ears`
# 同理,原本十四個詞有一半是同一件事講兩遍,只是在稀釋權重。
NOT_DEMON_NEGATIVE = "horns, pointy ears, wings, tail, demon girl, monster girl"

# 服裝欄位查不到對照時的墊底。沒有任何服裝 tag = 模型自由發揮 = 多半不穿。
CLOTHES_FALLBACK = "casual clothes"

# 年齡:池子抽 18~33(persona_pools 的 age 可調)。**非有不可**——不給年齡,
# 模型畫出來的年紀會隨機漂,同一個人設每次看起來都不同歲數。
# 動漫模型對純數字不太敏感,所以數字之外再補一個檔位形容詞。
AGE_MIN, AGE_MAX = 18, 33


def age_tags(age) -> str:
    try:
        a = int(age)
    except (TypeError, ValueError):
        return ""
    a = max(AGE_MIN, min(AGE_MAX, a))
    if a <= 21:
        band = "young adult"
    elif a <= 26:
        band = "young adult, mature female"
    else:
        band = "mature female, adult face"
    return f"{a} years old, {band}"


# 年紀不要往下漂。正面已經寫了「29 years old, mature female」,這幾個是把
# 臉型與身材比例釘在成人那邊——留擋得住的那幾個就好,`underage` /
# `elementary school student` 這種是內容詞不是畫風詞,模型不太吃,刪掉。
AGE_NEGATIVE = "child, loli, chibi, baby face"


# 要去背的立繪:先要一塊平背景,後製才摳得乾淨
FLAT_BG_TAGS = "simple background, white background, plain background"


def negative_for(flat_bg: bool = False) -> str:
    """組 negative。**不看分級**——分級是抽卡在管的,不是靠 negative 擋內容。

    只有一個變數:要不要去背。要的話多擋場景,不然外框判定會失敗、整張放棄去背。
    """
    bits = [NEGATIVE, AESTHETIC_NEGATIVE, NOT_DEMON_NEGATIVE, AGE_NEGATIVE]
    if flat_bg:
        bits.append(FLAT_BG_NEGATIVE)
    return ", ".join(bits)


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
    age: int | str = "",
    outfit: str = "",
    dressed: bool = True,
    flat_bg: bool = False,
    extra: str = "",
) -> tuple[str, list[str]]:
    """回 (positive prompt, 查不到對照的原文清單)。

    分段(part)時只放該段真的要畫的欄位——整張畫時模型會把所有特徵糊在一起,
    這是分段生圖存在的理由,tag 版本要維持同樣的取捨。

    dressed=False(第一輪素體)時不放服裝欄位。跟中文那版一樣,靠「不提衣服」
    而不是「說不要衣服」——講到服裝的抽象詞只會讓模型自己補一件上去。

    outfit 給值 = 指定要穿的那一套(生涯服裝或個人衣櫃裡的某一套);留空才退回
    look.style。特殊屬性會蓋掉對應的一般欄位,見 resolve_specials。
    """
    ch = character if isinstance(character, dict) else {}
    look = _look(ch)
    unknown: list[str] = []

    # 特殊屬性先算:它蓋掉的欄位下面就不查了(抽到「巨乳」就別再寫 B 罩杯)
    sp_seg, sp_over, sp_unknown = resolve_specials(ch)
    unknown += sp_unknown

    def tr(table: dict, key: str) -> str:
        if key in sp_over:
            return ""   # 讓位給特殊屬性
        raw = str(look.get(key) or "").strip()
        if not raw:
            return ""
        if raw in table:
            return table[raw]
        unknown.append(f"{key}: {raw}")
        return ""

    bits: list[str] = [QUALITY_PREFIX, "1girl, solo", HUMAN_TAGS]
    # 年齡緊接在「她是誰」後面:動漫模型對前段權重高,年紀才壓得住
    bits.append(age_tags(age or look.get("age")))
    # 要去背的那幾張:先讓模型畫出一塊平背景,後製才摳得乾淨(見 cutout.py)。
    # simple background / white background 是 danbooru 訓練得很紮實的一組。
    if flat_bg:
        bits.append(FLAT_BG_TAGS)

    p = (part or "").lower()
    seg = p.rstrip("0") if p else ""

    # 取景先寫,模型才知道要畫哪一塊
    if p in PART_FRAMING:
        bits.append(PART_FRAMING[p])
    else:
        bits.append(FRAMING.get(framing, "upper body"))

    if not p or seg == "head":
        # 臉分五軸(臉型/眼/嘴/髮型/髮色):只寫「大眼睛、長直髮」畫出來的臉
        # 每次都不一樣,細到這個程度才看得出是同一個人。
        bits += [tr(FACE, "face"), tr(EYES, "eyes"), tr(MOUTH, "mouth"),
                 tr(HAIR_COLOR, "hair_color"), tr(HAIR, "hair"), tr(FEATURE, "feature")]
        bits += sp_seg["head"]
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
    if not p or seg == "bust":
        bits += sp_seg["bust"]
    if not p or seg == "lower":
        bits += sp_seg["lower"]

    if not p or seg in ("bust", "lower"):
        if "skin" not in sp_over:
            bits.append(SKIN.get(skin, "") if skin else "")
            if skin and skin not in SKIN:
                unknown.append(f"skin: {skin}")

    if dressed:
        # 沒有任何服裝 tag = 模型自由發揮 = 多半不穿。查不到對照就墊一件,
        # 寧可衣服普通,也不要因為池子改過一個字就整張變裸的。
        worn = (outfit or "").strip() or str(look.get("style") or "").strip()
        tag = CAREER_OUTFIT.get(worn) or STYLE.get(worn) or ""
        if worn and not tag:
            unknown.append(f"outfit: {worn}")
        bits.append("fully clothed, " + (tag or CLOTHES_FALLBACK))
        # 生涯服裝自己就是一整套配色(護士服是白的、巫女服是紅白),再疊一組
        # 隨機配色只會打架。個人衣櫃那邊才用得上調色盤。
        if palette and worn not in CAREER_OUTFIT:
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
