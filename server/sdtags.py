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

import re

# ---- 外貌:persona_pools.json female.appearance ----

BUILD = {
    "勻稱有致": "slender",
    "骨感清瘦": "skinny, slender",
    "纖細苗條": "slim, slender",
    "嬌小玲瓏": "petite",
    "肉感微肉": "plump",
    "微肉圓潤": "plump, chubby",
    "結實緊緻": "toned",
    "運動健美": "athletic, abs",
    "高挑纖長": "tall, slender, long legs",
    "豐滿火辣": "curvy, voluptuous",
    "軟肉感有腰": "plump, narrow waist",
    "細腰寬臀": "narrow waist, wide hips",
    "凹凸有致的沙漏身材": "hourglass figure, narrow waist, wide hips",
    "極端腰臀比的漫畫比例": "hourglass figure, narrow waist, wide hips",
}

# 新制:罩杯與乳型分軸。CUP + BREAST_SHAPE 組 tag;舊存檔的合寫字串仍留在 BUST。
CUP = {
    "A 罩杯、平坦俐落": "flat chest",
    "A 罩杯、小巧清秀": "flat chest",
    "A 罩杯、微微隆起的貧乳": "flat chest, tiny breasts",
    "B 罩杯、自然小巧": "small breasts",
    "B 罩杯、剛好一手掌握": "small breasts",
    "B 罩杯、挺俏": "small breasts, perky breasts",
    "D 罩杯、飽滿有份量": "large breasts",
    "D 罩杯、勻稱漂亮": "large breasts",
    "D 罩杯、圓潤有份量": "large breasts",
    "E 罩杯、傲人豐滿": "large breasts, huge breasts",
    "E 罩杯、軟彈有乳溝": "large breasts, deep cleavage",
    "I 罩杯、不科學爆乳": "gigantic breasts",
    "I 罩杯、壓迫感超巨乳": "gigantic breasts, hyper breasts",
    "I 罩杯、誇張巨乳": "gigantic breasts, huge breasts",
}

BREAST_SHAPE = {
    "半球型": "round breasts",
    "饅頭型": "round breasts, soft breasts",
    "挺俏上挺": "perky breasts",
    "自然圓潤": "round breasts",
    "水滴型": "teardrop breasts",
    "木瓜型": "teardrop breasts, perky breasts",
    "鐘型": "hanging breasts",
    "外擴／八字": "wide-set breasts, sideboob",
    "母乳型沉重下垂": "sagging breasts, hanging breasts",
    "極密著深溝": "close-set breasts, deep cleavage",
}

BUST = {
    **CUP,
    "C 罩杯、勻稱漂亮": "medium breasts",
    "C 罩杯、圓潤水滴形": "medium breasts, teardrop breasts",
    "F 罩杯、誇張的巨乳": "huge breasts",
    "B 罩杯、挺俏半球形": "small breasts, perky breasts",
    "C 罩杯、柔軟饅頭形": "medium breasts, soft breasts, round breasts",
    "C 罩杯、外擴的開闊胸型": "medium breasts, wide-set breasts",
    "D 罩杯、高聳木瓜形": "large breasts, perky breasts, papaya-shaped breasts",
    "D 罩杯、沉甸甸水滴垂墜": "large breasts, hanging breasts, teardrop breasts",
    "E 罩杯、軟彈半球、擠出深深乳溝": "large breasts, soft breasts, deep cleavage",
    "E 罩杯、東方式豐滿橫向展開": "large breasts, wide breasts, sideboob",
    "F 罩杯、沉重下垂的母乳型巨乳": "huge breasts, sagging breasts, heavy breasts",
    "G 罩杯、誇張到不科學的爆乳": "gigantic breasts, enormous breasts",
    "H 罩杯、壓迫感十足的超巨乳": "gigantic breasts, hyper breasts",
    "上半胸豐滿、下半緊實的運動型胸型": "athletic breasts, firm breasts, medium breasts",
    "左右略不對稱的自然胸型": "asymmetrical breasts, natural breasts",
    "極窄間距、幾乎貼在一起的密著巨乳": "huge breasts, close-set breasts, deep cleavage",
    "乳暈周邊脂肪豐厚、托起來沉手的厚重胸": "large breasts, heavy breasts, thick breasts",
}

# 乳暈大小／顏色(NSFW 軸;persona_pools appearance.areola)
AREOLA = {
    "小巧粉嫩的乳暈": "small areolae, pink areolae",
    "精緻淡粉、面積偏小的乳暈": "small areolae, pink areolae",
    "圓潤櫻花粉、中等大小乳暈": "pink areolae",
    "偏大一圈的粉褐乳暈": "large areolae, brown areolae",
    "寬廣深粉、邊緣柔和的大乳暈": "large areolae, pink areolae",
    "深咖啡色、中等偏大乳暈": "large areolae, dark areolae",
    "幾乎佔滿半邊乳房的誇張大乳暈": "huge areolae",
    "淺褐帶點雀斑感的自然乳暈": "brown areolae",
    "紅潤充血色、敏感看起來偏腫的乳暈": "puffy areolae",
    "近乎黑色的深色乳暈、對比強烈": "dark areolae, large areolae",
}

NIPPLE = {
    "小巧內收、幾乎看不出形的乳頭": "inverted nipples, small nipples",
    "粉嫩、微微凸起的乳頭": "pink nipples",
    "明顯挺立的粉嫩乳尖": "pink nipples, erect nipples",
    "較大、深粉或褐、看起來充血敏感的乳頭": "large nipples, puffy nipples",
    "粗長、深色、非常明顯的乳頭": "long nipples, dark nipples",
}

# 性器軸(NSFW;persona_pools appearance.labia_size / clitoris_size / labia_color / pubic_hair)
# 前三各三級、陰毛四級、不分等級。只在特寫／下半素體／extra 寫到陰部時才進 prompt。
LABIA_SIZE = {
    "內收小巧的陰唇": "innies, small labia, innie pussy",
    "適中微開的陰唇": "slightly parted labia",
    "外翻飽滿的陰唇": "outies, large labia, plump labia, protruding inner labia",
}

CLITORIS_SIZE = {
    "小巧含蓄的陰蒂": "small clitoris",
    "明顯可見的陰蒂": "clitoris",
    "腫大突出的陰蒂": "large clitoris, prominent clitoris",
}

LABIA_COLOR = {
    "粉嫩淺色的陰唇": "pink pussy, pink labia, pale labia",
    "淺褐自然的陰唇": "brown labia",
    "深褐近黑的陰唇": "dark pussy, dark labia",
}

PUBIC_HAIR = {
    "完全剃光、沒有陰毛": "shaved, completely shaved, no pubic hair",
    "稀疏細軟的陰毛": "sparse pubic hair, light pubic hair",
    "適中自然的陰毛": "pubic hair",
    "濃密茂盛的陰毛": "thick pubic hair, bush, messy pubic hair",
}

_GENITAL_KEYS = ("pussy", "labia", "clitoris", "vulva", "vagina")
_GENITAL_PART_KEYS = ("labia_size", "clitoris_size", "labia_color", "pubic_hair")

# 瞳孔顏色(與 EYES 形狀軸分離;persona_pools appearance.eye_color)
EYE_COLOR = {
    "深棕色瞳孔": "brown eyes",
    "琥珀色瞳孔": "amber eyes",
    "灰綠色瞳孔": "green eyes",
    "澄澈蔚藍瞳孔": "blue eyes",
    "紫羅蘭色瞳孔": "purple eyes",
    "血紅色瞳孔": "red eyes",
    "金色豎瞳": "gold eyes, slit pupils",
    "異色雙瞳（左藍右金）": "heterochromia, blue eyes, gold eyes",
    "粉桃色瞳孔": "pink eyes",
    "漆黑幾乎無高光的瞳孔": "black eyes, empty eyes",
}

# 臉是最看得出「有沒有在畫同一個人」的地方,所以拆成五軸各 18 項:
# 眼睛 / 嘴巴 / 臉型 / 髮型 / 髮色。只寫「長相」,表情由個性原型另外給。
EYES = {
    "圓圓的杏眼、很有神": "round eyes",
    "笑起來瞇成月牙": "closed eyes, smile",
    "標準的杏仁眼、眼皮乾淨": "almond eyes",
    "單眼皮、看起來有點冷": "monolid, narrow eyes",
    "內雙、笑起來眼尾會彎": "tareme",
    "半睜的睡眼、總像沒睡飽": "sleepy eyes, half-closed eyes",
    "三白眼、看人有點凶": "sanpaku",
    "沒什麼情緒的死魚眼": "jitome",
    "細長的丹鳳眼": "narrow eyes",
    "下垂眼、看起來很溫柔": "tareme",
    "圓瞳大眼、像小動物": "large eyes, round eyes",
    "眼尾微揚、有點鋒利": "tsurime",
    "大眼睛、睫毛很長": "large eyes, long eyelashes",
    "上揚的狐狸眼、有點媚": "tsurime, fox eyes",
    "濕潤的淚眼、總像剛哭過": "teary eyes",
    "瞳色偏淺、像貓": "slit pupils",
    "含情的桃花眼、天生勾人": "bedroom eyes",
    "深邃的雙眼皮大眼、眼窩有陰影": "large eyes, tsurime",
}

MOUTH = {
    "小巧的櫻桃小嘴": "small mouth",
    "飽滿的厚唇": "full lips",
    "薄唇、線條俐落": "thin lips",
    "微微上揚的嘴角": "slight smile",
    "嘴角天生下垂": "frown",
    "明顯的唇珠": "cupid's bow",
    "花瓣一樣的唇形": "full lips",
    "常常微張的唇": "parted lips",
    "抿著嘴、話不多": "closed mouth",
    "笑起來露出整排牙": "smile, teeth",
    "唇色偏淡、像沒血色": "pale lips",
    "唇色紅潤、像抹了口紅": "red lips",
    "幾乎不上妝的素唇": "pale lips",
    "咬唇的習慣": "biting own lip",
    "有點嘟的唇、像在撒嬌": "pout",
    "唇形寬、笑起來很大方": "wide mouth, smile",
    "下唇比上唇厚": "full lips",
    "嘴角有顆小痣": "mole near mouth",
    "厚唇微張像剛被吻過": "full lips, parted lips",
    "花瓣厚唇天生勾人": "full lips, parted lips",
}

FACE = {
    "標準的鵝蛋臉": "oval face",
    "圓潤的圓臉": "round face",
    "稍長的長臉": "long face",
    "尖下巴的瓜子臉": "pointed chin",
    "方一點的鵝蛋臉、線條清楚": "oval face, sharp jawline",
    "下顎線俐落": "sharp jawline",
    "顴骨明顯": "high cheekbones",
    "臉頰有嬰兒肥": "chubby cheeks",
    "臉小、五官集中": "small face",
    "額頭飽滿": "broad forehead",
    "額頭窄、常被瀏海蓋住": "bangs",
    "鼻樑高挺": "high nose bridge",
    "鼻頭小巧": "small nose",
    "輪廓深、五官立體": "high cheekbones",
    "五官偏平、乾淨清秀": "small face",
    "臉頰有雀斑": "freckles",
    "皮膚薄、容易泛紅": "blush",
    "下巴中間有一道淺溝": "cleft chin",
    "極小臉又立體的媚臉": "small face, high cheekbones",
    "天生臥蠶含情的臉": "aegyo-sal",
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
    "及腰大波浪": "very long hair, wavy hair",
    "妖媚側分長捲": "long hair, wavy hair, sidelocks",
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
    "內層挑染彩色": "streaked hair",
    "漸層的髮尾": "gradient hair",
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

# 女友／妻子解鎖的色情裝
EROTIC_STYLE = {
    "黑色蕾絲胸罩配吊襪帶": "black lace bra, garter belt, stockings, lingerie",
    "深紅情趣連身衣": "red teddy, sheer bodysuit, erotic lingerie",
    "半透明白襯衫不扣鈕": "unbuttoned sheer white shirt, no bra, see-through shirt",
    "皮質束腰與丁字褲": "leather corset, thong, erotic leather",
    "開襟緞面睡袍真空": "open satin robe, nude under robe, silk robe",
    "貓耳項圈與露胸圍裙": "cat ears, collar, revealing apron, bare breasts under apron",
    "濕身白 T 恤真空": "wet white t-shirt, no bra, see-through t-shirt",
    "絲襪馬甲套裝": "corset, stockings, garter, bustier lingerie",
    "超短旗袍開襟": "very short cheongsam, open qipao, revealing",
    "半透明薄紗只遮重點": "sheer veil, barely covering, translucent fabric",
}

# 妻子解鎖的睡衣
SLEEP_STYLE = {
    "條紋棉質睡衣套裝": "striped cotton pajamas, pajama set",
    "寬鬆男友襯衫當睡衣": "oversized boyfriend shirt as sleepwear",
    "緞面吊帶短褲睡衣": "satin camisole, sleep shorts, silk sleepwear",
    "法蘭絨格紋睡衣": "flannel plaid pajamas",
    "連帽家居睡裙": "hoodie sleep dress, lounge nightdress",
    "短版背心配睡褲": "short camisole, pajama pants",
}


def outfit_en(worn: str) -> str:
    """中文服裝名 → 英文 tag。生涯／日常／色情裝／睡衣同一入口。"""
    w = str(worn or "").strip()
    if not w:
        return ""
    return CAREER_OUTFIT.get(w) or STYLE.get(w) or EROTIC_STYLE.get(w) or SLEEP_STYLE.get(w) or ""

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
    # +10 erotic career outfits
    "情趣內衣配外罩外套": "lingerie, sheer lingerie, open coat over lingerie",
    "露肩緊身寫真洋裝": "tight off-shoulder dress, glamorous photo dress",
    "超短旗袍式工裝": "very short cheongsam, revealing qipao uniform",
    "皮衣緊身馬甲與長靴": "leather corset, tight leather, thigh boots, dominatrix outfit",
    "超短熱褲配吊帶小背心": "micro shorts, camisole, revealing streamer outfit",
    "項圈與暴露式僕役裝": "collar, revealing maid outfit, slave attire",
    "開襟白袍配情趣內衣": "open lab coat, lingerie underneath",
    "私服短裙與過膝襪": "short skirt, thighhighs, casual revealing clothes",
    "閃片比基尼與網襪高跟鞋": "sequin bikini, fishnets, high heels, stripper outfit",
    "居家寬鬆 T 恤下真空": "oversized t-shirt, no bra, casual homewear",
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
    "唇下痣": "mole under mouth",
    "深臥蠶": "aegyo-sal",
    "眼尾一顆淚痣配薄紅膚": "mole under eye, flushed skin",
    "鎖骨到胸口的痣點": "mole on collarbone, mole on chest",
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
    "形狀漂亮的美胸": ("perky breasts", "bust", ()),
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
    "性感的馬甲線": ("abs, narrow waist", "bust", ()),
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
        "gigantic breasts, narrow waist", "bust", ("bust", "build")),
    "一捏會陷下去的綿密酥胸": ("soft breasts", "bust", ()),
    "極度敏感、一碰就軟的體質": ("", "", ()),
    "勾魂的沙啞低喘嗓": ("", "", ()),
    "天生會勾人的費洛蒙體香": ("", "", ()),
    "漫畫般凹陷的反差腰窩": ("back dimples", "bust", ()),
    "緊緻飽滿的水蜜桃臀": ("round ass", "lower", ()),
    # 傳說
    "赤紅色的眼睛": ("red eyes", "head", ()),
    "左右異色的雙瞳": ("heterochromia", "head", ()),
    "宛如模特兒的黃金三圍": (
        "hourglass figure, narrow waist, wide hips", "bust", ("build",)),
    "吹彈可破、會發光似的奶白肌": ("pale skin, shiny skin", "bust", ("skin",)),
    "傳說級的名器體質": ("", "", ()),
    "雌性費洛蒙濃到讓人失神的體香": ("", "", ()),
    "豐乳肥臀又不科學細腰的魔鬼身材": (
        "huge breasts, wide hips, narrow waist, curvy", "bust", ("bust", "build")),
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
    "head": "portrait, face focus, looking at viewer",
    "half": "upper body",
    "full": "full body",
    "lower": "lower body, below waist, head out of frame",
}

PART_FRAMING = {
    "head0": "portrait, face focus",
    "head": "portrait, face focus",
    "bust0": "upper body, head out of frame",
    "bust": "upper body, head out of frame",
    "lower0": "lower body, head out of frame",
    "lower": "lower body, head out of frame",
}

ART_STYLE = {
    "anime": "anime",
    "realistic": "photorealistic",
    "pixel": "pixel art",
}

# 品質前綴。放最前面權重最高。
#
# 兩種底的建議前綴不一樣,這裡取聯集——跟 negative 的 score_1/2/3 同一個做法,
# 讓兩種底各自吃到自己認得的那幾個,認不得的就是個無害的未知 token:
#
#   Illustrious   masterpiece, best quality, amazing quality, very aesthetic
#   Anima         masterpiece, best quality, score_7, safe
#
# (兩家的作者其實都說 fine-tune 過的版本不太需要品質 tag——animij 頁面寫
#  「special care was taken so you don't need any quality tags」。留著是為了
#  萬一換成沒調過的底模,不是因為非有不可。)
QUALITY_PREFIX = "masterpiece, best quality, score_7, amazing quality, very aesthetic"

# 分級 tag。**兩家用的字不一樣**,這是之前的一個實質錯誤:
#   Illustrious   general / sensitive / questionable / explicit
#   Anima         safe    / sensitive / nsfw          / explicit
# 只寫 `general` 的話,Anima 底的 checkpoint 根本不認得,SFW 這個訊號整個丟失。
# 兩個都寫,誰認得誰吃。nsfw 兩邊都認,不用動。
RATING = {"sfw": "general, safe", "nsfw": "nsfw"}

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
HUMAN_TAGS = "adult"

# 只寫在正面「她是人」還不夠——動漫模型看到這種遊戲語境會自己長角。
# 這組留著,因為它擋的正是「畫面跑偏」:長角、長翅膀就是跑偏。
# 但去掉重複下注——`horns` 已經蓋掉 `demon horns`,`wings`/`tail`/`pointy ears`
# 同理,原本十四個詞有一半是同一件事講兩遍,只是在稀釋權重。
NOT_DEMON_NEGATIVE = "horns, pointy ears, wings, tail, demon girl, monster girl"

# 服裝欄位查不到對照時的墊底。沒有任何服裝 tag = 模型自由發揮 = 多半不穿。
CLOTHES_FALLBACK = "casual clothes"

# 穿衣場面：罩杯只留體積。cleavage / sideboob / hanging / areola / nipple
# 對 SD 幾乎等於「把胸露出來」——立繪寫了 G 罩杯＋乳溝，衣服就會被畫掉。
_EXPOSED_CHEST_SUBSTR = (
    "cleavage", "sideboob", "hanging breast", "sagging breast",
    "areola", "nipple", "topless", "nude", "naked", "bare back",
    "bare breast", "uncovered", "exposed breast", "breasts out",
    "shirt lift", "clothes pull", "undress", "open shirt",
    "papaya",
)
_NSFW_ACT_KEYS = (
    "sex", "fucking", "penetration", "vaginal", "groping",
    "molestation", "creampie", "orgasm", "nsfw", "explicit",
    "breast grab", "intercourse",
    "fellatio", "oral", "blowjob", "cowgirl",
    "deepthroat", "irrumatio", "cum in mouth", "oral creampie",
    "ejaculation", "penis",
    "ass grab", "butt grab", "grabbing her ass", "grabbing her thigh",
    "doggy", "from behind", "cervix", "womb bulge",
)
_CUP_ZH_RE = re.compile(r"([A-I])\s*罩杯")

# 舊版穿衣 negative（nude / nipples…）。不要再用：
# 禁止項寫進 CLIP 正向或預設負向都會讓模型「聽到那個詞」。
# 卡面禁止走 visualNeg；對話卡不要預設塞這串。
CLOTHED_NEGATIVE = ""

_NEG_PREFIX = re.compile(r"^(?:no|not|don't|dont|without|禁止)\s+", re.I)
_MULTI_KEYS = (
    "1man", "1boy", "2people", "2 people", "two people",
    "couple", "other man", "man and woman", "man fucking",
)


def iter_tag_bits(text: str):
    """逗號／分號切 tag。小括號整段當一個 token，裡面的逗號不切開。"""
    buf: list[str] = []
    depth = 0
    for ch in (text or ""):
        if ch == "(":
            depth += 1
            buf.append(ch)
        elif ch == ")" and depth:
            depth -= 1
            buf.append(ch)
        elif ch in ",/;" and depth == 0:
            t = "".join(buf).strip()
            if t:
                yield t
            buf = []
        else:
            buf.append(ch)
    t = "".join(buf).strip()
    if t:
        yield t


def split_paren_aside(text: str) -> tuple[str, str]:
    """主畫面 tag 與小括號內容分開。

    extra 寫 `半身立繪…, (male hand on her buttocks)`：
    括號外＝主畫面，括號內＝角落插圖。SD 的 () 是加權不是分區，
    所以 Comfy 只把括號裡的詞接在最後；Grok 另開一段指令。
    """
    mains: list[str] = []
    asides: list[str] = []
    for t in iter_tag_bits(text):
        if len(t) >= 2 and t.startswith("(") and t.endswith(")"):
            inner = t[1:-1].strip()
            if inner:
                asides.append(inner)
        else:
            mains.append(t)
    return ", ".join(mains), ", ".join(asides)


def split_pos_neg_tags(text: str) -> tuple[str, str]:
    """把「NO groping / NOT looking away」從正向拆進負向。

    SD 正向寫 NO xxx 幾乎等於在畫 xxx。禁止項只該進 negative。
    """
    pos: list[str] = []
    neg: list[str] = []
    for t in iter_tag_bits(text):
        m = _NEG_PREFIX.match(t)
        if m:
            rest = t[m.end():].strip()
            if rest:
                neg.append(rest)
        else:
            pos.append(t)
    return ", ".join(pos), ", ".join(neg)


def extra_has_key(extra: str, keys: tuple[str, ...]) -> bool:
    """只在正向 token 裡找。『NO groping』不算有 groping。"""
    pos, _ = split_pos_neg_tags(extra)
    el = pos.lower()
    return any(k in el for k in keys)


def is_nsfw_act(extra: str = "") -> bool:
    return extra_has_key(extra, _NSFW_ACT_KEYS)


_ORAL_ACT_KEYS = (
    "fellatio", "oral", "blowjob", "deepthroat", "irrumatio",
    "cum in mouth", "oral creampie",
)


def is_oral_act(extra: str = "") -> bool:
    """口交四連：動作是 NSFW，但不因此脫衣。衣服只看關係階段。"""
    return extra_has_key(extra, _ORAL_ACT_KEYS)


_DOGGY_ACT_KEYS = (
    "doggy", "doggy style",
    "womb bulge", "hitting cervix",
    "halfway inside", "glans entering", "glans inside", "going deeper", "hilted",
    "internal ejaculation",
    "about to penetrate", "awaiting insertion",
    "groin slamming",
)


def is_doggy_act(extra: str = "") -> bool:
    """背後交配四連：動作是 NSFW，但不因此脫衣。衣服只看關係階段。"""
    return extra_has_key(extra, _DOGGY_ACT_KEYS)


_COWGIRL_ACT_KEYS = (
    "cowgirl", "girl on top", "straddling",
)


def is_cowgirl_act(extra: str = "") -> bool:
    """騎乘四連：動作是 NSFW，但不因此脫衣。衣服只看關係階段。"""
    return extra_has_key(extra, _COWGIRL_ACT_KEYS)


def keeps_stage_clothes(extra: str = "") -> bool:
    """口交／背後／騎乘：NSFW 動作不升級脫衣，裸只留給妻子。"""
    return is_oral_act(extra) or is_doggy_act(extra) or is_cowgirl_act(extra)


def is_multi_scene(extra: str = "") -> bool:
    """雙人／NTR／做愛才算。對話卡 visualEn 的 NO groping 不算。"""
    return extra_has_key(extra, _MULTI_KEYS) or is_nsfw_act(extra)


def is_pov_cam(extra: str = "") -> bool:
    return extra_has_key(extra, (
        "from his pov", "first-person", "first person", "pov",
        "viewer hands", "male hands",
    ))


# 關係階段 → 衣服／胸暴露（立繪與出卡共用）
#   covered   陌生／朋友：穿好，罩杯只留體積
#   shape     女友：仍穿衣服，但可露胸型／乳溝／水滴／八字
#   exposed   妻子：可全裸，乳暈乳頭寫進 prompt
_NIPPLE_SUBSTR = (
    "areola", "nipple", "topless", "nude", "naked",
    "bare breast", "uncovered", "exposed breast", "breasts out",
)


def resolve_stage(character: dict | None = None, stage: str = "") -> str:
    raw = (stage or "").strip().lower()
    if raw in ("stranger", "friend", "girlfriend", "wife"):
        return raw
    ch = character if isinstance(character, dict) else {}
    cand = ch.get("stage")
    if isinstance(ch.get("relationship"), dict):
        cand = cand or ch["relationship"].get("stage")
    raw = str(cand or "").strip().lower()
    return raw if raw in ("stranger", "friend", "girlfriend", "wife") else "stranger"


def clothing_level(stage: str = "", *, nsfw_act: bool = False, character: dict | None = None) -> str:
    ch = character if isinstance(character, dict) else {}
    # 半身立繪臨時旗標：SS／SSR 性慾 1/2 裸體（前端 weaveShot 才會掛）
    if ch.get("_force_exposed"):
        return "exposed"
    st = resolve_stage(character, stage)
    if st == "wife":
        return "exposed"
    if st == "girlfriend":
        return "shape"
    if nsfw_act:
        return "shape"
    return "covered"


def filter_tag_chunk(tag: str, drop_keys: tuple[str, ...]) -> str:
    kept: list[str] = []
    seen: set[str] = set()
    for t in str(tag or "").split(","):
        t = t.strip()
        if not t:
            continue
        tl = t.lower()
        if any(x in tl for x in drop_keys):
            continue
        if tl not in seen:
            seen.add(tl)
            kept.append(t)
    return ", ".join(kept)


def bust_tags_for_level(tag: str, level: str) -> str:
    """covered=只留體積；shape=胸型可見（水滴／八字／乳溝）但不寫乳頭；exposed=全寫。"""
    if not tag:
        return ""
    if level == "exposed":
        return tag
    if level == "shape":
        return filter_tag_chunk(tag, _NIPPLE_SUBSTR)
    # 陌生／朋友：連水滴／八字／挺俏都拿掉，只留 small/medium/large
    covered = clothe_tag_chunk(tag)
    return filter_tag_chunk(covered, (
        "teardrop", "wide-set", "wide breasts", "perky",
    ))


def outfit_tags_for_level(base_outfit: str, level: str) -> str:
    cloth = (base_outfit or "").strip() or CLOTHES_FALLBACK
    if level == "exposed":
        return "nude, nipples"
    if level == "shape":
        return f"{cloth}, revealing clothes, cleavage"
    return "fully clothed, " + cloth


def clothe_tag_chunk(tag: str) -> str:
    """從一段逗號 tag 拿掉露胸詞，體積／形狀留下。"""
    kept: list[str] = []
    seen: set[str] = set()
    for t in str(tag or "").split(","):
        t = t.strip()
        if not t:
            continue
        tl = t.lower()
        if any(x in tl for x in _EXPOSED_CHEST_SUBSTR):
            continue
        if tl not in seen:
            seen.add(tl)
            kept.append(t)
    return ", ".join(kept)


def clothed_bust_zh(raw: str) -> str:
    """中文罩杯：穿衣時只留 A~I 罩杯／巨乳，丟掉乳溝、下垂、乳暈。"""
    raw = str(raw or "").strip()
    if not raw:
        return ""
    m = _CUP_ZH_RE.search(raw)
    if m:
        return f"{m.group(1)} 罩杯"
    if "爆乳" in raw:
        return "爆乳"
    if "巨乳" in raw:
        return "巨乳"
    if "貧乳" in raw or "平坦" in raw:
        return "平坦胸部"
    return raw

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
    return "young adult" if a <= 22 else "mature female"


# 年紀不要往下漂。正面已經寫了「29 years old, mature female」,這幾個是把
# 臉型與身材比例釘在成人那邊——留擋得住的那幾個就好,`underage` /
# `elementary school student` 這種是內容詞不是畫風詞,模型不太吃,刪掉。
AGE_NEGATIVE = "child, loli, chibi, baby face"


# 要去背的立繪:先要一塊平背景,後製才摳得乾淨
FLAT_BG_TAGS = "simple background, white background, plain background"


def negative_for(flat_bg: bool = False, clothed: bool = False, extra_neg: str = "") -> str:
    """組 negative。預設只擋畫崩／魔物／幼態，不塞 nude／nipples。

    extra_neg = 卡面 visualNeg，或從 visualEn 拆出來的 NO xxx。
    clothed 參數保留相容，不再自動加內容詞。
    """
    bits = [NEGATIVE, AESTHETIC_NEGATIVE, NOT_DEMON_NEGATIVE, AGE_NEGATIVE]
    extra_neg = (extra_neg or "").strip()
    if extra_neg:
        bits.append(extra_neg)
    if flat_bg:
        bits.append(FLAT_BG_NEGATIVE)
    return ", ".join(b for b in bits if b)


def _look(ch: dict) -> dict:
    look = ch.get("look")
    return look if isinstance(look, dict) else {}


def _table_get(table: dict, raw: str) -> str:
    raw = str(raw or "").strip()
    if not raw:
        return ""
    return table.get(raw, "")


def compose_bust_en(look: dict, unknown: list[str]) -> str:
    """新制 cup + breast_shape;舊存檔只剩 bust 合寫字串。"""
    bits: list[str] = []
    cup = str(look.get("cup") or "").strip()
    shape = str(look.get("breast_shape") or "").strip()
    if cup:
        tag = CUP.get(cup) or BUST.get(cup, "")
        if tag:
            bits.append(tag)
        else:
            unknown.append(f"cup: {cup}")
    if shape:
        tag = BREAST_SHAPE.get(shape, "")
        if tag:
            bits.append(tag)
        else:
            unknown.append(f"breast_shape: {shape}")
    if bits:
        # 去重保序
        seen: set[str] = set()
        out: list[str] = []
        for chunk in bits:
            for t in chunk.split(","):
                t = t.strip()
                if t and t.lower() not in seen:
                    seen.add(t.lower())
                    out.append(t)
        return ", ".join(out)
    raw = str(look.get("bust") or "").strip()
    if not raw:
        return ""
    tag = BUST.get(raw, "")
    if not tag:
        unknown.append(f"bust: {raw}")
    return tag


def compose_bust_en(look: dict, unknown: list[str]) -> str:
    """新制 cup + breast_shape;舊存檔只剩 bust 合寫字串。"""
    bits: list[str] = []
    cup = str(look.get("cup") or "").strip()
    shape = str(look.get("breast_shape") or "").strip()
    if cup:
        tag = CUP.get(cup) or BUST.get(cup, "")
        if tag:
            bits.append(tag)
        else:
            unknown.append(f"cup: {cup}")
    if shape:
        tag = BREAST_SHAPE.get(shape, "")
        if tag:
            bits.append(tag)
        else:
            unknown.append(f"breast_shape: {shape}")
    if bits:
        seen: set[str] = set()
        out: list[str] = []
        for chunk in bits:
            for t in chunk.split(","):
                t = t.strip()
                if t and t.lower() not in seen:
                    seen.add(t.lower())
                    out.append(t)
        return ", ".join(out)
    raw = str(look.get("bust") or "").strip()
    if not raw:
        return ""
    tag = BUST.get(raw, "")
    if not tag:
        unknown.append(f"bust: {raw}")
    return tag


def appearance_en_parts(
    character: dict | None,
    *,
    clothed: bool = True,
    stage: str = "",
    crop: str = "",
) -> tuple[dict[str, str], list[str]]:
    """中文人設外貌 → 英文 tag 字典（給 Grok／任何讀句子的生圖路）。

    查表與 Comfy 的 build_prompt 同一份表；查不到進 unknown，不塞中文原文。
    stage 管衣服多寡：陌生／朋友穿好；女友露胸型；妻子可全裸含乳暈乳頭。
    clothed=False 仍當 exposed（舊呼叫）。
    crop=lower：腰部以下特寫，不寫臉／眼／髮／胸。
    """
    ch = character if isinstance(character, dict) else {}
    look = _look(ch)
    unknown: list[str] = []
    level = clothing_level(stage, character=ch) if (stage or ch.get("stage")) else (
        "covered" if clothed else "exposed"
    )
    sp_seg, sp_over, sp_unknown = resolve_specials(ch)
    unknown += list(sp_unknown)

    def tr(table: dict, key: str) -> str:
        if key in sp_over:
            return ""
        raw = str(look.get(key) or "").strip()
        if not raw:
            return ""
        tag = table.get(raw, "")
        if not tag:
            unknown.append(f"{key}: {raw}")
        return tag

    parts: dict[str, str] = {}
    parts["age"] = age_tags(look.get("age") or ch.get("age") or "")
    parts["face"] = tr(FACE, "face")
    parts["eyes"] = tr(EYES, "eyes")
    parts["eye_color"] = tr(EYE_COLOR, "eye_color")
    parts["mouth"] = tr(MOUTH, "mouth")
    parts["hair"] = tr(HAIR, "hair")
    parts["hair_color"] = tr(HAIR_COLOR, "hair_color")
    parts["build"] = tr(BUILD, "build")
    bust = "" if "bust" in sp_over else compose_bust_en(look, unknown)
    parts["bust"] = bust_tags_for_level(bust, level)
    if level == "exposed":
        parts["areola"] = tr(AREOLA, "areola")
        parts["nipple"] = tr(NIPPLE, "nipple")
    parts["labia_size"] = tr(LABIA_SIZE, "labia_size")
    parts["clitoris_size"] = tr(CLITORIS_SIZE, "clitoris_size")
    parts["labia_color"] = tr(LABIA_COLOR, "labia_color")
    parts["pubic_hair"] = tr(PUBIC_HAIR, "pubic_hair")
    parts["feature"] = tr(FEATURE, "feature")
    parts["clothing_level"] = level

    # 特殊屬性英文 tag（合併各段）
    sp_tags: list[str] = []
    for seg in ("head", "bust", "lower"):
        chunk = ", ".join(sp_seg.get(seg) or [])
        if seg == "bust":
            chunk = bust_tags_for_level(chunk, level)
        if chunk:
            sp_tags.append(chunk)
    if sp_tags:
        # 去重保序
        seen: set[str] = set()
        uniq = []
        for t in sp_tags:
            for bit in str(t).split(","):
                b = bit.strip()
                if b and b.lower() not in seen:
                    seen.add(b.lower())
                    uniq.append(b)
        if uniq:
            parts["specials"] = ", ".join(uniq)

    # 服裝：優先 character 上已解析的 worn；否則 career / style
    worn = str(ch.get("_worn_outfit") or look.get("career_outfit") or look.get("style") or "").strip()
    if worn:
        otag = outfit_en(worn)
        if worn and not otag:
            unknown.append(f"outfit: {worn}")
        parts["outfit"] = outfit_tags_for_level(otag or CLOTHES_FALLBACK, level)

    h = look.get("height_cm")
    if h:
        try:
            cm = int(h)
            if cm >= 170:
                parts["height"] = "tall, long legs"
            elif cm <= 154:
                parts["height"] = "petite, short"
        except (TypeError, ValueError):
            pass

    if (crop or "").lower() == "lower":
        parts = drop_upper_look(parts)
        lower_sp = ", ".join(sp_seg.get("lower") or [])
        if lower_sp:
            parts["specials"] = lower_sp
        else:
            parts.pop("specials", None)
        if level == "exposed":
            parts["outfit"] = "nude"
        elif parts.get("outfit"):
            parts["outfit"] = filter_tag_chunk(parts["outfit"], _UPPER_OUTFIT_DROP)

    return parts, unknown


def flatten_tags(*chunks: str) -> str:
    """多段 tag 去重保序,逗號串起來。空段丟掉。"""
    seen: set[str] = set()
    out: list[str] = []
    for chunk in chunks:
        for t in str(chunk or "").split(","):
            t = t.strip()
            if t and t.lower() not in seen:
                seen.add(t.lower())
                out.append(t)
    return ", ".join(out)


# 腰部以下特寫（摸大腿）不能沿用半身立繪前半：臉／眼／髮／胸／上半身
UPPER_LOOK_KEYS = (
    "face", "eyes", "eye_color", "mouth",
    "hair", "hair_color", "feature",
    "bust", "areola", "nipple",
)
_UPPER_OUTFIT_DROP = (
    "cleavage", "sideboob", "revealing", "nipple", "areola",
    "bare breast", "exposed breast", "breasts out", "open shirt",
)


def drop_upper_look(parts: dict[str, str]) -> dict[str, str]:
    """從外貌字典拿掉臉、眼睛、頭髮、胸部。"""
    out = dict(parts)
    for k in UPPER_LOOK_KEYS:
        out.pop(k, None)
    return out


def appearance_en_brief(
    character: dict | None,
    *,
    stage: str = "",
    framing: str = "",
) -> tuple[str, list[str]]:
    """生圖用:一行 Danbooru tag,沒有中文、沒有英文句子。"""
    parts, unknown = appearance_en_parts(character, stage=stage, crop=framing)
    bits = [
        "1girl",
        HUMAN_TAGS,
        parts.get("age") or "",
        parts.get("face") or "",
        parts.get("eyes") or "",
        parts.get("eye_color") or "",
        parts.get("mouth") or "",
        parts.get("hair_color") or "",
        parts.get("hair") or "",
        parts.get("feature") or "",
        parts.get("build") or "",
        parts.get("bust") or "",
        parts.get("areola") or "",
        parts.get("nipple") or "",
        parts.get("height") or "",
        parts.get("specials") or "",
        parts.get("outfit") or "",
    ]
    # 性器三軸只在腰部以下特寫進身份行,免得把頭／半身鏡頭拉到下體
    if (framing or "").lower() == "lower":
        bits += [
            parts.get("labia_size") or "",
            parts.get("clitoris_size") or "",
            parts.get("labia_color") or "",
            parts.get("pubic_hair") or "",
        ]
    tag = flatten_tags(*bits)
    return tag or "1girl, adult", unknown


def appearance_en_head(
    character: dict | None,
    *,
    skip_closed_eyes: bool = True,
) -> tuple[str, list[str]]:
    """口交／大頭特寫用人設：臉、眼、嘴、髮。不含胸、性器、衣服。"""
    parts, unknown = appearance_en_parts(character, clothed=True, stage="")
    sp_seg, _, sp_unk = resolve_specials(character if isinstance(character, dict) else {})
    unknown += list(sp_unk)
    eyes = parts.get("eyes") or ""
    if skip_closed_eyes and "closed eyes" in eyes.lower():
        eyes = ""
    tag = flatten_tags(
        "1girl",
        HUMAN_TAGS,
        parts.get("age") or "",
        parts.get("face") or "",
        eyes,
        parts.get("eye_color") or "",
        parts.get("mouth") or "",
        parts.get("hair_color") or "",
        parts.get("hair") or "",
        parts.get("feature") or "",
        ", ".join(sp_seg.get("head") or []),
    )
    return tag or "1girl, adult", unknown


# 分段生圖每段要帶的欄位(頭 / 胸 / 下半身)
_PART_KEYS = {
    "head": ("age", "face", "eyes", "eye_color", "mouth", "hair_color", "hair", "feature"),
    "bust": ("build", "bust", "areola", "nipple", "outfit"),
    "lower": ("build", "height", "labia_size", "clitoris_size", "labia_color", "pubic_hair", "outfit"),
}
_PART_FRAME = {
    "head0": "portrait, face focus",
    "head": "portrait, face focus",
    "bust0": "upper body, head out of frame",
    "bust": "upper body, head out of frame",
    "lower0": "lower body, head out of frame",
    "lower": "lower body, head out of frame",
}
_STYLE_TAGS = {
    "anime": "anime",
    "realistic": "photorealistic",
    "pixel": "pixel art",
}


def part_tag_line(
    character: dict | None,
    part: str,
    *,
    dressed: bool = True,
    art_style: str = "anime",
) -> tuple[str, list[str]]:
    """一段生圖 = 一行 tag。第一輪 dressed=False 不寫服裝。"""
    ch = character if isinstance(character, dict) else {}
    stage = "" if not dressed else str(ch.get("stage") or "")
    parts, unknown = appearance_en_parts(ch, clothed=dressed, stage=stage)
    seg = (part or "").lower().rstrip("0") or "bust"
    keys = _PART_KEYS.get(seg, _PART_KEYS["bust"])
    bits = ["1girl", HUMAN_TAGS]
    if not dressed:
        bits.append("nude")
    for k in keys:
        if k == "outfit" and not dressed:
            continue
        if k in _GENITAL_PART_KEYS and dressed:
            continue
        if parts.get(k):
            bits.append(parts[k])
    sp_seg, _, sp_unk = resolve_specials(ch)
    unknown += list(sp_unk)
    if sp_seg.get(seg):
        bits.append(", ".join(sp_seg[seg]))
    bits.append(_PART_FRAME.get((part or "").lower(), "upper body"))
    bits.append(_STYLE_TAGS.get((art_style or "anime").lower(), "anime"))
    bits.append("simple background")
    return flatten_tags(*bits), unknown


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
    scene: bool = False,
    stage: str = "",
) -> tuple[str, list[str]]:
    """回 (positive prompt, 查不到對照的原文清單)。

    分段(part)時只放該段真的要畫的欄位——整張畫時模型會把所有特徵糊在一起,
    這是分段生圖存在的理由,tag 版本要維持同樣的取捨。

    dressed=False(第一輪素體)時不放服裝欄位。跟中文那版一樣,靠「不提衣服」
    而不是「說不要衣服」——講到服裝的抽象詞只會讓模型自己補一件上去。

    outfit 給值 = 指定要穿的那一套(生涯服裝或個人衣櫃裡的某一套);留空才退回
    look.style。特殊屬性會蓋掉對應的一般欄位,見 resolve_specials。

    scene=True（出卡互動）：身份 tags 仍在最前，但不寫 solo / looking at viewer，
    讓 extra 的互動動作能畫出兩人或對視，而不是站樁 solo 立繪。
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

    extra_pos, extra_neg = split_pos_neg_tags(extra)
    extra, extra_aside = split_paren_aside(extra_pos)
    extra_l = extra.lower()
    nsfw_act = is_nsfw_act(extra)
    keep_act = keeps_stage_clothes(extra)
    # 口交／背後交配不靠動作把陌生／朋友升到露胸或扯開衣服；裸只留給妻子
    level = clothing_level(
        stage,
        nsfw_act=nsfw_act and not keep_act,
        character=ch,
    )
    keep_clothes = dressed and level == "covered" and not (nsfw_act and not keep_act)
    # 雙人／做愛／NTR 只寫 1man 1girl。不要 1boy／2people（人數衝突、畫風跑掉）。
    multi = scene and is_multi_scene(extra)
    pov = is_pov_cam(extra)
    if scene:
        if multi:
            bits: list[str] = [
                QUALITY_PREFIX,
                "1man",
                "1girl",
                HUMAN_TAGS,
            ]
        else:
            bits = [QUALITY_PREFIX, "1girl", HUMAN_TAGS]
        # 第三人稱／不要看鏡頭：只給雙人 NTR／交配。玩家 POV 對話不要加。
        if multi and not pov:
            bits.append("not looking at viewer")
            bits.append("third person view")
            bits.append("no first person")
            bits.append("not pov")
    else:
        bits = [QUALITY_PREFIX, "1girl, solo", HUMAN_TAGS]
    # 年齡緊接在「她是誰」後面:動漫模型對前段權重高,年紀才壓得住
    bits.append(age_tags(age or look.get("age")))
    # 要去背的那幾張:先讓模型畫出一塊平背景,後製才摳得乾淨(見 cutout.py)。
    # simple background / white background 是 danbooru 訓練得很紮實的一組。
    if flat_bg:
        bits.append(FLAT_BG_TAGS)

    p = (part or "").lower()
    seg = p.rstrip("0") if p else ""

    # 取景先寫,模型才知道要畫哪一塊
    lower_shot = (framing or "").lower() == "lower"
    if p in PART_FRAMING:
        bits.append(PART_FRAMING[p])
    else:
        fr = FRAMING.get(framing, "upper body")
        # 回頭看臉時不要 head out of frame，否則表情畫不出來
        if lower_shot and extra_has_key(extra, ("looking back",)):
            fr = filter_tag_chunk(fr, ("head out of frame",))
        bits.append(fr)

    if (not p or seg == "head") and not lower_shot:
        # 臉分五軸(臉型/眼/嘴/髮型/髮色)+瞳色:只寫「大眼睛、長直髮」畫出來的臉
        # 每次都不一樣,細到這個程度才看得出是同一個人。
        bits += [tr(FACE, "face"), tr(EYES, "eyes"), tr(EYE_COLOR, "eye_color"),
                 tr(MOUTH, "mouth"),
                 tr(HAIR_COLOR, "hair_color"), tr(HAIR, "hair"), tr(FEATURE, "feature")]
        bits += sp_seg["head"]
        # 純立繪對鏡；出卡場景由 extra 決定對視對象，不強制 looking at viewer
        if not p and not scene:
            bits.append("looking at viewer")
    rating_l = (rating or "sfw").lower()
    # 乳暈／乳頭只在妻子 exposed；女友留胸型但不寫乳頭。不要被 rating=sfw 蓋掉階段。
    skip_areola = level != "exposed"

    if (not p or seg == "bust") and not lower_shot:
        bust = "" if "bust" in sp_over else compose_bust_en(look, unknown)
        bits.append(bust_tags_for_level(bust, level))
        if level == "exposed":
            bits += [tr(AREOLA, "areola"), tr(NIPPLE, "nipple")]
    if not p or seg in ("bust", "lower"):
        bits += [tr(BUILD, "build")]
    if (p and seg == "lower") or (not p and lower_shot):
        h = look.get("height_cm")
        if h:
            bits.append("long legs" if int(h or 0) >= 170 else "petite")
    if (not p or seg == "bust") and not lower_shot:
        for t in sp_seg["bust"]:
            cleaned = bust_tags_for_level(t, level)
            if cleaned:
                bits.append(cleaned)
    if not p or seg == "lower":
        bits += sp_seg["lower"]
    # 性器軸：下半素體、或 extra 已經在畫陰部時才寫，避免把頭／半身／摸臀拉去下體
    show_genitals = extra_has_key(extra, _GENITAL_KEYS) or (bool(p) and seg == "lower" and not dressed)
    if show_genitals:
        bits += [
            tr(LABIA_SIZE, "labia_size"),
            tr(CLITORIS_SIZE, "clitoris_size"),
            tr(LABIA_COLOR, "labia_color"),
            tr(PUBIC_HAIR, "pubic_hair"),
        ]

    if not p or seg in ("bust", "lower"):
        if "skin" not in sp_over:
            bits.append(SKIN.get(skin, "") if skin else "")
            if skin and skin not in SKIN:
                unknown.append(f"skin: {skin}")

    if dressed:
        # 沒有任何服裝 tag = 模型自由發揮 = 多半不穿。查不到對照就墊一件,
        # 寧可衣服普通,也不要因為池子改過一個字就整張變裸的。
        worn = (outfit or "").strip() or str(look.get("style") or "").strip()
        tag = outfit_en(worn)
        if worn and not tag:
            unknown.append(f"outfit: {worn}")
        if lower_shot:
            if level == "exposed":
                bits.append("nude")
            else:
                bits.append(filter_tag_chunk(tag or CLOTHES_FALLBACK, _UPPER_OUTFIT_DROP))
        elif nsfw_act and level != "exposed" and not keep_act:
            bits.append(tag or CLOTHES_FALLBACK)
            bits.append("clothes pulled aside or partially undressed")
        else:
            bits.append(outfit_tags_for_level(tag, level))
        # 生涯服裝自己就是一整套配色(護士服是白的、巫女服是紅白),再疊一組
        # 隨機配色只會打架。個人衣櫃那邊才用得上調色盤。
        if palette and worn not in CAREER_OUTFIT:
            if palette in PALETTE:
                bits.append(PALETTE[palette])
            else:
                unknown.append(f"palette: {palette}")

    bits.append(ART_STYLE.get(art_style, ""))
    if level == "covered":
        bits.append(RATING["sfw"])
    else:
        bits.append(RATING.get("nsfw", "nsfw"))
    # 出卡：extra = 層②運鏡 visualEn + 層③ AI 反應神態，接在身份（層①）後面
    if extra.strip():
        bits.append(extra.strip())
    # 小括號內容接最後，不當主構圖（SD 無法真的畫分鏡，只當弱提示）
    if extra_aside.strip():
        bits.append(extra_aside.strip())
    # 陌生／朋友再釘一次穿衣；女友／妻子不要 covered breasts 蓋掉胸型
    # 腰部以下特寫不要寫胸，否則鏡頭會被拉回上半身
    if keep_clothes:
        bits.append("fully clothed" if lower_shot else "fully clothed, covered breasts, clothes covering chest")

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
