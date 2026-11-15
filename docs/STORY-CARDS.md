# 故事卡（起承轉合）草案 — 2026-11-15

> 狀態：**草案，給 Al 和其他 agent 討論用，還沒有程式**。資料格式和第一批地方卡由其欸起草；抽卡引擎（`server/life_agent.py`）由啊啊哎接手。

## 為什麼要改

- `SCP_EVENTS`（31 件）、`EROTIC_EVENTS`（30 件）都是**寫死的 5 步劇本**，連結局句都固定，所以每個妹子碰到的經歷一字不差。
- 每晚沉澱（`GROWTH_*`）每晚打 8 折，大約 6 晚就淡掉，最多留 8 條，而且只看日本的經歷，所以她累積不出人生。
- 新設定：她不是「現實中被召喚來的人」，而是**全新來到這個世界的妹子**，在學、在長大。

## 四格

| 格 | 牌堆 | 決定什麼 |
|---|---|---|
| 起 | 地方卡 × 誘因卡 | 在哪、為什麼停下來（場地＋觸發） |
| 承 | 發展卡 | 事情怎麼變大 |
| 轉 | 轉折卡 | 她怎麼反應：逃／看下去／靠近（依個性加權） |
| 合 | 結果卡 | 她學到、怕上、迷上什麼 → **寫進永久人生經歷** |

另有一副**「第一次」牌**（第一次搭電車、第一次去錢湯…），只抽一次，抽過就變成她懂的事。

## 卡片格式（JSON／Python dict 一樣）

```jsonc
{
  "id": "dogo-bath-rule",          // 全域唯一
  "slot": "ki",                    // ki 起 | sho 承 | ten 轉 | ketsu 合 | first 第一次
  "deck": "daily",                 // daily 日常 | wonder 奇遇 | horror 詭異 | ero 色情 | first
  "text": "道後溫泉本館前，大家脫鞋排隊，她不知道要先做什麼。",  // 短，給模型當骨架，不是成品句
  "needs": ["place:onsen", "time:evening"],  // 這張要接得上的標籤（全部要滿足）
  "gives": ["place:onsen", "people:locals", "heat:0"],  // 抽到後加進故事的標籤
  "grounds": ["dogo"],             // 只在這些落腳地出現；空＝哪裡都行
  "season": ["winter"],            // spring|summer|autumn|winter|空；或 "festival:<id>"
  "weight": { "curious": 2, "timid": 0.5, "lust": 1 },  // 個性／膽量／性慾 加權，沒寫＝1
  "react": "approach",             // 只有 ten 用：flee | watch | approach
  "growth": { "kind": "attitude", "text": "知道錢湯要先洗身體" },  // 只有 ketsu／first 用，進人生經歷
  "heat": 0,                       // 色情強度 0～3；horror 用 "fear" 0～3
  "once": false                    // true＝每個妹子一生只抽一次（first 牌預設 true）
}
```

### 接法規則

1. 起：從 `grounds` 符合她落腳地、`season` 符合現在日本季節／祭典日曆的起卡裡抽。
2. 承、轉、合：只從 `needs` 全部包含在「目前故事標籤」裡的牌抽，抽到的 `gives` 併進去。
3. `heat`／`fear` 一格只能 +1，不會一下跳到最高。
4. 轉：`react` 依她的個性、膽量、性慾等級和當下心情加權（膽小 → flee 較多；好奇 → approach 較多）。**同一張起卡，不同人走向不同。**
5. 每個妹子各記自己抽過的牌 id（`rec["cardsSeen"]`），`once` 的不再抽，其他的近期抽過降權。
6. 四格抽完，交給模型「照這四個骨架寫成一段通順的經歷」，不准加骨架外的大事。
7. 合卡的 `growth` 寫進**永久人生經歷**（新欄位，不打折、不淡掉）；每晚沉澱照舊處理近況。

## 季節與祭典日曆（日本時間）

| 時間 | 標籤 |
|---|---|
| 1/1～1/7 | `festival:hatsumode` 初詣 |
| 2/3 | `festival:setsubun` 節分 |
| 3 月底～4 月初 | `festival:hanami` 賞花 |
| 7 月 | `festival:tanabata`（7/7）、各地夏祭 |
| 8/13～8/16 | `festival:obon` 盂蘭盆、`festival:hanabi` 花火 |
| 10/31 | `festival:halloween`（澀谷系，大阪道頓堀也有） |
| 12/24～12/25 | `festival:christmas` |
| 12/31 | `festival:omisoka` 除夕、除夜之鐘 |

地方祭典：札幌雪祭（2 月初，`sapporo-susukino`）、青森睡魔祭（8/2～8/7，`aomori-city`）、仙台七夕（8/6～8/8，`sendai-ichibancho`）、淺草三社祭（5 月中，`asakusa`）、京都祇園祭（7 月，`higashiyama`）、大阪天神祭（7/24～7/25，`dotonbori`）、博多祇園山笠（7/1～7/15，`hakata`）、高知夜來祭（8/9～8/12，`kochi`）、那霸大綱挽（10 月，`naha`）。

## 第一批地方卡（起，日常／奇遇）

對應 `web/content/japan_grounds.js` 的 16 個落腳地，每地先一張帶在地風俗的起卡：

| id | grounds | season | text |
|---|---|---|---|
| susukino-snow | sapporo-susukino | winter | 薄野路邊的雪堆比她還高，有人在雪上用手指寫告白。 |
| hakodate-morning-market | hakodate-motomachi | | 函館朝市的阿姨塞了一隻烤花枝給她，說「試吃不用錢」。 |
| sendai-tanabata | sendai-ichibancho | festival:tanabata | 一番町的拱廊掛滿巨大的七夕吹流，有人遞給她一張短冊。 |
| aomori-nebuta | aomori-city | festival:nebuta | 巨大的發光燈籠人偶從街上經過，跳人喊著「ラッセラー」。 |
| asakusa-omikuji | asakusa | | 淺草寺抽到「凶」，旁邊的人說要綁在架子上留在寺裡。 |
| kamakura-enoden | kamakura | | 江之電的平交道噹噹響，一群人舉著手機等電車和海一起入鏡。 |
| osu-maid | osu | | 大須商店街的女僕在發傳單，叫她「お嬢様」。 |
| kanazawa-goldleaf | kanazawa | | 店裡的冰淇淋整片包著金箔，她不知道能不能吃。 |
| higashiyama-maiko | higashiyama | | 二年坂一位舞妓小碎步走過，觀光客追著拍，她也跟著停住。 |
| dotonbori-takoyaki | dotonbori | | 章魚燒攤老闆用關西腔問她要不要「マヨ」，她聽不懂。 |
| hiroshima-cranes | hiroshima | | 和平紀念公園的紙鶴牆前，一個小學生教她折紙鶴。 |
| kurashiki-canal | kurashiki | | 倉敷運河的小船船夫邀她上船，說今天客人少不收錢。 |
| dogo-bath-rule | dogo | | 道後溫泉本館前大家脫鞋排隊，她不知道要先做什麼。 |
| kochi-sunday-market | kochi | | 高知週日市集的攤子一路排到城門，阿伯推銷自家的柚子醋。 |
| hakata-yatai | hakata | | 中洲河邊的屋台擠滿陌生人，老闆要她坐到別人旁邊。 |
| naha-shisa | naha | | 每戶屋頂都蹲著一對獅子，一隻張嘴一隻閉嘴，她盯著看了很久。 |

## 「第一次」牌（示範）

| id | text | growth |
|---|---|---|
| first-train | 第一次自己搭電車，不知道要先買票還是先刷卡。 | 學會搭電車 |
| first-konbini | 第一次走進便利商店，店員問「要加熱嗎」。 | 知道便利商店可以幫忙加熱 |
| first-sento | 第一次去錢湯，被阿婆提醒要先洗身體才進池。 | 知道錢湯的規矩 |
| first-rain | 第一次在這個世界淋到雨，傘是陌生人給的。 | 會記得帶傘 |
| first-festival | 第一次看見祭典，跟著人群拍手。 | 喜歡上祭典 |
| first-nanpa | 第一次被搭訕，不知道該怎麼拒絕。 | 對陌生男人的態度 |

## 分工

- 其欸：本檔格式、地方卡、第一次牌。
- 啊啊哎：抽卡引擎（加權、標籤接法、`cardsSeen`、合卡寫入永久人生經歷）＋測試（兩個個性不同的妹子抽同一張起卡會走出不同結果），也幫忙寫詭異／色情牌。
- 阿河：（待定）房間裡讓她主動拿人生經歷和近況開話題。

## 待 Al 決定

1. 舊的 SCP／色情 5 步劇本要拆成卡片併進新牌堆，還是留著當「稀有完整事件」？
2. 永久人生經歷要不要上限（例如 50 條，滿了請模型合併）？
3. 房間裡的對話要不要也餵進沉澱和人生經歷？
