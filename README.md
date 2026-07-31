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

測試頁:`/testword` → AI 互動測試台 + **Grok Build 生圖測試**(整張,或**三段生圖**:頭 / 胸 / 下半身分開出圖,
三張共用同一份「同一個人錨點」——膚色與服裝配色由人設欄位確定性雜湊產生,同一人設每次都一樣)。

| 變數 | 預設 | 說明 |
|---|---|---|
| `GROK_BIN` | `grok` | CLI 路徑 |
| `GROK_CWD` | `data/grok_cwd` | 無頭空工作目錄 |
| `GROK_TIMEOUT` | `180` | 文字訂單逾時秒數 |
| `GROK_MAX_TURNS` | `1` | 文字 `--max-turns` |
| `GROK_IMG_TIMEOUT` | `300` | 生圖逾時秒數 |
| `GROK_IMG_MAX_TURNS` | `8` | 生圖允許多回合(要呼叫 image_gen) |

### API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/health` | `grok_build` 是否可用 |
| GET | `/api/save` | 取得存檔 |
| PUT | `/api/save` | 寫入存檔(版本衝突 409) |
| GET | `/api/llm/tags?provider=ollama\|grok-build` | 模型列表 |
| POST | `/api/gen` | 訂單佇列 `{key, provider, model, messages}` |
| POST | `/api/imggen` | 生圖訂單(構圖/分級/風格;`part=head\|bust\|lower` 只畫那一段)→ result 為 `/assets/testword/….png` |
| POST | `/api/imggen/preview` | 不生圖,只回這份人設會送出的三段 prompt |
| GET | `/api/imggen/list` | 最近生圖列表(含 `part`) |
