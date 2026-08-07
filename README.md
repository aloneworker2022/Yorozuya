# 魅魔萬事屋(Yorozuya)

Todo 積分驅動的魅魔召喚養成網頁遊戲。

- 白天:做現實委託賺金幣,聊天/約會養魅魔(**Ollama** 或 **Grok Build 無頭**)
- 夜間:魅魔回夢境織夢,ComfyUI 生成立繪與相簿(GPU 換班制)

企劃書:[docs/plan-v5.md](docs/plan-v5.md)(關係演出規格另見 [docs/relationship-axes.md](docs/relationship-axes.md))

**互動牌制 v6**(M0～M6 已上線:商店／牌桌／氣泡／約會／出卡短 AI／CG cache／自由聊退役):[docs/card-system.md](docs/card-system.md)

**教 AI／實作者從哪讀起:**[docs/AI-READING-ORDER.md](docs/AI-READING-ORDER.md)

**卡牌編輯器（詞墜繼承 · AI 衍伸／生文／生圖／回應／效果）:** 開伺服器後進 `/cardedit`  
概念：每張卡 = 一個詞墜；子卡繼承父鏈再疊自己的（例：`[問候]` → `[問候] [說笑話]`）。資料仍在 `web/content/cards.json`（`token` / `parentId` / `tokenDesc`）。

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

### 顯卡那台的常駐程式([desktop/](desktop/))

常駐不該佔著桌面。`desktop\` 是一支**系統匣程式**:ComfyUI 一樣 24 小時活著,
但畫面上不留視窗,只在右下角放一顆圖示——灰停 / 黃載入 / 綠通了 / 藍是外部那份 /
紅出事,點下去才開設定頁。掛掉 5 秒自動重開,記錄寫 `<攜帶版>\yorozuya-logs\`。

設定頁是**本機網頁**(`127.0.0.1:53517`,每次啟動換 token)而不是原生視窗:
攜帶版的 `python_embeded` 是 embeddable 精簡包,裡面沒有 tkinter,介面建在
tkinter 上會在那台直接 import 失敗、又因為 pythonw 沒有主控台而靜靜死掉。

裝法:把 `desktop\` 複製進 `ComfyUI_windows_portable` → `install_deps.bat` →
`start_comfy_tray.vbs`。細節見 [desktop/README.md](desktop/README.md)。

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
| `COMFY_URL` | `http://192.168.68.55:8188` | ComfyUI 位址退路(正常應由設定頁填);寫顯卡那台的區網 IP,不是 localhost |
| `OLLAMA_URL` | `http://localhost:11434` | 卸載用;聊天實際用的端點會覆蓋它 |
| `COMFY_TIMEOUT` | `300` | 一張圖從送出到收檔的上限(含換班重載) |
| `COMFY_CKPT` | (空) | 預設 checkpoint;留空 = 取 ComfyUI 清單第一個 |
| `COMFY_WIDTH` / `COMFY_HEIGHT` | `832` / `1216` | 算圖尺寸(Illustrious / SDXL 直式) |
| `COMFY_STEPS` / `COMFY_CFG` | `30` / `5.0` | animij 建議 24~28 步 / CFG 5.0~6.5,Anima 建議 30~50 步 / CFG 4~5 |
| `COMFY_SAMPLER` / `COMFY_SCHEDULER` | `euler_ancestral` / `normal` | = Euler a,animij 建議的其中一個(另有 UniPC / DPM++ 2M Karras) |
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

**沒指定 checkpoint 時會自動避雷**:`models/checkpoints` 裡混著單件檔時,
「取清單第一個」是一顆會重複踩的地雷。踩到一次就把那個檔記進黑名單
(`/api/comfy/status` 的 `bad_checkpoints`),當場換下一個重試,之後不再挑它。
**明確指定的照指定的跑**——使用者說了算,只是會失敗而已。

遊戲 **設定 → 模型** 可以直接選(按「測試 ComfyUI」抓清單),載不動的會標
「沒有文字編碼器,載不動」並停用。留空 = 自動挑第一個能用的。

`POST /api/imggen` 帶 `provider: "comfy"` 就走這條(預設仍是 `grok-img`)。
產物與 Grok 那條路存在同一個 `assets/testword/`、同一套命名,相簿不必分開處理。

生圖 workflow 由 `comfy.build_workflow()` 組——這是 plan-v5 §11.2 的「廠商替換點」,
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

#### 臉分五軸,各 18 項

只寫「大眼睛、長直髮」畫不出同一個人:那是兩個 tag,剩下的臉由模型每次自己編。
所以臉拆成 **臉型 / 眼睛 / 嘴巴 / 髮型 / 髮色** 五軸,各 18 項
(`persona_pools.json` 的 `appearance.face / eyes / mouth / hair / hair_color`,
`/edit_person` 都改得到)。髮型只講形狀,顏色獨立一軸——拆開才組得出
「銀白色的雙馬尾」這種原本抽不到的組合。

舊存檔的 `hair` 是拆軸前「顏色+形狀」合寫的那八項(`烏黑長直髮`…),留在
`sdtags.HAIR` 表尾當相容鍵,老角色的頭髮不會因為改版就靜靜消失。

#### 特殊屬性贏過一般欄位

抽到**巨乳**、人設卻寫著 B 罩杯,兩個都塞進 prompt 只會得到一張兩邊都不像的圖。
特殊屬性是稀有度算分的來源、是玩家真正記得的那一條,所以**它說了算**:
`sdtags.SPECIAL` 每一項都標了「放進哪一段」與「蓋掉哪些一般欄位」,
有 override 的會把對應欄位**整個換掉**,不是疊加。

只有「真的規定了尺寸或顏色」的才蓋。`形狀漂亮的美胸` 沒說幾罩杯,疊上去就好;
`巨乳` 說了,B 罩杯就得讓位。`赤紅色的眼睛` 只管顏色,不動眼型。
畫不出來的那些(體香、名器體質、嗓音)對到空字串,靜靜丟掉。

兩條生圖路走**同一份判定**:tag 那條在 `sdtags.build_prompt`,中文那條由
`_identity_anchor` 用 `sdtags.overridden_fields()` 把欄位的中文換掉,
免得 ComfyUI 畫巨乳、Grok 畫 B 罩杯。

### 服裝:生涯服裝 + 個人衣櫃

抽卡人設裡職業寫得清清楚楚,衣服卻跟它無關——女高中生穿西裝套裝、超商店員穿
黑蕾絲長裙——是這遊戲最出戲的一種錯。所以服裝改成**兩個維度**:

| 維度 | 來源 | 誰決定 |
|---|---|---|
| **生涯服裝** | 職業(`occupations[].outfit`) | 抽到什麼職業就是什麼:女高中生=水手服,護理師=護士服 |
| **個人衣櫃** | 個人喜好(`appearance.style` 抽 6 套) | 她自己的品味,依關係解鎖 |

**立繪預設畫生涯服裝**。個人衣櫃一次抽滿六套(品味是天生的,不是升級長出來的),
但玩家看得到幾套要看關係:

| 關係 | 解鎖 |
|---|---|
| 陌生 | 0 套——你只見過她工作時的樣子 |
| 朋友 | 1 套 |
| 女友 | 3 套 |
| 妻子 | 6 套 |

詳細頁的衣櫃列可以點,沒解到的畫成 🔒。**換衣服會把三張立繪全部重織**——
舊圖穿的是舊衣服,留著只會不一致。選擇存在 `outfitPick`(`-1`/沒挑 = 生涯服裝,
`0..5` = 衣櫃索引),伺服器端由 `main._outfit_of()` 解析,聊天的人設描述
(`persona_builder.lookText`)走同一套規則,她講的跟畫的才是同一身衣服。

生涯服裝自己就是一整套配色(護士服白的、巫女服紅白),所以穿生涯服裝時**不疊
調色盤**;個人衣櫃那邊才用得上。對照表:`sdtags.CAREER_OUTFIT`(37 種職業)與
`sdtags.STYLE`(23 種穿搭)——**這兩組要跟池子對齊**,少一項就會墊
`casual clothes`,穿搭等於白選。

分段(頭/胸/下半身)維持跟中文版一樣的取捨:每段只放該段要畫的欄位;第一輪不寫服裝,
靠「不提衣服」而不是「說不要衣服」。**ComfyUI 沒有跨段記憶也不吃參考圖**,六段是六次
獨立 txt2img——這點跟 Grok 那條不同。

**她們不是魔物。** `world.md`:「魅魔不是地獄來的惡魔…那只是他們對你的叫法」、
「你原本是現實世界裡一個普通女子——護理師、上班族、插畫家、店員」、「你還是你,
只是身體不是了」。職業池也全是現代人。所以立繪就是**一個現代成年女性**,沒有角、
沒有翅膀、沒有尖耳;被改的是感覺與慾望,那些畫不出來,也不該用長角來代替。

`demon girl / succubus / horns / pointy ears / wings / tail / witch / monster girl`
一律進 **negative,沒有開關**——只在正面寫「她是人」不夠,動漫模型看到這種遊戲
語境會自己長角。

**年齡是必填的。** 不給年齡,模型畫出來的年紀會隨機漂,同一個人設每次看起來都
不同歲數。`girl_gen` 抽 18~33(範圍在 `persona_pools.json` 的 `female.age`,
`/edit_person` 可改),prompt 寫成 `29 years old, mature female, adult face`。
舊存檔沒這欄的,由人設雜湊補一個固定值(同一個人不會每次變)。
`child / loli / underage / baby face` 一律進 negative。

### 品質前綴與分級 tag:兩種底取聯集

animij 有兩條血統,兩邊建議的字**不一樣**:

| | 品質前綴 | 分級 tag |
|---|---|---|
| Illustrious(v3 及更早) | `masterpiece, best quality, amazing quality, very aesthetic` | `general / sensitive / questionable / explicit` |
| [Anima](https://huggingface.co/circlestone-labs/Anima)(v10 的底) | `masterpiece, best quality, score_7, safe` | `safe / sensitive / nsfw / explicit` |

取聯集,讓兩種底各自吃到自己認得的那幾個,認不得的就是個無害的未知 token
(跟 negative 的 `score_1/2/3` 同一個做法):

```
QUALITY_PREFIX = "masterpiece, best quality, score_7, amazing quality, very aesthetic"
RATING = {"sfw": "general, safe", "nsfw": "nsfw"}
```

分級那組原本只寫 `general`,那是一個**實質錯誤**:Anima 底的 checkpoint 根本不認得
這個字,SFW 這個訊號整個丟失。兩個都寫就沒這問題。`nsfw` 兩邊都認,不用動。

(兩家作者其實都說 fine-tune 過的版本不太需要品質 tag——animij 頁面寫
「special care was taken so you don't need any quality tags」。留著是為了萬一換成
沒調過的底模,不是因為非有不可。)

### negative:只擋畫崩,不擋內容

`sdtags.negative_for(flat_bg)` **不看分級**。早期版本在 SFW 時塞了一整串
`nude, nipples, topless, naked…`,那是錯的:

1. 分級是**抽卡**在管的(`girl_gen` 的 nsfw 項目開關),不是靠 negative 擋。
2. 服裝現在由生涯服裝/衣櫃釘死,正面就寫著 `fully clothed, nurse uniform`——
   衣服已經指定了,在 negative 再喊一次不會更牢。
3. negative 不是免費的。Illustrious / Anima 系對 negative 很敏感,塞越多越稀釋,
   真正要擋的畫崩反而被擠掉。

現在這組取三邊的交集——[animij 作者頁](https://civitai.com/models/1353314/animij)
的建議、[Anima base 的 README](https://huggingface.co/circlestone-labs/Anima)、
[Illustrious 社群通用版](https://www.seaart.ai/articleDetail/cv1q3h5e878c7381iehg)。
三邊講的都是同一件事:畫質、壓縮瑕疵、手指、簽名浮水印、單色與分鏡。
**沒有任何一邊把內容詞寫進 negative。**

| 組 | 內容 | 為什麼留 |
|---|---|---|
| `NEGATIVE` | 畫質 / 瑕疵 / 手 / 簽名 / 單色 / 分鏡 | 三邊的交集 |
| `AESTHETIC_NEGATIVE` | `score_1, score_2, score_3` | animij 作者頁與 Anima README 都列了(Pony/Anima 血統的評分 tag) |
| `NOT_DEMON_NEGATIVE` | `horns, pointy ears, wings, tail, demon girl, monster girl` | 長角就是「畫面跑偏」。去掉重複下注——`horns` 已蓋掉 `demon horns` |
| `AGE_NEGATIVE` | `child, loli, chibi, baby face` | 把臉型與比例釘在成人那邊;`underage` 這種內容詞模型不太吃,刪了 |
| `FLAT_BG_NEGATIVE` | `scenery, indoors, outdoors…` | 只在要去背時加,不然外框判定會失敗 |

SFW 從 **50 個 tag 降到 31 個**(去背 36 個)。

服裝欄位查不到對照時墊一件 `casual clothes`——沒有任何服裝 tag = 模型自由發揮。
`comfy.DEFAULT_NEGATIVE` 直接引用 `sdtags.NEGATIVE`,不在兩處各抄一份。

測試台:`/testword` → **ComfyUI 生圖測試(本機 GPU · SD tag)**,與上面的 Grok 區共用
同一個抽卡人設。`① 產生 SD tag` 只翻譯不生圖,六段各有自己的編輯框與生成鍵。
下面的 **召喚三連拍・prompt 檢查** 列出**遊戲召喚時真的送出去的那三份**
(prompt + negative + 尺寸 + 去背與否),可以直接改框裡的字再按「產這張」。

### 召喚三連拍

設定 → 生圖選 **ComfyUI** 之後,每位妹子固定出三張,各處各取所需:

| 種類 | 出圖 | 去背 | 用在 |
|---|---|---|---|
| `head` 大頭照 | 256×256 | 是(門檻 55%) | 名冊縮圖、聊天名字旁的頭像 |
| `half` 半身 | 832×1216(原尺寸) | 是(門檻 72%) | **聊天立繪**(文字冒險式,站在對話框上方)、詳細頁 |
| `full` 全身 | 832×1216(原尺寸) | 是(門檻 72%) | **看板娘背景板**(約 78vh)、召喚結果卡 |

`half` / `full` **不縮圖**:它們要撐滿手機畫面,縮到 192 寬再放大只會糊。
plan-v4 訂的 192×288 是像素 sprite 時代的規格,改用 SDXL 出圖後那個尺寸太小。
`head` 縮到 256 是因為它只顯示在 2em 見方的頭像框裡,留大圖純浪費。

### 立繪去背(`server/cutout.py`)

SD 畫不出 alpha,所以是**先要一塊平背景、生完再摳掉**:prompt 加
`simple background, white background`(negative 排除 scenery / 場景),
下載後用 Pillow 從四邊往內漫延,把連通到畫面外緣的背景轉成透明。
**三連拍三張都去背**(早期版本讓大頭照留白底,但遊戲底色是可換主題的深色/亮色,
白方塊疊上去永遠不搭)。

從邊緣漫延而不是「顏色接近白就砍」,是因為角色身上也有白:白襯衫、白髮、
眼睛高光。只吃連通外緣的那一塊,身體內部的白動不到。遮罩在 1/4 邊長的縮圖上
算(純 Python BFS 約 0.1 秒),放大回原尺寸時的雙線性插值順便羽化邊緣——
但**長邊不縮到 `MASK_MIN`(192)以下**:256 的大頭照再除以 4 只剩 64,
一撮頭髮不到一個像素,摳出來的邊會像鋸子。

**背景色取外框一整圈的眾數**,不是四個角落的中位數。四角那招對半身/全身沒問題,
對大頭照是錯的:head-and-shoulders 構圖的左下、右下兩角就是她的肩膀,四取二有
一半是人,中位數會挑到角色的顏色,然後漫延去摳的就是角色。取整圈眾數才穩,
模型畫成淺灰或淺藍也一樣摳得掉。

**邊緣白框**:SD 出的圖是反鋸齒的,角色與背景之間有一兩個像素是兩者的混色——
它們既不夠接近背景色(漫延走不過去)、又明顯比角色亮,留下來疊在深色遊戲背景上
就是一道白框。所以遮罩算完之後往角色方向多吃 `DILATE`(1px,`MaxFilter`)再羽化。
實測反鋸齒邊緣的「亮到接近背景色」像素從 64% 降到 1%。

三道閘門任一不過就**原圖不動**——寧可留著背景,也不要交出一張被啃過的破圖:

| 閘門 | 擋掉什麼 |
|---|---|
| 外框命中率 < `border_min` | 模型畫了真實場景,不是平背景 |
| 摳掉 < 8% | 背景不夠平,摳了只留一圈殘影 |
| 摳掉 > 85% | 角色跟背景同色,再摳人就沒了 |

外框命中率是**唯一分得出好壞的判準**:漫延只走接近背景色的像素,摳出來的那塊
必然顏色均勻,所以拿均勻度當判準等於沒判。門檻依構圖分開給(`PORTRAIT_SHOTS`
的 `border_min`):半身/全身 **72%**,大頭照 **55%**——head 的肩膀本來就佔滿
整條下緣,而一條邊就是外圈的四分之一,沿用 72% 等於「大頭照永遠去不了背」。

**Pillow 是選配**:少了它只是不去背(圖照樣生,只是留著背景),伺服器照常啟動。

#### 摳不掉的時候怎麼查

去背是生圖之後的背景步驟,失敗時只會靜靜留著白底——**「怎麼還是白的」原本只有
伺服器 log 講得出原因**,手機上完全看不到。現在三個地方都問得到:

| 位置 | 看得到什麼 |
|---|---|
| 遊戲 **設定 → 測試 ComfyUI** | 「去背可用」或「⚠ 沒裝 Pillow」 |
| 詳細頁(織完之後) | 上次跳過的原因 + 「🩹 再摳一次」 |
| `/testword` → **🩹 去背狀態** | Pillow 狀態、參數、最近 30 筆結果,每筆可單獨重摳 |

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/cutout` | 能不能用、目前參數、最近 30 筆結果 |
| POST | `/api/cutout` | 對**已存在**的圖重摳(`{url, tol, border_min, dilate}`)——補裝 Pillow 或調參數之後不必重生,那要再燒一次 GPU |

`POST` 只認 `/assets/portraits/` 與 `/assets/testword/` 底下的檔案(取 basename
擋路徑穿越)。摳完檔名不變、內容變了,所以回傳的 URL 帶版本號,瀏覽器才不會拿快取。

`/testword` 的「整張」預設**不去背**(那是測 prompt 用的),勾了「生完去背」才做——
勾了會自動把平背景 tag 加進 prompt,沒有平背景可摳的話三道閘門一定擋下來。

- **三張同一個 seed**(取自人設雜湊),所以是同一張臉;重生也還是同一個人
  (plan-v4「同 DNA 維持長相一致」)。
- **召喚只等 `full`**,`head` / `half` 背景補——三張都等等於召喚卡三倍時間,
  玩家在讀結果卡時另外兩張正好織完。
- 算圖尺寸挑 SDXL 標準桶(1024×1024 / 832×1216),出圖才縮到上表尺寸。
- 存 `assets/portraits/{角色id}_{shot}.png`,與 testword 的實驗圖分開。
- 缺哪張、什麼時候補,詳細頁那行會講;按「✦ 織出她的形體」只補缺的,不重生已有的。
- 想要的那張還沒好,`girlShot()` 會退而求其次拿已有的;舊存檔的單張 `portrait`
  也仍然認得(`SHOT_FALLBACK`)。

`POST /api/imggen` 帶 `shot` + `char_id` 就是這條路;尺寸與 seed 由伺服器依規格決定,
不吃前端傳的值。testword 有「📸 召喚三連拍」按鈕跑的是同一條路。

### API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/health` | `grok_build` 是否可用;`cutout` = 有沒有 Pillow |
| GET | `/api/save` | 取得存檔 |
| PUT | `/api/save` | 寫入存檔(版本衝突 409) |
| GET | `/api/llm/tags?provider=ollama\|grok-build` | 模型列表 |
| POST | `/api/gen` | 訂單佇列 `{key, provider, model, messages}` |
| POST | `/api/imggen` | 生圖訂單(構圖/分級/風格;`part=head0\|bust0\|lower0` 第一輪、`head\|bust\|lower` 第二輪穿搭,`ref` 帶第一輪同段那張,`prompt` 帶改過的版本)→ result 為 `/assets/testword/….png` |
| POST | `/api/imggen/preview` | 不生圖,只組這份人設的六段 prompt(存檔路徑與參考圖那兩行送出前才補) |
| GET | `/api/imggen/list` | 最近生圖列表(含 `part`) |
| GET | `/api/comfy/status?url=` | ComfyUI 通不通、checkpoint 清單、VRAM、GPU 現在歸誰用(`url` 給值 = 測那台並記住) |
| GET | `/api/cutout` | 去背能不能用、參數、最近 30 筆結果 |
| POST | `/api/cutout` | 對已存在的圖重摳(`{url, tol, border_min, dilate}`) |
| POST | `/api/comfy/preview` | 不生圖,只把人設翻成 SD tag(整張 + 六段 + `unknown` 未對照欄位) |
