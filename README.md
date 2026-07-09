# 魅魔萬事屋(Yorozuya)

Todo 積分驅動的魅魔召喚養成網頁遊戲。

- 白天:做現實委託賺金幣,聊天/約會養魅魔(Ollama)
- 夜間:魅魔回夢境織夢,ComfyUI 生成立繪與相簿(GPU 換班制)

企劃書:[docs/plan-v4.md](docs/plan-v4.md)

## 啟動伺服器(RP5)

```bash
pip install -r server/requirements.txt
cd server && uvicorn main:app --host 0.0.0.0 --port 8000
```

開瀏覽器進 `http://<RP5>:8000/`。存檔在 `data/game.db`(SQLite),生成圖像放 `assets/`。

### API

| 方法 | 路徑 | 說明 |
|---|---|---|
| GET | `/api/health` | 健康檢查 |
| GET | `/api/save` | 取得存檔 `{version, data, updated_at}`;無存檔時 `version=0` |
| PUT | `/api/save` | 寫入存檔 `{base_version, data}`;`base_version` 與伺服器不符回 409(防舊裝置蓋新檔) |
