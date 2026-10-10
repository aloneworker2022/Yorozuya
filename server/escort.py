"""接客還債（2026-10-10 Al）。RP5 這邊：什麼時候開班、一班幾位客人、每位付多少、收工結算。

負債＝手機存檔 gold < 0（手機是金幣的真相）。RP5 只累計 rec["escortPaid"]（只會變大），
手機用 state.escortTaken[id] 記收過多少、差額才加進 gold（web/content/escort.js collectPaid），所以不會重複還。
RP5 估負債時：gold（存檔裡）＋還沒被手機收走的錢。
只有妻子以上會去；負債 > 50 她在日本時 RP5 自己開班（人在房裡由手機帶她出門，打 world.escortGo 旗）。
數字跟 web/content/escort.js 同一套（tests/escort_test.py 比對）。
"""

from __future__ import annotations

import random

AUTO_DEBT = 50
HOUR_MS = 3600 * 1000
SHIFT_MIN_MS = 2 * HOUR_MS
SHIFT_MAX_MS = 4 * HOUR_MS
CLIENTS_MIN = 1
CLIENTS_MAX = 4
PAY_MIN = 15
PAY_MAX = 40
SHIFTS_PER_DAY = 2
DAY_MS = 24 * HOUR_MS
REST_MS = 4 * HOUR_MS
LIBIDO_PAY = {"N": 0, "R": 2, "S": 4, "SS": 7, "SSR": 10}
HUNGER_RELIEF_PER_CLIENT = 15
LOYALTY_PER_CLIENT = 1
REGULAR_CHANCE = 0.2   # 再碰到同一位常客
WIFE_STAGES = ("wife", "devoted_wife", "obedient_wife", "pathological_wife")
STAGE_RANK = {k: i for i, k in enumerate(WIFE_STAGES)}
PERSONALITY_FAMILY = {"高冷": "冷淡", "傲嬌": "冷淡", "文靜溫柔": "溫柔", "御姊": "溫柔",
                      "活潑開朗": "熱絡", "天然呆": "熱絡", "病嬌": "佔有", "清純反差": "反差"}
FEEL = {"冷淡": "resigned", "溫柔": "wronged", "熱絡": "willing", "佔有": "wronged", "反差": "aroused"}
# 回日本那一刻的心情（RP5 的 7 種）；回到房間時手機再換成房間的情緒餘溫
FEEL_MOOD = {"resigned": ("虛脫", 30), "wronged": ("低落", 34), "willing": ("愉快", 22), "aroused": ("臉紅心跳", 36)}


def is_wife(stage) -> bool:
    return str(stage or "") in WIFE_STAGES


def debt_of(gold) -> int:
    try:
        g = float(gold)
    except (TypeError, ValueError):
        return 0
    return int(round(-g)) if g < 0 else 0


def est_debt(data: dict, store: dict) -> int:
    """存檔金幣＋還沒被手機收走的接客錢 → 現在還欠多少。"""
    try:
        gold = float((data or {}).get("gold") or 0)
    except (TypeError, ValueError):
        gold = 0.0
    taken = (data or {}).get("escortTaken") if isinstance((data or {}).get("escortTaken"), dict) else {}
    for gid, rec in ((store or {}).get("girls") or {}).items():
        paid = int(rec.get("escortPaid") or 0)
        gold += max(0, paid - int(taken.get(gid) or 0))
    return debt_of(gold)


def client_pay(grade: str, fucked: int, r: float) -> int:
    base = PAY_MIN + int(r * 16)
    dev = min(5, int((fucked or 0) // 10))
    return max(PAY_MIN, min(PAY_MAX, base + LIBIDO_PAY.get(str(grade or "R").upper(), 2) + dev))


def limit_ok(rec: dict, now_ms: int) -> bool:
    starts = [int(t) for t in rec.get("escortStarts") or [] if now_ms - int(t) < DAY_MS]
    if len(starts) >= SHIFTS_PER_DAY:
        return False
    end = int(rec.get("escortLastEnd") or 0)
    return not (end and now_ms - end < REST_MS)


# 客人體型（2026-10-10）：用客人 id 決定（FNV-1a 32 位），常客永遠同一個身材。手機 escort.js clientBuild 同一套算法。
CLIENT_BUILDS = ["average", "slim", "muscular", "fat", "tall", "short", "old"]


def fnv(text: str) -> int:
    h = 0x811C9DC5
    for byte in str(text or "").encode("utf-8"):
        h ^= byte
        h = (h * 0x01000193) & 0xFFFFFFFF
    return h


def client_build(cid: str) -> str:
    return CLIENT_BUILDS[fnv(cid) % len(CLIENT_BUILDS)]


# 每位客人一個體位（照客人 id＋班次＋第幾位決定），整位客人不變；15% 中途換一次（在他那段時間的 35～65% 處）。手機 escort.js clientPose 同一套。
PEEK_POSES = ["missionary", "cowgirl", "doggy", "kiss", "reverse"]
SWITCH_PCT = 15


def client_pose(cid: str, seq: int, idx: int) -> dict:
    h = fnv(f"{cid}|{int(seq)}|{int(idx)}|pose")
    i = h % len(PEEK_POSES)
    out = {"pose": PEEK_POSES[i], "pose2": "", "switchAt": 0.0}
    sw = fnv(f"{cid}|{int(seq)}|{int(idx)}|switch")
    if sw % 100 < SWITCH_PCT:
        out["pose2"] = PEEK_POSES[(i + 1 + (sw // 100) % (len(PEEK_POSES) - 1)) % len(PEEK_POSES)]
        out["switchAt"] = round(0.35 + ((sw // 10000) % 31) / 100, 2)
    return out


def family(rec: dict) -> str:
    return PERSONALITY_FAMILY.get(str(rec.get("archetype") or ""), "溫柔")


def plan_shift(rec: dict, debt: int, now_ms: int, rnd=None, clients: int = 0) -> dict:
    """排一班：先擲幾位客人和時長，錢夠還清就提早收工（時長照比例縮，最短 1 小時）。"""
    roll = rnd if rnd is not None else random.random
    n = int(clients) if clients else CLIENTS_MIN + int(float(roll()) * (CLIENTS_MAX - CLIENTS_MIN + 1))
    n = max(CLIENTS_MIN, min(CLIENTS_MAX, n))
    ms = SHIFT_MIN_MS + int(float(roll()) * (SHIFT_MAX_MS - SHIFT_MIN_MS))
    grade = str(rec.get("libido") or "R").upper()
    fucked = int(rec.get("fuckedSeen") or 0)
    pays, total = [], 0
    for _ in range(n):
        if debt > 0 and total >= debt:
            break
        p = client_pay(grade, fucked, float(roll()))
        pays.append(p)
        total += p
    if len(pays) < n:
        ms = max(HOUR_MS, int(ms * len(pays) / n))
    return {"clients": len(pays), "pays": pays, "paid": total, "ms": ms, "debt": int(debt)}


def eligible(rec: dict) -> bool:
    return is_wife(rec.get("stage")) and rec.get("phase") == "japan"


def pick_wife(store: dict) -> dict | None:
    recs = [r for r in (store.get("girls") or {}).values() if is_wife(r.get("stage"))]
    if not recs or any(r.get("phase") == "room" for r in recs):
        return None   # 人在房裡那位由手機帶出門
    if any((r.get("agenda") or {}).get("kind") == "escort" for r in recs):
        return None
    recs = [r for r in recs if r.get("phase") == "japan"]
    recs.sort(key=lambda r: (STAGE_RANK.get(r.get("stage"), 0), float(r.get("loyaltySeen") or 0)), reverse=True)
    return recs[0] if recs else None
