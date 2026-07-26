# 魅魔萬事屋(Yorozuya)

Todo 積分驅動的魅魔召喚養成網頁遊戲。

- 白天:做現實委託賺金幣,聊天/約會養魅魔(**Ollama** / **xAI API** / 可選 Grok Build)
- 夜間:魅魔回夢境織夢,ComfyUI 生成立繪與相簿(GPU 換班制)

企劃書:[docs/plan-v4.md](docs/plan-v4.md)

## 啟動伺服器(RP5)

```bash
pip install -r server/requirements.txt
cd server && uvicorn main:app --host 0.0.0.0 --port 8000
```

開瀏覽器進 `http://<RP5>:8000/`。存檔在 `data/game.db`(SQLite),生成圖像放 `assets/`。

### AI 供應商怎麼選

| 供應商 | 速度 | 說明 |
|---|---|---|
| **Grok(xAI API)** | **快(數秒)** | 推薦。`POST https://api.x.ai/v1/chat/completions`,仍走 `/api/gen` 訂單佇列 |
| Ollama | 視本機 GPU | 本機串流 |
| Grok Build 無頭 | **很慢(常 >1 分)** | `grok -p` coding agent,角色對話不建議 |

#### xAI API(推薦)

```bash
# https://console.x.ai 建 key
export XAI_API_KEY="xai-..."
cd server && uvicorn main:app --host 0.0.0.0 --port 8000
```

遊戲/設定選 **Grok(xAI API·快·訂單)**,模型 `grok-4.5`。  
`GET /api/health` → `"xai": true` 代表有金鑰。

測試頁:`/testword` → AI 互動測試台。

#### Grok Build(無頭)

需本機 `grok` CLI + `grok login`。

完成偵測:伺服器用 `--output-format streaming-json`,收到 `{"type":"end"}` 就視為文章推送完成、立刻寫入訂單並殺掉行程。  
(舊版等 process 自然退出,Build 吐完正文後常還卡在 session 收尾,訂單會一直 `running`。)

| 變數 | 預設 | 說明 |
|---|---|---|
| `XAI_API_KEY` | — | xAI API 金鑰 |
| `XAI_BASE_URL` | `https://api.x.ai/v1` | API base |
| `GROK_BIN` | `grok` | Build CLI 路徑 |
| `GROK_CWD` | `data/grok_cwd` | Build 空工作目錄 |
| `GROK_TIMEOUT` | `180` | Build 逾時秒數 |
| `GROK_MAX_TURNS` | `1` | Build max-turns |

### API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/health` | `xai` / `grok_build` 可用性 |
| GET | `/api/save` | 取得存檔 |
| PUT | `/api/save` | 寫入存檔(版本衝突 409) |
| GET | `/api/llm/tags?provider=ollama\|xai\|grok-build` | 模型列表 |
| POST | `/api/gen` | 訂單佇列 `{key, provider, model, messages}` |
