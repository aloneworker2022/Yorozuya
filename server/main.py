"""魅魔萬事屋 遊戲伺服器(M0 骨架)

- 靜態伺服:web/(遊戲本體)+ assets/(生成圖像)
- 存檔 API:GET/PUT /api/save(SQLite,版本號防呆的 last-write-wins)
- LLM:Ollama 串流 / Grok Build 無頭訂單(grok -p;streaming-json end 即完成)

啟動:uvicorn main:app --host 0.0.0.0 --port 8000
"""

import asyncio
import hashlib
import io
import json
import os
import re
import secrets
import shutil
import sqlite3
import threading
import time
import uuid
import zipfile
from pathlib import Path

import httpx
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

import comfy
import cutout
import daydream as ddream
import memos
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
# 姿勢／骨架參考圖（使用者上傳，不當正式立繪；做愛局部動畫骨架會用）
POSE_REF_DIR = ASSETS_DIR / "pose_refs"
FRAME_PACK_DIR = ASSETS_DIR / "frame_packs"
FRAME_PACK_INDEX = FRAME_PACK_DIR / "index.json"
_POSE_MAX_BYTES = 15 * 1024 * 1024
_POSE_EXTS = {".jpg", ".jpeg", ".png", ".webp"}
# 不去背的測試檔前綴(cutout 示範)。GC 不會刪。
_ASSET_KEEP_PREFIXES = frozenset({"chk"})
_SHOT_FILE_SUFS = (
    "tease_cowgirl_ready", "tease_cowgirl_half", "tease_cowgirl_more", "tease_cowgirl_deep", "tease_cowgirl_cum",
    "tease_cowgirl", "tease_breast", "tease_thigh", "tease_butt",
    "tease_oral_ready", "tease_oral_suck", "tease_oral_deep", "tease_oral_cum",
    "tease_oral",
    "tease_doggy_ready", "tease_doggy_half", "tease_doggy_more", "tease_doggy_deep", "tease_doggy_cum",
    "tease_doggy",
    "half_xiu", "half_xi", "half_nu", "half_ai", "half_le",
    "half", "full", "head",
)
SHOT_LABEL_ZH = {
    "head": "大頭照", "half": "半身(聊天立繪)", "full": "全身(看板娘)",
    "half_xi": "半身·喜", "half_nu": "半身·怒", "half_ai": "半身·哀",
    "half_le": "半身·樂", "half_xiu": "半身·害羞",
    "tease_breast": "調戲·摸乳", "tease_thigh": "調戲·摸大腿",
    "tease_butt": "調戲·摸臀",
    "tease_oral": "調戲·口交",
    "tease_oral_ready": "調戲·口交·頂嘴",
    "tease_oral_suck": "調戲·口交·含住",
    "tease_oral_deep": "調戲·口交·整根",
    "tease_oral_cum": "調戲·口交·口內射",
    "tease_doggy": "調戲·背後插入",
    "tease_doggy_ready": "調戲·背後·抓臀勃起",
    "tease_doggy_half": "調戲·背後·龜頭進入",
    "tease_doggy_more": "調戲·背後·插一半",
    "tease_doggy_deep": "調戲·背後·整根頂到底",
    "tease_doggy_cum": "調戲·背後·高潮內射",
    "tease_cowgirl": "調戲·騎乘",
    "tease_cowgirl_ready": "調戲·騎乘·坐下勃起",
    "tease_cowgirl_half": "調戲·騎乘·龜頭進入",
    "tease_cowgirl_more": "調戲·騎乘·插一半",
    "tease_cowgirl_deep": "調戲·騎乘·整根頂到底",
    "tease_cowgirl_cum": "調戲·騎乘·高潮內射",
}
GROK_IMG_TIMEOUT = float(os.environ.get("GROK_IMG_TIMEOUT", "300"))
GROK_IMG_MAX_TURNS = int(os.environ.get("GROK_IMG_MAX_TURNS", "8") or "8")


def _grok_build_available() -> bool:
    return bool(shutil.which(GROK_BIN) or Path(GROK_BIN).is_file())


app = FastAPI(title="魅魔萬事屋")


# 前端檔案禁止 304：ES module（testdate.js → sex_scene.js / hotel.js）若拿到空的
# 304，整份腳本載入失敗，抽妹子／抽召喚師按鈕綁不上。no-store + 去掉條件標頭。
_REVALIDATE_EXT = (".html", ".js", ".css", ".json", ".md", ".webmanifest")
_NO_304_HEADERS = (b"if-none-match", b"if-modified-since")


@app.middleware("http")
async def _revalidate_frontend(request, call_next):
    p = request.url.path
    if p == "/" or p.endswith(_REVALIDATE_EXT):
        request.scope["headers"] = [
            (k, v) for k, v in request.scope["headers"] if k not in _NO_304_HEADERS
        ]
    resp = await call_next(request)
    if p == "/" or p.endswith(_REVALIDATE_EXT):
        resp.headers["Cache-Control"] = "no-store"
        resp.headers["Pragma"] = "no-cache"
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
    conn.execute(
        """CREATE TABLE IF NOT EXISTS daydream (
            id         INTEGER PRIMARY KEY CHECK (id = 1),
            data       TEXT NOT NULL,
            updated_at REAL NOT NULL
        )"""
    )
    # 發現小工具 inbox:手機 widget 丟待辦,遊戲開著時再收進發現池(避免跟存檔互蓋)
    conn.execute(
        """CREATE TABLE IF NOT EXISTS quest_inbox (
            id      INTEGER PRIMARY KEY AUTOINCREMENT,
            text    TEXT NOT NULL,
            created REAL NOT NULL
        )"""
    )
    return conn


class SavePut(BaseModel):
    base_version: int  # 客戶端手上的版本;與伺服器不符 → 409,防舊裝置蓋新檔
    data: dict


class QuestDiscoverIn(BaseModel):
    text: str


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
        "memos": memos.configured(),
        "memos_url": memos.memos_url(),
        "daydream": _dd_public(),
    }


class DiaryUpsert(BaseModel):
    ymd: str
    text: str
    name: str | None = None


@app.get("/api/memos/status")
def memos_status():
    return memos.status()


@app.post("/api/memos/diary")
def memos_diary(body: DiaryUpsert):
    try:
        return memos.upsert_diary(body.ymd, body.text, body.name)
    except memos.MemosError as e:
        raise HTTPException(status_code=e.status, detail=str(e)) from e


@app.get("/api/save")
def get_save():
    with db() as conn:
        row = conn.execute("SELECT version, data, updated_at FROM save WHERE id = 1").fetchone()
    if row is None:
        return {"version": 0, "data": None, "updated_at": None}
    data = json.loads(row[1])
    if isinstance(data, dict):
        ddream.apply_patches(data, _dd_load())
    return {"version": row[0], "data": data, "updated_at": row[2]}


_QUEST_TEXT_MAX = 80


def _clean_quest_text(raw: str) -> str:
    text = " ".join(str(raw or "").split())
    if len(text) > _QUEST_TEXT_MAX:
        text = text[:_QUEST_TEXT_MAX].rstrip()
    return text


@app.post("/api/quests/discover")
def post_discover_quest(body: QuestDiscoverIn):
    """發現小工具:把待辦丟進 inbox,遊戲端收進發現池。"""
    text = _clean_quest_text(body.text)
    if not text:
        raise HTTPException(status_code=400, detail="請輸入待辦")
    with db() as conn:
        conn.execute(
            "INSERT INTO quest_inbox (text, created) VALUES (?, ?)",
            (text, time.time()),
        )
        pending = conn.execute("SELECT COUNT(*) FROM quest_inbox").fetchone()[0]
    return {"ok": True, "text": text, "pending": pending}


@app.post("/api/quests/inbox/drain")
def drain_quest_inbox():
    """遊戲端收走 inbox。一次拿走並清空,避免重複入池。"""
    with db() as conn:
        rows = conn.execute(
            "SELECT id, text FROM quest_inbox ORDER BY id"
        ).fetchall()
        if rows:
            conn.execute("DELETE FROM quest_inbox")
    return {"items": [{"id": r[0], "text": r[1]} for r in rows]}


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
        data = body.data if isinstance(body.data, dict) else {}
        ddream.apply_patches(data, _dd_load())
        new_version = current + 1
        conn.execute(
            "INSERT INTO save (id, version, data, updated_at) VALUES (1, ?, ?, ?) "
            "ON CONFLICT (id) DO UPDATE SET version = excluded.version, "
            "data = excluded.data, updated_at = excluded.updated_at",
            (new_version, json.dumps(data, ensure_ascii=False), time.time()),
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


def _normalize_pose_image(data: bytes) -> tuple[bytes, int, int]:
    """把使用者丟進來的檔解成 RGB/RGBA PNG。不靠副檔名。長邊超過 2048 會縮小。"""
    try:
        from PIL import Image
    except ImportError as e:
        raise HTTPException(status_code=500, detail="伺服器沒裝 Pillow，無法讀圖") from e
    try:
        im = Image.open(io.BytesIO(data))
        im.load()
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="讀不了這張圖。畫素沒有下限；iPhone 請先「另存 JPG」，不要用 HEIC。",
        ) from e
    if im.mode not in ("RGB", "RGBA"):
        im = im.convert("RGBA" if "A" in im.getbands() else "RGB")
    w, h = im.size
    if w < 8 or h < 8:
        raise HTTPException(status_code=400, detail=f"圖太小（{w}×{h}）。隨便一張正常照片即可，沒有畫素下限，但至少要看得出畫面。")
    max_side = 2048
    if max(w, h) > max_side:
        scale = max_side / max(w, h)
        im = im.resize((max(8, int(w * scale)), max(8, int(h * scale))), Image.Resampling.LANCZOS)
        w, h = im.size
    buf = io.BytesIO()
    im.save(buf, format="PNG")
    return buf.getvalue(), w, h


def _pose_gen_size(path: Path, default_w: int = 832, default_h: int = 1216) -> tuple[int, int]:
    """依參考圖長寬比挑 SDXL 桶，不要硬裁成 832×1216。"""
    try:
        from PIL import Image
        with Image.open(path) as im:
            w, h = im.size
    except Exception:
        return default_w, default_h
    if w <= 0 or h <= 0:
        return default_w, default_h
    long = 1216
    if h >= w:
        nh = long
        nw = int(round((long * w / h) / 64) * 64)
    else:
        nw = long
        nh = int(round((long * h / w) / 64) * 64)
    return min(1536, max(512, nw or 64)), min(1536, max(512, nh or 64))


def _save_pose_png(data: bytes) -> dict:
    if not data:
        raise HTTPException(status_code=400, detail="空檔")
    if len(data) > _POSE_MAX_BYTES:
        raise HTTPException(status_code=400, detail="圖太大（上限 15MB）")
    png, w, h = _normalize_pose_image(data)
    POSE_REF_DIR.mkdir(parents=True, exist_ok=True)
    name = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:6]}.png"
    (POSE_REF_DIR / name).write_bytes(png)
    return {
        "name": name,
        "url": f"/assets/pose_refs/{name}",
        "width": w,
        "height": h,
        "bytes": len(png),
    }


_PACK_IDX = re.compile(r"(?:^|[^0-9])([1-4])(?:[^0-9]|$)")


def _pack_index(name: str) -> int | None:
    """檔名裡獨立的 1～4。10.png 不算 1。"""
    stem = Path(name or "").name
    m = _PACK_IDX.search(stem)
    return int(m.group(1)) if m else None


def _pack_from_zip(data: bytes) -> list[tuple[int | None, str, bytes]]:
    out: list[tuple[int | None, str, bytes]] = []
    try:
        zf = zipfile.ZipFile(io.BytesIO(data))
    except zipfile.BadZipFile as e:
        raise HTTPException(status_code=400, detail="不是有效的 zip") from e
    for info in zf.infolist():
        if info.is_dir():
            continue
        raw_name = Path(info.filename.replace("\\", "/")).name
        if raw_name.startswith(".") or raw_name.startswith("._"):
            continue
        if "__macosx" in info.filename.lower():
            continue
        ext = Path(raw_name).suffix.lower()
        if ext not in _POSE_EXTS:
            continue
        blob = zf.read(info)
        out.append((_pack_index(raw_name), raw_name, blob))
    return out


def _number_pack_blobs(
    collected: list[tuple[int | None, str, bytes]],
) -> dict[int, tuple[str, bytes]]:
    numbered: dict[int, tuple[str, bytes]] = {}
    unnumbered: list[tuple[str, bytes]] = []
    for idx, fname, blob in collected:
        if idx in (1, 2, 3, 4):
            numbered[idx] = (fname, blob)
        else:
            unnumbered.append((fname, blob))
    empty = [i for i in (1, 2, 3, 4) if i not in numbered]
    if unnumbered and empty:
        unnumbered.sort(key=lambda x: x[0].lower())
        for i, item in zip(empty, unnumbered):
            numbered[i] = item
    if not numbered:
        raise HTTPException(
            status_code=400,
            detail="對不到 1～4。請把檔名寫成 1.png、2.png、3.png、4.png（或 zip 裡同樣編號）。",
        )
    return numbered


async def _collect_pack_uploads(files: list[UploadFile]) -> tuple[list[tuple[int | None, str, bytes]], str]:
    collected: list[tuple[int | None, str, bytes]] = []
    hint = ""
    for f in files:
        data = await f.read()
        fname = f.filename or "bone.png"
        if not hint:
            hint = Path(fname).stem
        if Path(fname).suffix.lower() == ".zip" or (len(files) == 1 and data[:2] == b"PK"):
            collected.extend(_pack_from_zip(data))
            if fname.lower().endswith(".zip"):
                hint = Path(fname).stem
            continue
        collected.append((_pack_index(fname), fname, data))
    if not collected:
        raise HTTPException(status_code=400, detail="包裡沒有圖片（要 png／jpg／webp，檔名含 1～4）")
    return collected, hint


def _frame_pack_load() -> list[dict]:
    if not FRAME_PACK_INDEX.is_file():
        return []
    try:
        data = json.loads(FRAME_PACK_INDEX.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return []
    packs = data.get("packs") if isinstance(data, dict) else data
    return [p for p in (packs or []) if isinstance(p, dict) and p.get("id")]


def _frame_pack_save(packs: list[dict]) -> None:
    FRAME_PACK_DIR.mkdir(parents=True, exist_ok=True)
    tmp = FRAME_PACK_INDEX.with_suffix(".json.tmp")
    tmp.write_text(
        json.dumps({"packs": packs}, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    tmp.replace(FRAME_PACK_INDEX)


FRAME_PACK_POSES = ("missionary", "doggy", "cowgirl_front")


def _norm_pack_pose(raw: str) -> str:
    p = (raw or "").strip()
    return p if p in FRAME_PACK_POSES else "missionary"


def _frame_pack_public(p: dict) -> dict:
    frames = p.get("frames") if isinstance(p.get("frames"), dict) else {}
    return {
        "id": p.get("id"),
        "name": p.get("name") or p.get("id"),
        "pose": _norm_pack_pose(p.get("pose")),
        "created": p.get("created") or 0,
        "frames": {str(i): frames.get(str(i)) for i in (1, 2, 3, 4) if frames.get(str(i))},
    }


@app.post("/api/pose-refs")
async def upload_pose_ref(file: UploadFile = File(...)):
    """姿勢／骨架參考圖。人設仍用人設＋立繪。"""
    data = await file.read()
    return _save_pose_png(data)


@app.post("/api/pose-refs/pack")
async def upload_pose_pack(files: list[UploadFile] = File(...)):
    """一次收四張骨架（檔名含 1～4）或一個 zip。回 frames[1..4]。不入組庫。"""
    if not files:
        raise HTTPException(status_code=400, detail="沒有檔")
    collected, _hint = await _collect_pack_uploads(files)
    numbered = _number_pack_blobs(collected)
    frames = {}
    for i, (fname, blob) in sorted(numbered.items()):
        saved = _save_pose_png(blob)
        saved["from"] = fname
        saved["index"] = i
        frames[str(i)] = saved
    return {
        "frames": frames,
        "got": sorted(int(k) for k in frames),
        "missing": [i for i in (1, 2, 3, 4) if str(i) not in frames],
    }


@app.get("/api/frame-packs")
def list_frame_packs(pose: str = ""):
    """圖組庫：很多組，每組四張（1～4）。pose 給值只回該體位。"""
    packs = [_frame_pack_public(p) for p in _frame_pack_load()]
    want = (pose or "").strip()
    if want:
        want = _norm_pack_pose(want) if want in FRAME_PACK_POSES else want
        packs = [p for p in packs if p.get("pose") == want]
    packs.sort(key=lambda p: p.get("created") or 0, reverse=True)
    return {"packs": packs}


@app.post("/api/frame-packs")
async def create_frame_pack(
    files: list[UploadFile] = File(...),
    name: str = Form(""),
    pose: str = Form(""),
):
    """新增一組：四張圖（檔名 1～4）或 zip。pose 綁體位。"""
    if not files:
        raise HTTPException(status_code=400, detail="沒有檔")
    collected, hint = await _collect_pack_uploads(files)
    numbered = _number_pack_blobs(collected)
    missing = [i for i in (1, 2, 3, 4) if i not in numbered]
    if missing:
        raise HTTPException(
            status_code=400,
            detail=f"這一組要四張。還缺第 { '、'.join(str(i) for i in missing) } 張。",
        )
    pid = uuid.uuid4().hex[:10]
    dest = FRAME_PACK_DIR / pid
    dest.mkdir(parents=True, exist_ok=True)
    frames: dict[str, dict] = {}
    for i in (1, 2, 3, 4):
        _fname, blob = numbered[i]
        png, w, h = _normalize_pose_image(blob)
        fname = f"{i}.png"
        (dest / fname).write_bytes(png)
        frames[str(i)] = {
            "url": f"/assets/frame_packs/{pid}/{fname}",
            "width": w,
            "height": h,
            "bytes": len(png),
            "index": i,
        }
    label = (name or "").strip() or hint or f"組 {pid[:6]}"
    pack = {
        "id": pid,
        "name": label[:40],
        "pose": _norm_pack_pose(pose),
        "created": time.time(),
        "frames": frames,
    }
    packs = _frame_pack_load()
    packs.append(pack)
    _frame_pack_save(packs)
    return {"pack": _frame_pack_public(pack)}


class FramePackPatch(BaseModel):
    name: str = ""
    pose: str = ""


@app.patch("/api/frame-packs/{pack_id}")
def rename_frame_pack(pack_id: str, body: FramePackPatch):
    pid = _safe_token(pack_id, 16)
    packs = _frame_pack_load()
    hit = next((p for p in packs if p.get("id") == pid), None)
    if not hit:
        raise HTTPException(status_code=404, detail="沒有這一組")
    label = (body.name or "").strip()
    if label:
        hit["name"] = label[:40]
    if (body.pose or "").strip():
        if body.pose.strip() not in FRAME_PACK_POSES:
            raise HTTPException(status_code=400, detail="未知體位")
        hit["pose"] = body.pose.strip()
    if not label and not (body.pose or "").strip():
        raise HTTPException(status_code=400, detail="名稱或體位要填一個")
    _frame_pack_save(packs)
    return {"pack": _frame_pack_public(hit)}


@app.delete("/api/frame-packs/{pack_id}")
def delete_frame_pack(pack_id: str):
    pid = _safe_token(pack_id, 16)
    packs = _frame_pack_load()
    keep = [p for p in packs if p.get("id") != pid]
    if len(keep) == len(packs):
        raise HTTPException(status_code=404, detail="沒有這一組")
    _frame_pack_save(keep)
    folder = FRAME_PACK_DIR / pid
    if folder.is_dir():
        shutil.rmtree(folder, ignore_errors=True)
    return {"ok": True}


@app.get("/api/pose-refs")
def list_pose_refs(limit: int = 16):
    POSE_REF_DIR.mkdir(parents=True, exist_ok=True)
    files = [
        p for p in POSE_REF_DIR.iterdir()
        if p.is_file() and p.suffix.lower() in _POSE_EXTS
    ]
    files.sort(key=lambda p: p.stat().st_mtime, reverse=True)
    out = []
    for p in files[: max(1, min(int(limit or 16), 40))]:
        out.append({
            "name": p.name,
            "url": f"/assets/pose_refs/{p.name}",
            "size": p.stat().st_size,
            "mtime": p.stat().st_mtime,
        })
    return {"items": out}


@app.delete("/api/pose-refs/{name}")
def delete_pose_ref(name: str):
    p = POSE_REF_DIR / Path(name).name
    if p.suffix.lower() not in _POSE_EXTS:
        raise HTTPException(status_code=400, detail="不是圖片")
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


def _character_visual_brief(ch: dict, framing: str = "") -> str:
    """生圖用 character sheet:一行 Danbooru tag,不塞中文、不塞英文句子。"""
    if not isinstance(ch, dict):
        return "1girl, adult"
    ch2 = dict(ch)
    worn = _outfit_of(ch2)
    if worn:
        ch2["_worn_outfit"] = worn
    en_brief, _unknown = sdtags.appearance_en_brief(
        ch2, stage=str(ch.get("stage") or ""), framing=framing,
    )
    return en_brief


_FRAME_MAP = {
    "half": "upper body",
    "full": "full body",
    "lower": "lower body, below waist",
}
_STYLE_MAP = {
    "anime": "anime",
    "realistic": "photorealistic",
    "pixel": "pixel art",
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
    ref_path: Path | None = None,
    pose_path: Path | None = None,
    scene_kind: str = "",
) -> str:
    """組給 Grok Build 的生圖指令。人物欄位以 character(完整 generateGirl 結果)為準。

    出卡場景層級（與 docs/card-system.md §12.3.1 對齊）：
      ① CHARACTER SHEET / 半身參考圖 = 身份固定（髮眼身服裝 + seed）
      ②+③ ACTION(extra) = 卡牌運鏡 visualEn + 回話後表情肢體（只改 pose，不改長相）
    pose_path = 姿勢／構圖參考（機位、體位、插入深度）；與身份 ref 分開。
    """
    framing = (framing or "half").lower()
    rating = (rating or "sfw").lower()
    style = (style or "anime").lower()
    frame_map, style_map, rating_map = _FRAME_MAP, _STYLE_MAP, _RATING_MAP
    ch = _fill_manual_fields(character, name, personality, backstory)
    brief = _character_visual_brief(ch, framing=framing)

    size_note = (
        "Output size MUST be exactly 256x256 pixels."
        if style == "pixel"
        else "High resolution illustration suitable for a game scene."
    )
    extra, extra_neg = sdtags.split_pos_neg_tags(extra)
    extra, extra_aside = sdtags.split_paren_aside(extra)
    extra_l = extra.lower()
    # 雙人／做愛／NTR 才走兩人構圖。對話卡 visualEn 的 NO groping 不算。
    multi_scene = sdtags.is_multi_scene(extra)
    pov = sdtags.is_pov_cam(extra)

    # 有姿勢參考 → image_edit 以那張為主構圖；立繪 ref 只鎖臉。
    # 沒有姿勢圖時：有立繪參考 → image_edit 鎖同一張臉；否則 image_gen + sheet
    if pose_path is not None:
        if ref_path is not None:
            id_lines = (
                f"SECONDARY image (her identity only):\n{ref_path}\n"
                "Replace the woman in the pose image with THIS character (face, hair, body).\n"
                "Do NOT copy the other woman's face from the pose image.\n"
            )
        else:
            id_lines = (
                "Redraw the woman as the CHARACTER SHEET person.\n"
                "Do NOT keep the other woman's face from the pose image.\n"
            )
        tool_note = (
            "You MUST use the image_edit tool.\n"
            f"PRIMARY image (composition — MANDATORY):\n{pose_path}\n"
            "This image locks camera, POV, body arrangement, and the general sexual position.\n"
            "Keep the same camera angle and the same position (oral / doggy / cowgirl).\n"
            f"{id_lines}"
            "ACTION tags still decide the exact beat: insertion depth, ejaculation, expression, clothes, hands.\n"
            "If ACTION says not yet inserted / glans entering / vaginal x-ray / cutaway / fully inserted / creampie, follow ACTION "
            "for that detail even if the pose image shows a different depth.\n"
            "Do NOT invent a different position or a third-person couple shot."
        )
    elif ref_path is not None and multi_scene and pov:
        tool_note = (
            f"You MUST use the image_edit tool with this reference image path:\n"
            f"{ref_path}\n"
            "This reference locks ONLY her face/hair/body identity.\n"
            "This is a FIRST-PERSON / player-POV scene: she is the subject; "
            "the man is only viewer hands / body at the camera edge, not a second full face.\n"
            "Obey ACTION tags exactly (groping, breast grab, fellatio, doggy, cowgirl, etc.).\n"
            "Do NOT generate a different woman."
        )
    elif ref_path is not None and multi_scene:
        tool_note = (
            f"You MUST use the image_edit tool with this reference image path:\n"
            f"{ref_path}\n"
            "This reference locks ONLY her face/hair/body identity.\n"
            "This is a TWO-PERSON scene (1man + 1girl). Draw BOTH people interacting.\n"
            "Camera MUST be third-person / side view / cinematic — NEVER first-person POV, "
            "NEVER viewer hands, NEVER portrait staring at camera only.\n"
            "Obey ACTION tags exactly (1man, 1girl, sex, fucking, groping, etc.).\n"
            "Do NOT generate a different woman; the man may be a generic adult male."
        )
    elif ref_path is not None:
        tool_note = (
            f"You MUST use the image_edit tool with this reference image path:\n"
            f"{ref_path}\n"
            "This reference is her portrait template (same face, hair, body, outfit).\n"
            "Edit lightly: keep identity; apply ACTION for expression (happy/shy/angry/etc.) "
            "and simple pose (standing/sitting/walking).\n"
            "Only if ACTION mentions male hands or special gaze (chest/thighs/looking away), "
            "add that change — otherwise keep looking at viewer like the portrait.\n"
            "Do NOT generate a different person."
        )
    elif style == "pixel":
        tool_note = (
            "Prefer image_gen. For exact 256x256 pixel art you may use code if image_gen cannot force size."
        )
    else:
        tool_note = "You MUST use the image_gen tool (do NOT draw with Python/code)."
    # 立繪／穿衣場面：就算遊戲設定是 nsfw，也不把「露胸」當預設。
    # 罩杯只描述衣服底下的輪廓；只有 ACTION 明確脫衣才放行。
    lewd_action = sdtags.is_nsfw_act(extra)
    keep_act = sdtags.keeps_stage_clothes(extra)
    level = sdtags.clothing_level(
        str((ch or {}).get("stage") or ""),
        nsfw_act=lewd_action and not keep_act,
        character=ch,
    )
    if level == "covered" and not lewd_action:
        rating = "sfw"
    else:
        rating = "nsfw"
    rating_txt = rating_map.get(rating, rating_map["sfw"])
    rating_line = f"- Content rating: {rating_txt}\n" if rating_txt else ""

    # extra 常帶出卡場面英文（visualEn + AI pose）；標成 ACTION，不覆蓋身份
    extra_block = ""
    script_mode = str(scene_kind or "").strip().lower() == "script"
    if extra_aside.strip():
        extra_block = f"""
=== MAIN PICTURE (tags outside parentheses) ===
{extra.strip() or "half-body portrait, looking at viewer"}
=== END MAIN ===
=== PARENTHETICAL (tags inside parentheses) ===
{extra_aside.strip()}
=== END PARENTHETICAL ===
The MAIN PICTURE is the large image: her half-body portrait, face and upper body, looking at viewer.
Draw the PARENTHETICAL tags ONLY inside one small rectangular inset in a corner.
Do not let the parenthetical become the whole picture. Do not turn the canvas into a from-behind / ass-focus shot.
Keep the large image as the portrait. The inset is a small extra panel only.
"""
    elif extra.strip():
        if script_mode:
            extra_block = f"""
=== ACTION / SCENE TO DRAW (MANDATORY — designer prompt, both positive tags) ===
{extra.strip()}
=== END ACTION ===
CRITICAL: ACTION is the picture. Draw that camera, those hands, that pose, that act.
Do NOT output a solo ID portrait looking at the viewer unless ACTION says so.
CHARACTER SHEET is identity only (face, hair, body, clothes). Do not ignore ACTION.
"""
        elif multi_scene and pov:
            extra_block = f"""
=== ACTION / SCENE TO DRAW (MANDATORY — first-person player POV) ===
{extra.strip()}
=== END ACTION ===
CRITICAL COMPOSITION RULES:
- Camera is FIRST-PERSON / from his POV. She is the subject filling the frame.
- Draw viewer hands / male hands / his body at the camera edge as ACTION says.
- Do NOT draw a second man's face looking at the camera. Do NOT make it a solo portrait.
- If ACTION contains groping / breast grab / ass grab / thigh → his hands on that body part.
- If ACTION contains fellatio / oral / blowjob / penis at lips / cum in mouth:
  this is a HALF-BODY close-up, penis in the foreground.
  Do NOT force her to look up or look at the viewer / camera; let the oral pose decide her head.
  Keep her clothes unless ACTION says nude; only a wife-level nude beat should be fully naked.
  Hands in the oral beat belong to HER, not the player, unless ACTION says male hand on her head.
  covering own eyes / covering own face → one of HER own hands over her own eyes or her own face (either is fine); not his hand.
  holding the penis → one of HER own hands wrapped around the shaft.
  Follow the exact beat in ACTION — do not collapse all oral beats into the same pose:
  * tip / glans against lips / about to start / hand on her head → penis tip touching her lips, NOT inside the mouth; one male hand pressing her head down.
  * penis in mouth / sucking / blowjob (and NOT deepthroat, NOT cum) → lips around the shaft, performing oral, not swallowing the whole length.
  * deepthroat / entire penis / irrumatio → the whole penis is inside her mouth, nose against his body.
  * cum in mouth / oral creampie / ejaculation in mouth → he ejaculates into her mouth; semen visible in/around her mouth.
- If ACTION contains doggy / from behind / grabbing her buttocks with an erect penis:
  this is a FROM-BEHIND / first-person shot. Keep the same camera across doggy beats. Do not add girl on all fours — doggy style already covers the pose.
  Keep her clothes unless ACTION says nude; only a wife-level nude beat should be fully naked.
  Tags prefixed girl belong to the woman (face, hands, clothes). Tags prefixed male belong to the man.
  Do NOT add girl looking at viewer / camera / player. Do NOT add girl looking back.
  Never have her look at the camera or over her shoulder at the player.
  girl head up / girl looking up → her chin up, not looking at the camera.
  girl head down / girl looking down → her face toward the floor or bed, not looking at the camera.
  Girl hand tags are short (not sentences). Follow ACTION:
    girl hand grabbing male hand → one girl hand on his hand (resistance).
    girl other hand reaching back / girl hand gripping male arm → her other hand reaches back and grabs his arm.
    girl hands on bed / girl hands supporting → both girl hands on the bed or floor.
  Male hands stay on her ass / hips as ACTION says.
  Follow the exact beat in ACTION — do not collapse all doggy beats into the same insertion depth:
  * grabbing buttocks / erect penis / against her pussy / about to penetrate / not yet inserted →
    both male hands gripping her ass; a fully erect penis visible against her vulva or between her buttocks; NOT inside.
  * glans entering / only the glans inserted / glans wrapped by labia / labia enveloping the glans / long penis / very long penis / half of the penis still outside → only the glans is inside; labia wrap and envelop the glans; the penis is long, very long; half of it still remains outside; NOT fully inserted.
  * girl open mouth / buttocks slamming / ass impacting / body shaking / vaginal x-ray / cutaway / cross-section / internal view → her mouth is open; her buttocks slam / impact his groin; her body is shaking; show a vaginal x-ray / cutaway of internal penetration.
  * first-person POV / glans / glans inside girl vagina / glans at vaginal opening / long vagina / deep vagina / long vaginal canal / vaginal x-ray / cutaway →
    first-person POV; use glans tags only, do not add penis/shaft tags; the vagina is long; the glans does NOT hit the uterus or cervix; show a vaginal x-ray.
  * hitting cervix / glans hitting uterus / buttocks slamming →
    hitting the cervix / uterus; do not add penis/shaft tags; show a vaginal x-ray if ACTION has x-ray.
  * creampie / cum inside / internal ejaculation / orgasm creampie →
    he climaxes inside her; semen overflows around the shaft and from her pussy.
- If ACTION contains cowgirl / girl on top / straddling:
  this is a FIRST-PERSON shot from below. She straddles him, girl on top. Keep the same camera across cowgirl beats.
  Keep her clothes unless ACTION says nude; only a wife-level nude beat should be fully naked.
  Tags prefixed girl belong to the woman. Tags prefixed male belong to the man.
  Do NOT add girl looking at viewer / camera / player. Do NOT add girl looking back.
  Never have her look at the camera. girl head up → chin up; girl head down → face toward his body or the bed.
  Girl hand tags are short. Follow ACTION:
    girl hand grabbing male hand → one girl hand on his hand (resistance).
    girl other hand on male chest / girl hand pushing male chest → her other hand on his chest.
    girl hands on male chest / girl hands supporting → both girl hands on his chest or the bed.
  Male hands stay on her hips / waist as ACTION says.
  Follow the exact beat — do not collapse all cowgirl beats into the same insertion depth:
  * about to penetrate / still outside / awaiting insertion →
    she hovers over him; erect penis against her vulva; NOT inside.
  * glans entering / only the glans inserted / glans wrapped by labia / labia enveloping the glans / long penis / very long penis / half of the penis still outside → she has lowered just enough that only the glans is inside; labia wrap and envelop the glans; the penis is long, very long; half of it still remains outside; NOT fully seated.
  * girl open mouth / labia pressed tightly against male abdomen / male pubic hair / vaginal x-ray / cutaway / cross-section / internal view → her mouth is open; her labia are pressed tightly against his abdomen; male pubic hair is visible; show a vaginal x-ray / cutaway of internal penetration.
  * first-person POV / glans / glans inside girl vagina / glans at vaginal opening / long vagina / deep vagina / long vaginal canal / vaginal x-ray / cutaway →
    first-person POV from below; use glans tags only, do not add penis/shaft tags; the vagina is long; the glans does NOT hit the uterus or cervix; show a vaginal x-ray.
  * hitting cervix / glans hitting uterus / labia pressed tightly against male abdomen →
    hitting the cervix / uterus; do not add penis/shaft tags; show a vaginal x-ray if ACTION has x-ray.
  * creampie / cum inside / internal ejaculation → he climaxes inside her; semen overflows around the shaft.
- If ACTION contains sex / fucking / vaginal / penetration → draw intercourse, unless the beat above says not yet inserted.
Do NOT change her hair, eyes, body type, or outfit identity unless ACTION undresses her.
"""
        elif multi_scene:
            extra_block = f"""
=== ACTION / SCENE TO DRAW (MANDATORY — two-person NTR/interaction beat) ===
{extra.strip()}
=== END ACTION ===
CRITICAL COMPOSITION RULES:
- Tags 1man + 1girl mean BOTH people must be visible and interacting.
- Third-person camera only. NO first-person. NO from-his-POV. NO viewer hands in foreground.
- The woman uses CHARACTER SHEET / reference face. The man is a second character in frame.
- If ACTION contains sex / fucking / vaginal / penetration → draw intercourse between them.
- If ACTION contains groping / molestation / breast grab → draw him groping her body.
- If ACTION is clothed talking/walking → fully clothed couple interaction.
- Do NOT output a solo portrait of only her looking at the camera.
Do NOT change her hair, eyes, body type, or outfit identity unless ACTION undresses her.
"""
        else:
            extra_block = f"""
=== ACTION / SCENE TO DRAW (pose, camera, interaction — do NOT change identity) ===
{extra.strip()}
=== END ACTION ===
Draw the SAME woman from the CHARACTER SHEET{(' / reference image' if ref_path is not None else '')}.
EDIT RULES (portrait template base):
- Start from the reference portrait look (same face, hair, outfit).
- Apply ACTION: simple expression tags (happy/shy/angry/crying/etc.) and pose (standing/sitting/walking).
- Keep looking at viewer UNLESS ACTION says looking away / looking at screen / scenery / special gaze.
- Add male hands / first-person hands ONLY if ACTION mentions them.
- Special gaze (chest/thighs/away) ONLY if ACTION mentions them.
- Do NOT invent complex new camera blocking; light edit of the portrait is preferred.
Do NOT change hair, eyes, body type, or outfit identity.
"""

    pose_block = ""
    if pose_path is not None:
        pose_block = f"""
=== POSE / COMPOSITION REFERENCE (PRIMARY — not her identity) ===
File: {pose_path}
Copy camera, POV, body arrangement, and sexual position from this image.
Do NOT copy the other woman's face, hair, or body type.
The woman in the output MUST match CHARACTER SHEET{(' / identity reference' if ref_path is not None else '')}.
=== END POSE REFERENCE ===
"""

    ref_block = ""
    if ref_path is not None:
        if pose_path is not None:
            ref_block = f"""
=== IDENTITY REFERENCE (FACE / HAIR / BODY ONLY) ===
File: {ref_path}
Use this only for her face/hair/body match. Keep the pose image's camera and position.
=== END REFERENCE ===
"""
        elif script_mode:
            ref_block = f"""
=== IDENTITY REFERENCE (FACE / HAIR / BODY ONLY) ===
File: {ref_path}
Use this only for her face/hair/body. Composition MUST follow ACTION, not this portrait's pose.
=== END REFERENCE ===
"""
        elif multi_scene and pov:
            ref_block = f"""
=== REFERENCE PORTRAIT (HER IDENTITY ONLY — not the final composition) ===
File: {ref_path}
Use this only for her face/hair/body match. Final image MUST be the ACTION scene
(first-person player POV, she as subject), not a copy of this solo portrait pose.
=== END REFERENCE ===
"""
        elif multi_scene:
            ref_block = f"""
=== REFERENCE PORTRAIT (HER IDENTITY ONLY — not the final composition) ===
File: {ref_path}
Use this only for her face/hair/body match. Final image MUST show the full ACTION scene
(1man + 1girl interaction, third-person), not a copy of this solo portrait pose.
=== END REFERENCE ===
"""
        else:
            ref_block = f"""
=== REFERENCE PORTRAIT (SAME PERSON — identity lock) ===
File: {ref_path}
Match this face and identity only. Do NOT copy the portrait's square facing-camera pose if ACTION
describes a different angle (side seat, walking beside, looking at window, etc.).
=== END REFERENCE ===
"""

    do_not = ""
    if extra_neg:
        do_not = f"""
=== DO NOT DRAW (negative — not in the picture) ===
{extra_neg}
=== END DO NOT DRAW ===
"""

    tool_name = "image_edit" if (pose_path is not None or ref_path is not None) else "image_gen"
    return f"""Generate ONE image. Use {tool_name}. Save to:
{out_path}

Tags (identity — do not write Chinese, do not write sentences):
{brief}, {frame_map.get(framing, frame_map["half"])}, {style_map.get(style, style_map["anime"])}

{tool_note}
{pose_block}{ref_block}{extra_block}{do_not}{rating_line}{size_note}
No text overlay, no watermark.
{"1man and 1girl both visible." if multi_scene else ""}
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
    """把前端傳來的 /assets/… 換成本機絕對路徑。

    認 portraits（立繪鎖臉）、testword（分段第二輪／實驗圖）、pose_refs（姿勢構圖）。
    只取 basename，擋路徑穿越。URL 有目錄前綴時只在那個目錄找。
    """
    ref = (ref or "").strip()
    if not ref:
        return None
    u = ref.split("?", 1)[0].split("#", 1)[0]
    if u.startswith("/assets/frame_packs/"):
        rel = u[len("/assets/frame_packs/"):]
        parts = Path(rel).parts
        if (
            len(parts) == 2
            and re.fullmatch(r"[A-Za-z0-9_-]+", parts[0] or "")
            and Path(parts[1]).suffix.lower() in _POSE_EXTS
            and parts[1] not in (".", "..")
        ):
            p = FRAME_PACK_DIR / parts[0] / parts[1]
            return p if p.is_file() and p.stat().st_size > 0 else None
        return None
    name = Path(u).name
    if not name or name in (".", "..") or "/" in name or "\\" in name:
        return None
    hinted = (
        (POSE_REF_DIR, "/assets/pose_refs/"),
        (PORTRAIT_DIR, "/assets/portraits/"),
        (IMG_TEST_DIR, "/assets/testword/"),
        (FRAME_PACK_DIR, "/assets/frame_packs/"),
    )
    for base, prefix in hinted:
        if u.startswith(prefix):
            p = base / name
            return p if p.is_file() and p.stat().st_size > 0 else None
    for base, _ in hinted:
        p = base / name
        if p.is_file() and p.stat().st_size > 0:
            return p
    return None


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
    if isinstance(pick, str):
        kind = pick[:1]
        try:
            i = int(pick[1:] or 0)
        except ValueError:
            i = -1
        extras = look.get("eroticOutfits") if kind == "e" else (
            look.get("sleepOutfits") if kind == "s" else None
        )
        if isinstance(extras, list) and 0 <= i < len(extras):
            return str(extras[i] or "")
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
        "bust": look.get("bust") or "、".join(x for x in (look.get("cup"), look.get("breast_shape")) if x),
        "cup": look.get("cup") or "",
        "breast_shape": look.get("breast_shape") or "",
        "areola": look.get("areola") or "",
        "nipple": look.get("nipple") or "",
        "labia_size": look.get("labia_size") or "",
        "clitoris_size": look.get("clitoris_size") or "",
        "labia_color": look.get("labia_color") or "",
        "pubic_hair": look.get("pubic_hair") or "",
        "eye_color": look.get("eye_color") or "",
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
        # 臉分五軸(臉型/眼/嘴/髮型/髮色)+瞳色:只寫「大眼睛、長直髮」時每張臉都不一樣
        bits = [a["face"], a["eyes"], a.get("eye_color") or "", a["mouth"],
                "、".join(x for x in (a["hair_color"], a["hair"]) if x), a["feature"]]
        # 表情用原型(「傲嬌」「活潑開朗」這種短詞)。tone 是講說話方式的整句話,
        # 塞進生圖 prompt 只是雜訊——畫圖看不見她愛加「呢」「呀」。
        pers = ch.get("personality") or []
        mood = ch.get("archetype") or (pers[0] if isinstance(pers, list) and pers else "")
        if mood:
            bits.append(f"表情{mood}")
        return "、".join(x for x in bits if x), "臉部特寫,髮頂到鎖骨"
    if seg == "bust":
        bust = sdtags.clothed_bust_zh(a["bust"]) if dressed else a["bust"]
        bits = [bust, a["build"], a["skin"]]
        if not dressed:
            bits.insert(1, a.get("areola") or "")
            bits.insert(2, a.get("nipple") or "")
        if dressed and a["outfit"]:
            bits.append(f"{a['outfit']}的上半身"
                        + ("" if a["outfit_career"] else f",{a['palette']}"))
            bits.append("衣服穿好、胸部被衣服完全蓋住")
        return "、".join(x for x in bits if x), "下巴到腰,不畫臉"
    bits = [a["build"], f"{a['height_cm']}cm" if a["height_cm"] else "", a["skin"]]
    if not dressed:
        bits += [a.get("labia_size") or "", a.get("clitoris_size") or "", a.get("labia_color") or "", a.get("pubic_hair") or ""]
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
    """一段生圖 = Danbooru tag 一行。中文池子字串先查表再送,不寫英文句子。"""
    part = (part or "bust0").lower()
    if part not in IMG_PARTS:
        part = "bust0"
    dressed = part in IMG_SEG_PARTS
    ch = _fill_manual_fields(character, name, personality, backstory)
    worn = _outfit_of(ch)
    if worn:
        ch["_worn_outfit"] = worn
    tags, _unknown = sdtags.part_tag_line(ch, part, dressed=dressed, art_style=style)
    if extra.strip():
        extra_pos, _neg = sdtags.split_pos_neg_tags(extra)
        if extra_pos:
            tags = sdtags.flatten_tags(tags, extra_pos)
    return tags


def _wrap_part_prompt(body: str, *, out_path: Path, ref_path: Path | None = None) -> str:
    """把可編輯的 body 包成真正送出去的 prompt:前面補存檔路徑,後面補參考圖。"""
    lines = ["用 image_gen 產一張圖,存成:" + str(out_path), "", body.strip()]
    if ref_path is not None:
        lines.append(f"參考 {ref_path}:同一個人,臉、膚色、身形照這張,把衣服畫上去")
    return "\n".join(lines) + "\n"


def _is_oral_strip(pos: str) -> bool:
    el = (pos or "").lower()
    return any(k in el for k in ("fellatio", "oral", "deepthroat", "girl mouth", "glans against girl lips"))


def _merge_oral_identity(body: str, character: dict | None) -> str:
    """口交特寫把人設臉／髮／嘴疊進 prompt。已有的 tag flatten 去重。"""
    if not character or not isinstance(character, dict):
        return body
    pos, neg = sdtags.split_pos_neg_tags(body)
    if not _is_oral_strip(pos):
        return body
    ident, _ = sdtags.appearance_en_head(character)
    merged = sdtags.flatten_tags(ident, pos)
    if neg:
        return merged + ", NO " + neg.replace(",", ", NO ")
    return merged


def _sex_strip_camera(pos: str) -> str:
    """口交看嘴與臉；性器特寫不畫陰莖；其餘是腹部交合特寫。"""
    el = (pos or "").lower()
    if _is_oral_strip(pos):
        return "Single camera: close-up of mouth and penis. Her face and lips in frame."
    has_pussy = any(k in el for k in ("pussy", "labia", "vulva", "clitoris"))
    has_penis = any(k in el for k in ("penis", "glans", "shaft"))
    if has_pussy and not has_penis:
        return "Single camera: close-up of vulva and labia. Faces out of frame. No penis."
    return "Single camera: close-up of both abdomens, focusing on penis and labia. Faces out of frame."


def _wrap_sex_strip_prompt(
    body: str, *, out_path: Path, style: str = "anime", extra_neg: str = "",
    pose_path: Path | None = None,
) -> str:
    """做愛局部單幀。口交的人設臉／髮已由 _merge_oral_identity 疊進 body。"""
    style_txt = _STYLE_MAP.get((style or "anime").lower(), _STYLE_MAP["anime"])
    pos, from_en = sdtags.split_pos_neg_tags(body)
    neg = ", ".join(x for x in (from_en, extra_neg) if x)
    do_not = f"\nDo NOT draw: {neg}\n" if neg else ""
    if pose_path is not None:
        return f"""Generate ONE image. Use image_edit. Save to:
{out_path}

You MUST use the image_edit tool.
PRIMARY image (skeleton / paint sketch — composition lock):
{pose_path}

Keep the same camera, crop, and body arrangement as this sketch.
This is a stick-figure / MS Paint skeleton: follow the lines for pose and insertion depth.
Paint a finished illustration over it. Do NOT leave the stick figure or pencil lines visible.
Solid black background. No text, no numbers, no captions, no watermarks.

Draw this (tags, not Chinese, not sentences):
{pos}

Style: {style_txt}
High resolution.{do_not}
"""
    cam = _sex_strip_camera(pos)
    return f"""Generate ONE image. Use image_gen. Save to:
{out_path}

You MUST use the image_gen tool (do NOT draw with Python/code).
Use aspect_ratio "3:2" (wide close-up).

This is one still from a 4-frame sex animation, not a comic, not a sprite sheet.
{cam}
Solid black background. No text, no numbers, no captions, no watermarks, no extra panels.

Draw this (tags, not Chinese, not sentences):
{pos}

Style: {style_txt}
High resolution.{do_not}
"""


def _stage_ref_in_work(src: Path | None, work: Path, stem: str) -> Path | None:
    """把參考圖拷進 grok 工作目錄,沙箱比較找得到。"""
    if src is None or not src.is_file() or src.stat().st_size <= 0:
        return None
    ext = src.suffix.lower() if src.suffix.lower() in _POSE_EXTS else ".png"
    dest = work / f"{stem}{ext}"
    try:
        dest.write_bytes(src.read_bytes())
    except OSError:
        return src
    return dest


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
    pose_ref: str = "",
    prompt_body: str = "",
    do_cutout: bool = False,
    char_id: str = "",
    shot: str = "",
    card_id: str = "",
    scene_kind: str = "",
) -> tuple[str, str | None]:
    """Grok Build + image_gen。成功回 (url_path, None)。
    part 給值(head0/bust0/lower0 或 head/bust/lower)= 只畫那一段;留空 = 舊行為的整張圖。
    ref = 第一輪同段那張的 /assets/testword/… URL,第二輪拿它當參考圖。
    pose_ref = 姿勢／構圖／骨架參考圖。
    do_cutout=True：半身／立繪去背（平背景 + cutout）。
    有 char_id+shot／card_id 時落到 portraits（覆寫）；否則 testword 實驗圖。"""
    part = (part or "").lower()
    dest_opts = {
        "shot": shot, "char_id": char_id, "card_id": card_id,
        "scene_kind": scene_kind, "part": part,
    }
    out_dir, url_dir, fname = _dest_for_image(dest_opts)
    abs_out = out_dir / fname
    # 工作目錄放空沙箱,產圖後搬到 assets
    work = GROK_CWD / f"img-{uuid.uuid4().hex[:12]}"
    work.mkdir(parents=True, exist_ok=True)
    # 讓 agent 先寫進 work,再 copy 到 abs_out(路徑寫死在 prompt)
    target = abs_out  # absolute path in prompt
    shot_l = (shot or "").strip().lower()
    use_pose = bool(pose_ref) and (
        not shot_l
        or comfy.is_tease_shot(shot_l)
        or str(scene_kind or "").lower() == "sex_strip"
    )
    id_local = _stage_ref_in_work(_resolve_ref_image(ref), work, "identity")
    pose_local = _stage_ref_in_work(
        _resolve_ref_image(pose_ref) if use_pose else None, work, "pose"
    )
    staged = {p.resolve() for p in (id_local, pose_local) if p is not None}
    # 去背：extra 補平背景提示
    extra_use = (extra or "").strip()
    if do_cutout and "simple background" not in extra_use.lower():
        extra_use = (extra_use + ", plain solid color background, simple background, no scenery").strip(", ")
    if part in IMG_PARTS:
        # prompt_body 有值 = 使用者在 testword 改過的版本,原樣送出(只補存檔路徑/參考圖)
        body = prompt_body.strip() or _seg_prompt_body(
            part=part, rating=rating, style=style,
            character=character,
            name=name, personality=personality, backstory=backstory, extra=extra_use,
        )
        prompt = _wrap_part_prompt(body, out_path=target, ref_path=id_local)
    elif str(scene_kind or "").lower() == "sex_strip":
        body = prompt_body.strip() or extra_use
        if not body:
            return "", "做愛局部動畫要有 prompt"
        body = _merge_oral_identity(body, character)
        _, extra_neg = sdtags.split_pos_neg_tags(extra_use)
        prompt = _wrap_sex_strip_prompt(
            body, out_path=target, style=style, extra_neg=extra_neg,
            pose_path=pose_local,
        )
    else:
        # 出卡場景：可帶半身立繪 ref 鎖同一張臉；tease 可再帶姿勢圖鎖構圖
        prompt = _build_girl_image_prompt(
            framing=framing, rating=rating, style=style,
            character=character,
            name=name, personality=personality, backstory=backstory, extra=extra_use,
            out_path=target,
            ref_path=id_local,
            pose_path=pose_local,
            scene_kind=scene_kind,
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
            if p.is_file()
            and p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
            and p.resolve() not in staged
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
        if do_cutout and cutout.AVAILABLE:
            try:
                changed, why = await asyncio.to_thread(
                    cutout.cut_background, found,
                    cutout.TOLERANCE, float(cutout.BORDER_MIN), cutout.DILATE)
                _note_cut(found.name, changed, why)
            except Exception as e:
                _note_cut(found.name, False, f"cutout err:{e}")
        ver = f"?v={int(time.time())}" if out_dir == PORTRAIT_DIR else ""
        return f"{url_dir}/{fname}{ver}", None
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
    """把 /assets/xxx/yyy.png 換成本機路徑。認 portraits / testword / pose_refs,
    取 basename 擋路徑穿越。"""
    u = (url or "").strip().split("?")[0].split("#")[0]
    if u.startswith("/assets/frame_packs/"):
        return _resolve_ref_image(u)
    for prefix, base in (
        ("/assets/portraits/", PORTRAIT_DIR),
        ("/assets/testword/", IMG_TEST_DIR),
        ("/assets/pose_refs/", POSE_REF_DIR),
    ):
        if u.startswith(prefix):
            p = base / Path(u).name
            return p if p.is_file() else None
    return None


def _safe_token(s, n: int = 40) -> str:
    return re.sub(r"[^A-Za-z0-9_-]", "", str(s or ""))[:n]


def _dest_for_image(opts: dict) -> tuple[Path, str, str]:
    """生圖落地。(out_dir, url_prefix, fname)

    - shot + char_id → portraits/{id}_{shot}.png（覆寫）
    - char_id + card_id／scene_kind → portraits/{id}_card_{tag}.png（覆寫）
    - 其餘（testword 實驗）→ testword/{stamp}.png（每次新檔）
    """
    shot = str(opts.get("shot") or "").lower()
    char_id = _safe_token(opts.get("char_id"), 40)
    card_id = _safe_token(opts.get("card_id"), 48)
    scene_kind = str(opts.get("scene_kind") or "").strip().lower()
    part = str(opts.get("part") or "").lower()
    if shot in comfy.PORTRAIT_SHOTS and char_id:
        PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
        return PORTRAIT_DIR, "/assets/portraits", f"{char_id}_{shot}.png"
    if char_id and (card_id or scene_kind in ("card", "watch", "scene")):
        PORTRAIT_DIR.mkdir(parents=True, exist_ok=True)
        tag = card_id or scene_kind or "scene"
        return PORTRAIT_DIR, "/assets/portraits", f"{char_id}_card_{tag}.png"
    IMG_TEST_DIR.mkdir(parents=True, exist_ok=True)
    stamp = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
    fname = f"{stamp}_{part}.png" if part in IMG_PARTS else f"{stamp}.png"
    return IMG_TEST_DIR, "/assets/testword", fname


def _portrait_owner(stem: str) -> str:
    """檔名 stem → 角色 id。{id}_half / {id}_card_{cardId}。"""
    s = str(stem or "")
    if "_card_" in s:
        return s.split("_card_", 1)[0]
    low = s.lower()
    for suf in _SHOT_FILE_SUFS:
        tail = "_" + suf
        if low.endswith(tail):
            return s[: -len(tail)]
    return s


def _dir_stats(d: Path) -> dict:
    n, b = 0, 0
    if d.is_dir():
        for p in d.iterdir():
            if p.is_file():
                n += 1
                try:
                    b += p.stat().st_size
                except OSError:
                    pass
    return {"count": n, "bytes": b}


def _unlink_files(paths) -> tuple[int, int]:
    n, b = 0, 0
    for p in paths:
        try:
            if not p.is_file():
                continue
            sz = p.stat().st_size
            p.unlink()
            n += 1
            b += sz
        except OSError:
            pass
    return n, b


def _live_ids_from_save() -> set[str]:
    ids: set[str] = set()
    try:
        with db() as conn:
            row = conn.execute("SELECT data FROM save WHERE id = 1").fetchone()
        if not row:
            return ids
        data = json.loads(row[0])
        for s in (data.get("succubi") or []):
            if isinstance(s, dict):
                tid = _safe_token(s.get("id"), 40)
                if tid:
                    ids.add(tid)
    except Exception:
        pass
    return ids


def _keep_urls_from_save() -> set[str]:
    names: set[str] = set()
    try:
        with db() as conn:
            row = conn.execute("SELECT data FROM save WHERE id = 1").fetchone()
        if not row:
            return names
        data = json.loads(row[0])
        girls = list(data.get("succubi") or [])
        snap = (data.get("cardSession") or {}).get("girlSnap")
        if isinstance(snap, dict):
            girls.append(snap)
        for s in girls:
            if not isinstance(s, dict):
                continue
            if s.get("portrait"):
                p = _asset_path(str(s.get("portrait")))
                if p:
                    names.add(p.name)
            for u in (s.get("portraits") or {}).values():
                p = _asset_path(str(u or ""))
                if p:
                    names.add(p.name)
            for v in (s.get("cardCg") or {}).values():
                if isinstance(v, dict) and v.get("url"):
                    p = _asset_path(str(v.get("url")))
                    if p:
                        names.add(p.name)
        chain = (data.get("cardSession") or {}).get("sceneChainUrl")
        p = _asset_path(str(chain or ""))
        if p:
            names.add(p.name)
    except Exception:
        pass
    return names


class PurgeGirlIn(BaseModel):
    char_id: str
    urls: list[str] = []


class AssetGcIn(BaseModel):
    keep_ids: list[str] = []
    keep_urls: list[str] = []
    prune_testword: bool = True
    keep_testword_recent: int = 48
    prune_grok_cwd: bool = True


@app.get("/api/assets/stats")
def asset_stats():
    """磁碟上的生成圖用量（立繪 / testword 實驗 / grok 工作目錄）。"""
    cwd_n, cwd_b = 0, 0
    if GROK_CWD.is_dir():
        for p in GROK_CWD.rglob("*"):
            if p.is_file():
                cwd_n += 1
                try:
                    cwd_b += p.stat().st_size
                except OSError:
                    pass
    return {
        "portraits": _dir_stats(PORTRAIT_DIR),
        "testword": _dir_stats(IMG_TEST_DIR),
        "pose_refs": _dir_stats(POSE_REF_DIR),
        "grok_cwd": {"count": cwd_n, "bytes": cwd_b},
        "live_ids": sorted(_live_ids_from_save()),
    }


@app.post("/api/assets/purge-girl")
def purge_girl_assets(body: PurgeGirlIn):
    """妹子離開名冊：刪她的立繪三連拍、出卡覆寫檔、以及仍指到 testword 的舊 URL。"""
    cid = _safe_token(body.char_id, 40)
    if not cid:
        raise HTTPException(400, "需要 char_id")
    doomed: list[Path] = []
    if PORTRAIT_DIR.is_dir():
        for p in PORTRAIT_DIR.iterdir():
            if p.is_file() and _portrait_owner(p.stem) == cid:
                doomed.append(p)
    for u in body.urls or []:
        p = _asset_path(u)
        if p and p not in doomed:
            doomed.append(p)
    n, b = _unlink_files(doomed)
    return {"ok": True, "char_id": cid, "deleted": n, "bytes": b}


@app.post("/api/assets/gc")
def assets_gc(body: AssetGcIn):
    """清孤兒圖：名冊裡沒有的妹子立繪、沒人引用的出卡圖、過舊的 testword 實驗圖。"""
    keep_ids = {_safe_token(x, 40) for x in (body.keep_ids or []) if _safe_token(x, 40)}
    keep_ids |= _live_ids_from_save()
    keep_names = set(_keep_urls_from_save())
    for u in body.keep_urls or []:
        p = _asset_path(u)
        if p:
            keep_names.add(p.name)

    doomed: list[Path] = []
    if PORTRAIT_DIR.is_dir():
        for p in PORTRAIT_DIR.iterdir():
            if not p.is_file():
                continue
            owner = _portrait_owner(p.stem)
            if owner in _ASSET_KEEP_PREFIXES:
                continue
            if p.name in keep_names:
                continue
            if owner not in keep_ids:
                doomed.append(p)

    testword_pruned = 0
    if body.prune_testword and IMG_TEST_DIR.is_dir():
        tw = [
            p for p in IMG_TEST_DIR.iterdir()
            if p.is_file() and p.suffix.lower() in (".png", ".jpg", ".jpeg", ".webp")
        ]
        tw.sort(key=lambda p: p.stat().st_mtime, reverse=True)
        keep_n = max(0, int(body.keep_testword_recent or 0))
        recent = {p.name for p in tw[:keep_n]}
        for p in tw:
            if p.name in keep_names or p.name in recent:
                continue
            doomed.append(p)
            testword_pruned += 1

    n, b = _unlink_files(doomed)

    cwd_n, cwd_b = 0, 0
    if body.prune_grok_cwd and GROK_CWD.is_dir():
        cutoff = time.time() - 3600
        for child in list(GROK_CWD.iterdir()):
            try:
                if not child.is_dir():
                    continue
                mt = child.stat().st_mtime
                if mt > cutoff:
                    continue
                sz = sum(f.stat().st_size for f in child.rglob("*") if f.is_file())
                shutil.rmtree(child, ignore_errors=True)
                cwd_n += 1
                cwd_b += sz
            except OSError:
                pass

    return {
        "ok": True,
        "deleted": n,
        "bytes": b,
        "testwordPruned": testword_pruned,
        "grokCwdRemoved": cwd_n,
        "grokCwdBytes": cwd_b,
        "keptIds": len(keep_ids),
        "after": {
            "portraits": _dir_stats(PORTRAIT_DIR),
            "testword": _dir_stats(IMG_TEST_DIR),
        },
    }


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


def _portrait_shot_from_stem(stem: str) -> str:
    """檔名 stem → shot 鍵。支援 half_xi 等（不可只 rsplit 最後一段，會變成 xi）。"""
    s = (stem or "").lower()
    for k in _SHOT_FILE_SUFS:
        if s.endswith("_" + k) or s == k:
            return k
    return s.rsplit("_", 1)[-1] if "_" in s else s


@app.post("/api/cutout")
async def cutout_run(body: CutIn):
    """對已存在的圖重跑去背。回 {changed, why}。"""
    p = _asset_path(body.url)
    if p is None:
        raise HTTPException(404, "找不到這張圖(只認 /assets/portraits/ 與 /assets/testword/)")
    shot_key = _portrait_shot_from_stem(p.stem)
    bmin = body.border_min or (
        comfy.PORTRAIT_SHOTS.get(shot_key, {}).get("border_min")
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
    同一個人設不管走哪條路都推出同一組,兩邊的圖才是同一個人。

    出卡場景：identity tags 在前、extra（visualEn + AI 動作）在後；
    scene=True 時去掉 solo / looking at viewer，才畫得出互動。
    """
    ch = opts.get("character") if isinstance(opts.get("character"), dict) else None
    extra_pos, extra_from_en = sdtags.split_pos_neg_tags(str(opts.get("extra") or ""))
    if extra_pos:
        opts = {**opts, "extra": extra_pos}
    if extra_from_en and not str(opts.get("visual_neg") or "").strip():
        opts = {**opts, "visual_neg": extra_from_en}
    elif extra_from_en:
        opts = {**opts, "visual_neg": ", ".join(x for x in (opts.get("visual_neg"), extra_from_en) if x)}
    anchor = _identity_anchor(ch or {})
    part = str(opts.get("part") or "").lower()
    # 三連拍的 shot 直接就是取景(head/half/full),蓋掉 framing
    shot = str(opts.get("shot") or "").lower()
    # half_xi 等情緒半身用 half 取景；感應調戲看前端 framing（half／full／lower）
    if comfy.is_tease_shot(shot):
        fr = str(opts.get("framing") or "half")
    else:
        fr = "half" if shot.startswith("half") else shot
    if fr not in sdtags.FRAMING:
        fr = str(opts.get("framing") or "half")
    # 有 extra 且 lock_identity（出卡）→ 場景模式；純立繪仍 solo
    # 感應調戲一律當雙人場景（玩家 POV），不要畫成 solo 立繪
    scene = bool(opts.get("lock_identity")) and bool(str(opts.get("extra") or "").strip())
    if comfy.is_tease_shot(shot):
        scene = True
    return sdtags.build_prompt(
        ch,
        # 要去背的那幾張,prompt 先要一塊平背景(見 cutout.py)。
        # 三連拍照規格走;testword 那條由勾選決定。
        flat_bg=bool(comfy.PORTRAIT_SHOTS.get(shot, {}).get("cutout")) or bool(opts.get("flat_bg")),
        part=part,
        framing=fr,
        rating=str(opts.get("rating") or "sfw"),
        art_style=str(opts.get("style") or "anime"),
        skin=anchor["skin"],
        palette=anchor["palette"],
        age=anchor["age"],
        # 生涯服裝優先(職業給的那身);玩家挑過個人衣櫃才換
        outfit=str(opts.get("outfit") or "") or anchor["outfit"],
        # 第一輪(head0/bust0/lower0)不寫服裝,跟中文那版同一個取捨
        dressed=part not in IMG_BARE_PARTS,
        stage=str(opts.get("stage") or (ch or {}).get("stage") or ""),
        extra=str(opts.get("extra") or ""),
        scene=scene,
    )


async def _run_comfy_image(opts: dict) -> tuple[str, str | None]:
    """ComfyUI 生一張。落地規則見 `_dest_for_image`。"""
    out_dir, url_dir, fname = _dest_for_image(opts)
    shot = str(opts.get("shot") or "").lower()
    if shot not in comfy.PORTRAIT_SHOTS:
        shot = ""

    extra_pos, extra_from_en = sdtags.split_pos_neg_tags(str(opts.get("extra") or ""))
    opts["extra"] = extra_pos
    extra_neg = ", ".join(
        x for x in (
            extra_from_en,
            str(opts.get("visual_neg") or "").strip(),
            str(opts.get("negative") or "").strip(),
        ) if x
    )

    wf = opts.get("workflow") if isinstance(opts.get("workflow"), dict) else None
    # prompt 有值 = 使用者在 testword 改過的版本,原樣送出;留空才由人設現組
    prompt = str(opts.get("prompt") or "").strip()
    sex_strip = str(opts.get("scene_kind") or "").lower() == "sex_strip"
    if not prompt and wf is None:
        if sex_strip:
            prompt = str(opts.get("extra") or "").strip()
        else:
            prompt, _ = _comfy_prompt_for(opts)
    if not prompt and wf is None:
        return "", "ComfyUI 生圖要有 prompt 或整份 workflow"
    if sex_strip and prompt:
        ppos, pneg = sdtags.split_pos_neg_tags(prompt)
        prompt = ppos
        extra_neg = ", ".join(x for x in (extra_neg, pneg) if x)
        prompt = _merge_oral_identity(prompt, opts.get("character") if isinstance(opts.get("character"), dict) else None)

    # 三連拍：尺寸照 plan-v4，seed 取人設雜湊（三張同 seed = 同一張臉）。
    # 出卡場景（lock_identity 但無 shot）：seed 必須每次不同，否則「打兩次同一張圖」；
    # 臉靠 character tags /（Grok）立繪 ref，不靠固定 seed。
    spec = comfy.PORTRAIT_SHOTS.get(shot) or {}
    gen_w, gen_h = spec.get("gen", (0, 0))
    out_w, out_h = spec.get("out", (0, 0))
    seed = int(opts.get("seed") or 0)
    if not seed:
        if shot:
            # 召喚三連拍：固定人設 seed
            seed = _identity_anchor(opts.get("character") or {})["seed"]
        else:
            # 出卡 / testword：每次隨機（含 lock_identity 場景）
            seed = secrets.randbelow(2**31 - 1) or 1

    # 三連拍照規格去背;testword 那條(沒有 shot)由前端的勾選決定,
    # 想在測試台上看去背效果不必先跑一次召喚。
    want_cut = bool(spec.get("cutout")) if shot else bool(opts.get("cutout"))
    # 畫崩／魔物／幼態 + 卡面 visualNeg／從 visualEn 拆出的 NO xxx。不塞 nude 預設詞。
    negative = sdtags.negative_for(want_cut, clothed=False, extra_neg=extra_neg)

    pose_src = _resolve_ref_image(str(opts.get("pose_ref") or ""))
    if pose_src is not None and shot and not comfy.is_tease_shot(shot):
        pose_src = None
    if pose_src is not None:
        gen_w, gen_h = _pose_gen_size(pose_src, gen_w or comfy.DEFAULT_WIDTH, gen_h or comfy.DEFAULT_HEIGHT)
        out_w, out_h = 0, 0
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
        pose_image=pose_src,
        denoise=float(opts.get("pose_denoise") or 0),
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
    # 立繪／出卡覆寫同一個檔名,URL 帶版本號才不會被瀏覽器拿舊的
    ver = f"?v={int(time.time())}" if out_dir == PORTRAIT_DIR else ""
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
    ref: str = ""               # 參考圖 URL：分段第二輪用 testword；出卡鎖臉可用 /assets/portraits/…
    pose_ref: str = ""          # 姿勢／構圖／骨架參考圖
    pose_denoise: float = 0     # Comfy img2img；0 = 預設 0.40
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
    seed: int = 0               # 0 = 隨機。三連拍(shot)例外：固定人設 seed 鎖臉
    # 出卡場景：lock_identity + extra 鎖人設 tags；seed 每次隨機（不可固定，否則每張同圖）
    lock_identity: bool = False
    comfy_url: str = ""         # ComfyUI 位址。RP5 與 GPU 主機不同機時必填(留空 = 用 COMFY_URL)
    # 召喚三連拍:shot=head|half|full 且有 char_id → 存 assets/portraits/{char_id}_{shot}.png,
    # 尺寸與 seed 由伺服器依規格決定(三張同 seed = 同一張臉)
    shot: str = ""
    char_id: str = ""
    card_id: str = ""             # 出卡場景：覆寫 portraits/{id}_card_{cardId}.png
    scene_kind: str = ""          # card | watch | scene（無 card_id 時當檔名標籤）
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
    # ref：分段第二輪、或出卡半身立繪鎖臉（portraits / testword）
    ref_in = (t.ref or "").strip()
    allow_ref = bool(part in IMG_SEG_PARTS) or bool(ref_in and t.lock_identity) or bool(
        ref_in.startswith("/assets/portraits/") or ref_in.startswith("/assets/testword/")
    )
    pose_in = (t.pose_ref or "").strip()
    allow_pose = bool(
        pose_in.startswith("/assets/pose_refs/")
        or pose_in.startswith("/assets/testword/")
        or pose_in.startswith("/assets/portraits/")
        or pose_in.startswith("/assets/frame_packs/")
    )
    shot_in = (t.shot or "").strip().lower()
    sex_strip = (t.scene_kind or "").strip().lower() == "sex_strip"
    # 立繪 shot 看規格（調戲場景 cutout=False）；沒登記才吃前端 cutout
    portrait_cut = comfy.shot_wants_cutout(shot_in, bool(t.cutout))
    opts = {
        "kind": "sex_strip" if sex_strip else "girl_image",
        "part": part if part in IMG_PARTS else "",
        "ref": ref_in if allow_ref else "",
        "pose_ref": pose_in if allow_pose else "",
        "pose_denoise": float(t.pose_denoise or 0),
        "framing": (t.framing or "half").lower(),
        "rating": (t.rating or "sfw").lower(),
        "style": (t.style or "anime").lower(),
        "character": t.character if isinstance(t.character, dict) else None,
        "name": t.name or "",
        "personality": t.personality or "",
        "backstory": t.backstory or "",
        "extra": t.extra or "",
        "negative": t.negative or "",
        "outfit": t.outfit or "",
        "stage": (
            (t.character.get("stage") if isinstance(t.character, dict) else "")
            or ""
        ),
        "lock_identity": bool(t.lock_identity),
        "shot": shot_in,
        "char_id": (t.char_id or "").strip(),
        "card_id": (t.card_id or "").strip(),
        "scene_kind": (t.scene_kind or "").strip(),
        "cutout": portrait_cut,
        "flat_bg": bool(t.flat_bg or portrait_cut),
        # Comfy：prompt 有值才原樣送；出卡應留空，讓 _comfy_prompt_for 用人設 + extra
        # Grok：整張圖不吃前端 prompt（只在分段 part、或做愛局部橫幅時吃）
        "prompt": (t.prompt or "") if (ep == "comfy-img" or part in IMG_PARTS or sex_strip) else "",
    }
    if ep == "comfy-img":
        # 出卡場景：下單時就寫入隨機 seed，避免 worker 用舊邏輯／固定人設 seed 出同圖
        seed_in = int(t.seed or 0)
        if not seed_in and not shot_in:
            seed_in = secrets.randbelow(2**31 - 1) or 1
        opts.update({
            "negative": t.negative or "",
            "ckpt": t.ckpt or "",
            "width": int(t.width or 0),
            "height": int(t.height or 0),
            "out_width": int(t.out_width or 0),
            "out_height": int(t.out_height or 0),
            "steps": int(t.steps or 0),
            "cfg": float(t.cfg or 0),
            "seed": seed_in,
            "comfy_url": (t.comfy_url or "").strip(),
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
            "negative": sdtags.negative_for(bool(spec.get("cutout")), clothed=True),
            "gen": list(spec["gen"]),
            "out": list(spec["out"]),
            "cutout": bool(spec.get("cutout")),
        })
        unknown += unk
    return {
        "whole": whole,
        "parts": parts,
        "shots": shots,
        "negative": sdtags.negative_for(clothed=True),
        "unknown": sorted(set(unknown)),
        "defaults": {
            "width": comfy.DEFAULT_WIDTH, "height": comfy.DEFAULT_HEIGHT,
            "steps": comfy.DEFAULT_STEPS, "cfg": comfy.DEFAULT_CFG,
            "sampler": comfy.DEFAULT_SAMPLER, "scheduler": comfy.DEFAULT_SCHEDULER,
            "clip_skip": comfy.DEFAULT_CLIP_SKIP,
        },
    }


_LOOK_SRC_ZH = {
    "age": "人設 look.age（年齡）",
    "face": "人設 look.face（臉型）",
    "eyes": "人設 look.eyes（眼睛）",
    "eye_color": "人設 look.eye_color（瞳色）",
    "mouth": "人設 look.mouth（嘴）",
    "hair": "人設 look.hair（髮型）",
    "hair_color": "人設 look.hair_color（髮色）",
    "build": "人設 look.build（體型）",
    "bust": "人設 look.bust（胸）",
    "cup": "人設 look.cup（罩杯）",
    "breast_shape": "人設 look.breast_shape（乳型）",
    "areola": "人設 look.areola（乳暈）",
    "nipple": "人設 look.nipple（乳頭）",
    "labia_size": "人設 look.labia_size（陰唇大小）",
    "clitoris_size": "人設 look.clitoris_size（陰蒂大小）",
    "labia_color": "人設 look.labia_color（陰唇顏色）",
    "pubic_hair": "人設 look.pubic_hair（陰毛）",
    "feature": "人設 look.feature（特徵）",
    "outfit": "人設服裝（生涯／衣櫃）",
    "skin": "人設膚色（雜湊）",
    "specials": "人設 specialTraits（特殊屬性）",
    "height": "人設 look.height_cm（身高）",
}


def _img_prompt_trace(t: ImgGenIn) -> dict:
    """把這次生圖會用到的每一段標上來處，給 testword 圖下展開。"""
    ch = _fill_manual_fields(
        t.character if isinstance(t.character, dict) else None,
        t.name or "", t.personality or "", t.backstory or "",
    )
    worn = _outfit_of(ch)
    if worn:
        ch["_worn_outfit"] = worn
    extra_pos, extra_from_en = sdtags.split_pos_neg_tags(t.extra or "")
    extra = extra_pos
    visual_neg = ", ".join(x for x in ((t.negative or "").strip(), extra_from_en) if x)
    framing = (t.framing or "half").lower()
    look_parts, unknown = sdtags.appearance_en_parts(
        ch, stage=str(ch.get("stage") or ""), crop=framing,
    )
    brief = _character_visual_brief(ch, framing=framing)
    rating = (t.rating or "sfw").lower()
    style = (t.style or "anime").lower()
    layers: list[dict] = []
    if ch.get("name"):
        layers.append({"id": "name", "src": "人設 name", "text": str(ch.get("name"))})
    if ch.get("job"):
        layers.append({"id": "job", "src": "人設 job", "text": str(ch.get("job"))})
    if ch.get("tone"):
        layers.append({"id": "tone", "src": "人設 tone", "text": str(ch.get("tone"))})
    pers = ch.get("personality") or []
    if isinstance(pers, list) and pers:
        layers.append({"id": "personality", "src": "人設 personality", "text": "、".join(str(p) for p in pers[:6])})
    elif pers:
        layers.append({"id": "personality", "src": "人設 personality", "text": str(pers)})
    genital_ok = (framing or "").lower() == "lower" or sdtags.extra_has_key(
        extra, ("pussy", "labia", "clitoris", "vulva", "vagina")
    )
    for k, tag in look_parts.items():
        if tag and k != "clothing_level":
            if k in ("labia_size", "clitoris_size", "labia_color", "pubic_hair") and not genital_ok:
                continue
            layers.append({"id": f"look_{k}", "src": _LOOK_SRC_ZH.get(k, f"人設 look.{k}"), "text": tag})
    lv = look_parts.get("clothing_level") or sdtags.clothing_level(str(ch.get("stage") or ""), character=ch)
    lv_zh = {"covered": "陌生／朋友·穿好只留罩杯", "shape": "女友·露胸型／乳溝", "exposed": "妻子·可全裸含乳暈乳頭"}.get(lv, lv)
    layers.append({"id": "clothing_level", "src": "衣服多寡（關係階段）", "text": lv_zh})
    if extra:
        layers.append({"id": "extra", "src": "正向 extra（運鏡＋玩家動作）", "text": extra})
    if visual_neg:
        layers.append({"id": "visual_neg", "src": "負向（visualNeg／從 visualEn 拆出的 NO）", "text": visual_neg})
    layers.append({"id": "framing", "src": "設定 framing", "text": framing})
    layers.append({"id": "style", "src": "設定 style", "text": style})
    layers.append({"id": "rating", "src": "設定 rating", "text": rating})
    if t.ref:
        layers.append({"id": "ref", "src": "參考圖 ref", "text": t.ref})
    if t.pose_ref:
        layers.append({"id": "pose_ref", "src": "姿勢參考圖 pose_ref", "text": t.pose_ref})
    if t.ckpt:
        layers.append({"id": "ckpt", "src": "Comfy checkpoint", "text": t.ckpt})
    extra_for_grok = extra
    if visual_neg:
        extra_for_grok = extra + ", " + ", ".join(
            f"NO {x.strip()}" for x in visual_neg.split(",") if x.strip()
        )
    grok_full = _build_girl_image_prompt(
        framing=framing, rating=rating, style=style,
        character=ch, extra=extra_for_grok,
        out_path=Path("/assets/testword/_preview.png"),
        ref_path=_resolve_ref_image(t.ref or ""),
        pose_path=_resolve_ref_image(t.pose_ref or ""),
        scene_kind=str(t.scene_kind or ""),
    )
    comfy_full, unk2 = _comfy_prompt_for({
        "character": ch, "framing": framing, "rating": rating,
        "style": style, "extra": extra, "outfit": t.outfit or "",
        "lock_identity": bool(t.lock_identity),
        "flat_bg": bool(t.flat_bg),
        "shot": (t.shot or "").strip().lower(),
    })
    unknown = list(dict.fromkeys([*unknown, *unk2]))
    return {
        "layers": layers,
        "character_sheet": brief,
        "grok_prompt": grok_full,
        "comfy_prompt": comfy_full,
        "comfy_negative": sdtags.negative_for(flat_bg=bool(t.flat_bg), clothed=False, extra_neg=visual_neg),
        "unknown": unknown,
        "provider": t.provider or "grok-img",
    }


@app.post("/api/imggen/preview")
def imggen_preview(t: ImgGenIn):
    """不生圖,只回這份人設組出來的 prompt(六段各一份)。
    testword 拿它填編輯框:使用者改完再按各自的生成鍵,改過的版本原樣送回 /api/imggen。
    另附 trace：整張場景圖每一段從哪裡來（卡牌測試器用）。"""
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
    return {"parts": out, "trace": _img_prompt_trace(t)}


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
            try:
                msgs = json.loads(messages)
                opts = json.loads(options or "{}")
                parts: list[str] = []

                def on_token(piece: str):
                    parts.append(piece)

                if endpoint == "comfy-img":
                    url, err = await _run_comfy_image(opts)
                    text = url or ""
                elif endpoint == "grok-img":
                    # 立繪去背看 shot 規格；調戲場景不去背
                    shot_g = str(opts.get("shot") or "").lower()
                    want_cut = comfy.shot_wants_cutout(shot_g, bool(opts.get("cutout")))
                    extra_g = str(opts.get("extra") or "")
                    neg_g = ", ".join(
                        x for x in (
                            str(opts.get("visual_neg") or "").strip(),
                            str(opts.get("negative") or "").strip(),
                        ) if x
                    )
                    if neg_g:
                        extra_g = extra_g + ", " + ", ".join(
                            f"NO {b.strip()}" for b in neg_g.split(",") if b.strip()
                        )
                    url, err = await _run_grok_image(
                        model,
                        framing=str(opts.get("framing") or "half"),
                        rating=str(opts.get("rating") or "sfw"),
                        style=str(opts.get("style") or "anime"),
                        character=opts.get("character") if isinstance(opts.get("character"), dict) else None,
                        name=str(opts.get("name") or ""),
                        personality=str(opts.get("personality") or ""),
                        backstory=str(opts.get("backstory") or ""),
                        extra=extra_g,
                        part=str(opts.get("part") or ""),
                        ref=str(opts.get("ref") or ""),
                        pose_ref=str(opts.get("pose_ref") or ""),
                        prompt_body=str(opts.get("prompt") or ""),
                        do_cutout=want_cut,
                        char_id=str(opts.get("char_id") or ""),
                        shot=str(opts.get("shot") or ""),
                        card_id=str(opts.get("card_id") or ""),
                        scene_kind=str(opts.get("scene_kind") or ""),
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
            except Exception as ex:
                # 單筆失敗（例如缺 import）不可留 running 到逾時；寫 error 讓前端能 retry
                text, err = "", f"{type(ex).__name__}: {ex}"
                print(f"[gen_worker] {key} crash: {err}", flush=True)
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
    patches: dict | None = None            # {id: {seen:[actId], texts:{actId:text}, rescue:bool, clear:bool}}
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
        sim.apply_patches(store, body.patches, now_ms)
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


# ── 發呆時段（伺服器權威：關網頁也照跑）──
_DD_LOCK = threading.Lock()
DAYDREAM_WAKE = asyncio.Event()
_DD_WAIT_SEC = 180


def _dd_load() -> dict:
    with _DD_LOCK:
        with db() as conn:
            row = conn.execute("SELECT data FROM daydream WHERE id = 1").fetchone()
        if not row:
            return ddream.new_store()
        try:
            data = json.loads(row[0])
        except Exception:
            data = None
        if not isinstance(data, dict):
            data = ddream.new_store()
        base = ddream.new_store()
        base.update(data)
        base.setdefault("queue", [])
        base.setdefault("patches", {})
        return base


def _dd_save(store: dict) -> None:
    with _DD_LOCK:
        with db() as conn:
            conn.execute(
                "INSERT INTO daydream (id, data, updated_at) VALUES (1, ?, ?) "
                "ON CONFLICT (id) DO UPDATE SET data = excluded.data, updated_at = excluded.updated_at",
                (json.dumps(store, ensure_ascii=False), time.time()),
            )


def _dd_public() -> dict:
    return ddream.public_status(_dd_load())


def _dd_read_save() -> dict | None:
    with db() as conn:
        row = conn.execute("SELECT data FROM save WHERE id = 1").fetchone()
    if not row:
        return None
    try:
        data = json.loads(row[0])
    except Exception:
        return None
    return data if isinstance(data, dict) else None


def _dd_settings(data: dict) -> dict:
    s = data.get("settings") if isinstance(data.get("settings"), dict) else {}
    img = str(s.get("imgProvider") or "grok-img").strip().lower()
    provider = "comfy" if img in ("comfy", "comfyui", "comfy-img") else "grok-img"
    return {
        "provider": provider,
        "model": str(s.get("model") or "grok-4.5"),
        "style": str(s.get("imgStyle") or "anime"),
        "rating": str(s.get("rating") or "nsfw"),
        "comfy_url": str(s.get("comfyUrl") or ""),
        "player": str(s.get("player") or (data.get("playerProfile") or {}).get("name") or "你"),
        "nsfw": str(s.get("rating") or "nsfw") == "nsfw",
        "llm_provider": (
            "grok-build"
            if str(s.get("llmProvider") or "").lower().startswith("grok")
            else "ollama"
        ),
        "ollama_url": str(s.get("ollamaUrl") or "http://localhost:11434"),
    }


def _dd_girl(data: dict, gid: str) -> dict | None:
    for g in data.get("succubi") or []:
        if isinstance(g, dict) and g.get("id") == gid:
            return g
    return None


async def _dd_wait_key(key: str, timeout: float = _DD_WAIT_SEC) -> str:
    deadline = time.time() + timeout
    while time.time() < deadline:
        with db() as conn:
            row = conn.execute(
                "SELECT status, result FROM gen_tasks WHERE key = ?", (key,)
            ).fetchone()
        if row:
            status, result = row
            if status == "done":
                return str(result or "")
            if status == "error":
                return ""
        await asyncio.sleep(1.2)
    return ""


async def _dd_llm(key: str, messages: list, model: str, provider: str, endpoint: str = "") -> str:
    if not model or not messages:
        return ""
    body = GenIn(
        key=key, model=model, messages=messages, provider=provider,
        endpoint=endpoint or "http://localhost:11434", retry=True, prio=0,
    )
    r = gen_submit(body)
    if r.get("status") == "done":
        return str(r.get("result") or "").strip()
    return (await _dd_wait_key(key, 120)).strip()


async def _dd_image(t: ImgGenIn) -> str:
    r = imggen_submit(t)
    if r.get("status") == "done":
        return str(r.get("result") or "")
    if r.get("status") == "error" and not t.retry:
        return ""
    return await _dd_wait_key(str(r.get("key") or t.key or ""))


def _dd_img_base(girl: dict, cfg: dict, key: str, **kw) -> ImgGenIn:
    return ImgGenIn(
        key=key,
        provider=cfg["provider"],
        model=cfg["model"],
        style=cfg["style"],
        character=ddream.slim_girl(girl),
        retry=True,
        comfy_url=cfg["comfy_url"],
        ckpt=str(girl.get("comfyCkpt") or ""),
        char_id=str(girl.get("id") or ""),
        **kw,
    )


async def _dd_run_portraits(girl: dict, cfg: dict, key: str, on_label) -> dict:
    portraits = {}
    for shot in ("full", "half", "head"):
        await on_label(f"立繪 · {shot}")
        extra = "plain solid color background, simple background"
        if shot == "half":
            extra = "half-body portrait, looking at viewer, " + extra
        url = await _dd_image(_dd_img_base(
            girl, cfg, f"{key}:{shot}",
            shot=shot,
            framing="full" if cfg["provider"] == "comfy" else ("full" if shot == "full" else "half"),
            rating="sfw",
            extra=extra,
            cutout=True,
            flat_bg=True,
        ))
        if url:
            portraits[shot] = url
    return {"portraits": portraits, "portraitsRefreshedAt": int(time.time() * 1000)}


async def _dd_run_emotion(girl: dict, cfg: dict, key: str, mood: str, on_label) -> dict:
    defn = ddream.HALF_EMOTIONS.get(mood) or ddream.HALF_EMOTIONS["xi"]
    await on_label(f"表情 · {defn['label']}")
    half_ref = str((girl.get("portraits") or {}).get("half") or (girl.get("portraits") or {}).get("full") or "")
    extra = ", ".join([
        "half-body portrait", "same woman as reference",
        "keep same face, hair, outfit", "looking at viewer", defn["tags"],
    ])
    url = await _dd_image(_dd_img_base(
        girl, cfg, key,
        shot=defn["shot"],
        framing="half",
        rating="sfw",
        extra=extra,
        cutout=True,
        flat_bg=True,
        ref=half_ref.split("?")[0] if half_ref.startswith("/assets/") else "",
        lock_identity=True,
    ))
    if not url:
        return {}
    return {
        "portraits": {defn["shot"]: url},
        "extraShotAt": {defn["shot"]: int(time.time() * 1000)},
    }


async def _dd_run_sex(girl: dict, cfg: dict, key: str, pose_id: str, on_label) -> dict:
    built = ddream.sex_frames(pose_id, cfg["style"], girl.get("look") if isinstance(girl.get("look"), dict) else {})
    pose = built["pose"]
    sex_pack = None
    for p in ddream.load_script_packs().get("packs") or []:
        if p.get("kind") == "sex" and p.get("pose") == pose_id:
            sex_pack = p
            break
    if not sex_pack:
        for p in ddream.load_script_packs().get("packs") or []:
            if p.get("kind") == "sex":
                sex_pack = p
                break
    pack = ddream.frame_pack(str((sex_pack or {}).get("framePackId") or ""), pose_id)
    urls = []
    for i, fr in enumerate(built["frames"]):
        await on_label(f"做愛動畫 · {pose['label']} · 第 {i + 1} 幀")
        bone = ddream.pack_frame_url(pack, i + 1)
        url = await _dd_image(_dd_img_base(
            girl, cfg, f"{key}:{i}",
            framing="lower",
            rating="nsfw",
            extra=fr["pos"],
            prompt=fr["pos"],
            negative=", ".join(x for x in (built["neg"], fr.get("extraNeg")) if x),
            cutout=False,
            flat_bg=False,
            scene_kind="sex_strip",
            pose_ref=bone,
            pose_denoise=0.70 if bone else 0,
            width=1216,
            height=832,
        ))
        urls.append(url or "")
    prev = ((girl.get("sexAnim") or {}).get(pose_id) or {}).get("urls") or []
    merged = [u or (prev[i] if i < len(prev) else "") for i, u in enumerate(urls)]
    return {"sexAnim": {pose_id: {"urls": merged, "at": int(time.time() * 1000)}}}


async def _dd_run_script(girl: dict, cfg: dict, key: str, pack_id: str, scene: int, on_label) -> dict:
    job = next((j for j in ddream.list_script_jobs() if j.get("packId") == pack_id and j.get("scene") == scene), None)
    if not job:
        return {}
    spec = job["spec"]
    pack = job["pack"]
    player = cfg["player"]
    attitude = ddream.fill_binds(spec.get("attitude") or "", girl, player)
    narr = ddream.narr_last(spec, girl, player)
    await on_label(f"{job['label']} · 回話")
    reply = ""
    pose = ""
    if cfg["model"]:
        reply = await _dd_llm(
            f"{key}:reply",
            ddream.reply_msgs(girl.get("name"), attitude, narr, girl.get("stage")),
            cfg["model"],
            cfg["llm_provider"],
            cfg.get("ollama_url") or "",
        )
        if reply:
            await on_label(f"{job['label']} · 組 prompt")
            raw = await _dd_llm(
                f"{key}:pose",
                ddream.pose_msgs(girl.get("name"), reply),
                cfg["model"],
                cfg["llm_provider"],
                cfg.get("ollama_url") or "",
            )
            pose = ddream.parse_pose_lines(raw)
    fp_id = str(spec.get("framePackId") or pack.get("framePackId") or "").strip()
    frame = ddream.frame_pack(fp_id, str(pack.get("pose") or ""))
    slots = spec.get("slots") if isinstance(spec.get("slots"), list) else []
    urls = []
    for i, slot in enumerate(slots):
        await on_label(f"{job['label']} · 圖 {i + 1}")
        if not isinstance(slot, dict):
            urls.append("")
            continue
        extra = ddream.fill_binds(
            ", ".join(x for x in (str(slot.get("prompt") or "").strip(), pose) if x),
            girl, player,
        )
        neg = ddream.fill_binds(slot.get("negative") or "", girl, player)
        bone = ddream.pose_ref_for_slot(spec, slot, i, pack, frame)
        url = await _dd_image(_dd_img_base(
            girl, cfg, f"{key}:img:{i}",
            framing="half" if int(scene or 1) <= 1 else "full",
            rating="nsfw",
            extra=extra,
            negative=neg,
            cutout=False,
            lock_identity=True,
            scene_kind="script",
            pose_ref=bone,
            pose_denoise=0.55 if bone else 0,
        ))
        urls.append(url or "")
    prev = (((girl.get("scriptArt") or {}).get(pack_id) or {}).get(str(scene)) or {}).get("urls") or []
    merged = [u or (prev[i] if i < len(prev) else "") for i, u in enumerate(urls)]
    return {"scriptArt": {pack_id: {str(scene): {"urls": merged, "pose": pose, "at": int(time.time() * 1000)}}}}


def _dd_begin(store: dict, data: dict, force: bool) -> dict:
    girls = [g for g in (data.get("succubi") or []) if isinstance(g, dict) and g.get("id")]
    slot = ddream.current_slot()
    stamp = ddream.slot_stamp()
    nsfw = _dd_settings(data)["nsfw"]
    queue = ddream.build_queue(girls, nsfw, stamp)
    keep_patches = (not force) and store.get("stamp") == stamp
    store.update({
        "stamp": stamp,
        "slot": slot["id"],
        "running": bool(queue),
        "completed": False,
        "force": bool(force) and bool(queue),
        "done": 0,
        "total": len(queue),
        "label": f"{slot['label']}發呆" if queue else "",
        "girlId": "",
        "queue": queue,
        "patches": (store.get("patches") or {}) if keep_patches else {},
    })
    # 名冊空：這一窗先不算完成，等有魅魔再跑
    if not queue:
        store["completed"] = False
        store["running"] = False
        store["force"] = False
    return store


async def _dd_tick_once() -> None:
    data = _dd_read_save()
    if not data:
        return
    girls = [g for g in (data.get("succubi") or []) if isinstance(g, dict) and g.get("id")]
    store = _dd_load()
    stamp = ddream.slot_stamp()
    if not girls:
        if store.get("running"):
            store["running"] = False
            store["label"] = ""
            store["girlId"] = ""
            store["queue"] = []
            _dd_save(store)
        return
    same = store.get("stamp") == stamp
    if store.get("force") and store.get("running") and store.get("queue"):
        pass
    elif (not same) or (not store.get("running") and not store.get("completed")):
        store = _dd_begin(store, data, force=bool(store.get("force") and same))
        _dd_save(store)
        if store.get("running"):
            print(
                f"[發呆] {time.strftime('%Y-%m-%d %H:%M:%S')} 開始 {store.get('label')} "
                f"stamp={store.get('stamp')} jobs={store.get('total')}",
                flush=True,
            )
        if not store.get("running"):
            return
    elif same and store.get("completed") and not store.get("force"):
        return
    elif store.get("running") and store.get("queue"):
        pass
    else:
        return
    job = (store.get("queue") or [None])[0]
    if not job:
        store["running"] = False
        store["completed"] = True
        store["force"] = False
        store["label"] = ""
        store["girlId"] = ""
        _dd_save(store)
        print(f"[發呆] {time.strftime('%Y-%m-%d %H:%M:%S')} 完成 stamp={store.get('stamp')}", flush=True)
        return
    gid = job.get("girlId")
    girl = _dd_girl(data, gid)
    cfg = _dd_settings(data)

    async def on_label(text):
        st = _dd_load()
        st["label"] = text
        st["girlId"] = gid
        st["running"] = True
        _dd_save(st)

    patch = {}
    try:
        if not girl:
            patch = {}
        elif job.get("kind") == "portraits":
            patch = await _dd_run_portraits(girl, cfg, job["key"], on_label)
        elif job.get("kind") == "emotion":
            patch = await _dd_run_emotion(girl, cfg, job["key"], job.get("mood"), on_label)
        elif job.get("kind") == "sex":
            patch = await _dd_run_sex(girl, cfg, job["key"], job.get("poseId"), on_label)
        elif job.get("kind") == "script":
            patch = await _dd_run_script(girl, cfg, job["key"], job.get("packId"), int(job.get("scene") or 1), on_label)
    except Exception as e:
        print(f"[發呆] job 失敗 {job.get('label')}: {e}", flush=True)
        patch = {}
    store = _dd_load()
    q = list(store.get("queue") or [])
    if q and q[0].get("key") == job.get("key"):
        q.pop(0)
    store["queue"] = q
    store["done"] = int(store.get("done") or 0) + 1
    store["girlId"] = gid or ""
    if patch and gid:
        ddream.set_patch(store, gid, **patch)
    if not q:
        store["running"] = False
        store["completed"] = True
        store["force"] = False
        store["label"] = ""
        store["girlId"] = ""
        print(f"[發呆] {time.strftime('%Y-%m-%d %H:%M:%S')} 完成 stamp={store.get('stamp')}", flush=True)
    _dd_save(store)


def _dd_force() -> dict:
    data = _dd_read_save() or {}
    store = _dd_load()
    store = _dd_begin(store, data, force=True)
    _dd_save(store)
    try:
        DAYDREAM_WAKE.set()
    except Exception:
        pass
    return ddream.public_status(store)


@app.get("/api/daydream")
def daydream_status():
    store = _dd_load()
    return {
        **ddream.public_status(store),
        "queue": len(store.get("queue") or []),
        "patches": store.get("patches") or {},
    }


@app.post("/api/daydream/force")
def daydream_force():
    """testword／除錯：立刻開一輪發呆，不開遊戲頁也會在伺服器跑。"""
    return _dd_force()


async def _daydream_loop():
    """發呆編排：看時窗、丟 gen_tasks、把圖補回存檔合併層。"""
    print("[發呆] 啟動 — 時窗 6:00／14:00／19:00／3:00，關網頁也照跑", flush=True)
    while True:
        try:
            await _dd_tick_once()
            store = _dd_load()
            if store.get("running") and store.get("queue"):
                continue
            DAYDREAM_WAKE.clear()
            try:
                await asyncio.wait_for(DAYDREAM_WAKE.wait(), timeout=15)
            except asyncio.TimeoutError:
                pass
        except Exception as e:
            print(f"[發呆] 檢查發生例外(將續跑):{e}", flush=True)
            await asyncio.sleep(5)


_HEARTBEAT_SEC = 600            # 每 10 分鐘印一次「已執行檢查」心跳
_last_beat = 0.0


def _world_beat(store, now: float, forced: bool = False) -> None:
    """每 10 分鐘輸出一行世界時鐘心跳,讓你隨時能確認伺服器 runtime 活著、確實在跑檢查。"""
    global _last_beat
    if not forced and now - _last_beat < _HEARTBEAT_SEC:
        return
    _last_beat = now
    st = sim.world_stats(store)
    dd = _dd_public()
    print(
        f"[世界時鐘] {time.strftime('%Y-%m-%d %H:%M:%S')} 已執行檢查 — "
        f"名冊={st['roster']} 召喚師關係={st['rels']} 召喚中={st['taken']} "
        f"看板娘計時={st['kanbanTimers']} 委託計時={st['questTimers']} 待套用={st['pendingOutcomes']} "
        f"發呆={dd.get('done', 0)}/{dd.get('total', 0) or '-'}{'跑' if dd.get('running') else ''}",
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
    asyncio.create_task(_daydream_loop())


# /editmale 編輯其他召喚師池: names、behaviors(行為卡)、actions(肢體行為)。
def _norm_behaviors(raw):
    out = []
    seen = set()
    for i, x in enumerate(raw or []):
        if isinstance(x, str):
            name = x.strip()
            if not name:
                continue
            sid = f"bh_{i}"
            out.append({"id": sid, "name": name, "how": "", "when": "approach", "line": "common"})
            seen.add(sid)
            continue
        if not isinstance(x, dict):
            continue
        name = str(x.get("name") or "").strip()
        if not name:
            continue
        sid = str(x.get("id") or "").strip() or f"bh_{i}"
        if sid in seen:
            sid = f"{sid}_{i}"
        seen.add(sid)
        when = str(x.get("when") or "approach").strip()
        if when not in ("approach", "chat"):
            when = "approach"
        line = str(x.get("line") or "common").strip()
        if line not in ("common", "otaku", "creep", "erotic"):
            line = "common"
        out.append({"id": sid, "name": name, "how": str(x.get("how") or "").strip(), "when": when, "line": line})
    return out


def _norm_actions(raw):
    out = []
    seen = set()
    for i, x in enumerate(raw or []):
        if not isinstance(x, dict):
            continue
        name = str(x.get("name") or "").strip()
        if not name:
            continue
        sid = str(x.get("id") or "").strip() or f"act_{i}"
        if sid in seen:
            sid = f"{sid}_{i}"
        seen.add(sid)
        when = str(x.get("when") or "approach").strip()
        if when not in ("approach", "chat"):
            when = "approach"
        out.append({"id": sid, "name": name, "how": str(x.get("how") or "").strip(), "when": when})
    return out


def _norm_date_acts(raw):
    kinds = ("talk", "touch", "strip", "penis", "invite", "mate")
    out = []
    seen = set()
    for i, x in enumerate(raw or []):
        if not isinstance(x, dict):
            continue
        name = str(x.get("name") or "").strip()
        if not name:
            continue
        sid = str(x.get("id") or "").strip() or f"da_{i}"
        if sid in seen:
            sid = f"{sid}_{i}"
        seen.add(sid)
        kind = str(x.get("kind") or "talk").strip()
        if kind not in kinds:
            kind = "talk"
        try:
            mn = int(x.get("minArousal") or 0)
        except Exception:
            mn = 0
        mn = max(0, min(30, mn))
        out.append({
            "id": sid,
            "name": name,
            "how": str(x.get("how") or "").strip(),
            "cmd": str(x.get("cmd") or "").strip(),
            "kind": kind,
            "minArousal": mn,
        })
    return out


@app.put("/api/summoners")
def put_summoners(body: dict):
    has_names = "names" in body
    has_summoners = "summoners" in body
    has_behaviors = "behaviors" in body
    has_actions = "actions" in body
    has_play = "play_ladders" in body
    has_date_acts = "date_acts" in body
    if not has_names and not has_summoners and not has_behaviors and not has_actions and not has_play and not has_date_acts:
        raise HTTPException(400, "需要 {names:[...]}、{behaviors:[...]}、{actions:[...]}、{play_ladders:{...}}、{date_acts:[...]} 或 {summoners:[...]}")
    if has_names and not isinstance(body.get("names"), list):
        raise HTTPException(400, "names 必須是字串陣列")
    if has_summoners and not isinstance(body.get("summoners"), list):
        raise HTTPException(400, "summoners 必須是陣列")
    if has_behaviors and not isinstance(body.get("behaviors"), list):
        raise HTTPException(400, "behaviors 必須是陣列")
    if has_actions and not isinstance(body.get("actions"), list):
        raise HTTPException(400, "actions 必須是陣列")
    if has_play and not isinstance(body.get("play_ladders"), dict):
        raise HTTPException(400, "play_ladders 必須是物件")
    if has_date_acts and not isinstance(body.get("date_acts"), list):
        raise HTTPException(400, "date_acts 必須是陣列")
    path = WEB_DIR / "content" / "summoners.json"
    current = {}
    if path.exists():
        try:
            current = json.loads(path.read_text(encoding="utf-8"))
        except Exception:
            current = {}
    out = {"ok": True}
    if has_names:
        current["names"] = [str(x).strip() for x in body["names"] if str(x).strip()]
        out["names"] = len(current["names"])
    if has_behaviors:
        current["behaviors"] = _norm_behaviors(body["behaviors"])
        out["behaviors"] = len(current["behaviors"])
    if has_actions:
        current["actions"] = _norm_actions(body["actions"])
        out["actions"] = len(current["actions"])
    if has_summoners:
        current["summoners"] = body["summoners"]
        out["count"] = len(body["summoners"])
    if has_play:
        current["play_ladders"] = body["play_ladders"]
        out["play_ladders"] = True
    if has_date_acts:
        current["date_acts"] = _norm_date_acts(body["date_acts"])
        out["date_acts"] = len(current["date_acts"])
    path.write_text(json.dumps(current, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return out


# /edit_person 編輯魅魔生成池;整包覆寫 content/persona_pools.json(男性=召喚師,走 /editmale)
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


@app.get("/testdate")
def testdate():
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "testdate.html")


# ── 多檔牌組版本（card_x.json 等）────────────────────────────────
# 註冊表 content/card_packs_registry.json：
#   { "active", "liveEpoch", "packs": [{ "id","file","name","note",... }] }
# 每份牌組是獨立 JSON（與 cards.json 同形）。
# 遊戲只有一個「上線槽」= active：
#   - 上線 = 換 active + liveEpoch++ + 清空玩家牌制進度（牌庫／貨架／創角話術）
#   - 草稿檔仍保留在 disk，方便回滾再上線（再上線仍會再清一次玩家牌進度）

CONTENT_DIR = WEB_DIR / "content"
PACK_REGISTRY_PATH = CONTENT_DIR / "card_packs_registry.json"
_PACK_ID_RE = re.compile(r"^[a-zA-Z][a-zA-Z0-9_\-]{0,47}$")
_PACK_FILE_RE = re.compile(r"^[a-zA-Z0-9_\-]+\.json$")


def _default_pack_registry() -> dict:
    return {
        "active": "main",
        "liveEpoch": 1,
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
    try:
        reg["liveEpoch"] = int(reg.get("liveEpoch") or 1)
    except (TypeError, ValueError):
        reg["liveEpoch"] = 1
    if reg["liveEpoch"] < 1:
        reg["liveEpoch"] = 1
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
            "phone_cost": 1,
            "phone_cost_range": [1, 1],
            "answer_rate": 2 / 3,
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
    try:
        live_epoch = int(reg.get("liveEpoch") or 1)
    except (TypeError, ValueError):
        live_epoch = 1
    return {
        "active": reg.get("active"),
        "liveEpoch": live_epoch,
        "packs": packs,
    }


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


def _wipe_player_card_progress_in_save(pack_id: str, epoch: int) -> dict:
    """
    上線槽硬切：清空存檔裡的玩家牌制進度。
    草稿牌組 JSON 檔不動；只動 save 表 blob 的 card* 欄位。
    """
    with db() as conn:
        row = conn.execute("SELECT version, data FROM save WHERE id = 1").fetchone()
        if row is None:
            return {"wiped": False, "reason": "no_save"}
        version, raw = row[0], row[1]
        try:
            data = json.loads(raw) if raw else {}
        except Exception:
            return {"wiped": False, "reason": "save_corrupt"}
        if not isinstance(data, dict):
            return {"wiped": False, "reason": "save_corrupt"}
        data["cardInventory"] = {}
        data["cardDeck"] = []
        data["deckPresets"] = []
        data["cardShop"] = None
        data["cardSession"] = None
        data["cardsLive"] = {"packId": pack_id, "epoch": int(epoch)}
        pp = data.get("playerProfile")
        if not isinstance(pp, dict):
            pp = {}
        pp["starterSpeechCardId"] = None
        data["playerProfile"] = pp
        new_version = int(version) + 1
        conn.execute(
            "UPDATE save SET version = ?, data = ?, updated_at = ? WHERE id = 1",
            (new_version, json.dumps(data, ensure_ascii=False), time.time()),
        )
        return {"wiped": True, "saveVersion": new_version, "packId": pack_id, "epoch": int(epoch)}


@app.post("/api/card-packs/{pack_id}/activate")
def activate_card_pack(pack_id: str):
    """
    上線到唯一 live 槽：
    - 換 active + liveEpoch++
    - 清空玩家牌庫／出戰牌組／卡店貨架／牌局／創角話術
    - 草稿 JSON 檔仍保留，可再切回（切回也會再清進度）
    """
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
    # 每次上線（含同包重上線）都推進 epoch，並清玩家牌進度——測試重開很常見
    try:
        epoch = int(reg.get("liveEpoch") or 1) + 1
    except (TypeError, ValueError):
        epoch = 1
    reg["liveEpoch"] = epoch
    # 歷史
    hist = reg.setdefault("history", [])
    if not isinstance(hist, list):
        hist = []
        reg["history"] = hist
    hist.append({
        "at": time.time(),
        "from": prev,
        "to": pack_id,
        "epoch": epoch,
        "playerCardsWiped": True,
    })
    hist[:] = hist[-50:]
    _save_pack_registry(reg)
    wipe = _wipe_player_card_progress_in_save(pack_id, epoch)
    msg = (
        f"已上線 {pack_id}（epoch {epoch}）"
        + (f" · 已清空玩家牌制進度" if wipe.get("wiped") else " · 尚無存檔可清")
        + (f" · 草稿「{prev}」仍在 disk" if prev and prev != pack_id else "")
    )
    return {
        "ok": True,
        "active": pack_id,
        "previous": prev,
        "liveEpoch": epoch,
        "playerCardsWiped": bool(wipe.get("wiped")),
        "wipe": wipe,
        "pack": _pack_summary(meta, reg),
        "count": len(doc.get("cards") or []),
        "message": msg,
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
    active = reg.get("active") or "main"
    meta = _pack_meta(reg, active)
    doc = _read_pack_file(_pack_path(meta))
    # 標上目前掛載的卡組，前端創角／除錯用（存檔時可忽略）
    if not isinstance(doc.get("_meta"), dict):
        doc["_meta"] = {}
    doc["_meta"]["active_pack"] = active
    doc["_meta"]["active_file"] = meta.get("file")
    doc["_meta"]["active_name"] = meta.get("name") or active
    try:
        doc["_meta"]["live_epoch"] = int(reg.get("liveEpoch") or 1)
    except (TypeError, ValueError):
        doc["_meta"]["live_epoch"] = 1
    # 若 starter_pool 空但有 starter 旗標／speech 卡，補一份給前端（不寫回檔）
    cards = doc.get("cards") if isinstance(doc.get("cards"), list) else []
    pool = doc.get("starter_pool") if isinstance(doc.get("starter_pool"), list) else []
    idset = {c.get("id") for c in cards if isinstance(c, dict)}
    pool = [x for x in pool if x in idset]
    if not pool:
        pool = [c["id"] for c in cards if isinstance(c, dict) and c.get("starter") and c.get("id")]
    if not pool:
        pool = [
            c["id"]
            for c in cards
            if isinstance(c, dict)
            and c.get("id")
            and c.get("kind") == "speech"
            and not c.get("shatterOnUse")
        ]
    doc["starter_pool"] = pool
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


@app.get("/editmale")
def editmale():
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "editmale.html")


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


def _script_packs_path():
    return WEB_DIR / "content" / "script_packs.json"


@app.get("/api/script-packs")
def get_script_packs():
    path = _script_packs_path()
    if not path.is_file():
        return {"packs": [], "activeByKind": {}}
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return {"packs": [], "activeByKind": {}}
    if not isinstance(data, dict):
        return {"packs": [], "activeByKind": {}}
    packs = data.get("packs") if isinstance(data.get("packs"), list) else []
    active = data.get("activeByKind") if isinstance(data.get("activeByKind"), dict) else {}
    return {"packs": packs, "activeByKind": active}


@app.put("/api/script-packs")
def put_script_packs(body: dict):
    if not isinstance(body.get("packs"), list):
        raise HTTPException(400, "需要 {packs:[...], activeByKind:{}}")
    active = body.get("activeByKind") if isinstance(body.get("activeByKind"), dict) else {}
    packs = [p for p in body["packs"] if isinstance(p, dict)]
    doc = {"packs": packs, "activeByKind": active}
    path = _script_packs_path()
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_suffix(".json.tmp")
    tmp.write_text(json.dumps(doc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    tmp.replace(path)
    return {"ok": True, "count": len(packs)}


@app.get("/body")
def body():
    # 虛擬設計台:偽 3D 點陣胸部人台,供胸罩/衣著版型預覽
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "body.html")


@app.get("/widget")
def widget():
    from fastapi.responses import FileResponse
    return FileResponse(WEB_DIR / "widget.html")


@app.get("/discover.apk")
def discover_apk():
    from fastapi.responses import FileResponse
    path = WEB_DIR / "discover.apk"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="還沒有 APK")
    return FileResponse(
        path,
        media_type="application/vnd.android.package-archive",
        filename="discover.apk",
    )


ASSETS_DIR.mkdir(parents=True, exist_ok=True)
app.mount("/assets", StaticFiles(directory=ASSETS_DIR), name="assets")
app.mount("/", StaticFiles(directory=WEB_DIR, html=True), name="web")
