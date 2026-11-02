"""python tests/desk_hermes_test.py — 書桌 → Hermes 接頭（server/desk_hermes.py），用假的 Hermes（httpx.MockTransport）。
假 Hermes 照 2026-11-01 在 RP5（v0.22.2+3291）實測的樣子：delegate_task 先失敗兩次、使魔在背景跑、
session 裡多 dispatched 的 tool 訊息、做完多一則「[ASYNC DELEGATION BATCH COMPLETE — deleg_…]」、API server 不會自己接著做。"""
import asyncio
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
try:
    import httpx
except ImportError:
    print("desk_hermes: 跳過（沒裝 httpx：pip install -r server/requirements.txt）")
    sys.exit(0)
import desk_hermes as H  # noqa: E402


def sse(events):
    out = []
    for i, e in enumerate(events):
        out.append(f"id: {i + 1}\ndata: {json.dumps({**e, 'seq': i}, ensure_ascii=False)}\n")
    out.append(": stream closed\n")
    return "\n".join(out).encode()


class FakeHermes:
    def __init__(self, script, hang=False, key="k"):
        self.script, self.hang, self.key = script, hang, key
        self.inputs, self.stopped, self.msgs, self.msg_id, self.polls = [], [], [], 100, 0
        self.pending_done = []   # 使魔回報：被 GET messages 看一次之後才出現（模擬背景跑一下）

    def add(self, role, content):
        self.msg_id += 1
        self.msgs.append({"id": self.msg_id, "role": role, "content": content})

    def handler(self, req: httpx.Request):
        if req.headers.get("authorization") != f"Bearer {self.key}":
            return httpx.Response(401, json={"error": "bad key"})
        p, m = req.url.path, req.method
        if m == "GET" and p == "/v1/capabilities" and getattr(self, "caps", False):
            return httpx.Response(200, json={"features": {"run_submission": True, "run_events_sse": True}})
        if m == "POST" and p == "/api/sessions":
            return httpx.Response(200, json={"object": "hermes.session", "session": {"id": "api_1"}})
        if m == "POST" and p == "/v1/runs":
            body = json.loads(req.content)
            assert body["session_id"] == "api_1"
            self.inputs.append(body["input"])
            self.add("user", body["input"])
            return httpx.Response(200, json={"run_id": f"run_{len(self.inputs)}", "status": "started"})
        if m == "GET" and p.startswith("/v1/runs/") and p.endswith("/events"):
            k = int(p.split("/")[3].split("_")[1])
            if self.hang:
                class Slow(httpx.AsyncByteStream):
                    async def __aiter__(self_inner):
                        yield b'data: {"event": "tool.started", "tool": "web_search", "preview": "x", "seq": 0}\n\n'
                        await asyncio.sleep(30)
                return httpx.Response(200, stream=Slow())
            step = self.script[k - 1]
            for role, content in step.get("msgs", []):
                self.add(role, content)
            self.pending_done += step.get("later", [])
            return httpx.Response(200, content=sse(step["events"]), headers={"content-type": "text/event-stream"})
        if m == "GET" and p == "/api/sessions/api_1/messages":
            self.polls += 1
            if self.polls >= 2:
                for role, content in self.pending_done:
                    self.add(role, content)
                self.pending_done = []
            return httpx.Response(200, json={"messages": self.msgs})
        if m == "POST" and p.endswith("/stop"):
            self.stopped.append(p)
            return httpx.Response(200, json={"status": "stopping"})
        return httpx.Response(404, json={"error": p})


DISPATCH = json.dumps({"status": "dispatched", "mode": "background", "count": 2, "delegation_id": "deleg_dffab347",
                       "goals": ["列出三個台灣城市", "查每個城市的人口"]}, ensure_ascii=False)
DONE = "[ASYNC DELEGATION BATCH COMPLETE — deleg_dffab347]\nA background fan-out unit you dispatched earlier — 2 subagent(s) — has finished;\n台北、台中、高雄…"


def agent(fake, **kw):
    return H.HermesAgent(url="http://hermes", key=fake.key, transport=httpx.MockTransport(fake.handler), poll_s=0.01, **kw)


async def main():
    # 1) 使魔在背景跑 → 等回來 → 叫她繼續 → 交報告
    fake = FakeHermes([
        {"events": [
            {"event": "tool.started", "tool": "delegate_task", "preview": "1 tasks: ?"},
            {"event": "tool.completed", "tool": "delegate_task", "error": True},
            {"event": "tool.started", "tool": "delegate_task", "preview": "2 tasks: 列出三個台灣城市"},
            {"event": "tool.completed", "tool": "delegate_task", "error": False},
            {"event": "message.delta", "delta": "已啟動"},
            {"event": "run.completed", "output": "已啟動子代理，稍候。"}],
         "msgs": [("tool", DISPATCH), ("assistant", "已啟動子代理，稍候。")], "later": [("user", DONE)]},
        {"events": [
            {"event": "tool.started", "tool": "web_search", "preview": "台灣 城市 人口"},
            {"event": "tool.completed", "tool": "web_search", "error": False},
            {"event": "run.completed", "output": "好了。\n<<<REPORT>>>\n# 台灣城市\n## 摘要\n- 台北、台中、高雄\n<<<END>>>"}]},
    ])
    evs, stored = [], {}
    rep = await agent(fake).run({"title": "整理台灣城市", "subBase": 0}, lambda *a: evs.append(a), lambda **k: stored.update(k))
    assert rep.startswith("# 台灣城市") and "<<<" not in rep, rep
    assert stored == {"session": "api_1"}
    assert "整理台灣城市" in fake.inputs[0] and "<<<REPORT>>>" in fake.inputs[0]
    assert fake.inputs[1] == H.CONTINUE_PROMPT, "使魔回來才叫她繼續"
    kinds = [(a, k, s) for a, k, _, s in evs]
    assert ("main", "trouble", "fail") in kinds, "delegate_task 失敗 → 卡住一下"
    assert ("sub:1", "spawn", "") in kinds and ("sub:2", "spawn", "") in kinds
    assert ("sub:1", "done", "ok") in kinds and ("sub:2", "done", "ok") in kinds
    spawn1 = next(t for a, k, t, _ in evs if a == "sub:1" and k == "spawn")
    assert spawn1 == "列出三個台灣城市"
    assert any(k == "tool" and t.startswith("查資料") for a, k, t, _ in evs)
    assert not any(k == "tool" and "?" in t for a, k, t, _ in evs), "preview 是 ? 就不顯示"

    # 2) 退回重做：同一個 session、帶意見、使魔編號接著之前的；舊訊息不重報
    fake.script.append({"events": [{"event": "run.completed", "output": "<<<REPORT>>>\n# 改好了\n<<<END>>>"}]})
    evs2 = []
    a2 = agent(fake)
    rep2 = await a2.run({"title": "整理台灣城市", "session": "api_1", "feedback": "多寫人口", "subBase": 2},
                        lambda *a: evs2.append(a), None)
    assert rep2 == "# 改好了"
    assert "多寫人口" in fake.inputs[2] and "退回" in fake.inputs[2]
    assert not any(a.startswith("sub:") for a, *_ in evs2), "舊的使魔訊息不算新的"
    assert a2.next_sub == 3

    # 3) 沒寫標記 → 催一次 → 還是沒有就拿最後的回答當報告
    fake3 = FakeHermes([
        {"events": [{"event": "run.completed", "output": "台北、台中"}]},
        {"events": [{"event": "message.delta", "delta": "就是台北和台中。"}, {"event": "run.completed", "output": ""}]},
    ])
    rep3 = await agent(fake3).run({"title": "城市", "note": "只要北部"}, lambda *a: None, None)
    assert "使用者的說明：只要北部" in fake3.inputs[0]
    assert fake3.inputs[1] == H.NUDGE_PROMPT and rep3 == "就是台北和台中。", rep3

    # 4) 失敗事件 → 丟錯（書桌會變「出錯停了」）；key 不對 → 說 key 不對
    fake4 = FakeHermes([{"events": [{"event": "run.failed", "error": "boom"}]}])
    try:
        await agent(fake4).run({"title": "x"}, lambda *a: None, None)
        raise AssertionError("應該失敗")
    except RuntimeError as e:
        assert "失敗" in str(e)
    try:
        await H.HermesAgent(url="http://hermes", key="wrong", transport=httpx.MockTransport(FakeHermes([]).handler)).run(
            {"title": "x"}, lambda *a: None, None)
        raise AssertionError("key 不對也能跑")
    except RuntimeError as e:
        assert "HERMES_KEY" in str(e) and "POST /api/sessions" in str(e), str(e)
    ok = await agent(FakeHermes([])).check()
    assert ok["ok"] is False and "404" in ok["error"]          # 假 Hermes 沒有 capabilities → 說出哪裡 404
    f_ok = FakeHermes([]); f_ok.caps = True
    good = await agent(f_ok).check()
    assert good == {"url": "http://hermes", "keyLength": 1, "ok": True, "runs": True, "events": True}, good
    bad = await H.HermesAgent(url="http://hermes", key="wrong", transport=httpx.MockTransport(FakeHermes([]).handler)).check()
    assert bad["ok"] is False and "401" in bad["error"] and bad["keyLength"] == 5 and "wrong" not in str(bad)

    # 5) 做到一半收回（cancel）→ 叫 Hermes 停
    fake5 = FakeHermes([], hang=True)
    t = asyncio.create_task(agent(fake5).run({"title": "x"}, lambda *a: None, None))
    await asyncio.sleep(0.2)
    t.cancel()
    try:
        await t
    except asyncio.CancelledError:
        pass
    assert fake5.stopped == ["/v1/runs/run_1/stop"], fake5.stopped

    # 6) 使魔一直不回來 → 等到上限就先接著做
    fake6 = FakeHermes([
        {"events": [{"event": "run.completed", "output": "派出去了"}], "msgs": [("tool", DISPATCH)]},
        {"events": [{"event": "run.completed", "output": "<<<REPORT>>>ok<<<END>>>"}]},
    ])
    evs6 = []
    rep6 = await agent(fake6, sub_wait_s=0.05).run({"title": "x"}, lambda *a: evs6.append(a), None)
    assert rep6 == "ok" and ("sub:1", "done", "等太久，先不等了", "fail") in evs6

    assert H.extract_report("a <<<REPORT>>> b") == "b" and H.extract_report("none") == ""
    assert H.tool_line("delegate_task", "1 tasks: ?") == "叫使魔"
    assert H.tool_line("delegate_task", "2 tasks: 列出城市") == "叫使魔（2 隻）：列出城市"

    # 6b) Hermes 停下來要核准：查 pending_controls → 問你 → 你說不行 → 送 deny（request_id／execution_generation 照給的）→ 接著跑
    gate = asyncio.Event()
    class Gated(FakeHermes):
        def handler(self, req):
            p, m = req.url.path, req.method
            if m == "GET" and p.endswith("/events"):
                class S(httpx.AsyncByteStream):
                    async def __aiter__(s_):
                        yield b'data: {"event": "approval.request", "seq": 0}\n\n'
                        await gate.wait()
                        yield ('data: ' + json.dumps({"event": "run.completed", "output": "<<<REPORT>>>ok<<<END>>>", "seq": 1}) + "\n\n").encode()
                return httpx.Response(200, stream=S())
            if m == "GET" and p.startswith("/v1/runs/run_"):
                return httpx.Response(200, json={"status": "waiting_for_approval", "pending_controls": [
                    {"prompt_id": "p1", "execution_generation": 3, "type": "approval", "description": "rm -rf ./tmp"}]})
            if m == "POST" and p.endswith("/approval"):
                self.approved = json.loads(req.content)
                gate.set()
                return httpx.Response(200, json={"status": "resolved"})
            return super().handler(req)
    fg = Gated([])
    ag = agent(fg)
    asks = []
    ag.on_ask = asks.append
    task = asyncio.create_task(ag.run({"title": "清暫存"}, lambda *a: None, None))
    for _ in range(200):
        if asks:
            break
        await asyncio.sleep(.01)
    assert asks == [{"kind": "approval", "text": "rm -rf ./tmp", "choices": ["once", "deny"]}], asks
    try:
        await ag.respond("讓我想想")
        raise AssertionError("聽不懂也送")
    except ValueError:
        pass
    assert await ag.respond("不行，別刪") == "deny"
    assert fg.approved == {"request_id": "p1", "execution_generation": 3, "choice": "deny"}, fg.approved
    assert await task == "ok" and ag.pending is None

    # 7) 整條：書桌 put → start（DESK_AGENT=hermes）→ 報告；session 存進 desk_runs；退回重做接著同一個 session
    import os, sqlite3, tempfile
    import desk_agent as D
    os.environ["DESK_AGENT"] = "hermes"
    fake7 = FakeHermes([
        {"events": [{"event": "run.completed", "output": "<<<REPORT>>>\n# 第一版\n<<<END>>>"}]},
        {"events": [{"event": "run.completed", "output": "<<<REPORT>>>\n# 第二版\n<<<END>>>"}]},
    ])
    D.make_agent = lambda: agent(fake7)
    db = Path(tempfile.mkdtemp()) / "d.db"

    def connect():
        c = sqlite3.connect(db); D.init(c); return c

    async def until(want):
        for _ in range(300):
            c = connect(); r = D.current(c) or {}; c.close()
            if r.get("status") == want:
                return r
            await asyncio.sleep(.01)
        raise AssertionError(want)
    c = connect()
    D.put(c, title="整理台灣城市")
    D.start(connect, c)
    r = await until("done")
    assert r["report"] == "# 第一版" and r["session"] == "api_1" and r["agent"] == "hermes"
    D.redo(connect, c, "多寫人口")
    r = await until("done")
    assert r["report"] == "# 第二版" and len(fake7.inputs) == 2 and "多寫人口" in fake7.inputs[1]
    assert any(e["text"] == "接上 Hermes 了。" for e in D.view(c)["events"])
    c.close()
    print("desk_hermes: ok")


asyncio.run(main())
