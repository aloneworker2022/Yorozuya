"""python tests/summon_queue_test.py"""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "server"))
import summon_queue  # noqa: E402


def main():
    assert summon_queue.tenths(0, 0) == 0
    assert summon_queue.tenths(0, 46) == 0
    assert summon_queue.tenths(1, 10) == 1
    assert summon_queue.tenths(9, 10) == 9
    assert summon_queue.tenths(10, 10) == 10
    assert summon_queue.tenths(99, 100) == 9
    assert summon_queue.tenths(5, 10) == 5

    mid = summon_queue.summarize([
        {"status": "done"},
        {"status": "pending"},
        {"status": "error"},
        {"status": "running"},
    ])
    assert mid["total"] == 4 and mid["done"] == 2 and mid["failed"] == 1
    assert mid["finished"] is False and mid["filled"] == 5 and mid["squares"] == 10

    done = summon_queue.summarize([{"status": "done"}, {"status": "error"}])
    assert done["finished"] is True and done["filled"] == 10

    empty = summon_queue.summarize([])
    assert empty["finished"] is True and empty["filled"] == 0

    merged = summon_queue.merge_task(
        {"key": "a", "slot": {"kind": "half"}, "status": "pending"},
        ("done", "/assets/portraits/x_half.png", None),
    )
    assert merged["status"] == "done" and merged["result"].endswith("_half.png")
    assert summon_queue.public_item(merged)["slot"]["kind"] == "half"

    print("ok - summon queue")


if __name__ == "__main__":
    main()
