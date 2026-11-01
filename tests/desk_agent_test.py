"""python tests/desk_agent_test.py — 她桌上的工作（server/desk_agent.py）：放上桌、開工、事件、報告、退回、收下、收回。"""
import asyncio
import os
import sqlite3
import sys
import tempfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
os.environ["DESK_AGENT"] = "mock"
os.environ["DESK_MOCK_STEP_S"] = "0.01"
import desk_agent as D  # noqa: E402

DB = Path(tempfile.mkdtemp()) / "desk.db"


def connect():
    c = sqlite3.connect(DB)
    D.init(c)
    return c


async def wait_status(want, timeout=5.0):
    t0 = asyncio.get_running_loop().time()
    while asyncio.get_running_loop().time() - t0 < timeout:
        c = connect()
        run = D.current(c) or {}
        c.close()
        if run.get("status") == want:
            return run
        await asyncio.sleep(0.02)
    raise AssertionError(f"沒等到 {want}")


async def main():
    c = connect()
    assert D.view(c)["run"] is None

    # 放上桌；一次只能一件
    run = D.put(c, quest_id="q1", title="  寫 季報  ", girl_id="g1", girl_name="小夜")
    assert run["status"] == "placed" and run["title"] == "寫 季報"
    try:
        D.put(c, quest_id="q2", title="另一件")
        raise AssertionError("桌上有東西還能放")
    except D.DeskError as e:
        assert e.status == 409 and "寫 季報" in str(e)
    try:
        D.put(c, quest_id="q3", title="   ")
        raise AssertionError("空的也能放")
    except D.DeskError:
        pass

    # 開工 → 事件一路進來 → 報告
    run = D.start(connect, c)
    assert run["status"] == "running" and run["rounds"] == 1
    D.start(connect, c)   # 重複叫沒事
    run = await wait_status("done")
    assert "寫 季報" in run["report"]
    v = D.view(c)
    kinds = {(e["actor"], e["kind"]) for e in v["events"]}
    for want in [("main", "plan"), ("main", "tool"), ("main", "trouble"), ("sub:1", "spawn"), ("sub:2", "done"),
                 ("ext:claude", "dispatch"), ("main", "report")]:
        assert want in kinds, want
    seqs = [e["seq"] for e in v["events"]]
    assert seqs == sorted(seqs) and len(set(seqs)) == len(seqs)
    s = v["summary"]
    assert [x["id"] for x in s["subs"]] == ["sub:1", "sub:2"] and all(x["status"] == "ok" for x in s["subs"])
    assert s["subs"][0]["goal"].startswith("整理") and s["exts"][0]["id"] == "ext:claude"
    assert s["trouble"] is None, "卡住後來解決了"
    assert v["run"]["report"], "交上來才帶報告"
    # since：只拿之後的
    last = seqs[-1]
    assert D.view(c, last)["events"] == []

    # 退回重做：要寫意見；帶著意見再跑一輪
    try:
        D.redo(connect, c, "  ")
        raise AssertionError("沒意見也能退")
    except D.DeskError:
        pass
    D.redo(connect, c, "結論寫短一點")
    run = await wait_status("done")
    assert run["rounds"] == 2 and "結論寫短一點" in run["report"]
    assert any(e["kind"] == "note" for e in D.view(c)["events"])

    # 收下 → 桌上清空，可以放下一件
    D.accept(c)
    assert D.current(c) is None
    D.put(c, quest_id="q2", title="整理收據")
    D.start(connect, c)
    await asyncio.sleep(0.03)
    # 做到一半收回：停掉、桌上清空，不會再交報告
    D.cancel(c)
    assert D.current(c) is None
    await asyncio.sleep(0.3)
    row = c.execute("SELECT status, report FROM desk_runs ORDER BY id DESC LIMIT 1").fetchone()
    assert row == ("cancelled", ""), row

    # 沒這種 agent → failed（桌上還在，可以重來）
    D.put(c, title="測 agent 名")
    os.environ["DESK_AGENT"] = "nope"
    D.start(connect, c)
    run = await wait_status("failed")
    assert any(e["kind"] == "error" for e in D.view(c)["events"])
    os.environ["DESK_AGENT"] = "mock"
    D.start(connect, c)
    await wait_status("done")
    c.close()
    print("desk_agent: ok")


asyncio.run(main())
