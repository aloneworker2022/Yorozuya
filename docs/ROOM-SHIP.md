# 房間陪伴上線（ROOM-SHIP）

> **2026-10-02：** 總覽見 [`docs/PLAN-2026-10.md`](PLAN-2026-10.md)。本文規格仍有效，但交付分支已改為 `grok-2026.10`（下文 `grok-telephon` 為歷史）。

> 鎖定規格・落地紀錄。使用者於 `grok-telephon` 說「開始做」後執行。勿重開下列產品決策。

## 鎖定規格

1. **刪除舊感應（sense）**  
   不再作為遠距電話聊天模式（無每小時免費額度感應接通；無名冊／聊天列上的感應專用召喚／約會提示）。

2. **名冊「召喚」＝進房間陪伴**  
   付金幣，把該名冊妹子帶進 **房間陪伴聊天**（嵌進主畫面的像素房），**不是**遠距感應，也**不是**僅看板娘店頭召喚。

3. **召喚費用（黏著價）**  
   - 每次報價擲 **2～4 金**。  
   - 該報價維持到玩家**實際付費使用**那次召喚為止。  
   - **只有成功付費進房後**才重擲下一個 2～4。  
   - 若擲到 4，必須先花掉這 4 金，才會出現新價格。

4. **取消約會（dating）玩家入口**  
   從名冊／感應相關 UI 移除或隱藏「約會」；正常遊玩不再導向電話／公園約會流。  
   設計師測試頁（如 `/test_date`）可保留；主遊戲名冊不得提供約會。

5. **版面**  
   卡片區在**螢幕上方**且**垂直高度壓矮**；**房間**在中下；**輸入**在底部。

6. **印象 UI**  
   尚未製作（使用者確認），本輪不做。

7. **交付**  
   改完立刻 commit + push `origin/grok-telephon`。

## 本輪落地（嵌進主畫面）

| 項目 | 狀態 | 說明 |
|------|------|------|
| `state.roomSummonOffer = { cost }` | ✅ | 載入保證；僅成功付費進房後重擲 |
| 名冊「感應」→「召喚（N金）」 | ✅ | 詳情頁主按鈕 |
| 名冊／詳情「約會」入口 | ✅ | 已移除；被帶走時可保留「窺視」若原邏輯需要（非約會） |
| 付費召喚 → 房間 | ✅ | **同頁** `RoomCompanion.adopt`；不導向 `/test_room` |
| 名冊妹子綁進房間 actor | ✅ | 同 `id`／感情／階段／立繪帶入；`fromRoster` |
| 房間進度回寫名冊 | ✅ | `yoro-room-progress` 事件即時合併 + localStorage 雙保險 |
| 舊 `beginSense`／`fromSense` UI | ✅ | toast「改用名冊召喚進房間」 |
| 舊約會主流程入口 | ✅ | toast 引導改用房間召喚；引擎碼暫留 |
| ship／home 隱藏除錯面板 | ✅ | `body.room-home`／`?ship=1` 藏沙盒面板 |
| 版面：上卡／中房／下輸入 | ✅ | `#home-card-strip` + `#main-room-stage` + `#quest-input-row` |
| `/test_room` 沙盒 | ✅ | 設計師除錯頁保留；**非**生產召喚路徑 |
| 完整嵌進 `index.html` 單頁 | ✅ | 主路徑 |


## 自動生活（房內停留 → 住處 → 每小時活動）

發呆預產圖已取消，離房不再等產圖。

1. **房內停留**：人在房間就設定絕對 `roomVisitUntil = now + kanbanHours()*HOUR`（對齊原看板時長；**不**因聊天／觸摸重設）。還沒有住處的第一次停留也照這個計時。
2. **停留到期 → 離開**：非對話／busy 中，還沒有 `world` 就 `letHerLeave`（找住處）；已經有住處就 `ensureWorldHome` 後安靜回住所。
3. **人在外面**：已有住所，且沒有進行中的打工／亂逛，距上次活動滿一小時才再出門。
4. **侵犯滿 → 逃**：`fleeRoomFromInvasion`（可再召喚）。
5. **名冊隨時可召喚**：有無住處皆可付費召回進房（2～4 金）；半狀態（有 world 無 home）也可召。
6. **有房在外 → 每小時打工／亂逛**：自找到住處起，每 **真實 1 小時** 自動隨機 **打工** 或 **亂逛**（沒工作時先挑工作再上工）。分頁關掉再打開會補跑至多一趟到期活動。手動「活動」按鈕仍可用；§4 妻子專用打工／NTR **不在此列**。

## 刻意延後

- 刪光所有約會引擎檔案與卡桌規則重寫  
- §4 妻子打工／NTR 活動解鎖  
- 印象 UI  
- 生產環境開放房間編輯／家具沙盒（目前嵌層隱藏）  
- 店頭看板娘與房間並存時的完整互動（委託頁看板壓暗）

## 關鍵檔案

- `web/index.html` — `#home-card-strip`／`#main-room-stage`／房間 DOM／腳本載入  
- `web/app.js` — `roomSummonOffer`、名冊召喚、`enterEmbeddedRoomCompanion`、sense/date 切斷、進度合併  
- `web/content/test_room_summon.js` — `RoomCompanion.adopt`／live sync event  
- `web/content/test_room.js`／`room_*.js` — 畫布與角色  
- `web/content/test_room.css`／`web/style.css` — `room-home` 版面  
- `web/test_room.html` — 設計師沙盒（`html.room-page`）

## 操作路徑（玩家）

1. 主頁 `/` → 名冊 → 點妹子詳情 → **召喚（2～4金）**  
2. 扣金成功 → **仍在 `/`**，委託頁中下房間出現她，並打開陪伴輸入  
3. 長按她說話（底部房間對話）；或關掉對話後再長按  
4. 感情／階段在對話中／關閉時即時合併回名冊  

> **實作備註（2026-09-28）：** 名冊召喚依賴 `content/test_room_summon.js` 成功掛上 `window.RoomCompanion`。該模組若語法錯誤無法載入，召喚會扣金但房間進不了人——改模組後務必 bump `index.html` 的 `?v=` 與 `sw.js` CACHE。

> **實作備註（2026-10-02）說話崩壞規則：** 性奮高「本身」（含已到高潮階段）不再讓她嬌喘、說腿軟或斷句；她盡力鎮定、用正常完整句子（頂多臉紅、心不在焉、直白說想要）。只有 `stun_speech.speechMode()` 判為 **痙攣／餘韻／失神（有效失神≥75）／正被刺激**（`body_state.stimulationState()`：陰道／後穴插著手指・跳蛋・假陰莖・小黃瓜・陰莖，或本回合正被摸性感帶）時，prompt、`lightMoanSprinkle`、挑逗模板才會讓說話崩。摟腰／摸臀／大腿／輕摸胸／親嘴＝只允許一瞬短反應。閒聊台詞要有動手動詞（摸／插／揉…）才算「正在碰」（`bodyState.touchVerb`）。

> **實作備註（2026-10-02）失神上限：** 沒有實際刺激（`stimulationState().level<2`，且非痙攣／餘韻）時，`calcStun` 上限 `UNSTIM_STUN_CAP=69`。高潮中繼續調戲（`climaxTease`）本身就是正被刺激，照常可推進失神；刺激中的失神值記在 `bodyState.stunCarry`，停手後每秒 −0.5、每句回覆 −8 退回上限。

> **實作備註（2026-10-02）名冊 stage：** `s.stage` 只存主線四階（stranger／friend／girlfriend／wife），房間 11 細階存 `s.roomStage`；量條與階段標籤用 `displayStage()` 顯示細階。

> **實作備註（2026-10-02）房間是關係唯一真相：** 感情／階段一律照房間 11 階規則（門檻 0/15/35/60/100/140/180/230/280/330/380、自動升降封頂在親密好友／愛人、降階緩衝 5、`stageLock` 優先），`s.roomStage` 是真相，`s.stage` 只是折成的主線四階。`app.js` 的 `normalizeGirlStage`／`roomSyncStage` 與房間 `syncStage` 同規則；`applyAffection` 改整數加減、不再乘稀有度倍率；告白＝親密好友＋感情≥100＋花束 → 女友（感情補到≥100，不再歸零）；求婚＝女友／熱戀／愛人＋戒指 → 妻子（感情補到≥230）。舊存檔：主線女友／妻子但感情低於 100／230 者載入時補到門檻。房間回寫直接寫 `roomStage`，並把 `lastChatDay` 設為今天（房間聊天＝有聊天）。
> 退役（旗標關閉、程式保留）：`MAIN_DECAY_ON=false`（每日沒聊天／沒約會 −3、妻子交辦逾期 −1）、`NTR_ON=false`（感情 < −10 → 陌生離開／熟人被奪走／贖回；舊存檔的 `ntr` 清掉、感情拉回 0）、`CRAVE_ON=false`（飢渴不累積、不進 prompt／UI、不帶進房間）、`SUMMONER_ON=false`（召喚師纏上／召喚走／交配／懷孕娶走／窺視／破除獻祭／取消召喚師天賦 `cleanse`／約會 NTR 岔路與「被帶走」結局；舊存檔的 `summoner` 清成 null，`cleanse` 天賦重擲）。伺服器 `server/sim.py` 的 `SUMMONER_ENABLED=False`：不纏上、不判召喚、不交配，既有 `rels` 與未套用的 `entangled`／`married` 結局在下一輪 tick 清掉（`mem` 保留）；權威時鐘（看板娘到期／委託逾期／跨日）照跑。保留：性慾 `libido`、`bodyState.libido`、忠誠 `stats.loyalty`（日後 NTR 用）。

> **實作備註（2026-10-02）個性帶進房間・逐步揭露：** 名冊妹子進房（`app.js` 與沙盒的 `buildRoomGirlFromSuccubus`）整份帶入 `archetype／catchphrases／reactions／stats（主動・害羞・忌妒・忠誠）／kinks／kinkMeta／chrono／likes／dislikes／hobbies／contrast`；沙盒生成的妹子本來就有整份。進 prompt 的部分由 `test_room_summon.js` 的 `REVEAL_AT` 依房間階決定，兩條路徑同一套：
> - 陌生：個性底色、語氣、口頭禪、主動／害羞的表面舉止
> - 普通：＋喜歡的東西
> - 朋友／親密好友：＋討厭、興趣、怪癖（SFW）、當下心情的反應、作息
> - 女友／熱戀：＋忌妒行為（女友前完全不寫）、完整心情反應表
> - 愛人以上：＋性癖（`性癖標籤`＋`kinkRevealLines` 原強度分級）、性慾傾向（`libido` 名稱＋描述）、NSFW 怪癖；性癖口頭禪仍是順從妻子起
> 生活旁白 prompt 的 `personaBlurb` 也是愛人以上才帶性癖。忠誠目前不進 prompt。除錯：`RoomCompanion.debugPrompt()` 回傳目前的對話 system prompt。
