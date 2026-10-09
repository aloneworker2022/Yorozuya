"""她在日本生活用的骰子資料。從 10/5 刪掉的手機版（60aa0ff^ 的 japan_shift／japan_stroll／japan_scp／japan_jobs）搬過來。

規則和機率在 life_agent.py；這裡只放表。模型只負責把抽到的事寫成 2～4 句。
"""

MOODS = ("平靜", "愉快", "不悅", "低落", "不安", "虛脫")

# 打工：tone 決定工作的調性（詭異的班比較容易撞到異常）；band 決定這份班適合的時段。
JOBS = [
    {"id": "konbini", "tone": "normal", "band": "night", "name": "便利商店的晚班"},
    {"id": "cashier", "tone": "normal", "band": "day", "name": "超市收銀"},
    {"id": "cafe-kitchen", "tone": "normal", "band": "day", "name": "咖啡店內場"},
    {"id": "izakaya", "tone": "normal", "band": "night", "name": "居酒屋端盤子"},
    {"id": "bookstore", "tone": "normal", "band": "day", "name": "書店整理書架"},
    {"id": "ramen", "tone": "normal", "band": "any", "name": "拉麵店洗碗"},
    {"id": "flyers", "tone": "normal", "band": "day", "name": "車站前發傳單"},
    {"id": "drugstore", "tone": "normal", "band": "day", "name": "藥妝店補貨"},
    {"id": "ryokan", "tone": "uncommon", "band": "day", "name": "溫泉旅館的房務"},
    {"id": "shrine", "tone": "uncommon", "band": "day", "name": "神社授與所"},
    {"id": "aquarium", "tone": "uncommon", "band": "day", "name": "水族館餵食"},
    {"id": "florist", "tone": "uncommon", "band": "day", "name": "花店包花"},
    {"id": "tackle", "tone": "uncommon", "band": "day", "name": "釣具店看店"},
    {"id": "cinema", "tone": "uncommon", "band": "any", "name": "電影院賣票"},
    {"id": "records", "tone": "uncommon", "band": "any", "name": "二手唱片行"},
    {"id": "moving", "tone": "uncommon", "band": "day", "name": "搬家公司當助手"},
    {"id": "cemetery", "tone": "eerie", "band": "day", "name": "靈園的管理員助手"},
    {"id": "cleanup", "tone": "eerie", "band": "night", "name": "半夜出動的特殊清掃"},
    {"id": "photo", "tone": "eerie", "band": "any", "name": "沒有客人的舊照相館"},
    {"id": "rain-cafe", "tone": "eerie", "band": "any", "name": "只在雨天出攤的咖啡"},
    {"id": "closed-inn", "tone": "eerie", "band": "night", "name": "停業旅館裡還排著的班"},
    {"id": "unmanned", "tone": "eerie", "band": "night", "name": "監視器前的無人店"},
    {"id": "radio", "tone": "eerie", "band": "night", "name": "午夜電台的接線"},
    {"id": "warehouse", "tone": "eerie", "band": "night", "name": "倉庫夜班"},
]
JOB_TONE_WEIGHT = {"normal": 3, "uncommon": 2, "eerie": 1}

# 上班碰上的人（japan_shift.js）
SHIFT_ROLES = [{"id": "coworker", "name": "同事"}, {"id": "customer", "name": "顧客"}]
EMOTIONS = [
    {"id": "joy", "name": "喜"},
    {"id": "anger", "name": "怒"},
    {"id": "sorrow", "name": "哀"},
    {"id": "delight", "name": "樂"},
]
# know：會互相知道名字（以前是交朋友的入口；交友現在延後重做，這裡只記「知道名字」）
SHIFT_ACTS = [
    {"id": "glance", "name": "打了照面", "know": False},
    {"id": "together", "name": "一起做事", "know": False},
    {"id": "argue", "name": "起了爭執", "know": False},
    {"id": "help", "name": "幫了忙", "know": False},
    {"id": "blame", "name": "被責怪", "know": False},
    {"id": "chat", "name": "聊了一陣", "know": True},
    {"id": "contact", "name": "留了連絡方式", "know": True},
    {"id": "quiet", "name": "幾乎沒說話", "know": False},
    {"id": "favor", "name": "被拜託私事", "know": True},
    {"id": "return", "name": "又回頭來找她", "know": True},
]

# 亂逛（japan_stroll.js）：日常 3、奇遇 2、詭異恐怖 1
STROLL_TONES = [
    {"id": "daily", "name": "日常", "weight": 3},
    {"id": "wonder", "name": "奇遇", "weight": 2},
    {"id": "horror", "name": "詭異恐怖", "weight": 1},
]
STROLL_PLACES = [
    {"id": "shotengai", "name": "商店街"},
    {"id": "shrine", "name": "神社"},
    {"id": "river", "name": "河邊"},
    {"id": "station", "name": "車站前"},
    {"id": "park", "name": "公園"},
    {"id": "alley", "name": "巷子"},
    {"id": "bridge", "name": "橋上"},
    {"id": "market", "name": "市場"},
]
STROLL_SOLO = {
    "daily": [
        {"id": "pass", "name": "只是走過去"},
        {"id": "sit", "name": "停下來坐一下"},
        {"id": "rain", "name": "躲了一場雨"},
        {"id": "lost", "name": "迷路又走回來"},
        {"id": "view", "name": "看了一會兒風景"},
        {"id": "eat", "name": "買了點吃的"},
        {"id": "crowd", "name": "跟著人潮走"},
        {"id": "corner", "name": "在角落待著"},
        {"id": "dusk", "name": "天色暗了才離開"},
        {"id": "sound", "name": "聽見一段不相干的聲音"},
    ],
    "wonder": [
        {"id": "lucky", "name": "碰上不該那麼巧的事"},
        {"id": "gift", "name": "得到一個小好處"},
        {"id": "path", "name": "路突然變得不一樣"},
        {"id": "guide", "name": "被什麼東西引了一小段"},
    ],
    "horror": [
        {"id": "followed", "name": "感覺有東西跟著"},
        {"id": "wrong", "name": "看到不該出現的東西"},
        {"id": "sound", "name": "聲音對不上"},
        {"id": "road", "name": "路和記憶不一樣"},
    ],
}
STROLL_PERSON = {
    "daily": [
        {"id": "glance", "name": "打了照面", "know": False},
        {"id": "yield", "name": "讓了一下路", "know": False},
        {"id": "argue", "name": "起了爭執", "know": False},
        {"id": "help", "name": "幫了忙", "know": False},
        {"id": "blame", "name": "被責怪", "know": False},
        {"id": "chat", "name": "聊了一陣", "know": True},
        {"id": "contact", "name": "留了連絡方式", "know": True},
        {"id": "quiet", "name": "幾乎沒說話", "know": False},
        {"id": "favor", "name": "被拜託私事", "know": True},
        {"id": "return", "name": "走遠又回頭", "know": True},
    ],
    "wonder": [
        {"id": "greet", "name": "被誰特別招呼", "know": False},
        {"id": "help", "name": "幫了忙", "know": False},
        {"id": "chat", "name": "聊了一陣", "know": True},
        {"id": "contact", "name": "留了連絡方式", "know": True},
        {"id": "return", "name": "走遠又回頭", "know": True},
    ],
    "horror": [
        {"id": "stare", "name": "被盯著看", "know": False},
        {"id": "talk", "name": "被搭話", "know": False},
        {"id": "follow", "name": "被人跟著走", "know": False},
        {"id": "gone", "name": "人突然不在了", "know": False},
    ],
}
STROLL_TONE_RULE = {
    "daily": "這是日常。寫平常會發生的小事，不要寫成奇遇，也不要寫成恐怖。",
    "wonder": "這是奇遇。寫一件不太該那麼巧、但還不恐怖的事。不要寫鬼，不要寫血腥。",
    "horror": "這是詭異恐怖。寫讓人不安、說不清的事。停在害怕。不要寫血腥、傷口、傷害過程或獵奇細節。",
}

# SCP（japan_scp.js）：同一件分三步，第一次 1/15，已經開始的再遇到 1/2 進下一步。
# grounds：綁在哪個真實地點（亂逛時才會碰到）；work：打工時也可能碰到。
SCP_FIRST_CHANCE = 1 / 15
SCP_NEXT_CHANCE = 1 / 2
SCP_EVENTS = [
    {"id": "173", "code": "SCP-173", "title": "混凝土雕像", "grounds": ["asakusa"], "work": True, "stages": [
        "餘光裡，雕像好像不在剛才的位置。盯著看的時候它不動。",
        "她一眨眼，雕像明顯靠近了。旁邊的人也看見了。",
        "只要視線離開，它就在動。他們不敢眨眼，也不敢轉頭。",
    ]},
    {"id": "106", "code": "SCP-106", "title": "穿牆的老人", "grounds": ["kamakura"], "stages": [
        "牆上有一塊不該有的潮濕、發暗的痕跡。",
        "那塊痕跡裡慢慢鼓出一隻手的形狀。",
        "一個腐爛的老人從牆裡跨出一步。她退開，沒有讓他碰到。",
    ]},
    {"id": "096", "code": "SCP-096", "title": "不該看清的臉", "grounds": ["aomori-city"], "stages": [
        "遠處有個瘦長的人，臉還沒看清。",
        "她不小心看清了那張蒼白瘦長的臉。",
        "她知道那東西已經知道被看過。只寫被盯上的感覺，不要寫追逐。",
    ]},
    {"id": "087", "code": "SCP-087", "title": "沒有底的樓梯", "grounds": ["hakodate-motomachi"], "stages": [
        "樓裡多了一道往下的樓梯，燈比別處暗。",
        "階梯數不完，下面有聲音，又好像沒有。",
        "黑暗深處有一張臉對著她。她停在入口，沒有下去。",
    ]},
    {"id": "513", "code": "SCP-513", "title": "一聲鐘", "grounds": ["dogo"], "work": True, "stages": [
        "不知道哪裡響了一聲鐘，周圍的人沒有反應。",
        "之後她在沒人的角落瞥見一個模糊人影，一看又沒有。",
        "人影比上次近，而且是在她確定沒有人的地方。",
    ]},
    {"id": "701", "code": "SCP-701", "title": "弔王悲劇", "grounds": ["higashiyama"], "stages": [
        "牆上貼著《弔王悲劇》的海報，她只覺得名字不舒服。",
        "海報上的一句話她讀了，就忘不掉。",
        "她開始不受控制地想起下一句。只寫這個侵入，不要寫完整劇情。",
    ]},
    {"id": "1471", "code": "SCP-1471", "title": "相片裡的身影", "grounds": ["dotonbori"], "work": True, "stages": [
        "手機裡多了一個她沒裝過的程式。",
        "相片背景裡有一隻瘦高的影子，臉像骷髏。",
        "那個影子比上一張相片更近，幾乎就在她身後。",
    ]},
    {"id": "3008", "code": "SCP-3008", "title": "走不完的店", "grounds": ["osu"], "work": True, "stages": [
        "店比看起來深，她一時找不到剛才的入口。",
        "走道在重複，招牌一樣，出口還是不在。",
        "她明白這家店沒有盡頭。她還在裡面。",
    ]},
    {"id": "049", "code": "SCP-049", "title": "鳥嘴面具", "grounds": ["kurashiki"], "stages": [
        "人群裡有一個鳥嘴面具，她以為是人在玩。",
        "那個人穿過現代的街道，朝她伸手。",
        "手伸得很近。她避開了，沒有被碰到。",
    ]},
    {"id": "2316", "code": "SCP-2316", "title": "海裡不該認的人", "grounds": ["naha"], "stages": [
        "海面上有幾個站著的人，遠得看不清。",
        "她覺得那些人有點眼熟，又立刻不該這樣想。",
        "她沒有承認自己認得。那些人還在，而且好像更近。",
    ]},
    {"id": "426", "code": "SCP-426", "title": "只能稱作我的家電", "work": True, "stages": [
        "一台小家電。她想叫它，嘴裡卻說成「我」。",
        "別人想糾正，自己也只能說「我」。",
        "那台家電好像才是在說話的那個「我」。她沒有再指它。",
    ]},
]

# 碰到的人：名字由程式抽，不叫模型取（之後交友重做時用得到同一個人）
SURNAMES = [
    "佐藤", "鈴木", "高橋", "田中", "伊藤", "渡邊", "山本", "中村", "小林", "加藤",
    "吉田", "山田", "佐佐木", "山口", "松本", "井上", "木村", "林", "清水", "山崎",
    "森", "池田", "橋本", "阿部", "石川", "前田", "藤田", "岡田", "後藤", "長谷川",
]
GIVEN_M = ["翔太", "大輔", "健太", "拓也", "直樹", "亮", "達也", "悠斗", "和也", "誠", "隆", "修", "慎吾", "陽介", "蓮"]
GIVEN_F = ["美咲", "陽菜", "葵", "結衣", "彩", "真由", "千尋", "沙織", "優子", "舞", "香織", "楓", "菜摘", "遙", "凜"]
