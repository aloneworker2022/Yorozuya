"""發現獎勵：每天前 10 次 +0～2 金。日界跟網頁 dayNum 同一套（睡眠結束時刻）。"""
import random
from datetime import datetime, timedelta

CAP = 10


def game_day(now_ms, sleep_end="06:00"):
    """JS dayNum：把時間往前挪睡眠結束的分鐘，再取當地日序。"""
    try:
        h, m = str(sleep_end or "06:00").split(":", 1)
        shift = (int(h) * 60 + int(m)) * 60000
    except (TypeError, ValueError):
        shift = 6 * 60 * 60000
    shifted = float(now_ms) - shift
    local = datetime.fromtimestamp(shifted / 1000.0).astimezone()
    off = local.utcoffset() or timedelta(0)
    local_ms = shifted + off.total_seconds() * 1000
    return int(local_ms // 86400000)


def next_bonus(discover, pending_counted, now_ms, sleep_end="06:00", rng=None):
    """回 (gold, counted, day)。counted=1 表示這次佔掉每日名額。"""
    rng = rng or random
    day = game_day(now_ms, sleep_end)
    used = 0
    if isinstance(discover, dict) and discover.get("day") == day:
        try:
            used = int(discover.get("count") or 0)
        except (TypeError, ValueError):
            used = 0
    try:
        pending = int(pending_counted or 0)
    except (TypeError, ValueError):
        pending = 0
    if used + pending >= CAP:
        return 0, 0, day
    return int(rng.randint(0, 2)), 1, day
