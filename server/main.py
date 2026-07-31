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
import shutil
import sqlite3
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
    # 外貌 look(新制)
    look = ch.get("look") or {}
    if isinstance(look, dict) and look:
        bits = []
        if look.get("height_cm"):
            bits.append(f"{look['height_cm']}cm tall")
        for k, label in (
            ("build", "body"), ("bust", "bust"), ("hair", "hair"),
            ("eyes", "eyes"), ("style", "fashion/style"), ("feature", "distinctive feature"),
        ):
            if look.get(k):
                bits.append(f"{label}: {look[k]}")
        if bits:
            lines.append("Appearance: " + "; ".join(bits))
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
            lines.append("Special traits: " + ", ".join(names))
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
_RATING_MAP = {
    "sfw": "SFW, fully clothed, wholesome, no nudity, safe for work",
    "nsfw": (
        "NSFW adult content allowed: sensual or explicit as fits the character and libido notes, "
        "tasteful erotic art, mature 18+ only"
    ),
}
# 素體那張不談穿沒穿——它的工作只是把身體與比例定下來,分級照樣分級。
_RATING_BASE_MAP = {
    "sfw": "SFW, non-explicit character-design reference sheet",
    "nsfw": "Adult content allowed, mature 18+ only, tasteful figure study",
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
- Content rating: {rating_map.get(rating, rating_map["sfw"])}
- {size_note}
- Single character, plain or simple background, no text overlays, no watermark, no other people
"""


# ---- 三段生圖:同一位妹子拆成「頭 / 胸 / 下半身」三張,各段只畫自己那一段 ----
# 抽卡欄位本來就是分開的(眼睛、罩杯、體型…),整張畫時模型會把它們糊在一起;
# 拆成三張各自吃自己那組欄位,才看得出「大眼睛」「C 罩杯圓潤」到底畫成什麼樣。
# 先出一張「素體」當基礎:只描述身體本身(膚色、罩杯、體型、腿長),不寫任何衣服設定;
# 之後三段都拿素體那張當參考圖,長相與比例才不會每段各長各的。
IMG_BASE_PART = "base"
IMG_SEG_PARTS = ("head", "bust", "lower")
IMG_PARTS = (IMG_BASE_PART,) + IMG_SEG_PARTS
PART_LABEL_ZH = {
    "base": "素體基礎", "head": "頭部", "bust": "胸部・上半身", "lower": "下半身・腿",
}


def _resolve_ref_image(ref: str) -> Path | None:
    """把前端傳來的 /assets/testword/xxx.png 換成本機絕對路徑。
    只認 testword 目錄下確實存在的檔案(取 basename,擋路徑穿越)。"""
    ref = (ref or "").strip()
    if not ref:
        return None
    p = IMG_TEST_DIR / Path(ref).name
    return p if p.is_file() and p.stat().st_size > 0 else None

# 三張要像同一個人:膚色與服裝配色由人設欄位做確定性雜湊,同一個人設永遠推出同一組。
_SKIN_TONES = [
    "fair porcelain skin",
    "pale milky skin with a cool undertone",
    "light skin with a warm peach undertone",
    "smooth ivory skin",
    "healthy light-tan skin",
    "sun-kissed honey skin",
]
_PALETTES = [
    "black and off-white",
    "cream and soft beige",
    "navy blue and white",
    "dusty pink and light grey",
    "olive green and khaki",
    "burgundy and charcoal",
    "sky blue and white",
    "lavender and silver grey",
]


def _identity_anchor(ch: dict) -> dict:
    """三段共用的「同一個人」錨點。膚色/配色人設裡沒有,用欄位雜湊補一組固定值。"""
    look = ch.get("look") if isinstance(ch.get("look"), dict) else {}
    seed = "|".join(str(look.get(k) or "") for k in ("hair", "eyes", "build", "bust", "style"))
    seed += "|" + str(ch.get("name") or "")
    h = hashlib.sha1(seed.encode("utf-8")).digest()
    return {
        "skin": _SKIN_TONES[h[0] % len(_SKIN_TONES)],
        "palette": _PALETTES[h[1] % len(_PALETTES)],
        "height_cm": look.get("height_cm") or "",
        "hair": look.get("hair") or "",
        "eyes": look.get("eyes") or "",
        "build": look.get("build") or "",
        "bust": look.get("bust") or "",
        "style": look.get("style") or "",
        "feature": look.get("feature") or "",
    }


def _anchor_block(a: dict, *, with_outfit: bool = True) -> str:
    """每張圖裡逐字相同的一段——同一個人、同一套衣服、同一個光。
    素體那張 with_outfit=False:不寫任何衣服設定,只留身體與鏡頭。"""
    rows = [f"- Skin: {a['skin']}"]
    if a["hair"]:
        rows.append(f"- Hair (same in every part): {a['hair']}")
    if a["build"]:
        rows.append(f"- Overall build: {a['build']}"
                    + (f", {a['height_cm']}cm tall" if a["height_cm"] else ""))
    if with_outfit:
        if a["style"]:
            rows.append(f"- Outfit: one single {a['style']} outfit, colour palette {a['palette']} — "
                        "the SAME garment across all three parts")
        else:
            rows.append(f"- Outfit: one single coherent outfit, colour palette {a['palette']} — "
                        "the SAME garment across all three parts")
    rows.append("- Camera: straight-on, neutral eye-level angle, same distance and same lens in every part")
    rows.append("- Light: soft even front light from the same direction; identical plain background")
    return "\n".join(rows)


def _part_focus(part: str, a: dict, ch: dict) -> tuple[str, list[str], str]:
    """回 (取景, 這一段要畫的重點, 這一段不要畫的東西)。"""
    if part == IMG_BASE_PART:
        # 素體基礎:只講身體本身。不寫衣服設定,也不寫任何裸露相關字眼——
        # 分級門控(SFW/NSFW)還是照走,由 _RATING_BASE_MAP 決定尺度。
        focus = []
        if a["build"]:
            focus.append(f"Body build — draw exactly this: {a['build']}"
                         + (f", {a['height_cm']}cm tall" if a["height_cm"] else ""))
        if a["bust"]:
            focus.append(f"Bust — draw exactly this: {a['bust']} (size and shape must read clearly)")
        focus.append(f"Skin: {a['skin']}, even tone from face to feet")
        focus.append("Waist, hip line, thigh and calf shape, leg length and overall proportion "
                     "all consistent with the build above")
        if a["hair"]:
            focus.append(f"Hair: {a['hair']}")
        if a["eyes"]:
            focus.append(f"Eyes: {a['eyes']}, calm neutral expression")
        focus.append("Relaxed standing pose, arms loose at the sides, feet together, facing the camera")
        return (
            "FULL FIGURE, head to feet, centred in frame. This is the body/proportion reference pass "
            "that the three cropped parts are built on.",
            focus,
            "No outfit design, no accessories, no props, no scenery, no crop — "
            "this pass records the body and its proportions only.",
        )
    if part == "head":
        focus = []
        if a["eyes"]:
            focus.append(f"Eyes — draw exactly this: {a['eyes']}")
        if a["hair"]:
            focus.append(f"Hairstyle — draw exactly this: {a['hair']}")
        if a["feature"]:
            focus.append(f"Signature detail: {a['feature']} (include it only if it belongs on the face or neck)")
        pers = ch.get("personality") or []
        pers_txt = "、".join(str(p) for p in pers) if isinstance(pers, list) else str(pers)
        mood = ch.get("tone") or ch.get("archetype") or pers_txt
        if mood:
            focus.append(f"Expression should read as: {mood}")
        focus.append("Face shape, jawline, brows, lips and skin rendered in detail — this part is the face")
        return (
            "TIGHT HEAD SHOT: from the top of the hair down to the collarbone, nothing lower. "
            "The head fills most of the frame.",
            focus,
            "Do NOT show the chest, waist, hips or legs. No cleavage in frame.",
        )
    if part == "bust":
        focus = []
        if a["bust"]:
            focus.append(f"Bust — draw exactly this: {a['bust']} (size and shape are the point of this part)")
        if a["build"]:
            focus.append(f"Torso build: {a['build']} — shoulders, ribcage and waistline consistent with it")
        focus.append(f"Skin: {a['skin']}, collarbone and shoulder line clearly readable")
        if a["style"]:
            focus.append(f"Top garment of the {a['style']} outfit: neckline, fabric, how it sits on the chest")
        return (
            "TORSO CROP: from just under the chin down to the waistline. "
            "The head is cropped out above the chin — this part is the chest and torso.",
            focus,
            "Do NOT draw the full face or the eyes. Do NOT show hips or legs.",
        )
    focus = []
    if a["build"]:
        focus.append(f"Hips, thighs and legs shaped by this build: {a['build']}")
    if a["height_cm"]:
        focus.append(f"Leg length and proportion for a {a['height_cm']}cm figure")
    focus.append(f"Skin: {a['skin']}, thigh and calf line clearly readable")
    if a["style"]:
        focus.append(f"Bottom garment of the {a['style']} outfit, plus legwear and shoes that match it")
    return (
        "LOWER-BODY CROP: from the waistline down to the feet. "
        "This part is the hips, thighs and legs.",
        focus,
        "Do NOT draw the head, face or chest.",
    )


def _build_girl_part_prompt(
    *,
    part: str,
    rating: str,
    style: str,
    character: dict | None = None,
    name: str = "",
    personality: str = "",
    backstory: str = "",
    extra: str = "",
    out_path: Path,
    ref_path: Path | None = None,
) -> str:
    """單張的生圖指令:素體基礎,或其中一段(頭/胸/下半身)。
    素體 = 只寫身體,不寫衣服;三段共用同一份錨點,並可帶素體那張當參考圖。"""
    part = (part or IMG_BASE_PART).lower()
    if part not in IMG_PARTS:
        part = IMG_BASE_PART
    is_base = part == IMG_BASE_PART
    rating = (rating or "sfw").lower()
    style = (style or "anime").lower()
    ch = _fill_manual_fields(character, name, personality, backstory)
    a = _identity_anchor(ch)
    frame_line, focus, avoid = _part_focus(part, a, ch)

    size_note = (
        "Output size MUST be exactly 256x256 pixels."
        if style == "pixel"
        else "High resolution, portrait aspect ratio."
    )
    tool_note = (
        "Prefer image_gen. For exact 256x256 pixel art you may use code if image_gen cannot force size."
        if style == "pixel"
        else "You MUST use the image_gen tool (do NOT draw with Python/code)."
    )
    focus_txt = "\n".join(f"- {f}" for f in focus)

    if is_base:
        header = (
            "You are generating ONE image: the BODY BASE of a character reference sheet.\n"
            "This is the foundation pass — it fixes the girl's body, proportions and face.\n"
            "Three cropped parts (head / chest / lower body) will be drawn from it afterwards."
        )
        section = f"=== BODY BASE · {PART_LABEL_ZH[part]} ==="
    else:
        idx = IMG_SEG_PARTS.index(part) + 1
        header = (
            f"You are generating ONE image: part {idx} of 3 of a character reference sheet.\n"
            "The three parts (1 head, 2 chest/torso, 3 lower body) are the SAME girl in the SAME outfit,\n"
            "cropped so that stacking them top to bottom would rebuild one continuous full-body figure.\n"
            f"Right now you draw ONLY part {idx}."
        )
        section = f"=== THIS PART ({idx}/3 · {PART_LABEL_ZH.get(part, part)}) ==="

    ref_block = ""
    if ref_path is not None:
        ref_block = f"""
=== REFERENCE IMAGE (the body base of this same girl) ===
{ref_path}
Open it first. It is the SAME girl — copy her face, skin tone, body proportions and hair from it
exactly, then draw this part with the outfit on top of that body. Using image_edit on this
reference is the preferred way to keep the body identical. If the reference and the text below
disagree on the body, the reference wins.
=== END REFERENCE IMAGE ===
"""

    return f"""{header}

{tool_note}
After the image is created, copy/move the final file to this EXACT path:
{out_path}

Only create that one image file at the destination. Then reply with a short note: the absolute path and one-line description.
{ref_block}
=== SHARED IDENTITY (identical in every part — do not vary) ===
{_anchor_block(a, with_outfit=not is_base)}
=== END SHARED IDENTITY ===

{section}
Framing: {frame_line}
Draw these, from the character sheet — they are AUTHORITATIVE, do not substitute:
{focus_txt}
Exclusions: {avoid}
=== END ===

Render settings:
- Art style: {_STYLE_MAP.get(style, _STYLE_MAP["anime"])}
- Content rating: {(_RATING_BASE_MAP if is_base else _RATING_MAP).get(rating, _RATING_MAP["sfw"])}
- {size_note}
- One person only, plain simple background, no text overlays, no watermark, no collage, no panels
{("- Extra director notes: " + extra.strip()) if extra.strip() else ""}
"""


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
) -> tuple[str, str | None]:
    """Grok Build + image_gen。成功回 (url_path, None),url 如 /assets/testword/xxx.png。
    part 給值(base/head/bust/lower)= 只畫那一段;留空 = 舊行為的整張圖。
    ref = 素體那張的 /assets/testword/… URL,三段拿它當參考圖。"""
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
        prompt = _build_girl_part_prompt(
            part=part, rating=rating, style=style,
            character=character,
            name=name, personality=personality, backstory=backstory, extra=extra,
            out_path=target,
            ref_path=_resolve_ref_image(ref),
        )
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
        rules="Generate exactly one image with image_gen (or code for 128px pixel). Save to the path given. No extra files.",
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
            ollama_body = {
                "model": body.get("model"),
                "messages": body.get("messages") or [],
                "stream": True,
                "options": body.get("options") or {},
            }
            err = await _stream_ollama_chat(endpoint, ollama_body, on_token)
            if err and not job["text"]:
                job["error"] = err
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
    part: str = ""              # ""=整張;base=素體;head | bust | lower = 只畫那一段
    ref: str = ""               # 素體那張的 /assets/testword/… URL,三段當參考圖
    retry: bool = False


GEN_WAKE = asyncio.Event()


def _gen_endpoint_for(provider: str | None, endpoint: str) -> str:
    ep = (endpoint or "").strip().lower()
    p = (provider or "").strip().lower()
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
    """testword 生圖下單 → gen_tasks(endpoint=grok-img)。result 為 /assets/testword/….png"""
    key = (t.key or "").strip() or f"img:{int(time.time() * 1000)}:{uuid.uuid4().hex[:8]}"
    part = (t.part or "").lower()
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
    }
    body = GenIn(
        key=key,
        endpoint="grok-img",
        provider="grok-img",
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


@app.post("/api/imggen/preview")
def imggen_preview(t: ImgGenIn):
    """不生圖,只回這份人設會送出去的 prompt(素體+三段各一份)——testword 對稿用。"""
    parts = [(t.part or "").lower()] if (t.part or "").lower() in IMG_PARTS else list(IMG_PARTS)
    # 預覽時素體圖還不存在,用假路徑讓「三段會帶參考圖」這件事看得見
    ref_demo = _resolve_ref_image(t.ref) or (IMG_TEST_DIR / "<素體那張>.png")
    out = []
    for p in parts:
        out.append({
            "part": p,
            "label": PART_LABEL_ZH.get(p, p),
            "prompt": _build_girl_part_prompt(
                part=p,
                rating=(t.rating or "sfw").lower(),
                style=(t.style or "anime").lower(),
                character=t.character if isinstance(t.character, dict) else None,
                name=t.name or "", personality=t.personality or "",
                backstory=t.backstory or "", extra=t.extra or "",
                out_path=IMG_TEST_DIR / f"<preview>_{p}.png",
                ref_path=None if p == IMG_BASE_PART else ref_demo,
            ),
        })
    return {"parts": out}


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
            # 只讓路給「真的還在跑」的前景 job;卡住超過 2 分鐘的當作死掉,不再拖累佇列
            now_ts = time.time()
            if any(not j["done"] and now_ts - j["t"] < 120 for j in CHAT_JOBS.values()):
                await asyncio.sleep(0.3)
                continue
            # 先清旗標再查表:查完之後進來的新單一定會再 set 一次,不會被清掉而空等 5 秒
            GEN_WAKE.clear()
            with db() as conn:
                conn.execute("DELETE FROM gen_tasks WHERE created < ?", (time.time() - 172800,))
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

            if endpoint == "grok-img":
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
                )
                text = url or ""
            elif endpoint in ("grok-build", "grok", "xai"):
                text, err = await _run_grok_build(model, msgs, opts)
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
