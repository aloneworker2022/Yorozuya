"""python tests/room_frames_test.py — 牆上的相框（server/room_frames.py）：請她寫 → 做完她自己掛、掛滿擋、只有玩家拿下、檔案路徑不能跑出去。"""
import asyncio
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
os.environ["DESK_AGENT"] = "mock"
os.environ["DESK_MOCK_STEP_S"] = "0.01"
os.environ["DESK_FILES_DIR"] = tempfile.mkdtemp()
os.environ["FRAMES_DIR"] = tempfile.mkdtemp()
import desk_agent as D  # noqa: E402
import room_frames as F  # noqa: E402

DB = Path(tempfile.mkdtemp()) / "frames.db"
D.ON_DONE.append(F.on_done)


def connect():
    c = sqlite3.connect(DB)
    D.init(c)
    F.init(c)
    return c


async def finish(run_id, timeout=5.0):
    c = connect()
    D.start(connect, c)
    c.close()
    t0 = asyncio.get_running_loop().time()
    while asyncio.get_running_loop().time() - t0 < timeout:
        c = connect()
        st = D.get(c, run_id)["status"]
        c.close()
        if st == "done":
            return
        await asyncio.sleep(0.02)
    raise AssertionError("mock agent 沒做完")


async def main():
    c = connect()
    # 請她寫 → 做完她自己掛在指定的那格
    run = F.ask(c, 2, "會動的愛心", girl_name="莉莉")
    assert run["title"].startswith(F.ASK_MARK)
    assert [w["slot"] for w in F.wants(c)] == [2]
    c.close()
    await finish(run["id"])
    c = connect()
    fr = F.frames(c)
    assert fr[2] and fr[2]["by"] == "her" and fr[2]["entry"] == "index.html" and fr[2]["title"] == "會動的愛心", fr
    assert not F.wants(c)
    assert F.file_path(fr[2]["fid"], "index.html").read_text(encoding="utf-8").startswith("<!doctype html>")
    # 你掛：第一個空位；掛滿擋；那格有東西擋
    for want in (0, 1, 3):
        assert F.hang(c, run["id"])["slot"] == want
    for bad in (lambda: F.hang(c, run["id"]), lambda: F.ask(c, 1, "x")):
        try:
            bad()
            raise AssertionError("掛滿了應該擋")
        except F.FrameError as e:
            assert e.status == 409
    assert F.candidates(c)[0]["files"] == ["index.html"]
    # 拿下來（玩家），檔案刪掉，空出來可以再掛
    gone = F.unhang(c, 1)
    assert F.frames(c)[1] is None and not (F.root() / gone["fid"]).exists()
    assert F.hang(c, run["id"], "index.html", 1)["slot"] == 1
    # 她請寫的那件做完時牆上全滿 → 不掛、不換掉別人的
    F.unhang(c, 0)
    run2 = F.ask(c, 0, "第二幅")
    F.hang(c, run["id"], slot=0)
    c.close()
    await finish(run2["id"])
    c = connect()
    assert all(F.frames(c)) and all(f["runId"] == run["id"] for f in F.frames(c)), "滿了她不該換掉牆上的"
    # 不能跑出資料夾；不是 html 不能掛
    for fid, path in ((F.frames(c)[0]["fid"], "../x"), ("..", "game.db"), (F.frames(c)[0]["fid"], ".hidden")):
        try:
            F.file_path(fid, path)
            raise AssertionError("路徑跑出去了")
        except F.FrameError:
            pass
    F.unhang(c, 3)
    try:
        F.hang(c, run["id"], "重點.csv", 3)
        raise AssertionError("csv 不能掛")
    except F.FrameError:
        pass
    c.close()
    print("room_frames ok")
    modes(run["id"])
    await jobs(run["id"])


async def jobs(run_id):
    """作業時間到自動排書桌更新：台北時區、每窗一次、不堆疊、做完覆蓋原幅。"""
    from datetime import datetime
    tpe = lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=F.TPE)
    c = connect()
    for s in range(F.SLOTS):
        if F.frames(c)[s]:
            F.unhang(c, s)
    for r in c.execute("SELECT id FROM desk_runs WHERE status IN ('queued','placed','running','paused')").fetchall():
        D.cancel(c, r[0])
    f = F.hang(c, run_id, "index.html", 0)
    noon, eve, closed = tpe("2026-11-18 12:00"), tpe("2026-11-18 19:30"), tpe("2026-11-18 22:00")
    # 沒設誰來用、沒設時間：不排
    assert F.due_jobs(c, eve) == []
    assert F.window_id(F.default_mode(), eve) is None
    F.set_mode(c, 0, {"operator": "her", "viewers": ["you"]})  # 時間空＝不自動作業，但她會知道
    assert F.window_id(F.get_mode(c, 0), eve) is None
    assert F.due_jobs(c, eve) == []
    assert F.she_knows(F.frames(c)[0], noon) and not F.can_view(F.frames(c)[0], "her", noon)
    F.set_mode(c, 0, {"operator": "her", "viewers": ["you"], "start": "18:00", "end": "22:00"})
    assert F.window_id(F.get_mode(c, 0), noon) is None
    assert F.window_id(F.get_mode(c, 0), eve) == "2026-11-18T18:00"
    assert F.window_id(F.get_mode(c, 0), closed) is None
    assert F.she_knows(F.frames(c)[0], eve) and not F.she_knows(F.frames(c)[0], noon)
    assert not F.can_view(F.frames(c)[0], "her", eve), "不必勾「她」也會知道，但不等於她打開看得到內容"
    # 跨午夜：同一窗
    night = {"start": "22:00", "end": "02:00"}
    assert F.window_id(night, tpe("2026-11-18 23:10")) == "2026-11-18T22:00"
    assert F.window_id(night, tpe("2026-11-19 01:00")) == "2026-11-18T22:00"
    assert F.window_id(night, tpe("2026-11-19 22:05")) == "2026-11-19T22:00"
    assert F.window_id(night, tpe("2026-11-19 03:00")) is None
    out = F.due_jobs(c, eve)
    assert len(out) == 1 and out[0]["title"].startswith(F.UPDATE_MARK), out
    assert f["fid"] in (out[0].get("note") or "") and "18:00" in (out[0].get("note") or "")
    assert F.due_jobs(c, eve) == [] and F.due_jobs(c, tpe("2026-11-18 20:10")) == []
    rid = out[0]["id"]
    c.close()
    await finish(rid)
    c = connect()
    html = F.file_path(f["fid"], "index.html").read_text(encoding="utf-8")
    assert F.UPDATE_MARK.split("的")[0] in html or "更新牆上" in html or F.frames(c)[0]["runId"] == rid
    assert F.frames(c)[0]["fid"] == f["fid"] and F.frames(c)[0]["mode"]["operator"] == "her"
    assert F.due_jobs(c, eve) == [], "同一窗做完也不再排"
    nxt = F.due_jobs(c, tpe("2026-11-19 18:05"))
    assert len(nxt) == 1 and nxt[0]["id"] != rid
    # 桌上這件還沒做完：隔天視窗也不再堆
    assert F.due_jobs(c, tpe("2026-11-20 18:05")) == []
    D.cancel(c, nxt[0]["id"])
    # 只有 Hermes：也排書桌（不走路是客戶端的事）
    F.set_mode(c, 0, {"operator": "hermes", "viewers": ["you"], "start": "09:00", "end": "11:00"})
    herm = F.due_jobs(c, tpe("2026-11-18 09:30"))
    assert len(herm) == 1
    D.cancel(c, herm[0]["id"])
    c.close()
    print("room_frames jobs ok")


def modes(run_id):
    """使用者模式（2026-11-12）：預設、驗證、時間窗、拿下來再掛回去設定還在、同頁兩格各自設定、舊 DB 升級。"""
    from datetime import datetime
    c = connect()
    for s in range(F.SLOTS):
        if F.frames(c)[s]:
            F.unhang(c, s)
    f = F.hang(c, run_id, "index.html", 1)
    # 預設：只有你看得到、誰來用沒選；她和 Hermes 看不到
    assert f["mode"] == F.default_mode(), f["mode"]
    assert F.can_view(f, "you") and not F.can_view(f, "her") and not F.can_view(f, "hermes")
    # 驗證
    for bad in ({"operator": "boss"}, {"viewers": ["you", "cat"]}, {"start": "18:00"}, {"start": "25:00", "end": "26:00"},
                {"start": "18:00", "end": "18:00"}, {"dateFrom": "2026-13-01"}, {"dateFrom": "2026-12-02", "dateTo": "2026-12-01"},
                {"viewers": 3}):
        try:
            F.set_mode(c, 1, bad)
            raise AssertionError(f"應該擋：{bad}")
        except F.FrameError as e:
            assert e.status == 400, (bad, e.status)
    try:
        F.set_mode(c, 0, {"operator": "her"})
        raise AssertionError("空位不能設")
    except F.FrameError as e:
        assert e.status == 404
    # 設定 → 帶在 frames()、get_mode
    m = F.set_mode(c, 1, {"operator": "both", "viewers": ["her", "you", "hermes"], "start": "18:00", "end": "22:00",
                          "dateFrom": "2026-11-01", "dateTo": ""})["mode"]
    assert m["operator"] == "both" and m["viewers"] == ["you", "her", "hermes"] and m["start"] == "18:00", m
    assert F.get_mode(c, 1) == m == F.frames(c)[1]["mode"]
    tpe = lambda s: datetime.strptime(s, "%Y-%m-%d %H:%M").replace(tzinfo=F.TPE)
    fr = F.frames(c)[1]
    assert F.can_view(fr, "her", tpe("2026-11-12 19:30"))
    assert not F.can_view(fr, "her", tpe("2026-11-12 22:00")) and not F.can_view(fr, "her", tpe("2026-11-12 08:00"))
    assert not F.can_view(fr, "her", tpe("2026-10-31 19:00")), "開始日期前看不到"
    # 跨午夜
    assert F.in_window({"start": "22:00", "end": "02:00"}, tpe("2026-11-12 23:10"))
    assert F.in_window({"start": "22:00", "end": "02:00"}, tpe("2026-11-13 01:59"))
    assert not F.in_window({"start": "22:00", "end": "02:00"}, tpe("2026-11-13 02:00"))
    # 拿下來再掛回去（新的 fid）→ 設定還在；同頁另一格各自設
    F.unhang(c, 1)
    back = F.hang(c, run_id, "index.html", 2)
    assert back["fid"] != fr["fid"] and back["mode"]["operator"] == "both" and back["mode"]["start"] == "18:00", back["mode"]
    F.set_mode(c, 2, {"operator": "hermes", "viewers": ["hermes"]})
    other = F.hang(c, run_id, "index.html", 3)
    assert other["mode"]["operator"] == "hermes"            # 抄最近那次
    F.set_mode(c, 3, {"operator": "her", "viewers": ["you", "her"]})
    assert F.frames(c)[2]["mode"]["operator"] == "hermes", "同頁兩格各自設定"
    # 不勾你：你打不開內容（外層仍可設定）
    assert not F.can_view(F.frames(c)[2], "you")
    c.close()
    # 舊 DB：init 再跑一次不會壞，資料還在
    c = connect()
    assert F.frames(c)[3]["mode"]["operator"] == "her"
    c.close()
    print("room_frames modes ok")


asyncio.run(main())
