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

### 接 Grok Build(無頭 · 訂單佇列)

**不是**直接打 xAI HTTP API,而是伺服器背景執行本機 CLI:

```bash
grok --prompt-file … -m grok-4.5 --output-format json --max-turns 1 …
```

流程與既有「代工生成」相同:**下單 → 佇列 → 收貨**,不做即時串流。

1. 在跑遊戲伺服器的機器上安裝 [Grok Build CLI](https://docs.x.ai),並完成登入:

```bash
grok login
# 或 CI/無 GUI: export XAI_API_KEY=...
```

2. 確認 `grok` 在 PATH(或設 `GROK_BIN=/path/to/grok`)

3. 啟動遊戲伺服器後,遊戲內 **設定 → AI → 供應商選「Grok Build(無頭·訂單)」**,模型填 `grok-4.5`

4. 按「測試連線」應顯示 `Grok Build OK`  
   `GET /api/health` 的 `grok_build: true` 代表找得到 `grok` 指令

可選環境變數:

| 變數 | 預設 | 說明 |
|---|---|---|
| `GROK_BIN` | `grok` | CLI 路徑 |
| `GROK_CWD` | `data/grok_cwd` | 無頭執行用空工作目錄(避免掃到遊戲 repo) |
| `GROK_TIMEOUT` | `0`(不限) | 單筆訂單逾時秒數;`0` = 不限時 |
| `GROK_MAX_TURNS` | `0`(不限) | 傳給 `grok --max-turns`;`0` = 不帶此旗標 |

測試請開 `/testword` →「AI 互動測試台」:可選 Grok Build、測引擎、下單生成,不必先改遊戲設定。

本機 Ollama 仍可用:供應商選 Ollama,填端點與模型名(即時串流 job)。

### API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/health` | 健康檢查(`grok_build` 是否可用) |
| GET | `/api/save` | 取得存檔 `{version, data, updated_at}`;無存檔時 `version=0` |
| PUT | `/api/save` | 寫入存檔 `{base_version, data}`;`base_version` 與伺服器不符回 409(防舊裝置蓋新檔) |
| GET | `/api/llm/tags?provider=ollama\|grok` | 列出可用模型 |
| POST | `/api/gen` | **訂單佇列**(Grok Build / 背景代工共用):`{key, provider, model, messages}` |
| POST | `/api/llm/chat_job` | Ollama 串流 job(Grok 亦相容但前端對 Grok 改走 `/api/gen`) |
