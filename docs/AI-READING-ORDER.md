# AI／實作者建議閱讀順序

> **你是誰：** 要把「互動牌制 v6」或相關功能寫進程式的人（含 AI coding agent）。  
> **這份文件做什麼：** 告訴你 **先讀哪本、讀什麼、讀完能做什麼、先別碰什麼**。  
> **不要：** 一上來全庫掃讀、或只讀 `app.js` 就開改聊天。

---

## 0. 十秒版（只記這個也行）

```
1. 本文（閱讀順序）
2. docs/card-system.md          ← 規則聖經（鎖死規格）
3. web/content/cards.json       ← 卡與數字
4. docs/plan-v5.md 的 §13A      ← 企劃索引／與舊版衝突怎麼判
5. 再依任務去讀 app.js / server / persona（見下方分線）
```

**牌制實作時：** 與舊「淫紋全螢幕聊天」衝突 → **一律信 `card-system.md`**，不要信舊章節的聊天流程。

---

## 1. 依「你要幹嘛」選路線

| 任務 | 必讀（依序） | 可後讀 | 先別讀／別改 |
|---|---|---|---|
| **A. 從零實作互動牌制** | 本文 → `card-system.md` 全文 → `cards.json` → `plan-v5` §13A → `app.js` 委託／看板／存檔段 | `relationship-axes.md`、`persona_builder.js` | 一開始不要大改 `sim.py` 召喚師 |
| **B. 只加卡／改價／改文案** | `cards.json` + `card-system.md` §2.6／§3／§16 | — | 不要改 id（會壞存檔） |
| **C. 氣泡取代淫紋** | `card-system.md` §9 → `app.js` 的 `crestRoll`／委託三節點 | `plan-v5` 第 3 章（對照舊行為） | 不要把 15% 做成成長公式 |
| **D. 打牌演出接 AI** | `card-system.md` §12 → `persona_builder.js` → `server/main.py` 代工佇列 | `world.md` | 禁止解析 AI 文案改情感 |
| **E. 生圖／產製** | `card-system.md` §4／§12.3 → `README.md` Comfy／Grok 段 → `server/comfy.py` | `sdtags.py` | 不要開戰卡住等 GPU |
| **F. 約會牌局** | `card-system.md` §10 → `cards.json` 的 `venues` | 舊約會 UI 程式 | 看板中不可約 |
| **G. 召喚師／NTR** | **先不要做牌制對接**；讀 `plan-v5` 第 8 章 + `server/sim.py` | — | 牌制 PR 禁止順手做 |
| **H. 只修現有 v5 bug** | `plan-v5` 第 14 章 → 對應 `app.js` | — | 不要誤開 v6 大改 |

---

## 2. 標準路線 A：實作牌制（詳細書單）

把下面每一「本」當成一關。關卡沒過不要跳讀寫大範圍 code。

### 第 1 本 · 地圖（你正在讀）

**檔案：** `docs/AI-READING-ORDER.md`（本文）

**讀完應知道：**

- 規格以誰為準  
- 任務分線  
- 實作分期（見 §4）

---

### 第 2 本 · 規則聖經（最重要）

**檔案：** [`docs/card-system.md`](card-system.md)

**怎麼讀（不要從中間跳）：**

| 順序 | 章 | 讀什麼 |
|---|---|---|
| 1 | §0 | 禁止事項 8 條——**印在 system prompt 裡也值得** |
| 2 | §1 | 核心循環、三種「她出聲」通道 |
| 3 | §2 | 資料模型、`cardSession`、N vs 玩家成長 |
| 4 | §3～§6 | 商店、召、打牌、輪末 |
| 5 | §7～§8 | 鍊、感情骰 |
| 6 | §9～§11 | 氣泡、約會、創角 |
| 7 | §12～§15 | AI／遷移／驗收／實作順序 |
| 8 | §16 | 指向 `cards.json` |

**讀完應能回答（自測）：**

1. 碎卡什麼時候碎？未用呢？開門失敗呢？  
2. 氣泡在哪三個節點？機率多少？  
3. 虐卡會不會自動連打三下內容？  
4. 出手 N 跟誰？可押張數跟誰？  
5. 有沒有封牌步驟？  

任一題答錯 → 重讀對應章，**不要開寫**。

---

### 第 3 本 · 卡牌與數字

**檔案：** [`web/content/cards.json`](../web/content/cards.json)

**怎麼讀：**

1. `_meta`、`enums`、`defaults`（常數副本）  
2. `starter_pool`（必須剛好 10）  
3. 抽 2～3 張 `speech`、2 張 `shop_premium`、1 張 `open_*` 看欄位  
4. `venues` + 對應 3 張 event  
5. `girl_card_build_rules`、`bubble_canned`  
6. `shop_weights`  

**規則：**

- 改體驗數字：改 JSON 的 `price` / `emotion` / `openChain.k`  
- **不要改 `id`**（存檔會指到幽靈卡）  
- 核心只信欄位，不信 `name` 文案語義  

---

### 第 4 本 · 企劃索引（判衝突用）

**檔案：** [`docs/plan-v5.md`](plan-v5.md)

**必讀：**

- 文首「以程式為準」原則（v5 已上線部分仍適用）  
- **§13A 全文**（v6 牌制索引、覆寫表、鎖定常數）  
- §14 已知斷點（避免踩舊 bug）  
- §15 經濟現況（卡價未總配平）

**可略讀（除非改到那塊）：**

- 第 8 章召喚師（牌制對接未鎖）  
- 第 10～11 章生圖細節（做產製再讀）  
- 第 13 章 UI 美術  

**衝突判決：**

```
已上線行為（委託金、看板費用、存檔）→ 以 app.js / sim.py 為準
牌制／聊天主路徑如何改 → 以 card-system.md 為準
plan-v5 舊章寫「淫紋聊天」→ 視為歷史；§13A 說覆寫就覆寫
```

---

### 第 5 本 · 關係怎麼演（內容層）

**檔案：** [`docs/relationship-axes.md`](relationship-axes.md)

**何時讀：** 做本體卡文案、氣泡態度、打牌 `promptHint`、防備與階段時。

**讀什麼：** 六軸、越界、身體軸、點名——**精神搬到牌與氣泡**，不是搬回自由聊天 UI。

**搭配 code：** `web/content/persona_builder.js` 的 `STAGE_AXES`、`CRAVE`。

---

### 第 6 本 · 現有遊戲核心（接線用地圖）

**檔案：** `web/app.js`（大，禁止整檔無目的精讀）

**用搜尋，不要從 L1 讀到尾：**

| 搜尋／區塊 | 用途 |
|---|---|
| `EXPANSIONS` / `state =` / `expansions` | 存檔形狀、擴充 |
| `kanban` / `kanbans` | 看板在任 |
| `discover` / `accept` / `complete` / `crestRoll` | 委託三節點 → 將來接氣泡 |
| `enterChat` / `chatSess` | **舊聊天；牌制要取代的入口** |
| `date` / 約會 | 舊約會；對照 §10 |
| `APP_VER` | 改版號習慣 |

**原則：** 先加 `cardInventory` / `cardSession` 與新 UI，再拆舊聊天入口；不要同一 commit 又改召喚師又改牌桌。

---

### 第 7 本 · 伺服器（需要時才讀）

| 檔案 | 何時 |
|---|---|
| `server/main.py` | 存檔 API、LLM／生圖訂單、靜態檔 |
| `server/sim.py` | 世界時鐘、看板到期、召喚師（後話） |
| `server/comfy.py` / `sdtags.py` / `cutout.py` | 產製立繪／CG |
| `server/requirements.txt` | 依賴 |

**README.md** 的啟動、Grok、Comfy 環境變數：部署／生圖前讀。

---

### 第 8 本 · 其他內容模組（按需）

| 檔案 | 用途 |
|---|---|
| `web/content/girl_gen.js` + `persona_pools.json` | 抽卡人設；本體卡 template 注入 |
| `web/content/world.md` | 世界觀；短 prompt 可截核心段 |
| `web/content/summoners.json` / `kinks.json` | 召喚師線；牌制 v1 可不管 |
| `desktop/*` | Windows 匣；與牌制無關 |

---

## 3. 給「教 AI 的人」：建議怎麼下 prompt

把下面貼進 agent 的任務說明（可刪減）：

```
你在實作 Yoro（魅魔萬事屋）的 v6 互動牌制。

閱讀順序（嚴格）：
1) docs/AI-READING-ORDER.md
2) docs/card-system.md 全文（遵守 §0.2 禁止事項）
3) web/content/cards.json
4) docs/plan-v5.md 僅 §13A 與 §14
5) 再 grep app.js 接線（委託 / kanban / save）

衝突時：牌制規則以 card-system.md 為準；不要恢復自由聊天主路徑。
氣泡機率固定 15%，禁止改成成長公式。
情感只由系統骰／表，禁止解析 AI 文案。
虐卡只開門給 chain，禁止一鍵連打整段。
未用碎卡退庫；用出（含開門失敗）才碎。
不要做封牌 UI。不要在本任務實作召喚師對接。

先做：§15 建議順序的第 1～2 步（資料載入 + 無 AI 牌桌），附驗收對照 card-system §14。
```

**一次只給一個 milestone**（見下節），比「把牌制全部做完」成功率高得多。

---

## 4. 實作分期（與閱讀綁定）

與 `card-system.md` §15 一致，稍加「讀什麼」：

| 期 | 交付 | 狀態 | 必讀 |
|---|---|---|---|
| **M0** | 載入 `cards.json`；牌庫／商店 3 槽 4h；創角 10 選 1 | ✅ | 書 2§2～3、書 3、書 4§13A |
| **M1** | 無 AI 打牌：押入、N、骰、碎、鍊、輪末留下 | ✅ | 書 2§4～8 |
| **M2** | 氣泡 15%×三節點接委託；藏舊聊天入口 | ✅（可即時 AI） | 書 2§9、書 6 crest／complete |
| **M3** | 約會電話＋場地 3 卡 | ✅ | 書 2§10、書 3 venues |
| **M4** | 短 AI：出卡即時、兩拍、作廢 gen；**無整輪預產** | ✅ | 書 2§12.2、persona_builder |
| **M5** | 產製 CG cache／占位 | ✅ | 書 2§4／12.3、README、comfy |
| **M6** | 自由聊退役、存檔遷移、停死 AI 單 | ✅ | 書 2§13、書 6 |
| **v7** | 看板：攜帶 8／每輪抽 2 打 1／playedIds／詞墜 B | 規格✅ 程式待跟 | 書 2§4.4～§5.2、§14.4 |

**v1 不做：** 多節卡 `steps[]` 演出（書 2 §5.4）— 重開前先改規格。  
**看板不做：** opener 旗標（A）、節拍 beat（C，留給約會）。

每期結束跑 **書 2 §14 驗收清單** 對應項（含 §14.6 M4、§14.7 M6、§14.4 v7）。

---

## 5. 倉庫「書目」一覽（書架）

| 優先 | 路徑 | 角色 |
|---|---|---|
| ★★★ | `docs/AI-READING-ORDER.md` | 閱讀地圖（本文） |
| ★★★ | `docs/card-system.md` | 牌制規格聖經 |
| ★★★ | `web/content/cards.json` | 卡／場地／defaults |
| ★★☆ | `docs/plan-v5.md` §13A | 企劃索引與覆寫 |
| ★★☆ | `docs/relationship-axes.md` | 關係演出精神 |
| ★★☆ | `web/app.js`（grep） | 接線 |
| ★★☆ | `README.md` | 啟動與 AI／GPU 環境 |
| ★☆☆ | `web/content/persona_builder.js` | prompt 組裝 |
| ★☆☆ | `server/main.py` | API／代工 |
| ★☆☆ | `server/sim.py` | 時鐘／召喚師 |
| ★☆☆ | `docs/plan-v5.md` 其餘 | 已上線系統百科 |
| ☆☆☆ | `desktop/*` | 顯卡機匣，與牌無關 |

---

## 6. 常見錯誤（讀錯書會發生的事）

| 錯誤 | 原因 | 正確 |
|---|---|---|
| 先改 `persona_builder` 加長聊天 | 以為沉浸＝多聊 | 先牌桌狀態機 |
| 把 `plan-v5` 第 3 章當 v6 | 沒看 §13A | 聊天主路徑已覆寫 |
| 氣泡跟稀有度綁 | 抄舊 crest 表 | **固定 15%** |
| 情感跟 AI 語氣聯動 | 想「更聰明」 | **只准骰表** |
| 虐卡寫成三連動畫 | 沒讀 §7 | 只設 chain |
| 一 PR 做完牌+召喚師 | 貪大 | 召喚師後話 |
| 精讀整份 `app.js` | 沒用地圖 | grep 接線 |

---

## 7. 給人類的「帶讀」節奏（可選）

若你是作者、要帶 AI 或同事：

1. **第 1 次 session：** 只讀書 2 §0～§1 + 書 4§13A，口述核心循環，不寫 code。  
2. **第 2 次：** 書 2 §2～§6 + 打開 `cards.json` 看一張開門卡，寫 M0 資料層。  
3. **第 3 次：** 書 2 §7～§9，寫 M1～M2。  
4. **之後：** 再約會／AI／圖。  

中途若 AI 想「優化常數」→ 丟回書 2 §0.2。

---

## 8. 變更

| 日期 | 摘要 |
|---|---|
| 2026-08-04 | 初版：牌制實作為主的閱讀順序與教 AI prompt 模板 |
| 2026-08-05 | M0～M4 標 ✅；M4＝即時 AI＋作廢；多節 v1 skip；下一刀 M5／M6 |
| 2026-08-05 | M6 ✅ 自由聊退役；牌制主線 M0～M6 已齊；可做多節討論或召喚師後話 |

---

**下一本請打開：** [`docs/card-system.md`](card-system.md)  
**M5 已上線（§12.3）。** 勿恢復自由聊或整輪預產；真·每卡場景 CG 另開討論。
