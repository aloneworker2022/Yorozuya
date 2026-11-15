"""故事卡牌組（2026-11-15 其欸）：給 story_cards.py 抽卡引擎用的正式牌。

這裡用比較短的 C(...) 寫，最後 to_engine() 轉成引擎的格式（validate_card），DECK 是載入好的牌組。
  - 落腳地 grounds 轉成引擎的 region（japan_grounds.js 的 regionId）。
  - 祭典轉成季節（引擎只認四季）；spot:<地點> 轉成起牌的 place。
  - weight 的 timid／curious／brave／calm 轉成個性字 traits（膽小／好奇／大膽／冷靜）；性慾交給 heat。
  - 合牌的 growth 轉成 learn（interest→love、attitude→lesson（帶「怕」→fear）、habit、speech；第一次牌→first）。
內容：色情只寫成年人、你情我願（她多半旁觀），不寫動物、未成年、脅迫或強迫；引擎載入時 BAN_RE 也會擋。
"""
from story_cards import load_deck


GROUND_REGION = {
    "sapporo-susukino": "hokkaido", "hakodate-motomachi": "hokkaido", "sendai-ichibancho": "tohoku", "aomori-city": "tohoku",
    "asakusa": "kanto", "kamakura": "kanto", "osu": "chubu", "kanazawa": "chubu", "higashiyama": "kinki", "dotonbori": "kinki",
    "hiroshima": "chugoku", "kurashiki": "chugoku", "dogo": "shikoku", "kochi": "shikoku", "hakata": "kyushu", "naha": "kyushu",
}
FESTIVAL_SEASON = {"festival:tanabata": "summer", "festival:nebuta": "summer", "festival:obon": "summer",
                   "festival:hanabi": "summer", "festival:hanami": "spring"}
SLOT_ZH = {"ki": "起", "sho": "承", "ten": "轉", "ketsu": "合"}
DECK_ENGINE = {"daily": "daily", "wonder": "daily", "horror": "horror", "ero": "erotic", "first": "first"}
TRAIT_ZH = {"timid": "膽小", "curious": "好奇", "brave": "大膽", "calm": "冷靜"}
PLACE_SPOTS = {"shotengai", "shrine", "river", "station", "park", "alley", "bridge", "market"}

def C(id, slot, deck, text, needs=(), gives=(), grounds=(), season=(), weight=None,
      react="", growth=None, heat=0, fear=0, once=None):
    return {"id": id, "slot": slot, "deck": deck, "text": text,
            "needs": list(needs), "gives": list(gives), "grounds": list(grounds),
            "season": list(season), "weight": dict(weight or {}), "react": react,
            "growth": growth, "heat": heat, "fear": fear,
            "once": (slot == "first") if once is None else once}


def G(kind, text):
    return {"kind": kind, "text": text}


# ───────────── 地方起卡（日常／奇遇，每個落腳地一張在地風俗） ─────────────
PLACE = [
    C("susukino-snow", "ki", "daily", "薄野路邊的雪堆比她還高，有人在雪上用手指寫告白。", gives=["theme:local"], grounds=["sapporo-susukino"], season=["winter"]),
    C("hakodate-morning-market", "ki", "daily", "函館朝市的阿姨塞了一隻烤花枝給她，說「試吃不用錢」。", gives=["theme:local"], grounds=["hakodate-motomachi"]),
    C("sendai-tanabata", "ki", "wonder", "一番町的拱廊掛滿巨大的七夕吹流，有人遞給她一張短冊。", gives=["theme:local"], grounds=["sendai-ichibancho"], season=["festival:tanabata"]),
    C("aomori-nebuta", "ki", "wonder", "巨大的發光燈籠人偶從街上經過，跳人喊著「ラッセラー」。", gives=["theme:local"], grounds=["aomori-city"], season=["festival:nebuta"]),
    C("asakusa-omikuji", "ki", "daily", "淺草寺抽到「凶」，旁邊的人說要綁在架子上留在寺裡。", gives=["theme:local"], grounds=["asakusa"]),
    C("kamakura-enoden", "ki", "daily", "江之電的平交道噹噹響，一群人舉著手機等電車和海一起入鏡。", gives=["theme:local"], grounds=["kamakura"]),
    C("osu-maid", "ki", "daily", "大須商店街的女僕在發傳單，叫她「お嬢様」。", gives=["theme:local"], grounds=["osu"]),
    C("kanazawa-goldleaf", "ki", "daily", "店裡的冰淇淋整片包著金箔，她不知道能不能吃。", gives=["theme:local"], grounds=["kanazawa"]),
    C("higashiyama-maiko", "ki", "wonder", "二年坂一位舞妓小碎步走過，觀光客追著拍，她也跟著停住。", gives=["theme:local"], grounds=["higashiyama"]),
    C("dotonbori-takoyaki", "ki", "daily", "章魚燒攤老闆用關西腔問她要不要「マヨ」，她聽不懂。", gives=["theme:local"], grounds=["dotonbori"]),
    C("hiroshima-cranes", "ki", "daily", "和平紀念公園的紙鶴牆前，一位老爺爺教她折紙鶴。", gives=["theme:local"], grounds=["hiroshima"]),
    C("kurashiki-canal", "ki", "daily", "倉敷運河的小船船夫邀她上船，說今天客人少不收錢。", gives=["theme:local"], grounds=["kurashiki"]),
    C("dogo-bath-rule", "ki", "daily", "道後溫泉本館前大家脫鞋排隊，她不知道要先做什麼。", gives=["theme:local", "spot:onsen"], grounds=["dogo"]),
    C("kochi-sunday-market", "ki", "daily", "高知週日市集的攤子一路排到城門，阿伯推銷自家的柚子醋。", gives=["theme:local"], grounds=["kochi"]),
    C("hakata-yatai", "ki", "daily", "中洲河邊的屋台擠滿陌生人，老闆要她坐到別人旁邊。", gives=["theme:local"], grounds=["hakata"]),
    C("naha-shisa", "ki", "wonder", "每戶屋頂都蹲著一對獅子，一隻張嘴一隻閉嘴，她盯著看了很久。", gives=["theme:local"], grounds=["naha"]),
]
LOCAL_FOLLOW = [
    C("local-sho-explain", "sho", "daily", "旁邊的人看她一臉茫然，停下來用很慢的日文解釋給她聽。", needs=["theme:local"]),
    C("local-sho-join", "sho", "daily", "人越來越多，她被擠到最前面，只好跟著大家一起做。", needs=["theme:local"]),
    C("local-sho-mistake", "sho", "daily", "她照自己的理解做了，周圍的人一起笑出來，不是壞意的笑。", needs=["theme:local"]),
    C("local-ten-watch", "ten", "daily", "她決定先站在旁邊看懂再說。", needs=["theme:local"], react="watch", gives=["react:watch"], weight={"timid": 2}),
    C("local-ten-try", "ten", "daily", "她學著別人的樣子試了一次。", needs=["theme:local"], react="approach", gives=["react:approach"], weight={"curious": 2}),
    C("local-ten-leave", "ten", "daily", "她覺得太丟臉，找了個藉口走開。", needs=["theme:local"], react="flee", gives=["react:flee"], weight={"timid": 1.5}),
    C("local-ketsu-learn", "ketsu", "daily", "回去的路上她一直在想剛才的事，覺得這裡的人規矩好多。", needs=["theme:local"], growth=G("attitude", "開始留意這裡的規矩")),
    C("local-ketsu-like", "ketsu", "daily", "她記住了那個味道和那條路，打算下次自己再來。", needs=["theme:local", "react:approach"], growth=G("interest", "喜歡上這一帶的在地小事")),
    C("local-ketsu-ask", "ketsu", "daily", "她還是沒完全搞懂，想回房間問問他。", needs=["theme:local", "react:watch"], growth=G("habit", "把看不懂的事記下來想問人")),
]

# ───────────── 詭異恐怖：日本都市傳說＋SCP 風格 ─────────────
HORROR_KI = [
    C("kisaragi", "ki", "horror", "末班電車一直沒停站，最後停在一個站名牌寫著「きさらぎ」的月台。", gives=["theme:kisaragi", "spot:station"], fear=1),
    C("hasshaku", "ki", "horror", "圍牆後面露出一頂白帽子，牆有兩公尺高，帽子還在牆上面。遠處傳來「ぽぽぽ」的聲音。", gives=["theme:hasshaku"], fear=1),
    C("kuchisake", "ki", "horror", "傍晚的巷口站著戴大口罩的長髮女人，問她：「我漂亮嗎？」", needs=[], gives=["theme:kuchisake", "spot:alley"], fear=1),
    C("teke-teke", "ki", "horror", "平交道邊傳來「テケテケ」的聲音，像有人用手肘在地上爬。", gives=["theme:teketeke", "spot:station"], fear=1),
    C("kokkuri", "ki", "horror", "住處樓下幾個年輕人在玩こっくりさん，十円硬幣自己滑到她的名字上。", gives=["theme:kokkuri"], fear=1),
    C("tunnel", "ki", "horror", "舊隧道裡的燈一盞一盞熄掉，出口那頭有人在招手。", gives=["theme:tunnel"], fear=1),
    C("room-mirror", "ki", "horror", "凌晨兩點的洗手間鏡子裡，她的倒影慢了半拍才眨眼。", gives=["theme:mirror"], fear=1),
    C("red-room", "ki", "horror", "手機跳出一個紅色彈窗：「你喜歡紅色的房間嗎？」關不掉。", gives=["theme:redroom"], fear=1),
    C("scp-vending", "ki", "horror", "巷子底多了一台沒插電的自動販賣機，按鈕上寫的不是飲料，是人名。", gives=["theme:scp-vending", "spot:alley"], fear=1),
    C("scp-door", "ki", "horror", "公寓走廊多了一扇她從沒看過的門，門牌是她自己的房號。", gives=["theme:scp-door"], fear=1),
    C("scp-crowd", "ki", "horror", "車站的人潮突然全部停下，同時轉頭看向同一個方向，只有她還在動。", gives=["theme:scp-crowd", "spot:station"], fear=1),
    C("scp-shrine-fox", "ki", "wonder", "神社的狐狸石像嘴裡咬的鑰匙，今天換成了她住處的鑰匙。", gives=["theme:scp-fox", "spot:shrine"], fear=0),
]
HORROR_SHO = [
    C("kisaragi-sho", "sho", "horror", "月台外只有草原，遠處有太鼓和鈴聲，手機還有一格訊號。", needs=["theme:kisaragi"], gives=["fear:2"], fear=2),
    C("hasshaku-sho", "sho", "horror", "隔天那頂白帽子出現在她窗外，聲音就在耳邊。", needs=["theme:hasshaku"], fear=2),
    C("kuchisake-sho", "sho", "horror", "女人拉下口罩，嘴角一路裂到耳下，又問了一次：「這樣也漂亮嗎？」", needs=["theme:kuchisake"], fear=2),
    C("teketeke-sho", "sho", "horror", "回頭看，只有上半身的女人用雙手撐著地，正朝她爬過來。", needs=["theme:teketeke"], fear=2),
    C("kokkuri-sho", "sho", "horror", "大家的手都放開了，硬幣還在動，拼出「かえらない」。", needs=["theme:kokkuri"], fear=2),
    C("tunnel-sho", "sho", "horror", "她往回走，可是入口變得越來越遠，背後的腳步聲跟她同步。", needs=["theme:tunnel"], fear=2),
    C("mirror-sho", "sho", "horror", "鏡子裡的她先笑了，她自己沒有。", needs=["theme:mirror"], fear=2),
    C("redroom-sho", "sho", "horror", "彈窗下面多了一串名字，最後一個是她的。", needs=["theme:redroom"], fear=2),
    C("vending-sho", "sho", "horror", "她看到隔壁阿姨的名字，按鈕旁的燈亮著「売り切れ」。", needs=["theme:scp-vending"], fear=2),
    C("door-sho", "sho", "horror", "門縫底下透出光，裡面有人在用她的聲音講電話。", needs=["theme:scp-door"], fear=2),
    C("crowd-sho", "sho", "horror", "所有人的嘴同時動了，說的是她剛才心裡想的那句話。", needs=["theme:scp-crowd"], fear=2),
    C("fox-sho", "sho", "wonder", "她伸手去拿，狐狸石像輕輕鬆口，鑰匙是溫的。", needs=["theme:scp-fox"]),
    C("horror-sho-generic", "sho", "horror", "周圍的聲音全部消失了，連自己的呼吸都聽不見。", fear=2),
]
HORROR_TEN = [
    C("horror-ten-run", "ten", "horror", "她轉身就跑，不敢回頭。", react="flee", gives=["react:flee"], weight={"timid": 2.5, "curious": 0.5}),
    C("horror-ten-freeze", "ten", "horror", "她腳軟得動不了，只能盯著看。", react="watch", gives=["react:watch"], weight={"timid": 1.5}),
    C("horror-ten-answer", "ten", "horror", "她深吸一口氣，回答了那個問題。", react="approach", gives=["react:approach"], weight={"curious": 2, "brave": 2}),
    C("horror-ten-touch", "ten", "horror", "她忍不住伸手碰了一下。", react="approach", gives=["react:approach"], weight={"curious": 2.5, "timid": 0.3}),
    C("horror-ten-pray", "ten", "horror", "她想起神社看過的動作，合掌拍了兩下。", react="watch", gives=["react:watch"], weight={"calm": 2}),
]
HORROR_KETSU = [
    C("horror-ketsu-flee", "ketsu", "horror", "她跑到有便利商店燈光的地方才停下來，之後那條路都繞遠路走。", needs=["react:flee"], growth=G("attitude", "怕那一帶，會繞路")),
    C("horror-ketsu-watch", "ketsu", "horror", "一眨眼什麼都沒有了，但她記住了那個畫面，晚上開著燈睡。", needs=["react:watch"], growth=G("habit", "開著燈睡覺")),
    C("horror-ketsu-approach", "ketsu", "horror", "那東西好像對她失去了興趣，消失了。她手心留著一點冰冷的觸感，從此對這類傳說特別好奇。", needs=["react:approach"], growth=G("interest", "迷上日本的都市傳說")),
    C("kisaragi-ketsu", "ketsu", "horror", "一位老人開車送她到「比奈站」，她再回頭時，車和老人都不見了。手機裡多了一張拍不清楚的月台照片。", needs=["theme:kisaragi"], growth=G("attitude", "不敢搭末班車")),
    C("kuchisake-ketsu", "ketsu", "horror", "她丟出一顆糖說「普通吧」，女人愣住，撿起糖走掉了。她之後口袋裡都放一顆糖。", needs=["theme:kuchisake", "react:approach"], growth=G("habit", "口袋裡隨時放一顆糖")),
    C("fox-ketsu", "ketsu", "wonder", "那把鑰匙打不開任何門，但她帶在身上，覺得被保佑了。", needs=["theme:scp-fox"], growth=G("attitude", "相信稻荷神社的狐狸")),
]

# ───────────── 色情變態（成年人、你情我願；她多半是旁觀者） ─────────────
ERO_KI = [
    C("affair-lovehotel", "ki", "ero", "賓館街的入口，一個戴婚戒的男人摟著年輕女同事，兩個人四處張望才進去。", gives=["theme:affair"], heat=1),
    C("affair-office", "ki", "ero", "打烊後的店裡，店長和已婚的兼職阿姨躲在倉庫，門沒關好。", gives=["theme:affair-work"], heat=1),
    C("cheat-neighbor", "ki", "ero", "隔壁太太趁先生出差，帶了一個年輕男人回家，陽台窗簾半開。", gives=["theme:cheat"], heat=1),
    C("threesome-window", "ki", "ero", "對面公寓亮著燈，窗戶裡是兩女一男，三個人笑鬧著倒在床上。", gives=["theme:3p"], heat=1),
    C("swing-party", "ki", "ero", "傳單上寫著「大人の交流パーティー」，地址就在她每天經過的大樓。", gives=["theme:orgy"], heat=1),
    C("exhib-park", "ki", "ero", "深夜公園，一個穿長大衣的成年女人在男友鏡頭前慢慢解開扣子。", gives=["theme:exhib", "spot:park"], heat=1),
    C("exhib-onsen", "ki", "ero", "混浴露天溫泉裡，一對夫妻靠得越來越近，絲毫不在意旁邊有人。", gives=["theme:exhib", "spot:onsen"], heat=1),
    C("exhib-train", "ki", "ero", "空蕩的末班電車上，一對情侶坐在角落，女人的手伸進男人的外套下面。", gives=["theme:exhib", "spot:station"], heat=1),
    C("secret-shrine", "ki", "ero", "祭典的夜裡，神社後面的樹林傳來壓低的笑聲和衣服摩擦聲。", gives=["theme:festival-tryst", "spot:shrine"], season=["festival:obon", "festival:hanabi"], heat=1),
    C("succubus-sense", "ki", "ero", "她聞到一股很濃的慾望味道，是魅魔的本能，從某扇門後面飄出來。", gives=["theme:sense"], heat=1, weight={"lust": 2.5}),
]
ERO_SHO = [
    C("affair-sho", "sho", "ero", "她在賓館對面的便利商店，看見他們兩小時後出來，女人整理著亂掉的頭髮，男人把婚戒戴回去。", needs=["theme:affair"], heat=2),
    C("affair-work-sho", "sho", "ero", "倉庫裡傳來紙箱倒下的聲音，接著是阿姨捂住嘴的悶哼。", needs=["theme:affair-work"], heat=2),
    C("cheat-sho", "sho", "ero", "陽台上兩個人吻得很急，太太的裙子被撩到腰上，還一邊回先生的 LINE。", needs=["theme:cheat"], heat=2),
    C("3p-sho", "sho", "ero", "三個人輪流親來親去，其中一個女人發現窗外有人，反而對她眨了眨眼。", needs=["theme:3p"], heat=2),
    C("orgy-sho", "sho", "ero", "她好奇跟著上樓，門口的人看她是成年女性，遞給她一個面具。裡面燈光昏暗，好幾對人糾纏在一起。", needs=["theme:orgy"], heat=2),
    C("exhib-sho", "sho", "ero", "他們發現她在看，沒有停，反而更大膽了，像就是要被人看見。", needs=["theme:exhib"], heat=2),
    C("tryst-sho", "sho", "ero", "浴衣散在草地上，遠處的花火每亮一次，就照出兩個交疊的身影。", needs=["theme:festival-tryst"], heat=2),
    C("sense-sho", "sho", "ero", "她循著味道找到一間情趣用品店的後門，裡面在辦成人的私人派對。", needs=["theme:sense"], gives=["theme:orgy"], heat=2),
]
ERO_TEN = [
    C("ero-ten-leave", "ten", "ero", "她臉紅到耳根，快步走開。", react="flee", gives=["react:flee"], weight={"timid": 2.5, "lust": 0.5}),
    C("ero-ten-peek", "ten", "ero", "她躲在暗處，忍不住一直看下去。", react="watch", gives=["react:watch"], weight={"curious": 1.5, "lust": 1.5}),
    C("ero-ten-closer", "ten", "ero", "魅魔的本能被勾起來，她往前走了好幾步。", react="approach", gives=["react:approach"], weight={"lust": 3, "timid": 0.3}),
    C("ero-ten-caught", "ten", "ero", "她不小心踢到東西，所有人同時看向她。", react="watch", gives=["react:watch", "caught"], weight={}),
]
ERO_KETSU = [
    C("ero-ketsu-flee", "ketsu", "ero", "回到住處，她的心還在狂跳，那個畫面一閉眼就浮出來。", needs=["react:flee"], growth=G("attitude", "對那種事又怕又在意")),
    C("ero-ketsu-watch", "ketsu", "ero", "她看到結束才離開，回家的路上一直在想，人類原來會這樣。", needs=["react:watch"], growth=G("interest", "對人類的偷情很好奇")),
    C("ero-ketsu-approach", "ketsu", "ero", "他們邀她下次再來，她沒有答應，也沒有拒絕，性飢渴高了好幾天。", needs=["react:approach"], growth=G("attitude", "覺得這世界比想像中放得開")),
    C("ero-ketsu-caught", "ketsu", "ero", "對方只是笑著說了聲「おやすみ」，她丟臉得想鑽到地下。", needs=["caught"], growth=G("speech", "會小聲說「おやすみ」")),
    C("affair-ketsu", "ketsu", "ero", "後來她在超市看見那個男人陪著太太買菜，像什麼事都沒發生。", needs=["theme:affair"], growth=G("attitude", "知道人類會說謊")),
    C("cheat-ketsu", "ketsu", "ero", "隔天先生回來，太太在門口笑著迎接，跟她點頭打招呼的樣子完全正常。", needs=["theme:cheat"], growth=G("attitude", "不太相信婚戒")),
]

# ───────────── 第一次（每人一生一次） ─────────────
FIRST = [
    C("first-train", "first", "first", "第一次自己搭電車，不知道要先買票還是先刷卡。", growth=G("habit", "學會搭電車")),
    C("first-konbini", "first", "first", "第一次走進便利商店，店員問「要加熱嗎」。", growth=G("habit", "知道便利商店可以幫忙加熱")),
    C("first-sento", "first", "first", "第一次去錢湯，被阿婆提醒要先洗身體才進池。", growth=G("attitude", "知道錢湯的規矩")),
    C("first-rain", "first", "first", "第一次在這個世界淋到雨，傘是陌生人給的。", growth=G("habit", "會記得帶傘")),
    C("first-festival", "first", "first", "第一次看見祭典，跟著人群拍手。", growth=G("interest", "喜歡上祭典")),
    C("first-nanpa", "first", "first", "第一次被搭訕，不知道該怎麼拒絕。", growth=G("attitude", "學著應付陌生男人")),
    C("first-ramen", "first", "first", "第一次吃拉麵，看別人大聲吸麵，她也學著吸，嗆到了。", growth=G("habit", "吃麵會發出聲音")),
    C("first-garbage", "first", "first", "第一次倒垃圾被鄰居退回來，說今天不收可燃垃圾。", growth=G("habit", "會看垃圾分類日")),
    C("first-snow", "first", "first", "第一次看到雪，伸手接，雪在手心化掉。", season=["winter"], growth=G("interest", "喜歡雪")),
    C("first-sakura", "first", "first", "第一次看到滿開的櫻花，大家在樹下喝酒，有人分她一杯。", season=["festival:hanami"], growth=G("interest", "喜歡賞花")),
]


# 第一次牌：一張「第一次」當起，接通用的承／轉，合各自寫回她學到的那件事。
FIRST_FOLLOW = [
    C("first-sho-freeze", "sho", "first", "她站在原地愣住，偷看旁邊的人怎麼做。", gives=["first:copy"], weight={"timid": 2}),
    C("first-sho-ask", "sho", "first", "她鼓起勇氣，用破破的日文問了旁邊的人。", gives=["first:ask"], weight={"curious": 2, "brave": 1.5}),
    C("first-ten-ok", "ten", "first", "她照著做了一次，笨手笨腳，但成功了。", gives=["first:ok"]),
    C("first-ten-oops", "ten", "first", "她做錯了，周圍的人笑出來，有人走過來教她。", gives=["first:ok"], weight={"timid": 0.7}),
]


def _first_ketsu():
    out = []
    for f in FIRST:
        out.append(C(f["id"] + "-end", "ketsu", "first", "下一次再碰到，她已經不會慌了。",
                     needs=[f"first:{f['id']}", "first:ok"], growth=f["growth"]))
    return out


def to_engine(c: dict) -> dict:
    slot = "起" if c["slot"] == "first" else SLOT_ZH[c["slot"]]
    deck = DECK_ENGINE[c["deck"]]
    if c["id"].startswith(("scp-shrine-fox", "fox-")):
        deck = "horror"
    gives = [g for g in c["gives"] if not g.startswith("spot:")]
    if c["slot"] == "first":
        gives.append(f"first:{c['id']}")
    out = {"id": c["id"], "deck": deck, "slot": slot, "text": c["text"], "needs": list(c["needs"]), "gives": gives}
    if slot == "起":
        places = [g.split(":", 1)[1] for g in c["gives"] if g.startswith("spot:") and g.split(":", 1)[1] in PLACE_SPOTS]
        if places:
            out["place"] = places
        regions = sorted({GROUND_REGION[g] for g in c["grounds"]})
        if regions:
            out["region"] = regions
        seasons = sorted({FESTIVAL_SEASON.get(s, s) for s in c["season"]})
        if seasons:
            out["season"] = seasons
    traits = {TRAIT_ZH[k]: v for k, v in c["weight"].items() if k in TRAIT_ZH}
    if traits:
        out["traits"] = traits
    if c["weight"].get("lust") and not c["heat"]:
        out["heat"] = 1
    if c["heat"]:
        out["heat"] = min(3, c["heat"] + (1 if c["react"] == "approach" else 0))
    if slot == "合":
        g = c["growth"] or {}
        kind = {"interest": "love", "habit": "habit", "speech": "speech", "attitude": "lesson"}.get(g.get("kind"), "lesson")
        if "怕" in g.get("text", "") and kind == "lesson":
            kind = "fear"
        if c["deck"] == "first":
            kind = "first"
        out["learn"] = {"kind": kind, "text": g.get("text", "")}
    return out


RAW = (PLACE + LOCAL_FOLLOW + HORROR_KI + HORROR_SHO + HORROR_TEN + HORROR_KETSU
       + ERO_KI + ERO_SHO + ERO_TEN + ERO_KETSU + FIRST + FIRST_FOLLOW + _first_ketsu())
DECK = load_deck([to_engine(c) for c in RAW])
BY_ID = {c["id"]: c for c in DECK}
