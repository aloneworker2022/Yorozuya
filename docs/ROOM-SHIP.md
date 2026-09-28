# 房間陪伴上線（ROOM-SHIP）

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
