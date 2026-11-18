"""牆上的相框（2026-11-04）：相框裡是一個網頁，她（魅魔）寫的。

- 四個位置：左牆 0、1，後牆 2、3（一面牆兩個）。
- 網頁來源：她書桌工作的附檔（desk_agent.files_dir(run_id)）裡的 .html。掛上去時把那件的整個資料夾
  複製到 <FRAMES_DIR>/<fid>/，之後書櫃丟掉那件也不影響牆上的。
- 誰掛：你（從附件、或點空的位置挑）；她（你點空位置「請她寫一個網頁掛這裡」→ 放一件上她的桌，
  做完有 .html 就自己掛上去；位置被佔了就掛別的空位；全滿就不掛，留在書櫃等你）。
- 誰拿下：只有你（unhang 只有玩家的接口會叫，她不會拿）。
- 掛滿（四個都有）不能再掛，要先拿下一幅。
- 看：/frames/<fid>/<path>，CSP sandbox allow-scripts（沒有 allow-same-origin）→ 可以是會動的 app，
  但跑在不透明來源，碰不到遊戲的 cookie／localStorage／接口。
- 使用者模式（2026-11-12）：相框外層（不是她寫的網頁）由玩家設定
  operator 誰來用：her｜hermes｜both（沒選＝''）；viewers 誰可以看：you／her／hermes；
  查看時間：每天幾點到幾點（start／end "HH:MM"，跨午夜可）＋可選的日期起訖（dateFrom／dateTo "YYYY-MM-DD"），
  空的＝不限。時間一律台北時間（UTC+8，沒有夏令時間）。
  設定存在 room_frame_modes，一幅（fid）一列，另記 run_id＋entry（哪一份網頁）。拿下來不刪；
  同一件同一頁再掛上去（新的 fid）就抄最近一次的設定，所以設定還在。同一頁同時掛兩格各自設定。
  預設（沒設定過）：只有你看得到、誰來用沒選。
  作業時間（2026-11-18）：查看時間有填開始／結束時，那段也是去作業的時間（台北）。
  誰來用是她／Hermes／一起 → 視窗一到（或伺服器稍後趕上，仍在窗內）自動排一件書桌工作更新看板，
  每幅每個視窗最多一次、桌上還有這幅沒做完的不再放。頁面沒開也會排（跟定期工作同一個迴圈）。
  誰來用是她／一起：她在房間且不忙時會走到相框前面用一會兒（客戶端活動 frame_use）。
  只有 Hermes：只排書桌、不走路。誰來用是她／一起時，她不必勾「誰可以看：她」也會知道這幅給她用。
"""
from __future__ import annotations

import os
import secrets
import shutil
import sqlite3
import re
import time
from datetime import datetime, timedelta, timezone
from pathlib import Path

import desk_agent

SLOTS = 4
WALLS = ("左牆", "左牆", "後牆", "後牆")
COPY_MAX = 30 * 1024 * 1024     # 一幅最多複製多少（整個資料夾）
HTML_EXT = (".html", ".htm")
ASK_MARK = "寫一個網頁掛在牆上"   # 請她寫的那件的標題開頭
CANDIDATES_MAX = 40
OPERATORS = ("her", "hermes", "both")
VIEWERS = ("you", "her", "hermes")
DEFAULT_VIEWERS = ("you",)
TPE = timezone(timedelta(hours=8))   # 台北（沒有夏令時間）
_HM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")
_YMD = re.compile(r"^\d{4}-\d{2}-\d{2}$")


class FrameError(Exception):
    def __init__(self, msg: str, status: int = 400):
        super().__init__(msg)
        self.status = status


def now_ms() -> int:
    return int(time.time() * 1000)


def root() -> Path:
    return Path(os.environ.get("FRAMES_DIR") or Path(__file__).resolve().parents[1] / "data" / "frames")


def init(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS room_frames (
            slot      INTEGER PRIMARY KEY,
            fid       TEXT NOT NULL,
            title     TEXT NOT NULL DEFAULT '',
            entry     TEXT NOT NULL,
            girl_id   TEXT NOT NULL DEFAULT '',
            girl_name TEXT NOT NULL DEFAULT '',
            run_id    INTEGER NOT NULL DEFAULT 0,
            by        TEXT NOT NULL DEFAULT 'you',
            hung      INTEGER NOT NULL
        )"""
    )
    # 你請她寫、還沒做完的（做完 → 她自己掛）
    conn.execute(
        """CREATE TABLE IF NOT EXISTS room_frame_wants (
            run_id  INTEGER PRIMARY KEY,
            slot    INTEGER NOT NULL,
            created INTEGER NOT NULL
        )"""
    )
    # 使用者模式（相框外層的設定）：一幅一列；拿下來不刪，同一頁再掛回去照抄
    conn.execute(
        """CREATE TABLE IF NOT EXISTS room_frame_modes (
            fid       TEXT PRIMARY KEY,
            run_id    INTEGER NOT NULL,
            entry     TEXT NOT NULL,
            operator  TEXT NOT NULL DEFAULT '',
            viewers   TEXT NOT NULL DEFAULT 'you',
            win_start TEXT NOT NULL DEFAULT '',
            win_end   TEXT NOT NULL DEFAULT '',
            date_from TEXT NOT NULL DEFAULT '',
            date_to   TEXT NOT NULL DEFAULT '',
            updated   INTEGER NOT NULL DEFAULT 0
        )"""
    )
    # 舊的 room_frame_modes（之後加欄位就照這裡補）
    have = {r[1] for r in conn.execute("PRAGMA table_info(room_frame_modes)").fetchall()}
    for col, ddl in (("operator", "TEXT NOT NULL DEFAULT ''"), ("viewers", "TEXT NOT NULL DEFAULT 'you'"),
                     ("win_start", "TEXT NOT NULL DEFAULT ''"), ("win_end", "TEXT NOT NULL DEFAULT ''"),
                     ("date_from", "TEXT NOT NULL DEFAULT ''"), ("date_to", "TEXT NOT NULL DEFAULT ''"),
                     ("updated", "INTEGER NOT NULL DEFAULT 0")):
        if col not in have:
            conn.execute(f"ALTER TABLE room_frame_modes ADD COLUMN {col} {ddl}")
    # 自動排的更新工作：一幅＋一個作業視窗一列，用來去重
    conn.execute(
        """CREATE TABLE IF NOT EXISTS room_frame_jobs (
            fid       TEXT NOT NULL,
            window_id TEXT NOT NULL,
            run_id    INTEGER NOT NULL,
            created   INTEGER NOT NULL,
            PRIMARY KEY (fid, window_id)
        )"""
    )
    conn.commit()


def default_mode() -> dict:
    return {"operator": "", "viewers": list(DEFAULT_VIEWERS), "start": "", "end": "", "dateFrom": "", "dateTo": "", "set": False}


def _mode_row(m) -> dict:
    if not m:
        return default_mode()
    viewers = [v for v in VIEWERS if v in str(m[1] or "").split(",")]
    return {"operator": m[0] if m[0] in OPERATORS else "", "viewers": viewers, "start": m[2] or "", "end": m[3] or "",
            "dateFrom": m[4] or "", "dateTo": m[5] or "", "set": True}


def _row(r) -> dict:
    return {"slot": r[0], "fid": r[1], "title": r[2], "entry": r[3], "girlId": r[4], "girlName": r[5],
            "runId": r[6], "by": r[7], "hung": r[8], "wall": WALLS[r[0]] if 0 <= r[0] < SLOTS else "",
            "url": f"/frames/{r[1]}/{r[3]}", "mode": _mode_row(r[9:] if len(r) > 9 and r[9] is not None else None)}


def frames(conn: sqlite3.Connection) -> list[dict | None]:
    """四個位置，空的是 None。每幅帶 mode（使用者模式）。"""
    out: list[dict | None] = [None] * SLOTS
    for r in conn.execute("SELECT f.slot, f.fid, f.title, f.entry, f.girl_id, f.girl_name, f.run_id, f.by, f.hung, "
                          "m.operator, m.viewers, m.win_start, m.win_end, m.date_from, m.date_to "
                          "FROM room_frames f LEFT JOIN room_frame_modes m ON m.fid = f.fid").fetchall():
        if 0 <= r[0] < SLOTS:
            out[r[0]] = _row(r)
    return out


def _slot(v) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return -1


def _valid_date(s: str) -> bool:
    if not _YMD.match(s):
        return False
    try:
        datetime.strptime(s, "%Y-%m-%d")
        return True
    except ValueError:
        return False


def set_mode(conn: sqlite3.Connection, slot, body: dict) -> dict:
    """玩家設定那幅的使用者模式：{operator, viewers[], start, end, dateFrom, dateTo} → 那幅（含 mode）。"""
    slot = _slot(slot)
    cur = frames(conn)[slot] if 0 <= slot < SLOTS else None
    if not cur:
        raise FrameError("那個位置是空的", 404)
    b = body or {}
    op = str(b.get("operator") or "").strip()
    if op and op not in OPERATORS:
        raise FrameError("誰來用只能選：她、Hermes、她跟 Hermes 一起")
    raw = b.get("viewers")
    if raw is None:
        raw = []
    if isinstance(raw, str):
        raw = [x for x in raw.split(",") if x]
    if not isinstance(raw, (list, tuple)):
        raise FrameError("誰可以看格式不對")
    bad = [v for v in raw if v not in VIEWERS]
    if bad:
        raise FrameError("誰可以看只能勾：你、她、Hermes")
    viewers = [v for v in VIEWERS if v in raw]
    start, end = str(b.get("start") or "").strip(), str(b.get("end") or "").strip()
    if bool(start) != bool(end):
        raise FrameError("查看時間要開始和結束都填，或都空著（不限）")
    for t in (start, end):
        if t and not _HM.match(t):
            raise FrameError("時間要寫成 HH:MM（例如 18:00）")
    if start and start == end:
        raise FrameError("開始和結束時間不能一樣")
    d0, d1 = str(b.get("dateFrom") or "").strip(), str(b.get("dateTo") or "").strip()
    for d in (d0, d1):
        if d and not _valid_date(d):
            raise FrameError("日期要寫成 YYYY-MM-DD")
    if d0 and d1 and d0 > d1:
        raise FrameError("開始日期不能晚於結束日期")
    conn.execute("INSERT OR REPLACE INTO room_frame_modes (fid, run_id, entry, operator, viewers, win_start, win_end, date_from, date_to, updated) "
                 "VALUES (?,?,?,?,?,?,?,?,?,?)", (cur["fid"], cur["runId"], cur["entry"], op, ",".join(viewers), start, end, d0, d1, now_ms()))
    conn.commit()
    return frames(conn)[slot]


def get_mode(conn: sqlite3.Connection, slot) -> dict:
    slot = _slot(slot)
    cur = frames(conn)[slot] if 0 <= slot < SLOTS else None
    if not cur:
        raise FrameError("那個位置是空的", 404)
    return cur["mode"]


def in_window(mode: dict, now: datetime | None = None) -> bool:
    """現在（台北）在不在查看時間裡。沒設＝一直都在。"""
    t = (now or datetime.now(TPE)).astimezone(TPE)
    day = t.strftime("%Y-%m-%d")
    if mode.get("dateFrom") and day < mode["dateFrom"]:
        return False
    if mode.get("dateTo") and day > mode["dateTo"]:
        return False
    s, e = mode.get("start") or "", mode.get("end") or ""
    if not s or not e:
        return True
    hm = t.strftime("%H:%M")
    return s <= hm < e if s < e else (hm >= s or hm < e)   # 跨午夜：22:00–02:00


def can_view(frame: dict, who: str, now: datetime | None = None) -> bool:
    """who（you／her／hermes）現在看得到這幅網頁嗎（名單裡＋在時間內）。玩家永遠打得開外層改設定。"""
    m = frame.get("mode") or default_mode()
    return who in m.get("viewers", []) and in_window(m, now)


def tpe_now(now: datetime | None = None) -> datetime:
    """一律轉成台北時間。"""
    t = now or datetime.now(TPE)
    if t.tzinfo is None:
        t = t.replace(tzinfo=TPE)
    return t.astimezone(TPE)


def window_id(mode: dict, now: datetime | None = None) -> str | None:
    """現在所在的作業視窗代號（視窗開始那天＋開始時刻，例如 2026-11-18T18:00）。
    沒設開始／結束、或不在窗內 → None（不自動作業）。跨午夜（22:00–02:00）算同一窗。"""
    m = mode or {}
    s, e = m.get("start") or "", m.get("end") or ""
    if not s or not e or not in_window(m, now):
        return None
    t = tpe_now(now)
    hm = t.strftime("%H:%M")
    if s < e or hm >= s:
        day = t.strftime("%Y-%m-%d")
    else:
        day = (t.date() - timedelta(days=1)).isoformat()
    return f"{day}T{s}"


def she_knows(frame: dict, now: datetime | None = None) -> bool:
    """聊天時她知不知道這幅。誰來用是她／一起：只要在時間內就知道，不必勾「誰可以看：她」。"""
    if not frame:
        return False
    m = frame.get("mode") or default_mode()
    if m.get("operator") in ("her", "both"):
        return in_window(m, now)
    return can_view(frame, "her", now)


def wants(conn: sqlite3.Connection) -> list[dict]:
    """還在她桌上做的（收回／丟掉的順手清掉）。"""
    rows = conn.execute("SELECT w.run_id, w.slot, w.created, r.title, r.status FROM room_frame_wants w "
                        "LEFT JOIN desk_runs r ON r.id = w.run_id ORDER BY w.created").fetchall()
    stale = [r[0] for r in rows if r[4] not in desk_agent.WORKING + ("failed",)]
    if stale:
        conn.executemany("DELETE FROM room_frame_wants WHERE run_id=?", [(i,) for i in stale])
        conn.commit()
    return [{"runId": r[0], "slot": r[1], "created": r[2], "title": r[3] or "", "status": r[4] or ""}
            for r in rows if r[0] not in stale]


def view(conn: sqlite3.Connection) -> dict:
    return {"frames": frames(conn), "wants": wants(conn), "slots": SLOTS}


def html_files(run_id: int) -> list[str]:
    names = [f["name"] for f in desk_agent.list_files(run_id) if f["name"].lower().endswith(HTML_EXT)]
    # index.html（最上層）優先，再淺的、再照名字
    return sorted(names, key=lambda n: (n.lower().rsplit("/", 1)[-1] not in ("index.html", "index.htm"), n.count("/"), n))


def _free(conn: sqlite3.Connection) -> list[int]:
    used = {r[0] for r in conn.execute("SELECT slot FROM room_frames").fetchall()}
    return [s for s in range(SLOTS) if s not in used]


def _title_of(run: dict, name: str) -> str:
    t = str(run.get("title") or "").strip()
    if t.startswith(ASK_MARK):
        t = t[len(ASK_MARK):].lstrip("：: ").strip()
    return (t or Path(name).stem)[:80]


def hang(conn: sqlite3.Connection, run_id, name: str = "", slot=None, by: str = "you") -> dict:
    """把書桌那件的網頁掛上去。slot 沒給＝第一個空位。掛滿／那格有東西 → 409。"""
    run = desk_agent.get(conn, int(run_id or 0))
    if not run:
        raise FrameError("找不到那件工作", 404)
    name = str(name or "").strip() or next(iter(html_files(run["id"])), "")
    if not name.lower().endswith(HTML_EXT):
        raise FrameError("只有網頁（.html）能掛上牆")
    try:
        desk_agent.file_path(run["id"], name)
    except desk_agent.DeskError as e:
        raise FrameError(str(e), e.status)
    free = _free(conn)
    if not free:
        raise FrameError("牆上四個位置都掛滿了，先拿下一幅才能再掛", 409)
    if slot is None or slot == "":
        slot = free[0]
    slot = int(slot)
    if not 0 <= slot < SLOTS:
        raise FrameError("沒有這個位置")
    if slot not in free:
        raise FrameError("那個位置已經掛著一幅了，先拿下來", 409)
    src = desk_agent.files_dir(run["id"]).resolve()
    size = sum(p.stat().st_size for p in src.rglob("*") if p.is_file())
    if size > COPY_MAX:
        raise FrameError(f"這件的檔案太大（{size // 1048576} MB），掛不上去", 413)
    fid = f"{slot}{secrets.token_hex(6)}"
    dst = root() / fid
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, dst, ignore=shutil.ignore_patterns(".*"))
    conn.execute("INSERT INTO room_frames (slot, fid, title, entry, girl_id, girl_name, run_id, by, hung) VALUES (?,?,?,?,?,?,?,?,?)",
                 (slot, fid, _title_of(run, name), name, run.get("girlId") or "", run.get("girlName") or "", run["id"],
                  "her" if by == "her" else "you", now_ms()))
    # 同一件同一頁之前掛過、設過使用者模式 → 照抄最近那次（拿下來再掛回去設定還在）
    conn.execute("INSERT OR REPLACE INTO room_frame_modes (fid, run_id, entry, operator, viewers, win_start, win_end, date_from, date_to, updated) "
                 "SELECT ?, run_id, entry, operator, viewers, win_start, win_end, date_from, date_to, ? FROM room_frame_modes "
                 "WHERE run_id=? AND entry=? AND fid<>? ORDER BY updated DESC LIMIT 1", (fid, now_ms(), run["id"], name, fid))
    conn.commit()
    return frames(conn)[slot]


def unhang(conn: sqlite3.Connection, slot) -> dict:
    """拿下來（只有你）。書桌那件的原檔還在書櫃（沒丟的話），可以再掛。"""
    slot = int(slot if slot is not None else -1)
    cur = frames(conn)[slot] if 0 <= slot < SLOTS else None
    if not cur:
        raise FrameError("那個位置是空的", 404)
    conn.execute("DELETE FROM room_frames WHERE slot=?", (slot,))
    conn.commit()
    shutil.rmtree(root() / cur["fid"], ignore_errors=True)
    return cur


def ask(conn: sqlite3.Connection, slot, what: str, girl_id: str = "", girl_name: str = "") -> dict:
    """請她寫一個網頁掛在 slot：放一件上她的桌，做完她自己掛。"""
    what = " ".join(str(what or "").split())[:120]
    if not what:
        raise FrameError("想要什麼樣的網頁？寫一句給她")
    slot = int(slot if slot is not None else -1)
    if not 0 <= slot < SLOTS:
        raise FrameError("沒有這個位置")
    if slot not in _free(conn):
        raise FrameError("那個位置已經掛著一幅了，先拿下來", 409)
    note = ("把成品做成一個網頁，要掛在房間牆上的相框裡給他看。可以是會動、能操作的小 app，也可以是靜態的頁面，你決定。"
            "入口檔一定叫 index.html，放在附檔資料夾最上層；需要的 css／js／圖片也放同一個資料夾，用相對路徑引用。"
            "會在沙盒 iframe 裡打開：不能用 localStorage、cookie，不能呼叫遊戲的接口，最好不要靠外部網路（CDN 也盡量不用）。"
            "要在手機直式小螢幕上好看、好按。報告裡說一下這頁是什麼、怎麼玩。")
    run = desk_agent.put(conn, title=f"{ASK_MARK}：{what}", girl_id=girl_id, girl_name=girl_name, note=note)
    conn.execute("INSERT OR REPLACE INTO room_frame_wants (run_id, slot, created) VALUES (?,?,?)", (run["id"], slot, now_ms()))
    conn.commit()
    return run


UPDATE_MARK = "更新牆上的網頁看板"   # 作業時間到自動排的更新
EXCERPT_MAX = 700


def _excerpt(fid: str, entry: str = "index.html") -> str:
    """現有頁面開頭，給更新委託的說明。讀不到就說一聲。"""
    try:
        p = file_path(fid, entry or "index.html")
        text = " ".join(p.read_text(encoding="utf-8", errors="replace").split())
    except (FrameError, OSError, UnicodeError):
        return "（現有頁面讀不到。）"
    if len(text) > EXCERPT_MAX:
        text = text[:EXCERPT_MAX].rstrip() + "…"
    return text or "（現有頁面是空的。）"


def _update_note(frame: dict) -> str:
    m = frame.get("mode") or default_mode()
    op = {"her": "她", "hermes": "Hermes", "both": "她跟 Hermes 一起"}.get(m.get("operator") or "", "還沒選")
    time = f"每天 {m['start']}–{m['end']}（台北時間）" if m.get("start") and m.get("end") else "不限時間"
    where = f"{frame.get('wall') or '牆上'}第 {int(frame.get('slot') or 0) % 2 + 1} 格"
    body = (
        f"這是房間牆上相框裡的看板「{frame.get('title') or ''}」（編號 {frame.get('fid')}，{where}）。"
        f"誰來用：{op}。作業／查看時間：{time}。"
        "這一輪請更新這幅看板的內容：依它現在的用途和現有頁面，把該刷新的資料、列表、狀態、日期更新成這一輪該有的樣子，"
        "保持同一個小 app／頁面的風格和操作方式，不要做成無關的新作品。"
        "入口檔一定叫 index.html，放在附檔資料夾最上層；需要的 css／js／圖片也放同一個資料夾，用相對路徑引用。"
        "會在沙盒 iframe 裡打開：不能用 localStorage、cookie，不能呼叫遊戲的接口，最好不要靠外部網路（CDN 也盡量不用）。"
        "要在手機直式小螢幕上好看、好按。報告裡說一下你這次更新了什麼。"
        f"\n現有頁面（{frame.get('entry') or 'index.html'}）開頭：\n{_excerpt(frame.get('fid') or '', frame.get('entry') or 'index.html')}"
    )
    return body[: desk_agent.NOTE_MAX]


def _active_frame_job(conn: sqlite3.Connection, fid: str) -> int | None:
    """這幅還在桌上、沒做完的更新工作（queued／placed／running／paused）。"""
    row = conn.execute(
        f"SELECT j.run_id FROM room_frame_jobs j JOIN desk_runs r ON r.id = j.run_id "
        f"WHERE j.fid=? AND r.status IN ({desk_agent._in(desk_agent.WORKING)}) LIMIT 1",
        (fid,),
    ).fetchone()
    return int(row[0]) if row else None


def due_jobs(conn: sqlite3.Connection, now: datetime | None = None) -> list[dict]:
    """作業時間到了：把更新看板的委託放到她桌上。每幅每個視窗最多一次；桌上還有這幅沒做完的不再放。"""
    t = tpe_now(now)
    out = []
    for f in frames(conn):
        if not f:
            continue
        m = f.get("mode") or default_mode()
        if m.get("operator") not in ("her", "hermes", "both"):
            continue
        wid = window_id(m, t)
        if not wid:
            continue
        if conn.execute("SELECT 1 FROM room_frame_jobs WHERE fid=? AND window_id=?", (f["fid"], wid)).fetchone():
            continue
        if _active_frame_job(conn, f["fid"]):
            continue
        title = f"{UPDATE_MARK}：{f.get('title') or '看板'}"[: desk_agent.TITLE_MAX]
        qid = f"framejob:{f['fid']}:{wid}"[:80]
        try:
            run = desk_agent.put(
                conn, quest_id=qid, title=title, note=_update_note(f),
                girl_id=f.get("girlId") or "", girl_name=f.get("girlName") or "",
            )
        except desk_agent.DeskError as e:
            print(f"[相框] 排更新失敗「{f.get('title') or ''}」：{e}", flush=True)
            continue
        conn.execute(
            "INSERT OR IGNORE INTO room_frame_jobs (fid, window_id, run_id, created) VALUES (?,?,?,?)",
            (f["fid"], wid, run["id"], now_ms()),
        )
        conn.commit()
        out.append(run)
    return out


def apply_update(conn: sqlite3.Connection, run_id: int) -> dict | None:
    """更新工作做完：用新的網頁覆蓋牆上同一幅（fid 不變，使用者模式還在）。"""
    row = conn.execute("SELECT fid FROM room_frame_jobs WHERE run_id=?", (run_id,)).fetchone()
    if not row:
        return None
    fid = row[0]
    cur = next((f for f in frames(conn) if f and f["fid"] == fid), None)
    if not cur:
        desk_agent.add_event(conn, run_id, "main", "status", "牆上已經沒有這幅了，更新留在書櫃。", "")
        return None
    names = html_files(run_id)
    if not names:
        desk_agent.add_event(conn, run_id, "main", "status", "沒做出網頁（index.html），牆上那幅先保持原樣。", "fail")
        return None
    src = desk_agent.files_dir(run_id).resolve()
    dst = (root() / fid).resolve()
    tmp = (root() / f"{fid}.new").resolve()
    bak = (root() / f"{fid}.old").resolve()
    if tmp.exists():
        shutil.rmtree(tmp, ignore_errors=True)
    if bak.exists():
        shutil.rmtree(bak, ignore_errors=True)
    dst.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(src, tmp, ignore=shutil.ignore_patterns(".*"))
    if dst.exists():
        dst.rename(bak)
    tmp.rename(dst)
    shutil.rmtree(bak, ignore_errors=True)
    conn.execute("UPDATE room_frames SET entry=?, run_id=? WHERE fid=?", (names[0], run_id, fid))
    conn.commit()
    desk_agent.add_event(conn, run_id, "main", "status", f"她更新了{cur['wall']}上的「{cur['title']}」。", "ok")
    return next((f for f in frames(conn) if f and f["fid"] == fid), cur)


def on_done(conn: sqlite3.Connection, run_id: int) -> dict | None:
    """書桌那件做完：更新看板就覆蓋原幅；是你請她寫的就她自己掛。→ 那幅或 None。"""
    updated = apply_update(conn, run_id)
    if updated is not None or conn.execute("SELECT 1 FROM room_frame_jobs WHERE run_id=?", (run_id,)).fetchone():
        return updated
    w = conn.execute("SELECT slot FROM room_frame_wants WHERE run_id=?", (run_id,)).fetchone()
    if not w:
        return None
    conn.execute("DELETE FROM room_frame_wants WHERE run_id=?", (run_id,))
    conn.commit()
    names = html_files(run_id)
    if not names:
        desk_agent.add_event(conn, run_id, "main", "status", "沒做出網頁（index.html），沒辦法掛上牆。", "fail")
        return None
    free = _free(conn)
    if not free:
        desk_agent.add_event(conn, run_id, "main", "status", "牆上掛滿了，網頁先放在書櫃；你拿下一幅後可以從附件掛上去。", "")
        return None
    slot = w[0] if w[0] in free else free[0]
    try:
        f = hang(conn, run_id, names[0], slot, by="her")
    except FrameError as e:
        desk_agent.add_event(conn, run_id, "main", "status", f"網頁沒掛上牆：{e}", "fail")
        return None
    desk_agent.add_event(conn, run_id, "main", "status", f"她把網頁掛到{WALLS[slot]}上了。", "ok")
    return f


def candidates(conn: sqlite3.Connection) -> list[dict]:
    """可以掛的：交了報告或收下的那些件裡有 .html 的（新的在前）。"""
    out = []
    for r in conn.execute("SELECT id, title, girl_name, status FROM desk_runs WHERE status IN ('done','accepted') "
                          "ORDER BY COALESCE(NULLIF(finished,0), created) DESC LIMIT 200").fetchall():
        names = html_files(r[0])
        if names:
            out.append({"runId": r[0], "title": r[1], "girlName": r[2], "status": r[3], "files": names[:5]})
            if len(out) >= CANDIDATES_MAX:
                break
    return out


def file_path(fid: str, path: str) -> Path:
    fid = str(fid or "")
    if not fid.isalnum():
        raise FrameError("沒有這幅", 404)
    d = (root() / fid).resolve()
    p = (d / (path or "index.html")).resolve()
    if p.is_dir():
        p = p / "index.html"
    if d not in p.parents or not p.is_file() or any(part.startswith(".") for part in p.relative_to(d).parts):
        raise FrameError("沒有這個檔案", 404)
    return p
