# 魅魔萬事屋(Yorozuya)

Todo 積分驅動的魅魔召喚養成網頁遊戲。

- 白天:做現實委託賺金幣,聊天/約會養魅魔(**Ollama** 或 **Grok Build 無頭**)
- 夜間:魅魔回夢境織夢,ComfyUI 生成立繪與相簿(GPU 換班制)

企劃書:[docs/plan-v4.md](docs/plan-v4.md)

## 啟動伺服器(RP5)

```bash
pip install -r server/requirements.txt
cd server && uvicorn main:app --host 0.0.0.0 --port 8000
```

開瀏覽器進 `http://<RP5>:8000/`。存檔在 `data/game.db`(SQLite),生成圖像放 `assets/`。

### AI 供應商

| 供應商 | 說明 |
|---|---|
| **Grok Build(無頭·訂單)** | 伺服器跑 `grok -p`,走 `/api/gen` 訂單佇列 |
| Ollama | 本機串流 |

**不使用** xAI HTTP API(`api.x.ai`)。

#### Grok Build

1. 安裝 [Grok Build CLI](https://docs.x.ai),並 `grok login`(或本機已有 session)
2. 確認 `grok` 在 PATH(或 `export GROK_BIN=...`)
3. 遊戲設定選 **Grok Build(無頭·訂單)**,模型如 `grok-4.5`
4. `GET /api/health` → `"grok_build": true`

完成偵測:用 `--output-format streaming-json`,收到 `{"type":"end"}` 立刻寫入訂單並結束行程(不等 process 自然退出)。

測試頁:`/testword` → AI 互動測試台 + **Grok Build 生圖測試**。生圖有兩種:整張,或**分段生圖**——
**頭 / 胸 / 下半身**各一張,每段兩輪:第一輪不寫任何服裝欄位,第二輪拿第一輪同段那張當參考圖再把衣服畫上去。
prompt 刻意短,只有該段的抽卡原文加取景(例:`G 罩杯、傲人豐滿、纖細苗條、皮膚白皙 / 下巴到腰,不畫臉`)。
流程是**先出 prompt、人改完、再一段一段按**:`① 產生 prompt` 只組字不生圖,每段各有自己的編輯框與生成鍵,
按哪段才跑哪段(六段 = 六次獨立的 `grok -p`,互不共用記憶),不會一次燒掉六次用量。
膚色與服裝配色人設池裡沒有,由欄位確定性雜湊補一組,同一人設每次都一樣。
分級只管抽卡(`girl_gen` 的 nsfw 項目開關):NSFW 時生圖 prompt 不寫任何分級字眼——寫了只會被 grok 的生圖擋掉。

| 變數 | 預設 | 說明 |
|---|---|---|
| `GROK_BIN` | `grok` | CLI 路徑 |
| `GROK_CWD` | `data/grok_cwd` | 無頭空工作目錄 |
| `GROK_TIMEOUT` | `180` | 文字訂單逾時秒數 |
| `GROK_MAX_TURNS` | `1` | 文字 `--max-turns` |
| `GROK_IMG_TIMEOUT` | `300` | 生圖逾時秒數 |
| `GROK_IMG_MAX_TURNS` | `8` | 生圖允許多回合(要呼叫 image_gen) |

## ComfyUI 生圖 + GPU 換班

Windows 那台把 **ComfyUI 與 Ollama 兩個都常駐**,不再由排程器 AM1 開 AM6 關。
同一張卡不能同時餵兩邊,所以「誰現在能用 VRAM」由 RP5 仲裁(`server/comfy.py`):

| 要跑什麼 | RP5 進去前先做的事 |
|---|---|
| 聊天 | `POST <comfy>/free` `{"unload_models":true,"free_memory":true}` |
| 生圖 | `GET <ollama>/api/ps` 取當下載入的模型 → 逐一 `POST /api/generate` `{"keep_alive":0}` |

- **不寫死模型名**:`/api/ps` 回報實際載入了什麼,掃到什麼卸什麼。
- **黏著**:只有「換邊」那次付卸載+重載成本,連續聊十句或連生十張都不卸。
- **卸不掉不擋路**:對方連不上就當它沒佔 VRAM,寧可讓後手自己 OOM 報錯,
  也不要因為卸載失敗把玩家的聊天卡死。

Windows 端只要讓 ComfyUI 常駐(`--listen 0.0.0.0 --port 8188 --disable-auto-launch`)。
**不要**加 `--highvram` / `--gpu-only`——那會把模型釘在 VRAM,`/free` 卸不乾淨。

### 端點設定(RP5 與顯卡主機不同機)

RP5 上的 `localhost` 指的是 **RP5 自己**,永遠不會是那張顯卡。所以 ComfyUI 位址跟
`ollamaUrl` 一樣是**設定值,不是環境常數**——由前端帶進來,存在存檔的
`settings.comfyUrl`,遊戲設定頁與 `/testword` 共用同一個值:

- 遊戲 **設定 → ComfyUI** 欄位 + 「測試 ComfyUI」
- `/testword` → ComfyUI 區最上面的端點欄 + 「🔌 檢查 ComfyUI」

連得上才會寫回存檔,打錯字不會蓋掉原本能用的位址。填了 `localhost` 又連不上時,
錯誤訊息會直接點名「這是伺服器自己,不是顯卡那台」。

環境變數只是**沒人填時的退路**:

| 變數 | 預設 | 說明 |
|---|---|---|
| `COMFY_URL` | `http://localhost:8188` | ComfyUI 位址退路(正常應由設定頁填) |
| `OLLAMA_URL` | `http://localhost:11434` | 卸載用;聊天實際用的端點會覆蓋它 |
| `COMFY_TIMEOUT` | `300` | 一張圖從送出到收檔的上限(含換班重載) |
| `COMFY_CKPT` | (空) | 預設 checkpoint;留空 = 取 ComfyUI 清單第一個 |
| `COMFY_WIDTH` / `COMFY_HEIGHT` | `832` / `1216` | 算圖尺寸(Illustrious / SDXL 直式) |
| `COMFY_STEPS` / `COMFY_CFG` | `30` / `5.0` | |
| `COMFY_SAMPLER` / `COMFY_SCHEDULER` | `euler_ancestral` / `normal` | |
| `COMFY_CLIP_SKIP` | `2` | Illustrious 系建議值;1 = 不跳 |

預設值對著 **Illustrious / SDXL 系**。這份 workflow 用 `CheckpointLoaderSimple`,
所以只吃**內含 CLIP 與 VAE 的單一 checkpoint**。

**只含主模型的單件檔載不動**(Anima / Cosmos、Flux、Qwen-Image 這類):
`CheckpointLoaderSimple` 回傳的 CLIP 是 `None`,ComfyUI 只會噴
`'NoneType' object has no attribute 'clone'`——完全看不出病灶。所以錯誤有翻譯過,
會直接講「這個 checkpoint 裡沒有文字編碼器」並說明要三件式
(`UNETLoader` + `CLIPLoader` + `VAELoader`)。

`/api/comfy/status` 的 `models` 一次回四種 loader 的清單
(`checkpoints` / `unets` / `text_encoders` / `vaes`),testword 也顯示——
`text_encoders` 是空的就代表機器上根本沒有走三件式的料。

`POST /api/imggen` 帶 `provider: "comfy"` 就走這條(預設仍是 `grok-img`)。
產物與 Grok 那條路存在同一個 `assets/testword/`、同一套命名,相簿不必分開處理。

生圖 workflow 由 `comfy.build_workflow()` 組——這是 plan-v4 §8.3 的「廠商替換點」,
要換模型、加 LoRA、加色彩量化改這一個函式即可。也可以直接在 `workflow` 欄位塞整份
API 格式 workflow,伺服器原樣轉發不檢視。

### 人設 → SD tag(`server/sdtags.py`)

Grok 那條路餵中文敘述,因為對面是會讀句子的 agent。**SD 不是**:CLIP 對中文幾乎沒有
有效編碼,「G 罩杯、傲人豐滿」丟進去約等於沒寫。所以 ComfyUI 這條把抽卡欄位翻成
**純英文 Danbooru tag**。

翻譯用**精確查表**,不做模糊比對:`persona_pools.json` 的字串是固定的廠商件,對不上
就是池子被改過——那種情況**丟掉該欄位並回報**,不把中文原文混進 prompt 假裝有效。
查不到的欄位會出現在 `/api/comfy/preview` 的 `unknown`,testword 直接顯示,池子改了
當場就看得到。膚色/配色沿用 Grok 那條的確定性雜湊,同一人設走哪條路都是同一個人。

分段(頭/胸/下半身)維持跟中文版一樣的取捨:每段只放該段要畫的欄位;第一輪不寫服裝,
靠「不提衣服」而不是「說不要衣服」。**ComfyUI 沒有跨段記憶也不吃參考圖**,六段是六次
獨立 txt2img——這點跟 Grok 那條不同。

測試台:`/testword` → **ComfyUI 生圖測試(本機 GPU · SD tag)**,與上面的 Grok 區共用
同一個抽卡人設。`① 產生 SD tag` 只翻譯不生圖,六段各有自己的編輯框與生成鍵。

### API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/health` | `grok_build` 是否可用 |
| GET | `/api/save` | 取得存檔 |
| PUT | `/api/save` | 寫入存檔(版本衝突 409) |
| GET | `/api/llm/tags?provider=ollama\|grok-build` | 模型列表 |
| POST | `/api/gen` | 訂單佇列 `{key, provider, model, messages}` |
| POST | `/api/imggen` | 生圖訂單(構圖/分級/風格;`part=head0\|bust0\|lower0` 第一輪、`head\|bust\|lower` 第二輪穿搭,`ref` 帶第一輪同段那張,`prompt` 帶改過的版本)→ result 為 `/assets/testword/….png` |
| POST | `/api/imggen/preview` | 不生圖,只組這份人設的六段 prompt(存檔路徑與參考圖那兩行送出前才補) |
| GET | `/api/imggen/list` | 最近生圖列表(含 `part`) |
| GET | `/api/comfy/status?url=` | ComfyUI 通不通、checkpoint 清單、VRAM、GPU 現在歸誰用(`url` 給值 = 測那台並記住) |
| POST | `/api/comfy/preview` | 不生圖,只把人設翻成 SD tag(整張 + 六段 + `unknown` 未對照欄位) |
