"""python tests/discover_bonus_test.py"""
import random
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import discover_bonus  # noqa: E402


def main():
    now = 1_759_000_000_000  # 固定時間，只對自己比
    day = discover_bonus.game_day(now, "06:00")
    assert day == discover_bonus.game_day(now, "06:00")
    assert discover_bonus.game_day(now, "bad") == discover_bonus.game_day(now, "06:00")

    rng = random.Random(1)
    gold, counted, d = discover_bonus.next_bonus(None, 0, now, "06:00", rng)
    assert counted == 1 and d == day and 0 <= gold <= 2

    gold, counted, d = discover_bonus.next_bonus({"day": day, "count": 10}, 0, now, "06:00", rng)
    assert gold == 0 and counted == 0 and d == day

    gold, counted, d = discover_bonus.next_bonus({"day": day, "count": 9}, 1, now, "06:00", rng)
    assert gold == 0 and counted == 0

    gold, counted, d = discover_bonus.next_bonus({"day": day - 1, "count": 10}, 0, now, "06:00", rng)
    assert counted == 1 and 0 <= gold <= 2

    print("ok - discover bonus")


if __name__ == "__main__":
    main()
