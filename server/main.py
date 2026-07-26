"""魅魔萬事屋 遊戲伺服器(M0 骨架)

- 靜態伺服:web/(遊戲本體)+ assets/(生成圖像)
- 存檔 API:GET/PUT /api/save(SQLite,版本號防呆的 last-write-wins)
- LLM:Ollama 串流 / xAI API 訂單(快) / Grok Build 無頭訂單(慢,可選)

啟動:uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import json
import os
import shutil
import sqlite3
import tempfile
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import sim

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "game.db"
WEB_DIR = ROOT / "web"
ASSETS_DIR = ROOT / "assets"

# ── xAI HTTP API(角色對話預設;數秒級,走 /api/gen 訂單)──
XAI_BASE = os.environ.get("XAI_BASE_URL", "https://api.x.ai/v1").rstrip("/")
XAI_DEFAULT_MODELS = [
    "grok-4.5",
    "grok-4.3",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
]

# ── Grok Build 無頭 CLI(coding agent;慢,可選)──
GROK_BIN = os.environ.get("GROK_BIN", "grok")
GROK_CWD = Path(os.environ.get("GROK_CWD", str(ROOT / "data" / "grok_cwd")))
GROK_TIMEOUT = float(os.environ.get("GROK_TIMEOUT", "180"))
# Build 預設 1 回合(再鬆可用 env 調高;0=不帶旗標)
GROK_MAX_TURNS = int(os.environ.get("GROK_MAX_TURNS", "1") or "0")
_GROK_DISALLOWED_TOOLS = (
    "run_terminal_cmd,search_replace,write,read_file,list_dir,grep,"
    "web_search,web_fetch,spawn_subagent,image_gen,image_edit,"
    "open_page,use_tool,todo_write"
)


def _xai_key() -> str:
    return (os.environ.get("XAI_API_KEY") or "").strip()


def _grok_build_available() -> bool:
    return bool(shutil.which(GROK_BIN) or Path(GROK_BIN).is_file())


app = FastAPI(title="魅魔萬事屋")


# 前端檔案一律要求瀏覽器「用前先驗證」(no-cache):避免 app.js 與它 import 的模組被
# 各自長期快取、版本不同步 → import 失敗把整個 app 炸成無法互動的空殼。
# (no-cache ≠ no-store:仍可快取,但每次都要跟伺服器對驗;沒變回 304、變了拿新版。)
_REVALIDATE_EXT = (".html", ".js", ".css", ".json", ".md", ".webmanifest")


@app.middleware("http")
async def _revalidate_frontend(request, call_next):
    resp = await call_next(request)
    p = request.url.path
    if p == "/" or p.endswith(_REVALIDATE_EXT):
        resp.headers["Cache-Control"] = "no-cache"
    return resp


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
    # 召喚師交配環模擬(伺服器權威運算,獨立於手機存檔 blob)。單列 JSON。
    conn.execute(
        """CREATE TABLE IF NOT EXISTS sim (
            id         INTEGER PRIMARY KEY CHECK (id = 1),
            data       TEXT NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    return conn


class SavePut(BaseModel):
    base_version: int  # 客戶端手上的版本;與伺服器不符 → 409,防舊裝置蓋新檔
    data: dict


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "time": time.time(),
        "xai": bool(_xai_key()),
        "grok_build": _grok_build_available(),
        "grok_bin": GROK_BIN,
    }


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


# ---- LLM 代理(瀏覽器 → RP5 → Ollama / xAI API / Grok Build)----
# 伺服器不檢視、不修改訊息內容,僅轉發/累積原文(8.1 零解析原則)
# provider:
#   ollama      — 本機串流
#   xai         — xAI HTTP chat/completions(快,預設 Grok 路徑;訂單佇列)
#   grok-build  — grok -p 無頭 agent(慢,可選)


def _normalize_provider(p) -> str:
    p = (p or "ollama").strip().lower()
    if p in ("grok-build", "grokbuild", "build"):
        return "grok-build"
    # 舊存檔 "grok" 曾指向 Build;現在預設改走 API(快)
    if p in ("xai", "grok", "spacexai", "api"):
        return "xai"
    return "ollama"


def _is_order_provider(p: str) -> bool:
    return p in ("xai", "grok-build")


def _normalize_messages(messages: list) -> list[dict]:
    out: list[dict] = []
    for m in messages or []:
        if not isinstance(m, dict):
            continue
        role = (m.get("role") or "user").strip().lower()
        if role not in ("system", "user", "assistant"):
            role = "user"
        content = m.get("content")
        if content is None:
            continue
        text = content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
        if not text.strip():
            continue
        out.append({"role": role, "content": text})
    return out


async def _run_xai_api(model: str, messages: list, options: dict | None = None) -> tuple[str, str | None]:
    """xAI OpenAI 相容 chat/completions(非串流整包)。角色對話應走這條,通常數秒。"""
    key = _xai_key()
    if not key:
        return "", "伺服器未設定 XAI_API_KEY(export 後重啟 uvicorn)。見 https://console.x.ai"
    msgs = _normalize_messages(messages)
    if not msgs:
        return "", "空 messages"
    temp = 0.9
    if isinstance(options, dict) and options.get("temperature") is not None:
        temp = options["temperature"]
    payload = {
        "model": (model or "grok-4.5").strip() or "grok-4.5",
        "messages": msgs,
        "stream": False,
        "temperature": temp,
    }
    headers = {"Authorization": f"Bearer {key}", "Content-Type": "application/json"}
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(120, connect=10)) as c:
            r = await c.post(f"{XAI_BASE}/chat/completions", json=payload, headers=headers)
            if r.status_code >= 400:
                return "", f"xAI HTTP {r.status_code}: {r.text[:400]}"
            data = r.json()
            if isinstance(data, dict) and data.get("error"):
                err = data["error"]
                return "", str(err.get("message", err) if isinstance(err, dict) else err)[:500]
            choices = data.get("choices") or []
            if not choices:
                return "", "xAI 無 choices"
            text = ((choices[0].get("message") or {}).get("content")) or ""
            if not isinstance(text, str):
                text = str(text)
            if not text.strip():
                return "", "xAI 回了空訊息"
            return text, None
    except Exception as e:
        return "", f"xAI 連線失敗({type(e).__name__}: {e})"


def _messages_to_prompt(messages: list) -> str:
    """把 chat messages 壓成給 grok -p 的單一 prompt。"""
    system_parts: list[str] = []
    turns: list[str] = []
    for m in _normalize_messages(messages):
        if m["role"] == "system":
            system_parts.append(m["content"])
        elif m["role"] == "assistant":
            turns.append(f"assistant: {m['content']}")
        else:
            turns.append(f"user: {m['content']}")
    chunks: list[str] = []
    if system_parts:
        chunks.append("[系統指示]\n" + "\n\n".join(system_parts))
    if turns:
        chunks.append("[對話]\n" + "\n\n".join(turns))
    chunks.append(
        "[輸出要求]\n只輸出角色的下一句回覆本文。"
        "不要加 role 前綴、不要解釋、不要條列工具、不要提及你是 AI 或 Grok。"
    )
    return "\n\n".join(chunks)


async def _run_grok_build(model: str, messages: list, options: dict | None = None) -> tuple[str, str | None]:
    """本機 `grok -p` 無頭 agent。coding 用;角色對話會很慢(常 >1 分)。"""
    if not _grok_build_available():
        return "", f"找不到 Grok Build 指令 `{GROK_BIN}`(請安裝或設 GROK_BIN)"
    prompt = _messages_to_prompt(messages)
    if not prompt.strip():
        return "", "空 prompt"
    model = (model or "grok-4.5").strip() or "grok-4.5"
    GROK_CWD.mkdir(parents=True, exist_ok=True)

    with tempfile.TemporaryDirectory(prefix="yoro-grok-") as td:
        prompt_path = Path(td) / "prompt.txt"
        prompt_path.write_text(prompt, encoding="utf-8")
        cmd = [
            GROK_BIN,
            "--prompt-file", str(prompt_path),
            "-m", model,
            "--output-format", "json",
            "--no-subagents",
            "--disable-web-search",
            "--no-plan",
            "--no-memory",
            "--no-auto-update",
            "--verbatim",
            "--cwd", str(GROK_CWD),
            "--disallowed-tools", _GROK_DISALLOWED_TOOLS,
            "--rules",
            "角色扮演純文字輸出。禁止使用任何工具。禁止讀寫檔案。禁止執行指令。",
        ]
        if GROK_MAX_TURNS > 0:
            cmd.extend(["--max-turns", str(GROK_MAX_TURNS)])
        env = {**os.environ, "GROK_DISABLE_AUTOUPDATER": "1"}
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd,
                stdout=asyncio.subprocess.PIPE,
                stderr=asyncio.subprocess.PIPE,
                env=env,
            )
        except FileNotFoundError:
            return "", f"無法啟動 `{GROK_BIN}`"
        try:
            if GROK_TIMEOUT and GROK_TIMEOUT > 0:
                stdout, stderr = await asyncio.wait_for(proc.communicate(), timeout=GROK_TIMEOUT)
            else:
                stdout, stderr = await proc.communicate()
        except asyncio.TimeoutError:
            try:
                proc.kill()
            except ProcessLookupError:
                pass
            try:
                await proc.communicate()
            except Exception:
                pass
            return "", f"Grok Build 逾時({int(GROK_TIMEOUT)}s)"

        out = (stdout or b"").decode("utf-8", errors="replace").strip()
        err_txt = (stderr or b"").decode("utf-8", errors="replace").strip()
        if proc.returncode != 0:
            if out:
                try:
                    ej = json.loads(out)
                    if isinstance(ej, dict) and (ej.get("message") or ej.get("type") == "error"):
                        return "", str(ej.get("message") or ej)[:500]
                except json.JSONDecodeError:
                    pass
            return "", f"Grok Build 失敗(exit {proc.returncode}): {(err_txt or out)[:500]}"
        if not out:
            return "", f"Grok Build 無輸出{((': ' + err_txt[:300]) if err_txt else '')}"
        try:
            data = json.loads(out)
        except json.JSONDecodeError:
            return out, None
        if isinstance(data, dict) and data.get("type") == "error":
            return "", str(data.get("message") or data)[:500]
        text = ""
        if isinstance(data, dict):
            text = data.get("text") or ""
            if not text and isinstance(data.get("message"), str):
                text = data["message"]
        if not isinstance(text, str):
            text = str(text)
        if not text.strip():
            return "", "Grok Build 回了空訊息"
        return text, None


async def _run_order_llm(provider: str, model: str, messages: list, options: dict | None = None) -> tuple[str, str | None]:
    if provider == "xai":
        return await _run_xai_api(model, messages, options)
    if provider == "grok-build":
        return await _run_grok_build(model, messages, options)
    return "", f"未知訂單 provider:{provider}"


async def _stream_ollama_chat(endpoint: str, body: dict, on_token) -> str | None:
    """Ollama NDJSON 串流;on_token(chunk) 累積。回傳 error 字串或 None。"""
    try:
        async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=5)) as c:
            async with c.stream("POST", endpoint.rstrip("/") + "/api/chat", json=body) as r:
                async for line in r.aiter_lines():
                    if not line.strip():
                        continue
                    o = json.loads(line)
                    if o.get("error"):
                        return str(o["error"])
                    piece = (o.get("message") or {}).get("content", "")
                    if piece:
                        on_token(piece)
                    if o.get("done"):
                        break
    except Exception as e:
        return f"Ollama 連線失敗({type(e).__name__})"
    return None


@app.get("/api/llm/tags")
async def llm_tags(endpoint: str = "http://localhost:11434", provider: str = "ollama"):
    provider = _normalize_provider(provider)
    if provider == "xai":
        if not _xai_key():
            raise HTTPException(
                status_code=502,
                detail="伺服器未設定 XAI_API_KEY。export XAI_API_KEY=... 後重啟 uvicorn。https://console.x.ai",
            )
        names = list(XAI_DEFAULT_MODELS)
        try:
            async with httpx.AsyncClient(timeout=10) as c:
                r = await c.get(
                    f"{XAI_BASE}/models",
                    headers={"Authorization": f"Bearer {_xai_key()}"},
                )
                if r.status_code < 400:
                    ids = []
                    for m in (r.json().get("data") or []):
                        mid = m.get("id") or m.get("name")
                        if mid:
                            ids.append(mid)
                    if ids:
                        names = ids
        except httpx.HTTPError:
            pass
        return {"models": [{"name": n} for n in names], "configured": True, "engine": "xai-api"}
    if provider == "grok-build":
        if not _grok_build_available():
            raise HTTPException(
                status_code=502,
                detail=f"找不到 Grok Build 指令 `{GROK_BIN}`。安裝 grok CLI 或設 GROK_BIN。",
            )
        names = list(XAI_DEFAULT_MODELS) + ["grok-build"]
        cache = Path.home() / ".grok" / "models_cache.json"
        try:
            if cache.is_file():
                data = json.loads(cache.read_text(encoding="utf-8"))
                models = data.get("models") or {}
                if isinstance(models, dict) and models:
                    names = list(models.keys())
        except Exception:
            pass
        return {"models": [{"name": n} for n in names], "configured": True, "engine": "grok-build"}
    try:
        async with httpx.AsyncClient(timeout=5) as c:
            r = await c.get(endpoint.rstrip("/") + "/api/tags")
            return r.json()
    except httpx.HTTPError:
        raise HTTPException(status_code=502, detail="Ollama 連不上")


# Ollama → chat_job 串流;xAI / Grok Build → 訂單整包(chat_job 也相容)

CHAT_JOBS: dict[str, dict] = {}


async def _run_chat_job(job_id: str, provider: str, endpoint: str, body: dict):
    job = CHAT_JOBS[job_id]
    acc_parts: list[str] = []

    def on_token(piece: str):
        acc_parts.append(piece)
        job["text"] = "".join(acc_parts)

    if _is_order_provider(provider):
        text, err = await _run_order_llm(
            provider,
            body.get("model") or "grok-4.5",
            body.get("messages") or [],
            body.get("options"),
        )
        if text:
            job["text"] = text
        if err and not text:
            job["error"] = err
    else:
        ollama_body = {
            "model": body.get("model"),
            "messages": body.get("messages") or [],
            "stream": True,
            "options": body.get("options") or {},
        }
        err = await _stream_ollama_chat(endpoint, ollama_body, on_token)
        if err and not job["text"]:
            job["error"] = err
    job["done"] = True


@app.post("/api/llm/chat_job")
async def create_chat_job(body: dict):
    provider = _normalize_provider(body.pop("provider", None))
    endpoint = str(body.pop("endpoint", "http://localhost:11434")).rstrip("/")
    now = time.time()
    for k in [k for k, v in CHAT_JOBS.items() if now - v["t"] > 600]:
        CHAT_JOBS.pop(k, None)
    job_id = uuid.uuid4().hex
    CHAT_JOBS[job_id] = {"text": "", "done": False, "error": None, "t": now}
    asyncio.create_task(_run_chat_job(job_id, provider, endpoint, body))
    return {"job_id": job_id}


@app.post("/api/llm/chat")
async def llm_chat_compat(body: dict):
    from fastapi.responses import StreamingResponse

    provider = _normalize_provider(body.pop("provider", None))
    endpoint = str(body.pop("endpoint", "http://localhost:11434")).rstrip("/")
    body["stream"] = True

    async def gen():
        try:
            if _is_order_provider(provider):
                text, err = await _run_order_llm(
                    provider,
                    body.get("model") or "grok-4.5",
                    body.get("messages") or [],
                    body.get("options"),
                )
                if err and not text:
                    yield json.dumps({"error": err}, ensure_ascii=False).encode() + b"\n"
                else:
                    yield json.dumps(
                        {"message": {"role": "assistant", "content": text}, "done": True},
                        ensure_ascii=False,
                    ).encode() + b"\n"
                return
            async with httpx.AsyncClient(timeout=httpx.Timeout(300, connect=5)) as c:
                async with c.stream("POST", endpoint + "/api/chat", json=body) as r:
                    async for chunk in r.aiter_bytes():
                        yield chunk
        except httpx.HTTPError as e:
            yield json.dumps({"error": f"LLM 連線失敗({type(e).__name__})"}).encode() + b"\n"

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


# ---- 代工生成佇列(手機下單/收貨)----
# endpoint 哨兵: "xai" | "grok-build"(舊 "grok" 哨兵 → xai);其餘 = Ollama URL


class GenIn(BaseModel):
    key: str
    endpoint: str = "http://localhost:11434"
    model: str
    messages: list
    options: dict | None = None
    provider: str | None = None  # "ollama" | "xai" | "grok-build"
    retry: bool = False  # True:若該 key 先前失敗,重新排隊


GEN_WAKE = asyncio.Event()


def _gen_endpoint_for(provider: str | None, endpoint: str) -> str:
    ep = (endpoint or "").strip().lower()
    p = _normalize_provider(provider) if provider else None
    if p == "grok-build" or ep in ("grok-build", "build"):
        return "grok-build"
    # 舊哨兵 "grok" 改走 API
    if p == "xai" or ep in ("xai", "grok"):
        return "xai"
    return (endpoint or "http://localhost:11434").rstrip("/")


@app.post("/api/gen")
def gen_submit(t: GenIn):
    """下單即查詢:同 key 重複下單無害,回傳當前狀態(done 時附結果)。
    先前失敗且 retry=True → 重新排隊(仍回報 error 讓手機計失敗次數)。"""
    now = time.time()
    ep = _gen_endpoint_for(t.provider, t.endpoint)
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
            (t.key, ep, t.model,
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
            msgs = json.loads(messages)
            opts = json.loads(options or "{}")
            parts: list[str] = []

            def on_token(piece: str):
                parts.append(piece)

            if endpoint in ("xai", "grok-build", "grok"):
                # 舊哨兵 "grok" 當 xai API;訂單整包、不串流
                prov = "grok-build" if endpoint == "grok-build" else "xai"
                text, err = await _run_order_llm(prov, model, msgs, opts)
            else:
                body = {"model": model, "messages": msgs, "stream": True, "options": opts}
                err = await _stream_ollama_chat(endpoint, body, on_token)
                text = "".join(parts)
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


# ---- 召喚師交配環:伺服器端權威模擬(判定 + act 都在此運算,手機關螢幕也照跑)----
# 伺服器只寫自己的 sim 表,絕不碰 save 表(手機仍是存檔唯一寫入者)。

SIM_LOCK = asyncio.Lock()


def _sim_load() -> dict:
    with db() as conn:
        row = conn.execute("SELECT data FROM sim WHERE id = 1").fetchone()
    if not row:
        return sim.new_store()
    try:
        store = json.loads(row[0])
    except Exception:
        return sim.new_store()
    for k, v in sim.new_store().items():
        store.setdefault(k, v)
    return store


def _sim_save(store: dict) -> None:
    with db() as conn:
        conn.execute(
            "INSERT INTO sim (id, data, updated_at) VALUES (1, ?, ?) "
            "ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
            (json.dumps(store, ensure_ascii=False), time.time()),
        )


class SimSync(BaseModel):
    now: int | None = None                 # 手機的當前時點(ms);缺省用伺服器時間
    rating: str | None = None              # 'sfw' | 'nsfw'
    roster: list = []                      # [{id, ntr, kanban, busy}] 名冊快照
    seeds: dict | None = None              # {id: rel} 伺服器沒追蹤到時採用的既有關係
    patches: dict | None = None            # {id: {seen:[actId], texts:{actId:text}, rescue:bool}}
    kanbans: list = []                     # [{id, until}] 看板娘計時(權威時鐘用)
    quests: list = []                      # [{id, deadline}] 執行中委託計時(權威時鐘用)
    day: int | None = None                 # 手機當前日序(跨日結算的起點,首次 sync 用)
    ack_outcomes: bool = True              # True:回傳後清空 outcomes(手機已套用)


@app.post("/api/sim/sync")
async def sim_sync(body: SimSync):
    """手機每隔數十秒呼叫一次:上傳名冊快照/玩家動作,伺服器補算到 now 並回傳權威狀態。"""
    now_ms = int(body.now if body.now is not None else time.time() * 1000)
    async with SIM_LOCK:
        store = _sim_load()
        if body.rating in ("sfw", "nsfw"):
            store["rating"] = body.rating
        store["roster"] = {
            r["id"]: {"ntr": bool(r.get("ntr")), "kanban": bool(r.get("kanban")),
                      "busy": bool(r.get("busy")), "rarity": r.get("rarity")}
            for r in (body.roster or []) if r.get("id")
        }
        # 權威時鐘的計時清單:手機每次覆蓋上傳當前狀態(下一輪 worker 會據此判到期)
        clock = store.setdefault("clock", {"kanbans": {}, "quests": {}, "lastDay": None})
        clock["kanbans"] = {k["id"]: k.get("until") for k in (body.kanbans or []) if k.get("id")}
        clock["quests"] = {q["id"]: q.get("deadline") for q in (body.quests or []) if q.get("id")}
        if body.day is not None and clock.get("lastDay") is None:
            clock["lastDay"] = body.day
        sim.adopt_seeds(store, body.seeds)
        sim.apply_patches(store, body.patches)
        sim.run_tick(store, now_ms)
        rels = {gid: store["rels"].get(gid) for gid in store["roster"].keys()}
        outcomes = store.get("outcomes", [])
        resp = {"rels": rels, "outcomes": outcomes, "tickedAt": now_ms}
        if body.ack_outcomes:
            store["outcomes"] = []
        _sim_save(store)
    return resp


class SimLive(BaseModel):
    id: str
    now: int | None = None


@app.post("/api/sim/live_act")
async def sim_live_act(body: SimLive):
    """觀戰取 act:先把 taken 進度補算到 now(吐出依 actAt 節奏預生的 slot),
    若補算後仍無未讀且她還在召喚中,才現生 1 個 slot 當直播(避免跳過預生節奏、
    一進觀戰就無中生有)。"""
    now_ms = int(body.now if body.now is not None else time.time() * 1000)
    async with SIM_LOCK:
        store = _sim_load()
        rel = store.get("rels", {}).get(body.id)
        if not rel or not rel.get("taken"):
            return {"rel": rel, "married": False}
        # 1) 先走既有預生節奏(可能一次吐出多 slot / 到期解召喚 / 懷孕娶走)
        married = False
        if sim._process_taken(store, body.id, rel, now_ms):
            # _process_taken 在娶走時會 pop rel 並寫 outcome
            if body.id not in store.get("rels", {}):
                married = True
        rel = store.get("rels", {}).get(body.id)
        if married or not rel:
            _sim_save(store)
            return {"rel": None, "married": married}
        # 2) 已有未讀 → 直接回傳,不要再現生
        unseen = [a for a in (rel.get("acts") or []) if not a.get("seen")]
        if unseen:
            _sim_save(store)
            return {"rel": rel, "married": False}
        # 3) 預生額度用完、仍在召喚中 → 直播補 1 slot
        if not rel.get("taken"):
            _sim_save(store)
            return {"rel": rel, "married": False}
        married = sim.process_act_slot(rel, now_ms, store.get("rating", "sfw"))
        if married:
            su = sim.summoner_by_id(rel["id"])
            store.setdefault("outcomes", []).append(
                {"type": "married", "id": body.id, "suName": su.get("name") if su else None, "t": now_ms})
            store["rels"].pop(body.id, None)
            store.get("takenWin", {}).pop(body.id, None)
        _sim_save(store)
        return {"rel": store.get("rels", {}).get(body.id), "married": married}


_HEARTBEAT_SEC = 600            # 每 10 分鐘印一次「已執行檢查」心跳
_last_beat = 0.0


def _world_beat(store, now: float, forced: bool = False) -> None:
    """每 10 分鐘輸出一行世界時鐘心跳,讓你隨時能確認伺服器 runtime 活著、確實在跑檢查。"""
    global _last_beat
    if not forced and now - _last_beat < _HEARTBEAT_SEC:
        return
    _last_beat = now
    st = sim.world_stats(store)
    print(
        f"[世界時鐘] {time.strftime('%Y-%m-%d %H:%M:%S')} 已執行檢查 — "
        f"名冊={st['roster']} 召喚師關係={st['rels']} 召喚中={st['taken']} "
        f"看板娘計時={st['kanbanTimers']} 委託計時={st['questTimers']} 待套用={st['pendingOutcomes']}",
        flush=True,
    )


async def _world_clock():
    """世界時鐘:伺服器權威 runtime。每 30 秒把召喚師模擬 + 計時判定(看板娘到期/委託逾期/跨日)
    補算到真實時間(關螢幕、離線也照跑),並每 10 分鐘輸出一次心跳日誌。"""
    while True:
        try:
            await asyncio.sleep(30)
            now = time.time()
            async with SIM_LOCK:
                store = _sim_load()
                if sim.run_tick(store, int(now * 1000)):
                    _sim_save(store)
                _world_beat(store, now)
        except Exception as e:
            print(f"[世界時鐘] 檢查發生例外(將續跑):{e}", flush=True)
            await asyncio.sleep(5)  # runtime 永不死


@app.on_event("startup")
async def _start_gen_worker():
    print("[世界時鐘] 啟動 — 伺服器權威 runtime 上線,每 30 秒跑檢查、每 10 分鐘印心跳", flush=True)
    asyncio.create_task(_gen_worker())
    asyncio.create_task(_world_clock())


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


# /edit_person 編輯性趣池;整包覆寫 content/kinks.json
@app.put("/api/kinks")
def put_kinks(body: dict):
    if not isinstance(body.get("kinks"), list):
        raise HTTPException(400, "需要 {kinks: [...]}")
    path = WEB_DIR / "content" / "kinks.json"
    current = {}
    if path.exists():
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            current = {}
    current["kinks"] = body["kinks"]
    path.write_text(json.dumps(current, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    return {"ok": True, "count": len(body["kinks"])}


@app.get("/edit_person")
def edit_person():
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "edit_person.html")


# /testword 編輯魅魔獻祭三場景腳本;整包覆寫 content/sacrifice.json
@app.put("/api/sacrifice")
def put_sacrifice(body: dict):
    if not isinstance(body.get("methods"), list):
        raise HTTPException(400, "需要 {opening, methods:[...]}")
    path = WEB_DIR / "content" / "sacrifice.json"
    current = {}
    if path.exists():
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            current = {}
    if "opening" in body:
        current["opening"] = body["opening"]
    current["methods"] = body["methods"]
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return {"ok": True, "count": len(body["methods"])}


@app.get("/body")
def body():
    # 虛擬設計台:偽 3D 點陣胸部人台,供胸罩/衣著版型預覽
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "body.html")


ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
