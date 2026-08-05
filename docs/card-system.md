# 互動牌制規格（玩家 ↔ 女子）

> **狀態：M0～M4 已上線；M5（CG cache）／M6（舊聊天遷移）待做。**  
> 核心玩法（商店／牌庫／牌桌／鍊／氣泡／約會／短 AI）以 `web/app.js` + `web/content/card_engine.js` 為準；本文仍是**規則聖經**（衝突時規則以本文為準，實作 bug 另開修）。  
> 與 `plan-v5.md` 衝突處，**以本文覆寫「聊天／淫紋聊天／舊約會流程」相關段落**。  
> 企劃書索引：`plan-v5.md` **§13A**。  
> **卡牌／場地資料：[`web/content/cards.json`](../web/content/cards.json)**。  
> 召喚師 × NTR × 交配環與牌制的對接：**本文不寫**，另開文件再鎖。  
> **v1 不做多節卡演出**（`steps[]` 資料可留，引擎不跑）— 見 §5.4；重開需討論後改本文。
>
> 讀者假設：實作者可能是 **AI coding agent**。故：常數寫死、狀態機寫死、資料形狀給例、禁止事項列清、與舊系統對照表齊全。  
> **不要自行「優化」鎖定常數（尤其氣泡 15%）。改常數＝改體驗＝當 bug 開。**

---

## 0. 給實作者的閱讀指引

**整庫從哪一本書開始：** 見 [`AI-READING-ORDER.md`](AI-READING-ORDER.md)（建議第 1 本讀完再進本文）。

| 你要做什麼 | 讀哪一節 |
|---|---|
| 搞懂玩家一天怎麼玩 | §1 核心循環 |
| 實作存檔欄位 | §2 資料模型 |
| 實作商店／牌庫／牌組 | §3 |
| 實作召看板 → 產製 → 打牌 | §4～§6 |
| 實作鍊（chain） | §7 |
| 實作感情骰 | §8 |
| 實作氣泡（取代淫紋聊天） | §9 |
| 實作約會牌局 | §10 |
| 實作創角 | §11 |
| 接 AI／生圖 | §12 |
| 舊系統怎麼遷 | §13 |
| 驗收清單 | §14 |

### 0.1 設計一句話

> **委託（子彈筆記）養金幣與牌庫；召看板娘把她放進生活（可陪伴、可碎嘴）；深度互動只透過牌桌；無自由文字聊天；商店高級卡用則碎、話術不碎、未用不碎；虐系只開門給「鍊」；出手次數由女子關係決定；玩家成長管牌庫與可押張數。**

### 0.2 絕對禁止（AI 常見越權）

1. **禁止**恢復自由輸入的多回合聊天作為養成主路徑。  
2. **禁止**用 NLP／關鍵字解析玩家或 AI 文案來改情感。情感**只**由系統骰／表。  
3. **禁止**把氣泡機率做成隨等級／稀有度成長（鎖定 **15%**）。  
4. **禁止**做「封牌」兩段式 UI（曾提案，已否決；易卡 bug）。  
5. **禁止**虐卡一鍵播放整段連打內容；虐**只**給 `chain` 許可。  
6. **禁止**未使用的碎卡在回合結束銷毀（已改：**未用不碎、退庫**）。  
7. **禁止**在本文範圍實作「別的召喚師出牌」；那是後話。  
8. **禁止**為了「平衡」擅自加全局感情 clamp（例如單次不得 +5）；每張卡自己的 min/max 已是邊界。

---

## 1. 核心循環

```
創角（姓名／體格／相貌／習慣 + 10 選 1 基礎話術）
    │
    ▼
日常：發現／接／做／完成【委託】──→ 金幣
    │                              │
    │ 各 15% 氣泡碎嘴（有看板娘時）   │
    │                              ▼
    │                         商店貨架（3 張／4h 刷新）
    │                              │
    │                              ▼
    │                         買進【牌庫】→ 有空編【預設牌組】
    │
    ├─【召看板娘】付錢 ──→ 開始產製（牌池素材／文／圖，可久）
    │         │              已召出：可陪伴、氣泡、可開戰、可解召
    │         │              （一經按下召喚就開始；不要中途「取消產製」複雜流）
    │         ▼
    │    組本輪牌：妹子本體卡 ≤3 + 從牌庫／預設組「押入」的卡
    │         ▼
    │    洗牌 → 抽到手牌 → 打 1～N 張（N 由該女子關係等決定）
    │         │  可含：話術、碎卡、開門虐、不可走…
    │         ▼
    │    輪末：留下判定（或不可走強制 +1 輪）
    │         走 → 妹子本體卡抽走；未用碎卡退庫
    │         留 → 可再來一輪組牌／打牌
    │
    └─【約會】（非看板狀態）
          電話（金 + 接聽率）→ 選場地（金）→ 一輪牌
          （場地 3 張事件卡入池；每隻每日最多 2 次）
```

### 1.1 三種「她出聲」的通道（勿混）

| 通道 | 何時 | 玩家是否出牌 | 情感 |
|---|---|---|---|
| **氣泡碎嘴** | 委託三節點各 15% | 否 | 細水（0 或 +1，見 §9） |
| **打牌演出** | 一輪牌局內打出卡 | 是 | 主養成（感情骰 §8） |
| **舊淫紋全螢幕聊天** | — | — | **廢除／不再作為主路徑** |

### 1.2 看板娘 vs 約會（為何兩者都要）

| | 看板娘 | 約會 |
|---|---|---|
| 她在哪 | 店頭 | 外出場地 |
| 氣泡盯委託 | **有** | 無（或極少；第一版無） |
| 在任天賦暫加 | **有** | 無 |
| 牌池特色 | 妹子本體 ≤3 + 玩家押入 | 場地事件 3 張 + 玩家編組 |
| 時間 | 限時在任（既有 3～5h 量級／擴充） | 一輪結束即散 |
| 次數 | 付錢可召（既有費用表） | **每隻每日 2 次** |
| 互斥 | **看板中不可約會** | 約會中不是看板 |
| 後話 | 擋住／保護 NTR 線相關（本文不實作對接） | — |

---

## 2. 資料模型（建議欄位）

以下為**邏輯模型**；可放在 `state`（前端存檔）與／或 SQLite。名稱可映射既有欄位，但語意必須對上。

### 2.1 玩家（擴充既有 `settings`／根 state）

```js
player: {
  name: string,           // 創角
  body: string,           // 體格（創角選項 id 或文案）
  look: string,           // 相貌
  habit: string,          // 習慣
  starterSpeechCardId: string,  // 10 選 1 的基礎話術 id（永久、不碎）
  // 玩家成長（不管出手 N；管收集與編制）— 數值表見 §2.5
  cardPlayerLv: number,   // 或沿用既有經驗／擴充推導
}
```

### 2.2 牌庫與牌組

```js
cardInventory: {
  // cardId → 擁有資訊
  // 話術／不碎卡：通常 count 無意義或恒為 1（已解鎖）
  // 碎卡：count = 持有張數
  [cardId: string]: { count: number, unlocked?: boolean }
},

// 預設牌組（有空時編輯；可多套，由玩家等級解鎖套數）
deckPresets: [
  {
    id: string,
    name: string,
    // 列出「希望帶去局內的卡」；碎卡只是意願，實際能否押入還看 count
    cardIds: string[],
  }
],

// 商店
shop: {
  nextRefreshAt: number,      // epoch ms；每 4 小時
  slots: [
    {
      cardId: string,
      price: number,
      sold: boolean,
      isSale: boolean,        // 特價標記
      salePrice?: number,
    }
  ], // length === 3
},
```

### 2.3 單隻魅魔上與牌相關的狀態

```js
// 掛在既有 succubus 物件上
{
  id, name, relationship: { stage, affection, ... }, // 既有階段／情感
  // 本體卡：由關係＋特色在「召為看板／開局產製」時生成，不進玩家永久牌庫
  // 僅在她作為本局對象時存在
  // 約會計數
  datesToday: number,         // 當日已約次數；日界與遊戲日界一致（睡眠醒來或既有 day key）
  datesDayKey: string,        // 例如 "2026-08-04" 或遊戲日 id
}
```

### 2.4 一局（Session）狀態機

一局 = 針對**一名**女子的一次「牌桌生命週期」（看板牌桌或約會牌桌）。

```js
cardSession: {
  mode: "kanban" | "date",
  girlId: string,
  phase:
    | "summoning_prep"  // 已召、產製中（文／圖／本體卡）
    | "idle_present"    // 人在、可陪伴、可開戰、可氣泡（看板）
    | "round_setup"     // 選擇本輪押入
    | "round_play"      // 打牌中
    | "round_end"       // 輪末結算／留下判定
    | "closed",         // 結束（離開／解召／約會散）

  // 本輪
  roundIndex: number,          // 0,1,2… 同一 session 內第幾輪
  girlCards: CardInstance[],   // ≤3，本體
  injected: CardInstance[],    // 玩家本輪押入（≤ maxInject）
  drawPile: CardInstance[],    // 洗後剩餘
  hand: CardInstance[],        // 手牌，上限 5
  nBase: number,               // 本輪女子給的基礎出手
  nLeft: number,
  chain: null | { attr: ChainAttr, kLeft: number, sourceCardId: string },
  flags: {                     // 本 session／本輪旗標，供 requires
    undressed?: boolean,
    hypnotized?: boolean,
    // ...
  },
  playedThisRound: string[],   // instanceIds 或 cardIds 日誌
  venueId?: string,            // 約會
  venueCards?: CardInstance[], // 恰好 3
}
```

`CardInstance` = 卡定義 id + 實例 id（避免同名兩張碎卡分不清）+ 來源標記：

```js
{
  instanceId: string,   // uuid
  cardId: string,
  source: "girl" | "inventory" | "venue",
  // source==="inventory" 且卡為碎卡：打出成功/失敗（已使用）→ inventory count--
}
```

### 2.5 玩家成長 vs 女子決定（分工鎖死）

| 誰 | 決定什麼 |
|---|---|
| **女子（關係 stage 等）** | 本輪基礎出手 **N**；留下率底；本體卡內容與態度 |
| **玩家成長** | 牌庫上限、預設牌組套數、**本輪最多押入幾張**（上限 5）、商店特價欄解鎖等 |

#### 基礎出手 N（女子）— 建議表（實作可調表，但要集中在一個常數物件）

```js
const BASE_PLAYS_BY_STAGE = {
  stranger:    1,
  friend:      2,
  girlfriend:  3,
  wife:        4,
};
// 可選修正（第一版建議只做防備）：
// 若 guard 高：N = max(1, N - 1)
```

#### 本輪最多押入（玩家）— 建議表

```js
// maxInject = min(5, 3 + floor(cardPlayerLv / 2)) 或獨立擴充軸
// 第一版也可固定 5，僅用牌庫上限表現成長
const MAX_INJECT_CAP = 5;
```

### 2.6 卡定義（內容模組 JSON）

建議路徑：`web/content/cards.json`（或拆 `cards/*.json`）。  
**核心零解析原則**：演出用 prompt 字串可當不透明內容；**數值與規則欄位由核心讀取**。

```js
{
  id: "speech_soft",
  name: "輕聲安撫",
  kind: "speech",              // speech | shop_premium | girl_trait | venue_event
  shatterOnUse: false,         // speech false；商店高級 true
  tags: ["talk"],              // 鍊相容：talk | touch | sex | play | any
  price: 0,                    // 商店售價；非賣品 0
  rarity: "N",                 // 展示用
  minStage: null,              // null | stranger | friend | girlfriend | wife
  forceable: false,            // 未達 minStage 時可否硬開（開門卡用）
  openChain: null | { attr: "talk"|"touch"|"sex"|"play"|"any", k: number }, // k 卡面寫死
  requires: {
    flagsAll?: string[],       // 需要已有 flag
    mode?: ("kanban"|"date")[],
  },
  emotion: {
    stranger:   { min: -1, max: 1 },
    friend:     { min: 0, max: 2 },
    girlfriend: { min: 0, max: 2 },
    wife:       { min: 0, max: 1 },
  },
  // 演出（內容模組）
  sceneStart: string,          // 系統錨定句（v1 唯一演出錨）
  // 多節卡：資料形狀保留；**v1 引擎不讀、不演**（見 §5.4）
  steps?: [
    {
      id: string,
      systemText: string,
      choices?: [{ id, label, nextStepId?, setFlags?, emotionOverride? }],
    }
  ],
  // prompt 片段：給 persona 的 scene 說明
  promptHint: string,
}
```

**種類與碎：**

| kind | shatterOnUse | 來源 |
|---|---|---|
| `speech` | **false** | 創角 10 選 1、商店話術（貴）、之後解鎖 |
| `shop_premium` | **true** | 商店高級：侵略／虐開門／不可走／重口味等 |
| `girl_trait` | false（不進玩家庫） | 關係＋特色臨時生成 |
| `venue_event` | false（不進玩家庫） | 場地 3 張 |

---

## 3. 商店、牌庫、預設牌組

### 3.1 貨架（鎖死）

| 常數 | 值 | 說明 |
|---|---|---|
| `SHOP_SLOT_COUNT` | **3** | 同時販售張數 |
| `SHOP_REFRESH_MS` | **4 * 3600 * 1000** | 每 4 小時刷新 |
| 特價 | 允許 | 3 槽中 0～1 張 `isSale` 即可；演算法可簡單 |

刷新邏輯：

1. `now >= nextRefreshAt`（登入／開商店頁／tick 時檢查）→ 重抽 3 張。  
2. 從「可上架卡池」加權抽（排除已擁有唯一話術？**話術可重複上架但已擁有則顯示已擁有不可買**；碎卡可堆疊 count）。  
3. `nextRefreshAt = now + SHOP_REFRESH_MS`（或對齊整點；第一版 **now+4h** 即可）。  
4. **不要**做成每日只刷一次；是 **4 小時**。

購買：

- 金幣足夠 → 扣金 → `cardInventory[id].count++`（話術 count=1 unlock）→ `slot.sold=true`。  
- 碎卡貴、話術也貴（數值另表）；**金幣只來自委託等既有經濟**，無課金。

### 3.2 牌庫 UI 語意

- **牌庫** = 擁有的全部卡（收藏）。  
- **預設牌組** = 出擊意願清單（可多套）。  
- **本輪押入** = 開戰前從預設組／牌庫勾選，張數 ≤ maxInject，且碎卡不超過 count。

### 3.3 未用／已用（鎖死）

| 情況 | 碎卡（shatterOnUse true） | 話術 |
|---|---|---|
| 押入本輪但未打出 | **退庫，count 不變** | 仍擁有 |
| 打出（含開門失敗） | **count－1**（視作已使用） | 不減 |
| 多節卡中途停手 | **（v1 不做多節）** 規格預留：視同已使用 → 碎 | — |

「打出」定義：玩家在確認層按了確認，進入演出／結算流程。  
取消確認 → 未使用。

---

## 4. 召喚看板娘與產製

### 4.1 流程（無封牌）

```
玩家付費召看板娘（既有費用／時長規則）
  → 立刻寫入 kanbans[]，phase 進入 summoning_prep
  → 背景任務：
       a) 生成／刷新本體卡 ≤3（依關係、職業、特殊屬性、性癖…）
       b) 預生可能用到的短文案（開門句、氣泡池）
       c) 預生 CG／立繪變體（可燒 10+ 分鐘；允許）
  → 產製未完成：UI 顯示「她還在成形／整理」；仍可算「在場」與否？
       建議：until 時鐘照走；氣泡可在 prep 完成後才開
  → 產製完成 → idle_present
  → 玩家可：只陪伴 | 開 round_setup 押入開戰 | 解召（若規則允許）
```

### 4.2 取消政策（鎖死）

- **不要**做「產製中取消且複雜退款」的封牌流。  
- 「一開始召就是開始」：付錢召了就進在任。  
- **解召／到期**：人走、本體卡消失、進行中 `cardSession` 強制 `closed`；手牌未用碎卡**退庫**；已用已碎不退。  
- 玩家可能產製完不打、只陪伴、或中途解召換人——**皆合法**。

### 4.3 本體卡 ≤3（妹子卡）

來源例（實作可組）：

1. 關係階段牌 1 張（陌生《戒備》、女友《撒嬌討債》…）  
2. 職業／特色牌 0～1 張  
3. 狀態牌 0～1 張（高防備／高飢渴時替換或插入）

她離開店頭（到期、解召、被叫走—後者後話）→ **全部本體卡從任何牌堆移除**。  
不寫入玩家 `cardInventory`。

### 4.4 一輪牌組建構

```
girlCards (≤3) ∪ injected (≤ maxInject)
  → shuffle
  → draw 直到 hand.length === min(5, pileTotal) 或抽完
```

開戰時：

```
nBase = BASE_PLAYS_BY_STAGE[stage] （± 修正）
nLeft = nBase
chain = null
roundIndex++
phase = round_play
```

---

## 5. 打牌狀態機（單張）

```
round_play 且 (nLeft + chain.kLeft) > 0 且 hand 非空（或可跳過結束）
  │
  │ 點手牌
  ▼
requires 檢查（階段、flag、mode）→ 不可則拒絕
  │
  ▼
確認層（高級碎卡建議必確認；顯示「用後消失」）
  │ 取消 → 回手牌
  ▼
標記「已使用」意圖
  │
  ▼
若 openChain：
  判定開門成功 / 失敗（§7）
  失敗 → 感情骰(失敗表) → 演出失敗 → shatter → 扣次數 → 補牌 → 仍回 round_play
  成功 → 設定 chain → 感情骰 → 演出 → 扣次數 → 補牌
若 普通卡：
  若 chain 存在且不相容 → 不應能點（UI 灰）
  感情骰 → 演出（v1＝單拍：sceneStart + 她 1～2 句）→ shatter 若需 → 扣次數 → 補牌
  │
  ▼
（v1 跳過多節；見 §5.4）
  │
  ▼
若 nLeft+chain.kLeft === 0 或 玩家按「結束本輪」或 手牌與庫皆空且無法再打
  → round_end
```

### 5.1 扣次數規則（鎖死建議，少 bug）

```
function spendPlay(card):
  if chain && chain.kLeft > 0 && cardCompatible(card, chain.attr):
    chain.kLeft -= 1
    if chain.kLeft === 0: chain = null
  else:
    nLeft -= 1
```

開門卡自身：先按「普通一次」扣（優先扣 chain 還是 base？）  
**鎖死：開門卡消耗 1 次基礎 N（不消耗舊 chain；開門時清掉舊 chain 再設新 chain）。**

```
function playOpener(card, success):
  chain = null  // 舊鍊取消
  nLeft -= 1    // 開門動作本身
  if success:
    chain = { attr: card.openChain.attr, kLeft: card.openChain.k, sourceCardId: card.id }
```

### 5.2 補牌

```
每成功結束一張卡的結算後（含失敗開門）：
  while hand.length < 5 and drawPile.length > 0:
    hand.push(drawPile.pop())
```

### 5.3 可打次數顯示

給玩家看敘事化，例如：「她今夜還肯應對你的次數」= `nLeft + (chain?.kLeft||0)`。  
鍊存在時附加：「她正被你帶著走（屬性）」——不要暴露 `kLeft` 數字亦可，但除錯模式可顯示。

### 5.4 多節卡（`steps[]`）— v1 明確不做

| 項目 | v1 現況 |
|---|---|
| 資料 | `cards.json` 可保留 `steps`（給日後／作者預寫） |
| 引擎 | **`commitPlay` 不讀 `steps`**；只播 `sceneStart` + 一句 `girlLine`（即時 AI 或罐頭） |
| UI | 無「繼續／停手」節點選擇 |
| 驗收 | §14.2「多節停手仍減」→ **v1 不驗** |

**為何先跳過：** 節奏、停手碎卡、與短 AI 每節是否再生成，尚未討論鎖定。  
**禁止：** 實作者「順便做多節 UI」而不改本文。重開時：先改 §5.4 + 變更紀錄，再動 code。

---

## 6. 輪末：離開或留下

### 6.1 《不可走》類卡

- `kind: shop_premium`，`shatterOnUse: true`，極貴。  
- 打出成功效果（鎖死語意）：**本輪 round_end 不骰留下；強制再獲得一輪 round_setup 資格**（`roundIndex` 可續）。  
- **不是**買下整個看板剩餘時數內無限輪。  
- 下一輪建議：本體卡偏向冷／虛（內容層）；不強制扣情感（可用骰輕搖 －1～＋1）。

資料：`cardSession.forceAnotherRound = true`。

### 6.2 預設留下判定

當 `!forceAnotherRound`：

```
P = STAGE_STAY_BASE[stage]  // 建議落在 5%～50% 總區間
// 可選修正（第一版可只做 base；要加修正必須集中常數）
P = clamp(P, 0.05, 0.50)
if random() < P: 進入下一輪 round_setup
else: 她離開本 session（看板仍可能在任直到 until——需定）
```

**看板留下 vs 解除看板（鎖死建議）：**

- 輪末「離開」= **結束本 session 的打牌**，不是立刻從 `kanbans` 移除。  
- 她仍可在店頭陪伴／氣泡，直到既有 `until` 到期。  
- 若要再打，開新 session（新一輪組牌），是否允許由產品定：  
  **建議：同一在任期可再開 session，但每段 session 仍受 N／留下限制。**  
  若怕刷，可加「在任期最多 S 次 session」— 第一版可 **不限制**，靠碎卡成本與 N 限制。

`STAGE_STAY_BASE` 建議起點（可調表，集中常數）：

```js
const STAGE_STAY_BASE = {
  stranger: 0.05,
  friend: 0.15,
  girlfriend: 0.30,
  wife: 0.45,
};
```

### 6.3 回合結束資源

- 手牌＋抽牌堆裡 **source===inventory && 未標記 used** → 退回（本來就沒扣 count）。  
- **used** 的碎卡已在打出時扣 count。  
- girl／venue 卡丟棄。

---

## 7. 鍊（Chain）詳細

### 7.1 屬性枚舉（鎖死集合，勿隨意加）

```ts
type ChainAttr = "talk" | "touch" | "sex" | "play" | "any";
```

相容：

```
compatible(card, attr):
  if attr === "any": return true
  if card.tags includes "any": return true
  return card.tags includes attr
```

UI：有 chain 時，不相容手牌 **disabled**。

### 7.2 開門判定

```
if stageIndex(stage) >= stageIndex(card.minStage || "stranger"):
  success = true
else if card.forceable:
  success = rollForceOpen(stage, card)  // 實作可先 50% 或表驅動
else:
  success = false
```

| 結果 | chain | 碎（高級卡） | 感情骰 |
|---|---|---|---|
| 成功 | `k` 來自**卡面寫死**的 `openChain.k` | 碎 | emotion 成功表（可用卡的 emotion） |
| 失敗 | 無 | **碎** | 偏負：建議 `min:-3,max:-1` 或卡內 `emotionOnFail` |

`openChain.k` **每卡自訂**（例如 1、2、3），禁止全局寫死成同一個 K。

### 7.3 虐變體（皆為開門卡，不是自動連打）

| 變體概念 | attr | 典型 k | minStage 建議 |
|---|---|---|---|
| 話術車輪 | talk | 2～3 | stranger |
| 不讓退開／連續接觸 | touch | 2～3 | friend |
| 連續交配 | sex | 3 | girlfriend（forceable 可開地獄模式） |
| 連續情境事件 | play | 2 | friend |
| 撕毀規矩 | any | 1～2 | 貴、失敗率高 |

玩家必須在押入區自備續航碎卡／話術；只押開門不押續航 = 浪費（但未用續航退庫；**已打出的開門失敗也碎**）。

### 7.4 第一版不做

- 她反制卡插隊斬鍊（改用：高防備 → 開門較難／N－1）。  
- 鍊中自由插入不相容卡。

---

## 8. 感情骰（Affection Dice）

### 8.1 總則

```
Δ = randomIntInclusive(table.min, table.max)
// 可選修正（第一版僅防備）：
if guardHigh && Δ > 0: Δ = 0   // 或 Δ -= 1
// 禁止全局 clamp 如 max(+5)
affection += Δ
// 再跑既有升階檢查（30/90/180 等既有門檻）
```

- **不**讀 AI 輸出決定 Δ。  
- 顯示：敘事化（軟了一點／更冷），數字可只在 debug。

### 8.2 缺表時的類型預設（卡未寫 emotion 時 fallback）

**speech**

| stage | min | max |
|---|---|---|
| stranger | -1 | 1 |
| friend | 0 | 2 |
| girlfriend | 0 | 2 |
| wife | 0 | 1 |

**shop_premium touch／一般侵略**

| stage | min | max |
|---|---|---|
| stranger | -2 | 1 |
| friend | -1 | 2 |
| girlfriend | 1 | 3 |
| wife | 1 | 2 |

**shop_premium sex**

| stage | min | max |
|---|---|---|
| stranger | -3 | 0 |
| friend | -2 | 1 |
| girlfriend | 0 | 4 |
| wife | 1 | 3 |

**開門失敗**

| min | max |
|---|---|
| -3 | -1 |

卡 JSON 有 `emotion` 則 **蓋過** fallback。

### 8.3 三線養成

| 線 | 觸發 | 量級 |
|---|---|---|
| 打牌 | 每張卡結算 | 上表 |
| 氣泡 | §9 | 0 或 +1 |
| 約會 | 每張卡 + 可選輪末紅利 | 同打牌表；場地事件可自帶 emotion |

點名／交代委託等舊機制：若保留，**獨立**加減情感，不走卡骰；第一版可接在話術卡「盯待辦」變體上。

---

## 9. 氣泡碎嘴（取代淫紋進聊天）

### 9.1 觸發（鎖死）

僅以下 **三種委託操作** 成功發生時，對**每位當前在場看板娘**各擲一次：

| 事件 | 機率 |
|---|---|
| 發現委託 | **15%** |
| 接委託（承接） | **15%** |
| 完成工作（完成委託） | **15%** |

```js
const BUBBLE_CHANCE = 0.15; // 禁止改成成長公式
```

### 9.2 不擲氣泡的情況

- 無在場看板娘  
- 睡眠時段（沿用既有「睡眠關互動」則一致關閉）  
- `cardSession.phase === "round_play"`（打牌演出中不插）  
- 該 girl 正在生成必敗狀態可跳過  

**不要**在「開始執行」等其他節點加氣泡（除非日後改規格）；目前鎖死三點。

### 9.3 行為

- 顯示 1～2 句（預生池或即時短生成；失敗用罐頭）。  
- 主題：對**當前委託／待辦**的看法、提醒、鼓勵、吐槽。  
- **不**進入全螢幕對話、**不**出手牌、**不**等玩家回覆。  
- 情感：建議 `+1` 以 50% 或固定每次中氣泡 `+0/+1` 各半；**日 cap 建議每隻每日 +2 來自氣泡**（防掛機炸養成）。  
  - 掛機陪伴本身合法；cap 只限制情感，不禁止顯示台詞。  
- 舊 `crestRoll` → 改呼叫 `bubbleRoll` 或等價；**不要**再 `enterChat`。

### 9.4 態度

氣泡用的 system／罐頭應吃：關係六軸、防備、飢渴（見 `relationship-axes.md` 精神）——**短句**，不要長聊 prompt。

---

## 10. 約會牌局

### 10.1 前提

- 該女 **不是** 當前看板娘。  
- `datesToday < 2`（每隻每日 2 次；日界與遊戲一致）。  
- 非睡眠（若全局關互動）。  
- 金幣足夠支付電話＋之後場地。

### 10.2 流程

```
1) 付電話費 gold = rand or fixed in [10, 30]  // 建議依關係：親則較穩接聽但電話費可升高
2) 接聽率 answerRate by stage:
     stranger: 0.10, friend: 0.35, girlfriend: 0.60, wife: 0.80
   失敗 → 金不退（或退一半；鎖死建議：不退，懲罰明確）→ 結束，不計 datesToday？
   建議：撥出即 datesToday+1 或僅成功才+1 — 【鎖死：成功接聽才 +1 次、失敗也扣電話金】
3) 玩家選場地（列表，各有 fee 與 venueId）
4) 付場地費
5) 載入該場地 3 張事件卡（遊玩／色情境／他者視線 等權重；名稱用事件句，禁止 UI 寫「NTR卡」）
6) 玩家押入 inventory 卡（同看板規則）
7) 合併洗抽，N 仍由女子 stage 決定
8) 打牌同 §5
9) 輪末：約會一般「散」；不可走若允許在約會使用則同強制 +1 輪（可 requires.mode 限制僅 kanban）
10) 結束 session
```

### 10.3 場地事件卡命名例（內容）

- 公園：《看風景出神》《沒站穩被扶住》《總覺得有視線》  
- 勿在卡面上印 `色` / `NTR` 字樣；用 tag 內部標記 `play` / `touch` / `sex` / `rival_shadow` 即可。

---

## 11. 創角

新遊戲／清檔：

1. 輸入 **姓名**  
2. 選 **體格、相貌、習慣**（選項池內容模組化）  
3. 從 **恰好 10 張** 基礎話術中 **選 1 張** → `starterSpeechCardId`，寫入 inventory（不碎）  
4. 進入遊戲；商店可買更多話術（貴）與碎卡  

清檔重來可重選——等於換玩家面具。

10 張基礎話術需在 `cards.json` 標 `starter: true`，創角 UI 只列這些。

---

## 12. AI 與生圖銜接

### 12.1 原則

- 核心：規則、骰、碎、鍊、N、氣泡機率。  
- 內容模組：`sceneStart`、steps 文案（v1 不演）、少女本體卡文案、氣泡句、CG prompt。  
- 核心對 AI 回傳：**當不透明字串顯示**，不解析情感。

### 12.2 打牌短 AI（M4 · 已上線）

**路徑：打一張 → 即時下單 → 兩拍演出**（不做整輪預產）。

```
出卡 commit
  → ① 動作旁白（sceneStart；點一下才進 ②）
  → ② 她的回應：有模型 → gen 佇列（prio 高）；等時點點點、不可繼續
       失敗／弱句／無模型 → girlReactionLine 罐頭
  → 玩家「繼續」→ 回手牌或輪末
```

- Prompt：`persona_builder.buildCardPlayPrompt` + `app.js` `cardPlayMsgs`  
  framing 依 `kind`：`girl_trait`／`venue_event`／開門失敗／一般出手。  
- **作廢：** 推出／離開牌桌／看完反應／換下一張時遞增 `playAiGen`；在途收貨 gen 不符則丟棄，不寫入 UI。  
- **禁止**恢復「組牌後整輪預產、燈亮才開戰」（曾實作後已 revert）。

```js
// 概念形狀（實作在 persona_builder + app）
buildCardPlayPrompt(ctx)  // ctx.card_play = { kind, scene_start, prompt_hint, open_fail, … }
→ 1～2 句她的反應（NSFW 依 content_rating 與卡）
```

### 12.3 生圖（M5 · 待做）

- 允許在召後產製期燒長時間。  
- 開戰時：有 cache 用 cache；無則立繪／卡面占位，**禁止**卡死 UI 等 GPU。  
- 多節卡若日後重開：優先 **一張 CG 多用**（裁切／暗角／字幕換節）。

### 12.4 與 `persona_builder.js`

- 長聊天 `buildSystemPrompt` 主路徑可降級；保留給氣泡短 prompt、打牌反應、獻祭等。  
- 六軸精神搬到：本體卡描述、氣泡態度、開門失敗反應、`promptHint`。  
- 防備：仍可累積；影響 N、氣泡、開門，**不一定**需要 `#越界` 行協議（無自由聊天後可簡化）。

---

## 13. 與舊系統對照（遷移）

| 舊（plan-v5 / app.js） | 新 |
|---|---|
| 淫紋亮 → 全螢幕聊天 2～4 回 | **氣泡 15%×3 節點**；養成改打牌 |
| 聊天免費情感 －1～＋2／場 | 每卡感情骰 |
| 約會 5 金選地點 | 電話＋場地費＋場地 3 卡牌局；每隻日 2 次 |
| 自由輸入 | **廢**；話術卡表達風格 |
| crest 出現率隨稀有度 | 氣泡 **固定 15%**（與稀有度脫鉤） |
| Persona 長 session | 短反應生成 |

遷移建議：

1. 舊存檔無 `cardInventory` → 給 `starterSpeechCardId` fallback 一張通用話術。  
2. 舊聊天 history 可保留只讀，不再寫入新 session。  
3. 功能 flag：`features.cardSystem = true` 便於開關。

---

## 14. 驗收清單（給 AI 實作者自測）

### 14.1 常數

- [ ] 貨架 3 張、4h 刷新  
- [ ] 氣泡僅三節點、各 15%  
- [ ] 約會每隻每日 2  
- [ ] 手牌上限 5、本體 ≤3、押入 ≤5  
- [ ] 無全局情感 clamp  

### 14.2 碎與不碎

- [ ] 話術打出不減庫存  
- [ ] 高級卡確認打出後 count－1（失敗開門也減）  
- [ ] 未打出押入卡退庫  
- [ ] ~~多節停手仍減~~ → **v1 不驗**（§5.4）  

### 14.3 鍊

- [ ] K 來自卡面  
- [ ] 相容性灰手牌  
- [ ] 開門失敗無鍊且碎  
- [ ] 虐不自動連打三張內容  

### 14.4 流程

- [ ] 無封牌步驟  
- [ ] 召後可不打只陪  
- [ ] 看板中拒約會  
- [ ] 不可走只＋1 輪不是無限  

### 14.5 禁止回退

- [ ] 委託完成不會 `enterChat` 全螢幕養成聊  
- [ ] 情感不來自 AI 文案解析  

### 14.6 M4 短 AI

- [ ] 出卡兩拍：先動作旁白，點一下才進她的回應  
- [ ] 有模型等 AI 時點點點、不可繼續；左上角可推出  
- [ ] 失敗／弱句／無模型回落罐頭  
- [ ] 推出／離開後遲到 AI 結果不覆寫 UI（作廢 gen）  
- [ ] 無整輪預產 phase（`pregen`／`ready` 不應再出現於新局）  

---

## 15. 建議實作順序（降風險）

| # | 項 | 狀態 |
|---|---|---|
| 1 | 資料 `cards.json` + inventory／shop | **已上線（M0）** |
| 2 | 無 AI 打牌：sceneStart + 罐頭 + 骰 + 碎 + N + 輪末 | **已上線（M1）** |
| 3 | 氣泡 15% × 三委託節點 | **已上線（M2）**；可走即時短 AI |
| 4 | 創角 10 選 1 | **已上線（M0）** |
| 5 | 鍊完整 | **已上線（M1）** |
| 6 | 約會電話＋場地 3 卡 | **已上線（M3）** |
| 7 | 短 AI 反應（即時、兩拍、作廢） | **已上線（M4）** |
| 8 | 生圖 CG cache／占位 | **待做（M5）** |
| 9 | 舊聊天入口隱藏／刪、存檔遷移 | **待做（M6）** |

---

## 16. 內容資料檔（完整）

**正式卡表與場地：** [`web/content/cards.json`](../web/content/cards.json)

| 區塊 | 說明 |
|---|---|
| `_meta` / `enums` / `defaults` | 版本、列舉、與本文對齊的常數副本 |
| `starter_pool` | 創角 10 選 1 的 id 列表（必須與 `starter:true` 的卡一致） |
| `shop_weights` | 貨架可上架的 speech／premium 池 |
| `cards[]` | 全部卡（話術／高級碎卡／本體模板／場地事件） |
| `venues[]` | 約會場地；每場 **恰好 3** 張 `cardIds` |
| `girl_card_build_rules` | 產製時如何組 ≤3 本體卡 |
| `bubble_canned` | 氣泡無 AI 罐頭（`{quest}` 占位） |

實作時：

1. 開機 `fetch`／打包載入此 JSON。  
2. **數值與規則只信欄位**，不信 `name` 文案。  
3. 改價、改骰區間、改 `openChain.k` 可只改 JSON；**改 id 會壞存檔**。  
4. 新增卡：補進 `cards[]`，若可上架再寫入 `shop_weights` 對應池。  

約略規模（以檔案為準）：話術 14（10 starter）／高級碎卡 19／本體模板 7／場地事件 15／場地 5。

---

## 17. 變更紀錄（規格討論凍結點）

| 日期 | 摘要 |
|---|---|
| 2026-08-04 | 初版鎖定：牌桌取代自由聊天；碎卡／話術；鍊；感情骰；氣泡 15% 三節點；商店 3／4h；約會每隻日 2；無封牌；未用不碎；開門失敗也碎；K 卡面寫死；無全局情感 clamp；掛機陪伴合法；召喚師線除外 |
| 2026-08-04 | 落地 `web/content/cards.json` 完整草案；`plan-v5.md` §13A 索引 |
| 2026-08-05 | **M0～M4 標為已上線**；打牌 AI＝即時兩拍（禁止整輪預產）；**§5.4 多節卡 v1 不做**（待討論後再鎖）；M4 作廢在途 AI（`playAiGen`）；§15 狀態表；§14.6 短 AI 驗收 |

---

**文件結束。** 實作疑問應優先對照 §0.2 禁止事項與 §14 驗收；不要重新開啟「要不要自由聊天」類討論。若需改鎖定常數，必須先改本文並標變更紀錄，再動程式。
