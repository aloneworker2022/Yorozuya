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


def ev(c):
    """最相關那件的全部事件（做完的也看得到）。"""
    return D.detail(c, D.current(c)["id"])["events"]


async def main():
    c = connect()
    assert D.view(c)["run"] is None

    # 放上桌（排隊）；同一件委託不能放兩次
    run = D.put(c, quest_id="q1", title="  寫 季報  ", girl_id="g1", girl_name="小夜")
    assert run["status"] == "queued" and run["title"] == "寫 季報" and run["pos"] == 1
    rid = run["id"]
    try:
        D.put(c, quest_id="q1", title="寫 季報")
        raise AssertionError("同一件放兩次")
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
    v = D.detail(c, rid)
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
    # 做完：不再是她正在做的，報告疊在桌上
    vv = D.view(c)
    assert vv["run"] is None and [r["id"] for r in vv["reports"]] == [rid]

    # 退回重做：要寫意見；帶著意見再跑一輪
    try:
        D.redo(connect, c, "  ")
        raise AssertionError("沒意見也能退")
    except D.DeskError:
        pass
    D.redo(connect, c, "結論寫短一點")
    assert D.current(c)["status"] == "queued" and D.current(c)["prio"] == 1
    D.start(connect, c)
    run = await wait_status("done")
    assert run["rounds"] == 2 and "結論寫短一點" in run["report"]
    assert any(e["kind"] == "note" for e in ev(c))

    # 收下 → 桌上清空，可以放下一件
    D.accept(c)
    assert D.current(c) is None
    run2 = D.put(c, quest_id="q2", title="整理收據", note="只要今年的")
    assert run2["note"] == "只要今年的" and "說明：只要今年的" in ev(c)[0]["text"]
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
    assert any(e["kind"] == "error" for e in ev(c))
    os.environ["DESK_AGENT"] = "mock"
    assert D.view(c)["failed"] and D.view(c)["run"] is None, "出錯的不擋路，等你重來"
    D.retry(c)
    assert D.current(c)["status"] == "queued"
    D.start(connect, c)
    await wait_status("done")
    # 她停下來問你（DESK_MOCK_ASK=1）：桌上記著問題 → 聽不懂的回答擋下 → 「可以」→ 接著做完
    D.accept(c)
    os.environ["DESK_MOCK_ASK"] = "1"
    D.put(c, title="要核准的")
    D.start(connect, c)
    for _ in range(300):
        v = D.view(c)
        if v["run"]["ask"]:
            break
        await asyncio.sleep(0.01)
    assert v["run"]["ask"]["kind"] == "approval" and "save_notes" in v["run"]["ask"]["text"]
    assert any(e["kind"] == "ask" and e["text"].startswith("要你決定") for e in v["events"])
    try:
        await D.answer(c, "我再想想")
        raise AssertionError("聽不懂也收")
    except D.DeskError as e:
        assert "可以" in str(e)
    assert D.ask_of(D.current(c)), "聽不懂的回答不算，問題還在"
    r = await D.answer(c, "可以啊")
    assert r["choice"] == "once"
    assert D.ask_of(D.current(c)) is None
    run = await wait_status("done")
    assert any(e["text"].startswith("你回答：") for e in ev(c))
    try:
        await D.answer(c, "可以")
        raise AssertionError("沒在問還能回答")
    except D.DeskError:
        pass
    assert D.approval_choice("不可以") == "deny" and D.approval_choice("好啊") == "once" and D.approval_choice("我再想想") is None
    os.environ.pop("DESK_MOCK_ASK")

    # 延伸：報告交了 → 委託算完成（quest_id 清掉）、工作留在桌上接著做後續 → 新報告有延伸段落
    D.accept(c)
    D.put(c, quest_id="q9", title="寫季報")
    D.start(connect, c)
    await wait_status("done")
    try:
        D.extend(connect, c, "  ")
        raise AssertionError("沒寫後續也能延伸")
    except D.DeskError:
        pass
    run = D.extend(connect, c, "再寫一份給老闆的一頁摘要")
    assert run["status"] == "queued" and run["questId"] == "" and run["mode"] == "extend" and run["doneQuestId"] == "q9"
    D.start(connect, c)
    run = await wait_status("done")
    assert "延伸" in run["report"] and "一頁摘要" in run["report"] and run["rounds"] == 2
    assert any("委託完成，接著做後續" in e["text"] for e in ev(c))

    # 補充指示：做到一半插一句 → 記在日誌、報告照著寫；沒在做時不行
    try:
        await D.steer(c, "多寫一點")
        raise AssertionError("交了報告還能補充")
    except D.DeskError:
        pass
    D.accept(c)
    os.environ["DESK_MOCK_STEP_S"] = "0.05"
    D.put(c, title="慢慢做的")
    D.start(connect, c)
    await asyncio.sleep(0.1)
    r = await D.steer(c, "記得附上來源")
    assert r["how"] == "live" and any(e["text"] == "你補充：記得附上來源" for e in ev(c))
    run = await wait_status("done")
    assert "記得附上來源" in run["report"]
    os.environ["DESK_MOCK_STEP_S"] = "0.01"

    # 她離開書桌 → 停下來（paused、agent 停掉、不會交報告）；坐回來 → 接著做到交報告
    D.accept(c)
    os.environ["DESK_MOCK_STEP_S"] = "0.05"
    D.put(c, title="會被打斷的")
    D.start(connect, c)
    await asyncio.sleep(0.1)
    run = D.pause(c)
    assert run["status"] == "paused" and not D.busy(run["id"])
    assert D.pause(c)["status"] == "paused", "重複叫沒事"
    await asyncio.sleep(0.6)
    assert D.current(c)["status"] == "paused" and D.current(c)["report"] == "", "停著不會交報告"
    try:
        await D.steer(c, "停著也想補充")
        raise AssertionError("停著還能補充")
    except D.DeskError:
        pass
    run = D.start(connect, c)
    assert run["status"] == "running" and run["rounds"] == 1, "接著做，不算新的一輪"
    run = await wait_status("done")
    texts = [e["text"] for e in ev(c)]
    assert "她離開書桌，工作先停下來。" in texts and "回到書桌，接著做。" in texts
    os.environ["DESK_MOCK_STEP_S"] = "0.01"

    # 停下來馬上又坐回來：舊的那輪收尾（叫 Hermes stop）比較慢，不能把新那輪的登記清掉
    class SlowStop:
        def __init__(self):
            self.on_ask = None
        async def run(self, run, emit, store=None):
            try:
                await asyncio.sleep(0.3)
            except asyncio.CancelledError:
                await asyncio.shield(asyncio.sleep(0.15))   # 收尾很慢
                raise
            return "# ok"
        async def steer(self, text):
            return "live"
    real = D.make_agent
    D.make_agent = lambda: SlowStop()
    D.accept(c)
    D.put(c, title="停下來又坐回來")
    D.start(connect, c)
    await asyncio.sleep(0.05)
    D.pause(c)
    D.start(connect, c)
    rid = D.current(c)["id"]
    await asyncio.sleep(0.2)   # 舊的那輪這時收尾完
    assert D.busy(rid) and rid in D._agents, "新那輪的登記還在"
    assert (await D.steer(c, "還接得上嗎"))["how"] == "live"
    await wait_status("done")

    # 重新接上（卡住時）：停掉這一輪、接著做；沒在做時不行
    D.accept(c)
    D.put(c, title="卡住的")
    D.start(connect, c)
    await asyncio.sleep(0.05)
    run = D.kick(connect, c)
    assert run["status"] == "running" and any(e["text"] == "重新接上，叫她接著做。" for e in ev(c))
    await wait_status("done")
    try:
        D.kick(connect, c)
        raise AssertionError("沒在做也能重新接上")
    except D.DeskError:
        pass
    D.make_agent = real

    # 一次放很多件：照順序做、做完一件接著下一件（報告疊在桌上）；退回重做插隊；收下指定那份
    for r in D.view(c)["reports"]:
        D.accept(c, r["id"])
    os.environ["DESK_MOCK_STEP_S"] = "0.02"
    a = D.put(c, quest_id="qa", title="第一件")
    b = D.put(c, quest_id="qb", title="第二件", note="附註")
    d = D.put(c, quest_id="qd", title="第三件")
    assert (a["pos"], b["pos"], d["pos"]) == (1, 2, 3)
    v = D.view(c)
    assert v["run"]["id"] == a["id"] and [q["id"] for q in v["queue"]] == [b["id"], d["id"]]
    D.start(connect, c)
    for _ in range(400):
        if D.get(c, a["id"])["status"] == "done" and D.get(c, b["id"])["status"] == "running":
            break
        await asyncio.sleep(0.01)
    assert D.get(c, b["id"])["status"] == "running", "做完一件自己接著下一件"
    D.redo(connect, c, "第一件改短一點", a["id"])
    v = D.view(c)
    assert v["run"]["id"] == b["id"] and [q["id"] for q in v["queue"]] == [a["id"], d["id"]], "退回的插隊到下一件"
    order = []
    for _ in range(1500):
        for rid_ in (a["id"], d["id"]):
            if D.get(c, rid_)["status"] == "running" and rid_ not in order:
                order.append(rid_)
        if all(D.get(c, x)["status"] == "done" for x in (a["id"], b["id"], d["id"])):
            break
        await asyncio.sleep(0.01)
    assert order == [a["id"], d["id"]], order
    v = D.view(c)
    assert v["run"] is None and len(v["reports"]) == 3
    D.accept(c, b["id"])
    assert [r["id"] for r in D.view(c)["reports"]] == [a["id"], d["id"]]
    assert "改短一點" in D.detail(c, a["id"])["run"]["report"]
    D.cancel(c, d["id"])
    assert [r["id"] for r in D.view(c)["reports"]] == [a["id"]]
    os.environ["DESK_MOCK_STEP_S"] = "0.01"
    c.close()
    print("desk_agent: ok")


asyncio.run(main())
