"""魅魔萬事屋 遊戲伺服器(M0 骨架)

- 靜態伺服:web/(遊戲本體)+ assets/(生成圖像)
- 存檔 API:GET/PUT /api/save(SQLite,版本號防呆的 last-write-wins)
- LLM:Ollama 串流 / Grok Build 無頭訂單(grok -p;streaming-json end 即完成)

啟動:uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import hashlib
import json
import os
import re
import shutil
import sqlite3
import time
import uuid
from pathlib import Path

import httpx
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import comfy
import cutout
import sdtags
import sim

ROOT = Path(__file__).resolve().parent.parent
DB_PATH = ROOT / "data" / "game.db"
WEB_DIR = ROOT / "web"
ASSETS_DIR = ROOT / "assets"

# Grok Build 無頭 CLI(唯一雲端路徑;不走 xAI HTTP API)
GROK_BIN = os.environ.get("GROK_BIN", "grok")
GROK_CWD = Path(os.environ.get("GROK_CWD", str(ROOT / "data" / "grok_cwd")))
GROK_TIMEOUT = float(os.environ.get("GROK_TIMEOUT", "180"))
# Build 預設 1 回合(0=不帶 --max-turns)
GROK_MAX_TURNS = int(os.environ.get("GROK_MAX_TURNS", "1") or "0")
GROK_DEFAULT_MODELS = [
    "grok-4.5",
    "grok-4.3",
    "grok-build",
    "grok-4.20-0309-non-reasoning",
    "grok-4.20-0309-reasoning",
]
_GROK_DISALLOWED_TOOLS = (
    "run_terminal_cmd,search_replace,write,read_file,list_dir,grep,"
    "web_search,web_fetch,spawn_subagent,image_gen,image_edit,"
    "open_page,use_tool,todo_write"
)
# 生圖任務允許的工具(image_gen/image_edit + 搬檔用 shell/list;image_edit 讓三段能照素體那張畫)
_GROK_IMG_TOOLS = "image_gen,image_edit,run_terminal_cmd,list_dir,read_file"
IMG_TEST_DIR = ASSETS_DIR / "testword"
# 遊戲本體的召喚三連拍(head/half/full),與 testword 的實驗圖分開放
PORTRAIT_DIR = ASSETS_DIR / "portraits"
SHOT_LABEL_ZH = {"head": "大頭照", "half": "半身(聊天立繪)", "full": "全身(看板娘)"}
GROK_IMG_TIMEOUT = float(os.environ.get("GROK_IMG_TIMEOUT", "300"))
GROK_IMG_MAX_TURNS = int(os.environ.get("GROK_IMG_MAX_TURNS", "8") or "8")


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
    # 優先序欄位(舊檔補上):玩家正在等的那句排前面,背景素材往後站
    try:
        conn.execute("ALTER TABLE gen_tasks ADD COLUMN prio INTEGER NOT NULL DEFAULT 0")
    except sqlite3.OperationalError:
        pass
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
        "grok_build": _grok_build_available(),
        "grok_bin": GROK_BIN,
        "comfy_url": comfy.COMFY_URL,
        "gpu": comfy.gpu_state(),
        "cutout": cutout.AVAILABLE,   # 立繪去背要 Pillow;沒裝就是留著背景
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


# ---- LLM 代理(瀏覽器 → RP5 → Ollama 串流 / Grok Build 無頭訂單)----
# 伺服器不檢視、不修改訊息內容,僅轉發/累積原文(8.1 零解析原則)
# provider: "ollama" | "grok-build"(舊別名 grok/xai/api 一律當 grok-build)


def _normalize_provider(p) -> str:
    p = (p or "ollama").strip().lower()
    # 舊存檔可能寫 xai/api/grok —— 全部收斂到 Build 無頭,不再有 HTTP API
    if p in ("grok-build", "grokbuild", "build", "grok", "xai", "spacexai", "api"):
        return "grok-build"
    return "ollama"


def _strip_thinking(text: str) -> str:
    """剝掉 Qwen3 / Qwen3.5 等的思考塊，只留真正台詞。

    常見格式：
      <think>...</think>
      <think>...</think>
    以及未關 thinking 時整段思考 + 空行 + 正式回覆。
    """
    if not text:
        return text or ""
    s = str(text)
    # 成對標籤（含大小寫、多餘空白）
    s = re.sub(r"<think\b[^>]*>[\s\S]*?</think\s*>", "", s, flags=re.I)
    s = re.sub(r"<thinking\b[^>]*>[\s\S]*?</thinking\s*>", "", s, flags=re.I)
    # 殘留的開閉標籤
    s = re.sub(r"</?think(?:ing)?\b[^>]*>", "", s, flags=re.I)
    # 少數模型用紅acted 風格
    s = re.sub(r"<\|?redacted_thinking\|?>[\s\S]*?<\|?/redacted_thinking\|?>", "", s, flags=re.I)
    return s.strip()


def _ollama_chat_body(model: str, messages: list, options: dict | None = None) -> dict:
    """組 Ollama /api/chat body：預設關閉 think（Qwen3.5 否則會先長考再答）。"""
    opts = dict(options or {})
    # 遊戲台詞要短：若呼叫端沒設 num_predict，給一個上限避免爆
    if "num_predict" not in opts and "num_predict" not in {k.lower() for k in opts}:
        opts.setdefault("num_predict", 256)
    body = {
        "model": model,
        "messages": messages or [],
        "stream": True,
        "options": opts,
        # Ollama 0.9+ / 支援 thinking 的模型：關閉思考模式
        "think": False,
    }
    return body


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


async def _kill_proc_tree(proc: asyncio.subprocess.Process) -> None:
    """結束 grok 行程組。Build 在吐完 end 後常還會做 session 收尾,不殺會一直卡住訂單。"""
    if proc.returncode is not None:
        return
    try:
        # start_new_session=True 時 pid == 進程組 id
        os.killpg(proc.pid, 15)  # SIGTERM
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.terminate()
        except ProcessLookupError:
            return
    try:
        await asyncio.wait_for(proc.wait(), timeout=2)
        return
    except (asyncio.TimeoutError, ProcessLookupError):
        pass
    try:
        os.killpg(proc.pid, 9)  # SIGKILL
    except (ProcessLookupError, PermissionError, OSError):
        try:
            proc.kill()
        except ProcessLookupError:
            pass
    try:
        await asyncio.wait_for(proc.wait(), timeout=2)
    except (asyncio.TimeoutError, ProcessLookupError):
        pass


async def _run_grok_cli(
    prompt: str,
    *,
    model: str = "grok-4.5",
    cwd: Path | None = None,
    timeout: float | None = None,
    max_turns: int | None = None,
    tools: str | None = None,
    disallowed_tools: str | None = None,
    rules: str | None = None,
    always_approve: bool = False,
    on_partial=None,
) -> tuple[str, str | None]:
    """跑 grok -p(streaming-json);type=end 即完成並殺行程。回 (text, error)。"""
    if not _grok_build_available():
        return "", f"找不到 Grok Build 指令 `{GROK_BIN}`(請安裝或設 GROK_BIN)"
    if not (prompt or "").strip():
        return "", "空 prompt"
    model = (model or "grok-4.5").strip() or "grok-4.5"
    work = Path(cwd) if cwd else GROK_CWD
    work.mkdir(parents=True, exist_ok=True)
    prompt_path = work / f"prompt-{uuid.uuid4().hex}.txt"
    prompt_path.write_text(prompt, encoding="utf-8")
    cmd = [
        GROK_BIN,
        "--prompt-file", str(prompt_path),
        "-m", model,
        "--output-format", "streaming-json",
        "--no-subagents",
        "--disable-web-search",
        "--no-plan",
        "--no-memory",
        "--no-auto-update",
        "--verbatim",
        "--cwd", str(work),
    ]
    if always_approve:
        cmd.append("--always-approve")
    if tools:
        cmd.extend(["--tools", tools])
    elif disallowed_tools:
        cmd.extend(["--disallowed-tools", disallowed_tools])
    if rules:
        cmd.extend(["--rules", rules])
    mt = GROK_MAX_TURNS if max_turns is None else max_turns
    if mt and mt > 0:
        cmd.extend(["--max-turns", str(mt)])
    to = GROK_TIMEOUT if timeout is None else timeout
    env = {**os.environ, "GROK_DISABLE_AUTOUPDATER": "1"}
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.PIPE,
            stderr=asyncio.subprocess.PIPE,
            env=env,
            start_new_session=True,
        )
    except FileNotFoundError:
        try:
            prompt_path.unlink(missing_ok=True)
        except Exception:
            pass
        return "", f"無法啟動 `{GROK_BIN}`"

    text_parts: list[str] = []
    err_lines: list[str] = []
    final_err: str | None = None
    saw_end = False

    async def _drain_stderr():
        assert proc.stderr is not None
        try:
            while True:
                line = await proc.stderr.readline()
                if not line:
                    break
                s = line.decode("utf-8", errors="replace").rstrip()
                if s:
                    err_lines.append(s)
                    if len(err_lines) > 80:
                        del err_lines[:-40]
        except Exception:
            pass

    stderr_task = asyncio.create_task(_drain_stderr())

    async def _read_events():
        nonlocal final_err, saw_end
        assert proc.stdout is not None
        while True:
            line = await proc.stdout.readline()
            if not line:
                break
            s = line.decode("utf-8", errors="replace").strip()
            if not s:
                continue
            try:
                ev = json.loads(s)
            except json.JSONDecodeError:
                continue
            if not isinstance(ev, dict):
                continue
            et = ev.get("type")
            if et == "text":
                piece = ev.get("data") or ""
                if piece:
                    text_parts.append(str(piece))
                    if on_partial:
                        try:
                            on_partial("".join(text_parts))
                        except Exception:
                            pass
            elif et == "error":
                final_err = str(ev.get("message") or ev)[:500]
                saw_end = True
                break
            elif et in ("end", "max_turns_reached"):
                saw_end = True
                break

    try:
        if to and to > 0:
            await asyncio.wait_for(_read_events(), timeout=to)
        else:
            await _read_events()
    except asyncio.TimeoutError:
        final_err = f"Grok Build 逾時({int(to)}s)"
    finally:
        await _kill_proc_tree(proc)
        try:
            await asyncio.wait_for(stderr_task, timeout=1)
        except (asyncio.TimeoutError, Exception):
            stderr_task.cancel()
        try:
            prompt_path.unlink(missing_ok=True)
        except Exception:
            pass

    text = "".join(text_parts)
    if text.strip():
        return text, None
    if final_err:
        return "", final_err
    err_tail = "\n".join(err_lines[-8:]).strip()
    if saw_end:
        return "", "Grok Build 結束但沒有正文"
    if proc.returncode not in (0, None, -9, -15, 130, 143):
        return "", f"Grok Build 失敗(exit {proc.returncode})" + (f": {err_tail[:300]}" if err_tail else "")
    return "", "Grok Build 無輸出" + (f": {err_tail[:300]}" if err_tail else "")


async def _run_grok_build(
    model: str,
    messages: list,
    options: dict | None = None,
    on_partial=None,
) -> tuple[str, str | None]:
    """文字角色扮演:禁工具,streaming-json end 即完成。"""
    prompt = _messages_to_prompt(messages)
    return await _run_grok_cli(
        prompt,
        model=model or "grok-4.5",
        cwd=GROK_CWD,
        disallowed_tools=_GROK_DISALLOWED_TOOLS,
        rules="角色扮演純文字輸出。禁止使用任何工具。禁止讀寫檔案。禁止執行指令。",
        on_partial=on_partial,
    )


def _character_visual_brief(ch: dict) -> str:
    """把 generateGirl / 存檔魅魔的完整人設壓成生圖用外貌+氣質說明(不解析語意,只拼接欄位)。"""
    if not isinstance(ch, dict):
        return "attractive young woman"
    lines: list[str] = []
    name = ch.get("name") or ""
    if name:
        lines.append(f"Name: {name}")
    rarity = ch.get("rarity") or ""
    if rarity:
        lines.append(f"Rarity tier: {rarity}")
    # 外貌 look(新制)。特殊屬性蓋掉的欄位不列——抽到「巨乳」還寫著 B 罩杯,
    # 對面讀到的是兩句互相打架的話,畫出來就兩邊都不像。
    look = ch.get("look") or {}
    if isinstance(look, dict) and look:
        over = sdtags.overridden_fields(ch)
        bits = []
        if look.get("height_cm"):
            bits.append(f"{look['height_cm']}cm tall")
        for k, label in (
            ("build", "body"), ("bust", "bust"), ("face", "face shape"),
            ("eyes", "eyes"), ("mouth", "mouth/lips"),
            ("hair_color", "hair color"), ("hair", "hairstyle"),
            ("feature", "distinctive feature"),
        ):
            if look.get(k) and k not in over:
                bits.append(f"{label}: {look[k]}")
        if bits:
            lines.append("Appearance: " + "; ".join(bits))
        # 服裝:生涯服裝是預設的那一身(職業決定),個人衣櫃是玩家挑過才換的
        worn = _outfit_of(ch)
        if worn:
            lines.append(f"Outfit she is wearing (AUTHORITATIVE): {worn}")
        if look.get("career_outfit"):
            lines.append(f"(Her everyday work outfit: {look['career_outfit']})")
    # 舊 DNA token
    dna = ch.get("dna") or ch.get("appearance_dna") or {}
    traits = dna.get("traits") if isinstance(dna, dict) else None
    if traits and not look:
        lines.append("DNA traits: " + ", ".join(str(t) for t in traits))
    # 特殊屬性
    st = ch.get("specialTraits") or ch.get("special_traits") or []
    if st:
        names = []
        for t in st:
            if isinstance(t, dict):
                names.append(t.get("name") or str(t))
            else:
                names.append(str(t))
        if names:
            lines.append(
                "Special traits (these OVERRIDE the Appearance line above where they conflict "
                "— e.g. a 巨乳 trait wins over the listed cup size): " + ", ".join(names))
    # 個性原型
    pers = ch.get("personality") or []
    if isinstance(pers, list) and pers:
        lines.append("Personality archetype: " + "、".join(str(p) for p in pers))
    elif isinstance(pers, str) and pers:
        lines.append(f"Personality: {pers}")
    if ch.get("archetype"):
        lines.append(f"Archetype: {ch['archetype']}")
    if ch.get("tone"):
        lines.append(f"Speech/tone vibe (for expression): {ch['tone']}")
    if ch.get("contrast"):
        lines.append(f"Contrast quirk: {ch['contrast']}")
    if ch.get("quirk"):
        lines.append(f"Quirk: {ch['quirk']}")
    # 職業與來歷
    if ch.get("job"):
        lines.append(f"Former job (pre-summon life): {ch['job']}")
    if ch.get("jobDesc"):
        lines.append(f"Job note: {ch['jobDesc']}")
    if ch.get("backstory"):
        lines.append(f"Backstory: {ch['backstory']}")
    # 喜惡興趣(氣質參考)
    for key, label in (("likes", "Likes"), ("dislikes", "Dislikes"), ("hobbies", "Hobbies")):
        v = ch.get(key)
        if isinstance(v, list) and v:
            lines.append(f"{label}: " + "、".join(str(x) for x in v))
    # 性慾傾向(NSFW 時影響氣氛)
    lib = ch.get("libido")
    if isinstance(lib, dict) and lib.get("name"):
        lines.append(f"Libido tendency: {lib.get('name')}" + (f" — {lib.get('desc')}" if lib.get("desc") else ""))
    # 作息/弧線(次要)
    if ch.get("arc"):
        lines.append(f"Recent life event: {ch['arc']}")
    chrono = ch.get("chrono")
    if isinstance(chrono, dict) and chrono.get("name"):
        lines.append(f"Chronotype: {chrono['name']}")
    return "\n".join(lines) if lines else "attractive young woman, distinctive look"


_FRAME_MAP = {
    "half": "half-body portrait (waist-up), face and upper body clearly visible",
    "full": "full-body standing figure, head to toe visible, complete outfit",
}
_STYLE_MAP = {
    "anime": "Japanese anime style, clean lineart, cel shading, vibrant colors, high quality illustration",
    "realistic": "photorealistic, natural skin texture, cinematic lighting, DSLR photo look",
    "pixel": "pixel art, 256x256 pixels exact, limited palette, crisp pixels, no anti-aliasing, game sprite style",
}
# NSFW 一樣不寫分級字眼(理由同 _RATING_ZH):寫了只會被 grok 的生圖擋掉。
_RATING_MAP = {
    "sfw": "SFW, fully clothed, wholesome, safe for work",
    "nsfw": "",
}


def _fill_manual_fields(
    character: dict | None, name: str, personality: str, backstory: str
) -> dict:
    """character 為主;沒抽卡時用手填欄位補洞。"""
    ch = dict(character) if isinstance(character, dict) else {}
    if name and not ch.get("name"):
        ch["name"] = name
    if personality and not ch.get("personality"):
        ch["personality"] = [x.strip() for x in personality.replace("、", ",").split(",") if x.strip()]
    if backstory and not ch.get("backstory"):
        ch["backstory"] = backstory
    return ch


def _build_girl_image_prompt(
    *,
    framing: str,
    rating: str,
    style: str,
    character: dict | None = None,
    name: str = "",
    personality: str = "",
    backstory: str = "",
    extra: str = "",
    out_path: Path,
) -> str:
    """組給 Grok Build 的生圖指令。人物欄位以 character(完整 generateGirl 結果)為準。"""
    framing = (framing or "half").lower()
    rating = (rating or "sfw").lower()
    style = (style or "anime").lower()
    frame_map, style_map, rating_map = _FRAME_MAP, _STYLE_MAP, _RATING_MAP
    ch = _fill_manual_fields(character, name, personality, backstory)
    brief = _character_visual_brief(ch)
    if extra.strip():
        brief += f"\nExtra director notes: {extra.strip()}"

    size_note = (
        "Output size MUST be exactly 256x256 pixels."
        if style == "pixel"
        else "High resolution portrait suitable for a character standee."
    )
    tool_note = (
        "Prefer image_gen. For exact 256x256 pixel art you may use code if image_gen cannot force size."
        if style == "pixel"
        else "You MUST use the image_gen tool (do NOT draw with Python/code)."
    )
    rating_txt = rating_map.get(rating, rating_map["sfw"])
    rating_line = f"- Content rating: {rating_txt}\n" if rating_txt else ""

    return f"""You are generating ONE character image for a game art test.
The character sheet below is AUTHORITATIVE — match hair, eyes, body, fashion, features, and vibe exactly.
Do not invent conflicting traits. Personality/backstory should only influence expression, pose, and mood.

{tool_note}
After the image is created, copy/move the final file to this EXACT path:
{out_path}

Only create that one image file at the destination. Then reply with a short note: the absolute path and one-line description.

=== CHARACTER SHEET (from edit_person / girl_gen pools) ===
{brief}
=== END SHEET ===

Render settings:
- Framing: {frame_map.get(framing, frame_map["half"])}
- Art style: {style_map.get(style, style_map["anime"])}
{rating_line}- {size_note}
- Single character, plain or simple background, no text overlays, no watermark, no other people
"""


# ---- 分段生圖:同一位妹子拆成「頭 / 胸 / 下半身」,每段各出兩張 ----
# 抽卡欄位本來就是分開的(眼睛、罩杯、體型…),整張畫時模型會把它們糊在一起;
# 拆開各吃自己那組欄位,才看得出「大眼睛」「G 罩杯圓潤」到底畫成什麼樣。
#
# 每段兩輪:第一輪不寫任何服裝欄位,第二輪拿第一輪那張當參考圖再把衣服畫上去。
#
# prompt 寫法:短。只列這一段真的要畫的特徵 + 取景,其餘一個字都不加。
# 尤其不要出現「素體 / body base / 參考圖表 / 不穿衣服」這類詞——講到身體的
# 抽象名詞,模型就會自己補一件緊身衣上去。要它不畫衣服,就是不提衣服。
IMG_BARE_PARTS = ("head0", "bust0", "lower0")   # 第一輪:不寫服裝
IMG_SEG_PARTS = ("head", "bust", "lower")       # 第二輪:加穿搭
IMG_PARTS = IMG_BARE_PARTS + IMG_SEG_PARTS
# 第二輪各段的參考圖 = 第一輪同一段那張
PART_REF_OF = dict(zip(IMG_SEG_PARTS, IMG_BARE_PARTS))
PART_LABEL_ZH = {
    "head0": "頭", "bust0": "胸", "lower0": "下半身",
    "head": "頭・穿搭", "bust": "胸・穿搭", "lower": "下半身・穿搭",
}

# 膚色與服裝配色人設池裡沒有,由欄位做確定性雜湊補一組——同一個人設永遠推出同一組。
_SKIN_TONES = ["皮膚白皙", "膚色瓷白", "皮膚透白", "膚色偏白", "膚色蜜色", "膚色健康小麥"]
_PALETTES = [
    "黑與米白", "奶油米", "藏青與白", "霧粉與灰",
    "橄欖綠與卡其", "酒紅與炭灰", "天藍與白", "薰衣草紫與銀灰",
]
_STYLE_ZH = {"anime": "動漫風格", "realistic": "寫實照片風", "pixel": "像素風,256×256"}
# NSFW 不寫任何分級字眼:grok 的生圖本來就不吃色情,寫「成人向 18+」只會換來拒稿。
# 分級真正在管的是抽卡(girl_gen 的 nsfw 項目開關),不是這裡。
_RATING_ZH = {"sfw": "全年齡", "nsfw": ""}


def _resolve_ref_image(ref: str) -> Path | None:
    """把前端傳來的 /assets/testword/xxx.png 換成本機絕對路徑。
    只認 testword 目錄下確實存在的檔案(取 basename,擋路徑穿越)。"""
    ref = (ref or "").strip()
    if not ref:
        return None
    p = IMG_TEST_DIR / Path(ref).name
    return p if p.is_file() and p.stat().st_size > 0 else None


def _outfit_of(ch: dict) -> str:
    """這張圖她穿什麼。

    預設是**生涯服裝**——職業給的那一身(學生就是制服)。抽卡人設裡職業寫得
    清清楚楚,衣服卻跟它無關,是這遊戲最出戲的一種錯。個人衣櫃要玩家在詳細頁
    挑過才換;哪幾套解得開由前端依關係階段管,伺服器只認索引。
    """
    look = ch.get("look") if isinstance(ch.get("look"), dict) else {}
    wardrobe = look.get("wardrobe") if isinstance(look.get("wardrobe"), list) else []
    pick = ch.get("outfitPick")
    if isinstance(pick, bool):
        pick = None   # True/False 不是索引
    if isinstance(pick, int) and 0 <= pick < len(wardrobe):
        return str(wardrobe[pick] or "")
    return str(look.get("career_outfit") or look.get("style") or "")


def _identity_anchor(ch: dict) -> dict:
    look = ch.get("look") if isinstance(ch.get("look"), dict) else {}
    seed = "|".join(str(look.get(k) or "") for k in ("hair", "eyes", "build", "bust", "style"))
    seed += "|" + str(ch.get("name") or "")
    h = hashlib.sha1(seed.encode("utf-8")).digest()
    worn = _outfit_of(ch)
    a = {
        "skin": _SKIN_TONES[h[0] % len(_SKIN_TONES)],
        "palette": _PALETTES[h[1] % len(_PALETTES)],
        # 同一位妹子固定同一個 seed:三連拍才會是同一張臉,重生也還是同一個人
        # (plan-v4「同 DNA(traits + seed)維持長相一致」)
        "seed": int.from_bytes(h[2:6], "big") % (2**31 - 1) or 1,
        # 年齡:新人設由 girl_gen 抽。舊存檔沒這欄,用雜湊補一個固定值——
        # 不給年齡模型畫出來的年紀會漂,同一個人每次都不同歲數。
        "age": look.get("age") or (sdtags.AGE_MIN + h[6] % (sdtags.AGE_MAX - sdtags.AGE_MIN + 1)),
        "height_cm": look.get("height_cm") or "",
        "hair": look.get("hair") or "",
        "hair_color": look.get("hair_color") or "",
        "eyes": look.get("eyes") or "",
        "face": look.get("face") or "",
        "mouth": look.get("mouth") or "",
        "build": look.get("build") or "",
        "bust": look.get("bust") or "",
        "style": look.get("style") or "",
        "outfit": worn,
        # 生涯服裝自己就是一整套配色(護士服白的、巫女服紅白),再疊一組隨機
        # 配色只會打架;個人衣櫃那邊才用得上調色盤。
        "outfit_career": bool(worn) and worn == str(look.get("career_outfit") or ""),
        "feature": look.get("feature") or "",
    }
    # 特殊屬性說了算:抽到「巨乳」就不能同時寫 B 罩杯,兩句都寫只會得到一張
    # 兩邊都不像的圖。中文這條路的做法是把一般欄位的中文整個換掉(tag 那條
    # 走 sdtags.build_prompt 的同一份判定)。
    for key, name in sdtags.overridden_fields(ch).items():
        if key in a:
            a[key] = name
    return a


def _seg_lines(seg: str, a: dict, ch: dict, *, dressed: bool) -> tuple[str, str]:
    """回 (特徵, 取景)。特徵只列這一段真的要畫的東西,照抄抽卡原文,不改寫不擴寫。"""
    if seg == "head":
        # 臉分五軸(臉型/眼/嘴/髮型/髮色):只寫「大眼睛、長直髮」時每張臉都不一樣
        bits = [a["face"], a["eyes"], a["mouth"],
                "、".join(x for x in (a["hair_color"], a["hair"]) if x), a["feature"]]
        # 表情用原型(「傲嬌」「活潑開朗」這種短詞)。tone 是講說話方式的整句話,
        # 塞進生圖 prompt 只是雜訊——畫圖看不見她愛加「呢」「呀」。
        pers = ch.get("personality") or []
        mood = ch.get("archetype") or (pers[0] if isinstance(pers, list) and pers else "")
        if mood:
            bits.append(f"表情{mood}")
        return "、".join(x for x in bits if x), "臉部特寫,髮頂到鎖骨"
    if seg == "bust":
        bits = [a["bust"], a["build"], a["skin"]]
        if dressed and a["outfit"]:
            bits.append(f"{a['outfit']}的上半身"
                        + ("" if a["outfit_career"] else f",{a['palette']}"))
        return "、".join(x for x in bits if x), "下巴到腰,不畫臉"
    bits = [a["build"], f"{a['height_cm']}cm" if a["height_cm"] else "", a["skin"]]
    if dressed and a["outfit"]:
        bits.append(f"{a['outfit']}的下半身,含鞋襪")
    return "、".join(x for x in bits if x), "腰到腳"


def _seg_prompt_body(
    *,
    part: str,
    rating: str,
    style: str,
    character: dict | None = None,
    name: str = "",
    personality: str = "",
    backstory: str = "",
    extra: str = "",
) -> str:
    """一段 prompt 裡「可以改」的那部分:特徵、取景、風格。刻意短。
    存檔路徑與參考圖那兩行不在這裡——那是送出前才由 _wrap_part_prompt 補的機械欄位,
    改壞了圖就落不了地,所以不讓它出現在編輯框裡。"""
    part = (part or "bust0").lower()
    if part not in IMG_PARTS:
        part = "bust0"
    dressed = part in IMG_SEG_PARTS
    seg = part if dressed else part[:-1]
    ch = _fill_manual_fields(character, name, personality, backstory)
    traits, frame = _seg_lines(seg, _identity_anchor(ch), ch, dressed=dressed)

    tail = [_STYLE_ZH.get((style or "anime").lower(), _STYLE_ZH["anime"]),
            _RATING_ZH.get((rating or "sfw").lower(), _RATING_ZH["sfw"]), "單人", "背景留白"]
    lines = [traits, frame, "、".join(x for x in tail if x)]
    if extra.strip():
        lines.append(extra.strip())
    return "\n".join(x for x in lines if x)


def _wrap_part_prompt(body: str, *, out_path: Path, ref_path: Path | None = None) -> str:
    """把可編輯的 body 包成真正送出去的 prompt:前面補存檔路徑,後面補參考圖。"""
    lines = ["用 image_gen 產一張圖,存成:" + str(out_path), "", body.strip()]
    if ref_path is not None:
        lines.append(f"參考 {ref_path}:同一個人,臉、膚色、身形照這張,把衣服畫上去")
    return "\n".join(lines) + "\n"


async def _run_grok_image(
    model: str,
    *,
    framing: str,
    rating: str,
    style: str,
    character: dict | None = None,
    name: str = "",
    personality: str = "",
    backstory: str = "",
    extra: str = "",
    part: str = "",
    ref: str = "",
    prompt_body: str = "",
) -> tuple[str, str | None]:
    """Grok Build + image_gen。成功回 (url_path, None),url 如 /assets/testword/xxx.png。
    part 給值(head0/bust0/lower0 或 head/bust/lower)= 只畫那一段;留空 = 舊行為的整張圖。
    ref = 第一輪同段那張的 /assets/testword/… URL,第二輪拿它當參考圖。"""
    IMG_TEST_DIR.mkdir(parents=True, exist_ok=True)
    part = (part or "").lower()
    stamp = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
    fname = f"{stamp}_{part}.png" if part in IMG_PARTS else f"{stamp}.png"
    abs_out = IMG_TEST_DIR / fname
    # 工作目錄放空沙箱,產圖後搬到 assets
    work = GROK_CWD / f"img-{stamp}"
    work.mkdir(parents=True, exist_ok=True)
    # 讓 agent 先寫進 work,再 copy 到 abs_out(路徑寫死在 prompt)
    target = abs_out  # absolute path in prompt
    if part in IMG_PARTS:
        # prompt_body 有值 = 使用者在 testword 改過的版本,原樣送出(只補存檔路徑/參考圖)
        body = prompt_body.strip() or _seg_prompt_body(
            part=part, rating=rating, style=style,
            character=character,
            name=name, personality=personality, backstory=backstory, extra=extra,
        )
        prompt = _wrap_part_prompt(body, out_path=target, ref_path=_resolve_ref_image(ref))
    else:
        prompt = _build_girl_image_prompt(
            framing=framing, rating=rating, style=style,
            character=character,
            name=name, personality=personality, backstory=backstory, extra=extra,
            out_path=target,
        )
    text, err = await _run_grok_cli(
        prompt,
        model=model or "grok-4.5",
        cwd=work,
        timeout=GROK_IMG_TIMEOUT,
        max_turns=GROK_IMG_MAX_TURNS,
        tools=_GROK_IMG_TOOLS,
        always_approve=True,
        rules="產一張圖存到指定路徑,不要產別的檔。",
    )
    # 找產物:目標路徑 / work 下最新圖
    found: Path | None = None
    if target.is_file() and target.stat().st_size > 0:
        found = target
    else:
        cands = [
            p for p in work.rglob("*")
            if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
        ]
        cands.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        if cands:
            try:
                abs_out.write_bytes(cands[0].read_bytes())
                found = abs_out
            except Exception as e:
                return "", f"搬移圖片失敗:{e}"
    try:
        shutil.rmtree(work, ignore_errors=True)
    except Exception:
        pass
    if found and found.is_file() and found.stat().st_size > 0:
        return f"/assets/testword/{fname}", None
    msg = err or (text[:300] if text else "未產生圖片檔")
    return "", f"生圖失敗:{msg}"


# ---- 去背紀錄:摳不掉的原因要看得見 ----
# 去背是生圖之後的背景步驟,失敗時只會靜靜留著白底——玩家看到的是「還是白的」,
# 卻沒有任何地方講為什麼(沒裝 Pillow?模型畫了場景?角色跟背景同色?)。
# 留最近幾筆給設定頁與 testword 讀,問題當場看得到,不必去翻伺服器 log。
_CUT_LOG: list[dict] = []
_CUT_LOG_MAX = 30


def _note_cut(name: str, changed: bool, why: str) -> None:
    _CUT_LOG.append({"name": name, "changed": bool(changed), "why": why, "t": time.time()})
    del _CUT_LOG[:-_CUT_LOG_MAX]
    print(f"[去背] {name}:{why}", flush=True)


class CutIn(BaseModel):
    """對已經生好的圖重摳一次。調容差、或先前沒裝 Pillow 補裝之後,
    不必重生一張(那要再燒一次 GPU),直接對現有檔案再跑一遍。"""
    url: str                                  # /assets/portraits/… 或 /assets/testword/…
    tol: int = 0                              # 0 = cutout.TOLERANCE
    border_min: float = 0                     # 0 = 依檔名猜構圖(head 放寬),猜不到用預設
    dilate: int = -1                          # -1 = cutout.DILATE


def _asset_path(url: str) -> Path | None:
    """把 /assets/xxx/yyy.png 換成本機路徑。只認 portraits 與 testword 兩個目錄,
    取 basename 擋路徑穿越。"""
    u = (url or "").strip().split("?")[0].split("#")[0]
    for prefix, base in (("/assets/portraits/", PORTRAIT_DIR), ("/assets/testword/", IMG_TEST_DIR)):
        if u.startswith(prefix):
            p = base / Path(u).name
            return p if p.is_file() else None
    return None


@app.get("/api/cutout")
def cutout_status():
    """去背能不能用、最近幾張的結果。設定頁與 testword 都讀這支。"""
    return {
        "available": cutout.AVAILABLE,
        "hint": "" if cutout.AVAILABLE else
                "沒裝 Pillow,立繪不會去背(白底疊在遊戲畫面上)。"
                "修法:pip install -r server/requirements.txt,然後重開伺服器。",
        "tolerance": cutout.TOLERANCE,
        "border_min": cutout.BORDER_MIN,
        "dilate": cutout.DILATE,
        "recent": list(reversed(_CUT_LOG)),
    }


@app.post("/api/cutout")
async def cutout_run(body: CutIn):
    """對已存在的圖重跑去背。回 {changed, why}。"""
    p = _asset_path(body.url)
    if p is None:
        raise HTTPException(404, "找不到這張圖(只認 /assets/portraits/ 與 /assets/testword/)")
    bmin = body.border_min or (
        comfy.PORTRAIT_SHOTS.get(p.stem.rsplit("_", 1)[-1], {}).get("border_min")
        or cutout.BORDER_MIN)
    changed, why = await asyncio.to_thread(
        cutout.cut_background, p,
        int(body.tol) or cutout.TOLERANCE, float(bmin),
        cutout.DILATE if body.dilate < 0 else int(body.dilate))
    _note_cut(p.name, changed, why)
    # 覆蓋了同一個檔名,URL 帶版本號瀏覽器才會重抓
    return {"changed": changed, "why": why, "url": f"{body.url.split('?')[0]}?v={int(time.time())}"}


# ---- ComfyUI 本機生圖(Windows 那台,與 Ollama 共用一張卡,換班見 comfy.lease)----


def _comfy_prompt_for(opts: dict) -> tuple[str, list[str]]:
    """人設 → 英文 SD tag。膚色/配色沿用 Grok 那條路的確定性雜湊,
    同一個人設不管走哪條路都推出同一組,兩邊的圖才是同一個人。"""
    ch = opts.get("character") if isinstance(opts.get("character"), dict) else None
    anchor = _identity_anchor(ch or {})
    part = str(opts.get("part") or "").lower()
    # 三連拍的 shot 直接就是取景(head/half/full),蓋掉 framing
    shot = str(opts.get("shot") or "").lower()
    return sdtags.build_prompt(
        ch,
        # 要去背的那幾張,prompt 先要一塊平背景(見 cutout.py)。
        # 三連拍照規格走;testword 那條由勾選決定。
        flat_bg=bool(comfy.PORTRAIT_SHOTS.get(shot, {}).get("cutout")) or bool(opts.get("flat_bg")),
        part=part,
        framing=shot if shot in sdtags.FRAMING else str(opts.get("framing") or "half"),
        rating=str(opts.get("rating") or "sfw"),
        art_style=str(opts.get("style") or "anime"),
        skin=anchor["skin"],
        palette=anchor["palette"],
        age=anchor["age"],
        # 生涯服裝優先(職業給的那身);玩家挑過個人衣櫃才換
        outfit=str(opts.get("outfit") or "") or anchor["outfit"],
        # 第一輪(head0/bust0/lower0)不寫服裝,跟中文那版同一個取捨
        dressed=part not in IMG_BARE_PARTS,
        extra=str(opts.get("extra") or ""),
    )


async def _run_comfy_image(opts: dict) -> tuple[str, str | None]:
    """ComfyUI 生一張。

    shot 有值(head|half|full)= 召喚三連拍,存進 assets/portraits/ 並以角色 id
    命名(同一張永遠同一個檔名,重生就覆蓋);否則存 assets/testword/,沿用
    Grok 那條路的 `{stamp}_{part}.png` 規則,兩條路的圖在相簿裡混排也不用分開處理。
    """
    shot = str(opts.get("shot") or "").lower()
    char_id = re.sub(r"[^A-Za-z0-9_-]", "", str(opts.get("char_id") or ""))[:40]
    if shot in comfy.PORTRAIT_SHOTS and char_id:
        PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
        out_dir, url_dir = PORTRAIT_DIR, "/assets/portraits"
        fname = f"{char_id}_{shot}.png"
    else:
        shot = ""
        IMG_TEST_DIR.mkdir(parents=True, exist_ok=True)
        out_dir, url_dir = IMG_TEST_DIR, "/assets/testword"
        part = str(opts.get("part") or "").lower()
        stamp = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
        fname = f"{stamp}_{part}.png" if part in IMG_PARTS else f"{stamp}.png"

    wf = opts.get("workflow") if isinstance(opts.get("workflow"), dict) else None
    # prompt 有值 = 使用者在 testword 改過的版本,原樣送出;留空才由人設現組
    prompt = str(opts.get("prompt") or "").strip()
    if not prompt and wf is None:
        prompt, _ = _comfy_prompt_for(opts)
    if not prompt and wf is None:
        return "", "ComfyUI 生圖要有 prompt 或人設(或整份 workflow)"

    # 三連拍的尺寸與 seed 由伺服器決定:尺寸照 plan-v4 立繪規格,seed 取人設雜湊
    # ——三張同 seed 才會是同一張臉,而且重生還是同一個人。
    spec = comfy.PORTRAIT_SHOTS.get(shot) or {}
    gen_w, gen_h = spec.get("gen", (0, 0))
    out_w, out_h = spec.get("out", (0, 0))
    seed = int(opts.get("seed") or 0)
    if shot and not seed:
        seed = _identity_anchor(opts.get("character") or {})["seed"]

    # 三連拍照規格去背;testword 那條(沒有 shot)由前端的勾選決定,
    # 想在測試台上看去背效果不必先跑一次召喚。
    want_cut = bool(spec.get("cutout")) if shot else bool(opts.get("cutout"))
    # negative 只有一個變數:要不要去背(要的話多擋場景,不然外框判定會失敗)。
    # 分級不影響 negative——那是抽卡在管的,不是靠 negative 擋內容(見 sdtags)。
    negative = str(opts.get("negative") or "") or sdtags.negative_for(want_cut)

    name, err = await comfy.generate(
        positive=prompt,
        negative=negative,
        ckpt=str(opts.get("ckpt") or ""),
        save_to=out_dir / fname,
        width=gen_w or int(opts.get("width") or comfy.DEFAULT_WIDTH),
        height=gen_h or int(opts.get("height") or comfy.DEFAULT_HEIGHT),
        out_width=out_w or int(opts.get("out_width") or 0),
        out_height=out_h or int(opts.get("out_height") or 0),
        steps=int(opts.get("steps") or comfy.DEFAULT_STEPS),
        cfg=float(opts.get("cfg") or comfy.DEFAULT_CFG),
        seed=seed,
        workflow=wf,
        base=str(opts.get("comfy_url") or ""),
    )
    if err:
        return "", err
    # 立繪要疊在遊戲畫面上,背景得摳掉。摳不乾淨時 cut_background 會原圖不動
    # ——寧可留著背景,也不要交出一張被啃過的破圖。
    if want_cut:
        changed, why = await asyncio.to_thread(
            cutout.cut_background, out_dir / fname,
            cutout.TOLERANCE, float(spec.get("border_min") or cutout.BORDER_MIN))
        _note_cut(fname, changed, why)
    # 三連拍會覆蓋同一個檔名,URL 帶版本號才不會被瀏覽器拿舊的
    ver = f"?v={int(time.time())}" if shot else ""
    return f"{url_dir}/{name}{ver}", None


@app.get("/api/comfy/status")
async def comfy_status(url: str = ""):
    """ComfyUI 通不通、有哪些 checkpoint、GPU 現在歸誰用。

    url 給值 = 測那台並記住(RP5 與 GPU 主機不同機,localhost 在 RP5 上
    指的是 RP5 自己,所以位址一定要能從設定頁帶進來)。"""
    base = (url or "").strip().rstrip("/")
    stats = await comfy.system_stats(base)
    if base and stats is not None:
        comfy.note_comfy_url(base)   # 連得上才記,免得打錯字把好位址蓋掉
    devices = (stats or {}).get("devices") or []
    # 四種 loader 的清單都回:checkpoints 有東西卻生不出圖時,要靠 text_encoders /
    # vaes 有沒有料才判斷得出那個檔是不是「只含主模型」的單件檔
    models = await comfy.model_lists(base) if stats else {}
    return {
        "ok": stats is not None,
        "url": base or comfy.comfy_url(),
        "checkpoints": models.get("checkpoints", []),
        "models": models,
        # 試過確定載不動的(只含主模型、沒有 CLIP)——設定頁把它們標出來
        "bad_checkpoints": comfy.bad_ckpts(),
        "vram": [
            {
                "name": d.get("name"),
                "total_mb": round((d.get("vram_total") or 0) / 1048576),
                "free_mb": round((d.get("vram_free") or 0) / 1048576),
            }
            for d in devices
        ],
        "gpu": comfy.gpu_state(),
    }


async def _stream_ollama_chat(endpoint: str, body: dict, on_token) -> str | None:
    """Ollama NDJSON 串流;on_token(chunk) 累積。回傳 error 字串或 None。

    所有 Ollama 流量都經過這裡,所以 GPU 換班鎖也開在這 —— 進來前先把
    ComfyUI 的 checkpoint 卸出 VRAM,免得 Ollama 載模型時撞到 OOM。
    連續聊天只有第一句會付換班成本(lease 是黏著的)。
    """
    comfy.note_ollama_endpoint(endpoint)
    async with comfy.lease("llm"):
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
    if provider == "grok-build":
        if not _grok_build_available():
            raise HTTPException(
                status_code=502,
                detail=f"找不到 Grok Build 指令 `{GROK_BIN}`。安裝 grok CLI 或設 GROK_BIN。",
            )
        names = list(GROK_DEFAULT_MODELS)
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


# Ollama → chat_job 串流;Grok Build → 訂單整包(chat_job 也相容)

CHAT_JOBS: dict[str, dict] = {}


async def _run_chat_job(job_id: str, provider: str, endpoint: str, body: dict):
    job = CHAT_JOBS[job_id]
    acc_parts: list[str] = []

    def on_token(piece: str):
        acc_parts.append(piece)
        job["text"] = "".join(acc_parts)

    # 一定要收尾標 done:沒標的話代工佇列會一直讓路給這個「還在跑」的前景 job
    try:
        if provider == "grok-build":
            text, err = await _run_grok_build(
                body.get("model") or "grok-4.5",
                body.get("messages") or [],
                body.get("options"),
                on_partial=on_token,  # streaming-json 邊產邊推,前端輪詢看得到進度
            )
            if text:
                job["text"] = text
            if err and not text:
                job["error"] = err
        else:
            ollama_body = _ollama_chat_body(
                body.get("model"),
                body.get("messages") or [],
                body.get("options") or {},
            )
            err = await _stream_ollama_chat(endpoint, ollama_body, on_token)
            if err and not job["text"]:
                job["error"] = err
        # 收尾剝思考塊（串流中途可能已含 <think>）
        if job.get("text"):
            job["text"] = _strip_thinking(job["text"])
    except Exception as e:  # noqa: BLE001 — 例外也要讓佇列繼續跑
        if not job["text"]:
            job["error"] = str(e)[:500]
    finally:
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
            if provider == "grok-build":
                text, err = await _run_grok_build(
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
# endpoint 哨兵:
#   grok-build / grok / xai → 文字 Grok Build
#   grok-img → 生圖(Grok Build + image_gen)
#   其餘 → Ollama URL


class GenIn(BaseModel):
    key: str
    endpoint: str = "http://localhost:11434"
    model: str
    messages: list = []
    options: dict | None = None
    provider: str | None = None  # "ollama" | "grok-build" | "grok-img"
    retry: bool = False  # True:若該 key 先前失敗,重新排隊
    prio: int = 0  # 佇列優先序(大的先跑):玩家在等的回覆 > 開場白 > 背景素材


class ImgGenIn(BaseModel):
    """testword 妹子生圖下單。仍進 gen_tasks,endpoint=grok-img。
    character = girl_gen.generateGirl() 完整結果(或存檔魅魔欄位),生圖以此為準。"""
    key: str | None = None
    model: str = "grok-4.5"
    framing: str = "half"       # half | full(part 有值時忽略)
    rating: str = "sfw"         # sfw | nsfw
    style: str = "anime"        # anime | realistic | pixel
    character: dict | None = None  # 完整人設(優先)
    name: str = ""              # 無 character 時的簡填
    personality: str = ""
    backstory: str = ""
    extra: str = ""
    part: str = ""              # ""=整張;head0|bust0|lower0=第一輪;head|bust|lower=第二輪穿搭
    ref: str = ""               # 第一輪同段那張的 /assets/testword/… URL,第二輪當參考圖
    prompt: str = ""            # 使用者在 testword 改過的 prompt(留空=伺服器依人設自己組)
    # 指定這張圖穿哪一套。留空 = 由 character 決定(生涯服裝優先,見 _outfit_of)
    outfit: str = ""
    # testword 用:生完就去背(三連拍不看這欄,照 PORTRAIT_SHOTS 的規格走)。
    # 想去背通常也要 flat_bg——沒有平背景可摳,三道閘門一定擋下來。
    cutout: bool = False
    flat_bg: bool = False
    retry: bool = False
    # provider: "grok-img"(雲端 Grok Build)| "comfy"(Windows 本機 ComfyUI)
    provider: str = "grok-img"
    # 以下只有 provider=comfy 會用到。ComfyUI 吃的是 SD tag,不是中文敘述。
    negative: str = ""          # 留空 = comfy.DEFAULT_NEGATIVE
    ckpt: str = ""              # 留空 = COMFY_CKPT,再空 = ComfyUI 清單第一個
    # 以下 0 一律代表「沒指定」,交給 comfy.DEFAULT_* 決定——不要在這裡再寫一組
    # 預設值,那會無聲蓋掉模型該用的參數(換模型時只改 comfy.py 一處)
    width: int = 0              # 實際算圖尺寸(SDXL 給 832×1216 這種標準桶才不糊)
    height: int = 0
    out_width: int = 0          # 算完再縮到這個尺寸(立繪 192×288);0 = 不縮
    out_height: int = 0
    steps: int = 0
    cfg: float = 0
    seed: int = 0               # 0 = 每次隨機(三連拍例外:取人設雜湊)
    comfy_url: str = ""         # ComfyUI 位址。RP5 與 GPU 主機不同機時必填(留空 = 用 COMFY_URL)
    # 召喚三連拍:shot=head|half|full 且有 char_id → 存 assets/portraits/{char_id}_{shot}.png,
    # 尺寸與 seed 由伺服器依規格決定(三張同 seed = 同一張臉)
    shot: str = ""
    char_id: str = ""
    workflow: dict | None = None  # 整份 API 格式 workflow;給了就原樣送出,上面全部忽略


GEN_WAKE = asyncio.Event()


def _gen_endpoint_for(provider: str | None, endpoint: str) -> str:
    ep = (endpoint or "").strip().lower()
    p = (provider or "").strip().lower()
    if p in ("comfy", "comfyui", "comfy-img") or ep in ("comfy", "comfy-img"):
        return "comfy-img"
    if p in ("grok-img", "img", "image") or ep in ("grok-img", "img"):
        return "grok-img"
    p2 = _normalize_provider(provider) if provider else None
    if p2 == "grok-build" or ep in ("grok-build", "build", "grok", "xai"):
        return "grok-build"
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
                    "UPDATE gen_tasks SET status='pending', error=NULL, prio=?, updated=? WHERE key=?",
                    (int(t.prio or 0), now, t.key),
                )
                GEN_WAKE.set()
            elif status == "pending" and int(t.prio or 0) > 0:
                # 同一單重下且標了優先(玩家在等)→ 就地插隊,不必等前面的背景素材
                conn.execute(
                    "UPDATE gen_tasks SET prio=MAX(prio, ?) WHERE key=?", (int(t.prio or 0), t.key)
                )
            return {"key": t.key, "status": status, "result": result, "error": error}
        conn.execute(
            "INSERT INTO gen_tasks (key, endpoint, model, messages, options, status, prio, created, updated) "
            "VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
            (t.key, ep, t.model,
             json.dumps(t.messages, ensure_ascii=False),
             json.dumps(t.options or {}, ensure_ascii=False), int(t.prio or 0), now, now),
        )
    GEN_WAKE.set()
    return {"key": t.key, "status": "pending", "result": None, "error": None}


@app.post("/api/imggen")
def imggen_submit(t: ImgGenIn):
    """testword 生圖下單 → gen_tasks。result 為 /assets/testword/….png

    provider=grok-img → 雲端 Grok Build;provider=comfy → Windows 本機 ComfyUI。
    兩條路的產物存在同一個資料夾、同一套命名,相簿不必分開處理。
    """
    key = (t.key or "").strip() or f"img:{int(time.time() * 1000)}:{uuid.uuid4().hex[:8]}"
    part = (t.part or "").lower()
    ep = _gen_endpoint_for(t.provider, "")
    opts = {
        "kind": "girl_image",
        "part": part if part in IMG_PARTS else "",
        "ref": (t.ref or "") if part in IMG_SEG_PARTS else "",
        "framing": (t.framing or "half").lower(),
        "rating": (t.rating or "sfw").lower(),
        "style": (t.style or "anime").lower(),
        "character": t.character if isinstance(t.character, dict) else None,
        "name": t.name or "",
        "personality": t.personality or "",
        "backstory": t.backstory or "",
        "extra": t.extra or "",
        "outfit": t.outfit or "",
        # ComfyUI 沒有「伺服器依人設自己組」那條路(SD 吃 tag 不吃中文敘述),
        # 所以 prompt 一律照收;Grok 那條維持原本只在分段時才收的行為。
        "prompt": (t.prompt or "") if (ep == "comfy-img" or part in IMG_PARTS) else "",
    }
    if ep == "comfy-img":
        opts.update({
            "negative": t.negative or "",
            "ckpt": t.ckpt or "",
            "width": int(t.width or 0),
            "height": int(t.height or 0),
            "out_width": int(t.out_width or 0),
            "out_height": int(t.out_height or 0),
            "steps": int(t.steps or 0),
            "cfg": float(t.cfg or 0),
            "seed": int(t.seed or 0),
            "comfy_url": (t.comfy_url or "").strip(),
            "shot": (t.shot or "").strip().lower(),
            "char_id": (t.char_id or "").strip(),
            "cutout": bool(t.cutout),
            "flat_bg": bool(t.flat_bg or t.cutout),   # 要去背就一定要平背景
            "workflow": t.workflow if isinstance(t.workflow, dict) else None,
        })
    body = GenIn(
        key=key,
        endpoint=ep,
        provider=ep,
        model=t.model or "grok-4.5",
        messages=[],  # 參數在 options
        options=opts,
        retry=t.retry,
    )
    return gen_submit(body)


@app.get("/api/imggen/list")
def imggen_list(limit: int = 24):
    """列出 testword 最近生圖。"""
    IMG_TEST_DIR.mkdir(parents=True, exist_ok=True)
    files = [
        p for p in IMG_TEST_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
    ]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for p in files[: max(1, min(limit, 100))]:
        tail = p.stem.rsplit("_", 1)[-1].lower()
        out.append({
            "name": p.name,
            "url": f"/assets/testword/{p.name}",
            "size": p.stat().st_size,
            "mtime": p.stat().st_mtime,
            "part": tail if tail in IMG_PARTS else "",
        })
    return {"items": out}


@app.post("/api/comfy/preview")
def comfy_preview(t: ImgGenIn):
    """不生圖,只把人設翻成 SD tag 給 testword 顯示/編輯。

    整張一份 + 分段六份一起回,跟 /api/imggen/preview 同一個用法。
    unknown 是查不到對照的欄位原文——池子被改過時會出現在這裡,
    比圖畫錯了才回頭猜快得多。
    """
    base = {
        "character": t.character if isinstance(t.character, dict) else None,
        "framing": (t.framing or "half").lower(),
        "rating": (t.rating or "sfw").lower(),
        "style": (t.style or "anime").lower(),
        "extra": t.extra or "",
        "outfit": t.outfit or "",
    }
    whole, unknown = _comfy_prompt_for({**base, "part": ""})
    parts = []
    for p in IMG_PARTS:
        text, unk = _comfy_prompt_for({**base, "part": p})
        parts.append({"part": p, "label": PART_LABEL_ZH.get(p, p), "prompt": text})
        unknown += unk
    # 召喚三連拍:遊戲真正會送出去的那三份。跟上面的六段是不同的東西,
    # 要看「遊戲到底送了什麼」就是看這裡。
    shots = []
    for k, spec in comfy.PORTRAIT_SHOTS.items():
        text, unk = _comfy_prompt_for({**base, "part": "", "shot": k})
        shots.append({
            "shot": k,
            "label": SHOT_LABEL_ZH.get(k, k),
            "prompt": text,
            "negative": sdtags.negative_for(bool(spec.get("cutout"))),
            "gen": list(spec["gen"]),
            "out": list(spec["out"]),
            "cutout": bool(spec.get("cutout")),
        })
        unknown += unk
    return {
        "whole": whole,
        "parts": parts,
        "shots": shots,
        "negative": sdtags.negative_for(),
        "unknown": sorted(set(unknown)),
        "defaults": {
            "width": comfy.DEFAULT_WIDTH, "height": comfy.DEFAULT_HEIGHT,
            "steps": comfy.DEFAULT_STEPS, "cfg": comfy.DEFAULT_CFG,
            "sampler": comfy.DEFAULT_SAMPLER, "scheduler": comfy.DEFAULT_SCHEDULER,
            "clip_skip": comfy.DEFAULT_CLIP_SKIP,
        },
    }


@app.post("/api/imggen/preview")
def imggen_preview(t: ImgGenIn):
    """不生圖,只回這份人設組出來的 prompt(六段各一份)。
    testword 拿它填編輯框:使用者改完再按各自的生成鍵,改過的版本原樣送回 /api/imggen。"""
    parts = [(t.part or "").lower()] if (t.part or "").lower() in IMG_PARTS else list(IMG_PARTS)
    out = []
    for p in parts:
        out.append({
            "part": p,
            "label": PART_LABEL_ZH.get(p, p),
            "ref_of": PART_REF_OF.get(p, ""),   # 第二輪要參考的是第一輪哪一段
            # 可編輯的部分。存檔路徑與參考圖那兩行送出前才補,不放進編輯框
            "prompt": _seg_prompt_body(
                part=p,
                rating=(t.rating or "sfw").lower(),
                style=(t.style or "anime").lower(),
                character=t.character if isinstance(t.character, dict) else None,
                name=t.name or "", personality=t.personality or "",
                backstory=t.backstory or "", extra=t.extra or "",
            ),
        })
    return {"parts": out}


@app.delete("/api/gen")
def gen_clear():
    """清空代工佇列(測試/改內容後重生用)。"""
    with db() as conn:
        conn.execute("DELETE FROM gen_tasks")
    return {"ok": True}


# running 超過這個秒數 → 當 worker 重啟/卡死留下的孤兒,回收成 error,免得永遠佔位
GEN_RUNNING_STALE_SEC = float(os.environ.get("GEN_RUNNING_STALE_SEC", "600"))


async def _gen_worker():
    """一次跑一件;前景聊天 job 進行中就讓路(別讓背景生成搶慢即時對話)。"""
    while True:
        try:
            # 只讓路給「真的還在跑」的前景 job;卡住超過 2 分鐘的當作死掉,不再拖累佇列
            now_ts = time.time()
            if any(not j["done"] and now_ts - j["t"] < 120 for j in CHAT_JOBS.values()):
                await asyncio.sleep(0.3)
                continue
            # 先清旗標再查表:查完之後進來的新單一定會再 set 一次,不會被清掉而空等 5 秒
            GEN_WAKE.clear()
            with db() as conn:
                conn.execute("DELETE FROM gen_tasks WHERE created < ?", (time.time() - 172800,))
                # 回收孤兒 running(重啟後留下、或 stream 掛掉沒寫回)
                conn.execute(
                    "UPDATE gen_tasks SET status='error', error=?, updated=? "
                    "WHERE status='running' AND updated < ?",
                    ("逾時未完成(stale running)", now_ts, now_ts - GEN_RUNNING_STALE_SEC),
                )
                row = conn.execute(
                    "SELECT key, endpoint, model, messages, options FROM gen_tasks "
                    "WHERE status='pending' ORDER BY prio DESC, created LIMIT 1"
                ).fetchone()
            if not row:
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

            if endpoint == "comfy-img":
                url, err = await _run_comfy_image(opts)
                text = url or ""
            elif endpoint == "grok-img":
                url, err = await _run_grok_image(
                    model,
                    framing=str(opts.get("framing") or "half"),
                    rating=str(opts.get("rating") or "sfw"),
                    style=str(opts.get("style") or "anime"),
                    character=opts.get("character") if isinstance(opts.get("character"), dict) else None,
                    name=str(opts.get("name") or ""),
                    personality=str(opts.get("personality") or ""),
                    backstory=str(opts.get("backstory") or ""),
                    extra=str(opts.get("extra") or ""),
                    part=str(opts.get("part") or ""),
                    ref=str(opts.get("ref") or ""),
                    prompt_body=str(opts.get("prompt") or ""),
                )
                text = url or ""
            elif endpoint in ("grok-build", "grok", "xai"):
                text, err = await _run_grok_build(model, msgs, opts)
            else:
                body = _ollama_chat_body(model, msgs, opts)
                err = await _stream_ollama_chat(endpoint, body, on_token)
                text = "".join(parts)
            # Qwen3.5 等：即使傳了 think:false，仍可能帶思考塊 → 一律剝掉
            text = _strip_thinking(text or "")
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
    if not cutout.AVAILABLE:
        print("[警告] 沒裝 Pillow —— 立繪不會去背(白底疊在遊戲畫面上)。"
              "修法:pip install -r server/requirements.txt,然後重開伺服器。"
              "(狀態也看得到:GET /api/cutout、設定頁按「測試 ComfyUI」、"
              "/testword 的「🩹 去背狀態」)", flush=True)
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


# ── 多檔牌組版本（card_x.json 等）────────────────────────────────
# 註冊表 content/card_packs_registry.json：
#   { "active": "main", "packs": [{ "id","file","name","note",... }] }
# 每份牌組是獨立 JSON（與 cards.json 同形）。遊戲只載入 active 那份。
# 上線 = 改 active 指標；舊檔保留，可一鍵切回。

CONTENT_DIR = WEB_DIR / "content"
PACK_REGISTRY_PATH = CONTENT_DIR / "card_packs_registry.json"
_PACK_ID_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_\-]{0,47}$")
_PACK_FILE_RE = re.compile(r"^[a-zA-Z0-9_\-]+\.json$")


def _default_pack_registry() -> dict:
    return {
        "active": "main",
        "packs": [
            {
                "id": "main",
                "file": "cards.json",
                "name": "正式牌庫",
                "note": "預設／相容路徑 content/cards.json",
            }
        ],
    }


def _load_pack_registry() -> dict:
    if not PACK_REGISTRY_PATH.exists():
        reg = _default_pack_registry()
        # 若 cards.json 存在就寫出註冊表，方便後續多版本
        try:
            PACK_REGISTRY_PATH.write_text(
                json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
            )
        except Exception:
            pass
        return reg
    try:
        reg = json.loads(PACK_REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(500, f"card_packs_registry.json 損壞: {e}")
    if not isinstance(reg, dict):
        raise HTTPException(500, "card_packs_registry.json 格式錯誤")
    packs = reg.get("packs")
    if not isinstance(packs, list) or not packs:
        reg = _default_pack_registry()
    # 確保 main 在
    if not any(isinstance(p, dict) and p.get("id") == "main" for p in reg["packs"]):
        reg["packs"].insert(
            0,
            {
                "id": "main",
                "file": "cards.json",
                "name": "正式牌庫",
                "note": "預設",
            },
        )
    if not reg.get("active") or not any(
        p.get("id") == reg["active"] for p in reg["packs"] if isinstance(p, dict)
    ):
        reg["active"] = "main"
    return reg


def _save_pack_registry(reg: dict) -> None:
    PACK_REGISTRY_PATH.parent.mkdir(parents=True, exist_ok=True)
    PACK_REGISTRY_PATH.write_text(
        json.dumps(reg, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )


def _pack_meta(reg: dict, pack_id: str) -> dict:
    for p in reg.get("packs") or []:
        if isinstance(p, dict) and p.get("id") == pack_id:
            return p
    raise HTTPException(404, f"找不到牌組: {pack_id}")


def _pack_path(meta: dict) -> Path:
    fname = (meta.get("file") or "").strip()
    if not _PACK_FILE_RE.match(fname):
        raise HTTPException(400, f"非法牌組檔名: {fname}")
    # 只允許 content/ 底下單一檔名，擋路徑穿越
    path = (CONTENT_DIR / fname).resolve()
    if path.parent != CONTENT_DIR.resolve():
        raise HTTPException(400, "牌組路徑越界")
    return path


def _empty_pack_doc(title: str = "新牌組") -> dict:
    return {
        "_meta": {
            "title": title,
            "spec": "docs/card-system.md",
            "schema_version": 2,
            "token_model": "每卡一個詞墜 token；parentId 繼承父鏈。",
            "pack_note": "獨立牌組檔；上線靠 registry.active 切換，不刪舊檔。",
        },
        "enums": {
            "kind": ["speech", "shop_premium", "girl_trait", "venue_event"],
            "chain_attr": ["talk", "touch", "sex", "play", "any"],
            "stage": ["stranger", "friend", "girlfriend", "wife"],
            "mode": ["kanban", "date"],
        },
        "defaults": {
            "hand_size": 5,
            "max_girl_cards": 3,
            "max_inject": 5,
            "shop_slots": 3,
            "shop_refresh_hours": 4,
            "bubble_chance": 0.15,
            "dates_per_girl_per_day": 2,
            "base_plays_by_stage": {
                "stranger": 1,
                "friend": 2,
                "girlfriend": 3,
                "wife": 4,
            },
            "stay_base_by_stage": {
                "stranger": 0.05,
                "friend": 0.15,
                "girlfriend": 0.3,
                "wife": 0.45,
            },
            "answer_rate_by_stage": {
                "stranger": 0.1,
                "friend": 0.35,
                "girlfriend": 0.6,
                "wife": 0.8,
            },
            "phone_cost_range": [10, 30],
            "emotion_fail_open": {"min": -3, "max": -1},
        },
        "starter_pool": [],
        "shop_weights": {"speech_pool": [], "premium_pool": []},
        "cards": [],
        "venues": [],
        "girl_card_build_rules": {},
        "bubble_canned": {},
    }


def _validate_pack_doc(body: dict) -> dict:
    """驗證並正規化一份牌組文件；回傳可寫入的 body。"""
    if not isinstance(body, dict) or not isinstance(body.get("cards"), list):
        raise HTTPException(400, "需要 {cards: [...]}")
    cards = body["cards"]
    ids = []
    for i, c in enumerate(cards):
        if not isinstance(c, dict) or not c.get("id"):
            raise HTTPException(400, f"cards[{i}] 缺 id")
        cid = str(c["id"]).strip()
        if not cid:
            raise HTTPException(400, f"cards[{i}] id 為空")
        if cid in ids:
            raise HTTPException(400, f"重複 id: {cid}")
        ids.append(cid)
        c["id"] = cid
        pid = c.get("parentId")
        if pid is None or pid == "":
            c["parentId"] = None
    idset = set(ids)
    by = {c["id"]: c for c in cards}
    for c in cards:
        pid = c.get("parentId")
        if not pid:
            continue
        if pid not in idset:
            raise HTTPException(400, f"卡 {c['id']} 的 parentId={pid} 不存在")
        if pid == c["id"]:
            raise HTTPException(400, f"卡 {c['id']} 不能 parent 自己")
        # 環
        seen = set()
        cur = c
        while cur:
            if cur["id"] in seen:
                raise HTTPException(400, f"詞墜繼承成環: {c['id']}")
            seen.add(cur["id"])
            pp = cur.get("parentId")
            cur = by.get(pp) if pp else None
    meta = body.get("_meta") if isinstance(body.get("_meta"), dict) else {}
    meta.setdefault("title", "魅魔萬事屋·互動牌定義（內容模組）")
    meta.setdefault("spec", "docs/card-system.md")
    meta["schema_version"] = int(meta.get("schema_version") or 2)
    meta["token_model"] = (
        "每卡一個詞墜 token；parentId 繼承父鏈詞墜。"
        "解析後效果字串如 [問候] [說笑話]。"
    )
    meta["pack_model"] = (
        "多檔牌組：registry.active 決定遊戲用哪份；"
        "編輯 card_x.json 等草稿，上線只切指標，舊版可回滾。"
    )
    body["_meta"] = meta
    # starter_pool 清幽靈
    if isinstance(body.get("starter_pool"), list):
        body["starter_pool"] = [x for x in body["starter_pool"] if x in idset]
    return body


def _read_pack_file(path: Path) -> dict:
    if not path.exists():
        raise HTTPException(404, f"找不到牌組檔: {path.name}")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception as e:
        raise HTTPException(500, f"{path.name} 解析失敗: {e}")


def _write_pack_file(path: Path, body: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    # 同檔 .bak
    try:
        if path.exists():
            bak = path.with_suffix(path.suffix + ".bak")
            bak.write_text(path.read_text(encoding="utf-8"), encoding="utf-8")
    except Exception:
        pass
    path.write_text(json.dumps(body, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def _pack_summary(meta: dict, reg: dict) -> dict:
    path = _pack_path(meta)
    count = None
    if path.exists():
        try:
            doc = json.loads(path.read_text(encoding="utf-8"))
            count = len(doc.get("cards") or [])
        except Exception:
            count = None
    return {
        "id": meta.get("id"),
        "file": meta.get("file"),
        "name": meta.get("name") or meta.get("id"),
        "note": meta.get("note") or "",
        "active": meta.get("id") == reg.get("active"),
        "exists": path.exists(),
        "cardCount": count,
        "clonedFrom": meta.get("clonedFrom"),
        "createdAt": meta.get("createdAt"),
        "activatedAt": meta.get("activatedAt"),
    }


@app.get("/api/card-packs")
def list_card_packs():
    """列出所有牌組版本 + 目前上線的 active。"""
    reg = _load_pack_registry()
    packs = [_pack_summary(p, reg) for p in reg["packs"] if isinstance(p, dict) and p.get("id")]
    return {"active": reg.get("active"), "packs": packs}


@app.get("/api/card-packs/{pack_id}")
def get_card_pack(pack_id: str):
    reg = _load_pack_registry()
    meta = _pack_meta(reg, pack_id)
    doc = _read_pack_file(_pack_path(meta))
    return {
        "pack": _pack_summary(meta, reg),
        "doc": doc,
    }


@app.put("/api/card-packs/{pack_id}")
def put_card_pack(pack_id: str, body: dict):
    """只寫該牌組檔，不動其他版本。body 可為整份 doc，或 {doc:{...}, name?, note?}。"""
    reg = _load_pack_registry()
    meta = _pack_meta(reg, pack_id)
    doc = body.get("doc") if isinstance(body.get("doc"), dict) else body
    doc = _validate_pack_doc(doc)
    if "name" in body and body["name"]:
        meta["name"] = str(body["name"]).strip()
    if "note" in body:
        meta["note"] = str(body.get("note") or "")
    meta["updatedAt"] = time.time()
    _write_pack_file(_pack_path(meta), doc)
    _save_pack_registry(reg)
    return {
        "ok": True,
        "pack": _pack_summary(meta, reg),
        "count": len(doc.get("cards") or []),
        "schema_version": (doc.get("_meta") or {}).get("schema_version"),
    }


class PackCreateIn(BaseModel):
    id: str
    name: str = ""
    note: str = ""
    # empty | clone | lineage
    mode: str = "clone"
    # clone / lineage 來源
    from_pack: str = "main"
    # lineage 模式：來源卡 id + full|subtree
    from_card_id: str = ""
    lineage_mode: str = "full"
    file: str = ""  # 可空：自動 card_{id}.json；main 固定 cards.json


@app.post("/api/card-packs")
def create_card_pack(body: PackCreateIn):
    """新開牌組檔（空 / 整包克隆 / 只抽輩分）。不影響 active。"""
    reg = _load_pack_registry()
    pid = (body.id or "").strip()
    if not _PACK_ID_RE.match(pid):
        raise HTTPException(400, "id 須為英文開頭的字母數字_-(最多48字)")
    if any(p.get("id") == pid for p in reg["packs"] if isinstance(p, dict)):
        raise HTTPException(400, f"牌組 id 已存在: {pid}")
    fname = (body.file or "").strip()
    if not fname:
        fname = "cards.json" if pid == "main" else f"{pid}.json"
    if not fname.endswith(".json"):
        fname += ".json"
    if not _PACK_FILE_RE.match(fname):
        raise HTTPException(400, f"非法檔名: {fname}")
    # 檔名不可撞
    for p in reg["packs"]:
        if isinstance(p, dict) and p.get("file") == fname:
            raise HTTPException(400, f"檔名已被 {p.get('id')} 使用: {fname}")
    path = (CONTENT_DIR / fname).resolve()
    if path.parent != CONTENT_DIR.resolve():
        raise HTTPException(400, "路徑越界")
    if path.exists():
        raise HTTPException(400, f"檔案已存在: {fname}")

    mode = (body.mode or "clone").lower()
    if mode == "empty":
        doc = _empty_pack_doc(body.name or pid)
    elif mode in ("clone", "lineage"):
        src_meta = _pack_meta(reg, body.from_pack or "main")
        src_doc = _read_pack_file(_pack_path(src_meta))
        if mode == "clone":
            doc = json.loads(json.dumps(src_doc, ensure_ascii=False))
        else:
            # 只抽輩分：縮小檔案，方便編輯
            from_card = (body.from_card_id or "").strip()
            if not from_card:
                raise HTTPException(400, "lineage 模式需要 from_card_id")
            src_cards = src_doc.get("cards") or []
            by = {c["id"]: c for c in src_cards if isinstance(c, dict) and c.get("id")}
            if from_card not in by:
                raise HTTPException(400, f"來源卡不存在: {from_card}")
            # 找根 + 子樹
            lm = (body.lineage_mode or "full").lower()
            root_id = from_card
            if lm == "full":
                cur = by[from_card]
                seen = set()
                while cur.get("parentId") and cur["parentId"] in by and cur["id"] not in seen:
                    seen.add(cur["id"])
                    cur = by[cur["parentId"]]
                root_id = cur["id"]
            # BFS 子孫
            kids = {}
            for c in src_cards:
                pid0 = c.get("parentId")
                if pid0:
                    kids.setdefault(pid0, []).append(c["id"])
            keep = []
            q = [root_id]
            seen2 = set()
            while q:
                i = q.pop(0)
                if i in seen2:
                    continue
                seen2.add(i)
                keep.append(i)
                q.extend(kids.get(i) or [])
            keep_set = set(keep)
            new_cards = []
            for c in src_cards:
                if c["id"] not in keep_set:
                    continue
                cc = json.loads(json.dumps(c, ensure_ascii=False))
                if lm == "subtree" and c["id"] == root_id:
                    cc["parentId"] = None
                elif cc.get("parentId") and cc["parentId"] not in keep_set:
                    cc["parentId"] = None
                new_cards.append(cc)
            doc = json.loads(json.dumps(src_doc, ensure_ascii=False))
            doc["cards"] = new_cards
            # starter/shop 只留還在的 id
            if isinstance(doc.get("starter_pool"), list):
                doc["starter_pool"] = [x for x in doc["starter_pool"] if x in keep_set]
            sw = doc.get("shop_weights") if isinstance(doc.get("shop_weights"), dict) else {}
            for k in ("speech_pool", "premium_pool"):
                if isinstance(sw.get(k), list):
                    sw[k] = [x for x in sw[k] if x in keep_set]
            doc["shop_weights"] = sw
            meta = doc.get("_meta") if isinstance(doc.get("_meta"), dict) else {}
            meta["extracted_lineage"] = {
                "from_pack": body.from_pack,
                "from_card_id": from_card,
                "root_id": root_id,
                "mode": lm,
                "count": len(new_cards),
            }
            doc["_meta"] = meta
    else:
        raise HTTPException(400, "mode 須為 empty | clone | lineage")

    doc = _validate_pack_doc(doc)
    meta = {
        "id": pid,
        "file": fname,
        "name": (body.name or pid).strip() or pid,
        "note": body.note or "",
        "clonedFrom": body.from_pack if mode != "empty" else None,
        "createMode": mode,
        "createdAt": time.time(),
    }
    _write_pack_file(path, doc)
    reg["packs"].append(meta)
    _save_pack_registry(reg)
    return {
        "ok": True,
        "pack": _pack_summary(meta, reg),
        "count": len(doc.get("cards") or []),
    }


@app.post("/api/card-packs/{pack_id}/activate")
def activate_card_pack(pack_id: str):
    """上線：只改 registry.active，舊牌組檔完整保留可回滾。"""
    reg = _load_pack_registry()
    meta = _pack_meta(reg, pack_id)
    path = _pack_path(meta)
    if not path.exists():
        raise HTTPException(400, f"牌組檔不存在，無法上線: {meta.get('file')}")
    # 輕量驗證
    doc = _read_pack_file(path)
    _validate_pack_doc(doc)
    prev = reg.get("active")
    reg["active"] = pack_id
    meta["activatedAt"] = time.time()
    # 歷史
    hist = reg.setdefault("history", [])
    if not isinstance(hist, list):
        hist = []
        reg["history"] = hist
    hist.append({"at": time.time(), "from": prev, "to": pack_id})
    hist[:] = hist[-50:]
    _save_pack_registry(reg)
    return {
        "ok": True,
        "active": pack_id,
        "previous": prev,
        "pack": _pack_summary(meta, reg),
        "count": len(doc.get("cards") or []),
        "message": f"已上線 {pack_id}（先前 {prev} 仍在，可隨時切回）",
    }


@app.delete("/api/card-packs/{pack_id}")
def delete_card_pack(pack_id: str, delete_file: bool = False):
    """刪除牌組版本（不可刪 active；main 預設只移除註冊不刪 cards.json）。"""
    reg = _load_pack_registry()
    if pack_id == reg.get("active"):
        raise HTTPException(400, "不能刪目前上線的牌組；請先切到其他版本")
    if pack_id == "main" and not delete_file:
        raise HTTPException(400, "main 請用 delete_file=true 才允許（危險）")
    meta = _pack_meta(reg, pack_id)
    path = _pack_path(meta)
    reg["packs"] = [p for p in reg["packs"] if not (isinstance(p, dict) and p.get("id") == pack_id)]
    _save_pack_registry(reg)
    removed_file = False
    if delete_file and path.exists() and meta.get("file") != "cards.json":
        try:
            path.unlink()
            removed_file = True
        except Exception as e:
            raise HTTPException(500, f"註冊已移除但刪檔失敗: {e}")
    return {"ok": True, "removed": pack_id, "fileDeleted": removed_file}


@app.patch("/api/card-packs/{pack_id}")
def patch_card_pack_meta(pack_id: str, body: dict):
    """只改註冊名稱／備註，不碰牌組內容。"""
    reg = _load_pack_registry()
    meta = _pack_meta(reg, pack_id)
    if "name" in body and body["name"] is not None:
        meta["name"] = str(body["name"]).strip() or meta["id"]
    if "note" in body:
        meta["note"] = str(body.get("note") or "")
    _save_pack_registry(reg)
    return {"ok": True, "pack": _pack_summary(meta, reg)}


# 相容：/api/cards 永遠讀寫「目前上線」的那份
@app.get("/api/cards")
def get_cards():
    """遊戲與舊工具：回傳目前 active 牌組內容。"""
    reg = _load_pack_registry()
    meta = _pack_meta(reg, reg.get("active") or "main")
    doc = _read_pack_file(_pack_path(meta))
    # 附加指標方便除錯（不污染存檔時由 put 剝掉亦可）
    return doc


@app.put("/api/cards")
def put_cards(body: dict):
    """寫入目前 active 牌組（相容舊 cardedit）。建議改用 PUT /api/card-packs/{id}。"""
    reg = _load_pack_registry()
    active = reg.get("active") or "main"
    return put_card_pack(active, body)


@app.get("/cardedit")
def cardedit():
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "cardedit.html")


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
