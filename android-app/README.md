# android-app — 魅魔萬事屋 Android 殼（WebView）

一個很薄的 Android App：全螢幕 WebView 直接載入**你自己的萬事屋 FastAPI 伺服器**
（`server/main.py`）。遊戲本體、存檔、LLM 對話、生圖全都還在伺服器上，App 只是「裝在手機上的瀏覽器分頁」。

> 沒有把 `web/` 打包進 APK：前端用 `/api/*`、`/assets/*` 這類以伺服器為根的路徑，
> 打包成本地檔案會全部斷掉；而且伺服器一更新（git pull），App 下次開就是新版，不用重裝。

與 `android-widget/`（套件 `tw.yorozuya.discover`，桌面「發現」小工具）可同時安裝。
小工具不自己存網址，送出時向本 App 的 `content://tw.yorozuya.app.server/url` 讀目前的伺服器
（同一把 debug 簽名才讀得到）。本 App 還沒設定網址時，小工具會打開魅魔萬事屋。
本 App 套件名 `tw.yorozuya.app`。debug 版沿用 `android-widget/debug.keystore` 簽名，
所以在任何機器 build 的 debug APK 都能直接覆蓋安裝。

## 1. 伺服器端

```bash
cd server
uvicorn main:app --host 0.0.0.0 --port 8000   # 一定要 0.0.0.0，127.0.0.1 手機連不到
```

- 手機和電腦要在**同一個網路**（同一個 Wi‑Fi / 區網），網址填電腦的區網 IP，例：`http://192.168.1.20:8000`
  （Linux：`hostname -I`；Windows：`ipconfig`；macOS：`ipconfig getifaddr en0`）。
- 出門在外：電腦和手機都裝 **Tailscale**，填 `http://100.x.y.z:8000` 或 MagicDNS 名稱
  `http://my-pc.tailnet-xxxx.ts.net:8000`。不要把 8000 直接開到公網（沒有登入保護）。
- 防火牆要放行該 port（例：`sudo ufw allow 8000/tcp`）。
- 網址要指到伺服器**根目錄**（不能是 `http://host/yorozuya/` 這種子路徑，前端的 `/api` 是絕對路徑）。

## 2. 手機端

1. 安裝 APK（允許「安裝不明來源應用程式」）。
2. 第一次開會出現「連到萬事屋伺服器」：輸入網址 → 可先按「測試連線」→「儲存並開啟」。
3. 之後要換伺服器，三種方式任選：
   - **長按桌面圖示 → 「更換伺服器」**（App shortcut）
   - 在遊戲首頁按**返回鍵** → 對話框「離開 / 重新整理 / 更換伺服器」
   - 連不上時會自動顯示錯誤頁，有「重試」「更換伺服器」按鈕

刻意不用「長按畫面」叫設定，因為遊戲本身有長按操作（例如長按獻祭）。

## 3. 功能對照

| 需求 | 做法 |
|---|---|
| 區網 HTTP | `usesCleartextTraffic` + `network_security_config.xml` 允許明文 |
| JS / localStorage | `setJavaScriptEnabled`、`setDomStorageEnabled`、`setDatabaseEnabled` |
| 自動播放 | `setMediaPlaybackRequiresUserGesture(false)` |
| `<input type=file>`（背景圖、匯入存檔、參考圖） | `onShowFileChooser` → 系統檔案選擇器（支援多選；`application/json` 等手機認不得的類型改成全部檔案） |
| `alert / confirm / prompt` | 有設 `WebChromeClient`，WebView 會用原生對話框 |
| 匯出存檔（`<a download href="blob:…">`） | WebView 不支援 blob 下載 → 注入的 JS 攔下來，經 `window.YoroAndroid.saveFile` 存到「下載」資料夾（Android 10+；7–9 存到 App 專屬資料夾） |
| `navigator.vibrate` | WebView 沒實作 → 由 `YoroAndroid.vibrate` 補上（`VIBRATE` 權限） |
| 返回鍵 | `canGoBack()` 就 `goBack()`，否則跳「離開 / 重新整理 / 更換伺服器」 |
| 外部連結 | 非同源網址交給系統瀏覽器；同源留在 App 內 |
| 直式 / 全螢幕 | 鎖直式、無 ActionBar、狀態列/導覽列用遊戲底色 `#16101f`、文字縮放固定 100% |
| 番茄鐘橫向 | `YoroAndroid.setLandscape(true/false)`：轉 `SENSOR_LANDSCAPE`＋收起狀態列／導覽列，結束轉回直式。網頁偵測不到這個方法（舊殼）會提示重裝 |
| debug 除錯 | debug 版開了 `setWebContentsDebuggingEnabled`，USB 接電腦用 `chrome://inspect` |

### 已知限制

- **Service Worker 在 `http://區網IP` 下不會啟用**（非 secure context，手機 Chrome 也一樣）。
  `app.js` 已經用 `if ("serviceWorker" in navigator)` 擋住，所以沒有錯誤，只是沒有離線快取；
  遊戲本來就要連伺服器才能存檔，影響不大。若改用 HTTPS（例：`tailscale serve`/`tailscale cert`），SW 會自動生效。
- 遊戲是單頁 App，彈窗大多沒有進瀏覽器歷史，所以返回鍵不會「關掉彈窗」，而是跳出離開對話框。

## 4. Build

需求：JDK 17+（21 也可）、Android SDK（platform 34、build-tools 34）。不需要 Android Studio。

```bash
cd android-app
echo "sdk.dir=$ANDROID_HOME" > local.properties   # 或設定 ANDROID_HOME 環境變數
./gradlew assembleDebug
# 產物：app/build/outputs/apk/debug/app-debug.apk
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

從零裝工具鏈（Debian/Ubuntu，x86_64）：

```bash
sudo apt install openjdk-21-jdk-headless unzip
mkdir -p ~/android-sdk/cmdline-tools && cd ~/android-sdk/cmdline-tools
curl -LO https://dl.google.com/android/repository/commandlinetools-linux-11076708_latest.zip
unzip commandlinetools-linux-*.zip && mv cmdline-tools latest
export ANDROID_HOME=~/android-sdk PATH=$ANDROID_HOME/cmdline-tools/latest/bin:$PATH
yes | sdkmanager --licenses
sdkmanager "platforms;android-34" "build-tools;34.0.0"
```

> Raspberry Pi / aarch64：Google 的 build-tools（aapt2）只有 x86_64，Gradle 不方便。
> 在這台機器上用 `./build-apk.sh`（Debian aapt + d8，跟 `android-widget/build.sh` 同一套）。
> 產物複製到 `web/yorozuya.apk`，手機開 `/download` 下載。

## 5. 檔案

```
android-app/
├── app/build.gradle                       # applicationId tw.yorozuya.app、minSdk 24、targetSdk 34
├── app/src/main/AndroidManifest.xml
├── app/src/main/java/tw/yorozuya/app/
│   ├── MainActivity.java                  # WebView、錯誤頁、檔案選擇、下載、返回鍵
│   ├── SetupActivity.java                 # 輸入 / 測試 / 儲存伺服器網址
│   ├── AndroidBridge.java                 # window.YoroAndroid：saveFile / vibrate / toast / setLandscape / appVersion + 注入 JS
│   ├── ServerUrl.java                     # 網址正規化、同源判斷（純 Java）
│   ├── Mime.java                          # 檔案選擇器 MIME（純 Java）
│   └── Prefs.java
└── app/src/main/res/                      # 版面、圖示（取自 web/icons/icon-512.png）、shortcuts、network config
```
