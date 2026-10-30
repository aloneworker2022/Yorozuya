"""召喚預產清單。

手機把整份生圖單一次交過來，RP5 放進既有的 gen_tasks 逐張跑。
手機關機、網頁關掉，佇列仍繼續。進度固定折成 10 格。
"""


def tenths(done: int, total: int) -> int:
    """做完幾張，折成 10 格。沒全部做完之前最多 9，避免看起來已經結束。"""
    done_n = max(0, int(done or 0))
    total_n = max(0, int(total or 0))
    if total_n <= 0:
        return 0
    if done_n >= total_n:
        return 10
    return min(9, (done_n * 10) // total_n)


def summarize(items) -> dict:
    rows = list(items or [])
    total = len(rows)
    finished_n = 0
    failed = 0
    for it in rows:
        status = str((it or {}).get("status") or "")
        if status in ("done", "error"):
            finished_n += 1
        if status == "error":
            failed += 1
    finished = total == 0 or finished_n >= total
    return {
        "total": total,
        "done": finished_n,
        "failed": failed,
        "finished": finished,
        "filled": 10 if finished and total else tenths(finished_n, total),
        "squares": 10,
    }


def merge_task(item: dict, task) -> dict:
    """用 gen_tasks 的一列更新清單項目。task = (status, result, error) 或 None。"""
    out = dict(item or {})
    if not task:
        out.setdefault("status", "pending")
        return out
    status, result, error = task
    out["status"] = status or out.get("status") or "pending"
    if result:
        out["result"] = result
    if error:
        out["error"] = error
    return out


def public_item(item: dict) -> dict:
    src = item or {}
    return {
        "key": src.get("key") or "",
        "slot": src.get("slot") if isinstance(src.get("slot"), dict) else {},
        "status": src.get("status") or "pending",
        "result": src.get("result") or "",
        "error": src.get("error") or "",
    }
