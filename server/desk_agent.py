"""她桌上的工作（agent office，2026-11-01）。

玩家在聊天裡把一件委託交給她 → 放到她桌上（一次只能一件）→ 她坐到書桌前就開工：
伺服器背景叫 agent 去跑（手機關了也繼續），過程全部記成事件，房間和工作日誌照事件畫。
做完桌上變成報告書；玩家看完按「完成委託」或「退回重做」（附意見，同一件接著做）。

第一步只有假的 agent（MockAgent，照劇本吐事件），先把流程和畫面做好。
之後接 Hermes（RP5 上的 Runs API ＋ hooks）只要多一個 adapter，事件格式不變：

事件 {seq, at(ms), actor, kind, text, status}
  actor：main（她＝主 agent）｜sub:<n>（使魔＝subagent）｜ext:<provider>（外包：claude／grok／chatgpt…）
  kind ：plan 計畫｜tool 用工具｜think 想｜trouble 卡住／失敗｜spawn 叫出使魔｜done 某個 actor 做完
         ｜dispatch 外包送出｜report 交報告｜note 你補充的話｜status 狀態變化｜error 出錯
  status：run｜ok｜fail（可空）
"""
from __future__ import annotations

import asyncio
import json
import os
import sqlite3
import time
from typing import Callable

# run.status：placed 放在桌上還沒開工｜running 做中｜done 報告交了｜failed 出錯停了
#             ｜cancelled 收回｜accepted 你收下（委託完成）
ACTIVE = ("placed", "running", "done", "failed")
TITLE_MAX = 200
NOTE_MAX = 2000
EVENTS_MAX = 400          # 一件工作最多記幾則（超過只留最新的，報告不受影響）
POLL_EVENTS_MAX = 200     # 一次回幾則


def now_ms() -> int:
    return int(time.time() * 1000)


def init(conn: sqlite3.Connection) -> None:
    conn.execute(
        """CREATE TABLE IF NOT EXISTS desk_runs (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            quest_id    TEXT NOT NULL DEFAULT '',
            title       TEXT NOT NULL,
            girl_id     TEXT NOT NULL DEFAULT '',
            girl_name   TEXT NOT NULL DEFAULT '',
            status      TEXT NOT NULL,
            agent       TEXT NOT NULL DEFAULT 'mock',
            created     INTEGER NOT NULL,
            started     INTEGER NOT NULL DEFAULT 0,
            finished    INTEGER NOT NULL DEFAULT 0,
            report      TEXT NOT NULL DEFAULT '',
            feedback    TEXT NOT NULL DEFAULT '',
            rounds      INTEGER NOT NULL DEFAULT 0
        )"""
    )
    conn.execute(
        """CREATE TABLE IF NOT EXISTS desk_events (
            run_id  INTEGER NOT NULL,
            seq     INTEGER NOT NULL,
            at      INTEGER NOT NULL,
            actor   TEXT NOT NULL,
            kind    TEXT NOT NULL,
            text    TEXT NOT NULL,
            status  TEXT NOT NULL DEFAULT '',
            PRIMARY KEY (run_id, seq)
        )"""
    )


# ───────────────────────────── 存取（全部同步、短交易）

def _row(r) -> dict | None:
    if not r:
        return None
    keys = ("id", "questId", "title", "girlId", "girlName", "status", "agent", "created", "started", "finished",
            "report", "feedback", "rounds")
    return dict(zip(keys, r))


_RUN_COLS = "id, quest_id, title, girl_id, girl_name, status, agent, created, started, finished, report, feedback, rounds"


def current(conn: sqlite3.Connection) -> dict | None:
    """桌上那件（還沒收下／收回的最新一件）。"""
    r = conn.execute(
        f"SELECT {_RUN_COLS} FROM desk_runs WHERE status IN ({','.join('?' * len(ACTIVE))}) ORDER BY id DESC LIMIT 1",
        ACTIVE,
    ).fetchone()
    return _row(r)


def get(conn: sqlite3.Connection, run_id: int) -> dict | None:
    return _row(conn.execute(f"SELECT {_RUN_COLS} FROM desk_runs WHERE id=?", (run_id,)).fetchone())


def events(conn: sqlite3.Connection, run_id: int, since: int = 0) -> list[dict]:
    rows = conn.execute(
        "SELECT seq, at, actor, kind, text, status FROM desk_events WHERE run_id=? AND seq>? ORDER BY seq LIMIT ?",
        (run_id, since, POLL_EVENTS_MAX),
    ).fetchall()
    return [dict(zip(("seq", "at", "actor", "kind", "text", "status"), r)) for r in rows]


def add_event(conn: sqlite3.Connection, run_id: int, actor: str, kind: str, text: str, status: str = "") -> dict:
    seq = (conn.execute("SELECT COALESCE(MAX(seq),0) FROM desk_events WHERE run_id=?", (run_id,)).fetchone()[0] or 0) + 1
    ev = {"seq": seq, "at": now_ms(), "actor": str(actor)[:40], "kind": str(kind)[:20], "text": str(text)[:NOTE_MAX],
          "status": str(status or "")[:10]}
    conn.execute("INSERT INTO desk_events (run_id, seq, at, actor, kind, text, status) VALUES (?,?,?,?,?,?,?)",
                 (run_id, ev["seq"], ev["at"], ev["actor"], ev["kind"], ev["text"], ev["status"]))
    conn.execute("DELETE FROM desk_events WHERE run_id=? AND seq<=?", (run_id, seq - EVENTS_MAX))
    conn.commit()
    return ev


def _set(conn: sqlite3.Connection, run_id: int, **cols) -> None:
    names = {"status": "status", "started": "started", "finished": "finished", "report": "report",
             "feedback": "feedback", "rounds": "rounds", "agent": "agent"}
    sets = ", ".join(f"{names[k]}=?" for k in cols)
    conn.execute(f"UPDATE desk_runs SET {sets} WHERE id=?", (*cols.values(), run_id))
    conn.commit()


class DeskError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def put(conn: sqlite3.Connection, *, quest_id: str = "", title: str, girl_id: str = "", girl_name: str = "") -> dict:
    """放上桌。桌上已經有一件（還沒收下或收回）就不行。"""
    title = " ".join(str(title or "").split())[:TITLE_MAX]
    if not title:
        raise DeskError("委託沒有內容")
    cur = current(conn)
    if cur:
        raise DeskError(f"桌上已經有「{cur['title']}」", 409)
    c = conn.execute(
        "INSERT INTO desk_runs (quest_id, title, girl_id, girl_name, status, agent, created) VALUES (?,?,?,?,?,?,?)",
        (str(quest_id or "")[:80], title, str(girl_id or "")[:80], str(girl_name or "")[:40], "placed", agent_name(), now_ms()),
    )
    conn.commit()
    run_id = c.lastrowid
    add_event(conn, run_id, "main", "status", f"委託「{title}」放到桌上了。", "")
    return get(conn, run_id)


def summary(conn: sqlite3.Connection, run: dict | None) -> dict:
    """工作日誌要的整理：使魔（subagent）、外包各一張卡，主 agent 最新一步、卡住的地方。"""
    if not run:
        return {"subs": [], "exts": [], "last": None, "trouble": None}
    rows = conn.execute(
        "SELECT seq, at, actor, kind, text, status FROM desk_events WHERE run_id=? ORDER BY seq", (run["id"],)
    ).fetchall()
    subs: dict[str, dict] = {}
    exts: dict[str, dict] = {}
    last = trouble = None
    for seq, at, actor, kind, text, status in rows:
        ev = {"seq": seq, "at": at, "kind": kind, "text": text, "status": status}
        if actor == "main":
            if kind in ("plan", "tool", "think", "trouble", "report", "note"):
                last = ev
            if kind == "trouble" and status != "ok":
                trouble = ev
            elif kind in ("plan", "tool") and status == "ok":
                trouble = None
            continue
        bag = subs if actor.startswith("sub:") else exts if actor.startswith("ext:") else None
        if bag is None:
            continue
        card = bag.setdefault(actor, {"id": actor, "goal": "", "status": "run", "last": "", "at": at, "steps": 0})
        if kind in ("spawn", "dispatch"):
            card["goal"] = text
        else:
            card["last"] = text
            card["steps"] += 1
        if kind == "done":
            card["status"] = status or "ok"
        elif kind == "trouble" and status == "fail":
            card["status"] = "fail"
        card["at"] = at
    return {"subs": list(subs.values()), "exts": list(exts.values()), "last": last, "trouble": trouble}


# ───────────────────────────── agent adapters

def agent_name() -> str:
    """DESK_AGENT：mock（預設）｜hermes（第二步才接）。"""
    return (os.environ.get("DESK_AGENT") or "mock").strip().lower() or "mock"


Emit = Callable[[str, str, str, str], None]   # (actor, kind, text, status)


class MockAgent:
    """假的 agent：照劇本吐事件、最後交一份示範報告。用來把房間、日誌、報告書做好。"""

    def __init__(self, step_s: float = 3.0):
        self.step_s = step_s

    async def run(self, run: dict, emit: Emit) -> str:
        t, fb, s = run["title"], run.get("feedback") or "", self.step_s
        if fb:
            emit("main", "plan", f"看了你的意見：「{fb[:60]}」，照這個改。", "")
            await asyncio.sleep(s)
        emit("main", "plan", f"看一下委託「{t}」：先查資料、再分兩邊整理和寫初稿，最後檢查。", "")
        await asyncio.sleep(s)
        emit("main", "tool", f"查資料：{t}", "run")
        await asyncio.sleep(s)
        emit("main", "tool", "查到幾筆可以用的資料。", "ok")
        emit("sub:1", "spawn", "整理查到的資料，挑出重點", "")
        await asyncio.sleep(s * .6)
        emit("sub:2", "spawn", "照重點寫一份初稿", "")
        await asyncio.sleep(s)
        emit("sub:1", "tool", "讀資料、標重點", "run")
        await asyncio.sleep(s)
        emit("main", "trouble", "有兩筆資料說法對不起來，先換個方式查。", "fail")
        await asyncio.sleep(s)
        emit("main", "tool", "換關鍵字重查，對上了。", "ok")
        emit("sub:1", "done", "重點整理好了（5 點）", "ok")
        await asyncio.sleep(s)
        emit("sub:2", "tool", "寫初稿：開頭、三段、結論", "run")
        emit("ext:claude", "dispatch", "（示範，沒有真的送出）請 Claude Code 檢查格式和錯字", "")
        await asyncio.sleep(s * 1.4)
        emit("sub:2", "done", "初稿寫好了", "ok")
        emit("ext:claude", "done", "（示範）格式 OK，改了 3 個錯字", "ok")
        await asyncio.sleep(s)
        emit("main", "think", "把重點、初稿、修正合在一起，寫成報告。", "")
        await asyncio.sleep(s)
        lines = [
            f"# {t}",
            "",
            "> 這是**假的 agent**（第一步的示範）交的報告；接上 Hermes 之後這裡會是真的成果。",
            "",
            "## 摘要",
            f"- 委託：{t}",
            "- 查了資料、整理出 5 個重點，寫了一份初稿，請外包檢查過格式。",
            "",
            "## 做了什麼",
            "1. 查資料（中間有兩筆對不起來，換關鍵字重查）",
            "2. 使魔①整理重點",
            "3. 使魔②寫初稿",
            "4. 外包：Claude Code 檢查格式（示範）",
            "",
            "## 還要你確認",
            "- 結論的方向對不對",
        ]
        if fb:
            lines[4:4] = ["## 依你的意見修改", f"> {fb}", ""]
        return "\n".join(lines)


def make_agent():
    name = agent_name()
    if name == "mock":
        return MockAgent(float(os.environ.get("DESK_MOCK_STEP_S") or 3.0))
    return None


# ───────────────────────────── 背景執行

_tasks: dict[int, asyncio.Task] = {}


def busy(run_id: int) -> bool:
    t = _tasks.get(run_id)
    return bool(t and not t.done())


async def drive(connect: Callable[[], sqlite3.Connection], run_id: int) -> None:
    """跑一輪：running → done（報告）／failed。cancel 時安靜結束（狀態由 cancel() 寫）。"""
    conn = connect()
    try:
        run = get(conn, run_id)
        if not run or run["status"] != "running":
            return
        agent = make_agent()
        if agent is None:
            add_event(conn, run_id, "main", "error", f"沒有「{agent_name()}」這種 agent（第一步只有 mock）。", "fail")
            _set(conn, run_id, status="failed", finished=now_ms())
            return

        def emit(actor: str, kind: str, text: str, status: str = "") -> None:
            add_event(conn, run_id, actor, kind, text, status)

        report = await agent.run(run, emit)
        if (get(conn, run_id) or {}).get("status") != "running":
            return
        add_event(conn, run_id, "main", "report", "報告寫好了，放在桌上。", "ok")
        _set(conn, run_id, status="done", finished=now_ms(), report=str(report or "")[:60000])
    except asyncio.CancelledError:
        raise
    except Exception as e:   # 出錯就停在 failed，桌上還在，可以重來
        try:
            add_event(conn, run_id, "main", "error", f"出錯停下來了：{e}", "fail")
            _set(conn, run_id, status="failed", finished=now_ms())
        except Exception:
            pass
    finally:
        conn.close()
        _tasks.pop(run_id, None)


def _spawn(connect, run_id: int) -> None:
    if busy(run_id):
        return
    _tasks[run_id] = asyncio.create_task(drive(connect, run_id))


def start(connect, conn: sqlite3.Connection) -> dict:
    """她坐下開工。placed／failed → running。已經在跑就照舊（重複呼叫沒事）。"""
    run = current(conn)
    if not run:
        raise DeskError("桌上沒有工作", 404)
    if run["status"] == "running":
        if not busy(run["id"]):
            _spawn(connect, run["id"])
        return run
    if run["status"] not in ("placed", "failed"):
        return run
    _set(conn, run["id"], status="running", started=now_ms(), finished=0, rounds=run["rounds"] + 1, agent=agent_name())
    add_event(conn, run["id"], "main", "status", "坐下來開工了。" if run["status"] == "placed" else "重新開工。", "")
    _spawn(connect, run["id"])
    return get(conn, run["id"])


def redo(connect, conn: sqlite3.Connection, feedback: str) -> dict:
    """退回重做：帶你的意見，同一件接著做。"""
    run = current(conn)
    if not run or run["status"] != "done":
        raise DeskError("現在沒有交上來的報告")
    fb = " ".join(str(feedback or "").split())[:NOTE_MAX]
    if not fb:
        raise DeskError("寫一下哪裡要改")
    _set(conn, run["id"], status="running", feedback=fb, started=now_ms(), finished=0, rounds=run["rounds"] + 1)
    add_event(conn, run["id"], "main", "note", f"你退回來：{fb}", "")
    _spawn(connect, run["id"])
    return get(conn, run["id"])


def cancel(conn: sqlite3.Connection) -> dict | None:
    run = current(conn)
    if not run:
        return None
    t = _tasks.pop(run["id"], None)
    if t and not t.done():
        t.cancel()
    _set(conn, run["id"], status="cancelled", finished=now_ms())
    add_event(conn, run["id"], "main", "status", "收回了，桌上清空。", "")
    return get(conn, run["id"])


def accept(conn: sqlite3.Connection) -> dict:
    run = current(conn)
    if not run or run["status"] != "done":
        raise DeskError("現在沒有交上來的報告")
    _set(conn, run["id"], status="accepted")
    add_event(conn, run["id"], "main", "status", "你收下報告，委託完成。", "ok")
    return get(conn, run["id"])


def resume_all(connect) -> int:
    """伺服器重開：還在 running 的接著跑（mock 從頭再跑一次）。"""
    conn = connect()
    try:
        rows = conn.execute("SELECT id FROM desk_runs WHERE status='running'").fetchall()
        for (rid,) in rows:
            add_event(conn, rid, "main", "status", "伺服器重開，接著做。", "")
            _spawn(connect, rid)
        return len(rows)
    finally:
        conn.close()


def view(conn: sqlite3.Connection, since: int = 0) -> dict:
    run = current(conn)
    out = {"run": None, "events": [], "summary": summary(conn, None), "agent": agent_name()}
    if run:
        if run["status"] != "done":
            run = {**run, "report": ""}   # 報告只在交上來時帶（大）
        out["run"] = run
        out["events"] = events(conn, run["id"], since)
        out["summary"] = summary(conn, run)
        out["busy"] = busy(run["id"])
    return out
