# 電腦端常駐:ComfyUI 系統匣程式

顯卡那台(Windows)用的。**取代 `start_comfy.bat`**——同樣是讓 ComfyUI 一直活著,
但桌面上不留任何視窗,只在右下角工具列放一顆圖示。要看狀態或改設定才點它。

跟 Ollama 的做法一樣:程式在背景跑,人在前景用電腦,兩邊互不打擾。

```
右下角 ●  ← 顏色就是狀態      左鍵 → 設定視窗
                              右鍵 → 開網頁 / 看記錄 / 停止 / 重開 / 結束
```

| 顏色 | 狀態 | 意思 |
|---|---|---|
| 灰 | 已停止 | 沒在跑(自己按停的,或還沒啟動) |
| 黃 | 啟動中 | 行程起來了,還在載模型,`/system_stats` 還沒回應 |
| 綠 | 執行中 | 通了。滑鼠移上去看得到 VRAM 與佇列 |
| 藍 | 外部啟動 | 這個埠上已經有一份 ComfyUI **不是我開的**——不會去搶,結束時也不會帶走它 |
| 紅 | 出問題 | 掛了。5 秒後自動重開;連續三次開不起來就停手,訊息叫你去看記錄 |

## 裝法(三步)

1. 把 `desktop\` 裡的東西**整包複製到 `ComfyUI_windows_portable` 資料夾**
   (就是原本放 `start_comfy.bat` 的那層,裡面有 `python_embeded\` 與 `ComfyUI\`)。
   放這裡就跟 bat 一樣免設定路徑。
2. 雙擊 `install_deps.bat`——它會用**攜帶版那個 python** 裝 `pystray` 與 `Pillow`。
   這裡會開一個窗,是故意的:裝東西失敗你要看得到。
3. 雙擊 `start_comfy_tray.vbs`。畫面上不會有任何東西跳出來,右下角多一顆圖示就是好了。

之後在設定視窗勾「開機時自動啟動」,以後開機就自己上工,`start_comfy.bat` 可以退休了。

> 為什麼是 `.vbs` 而不是 `.bat`:bat 一定會閃一下黑窗。`.vbs` 用
> `WScript.Shell.Run(..., 0, False)`,從頭到尾不建立主控台。
> `comfy_tray.pyw` 的 `.pyw` 也是同一個理由(pythonw = 無主控台)。

## 設定視窗

| 欄位 | 說明 |
|---|---|
| ComfyUI 資料夾 | 攜帶版根目錄(含 `python_embeded\` 與 `ComfyUI\main.py`)**或**直接含 `main.py` 的目錄,兩種都認 |
| Python | 留空 = 自動找:`python_embeded` → `venv` → 系統 python。攜帶版一定要用內嵌那個,系統 python 沒有裝好的 torch |
| 監聽位址 | `0.0.0.0` = RP5 與手機連得到;`127.0.0.1` = 只有這台自己看得到 |
| 連接埠 | 預設 `8188`,要跟遊戲設定頁的 ComfyUI 位址對上 |
| 其他參數 | 例 `--lowvram`。寫了 `--listen` / `--port` 就以你的為準,不會送兩份進去 |
| 常駐程式一開就啟動 ComfyUI | 關掉的話開機只會出現圖示,由你決定何時按啟動 |
| ComfyUI 當掉時自動重開 | 就是 bat 的 `restarting in 5s` |
| 開機時自動啟動 | 寫 `HKCU\...\Run`,不需要系統管理員 |

視窗下方那行「實際會執行」會即時顯示組出來的完整指令——**路徑猜錯看得出來**,
按儲存前就知道它到底要跑哪個 python、哪個 `main.py`。

## 記錄

沿用 bat 的位置:`<攜帶版>\yorozuya-logs\comfyui.log`,超過 20MB 轉存 `.1`。
托盤選單的「檢視記錄」直接開視窗看最後幾百行(會自動跟著捲),旁邊按鈕可以開資料夾。

## 別加的參數

`--highvram` / `--gpu-only` 會把模型釘在 VRAM,RP5 的 `POST /free` 就卸不乾淨,
GPU 換班失效 → 換聊天時 Ollama 那邊 OOM。設定視窗填了會當面標紅警告,
但**不擋**:你說了算,只是要知道代價。`--auto-launch` 同理(它會彈瀏覽器出來,
正是這支程式要消滅的東西)。

## 這支程式不碰 Ollama

跟原本的 bat 一樣,它只管 ComfyUI 的生死。誰能用 VRAM 仍然由 RP5 仲裁
(`server/comfy.py`):聊天前 `POST <comfy>/free`,生圖前掃 Ollama `/api/ps` 逐一卸載。
Ollama 自己在 Windows 上本來就是托盤常駐,不用管。

## 疑難排解

| 症狀 | 處理 |
|---|---|
| 雙擊 vbs 完全沒反應、右下角沒圖示 | 改跑 `debug_tray.bat`,它會留著主控台顯示 traceback |
| 「少了套件」 | 先跑 `install_deps.bat`;pip 本身壞掉的話 `python_embeded\python.exe -m ensurepip` |
| 圖示藍色(外部啟動) | 這個埠上已經有一份 ComfyUI,可能是舊的 `start_comfy.bat` 還開著——先把那個 cmd 視窗關掉 |
| 圖示紅色 | 選單「檢視記錄」,最後幾行就是 ComfyUI 自己的錯誤 |
| RP5 連不到 | 監聽位址要 `0.0.0.0`,並確認 Windows 防火牆放行 8188 |
| 又開了第二份 | 開不起來的:同一台只准一份(綁 `127.0.0.1:53517` 當鎖),第二次會跳「已經在跑了」 |

## 檔案

| 檔案 | 做什麼 |
|---|---|
| `comfy_tray.pyw` | 主程式:托盤圖示、選單、tkinter 主迴圈 |
| `tray_proc.py` | 養 ComfyUI:開關、健康檢查、自動重開、記錄輪替 |
| `tray_config.py` | 設定檔、路徑推測、開機自動啟動 |
| `tray_ui.py` | 設定視窗與記錄視窗 |
| `start_comfy_tray.vbs` | 無聲啟動器(平常雙擊這個) |
| `install_deps.bat` | 裝 pystray / Pillow 到攜帶版 python |
| `debug_tray.bat` | 留著主控台跑,出事時才用 |

設定檔在 `%APPDATA%\Yorozuya\comfy-tray.json`(不放專案目錄:這包會被複製到顯卡那台,
專案隨時可能整包重下載)。
