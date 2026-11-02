"""她桌上的工作 → RP5 上的 Hermes Agent（API server，Runs API）。

設定（遊戲伺服器的環境變數）：
  DESK_AGENT=hermes
  HERMES_URL=http://127.0.0.1:8642      （預設就是這個；Hermes 跟遊戲伺服器同一台）
  HERMES_KEY=<~/.hermes/.env 的 API_SERVER_KEY>
  DESK_HERMES_SUB_WAIT_S=1800           （等使魔回來最多幾秒）
  DESK_HERMES_TURN_S=1800               （一輪最多幾秒）

流程（2026-11-01 在 RP5 v0.22.2+3291 實測）：
  1. 每件委託開一個 Hermes session（POST /api/sessions → session.id），記在 desk_runs.agent_session，退回重做接著用。
  2. POST /v1/runs {input, session_id} → 讀 GET /v1/runs/{id}/events（SSE：tool.started／tool.completed／
     message.delta／message.interim／approval.request／run.completed…）。
  3. subagent（delegate_task）在背景跑：session 裡多一則 tool 訊息 {"status":"dispatched","delegation_id",…,"goals"}；
     做完多一則 user 訊息「[ASYNC DELEGATION BATCH COMPLETE — deleg_…]」。API server 不會自己接著做（下一輪由呼叫端決定），
     所以這裡盯著 session，等使魔都回來就再送一輪「結果回來了，繼續」。
  4. 她把報告放在 <<<REPORT>>> … <<<END>>> 之間才算交差；沒標記就再催一次，還是沒有就把最後的回答當報告。

事件轉成書桌的格式（desk_agent.py）：main＝她、sub:n＝使魔。
"""
from __future__ import annotations

import asyncio
import json
import os
import re
from typing import Callable

REPORT_RE = re.compile(r"<<<REPORT>>>(.*?)(?:<<<END>>>|$)", re.S)
DELEG_ID_RE = re.compile(r"deleg_[A-Za-z0-9]+")
BATCH_DONE = "[ASYNC DELEGATION BATCH"
MAX_TURNS = 8

TOOL_ZH = {
    "delegate_task": "叫使魔", "web_search": "查資料", "web_extract": "讀網頁", "web_fetch": "讀網頁",
    "terminal": "跑指令", "read_file": "讀檔案", "write_file": "寫檔案", "patch": "改檔案", "search_files": "找檔案",
    "memory": "記一下", "skill_view": "看技能", "skills_list": "看技能", "todo": "列待辦", "vision_analyze": "看圖",
    "execute_code": "跑程式", "session_search": "翻以前的紀錄",
}


def tool_zh(name: str) -> str:
    n = str(name or "")
    if n.startswith("browser_"):
        return "用瀏覽器"
    return TOOL_ZH.get(n, n or "工具")


def tool_line(name: str, preview: str) -> str:
    """工具開始 → 日誌一行。delegate_task 的 preview 長這樣：「2 tasks: 列出三個台灣城市」（參數沒填好時是「?」）。"""
    pv = " ".join(str(preview or "").split())
    if name == "delegate_task":
        m = re.match(r"(\d+)\s*tasks?:\s*(.*)", pv)
        n, goal = (int(m.group(1)), m.group(2).strip()) if m else (0, pv)
        head = f"叫使魔（{n} 隻）" if n > 1 else "叫使魔"
        return f"{head}：{clip(goal, 100)}" if goal and goal != "?" else head
    return f"{tool_zh(name)}：{clip(pv, 100)}" if pv and pv != "?" else tool_zh(name)


def first_prompt(run: dict) -> str:
    t = run["title"]
    return "\n".join([
        f"幫使用者處理一件現實生活中的委託：「{t}」。",
        *([f"使用者的說明：{run['note']}"] if run.get("note") else []),
        "",
        "做法：",
        "- 可以分開做的部分，可以用 delegate_task 交給 subagent；它們在背景跑，結果回來時我會再叫你繼續。",
        "- 以查資料、整理、寫東西為主；不要刪改使用者電腦上的檔案，不要執行有風險的指令。",
        "- 資訊不夠就合理假設，並在報告裡列出你的假設。",
        "",
        "全部做完時，把成果寫成一份報告（繁體中文 markdown），包含：",
        "## 摘要、## 做了什麼、## 成果、## 還要你確認",
        "報告整份放在 <<<REPORT>>> 和 <<<END>>> 兩個標記之間。還沒做完就不要寫這兩個標記。",
    ])


CONTINUE_PROMPT = "使魔（subagent）的結果都回來了（在上面）。接著把委託做完；全部做完就交報告，放在 <<<REPORT>>> 和 <<<END>>> 之間。"
NUDGE_PROMPT = "請把目前的成果整理成最終報告（繁體中文 markdown：摘要、做了什麼、成果、還要你確認），放在 <<<REPORT>>> 和 <<<END>>> 之間。"
RESUME_PROMPT = "剛才中斷了（伺服器重開）。看一下上面做到哪，接著把委託做完；全部做完就交報告，放在 <<<REPORT>>> 和 <<<END>>> 之間。"


def redo_prompt(feedback: str) -> str:
    return (f"使用者看了報告，退回來要你修改：{feedback}\n"
            "照這個意見改，改完交一份新的完整報告，放在 <<<REPORT>>> 和 <<<END>>> 之間。")


def extract_report(text: str) -> str:
    m = REPORT_RE.search(str(text or ""))
    return m.group(1).strip() if m else ""


def clip(text: str, n: int = 160) -> str:
    t = " ".join(str(text or "").split())
    return t if len(t) <= n else t[: n - 1] + "…"


def _items(payload) -> list:
    if isinstance(payload, list):
        return payload
    if isinstance(payload, dict):
        for k in ("messages", "data", "items"):
            if isinstance(payload.get(k), list):
                return payload[k]
    return []


class HermesAgent:
    """Hermes 跑一件委託。transport：測試用（httpx.MockTransport）。"""

    def __init__(self, url: str | None = None, key: str | None = None, transport=None,
                 sub_wait_s: float | None = None, turn_s: float | None = None, poll_s: float = 10.0):
        self.url = (url or os.environ.get("HERMES_URL") or "http://127.0.0.1:8642").rstrip("/")
        self.key = key if key is not None else (os.environ.get("HERMES_KEY") or "")
        self.transport = transport
        self.sub_wait_s = float(sub_wait_s if sub_wait_s is not None else os.environ.get("DESK_HERMES_SUB_WAIT_S") or 1800)
        self.turn_s = float(turn_s if turn_s is not None else os.environ.get("DESK_HERMES_TURN_S") or 1800)
        self.poll_s = poll_s
        self.subs: dict[str, dict] = {}      # delegation_id → {ns:[n…], done:bool}
        self.seen_msg = 0
        self.next_sub = 1
        self.live_run = ""
        self.on_ask = None          # desk_agent.drive 設：on_ask(dict|None)
        self.pending: dict | None = None   # 停下來等你決定的那件（approval／clarify）

    # ───────── HTTP
    def _client(self):
        import httpx
        headers = {"Authorization": f"Bearer {self.key}", "Content-Type": "application/json"}
        return httpx.AsyncClient(base_url=self.url, headers=headers, transport=self.transport,
                                 timeout=httpx.Timeout(60.0, read=None))

    async def _json(self, c, method: str, path: str, body=None):
        r = await c.request(method, path, json=body)
        if r.status_code == 401:
            raise RuntimeError(f"Hermes 拒絕（{method} {path} → 401）：HERMES_KEY 跟 Hermes 的 API_SERVER_KEY 不一樣，"
                               "或改過 key 之後遊戲伺服器／Hermes gateway 還沒重開")
        if r.status_code >= 400:
            raise RuntimeError(f"Hermes {method} {path} → {r.status_code}：{clip(r.text, 160)}")
        return r.json() if r.content else {}

    async def check(self) -> dict:
        """遊戲伺服器現在連得上 Hermes 嗎（GET /api/desk/agent-check）。不回 key，只回長度。"""
        out = {"url": self.url, "keyLength": len(self.key)}
        if not self.key:
            return {**out, "ok": False, "error": "沒設定 HERMES_KEY"}
        try:
            async with self._client() as c:
                cap = await self._json(c, "GET", "/v1/capabilities")
            feats = cap.get("features") or {}
            return {**out, "ok": True, "runs": bool(feats.get("run_submission")), "events": bool(feats.get("run_events_sse"))}
        except Exception as e:
            return {**out, "ok": False, "error": str(e) or type(e).__name__}

    # ───────── 主流程
    async def run(self, run: dict, emit: Callable, store: Callable | None = None) -> str:
        if not self.key:
            raise RuntimeError("沒設定 HERMES_KEY（遊戲伺服器的環境變數）")
        self.next_sub = int(run.get("subBase") or 0) + 1
        async with self._client() as c:
            sid = run.get("session") or ""
            fresh = not sid
            if fresh:
                s = await self._json(c, "POST", "/api/sessions", {})
                sid = (s.get("session") or {}).get("id") or s.get("id") or s.get("session_id") or ""
                if not sid:
                    raise RuntimeError("Hermes 沒給 session id")
                if store:
                    store(session=sid)
                emit("main", "status", "接上 Hermes 了。", "")
            else:
                await self._scan(c, sid, emit, quiet=True)   # 舊訊息不算新事件
            fb = run.get("feedback") or ""
            if run.get("resume"):
                prompt = RESUME_PROMPT
            elif fb and not fresh:
                prompt = redo_prompt(fb)
            else:
                prompt = first_prompt(run) + (f"\n\n使用者的意見：{fb}" if fb else "")
            nudged = False
            for _ in range(MAX_TURNS):
                output = await self._turn(c, sid, prompt, emit)
                await self._scan(c, sid, emit)
                if self._waiting():
                    emit("main", "think", "等使魔把結果帶回來…", "")
                    await self._wait_subs(c, sid, emit)
                    prompt = CONTINUE_PROMPT
                    continue
                report = extract_report(output)
                if report:
                    return report
                if nudged:
                    return str(output or "").strip() or "（她沒有寫出報告）"
                nudged = True
                emit("main", "think", "把成果整理成報告。", "")
                prompt = NUDGE_PROMPT
            raise RuntimeError("來回太多次還沒交報告")

    def _waiting(self) -> bool:
        return any(not d["done"] for d in self.subs.values())

    async def _wait_subs(self, c, sid: str, emit) -> None:
        waited = 0.0
        while self._waiting():
            if waited >= self.sub_wait_s:
                for d in self.subs.values():
                    if not d["done"]:
                        d["done"] = True
                        for n in d["ns"]:
                            emit(f"sub:{n}", "done", "等太久，先不等了", "fail")
                emit("main", "trouble", "有使魔太久沒回來，先用手上的東西接著做。", "fail")
                return
            await asyncio.sleep(self.poll_s)
            waited += self.poll_s
            await self._scan(c, sid, emit)

    async def _turn(self, c, sid: str, prompt: str, emit) -> str:
        r = await self._json(c, "POST", "/v1/runs", {"input": prompt, "session_id": sid})
        rid = r.get("run_id") or ""
        if not rid:
            raise RuntimeError(f"Hermes 沒開成：{clip(json.dumps(r, ensure_ascii=False), 120)}")
        self.live_run = rid
        try:
            return await asyncio.wait_for(self._stream(c, rid, emit), timeout=self.turn_s)
        except asyncio.TimeoutError:
            await self.stop(c)
            raise RuntimeError("這一輪跑太久，停下來了")
        except asyncio.CancelledError:
            try:
                await asyncio.shield(self.stop(c))
            except Exception:
                pass
            raise
        finally:
            self.live_run = ""

    async def stop(self, c=None) -> None:
        rid = self.live_run
        if not rid:
            return
        if c is None:
            async with self._client() as cc:
                await cc.post(f"/v1/runs/{rid}/stop")
        else:
            await c.post(f"/v1/runs/{rid}/stop")

    async def _stream(self, c, rid: str, emit) -> str:
        text, output, ended = [], None, None
        async with c.stream("GET", f"/v1/runs/{rid}/events") as resp:
            resp.raise_for_status()
            async for line in resp.aiter_lines():
                if not line.startswith("data:"):
                    continue
                try:
                    e = json.loads(line[5:].strip())
                except ValueError:
                    continue
                ev = e.get("event") or ""
                if ev == "message.delta":
                    text.append(str(e.get("delta") or ""))
                elif ev == "message.interim":
                    if e.get("text"):
                        emit("main", "think", clip(e["text"]), "")
                elif ev == "tool.started":
                    name = e.get("tool") or ""
                    emit("main", "tool", tool_line(name, e.get("preview") or ""), "run")
                elif ev == "tool.completed":
                    name = e.get("tool") or ""
                    if e.get("error"):
                        emit("main", "trouble", f"{tool_zh(name)}沒成功，再試一次。", "fail")
                    else:
                        emit("main", "tool", f"{tool_zh(name)}好了。", "ok")
                elif ev in ("approval.request", "clarify.request"):
                    await self._ask(c, rid, e)
                elif ev == "run.completed":
                    output, ended = e.get("output"), "completed"
                    break
                elif ev in ("run.failed", "run.cancelled", "run.interrupted"):
                    ended = ev
                    break
        if ended is None:   # 串流關了但沒有結尾事件 → 問一下狀態
            st = await self._json(c, "GET", f"/v1/runs/{rid}")
            status = st.get("status") or ""
            if status == "completed":
                output, ended = st.get("output"), "completed"
            else:
                ended = f"run.{status or 'unknown'}"
        if ended != "completed":
            raise RuntimeError({"run.failed": "Hermes 這一輪失敗了", "run.cancelled": "Hermes 這一輪被取消了",
                                "run.interrupted": "Hermes 這一輪被打斷了"}.get(ended, f"Hermes 這一輪沒做完（{ended}）"))
        return output if isinstance(output, str) and output else "".join(text)

    # ───────── 停下來問你（approval／clarify）
    async def _ask(self, c, rid: str, e: dict) -> None:
        """Hermes 停下來等決定：從事件和 GET /v1/runs/{id} 的 pending_controls 湊出要回答的那件。
        文件（2026-11）只寫了回答要 request_id（＝prompt_id）＋execution_generation；欄位名稱寬鬆地找。"""
        kind = "clarify" if str(e.get("event", "")).startswith("clarify") else "approval"
        ctl: dict = {}
        try:
            st = await self._json(c, "GET", f"/v1/runs/{rid}")
        except Exception:
            st = {}
        pend = st.get("pending_controls") or []
        if isinstance(pend, dict):
            pend = pend.get("items") or pend.get("controls") or ([pend] if pend else [])
        for p in pend if isinstance(pend, list) else []:
            if isinstance(p, dict):
                ctl = p
                if "clarif" in str(p.get("type") or p.get("kind") or "").lower():
                    kind = "clarify"
                break
        pick = lambda *ks: next((src.get(k) for src in (e, ctl) for k in ks if src.get(k) not in (None, "")), None)  # noqa: E731
        text = pick("question", "description", "command", "preview", "prompt", "message", "summary", "title", "text") or ""
        self.pending = {
            "kind": kind,
            "id": pick("request_id", "prompt_id", "id"),
            "gen": pick("execution_generation", "generation") if pick("execution_generation", "generation") is not None
            else st.get("execution_generation"),
            "run": rid,
            "text": clip(text, 300),
            "choices": pick("choices", "options") or (["once", "deny"] if kind == "approval" else None),
        }
        if self.on_ask:
            self.on_ask({k: v for k, v in self.pending.items() if k in ("kind", "text", "choices")})

    async def respond(self, text: str) -> str:
        """你的回答 → Hermes。核准：可以＝once、不行＝deny；提問：原話。回傳 once／deny／answer。"""
        ask = self.pending
        if not ask:
            raise ValueError("現在沒有在等你回答")
        if ask["kind"] == "clarify":
            path, body, res = "clarify", {"answer": str(text)}, "answer"
        else:
            from desk_agent import approval_choice
            choice = approval_choice(text)
            if choice is None:
                raise ValueError("聽不出可不可以，說「可以」或「不行」")
            path, body, res = "approval", {"choice": choice}, choice
        body = {"request_id": ask["id"], "execution_generation": ask["gen"], **body}
        async with self._client() as c:
            r = await c.post(f"/v1/runs/{ask['run']}/{path}", json=body)
        if r.status_code >= 400:
            if r.status_code == 409:
                self.pending = None
            raise ValueError(f"Hermes 沒收下回答（{r.status_code}）：{clip(r.text, 120)}")
        self.pending = None
        return res

    async def _scan(self, c, sid: str, emit, quiet: bool = False) -> None:
        """看 session 裡新的訊息：使魔出發（dispatched）、使魔回來（BATCH COMPLETE）。"""
        msgs = _items(await self._json(c, "GET", f"/api/sessions/{sid}/messages"))
        for m in msgs:
            mid = m.get("id") or 0
            if not isinstance(mid, int) or mid <= self.seen_msg:
                continue
            self.seen_msg = mid
            if quiet:
                continue
            role, content = m.get("role"), m.get("content")
            if role == "tool" and isinstance(content, str) and '"dispatched"' in content:
                try:
                    d = json.loads(content)
                except ValueError:
                    continue
                did = d.get("delegation_id") or ""
                if d.get("status") != "dispatched" or not did or did in self.subs:
                    continue
                goals = [str(g) for g in (d.get("goals") or [])] or ["（沒寫目標）"]
                ns = []
                for g in goals:
                    n, self.next_sub = self.next_sub, self.next_sub + 1
                    ns.append(n)
                    emit(f"sub:{n}", "spawn", clip(g, 120), "")
                self.subs[did] = {"ns": ns, "done": False}
            elif role == "user" and isinstance(content, str) and content.startswith(BATCH_DONE):
                ids = DELEG_ID_RE.findall(content.split("\n", 1)[0])
                bad = "INTERRUPT" in content[:80].upper() or "FAIL" in content[:80].upper()
                for did in ids:
                    d = self.subs.get(did)
                    if not d or d["done"]:
                        continue
                    d["done"] = True
                    for n in d["ns"]:
                        emit(f"sub:{n}", "done", "沒做完就停了" if bad else "結果交回來了", "fail" if bad else "ok")
