"""魅魔萬事屋 遊戲伺服器(M0 骨架)

- 靜態伺服:web/(遊戲本體)+ assets/(生成圖像)
- 存檔 API:GET/PUT /api/save(SQLite,版本號防呆的 last-write-wins)

啟動:uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import sqlite3
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
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
    # 內容腳本:獻祭手法等,由 /testword 編寫,遊戲隨機選用(核心零解析)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS scripts (
            id       INTEGER PRIMARY KEY AUTOINCREMENT,
            category TEXT NOT NULL,   -- 'sacrifice_offering' | 'sacrifice_succubus' | ...
            method   TEXT NOT NULL,   -- 手法名(砍頭/油炸…)
            body     TEXT NOT NULL,   -- 給 AI 的描述
            created  REAL NOT NULL
        )"""
    )
    # 代工生成佇列:手機下單(key+messages),伺服器背景跑 Ollama、存結果等收貨。
    # 手機關螢幕/切 app 也照跑;伺服器不檢視內容、不碰存檔(數字仍由手機算)。
    conn.execute(
        """CREATE TABLE IF NOT EXISTS gen_tasks (
            key      TEXT PRIMARY KEY,  -- 手機定義的去重鍵(內容狀態指紋)
            endpoint TEXT NOT NULL,
            model    TEXT NOT NULL,
            messages TEXT NOT NULL,
            options  TEXT,
            status   TEXT NOT NULL DEFAULT 'pending',  -- pending|running|done|error
            result   TEXT,
            error    TEXT,
            created  REAL NOT NULL,
            updated  REAL NOT NULL
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


# 聊天改為「job 制」:手機發起後由 RP5 對 Ollama 收完整回覆,
# 手機只輪詢結果——切去別的 app、網路斷線都不會中斷生成。
# 伺服器僅逐字累積原文,不檢視、不修改(8.1)。

CHAT_JOBS: dict[str, dict] = {}


async def _run_chat_job(job_id: str, endpoint: str, body: dict):
    job = CHAT_JOBS[job_id]
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=5)) as c:
            async with c.stream("POST", endpoint + "/api/chat", json=body) as r:
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    o = json.loads(line)
                    if o.get("error"):
                        job["error"] = str(o["error"])
                        break
                    job["text"] += (o.get("message") or {}).get("content", "")
                    if o.get("done"):
                        break
    except Exception as e:
        if not job["text"]:
            job["error"] = f"Ollama 連線失敗({type(e).__name__})"
    job["done"] = True


@app.post("/api/llm/chat_job")
async def create_chat_job(body: dict):
    endpoint = str(body.pop("endpoint", "http://localhost:11434")).rstrip("/")
    body["stream"] = True
    now = time.time()
    for k in [k for k, v in CHAT_JOBS.items() if now - v["t"] > 600]:
        CHAT_JOBS.pop(k, None)
    job_id = uuid.uuid4().hex
    CHAT_JOBS[job_id] = {"text": "", "done": False, "error": None, "t": now}
    asyncio.create_task(_run_chat_job(job_id, endpoint, body))
    return {"job_id": job_id}


# 相容端點:舊版前端(未更新的 PWA)仍打這裡;內部走同一套 job
@app.post("/api/llm/chat")
async def llm_chat_compat(body: dict):
    from fastapi.responses import StreamingResponse

    endpoint = str(body.pop("endpoint", "http://localhost:11434")).rstrip("/")
    body["stream"] = True

    async def gen():
        try:
            async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=5)) as c:
                async with c.stream("POST", endpoint + "/api/chat", json=body) as r:
                    async for chunk in r.aiter_bytes():
                        yield chunk
        except httpx.HTTPError as e:
            yield json.dumps({"error": f"Ollama 連線失敗({type(e).__name__})"}).encode() + b"\n"

    return StreamingResponse(gen(), media_type="application/x-ndjson")


@app.get("/api/llm/chat_job/{job_id}")
def chat_job_status(job_id: str):
    job = CHAT_JOBS.get(job_id)
    if job is None:
        raise HTTPException(status_code=404, detail="job 不存在或已過期")
    return {"text": job["text"], "done": job["done"], "error": job["error"]}


# ---- 內容腳本 API(/testword 編寫、遊戲隨機選用)----


class ScriptIn(BaseModel):
    category: str
    method: str
    body: str


@app.get("/api/scripts")
def list_scripts(category: str | None = None):
    with db() as conn:
        if category:
            rows = conn.execute(
                "SELECT id, category, method, body, created FROM scripts WHERE category = ? ORDER BY id DESC",
                (category,),
            ).fetchall()
        else:
            rows = conn.execute(
                "SELECT id, category, method, body, created FROM scripts ORDER BY id DESC"
            ).fetchall()
    return [{"id": r[0], "category": r[1], "method": r[2], "body": r[3], "created": r[4]} for r in rows]


@app.post("/api/scripts")
def add_script(s: ScriptIn):
    if not s.method.strip() or not s.body.strip():
        raise HTTPException(status_code=400, detail="手法名與描述皆不可空白")
    with db() as conn:
        cur = conn.execute(
            "INSERT INTO scripts (category, method, body, created) VALUES (?, ?, ?, ?)",
            (s.category, s.method.strip(), s.body.strip(), time.time()),
        )
        return {"id": cur.lastrowid}


@app.delete("/api/scripts/{sid}")
def del_script(sid: int):
    with db() as conn:
        conn.execute("DELETE FROM scripts WHERE id = ?", (sid,))
    return {"ok": True}


@app.get("/api/scripts/random")
def random_script(category: str):
    import random
    with db() as conn:
        rows = conn.execute(
            "SELECT id, method, body FROM scripts WHERE category = ?", (category,)
        ).fetchall()
    if not rows:
        return {"method": None, "body": None}
    r = random.choice(rows)
    return {"id": r[0], "method": r[1], "body": r[2]}


# ---- 代工生成佇列(手機下單/收貨;伺服器背景跑 Ollama)----


class GenIn(BaseModel):
    key: str
    endpoint: str
    model: str
    messages: list
    options: dict | None = None
    retry: bool = False  # True:若該 key 先前失敗,重新排隊


GEN_WAKE = asyncio.Event()


@app.post("/api/gen")
def gen_submit(t: GenIn):
    """下單即查詢:同 key 重複下單無害,回傳當前狀態(done 時附結果)。
    先前失敗且 retry=True → 重新排隊(仍回報 error 讓手機計失敗次數)。"""
    now = time.time()
    with db() as conn:
        row = conn.execute(
            "SELECT status, result, error FROM gen_tasks WHERE key = ?", (t.key,)
        ).fetchone()
        if row:
            status, result, error = row
            if status == "error" and t.retry:
                conn.execute(
                    "UPDATE gen_tasks SET status='pending', error=NULL, updated=? WHERE key=?",
                    (now, t.key),
                )
                GEN_WAKE.set()
            return {"key": t.key, "status": status, "result": result, "error": error}
        conn.execute(
            "INSERT INTO gen_tasks (key, endpoint, model, messages, options, status, created, updated) "
            "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)",
            (t.key, t.endpoint.rstrip("/"), t.model,
             json.dumps(t.messages, ensure_ascii=False),
             json.dumps(t.options or {}, ensure_ascii=False), now, now),
        )
    GEN_WAKE.set()
    return {"key": t.key, "status": "pending", "result": None, "error": None}


@app.delete("/api/gen")
def gen_clear():
    """清空代工佇列(測試/改內容後重生用)。"""
    with db() as conn:
        conn.execute("DELETE FROM gen_tasks")
    return {"ok": True}


async def _gen_worker():
    """一次跑一件;前景聊天 job 進行中就讓路(別讓背景生成搶慢即時對話)。"""
    while True:
        try:
            if any(not j["done"] for j in CHAT_JOBS.values()):
                await asyncio.sleep(1)
                continue
            with db() as conn:
                conn.execute("DELETE FROM gen_tasks WHERE created < ?", (time.time() - 172800,))
                row = conn.execute(
                    "SELECT key, endpoint, model, messages, options FROM gen_tasks "
                    "WHERE status='pending' ORDER BY created LIMIT 1"
                ).fetchone()
            if not row:
                GEN_WAKE.clear()
                try:
                    await asyncio.wait_for(GEN_WAKE.wait(), timeout=5)
                except asyncio.TimeoutError:
                    pass
                continue
            key, endpoint, model, messages, options = row
            with db() as conn:
                conn.execute("UPDATE gen_tasks SET status='running', updated=? WHERE key=?", (time.time(), key))
            text, err = "", None
            try:
                body = {"model": model, "messages": json.loads(messages),
                        "stream": True, "options": json.loads(options or "{}")}
                async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=5)) as c:
                    async with c.stream("POST", endpoint + "/api/chat", json=body) as r:
                        async for line in r.aiter_lines():
                            if not line.strip():
                                continue
                            o = json.loads(line)
                            if o.get("error"):
                                err = str(o["error"])
                                break
                            text += (o.get("message") or {}).get("content", "")
                            if o.get("done"):
                                break
            except Exception as e:
                err = f"Ollama 連線失敗({type(e).__name__})"
            if not text.strip() and not err:
                err = "空回應"
            with db() as conn:
                conn.execute(
                    "UPDATE gen_tasks SET status=?, result=?, error=?, updated=? WHERE key=?",
                    ("done" if text.strip() else "error",
                     text if text.strip() else None,
                     None if text.strip() else err, time.time(), key),
                )
        except Exception:
            await asyncio.sleep(2)  # worker 永不死


@app.on_event("startup")
async def _start_gen_worker():
    asyncio.create_task(_gen_worker())


# Testword 編輯召喚師池(dateChance 等行為參數);整包覆寫 content/summoners.json
@app.put("/api/summoners")
def put_summoners(body: dict):
    if not isinstance(body.get("summoners"), list):
        raise HTTPException(400, "需要 {summoners: [...]}")
    path = WEB_DIR / "content" / "summoners.json"
    current = {}
    if path.exists():
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            current = {}
    current["summoners"] = body["summoners"]
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "count": len(body["summoners"])}


# /edit_person 編輯魅魔生成池;整包覆寫 content/persona_pools.json(男性=召喚師,走 /api/summoners)
@app.put("/api/pools")
def put_pools(body: dict):
    if not isinstance(body.get("female"), dict):
        raise HTTPException(400, "需要 {female:{...}}")
    path = WEB_DIR / "content" / "persona_pools.json"
    path.write_text(json.dumps(body, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return {"ok": True}


@app.get("/testword")
def testword():
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "testword.html")


@app.get("/edit_person")
def edit_person():
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "edit_person.html")


@app.get("/body")
def body():
    # 虛擬設計台:偽 3D 點陣胸部人台,供胸罩/衣著版型預覽
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "body.html")


ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
