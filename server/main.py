"""魅魔萬事屋 遊戲伺服器(M0 骨架)

- 靜態伺服:web/(遊戲本體)+ assets/(生成圖像)
- 存檔 API:GET/PUT /api/save(SQLite,版本號防呆的 last-write-wins)

啟動:uvicorn main:app --host 0.0.0.0 --port 8000
"""

import json
import sqlite3
import time
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "game.db"
WEB_DIR = ROOT / "web"
ASSETS_DIR = ROOT / "assets"

app = FastAPI(title="魅魔萬事屋")


def db() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS save (
            id         INTEGER PRIMARY KEY CHECK (id = 1),
            version    INTEGER NOT NULL,
            data       TEXT    NOT NULL,
            updated_at REAL    NOT NULL
        )"""
    )
    return conn


class SavePut(BaseModel):
    base_version: int  # 客戶端手上的版本;與伺服器不符 → 409,防舊裝置蓋新檔
    data: dict


@app.get("/api/health")
def health():
    return {"ok": True, "time": time.time()}


@app.get("/api/save")
def get_save():
    with db() as conn:
        row = conn.execute("SELECT version, data, updated_at FROM save WHERE id = 1").fetchone()
    if row is None:
        return {"version": 0, "data": None, "updated_at": None}
    return {"version": row[0], "data": json.loads(row[1]), "updated_at": row[2]}


@app.put("/api/save")
def put_save(body: SavePut):
    with db() as conn:
        row = conn.execute("SELECT version FROM save WHERE id = 1").fetchone()
        current = row[0] if row else 0
        if body.base_version != current:
            raise HTTPException(
                status_code=409,
                detail={"message": "版本衝突:伺服器上有更新的存檔,請先 GET /api/save", "version": current},
            )
        new_version = current + 1
        conn.execute(
            "INSERT INTO save (id, version, data, updated_at) VALUES (1, ?, ?, ?) "
            "ON CONFLICT (id) DO UPDATE SET version = excluded.version, "
            "data = excluded.data, updated_at = excluded.updated_at",
            (new_version, json.dumps(body.data, ensure_ascii=False), time.time()),
        )
    return {"version": new_version}


# ---- 全域背景圖(上傳進 assets/backgrounds,靜態伺服)----

BG_DIR = ASSETS_DIR / "backgrounds"


@app.post("/api/backgrounds")
async def upload_bg(file: UploadFile = File(...)):
    BG_DIR.mkdir(parents=True, exist_ok=True)
    ext = Path(file.filename or "bg.jpg").suffix.lower() or ".jpg"
    if ext not in (".jpg", ".jpeg", ".png", ".webp", ".gif"):
        raise HTTPException(status_code=400, detail="只收圖片")
    name = f"{int(time.time() * 1000)}{ext}"
    (BG_DIR / name).write_bytes(await file.read())
    return {"name": name}


@app.delete("/api/backgrounds/{name}")
def delete_bg(name: str):
    p = BG_DIR / Path(name).name  # 防路徑跳脫
    p.unlink(missing_ok=True)
    return {"ok": True}


# ---- LLM 代理(瀏覽器 → RP5 → Ollama;免 CORS、免混合內容問題)----
# 伺服器不檢視、不修改訊息內容,僅轉發位元組(8.1 零解析原則)


@app.get("/api/llm/tags")
async def llm_tags(endpoint: str = "http://localhost:11434"):
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(endpoint.rstrip("/") + "/api/tags")
            return r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Ollama 連不上")


@app.post("/api/llm/chat")
async def llm_chat(body: dict):
    endpoint = str(body.pop("endpoint", "http://localhost:11434")).rstrip("/")

    async def gen():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=5)) as c:
                async with c.stream("POST", endpoint + "/api/chat", json=body) as r:
                    async for chunk in r.aiter_bytes():
                        yield chunk
        except httpx.HTTPError:
            yield json.dumps({"error": "Ollama 連線中斷"}).encode() + b"\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
