"""懷孕：RP5 這邊只管「受孕」（別人內射陰道才擲；玩家的不算）。後面 10 天、離開／生產／打胎都在手機（web/content/pregnancy.js）。

rec["pregnancy"] = {key, at, father, fatherId, role, source}；手機用 key 收一次（bodyState.pregKeys），
結束後手機記 bodyState.pregEnded，RP5 absorb 看到就清掉，才可以再受孕。數字跟 pregnancy.js 一樣（tests 比對）。
"""

from __future__ import annotations

import random

DAY_MS = 24 * 3600 * 1000
CHANCE_MIN = 0.08
CHANCE_MAX = 0.15


def cycle_day(gid: str, now_ms: int) -> int:
    h = 0
    for c in str(gid or ""):
        h = (h * 31 + ord(c)) & 0xFFFFFFFF
    return int(now_ms // DAY_MS + (h % 28)) % 28


def fertile(gid: str, now_ms: int) -> bool:
    return 11 <= cycle_day(gid, now_ms) <= 16


def chance(hunger: float, is_fertile: bool) -> float:
    p = CHANCE_MIN + (0.05 if is_fertile else 0) + max(0.0, min(100.0, float(hunger or 0))) / 100 * 0.02
    return round(min(CHANCE_MAX, p), 3)


def pregnant(rec: dict) -> bool:
    return bool(rec.get("pregnancy")) or bool(rec.get("pregPhone"))


def roll(rec: dict, gid: str, fathers: list[dict], at: int, hunger: float, source: str, rnd=None) -> dict | None:
    """每一次被內射擲一次（fathers 一位一筆）。中了就記下父親。"""
    if pregnant(rec) or not fathers:
        return None
    r = rnd if rnd is not None else random.random
    p = chance(hunger, fertile(gid, at))
    for f in fathers:
        if float(r()) < p:
            rec["pregSeq"] = int(rec.get("pregSeq") or 0) + 1
            rec["pregnancy"] = {"key": f"r{gid}-{rec['pregSeq']}-{at}", "at": at, "father": f.get("name") or "不知名的男人",
                                "fatherId": f.get("id") or "", "role": f.get("role") or "", "source": source}
            return rec["pregnancy"]
    return None


def absorb_phone(rec: dict, body: dict) -> None:
    """手機的狀態：正在懷（pregPhone）／結束了（pregEnded → 清 RP5 的）。"""
    p = body.get("pregnancy") if isinstance(body.get("pregnancy"), dict) else None
    rec["pregPhone"] = str(p.get("key") or "") if p else ""
    ended = [str(k) for k in body.get("pregEnded") or []]
    cur = rec.get("pregnancy") if isinstance(rec.get("pregnancy"), dict) else None
    if cur and cur.get("key") in ended:
        rec["pregnancy"] = None
