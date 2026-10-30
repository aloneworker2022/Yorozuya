"""python tests/pregnancy_test.py — RP5 受孕（接客／外面做愛）、手機收／結束、數字對齊 pregnancy.js。"""
import re
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
sys.path.insert(0, str(Path(__file__).resolve().parent))
import life_agent as la  # noqa: E402
import pregnancy as PG  # noqa: E402
from escort_test import wife_save, store_for  # noqa: E402
from life_agent_test import NOW, Seq  # noqa: E402


def chance_tests():
    assert PG.chance(0, False) == 0.08 and PG.chance(100, True) == 0.15
    js = (Path(__file__).resolve().parents[1] / "web/content/pregnancy.js").read_text(encoding="utf8")
    assert "CHANCE_MIN = 0.08" in js and "CHANCE_MAX = 0.15" in js
    for gid in ("a", "girl-123", "xyz"):
        assert 0 <= PG.cycle_day(gid, NOW) < 28


def escort_conceive_tests():
    data = wife_save(-120)
    store = store_for(data)
    rec = store["girls"]["a"]
    la.start_escort(rec, 120, NOW, Seq(0.0), clients=2)
    la.quick_step(store, rec["agenda"]["until"] + 1000, Seq(0.0))   # 骰子 0 → 一定中
    p = rec["pregnancy"]
    assert p and p["source"] == "escort" and p["role"] == "客人", p
    v = la.view_of(rec)
    assert v["pregnancy"]["key"] == p["key"]
    # 懷著不再受孕
    la._affair(rec, "佐藤健", "physical", 3, NOW + 5, rnd=Seq(0.0))
    assert rec["pregnancy"]["key"] == p["key"]
    # 手機收了（pregPhone）→ 結束（pregEnded）→ RP5 清掉、可以再懷
    data["succubi"][0]["bodyState"] = {"pregnancy": {"key": p["key"], "at": NOW}}
    la.absorb(store, data, NOW + 10, Seq(0.5))
    assert rec["pregPhone"] == p["key"]
    data["succubi"][0]["bodyState"] = {"pregEnded": [p["key"]]}
    la.absorb(store, data, NOW + 20, Seq(0.5))
    assert rec["pregnancy"] is None and rec["pregPhone"] == ""
    la._affair(rec, "佐藤健", "physical", 1, NOW + 30, rnd=Seq(0.0))
    assert rec["pregnancy"]["father"] == "佐藤健"


def miss_tests():
    data = wife_save(-120)
    store = store_for(data)
    rec = store["girls"]["a"]
    la._affair(rec, "佐藤健", "physical", 3, NOW, rnd=Seq(0.99))
    assert not rec.get("pregnancy")


if __name__ == "__main__":
    chance_tests()
    escort_conceive_tests()
    miss_tests()
    print("pregnancy ok")
