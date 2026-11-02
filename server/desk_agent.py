"""她桌上的工作（agent office，2026-11-01）。

玩家把委託放到她桌上（聊天交給她，或委託板長按往上滑）→ 排成一列，她坐在書桌前就照順序一件一件做（2026-11-02：
一次可以放很多件）。伺服器背景叫 agent 去跑，過程全部記成事件，房間和工作日誌照事件畫。做完一件、報告疊在桌上，
她接著做下一件；玩家有空再一份份看：完成委託／延伸（委託先完成、接著做後續）／退回重做（附意見）——後兩者插隊。

agent：DESK_AGENT=mock（假的，照劇本吐事件）｜hermes（RP5 上的 Hermes，server/desk_hermes.py）。事件格式：

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
import re
import shutil
import sqlite3
import time
from pathlib import Path
from typing import Callable

# run.status：queued 排隊中（舊資料的 placed 一樣）｜running 做中｜paused 她離開書桌、停著｜done 報告交了｜failed 出錯停了
#             ｜cancelled 收回｜accepted 你收下（委託完成）
# 書櫃（2026-11-02 Al）：報告交了、她離開書桌 → 前端 shelve → shelved＝收進書櫃的時間（報告不在桌上、在書櫃）；
#   收下的（accepted）也都在書櫃，點書櫃可以再看。退回／延伸再交報告時 shelved 歸 0（先放在桌上）。
SHELF_MAX = 100           # 書櫃一次回幾件收下的
# 附檔案（2026-11-02）：每件一個資料夾 <DESK_FILES_DIR>/<run id>/，agent 把產出的檔案存在這裡，報告書列出來。
FILES_MAX = 60            # 一件最多列幾個檔案


# 她的筆記本（2026-11-02 Al）：每個妹子各自的工作筆記，開工／退回時放進 prompt。
#   source：teach 退回時教的｜write 你直接寫的｜reflect 她自己檢討的（status proposed，你批准才 active）
LESSON_MAX = 500          # 一條最多幾個字
LESSONS_IN_PROMPT = 30    # 開工時帶幾條（新的優先）
REFLECT_HEAD = "這次學到的"


def files_root() -> Path:
    return Path(os.environ.get("DESK_FILES_DIR") or Path(__file__).resolve().parents[1] / "data" / "desk_files")


def files_dir(run_id: int, make: bool = False) -> Path:
    d = files_root() / str(int(run_id))
    if make:
        d.mkdir(parents=True, exist_ok=True)
    return d


def list_files(run_id: int) -> list[dict]:
    """這件的附檔（相對路徑、大小、改的時間；隱藏檔不算）。"""
    d = files_dir(run_id)
    if not d.is_dir():
        return []
    out = []
    for p in sorted(d.rglob("*")):
        rel = p.relative_to(d)
        if not p.is_file() or any(part.startswith(".") for part in rel.parts):
            continue
        st = p.stat()
        out.append({"name": rel.as_posix(), "size": st.st_size, "at": int(st.st_mtime * 1000)})
        if len(out) >= FILES_MAX:
            break
    return out


def file_path(run_id: int, name: str) -> Path:
    """附檔的實際位置（不能跑出這件的資料夾）。"""
    d = files_dir(run_id).resolve()
    p = (d / str(name or "")).resolve()
    if d not in p.parents or not p.is_file() or any(part.startswith(".") for part in p.relative_to(d).parts):
        raise DeskError("沒有這個檔案", 404)
    return p


def drop_files(run_id: int) -> None:
    shutil.rmtree(files_dir(run_id), ignore_errors=True)
# 她正在做的那件（working）：running／paused 那件；沒有就是排第一的（prio 大的先＝退回重做／延伸／重來插隊，再照放上來的順序）。
# 報告（done）和出錯（failed）不擋後面，疊在桌上等你處理。
# 她不在書桌前就不做（2026-11-02 Al）：前端看到她離開書桌 → pause（Hermes 這一輪 stop、session 留著）；坐回來 → start 接著做。
ACTIVE = ("queued", "placed", "running", "paused", "done", "failed")
WORKING = ("running", "paused", "queued", "placed")
WAITING = ("queued", "placed")
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
    # agent_session：agent 那邊的 session（Hermes：退回重做／伺服器重開都接著同一個）
    # note：放上桌時附的說明（委託板長按 → 放到她桌上 → 輸入框），交給 agent
    for stmt in ("ALTER TABLE desk_runs ADD COLUMN agent_session TEXT NOT NULL DEFAULT ''",
                 "ALTER TABLE desk_runs ADD COLUMN note TEXT NOT NULL DEFAULT ''",
                 # ask：agent 停下來等你決定的事（JSON：kind approval／clarify、text、id…），回答完清空
                 "ALTER TABLE desk_runs ADD COLUMN ask TEXT NOT NULL DEFAULT ''",
                 # mode：這一輪是 redo（退回重做）還是 extend（延伸：委託已完成、接著做後續）
                 "ALTER TABLE desk_runs ADD COLUMN mode TEXT NOT NULL DEFAULT ''",
                 # prio：插隊（退回重做／延伸／重來 = 1，開工時歸 0）
                 "ALTER TABLE desk_runs ADD COLUMN prio INTEGER NOT NULL DEFAULT 0",
                 # shelved：報告收進書櫃的時間（0＝還在桌上）
                 "ALTER TABLE desk_runs ADD COLUMN shelved INTEGER NOT NULL DEFAULT 0"):
        try:
            conn.execute(stmt)
        except sqlite3.OperationalError:
            pass
    conn.execute(
        """CREATE TABLE IF NOT EXISTS desk_lessons (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            girl_key  TEXT NOT NULL,
            girl_name TEXT NOT NULL DEFAULT '',
            text      TEXT NOT NULL,
            source    TEXT NOT NULL DEFAULT 'write',
            status    TEXT NOT NULL DEFAULT 'active',
            run_id    INTEGER NOT NULL DEFAULT 0,
            created   INTEGER NOT NULL
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
            "report", "feedback", "rounds", "session", "note", "ask", "mode", "prio", "shelved")
    return dict(zip(keys, r))


_RUN_COLS = "id, quest_id, title, girl_id, girl_name, status, agent, created, started, finished, report, feedback, rounds, agent_session, note, ask, mode, prio, shelved"


def _in(statuses) -> str:
    return ",".join("'" + x + "'" for x in statuses)


def working(conn: sqlite3.Connection) -> dict | None:
    """她正在做（或下一件要做）的那件：running／paused 先，再來排隊的（插隊的先，再照放上來的順序）。"""
    r = conn.execute(
        f"SELECT {_RUN_COLS} FROM desk_runs WHERE status IN ({_in(WORKING)}) "
        "ORDER BY (status IN ('running','paused')) DESC, prio DESC, id ASC LIMIT 1").fetchone()
    return _row(r)


def queue(conn: sqlite3.Connection) -> list[dict]:
    """排隊的（照要做的順序；含 working 如果它還沒開工）。"""
    rows = conn.execute(f"SELECT {_RUN_COLS} FROM desk_runs WHERE status IN ({_in(WAITING)}) ORDER BY prio DESC, id ASC").fetchall()
    return [_row(r) for r in rows]


def listed(conn: sqlite3.Connection, status: str) -> list[dict]:
    rows = conn.execute(f"SELECT {_RUN_COLS} FROM desk_runs WHERE status=? ORDER BY finished ASC, id ASC", (status,)).fetchall()
    return [_row(r) for r in rows]


def current(conn: sqlite3.Connection) -> dict | None:
    """最相關的那件：她正在做的；沒有就是最近交上來的報告／出錯的。"""
    w = working(conn)
    if w:
        return w
    r = conn.execute(f"SELECT {_RUN_COLS} FROM desk_runs WHERE status IN ('done','failed') ORDER BY finished DESC, id DESC LIMIT 1").fetchone()
    return _row(r)


def _pick(conn: sqlite3.Connection, run_id, statuses: tuple, missing: str) -> dict:
    """用 id 找桌上的那件（沒給 id：最早的那件）。"""
    if run_id:
        run = get(conn, int(run_id))
        if not run or run["status"] not in statuses:
            raise DeskError(missing)
        return run
    r = conn.execute(f"SELECT {_RUN_COLS} FROM desk_runs WHERE status IN ({_in(statuses)}) ORDER BY finished ASC, id ASC LIMIT 1").fetchone()
    if not r:
        raise DeskError(missing)
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
             "feedback": "feedback", "rounds": "rounds", "agent": "agent", "session": "agent_session", "ask": "ask",
             "mode": "mode", "quest_id": "quest_id", "prio": "prio", "shelved": "shelved"}
    sets = ", ".join(f"{names[k]}=?" for k in cols)
    conn.execute(f"UPDATE desk_runs SET {sets} WHERE id=?", (*cols.values(), run_id))
    conn.commit()


class DeskError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


def put(conn: sqlite3.Connection, *, quest_id: str = "", title: str, girl_id: str = "", girl_name: str = "",
        note: str = "") -> dict:
    """放上桌（排到隊伍最後）。同一件委託已經在桌上就不行。note：附的說明。回傳的 run 帶 pos（排第幾件）。"""
    title = " ".join(str(title or "").split())[:TITLE_MAX]
    note = str(note or "").strip()[:NOTE_MAX]
    quest_id = str(quest_id or "")[:80]
    if not title:
        raise DeskError("委託沒有內容")
    if quest_id:
        dup = conn.execute(f"SELECT title FROM desk_runs WHERE quest_id=? AND status IN ({_in(ACTIVE)})", (quest_id,)).fetchone()
        if dup:
            raise DeskError(f"「{dup[0]}」已經在她桌上了", 409)
    c = conn.execute(
        "INSERT INTO desk_runs (quest_id, title, girl_id, girl_name, status, agent, created, note) VALUES (?,?,?,?,?,?,?,?)",
        (quest_id, title, str(girl_id or "")[:80], str(girl_name or "")[:40], "queued", agent_name(), now_ms(), note),
    )
    conn.commit()
    run_id = c.lastrowid
    ahead = conn.execute(f"SELECT COUNT(*) FROM desk_runs WHERE status IN ({_in(WORKING)}) AND id<>?", (run_id,)).fetchone()[0]
    add_event(conn, run_id, "main", "status", f"委託「{title}」放到桌上了" + (f"（前面還有 {ahead} 件）" if ahead else "") + "。"
              + (f"說明：{note}" if note else ""), "")
    return {**get(conn, run_id), "pos": ahead + 1}


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
    """DESK_AGENT：mock（預設）｜hermes。"""
    return (os.environ.get("DESK_AGENT") or "mock").strip().lower() or "mock"


Emit = Callable[[str, str, str, str], None]   # (actor, kind, text, status)

_YES = ("可以", "好", "行", "准", "同意", "允許", "ok", "okay", "yes", "沒問題", "去吧", "做吧", "執行", "跑吧", "嗯", "恩", "對")
_NO = ("不行", "不要", "不准", "不可以", "不好", "別", "拒絕", "no", "算了", "不用", "停", "不能", "否")


def approval_choice(text: str) -> str | None:
    """你對「可不可以」的回答 → once（准）｜deny（不准）｜None（聽不出來）。否定先看（「不可以」含「可以」）。"""
    t = " ".join(str(text or "").lower().split())
    if not t:
        return None
    if any(w in t for w in _NO):
        return "deny"
    if any(w in t for w in _YES):
        return "once"
    return None


class MockAgent:
    """假的 agent：照劇本吐事件、最後交一份示範報告。用來把房間、日誌、報告書做好。"""

    def __init__(self, step_s: float = 3.0, ask: bool = False):
        self.step_s = step_s
        self.ask = ask              # DESK_MOCK_ASK=1：做到一半停下來要你核准（測「她走過來問你」）
        self.on_ask = None          # drive 設：on_ask(dict|None)
        self._answer: asyncio.Future | None = None
        self.notes: list[str] = []

    async def steer(self, text: str) -> str:
        """補充指示：記下來，報告裡照著寫。"""
        self.notes.append(text)
        return "live"

    async def respond(self, text: str) -> str:
        choice = approval_choice(text)
        if choice is None:
            raise ValueError("聽不出可不可以，說「可以」或「不行」")
        if not self._answer or self._answer.done():
            raise ValueError("現在沒有在等你回答")
        self._answer.set_result(choice)
        return choice

    async def run(self, run: dict, emit: Emit, store=None) -> str:
        t, fb, s = run["title"], run.get("feedback") or "", self.step_s
        if fb and run.get("mode") == "extend":
            emit("main", "plan", f"接著做後續：「{fb[:60]}」。", "")
            await asyncio.sleep(s)
        elif fb:
            emit("main", "plan", f"看了你的意見：「{fb[:60]}」，照這個改。", "")
            await asyncio.sleep(s)
        emit("main", "plan", f"看一下委託「{t}」：先查資料、再分兩邊整理和寫初稿，最後檢查。", "")
        await asyncio.sleep(s)
        emit("main", "tool", f"查資料：{t}", "run")
        await asyncio.sleep(s)
        emit("main", "tool", "查到幾筆可以用的資料。", "ok")
        if self.ask and self.on_ask:
            self._answer = asyncio.get_running_loop().create_future()
            self.on_ask({"kind": "approval", "text": "要跑一個指令（save_notes.sh）把查到的資料存成檔案，可以嗎？",
                         "choices": ["once", "deny"]})
            choice = await self._answer
            if choice == "once":
                emit("main", "tool", "跑指令：save_notes.sh", "ok")
            else:
                emit("main", "trouble", "你說不行，改成直接寫在報告裡。", "ok")
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
        fdir = run.get("filesDir")
        if fdir:   # 示範附檔：重點表、初稿
            try:
                Path(fdir).mkdir(parents=True, exist_ok=True)
                (Path(fdir) / "重點.csv").write_text("項目,說明\n重點一,示範\n重點二,示範\n", encoding="utf-8")
                (Path(fdir) / "初稿.md").write_text(f"# {t}\n\n（示範初稿）\n", encoding="utf-8")
                emit("main", "tool", "寫檔案：重點.csv、初稿.md", "ok")
            except OSError:
                pass
        emit("main", "think", "把重點、初稿、修正合在一起，寫成報告。", "")
        await asyncio.sleep(s)
        lines = [
            f"# {t}",
            "",
            *([f"> 你的說明：{run['note']}", ""] if run.get("note") else []),
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
            head = "## 延伸：接著做的後續" if run.get("mode") == "extend" else "## 依你的意見修改"
            lines[4:4] = [head, f"> {fb}", ""]
        if self.notes:
            lines += ["", "## 你中途的補充指示", *[f"- {n}" for n in self.notes]]
        if run.get("lessons"):
            lines += ["", "## 照筆記做的", *[f"- {x}" for x in run["lessons"]]]
        lines += ["", f"## {REFLECT_HEAD}", "- 資料對不起來時，換關鍵字、找第二個來源核對"]
        return "\n".join(lines)


def make_agent():
    name = agent_name()
    if name == "mock":
        return MockAgent(float(os.environ.get("DESK_MOCK_STEP_S") or 3.0), ask=os.environ.get("DESK_MOCK_ASK") == "1")
    if name == "hermes":
        import desk_hermes
        return desk_hermes.HermesAgent()
    return None


# ───────────────────────────── 背景執行

_tasks: dict[int, asyncio.Task] = {}
_agents: dict[int, object] = {}     # 正在跑的 agent（回答它的問題用）


def busy(run_id: int) -> bool:
    t = _tasks.get(run_id)
    return bool(t and not t.done())


async def drive(connect: Callable[[], sqlite3.Connection], run_id: int, resume: bool = False) -> None:
    """跑一輪：running → done（報告）／failed。cancel 時安靜結束（狀態由 cancel() 寫）。
    resume：伺服器重開後接著跑（Hermes 接著同一個 session）。"""
    conn = connect()
    try:
        run = get(conn, run_id)
        if not run or run["status"] != "running":
            return
        agent = make_agent()
        if agent is None:
            add_event(conn, run_id, "main", "error", f"沒有「{agent_name()}」這種 agent（DESK_AGENT 只能是 mock 或 hermes）。", "fail")
            _set(conn, run_id, status="failed", finished=now_ms())
            return

        def emit(actor: str, kind: str, text: str, status: str = "") -> None:
            add_event(conn, run_id, actor, kind, text, status)

        def store(**cols) -> None:
            _set(conn, run_id, **cols)

        def on_ask(ask: dict | None) -> None:
            """agent 停下來等你決定（核准／提問）→ 記在桌上、日誌記一筆；None＝不用等了。"""
            _set(conn, run_id, ask=json.dumps(ask, ensure_ascii=False) if ask else "")
            if ask:
                head = "要你決定" if ask.get("kind") != "clarify" else "要問你"
                add_event(conn, run_id, "main", "ask", f"{head}：{ask.get('text') or '（沒寫是什麼）'}", "")

        agent.on_ask = on_ask
        if _tasks.get(run_id) is asyncio.current_task():
            _agents[run_id] = agent

        # 使魔編號接著之前的（退回重做時不會跟上一輪的使魔①撞名）
        sub_base = conn.execute("SELECT COUNT(DISTINCT actor) FROM desk_events WHERE run_id=? AND actor LIKE 'sub:%'",
                                (run_id,)).fetchone()[0] or 0
        fdir = files_dir(run_id, make=True)
        report = await agent.run({**run, "subBase": sub_base, "resume": resume, "filesDir": str(fdir.resolve()),
                                  "lessons": lesson_lines(conn, run)}, emit, store)
        if (get(conn, run_id) or {}).get("status") != "running":
            return
        add_event(conn, run_id, "main", "report", "報告寫好了，放在桌上。", "ok")
        _set(conn, run_id, status="done", finished=now_ms(), report=str(report or "")[:60000], ask="", shelved=0)
        _propose_reflections(conn, run, report)
        _chain(connect, conn)
    except asyncio.CancelledError:
        raise
    except Exception as e:   # 出錯就停在 failed，桌上還在，可以重來
        try:
            add_event(conn, run_id, "main", "error", f"出錯停下來了：{e}", "fail")
            _set(conn, run_id, status="failed", finished=now_ms(), ask="", prio=0)
            _chain(connect, conn)
        except Exception:
            pass
    finally:
        conn.close()
        # 只清自己的：停下來（pause／kick）後新的一輪可能已經登記了，舊的這輪收尾（叫 Hermes stop）比較慢，
        # 不能把新那輪的登記清掉（2026-11-02：之前會清掉 → 新那輪找不到 → 回答核准失敗、一直 running）
        if _tasks.get(run_id) is asyncio.current_task():
            _tasks.pop(run_id, None)
            _agents.pop(run_id, None)


def _propose_reflections(conn: sqlite3.Connection, run: dict, report: str) -> None:
    """她自己檢討的 → 筆記本「待你批准」（同一件之前還沒批的先換掉）。"""
    k = girl_key(run.get("girlId"), run.get("girlName"))
    items = reflections(report)
    if not k or not items:
        return
    conn.execute("DELETE FROM desk_lessons WHERE run_id=? AND status='proposed'", (run["id"],))
    norm = lambda x: re.sub(r"[\s。．.!！]", "", str(x))   # noqa: E731
    ks = _keys(run.get("girlId"), run.get("girlName"))
    have = {norm(r[0]) for r in conn.execute(f"SELECT text FROM desk_lessons WHERE girl_key IN ({','.join('?' * len(ks))})",
                                             ks).fetchall()}
    items = [t for t in items if norm(t) not in have]
    if not items:
        return
    for t in items:
        add_lesson(conn, k, t, girl_name=run.get("girlName") or "", source="reflect", status="proposed", run_id=run["id"])
    add_event(conn, run["id"], "main", "note", f"在筆記本寫了 {len(items)} 條這次學到的，等你批准。", "")


def _spawn(connect, run_id: int, resume: bool = False) -> None:
    if busy(run_id):
        return
    _tasks[run_id] = asyncio.create_task(drive(connect, run_id, resume))


def _begin(connect, conn: sqlite3.Connection, run: dict) -> dict:
    """排隊的那件開工（running）。出錯重來／退回重做／延伸：agent 那邊已經有 session → 照 mode 接著做。"""
    _set(conn, run["id"], status="running", started=now_ms(), finished=0, rounds=run["rounds"] + 1, agent=agent_name(), prio=0)
    again = run["rounds"] > 0 and not run.get("mode")   # 出錯後重來（不是退回重做／延伸）
    add_event(conn, run["id"], "main", "status", "重新開工。" if again else "坐下來開工了。" if not run.get("mode") else "開始做。", "")
    _spawn(connect, run["id"], resume=again and bool(run.get("session")))
    return get(conn, run["id"])


def _chain(connect, conn: sqlite3.Connection) -> None:
    """做完（或出錯）一件：她人就在書桌前 → 接著做下一件（離開書桌的話前端會叫停）。"""
    nxt = working(conn)
    if nxt and nxt["status"] in WAITING:
        _begin(connect, conn, nxt)


def start(connect, conn: sqlite3.Connection) -> dict:
    """她坐在書桌前：做她該做的那件（停著的接著做、排隊的開工）。已經在跑就照舊（重複呼叫沒事）。"""
    run = working(conn)
    if not run:
        raise DeskError("桌上沒有要做的工作", 404)
    if run["status"] == "running":
        if not busy(run["id"]):
            _spawn(connect, run["id"], resume=bool(run.get("session")))
        return run
    if run["status"] == "paused":   # 她回到書桌：同一輪、同一個 session 接著做
        _set(conn, run["id"], status="running")
        add_event(conn, run["id"], "main", "status", "回到書桌，接著做。", "")
        _spawn(connect, run["id"], resume=bool(run.get("session")))
        return get(conn, run["id"])
    return _begin(connect, conn, run)


def retry(conn: sqlite3.Connection, run_id=None) -> dict:
    """出錯的那件重來：排回隊伍（插隊，下一件就做它）。"""
    run = _pick(conn, run_id, ("failed",), "沒有出錯的工作")
    _set(conn, run["id"], status="queued", prio=1, ask="")
    add_event(conn, run["id"], "main", "status", "排回去重來。", "")
    return get(conn, run["id"])


def redo(connect, conn: sqlite3.Connection, feedback: str, run_id=None, teach: bool = False) -> dict:
    """退回重做：帶你的意見，同一件重做（插隊，下一件就做它）。"""
    run = _pick(conn, run_id, ("done",), "現在沒有交上來的報告")
    fb = " ".join(str(feedback or "").split())[:NOTE_MAX]
    if not fb:
        raise DeskError("寫一下哪裡要改")
    _set(conn, run["id"], status="queued", feedback=fb, mode="redo", prio=1)
    add_event(conn, run["id"], "main", "note", f"你退回來：{fb}", "")
    if teach:   # 以後都這樣做 → 記進她的筆記本
        k = girl_key(run.get("girlId"), run.get("girlName"))
        if k:
            add_lesson(conn, k, fb, girl_name=run.get("girlName") or "", source="teach", run_id=run["id"])
            add_event(conn, run["id"], "main", "note", "記進筆記本了，以後都會這樣做。", "ok")
    return get(conn, run["id"])


def extend(connect, conn: sqlite3.Connection, followup: str, run_id=None) -> dict:
    """延伸：這件委託算完成（前端先領金幣、委託板拿掉），工作留在桌上，她接著同一個 session 做後續（插隊）。
    quest_id 清掉：之後收下報告不會再完成一次委託。回傳的 run 帶 questId 改之前的值在 doneQuestId。"""
    run = _pick(conn, run_id, ("done",), "現在沒有交上來的報告")
    fb = " ".join(str(followup or "").split())[:NOTE_MAX]
    if not fb:
        raise DeskError("寫一下後續要做什麼")
    _set(conn, run["id"], status="queued", feedback=fb, mode="extend", quest_id="", prio=1)
    add_event(conn, run["id"], "main", "note", f"委託完成，接著做後續：{fb}", "ok")
    return {**get(conn, run["id"]), "doneQuestId": run["questId"]}


async def steer(conn: sqlite3.Connection, text: str) -> dict:
    """補充指示：她做到一半，你插一句（Hermes：正在跑就 steer，在等使魔就排到下一輪）。"""
    run = working(conn)
    text = " ".join(str(text or "").split())[:NOTE_MAX]
    if not run or run["status"] != "running":
        raise DeskError("她現在沒在做，補充不了（交了報告可以用延伸或退回重做）")
    if not text:
        raise DeskError("寫一下要補充什麼")
    agent = _agents.get(run["id"])
    if agent is None or not busy(run["id"]) or not hasattr(agent, "steer"):
        raise DeskError("她這邊的工作還沒接上，等一下再補充", 409)
    try:
        how = await agent.steer(text)
    except ValueError as e:
        raise DeskError(str(e))
    add_event(conn, run["id"], "main", "note", f"你補充：{text}" + ("（下一輪帶給她）" if how == "queued" else ""), "")
    return {"run": get(conn, run["id"]), "how": how}


def pause(conn: sqlite3.Connection) -> dict | None:
    """她離開書桌：停下來（agent 這一輪停掉；Hermes 的 session 和已經派出去的使魔留著），回來再 start。
    沒在做就什麼都不動（重複呼叫沒事）。"""
    run = working(conn)
    if not run or run["status"] != "running":
        return run
    t = _tasks.pop(run["id"], None)
    if t and not t.done():
        t.cancel()
    _agents.pop(run["id"], None)
    _set(conn, run["id"], status="paused", ask="")
    add_event(conn, run["id"], "main", "status", "她離開書桌，工作先停下來。", "")
    return get(conn, run["id"])


def kick(connect, conn: sqlite3.Connection) -> dict:
    """重新接上：她好像卡住了（一直 running 沒動靜）→ 停掉這一輪，同一個 session 叫她從做到的地方接著做。"""
    run = working(conn)
    if not run or run["status"] != "running":
        raise DeskError("她現在沒在做")
    t = _tasks.pop(run["id"], None)
    if t and not t.done():
        t.cancel()
    _agents.pop(run["id"], None)
    _set(conn, run["id"], ask="")
    add_event(conn, run["id"], "main", "status", "重新接上，叫她接著做。", "")
    _spawn(connect, run["id"], resume=bool(run.get("session")))
    return get(conn, run["id"])


def cancel(conn: sqlite3.Connection, run_id=None) -> dict | None:
    """收回一件（沒給 id：她正在做的那件）。收回正在做的 → 停掉；不會自己接著做下一件（等她坐下）。"""
    if run_id:
        run = get(conn, int(run_id))
        if not run or run["status"] not in ACTIVE:
            raise DeskError("桌上沒有這件")
    else:
        run = working(conn)
        if not run:
            return None
    t = _tasks.pop(run["id"], None)
    if t and not t.done():
        t.cancel()
    _agents.pop(run["id"], None)
    _set(conn, run["id"], status="cancelled", finished=now_ms(), ask="")
    drop_files(run["id"])
    add_event(conn, run["id"], "main", "status", "收回了。", "")
    return get(conn, run["id"])


def ask_of(run: dict | None) -> dict | None:
    try:
        a = json.loads((run or {}).get("ask") or "null")
        return a if isinstance(a, dict) else None
    except ValueError:
        return None


async def answer(conn: sqlite3.Connection, text: str) -> dict:
    """你回答她停下來問的事（核准：可以／不行；提問：照你說的）。"""
    run = working(conn)
    ask = ask_of(run)
    text = " ".join(str(text or "").split())[:NOTE_MAX]
    if not run or not ask:
        raise DeskError("現在沒有要你回答的事")
    if not text:
        raise DeskError("寫一下你的回答")
    agent = _agents.get(run["id"])
    if agent is None or not busy(run["id"]) or not hasattr(agent, "respond"):
        _set(conn, run["id"], ask="")
        raise DeskError("這個問題已經失效（工作重開過）", 409)
    try:
        choice = await agent.respond(text)
    except ValueError as e:
        raise DeskError(str(e))
    _set(conn, run["id"], ask="")
    said = {"once": "（可以）", "deny": "（不行）"}.get(choice, "")
    add_event(conn, run["id"], "main", "note", f"你回答：{text}{said}", "")
    return {"run": get(conn, run["id"]), "choice": choice}


def accept(conn: sqlite3.Connection, run_id=None) -> dict:
    run = _pick(conn, run_id, ("done",), "現在沒有交上來的報告")
    _set(conn, run["id"], status="accepted")
    add_event(conn, run["id"], "main", "status", "你收下報告，委託完成。", "ok")
    return get(conn, run["id"])


def shelve(conn: sqlite3.Connection) -> int:
    """她離開書桌：桌上交了的報告收進書櫃。→ 收了幾份。"""
    t = now_ms()
    ids = [r[0] for r in conn.execute("SELECT id FROM desk_runs WHERE status='done' AND shelved=0").fetchall()]
    for rid in ids:
        _set(conn, rid, shelved=t)
        add_event(conn, rid, "main", "status", "她離開書桌，報告收進書櫃了。", "")
    return len(ids)


def remove(conn: sqlite3.Connection, run_id) -> dict:
    """從書櫃丟掉一件（收下的、或收進書櫃還沒看的報告）：連日誌一起刪，回不來。"""
    run = get(conn, int(run_id or 0))
    if not run or not (run["status"] == "accepted" or (run["status"] == "done" and run["shelved"])):
        raise DeskError("書櫃裡沒有這件", 404)
    conn.execute("DELETE FROM desk_events WHERE run_id=?", (run["id"],))
    conn.execute("DELETE FROM desk_runs WHERE id=?", (run["id"],))
    conn.commit()
    drop_files(run["id"])
    return _brief(run)


# ───────────────────────────── 她的筆記本

def girl_key(girl_id: str = "", girl_name: str = "") -> str:
    """筆記本歸誰：有 id 用 id，沒有用名字。"""
    gid, name = str(girl_id or "").strip(), str(girl_name or "").strip()
    return gid or (f"name:{name}" if name else "")


def _keys(girl_id: str = "", girl_name: str = "") -> list[str]:
    """這個妹子的筆記可能記在哪：id，和舊的只有名字的那本（沒有 id 時放上桌的）。"""
    out = [girl_key(girl_id, girl_name)]
    if girl_name and str(girl_id or "").strip():
        out.append(f"name:{str(girl_name).strip()}")
    return [k for k in out if k]


_LESSON_COLS = "id, girl_key, girl_name, text, source, status, run_id, created"


def _lesson(r) -> dict:
    return dict(zip(("id", "girlKey", "girlName", "text", "source", "status", "runId", "created"), r))


def add_lesson(conn: sqlite3.Connection, key: str, text: str, *, girl_name: str = "", source: str = "write",
               status: str = "active", run_id: int = 0) -> dict:
    text = " ".join(str(text or "").split()) if source == "reflect" else str(text or "").strip()
    if not key:
        raise DeskError("不知道是哪個妹子的筆記本")
    if not text:
        raise DeskError("筆記是空的")
    if source not in ("teach", "write", "reflect") or status not in ("active", "proposed"):
        raise DeskError("筆記的來源／狀態不對")
    cur = conn.execute("INSERT INTO desk_lessons (girl_key, girl_name, text, source, status, run_id, created) VALUES (?,?,?,?,?,?,?)",
                       (key, str(girl_name or "")[:60], text[:LESSON_MAX], source, status, int(run_id or 0), now_ms()))
    conn.commit()
    return _lesson(conn.execute(f"SELECT {_LESSON_COLS} FROM desk_lessons WHERE id=?", (cur.lastrowid,)).fetchone())


def update_lesson(conn: sqlite3.Connection, lesson_id, text: str | None = None, status: str | None = None) -> dict:
    row = conn.execute(f"SELECT {_LESSON_COLS} FROM desk_lessons WHERE id=?", (int(lesson_id or 0),)).fetchone()
    if not row:
        raise DeskError("沒有這條筆記", 404)
    if text is not None:
        text = str(text).strip()
        if not text:
            raise DeskError("筆記是空的")
        conn.execute("UPDATE desk_lessons SET text=? WHERE id=?", (text[:LESSON_MAX], row[0]))
    if status is not None:
        if status not in ("active", "proposed"):
            raise DeskError("筆記的狀態不對")
        conn.execute("UPDATE desk_lessons SET status=? WHERE id=?", (status, row[0]))
    conn.commit()
    return _lesson(conn.execute(f"SELECT {_LESSON_COLS} FROM desk_lessons WHERE id=?", (row[0],)).fetchone())


def delete_lesson(conn: sqlite3.Connection, lesson_id) -> None:
    if not conn.execute("DELETE FROM desk_lessons WHERE id=?", (int(lesson_id or 0),)).rowcount:
        raise DeskError("沒有這條筆記", 404)
    conn.commit()


def notebooks(conn: sqlite3.Connection) -> list[dict]:
    """全部妹子的筆記本（有筆記、或做過工作的）：[{girlKey, girlName, lessons:[…新的在前]}]。"""
    books: dict[str, dict] = {}
    for gid, name in conn.execute("SELECT girl_id, girl_name FROM desk_runs ORDER BY id DESC").fetchall():
        k = girl_key(gid, name)
        if k and k not in books:
            books[k] = {"girlKey": k, "girlName": name, "lessons": []}
    for r in conn.execute(f"SELECT {_LESSON_COLS} FROM desk_lessons ORDER BY id DESC").fetchall():
        L = _lesson(r)
        b = books.setdefault(L["girlKey"], {"girlKey": L["girlKey"], "girlName": L["girlName"], "lessons": []})
        b["girlName"] = b["girlName"] or L["girlName"]
        b["lessons"].append(L)
    # 只有名字的那本併進同名、有 id 的那本（同一個妹子）
    named = {b["girlName"]: b for k, b in books.items() if not k.startswith("name:") and b["girlName"]}
    for k in [k for k in books if k.startswith("name:")]:
        to = named.get(k[5:])
        if to:
            to["lessons"] = sorted(to["lessons"] + books.pop(k)["lessons"], key=lambda L: -L["id"])
    return list(books.values())


def lesson_lines(conn: sqlite3.Connection, run: dict) -> list[str]:
    """這件工作的妹子的筆記（批准過的），給 agent。"""
    ks = _keys(run.get("girlId"), run.get("girlName"))
    if not ks:
        return []
    rows = conn.execute(f"SELECT text FROM desk_lessons WHERE girl_key IN ({','.join('?' * len(ks))}) AND status='active' "
                        "ORDER BY id DESC LIMIT ?", (*ks, LESSONS_IN_PROMPT)).fetchall()
    return [r[0] for r in reversed(rows)]


def reflections(report: str) -> list[str]:
    """報告裡「## 這次學到的」底下的條列（她自己檢討的，最多 3 條；寫「無」就沒有）。"""
    out, inside = [], False
    for line in str(report or "").splitlines():
        h = re.match(r"^\s*#{1,4}\s*(.*)", line)
        if h:
            inside = REFLECT_HEAD in h.group(1)
            continue
        if not inside:
            continue
        m = re.match(r"^\s*(?:[-*•]|\d+[.)])\s+(.*)", line)
        t = (m.group(1) if m else "").strip().strip("。").strip()
        if t and t not in ("無", "沒有", "none", "None"):
            out.append(t + "。")
    return out[:3]


def shelf(conn: sqlite3.Connection) -> dict:
    """書櫃：等你看的報告（收進來的 done）＋收下的（accepted，新的在前）。"""
    pending = conn.execute(f"SELECT {_RUN_COLS} FROM desk_runs WHERE status='done' AND shelved>0 ORDER BY finished ASC, id ASC").fetchall()
    done = conn.execute(f"SELECT {_RUN_COLS} FROM desk_runs WHERE status='accepted' ORDER BY finished DESC, id DESC LIMIT ?",
                        (SHELF_MAX,)).fetchall()
    total = conn.execute("SELECT COUNT(*) FROM desk_runs WHERE status='accepted'").fetchone()[0]
    return {"pending": [_brief(_row(r)) for r in pending], "done": [_brief(_row(r)) for r in done], "doneTotal": total}


def resume_all(connect) -> int:
    """伺服器重開：還在 running 的接著跑（mock 從頭再跑一次）。"""
    conn = connect()
    try:
        rows = conn.execute("SELECT id FROM desk_runs WHERE status='running'").fetchall()
        for (rid,) in rows:
            add_event(conn, rid, "main", "status", "伺服器重開，接著做。", "")
            _spawn(connect, rid, resume=True)
        return len(rows)
    finally:
        conn.close()


def _brief(run: dict) -> dict:
    out = {k: run[k] for k in ("id", "questId", "title", "girlName", "status", "note", "finished", "mode", "feedback", "prio", "shelved")}
    if run["status"] in ("done", "accepted", "failed"):
        out["nfiles"] = len(list_files(run["id"]))
    return out


def view(conn: sqlite3.Connection, since: int = 0, since_id: int = 0) -> dict:
    """桌上全部：她正在做的那件（run＋事件，since 只在同一件時有效）、排隊的、交上來的報告、出錯的。"""
    run = working(conn)
    out = {"run": None, "events": [], "summary": summary(conn, None), "agent": agent_name(),
           "queue": [_brief(r) for r in queue(conn) if not run or r["id"] != run["id"]],
           "reports": [_brief(r) for r in listed(conn, "done") if not r["shelved"]],
           "shelf": shelf(conn),
           "notesPending": conn.execute("SELECT COUNT(*) FROM desk_lessons WHERE status='proposed'").fetchone()[0],
           "failed": [_brief(r) for r in listed(conn, "failed")]}
    if run:
        out["run"] = {**run, "report": "", "ask": ask_of(run)}
        out["events"] = events(conn, run["id"], since if since_id == run["id"] else 0)
        out["summary"] = summary(conn, run)
        out["busy"] = busy(run["id"])
    return out


def detail(conn: sqlite3.Connection, run_id: int) -> dict:
    """一件的全部（報告書、出錯的日誌、書櫃裡收下的用）。"""
    run = get(conn, int(run_id))
    if not run or run["status"] not in (*ACTIVE, "accepted"):
        raise DeskError("桌上沒有這件", 404)
    return {"run": {**run, "ask": ask_of(run)}, "events": events(conn, run["id"], 0), "summary": summary(conn, run),
            "files": list_files(run["id"]),
            "lessons": [_lesson(r) for r in conn.execute(f"SELECT {_LESSON_COLS} FROM desk_lessons WHERE run_id=? ORDER BY id",
                                                          (run["id"],)).fetchall()]}
