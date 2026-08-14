# 互動牌制規格（玩家 ↔ 女子）

> **狀態：M0～M6 已上線（含 M5 CG cache／占位）。**  
> **看板打牌節奏 v7（規格已鎖、程式待跟）：** 攜帶 **8**、每輪抽 **2** 打 **1**、**N＝輪數**、詞墜 **B 加權**（無 opener 旗標；節拍 C 留給約會）。見 §4.4～§5.2。與舊「手牌補到 5」衝突時**以本文為準**。  
> 核心玩法（商店／牌庫／牌桌／鍊／氣泡／約會／短 AI）以 `web/app.js` + `web/content/card_engine.js` 為準；本文仍是**規則聖經**（衝突時規則以本文為準，實作 bug 另開修）。  
> 與 `plan-v5.md` 衝突處，**以本文覆寫「聊天／淫紋聊天／舊約會流程」相關段落**。  
> 企劃書索引：`plan-v5.md` **§13A**。  
> **卡牌／場地資料：[`web/content/cards.json`](../web/content/cards.json)**。  
> 召喚師 × NTR × 交配環與牌制的對接：**本文不寫**，另開文件再鎖。  
> **v1 不做多節卡演出**（`steps[]` 資料可留，引擎不跑）— 見 §5.4；重開需討論後改本文。  
> **自由輸入長聊已退役**（M6）— 見 §13。  
> **約會牌桌**：暫不套用 v7 節拍 C；未另鎖前可共用引擎，但 **v7 抽牌／回池／B 以看板為準**（§10 待補）。
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
| 抽 2／回池／詞墜 B 加權（v7） | §4.4～§5.2 |
| 實作鍊（chain） | §7 |
| 實作感情骰 | §8 |
| 實作氣泡（取代淫紋聊天） | §9 |
| 實作約會牌局 | §10 |
| 實作創角 | §11 |
| 接 AI／生圖 | §12 |
| 舊系統怎麼遷 | §13 |
| 驗收清單 | §14 |

### 0.1 設計一句話

> **委託（子彈筆記）養金幣與牌庫；召看板娘把她放進生活（可陪伴、可碎嘴）；深度互動只透過牌桌；無自由文字聊天；商店高級卡用則碎、話術不碎、未用不碎；虐系只開門給「鍊」；女子關係決定本局互動輪數 N；每輪抽 2 打 1（AI 回應＋畫圖＝一輪）；攜帶 ≤8＋妹子本體；已打出 id 本局不進可抽池；下輪抽牌偏同一張的直屬子卡（詞墜 B）；玩家成長管牌庫與可攜張數。**

### 0.2 絕對禁止（AI 常見越權）

1. **禁止**恢復自由輸入的多回合聊天作為養成主路徑。  
2. **禁止**用 NLP／關鍵字解析玩家或 AI 文案來改情感。情感**只**由系統骰／表。  
3. **禁止**把氣泡機率做成隨等級／稀有度成長（鎖定 **15%**）。  
4. **禁止**做「封牌」兩段式 UI（曾提案，已否決；易卡 bug）。  
5. **禁止**虐卡一鍵播放整段連打內容；虐**只**給 `chain` 許可。  
6. **禁止**未使用的碎卡在回合結束銷毀（已改：**未用不碎、退庫**）。  
7. **禁止**在本文範圍實作「別的召喚師出牌」；那是後話。  
8. **禁止**為了「平衡」擅自加全局感情 clamp（例如單次不得 +5）；每張卡自己的 min/max 已是邊界。  
9. **禁止**恢復舊「手牌補到 5／hand_size 當每輪補牌上限」；看板 v7 是 **每輪抽 2、打 1**（§4.4）。  
10. **禁止**為開場卡加 `opener` 專用旗標（方案 A 已否決）；已打出靠 `arc.playedIds` 排除。  
11. **禁止**在看板實作節拍 beat（方案 C）；留給約會另鎖。

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
    │    開戰：妹子本體 ≤3 ∪ 玩家攜帶 ≤8（預設牌組／押入）
    │         ▼
    │    重複最多 N 輪（N＝關係基礎出手＝互動次數）：
    │         可抽池（−本局已打出 id −已碎）→ 詞墜 B 加權抽 2
    │         → 打出 1 張（妹子卡抽到則自動打）
    │         → AI 回應 → 畫圖 → 本輪結束
    │         → 非碎回池概念上仍在 8 張內，但已打出 id 不再進可抽池
    │         → 未打出的那張回可抽池
    │         ▼
    │    N 用完或可抽池空 → 輪末留下判定（或不可走強制 +1 輪）
    │         走 → 妹子本體抽走；未用碎卡退庫
    │         留 → 可再開戰（新 session 或再組牌，見實作）
    │
    └─【約會】（非看板狀態；節拍 C 未鎖）
          電話（金 + 接聽率）→ 選場地（金）→ 牌桌
          （場地 3 張事件卡入池；每隻每日最多 2 次）
```

### 1.1 三種「她出聲」的通道（勿混）

| 通道 | 何時 | 玩家是否出牌 | 情感 |
|---|---|---|---|
| **氣泡碎嘴** | 委託三節點各 15% | 否 | 細水（0 或 +1，見 §9） |
| **打牌演出** | 每輪打出 1 張（AI＋圖） | 是（妹子卡自動也算） | 主養成（感情骰 §8） |
| **舊淫紋全螢幕聊天** | — | — | **廢除／不再作為主路徑** |

### 1.2 看板娘 vs 約會（為何兩者都要）

| | 看板娘 | 約會 |
|---|---|---|
| 她在哪 | 店頭 | 外出場地 |
| 氣泡盯委託 | **有** | 無（或極少；第一版無） |
| 在任天賦暫加 | **有** | 無 |
| 牌池特色 | 妹子本體 ≤3 + 玩家攜帶 ≤8 | 場地事件 3 張 + 玩家編組（節奏待 C） |
| 時間 | 限時在任（既有 3～5h 量級／擴充） | 牌桌結束即散 |
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

  // 本局牌組（開戰時固定意願；實際可抽見 arc）
  roundIndex: number,          // 0,1,2… 同一 session 內第幾輪（每打出 1 張 +1）
  girlCards: CardInstance[],   // ≤3，本體（source=girl）
  injected: CardInstance[],    // 玩家本局攜帶（≤ maxInject=8）
  // 本局「實體池」= girlCards ∪ injected（∪ venueCards 若約會）
  // 可抽池 = 實體池 − arc.playedIds 對應 cardId − 已碎掉的實例
  hand: CardInstance[],        // 本輪出示：固定抽 2（或不足則更少）
  nBase: number,               // 本局女子給的基礎輪數 N
  nLeft: number,               // 剩餘輪數（= 剩餘可完成的「打出 1 張」次數）
  chain: null | { attr: ChainAttr, kLeft: number, sourceCardId: string },
  flags: {                     // 本 session 旗標，供 requires
    undressed?: boolean,
    hypnotized?: boolean,
    // ...
  },
  // 詞墜 B：互動推演（本 session 生命週期）
  arc: {
    lastId: string | null,     // 上一張打出的 cardId
    playedIds: string[],       // 本局已打出的 cardId（可抽池永久排除）
  },
  playedThisRound: string[],   // 本輪日誌（cardId 等）
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
| **女子（關係 stage 等）** | 本局基礎輪數 **N**（＝可完成幾次「打出一張」的互動）；留下率底；本體卡內容與態度 |
| **玩家成長** | 牌庫上限、預設牌組套數、**本局最多攜帶幾張**（上限 **8**）、商店特價欄解鎖等 |

#### 基礎輪數 N（女子）— 建議表（實作可調表，但要集中在一個常數物件）

```js
// N = 本局最多幾輪；一輪 = 抽 2 → 打 1 → AI 回應 → 畫圖
const BASE_PLAYS_BY_STAGE = {
  stranger:    1,
  friend:      2,
  girlfriend:  3,
  wife:        4,
};
// 可選修正（第一版建議只做防備）：
// 若 guard 高：N = max(1, N - 1)
// chain.kLeft 仍可加算「額外可打次數」（見 §5.1／§7）；語意同「多幾輪互動」
```

#### 本局最多攜帶（玩家）— 鎖定

```js
// defaults.max_inject；第一版固定 8（成長軸日後再接 cardPlayerLv）
const MAX_INJECT_CAP = 8;
// 每輪出示張數（不是舊的「手牌補滿」）
const HAND_DRAW = 2; // defaults.hand_draw
```

### 2.6 卡定義（內容模組 JSON）

建議路徑：`web/content/cards.json`（或拆 `cards/*.json`）。  
**核心零解析原則**：演出用 prompt 字串可當不透明內容；**數值與規則欄位由核心讀取**。

```js
{
  id: "speech_soft",
  name: "輕聲安撫",
  kind: "speech",              // speech | shop_premium | erotic | sex | girl_trait | venue_event
  shatterOnUse: false,         // speech false；商店高級 true；erotic **一律 true**；sex 不進庫
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
| `erotic` | **true（強制）** | 色情卡：消耗；**打出必 `forceAnotherRound`**；機率觸發做愛（見 §6.1A） |
| `sex` | false（**不進庫存**） | 做愛卡：由 `pendingSex` 系統抽演（見 §6.1B）；不上架、不進牌組 |
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
- **本局攜帶（押入）** = 開戰前從預設組／牌庫勾選，張數 ≤ **maxInject（8）**，且碎卡不超過 count。  
- 開戰後這 ≤8 張與妹子本體組成**本局實體池**；每輪只從**可抽池**抽 2 張出示（見 §4.4）。

### 3.3 未用／已用（鎖死）

| 情況 | 碎卡（shatterOnUse true） | 話術／不碎卡 | 妹子本體（girl） |
|---|---|---|---|
| 進了本局實體池但本輪未打出 | 回可抽池；局結束退庫 count 不變 | 回可抽池 | 回可抽池 |
| 打出（含開門失敗） | **count－1**，**不回**可抽池 | 概念上仍在 8 張內，但 **cardId 記入 arc.playedIds → 本局可抽池不再出現** | 同不碎：回實體池語意，但 **playedIds 排除**（無碎卡分支） |
| 多節卡中途停手 | **（v1 不做多節）** | — | — |

「打出」定義：玩家在確認層按了確認（或妹子卡自動打出），進入演出／結算流程。  
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

### 4.4 本局牌組與「一輪」（看板 v7・鎖死）

**範圍：** 看板 `mode=== "kanban"`。約會未另鎖前可共用實作，但規格以本節為準。

#### 4.4.1 開戰組池

```
sessionDeck = girlCards (≤3) ∪ injected (≤ max_inject=8)
// 約會另加 venueCards；此處看板不強制

nBase = BASE_PLAYS_BY_STAGE[stage] （± 修正）
nLeft = nBase          // = 剩餘輪數
chain = null
arc = { lastId: null, playedIds: [] }
hand = []
phase = round_play
// 然後立刻執行「開一輪抽 2」（§4.4.3）
```

- **沒有**「洗一整副再手牌補到 5」。  
- **沒有**舊式 drawPile 補牌；每輪都是從**可抽池**重新抽 2。

#### 4.4.2 可抽池

```
drawPool = sessionDeck 中仍「可抽」的實例
  − cardId ∈ arc.playedIds 的全部實例   // 本局已打出的 id：完全不進池
  − 已碎掉（shatter 已結算）的實例
```

- 話術等不碎卡：打出後**仍算在你的 8 張攜帶裡**（不扣 inventory），但 id 進 `playedIds` → **本局可抽池永遠沒有它**。  
- 碎卡：打出後不回池、扣 count。  
- 妹子本體：無碎卡問題；打出後同樣 `playedIds`，本局同 id 不再抽到。

#### 4.4.3 一輪的定義（鎖死）

```
一輪 = 抽 2 → 打出 1 張 → AI 妹子回應 → 畫圖 → 輪結束
```

| 項目 | 規則 |
|---|---|
| 抽幾張 | **2**（可抽池不足則有幾張抽幾張；0 則無法開輪 → 進 round_end） |
| 打幾張 | **恰好 1 張**（完成一次互動） |
| 妹子卡 | `source=== "girl"` 進手牌時：**自動打出**；若 2 張都是妹子卡 → **隨機選 1 張**自動打出 |
| 玩家卡 | 手牌無強制自動時，玩家從 2 張中選 1 |
| N | **N 輪 = N 次互動**；每完成一輪（含自動打妹子）`nLeft` 依 §5.1 扣除 |
| 鍊 | 仍可存在；`playsLeft = nLeft + chain.kLeft` 表示還能再開幾輪 |

#### 4.4.4 輪結束：手牌 2 張去向

手牌清空，再：

| 卡 | 去向 |
|---|---|
| **未打出** | 回可抽池（下輪還可能抽到） |
| **打出且碎** | 不回池；inventory 已扣 |
| **打出且不碎**（含妹子） | 實體池語意保留；**cardId → arc.playedIds**；可抽池不再含此 id |
| 更新 arc | `arc.lastId = 打出的 cardId`；`playedIds` 去重 append |

然後：若 `playsLeft > 0` 且可抽池非空 → **再抽 2 開下一輪**；否則 → `round_end`。

#### 4.4.5 詞墜 B 加權抽牌（鎖死）

**不做 A**（無 `opener` 專用旗標）。**不做 C**（節拍 beat；留給約會）。

只對 **T1＝直屬子** 加權：`card.parentId === arc.lastId`。

```js
// cards.json → defaults.arc_weights（可只改數字）
arc_weights: {
  child: 8,   // T1：parentId === arc.lastId
  other: 1,   // 可抽池內其餘卡
}
```

| 情況 | 抽法 |
|---|---|
| `arc.lastId == null`（第一輪） | **全可抽池均勻** |
| 可抽池內 **存在** T1 | 權重抽樣（T1=`child`，其餘=`other`），**不放回**抽至多 2 張 |
| 可抽池內 **沒有任何 T1** | **全可抽池均勻**（避免抽空；跳題變自然） |

- **跳題**：非 T1 權重 > 0 → 仍可能抽到別樹；抽到並打出後 `lastId` 換成新卡，之後往新樹的 T1 偏。  
- 有 `parentId` 的妹子／玩家卡同一套權重；**無 parentId** 當 `other`。  
- **禁止**用 AI／文案 NLP 決定能否進池或權重。

例：

```
第 1 輪：均勻抽到「打招呼」「看著你」→ 打出「打招呼」
  → 兩張離手；「看著你」回可抽池；「打招呼」→ playedIds
第 2 輪：可抽池無「打招呼」；「問名字」等 parent=打招呼 的為 T1 高權重
  → 「打招呼」抽不到（B + playedIds），不是 opener 旗標
```

---

## 5. 打牌狀態機（一輪一張）

```
round_play 且 playsLeft > 0
  │
  │ 若 hand 空 → 自可抽池 B 加權抽 2（§4.4.5）；池空 → round_end
  │
  │ 若 hand 含妹子卡 → 自動選定要打的那張（2 張皆妹子則隨機 1）
  │ 否則玩家點手牌 1 張
  ▼
requires 檢查（階段、flag、mode）→ 不可則拒絕（自動打出前也要檢；失敗則改抽或改選，見實作容錯）
  │
  ▼
確認層（高級碎卡建議必確認；顯示「用後消失」）
  │ 取消 → 回手牌（自動打出的妹子卡不走取消）
  ▼
標記「已使用」意圖
  │
  ▼
若 openChain：
  判定開門成功 / 失敗（§7）
  失敗 → 感情骰(失敗表) → 演出（AI＋圖）→ shatter → 扣輪數 → 輪末回池規則 → 再抽或 round_end
  成功 → 設定 chain → 感情骰 → 演出（AI＋圖）→ 扣輪數 → 回池規則 → 再抽或 round_end
若 普通卡：
  若 chain 存在且不相容 → 不應能點（UI 灰）；自動選卡時跳過不相容
  感情骰 → 演出（AI 回應＋畫圖）→ shatter 若需 → 扣輪數 → 回池規則 → 再抽或 round_end
  │
  ▼
（v1 跳過多節；見 §5.4）
  │
  ▼
若 playsLeft === 0 或 可抽池空無法再抽 → round_end
否則 hand=[] 後再抽 2，維持 round_play
```

### 5.1 扣輪數規則（鎖死建議，少 bug）

語意：**每完成一輪（打出一張並走完演出）消耗 1 次「可互動」**。

```
function spendPlay(card):
  if chain && chain.kLeft > 0 && cardCompatible(card, chain.attr):
    chain.kLeft -= 1
    if chain.kLeft === 0: chain = null
  else:
    nLeft -= 1
```

開門卡自身：  
**鎖死：開門卡消耗 1 次基礎 N（不消耗舊 chain；開門時清掉舊 chain 再設新 chain）。**

```
function playOpener(card, success):
  chain = null  // 舊鍊取消
  nLeft -= 1    // 本輪本身
  if success:
    chain = { attr: card.openChain.attr, kLeft: card.openChain.k, sourceCardId: card.id }
```

### 5.2 無「補到手牌上限」— 改為每輪重抽 2

**廢除**舊規則：

```
// 已廢：while hand.length < 5 and drawPile.length > 0: hand.push(...)
```

**現行（v7）：**

```
function endRoundAndMaybeDraw(sess):
  // 1) 未打出回可抽；打出依碎／playedIds（§4.4.4）
  // 2) hand = []
  // 3) if playsLeft(sess) <= 0 or drawPool empty: phase = round_end; return
  // 4) hand = weightedDraw(drawPool, arc, k=2)   // §4.4.5
  // 5) 若 hand 含 girl → 排程自動打出（仍算一輪）
```

### 5.3 剩餘輪數顯示

給玩家看敘事化，例如：「她今夜還肯跟你互動的次數」= `nLeft + (chain?.kLeft||0)`。  
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

### 6.1A 色情卡（`kind: erotic`）— 鎖死

| 項目 | 值 |
|---|---|
| 消耗 | **一律用則碎**（`shatterOnUse` 強制 true；JSON 寫錯引擎也碎） |
| 下一輪 | 打出成功 → **無條件** `forceAnotherRound = true`（輪末不骰留下，必再來一輪） |
| 做愛觸發 | 打出時依關係階段擲骰；中了 → `sess.pendingSex` → 看完反應後 `commitSexPlay`（§6.1B） |

**做愛觸發率（鎖死，禁止當成長公式改）：**

```js
// defaults.sex_trigger_by_stage
const SEX_TRIGGER_BY_STAGE = {
  stranger:   1 / 10,  // 陌生
  friend:     1 / 8,   // 朋友
  girlfriend: 1 / 3,   // 女友
  wife:       1 / 2,   // 妻子
};
```

**禁止：**

1. 把色情卡做成不碎／可反覆刷。  
2. 改上述四個分數「平衡」。改＝改體驗＝當 bug 開。  
3. 用 NLP 解析台詞假裝做愛好感；做愛場面只走 `kind=sex` 卡。  
4. 未觸發時清掉「別張已掛的 pendingSex」以外的多餘狀態機（目前一打一結算即可）。

**資料／實作：**

- 引擎：`isEroticCard` / `shattersOnUse` / `rollSexTrigger` / `applyCardEffect` 內建 force＋擲骰。  
- 商店：可走 `shop_weights.erotic_pool`；未列則 `kind===erotic` 回退進 premium 槽。  
- UI：確認層提示「用後消失 · 無條件可下一輪 · 機率做愛」；觸發時 meta 標「觸發做愛（下一幕）」。

### 6.1B 做愛卡（`kind: sex`）— 鎖死

| 項目 | 值 |
|---|---|
| 來源 | **不上商店、不進玩家庫存、不進牌組**；只由系統在 `pendingSex` 時抽 |
| 池 | `defaults.sex_base_pool` 或 `shop_weights.sex_pool` 或 `kind=sex` |
| 何時演 | 色情卡反應「繼續」後，若 `hasPendingSex` → `commitSexPlay` 自動一張 |
| 輪數 | **不扣 `nLeft`**（色情卡後的追加場面） |
| 感情 | 正常 `rollEmotion`（tags 含 `sex` → sex lane fallback） |
| 結束 | 清 `pendingSex`；若原已無輪數 → `roundEnded` 再進輪末 |

**做愛樹（`parentId` 詞墜；每層分支各 2 張）：**

| 階段 | 層 | 內容 |
|---|---|---|
| **前戲** | 根 `sexBase` + L1 `foreplay_l1` | 強吻／扯衣／褪底褲／指探及其加深 |
| **正戲** | L2 `sex_act` / `intercourse` | **進入插入** |
| **激烈正戲** | L3 `sex_act_l3` / `intercourse_intense` | 更狠、更快、中出邊緣／失神等 |
| **迎合高潮** | L4 `sex_act_l4` / `climax` | **女子主動迎合**＋**她的高潮** |
| **玩家收束** | L5 `sex_act_l5` / `player_climax` / `sexEnd` | **玩家高潮**（內射／拔出射等）並**結束鏈** |

| 層 | 數量 | 分支規則 |
|---|---|---|
| 根 | 4 | — |
| L1 | 8 | 每根 ×2 |
| L2 | 16 | 每 L1 ×2 |
| L3 | 32 | 每 L2 ×2 |
| L4 | 64 | 每 L3 ×2 |
| L5 | 128 | 每 L4 ×2 |
| **合計** | **252** | |

**種類（資料 kind）：**

| kind | 中文 | 誰選 |
|---|---|---|
| `foreplay` | 前戲 | **玩家 2 選 1**（根與 L1） |
| `intercourse` | 正戲 | **系統隨機**（L2～L5） |

**流程（鎖死）：**

1. 色情卡觸發 → 從前戲根池抽 **2** 張 → 玩家選 1  
2. 前戲 L1：該根的 2 張 L1 → 玩家再選 1  
3. 進入正戲後：系統隨機走樹；**每打完一張正戲**（非收束）擲：  
   - **same** 權重 1/2：再出**同一張**  
   - **finish** 權重 1/3：**直接跳射精**（L5 收束）  
   - **next** 權重 1/3：進**下一張**子卡  
   - 三權重**正規化**後抽（口頭 1/2+1/3+1/3；同卡最多 `sex_same_max` 預設 2 次）  
4. L5 / `sexEnd`：鏈結束  

詞墜例：`… [她主動纏緊高潮] [射滿在最裡結束]`。

**禁止：**

1. 讓玩家在商店買做愛卡刷庫存。  
2. 做愛卡再擲一次「觸發做愛」套娃。  
3. 池空時卡住整局——應 toast 並略過，清 pending。  
4. **根／L1 寫成陰莖插入**（插入從 L2 起）。  
5. **L2 仍停在前戲**；**L3 不得比 L2 更弱**；**L4 必須有迎合＋她的高潮**；**L5 必須是玩家高潮收束**。  
6. **正戲階段給玩家選卡**（只能系統隨機 + 上述三分支）。

### 6.2 預設留下判定

當 `!forceAnotherRound`：

```
P = STAGE_STAY_BASE[stage]  // 建議落在 5%～50% 總區間
// 可選修正（第一版可只做 base；要加修正必須集中常數）
P = clamp(P, 0.05, 0.50)
if random() < P: 進入下一輪 round_setup
else: 她離開本 session → **結束打牌並解除看板召喚**
```

**看板：結束打牌 ＝ 解除看板（鎖死）：**

- 輪末「離開」／關桌／「結束牌局」= **從 `kanbans` 移除**（這次召喚結束）。  
- 名冊保留（不是獻祭）；可再付費「召喚為看板娘」。  
- 約會 mode 只散場，不碰看板名單。  
- （舊稿「人仍在店頭直到 until」已作廢。）

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

- 本局實體池裡 **source===inventory && 未進 playedIds（未打出）** → 退庫（本來就沒扣 count）。  
- 手牌未打出的出示卡在輪與輪之間已回可抽池；**session 關閉**時同上退庫。  
- **已打出** 的碎卡已在打出時扣 count；話術不扣 count，但本局已在 playedIds。 
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

### 8.2A NSFW 三階段感情（鎖死 · 優先於卡面與「女友前必負」）

| 階段 | kind | min | max | 說明 |
|---|---|---|---|---|
| **猥褻** | `erotic` | **−15** | **−5** | 色情消耗卡 |
| **前戲** | `foreplay` | **+3** | **+9** | 玩家 2 選 1 |
| **正戲** | `intercourse` | **+5** | **+10** | 含激烈／她高潮／玩家收束 |

- **全關係階段共用**同一區間（不依 stranger／wife 分表）。  
- 引擎 `nsfwPhaseEmotion` **優先**；不套用舊「女友前感情硬夾負分」。  
- 常數：`defaults.emotion_nsfw_erotic` / `emotion_nsfw_foreplay` / `emotion_nsfw_intercourse`。  
- **禁止**把猥褻做成正分，或把前戲／正戲做成負分「平衡」。

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

### 12.3 生圖／CG cache（M5 · 已上線）

**原則：開戰與出卡路徑零等待 GPU。** 出卡真·場景圖走 `queueCardSceneArt`（背景佇列，不擋打牌）。

#### 12.3.1 出卡 prompt 三層（鎖死語意）

```
最終送進繪圖引擎 = ① 身份固定  +  ② 卡牌運鏡  +  ③ 回應神態
```

| 層 | 來源 | 寫什麼 | 不寫什麼 |
|---|---|---|---|
| **① 身份固定** | 立繪同一套：`character` + identity **seed** + sdtags 素質（髮眼身服裝、QUALITY） | 她是誰、畫質、與半身立繪同一人 | 這一拍的劇情動作 |
| **② 卡牌運鏡** | 卡面 `visualEn`（英文逗號 tag） | **玩家眼裡**的構圖：POV、距離、取景、前景痕跡（揮手→手入鏡；站遠→全身；打招呼→頭肩） | 她的情緒表情（生氣／開心…） |
| **③ 回應神態** | 回話後 AI：`表情`／`動作` → 英文 reaction tags（`play.imgEn`） | 依台詞可見的臉與肢體（生氣→angry, hands on hips；蹲下→crouching；心不在焉→distracted） | 運鏡／POV／外貌身份 |

實作：`app.js` `weaveCardSceneShot`  
- ① → `character` + `lock_identity`（server）  
- ②+③ → 串進 `extra`（server 接在身份 tags 後）  
- `visualEn` **只**當層 ②；禁止把「她很生氣」寫進卡面。  
- 層 ③ 必須等有 `girlLine`（或罐頭回話）後才產；無模型則只有 ①+②。

#### 12.3.2 CG cache

| 時機 | 行為 |
|---|---|
| 召看板娘 | `ensureArtCacheBg` 背景補 half／head／full；不擋 UI |
| 開牌桌／約會桌 | 同步 `resolveCardTableArt`；背景補缺；**不 await 生圖** |
| 出卡 | 先 `bindCardArtAlias` 占位；有模型時 `queueCardSceneArt` 真畫 `card:{cardId}` |
| 無圖 | 字首圓形占位 +「成形中…／尚無立繪」badge |

**資料（存在每位魅魔上）：**

```js
girl.cardCg = {
  "portrait:half": { url, status: "ready", at, source: "portrait" },
  "portrait:full": { … },
  "portrait:head": { … },
  "card:{cardId}": { url, status: "ready", at, source: "scene_play" | "alias_portrait" },
}
```

- 立繪三連拍仍走既有 `weaveShot`／`portraits`；`setShot` 會 `syncPortraitCgCache`。  
- 多節卡若重開：優先同一 `card:{id}` URL 多用（裁切／暗角可後加）。

### 12.4 與 `persona_builder.js`

- 長聊天 `buildSystemPrompt` 主路徑可降級；保留給氣泡短 prompt、打牌反應、獻祭等。  
- 六軸精神搬到：本體卡描述、氣泡態度、開門失敗反應、`promptHint`。  
- 防備：仍可累積；影響 N、氣泡、開門，**不一定**需要 `#越界` 行協議（無自由聊天後可簡化）。

---

## 13. 與舊系統對照（遷移）· M6 已落地

| 舊（plan-v5 / app.js） | 新 |
|---|---|
| 淫紋亮 → 全螢幕聊天 2～4 回 | **氣泡 15%×3 節點**；養成改打牌 |
| 聊天免費情感 －1～＋2／場 | 每卡感情骰 |
| 約會 5 金選地點 | 電話＋場地費＋場地 3 卡牌局；每隻日 2 次 |
| 自由輸入 | **廢**；話術卡表達風格 |
| crest 出現率隨稀有度 | 氣泡 **固定 15%**（與稀有度脫鉤） |
| Persona 長 session | 短反應生成 |

### 13.1 載入時遷移（`app.js` migrate）

1. `features.cardSystem = true`（舊檔可手動關）；`features.freeChatRetired = true`。  
2. 舊存檔無話術 → `ensureStarterFallback` 補一張 starter。  
3. **`retireFreeChatState`**：清 `wantsTalk`／`chatLine`／`chatSess`／`typing`；**不刪** `history`（只讀檔案）。  
4. 舊 `cardSession.phase` 為 `pregen`／`ready` → `normalizeSessionPhase` → `round_play`。  

### 13.2 執行期死路徑（牌制開時）

| 行為 | 處理 |
|---|---|
| `crestRoll`／`crestFallback` | 直接 return |
| `genChatOrder`／`genReplyOrder` | **不下單**（省 LLM） |
| `enterChat(…, "chat")` | 改 `openKanbanTable` 或 toast |
| `enterChat(…, "date")` | 改 `beginDateFlow` |
| `sendChatMsg` type=chat | 踢回牌桌 |
| 觀戰釋放成功 | 接回 `openDateTable(venueId)` 或看板牌桌（**不**進自由聊） |
| 牌桌／約會開局 | `lastChatDay` 更新（舊 need 時鐘） |

**仍保留（非自由聊）：** 觀戰 VN、獻祭 VN、`chat-view` DOM 殼、看板點立繪 `popQuip`、DBG。

### 13.3 未做（刻意）

- 物理刪除 `enterChat`／`CHAT_LINES` 大段死碼（觀戰／舊 flag 仍可能用到；可後續瘦身 PR）。  
- 召喚師線改接牌桌（後話）。  

---

## 14. 驗收清單（給 AI 實作者自測）

### 14.1 常數

- [ ] 貨架 3 張、4h 刷新  
- [ ] 氣泡僅三節點、各 15%  
- [ ] 約會每隻每日 2  
- [ ] 本體 ≤3、本局攜帶 ≤**8**、每輪抽 **2**  
- [ ] `defaults.arc_weights` 有 child／other  
- [ ] 無全局情感 clamp  

### 14.2 碎與不碎

- [ ] 話術打出不減庫存，但本局 `playedIds` 後可抽池不再出現  
- [ ] 高級卡確認打出後 count－1（失敗開門也減）、不回可抽池  
- [ ] 未打出的出示卡回可抽池；局結束未用碎卡退庫  
- [ ] 妹子卡打出不碎、進 playedIds  
- [ ] ~~多節停手仍減~~ → **v1 不驗**（§5.4）  

### 14.3 鍊

- [ ] K 來自卡面  
- [ ] 相容性灰手牌  
- [ ] 開門失敗無鍊且碎  
- [ ] 虐不自動連打三張內容  

### 14.4 流程（看板 v7）

- [ ] 無封牌步驟  
- [ ] 召後可不打只陪  
- [ ] 看板中拒約會  
- [ ] 不可走只＋1 輪不是無限  
- [ ] 一輪＝抽 2→打 1→AI→圖；N＝剩餘輪數  
- [ ] 手牌有妹子卡自動打；兩張皆妹子隨機 1  
- [ ] 第一輪均勻；有 T1 時 child 加權；無 T1 均勻  
- [ ] 無 opener 旗標；無看板 beat  
- [ ] 無「補到手牌 5」

### 14.5 禁止回退

- [ ] 委託完成不會 `enterChat` 全螢幕養成聊  
- [ ] 情感不來自 AI 文案解析  

### 14.6 M4 短 AI

- [ ] 出卡兩拍：先動作旁白，點一下才進她的回應  
- [ ] 有模型等 AI 時點點點、不可繼續；左上角可推出  
- [ ] 失敗／弱句／無模型回落罐頭  
- [ ] 推出／離開後遲到 AI 結果不覆寫 UI（作廢 gen）  
- [ ] 無整輪預產 phase（`pregen`／`ready` 不應再出現於新局）  

### 14.8 M5 CG cache

- [ ] 開牌桌不卡住等生圖（無圖也能打）  
- [ ] 有半身／全身時牌桌顯示立繪  
- [ ] 無圖時字首占位  
- [ ] 召看板後背景會補織（能織時）  
- [ ] 出卡後 `cardCg["card:…"]` 有別名  

### 14.7 M6 自由聊退役

- [ ] 載入後無 `wantsTalk`／`chatLine` 殘燈  
- [ ] 委託操作不會亮淫紋進聊天（只有氣泡）  
- [ ] genTick 不下 `chat:`／`reply:` 自由聊訂單  
- [ ] 舊存檔有進度無牌 → 有 starter 話術  
- [ ] `history` 仍在存檔（只讀，不強制清空）  
- [ ] 觀戰釋放後不進自由聊（約會→牌桌）  

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
| 8 | 生圖 CG cache／占位 | **已上線（M5）** |
| 9 | 舊聊天入口退役／存檔遷移 | **已上線（M6）** |
| 10 | 看板 v7：攜帶 8／抽 2 打 1／playedIds／B 加權 | **規格已鎖（§4.4～§5.2）；程式待跟** |

---

## 16. 內容資料檔（完整）

**正式卡表與場地：** [`web/content/cards.json`](../web/content/cards.json)

| 區塊 | 說明 |
|---|---|
| `_meta` / `enums` / `defaults` | 版本、列舉、與本文對齊的常數副本 |
| `starter_pool` | 創角 10 選 1 的 id 列表（必須與 `starter:true` 的卡一致） |
| `shop_weights` | 貨架可上架的 speech／premium／**erotic** 池 |
| `cards[]` | 全部卡（話術／高級碎卡／**色情**／本體模板／場地事件）；`parentId`／`token` 供詞墜 B |
| `venues[]` | 約會場地；每場 **恰好 3** 張 `cardIds` |
| `girl_card_build_rules` | 產製時如何組 ≤3 本體卡 |
| `bubble_canned` | 氣泡無 AI 罐頭（`{quest}` 占位） |

`defaults` 與 v7 對齊時應含（名稱可微調，語意不可歪）：

```js
{
  hand_draw: 2,          // 每輪抽幾張（廢 hand_size 當補牌上限；舊 hand_size 勿再當補滿目標）
  max_girl_cards: 3,
  max_inject: 8,         // 本局攜帶上限
  arc_weights: { child: 8, other: 1 },
  // 色情卡 → 做愛觸發率（鎖死；見 §6.1A）
  sex_trigger_by_stage: {
    stranger: 0.1,        // 1/10
    friend: 0.125,        // 1/8
    girlfriend: 1 / 3,
    wife: 0.5,            // 1/2
  },
  // …既有 shop／bubble／base_plays_by_stage 等
}
```

實作時：

1. 開機 `fetch`／打包載入此 JSON。  
2. **數值與規則只信欄位**，不信 `name` 文案。  
3. 改價、改骰區間、改 `openChain.k`、改 `arc_weights` 可只改 JSON；**改 id 會壞存檔**。  
4. 新增卡：補進 `cards[]`，若可上架再寫入 `shop_weights` 對應池；要接 B 推演則設好 `parentId`。  

約略規模（以檔案為準）：話術 14（10 starter）／高級碎卡 19／本體模板 7／場地事件 15／場地 5。

---

## 17. 變更紀錄（規格討論凍結點）

| 日期 | 摘要 |
|---|---|
| 2026-08-04 | 初版鎖定：牌桌取代自由聊天；碎卡／話術；鍊；感情骰；氣泡 15% 三節點；商店 3／4h；約會每隻日 2；無封牌；未用不碎；開門失敗也碎；K 卡面寫死；無全局情感 clamp；掛機陪伴合法；召喚師線除外 |
| 2026-08-04 | 落地 `web/content/cards.json` 完整草案；`plan-v5.md` §13A 索引 |
| 2026-08-05 | **M0～M4 標為已上線**；打牌 AI＝即時兩拍（禁止整輪預產）；**§5.4 多節卡 v1 不做**（待討論後再鎖）；M4 作廢在途 AI（`playAiGen`）；§15 狀態表；§14.6 短 AI 驗收 |
| 2026-08-05 | **M5 CG cache 已上線**：`girl.cardCg`、開戰零等待、別名一張多用、占位 badge |
| 2026-08-05 | **M6 自由聊退役**：`freeChatRetired`、清殘燈、停 genChat／genReply、觀戰釋放接牌桌、§13／§14.7 |
| 2026-08-11 | **看板打牌 v7 規格鎖（程式待跟）**：攜帶 **8**；一輪＝抽 **2**→打 **1**→AI→圖；**N＝輪數**；無舊補到手牌 5；打出非碎回實體池但 **playedIds 本局不進可抽池**；碎不回；妹子卡自動打（兩張皆妹子隨機 1）；詞墜 **B** 僅 T1=`parentId===lastId` 加權、無 T1／首輪均勻；**否決 A opener 旗標**；**C beat 留給約會**；§0.2 增 9～11；§4.4～§5.2／§14／§16 defaults 同步 |
| 2026-08-11 | **色情卡 `kind=erotic`**：一律消耗；打出必 `forceAnotherRound`；做愛觸發率陌生 1/10、朋友 1/8、女友 1/3、妻子 1/2（§6.1A）；`pendingSex` 掛點，做愛卡另做；ca 包 10 張已轉 erotic |
| 2026-08-12 | **做愛卡 `kind=sex`**：§6.1B；基礎五張 s0001–s0005；`commitSexPlay` 在色情反應後自動演出、不扣 N、不上架 |
| 2026-08-12 | **做愛基礎池改前戲**：強吻／扯衣／吸奶／褪底褲／指探；禁止基礎卡一上來插入；插入另做進階 |
| 2026-08-12 | **做愛：移除吸奶**；四根各一 L1（吻到腿軟／剝到半裸／分開腿／指加深）；觸發後根→L1 鏈式演出 |
| 2026-08-12 | **做愛 L1 改每根 2 張**（共 8）；鏈接時從該根兩張 L1 隨機抽一 |
| 2026-08-12 | **做愛 L2：每 L1 各 2 張**（共 16）；鏈變根→L1→L2 三幕 |
| 2026-08-12 | **L2 改正戲階段**（插入）；根/L1 僅前戲；`sexTier=sex_act` / `sexPhase=intercourse` |
| 2026-08-12 | **L3 激烈正戲**：每 L2 ×2（共 32）；鏈四幕；`sex_act_l3` / `intercourse_intense` |
| 2026-08-12 | **L4 迎合高潮**：每 L3 ×2（共 64）；鏈五幕；`sex_act_l4` / `climax`；必有女子主動迎合＋高潮 |
| 2026-08-12 | **L5 玩家高潮收束**：每 L4 ×2（共 128）；鏈六幕；`sex_act_l5` / `player_climax` / `sexEnd` |
| 2026-08-12 | **kind 拆 foreplay／intercourse**；前戲玩家2選1；正戲系統隨機；幕後 same½·finish⅓·next⅓（權重正規化） |
| 2026-08-12 | **NSFW 感情三階段**：猥褻 −15～−5；前戲 +3～+9；正戲 +5～+10（全關係共用；不套女友前必負） |

---

**文件結束。** 實作疑問應優先對照 §0.2 禁止事項與 §14 驗收；不要重新開啟「要不要自由聊天」類討論。若需改鎖定常數，必須先改本文並標變更紀錄，再動程式。
